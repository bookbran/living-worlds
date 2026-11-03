"""A small Mapbox Vector Tile reader, so a city's open building tiles (PLATEAU and
the like) can be read with nothing installed. decode(bytes) gives
{layer: [{'props': {...}, 'type': 1|2|3, 'rings': [[(x, y), ...], ...], 'extent': 4096}]}
in tile pixel space; to_lonlat turns those into degrees."""
import math
import struct


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if c < 0x80:
            return r, i


def _fields(b):
    i, n = 0, len(b)
    while i < n:
        key, i = _varint(b, i)
        f, w = key >> 3, key & 7
        if w == 0:
            v, i = _varint(b, i)
        elif w == 1:
            v = b[i:i + 8]; i += 8
        elif w == 2:
            ln, i = _varint(b, i); v = b[i:i + ln]; i += ln
        elif w == 5:
            v = b[i:i + 4]; i += 4
        else:
            raise ValueError('bad wire type')
        yield f, w, v


def _packed(b):
    out, i = [], 0
    while i < len(b):
        v, i = _varint(b, i); out.append(v)
    return out


def _value(b):
    for f, w, v in _fields(b):
        if f == 1: return bytes(v).decode('utf-8', 'replace')
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f in (4, 5): return v
        if f == 6: return (v >> 1) ^ -(v & 1)
        if f == 7: return bool(v)
    return None


def _geometry(cmds):
    rings, cur, x, y, i = [], [], 0, 0, 0
    zz = lambda n: (n >> 1) ^ -(n & 1)
    while i < len(cmds):
        c = cmds[i]; i += 1
        op, cnt = c & 7, c >> 3
        if op == 1 or op == 2:
            for _ in range(cnt):
                x += zz(cmds[i]); y += zz(cmds[i + 1]); i += 2
                if op == 1 and cur:
                    rings.append(cur); cur = []
                cur.append((x, y))
        elif op == 7 and cur:
            rings.append(cur); cur = []
    if cur:
        rings.append(cur)
    return rings


def decode(data):
    out = {}
    for f, w, layer in _fields(memoryview(data)):
        if f != 3:
            continue
        name, keys, vals, feats, extent = '', [], [], [], 4096
        for lf, lw, lv in _fields(layer):
            if lf == 1: name = bytes(lv).decode()
            elif lf == 2: feats.append(lv)
            elif lf == 3: keys.append(bytes(lv).decode())
            elif lf == 4: vals.append(_value(lv))
            elif lf == 5: extent = lv
        items = []
        for fb in feats:
            tags, typ, geom = [], 0, []
            for ff, fw, fv in _fields(fb):
                if ff == 2: tags = _packed(fv)
                elif ff == 3: typ = fv
                elif ff == 4: geom = _packed(fv)
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags) - 1, 2)}
            items.append({'props': props, 'type': typ, 'rings': _geometry(geom), 'extent': extent})
        out[name] = items
    return out


def tile_of(lon, lat, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def to_lonlat(px, py, z, tx, ty, extent=4096):
    n = 2 ** z
    lon = (tx + px / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + py / extent) / n))))
    return lon, lat


def ring_area(r):
    a = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        a += x1 * y2 - x2 * y1
    return a / 2
