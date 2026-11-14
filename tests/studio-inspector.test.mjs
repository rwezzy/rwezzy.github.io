import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/studio-inspector.js', import.meta.url), 'utf8');

// Exercise the real component with a small DOM surface. No scene, callback, or
// inspector state is reimplemented here; controls run their production handlers.
function browser(callbacks = {}, geometry = {}) {
  const document = { activeElement: null, listeners: new Map() };
  const width = geometry.width || 1440, height = geometry.height || 900;
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this.dataset = {};
      this.hidden = false; this.inert = false; this.disabled = false;
      this.className = ''; this._text = ''; this.style = {};
    }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = String(value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) {
      for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); }
    }
    replaceChildren(...nodes) { for (const node of [...this.children]) node.remove(); this._text = ''; this.append(...nodes); }
    remove() {
      if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    getBoundingClientRect() {
      if (this.className === 'studio-inspector') return geometry.panel || rect(1056, 108, 340, 620);
      if (this.className === 's-header') return rect(0, 0, width, geometry.headerHeight || 88);
      if (this.className === 'si-annotation-card') {
        return rect((parseFloat(this.parentElement.style.left) || 0) + (parseFloat(this.style.left) || 0),
          (parseFloat(this.parentElement.style.top) || 0) + (parseFloat(this.style.top) || 0),
          parseFloat(this.style.width) || 236, geometry.annotationHeight || 100);
      }
      return rect(0, 0, 0, 0);
    }
    closest(selector) {
      assert.equal(selector, '[hidden], [inert]');
      return this.hidden || this.inert ? this : this.parentElement?.closest(selector) || null;
    }
    focus() { if (!this.closest('[hidden], [inert]') && !this.disabled && this.isConnected) document.activeElement = this; }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    click() {
      if (this.disabled) return;
      this.focus();
      for (const callback of this.listeners.get('click') || []) callback({ target: this });
    }
  }
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.body = new Element('body');
  const header = new Element('header'); header.className = 's-header'; document.body.append(header);
  document.querySelector = selector => selector === '.s-header' ? header : null;
  document.addEventListener = (type, callback, capture) => {
    if (!document.listeners.has(type)) document.listeners.set(type, []);
    document.listeners.get(type).push({ callback, capture });
  };
  document.removeEventListener = (type, callback, capture) => {
    document.listeners.set(type, (document.listeners.get(type) || []).filter(entry => entry.callback !== callback || entry.capture !== capture));
  };
  const trigger = new Element('button'), canvas = new Element('canvas'), outside = new Element('a');
  document.body.append(trigger, canvas, outside); trigger.focus();
  const context = { document, innerWidth: width, innerHeight: height };
  runInNewContext(source.replace('export function createStudioInspector', 'function createStudioInspector') + '\nglobalThis.createInspector = createStudioInspector;', context);
  const inspector = context.createInspector(callbacks);
  const find = predicate => {
    const visit = node => predicate(node) ? node : node.children.map(visit).find(Boolean);
    return visit(document.body);
  };
  const byClass = name => find(node => node.className.split(' ').includes(name));
  const part = id => find(node => node.dataset.partId === id);
  const key = (name, extra = {}) => {
    const event = { key: name, defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...extra };
    for (const entry of document.listeners.get('keydown') || []) entry.callback(event);
    return event;
  };
  return { document, trigger, canvas, outside, inspector, byClass, part, key };
}

const soundscope = {
  id: 'soundscope', title: 'SoundScope', description: 'Explore the microphone assembly.', exploded: false,
  parts: [
    { id: 'carrier', title: 'Carrier', description: 'Holds the boards in position.' },
    { id: 'array', title: 'Microphone array', description: 'Four microphones on one board.' },
  ],
};

test('inspector opens as a modeless region without disabling or enclosing the canvas', () => {
  const app = browser();
  const panel = app.byClass('studio-inspector');
  assert.equal(panel.hidden, true);
  app.inspector.show(soundscope);
  assert.equal(panel.hidden, false);
  assert.equal(panel.getAttribute('role'), 'region');
  assert.equal(panel.getAttribute('aria-modal'), null);
  assert.equal(panel.getAttribute('aria-labelledby'), app.byClass('si-title').id);
  assert.equal(app.document.activeElement, app.byClass('si-title'));
  assert.equal(panel.contains(app.canvas), false);
  assert.equal(app.canvas.hidden, false);
  assert.equal(app.canvas.inert, false);
  assert.equal(app.document.body.inert, false);
  assert.equal(app.key('Tab').defaultPrevented, false, 'Tab is not trapped');
});

