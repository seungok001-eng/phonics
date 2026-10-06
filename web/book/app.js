// Pomi Phonics 웹 교재 — 핵심: 내용 읽기, 쪽 넘기기, 소리(음성·배경음악 자동 줄이기·효과음), 공통 도우미.
// 화면(index.html)과 인쇄(print.html)가 같이 쓴다. 프레임워크 없음.
const PRINT = !!window.PRINT;
// bk = 권 번호, dir = 그 권의 content 폴더('' = 1권 content/ 바로 아래, 'b2/' = 2권). books = content/books.json 의 권 목록
const App = { book: null, books: null, bk: 1, dir: '', units: {}, b: 'sb', u: 1, p: 1, teacher: false };
const CONTENT_BASES = ['../content/', '../../content/'];   // 배포(_site)에서는 ../content, 저장소에서 바로 열면 ../../content
const ASSETS = '../assets/';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let contentBase = null;   // 처음 성공한 경로를 기억한다
// rel 은 권 폴더(App.dir) 아래 경로. root=true 면 content/ 바로 아래(books.json, 1권 book.json)
async function loadJSON(rel, root) {
  for (const b of (contentBase ? [contentBase] : CONTENT_BASES)) {
    try { const r = await fetch(b + (root ? '' : App.dir) + rel, { cache: 'no-store' }); if (r.ok) { contentBase = b; return await r.json(); } } catch (e) { /* 다음 후보 */ }
  }
  return null;
}
// 권 고르기: content/books.json 의 목록에서 bk 번째 권의 폴더를 잡고 그 book.json 을 읽는다. books.json 이 없으면 1권만.
// 2권부터 book.json 에 letters 가 없으면 1권 것을 빌린다(낱소리·합치기에 쓴다).
async function loadBook(bk) {
  App.books = (await loadJSON('books.json', true)) || [{ n: 1, dir: '' }];
  const info = App.books.find((x) => x.n === +bk) || App.books[0];
  App.bk = info.n; App.dir = info.dir || ''; App.units = {};
  App.book = await loadJSON('book.json');
  if (App.book && !App.book.letters && App.dir) { const b1 = await loadJSON('book.json', true); if (b1) App.book.letters = b1.letters; }
  return App.book;
}
function bkParam(first) { return App.bk > 1 ? (first ? '?' : '&') + 'bk=' + App.bk : ''; }   // 주소에 붙일 권 표시 (1권은 없음)
function bkKey() { return App.bk > 1 ? 'b' + App.bk + '_' : ''; }                              // QR 파일 이름 앞붙이 (b2_sb_u01_p1)
function bookLabel() { return App.book ? `${App.book.series} ${App.book.book}` : 'Pomi Phonics'; }
async function loadUnit(n) {
  if (!(n in App.units)) {
    const meta = App.book && App.book.units.find((x) => x.n === n);
    App.units[n] = meta && meta.ready === false ? null : await loadJSON(`units/unit${String(n).padStart(2, '0')}.json`);
  }
  return App.units[n];
}

// ---------- 그림 (없으면 글자 상자로 대신) ----------
// 장면(scene_)·스토리북(sb_)·캐스트 시트는 jpg, 나머지(단어·글자나무·캐릭터)는 png
const ART_DIR = (new URLSearchParams(location.search).get('art') || '').replace(/[^\w./-]/g, '') || (ASSETS + 'art/');   // pdf.py 가 축소본 폴더를 넘긴다
function artSrc(id) { return ART_DIR + id + (id.startsWith('scene_') || /^sb\d*_/.test(id) || id.startsWith('cast_sheet') ? '.jpg' : '.png'); }
function pic(id, cls = '', alt = '') {
  return `<span class="pic ${cls}" data-id="${esc(id)}"><img src="${artSrc(id)}" alt="${esc(alt || id)}" onerror="picFallback(this)"></span>`;
}
function picFallback(img) {
  const s = img.parentElement; if (!s) return;
  s.classList.add('missing');
  const label = (s.dataset.id || '').replace(/^(word|line|tree|char|scene)_/, '').replace(/_/g, ' ');
  s.innerHTML = `<span class="ph">${esc(label)}</span>`;
}
function videoSrc(id) { return ASSETS + 'video/' + id + '.mp4'; }

