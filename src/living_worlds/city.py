"""The city half of a living world (2026-10-31, Dan: "in urban places it's not THE FOREST
it should be trees in the city ... better building data ... neon signs ... the bakery in
the train station, notable buildings nearby ... we can click on those and the map gently
flies there and we can experience the sounds of that place").

A profile with "setting": "city" builds a tight frame round the place instead of a
landscape, and this module finds what a city is made of:

  buildings   Japan's PLATEAU 3D city model (measured heights, Tokyo's 23 wards, via
              Indigo Lab's open vector tiles) where it covers; OpenStreetMap elsewhere,
              with heights estimated from storeys or footprint. OSM names and colours
              ride on top. The detailed middle keeps every building; the ring round it
              keeps only the skyline.
  photo       Japan's GSI seamless aerial photo (about 0.5 m) where it covers.
  trees       only where the city has them: OSM's mapped trees and tree rows, and the
              green of parks, gardens and shrine woods; never a forest over the streets.
  signs       every named shop, restaurant, bar and arcade in OSM, for the page to hang
              on the nearest facade and light at night.
  street      signalled crossings and platforms, so the page knows where the walk
              tones and the station sounds come from.
  places      the study's places to visit, each with its picture and blurb from
              Wikipedia and its coordinates checked against Wikipedia's.
  recordings  the study's real recordings, fetched from Wikimedia Commons with their
              licences, each placed where it belongs.
"""
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request

import numpy as np

from . import mvt

UA = {'User-Agent': 'astrolabe-living-world/1.1 (https://github.com/goggledefogger/second-brain-dashboard)'}
OVERPASS = 'https://overpass-api.de/api/interpreter'
PLATEAU_LOD1 = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf'
PLATEAU_BOUNDS = (139.56, 35.52, 139.92, 35.82)
GSI_PHOTO = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'


def say(*a):
    print('·', *a, flush=True)


