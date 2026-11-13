"""Living worlds: a place as an open-world 3D scene, built from public data.

The core (a few km round the place) carries lidar ground and every treetop the
lidar saw (USGS 3DEP on Planetary Computer) where the US has flown it, with a
NAIP aerial photo; anywhere else it falls back to Copernicus 30 m terrain, the
clearest Sentinel-2 summer pass, and trees placed from the photo's vegetation
with estimated heights. The far ring (tens of km) is Copernicus terrain under
that same Sentinel-2 pass. Towns and peaks come from OpenStreetMap.

The page (static/world.html) grows the forest in the browser the way open-world
engines do: species recipes instanced at every tree, two-layer wind, per-tree
random variation on the GPU, impostors at mid distance, trees streamed in round
the camera to the horizon, a physical sky with sun shadows, cloud shadows and a
rippling river. Everything is embedded in one HTML file, so it opens with no
server and shares as-is.

Reads go through rio-tiler (Reader.part reprojects each source onto the one
metric grid), so a world is the same open stack as every other artifact here.
"""

from __future__ import annotations

import base64
import datetime as dt
import io
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

PC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/{c}"
ES = "https://earth-search.aws.element84.com/v1"
TNM = "https://tnmaccess.nationalmap.gov/api/v1/products"
OVERPASS_RETRY_S = 20
UA = {"User-Agent": "living-worlds/0.1 (github.com/bookbran/living-worlds)"}
TEMPLATE = Path(__file__).parent / "static" / "world.html"


