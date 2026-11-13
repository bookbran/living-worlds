"""The world checks that came over from Groundstation's unit checks.

    uv run python tests/checks.py
"""
import tempfile
from pathlib import Path

import numpy as np

from living_worlds import world


def t_world_template_loads_embedded_or_beside():
    # the one page every living world uses: titled and pointed at its data by the
    # builder, and able to read that data from inside itself (one shareable file)
    page = (Path(world.__file__).parent / "static" / "world.html").read_text(encoding="utf-8")
    assert "__TITLE__" in page and "__WORLD__" in page
    assert "inside('meta')" in page and "data:image/jpeg;base64," in page
    assert "pickSpecies" in page and "meta.profile" in page and "meta.buildings" in page
    assert "meta.features" in page and "carvedAt" in page
    assert "meta.birds" in page and "createPanner" in page
    for place in ("Bridge of the Gods", "Hood River", "Mount Hood"):
        assert place not in page, place   # every place-specific word comes from the world's data


def t_world_utm_and_treetops_and_despike():
    assert world.utm_crs(-121.9, 45.6) == "EPSG:32610" and world.utm_crs(151.2, -33.9) == "EPSG:32756"
    h = np.zeros((9, 9), np.float32); h[2, 2] = 30; h[6, 6] = 20
    tops = world.local_maxima(h, 1) & (h > 5)
    assert set(zip(*np.nonzero(tops))) == {(2, 2), (6, 6)}
    g = np.full((40, 40), 21.0, np.float32); g[10:16, 10:16] = 928.0
    assert float(world.despike(g).max()) < 30


def t_world_html_embeds_every_block():
    w = {"meta": {"name": "Test <Place>", "landmarks": []}, "blocks": {"trees": "AAAA", "core_heights": "AAAA"}}
    out = Path(tempfile.mkdtemp()) / "world-test.html"
    page = world.write_world_html(w, out).read_text(encoding="utf-8")
    assert 'id="w-meta"' in page and 'id="w-trees"' in page and 'id="w-core_heights"' in page
    assert "__TITLE__" not in page and page.index('id="w-meta"') < page.index('<script type="module">')


def t_gallery_switch_round_trip():
    import os

    from living_worlds import viewer

    old, os.environ["HOME"] = os.environ.get("HOME"), tempfile.mkdtemp()
    try:
        assert viewer.gallery_on()
        viewer.set_gallery(False)
        assert not viewer.gallery_on()
        viewer.set_gallery(True)
        assert viewer.gallery_on()
    finally:
        os.environ["HOME"] = old


def _world_patched(fn, **patches):
    old = {k: getattr(world, k) for k in patches}
    try:
        for k, v in patches.items():
            setattr(world, k, v)
        return fn(world)
    finally:
        for k, v in old.items():
            setattr(world, k, v)


def t_world_buildings_retry_once_then_use_the_answer():
    calls = []
    way = {"id": 1, "geometry": [{"lon": 0.001, "lat": 0.001}, {"lon": 0.002, "lat": 0.001}, {"lon": 0.002, "lat": 0.002},
                                 {"lon": 0.001, "lat": 0.002}, {"lon": 0.001, "lat": 0.001}], "tags": {"building": "yes", "height": "10"}}

    def flaky(url, body=None, timeout=90):
        calls.append(1)
        if len(calls) == 1:
            raise OSError("down")
        return {"elements": [way]}
    out, note = _world_patched(lambda w: w._buildings([0, 0, 0.01, 0.01], "EPSG:32631", 0, 0), _json=flaky, OVERPASS_RETRY_S=0)
    assert len(out) == 1 and note is None and len(calls) == 2


def t_world_buildings_give_a_note_when_overpass_fails_twice():
    def boom(url, body=None, timeout=90):
        raise OSError("down")
    out, note = _world_patched(lambda w: w._buildings([0, 0, 0.01, 0.01], "EPSG:32631", 0, 0), _json=boom, OVERPASS_RETRY_S=0)
    assert out == [] and isinstance(note, str) and note


