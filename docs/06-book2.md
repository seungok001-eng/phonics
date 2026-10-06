# 2권 "단어 연못" 설계 (Word Pond — 짧은 모음·합치기)

2026-10-06 밤 작성. 1권 구조를 그대로 잇되, 글자 → **단어 읽기(합치기)** 로 넘어간다. 설정집 `docs/05-story-bible.md` 1·2·5절을 따른다.

## 1. 파일 구조 (여러 권)
- 1권은 지금 자리 그대로: `content/book.json`, `content/units/unitNN.json`.
- 2권부터는 `content/b2/book.json`, `content/b2/units/unitNN.json`, 스토리북 전문 `content/b2/story/storybook.md`.
- `content/books.json` 이 권 목록: `[{"n":1,"dir":"","title":"…"},{"n":2,"dir":"b2/","title":"…"}]`.
- 웹: 주소에 `bk=2` 가 붙으면 `content/b2/` 를 읽는다(없으면 1권). 홈페이지는 권 카드 2장. PDF 는 `python tools/pdf.py --book 2` → 파일 이름에 `2`.
- 그림·소리는 전 권이 `web/assets/` 를 같이 쓴다. **같은 id 는 같은 파일**(1권에서 만든 `word_cat.png` 를 2권도 쓴다). 그래서 2권 전용 id 에는 `b2_`/`sb2_`/`scene_b2_` 접두를 붙인다.

## 2. 유닛 구성 (12유닛, 1권과 같은 틀)
| 유닛 | 글자 묶음(모음) | 단어 예(10개 안팎) | 사이트워드(새로) |
|---|---|---|---|
| 0 | 도입 | — (연못 도착, 비즈 소개, 지도) | — |
| 1 | -at · -an (a) | cat hat bat mat rat · can fan man pan van | the, on |
| 2 | -ap · -ag (a) | cap map nap tap lap · bag tag rag wag | is, in |
| 3 | -et · -en (e) | net pet wet jet vet · hen pen ten men | has, and |
| 4 | -ed · -eg (e) | bed red fed · leg peg beg | big, little |
| 5 | 복습 1~4 (a·e) | 놀이판·빙고·확인 (1권 5유닛 틀) + 이야기: **핍의 첫 단어 "cat!"** | — |
| 6 | -ig · -in (i) | pig big dig wig · pin fin bin win | can, not |
| 7 | -ip · -it (i) | zip lip hip dip · sit hit bit kit | it, up |
| 8 | -og · -ot (o) | dog log fog jog · pot hot dot cot | to, go |
| 9 | -op · -ox (o) | top hop mop pop · box fox ox | we, like |
| 10 | -ug · -un · -up (u) | bug hug mug rug · sun run bun fun · cup pup | you, look |
| 11 | 복습 6~10 (i·o·u) | 1권 11유닛 틀 | — |
| 12 | "The Word Show" | 단어 노래(모음 5개 × 단어 가족)·징검다리 길·단어 사냥·되짚기 공연·수료증 | — |
단어는 예시. 내용 작성 때 **그림으로 그릴 수 있는 명사 위주**로 고르고, 1권 단어(cat·dog·bus·cup·sun·hen·net·pot·box·fox·bed·leg·pig·pin·zip…)는 그대로 재사용한다(id 같음 → 그림 다시 안 만듦).

## 3. 쪽 종류 (학생책 8쪽 + 워크북 4쪽, 유닛마다)
L1(합치기): `blend`(가족 1) · `blend`(가족 2) · `family_words`(두 가족 단어 전부 읽고 그림 잇기 + 챈트) · `read_play`(1권 것 재사용: 단어 단추·소리 잡기)
L2(읽기): `sentences`(그림 있는 문장 4개 읽기) · `story`(half 1) · `story`(half 2) · `check`
워크북: L1 `wb_blend`(빠진 글자 쓰기 + 그림) · `wb_family`(가족별 단어 분류·읽고 잇기) / L2 `wb_sentences`(읽고 맞는 그림 ○, 문장 따라 쓰기) · `wb_write`(그림 보고 단어 쓰기 4선)
복습 5·11: 1권 복습 틀(review_sounds 대신 `review_words`: 단어 카드 격자) · review_board · review_bingo / story · story · review_test, 워크북 `wb_review_letters` 대신 `wb_review_blend` · `wb_review_words`.
12: `word_song` · `bridge_path`(징검다리 A→Z 대신 단어 가족 순서) · `word_hunt` · `story_recap` · `review_test` · `certificate` (1권 12유닛 쪽을 데이터만 바꿔 재사용 가능).

