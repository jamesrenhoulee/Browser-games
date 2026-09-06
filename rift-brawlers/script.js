(() => {
  "use strict";

  // =====================================================================
  // DOM refs
  // =====================================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const matchHud = document.getElementById("matchHud");
  const p1NameEl = document.getElementById("p1Name");
  const p2NameEl = document.getElementById("p2Name");
  const p1DamageEl = document.getElementById("p1Damage");
  const p2DamageEl = document.getElementById("p2Damage");
  const p1StocksEl = document.getElementById("p1Stocks");
  const p2StocksEl = document.getElementById("p2Stocks");
  const p1UltFillEl = document.getElementById("p1UltFill");
  const p2UltFillEl = document.getElementById("p2UltFill");
  const pauseBtn = document.getElementById("pauseBtn");

  const selectOverlay = document.getElementById("selectOverlay");
  const selectSubtitle = document.getElementById("selectSubtitle");
  const fighterGrid = document.getElementById("fighterGrid");
  const toStageBtn = document.getElementById("toStageBtn");

  const stageOverlay = document.getElementById("stageOverlay");
  const cpuAnnounce = document.getElementById("cpuAnnounce");
  const stageGrid = document.getElementById("stageGrid");
  const fightBtn = document.getElementById("fightBtn");

  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const menuFromPauseBtn = document.getElementById("menuFromPauseBtn");

  const resultsOverlay = document.getElementById("resultsOverlay");
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsSubtitle = document.getElementById("resultsSubtitle");
  const rematchBtn = document.getElementById("rematchBtn");
  const menuFromResultsBtn = document.getElementById("menuFromResultsBtn");

  const btnUp = document.getElementById("btnUp");
  const btnDown = document.getElementById("btnDown");
  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnAttack = document.getElementById("btnAttack");
  const btnSpecial = document.getElementById("btnSpecial");
  const btnUlt = document.getElementById("btnUlt");

  // =====================================================================
  // Audio (procedurally synthesized, no external files)
  // =====================================================================
  const Audio_ = (() => {
    let ac = null;
    let muted = false;
    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
      }
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function tone(freq, duration, type, startGain, endFreq) {
      if (muted) return;
      const a = ensure();
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, a.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), a.currentTime + duration);
      gain.gain.setValueAtTime(startGain || 0.15, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
      osc.connect(gain).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + duration + 0.02);
    }
    function noise(duration, startGain, filterFreq, filterEnd) {
      if (muted) return;
      const a = ensure();
      const bufferSize = Math.floor(a.sampleRate * duration);
      const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = a.createBufferSource();
      src.buffer = buffer;
      const filter = a.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq || 2000, a.currentTime);
      filter.frequency.exponentialRampToValueAtTime(filterEnd || 100, a.currentTime + duration);
      const gain = a.createGain();
      gain.gain.setValueAtTime(startGain || 0.4, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
      src.connect(filter).connect(gain).connect(a.destination);
      src.start();
    }
    return {
      unlock: ensure,
      setMuted: (v) => (muted = v),
      hit: (dmg) => noise(0.14 + Math.min(dmg, 20) * 0.006, 0.35, 1600 + dmg * 40, 200),
      jump: () => tone(420, 0.1, "square", 0.08, 620),
      land: () => tone(160, 0.08, "square", 0.06, 90),
      whoosh: () => tone(300, 0.12, "sawtooth", 0.06, 150),
      special: () => tone(700, 0.2, "sawtooth", 0.1, 300),
      ultimate: () => {
        [220, 330, 440, 660].forEach((f, i) => setTimeout(() => tone(f, 0.3, "triangle", 0.14), i * 80));
        noise(0.5, 0.3, 2400, 200);
      },
      ko: () => tone(500, 0.5, "sawtooth", 0.15, 60),
      select: () => tone(600, 0.08, "square", 0.08, 800),
      win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.12), i * 100)),
    };
  })();

  // =====================================================================
  // Sizing
  // =====================================================================
  let W = 0,
    H = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const newW = Math.max(1, rect.width);
    const newH = Math.max(1, rect.height);
    canvas.width = Math.round(newW * dpr);
    canvas.height = Math.round(newH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (W > 0 && H > 0 && (W !== newW || H !== newH)) {
      const sx = newW / W;
      const sy = newH / H;
      rescaleWorld(sx, sy);
    }
    W = newW;
    H = newH;
    if (currentStage) buildStageGeometry(currentStage);
    recomputeFighterSizes();
  }

  function rescaleWorld(sx, sy) {
    [fighters.p1, fighters.p2].forEach((f) => {
      if (!f) return;
      f.x *= sx;
      f.y *= sy;
      f.vx *= sx;
      f.vy *= sy;
    });
    projectiles.forEach((p) => {
      p.x *= sx;
      p.y *= sy;
      p.vx *= sx;
      p.vy *= sy;
    });
    camera.x *= sx;
    camera.y *= sy;
  }

  // =====================================================================
  // Character roster
  // =====================================================================
  const CHARACTERS = [
    {
      id: "blaze",
      name: "Blaze",
      role: "Fire Rushdown",
      color: "#ff6a3d",
      color2: "#ffd23f",
      glow: "rgba(255,106,61,0.5)",
      weight: 0.95,
      speed: 1.08,
      jumpMul: 1.0,
      size: { w: 0.05, h: 0.16 },
      moves: {
        jab: { name: "Flame Combo", startup: 0.05, active: 0.22, recovery: 0.14, damage: 2, kbBase: 1.6, kbScale: 0.03, angleDeg: 8, range: 0.058, multi: 3 },
        side: { name: "Flaming Lunge", startup: 0.08, active: 0.12, recovery: 0.26, damage: 8, kbBase: 6, kbScale: 0.13, angleDeg: 22, range: 0.09, dash: 0.075 },
        up: { name: "Rising Uppercut", startup: 0.08, active: 0.12, recovery: 0.24, damage: 7, kbBase: 6.5, kbScale: 0.12, angleDeg: 80, range: 0.075 },
        down: { name: "Fire Sweep", startup: 0.08, active: 0.12, recovery: 0.22, damage: 6, kbBase: 4, kbScale: 0.09, angleDeg: 12, range: 0.08 },
        special: { name: "Fireball", projectile: true, startup: 0.12, recovery: 0.22, damage: 7, kbBase: 5, kbScale: 0.1, speed: 0.5, radius: 0.02, life: 1.4, cooldown: 0.9, color: "#ff6a3d" },
        ultimate: { name: "Inferno Nova", kind: "aoe", startup: 0.35, active: 0.12, recovery: 0.35, damage: 24, kbBase: 17, kbScale: 0.1, radius: 0.16 },
      },
    },
    {
      id: "volt",
      name: "Volt",
      role: "Electric Speedster",
      color: "#5fd4ff",
      color2: "#c9f6ff",
      glow: "rgba(95,212,255,0.5)",
      weight: 0.8,
      speed: 1.32,
      jumpMul: 1.12,
      size: { w: 0.045, h: 0.145 },
      moves: {
        jab: { name: "Static Flurry", startup: 0.04, active: 0.24, recovery: 0.12, damage: 1.4, kbBase: 1.2, kbScale: 0.02, angleDeg: 6, range: 0.05, multi: 4 },
        side: { name: "Dash Charge", startup: 0.06, active: 0.1, recovery: 0.22, damage: 7, kbBase: 5.5, kbScale: 0.11, angleDeg: 16, range: 0.08, dash: 0.13 },
        up: { name: "Spin Surge", startup: 0.07, active: 0.11, recovery: 0.2, damage: 6.5, kbBase: 6, kbScale: 0.11, angleDeg: 78, range: 0.07 },
        down: { name: "Stomp Pulse", startup: 0.07, active: 0.1, recovery: 0.2, damage: 5.5, kbBase: 4.5, kbScale: 0.09, angleDeg: 10, range: 0.075, hitBothSides: true },
        special: { name: "Volt Strike", teleport: 0.15, startup: 0.05, active: 0.08, recovery: 0.22, damage: 8, kbBase: 6, kbScale: 0.1, angleDeg: 14, range: 0.07, cooldown: 1.1 },
        ultimate: { name: "Thunderstorm", kind: "barrage", startup: 0.1, duration: 1.6, strikes: 5, damage: 9, kbBase: 10, kbScale: 0.08, recovery: 0.3 },
      },
    },
    {
      id: "terra",
      name: "Terra",
      role: "Armored Heavy",
      color: "#b98a4e",
      color2: "#7cff8a",
      glow: "rgba(185,138,78,0.5)",
      weight: 1.35,
      speed: 0.82,
      jumpMul: 0.88,
      size: { w: 0.062, h: 0.175 },
      moves: {
        jab: { name: "Boulder Fists", startup: 0.1, active: 0.24, recovery: 0.22, damage: 5, kbBase: 3, kbScale: 0.05, angleDeg: 10, range: 0.062, multi: 2 },
        side: { name: "Armored Ram", startup: 0.1, active: 0.16, recovery: 0.3, damage: 9, kbBase: 7, kbScale: 0.13, angleDeg: 14, range: 0.09, dash: 0.09, superArmor: true },
        up: { name: "Debris Uppercut", startup: 0.1, active: 0.13, recovery: 0.26, damage: 8, kbBase: 7, kbScale: 0.13, angleDeg: 80, range: 0.08 },
        down: { name: "Ground Pound", startup: 0.14, active: 0.12, recovery: 0.28, damage: 7, kbBase: 6, kbScale: 0.1, angleDeg: 10, range: 0.095, hitBothSides: true },
        special: { name: "Boulder Throw", projectile: true, gravity: true, startup: 0.18, recovery: 0.3, damage: 9, kbBase: 7, kbScale: 0.11, speed: 0.34, radius: 0.03, life: 1.8, cooldown: 1.3, color: "#b98a4e" },
        ultimate: { name: "Seismic Slam", kind: "slam", startup: 0.15, riseTime: 0.45, damage: 22, kbBase: 19, kbScale: 0.11, recovery: 0.35 },
      },
    },
    {
      id: "frost",
      name: "Frost",
      role: "Ice Zoner",
      color: "#7fb8ff",
      color2: "#e8f7ff",
      glow: "rgba(127,184,255,0.5)",
      weight: 0.9,
      speed: 1.0,
      jumpMul: 1.02,
      size: { w: 0.048, h: 0.155 },
      moves: {
        jab: { name: "Ice Jabs", startup: 0.05, active: 0.2, recovery: 0.14, damage: 1.8, kbBase: 1.4, kbScale: 0.025, angleDeg: 8, range: 0.052, multi: 3 },
        side: { name: "Ice Spike", startup: 0.09, active: 0.11, recovery: 0.24, damage: 6.5, kbBase: 5, kbScale: 0.1, angleDeg: 18, range: 0.095 },
        up: { name: "Ice Pillar", startup: 0.09, active: 0.12, recovery: 0.24, damage: 6, kbBase: 7, kbScale: 0.12, angleDeg: 85, range: 0.075 },
        down: { name: "Ground Frost", startup: 0.08, active: 0.1, recovery: 0.2, damage: 5, kbBase: 3, kbScale: 0.07, angleDeg: -20, range: 0.075 },
        special: { name: "Ice Shard", projectile: true, startup: 0.08, recovery: 0.14, damage: 5, kbBase: 3, kbScale: 0.07, speed: 0.72, radius: 0.014, life: 1.0, cooldown: 0.55, color: "#bfe9ff" },
        ultimate: { name: "Absolute Zero", kind: "freeze", startup: 0.4, radius: 0.5, freezeTime: 2.2, damage: 8, shatterDamage: 14, kbBase: 12, kbScale: 0.1, recovery: 0.35 },
      },
    },
  ];

  // =====================================================================
  // Stages
  // =====================================================================
  const STAGES = [
    {
      id: "sky",
      name: "Sky Arena",
      desc: "Floating platforms, open sky",
      groundYFrac: 0.82,
      platformFracs: [
        { x: 0.5, y: 0.82, w: 0.62, h: 0.05 },
        { x: 0.24, y: 0.58, w: 0.18, h: 0.03 },
        { x: 0.76, y: 0.58, w: 0.18, h: 0.03 },
        { x: 0.5, y: 0.4, w: 0.16, h: 0.03 },
      ],
      spawnFracs: [
        { x: 0.32, y: 0.7 },
        { x: 0.68, y: 0.7 },
      ],
      bgTop: "#1a2a52",
      bgBottom: "#0a1226",
      draw(dt, cam) {
        drawSkyBackground(dt, cam);
      },
    },
    {
      id: "volcano",
      name: "Volcanic Ruins",
      desc: "Molten ground, drifting ember platform",
      groundYFrac: 0.84,
      platformFracs: [
        { x: 0.5, y: 0.84, w: 0.68, h: 0.06 },
        { x: 0.5, y: 0.55, w: 0.2, h: 0.03, drift: 0.14 },
      ],
      spawnFracs: [
        { x: 0.3, y: 0.72 },
        { x: 0.7, y: 0.72 },
      ],
      bgTop: "#3a1310",
      bgBottom: "#150605",
      draw(dt, cam) {
        drawVolcanoBackground(dt, cam);
      },
    },
  ];

  let currentStage = null;
  let stageGeo = null; // { platforms:[{x,y,w,h}], blast:{left,right,top,bottom}, spawns:[{x,y}] }

  function buildStageGeometry(stage) {
    const platforms = stage.platformFracs.map((p) => ({
      x: p.x * W,
      y: p.y * H,
      w: p.w * W,
      h: p.h * H,
      baseX: p.x * W,
      drift: (p.drift || 0) * W,
    }));
    const spawns = stage.spawnFracs.map((s) => ({ x: s.x * W, y: s.y * H }));
    stageGeo = {
      platforms,
      spawns,
      blast: { left: -W * 0.22, right: W * 1.22, top: -H * 0.65, bottom: H * 1.28 },
      groundY: stage.groundYFrac * H,
    };
  }

  // =====================================================================
  // Global game state
  // =====================================================================
  const GRAVITY = () => H * 3.6;
  const FASTFALL_MUL = 2.4;
  const KB_SCALE = () => W * 0.011;

  const fighters = { p1: null, p2: null };
  let projectiles = [];
  let particles = [];
  let scheduledStrikes = [];
  let camera = { x: 0, y: 0, zoom: 1 };
  let globalHitstop = 0;
  let shake = { mag: 0 };
  let gameState = "select-fighter"; // select-fighter | select-stage | fight | paused | results
  let selectedFighterIdx = 0;
  let selectedStageIdx = 0;
  let cpuFighterIdx = null;
  let winner = null;
  let bgTime = 0;

  function recomputeFighterSizes() {
    [fighters.p1, fighters.p2].forEach((f) => {
      if (!f) return;
      f.hw = (W * f.char.size.w) / 2;
      f.hh = (H * f.char.size.h) / 2;
    });
  }

  function makeFighter(charDef, isCPU, spawnIdx) {
    return {
      char: charDef,
      isCPU,
      spawnIdx,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hw: (W * charDef.size.w) / 2,
      hh: (H * charDef.size.h) / 2,
      facing: spawnIdx === 0 ? 1 : -1,
      grounded: false,
      jumpsLeft: 2,
      damage: 0,
      stocks: 3,
      ultGauge: 0,
      hitstun: 0,
      invincible: 0,
      frozen: false,
      frozenTimer: 0,
      action: null,
      specialCooldown: 0,
      flashTimer: 0,
      input: { left: false, right: false, up: false, down: false },
      ai: { decisionTimer: 0, moveDir: 0, wantJump: false, retreat: false },
      animPhase: Math.random() * 10,
    };
  }

  function respawnFighter(f) {
    const sp = stageGeo.spawns[f.spawnIdx];
    f.x = sp.x;
    f.y = sp.y;
    f.vx = 0;
    f.vy = 0;
    f.damage = 0;
    f.hitstun = 0;
    f.frozen = false;
    f.frozenTimer = 0;
    f.action = null;
    f.invincible = 1.8;
    f.jumpsLeft = 2;
  }

  function resetMatch() {
    buildStageGeometry(currentStage);
    const p1Char = CHARACTERS[selectedFighterIdx];
    const p2Char = CHARACTERS[cpuFighterIdx];
    fighters.p1 = makeFighter(p1Char, false, 0);
    fighters.p2 = makeFighter(p2Char, true, 1);
    respawnFighter(fighters.p1);
    respawnFighter(fighters.p2);
    fighters.p1.invincible = 0.5;
    fighters.p2.invincible = 0.5;
    projectiles = [];
    particles = [];
    scheduledStrikes = [];
    camera = { x: W / 2, y: H * 0.55, zoom: 1 };
    globalHitstop = 0;
    shake = { mag: 0 };
    p1NameEl.textContent = p1Char.name;
    p2NameEl.textContent = p2Char.name;
  }

  // =====================================================================
  // Input
  // =====================================================================
  const keys = new Set();
  const touchDir = { left: false, right: false, down: false };

  function heldDir(f) {
    return {
      left: f === fighters.p1 ? keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touchDir.left : f.input.left,
      right: f === fighters.p1 ? keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touchDir.right : f.input.right,
      down: f === fighters.p1 ? keys.has("ArrowDown") || keys.has("s") || keys.has("S") || touchDir.down : f.input.down,
      up: f === fighters.p1 ? keys.has("ArrowUp") || keys.has("w") || keys.has("W") : f.input.up,
    };
  }

  function pickMoveKeyFromDirection(f) {
    const d = heldDir(f);
    if (d.down) return "down";
    if (d.up) return "up";
    if (d.left || d.right) return "side";
    return "jab";
  }

  function tryJump(f) {
    if (gameState !== "fight") return;
    if (f.frozen || f.action) return;
    if (f.jumpsLeft <= 0) return;
    const vel = -H * (f.grounded ? 1.05 : 0.85) * f.char.jumpMul;
    f.vy = vel;
    f.grounded = false;
    f.jumpsLeft--;
    Audio_.jump();
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (gameState !== "fight") return;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
      e.preventDefault();
      tryJump(fighters.p1);
    }
    if (e.key === "j" || e.key === "J") startAttack(fighters.p1, pickMoveKeyFromDirection(fighters.p1));
    if (e.key === "k" || e.key === "K") startAttack(fighters.p1, "special");
    if (e.key === "l" || e.key === "L") startAttack(fighters.p1, "ultimate");
    if (e.key === "Escape" || e.key === "p" || e.key === "P") togglePause();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  function bindHold(el, onDown, onUp) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onDown();
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, onUp));
  }
  bindHold(btnLeft, () => (touchDir.left = true), () => (touchDir.left = false));
  bindHold(btnRight, () => (touchDir.right = true), () => (touchDir.right = false));
  bindHold(btnDown, () => (touchDir.down = true), () => (touchDir.down = false));
  btnUp.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tryJump(fighters.p1);
  });
  btnAttack.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startAttack(fighters.p1, pickMoveKeyFromDirection(fighters.p1));
  });
  btnSpecial.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startAttack(fighters.p1, "special");
  });
  btnUlt.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startAttack(fighters.p1, "ultimate");
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // =====================================================================
  // Combat
  // =====================================================================
  function startAttack(f, moveKey) {
    if (gameState !== "fight") return;
    if (f.frozen || f.hitstun > 0 || f.action) return;
    const move = f.char.moves[moveKey];
    if (!move) return;
    if (moveKey === "ultimate" && f.ultGauge < 100) return;
    if (moveKey === "special" && f.specialCooldown > 0) return;
    if (!f.grounded && (moveKey === "up" || moveKey === "down") && f.jumpsLeft < 0) return;

    const d = heldDir(f);
    if (d.left) f.facing = -1;
    else if (d.right) f.facing = 1;

    f.action = {
      moveKey,
      move,
      phase: "startup",
      t: 0,
      hitApplied: new Set(),
      multiIndex: 0,
      startX: f.x,
      startY: f.y,
      facing: f.facing,
      dashed: false,
      subPhase: "rise",
    };
    if (moveKey === "ultimate") {
      f.ultGauge = 0;
      Audio_.ultimate();
    } else if (moveKey === "special") {
      f.specialCooldown = move.cooldown || 1;
      Audio_.special();
    } else {
      Audio_.whoosh();
    }
  }

  function fighterRect(f) {
    return { x: f.x - f.hw, y: f.y - f.hh, w: f.hw * 2, h: f.hh * 2 };
  }

  function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx,
      dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function applyHit(attacker, defender, move, opts) {
    opts = opts || {};
    if (defender.invincible > 0 || defender.stocks <= 0) return;
    const forcedKb = opts.forcedKb;
    const superArmored = defender.action && defender.action.move.superArmor && !opts.ignoreArmor;

    defender.damage += opts.damage != null ? opts.damage : move.damage;
    defender.flashTimer = 0.12;

    if (!superArmored) {
      const kbMag = forcedKb != null ? forcedKb : (move.kbBase + defender.damage * move.kbScale) * (2 - defender.char.weight) * KB_SCALE() * 10;
      const rad = (move.angleDeg * Math.PI) / 180;
      const facing = opts.facingOverride != null ? opts.facingOverride : attacker.facing;
      defender.vx = facing * Math.cos(rad) * kbMag;
      defender.vy = -Math.sin(rad) * kbMag;
      defender.grounded = false;
      defender.hitstun = Math.min(1.1, Math.max(0.08, kbMag / (W * 0.9)));
      globalHitstop = Math.max(globalHitstop, Math.min(0.16, 0.03 + defender.damage * 0.0015));
      triggerShake(Math.min(18, kbMag * 0.05), 0.2);
    }

    if (attacker && attacker !== defender) {
      attacker.ultGauge = Math.min(100, attacker.ultGauge + (opts.damage != null ? opts.damage : move.damage) * 0.7);
    }
    defender.ultGauge = Math.min(100, defender.ultGauge + (opts.damage != null ? opts.damage : move.damage) * 0.9);

    spawnHitParticles(defender.x, defender.y, attacker ? attacker.char.color2 : "#fff");
    Audio_.hit(opts.damage != null ? opts.damage : move.damage);
  }

  function updateAttack(f, opponent, dt) {
    const a = f.action;
    if (!a) return;
    const move = a.move;
    a.t += dt;

    if (move.kind === "barrage") {
      updateBarrageUltimate(f, opponent, dt, a);
      return;
    }
    if (move.kind === "slam") {
      updateSlamUltimate(f, opponent, dt, a);
      return;
    }
    if (move.kind === "freeze") {
      updateFreezeUltimate(f, opponent, dt, a);
      return;
    }
    if (move.kind === "aoe") {
      updateAoeUltimate(f, opponent, dt, a);
      return;
    }

    const startup = move.startup || 0;
    const activeDur = move.active || 0.1;
    const recovery = move.recovery || 0.2;

    if (a.phase === "startup") {
      if (move.dash && a.t / startup > 0.2) {
        const prog = Math.min(1, a.t / startup);
        f.x = a.startX + a.facing * move.dash * W * prog * 0.4;
      }
      if (a.t >= startup) {
        a.phase = "active";
        if (move.teleport) {
          f.x += a.facing * move.teleport * W;
          const stageW = stageGeo.blast.right - stageGeo.blast.left;
          f.x = Math.max(stageGeo.blast.left + 20, Math.min(stageGeo.blast.right - 20, f.x));
        }
        if (move.projectile) spawnProjectile(f, move);
      }
    } else if (a.phase === "active") {
      if (move.dash) {
        const prog = Math.min(1, (a.t - startup) / activeDur);
        f.x = a.startX + a.facing * move.dash * W * (0.4 + 0.6 * prog);
      }
      if (!move.projectile) {
        const multi = move.multi || 1;
        const slice = activeDur / multi;
        const idx = Math.min(multi - 1, Math.floor((a.t - startup) / slice));
        if (!a.hitApplied.has(idx)) {
          const hb = meleeHitbox(f, move);
          const opRect = fighterRect(opponent);
          if (rectsOverlap(hb.x, hb.y, hb.w, hb.h, opRect.x, opRect.y, opRect.w, opRect.h)) {
            applyHit(f, opponent, move, { damage: move.damage });
            a.hitApplied.add(idx);
          }
          if (move.hitBothSides) {
            const hb2 = meleeHitbox(f, move, -1);
            if (rectsOverlap(hb2.x, hb2.y, hb2.w, hb2.h, opRect.x, opRect.y, opRect.w, opRect.h)) {
              applyHit(f, opponent, move, { damage: move.damage, facingOverride: -f.facing });
              a.hitApplied.add(idx);
            }
          }
        }
      }
      if (a.t >= startup + activeDur) a.phase = "recovery";
    } else if (a.phase === "recovery") {
      if (a.t >= startup + activeDur + recovery) {
        f.action = null;
      }
    }
  }

  function meleeHitbox(f, move, sideOverride) {
    const facing = sideOverride || f.facing;
    const range = move.range * W;
    const w = range * 1.3;
    let h = f.hh * 1.6;
    let cx = f.x + facing * (f.hw * 0.5 + range * 0.5);
    let cy = f.y;
    if (move.angleDeg > 60) {
      cy = f.y - f.hh - range * 0.5;
      cx = f.x;
      h = range * 1.3;
    } else if (move.angleDeg < -10) {
      cy = f.y + f.hh * 0.4;
    }
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function spawnProjectile(f, move) {
    projectiles.push({
      x: f.x + f.facing * f.hw,
      y: f.y - f.hh * 0.1,
      vx: f.facing * move.speed * W,
      vy: 0,
      radius: move.radius * W,
      damage: move.damage,
      kbBase: move.kbBase,
      kbScale: move.kbScale,
      angleDeg: 14,
      facing: f.facing,
      gravity: !!move.gravity,
      life: move.life,
      owner: f,
      color: move.color,
    });
  }

  function updateProjectiles(dt) {
    projectiles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += GRAVITY() * 0.4 * dt;
      p.life -= dt;
    });
    projectiles = projectiles.filter((p) => {
      if (p.life <= 0) return false;
      if (p.x < stageGeo.blast.left || p.x > stageGeo.blast.right) return false;
      const target = p.owner === fighters.p1 ? fighters.p2 : fighters.p1;
      if (target.stocks > 0 && circleRectOverlap(p.x, p.y, p.radius, target.x - target.hw, target.y - target.hh, target.hw * 2, target.hh * 2)) {
        applyHit(p.owner, target, { angleDeg: p.angleDeg, kbBase: p.kbBase, kbScale: p.kbScale, damage: p.damage }, { facingOverride: p.facing, damage: p.damage });
        return false;
      }
      return true;
    });
  }

  // ---- Ultimate choreographies ----
  function updateAoeUltimate(f, opponent, dt, a) {
    const move = a.move;
    if (a.phase === "startup" && a.t >= move.startup) a.phase = "active";
    if (a.phase === "active") {
      if (!a.hitApplied.has(0)) {
        const dist = Math.hypot(opponent.x - f.x, opponent.y - f.y);
        if (dist <= move.radius * W) applyHit(f, opponent, move, { damage: move.damage });
        a.hitApplied.add(0);
        triggerShake(20, 0.3);
      }
      if (a.t >= move.startup + (move.active || 0.1)) a.phase = "recovery";
    } else if (a.phase === "recovery" && a.t >= move.startup + (move.active || 0.1) + move.recovery) {
      f.action = null;
    }
  }

  function updateBarrageUltimate(f, opponent, dt, a) {
    const move = a.move;
    if (!a.scheduled) {
      a.scheduled = true;
      for (let i = 0; i < move.strikes; i++) {
        const t = move.startup + (i * move.duration) / move.strikes;
        const x = stageGeo.blast.left + Math.random() * (stageGeo.blast.right - stageGeo.blast.left);
        scheduledStrikes.push({ time: t, x, warnTime: Math.max(0, t - 0.35), warned: false, resolved: false, owner: f, move });
      }
    }
    const totalDur = move.startup + move.duration + move.recovery;
    if (a.t >= totalDur) f.action = null;
  }

  function updateStrikes(dt) {
    scheduledStrikes.forEach((s) => {
      s.time -= dt;
      s.warnTime -= dt;
      if (s.warnTime <= 0 && !s.warned) {
        s.warned = true;
        spawnHitParticles(s.x, H * 0.15, "#ffd23f");
      }
      if (s.time <= 0 && !s.resolved) {
        s.resolved = true;
        const target = s.owner === fighters.p1 ? fighters.p2 : fighters.p1;
        if (Math.abs(target.x - s.x) < W * 0.045 && target.stocks > 0) {
          applyHit(s.owner, target, s.move, { damage: s.move.damage, facingOverride: target.x > s.x ? 1 : -1 });
        }
        triggerShake(10, 0.15);
      }
    });
    scheduledStrikes = scheduledStrikes.filter((s) => !s.resolved || s.time > -0.3);
  }

  function updateSlamUltimate(f, opponent, dt, a) {
    const move = a.move;
    if (a.phase === "startup") {
      if (a.t >= move.startup) {
        a.phase = "active";
        a.subPhase = "rise";
        f.vy = -H * 0.95;
      }
    } else if (a.phase === "active") {
      if (a.subPhase === "rise") {
        if (f.vy >= 0 || a.t >= move.startup + move.riseTime) {
          a.subPhase = "fall";
          f.vy = H * 1.6;
        }
      } else if (a.subPhase === "fall") {
        if (f.grounded) {
          if (!a.hitApplied.has(0)) {
            a.hitApplied.add(0);
            const opRect = fighterRect(opponent);
            if (Math.abs(opponent.y - f.y) < f.hh * 3) {
              applyHit(f, opponent, move, { damage: move.damage, facingOverride: opponent.x > f.x ? 1 : -1 });
            }
            triggerShake(24, 0.35);
          }
          a.phase = "recovery";
        }
      }
    } else if (a.phase === "recovery") {
      if (a.t >= move.startup + move.riseTime + 0.6 + move.recovery) f.action = null;
    }
  }

  function updateFreezeUltimate(f, opponent, dt, a) {
    const move = a.move;
    if (a.phase === "startup" && a.t >= move.startup) {
      a.phase = "active";
      const dist = Math.hypot(opponent.x - f.x, opponent.y - f.y);
      if (dist <= move.radius * W && opponent.stocks > 0) {
        opponent.frozen = true;
        opponent.frozenTimer = move.freezeTime;
        opponent.vx = 0;
        opponent.vy = 0;
        applyHit(f, opponent, move, { damage: move.damage, forcedKb: 0.001 });
        opponent.pendingShatter = { move, attacker: f };
      }
    }
    if (a.phase === "active" && a.t >= move.startup + 0.15) a.phase = "recovery";
    if (a.phase === "recovery" && a.t >= move.startup + 0.15 + move.recovery) f.action = null;
  }

  // =====================================================================
  // Physics / update
  // =====================================================================
  function triggerShake(mag, time) {
    shake.mag = Math.max(shake.mag, mag);
  }

  function updateFighterPhysics(f, dt) {
    if (f.frozen) {
      f.frozenTimer -= dt;
      if (f.frozenTimer <= 0) {
        f.frozen = false;
        if (f.pendingShatter) {
          applyHit(f.pendingShatter.attacker, f, f.pendingShatter.move, { damage: f.pendingShatter.move.shatterDamage });
          f.pendingShatter = null;
        }
      }
      return;
    }

    const d = heldDir(f);
    const canControl = !f.action && f.hitstun <= 0;

    if (canControl) {
      const spd = W * 0.34 * f.char.speed;
      if (d.left) {
        f.vx = -spd;
        f.facing = -1;
      } else if (d.right) {
        f.vx = spd;
        f.facing = 1;
      } else if (f.grounded) {
        f.vx *= 0.72;
      }
    } else if (f.action) {
      f.vx = 0;
    } else if (f.grounded) {
      f.vx *= 0.8;
    }

    if (f.hitstun > 0) f.hitstun = Math.max(0, f.hitstun - dt);

    let g = GRAVITY();
    if (!f.grounded && d.down && f.vy > 0) g *= FASTFALL_MUL;
    f.vy += g * dt;
    f.vy = Math.min(f.vy, H * 2.2);

    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // platform collision (one-way, top only)
    f.grounded = false;
    for (const plat of stageGeo.platforms) {
      const feetPrev = f.y - f.vy * dt + f.hh;
      const feetNow = f.y + f.hh;
      if (f.vy >= 0 && feetPrev <= plat.y + 2 && feetNow >= plat.y && f.x + f.hw * 0.7 > plat.x - plat.w / 2 && f.x - f.hw * 0.7 < plat.x + plat.w / 2) {
        f.y = plat.y - f.hh;
        f.vy = 0;
        if (!f.grounded) {
          f.grounded = true;
          f.jumpsLeft = 2;
        }
      }
    }

    if (f.invincible > 0) f.invincible = Math.max(0, f.invincible - dt);
    if (f.specialCooldown > 0) f.specialCooldown = Math.max(0, f.specialCooldown - dt);
    if (f.flashTimer > 0) f.flashTimer = Math.max(0, f.flashTimer - dt);

    // KO / blast zone
    if (f.x < stageGeo.blast.left || f.x > stageGeo.blast.right || f.y < stageGeo.blast.top || f.y > stageGeo.blast.bottom) {
      handleKO(f);
    }
  }

  function handleKO(f) {
    if (f.stocks <= 0) return;
    spawnHitParticles(Math.max(0, Math.min(W, f.x)), Math.max(0, Math.min(H, f.y)), f.char.color, 30);
    Audio_.ko();
    triggerShake(16, 0.3);
    f.stocks--;
    updateHud();
    if (f.stocks <= 0) {
      endMatch(f === fighters.p1 ? fighters.p2 : fighters.p1);
    } else {
      respawnFighter(f);
    }
  }

  function updateAnimatingPlatforms(dt) {
    stageGeo.platforms.forEach((p) => {
      if (p.drift) p.x = p.baseX + Math.sin(bgTime * 0.6) * p.drift;
    });
  }

  function updateCamera(dt) {
    const midX = (fighters.p1.x + fighters.p2.x) / 2;
    const dist = Math.abs(fighters.p1.x - fighters.p2.x);
    const targetZoom = Math.max(0.72, Math.min(1.08, 1.12 - dist / W));
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 3);
    const clampedMid = Math.max(W * 0.38, Math.min(W * 0.62, midX));
    camera.x += (clampedMid - camera.x) * Math.min(1, dt * 3);
    camera.y = H * 0.52;
  }

  function endMatch(winnerFighter) {
    gameState = "results";
    winner = winnerFighter;
    Audio_.win();
    resultsTitle.textContent = `${winnerFighter.char.name.toUpperCase()} WINS!`;
    resultsSubtitle.textContent = `Stocks remaining: ${winnerFighter.stocks}`;
    resultsOverlay.classList.remove("hidden");
    updateTouchControlsVisibility();
    resize();
  }

  // =====================================================================
  // AI
  // =====================================================================
  const seenProjectiles = new WeakSet();

  function updateAI(f, opponent, dt) {
    const ai = f.ai;
    // reflexive projectile dodge, checked every frame
    for (const p of projectiles) {
      if (p.owner === f) continue;
      if (seenProjectiles.has(p)) continue;
      if (Math.abs(p.x - f.x) < W * 0.1 && Math.abs(p.y - f.y) < H * 0.12) {
        seenProjectiles.add(p);
        if (Math.random() < 0.65 && f.grounded) tryJump(f);
      }
    }

    ai.decisionTimer -= dt;
    if (ai.decisionTimer > 0) {
      applyAiIntention(f);
      return;
    }
    ai.decisionTimer = 0.18 + Math.random() * 0.22;

    if (f.frozen || f.hitstun > 0 || f.action) {
      ai.moveDir = 0;
      applyAiIntention(f);
      return;
    }

    const dx = opponent.x - f.x;
    const adist = Math.abs(dx);
    const dir = dx === 0 ? f.facing : Math.sign(dx);
    f.facing = dir;

    const nearLeftBlast = f.x < stageGeo.blast.left + W * 0.12;
    const nearRightBlast = f.x > stageGeo.blast.right - W * 0.12;
    const fallingOffStage = !f.grounded && f.vy > 0 && f.y > stageGeo.groundY - f.hh;
    const highDamageRetreat = f.damage > 85 && adist < W * 0.22 && Math.random() < 0.35;

    if (nearLeftBlast || nearRightBlast || fallingOffStage || f.y > stageGeo.blast.bottom - H * 0.15) {
      ai.moveDir = f.x < W * 0.5 ? 1 : -1;
      if (Math.random() < 0.75 && f.jumpsLeft > 0) tryJump(f);
      applyAiIntention(f);
      return;
    }

    if (highDamageRetreat) {
      ai.moveDir = -dir;
      applyAiIntention(f);
      return;
    }

    if (f.ultGauge >= 100 && adist < W * 0.5 && Math.random() < 0.5) {
      startAttack(f, "ultimate");
      ai.moveDir = 0;
      applyAiIntention(f);
      return;
    }

    const closeRange = W * 0.09;
    if (adist > W * 0.32 && f.specialCooldown <= 0 && Math.random() < 0.45) {
      startAttack(f, "special");
      ai.moveDir = dir * 0.3;
      applyAiIntention(f);
      return;
    }

    if (adist < closeRange) {
      ai.moveDir = 0;
      let moveKey = "side";
      const vDiff = opponent.y - f.y;
      const roll = Math.random();
      if (vDiff < -f.hh * 1.5) moveKey = "up";
      else if (vDiff > f.hh * 1.5) moveKey = "down";
      else if (roll < 0.35) moveKey = "jab";
      else if (roll < 0.55) moveKey = "side";
      f.input.left = moveKey === "side" && dir < 0;
      f.input.right = moveKey === "side" && dir > 0;
      startAttack(f, moveKey);
      f.input.left = false;
      f.input.right = false;
    } else {
      ai.moveDir = dir;
      if (Math.random() < 0.08 && f.grounded) tryJump(f);
    }
    applyAiIntention(f);
  }

  function applyAiIntention(f) {
    f.input.left = f.ai.moveDir < 0;
    f.input.right = f.ai.moveDir > 0;
    f.input.down = false;
    f.input.up = false;
  }

  // =====================================================================
  // Particles / visuals
  // =====================================================================
  function spawnHitParticles(x, y, color, count) {
    for (let i = 0; i < (count || 14); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.35,
        maxLife: 0.65,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  function updateParticles(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  // =====================================================================
  // Rendering
  // =====================================================================
  function drawSkyBackground(dt, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, currentStage.bgTop);
    g.addColorStop(1, currentStage.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(cam.left, cam.top, cam.w, cam.h);
    for (let i = 0; i < 10; i++) {
      const cx = ((i * 137 + bgTime * 12) % (W * 1.4)) - W * 0.2;
      const cy = H * (0.12 + (i % 4) * 0.09);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      roundBlob(cx, cy, 60 + (i % 3) * 20, 22);
      ctx.globalAlpha = 1;
    }
  }

  function roundBlob(cx, cy, w, h) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.5, cy + h * 0.15, w * 0.6, h * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - w * 0.5, cy + h * 0.15, w * 0.6, h * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawVolcanoBackground(dt, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, currentStage.bgTop);
    g.addColorStop(1, currentStage.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(cam.left, cam.top, cam.w, cam.h);
    for (let i = 0; i < 24; i++) {
      const t = (bgTime * (0.3 + (i % 5) * 0.08) + i * 0.4) % 1;
      const ex = ((i * 91) % W) + Math.sin(bgTime + i) * 20;
      const ey = H * (1 - t);
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.fillStyle = i % 2 ? "#ff9d4d" : "#ffd23f";
      ctx.beginPath();
      ctx.arc(ex, ey, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawStageGeometry() {
    stageGeo.platforms.forEach((p) => {
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      grad.addColorStop(0, "#3a3560");
      grad.addColorStop(1, "#211d3a");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(255,95,109,0.25)";
      ctx.shadowBlur = 12;
      const r = Math.min(10, p.h / 2);
      roundRect(p.x - p.w / 2, p.y, p.w, p.h, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(p.x - p.w / 2, p.y, p.w, Math.max(2, p.h * 0.12));
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFighter(f, dt) {
    if (f.stocks <= 0) return;
    const blink = f.invincible > 0 && Math.floor(f.invincible * 10) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing, 1);

    const speed = Math.abs(f.vx) / (W * 0.34 * f.char.speed);
    const running = f.grounded && speed > 0.15;
    const t = f.animPhase + performance.now() * 0.001;
    const bob = f.grounded ? Math.sin(t * (running ? 14 : 5)) * (running ? f.hh * 0.06 : f.hh * 0.03) : 0;

    let armAngle = running ? Math.sin(t * 14) * 0.6 : Math.sin(t * 3) * 0.15;
    let legAngle = running ? Math.sin(t * 14) * 0.7 : 0;
    let lean = 0;

    if (f.action) {
      const a = f.action;
      const prog = Math.min(1, a.t / ((a.move.startup || 0.1) + (a.move.active || 0.1)));
      if (a.move.angleDeg > 60) {
        armAngle = -1.8 * prog;
        lean = -0.15;
      } else if (a.move.angleDeg < -10) {
        armAngle = 1.4 * prog;
        lean = 0.2;
      } else {
        armAngle = 0.9 * prog;
        lean = 0.12 * prog;
      }
    } else if (f.hitstun > 0) {
      lean = -Math.sign(f.vx || 1) * 0.3;
      armAngle = 0.6;
      legAngle = -0.3;
    } else if (!f.grounded) {
      legAngle = 0.35;
      armAngle = -0.2;
    }

    const c1 = f.char.color;
    const c2 = f.char.color2;
    const hw = f.hw,
      hh = f.hh;

    ctx.shadowColor = f.char.glow;
    ctx.shadowBlur = hw * 1.6;

    ctx.save();
    ctx.rotate(lean * 0.3);
    ctx.translate(0, bob);

    // back leg
    drawLimb(0, hh * 0.3, -legAngle * 0.8, hh * 0.9, hw * 0.32, c1, 0.75);
    // back arm
    drawLimb(hw * 0.15, -hh * 0.15, -armAngle * 0.7, hh * 0.7, hw * 0.26, c1, 0.75);

    // torso
    const torsoGrad = ctx.createLinearGradient(0, -hh, 0, hh * 0.3);
    torsoGrad.addColorStop(0, lightenColor(c1, 14));
    torsoGrad.addColorStop(1, darkenColor(c1, 12));
    ctx.fillStyle = f.flashTimer > 0 ? "#ffffff" : torsoGrad;
    roundRect(-hw * 0.55, -hh * 0.65, hw * 1.1, hh * 1.15, hw * 0.4);
    ctx.fill();
    ctx.lineWidth = Math.max(1, hw * 0.06);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();

    if (f.char.id === "terra") {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-hw * 0.2 + i * hw * 0.2, -hh * 0.2 + (i % 2) * hh * 0.3, hw * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // head
    ctx.fillStyle = f.flashTimer > 0 ? "#ffffff" : lightenColor(c1, 8);
    ctx.beginPath();
    ctx.arc(0, -hh * 0.95, hw * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, hw * 0.05);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
    ctx.fillStyle = c2;
    ctx.shadowBlur = hw * 0.8;
    ctx.shadowColor = c2;
    ctx.beginPath();
    ctx.arc(hw * 0.18, -hh * 0.98, hw * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = hw * 1.6;
    ctx.shadowColor = f.char.glow;

    // front arm
    drawLimb(-hw * 0.15, -hh * 0.15, armAngle, hh * 0.75, hw * 0.28, lightenColor(c1, 5), 1);
    // front leg
    drawLimb(0, hh * 0.3, legAngle * 0.8, hh * 0.95, hw * 0.34, lightenColor(c1, 5), 1);

    // archetype flair
    if (f.char.id === "blaze" && (running || f.action)) {
      spawnTrail(f, "#ff9d4d");
    }
    if (f.char.id === "volt" && speed > 0.5) {
      ctx.strokeStyle = "rgba(200,246,255,0.5)";
      ctx.lineWidth = 2;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-hw * (0.8 + i * 0.4), -hh * 0.3);
        ctx.lineTo(-hw * (1.3 + i * 0.4), -hh * 0.3);
        ctx.stroke();
      }
    }
    if (f.char.id === "frost") {
      ctx.fillStyle = "rgba(232,247,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, -hh * 0.7);
      ctx.lineTo(-hw * 0.75, -hh * 1.05);
      ctx.lineTo(-hw * 0.35, -hh * 0.85);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();

    if (f.frozen) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.fillStyle = "rgba(180,230,255,0.45)";
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      roundRect(-hw * 0.9, -hh * 1.3, hw * 1.8, hh * 2.5, hw * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  function drawLimb(ox, oy, angle, len, width, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function spawnTrail(f, color) {
    if (Math.random() < 0.5) {
      particles.push({
        x: f.x - f.facing * f.hw * 0.5,
        y: f.y + f.hh * 0.3,
        vx: -f.facing * 20,
        vy: -20 - Math.random() * 30,
        life: 0.25,
        maxLife: 0.25,
        size: 3 + Math.random() * 3,
        color,
      });
    }
  }

  function lightenColor(hex, pct) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + Math.round((255 * pct) / 100);
    let g = ((num >> 8) & 0xff) + Math.round((255 * pct) / 100);
    let b = (num & 0xff) + Math.round((255 * pct) / 100);
    r = Math.min(255, r);
    g = Math.min(255, g);
    b = Math.min(255, b);
    return `rgb(${r},${g},${b})`;
  }

  function darkenColor(hex, pct) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - Math.round((255 * pct) / 100));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.round((255 * pct) / 100));
    const b = Math.max(0, (num & 0xff) - Math.round((255 * pct) / 100));
    return `rgb(${r},${g},${b})`;
  }

  function drawProjectiles() {
    projectiles.forEach((p) => {
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.radius * 2.2;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, p.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawStrikeWarnings() {
    scheduledStrikes.forEach((s) => {
      if (s.resolved) return;
      const alpha = s.warned ? Math.min(1, s.time / 0.35) : 0;
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = "#fffbe0";
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 20;
      ctx.fillRect(s.x - W * 0.02, 0, W * 0.04, H);
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, t);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function damageColor(dmg) {
    if (dmg < 40) return "#ffffff";
    if (dmg < 80) return "#ffd23f";
    if (dmg < 130) return "#ff9d4d";
    return "#ff5f6d";
  }

  function updateHud() {
    if (!fighters.p1 || !fighters.p2) return;
    p1DamageEl.textContent = Math.round(fighters.p1.damage) + "%";
    p2DamageEl.textContent = Math.round(fighters.p2.damage) + "%";
    p1DamageEl.style.color = damageColor(fighters.p1.damage);
    p2DamageEl.style.color = damageColor(fighters.p2.damage);
    renderStocks(p1StocksEl, fighters.p1);
    renderStocks(p2StocksEl, fighters.p2);
    p1UltFillEl.style.width = fighters.p1.ultGauge + "%";
    p2UltFillEl.style.width = fighters.p2.ultGauge + "%";
    p1UltFillEl.classList.toggle("ready", fighters.p1.ultGauge >= 100);
    p2UltFillEl.classList.toggle("ready", fighters.p2.ultGauge >= 100);
  }

  function renderStocks(el, f) {
    el.innerHTML = "";
    for (let i = 0; i < f.stocks; i++) {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 20 20");
      svg.classList.add("stock-icon");
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", "10");
      c.setAttribute("cy", "10");
      c.setAttribute("r", "8");
      c.setAttribute("fill", f.char.color);
      svg.appendChild(c);
      el.appendChild(svg);
    }
  }

  // =====================================================================
  // Main update / render
  // =====================================================================
  let lastTime = 0;

  function update(dt) {
    if (gameState !== "fight") return;
    if (globalHitstop > 0) {
      globalHitstop = Math.max(0, globalHitstop - dt);
      return;
    }
    bgTime += dt;
    updateAnimatingPlatforms(dt);

    updateAI(fighters.p2, fighters.p1, dt);

    [fighters.p1, fighters.p2].forEach((f) => {
      if (f.action) updateAttack(f, f === fighters.p1 ? fighters.p2 : fighters.p1, dt);
      updateFighterPhysics(f, dt);
    });

    updateProjectiles(dt);
    updateStrikes(dt);
    updateParticles(dt);
    updateCamera(dt);
    if (shake.mag > 0.1) shake.mag *= 0.88;
    else shake.mag = 0;

    updateHud();
  }

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    if (shake.mag > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake.mag, (Math.random() - 0.5) * shake.mag);
    }

    if (currentStage && stageGeo) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      const camLeft = camera.x - W / 2 / camera.zoom;
      const camTop = camera.y - H / 2 / camera.zoom;
      const camW = W / camera.zoom;
      const camH = H / camera.zoom;
      currentStage.draw(dt, { left: camLeft, top: camTop, w: camW, h: camH });

      drawStageGeometry();
      drawProjectiles();
      drawStrikeWarnings();
      if (fighters.p1) drawFighter(fighters.p1, dt);
      if (fighters.p2) drawFighter(fighters.p2, dt);
      drawParticles();

      ctx.restore();
    }

    ctx.restore();
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // Menus / screens
  // =====================================================================
  function drawPreviewCharacter(cv, charDef) {
    const c = cv.getContext("2d");
    const w = (cv.width = 96);
    const h = (cv.height = 96);
    c.clearRect(0, 0, w, h);
    c.save();
    c.translate(w / 2, h * 0.72);
    const hw = 16,
      hh = 26;
    c.shadowColor = charDef.glow;
    c.shadowBlur = 14;
    const grad = c.createLinearGradient(0, -hh, 0, hh * 0.3);
    grad.addColorStop(0, lightenColor(charDef.color, 30));
    grad.addColorStop(1, charDef.color);
    c.fillStyle = grad;
    roundRectCtx(c, -hw * 0.55, -hh * 0.65, hw * 1.1, hh * 1.15, hw * 0.4);
    c.fill();
    c.fillStyle = lightenColor(charDef.color, 15);
    c.beginPath();
    c.arc(0, -hh * 0.95, hw * 0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = charDef.color2;
    c.beginPath();
    c.arc(hw * 0.18, -hh * 0.98, hw * 0.14, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = charDef.color;
    c.lineWidth = hw * 0.3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-hw * 0.15, -hh * 0.15);
    c.lineTo(-hw * 0.5, hh * 0.5);
    c.moveTo(hw * 0.15, -hh * 0.15);
    c.lineTo(hw * 0.5, hh * 0.5);
    c.stroke();
    c.beginPath();
    c.moveTo(0, hh * 0.3);
    c.lineTo(-hw * 0.4, hh * 1.15);
    c.moveTo(0, hh * 0.3);
    c.lineTo(hw * 0.4, hh * 1.15);
    c.stroke();
    c.restore();
  }

  function roundRectCtx(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawPreviewStage(cv, stage) {
    const c = cv.getContext("2d");
    const w = (cv.width = 260);
    const h = (cv.height = 110);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, stage.bgTop);
    g.addColorStop(1, stage.bgBottom);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#3a3560";
    stage.platformFracs.forEach((p) => {
      c.fillRect(p.x * w - (p.w * w) / 2, p.y * h, p.w * w, Math.max(4, p.h * h));
    });
  }

  function buildFighterGrid() {
    fighterGrid.innerHTML = "";
    CHARACTERS.forEach((ch, idx) => {
      const card = document.createElement("div");
      card.className = "pick-card" + (idx === selectedFighterIdx ? " selected" : "");
      card.style.setProperty("--fighter-color", ch.color);
      card.style.setProperty("--fighter-glow", ch.glow);
      const cv = document.createElement("canvas");
      const name = document.createElement("div");
      name.className = "pick-name";
      name.textContent = ch.name;
      const desc = document.createElement("div");
      desc.className = "pick-desc";
      desc.textContent = ch.role;
      card.appendChild(cv);
      card.appendChild(name);
      card.appendChild(desc);
      card.addEventListener("click", () => {
        selectedFighterIdx = idx;
        Audio_.select();
        Audio_.unlock();
        buildFighterGrid();
        toStageBtn.classList.remove("hidden");
      });
      fighterGrid.appendChild(card);
      drawPreviewCharacter(cv, ch);
    });
  }

  function buildStageGrid() {
    stageGrid.innerHTML = "";
    STAGES.forEach((st, idx) => {
      const card = document.createElement("div");
      card.className = "pick-card" + (idx === selectedStageIdx ? " selected" : "");
      const cv = document.createElement("canvas");
      const name = document.createElement("div");
      name.className = "pick-name";
      name.textContent = st.name;
      const desc = document.createElement("div");
      desc.className = "pick-desc";
      desc.textContent = st.desc;
      card.appendChild(cv);
      card.appendChild(name);
      card.appendChild(desc);
      card.addEventListener("click", () => {
        selectedStageIdx = idx;
        Audio_.select();
        buildStageGrid();
      });
      stageGrid.appendChild(card);
      drawPreviewStage(cv, st);
    });
  }

  function pickCpuFighter() {
    const remaining = CHARACTERS.map((_, i) => i).filter((i) => i !== selectedFighterIdx);
    cpuFighterIdx = remaining[Math.floor(Math.random() * remaining.length)];
    cpuAnnounce.textContent = `CPU fighter: ${CHARACTERS[cpuFighterIdx].name}`;
  }

  toStageBtn.addEventListener("click", () => {
    pickCpuFighter();
    selectOverlay.classList.add("hidden");
    stageOverlay.classList.remove("hidden");
    buildStageGrid();
  });

  function updateTouchControlsVisibility() {
    const inMatch = gameState === "fight" || gameState === "paused";
    document.getElementById("touchControls").classList.toggle("hidden", !inMatch);
  }

  fightBtn.addEventListener("click", () => {
    Audio_.unlock();
    currentStage = STAGES[selectedStageIdx];
    buildStageGeometry(currentStage);
    resetMatch();
    stageOverlay.classList.add("hidden");
    matchHud.classList.remove("hidden");
    gameState = "fight";
    updateTouchControlsVisibility();
    resize();
    updateHud();
  });

  function togglePause() {
    if (gameState === "fight") {
      gameState = "paused";
      pauseOverlay.classList.remove("hidden");
    } else if (gameState === "paused") {
      gameState = "fight";
      pauseOverlay.classList.add("hidden");
    }
  }
  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", togglePause);

  function goToMainMenu() {
    gameState = "select-fighter";
    matchHud.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    resultsOverlay.classList.add("hidden");
    stageOverlay.classList.add("hidden");
    selectOverlay.classList.remove("hidden");
    updateTouchControlsVisibility();
    resize();
    buildFighterGrid();
  }
  menuFromPauseBtn.addEventListener("click", goToMainMenu);
  menuFromResultsBtn.addEventListener("click", goToMainMenu);

  rematchBtn.addEventListener("click", () => {
    resultsOverlay.classList.add("hidden");
    resetMatch();
    matchHud.classList.remove("hidden");
    gameState = "fight";
    updateTouchControlsVisibility();
    resize();
    updateHud();
  });

  // =====================================================================
  // Boot
  // =====================================================================
  buildFighterGrid();
  updateTouchControlsVisibility();
  resize();
  requestAnimationFrame(loop);
})();
