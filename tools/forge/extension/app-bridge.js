const SUPABASE_URL = "http://localhost:8765"; // [캐릭터 공방] 로컬 서버

// background.js 가 401 을 감지하면 이 content script 에 REQUEST_FRESH_TOKEN 을 보낸다.
// 그러면 우리는 페이지 안(MAIN world)의 ExtensionTokenBridge 에 window.postMessage 로
// 재전송을 요청해서 Supabase 가 자동 갱신한 최신 세션을 즉시 확장으로 흘려보낸다.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "REQUEST_FRESH_TOKEN") {
    try {
      window.postMessage({ __sfChannel: "sf-request-token" }, window.location.origin);
    } catch {}
  }
});

function isAuthPayload(data) {
  return data && data.source === "studioforge-web" && data.type === "STUDIOFORGE_FLOW_AUTH";
}

function isClearPayload(data) {
  return data && data.source === "studioforge-web" && data.type === "STUDIOFORGE_FLOW_AUTH_CLEAR";
}

function isCancelPayload(data) {
  return data && data.source === "studioforge-web" && data.type === "STUDIOFORGE_FLOW_CANCEL";
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const data = event.data;

  if (isAuthPayload(data)) {
    if (!data.accessToken) return;

    const nextState = {
      token: data.accessToken,
      refreshToken: data.refreshToken || null,
      supabaseUrl: SUPABASE_URL,
      running: true,
      lastStatus: "웹앱 세션이 자동 연결됨",
    };
    // 프로필별 워커 ID — 이 확장은 같은 프로필의 웹앱이 만든 잡만 claim 한다.
    // (두 크롬 프로필에서 같은 계정으로 동시 작업 시 잡이 섞이는 문제 방지)
    if (data.workerId) nextState.workerId = data.workerId;

    const current = await chrome.storage.local.get(["token", "refreshToken", "running", "workerId"]);
    const changed =
      current.token !== nextState.token ||
      current.refreshToken !== nextState.refreshToken ||
      (data.workerId && current.workerId !== data.workerId) ||
      current.running !== true;

    await chrome.storage.local.set(nextState);

    if (changed) {
      try {
        await chrome.runtime.sendMessage({ type: "START_POLLING" });
      } catch (error) {
        console.warn("[Flow Bridge] failed to start polling from app bridge", error);
      }
    }

    return;
  }

  if (isClearPayload(data)) {
    await chrome.storage.local.set({
      token: null,
      refreshToken: null,
      running: false,
      lastStatus: "웹앱에서 로그아웃됨",
    });

    try {
      await chrome.runtime.sendMessage({ type: "STOP_POLLING" });
    } catch (error) {
      console.warn("[Flow Bridge] failed to stop polling from app bridge", error);
    }
    return;
  }

  if (isCancelPayload(data)) {
    try {
      await chrome.runtime.sendMessage({
        type: "CANCEL_FLOW_JOBS",
        sceneIds: Array.isArray(data.sceneIds) ? data.sceneIds : null,
      });
    } catch (error) {
      console.warn("[Flow Bridge] failed to send cancel to background", error);
    }
  }
});