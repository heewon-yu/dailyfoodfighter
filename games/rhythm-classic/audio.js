/**
 * Beat Classic - Audio & Dynamic Chart Engine
 * Real Masterpiece Audio Tracks + Dynamic Procedural Anti-Memorization Rhythm Charts
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.isAudioPlaying = false;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.2, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  // Play Real Audio Track
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

  // DJMAX & O2Jam Style Mechanical Key Strike Sound
  playHitSound(lane = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Crisp Keycap Mechanical Click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1400, now);
    clickOsc.frequency.exponentialRampToValueAtTime(160, now + 0.035);

    clickGain.gain.setValueAtTime(0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    clickOsc.connect(clickGain);
    clickGain.connect(this.compressor);
    clickOsc.start(now);
    clickOsc.stop(now + 0.04);

    // 2. Resonant Chime Note
    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    const lanePitches = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(lanePitches[lane % 4], now);

    chimeGain.gain.setValueAtTime(0.22, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.compressor);
    chimeOsc.start(now);
    chimeOsc.stop(now + 0.09);
  }
}

/**
 * Dynamic Procedural Chart Generator
 * Generates fresh, non-repetitive musical note charts every play session
 * Uses musical motifs: Staggered runs, staircases, trills, double chords, jump jacks
 */
function generateDynamicChart(bpm, durationSec, difficultyLevel, startTime = 0.5) {
  const notes = [];
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const sixteenth = beat / 4;

  let currentT = startTime;
  let lastLane = Math.floor(Math.random() * 4);
  let streakCount = 0;

  // Number of measures
  const totalMeasures = Math.floor((durationSec - startTime) / (4 * beat));

  // Intensity factor based on difficulty (1: Easy, 2: Normal, 3: Hard, 4: Very Hard, 5: Extreme)
  const density = difficultyLevel; // 1 to 5

  for (let m = 0; m < totalMeasures; m++) {
    // Pick a musical pattern mode for this measure
    const patternMode = Math.floor(Math.random() * 6);

    // Measure start double chord on strong beats (Harder modes)
    if (density >= 3 && Math.random() < 0.4) {
      const chordPair = Math.random() < 0.5 ? [0, 3] : [1, 2];
      notes.push({ time: currentT, lane: chordPair[0] });
      notes.push({ time: currentT, lane: chordPair[1] });
    }

    if (patternMode === 0) {
      // 1. Staircase Run (계단: 0->1->2->3 or 3->2->1->0)
      const ascending = Math.random() < 0.5;
      const sub = (density >= 4 && m % 2 === 1) ? sixteenth : eighth;
      const count = (sub === sixteenth) ? 8 : 4;

      for (let i = 0; i < count; i++) {
        const lane = ascending ? (i % 4) : (3 - (i % 4));
        notes.push({ time: currentT + i * sub, lane: lane });
      }
    } else if (patternMode === 1) {
      // 2. Trill (트릴: 빠른 두 건반 교차 0<->1, 1<->2, 2<->3)
      const laneA = Math.floor(Math.random() * 3);
      const laneB = laneA + 1;
      const count = density >= 3 ? 6 : 4;
      const sub = (density >= 4) ? sixteenth : eighth;

      for (let i = 0; i < count; i++) {
        const lane = (i % 2 === 0) ? laneA : laneB;
        notes.push({ time: currentT + i * sub, lane: lane });
      }
    } else if (patternMode === 2) {
      // 3. Jump Jacks & Butterfly (양손 교차점프)
      const jumpSeq = [0, 3, 1, 2, 0, 3, 2, 1];
      for (let i = 0; i < 4; i++) {
        const lane = jumpSeq[(m * 2 + i) % jumpSeq.length];
        notes.push({ time: currentT + i * eighth, lane: lane });
      }
    } else if (patternMode === 3) {
      // 4. Syncopated Groove (엇박 당김음 리듬)
      const offsets = [0, eighth * 0.75, eighth * 1.5, eighth * 2.25, eighth * 3];
      for (let i = 0; i < offsets.length; i++) {
        let nextLane = (lastLane + Math.floor(Math.random() * 3) + 1) % 4;
        notes.push({ time: currentT + offsets[i], lane: nextLane });
        lastLane = nextLane;
      }
    } else {
      // 5. Dynamic Organic Rhythm Flow (절대 순서 반복 없는 지능형 랜덤)
      const count = density >= 4 ? 8 : (density >= 2 ? 6 : 4);
      const step = (4 * beat) / count;

      for (let i = 0; i < count; i++) {
        // Pick random lane avoiding more than 2 consecutive hits on same lane
        let nextLane = Math.floor(Math.random() * 4);
        if (nextLane === lastLane) {
          streakCount++;
          if (streakCount >= 2) {
            nextLane = (lastLane + Math.floor(Math.random() * 3) + 1) % 4;
            streakCount = 0;
          }
        } else {
          streakCount = 0;
        }

        notes.push({ time: currentT + i * step, lane: nextLane });
        lastLane = nextLane;
      }
    }

    currentT += 4 * beat;
  }

  // Sort notes by time just in case
  notes.sort((a, b) => a.time - b.time);
  return notes;
}

