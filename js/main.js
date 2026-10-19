/* Page behaviour: clocks, nav, gentle reveals, the project map, trees, 10K pace. */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------- two-city clock */
  const fmt = tz => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const nwk = fmt('America/New_York'), kla = fmt('Africa/Kampala');
  const tick = () => { const d = new Date(); document.getElementById('clock-nwk').textContent = nwk.format(d); document.getElementById('clock-kla').textContent = kla.format(d); };
  tick(); setInterval(tick, 15000);

  /* ------------------------------------------------------------------ nav */
  const nav = document.getElementById('nav');
  addEventListener('scroll', () => nav.classList.toggle('is-scrolled', scrollY > 10), { passive: true });
  const links = [...document.querySelectorAll('.nav__links a')];
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  ['try', 'work', 'path', 'beyond', 'offclock', 'contact'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });

  /* -------------------------------------------------------------- reveals */
  if (!reduced && 'IntersectionObserver' in window) {
    const els = document.querySelectorAll('.section__head, .proj__intro, .proj__media, .mini, .path li, .arbor, .service li, .hobby, .map__wrap, .try__head, .pick');
    const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => { el.classList.add('reveal'); rio.observe(el); });
  }

  /* ------------------------------------------------------------------ map */
  (function map() {
    const svg = document.getElementById('map-svg'), tip = document.getElementById('map-tip'); if (!svg) return;
    const narrow = matchMedia('(max-width: 600px)').matches;
    // x: -1 hardware … +1 software · y: +1 research … -1 built things
    const P = [
      { id: 'gaze-arm', s: 'Gaze Arm', n: 'Gaze Arm', x: -0.35, y: -0.62, c: '#e8578f', note: 'Hackathon winner: eye-controlled pick and place.' },
      { id: 'omniring', s: 'OmniRing', n: 'OmniRing', x: -0.72, y: -0.28, c: '#e8578f', note: 'TinyML gesture ring on an nRF52840. In progress.', wip: true },
      { id: 'robot', s: 'Robot', n: 'Obstacle robot', x: -0.82, y: -0.78, c: '#e8578f', note: 'Arduino + ultrasonic sensor, first-year project.' },
      { id: 'gaze-research', s: 'Gaze est.', n: 'Gaze estimation', x: 0.48, y: 0.72, c: '#27a35f', note: 'Research: 2.48° webcam gaze error on held-out people.' },
      { id: 'optics', s: 'Optics', n: 'Optical deconvolution', x: 0.3, y: 0.86, c: '#27a35f', note: 'Research: complex-valued CNN on experimental optics data.' },
      { id: 'zonelogic', s: 'ZoneLogic', n: 'ZoneLogic', x: 0.82, y: -0.55, c: '#3d7be0', note: 'Solo hackathon build: Boolean video rules, 117 tests.' },
      { id: 'einstein', s: 'Einstein', n: 'Einstein', x: 0.9, y: -0.2, c: '#3d7be0', note: 'Gemini tutoring chatbot with LangChain and Gradio.' }
    ];
    const W = 1000, H = 520, m = 56, X = x => W / 2 + x * (W / 2 - m - 40), Y = y => H / 2 - y * (H / 2 - m);
    const ns = 'http://www.w3.org/2000/svg', el = (t, a, p = svg) => { const n = document.createElementNS(ns, t); for (const k in a) n.setAttribute(k, a[k]); p.append(n); return n; };
    // soft quadrant tints
    [['#ffe4ee', 0, 0], ['#d9f5f2', W / 2, 0], ['#fff1f6', 0, H / 2], ['#e2edff', W / 2, H / 2]].forEach(([c, x, y]) => el('rect', { x, y, width: W / 2, height: H / 2, fill: c, opacity: 0.45 }));
    for (let i = -4; i <= 4; i++) { el('line', { x1: X(i / 4), x2: X(i / 4), y1: m - 20, y2: H - m + 20, class: 'grid' }); el('line', { y1: Y(i / 4), y2: Y(i / 4), x1: m, x2: W - m, class: 'grid' }); }
    el('line', { x1: m, x2: W - m, y1: H / 2, y2: H / 2, class: 'axis' }); el('line', { x1: W / 2, x2: W / 2, y1: m - 20, y2: H - m + 20, class: 'axis' });
    const lab = (s, x, y, a = {}) => { const t = el('text', { x, y, ...a }); t.textContent = s; return t; };
    lab('← hardware', m, H / 2 - 10); lab('software →', W - m, H / 2 - 10, { 'text-anchor': 'end' });
    lab('research ↑', W / 2 + 10, m - 4); lab('built ↓', W / 2 + 10, H - m + 16);
    [['hardware research', -0.55, 0.7], ['software research', 0.72, 0.3], ['built hardware', -0.45, -0.95], ['built software', 0.5, -0.93]].forEach(([s, x, y]) => lab(s, X(x), Y(y), { class: 'q', 'text-anchor': 'middle' }));
    P.forEach(p => {
      if (p.wip) el('circle', { cx: X(p.x), cy: Y(p.y), r: 17, fill: 'none', stroke: p.c, 'stroke-dasharray': '3 4' });
      const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 9, class: 'pt', fill: p.c, stroke: '#fff', 'stroke-width': 3, tabindex: 0, role: 'link', 'aria-label': `${p.n}: ${p.note}` });
      const left = p.x > 0.7, off = narrow ? 26 : 17;
      lab(narrow ? p.s : p.n, X(p.x) + (left ? -off : off), Y(p.y) + (narrow ? 9 : 5), { class: 'lbl', 'text-anchor': left ? 'end' : 'start' });
      const show = () => { const s = svg.getBoundingClientRect().width / W; tip.hidden = false; tip.innerHTML = `<b>${p.n}</b><br>${p.note}`; tip.style.left = X(p.x) * s + 'px'; tip.style.top = Y(p.y) * s + 'px'; };
      c.addEventListener('mouseenter', show); c.addEventListener('focus', show);
      c.addEventListener('mouseleave', () => tip.hidden = true); c.addEventListener('blur', () => tip.hidden = true);
      const go = () => document.getElementById(p.id).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  })();

  /* ---------------------------------------------------------------- trees */
  (function trees() {
    const row = document.getElementById('trees'); if (!row) return;
    for (let i = 0; i < 100; i++) { const t = document.createElement('i'); t.className = 'tree'; row.append(t); }
    const grow = () => [...row.children].slice(0, 20).forEach((t, i) => setTimeout(() => t.classList.add('on'), reduced ? 0 : 150 + i * 70));
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { grow(); o.disconnect(); } }, { threshold: 0.5 }).observe(row);
  })();

  /* ------------------------------------------------------------ 10K pace */
  (function pace() {
    const el = document.getElementById('pace'); if (!el) return;
    // Put your current 10K best in index.html as data-pb="mm:ss" on #pace.
    const toS = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
    const fmtT = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const goal = 40 * 60, pb = el.dataset.pb ? toS(el.dataset.pb) : null;
    const line = el.querySelector('.pace__line'), fill = el.querySelector('.pace__fill');
    if (!pb) { line.textContent = 'goal pace 4:00/km · 6:26/mile'; el.querySelector('.pace__track').hidden = true; return; }
    const gap = pb - goal;
    line.textContent = gap > 0 ? `best ${fmtT(pb)} · ${Math.round(gap)} s to go (${(gap / 10).toFixed(1)} s per km)` : `done: ${fmtT(pb)}!`;
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { fill.style.width = Math.max(4, Math.min(100, (1 - Math.max(0, gap) / 600) * 100)) + '%'; o.disconnect(); } }).observe(el);
  })();
})();
