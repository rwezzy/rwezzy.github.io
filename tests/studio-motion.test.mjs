import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { prepareJointPath, sampleJointPath } from '../js/studio-motion.js';
import { LIMITS, forward, inverse, multiply, pose, rotationError } from '../js/den/lite6.js';

// Use the scene's actual poses and attachment transform without importing WebGL.
// This intentionally protects the physical contact contract as well as the planner.
const sceneSource = readFileSync(new URL('../js/studio-scene.js', import.meta.url), 'utf8');
const names = ['PLAQUE', 'INITIAL_JOINTS', 'REST', 'DISPLAY', 'ATTACH'];
const declarations = names.map(name => {
  const match = sceneSource.match(new RegExp(`const ${name} = [\\s\\S]*?;`));
  assert.ok(match, `The scene must declare its ${name} motion configuration`);
  return match[0];
}).join('\n');
const config = runInNewContext(`${declarations}\n({${names.join(',')}})`, { pose, Float64Array });
const above = (matrix, height) => { const result = matrix.slice(); result[14] += height; return result; };
const restResult = inverse(config.REST, Array.from(config.INITIAL_JOINTS), { iterations: 220 });
assert.ok(restResult.ok, 'The production resting pose must be reachable');
const restJoints = restResult.q;
const facing = Math.atan2(0.57, 1.04), fs = Math.sin(facing), fc = Math.cos(facing);
const fixtures = [-45, -15, 15, 45].map((degrees, index) => {
  const angle = degrees * Math.PI / 180;
  const rest = new Float64Array([
    -fs, fc, 0, 0, -fc, -fs, 0, 0, 0, 0, 1, 0,
    config.PLAQUE.radius * Math.cos(angle), config.PLAQUE.radius * Math.sin(angle),
    0.006 + config.PLAQUE.thickness / 2, 1,
  ]);
  const contact = multiply(rest, config.ATTACH);
  const approach = prepareJointPath([above(contact, 0.10), contact], restJoints);
  const raise = prepareJointPath([above(contact, 0.08), above(contact, 0.15), config.DISPLAY], approach.end);
  return { name: ['Projects', 'Research', 'Background', 'Beyond'][index], rest, contact, approach, raise };
});
const close = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};
const checkPose = (joints, target, label) => {
  const actual = forward(joints).tcp;
  assert.ok(Math.hypot(...[12, 13, 14].map(i => actual[i] - target[i])) < 0.002, `${label}: tool position is within 2 mm`);
  assert.ok(Math.hypot(...rotationError(actual, target)) < 0.02, `${label}: tool orientation is within 0.02 radians`);
};

test('every page path starts exactly at rest, reaches contact, and joins its lift without a jump', () => {
  for (const { name, contact, approach, raise } of fixtures) {
    assert.deepEqual(sampleJointPath(approach, 0), restJoints, `${name}: exact starting joints`);
    checkPose(sampleJointPath(approach, 1), contact, `${name} contact`);
    assert.deepEqual(sampleJointPath(raise, 0), sampleJointPath(approach, 1), `${name}: exact approach/lift seam`);
    checkPose(sampleJointPath(raise, 1), config.DISPLAY, `${name} presentation`);
  }
});

test('dense playback stays inside joint limits, above the desk, and avoids branch flips or extra turns', () => {
  for (const { name, approach, raise } of fixtures) for (const [phase, path] of [['approach', approach], ['raise', raise]]) {
    const label = `${name} ${phase}`, travel = Array(6).fill(0);
    for (let i = 1; i < path.samples.length; i += 1) {
      path.samples[i].q.forEach((value, joint) => {
        assert.ok(Math.abs(value - path.samples[i - 1].q[joint]) < 1.1, `${label}: adjacent IK solutions must keep the same branch`);
      });
    }
    let previous = sampleJointPath(path, 0);
    // These are normalized path samples, not an assumed browser frame rate.
    for (let step = 0; step <= 1000; step += 1) {
      const joints = sampleJointPath(path, step / 1000);
      joints.forEach((value, joint) => {
        assert.ok(Number.isFinite(value), `${label}: finite joint ${joint}`);
        assert.ok(value >= LIMITS[joint][0] - 1e-9 && value <= LIMITS[joint][1] + 1e-9, `${label}: joint ${joint} stays within limits`);
        const change = Math.abs(value - previous[joint]);
        assert.ok(change < 0.01, `${label}: no discontinuity at joint ${joint}`);
        travel[joint] += change;
      });
      assert.ok(forward(joints).tcp[14] >= 0.006, `${label}: the tool must not cross the desktop`);
      previous = joints;
    }
    travel.forEach((angle, joint) => assert.ok(angle < 3.5, `${label}: joint ${joint} must not take an unnecessary full turn`));
  }
});

test('joint velocity remains continuous across precomputed sample boundaries', () => {
  const epsilon = 1e-7;
  for (const { name, approach, raise } of fixtures) for (const path of [approach, raise]) {
    for (const knot of path.samples.slice(1, -1)) {
      const before = sampleJointPath(path, knot.s - epsilon);
      const at = sampleJointPath(path, knot.s);
      const after = sampleJointPath(path, knot.s + epsilon);
      at.forEach((value, joint) => {
        const incoming = (value - before[joint]) / epsilon;
        const outgoing = (after[joint] - value) / epsilon;
        close(incoming, outgoing, 0.005, `${name}: velocity continuity at joint ${joint}`);
      });
    }
  }
});

test('reverse playback retraces the same joint poses and returns through exact contact to rest', () => {
  for (const { name, approach, raise } of fixtures) {
    for (const path of [approach, raise]) {
      for (let step = 0; step <= 240; step += 1) {
        const progress = step / 240;
        assert.deepEqual(sampleJointPath(path, progress, true), sampleJointPath(path, 1 - progress), `${name}: exact reverse pose`);
      }
    }
    assert.deepEqual(sampleJointPath(raise, 1, true), sampleJointPath(approach, 0, true), `${name}: exact return-contact seam`);
    assert.deepEqual(sampleJointPath(approach, 1, true), restJoints, `${name}: exact final rest joints`);
  }
});

test('the production held-plaque transform keeps its contact face exactly tangent to the tool', () => {
  const halfThickness = config.PLAQUE.thickness / 2;
  for (const { name, rest, contact, raise } of fixtures) {
    const returned = multiply(contact, config.ATTACH);
    rest.forEach((value, index) => close(returned[index], value, 1e-12, `${name}: rest/attachment inverse`));
    for (let step = 0; step <= 100; step += 1) {
      const tool = forward(sampleJointPath(raise, step / 100)).tcp;
      const plate = multiply(tool, config.ATTACH);
      for (let axis = 0; axis < 3; axis += 1) {
        // The plate's upper-face centre must coincide with the suction TCP.
        close(plate[12 + axis] + plate[8 + axis] * halfThickness, tool[12 + axis], 1e-12, `${name}: attached contact position`);
        close(plate[8 + axis], -tool[8 + axis], 1e-12, `${name}: opposing contact normals`);
      }
    }
  }
});

test('unreachable motion is rejected before playback rather than returning an invalid path', () => {
  assert.throws(() => prepareJointPath([pose([0.8, 0, 0.2], [1, 0, 0], [0, 1, 0])], restJoints), /could not reach/i);
});
