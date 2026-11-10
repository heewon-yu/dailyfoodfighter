const Escape = (() => {
  const batteries = [
    [55.83, 26.77], [56.03, 26.88], [56.16, 26.95], [56.48, 27.19], [56.61, 27.18],
    [56.75, 27.19], [56.90, 27.13], [57.01, 26.98], [57.09, 26.77], [57.10, 26.52],
  ];
  const stages = batteries.length;
  const shieldCost = 80;
  const tapGap = 0.085;
  const speed = power => 0.003 + 0.028 * power;

  function difficulty(stage) {
    const rank = (stage - 1) / (stages - 1);
    return {
      time: 78 - 10 * rank,
      interval: [11, 8.6, 7, 5.8, 5.1, 4.55, 4.05, 3.65, 3.28, 3][stage - 1],
      warning: 4.1 - 1.75 * rank,
      gain: 0.52 - 0.32 * rank,
      drain: 0.24 + 0.34 * rank,
      reward: 80 + stage * 8,
      name: ['입문', '정찰', '접근', '해협 진입', '경계', '집중 포격', '교전', '교차 포격', '봉쇄 돌파', '최종 탈출'][stage - 1],
    };
  }

  function newRun() {
    return {stage: 1, credits: 0, shields: 0};
  }

  function newVoyage(stage) {
    const config = difficulty(stage);
    return {
      stage, config, time: config.time, progress: 0, power: 0,
      attack: null, impact: null, launched: 0, dodges: 0, lastAttackBoost: false,
      nextIn: 7 - (stage - 1) * 0.35,
      lastTap: -Infinity, status: 'ready', notice: '출항 버튼을 눌러 항해를 시작하세요.',
    };
  }

  function tap(voyage, now) {
    if (voyage.status !== 'sailing' || now - voyage.lastTap < tapGap) return;
    voyage.lastTap = now;
    voyage.power = Math.min(1, voyage.power + voyage.config.gain);
  }

  function buy(run) {
    if (run.credits < shieldCost) return false;
    run.credits -= shieldCost;
    run.shields++;
    return true;
  }

  function projectedArrival(voyage, startTapping, stopTapping = Infinity) {
    const {warning, drain, gain} = voyage.config;
    let progress = voyage.progress;
    let power = voyage.power;
    let nextTap = startTapping;
    const step = warning / 100;
    for (let frame = 0; frame < 100; frame++) {
      const time = frame * step;
      if (time >= nextTap && time < stopTapping) {
        power = Math.min(1, power + gain);
        nextTap += 0.18;
      }
      power = Math.max(0, power - drain * step);
      progress += speed(power) * step;
    }
    return progress;
  }

  function planAttack(voyage, random) {
    const {stage, config, launched} = voyage;
    const boost = stage < 3 || !voyage.lastAttackBoost || (stage >= 7 && random() < 0.42);
    // Keep a response window even when the player was already tapping as the warning appeared.
    const slow = boost ? projectedArrival(voyage, Infinity) : projectedArrival(voyage, 0, 0.56);
    const fast = projectedArrival(voyage, boost ? 0.56 : 0);
    const width = (fast - slow) * (0.48 + (stage - 1) * 0.022);
    const start = boost ? slow - 0.021 : fast - width;
    const end = boost ? slow + width : fast + 0.021;
    const shellCount = stage >= 9 ? 3 : stage >= 5 ? 2 : 1;
    const shots = Array.from({length: shellCount}, (_, index) => ({
      battery: (launched + index) % stage,
      target: start + (end - start) * (index + 1) / (shellCount + 1),
    }));
    return {boost, start, end, shots, remaining: config.warning, total: config.warning};
  }

  function tick(voyage, run, dt, random = Math.random) {
    if (voyage.status !== 'sailing') return;
    const {config} = voyage;
    voyage.time = Math.max(0, voyage.time - dt);
    voyage.power = Math.max(0, voyage.power - config.drain * dt);
    voyage.progress = Math.min(1, voyage.progress + speed(voyage.power) * dt);
    voyage.nextIn -= dt;

    if (voyage.progress >= 1) {
      voyage.status = 'cleared';
      run.credits += config.reward;
      voyage.notice = '해협 탈출 성공!';
      return;
    }

    if (voyage.impact) {
      voyage.impact.remaining -= dt;
      if (voyage.impact.remaining <= 0) voyage.impact = null;
    }

    if (voyage.attack) {
      const attack = voyage.attack;
      attack.remaining -= dt;
      if (attack.remaining <= 0) {
        const hit = voyage.progress >= attack.start && voyage.progress <= attack.end;
        if (!hit) {
          voyage.dodges++;
          voyage.notice = '회피 성공. 계속 추진하세요!';
        } else if (run.shields > 0) {
          run.shields--;
          voyage.notice = '방어권 1회 사용. 선체를 보호했습니다.';
        } else {
          voyage.status = 'failed';
          voyage.notice = '포탄에 맞았습니다. 남은 방어권이 없어 항해가 종료됐습니다.';
        }
        voyage.impact = {shots: attack.shots, remaining: 0.85, hit};
        voyage.attack = null;
        if (voyage.status === 'failed') return;
      }
    }

    if (!voyage.attack && voyage.nextIn <= 0 && voyage.time > config.warning && voyage.progress < 0.97) {
      voyage.attack = planAttack(voyage, random);
      voyage.lastAttackBoost = voyage.attack.boost;
      voyage.nextIn += config.interval;
      voyage.launched++;
    }

    if (voyage.time <= 0) {
      voyage.status = 'failed';
      voyage.notice = '제한 시간 안에 해협을 벗어나지 못했습니다.';
    }
  }

  return {stages, batteries, shieldCost, difficulty, newRun, newVoyage, speed, tap, buy, tick};
})();
