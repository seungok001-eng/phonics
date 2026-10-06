// 선생님 수업 화면 — 교재 쪽을 그대로 줄이는 대신 16:9 전자칠판·태블릿용 "슬라이드"로 다시 그린다.
// 쪽 하나 = 슬라이드 여러 장 (글자마다 한 장, 스토리는 칸마다 한 장, 정리는 A·B·C 한 장씩). 내용·소리·채점 함수는 교재와 같은 것을 쓴다.
// 슬라이드 논리 크기: 가로 1600, 세로는 화면 칸 비율에 맞춰 900~1300 (필기판을 열어 칸이 좁아져도 아래가 비지 않게).
const SLIDE_W = 1600;
const TEACH = {};
function slideH() { const pw = document.getElementById('pageWrap'); if (!pw || !pw.clientWidth) return 900; return Math.round(Math.max(900, Math.min(1300, SLIDE_W * pw.clientHeight / pw.clientWidth))); }
function tHead(ctx, title, ko, s, n) {
  return `<header class="sl-head"><span class="unit">Unit ${ctx.u}</span><h2>${esc(ctx.unit.title)}</h2><span class="sl-title">${esc(title)}</span>${ko ? `<span class="ko">${esc(ko)}</span>` : ''}<span class="sl-no">p.${pageNo(ctx.b, ctx.u, ctx.p)} · ${s + 1}/${n}</span></header>`;
}
function tWrap(ctx, title, ko, s, n, body, cls = '') {
  const h = slideH();   // --sh 로 CSS 가 그림 높이를 계산한다 (슬라이드 세로가 화면 칸에 따라 달라지므로)
  return `<section class="slide ${cls}" style="height:${h}px;--sh:${h}px">${tHead(ctx, title, ko, s, n)}<div class="sl-body">${body}</div></section>`;
}

