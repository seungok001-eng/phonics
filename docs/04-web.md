# 웹 교재·PDF·홈페이지 구조

시리즈 이름은 **Pop! Phonics**(팝! 파닉스). 로고 `Pop! <span>Phonics</span>`, PDF 파일 앞붙이 `PopPhonics<권>_…` (예전 `PomiPhonics…` 파일은 `pdf.py` 를 다시 돌리면 `index.json` 목록에서 빠진다 — 파일은 손으로 지운다).

## 여러 권 (1권 "소리 정원", 2권 "단어 연못", 3권 "짝꿍 숲", 4권 "마법 성")
- `content/books.json` 이 권 목록 `[{"n":1,"dir":"","title":…},{"n":2,"dir":"b2/",…}]`. 1권은 `content/book.json`·`content/units/`, 2권부터는 `content/b2/book.json`·`content/b2/units/`. 그림·소리는 전 권이 `web/assets/` 를 같이 쓴다(같은 id = 같은 파일, 2권 전용은 `b2_`·`sb2_`·`scene_b2_` 접두).
- **book.json 이 아직 없는 권은 건너뛴다**: `app.js loadBook` 이 books.json 의 권마다 `book.json` 을 HEAD 로 확인해 없는 권은 `App.books` 에서 뺀다(권 고르기·없는 bk 주소는 1권으로). 홈페이지·`qa.py`·선생님 자료도 같은 규칙, `pdf.py --book 3` 은 "내용이 아직 없다" 로 멈춘다.
- 웹 주소에 `bk=2` 가 붙으면 2권(없으면 1권). `app.js loadBook(bk)` 가 books.json 에서 폴더를 잡고 그 권의 book.json 을 읽는다(2권 book.json 에 letters 가 없으면 1권 것을 빌린다). `bkParam()` 이 링크에 `&bk=2` 를 붙이고, `bkKey()` 가 QR 이름 앞에 `b2_` 를 붙인다. 교재·스토리북·인쇄·표지·선생님 자료(수업안·플래시카드·진도표·가정통신문·시험지) 전부 같은 규칙.
- 홈페이지는 권마다 카드(유닛 카드·학생책/워크북/수업 화면/스토리북 단추·그 권 PDF). 친구들 칸은 1권 4명 + 뒤 권의 새 친구(비즈). 선생님 자료 칸의 진도표·가정통신문·시험지 폼도 권별.
- `python tools/pdf.py --book 2` → `PopPhonics2_SB_Unit01.pdf` …, QR `b2_sb_u01_p1.png`, 주소에 `&bk=2`, `index.json` 항목에 `"book": 2`. `tests --book 2` 도 된다. `tools/build.py` 는 content 전체를 복사하므로 그대로.

## 원본 하나 → 셋
`content/book.json`(책 전체: 캐릭터·글자 26·단어 78·사이트워드·지시문·유닛 목록·스토리북 표지/앞뒤 쪽) + `content/units/unitNN.json`(유닛: 쪽 명세·스토리·영상·정리 문제·게임·워크북 자료·스토리북 쪽·복습 자료) 를
- **웹 교재** `web/book/index.html` 이 읽어 쪽을 그린다 (`?b=sb|wb&u=1&p=1&t=1`).
- **스토리북** `web/book/story.html?u=1&p=1` 이 전체화면 그림책으로 읽어 준다 (`u` 는 `cover`·`front`·`back` 또는 유닛 번호).
- **인쇄** `web/book/print.html?b=sb&u=1` 이 같은 그리기 함수로 A4 쪽을 늘어놓고, `print.html?b=story` 는 스토리북 전체를 A5 가로로. `tools/pdf.py` 가 헤드리스 크롬으로 PDF 를 만든다 (쪽마다 QR → 웹 교재·스토리북의 그 쪽).
- **선생님 자료** `web/teacher/lesson-plan.html?u=1`(차시마다 수업안, `u=all` 이면 전 유닛), `flashcards.html?u=1`(A4 한 장에 4장) 등 — 아래 "선생님 자료" 절.
- **홈페이지** `web/index.html` 은 book.json 을 읽어 유닛 목록·링크·스토리북 단추·PDF 목록을 만든다 (`ready: false` 인 유닛은 회색).

## 쪽 종류 (`pages.js` 의 PAGES[type])
학생책 Lesson 1: `sounds`(글자 3·글자나무·이름·소리·챈트·동작) → `trace`(획순 SVG·따라 쓰기·짝 찾기) → `words`(단어 9·단어 챈트) → `read_play`(따라 읽기·소리 잡기 게임)
학생책 Lesson 2: `listen_point`(듣고 가리키기·말하고 표시) → `story`(half 1: 1·2칸) → `story`(half 2: 3·4칸) → `check`(듣고 동그라미·잇기·찾아 쓰기)
워크북: `wb_trace` `wb_letters` / `wb_words` `wb_read`
0유닛: `characters` `intro_story` `alphabet` `alphabet_path`
10유닛: L1 의 `read_play` 자리에 `alphabet_review`(A~Z 26칸 소리·"26 sounds" 순서 재생·A–Z names·섞인 칸 순서대로 누르기). 데이터는 book.json 의 letters 만 쓴다.
새 쪽 종류를 만들면 `PAGES.<type>` 함수 하나를 더하고 유닛 JSON 의 pages 에 적으면 웹·PDF 둘 다 된다. `.page` 에는 `t-<type>` 클래스가 붙어 쪽 종류별 CSS 를 쓸 수 있다.

