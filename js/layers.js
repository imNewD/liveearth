/* ============================================================
   LIVE EARTH — DATA LAYERS
   news (GDELT), quakes (USGS), sats (CelesTrak + satellite.js),
   flights (OpenSky), tv (config). Every layer degrades to demo
   data if its API is unreachable — status bar shows LIVE/DEMO.

   TO ADD A NEW LAYER: copy the quakes object, give it a key,
   a fetch that fills this.items [{lat,lon,title,...}], call
   rebuild() to place markers, then register a toggle in ui.js.
   ============================================================ */
window.LE = window.LE || {};

LE.layers = (function () {
  const C = LE.CONFIG, G = () => LE.globe;
  const status = { gdelt: 'off', usgs: 'off', celestrak: 'off', opensky: 'off' };

  function setStatus(src, st) {
    status[src] = st;
    if (LE.ui) LE.ui.renderStatus(status);
  }
  function timeAgo(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }
  function decodeHtml(s) {
    const el = document.createElement('textarea'); el.innerHTML = s; return el.value;
  }

  // ================= NEWS (GDELT GEO 2.0 — free, keyless) =================
  const news = {
    key: 'news', on: false, items: [], searchItems: [], demo: false,
    catVisible: Object.fromEntries(C.CATEGORIES.map(c => [c.key, false])),
    _timer: null,

    async toggle(on) {
      this.on = on;
      G().setLayerVisible('news', on);
      if (on && !this.items.length) await this.refresh();
      if (on) this._timer = setInterval(() => this.refresh(), ((LE.settings && LE.settings.newsRefreshMin) || 10) * 60e3);
      else if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (LE.ui) { LE.ui.renderFeed(); LE.ui.renderTicker(); }
    },

    // pin a headline to the globe: scan the title for known places
    // (longest match wins), fall back to the article's source country
    locate(title, sourceCountry) {
      const t = ' ' + String(title).toLowerCase() + ' ';
      let best = null, bestLen = 0;
      for (const name in LE.GEO_POINTS) {
        if (name.length > bestLen && t.includes(name)) { best = LE.GEO_POINTS[name]; bestLen = name.length; }
      }
      if (!best) {
        const sc = String(sourceCountry || '').toLowerCase();
        for (const name in LE.GEO_POINTS) {
          if (sc && (sc.includes(name) || name.includes(sc)) && name.length > bestLen) { best = LE.GEO_POINTS[name]; bestLen = name.length; }
        }
      }
      if (!best) return null;
      // jitter so co-located stories don't stack on one pixel
      return { lat: best[0] + (Math.random() - 0.5) * 2.4, lon: best[1] + (Math.random() - 0.5) * 2.4 };
    },

    // direct fetch first; if GDELT blocks (CORS / temporary 429 ban),
    // retry once through the allorigins.win relay before giving up
    async fetchJson(url) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(url, { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error('http ' + r.status);
        return await r.json();
      } catch (e) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error('relay http ' + r.status);
        return await r.json();
      }
    },

    async fetchCategory(cat) {
      const url = `${C.URLS.gdeltDoc}?query=${encodeURIComponent(cat.query)}&mode=ArtList&format=json&maxrecords=30&timespan=1d&sort=hybridrel`;
      const j = await this.fetchJson(url);
      const out = [];
      for (const a of (j.articles || [])) {
        if (!a.title) continue;
        const loc = this.locate(a.title, a.sourcecountry);
        if (!loc) continue;
        let time = Date.now();
        const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(a.seendate || '');
        if (m) time = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
        out.push({
          type: 'news', cat: cat.key, color: cat.color,
          lat: loc.lat, lon: loc.lon,
          title: decodeHtml(a.title).trim(),
          url: a.url || null, source: a.domain || 'GDELT',
          image: a.socialimage || null,
          count: 1, place: a.sourcecountry || '', time,
        });
      }
      return out;
    },

    // keyword classifier for sources that don't pre-categorize
    classify(title) {
      const t = ' ' + title.toLowerCase() + ' ';
      const K = {
        conflict: ['war', 'strike', 'missile', 'attack', 'troops', 'military', 'ceasefire', 'drone', 'offensive', 'killed', 'invasion', 'hostage'],
        disaster: ['earthquake', 'quake', 'flood', 'hurricane', 'wildfire', 'volcano', 'typhoon', 'cyclone', 'tsunami', 'landslide', 'storm', 'eruption'],
        health: ['health', 'virus', 'vaccine', 'outbreak', 'hospital', 'disease', 'cancer', 'pandemic'],
        economy: ['econom', 'inflation', 'market', 'trade', 'tariff', 'bank', 'stocks', 'oil price', 'gdp'],
        tech: [' ai ', 'artificial intelligence', 'rocket', 'cyber', 'chip', 'software', 'robot', 'spacex', 'satellite', 'tech'],
      };
      for (const cat in K) if (K[cat].some(w => t.includes(w))) return cat;
      return 'politics';
    },
    catColor(key) { const c = C.CATEGORIES.find(x => x.key === key); return c ? c.color : '#ffffff'; },

    // NASA EONET — live natural events WITH real coordinates, CORS-open
    async fetchEonet() {
      const j = await this.fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60');
      const out = [];
      for (const ev of (j.events || [])) {
        const g = ev.geometry && ev.geometry[ev.geometry.length - 1];
        if (!g) continue;
        let lon, lat;
        if (g.type === 'Point') { lon = g.coordinates[0]; lat = g.coordinates[1]; }
        else if (g.type === 'Polygon') { lon = g.coordinates[0][0][0]; lat = g.coordinates[0][0][1]; }
        else continue;
        out.push({
          type: 'news', cat: 'disaster', color: this.catColor('disaster'),
          lat, lon, title: ev.title,
          url: (ev.sources && ev.sources[0] && ev.sources[0].url) || null,
          source: 'NASA EONET', image: null, count: 2,
          place: (ev.categories && ev.categories[0] && ev.categories[0].title) || '',
          time: g.date ? Date.parse(g.date) : Date.now(),
        });
      }
      return out;
    },

    // Wikipedia "In the news" — today's top world stories, CORS-open
    async fetchWiki() {
      const d = new Date();
      const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
      const j = await this.fetchJson(url);
      const out = [];
      const div = document.createElement('div');
      for (const st of (j.news || [])) {
        div.innerHTML = st.story || '';
        const title = div.textContent.replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const loc = this.locate(title, '');
        if (!loc) continue;
        const link = st.links && st.links[0];
        const cat = this.classify(title);
        out.push({
          type: 'news', cat, color: this.catColor(cat),
          lat: loc.lat, lon: loc.lon, title: title.length > 160 ? title.slice(0, 157) + '…' : title,
          url: link && link.content_urls ? link.content_urls.desktop.page : null,
          source: 'WIKIPEDIA ITN', image: link && link.thumbnail ? link.thumbnail.source : null,
          count: 3, place: '', time: Date.now(),
        });
      }
      return out;
    },

    // Hacker News front page — tech wire, CORS-open
    async fetchHN() {
      const j = await this.fetchJson('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25');
      const out = [];
      for (const h of (j.hits || [])) {
        if (!h.title) continue;
        const loc = this.locate(h.title, '') || { lat: 37.77 + (Math.random() - 0.5) * 3, lon: -122.42 + (Math.random() - 0.5) * 3 };
        out.push({
          type: 'news', cat: 'tech', color: this.catColor('tech'),
          lat: loc.lat, lon: loc.lon, title: h.title,
          url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
          source: 'HN FRONT PAGE', image: null, count: 1 + Math.min(3, (h.points || 0) / 200),
          place: '', time: h.created_at ? Date.parse(h.created_at) : Date.now(),
        });
      }
      return out;
    },

    async refresh() {
      if (this._refreshing) return;
      this._refreshing = true;
      let collected = [], liveSources = 0;

      // 1) reliable CORS-open live sources — populate the globe fast
      const alt = await Promise.allSettled([this.fetchEonet(), this.fetchWiki(), this.fetchHN()]);
      alt.forEach(r => { if (r.status === 'fulfilled' && r.value.length) { liveSources++; collected = collected.concat(r.value); } });
      if (collected.length) {
        this.items = this.dedupe(collected).slice(0, 180);
        this.demo = false;
        setStatus('gdelt', 'ok');
        this.rebuild();
      }

      // 2) GDELT enrichment — richest source (65 languages) but often
      //    CORS/rate-limited; fetched sequentially to respect their limits
      let gdeltOk = 0;
      for (let i = 0; i < C.CATEGORIES.length; i++) {
        try {
          const batch = await this.fetchCategory(C.CATEGORIES[i]);
          collected = collected.concat(batch);
          gdeltOk++;
          this.items = this.dedupe(collected).slice(0, 200);
          this.demo = false;
          setStatus('gdelt', 'ok');
          this.rebuild();
        } catch (e) {
          if (i === 0) break; // blocked — don't burn the remaining attempts
        }
        if (i < C.CATEGORIES.length - 1) await new Promise(res => setTimeout(res, 2600));
      }

      // 3) nothing live at all -> clearly-flagged demo dataset
      if (!liveSources && !gdeltOk) {
        const cats = Object.fromEntries(C.CATEGORIES.map(c => [c.key, c]));
        this.items = LE.DEMO.news.map((d, i) => ({
          type: 'news', cat: d.cat, color: cats[d.cat].color,
          lat: d.lat, lon: d.lon, title: d.title, url: null,
          source: 'DEMO WIRE', image: null, count: 3 + (i % 5), place: d.place,
          time: Date.now() - (i + 1) * 7 * 60000,
        }));
        this.demo = true;
        setStatus('gdelt', 'demo');
        this.rebuild();
      }
      this._refreshing = false;
    },

    dedupe(items) {
      const seen = new Set();
      return items.filter(i => {
        const k = i.title.toLowerCase().slice(0, 60);
        if (seen.has(k) || !i.title) return false;
        seen.add(k); return true;
      }).sort((a, b) => b.time - a.time);
    },

    rebuild() {
      G().clearGroup('news');
      const all = this.items.concat(this.searchItems);
      for (const it of all) {
        if (it.cat !== 'search' && !this.catVisible[it.cat]) continue;
        G().addMarker(it, {
          group: 'news', color: it.color, kind: 'glow',
          size: 3.5 + Math.min(5, Math.log2(1 + it.count) * 1.6),
        });
      }
      if (LE.ui) { LE.ui.renderFeed(); LE.ui.renderTicker(); LE.ui.syncMap(); LE.ui.renderCounts(); }
    },

    setCatVisible(key, on) { this.catVisible[key] = on; this.rebuild(); },

    async search(q) {
      try {
        const cat = { key: 'search', color: '#ffffff', query: q };
        const res = await this.fetchCategory(cat);
        this.searchItems = res.slice(0, 40).map(i => ({ ...i, cat: 'search', color: '#ffffff' }));
        if (!this.on) await this.toggle(true);
        this.rebuild();
        return this.searchItems.length;
      } catch (e) { return -1; }
    },
    clearSearch() { this.searchItems = []; this.rebuild(); },
  };

  // ================= EARTHQUAKES (USGS — free, keyless) =================
  const quakes = {
    key: 'quakes', on: false, items: [], demo: false, _timer: null,
    async toggle(on) {
      this.on = on;
      G().setLayerVisible('quakes', on);
      if (on && !this.items.length) await this.refresh();
      if (on) this._timer = setInterval(() => this.refresh(), C.REFRESH.quakes);
      else if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (LE.ui) LE.ui.renderFeed();
    },
    async refresh() {
      try {
        const r = await fetch(C.URLS.quakes);
        const j = await r.json();
        this.items = j.features.map(f => ({
          type: 'quake', cat: 'quake', color: f.properties.mag >= 5.5 ? '#ff3b30' : '#ff9500',
          lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
          mag: f.properties.mag, title: 'M' + (f.properties.mag || 0).toFixed(1) + ' — ' + f.properties.place,
          place: f.properties.place, url: f.properties.url, source: 'USGS',
          time: f.properties.time,
        })).slice(0, 80);
        this.demo = false;
        setStatus('usgs', 'ok');
      } catch (e) {
        this.items = LE.DEMO.quakes.map((d, i) => ({
          type: 'quake', cat: 'quake', color: d.mag >= 5.5 ? '#ff3b30' : '#ff9500',
          lat: d.lat, lon: d.lon, mag: d.mag,
          title: 'M' + d.mag.toFixed(1) + ' — ' + d.place, place: d.place,
          url: null, source: 'DEMO', time: Date.now() - (i + 1) * 47 * 60000,
        }));
        this.demo = true;
        setStatus('usgs', 'demo');
      }
      this.rebuild();
    },
    rebuild() {
      G().clearGroup('quakes');
      const minMag = (LE.settings && LE.settings.quakeMinMag) || 0;
      for (const it of this.items) {
        if ((it.mag || 0) < minMag) continue;
        G().addMarker(it, { group: 'quakes', color: it.color, kind: 'ring', size: 2.5 + (it.mag || 4) * 1.1, alt: LE.globe.R * 1.008 });
        G().addMarker(it, { group: 'quakes', color: it.color, kind: 'glow', size: 2.2, alt: LE.globe.R * 1.008 });
      }
      if (LE.ui) { LE.ui.renderFeed(); LE.ui.syncMap(); LE.ui.renderCounts(); }
    },
  };

  // ================= SATELLITES (CelesTrak TLEs + satellite.js SGP4) =================
  const sats = {
    key: 'sats', on: false, demo: false, selected: null,
    sets: {},           // groupKey -> { sats: [...], on: bool }
    points: null, trail: null,

    async toggle(on) {
      this.on = on;
      G().setLayerVisible('sats', on);
      if (on) {
        for (const gc of C.SAT_GROUPS) if (gc.on && !this.sets[gc.key]) await this.loadGroup(gc.key);
        this.rebuildPoints();
      } else this.select(null);
      if (LE.ui) { LE.ui.renderFeed(); LE.ui.renderCounts(); }
    },

    async loadGroup(key) {
      const gc = C.SAT_GROUPS.find(g => g.key === key);
      if (!gc) return;
      try {
        const r = await fetch(`${C.URLS.celestrak}?GROUP=${gc.group}&FORMAT=tle`);
        if (!r.ok) throw new Error('celestrak http ' + r.status);
        const text = await r.text();
        if (text.length < 100 || text.indexOf('1 ') === -1) throw new Error('bad tle payload');
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const list = [];
        for (let i = 0; i + 2 < lines.length + 1 && list.length < gc.cap; i += 3) {
          const name = (lines[i] || '').trim(), l1 = lines[i + 1], l2 = lines[i + 2];
          if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
          const rec = satellite.twoline2satrec(l1, l2);
          list.push({ name, rec, color: gc.color, group: gc.key, synthetic: false });
        }
        if (!list.length) throw new Error('no sats parsed');
        this.sets[key] = { sats: list, on: true };
        this.demo = false;
        setStatus('celestrak', 'ok');
      } catch (e) {
        // synthetic fallback orbits (clearly flagged)
        this.sets[key] = {
          on: true,
          sats: LE.DEMO.syntheticSats.map(s => ({ name: s.name, syn: s, color: gc.color, group: gc.key, synthetic: true })),
        };
        this.demo = true;
        setStatus('celestrak', 'demo');
      }
    },

    async setGroup(key, on) {
      if (on && !this.sets[key]) await this.loadGroup(key);
      if (this.sets[key]) this.sets[key].on = on;
      this.rebuildPoints();
      if (LE.ui) { LE.ui.renderFeed(); LE.ui.renderCounts(); }
    },

    activeSats() {
      const out = [];
      for (const k in this.sets) if (this.sets[k].on) out.push(...this.sets[k].sats);
      return out;
    },

    // position of one sat at a JS date -> {lat, lon, altKm, velKms} or null
    satPos(s, date) {
      if (s.synthetic) {
        const mu = 398600.4418, Re = 6371;
        const a = Re + s.syn.alt;
        const T = 2 * Math.PI * Math.sqrt(a * a * a / mu); // s
        const t = date.getTime() / 1000;
        const rad = Math.PI / 180;
        const u = (s.syn.phase * rad) + (2 * Math.PI / T) * t;
        const inc = s.syn.inc * rad, raan = s.syn.raan * rad;
        // orbital plane -> ECI
        const xo = Math.cos(u), yo = Math.sin(u) * Math.cos(inc), zo = Math.sin(u) * Math.sin(inc);
        const xe = xo * Math.cos(raan) - yo * Math.sin(raan);
        const ye = xo * Math.sin(raan) + yo * Math.cos(raan);
        const gmst = ((280.46061837 + 360.98564736629 * ((date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000)) % 360) * rad;
        const lat = Math.asin(zo) / rad;
        let lon = (Math.atan2(ye, xe) - gmst) / rad;
        lon = ((lon % 360) + 540) % 360 - 180;
        return { lat, lon, altKm: s.syn.alt, velKms: Math.sqrt(mu / a) };
      }
      try {
        const pv = satellite.propagate(s.rec, date);
        if (!pv.position) return null;
        const gmst = satellite.gstime(date);
        const gd = satellite.eciToGeodetic(pv.position, gmst);
        const v = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
        return {
          lat: satellite.degreesLat(gd.latitude),
          lon: satellite.degreesLong(gd.longitude),
          altKm: gd.height, velKms: v,
        };
      } catch (e) { return null; }
    },

    rebuildPoints() {
      G().clearGroup('sats');
      const list = this.activeSats();
      if (!list.length) return;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(list.length * 3);
      const col = new Float32Array(list.length * 3);
      list.forEach((s, i) => {
        const c = new THREE.Color(s.color);
        col.set([c.r, c.g, c.b], i * 3);
      });
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: 7, sizeAttenuation: false, vertexColors: true, transparent: true,
        map: (function () { // reuse glow-style dot
          const c = document.createElement('canvas'); c.width = c.height = 32;
          const x = c.getContext('2d');
          const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
          g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g; x.fillRect(0, 0, 32, 32);
          return new THREE.CanvasTexture(c);
        })(),
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      G().groups.sats.add(this.points);
      this._list = list;
      this.tick(true);
    },

    // called every frame — propagate + update buffer
    tick(force) {
      if (!this.on || !this.points || !this._list) return;
      // throttle on wall clock; propagate at SIMULATED time (time-warp aware)
      const rt = performance.now();
      if (!force && rt - (this._lastProp || 0) < 250) return;
      this._lastProp = rt;
      const now = LE.simNow();
      const attr = this.points.geometry.attributes.position;
      this._list.forEach((s, i) => {
        const p = this.satPos(s, now);
        if (!p) { attr.array[i * 3 + 1] = 99999; s._last = null; return; } // hide broken
        const r = LE.globe.R * (1 + p.altKm / 6371);
        const v = LE.globe.latLonToVec3(p.lat, p.lon, r);
        attr.array[i * 3] = v.x; attr.array[i * 3 + 1] = v.y; attr.array[i * 3 + 2] = v.z;
        s._last = p; s._vec = v;
      });
      attr.needsUpdate = true;
      if (this.selected && LE.ui) LE.ui.updateSatCard(this.selected);
    },

    // nearest sat to a screen point (px)
    pickAt(x, y) {
      if (!this.on || !this._list) return null;
      let best = null, bestD = 14;
      for (const s of this._list) {
        if (!s._vec) continue;
        const sp = G().screenPos(s._vec);
        if (sp.behind) continue;
        if (!G().isFrontFacing(s._vec) && s._last && s._last.altKm < 1500) continue;
        const d = Math.hypot(sp.x - x, sp.y - y);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    },

    select(s) {
      this.selected = s;
      if (this.trail) { G().groups.sats.remove(this.trail); this.trail.geometry.dispose(); this.trail = null; }
      if (!s) { if (LE.ui) LE.ui.hideSatCard(); return; }
      // orbit trail: one full period sampled
      const mu = 398600.4418;
      const altKm = (s._last && s._last.altKm) || 500;
      const a = 6371 + altKm;
      const T = 2 * Math.PI * Math.sqrt(a * a * a / mu) * 1000; // ms
      const pts = [];
      const n = 128;
      for (let i = 0; i <= n; i++) {
        const d = new Date(LE.simNow().getTime() + (i / n - 0.15) * T);
        const p = this.satPos(s, d);
        if (!p) continue;
        pts.push(LE.globe.latLonToVec3(p.lat, p.lon, LE.globe.R * (1 + p.altKm / 6371)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.5 }));
      G().groups.sats.add(this.trail);
      if (LE.ui) LE.ui.showSatCard(s);
    },
  };

  // ================= FLIGHTS (OpenSky anonymous — rate limited) =================
  const flights = {
    key: 'flights', on: false, items: [], demo: false, _timer: null, points: null,
    async toggle(on) {
      this.on = on;
      G().setLayerVisible('flights', on);
      if (on && !this.items.length) await this.refresh();
      if (on) this._timer = setInterval(() => this.refresh(), C.REFRESH.flights);
      else if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (LE.ui) LE.ui.renderCounts();
    },
    async refresh() {
      try {
        const r = await fetch(C.URLS.opensky);
        if (!r.ok) throw new Error('opensky http ' + r.status);
        const j = await r.json();
        const states = (j.states || []).filter(s => s[5] != null && s[6] != null);
        const step = Math.max(1, Math.floor(states.length / C.FLIGHT_CAP));
        this.items = states.filter((_, i) => i % step === 0).slice(0, C.FLIGHT_CAP).map(s => ({
          type: 'flight', callsign: (s[1] || '').trim() || s[0], country: s[2],
          lat: s[6], lon: s[5], altM: s[7] || 0, velMs: s[9] || 0,
        }));
        this.demo = false;
        setStatus('opensky', 'ok');
      } catch (e) {
        // synthetic planes along great-circle demo routes
        this.items = [];
        const now = Date.now() / 1000;
        for (const rt of LE.DEMO.flightRoutes) {
          const A = LE.globe.latLonToVec3(rt.from[0], rt.from[1], 1);
          const B = LE.globe.latLonToVec3(rt.to[0], rt.to[1], 1);
          const ang = A.angleTo(B);
          for (let k = 0; k < 4; k++) {
            const t = ((now / (ang * 6371 / 0.24)) + k * 0.25) % 1; // ~860 km/h
            const sinA = Math.sin(ang);
            const v = A.clone().multiplyScalar(Math.sin((1 - t) * ang) / sinA)
              .add(B.clone().multiplyScalar(Math.sin(t * ang) / sinA));
            const ll = LE.globe.vec3ToLatLon(v);
            this.items.push({ type: 'flight', callsign: rt.tag + '-' + (k + 1), country: 'DEMO', lat: ll.lat, lon: ll.lon, altM: 10500, velMs: 240 });
          }
        }
        this.demo = true;
        setStatus('opensky', 'demo');
      }
      this.rebuild();
    },
    rebuild() {
      G().clearGroup('flights');
      if (!this.items.length) return;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(this.items.length * 3);
      this.items.forEach((f, i) => {
        const r = LE.globe.R * (1 + (f.altM / 1000) * C.FLIGHT_ALT_EXAGGERATION / 6371);
        const v = LE.globe.latLonToVec3(f.lat, f.lon, r);
        pos.set([v.x, v.y, v.z], i * 3);
        f._vec = v;
      });
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.points = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 4, sizeAttenuation: false, color: 0xffb300, transparent: true, opacity: 0.85, depthWrite: false,
      }));
      this.points.frustumCulled = false;
      G().groups.flights.add(this.points);
      if (LE.ui) { LE.ui.syncMap(); LE.ui.renderCounts(); }
    },
    pickAt(x, y) {
      if (!this.on) return null;
      let best = null, bestD = 12;
      for (const f of this.items) {
        if (!f._vec || !G().isFrontFacing(f._vec)) continue;
        const sp = G().screenPos(f._vec);
        if (sp.behind) continue;
        const d = Math.hypot(sp.x - x, sp.y - y);
        if (d < bestD) { bestD = d; best = f; }
      }
      return best;
    },
  };

  // ================= LIVE TV PINS =================
  const tv = {
    key: 'tv', on: false, items: [],
    // built-in channels + user-added ones (Settings -> TV CHANNELS)
    allChannels() {
      return C.CHANNELS.concat(((LE.settings && LE.settings.customChannels) || [])
        .map(c => Object.assign({ region: 'CUSTOM' }, c)));
    },
    toggle(on) {
      this.on = on;
      G().setLayerVisible('tv', on);
      if (on && !G().groups.tv.children.length) this.rebuild();
      if (LE.ui) LE.ui.renderCounts();
    },
    rebuild() {
      this.items = this.allChannels().filter(ch => ch.lat != null).map(ch => ({
        type: 'tv', cat: 'tv', color: '#ff2d55', lat: ch.lat, lon: ch.lon,
        title: ch.name, place: ch.country || '', channel: ch, source: 'LIVE TV',
      }));
      G().clearGroup('tv');
      for (const it of this.items) {
        G().addMarker(it, { group: 'tv', color: it.color, kind: 'glow', size: 5, alt: LE.globe.R * 1.02 });
      }
      if (LE.ui) LE.ui.syncMap();
    },
  };

  // ================= CITIES (selectable, zoom-aware labels) =================
  const cities = {
    key: 'cities', on: false, items: null, selected: null,
    _labels: new Map(), _lastLbl: 0, _hooked: false,

    ensureItems() {
      if (this.items) return;
      this.items = LE.CITIES.map(c => ({
        type: 'city', name: c[0], country: c[1], lat: c[2], lon: c[3],
        pop: c[4], wiki: c[5] || c[0], title: c[0],
      })).sort((a, b) => b.pop - a.pop);   // biggest first — label cap prefers them
    },

    toggle(on) {
      this.on = on;
      G().setLayerVisible('cities', on);
      if (on && !G().groups.cities.children.length) { this.ensureItems(); this.rebuild(); }
      const wrap = document.getElementById('city-labels');
      if (wrap) wrap.style.display = on ? 'block' : 'none';
      if (on && !this._hooked) {
        this._hooked = true;
        G().onFrame(now => this.updateLabels(now));
      }
      if (LE.ui) { LE.ui.renderCounts(); LE.ui.syncMap(); }
    },

    rebuild() {
      G().clearGroup('cities');
      for (const it of this.items) {
        G().addMarker(it, {
          group: 'cities', color: '#7fdcff', kind: 'glow',
          size: 1.5 + Math.min(2.4, it.pop * 0.09), alt: LE.globe.R * 1.006,
        });
      }
    },

    // labels fade in by zoom level: megacities first, everything when close
    updateLabels(now) {
      if (!this.on || (LE.ui && LE.ui.mapMode)) return;
      if (now - this._lastLbl < 130) return;
      this._lastLbl = now;
      const wrap = document.getElementById('city-labels');
      if (!wrap) return;
      const r = G().controls.radius;
      const minPop = r > 520 ? 12 : r > 380 ? 7 : r > 270 ? 3.5 : r > 190 ? 1.5 : 0;
      const cap = Math.round((r > 400 ? 14 : r > 280 ? 22 : r > 200 ? 30 : 44)
        * ((LE.settings && LE.settings.labelDensity) || 1));   // don't wallpaper the globe
      let shown = 0;
      const vs = G().viewSize();
      const W = vs.w, H = vs.h;
      for (const it of this.items) {
        let el = this._labels.get(it.name);
        const v = it._sprite ? it._sprite.position : null;
        let show = v && shown < cap && (it.pop >= minPop || this.selected === it) && G().isFrontFacing(v);
        let sp = null;
        if (show) {
          sp = G().screenPos(v);
          if (sp.behind || sp.x < 30 || sp.x > W - 30 || sp.y < 60 || sp.y > H - 90) show = false;
        }
        if (!show) { if (el) el.style.display = 'none'; continue; }
        if (!el) {
          el = document.createElement('div');
          el.className = 'city-label';
          el.textContent = it.name.toUpperCase();
          el.addEventListener('click', () => LE.ui.showCityIntel(it));
          wrap.appendChild(el);
          this._labels.set(it.name, el);
        }
        shown++;
        el.style.display = 'block';
        el.classList.toggle('sel', this.selected === it);
        el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -155%)`;
      }
    },

    // instant search match (used before hitting the geocoder)
    find(q) {
      this.ensureItems();
      q = q.toLowerCase().trim();
      if (!q) return null;
      return this.items.find(c => c.name.toLowerCase() === q)
        || this.items.find(c => c.name.toLowerCase().startsWith(q))
        || this.items.find(c => c.country.toLowerCase() === q && c.pop >= 3);
    },
  };

  // ================= AURORA OVAL (NOAA SWPC OVATION + planetary Kp) =================
  const aurora = {
    key: 'aurora', on: false, loaded: false, loading: false, kp: null,

    async toggle(on) {
      this.on = on;
      G().setLayerVisible('aurora', on);
      if (on && !this.loaded && !this.loading) await this.load();
      if (LE.ui) LE.ui.renderCounts();
    },

    async load() {
      this.loading = true;
      try {
        // planetary K-index (global geomagnetic activity, 0..9)
        try {
          const kpj = await news.fetchJson(C.URLS.kpIndex);
          const last = kpj[kpj.length - 1];
          this.kp = parseFloat(last.Kp !== undefined ? last.Kp : last[1]);
          if (LE.ui) LE.ui.renderKp(this.kp);
        } catch (e) { /* kp is cosmetic — continue */ }

        // OVATION aurora probability grid (~65k points, both hemispheres)
        const ov = await news.fetchJson(C.URLS.aurora);
        const pts = [];
        let maxProb = 1;
        for (const c of (ov.coordinates || [])) {
          const prob = c[2];
          if (prob > maxProb) maxProb = prob;
          // OVATION probabilities are small percentages — the oval band
          // typically peaks around 10-30%, so keep a low floor
          if (prob >= 4) pts.push([c[0] > 180 ? c[0] - 360 : c[0], c[1], prob]);
        }
        if (!pts.length) throw new Error('empty aurora grid');
        const pos = new Float32Array(pts.length * 3);
        const col = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
          const v = LE.globe.latLonToVec3(p[1], p[0], LE.globe.R * 1.028);
          pos.set([v.x, v.y, v.z], i * 3);
          const k = Math.min(1, p[2] / maxProb);   // normalize to today's peak
          // aurora green, brightening toward the oval core
          col.set([0.10 + 0.55 * k, 0.45 + 0.55 * k, 0.30 + 0.30 * k], i * 3);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
          size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true,
          opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const cloud = new THREE.Points(geo, mat);
        cloud.frustumCulled = false;
        G().groups.aurora.add(cloud);
        this.loaded = true;
        if (LE.ui) LE.ui.toast(
          `AURORA OVAL LIVE — ${pts.length.toLocaleString()} grid points · KP ${this.kp != null ? this.kp.toFixed(1) : '?'}` +
          (this.kp >= 5 ? ' <b>· GEOMAGNETIC STORM</b>' : ''), 'ok');
      } catch (e) {
        if (LE.ui) LE.ui.toast('Space weather uplink unreachable (NOAA SWPC)', 'warn');
      }
      this.loading = false;
    },
  };

  return { news, quakes, sats, flights, tv, cities, aurora, status };
})();
