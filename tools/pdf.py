# PDF 뽑기: 웹 교재의 인쇄 쪽(web/book/print.html)을 크롬/엣지(헤드리스)로 PDF 로 만든다. 쪽마다 QR 도 만든다.
# 실행: python tools/pdf.py            → 있는 유닛 전부 (학생책·워크북 A4) + 스토리북 (A5 가로)
#       python tools/pdf.py 1          → 1유닛만
#       python tools/pdf.py story      → 스토리북만
#       python tools/pdf.py tests      → 시험지 묶음만 (PomiPhonics1_Tests_Units.pdf: 유닛마다 시험지+정답지 / _Tests_Review.pdf: 복습·전체 × 수준 × A/B + 정답지 + 말하기 체크리스트)
#       python tools/pdf.py --press    → 인쇄소용: 사방 3mm 도련 + 재단선 판형(A4 → 216×303mm, A5 가로 → 216×154mm) 을 web/pdf/press/ 에, 표지 PDF 도 함께
#       python tools/pdf.py --book 2   → 2권(content/b2/): 파일 이름 PomiPhonics2_..., QR 이름 b2_..., 주소에 &bk=2. index.json 항목에 "book": 2
# 결과: web/pdf/PomiPhonics1_SB_Unit01.pdf, ..._WB_Unit01.pdf, ..._Storybook.pdf, ..._Tests_*.pdf, web/pdf/index.json (홈페이지 목록용, 있던 목록에 합친다)
#       web/pdf/press/ 에는 같은 이름 + PomiPhonics1_SB_Cover.pdf 등 표지
# 필요: pip install qrcode (한 번), 크롬 또는 엣지.
import json, os, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'pdf')   # 홈페이지에서 바로 내려받게 web/ 안에 둔다 (git 에 올라간다, 유닛당 1MB 안팎)
QR_DIR = os.path.join(ROOT, 'web', 'assets', 'qr')
PORT = 8099
BROWSERS = [os.path.join(os.environ.get(k, ''), *p) for k, p in [
    ('ProgramFiles', ('Google', 'Chrome', 'Application', 'chrome.exe')),
    ('ProgramFiles(x86)', ('Google', 'Chrome', 'Application', 'chrome.exe')),
    ('ProgramFiles(x86)', ('Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ('ProgramFiles', ('Microsoft', 'Edge', 'Application', 'msedge.exe')),
]]


def browser():
    for b in BROWSERS:
        if b and os.path.exists(b): return b
    raise SystemExit('크롬이나 엣지를 찾지 못했다')


def page_count(unit, b):
    n = 0
    for ls in unit.get('lessons', []):
        n += len(ls.get('workbook' if b == 'wb' else 'pages', []))
    return n


def make_qr(url, name):
    """QR 한 장: web/assets/qr/<name>.png 에 url 을. qrcode 가 없으면 건너뛴다."""
    try:
        import qrcode
    except ImportError:
        print('qrcode 패키지가 없어 QR 을 건너뛴다 (pip install qrcode)'); return
    os.makedirs(QR_DIR, exist_ok=True)
    fn = os.path.join(QR_DIR, f'{name}.png')
    if os.path.exists(fn): return
    img = qrcode.make(url, box_size=4, border=1)
    img.save(fn)


def story_keys(book, units, bk=1):
    """스토리북 쪽 순서(표지 → 앞 → 유닛 → 뒤)와 QR 이름·주소. web/book/app.js 의 storyPages()·storyKey() 와 같은 규칙 (2권은 b2_ 앞붙이, &bk=2)."""
    sb = book.get('storybook')
    if not sb: return []
    out = [('cover', 1)]
    out += [('front', i + 1) for i in range(len(sb.get('front', [])))]
    for x in book['units']:
        u = units.get(x['n'])
        if u: out += [(x['n'], i + 1) for i in range(len(u.get('storybook', {}).get('pages', [])))]
    out += [('back', i + 1) for i in range(len(sb.get('back', [])))]
    qk, bq = (f'b{bk}_', f'&bk={bk}') if bk > 1 else ('', '')
    return [(qk + (f'story_u{u:02d}_p{p}' if isinstance(u, int) else f'story_{u}_p{p}'), f"{book['site_base']}/book/story.html?u={u}&p={p}{bq}") for u, p in out]


def small_art(max_px=360):
    """단어·선 그림 축소본(build/art_small/, git 밖): 시험지 PDF 는 그림이 작게 들어가므로 원본(장당 800KB)을 그대로 넣으면 60MB 가 넘는다.
    Pillow 가 없으면 None (원본을 쓴다)."""
    try:
        from PIL import Image
    except ImportError:
        print('Pillow 가 없어 시험지 PDF 에 원본 그림을 쓴다 (pip install pillow 하면 가벼워진다)'); return None
    src = os.path.join(ROOT, 'web', 'assets', 'art'); dst = os.path.join(ROOT, 'build', 'art_small'); os.makedirs(dst, exist_ok=True)
    for fn in os.listdir(src):
        if not (fn.startswith('word_') or fn.startswith('line_')) or not fn.endswith('.png'): continue
        sp, dp = os.path.join(src, fn), os.path.join(dst, fn)
        if os.path.exists(dp) and os.path.getmtime(dp) >= os.path.getmtime(sp): continue
        im = Image.open(sp).convert('RGBA'); im.thumbnail((max_px, max_px))
        im.quantize(160, method=Image.Quantize.FASTOCTREE).save(dp, optimize=True)   # 색 160가지 팔레트로 (투명 유지) — 크기 1/4
    return '../../build/art_small/'   # web/teacher/ 에서 본 상대 경로


def mid_art(max_px=1000):
    """교재 PDF 용 축소본(build/art_mid/, git 밖): 원본(장당 0.5~1MB)을 그대로 넣으면 유닛 하나가 15~40MB 가 된다. 1000px 이면 A4 에 150dpi 쯤."""
    try:
        from PIL import Image
    except ImportError:
        print('Pillow 가 없어 교재 PDF 에 원본 그림을 쓴다'); return None
    src = os.path.join(ROOT, 'web', 'assets', 'art'); dst = os.path.join(ROOT, 'build', 'art_mid'); os.makedirs(dst, exist_ok=True)
    for fn in os.listdir(src):
        sp, dp = os.path.join(src, fn), os.path.join(dst, fn)
        if not os.path.isfile(sp) or (os.path.exists(dp) and os.path.getmtime(dp) >= os.path.getmtime(sp)): continue
        try:
            im = Image.open(sp)
            if fn.lower().endswith('.png'):
                im = im.convert('RGBA'); im.thumbnail((max_px, max_px))
                im.quantize(200, method=Image.Quantize.FASTOCTREE).save(dp, optimize=True)
            else:
                im = im.convert('RGB'); im.thumbnail((max_px, max_px)); im.save(dp, quality=82, optimize=True)
        except Exception as e:
            print('축소 실패', fn, e)
    return '../../build/art_mid/'   # web/book/ 에서 본 상대 경로


def serve():
    import importlib.util
    spec = importlib.util.spec_from_file_location('serve', os.path.join(ROOT, 'tools', 'serve.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    from http.server import ThreadingHTTPServer
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), m.H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def print_pdf(exe, url, out, budget=20000):
    # 헤드리스 인쇄. 쪽이 JSON 을 읽어 그리는 데 시간이 걸리니 가상 시간 예산을 넉넉히 준다 (스토리북은 그림 40장이라 더)
    cmd = [exe, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
           f'--virtual-time-budget={budget}', f'--print-to-pdf={out}', url]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)   # 크롬 출력에 cp949 로 못 읽는 글자가 있어도 죽지 않게
    if not os.path.exists(out):
        raise RuntimeError(f'PDF 실패: {r.stderr[-400:]}')


def book_dir(bk):
    """권 번호 → content 안 폴더 ('' = 1권). content/books.json 이 있으면 거기서, 없으면 1권만."""
    bp = os.path.join(ROOT, 'content', 'books.json')
    books = json.load(open(bp, encoding='utf-8')) if os.path.exists(bp) else [{'n': 1, 'dir': ''}]
    for x in books:
        if x['n'] == bk: return x.get('dir', '')
    raise SystemExit(f'{bk}권이 content/books.json 에 없다')


def main():
    args = sys.argv[1:]
    press = '--press' in args
    bk = int(args[args.index('--book') + 1]) if '--book' in args else 1
    nums = [int(a) for i, a in enumerate(args) if a.isdigit() and not (i > 0 and args[i - 1] == '--book')]
    only = nums[0] if nums else None
    story_only = 'story' in args
    tests_only = 'tests' in args
    out_dir = os.path.join(OUT, 'press') if press else OUT
    cdir = book_dir(bk)                                   # 'b2/' 처럼 권 폴더
    q = ('&press=1' if press else '') + (f'&bk={bk}' if bk > 1 else '')
    if not press:
        art = mid_art(); q += f'&art={art}' if art else ''   # 가정용 PDF 는 축소본 그림 (인쇄소용은 원본)
    qk = f'b{bk}_' if bk > 1 else ''                       # QR 이름 앞붙이 (web/book/app.js bkKey 와 같은 규칙)
    pre = f'PomiPhonics{bk}'
    book = json.load(open(os.path.join(ROOT, 'content', cdir, 'book.json'), encoding='utf-8'))
    os.makedirs(out_dir, exist_ok=True)
    exe = browser(); srv = serve(); time.sleep(0.5)
    base = f'http://localhost:{PORT}/web/book'
    index, units = [], {}
    def entry(title, out): return {'book': bk, 'title': title, 'file': os.path.basename(out)}
    try:
        for x in book['units']:
            u = x['n']
            up = os.path.join(ROOT, 'content', cdir, 'units', f'unit{u:02d}.json')
            if not os.path.exists(up): continue
            unit = json.load(open(up, encoding='utf-8')); units[u] = unit
            if story_only or tests_only or (only is not None and u != only): continue
            for b, label in (('sb', 'SB'), ('wb', 'WB')):
                n = page_count(unit, b)
                if not n: continue
                for p in range(1, n + 1): make_qr(f"{book['site_base']}/book/?b={b}&u={u}&p={p}{'&bk=%d' % bk if bk > 1 else ''}", f'{qk}{b}_u{u:02d}_p{p}')
                out = os.path.join(out_dir, f'{pre}_{label}_Unit{u:02d}.pdf')
                print_pdf(exe, f'{base}/print.html?b={b}&u={u}{q}', out)
                index.append(entry(f"{'Student Book' if b == 'sb' else 'Workbook'} Unit {u} — {unit['title']}", out))
                print(f'{os.path.basename(out)}  ({n}쪽, {os.path.getsize(out) // 1024}KB)')
        # 스토리북 (A5 가로): 유닛 하나만 뽑을 때는 건너뛴다
        keys = story_keys(book, units, bk)
        if keys and only is None and not tests_only:
            for name, url in keys: make_qr(url, name)
            out = os.path.join(out_dir, f'{pre}_Storybook.pdf')
            print_pdf(exe, f'{base}/print.html?b=story{q}', out, budget=45000)
            index.append(entry(f"Storybook — {book['storybook'].get('title', '')}", out))
            print(f'{os.path.basename(out)}  ({len(keys)}쪽, {os.path.getsize(out) // 1024}KB)')
        # 시험지 묶음 (가정용 출력에만): 유닛별 / 복습·전체. 쪽이 많아 시간 예산을 넉넉히
        if only is None and not story_only and not press:
            art = small_art(); aq = f'&art={art}' if art else ''
            for name, label in (('units', 'Unit Tests — 유닛별 시험지 + 정답지'), ('review', 'Review Tests — 복습·전체 시험지 + 정답지 + 말하기 체크리스트')):
                out = os.path.join(out_dir, f'{pre}_Tests_{name.capitalize()}.pdf')
                print_pdf(exe, f'http://localhost:{PORT}/web/teacher/test.html?batch={name}{aq}{"&bk=%d" % bk if bk > 1 else ""}', out, budget=90000)
                index.append(entry(label, out))
                print(f'{os.path.basename(out)}  ({os.path.getsize(out) // 1024}KB)')
        # 인쇄소용이면 표지도 (앞·뒤 한 벌씩)
        if press and only is None and not tests_only:
            make_qr(book['site_base'], 'site')
            for b, label in (('sb', 'SB'), ('wb', 'WB'), ('story', 'Storybook')):
                if b == 'story' and not keys: continue
                out = os.path.join(out_dir, f'{pre}_{label}_Cover.pdf')
                print_pdf(exe, f'{base}/cover.html?b={b}&press=1{"&bk=%d" % bk if bk > 1 else ""}', out)
                index.append(entry(f'{label} 표지', out))
                print(f'{os.path.basename(out)}  ({os.path.getsize(out) // 1024}KB)')
    finally:
        srv.shutdown()
    # 목록: 있던 index.json 에 이번 결과를 합친다 (같은 파일 이름은 바꿔 넣고, 순서는 유닛 → 스토리북 → 시험지)
    ip = os.path.join(out_dir, 'index.json')
    old = json.load(open(ip, encoding='utf-8')) if os.path.exists(ip) else []
    names = {e['file'] for e in index}
    merged = [e for e in old if e['file'] not in names] + index
    merged.sort(key=lambda e: (e.get('book', 1), 0 if '_SB_' in e['file'] or '_WB_' in e['file'] else 1 if 'Storybook' in e['file'] else 2 if 'Tests' in e['file'] else 3, e['file']))
    json.dump(merged, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
