function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const backdrop = document.createElement('canvas');
  const bg = backdrop.getContext('2d');
  const mapPoint = (lon, lat) => [(lon - 55.64) / 1.49 * 1000, (27.23 - lat) / 1.37 * 610];
  const land = coast.slice(1, -1).split('ZM').map(ring =>
    ring.split('L').map(point => point.split(',').map(Number)));
  const route = [[55.75, 26.29], [56.04, 26.29], [56.25, 26.41], [56.44, 26.51],
    [56.62, 26.49], [56.83, 26.36], [57.02, 26.17]].map(point => mapPoint(...point));
  const segments = route.slice(1).map(([x, z], i) => Math.hypot(x - route[i][0], z - route[i][1]));
  const routeLength = segments.reduce((sum, length) => sum + length, 0);
  const batteries = Escape.batteries.map(point => mapPoint(...point));
  const pitch = 1.03;
  const tiltX = Math.sin(pitch);
  const tiltY = Math.cos(pitch);
  const focal = 1450;
  const centerZ = 302;
  const altitude = 22;
  let width, height, ratio, scale, offsetX, offsetY;

  function camera([x, y, z]) {
    const deltaZ = z - centerZ;
    const depth = focal - deltaZ * tiltY - y * tiltX;
    return [(x - 500) * focal / depth, (deltaZ * tiltX - y * tiltY) * focal / depth, depth];
  }

  function project(point) {
    const [x, y, depth] = camera(point);
    return [offsetX + x * scale, offsetY + y * scale, depth];
  }

  function at(progress) {
    let distance = Math.max(0, Math.min(1, progress)) * routeLength;
    let index = 0;
    while (index < segments.length - 1 && distance > segments[index]) distance -= segments[index++];
    const [x, z] = route[index];
    const [endX, endZ] = route[index + 1];
    const t = distance / segments[index];
    return [x + (endX - x) * t, z + (endZ - z) * t, Math.atan2(endZ - z, endX - x)];
  }

  function path(target, vertices, close = false) {
    target.beginPath();
    vertices.forEach((vertex, index) => {
      const [x, y] = project(vertex);
      if (index) target.lineTo(x, y);
      else target.moveTo(x, y);
    });
    if (close) target.closePath();
  }

  function fill(target, vertices, color) {
    path(target, vertices, true);
    target.fillStyle = color;
    target.fill();
  }

  function line(target, vertices, color, thickness) {
    path(target, vertices);
    target.strokeStyle = color;
    target.lineWidth = thickness;
    target.stroke();
  }

  function mark(target, name, x, z, color, size, y = 1) {
    const [px, py] = project([x, y, z]);
    target.font = `800 ${size}px system-ui, "Malgun Gothic", sans-serif`;
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.lineJoin = 'round';
    target.lineWidth = 3;
    target.strokeStyle = '#092331';
    target.strokeText(name, px, py);
    target.fillStyle = color;
    target.fillText(name, px, py);
  }

  function terrain() {
    const sea = bg.createLinearGradient(0, 0, 0, height);
    sea.addColorStop(0, '#10384b');
    sea.addColorStop(0.55, '#105369');
    sea.addColorStop(1, '#0b2f49');
    bg.fillStyle = sea;
    bg.fillRect(0, 0, width, height);
    for (let x = -220; x <= 1250; x += 66) {
      line(bg, [[x, 0, -110], [x, 0, 760]], '#98e6ea1a', 1);
    }
    for (let z = -75; z <= 690; z += 56) {
      line(bg, [[-300, 0, z], [1330, 0, z]], '#98e6ea1a', 1);
    }
    for (let i = 0; i < 245; i++) {
      const x = (i * 263.71) % 1320 - 170;
      const z = (i * 67.73) % 670 - 30;
      line(bg, [[x, 0, z], [x + 7 + i % 9, 0, z - 1]], i % 3 ? '#9be9ee20' : '#d3f4f53a', 0.75);
    }

    for (const ring of land) {
      const top = ring.map(([x, z]) => [x, altitude, z]);
      line(bg, ring.map(([x, z]) => [x, 0, z]), '#8de9e34d', 4);
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        const [x, z] = ring[i], [endX, endZ] = ring[j];
        fill(bg, [top[i], top[j], [endX, 0, endZ], [x, 0, z]], endZ > z ? '#4a5b52' : '#3b514f');
      }
      fill(bg, top, '#748678');
      bg.save();
      path(bg, top, true);
      bg.clip();
      for (let z = 0; z < 625; z += 23) {
        for (let x = 0; x < 1030; x += 37) {
          const light = Math.floor(12 * Math.sin(x / 41 + z / 51) + 10 * Math.cos(x / 77 - z / 38));
          fill(bg, [[x, altitude, z], [x + 37, altitude, z], [x + 18, altitude, z + 23]],
            `rgb(${113 + light} ${135 + light} ${115 + light})`);
          fill(bg, [[x + 37, altitude, z], [x + 55, altitude, z + 23], [x + 18, altitude, z + 23]],
            `rgb(${104 + light} ${124 + light} ${105 + light})`);
        }
      }
      bg.restore();
      line(bg, [...top, top[0]], '#b9c6a3', 1);
    }

    const compact = width < 530;
    const labels = [
      ['이란', 56.52, 27.13, '#e8ecd4', 16], ['케슘섬', 55.92, 26.81, '#e8ecd4', 13],
      ['페르시아만', 55.85, 26.49, '#b6e5ed', 13], ['호르무즈 해협', 56.44, 26.40, '#d0f0f0', 17],
      ['오만만', 56.94, 26.42, '#b6e5ed', 14], ['무산담반도 · 오만', 56.22, 25.99, '#e8ecd4', 13],
    ];
    labels.forEach(([label, lon, lat, color, size]) => {
      const [x, z] = mapPoint(lon, lat);
      mark(bg, label, x, z, color, compact ? size * 0.77 : size);
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 2);
    if (width === rect.width && height === rect.height && density === ratio) return;
    width = rect.width;
    height = rect.height;
    ratio = density;
    canvas.width = backdrop.width = Math.max(1, Math.round(width * ratio));
    canvas.height = backdrop.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    bg.setTransform(ratio, 0, 0, ratio, 0, 0);
    scale = Math.min((width - 22) / 1045, (height - 21) / 535);
    offsetX = width / 2;
    offsetY = height * 0.48;
    terrain();
  }

  function routeSection(start, end, offset = 0) {
    return Array.from({length: 17}, (_, i) => {
      const [x, z, angle] = at(start + (end - start) * i / 16);
      return [x - Math.sin(angle) * offset, 1, z + Math.cos(angle) * offset];
    });
  }

  function drawRange(attack) {
    const left = routeSection(attack.start, attack.end, -16);
    const right = routeSection(attack.start, attack.end, 16);
    const vertices = [...left, ...right.reverse()];
    fill(ctx, vertices, '#ef493ab0');
    line(ctx, [...vertices, vertices[0]], '#ffd2ab', 1.4);
    const [x, z] = at((attack.start + attack.end) / 2);
    mark(ctx, '착탄 구역', x, z + 25, '#ffceaf', width < 530 ? 10 : 12);
  }

  function drawBattery([x, z], index, active) {
    const [px, py] = project([x, altitude + 6, z]);
    ctx.fillStyle = active ? '#fe6341' : '#a84330';
    ctx.strokeStyle = active ? '#fff0ad' : '#ffb386';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(px, py, width < 530 ? 3.2 : 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (active) mark(ctx, `P${index + 1}`, x, z - 20, '#ffebbf', 10, altitude);
  }

  function drawShell(shot, phase) {
    const [sx, sz] = batteries[shot.battery];
    const [tx, tz] = at(shot.target);
    const arc = t => [sx + (tx - sx) * t, (altitude + 9) * (1 - t) + Math.sin(t * Math.PI) * 156, sz + (tz - sz) * t];
    const flight = Math.max(0, (phase - 0.23) / 0.77);
    if (flight <= 0) return;
    const tail = Array.from({length: 14}, (_, i) => arc(Math.max(0, flight - (13 - i) / 28)));
    line(ctx, tail, '#ff844ca8', 4);
    line(ctx, tail, '#ffe9b2', 1.4);
    const [x, y] = project(arc(flight));
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff3ae';
    ctx.fill();
  }

  function drawSplash(impact) {
    const phase = 1 - impact.remaining / 0.85;
    for (const shot of impact.shots) {
      const [x, z] = at(shot.target);
      const radius = 5 + phase * 36;
      const ring = Array.from({length: 25}, (_, i) => {
        const angle = i * Math.PI / 12;
        return [x + Math.cos(angle) * radius, 1, z + Math.sin(angle) * radius];
      });
      ctx.globalAlpha = 1 - phase;
      line(ctx, ring, '#e3faff', 2.4);
      const [px, py] = project([x, Math.sin(phase * Math.PI) * 36, z]);
      const splash = ctx.createRadialGradient(px, py, 0, px, py, 12 + 7 * phase);
      splash.addColorStop(0, '#fff4d2');
      splash.addColorStop(0.38, phase < 0.35 ? '#ffc05a' : '#92ddef');
      splash.addColorStop(1, '#ffb35800');
      ctx.fillStyle = splash;
      ctx.fillRect(px - 22, py - 22, 44, 44);
      ctx.globalAlpha = 1;
    }
  }

  function drawShip(voyage, now) {
    const [x, z, angle] = at(voyage.progress);
    const bob = Math.sin(now / 570) * 0.8;
    const shipScale = width < 530 ? 1.27 : 1;
    const point = ([along, y, across]) => [
      x + (Math.cos(angle) * along - Math.sin(angle) * across) * shipScale,
      y + bob,
      z + (Math.sin(angle) * along + Math.cos(angle) * across) * shipScale,
    ];
    const wake = 28 + voyage.power * 44;
    line(ctx, [[-wake, 1, -19], [-22, 1, -7]].map(point), '#b7eef099', 1.5);
    line(ctx, [[-wake, 1, 19], [-22, 1, 7]].map(point), '#b7eef099', 1.5);
    const faces = [];
    const body = [[-25, -9], [11, -9], [28, 0], [11, 9], [-25, 9]];
    const deck = body.map(([a, b]) => [a, 7, b]);
    body.forEach(([a, b], i) => {
      const j = (i + 1) % body.length;
      const [c, d] = body[j];
      faces.push([[deck[i], deck[j], [c, 0, d * 0.88], [a, 0, b * 0.88]], i > 1 ? '#285267' : '#143243']);
    });
    faces.push([deck, '#f0f3e9']);
    function box(x1, x2, z1, z2, top, colors) {
      const a = [x1, top, z1], b = [x2, top, z1], c = [x2, top, z2], d = [x1, top, z2];
      faces.push([[a, b, c, d], colors[0]], [[b, c, [x2, 7, z2], [x2, 7, z1]], colors[1]],
        [[c, d, [x1, 7, z2], [x2, 7, z2]], colors[1]], [[d, a, [x1, 7, z1], [x1, 7, z2]], colors[1]]);
    }
    box(-22, -14, -7, 7, 16, ['#f8faf6', '#9cafb5']);
    box(-11, -4, -6, 6, 12, ['#fbbf24', '#be7630']);
    box(-2, 5, -6, 6, 12, ['#42b7b5', '#287c88']);
    box(7, 14, -5, 5, 12, ['#e48852', '#ae5138']);
    const depth = vertices => vertices.reduce((sum, vertex) => sum + camera(vertex)[2], 0) / vertices.length;
    faces.map(([vertices, color]) => [vertices.map(point), color])
      .sort(([a], [b]) => depth(b) - depth(a))
      .forEach(([vertices, color]) => fill(ctx, vertices, color));
  }

  return {
    draw(voyage, now) {
      resize();
      ctx.drawImage(backdrop, 0, 0, width, height);
      ctx.setLineDash([5, 5]);
      line(ctx, route.map(([x, z]) => [x, 1, z]), '#f8d060', 1.7);
      ctx.setLineDash([]);
      const [ex, ez] = route.at(-1);
      const [px, py] = project([ex, 0, ez]);
      ctx.strokeStyle = '#fde28b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.stroke();
      mark(ctx, '탈출', ex, ez + 24, '#fce49a', 11);
      const attack = voyage.attack;
      batteries.slice(0, voyage.stage).forEach((battery, index) =>
        drawBattery(battery, index, attack?.shots.some(shot => shot.battery === index)));
      if (attack) drawRange(attack);
      drawShip(voyage, now);
      if (attack) attack.shots.forEach(shot => drawShell(shot, 1 - attack.remaining / attack.total));
      if (voyage.impact) drawSplash(voyage.impact);
    },
  };
}
