// Browser-only gesture rules for the concept demonstration. These are not the
// ring's sensor pipeline, trained network, or a measurement of its performance.
export const CHANNELS = Object.freeze(['AURORA', 'COAST', 'CITY']);
export const INITIAL_TV_STATE = Object.freeze({ power: false, volume: 35, channel: 0 });

function resample(points, count = 49) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths.at(-1);
  if (!total) return [];
  const result = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = total * i / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < distance) segment++;
    const a = points[segment - 1], b = points[segment];
    const fraction = (distance - lengths[segment - 1]) / Math.max(.0001, lengths[segment] - lengths[segment - 1]);
    result.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
  }
  return result;
}

export function classifyGesture(input, { minExtent = 28 } = {}) {
  if (!Array.isArray(input)) return null;
  const points = [];
  for (const point of input) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const previous = points.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= .75) points.push(point);
  }
  if (points.length < 2) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX, height = maxY - minY, extent = Math.max(width, height);
  if (extent < minExtent) return null;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const dx = points.at(-1).x - points[0].x, dy = points.at(-1).y - points[0].y;
  const displacement = Math.hypot(dx, dy);

  // A circle needs a single mostly closed, consistently turning loop. Length,
  // radial spread and turning reject scribbles, partial loops and double loops.
  if (points.length >= 8 && Math.min(width, height) / extent >= .55 && displacement / extent <= .35 && length / extent >= 2.5 && length / extent <= 4.2) {
    const sample = resample(points);
    let turn = 0, totalTurn = 0, previousAngle;
    for (let i = 1; i < sample.length; i++) {
      const angle = Math.atan2(sample[i].y - sample[i - 1].y, sample[i].x - sample[i - 1].x);
      if (previousAngle !== undefined) {
        const change = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
        turn += change; totalTurn += Math.abs(change);
      }
      previousAngle = angle;
    }
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const radii = sample.map(p => Math.hypot(p.x - center.x, p.y - center.y));
    const average = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
    const spread = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - average) ** 2, 0) / radii.length) / average;
    if (Math.abs(turn) >= 4.7 && Math.abs(turn) <= 7.5 && Math.abs(turn) / Math.max(totalTurn, .001) >= .72 && spread <= .24) return 'circle';
  }

  // Swipes are single directional strokes, not oscillation or diagonal motion.
  if (displacement < minExtent || displacement / length < .86) return null;
  if (Math.abs(dx) >= Math.abs(dy) * 2.3 && height <= width * .35 + 3) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) >= Math.abs(dx) * 2.3 && width <= height * .35 + 3) return dy > 0 ? 'down' : 'up';
  return null;
}

export function applyGesture(current, gesture) {
  const state = { ...current };
  if (!['circle', 'up', 'down', 'left', 'right'].includes(gesture)) return { state, accepted: false, message: 'Try a circle or one clear swipe up, down, left or right.' };
  if (gesture === 'circle') {
    state.power = !state.power;
    return { state, accepted: true, message: `Circle recognized · TV ${state.power ? 'on' : 'off'}.` };
  }
  if (!state.power) return { state, accepted: false, message: 'Turn on the TV with a circle first.' };
  if (gesture === 'up' || gesture === 'down') {
    state.volume = Math.min(100, Math.max(0, state.volume + (gesture === 'up' ? 10 : -10)));
    return { state, accepted: true, message: `${gesture === 'up' ? 'Upward' : 'Downward'} swipe recognized · volume ${state.volume}%.` };
  }
  state.channel = (state.channel + (gesture === 'right' ? 1 : -1) + CHANNELS.length) % CHANNELS.length;
  return { state, accepted: true, message: `${gesture === 'right' ? 'Right' : 'Left'} swipe recognized · channel ${state.channel + 1}, ${CHANNELS[state.channel]}.` };
}

export function gesturePath(gesture, width = 320, height = 220) {
  const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .3;
  if (gesture === 'circle') return Array.from({ length: 65 }, (_, i) => {
    const angle = -Math.PI / 2 + i / 64 * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  const direction = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[gesture];
  if (!direction) return [];
  return Array.from({ length: 17 }, (_, i) => ({ x: cx + (i / 16 - .5) * radius * 2 * direction[0], y: cy + (i / 16 - .5) * radius * 2 * direction[1] }));
}
