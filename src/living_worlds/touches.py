"""Touches: the community's additions to a living world, laid on at every build
(2026-10-31, Dan: "start really small and prove the system can be added on like this in
a great way by hundreds of people later"). The rules a contributor's agent follows are
in touches/TOUCH.md; this enforces them.

In Groundstation, build_world(touches_dir=...) lays them on; each touch is a folder under
<touches_dir>/<world slug>/.

Each touch is resolved to today's build (a building by its permanent id, a place by
name, a point by lon/lat), checked against its own limits and its block's budget in the
order touches were added, and its files copied beside the world. A touch whose anchor is
not in today's build is kept and reported as waiting; one that does not fit is turned
away with the reason. Nothing a contributor made is ever deleted by a build.
"""
import json
import math
import os
import shutil
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOUCHES = os.path.join(HERE, 'touches')
BLOCK_M = 250
EACH = {'texture_px': 1024, 'texture_bytes': 600_000, 'sound_bytes': 1_500_000, 'creatures': 6}
BLOCK = {'texture_bytes': 2_000_000, 'sound_bytes': 3_000_000, 'creatures': 12, 'touches': 40}
KINDS = ('facade', 'material', 'rule', 'creature', 'sound')


def image_size(path):
    """Width and height of a PNG or JPEG from its header, with nothing installed."""
    with open(path, 'rb') as f:
        head = f.read(26)
        if head[:8] == b'\x89PNG\r\n\x1a\n':
            return struct.unpack('>II', head[16:24])
        if head[:2] == b'\xff\xd8':
            f.seek(2)
            while True:
                m = f.read(2)
                if len(m) < 2 or m[0] != 0xFF:
                    return None
                ln = struct.unpack('>H', f.read(2))[0]
                if m[1] in (0xC0, 0xC1, 0xC2):
                    f.read(1); h, w = struct.unpack('>HH', f.read(4)); return w, h
                f.seek(ln - 2, 1)
    return None


def _kb(n):
    return f'{n / 1_000_000:.1f} MB' if n >= 1_000_000 else f'{round(n / 1000)} KB'


