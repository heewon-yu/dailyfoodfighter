/**
 * Beat Classic - Audio & Dynamic Chart Engine
 * 20 Studio-Master MP3 Tracks (10 Classical + 10 Electronic/Arcade)
 * Long Notes (Hold Notes) + Max 2 Simultaneous Touches (Thumb Optimized)
 * Song-Specific Hit Sound System (Acoustic Piano, 808/909 EDM, Orchestral Timpani)
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isAudioPlaying = false;
    this.activeHoldOscs = [null, null, null, null];
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(15, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.95, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  playRealAudio(audioUrl, onReady) {
    this.init();
    this.resume();

    this.audioElement.pause();
    this.audioElement.src = audioUrl;
    this.audioElement.currentTime = 0;
    this.isAudioPlaying = true;

    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (onReady) onReady();
      }).catch(err => {
        console.warn('Playback error or policy:', err);
        if (onReady) onReady();
      });
    }
  }

  getAudioCurrentTime() {
    if (this.audioElement && this.isAudioPlaying) {
      return this.audioElement.currentTime;
    }
    return 0;
  }

  pauseAudio() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.isAudioPlaying = false;
    }
    this.stopAllHoldSounds();
  }

  resumeAudio() {
    if (this.audioElement) {
      this.audioElement.play();
      this.isAudioPlaying = true;
    }
  }

  stopAll() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isAudioPlaying = false;
    }
    this.stopAllHoldSounds();
  }

  /**
   * Song-Specific Sound Effect Engine
   * Generates authentic instrument strikes matching each song type
   */
  playHitSound(lane = 0, songStyle = 'PIANO', basePitch = 523.25) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (songStyle === 'PIANO') {
      // Acoustic Classical Piano Strike: Multi-harmonic hammer attack
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const pitches = [basePitch, basePitch * 1.25, basePitch * 1.5, basePitch * 2.0];
      const p = pitches[lane % 4];

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(p, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(p * 2, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.compressor);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.12);
      osc2.stop(now + 0.12);

    } else if (songStyle === 'ELECTRONIC') {
      // 808/909 Electronic Arcade Drum & Synth Punch
      if (lane === 0 || lane === 3) {
        // Punchy 808 Kick / Sub-bass
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.frequency.setValueAtTime(160, now);
        kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

        kickGain.gain.setValueAtTime(0.5, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        kickOsc.connect(kickGain);
        kickGain.connect(this.compressor);
        kickOsc.start(now);
        kickOsc.stop(now + 0.1);
      } else {
        // Crispy Electro Clap / Snare Pluck
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.06, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(1800, now);
        noiseFilter.Q.setValueAtTime(3.0, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        whiteNoise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.compressor);
        whiteNoise.start(now);
      }
    } else {
      // ORCHESTRAL: Heavy Timpani & Brass Chord Hit
      const timpOsc = this.ctx.createOscillator();
      const timpGain = this.ctx.createGain();
      timpOsc.type = 'sine';
      timpOsc.frequency.setValueAtTime(110 + lane * 30, now);
      timpOsc.frequency.exponentialRampToValueAtTime(60, now + 0.15);

      timpGain.gain.setValueAtTime(0.45, now);
      timpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      timpOsc.connect(timpGain);
      timpGain.connect(this.compressor);
      timpOsc.start(now);
      timpOsc.stop(now + 0.16);
    }
  }

  startHoldSound(lane = 0) {
    if (!this.ctx) return;
    this.stopHoldSound(lane);

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const pitches = [220, 277.18, 329.63, 440];
    osc.frequency.setValueAtTime(pitches[lane % 4], now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);

    gain.gain.setValueAtTime(0.12, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);

    this.activeHoldOscs[lane] = { osc, gain };
  }

  stopHoldSound(lane = 0) {
    if (this.activeHoldOscs[lane]) {
      const { osc, gain } = this.activeHoldOscs[lane];
      if (this.ctx) {
        const now = this.ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        setTimeout(() => {
          try { osc.stop(); } catch(e) {}
        }, 50);
      }
      this.activeHoldOscs[lane] = null;
    }
  }

  stopAllHoldSounds() {
    for (let i = 0; i < 4; i++) {
      this.stopHoldSound(i);
    }
  }
}

