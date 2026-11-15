import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGesture, classifyGesture, gesturePath, INITIAL_TV_STATE, CHANNELS } from '../js/omniring-gestures.js';

test('clockwise and counterclockwise circles toggle power', () => {
  const circle = gesturePath('circle');
  assert.equal(classifyGesture(circle), 'circle');
  assert.equal(classifyGesture([...circle].reverse()), 'circle');
  assert.equal(applyGesture(INITIAL_TV_STATE, classifyGesture(circle)).state.power, true);
});

test('single strokes distinguish all four directions and work at mobile pad sizes', () => {
  for (const gesture of ['up', 'down', 'left', 'right']) {
    assert.equal(classifyGesture(gesturePath(gesture)), gesture);
    assert.equal(classifyGesture(gesturePath(gesture, 220, 160)), gesture);
    const slightlyCurved = gesturePath(gesture).map((p, i) => ({ x: p.x + Math.sin(i / 16 * Math.PI) * 5, y: p.y + Math.sin(i / 16 * Math.PI) * 4 }));
    assert.equal(classifyGesture(slightlyCurved), gesture);
  }
});

test('noise, taps, diagonals, partial circles and retraced strokes do not issue commands', () => {
  const circle = gesturePath('circle');
  const right = gesturePath('right');
  for (const points of [[], [{ x: 10, y: 10 }], [{ x: 10, y: 10 }, { x: 15, y: 12 }],
    [{ x: 20, y: 20 }, { x: 120, y: 120 }], circle.slice(0, 45),
    [...right, ...[...right].reverse()],
    Array.from({ length: 40 }, (_, i) => ({ x: 40 + i * 4, y: i % 2 ? 40 : 160 })),
    [...circle, ...circle.slice(1)], [{ x: 0, y: 0 }, { x: NaN, y: 12 }], null]) {
    assert.equal(classifyGesture(points), null);
  }
});

test('a rough closed hand-drawn circle is accepted without requiring exact sampled geometry', () => {
  const points = gesturePath('circle').map((p, i) => ({ x: p.x + Math.sin(i * .8) * 1.7, y: p.y + Math.cos(i * .7) * 1.5 }));
  assert.equal(classifyGesture(points), 'circle');
});

test('off-state rejects volume and channel changes without mutating the original state', () => {
  for (const gesture of ['up', 'down', 'left', 'right']) {
    const result = applyGesture(INITIAL_TV_STATE, gesture);
    assert.equal(result.accepted, false);
    assert.deepEqual(result.state, INITIAL_TV_STATE);
    assert.match(result.message, /Turn on the TV/);
  }
});

test('volume clamps at zero and one hundred', () => {
  const on = { power: true, volume: 95, channel: 0 };
  assert.equal(applyGesture(on, 'up').state.volume, 100);
  assert.equal(applyGesture({ ...on, volume: 100 }, 'up').state.volume, 100);
  assert.equal(applyGesture({ ...on, volume: 5 }, 'down').state.volume, 0);
  assert.equal(applyGesture({ ...on, volume: 0 }, 'down').state.volume, 0);
  assert.deepEqual(on, { power: true, volume: 95, channel: 0 });
});

test('channels wrap in either direction, and power cycling preserves settings', () => {
  let state = { power: true, volume: 65, channel: 0 };
  state = applyGesture(state, 'left').state;
  assert.equal(state.channel, CHANNELS.length - 1);
  state = applyGesture(state, 'right').state;
  assert.equal(state.channel, 0);
  state = applyGesture(state, 'circle').state;
  assert.equal(state.power, false);
  state = applyGesture(state, 'circle').state;
  assert.deepEqual(state, { power: true, volume: 65, channel: 0 });
});

test('unrecognized input preserves the scene and asks for another gesture', () => {
  const before = { power: true, volume: 45, channel: 1 };
  const result = applyGesture(before, null);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.state, before);
  assert.match(result.message, /one clear swipe/);
});
