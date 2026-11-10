const byId = id => document.getElementById(id);
const map = byId('map');
const mapPoint = (lon, lat) => [(lon - 55.64) / 1.49 * 1000, (27.23 - lat) / 1.37 * 610];
const route = [[55.75, 26.29], [56.04, 26.29], [56.25, 26.41], [56.44, 26.51], [56.62, 26.49], [56.83, 26.36], [57.02, 26.17]].map(p => mapPoint(...p));
const segments = route.slice(1).map(([x, y], i) => Math.hypot(x - route[i][0], y - route[i][1]));
const routeLength = segments.reduce((sum, length) => sum + length, 0);
const laneOffset = lane => (lane - 1) * (0.026 / 1.37 * 610);
const routePath = lane => 'M' + route.map(([x, y]) => [x, y + laneOffset(lane)].join(',')).join('L');
const pointAt = (progress, lane) => {
  let length = progress * routeLength;
  let i = 0;
  while (i < segments.length - 1 && length > segments[i]) length -= segments[i++];
  const [x, y] = route[i];
  const [endX, endY] = route[i + 1];
  const t = length / segments[i];
  return [x + (endX - x) * t, y + (endY - y) * t + laneOffset(lane), Math.atan2(endY - y, endX - x) * 180 / Math.PI];
};

const place = (name, lon, lat, options = {}) => {
  const [x, y] = mapPoint(lon, lat);
  const {size = 23, color = '#e4f1fd', spacing = 2} = options;
  return `<text x="${x}" y="${y}" fill="${color}" text-anchor="middle" font-size="${size}" font-weight="800" letter-spacing="${spacing}" stroke="#0b2438" stroke-width="4" paint-order="stroke">${name}</text>`;
};
const [sx, sy] = route[0];
const [ex, ey] = route.at(-1);
map.innerHTML = `
  <defs>
    <linearGradient id="sea" x2="1" y2="1"><stop stop-color="#124b61"/><stop offset="1" stop-color="#0b263e"/></linearGradient>
    <linearGradient id="land" x2=".15" y2="1"><stop stop-color="#536568"/><stop offset="1" stop-color="#3b4e53"/></linearGradient>
    <pattern id="grid" width="65" height="65" patternUnits="userSpaceOnUse"><path d="M65 0H0V65" fill="none" stroke="#91cfed" stroke-opacity=".17"/></pattern>
    <pattern id="terrain" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M-1 9 8 0M4 15 15 4" stroke="#ced6b7" stroke-opacity=".08"/></pattern>
    <pattern id="water" width="106" height="71" patternUnits="userSpaceOnUse"><path d="M17 22q6-4 12 0t12 0m39 36q5-3 10 0" fill="none" stroke="#8ee1eb" stroke-opacity=".17" stroke-width="1.5"/></pattern>
    <filter id="glow" x="-50%" y="-75%" width="200%" height="250%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <path d="M0 0H1000V610H0Z" fill="url(#sea)"/>
  <path d="M0 0H1000V610H0Z" fill="url(#water)"/>
  <path d="M0 0H1000V610H0Z" fill="url(#grid)"/>
  <path d="${coast}" fill="none" stroke="#70cfd2" stroke-opacity=".2" stroke-width="14"/>
  <path d="${coast}" fill="url(#land)" fill-rule="evenodd" stroke="#a4bcad" stroke-width="2.5"/>
  <path d="${coast}" fill="url(#terrain)" fill-rule="evenodd"/>
  ${place('이란', 56.61, 27.15, {size: 36, color: '#e8ebdb', spacing: 6})}
  ${place('케슘섬', 55.94, 26.785, {size: 23, color: '#edf0e6'})}
  ${place('호르무즈 해협', 56.51, 26.42, {size: 29, color: '#b1edf1'})}
  ${place('무산담반도 · 오만', 56.23, 26.005, {size: 23, color: '#e8ebdb'})}
  ${place('오만만', 56.9, 26.29, {size: 28, color: '#b1edf1', spacing: 4})}
  ${place('페르시아만', 55.86, 26.43, {size: 24, color: '#b1edf1', spacing: 3})}
  <g transform="translate(945 64)" fill="#d8eaf1" text-anchor="middle" opacity=".85"><text y="-20" font-size="21" font-weight="900">N</text><path d="m0 -10 9 23-9-5-9 5Z"/></g>
  <path d="${routePath(0)}" fill="none" stroke="#9ce5ef" stroke-opacity=".57" stroke-dasharray="4 10" stroke-width="2"/>
  <path d="${routePath(2)}" fill="none" stroke="#9ce5ef" stroke-opacity=".57" stroke-dasharray="4 10" stroke-width="2"/>
  <path d="${routePath(1)}" fill="none" stroke="#fbbf24" stroke-opacity=".25" stroke-width="13" filter="url(#glow)"/>
  <path d="${routePath(1)}" fill="none" stroke="#fbbf24" stroke-width="3.2" stroke-dasharray="9 9"/>
  <circle cx="${sx}" cy="${sy}" r="10" fill="#102b40" stroke="#a9e8e9" stroke-width="3"/>
  <circle cx="${ex}" cy="${ey}" r="11" fill="#102b40" stroke="#fbbf24" stroke-width="3"/>
  ${place('출항', 55.75, 26.216, {size: 21})}
  ${place('탈출', 57.02, 26.097, {size: 21, color: '#fcd34d'})}
  <g id="strikes"></g><g id="impacts"></g>
  <g id="ship" stroke="#102033" stroke-width="1.5" stroke-linejoin="round">
    <path d="M-21 -5 -65 0 -21 5" fill="none" stroke="#d4f4fa" stroke-opacity=".55" stroke-width="3"/>
    <path d="M-28 -9H15L28 0 15 9H-28Z" fill="#f8fafc"/>
    <path d="M-23 -5H-15V5H-23Z" fill="#94a3b8"/>
    <path d="M-12 -5H-3V5H-12Z M0 -5H9V5H0Z M12 -5H18V5H12Z" fill="#fbbf24"/>
  </g>
`;

