/* ============================================================
   LIVE EARTH — GLOBE ENGINE (Three.js)
   Photoreal earth w/ real-time day-night terminator, city
   lights, clouds, atmosphere, starfield, country borders,
   inertial orbit camera, fly-to animations, marker sprites.
   ============================================================ */
window.LE = window.LE || {};

LE.globe = (function () {
  const R = 100;                       // earth radius in scene units (6371 km)
  const KM = R / 6371;                 // km -> scene units
  let scene, camera, renderer, canvas;
  let earth, earthMat, clouds, atmosphere, stars, bordersLine;
  let sunDir = new THREE.Vector3(1, 0, 0);
  const groups = {};                   // marker groups per layer
  const frameCbs = [];
  let texturesLoaded = 0, texturesFailed = 0;
  let onBootProgress = null;

  // ---------- coordinate helpers ----------
  function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  function vec3ToLatLon(v) {
    const r = v.length();
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, v.y / r))) * 180 / Math.PI;
    let lon = Math.atan2(v.z, -v.x) * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }

  // ---------- solar position (subsolar point from UTC) ----------
  function subsolar(date) {
    date = date || new Date();
    const rad = Math.PI / 180;
    const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000; // days since J2000
    const L = (280.460 + 0.9856474 * d) % 360;
    const g = ((357.528 + 0.9856003 * d) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = 23.439 * rad;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = ((280.46061837 + 360.98564736629 * d) % 360) * rad;
    let lon = (ra - gmst) * 180 / Math.PI;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec * 180 / Math.PI, lon };
  }
  let sunGlyph = null;
  function updateSun() {
    const s = subsolar(LE.simNow ? LE.simNow() : new Date());
    sunDir.copy(latLonToVec3(s.lat, s.lon, 1)).normalize();
    if (earthMat) earthMat.uniforms.sunDir.value.copy(sunDir);
    if (sunGlyph) sunGlyph.position.copy(sunDir).multiplyScalar(2600);
  }

  // ---------- shaders ----------
  const EARTH_VERT = `
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const EARTH_FRAG = `
    uniform sampler2D dayTex; uniform sampler2D nightTex; uniform sampler2D waterTex;
    uniform vec3 sunDir; uniform float nightBoost;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos;
    void main() {
      vec3 n = normalize(vNormal);
      float cosA = dot(n, sunDir);
      float dayF = smoothstep(-0.12, 0.3, cosA);
      vec3 day = texture2D(dayTex, vUv).rgb;
      vec3 night = texture2D(nightTex, vUv).rgb;
      vec3 nightCol = night * vec3(1.0, 0.85, 0.6) * nightBoost + day * 0.035;
      float diff = 0.25 + 0.95 * max(cosA, 0.0);
      vec3 col = mix(nightCol, day * diff, dayF);
      float water = texture2D(waterTex, vUv).r;
      vec3 viewDir = normalize(cameraPosition - vPos);
      vec3 ref = reflect(-sunDir, n);
      float spec = pow(max(dot(ref, viewDir), 0.0), 20.0) * water * dayF * 0.45;
      col += vec3(0.6, 0.8, 1.0) * spec;
      gl_FragColor = vec4(col, 1.0);
    }`;
  const ATMO_VERT = `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const ATMO_FRAG = `
    varying vec3 vNormal;
    void main() {
      float i = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
      gl_FragColor = vec4(0.25, 0.65, 1.0, 1.0) * i;
    }`;

  // ---------- canvas textures for markers ----------
  function makeGlowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function makeRingTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 4;
    x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke();
    return new THREE.CanvasTexture(c);
  }
  let glowTex, ringTex;

  // ---------- camera controls (custom, inertial) ----------
  const controls = {
    theta: 0.9, phi: 1.05, radius: 330, targetRadius: 330,
    velTheta: 0, velPhi: 0,
    lastInteraction: 0, autoRotate: true, dragging: false, suspendAuto: false,
    fly: null,
    pointers: new Map(), pinchDist: 0,

    attach(dom) {
      dom.addEventListener('pointerdown', e => {
        dom.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
          const p = [...this.pointers.values()];
          this.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        }
        this.dragging = true; this.fly = null;
        this.velTheta = 0; this.velPhi = 0;
        this.lastInteraction = performance.now();
      });
      dom.addEventListener('pointermove', e => {
        if (!this.pointers.has(e.pointerId)) return;
        const prev = this.pointers.get(e.pointerId);
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
          const p = [...this.pointers.values()];
          const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          if (this.pinchDist > 0) this.targetRadius = clampR(101 + (this.targetRadius - 101) * this.pinchDist / d);
          this.pinchDist = d;
        } else if (this.dragging) {
          // sensitivity scales with altitude — surgical control near the surface
          const speed = 0.0035 * Math.max(0.018, (this.radius - 101) / 330);
          this.velTheta = -dx * speed; this.velPhi = -dy * speed;
          this.theta += this.velTheta; this.phi += this.velPhi;
          this.clampPhi();
        }
        this.lastInteraction = performance.now();
      });
      const up = e => {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 0) this.dragging = false;
        this.lastInteraction = performance.now();
      };
      dom.addEventListener('pointerup', up);
      dom.addEventListener('pointercancel', up);
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        // exponential-over-altitude zoom: buttery from deep space to surface skim
        const alt = this.targetRadius - 101;
        this.targetRadius = clampR(101 + alt * (1 + e.deltaY * 0.0016));
        this.lastInteraction = performance.now();
      }, { passive: false });
      function clampR(r) { return Math.max(104, Math.min(1500, r)); }
    },

    clampPhi() { this.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.phi)); },

    flyTo(lat, lon, radius) {
      const v = latLonToVec3(lat, lon, 1);
      let toTheta = Math.atan2(v.x, v.z);
      const toPhi = Math.acos(Math.max(-1, Math.min(1, v.y)));
      // shortest arc
      const cur = ((this.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let d = toTheta - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.fly = {
        t0: performance.now(), dur: 1400,
        fromT: this.theta, fromP: this.phi, fromR: this.targetRadius,
        toT: this.theta + d, toP: toPhi, toR: radius || Math.min(this.targetRadius, 260),
      };
    },

    update(dt) {
      const now = performance.now();
      if (this.fly) {
        const k = Math.min(1, (now - this.fly.t0) / this.fly.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.theta = this.fly.fromT + (this.fly.toT - this.fly.fromT) * e;
        this.phi = this.fly.fromP + (this.fly.toP - this.fly.fromP) * e;
        this.targetRadius = this.fly.fromR + (this.fly.toR - this.fly.fromR) * e;
        if (k >= 1) this.fly = null;
      } else if (!this.dragging) {
        this.theta += this.velTheta; this.phi += this.velPhi; this.clampPhi();
        this.velTheta *= 0.94; this.velPhi *= 0.94;
        if (this.autoRotate && !this.suspendAuto && now - this.lastInteraction > 3000) {
          this.theta += 0.00005 * dt * ((LE.settings && LE.settings.rotateSpeed) != null ? LE.settings.rotateSpeed : 1);
        }
      }
      this.radius += (this.targetRadius - this.radius) * 0.12;
      camera.position.setFromSphericalCoords(this.radius, this.phi, this.theta);
      camera.lookAt(0, 0, 0);
    },
  };

  // ---------- init ----------
  function init(opts) {
    opts = opts || {};
    onBootProgress = opts.onProgress || null;
    canvas = document.getElementById('globe-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, precision: 'highp' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 4));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020409);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 6000);

    glowTex = makeGlowTexture(); ringTex = makeRingTexture();

    // texture loading with progress + graceful fallback
    const manager = new THREE.LoadingManager();
    manager.onProgress = (u, n, t) => { if (onBootProgress) onBootProgress(n / t); };
    const loader = new THREE.TextureLoader(manager);
    loader.setCrossOrigin('anonymous');
    const U = LE.CONFIG.URLS;

    function tex(url, fallbackColor) {
      return loader.load(url,
        t => {
          t.encoding = THREE.sRGBEncoding;
          t.magFilter = THREE.LinearFilter;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.anisotropy = renderer.capabilities.maxAnisotropy;
          texturesLoaded++;
        },
        undefined,
        () => {
          texturesFailed++;
          if (LE.ui) LE.ui.toast('TEXTURE CDN UNREACHABLE — flat shading fallback', 'warn');
        });
    }
    const dayTex = tex(U.texDay), nightTex = tex(U.texNight), waterTex = tex(U.texWater);

    earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: dayTex }, nightTex: { value: nightTex }, waterTex: { value: waterTex },
        sunDir: { value: sunDir.clone() }, nightBoost: { value: 1.7 },
      },
      vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
    });
    earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 256), earthMat);
    scene.add(earth);

    // clouds
    const cloudTex = loader.load(U.texClouds, t => {
      t.encoding = THREE.sRGBEncoding;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = renderer.capabilities.maxAnisotropy;
    });
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.015, 128, 128),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false })
    );
    scene.add(clouds);

    // atmosphere glow
    atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.13, 128, 128),
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
      })
    );
    scene.add(atmosphere);

    // starfield
    (function makeStars() {
      const n = 2400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        // uniform random point on a sphere (r128 has no randomDirection)
        const z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        const v = new THREE.Vector3(s * Math.cos(t), s * Math.sin(t), z).multiplyScalar(2200 + Math.random() * 1400);
        pos.set([v.x, v.y, v.z], i * 3);
        const b = 0.4 + Math.random() * 0.6;
        // a few tinted stars for flavor
        const tint = Math.random();
        if (tint > 0.97) col.set([0.5 * b, 0.85 * b, b], i * 3);
        else if (tint > 0.94) col.set([b, 0.75 * b, 0.4 * b], i * 3);
        else col.set([b, b, b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
      scene.add(stars);
    })();

    // sun glyph — a warm glow billboard at the actual solar direction
    sunGlyph = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2c4, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sunGlyph.scale.set(260, 260, 1);
    scene.add(sunGlyph);

    // marker groups per layer
    ['news', 'quakes', 'tv', 'sats', 'flights', 'cities', 'aurora', 'extra'].forEach(k => {
      groups[k] = new THREE.Group(); groups[k].visible = false; scene.add(groups[k]);
    });
    groups.extra.visible = true;

    updateSun();
    setInterval(updateSun, 10000);
    controls.attach(canvas);

    // apply persisted settings + cinematic arrival from deep space
    if (LE.settings) {
      clouds.material.opacity = LE.settings.cloudOpacity;
      if (LE.settings.pixelRatio) renderer.setPixelRatio(LE.settings.pixelRatio);
    }
    controls.radius = 1350;

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ---------- country borders (lazy) ----------
  let bordersLoaded = false;
  async function loadBorders() {
    if (bordersLoaded) return;
    bordersLoaded = true;
    try {
      const res = await fetch(LE.CONFIG.URLS.borders);
      const gj = await res.json();
      const verts = [];
      function addRing(ring) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = latLonToVec3(ring[i][1], ring[i][0], R * 1.002);
          const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], R * 1.002);
          verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
      LE.countryCentroids = {};
      for (const f of gj.features) {
        const g = f.geometry;
        if (!g) continue;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        let cx = 0, cy = 0, cn = 0;
        for (const poly of polys) for (const ring of poly) {
          addRing(ring);
          for (const pt of ring) { cx += pt[0]; cy += pt[1]; cn++; }
        }
        const name = (f.properties && (f.properties.name || f.properties.NAME)) || f.id;
        if (name && cn) LE.countryCentroids[String(name).toLowerCase()] = { lat: cy / cn, lon: cx / cn };
      }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      bordersLine = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({
        color: 0x00e5ff, transparent: true, opacity: 0.16,
      }));
      scene.add(bordersLine);
    } catch (e) {
      bordersLoaded = false;
      if (LE.ui) LE.ui.toast('Borders dataset unreachable (non-fatal)', 'warn');
    }
  }
  function setBorders(on) {
    if (on) loadBorders();
    if (bordersLine) bordersLine.visible = on;
  }

  // ---------- markers ----------
  // kind: 'glow' | 'ring'; every sprite gets its own material so pulses can differ
  function addMarker(item, o) {
    const mat = new THREE.SpriteMaterial({
      map: o.kind === 'ring' ? ringTex : glowTex,
      color: new THREE.Color(o.color || '#00e5ff'),
      transparent: true, depthWrite: false, opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(mat);
    const pos = latLonToVec3(item.lat, item.lon, o.alt || R * 1.012);
    s.position.copy(pos);
    const base = o.size || 5;
    s.scale.set(base, base, 1);
    s.userData = { item, base, phase: Math.random() * Math.PI * 2, kind: o.kind || 'glow' };
    groups[o.group].add(s);
    item._sprite = s;
    return s;
  }
  function clearGroup(key) {
    const g = groups[key];
    while (g.children.length) {
      const c = g.children.pop();
      if (c.material) c.material.dispose();
      if (c.geometry && !c.isSprite) c.geometry.dispose(); // sprites share one quad
    }
  }
  function pulse(now) {
    if (LE.settings && LE.settings.pulse === false) return;
    for (const key of ['news', 'quakes', 'tv']) {
      const g = groups[key];
      if (!g.visible) continue;
      for (const s of g.children) {
        const u = s.userData;
        const boost = u.highlight ? 1.9 : 1;
        if (u.kind === 'ring') {
          const k = ((now * 0.001 + u.phase) % 1.6) / 1.6;
          s.scale.setScalar(u.base * (0.6 + k * 1.8) * boost);
          s.material.opacity = (1 - k) * 0.9;
        } else {
          s.scale.setScalar(u.base * (1 + 0.22 * Math.sin(now * 0.003 + u.phase)) * boost);
        }
      }
    }
  }

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const mouseV = new THREE.Vector2();
  function pickSprite(x, y) {
    mouseV.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouseV, camera);
    const candidates = [];
    for (const key of ['news', 'quakes', 'tv', 'cities']) {
      if (groups[key].visible) candidates.push(...groups[key].children);
    }
    const hits = raycaster.intersectObjects(candidates, false);
    for (const h of hits) {
      if (h.object.userData && h.object.userData.item && isFrontFacing(h.object.position)) return h.object.userData.item;
    }
    return null;
  }
  function pickEarth(x, y) {
    mouseV.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouseV, camera);
    const hits = raycaster.intersectObject(earth, false);
    return hits.length ? vec3ToLatLon(hits[0].point) : null;
  }

  // ---------- screen helpers ----------
  // innerWidth can be 0 in minimized/headless windows — fall back to canvas size
  function viewSize() {
    return {
      w: window.innerWidth || (renderer && renderer.domElement.width) || 1280,
      h: window.innerHeight || (renderer && renderer.domElement.height) || 800,
    };
  }
  function screenPos(v3) {
    const v = v3.clone().project(camera);
    const s = viewSize();
    return { x: (v.x * 0.5 + 0.5) * s.w, y: (-v.y * 0.5 + 0.5) * s.h, behind: v.z > 1 };
  }
  function isFrontFacing(v3) {
    return v3.clone().normalize().dot(camera.position.clone().normalize()) > 0.12;
  }

  // ---------- frame ----------
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(50, now - last); last = now;
    controls.update(dt);
    if (clouds.visible) clouds.rotation.y += 0.0000055 * dt;
    // inside the atmosphere shell the fresnel glow would wash the screen out
    atmosphere.visible = controls.radius > 121;
    pulse(now);
    for (const cb of frameCbs) cb(now, dt);
    renderer.render(scene, camera);
  }

  return {
    R, KM, init, frame, controls, groups, subsolar,
    latLonToVec3, vec3ToLatLon, addMarker, clearGroup,
    pickSprite, pickEarth, screenPos, isFrontFacing, viewSize,
    onFrame: cb => frameCbs.push(cb),
    get scene() { return scene; }, get camera() { return camera; },
    get sunDir() { return sunDir; },
    setLayerVisible: (key, on) => { if (groups[key]) groups[key].visible = on; },
    setClouds: on => { clouds.visible = on; },
    setNightLights: on => { earthMat.uniforms.nightBoost.value = on ? 1.7 : 0.12; },
    setCloudOpacity: v => { if (clouds) clouds.material.opacity = v; },
    setPixelRatio: v => { if (renderer) renderer.setPixelRatio(v || Math.min(window.devicePixelRatio, 4)); },
    updateSun,
    setBorders,
    flyTo: (lat, lon, r) => controls.flyTo(lat, lon, r),
  };
})();
