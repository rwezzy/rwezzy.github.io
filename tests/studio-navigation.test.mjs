import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const shell = readFileSync(new URL('../js/studio-shell.js', import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };

// This fixture runs the complete production shell. Only browser surfaces and the
// graphics/inspector boundaries are replaced; navigation, interruption, and history stay real.
function browser({ hash = '', pickGate = null, immediatePickGate = null, sceneGate = null,
  inspectGate = null, returnGate = null, inspectorGate = null } = {}) {
  const events = new Map(), pushed = [], scrolls = [], calls = [];
  let focused = null, hooks;
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = new Map(); this.dataset = {};
      this.children = []; this.parentElement = null; this.hidden = false; this.inert = false;
      this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
      this.listeners = new Map(); this.textContent = ''; this._className = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
        toggle: (name, force) => {
          const on = force ?? !this.classList.contains(name);
          this.classList[on ? 'add' : 'remove'](name); return on;
        },
      };
      Object.entries(attrs).forEach(([name, value]) => this.setAttribute(name, value));
    }
    get className() { return this._className; }
    set className(value) { this._className = value; }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get href() { return this.getAttribute('href') || ''; }
    set href(value) { this.setAttribute('href', value); }
    get firstChild() { return this.children[0] || null; }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = String(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) {
      for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); }
    }
    removeChild(node) {
      assert.equal(node.parentElement, this, 'Only a direct child can be removed');
      node.remove(); return node;
    }
    remove() {
      if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
    after(node) { this.insertRelative(node, 1); }
    before(node) { this.insertRelative(node, 0); }
    insertRelative(node, offset) {
      const parent = this.parentElement; node.remove(); node.parentElement = parent;
      parent.children.splice(parent.children.indexOf(this) + offset, 0, node);
    }
    matches(selector) {
      return selector.split(',').some(raw => {
        const part = raw.trim();
        if (part.includes(' > ')) {
          const [parent, child] = part.split(' > ');
          return this.matches(child) && !!this.parentElement?.matches(parent);
        }
        if (/\s/.test(part)) {
          const ancestors = part.split(/\s+/);
          if (!this.matches(ancestors.pop())) return false;
          let parent = this.parentElement;
          while (ancestors.length) {
            const wanted = ancestors.pop();
            while (parent && !parent.matches(wanted)) parent = parent.parentElement;
            if (!parent) return false;
            parent = parent.parentElement;
          }
          return true;
        }
        if (part.startsWith('#')) return this.id === part.slice(1);
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        const attribute = part.match(/^(\w+)?\[([^\]^=]+)(\^?=)?["']?([^"'\]]*)["']?\]$/);
        if (attribute) {
          const [, tag, name, op, value] = attribute;
          const actual = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(name);
          return (!tag || this.tagName === tag.toUpperCase()) && actual != null && (!op || (op === '^=' ? actual.startsWith(value) : actual === value));
        }
        return this.tagName === part.toUpperCase();
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
      return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    focus() { focused = this; }
    scrollIntoView(options) { scrolls.push({ id: this.id, options }); }
    getBoundingClientRect() { return { x: 0, y: 88, left: 0, top: 88, right: 1200, bottom: 738, width: 1200, height: 650 }; }
    animate() { return { finished: Promise.resolve(), cancel() {} }; }
  }
  const body = new Element('body', { class: 'studio-site' });
  const add = (parent, tag, attrs) => { const el = new Element(tag, attrs); parent.append(el); return el; };
  const header = add(body, 'header', { class: 's-header', id: 'nav' });
  const brand = add(header, 'a', { class: 's-brand', 'data-home': '', href: '#top' });
  const nav = add(header, 'nav', { class: 's-nav' });
  const buttons = new Map();
  for (const id of ['about', 'projects', 'research', 'background', 'beyond', 'contact']) buttons.set(id, add(nav, 'a', { 'data-view': id, href: `#${id}` }));
  const home = add(body, 'main', { class: 's-home', id: 'top' });
  const inspectButtons = new Map();
  for (const id of ['soundscope', 'omniring']) {
    inspectButtons.set(id, add(home, 'button', { 'data-inspect': id }));
  }
  const stage = add(home, 'div', { class: 's-scene-wrap', id: 's-scene-wrap' });
  add(stage, 'canvas', { id: 's-scene' });
  add(home, 'span', { id: 's-status' }); add(home, 'button', { id: 's-motion' });
  const reader = add(body, 'div', { id: 's-reader' }); reader.hidden = true;
  add(reader, 'p', { id: 's-page-label' });
  const lead = add(reader, 'div', { id: 's-reader-lead' });
  add(lead, 'h1', { id: 's-lead-title' }); add(lead, 'p', { id: 's-lead-index' });
  const sectionLinks = add(lead, 'nav', { id: 's-section-links' });
  add(lead, 'button', { id: 's-read-section' });
  const telemetry = add(reader, 'aside', { class: 's-telemetry' }); telemetry.hidden = true;
  add(telemetry, 'span', { id: 's-phase' }); add(telemetry, 'div', { id: 's-joints' });
  const content = add(reader, 'div', { id: 's-content-root' });
  const intro = add(content, 'section', { class: 'intro' }); add(intro, 'h1');
  const work = add(content, 'section', { id: 'work' });
  const heading = add(work, 'header', { class: 'section__head' }); add(heading, 'h2');
  for (const id of ['soundscope', 'gaze-arm', 'research', 'zonelogic', 'omniring', 'optics', 'einstein', 'robot']) {
    const article = add(work, 'article', { id }); add(article, 'h3');
    if (id === 'soundscope') add(article, 'div', { id: 'soundscope-lab' });
    if (id === 'research') {
      const items = add(article, 'div', { class: 'research' });
      for (const title of ['Hardware research', 'Gaze estimation with a depth camera', 'Optical image restoration']) {
        const item = add(items, 'div', { class: 'research__item' });
        add(item, 'h4').textContent = title;
      }
    }
  }
  for (const id of ['try', 'path', 'beyond', 'offclock', 'contact']) { const section = add(content, 'section', { id }); add(section, 'h2'); }
  const path = add(content.querySelector('#path'), 'ol', { class: 'path' });
  for (const [className, title] of [['path__school', 'Aga Khan High School, Kampala'], ['', 'NJIT'], ['path__next', 'Internship opportunities']]) {
    const item = add(path, 'li', { class: className }); add(add(item, 'div'), 'h4').textContent = title;
  }
  const beyond = content.querySelector('#beyond');
  add(add(beyond, 'article', { class: 'arbor' }), 'h3').textContent = 'Urban Arbor';
  const service = add(beyond, 'ul', { class: 'service' });
  add(add(service, 'li'), 'h4').textContent = 'New Jersey, 2025';
  for (const [id, title] of [['service-nrhh', 'National Residence Hall Honorary (NRHH)'], ['service-st-patricks', "St. Patrick's Pro-Cathedral"], ['service-making-strides', 'Making Strides Breast Cancer Awareness Walk']]) {
    add(add(service, 'li', { id }), 'h4').textContent = title;
  }
  const hobbies = add(content.querySelector('#offclock'), 'div', { class: 'hobbies' });
  for (const title of ['Running', 'Reading', 'Cooking', 'Writing']) {
    add(add(hobbies, 'article', { class: 'hobby' }), 'h4').textContent = title;
  }
  const campus = add(content, 'section', { id: 'campus' });
  add(add(campus, 'header', { id: 'responsibilities' }), 'h2').textContent = 'Responsibilities';
  add(add(campus, 'article', { id: 'ieee-viam' }), 'h3').textContent = 'IEEE × Viam';
  add(add(hobbies, 'article', { class: 'hobby hobby--pets', id: 'interest-dogs' }), 'h4').textContent = 'Pets';
  add(reader, 'button', { id: 's-next' });
  const document = {
    body, documentElement: new Element('html'), createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    getElementById: id => body.querySelector(`#${id}`),
    addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
  };
  const location = { hash };
  let presentation = null, scenePage = null, sceneAssembly = null, exploded = false, highlighted = null;
  // Small, deliberately distinct component lists exercise the shell's contract
  // with the scene and panel without reproducing either module's implementation.
  const assemblies = {
    soundscope: { id: 'soundscope', title: 'SoundScope', parts: [
      { id: 'board', title: 'Four-microphone array', description: 'Audio direction.' },
      { id: 'camera', title: 'RGB-D camera', description: 'Image and depth.' },
    ] },
    omniring: { id: 'omniring', title: 'OmniRing', parts: [
      { id: 'xiao', title: 'Microcontroller', description: 'Gesture classification.' },
      { id: 'housing', title: 'Ring housing', description: 'Concept enclosure.' },
    ] },
  };
  const panel = add(body, 'aside', { 'aria-label': 'Component inspector' }); panel.hidden = true;
  const panelTitle = add(panel, 'h2'), partTitle = add(panel, 'h3');
  const panelParts = add(panel, 'div');
  const panelClose = add(panel, 'button'), panelProject = add(panel, 'button'), panelExplode = add(panel, 'button');
  panelClose.textContent = 'Return to desk'; panelProject.textContent = 'View project'; panelExplode.textContent = 'Assembly view';
  let inspected = null, selectedPart = null, inspectorHooks = null;
  const panelAPI = {
    show(assembly) {
      inspected = assembly; selectedPart = null; panel.hidden = false; panelTitle.textContent = assembly.title;
      panelExplode.setAttribute('aria-pressed', String(assembly.exploded));
      while (panelParts.firstChild) panelParts.removeChild(panelParts.firstChild);
      for (const part of assembly.parts) {
        const button = add(panelParts, 'button', { 'data-part': part.id }); button.textContent = part.title;
        button.addEventListener('click', () => {
          panelAPI.selectPart(part.id); inspectorHooks.onSelectPart(part.id, inspected.id);
        });
      }
    },
    hide() { panel.hidden = true; },
    selectPart(id) {
      const part = inspected?.parts.find(part => part.id === id);
      if (!part) return;
      selectedPart = id; partTitle.textContent = part.title;
    },
    setExploded(value) { panelExplode.setAttribute('aria-pressed', String(value)); },
  };
  panelClose.addEventListener('click', () => { panelAPI.hide(); inspectorHooks.onClose(inspected.id); });
  panelProject.addEventListener('click', () => { panelAPI.hide(); inspectorHooks.onOpenProject(inspected.id); });
  panelExplode.addEventListener('click', () => {
    const next = panelExplode.getAttribute('aria-pressed') !== 'true';
    panelAPI.setExploded(next); inspectorHooks.onToggleExploded(next, inspected.id);
  });
  const emitPresentation = value => { presentation = value; hooks.onPresentationChange?.(value); };
  const scene = {
    async pick(id, options = {}) {
      calls.push(['pick', id, { ...options }]);
      if (pickGate && !options.immediate) { const gate = pickGate; pickGate = null; await gate.promise; }
      if (immediatePickGate && options.immediate) { const gate = immediatePickGate; immediatePickGate = null; await gate.promise; }
      await hooks.onPresent?.({ ...options, pageId: id });
      // These are fixture geometry reports, not assertions about physical gripping.
      const kind = id === 'about' ? 'frame' : id === 'contact' ? 'notebook' : 'plaque';
      emitPresentation({ ...stage.getBoundingClientRect(), kind, progress: 1,
        suction: kind === 'plaque' ? { x: 600, y: 410, radius: 55 } : null });
      scenePage = id;
    },
    async putBack(options = {}) {
      calls.push(['putBack']);
      if (returnGate) { const gate = returnGate; returnGate = null; await gate.promise; }
      sceneAssembly = null; exploded = false; highlighted = null;
      await hooks.onRetract?.(options);
      scenePage = null;
      calls.push(['retracted', body.classList.contains('s-presenting')]);
    },
    async inspect(id, options = {}) {
      calls.push(['inspect', id]);
      await hooks.onPresent?.({ ...options, pageId: id, kind: 'assembly' });
      if (inspectGate) { const gate = inspectGate; inspectGate = null; await gate.promise; }
      scenePage = null; sceneAssembly = id; exploded = true;
      return { ...assemblies[id], exploded: true };
    },
    async setExploded(value) { calls.push(['setExploded', value]); exploded = value; },
    highlightPart(id) { calls.push(['highlightPart', id]); highlighted = id; },
    setActive: value => calls.push(['active', value]), setReaderMode: value => calls.push(['readerMode', value]),
    getPresentationRect: () => presentation, hover() {},
  };
  // Production scene operations are serialized. Preserve that ordering here so
  // stale shell cleanup cannot silently return an object chosen by a newer request.
  let operationQueue = Promise.resolve();
  for (const method of ['pick', 'putBack', 'inspect', 'setExploded']) {
    const operation = scene[method].bind(scene);
    scene[method] = (...args) => {
      const next = operationQueue.then(() => operation(...args));
      operationQueue = next.catch(() => {});
      return next;
    };
  }
  const context = {
    document, location, console, performance: { now: () => 1000 }, Event: class { constructor(type) { this.type = type; } },
    history: { pushState: (_, __, hash) => { location.hash = hash; pushed.push(hash); } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: fn => { queueMicrotask(() => fn(0)); return 1; }, cancelAnimationFrame() {},
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    addEventListener: document.addEventListener,
    dispatchEvent: event => { for (const fn of events.get(event.type) || []) fn(event); },
    scrollTo: options => scrolls.push({ id: 'top', options }),
    innerWidth: 1200, innerHeight: 900,
    loadScene: async () => {
      if (sceneGate) await sceneGate.promise;
      return { createStudioScene: async (_, options) => { hooks = options; hooks.onReady?.(); return scene; } };
    },
    loadDemo: async () => { calls.push(['loadDemo']); return {}; },
    loadStreak: async () => ({ mountStreak: element => { calls.push(['mountStreak', element.textContent]); return () => {}; } }),
    loadInspector: async () => {
      calls.push(['loadInspector']);
      if (inspectorGate) await inspectorGate.promise;
      return { createStudioInspector: options => { inspectorHooks = options; return panelAPI; } };
    },
  };
  context.window = context;
  const executable = shell.replace(/import\('\.\/studio-scene\.js[^']*'\)/, 'loadScene()')
    .replace(/import\('\.\/studio-streak\.js[^']*'\)/g, 'loadStreak()')
    .replace(/import\('\.\/pick\.js[^']*'\)/g, 'loadDemo()')
    .replace(/import\('\.\/studio-inspector\.js[^']*'\)/g, 'loadInspector()');
  assert.notEqual(executable, shell, 'The graphics import must be stubbed');
  runInNewContext(executable, context, { filename: 'studio-shell.js' });
  const click = element => {
    const event = { target: element, preventDefault() {} };
    for (let node = element; node; node = node.parentElement) {
      for (const fn of node.listeners.get('click') || []) fn(event);
    }
    for (const fn of events.get('click') || []) fn(event);
  };
  return {
    document, body, home, reader, brand, buttons, calls, pushed, scrolls, location, click, sectionLinks,
    cards: () => sectionLinks.querySelectorAll('a'),
    card: title => sectionLinks.querySelectorAll('a').find(link => link.querySelector('strong')?.textContent === title),
    present: emitPresentation, telemetry: value => hooks.onTelemetry?.(value),
    get focused() { return focused; },
    get scenePage() { return scenePage; },
    get sceneAssembly() { return sceneAssembly; },
    get exploded() { return exploded; },
    get highlighted() { return highlighted; },
    inspectButtons, panel, panelTitle, panelClose, panelProject, panelExplode, partTitle,
    partButton: id => panelParts.querySelector(`[data-part="${id}"]`),
    get selectedPart() { return selectedPart; },
    // The scene emits this callback after applying its own mesh highlight.
    selectScenePart: id => { scene.highlightPart(id); hooks.onPartSelect(id); },
    escape: (target = home) => { for (const fn of events.get('keydown') || []) fn({ key: 'Escape', target }); },
    view: id => content.children.find(el => el.dataset.readerView === id),
    link: hash => new Element('a', { href: hash }),
    pop: hash => { location.hash = hash; context.dispatchEvent(new context.Event('popstate')); },
  };
}

test('an initial project deep link opens the owning view before graphics are available', async () => {
  const app = browser({ hash: '#optics', sceneGate: deferred() });
  await flush();
  assert.equal(app.view('research').hidden, false);
  assert.equal(app.view('projects').hidden, true);
  assert.equal(app.reader.hidden, false);
  assert.equal(app.scrolls.at(-1).id, 'optics');
  assert.equal(app.focused.tagName, 'H3');
  assert.deepEqual(app.pushed, []);
});

test('late graphics attach behind an open deep link without resetting scroll or focus', async () => {
  const gate = deferred(), app = browser({ hash: '#optics', sceneGate: gate });
  await flush();
  assert.equal(app.reader.hidden, false, 'Content is readable before the graphics loader resolves');
  assert.equal(app.view('research').hidden, false);
  assert.equal(app.scrolls.at(-1).id, 'optics');
  const scrollCount = app.scrolls.length, heading = app.focused;
  gate.resolve(); await flush();
  assert.ok(app.calls.some(([action, id, options]) => action === 'pick' && id === 'research' && options.immediate));
  assert.ok(app.calls.some(([action, enabled]) => action === 'readerMode' && enabled));
  assert.equal(app.body.classList.contains('s-presenting'), true);
  assert.equal(app.home.hidden, false, 'The held scene is available behind the document');
  assert.equal(app.reader.hidden, false);
  assert.equal(app.view('research').hidden, false);
  assert.equal(app.scrolls.length, scrollCount, 'Late assets must not move the reader');
  assert.equal(app.focused, heading);
  assert.equal(app.location.hash, '#optics');
  assert.deepEqual(app.pushed, []);
});

test('returning home during late graphics attachment leaves no stale reader background', async () => {
  const graphics = deferred(), attachment = deferred();
  const app = browser({ hash: '#optics', sceneGate: graphics, immediatePickGate: attachment });
  await flush();
  graphics.resolve(); await flush();
  assert.ok(app.calls.some(([action, id, options]) => action === 'pick' && id === 'research' && options.immediate));
  app.click(app.brand); await flush();
  assert.equal(app.reader.hidden, true);
  attachment.resolve(); await flush();
  assert.ok(app.calls.some(([action]) => action === 'putBack'));
  assert.equal(app.location.hash, '#top');
  assert.equal(app.reader.hidden, true);
  assert.equal(app.home.hidden, false);
  assert.equal(app.home.inert, false);
  assert.equal(app.home.hasAttribute('aria-hidden'), false);
  assert.equal(app.body.classList.contains('s-presenting'), false);
  assert.equal(app.body.classList.contains('s-reading'), false);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
  assert.equal(app.focused, app.brand);
});

test('a new section during startup attachment keeps its own object after serialized scene operations settle', async () => {
  const graphics = deferred(), attachment = deferred();
  const app = browser({ hash: '#about', sceneGate: graphics, immediatePickGate: attachment });
  await flush();
  graphics.resolve(); await flush();
  assert.ok(app.calls.some(([action, id, options]) => action === 'pick' && id === 'about' && options.immediate));
  app.click(app.buttons.get('contact')); await flush();
  attachment.resolve(); await flush(); await flush();
  assert.deepEqual(app.calls.filter(([action]) => action === 'pick' || action === 'putBack').map(([action, id]) => [action, id]), [
    ['pick', 'about'], ['putBack', undefined], ['pick', 'contact'],
  ]);
  assert.equal(app.scenePage, 'contact', 'Late startup cleanup must not return the new section object');
  assert.equal(app.location.hash, '#contact');
  assert.equal(app.view('contact').hidden, false);
  assert.equal(app.view('about').hidden, true);
  assert.equal(app.reader.hidden, false);
  assert.equal(app.body.dataset.surface, 'notebook');
  assert.equal(app.body.classList.contains('s-presenting'), true);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
});

test('returning home during a lift cannot open the stale requested page', async () => {
  const gate = deferred(), app = browser({ pickGate: gate }); await flush();
  app.click(app.buttons.get('projects')); await flush();
  assert.ok(app.calls.some(([action, id]) => action === 'pick' && id === 'projects'));
  app.click(app.brand); gate.resolve(); await flush();
  assert.equal(app.location.hash, '#top');
  assert.equal(app.reader.hidden, true);
  assert.equal(app.home.hidden, false);
  assert.equal(app.home.inert, false);
  assert.equal(app.body.classList.contains('s-reading'), false);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
  assert.equal(app.focused, app.brand);
});

test('the latest section request wins when a lift is interrupted', async () => {
  const gate = deferred(), app = browser({ pickGate: gate }); await flush();
  app.click(app.buttons.get('projects')); await flush();
  app.click(app.buttons.get('contact')); gate.resolve(); await flush();
  assert.equal(app.location.hash, '#contact');
  assert.equal(app.view('contact').hidden, false);
  assert.equal(app.view('projects').hidden, true);
  assert.equal(app.reader.hidden, false);
  assert.equal(app.buttons.get('contact').getAttribute('aria-current'), 'page');
  assert.equal(app.buttons.get('projects').hasAttribute('aria-current'), false);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
});

test('links within an open view scroll to the target without another robot lift', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('projects')); await flush();
  const picks = app.calls.filter(([action]) => action === 'pick').length;
  app.click(app.link('#soundscope-lab')); await flush();
  assert.equal(app.location.hash, '#soundscope-lab');
  assert.equal(app.scrolls.at(-1).id, 'soundscope-lab');
  assert.equal(app.calls.filter(([action]) => action === 'pick').length, picks);
  assert.equal(app.view('projects').hidden, false);
});

test('project cards jump to original content without replacing demo nodes or moving the held scene', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('projects')); await flush();
  const demo = app.document.getElementById('soundscope-lab');
  demo.dataset.session = 'existing events';
  const choreography = app.calls.filter(([action]) => action === 'pick' || action === 'putBack');
  const soundScope = app.card('SoundScope');
  assert.ok(soundScope, 'SoundScope must be offered on the section landing page');
  // A click on the visible label must bubble through the same real link handler.
  app.click(soundScope.querySelector('strong')); await flush();
  assert.equal(app.location.hash, '#soundscope');
  assert.equal(app.scrolls.at(-1).id, 'soundscope');
  assert.equal(app.focused, app.document.getElementById('soundscope').querySelector('h3'));
  assert.equal(app.document.getElementById('soundscope-lab'), demo);
  assert.equal(demo.dataset.session, 'existing events');

  // Exercise the rest of the rendered links rather than duplicating the shell's menu table.
  for (const card of app.cards()) {
    const id = card.getAttribute('href').slice(1);
    const target = app.document.getElementById(id);
    assert.ok(target, `The visible card must have an existing destination: ${id}`);
    assert.equal(target.closest('[data-reader-view]'), app.view('projects'));
    app.click(card.querySelector('strong')); await flush();
    assert.equal(app.scrolls.at(-1).id, id);
    assert.equal(app.document.getElementById(id), target, 'Navigation must preserve the existing content node');
    assert.equal(app.view('projects').hidden, false);
  }
  assert.equal(app.scenePage, 'projects');
  assert.deepEqual(app.calls.filter(([action]) => action === 'pick' || action === 'putBack'), choreography);
});

test('research cards reach each topic with matching keyboard focus and no extra pickup', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('research')); await flush();
  const choreography = app.calls.filter(([action]) => action === 'pick' || action === 'putBack');
  for (const [title, destination] of [
    ['Hardware research', 'research-hardware'],
    ['Gaze estimation', 'research-gaze'],
    ['Optical deconvolution', 'optics'],
  ]) {
    const card = app.card(title);
    assert.ok(card, `${title} must have a usable section card`);
    const target = app.document.getElementById(destination);
    app.click(card.querySelector('strong')); await flush();
    assert.equal(app.location.hash, `#${destination}`);
    assert.equal(app.scrolls.at(-1).id, destination);
    assert.equal(app.focused, target.querySelector('h3,h4'));
    assert.equal(app.view('research').hidden, false);
  }
  assert.equal(app.scenePage, 'research');
  assert.deepEqual(app.calls.filter(([action]) => action === 'pick' || action === 'putBack'), choreography);
});

