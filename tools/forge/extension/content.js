// StudioForge Flow Bridge - Content Script
// labs.google/flow 페이지에서 자동화 수행

// ============================================================
// 중복 주입 방지 가드.
// manifest content_scripts 자동 주입과 background.js 의 executeScript 가
// 드물게 경쟁하면 같은 탭에서 이 파일이 두 번 실행되어 아래 const 선언들이
// "SyntaxError: Identifier 'SLEEP' has already been declared" 로 파일 전체를
// 깨뜨린다. 그 타이밍에 걸린 RUN_FLOW_JOB 메시지는 조용히 유실된다.
// var 는 재선언이 허용되므로 파싱 단계에서 에러를 내지 않고, 플래그를 보고
// runtime 단계에서 throw 해 const 재선언 실행 자체를 차단.
// ============================================================
var __SF_FLOW_BRIDGE_CONTENT_LOADED__;
if (__SF_FLOW_BRIDGE_CONTENT_LOADED__) {
  // 한 줄 경고만 남기고 이후 모든 선언 실행 차단. 기존 핸들러/상태는 그대로 살아있음.
  throw new Error("[StudioForge Flow Bridge] content script already loaded — duplicate injection aborted");
}
__SF_FLOW_BRIDGE_CONTENT_LOADED__ = true;

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 네트워크 기반 결과 캡처 (injected.js 인터셉터와 연동)
// - 입력 직후 prompt별로 pending 등록 → 응답 도착 시 batchId/prompt로 매칭
// - DOM 카드 감시 없이도 fifeUrl을 직접 받아서 반환
// ============================================================
const SF_NET = {
  // batchId -> { prompts: string[], at: number }
  reqByBatch: new Map(),
  // 미매칭 응답 임시 보관 (request emit이 늦게 올 때 대비)
  pendingResponses: [], // { batchId, items, at }
  // 대기 중인 잡 큐 (입력 순서 = FIFO)
  waiters: [], // { prompt, normPrompt, createdAt, resolve, reject, timer }
  // Flow 응답에서 본 모든 이미지의 asset key → 정규화 prompt.
  // attachStyleImageToFlow 가 dialog 내부 img 의 key 로 prompt 를 역조회해
  // 같은 prompt 로 만든 카드를 클릭, 재업로드를 회피하기 위해 사용.
  assetKeyToPrompt: new Map(),
  // 이미지 잡이 성공한 scene_id → 그 잡의 정규화 prompt.
  // 후속 동영상 잡이 같은 scene_id 로 들어오면 이 prompt 로 에셋 매칭한다.
  sceneIdToImagePrompt: new Map(),
  // 이미지 잡이 성공한 scene_id → 그 이미지의 Flow asset key.
  // 이미지를 인터셉트해 장면 창에 넣는 그 시점에 캡처한 fifeUrl 의 key 를
  // 저장 → 후속 동영상 잡이 캔버스에서 정확히 같은 이미지를 key 로 찾는다.
  // chrome.storage.local 에도 영속화되어 확장 reload/새 탭에서도 복원된다.
  sceneIdToFlowKey: new Map(),
  // 제출 응답에서 받은 operation/식별자 목록. 아직 어느 잡에도 귀속되지 않은 것들.
  // { kind: 'image'|'video', opKeys: string[], idKeys: string[], normPrompts: string[], at: number }
  // 동영상은 예전부터 이 경로였고, 이미지도 신 Flow(batchexecute)가 완성 응답의
  // 프롬프트를 번역해 돌려주는 경우(한국어 프롬프트 실측)가 있어 같은 경로를 쓴다.
  videoSubmits: [],
};

// scene_id → Flow asset key 영속화 (chrome.storage.local).
// 확장 reload / 페이지 새로고침 후에도 매칭이 동작하도록 메모리 캐시를 보강한다.
const SF_FLOWKEY_STORE = "sfSceneFlowKeys";
async function sfPersistSceneFlowKey(sceneId, key) {
  if (!sceneId || !key) return;
  try {
    const got = await chrome.storage.local.get(SF_FLOWKEY_STORE);
    const map = got?.[SF_FLOWKEY_STORE] || {};
    map[sceneId] = key;
    await chrome.storage.local.set({ [SF_FLOWKEY_STORE]: map });
  } catch (e) {
    console.warn("[Flow Bridge] FlowKey 저장 실패:", e?.message || e);
  }
}
async function sfLoadSceneFlowKey(sceneId) {
  if (!sceneId) return "";
  const mem = SF_NET.sceneIdToFlowKey.get(sceneId);
  if (mem) return mem;
  try {
    const got = await chrome.storage.local.get(SF_FLOWKEY_STORE);
    const key = got?.[SF_FLOWKEY_STORE]?.[sceneId] || "";
    if (key) SF_NET.sceneIdToFlowKey.set(sceneId, key);
    return key;
  } catch (e) {
    console.warn("[Flow Bridge] FlowKey 로드 실패:", e?.message || e);
    return "";
  }
}

// 매칭 실패 진단 로그를 URL 당 한 번만 남기기 위한 기록. 상태 폴링이 같은 완성
// 영상을 몇 초마다 반복해 보내므로, 안 그러면 콘솔이 같은 줄로 뒤덮인다.
const SF_DIAG_LOGGED_URLS = new Set();

// 제출 응답에서 본 식별자 → 그 값을 담고 있던 제출의 수.
// 프로젝트 ID·세션 ID 처럼 두 건 이상의 제출에 함께 나오는 값은 "이 잡"을 가리키지
// 못한다. 그런 값으로 매칭하면 완성 순서대로 배분되는 옛 버그가 되살아나므로,
// 두 번째로 보이는 순간 공유 식별자로 확정하고 이미 나눠 준 것까지 회수한다.
const SF_SUBMIT_ID_OWNERS = new Map(); // idKey → 등장한 제출 수
const SF_SHARED_ID_KEYS = new Set();

function sfRegisterSubmitIdKeys(idKeys) {
  const own = [];
  for (const k of idKeys) {
    const seen = (SF_SUBMIT_ID_OWNERS.get(k) || 0) + 1;
    SF_SUBMIT_ID_OWNERS.set(k, seen);
    if (seen > 1) {
      if (!SF_SHARED_ID_KEYS.has(k)) {
        SF_SHARED_ID_KEYS.add(k);
        // 앞선 잡에 이미 붙여 둔 같은 값도 무효 — 그대로 두면 그 잡이 남의 영상을 가져간다.
        for (const w of SF_NET.waiters) w.linkKeys?.delete(k);
      }
      continue;
    }
    own.push(k);
  }
  // 맵이 무한히 자라지 않게 오래된 것부터 정리 (삽입 순서 = 오래된 순서).
  while (SF_SUBMIT_ID_OWNERS.size > 2000) {
    SF_SUBMIT_ID_OWNERS.delete(SF_SUBMIT_ID_OWNERS.keys().next().value);
  }
  return own;
}

function sfNormalize(s) {
  return String(s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // \uD65C\uC790 \uBCC0\uD615 \uD1B5\uC77C \u2014 Flow \uAC00 \uD504\uB86C\uD504\uD2B8\uB97C \uAC70\uC758 \uADF8\uB300\uB85C \uB3CC\uB824\uC8FC\uBA74\uC11C\uB3C4 \uB465\uADFC\uB530\uC634\uD45C,
    // \uAE34 \uB300\uC2DC, \uB9D0\uC904\uC784\uD45C \uAC19\uC740 \uBB38\uC790\uB97C \uBC14\uAFD4\uCE58\uAE30\uD558\uB294 \uACBD\uC6B0\uAC00 \uC788\uB2E4 (\uC2E4\uCE21: \uC55E 60\uC790
    // \uB3D9\uC77C\uD55C\uB370 500\uC790 \uBE44\uAD50 \uC2E4\uD328). \uB208\uC5D0 \uAC19\uC544 \uBCF4\uC774\uB294 \uBB38\uC790\uB294 \uAC19\uAC8C \uCDE8\uAE09\uD55C\uB2E4.
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    // \uC6F9\uC571\uC758 \uB4F1\uB85D \uC2DC\uC810 \uC704\uC0DD \uCC98\uB9AC(flowPromptSanitize)\uC640 \uAC19\uC740 \uBC94\uC704 \u2014 \uC704\uC0DD \uCC98\uB9AC
    // \uC774\uC804\uC5D0 \uB4F1\uB85D\uB41C \uC61B \uC7A1\uC758 \uD504\uB86C\uD504\uD2B8\uC5D0 \uB0A8\uC740 \uC6D0\uBB38\uC790\u00B7\uC774\uBAA8\uC9C0\u00B7\uAD18\uC120\uB3C4, Flow \uAC00 \uBE7C\uACE0
    // \uB3CC\uB824\uC904 \uB54C \uC591\uCABD \uB2E4 \uC9C0\uC6CC\uC838 \uAC19\uC544\uC9C0\uB3C4\uB85D \uC5EC\uAE30\uC11C\uB3C4 \uC815\uB9AC\uD55C\uB2E4.
    .replace(/[\u2460-\u2473]/g, (ch) => `${ch.charCodeAt(0) - 0x2460 + 1})`)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
    .replace(/[\u2500-\u257F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// \uB9E4\uCE6D\uC6A9 \uD504\uB86C\uD504\uD2B8 \uD0A4: \uC815\uADDC\uD654 \uD6C4 \uC55E 500\uC790 (\uC0AC\uC6A9\uC790 \uC9C0\uC2DC).
// \uC804\uCCB4 \uC644\uC804\uC77C\uCE58\uB294 Flow \uAC00 \uAF2C\uB9AC(\uC804\uC5ED \uD504\uB86C\uD504\uD2B8 \uB4F1)\uB97C \uC870\uAE08\uB9CC \uBC14\uAFB8\uAC70\uB098 \uC798\uB77C \uB3CC\uB824\uC918\uB3C4
// \uAE68\uC9C4\uB2E4. \uC7A1 \uD504\uB86C\uD504\uD2B8\uB294 \uC7A5\uBA74 \uACE0\uC720 \uB0B4\uC6A9\uC774 \uB9E8 \uC55E, \uC804\uC5ED(\uACF5\uD1B5) \uD504\uB86C\uD504\uD2B8\uAC00 \uB9E8 \uB4A4\uC5D0
// \uBD99\uB294 \uAD6C\uC870\uB77C \uC55E 500\uC790\uB294 \uC7A5\uBA74\uB9C8\uB2E4 \uB2E4\uB974\uACE0 \uAF2C\uB9AC \uBCC0\uD615\uC5D0\uB294 \uB454\uAC10\uD558\uB2E4. \uC591\uCABD \uB2E4 500\uC790\uB97C
// \uB118\uC744 \uB54C\uB9CC \uC798\uB9AC\uBBC0\uB85C \uC9E7\uC740 \uD504\uB86C\uD504\uD2B8\uB07C\uB9AC\uB294 \uC5EC\uC804\uD788 \uC804\uCCB4 \uC644\uC804\uC77C\uCE58\uB2E4.
// \uB450 \uC7A5\uBA74\uC758 \uD504\uB86C\uD504\uD2B8\uAC00 \uC55E 500\uC790\uAE4C\uC9C0 \uAC19\uC73C\uBA74 \uCDA9\uB3CC\uD558\uC9C0\uB9CC, \uADF8 \uACBD\uC6B0\uB294 \uC804\uCCB4 \uC644\uC804\uC77C\uCE58
// \uC2DC\uC808\uC5D0\uB3C4 (\uC644\uC804\uD788 \uAC19\uC740 \uD504\uB86C\uD504\uD2B8\uB85C) \uCDA9\uB3CC\uD558\uB358 \uC0C1\uD669\uACFC \uC0AC\uC2E4\uC0C1 \uAC19\uB2E4.
const SF_PROMPT_MATCH_PREFIX = 500;
function sfPromptKey(s) {
  return sfNormalize(s).slice(0, SF_PROMPT_MATCH_PREFIX);
}

// operation 이름 정규화. injected.js 의 sfOpKey 와 규칙이 같아야 한다 —
// 제출 응답("operations/abc")과 완성 폴링("abc")의 접두사 차이를 흡수한다.
function sfOpKey(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.split("/").filter(Boolean).pop().toLowerCase();
}

/**
 * 제출 응답의 operation/식별자를 대기 중인 잡(waiter)에 귀속시킨다.
 *
 * 동영상은 완성 응답에 프롬프트가 실려 있지 않고, 이미지도 신 Flow 는 완성
 * 응답의 프롬프트를 영어로 번역해 돌려주는 경우가 있어(한국어 프롬프트 실측)
 * 프롬프트 문자열만으로는 "어느 장면 것인지"를 알 수 없다. 그래서 제출 시점에
 * operation/식별자를 잡에 못 박아 두고, 완성 폴링은 그 값으로 되돌린다 —
 * 완성 순서와 무관하다.
 *
 * 귀속 기준 (순서대로):
 *   1) 제출 요청의 프롬프트와 완전히 같은 waiter — 가장 확실
 *   2) 이 제출보다 먼저 등록된 waiter 중 가장 최근 것. 제출 구간은 FIFO 락으로
 *      직렬화돼 있으므로 "제출 직전에 등록된 잡"이 이 제출의 주인이다.
 */
function sfClaimMediaSubmits() {
  const remaining = [];
  for (const sub of SF_NET.videoSubmits) {
    const kind = sub.kind === "image" ? "image" : "video";
    // 아직 아무 제출도 귀속받지 않은 같은 종류의 waiter 만 후보.
    const free = SF_NET.waiters.filter(
      (w) =>
        (w.kind || "image") === kind &&
        (w.opKeys?.size || 0) === 0 &&
        (w.linkKeys?.size || 0) === 0
    );
    let target = free.find((w) => w.normPrompt && sub.normPrompts.includes(w.normPrompt));
    if (!target) {
      // 제출보다 나중에 등록된 waiter 는 이 제출의 주인일 수 없다 (500ms 여유).
      const before = free.filter((w) => w.submitAt <= sub.at + 500);
      before.sort((a, b) => b.submitAt - a.submitAt);
      target = before[0];
    }
    if (target) {
      for (const k of sub.opKeys) target.opKeys.add(k);
      for (const k of sub.idKeys) {
        if (!SF_SHARED_ID_KEYS.has(k)) target.linkKeys.add(k);
      }
      console.log(
        `[Flow Bridge] ${kind === "image" ? "이미지" : "동영상"} 제출 귀속: op ${sub.opKeys.length}개 + 식별자 ${target.linkKeys.size}개 → ` +
          `${target.sceneId ? `scene=${String(target.sceneId).slice(0, 8)}` : "scene=?"}`
      );
    } else if (Date.now() - sub.at < 60000) {
      // waiter 등록이 아직 안 됐을 수 있다 — 1분간 보관 후 재시도.
      remaining.push(sub);
    }
  }
  SF_NET.videoSubmits = remaining;
}

function sfTryMatch() {
  // pendingResponses 의 각 응답 item을 가장 적합한 waiter에 1:1 매칭
  const remaining = [];
  const respCutoff = Date.now() - 10 * 60 * 1000;
  for (const resp of SF_NET.pendingResponses) {
    const items = [...resp.items];
    const leftover = [];
    for (const item of items) {
      // 이미지/동영상은 프롬프트 체계가 달라 서로 매칭되면 안 된다 — kind 로 격리.
      const itemKind = item.kind === "video" ? "video" : "image";
      // 이미 소비된 동영상 URL 은 재매칭·보관 모두 하지 않는다. 상태 폴링이 같은
      // 완성 영상을 반복해서 보내므로 중복 유입 자체는 정상 상황이다.
      if (itemKind === "video" && SF_CONSUMED_VIDEO_URLS.has(item.url)) continue;
      // 1) batchId로 매칭된 요청의 prompt 셋과 비교
      const reqInfo = resp.batchId ? SF_NET.reqByBatch.get(resp.batchId) : null;
      const candidatePrompts = reqInfo?.prompts?.map(sfPromptKey) || [];
      const itemPromptN = sfPromptKey(item.prompt);
      const itemOpKey = sfOpKey(item.opName);
      // 이 영상에 이르는 길목에서 본 식별자들 — 공유 식별자는 제외한다.
      const itemLinkKeys = (item.linkIds || [])
        .map(sfOpKey)
        .filter((k) => k && !SF_SHARED_ID_KEYS.has(k));
      let matched = false;
      // waiter 우선순위: operation 일치 → 식별자 일치 → prompt 일치, 같으면 가장 오래된 것.
      // 앞의 둘은 제출 시점에 잡에 못 박아 둔 것이라 완성 순서와 무관하게 정확하다.
      const sorted = [...SF_NET.waiters].sort((a, b) => a.createdAt - b.createdAt);
      // 다른 kind 의 waiter 가 주인으로 잡히면 후보가 그 하나로 좁혀진 뒤 kind
      // 검사에서 떨어져 매칭이 통째로 무산된다 — 같은 kind 안에서만 찾는다.
      const sameKind = sorted.filter((w) => (w.kind || "image") === itemKind);
      const opOwner =
        (itemOpKey ? sameKind.find((w) => w.opKeys && w.opKeys.has(itemOpKey)) : null) ||
        (itemLinkKeys.length > 0
          ? sameKind.find((w) => w.linkKeys && itemLinkKeys.some((k) => w.linkKeys.has(k)))
          : null);
      // 이 영상의 operation 주인이 확인되면 그 잡만 후보로 둔다 — 여러 장면이
      // 같은 프롬프트를 쓸 때(공통 프롬프트) operation 이 유일한 구분자다.
      const candidates = opOwner ? [opOwner] : sorted;
      for (const w of candidates) {
        if ((w.kind || "image") !== itemKind) continue;
        const wp = w.normPrompt;
        // 전역(공통) 프롬프트가 모든 장면에 합쳐지므로 substring 부분일치는 오매칭
        // 위험. 정규화 후 "앞 500자 완전 일치"(sfPromptKey)만 허용한다 — 장면 고유
        // 내용이 앞에 오므로 앞부분이 곧 장면 식별자다.
        const promptHit =
          (itemOpKey && w.opKeys && w.opKeys.has(itemOpKey)) ||
          (w.linkKeys && itemLinkKeys.some((k) => w.linkKeys.has(k))) ||
          (itemPromptN && wp && itemPromptN === wp) ||
          candidatePrompts.includes(wp);
        if (promptHit) {
          // resolve
          clearTimeout(w.timer);
          const idx = SF_NET.waiters.indexOf(w);
          if (idx >= 0) SF_NET.waiters.splice(idx, 1);
          if (itemKind === "video") SF_CONSUMED_VIDEO_URLS.add(item.url);
          w.resolve({ image_url: item.url });
          matched = true;
          break;
        }
      }
      // 번역 허용 접두사 매칭 — 완전 일치가 실패했을 때의 2차 판정.
      // 실측: 영어 프롬프트 속 한국어 조각(전역 프롬프트 등)만 Flow 가 영어로
      // 번역해 돌려줘, 그 조각이 시작되는 지점부터 어긋난다. 이때
      //   (1) 어긋나기 전까지의 공통 접두사가 충분히 길고 (장면 고유 내용),
      //   (2) 잡 쪽 어긋난 지점이 비ASCII(번역으로 설명되는 차이)이며,
      //   (3) 2등 후보의 공통 접두사가 확연히 짧아 주인이 유일하면
      // 그 잡으로 인정한다. 같은 인물 묘사로 시작하는 두 장면처럼 후보가
      // 애매하면 (3)에서 걸러져 안전하게 포기한다.
      if (!matched && itemKind === "image" && itemPromptN) {
        let best = null;
        let bestLen = 0;
        let secondLen = 0;
        for (const w of candidates) {
          if ((w.kind || "image") !== "image" || !w.normPrompt) continue;
          const b = w.normPrompt;
          let i = 0;
          while (i < itemPromptN.length && i < b.length && itemPromptN[i] === b[i]) i++;
          if (i > bestLen) { secondLen = bestLen; bestLen = i; best = w; }
          else if (i > secondLen) secondLen = i;
        }
        const divergedAtNonAscii =
          best && /[^\x00-\x7F]/.test((best.normPrompt || "").slice(bestLen, bestLen + 3));
        // 응답 에코가 잡 프롬프트보다 짧게 잘려 끝난 경우도 같은 조건으로 허용.
        const echoEnded =
          best && bestLen === itemPromptN.length && bestLen < (best.normPrompt || "").length;
        if (best && bestLen >= 100 && (divergedAtNonAscii || echoEnded) && secondLen < bestLen * 0.6) {
          console.log(
            `[Flow Bridge] 이미지 접두사 매칭(번역 허용): 공통 ${bestLen}자, 2등 ${secondLen}자 → ` +
              `scene=${String(best.sceneId || "?").slice(0, 8)}`
          );
          clearTimeout(best.timer);
          const idx = SF_NET.waiters.indexOf(best);
          if (idx >= 0) SF_NET.waiters.splice(idx, 1);
          best.resolve({ image_url: item.url });
          matched = true;
        }
      }
      if (!matched) {
        if (itemKind === "video" && !SF_DIAG_LOGGED_URLS.has(item.url)) {
          SF_DIAG_LOGGED_URLS.add(item.url);
          const waitersDesc = SF_NET.waiters
            .filter((w) => (w.kind || "image") === "video")
            .map(
              (w) =>
                `${String(w.sceneId || "?").slice(0, 8)}(op ${w.opKeys?.size ?? 0}·식별자 ${w.linkKeys?.size ?? 0})`
            )
            .join(", ");
          console.warn(
            `[Flow Bridge] 영상 매칭 실패 — op=${itemOpKey || "없음"}, 식별자 ${itemLinkKeys.length}개, ` +
              `프롬프트=${itemPromptN ? "있음" : "없음"}, 대기 중 영상 잡=[${waitersDesc || "없음"}]`
          );
        } else if (itemKind === "image" && !SF_DIAG_LOGGED_URLS.has(item.url)) {
          // 진단: 응답이 실어온 프롬프트와 대기 중 잡의 프롬프트를 나란히 찍는다.
          // "무엇이 어떻게 달라서 안 붙었는지"를 추측 없이 바로 볼 수 있게 —
          // 재작성(다른 문장으로 돌아옴) / 미수집(응답 프롬프트 없음) / 앞부분 불일치가 구분된다.
          SF_DIAG_LOGGED_URLS.add(item.url);
          const imgWaiters = SF_NET.waiters.filter((w) => (w.kind || "image") === "image");
          const waitersDesc = imgWaiters
            .map((w) => `${String(w.sceneId || "?").slice(0, 8)}:"${(w.normPrompt || "").slice(0, 60)}"`)
            .join(" | ");
          // 가장 비슷한 잡을 골라 첫 불일치 지점과 그 앞뒤 문맥을 이스케이프해 찍는다
          // — 둥근따옴표 같은 "눈에 안 보이는" 문자 차이를 그대로 드러내기 위해.
          let bestW = null;
          let bestCommon = -1;
          for (const w of imgWaiters) {
            const b = w.normPrompt || "";
            let i = 0;
            while (i < itemPromptN.length && i < b.length && itemPromptN[i] === b[i]) i++;
            if (i > bestCommon) { bestCommon = i; bestW = w; }
          }
          let diffDesc = "";
          if (bestW && itemPromptN) {
            const b = bestW.normPrompt || "";
            const from = Math.max(0, bestCommon - 15);
            diffDesc =
              ` | 첫 불일치 위치=${bestCommon} (응답 ${itemPromptN.length}자·잡 ${b.length}자), ` +
              `응답측=${JSON.stringify(itemPromptN.slice(from, bestCommon + 25))}, ` +
              `잡측=${JSON.stringify(b.slice(from, bestCommon + 25))}`;
          }
          console.warn(
            `[Flow Bridge] 이미지 매칭 실패 — 응답 프롬프트(앞 60자): "${itemPromptN.slice(0, 60) || "(없음)"}" (원문 ${String(item.prompt || "").length}자), ` +
              `응답 식별자 ${itemLinkKeys.length}개, 대기 중 이미지 잡=[${waitersDesc || "없음"}]${diffDesc}`
          );
        }
        leftover.push(item);
      }
    }
    if (leftover.length > 0 && resp.at > respCutoff) {
      // FIFO fallback 제거: 공통 프롬프트 때문에 오매칭 위험이 큼.
      // 매칭되지 않은 응답은 그대로 남겨두고 timeout까지 정확한 매칭만 시도.
      // 단, 10분 지난 응답은 버린다 — 동영상 상태 폴링의 반복 유입이 무한히 쌓인다.
      remaining.push({ ...resp, items: leftover });
    }
  }
  SF_NET.pendingResponses = remaining;

  // 오래된 reqByBatch 정리 (10분 초과)
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of SF_NET.reqByBatch) {
    if (v.at < cutoff) SF_NET.reqByBatch.delete(k);
  }
}

// kind: 'image' | 'video' — 응답 item 의 kind 와 같은 waiter 만 매칭된다.
// 반환된 Promise 에는 sfCancel() 이 붙어 있어, 잡이 다른 경로로 끝났을 때
// waiter 를 즉시 제거할 수 있다 (같은 프롬프트의 재시도 잡이 결과를 뺏기지 않게).
function sfRegisterWaiter(prompt, timeoutMs = 180000, sceneId = null, kind = "image") {
  let cancelFn = null;
  const p = new Promise((resolve, reject) => {
    const w = {
      prompt,
      normPrompt: sfPromptKey(prompt),
      sceneId,
      kind,
      createdAt: Date.now(),
      // 동영상 전용: 제출 응답에서 이 잡에 귀속된 Flow operation 키.
      // 완성 폴링 응답을 프롬프트 없이도 이 잡으로 되돌리는 근거가 된다.
      opKeys: new Set(),
      // operation 을 못 알아본 제출을 위한 2순위 근거. 제출 응답에만 있던 식별자
      // (여러 제출에 공통으로 나오는 값은 제외)를 담는다.
      linkKeys: new Set(),
      submitAt: Date.now(),
      resolve,
      reject,
      timer: null,
    };
    const remove = () => {
      const idx = SF_NET.waiters.indexOf(w);
      if (idx >= 0) SF_NET.waiters.splice(idx, 1);
    };
    w.timer = setTimeout(() => {
      remove();
      reject(new Error(`Flow 응답 timeout (${timeoutMs}ms) — 네트워크 인터셉트 매칭 실패`));
    }, timeoutMs);
    cancelFn = () => {
      try { clearTimeout(w.timer); } catch {}
      remove();
      reject(new Error("waiter 취소"));
    };
    // 앞 500자 키가 같은 잡이 이미 대기 중이면 경고 — 장면 프롬프트가 비어
    // 전역 프롬프트만 제출됐을 때 흔하다. 이 경우 완성 순서에 따라 두 장면의
    // 그림이 뒤바뀔 수 있으므로, 장면 고유 프롬프트를 먼저 채우라는 신호다.
    if (w.normPrompt) {
      const dup = SF_NET.waiters.find(
        (x) => (x.kind || "image") === kind && x.normPrompt === w.normPrompt
      );
      if (dup) {
        console.warn(
          `[Flow Bridge] ⚠ 프롬프트 앞 ${SF_PROMPT_MATCH_PREFIX}자가 동일한 잡이 이미 대기 중 ` +
            `(scene ${String(dup.sceneId || "?").slice(0, 8)} ↔ ${String(sceneId || "?").slice(0, 8)}) ` +
            `— 장면 고유 프롬프트가 비어 있으면 두 장면의 결과가 서로 바뀔 수 있습니다.`
        );
      }
    }
    SF_NET.waiters.push(w);
    // 제출 응답이 waiter 등록보다 먼저 도착했을 수 있다 — 보관해 둔 operation 을
    // 지금 귀속시킨다.
    sfClaimMediaSubmits();
    // 이미 도착해 있는 응답이 있으면 즉시 매칭 시도
    sfTryMatch();
  });
  p.sfCancel = () => { if (cancelFn) cancelFn(); };
  return p;
}

// ============================================================
// 취소(중단) 상태
// - SF_CANCEL.all=true 이면 새 잡은 즉시 abort, 진행 중 waiter 모두 reject
// - SF_CANCEL.sceneIds 에 포함된 scene 의 잡은 개별 abort
// ============================================================
const SF_CANCEL = {
  all: false,
  sceneIds: new Set(),
};
function sfAbortAllWaiters(reason = "사용자 중단") {
  const list = [...SF_NET.waiters];
  SF_NET.waiters.length = 0;
  for (const w of list) {
    try { clearTimeout(w.timer); } catch {}
    try { w.reject(new Error(reason)); } catch {}
  }
  // rate limit 카운터도 리셋해 다음 실행을 막지 않음
  SF_RATE.recent.length = 0;
}

// Flow API 가 4xx/5xx 로 거부한 요청을 prompt 기준으로 기록.
// injected.js 의 fetch/XHR 래퍼가 에러 응답 캡처 시 여기에 축적되어,
// 해당 prompt 를 가진 video/image 잡이 자기 요청이 실패했음을 즉시 알 수 있다.
// 실패한 잡이 "결과 없음"을 오래 기다리며 다른 잡의 결과를 fallback 으로 훔쳐가는
// 상황을 방지한다.
const SF_FLOW_API_FAILURES = new Map(); // normalized prompt → { status, ts, url }
const SF_FLOW_FAILURE_TTL_MS = 3 * 60 * 1000;

function sfMarkPromptFailed(prompt, status, url) {
  const norm = sfPromptKey(prompt);
  if (!norm) return;
  SF_FLOW_API_FAILURES.set(norm, { status, url, ts: Date.now() });
}

function sfCleanupFailures() {
  const now = Date.now();
  for (const [k, v] of SF_FLOW_API_FAILURES) {
    if (now - v.ts > SF_FLOW_FAILURE_TTL_MS) SF_FLOW_API_FAILURES.delete(k);
  }
}

function sfLookupPromptFailure(prompt) {
  sfCleanupFailures();
  const norm = sfPromptKey(prompt);
  if (!norm) return null;
  return SF_FLOW_API_FAILURES.get(norm) || null;
}

// prompt 가 Flow API 에러 Map 에 등록되면 resolve 되는 Promise. 타임아웃 시엔
// 절대 resolve 되지 않도록 해 Promise.race 의 패자가 되게 한다.
function sfWaitForPromptFailure(prompt) {
  return new Promise((resolve) => {
    const existing = sfLookupPromptFailure(prompt);
    if (existing) return resolve(existing);
    const norm = sfNormalize(prompt);
    if (!norm) return; // 매칭 불가 — 영원히 대기
    const interval = setInterval(() => {
      const f = sfLookupPromptFailure(prompt);
      if (f) {
        clearInterval(interval);
        resolve(f);
      }
    }, 300);
  });
}

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.__sfChannel !== "sf-flow-bridge" || d.type !== "FLOW_CAPTURE") return;
  if (d.phase === "request" && d.batchId) {
    SF_NET.reqByBatch.set(d.batchId, { prompts: d.prompts || [], at: Date.now() });
  } else if (d.phase === "video_submit" && (d.ops?.length > 0 || d.ids?.length > 0)) {
    // 동영상 제출이 만들어 낸 operation·식별자 — 방금 제출한 잡에 못 박는다.
    const opKeys = [...new Set((d.ops || []).map(sfOpKey).filter(Boolean))];
    const idKeys = sfRegisterSubmitIdKeys(
      [...new Set((d.ids || []).map(sfOpKey).filter(Boolean))].filter((k) => !opKeys.includes(k)),
    );
    SF_NET.videoSubmits.push({
      kind: "video",
      opKeys,
      idKeys,
      normPrompts: (d.prompts || []).map(sfPromptKey).filter(Boolean),
      at: Date.now(),
    });
    sfClaimMediaSubmits();
    sfTryMatch();
  } else if (d.phase === "bx_submit" && Array.isArray(d.ids) && d.ids.length > 0) {
    // 신 Flow(batchexecute) 제출 응답 — 방금 만들어진 미디어/워크플로 UUID 를
    // "방금 제출한 잡"에 못 박는다. 완성 폴링이 프롬프트를 번역해 돌려줘도
    // (한국어 프롬프트 실측) 이 ID 로 정확히 그 잡에 되돌아온다.
    const idKeys = sfRegisterSubmitIdKeys(
      [...new Set(d.ids.map(sfOpKey).filter(Boolean))],
    );
    SF_NET.videoSubmits.push({
      kind: d.kind === "image" ? "image" : "video",
      opKeys: [],
      idKeys,
      normPrompts: (d.prompts || []).map(sfPromptKey).filter(Boolean),
      at: Date.now(),
    });
    sfClaimMediaSubmits();
    sfTryMatch();
  } else if (d.phase === "response" && Array.isArray(d.items) && d.items.length > 0) {
    if (d.diag) {
      // 완성 응답이 실제로 무엇을 싣고 오는지 — op 도 프롬프트도 0 이면 그 응답으로는
      // 어느 장면 것인지 판정할 수 없다는 뜻이다 (매칭 실패의 근본 원인 확인용).
      console.log(
        `[Flow Bridge] 영상 응답 진단: 영상 ${d.items.length}개, op 있음 ${d.diag.withOp}, ` +
          `프롬프트 있음 ${d.diag.withPrompt}, topKeys=[${(d.diag.topKeys || []).join(", ")}]` +
          (d.diag.sampleOp ? `, 예시 op=${String(d.diag.sampleOp).slice(0, 60)}` : "")
      );
    }
    // 영구 인덱스: asset key → prompt. dialog 매칭 시 역조회용.
    for (const item of d.items) {
      const k = extractFlowAssetKey(item?.url);
      const p = sfPromptKey(item?.prompt);
      if (k && p) SF_NET.assetKeyToPrompt.set(k, p);
    }
    SF_NET.pendingResponses.push({ batchId: d.batchId, items: d.items, at: Date.now() });
    sfTryMatch();
  } else if (d.phase === "error" && Array.isArray(d.prompts)) {
    for (const p of d.prompts) sfMarkPromptFailed(p, d.status, d.url);
    console.warn(
      `[Flow Bridge] Flow API 실패 수신: HTTP ${d.status}, prompts=${d.prompts.length}개 — 해당 잡 즉시 실패 처리`
    );
  }
});

