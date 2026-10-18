/* Hero: a three-link arm that follows the pointer (FABRIK inverse kinematics).
 * Click / tap near a block to grab it, click again to drop it. A small camera
 * on the base "looks" at the target, a nod to the gaze-controlled arm. */
(function () {
  const canvas = document.getElementById('arm');
  if (!canvas) return;
  const hero = canvas.parentElement;
  const stats = hero.querySelector('.hero__stats');
  const readout = document.getElementById('arm-readout');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const C = { ink: '#151515', paper: '#f3f0e7', hw: '#f05a1f', sw: '#2a4bd7', hl: '#f2c94c', faint: 'rgba(21,21,21,.35)' };
  const RATIO = [0.42, 0.36, 0.22];

  let W = 0, H = 0, dpr = 1, base = { x: 0, y: 0 }, floorY = 0, L = [0, 0, 0], reach = 0;
  let joints = [], target = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  let pointerActive = false, lastPointer = 0, grip = 1, gripGoal = 1, held = null, t0 = performance.now();
  let blocks = [], visible = true, frame = 0;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = hero.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const narrow = W < 900;
    floorY = stats.offsetTop - (narrow ? 24 : 36);
    base = { x: narrow ? W * 0.5 : W * 0.73, y: floorY - 34 };
    const room = Math.min(narrow ? floorY - 260 : floorY - 150, narrow ? W * 0.62 : W * 0.36);
    reach = Math.max(170, room);
    L = RATIO.map(k => k * reach);
    joints = [
      { x: base.x, y: base.y },
      { x: base.x - L[0] * 0.3, y: base.y - L[0] * 0.95 },
      { x: base.x + L[1] * 0.4, y: base.y - L[0] * 0.95 - L[1] * 0.7 },
      { x: base.x + L[1] * 0.4 + L[2], y: base.y - L[0] * 0.95 - L[1] * 0.4 }
    ];
    // re-solve chain lengths from that rough pose
    for (let i = 0; i < 3; i++) setLen(i);
    const span = narrow ? W * 0.4 : Math.min(W * 0.26, reach * 0.8);
    const defs = [['cup', C.sw, 34, 40], ['block', C.hw, 36, 36], ['can', C.ink, 28, 46]];
    if (!blocks.length) {
      const hint = hero.querySelector('.hero__hint'), textRight = hint ? hint.getBoundingClientRect().right - r.left + 40 : 0;
      const x0 = Math.max(base.x - reach * 0.95, textRight);
      const xs = narrow ? [base.x - span, base.x - span * 0.45, base.x + span * 0.55] : [x0, Math.max(base.x - reach * 0.55, x0 + 110), base.x + Math.min(reach * 0.5, W - base.x - 40)];
      blocks = defs.map((d, i) => ({ label: d[0], color: d[1], w: d[2], h: d[3], x: xs[i], y: floorY - d[3], vy: 0 }));
    } else {
      blocks.forEach(b => { b.x = Math.min(Math.max(b.x, 20), W - 20); if (b !== held) b.y = Math.min(b.y, floorY - b.h); });
    }
    if (!pointerActive) { target = { x: base.x - reach * 0.35, y: base.y - reach * 0.55 }; aim = { ...target }; }
  }

  function setLen(i) {
    const a = joints[i], b = joints[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    b.x = a.x + (b.x - a.x) / d * L[i];
    b.y = a.y + (b.y - a.y) / d * L[i];
  }

  function clampTarget(p) {
    const q = { x: p.x, y: Math.min(p.y, floorY - 14) };
    const dx = q.x - base.x, dy = q.y - base.y, d = Math.hypot(dx, dy), max = reach * 0.995;
    if (d > max) { q.x = base.x + dx / d * max; q.y = base.y + dy / d * max; }
    return q;
  }

  function fabrik(goal) {
    for (let it = 0; it < 12; it++) {
      joints[3].x = goal.x; joints[3].y = goal.y;
      for (let i = 2; i >= 0; i--) {
        const a = joints[i], b = joints[i + 1], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        a.x = b.x + (a.x - b.x) / d * L[i]; a.y = b.y + (a.y - b.y) / d * L[i];
      }
      joints[0].x = base.x; joints[0].y = base.y;
      for (let i = 0; i < 3; i++) {
        setLen(i);
        // keep elbows above the table
        if (joints[i + 1].y > floorY - 10) joints[i + 1].y = floorY - 10;
      }
      if (Math.hypot(joints[3].x - goal.x, joints[3].y - goal.y) < 0.5) break;
    }
  }

  const tip = () => joints[3];
  const dir = () => { const a = joints[2], b = joints[3], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };

  function toggleGrab() {
    if (held) { held.vy = 0; held = null; gripGoal = 1; return; }
    const p = tip(), dvec = dir();
    const jaw = { x: p.x + dvec.x * 16, y: p.y + dvec.y * 16 };
    let best = null, bd = 64;
    blocks.forEach(b => {
      const d = Math.hypot(b.x - jaw.x, b.y + b.h / 2 - jaw.y);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) { held = best; gripGoal = 0.25; } else { gripGoal = 0; setTimeout(() => { if (!held) gripGoal = 1; }, 260); }
  }

  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  hero.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; aim = local(e); pointerActive = true; lastPointer = performance.now(); });
  hero.addEventListener('pointerleave', () => { pointerActive = false; });
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('a, button')) return;
    aim = local(e); pointerActive = true; lastPointer = performance.now();
    if (e.pointerType === 'touch') { setTimeout(toggleGrab, 380); } else toggleGrab();
  });

  /* ------------------------------------------------------------- drawing */
  function line(a, b, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  function drawFloor() {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    ctx.strokeStyle = 'rgba(21,21,21,.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -20; x < W; x += 12) { ctx.moveTo(x, floorY + 14); ctx.lineTo(x + 12, floorY + 2); }
    ctx.stroke();
  }

  function drawBase() {
    const bx = base.x, by = base.y;
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(bx - 46, floorY); ctx.lineTo(bx - 30, by + 6); ctx.lineTo(bx + 30, by + 6); ctx.lineTo(bx + 46, floorY); ctx.closePath(); ctx.fill();
    // camera eye on the pedestal, looking at the target
    const ex = bx + 58, ey = floorY - 18;
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const a = Math.atan2(target.y - ey, target.x - ex);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * 5, ey + Math.sin(a) * 5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([3, 6]); line({ x: ex + Math.cos(a) * 14, y: ey + Math.sin(a) * 14 }, target, 1, C.faint); ctx.setLineDash([]);
    // target reticle
    ctx.strokeStyle = C.hw; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(target.x, target.y, 9, 0, Math.PI * 2); ctx.moveTo(target.x - 15, target.y); ctx.lineTo(target.x - 5, target.y); ctx.moveTo(target.x + 5, target.y); ctx.lineTo(target.x + 15, target.y); ctx.moveTo(target.x, target.y - 15); ctx.lineTo(target.x, target.y - 5); ctx.moveTo(target.x, target.y + 5); ctx.lineTo(target.x, target.y + 15); ctx.stroke();
  }

  function drawArm() {
    for (let i = 0; i < 3; i++) {
      const w = [20, 16, 12][i];
      line(joints[i], joints[i + 1], w, C.ink);
      line(joints[i], joints[i + 1], w - 6, C.paper);
    }
    // angle annotation at the shoulder
    const a1 = Math.atan2(joints[1].y - joints[0].y, joints[1].x - joints[0].x);
    ctx.strokeStyle = C.hw; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(base.x, base.y, 34, a1, 0, a1 > 0); ctx.stroke();
    ctx.setLineDash([2, 4]); line(base, { x: base.x + 46, y: base.y }, 1, C.hw); ctx.setLineDash([]);
    joints.slice(0, 3).forEach((j, i) => {
      ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(j.x, j.y, [13, 11, 9][i], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(j.x, j.y, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // gripper
    const p = tip(), d = dir(), n = { x: -d.y, y: d.x }, open = 6 + grip * 12;
    ctx.fillStyle = C.hw;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
    [1, -1].forEach(s => {
      const r0 = { x: p.x + n.x * open * s, y: p.y + n.y * open * s };
      const r1 = { x: r0.x + d.x * 22, y: r0.y + d.y * 22 };
      line(p, r0, 5, C.ink); line(r0, r1, 5, C.ink);
    });
  }

  function drawBlock(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = b.color; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    if (b.label === 'cup') {
      ctx.beginPath(); ctx.moveTo(-b.w / 2, 0); ctx.lineTo(b.w / 2, 0); ctx.lineTo(b.w * 0.36, b.h); ctx.lineTo(-b.w * 0.36, b.h); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (b.label === 'can') {
      ctx.fillRect(-b.w / 2, 4, b.w, b.h - 4); ctx.strokeRect(-b.w / 2, 4, b.w, b.h - 4);
      ctx.fillStyle = '#9a978d'; ctx.beginPath(); ctx.ellipse(0, 4, b.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(-b.w / 2, 0, b.w, b.h); ctx.strokeRect(-b.w / 2, 0, b.w, b.h);
    }
    ctx.restore();
    ctx.fillStyle = C.ink; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    if (b !== held && b.y >= floorY - b.h - 0.5) ctx.fillText(b.label, b.x, floorY + 28);
  }

  function step(now) {
    requestAnimationFrame(step);
    if (!visible) return;
    const t = (now - t0) / 1000;
    if (!pointerActive || now - lastPointer > 6000) {
      if (!reduced) aim = { x: base.x - reach * (0.25 + 0.35 * Math.sin(t * 0.45)), y: base.y - reach * (0.45 + 0.25 * Math.sin(t * 0.7 + 1)) };
    }
    const goal = clampTarget(aim);
    target.x += (goal.x - target.x) * 0.16; target.y += (goal.y - target.y) * 0.16;
    fabrik(target);
    grip += (gripGoal - grip) * 0.25;

    blocks.forEach(b => {
      if (b === held) {
        const p = tip(), d = dir();
        b.x = p.x + d.x * 20; b.y = p.y + d.y * 20 - b.h * 0.3;
      } else if (b.y < floorY - b.h) {
        b.vy += 0.9; b.y = Math.min(b.y + b.vy, floorY - b.h);
        if (b.y >= floorY - b.h) b.vy = 0;
      }
    });

    ctx.clearRect(0, 0, W, H);
    drawFloor();
    blocks.forEach(b => b !== held && drawBlock(b));
    drawBase();
    drawArm();
    if (held) drawBlock(held);

    if (readout && ++frame % 5 === 0) {
      const deg = i => {
        const a = Math.atan2(joints[i + 1].y - joints[i].y, joints[i + 1].x - joints[i].x);
        const prev = i === 0 ? 0 : Math.atan2(joints[i].y - joints[i - 1].y, joints[i].x - joints[i - 1].x);
        let v = (prev - a) * 180 / Math.PI; v = ((v + 540) % 360) - 180; return v.toFixed(1).padStart(6);
      };
      readout.textContent = `θ1 ${deg(0)}°\nθ2 ${deg(1)}°\nθ3 ${deg(2)}°\ngrip ${held ? 'closed · ' + held.label : 'open'}`;
    }
  }

  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(hero);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  if (document.fonts) document.fonts.ready.then(layout);
  layout();
  requestAnimationFrame(step);
})();
