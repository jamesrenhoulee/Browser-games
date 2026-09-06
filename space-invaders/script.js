(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Setup / DOM refs
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const waveEl = document.getElementById("wave");
  const highscoreEl = document.getElementById("highscore");
  const livesEl = document.getElementById("lives");
  const finalScoreEl = document.getElementById("finalScore");
  const newBestEl = document.getElementById("newBest");
  const gameOverTitleEl = document.getElementById("gameOverTitle");

  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");

  const startBtn = document.getElementById("startBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const retryBtn = document.getElementById("retryBtn");
  const muteBtn = document.getElementById("muteBtn");
  const muteIcon = document.getElementById("muteIcon");
  const pauseBtn = document.getElementById("pauseBtn");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnFire = document.getElementById("btnFire");

  const HIGH_SCORE_KEY = "spaceInvaders_highScore";

  // ---------------------------------------------------------------------
  // Audio (procedurally synthesized, no external files)
  // ---------------------------------------------------------------------
  const Audio_ = (() => {
    let ctxA = null;
    let muted = false;

    function ensure() {
      if (!ctxA) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctxA = new AC();
      }
      if (ctxA.state === "suspended") ctxA.resume();
      return ctxA;
    }

    function tone(freq, duration, type, startGain, endFreq) {
      if (muted) return;
      const ac = ensure();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), ac.currentTime + duration);
      gain.gain.setValueAtTime(startGain || 0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration + 0.02);
    }

    function noise(duration, startGain, filterFreq) {
      if (muted) return;
      const ac = ensure();
      const bufferSize = Math.floor(ac.sampleRate * duration);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq || 1800, ac.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, ac.currentTime + duration);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(startGain || 0.4, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
    }

    return {
      laser: () => tone(880, 0.14, "sawtooth", 0.09, 220),
      enemyLaser: () => tone(220, 0.18, "square", 0.07, 90),
      explosion: () => noise(0.35, 0.5, 2200),
      playerHit: () => noise(0.5, 0.55, 900),
      step: (lowHigh) => tone(lowHigh ? 90 : 65, 0.09, "square", 0.12),
      ufoLow: () => tone(320, 0.5, "sine", 0.06, 260),
      ufoBonus: () => tone(1400, 0.4, "triangle", 0.12, 500),
      waveClear: () => {
        [523, 659, 784, 1046].forEach((f, i) =>
          setTimeout(() => tone(f, 0.18, "triangle", 0.1), i * 90)
        );
      },
      setMuted(v) {
        muted = v;
      },
      isMuted: () => muted,
      unlock: ensure,
    };
  })();

  // ---------------------------------------------------------------------
  // Sizing (logical coordinate space == CSS pixel size of canvas)
  // ---------------------------------------------------------------------
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
    } else if (W === 0) {
      W = newW;
      H = newH;
      initWorld();
      return;
    }
    W = newW;
    H = newH;
  }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  const STATE = { START: "start", PLAYING: "playing", PAUSED: "paused", GAMEOVER: "gameover" };
  let state = STATE.START;

  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  let lives = 3;
  let wave = 1;

  highscoreEl.textContent = highScore;

  const keys = new Set();
  let touchLeft = false,
    touchRight = false;

  let player, stars, invaders, invaderGrid, barriers, ufo;
  let playerBullets = [];
  let enemyBullets = [];
  let particles = [];
  let floatingTexts = [];
  let shake = { time: 0, mag: 0 };
  let invaderStepToggle = false;
  let ufoTimer = 0;
  let respawnInvuln = 0;

  const INVADER_ROWS = 5;
  const INVADER_COLS = 8;
  const ROW_POINTS = [40, 30, 30, 20, 20]; // top row worth most, classic style

  function rescaleWorld(sx, sy) {
    if (!player) return;
    player.x *= sx;
    player.y *= sy;
    player.w *= sx;
    player.h *= sy;
    player.speed *= sx;

    stars.forEach((layer) =>
      layer.forEach((s) => {
        s.x *= sx;
        s.y *= sy;
      })
    );

    invaders.forEach((inv) => {
      inv.x *= sx;
      inv.y *= sy;
      inv.w *= sx;
      inv.h *= sy;
    });
    invaderGrid.offsetX *= sx;
    invaderGrid.offsetY *= sy;
    invaderGrid.stepX *= sx;
    invaderGrid.stepY *= sy;
    invaderGrid.speed *= sx;
    invaderGrid.minX *= sx;
    invaderGrid.maxX *= sx;

    barriers.forEach((b) => {
      b.x *= sx;
      b.y *= sy;
      b.blockW *= sx;
      b.blockH *= sy;
    });

    playerBullets.forEach((b) => {
      b.x *= sx;
      b.y *= sy;
    });
    enemyBullets.forEach((b) => {
      b.x *= sx;
      b.y *= sy;
    });

    if (ufo) {
      ufo.x *= sx;
      ufo.y *= sy;
      ufo.w *= sx;
      ufo.h *= sy;
    }
  }

  function initWorld() {
    player = {
      w: W * 0.09,
      h: W * 0.09 * 0.6,
      x: W / 2,
      y: H - H * 0.09,
      speed: W * 0.55,
      cooldown: 0,
      blinkTimer: 0,
    };

    stars = [0, 1, 2].map((layer) =>
      Array.from({ length: 26 + layer * 14 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + layer * 0.5 + Math.random() * 0.6,
        speed: 8 + layer * 18 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
      }))
    );

    ufo = { active: false, x: 0, y: H * 0.1, w: W * 0.11, h: W * 0.11 * 0.5, speed: 0, dir: 1, value: 0 };

    spawnWave(true);
  }

  function makeInvaderGrid() {
    const gridW = W * 0.78;
    const spacingX = gridW / (INVADER_COLS - 1);
    const spacingY = spacingX * 0.82;
    const invW = spacingX * 0.62;
    const invH = invW * 0.7;

    invaders = [];
    for (let r = 0; r < INVADER_ROWS; r++) {
      for (let c = 0; c < INVADER_COLS; c++) {
        invaders.push({
          row: r,
          col: c,
          type: r === 0 ? 0 : r <= 2 ? 1 : 2,
          x: W * 0.11 + c * spacingX,
          y: H * 0.12 + r * spacingY,
          w: invW,
          h: invH,
          alive: true,
          points: ROW_POINTS[r],
        });
      }
    }

    const baseSpeed = W * 0.055 * (1 + (wave - 1) * 0.14);
    invaderGrid = {
      dir: 1,
      speed: baseSpeed,
      offsetX: 0,
      offsetY: 0,
      stepX: W * 0.014,
      stepY: H * 0.032,
      minX: -W * 0.02,
      maxX: W * 0.02,
      dropPending: false,
    };
  }

  function makeBarriers() {
    // classic bunker silhouette, 9 cols x 6 rows, 1 = block present
    const pattern = [
      "000111100",
      "001111110",
      "011111111",
      "011111111",
      "110000011",
      "110000011",
    ];
    const count = 4;
    const barrierW = W * 0.14;
    const blockSize = barrierW / pattern[0].length;
    const marginBetween = (W - count * barrierW) / (count + 1);

    barriers = [];
    for (let i = 0; i < count; i++) {
      const bx = marginBetween + i * (barrierW + marginBetween);
      const by = H * 0.72;
      const blocks = pattern.map((row) => row.split("").map((ch) => ch === "1"));
      barriers.push({
        x: bx,
        y: by,
        blockW: blockSize,
        blockH: blockSize,
        cols: pattern[0].length,
        rows: pattern.length,
        blocks,
      });
    }
  }

  function spawnWave(isFirst) {
    makeInvaderGrid();
    makeBarriers();
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    floatingTexts = [];
    ufo.active = false;
    ufoTimer = 6 + Math.random() * 6;
    invaderStepToggle = false;
    if (!isFirst) Audio_.waveClear();
    waveEl.textContent = wave;
  }

  function resetGame() {
    score = 0;
    lives = 3;
    wave = 1;
    respawnInvuln = 1.2;
    scoreEl.textContent = "0";
    waveEl.textContent = "1";
    spawnWave(true);
    player.x = W / 2;
    renderLives();
  }

  // ---------------------------------------------------------------------
  // Rendering helpers — invader sprites (vector, glow, 2-frame animation)
  // ---------------------------------------------------------------------
  function drawInvader(inv, frame) {
    const { x, y, w, h, type } = inv;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const colors = [
      ["#ff5fa8", "#ff0e6c"],
      ["#5fe1ff", "#0e9dff"],
      ["#9dff5f", "#4bd90e"],
    ];
    const [c1, c2] = colors[type];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = c2;
    ctx.shadowBlur = w * 0.5;

    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;

    const legSpread = frame ? 1 : 0.6;

    if (type === 0) {
      // top row: sleek diamond flyer
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(w / 2 * legSpread, h / 2);
      ctx.lineTo(0, h * 0.28);
      ctx.lineTo(-w / 2 * legSpread, h / 2);
      ctx.lineTo(-w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, -h * 0.05, w * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (type === 1) {
      // mid rows: crab-like
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.1);
      ctx.lineTo(-w * 0.2, -h * 0.5);
      ctx.lineTo(w * 0.2, -h * 0.5);
      ctx.lineTo(w * 0.5, -h * 0.1);
      ctx.lineTo(w * 0.36, h * 0.15);
      ctx.lineTo(w * 0.5 * legSpread, h * 0.5);
      ctx.lineTo(w * 0.18, h * 0.28);
      ctx.lineTo(-w * 0.18, h * 0.28);
      ctx.lineTo(-w * 0.5 * legSpread, h * 0.5);
      ctx.lineTo(-w * 0.36, h * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0a0f1e";
      ctx.beginPath();
      ctx.arc(-w * 0.18, -h * 0.08, w * 0.08, 0, Math.PI * 2);
      ctx.arc(w * 0.18, -h * 0.08, w * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // bottom rows: octopus / bug
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.05, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      const legCount = 4;
      for (let i = 0; i < legCount; i++) {
        const lx = -w * 0.4 + (i * w * 0.8) / (legCount - 1);
        ctx.beginPath();
        ctx.moveTo(lx, h * 0.2);
        ctx.lineTo(lx + (i % 2 === 0 ? -1 : 1) * w * 0.06 * legSpread, h * 0.5);
        ctx.lineWidth = w * 0.09;
        ctx.strokeStyle = c2;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.fillStyle = "#0a0f1e";
      ctx.beginPath();
      ctx.arc(-w * 0.16, -h * 0.08, w * 0.07, 0, Math.PI * 2);
      ctx.arc(w * 0.16, -h * 0.08, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(alpha) {
    const { x, y, w, h } = player;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.shadowColor = "#3ff0c9";
    ctx.shadowBlur = w * 0.4;

    const grad = ctx.createLinearGradient(0, -h, 0, h * 0.4);
    grad.addColorStop(0, "#bdfff0");
    grad.addColorStop(0.5, "#3ff0c9");
    grad.addColorStop(1, "#0e8a72");
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w * 0.16, -h * 0.15);
    ctx.lineTo(w * 0.62, h * 0.1);
    ctx.lineTo(w * 0.5, h * 0.42);
    ctx.lineTo(w * 0.14, h * 0.22);
    ctx.lineTo(0, h * 0.34);
    ctx.lineTo(-w * 0.14, h * 0.22);
    ctx.lineTo(-w * 0.5, h * 0.42);
    ctx.lineTo(-w * 0.62, h * 0.1);
    ctx.lineTo(-w * 0.16, -h * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.25, w * 0.09, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // engine thruster flame
    const flameLen = h * (0.35 + Math.random() * 0.25);
    const flameGrad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.3 + flameLen);
    flameGrad.addColorStop(0, "rgba(255,210,63,0.95)");
    flameGrad.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, h * 0.3);
    ctx.lineTo(w * 0.12, h * 0.3);
    ctx.lineTo(0, h * 0.3 + flameLen);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawUfo() {
    if (!ufo.active) return;
    const { x, y, w, h } = ufo;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "#ff3d6e";
    ctx.shadowBlur = w * 0.5;
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, "#ff9dc0");
    grad.addColorStop(1, "#ff3d6e");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.28, w * 0.22, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = i === 0 ? "#fff59d" : "#ffd23f";
      ctx.beginPath();
      ctx.arc(i * w * 0.28, h * 0.12, w * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBarrier(b) {
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (!b.blocks[r][c]) continue;
        const bx = b.x + c * b.blockW;
        const by = b.y + r * b.blockH;
        const grad = ctx.createLinearGradient(bx, by, bx, by + b.blockH);
        grad.addColorStop(0, "#8dffb0");
        grad.addColorStop(1, "#2fae5e");
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by, b.blockW + 0.5, b.blockH + 0.5);
      }
    }
  }

  function drawStars(dt) {
    ctx.save();
    stars.forEach((layer, i) => {
      layer.forEach((s) => {
        s.y += s.speed * dt;
        if (s.y > H) {
          s.y = 0;
          s.x = Math.random() * W;
        }
        s.phase += dt * 3;
        const tw = 0.5 + 0.5 * Math.sin(s.phase);
        ctx.globalAlpha = 0.25 + tw * 0.55 * (0.4 + i * 0.3);
        ctx.fillStyle = "#dff3ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
    ctx.restore();
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

  function drawFloatingTexts() {
    floatingTexts.forEach((f) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function drawBullets() {
    playerBullets.forEach((b) => {
      ctx.save();
      ctx.shadowColor = "#3ff0c9";
      ctx.shadowBlur = 10;
      const grad = ctx.createLinearGradient(0, b.y - b.h, 0, b.y);
      grad.addColorStop(0, "rgba(63,240,201,0)");
      grad.addColorStop(1, "#bdfff0");
      ctx.fillStyle = grad;
      ctx.fillRect(b.x - b.w / 2, b.y - b.h, b.w, b.h);
      ctx.restore();
    });
    enemyBullets.forEach((b) => {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h);
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------------
  // Update logic
  // ---------------------------------------------------------------------
  function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < (count || 16); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 2 + Math.random() * 3.5,
        color,
      });
    }
  }

  function addFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 1, maxLife: 1, size: 16, vy: -40 });
  }

  function triggerShake(mag, time) {
    shake.mag = Math.max(shake.mag, mag);
    shake.time = Math.max(shake.time, time);
  }

  function renderLives() {
    livesEl.innerHTML = "";
    for (let i = 0; i < lives; i++) {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 20 16");
      svg.classList.add("life-icon");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", "M10 0 L13 9 L20 12 L11 13 L10 16 L9 13 L0 12 L7 9 Z");
      path.setAttribute("fill", "#3ff0c9");
      svg.appendChild(path);
      livesEl.appendChild(svg);
    }
  }

  function alivePlayerBulletExists() {
    return playerBullets.length > 0;
  }

  function firePlayerBullet() {
    if (state !== STATE.PLAYING) return;
    if (respawnInvuln > 0) return;
    if (alivePlayerBulletExists()) return;
    playerBullets.push({ x: player.x, y: player.y - player.h, w: W * 0.008, h: H * 0.03, speed: H * 1.1 });
    Audio_.laser();
  }

  function fireEnemyBullet(inv) {
    const colors = ["#ff5fa8", "#ffd23f", "#ff8a3d"];
    enemyBullets.push({
      x: inv.x + inv.w / 2,
      y: inv.y + inv.h,
      w: W * 0.01,
      h: H * 0.025,
      speed: H * (0.32 + Math.random() * 0.15 + (wave - 1) * 0.02),
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  function aliveInvaders() {
    return invaders.filter((i) => i.alive);
  }

  function updateInvaders(dt) {
    const alive = aliveInvaders();
    if (alive.length === 0) {
      wave++;
      spawnWave(false);
      return;
    }

    const speedFactor = 1 + (1 - alive.length / (INVADER_ROWS * INVADER_COLS)) * 2.4;
    const dx = invaderGrid.dir * invaderGrid.speed * speedFactor * dt;

    let minX = Infinity,
      maxX = -Infinity;
    alive.forEach((inv) => {
      minX = Math.min(minX, inv.x);
      maxX = Math.max(maxX, inv.x + inv.w);
    });

    let hitEdge = false;
    if (minX + dx < W * 0.02 && invaderGrid.dir < 0) hitEdge = true;
    if (maxX + dx > W * 0.98 && invaderGrid.dir > 0) hitEdge = true;

    if (hitEdge) {
      invaderGrid.dir *= -1;
      invaderStepToggle = !invaderStepToggle;
      alive.forEach((inv) => {
        inv.y += invaderGrid.stepY * 0.55;
      });
      Audio_.step(invaderStepToggle);
      const lowestY = Math.max(...alive.map((i) => i.y + i.h));
      if (lowestY > player.y - player.h * 1.5) {
        gameOver(false);
      }
    } else {
      alive.forEach((inv) => {
        inv.x += dx;
      });
    }

    // enemy fire: pick a random bottom-most invader per column occasionally
    const fireChance = (0.35 + wave * 0.05) * dt;
    if (Math.random() < fireChance && enemyBullets.length < 3 + Math.floor(wave / 2)) {
      const cols = {};
      alive.forEach((inv) => {
        if (!cols[inv.col] || inv.y > cols[inv.col].y) cols[inv.col] = inv;
      });
      const shooters = Object.values(cols);
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      if (shooter) fireEnemyBullet(shooter);
    }
  }

  function updateUfo(dt) {
    if (ufo.active) {
      ufo.x += ufo.dir * ufo.speed * dt;
      if ((ufo.dir > 0 && ufo.x - ufo.w / 2 > W) || (ufo.dir < 0 && ufo.x + ufo.w / 2 < 0)) {
        ufo.active = false;
      }
    } else {
      ufoTimer -= dt;
      if (ufoTimer <= 0) {
        ufo.active = true;
        ufo.dir = Math.random() < 0.5 ? 1 : -1;
        ufo.x = ufo.dir > 0 ? -ufo.w : W + ufo.w;
        ufo.speed = W * 0.22;
        ufo.value = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
        ufoTimer = 14 + Math.random() * 10;
        Audio_.ufoLow();
      }
    }
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function hitBarrier(x, y) {
    for (const b of barriers) {
      if (x < b.x || x > b.x + b.cols * b.blockW || y < b.y || y > b.y + b.rows * b.blockH) continue;
      const col = Math.floor((x - b.x) / b.blockW);
      const row = Math.floor((y - b.y) / b.blockH);
      if (row < 0 || row >= b.rows || col < 0 || col >= b.cols) continue;
      if (b.blocks[row][col]) {
        b.blocks[row][col] = false;
        // crater effect: chip a neighbor too
        const neighbors = [
          [row, col - 1],
          [row, col + 1],
          [row - 1, col],
          [row + 1, col],
        ];
        const n = neighbors[Math.floor(Math.random() * neighbors.length)];
        if (n[0] >= 0 && n[0] < b.rows && n[1] >= 0 && n[1] < b.cols && Math.random() < 0.5) {
          b.blocks[n[0]][n[1]] = false;
        }
        return true;
      }
    }
    return false;
  }

  function updateBullets(dt) {
    playerBullets.forEach((b) => (b.y -= b.speed * dt));
    playerBullets = playerBullets.filter((b) => b.y + b.h > 0);

    enemyBullets.forEach((b) => (b.y += b.speed * dt));
    enemyBullets = enemyBullets.filter((b) => b.y < H);

    // player bullets vs barriers
    playerBullets = playerBullets.filter((b) => !hitBarrier(b.x, b.y - b.h / 2));
    // enemy bullets vs barriers
    enemyBullets = enemyBullets.filter((b) => !hitBarrier(b.x, b.y + b.h / 2));

    // player bullets vs invaders
    for (const b of playerBullets) {
      for (const inv of invaders) {
        if (!inv.alive) continue;
        if (rectsOverlap(b.x - b.w / 2, b.y - b.h, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
          inv.alive = false;
          b.hit = true;
          score += inv.points;
          scoreEl.textContent = score;
          spawnExplosion(inv.x + inv.w / 2, inv.y + inv.h / 2, "#ffd23f", 18);
          Audio_.explosion();
          addFloatingText(inv.x + inv.w / 2, inv.y, `+${inv.points}`, "#ffd23f");
          break;
        }
      }
    }
    playerBullets = playerBullets.filter((b) => !b.hit);

    // player bullets vs ufo
    if (ufo.active) {
      playerBullets.forEach((b) => {
        if (rectsOverlap(b.x - b.w / 2, b.y - b.h, b.w, b.h, ufo.x - ufo.w / 2, ufo.y - ufo.h / 2, ufo.w, ufo.h)) {
          b.hit = true;
          ufo.active = false;
          score += ufo.value;
          scoreEl.textContent = score;
          spawnExplosion(ufo.x, ufo.y, "#ff3d6e", 24);
          addFloatingText(ufo.x, ufo.y, `+${ufo.value}`, "#ff3d6e");
          Audio_.ufoBonus();
        }
      });
      playerBullets = playerBullets.filter((b) => !b.hit);
    }

    // enemy bullets vs player
    if (respawnInvuln <= 0) {
      enemyBullets.forEach((b) => {
        if (
          rectsOverlap(
            b.x - b.w / 2,
            b.y,
            b.w,
            b.h,
            player.x - player.w * 0.35,
            player.y - player.h,
            player.w * 0.7,
            player.h * 1.2
          )
        ) {
          b.hit = true;
          playerHit();
        }
      });
      enemyBullets = enemyBullets.filter((b) => !b.hit);
    }
  }

  function playerHit() {
    lives--;
    renderLives();
    spawnExplosion(player.x, player.y - player.h * 0.3, "#3ff0c9", 26);
    triggerShake(10, 0.35);
    Audio_.playerHit();
    if (lives <= 0) {
      gameOver(false);
    } else {
      respawnInvuln = 1.6;
    }
  }

  function gameOver(won) {
    state = STATE.GAMEOVER;
    const isBest = score > highScore;
    if (isBest) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
    highscoreEl.textContent = highScore;
    finalScoreEl.textContent = score;
    newBestEl.classList.toggle("hidden", !isBest);
    gameOverTitleEl.textContent = "GAME OVER";
    gameOverOverlay.classList.remove("hidden");
  }

  function updateParticles(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);

    floatingTexts.forEach((f) => {
      f.y += f.vy * dt;
      f.life -= dt * 1.1;
    });
    floatingTexts = floatingTexts.filter((f) => f.life > 0);
  }

  function updatePlayer(dt) {
    const moveLeft = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touchLeft;
    const moveRight = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touchRight;
    if (moveLeft) player.x -= player.speed * dt;
    if (moveRight) player.x += player.speed * dt;
    player.x = Math.max(player.w * 0.55, Math.min(W - player.w * 0.55, player.x));

    if (respawnInvuln > 0) respawnInvuln -= dt;
  }

  function update(dt) {
    if (state !== STATE.PLAYING) return;
    updatePlayer(dt);
    updateInvaders(dt);
    updateUfo(dt);
    updateBullets(dt);
    updateParticles(dt);
    if (shake.time > 0) {
      shake.time -= dt;
      shake.mag *= 0.9;
    } else {
      shake.mag = 0;
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake.mag > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake.mag, (Math.random() - 0.5) * shake.mag);
    }

    drawStars(dt);

    barriers.forEach(drawBarrier);
    invaders.forEach((inv) => {
      if (inv.alive) drawInvader(inv, invaderStepToggle);
    });
    drawUfo();
    drawBullets();

    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      const blinking = respawnInvuln > 0 && Math.floor(respawnInvuln * 8) % 2 === 0;
      if (!blinking && lives > 0) drawPlayer(1);
    }

    drawParticles();
    drawFloatingTexts();

    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      firePlayerBullet();
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      togglePause();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  function bindHold(el, onDown, onUp) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onDown();
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, onUp));
  }
  bindHold(
    btnLeft,
    () => (touchLeft = true),
    () => (touchLeft = false)
  );
  bindHold(
    btnRight,
    () => (touchRight = true),
    () => (touchRight = false)
  );
  btnFire.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    firePlayerBullet();
  });

  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      pauseOverlay.classList.remove("hidden");
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      pauseOverlay.classList.add("hidden");
    }
  }

  startBtn.addEventListener("click", () => {
    Audio_.unlock();
    resetGame();
    state = STATE.PLAYING;
    startOverlay.classList.add("hidden");
  });

  resumeBtn.addEventListener("click", togglePause);
  pauseBtn.addEventListener("click", togglePause);

  retryBtn.addEventListener("click", () => {
    resetGame();
    state = STATE.PLAYING;
    gameOverOverlay.classList.add("hidden");
  });

  muteBtn.addEventListener("click", () => {
    const next = !Audio_.isMuted();
    Audio_.setMuted(next);
    muteBtn.classList.toggle("muted", next);
    muteIcon.innerHTML = next
      ? '<path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4zm11.5 3l2.5 2.5 1.4-1.4L16.9 12l2.5-2.5-1.4-1.4L15 10.6l-2.5-2.5-1.4 1.4L13.6 12l-2.5 2.5 1.4 1.4L15 13.4z"/>'
      : '<path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4z"/>';
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  resize();
  renderLives();
  requestAnimationFrame(loop);
})();
