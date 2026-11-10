/**
 * Web Audio API Sound & Synth Engine for Beat Classic
 * 10 Classical Masterpieces - Zero External Dependencies
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.scheduledNodes = [];
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // Master Dynamics Compressor to prevent clipping
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(24, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(14, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.2, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.createNoiseBuffer();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  // O2Jam / DJMAX Style Key Tap Sound (Crisp Percussive Feedback)
  playHitSound(lane = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const pitches = [659.25, 783.99, 880.00, 1046.5]; // E5, G5, A5, C6
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitches[lane % 4], now);
    osc.frequency.exponentialRampToValueAtTime(pitches[lane % 4] * 1.6, now + 0.04);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Melodic Lead Synth Note
  scheduleLeadNote(freq, time, duration, timbre = 'saw') {
    if (!this.ctx || time < this.ctx.currentTime - 0.1) return;
    const safeFreq = (typeof freq === 'number' && isFinite(freq)) ? freq : 440.0;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = timbre === 'square' ? 'square' : 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(safeFreq, time);
    osc2.frequency.setValueAtTime(safeFreq * 1.004, time); // detune chorus

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(4500, time + 0.03);
    filter.frequency.exponentialRampToValueAtTime(1600, time + duration);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.015);
    gain.gain.setValueAtTime(0.16, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);

    this.scheduledNodes.push(osc1, osc2);
  }

  // Bass Synth Note
  scheduleBassNote(freq, time, duration) {
    if (!this.ctx || time < this.ctx.currentTime - 0.1) return;
    const safeFreq = (typeof freq === 'number' && isFinite(freq)) ? freq : 110.0;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(safeFreq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(time);
    osc.stop(time + duration);
    this.scheduledNodes.push(osc);
  }

  // Electronic Dance Kick
  scheduleKick(time) {
    if (!this.ctx || time < this.ctx.currentTime - 0.1) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.1);

    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(time);
    osc.stop(time + 0.18);
    this.scheduledNodes.push(osc);
  }

  // Punchy Snare
  scheduleSnare(time) {
    if (!this.ctx || !this.noiseBuffer || time < this.ctx.currentTime - 0.1) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.compressor);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(175, time);
    osc.frequency.exponentialRampToValueAtTime(75, time + 0.08);

    oscGain.gain.setValueAtTime(0.28, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.compressor);

    noise.start(time);
    noise.stop(time + 0.15);
    osc.start(time);
    osc.stop(time + 0.1);
    this.scheduledNodes.push(noise, osc);
  }

  // Hi-hat
  scheduleHihat(time, open = false) {
    if (!this.ctx || !this.noiseBuffer || time < this.ctx.currentTime - 0.1) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    const dur = open ? 0.16 : 0.04;
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    noise.start(time);
    noise.stop(time + dur);
    this.scheduledNodes.push(noise);
  }

  stopAll() {
    this.scheduledNodes.forEach(node => {
      try {
        node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.scheduledNodes = [];
    this.isPlaying = false;
  }
}

// Full Chromatic Frequency Map (C2 ~ B6)
const F = {
  C2: 65.41, Cs2: 69.30, D2: 73.42, Eb2: 77.78, E2: 82.41, F2: 87.31, Fs2: 92.50, G2: 98.00, Ab2: 103.83, A2: 110.00, Bb2: 116.54, B2: 123.47,
  C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.26, F5: 698.46, Fs5: 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
  C6: 1046.50, Cs6: 1108.73, D6: 1174.66, Eb6: 1244.51, E6: 1318.51, F6: 1396.91, Fs6: 1479.98, G6: 1567.98, Ab6: 1661.22, A6: 1760.00, Bb6: 1864.66, B6: 1975.53
};

// 10 Songs Definitions
const SONGS = [
  {
    id: "canon-rock",
    title: "캐논 변주곡 (Canon in D)",
    composer: "Johann Pachelbel",
    genre: "Synth Rock / Pump Classic",
    bpm: 132,
    difficulty: "Normal",
    stars: "★★☆",
    badge: "입문 추천",
    durationSec: 66,
    description: "전 세계인이 사랑하는 캐논의 감미로운 선율을 강렬한 록 신스로 재해석한 클래식 명곡",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      const bassChords = [F.D3, F.A3, F.B3, F.Fs4, F.G3, F.D3, F.G3, F.A3];
      let t = startT + 1.0;

      for (let m = 0; m < 24; m++) {
        const rootBass = bassChords[m % 8];
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          if (b === 0 || b === 2) sound.scheduleKick(bt);
          if (b === 1 || b === 3) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + eighth, false);
          sound.scheduleBassNote(rootBass, bt, beat * 0.8);
        }

        if (m < 4) {
          const mel = [F.Fs5, F.E5, F.D5, F.Cs5];
          for (let i = 0; i < 4; i++) {
            const nt = t + i * beat;
            sound.scheduleLeadNote(mel[i], nt, beat * 0.9);
            notes.push({ time: nt, lane: i % 4, freq: mel[i] });
          }
        } else if (m < 14) {
          const run = [F.D5, F.Fs5, F.A5, F.D6, F.Cs6, F.A5, F.Fs5, F.A5];
          for (let i = 0; i < 8; i++) {
            const nt = t + i * eighth;
            const fr = run[(m * 2 + i) % run.length];
            sound.scheduleLeadNote(fr, nt, eighth * 0.85);
            notes.push({ time: nt, lane: [0, 1, 2, 3, 2, 1, 0, 1][i], freq: fr });
          }
        } else {
          for (let i = 0; i < 16; i++) {
            const nt = t + i * sixteenth;
            const fr = [F.D5, F.E5, F.Fs5, F.G5, F.A5, F.B5, F.Cs6, F.D6][(m + i) % 8];
            sound.scheduleLeadNote(fr, nt, sixteenth * 0.9);
            if (i % 2 === 0 || (m >= 18 && i % 4 === 1)) {
              notes.push({ time: nt, lane: [0, 2, 1, 3, 1, 2, 0, 3][i % 8], freq: fr });
            }
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "turkish-march",
    title: "터키 행진곡 (Turkish March)",
    composer: "W. A. Mozart",
    genre: "Arcade Neo-Classical",
    bpm: 148,
    difficulty: "Hard",
    stars: "★★★",
    badge: "화려한 건반",
    durationSec: 64,
    description: "모차르트 피아노 소나타의 경쾌한 16분음표 질주와 펌프·오투잼 대표 테크니컬 명곡",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const motifA = [
        F.B4, F.A4, F.Ab4, F.A4, F.C5, F.D5, F.C5, F.B4, F.C5, F.E5,
        F.F5, F.E5, F.Eb5, F.E5, F.B5, F.A5, F.Ab5, F.A5, F.C6
      ];

      for (let m = 0; m < 26; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          if (b % 2 === 1) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + eighth, true);
          sound.scheduleBassNote(m % 2 === 0 ? F.A3 : F.E3, bt, eighth * 0.7);
        }

        const laneSeq = [[0, 1, 0, 1, 2], [2, 3, 2, 3, 1], [0, 2, 1, 3, 2, 1, 0, 3]];
        for (let s = 0; s < 16; s++) {
          const nt = t + s * sixteenth;
          const fr = motifA[(m * 4 + s) % motifA.length];
          sound.scheduleLeadNote(fr, nt, sixteenth * 0.9);
          if (s % 2 === 0) {
            const pat = laneSeq[m % laneSeq.length];
            notes.push({ time: nt, lane: pat[(s / 2) % pat.length], freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "beethoven-virus",
    title: "베토벤 바이러스 (Beethoven Virus)",
    composer: "L. v. Beethoven / BanYa",
    genre: "Speed Core / Pump Legend",
    bpm: 162,
    difficulty: "Very Hard",
    stars: "★★★★",
    badge: "초고속 폭타",
    durationSec: 68,
    description: "비창 소나타 3악장의 폭발적인 드라이브! 펌프 잇 업을 상징하는 전설의 시그니처 트랙",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const theme = [
        F.G4, F.C5, F.D5, F.Eb5, F.D5, F.C5, F.B4, F.C5,
        F.D5, F.G4, F.C5, F.D5, F.Eb5, F.F5, F.G5, F.Ab5,
        F.G5, F.F5, F.Eb5, F.D5, F.C5, F.B4, F.C5, F.D5
      ];

      for (let m = 0; m < 28; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          sound.scheduleSnare(bt + eighth);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + sixteenth * 2, true);
          sound.scheduleBassNote([F.C3, F.Eb3, F.G3, F.C4][b], bt, beat * 0.7);
        }

        for (let s = 0; s < 16; s++) {
          const nt = t + s * sixteenth;
          const fr = theme[(m * 8 + s) % theme.length];
          sound.scheduleLeadNote(fr, nt, sixteenth * 0.95);

          if (s % 2 === 0 || (m >= 10 && s % 4 === 1)) {
            let lane = (m % 2 === 0) ? (s / 2) % 4 : 3 - ((s / 2) % 4);
            if (m % 4 === 3) lane = [1, 2, 0, 3][(s / 2) % 4];
            notes.push({ time: nt, lane: lane, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "vivaldi-winter",
    title: "비발디 겨울 (Winter 1st Mvt)",
    composer: "Antonio Vivaldi",
    genre: "Symphonic Trance",
    bpm: 140,
    difficulty: "Hard",
    stars: "★★★",
    badge: "질주하는 비트",
    durationSec: 64,
    description: "사계 중 '겨울' 1악장의 긴박한 현악 스타카토와 트랜스 비트가 결합된 시원한 타격감의 트랙",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const motif = [
        F.F4, F.F4, F.F4, F.F4, F.Ab4, F.G4, F.F4, F.E4,
        F.F4, F.C5, F.Bb4, F.Ab4, F.G4, F.F4, F.E4, F.G4
      ];

      for (let m = 0; m < 25; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          if (b % 2 === 1) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + eighth, true);
          sound.scheduleBassNote(F.F3, bt, eighth * 0.9);
        }

        for (let s = 0; s < 16; s++) {
          const nt = t + s * sixteenth;
          const fr = motif[(m * 4 + s) % motif.length];
          sound.scheduleLeadNote(fr, nt, sixteenth * 0.7);

          if (s % 2 === 0 || s === 7 || s === 15) {
            const lane = [(s % 4), (3 - s % 4), ((s + 1) % 4)][m % 3];
            notes.push({ time: nt, lane: lane, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "flight-bumblebee",
    title: "왕벌의 비행 (Flight of the Bumblebee)",
    composer: "Rimsky-Korsakov",
    genre: "Speed Metal / Extreme",
    bpm: 174,
    difficulty: "Extreme",
    stars: "★★★★★",
    badge: "손가락 한계",
    durationSec: 60,
    description: "오투잼 전설의 초고속 반음계 연타! 174 BPM의 극한 스피드로 몰아치는 핑거 테크닉의 정점",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const chromatic = [
        F.A4, F.Ab4, F.G4, F.Fs4, F.G4, F.Ab4, F.A4, F.Bb4,
        F.B4, F.Bb4, F.A4, F.Ab4, F.A4, F.Bb4, F.B4, F.C5
      ];

      for (let m = 0; m < 28; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          sound.scheduleSnare(bt + eighth);
          sound.scheduleHihat(bt, true);
          sound.scheduleBassNote(F.A2, bt, beat * 0.6);
        }

        for (let s = 0; s < 16; s++) {
          const nt = t + s * sixteenth;
          const fr = chromatic[(m * 4 + s) % chromatic.length];
          sound.scheduleLeadNote(fr, nt, sixteenth * 0.8, 'saw');

          // Fast alternating stream across all 4 keys
          if (s % 2 === 0 || (m >= 12 && s % 4 === 1)) {
            const lane = [0, 1, 2, 3, 2, 1, 0, 3][s % 8];
            notes.push({ time: nt, lane: lane, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "fate-symphony",
    title: "운명 교향곡 (Symphony No.5)",
    composer: "L. v. Beethoven",
    genre: "Hard Rock / Pump Classic",
    bpm: 150,
    difficulty: "Hard",
    stars: "★★★★",
    badge: "강렬한 타격",
    durationSec: 62,
    description: "빠-빠-빠-빰! 세상을 뒤흔든 운명의 4음 모티브와 드라이브 록 기타 신스의 묵직한 타격감",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      for (let m = 0; m < 24; m++) {
        // Dramatic 4-note motif (G-G-G-Eb / F-F-F-D)
        const isTheme1 = m % 2 === 0;
        const tone1 = isTheme1 ? F.G4 : F.F4;
        const tone2 = isTheme1 ? F.Eb4 : F.D4;

        // Big hit drums
        sound.scheduleKick(t);
        sound.scheduleKick(t + eighth);
        sound.scheduleKick(t + beat);
        sound.scheduleSnare(t + beat * 1.5);
        sound.scheduleKick(t + beat * 2);
        sound.scheduleSnare(t + beat * 3);

        // Motif notes (short, short, short, LONG)
        sound.scheduleLeadNote(tone1, t, eighth * 0.8);
        sound.scheduleLeadNote(tone1, t + eighth, eighth * 0.8);
        sound.scheduleLeadNote(tone1, t + beat, eighth * 0.8);
        sound.scheduleLeadNote(tone2, t + beat * 1.5, beat * 1.8);

        notes.push({ time: t, lane: 0, freq: tone1 });
        notes.push({ time: t + eighth, lane: 1, freq: tone1 });
        notes.push({ time: t + beat, lane: 2, freq: tone1 });
        notes.push({ time: t + beat * 1.5, lane: 3, freq: tone2 });

        // Second half of measure: driving rhythm
        for (let i = 0; i < 4; i++) {
          const nt = t + beat * 2 + i * eighth;
          sound.scheduleLeadNote(tone1, nt, eighth * 0.7);
          notes.push({ time: nt, lane: [1, 2, 0, 3][i], freq: tone1 });
        }

        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "ode-to-joy",
    title: "환희의 송가 (Ode to Joy)",
    composer: "L. v. Beethoven",
    genre: "Eurobeat / Synth Pop",
    bpm: 136,
    difficulty: "Normal",
    stars: "★★☆",
    badge: "신나는 리듬",
    durationSec: 65,
    description: "베토벤 9번 교향곡의 벅찬 환희를 밝고 경쾌한 유로비트 댄스 리듬으로 풀어낸 흥겨운 무대",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const eighth = beat / 2;
      let t = startT + 1.0;

      const odeMelody = [
        F.Fs4, F.Fs4, F.G4, F.A4, F.A4, F.G4, F.Fs4, F.E4,
        F.D4, F.D4, F.E4, F.Fs4, F.Fs4, F.E4, F.E4, F.E4,
        F.Fs4, F.Fs4, F.G4, F.A4, F.A4, F.G4, F.Fs4, F.E4,
        F.D4, F.D4, F.E4, F.Fs4, F.E4, F.D4, F.D4, F.D4
      ];

      for (let m = 0; m < 24; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          if (b % 2 === 1) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + eighth, true);
          sound.scheduleBassNote(F.D3, bt, beat * 0.8);
        }

        for (let i = 0; i < 4; i++) {
          const nt = t + i * beat;
          const fr = odeMelody[(m * 4 + i) % odeMelody.length];
          sound.scheduleLeadNote(fr, nt, beat * 0.85);

          const lane = [0, 1, 2, 3][i % 4];
          notes.push({ time: nt, lane: lane, freq: fr });

          // 8th beat upbeat notes on later measures
          if (m >= 8 && i % 2 === 0) {
            const upT = nt + eighth;
            sound.scheduleLeadNote(fr, upT, eighth * 0.7);
            notes.push({ time: upT, lane: (lane + 1) % 4, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "new-world",
    title: "신세계 교향곡 (From the New World)",
    composer: "Antonín Dvořák",
    genre: "Symphonic Power Metal",
    bpm: 152,
    difficulty: "Very Hard",
    stars: "★★★★",
    badge: "웅장한 대서사",
    durationSec: 64,
    description: "드보르자크 교향곡 9번 4악장! 심포닉 록의 강렬한 브라스 팡파르와 폭풍처럼 쏟아지는 4키 노트",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const theme = [
        F.E4, F.G4, F.B4, F.E5, F.D5, F.B4, F.G4, F.A4,
        F.B4, F.B4, F.A4, F.G4, F.E4, F.Fs4, F.G4, F.E4
      ];

      for (let m = 0; m < 26; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          sound.scheduleSnare(bt + eighth);
          sound.scheduleHihat(bt, false);
          sound.scheduleBassNote(F.E3, bt, beat * 0.7);
        }

        for (let s = 0; s < 8; s++) {
          const nt = t + s * eighth;
          const fr = theme[(m * 2 + s) % theme.length];
          sound.scheduleLeadNote(fr, nt, eighth * 0.8, 'square');

          const lane = [0, 2, 1, 3, 2, 0, 1, 3][s % 8];
          notes.push({ time: nt, lane: lane, freq: fr });

          if (m >= 14 && s % 2 === 1) {
            const extraT = nt + sixteenth;
            notes.push({ time: extraT, lane: (lane + 2) % 4, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "air-g-string",
    title: "G선상의 아리아 (Air on the G String)",
    composer: "J. S. Bach",
    genre: "Chill Neo-Classical",
    bpm: 118,
    difficulty: "Easy",
    stars: "★☆☆",
    badge: "힐링 앤 그루브",
    durationSec: 68,
    description: "바흐 관현악 모음곡의 우아한 현악 선율과 잔잔한 칠아웃 로우파이 비트가 어우러진 힐링 트랙",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const eighth = beat / 2;
      let t = startT + 1.2;

      const airMelody = [
        F.D5, F.D5, F.Cs5, F.B4, F.A4, F.G4, F.Fs4, F.E4,
        F.D4, F.Fs4, F.A4, F.D5, F.Cs5, F.B4, F.A4, F.G4
      ];

      for (let m = 0; m < 22; m++) {
        // Relaxed Lofi / Chill beat
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          if (b === 0 || b === 2) sound.scheduleKick(bt);
          if (b === 1 || b === 3) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleBassNote(F.D3, bt, beat * 0.9);
        }

        for (let i = 0; i < 4; i++) {
          const nt = t + i * beat;
          const fr = airMelody[(m * 2 + i) % airMelody.length];
          sound.scheduleLeadNote(fr, nt, beat * 0.9, 'saw');
          notes.push({ time: nt, lane: [0, 1, 2, 3][i % 4], freq: fr });
        }
        t += 4 * beat;
      }
      return notes;
    }
  },

  {
    id: "carmen-tolead",
    title: "카르멘 - 투우사의 노래 (Toreador Song)",
    composer: "Georges Bizet",
    genre: "Arcade Carnival Beat",
    bpm: 144,
    difficulty: "Normal",
    stars: "★★★",
    badge: "리드미컬 행진",
    durationSec: 64,
    description: "오페라 카르멘의 웅장한 투우사의 행진곡! 어깨가 들썩이는 아케이드 브라스 댄스 믹스",
    generateChartAndAudio: function(sound, startT) {
      const notes = [];
      const beat = 60 / this.bpm;
      const sixteenth = beat / 4;
      const eighth = beat / 2;
      let t = startT + 0.8;

      const toreador = [
        F.F4, F.F4, F.F4, F.A4, F.C5, F.Bb4, F.A4, F.G4,
        F.C4, F.C4, F.C4, F.E4, F.G4, F.F4, F.E4, F.D4,
        F.F4, F.A4, F.C5, F.F5, F.E5, F.D5, F.C5, F.Bb4
      ];

      for (let m = 0; m < 26; m++) {
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          sound.scheduleKick(bt);
          if (b % 2 === 1) sound.scheduleSnare(bt);
          sound.scheduleHihat(bt, false);
          sound.scheduleHihat(bt + eighth, true);
          sound.scheduleBassNote(F.F3, bt, beat * 0.7);
        }

        for (let s = 0; s < 8; s++) {
          const nt = t + s * eighth;
          const fr = toreador[(m * 4 + s) % toreador.length];
          sound.scheduleLeadNote(fr, nt, eighth * 0.85);

          const lane = [0, 1, 2, 3, 2, 1, 0, 3][s % 8];
          notes.push({ time: nt, lane: lane, freq: fr });

          if (s === 3 || s === 7) {
            notes.push({ time: nt + sixteenth, lane: (lane + 1) % 4, freq: fr });
          }
        }
        t += 4 * beat;
      }
      return notes;
    }
  }
];

window.SoundEngine = SoundEngine;
window.SONGS = SONGS;
