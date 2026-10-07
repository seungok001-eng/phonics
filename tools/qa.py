# 교재 전체 자동 점검: 모든 권의 학생책·워크북 쪽, 선생님 슬라이드 전부, 인쇄 쪽, 스토리북, 표지, 시험지, 선생님 자료를 헤드리스 크롬으로 열어
#   ① 콘솔 오류·스크립트 오류  ② 없는 파일 요청(404: 그림·소리·음악·글꼴·스크립트)  ③ 쪽(종이·슬라이드) 밖으로 넘친 요소·칸보다 넓은 글자
# 를 모아 build/qa_report.html (쪽별 표 + 작은 스크린샷) 로 낸다. 결과 원본은 build/qa/result.json.
# 실행: python tools/qa.py                → 모든 권 전부 (컴퓨터에 따라 10~25분)
#       python tools/qa.py --book 2       → 2권만
#       python tools/qa.py --units 1,5    → 권마다 그 유닛만 (+ 권 단위 자료)
#       python tools/qa.py --quick        → 유닛 0·1·5·12 와 시험지·자료 몇 개만 (빠른 확인)
#       python tools/qa.py --no-shots     → 스크린샷 없이 (빠르다)
#       python tools/qa.py --workers 6    → 동시에 여는 창 수 (기본 4)
# 분류
#   실제 버그: 콘솔·스크립트 오류 / 소리 없음(공방 계획에도 없는 id) / 계획에 없는 그림 이름 / 글꼴·JSON·스크립트 404 / 넘침
#   대기(아직 만들기 전): 그림 대기(scene_·sb_ 와 공방에 있는 그림) / 소리 대기(공방에 있음·승인 전) / 음악 대기 / QR 대기(pdf.py 가 만듦)
# 소리는 누를 때만 받으므로 화면의 [data-say] 와 코드에 적힌 Sound.play('…') 를 파일과 맞춰 본다.
# 필요: 크롬 또는 엣지. 표준 라이브러리만 쓴다(크롬 원격 디버깅 프로토콜을 직접 말한다).
import base64, glob, html, json, os, queue, re, shutil, socket, struct, subprocess, sys, threading, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
QA_DIR = os.path.join(BUILD, 'qa')
SHOTS = os.path.join(QA_DIR, 'shots')
PORT, DPORT = 8094, 9227                   # 점검용 웹 서버 · 크롬 디버깅 포트
BASE = f'http://127.0.0.1:{PORT}'
VIEW = f'http://localhost:8080'            # 보고서의 링크 (tools/serve.py 를 켜면 열린다)
BROWSERS = [os.path.join(os.environ.get(k, ''), *p) for k, p in [
    ('ProgramFiles', ('Google', 'Chrome', 'Application', 'chrome.exe')),
    ('ProgramFiles(x86)', ('Google', 'Chrome', 'Application', 'chrome.exe')),
    ('ProgramFiles(x86)', ('Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ('ProgramFiles', ('Microsoft', 'Edge', 'Application', 'msedge.exe')),
]]


# ---------- 아주 작은 웹소켓 (크롬 디버깅 연결용: 문자 프레임만) ----------
class WS:
    def __init__(self, url):
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f'GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        self.buf, self.parts = b'', b''
        while b'\r\n\r\n' not in self.buf:
            d = self.s.recv(4096)
            if not d: raise ConnectionError('웹소켓 연결 실패')
            self.buf += d
        head, self.buf = self.buf.split(b'\r\n\r\n', 1)
        if b' 101 ' not in head.split(b'\r\n')[0]: raise ConnectionError(head[:200])

    def _send(self, op, data):
        n, mask = len(data), os.urandom(4)
        hdr = bytes([0x80 | op]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x80 | 127]) + struct.pack('>Q', n))
        body = (int.from_bytes(data, 'big') ^ int.from_bytes((mask * (n // 4 + 1))[:n], 'big')).to_bytes(n, 'big') if n else b''
        self.s.sendall(hdr + mask + body)

    def send(self, text): self._send(0x1, text.encode())

    def _frame(self):   # 버퍼에서 완성된 프레임 하나 (없으면 None)
        b = self.buf
        if len(b) < 2: return None
        ln, i = b[1] & 0x7F, 2
        if ln == 126:
            if len(b) < 4: return None
            ln, i = struct.unpack('>H', b[2:4])[0], 4
        elif ln == 127:
            if len(b) < 10: return None
            ln, i = struct.unpack('>Q', b[2:10])[0], 10
        if len(b) < i + ln: return None
        self.buf = b[i + ln:]
        return b[0] & 0x80, b[0] & 0x0F, b[i:i + ln]

    def recv(self, timeout):
        """메시지 하나(문자열). timeout 초 안에 없으면 None"""
        end = time.time() + timeout
        while True:
            f = self._frame()
            if f:
                fin, op, pl = f
                if op == 0x9: self._send(0xA, pl); continue
                if op == 0x8: raise ConnectionError('연결이 닫혔다')
                self.parts += pl
                if fin:
                    msg, self.parts = self.parts, b''
                    return msg.decode('utf-8', 'replace')
                continue
            left = end - time.time()
            if left <= 0: return None
            self.s.settimeout(left)
            try: d = self.s.recv(1 << 20)
            except socket.timeout: return None
            if not d: raise ConnectionError('연결이 닫혔다')
            self.buf += d


# ---------- 크롬 창 하나 ----------
class Tab:
    def __init__(self, browser_ws):
        r = browser_call(browser_ws, 'Target.createTarget', {'url': 'about:blank', 'newWindow': True})
        self.ws, self.n, self.events = WS(f'ws://127.0.0.1:{DPORT}/devtools/page/{r["targetId"]}'), 0, []
        for m in ('Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'): self.call(m)

    def call(self, method, params=None, timeout=20):
        self.n += 1
        my = self.n
        self.ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            msg = self.ws.recv(end - time.time())
            if msg is None: break
            d = json.loads(msg)
            if d.get('id') == my:
                if 'error' in d: raise RuntimeError(f"{method}: {d['error'].get('message')}")
                return d.get('result', {})
            if 'method' in d: self.events.append(d)
        raise TimeoutError(method)

    def pump(self, secs):   # 이벤트만 받는다
        end = time.time() + secs
        while (left := end - time.time()) > 0:
            msg = self.ws.recv(left)
            if msg is None: return
            d = json.loads(msg)
            if 'method' in d: self.events.append(d)

    def eval(self, expr, timeout=10):
        r = self.call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}, timeout)
        return r.get('result', {}).get('value')


BROWSER_LOCK = threading.Lock()
def browser_call(bws, method, params):
    with BROWSER_LOCK:
        bws.n = getattr(bws, 'n', 0) + 1
        bws.send(json.dumps({'id': bws.n, 'method': method, 'params': params}))
        while True:
            msg = bws.recv(20)
            if msg is None: raise TimeoutError(method)
            d = json.loads(msg)
            if d.get('id') == bws.n:
                if 'error' in d: raise RuntimeError(d['error'])
                return d['result']


# ---------- 화면 안에서 재는 것 ----------
READY_JS = r"""(() => {
  if (document.readyState !== 'complete' || (document.fonts && document.fonts.status !== 'loaded')) return false;
  if (window.PRINT && !window.PRINT_READY) return false;
  if (!document.querySelector('.page, .slide, .sheet, .poster, .sb-page, .bookcard, .menu')) return false;
  return [...document.images].every((i) => i.complete);
})()"""
SAYS_JS = r"""[...new Map([...document.querySelectorAll('[data-say]')].filter((e) => e.dataset.say).map((e) => [e.dataset.say, e.dataset.text || ''])).entries()]"""
SLIDE_N_JS = r"""(() => { const t = document.querySelector('.sl-head .sl-no'); const m = t && t.textContent.match(/(\d+)\s*\/\s*(\d+)\s*$/); return m ? +m[2] : 0; })()"""
# 넘침: 쪽(.page)·슬라이드·종이(.sheet)·포스터 안의 요소가 그 밖(쪽은 꼬리말 위)으로 나갔는지. 넘친 요소는 그 안쪽을 더 보지 않는다.
# min-height 만 있는 종이(수업안 등)는 내용이 늘어나면 다음 장으로 넘어가므로 "몇 쪽 분량" 으로 알린다. 스크롤 상자 안쪽은 보지 않는다.
OVERFLOW_JS = r"""(() => {
  const out = [];
  const name = (el) => { const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''; const t = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 26); return el.tagName.toLowerCase() + (c ? '.' + c : '') + (t ? ' “' + t + '”' : ''); };
  const scroller = (s) => /(auto|scroll)/.test(s.overflowX + s.overflowY);
  const conts = [...document.querySelectorAll('.page, .slide, .sheet, .poster')].filter((c) => !(c.classList.contains('page') && c.closest('.sl-embed')));
  conts.forEach((c, ci) => {
    const r = c.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return;
    const cs = getComputedStyle(c), kind = c.classList.contains('slide') ? '슬라이드' : c.classList.contains('page') ? '쪽' : c.classList.contains('poster') ? '포스터' : '종이';
    const where = kind + (conts.length > 1 ? ' ' + (ci + 1) : '');
    if (cs.overflowY === 'visible' && parseFloat(cs.minHeight) > 0) {
      const mh = parseFloat(cs.minHeight);
      if (c.offsetHeight > mh * 1.03 + 4) out.push({ where, what: `내용이 ${(c.offsetHeight / mh).toFixed(2)}장 분량 — 인쇄하면 다음 장으로 이어짐`, flow: true });
      return;
    }
    const k = r.width / (c.offsetWidth || r.width), foot = c.querySelector(':scope > .ph-foot');
    const lim = { b: (foot ? foot.getBoundingClientRect().top : r.bottom) + 3 * k, r: r.right + 3 * k, l: r.left - 3 * k, t: r.top - 3 * k };
    let n = 0;
    const walk = (el) => {
      for (const ch of el.children) {
        if (ch === foot || n > 6) continue;
        const s = getComputedStyle(ch);
        if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') continue;
        const svg = ch instanceof SVGElement && ch.tagName.toLowerCase() !== 'svg';   // 획순 그림 안의 번호 글자 등은 그림의 일부
        if (svg) continue;
        const e = ch.getBoundingClientRect();
        if (e.width < 1 || e.height < 1) { walk(ch); continue; }
        const over = Math.max(e.bottom - lim.b, e.right - lim.r, lim.l - e.left, lim.t - e.top);
        if (Math.round(over / k) >= 2) { out.push({ where, what: `${name(ch)} — ${Math.round(over / k)}px 밖으로` }); n++; continue; }
        if (s.display !== 'inline' && ch.clientWidth > 0 && ch.scrollWidth > ch.clientWidth + 8 && !/ellipsis/.test(s.textOverflow) && [...ch.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) {
          out.push({ where, what: `${name(ch)} — 글자가 칸보다 ${ch.scrollWidth - ch.clientWidth}px 넓음` }); n++;
        }
        if (!scroller(s)) walk(ch);
      }
    };
    walk(c);
  });
  document.querySelectorAll('.sb-page .band').forEach((b) => { if (b.scrollHeight > b.clientHeight + 4) out.push({ where: '스토리북 글 띠', what: `글이 띠보다 ${b.scrollHeight - b.clientHeight}px 길어 스크롤이 생김` }); });
  return out.slice(0, 12);
})()"""


# ---------- 무엇을 열지 ----------
def J(path, label, group, bk, w=900, h=1250, discover=False):
    return {'path': path, 'label': label, 'group': group, 'book': bk, 'w': w, 'h': h, 'discover': discover}


def page_types(unit, b):
    return [p['type'] for ls in unit.get('lessons', []) for p in ls.get('workbook' if b == 'wb' else 'pages', [])]


def story_list(book, units):
    sb = book.get('storybook')
    if not sb: return []
    out = [('cover', 1)] + [('front', i + 1) for i in range(len(sb.get('front', [])))]
    for x in book['units']:
        u = units.get(x['n'])
        if u: out += [(x['n'], i + 1) for i in range(len(u.get('storybook', {}).get('pages', [])))]
    return out + [('back', i + 1) for i in range(len(sb.get('back', [])))]


def jobs_for_book(bk, cdir, ufilter, quick):
    book = json.load(open(os.path.join(ROOT, 'content', cdir, 'book.json'), encoding='utf-8'))
    units = {}
    for x in book['units']:
        f = os.path.join(ROOT, 'content', cdir, 'units', f"unit{x['n']:02d}.json")
        if os.path.exists(f): units[x['n']] = json.load(open(f, encoding='utf-8'))
    q, tag, jobs = (f'bk={bk}&' if bk > 1 else ''), f'{bk}권', []
    for x in book['units']:
        n, u = x['n'], units.get(x['n'])
        if not u or (ufilter and n not in ufilter): continue
        for b, B in (('sb', '학생책'), ('wb', '워크북')):
            types = page_types(u, b)
            for p, t in enumerate(types, 1):
                jobs.append(J(f'/web/book/?{q}b={b}&u={n}&p={p}&nooverlay=1', f'{tag} {B} U{n} p{p} · {t}', B, bk))
                jobs.append(J(f'/web/book/?{q}b={b}&u={n}&p={p}&t=1&s=0&nooverlay=1', f'{tag} 수업 {B} U{n} p{p} · {t} · 1', '수업 화면', bk, 1600, 1000, True))
            if types: jobs.append(J(f'/web/book/print.html?{q}b={b}&u={n}', f'{tag} 인쇄 {B} U{n}', '인쇄', bk))
        if u.get('letters') or u.get('families'):
            for t, name in (('lesson-plan', '수업안'), ('flashcards', '플래시카드'), ('letter', '가정통신문')):
                if quick and n != 1: continue
                jobs.append(J(f'/web/teacher/{t}.html?{q}u={n}', f'{tag} {name} U{n}', '선생님 자료', bk))
            if not quick or n == 1: jobs.append(J(f'/web/teacher/test.html?{q}scope=u{n}', f'{tag} 시험지 U{n}', '시험지', bk))
    # 스토리북 (보기·인쇄) · 표지
    for u, p in story_list(book, units):
        if ufilter and isinstance(u, int) and u not in ufilter: continue
        jobs.append(J(f'/web/book/story.html?{q}u={u}&p={p}&nooverlay=1', f'{tag} 스토리북 {u} p{p}', '스토리북', bk, 1600, 900))
    if book.get('storybook'): jobs.append(J(f'/web/book/print.html?{q}b=story', f'{tag} 인쇄 스토리북', '인쇄', bk))
    for b in ('sb', 'wb', 'story'): jobs.append(J(f'/web/book/cover.html?{q}b={b}', f'{tag} 표지 {b}', '인쇄', bk))
    # 시험지 수준 1~3 · 말하기 · 정답지 · 흑백
    scopes = ['r1'] if quick else ['r1', 'r2', 'all']
    for sc in scopes:
        for lv in (1, 2, 3): jobs.append(J(f'/web/teacher/test.html?{q}scope={sc}&level={lv}&set=A', f'{tag} 시험지 {sc} L{lv}', '시험지', bk))
    jobs += [J(f'/web/teacher/test.html?{q}scope=r1&speaking=1', f'{tag} 말하기 체크리스트', '시험지', bk),
             J(f'/web/teacher/test.html?{q}scope=all&level=3&set=B&key=1&bw=1', f'{tag} 시험지 정답·흑백', '시험지', bk)]
    # 권 단위 선생님 자료
    bq = f'?bk={bk}' if bk > 1 else ''
    for t, name in (('syllabus', '진도표'), ('story-guide', '이야기 안내서'), ('story-map', '이야기 지도'), ('answers', '정답지')):
        jobs.append(J(f'/web/teacher/{t}.html{bq}', f'{tag} {name}', '선생님 자료', bk, 1200 if t != 'story-map' else 1700, 1250))
    return jobs


# ---------- 없는 파일 나누기 ----------
def planned_ids():
    art = {os.path.basename(d.rstrip('/\\')) for d in glob.glob(os.path.join(ROOT, 'art-src', 'forge', '*', '*', ''))}
    audio = {os.path.basename(d.rstrip('/\\')) for d in glob.glob(os.path.join(ROOT, 'audio-src', 'forge', '*', ''))}
    return art, audio


ART_PLAN, AUDIO_PLAN = planned_ids()
def sort_missing(url):
    """(분류, 이름) — None 이면 무시해도 되는 요청"""
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    stem = os.path.splitext(os.path.basename(path))[0]
    if path.startswith('/web/content/') or path == '/favicon.ico': return None   # 내용 폴더 찾기(첫 후보) — 정상
    if re.match(r'/content/b\d+/', path): return ('내용 대기', path)                  # books.json 에 있지만 아직 쓰는 중인 권
    if '/assets/art/' in path or '/build/art_small/' in path:
        if re.match(r'(scene_|sb\d*_|cast_sheet)', stem): return ('그림 대기', stem)
        return ('그림 대기', stem) if stem in ART_PLAN else ('계획에 없는 그림', stem)
    if '/assets/music/' in path: return ('음악 대기', stem)
    if '/assets/audio/' in path: return ('소리 대기', stem) if stem in AUDIO_PLAN else ('소리 없음', stem)
    if '/assets/qr/' in path: return ('QR 대기', stem)
    if '/assets/video/' in path: return ('영상 대기', stem)
    return ('없는 파일', path)


def check_audio(says):
    """화면의 [data-say] 소리 id → 파일이 없으면 (분류, id, 임시 글)"""
    out = []
    for sid, text in says:
        if os.path.exists(os.path.join(ROOT, 'web', 'assets', 'audio', sid + '.mp3')): continue
        out.append(('소리 대기' if sid in AUDIO_PLAN else '소리 없음', sid, text))
    return out


BUG = {'콘솔 오류', '스크립트 오류', '소리 없음', '계획에 없는 그림', '없는 파일', '넘침', '열기 실패'}
WAIT = ['그림 대기', '소리 대기', '음악 대기', 'QR 대기', '영상 대기', '내용 대기', '여러 장 문서']


# ---------- 한 화면 열어 보기 ----------
def visit(tab, job, shot_path):
    tab.pump(0.05); tab.events = []
    tab.call('Emulation.setDeviceMetricsOverride', {'width': job['w'], 'height': job['h'], 'deviceScaleFactor': 1, 'mobile': False})
    nav = tab.call('Page.navigate', {'url': BASE + job['path']})
    loader = nav.get('loaderId')
    end = time.time() + 20
    while time.time() < end and not any(e['method'] == 'Page.loadEventFired' for e in tab.events): tab.pump(0.25)
    end = time.time() + 15
    while time.time() < end:
        try:
            if tab.eval(READY_JS, 5): break
        except Exception: pass
        tab.pump(0.25)
    tab.pump(0.5)   # 늦게 오는 그림 요청
    res = {**job, 'issues': [], 'waits': []}
    res['overflow'] = tab.eval(OVERFLOW_JS, 15) or []
    says = tab.eval(SAYS_JS) or []
    if job['discover']: res['slide_n'] = tab.eval(SLIDE_N_JS) or 1
    if shot_path:
        data = tab.call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 55, 'clip': {'x': 0, 'y': 0, 'width': job['w'], 'height': job['h'], 'scale': 0.28}})['data']
        open(shot_path, 'wb').write(base64.b64decode(data))
        res['shot'] = os.path.relpath(shot_path, BUILD).replace('\\', '/')
    tab.pump(0.1)
    urls = {}
    for e in tab.events:
        m, p = e['method'], e['params']
        if m == 'Network.requestWillBeSent': urls[p['requestId']] = p['request']['url']
        elif m == 'Runtime.exceptionThrown':
            d = p['exceptionDetails']
            res['issues'].append(('스크립트 오류', ((d.get('exception') or {}).get('description') or d.get('text') or '').split('\n')[0][:300]))
        elif m == 'Runtime.consoleAPICalled' and p['type'] in ('error', 'assert'):
            res['issues'].append(('콘솔 오류', ' '.join(str(a.get('value', a.get('description', ''))) for a in p['args'])[:300]))
        elif m == 'Log.entryAdded' and p['entry']['level'] == 'error' and p['entry'].get('source') not in ('network',):
            res['issues'].append(('콘솔 오류', p['entry']['text'][:300]))
        elif m in ('Network.responseReceived', 'Network.loadingFailed'):
            if loader and p.get('loaderId') and p['loaderId'] != loader: continue   # 앞 화면의 늦은 요청
            if m == 'Network.responseReceived':
                if p['response']['status'] < 400: continue
                url, why = p['response']['url'], str(p['response']['status'])
            else:
                if p.get('canceled') or 'ERR_ABORTED' in p.get('errorText', ''): continue
                url, why = urls.get(p['requestId'], '?'), p.get('errorText', '')
            k = sort_missing(url)
            if not k: continue
            (res['issues'] if k[0] in BUG else res['waits']).append((k[0], k[1] if k[0] != '없는 파일' else f'{k[1]} ({why})'))
    for kind, sid, text in check_audio(says):
        (res['issues'] if kind in BUG else res['waits']).append((kind, sid + ('' if text else ' — 임시 글도 없어 아무 소리도 안 남')))
    for o in res['overflow']: (res['waits'] if o.get('flow') else res['issues']).append(('여러 장 문서' if o.get('flow') else '넘침', f"{o['where']}: {o['what']}"))
    res['issues'] = sorted(set(map(tuple, res['issues'])))
    res['waits'] = sorted(set(map(tuple, res['waits'])))
    return res


