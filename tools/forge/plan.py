# 교재 공방 — content/book.json 과 content/units/*.json 에서 만들 그림·소리 항목 목록을 자동으로 만든다.
# 항목 id 는 내용에서 결정적으로 나오므로 다시 만들어도 같은 항목은 같은 id 다 (server.rebuild 가 상태·그림을 보존한다).
import glob, json, os
import presets

LINE_PROMPT = ('Convert the attached picture into a clean black-outline coloring page for children: same object, same pose, '
               'bold smooth black outlines only, pure white fill, no color, no shading, no gray, white background, no text')


def load_book():
    return json.load(open(os.path.join(presets.CONTENT, 'book.json'), encoding='utf-8'))


def load_units():
    out = []
    for p in sorted(glob.glob(os.path.join(presets.CONTENT, 'units', 'unit*.json'))):
        out.append(json.load(open(p, encoding='utf-8')))
    return out


def letter_unit(book, letter):
    for u in book['units']:
        if letter in u.get('letters', []): return u['n']
    return None


def word_unit(book, word):
    for letter, L in book['letters'].items():
        if word in L['words']: return letter_unit(book, letter)
    return None


def cast_order(book):
    """캐스트 시트에 세우는 순서(왼쪽부터) = book.json characters 순서."""
    return list(book['characters'].keys())


def _item(**kw):
    it = {'status': 'pending', 'raw': '', 'cut': '', 'attempts': 0, 'error': '', 'updated': 0, 'auto_approved': False,
          'flow_url': '', 'prompt_edited': False, 'applied': '', 'gen': '', 'job_type': 'image', 'reference': None, 'unit': None}
    it.update(kw)
    return it


def build_items(book, units):
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
    # 2. 글자나무: 유닛 JSON 에 나오는 글자마다. 첫 나무(tree_a 가 있으면 그것)가 기준
    letters = []
    for u in units:
        for l in u.get('letters', []):
            if l not in letters: letters.append(l)
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
    # 3. 단어 그림 78장 (참조 없음) + 4. 선 그림 78장 (단어 그림을 참조)
    for w, W in book['words'].items():
        items.append(_item(id=f'word_{w}', kind='word', word=w, title=f"{w} · {W['ko']}", unit=word_unit(book, w),
                           prompt=f"{st['art']} {st['object']} The object: {W['desc']}.", aspect='1:1', out=f'web/assets/art/word_{w}.png'))
    for w, W in book['words'].items():
        items.append(_item(id=f'line_{w}', kind='line', word=w, title=f"{w} 선 그림 · {W['ko']}", unit=word_unit(book, w),
                           prompt=LINE_PROMPT, reference=f'word_{w}', aspect='1:1', out=f'web/assets/art/line_{w}.png'))
    # 5. 캐스트 시트: 생성하지 않고 서버가 승인된 캐릭터 기준 그림 4장을 합성한다
    items.append(_item(id='cast_sheet', kind='cast', title='캐스트 시트 (기준 그림 4장 합성)', prompt='(서버가 합성한다 — 캐릭터 기준 그림이 모두 승인되면 자동)',
                       aspect='16:9', out='web/assets/art/cast_sheet.png', made_from=None))
    # 6. 스토리 장면 (캐스트 시트를 참조) + 7. 영상 (승인된 장면 그림에서, 플로우로만)
    order = cast_order(book)
    names = ', '.join(chars[c]['name'] for c in order)
    who = ' '.join(f"{chars[c]['name']} is {chars[c]['desc']}." for c in order)
    for u in units:
        for p in (u.get('story') or {}).get('panels', []):
            prompt = (f"{st['art']} {st['scene']} The characters must look exactly like the ones in the attached character sheet (left to right: {names}). "
                      f"Scene: {p['desc']} Characters: {who}")
            items.append(_item(id=p['id'], kind='scene', title=f"{u['unit']}유닛 장면 · {p['id'].split('_')[-1]}", unit=u['unit'],
                               prompt=prompt, reference='cast_sheet', aspect='4:3', out=f"web/assets/art/{p['id']}.jpg"))
        for v in u.get('videos', []):
            items.append(_item(id=v['id'], kind='video', job_type='video', title=f"{u['unit']}유닛 영상 · {v['id'].split('_')[-1]} ({v.get('seconds', 8)}초)", unit=u['unit'],
                               prompt=v['prompt'], reference=v['from'], seconds=v.get('seconds', 8), aspect='4:3', out=f"web/assets/video/{v['id']}.mp4"))
    return items


def _sound(**kw):
    s = {'cands': [], 'approved': None, 'final': '', 'applied': '', 'text_edited': False, 'error': '', 'unit': None, 'letter': None}
    s.update(kw)
    return s


def build_sounds(book, units):
    """소리 항목 전부. 유닛 JSON 에 이미 있는 id(name_a, sound_b, word_cup …)와 겹치면 한 번만."""
    out = []; seen = set()
    nar = book.get('narrator_voice', 'Kore'); ins = book.get('instruction_voice', nar)
    def add(s):
        if s['id'] in seen: return
        seen.add(s['id']); out.append(s)
    for l, L in book['letters'].items():
        u = letter_unit(book, l)
        add(_sound(id=f'name_{l}', sub='name', title=f'글자 이름 {l.upper()}', text=l.upper(), voice=nar, unit=u, letter=l))
        add(_sound(id=f'sound_{l}', sub='sound', title=f"낱소리 /{L['sound']}/ ({l})", text=l, voice=nar, unit=u, letter=l, hint=L.get('sound_hint', '')))
    for w in book['words']:
        add(_sound(id=f'word_{w}', sub='word', title=f"단어 {w} · {book['words'][w]['ko']}", text=w, voice=nar, unit=word_unit(book, w)))
    for w, S in book['sight_words'].items():
        add(_sound(id=f'sw_{w}', sub='sw', title=f"사이트워드 {w} · {S['ko']}", text=w, voice=nar, unit=S.get('unit')))
    for u in units:
        for p in (u.get('story') or {}).get('panels', []):
            for ln in p.get('lines', []):
                aid = ln.get('audio')
                if not aid or aid in seen: continue
                c = book['characters'].get(ln.get('who'))
                voice = (c or {}).get('voice') or nar
                who_ko = c['ko'] if c else {'narrator': '해설', 'both': '함께'}.get(ln.get('who'), ln.get('who'))
                add(_sound(id=aid, sub='line', title=f"{u['unit']}유닛 대사 · {who_ko}: {ln['text']}", text=ln['text'], voice=voice, unit=u['unit']))
    for k, t in book.get('instructions', {}).items():
        add(_sound(id=f'instr_{k}', sub='instr', title=f'지시문 · {t}', text=t, voice=ins))
    # 캐릭터 말버릇 (0유닛 친구들 소개 쪽: catch_<id>). 괄호 설명뿐인 것(포미 "(glows)")은 뺀다
    for cid, c in book.get('characters', {}).items():
        t = c.get('catchphrase', '').strip()
        if t and not t.startswith('('):
            add(_sound(id=f'catch_{cid}', sub='line', title=f"말버릇 · {c.get('ko', cid)}: {t}", text=t, voice=c.get('voice') or nar, unit=0))
    return out


SOUND_SUBS = {'name': '글자 이름', 'sound': '낱소리', 'word': '단어', 'sw': '사이트워드', 'line': '스토리 대사', 'instr': '지시문'}
