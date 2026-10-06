# PDF 뽑기: 웹 교재의 인쇄 쪽(web/book/print.html)을 크롬/엣지(헤드리스)로 PDF 로 만든다. 쪽마다 QR 도 만든다.
# 실행: python tools/pdf.py            → 있는 유닛 전부 (학생책·워크북 A4) + 스토리북 (A5 가로)
#       python tools/pdf.py 1          → 1유닛만
#       python tools/pdf.py story      → 스토리북만
#       python tools/pdf.py --press    → 인쇄소용: 사방 3mm 도련 + 재단선 판형(A4 → 216×303mm, A5 가로 → 216×154mm) 을 web/pdf/press/ 에, 표지 PDF 도 함께
# 결과: web/pdf/PomiPhonics1_SB_Unit01.pdf, ..._WB_Unit01.pdf, ..._Storybook.pdf, web/pdf/index.json (홈페이지 목록용)
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


def story_keys(book, units):
    """스토리북 쪽 순서(표지 → 앞 → 유닛 → 뒤)와 QR 이름·주소. web/book/app.js 의 storyPages()·storyKey() 와 같은 규칙."""
    sb = book.get('storybook')
    if not sb: return []
    out = [('cover', 1)]
    out += [('front', i + 1) for i in range(len(sb.get('front', [])))]
    for x in book['units']:
        u = units.get(x['n'])
        if u: out += [(x['n'], i + 1) for i in range(len(u.get('storybook', {}).get('pages', [])))]
    out += [('back', i + 1) for i in range(len(sb.get('back', [])))]
    return [(f'story_u{u:02d}_p{p}' if isinstance(u, int) else f'story_{u}_p{p}', f"{book['site_base']}/book/story.html?u={u}&p={p}") for u, p in out]


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


def main():
    args = sys.argv[1:]
    press = '--press' in args
    only = next((int(a) for a in args if a.isdigit()), None)
    story_only = 'story' in args
    out_dir = os.path.join(OUT, 'press') if press else OUT
    q = '&press=1' if press else ''
    book = json.load(open(os.path.join(ROOT, 'content', 'book.json'), encoding='utf-8'))
    os.makedirs(out_dir, exist_ok=True)
    exe = browser(); srv = serve(); time.sleep(0.5)
    base = f'http://localhost:{PORT}/web/book'
    index, units = [], {}
    try:
        for x in book['units']:
            u = x['n']
            up = os.path.join(ROOT, 'content', 'units', f'unit{u:02d}.json')
            if not os.path.exists(up): continue
            unit = json.load(open(up, encoding='utf-8')); units[u] = unit
            if story_only or (only is not None and u != only): continue
            for b, label in (('sb', 'SB'), ('wb', 'WB')):
                n = page_count(unit, b)
                if not n: continue
                for p in range(1, n + 1): make_qr(f"{book['site_base']}/book/?b={b}&u={u}&p={p}", f'{b}_u{u:02d}_p{p}')
                out = os.path.join(out_dir, f'PomiPhonics1_{label}_Unit{u:02d}.pdf')
                print_pdf(exe, f'{base}/print.html?b={b}&u={u}{q}', out)
                index.append({'title': f"{'Student Book' if b == 'sb' else 'Workbook'} Unit {u} — {unit['title']}", 'file': os.path.basename(out)})
                print(f'{os.path.basename(out)}  ({n}쪽, {os.path.getsize(out) // 1024}KB)')
        # 스토리북 (A5 가로): 유닛 하나만 뽑을 때는 건너뛴다
        keys = story_keys(book, units)
        if keys and only is None:
            for name, url in keys: make_qr(url, name)
            out = os.path.join(out_dir, 'PomiPhonics1_Storybook.pdf')
            print_pdf(exe, f'{base}/print.html?b=story{q}', out, budget=45000)
            index.append({'title': f"Storybook — {book['storybook'].get('title', '')}", 'file': os.path.basename(out)})
            print(f'{os.path.basename(out)}  ({len(keys)}쪽, {os.path.getsize(out) // 1024}KB)')
        # 인쇄소용이면 표지도 (앞·뒤 한 벌씩)
        if press and only is None:
            make_qr(book['site_base'], 'site')
            for b, label in (('sb', 'SB'), ('wb', 'WB'), ('story', 'Storybook')):
                if b == 'story' and not keys: continue
                out = os.path.join(out_dir, f'PomiPhonics1_{label}_Cover.pdf')
                print_pdf(exe, f'{base}/cover.html?b={b}&press=1', out)
                index.append({'title': f'{label} 표지', 'file': os.path.basename(out)})
                print(f'{os.path.basename(out)}  ({os.path.getsize(out) // 1024}KB)')
    finally:
        srv.shutdown()
    if only is None and not story_only:
        json.dump(index, open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
