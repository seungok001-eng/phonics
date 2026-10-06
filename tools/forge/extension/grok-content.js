// StudioForge Flow Bridge - Grok Content Script
// grok.com/imagine 페이지에서 동영상 생성 자동화.
// background.js 의 RUN_FLOW_JOB 메시지를 받아 처리하고, 결과는 image_url 또는 error 로 반환.
// flow-job-complete 업로드는 background.js 가 image_url 을 fetch → base64 변환해서 처리한다.

var __SF_GROK_BRIDGE_LOADED__;
if (__SF_GROK_BRIDGE_LOADED__) {
  throw new Error("[Grok Bridge] content script already loaded — duplicate injection aborted");
}
__SF_GROK_BRIDGE_LOADED__ = true;

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function gNormalize(s) {
  return String(s || "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// 네트워크 캡처 (grok-injected.js → 여기로 postMessage)
// ============================================================
const G_NET = {
  // pending response items (prompt-매칭 대기 중)
  pendingResponses: [], // [{ items: [{ url, prompt, mediaType }], at }]
  waiters: [], // [{ normPrompt, jobId, sceneId, mediaType, createdAt, resolve, reject, timer }]
  // 최근에 매칭된 url 셋 — 재공유 방지용
  consumedUrls: new Set(),
};

function gTryMatch() {
  const remaining = [];
  for (const resp of G_NET.pendingResponses) {
    const leftover = [];
    for (const item of resp.items) {
      if (G_NET.consumedUrls.has(item.url)) continue;
      const itemPromptN = gNormalize(item.prompt);
      const sorted = [...G_NET.waiters].sort((a, b) => a.createdAt - b.createdAt);
      let matched = false;
      for (const w of sorted) {
        if (w.mediaType && item.mediaType && w.mediaType !== item.mediaType) continue;
        if (!itemPromptN || !w.normPrompt) continue;
        if (itemPromptN !== w.normPrompt) continue;
        clearTimeout(w.timer);
        const idx = G_NET.waiters.indexOf(w);
        if (idx >= 0) G_NET.waiters.splice(idx, 1);
        G_NET.consumedUrls.add(item.url);
        w.resolve({ image_url: item.url });
        matched = true;
        break;
      }
      if (!matched) leftover.push(item);
    }
    if (leftover.length > 0) remaining.push({ ...resp, items: leftover });
  }
  G_NET.pendingResponses = remaining;

  // 1시간 지난 consumedUrls 정리
  if (G_NET.consumedUrls.size > 500) {
    G_NET.consumedUrls.clear();
  }
}

function gRegisterWaiter({ prompt, jobId, sceneId, mediaType = "video", timeoutMs = 8 * 60 * 1000 }) {
  return new Promise((resolve, reject) => {
    const w = {
      normPrompt: gNormalize(prompt),
      jobId,
      sceneId,
      mediaType,
      createdAt: Date.now(),
      resolve,
      reject,
      timer: null,
    };
    w.timer = setTimeout(() => {
      const idx = G_NET.waiters.indexOf(w);
      if (idx >= 0) G_NET.waiters.splice(idx, 1);
      reject(new Error(`Grok 응답 timeout (${timeoutMs}ms) — 네트워크 인터셉트 매칭 실패`));
    }, timeoutMs);
    G_NET.waiters.push(w);
    gTryMatch();
  });
}

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.__sfChannel !== "sf-flow-bridge" || d.type !== "GROK_CAPTURE") return;
  if (d.phase === "response" && Array.isArray(d.items) && d.items.length > 0) {
    G_NET.pendingResponses.push({ items: d.items, at: Date.now() });
    gTryMatch();
  } else if (d.phase === "error") {
    console.warn(`[Grok Bridge] 응답 오류 (status=${d.status}, url=${d.url})`);
  }
});

// ============================================================
// 입력 직렬화 — Grok은 동시 1잡만 처리 (보수적)
// ============================================================
let inputLockChain = Promise.resolve();
function withInputLock(fn) {
  const next = inputLockChain.then(() => fn()).catch((e) => {
    console.warn("[Grok Bridge] inputLock task error", e);
    throw e;
  });
  inputLockChain = next.catch(() => {});
  return next;
}

// ============================================================
// DOM 헬퍼 — Grok Imagine 사이트의 셀렉터들
// ⚠ Grok 사이트는 자주 변경됨. 이 셀렉터들이 안 맞으면 오류 메시지에서 발견.
// ============================================================