def lay(meta, slug, out_dir, local=None, root=None):
    """Resolve, check and copy every touch for this world; returns (touches, report)."""
    src = os.path.join(root or TOUCHES, slug)
    found = []
    if os.path.isdir(src):
        for d in sorted(os.listdir(src)):
            p = os.path.join(src, d, 'touch.json')
            if os.path.isfile(p):
                try:
                    t = json.load(open(p, encoding='utf-8'))
                    t['_dir'] = os.path.join(src, d)
                    found.append(t)
                except Exception as ex:
                    found.append({'id': d, '_bad': 'touch.json does not read as JSON (' + str(ex)[:60] + ')'})
    found.sort(key=lambda t: (t.get('added', '9999'), t.get('id', '')))   # earlier touches keep their place
    buildings = {}
    for b in meta.get('buildings', []):
        if b.get('id'):
            buildings.setdefault(b['id'], []).append(b)
    places = {p['name']: p for p in ((meta.get('city') or {}).get('places') or [])}
    used, touches, report = {}, [], []
    shutil.rmtree(os.path.join(out_dir, 'touches'), ignore_errors=True)

    def turn(t, why, fix=''):
        report.append({'id': t.get('id'), 'title': t.get('title') or t.get('id'), 'by': t.get('by', ''), 'status': 'turned away', 'why': why, 'fix': fix})

    for t in found:
        if t.get('_bad'):
            turn(t, t['_bad'], 'Fix the file and it will be laid on at the next build.'); continue
        kind, a = t.get('kind'), t.get('anchor') or {}
        if kind not in KINDS:
            turn(t, f'"{kind}" is not a kind of touch yet', 'Use facade, material, rule, creature or sound.'); continue
        # where it hangs
        if 'building' in a:
            pieces = buildings.get(a['building'])
            if not pieces:
                report.append({'id': t['id'], 'title': t.get('title') or t['id'], 'by': t.get('by', ''), 'status': 'waiting',
                               'why': f'building {a["building"]} is not in this build', 'fix': 'It is kept and comes back when the building does.'}); continue
            xy = [sum(p['c'][0] for p in pieces if 'c' in p) / max(1, len(pieces)), sum(p['c'][1] for p in pieces if 'c' in p) / max(1, len(pieces))]
        elif 'place' in a:
            if a['place'] not in places:
                report.append({'id': t['id'], 'title': t.get('title') or t['id'], 'by': t.get('by', ''), 'status': 'waiting',
                               'why': f'no place called "{a["place"]}" in this build', 'fix': 'It is kept and comes back when the place does.'}); continue
            xy = places[a['place']]['xy']
        elif 'at' in a and local:
            xy = local([a['at'][0]], [a['at'][1]])[0]
        else:
            turn(t, 'it has no anchor this build can find', 'Anchor it to a building id, a place name, or "at": [lon, lat].'); continue
        block = (math.floor(xy[0] / BLOCK_M), math.floor(xy[1] / BLOCK_M))
        u = used.setdefault(block, {'texture_bytes': 0, 'sound_bytes': 0, 'creatures': 0, 'touches': 0})
        # its files and what they cost
        files, cost, bad = [], {'texture_bytes': 0, 'sound_bytes': 0, 'creatures': 0}, None
        if kind in ('facade', 'material'):
            fn = (t.get(kind) or {}).get('texture')
            if fn:
                p = os.path.join(t['_dir'], fn)
                if not os.path.isfile(p):
                    bad = (f'its texture {fn} is missing', 'Put the picture beside touch.json.')
                else:
                    size, dims = os.path.getsize(p), image_size(p)
                    if not dims:
                        bad = (f'{fn} is not a PNG or JPEG', 'Save it as a JPEG.')
                    elif max(dims) > EACH['texture_px']:
                        bad = (f'{fn} is {dims[0]} × {dims[1]} px; a texture can be {EACH["texture_px"]} px on its longest side',
                               f'Resize it to {EACH["texture_px"]} px; a wall seen from the street looks the same.')
                    elif size > EACH['texture_bytes']:
                        bad = (f'{fn} is {_kb(size)}; a texture can be {_kb(EACH["texture_bytes"])}', 'Save it as a JPEG at quality 80.')
                    files.append(fn); cost['texture_bytes'] = size
        elif kind == 'sound':
            fn = (t.get('sound') or {}).get('file')
            p = os.path.join(t['_dir'], fn or '')
            if not fn or not os.path.isfile(p):
                bad = ('its sound file is missing', 'Put the recording beside touch.json.')
            else:
                size = os.path.getsize(p)
                if size > EACH['sound_bytes']:
                    bad = (f'{fn} is {_kb(size)}; a sound can be {_kb(EACH["sound_bytes"])}', 'Trim it to the part that matters, or save it as an MP3.')
                files.append(fn); cost['sound_bytes'] = size
        elif kind == 'creature':
            n = int((t.get('creature') or {}).get('count', 1))
            if n > EACH['creatures']:
                bad = (f'{n} creatures in one touch; the most is {EACH["creatures"]}', 'Split them into touches in different blocks.')
            cost['creatures'] = n
        if bad:
            turn(t, *bad); continue
        over = [k for k in cost if u[k] + cost[k] > BLOCK[k]] + (['touches'] if u['touches'] + 1 > BLOCK['touches'] else [])
        if over:
            k = over[0]
            have = BLOCK[k] - u[k]
            turn(t, f'its block is full: room for {_kb(have) if k.endswith("bytes") else have} more {k.replace("_bytes", "s").replace("_", " ")}, and this needs {_kb(cost[k]) if k.endswith("bytes") else cost.get(k, 1)}',
                 'Make it smaller, or anchor it in a quieter block.'); continue
        for k in cost:
            u[k] += cost[k]
        u['touches'] += 1
        dest = os.path.join(out_dir, 'touches', t['id'])
        os.makedirs(dest, exist_ok=True)
        for fn in files:
            shutil.copy2(os.path.join(t['_dir'], fn), os.path.join(dest, fn))
        clean = {k: v for k, v in t.items() if not k.startswith('_')}
        clean['xy'] = [round(xy[0], 1), round(xy[1], 1)]
        clean['dir'] = 'touches/' + t['id'] + '/'
        touches.append(clean)
        report.append({'id': t['id'], 'title': t.get('title') or t['id'], 'by': t.get('by', ''), 'status': 'in', 'why': '', 'fix': ''})
    return touches, report


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    slug = sys.argv[1]
    out = os.path.join(HERE, '..', '..', '..', 'groundstation', 'img', 'world-' + slug)
    mp = os.path.join(out, 'world.json')
    meta = json.load(open(mp, encoding='utf-8'))
    local = None
    try:
        from rasterio.warp import transform as warp_xy
        lon, lat = meta['centre_lonlat']; ext = meta['core']['extent']
        x0, y0 = warp_xy('EPSG:4326', meta['crs'], [lon], [lat])
        cx, cy = x0[0] - (ext[0] + ext[2]) / 2, y0[0] - (ext[1] + ext[3]) / 2
        local = lambda lons, lats: [[round(x - cx, 1), round(y - cy, 1)] for x, y in zip(*warp_xy('EPSG:4326', meta['crs'], lons, lats))]
    except Exception:
        pass
    meta['touches'], meta['touch_report'] = lay(meta, slug, out, local)
    json.dump(meta, open(mp, 'w'), indent=1)
    for r in meta['touch_report']:
        print('·', r['status'] + ':', r['title'], '(' + r['by'] + ')', ('· ' + r['why']) if r['why'] else '')


if __name__ == '__main__':
    main()