### 복습 유닛(5·11) 쪽 종류와 데이터
유닛 JSON: `"letters": []` 이고 `"review"` 에 자료를 둔다. 글자 목록이 비면 머리띠에는 복습 글자 앞 4개 + "…" 가 보이고, 글자 도장·보기 글자도 `review.letters` 를 쓴다 (`unitLetters()`).
```
"review": {
  "letters": ["a", ... 12 또는 14개],
  "board": { "squares": [ 20개: {"word": "apple"} | {"letter": "b"} | {"special": "pop" | "back" | "again"} ] },
  "bingo": { "words": [ 단어 16개 ] },
  "test":  { "listen_circle": [6, check 와 같은 모양], "match": [4], "find_write": [4] },
  "first_letter": [ 단어 8개 — 없으면 bingo 앞 8개 ],          (선택, 워크북 C)
  "sort": { "a": ["apple", "arrow"], ... }                       (선택, 워크북 D — 없으면 복습 글자 앞 3개의 단어 2개씩)
}
```
pages: L1 `review_sounds` `review_board` `review_bingo`, L2 `story` `story(half:2)` `review_test` / workbook L1 `wb_review_letters`, L2 `wb_review_words`. `check`·`game`·`workbook_data` 는 없어도 된다. `sight_words` 는 `[]`.
- `review_sounds`: 글자 카드 격자(12개는 4열, 더 많으면 5열). 글자 = 이름, 🔊 이름·🔊 소리 단추, 대표 단어(글자의 첫 단어) 그림. "Listen to all" 은 이름→소리→단어 순서.
- `review_board`: 주사위 놀이판. 20칸을 뱀 모양 길(5칸 × 4줄, 줄마다 방향 반대)로. 🎲 Roll(1~6, 흔들림), 말 2개(A·B 팀, 현재 팀은 눌러서 바꿈), 위치는 이 기기에 기억(`localStorage pp_board_u5`), ↺ 처음부터. 칸에 도착하면 단어/이름+소리 재생. 특수칸 pop ⭐ = 한 칸 더, back ↩ = 한 칸 뒤로, again 🔁 = 다시 굴리기(같은 팀). 인쇄판은 판만(단추 없음).
- `review_bingo`: 4×4 그림 빙고. "Call a word" 가 아직 안 부른 단어를 무작위로 읽고(부른 단어는 옆에 쌓인다), 칸을 누르면 ✔, 가로·세로·대각선 한 줄이면 효과음 + BINGO. 인쇄판은 빈 칸 빙고판 + 단어 16개 목록(아이가 써 넣는다).
- `review_test`: `check` 와 같은 모양(함수도 같이 쓴다), 문항이 6/4/4 라 듣고 동그라미는 2열. 보기 글자는 복습 글자에서 고른다.
- `wb_review_letters`: 대·소문자 짝 잇기(두 묶음, 눌러서 잇기) + 빠진 글자 쓰기 두 줄(큰 글자·작은 글자, 화면에서는 빈 칸을 누르면 글자가 나온다).
- `wb_review_words`: 그림 보고 첫 글자 쓰기 8개(빈 칸 누르면 글자·소리) + 단어 분류(글자 상자에 넣기).
- 선생님 슬라이드: 소리 복습은 글자 6개씩 한 장, 놀이판·빙고는 크게 한 장, 평가는 A·B·C 한 장씩, 알파벳 복습은 26칸 한 장 + 순서 잇기 한 장.
- 복습 글자가 26개(12유닛)면 `wb_review_letters` 의 짝 잇기는 3묶음, 빈 칸은 작게.

### 12유닛 "The Alphabet Show" 쪽 종류와 데이터
book.json: `{"n": 12, "letters": [], "review": [1,2,3,4,6,7,8,9,10], "show": true}`. 유닛 JSON: `letters: []`, `review: {letters(a~z), test, first_letter, sort}` (복습 유닛과 같음) + `show`:
```
"show": {
  "song": { "title", "bgm"(music/<bgm>.mp3, 없어도 됨), "lines": [ {"text": "A, a, /æ/, apple!", "audio": "u12_s01"}, … 앞 26줄은 a~z 순서, 뒤에 마무리 줄 ] },
  "hunt": { "rounds": [ 8개: {"letter": "b", "scene": "scene_u01_2", "words": ["bus", "bag", "bed"]} ] },
  "recap": [ 12장: {"unit": n, "scene": "scene_u0n_k", "line": {"who", "text", "audio"}} ],
  "certificate": { "title", "text", "text_ko" }
}
"story": { "title", "bgm", "panels": [ scene_u12_1 한 칸(피날레) + lines ] }
```
pages: L1 `alphabet_song` `alphabet_path` `word_hunt` / wb `wb_review_letters`, L2 `story_recap` `review_test` `certificate` / wb `wb_review_words`.
- `alphabet_song`: 가사 두 단(줄마다 글자 카드 A~Z + 가사 + 가사 끝 단어 그림). ▶ Sing! = 반주(`music/<song.bgm>.mp3`)가 있으면 그 위에 줄마다 소리(`chantTrack`), 없으면 1.2초 박자로 이어 붙인다. 줄과 글자 카드에 차례로 불. 줄을 누르면 그 줄만. 인쇄는 가사+글자+그림 그대로.
- `word_hunt`: 라운드마다 장면 그림 크게 + "Find the b things!"(누르면 소리) + 단어 단추(정답 + 다른 글자 단어 3개). 정답은 ✓·단어 소리, 다 찾으면 다음 라운드, ⭐ 점수. 인쇄는 8라운드 전부(장면 썸네일 + ☐ 단어). 슬라이드는 라운드마다 한 장.
- `story_recap`: 무대(장면 크게 + 말풍선) + 12장면 띠(썸네일 + 대사, 누르면 무대에 올리고 소리). ▶ Show time! = 장면마다 무대에 올리며 줄 읽기 → 마지막에 `story.panels[0]`(scene_u12_1) 피날레 + 그 줄들 → "Pip can sing!". 🎭 역할 읽기는 story 쪽과 같은 함수(`storyItem`). 슬라이드는 장면마다 한 장 + 피날레 한 장.
- `certificate`: 제목·문구(영/한)·26 글자 띠·캐릭터 4명(`char_*_cheering`, 없으면 `_ref`)·Date·Teacher 서명 자리. 웹에서 이름을 넣으면 들어가고 🖨 → `print.html?b=sb&u=12&p=<쪽>&name=<이름>` (그 쪽만, 바로 인쇄 창; `&auto=0` 이면 안 띄움). 인쇄는 A4 세로(기존 쪽 크기).

