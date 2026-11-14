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
// graphics loader are replaced; navigation, interruption, and history stay real.
function browser({ hash = '', pickGate = null, immediatePickGate = null, sceneGate = null } = {}) {
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
  const stage = add(home, 'div', { class: 's-scene-wrap', id: 's-scene-wrap' });
  add(stage, 'canvas', { id: 's-scene' });
  add(home, 'span', { id: 's-status' }); add(home, 'button', { id: 's-motion' });
  const reader = add(body, 'div', { id: 's-reader' }); reader.hidden = true;
  add(reader, 'p', { id: 's-page-label' });
  const content = add(reader, 'div', { id: 's-content-root' });
  const intro = add(content, 'section', { class: 'intro' }); add(intro, 'h1');
  const work = add(content, 'section', { id: 'work' });
  const heading = add(work, 'header', { class: 'section__head' }); add(heading, 'h2');
  for (const id of ['soundscope', 'gaze-arm', 'research', 'zonelogic', 'omniring', 'optics', 'einstein']) {
    const article = add(work, 'article', { id }); add(article, 'h3');
    if (id === 'soundscope') add(article, 'div', { id: 'soundscope-lab' });
  }
  for (const id of ['try', 'path', 'beyond', 'offclock', 'contact']) { const section = add(content, 'section', { id }); add(section, 'h2'); }
  add(reader, 'button', { id: 's-next' });
  const document = {
    body, documentElement: new Element('html'), createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    getElementById: id => body.querySelector(`#${id}`),
    addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
  };
  const location = { hash };
  const scene = {
    async pick(id, options = {}) {
      calls.push(['pick', id, { ...options }]);
      if (pickGate && !options.immediate) { const gate = pickGate; pickGate = null; await gate.promise; }
      if (immediatePickGate && options.immediate) { const gate = immediatePickGate; immediatePickGate = null; await gate.promise; }
      await hooks.onPresent?.(options);
    },
    async putBack(options = {}) { calls.push(['putBack']); await hooks.onRetract?.(options); },
    setActive: value => calls.push(['active', value]), setReaderMode: value => calls.push(['readerMode', value]),
    getPresentationRect: () => stage.getBoundingClientRect(), hover() {},
  };
  const context = {
    document, location, console, Event: class { constructor(type) { this.type = type; } },
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
  };
  context.window = context;
  const executable = shell.replace(/import\('\.\/studio-scene\.js[^']*'\)/, 'loadScene()').replace(/import\('\.\/pick\.js[^']*'\)/g, 'loadDemo()');
  assert.notEqual(executable, shell, 'The graphics import must be stubbed');
  runInNewContext(executable, context, { filename: 'studio-shell.js' });
  const click = element => { for (const fn of events.get('click') || []) fn({ target: element, preventDefault() {} }); };
  return {
    document, body, home, reader, brand, buttons, calls, pushed, scrolls, location, click,
    get focused() { return focused; },
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
