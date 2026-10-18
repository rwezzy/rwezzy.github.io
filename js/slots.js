/* Photo and video slots.
 *
 * <figure class="slot" data-src="images/x.jpg" data-caption="...">   a photo
 * <figure class="slot" data-video="videos/x.mp4" data-caption="..."> a muted looping video
 *
 * Drop a file at that path and it appears. A missing file shows a dashed
 * placeholder naming the path while you edit locally (file://, localhost, or
 * ?edit in the URL); on the live site a missing slot is hidden instead.
 */
(function () {
  const editing = location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', ''].includes(location.hostname) ||
    new URLSearchParams(location.search).has('edit');

  function empty(fig, path) {
    if (fig.dataset.missing) return;   // <video> and <source> can both report the same failure
    fig.dataset.missing = '1';
    if (!editing) { fig.classList.add('slot--hidden'); return; }
    fig.classList.add('slot--empty');
    const ph = document.createElement('div');
    ph.className = 'slot__ph';
    ph.innerHTML = '<span>＋ add a ' + (fig.dataset.video ? 'video' : 'photo') + ' at</span><b></b><span>(only you see this box)</span>';
    ph.querySelector('b').textContent = path;
    fig.prepend(ph);
  }

  function caption(fig) {
    if (!fig.dataset.caption) return;
    const c = document.createElement('figcaption');
    c.textContent = fig.dataset.caption;
    fig.append(c);
  }

  document.querySelectorAll('.slot').forEach(fig => {
    caption(fig);
    if (fig.dataset.video) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'metadata' });
      v.setAttribute('muted', '');
      v.addEventListener('error', () => { v.remove(); empty(fig, fig.dataset.video); }, true);
      const s = document.createElement('source');
      s.src = fig.dataset.video;
      s.addEventListener('error', () => { v.remove(); empty(fig, fig.dataset.video); });
      v.append(s);
      fig.prepend(v);
    } else if (fig.dataset.src) {
      const img = new Image();
      img.alt = fig.dataset.caption || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => { img.remove(); empty(fig, fig.dataset.src); };
      img.src = fig.dataset.src;
      fig.prepend(img);
    }
  });

  // The résumé button hides itself on the live site until resume.pdf exists.
  const r = document.querySelector('.resume-link');
  if (r && !editing && location.protocol !== 'file:') {
    fetch(r.getAttribute('href'), { method: 'HEAD' })
      .then(res => { if (!res.ok) r.parentElement.remove(); })
      .catch(() => r.parentElement.remove());
  }
})();
