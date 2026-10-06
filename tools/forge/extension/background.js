// 교재 공방 Flow Bridge - Background Service Worker
// [교재 공방 포크] 잡 서버는 Supabase 대신 로컬 교재 공방(tools/forge/server.py, 기본 http://localhost:8766). 끝점 모양은 같다.
// 제출 간격·속도 제한·결과 매칭 로직은 캐릭터 공방 확장과 완전히 같다 (바꾸지 않는다).

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imptd3hnZXZ2dWVydWxmd2dkdG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDc1MzgsImV4cCI6MjA5MzAyMzUzOH0.Zu8-gEijeRZu3nCiky4jP5_W15knVFPfdiIOAoV0WQI";

// 웹앱 탭 URL 패턴 — 배포(lovable.app) + 로컬 개발 서버(localhost, 127.0.0.1).
// 새 도메인을 추가할 때는 manifest.json 의 host_permissions / content_scripts.matches
// 에도 같은 패턴을 추가해야 app-bridge.js 주입 & chrome.tabs.query 가 함께 동작한다.
const WEB_APP_TAB_PATTERNS = [
  "https://*.lovable.app/*",
  "https://*.vercel.app/*",
  "http://localhost/*",
  "http://localhost:*/*",
  "http://127.0.0.1/*",
  "http://127.0.0.1:*/*",
];

let pollIntervalId = null;
// Flow Ultra 기준으로 제출 페이싱을 공격적으로 단축(기존 8000=분당 ~7.5잡 → 분당 ~24잡).
// 실제 제출 속도는 content.js 의 입력 락(프롬프트 입력+Submit DOM 처리, 잡당 수 초)과
// SF_RATE 가 함께 결정하므로, 이 값을 더 낮춰도 그 한계 아래로는 안 빨라진다.
// 한도를 넘겨 Flow 가 거부하면 그 잡은 "실패" 처리되어 수동 재생성이 필요하니, 실패가
// 보이면 이 값/SF_RATE.limit 를 한 단계 올려(느리게) 잡으면 된다.
const POLL_INTERVAL_MS = 2500;
let pollInFlight = false;
let activeJobs = 0;
// MAX_CONCURRENT_JOBS 는 "결과 대기까지 포함한 동시 잡 수"의 상한이며,
// 이 값이 작으면 이전 잡의 결과(수초~수분) 수신까지 기다려야 다음 잡이 claim 되어
// 전체가 직렬화된다. 제출 구간(프롬프트 입력+Submit)의 동시 실행은 content.js 의
// imageJobChain/videoJobChain 락으로 방지하므로 여기서는 넉넉히 허용해
// "이전 잡이 결과 대기 중인 동안 다음 잡이 제출"되는 병렬 파이프라인을 유지.
// 울트라에서 더 많은 잡을 동시에 결과 대기시키도록 8 → 12 로 상향. (너무 키우면
// Flow 내부 대기열에 쌓여 결과 대기 180초를 넘겨 가짜 실패가 날 수 있어 12 로 절충.)
const MAX_CONCURRENT_JOBS = 12;
// 취소된 scene id 집합 — 새로 폴링된 잡이 이 집합에 속하면 즉시 폐기
const cancelledSceneIds = new Set();
let cancelAllUntil = 0; // 이 timestamp 이전에 폴링된 잡은 모두 폐기

async function setStatus(text) {
  await chrome.storage.local.set({ lastStatus: text });
  try {
    chrome.runtime.sendMessage({ type: "STATUS_UPDATE", text });
  } catch {}
  console.log("[Flow Bridge]", text);
}

async function getConfig() {
  const cfg = await chrome.storage.local.get([
    "token",
    "refreshToken",
    "running",
    "supabaseUrl",
    "workerId",
  ]);
  // [교재 공방] 게임 공방 주소(8765)가 저장돼 있으면 교재 공방(8766)으로 바로잡는다
  if (cfg.supabaseUrl && /:8765\b/.test(cfg.supabaseUrl)) {
    cfg.supabaseUrl = cfg.supabaseUrl.replace(":8765", ":8766");
    await chrome.storage.local.set({ supabaseUrl: cfg.supabaseUrl });
  }
  return cfg;
}

