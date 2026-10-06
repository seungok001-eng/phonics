# 교재 공방(forge) — 경로·상수·기본 설정·목소리·낱소리 후보 표.
# 교재 내용(캐릭터·글자·단어·장면)은 여기 없고 content/ 에서 읽는다 (plan.py).
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # C:\phonics
CONTENT = os.path.join(ROOT, 'content')
ART_DATA = os.path.join(ROOT, 'art-src', 'forge')       # 그림 원본·완성·상태
AUDIO_DATA = os.path.join(ROOT, 'audio-src', 'forge')   # 소리 후보·완성·상태
WEB = os.path.join(ROOT, 'web')
GAME_SECRETS = r'C:\game\art-src\charforge\secrets.json'  # 첫 실행 때 여기서 제미나이 키를 복사해 온다

# 그림 분류 (왼쪽 메뉴 순서)
KINDS = {'char': '캐릭터', 'cand': '캐릭터 후보', 'tree': '글자나무', 'word': '단어 그림', 'line': '선 그림', 'cast': '캐스트 시트', 'scene': '스토리 장면', 'video': '영상'}

POSE_KO = {'ref': '기준', 'happy': '기쁨', 'surprised': '놀람', 'pointing': '가리키기', 'waving': '손 흔들기', 'thinking': '생각', 'cheering': '환호',
           'glow': '빛남', 'sad': '슬픔', 'hiding': '숨기', 'sleeping': '잠', 'shh': '쉿', 'popping': '튀어나옴', 'angry': '화남', 'drum': '북치기',
           'blink': '눈 감음', 'talk': '말하기'}

# 나노바나나 모델과 한 장당 값 (달러, 2026-09-20 ai.google.dev/gemini-api/docs/pricing)
GEMINI_MODELS = {
    'gemini-3.1-flash-image': {'name': '나노바나나 2 (3.1 Flash Image)', 'price': {'512px': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151}},
    'gemini-3.1-flash-lite-image': {'name': '나노바나나 2 Lite (3.1 Flash Lite Image)', 'price': {'512px': 0.0336, '1K': 0.0336, '2K': 0.0336, '4K': 0.0336}},
    'gemini-3-pro-image': {'name': '나노바나나 Pro (3 Pro Image)', 'price': {'512px': 0.134, '1K': 0.134, '2K': 0.134, '4K': 0.24}},
}

TTS_MODEL = 'gemini-3.8-flash-tts'
# 제미나이 TTS 목소리 (이름, 느낌). book.json 의 characters[*].voice / narrator_voice 가 이 중 하나
VOICES = [('Kore', '단단함'), ('Leda', '앳됨'), ('Puck', '명랑'), ('Charon', '설명조'), ('Zephyr', '밝음'), ('Fenrir', '들뜸'), ('Orus', '단단함'),
          ('Aoede', '산뜻'), ('Callirrhoe', '느긋'), ('Autonoe', '밝음'), ('Enceladus', '숨소리'), ('Iapetus', '또렷'), ('Umbriel', '느긋'),
          ('Algieba', '부드러움'), ('Despina', '부드러움'), ('Erinome', '또렷'), ('Algenib', '거침'), ('Rasalgethi', '설명조'), ('Laomedeia', '명랑'),
          ('Achernar', '포근'), ('Alnilam', '단단함'), ('Schedar', '고름'), ('Gacrux', '어른'), ('Pulcherrima', '적극'), ('Achird', '친근'),
          ('Zubenelgenubi', '편안'), ('Vindemiatrix', '온화'), ('Sadachbia', '활발'), ('Sadaltager', '박식'), ('Sulafat', '따뜻')]

# 낱소리 후보 대본 규칙 (2026-10-06 TTS 실험 결과):
#   ① "/<IPA>/" — book.json letters[*].sound 를 슬래시로 감싼 것이 가장 깨끗하다 ("/b/" 는 덧붙는 모음 없이, "/æ/" 는 깨끗한 짧은 a).
#      "b" 만 보내면 'buh', "a" 는 글자 이름 'ay', "[b]" 는 엉뚱한 소리가 난다.
#   ② 늘일 수 있는 소리는 늘인 철자("mmm")도 깨끗하다.
#   ③ 같은 글자 첫 단어 음성에서 앞부분 잘라내기 (server.cut_candidate).
#   글자 이름(name_<letter>)은 대문자 한 글자("A")만 보내면 글자 이름으로 읽는다. 긴 지시문을 대본에 넣으면 지시문까지 읽으니 금지.
#   단어·문장·지시문은 "Say slowly and clearly: <text>" 형식이 기본 (짧은 지시는 읽지 않고 <text>만 천천히 읽는다).
STRETCH = {'m': 'mmm', 'n': 'nnn', 's': 'sss', 'f': 'fff', 'v': 'vvv', 'z': 'zzz', 'l': 'lll', 'r': 'rrr'}
SAY_PREFIX = 'Say slowly and clearly: '
# 후보 자동 검사: 후보 wav 를 이 모델에 보내 무엇을 말했는지(덧붙는 모음이 있는지) 적어 둔다. 비용은 거의 0
CHECK_MODEL = 'gemini-3.5-flash-lite'


def sound_variants(letter, ipa):
    """낱소리 기본 후보 대본 (①②). ③ 잘라내기는 따로."""
    out = [f'/{ipa}/']
    if letter in STRETCH: out.append(STRETCH[letter])
    return out


PLOSIVES = set('bcdgjkpqt')          # 단어 앞부분 잘라내기 길이가 짧은 글자
CUT_MS = {'plosive': 180, 'other': 350}

DEFAULT_SETTINGS = {
    'generator': 'flow',          # 기본 생성기: flow(확장) | gemini(API). 항목마다 덮어쓸 수 있다. 영상은 늘 flow
    'auto_approve_ref': False,    # 무인 모드: 기준 그림(캐릭터 ref, 첫 나무)을 나오는 대로 자동 승인
    'max_inflight': 4,            # 확장에 한 번에 걸어 두는 잡 수
    'gemini_model': 'gemini-3.1-flash-image',
    'gemini_size': '1K',          # 512px | 1K | 2K
    'gemini_workers': 2,
    'tts_model': TTS_MODEL,
    'tts_workers': 2,
    'sound_variants': {},         # 낱소리 대본 덮어쓰기 표 (글자 → 대본 목록). 비어 있으면 sound_variants() 규칙
    'say_prefix': SAY_PREFIX,     # 단어·문장·지시문 대본 앞에 붙이는 짧은 지시 (비우면 안 붙임)
    'check_model': CHECK_MODEL,
    'cut_ms': dict(CUT_MS),
    'port': 8766,
    'next_asset_no': 2001,        # 플로우에 올리는 참조 그림 파일 번호 (게임 공방은 1001~ 이라 겹치지 않게)
    'gemini_usage': {'count': 0, 'cost': 0.0},
    'tts_usage': {'count': 0, 'tokens': 0, 'checks': 0},
}
