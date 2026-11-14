/**
 * UFACTORY Lite 6 kinematics with the Lite vacuum gripper, in plain JavaScript (no three.js),
 * so it runs in the browser and under Node tests.
 * Joint origins, axes and limits come from UFACTORY's xarm_ros2 description (BSD-3-Clause):
 * xarm_description/config/kinematics/default/lite6_default_kinematics.yaml and lite6.urdf.xacro.
 * Frames are z-up, metres. Matrices are 4x4, column-major Float64Array (the layout three.js uses).
 */
const PI = Math.PI;

// [x, y, z, roll, pitch, yaw] per joint; every joint turns about its local z axis.
export const JOINT_ORIGINS = [
  [0, 0, 0.2435, 0, 0, 0],
  [0, 0, 0, 1.5708, -1.5708, 3.1416],
  [0.2002, 0, 0, -3.1416, 0, 1.5708],
  [0.087, -0.22761, 0, 1.5708, 0, 0],
  [0, 0, 0, 1.5708, 0, 0],
  [0, 0.0625, 0, -1.5708, 0, 0],
];
export const LIMITS = [[-2 * PI, 2 * PI], [-2.61799, 2.61799], [-0.061087, 5.235988], [-2 * PI, 2 * PI], [-2.1642, 2.1642], [-2 * PI, 2 * PI]];
export const TCP_OFFSET = 0.061; // the vacuum gripper's tool point, along the flange's z axis

export function identity() {
  const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m;
}
export function multiply(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
}
export function translation(x, y, z) { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
export function rotationZ(angle) {
  const m = identity(), c = Math.cos(angle), s = Math.sin(angle);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m;
}
/** URDF rpy: R = Rz(yaw) * Ry(pitch) * Rx(roll). */
export function rpy(roll, pitch, yaw) {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const m = identity();
  m[0] = cy * cp; m[4] = cy * sp * sr - sy * cr; m[8] = cy * sp * cr + sy * sr;
  m[1] = sy * cp; m[5] = sy * sp * sr + cy * cr; m[9] = sy * sp * cr - cy * sr;
  m[2] = -sp; m[6] = cp * sr; m[10] = cp * cr;
  return m;
}
const ORIGIN_MATRICES = JOINT_ORIGINS.map(([x, y, z, r, p, w]) => multiply(translation(x, y, z), rpy(r, p, w)));

/** Frames of link1..link6 (after each joint) and the tool point, relative to the robot base. */
export function forward(q) {
  const links = [];
  let frame = identity();
  for (let i = 0; i < 6; i += 1) {
    frame = multiply(multiply(frame, ORIGIN_MATRICES[i]), rotationZ(q[i]));
    links.push(frame);
  }
  return { links, tcp: multiply(frame, translation(0, 0, TCP_OFFSET)) };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Axis-angle vector (radians) of the rotation taking `current`'s orientation to `target`'s. */
export function rotationError(current, target) {
  // R = Rt * Rc^T, entries R[r][c] = sum_k Rt[r][k] * Rc[c][k]
  const R = (r, c) => { let s = 0; for (let k = 0; k < 3; k += 1) s += target[k * 4 + r] * current[k * 4 + c]; return s; };
  const v = [0.5 * (R(2, 1) - R(1, 2)), 0.5 * (R(0, 2) - R(2, 0)), 0.5 * (R(1, 0) - R(0, 1))];
  const sin = Math.hypot(...v), cos = Math.max(-1, Math.min(1, (R(0, 0) + R(1, 1) + R(2, 2) - 1) / 2));
  const angle = Math.atan2(sin, cos);
  if (sin > 1e-6) return v.map(c => c / sin * angle);
  if (cos > 0) return [0, 0, 0];
  // A half turn: the axis comes from the diagonal.
  const axisVector = [0, 1, 2].map(i => Math.sqrt(Math.max(0, (R(i, i) + 1) / 2)));
  if (R(0, 1) < 0) axisVector[1] = -axisVector[1];
  if (R(0, 2) < 0) axisVector[2] = -axisVector[2];
  return axisVector.map(c => c * Math.PI);
}

// Position error (m) followed by the weighted orientation error (rad).
function error(current, target, weight) {
  const e = new Float64Array(6), w = rotationError(current, target);
  for (let k = 0; k < 3; k += 1) { e[k] = target[12 + k] - current[12 + k]; e[3 + k] = w[k] * weight; }
  return e;
}

function solve(a, b) {
  // Gaussian elimination with partial pivoting for a small dense system a x = b.
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    [m[i], m[pivot]] = [m[pivot], m[i]];
    for (let r = i + 1; r < n; r += 1) {
      const f = m[r][i] / m[i][i];
      for (let c = i; c <= n; c += 1) m[r][c] -= f * m[i][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = m[i][n];
    for (let c = i + 1; c < n; c += 1) sum -= m[i][c] * x[c];
    x[i] = sum / m[i][i];
  }
  return x;
}

/**
 * Damped least-squares inverse kinematics for a full tool pose (position and orientation).
 * Returns { q, error: metres, angle: radians, ok } starting from `seed` (the current joints).
 */
export function inverse(target, seed, { iterations = 160, damping = 0.04, weight = 0.35 } = {}) {
  let q = seed.slice();
  const clamp = values => values.map((v, i) => Math.min(LIMITS[i][1], Math.max(LIMITS[i][0], v)));
  for (let step = 0; step < iterations; step += 1) {
    const current = forward(q).tcp, e = error(current, target, weight);
    if (Math.hypot(e[0], e[1], e[2]) < 2e-4 && Math.hypot(e[3], e[4], e[5]) < 2e-4) break;
    // Numeric Jacobian (6 x 6).
    const J = Array.from({ length: 6 }, () => new Array(6).fill(0)), h = 1e-5;
    for (let j = 0; j < 6; j += 1) {
      const nudged = q.slice(); nudged[j] += h;
      const ej = error(forward(nudged).tcp, target, weight);
      for (let r = 0; r < 6; r += 1) J[r][j] = (e[r] - ej[r]) / h;
    }
    // dq = J^T (J J^T + λ² I)^-1 e
    const JJt = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (__, c) => {
      let sum = r === c ? damping * damping : 0;
      for (let k = 0; k < 6; k += 1) sum += J[r][k] * J[c][k];
      return sum;
    }));
    const y = solve(JJt, Array.from(e));
    const dq = Array.from({ length: 6 }, (_, j) => { let sum = 0; for (let r = 0; r < 6; r += 1) sum += J[r][j] * y[r]; return sum; });
    q = clamp(q.map((v, j) => v + Math.max(-0.3, Math.min(0.3, dq[j]))));
  }
  const final = forward(q).tcp, e = error(final, target, 1);
  const positionError = Math.hypot(e[0], e[1], e[2]), angleError = Math.hypot(e[3], e[4], e[5]);
  return { q, error: positionError, angle: angleError, ok: positionError < 2e-3 && angleError < 0.02 };
}

/**
 * A tool pose in base coordinates: tool point `p`, tool axis `z` (the direction the suction cup faces,
 * pointing from the flange through the cup) and a reference `x` axis, both re-orthogonalized.
 */
export function pose(p, z, x) {
  const norm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
  const zz = norm(z), yy = norm(cross(zz, x)), xx = cross(yy, zz);
  const m = identity();
  m.set([...xx, 0, ...yy, 0, ...zz, 0, ...p, 1]);
  return m;
}