def _json(url: str, body: dict | None = None, timeout: int = 90) -> Any:
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={**UA, **({"Content-Type": "application/json"} if body is not None else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


_tokens: dict[str, tuple[str, float]] = {}


def _sign(collection: str, href: str) -> str:
    # tokens expire on the clock (2026-11-02: a wider build outlived its token and every photo after
    # it came back 403): keep each one only until five minutes before its stated expiry
    import time
    t = _tokens.get(collection)
    if not t or time.time() > t[1] - 300:
        j = _json(PC_TOKEN.format(c=collection))
        try:
            exp = dt.datetime.fromisoformat(str(j.get("msft:expiry", "")).replace("Z", "+00:00")).timestamp()
        except Exception:
            exp = time.time() + 600
        t = _tokens[collection] = (j["token"], exp)
    return href + ("&" if "?" in href else "?") + t[0]


def _search(root: str, collections: list[str], bbox: list[float], extra: dict | None = None, limit: int = 50) -> list[dict]:
    return _json(f"{root}/search", {"collections": collections, "bbox": bbox, "limit": limit, **(extra or {})}).get("features", [])


def utm_crs(lon: float, lat: float) -> str:
    return f"EPSG:{(32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1}"


def read_grid(hrefs: list[str], crs: str, bounds: tuple, w: int, h: int, bands: tuple | None = None,
              resampling: str = "bilinear", nodata: float | None = None) -> np.ndarray | None:
    """Read sources onto one grid with rio-tiler; later sources fill earlier gaps (nan)."""
    import rasterio
    from rio_tiler.io import Reader

    out = None
    with rasterio.Env(AWS_NO_SIGN_REQUEST="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        for href in hrefs:
            try:
                with Reader(href) as src:
                    img = src.part(bounds, dst_crs=crs, bounds_crs=crs, width=w, height=h, indexes=bands or (1,),
                                   nodata=nodata, resampling_method=resampling, reproject_method=resampling)
            except Exception:  # one unreadable tile is not the end of a world
                continue
            a = np.ma.filled(img.array.astype(np.float32), np.nan)
            a = a if bands else a[0]
            out = a if out is None else np.where(np.isnan(out), a, out)
    return out


def local_maxima(h: np.ndarray, radius: int) -> np.ndarray:
    """Treetops: cells that are the highest within `radius` cells."""
    pad = np.pad(h, radius, mode="edge")
    best = np.full(h.shape, -np.inf, dtype=np.float32)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy <= radius * radius:
                best = np.maximum(best, pad[radius + dy: radius + dy + h.shape[0], radius + dx: radius + dx + h.shape[1]])
    return h >= best


def despike(h: np.ndarray, limit: float = 40.0, reach: int = 7, passes: int = 6) -> np.ndarray:
    """A laser return off something in the air comes back as a pillar: replace cells far
    from the median of a wide ring round them, repeating so a wide patch is eaten in."""
    gh, gw = h.shape
    for _ in range(passes):
        pad = np.pad(h, reach, mode="edge")
        ring = np.stack([pad[dy:dy + gh, dx:dx + gw] for dy in range(0, 2 * reach + 1, 2) for dx in range(0, 2 * reach + 1, 2)])
        med = np.median(ring, axis=0)
        bad = np.abs(h - med) > limit
        if not bad.any():
            break
        h = np.where(bad, med, h).astype(np.float32)
    return h


def jpeg_b64(rgb: np.ndarray) -> str:
    from rio_tiler.models import ImageData

    arr = np.clip(np.nan_to_num(rgb), 0, 255).astype("uint8")
    return base64.b64encode(ImageData(arr).render(img_format="JPEG", QUALITY=88)).decode()


def _geocode(place: str) -> tuple[float, float, str]:
    q = urllib.parse.urlencode({"q": place, "format": "json", "limit": 1})
    hits = _json(f"https://nominatim.openstreetmap.org/search?{q}")
    if not hits:
        raise ValueError(f'no place found for "{place}"')
    return float(hits[0]["lon"]), float(hits[0]["lat"]), hits[0]["display_name"]


def _landmarks(bbox: list[float], name: str, lon: float, lat: float) -> list[dict]:
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    q = f'[out:json][timeout:40];(node["place"~"city|town|village"]({s},{w},{n},{e});node["natural"="peak"]["name"]({s},{w},{n},{e}););out body;'
    try:
        els = _json("https://overpass-api.de/api/interpreter?" + urllib.parse.urlencode({"data": q}), timeout=60).get("elements", [])
    except Exception:
        els = []
    num = lambda v: float(re.sub(r"[^0-9.]", "", v) or 0)
    towns = sorted([x for x in els if x.get("tags", {}).get("place") in ("city", "town", "village") and x["tags"].get("name")],
                   key=lambda x: -num(x["tags"].get("population", "0")))
    peaks = sorted([x for x in els if x.get("tags", {}).get("natural") == "peak" and x["tags"].get("ele")],
                   key=lambda x: -num(x["tags"]["ele"]))
    out = [{"name": name, "lon": lon, "lat": lat, "focus": True}]
    for x in towns[:5] + peaks[:2]:
        if math.hypot(x["lon"] - lon, x["lat"] - lat) > 0.004:
            out.append({"name": x["tags"]["name"], "lon": x["lon"], "lat": x["lat"], "peak": x["tags"].get("natural") == "peak"})
    return out


def _tnm_dem(core: list[float], dataset: str) -> list[str]:
    """GeoTIFF urls of a National Map elevation dataset over the box, newest project per tile."""
    r = _json(TNM + "?" + urllib.parse.urlencode({"datasets": dataset, "bbox": ",".join(str(v) for v in core),
                                                    "prodFormats": "GeoTIFF", "max": 50}))
    items = [i for i in r.get("items", []) if str(i.get("downloadURL", "")).endswith(".tif")]
    items.sort(key=lambda i: i.get("publicationDate") or i.get("dateCreated") or "", reverse=True)
    seen, out = set(), []
    for i in items:
        b = i.get("boundingBox") or {}
        key = tuple(round(b.get(k, 0), 2) for k in ("minX", "minY", "maxX", "maxY"))
        if key not in seen:   # the same tile is listed once per project that flew it
            seen.add(key)
            out.append(i["downloadURL"])
    return out


GROUND_SOURCES = [("lidar", "USGS 3DEP lidar", None), ("1m", "USGS 3DEP 1 m DEM", "Digital Elevation Model (DEM) 1 meter"),
                  ("10m", "USGS 3DEP 1/3 arc-second DEM", "National Elevation Dataset (NED) 1/3 arc-second Current")]
COPERNICUS = "Copernicus DEM 30 m"

WANT_KEYS = {"ground": ("auto", "lidar", "1m", "10m", "30m"), "buildings": ("auto", "none")}


def _check_want(want):
    for k, v in (want or {}).items():
        if k not in WANT_KEYS or v not in WANT_KEYS[k]:
            allowed = "; ".join(f"{a}: {', '.join(vs)}" for a, vs in WANT_KEYS.items())
            raise ValueError(f"unknown want {k}={v!r}; allowed {allowed}")


def _fine_ground(core, crs, core_b, gw, gh, in_us, want, steps):
    """Finer ground than the 30 m terrain: sources tried in order, each filling the gaps the last
    left, each recorded in steps. Returns (grid or None, label, lidar items, lidar cell mask)."""
    pick = (want or {}).get("ground", "auto")
    grid, used, lidar_items = None, [], []
    lidar_mask = np.zeros((gh, gw), bool)
    if not in_us:
        steps.append({"layer": "ground", "source": "USGS 3DEP (lidar, 1 m, 1/3 arc-second)",
                      "found": "outside the US, not searched", "used": False})
    for key, label, dataset in GROUND_SOURCES:
        if not in_us or pick not in ("auto", key):
            continue
        if grid is not None and np.isfinite(grid).mean() >= 0.9:
            break
        step = {"layer": "ground", "source": label, "found": "", "used": False}
        steps.append(step)
        items: list[dict] = []
        try:
            if dataset is None:
                items = _search(PC, ["3dep-lidar-dtm"], core)
                hrefs = [_sign("3dep-lidar-dtm", f["assets"]["data"]["href"]) for f in items]
            else:
                hrefs = _tnm_dem(core, dataset)
        except Exception as e:
            step.update(found="unreachable", note=f"unreachable ({type(e).__name__})")
            continue
        if not hrefs:
            step["found"] = "none here"
            continue
        g = read_grid(hrefs, crs, core_b, gw, gh)
        share = float(np.isfinite(g).mean()) if g is not None else 0.0
        if share == 0:
            step["found"] = f"{len(hrefs)} tiles, none readable"
            continue
        step.update(found=f"{len(hrefs)} tiles, {share * 100:.0f}% of the core", used=True)
        if key == "lidar":
            lidar_items, lidar_mask = items, np.isfinite(g)
        grid = g if grid is None else np.where(np.isnan(grid), g, grid)
        used.append(label)
    return grid, (", gaps from ".join(used) or COPERNICUS), lidar_items, lidar_mask


def _buildings(core: list[float], crs: str, cx: float, cy: float, cap: int = 6000) -> tuple[list[dict], str | None]:
    """Every building OpenStreetMap has in the core: footprint in local metres, height from
    its height tag, else its storeys at 3.2 m, else 6 m."""
    from rasterio.warp import transform as warp_xy

    s, w, n, e = core[1], core[0], core[3], core[2]
    q = f'[out:json][timeout:170][maxsize:536870912];way["building"]({s},{w},{n},{e});out geom;'
    els, err = None, None
    for attempt in (0, 1):
        try:
            r = _json("https://overpass-api.de/api/interpreter?" + urllib.parse.urlencode({"data": q}), timeout=200)
            if not r.get("elements") and r.get("remark"):   # HTTP 200 carrying a timeout or out-of-memory remark
                raise RuntimeError(str(r["remark"])[:80])
            els = r.get("elements", [])
            break
        except Exception as exc:   # not `e`: the except clause would delete the bbox east edge
            err = exc
            if attempt == 0:
                time.sleep(OVERPASS_RETRY_S)
    if els is None:
        return [], f"OpenStreetMap's Overpass server did not answer twice ({type(err).__name__})"
    # a dense city has far more than the cap: keep the ones nearest the middle, not the first returned
    mx, my = (w + e) / 2, (s + n) / 2
    els.sort(key=lambda el: ((el.get("geometry") or [{"lon": mx, "lat": my}])[0]["lon"] - mx) ** 2 + ((el.get("geometry") or [{"lon": mx, "lat": my}])[0]["lat"] - my) ** 2)
    out = []
    for el in els[:cap]:
        g = el.get("geometry") or []
        if len(g) < 4:
            continue
        t = el.get("tags", {})
        try:
            hgt = float(re.sub(r"[^0-9.]", "", t.get("height", "")) or 0) or float(t.get("building:levels", 0) or 0) * 3.2 or 6.0
        except ValueError:
            hgt = 6.0
        xs, ys = warp_xy("EPSG:4326", crs, [q_["lon"] for q_ in g], [q_["lat"] for q_ in g])
        out.append({"id": f"osm:way/{el.get('id')}", "p": [[round(x - cx, 1), round(y - cy, 1)] for x, y in zip(xs, ys)][:-1], "h": round(min(hgt, 400), 1), "k": t.get("building", "yes")})
    return out, None


def _soundscape(core, crs, cx, cy):
    """What this place sounds like beyond its birds and water, from OpenStreetMap: the big
    roads (traffic), railways, tramways and subways, runways (planes), stadiums and stages
    (crowds) and playgrounds. Lines come in local metres, thinned to 60 points; places as a
    point. The page synthesises each kind and gives it a slider."""
    from rasterio.warp import transform as warp_xy
    s, w, n, e = core[1], core[0], core[3], core[2]
    bb = f'({s},{w},{n},{e})'
    ask = lambda q: _json('https://overpass-api.de/api/interpreter?' + urllib.parse.urlencode({'data': q}), timeout=90).get('elements', [])
    def local(lons, lats):
        xs, ys = warp_xy('EPSG:4326', crs, lons, lats)
        return [[round(x - cx, 1), round(y - cy, 1)] for x, y in zip(xs, ys)]
    out = []
    try:
        lines = ask('[out:json][timeout:60];(' + f'way["highway"~"^(motorway|trunk|primary|secondary)$"]{bb};'
                    f'way["railway"~"^(rail|light_rail|subway|tram)$"]{bb};way["aeroway"="runway"]{bb};' + ');out geom;')
    except Exception:
        lines = []
    kinds = {'rail': 'train', 'light_rail': 'tram', 'tram': 'tram', 'subway': 'subway'}
    for el in lines:
        t, g = el.get('tags', {}), el.get('geometry') or []
        if len(g) < 2 or t.get('service') in ('yard', 'siding', 'spur', 'crossover'):
            continue
        if 'highway' in t:
            if t.get('tunnel') == 'yes':
                continue
            rec = {'kind': 'traffic', 'cls': t['highway']}
        elif 'railway' in t:
            rec = {'kind': kinds[t['railway']]}
        else:
            rec = {'kind': 'planes'}
        step = max(1, len(g) // 60)
        g = g[::step] + ([g[-1]] if (len(g) - 1) % step else [])
        rec['pts'] = local([p['lon'] for p in g], [p['lat'] for p in g])
        out.append(rec)
    try:
        places = ask('[out:json][timeout:60];(' + f'nwr["leisure"~"^(stadium|playground)$"]{bb};'
                     f'nwr["amenity"~"^(theatre|music_venue|nightclub|arts_centre)$"]{bb};' + ');out center;')
    except Exception:
        places = []
    count = {}
    for el in places:
        t = el.get('tags', {})
        kind = 'play' if t.get('leisure') == 'playground' else 'crowd'
        c = el.get('center') or ({'lat': el['lat'], 'lon': el['lon']} if 'lat' in el else None)
        if not c or count.get(kind, 0) >= 12:
            continue
        count[kind] = count.get(kind, 0) + 1
        out.append({'kind': kind, 'at': local([c['lon']], [c['lat']])[0], 'name': t.get('name', '')})
    # the busiest few of each line kind, by length, so a city keeps its main roads
    keep, seen = [], {}
    for r in sorted(out, key=lambda r: -len(r.get('pts', []))):
        k = r['kind'] + r.get('cls', '')
        if seen.get(k, 0) < 25:
            seen[k] = seen.get(k, 0) + 1
            keep.append(r)
    return keep


def _features(core, crs, cx, cy):
    from rasterio.warp import transform as warp_xy
    """The place's set pieces from OpenStreetMap: every waterfall with its height and width,
    facing the way its stream flows (waterways are drawn in the direction of flow), and the
    arch footbridges near them."""
    s, w, n, e = core[1], core[0], core[3], core[2]
    q = (f'[out:json][timeout:60];(node["waterway"="waterfall"]({s},{w},{n},{e});way["waterway"~"stream|river"]({s},{w},{n},{e});'
         f'way["man_made"="bridge"]({s},{w},{n},{e}););out geom;')
    try:
        els = _json('https://overpass-api.de/api/interpreter?' + urllib.parse.urlencode({'data': q}), timeout=90).get('elements', [])
    except Exception:
        return []
    def local(lons, lats):
        xs, ys = warp_xy('EPSG:4326', crs, lons, lats)
        return [[x - cx, y - cy] for x, y in zip(xs, ys)]
    streams = [local([g['lon'] for g in el['geometry']], [g['lat'] for g in el['geometry']]) for el in els if el['type'] == 'way' and el.get('tags', {}).get('waterway')]
    num = lambda v, d: (float(re.sub(r'[^0-9.]', '', str(v)) or d) if v is not None else d)
    out = []
    for el in els:
        t = el.get('tags', {})
        if el['type'] == 'node' and t.get('waterway') == 'waterfall':
            h = num(t.get('height'), 0)
            if h < 4:
                continue
            [x, y] = local([el['lon']], [el['lat']])[0]
            best, d = None, 1e9   # the stream vertex nearest the fall gives the way the water runs
            for line in streams:
                for k in range(len(line)):
                    dd = (line[k][0] - x) ** 2 + (line[k][1] - y) ** 2
                    if dd < d:
                        a, b = line[max(0, k - 1)], line[min(len(line) - 1, k + 1)]
                        if a != b:
                            best, d = [b[0] - a[0], b[1] - a[1]], dd
            if best is None or d > 60 ** 2:
                continue
            m = math.hypot(*best)
            out.append({'kind': 'waterfall', 'name': t.get('name', 'waterfall'), 'xy': [round(x, 1), round(y, 1)], 'h': round(min(h, 400), 1),
                        'w': round(max(num(t.get('width'), 4) * 1.6, 4), 1), 'dir': [round(best[0] / m, 3), round(best[1] / m, 3)]})
    falls = [f for f in out if f['kind'] == 'waterfall']
    for el in els:
        t = el.get('tags', {})
        if el['type'] == 'way' and t.get('man_made') == 'bridge' and el.get('geometry'):
            pts = local([g['lon'] for g in el['geometry']], [g['lat'] for g in el['geometry']])
            a, b = max(((p1, p2) for p1 in pts for p2 in pts), key=lambda q_: (q_[0][0] - q_[1][0]) ** 2 + (q_[0][1] - q_[1][1]) ** 2)
            mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
            near = min(falls, key=lambda f: (f['xy'][0] - mid[0]) ** 2 + (f['xy'][1] - mid[1]) ** 2, default=None)
            if near and math.hypot(near['xy'][0] - mid[0], near['xy'][1] - mid[1]) < 80:
                out.append({'kind': 'arch', 'name': t.get('name', 'bridge'), 'a': [round(a[0], 1), round(a[1], 1)], 'b': [round(b[0], 1), round(b[1], 1)], 'near': near['name']})
    return out


# ── BIRDS: the ones recorded here, at their own size, with their own voices ──
GBIF = 'https://api.gbif.org/v1'
XENO_CANTO = 'b1047888-ae52-4179-9dd5-5448ea342a24'   # xeno-canto's recordings, as a GBIF dataset
FLYING_ORDERS = {'Accipitriformes', 'Falconiformes', 'Cathartiformes', 'Pelecaniformes', 'Suliformes', 'Charadriiformes', 'Anseriformes', 'Gaviiformes', 'Podicipediformes'}
FAMILY_SPAN = {'Accipitridae': 1.8, 'Pandionidae': 1.6, 'Cathartidae': 1.75, 'Falconidae': 0.9, 'Ardeidae': 1.8, 'Laridae': 1.1, 'Anatidae': 0.9,
               'Corvidae': 0.75, 'Turdidae': 0.38, 'Cinclidae': 0.28, 'Passerellidae': 0.24, 'Picidae': 0.4, 'Trochilidae': 0.11, 'Strigidae': 1.0,
               'Columbidae': 0.55, 'Paridae': 0.2, 'Fringillidae': 0.23, 'Parulidae': 0.2, 'Troglodytidae': 0.16, 'Sittidae': 0.2, 'Regulidae': 0.16}
FAMILY_COLOUR = {'Corvidae': '#1d1b1a', 'Turdidae': '#7a4a2e', 'Cinclidae': '#5d6066', 'Passerellidae': '#4b4f55', 'Picidae': '#3b3530',
                 'Paridae': '#5b5d58', 'Fringillidae': '#7d6a40', 'Parulidae': '#8a8a3a', 'Accipitridae': '#3a2e26', 'Pandionidae': '#4a4038',
                 'Cathartidae': '#2a2420', 'Laridae': '#c9c9c4', 'Ardeidae': '#6e7880', 'Anatidae': '#5a4a38'}
LICENCE_RANK = ['publicdomain', '/by/', '/by-sa/', '/by-nc/', '/by-nc-sa/', '/by-nd/', '/by-nc-nd/']


def _wingspans(keys):
    """Wingspans in metres from Wikidata (P2050), found by GBIF taxon id (P846)."""
    vals = ' '.join(f'"{k}"' for k in keys)
    q = ('SELECT ?gbif ?amount ?unit WHERE { VALUES ?gbif { ' + vals + ' } ?item wdt:P846 ?gbif. '
         '?item p:P2050/psv:P2050 [wikibase:quantityAmount ?amount; wikibase:quantityUnit ?unit]. }')
    try:
        rows = _json('https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'}), timeout=60)['results']['bindings']
    except Exception:
        return {}
    unit = {'Q174728': 0.01, 'Q11573': 1.0, 'Q174789': 0.001, 'Q218593': 0.0254}
    out = {}
    for r in rows:
        f = unit.get(r['unit']['value'].rsplit('/', 1)[-1])
        if f:
            out.setdefault(int(r['gbif']['value']), float(r['amount']['value']) * f)
    return out


def _voice(key, want):
    """A recording of this bird from xeno-canto: a song or a call, mp3, the most open licence
    first; only its first ~200 KB (about ten seconds) is fetched."""
    try:
        recs = _json(f'{GBIF}/occurrence/search?speciesKey={key}&mediaType=Sound&datasetKey={XENO_CANTO}&limit=60', timeout=60).get('results', [])
    except Exception:
        return None
    best = None
    for r in recs:
        kind = (r.get('behavior') or '').lower()
        for m in r.get('media') or []:
            if m.get('type') != 'Sound' or m.get('format') != 'audio/mpeg':
                continue
            lic = m.get('license', '')
            rank = next((i for i, t in enumerate(LICENCE_RANK) if t in lic), 9) + (0 if want in kind else 20)
            if best is None or rank < best[0]:
                best = (rank, m, kind)
    if not best:
        return None
    m = best[1]
    try:
        req = urllib.request.Request(m['identifier'], headers={**UA, 'Range': 'bytes=0-204799'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except Exception:
        return None
    return {'bytes': data, 'type': 'song' if 'song' in best[2] else 'call',
            'credit': {'by': m.get('creator') or m.get('rightsHolder') or 'xeno-canto', 'license': m.get('license', ''), 'url': m.get('references') or m['identifier']}}


def _portraits(names):
    """A small picture of each species from Wikimedia Commons, its Wikidata image (P18),
    found by scientific name when there is one, else by its English name. Returns
    {name: (jpeg bytes, credit url)}; a species with no picture is left out."""
    out = {}
    for name, sci in names:
        try:
            if sci:
                q = 'SELECT ?img WHERE { ?t wdt:P225 "%s"; wdt:P18 ?img. } LIMIT 1' % sci.replace('"', '')
            else:
                q = 'SELECT ?img WHERE { ?t rdfs:label "%s"@en; wdt:P18 ?img; wdt:P225 ?n. } LIMIT 1' % name.split(' and ')[0].replace('"', '')
            rows = _json('https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'}), timeout=40)['results']['bindings']
            if not rows:
                continue
            fname = urllib.parse.unquote(rows[0]['img']['value'].rsplit('/', 1)[-1])
            src = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(fname) + '?width=160'
            with urllib.request.urlopen(urllib.request.Request(src, headers=UA), timeout=40) as r:
                data = r.read()
            if len(data) <= 400_000:
                out[name] = (data, 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(fname))
        except Exception:
            continue
    return out


def bird_life(core, profile=None, cap_fly=4, cap_sing=4):
    """The birds recorded here (GBIF), split into those you see flying and those you meet on
    the ground, each at its wingspan, with a song for the ground and a call for the air."""
    w, s_, e, n = core[0], core[1], core[2], core[3]
    pad_x, pad_y = (e - w), (n - s_)
    q = f'{GBIF}/occurrence/search?classKey=212&decimalLatitude={s_ - pad_y},{n + pad_y}&decimalLongitude={w - pad_x},{e + pad_x}&facet=speciesKey&facetLimit=40&limit=0'
    try:
        counts = _json(q, timeout=60)['facets'][0]['counts']
    except Exception:
        return []
    wanted = [str(f.get('name', '')).lower() for f in (profile or {}).get('fauna', []) if (f.get('kind') or 'bird') == 'bird']
    pool = []
    for c in counts:
        try:
            sp = _json(f"{GBIF}/species/{c['name']}", timeout=30)
        except Exception:
            continue
        name = sp.get('vernacularName') or sp.get('canonicalName')
        if not name or sp.get('rank') != 'SPECIES':
            continue
        named = any(x and (x.rstrip('s') in name.lower() or name.lower() in x) for x in wanted)
        fly = sp.get('order') in FLYING_ORDERS or (sp.get('family') == 'Corvidae' and (sp.get('canonicalName') or '').startswith('Corvus'))
        pool.append({'key': int(c['name']), 'records': c['count'], 'name': name, 'sci': sp.get('canonicalName'), 'family': sp.get('family'),
                     'order': sp.get('order'), 'kind': 'flyer' if fly else 'song', 'named': named})
    pool.sort(key=lambda b: (not b['named'], -b['records']))
    picked = [b for b in pool if b['kind'] == 'flyer'][:cap_fly] + [b for b in pool if b['kind'] == 'song'][:cap_sing]
    spans = _wingspans([b['key'] for b in picked])
    for b in picked:
        b['wingspan'] = round(spans.get(b['key']) or FAMILY_SPAN.get(b['family'], 0.3), 2)
        b['colour'] = FAMILY_COLOUR.get(b['family'], '#3b3632')
        b['voice'] = _voice(b['key'], 'call' if b['kind'] == 'flyer' else 'song')
    return picked


def _best_sentinel(far: list[float]) -> tuple[str, list[dict], float, bool]:
    """The clearest summer day whose scenes together cover the far box."""
    year, best = dt.date.today().year, None
    for y in (year, year - 1):
        feats = _search(ES, ["sentinel-2-l2a"], far, {"datetime": f"{y}-06-15T00:00:00Z/{y}-09-15T23:59:59Z",
                                                      "query": {"eo:cloud_cover": {"lt": 8}}}, limit=200)
        days: dict[str, list[dict]] = {}
        for f in feats:
            days.setdefault(f["properties"]["datetime"][:10], []).append(f)
        for day, fs in days.items():
            u = [min(f["bbox"][0] for f in fs), min(f["bbox"][1] for f in fs), max(f["bbox"][2] for f in fs), max(f["bbox"][3] for f in fs)]
            covers = u[0] <= far[0] and u[1] <= far[1] and u[2] >= far[2] and u[3] >= far[3]
            cloud = sum(f["properties"].get("eo:cloud_cover", 0) for f in fs) / len(fs)
            if best is None or (0 if covers else 1, cloud) < (0 if best[3] else 1, best[2]):
                best = (day, fs, cloud, covers)
        if best and best[3]:
            break
    if not best:
        raise ValueError("no clear Sentinel-2 summer pass over this place in the last two summers")
    return best


def build_world(place: str, radius_km: float = 25, core_km: float = 4, name: str | None = None,
                profile: dict | None = None, at: tuple[float, float] | None = None,
                touches_dir: str | None = None, want: dict | None = None) -> dict[str, Any]:
    """Gather and shape every layer of a world; returns the page's embedded blocks and its record.

    A profile with "setting": "city" builds a tight frame round the place with the city
    layer (city.py): measured building heights where a city model covers (PLATEAU in
    Tokyo), a sharp aerial photo where one is published (GSI in Japan), trees only where
    the city has them, shop signs, crossings, platforms, places to visit and recordings.
    touches_dir holds the community's touches (touches.py, one folder per touch under
    <touches_dir>/<world slug>/), laid on at every build.
    want steers the build: ground (auto, lidar, 1m, 10m, 30m) and buildings (auto, none).
    Every layer's attempt is recorded in meta["steps"]."""
    _check_want(want)
    from rasterio.warp import transform as warp_xy, transform_bounds
    import tempfile
    from . import city as citylayer, touches as touchlayer

    CITY = (profile or {}).get("setting") == "city"
    if CITY:   # a city is a tight frame round the place, not a landscape
        scale = (profile or {}).get("scale") or {}
        if radius_km == 25: radius_km = scale.get("radius_km", 3)
        if core_km == 4: core_km = scale.get("core_km", 1.2)
    files = tempfile.mkdtemp(prefix="gs-world-")   # a city's pictures and sounds, embedded as blocks at the end

    lon, lat, found = (at[0], at[1], place) if at else _geocode(place)
    name = name or place.split(",")[0].strip()
    crs = utm_crs(lon, lat)
    kx, ky = 111.32 * math.cos(math.radians(lat)), 110.57
    core = [lon - core_km / 2 / kx, lat - core_km * 0.4 / ky, lon + core_km / 2 / kx, lat + core_km * 0.4 / ky]
    far = [lon - radius_km / kx, lat - radius_km / ky, lon + radius_km / kx, lat + radius_km / ky]
    core_b, far_b = transform_bounds("EPSG:4326", crs, *core), transform_bounds("EPSG:4326", crs, *far)
    cx, cy = (core_b[0] + core_b[2]) / 2, (core_b[1] + core_b[3]) / 2
    rel = lambda b: [round(b[0] - cx, 1), round(b[1] - cy, 1), round(b[2] - cx, 1), round(b[3] - cy, 1)]
    local_xy = lambda lons, lats: [[round(x - cx, 1), round(y - cy, 1)] for x, y in zip(*warp_xy("EPSG:4326", crs, lons, lats))]
    in_us = 15 < lat < 72 and -170 < lon < -60
    blocks: dict[str, str] = {}
    steps: list[dict] = []

    # far: Copernicus terrain, Sentinel-2 true colour
    dems = [f["assets"]["data"]["href"] for f in _search(ES, ["cop-dem-glo-30"], far)]
    fw = 1024
    fh = int(round(fw * (far_b[3] - far_b[1]) / (far_b[2] - far_b[0])))
    far_h = read_grid(dems, crs, far_b, fw, fh, nodata=-32767)
    if far_h is None:
        raise ValueError("no terrain could be read for this place")
    far_h = np.nan_to_num(far_h, nan=float(np.nanmin(far_h))).astype(np.float32)
    s2_day, s2, s2_cloud, s2_covers = _best_sentinel(far)
    steps.append({"layer": "far photo", "source": "Sentinel-2", "used": True,
                  "found": f"{s2_day}, {s2_cloud:.0f}% cloud, " + ("covers the far box" if s2_covers else "does not cover the far box")})
    pw = 4096
    ph = int(round(pw * (far_b[3] - far_b[1]) / (far_b[2] - far_b[0])))
    blocks["far_photo"] = jpeg_b64(read_grid([f["assets"]["visual"]["href"] for f in s2], crs, far_b, pw, ph, bands=(1, 2, 3), nodata=0))
    blocks["far_heights"] = base64.b64encode(far_h.tobytes()).decode()

    # core ground: lidar where flown, else the 30 m terrain
    cell = 3.0
    gw, gh = int(round((core_b[2] - core_b[0]) / cell)), int(round((core_b[3] - core_b[1]) / cell))
    fill = read_grid(dems, crs, core_b, gw, gh, nodata=-32767)
    fine, glabel, dtm, lidar_mask = _fine_ground(core, crs, core_b, gw, gh, in_us, want, steps)
    hag_items = _search(PC, ["3dep-lidar-hag"], core) if dtm else []
    hag = read_grid([_sign("3dep-lidar-hag", f["assets"]["data"]["href"]) for f in hag_items], crs, core_b, gw, gh) if hag_items else None
    if fine is not None:
        sane = ~(np.isfinite(fill) & (np.abs(fine - fill) > 120))
        fine_mask = np.isfinite(fine) & sane
        lidar = lidar_mask & sane
        ground = np.where(fine_mask, fine, fill)
    else:
        fine_mask = lidar = np.zeros((gh, gw), bool)
        ground = fill
    if float(fine_mask.mean()) < 0.9:
        steps.append({"layer": "ground", "source": COPERNICUS, "found": "fills the rest" if fine_mask.any() else "whole core", "used": True})
    ground = despike(np.nan_to_num(ground, nan=float(np.nanmin(fill))).astype(np.float32))
    blocks["core_heights"] = base64.b64encode(ground.tobytes()).decode()

    # core photo: NAIP where it exists, else the Sentinel pass, with red and near-infrared for vegetation
    cpw = 4096
    cph = int(round(cpw * (core_b[3] - core_b[1]) / (core_b[2] - core_b[0])))
    naip = _search(PC, ["naip"], core, {"sortby": [{"field": "datetime", "direction": "desc"}]}) if in_us else []
    img = None
    # the newest NAIP year first; if its tiles refuse to download (2026-11-02: Oregon 2023 answered
    # 403 while 2022 read fine), the year before, and so on, before falling back to Sentinel-2
    for year in sorted({f["properties"]["datetime"][:4] for f in naip}, reverse=True):
        img = read_grid([_sign("naip", f["assets"]["image"]["href"]) for f in naip if f["properties"]["datetime"][:4] == year],
                        crs, core_b, cpw, cph, bands=(1, 2, 3, 4), resampling="lanczos", nodata=0)
        if img is not None and img.any():
            break
        img = None
    if img is not None:
        rgb, red, nir, photo = img[:3], img[0], img[3], f"NAIP {year}"
        steps.append({"layer": "core photo", "source": "NAIP", "found": year, "used": True})
    else:
        rgb = read_grid([f["assets"]["visual"]["href"] for f in s2], crs, core_b, cpw, cph, bands=(1, 2, 3), resampling="lanczos", nodata=0)
        red = read_grid([f["assets"]["red"]["href"] for f in s2], crs, core_b, cpw, cph, nodata=0)
        nir = read_grid([f["assets"]["nir"]["href"] for f in s2], crs, core_b, cpw, cph, nodata=0)
        photo = f"Sentinel-2 {s2_day}"
        steps.append({"layer": "core photo", "source": "Sentinel-2", "found": "no NAIP here, fell back to Sentinel-2 " + s2_day, "used": True})
    sharp = citylayer.gsi_photo(core_b, crs, cpw, cph) if CITY else None
    if sharp is not None:
        rgb, photo = sharp, "GSI seamless aerial photo (Geospatial Information Authority of Japan)"
    blocks["core_photo"] = jpeg_b64(rgb)

    # trees: every treetop the lidar saw; elsewhere from the photo's green
    rng = np.random.default_rng(7)
    have = np.isfinite(hag) if hag is not None else np.zeros((gh, gw), bool)
    hagc = np.where(have & (np.nan_to_num(hag) > 0) & (np.nan_to_num(hag) < 110), np.nan_to_num(hag), 0).astype(np.float32) if hag is not None else np.zeros((gh, gw), np.float32)
    ys, xs = np.nonzero(local_maxima(hagc, 1) & (hagc > 5))
    measured = np.stack([core_b[0] + (xs + 0.5) * cell - cx, core_b[3] - (ys + 0.5) * cell - cy, ground[ys, xs], hagc[ys, xs], np.zeros(len(xs))], axis=1)
    ndvi = (nir - red) / np.maximum(nir + red, 1)
    veg = ndvi[(np.arange(gh)[:, None] * cph / gh).astype(int).clip(0, cph - 1), (np.arange(gw)[None, :] * cpw / gw).astype(int).clip(0, cpw - 1)]
    ey, ex = np.nonzero((~have) & np.isfinite(veg) & (veg > 0.32) & (rng.random(veg.shape) < 0.11))
    jit = lambda n: (rng.random(n) - 0.5) * cell
    est_h = np.clip(18 + (veg[ey, ex] - 0.32) * 80 + rng.normal(0, 5, len(ey)), 8, 55)
    estimated = np.stack([core_b[0] + (ex + 0.5) * cell + jit(len(ex)) - cx, core_b[3] - (ey + 0.5) * cell + jit(len(ey)) - cy, ground[ey, ex], est_h, np.ones(len(ex))], axis=1)
    city_osm = {}
    if CITY:   # trees only where the city has them: mapped street trees and the green of its parks
        from rasterio.features import rasterize
        from rasterio.transform import from_bounds
        city_osm = citylayer.osm_city(core, local_xy)
        tf = from_bounds(core_b[0] - cx, core_b[1] - cy, core_b[2] - cx, core_b[3] - cy, gw, gh)
        greens = [{"type": "Polygon", "coordinates": [g + [g[0]]]} for g in city_osm.get("greens", []) if len(g) > 2]
        park = rasterize([(g, 1) for g in greens], out_shape=(gh, gw), transform=tf, fill=0).astype(bool) if greens else np.zeros((gh, gw), bool)
        py_, px_ = np.nonzero(park & np.isfinite(veg) & (veg > 0.28) & (rng.random(veg.shape) < 0.16))
        park_h = np.clip(14 + (veg[py_, px_] - 0.28) * 50 + rng.normal(0, 4, len(py_)), 7, 32)
        park_trees = np.stack([core_b[0] + (px_ + 0.5) * cell + jit(len(px_)) - cx, core_b[3] - (py_ + 0.5) * cell + jit(len(py_)) - cy, ground[py_, px_], park_h, np.ones(len(px_))], axis=1)
        st = [t for t in city_osm.get("trees", []) if core_b[0] - cx < t[0] < core_b[2] - cx and core_b[1] - cy < t[1] < core_b[3] - cy]
        if st:
            sx_, sy_ = np.array([t[0] for t in st]), np.array([t[1] for t in st])
            ci = ((sx_ - (core_b[0] - cx)) / cell).astype(int).clip(0, gw - 1); cj = (((core_b[3] - cy) - sy_) / cell).astype(int).clip(0, gh - 1)
            street = np.stack([sx_, sy_, ground[cj, ci], np.clip(rng.normal(11, 3, len(st)), 6, 20), np.ones(len(st))], axis=1)
        else:
            street = np.zeros((0, 5))
        estimated = np.concatenate([park_trees, street])
    trees = np.concatenate([measured, estimated]).astype(np.float32)
    blocks["trees"] = base64.b64encode(trees.tobytes()).decode()

    buildings = None
    if CITY:   # measured heights where a city model covers; the ring keeps only its skyline
        inner = core_km / 2 * 1000
        buildings = citylayer.plateau_buildings(far if radius_km <= 4 else [lon - 2.5 / kx, lat - 2.5 / ky, lon + 2.5 / kx, lat + 2.5 / ky], local_xy,
                                                keep=lambda h, d: d < inner * 1.6 or h >= 45)
        if buildings is not None:
            ext = rel(core_b)
            buildings = [b for b in buildings if (ext[0] < b["c"][0] < ext[2] and ext[1] < b["c"][1] < ext[3]) or b["h"] >= 45]
        if buildings:
            citylayer.attach_names(buildings, city_osm.get("named", []))
    bnote = None
    if (want or {}).get("buildings") == "none":
        buildings = []
        steps.append({"layer": "buildings", "source": "OpenStreetMap", "found": "skipped on request", "used": False})
    elif buildings:
        steps.append({"layer": "buildings", "source": "PLATEAU", "found": f"{len(buildings)} buildings", "used": True})
    else:
        buildings, bnote = _buildings(core, crs, cx, cy)
        step = {"layer": "buildings", "source": "OpenStreetMap", "found": f"{len(buildings)} buildings", "used": bool(buildings)}
        if bnote:
            step.update(found="no answer", note=bnote)
        steps.append(step)
    if CITY and sharp is not None:   # every crown the sharp photo sees on the streets, off the roofs
        seen = citylayer.photo_trees(rgb, core_b, cx, cy, cell, ground, [b for b in buildings if "p" in b], estimated[:, :2].tolist(), rng)
        estimated = np.concatenate([estimated, seen])
        trees = np.concatenate([measured, estimated]).astype(np.float32)
        blocks["trees"] = base64.b64encode(trees.tobytes()).decode()
    if CITY and buildings:   # each roof's own colour from the aerial photo (the page lays the photo on the roofs too)
        citylayer.roof_colours([b for b in buildings if "p" in b], rgb, core_b, cx, cy)
    features = _features(core, crs, cx, cy)
    sounds = _soundscape(core, crs, cx, cy)
    birds = bird_life(core, profile)
    for b in birds:
        v = b.pop("voice")
        if v:
            blocks[f"snd-{b['key']}"] = base64.b64encode(v["bytes"]).decode()
            b["sound"] = {"file": f"sounds/{b['key']}-{v['type']}.mp3", "type": v["type"], "credit": v["credit"]}
    for b in birds:   # the study's plumage, so each bird is painted like itself
        pl = ((profile or {}).get('plumage') or {}).get(b['name'])
        if pl:
            b['plumage'] = pl
    portraits = {}
    trees_named = [(t.get("name"), t.get("sci")) for t in ((profile or {}).get("species") or []) if t.get("name")]
    for pname, (data, credit) in _portraits([(b["name"], b.get("sci")) for b in birds] + trees_named).items():
        slug = re.sub(r"[^a-z0-9]+", "-", pname.lower()).strip("-")
        blocks[f"pic-{slug}"] = base64.b64encode(data).decode()
        portraits[pname] = {"file": f"portraits/{slug}.jpg", "credit": credit}
    marks = _landmarks(far, name, lon, lat)
    for m in marks:
        x, y = warp_xy("EPSG:4326", crs, [m["lon"]], [m["lat"]])
        m["xy"] = [round(x[0] - cx, 1), round(y[0] - cy, 1)]
    meta = {
        "name": name, "place": found, "crs": crs, "centre_lonlat": [lon, lat],
        "core": {"extent": rel(core_b), "grid": [gw, gh], "photo": [cpw, cph], "lidar_share": round(float(lidar.mean()), 3)},
        "far": {"extent": rel(far_b), "grid": [fw, fh], "photo": [pw, ph]},
        "trees": {"measured": int(len(measured)), "estimated": int(len(estimated)), "tallest_m": round(float(trees[:, 3].max()), 1) if len(trees) else 0},
        "sources": {"ground": glabel if fine_mask.any() else COPERNICUS, "core_photo": photo,
                    "far_photo": f"Sentinel-2 {s2_day}", "terrain": "Copernicus DEM GLO-30"},
        "landmarks": marks, "buildings": buildings, "features": features, "sounds": sounds, "birds": birds, "portraits": portraits, "profile": profile or None,
        "setting": "city" if CITY else "land",
    }
    if CITY:   # the places to visit with their pictures, and the city's recordings, beside the world
        pl = citylayer.places(profile, local_xy, files)
        recs = citylayer.recordings(profile, local_xy, files, {p["name"]: p["xy"] for p in pl})
        meta["city"] = {"signs": city_osm.get("signs", []), "crossings": city_osm.get("crossings", []), "platforms": city_osm.get("platforms", []),
                        "places": pl, "recordings": recs, "synth": (profile or {}).get("synth") or {}}
        meta["sources"]["buildings"] = "PLATEAU (MLIT Japan) via Indigo Lab" if buildings and "c" in buildings[0] else "OpenStreetMap"
    # the community's touches, laid on top of today's build
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    meta["touches"], meta["touch_report"] = touchlayer.lay(meta, slug, files, local_xy, root=touches_dir) if touches_dir else ([], [])
    # every file the city and the touches brought, inside the page as a block (city-layer.js fileUrl)
    for dirpath, _, fns in os.walk(files):
        for fn in fns:
            full = os.path.join(dirpath, fn)
            relp = os.path.relpath(full, files).replace(os.sep, "/").lower()
            blocks["f-" + re.sub(r"[^a-z0-9]+", "-", relp)] = base64.b64encode(open(full, "rb").read()).decode()
    caveats = []
    if not fine_mask.any():
        caveats.append("no fine terrain here: the ground is 30 m terrain and every tree is placed from the photo's vegetation with an estimated height")
    elif lidar.any() and lidar.mean() < 0.9:
        caveats.append(f"lidar covers {lidar.mean() * 100:.0f}% of the core; trees elsewhere are placed from the photo with estimated heights")
    elif not lidar.any():
        caveats.append(f"the ground is {glabel}, which carries no tree heights: every tree is placed from the photo's vegetation with an estimated height")
    if bnote:
        caveats.append(f"{bnote}; this world has no buildings. Build it again later for them.")
    if not naip:
        caveats.append(f"the core photo is Sentinel-2 at 10 m, not an aerial photo; up close the ground is soft")
    if not s2_covers:
        caveats.append(f"no single clear summer day covered the whole distance; edges may be blank")
    if not profile:
        caveats.append("no study of the place was given: the forest uses the default Pacific Northwest species; pass profile= to grow the place's own")
    voiced = [b for b in birds if b.get("sound")]
    if any("-nc" in b["sound"]["credit"]["license"] for b in voiced):
        caveats.append("some bird recordings are licensed non-commercial (xeno-canto, CC BY-NC); they are credited in the page and fine to share, not to sell")
    caveats.append("trees are generated from recipes and rules (species by distance to water, wind, variety); their positions and heights are data, their shapes are not")
    meta["steps"], meta["caveats"] = steps, caveats
    return {"meta": meta, "blocks": blocks, "caveats": caveats, "found": found, "sentinel": {"day": s2_day, "cloud_pct": round(s2_cloud, 2)}}


def write_world_html(world: dict[str, Any], path: str | Path) -> Path:
    """The template with the world's data embedded as base64 blocks: one file, no server."""
    page = TEMPLATE.read_text(encoding="utf-8").replace("__TITLE__", world["meta"]["name"]).replace("__WORLD__", "world")
    page = page.replace("/*__CITY_LAYER__*/", (TEMPLATE.parent / "city-layer.js").read_text(encoding="utf-8"))   # the city half of the page, in every world
    page = page.replace("/*__EVENTS__*/", (TEMPLATE.parent / "events.js").read_text(encoding="utf-8"))   # what happens here: the profile's events
    blocks = [f'<script type="application/json" id="w-meta">{json.dumps(world["meta"])}</script>']
    blocks += [f'<script type="application/octet-stream" id="w-{k}">{v}</script>' for k, v in world["blocks"].items()]
    page = page.replace('<script type="module">', "\n".join(blocks) + '\n<script type="module">', 1)
    p = Path(path)
    p.write_text(page, encoding="utf-8")
    return p