const GROK_SELECTORS = {
  // 비디오 생성용 textarea (참조: brndnsmth/grok-imagine-downloader)
  promptTextareaCandidates: [
    "textarea[placeholder*='customize video' i]",
    "textarea[placeholder*='video' i]",
    "textarea[placeholder*='animate' i]",
    "textarea[placeholder*='imagine' i]",
    "textarea[aria-label*='video' i]",
    "textarea[aria-label*='prompt' i]",
    "textarea",
  ],
  // 이미지/비디오 카드 컨테이너
  cardCandidates: [
    "[class*='media-post-masonry-card']",
    "[class*='masonry-card']",
    "article[class*='media-post']",
    "[data-testid*='media-card']",
  ],
  // 카드 안 비디오 element
  videoEl: "video[src*='.mp4'], video[src*='blob:'], video#sd-video, video#hd-video, video",
  // 파일 업로드 input
  fileInputCandidates: [
    "input[type='file'][accept*='image']",
    "input[type='file']",
  ],
  // 생성 버튼 후보 — 텍스트로 매칭하는 게 안전
  generateButtonTexts: [
    /^(generate|imagine|create|animate|run|submit|go|make video)$/i,
  ],
};

function findFirstMatching(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function findVisible(selectors) {
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      return el;
    }
  }
  return null;
}

function findGenerateButton() {
  const candidates = Array.from(document.querySelectorAll("button, [role='button']"));
  for (const btn of candidates) {
    if (!(btn instanceof HTMLElement)) continue;
    if (btn.disabled) continue;
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const text = (btn.textContent || "").trim();
    if (!text) continue;
    if (GROK_SELECTORS.generateButtonTexts.some((re) => re.test(text))) {
      return btn;
    }
  }
  // fallback: form 안의 submit 버튼
  const submit = document.querySelector("form button[type='submit']");
  if (submit instanceof HTMLElement) return submit;
  return null;
}

async function waitForElement(finder, { timeoutMs = 10000, intervalMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = finder();
    if (el) return el;
    await SLEEP(intervalMs);
  }
  return null;
}

// CDP 를 통한 진짜 키 입력 (background 로 위임)
function cdpType(text, x, y, clearFirst = true) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CDP_TYPE", text, x, y, clearFirst },
      (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message });
        resolve(resp || { ok: false });
      },
    );
  });
}

function cdpClick(x, y) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CDP_CLICK", x, y }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(resp || { ok: false });
    });
  });
}

function elementCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

// ============================================================
// 이미지 첨부 — source_image_url 을 fetch 해서 input[type='file'] 에 주입
// ============================================================
async function attachImageFromUrl(url) {
  const fileInput = await waitForElement(
    () => findFirstMatching(GROK_SELECTORS.fileInputCandidates),
    { timeoutMs: 6000 },
  );
  if (!fileInput) {
    throw new Error("Grok 이미지 업로드 input 을 찾을 수 없습니다");
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`소스 이미지 다운로드 실패 (${resp.status})`);
  const blob = await resp.blob();
  const ext = blob.type.includes("png") ? "png"
    : blob.type.includes("webp") ? "webp"
    : "jpg";
  const file = new File([blob], `source.${ext}`, { type: blob.type || "image/jpeg" });

  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  await SLEEP(800);
}

// ============================================================
// 프롬프트 입력
// ============================================================
async function typePromptIntoTextarea(prompt) {
  const ta = await waitForElement(
    () => findVisible(GROK_SELECTORS.promptTextareaCandidates),
    { timeoutMs: 10000 },
  );
  if (!ta) throw new Error("Grok 프롬프트 textarea 를 찾을 수 없습니다");
  ta.focus();
  const { x, y } = elementCenter(ta);
  // 1차: CDP insertText (isTrusted=true 이벤트)
  const r = await cdpType(prompt, x, y, true);
  if (r?.ok) {
    await SLEEP(150);
    return ta;
  }
  // 2차: 직접 value 세팅 + input 이벤트
  console.warn("[Grok Bridge] CDP type 실패 — fallback 으로 value 세팅");
  ta.value = prompt;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.dispatchEvent(new Event("change", { bubbles: true }));
  await SLEEP(150);
  return ta;
}

// ============================================================
// Generate 버튼 클릭
// ============================================================
async function clickGenerate() {
  const btn = await waitForElement(findGenerateButton, { timeoutMs: 5000 });
  if (!btn) throw new Error("Grok Generate 버튼을 찾을 수 없습니다");
  // disabled 풀릴 때까지 잠깐 대기
  for (let i = 0; i < 20; i++) {
    if (!btn.disabled && btn.getAttribute("aria-disabled") !== "true") break;
    await SLEEP(200);
  }
  const { x, y } = elementCenter(btn);
  const r = await cdpClick(x, y);
  if (!r?.ok) {
    btn.click();
  }
}

