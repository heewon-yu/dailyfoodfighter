/**
 * Beat Classic - Audio & High-Precision Beat-Sync Chart Engine
 * 20 Authentic Studio-Master Tracks (5 Classical Masters + 15 O2Jam/Pump/EDM Legends)
 * PURE AUDIO ONLY: Hit sound effects completely removed as requested
 * High-Precision Hybrid Clock with Sub-Millisecond Interpolation
 * Exact Beat-Onset Quantized Procedural Charts
 */

class SoundEngine {
  constructor() {
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    // User feedback: volume was too loud, lower overall default volume
    const savedVol = typeof localStorage !== 'undefined' ? localStorage.getItem('beat_classic_volume') : null;
    this.masterVolume = savedVol !== null ? parseInt(savedVol, 10) / 100 : 0.45;
    this.audioElement.volume = this.masterVolume;
    this.isAudioPlaying = false;
    this.lastAudioTime = 0;
    this.lastAudioUpdate = 0;
    this.audioStartTime = 0;
  }

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.audioElement) {
      this.audioElement.volume = this.masterVolume;
    }
  }

  getMasterVolume() {
    return this.masterVolume;
  }

  init() {
    // Audio engine initialized
  }

  resume() {
    return Promise.resolve();
  }

  playRealAudio(audioUrl, onReady) {
    this.audioElement.pause();
    this.audioElement.src = audioUrl;
    this.audioElement.currentTime = 0;
    this.audioElement.volume = this.masterVolume;
    this.isAudioPlaying = false;
    this.lastAudioTime = 0;
    this.lastAudioUpdate = performance.now();

    const handlePlaying = () => {
      this.isAudioPlaying = true;
      this.lastAudioTime = this.audioElement.currentTime;
      this.lastAudioUpdate = performance.now();
      this.audioElement.removeEventListener('playing', handlePlaying);
      if (onReady) onReady();
    };

    this.audioElement.addEventListener('playing', handlePlaying);

    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Playback error or policy:', err);
        this.isAudioPlaying = true;
        this.lastAudioUpdate = performance.now();
        if (onReady) onReady();
      });
    }
  }

  /**
   * Continuous Sub-Millisecond Hybrid Clock
   * Combines audio hardware timestamps with high-resolution performance.now()
   * Prevents standard HTML5 Audio 100~250ms timestamp stuttering
   */
  getAudioCurrentTime() {
    if (!this.isAudioPlaying) return 0;
    const now = performance.now();
    const rawTime = this.audioElement.currentTime;

    if (rawTime !== this.lastAudioTime) {
      this.lastAudioTime = rawTime;
      this.lastAudioUpdate = now;
    }

    const delta = (now - this.lastAudioUpdate) / 1000;
    return rawTime + Math.min(0.25, Math.max(0, delta));
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
      this.lastAudioTime = this.audioElement.currentTime;
      this.lastAudioUpdate = performance.now();
    }
  }

  stopAll() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isAudioPlaying = false;
    }
  }

  // Hit sound effects completely disabled as requested (Pure studio music only)
  playHitSound(lane = 0) {}
  playHoldTick(lane = 0) {}
  startHoldSound(lane = 0) {}
  stopHoldSound(lane = 0) {}
  stopAllHoldSounds() {}
}

/**
 * Procedural Dynamic Rhythm Chart Generator
 * - Exact Beat-Grid Alignment: Every note falls on (startOnset + m * measure + b * beat)
 * - STRICT RULE: Maximum 2 simultaneous notes at any moment (Thumb Ergonomics)
 * - NATURAL DENSITY: 1/4 quarter notes with 1/8 off-beat melody touches
 * - LONG NOTES: Natural phrase-sustained hold notes on outer lanes
 */
