import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, forward, inverse, pose } from '../js/den/lite6.js';

const position = m => [m[12], m[13], m[14]];
const axis = (m, c) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];

test('the zero pose matches the Lite 6 home position: flange at (87, 0, 154) mm, pointing down', () => {
  const { links, tcp } = forward([0, 0, 0, 0, 0, 0]);
  const flange = position(links[5]);
  [0.087, 0, 0.154].forEach((v, i) => assert.ok(Math.abs(flange[i] - v) < 1e-3, `flange ${flange}`));
  assert.ok(Math.abs(axis(tcp, 2)[2] + 1) < 1e-6);
});

test('inverse kinematics reaches top-down picks and forward-facing holds', () => {
  const targets = [
    pose([0.25, 0.05, 0.02], [0, 0, -1], [1, 0, 0]),       // pick from above, on the desk
    pose([0.2, -0.18, 0.03], [0, 0, -1], [0, 1, 0]),
    pose([0.3, 0, 0.25], [1, 0, 0], [0, 1, 0]),            // hold a plaque up, facing forward
    pose([0.28, 0.1, 0.3], [0.9, 0.3, 0.2], [0, 0, 1]),
  ];
  let seed = [0, 0.3, 1.2, 0, 1.2, 0];
  for (const target of targets) {
    const result = inverse(target, seed);
    assert.ok(result.ok, `error ${result.error.toFixed(4)} m, ${result.angle.toFixed(4)} rad`);
    result.q.forEach((v, i) => assert.ok(v >= LIMITS[i][0] - 1e-9 && v <= LIMITS[i][1] + 1e-9));
    const reached = forward(result.q).tcp;
    const z = axis(reached, 2), wanted = axis(target, 2);
    assert.ok(z[0] * wanted[0] + z[1] * wanted[1] + z[2] * wanted[2] > 0.999);
    seed = result.q;
  }
});

test('targets beyond the 440 mm reach are reported as not reached', () => {
  const result = inverse(pose([0.8, 0, 0.2], [1, 0, 0], [0, 1, 0]), [0, 0.3, 1.2, 0, 1.2, 0]);
  assert.equal(result.ok, false);
});
