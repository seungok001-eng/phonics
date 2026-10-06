# 웹 교재·PDF·홈페이지 구조

## 원본 하나 → 셋
`content/book.json`(책 전체: 캐릭터·글자 26·단어 78·사이트워드·지시문·유닛 목록·스토리북 표지/앞뒤 쪽) + `content/units/unitNN.json`(유닛: 쪽 명세·스토리·영상·정리 문제·게임·워크북 자료·스토리북 쪽·복습 자료) 를
- **웹 교재** `web/book/index.html` 이 읽어 쪽을 그린다 (`?b=sb|wb&u=1&p=1&t=1`).
- **스토리북** `web/book/story.html?u=1&p=1` 이 전체화면 그림책으로 읽어 준다 (`u` 는 `cover`·`front`·`back` 또는 유닛 번호).
- **인쇄** `web/book/print.html?b=sb&u=1` 이 같은 그리기 함수로 A4 쪽을 늘어놓고, `print.html?b=story` 는 스토리북 전체를 A5 가로로. `tools/pdf.py` 가 헤드리스 크롬으로 PDF 를 만든다 (쪽마다 QR → 웹 교재·스토리북의 그 쪽).
- **선생님 자료** `web/teacher/lesson-plan.html?u=1`(수업안 2개), `flashcards.html?u=1`(A4 한 장에 4장).
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

## 스토리북 (`story.html` · `print.html?b=story`)
데이터: book.json `"storybook": {"title", "title_ko", "bgm"(선택, 없으면 theme), "cover": {id, desc}, "front": [{id, desc, lines}], "back": [...]}` + 유닛 JSON `"storybook": {"pages": [{"id": "sb_u01_1", "desc", "lines": [{"who", "text", "audio"}], "task", "task_ko", "task_audio"(선택)}]}`. 쪽 순서 = 표지 → front → 0~11유닛 쪽 → back (`app.js storyPages()`).
- 그림 `web/assets/art/<id>.jpg` (4:3, `sb_` 로 시작하면 jpg), 대사 소리 `web/assets/audio/<audio>.mp3`, 과제 소리 `task_audio` 또는 기본 `<쪽 id>_task` (없으면 합성 음성), 배경음악은 그 유닛 `story.bgm`, 표지·앞뒤 쪽은 `storybook.bgm`.
- `story.html?u=1&p=1`: 전체화면 그림책. 넓은 화면(가로 3:2 이상)은 그림 왼쪽(세로 꽉)·글 오른쪽, 좁은 화면은 그림 위·글 아래. 글꼴 Andika 32px 이상. ▶ Read = 자동 읽기(줄마다 불, 아바타 입 움직임, 배경음악 duck, 과제까지 읽고 다음 쪽으로 이어진다, 다시 누르면 멈춤). ← → 키·손가락 밀기·화면 양끝 누르기로 넘기고, ☰ 차례로 유닛별 점프. 쪽마다 과제 chip(누르면 소리). 그림이 없으면 글자 상자.
- 인쇄: A5 가로(210×148mm). 그림이 쪽을 채우고 아래 흰 띠에 대사·과제·QR(story.html 의 그 쪽)·쪽 번호(표지는 번호 없음). `tools/pdf.py` 가 `PomiPhonics1_Storybook.pdf` 로 뽑는다 (`python tools/pdf.py story` 는 스토리북만).
- 학생책 story 쪽의 📙 단추(그 유닛 스토리북 첫 쪽), 홈페이지의 "📙 스토리북 읽기" 와 유닛 카드의 "📙 스토리북" 링크는 storybook 데이터가 있을 때만 나온다.

## 인쇄소용 PDF (`python tools/pdf.py --press`)
- 쪽 크기에 사방 **3mm 도련**을 더한 판형: A4 → 216×303mm, A5 가로 → 216×154mm (`print.html?...&press=1` → `body.press`, `@page` 크기 바꿈). 쪽 배경은 도련 끝까지, 내용 배치는 재단선 기준으로 가정용과 같다. 모서리 4곳에 재단선(2.4mm 선, 재단선에서 0.5mm 띄움). QR·쪽 번호는 재단선 안쪽 13mm(`.ph-foot` 을 올리고 아래 여백을 그만큼 늘림).
- 결과는 `web/pdf/press/` 에 같은 이름으로 + 표지 `PomiPhonics1_SB_Cover.pdf`·`WB_Cover`·`Storybook_Cover` (`web/book/cover.html?b=sb|wb|story&press=1`: 앞표지 = 시리즈명·제목·부제·책 종류·캐릭터 `char_*_ref` 4명, 스토리북은 표지 그림 위에 제목 / 뒤표지 = 소개 글·캐릭터·홈페이지 QR(`qr/site.png`)·ISBN 자리). 책등(spine)은 아직 없다 — 쪽수가 정해지면 넣는다.
- 가정용(지금) 출력 `python tools/pdf.py` 는 그대로(A4·A5 가로, 도련 없음). 홈페이지 PDF 목록은 `web/pdf/index.json` 만 읽는다.

