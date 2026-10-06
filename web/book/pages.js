// Pomi Phonics 웹 교재 — 쪽 종류별 그리기. 각 함수는 ctx 를 받아 쪽 안쪽 HTML 을 돌려준다.
// ctx = { book, unit, b('sb'|'wb'), u, p, page(쪽 명세), pages(쪽 목록), print }
const PAGES = {};

function instr(n, text, ko) { return `<div class="instr">${n ? `<span class="n">${n}</span>` : ''}<span>${esc(text)}</span>${ko ? `<span class="ko">${esc(ko)}</span>` : ''}</div>`; }
function spk(id, text, big) { return `<button class="spk ${big ? 'big' : ''} print-hide" data-say="${esc(id)}" data-text="${esc(text)}" title="듣기">🔊</button>`; }
// 머리띠 글자: 일반 유닛은 글자 전부, 복습 유닛은 앞 4개 + "…", 0유닛은 없음
function lettersBadge(unit) {
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
// 스토리 한 줄을 playSeq 항목으로 (역할 줄이면 소리 없이 2.5초)
function storyItem(ln, el, pn, idx, k) {
  const mine = ROLE.on && ROLE.has(ln.who);
  return { id: ln.audio, text: ln.text, el, gap: 550, wait: mine ? 2500 : 0,
    before: () => { if (k === 0 && pn.video) playVideo(idx, true); if (!mine) talking(el?.querySelector('img'), true); if (ln.sfx && !mine) Sound.sfx(ln.sfx); },
    after: () => { talking(el?.querySelector('img'), false); if (ln.pop) { Sound.sfx('pop'); el?.classList.add('playing'); } } };
}
function wordCard(w, l, extra = '') {
  return `<div class="word-card say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${esc(w)}">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div>${extra}</div>`;
}

// ---------- 학생책 Lesson 1 ----------
// 소리: 글자 3개, 글자나무, 이름·소리·챈트·동작
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
        <div class="action">✋ ${esc(d.action)}<br><span class="ko">${esc(d.action_ko)}</span></div>
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
  const beat = await chantTrack('chant_sound');
  const ok = await playSeq([
    { id: 'name_' + l, text: l.toUpperCase(), el: card?.querySelector('.glyph') }, s, s, { ...s, gap: 400 },
    ...d.words.map((w) => ({ id: 'word_' + w, text: w, el: card?.querySelector(`.w[data-word="${w}"], .w[data-say="word_${w}"]`), gap: 300, before: () => Sound.sfx('pop') })),
  ].map((it) => ({ ...it, beat })));
  chantTrackOff(); return ok;
}
async function playSoundsPage() { for (const l of App.units[App.u].letters) { if (!(await chant(l) ?? true)) return; await sleep(500); } }
// 챈트 반주: web/assets/music/chant_sound.mp3 · chant_word.mp3 가 있으면 틀고 박자(1.2초)를 돌려준다. 없으면 0 (지금처럼 소리 길이대로)
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
  const beat = await chantTrack('chant_word'), items = [];
  for (const l of App.units[App.u].letters) {
    items.push({ id: 'sound_' + l, text: soundText(l), el: document.querySelector(`.word-row .ltr[data-say="sound_${l}"]`), gap: 250, beat });
    for (const w of L(l).words) items.push({ id: 'word_' + w, text: w, el: document.querySelector(`.word-card[data-word="${w}"]`), gap: 300, beat });
  }
  await playSeq(items); chantTrackOff();
}

// 따라 읽기 + 놀이 (소리 잡기)
PAGES.read_play = (ctx) => {
  const cards = ctx.unit.letters.flatMap((l) => L(l).words).map((w) => { const l = letterOf(w); return `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="tr">${wordHtml(w, l)}</div></div>`; }).join('');
  return instr(1, App.book.instructions.trace_read, '단어를 따라 쓰고 읽어요') + `<div class="read-rows">${cards}</div>` +
    instr(2, App.book.instructions.lets_play, '소리를 듣고 그 소리로 시작하는 그림을 눌러요') + gameHtml(ctx);
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
  await sleep(300); Sound.play('sound_' + r.answer, soundText(r.answer));
}
async function gamePick(el, w) {
  if (G.busy || !G.rounds) return;
  const r = G.rounds[G.i];
  if (letterOf(w) === r.answer) { G.busy = true; el.classList.add('ok'); Sound.sfx('ok'); G.score++; G.scores[G.team]++; gameScoreDraw(); await Sound.play('word_' + w, w); G.i++; await sleep(500); gameRound(); }
  else { el.classList.add('no'); Sound.sfx('no'); $('gameMsg').textContent = App.book.instructions.try_again; setTimeout(() => el.classList.remove('no'), 500); }
}

