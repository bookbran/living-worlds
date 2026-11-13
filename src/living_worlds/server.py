"""living-worlds MCP server: one tool, render_world, plus the Maps gallery.

Register with Claude Code (the plugin does this for you):

    claude mcp add living-worlds -- uv --directory /path/to/living-worlds run living-worlds

It sits beside Groundstation (github.com/dannybauman/groundstation), which keeps
the Earth data tools: search, previews, maps, timelapses, events, weather. This
server adds the visual product built on the same open data: a world you can
stand in, and one gallery for everything both of them make.
"""

from __future__ import annotations

import os
from importlib.metadata import version
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from living_worlds import viewer

GALLERY_URL = "http://127.0.0.1:27530"
mcp = FastMCP("living-worlds")


def _slug(text: str, max_len: int = 60) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in text.lower())[:max_len].strip("-")


def _artifact_path(out_path: str | None, title: str) -> str:
    """Where the world goes. The default is GROUNDSTATION_OUT, so Groundstation's
    maps and these worlds land in one folder and one gallery."""
    out_dir = Path(os.environ.get("GROUNDSTATION_OUT", Path.cwd() / "demo"))
    if not out_path:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(out_dir / f"world-{_slug(title)}.html")
    dest = Path(out_path)
    if dest.suffix.lower() != ".html":
        raise ValueError("out_path must end in .html")
    if dest.is_symlink():
        raise ValueError("out_path is a symlink; refusing to write through it")
    cwd = Path.cwd().resolve()
    roots = [out_dir.resolve()] + ([cwd] if (cwd / ".git").exists() else [])
    if not any(dest.resolve().is_relative_to(r) for r in roots):
        raise ValueError("out_path must sit under GROUNDSTATION_OUT or a repository checkout you are working in")
    return str(dest)