### 2권 쪽 종류와 데이터 (`docs/06-book2.md` 4절)
유닛 JSON: `families`(가족 2~3개), `vowel`, `words {가족: [단어]}`, `sentences [{text, audio, pic, words}]`, `check {read_circle, match, write}`(듣기 대신 읽기), `game.rounds [{word, pictures}]`, `workbook_data {blend, family, sentences, write}`. book.json: `vowels`, `families {at: {vowel, words}}`, `words[w].family`. 도우미(`app.js`): `unitFamilies` `unitWords` `familyOf` `famVowel` `famWords` `famCls`(유닛 안 가족 순서로 색 fam-0~3) `famHtml`(-<모음 빨강>t) `wordFamHtml`(c·**at**) `letterSound`(모음은 vowels, 나머지는 letters).
- L1: `blend`(page.family — 단어마다 글자 타일 3개가 떨어져 있다가 ▶ 에 낱소리와 함께 붙고 단어 소리·그림. `audio/blend_<word>.mp3` 가 있으면 그걸(HEAD 로 한 번 확인) 길이에 맞춰 타일 불, 없으면 `sound_<글자>`×3 + `word_<word>` 를 playSeq) → `blend`(가족 2) → `family_words`(두 가족 단어 카드 + ♪ 챈트(1.2초 박자·chant_beat 반주) + 읽고 그림 잇기) → `read_play`(1권 것 재사용: 단어 10개 5열, 게임은 `rounds[].word` 단어 듣고 그림 고르기, "한 번 더"는 단어 조합).
- L2: `sentences`(문장 4개 + 그림, 사이트워드 노랑·단어 밑줄, 단어 누르면 소리, 🔊 문장, ▶ Read all) → `story` ×2(1권 것) → `check`(`read_circle`: 단어 읽고 그림 3 / `match`: 단어–그림 / `write`: 빠진 글자 상자 — `checkBody2`·`checkSlides` 가 데이터 모양으로 가른다).
- 워크북: `wb_blend`(빠진 글자 8, 화면은 빈 칸 누르면 글자·소리) · `wb_family`(가족 상자 분류 + 단어–그림 잇기) / `wb_sentences`(문장 읽고 그림 ○ + 따라 쓰기 줄) · `wb_write`(그림 보고 단어 4선 쓰기 6).
- 0유닛: `characters` `intro_story` `vowels`(모음 5개 카드: 글자·소리·대표 단어·힌트, Listen to all) `alphabet`.
- 복습 5·11: `review_words`(단어 카드 격자 + 가족 꼬리표, 슬라이드는 8개씩) · `review_board`(`squares[].family` 칸은 가족 — 도착하면 그 가족 단어 하나) · `review_bingo` / `story` ×2 · `review_test`(check 와 같은 2권 모양). 워크북 `wb_review_blend`(빠진 글자 8 + 가족 분류, `review.blend`·`review.sort`) · `wb_review_words`(2권이면 그림 보고 단어 쓰기 8 + 가족 분류).
- 12유닛: `word_song`(= alphabet_song, 가사 줄에 `family` 가 있으면 가족 타일) · `bridge_path`(징검다리: `show.bridge.families` 순서대로 누르기, 없으면 book.families 순서) · `word_hunt`(`rounds[].family`) · `story_recap` · `review_test` · `certificate`(가족 26개 띠).
- 선생님 슬라이드: blend 한 장(큰 줄), family_words 한 장, sentences 는 문장마다 한 장, review_words 8개씩, vowels 한 장, bridge_path 한 장. 나머지는 1권 것.
- 머리띠(`lettersBadge`)는 2권이면 가족(-at -an), 복습은 앞 4개 + "…". 글자 도장도 가족.

### 3·4권 쪽 종류와 데이터 (`docs/13-book3-4.md` 4·5절)
2권 틀 그대로(`B2()` 가 참) + 아래. book.json `families[f]` 에 `kind`(`digraph`·`blend`·`final`·`magic_e`·`team`)·`sound`(IPA)·`label`(선택), `words[w]` 에 `chunks`(소리 덩어리)·`ipa`. 끝소리 가족은 키에 `-` 가 붙는다(`-nd`). 도우미(`app.js`):
- `famKind` `famKey`(-nd → nd) `famHtml`(kind 별: `sh` / `-nd` / `<a>_<e 흐림>` / `<ai>`, 가족이 아닌 묶음 `a` 는 모음 빨강) `famLabel`(글자만, 도장·목록) `famSay`(합성 음성용 글, 예 sh → "shh") `famSound`(3·4권 `sound_<가족>` — sound_sh·sound_a_e·sound_nd, 2권은 모음 소리).
- `wordChunks` `chunkTiles`(보이는 순서의 타일: cape `c·a_e·p` → c·a·p·**e**, 끝 e 는 흐리게(`.silent`)·a 와 같은 덩어리 번호 k) `chunkItems(c, ipa)`(덩어리 소리: 낱글자 → sound_<글자>, 같은 글자 둘(ll) → 그 글자, 가족(sh·a_e·ai) → sound_<덩어리>, 그 밖(se /s/) → IPA 가 같은 글자, 아니면 글자마다) `chunkPlay` `wordFamHtml`(덩어리가 있으면 가족 덩어리를 굵게: **sh**ip, c**a**p**e**).
- `digraph`(새, 학생·슬라이드·인쇄): `page.family` 하나(없으면 유닛 가족 전부, 4개까지). 가족 카드 = ▶ + 두 글자 타일(떨어져 있다가 ▶ 에 미끄러져 붙고 노랗게 빛나며 `sound_<가족>` — 없으면 합성 음성) + /IPA/ + 단어 카드(가족 1개면 6개 3열, 2개면 5개, 3개 이상 3개씩 2×2) → 2. Trace and write(가족마다 따라 쓰기 줄). 지시문은 내용의 `team_sound`·`say_pair` 가 있으면 그것. 슬라이드: 가족마다 한 장(타일 170px, 단어 카드 4장에 번호 — "Number 2!" 하면 읽기).
- `magic_e`(새): `unit.pairs [{from, to}]` 4~5개. 줄마다 [from 그림·번호] [글자 cap(바뀌는 모음 빨강)] [🧚 요정 단추(+e) — 그림은 characters 중 id/name 에 fairy 가 든 친구의 `char_<id>_ref`, 없으면 🧚] [to 그림(흐림)]. 요정을 누르면 `word_cap` → 반짝이는 e 가 붙고 모음이 빛남(chime) → `word_cape`, 다시 누르면 처음으로. 머리에 magic_e 가족 글자 + 🔊 /eɪ/ + ▶ Magic e!(전부 차례로). 인쇄는 "cap + e →" 와 4선 쓰기 칸. 슬라이드: 짝마다 한 장(글자 150px, 아이들이 새 단어를 먼저 외치면 요정을 눌러 확인) + 마지막에 짝 전부 "Read it! 1·2·3" 한 장.
- `blend`: 가족은 `page.families`(여럿, 3권) → `page.family`(하나) → 둘 다 없으면 유닛 가족 전부. 타일은 덩어리마다(sh 는 넓은 타일 하나), 가족이 여럿이면 가족마다 무리(왼쪽 색 띠 + 첫 줄에 가족 꼬리표). 단어가 7개 넘으면 줄을 촘촘히(`.many`, 4권 10개). 슬라이드는 5개 안팎씩 여러 장. 머리는 가족마다 글자 + 🔊 소리(셋 이상이면 작게 `.multi`).
- `missing`(정리 C·워크북 빠진 글자·복습): 덩어리가 있는 단어는 **덩어리 번호**(ship 0 → `sh` 빈 칸 하나, cape 1 → a 와 끝 e 둘 다 빈 칸). 없으면 가족 덩어리. 지시문은 "Write the missing letters."(`write_letters`·`write_pair`).
- 분류 상자(`famSortHtml`): 상자에 들어갈 단어를 `data-ws` 로 들고 있어 가족이 아닌 묶음도 된다(4권 `workbook_data.family {"a": [cap…], "a_e": [cape…]}`). 정답지도 `data-ws` 로.
- 0유닛 `vowels`: 가족에 모음 예시가 없으면(3권) 그 모음이 덩어리로 든 단어(bath·shell·ship·shop·lunch), 긴 모음(4권: vowels 소리가 1권 글자 소리와 다름)은 소리를 글자 이름 `name_<모음>` 으로.
- 친구 소개 말버릇 소리: 1권 `catch_<id>`, 2권부터 `catch_b<권>_<id>`(`catchAttrs`, `data-alt="catch_<id>"` — 없으면 1권 것 → 합성 음성). `Sound.play(id, text, dir, alt)`.
- 시리즈 수료증(4권 12유닛 `certificate.series: true, books: [1,2,3,4], music: "theme"`): 리본 "Pop! Phonics 1–4", 글자·가족 띠 대신 권 띠(books.json 의 권 부제), `music` 파일이 있으면 ♪ Pop! Phonics Song 단추(없으면 숨김).
- 12유닛 단어 노래(2권부터)는 줄을 두 단 그대로(알파벳 노래만 27줄째부터 가운데, `.song.abc`).

