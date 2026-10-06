// 선생님 모드 필기 — 교재 쪽 위에 쓰는 덧그림(ink)과 오른쪽 필기판(board). 전자칠판·태블릿·마우스 모두.
// 펜·형광펜·지우개(획 단위)·색·굵기·되돌리기·다시·전부 지우기·배경(빈 칸/4줄 공책/모눈)·글자 도장·레이저·판 3장·PNG 저장.
// 획은 벡터로 저장(논리 좌표)해서 창 크기가 바뀌어도 그대로. 쪽마다·판마다 localStorage 에 남긴다(없어도 동작).
const Ink = {
  tool: 'hand', color: '#E0523E', size: 4, surfaces: [], current: null, boardNo: 1,
  COLORS: ['#1F1F1F', '#E0523E', '#2E5FBF', '#2E9E44', '#F28C38', '#A98BE0'],
  SIZES: { S: 2.5, M: 4.5, L: 8 },
};

// 그리는 면 하나 (캔버스 + 획 목록 + 저장 키)
class Surface {
  constructor(canvas, key, logicalW, logicalH) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.key = key; this.W = logicalW; this.H = logicalH;
    this.strokes = []; this.redo = []; this.bg = 'blank'; this.stamps = [];
    this.load();
    const down = (e) => this.down(e), move = (e) => this.move(e), up = (e) => this.up(e);
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    canvas.style.touchAction = 'none';
  }
  // 화면 좌표 → 논리 좌표
  pt(e) { const r = this.c.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H, p: e.pressure || 0.5 }; }
  down(e) {
    if (Ink.tool === 'hand') return;
    e.preventDefault(); this.c.setPointerCapture(e.pointerId);
    const p = this.pt(e);
    if (Ink.tool === 'eraser') { this.eraseAt(p); this.erasing = true; return; }
    if (Ink.tool === 'laser') { this.laser = [p]; this.drawLaser(); return; }
    const width = Ink.tool === 'high' ? Ink.size * 5 : Ink.size;
    Ink.current = { tool: Ink.tool, color: Ink.tool === 'high' ? '#FFE94A' : Ink.color, width, pts: [p], pen: e.pointerType === 'pen' };
    this.strokes.push(Ink.current); this.redo = [];
  }
  move(e) {
    if (Ink.tool === 'hand') return;
    const p = this.pt(e);
    if (this.erasing) { this.eraseAt(p); return; }
    if (this.laser) { this.laser.push(p); if (this.laser.length > 12) this.laser.shift(); this.drawLaser(); return; }
    if (!Ink.current) return;
    Ink.current.pts.push(p);
    this.drawStroke(Ink.current, Ink.current.pts.length - 2);
  }
  up() {
    if (this.erasing) { this.erasing = false; this.save(); return; }
    if (this.laser) { this.laser = null; this.render(); return; }
    if (Ink.current) { Ink.current = null; this.save(); }
  }
  eraseAt(p) {
    const r = 14;
    const hit = (s) => s.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < r + s.width);
    const before = this.strokes.length;
    this.strokes = this.strokes.filter((s) => !hit(s));
    this.stamps = this.stamps.filter((s) => !(Math.abs(s.x - p.x) < 60 && Math.abs(s.y - p.y) < 80));
    if (this.strokes.length !== before) this.render();
  }
  // 획 그리기: 중간점을 잇는 곡선으로 부드럽게. from 부터 이어 그린다
  drawStroke(s, from = 0) {
    const ctx = this.ctx, k = this.c.width / this.W;
    ctx.save(); ctx.scale(k, k);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.tool === 'high' ? 0.35 : 1; ctx.globalCompositeOperation = s.tool === 'high' ? 'multiply' : 'source-over';
    const pts = s.pts;
    if (pts.length === 1) { ctx.beginPath(); ctx.fillStyle = s.color; ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, 7); ctx.fill(); ctx.restore(); return; }
    for (let i = Math.max(1, from); i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.lineWidth = s.pen ? s.width * (0.6 + b.p) : s.width;
      ctx.beginPath();
      if (i >= 2) { const m0 = { x: (pts[i - 2].x + a.x) / 2, y: (pts[i - 2].y + a.y) / 2 }, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(a.x, a.y, m1.x, m1.y); }
      else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  drawLaser() {
    this.render();
    const ctx = this.ctx, k = this.c.width / this.W; ctx.save(); ctx.scale(k, k);
    this.laser.forEach((p, i) => { ctx.beginPath(); ctx.fillStyle = `rgba(255,40,40,${(i + 1) / this.laser.length})`; ctx.arc(p.x, p.y, 6 + i * 0.6, 0, 7); ctx.fill(); });
    ctx.restore();
  }
  drawBg() {
    const ctx = this.ctx, k = this.c.width / this.W; ctx.save(); ctx.scale(k, k);
    ctx.strokeStyle = '#C8D8EA'; ctx.lineWidth = 1;
    if (this.bg === 'lines') {   // 영어 공책 4줄 (위·가운데 점선·아래), 110px 간격
      for (let y = 60; y < this.H - 20; y += 110) {
        ctx.setLineDash([]); ctx.strokeStyle = '#9DB4CF'; ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(this.W - 20, y); ctx.stroke();
        ctx.setLineDash([6, 6]); ctx.strokeStyle = '#C8D8EA'; ctx.beginPath(); ctx.moveTo(20, y + 37); ctx.lineTo(this.W - 20, y + 37); ctx.stroke();
        ctx.setLineDash([]); ctx.strokeStyle = '#E25555'; ctx.beginPath(); ctx.moveTo(20, y + 74); ctx.lineTo(this.W - 20, y + 74); ctx.stroke();
      }
    } else if (this.bg === 'grid') {
      for (let x = 0; x < this.W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
      for (let y = 0; y < this.H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
    }
    ctx.restore();
  }
  drawStamps() {
    const ctx = this.ctx, k = this.c.width / this.W; ctx.save(); ctx.scale(k, k);
    for (const s of this.stamps) {
      ctx.font = `700 ${s.size}px Andika, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = s.color; ctx.fillStyle = s.fill || 'transparent';
      if (s.fill) ctx.fillText(s.text, s.x, s.y); else ctx.strokeText(s.text, s.x, s.y);
    }
    ctx.restore();
  }
  render() {
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.c.width, this.c.height);
    this.drawBg(); this.drawStamps();
    for (const s of this.strokes) this.drawStroke(s, 0);
  }
  undo() { const s = this.strokes.pop(); if (s) { this.redo.push(s); this.render(); this.save(); } }
  redoOne() { const s = this.redo.pop(); if (s) { this.strokes.push(s); this.render(); this.save(); } }
  clear() { this.strokes = []; this.redo = []; this.stamps = []; this.render(); this.save(); }
  stamp(text, color) {   // 글자 도장: 비어 있는 자리에 큰 글자(따라 쓰기용 회색 테두리)
    const n = this.stamps.length; const x = 120 + (n % 5) * 150, y = 120 + Math.floor(n / 5) * 170;
    this.stamps.push({ text, x: Math.min(x, this.W - 80), y: Math.min(y, this.H - 80), size: 120, color: color || '#B0B0B0' });
    this.render(); this.save();
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify({ strokes: this.strokes, stamps: this.stamps, bg: this.bg })); } catch (e) { /* 저장 못 해도 동작 */ } }
  load() { try { const d = JSON.parse(localStorage.getItem(this.key) || 'null'); if (d) { this.strokes = d.strokes || []; this.stamps = d.stamps || []; this.bg = d.bg || 'blank'; } } catch (e) { /* 무시 */ } }
  resize(cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    this.c.width = Math.round(cssW * dpr); this.c.height = Math.round(cssH * dpr);
    this.c.style.width = cssW + 'px'; this.c.style.height = cssH + 'px';
    this.render();
  }
}

// ---------- 화면 붙이기 ----------
function inkToolbar() {
  const b = (t, title, on, extra = '') => `<button class="tb ${extra}" data-tool="${t}" title="${title}" onclick="setTool('${t}')">${on}</button>`;
  return `<div class="ink-tools">
    ${b('hand', '손 — 교재 누르기', '✋')}${b('pen', '펜', '✏️')}${b('high', '형광펜', '🖍️')}${b('eraser', '지우개 (획 단위)', '🧽')}${b('laser', '레이저 포인터', '🔴')}
    <span class="sep"></span>
    ${Ink.COLORS.map((c) => `<button class="tb col" data-color="${c}" style="background:${c}" onclick="setColor('${c}')" title="색"></button>`).join('')}
    <span class="sep"></span>
    ${Object.entries(Ink.SIZES).map(([k, v]) => `<button class="tb sz" data-size="${v}" onclick="setSize(${v})" title="굵기 ${k}"><i style="width:${v * 2 + 4}px;height:${v * 2 + 4}px"></i></button>`).join('')}
    <span class="sep"></span>
    <button class="tb" onclick="inkActive().undo()" title="되돌리기">↶</button><button class="tb" onclick="inkActive().redoOne()" title="다시">↷</button>
    <button class="tb" onclick="if(confirm('이 면의 필기를 전부 지울까요?'))inkActive().clear()" title="전부 지우기">🗑</button>
  </div>`;
}
function boardPanel() {
  return `<div id="boardPanel">
    ${inkToolbar()}
    <div class="board-bar">
      <span class="lab">필기판</span>
      <button class="tb small" onclick="boardSwitch(1)" data-board="1">1</button><button class="tb small" onclick="boardSwitch(2)" data-board="2">2</button><button class="tb small" onclick="boardSwitch(3)" data-board="3">3</button>
      <span class="sep"></span>
      <button class="tb small" onclick="boardBg('blank')" title="빈 판">빈 판</button><button class="tb small" onclick="boardBg('lines')" title="영어 공책 4줄">4줄</button><button class="tb small" onclick="boardBg('grid')" title="모눈">모눈</button>
      <span class="sep"></span>
      <span class="lab">글자 도장</span><span id="stampBtns"></span>
      <span class="grow"></span>
      <button class="tb small" onclick="boardSave()" title="PNG 로 저장">💾</button>
    </div>
    <div id="boardWrap"><canvas id="boardCanvas"></canvas></div>
  </div>`;
}
function inkActive() { return Ink.last || Ink.board; }
function setTool(t) {
  Ink.tool = t;
  document.body.classList.toggle('ink-on', t !== 'hand');
  document.querySelectorAll('.tb[data-tool]').forEach((el) => el.classList.toggle('on', el.dataset.tool === t));
  const pageInk = document.getElementById('pageInk'); if (pageInk) pageInk.style.pointerEvents = t === 'hand' ? 'none' : 'auto';
}
function setColor(c) { Ink.color = c; if (Ink.tool === 'hand' || Ink.tool === 'eraser') setTool('pen'); document.querySelectorAll('.tb.col').forEach((el) => el.classList.toggle('on', el.dataset.color === c)); }
function setSize(v) { Ink.size = v; document.querySelectorAll('.tb.sz').forEach((el) => el.classList.toggle('on', +el.dataset.size === v)); }
function boardSwitch(n) {
  Ink.boardNo = n; document.querySelectorAll('.tb[data-board]').forEach((el) => el.classList.toggle('on', +el.dataset.board === n));
  const wrap = document.getElementById('boardWrap'), c = document.getElementById('boardCanvas');
  Ink.board = new Surface(c, 'pp_board_' + n, 1600, 1000);
  Ink.board.resize(wrap.clientWidth, wrap.clientHeight); Ink.last = Ink.board;
}
function boardBg(bg) { Ink.board.bg = bg; Ink.board.render(); Ink.board.save(); }
function boardStamp(text) { Ink.board.stamp(text); Ink.last = Ink.board; }
function boardSave() { const a = document.createElement('a'); a.download = `board-${Ink.boardNo}.png`; a.href = document.getElementById('boardCanvas').toDataURL('image/png'); a.click(); }
// 쪽이 바뀔 때마다: 쪽 위 덧그림 캔버스를 만들고 그 쪽의 필기를 불러온다
function attachPageInk(scaler, key) {
  const old = document.getElementById('pageInk'); if (old) old.remove();
  const c = document.createElement('canvas'); c.id = 'pageInk'; c.className = 'page-ink';
  scaler.appendChild(c);
  const s = new Surface(c, 'pp_ink_' + key, 794, 1123); s.resize(794, 1123);
  c.addEventListener('pointerdown', () => { Ink.last = s; });
  c.style.pointerEvents = Ink.tool === 'hand' ? 'none' : 'auto';
  Ink.page = s; Ink.last = Ink.last || s;
}
function boardResize() { if (!Ink.board) return; const wrap = document.getElementById('boardWrap'); if (wrap) Ink.board.resize(wrap.clientWidth, wrap.clientHeight); }
// 단축키: P 펜, H 손, E 지우개, Ctrl+Z 되돌리기
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('teacher') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'p' || e.key === 'P') setTool('pen'); else if (e.key === 'h' || e.key === 'H') setTool('hand'); else if (e.key === 'e' || e.key === 'E') setTool('eraser');
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); inkActive().undo(); }
});