// ---------- 소리 ----------
// play(id, text): assets/audio/<id>.mp3 를 튼다. 파일이 아직 없으면 브라우저 합성 음성(임시)으로 text 를 읽는다.
// 음성이 나오는 동안 배경음악은 1/4 로 줄었다가 끝나면 돌아온다 (기획 확정 규칙).
const Sound = {
  ctx: null, bgmEl: null, bgmId: '', bgmTarget: 0.45, cur: null, unlocked: false,
  unlock() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 없음 */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
    if (this.bgmEl) this.bgmEl.play().catch(() => {});
  },
  stop() {
    if (this.cur) { try { this.cur.el.pause(); } catch (e) {} const d = this.cur.done; this.cur = null; d(); }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  play(id, text) {
    return new Promise((resolve) => {
      this.stop();
      const el = new Audio(ASSETS + 'audio/' + id + '.mp3');
      let finished = false;
      const done = () => { if (finished) return; finished = true; if (this.cur && this.cur.el === el) this.cur = null; this.duck(false); resolve(); };
      this.cur = { el, done };
      this.duck(true);
      el.onended = done;
      el.onerror = () => { if (text) this.speak(text).then(done); else done(); };
      el.play().catch(() => { if (text) this.speak(text).then(done); else done(); });
    });
  },
  speak(text) {
    return new Promise((res) => {
      if (!window.speechSynthesis) return res();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.85; u.onend = () => res(); u.onerror = () => res();
      speechSynthesis.speak(u); setTimeout(res, 5000);
    });
  },
  duck(on) {
    if (!this.bgmEl) return;
    rampVolume(this.bgmEl, on ? this.bgmTarget * 0.25 : this.bgmTarget, on ? 250 : 800);
  },
  bgm(id) {
    if (!id || this.bgmId === id) return;
    this.bgmOff();
    const el = new Audio(ASSETS + 'music/' + id + '.mp3'); el.loop = true; el.volume = 0; el.onerror = () => { if (this.bgmEl === el) this.bgmEl = null; };
    this.bgmEl = el; this.bgmId = id;
    if (this.unlocked) { el.play().then(() => rampVolume(el, this.bgmTarget, 1200)).catch(() => {}); }
  },
  bgmOff() { if (this.bgmEl) { const el = this.bgmEl; rampVolume(el, 0, 500); setTimeout(() => el.pause(), 600); } this.bgmEl = null; this.bgmId = ''; },
  // 효과음은 파일 없이 합성 (펑·딩·정답·오답)
  sfx(name) {
    if (!this.ctx) this.unlock(); if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain(); g.connect(c.destination);
    const tone = (f0, f1, dur, type = 'sine', at = 0, vol = .25) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur); const gg = c.createGain(); gg.gain.setValueAtTime(vol, t + at); gg.gain.exponentialRampToValueAtTime(.001, t + at + dur); o.connect(gg); gg.connect(g); o.start(t + at); o.stop(t + at + dur + .02); };
    if (name === 'pop') tone(500, 120, .14, 'sine');
    else if (name === 'chime') { tone(880, 880, .35, 'sine', 0, .18); tone(1320, 1320, .45, 'sine', .08, .14); }
    else if (name === 'ok') { tone(523, 523, .12, 'triangle'); tone(659, 659, .12, 'triangle', .12); tone(784, 784, .25, 'triangle', .24); }
    else if (name === 'no') tone(220, 160, .25, 'sawtooth', 0, .12);
    else if (name === 'tap') tone(700, 700, .06, 'square', 0, .06);
  },
};
function rampVolume(el, target, ms) {
  const start = el.volume, t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); el.volume = Math.max(0, Math.min(1, start + (target - start) * k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 차례로 들려주기: items = [{id, text, el}] — el 에 .playing 을 붙였다 뗀다. 중간에 다른 소리를 누르면 멈춘다.
// it.wait = 소리 없이 그만큼(ms) 기다린다(역할 읽기: 아이가 읽는 줄). it.beat = 소리 길이와 상관없이 이 간격(ms)마다 다음으로(챈트 박자).
let seqToken = 0;
async function playSeq(items, gap = 450) {
  const my = ++seqToken;
  for (const it of items) {
    if (my !== seqToken) return false;
    if (it.el) it.el.classList.add('playing', 'hl');
    if (it.before) it.before();
    const t0 = performance.now();
    if (it.wait) await sleep(it.wait); else await Sound.play(it.id, it.text);
    if (it.el) { it.el.classList.remove('playing'); setTimeout(() => it.el.classList.remove('hl'), 200); }
    if (it.after) it.after();
    if (it.beat) { const left = it.beat - (performance.now() - t0); if (left > 0) await sleep(left); }
    else await sleep(it.gap ?? gap);
  }
  return my === seqToken;
}
function stopSeq() { seqToken++; Sound.stop(); }

// 누르면 소리: data-say="id" data-text="읽을 말" 인 요소 전부
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-say]');
  if (!el) return;
  Sound.unlock();
  stopSeq();
  el.classList.add('playing'); setTimeout(() => el.classList.remove('playing'), 600);
  Sound.play(el.dataset.say, el.dataset.text || '');
});
document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

