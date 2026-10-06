# 로컬 미리보기 서버: 저장소 전체를 http://localhost:8080 에 띄운다 (web/ 과 content/ 를 그대로 읽는다).
# 실행: python tools/serve.py  → 브라우저가 http://localhost:8080/web/ 로 열린다. 창을 닫으면 꺼진다.
import os, sys, threading, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # 고치면 바로 보이게
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
    print(f'미리보기: http://localhost:{PORT}/web/', flush=True)
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(f'http://localhost:{PORT}/web/')).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