test('Beyond cards reach IEEE and every interest while preserving the open Beyond scene', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('beyond')); await flush();
  const choreography = app.calls.filter(([action]) => action === 'pick' || action === 'putBack');
  for (const [title, destination] of [
    ['Responsibilities', 'responsibilities'],
    ['IEEE × Viam', 'ieee-viam'], ['Urban Arbor', 'urban-arbor'],
    ['Volunteering', 'volunteering'], ['Running', 'interest-running'],
    ['Reading', 'interest-reading'], ['Cooking', 'interest-cooking'], ['Writing', 'interest-writing'],
    ['Pets', 'interest-dogs'], ['Listening to music', 'interest-music'], ['Learning German', 'interest-german'],
  ]) {
    const card = app.card(title);
    assert.ok(card, `Beyond must expose ${title}`);
    const target = app.document.getElementById(destination);
    assert.equal(target.closest('[data-reader-view]'), app.view('beyond'));
    app.click(card.querySelector('strong')); await flush();
    assert.equal(app.location.hash, `#${destination}`);
    assert.equal(app.scrolls.at(-1).id, destination);
    assert.equal(app.focused, target.querySelector('h1,h2,h3,h4'));
  }
  assert.equal(app.scenePage, 'beyond');
  assert.equal(app.view('beyond').hidden, false);
  assert.deepEqual(app.calls.filter(([action]) => action === 'pick' || action === 'putBack'), choreography);
});