## 장면 해설 한 줄 (narr, 2026-10-13)
사용자: "스토리 그림만 봐서는 무슨 내용인지 선생님도 아이도 모른다" → 장면마다 해설 한 줄.
- 데이터: `story.panels[].narr` · `storybook.pages[].narr` · book.json `storybook.front/back[].narr` = `{"text": 쉬운 영어 한 줄, "ko": 우리말, "audio": "<그림 id>_n"}`. 듣기용이라 아직 안 배운 단어가 들어가도 된다. 공방은 who=narrator(어른 목소리, 제미나이)로 녹음한다(plan.py).
- 웹: `narrHtml(pn, idx, cls)` · `narrItem(pn, idx)`(pages.js). 학생책 스토리 쪽은 그림 위에, 선생님 슬라이드는 그림 바로 아래 큰 자막(`.narr.big`), 스토리북은 글 띠 맨 위, 인쇄(학생책·스토리북)에도 영어+우리말로 나온다. ▶ 를 누르면 해설을 먼저 읽고 대사.
- **이야기 한눈에** 슬라이드: 해설이 있는 유닛은 스토리 첫 쪽(half 1) 앞에 한 장 — 장면 썸네일 4칸 + 칸마다 우리말 해설 + 줄거리(synopsis_ko) + 지난/이번 이야기 띠. ▶ Story in pictures = 해설을 차례로 읽으며 칸에 불(`glancePlay`). 읽기 전에 그림으로 이야기를 짚는 단계.
- 스토리북 💬 우리말은 이제 기본 켬(`pp_ko_sb` 가 '0' 일 때만 끔).

## 스토리북 (`story.html` · `print.html?b=story`)
데이터: book.json `"storybook": {"title", "title_ko", "bgm"(선택, 없으면 bgm_bright), "cover": {id, desc}, "front": [{id, desc, lines}], "back": [...]}` + 유닛 JSON `"storybook": {"pages": [{"id": "sb_u01_1", "desc", "lines": [{"who", "text", "audio"}], "task", "task_ko", "task_audio"(선택)}]}`. 쪽 순서 = 표지 → front → 0~11유닛 쪽 → back (`app.js storyPages()`).
- 그림 `web/assets/art/<id>.jpg` (4:3, `sb_` 로 시작하면 jpg), 대사 소리 `web/assets/audio/<audio>.mp3`, 과제 소리 `task_audio` 또는 기본 `<쪽 id>_task` (없으면 합성 음성), 배경음악은 그 유닛 `story.bgm`, 표지·앞뒤 쪽은 `storybook.bgm`.
- `story.html?u=1&p=1`: 전체화면 그림책. 넓은 화면(가로 3:2 이상)은 그림 왼쪽(세로 꽉)·글 오른쪽, 좁은 화면은 그림 위·글 아래. 글꼴 Andika 32px 이상. ▶ Read = 자동 읽기(줄마다 불, 아바타 입 움직임, 배경음악 duck, 과제까지 읽고 다음 쪽으로 이어진다, 다시 누르면 멈춤). ← → 키·손가락 밀기·화면 양끝 누르기로 넘기고, ☰ 차례로 유닛별 점프. 쪽마다 과제 chip(누르면 소리). 그림이 없으면 글자 상자.
- 인쇄: A5 가로(210×148mm). 그림이 쪽을 채우고 아래 흰 띠에 대사·과제·QR(story.html 의 그 쪽)·쪽 번호(표지는 번호 없음). `tools/pdf.py` 가 `PopPhonics1_Storybook.pdf` 로 뽑는다 (`python tools/pdf.py story` 는 스토리북만).
- 학생책 story 쪽의 📙 단추(그 유닛 스토리북 첫 쪽), 홈페이지의 "📙 스토리북 읽기" 와 유닛 카드의 "📙 스토리북" 링크는 storybook 데이터가 있을 때만 나온다.

## 인쇄소용 PDF (`python tools/pdf.py --press`)
- 쪽 크기에 사방 **3mm 도련**을 더한 판형: A4 → 216×303mm, A5 가로 → 216×154mm (`print.html?...&press=1` → `body.press`, `@page` 크기 바꿈). 쪽 배경은 도련 끝까지, 내용 배치는 재단선 기준으로 가정용과 같다. 모서리 4곳에 재단선(2.4mm 선, 재단선에서 0.5mm 띄움). QR·쪽 번호는 재단선 안쪽 13mm(`.ph-foot` 을 올리고 아래 여백을 그만큼 늘림).
- 결과는 `web/pdf/press/` 에 같은 이름으로 + 표지 `PopPhonics1_SB_Cover.pdf`·`WB_Cover`·`Storybook_Cover` (`web/book/cover.html?b=sb|wb|story&press=1`: 앞표지 = 시리즈명·제목·부제·책 종류·캐릭터 `char_*_ref` 4명, 스토리북은 표지 그림 위에 제목 / 뒤표지 = 소개 글·캐릭터·홈페이지 QR(`qr/site.png`)·ISBN 자리). 책등(spine)은 아직 없다 — 쪽수가 정해지면 넣는다.
- 가정용(지금) 출력 `python tools/pdf.py` 는 그대로(A4·A5 가로, 도련 없음). 홈페이지 PDF 목록은 `web/pdf/index.json` 만 읽는다.