// 소리: 글자마다 한 장
TEACH.sounds = {
  count: (ctx) => ctx.unit.letters.length,
  render: (ctx, s) => {
    const l = ctx.unit.letters[s], d = L(l), cls = letterCls(l);
    const body = `<div class="sl-sounds sound-card" data-letter="${l}">
      <div class="sl-left"><div class="glyph say ${cls}" data-say="name_${l}" data-text="${l.toUpperCase()}">${l.toUpperCase()}<small>${l}</small></div>
        <div class="tree say" data-say="sound_${l}" data-text="${esc(soundText(l))}">${pic('tree_' + l, '', l + ' tree')}</div></div>
      <div class="sl-right">
        <div class="row say" data-say="name_${l}" data-text="${l.toUpperCase()}">${spk('name_' + l, l.toUpperCase(), true)}<span>Name</span><b>${l.toUpperCase()}</b></div>
        <div class="row say" data-say="sound_${l}" data-text="${esc(soundText(l))}">${spk('sound_' + l, soundText(l), true)}<span>Sound</span><b class="ipa ${cls}">${esc(soundLabel(l))}</b></div>
        <button class="btn orange big main-play" onclick="chant('${l}')">♪ ${esc(App.book.instructions.sound_chant)}</button>
        <div class="action">✋ ${esc(d.action)}<br><span class="ko">${esc(d.action_ko)}</span></div>
        <div class="words">${d.words.map((w) => `<span class="w say" data-word="${esc(w)}" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, 'wpic', w)}<span>${wordHtml(w, l)}</span></span>`).join('')}</div>
      </div></div>`;
    return tWrap(ctx, App.book.instructions.listen_repeat, '글자 이름과 소리를 듣고 따라 말해요', s, ctx.unit.letters.length, body);
  },
};
// 쓰기: 글자마다 획순 한 장 + 짝 찾기 한 장
TEACH.trace = {
  count: (ctx) => ctx.unit.letters.length + 1,
  render: (ctx, s) => {
    const n = ctx.unit.letters.length + 1;
    if (s < ctx.unit.letters.length) {
      const l = ctx.unit.letters[s];
      const one = (ch) => `<div class="sl-trace"><div class="anim say" data-say="name_${l}" data-text="${l.toUpperCase()}" onclick="this.innerHTML=this.innerHTML">${strokeSvg(ch)}</div>
        <div class="trace-line"><span class="solid">${ch}</span><span>${ch}</span><span>${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span></div></div>`;
      return tWrap(ctx, App.book.instructions.trace_write, '획순 그림을 누르면 순서대로 그려져요. 허공에 손가락으로 따라 써요', s, n, `<div class="sl-trace-grid">${one(l.toUpperCase())}${one(l)}</div>`);
    }
    const others = 'defghijklmnopqrstuvwxyz'.split('').filter((x) => !ctx.unit.letters.includes(x));
    const boxes = ctx.unit.letters.map((l, i) => { const o1 = others[(i * 3) % others.length], o2 = others[(i * 3 + 1) % others.length]; const set = shuffle([l.toUpperCase(), l, o1, o2.toUpperCase()], i + ctx.u); return `<div class="circle-box" data-pair="${l}">${set.map((ch) => `<span class="ltr" data-ch="${ch}" onclick="circlePick(this)">${ch}</span>`).join('')}</div>`; }).join('');
    return tWrap(ctx, App.book.instructions.look_circle, '큰 글자와 작은 글자 짝을 찾아 눌러요', s, n, `<div class="circle-grid sl-circle">${boxes}</div>`);
  },
};
// 단어: 한 장 (3×3)
TEACH.words = {
  count: () => 1,
  render: (ctx) => {
    const rows = ctx.unit.letters.map((l) => `<div class="word-row"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}${l}</div>${L(l).words.map((w) => wordCard(w, l)).join('')}</div>`).join('');
    return tWrap(ctx, App.book.instructions.listen_repeat, '그림을 누르면 단어가 나와요', 0, 1, `<div class="sl-tools"><button class="btn orange big main-play" onclick="wordChant()">♪ ${esc(App.book.instructions.word_chant)}</button></div><div class="word-rows sl-words">${rows}</div>`);
  },
};
// 따라 읽기 한 장 + 소리 잡기 한 장 + 짝 맞추기(메모리) 한 장 — 짝 맞추기는 선생님 슬라이드에만 있다
TEACH.read_play = {
  count: () => 3,
  render: (ctx, s) => {
    if (s === 0) {
      const cards = ctx.unit.letters.flatMap((l) => L(l).words).map((w) => { const l = letterOf(w); return `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="tr">${wordHtml(w, l)}</div></div>`; }).join('');
      return tWrap(ctx, App.book.instructions.trace_read, '단어를 따라 쓰고 읽어요', 0, 3, `<div class="read-rows sl-read">${cards}</div>`);
    }
    if (s === 1) return tWrap(ctx, App.book.instructions.lets_play, '소리를 듣고 그 소리로 시작하는 그림을 눌러요. A·B 팀을 누르고 맞히면 그 팀 점수가 올라요', 1, 3, gameHtml(ctx, true).replace('class="game"', 'class="game sl-game"'));
    return tWrap(ctx, 'Memory game', '카드를 두 장 뒤집어 같은 그림을 찾아요. 뒤집을 때 단어를 말해요', 2, 3, `<div class="sl-tools"><button class="btn orange big main-play" onclick="memStart()">▶ Memory game</button><span class="mem-msg" id="memMsg"></span></div><div class="memory" id="memory">${memCards(ctx, true)}</div>`);
  },
};
// 짝 맞추기: 유닛 단어 6개 × 2 = 12장(4×3). 뒤집으면 단어 소리, 짝이면 그대로, 다 맞추면 Great job
const MEM = { open: [], lock: false, done: 0, words: [] };
function memCards(ctx, closed) {
  const words = shuffle(unitLetters(ctx.unit).flatMap((l) => L(l).words), Date.now() % 1000).slice(0, 6);
  MEM.words = words; MEM.open = []; MEM.lock = false; MEM.done = 0;
  const cards = shuffle(words.concat(words), (Date.now() % 977) + 1);
  return cards.map((w, i) => `<div class="mcard" data-w="${esc(w)}" data-i="${i}" onclick="memFlip(this)"><div class="back">?</div><div class="face">${pic('word_' + w, '', w)}<span>${esc(w)}</span></div></div>`).join('');
}
function memStart() { Sound.unlock(); const ctx = { unit: App.units[App.u] }; $('memory').innerHTML = memCards(ctx); $('memMsg').textContent = ''; }
async function memFlip(el) {
  if (MEM.lock || el.classList.contains('open') || el.classList.contains('matched')) return;
  Sound.unlock(); stopSeq();
  el.classList.add('open'); MEM.open.push(el);
  Sound.play('word_' + el.dataset.w, el.dataset.w);
  if (MEM.open.length < 2) return;
  MEM.lock = true; const [a, b] = MEM.open; MEM.open = [];
  await sleep(700);
  if (a.dataset.w === b.dataset.w) {
    a.classList.add('matched'); b.classList.add('matched'); Sound.sfx('ok'); MEM.done += 2;
    if (MEM.done >= MEM.words.length * 2) { $('memMsg').textContent = App.book.instructions.great_job; Sound.sfx('chime'); Sound.play('instr_great_job', App.book.instructions.great_job); }
  } else { Sound.sfx('no'); await sleep(500); a.classList.remove('open'); b.classList.remove('open'); }
  MEM.lock = false;
}
// 듣고 가리키기 한 장 + 플래시카드 속도 라운드 한 장
TEACH.listen_point = {
  count: () => 2,
  render: (ctx, s) => {
    if (s === 1) return tWrap(ctx, 'Speed round!', '30초 동안 카드가 한 장씩 나와요. 글자는 소리를, 단어는 읽어요. 아이가 말하면 ✔, 못 하면 ✖', 1, 2,
      `<div class="speed" id="speed"><div class="sp-bar"><button class="btn orange big main-play" onclick="speedStart()">▶ Start</button><span class="timer" id="spTimer">30</span><span class="sp-score" id="spScore">✔ 0 · ✖ 0</span></div>
        <div class="sp-card" id="spCard"><div class="hint">▶ 를 누르면 시작!</div></div>
        <div class="sp-btns"><button class="btn big okb" onclick="speedMark(true)">✔</button><button class="btn big nob" onclick="speedMark(false)">✖</button></div></div>`);
    const rows = ctx.unit.letters.map((l) => `<div class="lp-row" data-letter="${l}"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div>${L(l).words.map((w) => `<div class="cell say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${w}">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div><span class="chk" onclick="event.stopPropagation();this.classList.toggle('on');Sound.sfx('tap')"></span></div>`).join('')}</div>`).join('');
    return tWrap(ctx, App.book.instructions.listen_point, '듣고 글자와 그림을 가리키며 따라 말해요 · 말한 단어는 네모에 표시', 0, 2, `<div class="sl-tools"><button class="btn orange big main-play" onclick="listenPointAll()">▶ Listen</button></div><div class="lp-table sl-lp">${rows}</div>`);
  },
};
// 속도 라운드: 30초 타이머, 유닛 글자·단어 카드가 무작위로 한 장씩. ✔/✖ 로 다음 카드, 끝나면 맞힌 수
const SP = { t: 30, timer: null, ok: 0, no: 0, deck: [], cur: null };
function speedDeck() {
  const u = App.units[App.u], ls = unitLetters(u);
  return shuffle(ls.map((l) => ({ l })).concat(ls.flatMap((l) => L(l).words.map((w) => ({ w })))), Date.now() % 1000);
}
function speedStart() {
  Sound.unlock(); clearInterval(SP.timer);
  SP.t = 30; SP.ok = 0; SP.no = 0; SP.deck = speedDeck(); SP.cur = null;
  $('spTimer').textContent = SP.t; $('spScore').textContent = '✔ 0 · ✖ 0'; $('speed').classList.add('run');
  SP.timer = setInterval(() => { SP.t--; $('spTimer').textContent = SP.t; if (SP.t <= 5) Sound.sfx('tap'); if (SP.t <= 0) speedEnd(); }, 1000);
  speedNext();
}
function speedNext() {
  if (!SP.deck.length) SP.deck = speedDeck();
  const c = SP.deck.pop(); SP.cur = c;
  $('spCard').innerHTML = c.l
    ? `<div class="big say ${letterCls(c.l)}" data-say="sound_${c.l}" data-text="${esc(soundText(c.l))}">${c.l.toUpperCase()}<small>${c.l}</small></div><div class="hint">소리를 말해요 · Say the sound</div>`
    : `<div class="big say" data-say="word_${esc(c.w)}" data-text="${esc(c.w)}">${esc(c.w)}</div><div class="hint">읽어요 · Read the word</div>`;
}
function speedMark(ok) {
  if (!SP.cur || SP.t <= 0) return;
  Sound.unlock(); if (ok) { SP.ok++; Sound.sfx('ok'); } else { SP.no++; Sound.sfx('no'); }
  $('spScore').textContent = `✔ ${SP.ok} · ✖ ${SP.no}`; speedNext();
}
function speedEnd() {
  clearInterval(SP.timer); SP.cur = null; $('speed').classList.remove('run');
  $('spCard').innerHTML = `<div class="big">⏰ ${SP.ok}</div><div class="hint">Time's up! 맞힌 카드 ${SP.ok}장 (✖ ${SP.no})</div>`;
  Sound.sfx('chime'); Sound.play('instr_great_job', App.book.instructions.great_job);
}
// 스토리: 칸마다 한 장 (두 쪽에 걸친 4칸을 한 흐름으로)
TEACH.story = {
  count: (ctx) => ctx.page.half === 2 ? ctx.unit.story.panels.length - 2 : Math.min(2, ctx.unit.story.panels.length),
  render: (ctx, s) => {
    const st = ctx.unit.story, base = ctx.page.half === 2 ? 2 : 0, idx = base + s, pn = st.panels[idx];
    const n = TEACH.story.count(ctx);
    const bubbles = pn.lines.map((ln, k) => `<div class="bubble say" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="${idx}" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}</span></div>`).join('');
    const sw = idx === 0 && ctx.unit.sight_words.length ? `<div class="sw"><b>${esc(App.book.instructions.sight_words)}</b>${ctx.unit.sight_words.map((w) => `<span class="say" data-say="sw_${esc(w)}" data-text="${esc(w)}">${esc(w)}</span>`).join('')}</div>` : '';
    const find = pn.hidden?.length ? `<div class="find"><b>🔍 Find:</b>${pn.hidden.map((w) => `<span class="chip" data-say="word_${esc(w)}" data-text="${esc(w)}" onclick="this.classList.toggle('on')">${esc(w)}</span>`).join('')}</div>` : '';
    const movie = pn.video ? `<button class="btn blue" onclick="playVideo(${idx})">▶ movie</button>` : '';
    const body = `<div class="sl-story"><div class="panel" data-panel="${idx}"><div class="scene">${pic(pn.id, '', 'scene')}</div><span class="no">${idx + 1}</span></div>
      <div class="sl-story-side">${sw}<div class="sl-tools"><button class="btn orange big main-play" onclick="storyPlayPanel(${idx})">▶ ${esc(App.book.instructions.listen_story)}</button>${movie}${roleBtn(true)}</div><div class="bubbles-col">${bubbles}</div>${find}</div></div>`;
    return tWrap(ctx, st.title, '▶ 를 누르면 음악과 함께 대사가 나와요. 말풍선을 눌러 따라 말해요', s, n, body);
  },
};
TEACH.intro_story = { count: (ctx) => ctx.unit.story.panels.length, render: (ctx, s) => TEACH.story.render({ ...ctx, page: { ...ctx.page, half: 1 } }, s) };
// 정리: A·B·C 한 장씩 (복습 평가도 같은 모양, 문항만 많다)
TEACH.check = { count: () => 3, render: (ctx, s) => checkSlides(ctx, ctx.unit.check, s) };
TEACH.review_test = { count: () => 3, render: (ctx, s) => checkSlides(ctx, ctx.unit.review.test, s) };
function checkSlides(ctx, c, s) {
  if (s === 0) {
    const lc = c.listen_circle.map((it, i) => `<div class="sl-lc">${lcRow(it, i, true)}</div>`).join('');
    return tWrap(ctx, 'A. ' + App.book.instructions.listen_circle, '🔊 를 누르고 맞는 것을 골라요', 0, 3, `<div class="sl-check ${c.listen_circle.length > 3 ? 'many' : ''}">${lc}</div>`);
  }
  if (s === 1) return tWrap(ctx, 'B. ' + App.book.instructions.match_read, '글자 → 그림 → 단어 순서로 눌러 이어요', 1, 3, matchHtml(c, 'sl-match'));
  return tWrap(ctx, 'C. ' + App.book.instructions.find_circle, '첫소리 글자를 찾아 누르고 써요', 2, 3, `<div class="write-row sl-write ${c.find_write.length > 3 ? 'n4' : ''}">${writeItems(ctx, c)}</div>`);
}
// 복습 유닛: 소리 복습은 글자 6개씩 한 장, 놀이판·빙고는 크게 한 장
TEACH.review_sounds = {
  count: (ctx) => Math.ceil(unitLetters(ctx.unit).length / 6),
  render: (ctx, s) => {
    const ls = unitLetters(ctx.unit), n = Math.ceil(ls.length / 6), part = ls.slice(s * 6, s * 6 + 6);
    return tWrap(ctx, App.book.instructions.listen_repeat, '글자를 누르면 이름, 🔊 를 누르면 소리가 나요. 따라 말해요', s, n,
      `<div class="sl-tools"><button class="btn orange big main-play" onclick="reviewSoundsAll()">▶ Listen to all</button></div><div class="rv-cards sl-rv" style="grid-template-columns:repeat(3,minmax(0,1fr))">${part.map((l) => reviewCard(l)).join('')}</div>`);
  },
};
TEACH.review_board = { count: () => 1, render: (ctx) => tWrap(ctx, 'Roll and say.', '🎲 를 누르면 주사위가 굴러요. 도착한 칸의 소리·단어를 말해요 (⭐ 한 칸 더 · ↩ 뒤로 · 🔁 다시)', 0, 1, `<div class="sl-board">${boardHtml(ctx)}</div>`) };
TEACH.review_bingo = { count: () => 1, render: (ctx) => tWrap(ctx, 'Bingo!', '🔊 로 단어를 부르고, 아이들이 그 그림을 눌러요. 한 줄이면 빙고!', 0, 1, `<div class="sl-bingo">${bingoHtml(ctx)}</div>`) };
// 10유닛 알파벳 복습: 26칸 한 장 + 순서 잇기 한 장
TEACH.alphabet_review = {
  count: () => 2,
  render: (ctx, s) => {
    if (s === 0) return tWrap(ctx, 'Say all 26 sounds.', '글자를 누르면 소리가 나요. ▶ 로 26개 소리를 순서대로', 0, 2, `<div class="sl-tools"><button class="btn orange big main-play" onclick="abcSounds()">▶ 26 sounds</button><button class="btn big" onclick="abcSong(true)">A–Z names</button></div><div class="abc abc26 sl-abc">${abc26Grid()}</div>`);
    pathNext = 0;
    return tWrap(ctx, 'Follow A to Z.', 'A부터 Z까지 순서대로 눌러요', 1, 2, `<div class="path path26 sl-path" id="path">${path26Cells(ctx)}</div>`);
  },
};
// 친구들 소개: 한 장
TEACH.characters = {
  count: () => 1,
  render: (ctx) => {
    const cs = Object.entries(App.book.characters).map(([id, c]) => `<div class="char">${pic('char_' + id + '_ref', '', c.name)}<h3 style="color:${c.color}">${esc(c.name)} <span class="ko">${esc(c.ko)}</span></h3><div class="say-line say" data-say="catch_${id}" data-text="${esc(c.catchphrase.replace(/[()]/g, ''))}">${esc(c.catchphrase)}</div></div>`).join('');
    return tWrap(ctx, 'Meet the friends!', '친구들을 만나요', 0, 1, `<div class="chars sl-chars">${cs}</div>`);
  },
};
// 그 밖의 쪽(알파벳·워크북 등): 교재 쪽을 그대로 가운데에 (세로)
function teachFallback(ctx) {
  const fn = PAGES[ctx.page.type] || (() => '');
  return tWrap(ctx, ctx.page.title, '', 0, 1, `<div class="sl-embed"><article class="page ${ctx.b}"><div class="body">${fn(ctx)}</div></article></div>`, 'embed');
}
function teachCount(ctx) { const t = TEACH[ctx.page.type]; return t ? t.count(ctx) : 1; }
function renderSlide(ctx, s) { const t = TEACH[ctx.page.type]; return t ? t.render(ctx, Math.max(0, Math.min(s, t.count(ctx) - 1))) : teachFallback(ctx); }