test('part controls show the supplied facts; scene selection synchronizes without callback loops', () => {
  const calls = [];
  const app = browser({ onSelectPart: (...args) => calls.push(args) });
  app.inspector.show(soundscope);
  app.part('array').click();
  assert.deepEqual(calls, [['array', 'soundscope']]);
  assert.equal(app.part('array').getAttribute('aria-pressed'), 'true');
  assert.equal(app.byClass('si-detail-title').textContent, 'Microphone array');
  assert.equal(app.byClass('si-detail-description').textContent, 'Four microphones on one board.');
  app.inspector.selectPart('carrier');
  assert.equal(app.part('array').getAttribute('aria-pressed'), 'false');
  assert.equal(app.part('carrier').getAttribute('aria-pressed'), 'true');
  assert.equal(calls.length, 1);
  app.inspector.selectPart('missing-part');
  assert.equal(app.part('carrier').getAttribute('aria-pressed'), 'true');
  app.inspector.selectPart(null);
  assert.equal(app.byClass('si-detail').hidden, true);
  assert.equal(app.part('carrier').getAttribute('aria-pressed'), 'false');
});

test('explode controls report the next state while scene updates remain silent', () => {
  const calls = [];
  const app = browser({ onToggleExploded: (...args) => calls.push(args) });
  app.inspector.show(soundscope);
  const toggle = app.byClass('si-toggle');
  toggle.click();
  assert.deepEqual(calls, [[true, 'soundscope']]);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.textContent, 'Assemble model');
  app.inspector.setExploded(false);
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.textContent, 'Explode parts');
  assert.equal(calls.length, 1);
  app.inspector.show({ id: 'empty', title: 'No components', parts: [] });
  assert.equal(toggle.disabled, true);
  toggle.click();
  assert.equal(calls.length, 1);
});

test('switching objects clears stale components and renders descriptor text literally', () => {
  const app = browser();
  app.inspector.show(soundscope);
  app.inspector.selectPart('array');
  app.inspector.show({ id: 'omniring', title: '<b>OmniRing</b>', description: '<img src=x>', exploded: true,
    parts: [{ id: 'ring', title: '<em>Ring</em>', description: '<script>example</script>' }] });
  assert.equal(app.part('array'), undefined);
  assert.equal(app.part('carrier'), undefined);
  assert.equal(app.byClass('si-title').textContent, '<b>OmniRing</b>');
  assert.equal(app.byClass('si-title').children.length, 0);
  assert.equal(app.byClass('si-description').children.length, 0);
  assert.equal(app.byClass('si-detail').hidden, true);
  assert.equal(app.part('ring').getAttribute('aria-pressed'), 'false');
  app.part('ring').click();
  assert.equal(app.byClass('si-detail-description').textContent, '<script>example</script>');
  assert.equal(app.byClass('si-detail-description').children.length, 0);
  app.inspector.hide();
  assert.equal(app.document.activeElement, app.trigger, 'Switching preserves the original focus return target');
});

test('Escape closes once, consumes the shell shortcut, and restores focus', () => {
  const closed = [];
  const app = browser({ onClose: id => closed.push(id) });
  app.inspector.show(soundscope);
  assert.equal(app.key('Escape', { isComposing: true }).defaultPrevented, false);
  assert.equal(app.byClass('studio-inspector').hidden, false);
  const event = app.key('Escape');
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.deepEqual(closed, ['soundscope']);
  assert.equal(app.byClass('studio-inspector').hidden, true);
  assert.equal(app.document.activeElement, app.trigger);
  assert.equal(app.key('Escape').defaultPrevented, false);
  assert.equal(closed.length, 1);
  app.inspector.show(soundscope);
  app.byClass('si-close').click();
  assert.deepEqual(closed, ['soundscope', 'soundscope']);
});

