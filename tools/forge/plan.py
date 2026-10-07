# 교재 공방 — content/book.json 과 content/units/*.json 에서 만들 그림·소리 항목 목록을 자동으로 만든다.
# 항목 id 는 내용에서 결정적으로 나오므로 다시 만들어도 같은 항목은 같은 id 다 (server.rebuild 가 상태·그림을 보존한다).
import glob, json, os
import presets

LINE_PROMPT = ('Convert the attached picture into a clean black-outline coloring page for children: same object, same pose, '
               'bold smooth black outlines only, pure white fill, no color, no shading, no gray, white background, no text')


def load_book(sub=''):
    return json.load(open(os.path.join(presets.CONTENT, sub, 'book.json'), encoding='utf-8'))


def load_units(sub=''):
    out = []
    for p in sorted(glob.glob(os.path.join(presets.CONTENT, sub, 'units', 'unit*.json'))):
        out.append(json.load(open(p, encoding='utf-8')))
    return out


def load_books():
    """content/books.json 의 권 목록 [{n, dir}] — 없으면 1권(content/ 바로 아래)만. 권마다 {n, dir, book, units}."""
    lst = [{'n': 1, 'dir': ''}]
    idx = os.path.join(presets.CONTENT, 'books.json')
    if os.path.exists(idx):
        try: lst = json.load(open(idx, encoding='utf-8'))
        except Exception: pass
    out = []
    for b in lst:
        sub = (b.get('dir') or '').strip('/').replace('/', os.sep)
        if not os.path.exists(os.path.join(presets.CONTENT, sub, 'book.json')): continue
        out.append({'n': int(b.get('n', len(out) + 1)), 'dir': sub, 'book': load_book(sub), 'units': load_units(sub)})
    return out


def letter_unit(book, letter):
    for u in book['units']:
        if letter in (u.get('letters') or []): return u['n']
    return None


def word_unit(book, word, units=None):
    for letter, L in (book.get('letters') or {}).items():
        if word in (L.get('words') or []): return letter_unit(book, letter)
    for u in (units or []):   # 2권~: 유닛 JSON 의 words {"at": ["cat", ...]}
        for ws in (u.get('words') or {}).values():
            if word in ws: return u['unit']
    return None


def cast_order(book):
    """캐스트 시트에 세우는 순서(왼쪽부터) = book.json characters 순서."""
    return list(book['characters'].keys())


def _item(**kw):
    it = {'status': 'pending', 'raw': '', 'cut': '', 'attempts': 0, 'error': '', 'updated': 0, 'auto_approved': False,
          'flow_url': '', 'prompt_edited': False, 'applied': '', 'gen': '', 'job_type': 'image', 'reference': None, 'unit': None}
    it.update(kw)
    return it