// ============================================================
// 모드 시그널 수신 — injected.js가 video/image API 호출을 감지하면 보냄.
// ensureVideoMode가 DOM 휴리스틱 대신 이 시그널을 우선 사용.
// ============================================================
const SF_MODE = { lastVideoAt: 0, lastImageAt: 0 };
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.__sfChannel !== "sf-flow-bridge" || d.type !== "MODE_SIGNAL") return;
  if (d.kind === "video") SF_MODE.lastVideoAt = d.ts || Date.now();
  else if (d.kind === "image") SF_MODE.lastImageAt = d.ts || Date.now();
});

// ============================================================
// 입력창 직렬화 뮤텍스
// 여러 잡이 동시에 들어와도 프롬프트 입력+Submit+카드캡쳐는 순차 처리.
// 그 이후 결과 대기는 병렬로 진행됨.
// ============================================================
let inputLockChain = Promise.resolve();
function withInputLock(fn) {
  const next = inputLockChain.then(() => fn()).catch((e) => {
    console.warn("[Flow Bridge] inputLock task error", e);
    throw e;
  });
  // 다음 작업이 이전 결과/실패와 무관하게 진행되도록 체인 보존
  inputLockChain = next.catch(() => {});
  return next;
}

// ============================================================
// 이미지 단위 슬라이딩 rate limit
// 최근 60초 내 제출된 "이미지 수"가 limit 이상이면, 가장 오래된 것이
// 60초 지나갈 때까지 대기 후 진행. (Flow 생성 제한 회피)
// ============================================================
const SF_RATE = {
  windowMs: 60 * 1000,
  // Flow Ultra 기준 상향(기존 8/분). 실제 제출은 입력 락이 직렬화하므로 이 한도는
  // "분당 최대"의 안전 상한 역할. Flow 가 거부하기 시작하면 이 값을 낮춰 마진을 둔다.
  limit: 24,
  // 최근 제출 시각 기록 (이미지 1장당 1엔트리)
  recent: [], // number[] (timestamps)
};
async function sfWaitForRateSlot(imagesCount = 1) {
  while (true) {
    const now = Date.now();
    SF_RATE.recent = SF_RATE.recent.filter((t) => now - t < SF_RATE.windowMs);
    if (SF_RATE.recent.length + imagesCount <= SF_RATE.limit) {
      // 슬롯 확보 — 즉시 점유 기록
      const ts = Date.now();
      for (let i = 0; i < imagesCount; i++) SF_RATE.recent.push(ts);
      return;
    }
    // 가장 오래된 것 + windowMs 까지 대기
    const oldest = SF_RATE.recent[0];
    const waitMs = Math.max(200, oldest + SF_RATE.windowMs - now + 50);
    console.log(`[Flow Bridge] rate limit 대기 ${(waitMs/1000).toFixed(1)}s (현재 ${SF_RATE.recent.length}/${SF_RATE.limit})`);
    await SLEEP(waitMs);
  }
}

// ============================================================
// 잡별 결과 카드(placeholder) 추적
// Submit 직후 새로 생긴 결과 컨테이너를 그 잡의 카드로 표시한다.
// ============================================================
const RESULT_CARD_SELECTOR = "article, li, [role='listitem'], [data-testid*='card'], [class*='card'], [class*='Card']";

function isLikelyResultCardContainer(card) {
  if (!(card instanceof HTMLElement)) return false;
  if (!document.body.contains(card)) return false;
  if (card.closest("form, [role='dialog'], [role='menu'], [role='listbox'], header, nav, aside")) return false;
  if (card.querySelector("input, textarea, [contenteditable='true']")) return false;

  const rect = card.getBoundingClientRect();
  const hasMedia = !!card.querySelector("img, canvas, video, [style*='background-image']");
  const classText = `${card.className || ""} ${card.getAttribute("data-testid") || ""}`.toLowerCase();
  const text = normalizeText(card.textContent || "");
  const cardish =
    card.matches("article, li, [role='listitem']") ||
    /card|result|tile|item|grid|gallery/.test(classText);

  if (rect.width > 0 && rect.height > 0) {
    // 작은 창에서는 결과 카드도 같이 줄어들므로 고정 120px 임계값이 모든 카드를
    // 거부해 "카드 클레임 = null" 이 난다 — 뷰포트 크기에 비례해 완화.
    const minDim = Math.min(120, Math.max(40, Math.min(window.innerWidth, window.innerHeight) * 0.15));
    if (rect.width < minDim || rect.height < minDim) return false;
    if (rect.width < 220 && rect.height < 220 && !hasMedia) return false;
  }

  if (!cardish && !hasMedia) return false;
  if (/^(새 프로젝트|만들기|generate|create)$/i.test(text) && !hasMedia) return false;
  return true;
}

function collectCandidateCardsFromRoot(root) {
  const cards = new Set();
  if (!(root instanceof HTMLElement)) return cards;

  const selfOrAncestor = root.closest(RESULT_CARD_SELECTOR);
  if (selfOrAncestor && isLikelyResultCardContainer(selfOrAncestor)) cards.add(selfOrAncestor);

  if (root.matches?.(RESULT_CARD_SELECTOR) && isLikelyResultCardContainer(root)) cards.add(root);
  root.querySelectorAll?.(RESULT_CARD_SELECTOR).forEach((el) => {
    if (isLikelyResultCardContainer(el)) cards.add(el);
  });

  root.querySelectorAll?.("img, canvas, video").forEach((media) => {
    const card = media.closest(RESULT_CARD_SELECTOR);
    if (card && isLikelyResultCardContainer(card)) cards.add(card);
  });

  return cards;
}

function findResultCardContainers() {
  const candidates = new Set();
  document.querySelectorAll(RESULT_CARD_SELECTOR).forEach((card) => {
    if (isLikelyResultCardContainer(card)) candidates.add(card);
  });
  document.querySelectorAll("img, canvas, video").forEach((media) => {
    const card = media.closest(RESULT_CARD_SELECTOR);
    if (card && isLikelyResultCardContainer(card)) candidates.add(card);
  });
  return candidates;
}

function snapshotResultCards() {
  return findResultCardContainers();
}

// Submit 직후 새로 추가된 카드를 찾아서 마킹.
// 못 찾으면 null 반환 (이 경우 fallback으로 prevImgs 기반 매칭).
async function captureNewCardForJob(prevCards, jobTag, maxWaitMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const cur = snapshotResultCards();
    for (const card of cur) {
      if (prevCards.has(card)) continue;
      if (card.dataset.sfJobId) continue; // 다른 잡이 이미 클레임
      card.dataset.sfJobId = jobTag;
      return card;
    }
    await SLEEP(150);
  }
  return null;
}

// Submit 직후 batch로 생긴 모든 새 카드를 jobTag로 한꺼번에 클레임.
// Flow는 count>1이면 한 번에 여러 카드를 추가하므로, 다른 잡이 같은 batch의
// 형제 카드를 자기 것으로 오인하는 것을 방지한다.
// 또한 stableMs 동안 새 카드가 더 추가되지 않을 때까지 기다려 안정화.
async function captureNewCardsForJob(prevCards, jobTag, expectedCount = 1, maxWaitMs = 30000, stableMs = 2500) {
  const start = Date.now();
  const claimed = [];
  const claimedSet = new Set();
  let lastAddAt = Date.now();

  const tryClaim = (card) => {
    if (!card || prevCards.has(card) || card.dataset.sfJobId || claimedSet.has(card)) return false;
    card.dataset.sfJobId = jobTag;
    claimed.push(card);
    claimedSet.add(card);
    lastAddAt = Date.now();
    return true;
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.target instanceof HTMLElement) {
        collectCandidateCardsFromRoot(m.target).forEach(tryClaim);
      }
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          collectCandidateCardsFromRoot(node).forEach(tryClaim);
        }
      });
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "src"],
  });

  // 첫 카드가 등장할 때까지 대기
  try {
    while (Date.now() - start < maxWaitMs) {
      snapshotResultCards().forEach(tryClaim);
      if (claimed.length >= expectedCount && Date.now() - lastAddAt >= stableMs) break;
      if (claimed.length > 0 && Date.now() - lastAddAt >= stableMs) break;
      await SLEEP(150);
    }
    return claimed;
  } finally {
    observer.disconnect();
  }
}

