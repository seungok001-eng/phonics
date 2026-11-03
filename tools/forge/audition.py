# 목소리 오디션: 캐릭터·역할마다 후보 목소리 여러 개로 같은 대사 2~3줄을 만들어 들어 보고 하나를 고른다. 전부 일레븐랩스(낱소리만 제미나이라 여기 없음).
# 후보 파일: audio-src/forge/_voices/<캐릭터>/<voice_id>__<줄번호>.mp3 (+ _p1/_p2 = 아이처럼 높인 것, ffmpeg 로 공짜), 표: 같은 폴더 meta.json
# 고른 결과: content/voices.json — 캐릭터 키(pip·bun…)와 역할 키(narrator 해설 · instruction 지시문 · word 단어·글자 이름·합치기), pitch = 높이기 배율
# 후보를 구하는 길 셋: ① 내 계정 목소리(추천) ② 공개 라이브러리(미리듣기 공짜 → 계정에 넣고 후보로) ③ Voice Design(글로 설명해 새 목소리; 나이를 적으면 차단되므로 "tiny cute cartoon…" 식으로)
import os, json, re, time, threading, concurrent.futures, urllib.request, urllib.parse, urllib.error, tempfile, base64, shutil
import presets, plan, audio

DIR = os.path.join(presets.AUDIO_DATA, '_voices')
VOICES_JSON = os.path.join(presets.CONTENT, 'voices.json')
LIB_CACHE = os.path.join(DIR, '_library.json')
EL = 'https://api.elevenlabs.io/v1'
ROLES = {'narrator': ('Narrator', '해설', '장면 해설·스토리북·스토리 문장을 읽어 주는 어른 목소리'),
         'instruction': ('Instruction', '지시문', '"Listen and repeat." 같은 지시문'),
         'word': ('Words', '단어·글자 이름', '단어·사이트워드·합치기 — 또박또박 정확한 발음이 제일 중요')}
# 자동 추천 조건 (일레븐랩스 라벨). premade=True 면 일레븐랩스 기본 목소리도 후보에 넣는다
FILTER = {
    'narrator': {'age': {'young', 'middle_aged'}, 'use': {'narrative_story', 'informative_educational', 'conversational'}, 'premade': True},
    'instruction': {'age': {'young', 'middle_aged'}, 'use': {'informative_educational', 'narrative_story', 'conversational'}, 'premade': True},
    'word': {'age': {'young', 'middle_aged'}, 'use': {'informative_educational', 'narrative_story', 'conversational'}, 'premade': True},
    'grumble': {'age': {'old', 'middle_aged'}, 'gender': {'male'}, 'premade': True},
}
KID = {'age': {'young'}}   # 나머지 캐릭터(아이 목소리): young + 캐릭터용 또는 이름에 아이 느낌
KID_RE = re.compile(r'kid|child|boy|girl|tiny|cute|cartoon|little|toddler|baby|squeak|fairy|elf|pixie|sweet|twinkle|peppy|PP ', re.I)
FALLBACK_LINES = {'narrator': ['A cat is on the bus.', 'The cat eats the apple. Pip gets the leaf!'],
                  'instruction': ['Listen and repeat.', 'Listen and circle.'],
                  'word': ['apple', 'bus', 'cat']}
# Voice Design 설명 (나이·"child" 같은 말을 쓰면 안전 규칙에 걸려 차단된다 — 2026-11-03 시험)
DESIGN = {
    'pip': 'A tiny cute cartoon bird character with a very high, bright, squeaky-sweet little voice, playful and innocent, speaking clear English.',
    'bun': 'A small brave cartoon rabbit character with a bright, bouncy, high, energetic little voice, cheerful and confident, speaking clear English.',
    'hedgie': 'A small shy cartoon hedgehog character with a soft, gentle, high little voice, curious and careful, speaking clear English.',
    'grumble': 'A grumpy sleepy old raccoon grandpa character with a low, gravelly, grumbling voice, slow and cranky but secretly kind, speaking clear English.',
    'beads': 'A small giggly cartoon caterpillar character with a light, quick, clicking, high little voice, playful, speaking clear English.',
    'twins': 'A tiny cheerful cartoon bluebird character with a high, chirpy, sing-song little voice, speaking clear English.',
    'fairy': 'A palm-sized giggly fairy character with a very high, airy, sparkling, whispery-sweet little voice, speaking clear English.',
    'narrator': 'A warm, clear, friendly storyteller for a picture book, calm and gentle, speaking clear American English.',
    'instruction': 'A clear, friendly teacher voice giving short instructions, calm and encouraging, speaking clear American English.',
    'word': 'A very clear, neutral, precise voice pronouncing single English words slowly and accurately, American English.',
}

