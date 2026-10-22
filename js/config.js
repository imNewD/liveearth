/* ============================================================
   LIVE EARTH — CONFIG
   Everything you'd want to tweak lives in this file:
   - API keys (none required for the default demo!)
   - Live TV channel list (add your own here)
   - News categories + GDELT queries
   - Satellite groups (CelesTrak)
   ============================================================ */
window.LE = window.LE || {};

/* ---------- simulated time (TIME WARP slider) ----------
   Offsets the sun terminator + satellite propagation; news/quake
   timestamps stay real. 0 = live. */
LE.timeOffsetMs = 0;
LE.simNow = () => new Date(Date.now() + LE.timeOffsetMs);

/* ---------- persisted user settings ---------- */
LE.DEFAULT_SETTINGS = {
  rotateSpeed: 1,        // auto-rotate multiplier (0..3)
  cloudOpacity: 0.55,    // 0..1
  labelDensity: 1,       // city label cap multiplier (0.5 / 1 / 2)
  pixelRatio: 0,         // 0 = auto, else forced
  pulse: true,           // marker pulse animation
  autoSurface: true,     // zoom past the deck -> drop into 2D surface map
  quakeMinMag: 0,        // hide quakes below this magnitude
  newsRefreshMin: 10,    // news auto-refresh interval
  basemap: 'dark',       // 2D basemap key (see BASEMAPS)
  customChannels: [],    // user-added TV channels
};
LE.settings = (function () {
  try { return Object.assign({}, LE.DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('LE_SETTINGS_V1') || '{}')); }
  catch (e) { return Object.assign({}, LE.DEFAULT_SETTINGS); }
})();
LE.saveSettings = () => { try { localStorage.setItem('LE_SETTINGS_V1', JSON.stringify(LE.settings)); } catch (e) {} };

