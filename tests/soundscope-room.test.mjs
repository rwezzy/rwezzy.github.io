import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, anglesTo, directionFor, rigFrame, searchEvents, simulate } from '../js/soundscope-room.js';

const room = { min: { x: -2.8, y: 0, z: -2.4 }, max: { x: 2.8, y: 2.7, z: 2.4 } };
const rig = { position: { x: 0.3, y: 1.0, z: 2.0 }, yaw: 0 };
const spots = [{ x: -1.5, y: 0.5, z: -1 }, { x: 0, y: 1.1, z: -2 }, { x: 1.8, y: 0.2, z: 0 }, { x: -2.2, y: 1.6, z: 0.8 }, { x: 0.6, y: 0.45, z: -0.6 }];

test('microphones form an upright square facing the scene', () => {
  const frame = rigFrame(rig, 0.066);
  assert.deepEqual(frame.forward, { x: -0, y: 0, z: -1 });
  const ys = frame.microphones.map(mic => mic.y.toFixed(3)), zs = new Set(frame.microphones.map(mic => mic.z.toFixed(6)));
  assert.equal(new Set(ys).size, 2);
  assert.equal(zs.size, 1);
});

test('directions and angles are inverses', () => {
  const frame = rigFrame(rig);
  for (const [az, el] of [[0, 0], [30, -10], [-55, 25]]) {
    const d = directionFor(frame, az, el);
    const back = anglesTo(frame, { x: frame.center.x + d.x, y: frame.center.y + d.y, z: frame.center.z + d.z });
    assert.ok(Math.abs(back.azimuth - az) < 1e-9 && Math.abs(back.elevation - el) < 1e-9);
  }
});

test('without echo every sound is located within 4 degrees (the grid is 1 degree)', () => {
  for (const sound of Object.keys(SOUNDS)) {
    for (const source of spots) {
      const result = simulate({ source, rig, room, sound, echo: 0 });
      assert.ok(result.errorDegrees < 4, `${sound} at ${JSON.stringify(source)}: ${result.errorDegrees.toFixed(2)}°`);
    }
  }
});

test('the map is normalized, one cell per degree, and peaks at the estimate', () => {
  const result = simulate({ source: spots[0], rig, room, sound: 'music', echo: 0.3 });
  assert.equal(result.map.length, 141 * 91);
  assert.ok(result.map.every(value => value >= 0 && value <= 1));
  const best = result.map.indexOf(1);
  assert.equal(-70 + best % 141, result.estimate.azimuth);
  assert.equal(45 - Math.floor(best / 141), result.estimate.elevation);
});

test('closer microphones spread the estimate over more directions', () => {
  const narrow = simulate({ source: spots[1], rig, room, sound: 'alarm', spacing: 0.03 });
  const wide = simulate({ source: spots[1], rig, room, sound: 'alarm', spacing: 0.12 });
  assert.ok(narrow.spread > wide.spread * 2, `${narrow.spread} vs ${wide.spread}`);
});

test('simulations are deterministic for a seed', () => {
  const input = { source: spots[2], rig, room, sound: 'kettle', echo: 0.5, seed: 4 };
  assert.deepEqual(simulate(input).map, simulate(input).map);
});

test('search understands sounds, places and relations', () => {
  const records = [
    { id: 1, time: 4, label: 'Alarm ringing', type: 'alarm', caption: 'Behind the sofa, left of the television.' },
    { id: 2, time: 2, label: 'Kettle whistling', type: 'kettle', caption: 'On the side table.' },
    { id: 3, time: 9, label: 'Music playing', type: 'music', caption: 'On the floor next to the shelf.' },
  ];
  assert.deepEqual(searchEvents(records, 'When did the alarm go off?').map(r => r.id), [1]);
  assert.deepEqual(searchEvents(records, 'what rang behind the couch').map(r => r.id), [1]);
  assert.deepEqual(searchEvents(records, 'music near the bookshelf').map(r => r.id), [3]);
  assert.deepEqual(searchEvents(records, 'was there an elephant?'), []);
  assert.deepEqual(searchEvents(records, '').map(r => r.id), [2, 1, 3]);
});

test('invalid inputs fail explicitly', () => {
  assert.throws(() => simulate({ source: { x: 9, y: 1, z: 0 }, rig, room }), RangeError);
  assert.throws(() => simulate({ source: { x: 0.3, y: 1.1, z: 1.9 }, rig, room }), RangeError);
  assert.throws(() => simulate({ source: spots[0], rig, room, spacing: 0.5 }), RangeError);
  assert.throws(() => simulate({ source: spots[0], rig, room, sound: 'trumpet' }), RangeError);
  assert.throws(() => simulate({ source: { x: NaN, y: 1, z: 0 }, rig, room }), TypeError);
});
