import { localize, searchEvents, MAX_TIMING_JITTER_SECONDS } from './soundscope-physics.js';

const root = document.querySelector('#soundscope');
if (root) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    initExperiment(root);
    import('./soundscope-hardware.js').then(module => module.initHardware(root.querySelector('.ss-hardware')))
      .catch(() => { root.querySelector('[data-hardware-status]').textContent = 'The 3D viewer could not load. You can still download the carrier model below.'; });
  }, { rootMargin: '300px' });
  observer.observe(root);
}

function initExperiment(root) {
  const $ = selector => root.querySelector(selector);
  const canvas = $('#ss-map'), ctx = canvas.getContext('2d');
  const fields = { x: $('#ss-x'), y: $('#ss-y'), z: $('#ss-z'), noise: $('#ss-noise') };
  const source = { x: .25, y: .1, z: 1.5 };
  const heatCanvas = document.createElement('canvas'), heatCtx = heatCanvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = { ring: 'Phone ring', clap: 'Hand clap', chime: 'Chime' };
  let result, noise = 0, events = [], audioContext, audioNodes = [];
  let pulse = 0, frame = 0, width = 600, height = 470, active = true;
  const palettes = { mint: [83, 226, 171], pink: [250, 104, 168], heat: [255, 205, 79] };
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div'); row.className = 'ss-delay';
    row.innerHTML = `<span>M${i + 1}</span><i><b></b></i><output></output>`;
    $('#ss-delays').append(row);
  }

  function readFields() {
    source.x = Number(fields.x.value); source.y = Number(fields.y.value); source.z = Number(fields.z.value);
    noise = Number(fields.noise.value); update();
  }
  function update() {
    result = localize(source, { noise, seed: 32, width: 121, height: 85 });
    $('#ss-x-out').textContent = `${Math.round(Math.abs(source.x) * 100)}% ${source.x < 0 ? 'left' : 'right'}`;
    $('#ss-y-out').textContent = `${Math.round(Math.abs(source.y) / .7 * 100)}% ${source.y < 0 ? 'down' : 'up'}`;
    $('#ss-z-out').textContent = `${source.z.toFixed(1)} m`;
    $('#ss-noise-out').textContent = `±${Math.round(noise * MAX_TIMING_JITTER_SECONDS * 1e6)} μs`;
    const angle = Math.atan(result.peak.x) * 180 / Math.PI;
    $('#ss-bearing').textContent = `ESTIMATE ${Math.abs(angle).toFixed(0)}° ${Math.abs(angle) < .5 ? 'CENTER' : angle < 0 ? 'LEFT' : 'RIGHT'}`;
    [...$('#ss-delays').children].forEach((row, i) => {
      const delay = result.delays[i] * 1e6;
      row.querySelector('b').style.setProperty('--delay', `${Math.min(100, delay / 400 * 100)}%`);
      row.querySelector('b').style.width = `${Math.min(100, delay / 400 * 100)}%`;
      row.querySelector('output').textContent = `${delay.toFixed(0)} μs`;
    });
    draw();
  }
  function bounds() { return { x: 30, y: 53, w: width - 60, h: height - 100 }; }
  function toPixel(point) { const b = bounds(); return { x: b.x + (point.x + 1) / 2 * b.w, y: b.y + (.7 - point.y) / 1.4 * b.h }; }
  function drawContour(level, alpha, lineWidth) {
    const b = bounds(), { grid, width: w, height: h } = result;
    ctx.beginPath();
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      const values = corners.map(([xx, yy]) => grid[yy * w + xx]), hits = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if ((values[i] >= level) === (values[j] >= level)) continue;
        const t = (level - values[i]) / (values[j] - values[i]);
        hits.push([b.x + (corners[i][0] + t * (corners[j][0] - corners[i][0])) / (w - 1) * b.w,
          b.y + (corners[i][1] + t * (corners[j][1] - corners[i][1])) / (h - 1) * b.h]);
      }
      for (let i = 0; i + 1 < hits.length; i += 2) { ctx.moveTo(...hits[i]); ctx.lineTo(...hits[i + 1]); }
    }
    ctx.strokeStyle = `rgba(232,255,239,${alpha})`; ctx.lineWidth = lineWidth; ctx.stroke();
  }
  function draw() {
    if (!result || !active) return;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#102c26'; ctx.fillRect(0, 0, width, height);
    const b = bounds();
    ctx.strokeStyle = '#29453b'; ctx.lineWidth = 1;
    for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(b.x + x / 10 * b.w, b.y); ctx.lineTo(b.x + x / 10 * b.w, b.y + b.h); ctx.stroke(); }
    for (let y = 0; y <= 7; y++) { ctx.beginPath(); ctx.moveTo(b.x, b.y + y / 7 * b.h); ctx.lineTo(b.x + b.w, b.y + y / 7 * b.h); ctx.stroke(); }
    const center = toPixel({ x: 0, y: 0 });
    ctx.setLineDash([3, 6]); ctx.strokeStyle = '#6e908177'; ctx.beginPath(); ctx.moveTo(center.x, b.y); ctx.lineTo(center.x, b.y + b.h); ctx.moveTo(b.x, center.y); ctx.lineTo(b.x + b.w, center.y); ctx.stroke(); ctx.setLineDash([]);
    heatCanvas.width = result.width; heatCanvas.height = result.height;
    const pixels = heatCtx.createImageData(result.width, result.height);
    const intensity = Number($('#ss-intensity').value), style = $('#ss-map-style').value;
    const color = palettes[$('#ss-palette').value];
    result.grid.forEach((value, i) => {
      const strength = style === 'bands' ? Math.floor(value * 5) / 5 : value;
      pixels.data[i * 4] = color[0]; pixels.data[i * 4 + 1] = color[1]; pixels.data[i * 4 + 2] = color[2];
      pixels.data[i * 4 + 3] = strength < .06 ? 0 : Math.round(Math.pow(strength, .8) * intensity * 255);
    });
    heatCtx.putImageData(pixels, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heatCanvas, b.x, b.y, b.w, b.h);
    if (style !== 'soft') { drawContour(.26, .3, 1); drawContour(.65, .85, 1.3); }
    const point = toPixel(source), peak = toPixel(result.peak);
    if (noise > .01) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#e9f9ee88'; ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(peak.x, peak.y); ctx.stroke(); ctx.setLineDash([]); }
    if (pulse > 0) {
      ctx.strokeStyle = `rgba(248,120,174,${pulse * .6})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(point.x, point.y, 18 + (1 - pulse) * 60, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = '#efffed'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(peak.x, peak.y, 9, 0, Math.PI * 2); ctx.stroke();
    [[-15, 0, -10, 0], [10, 0, 15, 0], [0, -15, 0, -10], [0, 10, 0, 15]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(peak.x + x1, peak.y + y1); ctx.lineTo(peak.x + x2, peak.y + y2); ctx.stroke(); });
    ctx.fillStyle = '#f878ae'; ctx.beginPath(); ctx.arc(point.x, point.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.font = '11px Figtree, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fce7f0';
    ctx.fillText(names[$('#ss-sound').value], Math.max(b.x + 38, Math.min(b.x + b.w - 38, point.x)), Math.max(b.y + 12, point.y - 23));
    ctx.font = '9px "DM Mono", monospace'; ctx.fillStyle = '#90b4a3'; ctx.textAlign = 'left';
    ctx.fillText('LEFT', b.x, b.y + b.h + 15); ctx.textAlign = 'right'; ctx.fillText('RIGHT', b.x + b.w, b.y + b.h + 15);
  }
  function animate() {
    cancelAnimationFrame(frame); if (reduceMotion) { draw(); return; }
    const began = performance.now();
    const tick = now => { pulse = Math.max(0, 1 - (now - began) / 950); draw(); if (pulse > 0 && active) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(canvas);
  const visibility = new IntersectionObserver(entries => { active = entries[0].isIntersecting; if (active) draw(); else cancelAnimationFrame(frame); }); visibility.observe(canvas);
  function movePointer(event) {
    const rect = canvas.getBoundingClientRect(), b = bounds();
    source.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left - b.x) / b.w) * 2 - 1));
    source.y = Math.max(-.7, Math.min(.7, .7 - ((event.clientY - rect.top - b.y) / b.h) * 1.4));
    fields.x.value = String(source.x); fields.y.value = String(source.y); update();
  }
  canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); movePointer(event); });
  canvas.addEventListener('pointermove', event => { if (canvas.hasPointerCapture(event.pointerId)) movePointer(event); });
  canvas.addEventListener('pointerup', event => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); });
  Object.values(fields).forEach(field => field.addEventListener('input', readFields));
  ['#ss-map-style', '#ss-palette', '#ss-intensity', '#ss-sound'].forEach(selector => $(selector).addEventListener('input', draw));

  async function playSound(type) {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      audioNodes.forEach(node => { try { node.stop(); } catch {} }); audioNodes = [];
      const t = audioContext.currentTime;
      if (type === 'clap') {
        const count = Math.round(audioContext.sampleRate * .22), buffer = audioContext.createBuffer(1, count, audioContext.sampleRate), samples = buffer.getChannelData(0);
        for (let i = 0; i < count; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * .025)) * .32;
        const node = audioContext.createBufferSource(), filter = audioContext.createBiquadFilter(); node.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 600; node.connect(filter).connect(audioContext.destination); node.start(); audioNodes.push(node);
      } else {
        const frequencies = type === 'ring' ? [440, 480] : [660, 990];
        for (const frequency of frequencies) {
          const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'sine';
          oscillator.connect(gain).connect(audioContext.destination);
          gain.gain.setValueAtTime(0, t);
          if (type === 'ring') {
            for (const start of [0, .42]) { gain.gain.linearRampToValueAtTime(.07, t + start + .015); gain.gain.setValueAtTime(.07, t + start + .2); gain.gain.linearRampToValueAtTime(0, t + start + .24); }
          } else { gain.gain.linearRampToValueAtTime(.09, t + .01); gain.gain.exponentialRampToValueAtTime(.0001, t + .9); }
          oscillator.start(t); oscillator.stop(t + 1); audioNodes.push(oscillator);
        }
      }
      return true;
    } catch { return false; }
  }
  function location(point) { return `${Math.abs(Math.atan(point.x) * 180 / Math.PI).toFixed(0)}° ${Math.abs(point.x) < .02 ? 'center' : point.x < 0 ? 'left' : 'right'}, ${point.z.toFixed(1)} m in the scene`; }
  function timeLabel(time) { return new Date(time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function showEvents(query = '') {
    const matches = searchEvents(events, query); $('#ss-events').replaceChildren();
    for (const event of matches.slice().reverse()) {
      const item = document.createElement('li'), button = document.createElement('button'); button.className = 'ss-event'; button.type = 'button';
      const title = document.createElement('b'), position = document.createElement('span'), time = document.createElement('small');
      title.textContent = event.label; position.textContent = location(event.source); time.textContent = `${timeLabel(event.time)} · replay ↗`;
      button.append(title, position, time); item.append(button); $('#ss-events').append(item);
      button.addEventListener('click', () => { Object.assign(source, event.source); noise = event.noise; Object.entries(fields).forEach(([key, field]) => { field.value = String(key === 'noise' ? noise : source[key]); }); $('#ss-sound').value = event.type; update(); animate(); playSound(event.type); $('#ss-search-answer').textContent = `Replaying the ${event.label.toLowerCase()} you placed at ${timeLabel(event.time)}: ${location(event.source)}.`; });
    }
    if (query.trim()) $('#ss-search-answer').textContent = matches.length ? `${matches.length} matching ${matches.length === 1 ? 'sound' : 'sounds'} in this session. Most recent: ${matches.at(-1).label.toLowerCase()} at ${timeLabel(matches.at(-1).time)}, ${location(matches.at(-1).source)}.` : 'No matching sounds in this session. Try “phone,” “clap,” or “chime.”';
    else $('#ss-search-answer').textContent = events.length ? `${events.length} ${events.length === 1 ? 'sound' : 'sounds'} saved in this session. Ask “did my phone ring?” or select an event to replay it.` : 'Play a sound above to start a history. Nothing is recorded from your microphone.';
  }
  $('#ss-emit').addEventListener('click', async () => {
    const type = $('#ss-sound').value, event = { label: names[type], type, time: Date.now() / 1000, source: { ...source }, noise, caption: location(source) };
    events.push(event); if (events.length > 50) events.shift(); $('#ss-query').value = ''; showEvents(); animate();
    if (!await playSound(type)) $('#ss-search-answer').textContent += ' Audio playback is unavailable in this browser; the timing experiment still works.';
  });
  $('#ss-search-form').addEventListener('submit', event => { event.preventDefault(); showEvents($('#ss-query').value); });
  $('#ss-query').addEventListener('search', () => showEvents($('#ss-query').value));
  $('#ss-clear').addEventListener('click', () => { events = []; $('#ss-query').value = ''; showEvents(); audioNodes.forEach(node => { try { node.stop(); } catch {} }); });
  window.addEventListener('pagehide', event => {
    cancelAnimationFrame(frame);
    if (event.persisted) { audioContext?.suspend(); return; }
    sizeObserver.disconnect(); visibility.disconnect(); audioContext?.close();
  });
  resize(); update();
}
