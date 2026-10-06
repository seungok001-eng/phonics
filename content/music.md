# 노래·음악 — AI 작곡 도구(Suno 등)에 넣을 가사와 지시문

규칙: **유료 구독 상태에서 만든 곡만** 교재에 넣는다(무료 체험 곡은 상업 사용 불가). 만든 곡은 `web/assets/music/<이름>.mp3` 로 저장한다 (지금은 `tools/placeholder_music.py` 가 만든 임시 오르골 곡이 들어 있다 — 진짜 곡으로 덮어쓰면 된다).
파닉스 **낱소리가 들어가는 챈트는 노래 AI에게 부르게 하지 않는다** (소리를 틀리게 부른다). 반주만 만들고, 승인된 TTS 낱소리를 박자에 얹는다.

## 1. 주제가 — Pomi Phonics Song (`theme.mp3`, 약 1분)
- 스타일 지시: `cheerful children's song, ukulele and glockenspiel, claps, 112 bpm, bright, simple melody that 7-year-olds can sing, female and child voices, English, clean mix`
- 가사:
```
[Verse]
Open the little door, what do you see?
A garden of sounds for you and me!
Lily and Max and Pomi too,
Twenty-six trees are waiting for you!

[Chorus]
Pomi, Pomi, hear the sound,
Say it loud and seeds pop out!
Pop! Pop! Pop! A letter tree!
Pomi Phonics, A-B-C!

[Verse 2]
Say the sound and clap your hands,
Trees grow tall across the land.
Digby says "Shh!" but we don't mind,
Sounds are fun, so sing along!

[Chorus]
```

## 2. 알파벳 노래 (`abc_song.mp3`, 약 45초)
- 스타일: `gentle alphabet song for young children, music box and soft piano, 96 bpm, clear slow pronunciation of each letter name, child choir`
- 가사: 글자 이름만 천천히. `A B C D E F G, H I J K L M N O P, Q R S, T U V, W X, Y and Z. Now I know my ABCs. Come and grow the trees with me!`
- 주의: 글자 **이름**만 부른다(소리는 부르지 않는다).

## 3. 스토리 배경음악 (가사 없음, 각 약 1분 30초, 반복 가능)
공통 지시: `instrumental only, no vocals, children's picture-book background music, soft, loopable, no sudden loud parts, volume steady` + 유닛 분위기.
| 파일 | 유닛 | 분위기 지시 |
|---|---|---|
| `u0_intro.mp3` | 0 작은 문 | `curious and magical, music box, soft strings, a sense of discovery` |
| `u1_story.mp3` | 1 Pop! Pop! Pop! | `sunny garden morning, ukulele, glockenspiel, playful pizzicato, light and bouncy` |
| `u2_story.mp3` | 2 오리 연못 | `pond, splashy, marimba and flute, playful` |
| `u3_story.mp3` | 3 염소 | `comic, tuba and clarinet, silly and bouncy` |
| `u4_story.mp3` | 4 열쇠 | `mysterious but friendly, harp and celesta, a door opening` |
| `u5_story.mp3` | 5 정원 산책 | `relaxed stroll, acoustic guitar, whistling` |
| `u6_story.mp3` | 6 밤의 정원 | `night garden, twinkling stars, soft synth pad, music box, calm` |
| `u7_story.mp3` | 7 여왕의 이불 | `royal and cozy, light harpsichord, gentle` |
| `u8_story.mp3` | 8 위로 위로 | `sunrise, rising feeling, strings swell, hopeful` |
| `u9_story.mp3` | 9 화산 | `playful suspense, timpani rolls, comic brass, then relief` |
| `u10_story.mp3` | 10 포미가 노래해 | `joyful celebration, full band, bells, triumphant but sweet` |
| `u11_story.mp3` | 11 정원 파티 | `party, drums, claps, brass, happy ending` |
| `u12_story.mp3` | 12 알파벳 쇼(피날레 한 칸·되짚기 공연) | `grand finale, warm strings and bells, curtain-call feeling, gentle drum, sweet` |

## 4. 챈트 반주 (가사 없음, 4박 박수 느낌, 각 30초 반복)
| 파일 | 쓰임 | 지시 |
|---|---|---|
| `chant_sound.mp3` | 소리 챈트 (A! a! /æ/ /æ/ /æ/! apple, astronaut, arrow!) | `simple 4/4 clap-and-stomp beat, 100 bpm, kids chant backing, no melody, no vocals, 2-bar loop` |
| `chant_word.mp3` | 단어 챈트 | `bouncy 4/4 beat with shaker and tambourine, 104 bpm, no vocals, loopable` |
| `chant_sight.mp3` | 사이트워드 챈트 | `marching beat with snare and woodblock, 96 bpm, no vocals, loopable` |

## 5. 효과음
펑(pop)·딩(chime)·정답·오답은 웹 교재가 코드로 합성한다(`app.js` `Sound.sfx`). 파일 필요 없음.

