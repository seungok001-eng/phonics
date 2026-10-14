# 일레븐랩스 음악으로 Pop! Phonics 음악 27곡 만들기 → 다듬기(앞뒤 무음·음량) → web/assets/music/<이름>.mp3
# 사용: python tools/music_gen.py [이름 ...]   (없으면 전부, 이미 있는 파일은 건너뜀)
import json, os, sys, subprocess, urllib.request, urllib.error, tempfile, wave, time
import numpy as np
ROOT = r'C:\phonics'
OUT = os.path.join(ROOT, 'web', 'assets', 'music')
RAW = os.path.join(tempfile.gettempdir(), 'popphonics_music_raw')   # 원본 (저장소 밖)
os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
KEY = json.load(open(os.path.join(ROOT, 'art-src', 'forge', 'secrets.json'), encoding='utf-8'))['elevenlabs_key']
NOV = 'no vocals, no humming, no choir, no singing, no spoken words'
KIDS = "children's picture book, friendly, gentle, simple melody, loopable, clean mix"
WORLD = {   # 권마다 다른 악기 색
    1: 'sunny flower garden, ukulele, glockenspiel, light pizzicato strings',
    2: 'sparkling duck pond, marimba, soft steel pan, plucky harp, water-drop percussion',
    3: 'green forest path, acoustic guitar, recorder and wooden flute, woodblock, light hand percussion',
    4: 'magic castle, celesta, harpsichord, soft strings, music box, twinkling bells',
}
MOOD = {
    'bright': ('cheerful sunny day, happy and calm', 104),
    'adventure': ('curious little adventure, sense of discovery, friendly and not scary', 96),
    'night': ('quiet cozy night, lullaby, soft and warm, slow', 72),
    'silly': ('silly comic mischief, bouncy and playful cartoon, tuba and bassoon accents', 112),
    'finale': ('joyful celebration finale, party, handclaps and light drums, warm and happy', 108),
}
TRACKS = []
for bk in (1, 2, 3, 4):
    pre = 'bgm_' if bk == 1 else f'bgm_b{bk}_'
    for m, (desc, bpm) in MOOD.items():
        TRACKS.append({'name': pre + m, 'len': 80000, 'inst': True, 'kind': 'bgm',
                       'prompt': f'instrumental background music, {desc}, {WORLD[bk]}, {bpm} bpm, {KIDS}, {NOV}'})
    TRACKS.append({'name': 'song_backing' if bk == 1 else f'song_backing_b{bk}', 'len': 120000, 'inst': True, 'kind': 'backing', 'bpm': 100,
                   'prompt': f"instrumental cheerful children's sing-along backing track, {WORLD[bk]}, soft bass, light drums, exactly 100 bpm, 4/4, steady tempo, simple repeating chords, {NOV}"})
TRACKS.insert(0, {'name': 'chant_beat', 'len': 40000, 'inst': True, 'kind': 'beat', 'bpm': 100,
                  'prompt': f"instrumental gentle children's chant groove, soft warm bass, light ukulele strums on the beat, soft brushed snare, quiet shaker, exactly 100 bpm, 4/4, very steady tempo, calm and friendly, simple 2-bar loop, no harsh clicks, no woodblock, no claps, {NOV}"})
TRACKS.insert(0, {'name': 'abc_song', 'kind': 'song', 'plan': {
    'positive_global_styles': ["gentle children's song", 'kids choir', 'music box', 'soft piano', '96 bpm', 'slow and very clear English', 'each letter name sung clearly and separately'],
    'negative_global_styles': ['rap', 'fast', 'distortion', 'adult solo voice'],
    'sections': [
        {'section_name': 'Verse', 'positive_local_styles': ['clear kids choir', 'one letter per beat'], 'negative_local_styles': ['mumbling'], 'duration_ms': 32000,
         'lines': ['A, B, C, D, E, F, G,', 'H, I, J, K, L, M, N, O, P,', 'Q, R, S, T, U, V,', 'W, X, Y and Z!']},
        {'section_name': 'Outro', 'positive_local_styles': ['happy', 'warm ending'], 'negative_local_styles': [], 'duration_ms': 14000,
         'lines': ['Now I know my ABC,', 'Pop! Phonics, sing with me!']}]}})
