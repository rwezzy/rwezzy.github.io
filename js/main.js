/* Page behaviour: clocks, nav, gentle reveals, trees, 10K pace. */
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
    const els = document.querySelectorAll('.section__head, .proj__intro, .proj__media, .mini, .path li, .arbor, .service li, .hobby, .research__item, .try__head, .pick');
    const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => { el.classList.add('reveal'); rio.observe(el); });
  }

  /* --------------------------------------------- Einstein, live (optional) */
  (function einstein() {
    const box = document.querySelector('.live-chat'); if (!box) return;
    // Put your Hugging Face Space URL in data-space, e.g. https://rwezzy-einstein.hf.space
    const space = (box.dataset.space || '').trim();
    const editing = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
    // On your own computer, fall back to the copy running locally (einstein-space/run_local.py).
    const url = space || (editing ? (box.dataset.spaceLocal || '') : '');
    if (!url) return;
    box.hidden = false;
    if (!space) box.querySelector('.live-chat__note').innerHTML = '(only you see this) Local preview: Einstein is running on your computer. For the live site, put your Hugging Face Space URL in <b>data-space</b>.';
    box.querySelector('[data-open-chat]').addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = url; f.title = 'Chat with Einstein'; f.allow = 'clipboard-write';
      const fail = document.createElement('p'); fail.className = 'mono live-chat__note';
      fail.textContent = space ? 'Einstein is waking up. If nothing appears in a few seconds, refresh the page.' : 'Nothing showing? Start Einstein first: run einstein-space/run_local.py.';
      box.replaceChildren(f, fail);
      const example = box.parentElement.querySelector('.chat'); if (example) example.hidden = true; // the real one replaces the scripted example
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
