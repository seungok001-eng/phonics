# 전면 재설계(v2) 진행 계획 — 2026-11-03 시작

사용자 결정: "4권까지 최대한 진행, 맘에 안 드는 건 나중에 수정". 대본표(16-script-b1.md) 승인. 규칙은 15-design.md.

## 방식 (중요 결정)
- **기존 엔진을 버리지 않는다.** `web/book/pages.js` + `style.css` 의 쪽 렌더러를 새 디자인으로 갈아 끼우고(쪽 유형별 구도·블롭·겹침·유닛색·아이콘 지시·예시 답), 학생 층에서 우리말을 뺀다. 수업안·시험·정답지·QA·PDF 는 그대로 쓴다.
- 스토리는 유닛 JSON 의 story/lines 를 새 대본으로 바꾼다(id 는 유지: scene_uNN_1~4). 그림은 같은 파일 이름으로 3D 로 갈아 끼운다(web/assets/art/scene_*.jpg, word_*.png).
- 그림 생성: 탑뷰 나노바나나 2.1, 스타일 문장은 15-design.md 5절. 장면은 캐스트 시트(3D 핍·번·헤지 + 그 유닛 손님 동물) 참조. 스크립트 `build/tmp/pilot_gen.py` 를 권·유닛 단위로 돌리는 `build/tmp/v2_gen.py` 로 확장.
- 소리: 공방 rebuild → 새 대사 id 생성 → 고른 목소리(voices.json)로 일괄 생성(`/api/sounds/regen_voices`) → 자동 검사 → 승인·넣기. 낱소리·글자 이름·한 글자 사이트워드는 기존 제미나이 녹음 유지.
- 학생 책 우리말 0: 지시문은 아이콘 + 영어 한 줄, 1번 문항 예시 답. 우리말은 선생님 층(teach.js·lesson-plan)에만.

## 순서와 상태
- [x] 1권 대본표 (16-script-b1.md)
- [x] **1유닛 파일럿** (11-03): 3D 단어 9장·장면 4컷(`art-src/forge/pilot/`), `web/book/v2.css` + pages.js(instr 아이콘·frameHtml·sounds 알약·story v2 4컷·예시 답), unit01.json 스토리 교체, 소리 생성·승인, PDF 확인(7쪽). 나머지 쪽 유형도 v2.css 로 덮음(블롭·연한 바탕).
- [~] 1권 나머지 유닛(0, 2~12): 대본 JSON 적용 완료(`content/v2/b1_scripts.json`, `build/tmp/v2_apply.py`), 그림 `build/tmp/v2_gen.py` 돌리는 중(단어 전부 + 장면 48), 소리 `build/tmp/v2_sounds.py` 돌리는 중(134개). 남은 것: 결과 검수, PDF·QA, 권 끝 스토리북 대본·그림
- [~] 2~4권: 대본 `content/v2/b2~b4_scripts.json` 작성·유닛 JSON 적용 완료. 그림은 1권 뒤에 자동 이어 돌림(`v2_gen_chain.sh` → v2_gen_b2/3/4.log). 남은 것: 소리(`v2_sounds.py --rebuild <ids>`), 쪽 유형(blend·family_words·sentences·digraph·magic_e·vowels) v2 손질, 검수, PDF·QA
- [ ] 권 끝 스토리북(유닛 JSON storybook, 권당 35쪽 + 표지): 아직 옛 줄거리·평면 그림. 새 스토리북 대본("핍의 하루" 식) → 그림 → 소리. 유닛 쪽의 📙 링크는 v2 CSS 로 숨김.
- [ ] 자동 QA 규칙 추가(쪽당 활동 ≤2, 학생 층 한글 0, 지시문 한 줄), PDF 전부, 선생님 자료 갱신
- [ ] 문서·메모리 갱신, 커밋

## 비용 메모
- 탑뷰 0.25크레딧/장. 1권 약 150장, 네 권 약 1,000장.
- 일레븐랩스 이번 달 남은 약 7만 자. 1권 재녹음 먼저, 2~4권은 다음 달 한도 보고.