_lock = threading.RLock()
_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)   # 일레븐랩스 동시 요청 한도(요금제 3개)를 소리 생성과 나눠 쓴다
_busy = {}          # 캐릭터 → 만드는 중인 수
_errors = []        # 최근 오류
_el_pool = {'t': 0, 'voices': []}
_secrets = {}


def setup(secrets): _secrets.update(secrets or {})
def _el_key(): return (_secrets.get('elevenlabs_key') or '').strip()


def _el(path, body=None, method=None):
    req = urllib.request.Request(EL + path, data=json.dumps(body).encode() if body is not None else None, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'xi-api-key': _el_key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as f: return json.load(f)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'일레븐랩스 HTTP {e.code}: {e.read().decode("utf-8", "replace")[:250]}')


def _labels(v):
    L = v.get('labels') or {}
    return {k: (L.get(k) or v.get(k) or '') for k in ('language', 'gender', 'age', 'use_case', 'accent', 'descriptive')}


def el_pool(force=False):
    """내 계정에 있는 일레븐랩스 목소리 전부 (10분 캐시)."""
    with _lock:
        if force or time.time() - _el_pool['t'] > 600:
            if not _el_key(): return []
            vs = _el('/voices').get('voices', [])
            _el_pool['voices'] = [{'voice_id': v['voice_id'], 'name': v['name'].strip(), 'labels': _labels(v), 'category': v.get('category', ''), 'preview_url': v.get('preview_url') or ''} for v in vs]
            _el_pool['t'] = time.time()
        return list(_el_pool['voices'])


def _lib_row(v):
    return {'voice_id': v['voice_id'], 'name': (v.get('name') or '').strip(), 'owner': v.get('public_owner_id', ''), 'labels': _labels(v),
            'preview_url': v.get('preview_url') or '', 'uses': v.get('cloned_by_count', 0) or 0}


def el_search(q='', age='', gender='', use_case='', language='en', n=20):
    """일레븐랩스 공개 라이브러리 검색. 결과엔 미리듣기 주소(preview_url)가 있어 공짜로 들어 볼 수 있다."""
    qs = {'page_size': n}
    if q: qs['search'] = q
    if age: qs['age'] = age
    if gender: qs['gender'] = gender
    if use_case: qs['use_cases'] = use_case
    if language: qs['language'] = language
    mine = {v['voice_id'] for v in el_pool()}
    return [dict(_lib_row(v), mine=v['voice_id'] in mine) for v in _el('/shared-voices?' + urllib.parse.urlencode(qs)).get('voices', [])]