function generateDynamicChart(bpm, durationSec, diffLevel = 2, firstOnset = 0.2) {
  const notes = [];
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const measure = 4 * beat;

  // Calculate lead-in so notes start after 1 clean musical bar and >= 1.6s
  let introBars = 1;
  while ((firstOnset + introBars * measure) < 1.6) {
    introBars++;
  }
  const startTime = firstOnset + introBars * measure;

  let activeHoldEnd = [0, 0, 0, 0];
  const totalMeasures = Math.floor((durationSec - startTime - 2.0) / measure);
  const density = Math.min(4, Math.max(1, diffLevel));

  for (let m = 0; m < totalMeasures; m++) {
    const measureStart = startTime + m * measure;

    // 1. Long Note (Hold Note) placement every 3 measures
    const canSpawnHold = density >= 2 && m % 3 === 1 && Math.random() < 0.6;
    let holdLane = -1;

    if (canSpawnHold) {
      holdLane = (m % 2 === 0) ? 0 : 3;
      const holdDuration = beat * (density === 1 ? 1.5 : 2.0);
      activeHoldEnd[holdLane] = measureStart + holdDuration;

      notes.push({
        time: measureStart,
        lane: holdLane,
        duration: holdDuration,
        isLong: true
      });
    }

    // 2. Beat 1 (Downbeat): Strong note or 2-thumb chord
    const freeAtStart = [0, 1, 2, 3].filter(l => measureStart >= activeHoldEnd[l]);
    if (freeAtStart.length > 0) {
      if (density >= 3 && holdLane === -1 && m % 2 === 0 && Math.random() < 0.45) {
        notes.push({ time: measureStart, lane: 0 });
        notes.push({ time: measureStart, lane: 3 });
      } else {
        notes.push({ time: measureStart, lane: freeAtStart[m % freeAtStart.length] });
      }
    }

    // 3. Beats 2, 3, 4: Musical Melody Pattern
    const patternType = m % 4;

    if (density === 1) {
      // Easy: Quarter-note pulse
      for (let b = 1; b < 4; b++) {
        const t = measureStart + b * beat;
        const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (avail.length > 0) {
          notes.push({ time: t, lane: avail[(m + b) % avail.length] });
        }
      }
    } else if (density === 2) {
      // Normal: Quarter notes with melodic eighth note step
      for (let b = 1; b < 4; b++) {
        const t = measureStart + b * beat;
        const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
        if (avail.length > 0) {
          notes.push({ time: t, lane: avail[(m * 2 + b) % avail.length] });
        }
        if (b === 2 && Math.random() < 0.55) {
          const tHalf = t + eighth;
          const availHalf = [0, 1, 2, 3].filter(l => tHalf >= activeHoldEnd[l]);
          if (availHalf.length > 0) {
            notes.push({ time: tHalf, lane: availHalf[(m + 1) % availHalf.length] });
          }
        }
      }
    } else {
      // Hard / Very Hard: Melodic flows matching rhythm games
      if (patternType === 0) {
        // Staircase Flow
        for (let i = 1; i < 4; i++) {
          const t = measureStart + i * eighth;
          const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
          if (avail.length > 0) {
            notes.push({ time: t, lane: avail[i % avail.length] });
          }
        }
        const t4 = measureStart + 3 * beat;
        const avail4 = [0, 1, 2, 3].filter(l => t4 >= activeHoldEnd[l]);
        if (avail4.length > 0) {
          notes.push({ time: t4, lane: avail4[0] });
        }
      } else if (patternType === 1) {
        // Alternating Left-Right Trill
        const trillLanes = [1, 2];
        for (let i = 1; i < 5; i++) {
          const t = measureStart + i * eighth;
          const lane = trillLanes[i % 2];
          if (t >= activeHoldEnd[lane]) {
            notes.push({ time: t, lane: lane });
          }
        }
      } else if (patternType === 2) {
        // Syncopated Dance Rhythm
        const offsets = [beat, beat + eighth, 2 * beat + eighth, 3 * beat];
        offsets.forEach((off, idx) => {
          const t = measureStart + off;
          const avail = [0, 1, 2, 3].filter(l => t >= activeHoldEnd[l]);
          if (avail.length > 0) {
            notes.push({ time: t, lane: avail[idx % avail.length] });
          }
        });
      } else {
        // Climax Stream (strictly max 2 notes)
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
  }

  // Sort notes by timestamp
  notes.sort((a, b) => a.time - b.time);

  // Guarantee: STRICTLY max 2 notes at any identical timestamp
  const sanitized = [];
  const timeBuckets = new Map();

  notes.forEach(n => {
    const bucketKey = Math.round(n.time * 40); // 25ms bucket
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
 * With verified beat onset timestamps and calibrated durations
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
    durationSec: 120,
    firstOnset: 0.72,
    description: "세계에서 가장 친숙한 캐논 멜로디! 경쾌한 두 대의 피아노 그루브 완곡",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 225,
    firstOnset: 0.13,
    description: "모차르트 피아노 소나타의 경쾌한 론도! 펌프·오투잼 대표 테크니컬 건반 완곡",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 135,
    firstOnset: 0.38,
    description: "비창 3악장의 폭발적인 드라이브! 펌프 잇 업을 상징하는 전설의 피아노 테마",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 197,
    firstOnset: 1.68,
    description: "사계 '겨울' 1악장! 미 공군 현악단의 긴박한 바이올린 스타카토와 질주감",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 81,
    firstOnset: 0.69,
    description: "오투잼 전설의 초고속 반음계 연타! 174 BPM 극한 스피드 핑거 테크닉 완곡",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 133,
    firstOnset: 0.20,
    description: "플래시 및 오투잼 시대를 풍미한 불후의 명곡! 감성적인 피아노와 스피디 비트",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 252,
    firstOnset: 0.42,
    description: "Chaoz 시리즈의 서막! 화려한 피아노 아르페지오와 브레이크비트 질주",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 115,
    firstOnset: 0.05,
    description: "ParagonX9 전설의 Chaoz 3부작 최종 완성작! 175 BPM 강력한 드럼비트 폭격",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 249,
    firstOnset: 0.15,
    description: "전 세계 게이머들의 가슴을 뛰게 한 레전드 EDM! 중독적인 신스 리프와 시원한 드롭",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 251,
    firstOnset: 0.12,
    description: "지오메트리 대시를 뒤흔든 워터플레임의 역작! 짜릿한 8비트 아케이드 신스와 롤러코스터 질주",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 191,
    firstOnset: 0.08,
    description: "오투잼 감성의 아련하고 아름다운 멜로딕 트랜스! 밤하늘을 수놓는 별빛 같은 선율",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 162,
    firstOnset: 0.18,
    description: "오락실 핑 사운드와 슬랩베이스의 중독적 그루브! 입에 착착 달라붙는 리드미컬 펀치",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 215,
    firstOnset: 0.23,
    description: "청량감 넘치는 보컬 찹과 레트로 신스웨이브 비트! 질주하는 고속도로 드라이브 사운드",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 211,
    firstOnset: 0.21,
    description: "하늘을 찌를 듯 솟구치는 유포릭 신스 리드! 오락실 스피커를 터뜨리는 초강력 베이스",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 215,
    firstOnset: 0.26,
    description: "거침없이 쪼개지는 컴플렉스트로 글리치와 폭발적인 드롭! 헤비한 아케이드 킥",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 220,
    firstOnset: 0.04,
    description: "1930년대 빈티지 재즈 브라스와 현대 글리치합의 만남! 신나게 튀어 오르는 스윙 리듬",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 351,
    firstOnset: 0.05,
    description: "오투잼·디맥 최상위 보스곡 감성! 175 BPM 긴박하게 몰아치는 스피드코어의 절정",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 266,
    firstOnset: 0.37,
    description: "사이버펑크 전자기타 리프와 펌프 스타일 신스비트! 어두운 미래 도시를 달리는 헤비 메탈",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 140,
    firstOnset: 0.15,
    description: "180 BPM 초고속 드럼앤베이스 & 브레이크코어 리듬의 정수! 숨 쉴 틈 없는 비트 폭타",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
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
    durationSec: 210,
    firstOnset: 0.06,
    description: "경쾌하고 신나는 오락실 핸즈업 유로댄스! 누구나 어깨를 들썩이게 만드는 건반 멜로디",
    generateChart: function() {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, this.firstOnset);
    }
  }
];