## 4. 데이터 모양
### `content/b2/book.json`
```
{ "series": …(1권과 같음), "book": 2, "title": "… 2", "subtitle": "Short Vowels",
  "style": 1권과 같음(복사), "characters": 1권 4명 + "beads"(아래), "pose_desc": 1권 복사,
  "vowels": {"a": {"sound": "æ"}, "e": {"sound": "e"}, "i": {"sound": "ɪ"}, "o": {"sound": "ɑ"}, "u": {"sound": "ʌ"}},
  "families": {"at": {"vowel": "a", "words": ["cat","hat",…]}, "an": {…}, …},
  "words": {"cat": {"ko": "고양이", "desc": "그림 설명(영어)", "family": "at"}, …}   ← 1권에 있는 단어도 다시 적는다(desc 같게)
  "sight_words": {"the": {"ko": "그", "unit": 1}, …},
  "instructions": 1권 복사 + 2권 지시문(Blend and read. / Read and match. / Read the sentence.),
  "units": [ {"n":0,"title":"The Word Pond","families":[]}, {"n":1,"title":"…","families":["at","an"],"vowel":"a"}, …, {"n":5,"title":"…","families":[],"review":[1,2,3,4]}, …, {"n":12,"title":"The Word Show","families":[],"review":[…],"show":true} ],
  "storybook": {"title": "Pip and the Word Pond", "cover": {"id": "sb2_cover", "desc": …}, "front": [{"id":"sb2_front_1",…},{"id":"sb2_map",…}], "back": [{"id":"sb2_end",…},{"id":"sb2_map_done",…}]} }
```
### 비즈 Beads (2권 새 친구)
```
"beads": {"name": "Beads", "ko": "비즈", "desc": "a small friendly caterpillar whose body is a string of five round beads in rainbow colors (red, orange, yellow, green, blue), big round sparkling eyes, two tiny antennae tipped with little beads, a cheerful open smile, no letters on the beads",
  "personality": "a bead caterpillar who threads letter beads together to make words; counts beads, clicks them together, says the whole word proudly after the sounds", "catchphrase": "Click-clack!", "voice": "Zephyr", "color": "#6CC24A",
  "poses": ["ref","happy","surprised","pointing","thinking","cheering"]}
```
비즈 그림은 공방이 `char_beads_*` 로 만든다. 2권 장면은 **`cast_sheet_b2`**(5명)를 참조한다(1권 캐스트 시트는 그대로 둔다).