## 파일 이름 규칙 (공방이 만들고 웹이 읽는다)
- 그림 `web/assets/art/`: `char_<id>_<pose>.png`(+ `_blink` `_talk`), `tree_<letter>.png`, `word_<word>.png`, `line_<word>.png`, `scene_<id>.jpg`, `sb_<...>.jpg`(스토리북), `cast_sheet.jpg`
- 소리 `web/assets/audio/`: `name_<letter>` `sound_<letter>` `word_<word>` `sw_<word>` `instr_<key>` 스토리 대사 `<unit JSON 의 audio id>` `catch_<char>` 스토리북 대사·과제 `<storybook audio id>` `<쪽 id>_task` — 전부 `.mp3`
- 음악 `web/assets/music/` (`content/music.md`, 1~4권 공용 9곡): `theme`(주제가 — 홈페이지 ▶ 주제가 단추, 0유닛 이야기 첫 ▶ 앞에 한 번, 시리즈 수료증) `abc_song`(1권 0유닛 ♪ ABC Song — 없으면 글자 이름 차례로) `bgm_bright` `bgm_adventure` `bgm_night` `bgm_silly` `bgm_finale`(이야기 배경 — 유닛 `story.bgm`, 스토리북 표지·앞뒤 `storybook.bgm`) `chant_beat`(소리 챈트·단어 챈트·가족 챈트 공용 반주) `song_backing`(노래 쪽 반주 — `show.song.bgm`, 없으면 이 이름)
- 영상 `web/assets/video/vid_<id>.mp4` — **지금은 영상을 빼고 움직이는 장면**(아래). 파일을 넣으면 ▶ movie 단추가 다시 나온다
- QR `web/assets/qr/`: `sb_u01_p1.png` `wb_u01_p1.png` `story_u01_p1.png` `story_cover_p1.png` `story_front_p1.png` `story_back_p1.png` `site.png` (pdf.py 가 만든다)
- **파일이 없어도 깨지지 않는다**: 그림은 글자 상자, 소리는 브라우저 합성 음성(임시), 영상은 그냥 그림, 챈트 반주는 없으면 지금처럼. 그래서 그림·소리가 들어오는 대로 화면이 좋아진다.

## 소리 규칙 (`app.js` Sound)
- `data-say="<id>" data-text="<임시로 읽을 말>"` 인 요소는 누르면 소리가 난다.
- 스토리에서 ▶ 를 누르면 배경음악이 켜지고, 대사가 나올 때 음악이 1/4 로 줄었다가 돌아온다 (`duck`).
- 효과음(펑·딩·정답·오답)은 코드로 합성 — 파일 없음.
- 아바타: `char_<id>_blink` 가 있으면 가끔 눈을 깜빡이고, 대사가 나올 때 `char_<id>_talk` 와 번갈아 입을 움직인다.
- 처음 한 번 "Start" 를 눌러야 소리가 난다 (브라우저 자동 재생 제한).
- `Sound.play(id, text, dir, alt)` 는 파일을 끝까지 틀었으면 true, 파일이 없어 합성 음성·무음으로 넘어가면 false 로 끝난다. `Sound.music(id)` = `music/<id>.mp3` 한 번(없으면 조용히 false). `playSeq` 항목의 `music: 'theme'` 은 소리 대신 음악 한 번.
- 음악 파일이 없으면 전부 조용히 넘어간다(단추는 HEAD 로 확인해 있을 때만 보임 — 홈페이지 ▶ 주제가, 수료증 ♪).

## 움직이는 장면 (영상 대신)
- 스토리 칸(학생 쪽·슬라이드)과 스토리북 보기(`story.html`), 되짚기 공연 무대: 장면 그림이 처음 나올 때 16~18초 동안 천천히 다가가며 옆으로 흐른다(켄 번스 `kbA`·`kbB`·`kbC`, 칸·쪽마다 방향이 다름). 대사가 나오는 동안 칸에 `.reading`(스토리북은 `.art.reading`) → 그림이 3% 더 다가갔다 줄이 끝나면 2.4초에 걸쳐 돌아온다.
- 🔍 Find 의 숨은 단어 칩을 켜면 그 칸 그림 위에 작은 반짝임 7개(`sparkle`).
- `prefers-reduced-motion: reduce` 이면 전부 멈춤, 인쇄(`body.print`·`@media print`)에는 없음.
- ▶ movie 단추는 `hidden` 으로 그리고 `pageReady(root)`(index.html 이 쪽마다 부름)가 `web/assets/video/<id>.mp4` 를 HEAD 로 확인해 있을 때만 보인다. 대사 첫 줄의 자동 영상(`playVideo(idx, true)`)도 파일이 있을 때만. 코드는 그대로라 mp4 를 넣으면 영상이 돌아온다.
- 합자 끔: 모든 쪽 `font-variant-ligatures: none` (Andika 의 fl·fi 가 한 글자로 붙어 보이지 않게).
- `playSeq` 항목의 `wait`(ms) 는 소리 없이 기다리기(역할 읽기), `beat`(ms) 는 소리 길이와 상관없이 고정 간격(챈트 박자).
- 챈트: 소리 챈트·단어 챈트·가족 챈트 때 `music/chant_beat.mp3` 가 있으면 반주로 틀고(배경음악과 별도, duck 안 함) 소리를 1.2초 박자에 맞춰 이어 붙인다. 없으면 지금처럼 소리 길이대로.

## 이야기 따라가기 (우리말 도움 · 안내서 · 지도)
데이터(유닛 JSON): `story.synopsis_ko`(줄거리) · `so_far_ko`(지난 이야기 한 줄) · `goal_ko`(이번 이야기) · `panels[].ko`(칸 설명) · `panels[].lines[].ko`(대사 번역) · `panels[].ask[{en, ko}]`(질문 2개) · `storybook.pages[].ko`·`lines[].ko` · `show.recap[].ko`. book.json: `story_arc{ko, books_ko, characters_ko}`, `characters[].role_ko`(한 줄 역할). 없으면 그 부분만 조용히 빠진다.
- 스토리 쪽(학생·슬라이드): 첫 칸 위에 **지난 이야기**(앞 유닛 마지막 칸 썸네일 + `so_far_ko`) · **이번 이야기**(`goal_ko`) 띠. `💬 우리말` 단추(`pages.js koBtn/koToggle`, 우리말 자료가 있는 유닛에만 보임): 켜면 대사 번역이 말풍선 아래 작게, 칸 설명과 질문 Q 두 개가 칸 옆(슬라이드)/아래(교재 쪽)에. **선생님 모드 기본 켬, 학생 화면 기본 끔**(모드별로 `localStorage pp_ko_t / pp_ko_s` 에 기억). 되짚기 공연(`story_recap`)도 같음. **인쇄본에는 우리말 설명·띠 없음**(교사용 안내서로).
- 친구들 소개(`characters`·슬라이드): 캐치프레이즈 아래 `role_ko` 한 줄. 글이 길면 그림이 줄어 쪽 안에 맞는다.
- 스토리북 보기(`story.html`): 위 막대 `💬 우리말`(기본 끔, `pp_ko_sb`) — 쪽 설명 `pages[].ko` 한 줄 + 대사 번역. 자료가 한 쪽도 없으면 단추 숨김.
- **교사용 이야기 안내서** `web/teacher/story-guide.html?bk=1`: 권 줄기(`story_arc`)·등장인물(그림 + role_ko)·유닛 차례(줄거리 첫 문장) → 유닛마다 줄거리·지난/이번 이야기·칸 4개(썸네일, 영어 대사+번역, 칸 설명, 질문, 숨은 단어)·스토리북 쪽 요약·되짚기 12장면. A4 인쇄용. `?art=` 로 축소 그림 폴더.
- **이야기 지도 포스터** `web/teacher/story-map.html?bk=1`: 0~12유닛을 뱀 모양 길 하나로(유닛마다 첫 칸 썸네일 + 제목 + 글자/가족 + `synopsis_ko` 첫 문장, 주황 = 글자 유닛·파랑 = 복습·초록 = 쇼), 친구들 칸(4명 + 비즈). A3 가로 1쪽. `?a4=1` 이면 A4 세로 2쪽(왼쪽·오른쪽 반, 점선에서 이어 붙이기).
- `python tools/pdf.py guides` (또는 전체 실행에 포함): `PopPhonics1_StoryGuide.pdf`(A4), `PopPhonics1_StoryMap.pdf`(A3 가로 1쪽), `PopPhonics1_StoryMap_A4.pdf`(2쪽). `--book 2` 도 됨. 그림은 `build/art_small/`(장면·스토리북·캐릭터 기준 그림 640px) 축소본을 써서 가볍게. 홈페이지 선생님 자료 칸에 권별 링크.