async function refreshAccessToken() {
  const { refreshToken, supabaseUrl } = await getConfig();
  if (!refreshToken || !supabaseUrl) return null;
  try {
    const resp = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!resp.ok) {
      await setStatus(`토큰 갱신 실패 (${resp.status}) — 웹앱에서 토큰을 다시 복사하세요`);
      return null;
    }
    const data = await resp.json();
    if (data.access_token) {
      await chrome.storage.local.set({
        token: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
      });
      return data.access_token;
    }
  } catch (e) {
    console.warn("[Flow Bridge] refresh failed", e);
  }
  return null;
}

// 웹앱 탭들에 "최신 토큰 다시 보내달라"고 요청. 최대 3초 대기 후 storage 의
// token 이 바뀌었는지 확인. content script(app-bridge.js) 가 이 메시지를 받아
// 페이지의 ExtensionTokenBridge 로 window.postMessage 를 전파한다.
async function requestFreshTokenFromWebApp(waitMs = 3000) {
  const webAppTabs = await chrome.tabs.query({ url: WEB_APP_TAB_PATTERNS });
  if (webAppTabs.length === 0) return null;

  const before = (await chrome.storage.local.get(["token"]))?.token || "";
  for (const t of webAppTabs) {
    try {
      await chrome.tabs.sendMessage(t.id, { type: "REQUEST_FRESH_TOKEN" });
    } catch {
      // content script 가 아직 로드 안 됐을 수 있음 — 무시
    }
  }

  // storage 갱신 대기 (app-bridge.js 가 새 토큰을 넣기까지)
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const cur = (await chrome.storage.local.get(["token"]))?.token || "";
    if (cur && cur !== before) return cur;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function callEdge(fnName, body) {
  const { token, supabaseUrl } = await getConfig();
  if (!token || !supabaseUrl) throw new Error("Not configured");
  const doFetch = async (accessToken) =>
    fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body || {}),
    });

  let resp = await doFetch(token);
  if (resp.status === 401) {
    // 1차: refresh_token 으로 자동 갱신 시도
    const fresh = await refreshAccessToken();
    if (fresh) {
      resp = await doFetch(fresh);
    } else {
      // 2차: 웹앱 탭의 ExtensionTokenBridge 에 "새 토큰 보내달라" 요청
      await setStatus("토큰 만료 — 웹앱에 재요청 중");
      const reissued = await requestFreshTokenFromWebApp(5000);
      if (reissued) {
        await setStatus("웹앱으로부터 새 토큰 수신");
        resp = await doFetch(reissued);
      }
    }
  }
  if (!resp.ok) throw new Error(`${fnName} ${resp.status}`);
  return await resp.json();
}

const GROK_TAB_PATTERNS = [
  "https://grok.com/imagine*",
  "https://grok.com/imagine",
];

// ensureFlowTab 는 2.5초마다 잡이 들어올 때마다 불리는데, 탭을 "URL 패턴 검색"으로만
// 찾으면 두 가지 경우에 매 잡마다 새 탭을 열어버린다:
//   (1) 방금 만든 탭이 아직 로딩 중이라 url 이 미확정 → 검색에 안 걸림 (경쟁 상태)
//   (2) 만든 탭이 로그인 페이지 등으로 리다이렉트돼 패턴을 영영 벗어남 → 무한 새 탭
// 그래서 생성은 promise 로 공유해 한 번만 하고, 만든/찾은 탭은 id 로 기억해 URL 과
// 무관하게 재사용한다. 탭이 닫히면 onRemoved 에서 id 를 비운다.
const flowTabState = {
  flow: { id: null, creating: null },
  grok: { id: null, creating: null },
};

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const s of Object.values(flowTabState)) {
    if (s.id === tabId) s.id = null;
  }
});