// 스토리 한 칸만 듣기 (배경음악 켜고 그 칸의 대사만)
async function storyPlayPanel(idx) {
  Sound.unlock();
  const st = App.units[App.u].story; Sound.bgm(st.bgm);
  const pn = st.panels[idx];
  await playSeq(pn.lines.map((ln, k) => storyItem(ln, document.querySelector(`.bubble[data-panel="${idx}"][data-line="${k}"]`), pn, idx, k)));
}

// 손가락 두 개로 교재 칸 확대·축소 + 끌기 (태블릿·전자칠판). 마우스는 Ctrl+휠.
function setupPinch(pw) {
  const pts = new Map(); let base = null;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  pw.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) base = { d: dist(), z: View.zoom, m: mid(), sl: pw.scrollLeft, st: pw.scrollTop }; }, { capture: true });
  pw.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && base) {
      e.preventDefault(); e.stopPropagation();
      const z = Math.max(.5, Math.min(3, base.z * dist() / base.d));
      if (Math.abs(z - View.zoom) > 0.01) { View.zoom = Math.round(z * 100) / 100; fit(); }
      const m = mid(); pw.scrollLeft = base.sl - (m.x - base.m.x); pw.scrollTop = base.st - (m.y - base.m.y);
    }
  }, { capture: true, passive: false });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) { if (base) saveView(); base = null; } };
  pw.addEventListener('pointerup', up, { capture: true }); pw.addEventListener('pointercancel', up, { capture: true });
}
