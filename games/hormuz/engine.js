const Escape = (() => {
  const batteries = [
    [55.83, 26.77], [56.03, 26.88], [56.16, 26.95], [56.48, 27.19], [56.61, 27.18],
    [56.75, 27.19], [56.90, 27.13], [57.01, 26.98], [57.09, 26.77], [57.10, 26.52],
  ];
  const stages = batteries.length;
  const shieldCost = 80;
  const tapGap = 0.085;
  const idleSpeed = 0.0066;
  const thrustSpeed = 0.064;
  const reactionTime = 0.7;
  const coastDelay = 0.25;
  const coastDrain = 2.9;
  const boostMultiplier = 1.25;
  const speed = power => idleSpeed + thrustSpeed * power;
  const rewardFor = stage => 80 + stage * 8;
  const isCoasting = voyage => voyage.attack?.boost === false && voyage.tapIdle >= coastDelay;

  function difficulty(stage) {
    const rank = (stage - 1) / (stages - 1);
    const shotInterval = [5.2, 3.55, 2.63, 2.16, 1.84, 1.61, 1.43, 1.30, 1.16, 1.05][stage - 1];
    return {
      time: 30,
      shotInterval,
      batteryPeriods: Array.from({length: stage}, (_, i) =>
        stage === 1 ? shotInterval : shotInterval * stage * (0.84 + 0.32 * i / (stage - 1))),
      warning: 2.65 - 0.95 * rank,
      gain: 0.52 - 0.32 * rank,
      drain: 0.24 + 0.34 * rank,
      reward: rewardFor(stage),
      pirateBoats: stage >= 8 ? 3 : stage >= 5 ? 2 : stage >= 2 ? 1 : 0,
      pirateWaves: stage === 10 ? 3 : stage >= 5 ? 2 : 1,
      pirateChance: [0, 0.30, 0.36, 0.43, 0.50, 0.56, 0.61, 0.67, 0.72, 0.78][stage - 1],
      name: ['입문', '정찰', '접근', '해협 진입', '경계', '집중 포격', '교전', '교차 포격', '봉쇄 돌파', '최종 탈출'][stage - 1],
    };
  }

  function newRun() {
    return {stage: 1, credits: 0, shields: 0, pirateBoatsFaced: 0};
  }

  function planRaids(stage, config, pirateBoatsFaced, random) {
    if (!config.pirateBoats) return [];
    // Even the largest set of raids must be payable with earlier stages' rewards.
    const earned = (stage - 1) * (rewardFor(1) + rewardFor(stage - 1)) / 2;
    const affordableWaves = Math.floor((Math.floor(earned / shieldCost) - pirateBoatsFaced) / config.pirateBoats);
    const maxWaves = Math.min(config.pirateWaves, affordableWaves);
    const chances = [config.pirateChance, 0.32 + (stage - 5) * 0.055, 0.32];
    const plan = [];
    for (let wave = 0; wave < maxWaves && random() < chances[wave]; wave++) {
      plan.push(0.14 + wave * 0.19 + random() * 0.07);
    }
    return plan;
  }

  function newVoyage(stage, pirateBoatsFaced = 0, random = Math.random) {
    const config = difficulty(stage);
    return {
      stage, config, time: config.time, progress: 0, power: 0,
      attack: null, impacts: [], launched: 0, dodges: 0, fireGap: 0,
      batteryTimers: config.batteryPeriods.map((_, i) => 3.4 - (stage - 1) * 0.17 + i * config.shotInterval * 0.78),
      nextCoastAt: stage >= 3 ? 5.3 : Infinity,
      raidPlan: planRaids(stage, config, pirateBoatsFaced, random), pirate: null,
      lastTap: -Infinity, tapIdle: Infinity, status: 'ready', notice: '출항 버튼을 눌러 항해를 시작하세요.',
    };
  }

  function tap(voyage, now) {
    if (voyage.status !== 'sailing' || now - voyage.lastTap < tapGap) return;
    voyage.lastTap = now;
    voyage.tapIdle = 0;
    const gain = voyage.config.gain * (voyage.attack?.boost ? boostMultiplier : 1);
    voyage.power = Math.min(1, voyage.power + gain);
  }

  function canBuy(run, voyage) {
    const preparing = voyage.status === 'ready' || (voyage.status === 'cleared' && voyage.stage < stages);
    return preparing && run.credits >= shieldCost;
  }

  function buy(run, voyage) {
    if (!canBuy(run, voyage)) return false;
    run.credits -= shieldCost;
    run.shields++;
    return true;
  }

  function nextFireIn(voyage) {
    return Math.max(voyage.fireGap, Math.min(...voyage.batteryTimers));
  }

  function projectedArrival(voyage, startTapping, gain = voyage.config.gain) {
    const {warning, drain} = voyage.config;
    let progress = voyage.progress;
    let power = voyage.power;
    let nextTap = startTapping;
    const step = warning / 100;
    for (let frame = 0; frame < 100; frame++) {
      if (frame * step >= nextTap) {
        power = Math.min(1, power + gain);
        nextTap += 0.24;
      }
      power = Math.max(0, power - drain * step);
      progress += speed(power) * step;
    }
    return progress;
  }

  function planShot(voyage, battery, boost) {
    const {stage, config} = voyage;
    const frameMargin = 0.05;
    const coastDistance = idleSpeed * (config.warning + frameMargin)
      + thrustSpeed * (reactionTime + coastDelay + frameMargin + 0.5 / coastDrain);
    const slow = boost ? projectedArrival(voyage, Infinity) : voyage.progress + coastDistance;
    const fast = boost
      ? projectedArrival(voyage, reactionTime, config.gain * boostMultiplier)
      : projectedArrival(voyage, 0);
    const width = Math.max(0, fast - slow) * (0.48 + (stage - 1) * 0.022);
    const start = boost ? slow - 0.021 : Math.max(slow + 0.002, fast - width);
    const end = boost ? slow + width : Math.max(start + 0.014, fast + 0.021);
    return {battery, start, end, target: (start + end) / 2, remaining: config.warning, total: config.warning};
  }

  function resolvePirates(voyage, run, dt) {
    const pirate = voyage.pirate;
    if (!pirate) return;
    pirate.remaining -= dt;
    if (pirate.remaining > 0) return;
    if (pirate.status === 'repelled') {
      voyage.pirate = null;
    } else if (run.shields >= pirate.boats) {
      run.shields -= pirate.boats;
      voyage.pirate = {boats: pirate.boats, remaining: 1.25, total: 1.25, status: 'repelled'};
      voyage.notice = `방어권 ${pirate.boats}장을 사용해 해적 고속정 ${pirate.boats}척을 물리쳤습니다.`;
    } else {
      pirate.remaining = 0;
      voyage.status = 'failed';
      voyage.notice = '방어권이 부족해 소말리아 해적에게 화물을 약탈당했습니다.';
    }
  }

  function resolveShots(voyage, run, dt) {
    if (!voyage.attack) return;
    const attack = voyage.attack;
    const flying = [];
    let hits = 0;
    let misses = 0;
    for (const shot of attack.shots) {
      shot.remaining -= dt;
      if (shot.remaining > 0) {
        flying.push(shot);
      } else {
        const hit = voyage.progress >= shot.start && voyage.progress <= shot.end;
        voyage.impacts.push({shots: [shot], remaining: 0.85, hit});
        if (hit) hits++;
        else misses++;
      }
    }
    if (flying.length) {
      attack.shots = flying;
      attack.remaining = Math.min(...flying.map(shot => shot.remaining));
    } else {
      voyage.attack = null;
    }
    voyage.dodges += misses;
    if (hits) {
      const blocked = Math.min(hits, run.shields);
      run.shields -= blocked;
      if (blocked < hits) {
        voyage.status = 'failed';
        voyage.notice = `포탄 ${hits}발에 맞았습니다. 방어권이 부족해 항해가 종료됐습니다.`;
      } else {
        voyage.notice = `포탄 ${hits}발 피격 · 방어권 ${blocked}장 사용`;
      }
    } else if (misses) {
      voyage.notice = '회피 성공. 계속 추진하세요!';
    }
  }

  function fire(voyage) {
    const {config, attack} = voyage;
    if (nextFireIn(voyage) > 0 || voyage.time <= config.warning || voyage.progress >= 0.97) return;
    const elapsed = config.time - voyage.time;
    const coastDue = elapsed >= voyage.nextCoastAt;
    // Overlapping shots share the same maneuver so two warnings cannot contradict each other.
    if (attack && (!attack.boost || coastDue)) return;
    const battery = voyage.batteryTimers.indexOf(Math.min(...voyage.batteryTimers));
    const shot = planShot(voyage, battery, !coastDue);
    if (attack) {
      attack.shots.push(shot);
      attack.remaining = Math.min(attack.remaining, shot.remaining);
    } else {
      voyage.attack = {boost: !coastDue, shots: [shot], remaining: shot.remaining};
    }
    if (coastDue) voyage.nextCoastAt = elapsed + 4.7;
    voyage.batteryTimers[battery] = config.batteryPeriods[battery];
    voyage.fireGap = 0.30;
    voyage.launched++;
  }

  function tick(voyage, run, dt) {
    if (voyage.status !== 'sailing') return;
    const {config} = voyage;
    voyage.time = Math.max(0, voyage.time - dt);
    voyage.tapIdle += dt;
    const drain = isCoasting(voyage) ? coastDrain : config.drain;
    voyage.power = Math.max(0, voyage.power - drain * dt);
    voyage.progress = Math.min(1, voyage.progress + speed(voyage.power) * dt);
    if (!voyage.pirate) {
      voyage.fireGap = Math.max(0, voyage.fireGap - dt);
      voyage.batteryTimers = voyage.batteryTimers.map(timer => timer - dt);
    }
    voyage.impacts = voyage.impacts.filter(impact => {
      impact.remaining -= dt;
      return impact.remaining > 0;
    });

    resolvePirates(voyage, run, dt);
    if (voyage.status === 'failed') return;

    const pirateWarning = 3 + config.pirateBoats;
    const raidDue = voyage.progress >= voyage.raidPlan[0] && voyage.time > pirateWarning;
    if (raidDue && !voyage.attack && !voyage.pirate) {
      voyage.raidPlan.shift();
      voyage.pirate = {boats: config.pirateBoats, remaining: pirateWarning, total: pirateWarning, status: 'approaching'};
      run.pirateBoatsFaced += config.pirateBoats;
    }

    const reinforcements = raidDue && voyage.pirate?.status === 'repelled'
      && voyage.time > pirateWarning + voyage.pirate.remaining;
    if (voyage.progress >= 1 && voyage.pirate?.status !== 'approaching' && !reinforcements) {
      voyage.status = 'cleared';
      run.credits += config.reward;
      voyage.notice = '해협 탈출 성공!';
      return;
    }

    resolveShots(voyage, run, dt);
    if (voyage.status === 'failed') return;
    if (!voyage.pirate && !raidDue) fire(voyage);

    if (voyage.time <= 0) {
      voyage.status = 'failed';
      voyage.notice = '제한 시간 안에 해협을 벗어나지 못했습니다.';
    }
  }

  return {stages, batteries, shieldCost, difficulty, newRun, newVoyage, speed, isCoasting, tap, canBuy, buy, nextFireIn, tick};
})();
