import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, directionPhrase } from '../js/soundscope-describe.js';

test('direction phrases cover centre, sides and height', () => {
  assert.equal(directionPhrase(2, 0), 'straight ahead');
  assert.equal(directionPhrase(-12, 0), 'ahead, slightly left');
  assert.equal(directionPhrase(30, 0), 'ahead and to the right');
  assert.equal(directionPhrase(-60, 25), 'to the left, up high');
});

test('a visible object that can make the sound is named with what it rests on', () => {
  const { caption, hidden, keywords } = describe({
    label: 'Kettle whistling', azimuth: -40, elevation: -8, depth: 2.64,
    surface: { name: 'kettle', kind: 'object', canMake: true, support: 'side table' },
  });
  assert.equal(caption, 'Kettle whistling: the kettle on the side table, 2.6 m away, ahead and to the left.');
  assert.equal(hidden, false);
  assert.ok(keywords.includes('side table') && keywords.includes('left'));
});

test('furniture that cannot make the sound implies a hidden source behind it', () => {
  const { caption, hidden, keywords } = describe({
    label: 'Alarm ringing', azimuth: -8, elevation: -10, depth: 2.3,
    surface: { name: 'sofa', kind: 'furniture', canMake: false },
    neighbour: { name: 'television', side: 'left' },
  });
  assert.match(caption, /probably behind or under the sofa/);
  assert.match(caption, /left of the television/);
  assert.equal(hidden, true);
  assert.ok(keywords.includes('behind') && keywords.includes('sofa'));
});

test('walls, echoes and empty directions are reported with caution', () => {
  assert.match(describe({ label: 'Music playing', azimuth: 50, elevation: 0, depth: 3, surface: { name: 'back wall', kind: 'wall', canMake: false } }).caption, /reflection/);
  assert.match(describe({ label: 'Music playing', azimuth: 5, elevation: 0, depth: 1, surface: { name: 'boombox', kind: 'object', canMake: true }, rival: 'shelf' }).caption, /echo also points toward the shelf/);
  assert.match(describe({ label: 'Alarm ringing', azimuth: 5, elevation: 0, depth: null, surface: null }).caption, /Nothing visible/);
});
