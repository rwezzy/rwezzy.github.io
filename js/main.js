/* Page behaviour: clocks, smooth scroll, nav, reveals, counters, map, timeline, trees, pace. */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------- two-city clock */
  const fmt = tz => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const nwk = fmt('America/New_York'), kla = fmt('Africa/Kampala');
  const tick = () => { const d = new Date(); document.getElementById('clock-nwk').textContent = nwk.format(d); document.getElementById('clock-kla').textContent = kla.format(d); };
  tick(); setInterval(tick, 15000);

  /* -------------------------------------------------------- smooth scroll */
  let lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    if (hasGsap) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
    else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  }
  const goTo = el => { if (lenis) lenis.scrollTo(el, { offset: -70 }); else (el === 0 ? scrollTo({ top: 0, behavior: 'smooth' }) : el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })); };
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id === '#') return;
    const el = id === '#top' ? 0 : document.querySelector(id); if (el === null) return;
    e.preventDefault(); goTo(el);
  }));

  /* ------------------------------------------------------------------ nav */
  const nav = document.getElementById('nav'); let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > lastY && y > 500);
    lastY = y;
  }, { passive: true });
  const links = [...document.querySelectorAll('.nav__links a')];
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  ['work', 'map', 'timeline', 'beyond', 'offclock', 'contact'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });

  /* ------------------------------------------------------------- counters */
  const done = new WeakSet();
  const cio = new IntersectionObserver(es => es.forEach(e => {
    const el = e.target; if (!e.isIntersecting || done.has(el)) return; done.add(el);
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0);
    if (reduced) { el.textContent = end.toFixed(dec); return; }
    const t0 = performance.now();
    (function f(now) { const k = Math.min(1, (now - t0) / 1500); el.textContent = (end * (1 - Math.pow(1 - k, 3))).toFixed(dec); if (k < 1) requestAnimationFrame(f); })(t0);
  }), { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

  /* -------------------------------------------------------------- motion */
  if (hasGsap && !reduced) {
    gsap.from('.hero__text > *', { y: 36, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.09, delay: 0.1 });
    gsap.from('.hero__robot', { opacity: 0, x: 40, duration: 1.4, ease: 'power3.out', delay: 0.3 });
    gsap.to('.hero__bg img', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.utils.toArray('.section__head').forEach(h => gsap.from(h.children, { scrollTrigger: { trigger: h, start: 'top 85%' }, y: 40, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }));
    ScrollTrigger.batch('.proj__head > *, .proj__text, .demo, .gallery, .mini, .service li, .hobby, .arbor > *', {
      start: 'top 90%', onEnter: els => gsap.from(els, { y: 34, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, overwrite: true })
    });
    gsap.utils.toArray('.beyond__bg img, .contact__bg img').forEach(img => gsap.fromTo(img, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: img.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true } }));
    gsap.from('.chat p', { scrollTrigger: { trigger: '.chat', start: 'top 85%' }, opacity: 0, y: 10, duration: 0.4, stagger: 0.55 });
  }

  /* ------------------------------------------------------------------ map */
  (function map() {
    const svg = document.getElementById('map-svg'), tip = document.getElementById('map-tip'); if (!svg) return;
    const narrow = matchMedia('(max-width: 600px)').matches;
    // x: -1 hardware … +1 software · y: +1 research … -1 built things
    const P = [
      { id: 'gaze-arm', s: 'Gaze Arm', n: 'Gaze Arm', x: -0.35, y: -0.62, k: 'hw', note: 'Hackathon winner: eye-controlled pick and place on an xArm6.' },
      { id: 'omniring', s: 'OmniRing', n: 'OmniRing', x: -0.72, y: -0.28, k: 'hw', note: 'TinyML gesture ring on an nRF52840. In progress.', wip: true },
      { id: 'robot', s: 'Robot', n: 'Obstacle robot', x: -0.82, y: -0.78, k: 'hw', note: 'Arduino + ultrasonic sensor, first-year project.' },
      { id: 'gaze-research', s: 'Gaze est.', n: 'Gaze estimation', x: 0.48, y: 0.72, k: 'sw', note: 'Research: 2.48° webcam gaze error on held-out people.' },
      { id: 'optics', s: 'Optics', n: 'Optical deconvolution', x: 0.3, y: 0.86, k: 'sw', note: 'Research: complex-valued CNN on experimental optics data.' },
      { id: 'zonelogic', s: 'ZoneLogic', n: 'ZoneLogic', x: 0.82, y: -0.55, k: 'sw', note: 'Solo hackathon build: Boolean video rules, 117 tests.' },
      { id: 'einstein', s: 'Einstein', n: 'Einstein', x: 0.9, y: -0.2, k: 'sw', note: 'Gemini tutoring chatbot with LangChain and Gradio.' }
    ];
    const W = 1000, H = 560, m = 60, X = x => W / 2 + x * (W / 2 - m - 40), Y = y => H / 2 - y * (H / 2 - m);
    const ns = 'http://www.w3.org/2000/svg', el = (t, a, p = svg) => { const n = document.createElementNS(ns, t); for (const k in a) n.setAttribute(k, a[k]); p.append(n); return n; };
    const defs = el('defs', {});
    [['ghw', '#3cff8f'], ['gsw', '#2de2d0']].forEach(([id, c]) => { const g = el('radialGradient', { id }, defs); el('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': 0.55 }, g); el('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 0 }, g); });
    for (let i = -4; i <= 4; i++) { el('line', { x1: X(i / 4), x2: X(i / 4), y1: m - 20, y2: H - m + 20, class: 'grid' }); el('line', { y1: Y(i / 4), y2: Y(i / 4), x1: m, x2: W - m, class: 'grid' }); }
    el('line', { x1: m, x2: W - m, y1: H / 2, y2: H / 2, class: 'axis' }); el('line', { x1: W / 2, x2: W / 2, y1: m - 20, y2: H - m + 20, class: 'axis' });
    const lab = (s, x, y, a = {}) => { const t = el('text', { x, y, ...a }); t.textContent = s; return t; };
    lab('← hardware', m, H / 2 - 10); lab('software →', W - m, H / 2 - 10, { 'text-anchor': 'end' });
    lab('research ↑', W / 2 + 10, m - 4); lab('built ↓', W / 2 + 10, H - m + 16);
    [['hardware research', -0.55, 0.7], ['software research', 0.72, 0.3], ['built hardware', -0.45, -0.95], ['built software', 0.5, -0.93]].forEach(([s, x, y]) => lab(s, X(x), Y(y), { class: 'q', 'text-anchor': 'middle' }));
    P.forEach(p => {
      el('circle', { cx: X(p.x), cy: Y(p.y), r: 34, fill: `url(#g${p.k})` });
      if (p.wip) el('circle', { cx: X(p.x), cy: Y(p.y), r: 19, fill: 'none', stroke: '#3cff8f', 'stroke-dasharray': '3 4' });
      const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 9, class: 'pt', fill: p.k === 'hw' ? '#3cff8f' : '#2de2d0', stroke: '#050a08', 'stroke-width': 2, tabindex: 0, role: 'link', 'aria-label': `${p.n}: ${p.note}` });
      const left = p.x > 0.7, off = narrow ? 26 : 18;
      lab(narrow ? p.s : p.n, X(p.x) + (left ? -off : off), Y(p.y) + (narrow ? 10 : 4), { class: 'lbl', 'text-anchor': left ? 'end' : 'start' });
      const show = () => { const s = svg.getBoundingClientRect().width / W; tip.hidden = false; tip.innerHTML = `<b>${p.n}</b><br>${p.note}`; tip.style.left = X(p.x) * s + 'px'; tip.style.top = Y(p.y) * s + 'px'; };
      c.addEventListener('mouseenter', show); c.addEventListener('focus', show);
      c.addEventListener('mouseleave', () => tip.hidden = true); c.addEventListener('blur', () => tip.hidden = true);
      const go = () => goTo(document.getElementById(p.id));
      c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
    if (hasGsap && !reduced) gsap.from('#map-svg .pt', { scrollTrigger: { trigger: svg, start: 'top 75%' }, attr: { r: 0 }, duration: 0.6, ease: 'back.out(3)', stagger: 0.08 });
  })();

  /* ------------------------------------------------------------- timeline */
  (function timeline() {
    const wrap = document.getElementById('tl'), track = wrap && wrap.querySelector('.tl__track'); if (!track) return;
    if (hasGsap && !reduced) {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1001px)', () => {
        const dist = () => Math.max(0, track.scrollWidth - wrap.clientWidth);
        gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#timeline', start: 'top top+=40', end: () => '+=' + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true } });
      });
      mm.add('(max-width: 1000px)', () => { wrap.classList.add('is-scrollable'); return () => wrap.classList.remove('is-scrollable'); });
    } else wrap.classList.add('is-scrollable');
  })();

  /* ---------------------------------------------------------------- trees */
  (function trees() {
    const row = document.getElementById('trees'); if (!row) return;
    for (let i = 0; i < 100; i++) { const t = document.createElement('i'); t.className = 'tree'; row.append(t); }
    const grow = () => [...row.children].slice(0, 20).forEach((t, i) => setTimeout(() => t.classList.add('on'), reduced ? 0 : 200 + i * 80));
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { grow(); o.disconnect(); } }, { threshold: 0.6 }).observe(row);
  })();

  /* ------------------------------------------------------------ 10K pace */
  (function pace() {
    const el = document.getElementById('pace'); if (!el) return;
    // Set data-pb="mm:ss" on #pace in index.html to show your current 10K best.
    const toS = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
    const fmtT = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const goal = 40 * 60, pb = el.dataset.pb ? toS(el.dataset.pb) : null;
    const line = el.querySelector('.pace__line'), fill = el.querySelector('.pace__fill');
    if (pb) {
      const gap = pb - goal;
      line.textContent = gap > 0 ? `Current best ${fmtT(pb)} (${fmtT(pb / 10)}/km). ${Math.round(gap)} s to go, about ${(gap / 10).toFixed(1)} s per km.` : `Done: ${fmtT(pb)}. Next goal pending.`;
      new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { fill.style.width = Math.max(4, Math.min(100, (1 - Math.max(0, gap) / 600) * 100)) + '%'; o.disconnect(); } }).observe(el);
    } else {
      line.textContent = 'Goal pace 4:00 /km · 6:26 /mile';
      fill.style.width = '0%';
    }
  })();

  addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