test('changing sections replaces old cards and clears them on the direct Contact page', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('projects')); await flush();
  const projectCards = app.cards();
  assert.ok(projectCards.length > 0);
  app.click(app.buttons.get('background')); await flush();
  assert.ok(projectCards.every(card => card.parentElement === null), 'Previous links must be removed, not left in the new landing page');
  assert.equal(app.card('SoundScope'), undefined);
  assert.equal(app.sectionLinks.getAttribute('aria-label'), 'Background sections');
  const njit = app.card('At NJIT');
  assert.ok(njit);
  app.click(njit.querySelector('strong')); await flush();
  assert.equal(app.location.hash, '#background-njit');
  assert.equal(app.scrolls.at(-1).id, 'background-njit');
  assert.equal(app.focused.textContent, 'NJIT');

  const backgroundCards = app.cards();
  app.click(app.buttons.get('contact')); await flush();
  assert.equal(app.cards().length, 0);
  assert.ok(backgroundCards.every(card => card.parentElement === null));
  assert.equal(app.sectionLinks.getAttribute('aria-label'), 'Contact sections');
  assert.equal(app.document.getElementById('s-reader-lead').hidden, true);
  app.click(app.buttons.get('projects')); await flush();
  assert.ok(app.card('SoundScope'), 'Returning must rebuild the correct section links');
  assert.equal(app.card('At NJIT'), undefined);
});

