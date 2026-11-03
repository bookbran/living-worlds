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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("t_"):
            fn()
            print("ok", name)
