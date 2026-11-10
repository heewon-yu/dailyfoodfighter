/**
 * Beat Classic - Audio & Dynamic Chart Engine
 * 20 Studio-Master MP3 Tracks (5 Classical Masters + 15 O2Jam/Pump/EDM Legends)
 * Clean Mechanical Arcade Keypad Click (Zero Musical Pitch Collision)
 * Long Notes (Hold Notes) + Max 2 Simultaneous Touches (Thumb Optimized)
 * Relaxed Ergonomic Hit Windows for 2-Thumb Mobile Play
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isAudioPlaying = false;
    this.keySoundEnabled = true;
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
  }

  startHoldSound(lane) {}
  stopHoldSound(lane) {}
  stopAllHoldSounds() {}

  /**
   * Crisp Mechanical Arcade Keypad Click
   * - Pure transient physical microswitch click (NO synthetic oscillators or clashing pitches)
   * - Perfectly blends with studio BGM without muddying the music
   */
  playHitSound(lane = 0, volume = 0.45) {
    if (!this.ctx || !this.keySoundEnabled) return;
    const now = this.ctx.currentTime;

    try {
      // 1. Ultra-short high-passed transient noise impulse (mechanical switch click)
      const bufferLen = Math.floor(this.ctx.sampleRate * 0.012); // 12ms
      const noiseBuffer = this.ctx.createBuffer(1, bufferLen, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLen; i++) {
        // Fast exponential decay
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.0018));
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(3400, now);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(volume * 0.35, now);

      noiseSource.connect(hpFilter);
      hpFilter.connect(clickGain);
      clickGain.connect(this.masterGain);
      noiseSource.start(now);

      // 2. Subtle low-mid acoustic rim tap (gives tactile weight without pitch collision)
      const tapOsc = this.ctx.createOscillator();
      const tapGain = this.ctx.createGain();
      tapOsc.type = 'sine';
      tapOsc.frequency.setValueAtTime(420 + (lane % 2) * 40, now);
      tapOsc.frequency.exponentialRampToValueAtTime(110, now + 0.022);

      tapGain.gain.setValueAtTime(volume * 0.22, now);
      tapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

      tapOsc.connect(tapGain);
      tapGain.connect(this.masterGain);

      tapOsc.start(now);
      tapOsc.stop(now + 0.025);
    } catch (e) {
      // Ignore audio glitches safely
    }
  }

  playHoldTick(lane = 0) {
    if (!this.ctx || !this.keySoundEnabled) return;
    const now = this.ctx.currentTime;
    try {
      // Gentle electric spark tick during hold notes
      const tickOsc = this.ctx.createOscillator();
      const tickGain = this.ctx.createGain();
      tickOsc.type = 'triangle';
      tickOsc.frequency.setValueAtTime(880, now);
      tickGain.gain.setValueAtTime(0.08, now);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      tickOsc.connect(tickGain);
      tickGain.connect(this.masterGain);
      tickOsc.start(now);
      tickOsc.stop(now + 0.018);
    } catch(e) {}
  }
}

/**
 * Procedural Dynamic Rhythm Chart Generator
 * - STRICT RULE 1: Maximum 2 simultaneous notes at any moment (Thumb Ergonomics)
 * - STRICT RULE 2: Natural musical flow (locked to 1/4 quarter notes & 1/8 eighth notes)
 * - RELAXED DIFFICULTY: Reduced note density, no impossible finger-trap spam
 * - LONG NOTES: Natural phrase-sustained hold notes on outer lanes
 */
