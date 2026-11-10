/**
 * Beat Classic - 3D Perspective Rhythm Game Engine
 * 20 Tracks · Long Notes System · High-End DJMAX Metallic Arcade Deck
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
      this.currentCategory = 'all'; // 'all', 'classic', 'arcade'
      this.speed = 1.5;
      this.offsetMs = 0;

      // Canvas & Rendering
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.dpr = window.devicePixelRatio || 1;
      this.width = 480;
      this.height = 800;

      // Track 3D Perspective Geometry
      this.horizonY = 120;
      this.hitlineY = 710;
      this.trackWidthTop = 130;
      this.trackWidthBottom = 340;

      // Gameplay Data
      this.notes = [];
      this.currentTime = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.life = 100;
      this.judgements = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.totalNotes = 0;

      // Key States & Active Hold Notes
      this.keysDown = [false, false, false, false];
      this.keyPressTime = [0, 0, 0, 0];
      this.activeHolds = [null, null, null, null]; // Currently held long note in each lane
      this.holdTickTimer = 0;

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
      this.renderCategoryTabs();
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

      // Mobile Direct Touch & Touch Bar Controls
      this.initTouchControls();
    }

    renderCategoryTabs() {
      const tabContainer = document.getElementById('categoryTabs');
      if (!tabContainer) return;

      tabContainer.innerHTML = `
        <button type="button" class="tab-btn active" data-cat="all">전체 곡 (20)</button>
        <button type="button" class="tab-btn" data-cat="classic">클래식 명곡 (5)</button>
        <button type="button" class="tab-btn" data-cat="arcade">오투잼·펌프 레전드 (15)</button>
      `;

      tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentCategory = btn.dataset.cat;
          this.renderSongCards();
        });
      });
    }

    renderSongCards() {
      const grid = document.getElementById('songGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const scores = JSON.parse(localStorage.getItem('beat_classic_scores') || '{}');

      const filteredSongs = SONGS.filter(s => {
        if (this.currentCategory === 'all') return true;
        return s.category === this.currentCategory;
      });

      filteredSongs.forEach((song, idx) => {
        const card = document.createElement('div');
        card.className = 'song-card compact' + (song.id === this.selectedSong.id ? ' selected' : '');
        card.dataset.id = song.id;

        const best = scores[song.id] || null;
        const bestHtml = best
          ? `<span class="best-score-chip">🏆 ${best.score.toLocaleString()} (${best.rank})</span>`
          : `<span class="best-score-chip" style="color:var(--text-muted);">---</span>`;

        const catBadge = song.category === 'classic'
          ? '<span class="cat-pill classic">CLASSIC</span>'
          : '<span class="cat-pill arcade">O2JAM/ARCADE</span>';

        card.innerHTML = `
          <div class="card-left">
            <span class="song-num">${(idx + 1).toString().padStart(2, '0')}</span>
            <div class="song-avatar">${song.icon}</div>
          </div>
          <div class="card-mid">
            <div class="song-title-row">
              <span class="song-title-text">${song.title}</span>
              ${catBadge}
            </div>
            <div class="song-meta-text">${song.composer} · ${song.genre}</div>
            <div class="song-desc-text">${song.description}</div>
          </div>
          <div class="card-right">
            <div class="bpm-pill">${song.bpm} BPM</div>
            <div class="diff-stars">${song.stars}</div>
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

    initTouchControls() {
      const touchMap = new Map();

      const handleTouchStart = (e) => {
        if (this.state !== STATE.PLAYING && this.state !== STATE.COUNTDOWN) return;
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const canvasX = (t.clientX - rect.left) * (this.width / rect.width);
          const canvasY = (t.clientY - rect.top) * (this.height / rect.height);

          // Lower 40% of the canvas is touchable
          if (canvasY > this.hitlineY - 200) {
            const trackLeft = (this.width - this.trackWidthBottom) / 2;
            const laneW = this.trackWidthBottom / 4;
            let lane = Math.floor((canvasX - trackLeft) / laneW);
            lane = Math.max(0, Math.min(3, lane));

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

      this.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      this.canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

      // Mobile Touch Bar buttons at bottom
      const touchCols = document.querySelectorAll('.touch-col');
      touchCols.forEach(col => {
        col.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const lane = parseInt(col.dataset.lane, 10);
          this.pressKey(lane);
        }, { passive: false });

        col.addEventListener('touchend', (e) => {
          e.preventDefault();
          const lane = parseInt(col.dataset.lane, 10);
          this.releaseKey(lane);
        }, { passive: false });
      });
    }

    resizeCanvas() {
      const container = document.querySelector('.canvas-wrapper');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isMobile = window.innerWidth <= 768;

      this.width = isMobile ? Math.min(rect.width, 480) : 520;
      this.height = Math.min(rect.height || 780, 860);

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      this.horizonY = this.height * 0.14;
      // Ergonomic bottom placement for thumbs
      this.hitlineY = isMobile ? (this.height - 76) : (this.height - 84);
      this.trackWidthTop = this.width * 0.30;
      this.trackWidthBottom = this.width * 0.76;
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
      this.sound.playHitSound(lane, this.selectedSong.soundStyle, this.selectedSong.basePitch);

      if (this.state === STATE.PLAYING) {
        this.judgeNoteHit(lane);
      }
    }

    releaseKey(lane) {
      this.keysDown[lane] = false;
      const touchCol = document.querySelector(`.touch-col[data-lane="${lane}"]`);
      if (touchCol) touchCol.classList.remove('active');

      // Check if releasing a Long Note
      const activeHold = this.activeHolds[lane];
      if (activeHold) {
        const holdProgress = (this.currentTime - activeHold.time) / activeHold.duration;
        this.sound.stopHoldSound(lane);

        if (holdProgress >= 0.80) {
          // Complete hold successfully!
          activeHold.completed = true;
          this.score += 500;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          this.showJudgement('PERFECT', '#ffd700');
          this.spawnHitParticles(lane, '#ffd700');
        } else {
          // Dropped hold prematurely
          activeHold.missed = true;
          this.combo = 0;
          this.judgements.miss++;
          this.life = Math.max(0, this.life - 5);
          this.showJudgement('MISS', '#ff3366');
        }
        this.activeHolds[lane] = null;
      }
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

        // If it's a Long Note, start holding!
        if (closestNote.isLong) {
          closestNote.isHolding = true;
          this.activeHolds[lane] = closestNote;
          this.sound.startHoldSound(lane);
        }
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

      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 6;
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 2,
          radius: 2 + Math.random() * 3,
          color: color,
          alpha: 1.0,
          decay: 0.035 + Math.random() * 0.03
        });
      }
    }

    startGame() {
      this.sound.stopAll();

      document.getElementById('lobbyScreen').style.display = 'none';
      document.getElementById('resultModal').style.display = 'none';
      const gameContainer = document.getElementById('gameContainer');
      gameContainer.style.display = 'flex';

      // Safe clean single-line HUD
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
      this.activeHolds = [null, null, null, null];
      this.activeJudgement = null;
      this.screenShake = 0;

      // Dynamic Procedural Chart Generation (Strict max 2 fingers + Long Notes!)
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
          // Play real studio-master MP3!
          this.sound.playRealAudio(this.selectedSong.audioFile);
        }
        return;
      }

      if (this.state !== STATE.PLAYING) return;

      // Sync strictly to real audio current playback time
      this.currentTime = this.sound.getAudioCurrentTime() + (this.offsetMs / 1000);

      // Pulse Beat for DJMAX Side Visualizer
      const beatInterval = 60 / this.selectedSong.bpm;
      this.bgaBeat = (Math.sin(this.currentTime * Math.PI * 2 / beatInterval) + 1) / 2;

      // Process Active Long Notes (Hold Notes)
      this.holdTickTimer += dt;
      for (let lane = 0; lane < 4; lane++) {
        const holdNote = this.activeHolds[lane];
        if (holdNote) {
          this.lasers[lane] = 1.0;
          this.hitBursts[lane] = 1.0;

          // Continuous hold score & combo tick
          if (this.holdTickTimer >= 0.14) {
            this.score += 80;
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            this.spawnHitParticles(lane, (lane === 0 || lane === 3) ? '#00f0ff' : '#ff007f');
            if (navigator.vibrate) navigator.vibrate(10);
          }

          // Check if hold duration naturally completed
          if (this.currentTime >= holdNote.time + holdNote.duration) {
            holdNote.completed = true;
            this.sound.stopHoldSound(lane);
            this.activeHolds[lane] = null;
            this.score += 600;
            this.showJudgement('PERFECT', '#ffd700');
          }
        }
      }
      if (this.holdTickTimer >= 0.14) this.holdTickTimer = 0;

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
        if (!this.keysDown[i] && !this.activeHolds[i]) {
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
      const lastNote = this.notes[this.notes.length - 1];
      const lastNoteEnd = lastNote ? (lastNote.time + (lastNote.duration || 0)) : 0;
      if (this.currentTime > lastNoteEnd + 2.5 || (this.sound.audioElement && this.sound.audioElement.ended)) {
        this.endGame();
      }
    }

    get3DCoords(lane, progress) {
      const p = Math.max(0, progress);
      const curvedP = Math.pow(p, 1.22);

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
      this.renderDJMaxArcadeDeck(ctx); // High-end metallic arcade deck
      this.renderParticles(ctx);
      this.renderJudgementOverlay(ctx);

      ctx.restore();
    }

    renderBackground(ctx) {
      const grad = ctx.createRadialGradient(this.width / 2, this.horizonY, 20, this.width / 2, this.height / 2, this.width);
      grad.addColorStop(0, '#10152e');
      grad.addColorStop(1, '#040508');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Side Equalizers
      const numBars = 12;
      const leftMargin = 10;
      const rightMargin = this.width - 20;

      for (let i = 0; i < numBars; i++) {
        const barVal = Math.sin(this.currentTime * 6 + i) * 0.5 + 0.5;
        const alpha = 0.2 + barVal * 0.5 * (0.6 + this.bgaBeat * 0.4);

        ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.fillRect(leftMargin, this.hitlineY - 50 - i * 11, 7, 7);

        ctx.fillStyle = `rgba(255, 0, 127, ${alpha})`;
        ctx.shadowColor = '#ff007f';
        ctx.fillRect(rightMargin, this.hitlineY - 50 - i * 11, 7, 7);
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
      ctx.lineTo(botR, this.hitlineY + 45);
      ctx.lineTo(botL, this.hitlineY + 45);
      ctx.closePath();

      const roadGrad = ctx.createLinearGradient(0, this.horizonY, 0, this.hitlineY);
      roadGrad.addColorStop(0, 'rgba(16, 20, 36, 0.94)');
      roadGrad.addColorStop(1, 'rgba(6, 8, 16, 0.98)');
      ctx.fillStyle = roadGrad;
      ctx.fill();

      // Outer Neon Rails
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(topL, this.horizonY);
      ctx.lineTo(botL, this.hitlineY + 45);
      ctx.stroke();

      ctx.strokeStyle = '#ff007f';
      ctx.shadowColor = '#ff007f';
      ctx.beginPath();
      ctx.moveTo(topR, this.horizonY);
      ctx.lineTo(botR, this.hitlineY + 45);
      ctx.stroke();
      ctx.restore();

      // Inner Lane Dividers
      for (let l = 1; l < 4; l++) {
        const topLaneX = topL + l * (this.trackWidthTop / 4);
        const botLaneX = botL + l * (this.trackWidthBottom / 4);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(topLaneX, this.horizonY);
        ctx.lineTo(botLaneX, this.hitlineY + 45);
        ctx.stroke();
      }

      // 3D Speed Grid Lines
      const numLines = 6;
      for (let i = 0; i < numLines; i++) {
        const lineP = ((this.currentTime * this.speed * 1.5 + i / numLines) % 1.0);
        const coords = this.get3DCoords(0, lineP);
        ctx.strokeStyle = `rgba(255, 255, 255, ${lineP * 0.10})`;
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
          laserGrad.addColorStop(1, `rgba(${isOuter ? '0, 240, 255' : '255, 0, 127'}, ${alpha * 0.55})`);

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
        if (note.completed || (note.missed && !note.isLong)) continue;

        const isOuter = (note.lane === 0 || note.lane === 3);
        const noteColor = isOuter ? '#00f0ff' : '#ff007f';
        const noteGlow = isOuter ? 'rgba(0, 240, 255, 0.75)' : 'rgba(255, 0, 127, 0.75)';

        // 1. Render Long Note Body (Hold Ribbon)
        if (note.isLong) {
          const noteEndTime = note.time + note.duration;
          if (curT > noteEndTime + 0.15) continue;

          // Start point of ribbon on track
          const startT = note.isHolding ? curT : note.time;
          const endT = noteEndTime;

          const startDiff = startT - curT;
          const endDiff = endT - curT;

          if (startDiff <= travelTime && endDiff >= -0.1) {
            const startProg = Math.max(0, Math.min(1.0, 1.0 - (startDiff / travelTime)));
            const endProg = Math.max(0, Math.min(1.0, 1.0 - (endDiff / travelTime)));

            const headCoords = this.get3DCoords(note.lane, startProg);
            const tailCoords = this.get3DCoords(note.lane, endProg);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tailCoords.xLeft + 4, tailCoords.y);
            ctx.lineTo(tailCoords.xRight - 4, tailCoords.y);
            ctx.lineTo(headCoords.xRight - 4, headCoords.y);
            ctx.lineTo(headCoords.xLeft + 4, headCoords.y);
            ctx.closePath();

            const ribbonGrad = ctx.createLinearGradient(0, tailCoords.y, 0, headCoords.y);
            ribbonGrad.addColorStop(0, isOuter ? 'rgba(0, 240, 255, 0.25)' : 'rgba(255, 0, 127, 0.25)');
            ribbonGrad.addColorStop(1, isOuter ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 127, 0.65)');

            ctx.fillStyle = ribbonGrad;
            ctx.shadowColor = noteColor;
            ctx.shadowBlur = 10;
            ctx.fill();

            // Glowing side edges of the ribbon
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.restore();
          }
        }

        // 2. Render Note Head (or Regular Tap Note)
        if (!note.hit && !note.missed) {
          const timeDiff = note.time - curT;
          if (timeDiff > travelTime || timeDiff < -0.16) continue;

          const progress = 1.0 - (timeDiff / travelTime);
          if (progress < -0.05 || progress > 1.1) continue;

          const noteHeightProgress = 0.045;
          const botCoords = this.get3DCoords(note.lane, Math.max(0, progress));
          const topCoords = this.get3DCoords(note.lane, Math.max(0, progress - noteHeightProgress));

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(topCoords.xLeft + 2, topCoords.y);
          ctx.lineTo(topCoords.xRight - 2, topCoords.y);
          ctx.lineTo(botCoords.xRight - 2, botCoords.y);
          ctx.lineTo(botCoords.xLeft + 2, botCoords.y);
          ctx.closePath();

          const noteGrad = ctx.createLinearGradient(0, topCoords.y, 0, botCoords.y);
          noteGrad.addColorStop(0, '#ffffff');
          noteGrad.addColorStop(0.35, noteColor);
          noteGrad.addColorStop(1, isOuter ? '#0066aa' : '#990044');

          ctx.fillStyle = noteGrad;
          ctx.shadowColor = noteGlow;
          ctx.shadowBlur = 14 * Math.max(0.4, progress);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(topCoords.xLeft + 3, topCoords.y + 1);
          ctx.lineTo(topCoords.xRight - 3, topCoords.y + 1);
          ctx.stroke();

          // If long note, draw hold lightning symbol
          if (note.isLong) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', botCoords.xMid, (topCoords.y + botCoords.y) / 2 + 4);
          }

          ctx.restore();
        }
      }
    }

    /**
     * Professional DJMAX Respect Metallic Arcade Deck
     * High-end beveled metallic receptor console perfectly fitted at bottom
     */
    renderDJMaxArcadeDeck(ctx) {
      const botL = (this.width - this.trackWidthBottom) / 2;
      const botR = botL + this.trackWidthBottom;

      ctx.save();

      // 1. Laser Judgement Beam Line
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(botL - 8, this.hitlineY);
      ctx.lineTo(botR + 8, this.hitlineY);
      ctx.stroke();

      // 2. Heavy Metallic Console Base Chassis
      const deckH = 50;
      const deckGrad = ctx.createLinearGradient(0, this.hitlineY, 0, this.hitlineY + deckH);
      deckGrad.addColorStop(0, '#1a1f34');
      deckGrad.addColorStop(0.3, '#0c0e18');
      deckGrad.addColorStop(1, '#05060b');

      ctx.fillStyle = deckGrad;
      ctx.fillRect(botL - 10, this.hitlineY + 1, (botR - botL) + 20, deckH + 8);

      // Chassis metallic bevel border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(botL - 10, this.hitlineY + 1, (botR - botL) + 20, deckH + 8);

      // 3. 4 Crystal Acrylic LED Key Pads
      const keyLabels = ['D', 'F', 'J', 'K'];
      for (let lane = 0; lane < 4; lane++) {
        const coords = this.get3DCoords(lane, 1.0);
        const isPressed = this.keysDown[lane] || !!this.activeHolds[lane];
        const isOuter = (lane === 0 || lane === 3);
        const col = isOuter ? '#00f0ff' : '#ff007f';

        const rx = coords.xLeft + 3;
        const rw = coords.laneW - 6;
        const ry = this.hitlineY + (isPressed ? 6 : 2);
        const rh = 44;

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 8);

        if (isPressed) {
          // Bright Neon LED Flood Glow
          const padGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
          padGrad.addColorStop(0, '#ffffff');
          padGrad.addColorStop(0.35, col);
          padGrad.addColorStop(1, isOuter ? '#004c80' : '#800040');

          ctx.fillStyle = padGrad;
          ctx.shadowColor = col;
          ctx.shadowBlur = 24;
        } else {
          // Dark Brushed Metallic / Crystal Acrylic
          const padGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
          padGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
          padGrad.addColorStop(1, 'rgba(10, 14, 28, 0.9)');

          ctx.fillStyle = padGrad;
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        // High-Gloss Neon Key Border
        ctx.strokeStyle = isPressed ? '#ffffff' : col;
        ctx.lineWidth = isPressed ? 2.5 : 1.8;
        ctx.shadowColor = col;
        ctx.shadowBlur = isPressed ? 16 : 6;
        ctx.stroke();

        // Arcade Key Indicator Stencil
        ctx.shadowBlur = 0;
        ctx.fillStyle = isPressed ? '#000000' : '#ffffff';
        ctx.font = '900 16px "SF Mono", monospace';
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
        ctx.font = '900 46px "Pretendard", sans-serif';
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
        ctx.font = '900 32px "Pretendard", sans-serif';
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