// 특정 카드 안에서 결과 이미지가 채워질 때까지 대기.
function waitForImgInCard(card, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (url) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(url);
    };
    const check = () => {
      const imgs = card.querySelectorAll("img");
      for (const img of imgs) {
        if (!isLikelyResultImg(img)) continue;
        if (img.complete && img.naturalWidth > 0) {
          finish(img.src);
          return;
        }
        img.addEventListener("load", () => {
          if (img.naturalWidth > 0) finish(img.src);
        }, { once: true });
      }
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(card, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      reject(new Error(`카드 내 이미지 timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

// 특정 카드 안에서 결과 비디오가 채워질 때까지 대기.
// isLikelyResultVideo는 파일 하단에 정의되어 있고, 호출 시점에는 이미 정의된 상태.
function waitForVideoInCard(card, timeoutMs = 8 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let done = false;
    const cleanupAll = () => {
      try { observer.disconnect(); } catch {}
      try { clearTimeout(timer); } catch {}
      try { clearInterval(failPoll); } catch {}
      try { clearInterval(diagPoll); } catch {}
    };
    const finish = (url) => {
      if (done) return;
      done = true;
      cleanupAll();
      console.log(
        `[Flow Bridge] waitForVideoInCard: 영상 수신 성공 (elapsed=${Math.round((Date.now() - start) / 1000)}s, src=${String(url).slice(0, 80)}...)`
      );
      resolve(url);
    };
    const fail = (err) => {
      if (done) return;
      done = true;
      cleanupAll();
      reject(err);
    };
    const check = () => {
      const videos = card.querySelectorAll("video");
      for (const v of videos) {
        if (!isLikelyResultVideo(v)) continue;
        const src = v.currentSrc || v.src || "";
        // 다른 잡(주로 네트워크 매칭)이 이미 소비한 URL 은 건너뛴다 — 클레임이
        // 어긋났을 때 남의 영상을 결과로 가져가는 것을 막는 2차 방어선.
        if (src && !SF_CONSUMED_VIDEO_URLS.has(src)) {
          SF_CONSUMED_VIDEO_URLS.add(src);
          finish(src);
          return;
        }
      }
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(card, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    // Flow 실패 카드 감지 시 즉시 실패 처리
    const failPoll = setInterval(() => {
      if (typeof isFlowFailureCardPresent === "function" && isFlowFailureCardPresent()) {
        fail(new Error("Flow 실패 카드 감지 — 영상 생성 실패"));
      }
    }, 2000);
    // 15초마다 진단 로그 — 카드가 DOM 에서 사라졌는지, video 가 몇 개인지 등
    const diagPoll = setInterval(() => {
      if (done) return;
      const elapsed = Math.round((Date.now() - start) / 1000);
      const inDom = document.body.contains(card);
      const vids = card.querySelectorAll("video").length;
      const imgs = card.querySelectorAll("img").length;
      const tag = card.dataset?.sfJobId || "?";
      console.log(
        `[Flow Bridge] waitForVideoInCard: 대기 중 elapsed=${elapsed}s cardInDom=${inDom} videos=${vids} imgs=${imgs} jobTag=${tag}`
      );
    }, 15000);
    const timer = setTimeout(() => {
      fail(new Error(`카드 내 영상 timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

function findByText(selector, text) {
  const els = Array.from(document.querySelectorAll(selector));
  return els.find((el) => el.textContent?.trim().includes(text));
}

function findIconButton(iconText, parentText) {
  // Flow icons may render as <i class="google-symbols">, <span class="google-symbols">,
  // or generic material icon spans. Match any element whose textContent equals iconText
  // and whose className includes "symbols".
  const candidates = Array.from(
    document.querySelectorAll(
      "i.google-symbols, span.google-symbols, [class*='google-symbols'], [class*='material-symbols']"
    )
  );
  for (const icon of candidates) {
    if (icon.textContent?.trim() === iconText) {
      const btn = icon.closest("button, [role='menuitem'], [role='button']");
      if (!btn) continue;
      if (btn.disabled) continue;
      if (parentText && !btn.textContent?.includes(parentText)) continue;
      return btn;
    }
  }
  return null;
}

// Try multiple aria-labels / titles to find a submit-style button.
function findSubmitButton() {
  // Helper: find a button by visually-hidden span text (Flow uses sr-only spans)
  // e.g. <button><i>arrow_forward</i><span style="...clip:rect(0...">만들기</span></button>
  const allButtons = Array.from(document.querySelectorAll("button"));

  // 1) Icon-based lookup (arrow_forward / send / play_arrow inside <i> or <span>)
  for (const iconText of ["arrow_forward", "send", "play_arrow"]) {
    for (const btn of allButtons) {
      const icon = btn.querySelector("i.google-symbols, span.google-symbols, [class*='google-symbols'], [class*='material-symbols']");
      if (icon && icon.textContent?.trim() === iconText) return btn;
    }
  }

  // 2) sr-only / aria-label / title text match (KO + EN)
  const labels = ["만들기", "생성", "Generate", "Create", "Send", "Submit"];
  for (const b of allButtons) {
    const al = (b.getAttribute("aria-label") || "").trim();
    const tl = (b.getAttribute("title") || "").trim();
    const txt = (b.textContent || "").trim();
    if (labels.some((l) => al === l || tl === l || txt === l || txt.includes(l))) return b;
  }

  // 3) Last button inside the prompt composer
  const composer = document.querySelector(
    "form, [role='form'], [data-testid*='composer'], [class*='composer']"
  );
  if (composer) {
    const btns = composer.querySelectorAll("button");
    if (btns.length > 0) return btns[btns.length - 1];
  }
  return null;
}

function isVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalizeText(text) {
  return (text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePromptEditor(el) {
  let score = 0;
  const text = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("role") || ""}`.toLowerCase();
  const rect = el.getBoundingClientRect();
  if (el.matches('[data-slate-editor="true"]')) score += 12;
  if (el.matches('[contenteditable="true"]')) score += 10;
  if (el.matches('textarea, input:not([type="hidden"])')) score += 8;
  if (el.getAttribute("role") === "textbox") score += 6;
  if (el.closest("form, [role='dialog'], [data-testid*='composer'], [class*='composer'], [class*='prompt']")) score += 5;
  if (/(prompt|프롬프트|message|메시지|describe|설명|what do you want)/.test(text)) score += 6;
  if (document.activeElement === el) score += 4;
  score += Math.min(rect.width, 900) / 120;
  score += Math.min(rect.height, 400) / 80;
  return score;
}

function findPromptEditor() {
  const candidates = Array.from(
    document.querySelectorAll(
      '[data-slate-editor="true"], textarea, input:not([type="hidden"]), [contenteditable="true"], [role="textbox"]'
    )
  ).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (!isVisible(el)) return false;
    if (el.getAttribute("contenteditable") === "false") return false;
    if (el instanceof HTMLInputElement && ["checkbox", "radio", "file", "range", "button", "submit"].includes(el.type)) {
      return false;
    }
    return true;
  });

  candidates.sort((a, b) => scorePromptEditor(b) - scorePromptEditor(a));
  return candidates[0] || null;
}

function activateEditor(editor) {
  try { editor.scrollIntoView({ block: "center" }); } catch {}
  try { editor.click(); } catch {}
  try { editor.focus(); } catch {}
}

function selectAllEditorContent(editor) {
  activateEditor(editor);
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    editor.setSelectionRange(0, editor.value.length);
    return;
  }
  try {
    if (!document.contains(editor)) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (e) {
    // Slate가 DOM을 비동기로 재구성하는 동안 range가 무효해질 수 있음 — 무시
  }
}

function readEditorText(editor) {
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    return editor.value;
  }
  return editor.textContent || "";
}

function isSubmitEnabled() {
  const btn = findSubmitButton();
  return !!btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
}

// 비활성 사유 진단 — 사용자에게 보여줄 메시지 생성
function diagnoseSubmitButton() {
  const btn = findSubmitButton();
  if (!btn) return "생성 버튼(만들기/arrow_forward)을 DOM에서 찾지 못함 — Flow UI가 변경되었을 수 있음";
  const reasons = [];
  if (btn.disabled) reasons.push("button.disabled=true");
  if (btn.getAttribute("aria-disabled") === "true") reasons.push("aria-disabled=true");
  const cls = btn.className || "";
  if (/disabled/i.test(cls)) reasons.push(`class에 disabled 포함 (${cls.slice(0, 80)})`);
  if (reasons.length === 0) return "버튼은 활성 상태로 보이지만 isSubmitEnabled가 false 반환";
  return `생성 버튼 비활성: ${reasons.join(", ")} — 프롬프트가 Flow 내부 state에 반영되지 않음(Slate sync 실패 가능성)`;
}

function editorTextLooksValid(editor, text) {
  const current = normalizeText(readEditorText(editor));
  const target = normalizeText(text);
  if (!current || !target) return false;
  return current === target || current.includes(target) || target.includes(current);
}

function insertTextWithExecCommand(editor, text) {
  activateEditor(editor);
  selectAllEditorContent(editor);
  document.execCommand("delete", false);
  return document.execCommand("insertText", false, text);
}

function findSlateEditorInstance(root) {
  const seen = new WeakSet();

  function walk(value, depth = 0) {
    if (!value || typeof value !== "object") return null;
    if (seen.has(value) || depth > 8) return null;
    seen.add(value);

    if (
      typeof value.insertText === "function" &&
      typeof value.onChange === "function" &&
      Array.isArray(value.children)
    ) {
      return value;
    }

    for (const key of [
      "memoizedProps",
      "memoizedState",
      "stateNode",
      "child",
      "sibling",
      "return",
      "alternate",
      "pendingProps",
      "dependencies",
      "node",
      "editor",
    ]) {
      const found = walk(value[key], depth + 1);
      if (found) return found;
    }

    return null;
  }

  let node = root;
  while (node) {
    for (const key of Object.keys(node)) {
      if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactProps$")) continue;
      const found = walk(node[key]);
      if (found) return found;
    }
    node = node.parentElement;
  }

  return null;
}

function insertTextViaSlateInstance(editor, text) {
  const slateEditor = findSlateEditorInstance(editor);
  if (!slateEditor) return false;

  activateEditor(editor);
  selectAllEditorContent(editor);

  try {
    if (typeof slateEditor.deleteFragment === "function") {
      slateEditor.deleteFragment();
    }
    slateEditor.insertText(text);
    slateEditor.onChange();
    return true;
  } catch {
    return false;
  }
}

function insertTextViaSyntheticPaste(editor, text) {
  activateEditor(editor);
  selectAllEditorContent(editor);
  document.execCommand("delete", false);

  let dataTransfer;
  try {
    dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);
  } catch {
    dataTransfer = undefined;
  }

  editor.dispatchEvent(new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  }));
}

// Slate가 가장 정상적으로 받는 경로: beforeinput 이벤트를 글자/줄 단위로 dispatch.
// inputType: insertText / insertLineBreak 만 사용. data 필드에 실제 문자 전달.
async function insertTextViaBeforeInput(editor, text) {
  activateEditor(editor);
  selectAllEditorContent(editor);

  // 기존 내용 삭제 (Slate는 deleteContentBackward 시리즈를 받음)
  try {
    editor.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    }));
  } catch {}
  await SLEEP(50);

  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 0) {
      // 한 줄 통째로 insertText (Array.from으로 surrogate pair/이모지 보존)
      const ev = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: line,
      });
      editor.dispatchEvent(ev);
      // input 이벤트도 함께 발송 (일부 controlled component가 이걸 listen)
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "insertText",
        data: line,
      }));
      await SLEEP(20);
    }
    if (i < lines.length - 1) {
      editor.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertLineBreak",
      }));
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "insertLineBreak",
      }));
      await SLEEP(20);
    }
  }
}

async function waitFor(predicate, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) return result;
    await SLEEP(intervalMs);
  }
  throw new Error(`Timeout waiting (${timeoutMs}ms)`);
}

// MAIN world(injected.js)로 setPrompt 요청 보내고 응답 대기
function callMainWorldSetPrompt(text, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const handler = (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.__sfChannel !== "sf-flow-bridge") return;
      if (d.type !== "SET_PROMPT_TEXT_RESULT") return;
      if (d.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      resolve(d.result);
    };
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`MAIN world 응답 timeout (${timeoutMs}ms) — injected.js가 로드되지 않았을 가능성`));
    }, timeoutMs);
    window.addEventListener("message", handler);
    window.postMessage(
      { __sfChannel: "sf-flow-bridge", type: "SET_PROMPT_TEXT", requestId, text },
      "*"
    );
  });
}

// --- Slate.js editor input ---
async function typePromptIntoSlate(text) {
  // 개행을 공백으로 치환. Flow 의 Slate editor 는 Enter/개행을 Submit 으로 해석해
  // 긴 멀티라인 프롬프트가 줄마다 쪼개져 여러 번 제출되는 폭증 버그를 유발한다.
  // CDP / MAIN world / beforeinput / paste 등 모든 fallback 경로에 공통 적용되도록
  // 함수 진입 지점에서 한 번 normalize.
  text = String(text || "").replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ");

  const editor = await waitFor(
    () => findPromptEditor(),
    20000,
    500
  );
  if (!editor) throw new Error("프롬프트 입력창을 찾지 못함");
  activateEditor(editor);

  if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(
      editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(editor, "");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    setter.call(editor, text);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    let committed = false;

    let lastDiagnosis = "";

    // 0순위: CDP 로 진짜 키보드 입력 주입 (isTrusted=true, Slate가 수동 입력과 동일 처리).
    try {
      const cdpOk = await cdpTypeIntoEditor(editor, text);
      if (cdpOk) {
        // 진단: 실제 에디터에 텍스트가 반영됐는지 (판정 안 함 — 로그만).
        await SLEEP(300);
        try {
          const nowEditor = findPromptEditor();
          const clone = nowEditor ? nowEditor.cloneNode(true) : null;
          if (clone) {
            clone
              .querySelectorAll('[data-slate-placeholder="true"], [data-slate-zero-width]')
              .forEach((el) => el.remove());
          }
          const realText = clone ? normalizeText(clone.textContent || "").trim() : "";
          console.log(
            `[Flow Bridge] CDP 주입 후 에디터 실제 텍스트: ${realText.length}자 (첫 40자: "${realText.slice(0, 40)}")`
          );
        } catch {}

        for (let i = 0; i < 12; i++) {
          if (isSubmitEnabled()) { committed = true; break; }
          await SLEEP(1000);
        }
        if (!committed) {
          lastDiagnosis = "CDP 주입 후 Generate 버튼 비활성: " + diagnoseSubmitButton();
          console.warn("[StudioForge Flow Bridge]", lastDiagnosis);
        }
      }
    } catch (e) {
      console.warn("[StudioForge Flow Bridge] CDP 주입 오류:", e?.message || e);
    }

    // 1순위: MAIN world의 injected.js로 Slate editor 직접 조작
    if (!committed) try {
      const mainResult = await callMainWorldSetPrompt(text, 5000);
      if (mainResult?.ok) {
        for (let i = 0; i < 12; i++) {
          if (isSubmitEnabled()) { committed = true; break; }
          await SLEEP(1000);
        }
        if (!committed) lastDiagnosis = "MAIN world 주입 성공했으나 Generate 버튼 비활성: " + diagnoseSubmitButton();
      } else {
        lastDiagnosis = "MAIN world 주입 실패: " + (mainResult?.reason || "알 수 없음");
      }
      if (lastDiagnosis) console.warn("[StudioForge Flow Bridge]", lastDiagnosis);
    } catch (e) {
      lastDiagnosis = "MAIN world 호출 오류: " + (e?.message || String(e));
      console.warn("[StudioForge Flow Bridge]", lastDiagnosis);
    }

    // Fallback: 기존 ISOLATED world 방식들
    if (!committed) {
    for (const attempt of [
      () => insertTextViaBeforeInput(editor, text),
      () => insertTextViaSyntheticPaste(editor, text),
      () => insertTextWithExecCommand(editor, text),
      () => insertTextViaSlateInstance(editor, text),
    ]) {
      await attempt();
      await SLEEP(250);

      if (!editorTextLooksValid(editor, text)) {
        lastDiagnosis = "에디터에 텍스트가 들어가지 않음";
        continue;
      }

      // 1초 간격으로 최대 12초간 Generate 버튼 활성화 확인
      let enabled = false;
      for (let i = 0; i < 12; i++) {
        if (isSubmitEnabled()) { enabled = true; break; }
        await SLEEP(1000);
      }

      if (enabled) {
        committed = true;
        break;
      }

      lastDiagnosis = diagnoseSubmitButton();
      console.warn("[StudioForge Flow Bridge]", lastDiagnosis);
    }
    }

    if (!committed) {
      throw new Error(lastDiagnosis || "프롬프트가 화면에만 보이고 실제 입력 상태로 반영되지 않음");
    }
  }
  await SLEEP(800);
}

// --- Click "새 프로젝트" or "새 프롬프트" if needed ---
async function ensureInPromptScreen() {
  // 실패 카드/모달이 떠 있으면 먼저 닫는다 (입력창이 막히는 원인)
  dismissFailureCards();
  // 닫기 애니메이션이 있을 수 있으니 잠시 후 한 번 더
  await SLEEP(200);
  dismissFailureCards();

  // 이미 프롬프트 에디터가 활성화되어 있으면 즉시 통과
  if (findPromptEditor()) return;

  // 진입 후보 버튼들을 순서대로 시도 (있으면 클릭, 없으면 무시)
  const entryLabels = ["새 프롬프트", "새 프로젝트", "프롬프트 추가", "Add prompt", "New prompt", "New project"];
  for (const label of entryLabels) {
    const btn = findByText("button", label);
    if (btn) {
      try { btn.scrollIntoView({ block: "center" }); } catch {}
      btn.click();
      // 에디터가 나타날 때까지 최대 8초 대기
      const appeared = await waitFor(() => findPromptEditor(), 8000, 300);
      if (appeared) return;
    }
  }

  // 마지막 안전망: 에디터가 나타날 때까지 추가로 대기
  const editor = await waitFor(() => findPromptEditor(), 15000, 400);
  if (!editor) {
    throw new Error("Flow 프롬프트 화면에 진입하지 못함 — 프로젝트 페이지가 열려 있는지 확인하세요");
  }
}

// --- 실패 카드/모달 자동 닫기 ---
// Flow가 생성 실패 시 "실패 / 죄송합니다. 문제가 발생했습니다." 카드를 띄우는데,
// 이게 떠 있으면 다음 입력이 막힘. 카드 안의 close(✕) 버튼을 찾아서 클릭.
function dismissFailureCards() {
  let dismissed = 0;
  try {
    // 1) 실패 텍스트가 들어있는 컨테이너 탐색
    const candidates = Array.from(document.querySelectorAll("div, article, section, [role='dialog'], [role='alert']"));
    for (const el of candidates) {
      const txt = normalizeText(el.textContent || "");
      if (!txt) continue;
      // 정확히 실패 카드만 매칭 (너무 큰 컨테이너 제외)
      const isFailureCard =
        /실패/.test(txt) && /죄송합니다|문제가 발생|something went wrong|failed/i.test(txt);
      if (!isFailureCard) continue;
      if (txt.length > 400) continue; // 페이지 전체일 가능성

      // close 버튼 찾기: aria-label, title, 아이콘(close/cancel/x)
      const closeBtn =
        el.querySelector("button[aria-label*='닫기'], button[aria-label*='Close' i], button[title*='닫기'], button[title*='Close' i]") ||
        Array.from(el.querySelectorAll("button")).find((b) => {
          const icon = b.querySelector("i.google-symbols, span.google-symbols, [class*='google-symbols'], [class*='material-symbols']");
          const iconText = icon?.textContent?.trim();
          return iconText === "close" || iconText === "cancel" || iconText === "clear";
        });

      if (closeBtn) {
        try { closeBtn.click(); dismissed++; } catch {}
      }
    }
  } catch (e) {
    console.warn("[Flow Bridge] dismissFailureCards 오류", e);
  }
  if (dismissed > 0) {
    console.log(`[Flow Bridge] 실패 카드 ${dismissed}개 자동 닫음`);
  }
  return dismissed;
}

// --- Submit (만들기 / arrow_forward) ---
async function clickSubmit() {
  // Wait until the submit button exists AND is enabled (Flow disables it until prompt is non-empty)
  const btn = await waitFor(() => {
    const b = findSubmitButton();
    if (!b) return null;
    if (b.disabled) return null;
    if (b.getAttribute("aria-disabled") === "true") return null;
    return b;
  }, 20000, 300);
  if (!btn) throw new Error("만들기/생성 버튼을 찾지 못함 (활성화 대기 실패)");

  // CDP 로 진짜 사용자 클릭 주입 (isTrusted=true)
  await cdpClickElement(btn);
  await SLEEP(800);
}

// --- Wait for canvas result ---
async function waitForResultCanvas(prevCount) {
  return await waitFor(
    () => {
      const canvases = document.querySelectorAll("canvas");
      if (canvases.length > prevCount) {
        // Return the newest one
        return canvases[canvases.length - 1];
      }
      return null;
    },
    180000,
    1000
  );
}

// --- Extract canvas as base64 ---
function canvasToBase64(canvas) {
  try {
    return canvas.toDataURL("image/png");
  } catch (e) {
    throw new Error("Canvas 추출 실패 (CORS): " + e.message);
  }
}

// --- Result <img> detection (Flow renders results as <img> in newer UI) ---
function isLikelyResultImg(img) {
  if (!img || !img.src) return false;
  const src = img.src;
  if (src.startsWith("data:")) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (w > 0 && w < 200) return false;
  if (h > 0 && h < 200) return false;
  return (
    src.startsWith("blob:") ||
    /googleusercontent\.com|lh\d+\.google|storage\.googleapis|aistudio|labs\.google/.test(src)
  );
}

function snapshotResultImgUrls() {
  const set = new Set();
  document.querySelectorAll("img").forEach((img) => {
    if (isLikelyResultImg(img)) set.add(img.src);
  });
  return set;
}

// 모든 기존 결과 이미지가 안정될 때까지 기다린 뒤 최종 스냅샷을 만든다.
// (직전 잡 결과가 DOM에 아직 안 붙었을 가능성 차단)
async function stableSnapshotResultImgUrls(stableMs = 1500, maxWaitMs = 5000) {
  const start = Date.now();
  let last = snapshotResultImgUrls();
  let lastChange = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await SLEEP(300);
    const cur = snapshotResultImgUrls();
    const changed =
      cur.size !== last.size ||
      [...cur].some((u) => !last.has(u));
    if (changed) {
      last = cur;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= stableMs) {
      break;
    }
  }
  return last;
}

// MutationObserver 기반으로 submit 이후 "새로 DOM에 추가되거나 src가 바뀐"
// 이미지를 감지. prevSet에 없는 URL만 신규로 인정.
function waitForNewResultImg(prevSet, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const seenNew = new Set();
    let done = false;

    const finish = (url) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(url);
    };

    const consider = (img) => {
      if (done) return;
      if (!(img instanceof HTMLImageElement)) return;
      if (!isLikelyResultImg(img)) return;
      const src = img.src;
      if (prevSet.has(src) || seenNew.has(src)) return;
      seenNew.add(src);
      const settle = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) finish(src);
      };
      if (img.complete) settle();
      else {
        img.addEventListener("load", settle, { once: true });
      }
    };

    // 기존 DOM 한번 훑기 (관찰 시작 전 이미 추가된 새 이미지 캐치)
    document.querySelectorAll("img").forEach(consider);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target instanceof HTMLImageElement) {
          consider(m.target);
          continue;
        }
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) consider(n);
          else if (n instanceof HTMLElement) {
            n.querySelectorAll && n.querySelectorAll("img").forEach(consider);
          }
        });
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      reject(new Error(`새 결과 이미지 timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("blob base64 변환 실패"));
    reader.readAsDataURL(blob);
  });
}

async function resolveImageAssetFromElement(img) {
  const src = img?.src;
  if (!src) throw new Error("이미지 src 없음");
  if (src.startsWith("blob:")) {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`blob 이미지 읽기 실패 (${resp.status})`);
    const blob = await resp.blob();
    return {
      image_base64: await blobToBase64(blob),
      image_mime: blob.type || "image/png",
    };
  }
  return { image_url: src };
}

function waitForNewResultAsset(prevImgSet, prevCanvasCount, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const seenSrc = new Set();
    const seenCanvas = new WeakSet();

    const finish = (result) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };

    const fail = (error) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      reject(error);
    };

    const considerCanvas = async (canvas) => {
      if (done || !(canvas instanceof HTMLCanvasElement) || seenCanvas.has(canvas)) return;
      const w = canvas.width || canvas.clientWidth || 0;
      const h = canvas.height || canvas.clientHeight || 0;
      if (w < 200 || h < 200) return;
      seenCanvas.add(canvas);
      try {
        finish({ image_base64: canvasToBase64(canvas), image_mime: "image/png" });
      } catch (e) {
        console.warn("[Flow Bridge] canvas base64 실패", e);
      }
    };

    const considerImg = async (img) => {
      if (done || !(img instanceof HTMLImageElement) || !isLikelyResultImg(img)) return;
      const src = img.src;
      if (!src || prevImgSet.has(src) || seenSrc.has(src)) return;
      const settle = async () => {
        if (done || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
        seenSrc.add(src);
        try {
          finish(await resolveImageAssetFromElement(img));
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      };
      if (img.complete) settle();
      else img.addEventListener("load", settle, { once: true });
    };

    const scan = () => {
      const canvases = document.querySelectorAll("canvas");
      if (canvases.length > prevCanvasCount) {
        canvases.forEach((canvas, idx) => {
          if (idx >= prevCanvasCount) considerCanvas(canvas);
        });
      }
      document.querySelectorAll("img").forEach((img) => considerImg(img));
    };

    scan();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target instanceof HTMLImageElement) {
          considerImg(m.target);
          continue;
        }
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) considerImg(n);
          else if (n instanceof HTMLCanvasElement) considerCanvas(n);
          else if (n instanceof HTMLElement) {
            n.querySelectorAll?.("img").forEach((img) => considerImg(img));
            n.querySelectorAll?.("canvas").forEach((canvas) => considerCanvas(canvas));
          }
        });
      }
      scan();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const timer = setTimeout(() => {
      fail(new Error(`새 결과 이미지 timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

// --- 스타일 참조 이미지를 Flow 프롬프트 입력창에 첨부 ---
function getPromptComposerRoot() {
  const editor = findPromptEditor();
  if (!editor) return document.body;
  const byClass = editor.closest(
    "form, [role='form'], [data-testid*='composer'], [class*='composer'], [class*='prompt']"
  );
  if (byClass) return byClass;
  // 창이 작아 클래스 매칭이 실패해도 body 까지 떨어지지 않도록, 에디터에서
  // 위로 올라가며 버튼을 포함하는 첫 조상을 composer 로 간주한다.
  // (body 로 떨어지면 첨부 indicator / asset key 판정이 전부 무력화된다.)
  let node = editor.parentElement;
  for (let i = 0; i < 6 && node && node !== document.body; i++, node = node.parentElement) {
    if (node.querySelector("button, [role='button']")) return node;
  }
  return document.body;
}

function isUsableImageFileInput(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.type !== "file") return false;
  if (input.disabled) return false;
  const accept = (input.getAttribute("accept") || "").toLowerCase();
  return !accept || accept.includes("image") || accept.includes("png") || accept.includes("jpg") || accept.includes("jpeg") || accept.includes("webp");
}

function findFlowImageFileInput() {
  // 에셋 dialog 가 열려있으면 그 안의 input 을 **절대 우선**.
  // dialog 바깥의 stale input 에 파일 주입하면 Flow 가 업로드로 인식 못 하고 dialog 닫힘.
  const openDlg = findOpenFlowDialog();
  const composer = getPromptComposerRoot();

  const collectUnique = (roots) => {
    const result = [];
    for (const root of roots) {
      root.querySelectorAll('input[type="file"]').forEach((el) => {
        if (!result.includes(el)) result.push(el);
      });
    }
    return result.filter(isUsableImageFileInput);
  };

  // 1순위: dialog 내부의 input
  if (openDlg) {
    const dlgInputs = collectUnique([openDlg]);
    if (dlgInputs.length > 0) {
      return dlgInputs[0];
    }
  }

  // 2순위: composer 또는 document 전체 (dialog 닫힌 상태에서)
  const otherInputs = collectUnique([composer, document]);
  const scored = otherInputs
    .map((input) => {
      let score = 0;
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      if (accept.includes("image")) score += 6;
      if (composer.contains(input)) score += 10;
      if (isVisible(input)) score += 4;
      if (!input.multiple) score += 1;
      return { input, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.input || null;
}

function countAttachmentIndicators() {
  // Flow는 첨부 UI를 composer 밖(dialog portal / form sidebar)에 렌더하는 경우가 있어
  // document 전체를 스캔한다. (composer 내부만 감시하면 attached=false 로 영원히 남음)
  const selectors = [
    '[data-testid*="attachment"]',
    '[class*="attachment"]',
    '[class*="upload"]',
    '[class*="chip"]',
    'button[aria-label*="remove" i]',
    'button[aria-label*="삭제" i]',
    'button[aria-label*="첨부" i]',
    'img[src^="blob:"]',
    'img[src*="googleusercontent"]',
  ];

  let count = 0;
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      if (el instanceof HTMLElement && isVisible(el)) count += 1;
    });
  }
  return count;
}

// composer 내부만 세는 첨부 indicator. 문서 전체 스캔(countAttachmentIndicators)은
// 가상 스크롤 갤러리의 썸네일 개수가 스크롤로 변하면서 before/after 비교가 오염돼
// "첨부 성공했는데 실패로 판정"되는 문제가 있어, 드래그 첨부 판정은 이것을 우선한다.
function countComposerAttachmentIndicators() {
  const composer = getPromptComposerRoot();
  if (!composer || composer === document.body) return 0;
  const selectors = [
    '[data-testid*="attachment"]',
    '[class*="attachment"]',
    '[class*="chip"]',
    'button[aria-label*="remove" i]',
    'button[aria-label*="삭제" i]',
    "img",
  ];
  let count = 0;
  for (const selector of selectors) {
    composer.querySelectorAll(selector).forEach((el) => {
      if (el instanceof HTMLElement && isVisible(el)) count += 1;
    });
  }
  return count;
}

// 드래그한 갤러리 이미지(asset key)가 composer 안 썸네일로 나타났는지 검사.
// key 까지 일치하면 가장 확실한 첨부 성공 신호다.
function composerHasAssetKey(key) {
  if (!key) return false;
  const composer = getPromptComposerRoot();
  if (!composer || composer === document.body) return false;
  for (const im of composer.querySelectorAll("img")) {
    if (!(im instanceof HTMLElement)) continue;
    // 작은 창에서는 첨부 칩 썸네일이 레이아웃상 숨겨질 수 있어 가시성은 따지지
    // 않는다 — composer 내부에 key 일치 img 가 존재한다는 것 자체가 첨부 증거.
    if (extractFlowAssetKey(im.currentSrc || im.src || "") === key) return true;
  }
  return false;
}

function findFlowAttachButton() {
  const composer = getPromptComposerRoot();
  // 이미 열려 있는 dialog 안에 있는 요소는 "시작" 트리거 후보에서 제외
  // (그 안에는 "이미지 업로드" 같은 dialog 내부 버튼이 있어 오탐됨).
  const openDlg = findOpenFlowDialog();

  // 후보 수집은 composer 내부로 한정. document 전체 스캔은 "미디어 추가" 같은
  // 무관 버튼을 섞어 점수 경쟁을 왜곡시켜서 오히려 해악.
  const rawCandidates = [
    ...composer.querySelectorAll(
      "button, [role='button'], [aria-haspopup='dialog'], [aria-haspopup='menu'], div[type='button']"
    ),
  ];
  const candidates = Array.from(new Set(rawCandidates))
    .filter((el) => el instanceof HTMLElement && isVisible(el))
    .filter((el) => !openDlg || !openDlg.contains(el));

  const scored = candidates
    .map((btn) => {
      const plainText = normalizeText(btn.textContent || "");
      const lowerText = plainText.toLowerCase();
      const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
      const title = (btn.getAttribute("title") || "").toLowerCase();
      const fullText = `${lowerText} ${ariaLabel} ${title}`;
      const iconText = btn.querySelector("i, span")?.textContent?.trim()?.toLowerCase() || "";
      const hasPopup = btn.getAttribute("aria-haspopup");
      const hasRadixControls = !!btn.getAttribute("aria-controls");
      let score = 0;

      // ① 가장 강한 시그널: aria-haspopup="dialog" + Radix aria-controls.
      //    이게 바로 Flow 의 "시작/끝" 프레임 트리거 구조.
      //    첨부 후 썸네일 상태로 바뀌어 텍스트가 사라져도 이 시그널은 유지된다.
      if (hasPopup === "dialog" && hasRadixControls) score += 30;
      else if (hasPopup === "dialog") score += 12;

      // ② 텍스트 시그널 (있으면 가점, 없어도 ①로 식별 가능)
      if (/^시작$|^첫\s*프레임$|^start\s*frame$|^first\s*frame$|^start$/.test(plainText)) score += 25;
      if (/^끝$|^마지막\s*프레임$|^end\s*frame$|^last\s*frame$|^end$/.test(plainText)) score += 20;
      if (/시작\s*프레임|start\s*frame|첫\s*프레임/.test(fullText)) score += 15;

      // ③ composer 내부면 가중치
      if (composer.contains(btn)) score += 5;

      // ④ ❌ 감점: 업로드/생성/편집/추가 류 텍스트는 "시작" 버튼이 아님
      //    특히 dialog 내부의 "이미지 업로드" 버튼이 composer 영역으로 오탐되는 경우를 차단.
      if (/업로드|upload/.test(lowerText)) score -= 40;
      if (/생성|만들기|만들어|create|generate|remix|편집|edit|new\s*image/.test(lowerText)) score -= 30;
      if (/^\+$|^add$|미디어\s*추가|add\s*media/.test(lowerText)) score -= 25;

      // ⑤ 아이콘 감점 — upload/add 아이콘을 가진 버튼은 시작 버튼이 아님
      if (iconText === "upload" || iconText === "add" || iconText === "add_photo_alternate") score -= 15;

      return { btn, score, plainText };
    })
    .filter((entry) => entry.score > 10) // 문턱 상향
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    console.log(
      `[Flow Bridge] 첨부 트리거 후보: "${scored[0].plainText || "(텍스트 없음)"}" score=${scored[0].score}`
    );
  } else {
    console.warn("[Flow Bridge] 첨부 트리거 후보를 찾지 못함 (composer 내부 스캔 0건)");
  }
  return scored[0]?.btn || null;
}

// [캐릭터 공방] 이미지 모드 composer 의 "+ / 미디어 추가 / 이미지 추가 / 첨부 / 소재 추가" 버튼
function findFlowAddMediaButton() {
  const composer = getPromptComposerRoot();
  const openDlg = findOpenFlowDialog();
  const cands = Array.from(composer.querySelectorAll("button, [role='button'], [aria-haspopup='dialog'], [aria-haspopup='menu'], div[type='button']"))
    .filter((el) => el instanceof HTMLElement && isVisible(el))
    .filter((el) => !openDlg || !openDlg.contains(el));
  let best = null, bestScore = 0;
  for (const btn of cands) {
    const text = normalizeText(btn.textContent || "").toLowerCase();
    const aria = ((btn.getAttribute("aria-label") || "") + " " + (btn.getAttribute("title") || "")).toLowerCase();
    const icon = btn.querySelector("i, span")?.textContent?.trim()?.toLowerCase() || "";
    let score = 0;
    if (/^\+$/.test(text)) score += 20;
    if (/미디어\s*추가|add\s*media|이미지\s*추가|add\s*image|첨부|attach|소재\s*추가|ingredient|참조|reference|업로드|upload/.test(text + " " + aria)) score += 25;
    if (icon === "add" || icon === "add_photo_alternate" || icon === "attach_file" || icon === "upload" || icon === "image") score += 15;
    if (btn.getAttribute("aria-haspopup")) score += 5;
    if (/생성|만들기|create|generate|보내기|submit|send|arrow_forward/.test(text + " " + aria + " " + icon)) score -= 40;
    if (score > bestScore) { best = btn; bestScore = score; }
  }
  if (best) console.log(`[Flow Bridge] 미디어 추가 후보: "${normalizeText(best.textContent || "") || best.getAttribute("aria-label") || "(텍스트 없음)"}" score=${bestScore}`);
  return bestScore >= 15 ? best : null;
}

async function clickLikeUser(el) {
  if (!(el instanceof HTMLElement)) return;
  try { el.scrollIntoView({ block: "center" }); } catch {}
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // 단순 pointer + mouse 체인. composed:true / hover 이벤트는 제외 —
  // Radix / Next.js 와 과도하게 간섭하면 "client-side exception" 크래시 유발.
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
  el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
  el.click();
  await SLEEP(200);
}

// ============================================================
// CDP (Chrome DevTools Protocol) 기반 진짜 사용자 이벤트 주입.
// background.js 의 chrome.debugger 로 Input.dispatchMouseEvent / Input.insertText
// 를 호출한다. isTrusted=true 이벤트라 Radix / Slate / Next.js 모두 수동 조작과
// 동일하게 반응. "Application error: client-side exception" 크래시 회피용.
// ============================================================
async function cdpClickElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  try { el.scrollIntoView({ block: "center" }); } catch {}
  await SLEEP(60);
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  try {
    const resp = await chrome.runtime.sendMessage({ type: "CDP_CLICK", x, y });
    if (resp?.ok) return true;
    console.warn("[Flow Bridge] CDP_CLICK 실패, 폴백 clickLikeUser:", resp?.error);
  } catch (e) {
    console.warn("[Flow Bridge] CDP_CLICK 메시지 실패, 폴백:", e?.message || e);
  }
  // 폴백: 기존 dispatchEvent 방식
  await clickLikeUser(el);
  return true;
}

// 에디터 element 에 포커스 맞춘 뒤 CDP 로 텍스트 삽입.
// background 에게 "x,y 클릭 + clearEditor + insertText" 를 한 번의 메시지로 위임.
// focus 검증 같은 중간 체크로 성공 판정을 실패로 뒤집는 일은 하지 않는다.
async function cdpTypeIntoEditor(el, text) {
  if (!(el instanceof HTMLElement)) return false;
  try { el.scrollIntoView({ block: "center" }); } catch {}
  await SLEEP(120);

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    console.warn("[Flow Bridge] cdpTypeIntoEditor: 에디터 bounding rect 가 0");
    return false;
  }
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "CDP_TYPE",
      x,
      y,
      text: String(text || ""),
      clearFirst: true,
    });
    if (resp?.ok) {
      // 진단용 focus 체크 (판정은 하지 않음, 실패해도 주입은 시도됨)
      const active = document.activeElement;
      const focusOK = active === el || (active instanceof HTMLElement && el.contains(active));
      console.log(
        `[Flow Bridge] cdpTypeIntoEditor: 주입 요청 완료 (${(text || "").length}자, focusOK=${focusOK}, activeTag=${active?.tagName?.toLowerCase() || "?"})`
      );
      return true;
    }
    console.warn("[Flow Bridge] cdpTypeIntoEditor: CDP_TYPE 응답 실패:", resp?.error);
  } catch (e) {
    console.warn("[Flow Bridge] cdpTypeIntoEditor: CDP_TYPE 메시지 실패:", e?.message || e);
  }
  return false;
}

// dialog 안에서 "이미지 업로드" 버튼을 정확히 찾는다.
// Flow 실제 구조:
//   <div class="sc-...">                       ← 클릭 타겟 (wrapper)
//     <div><i class="google-symbols">upload</i></div>
//     <div>이미지 업로드</div>
//   </div>
function findDialogUploadButton() {
  const dlg = findOpenFlowDialog();
  if (!dlg) return null;

  // 1) "upload" 머티리얼 아이콘을 가진 요소의 최소 클릭 wrapper
  const icons = Array.from(
    dlg.querySelectorAll("i.google-symbols, span.google-symbols, [class*='google-symbols']")
  );
  for (const icon of icons) {
    if (!(icon instanceof HTMLElement) || !isVisible(icon)) continue;
    const iconText = (icon.textContent || "").trim().toLowerCase();
    if (iconText !== "upload" && iconText !== "add_photo_alternate" && iconText !== "attach_file") continue;
    // 아이콘의 조상 중 "업로드/upload" 텍스트를 포함하는 **가장 가까운** wrapper 찾기.
    let el = icon.parentElement;
    while (el && el !== dlg) {
      const txt = normalizeText(el.textContent || "").toLowerCase();
      if (/업로드|upload/.test(txt) && txt.length < 30 && isVisible(el)) {
        return el;
      }
      el = el.parentElement;
    }
  }

  // 2) 텍스트 기반 폴백: "이미지 업로드" 정확 매칭
  const nodes = Array.from(dlg.querySelectorAll("button, [role='button'], div, li, a"));
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
    const txt = normalizeText(node.textContent || "").toLowerCase();
    if (!txt || txt.length > 30) continue;
    if (!/^이미지\s*업로드$|^image\s*upload$|^upload\s*image$|^내\s*컴퓨터(에서)?$|^from\s*(computer|device|file)$|^파일\s*선택$|^choose\s*file$/.test(txt)) continue;
    if (/생성|만들기|create|generate|edit|remix/.test(txt)) continue;
    return node;
  }
  return null;
}

async function openImageUploadMenuIfNeeded() {
  if (findFlowImageFileInput()) return;

  // dialog 는 이미 호출부에서 "시작" 버튼 클릭으로 열어놓은 상태여야 한다.
  // ⚠ 여기서 findFlowAttachButton() 을 다시 부르면 "시작" 버튼이 반환되고,
  //   재클릭 시 Radix dialog 가 토글로 닫혀 흐름이 망가진다. 호출 금지.
  const uploadBtn = findDialogUploadButton();
  if (!uploadBtn) {
    // 혹시 dialog 가 자동으로 input 을 노출하는 변종이면 input 이 곧 나타날 수 있음
    const quickInput = await waitFor(() => findFlowImageFileInput(), 1200, 100).catch(() => null);
    if (quickInput) return;
    throw new Error("dialog 안에서 '이미지 업로드' 버튼을 찾지 못함");
  }

  console.log(`[Flow Bridge] 업로드 버튼 클릭: "${normalizeText(uploadBtn.textContent || "")}"`);
  await clickLikeUser(uploadBtn);
  await SLEEP(400);
}

async function waitForStyleAttachment(beforeCount, timeoutMs = 12000) {
  await waitFor(() => {
    const input = findFlowImageFileInput();
    if (input?.files?.length) return true;
    return countAttachmentIndicators() > beforeCount;
  }, timeoutMs, 200);
}

// ⚠ Flow 동작 특성:
//   - 에셋에 이미 있는 이미지 → 즉시 첨부 슬롯에 들어감
//   - PC 업로드(= 우리 경로)는 Flow가 내부적으로 에셋화(복제 생성) 수행.
//     이 과정이 저화질 기준 ~12초, 고화질은 더 걸린다.
//     완료 전에 Submit 하면 첨부 없이 영상이 생성돼 이미지가 반영되지 않는다.
//
// 완료 신호(세 가지 모두 stableMs 동안 유지되어야 함):
//   1) 첨부 indicator가 증가한 상태
//   2) composer 영역에 로딩/progress/generating 인디케이터가 없음
//   3) composer 안의 <img> 중 src="blob:..."인 것이 없음 (= 모두 최종 URL로 전환)
async function waitForStyleAttachmentStable(beforeCount, timeoutMs = 90000, stableMs = 2000) {
  const start = Date.now();
  // 감시 범위 확장: dialog/portal 에 렌더되는 요소도 포함.
  const BUSY_SELECTOR = [
    '[aria-busy="true"]',
    '[role="progressbar"]',
    '[class*="loading" i]',
    '[class*="spinner" i]',
    '[class*="uploading" i]',
    '[class*="generating" i]',
    '[class*="processing" i]',
  ].join(",");

  let stableStart = null;
  let lastLog = 0;
  while (Date.now() - start < timeoutMs) {
    const indicators = countAttachmentIndicators();
    const attached = indicators > beforeCount;
    const busy = !!document.querySelector(BUSY_SELECTOR);
    const blobImgs = document.querySelectorAll('img[src^="blob:"]');
    const hasBlob = blobImgs.length > 0;

    if (attached && !busy && !hasBlob) {
      if (stableStart === null) stableStart = Date.now();
      else if (Date.now() - stableStart >= stableMs) return;
    } else {
      stableStart = null;
    }

    // 진행 상황 로그 (1초 간격)
    const now = Date.now();
    if (now - lastLog > 1000) {
      console.log(
        `[Flow Bridge] 첨부 대기: attached=${attached} busy=${busy} blobImgs=${blobImgs.length} elapsed=${Math.round((now - start) / 1000)}s`
      );
      lastLog = now;
    }

    await SLEEP(300);
  }
  throw new Error(
    `스타일 이미지 에셋화 완료 대기 timeout (${timeoutMs}ms). Flow가 이미지 업로드/복제를 끝내지 못했습니다.`
  );
}

// 현재 열려 있는 첨부/에셋 dialog 를 반환 (없으면 null).
function findOpenFlowDialog() {
  return (
    document.querySelector("[role='dialog'][data-state='open']") ||
    document.querySelector("[role='dialog']:not([hidden])") ||
    null
  );
}

// dialog 가 열려 있으면 ESC + 바깥 클릭으로 강제 종료.
// Radix 기반 dialog 는 같은 트리거를 재클릭해도 토글로 닫히기 때문에,
// 이전 잡이 남긴 열린 dialog 를 그대로 두면 다음 잡의 "시작" 클릭이 오히려 dialog 를 닫아 실패한다.
async function closeOpenFlowDialogIfAny(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const dlg = findOpenFlowDialog();
    if (!dlg) return true;
    // ESC
    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(esc);
    (document.activeElement || document.body).dispatchEvent(esc);
    await SLEEP(250);
    if (!findOpenFlowDialog()) return true;
    // 바깥 클릭 (body 왼쪽 상단)
    try {
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 2, clientY: 2, button: 0 });
      document.body.dispatchEvent(ev);
      document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: 2, clientY: 2, button: 0 }));
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 2, clientY: 2, button: 0 }));
    } catch {}
    await SLEEP(300);
  }
  return !findOpenFlowDialog();
}

// URL 에서 매칭용 핵심 ID 를 뽑는다.
// Flow 에셋 카드 src 형태:
//   /fx/api/trpc/media.getMediaUrlRedirect?name=<UUID>      → <UUID> 반환
//   https://lh3.googleusercontent.com/<id>=s96-c            → <id> 반환
// 엄격 매칭을 위해 충분히 긴 ID(= UUID 또는 Flow 미디어 해시)만 인정.
function extractFlowAssetKey(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url, location.href);
    // 1) Flow 내부 API: ?name=<UUID>
    const nameParam = u.searchParams.get("name");
    if (nameParam && nameParam.length >= 24) return nameParam;
    // 2) CDN path 기반: 마지막 세그먼트에서 =suffix 제거
    const segs = u.pathname.split("/").filter(Boolean);
    let key = segs[segs.length - 1] || "";
    key = key.split("=")[0];
    if (key.length < 24) return null;
    return key;
  } catch {
    return null;
  }
}

// 캔버스(=dialog 밖) 갤러리는 가상 스크롤이라 한 번에 일부 이미지만 DOM 에
// 렌더된다 (예: 90장 중 19장만 존재). 맨 아래에 있는 타깃을 찾으려면 스크롤하며
// 스캔해야 한다. 가장 많은 img 를 품은 세로 스크롤 컨테이너를 고른다.
function findGalleryScrollContainer() {
  const imgs = Array.from(document.querySelectorAll("img")).filter((im) => isVisible(im));
  const counts = new Map();
  for (const img of imgs) {
    let node = img.parentElement;
    while (node && node !== document.body) {
      const oy = window.getComputedStyle(node).overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 50) {
        counts.set(node, (counts.get(node) || 0) + 1);
        break;
      }
      node = node.parentElement;
    }
  }
  let best = null, bestCount = 0;
  for (const [node, c] of counts) if (c > bestCount) { best = node; bestCount = c; }
  return best; // null 이면 window 스크롤로 폴백
}

// 갤러리를 맨 아래부터 위로 스크롤하며 scanFn() 으로 타깃을 찾는다. 찾으면 즉시
// 반환. 가상 리스트가 새 항목을 렌더할 시간을 매 단계 SLEEP 으로 확보한다.
// 영상에 붙일 소스 이미지는 "가장 먼저 만든 것"= 갤러리 맨 아래(가장 오래된)에
// 있을 가능성이 높아, 바닥에서 시작해 위로 올라오며 훑으면 보통 더 빨리 찾는다.
async function scrollGalleryToFind(scanFn, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  const c = findGalleryScrollContainer();
  const se = document.scrollingElement || document.documentElement;
  const getTop = () => (c ? c.scrollTop : se.scrollTop);
  const setTop = (v) => { if (c) c.scrollTop = v; else window.scrollTo(0, v); };
  const viewH = () => (c ? c.clientHeight : window.innerHeight);
  const maxTop = () => (c ? c.scrollHeight - c.clientHeight : se.scrollHeight - window.innerHeight);

  // 맨 아래(가장 오래된 이미지)로 점프해서 거기서부터 스캔 시작.
  setTop(maxTop());
  await SLEEP(300); // 바닥 항목 렌더 대기
  let hit = scanFn();
  if (hit) return hit;

  let lastTop = -1;
  while (Date.now() < deadline) {
    const cur = getTop();
    if (cur <= 0 || cur === lastTop) break; // 맨 위 도달 or 더 못 올라감
    lastTop = cur;
    setTop(Math.max(0, cur - Math.max(200, viewH() * 0.85)));
    await SLEEP(280); // 가상 리스트 렌더 대기
    hit = scanFn();
    if (hit) return hit;
  }
  // 맨 위에서 한 번 더 확인 (위로 다 올라온 직후 렌더가 늦었을 수 있음)
  if (getTop() <= 2) {
    await SLEEP(200);
    hit = scanFn();
    if (hit) return hit;
  }
  return null;
}

// "시작" dialog 의 에셋 리스트에서 scene.imageUrl 과 동일한 이미지를 찾는다.
// ⚠ 오매칭 방지를 위해 "key 완전 일치"만 허용.
//    부분 문자열 매칭(includes)은 서로 다른 이미지가 공통 prefix 를 가질 경우
//    엉뚱한 에셋을 선택할 위험이 있어 사용하지 않는다.
//    매칭이 실패하면 안전하게 업로드 경로로 폴백된다.
async function findExistingAssetByUrl(imageUrl, timeoutMs = 4000) {
  const targetKey = extractFlowAssetKey(imageUrl);
  if (!targetKey) return null;
  return findExistingAssetByKey(targetKey, timeoutMs);
}

// 캔버스/dialog 에서 정확히 이 Flow asset key 를 가진 img 의 클릭 카드를 반환.
async function findExistingAssetByKey(targetKey, timeoutMs = 4000) {
  if (!targetKey) return null;
  const scan = (root) => {
    const imgs = Array.from(root.querySelectorAll("img")).filter((img) => isVisible(img));
    for (const img of imgs) {
      const src = img.currentSrc || img.src || "";
      const key = extractFlowAssetKey(src);
      if (!key || key !== targetKey) continue;
      // 완전 일치 — 이 img 를 감싸는 클릭 가능한 카드 찾기
      const card =
        img.closest("[role='option'], [role='gridcell'], [role='listitem'], button, li, article") ||
        img.closest("div");
      if (card instanceof HTMLElement && isVisible(card)) {
        // img 가 단일인 상위를 우선 (리스트 전체 컨테이너 회피)
        let best = card;
        let node = img.parentElement;
        while (node && node !== root) {
          const imgCount = node.querySelectorAll("img").length;
          if (imgCount === 1) { best = node; break; }
          node = node.parentElement;
        }
        return best;
      }
    }
    return null;
  };
  const dlg =
    document.querySelector("[role='dialog'][data-state='open']") ||
    document.querySelector("[role='dialog']:not([hidden])");
  if (dlg) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = scan(dlg);
      if (hit) return hit;
      await SLEEP(250);
    }
    return null;
  }
  // 캔버스(dialog 없음): 가상 스크롤 갤러리를 위→아래로 훑으며 찾는다.
  return await scrollGalleryToFind(() => scan(document), timeoutMs);
}

// "시작" dialog 의 에셋 중에서 "이 prompt 로 만든 이미지"를 찾아 클릭 타겟으로 반환.
// SF_NET.assetKeyToPrompt 에 네트워크 응답 시점에 캐시해 둔 (asset key → prompt) 를
// 역조회한다. 같은 페이지 세션에서 만든 이미지는 fifeUrl 이 그대로 dialog img.src
// 에 노출되므로 키 일치만 보면 된다. 페이지 새로고침 후엔 캐시가 비어 있어 자연
// 스럽게 null 반환 → 호출자가 다음 매칭 단계로 폴백한다.
// 한 <img> 가 어떤 prompt 로 만들어졌는지 알 수 있는 모든 후보 문자열을 모은다.
//   1) SF_NET 네트워크 캐시 (asset key → prompt) — 같은 세션 캡처분
//   2) DOM 속성: img.alt / aria-label / title, 그리고 카드의 aria-label / title /
//      figcaption·caption·prompt 류 텍스트 — 새로고침 후 캐시가 비어도 동작.
function sfPromptCandidatesForImg(img) {
  const out = [];
  const key = extractFlowAssetKey(img.currentSrc || img.src || "");
  if (key) {
    const cached = SF_NET.assetKeyToPrompt.get(key);
    if (cached) out.push(cached);
  }
  const attrs = [img.getAttribute("alt"), img.getAttribute("aria-label"), img.getAttribute("title")];
  const card = img.closest(
    "[role='option'], [role='gridcell'], [role='listitem'], button, li, article, figure"
  );
  if (card) {
    attrs.push(card.getAttribute("aria-label"), card.getAttribute("title"));
    const cap = card.querySelector("figcaption, [class*='caption'], [class*='prompt']");
    if (cap) attrs.push(cap.textContent);
  }
  for (const a of attrs) {
    const n = sfPromptKey(a || "");
    if (n) out.push(n);
  }
  return out;
}

async function findExistingAssetByPrompt(targetPrompt, timeoutMs = 3000) {
  const target = sfPromptKey(targetPrompt);
  if (!target) return null;
  const scan = (root) => {
    const imgs = Array.from(root.querySelectorAll("img")).filter((img) => isVisible(img));
    for (const img of imgs) {
      const candidates = sfPromptCandidatesForImg(img);
      // 앞 500자 완전 일치(sfPromptKey)만 허용 (전역 프롬프트 합성 때문에 substring 부분일치는 오매칭 위험).
      if (!candidates.some((c) => c === target)) continue;
      // prompt 일치 — 이 img 를 감싸는 클릭 가능한 카드 찾기 (URL 매칭과 동일 로직)
      const card =
        img.closest("[role='option'], [role='gridcell'], [role='listitem'], button, li, article") ||
        img.closest("div");
      if (card instanceof HTMLElement && isVisible(card)) {
        let best = card;
        let node = img.parentElement;
        while (node && node !== root) {
          const imgCount = node.querySelectorAll("img").length;
          if (imgCount === 1) { best = node; break; }
          node = node.parentElement;
        }
        return best;
      }
    }
    return null;
  };
  const dlg =
    document.querySelector("[role='dialog'][data-state='open']") ||
    document.querySelector("[role='dialog']:not([hidden])");
  if (dlg) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = scan(dlg);
      if (hit) return hit;
      await SLEEP(250);
    }
    return null;
  }
  // 캔버스(dialog 없음): 가상 스크롤 갤러리를 위→아래로 훑으며 찾는다.
  return await scrollGalleryToFind(() => scan(document), timeoutMs);
}

// 에셋 dialog에서 파일명 텍스트를 leaf 노드로 직접 찾고, 그 조상 중 role 카드를
// 클릭 타겟으로 격상한다. Flow 의 카드는 파일명 div 를 leaf 로 두고 상위 wrapper 에
// onClick 핸들러를 거는 패턴이므로, leaf 를 클릭하면 이벤트가 안 먹을 수 있다.
async function selectAssetByFilename(nameSubstring, timeoutMs = 120000) {
  const start = Date.now();
  const target = nameSubstring.toLowerCase();
  const targetShort = target.length > 10 ? target.slice(0, 10) : target;
  let lastLog = 0;

  // 카드로 격상할 때 우선순위.
  const CARD_SELECTOR =
    "[role='option'], [role='gridcell'], [role='listitem'], button, [role='button'], article, li";

  while (Date.now() - start < timeoutMs) {
    const dlg =
      document.querySelector("[role='dialog'][data-state='open']") ||
      document.querySelector("[role='dialog']:not([hidden])");
    const root = dlg || document;

    // 1) 파일명 텍스트를 직접 담은 leaf div/span 을 찾는다.
    let leafMatch = null;
    const textNodes = Array.from(root.querySelectorAll("div, span, p"));
    for (const n of textNodes) {
      if (!(n instanceof HTMLElement) || !isVisible(n)) continue;
      if (n.childElementCount !== 0) continue; // leaf 만
      const txt = normalizeText(n.textContent || "").toLowerCase();
      if (!txt || txt.length > 80) continue;
      const full = txt.includes(target);
      const short = !full && txt.includes(targetShort);
      if (full || short) {
        leafMatch = { node: n, full };
        if (full) break; // 전체 일치면 바로 확정
      }
    }

    let clickTarget = null;
    let matchKind = null;

    if (leafMatch) {
      // 조상 중 role 있는 카드로 격상
      const card = leafMatch.node.closest(CARD_SELECTOR);
      clickTarget = card || leafMatch.node.parentElement || leafMatch.node;
      matchKind = `leaf(${leafMatch.full ? "full" : "short"})`;
    } else {
      // 2) 폴백: 기존 방식 — role 카드 자체의 textContent 에 파일명 포함
      const cards = Array.from(root.querySelectorAll(CARD_SELECTOR))
        .filter((n) => n instanceof HTMLElement && isVisible(n))
        .sort((a, b) => a.childElementCount - b.childElementCount);
      for (const node of cards) {
        const txt = normalizeText(node.textContent || "").toLowerCase();
        if (!txt || txt.length > 200) continue;
        const imgEl = node.querySelector("img");
        const alt = (imgEl?.alt || "").toLowerCase();
        const title = (node.getAttribute("title") || "").toLowerCase();
        const ariaLabel = (node.getAttribute("aria-label") || "").toLowerCase();
        const combined = `${txt} ${alt} ${title} ${ariaLabel}`;
        const fullMatch = combined.includes(target);
        const shortMatch = !fullMatch && combined.includes(targetShort);
        if (!fullMatch && !shortMatch) continue;
        const imgs = node.querySelectorAll("img");
        if (imgs.length === 0 || imgs.length > 3) continue;
        clickTarget = node;
        matchKind = `card(${fullMatch ? "full" : "short"})`;
        break;
      }
    }

    if (clickTarget instanceof HTMLElement) {
      const label = normalizeText(clickTarget.textContent || "").slice(0, 50);
      const tag = clickTarget.tagName.toLowerCase();
      const role = clickTarget.getAttribute("role") || "-";
      console.log(
        `[Flow Bridge] 에셋 카드 클릭 (${matchKind}, <${tag} role=${role}>): "${label}"`
      );
      await cdpClickElement(clickTarget);

      // dialog 자연 닫힘 대기 (최대 2.5초).
      let closed = false;
      for (let i = 0; i < 12; i++) {
        await SLEEP(200);
        if (!findOpenFlowDialog()) { closed = true; break; }
      }

      // 여전히 열려 있으면 "확인/적용" 버튼이 필요한 변종일 수 있음
      if (!closed) {
        const stillOpenDlg = findOpenFlowDialog();
        if (stillOpenDlg) {
          const confirmBtn = Array.from(
            stillOpenDlg.querySelectorAll("button, [role='button'], div[type='button']")
          )
            .filter((el) => el instanceof HTMLElement && isVisible(el))
            .find((el) => {
              const t = normalizeText(el.textContent || "").toLowerCase();
              return /^확인$|^적용$|^선택$|^완료$|^추가$|^사용$|^ok$|^apply$|^add$|^use$|^done$|^select$/.test(
                t
              );
            });
          if (confirmBtn) {
            console.log(
              `[Flow Bridge] 에셋 확정 버튼 클릭: "${normalizeText(confirmBtn.textContent || "")}"`
            );
            await clickLikeUser(confirmBtn);
            await SLEEP(400);
          }
        }
      }
      return true;
    }

    // 루프 중간에 Flow 실패 카드 감지 시 즉시 실패로 종료 (120초 헛돌이 방지)
    if (isFlowFailureCardPresent()) {
      throw new Error("대기 중 Flow 실패 카드 감지 — 서버 에러로 중단");
    }

    const now = Date.now();
    if (now - lastLog > 1500) {
      const dlgFound = !!dlg;
      const imgsInRoot = root.querySelectorAll("img").length;
      console.log(
        `[Flow Bridge] 에셋 등장 대기: target="${target}" dlg=${dlgFound} imgs=${imgsInRoot} elapsed=${Math.round(
          (now - start) / 1000
        )}s`
      );
      lastLog = now;
    }
    await SLEEP(500);
  }
  throw new Error(`에셋에서 파일명 "${nameSubstring}"을(를) 찾지 못했습니다 (${timeoutMs}ms).`);
}

// Flow 가 "죄송합니다. 문제가 발생했습니다" 같은 실패 카드를 띄운 상태를 감지.
// 실패 카드가 있으면 Flow 전체 입력이 막히므로 잡을 빨리 실패 처리해야 한다.
function isFlowFailureCardPresent() {
  try {
    const candidates = Array.from(
      document.querySelectorAll("div, article, section, [role='alert']")
    );
    for (const el of candidates) {
      if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
      const txt = normalizeText(el.textContent || "");
      if (!txt || txt.length > 300) continue;
      if (/죄송합니다[. ]*문제가 발생|something went wrong|an error occurred/i.test(txt)) {
        return true;
      }
    }
  } catch {}
  return false;
}

// ============================================================
// 캔버스에 이미 있는 장면 이미지를 입력창(composer)으로 드래그해 첨부.
// dialog 열기 / PC 업로드 없이, 사용자가 손으로 끌어다 붙이는 동작을 재현한다.
// 두 가지 드래그 메커니즘을 순서대로 시도:
//   (A) CDP 진짜 마우스 드래그 (press → move 다단계 → 버튼 쥔 채 "+소재 추가"
//       슬롯 등장 대기 → 슬롯 위에서 release). isTrusted=true 라 수동과 동일.
//   (B) 합성 HTML5 DnD (dragstart→dragover→drop, 공유 DataTransfer) 폴백.
//       Flow 가 네이티브 draggable DnD 일 때 동작.
// 각 시도 후 첨부 indicator 증가로 성공 판정. 둘 다 실패하면 호출자가
// 기존 dialog+업로드 경로로 폴백한다.
// ============================================================
function getComposerDropTarget() {
  return findPromptEditor() || getPromptComposerRoot() || document.body;
}

// 캔버스 이미지를 클릭하면 composer 입력칸이 "+ 소재 추가" 드롭 슬롯으로 바뀐다.
// 그 슬롯 엘리먼트(가장 안쪽의 작은 것)를 찾아 드래그 드롭 타겟으로 쓴다.
function findAddAssetDropTarget() {
  const composer = getPromptComposerRoot() || document.body;
  const re = /소재\s*추가|에셋\s*추가|add\s*asset|미디어\s*추가|add\s*media/i;
  const matches = Array.from(
    composer.querySelectorAll("div, button, [role='button'], span, p, label")
  )
    .filter((el) => el instanceof HTMLElement && isVisible(el))
    .filter((el) => {
      const t = normalizeText(el.textContent || "");
      const aria = el.getAttribute("aria-label") || "";
      return re.test(`${t} ${aria}`);
    })
    .sort((a, b) => a.childElementCount - b.childElementCount);
  return matches[0] || null;
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), r };
}

// 캔버스(=dialog 밖)에서 scene 이미지에 해당하는 <img> 와 그 카드를 찾는다.
// findExistingAssetByUrl/Prompt 는 dialog 가 없으면 document 전체를 스캔하므로
// 그대로 재사용해 캔버스 썸네일을 찾을 수 있다.
async function findCanvasImageForScene(imageUrl, sceneId, imagePrompt) {
  if (findOpenFlowDialog()) {
    await closeOpenFlowDialogIfAny(3);
    await SLEEP(300);
  }
  // 1) scene_id → Flow asset key 매칭 — 가장 신뢰.
  //    이미지를 만들어 장면 창에 넣은 그 시점에 캡처/영속화한 key 로 캔버스의
  //    동일 이미지를 정확히 찾는다 (확장 reload 후에도 storage 에서 복원).
  let card = null;
  if (sceneId) {
    const fk = await sfLoadSceneFlowKey(sceneId);
    // 가상 스크롤 갤러리(수십~수백 장)를 위→아래로 훑어야 하므로 넉넉히 대기.
    if (fk) card = await findExistingAssetByKey(fk, 15000);
  }
  // 2) URL(=fifeUrl) 키 매칭 (source_image_url 이 Flow 네이티브 URL 인 드문 경우)
  if (!card) card = await findExistingAssetByUrl(imageUrl, 2000);
  // 3) 이미지 생성 프롬프트 매칭 — 잡에 실려온 imagePrompt 를 우선 사용하고,
  //    없으면 세션 캐시(sceneIdToImagePrompt)로 폴백.
  if (!card) {
    const targetPrompt =
      (imagePrompt && imagePrompt.trim()) ||
      (sceneId && SF_NET.sceneIdToImagePrompt.get(sceneId)) ||
      "";
    if (targetPrompt) {
      card = await findExistingAssetByPrompt(targetPrompt, 10000);
    }
  }
  if (!(card instanceof HTMLElement)) return null;
  const img = card.tagName === "IMG" ? card : card.querySelector("img");
  if (!(img instanceof HTMLElement) || !isVisible(img)) return null;
  return { card, img };
}

// (A) 합성 HTML5 DnD — 공유 DataTransfer 로 dragstart→...→drop 체인 발사.
// dragover 를 받은 Flow 가 "+소재 추가" 슬롯을 늦게 렌더하는 경우가 있어,
// 드롭 전에 슬롯 등장을 잠깐 기다렸다가 (있으면) 슬롯 위에 드롭한다.
// 로그상 성공 사례는 전부 "슬롯이 떠 있는 상태에서 슬롯에 드롭"이었다.
async function synthDragDrop(source, target) {
  const dt = new DataTransfer();
  try { dt.effectAllowed = "all"; dt.dropEffect = "copy"; } catch {}
  const s = centerOf(source);
  const t = centerOf(target);
  const fire = (el, type, x, y) => {
    const ev = new DragEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      dataTransfer: dt, clientX: x, clientY: y, view: window,
    });
    el.dispatchEvent(ev);
  };
  fire(source, "dragstart", s.x, s.y);
  fire(source, "drag", s.x, s.y);
  fire(target, "dragenter", t.x, t.y);
  fire(target, "dragover", t.x, t.y);
  let dropEl = target;
  let dp = t;
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const slot = findAddAssetDropTarget();
    if (slot && slot !== target) {
      dropEl = slot;
      dp = centerOf(slot);
      break;
    }
    await SLEEP(120);
    fire(target, "dragover", t.x, t.y);
  }
  if (dropEl !== target) {
    console.log("[Flow Bridge] 합성 DnD: '+소재추가' 슬롯 등장 — 슬롯에 드롭");
    fire(dropEl, "dragenter", dp.x, dp.y);
    fire(dropEl, "dragover", dp.x, dp.y);
  }
  fire(dropEl, "drop", dp.x, dp.y);
  fire(source, "dragend", dp.x, dp.y);
}

// (B) CDP 진짜 마우스 드래그 — background.js 의 chrome.debugger 로 위임. 2단계:
//     HOLD(누른 채 타겟까지 이동, 버튼 유지) → 슬롯 등장 폴링 → RELEASE(슬롯 위에서 놓기).
async function cdpDragHold(sx, sy, tx, ty) {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "CDP_DRAG_HOLD", sx, sy, tx, ty,
    });
    return !!resp?.ok;
  } catch (e) {
    console.warn("[Flow Bridge] CDP_DRAG_HOLD 메시지 실패:", e?.message || e);
    return false;
  }
}

async function cdpDragRelease(x, y) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "CDP_DRAG_RELEASE", x, y });
    return !!resp?.ok;
  } catch (e) {
    console.warn("[Flow Bridge] CDP_DRAG_RELEASE 메시지 실패:", e?.message || e);
    return false;
  }
}

// 첨부 실패 시점의 판정 상태를 한 줄로 덤프 — "왜 실패로 판정했는지"를
// 다음 실행 로그에서 바로 알 수 있게 한다 (뷰포트/composer/indicator/key).
async function sfDumpAttachDebug(stage, sceneId) {
  try {
    const editor = findPromptEditor();
    const composer = getPromptComposerRoot();
    const fk = sceneId ? await sfLoadSceneFlowKey(sceneId) : "";
    const cls = String(composer.className || "").slice(0, 50);
    console.warn(
      `[Flow Bridge][debug:${stage}] viewport=${window.innerWidth}x${window.innerHeight}` +
        ` editor=${editor ? editor.tagName : "없음"}` +
        ` composer=${composer === document.body ? "body(루트 못 찾음)" : `${composer.tagName}.${cls}`}` +
        ` composerInd=${countComposerAttachmentIndicators()} docInd=${countAttachmentIndicators()}` +
        ` slot=${findAddAssetDropTarget() ? "있음" : "없음"}` +
        ` key=${fk ? fk.slice(0, 10) + "…" : "없음"} keyInComposer=${fk ? composerHasAssetKey(fk) : "-"}`
    );
  } catch (e) {
    console.warn("[Flow Bridge][debug] 덤프 실패:", e?.message || e);
  }
}

async function attachByDraggingCanvasImage(imageUrl, sceneId, sceneNumber, beforeAttached, imagePrompt) {
  const found = await findCanvasImageForScene(imageUrl, sceneId, imagePrompt);
  if (!found) {
    // 진단: 왜 못 찾았는지 콘솔에 남긴다 (저장 key 유무 / 캔버스 img·key 수).
    const fk = sceneId ? await sfLoadSceneFlowKey(sceneId) : "";
    const imgs = Array.from(document.querySelectorAll("img")).filter((im) => isVisible(im));
    const keys = imgs
      .map((im) => extractFlowAssetKey(im.currentSrc || im.src || ""))
      .filter(Boolean);
    console.warn(
      `[Flow Bridge] 캔버스에서 장면 이미지를 찾지 못함 — 드래그 첨부 불가 ` +
        `(저장 FlowKey=${fk ? fk.slice(0, 12) + "…" : "없음"}, 캔버스 img=${imgs.length}, key추출=${keys.length})`
    );
    if (keys.length) {
      console.warn(
        "[Flow Bridge] 캔버스 key 샘플:",
        keys.slice(0, 6).map((k) => k.slice(0, 12) + "…")
      );
    }
    return false;
  }
  // 성공 판정 — 우선순위:
  //   ① 드래그한 이미지의 asset key 가 composer 안 썸네일로 등장 (가장 확실)
  //   ② composer 내부 첨부 indicator 증가 (갤러리 스크롤에 오염되지 않음)
  //   ③ 문서 전체 indicator 증가 (보조 — 가상 스크롤로 흔들릴 수 있음)
  const composerBefore = countComposerAttachmentIndicators();
  const srcKey = extractFlowAssetKey(found.img.currentSrc || found.img.src || "");
  const attachedNow = () =>
    composerHasAssetKey(srcKey) ||
    countComposerAttachmentIndicators() > composerBefore ||
    countAttachmentIndicators() > beforeAttached;
  const verify = () =>
    waitFor(attachedNow, 8000, 300)
      .then(() => true)
      .catch(() => false);

  // 사람 손과 동일한 제스처: 갤러리 이미지를 누른 채 프롬프트 입력창 위로 끌고
  // 가면 입력칸이 "+ 소재 추가" 드롭 슬롯으로 바뀐다. 버튼을 쥔 채 슬롯이 뜨는
  // 것을 확인한 뒤 슬롯 위에서 놓는다. (예전의 "이미지 클릭 → 슬롯 활성화" 방식은
  // 슬롯이 클릭이 아니라 드래그 중에만 나타나기 때문에 동작하지 않았다.)
  try { found.img.scrollIntoView({ block: "center" }); } catch {}
  await SLEEP(250);

  // (A) CDP 진짜 마우스 드래그 — isTrusted=true 라 수동 조작과 동일.
  // 단, CDP 좌표는 뷰포트 기준이라 창이 작아 출발/도착 지점이 화면 밖이면
  // 이벤트가 엉뚱한 곳에 떨어진다 → 그 경우 CDP 를 건너뛰고 합성 DnD 로 직행.
  const s = centerOf(found.img);
  const composerTarget = getComposerDropTarget();
  const t0 = centerOf(composerTarget);
  const inViewport = (p) =>
    p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight;
  let held = false;
  if (!inViewport(s) || !inViewport(t0)) {
    console.warn(
      `[Flow Bridge] 드래그 좌표가 뷰포트(${window.innerWidth}x${window.innerHeight}) 밖 — ` +
        `CDP 드래그 생략 (src=${s.x},${s.y} / dst=${t0.x},${t0.y})`
    );
  } else {
    console.log("[Flow Bridge] 드래그 첨부 시도 (A: CDP 마우스, 슬롯 등장 대기)");
    held = await cdpDragHold(s.x, s.y, t0.x, t0.y);
  }
  if (held) {
    // 버튼을 쥔 상태에서 "+소재 추가" 슬롯이 나타날 때까지 폴링 (최대 2.5초).
    let slot = null;
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      slot = findAddAssetDropTarget();
      if (slot) break;
      await SLEEP(120);
    }
    const t = slot ? centerOf(slot) : t0;
    console.log(
      `[Flow Bridge] 드롭 지점: ${slot ? "'+소재추가' 슬롯" : "프롬프트 입력창(슬롯 미등장)"}`
    );
    // 어떤 경우에도 버튼은 반드시 놓는다 — 안 놓으면 페이지 전체가 드래그 상태로 잠긴다.
    const released = await cdpDragRelease(t.x, t.y);
    if (!released) await cdpDragRelease(t0.x, t0.y);
    if (await verify()) {
      console.log("[Flow Bridge] 드래그 첨부 성공 (CDP 마우스)");
      await SLEEP(600);
      return true;
    }
  }

  // (B) 합성 HTML5 DnD 폴백 — Flow 가 네이티브 draggable DnD 인 경우를 커버.
  console.log("[Flow Bridge] 드래그 첨부 시도 (B: 합성 DnD)");
  const again = await findCanvasImageForScene(imageUrl, sceneId, imagePrompt);
  const src2 = again?.img || found.img;
  try { src2.scrollIntoView({ block: "center" }); } catch {}
  await SLEEP(200);
  const dropTarget2 = findAddAssetDropTarget() || getComposerDropTarget();
  try { await synthDragDrop(src2, dropTarget2); }
  catch (e) { console.warn("[Flow Bridge] 합성 DnD 오류:", e?.message || e); }
  if (await verify()) {
    console.log("[Flow Bridge] 드래그 첨부 성공 (합성 DnD)");
    await SLEEP(600);
    return true;
  }

  console.warn("[Flow Bridge] 드래그 첨부 양쪽 모두 실패 — 업로드 폴백");
  await sfDumpAttachDebug("drag-fail", sceneId);
  return false;
}

async function attachStyleImageToFlow(imageUrl, sceneId, sceneNumber, imagePrompt) {
  const beforeAttached = countAttachmentIndicators();
  const composerBeforeAll = countComposerAttachmentIndicators();

  // scene_number 기반 안정 파일명 (4자리 zero-pad). 없으면 sceneId/timestamp fallback.
  const padded = typeof sceneNumber === "number"
    ? String(sceneNumber).padStart(4, "0")
    : null;

  // NEW: 캔버스에 이미 떠 있는 장면 이미지를 입력창으로 드래그 첨부 (최우선).
  //      성공하면 dialog/업로드 경로를 아예 타지 않는다.
  try {
    if (await attachByDraggingCanvasImage(imageUrl, sceneId, sceneNumber, beforeAttached, imagePrompt)) {
      return;
    }
  } catch (e) {
    console.warn("[Flow Bridge] 드래그 첨부 경로 예외 — 업로드 폴백:", e?.message || e);
  }

  // 0) 이전 잡이 남긴 dialog 가 열려 있으면 먼저 닫는다.
  if (findOpenFlowDialog()) {
    console.warn("[Flow Bridge] 이전 dialog 가 열려 있음 — ESC로 먼저 닫음");
    await closeOpenFlowDialogIfAny(3);
    await SLEEP(300);
  }

  // 1) "시작" 버튼 눌러 에셋 dialog 열기 (CDP 로 진짜 클릭 주입)
  // [캐릭터 공방] 이미지 모드의 새 창(캔버스 비어 있음)에는 동영상용 "시작" 버튼이 없다 → "+ 미디어 추가" 류 버튼을 대신 쓴다
  let attachBtn = findFlowAttachButton();
  if (!attachBtn) { attachBtn = findFlowAddMediaButton(); if (attachBtn) console.log("[Flow Bridge] 이미지 모드 첨부 버튼(미디어 추가) 사용"); }
  if (!attachBtn) {
    // 드래그 첨부가 실제로는 성공했는데 판정만 놓친 경우, composer 가 첨부 상태로
    // 바뀌어 '시작' 버튼이 사라진다. ① composer 첨부 indicator 증가 또는
    // ② 이 장면의 Flow asset key 가 composer 안에 존재하면 첨부 완료로 간주하고
    // 업로드 경로를 건너뛴다 (잡 실패 방지 — 이후 프롬프트 입력으로 진행).
    if (countComposerAttachmentIndicators() > composerBeforeAll) {
      console.log(
        "[Flow Bridge] '시작' 버튼 없음 + composer 첨부 indicator 증가 — 드래그 첨부 완료로 간주"
      );
      return;
    }
    const fk = sceneId ? await sfLoadSceneFlowKey(sceneId) : "";
    if (fk && composerHasAssetKey(fk)) {
      console.log(
        "[Flow Bridge] '시작' 버튼 없음 + composer 에 장면 asset key 존재 — 드래그 첨부 완료로 간주"
      );
      return;
    }
    await sfDumpAttachDebug("attach-btn-missing", sceneId);
    // [캐릭터 공방] 어떤 버튼들이 있는지 오류 문구에 같이 적는다 (공방 진행 상황 로그에서 볼 수 있게)
    const seen = Array.from(document.querySelectorAll("button, [role='button']")).filter((el) => el instanceof HTMLElement && isVisible(el))
      .map((el) => (normalizeText(el.textContent || "") || el.getAttribute("aria-label") || el.getAttribute("title") || (el.querySelector("i, span")?.textContent || "").trim() || "?").slice(0, 20))
      .filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 24).join(" | ");
    const comp = getPromptComposerRoot();
    throw new Error(`Flow의 '시작' 첨부 버튼을 찾지 못함 [composer=${comp === document.body ? "body" : (comp.tagName + "." + String(comp.className).slice(0, 30))}] 보이는 버튼: ${seen}`);
  }
  await cdpClickElement(attachBtn);
  await SLEEP(500);
  if (!findOpenFlowDialog()) {
    console.warn("[Flow Bridge] dialog 가 열리지 않음 — 시작 버튼 재클릭");
    const retryBtn = findFlowAttachButton();
    if (retryBtn) {
      await cdpClickElement(retryBtn);
      await SLEEP(500);
    }
  }

  // 2) 매칭 우선순위:
  //    (a) URL 매칭 — source_image_url 자체가 Flow 네이티브 fifeUrl 인 경우
  //    (b) prompt 매칭 — 같은 세션에서 만든 이미지의 prompt 를 SF_NET 캐시에서
  //        찾아 dialog img 와 대조. 우리 result_url 은 Supabase storage 로 재업로드된
  //        URL 이라 (a) 가 거의 항상 실패하므로, 실질적인 재사용 경로는 여기다.
  //    (c) scene_number 파일명 매칭 — 과거 폴백, 사실상 매칭되지 않음
  //    (d) 업로드 폴백 — 파일명은 "NNNN.ext" (scene_number 있을 때) 또는 "sfx...ext"
  let clicked = false;

  const byUrl = await findExistingAssetByUrl(imageUrl, 3000);
  if (byUrl) {
    console.log("[Flow Bridge] 에셋 재사용 (URL 매칭)");
    await clickLikeUser(byUrl);
    clicked = true;
  } else if (sceneId && SF_NET.sceneIdToImagePrompt.has(sceneId)) {
    const targetPrompt = SF_NET.sceneIdToImagePrompt.get(sceneId);
    const byPrompt = await findExistingAssetByPrompt(targetPrompt, 3000);
    if (byPrompt) {
      console.log("[Flow Bridge] 에셋 재사용 (prompt 매칭)");
      await clickLikeUser(byPrompt);
      clicked = true;
    } else if (padded) {
      try {
        console.log(`[Flow Bridge] 에셋에 파일명 "${padded}" 존재 여부 확인`);
        await selectAssetByFilename(padded, 4000);
        console.log("[Flow Bridge] 에셋 재사용 (파일명 매칭)");
        clicked = true;
      } catch {
        // 없으면 아래 업로드 경로로 진행
      }
    }
  } else if (padded) {
    try {
      console.log(`[Flow Bridge] 에셋에 파일명 "${padded}" 존재 여부 확인`);
      await selectAssetByFilename(padded, 4000);
      console.log("[Flow Bridge] 에셋 재사용 (파일명 매칭)");
      clicked = true;
    } catch {
      // 없으면 아래 업로드 경로로 진행
    }
  }

  if (clicked) {
    // 재사용 경로: 카드 클릭 → dialog 자동 닫힘 또는 indicator 증가를 짧게 대기.
    // indicator count 는 이전 잡 썸네일 잔존으로 false negative 가능 → dialog 닫힘을 OR 조건으로.
    let ok = false;
    for (let i = 0; i < 40; i++) {  // 최대 10초
      if (!findOpenFlowDialog()) { ok = true; break; }
      if (countAttachmentIndicators() > beforeAttached) { ok = true; break; }
      await SLEEP(250);
    }
    if (ok) {
      await SLEEP(600);
      return;
    }
    // 10초 대기 후에도 확정 시그널 없음 → 업로드 폴백으로 전환
    console.warn("[Flow Bridge] 재사용 경로 확정 실패 (dialog 미닫힘 + indicator 미증가) — 업로드 폴백");
    clicked = false;
    if (findOpenFlowDialog()) {
      await closeOpenFlowDialogIfAny(3);
      await SLEEP(300);
    }
    const reopenBtn = findFlowAttachButton();
    if (reopenBtn) {
      await cdpClickElement(reopenBtn);
      await SLEEP(500);
    }
    // 아래 업로드 폴백으로 진입
  }

  // 업로드 폴백 경로
  console.log("[Flow Bridge] 에셋에 없음 — 업로드 경로로 진행");

  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`스타일 이미지 다운로드 실패 (${resp.status})`);
  const blob = await resp.blob();
  const ext = (blob.type && blob.type.split("/")[1]) || "png";
  const baseTag = padded || (() => {
    const sid = (sceneId || "x").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "x";
    const ts = Date.now().toString(36).slice(-6);
    return `sfx${sid}${ts}`;
  })();
  const fileName = `${baseTag}.${ext}`;
  const file = new File([blob], fileName, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });

  // dialog 가 에셋 매칭 시도 중 닫혔으면 다시 연다.
  if (!findOpenFlowDialog()) {
    console.warn("[Flow Bridge] 업로드 직전 dialog 닫혀있음 — 시작 버튼 재클릭");
    const reopenBtn = findFlowAttachButton();
    if (reopenBtn) {
      await cdpClickElement(reopenBtn);
      await SLEEP(500);
    }
  }

  // ⚠ 반드시 dialog 안의 정식 file input 을 사용해야 한다.
  // "이미지 업로드" 버튼 클릭은 **합성 이벤트(clickLikeUser)** 로 해야 OS file picker
  // 가 열리지 않고 hidden input 만 노출된다. CDP 로 누르면 OS picker 가 열림.
  // 항상 명시적으로 "이미지 업로드" 버튼을 누르고 dialog 내부 input 을 얻는다.
  await openImageUploadMenuIfNeeded();
  let fileInput = await waitFor(() => {
    const dlg = findOpenFlowDialog();
    if (dlg) {
      const dlgInput = Array.from(dlg.querySelectorAll('input[type="file"]'))
        .find(isUsableImageFileInput);
      if (dlgInput) return dlgInput;
    }
    return findFlowImageFileInput();
  }, 5000, 150).catch(() => null);
  if (!fileInput) throw new Error("Flow의 이미지 파일 input을 찾지 못함");

  const dt = new DataTransfer();
  dt.items.add(file);
  const fileSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
  if (fileSetter) fileSetter.call(fileInput, dt.files);
  else fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));

  console.log(`[Flow Bridge] 업로드 시작: ${fileName} — 복제 생성 대기`);

  // Flow 수동 흐름: 파일 주입 → dialog 자동 닫힘 → 시작 버튼에 "업로드 중" 표시
  //                → 복제 생성 완료 → 시작 버튼 썸네일 + 첨부 indicator 증가.
  // 우리는 에셋 카드를 따로 클릭할 필요 없이 indicator 증가만 기다리면 된다.
  // 단, 일부 변종은 dialog 를 유지한 채 카드 클릭을 요구할 수 있어 그 경우만 대응.
  await SLEEP(1500);
  if (findOpenFlowDialog()) {
    console.log("[Flow Bridge] dialog 가 아직 열림 — 에셋 카드 클릭으로 확정 시도");
    try {
      await selectAssetByFilename(baseTag, 120000);
    } catch (e) {
      console.warn(
        "[Flow Bridge] 에셋 카드 클릭 실패 — indicator 대기로 폴백:",
        e?.message || e
      );
      // 에셋 dialog 를 비워주면 indicator 가 정상 감지될 수 있으므로 닫아둔다.
      await closeOpenFlowDialogIfAny(2);
    }
  } else {
    console.log("[Flow Bridge] dialog 자동 닫힘 — 복제 생성 완료 대기");
  }

  // 첨부 indicator 증가 대기. 최대 10초만 — 실패해도 throw 하지 않는다.
  // 두 번째 잡부터는 이전 잡의 첨부 indicator 가 DOM 에 남아있어 count 가 실제로
  // 증가하지 않는 경우가 많음 (Flow 가 썸네일을 교체만 하기 때문).
  // 카드 클릭 성공/파일 주입 성공은 이미 보장된 상태라 블로킹할 필요가 없다.
  try {
    await waitFor(
      () => countAttachmentIndicators() > beforeAttached,
      10000,
      500
    );
    console.log("[Flow Bridge] 업로드 복제 생성 완료 — 첨부 확인됨");
  } catch {
    console.warn(
      "[Flow Bridge] indicator count 증가 미감지 (이전 잡 썸네일 잔존 가능성) — 진행"
    );
  }

  // 이미지 첨부 후 Flow/Slate 내부가 React 재렌더를 완료할 시간만 확보.
  // ESC 키 강제 dispatch 는 Radix dialog / Next.js 내부 상태를 깨뜨려
  // "Application error: client-side exception" 크래시를 유발하므로 사용하지 않는다.
  // findPromptEditor 는 Slate editor 를 우선 선택하므로, dialog 가 혹시 남아있어도
  // 프롬프트는 composer 의 Slate editor 로 정상적으로 들어간다.
  await SLEEP(1200);
}

// --- Right-click on canvas to open context menu, then click action ---
async function rightClickCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const ev = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 2,
    clientX: x,
    clientY: y,
  });
  canvas.dispatchEvent(ev);
  await SLEEP(500);
}

async function clickContextMenuItem(iconText) {
  const btn = findIconButton(iconText);
  if (!btn) throw new Error(`컨텍스트 메뉴 항목 (${iconText}) 못 찾음`);
  btn.click();
  await SLEEP(800);
}

// 현재 Flow 가 이미지 모드인지 동영상 모드인지 DOM 시그니처로 판정.
// 동영상 모드: "Veo" 계열 모델 드롭다운(aria-haspopup=menu) 이 보임.
// 이미지 모드: "Nano Banana", "Imagen" 등 이미지 모델 드롭다운이 보임.
// 이 판정이 성공하면 탭 슬라이더를 건드릴 필요가 없어 봇 감지 위험을 줄인다.
function detectFlowMode() {
  const buttons = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'))
    .filter((el) => el instanceof HTMLElement && isVisible(el));
  for (const btn of buttons) {
    const txt = (btn.textContent || "").toLowerCase();
    if (/nano\s*banana|imagen|gemini.*image/.test(txt)) return "image";
    if (/\bveo\b|\bvideo\b/.test(txt)) return "video";
  }
  return null;
}

// Flow 상단의 생성 모드 선택기(이미지/동영상 슬라이더)를 펼치는 버튼을 클릭.
// ⚠ crop_16_9 아이콘은 DOM 상 두 곳에 나타난다:
//   1) 진짜 슬라이더 토글 버튼 (우리가 눌러야 할 것)
//   2) "🍌 Nano Banana 2" / "Veo" 같은 모델 선택 드롭다운 내부 (aria-haspopup=menu)
// 후자를 누르면 모델 드롭다운이 열려버려 UI 가 꼬이고 Flow 가 봇 감지로
// 요청을 차단한다 ("unusual activity"). 따라서 후자를 반드시 제외.
async function openFlowModeSelector() {
  const icons = Array.from(
    document.querySelectorAll(
      "i.google-symbols, span.google-symbols, [class*='google-symbols']"
    )
  );
  const iconEl = icons.find((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const txt = (el.textContent || "").trim();
    // [교재 공방] 현재 비율에 따라 아이콘 이름이 crop_16_9 / crop_square / crop_portrait … 로 바뀌므로 crop_ 로 시작하면 전부
    if (!/^crop_/.test(txt)) return false;
    if (!isVisible(el)) return false;
    const parentBtn = el.closest("button, [role='button']");
    if (!parentBtn) return false;
    // 모델 선택 드롭다운(aria-haspopup=menu) 내부 아이콘은 제외.
    if (parentBtn.getAttribute("aria-haspopup") === "menu") return false;
    // 모델명 텍스트가 들어있는 버튼도 제외.
    const parentText = (parentBtn.textContent || "").toLowerCase();
    if (/nano\s*banana|veo|imagen|gemini/i.test(parentText)) return false;
    return true;
  });
  if (!iconEl) {
    console.warn(
      "[Flow Bridge] 슬라이더 토글용 crop_16_9 아이콘을 찾지 못함 (모델 드롭다운 내부 아이콘만 있거나 이미 펼쳐진 상태)"
    );
    return false;
  }
  const clickable =
    iconEl.closest("button, [role='button']") ||
    iconEl.parentElement ||
    iconEl;
  console.log("[Flow Bridge] 생성 모드 선택기 펼치기 (crop_16_9 클릭)");
  try {
    await cdpClickElement(clickable);
  } catch (e) {
    console.warn("[Flow Bridge] crop_16_9 CDP 클릭 실패, clickLikeUser 폴백:", e?.message || e);
    try {
      await clickLikeUser(clickable);
    } catch (e2) {
      console.warn("[Flow Bridge] crop_16_9 clickLikeUser 도 실패:", e2?.message || e2);
      return false;
    }
  }
  await SLEEP(500);
  return true;
}

// [교재 공방] 플로우 설정 팝오버의 이미지 비율 버튼(16:9 · 4:3 · 1:1 · 3:4 · 9:16)을 잡의 aspect 에 맞게 고른다.
// 팝오버가 닫혀 있으면 openFlowModeSelector 로 연다. 이미 그 비율이면 건드리지 않는다 (봇 감지 위험 최소화).
// 팝오버는 따로 닫지 않는다 — 다음 단계(프롬프트 칸 클릭)에서 저절로 닫힌다.
async function ensureAspectSelected(aspect) {
  const want = String(aspect || "").trim();
  if (!/^\d+:\d+$/.test(want)) return;
  const findBtn = () =>
    Array.from(document.querySelectorAll("button, [role='button'], [role='radio'], [role='tab'], [role='option']"))
      .filter((el) => el instanceof HTMLElement && isVisible(el))
      .find((el) => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("i, [class*='symbol']").forEach((e) => e.remove());
        return normalizeText(clone.textContent || "") === want;
      });
  const isOn = (el) =>
    el.getAttribute("data-state") === "active" || el.getAttribute("data-state") === "on" || el.getAttribute("data-state") === "checked" ||
    el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true";
  let btn = findBtn();
  if (!btn) {
    // 팝오버가 닫혀 있다. ① 예전 방식(crop_ 아이콘 단독 버튼) ② 새 UI: 프롬프트 칸의 모델 칩("🍌 Nano Banana Pro ▢ x1")을 누르면 설정 팝오버가 열린다
    let opened = await openFlowModeSelector();
    if (!opened) {
      const chip = Array.from(document.querySelectorAll("button, [role='button']"))
        .filter((el) => el instanceof HTMLElement && isVisible(el))
        .find((el) => {
          const txt = (el.textContent || "").toLowerCase();
          const hasModel = /nano\s*banana|veo|imagen|gemini/.test(txt);
          const hasIcon = !!el.querySelector("[class*='google-symbols'], [class*='symbol']") || /\bx[1-4]\b/.test(txt);
          return hasModel && hasIcon && el.closest("[role='dialog'], [role='menu']") === null;
        });
      if (chip) {
        console.log("[Flow Bridge] 모델 칩 클릭으로 설정 팝오버 열기");
        try { await cdpClickElement(chip); } catch (e) { await clickLikeUser(chip); }
        opened = true;
      }
    }
    if (!opened) throw new Error("설정 팝오버를 열지 못함");
    btn = await waitFor(() => findBtn(), 3000, 150).catch(() => null);
  }
  if (!btn) {
    await closeOpenFlowDialogIfAny(1).catch(() => {});
    throw new Error(`비율 버튼 ${want} 을 찾지 못함`);
  }
  if (isOn(btn)) {
    console.log(`[Flow Bridge] 비율 ${want} 이미 선택됨`);
  } else {
    try {
      await cdpClickElement(btn);
    } catch (e) {
      console.warn(`[Flow Bridge] 비율 ${want} CDP 클릭 실패, clickLikeUser 로 재시도:`, e?.message || e);
      await clickLikeUser(btn);
    }
    await SLEEP(350);
    console.log(`[Flow Bridge] 비율 ${want} 선택`);
  }
  // 팝오버 닫기 (ESC). 안 닫혀도 다음 단계의 프롬프트 칸 클릭으로 닫힌다
  await closeOpenFlowDialogIfAny(1).catch(() => {});
  try { chrome.storage.local.set({ lastStatus: `비율 ${want} 선택됨` }); } catch (e) {}
}

// Flow 상단의 "이미지" / "동영상" 탭을 지정한 mode 로 확실히 전환.
// 탭 구조 (Radix Tabs):
//   <button role="tab" id="radix-:r29:-trigger-IMAGE"
//           aria-controls="radix-:r29:-content-IMAGE"
//           data-state="active" class="... flow_tab_slider_trigger">
//     <i class="google-symbols">image</i>이미지
//   </button>
// 이미 원하는 탭이 활성화되어 있으면 skip. 그렇지 않으면 CDP 클릭으로 전환하고
// data-state="active" 로 활성화 확인 (합성 click 은 Radix Tabs 가 무시하는 경우 있음).
// 탭이 DOM 에 아직 없으면 openFlowModeSelector 로 먼저 슬라이더를 펼친다.
async function ensureFlowTabSelected(mode) {
  const wantImage = mode === "image";
  const label = wantImage ? "이미지" : "동영상";
  const idRegex = wantImage ? /-trigger-IMAGE$/i : /-trigger-VIDEO$/i;
  const ariaControlsRegex = wantImage ? /-content-IMAGE$/i : /-content-VIDEO$/i;
  const textRegex = wantImage ? /^이미지$|^image$/ : /^동영상$|^video$/;
  const iconRegex = wantImage ? /^image$/ : /^videocam$|^movie$|^video$|^play_arrow$/;

  const matchesTarget = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const id = el.id || "";
    if (idRegex.test(id)) return true;
    const ariaControls = el.getAttribute("aria-controls") || "";
    if (ariaControlsRegex.test(ariaControls)) return true;
    // 아이콘 텍스트 (google-symbols)
    const icon = el.querySelector("i.google-symbols, span.google-symbols, [class*='google-symbols']");
    const iconText = (icon?.textContent || "").trim().toLowerCase();
    if (iconRegex.test(iconText)) return true;
    // 아이콘 제외한 라벨 텍스트
    const clone = el.cloneNode(true);
    clone.querySelectorAll("i, [class*='symbol']").forEach((e) => e.remove());
    const txt = normalizeText(clone.textContent || "").toLowerCase();
    if (textRegex.test(txt)) return true;
    return false;
  };

  const isActive = (el) =>
    el instanceof HTMLElement &&
    (el.getAttribute("data-state") === "active" || el.getAttribute("aria-selected") === "true");

  // 0) 모델 드롭다운(🍌 Nano Banana / Veo 등)으로 현재 모드를 먼저 판정.
  //    이게 맞으면 탭 슬라이더를 건드릴 필요 없음 → 봇 감지 위험 대폭 감소.
  const detected = detectFlowMode();
  if (detected === mode) {
    console.log(`[Flow Bridge] 모델 버튼으로 ${label} 모드 확인 — 탭 전환 생략`);
    return;
  }

  // 1) 이미 원하는 탭이 활성화됐는지 확인
  const allTabs = () =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((el) => el instanceof HTMLElement && isVisible(el));
  const activeTab = allTabs().find(isActive);
  if (activeTab && matchesTarget(activeTab)) {
    console.log(`[Flow Bridge] ${label} 탭 이미 활성화 — 전환 생략`);
    return;
  }

  // 2) 타겟 탭 찾기 (flow_tab_slider_trigger 클래스가 있으면 강한 신호로 사용)
  const findTarget = () => {
    const tabs = allTabs();
    const preferred = tabs.find(
      (el) => matchesTarget(el) && /flow_tab_slider_trigger/.test(el.className || "")
    );
    return preferred || tabs.find(matchesTarget) || null;
  };
  let target = findTarget();

  // 2-a) 탭이 DOM 에 아직 없으면 생성 모드 슬라이더가 접힌 상태 — crop_16_9 클릭으로 펼침.
  if (!target) {
    const opened = await openFlowModeSelector();
    if (opened) {
      target = await waitFor(() => findTarget(), 3000, 150).catch(() => null);
      if (target) {
        console.log(`[Flow Bridge] 슬라이더 펼침 후 ${label} 탭 발견`);
      }
    }
  }

  if (!target) {
    const seenIds = allTabs().map((el) => el.id || "(no-id)").slice(0, 8);
    throw new Error(`${label} 탭을 찾지 못함 (현재 탭 id 후보: ${seenIds.join(", ")})`);
  }

  const targetLabel = normalizeText(target.textContent || "").slice(0, 20);
  const targetId = target.id || "(no-id)";
  console.log(`[Flow Bridge] ${label} 탭 클릭 시도 (id=${targetId}, label="${targetLabel}")`);

  // 3) CDP 클릭 우선 (isTrusted=true) — Radix Tabs 가 합성 click 을 씹는 경우 대비
  let clicked = false;
  try {
    await cdpClickElement(target);
    clicked = true;
  } catch (e) {
    console.warn(`[Flow Bridge] ${label} 탭 CDP 클릭 실패, clickLikeUser 로 재시도:`, e?.message || e);
  }
  if (!clicked) {
    try {
      await clickLikeUser(target);
      clicked = true;
    } catch (e) {
      throw new Error(`${label} 탭 클릭 실패: ${e?.message || e}`);
    }
  }

  // 4) 활성화 확인 — 최대 2초 대기. 실패해도 throw 하지 않음 (이미지/동영상 모드
  //    판별은 ensureVideoMode/네트워크 시그널 쪽에서도 보정하므로 한 경로 실패는 용인).
  const confirmed = await waitFor(() => isActive(target), 2000, 150).catch(() => false);
  if (confirmed) {
    console.log(`[Flow Bridge] ${label} 탭 활성화 확인`);
  } else {
    const nowActive = allTabs().find(isActive);
    console.warn(
      `[Flow Bridge] ${label} 탭 클릭 후 data-state=active 미확인 (현재 활성: id=${nowActive?.id || "?"}) — 다음 단계 진행`
    );
  }
  await SLEEP(400);
}

// --- Main job runner ---
// ============================================================
// Flow 봇 감지(unusual activity) 대응.
// Flow 는 자동화 패턴 누적 시 "We noticed some unusual activity" 에러 토스트를
// 띄우고 해당 요청을 거부한다. HTTP status 는 200 일 수도 있어서 네트워크 층
// (sfLookupPromptFailure) 만으로는 감지되지 않는 경우가 있다. DOM 의 에러
// 메시지를 직접 감시해 즉시 실패로 판정한다.
// ============================================================
function sfDetectUnusualActivityText() {
  const body = document.body;
  if (!body) return false;
  const candidates = new Set();
  const selectors = [
    "[role='alert']",
    "[role='status']",
    "[class*='Toast']", "[class*='toast']",
    "[class*='Alert']", "[class*='alert']",
    "[class*='error']", "[class*='Error']",
    "[class*='snackbar']", "[class*='Snackbar']",
  ];
  for (const sel of selectors) {
    body.querySelectorAll(sel).forEach((el) => candidates.add(el));
  }
  for (const el of candidates) {
    if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
    const txt = (el.textContent || "").toLowerCase();
    if (/unusual\s*activity|help\s*center/.test(txt)) return true;
  }
  return false;
}

// unusual activity 문구가 DOM 에 등장하면 resolve. MutationObserver 로 즉시 감지하고
// maxWaitMs 이 지나면 조용히 cleanup (Promise 는 never-resolve 상태). Promise.race
// 의 패자가 되어 winner 가 호출자에게 반환된다.
function sfWatchUnusualActivity(maxWaitMs = 180000) {
  return new Promise((resolve) => {
    let done = false;
    let observer = null;
    let timer = null;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
    };
    const finish = () => {
      if (done) return;
      cleanup();
      resolve(true);
    };
    if (sfDetectUnusualActivityText()) return finish();
    observer = new MutationObserver(() => {
      if (done) return;
      if (sfDetectUnusualActivityText()) finish();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    timer = setTimeout(() => {
      if (!done) {
        done = true;
        observer?.disconnect();
        // never-resolve: race 패자로 남음
      }
    }, maxWaitMs);
  });
}

// 봇 감지 회피용 랜덤 지터. base 에 0~spread ms 를 더함 (항상 늘리기만 함).
function sfJitter(base, spread) {
  return base + Math.floor(Math.random() * spread);
}

// 재시도 가능한 에러인지 판정.
function sfIsRetriableError(errorMsg) {
  const s = String(errorMsg || "").toLowerCase();
  return /unusual\s*activity|help\s*center|rate\s*limit|429|503|잠시\s*후|일시적|temporary|too\s*many|참조 첨부 실패/i.test(s);
}

// ============================================================
// 이미지 잡 제출 직렬화 (FIFO 락)
// 여러 이미지 잡이 동시에 typePromptIntoSlate/clickSubmit을 호출하면 서로의
// 입력을 덮어쓰고 부분 입력 상태에서 Submit이 여러 번 발동되어 Flow 가
// 잡마다 N장씩 반환하는 폭증 현상이 생긴다 (예: 3장 요청 → 25장 수신).
// → 입력 + Submit 구간만 직렬화하고, 결과 대기(waiter)는 락 밖에서 병렬 실행.
// ============================================================
let imageJobChain = Promise.resolve();
// Submit → 다음 Submit 사이 최소 간격. Slate 가 입력창을 비우고 안정화될 시간 +
// Flow 의 봇 감지(unusual activity)가 트리거되지 않도록 사람 같은 간격 확보.
const IMAGE_SUBMIT_COOLDOWN_MS = 1000;
// 프롬프트 입력 완료 → Submit 사이 대기. 너무 짧으면 자동화로 감지됨.
const IMAGE_PRE_SUBMIT_PAUSE_MS = 1000;
// 이전 잡 "타이핑 시작" → 다음 잡 "타이핑 시작" 최소 간격. background 의
// pollOnce 간격(7초)과 맞춰, 잡이 큐에 쌓여있어도 실제 주입은 7초 간격으로
// 퍼지도록 강제. Flow 의 1분 9장 rate limit 도 넉넉히 지킴.
const IMAGE_TYPING_MIN_INTERVAL_MS = 7000;
let lastImageTypingStartAt = 0;

// 재시도 래퍼: runJobOnce 가 unusual activity / rate limit 등 일시적 에러로
// 실패하면 backoff 후 자동 재시도. 사용자 중단이나 영구 에러는 재시도하지 않음.
async function runJob(job) {
  const MAX_ATTEMPTS = 3;
  // 재시도 전 대기 (누적 봇 감지 점수가 decay 되도록 충분히 길게).
  const BACKOFFS_MS = [0, 30000, 60000];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const wait = BACKOFFS_MS[attempt] ?? 60000;
      console.warn(
        `[Flow Bridge] 잡 재시도 ${attempt + 1}/${MAX_ATTEMPTS} — ${Math.round(wait / 1000)}s backoff 대기`
      );
      await SLEEP(wait);
      // 취소 체크: backoff 도중 사용자가 중단했을 수 있음
      if (SF_CANCEL.all || (job.scene_id && SF_CANCEL.sceneIds.has(job.scene_id))) {
        return { error: "사용자 중단" };
      }
    }
    const result = await runJobOnce(job);
    if (!result || !result.error) return result;
    if (!sfIsRetriableError(result.error)) {
      console.warn(`[Flow Bridge] 비재시도 에러, 포기: ${result.error}`);
      return result;
    }
    if (attempt === MAX_ATTEMPTS - 1) {
      console.warn(`[Flow Bridge] 재시도 최대 초과, 최종 실패: ${result.error}`);
      return result;
    }
    console.warn(`[Flow Bridge] 재시도 가능 에러 (${result.error}) → 재시도 예약`);
  }
}

async function runJobOnce(job) {
  await ensureInPromptScreen();

  // 이미지 잡은 기본적으로 첨부 이미지를 넣지 않는다.
  // Flow에서 첨부 이미지는 "스타일 참조"가 아니라 원본 복제/강한 참조로 작동해
  // 장면 프롬프트가 사실상 무시되는 문제가 생길 수 있다.
  // 예외: 웹앱의 "캐릭터 참조 첨부(실험적)" 토글이 켜진 잡은 source_image_url 에
  // 캐릭터 초상이 실려 오고, 프롬프트에도 참조 지시문이 포함돼 있다. 그 경우에만 첨부한다.

  if (job.job_type === "video") {
    return await runVideoJob(job);
  }

  // 이미지 탭을 확실히 선택 시도. 실패해도 throw 하지 않음.
  try {
    await ensureFlowTabSelected("image");
  } catch (e) {
    console.warn("[Flow Bridge] 이미지 탭 전환 건너뜀:", e?.message || e);
  }
  // [교재 공방] 항목마다 비율이 다르다 (캐릭터·나무 3:4, 단어 1:1, 장면 4:3). 실패해도 잡은 계속 (플로우의 현재 비율로 만들어진다)
  if (job.aspect) {
    try {
      await ensureAspectSelected(job.aspect);
    } catch (e) {
      console.warn("[Flow Bridge] 비율 선택 건너뜀:", e?.message || e);
      try { chrome.storage.local.set({ lastStatus: `비율 ${job.aspect} 선택 실패: ${e?.message || e}` }); } catch (e2) {}
    }
  }

  // 취소 체크: 시작 전
  if (SF_CANCEL.all || (job.scene_id && SF_CANCEL.sceneIds.has(job.scene_id))) {
    return { error: "사용자 중단" };
  }
  await sfWaitForRateSlot(Math.max(1, Number(job.count) || 1));
  // rate slot 대기 후 한 번 더 체크
  if (SF_CANCEL.all || (job.scene_id && SF_CANCEL.sceneIds.has(job.scene_id))) {
    return { error: "사용자 중단" };
  }

  // 제출 구간(waiter 등록 → typing → Submit)을 FIFO 락으로 직렬화.
  // waiter 는 typing/submit 전에 등록해야 응답이 빨라도 놓치지 않는다.
  const prev = imageJobChain;
  let release;
  imageJobChain = new Promise((r) => { release = r; });

  let waiter;
  try {
    try { await prev; } catch {}
    // 이전 잡의 "타이핑 시작 시점"부터 최소 7초 경과를 보장. + jitter(0~2s) 로
    // 정확히 균일한 간격이 되는 걸 피해 봇 감지를 덜 트리거.
    const minInterval = sfJitter(IMAGE_TYPING_MIN_INTERVAL_MS, 2000);
    const elapsedSinceLast = Date.now() - lastImageTypingStartAt;
    if (lastImageTypingStartAt > 0 && elapsedSinceLast < minInterval) {
      const wait = minInterval - elapsedSinceLast;
      console.log(`[Flow Bridge] 이미지 잡 min pacing 대기 ${(wait / 1000).toFixed(1)}s`);
      await SLEEP(wait);
    }
    lastImageTypingStartAt = Date.now();

    // 캐릭터 참조 첨부 (source_image_url 이 실린 이미지 잡만). 첨부 실패는
    // 치명적이지 않으므로 참조 없이 프롬프트만으로 진행한다.
    if (job.source_image_url) {
      // [캐릭터 공방] 참조는 기준 그림 장면(reference_scene_id)의 캔버스 이미지를 끌어온다. 없으면 서버 URL에서 업로드.
      // scene_number 는 넘기지 않는다 — 원본은 4자리 번호를 파일명으로 써서 다른 캐릭터의 같은 번호 에셋과 섞일 수 있다.
      try {
        // reference_asset_no: 주인(캐릭터·건물)마다 고유한 4자리 번호 → 업로드 파일 이름. 같은 창에서는 그림 창고에서 이름으로 찾아 재사용, 다른 창이면 서버 그림을 올린다
        await attachStyleImageToFlow(job.source_image_url, job.reference_scene_id || job.scene_id, typeof job.reference_asset_no === "number" ? job.reference_asset_no : null, job.source_image_prompt || null);
        console.log("[Flow Bridge] 캐릭터 참조 이미지 첨부 완료");
      } catch (e) {
        console.warn("[Flow Bridge] 캐릭터 참조 첨부 실패:", e?.message || e);
        // 참조가 필수인 잡(캐릭터 공방의 모든 후속 장면)은 참조 없이 만들면 다른 캐릭터가 나오므로 실패 처리 → 재시도
        if (job.require_reference) throw new Error(`참조 첨부 실패 (필수): ${e?.message || e}`);
      }
    }

    // 락 구간 내에서 waiter 등록 — 등록과 Submit 사이에 다른 잡이 같은
    // 에디터를 건드리지 못하도록 보장.
    waiter = sfRegisterWaiter(job.prompt, 180000, job.scene_id || null);
    await typePromptIntoSlate(job.prompt);
    // 타이핑 완료 → Submit 사이 1~1.5초 (사람이 프롬프트 검토하는 시간).
    await SLEEP(sfJitter(IMAGE_PRE_SUBMIT_PAUSE_MS, 500));
    await clickSubmit();
    // 다음 잡의 typing 이 시작되기 전에 입력창이 리셋될 시간 확보 + jitter.
    await SLEEP(sfJitter(IMAGE_SUBMIT_COOLDOWN_MS, 500));
  } catch (e) {
    release();
    return { error: `이미지 제출 실패: ${e?.message || e}` };
  }

  // 제출 성공 → 다음 잡이 제출 구간에 진입할 수 있도록 락 해제.
  // 결과 대기는 락 밖에서 병렬로 진행.
  release();

  // 결과 대기: waiter(네트워크 응답) vs unusual activity DOM 감지 vs 프롬프트별 실패.
  // 셋 중 먼저 도착하는 것으로 결정.
  const raceResult = await Promise.race([
    waiter
      .then((data) => ({ type: "result", data }))
      .catch((err) => ({ type: "error", err })),
    sfWatchUnusualActivity(180000).then(() => ({ type: "unusual" })),
    sfWaitForPromptFailure(job.prompt).then((f) => ({ type: "api_failure", ...f })),
  ]);

  if (raceResult.type === "unusual") {
    console.warn("[Flow Bridge] unusual activity 감지 — 잡 실패 처리 (재시도 대상)");
    return { error: "unusual activity — Flow 봇 감지로 요청 거부됨" };
  }
  if (raceResult.type === "api_failure") {
    console.warn(`[Flow Bridge] Flow API 실패 감지 (HTTP ${raceResult.status})`);
    return { error: `Flow 서버가 요청을 거부함 (HTTP ${raceResult.status})` };
  }
  if (raceResult.type === "error") {
    return { error: `waiter 실패: ${raceResult.err?.message || raceResult.err}` };
  }
  // 후속 동영상 잡이 같은 scene 으로 들어왔을 때 prompt 매칭으로 재업로드를
  // 건너뛸 수 있도록 (scene_id → prompt) 매핑을 캐시.
  if (job.scene_id) {
    const np = sfPromptKey(job.prompt);
    if (np) SF_NET.sceneIdToImagePrompt.set(job.scene_id, np);
    // 방금 만든 이미지의 Flow asset key 를 scene_id 에 묶어 영속화 → 후속
    // 동영상 잡이 캔버스에서 이 이미지를 정확히 key 로 찾아 드래그 첨부한다.
    const fk = extractFlowAssetKey(raceResult.data?.image_url || "");
    if (fk) {
      SF_NET.sceneIdToFlowKey.set(job.scene_id, fk);
      await sfPersistSceneFlowKey(job.scene_id, fk);
    }
  }
  return raceResult.data;
}

// ============================================================
// 동영상 잡 처리
// 순서: 모델 선택 버튼 → "동영상" 선택 → 이미지 첨부 → 프롬프트 입력 → 생성
//
// 결과 매칭 (우선순위 순):
//   1. operation 매칭 — 제출 응답이 돌려준 Flow operation 을 그 자리에서 이 잡에
//      못 박아 두고(sfClaimVideoSubmits), 완성 폴링 응답을 operation 으로 되돌린다.
//      동영상은 완성 응답에 프롬프트가 실려 있지 않아 문자열만으로는 구분이 안 되고,
//      여러 장면이 같은 공통 프롬프트를 쓰면 프롬프트로는 아예 구분이 불가능하다.
//   2. 네트워크 prompt 매칭 — operation 을 못 얻었을 때의 차선. "완전 일치"만 허용.
//   3. DOM 카드 클레임 — Submit 직후 새로 생긴 카드(card.dataset.sfJobId)의 내부
//      <video> src. 카드 클레임은 제출 순서대로(FIFO 게이트) 진행해, 앞 잡의
//      카드가 늦게 렌더돼도 뒤 잡이 가로채지 못하게 한다.
//   4. 전역 비디오 URL diff — 최후 폴백이지만 "완성 순서대로" 배분되므로,
//      동시에 대기 중인 동영상 잡이 2건 이상이면 쓰지 않는다 (오매칭 방지).
//
// ⚠ 제출 구간(모델 전환/이미지 첨부/프롬프트/Submit + 5초 쿨다운)만 FIFO 직렬.
//   결과 대기(1~5분)는 락 밖에서 병렬 실행되어 여러 잡이 동시에 "생성 중"이 된다.
//   쿨다운 5초는 이전 잡의 placeholder 카드가 DOM 에 등장해 prev snapshot 에서
//   분리되도록 보장하는 시간.
// ============================================================
let videoJobChain = Promise.resolve();
// 카드 클레임 FIFO 게이트 — 앞 잡의 클레임 시도가 끝나야(성공/포기 무관) 다음
// 잡이 클레임을 시작한다. "새 카드 = 내 카드" 가정이 깨지는 유일한 경로가
// 순서 역전이므로, 클레임 자체를 제출 순서에 묶는다.
let videoClaimChain = Promise.resolve();
// 네트워크 prompt 매칭 대기 한도. DOM 경로(클레임 60초 + 카드 내 대기 8분)보다
// 길게 잡아, 실패 판정은 DOM 경로의 타임아웃이 담당하게 한다.
const VIDEO_NET_MATCH_TIMEOUT_MS = 20 * 60 * 1000;
// Submit → 다음 Submit 사이 최소 간격. 입력창/첨부 슬롯이 확실히 리셋될 시간.
// 이전 잡의 placeholder 카드가 DOM 에 렌더되어 prev snapshot 에서 제외되는 시간도
// 겸함 — 이 시간 동안 다음 잡은 제출 구간에 진입하지 못한다.
const VIDEO_SUBMIT_COOLDOWN_MS = 5000;
// 카드가 DOM에 등장할 때까지 기다리는 최대 시간. 락 밖에서 병렬 실행.
const VIDEO_CARD_CLAIM_TIMEOUT_MS = 60000;
// 카드 클레임 실패 시 전역 비디오 URL diff 로 매칭할 때의 최대 대기 시간.
// 비디오는 실제 완성까지 수분이 걸리므로 waitForVideoInCard 와 유사하게 넉넉히 둠.
const VIDEO_GLOBAL_FALLBACK_TIMEOUT_MS = 8 * 60 * 1000;

async function runVideoJob(job) {
  // 제출 구간만 직렬화 (FIFO 락). 카드 클레임 + 결과 대기는 병렬.
  const prev = videoJobChain;
  let release;
  videoJobChain = new Promise((r) => { release = r; });

  const sceneLabel = job.scene_id ? `scene=${String(job.scene_id).slice(0, 8)}` : "scene=?";

  // 네트워크 매칭 waiter (1순위). 실패·타임아웃 시에는 race 에서 영원히 지도록
  // pending 상태로 남긴다 — 실패 판정은 DOM 경로 타임아웃이 담당.
  //
  // 반드시 "제출 전에" 등록한다. Flow 제출 응답(= 이 잡의 operation)이 waiter 등록보다
  // 먼저 도착하면 그 operation 이 아직 매칭 못 한 앞선 잡에 잘못 귀속되고,
  // 그 순간부터 두 장면의 영상이 뒤바뀐다.
  let submitted;
  let netWaiter = null;
  let netWin = new Promise(() => {});
  const cancelNetWaiter = () => { try { netWaiter?.sfCancel?.(); } catch {} };
  try {
    try { await prev; } catch {}
    netWaiter = sfRegisterWaiter(job.prompt, VIDEO_NET_MATCH_TIMEOUT_MS, job.scene_id || null, "video");
    netWin = netWaiter
      .then((d) => ({ type: "net", url: d.image_url }))
      .catch(() => new Promise(() => {}));
    submitted = await runVideoJobSubmit(job);
  } catch (e) {
    cancelNetWaiter();
    release();
    return { error: `동영상 제출 실패: ${e?.message || e}` };
  }

  // 제출 단계에서 에러가 났거나 이미 끝난 경우: 락 해제 후 즉시 반환
  if (submitted.error || submitted.done) {
    cancelNetWaiter();
    release();
    return submitted.error ? { error: submitted.error } : { image_url: submitted.image_url };
  }

  // 제출 성공 → 클레임 순번을 먼저 잡고(제출 순서 = 클레임 순서 보장) 락 해제.
  const myClaimTurn = videoClaimChain;
  let releaseClaimTurn;
  videoClaimChain = new Promise((r) => { releaseClaimTurn = r; });
  release();

  const jobTag = `sf_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const finishByNet = (url) => {
    SF_CONSUMED_VIDEO_URLS.add(url);
    console.log(
      `[Flow Bridge] ${sceneLabel}: operation/prompt 매칭으로 영상 확정 (src=${String(url).slice(0, 80)}...)`
    );
    return { image_url: url };
  };

  let claimStarted = false;
  try {
    // 제출 직후 Flow 가 4xx/5xx 로 거부했다면, 이 잡의 결과 카드/비디오는 절대
    // 등장하지 않는다. 이때 fallback 이 다른 잡의 결과를 훔치지 않도록, 네트워크
    // 실패 신호와 카드 클레임을 race 해서 실패가 감지되면 즉시 잡을 실패로 마감.
    const preFailure = sfLookupPromptFailure(job.prompt);
    if (preFailure) {
      console.warn(
        `[Flow Bridge] ${sceneLabel}: Flow API 실패 감지 (HTTP ${preFailure.status}) — 카드 클레임 진입 없이 실패 처리`
      );
      return { error: `Flow 서버가 이 요청을 거부함 (HTTP ${preFailure.status})` };
    }

    const failureDuringClaim = sfWaitForPromptFailure(job.prompt);
    const cardPromise = (async () => {
      // 앞 잡의 클레임 시도가 끝날 때까지 대기 (FIFO 게이트) — 앞 잡의 카드가
      // 늦게 렌더돼도 이 잡이 그 카드를 가로채지 못하게 한다.
      await myClaimTurn;
      return captureNewCardForJob(
        submitted.prevCards || new Set(),
        jobTag,
        VIDEO_CARD_CLAIM_TIMEOUT_MS
      );
    })();
    claimStarted = true;
    // 이 잡이 net 매칭으로 먼저 끝나도 클레임은 백그라운드로 계속 진행돼 자기
    // 카드에 도장을 찍는다 — 다음 잡이 이 잡의 카드를 오인하는 것을 막는다.
    void cardPromise.finally(() => releaseClaimTurn());

    const claimRace = await Promise.race([
      cardPromise.then((card) => ({ type: "card", card })),
      failureDuringClaim.then((f) => ({ type: "failure", ...f })),
      netWin,
    ]);

    if (claimRace.type === "net") return finishByNet(claimRace.url);
    if (claimRace.type === "failure") {
      console.warn(
        `[Flow Bridge] ${sceneLabel}: 카드 클레임 중 Flow API 실패 감지 (HTTP ${claimRace.status}) — 잡 실패 처리`
      );
      return { error: `Flow 서버가 이 요청을 거부함 (HTTP ${claimRace.status})` };
    }

    const card = claimRace.card;
    console.log(
      `[Flow Bridge] ${sceneLabel}: Submit 후 카드 클레임 = ${card ? `OK (jobTag=${jobTag})` : `null (${VIDEO_CARD_CLAIM_TIMEOUT_MS}ms 내 새 카드 없음)`}`
    );

    try {
      if (card) {
        // 카드 내부에서 video 대기 중에도 Flow API 에러가 늦게 잡힐 수 있음 (비동기 거부).
        const videoRace = await Promise.race([
          waitForVideoInCard(card, 8 * 60 * 1000).then((url) => ({ type: "url", url })),
          sfWaitForPromptFailure(job.prompt).then((f) => ({ type: "failure", ...f })),
          netWin,
        ]);
        if (videoRace.type === "net") return finishByNet(videoRace.url);
        if (videoRace.type === "failure") {
          console.warn(
            `[Flow Bridge] ${sceneLabel}: 비디오 대기 중 Flow API 실패 감지 (HTTP ${videoRace.status}) — 잡 실패 처리`
          );
          return { error: `Flow 서버가 이 요청을 거부함 (HTTP ${videoRace.status})` };
        }
        return { image_url: videoRace.url };
      }
      // 카드 클레임 실패 → 전역 비디오 URL diff 로 fallback.
      // raw 는 많은데 인정 0 이면 isLikelyResultCardContainer 필터(크기 등) 문제.
      //
      // ⚠ 이 fallback 은 "새로 나타난 영상 중 아무도 안 가져간 첫 번째"를 집는다 —
      //   즉 완성 순서대로 배분된다. 여러 잡이 동시에 대기 중이면 먼저 완성된 영상이
      //   엉뚱한 장면에 붙는다. 그럴 때는 fallback 을 아예 쓰지 않고, operation/프롬프트
      //   매칭(netWin, 최대 20분)만 기다린다 — 늦게 붙는 편이 잘못 붙는 것보다 낫다.
      const concurrentVideoJobs = SF_NET.waiters.filter(
        (w) => (w.kind || "image") === "video"
      ).length;
      if (concurrentVideoJobs > 1) {
        console.warn(
          `[Flow Bridge] ${sceneLabel}: 카드 클레임 실패 — 동시 대기 ${concurrentVideoJobs}건이라 ` +
            `순서 기반 fallback 을 건너뛰고 operation 매칭만 기다립니다 (오매칭 방지)`
        );
        // netWin 은 타임아웃 시 영원히 pending 이므로(다른 경로가 이기게 하려는 설계)
        // 여기서는 반드시 자체 마감 시한을 함께 걸어야 한다.
        const onlyRace = await Promise.race([
          sfWaitForPromptFailure(job.prompt).then((f) => ({ type: "failure", ...f })),
          netWin,
          new Promise((r) =>
            setTimeout(() => r({ type: "timeout" }), VIDEO_NET_MATCH_TIMEOUT_MS + 30000)
          ),
        ]);
        if (onlyRace.type === "net") return finishByNet(onlyRace.url);
        if (onlyRace.type === "failure") {
          return { error: `Flow 서버가 이 요청을 거부함 (HTTP ${onlyRace.status})` };
        }
        return {
          error:
            "결과 카드 클레임 실패 + operation 매칭도 시간 내 도착하지 않음 — 다시 시도해 주세요",
        };
      }
      console.warn(
        `[Flow Bridge] ${sceneLabel}: 카드 클레임 실패 → 전역 비디오 URL diff fallback 사용 (오매칭 위험 있음) ` +
          `(카드 raw=${document.querySelectorAll(RESULT_CARD_SELECTOR).length}, ` +
          `인정=${snapshotResultCards().size}, viewport=${window.innerWidth}x${window.innerHeight})`
      );
      try {
        const fbRace = await Promise.race([
          waitForNewResultVideo(
            submitted.prevVideoUrls || new Set(),
            VIDEO_GLOBAL_FALLBACK_TIMEOUT_MS
          ).then((url) => ({ type: "url", url })),
          sfWaitForPromptFailure(job.prompt).then((f) => ({ type: "failure", ...f })),
          netWin,
        ]);
        if (fbRace.type === "net") return finishByNet(fbRace.url);
        if (fbRace.type === "failure") {
          console.warn(
            `[Flow Bridge] ${sceneLabel}: fallback 대기 중 Flow API 실패 감지 (HTTP ${fbRace.status}) — 잡 실패 처리`
          );
          return { error: `Flow 서버가 이 요청을 거부함 (HTTP ${fbRace.status})` };
        }
        console.log(
          `[Flow Bridge] ${sceneLabel}: fallback 매칭 성공 (src=${String(fbRace.url).slice(0, 80)}...)`
        );
        return { image_url: fbRace.url };
      } catch (e) {
        console.warn(`[Flow Bridge] ${sceneLabel}: fallback 매칭 실패: ${e?.message || e}`);
        return {
          error:
            "결과 카드 클레임 실패 및 전역 fallback 도 매칭 불가 — Flow 응답이 아예 없거나 UI 구조가 크게 변경됨",
        };
      }
    } catch (e) {
      return { error: `영상 결과 대기 실패: ${e?.message || e}` };
    }
  } finally {
    // 어떤 경로로 끝났든 net waiter 를 정리한다 — 남겨두면 같은 프롬프트의
    // 재시도 잡이 결과를 이전 waiter 에게 빼앗긴다.
    cancelNetWaiter();
    // 클레임을 시작하지 못하고 빠져나가는 경로(제출 직후 실패 등)에서는 게이트를
    // 직접 풀어 준다. 이미 시작했다면 cardPromise 쪽 finally 가 푼다.
    if (!claimStarted) releaseClaimTurn();
  }
}

// 반환값:
//   { error }                       — 제출 중 실패
//   { done: true, image_url }       — 이미 결과가 나와 있어 바로 반환
//   { prevCards, prevVideoUrls }    — 제출 성공, 카드 클레임 & 결과 대기는 호출자가
//                                    락 해제 후 병렬로 수행
async function runVideoJobSubmit(job) {
  // source_image_url 이 비어 있으면 텍스트→영상(t2v) 모드로 동작 — 이미지 첨부 단계를 건너뛴다.
  const isT2V = !job.source_image_url;
  if (SF_CANCEL.all || (job.scene_id && SF_CANCEL.sceneIds.has(job.scene_id))) {
    return { error: "사용자 중단" };
  }

  // 1) 동영상 모드 전환. 이미지 잡을 처리하다 넘어오면 Flow 가 이미지 모드로 남아 있어
  //    영상 프롬프트가 그림으로 나가버린다. 신 Flow(flow.google.com)는 이미지 잡과
  //    같은 탭 슬라이더(ensureFlowTabSelected)로 전환하는 게 정답이고, 탭이 없는
  //    구 UI 에서만 ensureVideoMode(모델 드롭다운 메뉴)로 폴백한다.
  //    비율·길이(초)는 Flow 의 전역 설정이라 여기서 건드리지 않는다 — 사용자가
  //    배치 시작 전에 한 번 맞춰두면 그대로 유지된다.
  try {
    await ensureFlowTabSelected("video");
  } catch (tabErr) {
    console.warn(`[Flow Bridge] 동영상 탭 전환 실패 (${tabErr?.message || tabErr}) — 구 UI 경로(ensureVideoMode)로 폴백`);
    try {
      await ensureVideoMode();
    } catch (e) {
      console.warn(`[Flow Bridge] 동영상 모드 전환 실패 — 현재 UI 상태로 진행합니다: ${e?.message || e}`);
    }
  }

  // 1-b) 최종 방어선: 모델 버튼이 명백히 이미지 모델(Nano Banana/Imagen)을 가리키면
  //      제출하지 않는다. 이미지 모드로 영상 프롬프트를 내보내면 (a) 크레딧으로
  //      엉뚱한 그림이 생성되고 (b) 영상 waiter 가 응답을 못 받아 매칭까지 무너진다.
  //      detectFlowMode 가 null(판정 불가)이면 사용자가 수동으로 동영상 모드를 켜 둔
  //      경우일 수 있으므로 그대로 진행한다 — 명백한 "image" 판정일 때만 막는다.
  //      탭 전환 직후에는 이미지 모델 버튼이 사라지는 중일 수 있어, 3초까지
  //      기다리며 "image 아님" 판정이 나오면 통과시킨다.
  {
    const notImage = await waitFor(() => (detectFlowMode() === "image" ? null : true), 3000, 250).catch(() => null);
    if (!notImage) {
      return { error: "동영상 모드 전환 실패 — Flow 가 이미지 모드로 남아 있어 제출을 중단했습니다. Flow 탭에서 동영상 모드로 한 번 전환해 주세요." };
    }
  }

  // 2) 이미지 첨부 (스토리보드 장면의 imageUrl) — t2v 모드면 스킵
  if (!isT2V) {
    try {
      await attachStyleImageToFlow(job.source_image_url, job.scene_id, job.scene_number, job.source_image_prompt);
    } catch (e) {
      return { error: `이미지 첨부 실패: ${e?.message || e}` };
    }
  }

  // 3) 프롬프트 입력 + 생성
  await sfWaitForRateSlot(1);
  if (SF_CANCEL.all || (job.scene_id && SF_CANCEL.sceneIds.has(job.scene_id))) {
    return { error: "사용자 중단" };
  }
  const prevCards = snapshotResultCards();
  const prevVideoUrls = snapshotResultVideoUrls();
  // 이미지 잡과 동일한 단순 흐름: typePromptIntoSlate 내부에 이미 모든 주입 방법과
  // Submit 활성화 대기가 들어있다. 바깥에서 덧붙이는 검증/재확인이 오히려 방해됨.
  await typePromptIntoSlate(job.prompt || "");
  // 타이핑 → Submit 사이 사람 같은 검토 간격. 너무 짧으면 봇 감지.
  await SLEEP(IMAGE_PRE_SUBMIT_PAUSE_MS);
  await clickSubmit();

  // 4) 다음 잡이 제출해도 입력창/첨부 슬롯이 충돌하지 않도록 쿨다운.
  //    이 시간 안에 Flow 가 placeholder 카드를 DOM 에 띄우면, 락 해제 후
  //    호출자(runVideoJob)가 prev 스냅샷과 비교해 이 잡의 카드를 클레임한다.
  await SLEEP(VIDEO_SUBMIT_COOLDOWN_MS);

  return { prevCards, prevVideoUrls };
}

// 입력창 우측 하단의 "모델 선택" 버튼을 찾아 누르고, 메뉴에서 "동영상"을 클릭.
async function ensureVideoMode() {
  // ─────────────────────────────────────────────────────────
  // [Layer 0] DOM 모델 버튼 판정 (가장 신뢰 — 실제 UI 상태)
  // 모델 드롭다운이 Veo 계열이면 이미 동영상 모드 → 아무것도 안 누른다.
  // 반대로 명백히 이미지 모델(Nano Banana/Imagen)이 보이면, 아래 네트워크·
  // localStorage 시그널이 뭐라 하든 "이미지 모드"가 사실이므로 그 두 레이어를
  // 건너뛰고 곧장 전환 단계로 간다. (localStorage 에는 이미지 모드에서도
  // 마지막에 쓴 Veo 모델명이 남아 있어 skip 오판을 일으켰던 자리다.)
  // ─────────────────────────────────────────────────────────
  const domMode = detectFlowMode();
  if (domMode === "video") {
    console.log("[Flow Bridge] 모드 감지: DOM 모델 버튼 → video (skip 전환)");
    return;
  }

  const FRESH_MS = 15 * 60 * 1000;
  const now = Date.now();
  if (domMode !== "image") {
    // ─────────────────────────────────────────────────────────
    // [Layer 1] 네트워크 시그널 — DOM 판정이 불가능할 때만 참고.
    // 최근 15분 내 video API 호출 흔적이 있고, 그 이후 image 호출이 없으면 video 모드로 간주.
    // ─────────────────────────────────────────────────────────
    if (
      SF_MODE.lastVideoAt > 0 &&
      now - SF_MODE.lastVideoAt < FRESH_MS &&
      SF_MODE.lastVideoAt >= SF_MODE.lastImageAt
    ) {
      console.log("[Flow Bridge] 모드 감지: 네트워크 시그널 → video (skip 전환)");
      return;
    }

    // ─────────────────────────────────────────────────────────
    // [Layer 2] localStorage / sessionStorage 모드 키 탐색 — 역시 DOM 판정 불가 시에만.
    // Flow가 보통 'flow.tool', 'selectedModel' 등 키에 모드를 저장.
    // ─────────────────────────────────────────────────────────
    try {
      const stores = [window.localStorage, window.sessionStorage];
      for (const store of stores) {
        if (!store) continue;
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (!k) continue;
          if (!/flow|tool|model|mode|video|image/i.test(k)) continue;
          const v = store.getItem(k) || "";
          if (/video|veo/i.test(v) && !/image|imagen|nano/i.test(v)) {
            console.log(`[Flow Bridge] 모드 감지: ${k} → video (skip 전환)`);
            return;
          }
        }
      }
    } catch {}
  }

  // ─────────────────────────────────────────────────────────
  // [Layer 3] DOM 휴리스틱 (fallback)
  // ─────────────────────────────────────────────────────────
  // 이미 동영상 모드인지 빠르게 체크: 모델 선택 트리거에 "동영상"이 표시되어 있으면 skip
  const composer = getPromptComposerRoot();
  const isAlreadyVideo = () => {
    const triggers = Array.from(composer.querySelectorAll("button, [role='button'], [role='combobox']"));
    for (const t of triggers) {
      if (!isVisible(t)) continue;
      const txt = normalizeText(t.textContent || "").toLowerCase();
      if (/동영상|video|veo/.test(txt) && !/이미지|image/.test(txt)) {
        // 모델 트리거로 보이고 현재 라벨이 동영상이면 OK
        if (/모델|model|tools|toggle|menu/.test(`${t.getAttribute("aria-label") || ""} ${t.getAttribute("aria-haspopup") || ""}`)
            || t.getAttribute("aria-haspopup")) {
          return true;
        }
      }
    }
    return false;
  };
  if (isAlreadyVideo()) return;

  // 모델 선택 트리거 후보: aria-haspopup 가지면서 composer 내부 버튼들 중
  // 텍스트에 "이미지|동영상|모델|Imagen|Veo|nano" 등이 들어간 것.
  const findModelTrigger = () => {
    const candidates = Array.from(composer.querySelectorAll("button, [role='button']")).filter((b) => isVisible(b));
    const scored = candidates.map((b) => {
      let score = 0;
      const txt = normalizeText(b.textContent || "").toLowerCase();
      const al = (b.getAttribute("aria-label") || "").toLowerCase();
      const ah = b.getAttribute("aria-haspopup");
      if (ah) score += 6;
      if (/모델|model/.test(txt + " " + al)) score += 8;
      if (/이미지|image|동영상|video|veo|imagen|nano|banana/.test(txt)) score += 6;
      // 입력창 우측 하단 위치 가중치
      const editor = findPromptEditor();
      if (editor) {
        const er = editor.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        if (br.left > er.left + er.width * 0.4 && br.bottom > er.bottom - 20) score += 5;
      }
      // submit 버튼은 제외
      if (b.querySelector("i.google-symbols, span.google-symbols, [class*='google-symbols'], [class*='material-symbols']")) {
        const icon = b.querySelector("i.google-symbols, span.google-symbols, [class*='google-symbols'], [class*='material-symbols']");
        const it = icon?.textContent?.trim();
        if (it === "arrow_forward" || it === "send" || it === "play_arrow") score -= 20;
      }
      return { b, score };
    }).filter((x) => x.score > 5).sort((a, b) => b.score - a.score);
    return scored[0]?.b || null;
  };

  const trigger = await waitFor(() => findModelTrigger(), 8000, 200).catch(() => null);
  if (!trigger) {
    throw new Error(
      "Flow의 모델 선택 버튼을 자동으로 찾지 못했습니다. " +
      "Flow 탭(flow.google.com)에서 직접 모드를 '동영상'으로 한 번 전환한 뒤 다시 시도해주세요. " +
      "(이후에는 자동 감지됩니다)"
    );
  }
  await clickLikeUser(trigger);

  // 메뉴에서 "동영상" 항목 클릭.
  // Flow 메뉴는 "텍스트 → 동영상", "프레임 → 동영상", "요소 → 동영상" 같은 복합 라벨을 쓰므로
  // 부분 일치로 탐색하고, 가장 구체적(짧은 텍스트)인 메뉴 항목을 고른다.
  const pickVideoItem = () => {
    const nodes = Array.from(
      document.querySelectorAll(
        "[role='menuitem'], [role='menuitemradio'], [role='option'], [role='radio'], button, li, a"
      )
    );
    const candidates = [];
    for (const el of nodes) {
      if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
      const txt = normalizeText(el.textContent || "").toLowerCase();
      if (!txt || txt.length > 80) continue;
      const hasVideo = /동영상|video|veo/.test(txt);
      const hasImage = /이미지|image|imagen|nano|banana/.test(txt);
      // "이미지 → 동영상" 처럼 둘 다 포함된 경우 동영상으로 끝나면 video 모드로 간주
      if (!hasVideo) continue;
      if (hasImage && !/동영상\s*$|video\s*$/.test(txt)) continue;
      candidates.push({ el, txt });
    }
    if (candidates.length === 0) return null;
    // 우선순위: 정확한 "동영상"/"video" > "텍스트 → 동영상" > 기타 동영상 포함 항목
    const exact = candidates.find(({ txt }) => /^동영상$|^video$/.test(txt));
    if (exact) return exact.el;
    const textToVideo = candidates.find(({ txt }) => /텍스트\s*[→>\-]+\s*동영상|text\s*[→>\-]+\s*video/.test(txt));
    if (textToVideo) return textToVideo.el;
    // 길이 짧은(가장 구체적인) 항목 선택
    candidates.sort((a, b) => a.txt.length - b.txt.length);
    return candidates[0].el;
  };
  const videoItem = await waitFor(pickVideoItem, 5000, 150).catch(() => null);
  if (!videoItem) {
    // 진단을 위해 현재 열려 있는 메뉴 항목 텍스트를 수집
    const seen = Array.from(
      document.querySelectorAll("[role='menuitem'], [role='menuitemradio'], [role='option'], [role='radio']")
    )
      .filter((el) => el instanceof HTMLElement && isVisible(el))
      .map((el) => normalizeText(el.textContent || ""))
      .filter((t) => t && t.length < 80)
      .slice(0, 8);
    throw new Error(
      "'동영상' 메뉴 항목을 찾지 못했습니다. " +
      (seen.length ? `감지된 항목: [${seen.join(" | ")}]. ` : "") +
      "Flow 탭에서 직접 동영상 모드로 전환한 뒤 재시도해주세요. (이후 자동 감지)"
    );
  }
  await clickLikeUser(videoItem);
  await SLEEP(800);

  // 전환 완료 후 mode 시그널 수동 마킹 (사용자가 직접 generate 하기 전이라도 캐시)
  SF_MODE.lastVideoAt = Date.now();
}

// --- 영상 결과 추출 ---
function isLikelyResultVideo(v) {
  if (!(v instanceof HTMLVideoElement)) return false;
  const src = v.currentSrc || v.src || "";
  if (!src) return false;
  if (src.startsWith("data:")) return false;
  return src.startsWith("blob:") ||
    /googleusercontent\.com|lh\d+\.google|storage\.googleapis|aistudio|labs\.google|veo/.test(src);
}

// 이미 어떤 잡이 결과로 매칭한 video URL 을 전역으로 추적.
// 여러 잡이 병렬로 결과 대기 중일 때, 카드 클레임 실패로 모두가 전역 fallback
// (waitForNewResultVideo) 에 진입하면, 각 잡의 prevSet snapshot 시점에 아직
// DOM 에 없던 동일한 video 를 "새 video" 로 판정해 같은 URL 을 중복 매칭할 수
// 있다 → 두 장면에 동일 영상 반영되는 오매칭. 이 Set 으로 중복 소비를 차단.
const SF_CONSUMED_VIDEO_URLS = new Set();

function snapshotResultVideoUrls() {
  const set = new Set();
  document.querySelectorAll("video").forEach((v) => {
    const src = v.currentSrc || v.src || "";
    if (src) set.add(src);
  });
  return set;
}

function waitForNewResultVideo(prevSet, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    // observer/timer 는 아래에서 할당. finish 안에서 참조되므로 let 으로 선언해
    // TDZ(Temporal Dead Zone)에 걸리지 않도록 한다. 기존 video 스캔(consider)이
    // observer 설정 전에 finish 를 동기 호출해도 안전.
    let observer = null;
    let timer = null;
    const finish = (url) => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      resolve(url);
    };
    const consider = (v) => {
      if (done || !isLikelyResultVideo(v)) return;
      const src = v.currentSrc || v.src || "";
      if (!src || prevSet.has(src) || SF_CONSUMED_VIDEO_URLS.has(src)) return;
      // 찾은 순간 consumed 로 선점해 다른 잡이 같은 URL 을 잡지 못하게 한다.
      SF_CONSUMED_VIDEO_URLS.add(src);
      finish(src);
    };
    // 기존 video 스캔 — 이미 prev 에 없는 video 가 떠 있으면 여기서 즉시 finish.
    document.querySelectorAll("video").forEach(consider);
    if (done) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target instanceof HTMLVideoElement) consider(m.target);
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLVideoElement) consider(n);
          else if (n instanceof HTMLElement) {
            n.querySelectorAll?.("video").forEach(consider);
          }
        });
      }
    });
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["src"],
    });
    timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      reject(new Error(`영상 결과 timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "RUN_FLOW_JOB") {
    // 새 잡이 들어왔으니 "all 취소" 플래그 해제 (다음 라운드 허용)
    SF_CANCEL.all = false;
    runJob(msg.job)
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
    return true; // async
  }
  if (msg.type === "CANCEL_FLOW_JOBS") {
    const ids = Array.isArray(msg.sceneIds) ? msg.sceneIds : null;
    if (ids && ids.length > 0) {
      for (const id of ids) SF_CANCEL.sceneIds.add(id);
      // 해당 scene의 진행 중 waiter만 reject
      const remain = [];
      for (const w of SF_NET.waiters) {
        if (w.sceneId && ids.includes(w.sceneId)) {
          try { clearTimeout(w.timer); } catch {}
          try { w.reject(new Error("사용자 중단")); } catch {}
        } else {
          remain.push(w);
        }
      }
      SF_NET.waiters.length = 0;
      SF_NET.waiters.push(...remain);
    } else {
      SF_CANCEL.all = true;
      sfAbortAllWaiters("사용자 중단(전체)");
    }
    sendResponse({ ok: true });
    return true;
  }
});

console.log("[StudioForge Flow Bridge] content script loaded");