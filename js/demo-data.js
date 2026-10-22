/* ============================================================
   LIVE EARTH — DEMO / FALLBACK DATA
   Used automatically when a live API is unreachable or rate
   limited, so the experience never breaks. Anything sourced
   from here is clearly flagged "DEMO" in the status bar.
   All demo headlines are fictional placeholders.
   ============================================================ */
window.LE = window.LE || {};

/* Gazetteer used to pin live news headlines to the globe:
   we scan each headline for these place names (longest match wins),
   falling back to the article's source country. Lowercase keys. */
LE.GEO_POINTS = {
  // --- countries ---
  'united states': [39.8, -98.6], 'usa': [39.8, -98.6], 'u.s.': [39.8, -98.6], 'america': [39.8, -98.6],
  'canada': [56.1, -106.3], 'mexico': [23.6, -102.5], 'brazil': [-14.2, -51.9], 'argentina': [-38.4, -63.6],
  'colombia': [4.6, -74.1], 'venezuela': [6.4, -66.6], 'chile': [-35.7, -71.5], 'peru': [-9.2, -75.0],
  'united kingdom': [54.0, -2.5], 'britain': [54.0, -2.5], 'uk ': [54.0, -2.5], 'england': [52.4, -1.5],
  'france': [46.6, 2.2], 'germany': [51.2, 10.4], 'italy': [42.5, 12.5], 'spain': [40.4, -3.7],
  'portugal': [39.4, -8.2], 'netherlands': [52.1, 5.3], 'belgium': [50.5, 4.5], 'switzerland': [46.8, 8.2],
  'austria': [47.5, 14.5], 'poland': [51.9, 19.1], 'ukraine': [49.0, 32.0], 'russia': [60.0, 90.0],
  'belarus': [53.7, 27.9], 'sweden': [62.0, 15.0], 'norway': [64.5, 11.0], 'finland': [64.0, 26.0],
  'denmark': [56.0, 10.0], 'greece': [39.0, 22.0], 'turkey': [39.0, 35.2], 'türkiye': [39.0, 35.2],
  'romania': [45.9, 25.0], 'hungary': [47.2, 19.5], 'czech': [49.8, 15.5], 'serbia': [44.0, 21.0],
  'israel': [31.4, 35.0], 'palestin': [31.9, 35.2], 'gaza': [31.4, 34.4], 'lebanon': [33.9, 35.9],
  'syria': [35.0, 38.0], 'iraq': [33.2, 43.7], 'iran': [32.4, 53.7], 'saudi arabia': [24.0, 45.0],
  'yemen': [15.6, 48.0], 'jordan': [31.3, 36.4], 'egypt': [26.8, 30.8], 'qatar': [25.3, 51.2],
  'united arab emirates': [24.0, 54.0], 'uae': [24.0, 54.0], 'kuwait': [29.3, 47.5], 'afghanistan': [33.9, 67.7],
  'pakistan': [30.4, 69.3], 'india': [21.0, 78.0], 'bangladesh': [23.7, 90.4], 'sri lanka': [7.9, 80.8],
  'nepal': [28.4, 84.1], 'china': [35.0, 104.0], 'taiwan': [23.7, 121.0], 'japan': [36.2, 138.3],
  'south korea': [36.5, 127.9], 'north korea': [40.3, 127.4], 'korea': [36.5, 127.9],
  'philippines': [12.9, 121.8], 'vietnam': [15.9, 106.7], 'thailand': [15.9, 101.0], 'myanmar': [21.9, 96.0],
  'malaysia': [4.2, 102.0], 'indonesia': [-2.5, 118.0], 'singapore': [1.35, 103.8], 'australia': [-25.3, 133.8],
  'new zealand': [-41.5, 172.8], 'nigeria': [9.1, 8.7], 'ethiopia': [9.1, 40.5], 'kenya': [0.0, 37.9],
  'somalia': [5.2, 46.2], 'sudan': [12.9, 30.2], 'libya': [26.3, 17.2], 'tunisia': [33.9, 9.5],
  'algeria': [28.0, 1.7], 'morocco': [31.8, -7.1], 'ghana': [7.9, -1.0], 'south africa': [-29.0, 24.7],
  'congo': [-2.9, 23.7], 'mali': [17.6, -4.0], 'niger': [17.6, 8.1], 'chad': [15.5, 18.7],
  'kazakhstan': [48.0, 66.9], 'uzbekistan': [41.4, 64.6], 'georgia': [42.3, 43.4], 'armenia': [40.1, 45.0],
  'azerbaijan': [40.1, 47.6], 'mongolia': [46.9, 103.8], 'cuba': [21.5, -79.5], 'haiti': [19.0, -72.7],
  'iceland': [64.9, -19.0], 'ireland': [53.4, -8.2], 'greenland': [71.7, -42.6], 'panama': [8.5, -80.8],
  // --- hotspot cities (checked before countries — longer keys win) ---
  'washington': [38.9, -77.0], 'new york': [40.7, -74.0], 'los angeles': [34.05, -118.2],
  'london': [51.5, -0.12], 'paris': [48.85, 2.35], 'berlin': [52.52, 13.4], 'brussels': [50.85, 4.35],
  'geneva': [46.2, 6.14], 'moscow': [55.75, 37.6], 'kyiv': [50.45, 30.5], 'kiev': [50.45, 30.5],
  'beijing': [39.9, 116.4], 'shanghai': [31.2, 121.5], 'hong kong': [22.3, 114.2], 'tokyo': [35.68, 139.7],
  'seoul': [37.57, 127.0], 'pyongyang': [39.03, 125.75], 'taipei': [25.03, 121.56], 'delhi': [28.6, 77.2],
  'mumbai': [19.08, 72.88], 'islamabad': [33.7, 73.05], 'kabul': [34.55, 69.2], 'tehran': [35.7, 51.4],
  'baghdad': [33.3, 44.4], 'damascus': [33.5, 36.3], 'beirut': [33.9, 35.5], 'jerusalem': [31.78, 35.22],
  'tel aviv': [32.08, 34.78], 'riyadh': [24.7, 46.7], 'dubai': [25.2, 55.3], 'cairo': [30.04, 31.24],
  'istanbul': [41.0, 28.98], 'ankara': [39.93, 32.86], 'nairobi': [-1.29, 36.82], 'lagos': [6.5, 3.4],
  'johannesburg': [-26.2, 28.05], 'sydney': [-33.87, 151.2], 'jakarta': [-6.2, 106.8], 'manila': [14.6, 121.0],
  'bangkok': [13.75, 100.5], 'buenos aires': [-34.6, -58.4], 'mexico city': [19.4, -99.1],
  'sao paulo': [-23.55, -46.63], 'brasilia': [-15.79, -47.88], 'ottawa': [45.42, -75.7], 'toronto': [43.65, -79.38],
  'vienna': [48.2, 16.37], 'warsaw': [52.23, 21.01], 'madrid': [40.42, -3.7], 'rome': [41.9, 12.5],
  'athens': [38.0, 23.7], 'stockholm': [59.33, 18.07], 'oslo': [59.91, 10.75], 'helsinki': [60.17, 24.94],
};