// ---------- 학생책 Lesson 2 ----------
// 듣고 가리키고 말하기 + 말하고 표시
PAGES.listen_point = (ctx) => {
  const rows = ctx.unit.letters.map((l) => `<div class="lp-row" data-letter="${l}"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div>${L(l).words.map((w) => `<div class="cell say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${w}">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div><span class="chk" onclick="event.stopPropagation();this.classList.toggle('on');Sound.sfx('tap')"></span></div>`).join('')}</div>`).join('');
  return instr(1, App.book.instructions.listen_point, '듣고 글자와 그림을 가리키며 따라 말해요') +
    `<div class="print-hide" style="display:flex;gap:10px;align-items:center"><button class="btn orange main-play" onclick="listenPointAll()">▶ Listen</button></div><div class="lp-table">${rows}</div>` +
    instr(2, App.book.instructions.say_check, '단어를 말하고 네모에 표시');
};
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
  const sbLink = half === 1 && ctx.unit.storybook?.pages?.length && !ctx.print ? `<a class="btn small sb-link print-hide" href="story.html?u=${ctx.u}&p=1" target="_blank" title="스토리북 (전체화면 그림책)">📙</a>` : '';
  const html = panels.map((pn, i) => {
    const idx = (half - 1) * 2 + i;
    const bubbles = pn.lines.map((ln, k) => `<div class="bubble say ${k % 2 ? 'right' : ''}" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="${idx}" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}</span></div>`).join('');
    const find = pn.hidden?.length ? `<div class="find"><b>🔍 Find:</b>${pn.hidden.map((w) => `<span class="chip" data-say="word_${esc(w)}" data-text="${esc(w)}" onclick="this.classList.toggle('on')">${esc(w)}</span>`).join('')}</div>` : '';
    const movie = pn.video && !ctx.print ? `<button class="btn blue movie print-hide" onclick="playVideo(${idx})">▶ movie</button>` : '';
    return `<div class="pwrap"><div class="panel" data-panel="${idx}"><div class="scene">${pic(pn.id, '', 'scene')}</div><span class="no">${idx + 1}</span>${movie}<div class="bubbles">${bubbles}</div></div>${find}</div>`;
  }).join('');
  return `<div class="story-top"><h3 style="margin:0;font-size:24px">📖 ${esc(st.title)}</h3><button class="btn orange main-play print-hide" onclick="storyPlay(${half})">▶ ${esc(App.book.instructions.listen_story)}</button>${sw}${roleBtn()}${sbLink}</div><div class="panels">${html}</div>`;
};
async function storyPlay(half) {
  Sound.unlock();
  const st = App.units[App.u].story; Sound.bgm(st.bgm);
  const items = [];
  st.panels.slice((half - 1) * 2, half * 2).forEach((pn, i) => {
    const idx = (half - 1) * 2 + i;
    pn.lines.forEach((ln, k) => items.push(storyItem(ln, document.querySelector(`.bubble[data-panel="${idx}"][data-line="${k}"]`), pn, idx, k)));
  });
  await playSeq(items);
}
// 장면 영상이 있으면 그림 자리에 튼다 (없으면 조용히 넘어간다). 소리는 끈다 — 대사·음악과 겹치지 않게
function playVideo(idx, quiet) {
  const panel = document.querySelector(`.panel[data-panel="${idx}"]`); if (!panel) return;
  const id = App.units[App.u].story.panels[idx].video; if (!id) return;
  let v = panel.querySelector('video');
  if (!v) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = videoSrc(id); v.onerror = () => { v.remove(); if (!quiet) toast('영상이 아직 없어요'); }; panel.appendChild(v); }
  v.currentTime = 0; v.play().catch(() => {});
}