@mcp.tool()
def render_world(
    place: str,
    title: str | None = None,
    radius_km: float = 25.0,
    core_km: float = 4.0,
    out_path: str | None = None,
    profile: dict[str, Any] | None = None,
    at: list[float] | None = None,
    touches_dir: str | None = None,
    want: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a living world: an open-world 3D scene of a place, as one HTML file.

    place is a name ("Bridge of the Gods, Oregon"); geocoded with Nominatim.
    The core (core_km across, default 4) carries USGS 3DEP lidar ground and every
    treetop the lidar saw where the US has flown it, with a NAIP aerial photo;
    anywhere else Copernicus 30 m terrain, the clearest Sentinel-2 summer pass,
    and trees placed from the photo's vegetation with estimated heights. The far
    ring (radius_km, default 25) is Copernicus terrain under that Sentinel-2
    pass, so the camera can pull back to the mountains around. Towns and peaks
    are labelled from OpenStreetMap.

    The page grows the forest in the browser the way open-world engines do:
    species recipes instanced at every tree, wind, per-tree variation, impostors
    at mid distance, trees streamed round the camera to the horizon, a physical
    sky with sun shadows and a time-of-day slider, cloud shadows, a rippling
    river where the data shows one. Every byte is embedded, so it opens with no
    server and shares as-is; expect 15 to 30 MB and a few minutes to build.

    profile: a study of the place, so the world grows its own forest rather than
    a default one. Study first (its trees and where each grows, what grows under
    them, the birds overhead, the colour of its buildings), then pass
      {"summary": str,
       "species": [{"name", "form": "conifer"|"broad", "needle"|"leaf": "#hex",
                    "tip": "#hex", "share": 0-1, "water": "near"|"avoid"|"any",
                    "elev": [lo, hi] m, "maxHeight": m, "width", "droop", "tiers",
                    "clear", "tint": [r, g, b]}, ... up to 6],
       "understory": {"name", "color": "#hex", "density": 0-1},
       "fauna": [{"name", "kind": "bird", "count", "color", "size_m", "altitude_m",
                  "over": "water"|"forest"|"any"}],
       "structures": {"wall": "#hex", "roof": "#hex"}}
    Buildings come from OpenStreetMap in the core, raised to their recorded heights.
    Every OpenStreetMap waterfall in the core is modelled: a carved cliff from its lip
    to its pool (tiers chain), falling water, foam, mist and spray, and the arch
    footbridges beside it; steep ground everywhere turns to rock. Birds are the ones
    GBIF has records of here, at their wingspans (Wikidata, else their family), with
    their own voices from xeno-canto: songs from birds on the ground, calls from birds
    in flight, heard from where they are once the viewer turns sound on; every
    waterfall roars.
    at: [lon, lat] to build there instead of geocoding the name.
    A profile with "setting": "city" builds a city instead of a landscape: a tight
    frame (scale.core_km, scale.radius_km), measured building heights where a city
    model covers (PLATEAU in Tokyo), a sharp aerial photo where one is published (GSI
    in Japan), trees only where the city has them, lit windows and shop signs at
    night, and the profile's places (to fly to) and recordings (Wikimedia Commons).
    touches_dir: a folder of community touches, one per subfolder under
    <touches_dir>/<world slug>/ (see touches.py for the format and the budget); each
    is laid on at every build, credited by name, or reported as waiting or turned away.

    want: steer the build, ground = auto, lidar, 1m, 10m or 30m (a named one tries
    only that source, then the 30 m terrain); buildings = auto or none.

    Returns {path, title, place, core, trees, sources, steps, landmarks, caveats};
    steps lists each source tried and whether it was used. Read
    the caveats: where there is no lidar, tree heights are estimates, and tree
    shapes are always generated (their positions and heights are the data).
    """
    from living_worlds import world as _world

    w = _world.build_world(place, radius_km=radius_km, core_km=core_km, name=title, profile=profile,
                           at=tuple(at) if at else None, touches_dir=touches_dir, want=want)
    path = _artifact_path(out_path, w["meta"]["name"])
    _world.write_world_html(w, path)
    m = w["meta"]
    return {
        "path": path, "title": m["name"], "place": w["found"],
        "core": {"km": core_km, "lidar_share": m["core"]["lidar_share"], "photo": m["sources"]["core_photo"]},
        "trees": m["trees"], "sources": m["sources"], "steps": m["steps"], "sentinel": w["sentinel"],
        "landmarks": [l["name"] for l in m["landmarks"]], "buildings": len(m["buildings"]),
        "set_pieces": [f"{f['name']} ({f['kind']})" for f in m["features"]],
        "birds": [f"{b['name']} ({b['kind']}, {b['wingspan']} m{', ' + b['sound']['type'] if b.get('sound') else ''})" for b in m["birds"]],
        "species": [s["name"] for s in (profile or {}).get("species", [])] or "default", "caveats": w["caveats"],
        "size_mb": round(Path(path).stat().st_size / 1e6, 1),
        "gallery": GALLERY_URL if viewer.gallery_on() else "The gallery is off; gallery(on=true) brings it back.",
    }


@mcp.tool()
def gallery(on: bool) -> dict[str, str]:
    """Turn the Maps gallery on or off for the whole computer, every chat. Off stays
    off until turned on, also across restarts. When off, it stops within about 5 s."""
    viewer.set_gallery(on)
    return {"gallery": "on" if on else "off", "url": GALLERY_URL,
            "note": "The gallery is on and answers within 5 seconds." if on
            else "The gallery is off in every chat and stays off until you turn it on."}


def main() -> None:
    # the Maps gallery answers from whichever chat binds the port first
    if os.environ.get("LIVING_WORLDS_GALLERY", os.environ.get("GROUNDSTATION_MAPS", "1")) != "0":
        viewer.serve_in_background()
    mcp._mcp_server.version = version("living-worlds")
    mcp.run()


if __name__ == "__main__":
    main()