def worker(bws, jq, results, shots, lock, prog):
    tab = Tab(bws)
    while True:
        job = jq.get()
        if job is None: jq.task_done(); return
        shot = None
        if shots:
            with lock: prog['shot'] += 1; k = prog['shot']
            shot = os.path.join(SHOTS, f'{k:04d}.jpg')
        try:
            r = visit(tab, job, shot)
        except Exception as e:   # 창이 망가지면 새로 연다
            r = {**job, 'issues': [('열기 실패', f'{type(e).__name__}: {e}'[:200])], 'waits': [], 'overflow': []}
            try: tab = Tab(bws)
            except Exception: pass
        if job['discover'] and r.get('slide_n', 1) > 1:
            for s in range(1, r['slide_n']):
                jq.put({**job, 'path': job['path'].replace('&s=0&', f'&s={s}&'), 'label': re.sub(r' · 1$', f' · {s + 1}', job['label']), 'discover': False})
        with lock:
            results.append(r); prog['done'] += 1
            if prog['done'] % 25 == 0: print(f"  {prog['done']} 화면 …", flush=True)
        jq.task_done()


# ---------- 정적 점검: 코드에 적힌 소리·음악 ----------
def static_checks(books):
    out = {'소리 없음': set(), '소리 대기': set(), '음악 대기': set()}
    code = ''
    for f in glob.glob(os.path.join(ROOT, 'web', 'book', '*.js')) + glob.glob(os.path.join(ROOT, 'web', 'book', '*.html')) + glob.glob(os.path.join(ROOT, 'web', 'teacher', '*.html')) + [os.path.join(ROOT, 'web', 'index.html')]:
        code += open(f, encoding='utf-8').read()
    for sid in set(re.findall(r"Sound\.play\('([a-z][a-z0-9_]*)'\s*,", code)):   # 'word_' + w 처럼 이어 붙이는 것은 빼고 글자 그대로인 id 만
        if not os.path.exists(os.path.join(ROOT, 'web', 'assets', 'audio', sid + '.mp3')): out['소리 대기' if sid in AUDIO_PLAN else '소리 없음'].add(sid)
    music = set(re.findall(r"(?:Sound\.bgm|chantTrack)\('([a-z][a-z0-9_]*)'", code)) | set(re.findall(r"music/([a-z][a-z0-9_]*)\.mp3", code))
    for bk, cdir in books:
        for f in [os.path.join(ROOT, 'content', cdir, 'book.json')] + glob.glob(os.path.join(ROOT, 'content', cdir, 'units', '*.json')):
            music |= set(re.findall(r'"bgm"\s*:\s*"([^"]+)"', open(f, encoding='utf-8').read()))
    for m in music:
        if not os.path.exists(os.path.join(ROOT, 'web', 'assets', 'music', m + '.mp3')): out['음악 대기'].add(m)
    return {k: sorted(v) for k, v in out.items()}


