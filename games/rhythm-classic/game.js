/**
 * Beat Classic - 3D Perspective Rhythm Game Engine
 * O2Jam & DJMAX Arcade Style Canvas Renderer & Gameplay Loop
 */

(function() {
  'use strict';

  const STATE = {
    LOBBY: 0,
    COUNTDOWN: 1,
    PLAYING: 2,
    PAUSED: 3,
    RESULT: 4
  };

  class RhythmGame {
    constructor() {
      this.state = STATE.LOBBY;
      this.sound = new SoundEngine();
      this.selectedSong = SONGS[0];
      this.speed = 1.5;
      this.offsetMs = 0;

      // Canvas & Rendering
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.dpr = window.devicePixelRatio || 1;
      this.width = 480;
      this.height = 800;

      // Track 3D Perspective Geometry
      this.horizonY = 140;
      this.hitlineY = 660;
      this.trackWidthTop = 130;
      this.trackWidthBottom = 330;

      // Gameplay Data
      this.notes = [];
      this.currentTime = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.life = 100;
      this.judgements = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.totalNotes = 0;

      // Key States [D, F, J, K]
      this.keysDown = [false, false, false, false];
      this.keyPressTime = [0, 0, 0, 0];

      // Visual Effects
      this.particles = [];
      this.lasers = [0, 0, 0, 0];
      this.hitBursts = [0, 0, 0, 0];
      this.activeJudgement = null;
      this.comboBounce = 0;
      this.bgaBeat = 0;
      this.screenShake = 0;

      // Countdown
      this.countdownTimer = 3;
      this.countdownStart = 0;

      this.lastFrameTime = performance.now();
      this.animationFrameId = null;

      this.initDomEvents();
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    initDomEvents() {
      this.renderSongCards();

      // Fullscreen Button
      const fsBtn = document.getElementById('fullscreenToggleBtn');
      if (fsBtn) {
        fsBtn.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
      }

      // Speed Buttons
      document.querySelectorAll('.btn-speed').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.speed = parseFloat(btn.dataset.speed);
        });
      });

      // Offset Slider
      const offsetInput = document.getElementById('offsetInput');
      const offsetVal = document.getElementById('offsetVal');
      if (offsetInput && offsetVal) {
        offsetInput.addEventListener('input', (e) => {
          this.offsetMs = parseInt(e.target.value, 10);
          offsetVal.textContent = (this.offsetMs > 0 ? '+' : '') + this.offsetMs + 'ms';
        });
      }

      // Start Button
      const startBtn = document.getElementById('startGameBtn');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.startGame());
      }

      // Pause Button
      const pauseBtn = document.getElementById('pauseBtn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => this.togglePause());
      }

      // Result Buttons
      const replayBtn = document.getElementById('replayBtn');
      const lobbyBtn = document.getElementById('lobbyBtn');
      const shareBtn = document.getElementById('shareBtn');

      if (replayBtn) replayBtn.addEventListener('click', () => this.startGame());
      if (lobbyBtn) lobbyBtn.addEventListener('click', () => this.returnToLobby());
      if (shareBtn) shareBtn.addEventListener('click', () => this.shareResult());

      // Keyboard Controls
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));
      window.addEventListener('keyup', (e) => this.handleKeyUp(e));

      // Mobile Touch Controls
      this.initTouchControls();
    }

    initTouchControls() {
      const touchCols = document.querySelectorAll('.touch-col');
      const touchMap = new Map();

      const handleTouchStart = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const target = document.elementFromPoint(t.clientX, t.clientY);
          if (target && target.dataset.lane !== undefined) {
            const lane = parseInt(target.dataset.lane, 10);
            touchMap.set(t.identifier, lane);
            this.pressKey(lane);
          }
        }
      };

      const handleTouchEnd = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (touchMap.has(t.identifier)) {
            const lane = touchMap.get(t.identifier);
            touchMap.delete(t.identifier);
            this.releaseKey(lane);
          }
        }
      };

      touchCols.forEach(col => {
        col.addEventListener('touchstart', handleTouchStart, { passive: false });
        col.addEventListener('touchend', handleTouchEnd, { passive: false });
        col.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      });

      // Canvas Direct Touch
      this.canvas.addEventListener('touchstart', (e) => {
        if (this.state !== STATE.PLAYING && this.state !== STATE.COUNTDOWN) return;
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const canvasX = (t.clientX - rect.left) * (this.width / rect.width);
          const canvasY = (t.clientY - rect.top) * (this.height / rect.height);

          if (canvasY > this.hitlineY - 160) {
            const trackLeft = (this.width - this.trackWidthBottom) / 2;
            const laneW = this.trackWidthBottom / 4;
            const lane = Math.floor((canvasX - trackLeft) / laneW);
            if (lane >= 0 && lane < 4) {
              touchMap.set(t.identifier, lane);
              this.pressKey(lane);
            }
          }
        }
      }, { passive: false });

      this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      this.canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    renderSongCards() {
      const grid = document.getElementById('songGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const scores = JSON.parse(localStorage.getItem('beat_classic_scores') || '{}');

      SONGS.forEach((song) => {
        const card = document.createElement('div');
        card.className = 'song-card' + (song.id === this.selectedSong.id ? ' selected' : '');
        card.dataset.id = song.id;

        const best = scores[song.id] || null;
        const bestHtml = best
          ? `<span class="best-score-chip">🏆 ${best.score.toLocaleString()} (${best.rank})</span>`
          : `<span class="best-score-chip" style="color:var(--text-muted);">---</span>`;

        card.innerHTML = `
          <div>
            <div class="jacket-header">
              <div class="jacket-icon-badge">
                <span class="jacket-icon">${song.icon}</span>
                <span class="song-badge">${song.badge}</span>
              </div>
              <span class="bpm-badge"><i class="bpm-dot"></i> ${song.bpm} BPM</span>
            </div>
            <div class="song-name">${song.title}</div>
            <div class="song-composer">${song.composer} · ${song.genre}</div>
            <div class="song-desc">${song.description}</div>
          </div>
          <div class="song-footer">
            <span class="diff-chip">${song.stars} (${song.difficulty})</span>
            ${bestHtml}
          </div>
        `;

        card.addEventListener('click', () => {
          document.querySelectorAll('.song-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.selectedSong = song;
          this.sound.init();
          this.sound.resume();
        });

        grid.appendChild(card);
      });
    }

    resizeCanvas() {
      const container = document.querySelector('.canvas-wrapper');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isMobile = window.innerWidth <= 768;

      this.width = isMobile ? Math.min(rect.width, 480) : 520;
      this.height = Math.min(rect.height || 760, 840);

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      this.horizonY = this.height * 0.16;
      this.hitlineY = this.height * 0.82;
      this.trackWidthTop = this.width * 0.32;
      this.trackWidthBottom = this.width * 0.74;
    }

    handleKeyDown(e) {
      if (this.state === STATE.LOBBY) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          this.startGame();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (this.state !== STATE.PLAYING && this.state !== STATE.COUNTDOWN) return;

      const keyMap = { 'KeyD': 0, 'KeyF': 1, 'KeyJ': 2, 'KeyK': 3 };
      if (keyMap[e.code] !== undefined) {
        e.preventDefault();
        const lane = keyMap[e.code];
        if (!this.keysDown[lane]) {
          this.pressKey(lane);
        }
      }
    }

    handleKeyUp(e) {
      const keyMap = { 'KeyD': 0, 'KeyF': 1, 'KeyJ': 2, 'KeyK': 3 };
      if (keyMap[e.code] !== undefined) {
        e.preventDefault();
        const lane = keyMap[e.code];
        this.releaseKey(lane);
      }
    }

    pressKey(lane) {
      this.keysDown[lane] = true;
      this.keyPressTime[lane] = performance.now();
      this.lasers[lane] = 1.0;
      this.hitBursts[lane] = 1.0;

      const touchCol = document.querySelector(`.touch-col[data-lane="${lane}"]`);
      if (touchCol) touchCol.classList.add('active');

      if (navigator.vibrate) navigator.vibrate(15);
      this.sound.playHitSound(lane);

      if (this.state === STATE.PLAYING) {
        this.judgeNoteHit(lane);
      }
    }

    releaseKey(lane) {
      this.keysDown[lane] = false;
      const touchCol = document.querySelector(`.touch-col[data-lane="${lane}"]`);
      if (touchCol) touchCol.classList.remove('active');
    }

    judgeNoteHit(lane) {
      const curTime = this.currentTime;

      const PERFECT_WINDOW = 0.055;
      const GREAT_WINDOW = 0.11;
      const GOOD_WINDOW = 0.17;

      let closestNote = null;
      let minDiff = 999;

      for (let i = 0; i < this.notes.length; i++) {
        const note = this.notes[i];
        if (note.lane === lane && !note.hit && !note.missed) {
          const diff = Math.abs(note.time - curTime);
          if (diff < minDiff && diff <= GOOD_WINDOW) {
            minDiff = diff;
            closestNote = note;
          }
        }
      }

      if (closestNote) {
        closestNote.hit = true;
        let rating = 'GOOD';
        let color = '#39ff14';
        let scoreInc = 400;

        if (minDiff <= PERFECT_WINDOW) {
          rating = 'PERFECT';
          color = '#ffd700';
          scoreInc = 1000;
          this.judgements.perfect++;
          this.life = Math.min(100, this.life + 2);
          this.screenShake = 3;
        } else if (minDiff <= GREAT_WINDOW) {
          rating = 'GREAT';
          color = '#00f0ff';
          scoreInc = 700;
          this.judgements.great++;
          this.life = Math.min(100, this.life + 1);
        } else {
          this.judgements.good++;
        }

        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.score += Math.floor(scoreInc * (1 + (this.combo * 0.01)));
        this.comboBounce = 1.0;

        this.showJudgement(rating, color);
        this.spawnHitParticles(lane, color);
      }
    }

    showJudgement(text, color) {
      this.activeJudgement = {
        text: text,
        color: color,
        scale: 1.4,
        alpha: 1.0,
        time: performance.now()
      };
    }

    spawnHitParticles(lane, color) {
      const coords = this.get3DCoords(lane, 1.0);
      const px = coords.xMid;
      const py = coords.y;

      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 7;
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 2,
          radius: 2 + Math.random() * 3.5,
          color: color,
          alpha: 1.0,
          decay: 0.03 + Math.random() * 0.03
        });
      }
    }

    startGame() {
      this.sound.stopAll();

      document.getElementById('lobbyScreen').style.display = 'none';
      document.getElementById('resultModal').style.display = 'none';
      const gameContainer = document.getElementById('gameContainer');
      gameContainer.style.display = 'flex';

      document.getElementById('hudSongTitle').textContent = this.selectedSong.title;
      document.getElementById('hudSongMeta').textContent = `${this.selectedSong.bpm} BPM · ${this.selectedSong.difficulty}`;

      this.resizeCanvas();

      // Reset Stats
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.life = 100;
      this.judgements = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.particles = [];
      this.lasers = [0, 0, 0, 0];
      this.hitBursts = [0, 0, 0, 0];
      this.activeJudgement = null;
      this.screenShake = 0;

      // Dynamic Procedural Chart Generation (Anti-memorization!)
      this.notes = this.selectedSong.generateChart(0.8);
      this.totalNotes = this.notes.length;

      // Start Countdown
      this.state = STATE.COUNTDOWN;
      this.countdownTimer = 3;
      this.countdownStart = performance.now();

      const cdOverlay = document.getElementById('countdownOverlay');
      if (cdOverlay) {
        cdOverlay.style.display = 'block';
        cdOverlay.textContent = '3';
      }

      this.lastFrameTime = performance.now();
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    togglePause() {
      if (this.state === STATE.PLAYING) {
        this.state = STATE.PAUSED;
        this.sound.pauseAudio();
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) pauseBtn.textContent = '▶ 재개';
      } else if (this.state === STATE.PAUSED) {
        this.state = STATE.PLAYING;
        this.sound.resumeAudio();
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) pauseBtn.textContent = '⏸ 일시정지';
        this.lastFrameTime = performance.now();
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
      }
    }

    returnToLobby() {
      this.sound.stopAll();
      this.state = STATE.LOBBY;
      document.getElementById('gameContainer').style.display = 'none';
      document.getElementById('resultModal').style.display = 'none';
      document.getElementById('lobbyScreen').style.display = 'flex';
      this.renderSongCards();
    }

    gameLoop() {
      if (this.state === STATE.LOBBY || this.state === STATE.RESULT) return;

      const now = performance.now();
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      this.update(dt, now);
      this.render();

      this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    update(dt, now) {
      if (this.state === STATE.COUNTDOWN) {
        const elapsed = (now - this.countdownStart) / 1000;
        const cdOverlay = document.getElementById('countdownOverlay');

        if (elapsed < 1.0) {
          if (cdOverlay) cdOverlay.textContent = '3';
        } else if (elapsed < 2.0) {
          if (cdOverlay) cdOverlay.textContent = '2';
        } else if (elapsed < 3.0) {
          if (cdOverlay) cdOverlay.textContent = '1';
        } else {
          if (cdOverlay) {
            cdOverlay.textContent = 'START!';
            setTimeout(() => { if (cdOverlay) cdOverlay.style.display = 'none'; }, 500);
          }
          this.state = STATE.PLAYING;
          // Start real audio!
          this.sound.playRealAudio(this.selectedSong.audioFile);
        }
        return;
      }

      if (this.state !== STATE.PLAYING) return;

      // Sync strictly to real audio current playback time
      this.currentTime = this.sound.getAudioCurrentTime() + (this.offsetMs / 1000);

      // Pulse Beat for DJMAX Side Visualizer Equalizers
      const beatInterval = 60 / this.selectedSong.bpm;
      this.bgaBeat = (Math.sin(this.currentTime * Math.PI * 2 / beatInterval) + 1) / 2;

      // Check Missed Notes
      const MISS_THRESHOLD = 0.17;
      for (let i = 0; i < this.notes.length; i++) {
        const note = this.notes[i];
        if (!note.hit && !note.missed && this.currentTime > note.time + MISS_THRESHOLD) {
          note.missed = true;
          this.combo = 0;
          this.judgements.miss++;
          this.life = Math.max(0, this.life - 6);
          this.showJudgement('MISS', '#ff3366');
        }
      }

      // Lasers and Particle decays
      for (let i = 0; i < 4; i++) {
        if (!this.keysDown[i]) {
          this.lasers[i] = Math.max(0, this.lasers[i] - dt * 6);
        }
        this.hitBursts[i] = Math.max(0, this.hitBursts[i] - dt * 4);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) this.particles.splice(i, 1);
      }

      this.comboBounce = Math.max(0, this.comboBounce - dt * 4);
      this.screenShake = Math.max(0, this.screenShake - dt * 10);

      if (this.activeJudgement) {
        this.activeJudgement.scale = Math.max(1.0, this.activeJudgement.scale - dt * 2.5);
        this.activeJudgement.alpha = Math.max(0, this.activeJudgement.alpha - dt * 1.5);
        if (this.activeJudgement.alpha <= 0) this.activeJudgement = null;
      }

      // Update HUD
      document.getElementById('hudScore').textContent = this.score.toString().padStart(7, '0');
      const totalJudged = this.judgements.perfect + this.judgements.great + this.judgements.good + this.judgements.miss;
      const acc = totalJudged > 0
        ? ((this.judgements.perfect * 100 + this.judgements.great * 80 + this.judgements.good * 50) / (totalJudged * 100) * 100).toFixed(1)
        : '100.0';
      document.getElementById('hudAcc').textContent = `정확도 ${acc}%`;
      document.getElementById('lifeBarFill').style.width = this.life + '%';

      // Check Song End
      const lastNoteTime = this.notes.length > 0 ? this.notes[this.notes.length - 1].time : 0;
      if (this.currentTime > lastNoteTime + 2.5 || (this.sound.audioElement && this.sound.audioElement.ended)) {
        this.endGame();
      }
    }

    get3DCoords(lane, progress) {
      const p = Math.max(0, progress);
      const curvedP = Math.pow(p, 1.25);

      const y = this.horizonY + (this.hitlineY - this.horizonY) * curvedP;
      const trackW = this.trackWidthTop + (this.trackWidthBottom - this.trackWidthTop) * curvedP;
      const trackLeft = (this.width - trackW) / 2;
      const laneW = trackW / 4;

      const xLeft = trackLeft + lane * laneW;
      const xRight = xLeft + laneW;
      const xMid = xLeft + laneW / 2;

      return { y, trackW, trackLeft, laneW, xLeft, xRight, xMid };
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      ctx.save();
      if (this.screenShake > 0) {
        const sx = (Math.random() - 0.5) * this.screenShake;
        const sy = (Math.random() - 0.5) * this.screenShake;
        ctx.translate(sx, sy);
      }

      this.renderBackground(ctx);
      this.render3DHighway(ctx);
      this.renderKeyLasers(ctx);
      this.render3DNotes(ctx);
      this.render3DReceptors(ctx);
      this.renderParticles(ctx);
      this.renderJudgementOverlay(ctx);

      ctx.restore();
    }

    renderBackground(ctx) {
      const grad = ctx.createRadialGradient(this.width / 2, this.horizonY, 20, this.width / 2, this.height / 2, this.width);
      grad.addColorStop(0, '#121832');
      grad.addColorStop(1, '#05060b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      // DJMAX BGA Equalizer Visualizers
      const numBars = 12;
      const leftMargin = 12;
      const rightMargin = this.width - 24;

      for (let i = 0; i < numBars; i++) {
        const barVal = Math.sin(this.currentTime * 6 + i) * 0.5 + 0.5;
        const alpha = 0.2 + barVal * 0.5 * (0.6 + this.bgaBeat * 0.4);

        ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.fillRect(leftMargin, this.hitlineY - 40 - i * 11, 8, 8);

        ctx.fillStyle = `rgba(255, 0, 127, ${alpha})`;
        ctx.shadowColor = '#ff007f';
        ctx.fillRect(rightMargin, this.hitlineY - 40 - i * 11, 8, 8);
      }
      ctx.shadowBlur = 0;
    }

    render3DHighway(ctx) {
      const topL = (this.width - this.trackWidthTop) / 2;
      const topR = topL + this.trackWidthTop;
      const botL = (this.width - this.trackWidthBottom) / 2;
      const botR = botL + this.trackWidthBottom;

      // Track Highway Surface
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topL, this.horizonY);
      ctx.lineTo(topR, this.horizonY);
      ctx.lineTo(botR, this.hitlineY + 60);
      ctx.lineTo(botL, this.hitlineY + 60);
      ctx.closePath();

      const roadGrad = ctx.createLinearGradient(0, this.horizonY, 0, this.hitlineY);
      roadGrad.addColorStop(0, 'rgba(18, 22, 40, 0.95)');
      roadGrad.addColorStop(1, 'rgba(8, 10, 20, 0.98)');
      ctx.fillStyle = roadGrad;
      ctx.fill();

      // Neon Rails (Outer 3D borders)
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(topL, this.horizonY);
      ctx.lineTo(botL, this.hitlineY + 60);
      ctx.stroke();

      ctx.strokeStyle = '#ff007f';
      ctx.shadowColor = '#ff007f';
      ctx.beginPath();
      ctx.moveTo(topR, this.horizonY);
      ctx.lineTo(botR, this.hitlineY + 60);
      ctx.stroke();
      ctx.restore();

      // Inner Lane Lines
      for (let l = 1; l < 4; l++) {
        const topLaneX = topL + l * (this.trackWidthTop / 4);
        const botLaneX = botL + l * (this.trackWidthBottom / 4);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(topLaneX, this.horizonY);
        ctx.lineTo(botLaneX, this.hitlineY + 60);
        ctx.stroke();
      }

      // 3D Speed Grid Lines
      const numLines = 6;
      for (let i = 0; i < numLines; i++) {
        const lineP = ((this.currentTime * this.speed * 1.5 + i / numLines) % 1.0);
        const coords = this.get3DCoords(0, lineP);
        ctx.strokeStyle = `rgba(255, 255, 255, ${lineP * 0.12})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(coords.trackLeft, coords.y);
        ctx.lineTo(coords.trackLeft + coords.trackW, coords.y);
        ctx.stroke();
      }
    }

    renderKeyLasers(ctx) {
      for (let lane = 0; lane < 4; lane++) {
        if (this.lasers[lane] > 0.05) {
          const alpha = this.lasers[lane];
          const topCoords = this.get3DCoords(lane, 0.0);
          const botCoords = this.get3DCoords(lane, 1.0);
          const isOuter = (lane === 0 || lane === 3);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(topCoords.xLeft, topCoords.y);
          ctx.lineTo(topCoords.xRight, topCoords.y);
          ctx.lineTo(botCoords.xRight, botCoords.y);
          ctx.lineTo(botCoords.xLeft, botCoords.y);
          ctx.closePath();

          const laserGrad = ctx.createLinearGradient(0, topCoords.y, 0, botCoords.y);
          laserGrad.addColorStop(0, `rgba(${isOuter ? '0, 240, 255' : '255, 0, 127'}, 0)`);
          laserGrad.addColorStop(1, `rgba(${isOuter ? '0, 240, 255' : '255, 0, 127'}, ${alpha * 0.5})`);

          ctx.fillStyle = laserGrad;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    render3DNotes(ctx) {
      const curT = this.currentTime;
      const travelTime = 2.0 / this.speed;

      for (let i = 0; i < this.notes.length; i++) {
        const note = this.notes[i];
        if (note.hit || note.missed) continue;

        const timeDiff = note.time - curT;
        if (timeDiff > travelTime) continue;
        if (timeDiff < -0.16) continue;

        const progress = 1.0 - (timeDiff / travelTime);
        if (progress < -0.05 || progress > 1.1) continue;

        const noteHeightProgress = 0.045;
        const botCoords = this.get3DCoords(note.lane, Math.max(0, progress));
        const topCoords = this.get3DCoords(note.lane, Math.max(0, progress - noteHeightProgress));

        const isOuter = (note.lane === 0 || note.lane === 3);
        const noteColor = isOuter ? '#00f0ff' : '#ff007f';
        const noteGlow = isOuter ? 'rgba(0, 240, 255, 0.7)' : 'rgba(255, 0, 127, 0.7)';

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(topCoords.xLeft + 2, topCoords.y);
        ctx.lineTo(topCoords.xRight - 2, topCoords.y);
        ctx.lineTo(botCoords.xRight - 2, botCoords.y);
        ctx.lineTo(botCoords.xLeft + 2, botCoords.y);
        ctx.closePath();

        const noteGrad = ctx.createLinearGradient(0, topCoords.y, 0, botCoords.y);
        noteGrad.addColorStop(0, '#ffffff');
        noteGrad.addColorStop(0.3, noteColor);
        noteGrad.addColorStop(1, isOuter ? '#0070bb' : '#aa0055');

        ctx.fillStyle = noteGrad;
        ctx.shadowColor = noteGlow;
        ctx.shadowBlur = 12 * Math.max(0.4, progress);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(topCoords.xLeft + 3, topCoords.y + 1);
        ctx.lineTo(topCoords.xRight - 3, topCoords.y + 1);
        ctx.stroke();

        ctx.restore();
      }
    }

    render3DReceptors(ctx) {
      const botL = (this.width - this.trackWidthBottom) / 2;
      const botR = botL + this.trackWidthBottom;

      // Golden Judgement Bar
      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(botL - 6, this.hitlineY);
      ctx.lineTo(botR + 6, this.hitlineY);
      ctx.stroke();

      // 4 Heavy Arcade 3D Receptors
      const keyLabels = ['D', 'F', 'J', 'K'];
      for (let lane = 0; lane < 4; lane++) {
        const coords = this.get3DCoords(lane, 1.0);
        const isPressed = this.keysDown[lane];
        const isOuter = (lane === 0 || lane === 3);
        const col = isOuter ? '#00f0ff' : '#ff007f';

        const rx = coords.xLeft + 3;
        const rw = coords.laneW - 6;
        const ry = this.hitlineY + (isPressed ? 7 : 2);
        const rh = 42;

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 8);

        if (isPressed) {
          ctx.fillStyle = col;
          ctx.shadowColor = col;
          ctx.shadowBlur = 22;
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        ctx.strokeStyle = isPressed ? '#ffffff' : col;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = isPressed ? '#000000' : '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(keyLabels[lane], coords.xMid, ry + rh / 2);
      }
      ctx.restore();
    }

    renderParticles(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    renderJudgementOverlay(ctx) {
      if (this.combo > 1) {
        ctx.save();
        const comboY = this.hitlineY - 110;
        const scale = 1.0 + this.comboBounce * 0.28;

        ctx.translate(this.width / 2, comboY);
        ctx.scale(scale, scale);

        ctx.textAlign = 'center';
        ctx.font = '900 44px "Pretendard", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 18;
        ctx.fillText(this.combo.toString(), 0, 0);

        ctx.font = '800 13px monospace';
        ctx.fillStyle = '#00f0ff';
        ctx.letterSpacing = '2px';
        ctx.shadowBlur = 8;
        ctx.fillText('COMBO', 0, 18);
        ctx.restore();
      }

      if (this.activeJudgement) {
        ctx.save();
        const j = this.activeJudgement;
        const judgeY = this.hitlineY - 55;

        ctx.translate(this.width / 2, judgeY);
        ctx.scale(j.scale, j.scale);
        ctx.globalAlpha = j.alpha;

        ctx.textAlign = 'center';
        ctx.font = '900 30px "Pretendard", sans-serif';
        ctx.fillStyle = j.color;
        ctx.shadowColor = j.color;
        ctx.shadowBlur = 16;
        ctx.fillText(j.text, 0, 0);
        ctx.restore();
      }
    }

    endGame() {
      this.sound.stopAll();
      this.state = STATE.RESULT;

      const totalJudged = this.judgements.perfect + this.judgements.great + this.judgements.good + this.judgements.miss;
      const acc = totalJudged > 0
        ? ((this.judgements.perfect * 100 + this.judgements.great * 80 + this.judgements.good * 50) / (totalJudged * 100) * 100)
        : 0;

      let rank = 'F';
      if (acc >= 95) rank = 'S';
      else if (acc >= 85) rank = 'A';
      else if (acc >= 75) rank = 'B';
      else if (acc >= 60) rank = 'C';

      const scores = JSON.parse(localStorage.getItem('beat_classic_scores') || '{}');
      const prev = scores[this.selectedSong.id] || { score: 0 };
      if (this.score > prev.score) {
        scores[this.selectedSong.id] = { score: this.score, rank: rank, acc: acc.toFixed(1) };
        localStorage.setItem('beat_classic_scores', JSON.stringify(scores));
      }

      document.getElementById('resultRank').textContent = rank;
      document.getElementById('resultScore').textContent = this.score.toLocaleString();
      document.getElementById('resPerfect').textContent = this.judgements.perfect;
      document.getElementById('resGreat').textContent = this.judgements.great;
      document.getElementById('resGood').textContent = this.judgements.good;
      document.getElementById('resMiss').textContent = this.judgements.miss;
      document.getElementById('resCombo').textContent = this.maxCombo;
      document.getElementById('resAcc').textContent = acc.toFixed(1) + '%';

      document.getElementById('resultModal').style.display = 'flex';
    }

    shareResult() {
      const text = `[Beat Classic] ${this.selectedSong.title}\n점수: ${this.score.toLocaleString()} (${document.getElementById('resultRank').textContent}랭크)\n최대콤보: ${this.maxCombo} | 정확도: ${document.getElementById('resAcc').textContent}\nhttps://dailyfoodfighter.com/games/rhythm-classic/`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          alert('기록이 클립보드에 복사되었습니다!');
        });
      } else {
        prompt('아래 텍스트를 복사하세요:', text);
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.game = new RhythmGame();
  });
})();
