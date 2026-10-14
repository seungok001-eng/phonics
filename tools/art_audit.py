# 단어 그림·글자나무 점검: 제미나이(그림 보기)에게 "7~9세 아이가 이 그림을 보고 그 단어를 떠올리나"를 묻는다.
# 사용: python tools/art_audit.py [--book N] [--trees] [단어 ...]   → build/art_audit.json (+ 문제 있는 것만 화면에)
import json, os, sys, base64, urllib.request, concurrent.futures as cf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = json.load(open(os.path.join(ROOT, 'art-src', 'forge', 'secrets.json'), encoding='utf-8'))['gemini_key']
MODEL = 'gemini-3.5-flash'
DIRS = {1: 'content', 2: 'content/b2', 3: 'content/b3', 4: 'content/b4'}
ART = os.path.join(ROOT, 'web', 'assets', 'art')


def gem(q, path):
    body = {'contents': [{'role': 'user', 'parts': [{'text': q}, {'inline_data': {'mime_type': 'image/png' if path.endswith('.png') else 'image/jpeg', 'data': base64.b64encode(open(path, 'rb').read()).decode()}}]}],
            'generationConfig': {'responseMimeType': 'application/json'}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY}, method='POST')
    err = ''
    for _ in range(3):
        try: return json.loads(json.load(urllib.request.urlopen(req, timeout=120))['candidates'][0]['content']['parts'][0]['text'])
        except Exception as e: err = str(e)
    return {'error': err[:200]}


def word_check(w, W):
    path = os.path.join(ART, f'word_{w}.png')
    if not os.path.exists(path): return {'id': f'word_{w}', 'error': 'no image'}
    q = f"""This picture is a vocabulary card for Korean children aged 7-9 learning English phonics. The target word is "{w}" (Korean meaning: {W.get('ko', '')}).
Answer ONLY JSON: {{"child_would_say": "the English word most children would say for this picture", "clear": true/false (would a child easily connect the picture to "{w}"?), "confusable_with": "another common word the picture could be mistaken for, or empty", "text_in_image": true/false, "problem": "short note if anything is wrong or odd (wrong object, scary, extra objects, cut off), else empty"}}"""
    r = gem(q, path); r['id'] = f'word_{w}'; r['word'] = w; return r


def tree_check(l, L):
    path = os.path.join(ART, f'tree_{l}.png')
    if not os.path.exists(path): return {'id': f'tree_{l}', 'error': 'no image'}
    ws = ', '.join(L.get('words', [])[:3])
    q = f"""This is a "letter tree" picture for the letter {l.upper()} in a children's phonics book. It should be a round, friendly fruit tree (NOT shaped like a letter, no letters or text) with small objects hanging like fruit: {ws}.
Answer ONLY JSON: {{"objects_visible": [which of ({ws}) you can see], "letter_shaped_or_text": true/false, "problem": "short note if wrong or odd, else empty"}}"""
    r = gem(q, path); r['id'] = f'tree_{l}'; r['words'] = L.get('words', [])[:3]; return r


def bad(r):
    if r.get('error'): return True
    if r['id'].startswith('word_'): return r.get('clear') is False or r.get('text_in_image') or bool(r.get('problem'))
    return r.get('letter_shaped_or_text') or bool(r.get('problem')) or len(r.get('objects_visible') or []) < len(r.get('words') or [])


if __name__ == '__main__':
    args = sys.argv[1:]
    bk = int(args[args.index('--book') + 1]) if '--book' in args else 1
    book = json.load(open(os.path.join(ROOT, DIRS[bk], 'book.json'), encoding='utf-8'))
    only = {a for a in args if not a.startswith('--') and not a.isdigit()}
    jobs = [(word_check, w, W) for w, W in book['words'].items() if not only or w in only]
    if '--trees' in args and bk == 1: jobs += [(tree_check, l, L) for l, L in book['letters'].items()]
    with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(lambda j: j[0](j[1], j[2]), jobs))
    out = os.path.join(ROOT, 'build', 'art_audit.json'); os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    probs = [r for r in res if bad(r)]
    print(f'점검 {len(res)}장, 문제 {len(probs)}장 → {out}')
    for r in probs: print(' ', r['id'], {k: v for k, v in r.items() if k not in ('id', 'word', 'words') and v not in ('', None, False, [])})