function generateDynamicChart(bpm, durationSec, diffLevel = 2, startTime = 0.6) {
  const notes = [];
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const sixteenth = beat / 4;

  let currentT = startTime;
  let activeHoldEnd = [0, 0, 0, 0];

  const totalMeasures = Math.floor((durationSec - startTime - 1.5) / (4 * beat));
  const density = Math.min(4, Math.max(1, diffLevel)); // Relaxed density clamp (1 to 4)

  for (let m = 0; m < totalMeasures; m++) {
    const measureStart = currentT;

    // 1. Long Note (Hold Note) placement
    // Allowed every 3-4 measures on outer lanes (0 or 3)
    const canSpawnHold = density >= 2 && m % 3 === 1 && Math.random() < 0.6;
    let holdLane = -1;

    if (canSpawnHold) {
      holdLane = Math.random() < 0.5 ? 0 : 3;
      const holdDuration = beat * (density === 1 ? 1.5 : 2.0);
      activeHoldEnd[holdLane] = measureStart + holdDuration;

      notes.push({
        time: measureStart,
        lane: holdLane,
        duration: holdDuration,
        isLong: true
      });
    }

    // 2. Downbeat note (Beat 1)
    const freeAtStart = [0, 1, 2, 3].filter(l => measureStart >= activeHoldEnd[l]);
    if (freeAtStart.length > 0) {
      // If density >= 3 and no active hold, occasionally spawn a comfortable 2-thumb chord
      if (density >= 3 && holdLane === -1 && m % 2 === 0 && Math.random() < 0.4) {
        notes.push({ time: measureStart, lane: 0 });
        notes.push({ time: measureStart, lane: 3 });
      } else {
        notes.push({ time: measureStart, lane: freeAtStart[m % freeAtStart.length] });
      }
    }

    // 3. Measure Sub-Pattern Generation
    // Pattern type based on difficulty
    const patternType = m % 4;

    if (density === 1) {
      // Easy: Gentle quarter-note pulse (1 note per beat)
      for (let b = 1; b < 4; b++) {
        const t = measureStart + b * beat;
        const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (avail.length > 0) {
          notes.push({ time: t, lane: avail[(m + b) % avail.length] });
        }
      }
    } else if (density === 2) {
      // Normal: Quarter notes with occasional 8th note melody step
      for (let b = 1; b < 4; b++) {
        const t = measureStart + b * beat;
        const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (avail.length > 0) {
          notes.push({ time: t, lane: avail[(m * 2 + b) % avail.length] });
        }
        // Occasional off-beat melody tap
        if (b === 2 && Math.random() < 0.5) {
          const tHalf = t + eighth;
          const availHalf = [0, 1, 2, 3].filter(l => tHalf >= activeHoldEnd[l]);
          if (availHalf.length > 0) {
            notes.push({ time: tHalf, lane: availHalf[(m + 1) % availHalf.length] });
          }
        }
      }
    } else if (density >= 3) {
      // Hard / Very Hard: Melodic 8th note flows matching rhythm games
      if (patternType === 0) {
        // Staircase Flow (계단)
        const count = 4;
        for (let i = 1; i < count; i++) {
          const t = measureStart + i * eighth;
          const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
          if (avail.length > 0) {
            notes.push({ time: t, lane: avail[i % avail.length] });
          }
        }
        // Rest on beat 3, single note on beat 4
        const t4 = measureStart + 3 * beat;
        const avail4 = [0, 1, 2, 3].filter(l => t4 >= activeHoldEnd[l]);
        if (avail4.length > 0) {
          notes.push({ time: t4, lane: avail4[0] });
        }
      } else if (patternType === 1) {
        // Alternating Left-Right Trill (트릴 그루브)
        const trillLanes = [1, 2];
        for (let i = 1; i < 5; i++) {
          const t = measureStart + i * eighth;
          const lane = trillLanes[i % 2];
          if (t >= activeHoldEnd[lane]) {
            notes.push({ time: t, lane: lane });
          }
        }
      } else if (patternType === 2) {
        // Syncopated Dance Rhythm (엇박자 그루브)
        const offsets = [beat, beat + eighth, 2 * beat + eighth, 3 * beat];
        offsets.forEach((off, idx) => {
          const t = measureStart + off;
          const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
          if (avail.length > 0) {
            notes.push({ time: t, lane: avail[idx % avail.length] });
          }
        });
      } else {
        // Climax Stream (빠른 질주 - strictly max 2 notes)
        for (let b = 1; b < 4; b++) {
          const t = measureStart + b * beat;
          const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
          if (avail.length > 0) {
            notes.push({ time: t, lane: avail[(m + b) % avail.length] });
          }
          if (b === 1 || b === 3) {
            const tSub = t + eighth;
            const availSub = [0, 1, 2, 3].filter(l => tSub >= activeHoldEnd[l]);
            if (availSub.length > 0) {
              notes.push({ time: tSub, lane: availSub[(m + b + 1) % availSub.length] });
            }
          }
        }
      }
    }

    currentT += 4 * beat;
  }

  // Sort notes by timestamp
  notes.sort((a, b) => a.time - b.time);

  // Guarantee Strict Rule: NEVER more than 2 notes at any identical timestamp
  const sanitized = [];
  const timeBuckets = new Map();

  notes.forEach(n => {
    const bucketKey = Math.round(n.time * 50); // 20ms bucket
    const currentInBucket = timeBuckets.get(bucketKey) || [];
    if (currentInBucket.length < 2) {
      currentInBucket.push(n);
      timeBuckets.set(bucketKey, currentInBucket);
      sanitized.push(n);
    }
  });

  return sanitized;
}

