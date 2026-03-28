(function () {
  const board = document.getElementById("game-board");
  const context = board.getContext("2d");
  const scoreValue = document.getElementById("score-value");
  const highScoreValue = document.getElementById("high-score-value");
  const overlay = document.getElementById("board-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayRestart = document.getElementById("overlay-restart");
  const directionButtons = Array.from(document.querySelectorAll("[data-direction]"));
  const embedMode = new URLSearchParams(window.location.search).get("embed") === "1";

  const GRID_SIZE = 20;
  const CELL_SIZE = board.width / GRID_SIZE;
  const BASE_STEP_MS = 140;
  const MIN_STEP_MS = 60;
  const SPEED_INCREASE_PER_FOOD = 5;
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const KEY_TO_DIRECTION = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  let gameState = "idle";
  let score = 0;
  let highScore = loadHighScore();
  let snake = [];
  let food = null;
  let direction = "right";
  let directionQueue = [];
  let animationFrameId = null;
  let lastFrameTime = 0;
  let accumulatedTime = 0;
  let currentStepMs = BASE_STEP_MS;

  // --- 吃食物动画 ---
  let foodParticles = [];

  // --- 音效（Web Audio API）---
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function playEatSound() {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.06);
      osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  function playGameOverSound() {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  }

  function playStartSound() {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }

  // --- 最高分 localStorage ---
  function loadHighScore() {
    try {
      return parseInt(localStorage.getItem("x-snake-high-score"), 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      localStorage.setItem("x-snake-high-score", String(highScore));
    } catch (_) {}
  }

  function updateHighScoreDisplay() {
    if (highScoreValue) {
      highScoreValue.textContent = String(highScore);
    }
  }

  // --- 吃食物粒子效果 ---
  function spawnFoodParticles(cellX, cellY) {
    const cx = cellX * CELL_SIZE + CELL_SIZE / 2;
    const cy = cellY * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.4;
      const speed = 1.5 + Math.random() * 2;
      foodParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        size: 2 + Math.random() * 2,
        color: "#ef4444",
      });
    }
  }

  function updateParticles(delta) {
    const dt = delta / 16.67;
    for (let i = foodParticles.length - 1; i >= 0; i--) {
      const p = foodParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.04 * dt;
      if (p.life <= 0) {
        foodParticles.splice(i, 1);
      }
    }
  }

  function renderParticles() {
    foodParticles.forEach((p) => {
      context.globalAlpha = p.life;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  }

  function fillRoundedRect(x, y, width, height, radius) {
    if (typeof context.roundRect === "function") {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
      context.fill();
      return;
    }

    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
    context.fill();
  }

  function placeFood() {
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    const available = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!occupied.has(`${x},${y}`)) available.push({ x, y });
      }
    }
    if (available.length === 0) return null;
    const pos = available[Math.floor(Math.random() * available.length)];
    return { x: pos.x, y: pos.y };
  }

  function initializeGame() {
    score = 0;
    currentStepMs = BASE_STEP_MS;
    foodParticles = [];
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    direction = "right";
    directionQueue = [];
    food = placeFood();
    updateScore();
    updateHighScoreDisplay();
    render();
  }

  function updateScore() {
    scoreValue.textContent = String(score);
  }

  function showOverlay(title, copy, showRestart) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy || "";
    overlayCopy.classList.toggle("is-hidden", !copy);
    overlayRestart.classList.toggle("is-hidden", !showRestart);
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function isOppositeDirection(current, upcoming) {
    return (
      (current === "up" && upcoming === "down") ||
      (current === "down" && upcoming === "up") ||
      (current === "left" && upcoming === "right") ||
      (current === "right" && upcoming === "left")
    );
  }

  function queueDirection(next) {
    if (!DIRECTIONS[next]) {
      return;
    }
    if (directionQueue.length >= 2) {
      return;
    }

    const lastQueued = directionQueue.length > 0
      ? directionQueue[directionQueue.length - 1]
      : direction;
    if (isOppositeDirection(lastQueued, next) || lastQueued === next) {
      return;
    }

    directionQueue.push(next);
  }

  function startNewRound(startDirection) {
    initializeGame();
    // 初始方向为 right，仅允许非反向的方向覆盖
    if (startDirection && !isOppositeDirection("right", startDirection)) {
      direction = startDirection;
      directionQueue = [];
    }
    gameState = "running";
    hideOverlay();
    playStartSound();
  }

  function resumeGame() {
    gameState = "running";
    hideOverlay();
  }

  function pauseGame(reason) {
    if (gameState !== "running") {
      return;
    }

    gameState = "paused";
    showOverlay(reason, "点击\u201C继续游戏\u201D或按方向键恢复。");
  }

  function finishGame(reason) {
    gameState = "gameover";
    playGameOverSound();

    let isNewHigh = false;
    if (score > highScore) {
      highScore = score;
      saveHighScore();
      updateHighScoreDisplay();
      isNewHigh = true;
    }

    const detail = isNewHigh
      ? `${reason}！🏆 新纪录：${score} 分！`
      : `${reason}　得分：${score}`;
    showOverlay(detail, null, true);
  }

  function advanceGame() {
    if (directionQueue.length > 0) {
      direction = directionQueue.shift();
    }
    const head = snake[0];
    const movement = DIRECTIONS[direction];
    const nextHead = {
      x: head.x + movement.x,
      y: head.y + movement.y,
    };

    const hitWall =
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE;

    if (hitWall) {
      finishGame("撞墙了");
      return;
    }

    const willEatFood = food && nextHead.x === food.x && nextHead.y === food.y;
    const bodyToCheck = willEatFood ? snake : snake.slice(0, -1);
    const hitSelf = bodyToCheck.some(
      (segment) => segment.x === nextHead.x && segment.y === nextHead.y
    );

    if (hitSelf) {
      finishGame("撞到自己了");
      return;
    }

    snake.unshift(nextHead);

    if (willEatFood) {
      spawnFoodParticles(food.x, food.y);
      playEatSound();
      score += 1;
      updateScore();
      // 吃食物后加速
      currentStepMs = Math.max(MIN_STEP_MS, currentStepMs - SPEED_INCREASE_PER_FOOD);
      food = placeFood();
    } else {
      snake.pop();
    }
  }

  function renderBoard() {
    context.clearRect(0, 0, board.width, board.height);
    context.fillStyle = "#111111";
    context.fillRect(0, 0, board.width, board.height);

    // 渲染食物（脉动动画）
    if (food) {
      const now = performance.now();
      const pulse = 1 + Math.sin(now / 200) * 0.08;
      const fSize = (CELL_SIZE - 6) * pulse;
      const fOffset = (CELL_SIZE - fSize) / 2;
      context.fillStyle = "#ef4444";
      fillRoundedRect(
        food.x * CELL_SIZE + fOffset,
        food.y * CELL_SIZE + fOffset,
        fSize,
        fSize,
        6
      );
    }

    snake.forEach((segment, index) => {
      context.fillStyle = index === 0 ? "#f6f6f2" : "#9f9f95";
      fillRoundedRect(
        segment.x * CELL_SIZE + 2,
        segment.y * CELL_SIZE + 2,
        CELL_SIZE - 4,
        CELL_SIZE - 4,
        index === 0 ? 7 : 5
      );
    });

    renderParticles();
  }

  function render() {
    renderBoard();
  }

  function gameLoop(timestamp) {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }

    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (gameState === "running") {
      accumulatedTime += delta;
      while (accumulatedTime >= currentStepMs) {
        advanceGame();
        accumulatedTime -= currentStepMs;
        if (gameState !== "running") {
          accumulatedTime = 0;
          break;
        }
      }
    }

    updateParticles(delta);
    render();
    animationFrameId = window.requestAnimationFrame(gameLoop);
  }

  function ensureLoop() {
    if (!animationFrameId) {
      animationFrameId = window.requestAnimationFrame(gameLoop);
    }
  }

  function handleDirectionalInput(inputDirection) {
    if (!DIRECTIONS[inputDirection]) {
      return;
    }

    if (gameState === "idle") {
      startNewRound(inputDirection);
      return;
    }

    if (gameState === "paused") {
      queueDirection(inputDirection);
      resumeGame();
      return;
    }

    queueDirection(inputDirection);
  }

  function handlePrimaryAction() {
    if (gameState === "idle") {
      startNewRound(direction);
      return;
    }

    if (gameState === "paused") {
      resumeGame();
      return;
    }

    pauseGame("已手动暂停");
  }

  /* --- Button press visual feedback helpers --- */
  const directionButtonMap = {};
  directionButtons.forEach((btn) => {
    directionButtonMap[btn.dataset.direction] = btn;
  });

  function flashButton(direction) {
    const btn = directionButtonMap[direction];
    if (!btn) return;
    btn.classList.add("is-pressed");
    setTimeout(() => btn.classList.remove("is-pressed"), 120);
  }

  function registerEvents() {
    window.addEventListener("keydown", (event) => {
      const mappedDirection = KEY_TO_DIRECTION[event.key];

      if (mappedDirection) {
        event.preventDefault();
        flashButton(mappedDirection);
        handleDirectionalInput(mappedDirection);
        return;
      }

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        handlePrimaryAction();
      }
    });

    directionButtons.forEach((button) => {
      const trigger = (event) => {
        event.preventDefault();
        handleDirectionalInput(button.dataset.direction);
      };

      button.addEventListener("click", trigger);
      button.addEventListener("touchstart", trigger, { passive: false });
    });

    overlayRestart.addEventListener("click", () => {
      if (gameState === "gameover") {
        startNewRound(direction);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseGame("窗口已切走");
      }
    });

    window.addEventListener("blur", () => {
      pauseGame(embedMode ? "小窗暂时失焦" : "窗口已失焦");
    });
  }

  updateHighScoreDisplay();
  initializeGame();
  registerEvents();
  ensureLoop();
})();
