function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const mapPoint = (lon, lat) => [(lon - 55.64) / 1.49 * 1000, (27.23 - lat) / 1.37 * 610];
  const land = coast.slice(1, -1).split('ZM').map(ring => {
    const points = ring.split('L');
    if (points[0] === points.at(-1)) points.pop();
    return points.map(point => point.split(',').map(Number));
  });
  const route = [[55.75, 26.29], [56.04, 26.29], [56.25, 26.41], [56.44, 26.51],
    [56.62, 26.49], [56.83, 26.36], [57.02, 26.17]].map(point => mapPoint(...point));
  const segments = route.slice(1).map(([x, z], i) => Math.hypot(x - route[i][0], z - route[i][1]));
  const routeLength = segments.reduce((sum, length) => sum + length, 0);
  const batteries = Escape.batteries.map(point => mapPoint(...point));
  const near = 3;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  let width, height, density, focal, horizon, eyeX, eyeY, eyeZ, forwardX, forwardZ;

  function at(progress) {
    let distance = clamp(progress, 0, 1) * routeLength;
    let index = 0;
    while (index < segments.length - 1 && distance > segments[index]) distance -= segments[index++];
    const [x, z] = route[index];
    const [endX, endZ] = route[index + 1];
    const t = distance / segments[index];
    return [x + (endX - x) * t, z + (endZ - z) * t];
  }

  function local([x, y, z]) {
    const dx = x - eyeX;
    const dz = z - eyeZ;
    return [dz * forwardX - dx * forwardZ, y - eyeY, dx * forwardX + dz * forwardZ];
  }

  function project([x, y, z]) {
    return [width / 2 + focal * x / z, horizon - focal * y / z];
  }

  function intersectNear(a, b) {
    const t = (near - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
  }

  function screenPath(points) {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }

  function paint(vertices, color, outline) {
    const points = vertices.map(local);
    const visible = [];
    let prev = points.at(-1);
    for (const point of points) {
      if ((prev[2] >= near) !== (point[2] >= near)) visible.push(intersectNear(prev, point));
      if (point[2] >= near) visible.push(point);
      prev = point;
    }
    if (visible.length < 3) return;
    screenPath(visible.map(project));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  }

  function addSegment(a, b) {
    if (a[2] < near && b[2] < near) return;
    const from = a[2] < near ? intersectNear(a, b) : a;
    const to = b[2] < near ? intersectNear(a, b) : b;
    ctx.moveTo(...project(from));
    ctx.lineTo(...project(to));
  }

  function line(vertices, color, thickness) {
    const points = vertices.map(local);
    ctx.beginPath();
    for (let i = 1; i < points.length; i++) addSegment(points[i - 1], points[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();
  }

  function box(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function text(value, x, y, size, color, align = 'center') {
    ctx.font = `800 ${size}px system-ui, "Malgun Gothic", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === rect.width && height === rect.height && density === ratio) return;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    density = ratio;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);
    focal = Math.max(height * 0.88, width * 0.46);
  }

  function drawSea(now) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 4);
    sky.addColorStop(0, '#659ab4');
    sky.addColorStop(0.67, '#acd4d9');
    sky.addColorStop(1, '#f3e3bc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 4);
    const sunX = width * 0.78;
    const sunY = horizon * 0.36;
    const haze = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, horizon * 0.72);
    haze.addColorStop(0, '#ffefc9de');
    haze.addColorStop(0.38, '#ffeac67a');
    haze.addColorStop(1, '#ffeac600');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, horizon);
    ctx.fillStyle = '#fff0cd55';
    ctx.fillRect(width * 0.03, horizon * 0.65, width * 0.46, 2);
    ctx.fillRect(width * 0.54, horizon * 0.76, width * 0.37, 2);

    const water = ctx.createLinearGradient(0, horizon, 0, height);
    water.addColorStop(0, '#5b9da5');
    water.addColorStop(0.34, '#28657c');
    water.addColorStop(1, '#092d47');
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.beginPath();
    const ix = Math.floor(eyeX / 20);
    const iz = Math.floor(eyeZ / 20);
    for (let row = iz - 14; row <= iz + 14; row++) {
      for (let col = ix - 14; col <= ix + 14; col++) {
        const x = col * 20 + 7 * Math.sin(row * 2.7 + col);
        const z = row * 20 + 7 * Math.cos(col * 1.7 + row) + 1.2 * Math.sin(now / 730 + col);
        const a = local([x, 0, z]);
        if (a[2] < 11 || Math.abs(a[0]) > a[2] * 1.5) continue;
        addSegment(a, [a[0] + 3.5 + Math.abs(Math.sin(row + col)) * 9, a[1], a[2] + 0.7]);
      }
    }
    ctx.strokeStyle = '#b9eced40';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  const boundary = (a, b) => [0, 1].some(axis =>
    a[axis] === b[axis] && [0, axis === 0 ? 1000 : 610].includes(a[axis]));
  const cliffHeight = (x, z) => 11 + 11 * Math.sin(x * 0.028 + z * 0.012) ** 2 + 17 * Math.cos(x * 0.014 - z * 0.017) ** 2;
  const shores = land.flatMap(ring => {
    const area = ring.reduce((sum, [x, z], i) => {
      const [endX, endZ] = ring[(i + 1) % ring.length];
      return sum + x * endZ - z * endX;
    }, 0);
    return ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      if (boundary(a, b)) return [];
      const [x, z] = a;
      const [endX, endZ] = b;
      const [h1, h2] = [cliffHeight(...a), cliffHeight(...b)];
      const light = 0.5 + 0.5 * Math.sin(Math.atan2(endZ - z, endX - x) + 1.3);
      return [{
        a, b, area, light, center: [(x + endX) / 2, 0, (z + endZ) / 2],
        slope: [[x, h1, z], [endX, h2, endZ], [endX, h2 * 0.45, endZ], [x, h1 * 0.45, z]],
        base: [[x, h1 * 0.45, z], [endX, h2 * 0.45, endZ], [endX, 0, endZ], [x, 0, z]],
      }];
    });
  });

  function drawCoast() {
    const faces = shores.flatMap(shore => {
      const {a: [x, z], b: [endX, endZ], area, center} = shore;
      const cross = (endX - x) * (eyeZ - z) - (endZ - z) * (eyeX - x);
      const depth = local(center)[2];
      return cross * area < 0 && depth > near ? [{shore, depth}] : [];
    });
    faces.sort((a, b) => b.depth - a.depth);
    for (const {shore, depth} of faces) {
      const fog = Math.min(0.63, depth / 1050);
      const tone = shore.light * 26;
      const color = (r, g, b) => `rgb(${Math.round(r + tone + fog * 72)} ${Math.round(g + tone + fog * 71)} ${Math.round(b + tone + fog * 100)})`;
      paint(shore.slope, color(91, 104, 85));
      paint(shore.base, color(64, 82, 75));
      line([[shore.a[0], 0.35, shore.a[1]], [shore.b[0], 0.35, shore.b[1]]], '#c1d9c083', 1);
    }
  }

  function routePoint(progress, side = 0) {
    const [x, z] = at(progress);
    if (!side) return [x, 0.45, z];
    const [fromX, fromZ] = at(progress - 0.007);
    const [toX, toZ] = at(progress + 0.007);
    const angle = Math.atan2(toZ - fromZ, toX - fromX);
    return [x - Math.sin(angle) * side, 0.45, z + Math.cos(angle) * side];
  }

  function section(start, end, side) {
    return Array.from({length: 17}, (_, index) => routePoint(start + (end - start) * index / 16, side));
  }

  function drawRange(attack, now) {
    const start = clamp(attack.start, 0, 1);
    const end = clamp(attack.end, 0, 1);
    const pulse = 0.48 + 0.12 * Math.sin(now / 120);
    paint([...section(start, end, -14), ...section(end, start, 14)], `rgba(250,67,37,${pulse})`, '#ffc297');
    for (let stripe = 1; stripe < 6; stripe++) {
      const p = start + (end - start) * stripe / 6;
      line([routePoint(p, -14), routePoint(p, 14)], '#ffd3a79e', 1);
    }
  }

  function drawRoute(progress) {
    const start = Math.ceil((progress + 0.033) * 49);
    for (let i = start; i < 49; i++) {
      const from = i / 49;
      line([routePoint(from), routePoint(from + 0.008)], '#ffe6a5a8', 1.5);
    }
    const [x, z] = route.at(-1);
    const end = local([x, 4, z]);
    if (end[2] > near) {
      const [px, py] = project(end);
      if (px > 0 && px < width) {
        line([[x, 0, z], [x, 25, z]], '#ffe4a48c', 1);
        if (end[2] < 460) text('탈출', px, py - 13, 10, '#fff0b0');
      }
    }
  }

  function drawShell(shot, phase) {
    const [sx, sz] = batteries[shot.battery];
    const [tx, tz] = at(shot.target);
    const arcHeight = 31 + Math.min(33, Math.hypot(tx - sx, tz - sz) * 0.073);
    const arc = t => [sx + (tx - sx) * t, (cliffHeight(sx, sz) + 3) * (1 - t) + Math.sin(t * Math.PI) * arcHeight, sz + (tz - sz) * t];
    const flight = Math.max(0, (phase - 0.23) / 0.77);
    if (flight <= 0) return;
    const tail = Array.from({length: 13}, (_, i) => arc(Math.max(0, flight - (12 - i) / 42)));
    line(tail, '#fb6129a3', 5);
    line(tail, '#fff0b9', 1.7);
    const head = local(arc(flight));
    if (head[2] < near) return;
    const [x, y] = project(head);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6c9';
    ctx.fill();
  }

  function drawSplash(impact) {
    const phase = 1 - impact.remaining / 0.85;
    ctx.globalAlpha = 1 - phase;
    for (const shot of impact.shots) {
      const [x, z] = at(shot.target);
      const radius = 4 + phase * 27;
      const ring = Array.from({length: 25}, (_, i) => {
        const angle = i * Math.PI / 12;
        return [x + Math.cos(angle) * radius, 0.55, z + Math.sin(angle) * radius];
      });
      line(ring, '#d8faff', 2.2);
      const pillar = 5 + Math.sin(phase * Math.PI) * 29;
      paint([[x - 4, 0, z], [x, pillar, z], [x + 4, 0, z]], '#d8faffaf');
    }
    ctx.globalAlpha = 1;
  }

  function drawDeck(x, z) {
    const point = ([distance, y, side]) =>
      [x + forwardX * distance - forwardZ * side, y, z + forwardZ * distance + forwardX * side];
    const surface = (points, color, edge) => paint(points.map(point), color, edge);
    surface([[-10, 4, -8.5], [18, 4, -8.5], [30, 5, 0], [18, 4, 8.5], [-10, 4, 8.5]], '#aab6ad', '#dae5d6');
    surface([[-10, 3.9, -6.7], [17, 4, -6.7], [26, 4.9, 0], [17, 4, 6.7], [-10, 3.9, 6.7]], '#59686d');
    for (const [from, to, color, shade] of [[15, 20, '#8fae9d', '#4e7e76'], [8, 14, '#d9994d', '#8a4f2b'], [1, 7, '#a4bbbf', '#55737e']]) {
      for (const side of [-4.8, 0.45]) {
        const right = side + 4.3;
        surface([[from, 4, side], [from, 7.4, side], [from, 7.4, right], [from, 4, right]], shade);
        surface([[from, 7.4, side], [to, 7.4, side], [to, 7.4, right], [from, 7.4, right]], color, '#20364194');
        for (let i = 1; i < 5; i++) {
          line([[from + (to - from) * i / 5, 7.42, side], [from + (to - from) * i / 5, 7.42, right]].map(point), '#263c4a55', 0.7);
        }
      }
    }
    for (const side of [-8.5, 8.5]) {
      line([[-10, 5.3, side], [18, 5.3, side], [30, 6.2, 0]].map(point), '#d6e7e1', 1.6);
    }
    line([[28, 5, 0], [28, 10.4, 0]].map(point), '#e6eed8', 1.1);
  }

  function drawChart(voyage) {
    const w = width < 500 ? 103 : 142;
    const h = w * 0.65;
    const left = width - w - 11;
    const top = 11;
    const chart = (x, z) => [left + 6 + x / 1000 * (w - 12), top + 13 + z / 610 * (h - 19)];
    box(left, top, w, h, 7, '#0b283cf0', '#b0d9dc7a');
    text('항해도', left + 7, top + 9, 8, '#d2edef', 'left');
    for (const ring of land) {
      screenPath(ring.map(([x, z]) => chart(x, z)));
      ctx.closePath();
      ctx.fillStyle = '#718b76';
      ctx.fill();
    }
    screenPath(route.map(([x, z]) => chart(x, z)));
    ctx.strokeStyle = '#edc978';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (voyage.attack) {
      const {start, end} = voyage.attack;
      screenPath(section(start, end, 0).map(([x, , z]) => chart(x, z)));
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ff704d';
      ctx.stroke();
    }
    const [x, y] = chart(...at(voyage.progress));
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#e1ffff';
    ctx.fill();
  }

  function drawBridge(voyage) {
    const course = Math.round((Math.atan2(forwardX, -forwardZ) * 180 / Math.PI + 360) % 360);
    box(11, 11, 105, 31, 6, '#0a233be6', '#c7e2df64');
    text('선교 · 전방 시점', 19, 20, 10, '#e4efea', 'left');
    text(`방위 ${String(course).padStart(3, '0')}°`, 19, 34, 8, '#acd6d9', 'left');
    if (voyage.attack) {
      const {boost, remaining} = voyage.attack;
      const w = width < 500 ? 141 : 164;
      const y = width < 500 ? 82 : 18;
      box((width - w) / 2, y, w, 28, 6, '#642626ef', '#ffc498');
      text(`${boost ? '가속' : '감속'} 경보  ·  착탄 ${remaining.toFixed(1)}초`, width / 2, y + 14, 11, '#fff0d5');
    }
    drawChart(voyage);
  }

  return {
    draw(voyage, now) {
      resize();
      const [x, z] = at(voyage.progress);
      const [fromX, fromZ] = at(voyage.progress - 0.035);
      const [toX, toZ] = at(voyage.progress + 0.035);
      const length = Math.hypot(toX - fromX, toZ - fromZ);
      forwardX = (toX - fromX) / length;
      forwardZ = (toZ - fromZ) / length;
      eyeX = x - forwardX * 13;
      eyeZ = z - forwardZ * 13;
      eyeY = 16 + Math.sin(now / 710) * 0.43;
      horizon = height * 0.39 + Math.sin(now / 930) * 1.6;
      drawSea(now);
      drawCoast();
      drawRoute(voyage.progress);
      if (voyage.attack) drawRange(voyage.attack, now);
      drawDeck(x, z);
      if (voyage.attack) voyage.attack.shots.forEach(shot => drawShell(shot, 1 - voyage.attack.remaining / voyage.attack.total));
      if (voyage.impact) drawSplash(voyage.impact);
      drawBridge(voyage);
    },
  };
}
