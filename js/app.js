/* ============================================================
   LIVE EARTH — APP ORCHESTRATION
   Boot sequence, render loop, input routing, hotkeys.
   ============================================================ */
(function () {
  const BOOT_LINES = [
    '> INITIALIZING RENDER CORE ............ OK',
    '> LOADING EARTH TEXTURE SET ...........',
    '> COMPUTING SOLAR EPHEMERIS ........... OK',
    '> LINKING DATA UPLINKS (GDELT/USGS) ... STANDBY',
    '> ORBITAL COMMAND READY — ALL LAYERS COLD',
  ];

  function boot() {
    if (!window.THREE) {
      document.getElementById('boot-lines').innerHTML =
        '<div class="boot-line" style="color:#ff3b30">RENDER CORE FAILED — three.js CDN unreachable.<br>Connect to the internet once so CDN libraries can load.</div>';
      return;
    }

    LE.ui.buildPanels();
    LE.globe.init({ onProgress: f => LE.ui.bootProgress(f * 0.9) });
    LE.ui.initializeLayers();

    // typewriter boot lines
    BOOT_LINES.forEach((l, i) => setTimeout(() => LE.ui.bootLine(l), 250 + i * 300));
    document.getElementById('boot').addEventListener('click', () => LE.ui.bootDone());
    setTimeout(() => { LE.ui.bootProgress(1); LE.ui.bootDone(); }, 2600);

    // ---------------- render loop ----------------
    let frames = 0, fpsT = performance.now(), lastStep = 0;
    function step() {
      if (LE.ui.mapMode) return;             // save GPU while in 2D mode
      lastStep = performance.now();
      LE.globe.frame();
      LE.layers.sats.tick();
      LE.ui.trackPopup();
      LE.ui.autoSurfaceCheck();
      frames++;
      if (lastStep - fpsT > 1000) { LE.ui.renderFps(frames); frames = 0; fpsT = lastStep; }
    }
    function loop() { requestAnimationFrame(loop); step(); }
    loop();
    // browsers pause requestAnimationFrame in hidden/background tabs —
    // this watchdog keeps orbits, clocks and markers moving at ~3fps there
    setInterval(() => { if (performance.now() - lastStep > 400) step(); }, 350);

    // ---------------- clocks ----------------
    LE.ui.tickClock();
    setInterval(LE.ui.tickClock, 1000);

    // ---------------- click routing on the globe ----------------
    const canvas = document.getElementById('globe-canvas');
    let downX = 0, downY = 0, downT = 0;
    canvas.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
    canvas.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || performance.now() - downT > 450) return;
      // priority: sprite markers > satellites > flights > bare earth (weather intel)
      const item = LE.globe.pickSprite(e.clientX, e.clientY);
      if (item) {
        if (item.type === 'city') LE.ui.showCityIntel(item);
        else LE.ui.showPopup(item);
        return;
      }
      const sat = LE.layers.sats.pickAt(e.clientX, e.clientY);
      if (sat) { LE.layers.sats.select(sat); return; }
      const fl = LE.layers.flights.pickAt(e.clientX, e.clientY);
      if (fl) { LE.ui.showPopup(fl); return; }
      const ll = LE.globe.pickEarth(e.clientX, e.clientY);
      if (ll) {
        if (LE.ui.clickIntel) LE.ui.showWeather(ll.lat, ll.lon);
        else LE.ui.hidePopup();
      } else LE.ui.hidePopup();
    });

    // hover cursor over markers
    let hoverT = 0;
    canvas.addEventListener('pointermove', e => {
      const now = performance.now();
      if (now - hoverT < 80) return;
      hoverT = now;
      canvas.style.cursor = LE.globe.pickSprite(e.clientX, e.clientY) ? 'pointer' : 'grab';
    });

    // ---------------- hotkeys ----------------
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toUpperCase();
      const hotmap = { N: 'news', Q: 'quakes', S: 'sats', T: 'tv', F: 'flights', U: 'cities', A: 'aurora', W: 'radar', C: 'clouds', L: 'night', B: 'borders', R: 'rotate', I: 'intel' };
      if (hotmap[k]) {
        const key = hotmap[k];
        LE.ui.setToggle(key, !document.getElementById('tg-' + key).checked);
      } else if (k === 'M') {
        LE.ui.toggleMapMode();
      } else if (k === '?' || (k === '/' && e.shiftKey)) {
        document.getElementById('help-modal').classList.toggle('hidden');
      } else if (k === 'ESCAPE') {
        LE.ui.hidePopup();
        LE.ui.hideCityIntel();
        document.getElementById('help-modal').classList.add('hidden');
        document.getElementById('settings-modal').classList.add('hidden');
      }
    });

    // live market strip (BTC/ETH — cosmetic, fails silently)
    LE.ui.pollMarket();
    setInterval(LE.ui.pollMarket, 120000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
