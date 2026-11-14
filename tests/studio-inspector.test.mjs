import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/studio-inspector.js', import.meta.url), 'utf8');

// Exercise the real component with a small DOM surface. No scene, callback, or
// inspector state is reimplemented here; controls run their production handlers.
function browser(callbacks = {}) {
  const document = { activeElement: null, listeners: new Map() };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this.dataset = {};
      this.hidden = false; this.inert = false; this.disabled = false;
      this.className = ''; this._text = '';
    }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
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
  document.body = new Element('body');
  document.addEventListener = (type, callback, capture) => {
    if (!document.listeners.has(type)) document.listeners.set(type, []);
    document.listeners.get(type).push({ callback, capture });
  };
  document.removeEventListener = (type, callback, capture) => {
    document.listeners.set(type, (document.listeners.get(type) || []).filter(entry => entry.callback !== callback || entry.capture !== capture));
  };
  const trigger = new Element('button'), canvas = new Element('canvas'), outside = new Element('a');
  document.body.append(trigger, canvas, outside); trigger.focus();
  const context = { document };
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
