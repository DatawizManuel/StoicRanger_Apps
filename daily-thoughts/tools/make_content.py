"""Builds the app content from content/ (same sources as the Authors artifact build kit):
  content/authors.json, content/bios/<slug>.md, content/quotes/<slug>.txt, content/coins.json
-> app/src/main/assets/www/js/content.js   (DT.AUTHORS, DT.QUOTES, DT.DAY_ORDER)
-> app/src/main/assets/www/coins/<slug>.svg (coin as <symbol id="coin-<slug>">, loaded on demand)
-> app/src/main/assets/www/js/sprite.js    (shared coin defs + Stoic Ranger seal)

Quote ids are permanent (favourites point at them): content/quote-ids.json maps "slug|ref|first line" to its id.
Existing ids are never renumbered or reused; a new quote gets the next free number of its author.
content/day-order.json is the fixed Quote of the day order; new quotes are appended at the end.
Run: python3 tools/make_content.py"""
import base64, io, json, os, random, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, 'content')
WWW = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'www')
sys.path.insert(0, C)
from coins import coin_symbol, SHARED_DEFS   # noqa: E402

COIN_PX = 480   # portrait inside the coin; the build kit keeps 720 px, phones need less


def parse_quotes(path):
    """quotes/<slug>.txt: blocks start with '# <ref>'; q: quote line, c: context paragraph,
    e: when | title | text (event), p: practice, s: extra source note, t: translation note."""
    out = []
    for blk in [b for b in re.split(r'^# ', open(path, encoding='utf-8').read(), flags=re.M) if b.strip()]:
        lines = blk.strip().split('\n')
        d = {'ref': lines[0].strip(), 'q': [], 'c': [], 'e': None, 'p': '', 's': '', 't': ''}
        for l in lines[1:]:
            if len(l) < 3 or l[1] != ':':
                continue
            k, v = l[0], l[2:].strip()
            if k == 'q': d['q'].append(v)
            elif k == 'c': d['c'].append(v)
            elif k == 'e':
                w, t, x = [y.strip() for y in v.split('|', 2)]
                d['e'] = {'when': w, 'title': t, 'text': x}
            elif k in 'pst': d[k] = v
        out.append(d)
    return out


def life(slug, a):
    f = os.path.join(C, 'bios', slug + '.md')
    if not os.path.exists(f):
        return a.get('life', [])
    return [{'h': b.split('\n', 1)[0][3:].strip(),
             'p': [x.strip().replace('\n', ' ') for x in b.split('\n', 1)[1].strip().split('\n\n') if x.strip()]}
            for b in re.split(r'\n(?=## )', open(f, encoding='utf-8').read().strip())]


def small_webp(b64):
    im = Image.open(io.BytesIO(base64.b64decode(b64)))
    im.thumbnail((COIN_PX, COIN_PX), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=84, method=6)
    return base64.b64encode(buf.getvalue()).decode()


def strip_meta(svg):
    return re.sub(r'<metadata>.*?</metadata>', '', svg, flags=re.S)


def main():
    authors = json.load(open(os.path.join(C, 'authors.json'), encoding='utf-8'))
    coins = json.load(open(os.path.join(C, 'coins.json'), encoding='utf-8'))
    idf = os.path.join(C, 'quote-ids.json')
    ids = json.load(open(idf, encoding='utf-8')) if os.path.exists(idf) else {}
    orderf = os.path.join(C, 'day-order.json')
    order = json.load(open(orderf, encoding='utf-8')) if os.path.exists(orderf) else []

    A, Q = [], []
    for a in authors:
        slug = a['slug']
        qf = os.path.join(C, 'quotes', slug + '.txt')
        qs = parse_quotes(qf) if os.path.exists(qf) else []
        used = [int(v.rsplit('-', 1)[1]) for v in ids.values() if v.startswith('q-' + slug + '-')]
        mine = []
        for q in qs:
            key = f"{slug}|{q['ref']}|{q['q'][0] if q['q'] else ''}"
            if key not in ids:
                n = max(used, default=0) + 1; used.append(n)
                ids[key] = f'q-{slug}-{n:02d}'
            q['id'] = ids[key]; q['a'] = slug
            mine.append(q['id']); Q.append(q)
        if slug not in coins:
            sys.exit(f'{slug}: no coin in content/coins.json (standing rule: every author needs a coin)')
        A.append({k: a.get(k, '') for k in ('slug', 'name', 'group', 'dates', 'born', 'died', 'origin', 'school', 'bio')}
                 | {'life': life(slug, a), 'quotes': mine, 'credit': coins[slug]['credit'], 'portrait': bool(coins[slug]['b64'])})
        if not A[-1]['life']:
            sys.exit(f'{slug}: no life story in content/bios/{slug}.md (standing rule: every author needs an author page)')

    allids = [q['id'] for q in Q]
    if len(set(allids)) != len(allids):
        sys.exit('duplicate quote ids')
    if not order:                      # first build: a fixed shuffle so neighbouring days come from different authors
        rnd = random.Random(20261027); order = allids[:]; rnd.shuffle(order)
    order = [i for i in order if i in set(allids)] + [i for i in allids if i not in set(order)]

    json.dump(ids, open(idf, 'w', encoding='utf-8'), indent=1, ensure_ascii=False, sort_keys=True)
    json.dump(order, open(orderf, 'w', encoding='utf-8'), indent=0)

    os.makedirs(os.path.join(WWW, 'coins'), exist_ok=True)
    for a in authors:
        c = coins[a['slug']]
        svg = coin_symbol(a['slug'], a['name'], a['dates'], small_webp(c['b64']) if c['b64'] else None)
        open(os.path.join(WWW, 'coins', a['slug'] + '.svg'), 'w', encoding='utf-8').write(svg)

    js = ('/* Generated by tools/make_content.py from content/ - do not edit. Quote ids are permanent. */\n'
          "'use strict';\n"
          f'DT.AUTHORS = {json.dumps(A, ensure_ascii=False, separators=(",", ":"))};\n'
          f'DT.QUOTES = {json.dumps(Q, ensure_ascii=False, separators=(",", ":"))};\n'
          f'DT.DAY_ORDER = {json.dumps(order, separators=(",", ":"))};\n')
    open(os.path.join(WWW, 'js', 'content.js'), 'w', encoding='utf-8').write(js)

    seal = strip_meta(open(os.path.join(C, 'siegel.svgfrag'), encoding='utf-8').read())
    seal = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', seal.strip())
    sprite = ('/* Generated by tools/make_content.py - shared coin gradients/filters and the Stoic Ranger seal. */\n'
              "'use strict';\n"
              f'DT.SPRITE = {json.dumps("<defs>" + SHARED_DEFS + "</defs>" + seal)};\n')
    open(os.path.join(WWW, 'js', 'sprite.js'), 'w', encoding='utf-8').write(sprite)
    print(f'{len(A)} authors, {len(Q)} quotes, content.js {len(js)//1024} KB')


if __name__ == '__main__':
    main()
