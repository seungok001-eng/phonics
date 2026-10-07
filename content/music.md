# 음악 — Pop! Phonics (1~4권 공용, 모두 9곡)

2026-10-07 사용자 결정: 유닛마다 따로 만들던 배경음악(28곡)을 **분위기별 공용 곡**으로 줄이고, 예전 임시 음악은 모두 새 곡으로 바꾼다.
만드는 곳: Suno(유료 계정, 무료 체험 곡 금지 — 상업 이용 권리). 다 만든 mp3 는 아래 **파일 이름 그대로** `web/assets/music/` 에 넣으면 교재가 알아서 튼다(없으면 조용히 넘어감).

## 원칙
- 낱소리(/b/, /æ/)는 노래 AI 에 부르게 하지 않는다(발음이 틀림). 낱소리가 나오는 노래는 **반주만** 만들고, 교재가 그 위에 녹음된 소리를 박자에 맞춰 얹는다.
- 가사 있는 곡은 2곡뿐: 주제가, 알파벳 노래.
- 배경음악은 대사가 잘 들리게 단순하게(교재가 말할 때 1/4 로 줄인다). 1분 30초~2분, 끝과 처음이 자연스럽게 이어지게(반복 재생).
- 사람 목소리·허밍·"우~" 같은 소리가 배경음악에 들어가면 다시 만든다(대사와 섞임).

## 목록

| # | 파일 이름 | 무엇 | 길이 | 쓰는 곳 |
|---|---|---|---|---|
| 1 | `theme.mp3` | 주제가 (가사 있음, 아이 합창) | 1분~1분 20초 | 홈페이지, 0유닛 시작, 4권 마지막 공연 |
| 2 | `abc_song.mp3` | 알파벳 노래 (가사 있음, 글자 이름만) | 40~50초 | 1권 0유닛 "The Alphabet Song" 쪽 |
| 3 | `bgm_bright.mp3` | 밝은 낮 (정원·연못·즐거운 장면) | 1분 30초~2분 | 이야기 쪽 배경 |
| 4 | `bgm_adventure.mp3` | 모험·찾기 (새 장소, 문, 수수께끼) | 1분 30초~2분 | 이야기 쪽 배경 |
| 5 | `bgm_night.mp3` | 밤·안개·자장가 (조용하고 따뜻하게) | 1분 30초~2분 | 이야기 쪽 배경 |
| 6 | `bgm_silly.mp3` | 장난·소동 (그럼블 작전, 동물 소동) | 1분 30초~2분 | 이야기 쪽 배경 |
| 7 | `bgm_finale.mp3` | 축하·파티·피날레 | 1분 30초~2분 | 이야기 쪽 배경, 공연·수료증 |
| 8 | `chant_beat.mp3` | 챈트 반주 (박수·우드블록, 정확히 100 BPM) | 30~40초 반복 | 소리 챈트·단어 챈트 단추 |
| 9 | `song_backing.mp3` | 노래 반주 (멜로디 악기만, 정확히 100 BPM) | 2분 | 1권 핍의 노래, 2권 단어 노래, 3·4권 쇼 노래 |

유닛별 이야기 배경은 내용 파일의 `story.bgm` 에 위 3~7 중 하나가 적혀 있다(1권 0 모험·1 밝음·2 밝음·3 장난·4 모험·5 밝음·6 밤·7 장난·8 모험·9 장난·10~12 피날레 / 2권 0 모험·1 밝음·2 장난·3 장난·4 밤·5 밝음·6 장난·7 밝음·8 밤·9 모험·10~12 피날레).

---

## 1. 주제가 — "Pop! Phonics Song" (`theme.mp3`)
**Style(Suno 스타일 칸):**
`bright children's pop song, kids choir, ukulele, glockenspiel, handclaps, bouncy bass, 112 bpm, major key, simple catchy melody, very clear English diction, cheerful and warm`