test('hiding does not steal outside focus; disposal removes the panel and global shortcut', () => {
  let closed = 0;
  const app = browser({ onClose: () => closed++ });
  app.inspector.show(soundscope);
  app.outside.focus();
  app.inspector.hide();
  assert.equal(app.document.activeElement, app.outside);
  assert.equal(closed, 0, 'Programmatic hiding does not emit a user close');
  app.inspector.show(soundscope);
  app.outside.remove();
  app.inspector.dispose();
  assert.equal(app.byClass('studio-inspector'), undefined);
  assert.equal(app.document.listeners.get('keydown').length, 0);
  assert.equal(app.key('Escape').defaultPrevented, false);
  app.inspector.dispose();
  app.inspector.show(soundscope);
  assert.equal(app.byClass('studio-inspector'), undefined);
});

test('View project hides the inspector before handing the selected object to navigation', () => {
  const opened = [];
  let app;
  app = browser({ onOpenProject: id => opened.push([id, app.byClass('studio-inspector').hidden]) });
  app.inspector.show(soundscope);
  app.byClass('si-project').click();
  assert.deepEqual(opened, [['soundscope', true]]);
  assert.equal(app.document.activeElement, app.trigger);
});

test('selected component annotation uses the real projected point and accessible facts stay in the panel', () => {
  const calls = [];
  const app = browser({ onSelectPart: (...args) => calls.push(args) });
  app.inspector.show({ ...soundscope, exploded: true });
  assert.equal(app.byClass('studio-annotation').hidden, true, 'No placeholder coordinates appear before a projection arrives');
  app.inspector.updateAnchors({
    viewport: { left: 40, top: 120, width: 1000, height: 600 },
    parts: [{ id: 'carrier', x: 420, y: 300, visible: true }], selectedId: 'carrier',
  });
  const annotation = app.byClass('studio-annotation');
  assert.equal(annotation.hidden, false);
  assert.equal(annotation.getAttribute('aria-hidden'), 'true', 'Visual duplicate does not announce facts twice');
  assert.equal(app.byClass('si-annotation-title').textContent, 'Carrier');
  assert.equal(app.byClass('si-annotation-description').textContent, 'Holds the boards in position.');
  assert.equal(app.byClass('si-detail-description').textContent, 'Holds the boards in position.');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '380');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cy'), '180');
  assert.match(app.byClass('si-leader-line').getAttribute('d'), /^M 380\.0 180\.0 L /);
  assert.equal(calls.length, 0, 'Projection synchronization does not select the scene again');
  const card = app.byClass('si-annotation-card').getBoundingClientRect();
  assert.ok(card.left >= 40 && card.right <= 1040);
  assert.ok(card.top >= 120 && card.bottom <= 720);
  assert.ok(card.right < app.byClass('studio-inspector').getBoundingClientRect().left);
});

test('scene updates move the source dot, while part selection chooses that part’s own annotation', () => {
  const app = browser();
  app.inspector.show({ ...soundscope, exploded: true });
  const projection = { viewport: { left: 0, top: 0, width: 1440, height: 900 }, parts: [
    { id: 'carrier', x: 420, y: 300, visible: true }, { id: 'array', x: 510, y: 240, visible: true },
  ] };
  app.inspector.updateAnchors(projection);
  app.part('carrier').click();
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '420');
  app.inspector.updateAnchors({ ...projection, parts: [{ id: 'carrier', x: 450, y: 320, visible: true }, projection.parts[1]] });
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '450');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cy'), '320');
  app.part('array').click();
  assert.equal(app.byClass('si-annotation-title').textContent, 'Microphone array');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '510');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cy'), '240');
});

test('mobile annotation stays above the bottom controls and below the header', () => {
  const app = browser({}, { width: 390, height: 844, annotationHeight: 88,
    panel: { left: 12, top: 460, right: 378, bottom: 832, width: 366, height: 372 } });
  app.inspector.show({ ...soundscope, exploded: true });
  app.inspector.updateAnchors({ viewport: { left: 0, top: 0, width: 390, height: 844 },
    parts: [{ id: 'array', x: 190, y: 280, visible: true }], selectedId: 'array' });
  assert.equal(app.byClass('studio-annotation').hidden, false);
  const card = app.byClass('si-annotation-card').getBoundingClientRect();
  assert.ok(card.left >= 0 && card.right <= 390, 'Card fits the visible canvas width');
  assert.ok(card.top > 88 && card.bottom < 460, 'Card avoids header and bottom inspector');
  assert.ok(!(card.left <= 190 && card.right >= 190 && card.top <= 280 && card.bottom >= 280), 'Card leaves its source component visible');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '190');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cy'), '280');
});

