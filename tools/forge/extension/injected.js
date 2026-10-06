// StudioForge Flow Bridge - MAIN world injection
// Runs in page's JS context — has access to React fiber / Slate editor instance
(function () {
  const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

  // ============================================================
  // Flow 네트워크 인터셉터 — batchGenerateImages 요청/응답 매칭
  // 요청 body의 batchId ↔ 응답 body.media[].image.generatedImage.fifeUrl
  // 매칭 키 fallback: prompt 텍스트 (structuredPrompt.parts[].text)
  //
  // 동영상: 제출(batchAsyncGenerateVideo*)과 완성(상태 폴링)이 분리된 비동기라
  // 이미지 같은 고정 응답 경로를 기대할 수 없다. 엔드포인트·필드명이 바뀌어도
  // 견디도록 JSON 응답 전체를 딥스캔해 "video 계열 키 아래 URL + 가장 가까운
  // prompt/operation" 을 뽑아 content.js 로 보낸다. 매칭 실패 시 content.js 가
  // 기존 DOM 카드 방식으로 폴백하므로, 여기서는 과탐(가짜 URL)만 조심하면 된다.
  // ============================================================
  try {
    const SF_FLOW_RE = /flowMedia:batchGenerateImages|batchAsyncGenerateVideo|batchGenerateVideos/i;
    const SF_VIDEO_RE = /batchAsyncGenerateVideo|batchGenerateVideos/i;
    const SF_IMAGE_RE = /flowMedia:batchGenerateImages/i;
    // 동영상 완성 상태를 나르는 폴링 엔드포인트 후보. 이름이 달라도 아래의
    // "모든 JSON 응답 텍스트 게이트"가 있어 놓치지 않는다 — 이 정규식은
    // 확실한 후보를 텍스트 게이트 없이 바로 파싱하기 위한 지름길이다.
    const SF_VIDEO_STATUS_RE = /CheckAsyncVideoGeneration|VideoGenerationStatus|batchCheckAsync/i;

    // 현재 Flow 페이지가 어떤 모드(image/video)에 있는지 네트워크 요청을 통해 추론.
    // content.js가 window.__sfFlowMode 를 읽거나 postMessage 'MODE_SIGNAL' 을 수신.
    window.__sfFlowMode = window.__sfFlowMode || { lastImageAt: 0, lastVideoAt: 0 };
    const sfMarkMode = (kind) => {
      try {
        const now = Date.now();
        if (kind === "video") window.__sfFlowMode.lastVideoAt = now;
        else if (kind === "image") window.__sfFlowMode.lastImageAt = now;
        window.postMessage(
          { __sfChannel: "sf-flow-bridge", type: "MODE_SIGNAL", kind, ts: now },
          "*"
        );
      } catch {}
    };

    const sfEmit = (phase, data) => {
      try {
        window.postMessage(
          { __sfChannel: "sf-flow-bridge", type: "FLOW_CAPTURE", phase, ts: Date.now(), ...data },
          "*"
        );
      } catch {}
    };

    function extractFromReq(reqBodyStr) {
      try {
        const j = typeof reqBodyStr === "string" ? JSON.parse(reqBodyStr) : reqBodyStr;
        const batchId = j?.mediaGenerationContext?.batchId || null;
        const prompts = [];
        const reqs = Array.isArray(j?.requests) ? j.requests : [];
        for (const r of reqs) {
          const parts = r?.structuredPrompt?.parts;
          if (Array.isArray(parts)) {
            const t = parts.map((p) => p?.text || "").join("");
            if (t) prompts.push(t);
          }
        }
        if (prompts.length === 0) {
          // 동영상 요청 등 body 구조가 다른 경우 — 먼저 "정확한" prompt 키만 훑는다.
          // 예전에는 곧바로 /prompt|^text$/ 로 광범위 수집했는데, 그러면 실제 프롬프트가
          // 아닌 문자열(negative prompt·라벨 등)이 섞이고 순서까지 흐트러져
          // operation → prompt 역매핑이 통째로 어긋났다.
          const collect = (re, minLen) => {
            const out = [];
            let nodes = 0;
            const walk = (v, depth) => {
              if (!v || typeof v !== "object" || depth > 12 || ++nodes > 10000) return;
              if (Array.isArray(v)) { for (const c of v) walk(c, depth + 1); return; }
              for (const [k, val] of Object.entries(v)) {
                if (typeof val === "string") {
                  if (re.test(k) && val.trim().length >= minLen) out.push(val);
                } else walk(val, depth + 1);
              }
            };
            walk(j, 0);
            return out;
          };
          const exact = collect(/^(prompt|text_?prompt|prompt_?text)$/i, 3);
          prompts.push(...(exact.length > 0 ? exact : collect(/prompt|^text$/i, 3)));
        }
        return { batchId, prompts };
      } catch { return { batchId: null, prompts: [] }; }
    }

    // ── 동영상 완성 딥스캔 ──────────────────────────────────────
    // 제출 응답의 operation 이름 → 그 요청의 prompt. 상태 폴링 응답에 prompt 가
    // 실려 있지 않아도 operation 으로 역추적해 프롬프트 완전 일치 매칭을 잇는다.
    const sfOpToPrompt = new Map();
    const SF_OP_MAP_MAX = 300;
    function sfRememberOpPrompts(ops, prompts) {
      if (!ops.length || !prompts.length) return;
      // 개수가 안 맞으면 어느 op 가 어느 prompt 인지 알 수 없다. 예전에는 이때
      // prompts[0] 을 전부에 씌웠는데, 그러면 서로 다른 장면의 영상이 같은
      // 프롬프트로 기억되어 매칭이 뒤섞였다. op 가 하나뿐일 때만 1:1 로 본다.
      if (prompts.length !== ops.length && ops.length !== 1) return;
      for (let i = 0; i < ops.length; i++) {
        const p = ops.length === 1 ? prompts[0] : prompts[i];
        if (p) sfOpToPrompt.set(sfOpKey(ops[i]), p);
      }
      while (sfOpToPrompt.size > SF_OP_MAP_MAX) {
        sfOpToPrompt.delete(sfOpToPrompt.keys().next().value);
      }
    }

    // operation 이름 정규화 — 제출 응답은 "operations/abc", 폴링 응답은 "abc" 처럼
    // 접두사가 다를 수 있다. 마지막 세그먼트만 비교해 양쪽을 같은 키로 만든다.
    // content.js 의 sfOpKey 와 규칙이 동일해야 한다.
    function sfOpKey(v) {
      const s = String(v || "").trim();
      if (!s) return "";
      return s.split("/").filter(Boolean).pop().toLowerCase();
    }

    // 값이 "식별자"처럼 생겼는지. 키 이름만 보고 받아들이면 operationStatus 같은
    // 필드의 상태 enum("MEDIA_GENERATION_STATUS_SUCCESSFUL")까지 operation 으로
    // 잡힌다. 그 값은 모든 잡이 공유하므로, 완성 영상이 "가장 오래 기다린 잡"에
    // 붙어 버린다 — 순서대로 배분되던 옛 버그가 그대로 재현되는 경로다.
    function sfLooksLikeOpId(s) {
      if (typeof s !== "string") return false;
      const t = s.trim();
      if (t.length < 8 || t.length > 400 || /\s/.test(t)) return false;
      const last = t.split("/").filter(Boolean).pop() || "";
      if (last.length < 8) return false;
      // 전부 대문자+언더스코어 = 상태/타입 enum. ID 가 아니다.
      if (/^[A-Z0-9_]+$/.test(last)) return false;
      // 실제 ID 는 16진/영숫자 혼합. 순수 알파벳 단어(예: "generateVideo")는 제외.
      if (!/\d/.test(last) && !/[a-f]{6,}/i.test(last)) return false;
      return true;
    }

    // 객체의 문자열 필드 중 operation 이름으로 볼 만한 값. 제출 응답 수집과
    // 폴링 응답 스캔이 같은 규칙을 쓰도록 한 곳에 모은다 — 규칙이 갈리면
    // 제출 때 기억한 op 를 완성 때 못 알아본다.
    function sfPickOpName(k, val, parentIsOp) {
      if (typeof val !== "string" || val.length < 8) return "";
      const keyOk =
        /operation/i.test(k) ||
        ((k === "name" || k === "id") && (parentIsOp || /operations?\//i.test(val)));
      if (!keyOk) return "";
      return sfLooksLikeOpId(val) ? val : "";
    }

    // 제출 응답에 들어 있는 "식별자처럼 생긴 값" 전부. 키 이름을 가리지 않는다.
    //
    // Flow 가 필드 이름을 바꾸거나 operation 이 아닌 다른 이름(mediaId·sceneId 등)으로
    // 완성 응답을 되돌려 줄 때를 위한 두 번째 매칭 근거다. 여기서 모은 값 중 완성
    // 응답에도 나타나는 것이 있으면, 그게 이 제출과 저 완성을 잇는 끈이 된다.
    // 프로젝트 ID 처럼 모든 잡이 공유하는 값은 content.js 가 "두 번 이상 등장하면
    // 식별자가 아니다"로 걸러내므로 여기서는 넉넉히 담아도 된다.
    const SF_ID_CANDIDATE_MAX = 60;
    function sfCollectIdCandidates(body) {
      const ids = new Set();
      let nodes = 0;
      const walk = (v, depth) => {
        if (!v || typeof v !== "object" || depth > 14 || ++nodes > 20000) return;
        if (ids.size >= SF_ID_CANDIDATE_MAX) return;
        if (Array.isArray(v)) { for (const c of v) walk(c, depth + 1); return; }
        for (const [, val] of Object.entries(v)) {
          if (typeof val === "string") {
            if (sfLooksLikeOpId(val)) ids.add(val);
          } else walk(val, depth + 1);
        }
      };
      walk(body, 0);
      return [...ids];
    }

    // 제출 응답에서 operation 이름 후보를 수집.
    function sfCollectOpNames(body) {
      const ops = new Set();
      let nodes = 0;
      const walk = (v, parentIsOp, depth) => {
        if (!v || typeof v !== "object" || depth > 14 || ++nodes > 20000) return;
        if (Array.isArray(v)) { for (const c of v) walk(c, parentIsOp, depth + 1); return; }
        for (const [k, val] of Object.entries(v)) {
          if (typeof val === "string") {
            const op = sfPickOpName(k, val, parentIsOp);
            if (op) ops.add(op);
          } else if (val && typeof val === "object") {
            walk(val, parentIsOp || /operation/i.test(k), depth + 1);
          }
        }
      };
      walk(body, false, 0);
      return [...ops];
    }

    // 응답 JSON 을 재귀로 훑어 동영상 URL 을 뽑는다.
    // 인정 조건: URL 성 키(url/uri/fife) + (조상 키에 video 가 있거나 URL 자체가
    // .mp4 등 동영상 확장) + 썸네일/포스터류 키 제외.
    // 각 URL 에는 그 시점까지 지나온 가장 가까운 prompt/operation 문자열을 싣는다.
    const SF_URL_KEY_RE = /url|uri|fife/i;
    const SF_NON_VIDEO_URL_KEY_RE = /thumb|poster|preview|cover|icon|image|avatar/i;
    const SF_PROMPT_KEY_RE = /^(prompt|text_?prompt|prompt_?text)$/i;
    function sfScanVideoItems(body) {
      const items = [];
      const seenUrl = new Set();
      let nodes = 0;
      const walk = (v, underVideo, prompt, op, ids, parentIsOp, depth) => {
        if (!v || typeof v !== "object" || depth > 14 || ++nodes > 20000) return;
        if (Array.isArray(v)) { for (const c of v) walk(c, underVideo, prompt, op, ids, parentIsOp, depth + 1); return; }
        // 이 객체의 문자열 필드에서 컨텍스트(prompt/operation/식별자)를 먼저 갱신 —
        // 키 순서상 URL 이 prompt 보다 앞에 있어도 잡히도록 두 번 순회한다.
        let localIds = ids;
        for (const [k, val] of Object.entries(v)) {
          if (typeof val !== "string" || !val) continue;
          if (SF_PROMPT_KEY_RE.test(k)) { prompt = val; continue; }
          const picked = sfPickOpName(k, val, parentIsOp);
          if (picked) op = picked;
          // 이 URL 에 이르는 길목에서 본 식별자 — 제출 응답의 식별자와 교집합이
          // 생기면, operation 을 못 알아봐도 어느 잡의 결과인지 되돌릴 수 있다.
          else if (sfLooksLikeOpId(val) && localIds.length < 20 && !localIds.includes(val)) {
            if (localIds === ids) localIds = [...ids];
            localIds.push(val);
          }
        }
        for (const [k, val] of Object.entries(v)) {
          const childUnderVideo = underVideo || /video/i.test(k);
          if (typeof val === "string") {
            if (
              /^https?:\/\//.test(val) &&
              SF_URL_KEY_RE.test(k) &&
              !SF_NON_VIDEO_URL_KEY_RE.test(k) &&
              (childUnderVideo || /\.mp4|\.webm|videoplayback/i.test(val)) &&
              !seenUrl.has(val)
            ) {
              seenUrl.add(val);
              items.push({ url: val, prompt, opName: op, linkIds: localIds });
            }
          } else {
            walk(val, childUnderVideo, prompt, op, localIds, parentIsOp || /operation/i.test(k), depth + 1);
          }
        }
      };
      walk(body, false, "", "", [], false, 0);
      // 같은 객체에 URL 이 여럿일 때(.mp4/재생 URL vs 기타) 확실한 쪽을 앞으로.
      const score = (u) => (/\.mp4|videoplayback/i.test(u) ? 0 : /fife/i.test(u) ? 1 : 2);
      items.sort((a, b) => score(a.url) - score(b.url));
      return items;
    }

    // 성공 응답 JSON 공통 처리 — 이미지 고정 경로 추출 + 동영상 딥스캔.
    function sfHandleFlowBody(url, body, reqPrompts, isFlowLike) {
      try {
        if (isFlowLike) {
          const { batchId, items } = extractFromResp(body);
          sfEmit("response", { url, batchId, items });
          if (SF_VIDEO_RE.test(url)) {
            // 동영상 제출 응답 — 이 요청이 만들어 낸 operation 목록을 content.js 로
            // 그대로 넘긴다. 제출은 FIFO 로 직렬화돼 있으므로 content.js 가
            // "방금 제출한 잡"에 이 operation 을 귀속시킬 수 있고, 이후 완성
            // 폴링 응답을 프롬프트 문자열 없이도 정확히 그 잡에 되돌릴 수 있다.
            const ops = sfCollectOpNames(body);
            if (Array.isArray(reqPrompts) && reqPrompts.length > 0) {
              sfRememberOpPrompts(ops, reqPrompts);
            }
            const ids = sfCollectIdCandidates(body);
            if (ops.length > 0 || ids.length > 0) {
              sfEmit("video_submit", { url, ops, ids, prompts: reqPrompts || [] });
            }
            if (ops.length === 0) {
              // op 를 하나도 못 알아본 제출 — 이 잡의 완성 영상은 되돌릴 근거가 없다.
              // 응답 최상위 키를 남겨 Flow 의 실제 구조를 확인할 수 있게 한다.
              console.warn(
                "[StudioForge Flow Bridge] 동영상 제출 응답에서 operation 을 찾지 못함 —",
                "topKeys=",
                body && typeof body === "object" ? Object.keys(body).slice(0, 12) : body
              );
            }
          }
        }
        const vids = sfScanVideoItems(body);
        if (vids.length > 0) {
          const enriched = vids.map((it) => ({
            url: it.url,
            opName: it.opName || "",
            linkIds: it.linkIds || [],
            prompt: it.prompt || (it.opName && sfOpToPrompt.get(sfOpKey(it.opName))) || "",
            kind: "video",
          }));
          // 진단용: 완성 응답이 무엇을 싣고 오는지(op 이름·프롬프트 유무·최상위 키)를
          // 함께 보낸다. 매칭이 깨졌을 때 어느 쪽이 비어 있는지 로그로 바로 갈린다.
          sfEmit("response", {
            url,
            batchId: null,
            items: enriched,
            diag: {
              topKeys: body && typeof body === "object" ? Object.keys(body).slice(0, 12) : [],
              withOp: enriched.filter((e) => e.opName).length,
              withPrompt: enriched.filter((e) => e.prompt).length,
              sampleOp: enriched.find((e) => e.opName)?.opName || "",
            },
          });
        }
      } catch {}
    }

    // ── flow.google.com batchexecute (2026-09 신 Flow) ──────────────
    // 구글이 Flow 를 labs.google/fx (React) → flow.google.com (Angular) 로
    // 통째로 이전하면서 API 도 flowMedia:batchGenerateImages REST 에서 구글
    // 공통 batchexecute RPC 로 바뀌었다. 위의 기존 경로들은 그대로 두고(옛
    // 도메인이 살아 있을 때를 위해), batchexecute 응답을 별도로 처리한다.
    //
    // 응답 형식: ")]}'" 프리픽스 + 길이 라인 + JSON 청크가 섞인 스트림.
    // 각 청크는 [["wrb.fr", <rpcid>, "<내부 JSON 문자열>", ...], ...] 이고,
    // 내부 JSON 은 키 없는 protobuf 스타일 중첩 배열이라 키 이름 기반 딥스캔이
    // 통하지 않는다. → 미디어 URL 문자열을 찾고, 그 URL 을 담은 배열(및 한
    // 단계 위)에서 프롬프트·UUID 를 함께 뽑아 (url, prompt, linkIds) 로 방출.
    // 매칭 자체는 기존 그대로: content.js 가 프롬프트 "완전 일치"로 잡을 찾는다.
    // (완성 폴링 응답에 제출 프롬프트가 그대로 실려 온다 — 실측 확인.)
    const SF_BX_URL_RE = /\/data\/batchexecute/;
    // 완성 응답의 이미지 URL 은 https://flow-content.google/image/..,
    // 프로젝트 미디어 목록은 https://flow.google.com/asb/.. 로 온다.
    const SF_BX_MEDIA_URL_RE =
      /^https:\/\/(?:[^/]*\.)?flow-content\.google\/|^https:\/\/flow\.google\.com\/asb\//;
    const SF_BX_VIDEO_HINT_RE = /\/video|\.mp4(?:$|\?)|\.webm(?:$|\?)/i;
    const SF_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function sfBxLooksLikePrompt(s) {
      const t = s.trim();
      // 상한 50000: 실측에서 21,479자짜리 합성 프롬프트(전역 중복 등)까지 관찰됐다.
      // 상한에 걸리면 진짜 프롬프트가 후보에서 걸러져 매칭이 통째로 실패하므로,
      // base64 덩어리(수십만 자) 같은 초대형 문자열 컷 용도만 남기고 넉넉히 잡는다.
      if (t.length < 8 || t.length > 50000) return false;
      if (/^https?:\/\//.test(t)) return false;
      if (!/\s/.test(t)) return false; // 공백 없는 값은 ID/enum
      if (/^[A-Z0-9_\s.:-]+$/.test(t)) return false; // 대문자 enum 나열
      return true;
    }

    function sfBxCollectStrings(v, depth, out) {
      if (out.length > 3000 || depth > 7) return;
      if (typeof v === "string") { out.push(v); return; }
      if (Array.isArray(v)) { for (const c of v) sfBxCollectStrings(c, depth + 1, out); }
    }

    // 내부 배열에서 (미디어 URL, 가장 가까운 프롬프트, 주변 UUID) 수집.
    // 프롬프트는 URL 을 직접 담은 배열에서 먼저 찾고, 없을 때만 한 단계 위를
    // 본다 — 더 올라가면 다른 미디어 항목의 프롬프트가 섞인다.
    function sfBxHarvest(root) {
      const items = [];
      const seenUrl = new Set();
      let nodes = 0;
      const walk = (v, ancestors) => {
        if (++nodes > 60000 || items.length >= 100) return;
        if (Array.isArray(v)) {
          ancestors.push(v);
          for (const c of v) walk(c, ancestors);
          ancestors.pop();
        } else if (typeof v === "string" && SF_BX_MEDIA_URL_RE.test(v) && !seenUrl.has(v)) {
          seenUrl.add(v);
          let prompt = "";
          const ids = [];
          for (let up = 1; up <= 2 && ancestors.length - up >= 0; up++) {
            const strs = [];
            sfBxCollectStrings(ancestors[ancestors.length - up], 0, strs);
            for (const s of strs) {
              // 후보가 여럿이면 가장 긴 것 — 짧은 라벨보다 실제 프롬프트일 확률이 높다.
              if (sfBxLooksLikePrompt(s) && s.length > prompt.length) prompt = s;
              if (SF_UUID_RE.test(s) && ids.length < 12 && !ids.includes(s)) ids.push(s);
            }
            if (prompt) break;
          }
          items.push({
            url: v,
            prompt,
            kind: SF_BX_VIDEO_HINT_RE.test(v) ? "video" : "image",
            linkIds: ids,
          });
        }
      };
      walk(root, []);
      return items;
    }

    // 폴링이 같은 완성 응답을 몇 초마다 반복해 나르므로, 같은 URL 은 60초에
    // 한 번만 방출해 content.js 의 pendingResponses 가 무한히 붇지 않게 한다.
    const sfBxEmittedAt = new Map();
    function sfHandleBatchExecute(url, text, reqBody) {
      try {
        if (typeof text !== "string" || text.length > SF_MAX_SCAN_TEXT) return;
        if (!text.includes("wrb.fr")) return;
        const submitMode = sfBxSubmitMode(reqBody);
        const submitIds = [];
        const found = [];
        for (const ln of text.split("\n")) {
          if (!ln.startsWith("[[")) continue;
          let arr;
          try { arr = JSON.parse(ln); } catch { continue; }
          for (const row of arr) {
            if (!Array.isArray(row) || row[0] !== "wrb.fr" || typeof row[2] !== "string") continue;
            let inner;
            try { inner = JSON.parse(row[2]); } catch { continue; }
            found.push(...sfBxHarvest(inner));
            if (submitMode) sfBxHarvestIds(inner, submitIds);
          }
        }
        // 제출 응답이면, 응답 속 UUID(방금 만들어진 미디어/워크플로 ID)와 요청 원문
        // 프롬프트를 content.js 로 넘겨 "방금 제출한 잡"에 못 박는다. 완성 폴링이
        // 프롬프트를 번역해 돌려줘도(한국어 프롬프트 실측) ID 로 정확히 되돌아온다.
        // 요청 본문의 UUID 는 쓰지 않는다 — 참조 이미지처럼 "다른 미디어"의 ID 가
        // 섞여 있어, 그 미디어의 폴링 응답이 이 잡으로 오매칭될 수 있다.
        if (submitMode) {
          // 제출은 드문 이벤트라 항상 찍는다 — "제출인 줄은 알았는데 UUID 를 못
          // 뽑았다"(수확 문제)와 "제출인 줄도 몰랐다"(판별 문제)가 로그로 갈린다.
          console.log(
            `[StudioForge Flow Bridge] batchexecute 제출 감지(${submitMode}): 응답 UUID ${submitIds.length}개`
          );
        }
        if (submitMode && submitIds.length > 0) {
          const req = sfBxExtractReqStrings(reqBody);
          sfEmit("bx_submit", { url, kind: submitMode, ids: submitIds, prompts: req.prompts });
        }
        if (found.length === 0) return;
        const now = Date.now();
        const fresh = found.filter((it) => {
          const last = sfBxEmittedAt.get(it.url) || 0;
          if (now - last < 60000) return false;
          sfBxEmittedAt.set(it.url, now);
          return true;
        });
        while (sfBxEmittedAt.size > 1000) {
          sfBxEmittedAt.delete(sfBxEmittedAt.keys().next().value);
        }
        if (fresh.length === 0) return;
        sfEmit("response", { url, batchId: null, items: fresh });
      } catch {}
    }

    // batchexecute 요청 본문에서 모드 시그널 추출. 신 Flow 는 제출 시
    // MEDIA_GENERATION_TYPE=image|video 텔레메트리를 함께 보낸다 (URL 인코딩
    // 본문이지만 영숫자·언더스코어는 인코딩되지 않아 평문 검색이 가능).
    // 제출이 아닌 요청(폴링·목록)에는 이 시그널이 없다 → null.
    function sfBxSubmitMode(bodyStr) {
      try {
        if (typeof bodyStr !== "string") return null;
        const idx = bodyStr.indexOf("MEDIA_GENERATION_TYPE");
        if (idx < 0) return null;
        const win = bodyStr.slice(idx, idx + 300);
        if (/video/i.test(win)) return "video";
        if (/image/i.test(win)) return "image";
        return null;
      } catch { return null; }
    }
    function sfBxMarkModeFromReq(bodyStr) {
      const mode = sfBxSubmitMode(bodyStr);
      if (mode) sfMarkMode(mode);
    }

    // batchexecute 제출 요청 본문(f.req=<URL인코딩 JSON>)에서 프롬프트 후보와
    // UUID 를 뽑는다. 내부에 JSON 문자열이 한 겹 더 들어있을 수 있어 풀어서 본다.
    // 여기서 뽑은 프롬프트는 "사용자가 제출한 원문"이라, Flow 가 완성 응답에서
    // 프롬프트를 영어로 번역해 돌려줘도(한국어 프롬프트에서 실측) 잡과 일치한다.
    function sfBxExtractReqStrings(bodyStr) {
      try {
        const m = /(?:^|&)f\.req=([^&]*)/.exec(String(bodyStr || ""));
        if (!m) return { prompts: [], ids: [] };
        const outer = JSON.parse(decodeURIComponent(m[1].replace(/\+/g, " ")));
        const strs = [];
        sfBxCollectStrings(outer, 0, strs);
        const all = [...strs];
        for (const s of strs) {
          if (s.length > 2 && (s[0] === "[" || s[0] === "{")) {
            try { sfBxCollectStrings(JSON.parse(s), 0, all); } catch {}
          }
        }
        const prompts = [];
        const ids = [];
        for (const s of all) {
          if (SF_UUID_RE.test(s)) {
            if (ids.length < 24 && !ids.includes(s)) ids.push(s);
          } else if (sfBxLooksLikePrompt(s) && !prompts.includes(s)) prompts.push(s);
        }
        return { prompts, ids };
      } catch { return { prompts: [], ids: [] }; }
    }

    // 제출 응답 내부 JSON 에서 UUID 수확 — 방금 만들어진 미디어/워크플로 ID 들.
    function sfBxHarvestIds(root, out) {
      const strs = [];
      sfBxCollectStrings(root, 0, strs);
      for (const s of strs) {
        if (SF_UUID_RE.test(s) && out.length < 24 && !out.includes(s)) out.push(s);
      }
    }

    // 알 수 없는 엔드포인트의 응답도 동영상 완성 payload 일 수 있다 — 파싱 전에
    // 텍스트를 싸게 검사해 동영상 흔적이 있을 때만 JSON.parse 한다.
    const SF_VIDEO_TEXT_GATE = /(fifeUrl|servingBaseUri|\.mp4|videoplayback|generatedVideo)/;
    const SF_MAX_SCAN_TEXT = 8 * 1024 * 1024;
    function sfMaybeHandleUnknownJson(url, text) {
      if (typeof text !== "string" || text.length > SF_MAX_SCAN_TEXT) return;
      if (!SF_VIDEO_TEXT_GATE.test(text) || !/video/i.test(text)) return;
      let body;
      try { body = JSON.parse(text); } catch { return; }
      sfHandleFlowBody(url, body, [], false);
    }

    function extractFromResp(body) {
      try {
        // batchId는 workflows[].metadata.batchId 또는 media[].(없을수도)
        let batchId = null;
        const wfs = Array.isArray(body?.workflows) ? body.workflows : [];
        for (const w of wfs) {
          if (w?.metadata?.batchId) { batchId = w.metadata.batchId; break; }
        }
        const items = [];
        const media = Array.isArray(body?.media) ? body.media : [];
        for (const m of media) {
          const gi = m?.image?.generatedImage;
          const url = gi?.fifeUrl;
          if (!url) continue;
          items.push({
            url,
            prompt: gi?.prompt || "",
            mediaId: gi?.mediaId || m?.name || null,
            workflowId: m?.workflowId || null,
            width: m?.image?.dimensions?.width || null,
            height: m?.image?.dimensions?.height || null,
          });
        }
        return { batchId, items };
      } catch { return { batchId: null, items: [] }; }
    }

    const origFetch = window.fetch;
    // 네이티브 fetch는 반드시 this === window 로 호출되어야 한다.
    // Next.js 등이 `const { fetch } = globalThis; fetch(...)` 형태로 간접 호출하면
    // this 가 undefined 가 되어 "Illegal invocation"으로 페이지가 깨진다.
    // 래퍼 전체도 try/catch 로 감싸 인터셉터 오류가 원본 fetch 호출을 막지 않도록 한다.
    window.fetch = async function (input, init) {
      let url = "";
      let reqBody = null;
      let reqPrompts = [];
      try {
        url = typeof input === "string" ? input : input?.url || "";
        if (init?.body) {
          // batchexecute 는 본문을 URLSearchParams 로 보내는 경우가 있다 —
          // 문자열화하지 않으면 제출 판별(MEDIA_GENERATION_TYPE)이 통째로 빠진다.
          if (typeof init.body === "string") reqBody = init.body;
          else if (init.body instanceof URLSearchParams) reqBody = init.body.toString();
          else reqBody = "[non-string body]";
        } else if (input instanceof Request) {
          reqBody = await input.clone().text().catch(() => null);
        }
        // 요청 시점에 batchId+prompts 추출하여 즉시 emit (응답 매칭에 사용)
        if (SF_FLOW_RE.test(url) && typeof reqBody === "string") {
          const { batchId, prompts } = extractFromReq(reqBody);
          reqPrompts = prompts || [];
          if (batchId) sfEmit("request", { url, batchId, prompts });
          if (SF_VIDEO_RE.test(url)) sfMarkMode("video");
          else if (SF_IMAGE_RE.test(url)) sfMarkMode("image");
        }
        if (SF_BX_URL_RE.test(url) && typeof reqBody === "string") {
          sfBxMarkModeFromReq(reqBody);
        }
      } catch {}
      let response;
      try {
        response = await origFetch.call(window, input, init);
      } catch (e) {
        // 네트워크 자체 실패 (CORS/오프라인 등) — 잡 매칭을 위해 error 이벤트 발행
        if (url && SF_FLOW_RE.test(url)) {
          sfEmit("error", { url, status: 0, prompts: reqPrompts, reason: String(e?.message || e) });
        }
        throw e;
      }
      try {
        if (url) {
          const isFlow = SF_FLOW_RE.test(url);
          const isFlowLike = isFlow || SF_VIDEO_STATUS_RE.test(url);
          if (isFlow && !response.ok) {
            // 4xx/5xx — 잡 실패를 즉시 전파. body 파싱 생략.
            sfEmit("error", { url, status: response.status, prompts: reqPrompts });
          } else if (response.ok) {
            if (SF_BX_URL_RE.test(url)) {
              // 신 Flow batchexecute — content-type 이 JSON 이 아닐 수 있어
              // URL 만 보고 텍스트로 처리한다.
              response.clone().text()
                .then((text) => sfHandleBatchExecute(url, text, reqBody))
                .catch(() => {});
            }
            const ct = response.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const clone = response.clone();
              if (isFlowLike) {
                clone.json()
                  .then((body) => sfHandleFlowBody(url, body, reqPrompts, true))
                  .catch(() => {});
              } else {
                // 동영상 완성 신호가 어느 엔드포인트로 오는지 확정할 수 없어
                // 모든 JSON 응답을 텍스트 게이트로 거른 뒤 딥스캔한다.
                clone.text()
                  .then((text) => sfMaybeHandleUnknownJson(url, text))
                  .catch(() => {});
              }
            }
          }
        }
      } catch {}
      return response;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__sfUrl = url;
      this.__sfMethod = method;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      // URLSearchParams 본문도 문자열화해 저장 — batchexecute 제출 판별에 필요.
      this.__sfBody =
        typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : body;
      try {
        const bodyStr = typeof this.__sfBody === "string" ? this.__sfBody : null;
        if (SF_FLOW_RE.test(this.__sfUrl || "") && bodyStr) {
          const { batchId, prompts } = extractFromReq(bodyStr);
          this.__sfPrompts = prompts || [];
          if (batchId) sfEmit("request", { url: this.__sfUrl, batchId, prompts });
          if (SF_VIDEO_RE.test(this.__sfUrl || "")) sfMarkMode("video");
          else if (SF_IMAGE_RE.test(this.__sfUrl || "")) sfMarkMode("image");
        }
        if (SF_BX_URL_RE.test(this.__sfUrl || "") && bodyStr) {
          sfBxMarkModeFromReq(bodyStr);
        }
      } catch {}
      this.addEventListener("load", () => {
        try {
          const xurl = this.__sfUrl || "";
          const isFlow = SF_FLOW_RE.test(xurl);
          const isFlowLike = isFlow || SF_VIDEO_STATUS_RE.test(xurl);
          if (isFlow && this.status >= 400) {
            sfEmit("error", { url: xurl, status: this.status, prompts: this.__sfPrompts || [] });
            return;
          }
          if (this.status >= 400) return;
          // responseType 에 따라 body 접근 방법이 다르다. blob/arraybuffer 는 스킵.
          const rt = this.responseType;
          if (SF_BX_URL_RE.test(xurl) && (rt === "" || rt === "text")) {
            sfHandleBatchExecute(xurl, this.responseText || "", typeof this.__sfBody === "string" ? this.__sfBody : null);
            return;
          }
          if (rt === "json") {
            if (this.response) sfHandleFlowBody(xurl, this.response, this.__sfPrompts || [], isFlowLike);
          } else if (rt === "" || rt === "text") {
            const text = this.responseText || "";
            if (isFlowLike) {
              let parsed = null;
              try { parsed = JSON.parse(text); } catch { return; }
              sfHandleFlowBody(xurl, parsed, this.__sfPrompts || [], true);
            } else {
              sfMaybeHandleUnknownJson(xurl, text);
            }
          }
        } catch {}
      });
      this.addEventListener("error", () => {
        try {
          if (SF_FLOW_RE.test(this.__sfUrl || "")) {
            sfEmit("error", { url: this.__sfUrl, status: 0, prompts: this.__sfPrompts || [] });
          }
        } catch {}
      });
      return origSend.apply(this, arguments);
    };

    console.log("[StudioForge Flow Bridge] 네트워크 인터셉터 활성화");
  } catch (e) {
    console.warn("[StudioForge Flow Bridge] 인터셉터 설치 실패:", e);
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findPromptEditor() {
    const candidates = Array.from(
      document.querySelectorAll(
        '[data-slate-editor="true"], textarea, [contenteditable="true"], [role="textbox"]'
      )
    ).filter((el) => el instanceof HTMLElement && isVisible(el));
    // Prefer slate
    const slate = candidates.find((c) => c.matches('[data-slate-editor="true"]'));
    return slate || candidates[0] || null;
  }

  function findSlateEditorInstance(root) {
    const seen = new WeakSet();
    function walk(v, d = 0) {
      if (!v || typeof v !== "object" || seen.has(v) || d > 10) return null;
      seen.add(v);
      if (
        typeof v.insertText === "function" &&
        typeof v.onChange === "function" &&
        Array.isArray(v.children)
      ) return v;
      for (const k of [
        "memoizedProps", "memoizedState", "stateNode", "child", "sibling",
        "return", "alternate", "pendingProps", "dependencies", "node", "editor",
        "props",
      ]) {
        const f = walk(v[k], d + 1);
        if (f) return f;
      }
      return null;
    }
    let node = root;
    while (node) {
      for (const k of Object.keys(node)) {
        if (!k.startsWith("__reactFiber$") && !k.startsWith("__reactProps$")) continue;
        const f = walk(node[k]);
        if (f) return f;
      }
      node = node.parentElement;
    }
    return null;
  }

  // Try to access the global Slate Transforms/Editor via the editor instance.
  // Slate editors expose their own methods that wrap Transforms internally.
  function injectIntoSlate(editor, text) {
    const slate = findSlateEditorInstance(editor);
    if (!slate) return { ok: false, reason: "Slate editor instance를 React fiber에서 찾지 못함" };

    try {
      editor.focus();
      // 1) Select all existing content via Slate's own API
      if (slate.children && Array.isArray(slate.children)) {
        const end = [slate.children.length - 1];
        // Build a full-document selection
        try {
          slate.selection = {
            anchor: { path: [0, 0], offset: 0 },
            focus: { path: [0, 0], offset: 0 },
          };
        } catch {}
      }

      // 2) Delete existing
      if (typeof slate.deleteFragment === "function") {
        try { slate.deleteFragment(); } catch {}
      }
      // Also try select-all + delete via DOM-level API as a safety net
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false);
      } catch {}

      // 3) Insert text via Slate's insertText (handles linebreaks split manually)
      const lines = String(text).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) slate.insertText(lines[i]);
        if (i < lines.length - 1) {
          if (typeof slate.insertBreak === "function") {
            slate.insertBreak();
          } else {
            slate.insertText("\n");
          }
        }
      }

      if (typeof slate.onChange === "function") slate.onChange();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "Slate insertText 호출 실패: " + (e?.message || String(e)) };
    }
  }

  function injectIntoTextarea(el, text) {
    try {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      el.focus();
      setter.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "textarea native setter 실패: " + e.message };
    }
  }

  async function setPromptText(text) {
    const editor = findPromptEditor();
    if (!editor) return { ok: false, reason: "프롬프트 에디터를 찾지 못함" };

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      return injectIntoTextarea(editor, text);
    }
    return injectIntoSlate(editor, text);
  }

  // Listen for postMessage requests from ISOLATED content script
  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__sfChannel !== "sf-flow-bridge") return;
    if (data.type !== "SET_PROMPT_TEXT") return;

    const result = await setPromptText(data.text || "");
    window.postMessage(
      {
        __sfChannel: "sf-flow-bridge",
        type: "SET_PROMPT_TEXT_RESULT",
        requestId: data.requestId,
        result,
      },
      "*"
    );
  });

  console.log("[StudioForge Flow Bridge] MAIN world injected");
})();