// 10 Classical Tracks Full Specifications
const SONGS = [
  {
    id: "canon-rock",
    title: "캐논 변주곡 (Canon in D)",
    composer: "Johann Pachelbel",
    genre: "Orchestral Rock / Pump Classic",
    audioFile: "./audio/canon.mp3",
    icon: "🎻",
    bpm: 132,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "입문 추천",
    durationSec: 85,
    accentColor: "#00f0ff",
    description: "세계에서 가장 아름다운 캐논의 피아노 & 현악 선율! 132 BPM의 기분 좋은 건반 그루브",
    generateChart: function(startTime = 0.8) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "turkish-march",
    title: "터키 행진곡 (Turkish March)",
    composer: "W. A. Mozart",
    genre: "Piano Sonata / O2 Classic",
    audioFile: "./audio/turkish.ogg",
    icon: "🎹",
    bpm: 148,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "화려한 건반",
    durationSec: 80,
    accentColor: "#ffd700",
    description: "모차르트 피아노 소나타의 경쾌한 론도! 오투잼과 펌프를 달군 테크니컬 피아노 건반",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "beethoven-virus",
    title: "베토벤 바이러스 (Beethoven Virus)",
    composer: "L. v. Beethoven / Pathétique",
    genre: "Speed Core / Pump Legend",
    audioFile: "./audio/pathetique.ogg",
    icon: "⚡",
    bpm: 162,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "초고속 폭타",
    durationSec: 90,
    accentColor: "#ff007f",
    description: "비창 소나타 3악장의 폭발적인 드라이브! 펌프 잇 업을 상징하는 전설의 초고속 피아노 폭타",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "vivaldi-winter",
    title: "비발디 겨울 1악장 (Winter)",
    composer: "Antonio Vivaldi",
    genre: "Symphonic Trance",
    audioFile: "./audio/winter.ogg",
    icon: "❄️",
    bpm: 140,
    difficulty: "Hard",
    diffLevel: 3,
    stars: "★★★",
    badge: "질주하는 비트",
    durationSec: 75,
    accentColor: "#00f0ff",
    description: "사계 중 '겨울' 1악장! 미 공군 콘서트 밴드의 생생한 현악 스타카토와 시원한 질주감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "flight-bumblebee",
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
    durationSec: 70,
    accentColor: "#ffaa00",
    description: "오투잼 전설의 초고속 반음계 연타! 174 BPM의 극한 스피드로 몰아치는 핑거 테크닉의 정점",
    generateChart: function(startTime = 0.5) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "fate-symphony",
    title: "운명 교향곡 (Symphony No.5)",
    composer: "L. v. Beethoven",
    genre: "Orchestra Classic Rock",
    audioFile: "./audio/fate.ogg",
    icon: "💥",
    bpm: 150,
    difficulty: "Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "강렬한 타격",
    durationSec: 80,
    accentColor: "#ff3366",
    description: "빠-빠-빠-빰! 세상을 뒤흔든 운명의 4음 모티브와 풀 오케스트라의 웅장한 타격감",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "ode-to-joy",
    title: "환희의 송가 (Ode to Joy)",
    composer: "L. v. Beethoven",
    genre: "Symphonic Brass Anthem",
    audioFile: "./audio/ode.ogg",
    icon: "🎺",
    bpm: 136,
    difficulty: "Normal",
    diffLevel: 2,
    stars: "★★☆",
    badge: "신나는 리듬",
    durationSec: 72,
    accentColor: "#39ff14",
    description: "베토벤 9번 교향곡 '합창'의 벅찬 환희를 담은 미 해군 관악단의 당당하고 경쾌한 브라스 행진",
    generateChart: function(startTime = 0.8) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "new-world",
    title: "신세계 교향곡 4악장 (From the New World)",
    composer: "Antonín Dvořák",
    genre: "Symphonic Power",
    audioFile: "./audio/new_world.ogg",
    icon: "🌋",
    bpm: 152,
    difficulty: "Very Hard",
    diffLevel: 4,
    stars: "★★★★",
    badge: "웅장한 대서사",
    durationSec: 85,
    accentColor: "#a855f7",
    description: "드보르자크 교향곡 9번 4악장! 웅장한 브라스 팡파르와 거대한 폭풍처럼 쏟아지는 건반 노트",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "air-g-string",
    title: "G선상의 아리아 (Air on the G String)",
    composer: "J. S. Bach",
    genre: "String Orchestra / Chill",
    audioFile: "./audio/air.ogg",
    icon: "🕊️",
    bpm: 118,
    difficulty: "Easy",
    diffLevel: 1,
    stars: "★☆☆",
    badge: "힐링 앤 그루브",
    durationSec: 80,
    accentColor: "#38bdf8",
    description: "바흐 관현악 모음곡의 우아한 현악 선율과 잔잔하게 흐르는 힐링 클래식 명작",
    generateChart: function(startTime = 1.0) {
      // Dynamic non-repetitive rhythm groove for G String
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  },

  {
    id: "carmen-tolead",
    title: "카르멘 - 투우사의 노래 (Toreador Song)",
    composer: "Georges Bizet",
    genre: "Opera March / Arcade",
    audioFile: "./audio/carmen.ogg",
    icon: "🚩",
    bpm: 144,
    difficulty: "Normal",
    diffLevel: 3,
    stars: "★★★",
    badge: "리드미컬 행진",
    durationSec: 75,
    accentColor: "#ef4444",
    description: "오페라 카르멘의 대표 행진곡! 어깨가 들썩이는 위풍당당한 투우사의 행진 선율",
    generateChart: function(startTime = 0.6) {
      return generateDynamicChart(this.bpm, this.durationSec, this.diffLevel, startTime);
    }
  }
];

window.SoundEngine = SoundEngine;
window.SONGS = SONGS;