for (const [destination, view, heading] of [
  ['research-gaze', 'research', 'Gaze estimation with a depth camera'],
  ['research-optics', 'research', 'Optical image restoration'],
  ['background-njit', 'background', 'NJIT'],
  ['interest-reading', 'beyond', 'Reading'],
  ['ieee-viam', 'beyond', 'IEEE × Viam'],
]) {
  test(`an initial #${destination} deep link opens its content before graphics are ready`, async () => {
    const app = browser({ hash: `#${destination}`, sceneGate: deferred() });
    await flush();
    assert.equal(app.reader.hidden, false);
    assert.equal(app.view(view).hidden, false);
    assert.equal(app.scrolls.at(-1).id, destination);
    assert.equal(app.focused.textContent, heading);
    assert.equal(app.location.hash, `#${destination}`);
    assert.deepEqual(app.pushed, [], 'An initial deep link must not add a duplicate history entry');
    assert.equal(app.calls.some(([action]) => action === 'pick'), false);
  });
}

test('browser history restores the correct deep link without pushing another entry', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('contact')); await flush();
  const pushes = app.pushed.length;
  app.pop('#optics'); await flush();
  assert.equal(app.view('research').hidden, false);
  assert.equal(app.view('contact').hidden, true);
  assert.equal(app.scrolls.at(-1).id, 'optics');
  assert.equal(app.pushed.length, pushes);
});

