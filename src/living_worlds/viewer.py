"""The Maps gallery: a gallery of every map, timelapse and living world made here.

    living-worlds-maps            # http://127.0.0.1:27530

The living-worlds MCP server also starts it in the background (server.main), so any chat
with living worlds loaded keeps the gallery answering; a second server finds the port
taken and leaves it to the first. Standard library only, so a plugin install
needs nothing beyond what the MCP server already has.

Where it looks: GROUNDSTATION_OUT (where Groundstation and render_world write by default),
then a `groundstation/` folder and its `img/` beside wherever it was started
(an Astrolabe brain keeps its maps there). Newest first.

A page asked for with `?fit` is dressed for the gallery: no stray scrollbars,
glass controls that follow the gallery's day or night, a dark street map by
night, and water indexes drawn as water. The page on disk is never changed.
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

STATIC = Path(__file__).parent / "static"
PORT = int(os.environ.get("GROUNDSTATION_MAPS_PORT", "27530"))
TYPES = {
    ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
    ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".bin": "application/octet-stream",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webp": "image/webp",
}

# A water index (green against near-infrared) draws as water: dry land clear so
# the map shows through, then deepening blues as the water does. Intervals are
# on the index rescaled -1..1 to 0..255, so 128 is zero.
WATER = json.dumps([
    [[0, 128], [0, 0, 0, 0]], [[128, 150], [150, 205, 240, 120]], [[150, 180], [90, 170, 235, 200]],
    [[180, 215], [45, 125, 220, 235]], [[215, 256], [20, 80, 190, 255]],
], separators=(",", ":"))
NDWI = "(expression=%28b1-b2%29%2F%28b1%2Bb2%29&assets=green&assets=nir&rescale=-1%2C1)&colormap_name=rdylgn"


def roots() -> list[Path]:
    """The folders the gallery lists, in order, each once."""
    out: list[Path] = []
    cwd = Path.cwd()
    for p in (Path(os.environ["GROUNDSTATION_OUT"]) if os.environ.get("GROUNDSTATION_OUT") else cwd / "demo",
              cwd / "groundstation", cwd / "groundstation" / "img"):
        p = p.resolve()
        if p not in out:
            out.append(p)
    return out


def _title(p: Path) -> str:
    try:
        m = re.search(r"<title>([^<]*)</title>", p.read_text("utf-8", errors="ignore")[:20000], re.I)
        if m and m.group(1).strip():
            t = m.group(1).strip()
            return re.sub(r"\s+[—-]\s+(\d{4}-\d{2}-\d{2}) vs (\d{4}-\d{2}-\d{2})$", r", \2 to \1", t)
    except OSError:
        pass
    return re.sub(r"-+", " ", re.sub(r"^map3?d?-", "", p.stem))


def _kind(name: str, title: str) -> str:
    if name.startswith("field-test"):
        return "Field test"
    if name.startswith("world-"):
        return "Living 3D"
    if name.startswith("map3d"):
        return "3D"
    if re.search("timelapse", name, re.I):
        return "Timelapse"
    if re.search(r"-vs-|\bvs\b| to \d{4}-", name + " " + title, re.I):
        return "Before / after"
    return "Map"


def list_maps() -> list[dict]:
    """Every page in the gallery's folders, newest first. `file` is `<root index>/<name>`."""
    out = []
    for i, root in enumerate(roots()):
        if not root.is_dir():
            continue
        for p in root.glob("*.html"):
            title = _title(p)
            png, thumb = p.with_suffix(".png"), p.with_name(p.stem + ".thumb.jpg")
            pic = png if png.exists() else thumb if thumb.exists() else None
            out.append({
                "file": f"{i}/{p.name}", "title": title, "kind": _kind(p.name, title),
                "thumb": f"{i}/{pic.name}" if pic else None, "mtime": p.stat().st_mtime * 1000,
            })
    return sorted(out, key=lambda m: m["mtime"], reverse=True)


def resolve(rel: str) -> Path | None:
    """`<root index>/<path>` to a real file inside that root, or None."""
    head, _, rest = rel.partition("/")
    rs = roots()
    if not head.isdigit() or int(head) >= len(rs) or not rest:
        return None
    root = rs[int(head)]
    p = (root / rest).resolve()
    return p if p.is_file() and (p == root or root in p.parents) else None


def dress(html: str, theme: str) -> str:
    html = html.replace(NDWI, NDWI.replace("colormap_name=rdylgn", "colormap=") + _quote(WATER))
    if theme == "dark":
        html = html.replace("openfreemap.org/styles/positron", "openfreemap.org/styles/dark")
    return html


def _quote(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet: it runs inside the MCP server, whose stdout is the protocol
        pass

    def _send(self, code: int, body: bytes, ctype: str = "text/plain; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/":
            return self._send(200, (STATIC / "maps.html").read_bytes(), TYPES[".html"])
        if url.path == "/api/maps":
            return self._send(200, json.dumps(list_maps()).encode(), TYPES[".json"])
        if url.path == "/healthz":
            return self._send(200, b"ok")
        p = resolve(unquote(url.path.removeprefix("/maps/").lstrip("/")))
        if not p:
            return self._send(404, b"not found")
        ctype = TYPES.get(p.suffix.lower(), "application/octet-stream")
        if p.suffix == ".html" and "fit" in q:
            theme = "light" if q.get("theme", [""])[0] == "light" else "dark"
            html = p.read_text("utf-8", errors="replace")
            if p.name.startswith("field-test"):
                css = (STATIC / "maps-page.css").read_text("utf-8")
            else:
                html = dress(html, theme)
                css = (STATIC / "maps-fit.css").read_text("utf-8") + (STATIC / f"maps-glass-{theme}.css").read_text("utf-8")
            html = html.replace("</head>", css + "</head>", 1) if "</head>" in html else css + html
            return self._send(200, html.encode("utf-8"), ctype)
        return self._send(200, p.read_bytes(), ctype)

    def do_POST(self):
        # THUMBNAILS: the gallery snaps a map once it has drawn and sends the
        # picture here, saved beside it as <name>.thumb.jpg
        if urlparse(self.path).path != "/api/thumb":
            return self._send(404, b"not found")
        try:
            n = int(self.headers.get("content-length", "0"))
            if n > 2_000_000:
                raise ValueError("too big")
            d = json.loads(self.rfile.read(n))
            p = resolve(str(d.get("file", "")))
            m = re.fullmatch(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)", str(d.get("data", "")))
            if not p or p.suffix != ".html" or not m:
                raise ValueError("bad")
            p.with_name(p.stem + ".thumb.jpg").write_bytes(base64.b64decode(m.group(1)))
            return self._send(200, b'{"ok":true}', TYPES[".json"])
        except Exception:
            return self._send(400, b"")


def serve(port: int = PORT) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True
    return httpd


def serve_in_background(port: int = PORT) -> None:
    """Keep the gallery answering from this process whenever the port is free.

    ponytail: one gallery per computer, claimed by whichever living-worlds
    process binds first; the rest retry every 30 s so it comes back when that
    chat closes. Upgrade path: a single always-on service, if members ask for
    the gallery with no chat open.
    """
    def run():
        while True:
            try:
                serve(port).serve_forever()
            except OSError:
                time.sleep(30)

    threading.Thread(target=run, name="living-worlds-maps", daemon=True).start()


def main() -> None:
    print(f"Maps gallery on http://127.0.0.1:{PORT}")
    serve().serve_forever()


if __name__ == "__main__":
    main()
