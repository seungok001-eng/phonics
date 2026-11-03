# 목소리 오디션: 캐릭터·역할마다 후보 목소리 여러 개로 같은 대사 2~3줄을 만들어 들어 보고 하나를 고른다. 전부 일레븐랩스(낱소리만 제미나이라 여기 없음).
# 후보 파일: audio-src/forge/_voices/<캐릭터>/<voice_id>__<줄번호>.mp3, 표: 같은 폴더 meta.json
# 고른 결과: content/voices.json — 캐릭터 키(pip·bun…)와 역할 키(narrator 해설 · instruction 지시문 · word 단어·글자 이름·합치기)
import os, json, time, threading, concurrent.futures, urllib.request, urllib.parse, urllib.error, tempfile
import presets, plan, audio

DIR = os.path.join(presets.AUDIO_DATA, '_voices')
VOICES_JSON = os.path.join(presets.CONTENT, 'voices.json')
EL = 'https://api.elevenlabs.io/v1'
# 캐릭터가 아닌 역할 (이름, 우리말, 설명)
ROLES = {'narrator': ('Narrator', '해설', '장면 해설·스토리북·스토리 문장을 읽어 주는 어른 목소리'),
         'instruction': ('Instruction', '지시문', '"Listen and repeat." 같은 지시문'),
         'word': ('Words', '단어·글자 이름', '단어·사이트워드·글자 이름·합치기 — 또박또박 정확한 발음이 제일 중요')}
# 자동 추천 조건 (일레븐랩스 라벨). premade=True 면 일레븐랩스 기본 목소리도 후보에 넣는다
FILTER = {
    'narrator': {'age': {'young', 'middle_aged'}, 'use': {'narrative_story', 'informative_educational', 'conversational'}, 'premade': True},
    'instruction': {'age': {'young', 'middle_aged'}, 'use': {'informative_educational', 'narrative_story', 'conversational'}, 'premade': True},
    'word': {'age': {'young', 'middle_aged'}, 'use': {'informative_educational', 'narrative_story', 'conversational'}, 'premade': True},
    'pip': {'age': {'young'}, 'use': {'characters_animation'}},
    'bun': {'age': {'young'}},
    'hedgie': {'age': {'young'}},
    'grumble': {'age': {'old', 'middle_aged'}, 'gender': {'male'}},
    'beads': {'age': {'young'}, 'use': {'characters_animation'}},
    'twins': {'age': {'young'}, 'use': {'characters_animation'}},
    'fairy': {'age': {'young'}, 'gender': {'female', 'neutral'}},
}
FALLBACK_LINES = {'narrator': ['A cat is on the bus.', 'The cat eats the apple. Pip gets the leaf!'],
                  'instruction': ['Listen and repeat.', 'Listen and circle.'],
                  'word': ['apple', 'bus', 'cat']}

_lock = threading.RLock()
_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)   # 일레븐랩스 동시 요청 한도(요금제 3개)를 소리 생성과 나눠 쓴다
_busy = {}          # 캐릭터 → 만드는 중인 수
_errors = []        # 최근 오류
_el_pool = {'t': 0, 'voices': []}
_secrets = {}


def setup(secrets): _secrets.update(secrets or {})
def _el_key(): return (_secrets.get('elevenlabs_key') or '').strip()


def _el_get(path):
    req = urllib.request.Request(EL + path, headers={'xi-api-key': _el_key()})
    try:
        with urllib.request.urlopen(req, timeout=60) as f: return json.load(f)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'일레븐랩스 HTTP {e.code}: {e.read().decode("utf-8", "replace")[:200]}')


def _labels(v):
    L = v.get('labels') or {}
    return {k: (L.get(k) or v.get(k) or '') for k in ('language', 'gender', 'age', 'use_case', 'accent', 'descriptive')}


def el_pool(force=False):
    """내 계정에 있는 일레븐랩스 목소리 전부 (10분 캐시)."""
    with _lock:
        if force or time.time() - _el_pool['t'] > 600:
            if not _el_key(): return []
            vs = _el_get('/voices').get('voices', [])
            _el_pool['voices'] = [{'voice_id': v['voice_id'], 'name': v['name'].strip(), 'labels': _labels(v), 'category': v.get('category', ''), 'preview_url': v.get('preview_url') or ''} for v in vs]
            _el_pool['t'] = time.time()
        return list(_el_pool['voices'])