for (const [view, kind] of [['about', 'frame'], ['contact', 'notebook']]) {
  test(`${view} keeps its ${kind} reader treatment before and after graphics arrive`, async () => {
    const graphics = deferred(), app = browser({ hash: `#${view}`, sceneGate: graphics });
    await flush();
    assert.equal(app.reader.hidden, false);
    assert.equal(app.view(view).hidden, false);
    assert.equal(app.body.dataset.surface, kind);
    assert.equal(app.document.getElementById('s-reader-lead').hidden, true,
      'Object pages must open directly into their own content');
    const scrollCount = app.scrolls.length;
    graphics.resolve(); await flush();
    assert.equal(app.body.dataset.surface, kind, 'Scene geometry reports must preserve the matching reader treatment');
    assert.equal(app.body.style['--s-cup-x'], undefined, 'A surface with no suction point must not create a cup mask');
    assert.equal(app.scrolls.length, scrollCount);
    assert.equal(app.reader.hidden, false);
  });
}

test('changing reader pages keeps the stage expanded; Home retracts it', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('about')); await flush();
  assert.equal(app.body.dataset.surface, 'frame');
  assert.equal(app.body.classList.contains('s-presenting'), true);
  app.click(app.buttons.get('contact')); await flush();
  assert.equal(app.body.dataset.surface, 'notebook');
  assert.equal(app.calls.filter(([action]) => action === 'retracted').at(-1)[1], true,
    'Returning the previous object must not flash the home layout between pages');
  assert.equal(app.body.classList.contains('s-presenting'), true);
  assert.equal(app.reader.hidden, false);
  app.click(app.brand); await flush();
  assert.equal(app.calls.filter(([action]) => action === 'retracted').at(-1)[1], false);
  assert.equal(app.body.classList.contains('s-presenting'), false);
  assert.equal(app.reader.hidden, true);
  assert.equal(app.home.inert, false);
});