async function ensureFlowTab(job) {
  const isGrok = job?.flow_model === "grok-imagine";
  const kind = isGrok ? "grok" : "flow";
  const state = flowTabState[kind];
  // 2026-09: Flow 가 labs.google/fx → flow.google.com 으로 이전. 옛 주소는
  // 새 도메인으로 리다이렉트되므로 둘 다 "우리 탭"으로 인정한다.
  const patterns = isGrok
    ? GROK_TAB_PATTERNS
    : ["https://labs.google/fx/*", "https://flow.google.com/*"];
  const urlPrefixes = isGrok
    ? ["https://grok.com/imagine"]
    : ["https://labs.google/fx/", "https://flow.google.com/"];
  const createUrl = isGrok ? "https://grok.com/imagine" : "https://flow.google.com/";

  // 1) 기억해 둔 탭이 아직 살아있으면 무조건 재사용
  if (state.id != null) {
    try {
      const tab = await chrome.tabs.get(state.id);
      if (tab) {
        if (
          tab.url &&
          !urlPrefixes.some((p) => tab.url.startsWith(p)) &&
          tab.status === "complete"
        ) {
          await setStatus(`자동화 탭이 예상 밖 주소에 있음 (로그인 필요?): ${tab.url}`);
        }
        return tab;
      }
    } catch {
      state.id = null;
    }
  }

  // 2) 사용자가 직접 열어둔 탭 검색 (확정 URL 기준)
  const tabs = await chrome.tabs.query({ url: patterns });
  if (tabs.length > 0) {
    state.id = tabs[0].id;
    return tabs[0];
  }
  // 로딩 중이라 url 이 아직 비어있는 탭은 pendingUrl 로 잡는다
  const all = await chrome.tabs.query({});
  const loading = all.find((t) =>
    urlPrefixes.some((p) => (t.pendingUrl || "").startsWith(p))
  );
  if (loading) {
    state.id = loading.id;
    return loading;
  }

  // 3) 정말 없을 때만 새로 연다 — 동시 잡이 몰려도 생성은 한 번만
  if (!state.creating) {
    state.creating = chrome.tabs
      .create({ url: createUrl, active: false })
      .then((tab) => {
        state.id = tab.id;
        return tab;
      })
      .finally(() => {
        state.creating = null;
      });
  }
  return await state.creating;
}

// content.js가 살아있는지 ping. 없으면 programmatic 주입 후 재시도.
// ⚠ manifest.json 의 content_scripts 가 document_idle 에 자동 주입되므로,
// 탭이 막 로드된 시점엔 ping 이 일시적으로 false 를 반환할 수 있다. 이때
// 즉시 executeScript 로 재주입하면 manifest 주입과 충돌해
// "SyntaxError: Identifier 'SLEEP' has already been declared" 로 깨지고
// 현재 처리 중이던 RUN_FLOW_JOB 메시지가 유실된다. ping 을 여러 번 재시도해
// manifest 주입이 완료될 기회를 먼저 주고, 그래도 실패할 때만 강제 주입.
async function ensureContentScript(tabId, job) {
  const isGrok = job?.flow_model === "grok-imagine";
  const ping = () =>
    new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type: "PING" }, (resp) => {
          if (chrome.runtime.lastError) resolve(false);
          else resolve(resp?.ok === true);
        });
      } catch {
        resolve(false);
      }
    });

  if (await ping()) return true;
  // manifest content_scripts 자동 주입이 완료되길 최대 ~2초 대기
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 333));
    if (await ping()) return true;
  }
  // 2초 기다려도 content script 없음 → 수동 주입 (SyntaxError 충돌 가능성 낮음)
  try {
    if (isGrok) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["grok-content.js"],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["grok-injected.js"],
        world: "MAIN",
      });
    } else {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["injected.js"],
        world: "MAIN",
      });
    }
  } catch (e) {
    console.warn("[Flow Bridge] inject failed", e);
  }
  // 주입 직후 잠깐 대기 후 한번 더 ping
  await new Promise((r) => setTimeout(r, 500));
  return await ping();
}

function safeSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || "tab message failed"));
        else resolve(resp);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function processJob(job) {
  // 폴링 직후 취소된 잡 폐기
  if (Date.now() < cancelAllUntil || (job.scene_id && cancelledSceneIds.has(job.scene_id))) {
    try {
      await callEdge("flow-job-complete", { job_id: job.id, error: "사용자 중단" });
    } catch {}
    await setStatus(`중단된 잡 폐기: #${job.id.slice(0, 8)}`);
    return;
  }
  activeJobs++;
  await setStatus(`작업 #${job.id.slice(0, 8)} 시작 (동시 처리 ${activeJobs}건)`);
  const tab = await ensureFlowTab(job);

  try {
    const ready = await ensureContentScript(tab.id, job);
    if (!ready) throw new Error("자동화 탭에 content script를 주입할 수 없습니다 (탭 새로고침 필요)");

    const result = await safeSendMessage(tab.id, {
      type: "RUN_FLOW_JOB",
      job,
    });

    if (result?.error) {
      await callEdge("flow-job-complete", { job_id: job.id, error: result.error });
      await setStatus(`실패: ${result.error}`);
      return;
    }

    if (result?.image_base64) {
      await callEdge("flow-job-complete", {
        job_id: job.id,
        image_base64: result.image_base64,
        image_mime: result.image_mime || "image/png",
      });
      await setStatus(`완료: #${job.id.slice(0, 8)}`);
    } else if (result?.image_url) {
      try {
        // 신 Flow(flow.google.com / flow-content.google)의 결과 URL 은 로그인
        // 쿠키가 있어야 내려받아지는 경우가 있다 — host_permissions 에 등록된
        // 도메인이므로 쿠키 포함 요청이 허용된다. (옛 fifeUrl 은 쿠키를 무시)
        const r = await fetch(result.image_url, { credentials: "include" });
        if (!r.ok) throw new Error(`다운로드 실패 ${r.status}`);
        let mime = r.headers.get("content-type") || "";
        if (!mime) {
          // URL 끝 확장자로 유추 (Veo blob URL은 content-type이 octet-stream일 수 있음)
          const u = result.image_url.toLowerCase();
          if (u.includes(".mp4")) mime = "video/mp4";
          else if (u.includes(".webm")) mime = "video/webm";
          else mime = "image/png";
        }
        // job_type 기반 fallback (video 잡인데 octet-stream으로 오는 경우)
        if (job.job_type === "video" && !mime.startsWith("video/")) {
          mime = "video/mp4";
        }
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        await callEdge("flow-job-complete", {
          job_id: job.id,
          image_base64: base64,
          image_mime: mime,
          image_url: result.image_url, // [캐릭터 공방] 플로우 에셋 주소 기록
        });
        await setStatus(`완료: #${job.id.slice(0, 8)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await callEdge("flow-job-complete", { job_id: job.id, error: `URL 다운로드 실패: ${msg}` });
        await setStatus(`오류: ${msg}`);
      }
    } else {
      await callEdge("flow-job-complete", { job_id: job.id, error: "결과 없음" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await callEdge("flow-job-complete", { job_id: job.id, error: msg });
    await setStatus(`오류: ${msg}`);
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

async function pollOnce() {
  if (pollInFlight) return;
  if (activeJobs >= MAX_CONCURRENT_JOBS) return;
  pollInFlight = true;
  const { running, workerId } = await getConfig();
  if (!running) {
    pollInFlight = false;
    return;
  }
  try {
    // worker_id 를 보내면 서버가 "이 프로필에서 만든 잡 + 워커 미지정(legacy) 잡"만 반환.
    // 다른 크롬 프로필에서 만든 잡은 그 프로필의 확장이 처리한다.
    const { job } = await callEdge("flow-job-claim", { worker_id: workerId || null });
    if (job) {
      // Fire-and-forget: 이전 잡 완료를 기다리지 않고 7초 후 다음 잡 폴링
      processJob(job).catch((e) => console.warn("[Flow Bridge] processJob error", e));
    } else {
      if (activeJobs === 0) await setStatus("대기 중 (잡 없음)");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setStatus(`폴링 오류: ${msg}`);
  } finally {
    pollInFlight = false;
  }
}

function startPolling() {
  if (pollIntervalId) return;
  pollIntervalId = setInterval(pollOnce, POLL_INTERVAL_MS);
  pollOnce();
}

function stopPolling() {
  if (pollIntervalId) clearInterval(pollIntervalId);
  pollIntervalId = null;
}

// ============================================================
// Chrome DevTools Protocol (CDP) 를 이용한 진짜 사용자 이벤트 주입.
// dispatchEvent 로 만드는 합성 이벤트(isTrusted=false)는 Flow(Next.js/Radix/Slate)
// 에서 부분적으로 무시되거나 React 내부 상태를 깨서 "Application error" 크래시를
// 유발한다. CDP Input.dispatchMouseEvent / Input.insertText 는 OS 레벨 이벤트를
// 주입해 isTrusted=true 로 인식되며 수동 조작과 완전히 동일한 흐름으로 동작한다.
// ============================================================
const cdpAttachedTabs = new Set();

async function cdpAttach(tabId) {
  if (cdpAttachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    cdpAttachedTabs.add(tabId);
  } catch (e) {
    const msg = e?.message || String(e);
    if (/already attached/i.test(msg)) {
      cdpAttachedTabs.add(tabId);
      return;
    }
    throw e;
  }
}

async function cdpSend(tabId, method, params) {
  await cdpAttach(tabId);
  return await chrome.debugger.sendCommand({ tabId }, method, params || {});
}

async function cdpClickAt(tabId, x, y) {
  const base = { x, y, button: "left", clickCount: 1, buttons: 1 };
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", ...base });
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
}

// 캔버스 이미지를 입력창으로 끌어다 놓는 진짜 마우스 드래그 — 2단계.
// Flow 의 "+소재 추가" 드롭 슬롯은 버튼을 누른 채 입력창 위에 머물러야 나타나므로,
// (1) HOLD: press → 임계값 통과 미세 이동 → 다단계 이동 → 타겟 위에서 버튼 쥔 채 유지
// (2) content.js 가 슬롯 등장을 DOM 폴링으로 확인
// (3) RELEASE: 슬롯 중심으로 살짝 이동(dragover 재발화) 후 release
// 로 나눠 슬롯이 뜨기 전에 놓아버리는 문제를 없앤다.
async function cdpDragHold(tabId, sx, sy, tx, ty) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await cdpSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: sx, y: sy });
  await sleep(40);
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x: sx, y: sy, button: "left", buttons: 1, clickCount: 1,
  });
  await sleep(90);
  // 드래그 임계값(보통 5px) 통과용 미세 이동 — dnd 라이브러리가 "드래그 시작"으로 인식.
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x: sx + 4, y: sy + 4, button: "left", buttons: 1,
  });
  await sleep(60);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const x = sx + ((tx - sx) * i) / steps;
    const y = sy + ((ty - sy) * i) / steps;
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x, y, button: "left", buttons: 1,
    });
    await sleep(16);
  }
  // 타겟 위에서 살짝 흔들어 pointermove/dragover 가 확실히 발생하도록 한다.
  await sleep(80);
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x: tx + 2, y: ty, button: "left", buttons: 1,
  });
  await sleep(60);
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x: tx, y: ty, button: "left", buttons: 1,
  });
  // 버튼은 쥔 채로 반환 — content.js 가 슬롯 확인 후 RELEASE 를 보낸다.
}

async function cdpDragReleaseAt(tabId, x, y) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 릴리스 지점(슬롯 중심)으로 이동해 드롭 타겟 위 dragover 를 재발화.
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "left", buttons: 1,
  });
  await sleep(120);
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "left", buttons: 1,
  });
  await sleep(60);
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
  });
}

async function cdpKey(tabId, { key, code, virtualKeyCode, modifiers = 0, text }) {
  const base = { modifiers, key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode };
  await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...base, text });
  await cdpSend(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// 현재 포커스된 에디터의 내용을 Ctrl+A + Delete 로 비운다.
async function cdpClearEditor(tabId) {
  // Ctrl+A
  await cdpKey(tabId, { key: "a", code: "KeyA", virtualKeyCode: 65, modifiers: 2 });
  // Delete (또는 Backspace — 둘 다 시도)
  await cdpKey(tabId, { key: "Delete", code: "Delete", virtualKeyCode: 46 });
}

// 포커스된 입력 필드에 텍스트 삽입. isTrusted=true 의 beforeinput(inputType=insertText)
// 이벤트가 발동되어 Slate 등이 정상적으로 처리.
async function cdpInsertText(tabId, text) {
  // ⚠ 개행에 Enter 키를 쓰면 Flow(및 대부분의 chat UI)가 Submit 으로 해석해
  // 프롬프트의 첫 줄만 단독으로 제출되고, 이후 줄마다 다시 Submit 이 발동해
  // "짧게 끊긴 프롬프트가 여러 번 생성되는" 폭증 버그가 발생한다.
  // → 개행 자체를 공백으로 치환해 단일 insertText 로 주입.
  // (실제 LLM 프롬프트는 줄바꿈 유무로 결과가 크게 달라지지 않는다.)
  const normalized = String(text).replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ");
  if (normalized.length === 0) return;
  await cdpSend(tabId, "Input.insertText", { text: normalized });
}

async function cdpDetach(tabId) {
  if (!cdpAttachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch {}
  cdpAttachedTabs.delete(tabId);
}

// 탭이 닫히거나 사용자가 직접 DevTools 를 열어 우리 attach 가 끊겼을 때 정리
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    cdpAttachedTabs.delete(source.tabId);
    console.log("[Flow Bridge] CDP detached", source.tabId, reason);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  cdpAttachedTabs.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_IMAGE") {
    // [교재 공방] 참조 그림을 확장(백그라운드)에서 받아 base64 로 돌려준다 — 페이지 CSP 와 무관
    (async () => {
      try {
        const r = await fetch(msg.url, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const buf = await r.arrayBuffer();
        let bin = ""; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        sendResponse({ ok: true, base64: btoa(bin), type: r.headers.get("content-type") || "image/png" });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;   // 비동기 응답
  }
  if (msg.type === "START_POLLING") {
    startPolling();
    sendResponse({ ok: true });
  } else if (msg.type === "STOP_POLLING") {
    stopPolling();
    sendResponse({ ok: true });
  } else if (msg.type === "CANCEL_FLOW_JOBS") {
    const ids = Array.isArray(msg.sceneIds) ? msg.sceneIds : null;
    if (ids && ids.length > 0) {
      for (const id of ids) cancelledSceneIds.add(id);
    } else {
      cancelAllUntil = Date.now() + 60_000; // 60초 동안 새로 폴링되는 잡 모두 폐기
    }
    // 모든 자동화 탭(Flow + Grok)의 content script 에 전파해 진행 중 잡도 abort
    chrome.tabs
      .query({ url: ["https://labs.google/fx/*", "https://flow.google.com/*", ...GROK_TAB_PATTERNS] })
      .then((tabs) => {
        for (const t of tabs) {
          safeSendMessage(t.id, { type: "CANCEL_FLOW_JOBS", sceneIds: ids }).catch(() => {});
        }
      });
    sendResponse({ ok: true });
  } else if (msg.type === "CDP_CLICK" || msg.type === "CDP_TYPE") {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no tab id" });
      return false;
    }
    (async () => {
      try {
        if (msg.type === "CDP_CLICK") {
          await cdpClickAt(tabId, msg.x, msg.y);
          sendResponse({ ok: true });
        } else {
          // CDP_TYPE: x,y 좌표로 focus 후 기존 내용 지우고 텍스트 입력
          if (typeof msg.x === "number" && typeof msg.y === "number") {
            await cdpClickAt(tabId, msg.x, msg.y);
            await new Promise((r) => setTimeout(r, 150));
          }
          if (msg.clearFirst !== false) {
            await cdpClearEditor(tabId);
            await new Promise((r) => setTimeout(r, 80));
          }
          await cdpInsertText(tabId, msg.text || "");
          sendResponse({ ok: true });
        }
      } catch (e) {
        const errMsg = e?.message || String(e);
        console.warn("[Flow Bridge] CDP 명령 실패:", msg.type, errMsg);
        sendResponse({ ok: false, error: errMsg });
      }
    })();
    return true; // async
  } else if (msg.type === "CDP_DRAG_HOLD" || msg.type === "CDP_DRAG_RELEASE") {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no tab id" });
      return false;
    }
    (async () => {
      try {
        if (msg.type === "CDP_DRAG_HOLD") {
          await cdpDragHold(tabId, msg.sx, msg.sy, msg.tx, msg.ty);
        } else {
          await cdpDragReleaseAt(tabId, msg.x, msg.y);
        }
        sendResponse({ ok: true });
      } catch (e) {
        const errMsg = e?.message || String(e);
        console.warn("[Flow Bridge]", msg.type, "실패:", errMsg);
        sendResponse({ ok: false, error: errMsg });
      }
    })();
    return true; // async
  }
  return true;
});

// Auto-start on service worker boot if running flag is set
chrome.storage.local.get(["running"]).then(({ running }) => {
  if (running) startPolling();
});