## 놀이·수업 도구
- 소리 잡기 게임(`read_play`·슬라이드): 유닛 JSON 의 5라운드가 끝나면 "🔁 한 번 더" — 유닛 글자·단어에서 무작위 5라운드(바로 앞 라운드와 같은 조합은 피함). 팀 점수판: A·B 를 눌러 현재 팀을 고르고 정답이면 그 팀 +1, 🗑 로 점수 지우기.
- 짝 맞추기 `Memory game` (선생님 슬라이드 `read_play` 3번째 장만, 학생책·인쇄에는 없음): 유닛 단어 6개 × 2 = 12장(4×3). 뒤집으면 단어 소리, 짝이면 그대로 남고 효과음, 다 맞추면 Great job.
- 역할 읽기 🎭 (`story`·슬라이드): 켜고 말풍선의 친구(번·헤지·그럼블)를 누르면 "아이가 읽는 역할"(👧 표시). ▶ 자동 읽기 때 그 줄은 소리 없이 말풍선만 켜지고 2.5초 멈춘다. 핍·해설·both 는 역할이 안 된다.
- 속도 라운드 `Speed round!` (선생님 슬라이드 `listen_point` 2번째 장): 30초 타이머, 유닛 글자·단어 카드가 무작위로 한 장씩 크게(글자 = 소리 말하기, 단어 = 읽기, 카드를 누르면 소리). ✔/✖ 로 다음 카드, 끝나면 맞힌 수.

## 선생님 자료 (`web/teacher/`, 2026-10-14 다시 짬)
모두 `?bk=N` 으로 권을 고르고, 쪽 목록·단어·가족은 그 권 JSON 에서 읽는다(유닛·쪽을 코드에 박지 않는다 — 내용 쪽이 차시 사이로 옮겨도 따라간다). 인쇄용 A4, 그리기가 끝나면 `window.PRINT_READY = true`.
- **수업안** `lesson-plan.html?u=N`(`u=all` = 그 권 전체, PDF 용): 유닛 JSON `lessons[]` 마다 한 장. 흐름 = 인사·주제가·복습(4분) → `lessons[i].pages` 의 쪽마다 한 줄 → 정리·숙제(3분). 쪽 종류마다 `ACT[type]` 사전(활동 이름·선생님이 하는 일과 말·아이들 답·시간). 시간 = base + per × 슬라이드 수(슬라이드 수는 `teach.js TEACH[type].count` 와 같은 규칙을 수업안에 따로 적어 둠 — teach.js 의 count 를 바꾸면 여기 `slides` 도). 합계가 50분을 넘으면 "메모리 게임 빼기·뒤쪽 짝꿍/합치기 쪽은 2차시로", 40분 아래면 놀이 더하기를 제안. 예시는 유닛 자료(첫 글자·첫 단어·sentences[0]·가족·pairs[0]·이야기 첫 줄)에서. 이어 소리(kind blend·final)는 "두 소리를 빠르게 이어요", 짝꿍·모음 짝은 "소리 하나". 숙제 = 그 차시 `workbook` 쪽 번호 + 정답지 링크(0유닛은 워크북 없음). 스토리 대본에 해설(narr) 줄, 역할 읽기 목록은 pages.js `ROLE_SKIP`(핍·해설·함께) 빼고.
- **가정통신문** `letter.html?u=N`: 0유닛(새 책 시작)·일반·복습(선생님 메모 칸)·쇼(다음은 최종 평가) 모두. 부모님용이라 IPA 없이 글자 + 우리말 비슷한 소리(`KO` 사전), 이어 소리는 두 소리 잇기. QR 은 그 유닛 이야기 첫 쪽.
- **진도표** `syllabus.html`: 유닛 JSON 의 차시마다 한 줄(쪽 범위도 차시별 실제 쪽 수) → 25차시 + 최종 평가 = 26(주 2회 약 13주), 주 3회판은 일반 유닛마다 복습 차시 → 35. 복습 줄은 3권 "짝꿍 소리", 4권 "긴 모음".
- **플래시카드** `flashcards.html?u=N`: 0유닛(1권 알파벳 26 / 2~4권 모음 5), 복습 유닛(복습 글자·가족 + 단어 1~2장씩), 쇼(글자·가족 카드만)도.
- **선생님용 소리 안내** `pronunciation.html?bk=N|all`: 권마다 가르치는 소리 전부(1권 a~z, 2권 짧은 모음·단어 가족, 3권 짝꿍·이어 소리·끝소리, 4권 긴 모음·마법 e·모음 짝·ar/or) — 🔊(`sound_<x>`, 4권 긴 모음은 `name_<v>`)·작은 IPA·예시 단어·우리말 비슷한 소리·입 모양·흔한 실수. 첫 장에 "한국 아이들이 자주 틀리는 것"(f/p, v/b, th 두 소리, r/l, z/j, 애/에, 짧은 o, 끝소리 '으', 사이트워드의 '어', 이어 소리 vs 짝꿍, u_e 두 소리 …).
- **수업 화면 사용법·학급 운영** `how-to.html`(권 공통): 선생님 모드 여는 법, 키(←/→·Space·↑↓·+/-/0·C), 위 막대 단추, 필기판, 활동별 진행(🎭·💬·이야기 한눈에·해설·놀이판·빙고·Homework 장), 음악, 인쇄, 시험 수준 고르기·점수 보기(70%), 결석생 보충.
- 이야기 안내서(`story-guide.html`)는 칸·스토리북 쪽마다 해설 한 줄(narr)을 대사 앞에 초록으로. 이야기 지도 범례는 권마다(글자/단어 가족/짝꿍 소리/긴 모음 유닛).