// ---------- 내용 도우미 ----------
function L(l) { return App.book.letters[l]; }
function W(w) { return App.book.words[w] || { ko: '', desc: '' }; }
function letterCls(l) { return L(l).kind === 'vowel' ? 'vowel' : 'conso'; }
function soundText(l) { const d = L(l); return d.final ? 'ks' : d.sound; }   // 임시 합성 음성용 글
function soundLabel(l) { return '/' + L(l).sound + '/'; }
// 단어에서 목표 글자를 색칠: apple → <b>a</b>pple, six → si<b>x</b>
function wordHtml(w, l) {
  if (!l) return esc(w);
  const i = L(l).final ? w.lastIndexOf(l) : w.indexOf(l);
  if (i < 0) return esc(w);
  return esc(w.slice(0, i)) + `<b class="${letterCls(l)}">${esc(w[i])}</b>` + esc(w.slice(i + 1));
}
function letterOf(w) { for (const l of Object.keys(App.book.letters)) if (L(l).words.includes(w)) return l; return w[0]; }
function unitTitle(u) { const x = App.book.units.find((x) => x.n === u); return x ? x.title : ''; }
// 유닛의 글자: 일반 유닛은 letters, 복습 유닛(letters 가 빈 것)은 review.letters
function unitLetters(unit) { return unit.letters && unit.letters.length ? unit.letters : (unit.review && unit.review.letters) || []; }
// ---------- 2권(단어 가족) 도우미 ----------
// 유닛의 단어 가족: 일반 유닛은 families, 복습 유닛은 review.families
function unitFamilies(unit) { return unit.families && unit.families.length ? unit.families : (unit.review && unit.review.families) || []; }
// 유닛의 단어 전부: 2권은 unit.words({가족: [단어]}) 또는 review.words, 1권은 글자의 단어들
function unitWords(unit) {
  if (unit.words && !Array.isArray(unit.words)) return Object.values(unit.words).flat();
  if (unit.review && unit.review.words) return unit.review.words;
  return unitLetters(unit).flatMap((l) => L(l).words);
}
function isBook2(unit) { return !!(App.book.families && unit && (unitFamilies(unit).length || (unit.words && !Array.isArray(unit.words)))); }
function familyOf(w) { const d = App.book.words && App.book.words[w]; if (d && d.family) return d.family; for (const [f, x] of Object.entries(App.book.families || {})) if (x.words.includes(w)) return f; return ''; }
function famVowel(f) { const d = App.book.families && App.book.families[f]; return (d && d.vowel) || f[0]; }
function famWords(f) { const d = App.book.families && App.book.families[f]; return (d && d.words) || []; }
// 가족 색: 유닛 안에서 몇 번째 가족인지로 (fam-0 주황, fam-1 파랑, fam-2 초록, fam-3 보라)
function famCls(f, unit) { const i = unitFamilies(unit || App.units[App.u] || {}).indexOf(f); return 'fam-' + (i < 0 ? 0 : i % 4); }
function famHtml(f) { return `-<b class="vowel">${esc(famVowel(f))}</b>${esc(f.slice(f.indexOf(famVowel(f)) + 1))}`; }   // -<a>t (모음 빨강)
// 단어에서 가족(끝소리) 부분을 굵게: cat → c<b>at</b>
function wordFamHtml(w, f) { f = f || familyOf(w); const i = f ? w.lastIndexOf(f) : -1; if (i < 0) return esc(w); return esc(w.slice(0, i)) + `<b class="rime">${esc(f)}</b>` + esc(w.slice(i + f.length)); }
// 글자 하나의 소리 id·임시 글 (모음은 vowels, 나머지는 letters)
function letterSound(ch) { const v = App.book.vowels && App.book.vowels[ch]; return v ? { id: 'sound_' + ch, text: v.sound } : L(ch) ? { id: 'sound_' + ch, text: soundText(ch) } : { id: 'sound_' + ch, text: ch }; }

