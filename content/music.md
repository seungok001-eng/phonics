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

## 4. 챈트 반주 (가사 없음, 4박 박수 느낌, 각 30초 반복)
| 파일 | 쓰임 | 지시 |
|---|---|---|
| `chant_sound.mp3` | 소리 챈트 (A! a! /æ/ /æ/ /æ/! apple, astronaut, arrow!) | `simple 4/4 clap-and-stomp beat, 100 bpm, kids chant backing, no melody, no vocals, 2-bar loop` |
| `chant_word.mp3` | 단어 챈트 | `bouncy 4/4 beat with shaker and tambourine, 104 bpm, no vocals, loopable` |
| `chant_sight.mp3` | 사이트워드 챈트 | `marching beat with snare and woodblock, 96 bpm, no vocals, loopable` |

## 5. 효과음
펑(pop)·딩(chime)·정답·오답은 웹 교재가 코드로 합성한다(`app.js` `Sound.sfx`). 파일 필요 없음.