## 시험지 생성기 (`web/teacher/test.html`)
- 주소: `?scope=u3 | r1(1~4) | r2(6~10) | all(1~10, 최종 평가) &level=1|2|3 &set=A|B &bw=1(선그림 line_*.png, 흑백 인쇄용) &key=1(정답지) &speaking=1(말하기 체크리스트) &batch=units|review|final`. `?u=3&v=B` 옛 주소도 받는다. 위 막대의 폼으로도 고른다. 홈페이지 선생님 자료 칸에 같은 폼(권을 바꾸면 수준 이름도, 말하기 체크리스트 링크도 고른 권·범위로).
- 듣기 문항 없음. 한 장 = A4 2쪽, 4부분 20문항, 모든 문항에 그림(그림 칸 크기 통일, 쓰기 줄은 4선). 머리에 이름·날짜·점수, 꼬리에 **글자별(가족별) 점수표** — 가족이 아닌 자리를 묻는 문항(2~4권 첫 글자 쓰기, 3·4권 끝 덩어리 쓰기)은 "첫소리"·"끝소리" 칸에 따로.
- **섞기**: 씨앗(`scope-level-set` 해시)을 다시 흩은 뒤 mulberry32 로 피셔–예이츠(이웃한 씨앗이 비슷한 순서를 만들던 옛 LCG 버림). **정답 자리 고르게**: 고르기 부분마다 정답 자리(a·b·c)를 돌아가며 채운 뒤 섞는다(`posGen`·`put`, 6문항이면 a·b·c 두 번씩). 잇기 오른쪽 기둥은 왼쪽과 같은 자리가 많으면 한 칸 돌림.
- Level 1(글자): 그림 보고 첫소리 글자 3지선다 6 · 대문자–소문자 잇기 6(그림 힌트) · 빠진 글자 쓰기(B _ D) 4 · 그림 보고 첫 글자 쓰기 4. Level 2(단어): 그림–단어 잇기 6 · 첫 글자 쓰기 6 · 단어 읽고 그림 고르기 4 · 단어 완성(c_t) 4. Level 3(읽기·쓰기): 단어 읽고 그림 고르기 6(같은 첫소리 단어가 보기에 섞임) · 그림 보고 단어 쓰기 6(단어 상자) · 사이트워드 문장 완성 4(범위 유닛 이야기 줄에서, 부족하면 "I see a ___." 꼴로 채움) · 첫소리별 분류 4(그림 8개 번호를 글자 상자에). Level 3 의 쓰기 답 단어는 같은 장 문장에 나오지 않게 고른다(문장을 먼저 고름).
- A/B형은 씨앗이 달라 문항·보기가 다르고, 다시 열어도 같다. 정답지(`key=1`)는 같은 배치에 답만 표시. 단어는 글자마다 돌아가며 뽑아 한 장 안에서 같은 단어가 겹치지 않는다(단어가 모자란 1~2글자 유닛은 겹칠 수 있다).
- 말하기(`speaking=1`): 교사용 체크리스트 1쪽 — 범위 글자(가족) 칸 × 아이 16줄, **칸마다 0·1·2점**(2 바로 읽음 · 1 소리 내어 이어 읽음 · 0 못 읽음), 합계 칸과 70% 기준. 2~4권은 끝에 **처음 보는 단어**(가족마다 손으로 고른 가짜 단어 `NONSENSE`, 범위에서 4개) 칸.
- 3·4권(가족에 kind 가 있는 권): Level 1 = 그림 보고 짝꿍 소리(4권 긴 모음) 고르기 6(보기는 범위 가족, 모자라면 같은 종류 가족 — a_e·i_e·o_e) · 빠진 짝꿍 글자 쓰기 6(가족 덩어리가 빈 칸) · 단어 읽고 그림 고르기 4 · 첫 글자(첫 덩어리) 쓰기 4. Level 2·3 은 2권과 같고 글자 상자는 덩어리마다(`tilesOf`). Level 2 단어 완성은 3·4권이면 "빠진 글자" — 마법 e 단어는 모음 자리만 비우고 끝 e 는 흐리게 보인다(끝 덩어리가 마지막 글자가 아니므로). 부르는 말은 `famWord()`: 2권 단어 가족 · 3권 짝꿍 소리 · 4권 긴 모음.
- 2권(`bk=2`): 범위 u1~u10·r1·r2·all, 글자 대신 **단어 가족**. Level 1 = 그림 보고 모음 고르기 6 · 빠진 모음 쓰기 6 · 단어 가족 고르기(-at/-an/-ap) 4 · 첫 글자 쓰기 4. Level 2 = 단어 읽고 그림 고르기 6 · 그림 보고 단어 쓰기 6(단어 상자) · 그림–단어 잇기 4 · 마지막 글자 쓰기 4. Level 3 = 문장 읽고 그림 고르기 6(유닛 `sentences`) · 사이트워드 문장 완성 4 · 단어 쓰기 6 · 가족별 분류 4.
- **최종 평가** = 범위 `all`: 제목 "최종 평가 Final Test (Units 1–10)". 홈페이지 권 카드의 🏁 최종 평가 단추·선생님 자료 칸·진도표 마지막 차시에서 연결.
- PDF 묶음(`python tools/pdf.py tests`, 묶음마다 맨 앞에 **차례** 한 장 — 시험지 2쪽·말하기 1쪽으로 쪽 번호): `PopPhonics{N}_Tests_Units.pdf`(유닛마다 Level 1(1~4)/2(6~10) A형 + 정답지) · `_Tests_Review.pdf`(r1·r2 × Level 1~3 × A/B + 정답지 + 말하기 2장) · **`_FinalTest.pdf`**(all × Level 1~3 × A/B + 정답지 + 말하기 1장, 차례 장에 수준 고르기·점수 보기 안내). 그림은 `build/art_small/`(360px 축소). `index.json` 은 있던 목록에 합쳐진다.
- `python tools/pdf.py teacher`: `PopPhonics{N}_LessonPlans.pdf`(lesson-plan `u=all`) · `PopPhonics{N}_Pronunciation.pdf` · `PopPhonics_HowTo.pdf`(1권 실행 때만, index.json `"book": 0` = 권 공통). 전체 실행에도 포함.
- 학생책·워크북 유닛 PDF 는 홀수 쪽이면 끝에 빈 쪽을 붙여 짝수로(양면 인쇄 — `pad_even`, `pip install pypdf` 가 있을 때만). index.json 제목은 `Pop! Phonics N · …` 로 권 이름을 붙이고(옛 항목도 다음 실행 때 붙임), 홈페이지는 권 카드 안 "PDF 내려받기"(접는 칸, 교재·스토리북·시험·정답·선생님 자료 묶음)에.

