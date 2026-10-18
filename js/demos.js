/* Live demos: a real object detector, real face tracking, real motion sensors,
 * and real FFT deconvolution, all in the browser. Each starts when scrolled to. */
(function () {
  const C = { neon: '#3cff8f', leaf: '#b6f05a', turq: '#2de2d0', teal: '#14b8a6', tealD: '#0d5c55', text: '#e4f1ea', text2: '#a6bfb4', text3: '#6f8a80', bg: '#050a08' };
  const MONO = '"Geist Mono", ui-monospace, monospace';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onVisible = (el, fn, margin = '200px') => {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: margin });
    io.observe(el);
  };
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

  /* ================================================ fig 1 · dwell selector */
  (function dwell() {
    const root = document.getElementById('demo-dwell'); if (!root) return;
    const img = root.querySelector('img'), canvas = root.querySelector('canvas'), state = root.querySelector('[data-state]');
    // gaze_lock.py: SELECT 0.9 s, TAU 1.5 s, DOMINANCE 2, cap 1.5×SELECT, soft score exp(-(d/σ)^2)
    const SELECT = 0.9, TAU = 1.5, DOM = 2, CAP = SELECT * 1.5;
    let objs = [], gaze = null, gazeAt = 0, locked = null, lockT = 0, running = false, visible = false, auto = 0;
    canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); gaze = { x: e.clientX - r.left, y: e.clientY - r.top }; gazeAt = performance.now(); });
    canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); gaze = { x: e.clientX - r.left, y: e.clientY - r.top }; gazeAt = performance.now(); });
    watchVisible(root, v => { visible = v; });

    onVisible(root, async () => {
      try {
        if (!img.complete) await new Promise(r => img.onload = r);
        state.textContent = 'loading detector…';
        const model = await loadDetector();
        // detect on a detached copy so boxes come back in natural-resolution pixels
        const full = new Image(); full.src = img.currentSrc || img.src; await full.decode();
        const preds = await model.detect(full, 20, 0.3);
        // like the real arm: only tabletop objects, and ignore boxes that swallow the whole scene
        const TABLE = new Set(['cup', 'bottle', 'wine glass', 'bowl', 'laptop', 'cell phone', 'book', 'keyboard', 'mouse', 'remote', 'scissors', 'vase', 'clock', 'potted plant', 'teddy bear', 'banana', 'apple', 'orange']);
        objs = preds.filter(p => TABLE.has(p.class) && p.bbox[2] * p.bbox[3] < full.naturalWidth * full.naturalHeight * 0.5)
          .map(p => ({ cls: p.class, score: p.score, bb: p.bbox, ev: 0 }));
        state.textContent = `${objs.length} objects · COCO-SSD`;
        running = true; requestAnimationFrame(loop);
      } catch (err) { state.textContent = 'detector failed to load'; }
    });

    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.2, (now - last) / 1000); last = now;
      if (!visible || !running) return;
      const { ctx, w, h } = fit(canvas);
      const sx = w / img.naturalWidth, sy = h / img.naturalHeight, sigma = 0.07 * w;
      let g = gaze && now - gazeAt < 3500 ? gaze : null;
      if (!g && !reduced && objs.length) { // demo gaze drifts between objects when idle
        auto += dt; const i = Math.floor(auto / 3.2) % objs.length, b = objs[i].bb;
        g = { x: (b[0] + b[2] / 2) * sx + Math.sin(auto * 6) * 8, y: (b[1] + b[3] / 2) * sy + Math.cos(auto * 5) * 8 };
      }
      if (locked) { lockT += dt; if (lockT > 2.6) { locked = null; objs.forEach(o => o.ev = 0); } }
      else {
        objs.forEach(o => {
          let s = 0;
          if (g) {
            const x0 = o.bb[0] * sx, y0 = o.bb[1] * sy, x1 = x0 + o.bb[2] * sx, y1 = y0 + o.bb[3] * sy;
            const dx = Math.max(x0 - g.x, 0, g.x - x1), dy = Math.max(y0 - g.y, 0, g.y - y1);
            s = Math.exp(-(dx * dx + dy * dy) / (sigma * sigma));
          }
          o.ev = Math.min(CAP, o.ev * Math.exp(-dt * (1 - s) / TAU) + s * dt);
        });
        // nested boxes: the innermost one under the gaze gets full credit (handled by sort on area when tied)
        const r = [...objs].sort((a, b) => b.ev - a.ev);
        if (r.length && r[0].ev >= SELECT && r[0].ev >= DOM * (r[1] ? r[1].ev : 0)) { locked = r[0]; lockT = 0; }
      }
      ctx.clearRect(0, 0, w, h);
      if (locked) { ctx.fillStyle = 'rgba(2,8,6,.45)'; ctx.fillRect(0, 0, w, h); }
      const lead = [...objs].sort((a, b) => b.ev - a.ev)[0];
      objs.forEach(o => {
        const x = o.bb[0] * sx, y = o.bb[1] * sy, bw = o.bb[2] * sx, bh = o.bb[3] * sy;
        const isL = locked === o, isLead = !locked && o === lead && o.ev > 0.12;
        const col = isL ? C.leaf : isLead ? C.neon : C.turq;
        ctx.lineWidth = isL ? 4 : isLead ? 3 : 1.5; ctx.strokeStyle = col; ctx.strokeRect(x, y, bw, bh);
        label(ctx, `${o.cls} ${o.score.toFixed(2)}`, x, Math.max(16, y), col);
        const pr = Math.min(1, o.ev / SELECT);
        if (pr > 0.01 || isL) { ctx.fillStyle = 'rgba(2,8,6,.6)'; ctx.fillRect(x, y + bh - 6, bw, 6); ctx.fillStyle = col; ctx.fillRect(x, y + bh - 6, bw * (isL ? 1 : pr), 6); }
      });
      if (g && !locked) {
        ctx.strokeStyle = C.neon; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = C.neon; ctx.beginPath(); ctx.arc(g.x, g.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      if (locked) label(ctx, lockT < 1.3 ? `LOCKED · ${locked.cls} · frame frozen` : `→ 3D target from depth · planning grasp`, 12, 30, C.leaf);
    }
  })();

  /* ============================================== fig 2 · face landmarker */
  (function face() {
    const root = document.getElementById('demo-face'); if (!root) return;
    const video = root.querySelector('video'), canvas = root.querySelector('canvas'), gate = root.querySelector('.cam__gate');
    const btn = root.querySelector('[data-start]'), state = root.querySelector('[data-state]'), readout = root.querySelector('.cam__readout');
    const q = s => root.querySelector(s);
    const VB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    let lm = null, stream = null, visible = false, lastT = -1;
    watchVisible(root, v => { visible = v; });

    async function start() {
      btn.disabled = true; btn.textContent = 'starting…';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
        video.srcObject = stream; await video.play();
        state.textContent = 'loading face model…';
        if (!lm) {
          const vision = await import(VB + '/vision_bundle.mjs');
          const files = await vision.FilesetResolver.forVisionTasks(VB + '/wasm');
          lm = await vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true
          });
        }
        gate.classList.add('off'); readout.hidden = false;
        state.innerHTML = 'camera on · <a href="#" data-stop>stop</a>';
        state.querySelector('[data-stop]').addEventListener('click', e => { e.preventDefault(); stop(); });
        requestAnimationFrame(loop);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Turn on camera';
        state.textContent = err && err.name === 'NotAllowedError' ? 'camera permission denied' : 'camera unavailable';
      }
    }
    function stop() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; video.srcObject = null;
      gate.classList.remove('off'); readout.hidden = true; btn.disabled = false; btn.textContent = 'Turn on camera';
      state.textContent = 'camera off';
      const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
    }
    btn.addEventListener('click', start);

    const ratio = (p, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1; return ((p.x - a.x) * vx + (p.y - a.y) * vy) / L; };
    function loop() {
      if (!stream) return;
      requestAnimationFrame(loop);
      if (!visible || video.readyState < 2 || video.currentTime === lastT) return;
      lastT = video.currentTime;
      const res = lm.detectForVideo(video, performance.now());
      const { ctx, w, h } = fit(canvas);
      ctx.clearRect(0, 0, w, h);
      const pts = res.faceLandmarks && res.faceLandmarks[0];
      if (!pts) { q('[data-ix]').textContent = 'no face'; return; }
      // map normalized coords into the object-fit:cover, mirrored video box
      const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(w / vw, h / vh), ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
      const P = p => ({ x: w - (ox + p.x * vw * s), y: oy + p.y * vh * s });
      ctx.fillStyle = 'rgba(45,226,208,.55)';
      for (let i = 0; i < 468; i += 2) { const p = P(pts[i]); ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
      [[468, 33, 133], [473, 362, 263]].forEach(([iris, a, b]) => {
        const c = P(pts[iris]), e1 = P(pts[a]), e2 = P(pts[b]);
        ctx.strokeStyle = C.leaf; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
        const r = Math.hypot(P(pts[iris + 1]).x - c.x, P(pts[iris + 1]).y - c.y);
        ctx.strokeStyle = C.neon; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(3, r), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = C.neon; ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2); ctx.fill();
      });
      const rx = (ratio(pts[468], pts[33], pts[133]) + ratio(pts[473], pts[362], pts[263])) / 2;
      const ry = (ratio(pts[468], pts[159], pts[145]) + ratio(pts[473], pts[386], pts[374])) / 2;
      q('[data-ix]').textContent = rx.toFixed(2); q('[data-iy]').textContent = ry.toFixed(2);
      const m = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
      if (m) {
        const d = m.data; // column-major 4×4
        const yaw = Math.atan2(d[8], d[10]) * 180 / Math.PI, pitch = Math.asin(Math.max(-1, Math.min(1, -d[9]))) * 180 / Math.PI;
        q('[data-yaw]').textContent = (-yaw).toFixed(0) + '°'; q('[data-pitch]').textContent = pitch.toFixed(0) + '°';
      }
      const bs = res.faceBlendshapes && res.faceBlendshapes[0];
      if (bs) {
        const get = n => (bs.categories.find(c => c.categoryName === n) || { score: 0 }).score;
        q('[data-blink]').textContent = (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2 > 0.45 ? 'yes' : 'no';
      }
    }
  })();

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

  /* ================================================== fig 4 · motion sensor */
  (function imu() {
    const root = document.getElementById('demo-imu'); if (!root) return;
    const plot = root.querySelector('.imu__plot'), gate = root.querySelector('.imu__gate'), state = root.querySelector('[data-state]');
    const bars = root.querySelector('.bars'), anom = root.querySelector('.imu__anom');
    const phone = root.querySelector('.imu__phone'), desk = root.querySelector('.imu__desk');
    const coarse = matchMedia('(pointer: coarse)').matches;
    phone.style.display = coarse ? '' : 'none'; desk.style.display = coarse ? 'none' : '';
    const CLS = ['circle', 'left-right', 'up-down', 'rest'];
    CLS.forEach(c => { const d = document.createElement('div'); d.className = 'bar'; d.innerHTML = `<span>${c}</span><i></i><b>–</b>`; bars.append(d); });
    // QR code to open this demo on a phone
    if (window.qrcode && !coarse) {
      const qr = qrcode(0, 'M'); qr.addData(location.href.split('#')[0] + '#omniring'); qr.make();
      root.querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });
    }
    const buf = []; // {t, ax, ay, az, g}
    let source = null, visible = false, mouse = null;
    watchVisible(root, v => { visible = v; });

    function push(ax, ay, az, g) { const t = performance.now(); buf.push({ t, ax, ay, az, g }); while (buf.length && t - buf[0].t > 3000) buf.shift(); }
    function startMotion() {
      const go = () => {
        source = 'phone'; gate.classList.add('off'); state.textContent = 'reading your phone\'s IMU';
        addEventListener('devicemotion', e => {
          const a = e.acceleration && e.acceleration.x != null ? e.acceleration : e.accelerationIncludingGravity; if (!a) return;
          const r = e.rotationRate || {};
          push(a.x || 0, a.y || 0, a.z || 0, Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) / 100);
        });
      };
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(p => p === 'granted' ? go() : (state.textContent = 'permission denied')).catch(() => state.textContent = 'permission denied');
      } else if ('DeviceMotionEvent' in window) go(); else state.textContent = 'no motion sensor';
    }
    root.querySelector('[data-motion]').addEventListener('click', startMotion);
    // desktop fallback: mouse velocity stands in for acceleration
    plot.addEventListener('pointerdown', e => { if (coarse) return; source = 'mouse'; gate.classList.add('off'); state.textContent = 'mouse as IMU · keep dragging'; mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; plot.setPointerCapture(e.pointerId); });
    plot.addEventListener('pointermove', e => { if (!mouse) return; const t = performance.now(), dt = Math.max(8, t - mouse.t); push((e.clientX - mouse.x) / dt * 6, -(e.clientY - mouse.y) / dt * 6, 0, 0); mouse = { x: e.clientX, y: e.clientY, t }; });
    plot.addEventListener('pointerup', () => { mouse = null; });

    function classify() {
      const now = performance.now(), win = buf.filter(s => now - s.t < 1000);
      if (win.length < 8) return null;
      const mean = k => win.reduce((a, s) => a + s[k], 0) / win.length;
      const mx = mean('ax'), my = mean('ay'), mz = mean('az');
      const en = k => Math.sqrt(win.reduce((a, s) => a + (s[k] - (k === 'ax' ? mx : k === 'ay' ? my : mz)) ** 2, 0) / win.length);
      const ex = en('ax'), ey = en('ay'), ez = en('az'), tot = ex + ey + ez;
      let cxy = 0; win.forEach(s => cxy += (s.ax - mx) * (s.ay - my)); cxy /= win.length * (ex * ey || 1);
      const act = Math.min(1, tot / 2.2), ev = Math.max(ey, ez);
      const r = Math.min(ex, ev) / (Math.max(ex, ev) || 1); // 1 = motion split evenly between axes (circle), 0 = one axis (a line)
      const clamp = v => Math.max(0, Math.min(1, v));
      const sc = [
        act * 3.2 * clamp((r - 0.35) / 0.45) * (1 - Math.abs(cxy)),
        act * 3 * (ex >= ev ? 1 : 0.2) * clamp(1 - r * 1.3),
        act * 3 * (ev > ex ? 1 : 0.2) * clamp(1 - r * 1.3),
        tot < 0.6 ? 3 : Math.max(0, 1.5 - tot)
      ];
      const e = sc.map(v => Math.exp(v * 2)), sum = e.reduce((a, b) => a + b, 0);
      return { p: e.map(v => v / sum), tot };
    }
    let last = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;
      const { ctx, w, h } = fit(plot);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(150,255,220,.08)'; ctx.lineWidth = 1;
      for (let y = h / 4; y < h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      if (buf.length > 1) {
        const t1 = performance.now(), sc = h / 2 / 12;
        [['ax', C.neon], ['ay', C.turq], ['az', C.leaf], ['g', 'rgba(166,191,180,.5)']].forEach(([k, col]) => {
          ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
          buf.forEach((s, i) => { const x = w - (t1 - s.t) / 3000 * w, y = h / 2 - Math.max(-12, Math.min(12, s[k])) * sc; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.stroke();
        });
        ctx.font = `11px ${MONO}`; [['accel x', C.neon], ['accel y', C.turq], ['accel z', C.leaf], ['gyro', C.text3]].forEach(([s, c], i) => { ctx.fillStyle = c; ctx.fillText(s, 10 + i * 70, 18); });
      }
      if (now - last > 200 && source) {
        last = now;
        const r = classify(); if (!r) return;
        const top = r.p.indexOf(Math.max(...r.p));
        [...bars.children].forEach((b, i) => { b.classList.toggle('top', i === top); b.querySelector('i').style.setProperty('--v', (r.p[i] * 100).toFixed(0) + '%'); b.querySelector('b').textContent = r.p[i].toFixed(2); });
        const odd = Math.max(...r.p) < 0.5 && r.tot > 0.6;
        anom.textContent = odd ? 'anomaly: motion unlike any gesture' : 'anomaly: none'; anom.style.color = odd ? C.neon : C.text3;
      }
    }
    requestAnimationFrame(loop);
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
})();