LE.DEMO = {

  news: [
    // conflict
    { cat: 'conflict', lat: 48.0,  lon: 37.8,   place: 'Donetsk Oblast',   title: 'Ceasefire talks resume along contested front line' },
    { cat: 'conflict', lat: 26.6,  lon: 56.25,  place: 'Strait of Hormuz', title: 'Naval patrols increased after tanker standoff' },
    { cat: 'conflict', lat: 13.5,  lon: 2.1,    place: 'Sahel Region',     title: 'Peacekeeping mission extends buffer-zone mandate' },
    { cat: 'conflict', lat: 33.4,  lon: 35.5,   place: 'Southern Lebanon', title: 'Cross-border shelling reported overnight' },
    // disaster
    { cat: 'disaster', lat: -33.4, lon: -70.6,  place: 'Central Chile',    title: 'M6.2 earthquake shakes coastal region, no tsunami threat' },
    { cat: 'disaster', lat: 38.0,  lon: 23.7,   place: 'Attica, Greece',   title: 'Wildfires force evacuations near capital suburbs' },
    { cat: 'disaster', lat: 23.8,  lon: 90.4,   place: 'Dhaka Division',   title: 'Monsoon floods displace thousands in low-lying districts' },
    { cat: 'disaster', lat: 63.9,  lon: -22.4,  place: 'Reykjanes, Iceland', title: 'Volcanic activity raises aviation alert level' },
    // politics
    { cat: 'politics', lat: 52.23, lon: 21.01,  place: 'Warsaw',           title: 'Snap parliamentary elections announced for autumn' },
    { cat: 'politics', lat: -1.29, lon: 36.82,  place: 'Nairobi',          title: 'Regional security summit opens with 14 delegations' },
    { cat: 'politics', lat: -34.6, lon: -58.4,  place: 'Buenos Aires',     title: 'New cabinet sworn in amid reform push' },
    { cat: 'politics', lat: 1.35,  lon: 103.8,  place: 'Singapore',        title: 'Trade bloc talks enter final round' },
    // economy
    { cat: 'economy',  lat: 35.68, lon: 139.69, place: 'Tokyo',            title: 'Central bank holds rates, signals patience on inflation' },
    { cat: 'economy',  lat: 24.7,  lon: 46.7,   place: 'Riyadh',           title: 'Oil output agreement extended through next quarter' },
    { cat: 'economy',  lat: 40.71, lon: -74.0,  place: 'New York',         title: 'Tech shares rally on strong earnings week' },
    { cat: 'economy',  lat: 51.9,  lon: 4.5,    place: 'Rotterdam',        title: 'Port strike disrupts container traffic across Europe' },
    // tech
    { cat: 'tech',     lat: 28.5,  lon: -80.6,  place: 'Cape Canaveral',   title: 'New orbital launch window confirmed for heavy-lift mission' },
    { cat: 'tech',     lat: 46.2,  lon: 6.14,   place: 'Geneva',           title: 'International AI safety framework unveiled' },
    { cat: 'tech',     lat: -6.8,  lon: 39.28,  place: 'Dar es Salaam',    title: 'New subsea internet cable comes online' },
    { cat: 'tech',     lat: 24.77, lon: 121.0,  place: 'Hsinchu',          title: 'Next-gen chip fab breaks ground' },
    // health
    { cat: 'health',   lat: 6.5,   lon: 3.4,    place: 'Lagos',            title: 'Vaccination campaign expands to rural districts' },
    { cat: 'health',   lat: 19.4,  lon: -99.1,  place: 'Mexico City',      title: 'Hospital network completes major upgrade program' },
    { cat: 'health',   lat: -6.2,  lon: 106.8,  place: 'Jakarta',          title: 'Officials declare regional outbreak contained' },
    { cat: 'health',   lat: 28.6,  lon: 77.2,   place: 'New Delhi',        title: 'Health ministers adopt pandemic readiness pact' },
  ],

  quakes: [
    { lat: 38.3,  lon: 142.4,  mag: 5.8, place: 'off the east coast of Honshu, Japan' },
    { lat: -20.5, lon: -70.4,  mag: 5.1, place: 'near the coast of northern Chile' },
    { lat: 51.3,  lon: 178.9,  mag: 4.7, place: 'Rat Islands, Aleutian Islands' },
    { lat: -6.1,  lon: 130.5,  mag: 6.1, place: 'Banda Sea' },
    { lat: 36.1,  lon: 27.9,   mag: 4.5, place: 'Dodecanese Islands, Greece' },
    { lat: 61.5,  lon: -150.0, mag: 4.9, place: 'Southern Alaska' },
    { lat: -17.8, lon: 167.5,  mag: 5.5, place: 'Vanuatu region' },
    { lat: 0.5,   lon: 125.2,  mag: 5.0, place: 'Molucca Sea' },
  ],

  // Great-circle demo routes when OpenSky is unavailable
  flightRoutes: [
    { from: [40.64, -73.78], to: [51.47, -0.45],  tag: 'JFK-LHR' },
    { from: [33.94, -118.4], to: [35.77, 140.39], tag: 'LAX-NRT' },
    { from: [25.25, 55.36],  to: [-33.95, 151.18],tag: 'DXB-SYD' },
    { from: [-23.4, -46.5],  to: [40.47, -3.56],  tag: 'GRU-MAD' },
    { from: [1.36, 103.99],  to: [50.03, 8.56],   tag: 'SIN-FRA' },
    { from: [-26.13, 28.24], to: [51.47, -0.45],  tag: 'JNB-LHR' },
    { from: [64.13, -21.94], to: [40.64, -73.78], tag: 'KEF-JFK' },
    { from: [55.97, 37.41],  to: [39.51, 116.41], tag: 'SVO-PEK' },
    { from: [19.44, -99.07], to: [-12.02, -77.11],tag: 'MEX-LIM' },
    { from: [30.12, 31.4],   to: [9.07, 7.26],    tag: 'CAI-ABV' },
    { from: [35.55, 139.78], to: [22.31, 113.91], tag: 'HND-HKG' },
    { from: [49.01, 2.55],   to: [-33.96, 18.6],  tag: 'CDG-CPT' },
  ],

  // Synthetic satellites when CelesTrak is unreachable —
  // mathematically plausible circular orbits, flagged DEMO.
  syntheticSats: (function () {
    const sats = [];
    sats.push({ name: 'ISS (DEMO)', alt: 420, inc: 51.6, raan: 40,  phase: 0 });
    sats.push({ name: 'CSS (DEMO)', alt: 390, inc: 41.5, raan: 190, phase: 120 });
    for (let i = 0; i < 6; i++) sats.push({ name: 'POLAR-' + (i + 1) + ' (DEMO)', alt: 800 + i * 30, inc: 98.6, raan: i * 60, phase: i * 47 });
    for (let i = 0; i < 6; i++) sats.push({ name: 'NAV-' + (i + 1) + ' (DEMO)',   alt: 20200,        inc: 55,   raan: i * 60, phase: i * 61 });
    for (let i = 0; i < 4; i++) sats.push({ name: 'GEO-' + (i + 1) + ' (DEMO)',   alt: 35786,        inc: 0.1,  raan: 0,      phase: i * 90 });
    return sats;
  })(),
};
