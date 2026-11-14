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
    ['beyond', 'Beyond', ['#campus', '#beyond', '#offclock']],
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
  // Section links use the existing content nodes; their text and demo state stay intact.
  const anchor = (id, element) => { if (element && !element.id) element.id = id; };
  const researchItems = document.querySelectorAll('#research .research__item');
  anchor('research-hardware', researchItems[0]);
  anchor('research-gaze', researchItems[1]);
  anchor('research-optics', researchItems[2]);
  anchor('background-education', document.querySelector('#path .path__school'));
  anchor('background-njit', Array.from(document.querySelectorAll('#path li')).find(item => item.querySelector('h4')?.textContent.trim() === 'NJIT'));
  anchor('background-opportunities', document.querySelector('#path .path__next'));
  anchor('urban-arbor', document.querySelector('#beyond .arbor'));
  anchor('volunteering', document.querySelector('#beyond .service'));
  ['running', 'reading', 'cooking', 'writing'].forEach((id, index) => anchor(`interest-${id}`, document.querySelectorAll('#offclock .hobby')[index]));
  const sectionLinks = {
    projects: [
      ['soundscope', 'SoundScope', 'Sound localization, captions and event search'],
      ['gaze-arm', 'Gaze Arm', 'Gaze-controlled object selection'],
      ['zonelogic', 'ZoneLogic', 'Video rules and incident review'],
      ['omniring', 'OmniRing', 'Embedded gesture recognition'],
      ['einstein', 'Einstein', 'Conversational tutoring'],
      ['robot', 'Obstacle-avoiding robot', 'Sensors, circuitry and control'],
    ],
    research: [
      ['research-hardware', 'Hardware research', 'Exploring hardware labs at NJIT'],
      ['research-gaze', 'Gaze estimation', 'A colour pipeline with provision for depth'],
      ['optics', 'Optical deconvolution', 'Image restoration and an interactive experiment'],
    ],
    background: [
      ['background-education', 'Education & early experience', 'School, independent work and internships'],
      ['background-njit', 'At NJIT', 'Engineering, research and student roles'],
      ['background-opportunities', 'Next steps', 'Internship interests and contact details'],
    ],
    beyond: [
      ['ieee-viam', 'IEEE × Viam', 'A robotics hackathon for NJIT students at Viam'],
      ['urban-arbor', 'Urban Arbor', 'Tree planting and community support'],
      ['volunteering', 'Volunteering & teaching', 'Community work and student involvement'],
      ['interest-running', 'Running', 'Working toward a sub-40-minute 10 km'],
      ['interest-reading', 'Reading', 'The Alignment Problem'],
      ['interest-cooking', 'Cooking', 'Trying different preparations'],
      ['interest-writing', 'Writing', 'Developing a fictional universe'],
    ],
  };
  function populateSectionLinks(view) {
    const grid = document.querySelector('#s-section-links');
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    grid.setAttribute('aria-label', `${pages.find(page => page[0] === view)[1]} sections`);
    (sectionLinks[view] || []).forEach(([id, title, description], index) => {
      if (!document.getElementById(id)) return;
      const link = document.createElement('a'); link.href = `#${id}`; link.className = 's-section-tile';
      const number = document.createElement('span'); number.className = 's-section-number'; number.textContent = String(index + 1).padStart(2, '0');
      const arrow = document.createElement('span'); arrow.className = 's-section-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      const label = document.createElement('strong'); label.textContent = title;
      const detail = document.createElement('span'); detail.className = 's-section-description'; detail.textContent = description;
      link.append(number, arrow, label, detail); grid.append(link);
    });
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
  let desired = null, processing = false, nextView = 'home';
  let sceneAttachment = null;
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
    if (document.body.classList.contains('s-presenting') === presenting) return;
    const from = stage.getBoundingClientRect();
    document.body.classList.toggle('s-presenting', presenting);
    home.hidden = false;
    home.inert = presenting;
    if (presenting) home.setAttribute('aria-hidden', 'true');
    else home.removeAttribute('aria-hidden');
    const to = stage.getBoundingClientRect();
    const rect = box => ({ position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: '0px', zIndex: 4 });
    if (motion && !immediate && from.width && to.width) {
      try { await stage.animate([rect(from), rect(to)], { duration: 480, easing: 'cubic-bezier(.45,0,.25,1)' }).finished; } catch (_) { /* layout can be interrupted */ }
    }
    window.dispatchEvent(new Event('resize'));
  }
  const presentStage = options => fitStage(true, options);
  const retractStage = options => (desired?.view || nextView) === 'home' ? fitStage(false, options) : Promise.resolve();
  let telemetryTime = 0;
  const sceneReady = import('./studio-scene.js?v=desk6').then(async module => {
    scene = await module.createStudioScene(document.querySelector('#s-scene'), {
      onSelect: id => navigate(id),
      onStatus: text => { status.textContent = text; },
      onReady: () => { document.body.classList.add('s-scene-ready'); },
      onPresent: presentStage,
      onRetract: retractStage,
      onPresentationChange: rect => {
        if (!rect) return;
        document.body.dataset.surface = rect.kind || 'plaque';
        if (rect.suction) {
          document.body.style.setProperty('--s-cup-x', `${rect.suction.x}px`);
          document.body.style.setProperty('--s-cup-y', `${rect.suction.y}px`);
          document.body.style.setProperty('--s-cup-radius', `${Math.max(30, rect.suction.radius + 5)}px`);
        }
      },
      onTelemetry: ({ jointsDeg, phase }) => {
        const panel = document.querySelector('.s-telemetry');
        if (!panel || !jointsDeg) return;
        panel.hidden = false;
        const now = performance.now();
        if (now - telemetryTime < 80 && phase !== 'idle' && phase !== 'reading') return;
        telemetryTime = now;
        const angles = document.querySelector('#s-joints');
        if (angles) angles.innerHTML = jointsDeg.map((value, index) => `<span>J${index + 1}</span><b>${Number(value).toFixed(1)}°</b>`).join('');
        const phaseText = document.querySelector('#s-phase');
        if (phaseText) phaseText.textContent = phase.replaceAll('-', ' ').toUpperCase();
      },
    });
    // Deep links show their text immediately; the held background joins when its assets are ready.
    if (current !== 'home' && !processing) {
      const opening = current;
      const attachment = scene.pick(opening, { immediate: true }).then(() => {
        held = true;
        if (current === opening && !processing) { scene.setReaderMode(true); scene.setActive(true); }
      });
      sceneAttachment = attachment;
      try { await attachment; }
      finally { if (sceneAttachment === attachment) sceneAttachment = null; }
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
    document.body.dataset.surface = req.view === 'about' ? 'frame' : req.view === 'contact' ? 'notebook' : 'plaque';
    const leadTitle = document.querySelector('#s-lead-title');
    if (leadTitle) leadTitle.textContent = pages.find(p => p[0] === req.view)[1];
    const leadIndex = document.querySelector('#s-lead-index');
    if (leadIndex) leadIndex.textContent = `${String(pages.findIndex(p => p[0] === req.view) + 1).padStart(2, '0')} / PORTFOLIO`;
    const lead = document.querySelector('#s-reader-lead');
    if (lead) lead.hidden = req.view === 'about' || req.view === 'contact';
    populateSectionLinks(req.view);
    reader.hidden = false; home.hidden = !held; home.inert = true;
    home.setAttribute('aria-hidden', 'true');
    document.body.classList.add('s-reading');
    scene?.setReaderMode(held);
    scene?.setActive(held);
    await nextFrame();
    window.dispatchEvent(new Event('resize'));
    scrollTarget(req);
    if (!req.instant) await animate(reader, [{ opacity: 0 }, { opacity: 1 }], 250);
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
        nextView = req.view;
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
        // Finish a late startup attachment before returning it or selecting a new
        // object. Cleanup then belongs to this request, never the stale startup task.
        if (sceneAttachment) await sceneAttachment;
        if (held) { if (scene) await scene.putBack({ immediate: !motion || req.instant }); held = false; }
        if (desired) continue;
        if (req.view === 'home') {
          if (document.body.classList.contains('s-presenting')) await fitStage(false, { immediate: !motion || req.instant });
          status.textContent = scene ? 'Choose an object or a section' : 'Choose a section below';
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
  document.querySelector('#s-read-section')?.addEventListener('click', () => {
    content.scrollIntoView({ behavior: motion ? 'smooth' : 'instant', block: 'start' });
  });
  const updateReadingWindow = () => {
    document.body.classList.toggle('s-reader-scrolled', window.scrollY > 80);
  };
  addEventListener('scroll', updateReadingWindow, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.target.matches('input,textarea,select')) navigate('top');
  });
  addEventListener('popstate', () => navigate(location.hash, true, 'none'));
  addEventListener('hashchange', () => navigate(location.hash, true, 'none'));
  // All links remain deep-linkable; refresh skips the introductory movement.
  if (location.hash && !['#top', '#home', '#desk'].includes(location.hash)) navigate(location.hash, true, 'none');
})();
