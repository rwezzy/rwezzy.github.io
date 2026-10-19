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

  /* ------------------------------------------------- Einstein, live chat */
  (function einstein() {
    const box = document.querySelector('.einchat'); if (!box) return;
    // data-api: your Hugging Face Space URL. On your own computer it falls back to run_local.py.
    const api = (box.dataset.api || '').trim();
    const editing = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
    const url = (api || (editing ? box.dataset.apiLocal || '' : '')).replace(/\/$/, '');
    if (!url) return; // no backend yet: visitors just see the example conversation
    const example = box.parentElement.querySelector('.chat');
    const log = box.querySelector('.einchat__log'), form = box.querySelector('form'), input = form.querySelector('input'), send = form.querySelector('button');
    const note = box.querySelector('.einchat__note');
    const history = [];

    // tiny, safe markdown: escape everything, then allow **bold**, *italics*, `code` and lists
    const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function md(text) {
      const lines = esc(text).split('\n'), out = []; let list = null;
      const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
      for (const raw of lines) {
        const l = raw.trim(), ul = l.match(/^[-*•]\s+(.*)/), ol = l.match(/^\d+[.)]\s+(.*)/);
        const kind = ul ? 'ul' : ol ? 'ol' : null;
        if (kind) { if (list !== kind) { if (list) out.push(`</${list}>`); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline((ul || ol)[1])}</li>`); continue; }
        if (list) { out.push(`</${list}>`); list = null; }
        if (l) out.push(`<p>${inline(l)}</p>`);
      }
      if (list) out.push(`</${list}>`);
      return out.join('');
    }
    function bubble(role, text) {
      const d = document.createElement('div');
      d.className = 'einchat__msg einchat__msg--' + (role === 'user' ? 'me' : 'bot');
      if (role === 'user') d.textContent = text; else d.innerHTML = md(text);
      log.append(d); log.scrollTop = log.scrollHeight;
      return d;
    }

    box.hidden = false;
    if (example) example.hidden = true;
    bubble('assistant', "Hi, I am Albert. How can I help you today?");
    note.innerHTML = !api ? '(only you see this) Running on your computer. For the live site, put your Hugging Face Space URL in <b>data-api</b>.'
      : 'Runs on a free server that naps when nobody is around, so the first reply can take a little while.';

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim(); if (!text) return;
      input.value = ''; input.disabled = send.disabled = true;
      bubble('user', text);
      const thinking = bubble('assistant', ''); thinking.classList.add('is-thinking'); thinking.innerHTML = '<span></span><span></span><span></span>';
      let reply;
      for (let attempt = 0; attempt < 3 && reply === undefined; attempt++) {
        try {
          const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
          const res = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history }), signal: ctl.signal });
          clearTimeout(timer);
          const data = await res.json();
          reply = data.reply || '';
        } catch (err) {
          if (attempt < 2) { thinking.dataset.wait = 'waking Einstein up…'; await new Promise(r => setTimeout(r, 4000)); }
        }
      }
      thinking.remove();
      if (reply === undefined) {
        bubble('assistant', editing && !api ? "I'm not running. Start me with einstein-space/run_local.py." : "I couldn't get through just now. Please try again in a minute.");
      } else {
        history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        bubble('assistant', reply);
      }
      input.disabled = send.disabled = false; input.focus();
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