/**
 * Dynamic Procedural Chart Generator
 * - STRICT RULE: Maximum 2 simultaneous notes at any moment (Thumb ergonomics)
 * - LONG NOTES (Hold Notes): Sustained key holds on one hand while other hand taps
 * - Dynamic pattern generator with Staircase, Trill, Alternating, and Hold Combos
 */
function generateDynamicChart(bpm, durationSec, difficultyLevel, startTime = 0.5) {
  const notes = [];
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const sixteenth = beat / 4;

  let currentT = startTime;
  let lastLane = Math.floor(Math.random() * 4);
  let activeHoldEnd = [0, 0, 0, 0]; // Track end time of active hold in each lane

  const totalMeasures = Math.floor((durationSec - startTime) / (4 * beat));
  const density = difficultyLevel; // 1 to 5

  for (let m = 0; m < totalMeasures; m++) {
    // 1. Chance to spawn Long Note (Hold Note)
    const canSpawnHold = density >= 2 && Math.random() < 0.45;
    let holdLane = -1;

    if (canSpawnHold) {
      holdLane = Math.random() < 0.5 ? 0 : 3; // Put hold on outer lanes for thumb stability
      const holdDuration = beat * (1.5 + Math.floor(Math.random() * 3)); // 1.5 to 3.5 beats
      activeHoldEnd[holdLane] = currentT + holdDuration;

      notes.push({
        time: currentT,
        lane: holdLane,
        duration: holdDuration,
        isLong: true
      });
    }

    // 2. Measure Pattern Mode
    const patternMode = Math.floor(Math.random() * 5);

    // Strict Rule: If no hold is active, allow max 1 double chord at start of measure
    const isHoldActiveNow = activeHoldEnd.some(t => t > currentT);
    if (!isHoldActiveNow && density >= 3 && Math.random() < 0.35) {
      const chordPair = Math.random() < 0.5 ? [0, 3] : [1, 2];
      notes.push({ time: currentT, lane: chordPair[0] });
      notes.push({ time: currentT, lane: chordPair[1] });
    }

    if (patternMode === 0) {
      // Staircase (계단)
      const count = (density >= 4 && m % 2 === 1) ? 6 : 4;
      const sub = (density >= 4 && m % 2 === 1) ? sixteenth : eighth;

      for (let i = 0; i < count; i++) {
        const t = currentT + i * sub;
        // Find available lanes not currently held
        const freeLanes = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (freeLanes.length > 0) {
          const lane = freeLanes[i % freeLanes.length];
          // Ensure max 2 notes at this timestamp
          const countAtT = notes.filter(n => Math.abs(n.time - t) < 0.04).length;
          if (countAtT < 2) {
            notes.push({ time: t, lane: lane });
          }
        }
      }
    } else if (patternMode === 1) {
      // Trill (트릴: 빠른 2건반 교차)
      const freeLanes = [0, 1, 2, 3].filter(l => currentT >= activeHoldEnd[l]);
      if (freeLanes.length >= 2) {
        const laneA = freeLanes[0];
        const laneB = freeLanes[1];
        const count = density >= 3 ? 5 : 3;

        for (let i = 0; i < count; i++) {
          const t = currentT + i * eighth;
          const lane = (i % 2 === 0) ? laneA : laneB;
          const countAtT = notes.filter(n => Math.abs(n.time - t) < 0.04).length;
          if (countAtT < 2) {
            notes.push({ time: t, lane: lane });
          }
        }
      }
    } else if (patternMode === 2) {
      // Melodic Tap Run with Hold Note interaction
      const step = eighth;
      for (let i = 0; i < 4; i++) {
        const t = currentT + i * step;
        const freeLanes = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (freeLanes.length > 0) {
          let nextLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
          if (nextLane === lastLane && freeLanes.length > 1) {
            nextLane = freeLanes.find(l => l !== lastLane) || nextLane;
          }
          const countAtT = notes.filter(n => Math.abs(n.time - t) < 0.04).length;
          if (countAtT < 2) {
            notes.push({ time: t, lane: nextLane });
            lastLane = nextLane;
          }
        }
      }
    } else {
      // Dynamic Organic Flow
      const count = density >= 4 ? 6 : (density >= 2 ? 4 : 3);
      const step = (4 * beat) / count;

      for (let i = 0; i < count; i++) {
        const t = currentT + i * step;
        const freeLanes = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (freeLanes.length > 0) {
          let nextLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
          const countAtT = notes.filter(n => Math.abs(n.time - t) < 0.04).length;
          if (countAtT < 2) {
            notes.push({ time: t, lane: nextLane });
            lastLane = nextLane;
          }
        }
      }
    }

    currentT += 4 * beat;
  }

  // Final check: Remove any accidental 3+ simultaneous notes
  const timeBuckets = new Map();
  const filteredNotes = [];

  notes.sort((a, b) => a.time - b.time);
  for (const n of notes) {
    const key = Math.round(n.time * 25); // 40ms bucket
    const currentCount = timeBuckets.get(key) || 0;
    if (currentCount < 2) {
      timeBuckets.set(key, currentCount + 1);
      filteredNotes.push(n);
    }
  }

  return filteredNotes;
}