## 파일 이름 규칙 (공방이 만들고 웹이 읽는다)
- 그림 `web/assets/art/`: `char_<id>_<pose>.png`(+ `_blink` `_talk`), `tree_<letter>.png`, `word_<word>.png`, `line_<word>.png`, `scene_<id>.jpg`, `sb_<...>.jpg`(스토리북), `cast_sheet.jpg`
- 소리 `web/assets/audio/`: `name_<letter>` `sound_<letter>` `word_<word>` `sw_<word>` `instr_<key>` 스토리 대사 `<unit JSON 의 audio id>` `catch_<char>` 스토리북 대사·과제 `<storybook audio id>` `<쪽 id>_task` — 전부 `.mp3`
- 음악 `web/assets/music/`: `theme` `abc_song` `uN_story` `chant_sound` `chant_word` (`content/music.md`)
- 영상 `web/assets/video/vid_<id>.mp4`
- QR `web/assets/qr/`: `sb_u01_p1.png` `wb_u01_p1.png` `story_u01_p1.png` `story_cover_p1.png` `story_front_p1.png` `story_back_p1.png` `site.png` (pdf.py 가 만든다)
- **파일이 없어도 깨지지 않는다**: 그림은 글자 상자, 소리는 브라우저 합성 음성(임시), 영상은 그냥 그림, 챈트 반주는 없으면 지금처럼. 그래서 그림·소리가 들어오는 대로 화면이 좋아진다.

## 소리 규칙 (`app.js` Sound)
- `data-say="<id>" data-text="<임시로 읽을 말>"` 인 요소는 누르면 소리가 난다.
- 스토리에서 ▶ 를 누르면 배경음악이 켜지고, 대사가 나올 때 음악이 1/4 로 줄었다가 돌아온다 (`duck`).
- 효과음(펑·딩·정답·오답)은 코드로 합성 — 파일 없음.
- 아바타: `char_<id>_blink` 가 있으면 가끔 눈을 깜빡이고, 대사가 나올 때 `char_<id>_talk` 와 번갈아 입을 움직인다.
- 처음 한 번 "Start" 를 눌러야 소리가 난다 (브라우저 자동 재생 제한).
- `playSeq` 항목의 `wait`(ms) 는 소리 없이 기다리기(역할 읽기), `beat`(ms) 는 소리 길이와 상관없이 고정 간격(챈트 박자).
- 챈트: 소리 챈트·단어 챈트 때 `music/chant_sound.mp3`·`chant_word.mp3` 가 있으면 반주로 틀고(배경음악과 별도, duck 안 함) 소리를 1.2초 박자에 맞춰 이어 붙인다. 없으면 지금처럼 소리 길이대로.

## 놀이·수업 도구
- 소리 잡기 게임(`read_play`·슬라이드): 유닛 JSON 의 5라운드가 끝나면 "🔁 한 번 더" — 유닛 글자·단어에서 무작위 5라운드(바로 앞 라운드와 같은 조합은 피함). 팀 점수판: A·B 를 눌러 현재 팀을 고르고 정답이면 그 팀 +1, 🗑 로 점수 지우기.
- 짝 맞추기 `Memory game` (선생님 슬라이드 `read_play` 3번째 장만, 학생책·인쇄에는 없음): 유닛 단어 6개 × 2 = 12장(4×3). 뒤집으면 단어 소리, 짝이면 그대로 남고 효과음, 다 맞추면 Great job.
- 역할 읽기 🎭 (`story`·슬라이드): 켜고 말풍선의 친구(번·헤지·그럼블)를 누르면 "아이가 읽는 역할"(👧 표시). ▶ 자동 읽기 때 그 줄은 소리 없이 말풍선만 켜지고 2.5초 멈춘다. 핍·해설·both 는 역할이 안 된다.
- 속도 라운드 `Speed round!` (선생님 슬라이드 `listen_point` 2번째 장): 30초 타이머, 유닛 글자·단어 카드가 무작위로 한 장씩 크게(글자 = 소리 말하기, 단어 = 읽기, 카드를 누르면 소리). ✔/✖ 로 다음 카드, 끝나면 맞힌 수.

## 선생님 모드
`?t=1` 또는 👩‍🏫 단추. 단추가 커지고 ⛶ 전체화면. 키보드: ← → 쪽 넘기기, 스페이스 = 그 쪽의 주 재생 단추.

## 쪽 번호
학생책은 앞붙이 3쪽 뒤에 0유닛 4쪽, 일반 유닛 8쪽(10유닛도 8쪽), 복습 유닛 6쪽. 워크북은 앞붙이 2쪽, 일반 유닛 4쪽, 복습 2쪽 (`pageNo`). 아직 없는 유닛은 기본 쪽수로 센다. 스토리북은 표지 다음 쪽부터 1.
