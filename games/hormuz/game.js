const byId = id => document.getElementById(id);
const scene = createScene(byId('map'));
const stages = Escape.stages;
const fmt = n => String(n).padStart(2, '0');
const modeText = {ready: '출항 대기', sailing: '항해 중', cleared: '탈출 성공', failed: '항해 실패'};
const thrust = byId('thrust');
const launchButton = byId('launch');
const alert = byId('alert');
const shotClock = byId('shot-clock');
let run = Escape.newRun();
let voyage = Escape.newVoyage(run.stage);
let clock;
let toastTimer;

function setText(id, value) {
  const element = byId(id);
  if (element.textContent !== value) element.textContent = value;
}

function toast(message) {
  setText('toast', message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setText('toast', ''), 2200);
}

function render(now = performance.now()) {
  const {config, attack, status} = voyage;
  const sailing = status === 'sailing';
  const pirate = sailing && voyage.pirate?.status === 'approaching' ? voyage.pirate : null;
  setText('stage-number', fmt(voyage.stage));
  setText('time', `${voyage.time.toFixed(1)}초`);
  setText('batteries', `${voyage.stage}곳`);
  setText('progress', `${Math.floor(voyage.progress * 100)}%`);
  byId('power').style.width = `${voyage.power * 100}%`;
  setText('mode', `3D · ${modeText[status]}`);
  byId('mode').classList.toggle('active', sailing);
  setText('credits', run.credits.toLocaleString('ko-KR'));
  setText('shields', pirate ? '—' : String(run.shields));
  const canBuy = Escape.canBuy(run, voyage);
  byId('buy').disabled = !canBuy;
  byId('prepare-buy').hidden = !canBuy;
  setText('buy-label', sailing ? '출항 전 구매 가능' : '방어권 1회 구매');
  setText('clears', `${run.stage - 1 + Number(status === 'cleared')} / ${stages}`);
  setText('dodges', `${voyage.dodges}발`);
  setText('volleys', `${voyage.launched}발`);
  setText('difficulty', `${config.name} · 포대 ${voyage.stage}곳 개별 발사`);
  thrust.disabled = !sailing;
  byId('overlay').hidden = sailing;

  const danger = sailing && attack;
  const coasting = danger && Escape.isCoasting(voyage);
  const message = pirate ? `⚠ 해적 고속정 ${pirate.boats}척 접근!`
    : danger
    ? attack.boost ? '⚠ 가속 경보 · 연타해서 착탄 구역을 통과하세요!' : '⚠ 감속 경보 · 손을 떼고 착탄을 기다리세요!'
    : voyage.notice;
  setText('alert', message);
  alert.classList.toggle('danger', Boolean(danger || pirate));
  let timer = '';
  if (pirate) timer = `접근 ${pirate.remaining.toFixed(1)}초`;
  else if (danger) timer = `착탄 ${attack.remaining.toFixed(1)}초`;
  else if (sailing && voyage.pirate) timer = '해적 퇴각 중';
  else if (sailing && voyage.progress >= 0.97) timer = '탈출 지점 접근';
  else if (sailing && voyage.time > config.warning) timer = `다음 포격 ${Escape.nextFireIn(voyage).toFixed(1)}초`;
  setText('shot-clock', timer);
  shotClock.classList.toggle('danger', Boolean(danger || pirate));
  thrust.classList.toggle('brake', Boolean(danger && !attack.boost));
  const hint = attack?.boost ? '지금 연타해서 통과' : coasting ? '저속 항해 중 · 착탄까지 기다리세요' : '추진에서 손을 떼세요';
  setText('thrust-hint', danger ? hint : '터치할 때마다 가속');
  scene.draw(voyage, now);
}

function showResult() {
  const cleared = voyage.status === 'cleared';
  const finished = cleared && voyage.stage === stages;
  setText('mission', `MISSION ${fmt(voyage.stage)} / ${stages}`);
  setText('result-title', finished ? '10단계 완전 탈출!' : cleared ? '해협 탈출 성공!' : '항해 실패');
  setText('result-detail', cleared
    ? `+${voyage.config.reward} 크레딧 획득 · 포탄 ${voyage.dodges}발 회피${finished ? '' : ' · 다음 출항 전 방어권 구매 가능'}`
    : `${voyage.notice} 새 항해는 1단계에서 시작합니다.`);
  setText('launch', cleared && !finished ? `${voyage.stage + 1}단계 출항 →` : '1단계 다시 시작 →');
  launchButton.focus({preventScroll: true});
}

function frame(now) {
  const elapsed = Math.min(voyage.time + 0.05, Math.max(0, now - clock) / 1000);
  clock = now;
  const steps = Math.max(1, Math.ceil(elapsed / 0.05));
  for (let i = 0; i < steps && voyage.status === 'sailing'; i++) {
    Escape.tick(voyage, run, elapsed / steps);
  }
  if (voyage.status === 'failed') run = Escape.newRun();
  render(now);
  if (voyage.status === 'sailing') requestAnimationFrame(frame);
  else showResult();
}

function launch() {
  if (voyage.status === 'sailing') return;
  if (voyage.status === 'cleared' && run.stage < stages) run.stage++;
  else if (voyage.status !== 'ready') run = Escape.newRun();
  voyage = Escape.newVoyage(run.stage, run.pirateBoatsFaced);
  voyage.status = 'sailing';
  voyage.notice = '추진을 터치해 속도를 올리세요.';
  clock = performance.now();
  render(clock);
  thrust.focus({preventScroll: true});
  requestAnimationFrame(frame);
}

launchButton.addEventListener('click', launch);
thrust.addEventListener('click', () => Escape.tap(voyage, performance.now() / 1000));
function buyShield() {
  if (Escape.buy(run, voyage)) toast('방어권 1회를 구매했습니다.');
  render();
}
byId('buy').addEventListener('click', buyShield);
byId('prepare-buy').addEventListener('click', buyShield);
byId('share').addEventListener('click', async () => {
  const url = new URL('./', location.href).href;
  try {
    if (navigator.share) {
      await navigator.share({title: document.title, url});
    } else {
      await navigator.clipboard.writeText(url);
      toast('게임 링크를 복사했습니다.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') window.prompt('게임 주소를 복사하세요.', url);
  }
});
new ResizeObserver(() => {
  if (voyage.status !== 'sailing') render();
}).observe(byId('map'));
render();
