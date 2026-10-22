/* ============================================================
   LIVE EARTH — UI
   Panels, toggles, live feed, popups, floating TV players,
   news ticker, status bar, 2D map mode (Leaflet), search.
   ============================================================ */
window.LE = window.LE || {};

LE.ui = (function () {
  const C = LE.CONFIG;
  const $ = s => document.querySelector(s);
  let popupItem = null;        // item currently shown in the anchored popup
  let popupVec = null;         // THREE.Vector3 anchor
  let map = null, mapMode = false, mapLayers = {}, mapSatTimer = null, terminator = null;
  let hoverSprite = null;

  function timeAgo(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm ago';
    if (m < 60 * 48) return Math.round(m / 60) + 'h ago';
    return Math.round(m / 1440) + 'd ago';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------------- toasts ----------------
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = msg;
    $('#toast-wrap').appendChild(el);
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 7000);
    return el;
  }

  // ---------------- custom confirmation modal ----------------
  function showConfirm(title, message, onYes, onNo) {
    const modal = $('#confirm-modal');
    const titleEl = $('#confirm-title');
    const messageEl = $('#confirm-message');
    const yesBtn = $('#confirm-yes');
    const noBtn = $('#confirm-no');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Clear previous listeners
    const newYesBtn = yesBtn.cloneNode(true);
    const newNoBtn = noBtn.cloneNode(true);
    yesBtn.replaceWith(newYesBtn);
    noBtn.replaceWith(newNoBtn);
    
    newYesBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      if (onYes) onYes();
    });
    newNoBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      if (onNo) onNo();
    });
    
    modal.classList.remove('hidden');
  }

  // ---------------- layer toggles / left panel ----------------
  const TOGGLES = [
    { key: 'news',    label: 'NEWS EVENTS',   hot: 'N', data: true,  fn: on => LE.layers.news.toggle(on) },
    { key: 'quakes',  label: 'EARTHQUAKES',   hot: 'Q', data: true,  fn: on => LE.layers.quakes.toggle(on) },
    { key: 'sats',    label: 'SATELLITES',    hot: 'S', data: true,  fn: on => LE.layers.sats.toggle(on) },
    { key: 'tv',      label: 'LIVE TV PINS',  hot: 'T', data: true,  fn: on => LE.layers.tv.toggle(on) },
    { key: 'flights', label: 'AIR TRAFFIC',   hot: 'F', data: true,  fn: on => LE.layers.flights.toggle(on) },
    { key: 'cities',  label: 'CITIES',        hot: 'U', data: true,  fn: on => LE.layers.cities.toggle(on) },
    { key: 'aurora',  label: 'AURORA OVAL',   hot: 'A', data: true,  fn: on => LE.layers.aurora.toggle(on) },
    { key: 'radar',   label: 'RAIN RADAR 2D', hot: 'W', data: true,  fn: on => setRadar(on) },
    { key: 'clouds',  label: 'CLOUDS',        hot: 'C', data: false, on: true,  fn: on => LE.globe.setClouds(on) },
    { key: 'night',   label: 'NIGHT LIGHTS',  hot: 'L', data: false, on: true,  fn: on => LE.globe.setNightLights(on) },
    { key: 'borders', label: 'BORDERS',       hot: 'B', data: false, on: true,  fn: on => LE.globe.setBorders(on) },
    { key: 'rotate',  label: 'AUTO-ROTATE',   hot: 'R', data: false, on: true,  fn: on => { LE.globe.controls.autoRotate = on; } },
    { key: 'intel',   label: 'CLICK INTEL',   hot: 'I', data: false, on: true,  fn: on => { LE.ui.clickIntel = on; } },
  ];
  const state = {};

  function buildPanels() {
    // layers list
    const list = $('#layers-list');
    let html = '';
    for (const t of TOGGLES) {
      state[t.key] = !!t.on;
      html += `
        <label class="tg-row ${t.data ? 'tg-data' : 'tg-visual'}">
          <span class="tg-label">${t.label}<kbd>${t.hot}</kbd></span>
          <input type="checkbox" id="tg-${t.key}" ${t.on ? 'checked' : ''}>
          <span class="tg-switch"></span>
        </label>`;
    }
    list.innerHTML = html;
    for (const t of TOGGLES) {
      $('#tg-' + t.key).addEventListener('change', e => {
        state[t.key] = e.target.checked;
        t.fn(e.target.checked);
      });
    }
    LE.ui.clickIntel = true;

    // news category chips
    $('#cat-chips').innerHTML = C.CATEGORIES.map(c =>
      `<button class="chip cat-chip dim" data-cat="${c.key}" style="--c:${c.color}"><i></i>${c.label}</button>`
    ).join('');
    document.querySelectorAll('.cat-chip').forEach(b => {
      b.addEventListener('click', () => {
        const on = b.classList.toggle('dim') === false;
        LE.layers.news.setCatVisible(b.dataset.cat, on);
      });
    });

    // satellite group chips
    $('#sat-chips').innerHTML = C.SAT_GROUPS.map(g =>
      `<button class="chip sat-chip ${g.on ? '' : 'dim'}" data-sat="${g.key}" style="--c:${g.color}"><i></i>${g.label}</button>`
    ).join('');
    document.querySelectorAll('.sat-chip').forEach(b => {
      b.addEventListener('click', async () => {
        const on = b.classList.toggle('dim') === false;
        if (!state.sats) setToggle('sats', true);
        await LE.layers.sats.setGroup(b.dataset.sat, on);
      });
    });

    // quick actions
    $('#btn-iss').addEventListener('click', findISS);
    $('#btn-refresh').addEventListener('click', refreshAll);

    // TV dock (regions + custom channels)
    renderDock();

    // basemap chips
    $('#basemap-chips').innerHTML = Object.keys(C.BASEMAPS).map(k =>
      `<button class="chip bm-chip ${k === (LE.settings.basemap || 'dark') ? '' : 'dim'}" data-bm="${k}" style="--c:#7fdcff"><i></i>${C.BASEMAPS[k].label}</button>`
    ).join('');
    document.querySelectorAll('.bm-chip').forEach(b => {
      b.addEventListener('click', () => {
        LE.settings.basemap = b.dataset.bm;
        LE.saveSettings();
        applyBasemap();
        if (!mapMode) toast('Basemap set — press <b>M</b> for the 2D surface map', 'info');
      });
    });

    // settings + time warp
    $('#btn-settings').addEventListener('click', () => openSettings());
    const tw = $('#tw-range');
    const twApply = () => {
      const h = parseFloat(tw.value) || 0;
      LE.timeOffsetMs = h * 3600e3;
      $('#tw-read').textContent = (h > 0 ? '+' : '') + h.toFixed(1) + 'h';
      $('#sim-badge').classList.toggle('hidden', h === 0);
      $('#timewarp').classList.toggle('active', h !== 0);
      LE.globe.updateSun();
      tickClock();
      if (mapMode) updateTerminator();
    };
    tw.addEventListener('input', twApply);
    tw.addEventListener('change', () => {   // re-draw the selected sat's orbit at the new epoch
      const s = LE.layers.sats;
      if (s.selected) s.select(s.selected);
    });
    $('#tw-reset').addEventListener('click', () => { tw.value = 0; twApply(); });

    // panel collapse buttons
    document.querySelectorAll('[data-collapse]').forEach(b => {
      b.addEventListener('click', () => $(b.dataset.collapse).classList.toggle('collapsed'));
    });

    // search
    $('#btn-fly').addEventListener('click', () => doSearch('fly'));
    $('#btn-news-search').addEventListener('click', () => doSearch('news'));
    $('#search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch('fly'); });

    // 2D/3D + help + fullscreen
    $('#btn-mode').addEventListener('click', toggleMapMode);
    $('#btn-help').addEventListener('click', () => $('#help-modal').classList.toggle('hidden'));
    $('#help-close').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
    $('#btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    });
    $('#popup-close').addEventListener('click', hidePopup);
    $('#citycard-close').addEventListener('click', hideCityIntel);
    $('#citycard-news').addEventListener('click', () => {
      if (currentCity) { $('#search-input').value = currentCity.name; doSearch('news'); }
    });
    $('#satcard-close').addEventListener('click', () => LE.layers.sats.select(null));
    $('#satcard-fly').addEventListener('click', () => {
      const s = LE.layers.sats.selected;
      if (s && s._last) LE.globe.flyTo(s._last.lat, s._last.lon, Math.min(880, 100 * (1 + s._last.altKm / 6371) + 130));
    });

    // Albanian button
    $('#btn-albanian-go').addEventListener('click', () => {
      showConfirm('NAVIGATE', 'Want to go to Albanian page?', 
        () => window.open('albanian_news (1).html', '_blank')
      );
    });
  }

  function setToggle(key, on) {
    const cb = $('#tg-' + key);
    if (!cb || cb.checked === on) { if (cb) return; }
    if (cb) { cb.checked = on; cb.dispatchEvent(new Event('change')); }
  }

  async function findISS() {
    if (!state.sats) setToggle('sats', true);
    // wait briefly for the group to load
    let tries = 0;
    const iv = setInterval(() => {
      const list = LE.layers.sats._list || [];
      const iss = list.find(s => /ISS|ZARYA/i.test(s.name)) || list[0];
      if (iss && iss._last) {
        clearInterval(iv);
        LE.layers.sats.select(iss);
        LE.globe.flyTo(iss._last.lat, iss._last.lon, 300);
      } else if (++tries > 40) { clearInterval(iv); toast('No satellite data available', 'warn'); }
    }, 250);
  }

  function refreshAll() {
    if (state.news) LE.layers.news.refresh();
    if (state.quakes) LE.layers.quakes.refresh();
    if (state.flights) LE.layers.flights.refresh();
    toast('REFRESHING ACTIVE FEEDS…', 'info');
  }

  // ---------------- search ----------------
  async function doSearch(mode) {
    const q = $('#search-input').value.trim();
    if (!q) return;
    if (mode === 'news') {
      toast('SEARCHING GLOBAL NEWS: <b>' + esc(q) + '</b>');
      setToggle('news', true);
      const n = await LE.layers.news.search(q);
      if (n > 0) toast(n + ' geolocated matches plotted (white markers)', 'ok');
      else if (n === 0) toast('No geolocated matches in the last 24h', 'warn');
      else toast('News search unavailable right now', 'warn');
      return;
    }
    // instant hit: our own city database first (offline, zero latency)
    const city = LE.layers.cities.find(q);
    if (city) {
      if (!state.cities) setToggle('cities', true);
      showCityIntel(city);
      return;
    }
    // ANY place on Earth: geocode via Nominatim -> full live dossier
    // (same card cities get: local time, weather, AQI, Wikipedia brief)
    try {
      const r = await fetch(C.URLS.geocode + '?format=json&limit=1&q=' + encodeURIComponent(q));
      const j = await r.json();
      if (j && j[0]) {
        const parts = j[0].display_name.split(',').map(s => s.trim());
        // prefer the clean place name; drop administrative prefixes so the
        // Wikipedia lookup hits ("Bashkia Durrës" -> "Durrës")
        const nm = cleanPlaceName(j[0].name || parts[0]);
        showCityIntel({
          type: 'city', name: nm, country: parts[parts.length - 1] || '',
          lat: +j[0].lat, lon: +j[0].lon, pop: 0, wiki: nm,
        });
        return;
      }
    } catch (e) { /* fall through */ }
    const cc = LE.countryCentroids || {};
    const hit = Object.keys(cc).find(k => k.includes(q.toLowerCase()));
    if (hit) {
      showCityIntel({ type: 'city', name: hit.toUpperCase(), country: '', lat: cc[hit].lat, lon: cc[hit].lon, pop: 0, wiki: hit });
    } else toast('Location not found', 'warn');
  }

  function cleanPlaceName(n) {
    return String(n || '').replace(/^(bashkia|komuna|municipality of|city of|comune di|gemeinde|commune de|municipio de|gmina|obshtina|opština|distrito de)\s+/i, '').trim();
  }

  // reverse-geocode a raw click into a full dossier ("what IS this place?")
  async function fullIntelAt(lat, lon) {
    toast('IDENTIFYING SECTOR…', 'info');
    try {
      const r = await fetch(`${C.URLS.reverse}?format=json&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=10`);
      const j = await r.json();
      const a = j.address || {};
      const name = cleanPlaceName(a.city || a.town || a.village || a.municipality || a.county || a.state
        || (j.display_name || '').split(',')[0].trim());
      if (!name) throw 0;
      showCityIntel({ type: 'city', name, country: a.country || '', lat, lon, pop: 0, wiki: name });
    } catch (e) {
      toast('No settlement identified here — open ocean or wilderness', 'warn');
    }
  }
  function flyBoth(lat, lon, r) {
    if (mapMode && map) map.setView([lat, lon], 5);
    else LE.globe.flyTo(lat, lon, r);
  }

  // ---------------- live feed (right panel) ----------------
  function renderFeed() {
    const el = $('#feed');
    if (!el) return;
    let html = '';
    const news = LE.layers.news;
    if (news.on) {
      const items = news.searchItems.concat(news.items.filter(i => news.catVisible[i.cat])).slice(0, 60);
      html += `<div class="feed-head">NEWS EVENTS ${news.demo ? '<em class="demo-tag">DEMO</em>' : '<em class="live-tag">LIVE</em>'}</div>`;
      html += items.map((it, i) => `
        <div class="feed-item" data-layer="news" data-i="${i}">
          <i class="dot" style="background:${it.color}"></i>
          <div class="fi-body">
            <div class="fi-title">${esc(it.title)}</div>
            <div class="fi-meta">${esc(it.source)}${it.place ? ' · ' + esc(it.place) : ''} · ${timeAgo(it.time)}</div>
          </div>
        </div>`).join('');
      news._feedItems = items;
    }
    const qk = LE.layers.quakes;
    if (qk.on) {
      const qItems = qk.items.filter(i => (i.mag || 0) >= ((LE.settings && LE.settings.quakeMinMag) || 0)).slice(0, 25);
      qk._feedItems = qItems;
      html += `<div class="feed-head">SEISMIC · 24H ${qk.demo ? '<em class="demo-tag">DEMO</em>' : '<em class="live-tag">LIVE</em>'}</div>`;
      html += qItems.map((it, i) => `
        <div class="feed-item" data-layer="quakes" data-i="${i}">
          <i class="dot" style="background:${it.color}"></i>
          <div class="fi-body">
            <div class="fi-title">${esc(it.title)}</div>
            <div class="fi-meta">USGS · ${timeAgo(it.time)}</div>
          </div>
        </div>`).join('');
    }
    const st = LE.layers.sats;
    if (st.on && st._list && st._list.length) {
      html += `<div class="feed-head">TRACKED OBJECTS ${st.demo ? '<em class="demo-tag">DEMO</em>' : '<em class="live-tag">LIVE</em>'}</div>`;
      html += st._list.slice(0, 30).map((s, i) => `
        <div class="feed-item" data-layer="sats" data-i="${i}">
          <i class="dot" style="background:${s.color}"></i>
          <div class="fi-body"><div class="fi-title">${esc(s.name)}</div>
          <div class="fi-meta">${s._last ? s._last.altKm.toFixed(0) + ' km · ' + s._last.velKms.toFixed(1) + ' km/s' : '—'}</div></div>
        </div>`).join('');
    }
    if (!html) html = '<div class="feed-empty">ALL LAYERS COLD.<br>Enable a data layer to populate the feed.</div>';
    el.innerHTML = html;

    el.querySelectorAll('.feed-item').forEach(fi => {
      const layer = fi.dataset.layer, i = +fi.dataset.i;
      const item = layer === 'news' ? LE.layers.news._feedItems[i]
        : layer === 'quakes' ? LE.layers.quakes._feedItems[i]
        : LE.layers.sats._list[i];
      if (!item) return;
      fi.addEventListener('mouseenter', () => highlight(item, true));
      fi.addEventListener('mouseleave', () => highlight(item, false));
      fi.addEventListener('click', () => {
        if (layer === 'sats') {
          LE.layers.sats.select(item);
          if (item._last) flyBoth(item._last.lat, item._last.lon, 300);
        } else {
          flyBoth(item.lat, item.lon, 230);
          if (!mapMode) showPopup(item);
        }
      });
    });
  }
  function highlight(item, on) {
    if (item._sprite) item._sprite.userData.highlight = on;
  }

  // ---------------- ticker ----------------
  function renderTicker() {
    const news = LE.layers.news;
    const el = $('#ticker');
    const feedSrc = news.searchItems.concat(news.items);
    if (!news.on || !feedSrc.length) {
      el.innerHTML = '<span class="tick-idle">/// LIVE EARTH — ORBITAL COMMAND /// enable NEWS layer for live wire ///</span>';
      el.style.animationDuration = '40s';
      return;
    }
    const top = feedSrc.slice(0, 30);
    const txt = top.map(i => `<b style="color:${i.color}">◈</b> ${esc(i.title)}`).join('<span class="tick-sep"> /// </span>');
    el.innerHTML = txt + '<span class="tick-sep"> /// </span>' + txt;
    el.style.animationDuration = Math.max(60, top.reduce((a, i) => a + i.title.length, 0) * 0.22) + 's';
  }

  // ---------------- anchored popup ----------------
  function showPopup(item) {
    popupItem = item;
    popupVec = item._sprite ? item._sprite.position.clone()
      : item._vec ? item._vec.clone()
      : LE.globe.latLonToVec3(item.lat, item.lon, LE.globe.R * 1.01);
    LE.globe.controls.suspendAuto = true;
    const p = $('#popup');
    let inner = '';
    if (item.type === 'news') {
      const cat = C.CATEGORIES.find(c => c.key === item.cat);
      inner = `
        <div class="pp-cat" style="--c:${item.color}">${cat ? cat.label : 'SEARCH'}</div>
        ${item.image ? `<img class="pp-img" src="${esc(item.image)}" onerror="this.remove()">` : ''}
        <div class="pp-title">${esc(item.title)}</div>
        <div class="pp-meta">${esc(item.source)}${item.place ? ' · ' + esc(item.place) : ''} · ${timeAgo(item.time)}</div>
        ${item.url ? `<a class="pp-link" href="${esc(item.url)}" target="_blank" rel="noopener">OPEN ARTICLE ↗</a>` : '<span class="pp-link dim">DEMO ITEM — NO SOURCE LINK</span>'}`;
    } else if (item.type === 'quake') {
      inner = `
        <div class="pp-cat" style="--c:${item.color}">SEISMIC EVENT</div>
        <div class="pp-title">M${(item.mag || 0).toFixed(1)} — ${esc(item.place)}</div>
        <div class="pp-meta">USGS · ${timeAgo(item.time)}</div>
        ${item.url ? `<a class="pp-link" href="${esc(item.url)}" target="_blank" rel="noopener">USGS DETAILS ↗</a>` : ''}`;
    } else if (item.type === 'tv') {
      inner = `
        <div class="pp-cat" style="--c:#ff2d55">LIVE CHANNEL</div>
        <div class="pp-title">${esc(item.title)}</div>
        <div class="pp-meta">${esc(item.place)}</div>
        <a class="pp-link" href="javascript:void 0" id="pp-open-stream">▶ OPEN STREAM</a>`;
    } else if (item.type === 'flight') {
      inner = `
        <div class="pp-cat" style="--c:#ffb300">AIRCRAFT</div>
        <div class="pp-title">${esc(item.callsign)}</div>
        <div class="pp-meta">${esc(item.country)} · FL${Math.round((item.altM || 0) / 30.48)} · ${Math.round((item.velMs || 0) * 3.6)} km/h</div>`;
    } else if (item.type === 'weather') {
      inner = `
        <div class="pp-cat" style="--c:#00e5ff">SURFACE INTEL</div>
        <div class="pp-title">${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°</div>
        <div class="pp-meta">${item.body}</div>
        <a class="pp-link" href="javascript:void 0" id="pp-full-intel">FULL DOSSIER ▸</a>`;
    }
    $('#popup-body').innerHTML = inner;
    if (item.type === 'tv') {
      const b = $('#pp-open-stream');
      if (b) b.addEventListener('click', () => { openPlayer(item.channel); hidePopup(); });
    }
    if (item.type === 'weather') {
      const b = $('#pp-full-intel');
      if (b) b.addEventListener('click', () => { hidePopup(); fullIntelAt(item.lat, item.lon); });
    }
    p.classList.remove('hidden');
    trackPopup();
  }
  function hidePopup() {
    popupItem = null; popupVec = null;
    $('#popup').classList.add('hidden');
    LE.globe.controls.suspendAuto = false;
  }
  function trackPopup() {
    if (!popupItem || !popupVec || mapMode) return;
    // live objects move — re-read their vector
    if (popupItem._vec) popupVec.copy(popupItem._vec);
    const p = $('#popup');
    const sp = LE.globe.screenPos(popupVec);
    const front = LE.globe.isFrontFacing(popupVec) || (popupItem.type === 'flight');
    p.classList.toggle('occluded', sp.behind || !front);
    const w = p.offsetWidth, h = p.offsetHeight;
    let x = sp.x + 18, y = sp.y - h / 2;
    if (x + w > window.innerWidth - 12) x = sp.x - w - 18;
    y = Math.max(60, Math.min(window.innerHeight - h - 90, y));
    p.style.left = x + 'px'; p.style.top = y + 'px';
  }

  // ---------------- weather "click intel" ----------------
  async function showWeather(lat, lon) {
    const item = { type: 'weather', lat, lon, body: 'QUERYING SURFACE CONDITIONS…' };
    showPopup(item);
    try {
      const r = await fetch(`${C.URLS.weather}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`);
      const j = await r.json();
      const c = j.current || {};
      item.body = `TEMP ${c.temperature_2m}°C · WIND ${c.wind_speed_10m} km/h · RH ${c.relative_humidity_2m}%`;
    } catch (e) { item.body = 'NO SURFACE DATA LINK'; }
    if (popupItem === item) showPopup(item);
  }

  // ---------------- CITY INTEL dossier ----------------
  let currentCity = null, cityClock = null;
  const WMO = {
    0: 'CLEAR', 1: 'MOSTLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST', 45: 'FOG', 48: 'RIME FOG',
    51: 'DRIZZLE', 53: 'DRIZZLE', 55: 'DRIZZLE', 61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
    66: 'FREEZING RAIN', 67: 'FREEZING RAIN', 71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW',
    77: 'SNOW GRAINS', 80: 'SHOWERS', 81: 'SHOWERS', 82: 'VIOLENT SHOWERS',
    85: 'SNOW SHOWERS', 86: 'SNOW SHOWERS', 95: 'THUNDERSTORM', 96: 'HAIL STORM', 99: 'HAIL STORM',
  };
  function aqiClass(a) { return a <= 50 ? 'aqi-good' : a <= 100 ? 'aqi-mod' : a <= 150 ? 'aqi-bad' : 'aqi-vbad'; }
  function aqiLabel(a) { return a <= 50 ? 'GOOD' : a <= 100 ? 'MODERATE' : a <= 150 ? 'UNHEALTHY*' : 'UNHEALTHY'; }

  async function showCityIntel(city) {
    LE.layers.sats.select(null);           // one dossier slot — sat card yields
    LE.layers.cities.selected = city;
    currentCity = city;
    flyBoth(city.lat, city.lon, 205);
    hidePopup();
    const card = $('#city-card');
    card.classList.remove('hidden');
    $('#citycard-name').textContent = city.name.toUpperCase();
    $('#citycard-sub').textContent =
      `${city.country.toUpperCase()} · ${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°` +
      (city.pop >= 0.05 ? ` · POP ${city.pop >= 10 ? city.pop.toFixed(0) : city.pop.toFixed(1)}M` : '');
    $('#citycard-data').innerHTML = '<span class="cc-wait">ACQUIRING SURFACE INTEL…</span>';
    $('#citycard-wiki').innerHTML = '';
    $('#citycard-wikilink').href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(city.wiki.replace(/ /g, '_'));
    if (cityClock) { clearInterval(cityClock); cityClock = null; }

    const wxUrl = `${C.URLS.weather}?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    const aqUrl = `${C.URLS.airQuality}?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm2_5`;
    const wikiUrl = C.URLS.wikiSummary + encodeURIComponent(city.wiki.replace(/ /g, '_'));
    const grab = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.json(); });
    const [wx, aq, wiki] = await Promise.allSettled([grab(wxUrl), grab(aqUrl), grab(wikiUrl)]);
    if (currentCity !== city) return;      // user moved on mid-fetch

    let html = '';
    if (wx.status === 'fulfilled') {
      const j = wx.value, c = j.current || {};
      const off = j.utc_offset_seconds || 0;
      const fmtLocal = () => {
        const d = new Date(Date.now() + off * 1000);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
      };
      const sun = (j.daily && j.daily.sunrise && j.daily.sunrise[0])
        ? `SUN ↑${j.daily.sunrise[0].slice(11, 16)} ↓${j.daily.sunset[0].slice(11, 16)}` : '';
      html += `<div class="cc-row">LOCAL <b id="city-time">${fmtLocal()}</b> <span class="cc-dim">UTC${off >= 0 ? '+' : ''}${(off / 3600).toFixed(off % 3600 ? 1 : 0)}</span></div>`;
      html += `<div class="cc-row">${WMO[c.weather_code] || 'WX'} <b>${c.temperature_2m}°C</b> · WIND <b>${c.wind_speed_10m}</b> km/h · RH <b>${c.relative_humidity_2m}%</b></div>`;
      if (sun) html += `<div class="cc-row">${sun}</div>`;
      cityClock = setInterval(() => {
        const el = document.getElementById('city-time');
        if (el) el.textContent = fmtLocal(); else { clearInterval(cityClock); cityClock = null; }
      }, 1000);
    } else html += '<div class="cc-row cc-dim">NO WEATHER LINK</div>';

    if (aq.status === 'fulfilled' && aq.value.current && aq.value.current.us_aqi != null) {
      const a = aq.value.current;
      html += `<div class="cc-row">AIR <b class="${aqiClass(a.us_aqi)}">AQI ${a.us_aqi} ${aqiLabel(a.us_aqi)}</b> <span class="cc-dim">PM2.5 ${a.pm2_5}</span></div>`;
    }
    $('#citycard-data').innerHTML = html;

    if (wiki.status === 'fulfilled' && wiki.value.extract) {
      const w = wiki.value;
      $('#citycard-wiki').innerHTML =
        (w.thumbnail ? `<img src="${esc(w.thumbnail.source)}" onerror="this.remove()">` : '') +
        `<p>${esc(w.extract.length > 260 ? w.extract.slice(0, 257) + '…' : w.extract)}</p>`;
      if (w.content_urls) $('#citycard-wikilink').href = w.content_urls.desktop.page;
    }
  }
  function hideCityIntel() {
    $('#city-card').classList.add('hidden');
    currentCity = null;
    LE.layers.cities.selected = null;
    if (cityClock) { clearInterval(cityClock); cityClock = null; }
  }

  // ---------------- satellite card ----------------
  function showSatCard(s) {
    hideCityIntel();                        // one dossier slot — city card yields
    $('#sat-card').classList.remove('hidden');
    $('#satcard-name').textContent = s.name;
    updateSatCard(s);
  }
  function updateSatCard(s) {
    if (!s._last) return;
    const mu = 398600.4418, a = 6371 + s._last.altKm;
    const T = 2 * Math.PI * Math.sqrt(a * a * a / mu) / 60;
    $('#satcard-data').innerHTML =
      `ALT <b>${s._last.altKm.toFixed(0)} km</b> · VEL <b>${s._last.velKms.toFixed(2)} km/s</b> · PERIOD <b>${T.toFixed(0)} min</b><br>` +
      `POS <b>${s._last.lat.toFixed(2)}°</b>, <b>${s._last.lon.toFixed(2)}°</b>${s.synthetic ? ' · <em class="demo-tag">DEMO ORBIT</em>' : ''}`;
  }
  function hideSatCard() { $('#sat-card').classList.add('hidden'); }

  // ---------------- TV players ----------------
  let playerZ = 500, playerCount = 0;
  function openPlayer(ch) {
    playerCount++;
    const el = document.createElement('div');
    el.className = 'player';
    el.style.left = (90 + (playerCount % 5) * 42) + 'px';
    el.style.top = (90 + (playerCount % 5) * 36) + 'px';
    el.style.zIndex = ++playerZ;
    el.innerHTML = `
      <div class="player-head">
        <span><i class="live-dot"></i>${esc(ch.name)}</span>
        <span class="player-btns">
          <a href="https://www.youtube.com/channel/${ch.id}/live" target="_blank" rel="noopener" title="Open on YouTube">↗</a>
          <button class="player-close" title="Close">✕</button>
        </span>
      </div>
      <div class="player-body">
        <iframe src="https://www.youtube.com/embed/live_stream?channel=${ch.id}&autoplay=1&mute=1"
          allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>`;
    $('#players').appendChild(el);
    el.addEventListener('pointerdown', () => { el.style.zIndex = ++playerZ; });
    el.querySelector('.player-close').addEventListener('click', () => el.remove());
    // drag by header
    const head = el.querySelector('.player-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.player-btns')) return;
      e.preventDefault();
      head.setPointerCapture(e.pointerId);
      const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop;
      const iframe = el.querySelector('iframe');
      iframe.style.pointerEvents = 'none';
      const mv = ev => {
        el.style.left = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - ox)) + 'px';
        el.style.top = Math.max(48, Math.min(window.innerHeight - 60, ev.clientY - oy)) + 'px';
      };
      const up = () => {
        head.removeEventListener('pointermove', mv);
        head.removeEventListener('pointerup', up);
        iframe.style.pointerEvents = '';
      };
      head.addEventListener('pointermove', mv);
      head.addEventListener('pointerup', up);
    });
    if (ch.lat != null) LE.globe.flyTo(ch.lat, ch.lon, 300);
    toast('TUNING <b>' + esc(ch.name) + '</b> — if the stream is offline, use ↗', 'info');
  }

  // ---------------- TV dock (regions, custom channels) ----------------
  let tvRegion = 'ALL';
  function renderDock() {
    const chans = LE.layers.tv.allChannels();
    const regions = C.TV_REGIONS.filter(r => r === 'ALL' || chans.some(c => (c.region || 'CUSTOM') === r));
    $('#tv-regions').innerHTML = regions.map(r =>
      `<button class="chip tv-region ${r === tvRegion ? '' : 'dim'}" data-r="${r}">${r}</button>`).join('');
    document.querySelectorAll('.tv-region').forEach(b =>
      b.addEventListener('click', () => { tvRegion = b.dataset.r; renderDock(); }));
    const vis = chans.filter(c => tvRegion === 'ALL' || (c.region || 'CUSTOM') === tvRegion);
    $('#tv-dock-list').innerHTML = vis.map((ch, i) =>
      `<button class="tv-chip" data-ch="${i}"><i class="live-dot"></i>${esc(ch.name)}</button>`).join('') +
      `<button class="tv-chip tv-add" id="tv-add" title="Add your own channel">+ ADD</button>`;
    document.querySelectorAll('#tv-dock-list .tv-chip[data-ch]').forEach(b =>
      b.addEventListener('click', () => openPlayer(vis[+b.dataset.ch])));
    $('#tv-add').addEventListener('click', () => openSettings('tv'));
  }

  // ---------------- SETTINGS ----------------
  let settingsBuilt = false;
  function openSettings(section) {
    if (!settingsBuilt) buildSettings();
    $('#settings-modal').classList.remove('hidden');
    renderCustomList();
    if (section === 'tv') {
      const el = $('#set-tv-section');
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }
  function buildSettings() {
    settingsBuilt = true;
    const S = LE.settings;
    const sel = (opts, cur) => opts.map(o => `<option value="${o.v}" ${+o.v === +cur ? 'selected' : ''}>${o.l}</option>`).join('');
    $('#settings-body').innerHTML = `
      <h3>GLOBE</h3>
      <div class="set-row"><span>AUTO-ROTATE SPEED</span><input type="range" id="set-rotate" min="0" max="3" step="0.1" value="${S.rotateSpeed}"><b id="set-rotate-v">${S.rotateSpeed}×</b></div>
      <div class="set-row"><span>CLOUD OPACITY</span><input type="range" id="set-cloud" min="0" max="1" step="0.05" value="${S.cloudOpacity}"><b id="set-cloud-v">${Math.round(S.cloudOpacity * 100)}%</b></div>
      <div class="set-row"><span>CITY LABEL DENSITY</span><select id="set-density">${sel([{ v: 0.5, l: 'SPARSE' }, { v: 1, l: 'NORMAL' }, { v: 2, l: 'DENSE' }], S.labelDensity)}</select></div>
      <div class="set-row"><span>MARKER PULSE FX</span><input type="checkbox" id="set-pulse" ${S.pulse ? 'checked' : ''}></div>
      <div class="set-row"><span>AUTO SURFACE MODE<small>zoom past low orbit → street map</small></span><input type="checkbox" id="set-autosurface" ${S.autoSurface ? 'checked' : ''}></div>
      <h3>PERFORMANCE</h3>
      <div class="set-row"><span>RENDER RESOLUTION</span><select id="set-pixel">${sel([{ v: 0, l: 'AUTO (HIGHEST)' }, { v: 1, l: 'LOW (1×)' }, { v: 1.5, l: 'MED (1.5×)' }, { v: 2, l: 'HIGH (2×)' }, { v: 3, l: 'ULTRA (3×)' }, { v: 4, l: 'EXTREME (4×)' }], S.pixelRatio)}</select></div>
      <h3>DATA</h3>
      <div class="set-row"><span>MIN QUAKE MAGNITUDE</span><input type="range" id="set-quakemag" min="0" max="5" step="0.5" value="${S.quakeMinMag}"><b id="set-quakemag-v">M${S.quakeMinMag.toFixed(1)}+</b></div>
      <div class="set-row"><span>NEWS REFRESH</span><select id="set-newsref">${sel([{ v: 5, l: '5 MIN' }, { v: 10, l: '10 MIN' }, { v: 20, l: '20 MIN' }, { v: 30, l: '30 MIN' }], S.newsRefreshMin)}</select></div>
      <h3 id="set-tv-section">TV CHANNELS — ADD YOUR OWN</h3>
      <p class="set-hint">Paste a YouTube <b>channel ID</b> (starts with UC…) or a full <b>youtube.com/channel/…</b> URL. Location is optional — it adds a pin on the globe.</p>
      <div class="set-ch-form">
        <input id="set-ch-name" placeholder="CHANNEL NAME">
        <input id="set-ch-id" placeholder="UC… id or channel URL">
        <input id="set-ch-loc" placeholder="HQ city (optional)">
        <button class="action-btn" id="set-ch-add">+ ADD CHANNEL</button>
      </div>
      <div id="set-tv-list"></div>
      <h3>RESET</h3>
      <button class="action-btn" id="set-reset">RESTORE DEFAULTS (KEEPS CUSTOM CHANNELS)</button>`;

    const save = () => LE.saveSettings();
    $('#set-rotate').addEventListener('input', e => {
      S.rotateSpeed = +e.target.value; $('#set-rotate-v').textContent = S.rotateSpeed + '×'; save();
    });
    $('#set-cloud').addEventListener('input', e => {
      S.cloudOpacity = +e.target.value; $('#set-cloud-v').textContent = Math.round(S.cloudOpacity * 100) + '%';
      LE.globe.setCloudOpacity(S.cloudOpacity); save();
    });
    $('#set-density').addEventListener('change', e => { S.labelDensity = +e.target.value; save(); });
    $('#set-pulse').addEventListener('change', e => {
      S.pulse = e.target.checked; save();
      if (!S.pulse) for (const k of ['news', 'quakes', 'tv']) for (const s of LE.globe.groups[k].children) {
        s.scale.setScalar(s.userData.base); s.material.opacity = 0.95;
      }
    });
    $('#set-autosurface').addEventListener('change', e => { S.autoSurface = e.target.checked; save(); });
    $('#set-pixel').addEventListener('change', e => { S.pixelRatio = +e.target.value; LE.globe.setPixelRatio(S.pixelRatio); save(); });
    $('#set-quakemag').addEventListener('input', e => {
      S.quakeMinMag = +e.target.value; $('#set-quakemag-v').textContent = 'M' + S.quakeMinMag.toFixed(1) + '+';
      save(); LE.layers.quakes.rebuild(); renderFeed();
    });
    $('#set-newsref').addEventListener('change', e => {
      S.newsRefreshMin = +e.target.value; save();
      const n = LE.layers.news;
      if (n._timer) { clearInterval(n._timer); n._timer = setInterval(() => n.refresh(), S.newsRefreshMin * 60e3); }
    });
    $('#set-ch-add').addEventListener('click', addCustomChannel);
    $('#set-reset').addEventListener('click', () => {
      const keep = S.customChannels;
      Object.assign(S, LE.DEFAULT_SETTINGS, { customChannels: keep });
      save(); settingsBuilt = false; buildSettings(); renderCustomList();
      LE.globe.setCloudOpacity(S.cloudOpacity); LE.globe.setPixelRatio(S.pixelRatio);
      LE.layers.quakes.rebuild(); renderFeed(); applyBasemap();
      toast('SETTINGS RESTORED', 'ok');
    });
    $('#settings-close').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  }
  function parseChannelId(input) {
    const m = /channel\/(UC[0-9A-Za-z_-]{16,})/.exec(input) || /^(UC[0-9A-Za-z_-]{16,})$/.exec(String(input).trim());
    return m ? m[1] : null;
  }
  async function addCustomChannel() {
    const name = $('#set-ch-name').value.trim();
    const id = parseChannelId($('#set-ch-id').value);
    const loc = $('#set-ch-loc').value.trim();
    if (!name || !id) { toast('Need a channel NAME + an ID starting with <b>UC…</b> (handles like @name won\'t work)', 'warn'); return; }
    const ch = { name: name.toUpperCase(), id };
    LE.settings.customChannels.push(ch);
    LE.saveSettings(); renderCustomList(); renderDock();
    $('#set-ch-name').value = ''; $('#set-ch-id').value = ''; $('#set-ch-loc').value = '';
    toast('CHANNEL ADDED — <b>' + esc(ch.name) + '</b>', 'ok');
    if (loc) {
      try {
        const r = await fetch(C.URLS.geocode + '?format=json&limit=1&q=' + encodeURIComponent(loc));
        const j = await r.json();
        if (j && j[0]) {
          ch.lat = +j[0].lat; ch.lon = +j[0].lon;
          ch.country = (j[0].display_name || '').split(',').pop().trim();
          LE.saveSettings(); renderCustomList();
          if (LE.layers.tv.on) LE.layers.tv.rebuild();
        }
      } catch (e) { /* pin is optional */ }
    }
  }
  function removeCustomChannel(i) {
    LE.settings.customChannels.splice(i, 1);
    LE.saveSettings(); renderCustomList(); renderDock();
    if (LE.layers.tv.on) LE.layers.tv.rebuild();
  }
  function renderCustomList() {
    const el = $('#set-tv-list');
    if (!el) return;
    const list = LE.settings.customChannels || [];
    el.innerHTML = list.length ? list.map((c, i) =>
      `<div class="set-ch-row"><span>${esc(c.name)}${c.lat != null ? ' · 📍' : ''}</span><button class="set-ch-del" data-i="${i}">✕</button></div>`).join('')
      : '<div class="set-hint">No custom channels yet — the dock is hungry.</div>';
    document.querySelectorAll('.set-ch-del').forEach(b =>
      b.addEventListener('click', () => removeCustomChannel(+b.dataset.i)));
  }

  // ---------------- live market strip (CoinGecko, keyless) ----------------
  async function pollMarket() {
    try {
      const r = await fetch(C.URLS.market);
      if (!r.ok) throw 0;
      const j = await r.json();
      const cell = (sym, d) => {
        if (!d || d.usd == null) return '';
        const ch = d.usd_24h_change || 0;
        return `${sym} $${Math.round(d.usd).toLocaleString('en-US')} <i class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%</i>`;
      };
      $('#market').innerHTML = [cell('BTC', j.bitcoin), cell('ETH', j.ethereum)].filter(Boolean).join('<span class="mkt-sep"> · </span>');
    } catch (e) { /* strip stays empty — cosmetic */ }
  }

  // ---------------- planetary K-index readout ----------------
  function renderKp(kp) {
    const el = $('#kp-val');
    if (!el || kp == null || isNaN(kp)) return;
    el.textContent = kp.toFixed(1);
    el.className = kp >= 5 ? 'kp-storm' : kp >= 4 ? 'kp-active' : 'kp-quiet';
    el.title = kp >= 5 ? 'Geomagnetic storm in progress' : kp >= 4 ? 'Active geomagnetic conditions' : 'Quiet geomagnetic conditions';
  }

  // ---------------- rain radar (RainViewer tiles, 2D map only) ----------------
  let radarLayer = null;
  function setRadar(on) {
    state.radar = on;
    if (on && !mapMode) toast('RAIN RADAR renders on the 2D map — press <b>M</b> to switch', 'info');
    applyRadar();
  }
  async function applyRadar() {
    if (radarLayer && map) { map.removeLayer(radarLayer); radarLayer = null; }
    if (!state.radar || !mapMode || !map) return;
    try {
      const r = await fetch(C.URLS.rainviewer);
      const j = await r.json();
      const frames = (j.radar && j.radar.past) || [];
      if (!frames.length) throw 0;
      const f = frames[frames.length - 1];
      if (!state.radar || !mapMode) return;   // toggled off while fetching
      radarLayer = L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0.7, maxZoom: 12 });
      radarLayer.addTo(map);
      toast('LIVE RAIN RADAR · frame ' + new Date(f.time * 1000).toISOString().slice(11, 16) + ' UTC', 'ok');
    } catch (e) { toast('Radar tiles unreachable (RainViewer)', 'warn'); }
  }

  // ---------------- status bar ----------------
  function renderStatus(st) {
    for (const k of ['gdelt', 'usgs', 'celestrak', 'opensky']) {
      const el = $('#src-' + k);
      if (el) el.className = 'src ' + st[k];
    }
    const anyDemo = Object.values(st).includes('demo');
    $('#demo-badge').classList.toggle('hidden', !anyDemo);
  }
  function renderCounts() {
    const g = LE.globe.groups;
    let n = 0;
    for (const k of ['news', 'quakes', 'tv', 'cities']) if (g[k].visible) n += g[k].children.length;
    if (g.sats.visible && LE.layers.sats._list) n += LE.layers.sats._list.length;
    if (g.flights.visible) n += LE.layers.flights.items.length;
    $('#count-markers').textContent = n;
  }
  function renderFps(f) { $('#fps').textContent = f; }

  // ---------------- clocks ----------------
  function tickClock() {
    const d = LE.simNow();   // shows warped time when the TIME slider is off zero
    const p = n => String(n).padStart(2, '0');
    $('#clock-utc').textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
    $('#clock-local').textContent = `${p(d.getHours())}:${p(d.getMinutes())} LOCAL`;
  }

  // ---------------- 2D map mode (Leaflet) ----------------
  function toggleMapMode() {
    mapMode = !mapMode;
    $('#map2d').style.display = mapMode ? 'block' : 'none';
    $('#globe-canvas').style.display = mapMode ? 'none' : 'block';
    $('#btn-mode').textContent = mapMode ? '3D GLOBE' : '2D MAP';
    hidePopup();
    if (mapMode) {
      if (!map) initMap();
      setTimeout(() => map.invalidateSize(), 60);
      syncMap(); updateTerminator(); applyRadar();
      mapSatTimer = setInterval(syncMapSats, 2000);
    } else {
      if (mapSatTimer) { clearInterval(mapSatTimer); mapSatTimer = null; }
      applyRadar();  // tears the radar tiles down while in 3D
    }
  }
  let baseLayer = null, labelOverlay = null;
  function initMap() {
    map = L.map('map2d', { worldCopyJump: true, zoomControl: true, attributionControl: true, maxZoom: 20 }).setView([22, 10], 3);
    applyBasemap();
    for (const k of ['news', 'quakes', 'tv', 'sats', 'flights', 'cities']) {
      mapLayers[k] = L.layerGroup().addTo(map);
    }
    map.on('zoomend', onMapZoomEnd);
    setInterval(updateTerminator, 60000);
  }
  // street-level zoom via free tile providers — pick in LAYERS -> BASEMAP
  function applyBasemap() {
    if (!map) return;
    const bm = C.BASEMAPS[LE.settings.basemap] || C.BASEMAPS.dark;
    if (baseLayer) map.removeLayer(baseLayer);
    if (labelOverlay) { map.removeLayer(labelOverlay); labelOverlay = null; }
    baseLayer = L.tileLayer(bm.url, { attribution: bm.attribution, maxZoom: 20, maxNativeZoom: bm.maxZoom });
    baseLayer.addTo(map);
    baseLayer.bringToBack();
    if (bm.labels) {
      labelOverlay = L.tileLayer(bm.labels, { maxZoom: 20, maxNativeZoom: 19 });
      labelOverlay.addTo(map);
    }
    document.querySelectorAll('.bm-chip').forEach(b => b.classList.toggle('dim', b.dataset.bm !== (LE.settings.basemap || 'dark')));
  }

  // ---------------- seamless space -> street zoom ----------------
  // zoom all the way into the 3D globe and it hands off to the 2D map
  // at the same spot; zoom the 2D map out and you're back in orbit
  let lastModeSwitch = 0;
  function autoSurfaceCheck() {
    if (!LE.settings.autoSurface || mapMode) return;
    const c = LE.globe.controls;
    if (c.targetRadius <= 106.5 && performance.now() - lastModeSwitch > 1800) {
      lastModeSwitch = performance.now();
      const vs = LE.globe.viewSize();
      const ll = LE.globe.pickEarth(vs.w / 2, vs.h / 2) || LE.globe.vec3ToLatLon(LE.globe.camera.position);
      c.targetRadius = 300; c.radius = 300;   // park the globe back in orbit
      toggleMapMode();
      map.setView([ll.lat, ll.lon], 7, { animate: false });
      toast('SURFACE MODE — zoom out to return to orbit, or press <b>M</b>', 'info');
    }
  }
  function onMapZoomEnd() {
    if (!LE.settings.autoSurface || !mapMode) return;
    if (map.getZoom() <= 3 && performance.now() - lastModeSwitch > 1800) {
      lastModeSwitch = performance.now();
      const cn = map.getCenter();
      toggleMapMode();
      LE.globe.flyTo(cn.lat, cn.lng, 320);
      toast('BACK IN ORBIT', 'info');
    }
  }
  function updateTerminator() {
    if (!map) return;
    if (terminator) { map.removeLayer(terminator); terminator = null; }
    const s = LE.globe.subsolar(LE.simNow());
    const rad = Math.PI / 180;
    const pts = [];
    const slat = Math.max(0.02, Math.abs(s.lat)) * Math.sign(s.lat || 1);
    for (let lon = -180; lon <= 180; lon += 3) {
      const lat = Math.atan(-Math.cos((lon - s.lon) * rad) / Math.tan(slat * rad)) / rad;
      pts.push([lat, lon]);
    }
    const pole = s.lat > 0 ? -90 : 90;
    pts.push([pole, 180], [pole, -180]);
    terminator = L.polygon(pts, { stroke: false, fillColor: '#000', fillOpacity: 0.42, interactive: false }).addTo(map);
  }
  function popHtml(it) {
    if (it.type === 'news') return `<b>${esc(it.title)}</b><br><small>${esc(it.source)} · ${esc(it.place || '')}</small>` +
      (it.url ? `<br><a href="${esc(it.url)}" target="_blank" rel="noopener">open article ↗</a>` : '');
    if (it.type === 'quake') return `<b>${esc(it.title)}</b>` + (it.url ? `<br><a href="${esc(it.url)}" target="_blank" rel="noopener">USGS ↗</a>` : '');
    if (it.type === 'tv') return `<b>${esc(it.title)}</b><br><small>${esc(it.place)}</small>`;
    return esc(it.title || '');
  }
  function syncMap() {
    if (!map || !mapMode) return;
    const L_ = LE.layers;
    mapLayers.news.clearLayers();
    if (L_.news.on) for (const it of L_.news.searchItems.concat(L_.news.items)) {
      if (it.cat !== 'search' && !L_.news.catVisible[it.cat]) continue;
      L.circleMarker([it.lat, it.lon], { radius: 4 + Math.min(4, it.count / 4), color: it.color, weight: 1, fillColor: it.color, fillOpacity: 0.6 })
        .bindPopup(popHtml(it)).addTo(mapLayers.news);
    }
    mapLayers.quakes.clearLayers();
    if (L_.quakes.on) for (const it of L_.quakes.items) {
      L.circleMarker([it.lat, it.lon], { radius: 3 + (it.mag || 4), color: it.color, weight: 1.5, fillOpacity: 0.15 })
        .bindPopup(popHtml(it)).addTo(mapLayers.quakes);
    }
    mapLayers.tv.clearLayers();
    if (L_.tv.on) for (const it of L_.tv.items) {
      const m = L.circleMarker([it.lat, it.lon], { radius: 6, color: '#ff2d55', weight: 2, fillColor: '#ff2d55', fillOpacity: 0.5 })
        .bindPopup(popHtml(it)).addTo(mapLayers.tv);
      m.on('popupopen', () => {
        // small delay so double-click doesn't instantly open
        setTimeout(() => {}, 0);
      });
      m.on('dblclick', () => openPlayer(it.channel));
    }
    mapLayers.flights.clearLayers();
    if (L_.flights.on) for (const it of L_.flights.items) {
      L.circleMarker([it.lat, it.lon], { radius: 2.5, color: '#ffb300', weight: 1, fillColor: '#ffb300', fillOpacity: 0.8 })
        .bindPopup(`<b>${esc(it.callsign)}</b><br><small>${esc(it.country)}</small>`).addTo(mapLayers.flights);
    }
    mapLayers.cities.clearLayers();
    if (L_.cities.on && L_.cities.items) for (const it of L_.cities.items) {
      const m = L.circleMarker([it.lat, it.lon], { radius: 3.5, color: '#7fdcff', weight: 1, fillColor: '#7fdcff', fillOpacity: 0.7 })
        .bindTooltip(it.name, { direction: 'top', offset: [0, -4] }).addTo(mapLayers.cities);
      m.on('click', () => showCityIntel(it));
    }
    syncMapSats();
  }
  function syncMapSats() {
    if (!map || !mapMode) return;
    mapLayers.sats.clearLayers();
    const st = LE.layers.sats;
    if (!st.on || !st._list) return;
    for (const s of st._list.slice(0, 200)) {
      if (!s._last) continue;
      L.circleMarker([s._last.lat, s._last.lon], { radius: 3, color: s.color, weight: 1, fillColor: s.color, fillOpacity: 0.9 })
        .bindPopup(`<b>${esc(s.name)}</b><br><small>${s._last.altKm.toFixed(0)} km</small>`).addTo(mapLayers.sats);
    }
  }

  // ---------------- boot overlay ----------------
  function bootLine(txt) {
    const el = document.createElement('div');
    el.className = 'boot-line';
    el.textContent = txt;
    $('#boot-lines').appendChild(el);
  }
  function bootProgress(f) {
    $('#boot-bar-fill').style.width = Math.round(f * 100) + '%';
  }
  function bootDone() {
    const b = $('#boot');
    if (!b || b.classList.contains('gone')) return;
    b.classList.add('gone');
    setTimeout(() => b.remove(), 900);
    const t = toast(
      'ALL DATA LAYERS COLD for a smooth start — flip them on in <b>LAYERS</b>. ' +
      '<button class="toast-btn" id="btn-golive">◉ ACTIVATE NEWS + TV</button>', 'info');
    const btn = t.querySelector('#btn-golive');
    if (btn) btn.addEventListener('click', () => { setToggle('news', true); setToggle('tv', true); });
  }

  // Initialize all layers to their default state after globe is ready
  function initializeLayers() {
    for (const t of TOGGLES) {
      t.fn(!!t.on);
    }
  }

  return {
    buildPanels, toast, setToggle, renderFeed, renderTicker, renderStatus, renderCounts,
    renderFps, tickClock, showPopup, hidePopup, trackPopup, showWeather,
    showSatCard, updateSatCard, hideSatCard, openPlayer, toggleMapMode, syncMap,
    showCityIntel, hideCityIntel, renderKp, pollMarket,
    openSettings, renderDock, applyBasemap, autoSurfaceCheck, fullIntelAt,
    bootLine, bootProgress, bootDone, initializeLayers,
    get mapMode() { return mapMode; },
    get map() { return map; },
    clickIntel: true, state,
  };
})();
