# ◉ LIVE EARTH — Orbital Command

A single-page, real-time **3D globe command center** inspired by [overwatch.earth](https://overwatch.earth/):
world news, conflicts & disasters, earthquakes, live satellites, air traffic and live TV channels —
all on a photorealistic Earth with a **true day/night terminator** computed from the actual position
of the sun. No build step, no API keys, no backend.

## Quick start

Just open `index.html` in any modern browser (double-click it). That's it.

> Tip: serving it locally avoids any browser quirks with `file://`:
> ```
> python -m http.server 8000
> ```
> then visit http://localhost:8000

**All data layers start OFF** so the app boots buttery-smooth. Open the **LAYERS** panel
(left side) and flip on what you want — or click the **◉ ACTIVATE NEWS + TV** button in the
startup toast.

## Features

| Layer | Source | Notes |
|---|---|---|
| 🌍 Globe | three.js + NASA Blue Marble textures | custom shader: real-time terminator, city lights at night, ocean specular, clouds, atmosphere |
| 📰 News events | multi-source: [NASA EONET](https://eonet.gsfc.nasa.gov/) (live natural events w/ real coordinates), [Wikipedia Current Events](https://en.wikipedia.org/wiki/Portal:Current_events), [HN](https://hn.algolia.com/), + [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) enrichment when reachable | 6 color-coded categories incl. **CONFLICT** and **DISASTER**; headlines are pinned to the globe by scanning them against a built-in gazetteer of ~170 countries & hotspot cities |
| 🌊 Earthquakes | [USGS](https://earthquake.usgs.gov/earthquakes/feed/) | last 24h, M2.5+, pulsing rings scaled by magnitude |
| 🛰 Satellites | [CelesTrak](https://celestrak.org/) TLEs + [satellite.js](https://github.com/shashwatak/satellite-js) SGP4 | real orbital propagation — ISS & stations, 100 brightest, GPS, Starlink sample. Click one for its orbit trail + live telemetry |
| ✈ Air traffic | [OpenSky Network](https://opensky-network.org/) | anonymous API (rate-limited), up to 400 aircraft |
| 📺 Live TV | official YouTube live streams | draggable/resizable floating players, multiple at once |
| 🏙 Cities | built-in database (~155 metros) + [Open-Meteo](https://open-meteo.com/) + [Wikipedia](https://en.wikipedia.org/api/rest_v1/) | zoom-aware labels; click any city for a live dossier: local time, weather, air quality, sunrise/sunset, Wikipedia brief. Searchable by name |
| 🌌 Aurora oval | [NOAA SWPC OVATION](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) | live aurora probability cloud over both poles + planetary **Kp index** in the status bar |
| 🌧 Rain radar | [RainViewer](https://www.rainviewer.com/api.html) | live global precipitation radar tiles (2D map mode) |
| 📈 Markets | [CoinGecko](https://www.coingecko.com/en/api) | BTC/ETH live strip in the top bar, 2-min refresh |
| 🌦 Click intel | [Open-Meteo](https://open-meteo.com/) | click anywhere on the planet for surface conditions |
| 🗺 2D surface mode | [Leaflet](https://leafletjs.com/) + 4 basemaps: CARTO dark, **Esri satellite imagery (hybrid labels)**, OSM streets, OpenTopoMap | street-level zoom (z19), same layers, live night-shadow overlay |
| 🔍 Universal search | [Nominatim](https://nominatim.org/) | search **any place on Earth** — village, mountain, island — and get the full live dossier, not just a camera move |
| ⏱ Time warp | pure math | drag time ±48h: watch the day/night terminator sweep and every satellite re-propagate to its real past/future position |
| 🛬 Auto surface mode | — | zoom all the way into the 3D globe and it hands off seamlessly to the street map at the same spot; zoom out to return to orbit |
| ⚙ Settings | localStorage | rotation speed, cloud opacity, label density, render resolution, quake magnitude filter, news cadence, **custom TV channels** — all persisted |

Every source degrades gracefully: if an API is unreachable you get clearly-flagged **DEMO** data
instead of a broken page (amber indicators in the status bar / top bar).

## Hotkeys

`N` news · `Q` quakes · `S` satellites · `T` TV pins · `F` flights · `U` cities ·
`A` aurora · `W` rain radar · `C` clouds · `L` night lights · `B` borders ·
`R` auto-rotate · `I` click intel · `M` 2D/3D · `?` manual · `ESC` close

## Adding live TV channels

**Easiest way: no code.** Click the `+ ADD` chip in the channel dock (or ⚙ → TV CHANNELS),
paste a channel ID or `youtube.com/channel/…` URL, optionally give an HQ city for the globe pin.
Stored in your browser, survives restarts. The dock has region filters (EUROPE / AMERICAS /
ASIA / MEA / SCIENCE / CUSTOM) — 17 channels ship built-in.

For permanent built-ins, edit `js/config.js` → `CHANNELS`. Each entry needs the **YouTube channel id** (starts with `UC…`,
found in the channel page URL) plus a display name and HQ coordinates for its globe pin:

```js
{ name: 'MY CHANNEL', id: 'UCxxxxxxxxxxxxxxxxxxxxxx', country: 'Somewhere', lat: 12.34, lon: 56.78 },
```

The app embeds `youtube.com/embed/live_stream?channel=<id>`, which always resolves to whatever
that channel is currently live-streaming. If a channel isn't live (or blocks embeds), use the `↗`
button in the player header to open it on YouTube directly.

> Channel ids in the default list were verified mid-2026; broadcasters occasionally change them.

## Adding a data layer

1. `js/config.js` — add any endpoint/config.
2. `js/layers.js` — copy the `quakes` object as a template: fetch → fill `items` → `rebuild()`.
3. `js/ui.js` — add one row to the `TOGGLES` array. Done: switch, hotkey and feed wiring come free.

## API keys

**None required.** GDELT, USGS, CelesTrak, OpenSky (anonymous), Open-Meteo and Nominatim are all
free and keyless. `js/config.js` has an `API_KEYS` slot if you want to wire premium sources
(NewsAPI, GNews, …) into `layers.js`.

## Accuracy disclaimers

- Satellite positions come from real TLEs via SGP4 — good to a few km, not for operational use.
- News pins are approximate: headlines are located by place-name matching (a story about a country
  pins near its center, with a little jitter). EONET events use real coordinates.
- GDELT retired its GEO API; the app uses the DOC 2.0 API instead, which is aggressively
  rate-limited — the other three news sources carry the layer when GDELT declines.
- OpenSky's anonymous API is often unavailable; the flights layer then shows clearly-flagged
  synthetic demo traffic on real great-circle routes.
- Flight altitude is exaggerated ×20 so aircraft are visible at globe scale.
- The day/night terminator uses the standard low-precision solar ephemeris (±0.1°, plenty for visuals).

## Stack

three.js r128 · satellite.js 5 · Leaflet 1.9 — all via CDN, ~zero-install.
Textures from the [three-globe](https://github.com/vasturiano/three-globe) example set (NASA imagery).