test('presentation reports update the plaque aperture and select surfaces without suction', async () => {
  const app = browser(); await flush();
  app.click(app.buttons.get('projects')); await flush();
  assert.equal(app.document.getElementById('s-reader-lead').hidden, false);
  assert.equal(app.document.getElementById('s-lead-title').textContent, 'Projects');
  app.present({ kind: 'plaque', progress: 0.5, suction: { x: 412, y: 287, radius: 18 } });
  assert.equal(app.body.dataset.surface, 'plaque');
  assert.equal(app.body.style['--s-cup-x'], '412px');
  assert.equal(app.body.style['--s-cup-y'], '287px');
  assert.equal(app.body.style['--s-cup-radius'], '30px');
  app.present({ kind: 'frame', progress: 1, suction: null });
  assert.equal(app.body.dataset.surface, 'frame');
  app.present({ kind: 'notebook', progress: 1, suction: null });
  assert.equal(app.body.dataset.surface, 'notebook');
});

for (const [id, title] of [['soundscope', 'SoundScope'], ['omniring', 'OmniRing']]) {
  test(`the ${title} desk button opens its component inspector without picking a page`, async () => {
    const app = browser(); await flush();
    assert.equal(app.calls.some(([action]) => action === 'loadInspector'), false, 'The panel stays lazy until requested');
    app.click(app.inspectButtons.get(id)); await flush();
    assert.equal(app.panel.hidden, false);
    assert.equal(app.panelTitle.textContent, title);
    assert.equal(app.sceneAssembly, id);
    assert.equal(app.exploded, true);
    assert.equal(app.reader.hidden, true);
    assert.equal(app.home.hidden, false);
    assert.equal(app.home.inert, false, 'Components on the canvas remain selectable');
    assert.equal(app.home.hasAttribute('aria-hidden'), false);
    assert.equal(app.body.classList.contains('s-inspecting'), true);
    assert.equal(app.body.classList.contains('s-presenting'), true);
    assert.equal(app.body.classList.contains('s-reading'), false);
    assert.equal(app.calls.some(([action]) => action === 'pick'), false);
    assert.deepEqual(app.pushed, [], 'Inspecting an object does not navigate away from the desk');
  });
}

