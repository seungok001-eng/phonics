// Pop! Phonics 웹 교재 — 쪽 종류별 그리기. 각 함수는 ctx 를 받아 쪽 안쪽 HTML 을 돌려준다.
// ctx = { book, unit, b('sb'|'wb'), u, p, page(쪽 명세), pages(쪽 목록), print }
const PAGES = {};

function instr(n, text, ko) { return `<div class="instr">${n ? `<span class="n">${n}</span>` : ''}<span>${esc(text)}</span>${ko ? `<span class="ko">${esc(ko)}</span>` : ''}</div>`; }
function spk(id, text, big) { return `<button class="spk ${big ? 'big' : ''} print-hide" data-say="${esc(id)}" data-text="${esc(text)}" title="듣기">🔊</button>`; }
// 머리띠 글자: 일반 유닛은 글자 전부, 복습 유닛은 앞 4개 + "…", 0유닛은 없음
function lettersBadge(unit) {
  const fs = unitFamilies(unit);
  if (fs.length) { const show = unit.families && unit.families.length ? fs : fs.slice(0, 4); return `<div class="letters fams">${show.map((f) => `<span class="${famCls(f, unit)}">${famHtml(f)}</span>`).join('')}${show.length < fs.length ? '<span class="more">…</span>' : ''}</div>`; }
  const ls = unitLetters(unit); if (!ls.length) return '';
  const show = unit.letters.length ? ls : ls.slice(0, 4);
  return `<div class="letters">${show.map((l) => `<span class="${letterCls(l)}">${l.toUpperCase()}${l}</span>`).join('')}${show.length < ls.length ? '<span class="more">…</span>' : ''}</div>`;
}
function avatar(who) {
  if (who === 'narrator') return `<span class="av" data-who="narrator">📖</span>`;
  if (who === 'both') return `<span class="av" data-who="both">👧👦</span>`;
  return `<span class="av ${ROLE.has(who) ? 'role' : ''}" data-who="${esc(who)}" onclick="roleTap(event,this)"><img src="${artSrc('char_' + who + '_ref')}" data-blink="${artSrc('char_' + who + '_blink')}" data-talk="${artSrc('char_' + who + '_talk')}" onerror="this.parentElement.classList.add('missing');this.replaceWith(document.createTextNode('${esc(App.book.characters[who]?.name || who)}'))"></span>`;
}
// 역할 읽기: 🎭 를 켜고 말풍선의 아바타(번·헤지·그럼블)를 누르면 "아이가 읽는 역할". 자동 읽기 때 그 줄은 소리 없이 말풍선만 켜지고 2.5초 기다린다.
const ROLE = new Set(); ROLE.on = false;
const ROLE_SKIP = ['narrator', 'both', 'pip'];   // 핍은 소리만 내니 역할에서 뺀다
function roleToggle(btn) { ROLE.on = !ROLE.on; document.querySelectorAll('.role-btn').forEach((b) => b.classList.toggle('on', ROLE.on)); document.body.classList.toggle('role-on', ROLE.on); toast(ROLE.on ? '🎭 말풍선의 친구를 누르면 아이가 읽는 역할이 돼요' : '역할 읽기 끔'); }
function roleTap(e, av) {
  if (!ROLE.on) return;
  e.stopPropagation(); e.preventDefault();
  const who = av.dataset.who; if (ROLE_SKIP.includes(who)) return;
  if (ROLE.has(who)) ROLE.delete(who); else ROLE.add(who);
  document.querySelectorAll(`.av[data-who="${who}"]`).forEach((x) => x.classList.toggle('role', ROLE.has(who)));
  Sound.unlock(); Sound.sfx('tap');
}
function roleBtn(big) { return `<button class="btn ${big ? 'big' : 'small'} role-btn print-hide ${ROLE.on ? 'on' : ''}" onclick="roleToggle(this)" title="역할 읽기: 켜고 말풍선의 친구를 누르면 그 줄은 아이가 읽어요">🎭 역할</button>`; }
// ---------- 우리말 도움 (💬 우리말): 칸 설명(panels[].ko)·대사 번역(lines[].ko)·질문(panels[].ask). 선생님 모드 기본 켬, 학생 화면 기본 끔 (모드별로 기억). 인쇄에는 없음
const KO = { on: false };
function koKey() { return App.teacher ? 'pp_ko_t' : 'pp_ko_s'; }
function koInit() { let v = null; try { v = localStorage.getItem(koKey()); } catch (e) { /* 없어도 동작 */ } KO.on = v === null ? !!App.teacher : v === '1'; document.body.classList.toggle('ko-on', KO.on); return KO.on; }
function koToggle() { KO.on = !KO.on; try { localStorage.setItem(koKey(), KO.on ? '1' : '0'); } catch (e) { /* 무시 */ } document.body.classList.toggle('ko-on', KO.on); document.querySelectorAll('.ko-btn').forEach((b) => b.classList.toggle('on', KO.on)); }
function hasKo(st) { return !!(st && st.panels && st.panels.some((pn) => pn.ko || (pn.ask && pn.ask.length) || pn.lines.some((ln) => ln.ko))); }   // 우리말 자료가 있는 유닛만 단추를 보인다
function koBtn(big, st) { koInit(); if (st && !hasKo(st)) return ''; return `<button class="btn ${big ? 'big' : 'small'} ko-btn print-hide ${KO.on ? 'on' : ''}" onclick="koToggle()" title="우리말 도움: 칸 설명·대사 번역·질문을 보여요 (선생님이 읽고 아이가 답해요)">💬 우리말</button>`; }
function koBox(pn, ctx) {   // 칸 설명 + 질문 두 개
  if (ctx.print || !(pn.ko || (pn.ask && pn.ask.length))) return '';
  return `<div class="kobox kohelp">${pn.ko ? `<div class="kd">${esc(pn.ko)}</div>` : ''}${(pn.ask || []).map((a) => `<div class="ask"><b>Q</b>${esc(a.en)}<small>${esc(a.ko)}</small></div>`).join('')}</div>`;
}
function lineKo(ln, ctx) { return !ctx.print && ln.ko ? `<small class="tr kohelp">${esc(ln.ko)}</small>` : ''; }
// 지난 이야기(so_far_ko: 앞 유닛 마지막 칸 썸네일 + 한 줄) · 이번 이야기(goal_ko)
function prevScene(u) { let last = null; for (const x of App.book.units) { if (x.n === u) break; const uj = App.units[x.n]; if (uj && uj.story && uj.story.panels && uj.story.panels.length) last = uj.story.panels[uj.story.panels.length - 1].id; } return last; }
function soFarHtml(ctx) {
  const st = ctx.unit.story; if (ctx.print || !(st.so_far_ko || st.goal_ko)) return '';
  const prev = st.so_far_ko ? prevScene(ctx.u) : null;
  return `<div class="sofar print-hide">${st.so_far_ko ? `<div class="sf">${prev ? pic(prev, 'thumb', 'last scene') : ''}<div><b>지난 이야기</b>${esc(st.so_far_ko)}</div></div>` : ''}${st.goal_ko ? `<div class="sf goal"><div><b>이번 이야기</b>${esc(st.goal_ko)}</div></div>` : ''}</div>`;
}
// 스토리 한 줄을 playSeq 항목으로 (역할 줄이면 소리 없이 2.5초)
function storyItem(ln, el, pn, idx, k) {
  const mine = ROLE.on && ROLE.has(ln.who);
  return { id: ln.audio, text: ln.text, el, gap: 550, wait: mine ? 2500 : 0,
    before: () => { if (k === 0 && pn.video) playVideo(idx, true); panelReading(idx, true); if (!mine) talking(el?.querySelector('img'), true); if (ln.sfx && !mine) Sound.sfx(ln.sfx); },
    after: () => { panelReading(idx, false); talking(el?.querySelector('img'), false); if (ln.pop) { Sound.sfx('pop'); el?.classList.add('playing'); } } };
}
function wordCard(w, l, extra = '') {
  return `<div class="word-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${esc(w)}">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div>${extra}</div>`;
}

