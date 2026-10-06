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
// 따라 읽기 한 장 + 놀이 한 장
TEACH.read_play = {
  count: () => 2,
  render: (ctx, s) => {
    if (s === 0) {
      const cards = ctx.unit.letters.flatMap((l) => L(l).words).map((w) => { const l = letterOf(w); return `<div class="read-card say" data-say="word_${esc(w)}" data-text="${esc(w)}">${pic('word_' + w, '', w)}<div class="tr">${wordHtml(w, l)}</div></div>`; }).join('');
      return tWrap(ctx, App.book.instructions.trace_read, '단어를 따라 쓰고 읽어요', 0, 2, `<div class="read-rows sl-read">${cards}</div>`);
    }
    const g = ctx.unit.game;
    return tWrap(ctx, App.book.instructions.lets_play, '소리를 듣고 그 소리로 시작하는 그림을 눌러요', 1, 2, `<div class="game sl-game" id="game"><div class="bar"><button class="btn orange big main-play" onclick="gameStart()">▶ ${esc(g?.title || 'Catch the sound!')}</button><span id="gameRound"></span><span class="stars" id="gameStars"></span></div>
      <div class="choices" id="gameChoices">${(g?.rounds?.[0]?.pictures || []).map((w) => `<div class="choice">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="msg" id="gameMsg"></div></div>`);
  },
};
// 듣고 가리키기: 한 장
TEACH.listen_point = {
  count: () => 1,
  render: (ctx) => {
    const rows = ctx.unit.letters.map((l) => `<div class="lp-row" data-letter="${l}"><div class="ltr say ${letterCls(l)}" data-say="sound_${l}" data-text="${esc(soundText(l))}">${l.toUpperCase()}<small>${l}</small></div>${L(l).words.map((w) => `<div class="cell say" data-say="word_${esc(w)}" data-text="${esc(w)}" data-word="${w}">${pic('word_' + w, '', w)}<div class="wd">${wordHtml(w, l)}</div><span class="chk" onclick="event.stopPropagation();this.classList.toggle('on');Sound.sfx('tap')"></span></div>`).join('')}</div>`).join('');
    return tWrap(ctx, App.book.instructions.listen_point, '듣고 글자와 그림을 가리키며 따라 말해요 · 말한 단어는 네모에 표시', 0, 1, `<div class="sl-tools"><button class="btn orange big main-play" onclick="listenPointAll()">▶ Listen</button></div><div class="lp-table sl-lp">${rows}</div>`);
  },
};
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
      <div class="sl-story-side">${sw}<div class="sl-tools"><button class="btn orange big main-play" onclick="storyPlayPanel(${idx})">▶ ${esc(App.book.instructions.listen_story)}</button>${movie}</div><div class="bubbles-col">${bubbles}</div>${find}</div></div>`;
    return tWrap(ctx, st.title, '▶ 를 누르면 음악과 함께 대사가 나와요. 말풍선을 눌러 따라 말해요', s, n, body);
  },
};
TEACH.intro_story = { count: (ctx) => ctx.unit.story.panels.length, render: (ctx, s) => TEACH.story.render({ ...ctx, page: { ...ctx.page, half: 1 } }, s) };
// 정리: A·B·C 한 장씩
TEACH.check = {
  count: () => 3,
  render: (ctx, s) => {
    const c = ctx.unit.check;
    if (s === 0) {
      const lc = c.listen_circle.map((it, i) => `<div class="sl-lc"><span class="n">${i + 1}</span>${spk(it.audio, it.audio.startsWith('sound_') ? soundText(it.audio.slice(6)) : it.audio.replace(/^word_/, ''), true)}<div class="opts">${it.options.map((o) => o.length === 1 ? `<div class="opt ${letterCls(o)}" onclick="checkPick(this,'${o}','${it.answer}')">${o.toUpperCase()}${o}</div>` : `<div class="opt" onclick="checkPick(this,'${o}','${it.answer}')">${pic('word_' + o, '', o)}<div class="lab">${esc(o)}</div></div>`).join('')}</div></div>`).join('');
      return tWrap(ctx, 'A. ' + App.book.instructions.listen_circle, '🔊 를 누르고 맞는 것을 골라요', 0, 3, `<div class="sl-check">${lc}</div>`);
    }
    if (s === 1) {
      const letters = c.match.map((m) => m.letter), words = shuffle(c.match.map((m) => m.word), 7);
      const match = `<div class="match sl-match" id="match"><div class="col">${letters.map((l) => `<div class="it ${letterCls(l)}" data-l="${l}" onclick="matchPick(this)">${l.toUpperCase()}${l}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)">${pic('word_' + w, '', w)}</div>`).join('')}</div><div class="col">${words.map((w) => `<div class="it" data-w="${w}" onclick="matchPick(this)">${esc(w)}</div>`).join('')}</div></div>`;
      return tWrap(ctx, 'B. ' + App.book.instructions.match_read, '글자 → 그림 → 단어 순서로 눌러 이어요', 1, 3, match);
    }
    const fw = c.find_write.map((it) => { const opts = shuffle([it.letter, ...ctx.unit.letters.filter((l) => l !== it.letter)].slice(0, 3), it.word.length); return `<div class="write-it">${pic('word_' + it.word, '', it.word)}<div class="lts">${opts.map((l) => `<span onclick="writePick(this,'${l}','${it.letter}')">${l}</span>`).join('')}</div><div class="box"></div><div class="wd">${esc(it.word)}</div></div>`; }).join('');
    return tWrap(ctx, 'C. ' + App.book.instructions.find_circle, '첫소리 글자를 찾아 누르고 써요', 2, 3, `<div class="write-row sl-write">${fw}</div>`);
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
  const pn = st.panels[idx], items = [];
  pn.lines.forEach((ln, k) => {
    const el = document.querySelector(`.bubble[data-panel="${idx}"][data-line="${k}"]`);
    items.push({ id: ln.audio, text: ln.text, el, gap: 550,
      before: () => { if (k === 0 && pn.video) playVideo(idx, true); talking(el?.querySelector('img'), true); if (ln.sfx) Sound.sfx(ln.sfx); },
      after: () => { talking(el?.querySelector('img'), false); if (ln.pop) { Sound.sfx('pop'); el?.classList.add('playing'); } } });
  });
  await playSeq(items);
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