test('component selection and assembly controls connect the inspector to the scene in both directions', async () => {
  const app = browser(); await flush();
  app.click(app.inspectButtons.get('soundscope')); await flush();
  app.click(app.partButton('camera')); await flush();
  assert.equal(app.highlighted, 'camera');
  assert.equal(app.selectedPart, 'camera');
  assert.equal(app.partTitle.textContent, 'RGB-D camera');

  app.selectScenePart('board'); await flush();
  assert.equal(app.selectedPart, 'board', 'Picking a mesh updates the corresponding panel selection');
  assert.equal(app.partTitle.textContent, 'Four-microphone array');
  assert.equal(app.highlighted, 'board');

  app.click(app.panelExplode); await flush();
  assert.equal(app.exploded, false);
  assert.equal(app.panel.hidden, false, 'Reassembling is an inspector control, not page navigation');
  app.click(app.panelExplode); await flush();
  assert.equal(app.exploded, true);
  assert.equal(app.reader.hidden, true);
  assert.equal(app.calls.some(([action]) => action === 'pick'), false);
});

for (const id of ['soundscope', 'omniring']) {
  test(`View project finishes returning ${id} before opening its original project anchor`, async () => {
    const returned = deferred(), app = browser({ returnGate: returned }); await flush();
    app.click(app.inspectButtons.get(id)); await flush();
    const article = app.document.getElementById(id);
    app.click(app.panelProject); await flush();
    assert.equal(app.panel.hidden, true);
    assert.equal(app.reader.hidden, true, 'The reader cannot overlap an unfinished assembly return');
    assert.equal(app.sceneAssembly, id);
    assert.equal(app.calls.some(([action]) => action === 'pick'), false);

    returned.resolve(); await flush(); await flush();
    assert.equal(app.sceneAssembly, null);
    assert.equal(app.exploded, false);
    assert.equal(app.scenePage, 'projects');
    assert.equal(app.reader.hidden, false);
    assert.equal(app.view('projects').hidden, false);
    assert.equal(app.body.classList.contains('s-inspecting'), false);
    assert.equal(app.location.hash, `#${id}`);
    assert.equal(app.scrolls.at(-1).id, id);
    assert.equal(app.focused, article.querySelector('h3'));
    assert.equal(app.document.getElementById(id), article, 'The inspector must open the original article and demo nodes');
    assert.deepEqual(app.calls.filter(([action]) => ['inspect', 'putBack', 'pick'].includes(action)).map(([action, target]) => [action, target]), [
      ['inspect', id], ['putBack', undefined], ['pick', 'projects'],
    ]);
  });
}

