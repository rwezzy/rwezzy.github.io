/* Project demos: street-footage rules (COCO-SSD), the OmniRing gesture pad,
 * FFT Wiener deconvolution, and a chart drawn from my real training logs. */
(function () {
  // light-theme colours (names kept from the canvas code that uses them)
  const C = {
    neon: '#3ddc84', leaf: '#ff8fbd', turq: '#8fbcff', teal: '#14b5aa', bg: '#10241f', text3: '#85978f',
    hw: '#e8578f', sw: '#3d7be0', rule: '#e1eae5', ink: '#17302a', ink3: '#85978f', green: '#27a35f'
  };
  const MONO = '"DM Mono", ui-monospace, monospace';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onVisible = (el, fn, margin = '200px') => { const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: margin }); io.observe(el); };
  const watchVisible = (el, cb) => new IntersectionObserver(es => cb(es[0].isIntersecting), { rootMargin: '60px' }).observe(el);
  function fit(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function label(ctx, s, x, y, bg, fg = C.bg) {
    ctx.font = `500 11px ${MONO}`;
    const w = ctx.measureText(s).width + 10;
    ctx.fillStyle = bg; ctx.fillRect(x, y - 16, w, 16);
    ctx.fillStyle = fg; ctx.fillText(s, x + 5, y - 4);
  }
  function text(ctx, s, x, y, color = C.ink, size = 11, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${size}px ${MONO}`; ctx.textAlign = align; ctx.fillText(s, x, y);
  }
  function script(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
    });
  }
  let detector = null;
  function loadDetector() {
    if (!detector) detector = script('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js')
      .then(() => script('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'))
      .then(() => window.cocoSsd.load({ base: 'lite_mobilenet_v2' }));
    return detector;
  }
  function seg(root, attr, cb) {
    const btns = root.querySelectorAll('.seg button');
    btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset[attr]); }));
  }

  /* Canvas helper: DPR sizing, pointer tracking, visibility-gated animation loop. */
  function stage(canvas, draw) {
    const ctx = canvas.getContext('2d');
    const s = { ctx, w: 0, h: 0, p: { x: 0, y: 0, in: false, down: false, t: 0 }, visible: false, t: 0 };
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
      s.w = r.width; s.h = r.height;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.onresize) s.onresize();
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); s.p.x = e.clientX - r.left; s.p.y = e.clientY - r.top; s.p.t = performance.now(); };
    canvas.addEventListener('pointermove', e => { pos(e); s.p.in = true; });
    canvas.addEventListener('pointerenter', e => { pos(e); s.p.in = true; });
    canvas.addEventListener('pointerleave', () => { s.p.in = false; s.p.down = false; });
    canvas.addEventListener('pointerdown', e => { pos(e); s.p.in = true; s.p.down = true; if (s.ondown) s.ondown(e); });
    addEventListener('pointerup', e => { if (s.p.down) { s.p.down = false; if (s.onup) s.onup(e); } });
    new IntersectionObserver(es => { s.visible = es[0].isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!s.visible) return;
      s.t += dt;
      draw(s, dt);
    }
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 100); });
    size();
    requestAnimationFrame(loop);
    return s;
  }

  function seg(root, attr, cb) {
    const btns = root.querySelectorAll('.seg button');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.toggle('on', x === b));
      cb(b.dataset[attr]);
    }));
  }

  function text(ctx, s, x, y, color = C.ink, size = 11, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${size}px ${MONO}`; ctx.textAlign = align; ctx.fillText(s, x, y);
  }

  /* ============================================ fig 3 · zone rule on video */
  (function zone() {
    const root = document.getElementById('demo-zone'); if (!root) return;
    const video = root.querySelector('video'), canvas = root.querySelector('canvas'), state = root.querySelector('[data-state]'), log = root.querySelector('.zone__log');
    const elA = root.querySelector('[data-a]'), elB = root.querySelector('[data-b]'), elR = root.querySelector('[data-r]');
    const VEH = new Set(['car', 'truck', 'bus', 'motorcycle']);
    let op = 'AND', zonePts = [[0.22, 0.79], [0.96, 0.77], [1.0, 0.995], [0.2, 0.995]];
    let model = null, preds = [], busy = false, prev = null, cooldownUntil = -1, lastVT = 0, visible = false, drag = -1;
    const opText = { AND: 'person AND car', OR: 'person OR car', XOR: 'person XOR car', NOTA: 'NOT person' };
    const evalOp = (A, B) => op === 'AND' ? A && B : op === 'OR' ? A || B : op === 'XOR' ? A !== B : !A;
    seg(root, 'op', v => { op = v; prev = null; });
    watchVisible(root, v => { visible = v; if (!model) return; v ? video.play().catch(() => {}) : video.pause(); });

    function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
    const norm = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; };
    canvas.addEventListener('pointerdown', e => {
      const [x, y, r] = norm(e);
      drag = zonePts.findIndex(p => Math.hypot((p[0] - x) * r.width, (p[1] - y) * r.height) < 22);
      if (drag >= 0) { canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y, r] = norm(e);
      if (drag >= 0) { zonePts[drag] = [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]; prev = null; return; }
      canvas.style.cursor = zonePts.some(p => Math.hypot((p[0] - x) * r.width, (p[1] - y) * r.height) < 22) ? 'grab' : 'default';
    });
    canvas.addEventListener('pointerup', () => { drag = -1; });

    onVisible(root, async () => {
      state.textContent = 'loading detector…';
      try { model = await loadDetector(); } catch (e) { state.textContent = 'detector failed to load'; return; }
      video.preload = 'auto';
      try { await video.play(); } catch (e) { state.innerHTML = '<a href="#">play</a>'; state.querySelector('a').onclick = ev => { ev.preventDefault(); video.play(); }; }
      state.textContent = 'detecting live';
      requestAnimationFrame(loop);
    });

    async function detect() {
      if (busy || video.paused || video.readyState < 2) return;
      busy = true;
      try { preds = (await model.detect(video, 30, 0.4)).filter(p => p.class === 'person' || VEH.has(p.class)); } catch (e) { }
      busy = false;
    }
    function snapshot(t, A, B) {
      const li = document.createElement('li'), c = document.createElement('canvas');
      c.width = 300; c.height = 168; const x = c.getContext('2d');
      x.drawImage(video, 0, 0, 300, 168);
      const vw = video.videoWidth, vh = video.videoHeight;
      x.strokeStyle = C.neon; x.lineWidth = 2; x.beginPath(); zonePts.forEach((p, i) => i ? x.lineTo(p[0] * 300, p[1] * 168) : x.moveTo(p[0] * 300, p[1] * 168)); x.closePath(); x.stroke();
      preds.forEach(p => { x.strokeStyle = p.class === 'person' ? C.leaf : C.turq; x.strokeRect(p.bbox[0] / vw * 300, p.bbox[1] / vh * 168, p.bbox[2] / vw * 300, p.bbox[3] / vh * 168); });
      const s = document.createElement('span'); s.textContent = `● t=${t.toFixed(1)}s · ${opText[op]}`;
      li.append(c, s); log.prepend(li); while (log.children.length > 6) log.lastChild.remove();
    }
    let lastDetect = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;
      if (now - lastDetect > 110) { lastDetect = now; detect(); }
      const { ctx, w, h } = fit(canvas);
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720, sx = w / vw, sy = h / vh;
      const t = video.currentTime;
      if (t < lastVT - 0.5) { prev = null; cooldownUntil = -1; } // looped
      lastVT = t;
      const centers = preds.map(p => ({ p, cx: (p.bbox[0] + p.bbox[2] / 2) / vw, cy: (p.bbox[1] + p.bbox[3] / 2) / vh }));
      const A = centers.some(c => c.p.class === 'person' && inPoly(c.cx, c.cy, zonePts));
      const B = centers.some(c => VEH.has(c.p.class) && inPoly(c.cx, c.cy, zonePts));
      const R = evalOp(A, B);
      if (prev === false && R && t >= cooldownUntil) { cooldownUntil = t + 5; snapshot(t, A, B); }
      prev = R;
      elA.textContent = +A; elB.textContent = +B; elR.textContent = +R;
      elA.classList.toggle('on', A); elB.classList.toggle('on', B); elR.classList.toggle('on', R);

      ctx.clearRect(0, 0, w, h);
      ctx.beginPath(); zonePts.forEach((p, i) => i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h)); ctx.closePath();
      ctx.fillStyle = R ? 'rgba(60,255,143,.18)' : 'rgba(45,226,208,.10)'; ctx.fill();
      ctx.strokeStyle = R ? C.neon : C.turq; ctx.lineWidth = 2; ctx.setLineDash(R ? [] : [7, 5]); ctx.stroke(); ctx.setLineDash([]);
      zonePts.forEach(p => { ctx.fillStyle = C.bg; ctx.strokeStyle = C.turq; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      centers.forEach(({ p, cx, cy }) => {
        const isP = p.class === 'person', inside = inPoly(cx, cy, zonePts), col = isP ? C.leaf : C.turq;
        ctx.strokeStyle = col; ctx.lineWidth = inside ? 2.5 : 1.2; ctx.globalAlpha = inside ? 1 : 0.7;
        ctx.strokeRect(p.bbox[0] * sx, p.bbox[1] * sy, p.bbox[2] * sx, p.bbox[3] * sy);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx * w, cy * h, 3, 0, Math.PI * 2); ctx.fill();
        if (w > 520) label(ctx, `${p.class} ${p.score.toFixed(2)}`, p.bbox[0] * sx, Math.max(16, p.bbox[1] * sy), col);
        ctx.globalAlpha = 1;
      });
      if (t < cooldownUntil) label(ctx, `incident · cooldown ${(cooldownUntil - t).toFixed(1)} s`, 10, h - 8, C.neon);
    }
  })();


  /* ==================================================== OmniRing gesture pad */
  (function gesture() {
    const root = document.getElementById('demo-gesture'); if (!root) return;
    const bars = root.querySelector('.bars'), traceCv = root.querySelector('.gesture__trace');
    const CLASSES = ['circle', 'left-right', 'up-down', 'rest'];
    CLASSES.forEach(c => { const d = document.createElement('div'); d.className = 'bar'; d.innerHTML = `<span>${c}</span><i></i><b>0.00</b>`; bars.append(d); });
    const anomaly = document.createElement('p'); anomaly.style.margin = '0'; bars.after(anomaly);
    let pts = [], recording = false, result = null;
    const tctx = traceCv.getContext('2d');

    function features(p) {
      if (p.length < 3) return null;
      let len = 0, turn = 0, rx = 0, ry = 0, lastDx = 0, lastDy = 0, lastA = null;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < p.length; i++) {
        const dx = p[i].x - p[i - 1].x, dy = p[i].y - p[i - 1].y, d = Math.hypot(dx, dy);
        len += d;
        if (Math.abs(dx) > 1.5) { if (lastDx && Math.sign(dx) !== Math.sign(lastDx)) rx++; lastDx = dx; }
        if (Math.abs(dy) > 1.5) { if (lastDy && Math.sign(dy) !== Math.sign(lastDy)) ry++; lastDy = dy; }
        if (d > 2) { const a = Math.atan2(dy, dx); if (lastA !== null) { let da = a - lastA; da = Math.atan2(Math.sin(da), Math.cos(da)); turn += da; } lastA = a; }
      }
      p.forEach(q => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); });
      const bw = maxX - minX, bh = maxY - minY, closure = Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) / Math.max(len, 1);
      return { len, turn: Math.abs(turn), rx, ry, bw, bh, closure };
    }
    function classify(f) {
      if (!f) return [0, 0, 0, 1];
      const aspect = (f.bw + 1) / (f.bh + 1), extent = Math.max(f.bw, f.bh), moving = Math.min(1, extent / 45);
      const sc = [
        2.6 * moving * Math.min(1, f.turn / (2 * Math.PI)) * (1 - Math.min(1, f.closure * 2)) * Math.min(1, Math.min(aspect, 1 / aspect) * 1.6),
        2.2 * moving * Math.min(1, aspect / 3) * Math.min(1, (f.rx + 1) / 3),
        2.2 * moving * Math.min(1, (1 / aspect) / 3) * Math.min(1, (f.ry + 1) / 3),
        extent < 25 ? 3 : Math.max(0, 1.5 - extent / 50)
      ];
      const ex = sc.map(v => Math.exp(v * 2.2)), sum = ex.reduce((a, b) => a + b, 0);
      return ex.map(v => v / sum);
    }
    function show(prob, idle) {
      const top = idle ? -1 : prob.indexOf(Math.max(...prob));
      [...bars.children].forEach((b, i) => { b.classList.toggle('top', i === top); b.querySelector('i').style.setProperty('--v', (prob[i] * 100).toFixed(0) + '%'); b.querySelector('b').textContent = prob[i].toFixed(2); });
      const odd = !idle && Math.max(...prob) < 0.5;
      anomaly.textContent = idle ? 'waiting for a gesture' : odd ? 'anomaly: motion unlike anything trained' : 'anomaly: none';
      anomaly.style.color = odd ? C.hw : C.ink3;
    }
    function drawTrace() {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = traceCv.getBoundingClientRect();
      if (traceCv.width !== Math.round(r.width * dpr)) { traceCv.width = Math.round(r.width * dpr); traceCv.height = Math.round(r.height * dpr); }
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, r.width, r.height);
      tctx.strokeStyle = C.rule; tctx.beginPath(); tctx.moveTo(0, r.height / 2); tctx.lineTo(r.width, r.height / 2); tctx.stroke();
      if (pts.length < 3) return;
      [['x', C.hw], ['y', C.sw]].forEach(([k, col]) => {
        tctx.strokeStyle = col; tctx.lineWidth = 1.5; tctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const v = (pts[i][k] - pts[i - 1][k]) / Math.max(1, (pts[i].t - pts[i - 1].t)) * 16;
          const x = (i / (pts.length - 1)) * r.width, y = r.height / 2 - Math.max(-1, Math.min(1, v / 40)) * (r.height / 2 - 4);
          i === 1 ? tctx.moveTo(x, y) : tctx.lineTo(x, y);
        }
        tctx.stroke();
      });
    }
    show([0.25, 0.25, 0.25, 0.25], true);

    const s = stage(root.querySelector('.gesture__pad'), (s) => {
      const { ctx, w, h } = s;
      if (recording && s.p.down) {
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last.x - s.p.x, last.y - s.p.y) > 1) pts.push({ x: s.p.x, y: s.p.y, t: performance.now() });
        if (pts.length % 4 === 0) { show(classify(features(pts))); drawTrace(); }
      }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
      for (let x = 20; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 20; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      if (!pts.length) { text(ctx, 'press and draw here', w / 2, h / 2, C.ink3, 12, 'center'); return; }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.fillStyle = C.hw; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2); ctx.fill();
      if (result) text(ctx, `→ ${result}`, 12, 22, C.hw, 13);
    });
    s.ondown = () => { pts = []; result = null; recording = true; };
    s.onup = () => {
      recording = false;
      const prob = classify(features(pts)); show(prob); drawTrace();
      result = CLASSES[prob.indexOf(Math.max(...prob))];
    };
  })();

  /* ============================================ fig 5 · Wiener deconvolution */
  (function optics() {
    const root = document.getElementById('demo-optics'); if (!root) return;
    const N = 256, cBlur = root.querySelector('[data-panel="blur"]'), cW = root.querySelector('[data-panel="wiener"]');
    const dIn = root.querySelector('[data-depth]'), nIn = root.querySelector('[data-noise]');
    const dOut = root.querySelector('[data-depth-out]'), nOut = root.querySelector('[data-noise-out]');
    const pB = root.querySelector('[data-psnr-blur]'), pW = root.querySelector('[data-psnr-wiener]'), state = root.querySelector('[data-state]');
    let sharp = null, Fre = null, Fim = null;

    // in-place iterative radix-2 FFT on (re, im) at stride s, offset o
    function fft1(re, im, o, s, inv) {
      for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { const a = o + i * s, c = o + j * s; [re[a], re[c]] = [re[c], re[a]]; [im[a], im[c]] = [im[c], im[a]]; } }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const a = o + (i + k) * s, b = o + (i + k + len / 2) * s;
            const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
            const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
          }
        }
      }
    }
    function fft2(re, im, inv) {
      for (let r = 0; r < N; r++) fft1(re, im, r * N, 1, inv);
      for (let c = 0; c < N; c++) fft1(re, im, c, N, inv);
      if (inv) { const k = 1 / (N * N); for (let i = 0; i < N * N; i++) { re[i] *= k; im[i] *= k; } }
    }
    // Gaussian beam: w(z) = w0·sqrt(1 + (z/zR)^2), zR = π·w0²/λ (w0 = 1 µm, λ = 0.455 µm)
    const wz = z => Math.sqrt(1 + (z / (Math.PI / 0.455)) ** 2);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

    function draw(canvas, arr) {
      canvas.width = N; canvas.height = N;
      const ctx = canvas.getContext('2d'), im = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, arr[i] * 255)); im.data[i * 4] = v * 0.86; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v * 0.93; im.data[i * 4 + 3] = 255; }
      ctx.putImageData(im, 0, 0);
    }
    const psnr = a => { let m = 0; for (let i = 0; i < N * N; i++) m += (a[i] - sharp[i]) ** 2; m /= N * N; return (10 * Math.log10(1 / m)).toFixed(1) + ' dB PSNR'; };

    function run() {
      const z = +dIn.value, noise = +nIn.value / 100;
      dOut.textContent = z + ' µm'; nOut.textContent = (+nIn.value).toFixed(1) + '%';
      const sigma = wz(z) * 0.95; // pixels at this sampling
      const Hf = new Float64Array(N * N);
      for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
        const fu = (u < N / 2 ? u : u - N) / N, fv = (v < N / 2 ? v : v - N) / N;
        Hf[v * N + u] = Math.exp(-2 * Math.PI * Math.PI * sigma * sigma * (fu * fu + fv * fv));
      }
      // blur: G = F·H, back to space, add noise
      const re = new Float64Array(N * N), im = new Float64Array(N * N);
      for (let i = 0; i < N * N; i++) { re[i] = Fre[i] * Hf[i]; im[i] = Fim[i] * Hf[i]; }
      fft2(re, im, true);
      seed = 7;
      const g = new Float64Array(N * N);
      for (let i = 0; i < N * N; i++) g[i] = re[i] + noise * gauss();
      // Wiener: F̂ = G·H / (H² + K), with K from the noise-to-signal ratio
      const K = Math.max(2e-4, (noise * noise) / 0.08);
      const gr = Float64Array.from(g), gi = new Float64Array(N * N);
      fft2(gr, gi, false);
      for (let i = 0; i < N * N; i++) { const f = Hf[i] / (Hf[i] * Hf[i] + K); gr[i] *= f; gi[i] *= f; }
      fft2(gr, gi, true);
      draw(cBlur, g); draw(cW, gr);
      pB.textContent = psnr(g); pW.textContent = psnr(gr);
      state.textContent = `w(z) = ${wz(z).toFixed(2)} µm · K = ${K.toExponential(1)}`;
    }

    onVisible(root, () => {
      const img = new Image(); img.src = 'assets/usaf-1951.jpg';
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = N; c.height = N;
        const x = c.getContext('2d'), side = Math.min(img.width, img.height) * 0.62;
        x.drawImage(img, (img.width - side) / 2, (img.height - side) / 2 + img.height * 0.04, side, side, 0, 0, N, N);
        const d = x.getImageData(0, 0, N, N).data;
        sharp = new Float64Array(N * N); for (let i = 0; i < N * N; i++) sharp[i] = d[i * 4] / 255;
        Fre = Float64Array.from(sharp); Fim = new Float64Array(N * N); fft2(Fre, Fim, false);
        run();
      };
    });
    let t; const deb = () => { clearTimeout(t); t = setTimeout(() => sharp && run(), 30); };
    dIn.addEventListener('input', deb); nIn.addEventListener('input', deb);
  })();

  /* ====================================== research chart from training logs */
  (function chart() {
    const svg = document.querySelector('#chart-gaze svg'); if (!svg) return;
    // runs/gazefusion_v3_geo_cm/history.csv (val_deg per epoch) and docs/FIXES_V3.md
    const epochs = [3.506, 2.797, 2.636, 2.481, 2.588, 2.578, 2.631, 2.631];
    const stages = [['old model', 3.62, '#cdd9d3'], ['labels fixed', 2.99, '#8fbcff'], ['new model', 2.48, '#27a35f']];
    const ns = 'http://www.w3.org/2000/svg', el = (t, a, p = svg) => { const n = document.createElementNS(ns, t); for (const k in a) n.setAttribute(k, a[k]); p.append(n); return n; };
    const T = (s, x, y, a = {}) => { const t = el('text', { x, y, ...a }); t.textContent = s; return t; };
    // left: validation error per epoch
    const x0 = 44, x1 = 290, y0 = 40, y1 = 250, lo = 2.3, hi = 3.7;
    const X = i => x0 + (i / (epochs.length - 1)) * (x1 - x0), Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    [2.5, 3.0, 3.5].forEach(v => { el('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: '#e1eae5' }); T(v.toFixed(1) + '°', x0 - 8, Y(v) + 4, { 'text-anchor': 'end' }); });
    T('validation error by epoch', x0, 22, { fill: '#4b615a' });
    el('path', { d: epochs.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' '), fill: 'none', stroke: '#14b5aa', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'chart__line' });
    epochs.forEach((v, i) => el('circle', { cx: X(i), cy: Y(v), r: i === 3 ? 6 : 3.5, fill: i === 3 ? '#e8578f' : '#14b5aa', stroke: '#fff', 'stroke-width': 2 }));
    T('best: 2.48° (epoch 4)', X(3) + 8, Y(2.481) + 22, { fill: '#e8578f' });
    epochs.forEach((_, i) => T(String(i + 1), X(i), y1 + 18, { 'text-anchor': 'middle' }));
    T('epoch', (x0 + x1) / 2, y1 + 38, { 'text-anchor': 'middle' });
    // right: where each fix moved it
    const bx = 340, bw = 44, gap = 16;
    T('after each fix', bx, 22, { fill: '#4b615a' });
    stages.forEach(([name, v, col], i) => {
      const x = bx + i * (bw + gap), h = (v / 4) * (y1 - y0);
      el('rect', { x, y: y1 - h, width: bw, height: h, rx: 8, fill: col });
      T(v.toFixed(2) + '°', x + bw / 2, y1 - h - 8, { 'text-anchor': 'middle', fill: '#17302a' });
      name.split(' ').forEach((w, k) => T(w, x + bw / 2, y1 + 18 + k * 14, { 'text-anchor': 'middle' }));
    });
    const line = svg.querySelector('.chart__line');
    if (line && !reduced && line.getTotalLength) {
      const L = line.getTotalLength(); line.style.strokeDasharray = L; line.style.strokeDashoffset = L;
      onVisible(svg, () => { line.style.transition = 'stroke-dashoffset 1.6s ease'; requestAnimationFrame(() => { line.style.strokeDashoffset = 0; }); }, '0px');
    }
  })();
})();
