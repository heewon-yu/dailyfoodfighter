(function () {
  'use strict';

  const colors = {up: '#e13342', down: '#3971dd', ink: '#1f3049', mute: '#56677e', grid: '#e9eef5'};
  const averages = [{period: 5, color: '#7944c4'}, {period: 10, color: '#b3660b'}, {period: 20, color: '#11826b'}];
  const number = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 0});
  const priceText = value => number.format(value);
  const compactVolume = value => value >= 10000 ? (value / 10000).toFixed(1) + '만' : priceText(value);

  function timeText(time, seconds = true) {
    const total = 32400 + Math.floor(time);
    const pad = value => String(value).padStart(2, '0');
    return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + (seconds ? ':' + pad(total % 60) : '');
  }

  function gridStep(range) {
    const target = range / 5;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const unit = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= target);
    return Math.max(50, unit * magnitude);
  }

  function drawChart(canvas, stock, options) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const isTick = options.mode === 'tick';
    const data = isTick ? stock.ticks : stock.bars;
    const visible = Math.min(data.length, isTick ? (width < 490 ? 49 : 76) : 30);
    const start = data.length - visible;
    const bars = data.slice(start);
    const left = 9;
    const right = width - 62;
    const top = 13;
    const priceBottom = Math.round(height * .75) - 6;
    const volumeTop = priceBottom + 12;
    const base = height - 23;
    const spacing = (right - left) / (visible + 2);
    const x = index => left + spacing * (index + .5);
    const minimum = Math.min(...bars.map(bar => bar.low));
    const maximum = Math.max(...bars.map(bar => bar.high));
    const padding = Math.max(90, (maximum - minimum) * .12);
    const low = minimum - padding;
    const high = maximum + padding;
    const y = price => top + (high - price) * (priceBottom - top) / (high - low);
    const maxVolume = Math.max(1, ...bars.map(bar => bar.volume));

    function line(x1, y1, x2, y2, color) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const step = gridStep(high - low);
    for (let price = Math.ceil(low / step) * step; price <= high; price += step) {
      const position = y(price);
      line(left, position, right, position, colors.grid);
      ctx.fillStyle = colors.mute;
      ctx.fillText(priceText(price), right + 6, position);
    }
    const labels = width < 420 ? 4 : 7;
    for (let i = 0; i < labels; i++) {
      const index = Math.round(i * (visible - 1) / (labels - 1));
      const position = x(index);
      line(position, top, position, base, '#f0f3f7');
      const label = timeText(bars[index].time, isTick);
      const labelWidth = ctx.measureText(label).width;
      ctx.fillStyle = colors.mute;
      ctx.fillText(label, Math.max(left, Math.min(right - labelWidth, position - labelWidth / 2)), base + 13);
    }
    line(right, top, right, base, colors.grid);
    line(left, volumeTop - 6, right, volumeTop - 6, '#dbe4ef');
    line(left, base, right, base, colors.grid);

    const candleWidth = Math.max(2, Math.min(21, spacing * .66));
    bars.forEach((bar, index) => {
      const position = x(index);
      const color = bar.close > bar.open ? colors.up : bar.close < bar.open ? colors.down : '#8896a9';
      line(position, y(bar.high), position, y(bar.low), color);
      ctx.fillStyle = color;
      ctx.fillRect(position - candleWidth / 2, Math.min(y(bar.open), y(bar.close)), candleWidth, Math.max(1.3, Math.abs(y(bar.open) - y(bar.close))));
      const volumeHeight = bar.volume / maxVolume * (base - volumeTop - 8);
      ctx.globalAlpha = .44;
      ctx.fillRect(position - candleWidth / 2, base - volumeHeight, candleWidth, volumeHeight);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = colors.mute;
    ctx.fillText('거래량', left + 3, volumeTop + 4);
    ctx.fillText(compactVolume(maxVolume), right + 6, volumeTop + 4);

    const legend = [];
    if (options.showMA) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, priceBottom - top);
      ctx.clip();
      averages.forEach(({period, color}) => {
        const points = bars.map((_, index) => {
          const end = start + index + 1;
          if (end < period) return null;
          return data.slice(end - period, end).reduce((sum, bar) => sum + bar.close, 0) / period;
        });
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        points.forEach((value, index) => {
          if (value === null) return;
          if (index === 0 || points[index - 1] === null) ctx.moveTo(x(index), y(value));
          else ctx.lineTo(x(index), y(value));
        });
        ctx.stroke();
        legend.push({period, color, value: points.at(-1)});
      });
      ctx.restore();
    }

    const lastPrice = stock.price;
    const lastY = y(lastPrice);
    const marker = lastPrice > stock.reference ? colors.up : lastPrice < stock.reference ? colors.down : '#435774';
    ctx.setLineDash([4, 3]);
    line(left, lastY, right, lastY, marker);
    ctx.setLineDash([]);
    ctx.fillStyle = marker;
    ctx.fillRect(right + 1, lastY - 8, width - right - 2, 16);
    ctx.fillStyle = 'white';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(priceText(lastPrice), right + 6, lastY);

    const cursor = options.cursor;
    let bar = bars.at(-1);
    if (cursor && cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= base) {
      const index = Math.max(0, Math.min(visible - 1, Math.round((cursor.x - left) / spacing - .5)));
      const position = x(index);
      bar = bars[index];
      ctx.setLineDash([3, 3]);
      line(position, top, position, base, '#7587a0');
      if (cursor.y <= priceBottom) line(left, cursor.y, right, cursor.y, '#7587a0');
      ctx.setLineDash([]);
      ctx.fillStyle = '#1f3049';
      ctx.beginPath();
      ctx.arc(position, y(bar.close), 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
    return {bar, legend};
  }

  globalThis.ScalpChart = {drawChart, timeText};
}());

