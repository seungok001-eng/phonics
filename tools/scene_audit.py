# 장면 그림 점검: 그림이 그 쪽의 글(해설·대사·숨은 단어·찾기 과제)과 맞는지 제미나이(그림 보기)에 묻는다.
# 사용: python tools/scene_audit.py [--book N] [id ...]   → build/scene_audit.json (+ 화면에 문제 있는 것만)
# 보는 것: 말하는 캐릭터가 그림에 있나 · 해설의 일이 보이나 · 찾기·숨은 물건이 보이나 · 그림 속 글자 · 같은 캐릭터 두 번 · 이상한 모습
import json, os, sys, glob, base64, urllib.request, concurrent.futures as cf, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = json.load(open(os.path.join(ROOT, 'art-src', 'forge', 'secrets.json'), encoding='utf-8'))['gemini_key']
MODEL = 'gemini-3.5-flash'
DIRS = {1: 'content', 2: 'content/b2', 3: 'content/b3', 4: 'content/b4'}
NAMES = {'pip': 'Pip (little yellow bird with a green leaf scarf)', 'bun': 'Bun (white rabbit in green boots)', 'hedgie': 'Hedgie (orange hedgehog with a blue flower)',
         'grumble': 'Grumble (old grey raccoon in a striped nightcap, lantern)', 'beads': 'Beads (small colorful caterpillar)',
         'twins': 'Pim and Pam (two tiny twin bluebirds)', 'fairy': 'Fairy E (tiny fairy with a star wand)'}


def pages(bk):
    d = os.path.join(ROOT, DIRS[bk]); out = []
    for f in sorted(glob.glob(os.path.join(d, 'units', 'unit*.json'))):
        u = json.load(open(f, encoding='utf-8'))
        for p in (u.get('story') or {}).get('panels', []) + (u.get('storybook') or {}).get('pages', []): out.append((u['unit'], p))
    return out


def ask(pid, p):
    path = next((os.path.join(ROOT, 'web', 'assets', 'art', pid + e) for e in ('.jpg', '.png') if os.path.exists(os.path.join(ROOT, 'web', 'assets', 'art', pid + e))), None)
    if not path: return {'id': pid, 'error': 'no image'}
    who = set()
    for ln in p.get('lines', []):
        w = ln.get('who'); who |= {'bun', 'hedgie'} if w == 'both' else ({w} if w in NAMES else set())
    lines = '\n'.join(f"- {ln.get('who')}: {ln.get('text')}" for ln in p.get('lines', []))
    find = p.get('task') or ''
    q = f"""You check a children's picture-book illustration against its text. Be strict but fair; only report real, clearly visible problems.
Narration: {(p.get('narr') or {}).get('text', '')}
Lines (speaker: text):
{lines}
Characters who speak here and MUST be visible: {', '.join(NAMES[w] for w in sorted(who)) or 'none'}
Hidden objects that should be findable: {', '.join(p.get('hidden') or []) or 'none'}
Find task: {find}
Scene description used to draw it: {p.get('desc', '')}

Answer ONLY with JSON: {{"missing_speakers": [names not visible], "action_ok": true/false, "action_problem": "what in the narration/lines is not shown (e.g. a character should be hiccupping but is smiling; a key object is too small to see)", "missing_objects": [hidden/find objects not visible], "text_in_image": true/false (any letters/words drawn in the picture), "duplicate_character": "name or empty", "odd": "anything odd (animal standing like a human, extra limbs, wrong character look) or empty"}}"""
    body = {'contents': [{'role': 'user', 'parts': [{'text': q}, {'inline_data': {'mime_type': 'image/jpeg' if path.endswith('.jpg') else 'image/png', 'data': base64.b64encode(open(path, 'rb').read()).decode()}}]}],
            'generationConfig': {'responseMimeType': 'application/json'}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY}, method='POST')
    for k in range(3):
        try:
            res = json.load(urllib.request.urlopen(req, timeout=120))
            r = json.loads(res['candidates'][0]['content']['parts'][0]['text']); r['id'] = pid; return r
        except Exception as e: err = str(e)
    return {'id': pid, 'error': err[:200]}


def bad(r):
    return bool(r.get('error') or r.get('missing_speakers') or r.get('action_ok') is False or r.get('missing_objects') or r.get('text_in_image') or r.get('duplicate_character') or r.get('odd'))


if __name__ == '__main__':
    args = sys.argv[1:]
    books = [int(args[args.index('--book') + 1])] if '--book' in args else [1, 2, 3, 4]
    only = {a for a in args if not a.isdigit() and a != '--book'}
    todo = [(bk, u, p) for bk in books for u, p in pages(bk) if not only or p['id'] in only]
    with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(lambda t: {**ask(t[2]['id'], t[2]), 'book': t[0], 'unit': t[1]}, todo))
    out = os.path.join(ROOT, 'build', 'scene_audit.json'); os.makedirs(os.path.dirname(out), exist_ok=True)
    old = {}
    if os.path.exists(out): old = {r['id']: r for r in json.load(open(out, encoding='utf-8'))}
    old.update({r['id']: r for r in res})
    json.dump(sorted(old.values(), key=lambda r: (r.get('book', 0), r['id'])), open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    probs = [r for r in res if bad(r)]
    print(f'점검 {len(res)}장, 문제 {len(probs)}장 → {out}')
    for r in probs:
        msg = []
        if r.get('error'): msg.append('오류 ' + r['error'])
        if r.get('missing_speakers'): msg.append('말하는데 없음: ' + ', '.join(r['missing_speakers']))
        if r.get('action_ok') is False: msg.append('장면: ' + str(r.get('action_problem')))
        if r.get('missing_objects'): msg.append('안 보이는 물건: ' + ', '.join(r['missing_objects']))
        if r.get('text_in_image'): msg.append('그림 속 글자')
        if r.get('duplicate_character'): msg.append('두 번: ' + r['duplicate_character'])
        if r.get('odd'): msg.append('이상: ' + r['odd'])
        print(' ', r['id'], ' | '.join(msg))