**Lyrics(가사 칸):**
```
[Verse 1]
Open the little door, come and see,
A garden of sounds for you and me!
Pip lost a song and cannot sing,
Let's find the sounds in everything!

[Chorus]
Pop! Pop! Phonics! Say it loud!
Letters make sounds, so sing it proud!
Pop! Pop! Phonics! One, two, three,
Read with Pip and Bun and me!

[Verse 2]
Bun says "Let's try!" and Hedgie says "Wow!"
Grumble says "Shh!" but he's smiling now!
Seeds go pop and the trees grow tall,
Sounds and words for one and all!

[Chorus]
Pop! Pop! Phonics! Say it loud!
Letters make sounds, so sing it proud!
Pop! Pop! Phonics! One, two, three,
Read with Pip and Bun and me!

[Outro]
Pop! Pop! Phonics! ... Pop!
```
(우리말 뜻: 작은 문을 열고 와서 봐요, 너와 나를 위한 소리 정원! 핍은 노래를 잃어서 노래할 수 없어요, 모든 것 속에서 소리를 찾아요! / 팝! 팝! 파닉스! 크게 말해요! 글자가 소리를 내요, 자랑스럽게 불러요! / 번은 "해 보자!", 헤지는 "와!", 그럼블은 "쉿!" 하지만 이제 웃고 있어요! 씨앗이 펑 하고 나무가 쑥쑥 자라요!)

## 2. 알파벳 노래 (`abc_song.mp3`)
**Style:** `gentle children's song, kids choir, music box and soft piano, 96 bpm, slow and clear, each letter name sung clearly and separately`

**Lyrics:**
```
[Verse]
A, B, C, D, E, F, G,
H, I, J, K, L, M, N, O, P,
Q, R, S, T, U, V,
W, X, Y and Z!
[Outro]
Now I know my ABC,
Pop! Phonics, sing with me!
```
글자 이름(에이·비·씨…)만 부르는 노래라 AI 가 불러도 된다. 한 글자씩 또렷하게 나오는지 들어 보고 고른다.

## 3~7. 이야기 배경음악 5곡 (가사 없음)
Suno 에서 **Instrumental 켜기**. 스타일 칸에 아래 문장, 제목은 파일 이름.

| 파일 | Style |
|---|---|
| `bgm_bright.mp3` | `instrumental, sunny garden morning, ukulele, glockenspiel, light pizzicato strings, gentle shaker, 104 bpm, cheerful and calm, simple, loopable, children's picture book, no vocals, no humming` |
| `bgm_adventure.mp3` | `instrumental, curious little adventure, harp, celesta, soft marimba, light flute, 96 bpm, a sense of discovery, friendly and not scary, loopable, children's picture book, no vocals, no humming` |
| `bgm_night.mp3` | `instrumental, quiet night garden, music box, soft warm pad, gentle harp, twinkling bells, 72 bpm, cozy lullaby, calm, loopable, no vocals, no humming` |
| `bgm_silly.mp3` | `instrumental, silly comic mischief, bouncy tuba, bassoon, clarinet, woodblock, pizzicato, 112 bpm, playful cartoon, light and funny, loopable, no vocals, no humming` |
| `bgm_finale.mp3` | `instrumental, joyful celebration finale, bright strings, bells, glockenspiel, handclaps, light drums, 108 bpm, warm and happy, party, loopable, no vocals, no humming` |

## 8. 챈트 반주 (`chant_beat.mp3`)
**Style:** `instrumental, kids classroom chant backing, steady clap and stomp, woodblock, light shaker, exactly 100 bpm, 4/4, no melody, no vocals, simple 2-bar loop, very steady tempo`
- 교재가 1.2초(=2박)마다 소리를 하나씩 얹는다. 박자가 흔들리면 다시 만든다.

## 9. 노래 반주 (`song_backing.mp3`)
**Style:** `instrumental, cheerful children's sing-along backing track, ukulele, glockenspiel, soft bass, light drums, exactly 100 bpm, 4/4, simple repeating melody, 2 minutes, loopable, no vocals, no humming`
- 1권 "핍의 노래"(26줄), 2권 "단어 노래", 3·4권 쇼 노래가 모두 이 반주 위에 녹음된 줄을 박자에 맞춰 얹는다.

## 넣는 방법
1. Suno 에서 곡마다 2~4개 만들어 듣고 가장 좋은 것을 mp3 로 내려받는다.
2. 파일 이름을 위 표대로 바꿔 `C:\phonics\web\assets\music\` 에 넣는다.
3. 말씀해 주시면 앞뒤 무음 자르기·음량 맞춤을 하고 올린다(커밋·배포).