LE.CONFIG = {

  // ----------------------------------------------------------
  // API KEYS — the default build needs NO keys at all.
  // GDELT, USGS, CelesTrak, OpenSky (anon) and Open-Meteo are
  // all free & keyless. Slots below are for optional upgrades.
  // ----------------------------------------------------------
  API_KEYS: {
    newsapi: '',   // optional: https://newsapi.org  (hook it up in layers.js -> NewsLayer)
    gnews:   '',   // optional: https://gnews.io
  },

  // ----------------------------------------------------------
  // LIVE TV CHANNELS — official 24/7 YouTube live streams.
  // "id" is the YouTube CHANNEL id; we embed via
  //   https://www.youtube.com/embed/live_stream?channel=<id>
  // which always resolves to the channel's current live feed.
  // To add a channel: copy a row, paste the channel id
  // (from the channel page URL / "share" -> it starts with UC).
  // ----------------------------------------------------------
  CHANNELS: [
    { name: 'AL JAZEERA EN',  id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', country: 'Qatar',     lat: 25.29,  lon: 51.53,   region: 'MEA' },
    { name: 'TRT WORLD',      id: 'UC7fWeaHhqgM4Ry-RMpM2YYw', country: 'Türkiye',   lat: 41.00,  lon: 28.98,   region: 'MEA' },
    { name: 'DW NEWS',        id: 'UCknLrEdhRCp1aegoMqRaCZg', country: 'Germany',   lat: 52.52,  lon: 13.40,   region: 'EUROPE' },
    { name: 'FRANCE 24',      id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', country: 'France',    lat: 48.85,  lon: 2.35,    region: 'EUROPE' },
    { name: 'SKY NEWS',       id: 'UCoMdktPbSTixAyNGwb-UYkQ', country: 'UK',        lat: 51.50,  lon: -0.12,   region: 'EUROPE' },
    { name: 'EURONEWS',       id: 'UCSrZ3UV4jOidv8ppoVuvW9Q', country: 'France',    lat: 45.76,  lon: 4.84,    region: 'EUROPE' },
    { name: 'NBC NEWS',       id: 'UCeY0bbntWzzVIaj2z3QigXg', country: 'USA',       lat: 40.76,  lon: -73.98,  region: 'AMERICAS' },
    { name: 'ABC NEWS US',    id: 'UCBi2mrWuNuyYy4gbM6fU18Q', country: 'USA',       lat: 40.75,  lon: -73.98,  region: 'AMERICAS' },
    { name: 'CBS NEWS',       id: 'UC8p1vwvWtl6T73JiExfWs1g', country: 'USA',       lat: 40.76,  lon: -73.98,  region: 'AMERICAS' },
    { name: 'CNBC',           id: 'UCvJJ_dzjViJCoLf5uKUTwoA', country: 'USA',       lat: 40.74,  lon: -74.17,  region: 'AMERICAS' },
    { name: 'BLOOMBERG',      id: 'UCIALMKvObZNtJ6AmdCLP7Lg', country: 'USA',       lat: 40.75,  lon: -73.99,  region: 'AMERICAS' },
    { name: 'WION',           id: 'UC_gUM8rL-Lrg6O3adPW9K1g', country: 'India',     lat: 28.61,  lon: 77.21,   region: 'ASIA' },
    { name: 'INDIA TODAY',    id: 'UCYPvAwZP8pZhSMW8qs7cVCw', country: 'India',     lat: 28.56,  lon: 77.32,   region: 'ASIA' },
    { name: 'NHK WORLD',      id: 'UCSPEjw8F2nQDtmUKPFNF7_A', country: 'Japan',     lat: 35.66,  lon: 139.75,  region: 'ASIA' },
    { name: 'CGTN',           id: 'UCgrNz-aDmcr2uuto8_DL2jg', country: 'China',     lat: 39.92,  lon: 116.44,  region: 'ASIA' },
    { name: 'ABC NEWS AU',    id: 'UCVgO39Bk5sMo66-6o6Spn6Q', country: 'Australia', lat: -33.87, lon: 151.21,  region: 'ASIA' },
    { name: 'NASA',           id: 'UCLA_DiR1FfKNvjuUpBHmylQ', country: 'USA',       lat: 29.76,  lon: -95.37,  region: 'SCIENCE' },
  ],
  TV_REGIONS: ['ALL', 'EUROPE', 'AMERICAS', 'ASIA', 'MEA', 'SCIENCE', 'CUSTOM'],

  // ----------------------------------------------------------
  // 2D BASEMAPS — free tile providers, street-level zoom.
  // "labels" = optional overlay drawn on top (hybrid mode).
  // ----------------------------------------------------------
  BASEMAPS: {
    dark: {
      label: 'DARK OPS', maxZoom: 20,
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '© OpenStreetMap © CARTO',
    },
    satellite: {
      label: 'SATELLITE', maxZoom: 19,
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, Maxar, Earthstar Geographics',
      labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    },
    streets: {
      label: 'STREETS', maxZoom: 19,
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    },
    topo: {
      label: 'TERRAIN', maxZoom: 17,
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap © OpenTopoMap (CC-BY-SA)',
    },
  },

  // ----------------------------------------------------------
  // NEWS CATEGORIES — each one is a live GDELT GEO 2.0 query.
  // GDELT geocodes world news in 65 languages, updated every
  // 15 minutes, completely free, no key. Add categories freely.
  // ----------------------------------------------------------
  CATEGORIES: [
    { key: 'conflict', label: 'CONFLICT',  color: '#ff3b30', query: '(war OR military OR missile OR airstrike OR troops OR ceasefire)' },
    { key: 'disaster', label: 'DISASTER',  color: '#ff9500', query: '(earthquake OR flood OR hurricane OR wildfire OR volcano OR typhoon)' },
    { key: 'politics', label: 'POLITICS',  color: '#ffd60a', query: '(election OR president OR parliament OR minister OR summit)' },
    { key: 'economy',  label: 'ECONOMY',   color: '#34c759', query: '(economy OR inflation OR markets OR trade OR oil)' },
    { key: 'tech',     label: 'TECH/SCI',  color: '#00e5ff', query: '(technology OR "artificial intelligence" OR spacecraft OR rocket OR cyberattack)' },
    { key: 'health',   label: 'HEALTH',    color: '#bf5af2', query: '(outbreak OR virus OR vaccine OR hospital OR disease)' },
  ],

  // ----------------------------------------------------------
  // SATELLITE GROUPS — live TLEs from CelesTrak (keyless).
  // "cap" limits how many objects we load from big groups.
  // ----------------------------------------------------------
  SAT_GROUPS: [
    { key: 'core',     label: 'STATIONS',    group: 'stations', color: '#00e5ff', cap: 20,  on: true  },
    { key: 'bright',   label: 'BRIGHTEST',   group: 'visual',   color: '#ffffff', cap: 120, on: false },
    { key: 'gps',      label: 'GPS',         group: 'gps-ops',  color: '#34c759', cap: 32,  on: false },
    { key: 'starlink', label: 'STARLINK×60', group: 'starlink', color: '#bf5af2', cap: 60,  on: false },
  ],

  // ----------------------------------------------------------
  // DATA ENDPOINTS (all free / keyless)
  // ----------------------------------------------------------
  URLS: {
    gdeltDoc:  'https://api.gdeltproject.org/api/v2/doc/doc',
    quakes:    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    celestrak: 'https://celestrak.org/NORAD/elements/gp.php',
    opensky:   'https://opensky-network.org/api/states/all',
    weather:   'https://api.open-meteo.com/v1/forecast',
    airQuality:'https://air-quality-api.open-meteo.com/v1/air-quality',
    wikiSummary:'https://en.wikipedia.org/api/rest_v1/page/summary/',
    kpIndex:   'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    aurora:    'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
    market:    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
    rainviewer:'https://api.rainviewer.com/public/weather-maps.json',
    geocode:   'https://nominatim.openstreetmap.org/search',
    reverse:   'https://nominatim.openstreetmap.org/reverse',
    borders:   'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
    texDay:    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    texNight:  'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    texWater:  'https://unpkg.com/three-globe/example/img/earth-water.png',
    texClouds: 'https://unpkg.com/three-globe/example/clouds/clouds.png',
  },

  // Refresh intervals (ms)
  REFRESH: { news: 10 * 60e3, quakes: 5 * 60e3, flights: 2 * 60e3 },

  // Flight altitude is exaggerated x20 so planes are visible above the surface
  FLIGHT_ALT_EXAGGERATION: 20,
  FLIGHT_CAP: 400,
};