def build_items(book, units, bk=1):
    """그림·영상 항목 전부 (플랜 순서 = 생성 순서)."""
    st = book['style']; chars = book['characters']; pose_desc = book['pose_desc']
    items = []
    same = 'SAME character as the attached reference image: identical face, hair, clothes and colors. Only the pose and expression change.'
    # 1. 캐릭터: 자세마다 한 장. ref 가 기준(참조 없음), 나머지는 ref 를 참조. blink·talk 는 기준 자세에서 눈·입만 바뀐 짝 그림
    for cid, c in chars.items():
        for pose in list(c['poses']) + ['blink', 'talk']:
            if pose == 'blink': pd = f"{pose_desc['ref']}, but with BOTH EYES CLOSED (mid-blink), everything else exactly the same as the reference"
            elif pose == 'talk': pd = f"{pose_desc['ref']}, but with the MOUTH OPEN as if speaking mid-word, everything else exactly the same as the reference"
            else: pd = pose_desc.get(pose, pose)
            ref = None if pose == 'ref' else f'char_{cid}_ref'
            prompt = f"{st['art']} {st['character_sheet']} The character: {c['name']}, {c['desc']}. Pose: {pd}."
            if ref: prompt += ' ' + same
            items.append(_item(id=f'char_{cid}_{pose}', kind='char', char=cid, pose=pose, title=f"{c['ko']} · {presets.POSE_KO.get(pose, pose)}",
                               prompt=prompt, reference=ref, aspect='3:4', out=f'web/assets/art/char_{cid}_{pose}.png'))
    # 1-1. 캐릭터 후보 (설정집 docs/05-story-bible.md): 기준 자세 한 장씩, 참조 없음. 사용자가 고르면 characters 로 옮긴다
    for cid, c in book.get('character_candidates', {}).items():
        prompt = f"{st['art']} {st['character_sheet']} The character: {c['name']}, {c['desc']}. Pose: {pose_desc['ref']}."
        items.append(_item(id=f'cand_{cid}', kind='cand', char=cid, pose='ref', title=f"후보 · {c['ko']} · {c.get('role', '')}",
                           prompt=prompt, reference=None, aspect='3:4', out=f'web/assets/art/cand_{cid}.png'))
    # 2. 글자나무: 유닛 JSON 에 나오는 글자마다. 첫 나무(tree_a 가 있으면 그것)가 기준
    letters = []
    for u in units:
        for l in (u.get('letters') or []):
            if l not in letters and l in (book.get('letters') or {}): letters.append(l)
    base_tree = 'a' if 'a' in letters else (letters[0] if letters else None)
    for l in letters:
        fruits = [book['words'][w]['desc'] for w in book['letters'][l]['words'] if w in book['words']]
        prompt = (f"{st['art']} A round, friendly storybook letter tree with a thick short trunk and a big round leafy green crown, standing alone. "
                  f"Three fruits hang from its branches like apples on strings: {fruits[0]}; {fruits[1]}; {fruits[2]} — each drawn small, clearly recognizable, hanging from a branch. "
                  f"On the trunk hangs a small BLANK wooden sign with absolutely nothing written on it (the sign is empty). "
                  f"Plain pure white background, no ground, no shadow, nothing else. Absolutely no letters, text, numbers or symbols anywhere.")
        ref = None if l == base_tree else f'tree_{base_tree}'
        if ref: prompt += ' Same tree style as the attached reference image: same trunk, crown shape, colors and blank sign — only the three fruits are different.'
        items.append(_item(id=f'tree_{l}', kind='tree', letter=l, title=f'글자나무 {l.upper()}', unit=letter_unit(book, l),
                           prompt=prompt, reference=ref, aspect='3:4', out=f'web/assets/art/tree_{l}.png'))
    # 3. 단어 그림 (참조 없음) + 4. 선 그림 (단어 그림을 참조) — 같은 단어는 전 권이 같은 id·파일
    for w, W in book['words'].items():
        items.append(_item(id=f'word_{w}', kind='word', word=w, title=f"{w} · {W['ko']}", unit=word_unit(book, w, units),
                           prompt=f"{st['art']} {st['object']} The object: {W['desc']}.", aspect='1:1', out=f'web/assets/art/word_{w}.png'))
    for w, W in book['words'].items():
        items.append(_item(id=f'line_{w}', kind='line', word=w, title=f"{w} 선 그림 · {W['ko']}", unit=word_unit(book, w, units),
                           prompt=LINE_PROMPT, reference=f'word_{w}', aspect='1:1', out=f'web/assets/art/line_{w}.png'))
    # 5. 캐스트 시트: 생성하지 않고 서버가 승인된 캐릭터 기준 그림을 합성한다 (권마다 하나: cast_sheet, cast_sheet_b2 ...)
    order = cast_order(book)
    cast_id = 'cast_sheet' if bk == 1 else f'cast_sheet_b{bk}'
    items.append(_item(id=cast_id, kind='cast', chars=order, title=f'{bk}권 캐스트 시트 (기준 그림 {len(order)}장 합성)', prompt='(서버가 합성한다 — 캐릭터 기준 그림이 모두 승인되면 자동)',
                       aspect='16:9', out=f'web/assets/art/{cast_id}.png', made_from=None))
    # 6. 스토리 장면 (캐스트 시트를 참조) + 7. 영상 (승인된 장면 그림에서, 플로우로만)
    names = ', '.join(chars[c]['name'] for c in order)
    who = ' '.join(f"{chars[c]['name']} is {chars[c]['desc']}." for c in order)
    for u in units:
        for p in (u.get('story') or {}).get('panels', []):
            prompt = (f"{st['art']} {st['scene']} The characters must look exactly like the ones in the attached character sheet (left to right: {names}). "
                      f"Scene: {p['desc']} Characters: {who}")
            items.append(_item(id=p['id'], kind='scene', title=f"{bk}권 {u['unit']}유닛 장면 · {p['id'].split('_')[-1]}", unit=u['unit'],
                               prompt=prompt, reference=cast_id, aspect='4:3', out=f"web/assets/art/{p['id']}.jpg"))
        for v in u.get('videos', []):
            items.append(_item(id=v['id'], kind='video', job_type='video', title=f"{bk}권 {u['unit']}유닛 영상 · {v['id'].split('_')[-1]} ({v.get('seconds', 8)}초)", unit=u['unit'],
                               prompt=v['prompt'], reference=v['from'], seconds=v.get('seconds', 8), aspect='4:3', out=f"web/assets/video/{v['id']}.mp4"))
        # 8. 스토리북 쪽 그림 (유닛 JSON storybook.pages, 캐스트 시트 참조, A5 가로에 맞게 4:3)
        for p in (u.get('storybook') or {}).get('pages', []):
            prompt = (f"{st['art']} {st['scene']} Full-page picture-book illustration. The characters must look exactly like the ones in the attached character sheet (left to right: {names}). "
                      f"Scene: {p['desc']} Characters: {who}")
            items.append(_item(id=p['id'], kind='scene', title=f"{bk}권 {u['unit']}유닛 스토리북 · {p['id'].split('_')[-1]}쪽", unit=u['unit'],
                               prompt=prompt, reference=cast_id, aspect='4:3', out=f"web/assets/art/{p['id']}.jpg"))
    # 9. 스토리북 표지·앞·뒤 쪽 (book.json storybook)
    sbk = book.get('storybook') or {}
    extra = ([sbk['cover']] if sbk.get('cover') else []) + list(sbk.get('front', [])) + list(sbk.get('back', []))
    for p in extra:
        prompt = (f"{st['art']} {st['scene']} Full-page picture-book illustration. The characters must look exactly like the ones in the attached character sheet (left to right: {names}). "
                  f"Scene: {p['desc']} Characters: {who}")
        items.append(_item(id=p['id'], kind='scene', title=f"{bk}권 스토리북 · {p['id']}", unit=0,
                           prompt=prompt, reference=cast_id, aspect='4:3', out=f"web/assets/art/{p['id']}.jpg"))
    for it in items: it['book'] = bk
    return items


