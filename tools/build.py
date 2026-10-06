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
    # PDF 가 있으면 같이 (build/pdf 는 git 밖이라 CI 에는 없을 수 있다)
    pdf = os.path.join(ROOT, 'build', 'pdf')
    if os.path.isdir(pdf):
        shutil.copytree(pdf, os.path.join(OUT, 'pdf'), dirs_exist_ok=True)
    open(os.path.join(OUT, '.nojekyll'), 'w').close()
    n = sum(len(f) for _, _, f in os.walk(OUT))
    print(f'_site/ 완성: 파일 {n}개')


if __name__ == '__main__':
    main()