// ---------- 학생책 Lesson 1 ----------
// 소리: 글자 3개, 글자나무, 이름·소리·챈트
PAGES.sounds = (ctx) => {
  const cards = ctx.unit.letters.map((l) => {
    const d = L(l), cls = letterCls(l);
    return `<div class="sound-card" data-letter="${l}">
      <div class="glyph say ${cls}" data-say="name_${l}" data-text="${l.toUpperCase()}">${l.toUpperCase()}<small>${l}</small></div>
      <div class="tree say" data-say="sound_${l}" data-text="${esc(soundText(l))}">${pic('tree_' + l, '', l + ' tree')}</div>
      <div class="ctrl">
        <div class="row">${spk('name_' + l, l.toUpperCase())} Name <b>${l.toUpperCase()}</b></div>
        <div class="row">${spk('sound_' + l, soundText(l))} Sound <b class="ipa ${cls}">${esc(soundLabel(l))}</b></div>
        <div class="row print-hide"><button class="btn orange" onclick="chant('${l}')">♪ Chant</button></div>
        <div class="words">${d.words.map((w) => `<span class="w say" data-say="word_${esc(w)}" data-text="${esc(w)}">${wordHtml(w, l)}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
  return instr(1, App.book.instructions.listen_repeat, '글자 이름과 소리를 듣고 따라 말해요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center">${spk('', '', true).replace('data-say=""', 'onclick="playSoundsPage()" class="spk big main-play"')}<span>Listen to all</span></div>` +
    `<div class="sound-cards">${cards}</div>`;
};
async function chant(l) {
  const d = L(l), card = document.querySelector(`.sound-card[data-letter="${l}"]`);
  const s = { id: 'sound_' + l, text: soundText(l), el: card?.querySelector('.tree'), gap: 150 };
  Sound.unlock();
  const beat = await chantTrack('chant_beat');
  const ok = await playSeq([
    { id: 'name_' + l, text: l.toUpperCase(), el: card?.querySelector('.glyph') }, s, s, { ...s, gap: 400 },
    ...d.words.map((w) => ({ id: 'word_' + w, text: w, el: card?.querySelector(`.w[data-word="${w}"], .w[data-say="word_${w}"]`), gap: 300, before: () => Sound.sfx('pop') })),
  ].map((it) => ({ ...it, beat })));
  chantTrackOff(); return ok;
}
async function playSoundsPage() { for (const l of App.units[App.u].letters) { if (!(await chant(l) ?? true)) return; await sleep(500); } }
// 챈트 반주: web/assets/music/chant_beat.mp3 (소리 챈트·단어 챈트 공용, 100 BPM) 가 있으면 틀고 박자(1.2초)를 돌려준다. 없으면 0 (지금처럼 소리 길이대로)
const CHANT_BEAT = 1200;
let chantEl = null;
function chantTrack(id) {
  return new Promise((res) => {
    chantTrackOff();
    const a = new Audio(ASSETS + 'music/' + id + '.mp3'); a.loop = true; a.volume = 0.5;
    a.onerror = () => res(0);
    a.oncanplay = () => { if (chantEl !== a) return; a.play().then(() => res(CHANT_BEAT)).catch(() => res(0)); };
    chantEl = a; a.load();
    setTimeout(() => res(0), 2500);   // 파일이 늦으면 반주 없이 시작
  });
}
function chantTrackOff() { if (chantEl) { const a = chantEl; chantEl = null; rampVolume(a, 0, 400); setTimeout(() => a.pause(), 450); } }

// 쓰기: 획순 + 따라 쓰기 줄 + 큰·작은 글자 짝 찾기
PAGES.trace = (ctx) => {
  const rows = ctx.unit.letters.flatMap((l) => [l.toUpperCase(), l]).map((ch) => `
    <div class="trace-row">
      <div class="anim say" data-say="name_${ch.toLowerCase()}" data-text="${ch.toUpperCase()}" onclick="this.innerHTML=this.innerHTML">${strokeSvg(ch)}</div>
      <div class="trace-line"><span class="solid">${ch}</span><span>${ch}</span><span>${ch}</span><span>${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span><span class="box">${ch}</span></div>
    </div>`).join('');
  // 짝 찾기: 상자마다 글자 4개 중 대·소문자 짝 하나
  const others = 'defghijklmnopqrstuvwxyz'.split('').filter((x) => !ctx.unit.letters.includes(x));
  const boxes = ctx.unit.letters.map((l, i) => {
    const o1 = others[(i * 3) % others.length], o2 = others[(i * 3 + 1) % others.length];
    const set = shuffle([l.toUpperCase(), l, o1, o2.toUpperCase()], i + ctx.u);
    return `<div class="circle-box" data-pair="${l}">${set.map((ch) => `<span class="ltr" data-ch="${ch}" onclick="circlePick(this)">${ch}</span>`).join('')}</div>`;
  }).join('');
  return instr(1, App.book.instructions.trace_write, '획순을 보고 따라 써요 (번호 순서대로)') + `<div class="trace-rows">${rows}</div>` +
    instr(2, App.book.instructions.look_circle, '큰 글자와 작은 글자 짝을 찾아 동그라미') + `<div class="circle-grid">${boxes}</div>`;
};
function circlePick(el) {
  Sound.unlock();
  const box = el.closest('.circle-box'), l = box.dataset.pair, ch = el.dataset.ch;
  if (ch.toLowerCase() === l) { el.classList.add('ok'); Sound.sfx('ok'); } else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 600); }
}
function shuffle(a, seed) { const r = a.slice(); let s = seed * 9301 + 49297; for (let i = r.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

// 단어: 글자마다 단어 3개 (그림·단어), 단어 챈트
PAGES.words = (ctx) => {
  const rows = ctx.unit.letters.map((l) => `<div class="word-row"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}${l}</div>${L(l).words.map((w) => wordCard(w, l, '<span class="chk"></span>')).join('')}</div>`).join('');
  return instr(1, App.book.instructions.listen_repeat, '그림을 누르면 단어가 나와요. 듣고 따라 말한 뒤 네모에 표시') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="wordChant()">♪ ${esc(App.book.instructions.word_chant)}</button></div>` +
    `<div class="word-rows">${rows}</div>`;
};
async function wordChant() {
  Sound.unlock();
  const beat = await chantTrack('chant_beat'), items = [];
  for (const l of App.units[App.u].letters) {
    items.push({ id: 'sound_' + l, text: soundText(l), el: document.querySelector(`.word-row .ltr[data-say="sound_${l}"]`), gap: 250, beat });
    for (const w of L(l).words) items.push({ id: 'word_' + w, text: w, el: document.querySelector(`.word-card[data-word="${w}"]`), gap: 300, beat });
  }
  await playSeq(items); chantTrackOff();
}

// 따라 읽기 + 놀이 (소리 잡기)
PAGES.read_play = (ctx) => {
  const ws = unitWords(ctx.unit);
  const cards = ws.map((w) => `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="tr">${wordMark(w)}</div></div>`).join('');
  return instr(1, App.book.instructions.trace_read, '단어를 따라 쓰고 읽어요') + `<div class="read-rows ${ws.length > 9 ? 'c5' : ''}">${cards}</div>` +
    instr(2, App.book.instructions.lets_play, B2() ? '단어를 듣고 맞는 그림을 눌러요' : '소리를 듣고 그 소리로 시작하는 그림을 눌러요') + gameHtml(ctx);
};
// 소리 잡기 게임 판: 교재 쪽과 선생님 슬라이드가 같이 쓴다. 팀 A·B 점수판(현재 팀을 눌러 고르고, 정답이면 그 팀 +1)
function gameHtml(ctx, big) {
  const g = ctx.unit.game, first = (g?.rounds?.[0]?.pictures) || [];
  return `<div class="game" id="game"><div class="bar"><button class="btn orange ${big ? 'big' : ''} main-play" onclick="gameStart()">▶ ${esc(g?.title || 'Catch the sound!')}</button><span id="gameRound"></span><span class="stars" id="gameStars"></span>
      <span class="teams print-hide"><span class="team A ${G.team === 'A' ? 'on' : ''}" onclick="gameTeam('A')">A <b id="scoreA">${G.scores.A}</b></span><span class="team B ${G.team === 'B' ? 'on' : ''}" onclick="gameTeam('B')">B <b id="scoreB">${G.scores.B}</b></span><button class="btn small" onclick="gameClear()" title="점수 지우기">🗑</button></span></div>
     <div class="choices" id="gameChoices">${first.map((w) => `<div class="choice">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="msg" id="gameMsg"></div></div>`;
}
const G = { i: 0, score: 0, busy: false, rounds: null, team: 'A', scores: { A: 0, B: 0 }, last: '' };
function gameStart() { Sound.unlock(); G.i = 0; G.score = 0; G.rounds = App.units[App.u].game?.rounds || gameRandomRounds(); gameRound(); }
// 한 번 더: 유닛 글자·단어에서 무작위 5라운드 (바로 앞 라운드와 같은 조합은 피한다)
function gameRandomRounds(n = 5) {
  const ls = unitLetters(App.units[App.u]), out = [];
  let last = G.last;
  if (!ls.length) {   // 2권: 단어 하나 + 다른 단어 2개
    const ws = unitWords(App.units[App.u]);
    while (out.length < n) { const w = ws[Math.floor(Math.random() * ws.length)]; const others = ws.filter((x) => x !== w).sort(() => Math.random() - 0.5).slice(0, 2); const pictures = [w, ...others].sort(() => Math.random() - 0.5), key = w + ':' + pictures.slice().sort().join(','); if (key === last) continue; last = key; out.push({ word: w, pictures }); }
    G.last = last; return out;
  }
  while (out.length < n) {
    const a = ls[Math.floor(Math.random() * ls.length)];
    const mine = L(a).words[Math.floor(Math.random() * L(a).words.length)];
    const others = ls.filter((l) => l !== a).flatMap((l) => L(l).words).sort(() => Math.random() - 0.5).slice(0, 2);
    const pictures = [mine, ...others].sort(() => Math.random() - 0.5), key = a + ':' + pictures.slice().sort().join(',');
    if (key === last) continue;
    last = key; out.push({ audio: 'sound_' + a, answer: a, pictures });
  }
  G.last = last; return out;
}
function gameAgain() { Sound.unlock(); G.i = 0; G.score = 0; G.rounds = gameRandomRounds(); gameRound(); }
function gameTeam(t) { G.team = t; document.querySelectorAll('.game .team').forEach((el) => el.classList.toggle('on', el.classList.contains(t))); Sound.unlock(); Sound.sfx('tap'); }
function gameClear() { G.scores = { A: 0, B: 0 }; gameScoreDraw(); }
function gameScoreDraw() { const a = $('scoreA'), b = $('scoreB'); if (a) a.textContent = G.scores.A; if (b) b.textContent = G.scores.B; }
async function gameRound() {
  const rounds = G.rounds; if (!rounds) return;
  if (G.i >= rounds.length) {
    $('gameMsg').innerHTML = `${esc(App.book.instructions.great_job)} ${'⭐'.repeat(G.score)} <button class="btn small" onclick="gameAgain()">🔁 한 번 더</button>`;
    Sound.sfx('chime'); Sound.play('instr_great_job', App.book.instructions.great_job); return;
  }
  const r = rounds[G.i];
  $('gameRound').textContent = `${G.i + 1} / ${rounds.length}`; $('gameStars').textContent = '⭐'.repeat(G.score); $('gameMsg').textContent = '';
  $('gameChoices').innerHTML = r.pictures.map((w) => `<div class="choice" onclick="gamePick(this,'${w}')">${pic('word_' + w, '', w)}</div>`).join('');
  G.busy = false;
  await sleep(300); if (r.word) Sound.play('word_' + r.word, r.word); else Sound.play('sound_' + r.answer, soundText(r.answer));
}
async function gamePick(el, w) {
  if (G.busy || !G.rounds) return;
  const r = G.rounds[G.i];
  if (r.word ? w === r.word : letterOf(w) === r.answer) { G.busy = true; el.classList.add('ok'); Sound.sfx('ok'); G.score++; G.scores[G.team]++; gameScoreDraw(); await Sound.play('word_' + w, w); G.i++; await sleep(500); gameRound(); }
  else { el.classList.add('no'); Sound.sfx('no'); $('gameMsg').textContent = App.book.instructions.try_again; setTimeout(() => el.classList.remove('no'), 500); }
}

// ---------- 학생책 Lesson 2 ----------
// 듣고 가리키고 말하기 + 말하고 표시
// 2차시 첫 쪽: 1차시 단어 9개를 ① 듣고 가리키기 → ② 듣고 그림 찾기 놀이(🔀 Point!) → ③ 스스로 말하고 표시(점수 __/9)
function lpRows(ctx) {
  return ctx.unit.letters.map((l) => `<div class="lp-row" data-letter="${l}"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div>${L(l).words.map((w) => `<div class="cell say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${w}" onclick="lpTap(this)">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div><span class="chk" onclick="event.stopPropagation();this.classList.toggle('on');Sound.sfx('tap');lpCount()"></span></div>`).join('')}</div>`).join('');
}
function lpWords(ctx) { return ctx.unit.letters.flatMap((l) => L(l).words); }
function lpTools(ctx, big) {
  const b = big ? ' big' : '';
  return `<div class="print-hide lp-tools"><button class="btn orange main-play${b}" onclick="listenPointAll()">▶ Listen</button><button class="btn${b}" onclick="lpPointStart()">🔀 Point!</button><span class="lp-msg" id="lpMsg"></span><span class="lp-score" id="lpScore">I can say <b>0</b> / ${lpWords(ctx).length}</span></div>`;
}
PAGES.listen_point = (ctx) => {
  const rows = lpRows(ctx);
  return instr(1, App.book.instructions.listen_point, '▶ 듣고 글자·그림을 손가락으로 짚으며 따라 말해요') +
    lpTools(ctx) + `<div class="lp-table">${rows}</div>` +
    instr(2, 'Listen and point.', '🔀 Point! — 들리는 단어의 그림을 눌러요 (인쇄: 선생님이 말하는 단어를 짚어요)') +
    instr(3, App.book.instructions.say_check, '혼자 말할 수 있는 단어에 ✓ — I can say __ / 9');
};
// 🔀 Point! 놀이: 단어를 무작위로 하나 들려주고, 맞는 그림을 누르면 ✓ (9개 다 하면 끝)
const LP = { on: false, left: [], cur: '' };
function lpPointStart() {
  Sound.unlock(); stopSeq();
  LP.on = true; LP.left = shuffle([...document.querySelectorAll('.lp-row .cell')].map((c) => c.dataset.word), Date.now() % 1000);
  document.querySelectorAll('.lp-row .cell').forEach((c) => c.classList.remove('hit', 'miss'));
  lpNext();
}
function lpNext() {
  const m = $('lpMsg'); if (!m) return;
  if (!LP.left.length) { LP.on = false; m.textContent = 'Great job! 🎉'; Sound.sfx('chime'); return; }
  LP.cur = LP.left.shift(); m.textContent = `Point! (${9 - LP.left.length}/${document.querySelectorAll('.lp-row .cell').length})`;
  Sound.play('word_' + LP.cur, LP.cur);
}
function lpTap(cell) {
  if (!LP.on) return;   // 놀이 중이 아니면 data-say 로 단어만 들린다
  event.stopPropagation(); Sound.unlock();
  if (cell.dataset.word === LP.cur) { cell.classList.add('hit'); Sound.sfx('ok'); setTimeout(lpNext, 700); }
  else { cell.classList.add('miss'); Sound.sfx('no'); setTimeout(() => cell.classList.remove('miss'), 500); Sound.play('word_' + LP.cur, LP.cur); }
}
function lpCount() { const n = document.querySelectorAll('.lp-row .chk.on').length, el = document.querySelector('#lpScore b'); if (el) el.textContent = n; }
async function listenPointAll() {
  Sound.unlock(); const items = [];
  for (const l of App.units[App.u].letters) {
    const row = document.querySelector(`.lp-row[data-letter="${l}"]`);
    items.push({ id: 'name_' + l, text: l.toUpperCase(), el: row, gap: 200 }, { id: 'sound_' + l, text: soundText(l), el: row?.querySelector('.ltr'), gap: 300 });
    for (const w of L(l).words) items.push({ id: 'word_' + w, text: w, el: row?.querySelector(`.cell[data-word="${w}"]`), gap: 350 });
  }
  await playSeq(items);
}

// 스토리: 한 쪽에 그림 2칸 (half 1 = 1·2칸, half 2 = 3·4칸)
PAGES.story = (ctx) => {
  const half = ctx.page.half || 1, st = ctx.unit.story, sws = ctx.unit.sight_words || [];
  const panels = st.panels.slice((half - 1) * 2, half * 2);
  const sw = half === 1 && sws.length ? `<div class="sw"><b>${esc(App.book.instructions.sight_words)}</b>${sws.map((w) => `<span class="say" data-say="sw_${esc(w)}" data-text="${esc(w)}">${esc(w)}</span>`).join('')}</div>` : '';
  // 그 유닛의 스토리북이 있으면 작은 링크 (화면에만)
  const sbLink = half === 1 && ctx.unit.storybook?.pages?.length && !ctx.print ? `<a class="btn small sb-link print-hide" href="story.html?u=${ctx.u}&p=1${bkParam()}" target="_blank" title="스토리북 (전체화면 그림책)">📙</a>` : '';
  const html = panels.map((pn, i) => {
    const idx = (half - 1) * 2 + i;
    const bubbles = pn.lines.map((ln, k) => `<div class="bubble say ${k % 2 ? 'right' : ''}" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="${idx}" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}${lineKo(ln, ctx)}</span></div>`).join('');
    const find = findHtml(pn);
    const movie = ctx.print ? '' : movieBtn(idx, pn.video);
    return `<div class="pwrap"><div class="panel" data-panel="${idx}"><div class="scene">${pic(pn.id, '', 'scene')}</div><span class="no">${idx + 1}</span>${movie}<div class="bubbles">${bubbles}</div></div>${find}${koBox(pn, ctx)}</div>`;
  }).join('');
  return `<div class="story-top"><h3 style="margin:0;font-size:24px">📖 ${esc(st.title)}</h3><button class="btn orange main-play print-hide" onclick="storyPlay(${half})">▶ ${esc(App.book.instructions.listen_story)}</button>${sw}${roleBtn()}${ctx.print ? '' : koBtn(false, st)}${sbLink}</div>${half === 1 ? soFarHtml(ctx) : ''}<div class="panels">${html}</div>`;
};
async function storyPlay(half) {
  Sound.unlock();
  const st = App.units[App.u].story, items = half === 1 ? themeIntro(st) : [];
  if (!items.length) Sound.bgm(st.bgm);
  st.panels.slice((half - 1) * 2, half * 2).forEach((pn, i) => {
    const idx = (half - 1) * 2 + i;
    pn.lines.forEach((ln, k) => items.push(storyItem(ln, document.querySelector(`.bubble[data-panel="${idx}"][data-line="${k}"]`), pn, idx, k)));
  });
  await playSeq(items);
}
// 0유닛 이야기 앞에 주제가 한 번 (music/theme.mp3 가 있을 때만, 쪽을 연 뒤 처음 ▶ 에만). 끝나면 이야기 배경음악
let themeDone = false;
function themeIntro(st) {
  if (themeDone || App.u !== 0) return [];
  themeDone = true;
  return [{ music: 'theme', gap: 400, after: () => Sound.bgm(st.bgm) }];
}
// ---------- 장면 영상 · 움직이는 장면 ----------
// 영상은 지금 빠졌다: web/assets/video/<id>.mp4 가 있을 때만 ▶ movie 단추가 보인다(HEAD 로 한 번 확인). 없으면 장면 그림이
// 처음 나올 때 천천히 다가가고(켄 번스), 대사가 나오는 동안 살짝 더 다가갔다 돌아온다(.reading). 숨은 단어를 찾으면 반짝.
const VIDEO_HAS = {};
function videoExists(id) {
  if (!id || PRINT) return Promise.resolve(false);
  if (!(id in VIDEO_HAS)) VIDEO_HAS[id] = fetch(videoSrc(id), { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  return VIDEO_HAS[id];
}
function movieBtn(idx, id, cls = '') { return id ? `<button class="btn blue movie print-hide ${cls}" data-video="${esc(id)}" hidden onclick="playVideo(${idx})">▶ movie</button>` : ''; }
// 쪽·슬라이드를 그린 뒤 부른다: 영상 파일이 있는 ▶ movie 단추만 보이게
function pageReady(root) {
  (root || document).querySelectorAll('[data-video]').forEach(async (b) => { if (await videoExists(b.dataset.video)) b.hidden = false; });
  (root || document).querySelectorAll('[data-music]').forEach(async (b) => { if (await musicExists(b.dataset.music)) b.hidden = false; });   // 주제가 단추 등
}
const MUSIC_HAS = {};
function musicExists(id) { if (!(id in MUSIC_HAS)) MUSIC_HAS[id] = fetch(ASSETS + 'music/' + id + '.mp3', { method: 'HEAD' }).then((r) => r.ok).catch(() => false); return MUSIC_HAS[id]; }
function panelReading(idx, on) { document.querySelector(`.panel[data-panel="${idx}"]`)?.classList.toggle('reading', on); }
function findHtml(pn) { return pn.hidden?.length ? `<div class="find"><b>🔍 Find:</b>${pn.hidden.map((w) => `<span class="chip" data-say="word_${esc(w)}" data-text="${esc(w)}" onclick="findChip(this)">${esc(w)}</span>`).join('')}</div>` : ''; }
// 숨은 단어를 찾으면(칩 켜기) 그 칸 그림 위에 작은 반짝임
function findChip(el) {
  el.classList.toggle('on'); if (!el.classList.contains('on')) return;
  sparkle(el.closest('.pwrap, .sl-story')?.querySelector('.panel'));
}
function sparkle(box) {
  if (!box || PRINT || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const cx = 20 + Math.random() * 60, cy = 20 + Math.random() * 50;
  for (let i = 0; i < 7; i++) {
    const s = document.createElement('span'); s.className = 'sparkle'; s.textContent = i % 2 ? '✦' : '✧';
    s.style.left = (cx + (Math.random() - 0.5) * 22) + '%'; s.style.top = (cy + (Math.random() - 0.5) * 22) + '%'; s.style.animationDelay = (i * 70) + 'ms';
    box.appendChild(s); setTimeout(() => s.remove(), 1600);
  }
}
// 장면 영상이 있으면 그림 자리에 튼다 (없으면 조용히 넘어간다). 소리는 끈다 — 대사·음악과 겹치지 않게
async function playVideo(idx, quiet) {
  const panel = document.querySelector(`.panel[data-panel="${idx}"]`); if (!panel) return;
  const id = App.units[App.u].story.panels[idx].video; if (!id) return;
  if (!(await videoExists(id))) return;   // 영상 파일이 없으면 움직이는 장면 그림만
  let v = panel.querySelector('video');
  if (!v) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = videoSrc(id); v.onerror = () => { v.remove(); if (!quiet) toast('영상이 아직 없어요'); }; panel.appendChild(v); }
  v.currentTime = 0; v.play().catch(() => {});
}

// 유닛 정리: 듣고 동그라미 / 잇기 / 찾아 쓰기. 복습 평가(review_test)도 같은 모양(문항만 많다)
PAGES.check = (ctx) => (ctx.unit.check.read_circle ? checkBody2 : checkBody)(ctx, ctx.unit.check);
PAGES.review_test = (ctx) => (ctx.unit.review.test.read_circle ? checkBody2 : checkBody)(ctx, ctx.unit.review.test);
// 듣고 동그라미 한 줄 / 잇기 / 찾아 쓰기 조각 — 교재 쪽과 선생님 슬라이드가 같이 쓴다
function lcRow(it, i, big) { return `<span class="n">${i + 1}</span>${spk(it.audio, it.audio.startsWith('sound_') ? soundText(it.audio.slice(6)) : it.audio.replace(/^word_/, ''), big)}<div class="opts">${it.options.map((o) => o.length === 1 ? `<div class="opt ${letterCls(o)}" onclick="checkPick(this,'${o}','${it.answer}')">${o.toUpperCase()}${o}</div>` : `<div class="opt" onclick="checkPick(this,'${o}','${it.answer}')">${pic('word_' + o, '', o)}<div class="lab">${esc(o)}</div></div>`).join('')}</div>`; }
function matchHtml(c, cls = '') {
  const letters = c.match.map((m) => m.letter), words = shuffle(c.match.map((m) => m.word), 7);
  return `<div class="match ${cls}" id="match"><div class="col">${letters.map((l) => `<div class="it ${letterCls(l)}" data-l="${l}" onclick="matchPick(this)">${l.toUpperCase()}${l}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it wd" data-w="${w}" onclick="matchPick(this)">${esc(w)}</div>`).join('')}</div></div>`;
}
function writeItems(ctx, c) {
  return c.find_write.map((it) => {
    // 보기 글자: 정답 + 이 유닛(복습이면 복습 글자) 중 다른 글자 2개
    const others = shuffle(unitLetters(ctx.unit).filter((l) => l !== it.letter), it.word.length + 3).slice(0, 2);
    const opts = shuffle([it.letter, ...others], it.word.length);
    return `<div class="write-it">${pic('word_' + it.word, '', it.word)}<div class="lts">${opts.map((l) => `<span onclick="writePick(this,'${l}','${it.letter}')">${l}</span>`).join('')}</div><div class="box"></div><div class="wd">${esc(it.word)}</div></div>`;
  }).join('');
}
function checkBody(ctx, c) {
  const lc = c.listen_circle.map((it, i) => `<div class="lc-row">${lcRow(it, i)}</div>`).join('');
  return instr('A', App.book.instructions.listen_circle, '듣고 맞는 것에 동그라미') + `<div class="check-sec">${lc}</div>` +
    instr('B', App.book.instructions.match_read, '글자 → 그림 → 단어 순서로 눌러 이어요') + matchHtml(c) +
    instr('C', App.book.instructions.find_circle, '첫소리 글자를 찾아 누르고 써요') + `<div class="write-row">${writeItems(ctx, c)}</div>`;
}
function checkPick(el, o, ans) { Sound.unlock(); if (o === ans) { el.classList.add('ok'); Sound.sfx('ok'); } else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 600); } }
const M = { l: null };
function matchPick(el) {
  Sound.unlock();
  if (el.dataset.l) { document.querySelectorAll('#match .it.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); M.l = el.dataset.l; Sound.play('sound_' + M.l, soundText(M.l)); return; }
  if (!M.l) return;
  if (letterOf(el.dataset.w) === M.l) { el.classList.add('done'); Sound.sfx('ok'); Sound.play('word_' + el.dataset.w, el.dataset.w); } else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 500); }
}
function writePick(el, l, ans) { Sound.unlock(); if (l === ans) { el.classList.add('ok'); el.closest('.write-it').querySelector('.box').textContent = l.toUpperCase() + l; Sound.sfx('ok'); Sound.play('sound_' + l, soundText(l)); } else { Sound.sfx('no'); } }

// ---------- 워크북 ----------
PAGES.wb_trace = (ctx) => {
  const rows = ctx.unit.letters.flatMap((l) => [l.toUpperCase(), l]).map((ch) => `<div class="trace-line"><span class="solid">${ch}</span>${'<span>' + ch + '</span>'}${'<span class="box">' + ch + '</span>'.repeat(7)}</div>`).join('');
  const rows2 = ctx.unit.letters.map((l) => `<div class="trace-line"><span class="solid">${l.toUpperCase()}</span><span class="solid">${l}</span>${'<span class="box">' + l.toUpperCase() + '</span><span class="box">' + l + '</span>'.repeat(3)}</div>`).join('');
  return instr('A', App.book.instructions.trace_write, '큰 글자·작은 글자를 따라 쓰고 빈칸에 써요') + `<div class="trace-rows" style="gap:6px">${rows}</div>` +
    instr('', 'Write the pair.', '짝을 지어 써요') + `<div class="trace-rows" style="gap:6px">${rows2}</div>`;
};
PAGES.wb_letters = (ctx) => {
  const cs = ctx.unit.workbook_data.circle_same.map((r) => `<div class="row"><div class="tgt">${r.target}</div><div class="lts">${r.row.map((ch) => `<span onclick="wbCircle(this,'${ch}','${r.target}')">${ch}</span>`).join('')}</div></div>`).join('');
  const items = ctx.unit.letters.map((l) => L(l).words[1]);
  const mc = `<div class="match" id="match"><div class="col">${ctx.unit.letters.map((l) => `<div class="it ${letterCls(l)}" data-l="${l}" onclick="matchPick(this)">${l.toUpperCase()}${l}</div>`).join('')}</div><div class="col">${shuffle(items, 3).map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)">${pic('line_' + w, '', w)}</div>`).join('')}</div><div class="col">${shuffle(items, 3).map((w) => `<div class="it" style="font-size:22px">${esc(w)}</div>`).join('')}</div></div>`;
  return instr('B', 'Circle the same letter.', '같은 글자에 동그라미') + `<div class="wb-circle">${cs}</div>` +
    instr('C', 'Match and color.', '글자와 그림을 잇고 색칠해요') + mc;
};
function wbCircle(el, ch, t) { Sound.unlock(); if (ch === t) { el.classList.add('ok'); Sound.sfx('ok'); } else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 500); } }
PAGES.wb_words = (ctx) => {
  const words = ctx.unit.letters.flatMap((l) => L(l).words);
  const tr = words.slice(0, 6).map((w) => `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('line_' + w, '', w)}<div class="tr">${wordHtml(w, letterOf(w))}</div><div class="tr" style="color:transparent;border-top:0">${esc(w)}</div></div>`).join('');
  const col = words.slice(6).concat(words.slice(0, 3)).slice(0, 3).map((w) => `<div class="color-it say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('line_' + w, '', w)}<div class="wd">${wordHtml(w, letterOf(w))}</div></div>`).join('');
  return instr('D', 'Trace the words.', '단어를 따라 쓰고 빈 줄에 써요') + `<div class="read-rows">${tr}</div>` +
    instr('E', 'Color and say.', '색칠하고 말해요') + `<div class="color-grid">${col}</div>`;
};
PAGES.wb_read = (ctx) => {
  const lines = ctx.unit.story.panels.flatMap((p) => p.lines).filter((l) => l.who !== 'pip').slice(0, 4);   // 핍은 "Chirp?" 같은 소리만 내니 읽기 줄에서 뺀다
  const sents = lines.map((ln) => `<div class="sent">${spk(ln.audio, ln.text)}<span>${esc(ln.text)}</span><span class="cnt">${'<span onclick="this.classList.toggle(\'on\');Sound.sfx(\'tap\')"></span>'.repeat(3)}</span></div>`).join('');
  const sort = ctx.unit.workbook_data.sort, pool = shuffle(Object.values(sort).flat(), 5);
  const sortHtml = `<div class="sort"><div class="pool" id="sortPool" style="grid-column:1/-1">${pool.map((w) => `<span class="wd" onclick="sortPick(this)" data-w="${w}">${esc(w)}</span>`).join('')}</div>${Object.keys(sort).map((l) => `<div class="bin" data-l="${l}" onclick="sortDrop(this)"><h4 class="${letterCls(l)}">${l.toUpperCase()}${l}</h4><div class="in"></div></div>`).join('')}</div>`;
  const fs = ctx.unit.workbook_data.finish_story.map((it) => { const ch = shuffle([it.answer, ...pool.filter((w) => w !== it.answer).slice(0, 2)], it.answer.length); return `<div class="fill">${pic(it.picture.startsWith('scene') ? it.picture : 'word_' + it.picture, '', '')}<span>${esc(it.text).replace('___', '<span class="blank">&nbsp;</span>')}</span><span class="choices print-hide">${ch.map((w) => `<span onclick="fillPick(this,'${w}','${it.answer}')">${esc(w)}</span>`).join('')}</span></div>`; }).join('');
  return instr('F', App.book.instructions.read_three, 'QR을 찍어 듣고 세 번 읽어요') + `<div>${sents}</div>` +
    instr('G', 'Sort the words.', '단어를 눌러 글자 상자에 넣어요') + sortHtml +
    instr('H', 'Finish the story.', '빈칸에 맞는 단어를 골라요') + `<div style="display:flex;flex-direction:column;gap:6px">${fs}</div>`;
};
const S = { sel: null };
function sortPick(el) { Sound.unlock(); document.querySelectorAll('.sort .wd.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); S.sel = el; Sound.play('word_' + el.dataset.w, el.dataset.w); }
function sortDrop(bin) { if (!S.sel) return; const w = S.sel.dataset.w; if (bin.dataset.ws ? bin.dataset.ws.split(' ').includes(w) : (B2() ? familyOf(w) : letterOf(w)) === bin.dataset.l) { S.sel.classList.remove('sel'); S.sel.classList.add('ok'); bin.querySelector('.in').appendChild(S.sel); S.sel = null; Sound.sfx('ok'); } else Sound.sfx('no'); }
function fillPick(el, w, ans) { Sound.unlock(); if (w === ans) { el.classList.add('ok'); el.closest('.fill').querySelector('.blank').textContent = w; Sound.sfx('ok'); Sound.play('word_' + w, w); } else Sound.sfx('no'); }

// ---------- 0유닛 ----------
PAGES.characters = (ctx) => {
  const cs = Object.entries(App.book.characters).map(([id, c]) => `<div class="char">${pic('char_' + id + '_ref', '', c.name)}<h3 style="color:${c.color}">${esc(c.name)} <span class="ko">${esc(c.ko)}</span></h3><div class="say-line say" ${catchAttrs(id)} data-text="${esc(c.catchphrase.replace(/[()]/g, ''))}">${esc(c.catchphrase)}</div>${c.role_ko ? `<div class="role">${esc(c.role_ko)}</div>` : `<div class="ko">${esc(c.personality)}</div>`}</div>`).join('');
  return instr('', 'Meet the friends!', '친구들을 만나요') + `<div class="chars n${Object.keys(App.book.characters).length}">${cs}</div>`;
};
PAGES.intro_story = (ctx) => PAGES.story({ ...ctx, page: { ...ctx.page, half: 1 } });
PAGES.alphabet = (ctx) => {
  const lts = Object.keys(App.book.letters).map((l) => `<div class="lt say ${letterCls(l)}" data-say="name_${l}" data-text="${l.toUpperCase()}" data-l="${l}">${l.toUpperCase()}<small>${l}</small></div>`).join('');
  return instr('', 'The Alphabet Song', '알파벳 노래를 듣고 따라 불러요') + `<div class="print-hide" style="display:flex;gap:10px"><button class="btn orange main-play" onclick="abcSong()">♪ ABC Song</button><button class="btn" onclick="abcSong(true)">A–Z names</button></div><div class="abc">${lts}</div>`;
};
async function abcSong(namesOnly) {
  Sound.unlock();
  if (!namesOnly) { stopSeq(); if (await Sound.music('abc_song')) return; }   // 알파벳 노래(music/abc_song.mp3)가 있으면 그것, 없으면 글자 이름을 차례로
  await playSeq(Object.keys(App.book.letters).map((l) => ({ id: 'name_' + l, text: l.toUpperCase(), el: document.querySelector(`.abc .lt[data-l="${l}"]`), gap: 120 })));
}
PAGES.alphabet_path = (ctx) => {
  // 색종이를 찢어 붙인 듯한 글자 타일 (대문자 A→Z, 소문자 a→z 두 판). 순서대로 누르면 불이 들어온다. 인쇄는 선으로 잇기
  const ls = Object.keys(App.book.letters);
  const board = (letters, upper, seed, id) => `<div class="path paper" id="${id}" data-next="0">${shuffle(letters, seed).map((l) => `<div class="lt" data-l="${l}" onclick="pathPick(this)"><span>${upper ? l.toUpperCase() : l}</span></div>`).join('')}</div>`;
  return instr(1, 'Follow A to Z.', 'A부터 Z까지 순서대로 눌러요 (인쇄: 선으로 이어요)') + board(ls, true, 11, 'path') +
    instr(2, 'Follow a to z.', 'a부터 z까지 순서대로 눌러요') + board(ls, false, 29, 'path2');
};
let pathNext = 0;   // (옛 판: 판에 data-next 가 없을 때만 쓴다)
function pathPick(el) {
  Sound.unlock(); const ls = Object.keys(App.book.letters), grid = el.parentElement, own = grid && grid.dataset.next !== undefined;
  const i = own ? +grid.dataset.next : pathNext;
  if (el.dataset.l === ls[i]) {
    el.classList.add('done'); el.dataset.n = i + 1; Sound.play('name_' + el.dataset.l, el.dataset.l.toUpperCase());
    const nx = i + 1 === ls.length ? 0 : i + 1;
    if (nx === 0) Sound.sfx('chime');
    if (own) grid.dataset.next = nx; else pathNext = nx;
  } else Sound.sfx('no');
}

// ---------- 10유닛: 알파벳 전체 복습 ----------
// A~Z 26칸(누르면 소리, 이름은 A–Z names 단추), 26개 소리 순서 재생, 섞인 칸을 A→Z 순서대로 누르기
PAGES.alphabet_review = (ctx) => {
  pathNext = 0;
  return instr(1, 'Say all 26 sounds.', '글자를 누르면 소리가 나요. ▶ 로 26개 소리를 순서대로 말해요') +
    `<div class="print-hide" style="display:flex;gap:10px"><button class="btn orange main-play" onclick="abcSounds()">▶ 26 sounds</button><button class="btn" onclick="abcSong(true)">A–Z names</button></div><div class="abc abc26">${abc26Grid()}</div>` +
    instr(2, 'Follow A to Z.', 'A부터 Z까지 순서대로 눌러요') + `<div class="path path26" id="path">${path26Cells(ctx)}</div>`;
};
function abc26Grid() { return Object.keys(App.book.letters).map((l) => `<div class="lt say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}" data-l="${l}">${l.toUpperCase()}<small>${l}</small><i>${esc(soundLabel(l))}</i></div>`).join(''); }
function path26Cells(ctx) { return shuffle(Object.keys(App.book.letters), 23 + ctx.u).map((l) => `<div class="lt" data-l="${l}" onclick="pathPick(this)">${l.toUpperCase()}</div>`).join(''); }
async function abcSounds() {
  Sound.unlock();
  await playSeq(Object.keys(App.book.letters).map((l) => ({ id: 'sound_' + l, text: soundText(l), el: document.querySelector(`.abc26 .lt[data-l="${l}"]`), gap: 160 })));
}

// ---------- 복습 유닛 (5·11) ----------
// 소리 복습: 복습 글자 전부를 카드로 (글자 = 이름, 🔊 이름 · 🔊 소리 단추, 대표 단어 그림)
PAGES.review_sounds = (ctx) => {
  const ls = unitLetters(ctx.unit);
  const cols = ls.length <= 12 ? 4 : 5;   // 글자가 많으면 5열로 촘촘히
  return instr(1, App.book.instructions.listen_repeat, '글자를 누르면 이름, 🔊 를 누르면 소리가 나요. 따라 말해요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="reviewSoundsAll()">▶ Listen to all</button></div>` +
    `<div class="rv-cards c${cols}" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${ls.map((l) => reviewCard(l)).join('')}</div>`;
};
function reviewCard(l) {
  const cls = letterCls(l), w = L(l).words[0];
  return `<div class="rv-card" data-letter="${l}">
    <div class="glyph say ${cls}" data-say="name_${l}" data-text="${l.toUpperCase()}">${l.toUpperCase()}<small>${l}</small></div>
    <div class="rv-pic say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}</div>
    <div class="rv-word">${wordHtml(w, l)} <span class="ipa ${cls}">${esc(soundLabel(l))}</span></div>
    <div class="rv-btns print-hide"><button class="pill" data-say="name_${l}" data-text="${l.toUpperCase()}" title="이름">🔊 ${l.toUpperCase()}</button><button class="pill" data-say="sound_${l}" data-text="${esc(soundText(l))}" title="소리">🔊 ${esc(soundLabel(l))}</button></div>
  </div>`;
}
async function reviewSoundsAll() {   // 화면에 있는 카드만 (슬라이드는 6개씩)
  Sound.unlock(); const items = [];
  for (const card of document.querySelectorAll('.rv-card')) {
    const l = card.dataset.letter, w = L(l).words[0];
    items.push({ id: 'name_' + l, text: l.toUpperCase(), el: card?.querySelector('.glyph'), gap: 200 }, { id: 'sound_' + l, text: soundText(l), el: card?.querySelector('.glyph'), gap: 250 }, { id: 'word_' + w, text: w, el: card?.querySelector('.rv-pic'), gap: 450 });
  }
  await playSeq(items);
}

// 주사위 놀이판: 20칸을 뱀 모양 길(5칸 × 4줄, 줄마다 방향 반대)로. 말 2개(A·B 팀), 🎲 1~6.
// 특수칸: pop = 한 칸 더, back = 한 칸 뒤로, again = 다시 굴리기. 말 위치는 이 기기에 기억(localStorage).
const BOARD_COLS = 5;
const BD_SPECIAL = { pop: ['⭐', 'One more!'], back: ['↩', 'Go back!'], again: ['🔁', 'Again!'] };
const BD = { pos: { A: -1, B: -1 }, turn: 'A', busy: false };
PAGES.review_board = (ctx) => instr(1, 'Roll and say.', '주사위를 굴려 말을 옮기고 도착한 칸을 말해요 (⭐ 한 칸 더 · ↩ 뒤로 · 🔁 다시)') + boardHtml(ctx) +
  `<div class="screen-hide" style="color:var(--soft);font-size:14px">🎲 주사위와 지우개·동전 같은 말 2개를 준비해요. 칸에 도착하면 그 글자의 소리나 단어를 말해요.</div>`;
function boardHtml(ctx) {
  const sq = ctx.unit.review.board.squares;
  if (!ctx.print) boardLoad();
  const cells = sq.map((s, i) => {
    const row = Math.floor(i / BOARD_COLS), col = row % 2 ? BOARD_COLS - 1 - (i % BOARD_COLS) : i % BOARD_COLS;
    let inner, cls = '';
    if (s.word) inner = `${pic('word_' + s.word, '', s.word)}<span class="lab">${esc(s.word)}</span>`;
    else if (s.letter) { cls = 'letter ' + letterCls(s.letter); inner = `<span class="big">${s.letter.toUpperCase()}${s.letter}</span>`; }
    else if (s.family) { cls = 'letter ' + famCls(s.family, ctx.unit); inner = `<span class="big fam-big">${famHtml(s.family)}</span>`; }
    else { cls = 'special ' + esc(s.special); const sp = BD_SPECIAL[s.special] || ['?', s.special]; inner = `<span class="big">${sp[0]}</span><span class="lab">${esc(sp[1])}</span>`; }
    const tag = i === 0 ? '<span class="tag">START</span>' : i === sq.length - 1 ? '<span class="tag fin">FINISH</span>' : '';
    const pawns = ctx.print ? '' : ['A', 'B'].filter((t) => BD.pos[t] === i).map((t) => `<span class="pawn ${t}">${t}</span>`).join('');
    return `<div class="bd-cell ${cls}" data-i="${i}" style="grid-row:${row + 1};grid-column:${col + 1}"><span class="no">${i + 1}</span>${tag}${inner}<span class="pawns">${pawns}</span></div>`;
  }).join('');
  const bar = ctx.print ? '' : `<div class="bd-bar print-hide"><button class="btn orange main-play" id="diceBtn" onclick="diceRoll()">🎲 Roll</button><span class="dice" id="dice">?</span>
    <span class="team A ${BD.turn === 'A' ? 'on' : ''} ${BD.pos.A < 0 ? 'home' : ''}" id="teamA" onclick="boardTurn('A')">A</span><span class="team B ${BD.turn === 'B' ? 'on' : ''} ${BD.pos.B < 0 ? 'home' : ''}" id="teamB" onclick="boardTurn('B')">B</span>
    <span class="msg" id="bdMsg"></span><button class="btn small" onclick="boardReset()" title="처음부터">↺</button></div>`;
  return bar + `<div class="board" id="board" style="grid-template-columns:repeat(${BOARD_COLS},1fr)">${cells}</div>`;
}
function boardKey() { return 'pp_board_u' + App.u; }
function boardLoad() { BD.pos = { A: -1, B: -1 }; BD.turn = 'A'; BD.busy = false; try { const d = JSON.parse(localStorage.getItem(boardKey()) || 'null'); if (d) { BD.pos = d.pos; BD.turn = d.turn; } } catch (e) { /* 무시 */ } }
function bdSave() { try { localStorage.setItem(boardKey(), JSON.stringify({ pos: BD.pos, turn: BD.turn })); } catch (e) { /* 저장 못 해도 동작 */ } }
function boardDraw() {
  document.querySelectorAll('.bd-cell .pawns').forEach((p) => { p.innerHTML = ''; });
  for (const t of ['A', 'B']) {
    const c = document.querySelector(`.bd-cell[data-i="${BD.pos[t]}"] .pawns`); if (c) c.insertAdjacentHTML('beforeend', `<span class="pawn ${t}">${t}</span>`);
    const b = $('team' + t); if (b) { b.classList.toggle('on', BD.turn === t); b.classList.toggle('home', BD.pos[t] < 0); }
  }
}
function boardTurn(t) { if (BD.busy) return; BD.turn = t; bdSave(); boardDraw(); }
function boardReset() { if (BD.busy) return; BD.pos = { A: -1, B: -1 }; BD.turn = 'A'; bdSave(); boardDraw(); const m = $('bdMsg'), d = $('dice'); if (m) m.textContent = ''; if (d) d.textContent = '?'; }
async function diceRoll() {
  if (BD.busy) return; BD.busy = true; Sound.unlock(); stopSeq();
  const d = $('dice'); d.classList.add('rolling'); $('bdMsg').textContent = '';
  for (let i = 0; i < 10; i++) { d.textContent = 1 + Math.floor(Math.random() * 6); Sound.sfx('tap'); await sleep(80); }
  const n = 1 + Math.floor(Math.random() * 6); d.textContent = n; d.classList.remove('rolling'); Sound.sfx('pop');
  await sleep(400);
  const t = BD.turn;
  await boardStep(t, 1, n);
  const again = await boardLand(t);
  if (!again) BD.turn = t === 'A' ? 'B' : 'A';
  bdSave(); boardDraw(); BD.busy = false;
}
// 한 칸씩 움직인다 (마지막 칸을 넘지 않는다)
async function boardStep(t, dir, count) {
  const last = App.units[App.u].review.board.squares.length - 1;
  for (let i = 0; i < count; i++) { BD.pos[t] = Math.max(0, Math.min(last, BD.pos[t] + dir)); boardDraw(); Sound.sfx('tap'); await sleep(230); if (BD.pos[t] === last && dir > 0) break; }
}
// 도착한 칸: 소리 내고, 특수칸이면 더 움직인다. 다시 굴리기면 true
async function boardLand(t, depth = 0) {
  const sq = App.units[App.u].review.board.squares, i = BD.pos[t], s = sq[i], cell = document.querySelector(`.bd-cell[data-i="${i}"]`);
  cell?.classList.add('hl'); setTimeout(() => cell?.classList.remove('hl'), 1500);
  if (i === sq.length - 1) { $('bdMsg').textContent = `Team ${t} 🏁 ${App.book.instructions.great_job}`; Sound.sfx('chime'); await Sound.play('instr_great_job', App.book.instructions.great_job); return false; }
  if (s.word) { await Sound.play('word_' + s.word, s.word); return false; }
  if (s.letter) { await Sound.play('name_' + s.letter, s.letter.toUpperCase()); await sleep(150); await Sound.play('sound_' + s.letter, soundText(s.letter)); return false; }
  if (s.family) { const w = famWords(s.family)[Math.floor(Math.random() * Math.max(1, famWords(s.family).length))] || s.family; await Sound.play('word_' + w, w); return false; }
  const sp = BD_SPECIAL[s.special]; if (!sp) return false;
  $('bdMsg').textContent = sp[0] + ' ' + sp[1];
  if (s.special === 'again') { Sound.sfx('chime'); return true; }
  if (depth >= 3) return false;   // 특수칸이 이어져도 무한히 돌지 않게
  Sound.sfx(s.special === 'pop' ? 'pop' : 'no'); await sleep(600);
  await boardStep(t, s.special === 'pop' ? 1 : -1, 1);
  return boardLand(t, depth + 1);
}

// 빙고 4×4: 단어 그림 16. "소리 부르기"가 아직 안 부른 단어를 무작위로 읽고, 누르면 표시, 한 줄이 되면 효과음.
// 인쇄판은 빈 칸(아이가 단어를 써 넣는다) + 단어 목록.
const BG = { called: [], lines: [] };
PAGES.review_bingo = (ctx) => {
  if (ctx.print) {
    const words = ctx.unit.review.bingo.words.slice(0, 16);
    return instr(1, 'Write and play Bingo!', '단어 16개를 빈 칸에 마음대로 써 넣고, 선생님이 부르는 단어에 동그라미') +
      `<div class="bg-bank">${words.map((w) => `<span>${esc(w)}</span>`).join('')}</div><div class="bingo blank">${words.map(() => '<div class="bg-cell"></div>').join('')}</div>`;
  }
  return instr(1, 'Bingo!', '🔊 를 누르면 단어가 나와요. 그 그림을 눌러 표시하고, 한 줄이 되면 빙고!') + bingoHtml(ctx);
};
function bingoHtml(ctx) {
  const words = ctx.unit.review.bingo.words.slice(0, 16);
  BG.called = []; BG.lines = [];
  const cells = words.map((w, i) => `<div class="bg-cell" data-w="${esc(w)}" data-i="${i}" onclick="bingoMark(this)">${pic('word_' + w, '', w)}<span class="lab">${esc(w)}</span></div>`).join('');
  return `<div class="bg-bar print-hide"><button class="btn orange main-play" onclick="bingoCall()">🔊 Call a word</button><span class="called" id="bgCalled"></span><button class="btn small" onclick="bingoReset()" title="처음부터">↺</button></div>` +
    `<div class="bingo" id="bingo">${cells}</div>`;
}
async function bingoCall() {
  Sound.unlock(); stopSeq();
  const words = App.units[App.u].review.bingo.words.slice(0, 16), left = words.filter((w) => !BG.called.includes(w));
  if (!left.length) { toast('단어를 다 불렀어요'); return; }
  const w = left[Math.floor(Math.random() * left.length)];
  BG.called.push(w);
  $('bgCalled').innerHTML = BG.called.map((x) => `<span class="say" data-say="word_${esc(x)}" data-text="${esc(x)}">${esc(x)}</span>`).join('');
  await Sound.play('word_' + w, w);
}
function bingoMark(el) {
  Sound.unlock(); el.classList.toggle('on'); Sound.sfx('tap');
  const on = [...document.querySelectorAll('#bingo .bg-cell')].map((c) => c.classList.contains('on'));
  const lines = [];
  for (let r = 0; r < 4; r++) { lines.push([0, 1, 2, 3].map((c) => r * 4 + c)); lines.push([0, 1, 2, 3].map((c) => c * 4 + r)); }
  lines.push([0, 5, 10, 15], [3, 6, 9, 12]);
  lines.forEach((ln, k) => {
    const full = ln.every((i) => on[i]);
    if (full && !BG.lines.includes(k)) { BG.lines.push(k); ln.forEach((i) => document.querySelector(`#bingo .bg-cell[data-i="${i}"]`)?.classList.add('line')); Sound.sfx('chime'); toast('BINGO! 🎉'); Sound.play('instr_great_job', App.book.instructions.great_job); }
    if (!full && BG.lines.includes(k)) { BG.lines = BG.lines.filter((x) => x !== k); ln.forEach((i) => { const c = document.querySelector(`#bingo .bg-cell[data-i="${i}"]`); if (c && !BG.lines.some((j) => lines[j].includes(i))) c.classList.remove('line'); }); }
  });
}
function bingoReset() { BG.called = []; BG.lines = []; document.querySelectorAll('#bingo .bg-cell').forEach((c) => c.classList.remove('on', 'line')); const el = $('bgCalled'); if (el) el.innerHTML = ''; }

// 복습 워크북 1: 대·소문자 짝 잇기(두 묶음) + 빠진 글자 쓰기
PAGES.wb_review_letters = (ctx) => {
  const ls = unitLetters(ctx.unit), nb = ls.length > 14 ? 3 : 2, per = Math.ceil(ls.length / nb);   // 글자가 많으면(26) 3묶음
  const block = (part, seed) => `<div class="pair"><div class="col">${part.map((l) => `<div class="it ${letterCls(l)}" data-u="${l}" onclick="pairPick(this)">${l.toUpperCase()}</div>`).join('')}</div><div class="col">${shuffle(part, seed).map((l) => `<div class="it" data-l="${l}" onclick="pairPick(this)">${l}</div>`).join('')}</div></div>`;
  // 빠진 글자 줄: 큰 글자 한 줄, 작은 글자 한 줄 (빈 칸 자리는 서로 다르게)
  const line = (up, k) => ls.map((l, i) => { const ch = up ? l.toUpperCase() : l; return i % 3 === k ? `<span class="bx blank" onclick="this.textContent='${ch}';Sound.unlock();Sound.play('name_${l}','${l.toUpperCase()}')"></span>` : `<span class="bx">${ch}</span>`; }).join('');
  return instr('A', 'Match the big and small letters.', '큰 글자와 작은 글자를 눌러 이어요') + `<div class="pairs n${nb}">${Array.from({ length: nb }, (_, k) => block(ls.slice(k * per, (k + 1) * per), 3 + k * 2 + ctx.u)).join('')}</div>` +
    instr('B', 'Write the missing letters.', '빠진 글자를 써요 (화면에서는 빈 칸을 누르면 글자가 나와요)') + `<div class="missing ${ls.length > 14 ? 'many' : ''}">${line(true, 2)}</div><div class="missing ${ls.length > 14 ? 'many' : ''}">${line(false, 1)}</div>`;
};
const PR = { sel: null };
function pairPick(el) {
  Sound.unlock();
  if (el.dataset.u) { el.closest('.pair').querySelectorAll('.it.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); PR.sel = el; Sound.play('name_' + el.dataset.u, el.dataset.u.toUpperCase()); return; }
  if (!PR.sel || PR.sel.closest('.pair') !== el.closest('.pair')) return;
  if (el.dataset.l === PR.sel.dataset.u) { el.classList.add('done'); PR.sel.classList.remove('sel'); PR.sel.classList.add('done'); PR.sel = null; Sound.sfx('ok'); Sound.play('sound_' + el.dataset.l, soundText(el.dataset.l)); }
  else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 500); }
}
// 복습 워크북 2: 그림 보고 첫 글자 쓰기 8개 + 단어 분류
// 데이터: review.first_letter(단어 8개, 없으면 bingo 앞 8개) · review.sort({글자: [단어...]}, 없으면 복습 글자 앞 3개의 단어 2개씩)
PAGES.wb_review_words = (ctx) => {
  const rv = ctx.unit.review, ls = unitLetters(ctx.unit);
  if (B2()) {   // 2권: 그림 보고 단어 쓰기 8 + 가족 분류
    const ws = (rv.first_letter || rv.words || []).slice(0, 8);
    const sort = rv.sort || Object.fromEntries(unitFamilies(ctx.unit).slice(0, 4).map((f) => [f, famWords(f).slice(0, 2)]));
    const pool = shuffle(Object.values(sort).flat(), 5 + ctx.u);
    return instr('C', 'Look and write.', '그림을 보고 단어를 써요 (화면에서는 빈 칸을 누르면 단어가 나와요)') + `<div class="write-row w2 g4">${ws.map((w) => `<div class="write-it w2">${pic('word_' + w, '', w)}<div class="w4 click" onclick="this.innerHTML='<span class=ans>${esc(w)}</span>';Sound.unlock();Sound.play('word_${esc(w)}','${esc(w)}')"></div></div>`).join('')}</div>` +
      instr('D', 'Sort the words.', '단어를 눌러 가족 상자에 넣어요') + famSortHtml(sort, pool, ctx.unit);
  }
  const words = (rv.first_letter || rv.bingo.words).slice(0, 8);
  const fl = words.map((w) => { const l = letterOf(w); return `<div class="write-it fl">${pic('word_' + w, '', w)}<div class="box" onclick="this.textContent='${l.toUpperCase()}${l}';Sound.unlock();Sound.play('sound_${l}','${esc(soundText(l))}')"></div><div class="wd">_${esc(w.slice(1))}</div></div>`; }).join('');
  const sort = rv.sort || Object.fromEntries(ls.slice(0, 3).map((l) => [l, L(l).words.slice(0, 2)]));
  const pool = shuffle(Object.values(sort).flat(), 5 + ctx.u);
  const sortHtml = `<div class="sort rv"><div class="pool" id="sortPool" style="grid-column:1/-1">${pool.map((w) => `<span class="wd" onclick="sortPick(this)" data-w="${esc(w)}">${esc(w)}</span>`).join('')}</div>${Object.keys(sort).map((l) => `<div class="bin" data-l="${l}" onclick="sortDrop(this)"><h4 class="${letterCls(l)}">${l.toUpperCase()}${l}</h4><div class="in"></div></div>`).join('')}</div>`;
  return instr('C', 'Write the first letter.', '그림을 보고 첫 글자를 써요 (화면에서는 빈 칸을 누르면 글자가 나와요)') + `<div class="write-row fl-row">${fl}</div>` +
    instr('D', 'Sort the words.', '단어를 눌러 글자 상자에 넣어요') + sortHtml;
};

// ---------- 12유닛: The Alphabet Show ----------
// 데이터: unit.show = { song: {title, bgm, lines: [{text, audio}] — 앞 26줄은 a~z 순서}, hunt: {rounds: [{letter, scene, words}]},
//                    recap: [{unit, scene, line: {who, text, audio}}], certificate: {title, text, text_ko} }
// 가사 한 줄의 마지막 낱말이 단어 목록에 있으면 그 그림을 작게 보여 준다 ("A, a, /æ/, apple!" → apple)
function songWord(text) { const w = (text.match(/[a-z-]+(?=[!?.]*\s*$)/i) || [''])[0].toLowerCase(); return App.book.words[w] ? w : ''; }
function songLines(unit, big) {
  const az = Object.keys(App.book.letters);
  return unit.show.song.lines.map((ln, i) => {
    const l = ln.letter || (!ln.family && !B2() ? az[i] : null), w = ln.word || songWord(ln.text);
    const tile = ln.family ? `<span class="lt ${famCls(ln.family, unit)} famt">${famHtml(ln.family)}</span>` : l ? `<span class="lt ${letterCls(l)}" data-l="${l}">${l.toUpperCase()}<small>${l}</small></span>` : '<span class="lt note">♪</span>';
    return `<div class="song-line say" data-i="${i}" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}">${tile}<span class="txt">${esc(ln.text)}</span>${w ? pic('word_' + w, 'sw', w) : ''}</div>`;
  }).join('');
}
PAGES.alphabet_song = (ctx) => {
  const sg = ctx.unit.show.song;
  return instr(1, `♪ ${sg.title}`, '글자 카드와 가사를 보며 노래해요. 줄을 누르면 그 줄만 나와요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="songPlay()">▶ Sing!</button><button class="btn small" onclick="stopSeq();chantTrackOff()">⏹</button></div>` +
    `<div class="song ${B2() ? 'words' : 'abc'}">${songLines(ctx.unit)}</div>`;   // abc = 알파벳 노래(26줄 뒤 마무리 줄은 가운데)
};
// 전체 부르기: 반주(music/<bgm>.mp3, 없으면 song_backing)가 있으면 그 위에 줄마다 소리, 없으면 1.2초 박자로 이어 붙인다. 줄과 글자 카드에 차례로 불
async function songPlay() {
  Sound.unlock(); stopSeq();
  const sg = App.units[App.u].show.song, beat = await chantTrack(sg.bgm || 'song_backing');
  const items = sg.lines.map((ln, i) => { const el = document.querySelector(`.song-line[data-i="${i}"]`); return { id: ln.audio, text: ln.text, el, gap: 300, beat: beat ? 0 : CHANT_BEAT, before: () => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }; });
  await playSeq(items); chantTrackOff();
}

// 단어 사냥: 라운드마다 장면 그림 + "Find the b things!" + 단어 단추(정답 + 다른 글자 단어 3개). 다 찾으면 다음 라운드, 점수는 ⭐
const HUNT = { i: 0, found: 0, score: 0 };
function huntButtons(ctx, r, seed) {
  const others = shuffle(unitWords(ctx.unit).filter((w) => !r.words.includes(w) && (r.letter ? letterOf(w) !== r.letter : familyOf(w) !== r.family)), seed).slice(0, 3);
  return shuffle(r.words.concat(others), seed + 7).map((w) => `<button class="hunt-w ${r.letter ? letterCls(letterOf(w)) : ''}" data-w="${esc(w)}" onclick="huntPick(this)">${esc(w)}</button>`).join('');
}
function huntSound(r) { return r.letter ? letterSound(r.letter) : famSound(r.family); }   // 라운드의 소리 (글자 또는 가족)
function huntRoundHtml(ctx, i) {
  const r = ctx.unit.show.hunt.rounds[i];
  return `<div class="hunt-scene">${pic(r.scene, '', 'scene')}</div>
    <div class="hunt-side"><div class="hunt-q say" data-say="${esc(huntSound(r).id)}" data-text="${esc(huntSound(r).text)}">Find the ${r.letter ? `<b class="${letterCls(r.letter)}">${r.letter}</b> things` : `<b class="fam-big ${famCls(r.family, ctx.unit)}">${famHtml(r.family)}</b> words`}!</div><div class="hunt-ws">${huntButtons(ctx, r, i + 11)}</div></div>`;
}
PAGES.word_hunt = (ctx) => {
  const rounds = ctx.unit.show.hunt.rounds;
  if (ctx.print) {   // 인쇄: 라운드 전부(장면 + 찾을 단어 ☐)
    return instr(1, 'Find the things.', '장면에서 그 글자로 시작하는 것을 찾아 ☐ 에 표시해요') +
      `<div class="hunt-print">${rounds.map((r, i) => `<div class="hp"><div class="hp-scene">${pic(r.scene, '', 'scene')}</div><div class="hp-side"><b>${i + 1}. Find the <span class="${r.letter ? letterCls(r.letter) : 'fam-big ' + famCls(r.family)}">${r.letter || famHtml(r.family)}</span> ${r.letter ? 'things' : 'words'}!</b>${r.words.map((w) => `<span class="hp-w">☐ ${esc(w)}</span>`).join('')}</div></div>`).join('')}</div>`;
  }
  HUNT.i = 0; HUNT.found = 0; HUNT.score = 0;
  return instr(1, 'Word hunt!', B2() ? '소리를 듣고, 장면에서 그 가족 단어를 찾아 눌러요' : '글자 소리를 듣고, 장면에서 그 소리로 시작하는 것을 찾아 단어를 눌러요') +
    `<div class="hunt-bar print-hide"><button class="btn orange main-play" onclick="huntStart()">▶ Start</button><span class="round" id="huntRound">1 / ${rounds.length}</span><span class="stars" id="huntStars"></span><span class="msg" id="huntMsg"></span></div>` +
    `<div class="hunt" id="hunt">${huntRoundHtml(ctx, 0)}</div>`;
};
function huntStart() { Sound.unlock(); HUNT.i = 0; HUNT.found = 0; HUNT.score = 0; huntRound(); }
async function huntRound() {
  const unit = App.units[App.u], rounds = unit.show.hunt.rounds;
  if (HUNT.i >= rounds.length) { $('huntMsg').textContent = App.book.instructions.great_job; Sound.sfx('chime'); Sound.play('instr_great_job', App.book.instructions.great_job); return; }
  const r = rounds[HUNT.i]; HUNT.found = 0;
  $('hunt').innerHTML = huntRoundHtml({ unit }, HUNT.i);
  $('huntRound').textContent = `${HUNT.i + 1} / ${rounds.length}`; $('huntStars').textContent = '⭐'.repeat(HUNT.score); $('huntMsg').textContent = '';
  await sleep(300); const hs = huntSound(r); Sound.play(hs.id, hs.text);
}
async function huntPick(el) {
  const rounds = App.units[App.u].show.hunt.rounds, r = rounds[HUNT.i]; if (!r || el.classList.contains('ok')) return;
  Sound.unlock();
  if (r.words.includes(el.dataset.w)) {
    el.classList.add('ok'); Sound.sfx('ok'); HUNT.found++; HUNT.score++; $('huntStars').textContent = '⭐'.repeat(HUNT.score);
    await Sound.play('word_' + el.dataset.w, el.dataset.w);
    if (HUNT.found >= r.words.length) { $('huntMsg').textContent = '✔ ' + App.book.instructions.great_job; Sound.sfx('chime'); await sleep(900); HUNT.i++; huntRound(); }
  } else { el.classList.add('no'); Sound.sfx('no'); $('huntMsg').textContent = App.book.instructions.try_again; setTimeout(() => el.classList.remove('no'), 500); }
}

// 이야기 되돌아보기(공연): 12장면 띠(썸네일 + 대사, 누르면 소리) + ▶ 전체 공연(무대에 장면 크게 + 줄 읽기, 역할 읽기 🎭) + 마지막 피날레(unit.story 첫 칸)
function recapStageHtml(scene, line, title, ko) {
  const bubble = line ? `<div class="bubble say" data-say="${esc(line.audio)}" data-text="${esc(line.text)}">${avatar(line.who)}<span>${esc(line.text)}${line.ko ? `<small class="tr kohelp">${esc(line.ko)}</small>` : ''}</span></div>` : '';
  return `<div class="stage-pic">${pic(scene, '', 'scene')}</div><div class="stage-cap">${title ? `<div class="stage-title">${esc(title)}</div>` : ''}${bubble}${ko ? `<div class="kobox kohelp"><div class="kd">${esc(ko)}</div></div>` : ''}</div>`;
}
PAGES.story_recap = (ctx) => {
  const rc = ctx.unit.show.recap, fin = ctx.unit.story.panels[0];
  const strip = rc.map((r, i) => `<div class="rc-cell say" data-i="${i}" data-say="${esc(r.line.audio)}" data-text="${esc(r.line.text)}" onclick="recapShow(${i})"><span class="u">Unit ${r.unit}</span>${pic(r.scene, '', 'scene')}<div class="ln">${avatar(r.line.who)}<span>${esc(r.line.text)}</span></div></div>`).join('');
  return `<div class="story-top"><h3 style="margin:0;font-size:24px">🎭 ${esc(ctx.unit.story.title)}</h3><button class="btn orange main-play print-hide" onclick="recapPlay()">▶ Show time!</button>${ctx.print ? '' : roleBtn() + (ctx.unit.show.recap.some((r) => r.ko || r.line.ko) ? koBtn() : '')}</div>` +
    `<div class="stage" id="rcStage">${recapStageHtml(fin.id, null, ctx.unit.story.title)}</div><div class="rc-strip">${strip}</div>`;
};
// 띠의 한 장면을 무대에 올리고 그 줄을 읽는다
function recapShow(i) {
  const unit = App.units[App.u], r = unit.show.recap[i]; stopSeq();
  $('rcStage').innerHTML = recapStageHtml(r.scene, r.line, `Unit ${r.unit}`, r.ko);
  document.querySelectorAll('.rc-cell').forEach((c) => c.classList.toggle('on', +c.dataset.i === i));
}
async function recapPlay() {
  Sound.unlock(); stopSeq();
  const unit = App.units[App.u], rc = unit.show.recap, fin = unit.story.panels[0]; Sound.bgm(unit.story.bgm);
  const items = rc.map((r, i) => ({ ...storyItem(r.line, null, {}, 0, 1), gap: 700,
    before: () => { recapShow(i); const el = document.querySelector('#rcStage .bubble'); el?.classList.add('hl'); if (!(ROLE.on && ROLE.has(r.line.who))) talking(el?.querySelector('img'), true); document.querySelector(`.rc-cell[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); },
    after: () => { talking(document.querySelector('#rcStage .bubble img'), false); } }));
  // 피날레: 마지막 장면 + 이야기 줄
  fin.lines.forEach((ln, k) => items.push({ ...storyItem(ln, null, fin, 0, k), gap: 700,
    before: () => { if (k === 0) { $('rcStage').innerHTML = recapStageHtml(fin.id, ln, unit.story.title); document.querySelectorAll('.rc-cell').forEach((c) => c.classList.remove('on')); } else $('rcStage').querySelector('.stage-cap').innerHTML = `<div class="stage-title">${esc(unit.story.title)}</div><div class="bubble say" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}">${avatar(ln.who)}<span>${esc(ln.text)}</span></div>`; const el = document.querySelector('#rcStage .bubble'); el?.classList.add('hl'); if (!(ROLE.on && ROLE.has(ln.who))) talking(el?.querySelector('img'), true); if (ln.sfx) Sound.sfx(ln.sfx); },
    after: () => talking(document.querySelector('#rcStage .bubble img'), false) }));
  const ok = await playSeq(items);
  if (ok) { Sound.sfx('chime'); toast('🎉 Pip can sing!'); }
}

// 수료증: 이름·날짜 빈칸, 제목·문구(영/한), 캐릭터 4명(cheering → 없으면 ref), 26 글자 띠, 선생님 서명. 웹에서 이름을 넣으면 들어가고 🖨 로 그 쪽만 인쇄
PAGES.certificate = (ctx) => {
  const c = ctx.unit.show.certificate, name = ctx.name || '';
  // 친구마다 있는 자세 중 기뻐하는 것 (cheering → happy → ref). 없는 그림을 부르지 않는다
  const pose = (id) => ['cheering', 'happy', 'ref'].find((p) => (App.book.characters[id].poses || []).includes(p)) || 'ref';
  const chars = Object.keys(App.book.characters).map((id) => `<span class="pic cert-char"><img src="${artSrc('char_' + id + '_' + pose(id))}" alt="${esc(App.book.characters[id].name)}" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${artSrc('char_' + id + '_ref')}'}else picFallback(this)"></span>`).join('');
  const az = c.series ? certBooks(c) : B2() ? Object.keys(App.book.families).map((f) => `<span class="famc">${famHtml(f)}</span>`).join('') : Object.keys(App.book.letters).map((l) => `<span class="${letterCls(l)}">${l.toUpperCase()}${l}</span>`).join('');
  const song = c.music && !ctx.print ? `<button class="btn orange small main-play" data-music="${esc(c.music)}" hidden onclick="stopSeq();Sound.music('${esc(c.music)}')">♪ Pop! Phonics Song</button>` : '';
  const form = ctx.print ? '' : `<div class="cert-form print-hide"><input id="certName" placeholder="이름 (영어)" value="${esc(name)}" oninput="certName(this.value)"><button class="btn small" onclick="certPrint()">🖨 인쇄</button>${song}</div>`;
  return form + `<div class="cert${c.series ? ' series' : ''}"><div class="cert-ribbon">${esc(App.book.series)} ${c.series ? '1–' + App.book.book : App.book.book}</div><h1>${esc(c.title)}</h1>
    <div class="cert-az">${az}</div>
    <div class="cert-name"><span id="certNameOut">${esc(name) || '&nbsp;'}</span></div>
    <div class="cert-text">${esc(c.text)}</div><div class="cert-ko">${esc(c.text_ko || '')}</div>
    <div class="cert-chars">${chars}</div>
    <div class="cert-foot"><span>Date <i></i></span><span>Teacher <i></i></span></div></div>`;
};
// 시리즈 수료증의 권 띠: books.json 의 권 이름 (Pop! Phonics 1 · Alphabet Sounds …)
function certBooks(c) { return (c.books || App.books.map((b) => b.n)).map((n) => { const b = (App.books || []).find((x) => x.n === n) || { n }; return `<span class="cert-bk b${n}"><b>${n}</b>${esc(b.subtitle || b.title || '')}</span>`; }).join(''); }
function certName(v) { const o = $('certNameOut'); if (o) o.textContent = v || ' '; }
function certPrint() { const v = $('certName')?.value || ''; window.open(`print.html?b=${App.b}&u=${App.u}&p=${App.p}&name=${encodeURIComponent(v)}${bkParam()}`, '_blank'); }

// ========== 2권 "단어 연못": 단어 가족·합치기 ==========
// 데이터(docs/06-book2.md 4절): unit.families, unit.words {가족: [단어]}, unit.sentences, check {read_circle, match, write},
// workbook_data {blend, family, sentences, write}, 복습 review {families, words, board, bingo, test, blend, sort}
const B2 = () => !!App.book.families;
// 단어 표시: 2권은 가족 부분을 굵게(c·at), 1권은 목표 글자를 색칠
function wordMark(w) { return B2() ? wordFamHtml(w) : wordHtml(w, letterOf(w)); }
// 가족 꼬리표 (-at, 모음 빨강, 유닛 안 순서대로 색)
function famTag(f, unit, cls = '') { return `<span class="fam ${famCls(f, unit)} ${cls}">${famHtml(f)}</span>`; }

// 합치기: 가족 하나. 단어마다 글자 타일이 떨어져 있다가 ▶ 를 누르면 낱소리와 함께 붙고 단어 소리·그림
// 3·4권은 words[w].chunks 로 소리 덩어리 타일(sh·i·p, c·a·p·e — 마법 e 의 끝 e 는 흐리게, a 와 같은 덩어리)
// 가족: page.family(하나) · page.families(여럿, 3권 ["ck","ng"]) · 둘 다 없으면 유닛 가족 전부. 단어가 7개 넘으면 줄을 촘촘히(.many)
function blendFams(ctx) { return ctx.page.families && ctx.page.families.length ? ctx.page.families : ctx.page.family ? [ctx.page.family] : unitFamilies(ctx.unit); }
function blendWords(ctx) { return blendFams(ctx).flatMap((f) => ((ctx.unit.words && ctx.unit.words[f]) || famWords(f)).map((w) => [w, f])); }
PAGES.blend = (ctx) => {
  const fs = blendFams(ctx), ws = blendWords(ctx);
  const rows = blendRowsHtml(ws, ctx.unit, fs.length > 1);
  return instr(1, App.book.instructions.blend_read || 'Blend and read.', '▶ 를 누르면 소리가 하나씩 나고 합쳐져 단어가 돼요. 따라 말해요') +
    blendHead(fs, ctx.unit) + `<div class="blend-rows ${ws.length > 6 ? 'many' : ''}">${rows}</div>`;
};
// 줄들: 가족이 여럿이면 가족마다 무리로 나눈다 (줄 왼쪽에 가족 색 띠 + 가족 꼬리표, 무리 사이 간격)
function blendRowsHtml(ws, unit, grouped) {
  return ws.map(([w, f], i) => { const first = grouped && (i === 0 || ws[i - 1][1] !== f); return blendRow(w, f, unit, grouped, first); }).join('');
}
// 합치기 쪽 머리: 가족 글자 크게 + 🔊 가족 소리 (2권 모음 /æ/, 3·4권 /ʃ/) + ▶ Blend all
function blendHead(fs, unit, big) {
  const one = (f) => { const s = famSound(f), lab = famKind(f) ? (famIpa(f) || famSay(f)) : s.text; return `<span class="fam-big ${famCls(f, unit)}">${famHtml(f)}</span><span class="fam-say say" data-say="${esc(s.id)}" data-text="${esc(s.text)}">🔊 /${esc(lab)}/</span>`; };
  return `<div class="blend-head ${[].concat(fs).length > 2 ? 'multi' : ''}">${[].concat(fs).map(one).join('')}<button class="btn orange ${big ? 'big ' : ''}main-play print-hide" onclick="blendAll()">▶ Blend all</button></div>`;
}
// 글자(덩어리) 타일 줄: 2권은 글자마다, 3·4권은 chunks 덩어리마다 (data-k = 덩어리 번호)
function tilesHtml(w) {
  const ts = chunkTiles(w), ch = wordChunks(w);
  return `<div class="tiles n${ts.length}">${ts.map((t) => `<span class="tile${(ch ? isVowelChunk(ch[t.k]) : App.book.vowels && App.book.vowels[t.t]) ? ' vowel' : ''}${t.t.length > 1 ? ' w2' : ''}${t.me ? ' me' : ''}${t.silent ? ' silent' : ''}" data-k="${t.k}">${esc(t.t)}</span>`).join('')}</div>`;
}
function blendRow(w, f, unit, grouped, first) {
  return `<div class="blend-row ${famCls(f, unit)}${grouped ? ' grp' : ''}${first ? ' grp-first' : ''}" data-w="${esc(w)}">${first ? `<span class="grp-tag">${famHtml(f)}</span>` : ''}<button class="spk print-hide" onclick="blendPlay(this.closest('.blend-row'))" title="합치기">▶</button>
    ${tilesHtml(w)}<div class="joined say" data-say="word_${esc(w)}" data-text="${esc(w)}">${wordFamHtml(w, f)}</div>
    <div class="bpic say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}</div></div>`;
}
// 소리 파일이 있는지 (한 번 물어보고 기억) — blend_<word> 가 있으면 그걸 쓰고, 없으면 낱소리 + 단어
const AUDIO_HAS = {};
async function audioExists(id) {
  if (id in AUDIO_HAS) return AUDIO_HAS[id];
  try { const r = await fetch(ASSETS + 'audio/' + id + '.mp3', { method: 'HEAD' }); AUDIO_HAS[id] = r.ok; } catch (e) { AUDIO_HAS[id] = false; }
  return AUDIO_HAS[id];
}
let blendToken = 0;
async function blendPlay(row) {
  if (!row) return; Sound.unlock(); stopSeq();
  const my = ++blendToken, w = row.dataset.w, tiles = [...row.querySelectorAll('.tile')], ch = wordChunks(w) || w.split('');
  row.classList.remove('joined', 'done'); tiles.forEach((t) => t.classList.remove('hl'));
  const hit = (k) => { tiles.forEach((t) => t.classList.toggle('hl', +t.dataset.k === k)); if (k >= 0) Sound.sfx('tap'); };   // 덩어리 k 의 타일 전부 (a_e 는 a 와 끝 e 같이)
  if (await audioExists('blend_' + w)) {
    // 합치기 음성 하나: 길이를 재서 타일 불을 그 길이에 맞춰 차례로, 마지막 1/4 에서 붙인다
    const el = new Audio(ASSETS + 'audio/blend_' + w + '.mp3');
    await new Promise((res) => { el.onloadedmetadata = res; el.onerror = res; setTimeout(res, 1500); });
    const d = (el.duration && isFinite(el.duration) ? el.duration : 2.4) * 1000, n = ch.length;
    ch.forEach((c, k) => setTimeout(() => { if (my === blendToken) hit(k); }, d * 0.75 * k / n));
    setTimeout(() => { if (my === blendToken) { hit(-1); row.classList.add('joined'); } }, d * 0.72);
    await Sound.play('blend_' + w, ch.map((c, k) => chunkSound(c, chunkIpa(w, k)).text).join(' ') + ', ' + w);
  } else {
    const items = ch.flatMap((c, k) => chunkItems(c, chunkIpa(w, k)).map((s) => ({ ...s, gap: 260, before: () => hit(k) })));
    if (!(await playSeq(items))) return;
    hit(-1); row.classList.add('joined'); Sound.sfx('pop'); await sleep(350);
    await Sound.play('word_' + w, w);
  }
  if (my === blendToken) row.classList.add('done');
}
async function blendAll() { for (const row of document.querySelectorAll('.blend-row')) { const t = blendToken; await blendPlay(row); if (blendToken !== t + 1) return; await sleep(500); } }

// 단어 가족: 두 가족 단어 전부(단어 카드) + 챈트(1.2초 박자) + 읽고 그림 잇기
PAGES.family_words = (ctx) => {
  const fs = unitFamilies(ctx.unit), all = unitWords(ctx.unit);
  const rows = fs.map((f) => `<div class="fw-row ${famCls(f, ctx.unit)}" data-f="${esc(f)}">${famTag(f, ctx.unit)}${((ctx.unit.words && ctx.unit.words[f]) || famWords(f)).map((w) => `<span class="fw say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-w="${esc(w)}" onclick="fwPick(event,this)">${wordFamHtml(w, f)}</span>`).join('')}</div>`).join('');
  const pics = shuffle(all, 3 + ctx.u).slice(0, 10).map((w) => `<div class="fw-pic" data-w="${esc(w)}" onclick="fwDrop(this)">${pic('word_' + w, '', w)}<div class="line"></div></div>`).join('');
  return instr(1, App.book.instructions.read_match || 'Read and match.', '단어를 읽어요. ♪ 챈트는 박자에 맞춰 단어를 이어 읽어요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="famChant()">♪ ${esc(App.book.instructions.word_chant || 'Word chant')}</button></div>` +
    `<div class="fw-rows">${rows}</div>` +
    instr(2, 'Read and match.', '단어를 누른 뒤 맞는 그림을 눌러요 (종이에서는 그림 아래에 단어를 써요)') + `<div class="fw-pics">${pics}</div>`;
};
const FW = { sel: null };
function fwPick(e, el) { if (!el.closest('.fw-rows')) return; document.querySelectorAll('.fw.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); FW.sel = el.dataset.w; }
function fwDrop(el) {
  if (!FW.sel) return; Sound.unlock();
  if (el.dataset.w === FW.sel) { el.classList.add('ok'); el.querySelector('.line').textContent = FW.sel; Sound.sfx('ok'); Sound.play('word_' + FW.sel, FW.sel); document.querySelector(`.fw[data-w="${FW.sel}"]`)?.classList.add('done'); FW.sel = null; document.querySelectorAll('.fw.sel').forEach((x) => x.classList.remove('sel')); }
  else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 500); }
}
async function famChant() {
  Sound.unlock(); const beat = (await chantTrack('chant_beat')) || CHANT_BEAT, items = [];
  for (const row of document.querySelectorAll('.fw-row')) {
    const f = row.dataset.f; items.push({ ...famSound(f), el: row.querySelector('.fam'), beat });
    for (const w of row.querySelectorAll('.fw')) items.push({ id: 'word_' + w.dataset.w, text: w.dataset.w, el: w, beat });
  }
  await playSeq(items); chantTrackOff();
}

// 문장: 그림 있는 문장 4개. 사이트워드는 노랑 밑줄, 단어는 누르면 소리, ▶ 는 문장 소리
function sentenceHtml(sn, unit, k) {
  const sws = unit.sight_words || [], ws = new Set(sn.words || []), all = unitWords(unit);
  const toks = sn.text.split(/(\s+)/).map((t) => {
    if (/^\s+$/.test(t)) return t;
    const core = t.replace(/[^A-Za-z'-]/g, ''), lo = core.toLowerCase();
    if (sws.includes(core) || sws.includes(lo)) return t.replace(core, `<span class="sw say" data-say="sw_${esc(lo)}" data-text="${esc(core)}">${esc(core)}</span>`);
    if (ws.has(lo) || all.includes(lo)) return t.replace(core, `<span class="tw say" data-say="word_${esc(lo)}" data-text="${esc(core)}">${wordFamHtml(core, familyOf(lo))}</span>`);
    return esc(t);
  }).join('');
  return `<div class="sent-row" data-k="${k}"><div class="spic">${pic(sn.pic || ('word_' + (sn.words || [''])[0]), '', '')}</div><div class="stext">${toks}</div>${spk(sn.audio, sn.text)}</div>`;
}
PAGES.sentences = (ctx) => {
  const sns = ctx.unit.sentences || [];
  return instr(1, App.book.instructions.read_sentence || 'Read the sentence.', '문장을 읽어요. 단어를 누르면 소리가 나요. 🔊 는 문장 전체') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="sentencesAll()">▶ Read all</button>${(ctx.unit.sight_words || []).length ? `<span class="sw-list"><b>${esc(App.book.instructions.sight_words)}</b>${(ctx.unit.sight_words || []).map((w) => `<span class="say" data-say="sw_${esc(w)}" data-text="${esc(w)}">${esc(w)}</span>`).join('')}</span>` : ''}</div>` +
    `<div class="sent-rows">${sns.map((sn, k) => sentenceHtml(sn, ctx.unit, k)).join('')}</div>`;
};
async function sentencesAll() {
  Sound.unlock();
  const sns = App.units[App.u].sentences || [];
  await playSeq(sns.map((sn, k) => ({ id: sn.audio, text: sn.text, el: document.querySelector(`.sent-row[data-k="${k}"]`), gap: 700 })));
}

// 정리(2권): 읽고 동그라미(단어 → 그림 3) / 단어–그림 잇기 / 빠진 글자 쓰기
function rcRow(it, i) { return `<span class="n">${i + 1}</span><div class="rc-word say" data-say="word_${esc(it.word)}" data-text="${esc(it.word)}">${wordFamHtml(it.word)}</div><div class="opts">${it.pictures.map((o) => `<div class="opt" onclick="checkPick(this,'${o}','${it.word}')">${pic('word_' + o, '', o)}</div>`).join('')}</div>`; }
function matchHtml2(c, cls = '') {
  const words = c.match.map((m) => m.word), pics = shuffle(words, 7);
  return `<div class="match m2 ${cls}" id="match"><div class="col">${words.map((w) => `<div class="it wd" data-l="${w}" onclick="matchPick2(this)">${wordFamHtml(w)}</div>`).join('')}</div><div class="col">${pics.map((w) => `<div class="it" data-w="${w}" onclick="matchPick2(this)">${pic('word_' + w, '', w)}</div>`).join('')}</div></div>`;
}
function matchPick2(el) {
  Sound.unlock();
  if (el.dataset.l) { document.querySelectorAll('#match .it.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); M.l = el.dataset.l; Sound.play('word_' + M.l, M.l); return; }
  if (!M.l) return;
  if (el.dataset.w === M.l) { el.classList.add('done'); document.querySelector(`#match .it[data-l="${M.l}"]`)?.classList.add('done'); Sound.sfx('ok'); Sound.play('word_' + M.l, M.l); M.l = null; } else { el.classList.add('no'); Sound.sfx('no'); setTimeout(() => el.classList.remove('no'), 500); }
}
// 빠진 글자 상자: missing 번째 글자가 빈 칸(없으면 1). 화면에서는 누르면 글자가 들어가고 소리
// 3·4권(chunks 가 있는 단어)은 상자가 소리 덩어리마다(sh 는 넓은 상자 하나)이고 missing 은 덩어리 번호 — 없으면 가족 덩어리(ship → sh)
function missingBoxes(w, miss, cls = '') {
  const ch = wordChunks(w);
  if (miss == null) miss = ch ? Math.max(0, ch.indexOf(famKey(familyOf(w)))) : 1;
  const ts = chunkTiles(w);
  return `<div class="boxes n${ts.length} ${cls}">${ts.map((t) => { const c = `${t.t.length > 1 ? 'w2' : ''}${t.silent ? ' silent' : ''}`;
    return t.k === miss ? `<span class="blank ${c}" onclick="this.textContent='${esc(t.t)}';this.classList.add('ok');chunkPlay('${esc(ch ? ch[t.k] : t.t)}','${esc(ch ? chunkIpa(w, t.k) : '')}')"></span>` : `<span class="${c}">${esc(t.t)}</span>`; }).join('')}</div>`;
}
function writeItems2(c) { return c.write.map((it) => `<div class="write-it w2">${pic('word_' + it.word, '', it.word)}${missingBoxes(it.word, it.missing)}</div>`).join(''); }
function checkBody2(ctx, c) {
  return instr('A', App.book.instructions.read_circle || 'Read and circle.', '단어를 읽고 맞는 그림에 동그라미') + `<div class="check-sec rc">${c.read_circle.map((it, i) => `<div class="lc-row">${rcRow(it, i)}</div>`).join('')}</div>` +
    instr('B', App.book.instructions.read_match || 'Read and match.', '단어를 누르고 맞는 그림을 눌러요') + matchHtml2(c) +
    instr('C', c.write.some((it) => (wordChunks(it.word) || []).some((x) => x.length > 1)) ? 'Write the missing letters.' : 'Write the missing letter.', '빠진 글자를 써요') + `<div class="write-row w2 g4">${writeItems2(c)}</div>`;
}

// ---------- 2권 워크북 ----------
// 가족 분류 상자: sort = {가족: [단어]} — 상자에 들어갈 단어를 data-ws 로 (가족이 아닌 묶음도 된다)
function famSortHtml(sort, pool, unit) {
  return `<div class="sort rv fam-sort"><div class="pool" id="sortPool" style="grid-column:1/-1">${pool.map((w) => `<span class="wd" onclick="sortPick(this)" data-w="${esc(w)}">${esc(w)}</span>`).join('')}</div>${Object.keys(sort).map((f) => `<div class="bin ${famCls(f, unit)}" data-l="${esc(f)}" data-ws="${esc(sort[f].join(' '))}" onclick="sortDrop(this)"><h4>${famHtml(f)}</h4><div class="in"></div></div>`).join('')}</div>`;
}
PAGES.wb_blend = (ctx) => {
  const items = (ctx.unit.workbook_data?.blend || unitWords(ctx.unit).slice(0, 8).map((w, i) => ({ word: w, missing: i % 3 })));
  const many = items.some((it) => (wordChunks(it.word) || []).some((c) => c.length > 1));   // 3·4권: 빈 칸에 두 글자(sh)가 들어갈 수 있다
  return instr('A', many ? (App.book.instructions.write_letters || App.book.instructions.write_pair || 'Write the missing letters.') : 'Write the missing letter.', many ? '그림을 보고 빈 칸에 들어갈 글자(짝꿍 글자)를 써요 (화면에서는 빈 칸을 누르면 나와요)' : '그림을 보고 빠진 글자를 써요 (화면에서는 빈 칸을 누르면 글자가 나와요)') +
    `<div class="write-row w2 g4">${items.map((it) => `<div class="write-it w2">${pic('word_' + it.word, '', it.word)}${missingBoxes(it.word, it.missing)}</div>`).join('')}</div>`;
};
PAGES.wb_family = (ctx) => {
  const fam = ctx.unit.workbook_data?.family || Object.fromEntries(unitFamilies(ctx.unit).map((f) => [f, ((ctx.unit.words && ctx.unit.words[f]) || famWords(f)).slice(0, 4)]));
  const pool = shuffle(Object.values(fam).flat(), 5 + ctx.u);
  const sortHtml = famSortHtml(fam, pool, ctx.unit);
  const pairs = shuffle(unitWords(ctx.unit), 9 + ctx.u).slice(0, 4), right = shuffle(pairs, 2 + ctx.u);
  const match = `<div class="match m2" id="match"><div class="col">${pairs.map((w) => `<div class="it wd" data-l="${w}" onclick="matchPick2(this)">${wordFamHtml(w)}</div>`).join('')}</div><div class="col">${right.map((w) => `<div class="it" data-w="${w}" onclick="matchPick2(this)">${pic('word_' + w, '', w)}</div>`).join('')}</div></div>`;
  return instr('B', 'Sort the words.', '단어를 눌러 가족 상자에 넣어요') + sortHtml + instr('C', 'Read and match.', '단어를 읽고 맞는 그림과 이어요') + match;
};
PAGES.wb_sentences = (ctx) => {
  const items = ctx.unit.workbook_data?.sentences || (ctx.unit.sentences || []).map((sn, i) => ({ text: sn.text, pictures: [sn.words[0], unitWords(ctx.unit)[(i + 5) % 10]], answer: 0 }));
  const rows = items.map((it, i) => `<div class="wbs"><div class="wbs-top"><span class="n">${i + 1}</span><span class="stext">${esc(it.text)}</span>${it.audio ? spk(it.audio, it.text) : ''}<div class="opts">${it.pictures.map((o, j) => `<div class="opt" onclick="checkPick(this,'${j}','${it.answer ?? 0}')">${pic('word_' + o, '', o)}</div>`).join('')}</div></div><div class="trace-sent"><span>${esc(it.text)}</span></div></div>`).join('');
  return instr('D', 'Read and circle. Then trace.', '문장을 읽고 맞는 그림에 동그라미, 문장을 따라 써요') + `<div class="wbs-rows">${rows}</div>`;
};
PAGES.wb_write = (ctx) => {
  const ws = ctx.unit.workbook_data?.write || unitWords(ctx.unit).slice(0, 6);
  return instr('F', 'Look and write.', '그림을 보고 단어를 따라 쓰고, 빈 줄에 써요') + `<div class="write-row w2 g3 wbw">${ws.map((w) => `<div class="write-it w2 say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="w4"><span class="gray">${esc(w)}</span></div><div class="w4"></div></div>`).join('')}</div>`;
};

// ---------- 2권 복습 ----------
// 단어 복습: 복습 단어 카드 격자(그림 + 단어 + 가족), Listen to all
PAGES.review_words = (ctx) => {
  const ws = (ctx.unit.review.words || unitWords(ctx.unit)).slice(0, 20), cols = ws.length <= 12 ? 4 : 5;
  return instr(1, App.book.instructions.listen_repeat, '그림을 누르면 단어가 나와요. 읽고 따라 말해요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="reviewWordsAll()">▶ Listen to all</button></div>` +
    `<div class="rv-cards rw c${cols}" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${ws.map((w) => `<div class="rv-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-w="${esc(w)}"><div class="rv-pic">${pic('word_' + w, '', w)}</div><div class="rv-word">${wordFamHtml(w)}</div>${famTag(familyOf(w), ctx.unit, 'sm')}</div>`).join('')}</div>`;
};
async function reviewWordsAll() { Sound.unlock(); await playSeq([...document.querySelectorAll('.rv-card[data-w]')].map((c) => ({ id: 'word_' + c.dataset.w, text: c.dataset.w, el: c, gap: 350 }))); }
PAGES.wb_review_blend = (ctx) => {
  const rv = ctx.unit.review, items = rv.blend || (rv.words || []).slice(0, 8).map((w, i) => ({ word: w, missing: i % 3 }));
  const sort = rv.sort || Object.fromEntries(unitFamilies(ctx.unit).slice(0, 4).map((f) => [f, famWords(f).slice(0, 2)]));
  const pool = shuffle(Object.values(sort).flat(), 5 + ctx.u);
  const sortHtml = famSortHtml(sort, pool, ctx.unit);
  return instr('A', 'Write the missing letter.', '빠진 글자를 써요') + `<div class="write-row w2 g4">${items.map((it) => `<div class="write-it w2">${pic('word_' + it.word, '', it.word)}${missingBoxes(it.word, it.missing)}</div>`).join('')}</div>` +
    instr('B', 'Sort the words.', '단어를 눌러 가족 상자에 넣어요') + sortHtml;
};

// ---------- 2권 12유닛 ----------
PAGES.word_song = (ctx) => PAGES.alphabet_song(ctx);
// 징검다리: 단어 가족 돌을 배운 순서대로 누른다 (show.bridge.families, 없으면 book.families 순서)
function bridgeOrder() { const sh = App.units[App.u].show; return (sh && sh.bridge && sh.bridge.families) || Object.keys(App.book.families || {}); }
PAGES.bridge_path = (ctx) => {
  const fs = bridgeOrder(); pathNext = 0;
  return instr(1, 'Cross the pond.', '배운 순서대로 징검다리(단어 가족)를 눌러 연못을 건너요') + `<div class="path path26 bridge" id="path">${shuffle(fs, 31 + ctx.u).map((f) => `<div class="lt" data-l="${f}" onclick="bridgePick(this)">${famHtml(f)}</div>`).join('')}</div>` +
    `<div class="screen-hide" style="color:var(--soft);font-size:14px">${fs.map((f) => '-' + f).join(' → ')} 순서대로 선으로 이어요</div>`;
};
function bridgePick(el) { Sound.unlock(); const fs = bridgeOrder(); if (el.dataset.l === fs[pathNext]) { el.classList.add('done'); const w = famWords(el.dataset.l)[0]; Sound.play('word_' + w, w); pathNext++; if (pathNext === fs.length) { Sound.sfx('chime'); pathNext = 0; } } else Sound.sfx('no'); }

// 모음 5개 소개 (2권 0유닛): 글자·소리·힌트·그 모음 가족의 단어 그림. "Listen to all"
// 3권(가족에 모음 예시가 없음): 그 모음이 소리 덩어리로 든 단어(black → a). 4권(긴 모음): 소리는 글자 이름(name_a = /eɪ/)
function vowelCards(unit) {
  const vs = App.book.vowels || {};
  return Object.entries(vs).map(([v, d]) => {
    const fam = Object.keys(App.book.families || {}).find((f) => famVowel(f) === v && famWords(f).length);
    let w = fam ? famWords(fam)[0] : '';
    if (!w) w = Object.keys(App.book.words || {}).find((x) => (wordChunks(x) || []).includes(v) && !App.book.words[x].family) || Object.keys(App.book.words || {}).find((x) => (wordChunks(x) || []).includes(v)) || '';
    const long = L(v) && L(v).sound !== d.sound, sid = long ? 'name_' + v : 'sound_' + v, stext = long ? v.toUpperCase() : d.sound;
    const wh = w ? (fam ? wordFamHtml(w, fam) : chunkTiles(w).map((t) => wordChunks(w)[t.k] === v ? `<b class="vowel">${esc(t.t)}</b>` : esc(t.t)).join('')) : '';
    return `<div class="vw-card say" data-v="${v}" data-say="${sid}" data-text="${esc(stext)}"><div class="glyph vowel">${v.toUpperCase()}<small>${v}</small></div><div class="ipa">/${esc(d.sound)}/</div>${w ? `<div class="vw-pic">${pic('word_' + w, '', w)}</div><div class="vw-word" data-w="${esc(w)}">${wh}</div>` : ''}<div class="hint">${esc(d.hint || '')}</div></div>`;
  }).join('');
}
PAGES.vowels = (ctx) => instr(1, App.book.instructions.listen_repeat, '모음 5개의 소리를 듣고 따라 말해요. 단어 속 빨간 글자가 모음이에요') +
  `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="vowelsAll()">▶ Listen to all</button></div><div class="vw-cards">${vowelCards(ctx.unit)}</div>`;
async function vowelsAll() {
  Sound.unlock(); const items = [];
  for (const c of document.querySelectorAll('.vw-card')) { const w = c.querySelector('.vw-word')?.dataset.w; items.push({ id: c.dataset.say, text: c.dataset.text, el: c, gap: 300 }); if (w) items.push({ id: 'word_' + w, text: w, el: c.querySelector('.vw-word'), gap: 450 }); }
  await playSeq(items);
}

// ========== 3·4권: 짝꿍 소리(digraph) · 마법 e(magic_e) — docs/13-book3-4.md 5절 ==========
// 짝꿍 소리: 가족마다 두 글자 타일이 떨어져 있다가 ▶ 에 미끄러져 붙으며 하나의 소리로 빛난다(sound_<가족>, 없으면 합성 음성) → 그 가족 단어.
// page.family 가 있으면 그 가족만, 없으면 유닛 가족 전부(4개까지). 4권 모음 짝 유닛(ai·ay …)도 같은 쪽.
function digraphFams(ctx) { return ctx.page.family ? [ctx.page.family] : unitFamilies(ctx.unit).slice(0, 4); }
function digraphParts(f) { const key = famKey(f); return key.includes('_') ? [key.split('_')[0], key.split('_')[1] || 'e'] : key.split(''); }
function digraphWords(f, unit, n) { return ((unit.words && unit.words[f]) || famWords(f)).slice(0, n); }
function digraphCard(f, unit, nWords, cols) {
  const s = famSound(f), ws = digraphWords(f, unit, nWords);
  const tiles = digraphParts(f).map((ch, i) => `<span class="dg-tile${isVowelChunk(ch) ? ' vowel' : ''}" data-i="${i}">${esc(ch)}</span>`).join('');
  return `<div class="dg-card ${famCls(f, unit)}" data-f="${esc(f)}">
    <div class="dg-top"><button class="spk big print-hide" onclick="digraphPlay(this.closest('.dg-card'))" title="두 글자 → 소리 하나">▶</button>
      <div class="dg-tiles say" data-say="${esc(s.id)}" data-text="${esc(s.text)}">${tiles}</div>
      <div class="dg-ipa say" data-say="${esc(s.id)}" data-text="${esc(s.text)}">/${esc(famIpa(f) || famSay(f))}/</div></div>
    <div class="dg-words" style="grid-template-columns:repeat(${Math.max(1, Math.min(cols || ws.length, ws.length))},minmax(0,1fr))">${ws.map((w, i) => `<div class="dg-w say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-w="${esc(w)}"><span class="num">${i + 1}</span>${pic('word_' + w, '', w)}<div class="wd">${wordFamHtml(w, f)}</div></div>`).join('')}</div></div>`;
}
PAGES.digraph = (ctx) => {
  const fs = digraphFams(ctx), n = fs.length;
  // 가족이 하나면 단어 6개까지 3열, 둘이면 5개 한 줄, 셋 이상이면 3개씩 (2×2 칸)
  const cards = fs.map((f) => n === 1 ? digraphCard(f, ctx.unit, 6, 3) : digraphCard(f, ctx.unit, n === 2 ? 5 : 3)).join('');
  // 따라 쓰기: 가족마다 한 줄 (진한 글자 1 · 흐린 글자 2 · 빈 칸 3)
  const trace = fs.map((f) => { const t = esc(famKey(f).replace('_', '')); return `<div class="trace-line dg-trace ${famCls(f, ctx.unit)}"><span class="solid">${t}</span><span>${t}</span><span>${t}</span><span class="box">${t}</span><span class="box">${t}</span><span class="box">${t}</span></div>`; }).join('');
  return instr(1, App.book.instructions.team_sound || App.book.instructions.say_pair || App.book.instructions.listen_repeat || 'Listen and repeat.', '두 글자가 만나면 소리 하나! ▶ 를 누르면 글자가 붙으며 소리가 나요. 따라 말하고 단어를 읽어요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="digraphAll()">▶ Listen to all</button></div>` +
    `<div class="dg-cards n${n}">${cards}</div>` +
    instr(2, App.book.instructions.trace_write || 'Trace and write.', '두 글자를 붙여 따라 쓰고, 소리를 말해요') + `<div class="trace-rows dg-traces">${trace}</div>`;
};
// 타일을 떨어뜨렸다가 붙이고(빛남) 가족 소리 → 단어들
async function digraphPlay(card) {
  if (!card) return false; Sound.unlock(); stopSeq();
  const my = seqToken;
  card.classList.remove('joined'); await sleep(300); if (my !== seqToken) return false;
  card.classList.add('joined'); Sound.sfx('pop'); await sleep(500); if (my !== seqToken) return false;
  const s = famSound(card.dataset.f);
  return playSeq([{ ...s, el: card.querySelector('.dg-tiles'), gap: 600 }, ...[...card.querySelectorAll('.dg-w')].map((el) => ({ id: 'word_' + el.dataset.w, text: el.dataset.w, el, gap: 350 }))]);
}
async function digraphAll() { for (const c of document.querySelectorAll('.dg-card')) { if (!(await digraphPlay(c))) return; await sleep(400); } }

// 마법 e: unit.pairs [{from: "cap", to: "cape"}] 4~5개. 요정 이를 누르면 단어 끝에 반짝이는 e 가 붙어 cap → cape (word_cap → word_cape).
// 모음은 제 이름 소리로 바뀐다(빛남). 다시 누르면 처음으로. 인쇄는 "cap + e →" 와 쓰기 줄.
function fairyId() { return Object.keys(App.book.characters || {}).find((id) => /fairy/i.test(id + ' ' + (App.book.characters[id].name || ''))) || ''; }
function fairyIcon() { const id = fairyId(); return id ? `<img src="${artSrc('char_' + id + '_ref')}" alt="Fairy E" onerror="this.replaceWith('🧚')">` : '🧚'; }
function magicPairs(unit) { return (unit.pairs || []).filter((pr) => pr && pr.from && pr.to); }
// 글자 타일: from 의 글자 + 끝에 숨은 e. 바뀌는 모음(from 의 마지막 모음)에 표시
function magicLetters(pr) {
  const from = pr.from, add = pr.to.startsWith(from) ? pr.to.slice(from.length) : '', vi = Math.max(from.search(/[aeiou](?!.*[aeiou])/), -1);
  return `<span class="me-letters">${from.split('').map((ch, i) => `<span class="me-l${i === vi ? ' mv' : ''}">${esc(ch)}</span>`).join('')}${add ? `<span class="me-l me-e">${esc(add)}</span>` : ''}</span>` +
    (add ? '' : `<span class="me-to">${esc(pr.to)}</span>`);   // e 를 붙이는 꼴이 아니면 새 단어를 통째로
}
function magicRow(pr, i) {
  return `<div class="me-row" data-i="${i}" data-from="${esc(pr.from)}" data-to="${esc(pr.to)}">
    <div class="me-pic from say" data-say="word_${esc(pr.from)}" data-text="${esc(pr.from)}"><span class="num">${i + 1}</span>${pic('word_' + pr.from, '', pr.from)}</div>
    <div class="me-word">${magicLetters(pr)}</div>
    <button class="me-fairy print-hide" onclick="magicTap(this.closest('.me-row'))" title="요정 이가 e 를 붙여요">${fairyIcon()}<b>+e</b></button>
    <div class="me-plus screen-hide">+ e →</div><div class="w4 me-w4 screen-hide"></div>
    <div class="me-pic to say" data-say="word_${esc(pr.to)}" data-text="${esc(pr.to)}">${pic('word_' + pr.to, '', pr.to)}</div></div>`;
}
function magicHead(unit, big) {
  const f = unitFamilies(unit).find((x) => famKind(x) === 'magic_e'); if (!f) return '';
  const s = famSound(f);
  return `<div class="blend-head"><span class="fam-big ${famCls(f, unit)}">${famHtml(f)}</span><span class="fam-say say" data-say="${esc(s.id)}" data-text="${esc(s.text)}">🔊 /${esc(famIpa(f) || famSay(f))}/</span><button class="btn orange ${big ? 'big ' : ''}main-play print-hide" onclick="magicAll()">▶ Magic e!</button></div>`;
}
PAGES.magic_e = (ctx) => {
  const prs = magicPairs(ctx.unit);
  const head = magicHead(ctx.unit) || `<div class="print-hide"><button class="btn orange main-play" onclick="magicAll()">▶ Magic e!</button></div>`;
  return instr(1, App.book.instructions.magic_e || 'Add the magic e!', ctx.print ? '끝에 e 를 붙이면 단어가 바뀌어요. 새 단어를 쓰고 읽어요' : '요정 이를 누르면 끝에 e 가 붙어요. 모음이 제 이름 소리로 바뀌어요 (cap → cape)') +
    head + `<div class="me-rows n${prs.length}">${prs.map((pr, i) => magicRow(pr, i)).join('')}</div>`;
};
async function magicTap(row) {
  if (!row) return false; Sound.unlock(); stopSeq();
  const from = row.dataset.from, to = row.dataset.to;
  if (row.classList.contains('magic')) { row.classList.remove('magic'); Sound.play('word_' + from, from); return true; }
  if (!(await playSeq([{ id: 'word_' + from, text: from, el: row.querySelector('.me-pic.from'), gap: 250 }]))) return false;
  row.classList.add('magic'); Sound.sfx('chime'); sparkle(row.querySelector('.me-word'));
  await sleep(550);
  return playSeq([{ id: 'word_' + to, text: to, el: row.querySelector('.me-pic.to'), gap: 300 }]);
}
async function magicAll() { const rows = [...document.querySelectorAll('.me-row')]; rows.forEach((r) => r.classList.remove('magic')); for (const r of rows) { if (!(await magicTap(r))) return; await sleep(500); } }
