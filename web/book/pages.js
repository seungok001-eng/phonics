// Pomi Phonics 웹 교재 — 쪽 종류별 그리기. 각 함수는 ctx 를 받아 쪽 안쪽 HTML 을 돌려준다.
// ctx = { book, unit, b('sb'|'wb'), u, p, page(쪽 명세), pages(쪽 목록), print }
const PAGES = {};

function instr(n, text, ko) { return `<div class="instr">${n ? `<span class="n">${n}</span>` : ''}<span>${esc(text)}</span>${ko ? `<span class="ko">${esc(ko)}</span>` : ''}</div>`; }
function spk(id, text, big) { return `<button class="spk ${big ? 'big' : ''} print-hide" data-say="${esc(id)}" data-text="${esc(text)}" title="듣기">🔊</button>`; }
function lettersBadge(unit) { return `<div class="letters">${unit.letters.map((l) => `<span class="${letterCls(l)}">${l.toUpperCase()}${l}</span>`).join('')}</div>`; }
function avatar(who) {
  if (who === 'narrator') return `<span class="av">📖</span>`;
  if (who === 'both') return `<span class="av">👧👦</span>`;
  return `<span class="av"><img src="${artSrc('char_' + who + '_ref')}" data-blink="${artSrc('char_' + who + '_blink')}" data-talk="${artSrc('char_' + who + '_talk')}" onerror="this.parentElement.classList.add('missing');this.replaceWith(document.createTextNode('${esc(App.book.characters[who]?.name || who)}'))"></span>`;
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
  await playSeq([
    { id: 'name_' + l, text: l.toUpperCase(), el: card?.querySelector('.glyph') }, s, s, { ...s, gap: 400 },
    ...d.words.map((w) => ({ id: 'word_' + w, text: w, el: card?.querySelector(`.w[data-word="${w}"], .w[data-say="word_${w}"]`), gap: 300, before: () => Sound.sfx('pop') })),
  ]);
}
async function playSoundsPage() { for (const l of App.units[App.u].letters) { if (!(await chant(l) ?? true)) return; await sleep(500); } }

