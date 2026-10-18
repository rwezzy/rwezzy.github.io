/* Page behaviour: clocks, nav, smooth scroll, reveals, counters, map, timeline, polaroids, trees. */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------- two-city clock */
  const fmt = tz => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const nwk = fmt('America/New_York'), kla = fmt('Africa/Kampala');
  function tick() {
    const d = new Date();
    document.getElementById('clock-nwk').textContent = nwk.format(d);
    document.getElementById('clock-kla').textContent = kla.format(d);
  }
  tick(); setInterval(tick, 15000);

  /* -------------------------------------------------------- smooth scroll */
  let lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); const el = id.length > 1 && document.querySelector(id);
    if (!el && id !== '#top') return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : el, { offset: -60 });
    else (id === '#top' ? document.body : el).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }));

  /* ---------------------------------------------------- nav hide + active */
  const nav = document.getElementById('nav');
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('is-hidden', y > lastY && y > 300);
    lastY = y;
  }, { passive: true });
  const links = [...document.querySelectorAll('.nav__links a')];
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['now', 'work', 'map', 'timeline', 'beyond', 'contact'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });

  /* ------------------------------------------------------------- counters */
  const counted = new WeakSet();
  const countIO = new IntersectionObserver(es => es.forEach(e => {
    const el = e.target;
    if (!e.isIntersecting || counted.has(el)) return;
    counted.add(el);
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0);
    if (reduced) { el.textContent = end.toFixed(dec); return; }
    const t0 = performance.now(), dur = 1400;
    (function f(now) {
      const k = Math.min(1, (now - t0) / dur), v = end * (1 - Math.pow(1 - k, 3));
      el.textContent = v.toFixed(dec);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }), { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));

  /* -------------------------------------------------------------- reveals */
  if (hasGsap && !reduced) {
    gsap.from('.hero__name, .hero__lede, .kicker, .hero__hint', { y: 30, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.08 });
    gsap.utils.toArray('.section__head').forEach(h => gsap.from(h, { scrollTrigger: { trigger: h, start: 'top 88%' }, y: 40, opacity: 0, duration: 0.9, ease: 'power3.out' }));
    ScrollTrigger.batch('.reveal, .exp__body > *, .mini, .beyond__list li, .arbor', {
      start: 'top 90%',
      onEnter: els => gsap.from(els, { y: 28, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, overwrite: true })
    });
    gsap.utils.toArray('.exp__meta h3').forEach(h => gsap.from(h, { scrollTrigger: { trigger: h, start: 'top 90%' }, clipPath: 'inset(0 100% 0 0)', duration: 1.1, ease: 'power4.out' }));
    // chat bubbles type in one after another
    gsap.from('#demo-chat p', { scrollTrigger: { trigger: '#demo-chat', start: 'top 85%' }, opacity: 0, y: 10, duration: 0.4, stagger: 0.55 });
  }

  /* ---------------------------------------------------------- project map */
  (function map() {
    const svg = document.getElementById('map-svg'), tip = document.getElementById('map-tip');
    if (!svg) return;
    const narrow = matchMedia('(max-width: 560px)').matches;
    // x: -1 hardware … +1 software · y: +1 research … -1 built things
    const P = [
      { id: 'gaze-arm', short: 'Gaze Arm', name: 'Gaze Arm', x: -0.35, y: -0.62, k: 'hw', note: 'Hackathon winner: eye-controlled pick and place on an xArm6.' },
      { id: 'omniring', short: 'OmniRing', name: 'OmniRing', x: -0.72, y: -0.28, k: 'hw', note: 'TinyML gesture ring on an nRF52840. In progress.', wip: true },
      { id: 'robot', short: 'Robot', name: 'Obstacle robot', x: -0.82, y: -0.78, k: 'hw', note: 'Arduino + ultrasonic sensor, first-year project.' },
      { id: 'gaze-research', short: 'Gaze est.', name: 'Gaze estimation', x: 0.48, y: 0.72, k: 'sw', note: 'Research: 2.48° webcam gaze error on held-out people.' },
      { id: 'optics', short: 'Optics', name: 'Optical deconvolution', x: 0.3, y: 0.86, k: 'sw', note: 'Research: complex-valued CNN on experimental optics data.' },
      { id: 'zonelogic', short: 'ZoneLogic', name: 'ZoneLogic', x: 0.82, y: -0.55, k: 'sw', note: 'Solo hackathon build: Boolean video rules, 117 tests.' },
      { id: 'einstein', short: 'Einstein', name: 'Einstein', x: 0.9, y: -0.2, k: 'sw', note: 'Gemini tutoring chatbot with LangChain and Gradio.' }
    ];
    const W = 1000, H = 560, m = 60, X = x => W / 2 + x * (W / 2 - m - 40), Y = y => H / 2 - y * (H / 2 - m);
    const ns = 'http://www.w3.org/2000/svg', el = (t, a, parent = svg) => { const n = document.createElementNS(ns, t); for (const k in a) n.setAttribute(k, a[k]); parent.append(n); return n; };
    for (let i = -4; i <= 4; i++) { el('line', { x1: X(i / 4), x2: X(i / 4), y1: m - 20, y2: H - m + 20, class: 'grid' }); el('line', { y1: Y(i / 4), y2: Y(i / 4), x1: m, x2: W - m, class: 'grid' }); }
    el('line', { x1: m, x2: W - m, y1: H / 2, y2: H / 2, class: 'axis' });
    el('line', { x1: W / 2, x2: W / 2, y1: m - 20, y2: H - m + 20, class: 'axis' });
    const lab = (s, x, y, a = {}) => { const t = el('text', { x, y, ...a }); t.textContent = s; return t; };
    lab('← hardware', m, H / 2 - 10); lab('software →', W - m, H / 2 - 10, { 'text-anchor': 'end' });
    lab('research ↑', W / 2 + 10, m - 4); lab('built things ↓', W / 2 + 10, H - m + 16);
    [['hardware research', -0.55, 0.7], ['software research', 0.72, 0.3], ['built hardware', -0.45, -0.95], ['built software', 0.5, -0.93]]
      .forEach(([s, x, y]) => lab(s, X(x), Y(y), { class: 'q', 'text-anchor': 'middle' }));
    P.forEach(p => {
      const g = el('g', {});
      if (p.wip) el('circle', { cx: X(p.x), cy: Y(p.y), r: 18, fill: 'none', stroke: 'var(--hw)', 'stroke-dasharray': '3 4' }, g);
      const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 10, class: 'pt', fill: p.k === 'hw' ? 'var(--hw)' : 'var(--sw)', stroke: 'var(--ink)', 'stroke-width': 1.5, tabindex: 0, role: 'link', 'aria-label': `${p.name}: ${p.note}` }, g);
      const left = p.x > 0.7, off = narrow ? 26 : 16;
      lab(narrow ? p.short : p.name, X(p.x) + (left ? -off : off), Y(p.y) + (narrow ? 10 : 4), { class: 'lbl', 'text-anchor': left ? 'end' : 'start' });
      const show = () => {
        const r = svg.getBoundingClientRect(), s = r.width / W;
        tip.hidden = false; tip.innerHTML = `<b>${p.name}</b><br>${p.note}`;
        tip.style.left = X(p.x) * s + 'px'; tip.style.top = Y(p.y) * s + 'px';
      };
      c.addEventListener('mouseenter', show); c.addEventListener('focus', show);
      c.addEventListener('mouseleave', () => tip.hidden = true); c.addEventListener('blur', () => tip.hidden = true);
      const go = () => { const t = document.getElementById(p.id); if (lenis) lenis.scrollTo(t, { offset: -70 }); else t.scrollIntoView({ behavior: 'smooth' }); };
      c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
    if (hasGsap && !reduced) gsap.from('#map-svg .pt', { scrollTrigger: { trigger: svg, start: 'top 75%' }, attr: { r: 0 }, duration: 0.6, ease: 'back.out(3)', stagger: 0.08 });
  })();

  /* -------------------------------------------------- horizontal timeline */
  (function timeline() {
    const wrap = document.getElementById('tl'), track = wrap && wrap.querySelector('.tl__track');
    if (!track) return;
    if (hasGsap && !reduced) {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 901px)', () => {
        const dist = () => Math.max(0, track.scrollWidth - wrap.clientWidth);
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: '#timeline', start: 'top top+=60', end: () => '+=' + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true }
        });
      });
      mm.add('(max-width: 900px)', () => { wrap.classList.add('is-scrollable'); return () => wrap.classList.remove('is-scrollable'); });
    } else wrap.classList.add('is-scrollable');
  })();

  /* ------------------------------------------------------ Urban Arbor trees */
  (function trees() {
    const row = document.getElementById('trees'); if (!row) return;
    for (let i = 0; i < 100; i++) { const t = document.createElement('i'); t.className = 'tree'; row.append(t); }
    const grow = () => [...row.children].slice(0, 20).forEach((t, i) => setTimeout(() => t.classList.add('on'), reduced ? 0 : i * 70));
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { grow(); o.disconnect(); } }, { threshold: 0.5 }).observe(row);
  })();

  /* --------------------------------------------------- draggable polaroids */
  (function polaroids() {
    const box = document.getElementById('polaroids'); if (!box) return;
    let z = 5;
    box.querySelectorAll('.polaroid').forEach(p => {
      let sx, sy, ox, oy, dragging = false;
      p.addEventListener('pointerdown', e => {
        if (matchMedia('(max-width: 560px)').matches) return; // stacked grid on phones
        dragging = true; p.setPointerCapture(e.pointerId); p.style.zIndex = ++z;
        sx = e.clientX; sy = e.clientY; ox = p.offsetLeft; oy = p.offsetTop;
      });
      p.addEventListener('pointermove', e => {
        if (!dragging) return;
        const maxX = box.clientWidth - p.offsetWidth, maxY = box.clientHeight - p.offsetHeight;
        p.style.left = Math.max(0, Math.min(maxX, ox + e.clientX - sx)) + 'px';
        p.style.top = Math.max(0, Math.min(maxY, oy + e.clientY - sy)) + 'px';
      });
      p.addEventListener('pointerup', () => { dragging = false; });
    });
  })();

  addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
