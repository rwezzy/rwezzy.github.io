import { forward, inverse } from './den/lite6.js';

const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function quaternion(m) {
  const trace = m[0] + m[5] + m[10];
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (m[6] - m[9]) / s; y = (m[8] - m[2]) / s; z = (m[1] - m[4]) / s;
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
    w = (m[6] - m[9]) / s; x = s / 4; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s;
  } else if (m[5] > m[10]) {
    const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
    w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = s / 4; z = (m[9] + m[6]) / s;
  } else {
    const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
    w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = s / 4;
  }
  return [x, y, z, w];
}

function slerp(a, b, t) {
  let dot = a.reduce((sum, n, i) => sum + n * b[i], 0);
  const target = dot < 0 ? b.map(n => -n) : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    const q = a.map((n, i) => n + (target[i] - n) * t), length = Math.hypot(...q);
    return q.map(n => n / length);
  }
  const theta = Math.acos(clamp(dot, -1, 1)), divisor = Math.sin(theta);
  return a.map((n, i) => (n * Math.sin((1 - t) * theta) + target[i] * Math.sin(t * theta)) / divisor);
}

function matrix(q, p) {
  const [x, y, z, w] = q;
  return new Float64Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    ...p, 1,
  ]);
}

const hermite = (a, b, ma, mb, t) => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * b + (t3 - t2) * mb;
};

/** Precompute IK along a continuous Cartesian curve. Nothing is solved in a frame. */
export function prepareJointPath(targets, seed, { samplesPerSegment = 20 } = {}) {
  const poses = [forward(seed).tcp, ...targets];
  const positions = poses.map(m => [m[12], m[13], m[14]]), rotations = poses.map(quaternion);
  const samples = [{ q: seed.slice(), s: 0 }];
  let joints = seed.slice(), distance = 0;
  for (let segment = 0; segment < targets.length; segment += 1) {
    const a = positions[segment], b = positions[segment + 1];
    const before = positions[Math.max(0, segment - 1)], after = positions[Math.min(positions.length - 1, segment + 2)];
    // Low-tension cardinal tangents blend through clearance points without a stop.
    const ma = a.map((_, i) => (b[i] - before[i]) * (segment ? 0.35 : 1));
    const mb = a.map((_, i) => (after[i] - a[i]) * (segment === targets.length - 1 ? 1 : 0.35));
    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const p = a.map((n, i) => hermite(n, b[i], ma[i], mb[i], t));
      const target = matrix(slerp(rotations[segment], rotations[segment + 1], smooth(t)), p);
      let result = inverse(target, joints, { iterations: 90 });
      if (!result.ok) result = inverse(target, joints, { iterations: 260, damping: 0.025 });
      if (!result.ok) throw new Error(`Studio motion could not reach a path sample (${(result.error * 1000).toFixed(2)} mm).`);
      distance += Math.max(1e-7, Math.hypot(...result.q.map((n, i) => n - joints[i])));
      joints = result.q; samples.push({ q: joints, s: distance });
    }
  }
  samples.forEach(sample => { sample.s /= distance || 1; });
  // Monotone Hermite joint tangents preserve joint limits and avoid speed jumps
  // at sample boundaries; the playback envelope stops only at its two ends.
  samples.forEach((sample, index) => {
    const previous = samples[Math.max(0, index - 1)], next = samples[Math.min(samples.length - 1, index + 1)];
    sample.tangent = sample.q.map((n, joint) => {
      const left = index ? (n - previous.q[joint]) / (sample.s - previous.s) : 0;
      const right = index < samples.length - 1 ? (next.q[joint] - n) / (next.s - sample.s) : 0;
      if (!index) return right;
      if (index === samples.length - 1) return left;
      return left * right > 0 ? 2 * left * right / (left + right) : 0;
    });
  });
  return { samples, start: samples[0].q.slice(), end: samples.at(-1).q.slice() };
}

export function sampleJointPath(path, progress, reverse = false) {
  const t = reverse ? 1 - clamp(progress, 0, 1) : clamp(progress, 0, 1);
  if (t <= 0) return path.start.slice();
  if (t >= 1) return path.end.slice();
  const samples = path.samples;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].s <= t) low = middle; else high = middle;
  }
  const a = samples[low], b = samples[high], length = b.s - a.s, local = (t - a.s) / length;
  return a.q.map((n, joint) => hermite(n, b.q[joint], a.tangent[joint] * length, b.tangent[joint] * length, local));
}