test('annotation avoids complete projected component bounds, including neighbouring parts', () => {
  const app = browser();
  app.inspector.show({ ...soundscope, exploded: true });
  const board = { left: 240, top: 102, right: 720, bottom: 500 };
  const neighbour = { left: 740, top: 200, right: 1020, bottom: 600 };
  app.inspector.updateAnchors({ viewport: { left: 0, top: 0, width: 1440, height: 900 }, selectedId: 'array', parts: [
    { id: 'array', x: 480, y: 301, visible: true, rect: board },
    { id: 'carrier', x: 880, y: 400, visible: true, rect: neighbour },
  ] });
  assert.equal(app.byClass('studio-annotation').hidden, false);
  const card = app.byClass('si-annotation-card').getBoundingClientRect();
  for (const obstacle of [board, neighbour]) {
    assert.ok(card.right <= obstacle.left || card.left >= obstacle.right || card.bottom <= obstacle.top || card.top >= obstacle.bottom,
      'Card does not cover the selected geometry or another projected component');
  }
  assert.ok(card.top > board.bottom, 'The available space is below the large board, rather than over its upper edge');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cx'), '480');
  assert.equal(app.byClass('si-leader-dot').getAttribute('cy'), '301');
});

test('mobile component rectangles guide the card into available space above the model', () => {
  const app = browser({}, { width: 390, height: 844, annotationHeight: 88,
    panel: { left: 12, top: 460, right: 378, bottom: 832, width: 366, height: 372 } });
  app.inspector.show({ ...soundscope, exploded: true });
  const selected = { left: 140, top: 200, right: 270, bottom: 370 };
  const neighbour = { left: 14, top: 100, right: 135, bottom: 220 };
  app.inspector.updateAnchors({ viewport: { left: 0, top: 0, width: 390, height: 844 }, selectedId: 'array', parts: [
    { id: 'array', x: 205, y: 285, visible: true, rect: selected },
    { id: 'carrier', x: 74, y: 160, visible: true, rect: neighbour },
  ] });
  assert.equal(app.byClass('studio-annotation').hidden, false);
  const card = app.byClass('si-annotation-card').getBoundingClientRect();
  for (const obstacle of [selected, neighbour]) {
    assert.ok(card.right <= obstacle.left || card.left >= obstacle.right || card.bottom <= obstacle.top || card.top >= obstacle.bottom);
  }
  assert.ok(card.top > 88 && card.bottom < 200);
  assert.ok(card.left >= 0 && card.right <= 390);
});

test('pre-open projections are cached, and assembled, missing, covered, or offscreen parts never get false anchors', () => {
  const app = browser();
  const payload = { viewport: { left: 0, top: 0, width: 1440, height: 900 },
    parts: [{ id: 'carrier', x: 420, y: 300, visible: true }] };
  app.inspector.updateAnchors(payload);
  assert.equal(app.byClass('studio-annotation').hidden, true);
  app.inspector.show({ ...soundscope, exploded: true });
  app.inspector.selectPart('carrier');
  assert.equal(app.byClass('studio-annotation').hidden, false, 'First annotation uses the projection received before show');
  app.inspector.setExploded(false);
  assert.equal(app.byClass('studio-annotation').hidden, true);
  app.inspector.setExploded(true);
  assert.equal(app.byClass('studio-annotation').hidden, false);
  for (const point of [
    { id: 'carrier', x: 420, y: 300, visible: false },
    { id: 'carrier', x: -10, y: 300, visible: true },
    { id: 'carrier', x: 1100, y: 300, visible: true },
    { id: 'carrier', x: 420, y: 40, visible: true },
    { id: 'carrier', x: NaN, y: 300, visible: true },
  ]) {
    app.inspector.updateAnchors({ ...payload, parts: [point] });
    assert.equal(app.byClass('studio-annotation').hidden, true);
  }
  app.inspector.updateAnchors(null);
  assert.equal(app.byClass('studio-annotation').hidden, true);
  app.inspector.updateAnchors(payload);
  assert.equal(app.byClass('studio-annotation').hidden, false);
  app.inspector.hide();
  assert.equal(app.byClass('studio-annotation').hidden, true);
  app.inspector.updateAnchors(payload);
  assert.equal(app.byClass('studio-annotation').hidden, true, 'Later render callbacks cannot resurrect a closed annotation');
  app.inspector.dispose();
  assert.equal(app.byClass('studio-annotation'), undefined);
});