// 쪽 목록 (학생책 = lessons[].pages, 워크북 = lessons[].workbook) 과 쪽 번호
function pageList(unit, b) {
  const out = [];
  (unit.lessons || []).forEach((ls, li) => (b === 'wb' ? ls.workbook : ls.pages).forEach((pg) => out.push({ ...pg, lesson: ls, li })));
  return out;
}
// 아직 없는 유닛의 기본 쪽수: 0유닛 4, 복습 6, 일반 8 (10유닛은 read_play 대신 alphabet_review 라 똑같이 8)
const DEFAULT_PAGES = { sb: (x) => (x.n === 0 ? 4 : x.review ? 6 : 8), wb: (x) => (x.n === 0 ? 0 : x.review ? 2 : 4) };
function pageNo(b, u, p) {
  let n = b === 'sb' ? 3 : 2;   // 앞붙이 (표지·차례·친구들 소개)
  for (const x of App.book.units) {
    if (x.n === u) return n + p;
    const uj = App.units[x.n];
    n += uj ? pageList(uj, b).length : DEFAULT_PAGES[b](x);
  }
  return n + p;
}
// 스토리북 쪽 목록: 표지 → 앞 쪽(book.storybook.front) → 0~11유닛 쪽(unit.storybook.pages) → 뒤 쪽(back)
// 각 쪽 = { u: 'cover'|'front'|'back'|유닛 번호, p: 그 안의 번호, id(그림), lines, task, task_ko, title, bgm }. 유닛을 전부 읽은(loadUnit) 뒤에 부른다.
function storyPages() {
  const sb = App.book.storybook; if (!sb) return [];
  const out = [], bgm0 = sb.bgm || 'theme';
  out.push({ u: 'cover', p: 1, id: (sb.cover && sb.cover.id) || (bkKey() ? 'sb2_cover' : 'sb_cover'), lines: [], title: sb.title || 'Storybook', bgm: bgm0, cover: true });
  (sb.front || []).forEach((pg, i) => out.push({ u: 'front', p: i + 1, ...pg, title: sb.title, bgm: bgm0 }));
  for (const x of App.book.units) {
    const uj = App.units[x.n], pages = (uj && uj.storybook && uj.storybook.pages) || [];
    pages.forEach((pg, i) => out.push({ u: x.n, p: i + 1, ...pg, title: (uj.story && uj.story.title) || uj.title, bgm: (uj.story && uj.story.bgm) || bgm0 }));
  }
  (sb.back || []).forEach((pg, i) => out.push({ u: 'back', p: i + 1, ...pg, title: sb.title, bgm: bgm0 }));
  return out;
}
// 스토리북 쪽의 주소·QR 이름 (story.html?u=1&p=2 ↔ story_u01_p2, 2권은 b2_story_u01_p2)
function storyKey(pg) { return bkKey() + (typeof pg.u === 'number' ? `story_u${String(pg.u).padStart(2, '0')}_p${pg.p}` : `story_${pg.u}_p${pg.p}`); }
function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800); }

// 아바타 깜빡임: 2.5~5초마다 아바타 하나가 150ms 눈을 감는다 (char_<id>_blink 가 있을 때만)
setInterval(() => {
  if (PRINT) return;
  const avs = [...document.querySelectorAll('img[data-blink]')].filter((i) => !i.dataset.talking);
  if (!avs.length) return;
  const img = avs[Math.floor(Math.random() * avs.length)], base = img.src;
  const test = new Image(); test.onload = () => { img.src = img.dataset.blink; setTimeout(() => { if (!img.dataset.talking) img.src = base; }, 150); }; test.src = img.dataset.blink;
}, 2800);
// 말할 때 입 움직임: char_<id>_talk 와 기준 그림을 번갈아
function talking(img, on) {
  if (!img) return;
  if (!on) { clearInterval(img._talk); img._talk = null; delete img.dataset.talking; if (img.dataset.base) img.src = img.dataset.base; return; }
  img.dataset.base = img.dataset.base || img.src; img.dataset.talking = '1';
  const t = new Image(); t.onload = () => { let k = false; img._talk = setInterval(() => { k = !k; img.src = k ? img.dataset.talk : img.dataset.base; }, 140); }; t.src = img.dataset.talk;
}
