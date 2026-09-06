(() => {
  "use strict";

  // =====================================================================
  // Guard: Three.js must be present
  // =====================================================================
  if (!window.THREE) {
    const eo = document.getElementById("errorOverlay");
    const et = document.getElementById("errorText");
    if (et) et.textContent = "Could not load the 3D engine (vendor/three.min.js). Serve this folder over http(s) and reload.";
    if (eo) eo.classList.remove("hidden");
    document.getElementById("titleOverlay")?.classList.add("hidden");
    return;
  }
  const THREE = window.THREE;

  // =====================================================================
  // DOM
  // =====================================================================
  const canvas = document.getElementById("game");
  const raceHud = document.getElementById("raceHud");
  const lapNum = document.getElementById("lapNum");
  const posNum = document.getElementById("posNum");
  const posOrd = document.getElementById("posOrd");
  const totalTimeEl = document.getElementById("totalTime");
  const lapTimeEl = document.getElementById("lapTime");
  const bestLapEl = document.getElementById("bestLap");
  const speedNum = document.getElementById("speedNum");
  const boostFill = document.getElementById("boostFill");
  const standingsEl = document.getElementById("standings");
  const countdownEl = document.getElementById("countdown");
  const countdownText = document.getElementById("countdownText");

  const titleOverlay = document.getElementById("titleOverlay");
  const startBtn = document.getElementById("startBtn");
  const garageOverlay = document.getElementById("garageOverlay");
  const previewCanvas = document.getElementById("previewCanvas");
  const colorRow = document.getElementById("colorRow");
  const pointsLeftEl = document.getElementById("pointsLeft");
  const statEditor = document.getElementById("statEditor");
  const toTrackBtn = document.getElementById("toTrackBtn");
  const garageBackBtn = document.getElementById("garageBackBtn");
  const trackOverlay = document.getElementById("trackOverlay");
  const trackGrid = document.getElementById("trackGrid");
  const raceBtn = document.getElementById("raceBtn");
  const trackBackBtn = document.getElementById("trackBackBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");
  const menuFromPauseBtn = document.getElementById("menuFromPauseBtn");
  const resultsOverlay = document.getElementById("resultsOverlay");
  const resultsTitle = document.getElementById("resultsTitle");
  const resultPlace = document.getElementById("resultPlace");
  const newRecord = document.getElementById("newRecord");
  const resultTimes = document.getElementById("resultTimes");
  const rematchBtn = document.getElementById("rematchBtn");
  const changeCarBtn = document.getElementById("changeCarBtn");
  const menuFromResultsBtn = document.getElementById("menuFromResultsBtn");
  const touchControls = document.getElementById("touchControls");

  // =====================================================================
  // Audio (procedural, no external files)
  // =====================================================================
  const Audio_ = (() => {
    let ac = null, muted = false, engineOsc = null, engineGain = null, engineFilter = null;
    function ensure() {
      if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; ac = new AC(); }
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function tone(freq, dur, type, g, endFreq) {
      if (muted) return;
      const a = ensure();
      const o = a.createOscillator(), gn = a.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), a.currentTime + dur);
      gn.gain.setValueAtTime(g || 0.12, a.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(gn).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    function noise(dur, g, f0, f1) {
      if (muted) return;
      const a = ensure();
      const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(); s.buffer = buf;
      const fl = a.createBiquadFilter(); fl.type = "lowpass";
      fl.frequency.setValueAtTime(f0 || 1800, a.currentTime);
      fl.frequency.exponentialRampToValueAtTime(f1 || 120, a.currentTime + dur);
      const gn = a.createGain(); gn.gain.setValueAtTime(g || 0.3, a.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      s.connect(fl).connect(gn).connect(a.destination); s.start();
    }
    function startEngine() {
      if (muted) return;
      const a = ensure();
      if (engineOsc) return;
      engineOsc = a.createOscillator();
      engineOsc.type = "sawtooth";
      engineFilter = a.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 700;
      engineGain = a.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.frequency.value = 60;
      engineOsc.connect(engineFilter).connect(engineGain).connect(a.destination);
      engineOsc.start();
    }
    function setEngine(speedFrac) {
      if (!engineOsc || muted) return;
      const a = ensure();
      engineOsc.frequency.setTargetAtTime(55 + speedFrac * 240, a.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(500 + speedFrac * 2200, a.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.03 + speedFrac * 0.05, a.currentTime, 0.1);
    }
    function stopEngine() {
      if (engineOsc) {
        try { engineOsc.stop(); } catch (e) {}
        engineOsc = null; engineGain = null; engineFilter = null;
      }
    }
    return {
      unlock: ensure,
      setMuted: (v) => { muted = v; if (v) stopEngine(); },
      startEngine, setEngine, stopEngine,
      boost: () => tone(300, 0.4, "sawtooth", 0.12, 900),
      hit: () => noise(0.25, 0.4, 1400, 120),
      offroad: () => noise(0.12, 0.15, 900, 200),
      countBeep: (hi) => tone(hi ? 880 : 520, 0.16, "square", 0.14),
      lap: () => [660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.12), i * 100)),
      select: () => tone(600, 0.07, "square", 0.08, 820),
      finish: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.12), i * 120)),
    };
  })();

  // =====================================================================
  // Constants / config
  // =====================================================================
  const ROAD_HALF = 11;          // half road width (world units)
  const OFFROAD_LIMIT = ROAD_HALF + 3;
  const HOVER_Y = 1.6;
  const LAPS_TOTAL = 3;
  const CAR_COLORS = [0x35e6ff, 0xff6a2b, 0xff3d8b, 0x9d5bff, 0x7cff8a, 0xffd23f];
  const AI_COLORS = [0xff6a2b, 0xff3d8b, 0x9d5bff, 0x7cff8a, 0xffd23f];
  const STORE_LOADOUT = "neonDrive_loadout";
  const STORE_BEST = "neonDrive_best_";

  // Stat model: budget across 3 stats, each 1..8
  const STAT_MIN = 1, STAT_MAX = 8, STAT_BUDGET = 15;
  const DEFAULT_STATS = { speed: 5, accel: 5, handling: 5 };

  // =====================================================================
  // Tracks
  // =====================================================================
  function ringPoints(radius, n, elevAmp, elevFreq, wobble, seed) {
    const pts = [];
    let rng = seed;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radius * (1 + (wobble ? (rand() - 0.5) * wobble : 0));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.82;
      const y = Math.sin(a * elevFreq) * elevAmp;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }

  const TRACKS = [
    {
      id: "orbital",
      name: "Orbital Ring",
      desc: "Fast sweeping curves above a glowing blue world",
      accent: 0x35e6ff,
      edgeA: 0x35e6ff,
      edgeB: 0xff6a2b,
      fog: 0x081026,
      planet: 0x2b6cff,
      planetPos: new THREE.Vector3(-600, 240, -900),
      starColor: 0xbfe3ff,
      buildPoints: () => ringPoints(340, 14, 26, 2, 0.16, 12345),
      tension: 0.5,
    },
    {
      id: "canyon",
      name: "Neon Canyon",
      desc: "Tight technical turns through a magenta skyline",
      accent: 0xff3d8b,
      edgeA: 0xff3d8b,
      edgeB: 0xffd23f,
      fog: 0x1a0820,
      planet: 0xff3d8b,
      planetPos: new THREE.Vector3(560, 300, -800),
      starColor: 0xffd0ec,
      buildPoints: () => ringPoints(300, 20, 40, 3, 0.34, 6789),
      tension: 0.5,
    },
  ];

  // =====================================================================
  // Renderer / scene
  // =====================================================================
  let renderer, scene, camera, W = 0, H = 0;
  let curve, curveLength, roadMesh, trackGroup, env;
  let racers = [];
  let player = null;
  let currentTrack = TRACKS[0];

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.5, 8000);
    resize();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  // ---- Frenet-ish frame along the curve (world-up based) ----
  const _up = new THREE.Vector3(0, 1, 0);
  const _p = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _upo = new THREE.Vector3();

  function frameAt(u, outP, outRight, outUp, outFwd) {
    u = ((u % 1) + 1) % 1;
    curve.getPointAt(u, outP);
    curve.getTangentAt(u, outFwd).normalize();
    outRight.crossVectors(_up, outFwd).normalize();
    outUp.crossVectors(outFwd, outRight).normalize();
  }

  // =====================================================================
  // Build track
  // =====================================================================
  function buildTrack(track) {
    if (trackGroup) { scene.remove(trackGroup); disposeGroup(trackGroup); }
    if (env) { scene.remove(env); disposeGroup(env); }

    currentTrack = track;
    const pts = track.buildPoints();
    curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", track.tension);
    curveLength = curve.getLength();

    scene.fog = new THREE.Fog(track.fog, 260, 1500);
    scene.background = new THREE.Color(track.fog);

    trackGroup = new THREE.Group();

    const SEG = 700;
    const posArr = [], idxArr = [];
    const P = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      frameAt(u, P, R, U, F);
      const lx = P.x + R.x * ROAD_HALF, ly = P.y + R.y * ROAD_HALF, lz = P.z + R.z * ROAD_HALF;
      const rx = P.x - R.x * ROAD_HALF, ry = P.y - R.y * ROAD_HALF, rz = P.z - R.z * ROAD_HALF;
      posArr.push(lx, ly, lz, rx, ry, rz);
      if (i < SEG) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idxArr.push(a, b, c, b, d, c);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    roadGeo.setIndex(idxArr);
    roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0b1230, metalness: 0.55, roughness: 0.42,
      emissive: new THREE.Color(track.fog).multiplyScalar(0.4), side: THREE.DoubleSide,
    });
    roadMesh = new THREE.Mesh(roadGeo, roadMat);
    trackGroup.add(roadMesh);

    // Edge rails (neon)
    trackGroup.add(buildRail(0.86, track.edgeA, 0.9));
    trackGroup.add(buildRail(-0.86, track.edgeB, 0.9));
    // Center dashes
    trackGroup.add(buildCenterDashes(track.edgeA));
    // Ring gates
    trackGroup.add(buildRings(track));

    scene.add(trackGroup);

    // Environment
    env = buildEnvironment(track);
    scene.add(env);
  }

  function buildRail(side, color, raise) {
    const SEG = 700, w = 0.6;
    const pos = [], idx = [];
    const P = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      frameAt(u, P, R, U, F);
      const cx = P.x + R.x * ROAD_HALF * side;
      const cy = P.y + R.y * ROAD_HALF * side + (raise || 0.6);
      const cz = P.z + R.z * ROAD_HALF * side;
      pos.push(cx + R.x * w, cy, cz + R.z * w, cx - R.x * w, cy, cz - R.z * w);
      if (i < SEG) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, fog: true });
    return new THREE.Mesh(g, m);
  }

  function buildCenterDashes(color) {
    const group = new THREE.Group();
    const N = 90;
    const P = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
    const geo = new THREE.PlaneGeometry(1.1, 7);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, toneMapped: false });
    for (let i = 0; i < N; i++) {
      const u = i / N;
      frameAt(u, P, R, U, F);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(P.x, P.y + 0.15, P.z);
      const basis = new THREE.Matrix4().makeBasis(R, F, U);
      m.quaternion.setFromRotationMatrix(basis);
      group.add(m);
    }
    return group;
  }

  function buildRings(track) {
    const group = new THREE.Group();
    const N = 10;
    const P = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
    const torusGeo = new THREE.TorusGeometry(ROAD_HALF + 5, 0.9, 8, 40);
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      frameAt(u, P, R, U, F);
      const color = i % 2 === 0 ? track.edgeA : track.edgeB;
      const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      const ring = new THREE.Mesh(torusGeo, mat);
      ring.position.set(P.x, P.y + ROAD_HALF + 1, P.z);
      const basis = new THREE.Matrix4().makeBasis(R, U, F);
      ring.quaternion.setFromRotationMatrix(basis);
      // halo
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(ROAD_HALF + 5, 2.4, 8, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      );
      ring.add(halo);
      group.add(ring);
    }
    return group;
  }

  function buildEnvironment(track) {
    const g = new THREE.Group();

    // Lights
    g.add(new THREE.AmbientLight(0x2a3a66, 1.1));
    const hemi = new THREE.HemisphereLight(0x6ea8ff, 0x120820, 0.9);
    g.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.copy(track.planetPos).multiplyScalar(0.5);
    g.add(dir);

    // Planet
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(220, 40, 40),
      new THREE.MeshStandardMaterial({ color: track.planet, emissive: new THREE.Color(track.planet).multiplyScalar(0.5), emissiveIntensity: 1.1, roughness: 0.7, metalness: 0.1, fog: false })
    );
    planet.position.copy(track.planetPos);
    g.add(planet);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(255, 32, 32),
      new THREE.MeshBasicMaterial({ color: track.planet, transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    );
    planet.add(glow);

    // Stars
    const starN = 1400, sp = [];
    for (let i = 0; i < starN; i++) {
      const rr = 2600 + Math.random() * 1800;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      sp.push(rr * Math.sin(ph) * Math.cos(th), Math.abs(rr * Math.cos(ph)) * 0.6 + 60, rr * Math.sin(ph) * Math.sin(th));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: track.starColor, size: 6, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false }));
    g.add(stars);

    // Ground grid
    const grid = new THREE.GridHelper(4000, 80, track.accent, 0x14203f);
    grid.position.y = -60;
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    g.add(grid);

    return g;
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  // =====================================================================
  // Car mesh
  // =====================================================================
  function buildCar(colorHex) {
    const grp = new THREE.Group();
    const color = new THREE.Color(colorHex);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10131f, metalness: 0.8, roughness: 0.3 });
    const trimMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });

    // main body (tapered)
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 6.2), bodyMat);
    body.position.y = 0.9;
    grp.add(body);

    // nose wedge
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.scale.set(1, 0.5, 1);
    nose.position.set(0, 0.8, 4.0);
    grp.add(nose);

    // cockpit
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.6), emissive: color, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.2 }));
    cockpit.scale.set(1, 0.9, 1.6);
    cockpit.position.set(0, 1.35, 0.2);
    grp.add(cockpit);

    // side pods
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 4.2), bodyMat);
      pod.position.set(s * 2.05, 0.7, -0.3);
      grp.add(pod);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 1.6), trimMat);
      fin.position.set(s * 2.05, 1.5, -2.4);
      grp.add(fin);
    }

    // neon trim strips
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 5.4), trimMat);
      strip.position.set(s * 1.72, 0.9, 0);
      grp.add(strip);
    }

    // rear light bar (reads as neon from the chase cam)
    const rearBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.3), trimMat);
    rearBar.position.set(0, 1.05, -3.1);
    grp.add(rearBar);
    const rearHalo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    rearHalo.position.set(0, 1.05, -3.25);
    grp.add(rearHalo);
    // top spine light
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 3.2), trimMat);
    spine.position.set(0, 1.5, -0.5);
    grp.add(spine);
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.1;
    grp.add(underglow);

    // thruster
    const thruster = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    thruster.rotation.x = -Math.PI / 2;
    thruster.position.set(0, 0.9, -4.2);
    grp.add(thruster);
    grp.userData.thruster = thruster;
    grp.userData.underglow = underglow;

    return grp;
  }

  // =====================================================================
  // Racer state
  // =====================================================================
  function makeRacer(opts) {
    return {
      isPlayer: !!opts.isPlayer,
      name: opts.name,
      colorHex: opts.colorHex,
      mesh: buildCar(opts.colorHex),
      u: opts.u,               // param along curve [0,1)
      lap: 0,
      lateral: opts.lateral || 0,
      speed: 0,
      maxSpeed: opts.maxSpeed,
      accel: opts.accel,
      handling: opts.handling,
      finished: false,
      finishTime: 0,
      lapStart: 0,
      lapTimes: [],
      bestLap: Infinity,
      prevU: opts.u,
      // ai
      aiSkill: opts.aiSkill || 0,
      aiLine: opts.aiLine || 0,
      aiLineTimer: 0,
      bob: Math.random() * 10,
    };
  }

  // =====================================================================
  // Game state
  // =====================================================================
  const STATE = { TITLE: "title", GARAGE: "garage", TRACKSEL: "tracksel", COUNTDOWN: "countdown", RACING: "racing", PAUSED: "paused", RESULTS: "results" };
  let gameState = STATE.TITLE;
  let loadout = loadLoadout();
  let selectedTrackIdx = 0;
  let raceClock = 0;
  let countdownTimer = 0;
  let shakeAmt = 0;
  let boost = 1;             // 0..1
  let boosting = false;

  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false, boost: false };

  function loadLoadout() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_LOADOUT));
      if (s && s.stats && typeof s.color === "number") return s;
    } catch (e) {}
    return { stats: { ...DEFAULT_STATS }, color: CAR_COLORS[0] };
  }
  function saveLoadout() {
    try { localStorage.setItem(STORE_LOADOUT, JSON.stringify(loadout)); } catch (e) {}
  }
  function bestKey(trackId) { return STORE_BEST + trackId; }
  function getBest(trackId) {
    try {
      const v = JSON.parse(localStorage.getItem(bestKey(trackId)));
      if (v) return { bestLap: v.bestLap == null ? Infinity : v.bestLap, bestTotal: v.bestTotal == null ? Infinity : v.bestTotal };
    } catch (e) {}
    return { bestLap: Infinity, bestTotal: Infinity };
  }
  function setBest(trackId, rec) {
    try { localStorage.setItem(bestKey(trackId), JSON.stringify(rec)); } catch (e) {}
  }

  function statsToPerf(stats) {
    return {
      maxSpeed: 150 + stats.speed * 16,       // units/s
      accel: 42 + stats.accel * 12,
      handling: 0.9 + stats.handling * 0.14,
      grip: 0.5 + stats.handling * 0.06,
    };
  }

  // =====================================================================
  // Race setup
  // =====================================================================
  function setupRace() {
    // clear old racer meshes
    racers.forEach((r) => { if (r.mesh.parent) r.mesh.parent.remove(r.mesh); disposeGroup(r.mesh); });
    racers = [];

    const perf = statsToPerf(loadout.stats);
    // stagger starts slightly behind the finish line so lap 1 counts on first cross
    const startU = 0.002;
    const laneSpacing = 5.0;

    player = makeRacer({
      isPlayer: true, name: "YOU", colorHex: loadout.color,
      u: startU, lateral: -laneSpacing * 1.5,
      maxSpeed: perf.maxSpeed, accel: perf.accel, handling: perf.handling,
    });
    player.grip = perf.grip;
    racers.push(player);

    const aiColorPool = AI_COLORS.filter((c) => c !== loadout.color);
    const aiNames = ["VEX", "NOVA", "RAZE", "ECHO"];
    for (let i = 0; i < 3; i++) {
      const skill = 0.9 + i * 0.05 + Math.random() * 0.05;   // affects target speed
      const ai = makeRacer({
        isPlayer: false, name: aiNames[i], colorHex: aiColorPool[i % aiColorPool.length],
        u: startU - 0.0015 * (i + 1), lateral: laneSpacing * (i - 0.5),
        maxSpeed: (150 + 5.5 * 16) * skill, accel: 42 + 5 * 12, handling: 1.4,
        aiSkill: skill, aiLine: (Math.random() - 0.5) * ROAD_HALF * 0.8,
      });
      ai.grip = 0.8;
      racers.push(ai);
    }

    racers.forEach((r) => scene.add(r.mesh));
    positionAllCars(0);

    raceClock = 0;
    boost = 1;
    shakeAmt = 0;
    const best = getBest(currentTrack.id);
    bestLapEl.textContent = best.bestLap === Infinity ? "--:--" : fmtTime(best.bestLap);
  }

  const _cp = new THREE.Vector3(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cf = new THREE.Vector3();
  const _basis = new THREE.Matrix4();

  function positionCar(r, dt) {
    frameAt(r.u, _cp, _cr, _cu, _cf);
    const bob = Math.sin((performance.now() * 0.004) + r.bob) * 0.25;
    r.mesh.position.set(
      _cp.x + _cr.x * r.lateral,
      _cp.y + _cr.y * r.lateral + HOVER_Y + bob,
      _cp.z + _cr.z * r.lateral
    );
    _basis.makeBasis(_cr, _cu, _cf);
    const q = new THREE.Quaternion().setFromRotationMatrix(_basis);
    // slight steer lean
    const lean = THREE.MathUtils.clamp((r._steer || 0) * 0.4, -0.4, 0.4);
    const leanQ = new THREE.Quaternion().setFromAxisAngle(_cf, -lean);
    q.premultiply(leanQ);
    r.mesh.quaternion.copy(q);

    // thruster scale by speed
    const th = r.mesh.userData.thruster;
    const frac = r.speed / r.maxSpeed;
    if (th) { th.scale.set(0.6 + frac, 0.6 + frac, 0.6 + frac * 2.6); th.material.opacity = 0.4 + frac * 0.5; }
  }

  function positionAllCars(dt) { racers.forEach((r) => positionCar(r, dt)); }

  // =====================================================================
  // Curvature helper (signed turn in horizontal plane)
  // =====================================================================
  const _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3();
  function signedCurvature(u) {
    curve.getTangentAt(((u % 1) + 1) % 1, _t0).normalize();
    curve.getTangentAt(((u + 0.01) % 1 + 1) % 1, _t1).normalize();
    // cross product y-component of horizontal projection
    return _t0.x * _t1.z - _t0.z * _t1.x;
  }

  // =====================================================================
  // Update: player
  // =====================================================================
  function updatePlayer(r, dt) {
    const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touch.left;
    const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touch.right;
    const gas = keys.has("ArrowUp") || keys.has("w") || keys.has("W") || touch.gas;
    const brake = keys.has("ArrowDown") || keys.has("s") || keys.has("S") || touch.brake;
    boosting = (keys.has(" ") || touch.boost) && boost > 0.05;

    let targetMax = r.maxSpeed;
    if (boosting) { targetMax *= 1.28; boost = Math.max(0, boost - dt * 0.5); }
    else { boost = Math.min(1, boost + dt * 0.14); }

    if (gas) r.speed += r.accel * dt;
    else if (brake) r.speed -= r.accel * 1.6 * dt;
    else r.speed -= r.accel * 0.5 * dt;

    r.speed = THREE.MathUtils.clamp(r.speed, 0, targetMax);

    // steering
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    r._steer = steer;
    const steerRate = r.handling * 22 * (0.4 + 0.6 * (r.speed / r.maxSpeed));
    r.lateral += steer * steerRate * dt;

    applyCommonPhysics(r, dt);
  }

  function updateAI(r, dt) {
    const curv = signedCurvature(r.u);
    // slow down for sharp curves
    const curveSlow = 1 - Math.min(0.4, Math.abs(curv) * 5.5);
    let target = r.maxSpeed * curveSlow;

    // rubber-band relative to player
    const prog = r.lap + r.u;
    const pprog = player.lap + player.u;
    if (prog < pprog - 0.15) target *= 1.08;
    else if (prog > pprog + 0.15) target *= 0.95;

    if (r.speed < target) r.speed += r.accel * dt;
    else r.speed -= r.accel * 0.8 * dt;
    r.speed = THREE.MathUtils.clamp(r.speed, 0, r.maxSpeed * 1.1);

    // steer toward racing line, biased into the curve
    r.aiLineTimer -= dt;
    if (r.aiLineTimer <= 0) { r.aiLine = (Math.random() - 0.5) * ROAD_HALF * 1.2; r.aiLineTimer = 1.5 + Math.random() * 2; }
    const desiredLat = THREE.MathUtils.clamp(r.aiLine - curv * 140, -ROAD_HALF * 0.9, ROAD_HALF * 0.9);
    const diff = desiredLat - r.lateral;
    r._steer = THREE.MathUtils.clamp(diff * 0.1, -1, 1);
    r.lateral += THREE.MathUtils.clamp(diff, -r.handling * 18 * dt, r.handling * 18 * dt);

    applyCommonPhysics(r, dt);
  }

  function applyCommonPhysics(r, dt) {
    // centrifugal push on curves
    const curv = signedCurvature(r.u);
    r.lateral += curv * r.speed * dt * (2.2 - r.grip);

    // off-road penalty
    if (Math.abs(r.lateral) > ROAD_HALF) {
      r.speed = Math.min(r.speed, r.maxSpeed * 0.55);
      if (r.isPlayer) {
        shakeAmt = Math.min(0.7, shakeAmt + dt * 2);
        if (Math.random() < 0.1) Audio_.offroad();
      }
    }
    r.lateral = THREE.MathUtils.clamp(r.lateral, -OFFROAD_LIMIT, OFFROAD_LIMIT);

    // advance along curve
    const du = (r.speed * dt) / curveLength;
    r.prevU = r.u;
    r.u += du;
    if (r.u >= 1) {
      r.u -= 1;
      onLapComplete(r);
    }
  }

  function onLapComplete(r) {
    r.lap++;
    const lapT = raceClock - r.lapStart;
    r.lapStart = raceClock;
    if (r.lap >= 1) {
      r.lapTimes.push(lapT);
      if (lapT < r.bestLap) r.bestLap = lapT;
    }
    if (r.isPlayer) {
      Audio_.lap();
      const best = getBest(currentTrack.id);
      if (r.bestLap < best.bestLap) {
        best.bestLap = r.bestLap;
        setBest(currentTrack.id, best);
        bestLapEl.textContent = fmtTime(best.bestLap);
      }
    }
    if (r.lap >= LAPS_TOTAL && !r.finished) {
      r.finished = true;
      r.finishTime = raceClock;
      if (r.isPlayer) finishRace();
    }
  }

  function carCollisions() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i], b = racers[j];
        const du = Math.abs((a.lap + a.u) - (b.lap + b.u));
        if (du < 0.0016 && Math.abs(a.lateral - b.lateral) < 4) {
          const push = (a.lateral < b.lateral ? -1 : 1);
          a.lateral += push * 2.2; b.lateral -= push * 2.2;
          a.speed *= 0.92; b.speed *= 0.92;
          if ((a.isPlayer || b.isPlayer)) { shakeAmt = Math.min(1, shakeAmt + 0.4); Audio_.hit(); }
        }
      }
    }
  }

  // =====================================================================
  // Camera
  // =====================================================================
  const _camTarget = new THREE.Vector3(), _lookTarget = new THREE.Vector3();
  const _pp = new THREE.Vector3(), _pr = new THREE.Vector3(), _pu = new THREE.Vector3(), _pf = new THREE.Vector3();

  function updateCamera(dt, instant) {
    frameAt(player.u, _pp, _pr, _pu, _pf);
    const base = _pp.clone().add(_pr.clone().multiplyScalar(player.lateral * 0.6));
    _camTarget.copy(base)
      .add(_pf.clone().multiplyScalar(-32))
      .add(_pu.clone().multiplyScalar(15));
    _lookTarget.copy(base).add(_pf.clone().multiplyScalar(55)).add(_pu.clone().multiplyScalar(6));

    if (instant) camera.position.copy(_camTarget);
    else camera.position.lerp(_camTarget, Math.min(1, dt * 4.5));

    // shake
    if (shakeAmt > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt * 2.4;
      camera.position.y += (Math.random() - 0.5) * shakeAmt * 2.4;
      shakeAmt *= 0.9;
    } else shakeAmt = 0;

    camera.lookAt(_lookTarget);

    // FOV kick with speed
    const frac = player.speed / player.maxSpeed;
    const targetFov = 68 + frac * 16 + (boosting ? 6 : 0);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }

  // =====================================================================
  // Standings / HUD
  // =====================================================================
  function computeStandings() {
    const sorted = racers.slice().sort((a, b) => (b.lap + b.u) - (a.lap + a.u));
    return sorted;
  }

  function ordinal(n) { return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"; }

  function fmtTime(t) {
    if (!isFinite(t)) return "--:--";
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, "0")}`;
  }

  function updateHud() {
    const standings = computeStandings();
    const pos = standings.indexOf(player) + 1;
    lapNum.textContent = Math.min(LAPS_TOTAL, player.lap + 1);
    posNum.textContent = pos;
    posOrd.textContent = ordinal(pos);
    totalTimeEl.textContent = fmtTime(raceClock);
    lapTimeEl.textContent = fmtTime(raceClock - player.lapStart);
    speedNum.textContent = Math.round(player.speed * 1.15);
    boostFill.style.width = (boost * 100) + "%";

    // standings list
    let html = "";
    standings.forEach((r, i) => {
      const col = "#" + new THREE.Color(r.colorHex).getHexString();
      html += `<div class="standing-row ${r.isPlayer ? "you" : ""}"><span class="place">${i + 1}</span><span class="dot" style="color:${col};background:${col}"></span><span class="name">${r.name}</span></div>`;
    });
    standingsEl.innerHTML = html;
  }

  // =====================================================================
  // Flow
  // =====================================================================
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function updateTouchVisibility() {
    const inRace = gameState === STATE.RACING || gameState === STATE.PAUSED || gameState === STATE.COUNTDOWN;
    touchControls.classList.toggle("hidden", !inRace);
  }

  function goTitle() {
    gameState = STATE.TITLE;
    Audio_.stopEngine();
    hide(raceHud); hide(garageOverlay); hide(trackOverlay); hide(pauseOverlay); hide(resultsOverlay); hide(countdownEl);
    show(titleOverlay);
    updateTouchVisibility();
    resize();
  }

  function goGarage() {
    gameState = STATE.GARAGE;
    hide(titleOverlay); hide(trackOverlay); hide(resultsOverlay);
    show(garageOverlay);
    buildGarageUI();
    updateTouchVisibility();
    resize();
  }

  function goTrackSelect() {
    gameState = STATE.TRACKSEL;
    hide(garageOverlay);
    show(trackOverlay);
    buildTrackGrid();
    updateTouchVisibility();
    resize();
  }

  function startRace() {
    Audio_.unlock(); Audio_.startEngine();
    currentTrack = TRACKS[selectedTrackIdx];
    buildTrack(currentTrack);
    setupRace();
    hide(trackOverlay); hide(resultsOverlay); hide(pauseOverlay);
    show(raceHud);
    // countdown
    gameState = STATE.COUNTDOWN;
    updateTouchVisibility();
    resize();
    updateCamera(0, true);
    countdownTimer = 3.999;
    show(countdownEl);
    countdownText.textContent = "3";
    Audio_.countBeep(false);
  }

  function finishRace() {
    // fast-resolve remaining AI positions for final standings
    gameState = STATE.RESULTS;
    Audio_.stopEngine();
    Audio_.finish();
    const standings = computeStandings();
    const pos = standings.indexOf(player) + 1;
    resultPlace.textContent = pos + ordinal(pos);
    resultsTitle.textContent = pos === 1 ? "VICTORY" : "RACE COMPLETE";

    const best = getBest(currentTrack.id);
    let rec = false;
    if (raceClock < best.bestTotal) {
      best.bestTotal = raceClock;
      setBest(currentTrack.id, best);
      rec = true;
    }
    newRecord.classList.toggle("hidden", !rec);
    newRecord.textContent = "New Best Time!";

    let rows = `<div class="row"><span>Total</span><b>${fmtTime(raceClock)}</b></div>`;
    rows += `<div class="row"><span>Best Lap</span><b>${fmtTime(player.bestLap)}</b></div>`;
    player.lapTimes.forEach((t, i) => { rows += `<div class="row"><span>Lap ${i + 1}</span><b>${fmtTime(t)}</b></div>`; });
    rows += `<div class="row"><span>Finish</span><b>${pos}${ordinal(pos)} of 4</b></div>`;
    resultTimes.innerHTML = rows;

    show(resultsOverlay);
    updateTouchVisibility();
  }

  function togglePause() {
    if (gameState === STATE.RACING) {
      gameState = STATE.PAUSED;
      show(pauseOverlay);
      Audio_.setEngine(0);
    } else if (gameState === STATE.PAUSED) {
      gameState = STATE.RACING;
      hide(pauseOverlay);
    }
  }

  // =====================================================================
  // Garage UI
  // =====================================================================
  const STAT_META = [
    { key: "speed", name: "Top Speed", color: "#35e6ff" },
    { key: "accel", name: "Acceleration", color: "#ff6a2b" },
    { key: "handling", name: "Handling", color: "#ff3d8b" },
  ];

  function statsTotal() { return loadout.stats.speed + loadout.stats.accel + loadout.stats.handling; }

  function buildGarageUI() {
    // color swatches
    colorRow.innerHTML = "";
    CAR_COLORS.forEach((c) => {
      const sw = document.createElement("div");
      sw.className = "color-swatch" + (c === loadout.color ? " selected" : "");
      const hex = "#" + new THREE.Color(c).getHexString();
      sw.style.background = hex;
      sw.style.color = hex;
      sw.addEventListener("click", () => { loadout.color = c; saveLoadout(); buildGarageUI(); Audio_.select(); });
      colorRow.appendChild(sw);
    });

    // stat editor
    statEditor.innerHTML = "";
    STAT_META.forEach((meta) => {
      const block = document.createElement("div");
      block.className = "stat-block";
      const val = loadout.stats[meta.key];
      block.innerHTML = `
        <div class="stat-head">
          <span class="stat-name">${meta.name}</span>
          <span class="stat-controls">
            <button class="stat-btn minus" data-k="${meta.key}">−</button>
            <span style="min-width:14px;text-align:center;font-weight:800">${val}</span>
            <button class="stat-btn plus" data-k="${meta.key}">+</button>
          </span>
        </div>
        <div class="stat-bar"><div class="stat-fill" style="width:${(val / STAT_MAX) * 100}%;background:${meta.color};box-shadow:0 0 10px ${meta.color}"></div></div>`;
      statEditor.appendChild(block);
    });
    pointsLeftEl.textContent = STAT_BUDGET - statsTotal();
    // enable/disable
    statEditor.querySelectorAll(".plus").forEach((b) => { b.disabled = statsTotal() >= STAT_BUDGET || loadout.stats[b.dataset.k] >= STAT_MAX; });
    statEditor.querySelectorAll(".minus").forEach((b) => { b.disabled = loadout.stats[b.dataset.k] <= STAT_MIN; });
    statEditor.querySelectorAll(".stat-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (b.classList.contains("plus")) { if (statsTotal() < STAT_BUDGET && loadout.stats[k] < STAT_MAX) loadout.stats[k]++; }
        else { if (loadout.stats[k] > STAT_MIN) loadout.stats[k]--; }
        saveLoadout(); buildGarageUI(); Audio_.select();
      });
    });
    drawPreviewCar();
  }

  // 2D stylized preview of the car (canvas 2D, reflects chosen color)
  function drawPreviewCar() {
    const c = previewCanvas;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    const w = (c.width = Math.max(1, rect.width) * dpr);
    const h = (c.height = Math.max(1, rect.height) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = rect.width, ch = rect.height;
    ctx.clearRect(0, 0, cw, ch);
    const col = "#" + new THREE.Color(loadout.color).getHexString();

    ctx.save();
    ctx.translate(cw / 2, ch / 2 + 8);
    const s = Math.min(cw, ch) / 150;
    ctx.scale(s, s);

    // ground glow
    const gg = ctx.createRadialGradient(0, 30, 0, 0, 30, 90);
    gg.addColorStop(0, col + "55"); gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(-90, 0, 180, 60);

    // 3/4 hovercar silhouette
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    const body = ctx.createLinearGradient(0, -40, 0, 30);
    body.addColorStop(0, "#20263a"); body.addColorStop(1, "#0c0f1a");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-70, 6); ctx.quadraticCurveTo(-78, -14, -40, -20);
    ctx.quadraticCurveTo(-10, -40, 40, -30);
    ctx.quadraticCurveTo(80, -22, 74, 4);
    ctx.quadraticCurveTo(60, 20, 20, 20);
    ctx.lineTo(-50, 20); ctx.quadraticCurveTo(-66, 18, -70, 6);
    ctx.closePath(); ctx.fill();

    // cockpit
    ctx.shadowBlur = 16; ctx.fillStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(2, -20, 24, 12, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // neon trim line
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(-66, 8); ctx.quadraticCurveTo(-10, -6, 70, 2);
    ctx.stroke();

    // thruster
    ctx.shadowColor = "#fff2c0"; ctx.shadowBlur = 20;
    const tg = ctx.createLinearGradient(-70, 0, -110, 0);
    tg.addColorStop(0, "#fff2c0"); tg.addColorStop(1, "rgba(255,200,80,0)");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-68, -2); ctx.lineTo(-104, 4); ctx.lineTo(-68, 12); ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // =====================================================================
  // Track select grid (2D top-down spline preview)
  // =====================================================================
  function buildTrackGrid() {
    trackGrid.innerHTML = "";
    TRACKS.forEach((tk, idx) => {
      const card = document.createElement("div");
      card.className = "track-card" + (idx === selectedTrackIdx ? " selected" : "");
      const acc = "#" + new THREE.Color(tk.accent).getHexString();
      card.style.setProperty("--card-accent", acc);
      card.style.setProperty("--card-glow", acc + "66");
      const cv = document.createElement("canvas");
      const nm = document.createElement("div"); nm.className = "track-name"; nm.textContent = tk.name;
      const ds = document.createElement("div"); ds.className = "track-desc"; ds.textContent = tk.desc;
      card.appendChild(cv); card.appendChild(nm); card.appendChild(ds);
      card.addEventListener("click", () => { selectedTrackIdx = idx; buildTrackGrid(); Audio_.select(); });
      trackGrid.appendChild(card);
      drawTrackPreview(cv, tk);
    });
  }

  function drawTrackPreview(cv, tk) {
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    const cw = Math.max(160, rect.width || 260), chh = 120;
    cv.width = cw * dpr; cv.height = chh * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, chh);
    bg.addColorStop(0, "#" + new THREE.Color(tk.fog).getHexString());
    bg.addColorStop(1, "#05070f");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, chh);

    const pts = tk.buildPoints();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const pad = 18;
    const sx = (cw - pad * 2) / (maxX - minX), sz = (chh - pad * 2) / (maxZ - minZ);
    const sc = Math.min(sx, sz);
    const ox = cw / 2 - ((minX + maxX) / 2) * sc, oz = chh / 2 - ((minZ + maxZ) / 2) * sc;
    const acc = "#" + new THREE.Color(tk.accent).getHexString();

    ctx.shadowColor = acc; ctx.shadowBlur = 12;
    ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = ox + p.x * sc, y = oz + p.z * sc;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.stroke();

    // start dot
    ctx.shadowBlur = 8; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ox + pts[0].x * sc, oz + pts[0].z * sc, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // =====================================================================
  // Main loop
  // =====================================================================
  let lastT = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
    lastT = ts;

    if (gameState === STATE.COUNTDOWN) {
      countdownTimer -= dt;
      const n = Math.ceil(countdownTimer - 1);
      if (countdownTimer > 1) {
        const shown = countdownText.textContent;
        const want = String(n);
        if (shown !== want) { countdownText.textContent = want; countdownEl.querySelector("span").style.animation = "none"; void countdownEl.offsetWidth; countdownEl.querySelector("span").style.animation = ""; Audio_.countBeep(false); }
      } else if (countdownTimer > 0) {
        if (countdownText.textContent !== "GO!") { countdownText.textContent = "GO!"; countdownEl.querySelector("span").style.animation = "none"; void countdownEl.offsetWidth; countdownEl.querySelector("span").style.animation = ""; Audio_.countBeep(true); }
      } else {
        hide(countdownEl);
        gameState = STATE.RACING;
      }
      positionAllCars(dt);
      updateCamera(dt, false);
      updateHud();
    } else if (gameState === STATE.RACING) {
      raceClock += dt;
      updatePlayer(player, dt);
      for (const r of racers) if (!r.isPlayer && !r.finished) updateAI(r, dt);
      // finished AI keep coasting a bit
      for (const r of racers) if (r.finished && !r.isPlayer) { r.speed *= 0.98; applyCommonPhysics(r, dt); }
      carCollisions();
      positionAllCars(dt);
      updateCamera(dt, false);
      Audio_.setEngine(player.speed / player.maxSpeed);
      updateHud();
    } else if (gameState === STATE.PAUSED || gameState === STATE.RESULTS) {
      // keep rendering the frozen scene; slowly orbit not needed
      if (racers.length) { positionAllCars(dt); updateCamera(dt, false); }
    }

    if (env) {
      // subtle star drift
      const stars = env.children.find((c) => c.isPoints);
      if (stars) stars.rotation.y += dt * 0.006;
    }

    if (renderer && scene && (gameState !== STATE.TITLE && gameState !== STATE.GARAGE && gameState !== STATE.TRACKSEL || trackGroup)) {
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // Input
  // =====================================================================
  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (gameState === STATE.RACING || gameState === STATE.PAUSED) {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") togglePause();
      if (e.key === " ") e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  function bindHold(el, on, off) {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); on(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, off));
  }
  bindHold(document.getElementById("btnLeft"), () => (touch.left = true), () => (touch.left = false));
  bindHold(document.getElementById("btnRight"), () => (touch.right = true), () => (touch.right = false));
  bindHold(document.getElementById("btnGas"), () => (touch.gas = true), () => (touch.gas = false));
  bindHold(document.getElementById("btnBrake"), () => (touch.brake = true), () => (touch.brake = false));
  bindHold(document.getElementById("btnBoost"), () => (touch.boost = true), () => (touch.boost = false));

  window.addEventListener("resize", () => { resize(); if (gameState === STATE.GARAGE) drawPreviewCar(); });
  window.addEventListener("orientationchange", () => setTimeout(() => { resize(); }, 200));

  // Buttons
  startBtn.addEventListener("click", () => { Audio_.unlock(); goGarage(); });
  garageBackBtn.addEventListener("click", goTitle);
  toTrackBtn.addEventListener("click", goTrackSelect);
  trackBackBtn.addEventListener("click", goGarage);
  raceBtn.addEventListener("click", startRace);
  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", togglePause);
  restartBtn.addEventListener("click", () => { hide(pauseOverlay); startRace(); });
  menuFromPauseBtn.addEventListener("click", goTitle);
  rematchBtn.addEventListener("click", () => { hide(resultsOverlay); startRace(); });
  changeCarBtn.addEventListener("click", () => { hide(resultsOverlay); goGarage(); });
  menuFromResultsBtn.addEventListener("click", goTitle);

  // =====================================================================
  // Boot
  // =====================================================================
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  if (isTouch) document.body.classList.add("touch-device");

  initRenderer();
  goTitle();
  requestAnimationFrame(loop);
})();