# ---------- 보고서 ----------
def report(results, static, secs):
    esc = html.escape
    bugs = [r for r in results if r['issues']]
    by_kind, waits = {}, {}
    for r in results:
        for k, what in r['issues']: by_kind.setdefault(k, []).append((r, what))
        for k, what in r['waits']: waits.setdefault(k, {}).setdefault(what, []).append(r)
    for k in ('소리 없음', '소리 대기', '음악 대기'):
        for sid in static.get(k, []): (by_kind.setdefault(k, []).append(({'label': '코드에 적힌 소리·음악', 'path': '', 'group': '코드', 'book': 0}, sid)) if k in BUG else waits.setdefault(k, {}).setdefault(sid, []))
    link = lambda r: f'<a href="{VIEW}{esc(r["path"])}" target="_blank">{esc(r["label"])}</a>' if r.get('path') else esc(r['label'])
    shot = lambda r: f'<img src="{esc(r["shot"])}" loading="lazy">' if r.get('shot') else ''
    cards = ''.join(f'<div class="card bad"><b>{len({id(r) for r, _ in by_kind.get(k, [])}) if k != "소리 없음" else len({w for _, w in by_kind.get(k, [])})}</b>{k}</div>' for k in ['콘솔 오류', '스크립트 오류', '넘침', '소리 없음', '계획에 없는 그림', '없는 파일', '열기 실패'] if by_kind.get(k))
    cards += ''.join(f'<div class="card wait"><b>{len(waits[k])}</b>{k}</div>' for k in WAIT if waits.get(k))
    bug_rows = ''
    for k in ['스크립트 오류', '콘솔 오류', '없는 파일', '계획에 없는 그림', '소리 없음', '넘침', '열기 실패']:
        items = by_kind.get(k, [])
        if not items: continue
        if k in ('소리 없음', '계획에 없는 그림'):   # 같은 id 를 모아서
            ids = {}
            for r, w in items: ids.setdefault(w, []).append(r)
            bug_rows += f'<h3>{k} <small>{len(ids)}개</small></h3><table><tr><th>이름</th><th>쓰는 곳</th></tr>' + ''.join(f'<tr><td><code>{esc(w)}</code></td><td>{", ".join(link(r) for r in rs[:6])}{" …" if len(rs) > 6 else ""}</td></tr>' for w, rs in sorted(ids.items())) + '</table>'
            continue
        bug_rows += f'<h3>{k} <small>{len(items)}건</small></h3><table><tr><th>화면</th><th>무엇</th><th></th></tr>' + ''.join(f'<tr><td>{link(r)}</td><td>{esc(w)}</td><td class="sh">{shot(r)}</td></tr>' for r, w in items[:400]) + '</table>'
    wait_html = ''.join(f'<details><summary>{k} — {len(v)}개</summary><div class="ids">' + ''.join(f'<code title="{len(rs)}곳">{esc(w)}</code>' for w, rs in sorted(v.items())) + '</div></details>' for k, v in ((k, waits[k]) for k in WAIT if waits.get(k)))
    groups = {}
    for r in sorted(results, key=lambda r: (r['book'], r['group'], r['label'])): groups.setdefault((r['book'], r['group']), []).append(r)
    grid = ''.join(f'<h3>{bk}권 · {g} <small>{len(rs)}</small></h3><div class="grid">' + ''.join(f'<div class="cell {"bad" if r["issues"] else ""}">{shot(r)}<div class="lab">{"✗" if r["issues"] else "✓"} {link(r)}</div></div>' for r in rs) + '</div>' for (bk, g), rs in groups.items())
    page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>교재 자동 점검</title><style>