/**
 * 20 Authentic Studio-Master Tracks
 * - 5 Classical Rhythm Masterpieces (Canon, Turkish, Beethoven Virus, Winter, Bumblebee)
 * - 15 O2Jam / Pump It Up / Rhythm Game Legends
 */
const SONGS = [
  // ==========================================
  // CATEGORY 1: CLASSICAL MASTERS (5곡)
  // ==========================================
  {
    id: "canon-rock",
    category: "classic",
    title: "캐논 변주곡 (Canon in D)",
    composer: "J. Pachelbel",
    genre: "Classic Rock / O2Jam",
    audioFile: "./audio/canon.mp3",
    icon: "🎻",
    bpm: 132,
    difficulty: "Easy",
    diffLevel: 1,
    stars: "★☆☆",
    badge: "입문 추천",
    durationSec: 60,
    description: "세계에서 가장 친숙한 캐논 멜로디! 경쾌한 두 대의 피아노 그루브 완곡",
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
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "명품 건반",
    durationSec: 112,
    description: "모차르트 피아노 소나타의 경쾌한 론도! 펌프·오투잼 대표 테크니컬 건반 완곡",
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
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "펌프 레전드",
    durationSec: 67,
    description: "비창 3악장의 폭발적인 드라이브! 펌프 잇 업을 상징하는 전설의 피아노 테마",
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
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "시원한 질주",
    durationSec: 98,
    description: "사계 '겨울' 1악장! 미 공군 현악단의 긴박한 바이올린 스타카토와 질주감",
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
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "초고속 완곡",
    durationSec: 41,
    description: "오투잼 전설의 초고속 반음계 연타! 174 BPM 극한 스피드 핑거 테크닉 완곡",
    generateChart: function(startTime = 0.5) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  // ==========================================
  // CATEGORY 2: O2JAM & PUMP & EDM LEGENDS (15곡)
  // ==========================================
  {
    id: "chaoz-fantasy",
    category: "arcade",
    title: "Chaoz Fantasy",
    composer: "ParagonX9",
    genre: "Flash / O2Jam Legend",
    audioFile: "./audio/chaoz_fantasy.mp3",
    icon: "🔥",
    bpm: 160,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "오투잼 감성",
    durationSec: 67,
    description: "플래시 및 오투잼 시대를 풍미한 불후의 명곡! 감성적인 피아노와 스피디 비트",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "chaoz-airflow",
    category: "arcade",
    title: "Chaoz Airflow",
    composer: "ParagonX9",
    genre: "Speed Piano / Breakbeat",
    audioFile: "./audio/chaoz_airflow.mp3",
    icon: "🌪️",
    bpm: 150,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "피아노 질주",
    durationSec: 126,
    description: "Chaoz 시리즈의 서막! 화려한 피아노 아르페지오와 브레이크비트의 질주",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "chaoz-impact",
    category: "arcade",
    title: "Chaoz Impact",
    composer: "ParagonX9",
    genre: "Breakcore / Extreme Beat",
    audioFile: "./audio/chaoz_impact.mp3",
    icon: "💥",
    bpm: 175,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "Chaoz 완결작",
    durationSec: 58,
    description: "ParagonX9 전설의 Chaoz 3부작 최종 완성작! 175 BPM 강력한 드럼비트 폭격",
    generateChart: function(startTime = 0.5) {
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
    difficulty: "Easy",
    diffLevel: 1,
    stars: "★☆☆",
    badge: "전세계 히트",
    durationSec: 124,
    description: "전 세계 게이머들의 가슴을 뛰게 한 레전드 EDM! 중독적인 신스 리프와 시원한 드롭",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "electroman-adventures",
    category: "arcade",
    title: "Electroman Adventures",
    composer: "Waterflame",
    genre: "Chiptune Electro / GD",
    audioFile: "./audio/electroman.mp3",
    icon: "🕹️",
    bpm: 145,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "8비트 신스",
    durationSec: 125,
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
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "감성 멜로디",
    durationSec: 95,
    description: "오투잼 감성의 아련하고 아름다운 멜로딕 트랜스! 밤하늘을 수놓는 별빛 같은 선율",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "ping-exyl",
    category: "arcade",
    title: "Ping!",
    composer: "Exyl",
    genre: "Electro Funk / Bass",
    audioFile: "./audio/ping.mp3",
    icon: "🔔",
    bpm: 128,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "찰진 타격감",
    durationSec: 81,
    description: "오락실 핑 사운드와 슬랩베이스의 중독적 그루브! 입에 착착 달라붙는 리드미컬 펀치",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "never-letting-go",
    category: "arcade",
    title: "Never Letting Go",
    composer: "Exyl",
    genre: "Melodic Synthwave",
    audioFile: "./audio/never_letting_go.mp3",
    icon: "🚀",
    bpm: 128,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "벅찬 감동",
    durationSec: 108,
    description: "청량감 넘치는 보컬 찹과 레트로 신스웨이브 비트! 질주하는 고속도로 드라이브 사운드",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "skystrike-hinkik",
    category: "arcade",
    title: "Skystrike",
    composer: "Hinkik",
    genre: "Euphoric Electro",
    audioFile: "./audio/skystrike.mp3",
    icon: "🌠",
    bpm: 128,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "슈퍼 드롭",
    durationSec: 105,
    description: "하늘을 찌를 듯 솟구치는 유포릭 신스 리드! 오락실 스피커를 터뜨리는 초강력 베이스",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "outbreaker-hinkik",
    category: "arcade",
    title: "Outbreaker",
    composer: "Hinkik",
    genre: "Complextro / Hardcore",
    audioFile: "./audio/outbreaker.mp3",
    icon: "🌋",
    bpm: 128,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "헤비 드라이브",
    durationSec: 108,
    description: "거침없이 쪼개지는 컴플렉스트로 글리치와 폭발적인 드롭! 헤비한 아케이드 킥",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "wicked-avenza",
    category: "arcade",
    title: "Wicked",
    composer: "Avenza",
    genre: "Electro Swing / Glitch",
    audioFile: "./audio/wicked.mp3",
    icon: "🎩",
    bpm: 128,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "스윙 그루브",
    durationSec: 110,
    description: "1930년대 빈티지 재즈 브라스와 현대 글리치합의 만남! 신나게 튀어 오르는 스윙 리듬",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "final-phase",
    category: "arcade",
    title: "The Final Phase",
    composer: "Deemo-R",
    genre: "Speedcore / Boss Theme",
    audioFile: "./audio/final_phase.mp3",
    icon: "⚔️",
    bpm: 175,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "보스 테마",
    durationSec: 175,
    description: "오투잼·디맥 최상위 보스곡 감성! 175 BPM 긴박하게 몰아치는 스피드코어의 절정",
    generateChart: function(startTime = 0.5) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "synergetic-enigma",
    category: "arcade",
    title: "Synergetic Enigma",
    composer: "Dan Johansen",
    genre: "Cyberpunk Synthmetal",
    audioFile: "./audio/synergetic.mp3",
    icon: "🦾",
    bpm: 140,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "전자기타 리프",
    durationSec: 133,
    description: "사이버펑크 전자기타 리프와 펌프 스타일 신스비트! 어두운 미래 도시를 달리는 헤비 메탈",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "apoplexy-beehunter",
    category: "arcade",
    title: "Apoplexy",
    composer: "Beehunter",
    genre: "Drum & Bass / 180 BPM",
    audioFile: "./audio/apoplexy.mp3",
    icon: "⚡",
    bpm: 180,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "180 D&B",
    durationSec: 70,
    description: "180 BPM 초고속 드럼앤베이스 & 브레이크코어 리듬의 정수! 숨 쉴 틈 없는 비트 폭타",
    generateChart: function(startTime = 0.5) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },
  {
    id: "level-five",
    category: "arcade",
    title: "Level Five",
    composer: "DJ Striden",
    genre: "Hands-Up / Euro Dance",
    audioFile: "./audio/level_five.mp3",
    icon: "🎉",
    bpm: 140,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "신나는 댄스",
    durationSec: 105,
    description: "경쾌하고 신나는 오락실 핸즈업 유로댄스! 누구나 어깨를 들썩이게 만드는 건반 멜로디",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  }
];