def library(refresh=False):
    """공개 라이브러리의 아이·캐릭터 목소리 훑기(캐릭터용 young 전부 + 아이 느낌 검색어) — 하루 캐시. 미리듣기는 공짜."""
    try:
        c = json.load(open(LIB_CACHE, encoding='utf-8'))
        if not refresh and time.time() - c.get('t', 0) < 86400: rows = c['rows']
        else: raise ValueError
    except Exception:
        seen = {}
        def add(r):
            for v in r.get('voices', []):
                if v.get('preview_url') and (v.get('language') or 'en') == 'en': seen.setdefault(v['voice_id'], _lib_row(v))
        for p in range(3):
            r = _el('/shared-voices?' + urllib.parse.urlencode({'use_cases': 'characters_animation', 'age': 'young', 'page_size': 100, 'page': p, 'language': 'en'})); add(r)
            if not r.get('has_more'): break
        for q in ('kids cartoon', 'little girl', 'little boy', 'young boy', 'young girl', 'children character', 'cute kid', 'childlike', 'toddler', 'squeaky', 'cartoon girl', 'cartoon boy', 'elf', 'fairy', 'grumpy old man', 'old grandpa cartoon'):
            add(_el('/shared-voices?' + urllib.parse.urlencode({'search': q, 'page_size': 50, 'language': 'en'})))
        rows = list(seen.values())
        rows.sort(key=lambda v: (not KID_RE.search(v['name']), -v['uses']))
        os.makedirs(DIR, exist_ok=True); json.dump({'t': time.time(), 'rows': rows}, open(LIB_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    mine = {v['voice_id'] for v in el_pool()}
    return [dict(v, mine=v['voice_id'] in mine) for v in rows]


def _el_add(owner, voice_id, name):
    """라이브러리 목소리를 내 계정에 넣는다 (TTS 는 내 계정에 있는 목소리만 된다)."""
    try: _el(f'/voices/add/{owner}/{voice_id}', {'new_name': name[:60]})
    except RuntimeError as e:
        raise RuntimeError(f'라이브러리 목소리를 계정에 넣지 못함 (키에 Voices 쓰기 권한이 없거나 목소리 자리가 꽉 참): {e}')
    _el_pool['t'] = 0


# ---------- 캐릭터·역할 표 ----------
def _voices_json():
    try: return json.load(open(VOICES_JSON, encoding='utf-8'))
    except Exception: return {}


def _save_voices_json(vj):
    json.dump(vj, open(VOICES_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(VOICES_JSON, 'a', encoding='utf-8').write('\n')


def _meta_path(ch): return os.path.join(DIR, ch, 'meta.json')
def _meta(ch):
    try: return json.load(open(_meta_path(ch), encoding='utf-8'))
    except Exception: return {'lines': [], 'cands': [], 'designs': []}
def _save_meta(ch, m):
    os.makedirs(os.path.join(DIR, ch), exist_ok=True)
    json.dump(m, open(_meta_path(ch), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def _books():
    try: return plan.load_books()
    except Exception: return [{'n': 1, 'dir': '', 'book': plan.load_book(), 'units': plan.load_units()}]


def _default_lines(ch, books):
    """그 캐릭터가 실제로 하는 대사 중 짧은 것 2줄 (1권부터 찾는다)."""
    if ch in FALLBACK_LINES: return list(FALLBACK_LINES[ch])
    found = []
    def walk(o):
        if isinstance(o, dict):
            if o.get('who') == ch and isinstance(o.get('text'), str): found.append(o['text'])
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    for b in books: walk(b['units'])
    good = [t for t in dict.fromkeys(found) if 8 <= len(t) <= 40 and '/' not in t and not t.lower().startswith('shh')]
    if ch == 'grumble': good = [t for t in dict.fromkeys(found) if 6 <= len(t) <= 40 and '/' not in t][:2]
    return good[:2] or ['Hello! I am %s.' % ch.title(), 'Let\'s try it again!']


def _current(vj, k):
    v = vj.get(k) or {}
    if v.get('voices'): return [{'voice_id': x.get('voice_id', ''), 'name': x.get('name', '')} for x in v['voices']]
    return {'voice_id': v.get('voice_id', ''), 'name': v.get('name', '')}


def roster():
    """오디션 화면에 보이는 캐릭터·역할 전부: 해설·지시문·단어 + 1~4권 캐릭터. 현재 고른 목소리·높이기·대사·후보·디자인 미리듣기 포함."""
    books = _books(); vj = _voices_json(); chars = {}
    for k, (nm, ko, role) in ROLES.items():
        chars[k] = {'key': k, 'name': nm, 'ko': ko, 'role': role, 'catch': '', 'book': 0}
    for b in books:
        for k, c in b['book'].get('characters', {}).items():
            if k not in chars: chars[k] = {'key': k, 'name': c.get('name', k), 'ko': c.get('ko', ''), 'role': c.get('role_ko') or c.get('personality', ''), 'catch': c.get('catchphrase', ''), 'book': b['n']}
    for k, c in chars.items():
        c['engine'] = 'elevenlabs'; c['current'] = _current(vj, k); c['pitch'] = (vj.get(k) or {}).get('pitch', 1.0)
        if isinstance(c['current'], list): c['slots'] = len(c['current'])
        m = _meta(k)
        c['lines'] = m.get('lines') or _default_lines(k, books)
        c['cands'] = [x for x in m.get('cands', []) if x.get('engine', 'elevenlabs') == 'elevenlabs']
        c['designs'] = m.get('designs', []); c['design_desc'] = m.get('design_desc') or DESIGN.get(k, '')
        c['busy'] = _busy.get(k, 0)
    order = ['narrator', 'instruction', 'word', 'pip', 'bun', 'hedgie', 'grumble', 'beads', 'twins', 'fairy']
    return sorted(chars.values(), key=lambda c: (order.index(c['key']) if c['key'] in order else 99, c['key']))


def _update_meta(ch, **fields):
    """meta 의 일부만 바꾼다 — 읽고 바로 저장(lock 안)해서 뒤에서 후보를 더하는 작업과 엇갈려 덮어쓰지 않게."""
    with _lock:
        m = _meta(ch); m.update(fields); _save_meta(ch, m); return m


def set_lines(ch, lines):
    return _update_meta(ch, lines=[str(x).strip() for x in lines if str(x).strip()][:4])['lines']


def rescan(ch):
    """폴더에 있는데 meta 에 없는 후보 파일(<voice_id>__0.mp3)을 meta 에 되살린다 (이름·라벨은 계정 목소리 표에서)."""
    pool = {v['voice_id']: v for v in el_pool()}; n = 0
    with _lock:
        m = _meta(ch); have = {c['voice_id'] for c in m.get('cands', [])}; lines = m.get('lines') or []
        d = os.path.join(DIR, ch)
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            mm = re.match(r'^([A-Za-z0-9]{10,})__0\.mp3$', f)
            if not mm or mm.group(1) in have: continue
            vid = mm.group(1); files = [x for i in range(len(lines)) for x in [f'{vid}__{i}.mp3'] if os.path.exists(os.path.join(d, x))]
            if not files: continue
            v = pool.get(vid) or {}
            m.setdefault('cands', []).append({'voice_id': vid, 'name': v.get('name') or vid, 'engine': 'elevenlabs', 'labels': v.get('labels') or {}, 'owner': '', 'files': files, 'texts': lines[:len(files)], 'created': int(os.path.getmtime(os.path.join(d, f))), 'error': '', 'pitched': False})
            have.add(vid); n += 1
        _save_meta(ch, m)
    if n: repitch(ch)
    return n


# ---------- 후보 만들기 ----------
def _variants(ch, vid, i):
    """원음 mp3 에서 높이기 단계 1·2 파일을 만든다 (API 비용 0)."""
    base = os.path.join(DIR, ch, f'{vid}__{i}.mp3')
    for lv, f in audio.PITCH.items():
        if lv == '0': continue
        dst = os.path.join(DIR, ch, f'{vid}__{i}_p{lv}.mp3')
        if not os.path.exists(dst): audio.pitch_mp3(base, dst, f)


def _make_one(ch, voice, lines):
    """목소리 하나로 대사 전부 → mp3 (음량 맞춤) + 높이기 변형. 결과를 meta 에 넣는다."""
    vid = voice['voice_id']; files, errs = [], []
    os.makedirs(os.path.join(DIR, ch), exist_ok=True)
    for i, text in enumerate(lines):
        dst = os.path.join(DIR, ch, f'{vid}__{i}.mp3')
        fd, tmp = tempfile.mkstemp(suffix='.mp3'); os.close(fd)
        try:
            vs = _voices_json().get(ch) or {}; kw = dict(style=float(vs.get('style', 0.25)), stability=float(vs.get('stability', 0.55)), speed=float(vs.get('speed', 0.9)))
            try: data = audio.el_tts(text, vid, _el_key(), **kw)
            except RuntimeError as e:
                if ('voice_not_found' in str(e) or 'HTTP 404' in str(e) or 'HTTP 400' in str(e)) and voice.get('owner'):   # 라이브러리 목소리: 계정에 넣고 다시
                    _el_add(voice['owner'], vid, voice.get('name') or vid); data = audio.el_tts(text, vid, _el_key(), **kw)
                else: raise
            open(tmp, 'wb').write(data)
            audio.finalize(tmp, dst); _variants(ch, vid, i); files.append(os.path.basename(dst))
        except Exception as e:
            errs.append(f'{text[:20]}: {e}')
        finally:
            if os.path.exists(tmp): os.remove(tmp)
    with _lock:
        m = _meta(ch); m['cands'] = [c for c in m['cands'] if c['voice_id'] != vid]
        if files:
            m['cands'].append({'voice_id': vid, 'name': voice.get('name') or vid, 'engine': 'elevenlabs', 'labels': voice.get('labels') or {}, 'owner': voice.get('owner', ''),
                               'files': files, 'texts': lines[:len(files)], 'created': int(time.time()), 'error': '; '.join(errs)[:300], 'pitched': True})
        _save_meta(ch, m)
        if errs: _errors.append(f'{ch} {voice.get("name")}: ' + '; '.join(errs)[:200]); del _errors[:-20]
        _busy[ch] = max(0, _busy.get(ch, 0) - 1)


def sample(ch, voices, lines=None):
    """후보 만들기를 뒤에서 돌린다. voices: [{voice_id, name, labels, owner}]"""
    lines = [str(x).strip() for x in (lines or _meta(ch).get('lines') or []) if str(x).strip()]
    if not lines: lines = _default_lines(ch, _books())
    set_lines(ch, lines)
    n = 0
    for v in voices:
        if not v.get('voice_id'): continue
        with _lock: _busy[ch] = _busy.get(ch, 0) + 1
        _pool.submit(_make_one, ch, v, lines); n += 1
    return n


def repitch(ch=None):
    """이미 있는 후보에 높이기 변형이 없으면 만든다 (API 비용 0). ch 가 없으면 전부."""
    n = 0
    for k in ([ch] if ch else [c['key'] for c in roster()]):
        m = _meta(k)
        for c in m.get('cands', []):
            if c.get('pitched'): continue
            for i, f in enumerate(c.get('files', [])):
                if os.path.exists(os.path.join(DIR, k, f)): _variants(k, c['voice_id'], i); n += 1
            c['pitched'] = True
        _save_meta(k, m)
    return n


def current_voices(ch):
    """지금 정해져 있는 목소리(들)를 후보 모양으로 (비교용)."""
    vj = _voices_json(); v = vj.get(ch) or {}
    pool = {p['voice_id']: p for p in el_pool()}; out = []
    for x in (v.get('voices') or ([v] if v.get('voice_id') else [])):
        p = pool.get(x.get('voice_id')) or {}
        out.append({'voice_id': x['voice_id'], 'name': x.get('name') or p.get('name') or x['voice_id'], 'labels': p.get('labels', {})})
    return out


def ensure_current(ch):
    """지금 목소리가 후보에 없으면 비교용으로 만들어 둔다."""
    have = {c['voice_id'] for c in _meta(ch).get('cands', [])}
    return sample(ch, [v for v in current_voices(ch) if v['voice_id'] not in have])


def suggest(ch, n=6):
    """조건에 맞는 내 계정 목소리 중 아직 후보가 아닌 것 n 개를 골라 만든다 (지금 목소리가 후보에 없으면 비교용으로 함께). 다른 캐릭터가 이미 고른 목소리는 뺀다."""
    have = {c['voice_id'] for c in _meta(ch).get('cands', [])}
    pre = [v for v in current_voices(ch) if v['voice_id'] not in have]
    vj = _voices_json(); taken = set()
    for k, v in vj.items():
        if k == ch or not isinstance(v, dict): continue
        if v.get('voice_id'): taken.add(v['voice_id'])
        for x in v.get('voices') or []: taken.add(x.get('voice_id'))
    f = FILTER.get(ch, KID)
    def ok(v):
        L = v['labels']
        if v['voice_id'] in have or v['voice_id'] in taken or L.get('language') not in ('en', 'de', 'it', 'vi', ''): return False
        if f.get('age') and L.get('age') not in f['age']: return False
        if f.get('gender') and L.get('gender') not in f['gender']: return False
        if f.get('use') and L.get('use_case') not in f['use']: return False
        if f is KID: return L.get('use_case') == 'characters_animation' or bool(KID_RE.search(v['name']))
        return f.get('premade') or v['category'] != 'premade'
    cand = [v for v in el_pool() if ok(v)]
    cand.sort(key=lambda v: (not KID_RE.search(v['name']) if f is KID else v['labels'].get('use_case') not in (f.get('use') or {v['labels'].get('use_case')}), v['category'] == 'premade', v['name']))
    return sample(ch, pre + cand[:n])


def remove(ch, voice_id):
    m = _meta(ch)
    for c in m.get('cands', []):
        if c['voice_id'] == voice_id:
            for f in c.get('files', []):
                for suf in ('', '_p1', '_p2'):
                    p = os.path.join(DIR, ch, f.replace('.mp3', suf + '.mp3'))
                    if os.path.exists(p): os.remove(p)
    m['cands'] = [c for c in m.get('cands', []) if c['voice_id'] != voice_id]; _save_meta(ch, m)


# ---------- Voice Design: 글로 설명해 새 목소리 ----------
def design(ch, desc, text=None):
    """미리듣기 3개를 만들어 _voices/<ch>/design_<id>.mp3 로 저장 (아직 계정엔 안 들어감)."""
    m = _update_meta(ch, design_desc=desc)
    lines = m.get('lines') or _default_lines(ch, _books())
    text = (text or '').strip() or (' '.join(lines) + " Let's try it again, friends! I see an apple and a bus. The cat is on the bed. Can you say it with me? A, B, C!")
    r = _el('/text-to-voice/design', {'voice_description': desc, 'text': text[:1000], 'model_id': 'eleven_ttv_v3', 'output_format': 'mp3_44100_128'})
    os.makedirs(os.path.join(DIR, ch), exist_ok=True); out = []
    for p in r.get('previews', []):
        gid = p['generated_voice_id']; f = f'design_{gid}.mp3'
        open(os.path.join(DIR, ch, f), 'wb').write(base64.b64decode(p['audio_base_64']))
        out.append({'generated_voice_id': gid, 'file': f, 'desc': desc, 'created': int(time.time())})
    with _lock:   # 저장 직전에 다시 읽는다 (그 사이 후보가 더해졌을 수 있다)
        m = _meta(ch); m['designs'] = (out + [d for d in m.get('designs', []) if d['generated_voice_id'] not in {o['generated_voice_id'] for o in out}])[:9]
        _save_meta(ch, m)
    return out


def design_create(ch, gid, name=None):
    """미리듣기 하나를 진짜 목소리로 계정에 넣고 바로 후보를 만든다."""
    m = _meta(ch); d = next((x for x in m.get('designs', []) if x['generated_voice_id'] == gid), None)
    if not d: raise ValueError('없는 미리듣기')
    name = (name or f'{ch.title()} design {gid[:6]}')[:60]
    body = {'voice_name': name, 'voice_description': d['desc'][:500], 'generated_voice_id': gid, 'labels': {'use_case': 'characters_animation', 'age': 'young', 'language': 'en'}}
    try: r = _el('/text-to-voice', body)
    except RuntimeError as e:
        if 'HTTP 404' not in str(e) and 'HTTP 405' not in str(e): raise
        r = _el('/text-to-voice/create-voice-from-preview', body)
    vid = r.get('voice_id')
    if not vid: raise RuntimeError('계정에 넣었는데 voice_id 가 없다: ' + json.dumps(r)[:200])
    _el_pool['t'] = 0
    return sample(ch, [{'voice_id': vid, 'name': name, 'labels': {'use_case': 'characters_animation', 'age': 'young', 'language': 'en', 'descriptive': 'designed'}}])


# ---------- 고르기 ----------
def pick(ch, voice_id, name, slot=None, pitch=None):
    """고른 목소리(와 높이기 배율)를 content/voices.json 에 적는다. 돌려주는 값: 바뀐 파일."""
    vj = _voices_json(); cur = vj.get(ch) or {}
    if cur.get('voices') or slot is not None:   # 둘이 함께 말하는 캐릭터(핌과 팜): 자리 번호로
        vs = list(cur.get('voices') or []); slot = int(slot or 0)
        while len(vs) <= slot: vs.append({})
        vs[slot] = {'name': name, 'voice_id': voice_id}; vj[ch] = {'engine': 'elevenlabs', 'voices': [x for x in vs if x.get('voice_id')]}
    else:
        vj[ch] = {'engine': 'elevenlabs', 'voice_id': voice_id, 'name': name}
    if pitch is not None: vj[ch]['pitch'] = float(pitch)
    elif cur.get('pitch'): vj[ch]['pitch'] = cur['pitch']
    _save_voices_json(vj)
    return [VOICES_JSON]


def set_pitch(ch, pitch):
    vj = _voices_json(); v = vj.setdefault(ch, {'engine': 'elevenlabs'}); v['pitch'] = float(pitch); _save_voices_json(vj); return v['pitch']


def status():
    return {'busy': sum(_busy.values()), 'errors': list(_errors)}


# ---------- 계정 확인 (키를 바꿨을 때) ----------
def _picked():
    """voices.json 에 골라 둔 목소리 전부 [(who, voice_id, name)]."""
    out = []
    for k, v in _voices_json().items():
        if not isinstance(v, dict): continue
        if v.get('voice_id'): out.append((k, v['voice_id'], v.get('name') or ''))
        for x in v.get('voices') or []:
            if x.get('voice_id'): out.append((k, x['voice_id'], x.get('name') or ''))
    return out


def check_account():
    """계정 목소리 수 · 이번 달 글자 사용량(키에 User 읽기 권한이 있을 때만) · 골라 둔 목소리 중 이 계정에 없는 것."""
    pool = {v['voice_id'] for v in el_pool(force=True)}
    quota = None
    try:
        s = _el('/user/subscription'); used, lim = int(s.get('character_count') or 0), int(s.get('character_limit') or 0)
        quota = {'used': used, 'limit': lim, 'left': max(0, lim - used)}
    except RuntimeError: pass
    missing = [{'who': w, 'voice_id': vid, 'name': nm} for w, vid, nm in _picked() if vid not in pool]
    return {'voices': len(pool), 'quota': quota, 'missing': missing}


def restore_missing():
    """계정에 없는 골라 둔 목소리를 공개 라이브러리에서 같은 voice_id 로 찾아 계정에 넣는다."""
    added, failed = [], []
    for m in check_account()['missing']:
        q = m['name'].split(' - ')[0].strip() or m['voice_id']
        hit = next((v for v in el_search(q, n=30, language='') if v['voice_id'] == m['voice_id']), None)
        if not hit: hit = next((v for v in el_search(m['name'], n=30, language='') if v['voice_id'] == m['voice_id']), None) if m['name'] else None
        try:
            if not hit or not hit.get('owner'): raise RuntimeError('라이브러리에서 못 찾음')
            _el_add(hit['owner'], m['voice_id'], m['name'] or hit['name']); added.append(m['name'] or m['voice_id'])
        except Exception as e:
            failed.append(f"{m['who']} {m['name']}: {str(e)[:60]}")
    return {'added': added, 'failed': failed}
