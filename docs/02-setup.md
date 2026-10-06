# 개발 환경 세팅 (다른 PC에서 재현용)

## 필요한 것
- **Python 3.12 이상** (이 PC는 3.14). 패키지: `pip install pillow numpy scipy qrcode` (공방은 pillow·numpy·scipy, PDF 의 QR 은 qrcode).
- **ffmpeg** (소리 변환·무음 제거·mp3). `winget install ffmpeg` 또는 공식 사이트. `ffmpeg -version` 이 되면 됨.
- **크롬 또는 엣지** (PDF 뽑기는 헤드리스 크롬/엣지가 한다. 윈도우 11에는 엣지가 기본으로 있다).
- **git + GitHub CLI(gh)**: `gh auth login` 한 번. 저장소 `https://github.com/seungok001-eng/phonics`.
- 그림 생성: 크롬에 교재 공방 확장 넣기 (`docs/03-forge.md`), 또는 제미나이 API 키(`art-src/forge/secrets.json`, git 밖).

## 처음 받기
```bash
git clone https://github.com/seungok001-eng/phonics.git C:\phonics
```

## 날마다 쓰는 명령 (전부 `C:\phonics` 에서)
| 하는 일 | 명령 | 결과 |
|---|---|---|
| 웹 교재·홈페이지 미리보기 | `python tools/serve.py` | 브라우저에 `http://localhost:8080/web/` |
| PDF 뽑기 (QR 포함) | `python tools/pdf.py` (유닛 하나만: `python tools/pdf.py 1`) | `build/pdf/*.pdf`, `web/assets/qr/*.png` |
| 배포용 묶기 (CI 가 자동으로 함) | `python tools/build.py` | `_site/` |
| 교재 공방 (그림·영상·소리) | `tools\forge.cmd` | `http://localhost:8766` |
| 임시 배경음악 다시 만들기 | `python tools/placeholder_music.py` | `web/assets/music/*.mp3` |

## 배포
`master` 에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 `tools/build.py` 로 `_site/` 를 만들어 GitHub Pages 에 올린다.
주소: **https://seungok001-eng.github.io/phonics/** (반영까지 1~2분). 저장소 Settings → Pages 가 "GitHub Actions" 로 되어 있어야 한다 (2026-10-06 설정함).
PDF 는 `build/` 가 git 밖이라 CI 에 없다 → PDF 를 홈페이지에 올리려면 `build/pdf/` 를 `web/pdf/` 로 복사해 커밋하는 방식으로 바꿀 것 (아직 안 함).

## 폴더
```
content/        원본 (book.json, units/unitNN.json, music.md)
web/            홈페이지(index.html) · 웹 교재(book/) · 선생님 자료(teacher/) · assets(art·audio·music·video·fonts·qr)
tools/          serve.py pdf.py build.py placeholder_music.py forge/(공방)
art-src/ audio-src/   공방 자료 (원본·후보는 git 밖)
build/pdf/      PDF 출력 (git 밖)
docs/           문서
```