body {{ font-family: 'Malgun Gothic', sans-serif; margin: 20px; color: #3B2F2F; background: #FFF9EE; }} h1 {{ color: #F28C38; margin: 0 0 4px; }} h2 {{ margin-top: 28px; border-bottom: 3px solid #E8DCC6; }} h3 small, .sub {{ color: #8C7B6B; font-weight: 400; }}
.cards {{ display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0; }} .card {{ border-radius: 12px; padding: 8px 14px; background: #fff; border: 2px solid #E8DCC6; }} .card b {{ font-size: 26px; display: block; }}
.card.bad {{ border-color: #E05A5A; }} .card.bad b {{ color: #E05A5A; }} .card.wait b {{ color: #4FA3E0; }} .ok {{ color: #4CAF50; font-weight: 700; }}
table {{ border-collapse: collapse; width: 100%; background: #fff; margin-bottom: 12px; }} th, td {{ border: 1px solid #E8DCC6; padding: 4px 8px; text-align: left; vertical-align: top; font-size: 13px; }} th {{ background: #FFF3E6; }}
td.sh img {{ width: 160px; border: 1px solid #ddd; }} code {{ background: #fff; border: 1px solid #E8DCC6; border-radius: 6px; padding: 0 5px; margin: 2px; display: inline-block; font-size: 12px; }}
details {{ background: #fff; border: 2px solid #E8DCC6; border-radius: 10px; padding: 6px 12px; margin: 6px 0; }} summary {{ cursor: pointer; font-weight: 700; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }} .cell {{ background: #fff; border: 2px solid #E8DCC6; border-radius: 8px; padding: 4px; font-size: 11px; }} .cell img {{ width: 100%; display: block; }} .cell.bad {{ border-color: #E05A5A; }}
.only-bad .cell:not(.bad) {{ display: none; }} button {{ font: inherit; padding: 4px 12px; border-radius: 8px; border: 2px solid #E8DCC6; background: #fff; cursor: pointer; }}
</style></head><body><h1>교재 자동 점검</h1><div class="sub">{time.strftime('%Y-%m-%d %H:%M')} · 화면 {len(results)}개 · {secs // 60}분 {secs % 60}초 · 링크는 <code>python tools/serve.py</code> 를 켜면 열려요</div>
<div class="cards">{cards or '<div class="card"><b class="ok">0</b>문제 없음</div>'}</div>
<h2>고쳐야 할 것 <span class="sub">({len(bugs)}개 화면)</span></h2>{bug_rows or '<p class="ok">없어요 🎉</p>'}
<h2>대기 <span class="sub">— 그림·소리·음악을 만들면 저절로 없어져요</span></h2>{wait_html or '<p class="ok">없어요</p>'}
<h2>모든 화면 <button onclick="document.body.classList.toggle('only-bad')">문제 있는 화면만 / 전부</button></h2>{grid}
</body></html>"""
    out = os.path.join(BUILD, 'qa_report.html')
    open(out, 'w', encoding='utf-8').write(page)
    return out, by_kind, waits


def main():
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    quick, shots, workers = '--quick' in args, '--no-shots' not in args, int(opt('--workers') or 4)
    ufilter = {0, 1, 5, 12} if quick else ({int(x) for x in opt('--units').split(',')} if opt('--units') else None)
    bp = os.path.join(ROOT, 'content', 'books.json')
    books = [(b['n'], b.get('dir', '')) for b in (json.load(open(bp, encoding='utf-8')) if os.path.exists(bp) else [{'n': 1, 'dir': ''}])]
    books = [(n, d) for n, d in books if os.path.exists(os.path.join(ROOT, 'content', d, 'book.json')) and (not opt('--book') or n == int(opt('--book')))]
    jobs = [J('/web/index.html', '홈페이지', '홈페이지', 0, 1200, 1400)]
    for bk, d in books: jobs += jobs_for_book(bk, d, ufilter, quick)
    exe = next((b for b in BROWSERS if b and os.path.exists(b)), None)
    if not exe: raise SystemExit('크롬이나 엣지를 찾지 못했다')
    shutil.rmtree(QA_DIR, ignore_errors=True); os.makedirs(SHOTS, exist_ok=True)
    # 점검용 웹 서버 (tools/serve.py 와 같은 방식) + 크롬
    import importlib.util
    from http.server import ThreadingHTTPServer
    spec = importlib.util.spec_from_file_location('serve', os.path.join(ROOT, 'tools', 'serve.py'))
    sm = importlib.util.module_from_spec(spec); spec.loader.exec_module(sm)
    class Srv(ThreadingHTTPServer): request_queue_size, daemon_threads = 128, True   # 창 여러 개가 JSON 을 한꺼번에 받아도 거절하지 않게
    srv = Srv(('127.0.0.1', PORT), sm.H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = os.path.join(QA_DIR, 'profile')
    chrome = subprocess.Popen([exe, '--headless=new', f'--remote-debugging-port={DPORT}', f'--user-data-dir={prof}', '--disable-gpu', '--no-first-run',
                               '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--disable-background-timer-throttling',
                               '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    try:
        for _ in range(60):
            try: ver = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{DPORT}/json/version', timeout=2).read()); break
            except Exception: time.sleep(0.5)
        else: raise SystemExit('크롬 디버깅 연결을 못 했다')
        bws = WS(ver['webSocketDebuggerUrl'])
        print(f'점검 시작: 처음 {len(jobs)} 화면 (+ 슬라이드는 열면서 늘어남), 창 {workers}개', flush=True)
        jq, results, lock, prog = queue.Queue(), [], threading.Lock(), {'done': 0, 'shot': 0}
        for j in jobs: jq.put(j)
        ths = [threading.Thread(target=worker, args=(bws, jq, results, shots, lock, prog), daemon=True) for _ in range(workers)]
        for t in ths: t.start()
        jq.join()
        for _ in ths: jq.put(None)
        for t in ths: t.join(5)
    finally:
        chrome.terminate(); srv.shutdown()
    static = static_checks(books)
    secs = int(time.time() - t0)
    json.dump({'results': results, 'static': static}, open(os.path.join(QA_DIR, 'result.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=list)
    out, by_kind, waits = report(results, static, secs)
    print(f'화면 {len(results)}개, {secs // 60}분 {secs % 60}초')
    for k in sorted(by_kind): print(f'  ✗ {k}: {len(by_kind[k])}')
    for k in WAIT:
        if waits.get(k): print(f'  … {k}: {len(waits[k])}개')
    print(f'보고서: {out}')


if __name__ == '__main__':
    main()