def fetch(url, timeout=60, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as ex:
            if ex.code == 404:
                return None
            if (ex.code == 429 or ex.code >= 500) and k < tries - 1:
                time.sleep(4 + 6 * k); continue
            raise
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(2)


def jget(url, timeout=60):
    b = fetch(url, timeout)
    return json.loads(b) if b else None


OVERPASS_SERVERS = [OVERPASS, 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']


def overpass(q, timeout=200):
    """Each OpenStreetMap server in turn, twice, so one being down does not empty a city."""
    last = None
    for attempt in range(2):
        for url in OVERPASS_SERVERS:
            try:
                return (jget(url + '?' + urllib.parse.urlencode({'data': q}), timeout) or {}).get('elements', [])
            except Exception as ex:
                last = ex
                time.sleep(2 + attempt * 4)
    raise last


def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            c = not c
    return c


def _clip(ring, lo, hi):
    """Sutherland-Hodgman against the square [lo, hi]², so a building split across tiles
    joins up exactly at the seam instead of overlapping in the tiles' buffers."""
    def edge(pts, inside_fn, cut):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside_fn(a), inside_fn(b)
            if ib:
                if not ia: out.append(cut(a, b))
                out.append(b)
            elif ia:
                out.append(cut(a, b))
        return out
    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    pts = ring
    for axis, bound, keep_low in ((0, hi, True), (0, lo, False), (1, hi, True), (1, lo, False)):
        if not pts: break
        f = (lambda p, a=axis, bd=bound, kl=keep_low: p[a] <= bd if kl else p[a] >= bd)
        c = (lambda p, q, a=axis, bd=bound: lerp(p, q, (bd - p[a]) / ((q[a] - p[a]) or 1e-12)))
        pts = edge(pts, f, c)
    return pts


def plateau_buildings(bbox, local, keep=lambda h, d: True, z=16):
    """PLATEAU LOD1 footprints and measured heights over bbox (lon/lat), as page buildings."""
    w, s, e, n = bbox
    if not (PLATEAU_BOUNDS[0] < (w + e) / 2 < PLATEAU_BOUNDS[2] and PLATEAU_BOUNDS[1] < (s + n) / 2 < PLATEAU_BOUNDS[3]):
        return None
    x0, y0 = mvt.tile_of(w, n, z); x1, y1 = mvt.tile_of(e, s, z)
    out = []
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            raw = fetch(PLATEAU_LOD1.format(z=z, x=tx, y=ty))
            if not raw:
                continue
            for f in mvt.decode(raw).get('bldg', []):
                h = f['props'].get('measuredHeight')
                if not h or h <= 0 or f['type'] != 3:
                    continue
                ext = f['extent']
                for ring in f['rings']:
                    if mvt.ring_area(ring) <= 0:     # a hole (courtyard); the outer ring is enough
                        continue
                    ring = _clip(ring, 0, ext)
                    if len(ring) < 3:
                        continue
                    ll = [mvt.to_lonlat(px, py, z, tx, ty, ext) for px, py in ring]
                    pts = local([p[0] for p in ll], [p[1] for p in ll])
                    mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
                    if not keep(h, math.hypot(mx, my)):
                        continue
                    out.append({'id': str(f['props'].get('建物ID') or ''), 'p': pts, 'h': round(min(float(h), 400), 1), 'k': 'yes', 'c': [round(mx, 1), round(my, 1)]})
    return out


def osm_city(bbox, local):
    """One Overpass call for everything a city layer needs from OpenStreetMap."""
    w, s, e, n = bbox
    bb = f'({s},{w},{n},{e})'
    q = ('[out:json][timeout:170][maxsize:536870912];('
         f'way["building"]["name"]{bb};relation["building"]["name"]{bb};way["building"]["building:colour"]{bb};'
         f'node["name"]["shop"]{bb};node["name"]["amenity"~"^(restaurant|cafe|bar|pub|fast_food|karaoke_box|cinema|pharmacy|bank|ice_cream|nightclub|theatre)$"]{bb};'
         f'node["name"]["leisure"~"^(amusement_arcade|adult_gaming_centre)$"]{bb};node["name"]["tourism"="hotel"]{bb};'
         f'node["natural"="tree"]{bb};way["natural"="tree_row"]{bb};'
         f'way["leisure"~"^(park|garden)$"]{bb};way["landuse"~"^(grass|forest|recreation_ground|village_green)$"]{bb};way["natural"~"^(wood|scrub)$"]{bb};'
         f'relation["leisure"="park"]{bb};'
         f'node["highway"="crossing"]["crossing"~"traffic_signals"]{bb};node["highway"="traffic_signals"]["crossing"]{bb};'
         f'way["railway"="platform"]{bb};way["public_transport"="platform"]["railway"]{bb};'
         ');out geom;')
    try:
        els = overpass(q)
    except Exception as ex:
        say('city: OpenStreetMap did not answer (' + str(ex)[:80] + ')')
        return {}
    named, signs, trees, rows, greens, crossings, platforms = [], [], [], [], [], [], []
    pt = lambda el: local([el['lon']], [el['lat']])[0]
    ring = lambda g: local([p['lon'] for p in g], [p['lat'] for p in g])
    for el in els:
        t = el.get('tags', {})
        g = el.get('geometry')
        if el['type'] == 'relation':
            g = [p for m in el.get('members', []) if m.get('role') == 'outer' for p in (m.get('geometry') or [])]
        if 'building' in t and g and len(g) > 3:
            named.append({'p': ring(g), 'name': t.get('name:en') or t.get('name'), 'ja': t.get('name:ja') or t.get('name'),
                          'colour': t.get('building:colour'), 'roof': t.get('roof:colour')})
        elif el['type'] == 'node' and t.get('natural') == 'tree':
            trees.append(pt(el))
        elif el['type'] == 'node' and t.get('highway') in ('crossing', 'traffic_signals'):
            crossings.append(pt(el))
        elif el['type'] == 'node' and t.get('name'):
            kind = t.get('amenity') or t.get('shop') or t.get('leisure') or t.get('tourism')
            if t.get('shop'): kind = 'shop:' + t['shop']
            lv = t.get('level', '0').split(';')[0]
            try: lv = float(lv)
            except ValueError: lv = 0
            if lv < 0:
                continue          # underground arcades: their signs are not on the street
            signs.append({'at': pt(el), 'name': t.get('name:ja') or t['name'], 'en': t.get('name:en') or '', 'kind': kind})
        elif t.get('natural') == 'tree_row' and g:
            rows.append(ring(g))
        elif ('railway' in t or t.get('public_transport') == 'platform') and g:
            if t.get('level', '0').startswith('-') or t.get('layer', '0').startswith('-') or t.get('location') == 'underground':
                continue
            pts = ring(g)
            platforms.append({'at': [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)],
                              'name': t.get('name', ''), 'pts': pts[::max(1, len(pts) // 12)]})
        elif g and len(g) > 3:
            greens.append(ring(g))
    # a tree row is a tree every 7 m along it
    for r in rows:
        for i in range(1, len(r)):
            (ax, ay), (bx, by) = r[i - 1], r[i]
            L = math.hypot(bx - ax, by - ay)
            for k in range(int(L // 7) + 1):
                trees.append([round(ax + (bx - ax) * k * 7 / max(L, 1), 1), round(ay + (by - ay) * k * 7 / max(L, 1), 1)])
    # crossings: one point per junction (OSM maps each zebra of a junction separately)
    merged = []
    for c in crossings:
        for m in merged:
            if math.hypot(c[0] - m['at'][0], c[1] - m['at'][1]) < 30:
                m['n'] += 1; m['at'] = [(m['at'][0] * (m['n'] - 1) + c[0]) / m['n'], (m['at'][1] * (m['n'] - 1) + c[1]) / m['n']]; break
        else:
            merged.append({'at': list(c), 'n': 1})
    crossings = [{'at': [round(m['at'][0], 1), round(m['at'][1], 1)], 'arms': m['n']} for m in merged]
    # signs: the nearest few hundred to the middle, so the busiest blocks light up first
    signs.sort(key=lambda s: math.hypot(*s['at']))
    return {'named': named, 'signs': signs[:900], 'trees': trees, 'greens': greens,
            'crossings': crossings, 'platforms': platforms[:40]}


def attach_names(buildings, named):
    """Give each building the OSM name and colours of the named outline its middle falls in."""
    boxes = []
    for nb in named:
        xs = [p[0] for p in nb['p']]; ys = [p[1] for p in nb['p']]
        boxes.append((min(xs), min(ys), max(xs), max(ys), nb))
    for b in buildings:
        c = b.get('c') or [sum(p[0] for p in b['p']) / len(b['p']), sum(p[1] for p in b['p']) / len(b['p'])]
        best = None
        for x0, y0, x1, y1, nb in boxes:
            if x0 <= c[0] <= x1 and y0 <= c[1] <= y1 and inside(c, nb['p']):
                area = (x1 - x0) * (y1 - y0)
                if best is None or area < best[0]:
                    best = (area, nb)
        if best:
            nb = best[1]
            if nb.get('name'): b['name'] = nb['name']
            if nb.get('colour'): b['wall'] = nb['colour']
            if nb.get('roof'): b['roof'] = nb['roof']


def gsi_photo(core_b, crs, w, h, z=18):
    """Japan's GSI seamless aerial photo onto the core grid (w × h, north up), or None."""
    from rasterio.warp import transform as warp_xy
    from rasterio.io import MemoryFile
    xs = np.linspace(core_b[0], core_b[2], w); ys = np.linspace(core_b[3], core_b[1], h)
    # corners in lon/lat give the tile range
    lons, lats = warp_xy(crs, 'EPSG:4326', [core_b[0], core_b[2], core_b[0], core_b[2]], [core_b[1], core_b[1], core_b[3], core_b[3]])
    if not (122 < min(lons) and max(lons) < 154 and 20 < min(lats) and max(lats) < 46):
        return None
    tx0, ty0 = mvt.tile_of(min(lons), max(lats), z); tx1, ty1 = mvt.tile_of(max(lons), min(lats), z)
    if (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 400:
        z -= 1; tx0, ty0 = mvt.tile_of(min(lons), max(lats), z); tx1, ty1 = mvt.tile_of(max(lons), min(lats), z)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), np.uint8)
    got = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            raw = None
            for k in range(5):   # the survey's server drops a connection now and then
                try:
                    raw = fetch(GSI_PHOTO.format(z=z, x=tx, y=ty), timeout=30, tries=1); break
                except Exception:
                    time.sleep(1.5 + k * 2)
            if not raw:
                continue
            with MemoryFile(raw) as mf, mf.open() as src:
                px = src.read()
            if px.shape[0] == 1:
                px = np.repeat(px, 3, 0)
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = px[:3, :256, :256].transpose(1, 2, 0)
            got += 1
    if got == 0:
        return None
    # every output pixel → lon/lat → mosaic pixel (rows at a time keeps memory small)
    out = np.zeros((3, h, w), np.uint8); n = 2 ** z
    for j in range(0, h, 256):
        yy = ys[j:j + 256]
        gx, gy = np.meshgrid(xs, yy)
        lo, la = warp_xy(crs, 'EPSG:4326', gx.ravel(), gy.ravel())
        lo = np.asarray(lo); la = np.radians(np.asarray(la))
        px = ((lo + 180) / 360 * n - tx0) * 256
        py = ((1 - np.arcsinh(np.tan(la)) / math.pi) / 2 * n - ty0) * 256
        ix = np.clip(px.astype(int), 0, mosaic.shape[1] - 1); iy = np.clip(py.astype(int), 0, mosaic.shape[0] - 1)
        out[:, j:j + 256, :] = mosaic[iy, ix].reshape(len(yy), w, 3).transpose(2, 0, 1)
    say('city photo: GSI aerial, zoom', z, f'({got} tiles)')
    return out


def photo_trees(rgb, core_b, cx, cy, cell, ground, buildings, known, rng):
    """Street and park trees where a sharp aerial photo sees a crown: green pixels pooled
    onto the 3 m grid, off every building's footprint, one tree per crown (local peaks at
    least 6 m apart), away from the trees OpenStreetMap already mapped. Returns N × 5 rows
    like the builder's trees (x, y, ground, height, estimated)."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    _, ph, pw = rgb.shape
    gh, gw = ground.shape
    r, g, b = (rgb[k].astype(np.float32) for k in range(3))
    green = (g > r * 1.06) & (g > b * 1.04) & (g > 38) & (g < 200) & ((r + g + b) < 520)
    # pool the photo's green onto the grid
    fy, fx = ph / gh, pw / gw
    share = green[:gh * int(fy), :gw * int(fx)].reshape(gh, int(fy), gw, int(fx)).mean(axis=(1, 3)) if fy >= 1 and fx >= 1 else green.astype(np.float32)
    if share.shape != (gh, gw):
        share = np.pad(share, ((0, gh - share.shape[0]), (0, gw - share.shape[1])))
    tf = from_bounds(core_b[0] - cx, core_b[1] - cy, core_b[2] - cx, core_b[3] - cy, gw, gh)
    shapes = [({'type': 'Polygon', 'coordinates': [b_['p'] + [b_['p'][0]]]}, 1) for b_ in buildings if len(b_['p']) > 2]
    roofs = rasterize(shapes, out_shape=(gh, gw), transform=tf, fill=0, all_touched=True).astype(bool) if shapes else np.zeros((gh, gw), bool)
    canopy = np.where(roofs, 0, share)
    # one tree per crown: a peak of green, 2 cells (6 m) clear of a greener neighbour
    pad = np.pad(canopy, 2, constant_values=0)
    peak = canopy >= 0.42
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx or dy:
                peak &= canopy >= pad[2 + dy:2 + dy + gh, 2 + dx:2 + dx + gw]
    ys, xs = np.nonzero(peak)
    X = core_b[0] + (xs + 0.5) * cell - cx + (rng.random(len(xs)) - 0.5) * cell
    Y = core_b[3] - (ys + 0.5) * cell - cy + (rng.random(len(xs)) - 0.5) * cell
    if len(known):
        kk = np.asarray(known)
        keep = np.array([np.min(np.hypot(kk[:, 0] - x, kk[:, 1] - y)) > 4.5 for x, y in zip(X, Y)]) if len(X) else np.zeros(0, bool)
        X, Y, xs, ys = X[keep], Y[keep], xs[keep], ys[keep]
    H = np.clip(7 + canopy[ys, xs] * 14 + rng.normal(0, 2.5, len(xs)), 6, 22)
    return np.stack([X, Y, ground[ys, xs], H, np.ones(len(xs))], axis=1)


def inventory_trees(cfg, bbox, local):
    """A city's own street tree inventory (an ArcGIS feature layer: Portland publishes every
    street tree with its species and trunk), as [{'at': [x, y], 'name': common name, 'dbh': in}]."""
    w, s, e, n = bbox
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode({'where': '1=1', 'geometry': f'{w},{s},{e},{n}', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
                                    'spatialRel': 'esriSpatialRelIntersects', 'outFields': f"{cfg.get('species_field', 'Common')},{cfg.get('dbh_field', 'DBH')}",
                                    'returnGeometry': 'true', 'outSR': 4326, 'f': 'json', 'resultOffset': off, 'resultRecordCount': 2000})
        try:
            d = jget(cfg['url'].rstrip('/') + '/query?' + q, 60) or {}
        except Exception as ex:
            say('street tree inventory did not answer (' + str(ex)[:60] + ')'); break
        feats = d.get('features') or []
        for f in feats:
            g, a = f.get('geometry') or {}, f.get('attributes') or {}
            if 'x' not in g:
                continue
            out.append({'at': local([g['x']], [g['y']])[0], 'name': str(a.get(cfg.get('species_field', 'Common')) or '').strip(),
                        'dbh': float(a.get(cfg.get('dbh_field', 'DBH')) or 0)})
        if len(feats) < 2000 or not d.get('exceededTransferLimit', len(feats) == 2000):
            break
        off += 2000
    return out


def crowns(cz, cc, rgb, origin):
    """Every tree crown in a canopy height model, the way forestry lidar work finds them
    (2026-11-01, Dan: "let's make these into real looking trees ... guessing well about what trees
    these are"): the canopy smoothed, each peak at least 4 m high that stands above its
    neighbourhood (wider for taller trees), its radius where the canopy falls to 55% of the peak,
    and a guess at conifer or broadleaf from how pointed the crown is and how dark it is in the
    aerial photo. origin is (x, y) of the grid's north-west corner in local metres. Returns rows
    (x, y, height, radius, conifer)."""
    H, W = cz.shape
    box = lambda a: (np.pad(a, 1, mode='edge')[:-2, :-2] + np.pad(a, 1, mode='edge')[:-2, 1:-1] + np.pad(a, 1, mode='edge')[:-2, 2:] +
                     np.pad(a, 1, mode='edge')[1:-1, :-2] + np.pad(a, 1, mode='edge')[1:-1, 1:-1] * 2 + np.pad(a, 1, mode='edge')[1:-1, 2:] +
                     np.pad(a, 1, mode='edge')[2:, :-2] + np.pad(a, 1, mode='edge')[2:, 1:-1] + np.pad(a, 1, mode='edge')[2:, 2:]) / 10.0
    sm = box(box(cz))
    pad = np.pad(sm, 5, constant_values=0)
    peak = sm >= 4.0
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            if (dx or dy) and dx * dx + dy * dy <= 25:
                reach = max(abs(dx), abs(dy))
                need = sm >= (4.0 + reach * 3.5)   # a taller tree claims a wider neighbourhood
                peak &= ~(need & (pad[5 + dy:5 + dy + H, 5 + dx:5 + dx + W] > sm)) if reach > 2 else (sm >= pad[5 + dy:5 + dy + H, 5 + dx:5 + dx + W])
    ys, xs = np.nonzero(peak)
    _, ph, pw = rgb.shape
    out = []
    for y, x in zip(ys, xs):
        h = float(sm[y, x])
        rs = []
        for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            st = (ax * ax + ay * ay) ** 0.5
            k = 1
            while k < 10:
                i, j = x + ax * k, y + ay * k
                if i < 0 or j < 0 or i >= W or j >= H or sm[j, i] < 0.55 * h or sm[j, i] > h * 1.03:
                    break
                k += 1
            rs.append(k * st * cc)
        r = float(np.clip(np.mean(rs), 1.2, 9.0))
        half = [sm[min(H - 1, max(0, y + ay * max(1, int(r / cc / 2)))), min(W - 1, max(0, x + ax * max(1, int(r / cc / 2))))] for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        peaked = (h - float(np.mean(half))) / max(h, 1)
        px, py = int((x + 0.5) / W * pw), int((y + 0.5) / H * ph)
        win = np.nan_to_num(rgb[:, max(0, py - 2):py + 3, max(0, px - 2):px + 3]).reshape(3, -1).mean(axis=1)
        luma = 0.3 * win[0] + 0.55 * win[1] + 0.15 * win[2]
        # in a Pacific Northwest neighbourhood a crown over 22 m is nearly always a Douglas fir or its kin
        conifer = h >= 22 or (h >= 15 and (luma < 85 or peaked > 0.14)) or (peaked > 0.24 and luma < 100)
        out.append((origin[0] + (x + 0.5) * cc, origin[1] - (y + 0.5) * cc, h, r, bool(conifer)))
    return out


def vehicles(rgb, core_b, cx, cy, buildings, cap=400):
    """The cars, vans and pickups an aerial photo shows, flattened on the streets and driveways
    (2026-11-01, Dan: "the vehicles that appear flattened from satellite you'd guess at what they
    are and model those too"): blobs that stand out from the pavement around them, car-shaped
    (3.6 to 6.6 m long, 1.5 to 2.4 m wide, long and narrow), off roofs and lawns. Each comes back
    with its place, length, width, heading, colour and a guess at its kind from its size."""
    from rasterio.features import rasterize, shapes
    from rasterio.transform import from_bounds
    _, ph, pw = rgb.shape
    f = max(1, int(round(pw / 2048)))   # about 0.3 m a pixel is plenty for a car
    img = np.nan_to_num(rgb[:, :ph // f * f, :pw // f * f]).reshape(3, ph // f, f, pw // f, f).mean(axis=(2, 4))
    _, h, w = img.shape
    tf = from_bounds(core_b[0] - cx, core_b[1] - cy, core_b[2] - cx, core_b[3] - cy, w, h)
    mpp = (core_b[2] - core_b[0]) / w
    def blur(a, r):   # a box blur by an integral image
        c = np.pad(a, ((r + 1, r), (r + 1, r)), mode='edge').cumsum(0).cumsum(1)
        return (c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]) / (2 * r + 1) ** 2
    r = max(4, int(3.0 / mpp))
    bg = np.stack([blur(img[k], r) for k in range(3)])
    diff = np.abs(img - bg).sum(axis=0)
    leafy = (img[1] > img[0] * 1.06) & (img[1] > img[2] * 1.02)
    paved = (np.abs(bg[0] - bg[1]) < 14) & (np.abs(bg[1] - bg[2]) < 18) & (bg[1] < bg[0] * 1.08)   # grey around it: a street or a drive
    roofs = rasterize([({'type': 'Polygon', 'coordinates': [b['p'] + [b['p'][0]]]}, 1) for b in buildings if len(b.get('p', [])) > 2],
                      out_shape=(h, w), transform=tf, fill=0).astype(bool) if buildings else np.zeros((h, w), bool)
    cand = (diff > 55) & ~leafy & paved & ~roofs
    out = []
    for geom, val in shapes(cand.astype('uint8'), mask=cand, transform=tf):
        ring = np.array(geom['coordinates'][0])
        if len(ring) < 4:
            continue
        x, y = ring[:, 0], ring[:, 1]
        area = 0.5 * abs(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1]))
        if not (4.5 < area < 17):
            continue
        cxm, cym = x.mean(), y.mean()
        cov = np.cov(np.stack([x - cxm, y - cym]))
        ev, evec = np.linalg.eigh(cov)
        ax = evec[:, 1]
        along = (x - cxm) * ax[0] + (y - cym) * ax[1]; across = -(x - cxm) * ax[1] + (y - cym) * ax[0]
        L, Wd = float(along.max() - along.min()), float(across.max() - across.min())
        if not (3.6 < L < 6.6 and 1.5 < Wd < 2.5 and 1.6 < L / Wd < 3.6):
            continue
        i, j = int((cxm - (core_b[0] - cx)) / mpp), int(((core_b[3] - cy) - cym) / mpp)
        win = img[:, max(0, j - 2):j + 3, max(0, i - 2):i + 3].reshape(3, -1)
        col = '#%02x%02x%02x' % tuple(int(np.clip(np.median(v), 0, 255)) for v in win)
        kind = 'pickup' if L > 5.6 else ('van' if L > 4.9 and Wd > 1.95 else ('suv' if L > 4.7 else 'car'))
        out.append({'at': [round(float(cxm), 1), round(float(cym), 1)], 'len': round(L, 2), 'wid': round(min(Wd, 2.1), 2),
                    'yaw': round(float(np.arctan2(ax[1], ax[0])), 3), 'colour': col, 'kind': kind})
        if len(out) >= cap:
            break
    return out


def roof_colours(buildings, rgb, core_b, cx, cy):
    """Each roof's own colour from the aerial photo (2026-11-01, Dan: "build a thing that gets roof
    color and texture well"): the photo's pixels inside its footprint, leaving out leaves (a tree
    over the roof) and deep shadow, their median. Sets b['roof'] unless OpenStreetMap gave one;
    returns how many roofs it coloured."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    _, ph, pw = rgb.shape
    tf = from_bounds(core_b[0] - cx, core_b[1] - cy, core_b[2] - cx, core_b[3] - cy, pw, ph)
    idx = [i for i, b in enumerate(buildings) if len(b.get('p', [])) > 2 and (not b.get('roof') or b.get('roof_from') == 'photo')]
    if not idx:
        return 0
    lab = rasterize([({'type': 'Polygon', 'coordinates': [buildings[i]['p'] + [buildings[i]['p'][0]]]}, k + 1) for k, i in enumerate(idx)],
                    out_shape=(ph, pw), transform=tf, fill=0, dtype='int32')
    r, g, b_ = (np.nan_to_num(rgb[k]).astype(np.float32) for k in range(3))
    leafy = (g > r * 1.06) & (g > b_ * 1.02)
    dark = (r + g + b_) < 75
    ok = (lab > 0) & ~leafy & ~dark
    L, R, G, B = lab[ok], r[ok], g[ok], b_[ok]
    order = np.argsort(L, kind='stable'); L, R, G, B = L[order], R[order], G[order], B[order]
    cuts = np.flatnonzero(np.diff(L)) + 1
    done = 0
    for seg_l, seg_r, seg_g, seg_b in zip(np.split(L, cuts), np.split(R, cuts), np.split(G, cuts), np.split(B, cuts)):
        if len(seg_l) < 12:
            continue
        i = idx[int(seg_l[0]) - 1]
        buildings[i]['roof'] = '#%02x%02x%02x' % tuple(int(np.clip(np.median(v), 0, 255)) for v in (seg_r, seg_g, seg_b)); buildings[i]['roof_from'] = 'photo'
        done += 1
    return done


def roof_mask(buildings, core_b, cx, cy, gw, gh):
    """Which 3 m cells a building covers, so a laser return off a roof is not taken for a tree."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    tf = from_bounds(core_b[0] - cx, core_b[1] - cy, core_b[2] - cx, core_b[3] - cy, gw, gh)
    shapes = [({'type': 'Polygon', 'coordinates': [b['p'] + [b['p'][0]]]}, 1) for b in buildings if len(b.get('p', [])) > 2]
    return rasterize(shapes, out_shape=(gh, gw), transform=tf, fill=0).astype(bool) if shapes else np.zeros((gh, gw), bool)


def wiki_summary(title, lang='en'):
    d = jget(f'https://{lang}.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_')), 30)
    return d or {}


def places(profile, local, out_dir):
    """The study's places, each with a picture and a line from Wikipedia where it has a page."""
    res = []
    os.makedirs(os.path.join(out_dir, 'places'), exist_ok=True)
    for p in (profile.get('places') or []):
        rec = {k: v for k, v in p.items() if k not in ('lon', 'lat')}
        lon, lat = p.get('lon'), p.get('lat')
        if p.get('wiki'):
            try:
                d = wiki_summary(p['wiki'])
                c = d.get('coordinates')
                if c and lon is not None and abs(c['lon'] - lon) < 0.006 and abs(c['lat'] - lat) < 0.005:
                    lon, lat = c['lon'], c['lat']
                if not rec.get('blurb') and d.get('extract'):
                    rec['blurb'] = d['extract'].split('. ')[0][:220]
                img = (d.get('thumbnail') or {}).get('source')
                if img:
                    img = re.sub(r'/(\d+)px-', '/500px-', img)
                    try:
                        data = fetch(img, 40)
                    except Exception:   # Wikimedia serves only its standard sizes
                        data = fetch(d['thumbnail']['source'], 40)
                    if data:
                        slug = re.sub(r'[^a-z0-9]+', '-', p['name'].lower()).strip('-')
                        fn = 'places/' + slug + ('.png' if img.lower().endswith('.png') else '.jpg')
                        with open(os.path.join(out_dir, fn), 'wb') as f:
                            f.write(data)
                        rec['img'] = fn
                        rec['img_credit'] = d.get('content_urls', {}).get('desktop', {}).get('page', '')
                time.sleep(0.4)
            except Exception as ex:
                say('place', p['name'], 'no Wikipedia page read (' + str(ex)[:60] + ')')
        if lon is None:
            continue
        rec['xy'] = local([lon], [lat])[0]
        rec['lonlat'] = [lon, lat]
        res.append(rec)
    return res


def recordings(profile, local, out_dir, place_xy):
    """The study's real recordings from Wikimedia Commons, saved beside the world with credit."""
    res = []
    os.makedirs(os.path.join(out_dir, 'sounds'), exist_ok=True)
    for r in (profile.get('recordings') or []):
        title = r['commons'] if r['commons'].startswith('File:') else 'File:' + r['commons']
        try:
            info = jget('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
                'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata',
                'iiextmetadatafilter': 'LicenseShortName|Artist', 'format': 'json'}), 40)
            page = next(iter(info['query']['pages'].values()))
            ii = page['imageinfo'][0]
            url = ii['url'].split('?')[0]
            if ii.get('size', 0) > 4_000_000:   # Commons keeps a small mp3 of every big audio file
                name = url.rsplit('/', 1)[1]
                url = url.replace('/wikipedia/commons/', '/wikipedia/commons/transcoded/') + '/' + name + '.mp3'
            data = fetch(url, 90)
            if not data:
                say('recording', title, 'no copy small enough, left out'); continue
            time.sleep(1.0)
        except Exception as ex:
            say('recording', title, 'not fetched (' + str(ex)[:60] + ')'); continue
        ext = os.path.splitext(url)[1].lower() or '.ogg'
        fn = 'sounds/rec-' + re.sub(r'[^a-z0-9]+', '-', r['id'].lower()) + ext
        with open(os.path.join(out_dir, fn), 'wb') as f:
            f.write(data)
        em = ii.get('extmetadata', {})
        by = re.sub(r'<[^>]+>', '', (em.get('Artist') or {}).get('value', '')).strip()[:80]
        rec = {k: v for k, v in r.items() if k not in ('commons', 'lon', 'lat')}
        rec.update({'file': fn, 'credit': {'by': by or 'Wikimedia Commons', 'licence': (em.get('LicenseShortName') or {}).get('value', ''),
                                           'url': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))}})
        if r.get('lon') is not None:
            rec['xy'] = local([r['lon']], [r['lat']])[0]
        elif r.get('place') in place_xy:
            rec['xy'] = place_xy[r['place']]
        res.append(rec)
    return res