def el_search(q='', age='', gender='', use_case='', language='en', n=20):
    """일레븐랩스 공개 라이브러리 검색. 결과엔 미리듣기 주소(preview_url)가 있어 공짜로 들어 볼 수 있다."""
    qs = {'page_size': n}
    if q: qs['search'] = q
    if age: qs['age'] = age
    if gender: qs['gender'] = gender
    if use_case: qs['use_cases'] = use_case
    if language: qs['language'] = language
    mine = {v['voice_id'] for v in el_pool()}
    out = []
    for v in _el_get('/shared-voices?' + urllib.parse.urlencode(qs)).get('voices', []):
        out.append({'voice_id': v['voice_id'], 'name': (v.get('name') or '').strip(), 'owner': v.get('public_owner_id', ''), 'labels': _labels(v),
                    'preview_url': v.get('preview_url') or '', 'mine': v['voice_id'] in mine, 'free': v.get('free_users_allowed', True)})
    return out


def _el_add(owner, voice_id, name):
    """라이브러리 목소리를 내 계정에 넣는다 (TTS 는 내 계정에 있는 목소리만 된다)."""
    body = json.dumps({'new_name': name[:60]}).encode()
    req = urllib.request.Request(f'{EL}/voices/add/{owner}/{voice_id}', data=body, method='POST', headers={'xi-api-key': _el_key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as f: json.load(f)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'라이브러리 목소리를 계정에 넣지 못함 (키에 Voices 쓰기 권한이 필요하거나, 일레븐랩스 사이트에서 직접 "내 목소리"에 넣어야 함) HTTP {e.code}: {e.read().decode("utf-8", "replace")[:200]}')
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
    except Exception: return {'lines': [], 'cands': []}
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
    """오디션 화면에 보이는 캐릭터·역할 전부: 해설·지시문·단어 + 1~4권 캐릭터. 현재 고른 목소리·대사·후보 포함."""
    books = _books(); vj = _voices_json(); chars = {}
    for k, (nm, ko, role) in ROLES.items():
        chars[k] = {'key': k, 'name': nm, 'ko': ko, 'role': role, 'catch': '', 'book': 0}
    for b in books:
        for k, c in b['book'].get('characters', {}).items():
            if k not in chars: chars[k] = {'key': k, 'name': c.get('name', k), 'ko': c.get('ko', ''), 'role': c.get('role_ko') or c.get('personality', ''), 'catch': c.get('catchphrase', ''), 'book': b['n']}
    for k, c in chars.items():
        c['engine'] = 'elevenlabs'; c['current'] = _current(vj, k)
        if isinstance(c['current'], list): c['slots'] = len(c['current'])
        m = _meta(k)
        c['lines'] = m.get('lines') or _default_lines(k, books)
        c['cands'] = [x for x in m.get('cands', []) if x.get('engine', 'elevenlabs') == 'elevenlabs']
        c['busy'] = _busy.get(k, 0)
    order = ['narrator', 'instruction', 'word', 'pip', 'bun', 'hedgie', 'grumble', 'beads', 'twins', 'fairy']
    return sorted(chars.values(), key=lambda c: (order.index(c['key']) if c['key'] in order else 99, c['key']))


def set_lines(ch, lines):
    m = _meta(ch); m['lines'] = [str(x).strip() for x in lines if str(x).strip()][:4]; _save_meta(ch, m); return m['lines']


# ---------- 후보 만들기 ----------
def _make_one(ch, voice, lines):
    """목소리 하나로 대사 전부 → mp3 (음량 맞춤). 결과를 meta 에 넣는다."""
    vid = voice['voice_id']; files, errs = [], []
    os.makedirs(os.path.join(DIR, ch), exist_ok=True)
    for i, text in enumerate(lines):
        dst = os.path.join(DIR, ch, f'{vid}__{i}.mp3')
        fd, tmp = tempfile.mkstemp(suffix='.mp3'); os.close(fd)
        try:
            try: data = audio.el_tts(text, vid, _el_key())
            except RuntimeError as e:
                if ('voice_not_found' in str(e) or 'HTTP 404' in str(e) or 'HTTP 400' in str(e)) and voice.get('owner'):   # 라이브러리 목소리: 계정에 넣고 다시
                    _el_add(voice['owner'], vid, voice.get('name') or vid); data = audio.el_tts(text, vid, _el_key())
                else: raise
            open(tmp, 'wb').write(data)
            audio.finalize(tmp, dst); files.append(os.path.basename(dst))
        except Exception as e:
            errs.append(f'{text[:20]}: {e}')
        finally:
            if os.path.exists(tmp): os.remove(tmp)
    with _lock:
        m = _meta(ch); m['cands'] = [c for c in m['cands'] if c['voice_id'] != vid]
        if files:
            m['cands'].append({'voice_id': vid, 'name': voice.get('name') or vid, 'engine': 'elevenlabs', 'labels': voice.get('labels') or {}, 'owner': voice.get('owner', ''),
                               'files': files, 'texts': lines[:len(files)], 'created': int(time.time()), 'error': '; '.join(errs)[:300]})
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
    """조건에 맞는 목소리 중 아직 후보가 아닌 것 n 개를 골라 만든다 (지금 목소리가 후보에 없으면 비교용으로 함께). 다른 캐릭터가 이미 고른 목소리는 뺀다."""
    have = {c['voice_id'] for c in _meta(ch).get('cands', [])}
    pre = [v for v in current_voices(ch) if v['voice_id'] not in have]
    vj = _voices_json(); taken = set()
    for k, v in vj.items():
        if k == ch or not isinstance(v, dict): continue
        if v.get('voice_id'): taken.add(v['voice_id'])
        for x in v.get('voices') or []: taken.add(x.get('voice_id'))
    f = FILTER.get(ch, {'age': {'young'}})
    def ok(v):
        L = v['labels']
        if v['voice_id'] in have or v['voice_id'] in taken or L.get('language') not in ('en', ''): return False
        if f.get('age') and L.get('age') not in f['age']: return False
        if f.get('gender') and L.get('gender') not in f['gender']: return False
        if f.get('use') and L.get('use_case') not in f['use']: return False
        return f.get('premade') or v['category'] != 'premade' or L.get('use_case') == 'characters_animation'
    cand = [v for v in el_pool() if ok(v)]
    cand.sort(key=lambda v: (v['labels'].get('use_case') not in (f.get('use') or {v['labels'].get('use_case')}), v['category'] == 'premade', v['name']))
    return sample(ch, pre + cand[:n])


def remove(ch, voice_id):
    m = _meta(ch)
    for c in m.get('cands', []):
        if c['voice_id'] == voice_id:
            for f in c.get('files', []):
                p = os.path.join(DIR, ch, f)
                if os.path.exists(p): os.remove(p)
    m['cands'] = [c for c in m.get('cands', []) if c['voice_id'] != voice_id]; _save_meta(ch, m)


# ---------- 고르기 ----------
def pick(ch, voice_id, name, slot=None):
    """고른 목소리를 content/voices.json 에 적는다. 돌려주는 값: 바뀐 파일."""
    vj = _voices_json(); cur = vj.get(ch) or {}
    if cur.get('voices') or slot is not None:   # 둘이 함께 말하는 캐릭터(핌과 팜): 자리 번호로
        vs = list(cur.get('voices') or []); slot = int(slot or 0)
        while len(vs) <= slot: vs.append({})
        vs[slot] = {'name': name, 'voice_id': voice_id}; vj[ch] = {'engine': 'elevenlabs', 'voices': [x for x in vs if x.get('voice_id')]}
    else:
        vj[ch] = {'engine': 'elevenlabs', 'voice_id': voice_id, 'name': name}
    _save_voices_json(vj)
    return [VOICES_JSON]


def status():
    return {'busy': sum(_busy.values()), 'errors': list(_errors)}