let run = Escape.newRun();
let voyage = Escape.newVoyage(run.stage);
let clock;
let shownLane = voyage.lane;
let toastTimer;
const stages = Escape.stages;
const fmt = n => String(n).padStart(2, '0');
const controls = ['thrust', 'north', 'south'].map(byId);
const stageLabel = () => `MISSION ${fmt(voyage.stage)} / ${stages}`;
const modeText = {ready: '출항 대기', sailing: '항해 중', cleared: '탈출 성공', failed: '항해 실패'};

function toast(message) {
  byId('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { byId('toast').textContent = ''; }, 2200);
}

function render() {
  const {config, attack, status} = voyage;
  const sailing = status === 'sailing';
  byId('stage').innerHTML = `${fmt(voyage.stage)} <small>/ ${stages}</small>`;
  byId('time').textContent = `${voyage.time.toFixed(1)}초`;
  byId('hull').textContent = `${voyage.hull} / 3`;
  byId('progress').textContent = `${Math.floor(voyage.progress * 100)}%`;
  byId('power').style.width = `${voyage.power * 100}%`;
  byId('speed').textContent = `${(sailing ? 3 + voyage.power * 27 : 0).toFixed(1)} kt`;
  byId('mode').textContent = modeText[status];
  byId('mode').classList.toggle('active', sailing);
  byId('credits').textContent = run.credits.toLocaleString('ko-KR');
  byId('shields').textContent = run.shields;
  byId('buy').disabled = run.credits < Escape.shieldCost || status === 'failed';
  byId('clears').textContent = `${run.stage - 1 + Number(status === 'cleared')} / ${stages}`;
  byId('dodges').textContent = `${voyage.dodges}회`;
  byId('difficulty').textContent = `${config.name} · 공격 ${config.attacks}회 · 경보 ${config.warning.toFixed(2)}초`;
  controls.forEach(button => { button.disabled = !sailing; });
  byId('overlay').hidden = sailing;

  const alert = byId('alert');
  const message = sailing && attack
    ? `⚠ ${attack.lanes.map(lane => Escape.laneNames[lane]).join('·')} 항로 공격! 다른 항로로 이동하세요.`
    : voyage.notice;
  if (alert.textContent !== message) alert.textContent = message;
  alert.classList.toggle('danger', sailing && Boolean(attack));

  const [x, y, angle] = pointAt(voyage.progress, shownLane);
  byId('ship').setAttribute('transform', `translate(${x} ${y}) rotate(${angle})`);
  byId('strikes').innerHTML = sailing && attack ? attack.lanes.map(lane => {
    const [, strikeY] = pointAt(voyage.progress, lane);
    const phase = 1 - attack.remaining / attack.total;
    const opacity = 0.36 + 0.54 * phase;
    const [batteryX, batteryY] = mapPoint(56.54, 27.17);
    const missileX = batteryX + (x - batteryX) * phase;
    const missileY = batteryY + (strikeY - batteryY) * phase;
    return `<path d="M${batteryX} ${batteryY}L${missileX} ${missileY}" stroke="#fca5a5" stroke-opacity=".7" stroke-width="2" stroke-dasharray="4 6"/>
    <circle cx="${missileX}" cy="${missileY}" r="5" fill="#fbbf24" stroke="#fff0bf" stroke-width="2"/>
    <g transform="translate(${x} ${strikeY}) rotate(${angle})">
      <rect x="-52" y="-5" width="150" height="10" rx="5" fill="#ef4444" fill-opacity="${opacity}" stroke="#fecaca" stroke-width="2"/>
      <path d="M75-4l4 4-4 4m10-8 4 4-4 4" fill="none" stroke="#fff" stroke-width="2"/>
    </g>`;
  }).join('') : '';
  const impact = voyage.impact;
  byId('impacts').innerHTML = impact ? impact.lanes.map(lane => {
    const [impactX, impactY] = pointAt(impact.progress, lane);
    const fade = Math.max(0, impact.remaining / 0.38);
    return `<circle cx="${impactX}" cy="${impactY}" r="${12 + (1 - fade) * 27}" fill="#f97316" fill-opacity="${fade * 0.42}" stroke="#fed7aa" stroke-opacity="${fade}" stroke-width="3"/>`;
  }).join('') : '';
}

function showResult() {
  const cleared = voyage.status === 'cleared';
  const finished = cleared && voyage.stage === stages;
  byId('mission').textContent = stageLabel();
  byId('result-title').textContent = finished ? '100단계 완전 탈출!' : cleared ? '해협 탈출 성공!' : '항해 실패';
  byId('result-detail').textContent = cleared
    ? `+${voyage.config.reward} 크레딧 획득 · 공격 ${voyage.dodges}회 회피`
    : `${voyage.notice} 새 항해는 1단계에서 시작합니다.`;
  byId('launch').textContent = cleared && !finished ? `${voyage.stage + 1}단계 출항 →` : '1단계 다시 시작 →';
  byId('launch').focus({preventScroll: true});
}

function frame(now) {
  const dt = Math.min(0.05, (now - clock) / 1000);
  clock = now;
  Escape.tick(voyage, run, dt);
  shownLane += (voyage.lane - shownLane) * Math.min(1, dt * 19);
  if (voyage.status === 'failed') run = Escape.newRun();
  render();
  if (voyage.status === 'sailing') requestAnimationFrame(frame);
  else showResult();
}

function launch() {
  if (voyage.status === 'sailing') return;
  if (voyage.status === 'cleared' && run.stage < stages) run.stage++;
  else if (voyage.status !== 'ready') run = Escape.newRun();
  voyage = Escape.newVoyage(run.stage);
  voyage.status = 'sailing';
  voyage.notice = '추진을 연속으로 눌러 속도를 올리세요.';
  shownLane = voyage.lane;
  clock = performance.now();
  render();
  byId('thrust').focus({preventScroll: true});
  requestAnimationFrame(frame);
}

const tap = () => Escape.tap(voyage, performance.now() / 1000);
byId('launch').addEventListener('click', launch);
byId('thrust').addEventListener('click', tap);
byId('north').addEventListener('click', () => Escape.steer(voyage, -1));
byId('south').addEventListener('click', () => Escape.steer(voyage, 1));
byId('buy').addEventListener('click', () => {
  if (Escape.buy(run)) toast('방어권 1회를 구매했습니다.');
  render();
});
document.addEventListener('keydown', event => {
  if (voyage.status !== 'sailing' || !['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'Space') tap();
  else Escape.steer(voyage, event.code === 'ArrowUp' ? -1 : 1);
});
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
render();