def t_world_ground_falls_through_to_the_1m_dem():
    steps = []
    grid = np.full((4, 4), 100.0, np.float32)
    got, label, items, _m = _world_patched(
        lambda w: w._fine_ground([0, 0, 0.01, 0.01], "EPSG:32631", (0, 0, 12, 12), 4, 4, True, None, steps),
        _search=lambda *a, **k: [], _tnm_dem=lambda core, ds: ["https://example.test/a.tif"] if "1 meter" in ds else [],
        read_grid=lambda *a, **k: grid)
    assert got is grid and label == "USGS 3DEP 1 m DEM" and items == []
    assert [(s["source"], s["used"]) for s in steps] == [("USGS 3DEP lidar", False), ("USGS 3DEP 1 m DEM", True)]


def t_world_ground_with_nothing_fine_keeps_the_30m_terrain():
    steps = []
    got, label, items, _m = _world_patched(
        lambda w: w._fine_ground([0, 0, 0.01, 0.01], "EPSG:32631", (0, 0, 12, 12), 4, 4, True, None, steps),
        _search=lambda *a, **k: [], _tnm_dem=lambda core, ds: [], read_grid=lambda *a, **k: None)
    assert got is None and label == world.COPERNICUS and items == []
    assert len(steps) == 3 and not any(s["used"] for s in steps)


def t_world_ground_30m_request_searches_nothing():
    calls = []

    def spy(*a, **k):
        calls.append(1)
        return []
    got, label, _, _m = _world_patched(
        lambda w: w._fine_ground([0, 0, 0.01, 0.01], "EPSG:32631", (0, 0, 12, 12), 4, 4, True, {"ground": "30m"}, []),
        _search=spy, _tnm_dem=spy)
    assert got is None and label == world.COPERNICUS and calls == []


def t_world_ground_layers_lidar_over_the_1m_gaps():
    lid = np.full((10, 10), np.nan, np.float32)
    lid.flat[:40] = 100.0
    full = np.full((10, 10), 101.0, np.float32)
    steps = []
    got, label, items, mask = _world_patched(
        lambda w: w._fine_ground([0, 0, 0.01, 0.01], "EPSG:32631", (0, 0, 30, 30), 10, 10, True, None, steps),
        _search=lambda *a, **k: [{"assets": {"data": {"href": "lidar"}}}], _sign=lambda c, h: h,
        _tnm_dem=lambda core, ds: ["1m"], read_grid=lambda hrefs, *a, **k: lid if hrefs == ["lidar"] else full)
    assert label == "USGS 3DEP lidar, gaps from USGS 3DEP 1 m DEM" and len(items) == 1
    assert abs(float(mask.mean()) - 0.4) < 1e-6 and bool(np.isfinite(got).all()) and got.flat[0] == 100.0 and got.flat[99] == 101.0
    assert [s["used"] for s in steps] == [True, True]


def t_world_buildings_overpass_remark_counts_as_failure():
    calls = []

    def remark(url, body=None, timeout=90):
        calls.append(1)
        return {"remark": "runtime error: Query timed out", "elements": []}
    out, note = _world_patched(lambda w: w._buildings([0, 0, 0.01, 0.01], "EPSG:32631", 0, 0), _json=remark, OVERPASS_RETRY_S=0)
    assert out == [] and note and len(calls) == 2


def t_world_want_is_validated():
    world._check_want({"ground": "1m", "buildings": "none"})
    for bad in ({"ground": "lidarr"}, {"roof": "auto"}):
        try:
            world.build_world("x", want=bad)
        except ValueError as e:
            assert "allowed" in str(e)
        else:
            raise AssertionError(bad)


def t_world_page_shows_how_it_was_built():
    page = (Path(world.__file__).parent / "static" / "world.html").read_text(encoding="utf-8")
    assert 'id="built"' in page and "meta.steps" in page


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("t_"):
            fn()
            print("ok", name)