### `content/b2/units/unitNN.json` (일반 유닛)
```
{ "unit": 1, "title": "The Cat on the Mat", "title_ko": "…", "vowel": "a", "families": ["at","an"],
  "words": {"at": ["cat","hat","bat","mat","rat"], "an": ["can","fan","man","pan","van"]},
  "sight_words": ["the","on"],
  "sentences": [ {"text": "The cat is on the mat.", "audio": "b2_u01_s1", "pic": "word_cat", "words": ["cat","mat"]}, … 4개 ],   ← pic 은 단어 그림 id 또는 장면 id
  "lessons": [
    {"n":1, "title":"…", "title_ko":"…", "pages":[ {"type":"blend","family":"at"}, {"type":"blend","family":"an"}, {"type":"family_words"}, {"type":"read_play"} ],
            "workbook":[ {"type":"wb_blend"}, {"type":"wb_family"} ]},
    {"n":2, "title":"…", "title_ko":"…", "pages":[ {"type":"sentences"}, {"type":"story","half":1}, {"type":"story","half":2}, {"type":"check"} ],
            "workbook":[ {"type":"wb_sentences"}, {"type":"wb_write"} ]} ],
  "story": 1권과 같은 모양 (panels 4: id "scene_b2_u01_1"…, desc, hidden(그 유닛 단어), lines(audio "b2_u01_l1"…), video "vid_b2_u01_1"; videos 2),
  "check": {"read_circle": [6: {"word": "cat", "pictures": ["cat","hat","can"]}], "match": [4: {"word": …}], "write": [4: {"word": "hat", "missing": 1}]},   ← 듣기 대신 읽기
  "game": {"rounds": [5: {"word": "cat", "pictures": [3]}]},
  "workbook_data": {"blend": [8: {"word":"cat","missing":0|1|2}], "family": {"at": […], "an": […]}, "sentences": [4: {"text": …, "pictures": [2], "answer": 0}], "write": [6단어]},
  "storybook": {"pages": [3: {"id": "sb2_u01_1", "desc": …, "lines": [{"who","text","audio":"sb2_u01_1_1"}], "task": "Find the -at words!", "task_ko": …}]} }
```
음성 id: 대사 `b2_uNN_lK`, 문장 `b2_uNN_sK`, 합치기 `blend_<word>`(대본 "/k/ … /æ/ … /t/ … cat" 은 공방이 만든다), 단어 `word_<word>`(공용), 사이트워드 `sw_<word>`(공용), 스토리북 `sb2_uNN_K_J`, 과제 `sb2_uNN_K_task`, 노래 `b2_u12_sNN`. 전 권 통틀어 중복 금지.

## 5. 이야기 (설정집 2권 줄기)
- 무대: 글자나무 정원 담장 너머 **단어 연못**. 건너려면 글자들이 손을 잡아 징검다리(단어)가 돼야 한다. 유닛마다 돌 두 줄(가족 2개).
- 새 친구 **비즈**: 연못가 애벌레. 글자 구슬을 꿰어 단어를 만든다 — 합치기 장치. "Click-clack!"
- 핍: 1권에서 소리를 얻었다. 2권에서는 소리를 **이어 붙여** 말하려다 거꾸로 붙인다("tac!" 개그). **5유닛에서 처음으로 "cat!"** 을 말한다. 10유닛 다리 완성 → **노래 조각 2**.
- 그럼블: 이제 연못가 갈대숲에서 "Shh!". 등불이 밝아져 밤에 길을 비춰 주는 역할로 조금씩 친구 쪽으로. 11유닛 파티 후 12유닛 공연에서 북을 친다.
- 끝(12·스토리북 끝 쪽): 연못 건너 숲에서 **같은 소리가 두 번** 들린다("sh… sh…") — 3권 쌍둥이 예고.
- 스토리북 2 "Pip and the Word Pond": 40쪽(표지 1 + 앞 2 + 0장 2 + 1~11장 각 3 + 끝 2). 글은 그 유닛까지 배운 단어·사이트워드 + 이름·감탄사.
- 사람 캐릭터 없음(1권과 같음). 한 줄 6단어 이하.

## 6. 공방 (tools/forge)
- `plan.py` 가 `content/books.json` 의 권을 전부 읽는다. 항목 id 가 같으면 한 번만(공용 단어 그림). 2권 장면·스토리북은 `cast_sheet_b2` 참조, 비율은 1권과 같음.
- 캐스트 시트: 권마다 `cast_sheet`(1권 4명), `cast_sheet_b2`(5명 = 그 권 characters 순서). 서버가 기준 그림이 다 승인되면 합성한다.
- 소리: `blend_<word>` 는 sub `blend`, 대본 "/k/ ... /æ/ ... /t/ ... cat" (낱소리 IPA 는 book.json letters·vowels 에서).

## 7. 시험지·선생님 자료
- 시험지 생성기는 `bk=2` 로 2권 단어·가족을 쓴다. 수준 1 = 빠진 글자(모음) · 2 = 단어 읽고 그림 · 3 = 문장 읽기·쓰기.
- 수업안·플래시카드·진도표·가정통신문은 2권 데이터로 자동.