for (const interruption of ['Escape', 'Home']) {
  test(`${interruption} during a pending inspection returns a usable desk without showing the stale panel`, async () => {
    const opening = deferred(), app = browser({ inspectGate: opening }); await flush();
    app.click(app.inspectButtons.get('soundscope')); await flush();
    assert.equal(app.body.classList.contains('s-presenting'), true);
    assert.equal(app.home.inert, true, 'The fixture suspends the model opening after the stage expands');
    assert.equal(app.panel.hidden, true);
    if (interruption === 'Escape') app.escape(); else app.click(app.brand);
    await flush(); opening.resolve(); await flush(); await flush();
    assert.equal(app.panel.hidden, true);
    assert.equal(app.reader.hidden, true);
    assert.equal(app.sceneAssembly, null);
    assert.equal(app.scenePage, null);
    assert.equal(app.exploded, false);
    assert.equal(app.home.hidden, false);
    assert.equal(app.home.inert, false);
    assert.equal(app.home.hasAttribute('aria-hidden'), false);
    assert.equal(app.body.classList.contains('s-presenting'), false);
    assert.equal(app.body.classList.contains('s-inspecting'), false);
    assert.equal(app.body.classList.contains('s-reading'), false);
    assert.equal(app.body.hasAttribute('aria-busy'), false);
    assert.equal(app.calls.some(([action]) => action === 'pick'), false);

    app.click(app.inspectButtons.get('omniring')); await flush();
    assert.equal(app.panel.hidden, false, 'Interruption must leave the next desk interaction usable');
    assert.equal(app.panelTitle.textContent, 'OmniRing');
    assert.equal(app.sceneAssembly, 'omniring');
    assert.equal(app.home.inert, false);
  });
}

test('section navigation during a pending inspection returns the assembly before showing the requested page', async () => {
  const opening = deferred(), app = browser({ inspectGate: opening }); await flush();
  app.click(app.inspectButtons.get('omniring')); await flush();
  app.click(app.buttons.get('contact')); await flush();
  assert.equal(app.reader.hidden, true);
  opening.resolve(); await flush(); await flush();
  assert.equal(app.panel.hidden, true);
  assert.equal(app.sceneAssembly, null);
  assert.equal(app.exploded, false);
  assert.equal(app.scenePage, 'contact');
  assert.equal(app.view('contact').hidden, false);
  assert.equal(app.reader.hidden, false);
  assert.equal(app.location.hash, '#contact');
  assert.equal(app.body.classList.contains('s-inspecting'), false);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
  app.click(app.brand); await flush();
  assert.equal(app.home.inert, false);
  assert.equal(app.home.hasAttribute('aria-hidden'), false);
  assert.equal(app.reader.hidden, true);
});

test('the latest navigation click wins when two requests wait for the same inspector close', async () => {
  const returned = deferred(), app = browser({ returnGate: returned }); await flush();
  app.click(app.inspectButtons.get('soundscope')); await flush();
  app.click(app.buttons.get('about')); await flush();
  assert.equal(app.panel.hidden, true);
  assert.equal(app.sceneAssembly, 'soundscope', 'The assembly is still returning when the second click arrives');
  app.click(app.buttons.get('contact')); await flush();
  assert.equal(app.reader.hidden, true);

  returned.resolve(); await flush(); await flush();
  assert.equal(app.location.hash, '#contact');
  assert.equal(app.scenePage, 'contact');
  assert.equal(app.view('contact').hidden, false);
  assert.equal(app.view('about').hidden, true);
  assert.equal(app.reader.hidden, false);
  assert.equal(app.panel.hidden, true);
  assert.equal(app.sceneAssembly, null);
  assert.equal(app.body.classList.contains('s-inspecting'), false);
  assert.equal(app.body.hasAttribute('aria-busy'), false);
  assert.equal(app.pushed.at(-1), '#contact');
});

test('Escape while the inspector module is loading prevents a delayed model opening', async () => {
  const loaded = deferred(), app = browser({ inspectorGate: loaded }); await flush();
  app.click(app.inspectButtons.get('soundscope')); await flush();
  assert.ok(app.calls.some(([action]) => action === 'loadInspector'));
  app.escape(); loaded.resolve(); await flush(); await flush();
  assert.equal(app.calls.some(([action]) => action === 'inspect'), false);
  assert.equal(app.panel.hidden, true);
  assert.equal(app.home.hidden, false);
  assert.equal(app.home.inert, false);
  assert.equal(app.body.classList.contains('s-inspecting'), false);
  app.click(app.buttons.get('projects')); await flush();
  assert.equal(app.view('projects').hidden, false, 'Cancelled lazy loading must not trap subsequent navigation');
  assert.equal(app.reader.hidden, false);
});
