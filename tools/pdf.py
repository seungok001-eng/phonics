# PDF 뽑기: 웹 교재의 인쇄 쪽(web/book/print.html)을 크롬/엣지(헤드리스)로 A4 PDF 로 만든다. 쪽마다 QR 도 만든다.
# 실행: python tools/pdf.py            → 있는 유닛 전부 (학생책·워크북)
#       python tools/pdf.py 1          → 1유닛만
# 결과: build/pdf/PomiPhonics1_SB_Unit01.pdf, ..._WB_Unit01.pdf, build/pdf/index.json (홈페이지 목록용)
# 필요: pip install qrcode (한 번), 크롬 또는 엣지.
import json, os, subprocess, sys, threading, time, urllib.request

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


def make_qr(book, b, u, p):
    """쪽의 QR: 웹 교재의 그 쪽 주소. qrcode 가 없으면 건너뛴다."""
    try:
        import qrcode
    except ImportError:
        print('qrcode 패키지가 없어 QR 을 건너뛴다 (pip install qrcode)'); return
    os.makedirs(QR_DIR, exist_ok=True)
    url = f"{book['site_base']}/book/?b={b}&u={u}&p={p}"
    fn = os.path.join(QR_DIR, f'{b}_u{u:02d}_p{p}.png')
    if os.path.exists(fn): return
    img = qrcode.make(url, box_size=4, border=1)
    img.save(fn)


def serve():
    import importlib.util
    spec = importlib.util.spec_from_file_location('serve', os.path.join(ROOT, 'tools', 'serve.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    from http.server import ThreadingHTTPServer
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), m.H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def print_pdf(exe, url, out):
    # 헤드리스 인쇄. 쪽이 JSON 을 읽어 그리는 데 시간이 걸리니 가상 시간 예산을 넉넉히 준다
    cmd = [exe, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
           '--virtual-time-budget=20000', f'--print-to-pdf={out}', url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(out):
        raise RuntimeError(f'PDF 실패: {r.stderr[-400:]}')


def main():
    only = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else None
    book = json.load(open(os.path.join(ROOT, 'content', 'book.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    exe = browser(); srv = serve(); time.sleep(0.5)
    index = []
    try:
        for x in book['units']:
            u = x['n']
            if only is not None and u != only: continue
            up = os.path.join(ROOT, 'content', 'units', f'unit{u:02d}.json')
            if not os.path.exists(up): continue
            unit = json.load(open(up, encoding='utf-8'))
            for b, label in (('sb', 'SB'), ('wb', 'WB')):
                n = page_count(unit, b)
                if not n: continue
                for p in range(1, n + 1): make_qr(book, b, u, p)
                out = os.path.join(OUT, f'PomiPhonics1_{label}_Unit{u:02d}.pdf')
                print_pdf(exe, f'http://localhost:{PORT}/web/book/print.html?b={b}&u={u}', out)
                index.append({'title': f"{'Student Book' if b == 'sb' else 'Workbook'} Unit {u} — {unit['title']}", 'file': os.path.basename(out)})
                print(f'{os.path.basename(out)}  ({n}쪽, {os.path.getsize(out) // 1024}KB)')
    finally:
        srv.shutdown()
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
