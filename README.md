# Living worlds

Living worlds builds a 3D world of any place on Earth that you can fly through, listen to and share as one file. Ask your agent for Multnomah Falls and it studies the place first (which trees grow there and where, what grows under them, which birds live there, what color the buildings are), then builds the world from public data in about four minutes.

Here's what goes into a world:

- **The ground and the trees.** Where the US has flown a USGS lidar survey, the world uses the laser's own ground and every treetop it saw, under a NAIP aerial photo. Everywhere else, it grows trees from the vegetation in a Sentinel-2 satellite photo and estimates their heights.
- **The place's own forest.** The study's species grow where they grow in life, so Douglas firs stand on the slopes and bigleaf maples keep to the creek. Wind moves them, and the forest streams in around the camera all the way to the horizon.
- **Birds with their own voices.** The birds come from GBIF's records for that spot, at their own wingspans, singing their own songs from xeno-canto recordings. Press a bird's picture to hear it and fly to one.
- **Water and buildings.** Waterfalls pour over carved cliffs into mist and roar, and rivers ripple. Buildings come from OpenStreetMap at their recorded heights, in the colors the study found.
- **A sound mix for the place.** Falls, birds and wind in the trees, plus the traffic, trains, crowds, playgrounds and planes that OpenStreetMap shows nearby, each on its own slider.
- **A sky that moves.** The sun casts shadows, and sliders change the time of day, the clouds and the haze.

Each world is one self-contained HTML file of 15 to 30 MB. It opens in any browser with no server (it loads its 3D library from the web, so it needs a connection), and you can send it to a friend as it is.

**Try one first:** download [Multnomah Falls](https://github.com/bookbran/groundstation/releases/download/example-multnomah-falls-world/world-multnomah-falls.html) (29 MB), open it in a browser, and press "Hear this place."

## The Maps gallery

The server also runs a gallery at http://127.0.0.1:27530 that shows every map, timelapse and living world on your computer, newest first, with a thumbnail for each. It reads the same folder Groundstation writes to (`GROUNDSTATION_OUT`), so Groundstation's maps and your worlds appear together.

## Install

Living worlds runs on [uv](https://docs.astral.sh/uv/). In Claude Code:

```
claude plugin marketplace add bookbran/living-worlds
claude plugin install living-worlds@living-worlds
```

That adds the `render_world` tool, the `living-world` skill that studies a place before building it, and the gallery. Astrolabe members can install it from the Store.

Any other MCP client can run the server with `uv --directory <this folder> run living-worlds`.

## Built on

Living worlds started as a branch of [Groundstation](https://github.com/dannybauman/groundstation), Danny Bauman's Earth data tools for agents at Development Seed labs, and it moved here so Groundstation can stay small ([groundstation#136](https://github.com/dannybauman/groundstation/pull/136) has the full history). It works well beside the Groundstation plugin, which finds imagery, compares dates and makes ordinary maps.

The data comes from [USGS 3DEP](https://www.usgs.gov/3d-elevation-program) lidar, [NAIP](https://naip-usdaonline.hub.arcgis.com/) aerial photos, [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) and [Sentinel-2](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2) via [Earth Search](https://earth-search.aws.element84.com/v1) and [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/), [OpenStreetMap](https://www.openstreetmap.org/) (places, buildings, waterfalls and sound sources), [GBIF](https://www.gbif.org/) (which birds live there), [Wikidata](https://www.wikidata.org/) (wingspans), [xeno-canto](https://xeno-canto.org/) (bird recordings, each credited to its recordist) and [Wikimedia Commons](https://commons.wikimedia.org/) (bird and tree pictures). [rio-tiler](https://github.com/cogeotiff/rio-tiler) reads the rasters, and [three.js](https://threejs.org/) draws the world.

## Good to know

- The builder always generates the trees' shapes, and their positions and heights are the data. Where a place has no lidar, the heights are estimates, and each build says so in its caveats.
- Some xeno-canto recordings allow only non-commercial use, and the caveats say when a world includes one.
- A world sends place names and coordinates to the public services above and nothing else.

## License

MIT. See [LICENSE](LICENSE).