// 유닛 정리: 듣고 동그라미 / 잇기 / 찾아 쓰기. 복습 평가(review_test)도 같은 모양(문항만 많다)
PAGES.check = (ctx) => checkBody(ctx, ctx.unit.check);
PAGES.review_test = (ctx) => checkBody(ctx, ctx.unit.review.test);
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
function sortDrop(bin) { if (!S.sel) return; if (letterOf(S.sel.dataset.w) === bin.dataset.l) { S.sel.classList.remove('sel'); S.sel.classList.add('ok'); bin.querySelector('.in').appendChild(S.sel); S.sel = null; Sound.sfx('ok'); } else Sound.sfx('no'); }
function fillPick(el, w, ans) { Sound.unlock(); if (w === ans) { el.classList.add('ok'); el.closest('.fill').querySelector('.blank').textContent = w; Sound.sfx('ok'); Sound.play('word_' + w, w); } else Sound.sfx('no'); }

// ---------- 0유닛 ----------
PAGES.characters = (ctx) => {
  const cs = Object.entries(App.book.characters).map(([id, c]) => `<div class="char">${pic('char_' + id + '_ref', '', c.name)}<h3 style="color:${c.color}">${esc(c.name)} <span class="ko">${esc(c.ko)}</span></h3><div class="say-line say" data-say="catch_${id}" data-text="${esc(c.catchphrase.replace(/[()]/g, ''))}">${esc(c.catchphrase)}</div><div class="ko">${esc(c.personality)}</div></div>`).join('');
  return instr('', 'Meet the friends!', '친구들을 만나요') + `<div class="chars">${cs}</div>`;
};
PAGES.intro_story = (ctx) => PAGES.story({ ...ctx, page: { ...ctx.page, half: 1 } });
PAGES.alphabet = (ctx) => {
  const lts = Object.keys(App.book.letters).map((l) => `<div class="lt say ${letterCls(l)}" data-say="name_${l}" data-text="${l.toUpperCase()}" data-l="${l}">${l.toUpperCase()}<small>${l}</small></div>`).join('');
  return instr('', 'The Alphabet Song', '알파벳 노래를 듣고 따라 불러요') + `<div class="print-hide" style="display:flex;gap:10px"><button class="btn orange main-play" onclick="abcSong()">♪ ABC Song</button><button class="btn" onclick="abcSong(true)">A–Z names</button></div><div class="abc">${lts}</div>`;
};
async function abcSong(namesOnly) {
  Sound.unlock();
  if (!namesOnly) { const ok = await new Promise((r) => { const a = new Audio(ASSETS + 'music/abc_song.mp3'); a.onerror = () => r(false); a.oncanplay = () => { a.play(); r(true); }; }); if (ok) return; toast('노래 파일이 아직 없어 글자 이름으로 대신해요'); }
  await playSeq(Object.keys(App.book.letters).map((l) => ({ id: 'name_' + l, text: l.toUpperCase(), el: document.querySelector(`.abc .lt[data-l="${l}"]`), gap: 120 })));
}
PAGES.alphabet_path = (ctx) => {
  const ls = Object.keys(App.book.letters), mixed = shuffle(ls, 11);
  return instr('', 'Follow A to Z.', 'A부터 Z까지 순서대로 눌러요') + `<div class="path" id="path">${mixed.map((l) => `<div class="lt" data-l="${l}" onclick="pathPick(this)">${l.toUpperCase()}</div>`).join('')}</div><div class="screen-hide" style="color:var(--soft);font-size:14px">A → B → C … 순서대로 선으로 이어요</div>`;
};
let pathNext = 0;
function pathPick(el) { Sound.unlock(); const ls = Object.keys(App.book.letters); if (el.dataset.l === ls[pathNext]) { el.classList.add('done'); Sound.play('name_' + el.dataset.l, el.dataset.l.toUpperCase()); pathNext++; if (pathNext === ls.length) { Sound.sfx('chime'); pathNext = 0; } } else Sound.sfx('no'); }

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
function boardSave() { try { localStorage.setItem(boardKey(), JSON.stringify({ pos: BD.pos, turn: BD.turn })); } catch (e) { /* 저장 못 해도 동작 */ } }
function boardDraw() {
  document.querySelectorAll('.bd-cell .pawns').forEach((p) => { p.innerHTML = ''; });
  for (const t of ['A', 'B']) {
    const c = document.querySelector(`.bd-cell[data-i="${BD.pos[t]}"] .pawns`); if (c) c.insertAdjacentHTML('beforeend', `<span class="pawn ${t}">${t}</span>`);
    const b = $('team' + t); if (b) { b.classList.toggle('on', BD.turn === t); b.classList.toggle('home', BD.pos[t] < 0); }
  }
}
function boardTurn(t) { if (BD.busy) return; BD.turn = t; boardSave(); boardDraw(); }
function boardReset() { if (BD.busy) return; BD.pos = { A: -1, B: -1 }; BD.turn = 'A'; boardSave(); boardDraw(); const m = $('bdMsg'), d = $('dice'); if (m) m.textContent = ''; if (d) d.textContent = '?'; }
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
  boardSave(); boardDraw(); BD.busy = false;
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
  const ls = unitLetters(ctx.unit), halfN = Math.ceil(ls.length / 2);
  const block = (part, seed) => `<div class="pair"><div class="col">${part.map((l) => `<div class="it ${letterCls(l)}" data-u="${l}" onclick="pairPick(this)">${l.toUpperCase()}</div>`).join('')}</div><div class="col">${shuffle(part, seed).map((l) => `<div class="it" data-l="${l}" onclick="pairPick(this)">${l}</div>`).join('')}</div></div>`;
  // 빠진 글자 줄: 큰 글자 한 줄, 작은 글자 한 줄 (빈 칸 자리는 서로 다르게)
  const line = (up, k) => ls.map((l, i) => { const ch = up ? l.toUpperCase() : l; return i % 3 === k ? `<span class="bx blank" onclick="this.textContent='${ch}';Sound.unlock();Sound.play('name_${l}','${l.toUpperCase()}')"></span>` : `<span class="bx">${ch}</span>`; }).join('');
  return instr('A', 'Match the big and small letters.', '큰 글자와 작은 글자를 눌러 이어요') + `<div class="pairs">${block(ls.slice(0, halfN), 3 + ctx.u)}${block(ls.slice(halfN), 5 + ctx.u)}</div>` +
    instr('B', 'Write the missing letters.', '빠진 글자를 써요 (화면에서는 빈 칸을 누르면 글자가 나와요)') + `<div class="missing">${line(true, 2)}</div><div class="missing">${line(false, 1)}</div>`;
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
  const words = (rv.first_letter || rv.bingo.words).slice(0, 8);
  const fl = words.map((w) => { const l = letterOf(w); return `<div class="write-it fl">${pic('word_' + w, '', w)}<div class="box" onclick="this.textContent='${l.toUpperCase()}${l}';Sound.unlock();Sound.play('sound_${l}','${esc(soundText(l))}')"></div><div class="wd">_${esc(w.slice(1))}</div></div>`; }).join('');
  const sort = rv.sort || Object.fromEntries(ls.slice(0, 3).map((l) => [l, L(l).words.slice(0, 2)]));
  const pool = shuffle(Object.values(sort).flat(), 5 + ctx.u);
  const sortHtml = `<div class="sort rv"><div class="pool" id="sortPool" style="grid-column:1/-1">${pool.map((w) => `<span class="wd" onclick="sortPick(this)" data-w="${esc(w)}">${esc(w)}</span>`).join('')}</div>${Object.keys(sort).map((l) => `<div class="bin" data-l="${l}" onclick="sortDrop(this)"><h4 class="${letterCls(l)}">${l.toUpperCase()}${l}</h4><div class="in"></div></div>`).join('')}</div>`;
  return instr('C', 'Write the first letter.', '그림을 보고 첫 글자를 써요 (화면에서는 빈 칸을 누르면 글자가 나와요)') + `<div class="write-row fl-row">${fl}</div>` +
    instr('D', 'Sort the words.', '단어를 눌러 글자 상자에 넣어요') + sortHtml;
};