// 쓰기: 획순 + 따라 쓰기 줄 + 큰·작은 글자 짝 찾기
PAGES.trace = (ctx) => {
  const rows = ctx.unit.letters.flatMap((l) => [l.toUpperCase(), l]).map((ch) => `
    <div class="trace-row">
      <div class="anim say" data-say="name_${ch.toLowerCase()}" data-text="${ch.toUpperCase()}" onclick="this.classList.remove('go');void this.offsetWidth;this.classList.add('go')">${strokeSvg(ch)}</div>
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
  const items = [];
  for (const l of App.units[App.u].letters) {
    items.push({ id: 'sound_' + l, text: soundText(l), el: document.querySelector(`.word-row .ltr[data-say="sound_${l}"]`), gap: 250 });
    for (const w of L(l).words) items.push({ id: 'word_' + w, text: w, el: document.querySelector(`.word-card[data-word="${w}"]`), gap: 300 });
  }
  await playSeq(items);
}

// 따라 읽기 + 놀이 (소리 잡기)
PAGES.read_play = (ctx) => {
  const cards = ctx.unit.letters.flatMap((l) => L(l).words).map((w) => { const l = letterOf(w); return `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="tr">${wordHtml(w, l)}</div></div>`; }).join('');
  const g = ctx.unit.game;
  return instr(1, App.book.instructions.trace_read, '단어를 따라 쓰고 읽어요') + `<div class="read-rows">${cards}</div>` +
    instr(2, App.book.instructions.lets_play, '소리를 듣고 그 소리로 시작하는 그림을 눌러요') +
    `<div class="game" id="game"><div class="bar"><button class="btn orange main-play" onclick="gameStart()">▶ ${esc(g?.title || 'Catch the sound!')}</button><span id="gameRound"></span><span class="stars" id="gameStars"></span></div>
     <div class="choices" id="gameChoices">${(g?.rounds?.[0]?.pictures || []).map((w) => `<div class="choice">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="msg" id="gameMsg"></div></div>`;
};
const G = { i: 0, score: 0, busy: false };
function gameStart() { Sound.unlock(); G.i = 0; G.score = 0; gameRound(); }
async function gameRound() {
  const g = App.units[App.u].game; if (!g) return;
  if (G.i >= g.rounds.length) { $('gameMsg').textContent = `${App.book.instructions.great_job} ${'⭐'.repeat(G.score)}`; Sound.sfx('chime'); Sound.play('instr_great_job', App.book.instructions.great_job); return; }
  const r = g.rounds[G.i];
  $('gameRound').textContent = `${G.i + 1} / ${g.rounds.length}`; $('gameStars').textContent = '⭐'.repeat(G.score); $('gameMsg').textContent = '';
  $('gameChoices').innerHTML = r.pictures.map((w) => `<div class="choice" onclick="gamePick(this,'${w}')">${pic('word_' + w, '', w)}</div>`).join('');
  G.busy = false;
  await sleep(300); Sound.play('sound_' + r.answer, soundText(r.answer));
}
async function gamePick(el, w) {
  if (G.busy) return;
  const r = App.units[App.u].game.rounds[G.i];
  if (letterOf(w) === r.answer) { G.busy = true; el.classList.add('ok'); Sound.sfx('ok'); G.score++; await Sound.play('word_' + w, w); G.i++; await sleep(500); gameRound(); }
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
  const half = ctx.page.half || 1, st = ctx.unit.story;
  const panels = st.panels.slice((half - 1) * 2, half * 2);
  const sw = half === 1 && ctx.unit.sight_words.length ? `<div class="sw"><b>${esc(App.book.instructions.sight_words)}</b>${ctx.unit.sight_words.map((w) => `<span class="say" data-say="sw_${esc(w)}" data-text="${esc(w)}">${esc(w)}</span>`).join('')}</div>` : '';
  const html = panels.map((pn, i) => {
    const idx = (half - 1) * 2 + i;
    const bubbles = pn.lines.map((ln, k) => `<div class="bubble say ${k % 2 ? 'right' : ''}" data-say="${esc(ln.audio)}" data-text="${esc(ln.text)}" data-panel="${idx}" data-line="${k}">${avatar(ln.who)}<span>${esc(ln.text)}</span></div>`).join('');
    const find = pn.hidden?.length ? `<div class="find"><b>🔍 Find:</b>${pn.hidden.map((w) => `<span class="chip" data-say="word_${esc(w)}" data-text="${esc(w)}" onclick="this.classList.toggle('on')">${esc(w)}</span>`).join('')}</div>` : '';
    const movie = pn.video && !ctx.print ? `<button class="btn blue movie print-hide" onclick="playVideo(${idx})">▶ movie</button>` : '';
    return `<div class="pwrap"><div class="panel" data-panel="${idx}"><div class="scene">${pic(pn.id, '', 'scene')}</div><span class="no">${idx + 1}</span>${movie}<div class="bubbles">${bubbles}</div></div>${find}</div>`;
  }).join('');
  return `<div class="story-top"><h3 style="margin:0;font-size:24px">📖 ${esc(st.title)}</h3><button class="btn orange main-play print-hide" onclick="storyPlay(${half})">▶ ${esc(App.book.instructions.listen_story)}</button>${sw}</div><div class="panels">${html}</div>`;
};
async function storyPlay(half) {
  Sound.unlock();
  const st = App.units[App.u].story; Sound.bgm(st.bgm);
  const items = [];
  st.panels.slice((half - 1) * 2, half * 2).forEach((pn, i) => {
    const idx = (half - 1) * 2 + i;
    pn.lines.forEach((ln, k) => {
      const el = document.querySelector(`.bubble[data-panel="${idx}"][data-line="${k}"]`);
      items.push({ id: ln.audio, text: ln.text, el, gap: 550,
        before: () => { if (k === 0 && pn.video) playVideo(idx, true); talking(el?.querySelector('img'), true); if (ln.sfx) Sound.sfx(ln.sfx); },
        after: () => { talking(el?.querySelector('img'), false); if (ln.pop) { Sound.sfx('pop'); el?.classList.add('playing'); } } });
    });
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

// 유닛 정리: 듣고 동그라미 / 잇기 / 찾아 쓰기
PAGES.check = (ctx) => {
  const c = ctx.unit.check;
  const lc = c.listen_circle.map((it, i) => `<div style="display:flex;align-items:center;gap:10px"><span class="n" style="font-family:Fredoka;font-weight:700">${i + 1}</span>${spk(it.audio, it.audio.startsWith('sound_') ? soundText(it.audio.slice(6)) : it.audio.replace(/^word_/, ''))}<div class="opts" style="flex:1">${it.options.map((o) => o.length === 1 ? `<div class="opt ${letterCls(o)}" onclick="checkPick(this,'${o}','${it.answer}')">${o.toUpperCase()}${o}</div>` : `<div class="opt" onclick="checkPick(this,'${o}','${it.answer}')">${pic('word_' + o, '', o)}<div class="lab">${esc(o)}</div></div>`).join('')}</div></div>`).join('');
  const letters = c.match.map((m) => m.letter), words = shuffle(c.match.map((m) => m.word), 7);
  const match = `<div class="match" id="match"><div class="col">${letters.map((l) => `<div class="it ${letterCls(l)}" data-l="${l}" onclick="matchPick(this)">${l.toUpperCase()}${l}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)" style="font-size:22px">${esc(w)}</div>`).join('')}</div></div>`;
  const fw = c.find_write.map((it) => { const opts = shuffle([it.letter, ...ctx.unit.letters.filter((l) => l !== it.letter)].slice(0, 3), it.word.length); return `<div class="write-it">${pic('word_' + it.word, '', it.word)}<div class="lts">${opts.map((l) => `<span onclick="writePick(this,'${l}','${it.letter}')">${l}</span>`).join('')}</div><div class="box"></div><div style="font-size:14px;color:var(--soft)">${wordHtml(it.word, '')}</div></div>`; }).join('');
  return instr('A', App.book.instructions.listen_circle, '듣고 맞는 것에 동그라미') + `<div class="check-sec">${lc}</div>` +
    instr('B', App.book.instructions.match_read, '글자 → 그림 → 단어 순서로 눌러 이어요') + match +
    instr('C', App.book.instructions.find_circle, '첫소리 글자를 찾아 누르고 써요') + `<div class="write-row">${fw}</div>`;
};
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
  const lines = ctx.unit.story.panels.flatMap((p) => p.lines).filter((l) => l.who !== 'pomi').slice(0, 4);
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