TRACKS.insert(0, {'name': 'theme', 'kind': 'song', 'plan': {
    'positive_global_styles': ["bright children's pop song", 'kids choir', 'ukulele', 'glockenspiel', 'handclaps', 'bouncy bass', '112 bpm', 'major key', 'simple catchy melody', 'very clear English diction', 'cheerful and warm'],
    'negative_global_styles': ['rap', 'distortion', 'adult solo voice', 'sad'],
    'sections': [
        {'section_name': 'Verse 1', 'positive_local_styles': ['kids choir', 'light'], 'negative_local_styles': [], 'duration_ms': 18000,
         'lines': ['Open the little door, come and see,', 'A garden of sounds for you and me!', 'Pip lost a song and cannot sing,', "Let's find the sounds in everything!"]},
        {'section_name': 'Chorus', 'positive_local_styles': ['big and catchy', 'handclaps'], 'negative_local_styles': [], 'duration_ms': 18000,
         'lines': ['Pop! Pop! Phonics! Say it loud!', 'Letters make sounds, so sing it proud!', 'Pop! Pop! Phonics! One, two, three,', 'Read with Pip and Bun and me!']},
        {'section_name': 'Verse 2', 'positive_local_styles': ['kids choir', 'playful'], 'negative_local_styles': [], 'duration_ms': 18000,
         'lines': ['Bun says "Let\'s try!" and Hedgie says "Wow!"', 'Grumble says "Shh!" but he\'s smiling now!', 'Seeds go pop and the trees grow tall,', 'Sounds and words for one and all!']},
        {'section_name': 'Chorus', 'positive_local_styles': ['big and catchy', 'handclaps'], 'negative_local_styles': [], 'duration_ms': 18000,
         'lines': ['Pop! Pop! Phonics! Say it loud!', 'Letters make sounds, so sing it proud!', 'Pop! Pop! Phonics! One, two, three,', 'Read with Pip and Bun and me!']},
        {'section_name': 'Outro', 'positive_local_styles': ['happy ending'], 'negative_local_styles': [], 'duration_ms': 6000, 'lines': ['Pop! Pop! Phonics! Pop!']}]}})


def compose(t):
    body = {'composition_plan': t['plan']} if 'plan' in t else {'prompt': t['prompt'], 'music_length_ms': t['len'], 'force_instrumental': t['inst']}
    body['model_id'] = 'music_v1'
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=json.dumps(body).encode(),
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    try: return urllib.request.urlopen(req, timeout=600).read()
    except urllib.error.HTTPError as e: raise RuntimeError(f'HTTP {e.code}: {e.read()[:300]}')


def ff(*a): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *a], check=True)


def bpm_of(path):
    """박자 재기: 에너지 변화의 자기상관에서 60~180 BPM 사이 가장 센 주기"""
    w = os.path.join(tempfile.mkdtemp(), 'b.wav'); ff('-i', path, '-ac', '1', '-ar', '11025', w)
    x = np.frombuffer(wave.open(w).readframes(10 ** 9), dtype=np.int16).astype(float)
    hop = 128; e = np.array([np.sum(x[i:i + 512] ** 2) for i in range(0, len(x) - 512, hop)])
    o = np.maximum(np.diff(np.log1p(e)), 0); o -= o.mean()
    fps = 11025 / hop; lags = np.arange(int(fps * 60 / 180), int(fps * 60 / 60))
    ac = np.array([np.dot(o[:-l], o[l:]) for l in lags])
    return 60 * fps / lags[int(np.argmax(ac))]


def finish(t, raw):
    dst = os.path.join(OUT, t['name'] + '.mp3'); tmp = os.path.join(tempfile.mkdtemp(), 'a.wav')
    tempo = ''
    if t.get('bpm'):
        b = bpm_of(raw)
        for c in (b, b * 2, b / 2):   # 반·두 배로 잡힐 수 있다
            if 0.88 < t['bpm'] / c < 1.12: tempo = f",atempo={t['bpm'] / c:.4f}"; print(f"   bpm {c:.1f} → {t['bpm']}", flush=True); break
        else: print(f'   bpm {b:.1f} (맞추지 않음)', flush=True)
    lufs = -16 if t['kind'] in ('song',) else -19 if t['kind'] == 'bgm' else -17
    ff('-i', raw, '-af', f'silenceremove=start_periods=1:start_threshold=-45dB{tempo},areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I={lufs}:TP=-1.5:LRA=11', '-ar', '44100', tmp)
    ff('-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '128k', dst)
    return dst


only = set(sys.argv[1:])
done, fail = [], []
for t in TRACKS:
    if only and t['name'] not in only: continue
    dst = os.path.join(OUT, t['name'] + '.mp3')
    if os.path.exists(dst) and not only: continue
    raw = os.path.join(RAW, t['name'] + '_raw.mp3')
    print('▶', t['name'], flush=True)
    try:
        if not os.path.exists(raw) or only:
            data = compose(t); open(raw, 'wb').write(data)
        finish(t, raw); done.append(t['name'])
        print('   ok', os.path.getsize(dst) // 1024, 'KB', flush=True)
    except Exception as e:
        fail.append((t['name'], str(e)[:200])); print('   FAIL', str(e)[:200], flush=True)
        if 'quota' in str(e).lower() or '401' in str(e) or '402' in str(e): break
print('done', len(done), 'fail', fail)