def _sound(**kw):
    s = {'cands': [], 'approved': None, 'final': '', 'applied': '', 'text_edited': False, 'error': '', 'unit': None, 'letter': None}
    s.update(kw)
    return s


def build_sounds(book, units, bk=1, ipa=None):
    """소리 항목 전부. 유닛 JSON 에 이미 있는 id(name_a, sound_b, word_cup …)와 겹치면 한 번만."""
    out = []; seen = set()
    nar = book.get('narrator_voice', 'Kore'); ins = book.get('instruction_voice', nar)
    def add(s):
        if s['id'] in seen: return
        seen.add(s['id']); out.append(s)
    for l, L in (book.get('letters') or {}).items():
        u = letter_unit(book, l)
        add(_sound(id=f'name_{l}', sub='name', title=f'글자 이름 {l.upper()}', text=l.upper(), voice=nar, unit=u, letter=l))
        add(_sound(id=f'sound_{l}', sub='sound', title=f"낱소리 /{L['sound']}/ ({l})", text=l, voice=nar, unit=u, letter=l, hint=L.get('sound_hint', '')))
    for f, F in (book.get('families') or {}).items():
        if F.get('kind') in ('digraph', 'magic_e', 'team', 'blend', 'final') and F.get('sound'):
            u = next((x['unit'] for x in units if f in (x.get('families') or [])), None)
            add(_sound(id=f"sound_{f.lstrip('-')}", sub='fsound', title=f"짝꿍 소리 /{F['sound']}/ ({f.replace('_', '…')})", text=f"/{F['sound']}/", voice=nar, unit=u, ipa=F['sound']))
    for w in book['words']:
        add(_sound(id=f'word_{w}', sub='word', title=f"단어 {w} · {book['words'][w]['ko']}", text=w, voice=nar, unit=word_unit(book, w, units)))
    # 합치기(2권~): 단어 가족이 있는 단어마다 "/k/ ... /æ/ ... /t/ ... cat" (낱소리 IPA 는 1권 letters + 이 권 vowels)
    ipa = dict(ipa or {})
    for v, V in (book.get('vowels') or {}).items(): ipa[v] = V.get('sound', v)
    for w, W in book['words'].items():
        if not W.get('family') and not book.get('families'): continue
        if W.get('ipa'): parts = [f"/{p}/" for p in W['ipa']]   # 3·4권: 소리 단위(sh, a_e …)
        elif all(ch in ipa for ch in w): parts = [f"/{ipa[ch]}/" for ch in w]
        else: continue
        add(_sound(id=f'blend_{w}', sub='blend', title=f"합치기 {w}", text=' ... '.join(parts) + f' ... {w}', voice=nar, unit=word_unit(book, w, units)))
    for w, S in book['sight_words'].items():
        add(_sound(id=f'sw_{w}', sub='sw', title=f"사이트워드 {w} · {S['ko']}", text=w, voice=nar, unit=S.get('unit')))
    def add_lines(lines, unit, label):
        for ln in lines:
            aid = ln.get('audio')
            if not aid or aid in seen: continue
            c = book['characters'].get(ln.get('who'))
            voice = (c or {}).get('voice') or nar
            who_ko = c['ko'] if c else {'narrator': '해설', 'both': '함께'}.get(ln.get('who'), ln.get('who'))
            add(_sound(id=aid, sub='line', title=f"{label} · {who_ko}: {ln['text']}", text=ln['text'], voice=voice, unit=unit, who=ln.get('who')))
    for u in units:
        for p in (u.get('story') or {}).get('panels', []):
            add_lines(p.get('lines', []), u['unit'], f"{bk}권 {u['unit']}유닛 대사")
        for i, sn in enumerate(u.get('sentences') or []):   # 2권~: 읽기 문장
            if sn.get('audio'): add(_sound(id=sn['audio'], sub='line', title=f"{bk}권 {u['unit']}유닛 문장 {i + 1}: {sn['text']}", text=sn['text'], voice=nar, unit=u['unit']))
        song = ((u.get('show') or {}).get('song') or {}).get('lines', [])   # 12유닛 노래 가사
        for i, ln in enumerate(song):
            if ln.get('audio'): add(_sound(id=ln['audio'], sub='line', title=f"{bk}권 노래 {i + 1}: {ln['text']}", text=ln['text'], voice=nar, unit=u['unit']))
        for p in (u.get('storybook') or {}).get('pages', []):   # 스토리북 글 + 쪽마다 과제("Find the g things!")는 <쪽id>_task (웹 story.html 이 찾는 이름)
            add_lines(p.get('lines', []), u['unit'], f"{u['unit']}유닛 스토리북")
            if p.get('task'):
                add(_sound(id=p.get('task_audio') or f"{p['id']}_task", sub='instr', title=f"{u['unit']}유닛 스토리북 과제 · {p['task']}", text=p['task'], voice=ins, unit=u['unit']))
    sbk = book.get('storybook') or {}
    for p in list(sbk.get('front', [])) + list(sbk.get('back', [])):
        add_lines(p.get('lines', []), 0, '스토리북')
    for k, t in book.get('instructions', {}).items():
        add(_sound(id=f'instr_{k}', sub='instr', title=f'지시문 · {t}', text=t, voice=ins))
    # 캐릭터 말버릇 (0유닛 친구들 소개 쪽: catch_<id>). 괄호 설명뿐인 것(포미 "(glows)")은 뺀다
    for cid, c in book.get('characters', {}).items():
        t = c.get('catchphrase', '').strip()
        if t and not t.startswith('('):
            add(_sound(id=(f'catch_{cid}' if bk == 1 else f'catch_b{bk}_{cid}'), sub='line', title=f"말버릇 · {c.get('ko', cid)}: {t}", text=t, voice=c.get('voice') or nar, unit=0, who=cid))
    for x in out: x['book'] = bk
    return out


def build_all():
    """모든 권의 항목·소리. 같은 id(공용 단어 그림·소리)는 먼저 나온 권 것만."""
    books = load_books()
    items, sounds = {}, {}
    ipa = {}
    for b in books:
        for l, L in (b['book'].get('letters') or {}).items(): ipa.setdefault(l, 'ks' if L.get('final') else L['sound'])
    for b in books:
        for it in build_items(b['book'], b['units'], b['n']): items.setdefault(it['id'], it)
        for sd in build_sounds(b['book'], b['units'], b['n'], ipa): sounds.setdefault(sd['id'], sd)
    return list(items.values()), list(sounds.values()), books


SOUND_SUBS = {'name': '글자 이름', 'sound': '낱소리', 'fsound': '짝꿍 소리', 'word': '단어', 'sw': '사이트워드', 'blend': '합치기', 'line': '스토리 대사', 'instr': '지시문'}
