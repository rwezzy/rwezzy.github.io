import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/studio-performance.js', import.meta.url), 'utf8');
function setup({ search = '', reduced = false, saveData = false } = {}) {
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.listeners = {}; this.classList = { add() {}, remove() {} }; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    closest() { return null; }
    remove() { this.removed = true; }
  }
  const document = { documentElement: { dataset: {} }, createElement: () => new Element(), querySelector: () => null, querySelectorAll: () => [] };
  const window = {};
  runInNewContext(source, { window, document, location: { search, hash: '' }, navigator: { connection: { saveData } }, matchMedia: () => ({ matches: reduced }), URLSearchParams });
  return { api: window.portfolioGraphics, document, element: new Element() };
}
test('lightweight defaults respect reduced motion/data saving while explicit full mode wins', () => {
  assert.equal(setup().api.lightweight, false);
  assert.equal(setup({ search: '?mode=lite' }).api.lightweight, true);
  assert.equal(setup({ reduced: true }).api.lightweight, true);
  assert.equal(setup({ saveData: true }).api.lightweight, true);
  assert.equal(setup({ search: '?mode=full', reduced: true, saveData: true }).api.lightweight, false);
});
test('graphics do not start until requested; completion removes the gate', async () => {
  const { api, element } = setup(); let started = 0;
  const pending = api.defer(element, async () => { started++; return 'scene'; });
  assert.equal(started, 0);
  const gate = element.children[0], button = gate.children[1];
  await button.listeners.click();
  assert.equal(await pending, 'scene');
  assert.equal(started, 1);
  assert.equal(gate.removed, true);
  assert.equal(element.attributes['aria-busy'], undefined);
});
test('failed graphics preserve a readable explanation instead of a stuck loading state', async () => {
  const { api, element } = setup();
  const failure = new Error('WebGL unavailable');
  const pending = api.defer(element, async () => { throw failure; });
  const rejected = assert.rejects(pending, failure);
  const gate = element.children[0];
  await gate.children[1].listeners.click(); await rejected;
  assert.equal(gate.removed, undefined);
  assert.match(gate.children[2].textContent, /recorded evidence remain available/);
  assert.equal(element.attributes['aria-busy'], undefined);
});