// 20 Full Track Masterpieces (10 Classical + 10 Electronic/Arcade)
const SONGS = [
  // === CATEGORY 1: CLASSIC MASTERPIECES (10곡) ===
  {
    id: "canon-rock",
    category: "classic",
    title: "캐논 변주곡 (Canon in D)",
    composer: "J. Pachelbel",
    genre: "Classic Rock / O2Jam",
    audioFile: "./audio/canon.mp3",
    icon: "🎻",
    bpm: 132,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "입문 추천",
    durationSec: 72,
    soundStyle: "PIANO",
    basePitch: 587.33, // D5
    description: "세계에서 가장 사랑받는 캐논 선율! 경쾌한 피아노 록 그루브",
    generateChart: function(startTime = 0.8) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "turkish-march",
    category: "classic",
    title: "터키 행진곡 (Turkish March)",
    composer: "W. A. Mozart",
    genre: "Piano Sonata / O2Jam",
    audioFile: "./audio/turkish.mp3",
    icon: "🎹",
    bpm: 148,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "화려한 건반",
    durationSec: 70,
    soundStyle: "PIANO",
    basePitch: 440.0, // A4
    description: "모차르트 피아노 소나타의 경쾌한 론도! 펌프·오투잼 대표 테크니컬 건반",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "beethoven-virus",
    category: "classic",
    title: "베토벤 바이러스 (Beethoven Virus)",
    composer: "L. v. Beethoven / Pathétique",
    genre: "Speed Core / Pump Legend",
    audioFile: "./audio/pathetique.mp3",
    icon: "⚡",
    bpm: 162,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "초고속 폭타",
    durationSec: 72,
    soundStyle: "PIANO",
    basePitch: 523.25, // C5
    description: "비창 3악장의 폭발적인 드라이브! 펌프 잇 업을 상징하는 전설의 피아노 폭타",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "vivaldi-winter",
    category: "classic",
    title: "비발디 겨울 (Winter 1st Mvt)",
    composer: "A. Vivaldi",
    genre: "Symphonic Trance",
    audioFile: "./audio/winter.mp3",
    icon: "❄️",
    bpm: 140,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "질주하는 비트",
    durationSec: 68,
    soundStyle: "ORCHESTRAL",
    basePitch: 587.33, // D5
    description: "사계 '겨울' 1악장! 미 공군 밴드의 긴박한 현악 스타카토와 시원한 질주감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "flight-bumblebee",
    category: "classic",
    title: "왕벌의 비행 (Flight of the Bumblebee)",
    composer: "Rimsky-Korsakov",
    genre: "Speed Metal / Extreme",
    audioFile: "./audio/bumblebee.mp3",
    icon: "🐝",
    bpm: 174,
    difficulty: "Extreme",
    diffLevel: 5,
    stars: "★★★★★",
    badge: "손가락 한계",
    durationSec: 65,
    soundStyle: "PIANO",
    basePitch: 493.88, // B4
    description: "오투잼 전설의 초고속 반음계 연타! 174 BPM 극한 스피드 핑거 테크닉",
    generateChart: function(startTime = 0.5) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "fate-symphony",
    category: "classic",
    title: "운명 교향곡 (Symphony No.5)",
    composer: "L. v. Beethoven",
    genre: "Orchestra Classic Rock",
    audioFile: "./audio/fate.mp3",
    icon: "💥",
    bpm: 150,
    difficulty: "Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "강렬한 타격",
    durationSec: 70,
    soundStyle: "ORCHESTRAL",
    basePitch: 523.25, // C5
    description: "빠-빠-빠-빰! 세상을 뒤흔든 운명의 4음 모티브와 풀 오케스트라의 묵직한 타격감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "ode-to-joy",
    category: "classic",
    title: "환희의 송가 (Ode to Joy)",
    composer: "L. v. Beethoven",
    genre: "Symphonic Brass Anthem",
    audioFile: "./audio/ode.mp3",
    icon: "🎺",
    bpm: 136,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "신나는 리듬",
    durationSec: 59,
    soundStyle: "ORCHESTRAL",
    basePitch: 587.33, // D5
    description: "베토벤 9번 교향곡의 벅찬 환희를 담은 미 해군 관악단의 당당한 브라스 행진",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "new-world",
    category: "classic",
    title: "신세계 교향곡 4악장 (New World)",
    composer: "A. Dvořák",
    genre: "Symphonic Power",
    audioFile: "./audio/new_world.mp3",
    icon: "🌋",
    bpm: 152,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "웅장한 대서사",
    durationSec: 70,
    soundStyle: "ORCHESTRAL",
    basePitch: 659.25, // E5
    description: "드보르자크 교향곡 9번 4악장! 웅장한 브라스 팡파르와 폭풍처럼 쏟아지는 건반 노트",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "air-g-string",
    category: "classic",
    title: "G선상의 아리아 (Air on G String)",
    composer: "J. S. Bach",
    genre: "String Orchestra / Chill",
    audioFile: "./audio/air.mp3",
    icon: "🕊️",
    bpm: 118,
    difficulty: "Easy",
    diffLevel: 1,
    stars: "★☆☆",
    badge: "힐링 앤 그루브",
    durationSec: 70,
    soundStyle: "PIANO",
    basePitch: 587.33, // D5
    description: "미 공군 현악단의 맑고 청아한 선율! 우아한 바흐 명작과 잔잔한 롱노트 그루브",
    generateChart: function(startTime = 0.8) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "carmen-tolead",
    category: "classic",
    title: "카르멘 - 투우사의 노래 (Toreador)",
    composer: "G. Bizet",
    genre: "Opera March / Arcade",
    audioFile: "./audio/carmen.mp3",
    icon: "🚩",
    bpm: 144,
    difficulty: "Normal",
    diffLevel: 3,
    stars: "★★★",
    badge: "리드미컬 행진",
    durationSec: 70,
    soundStyle: "ORCHESTRAL",
    basePitch: 698.46, // F5
    description: "오페라 카르멘의 대표 행진곡! 어깨가 들썩이는 위풍당당한 아케이드 행진 선율",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  // === CATEGORY 2: ARCADE & ELECTRONIC LEGENDS (10곡) ===
  {
    id: "chaoz-fantasy",
    category: "arcade",
    title: "Chaoz Fantasy",
    composer: "ParagonX9",
    genre: "Flash / O2Jam Anthem",
    audioFile: "./audio/chaoz_fantasy.mp3",
    icon: "🔥",
    bpm: 160,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "리듬 레전드",
    durationSec: 70,
    soundStyle: "PIANO",
    basePitch: 523.25,
    description: "플래시 및 오투잼·스텝매니아를 풍미한 전설의 명곡! 감성적인 피아노 멜로디와 스피디 비트",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "unity-thefatrat",
    category: "arcade",
    title: "Unity",
    composer: "TheFatRat",
    genre: "Gaming EDM Anthem",
    audioFile: "./audio/unity.mp3",
    icon: "👑",
    bpm: 105,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "전세계 히트",
    durationSec: 75,
    soundStyle: "ELECTRONIC",
    basePitch: 440.0,
    description: "전 세계 게이머들의 심장을 울린 레전드 EDM! 중독적인 신스 리프와 폭발적인 드롭",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "electroman-adventures",
    category: "arcade",
    title: "Electroman Adventures V3",
    composer: "Waterflame",
    genre: "Chiptune Electro / GD",
    audioFile: "./audio/electroman.mp3",
    icon: "🕹️",
    bpm: 145,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "질주 칩튠",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 523.25,
    description: "지오메트리 대시를 뒤흔든 워터플레임의 역작! 짜릿한 8비트 아케이드 신스와 롤러코스터 질주",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "nova-env",
    category: "arcade",
    title: "Nova",
    composer: "EnV",
    genre: "Melodic Trance / Arcade",
    audioFile: "./audio/nova.mp3",
    icon: "🌌",
    bpm: 150,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "감성 트랜스",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 587.33,
    description: "오투잼 감성의 아련하고 아름다운 멜로딕 트랜스! 밤하늘을 수놓는 별빛 같은 신스 멜로디",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "outbreaker-hinkik",
    category: "arcade",
    title: "Outbreaker",
    composer: "Hinkik",
    genre: "Glitch Hop / Bass",
    audioFile: "./audio/outbreaker.mp3",
    icon: "💥",
    bpm: 128,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "육중한 베이스",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 440.0,
    description: "묵직한 글리치합 드럼과 화려한 컷팅 신스! 디제이맥스 클럽 스테이지에 온 듯한 강렬한 타격감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "skystrike-hinkik",
    category: "arcade",
    title: "Skystrike",
    composer: "Hinkik",
    genre: "Arcade Dance / High-Speed",
    audioFile: "./audio/skystrike.mp3",
    icon: "🚀",
    bpm: 140,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "하늘 질주",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 523.25,
    description: "구름 위를 가르는 듯한 벅찬 신스 멜로디와 쾌속 질주감! 롱노트와 계단 배치가 어우러진 명곡",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "ping-exyl",
    category: "arcade",
    title: "Ping",
    composer: "Exyl",
    genre: "Chiptune Glitch Pop",
    audioFile: "./audio/ping.mp3",
    icon: "📡",
    bpm: 130,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "통통 튀는 핑",
    durationSec: 68,
    soundStyle: "ELECTRONIC",
    basePitch: 587.33,
    description: "유튜브와 틱톡을 강타한 천재 비트메이커 Exyl의 핑 사운드! 톡톡 튀는 건반 타격감의 정점",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "chaoz-airflow",
    category: "arcade",
    title: "Chaoz Airflow",
    composer: "ParagonX9",
    genre: "Speed D&B / Piano Solo",
    audioFile: "./audio/chaoz_airflow.mp3",
    icon: "🌪️",
    bpm: 155,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "피아노 질주",
    durationSec: 70,
    soundStyle: "PIANO",
    basePitch: 523.25,
    description: "초고속 드럼앤베이스 위에 수놓는 유려한 피아노 솔로! 디맥 피아노 솔로곡을 연상시키는 쾌감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "never-letting-go",
    category: "arcade",
    title: "Never Letting Go",
    composer: "Exyl",
    genre: "Melodic Electro Pop",
    audioFile: "./audio/never_letting_go.mp3",
    icon: "💖",
    bpm: 128,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "감성 멜로디",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 440.0,
    description: "신나면서도 감미로운 멜로디 라인! 초보자도 쉽게 즐길 수 있는 경쾌한 아케이드 댄스",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "wicked-avenza",
    category: "arcade",
    title: "Wicked",
    composer: "Avenza",
    genre: "Electro House / Club Mix",
    audioFile: "./audio/wicked.mp3",
    icon: "👿",
    bpm: 135,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "클럽 바운스",
    durationSec: 70,
    soundStyle: "ELECTRONIC",
    basePitch: 523.25,
    description: "디제이맥스 아케이드의 클럽 바운스 감성! 터프한 베이스 드롭과 손맛 넘치는 4키 리듬",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  }
];

window.SoundEngine = SoundEngine;
window.SONGS = SONGS;
