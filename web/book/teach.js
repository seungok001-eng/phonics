// 선생님 수업 화면 — 교재 쪽을 그대로 줄이는 대신 16:9 전자칠판·태블릿용 "슬라이드"로 다시 그린다.
// 쪽 하나 = 슬라이드 여러 장 (글자마다 한 장, 스토리는 칸마다 한 장, 정리는 A·B·C 한 장씩). 내용·소리·채점 함수는 교재와 같은 것을 쓴다.
// 수업 환경: 선생님이 앞의 큰 화면(전자칠판·TV)을 누르고, 아이들은 멀리 책상에 앉아 자기 책을 보며 입으로 답한다(따라 말하기·단어 외치기·번호 외치기·손가락 들기).
// 그래서 슬라이드는 한 화면에 한 가지를 크게(단어 ≥ 60px, 글자 카드 ≥ 120px), 보기에는 큰 번호(1·2·3)를 붙여 번호로 답하게 하고, 힌트(ko)에 누가 무엇을 하는지 적는다.
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
    return tWrap(ctx, App.book.instructions.listen_repeat, '선생님이 🔊 이름·소리, ♪ 챈트를 눌러요. 아이들은 큰 소리로 따라 말하고 ✋ 동작을 해요. 아래 단어 그림을 누르면 단어가 나와요', s, ctx.unit.letters.length, body);
  },
};
// 쓰기: 글자마다 획순 한 장 + 짝 찾기 한 장
TEACH.trace = {
  count: (ctx) => ctx.unit.letters.length * 2,
  render: (ctx, s) => {
    const ls = ctx.unit.letters, n = ls.length * 2;
    if (s < ls.length) {
      const l = ls[s];
      const one = (ch) => `<div class="sl-trace"><div class="anim say" data-say="name_${l}" data-text="${l.toUpperCase()}" onclick="this.innerHTML=this.innerHTML">${strokeSvg(ch)}</div>
        <div class="trace-line"><span class="solid">${ch}</span><span>${ch}</span><span>${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span></div></div>`;
      return tWrap(ctx, App.book.instructions.trace_write, '선생님이 획순 그림을 누르면 순서대로 그려져요. 아이들은 허공에 손가락으로 크게 따라 쓴 뒤 자기 책에 써요', s, n, `<div class="sl-trace-grid">${one(l.toUpperCase())}${one(l)}</div>`);
    }
    // 짝 찾기: 큰 글자 하나 → 작은 글자 보기 4개(1~4). 아이들이 번호를 외치면 선생님이 눌러 확인
    const i = s - ls.length, l = ls[i], others = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((x) => !ls.includes(x));
    const set = shuffle([l, others[(i * 5) % others.length], others[(i * 5 + 7) % others.length], others[(i * 5 + 13) % others.length]], i + ctx.u + 3);
    const body = `<div class="sl-pair"><div class="sl-pair-target ${letterCls(l)}">${l.toUpperCase()}</div><div class="sl-pair-q">Where is small <b>${l}</b>?</div>
      <div class="circle-box sl-pair-opts" data-pair="${l}">${set.map((ch, k) => `<span class="ltr" data-ch="${ch}" onclick="circlePick(this)"><i>${k + 1}</i>${ch}</span>`).join('')}</div></div>`;
    return tWrap(ctx, App.book.instructions.look_circle, '큰 글자의 짝(작은 글자)은 몇 번? 아이들이 번호를 외치면(손가락으로 들어도 좋아요) 선생님이 그 칸을 눌러 확인해요', s, n, body);
  },
};
// 단어: 글자마다 한 장 — 큰 글자 + 단어 카드 3장(번호 1·2·3) + 그 글자 챈트
TEACH.words = {
  count: (ctx) => ctx.unit.letters.length,
  render: (ctx, s) => {
    const l = ctx.unit.letters[s], n = ctx.unit.letters.length;
    const cards = L(l).words.map((w, i) => `<div class="rd-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${esc(w)}"><span class="num">${i + 1}</span>${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div></div>`).join('');
    return tWrap(ctx, App.book.instructions.listen_repeat, '선생님이 그림을 누르면 단어가 나와요 — 아이들은 자기 책 단어를 짚으며 따라 말해요. "몇 번?" 하면 번호로, ♪ 챈트는 박자에 맞춰 다 같이', s, n,
      `<div class="sl-tools"><button class="btn orange big main-play" onclick="wordChantLetter('${l}')">♪ ${esc(App.book.instructions.word_chant)}</button></div><div class="sl-wl"><div class="sl-wl-ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div><div class="rd-cards">${cards}</div></div>`);
  },
};
// 글자 하나의 챈트: 소리 → 단어 3개 (반주 chant_word 가 있으면 1.2초 박자)
async function wordChantLetter(l) {
  Sound.unlock(); const beat = await chantTrack('chant_word');
  const items = [{ id: 'sound_' + l, text: soundText(l), el: document.querySelector('.sl-wl-ltr'), gap: 250, beat }, ...L(l).words.map((w) => ({ id: 'word_' + w, text: w, el: document.querySelector(`.rd-card[data-word="${w}"]`), gap: 300, beat }))];
  await playSeq(items); chantTrackOff();
}
// 따라 읽기(단어 3개씩 큰 카드, 번호 1·2·3) + 소리 잡기 팀전(보기에 번호) + 짝 맞추기(번호 카드) — 짝 맞추기는 선생님 슬라이드에만 있다
TEACH.read_play = {
  count: (ctx) => Math.ceil(unitWords(ctx.unit).length / 3) + 2,
  render: (ctx, s) => {
    const ws = unitWords(ctx.unit), R = Math.ceil(ws.length / 3), n = R + 2;
    if (s < R) {
      const cards = ws.slice(s * 3, s * 3 + 3).map((w, i) => `<div class="rd-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${esc(w)}"><span class="num">${i + 1}</span>${pic('word_' + w, '', w)}<div class="wd">${wordMark(w)}</div></div>`).join('');
      return tWrap(ctx, 'Read it! 1 · 2 · 3', '선생님이 "Number 2!" 하면 아이들이 그 단어를 읽어요. 그림을 누르면 소리로 확인. 다 읽으면 자기 책에 따라 써요', s, n, `<div class="rd-cards">${cards}</div>`);
    }
    if (s === R) return tWrap(ctx, App.book.instructions.lets_play, B2() ? '🔊 단어가 들리면 아이들이 1·2·3 번호를 외쳐요. 선생님이 그 그림을 누르면 확인. A·B 팀을 골라 두면 맞힌 팀 점수가 올라요' : '🔊 소리가 들리면 그 소리로 시작하는 그림 번호(1·2·3)를 아이들이 외쳐요. 선생님이 그 그림을 누르면 확인. A·B 팀을 골라 두면 맞힌 팀 점수가 올라요', s, n, gameHtml(ctx, true).replace('class="game"', 'class="game sl-game"'));
    return tWrap(ctx, 'Memory game', '아이가 번호 두 개를 외치면("3, 7!") 선생님이 그 카드를 눌러 뒤집어요. 뒤집힐 때 단어를 다 같이 말해요. 같은 그림이면 그대로 남아요', s, n, `<div class="sl-tools"><button class="btn orange big main-play" onclick="memStart()">▶ Memory game</button><span class="mem-msg" id="memMsg"></span></div><div class="memory" id="memory">${memCards(ctx, true)}</div>`);
  },
};
// 짝 맞추기: 유닛 단어 6개 × 2 = 12장(4×3). 뒤집으면 단어 소리, 짝이면 그대로, 다 맞추면 Great job
const MEM = { open: [], lock: false, done: 0, words: [] };
function memCards(ctx, closed) {
  const words = shuffle(unitWords(ctx.unit), Date.now() % 1000).slice(0, 6);
  MEM.words = words; MEM.open = []; MEM.lock = false; MEM.done = 0;
  const cards = shuffle(words.concat(words), (Date.now() % 977) + 1);
  return cards.map((w, i) => `<div class="mcard" data-w="${esc(w)}" data-i="${i}" onclick="memFlip(this)"><div class="back">${i + 1}</div><div class="face">${pic('word_' + w, '', w)}<span>${esc(w)}</span></div></div>`).join('');
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
// 12쪽(2차시 첫 쪽) — 큰 화면 수업용 4장. 아이들은 멀리 앉아 있으니 화면을 짚지 않고 입으로 답한다(따라 말하기 · 단어 외치기 · 번호 외치기)
TEACH.listen_point = {
  count: () => 4,
  render: (ctx, s) => {
    const n = 4;
    if (s === 0) return tWrap(ctx, 'Listen and repeat.', '큰 카드 한 장씩: ▶ Auto 는 글자 소리 → 단어 순서로 넘어가요. 아이들은 자기 책을 짚으며 큰 소리로 따라 말해요', 0, n, bigCardsHtml(ctx));
    if (s === 1) return tWrap(ctx, "What's this?", '그림만 보여요. 아이들이 단어를 외치면 카드를 눌러(또는 Space) 답을 보여 주고 소리를 들려줘요. 순서는 무작위', 1, n, guessHtml(ctx));
    if (s === 2) return tWrap(ctx, 'Which one? 1, 2, 3!', '🔊 단어가 들리면 아이들이 1·2·3 번호를 외쳐요(손가락으로 들어도 좋아요). 선생님이 그 그림을 누르면 정답 확인. A·B 팀 점수', 2, n, whichHtml(ctx));
    return tWrap(ctx, 'Speed round!', '30초 동안 카드가 한 장씩 나와요. 글자는 소리를, 단어는 읽어요. 아이가 말하면 ✔, 못 하면 ✖', 3, n,
      `<div class="speed" id="speed"><div class="sp-bar"><button class="btn orange big main-play" onclick="speedStart()">▶ Start</button><span class="timer" id="spTimer">30</span><span class="sp-score" id="spScore">✔ 0 · ✖ 0</span></div>
        <div class="sp-card" id="spCard"><div class="hint">▶ 를 누르면 시작!</div></div>
        <div class="sp-btns"><button class="btn big okb" onclick="speedMark(true)">✔</button><button class="btn big nob" onclick="speedMark(false)">✖</button></div></div>`);
  },
};
// 단어 → 글자 (단어가 속한 글자)
function wordLetter(ctx, w) { return ctx.unit.letters.find((l) => L(l).words.includes(w)) || w[0]; }
// ① 큰 카드: 한 번에 한 장(그림 크게 + 글자 + 단어), 아래 띠로 건너뛰기, ▶ Auto 로 차례 재생
const BIG = { i: 0, ws: [], auto: 0 };
function bigCardsHtml(ctx) {
  BIG.ws = ctx.unit.letters.flatMap((l) => L(l).words); BIG.i = 0;
  const strip = BIG.ws.map((w, i) => `<div class="bc-thumb ${i === 0 ? 'on' : ''}" data-i="${i}" onclick="bigGo(${i})">${pic('word_' + w, '', w)}</div>`).join('');
  return `<div class="bigcards" id="bigcards"><div class="bc-tools sl-tools"><button class="btn orange big main-play" onclick="bigAuto()">▶ Auto</button><button class="btn big" onclick="bigGo(BIG.i - 1)">◀</button><button class="btn big" onclick="bigGo(BIG.i + 1)">▶</button><span class="bc-count" id="bcCount">1 / ${BIG.ws.length}</span></div>
    <div class="bc-card" id="bcCard">${bigCardInner(ctx, 0)}</div><div class="bc-strip">${strip}</div></div>`;
}
function bigCardInner(ctx, i) {
  const w = BIG.ws[i], l = wordLetter(ctx, w);
  return `<div class="bc-pic say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}</div><div class="bc-side"><div class="bc-ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div><div class="bc-word say" data-say="word_${esc(w)}" data-text="${esc(w)}">${wordHtml(w, l)}</div></div>`;
}
function bigGo(i, silent) {
  const ctx = { unit: App.units[App.u] }; if (!BIG.ws.length) return;
  BIG.i = (i + BIG.ws.length) % BIG.ws.length;
  const c = $('bcCard'); if (!c) return;
  c.innerHTML = bigCardInner(ctx, BIG.i); $('bcCount').textContent = `${BIG.i + 1} / ${BIG.ws.length}`;
  document.querySelectorAll('.bc-thumb').forEach((t) => t.classList.toggle('on', +t.dataset.i === BIG.i));
  if (!silent) { Sound.unlock(); stopSeq(); Sound.play('word_' + BIG.ws[BIG.i], BIG.ws[BIG.i]); }
}
async function bigAuto() {   // 글자마다: 이름 → 소리 → 그 글자 단어 3개(카드 넘기며)
  Sound.unlock(); stopSeq(); const ctx = { unit: App.units[App.u] }; const my = ++BIG.auto;
  for (let i = 0; i < BIG.ws.length; i++) {
    if (my !== BIG.auto) return;
    const w = BIG.ws[i], l = wordLetter(ctx, w);
    bigGo(i, true);
    if (i === 0 || wordLetter(ctx, BIG.ws[i - 1]) !== l) { const ok = await playSeq([{ id: 'name_' + l, text: l.toUpperCase(), gap: 250 }, { id: 'sound_' + l, text: soundText(l), gap: 400 }]); if (!ok) return; }
    const ok = await playSeq([{ id: 'word_' + w, text: w, el: $('bcCard'), gap: 900 }]); if (!ok) return;
  }
}
// ② What's this?: 그림만 → 아이들이 외치면 누르거나 Space 로 답 공개
const GUESS = { ws: [], i: 0, open: false };
function guessHtml(ctx) {
  GUESS.ws = shuffle(ctx.unit.letters.flatMap((l) => L(l).words), Date.now() % 997); GUESS.i = 0; GUESS.open = false;
  return `<div class="guess" id="guess"><div class="sl-tools"><button class="btn orange big main-play" onclick="guessReveal()">Show! (Space)</button><button class="btn big" onclick="guessNext()">Next ▶</button><span class="bc-count" id="gCount">1 / ${GUESS.ws.length}</span></div><div class="g-card" id="gCard" onclick="guessReveal()">${guessInner(ctx)}</div></div>`;
}
function guessInner(ctx) {
  const w = GUESS.ws[GUESS.i], l = wordLetter(ctx, w);
  return `<div class="g-pic">${pic('word_' + w, '', w)}</div><div class="g-word ${GUESS.open ? 'open' : ''}"><span class="q">?</span><span class="a">${wordHtml(w, l)}</span></div>`;
}
function guessReveal() {
  if (GUESS.open) return guessNext();
  GUESS.open = true; const c = $('gCard'); if (!c) return; c.querySelector('.g-word').classList.add('open'); Sound.unlock(); Sound.play('word_' + GUESS.ws[GUESS.i], GUESS.ws[GUESS.i]);
}
function guessNext() {
  const ctx = { unit: App.units[App.u] };
  if (GUESS.i + 1 >= GUESS.ws.length) { Sound.sfx('chime'); GUESS.i = 0; GUESS.ws = shuffle(GUESS.ws, Date.now() % 991); } else GUESS.i++;
  GUESS.open = false; const c = $('gCard'); if (c) c.innerHTML = guessInner(ctx); const k = $('gCount'); if (k) k.textContent = `${GUESS.i + 1} / ${GUESS.ws.length}`;
}
// ③ Which one?: 🔊 단어 → 큰 그림 3개(1·2·3) → 아이들이 번호를 외침 → 선생님이 누르면 확인. A·B 팀 점수
const WHICH = { ws: [], i: 0, cur: '', opts: [], team: 'A', score: { A: 0, B: 0 }, done: false };
function whichHtml(ctx) {
  WHICH.ws = shuffle(ctx.unit.letters.flatMap((l) => L(l).words), Date.now() % 983); WHICH.i = 0; WHICH.score = { A: 0, B: 0 }; WHICH.done = false;
  return `<div class="which" id="which"><div class="sl-tools"><button class="btn orange big main-play" onclick="whichPlay()">🔊 Listen</button><button class="btn big" onclick="whichNext()">Next ▶</button><span class="bc-count" id="wCount">1 / ${WHICH.ws.length}</span>
      <span class="teams"><button class="team ${WHICH.team === 'A' ? 'on' : ''}" id="teamA" onclick="whichTeam('A')">A <b>0</b></button><button class="team" id="teamB" onclick="whichTeam('B')">B <b>0</b></button></span></div>
    <div class="w-opts" id="wOpts">${whichInner(ctx)}</div></div>`;
}
function whichInner(ctx) {
  const all = ctx.unit.letters.flatMap((l) => L(l).words); WHICH.cur = WHICH.ws[WHICH.i];
  const others = shuffle(all.filter((w) => w !== WHICH.cur), Date.now() % 977).slice(0, 2);
  WHICH.opts = shuffle([WHICH.cur, ...others], Date.now() % 971); WHICH.done = false;
  return WHICH.opts.map((w, i) => `<div class="w-opt" data-w="${w}" onclick="whichPick(this)"><span class="num">${i + 1}</span>${pic('word_' + w, '', w)}<div class="wd">${esc(w)}</div></div>`).join('');
}
function whichPlay() { Sound.unlock(); stopSeq(); Sound.play('word_' + WHICH.cur, WHICH.cur); }
function whichTeam(t) { WHICH.team = t; document.querySelectorAll('.which .team').forEach((b) => b.classList.toggle('on', b.id === 'team' + t)); }
function whichPick(el) {
  if (WHICH.done) return; Sound.unlock();
  if (el.dataset.w === WHICH.cur) { WHICH.done = true; el.classList.add('hit'); Sound.sfx('ok'); WHICH.score[WHICH.team]++; const b = document.querySelector('#team' + WHICH.team + ' b'); if (b) b.textContent = WHICH.score[WHICH.team]; Sound.play('word_' + WHICH.cur, WHICH.cur); }
  else { el.classList.add('miss'); Sound.sfx('no'); setTimeout(() => el.classList.remove('miss'), 500); }
}
function whichNext() {
  const ctx = { unit: App.units[App.u] };
  if (WHICH.i + 1 >= WHICH.ws.length) { Sound.sfx('chime'); WHICH.i = 0; WHICH.ws = shuffle(WHICH.ws, Date.now() % 967); } else WHICH.i++;
  const o = $('wOpts'); if (o) o.innerHTML = whichInner(ctx); const k = $('wCount'); if (k) k.textContent = `${WHICH.i + 1} / ${WHICH.ws.length}`;
  setTimeout(whichPlay, 400);
}
TEACH._listen_point_old = {
  count: () => 2,
  render: (ctx, s) => {
    if (s === 1) return tWrap(ctx, 'Speed round!', '30초 동안 카드가 한 장씩 나와요. 글자는 소리를, 단어는 읽어요. 아이가 말하면 ✔, 못 하면 ✖', 1, 2,
      `<div class="speed" id="speed"><div class="sp-bar"><button class="btn orange big main-play" onclick="speedStart()">▶ Start</button><span class="timer" id="spTimer">30</span><span class="sp-score" id="spScore">✔ 0 · ✖ 0</span></div>
        <div class="sp-card" id="spCard"><div class="hint">▶ 를 누르면 시작!</div></div>
        <div class="sp-btns"><button class="btn big okb" onclick="speedMark(true)">✔</button><button class="btn big nob" onclick="speedMark(false)">✖</button></div></div>`);
    const rows = lpRows(ctx);
    return tWrap(ctx, App.book.instructions.listen_point, '① ▶ Listen: 손가락으로 짚으며 따라 말하기 ② 🔀 Point!: 들리는 단어 그림 누르기(아이를 불러 칠판에서) ③ 혼자 말하기 → ✓ 표시', 0, 2, `<div class="sl-tools">${lpTools(ctx, true)}</div><div class="lp-table sl-lp">${rows}</div>`);
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
    const bubbles = pn.lines.map((ln, k) => `<div class="bubble say" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="${idx}" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}${lineKo(ln, ctx)}</span></div>`).join('');
    const sofar = idx === 0 ? soFarHtml(ctx) : '';   // 첫 칸 슬라이드에만 지난·이번 이야기 띠
    const sw = idx === 0 && ctx.unit.sight_words.length ? `<div class="sw"><b>${esc(App.book.instructions.sight_words)}</b>${ctx.unit.sight_words.map((w) => `<span class="say" data-say="sw_${esc(w)}" data-text="${esc(w)}">${esc(w)}</span>`).join('')}</div>` : '';
    const find = pn.hidden?.length ? `<div class="find"><b>🔍 Find:</b>${pn.hidden.map((w) => `<span class="chip" data-say="word_${esc(w)}" data-text="${esc(w)}" onclick="this.classList.toggle('on')">${esc(w)}</span>`).join('')}</div>` : '';
    const movie = pn.video ? `<button class="btn blue" onclick="playVideo(${idx})">▶ movie</button>` : '';
    const body = `${sofar}<div class="sl-story ${sofar ? 'with-sofar' : ''}"><div class="panel" data-panel="${idx}"><div class="scene">${pic(pn.id, '', 'scene')}</div><span class="no">${idx + 1}</span></div>
      <div class="sl-story-side">${sw}<div class="sl-tools"><button class="btn orange big main-play" onclick="storyPlayPanel(${idx})">▶ ${esc(App.book.instructions.listen_story)}</button>${movie}${roleBtn(true)}${koBtn(true, st)}</div><div class="bubbles-col">${bubbles}</div>${find}${koBox(pn, ctx)}</div></div>`;
    return tWrap(ctx, st.title, '선생님이 ▶ 를 누르면 음악과 함께 대사가 나와요. 아이들은 자기 책 말풍선을 짚으며 따라 말해요. 🎭 역할: 선생님이 친구 얼굴을 눌러 정하면 그 줄은 아이들이 읽어요', s, n, body);
  },
};
TEACH.intro_story = { count: (ctx) => ctx.unit.story.panels.length, render: (ctx, s) => TEACH.story.render({ ...ctx, page: { ...ctx.page, half: 1 } }, s) };
// 정리: A·B·C 한 장씩 (복습 평가도 같은 모양, 문항만 많다)
TEACH.check = { count: () => 3, render: (ctx, s) => checkSlides(ctx, ctx.unit.check, s) };
TEACH.review_test = { count: () => 3, render: (ctx, s) => checkSlides(ctx, ctx.unit.review.test, s) };
function checkSlides(ctx, c, s) {
  if (c.read_circle) {   // 2권: 읽고 동그라미 / 단어–그림 잇기 / 빠진 글자
    if (s === 0) return tWrap(ctx, 'A. ' + (App.book.instructions.read_circle || 'Read and circle.'), '아이들이 단어를 읽고 맞는 그림 번호(1·2·3)를 외쳐요. 선생님이 그 그림을 누르면 확인(초록 = 정답). 자기 책에는 동그라미', 0, 3, `<div class="sl-check many rc">${c.read_circle.map((it, i) => `<div class="sl-lc">${rcRow(it, i)}</div>`).join('')}</div>`);
    if (s === 1) return tWrap(ctx, 'B. ' + (App.book.instructions.read_match || 'Read and match.'), '선생님이 단어를 누르면(소리) 아이들이 맞는 그림 번호를 외쳐요. 선생님이 그 그림을 누르면 선이 이어져요(초록)', 1, 3, matchHtml2(c, 'sl-match' + (c.match.length > 3 ? ' n4' : '')));
    return tWrap(ctx, 'C. Write the missing letter.', '빠진 글자는 뭘까요? 아이들이 글자를 외치면 선생님이 빈 칸을 눌러 보여 줘요. 아이들은 자기 책에 써요', 2, 3, `<div class="write-row sl-write w2 n4">${writeItems2(c)}</div>`);
  }
  if (s === 0) {
    const lc = c.listen_circle.map((it, i) => `<div class="sl-lc">${lcRow(it, i, true)}</div>`).join('');
    return tWrap(ctx, 'A. ' + App.book.instructions.listen_circle, '선생님이 🔊 를 누르면 아이들이 맞는 보기 번호(1·2·3)를 외쳐요. 선생님이 그 보기를 누르면 확인(초록 = 정답). 자기 책에는 동그라미', 0, 3, `<div class="sl-check ${c.listen_circle.length > 3 ? 'many' : ''}">${lc}</div>`);
  }
  if (s === 1) return tWrap(ctx, 'B. ' + App.book.instructions.match_read, '선생님이 글자를 누르면(소리) 아이들이 그 소리로 시작하는 그림 번호를 외쳐요 → 선생님이 그 그림을 누르면 이어져요 → 다 같이 단어 읽기', 1, 3, matchHtml(c, 'sl-match' + (c.match.length > 3 ? ' n4' : '')));
  return tWrap(ctx, 'C. ' + App.book.instructions.find_circle, '첫소리 글자는? 아이들이 글자를 외치면 선생님이 그 글자를 눌러 확인해요. 아이들은 자기 책에 써요', 2, 3, `<div class="write-row sl-write ${c.find_write.length > 3 ? 'n4' : ''}">${writeItems(ctx, c)}</div>`);
}
// 복습 유닛: 소리 복습은 글자 6개씩 한 장, 놀이판·빙고는 크게 한 장
TEACH.review_sounds = {
  count: (ctx) => Math.ceil(unitLetters(ctx.unit).length / 6),
  render: (ctx, s) => {
    const ls = unitLetters(ctx.unit), n = Math.ceil(ls.length / 6), part = ls.slice(s * 6, s * 6 + 6);
    return tWrap(ctx, App.book.instructions.listen_repeat, '선생님이 글자·🔊 를 누르면 이름·소리가 나요. 아이들은 큰 소리로 따라 말해요. "이 글자 소리는?" 하고 먼저 물어보면 더 좋아요', s, n,
      `<div class="sl-tools"><button class="btn orange big main-play" onclick="reviewSoundsAll()">▶ Listen to all</button></div><div class="rv-cards sl-rv" style="grid-template-columns:repeat(3,minmax(0,1fr))">${part.map((l) => reviewCard(l)).join('')}</div>`);
  },
};
TEACH.review_board = { count: () => 1, render: (ctx) => tWrap(ctx, 'Roll and say.', '두 팀. 선생님이 🎲 를 누르면 말이 움직여요. 도착한 칸의 소리·단어를 그 팀이 외쳐요 (⭐ 한 칸 더 · ↩ 뒤로 · 🔁 다시)', 0, 1, `<div class="sl-board">${boardHtml(ctx)}</div>`) };
TEACH.review_bingo = { count: () => 1, render: (ctx) => tWrap(ctx, 'Bingo!', '아이들은 자기 책 빙고판에 단어를 써 두어요. 선생님이 🔊 로 단어를 부르고 그 칸을 눌러 표시 — 아이들은 자기 판에 동그라미, 한 줄이 되면 "빙고!" 외치기', 0, 1, `<div class="sl-bingo">${bingoHtml(ctx)}</div>`) };
// 2권: 합치기(단어마다 큰 줄) · 단어 가족 · 문장(문장마다 한 장) · 단어 복습 · 징검다리
TEACH.blend = {
  count: () => 1,
  render: (ctx) => {
    const f = ctx.page.family || unitFamilies(ctx.unit)[0], ws = (ctx.unit.words && ctx.unit.words[f]) || famWords(f);
    return tWrap(ctx, App.book.instructions.blend_read || 'Blend and read.', '선생님이 ▶ 를 누르면 글자 소리가 하나씩 나며 붙어요. 아이들은 소리를 따라 하고 손뼉 한 번에 단어를 외쳐요. 자기 책 글자를 손가락으로 짚으며', 0, 1,
      `<div class="blend-head"><span class="fam-big ${famCls(f, ctx.unit)}">${famHtml(f)}</span><span class="fam-say say" data-say="sound_${esc(famVowel(f))}" data-text="${esc(letterSound(famVowel(f)).text)}">🔊 /${esc(letterSound(famVowel(f)).text)}/</span><button class="btn orange big main-play" onclick="blendAll()">▶ Blend all</button></div><div class="blend-rows sl-blend">${ws.map((w) => blendRow(w, f, ctx.unit)).join('')}</div>`);
  },
};
// 단어 가족: ① 가족별 단어 크게 + 챈트 ② Read and find — 선생님이 단어를 누르면(소리) 아이들이 그림 번호를 외치고 선생님이 그 그림을 눌러 확인
TEACH.family_words = {
  count: () => 2,
  render: (ctx, s) => {
    const fs = unitFamilies(ctx.unit);
    const rows = fs.map((f) => `<div class="fw-row ${famCls(f, ctx.unit)}">${famTag(f, ctx.unit)}${((ctx.unit.words && ctx.unit.words[f]) || famWords(f)).map((w) => `<span class="fw say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-w="${esc(w)}" onclick="fwPick(event,this)">${wordFamHtml(w, f)}</span>`).join('')}</div>`).join('');
    if (s === 0) return tWrap(ctx, App.book.instructions.read_match || 'Read and match.', '선생님이 단어를 누르면 소리가 나요. 아이들은 자기 책을 짚으며 읽어요. ♪ 챈트는 박자에 맞춰 가족별로 다 같이', 0, 2, `<div class="sl-fw big"><div class="sl-tools"><button class="btn orange big main-play" onclick="famChant()">♪ ${esc(App.book.instructions.word_chant || 'Word chant')}</button></div><div class="fw-rows">${rows}</div></div>`);
    const pics = shuffle(unitWords(ctx.unit), 3 + ctx.u).slice(0, 10).map((w) => `<div class="fw-pic" data-w="${esc(w)}" onclick="fwDrop(this)">${pic('word_' + w, '', w)}<div class="line"></div></div>`).join('');
    return tWrap(ctx, 'Read and find! 1 ~ 10', '선생님이 단어를 누르면(소리) 아이들이 맞는 그림 번호를 외쳐요. 선생님이 그 그림을 누르면 단어가 적혀요(초록). 자기 책에서는 그림 아래에 단어 쓰기', 1, 2, `<div class="sl-fw"><div class="fw-rows">${rows}</div><div class="fw-pics sl-fwp">${pics}</div></div>`);
  },
};
TEACH.sentences = {
  count: (ctx) => (ctx.unit.sentences || []).length,
  render: (ctx, s) => { const sn = ctx.unit.sentences[s]; return tWrap(ctx, App.book.instructions.read_sentence || 'Read the sentence.', '아이들이 먼저 문장을 읽어요(사이트워드는 통째로). 선생님이 단어를 누르면 그 단어, 🔊 는 문장 전체 소리로 확인', s, ctx.unit.sentences.length, `<div class="sl-sent">${sentenceHtml(sn, ctx.unit, s).replace('class="spk', 'class="spk big')}</div>`); },
};
TEACH.review_words = {
  count: (ctx) => Math.ceil((ctx.unit.review.words || []).length / 8),
  render: (ctx, s) => { const ws = (ctx.unit.review.words || []).slice(s * 8, s * 8 + 8), n = Math.ceil((ctx.unit.review.words || []).length / 8);
    return tWrap(ctx, App.book.instructions.listen_repeat, '아이들이 그림을 보고 단어를 먼저 외쳐요 → 선생님이 그림을 눌러 소리로 확인. ▶ 는 차례로 다 듣기', s, n, `<div class="sl-tools"><button class="btn orange big main-play" onclick="reviewWordsAll()">▶ Listen to all</button></div><div class="rv-cards sl-rv rw" style="grid-template-columns:repeat(4,minmax(0,1fr))">${ws.map((w) => `<div class="rv-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-w="${esc(w)}"><div class="rv-pic">${pic('word_' + w, '', w)}</div><div class="rv-word">${wordFamHtml(w)}</div>${famTag(familyOf(w), ctx.unit, 'sm')}</div>`).join('')}</div>`); },
};
TEACH.word_song = { count: () => 1, render: (ctx) => TEACH.alphabet_song.render(ctx) };
TEACH.bridge_path = { count: () => 1, render: (ctx) => { pathNext = 0; return tWrap(ctx, 'Cross the pond.', '배운 순서대로 연못을 건너요. 아이들이 다음 징검다리(단어 가족)를 외치면 선생님이 그 돌을 눌러요. 틀리면 소리가 나요', 0, 1, `<div class="path path26 sl-path bridge" id="path">${shuffle(bridgeOrder(), 31 + ctx.u).map((f) => `<div class="lt" data-l="${f}" onclick="bridgePick(this)">${famHtml(f)}</div>`).join('')}</div>`); } };
TEACH.vowels = { count: () => 1, render: (ctx) => tWrap(ctx, App.book.instructions.listen_repeat, '선생님이 모음 카드를 누르면 소리가 나요. 아이들은 큰 소리로 따라 말해요. 단어 속 빨간 글자가 모음', 0, 1, `<div class="sl-tools"><button class="btn orange big main-play" onclick="vowelsAll()">▶ Listen to all</button></div><div class="vw-cards sl-vw">${vowelCards(ctx.unit)}</div>`) };
// 10유닛 알파벳 복습: 26칸 한 장 + 순서 잇기 한 장
TEACH.alphabet_review = {
  count: () => 2,
  render: (ctx, s) => {
    if (s === 0) return tWrap(ctx, 'Say all 26 sounds.', '▶ 로 26개 소리를 순서대로 — 아이들은 따라 말해요. 선생님이 글자 하나를 누르기 전에 "이 소리는?" 하고 물어보세요', 0, 2, `<div class="sl-tools"><button class="btn orange big main-play" onclick="abcSounds()">▶ 26 sounds</button><button class="btn big" onclick="abcSong(true)">A–Z names</button></div><div class="abc abc26 sl-abc">${abc26Grid()}</div>`);
    pathNext = 0;
    return tWrap(ctx, 'Follow A to Z.', 'A부터 Z까지: 아이들이 다음 글자를 외치면 선생님이 그 글자를 눌러요. 틀리면 소리가 나요', 1, 2, `<div class="path path26 sl-path" id="path">${path26Cells(ctx)}</div>`);
  },
};
// 12유닛 Follow A to Z: 색종이 타일 판 — 대문자 한 장, 소문자 한 장
TEACH.alphabet_path = {
  count: () => 2,
  render: (ctx, s) => {
    const ls = Object.keys(App.book.letters), upper = s === 0;
    const cells = shuffle(ls, upper ? 11 : 29).map((l) => `<div class="lt" data-l="${l}" onclick="pathPick(this)"><span>${upper ? l.toUpperCase() : l}</span></div>`).join('');
    return tWrap(ctx, upper ? 'Follow A to Z.' : 'Follow a to z.', (upper ? 'A부터 Z까지' : 'a부터 z까지') + ': 아이들이 다음 글자를 외치면 선생님이 그 색종이를 눌러요. 틀리면 소리가 나요. 자기 책에서는 선으로 잇기', s, 2, `<div class="path paper sl-path sl-paper" id="path" data-next="0">${cells}</div>`);
  },
};
// 친구들 소개: 한 장
TEACH.characters = {
  count: () => 1,
  render: (ctx) => {
    const cs = Object.entries(App.book.characters).map(([id, c]) => `<div class="char">${pic('char_' + id + '_ref', '', c.name)}<h3 style="color:${c.color}">${esc(c.name)} <span class="ko">${esc(c.ko)}</span></h3><div class="say-line say" data-say="catch_${id}" data-text="${esc(c.catchphrase.replace(/[()]/g, ''))}">${esc(c.catchphrase)}</div>${c.role_ko ? `<div class="role">${esc(c.role_ko)}</div>` : ''}</div>`).join('');
    return tWrap(ctx, 'Meet the friends!', '선생님이 노란 말을 누르면 친구가 인사해요. 아이들은 이름과 인사말을 따라 말해요', 0, 1, `<div class="chars sl-chars n${Object.keys(App.book.characters).length}">${cs}</div>`);
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

// ---------- 12유닛: The Alphabet Show ----------
// 노래 한 장(가사 두 단, 부르는 줄로 스크롤) · 단어 사냥 라운드마다 한 장 · 공연 장면마다 한 장 + 피날레 · 수료증 한 장
TEACH.alphabet_song = {
  count: () => 1,
  render: (ctx) => tWrap(ctx, `♪ ${ctx.unit.show.song.title}`, '선생님이 ▶ 를 누르면 처음부터 끝까지, 줄을 누르면 그 줄만. 아이들은 자기 책 가사를 보며 다 같이 불러요', 0, 1,
    `<div class="sl-tools"><button class="btn orange big main-play" onclick="songPlay()">▶ Sing!</button><button class="btn big" onclick="stopSeq();chantTrackOff()">⏹</button></div><div class="song sl-song">${songLines(ctx.unit, true)}</div>`),
};
TEACH.word_hunt = {
  count: (ctx) => ctx.unit.show.hunt.rounds.length,
  render: (ctx, s) => {
    const n = ctx.unit.show.hunt.rounds.length; HUNT.i = s; HUNT.found = 0;
    return tWrap(ctx, 'Word hunt!', '아이들이 장면에서 그 소리로 시작하는 것을 찾아 단어를 외쳐요. 선생님이 그 단어 단추를 누르면 ✓. 다 찾으면 ▶ 로 다음 라운드', s, n,
      `<div class="hunt-bar"><span class="round" id="huntRound">${s + 1} / ${n}</span><span class="stars" id="huntStars">${'⭐'.repeat(HUNT.score)}</span><span class="msg" id="huntMsg"></span></div><div class="hunt sl-hunt" id="hunt">${huntRoundHtml(ctx, s)}</div>`);
  },
};
TEACH.story_recap = {
  count: (ctx) => ctx.unit.show.recap.length + 1,
  render: (ctx, s) => {
    const rc = ctx.unit.show.recap, n = rc.length + 1;
    if (s < rc.length) {
      const r = rc[s];
      return tWrap(ctx, `Unit ${r.unit}`, '"이 장면 기억나요?" — 아이들이 무슨 일이었는지 말해요. 선생님이 ▶ 를 누르면 대사. 🎭 역할 읽기는 스토리 쪽과 같아요', s, n,
        `<div class="sl-recap"><div class="stage-pic">${pic(r.scene, '', 'scene')}</div><div class="sl-recap-side"><div class="sl-tools"><button class="btn orange big main-play" onclick="recapSlideLine(${s})">▶ Listen</button>${roleBtn(true)}${(r.ko || r.line.ko) ? koBtn(true) : ''}</div><div class="bubbles-col"><div class="bubble say" id="recapBubble" data-say="${esc(r.line.audio)}" data-text="${esc(r.line.text)}">${avatar(r.line.who)}<span>${esc(r.line.text)}${lineKo(r.line, ctx)}</span></div></div>${r.ko ? `<div class="kobox kohelp"><div class="kd">${esc(r.ko)}</div></div>` : ''}</div></div>`);
    }
    const fin = ctx.unit.story.panels[0];
    const bubbles = fin.lines.map((ln, k) => `<div class="bubble say" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="0" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}${lineKo(ln, ctx)}</span></div>`).join('');
    return tWrap(ctx, ctx.unit.story.title, '피날레! 선생님이 ▶ 를 누르면 음악과 함께 대사가 나와요. 아이들은 다 같이 따라 외쳐요', s, n,
      `<div class="sl-recap"><div class="stage-pic">${pic(fin.id, '', 'scene')}</div><div class="sl-recap-side"><div class="sl-tools"><button class="btn orange big main-play" onclick="storyPlayPanel(0)">▶ ${esc(App.book.instructions.listen_story)}</button>${roleBtn(true)}</div><div class="bubbles-col">${bubbles}</div></div></div>`);
  },
};
async function recapSlideLine(i) {
  Sound.unlock(); const unit = App.units[App.u], r = unit.show.recap[i]; Sound.bgm(unit.story.bgm);
  await playSeq([storyItem(r.line, $('recapBubble'), {}, 0, 1)]);
}
TEACH.certificate = { count: () => 1, render: (ctx) => tWrap(ctx, 'Certificate', '선생님이 아이 이름을 넣고 🖨 로 인쇄해요. 화면에 이름이 뜨면 다 같이 박수!', 0, 1, `<div class="sl-cert">${PAGES.certificate(ctx)}</div>`) };
