/* Interactive figures for each project. Each runs only while on screen. */
(function () {
  const C = { ink: '#151515', ink2: '#4a4843', ink3: '#8b877c', paper: '#fbfaf5', rule: 'rgba(21,21,21,.10)', hw: '#f05a1f', sw: '#2a4bd7', hl: '#f2c94c', green: '#2f7d3b' };
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ----------------------------------------------------- 1.1 dwell selector */
  (function dwell() {
    const root = document.getElementById('demo-dwell'); if (!root) return;
    // Same rule as arm-control-grid/gaze_lock.py, scaled to a small canvas.
    const SELECT = 0.9, TAU = 1.5, DOM = 2.0, SIGMA = 46, CAP = SELECT * 1.5;
    const items = [
      { label: 'cup', color: C.sw, conf: 0.91 }, { label: 'block', color: C.hw, conf: 0.88 }, { label: 'can', color: C.ink, conf: 0.84 }
    ].map(o => ({ ...o, ev: 0 }));
    let locked = null, lockT = 0, auto = 0;
    const s = stage(root.querySelector('canvas'), (s, dt) => {
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      // boxes laid out across the "camera feed"
      const bw = Math.min(150, w * 0.22), bh = Math.min(130, h * 0.42), gap = (w - 3 * bw) / 4, y0 = h * 0.5 - bh / 2;
      items.forEach((o, i) => { o.x0 = gap + i * (bw + gap); o.y0 = y0; o.x1 = o.x0 + bw; o.y1 = y0 + bh; });
      // table line
      ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y0 + bh * 0.86); ctx.lineTo(w, y0 + bh * 0.86); ctx.stroke();

      // gaze point: pointer, or a wandering demo gaze when idle
      let g = null;
      if (s.p.in && performance.now() - s.p.t < 4000) g = { x: s.p.x, y: s.p.y };
      else if (!reduced) { auto += dt; const k = (Math.sin(auto * 0.35) + 1) / 2; g = { x: w * (0.15 + 0.7 * k) + Math.sin(auto * 7) * 10, y: h * 0.5 + Math.cos(auto * 5) * 14 }; }

      if (locked) {
        lockT += dt;
        if (lockT > 2.4) { locked = null; items.forEach(o => o.ev = 0); }
      } else {
        items.forEach(o => {
          let sc = 0;
          if (g) {
            const dx = Math.max(o.x0 - g.x, 0, g.x - o.x1), dy = Math.max(o.y0 - g.y, 0, g.y - o.y1);
            sc = Math.exp(-((dx * dx + dy * dy) / (SIGMA * SIGMA)));
          }
          o.ev = Math.min(CAP, o.ev * Math.exp(-dt * (1 - sc) / TAU) + sc * dt);
        });
        const r = [...items].sort((a, b) => b.ev - a.ev);
        if (r[0].ev >= SELECT && r[0].ev >= DOM * r[1].ev) { locked = r[0]; lockT = 0; }
      }

      items.forEach(o => {
        const isLock = locked === o;
        // object glyph
        const cx = (o.x0 + o.x1) / 2, by = o.y0 + bh * 0.86;
        ctx.fillStyle = o.color; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        if (o.label === 'cup') { ctx.beginPath(); ctx.moveTo(cx - 24, by - 58); ctx.lineTo(cx + 24, by - 58); ctx.lineTo(cx + 17, by); ctx.lineTo(cx - 17, by); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (o.label === 'block') { ctx.fillRect(cx - 26, by - 52, 52, 52); ctx.strokeRect(cx - 26, by - 52, 52, 52); }
        else { ctx.fillRect(cx - 18, by - 64, 36, 64); ctx.strokeRect(cx - 18, by - 64, 36, 64); ctx.fillStyle = '#9a978d'; ctx.beginPath(); ctx.ellipse(cx, by - 64, 18, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        // detection box
        ctx.strokeStyle = isLock ? C.hl : (o.ev / SELECT > 0.13 ? C.green : C.ink3);
        ctx.lineWidth = isLock ? 4 : 2;
        ctx.strokeRect(o.x0, o.y0, bw, bh);
        text(ctx, `${o.label} ${o.conf.toFixed(2)}`, o.x0, o.y0 - 7, ctx.strokeStyle === C.ink3 ? C.ink2 : C.ink);
        // evidence bar
        const pr = Math.min(1, o.ev / SELECT);
        ctx.fillStyle = C.rule; ctx.fillRect(o.x0, o.y1 + 10, bw, 6);
        ctx.fillStyle = isLock ? C.hl : C.hw; ctx.fillRect(o.x0, o.y1 + 10, bw * pr, 6);
        text(ctx, `${o.ev.toFixed(2)} s`, o.x1, o.y1 + 30, C.ink2, 10.5, 'right');
      });

      if (g && !locked) {
        ctx.strokeStyle = C.sw; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = C.sw; ctx.beginPath(); ctx.arc(g.x, g.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      if (locked) {
        const msg = lockT < 1.2 ? `LOCKED: ${locked.label} · frame frozen` : `→ 3D target from depth · planning grasp`;
        ctx.fillStyle = C.ink; ctx.fillRect(12, 12, ctx.measureText(msg).width + 40, 26);
        text(ctx, msg, 22, 30, C.hl, 12);
      } else {
        text(ctx, 'select ≥ 0.90 s evidence and ≥ 2× runner-up', 12, 22, C.ink3, 10.5);
      }
    });
  })();

  /* ------------------------------------------------ 2.1 gaze error simulator */
  (function gaze() {
    const root = document.getElementById('demo-gaze'); if (!root) return;
    let errDeg = 2.48;
    seg(root, 'err', v => { errDeg = parseFloat(v); errSum = 0; errN = 0; });
    // Ornstein-Uhlenbeck noise: a slow per-session bias plus fast frame jitter.
    const bias = { x: 0, y: 0 }, jit = { x: 0, y: 0 };
    let pred = null, trail = [], errSum = 0, errN = 0, auto = 0;
    function ou(v, tau, sigma, dt) {
      const a = Math.exp(-dt / tau), k = sigma * Math.sqrt(1 - a * a);
      v.x = v.x * a + k * gauss(); v.y = v.y * a + k * gauss();
    }
    function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

    stage(root.querySelector('canvas'), (s, dt) => {
      const { ctx, w, h } = s;
      // 115 px of error at 2.48° on a 1440 px-wide laptop screen, scaled to this canvas
      const pxPerDeg = (115 / 2.48) * (w / 1440);
      const meanErr = errDeg * pxPerDeg, sigma = meanErr / 1.2533 / Math.SQRT2;
      ou(bias, 2.5, sigma, dt); ou(jit, 0.12, sigma, dt);

      let truth;
      if (s.p.in && performance.now() - s.p.t < 4000) truth = { x: s.p.x, y: s.p.y };
      else { // idle: walk the nine calibration dots
        auto += dt * (reduced ? 0 : 1);
        const k = Math.floor(auto / 1.4) % 9, f = (auto % 1.4) / 1.4, pts = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pts.push({ x: w * (0.15 + 0.35 * c), y: h * (0.18 + 0.32 * r) });
        const a = pts[k], b = pts[(k + 1) % 9], e = f < 0.6 ? 0 : (f - 0.6) / 0.4;
        truth = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      }
      const raw = { x: truth.x + bias.x + jit.x, y: truth.y + bias.y + jit.y };
      pred = pred ? { x: pred.x + (raw.x - pred.x) * 0.35, y: pred.y + (raw.y - pred.y) * 0.35 } : raw;
      trail.push({ ...pred }); if (trail.length > 40) trail.shift();
      const e = Math.hypot(pred.x - truth.x, pred.y - truth.y);
      errSum += e; errN++;

      ctx.clearRect(0, 0, w, h);
      // screen bezel
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(w / 2, 8, 3, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'webcam', w / 2 + 8, 22, C.ink3, 10);
      // trail
      ctx.strokeStyle = 'rgba(240,90,31,.25)'; ctx.lineWidth = 2; ctx.beginPath();
      trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      // error line
      ctx.strokeStyle = C.hl; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(truth.x, truth.y); ctx.lineTo(pred.x, pred.y); ctx.stroke();
      // truth crosshair (the eye tracker)
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(truth.x - 9, truth.y); ctx.lineTo(truth.x + 9, truth.y); ctx.moveTo(truth.x, truth.y - 9); ctx.lineTo(truth.x, truth.y + 9); ctx.stroke();
      // prediction
      ctx.fillStyle = C.hw; ctx.beginPath(); ctx.arc(pred.x, pred.y, 7, 0, Math.PI * 2); ctx.fill();
      const avg = errSum / errN;
      text(ctx, `error now ${(e / pxPerDeg).toFixed(2)}°   running mean ${(avg / pxPerDeg).toFixed(2)}°`, 18, h - 18, C.ink2, 11);
      if (w < 560) text(ctx, '+ tobii  ● model', 18, 26, C.ink2, 11);
      else text(ctx, '+ tobii   ● model', w - 18, h - 18, C.ink2, 11, 'right');
    });
  })();

  /* ------------------------------------------------- 3.1 compound zone rule */
  (function zone() {
    const root = document.getElementById('demo-zone'); if (!root) return;
    const log = root.querySelector('.zone__log');
    let op = 'AND', prev = null, cooldownUntil = -1, people = [], cars = [], nextP = 0, nextC = 0, flash = 0;
    seg(root, 'op', v => { op = v; prev = null; log.innerHTML = ''; });
    const evalOp = (A, B) => op === 'AND' ? A && B : op === 'OR' ? A || B : op === 'XOR' ? A !== B : !A;
    const opText = { AND: 'person AND car', OR: 'person OR car', XOR: 'person XOR car', NOTA: 'NOT person' };
    function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }

    stage(root.querySelector('canvas'), (s, dt) => {
      const { ctx, w, h, t } = s;
      const roadTop = h * 0.3, roadBot = h * 0.78, cx = w * 0.52, zw = Math.min(150, w * 0.18);
      const zonePoly = [{ x: cx - zw / 2 - 12, y: roadTop }, { x: cx + zw / 2 - 12, y: roadTop }, { x: cx + zw / 2 + 12, y: roadBot }, { x: cx - zw / 2 + 12, y: roadBot }];

      if (t > nextP) { people.push({ x: cx + (Math.random() - 0.5) * zw * 0.7, y: Math.random() < 0.5 ? h + 6 : -6, v: (24 + Math.random() * 18) }); people[people.length - 1].dir = people[people.length - 1].y < 0 ? 1 : -1; nextP = t + 2.2 + Math.random() * 3.5; }
      if (t > nextC) { const lane = Math.random() < 0.5; cars.push({ x: lane ? -60 : w + 60, y: lane ? roadTop + (roadBot - roadTop) * 0.3 : roadTop + (roadBot - roadTop) * 0.72, v: (lane ? 1 : -1) * (90 + Math.random() * 50), stop: Math.random() < 0.45 ? 1.5 + Math.random() * 2 : 0 }); nextC = t + 1.6 + Math.random() * 2.8; }
      people.forEach(p => p.y += p.dir * p.v * dt);
      cars.forEach(c => {
        const inside = Math.abs(c.x - cx) < 10;
        if (inside && c.stop > 0) c.stop -= dt; else c.x += c.v * dt;
      });
      people = people.filter(p => p.y > -20 && p.y < h + 20);
      cars = cars.filter(c => c.x > -80 && c.x < w + 80);

      const A = people.some(p => inPoly(p, zonePoly)), B = cars.some(c => inPoly(c, zonePoly)), R = evalOp(A, B);
      if (prev === false && R && t >= cooldownUntil) {
        cooldownUntil = t + 5; flash = 1;
        const row = document.createElement('p');
        row.innerHTML = `<span class="inc">● incident</span> t=${t.toFixed(1)}s · ${opText[op]} in crosswalk · A=${+A} B=${+B}`;
        log.prepend(row); while (log.children.length > 4) log.lastChild.remove();
      }
      prev = R;
      flash = Math.max(0, flash - dt * 1.5);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#e4e0d4'; ctx.fillRect(0, roadTop, w, roadBot - roadTop);
      ctx.strokeStyle = C.ink3; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.moveTo(0, (roadTop + roadBot) / 2); ctx.lineTo(w, (roadTop + roadBot) / 2); ctx.stroke(); ctx.setLineDash([]);
      // crosswalk stripes
      ctx.save(); ctx.beginPath(); zonePoly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#fbfaf5'; for (let y = roadTop + 4; y < roadBot; y += 16) ctx.fillRect(0, y, w, 8);
      if (flash) { ctx.fillStyle = `rgba(240,90,31,${0.35 * flash})`; ctx.fillRect(0, 0, w, h); }
      ctx.restore();
      ctx.strokeStyle = R ? C.hw : C.sw; ctx.lineWidth = 2.5; ctx.beginPath(); zonePoly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      text(ctx, 'zone: crosswalk', zonePoly[0].x, roadTop - 8, C.ink2, 10.5);

      cars.forEach(c => {
        ctx.fillStyle = C.sw; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        ctx.fillRect(c.x - 30, c.y - 14, 60, 28); ctx.strokeRect(c.x - 30, c.y - 14, 60, 28);
        ctx.strokeStyle = 'rgba(21,21,21,.5)'; ctx.setLineDash([3, 3]); ctx.strokeRect(c.x - 34, c.y - 18, 68, 36); ctx.setLineDash([]);
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2); ctx.fill();
      });
      people.forEach(p => {
        ctx.fillStyle = C.hw; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(21,21,21,.5)'; ctx.setLineDash([3, 3]); ctx.strokeRect(p.x - 12, p.y - 14, 24, 28); ctx.setLineDash([]);
      });

      // state panel
      const bx = 12, by = 12;
      ctx.fillStyle = C.ink; ctx.fillRect(bx, by, 188, 30);
      text(ctx, `A ${+A}  B ${+B}  →  ${opText[op].replace('person', 'A').replace('car', 'B')} = ${+R}`, bx + 10, by + 19, R ? C.hl : '#fbfaf5', 11);
      if (t < cooldownUntil) text(ctx, `cooldown ${(cooldownUntil - t).toFixed(1)} s`, bx, by + 48, C.ink3, 10.5);
    });
  })();

  /* ---------------------------------------------------- 4.1 gesture classifier */
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

  /* ------------------------------------------------------ 5.1 optics blur */
  (function optics() {
    const root = document.getElementById('demo-optics'); if (!root) return;
    const range = root.querySelector('input'), out = root.querySelector('output');
    let view = 'raw', depth = 25;
    seg(root, 'view', v => { view = v; });
    range.addEventListener('input', () => { depth = +range.value; out.textContent = depth + ' µm'; });
    const off = document.createElement('canvas');
    const W0 = 1.0, LAMBDA = 0.455, ZR = Math.PI * W0 * W0 / LAMBDA; // µm
    const wz = z => W0 * Math.sqrt(1 + (z / ZR) ** 2);

    function paintTarget(w, h) {
      off.width = w; off.height = h;
      const c = off.getContext('2d');
      c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, w, h);
      c.fillStyle = C.ink;
      // bar groups of shrinking width (a resolution target)
      const k = Math.min(1, w / 820);
      let x = 24 * k + 8;
      [12, 9, 6, 4, 3, 2].map(b => Math.max(1, b * k)).forEach(bwid => {
        for (let k = 0; k < 3; k++) c.fillRect(x + k * bwid * 2, h * 0.1, bwid, h * 0.28);
        for (let k = 0; k < 3; k++) c.fillRect(x, h * 0.46 + k * bwid * 2, bwid * 5, bwid);
        x += bwid * 7 + 14 * k;
      });
      // siemens star
      const sx = w * 0.78, sy = h * 0.5, R = Math.min(h * 0.36, w * 0.17);
      for (let i = 0; i < 36; i += 2) { c.beginPath(); c.moveTo(sx, sy); c.arc(sx, sy, R, i * Math.PI / 18, (i + 1) * Math.PI / 18); c.closePath(); c.fill(); }
    }
    const canvas = root.querySelector('canvas');
    const supportsFilter = 'filter' in canvas.getContext('2d');
    const s = stage(canvas, (s) => {
      const { ctx, w, h } = s;
      if (off.width !== Math.round(w) || off.height !== Math.round(h)) paintTarget(Math.round(w), Math.round(h));
      const blur = wz(depth) * 1.15, shown = view === 'raw' ? blur : Math.max(0.3, blur * 0.22);
      ctx.clearRect(0, 0, w, h);
      if (supportsFilter) { ctx.filter = `blur(${shown}px)${view === 'raw' ? '' : ' contrast(1.15)'}`; ctx.drawImage(off, 0, 0, w, h); ctx.filter = 'none'; }
      else { ctx.drawImage(off, 0, 0, w, h); }
      // PSF profile inset
      const ix = 14, iy = h - 70, iw = 150, ih = 52;
      ctx.fillStyle = 'rgba(251,250,245,.92)'; ctx.fillRect(ix - 6, iy - 18, iw + 12, ih + 30);
      ctx.strokeStyle = C.ink3; ctx.strokeRect(ix - 6, iy - 18, iw + 12, ih + 30);
      text(ctx, `PSF  w(z) = ${wz(depth).toFixed(2)} µm`, ix, iy - 4, C.ink, 10.5);
      ctx.strokeStyle = C.hw; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= iw; i++) { const r = (i - iw / 2) / 10, y = Math.exp(-2 * r * r / (wz(depth) ** 2)); i ? ctx.lineTo(ix + i, iy + ih - y * (ih - 6)) : ctx.moveTo(ix + i, iy + ih - y * (ih - 6)); }
      ctx.stroke();
    });
    if (!supportsFilter) {
      const upd = () => { canvas.style.filter = `blur(${view === 'raw' ? wz(depth) : wz(depth) * 0.22}px)`; };
      range.addEventListener('input', upd); root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', upd)); upd();
    }
  })();

  /* ------------------------------------------------- 7 obstacle robot */
  (function bot() {
    const cv = document.getElementById('demo-bot'); if (!cv) return;
    const r = { x: 60, y: 60, a: 0.6, turn: 0 };
    let obstacles = [];
    const s = stage(cv, (s, dt) => {
      const { ctx, w, h } = s;
      if (!obstacles.length || s.resized) { obstacles = [{ x: w * 0.45, y: h * 0.35, w: 40, h: 40 }, { x: w * 0.72, y: h * 0.6, w: 54, h: 30 }]; s.resized = false; }
      // ultrasonic ray
      let d = 0; const max = 140;
      for (; d < max; d += 2) {
        const px = r.x + Math.cos(r.a) * d, py = r.y + Math.sin(r.a) * d;
        if (px < 4 || py < 4 || px > w - 4 || py > h - 4 || obstacles.some(o => px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h)) break;
      }
      if (!reduced) {
        if (d < 46) { if (!r.turn) r.turn = Math.random() < 0.5 ? -1 : 1; r.a += r.turn * 2.6 * dt; }
        else { r.turn = 0; r.x += Math.cos(r.a) * 55 * dt; r.y += Math.sin(r.a) * 55 * dt; }
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.ink; obstacles.forEach(o => ctx.fillRect(o.x, o.y, o.w, o.h));
      ctx.fillStyle = d < 46 ? 'rgba(240,90,31,.18)' : 'rgba(42,75,215,.12)';
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.arc(r.x, r.y, d, r.a - 0.26, r.a + 0.26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.hw; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.fillRect(-12, -10, 24, 20); ctx.strokeRect(-12, -10, 24, 20); ctx.fillStyle = C.ink; ctx.fillRect(8, -6, 5, 4); ctx.fillRect(8, 2, 5, 4); ctx.restore();
      text(ctx, `ultrasonic d = ${(d / 4).toFixed(0)} cm${d < 46 ? ' · turning' : ''}`, 10, h - 10, C.ink2, 10.5);
    });
    s.onresize = () => { s.resized = true; r.x = Math.min(r.x, s.w - 20); r.y = Math.min(r.y, s.h - 20); };
  })();
})();
