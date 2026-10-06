# 사이트 묶기: web/ + content/ → _site/ (GitHub Pages 가 올리는 폴더). 표준 라이브러리만.
# 실행: python tools/build.py   → _site/ 가 생긴다. 로컬 보기는 tools/serve.py.
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_site')


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(os.path.join(ROOT, 'web'), OUT)
    shutil.copytree(os.path.join(ROOT, 'content'), os.path.join(OUT, 'content'))
    open(os.path.join(OUT, '.nojekyll'), 'w').close()
    n = sum(len(f) for _, _, f in os.walk(OUT))
    print(f'_site/ 완성: 파일 {n}개')


if __name__ == '__main__':
    main()
