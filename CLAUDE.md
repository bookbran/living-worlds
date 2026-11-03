# Living worlds: agent notes

One product: walk-in 3D worlds of real places (`render_world`) and the Maps gallery that shows them beside Groundstation's maps. Split out of [dannybauman/groundstation#136](https://github.com/dannybauman/groundstation/pull/136) on 2026-11-03 so Groundstation stays the small set of Earth data tools agents call.

## Where things live

- `src/living_worlds/server.py`: the MCP server (`render_world`) and the gallery start-up.
- `src/living_worlds/world.py`: the builder (terrain, lidar, trees, photo, birds, sound sources, waterfalls). `city.py` and `mvt.py` build the city half; `touches.py` lays community touches on a world.
- `src/living_worlds/static/world.html`: the one page every world uses; `city-layer.js` and `events.js` are inlined into it at build time.
- `src/living_worlds/viewer.py` and `static/maps*.{html,css}`: the Maps gallery on port 27530.
- `skills/living-world/SKILL.md`: study the place, write the profile, build, show.
- `examples/`: study profiles.

## Rules

- Every place-specific word comes from the world's data, never the template (`tests/checks.py` holds the line).
- Keep the version in `pyproject.toml`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` the same; the Astrolabe Store compares the marketplace one.
- Output goes to `GROUNDSTATION_OUT`, shared with Groundstation on purpose, so one gallery shows both.
- Open question carried over from Groundstation: whether shared worlds travel as built files or as recipes (goggledefogger/second-brain-dashboard#1113).