// ============================================================
// 입력 화면 복원 — 직전 제출로 결과 화면으로 넘어갔으면 "뒤로 가기"로 입력 화면을 되살린다.
// 사용자가 수동으로 하던 "제출하면 화면이 바뀌니 다음엔 뒤로가기 한 번" 을 자동화한 것.
// ⚠ location.href 강제 이동은 사용자가 수동 설정한 비율·길이를 날리므로 쓰지 않는다.
//   grok.com/imagine 은 SPA라 history.back() 은 클라이언트 라우팅 → 콘텐트 스크립트가 유지된다.
// ============================================================
async function ensureGrokInputReady() {
  // 이미 입력 화면(프롬프트 textarea 보임)이면 바로 진행 — 첫 작업은 back 없이.
  if (findVisible(GROK_SELECTORS.promptTextareaCandidates)) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    console.log("[Grok Bridge] 입력 화면이 아니라 뒤로가기로 복원 시도", attempt + 1);
    try {
      history.back();
    } catch (e) {
      console.warn("[Grok Bridge] history.back 실패", e);
    }
    const ta = await waitForElement(
      () => findVisible(GROK_SELECTORS.promptTextareaCandidates),
      { timeoutMs: 6000 },
    );
    if (ta) {
      // 라우팅 직후 입력 위젯이 다 붙도록 잠깐 더 대기.
      await SLEEP(400);
      return;
    }
  }
  throw new Error(
    "Grok 동영상 생성 입력 화면을 찾지 못했습니다. grok.com 에서 동영상 생성 화면(이미지+프롬프트 입력)을 열어둔 상태로 다시 시도하세요.",
  );
}

// ============================================================
// 잡 실행 본체
// ============================================================
async function runGrokVideoJob(job) {
  const prompt = String(job.prompt || "").trim();
  if (!prompt) throw new Error("Grok 잡에 prompt 가 비어있습니다");

  return await withInputLock(async () => {
    // 직전 제출로 결과 화면으로 넘어갔으면 뒤로가기로 입력 화면을 복원(연속 생성).
    await ensureGrokInputReady();

    // 1) 이미지 첨부 (옵션)
    if (job.source_image_url) {
      await attachImageFromUrl(job.source_image_url);
    }

    // 2) 프롬프트 입력
    await typePromptIntoTextarea(prompt);
    await SLEEP(200);

    // 3) waiter 등록 (Submit 직전에 등록해서 즉시 도착하는 응답도 받음)
    const resultPromise = gRegisterWaiter({
      prompt,
      jobId: job.id,
      sceneId: job.scene_id,
      mediaType: "video",
      timeoutMs: 8 * 60 * 1000,
    });

    // 4) Generate 클릭
    await clickGenerate();

    // 5) 결과 대기
    const result = await resultPromise;
    return result;
  });
}

// ============================================================
// background.js 메시지 핸들러
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ ok: true, where: "grok" });
    return false;
  }
  if (msg.type === "RUN_FLOW_JOB") {
    const job = msg.job;
    if (!job) {
      sendResponse({ error: "no job" });
      return false;
    }
    if (job.flow_model !== "grok-imagine") {
      sendResponse({ error: `Grok content script 가 받을 수 없는 모델: ${job.flow_model}` });
      return false;
    }
    if (job.job_type !== "video") {
      sendResponse({ error: `Grok 은 video 잡만 지원합니다 (받은 job_type=${job.job_type})` });
      return false;
    }
    (async () => {
      try {
        const out = await runGrokVideoJob(job);
        sendResponse(out);
      } catch (e) {
        const m = e?.message || String(e);
        console.warn("[Grok Bridge] job 실패", m);
        sendResponse({ error: m });
      }
    })();
    return true; // async
  }
  if (msg.type === "CANCEL_FLOW_JOBS") {
    // 진행 중 waiter 모두 abort
    const list = [...G_NET.waiters];
    G_NET.waiters.length = 0;
    for (const w of list) {
      try { clearTimeout(w.timer); } catch {}
      try { w.reject(new Error("사용자 중단")); } catch {}
    }
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

console.log("[Grok Bridge] content script 활성 — RUN_FLOW_JOB 대기");