## 교사용 정답지 (`web/teacher/answers.html?bk=1&u=N`)
- 워크북 쪽 전부 + 학생책 확인(`check`)·복습 평가(`review_test`) 쪽을 교재 인쇄와 같은 함수로 그려(씨앗 고정이라 배치가 같다) A4 가로에 2쪽씩, 정답은 빨강(고르기 테두리·빈 칸 글자·잇기 꼬리표·분류 상자에 단어·쓰기 칸 흐린 정답·듣기 문항의 🔊 내용). `u` 없으면 그 권 전체.
- `python tools/pdf.py answers` → `PopPhonics1_Answers.pdf`, `--book 2` → `PopPhonics2_Answers.pdf` (그림은 시험지처럼 `build/art_small/` 축소본). 전체 실행에도 포함. 홈페이지 선생님 자료 칸 "✅ 정답지" 에 권별 링크와 PDF. 수업안의 숙제 줄이 그 유닛 정답지로 연결된다.
- 선생님 자료(수업안·플래시카드·가정통신문·진도표·이야기 지도)는 3·4권 가족 이름을 `famLab`(sh·a_e·-nd)으로, 쪽 번호는 앞 유닛들의 실제 쪽 수로 센다.

## 자동 점검 (`python tools/qa.py`)
- 모든 권(book.json 이 있는 권)의 학생책·워크북 쪽, 수업 슬라이드 전부(두 크기: 필기판을 켠 기본 = 세로 1300, `board=0` 16:9 전체화면 = 세로 900, 라벨 끝 "16:9"), 인쇄 쪽, 스토리북, 표지, 시험지, 선생님 자료를 헤드리스 크롬으로 열어 `build/qa_report.html` 을 만든다. 4권 전부 약 12분(창 4~5개).
- 넘침: 쪽(꼬리말 위)·슬라이드·종이 밖으로 나간 요소, 칸보다 넓은 글자, **overflow:hidden 상자 안에서 잘려 안 보이는 내용**("안의 내용이 잘림"). 잘리는 상자 안의 위치 넘침(움직이는 장면 그림 등)은 세지 않는다.
- `--only 16:9`(라벨에 그 글이 든 화면만) · `--book 3` · `--units 1,5` · `--quick` · `--no-shots` · `--content build/fake_content`(content/ 에 없는 파일은 그 폴더에서 — 권 내용이 오기 전 가짜 자료로 점검). 점검 서버는 HTTP/1.1(연결 재사용)이고, 포트 부족 같은 일시 네트워크 오류는 두 번까지 다시 연다.
- 분류: 실제 버그(콘솔·스크립트 오류, 넘침, 계획에 없는 그림·소리, 404) / 대기(공방에 있는 그림·소리, 대신 틀 파일(`data-alt`)이 있는 소리 — 예 2권 말버릇 catch_b2_pip → catch_pip, 음악, QR, 영상, 아직 쓰는 중인 권 내용). 3·4권은 공방 계획이 아직 없어 그림·소리(sound_sh·catch_b3_* 등)가 "계획에 없는 그림·소리 없음" 으로 많이 나온다 — 공방이 3·4권을 계획하면 대기로 바뀐다.
- 남은 넘침(2026-10-07): 없음 (1~4권). 여러 장 문서(수업안 2쪽째·진도표·이야기 안내서가 A4 한 장을 넘어 다음 장으로 이어짐)는 의도한 것이라 대기로 센다.

## 선생님 모드
`?t=1` 또는 👩‍🏫 단추. 단추가 커지고 ⛶ 전체화면. 키보드: ← → 쪽 넘기기, 스페이스 = 그 쪽의 주 재생 단추.

### 수업 슬라이드 설계 원칙 (`teach.js`) — 큰 화면 수업
- 슬라이드 세로는 화면 칸 비율로 900~1300. 세로 1000 미만(16:9 TV 전체화면·필기판 없음)이면 `.slide.short` — 스토리 옆 칸 등을 촘촘히. 주소에 `board=0` 이면 필기판 없이 연다(점검 도구도 이것으로 16:9 를 본다).
선생님이 앞의 큰 화면(전자칠판·TV)을 누르고, 아이들은 멀리 책상에 앉아 **화면을 만지지 않고** 자기 책을 보며 입으로 답한다(따라 말하기·단어 외치기·번호 외치기·손가락 들기·손동작). 학생 화면(태블릿·집)은 누르는 방식 그대로.
- 아이가 화면을 누르는 전제였던 활동은 → **보기에 큰 번호(1·2·3)** 를 붙여 번호로 답하게, 또는 그림만 보여 주고 단어를 외치면 공개, 또는 선생님이 아이를 불러 답을 듣고 눌러 확인. 번호는 CSS 카운터(`.sl-game .choice`, `.sl-lc .opt`, `.sl-match .col:nth-child(2) .it`, `.sl-fwp .fw-pic`)라 교재 쪽 함수를 그대로 쓴다.
- 한 화면에 한 가지만 크게: 단어 ≥ 60px(큰 카드는 80~96px), 글자 카드 ≥ 120px. 9개가 한 화면이던 것은 2~3장으로(단어 쪽은 글자마다 한 장, 따라 읽기는 3개씩).
- 힌트(`tWrap` 의 ko)는 "선생님은 ~눌러요 / 아이들은 ~외쳐요·자기 책에서 ~해요" 식으로 누가 무엇을 하는지 적는다.
- 슬라이드별: `sounds` 글자마다(그대로, 단어 48px) · `trace` 획순 글자마다 + **짝 찾기 글자마다**(큰 글자 → 작은 글자 보기 4개 번호) · `words` **글자마다 한 장**(큰 글자 + 번호 카드 3장 + 글자별 챈트 `wordChantLetter`) · `read_play` **Read it! 1·2·3**(3개씩) → 소리 잡기(보기 번호, A·B 팀) → 메모리(카드에 번호, 아이가 두 번호를 외치면 선생님이 뒤집기) · `listen_point` 큰 카드 → What's this? → Which one? 1·2·3 → Speed round · `story` 그대로(역할 읽기) · `check`/`review_test` A 보기 번호·B 그림 번호·C 글자 외치기(2권: 읽고 번호·단어→그림 번호·빠진 글자 외치기) · `review_sounds`(글자 130px)·`review_board`(선생님이 굴림, 팀이 외침)·`review_bingo`(아이들은 자기 책 빙고판) · `blend`·`sentences` 그대로 · `family_words` **2장**(가족별 단어 크게+챈트 / Read and find 1~10: 단어 누르면 그림 번호 외치기) · `alphabet_path`·`alphabet_review`·`bridge_path` 다음 글자(가족)를 외치면 선생님이 누름 · `word_hunt` 단어를 외치면 선생님이 단추 · `song`·`recap`·`certificate` 그대로(힌트만).

## 쪽 번호
학생책은 앞붙이 3쪽 뒤에 0유닛 4쪽, 일반 유닛 8쪽(10유닛도 8쪽), 복습 유닛 6쪽. 워크북은 앞붙이 2쪽, 일반 유닛 4쪽, 복습 2쪽 (`pageNo`). 아직 없는 유닛은 기본 쪽수로 센다. 스토리북은 표지 다음 쪽부터 1.
