const Escape = (() => {
  const stages = 100;
  const shieldCost = 80;
  const laneNames = ['북쪽', '중앙', '남쪽'];
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

  function difficulty(stage) {
    const rank = (stage - 1) / (stages - 1);
    return {
      time: 33 - 18 * rank,
      attacks: 1 + Math.floor(rank * 12),
      warning: 2.3 - 1.66 * rank,
      gain: 0.43 - 0.275 * rank,
      drain: 0.24 + 0.32 * rank,
      reward: 50 + stage * 4,
      name: ['아주 쉬움', '쉬움', '보통', '어려움', '아주 어려움'][Math.min(4, Math.floor(rank * 5))],
    };
  }

  function newRun() {
    return {stage: 1, credits: 0, shields: 0};
  }

  function newVoyage(stage) {
    const config = difficulty(stage);
    return {
      stage, config, time: config.time, progress: 0, power: 0, hull: 3, lane: 1,
      attack: null, launched: 0, dodges: 0, cooldown: 0, lastTap: -Infinity,
      status: 'ready', notice: '출항 버튼을 눌러 항해를 시작하세요.',
    };
  }

  function tap(voyage, now) {
    if (voyage.status !== 'sailing' || now - voyage.lastTap < 0.08) return;
    voyage.lastTap = now;
    voyage.power = clamp(voyage.power + voyage.config.gain, 0, 1);
  }

  function steer(voyage, direction) {
    if (voyage.status === 'sailing') voyage.lane = clamp(voyage.lane + direction, 0, 2);
  }

  function buy(run) {
    if (run.credits < shieldCost) return false;
    run.credits -= shieldCost;
    run.shields++;
    return true;
  }

  function tick(voyage, run, dt, random = Math.random) {
    if (voyage.status !== 'sailing') return;
    const {config} = voyage;
    voyage.time = Math.max(0, voyage.time - dt);
    voyage.power = Math.max(0, voyage.power - config.drain * dt);
    voyage.progress = Math.min(1, voyage.progress + (0.01 + 0.105 * voyage.power) * dt);
    voyage.cooldown = Math.max(0, voyage.cooldown - dt);
    if (voyage.impact) {
      voyage.impact.remaining -= dt;
      if (voyage.impact.remaining <= 0) voyage.impact = null;
    }

    if (voyage.attack) {
      const attack = voyage.attack;
      attack.remaining -= dt;
      if (attack.remaining <= 0) {
        if (!attack.lanes.includes(voyage.lane)) {
          voyage.dodges++;
          voyage.notice = '회피 성공. 계속 추진하세요!';
        } else if (run.shields > 0) {
          run.shields--;
          voyage.notice = '방어권 1회 사용. 선체를 보호했습니다.';
        } else {
          voyage.hull--;
          voyage.notice = '피격! 선체 내구도가 1 감소했습니다.';
        }
        voyage.impact = {lanes: attack.lanes, progress: voyage.progress, remaining: 0.38};
        voyage.attack = null;
        voyage.cooldown = 0.17;
      }
    }

    const nextAttackAt = 0.12 + 0.72 * voyage.launched / config.attacks;
    if (!voyage.attack && !voyage.cooldown && voyage.launched < config.attacks && voyage.progress >= nextAttackAt) {
      const lanes = [voyage.lane];
      const doubleChance = clamp((voyage.stage - 22) / 100, 0, 0.76);
      if (random() < doubleChance) {
        const adjacent = [voyage.lane - 1, voyage.lane + 1].filter(lane => lane >= 0 && lane <= 2);
        lanes.push(adjacent[Math.floor(random() * adjacent.length)]);
      }
      voyage.attack = {lanes, remaining: config.warning, total: config.warning};
      voyage.launched++;
    }

    if (voyage.hull <= 0) {
      voyage.status = 'failed';
      voyage.notice = '선체가 파손되어 항해가 종료됐습니다.';
    } else if (voyage.progress >= 1 && voyage.launched === config.attacks && !voyage.attack) {
      voyage.status = 'cleared';
      run.credits += config.reward;
      voyage.notice = '해협 탈출 성공!';
    } else if (voyage.time <= 0) {
      voyage.status = 'failed';
      voyage.notice = '제한 시간 안에 해협을 벗어나지 못했습니다.';
    }
  }

  return {stages, shieldCost, laneNames, difficulty, newRun, newVoyage, tap, steer, buy, tick};
})();
