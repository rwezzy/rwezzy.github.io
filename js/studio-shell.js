/* Presentation only. Existing project nodes and demo modules remain intact. */
(() => {
  history.scrollRestoration = 'manual';
  const home = document.querySelector('.s-home');
  const reader = document.querySelector('#s-reader');
  const content = document.querySelector('#s-content-root');
  const status = document.querySelector('#s-status');
  const nav = document.querySelector('.s-nav');
  const stage = document.querySelector('.s-scene-wrap');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pages = [
    ['about', 'About', ['.intro']],
    ['projects', 'Projects', ['#work', '#try']],
    ['research', 'Research', ['#research', '#optics']],
    ['background', 'Background', ['#path']],
    ['beyond', 'Beyond', ['#beyond', '#offclock']],
    ['contact', 'Contact', ['#contact']],
  ];
  const nodes = new Map(pages.map(([id, , selectors]) => [id, selectors.map(s => content.querySelector(s)).filter(Boolean)]));
  const views = new Map();
  for (const [id, label] of pages) {
    const view = document.createElement('section');
    view.className = 's-view'; view.dataset.readerView = id;
    view.setAttribute('aria-label', label); view.hidden = true;
    for (const node of nodes.get(id)) view.append(node);
    content.append(view); views.set(id, view);
  }
  // Both demos belong to their original project: move intact nodes, never recreate canvases.
  const gaze = document.querySelector('#gaze-arm');
  const pick = document.querySelector('#try');
  gaze.after(pick);
  const projectList = document.createElement('nav');
  projectList.className = 's-project-index'; projectList.setAttribute('aria-label', 'Project index');
  const projects = [
    ['soundscope', 'SoundScope', 'Sound localization', '01'],
    ['gaze-arm', 'Gaze Arm', 'Gaze-controlled robotics', '02'],
    ['zonelogic', 'ZoneLogic', 'Video event rules', '03'],
    ['omniring', 'OmniRing', 'Embedded gesture recognition', '04'],
    ['optics', 'Optical deconvolution', 'Computational imaging', '05'],
    ['einstein', 'Einstein', 'Conversational tutoring', '06'],
  ];
  for (const [id, label, detail, number] of projects) {
    const a = document.createElement('a'); a.href = `#${id}`;
    a.innerHTML = `<span class="s-index-number">${number}</span><span><strong>${label}</strong><small>${detail}</small></span><span aria-hidden="true">↗</span>`;
    projectList.append(a);
  }
  document.querySelector('#work > .section__head').after(projectList);
  // Keep the full original instructions available without pushing the live demo below the fold.
  for (const paragraph of document.querySelectorAll('.ss-lab-intro, .try__head > p:last-child')) {
    const details = document.createElement('details');
    details.className = 's-demo-instructions';
    const summary = document.createElement('summary');
    summary.textContent = 'How to use this demo';
    paragraph.before(details); details.append(summary, paragraph);
  }

  let motion = !reduced.matches, scene = null, current = 'home', held = false;
  let desired = null, processing = false;
  const motionButton = document.querySelector('#s-motion');
  const updateMotion = () => {
    motionButton.setAttribute('aria-pressed', String(motion));
    motionButton.innerHTML = `Motion ${motion ? 'on' : 'off'} <span aria-hidden="true">${motion ? '◉' : '○'}</span>`;
  };
  updateMotion();
  motionButton.addEventListener('click', () => { motion = !motion; updateMotion(); });
  reduced.addEventListener('change', () => { motion = !reduced.matches; updateMotion(); });
  let pickingDemo = null;
  const prepareDemos = view => {
    if (view !== 'projects' || pickingDemo) return;
    pickingDemo = import('./pick.js').catch(error => {
      console.warn('Gaze demo unavailable:', error);
      const message = document.querySelector('.pick__say');
      if (message) message.textContent = 'The robot preview could not load. Please refresh to retry.';
      pickingDemo = null;
    });
  };
  async function fitStage(presenting, { immediate = false } = {}) {
    const from = stage.getBoundingClientRect();
    document.body.classList.toggle('s-presenting', presenting);
    home.hidden = false;
    home.inert = presenting;
    if (presenting) home.setAttribute('aria-hidden', 'true');
    else home.removeAttribute('aria-hidden');
    const to = stage.getBoundingClientRect();
    const rect = box => ({ position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: '0px', zIndex: 4 });
    if (motion && !immediate && from.width && to.width) {
      try { await stage.animate([rect(from), rect(to)], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' }).finished; } catch (_) { /* layout can be interrupted */ }
    }
    window.dispatchEvent(new Event('resize'));
  }
  const presentStage = options => fitStage(true, options);
  const retractStage = options => fitStage(false, options);
  const sceneReady = import('./studio-scene.js?v=glass4').then(async module => {
    scene = await module.createStudioScene(document.querySelector('#s-scene'), {
      onSelect: id => navigate(id),
      onStatus: text => { status.textContent = text; },
      onReady: () => { document.body.classList.add('s-scene-ready'); },
      onPresent: presentStage,
      onRetract: retractStage,
      onPresentationChange: rect => {
        if (!rect || rect.progress < 0.999) return;
        document.body.style.setProperty('--s-reader-top', `${Math.max(0, rect.top)}px`);
        document.body.style.setProperty('--s-reader-side', `${Math.max(0, rect.left)}px`);
      },
    });
    // Deep links show their text immediately; the held background joins when its assets are ready.
    if (current !== 'home' && !processing) {
      const opening = current;
      await scene.pick(opening, { immediate: true });
      held = true;
      if (current === opening) scene.setReaderMode(true);
      else { await scene.putBack({ immediate: true }); held = false; }
    }
    return scene;
  }).catch(error => {
    console.warn('Studio illustration unavailable:', error);
    document.body.classList.add('s-scene-fallback');
    status.textContent = 'Choose a section below';
    const fallback = document.createElement('div');
    fallback.className = 's-fallback';
    fallback.innerHTML = '<span>01 — 06</span><p>Explore the portfolio.</p><small>The 3D preview is unavailable. All pages and project demos are still accessible.</small>';
    document.querySelector('.s-scene-wrap').append(fallback);
    return null;
  });
  function resolve(hash) {
    const target = (hash || '').replace(/^#/, '');
    if (!target || ['top', 'desk', 'home'].includes(target)) return { view: 'home', target: '' };
    if (views.has(target)) return { view: target, target: '' };
    const el = document.getElementById(target);
    const container = el?.closest('[data-reader-view]');
    return container ? { view: container.dataset.readerView, target } : { view: 'home', target: '' };
  }
  function navigate(hash, instant = false, historyMode = 'push') {
    const req = { ...resolve(hash), instant };
    const nextHash = req.view === 'home' ? '#top' : `#${req.target || req.view}`;
    if (historyMode === 'push' && location.hash !== nextHash) history.pushState(null, '', nextHash);
    desired = req;
    document.querySelectorAll('[data-view]').forEach(el => {
      const active = el.dataset.view === req.view;
      el.classList.toggle('is-current', active);
      if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    pump();
  }
  const animate = async (el, frames, duration) => {
    if (!motion) return;
    try { await el.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' }).finished; } catch (_) { /* navigation can interrupt */ }
  };
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  async function show(req) {
    prepareDemos(req.view);
    for (const [id, view] of views) view.hidden = id !== req.view;
    document.querySelector('#s-page-label').textContent = `${String(pages.findIndex(p => p[0] === req.view) + 1).padStart(2, '0')} / ${pages.find(p => p[0] === req.view)[1].toUpperCase()}`;
    current = req.view;
    reader.hidden = false; home.hidden = !held; home.inert = true;
    home.setAttribute('aria-hidden', 'true');
    document.body.classList.add('s-reading');
    scene?.setReaderMode(held);
    scene?.setActive(held);
    await nextFrame();
    window.dispatchEvent(new Event('resize'));
    scrollTarget(req);
    if (!req.instant) await animate(reader, [{ opacity: 0 }, { opacity: 1 }], 170);
    focusTarget(req);
  }
  function scrollTarget(req) {
    if (req.target) document.getElementById(req.target)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function focusTarget(req) {
    if (req.view === 'home') return;
    const section = req.target ? document.getElementById(req.target) : views.get(req.view);
    const target = section?.querySelector('h1,h2,h3,h4') || section;
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  }
  async function pump() {
    if (processing) return;
    processing = true;
    document.body.setAttribute('aria-busy', 'true');
    try {
      while (desired) {
        const req = desired; desired = null;
        // A return request can arrive while the first plaque is still being lifted.
        // Finish returning it even though the reading view has not opened yet.
        if (current === req.view && !(req.view === 'home' && held)) { scrollTarget(req); focusTarget(req); continue; }
        document.body.classList.add('s-transitioning');
        if (current !== 'home') {
          if (!req.instant) await animate(reader, [{ opacity: 1 }, { opacity: 0 }], 140);
          reader.hidden = true; home.hidden = false; home.inert = false;
          home.removeAttribute('aria-hidden');
          document.body.classList.remove('s-reading');
          current = 'home'; window.scrollTo({ top: 0, behavior: 'instant' });
          scene?.setActive(true);
          scene?.setReaderMode(false);
          await nextFrame(); window.dispatchEvent(new Event('resize'));
        }
        if (held) { if (scene) await scene.putBack({ immediate: !motion || req.instant }); held = false; }
        if (desired) continue;
        if (req.view === 'home') {
          if (document.body.classList.contains('s-presenting')) await retractStage({ immediate: true });
          status.textContent = scene ? 'Select a plaque or a section' : 'Choose a section below';
          document.querySelector('.s-brand').focus({ preventScroll: true });
          continue;
        }
        // A slow or unsupported graphics loader must never prevent reading the site.
        if (!scene && motion && !req.instant) await Promise.race([sceneReady, new Promise(resolve => setTimeout(resolve, 2200))]);
        if (desired) continue;
        if (scene) {
          home.inert = true;
          await scene.pick(req.view, { immediate: !motion || req.instant });
          held = true;
        }
        if (desired) { home.inert = false; continue; }
        await show(req);
      }
    } catch (error) {
      console.warn('Page transition recovered:', error);
      const fallback = desired || resolve(location.hash); desired = null;
      home.inert = false;
      home.removeAttribute('aria-hidden');
      if (fallback.view !== 'home') await show({ ...fallback, instant: true });
      else { reader.hidden = true; home.hidden = false; current = 'home'; scene?.setActive(true); document.body.classList.remove('s-reading', 's-presenting'); }
    } finally {
      processing = false;
      document.body.removeAttribute('aria-busy');
      document.body.classList.remove('s-transitioning');
      if (desired) pump();
    }
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-home],[data-view],a[href^="#"]');
    if (!button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const hash = button.hasAttribute('data-home') ? 'top' : button.dataset.view || button.getAttribute('href');
    if (!hash || hash === '#') return;
    if (hash !== 'top' && resolve(hash).view === 'home') return;
    e.preventDefault(); navigate(hash, button.hasAttribute('data-instant'));
  });
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('pointerenter', () => scene?.hover(el.dataset.view));
    el.addEventListener('pointerleave', () => scene?.hover(null));
    el.addEventListener('focus', () => scene?.hover(el.dataset.view));
    el.addEventListener('blur', () => scene?.hover(null));
  });
  document.querySelector('#s-next').addEventListener('click', () => {
    navigate(pages[(pages.findIndex(p => p[0] === current) + 1) % pages.length][0]);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.target.matches('input,textarea,select')) navigate('top');
  });
  addEventListener('popstate', () => navigate(location.hash, true, 'none'));
  addEventListener('hashchange', () => navigate(location.hash, true, 'none'));
  // All links remain deep-linkable; refresh skips the introductory movement.
  if (location.hash && !['#top', '#home', '#desk'].includes(location.hash)) navigate(location.hash, true, 'none');
})();