## 6. 핍의 노래 — Pip's Song (`pips_song.mp3`, 약 1분 30초, 12유닛 "알파벳 쇼")
핍이 잃어버렸던 노래가 바로 이 26소리 노래다. 10유닛에서 등불이 열리며 되찾고, 12유닛에서 다 함께 부른다. 가사 원본은 `content/units/unit12.json` 의 `show.song.lines`(한 줄 = 음성 `u12_s01`~`u12_s29`).
- 스타일 지시: `cheerful alphabet song for young children, ukulele, glockenspiel, claps, 100 bpm, one short line per letter with a clear pause after each, child choir, English, clean mix`
- 주의: 위 규칙대로 **낱소리(/æ/ 같은 부분)는 노래 AI에게 맡기지 않는다**. 두 가지 중 하나로 만든다. ① 반주 + 글자 이름·단어만 부르게 하고(아래 가사에서 `/…/` 를 빼고 입력), 낱소리는 승인된 TTS(`u12_sNN`)를 웹이 얹는다. ② 반주만 만들고 29줄 전부 TTS 로 얹는다.
- 가사 (낱소리는 IPA 표기):
```
A, a, /æ/, apple!      B, b, /b/, bus!        C, c, /k/, cat!
D, d, /d/, dog!        E, e, /e/, egg!        F, f, /f/, fan!
G, g, /g/, goat!       H, h, /h/, hen!        I, i, /ɪ/, ink!
J, j, /dʒ/, jelly!     K, k, /k/, key!        L, l, /l/, lemon!
M, m, /m/, milk!       N, n, /n/, nose!       O, o, /ɑ/, otter!
P, p, /p/, pencil!     Q, q, /kw/, queen!     R, r, /r/, rocket!
S, s, /s/, sun!        T, t, /t/, turtle!     U, u, /ʌ/, umbrella!
V, v, /v/, vet!        W, w, /w/, window!     X, x, /ks/, six!
Y, y, /j/, yogurt!     Z, z, /z/, zebra!

A to Z, we can sing!
Pip can sing! La la la!
La la la! Pip's song!
```

## 7. 2권 "단어 연못" 배경음악 (가사 없음, 각 약 1분 30초, 반복 가능)
공통 지시는 3절과 같다. 파일 이름은 `b2_` 접두(1권과 같은 폴더를 쓴다).
| 파일 | 유닛 | 분위기 지시 |
|---|---|---|
| `b2_u0_intro.mp3` | 0 단어 연못 | `arriving at a wide pond, water ripples, kalimba and soft flute, curious` |
| `b2_u1_story.mp3` | 1 매트 위의 고양이 | `sunny pond bank, ukulele, light wood blocks like clicking beads, playful` |
| `b2_u2_story.mp3` | 2 모자와 가방 | `windy and splashy, marimba, quick runs, comic` |
| `b2_u3_story.mp3` | 3 그물 속 암탉 열 마리 | `clucking hens feeling, bouncy clarinet and banjo, silly` |
| `b2_u4_story.mp3` | 4 그럼블의 침대 | `tender lullaby by lantern light, music box and soft strings, warm` |
| `b2_u5_story.mp3` | 5 핍의 첫 단어 | `hopeful build-up to a small triumph, piano and glockenspiel, then bright` |
| `b2_u6_story.mp3` | 6 돼지와 핀 | `big clumsy pig, tuba and bassoon, bouncy and funny` |
| `b2_u7_story.mp3` | 7 지퍼를 올려! | `chilly wind then cozy picnic, pizzicato strings, light and quick` |
| `b2_u8_story.mp3` | 8 연못 안개 | `foggy and mysterious but friendly, soft pad and harp, a warm light appears` |
| `b2_u9_story.mp3` | 9 여우와 상자 | `sneaky fox chase, pizzicato and woodblock, playful suspense, happy end` |
| `b2_u10_story.mp3` | 10 해님 아래 신나게 | `sunny celebration, strings swell, bells, a bridge completed, joyful` |
| `b2_u11_story.mp3` | 11 연못 파티 | `pond party, drums on a pot, claps, happy, then a quiet curious ending` |
| `b2_u12_story.mp3` | 12 단어 쇼(피날레·되짚기 공연) | `grand finale on the water, warm strings, bells, curtain-call, sweet` |

## 8. 핍의 단어 노래 — Pip's Word Song (`b2_word_song.mp3`, 약 1분 30초, 2권 12유닛 "단어 쇼")
핍이 1권에서 되찾은 소리로 이제 **단어**를 부른다. 가사 원본은 `content/b2/units/unit12.json` 의 `show.song.lines`(한 줄 = 음성 `b2_u12_s01`~`b2_u12_s26`). 모음 5개마다 "A, a, /æ/! Short a!" 한 줄 뒤에 단어 가족을 나열한다.
- 스타일 지시: `bouncy word-family song for young readers, ukulele, glockenspiel, claps and a wood-block click, 104 bpm, one short line per family with a clear pause, child choir, English, clean mix`
- 주의: 1권 규칙과 같다 — **낱소리(/æ/ 같은 부분)는 노래 AI에게 맡기지 않는다.** ① 반주 + 단어 줄만 부르게 하고("Short a!" 줄에서 `/…/` 를 빼고 입력) 모음 소리 줄은 승인된 TTS(`b2_u12_sNN`)를 웹이 얹거나 ② 반주만 만들고 26줄 전부 TTS 로 얹는다.
- 가사 (낱소리는 IPA 표기):
```
A, a, /æ/! Short a!        Cat, hat, bat, mat, rat!     Can, fan, pan, van!
Cap, map, nap, tap!        Bag, tag, rag, wag!
E, e, /e/! Short e!        Net, pet, wet, jet, vet!     Hen, pen, ten, den!
Bed, red, fed! Leg, peg, beg!
I, i, /ɪ/! Short i!        Pig, big, dig, wig, fig!     Pin, fin, bin, win, tin!
Zip, lip, dip, rip!        Sit, hit, kit, pit!
O, o, /ɑ/! Short o!        Dog, log, fog!               Pot, hot, dot, cot!
Top, hop, mop, pop!        Box, fox, ox!
U, u, /ʌ/! Short u!        Bug, hug, mug, rug!          Sun, run, bun, fun!
Cup, pup, up!

Click-clack! We can read!
A, e, i, o, u!
Pip can read! La la la!
```
