import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalDelays, localize, microphonePositions, searchEvents } from '../js/soundscope-physics.js';

const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('array is the app geometry: four distinct corners of a 66 mm square', () => {
  const microphones = microphonePositions();
  assert.equal(microphones.length, 4);
  assert.equal(new Set(microphones.map(mic => `${mic.x},${mic.y}`)).size, 4);
  microphones.forEach(mic => { near(Math.abs(mic.x), 0.033); near(Math.abs(mic.y), 0.033); });
  microphones[0].x = 20;
  near(microphonePositions()[0].x, -0.033);
});

test('center source reaches all microphones simultaneously at every supplied depth', () => {
  for (const z of [0.7, 1.5, 2.5]) {
    arrivalDelays({ x: 0, y: 0, z }).forEach(delay => near(delay, 0));
    const result = localize({ x: 0, y: 0, z });
    near(result.peak.x, 0);
    near(result.peak.y, 0);
    assert.equal(result.range, z);
  }
});

test('right and left sources reach the nearer side first and mirror their estimates', () => {
  for (const x of [-0.6, 0.6]) {
    const source = { x, y: 0, z: 1.4 };
    const delays = arrivalDelays(source);
    assert.ok(x > 0 ? delays[1] < delays[0] : delays[0] < delays[1]);
    const { peak } = localize(source, { width: 41, height: 29 });
    near(peak.x, x);
    near(peak.y, 0);
  }
});

test('above and below sources reach the nearer row first; grid top is positive y', () => {
  for (const y of [-0.35, 0.35]) {
    const source = { x: 0, y, z: 1.8 };
    const delays = arrivalDelays(source);
    assert.ok(y > 0 ? delays[0] < delays[3] : delays[3] < delays[0]);
    const { peak } = localize(source, { width: 41, height: 29 });
    near(peak.y, y);
    near(peak.x, 0);
    assert.ok(y > 0 ? peak.row < 14 : peak.row > 14);
  }
});

test('zero-noise diagonal case has no timing residual and a finite normalized map', () => {
  const source = { x: 0.6, y: -0.35, z: 1.2 };
  const result = localize(source, { noise: 0, width: 41, height: 29 });
  near(result.peak.x, source.x);
  near(result.peak.y, source.y);
  near(result.peak.residualSeconds, 0);
  assert.deepEqual(result.delays, result.idealDelays);
  assert.equal(result.grid.length, 41 * 29);
  assert.equal(Math.max(...result.grid), 1);
  assert.ok(result.grid.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('seeded perturbations are reproducible, change timing differences, and broaden support', () => {
  const source = { x: 0.2, y: 0.1, z: 1.5 };
  const clean = localize(source, { noise: 0, seed: 42 });
  const mild = localize(source, { noise: 0.2, seed: 42 });
  const noisy = localize(source, { noise: 0.8, seed: 42 });
  const repeat = localize(source, { noise: 0.8, seed: 42 });
  assert.deepEqual(noisy, repeat);
  const differenceError = result => Math.abs((result.delays[0] - result.delays[1]) -
    (result.idealDelays[0] - result.idealDelays[1]));
  assert.ok(differenceError(mild) > 0);
  near(differenceError(noisy), differenceError(mild) * 4);
  assert.ok(noisy.ambiguity > mild.ambiguity);
  assert.ok(mild.ambiguity > clean.ambiguity);
  assert.ok(Math.hypot(noisy.peak.x - source.x, noisy.peak.y - source.y) >
    Math.hypot(clean.peak.x - source.x, clean.peak.y - source.y));
});

test('scripted event search recognizes word variants and returns chronological matches', () => {
  const records = [
    { id: 3, time: 9, label: 'Phone ringing', caption: 'A phone rang beside the camera.' },
    { id: 2, time: 5, label: 'Speech', caption: 'Turn left', keywords: ['speaker'] },
    { id: 1, time: 2, label: 'Phone ring' },
    { id: 4, time: 10, label: 'Clapping' },
  ];
  assert.deepEqual(searchEvents(records, 'rang').map(record => record.id), [1, 3]);
  assert.deepEqual(searchEvents(records, 'phone ringing').map(record => record.id), [1, 3]);
  assert.deepEqual(searchEvents(records, 'clap').map(record => record.id), [4]);
  assert.deepEqual(searchEvents(records, 'talking').map(record => record.id), [2]);
  assert.deepEqual(searchEvents(records, 'turn left').map(record => record.id), [2]);
  assert.deepEqual(searchEvents(records, '').map(record => record.id), [1, 2, 3, 4]);
  assert.equal(records[0].id, 3);
});

test('natural questions match scripted phone, clap and chime labels without matching unknowns', () => {
  const records = [
    { id: 1, time: 3, label: 'Phone ringing' },
    { id: 2, time: 4, label: 'Clapping' },
    { id: 3, time: 5, label: 'Chime' },
  ];
  assert.deepEqual(searchEvents(records, 'Did my phone ring?').map(record => record.id), [1]);
  assert.deepEqual(searchEvents(records, 'When did I clap?').map(record => record.id), [2]);
  assert.deepEqual(searchEvents(records, 'was there a chime?').map(record => record.id), [3]);
  assert.deepEqual(searchEvents(records, 'Was there an elephant?'), []);
  assert.deepEqual(searchEvents(records, 'Was there?'), []);
  assert.deepEqual(searchEvents(records, '???'), []);
  assert.equal(searchEvents(records, '  ').length, 3);
});

test('scripted multiple-source and left/right descriptions retain distinct searchable cues', () => {
  const records = [
    { id: 1, time: 1, label: 'Phone ringing', keywords: ['left'] },
    { id: 2, time: 2, label: 'Phone ringing', keywords: ['right'] },
    { id: 3, time: 3, label: 'Phone and speech', caption: 'Two scripted sources', keywords: ['multiple', 'sources'] },
  ];
  assert.deepEqual(searchEvents(records, 'phone on the left').map(record => record.id), [1]);
  assert.deepEqual(searchEvents(records, 'phone on the right').map(record => record.id), [2]);
  assert.deepEqual(searchEvents(records, 'phone and speech').map(record => record.id), [3]);
  assert.deepEqual(searchEvents(records, 'multiple sources').map(record => record.id), [3]);
  assert.deepEqual(searchEvents(records, 'clap on the right'), []);
});

test('invalid geometry or synthetic-noise settings fail explicitly', () => {
  assert.throws(() => arrivalDelays({ x: 0, y: 0, z: 0 }), RangeError);
  assert.throws(() => arrivalDelays({ x: NaN, y: 0, z: 1 }), TypeError);
  assert.throws(() => localize({ x: 0, y: 0, z: 1 }, { noise: 1.5 }), RangeError);
  assert.throws(() => localize({ x: 0, y: 0, z: 1 }, { width: 2 }), RangeError);
});
