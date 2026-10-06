// 교재 공방 Flow Bridge 팝업: 로컬 서버 주소(기본 http://localhost:8766)만 있으면 된다 (토큰·로그인 없음).
const serverEl = document.getElementById("server");
const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const connStatusEl = document.getElementById("connStatus");

async function loadState() {
  const { supabaseUrl, running, lastStatus } = await chrome.storage.local.get(["supabaseUrl", "running", "lastStatus"]);
  if (supabaseUrl) serverEl.value = supabaseUrl;
  dotEl.classList.add(running ? "on" : "off");
  connStatusEl.textContent = running ? "자동화 실행 중" : "중지됨";
  statusEl.textContent = lastStatus || "대기 중";
}

document.getElementById("save").addEventListener("click", async () => {
  const url = serverEl.value.trim().replace(/\/+$/, "");
  if (!url) { statusEl.textContent = "서버 주소를 입력하세요."; return; }
  await chrome.storage.local.set({ token: "local", refreshToken: "local", supabaseUrl: url, running: true, workerId: "charforge" });
  chrome.runtime.sendMessage({ type: "START_POLLING" });
  dotEl.classList.remove("off"); dotEl.classList.add("on");
  connStatusEl.textContent = "자동화 실행 중";
  statusEl.textContent = "공방 서버에서 잡을 받는 중";
});

document.getElementById("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({ running: false });
  chrome.runtime.sendMessage({ type: "STOP_POLLING" });
  dotEl.classList.remove("on"); dotEl.classList.add("off");
  connStatusEl.textContent = "중지됨";
  statusEl.textContent = "중지됨";
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS_UPDATE") statusEl.textContent = msg.text;
});

loadState();
