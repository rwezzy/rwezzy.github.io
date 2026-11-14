/**
 * Browser-only acoustic simulation of a furnished room, not a microphone connection.
 * Each sound is a sum of sinusoids, so every microphone hears an exactly delayed copy:
 * the direct path, one reflection off each of the six room surfaces, and a decaying diffuse tail,
 * sampled at the XVF3800's 16 kHz rate. Four microphones sit upright on a square facing the scene,
 * as on the SoundScope carrier, and direction comes from GCC-PHAT over all six pairs, steered across
 * the camera's field of view. Units are metres; y is up.
 */
export const SPEED_OF_SOUND = 343;
export const SAMPLE_RATE = 16000;
export const DEFAULT_SPACING = 0.066;
// Steering grid, in degrees, relative to the rig's forward direction.
export const AZIMUTH = Object.freeze({ min: -70, max: 70 });
export const ELEVATION = Object.freeze({ min: -45, max: 45 });

const WINDOW = 4096, FFT_SIZE = 8192, UPSAMPLE = 4, LATE_TAPS = 48;
const TAU = 2 * Math.PI;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function partials(seed, count, low, high, level) {
  const random = randomGenerator(seed);
  return Array.from({ length: count }, () => ({
    w: TAU * (low + random() * (high - low)), p: random() * TAU, a: level * (0.4 + random()) / Math.sqrt(count),
  }));
}
const bank = (components, t) => { let sum = 0; for (const c of components) sum += c.a * Math.sin(c.w * t + c.p); return sum; };
const breath = partials(11, 24, 900, 6000, 0.35);
const voiceNoise = partials(41, 26, 250, 3800, 0.5);
const beatNoise = partials(29, 30, 2000, 7000, 0.6);

/** Synthesized sounds; render(t) is defined for any real t and is zero outside the sound. */
export const SOUNDS = Object.freeze({
  alarm: {
    label: 'Alarm ringing', duration: 1.2, keywords: ['alarm', 'clock', 'ring'],
    render(t) {
      if (t < 0 || t > 1.2) return 0;
      const local = t % 0.3;
      if (local > 0.2) return 0;
      const envelope = Math.min(1, local / 0.003) * Math.min(1, (0.2 - local) / 0.01) * (0.55 + 0.45 * Math.sign(Math.sin(TAU * 24 * t)));
      return envelope * (0.5 * Math.sin(TAU * 2100 * t) + 0.3 * Math.sin(TAU * 3150 * t + 1) + 0.18 * Math.sin(TAU * 4200 * t + 2));
    },
  },
  kettle: {
    label: 'Kettle whistling', duration: 1.4, keywords: ['kettle', 'whistle'],
    render(t) {
      if (t < 0 || t > 1.4) return 0;
      const envelope = Math.min(1, t / 0.25) * Math.min(1, (1.4 - t) / 0.08);
      return envelope * (0.45 * Math.sin(TAU * 2650 * t - 8 * Math.cos(TAU * 5 * t)) + bank(breath, t));
    },
  },
  music: {
    label: 'Music playing', duration: 1.6, keywords: ['music', 'radio', 'boombox', 'song'],
    render(t) {
      if (t < 0 || t > 1.6) return 0;
      const beat = t % 0.4, off = (t + 0.2) % 0.4;
      const kick = beat < 0.12 ? Math.exp(-beat / 0.04) * Math.sin(TAU * (60 * beat + 400 * beat * Math.exp(-beat / 0.02))) : 0;
      const hat = off < 0.05 ? Math.exp(-off / 0.012) * bank(beatNoise, t) : 0;
      const notes = [220, 277.2, 329.6, 440], note = notes[Math.floor(t / 0.2) % 4];
      const chord = 0.18 * (Math.sin(TAU * note * t) + 0.5 * Math.sin(TAU * 2 * note * t)) * Math.min(1, (t % 0.2) / 0.01);
      return Math.min(1, t / 0.01) * (0.8 * kick + 0.5 * hat + chord);
    },
  },
  speech: {
    label: 'Television speech', duration: 1.5, keywords: ['television', 'tv', 'speech', 'voice', 'talking'],
    render(t) {
      if (t < 0 || t > 1.5) return 0;
      const syllable = t % 0.19, gap = Math.floor(t / 0.19) % 5 === 4;
      if (gap) return 0;
      const envelope = Math.sin(Math.PI * Math.min(1, syllable / 0.16)) ** 0.7;
      const f0 = 150 + 25 * Math.sin(TAU * 1.3 * t), phase = TAU * f0 * t;
      let glottal = 0;
      for (let h = 1; h <= 12; h += 1) glottal += Math.sin(h * phase) / h * (h > 3 && h < 8 ? 1.6 : 1);
      return envelope * (0.25 * glottal + 0.5 * bank(voiceNoise, t));
    },
  },
});

/** Unit vectors and microphone positions for a rig turned by yaw about y (yaw 0 faces -z). */
export function rigFrame(rig, spacing = DEFAULT_SPACING) {
  const forward = { x: -Math.sin(rig.yaw), y: 0, z: -Math.cos(rig.yaw) };
  const right = { x: Math.cos(rig.yaw), y: 0, z: -Math.sin(rig.yaw) };
  const up = { x: 0, y: 1, z: 0 };
  const h = spacing / 2, center = rig.micCenter ?? rig.position;
  const microphones = [[-h, h], [h, h], [h, -h], [-h, -h]].map(([a, b], i) => ({
    id: `M${i + 1}`,
    x: center.x + right.x * a + up.x * b, y: center.y + right.y * a + up.y * b, z: center.z + right.z * a + up.z * b,
  }));
  return { forward, right, up, microphones, center };
}

/** Direction (unit vector) for an azimuth/elevation pair in degrees, in the rig's frame. */
export function directionFor(frame, azimuth, elevation) {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180, { forward: f, right: r, up: u } = frame;
  const cf = Math.cos(e) * Math.cos(a), cr = Math.cos(e) * Math.sin(a), cu = Math.sin(e);
  return { x: f.x * cf + r.x * cr + u.x * cu, y: f.y * cf + r.y * cr + u.y * cu, z: f.z * cf + r.z * cr + u.z * cu };
}

/** Azimuth and elevation in degrees of a world point, as seen from the rig. */
export function anglesTo(frame, point) {
  const d = { x: point.x - frame.center.x, y: point.y - frame.center.y, z: point.z - frame.center.z };
  const dot = v => d.x * v.x + d.y * v.y + d.z * v.z;
  const f = dot(frame.forward), r = dot(frame.right), u = dot(frame.up);
  return { azimuth: Math.atan2(r, f) * 180 / Math.PI, elevation: Math.atan2(u, Math.hypot(f, r)) * 180 / Math.PI };
}

export function angleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z, la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb)))) * 180 / Math.PI;
}

function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / size, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < size / 2; k += 1) {
        const a = start + k, b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// Each sound is rendered once at 96 kHz; delayed copies are read back with linear interpolation.
const TABLE_RATE = 96000, TABLE_START = -0.01, TABLE_END = WINDOW / SAMPLE_RATE + 0.01;
const tables = new Map();
function soundTable(sound) {
  if (!tables.has(sound)) {
    const render = SOUNDS[sound].render, length = Math.ceil((TABLE_END - TABLE_START) * TABLE_RATE) + 2;
    const values = new Float32Array(length);
    for (let n = 0; n < length; n += 1) values[n] = render(TABLE_START + n / TABLE_RATE);
    tables.set(sound, t => {
      const position = (t - TABLE_START) * TABLE_RATE, index = Math.floor(position);
      if (index < 0 || index >= length - 1) return 0;
      return values[index] + (values[index + 1] - values[index]) * (position - index);
    });
  }
  return tables.get(sound);
}

/** Direct path plus one reflection off each surface of an axis-aligned room (the image-source method). */
export function imageSources(source, room, echo) {
  const paths = [{ ...source, gain: 1 }];
  if (echo <= 0) return paths;
  for (const axis of ['x', 'y', 'z']) {
    for (const wall of [room.min[axis], room.max[axis]]) paths.push({ ...source, [axis]: 2 * wall - source[axis], gain: echo });
  }
  return paths;
}

const inside = (point, room) => ['x', 'y', 'z'].every(axis => point[axis] > room.min[axis] && point[axis] < room.max[axis]);

/**
 * Simulate the four microphone signals for a source and estimate its direction.
 * map is row-major over elevation (top row = max elevation) and azimuth (left = min azimuth), one cell
 * per degree, normalized to [0, 1]: relative support for a direction, not a probability.
 */
export function simulate({ source, rig, room, sound = 'alarm', spacing = DEFAULT_SPACING, echo = 0, seed = 1 }) {
  if (!source || !['x', 'y', 'z'].every(axis => Number.isFinite(source[axis]))) throw new TypeError('source needs finite x, y and z');
  if (!inside(source, room)) throw new RangeError('source must be inside the room');
  if (!(spacing >= 0.02 && spacing <= 0.2)) throw new RangeError('spacing must be 20 to 200 mm');
  if (!(echo >= 0 && echo <= 0.9)) throw new RangeError('echo must be between 0 and 0.9');
  if (!SOUNDS[sound]) throw new RangeError(`unknown sound: ${sound}`);
  const frame = rigFrame(rig, spacing), { microphones, center } = frame;
  const range = Math.hypot(source.x - center.x, source.y - center.y, source.z - center.z);
  if (range < 0.3) throw new RangeError('source must be at least 0.3 m from the microphones');

  const random = randomGenerator(seed), table = soundTable(sound), paths = imageSources(source, room, echo);
  const late = [];
  for (let k = 0; k < (echo > 0 ? LATE_TAPS : 0); k += 1) {
    const extra = 0.004 + random() * 0.1, z = random() * 2 - 1, angle = random() * TAU, s = Math.sqrt(1 - z * z);
    late.push({ u: { x: s * Math.cos(angle), y: z, z: s * Math.sin(angle) }, delay: range / SPEED_OF_SOUND + extra,
      gain: echo * echo * 2.6 * Math.exp(-extra / 0.06) * (0.4 + random()) / Math.sqrt(LATE_TAPS) / Math.max(range, 0.3) });
  }
  const signals = microphones.map(mic => {
    const taps = paths.map(path => {
      const distance = Math.hypot(path.x - mic.x, path.y - mic.y, path.z - mic.z);
      return { delay: distance / SPEED_OF_SOUND, gain: path.gain / Math.max(distance, 0.3) };
    });
    for (const tap of late) {
      const offset = (mic.x - center.x) * tap.u.x + (mic.y - center.y) * tap.u.y + (mic.z - center.z) * tap.u.z;
      taps.push({ delay: tap.delay - offset / SPEED_OF_SOUND, gain: tap.gain });
    }
    const samples = new Float64Array(WINDOW);
    for (let n = 0; n < WINDOW; n += 1) samples[n] = (random() + random() + random() - 1.5) * 0.004;
    for (const tap of taps) for (let n = 0; n < WINDOW; n += 1) samples[n] += tap.gain * table(n / SAMPLE_RATE - tap.delay);
    return samples;
  });

  const spectra = signals.map(samples => {
    const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
    re.set(samples); fft(re, im);
    return { re, im };
  });
  // GCC-PHAT for every pair, interpolated by zero-padding the cross-spectrum before the inverse FFT.
  const size = FFT_SIZE * UPSAMPLE, rate = SAMPLE_RATE * UPSAMPLE, half = FFT_SIZE / 2, pairs = [];
  for (let i = 0; i < 4; i += 1) for (let j = i + 1; j < 4; j += 1) {
    const a = spectra[i], b = spectra[j], cross = new Float64Array(FFT_SIZE * 2);
    let peak = 0;
    for (let k = 0; k < FFT_SIZE; k += 1) {
      const cr = a.re[k] * b.re[k] + a.im[k] * b.im[k], ci = a.im[k] * b.re[k] - a.re[k] * b.im[k];
      cross[2 * k] = cr; cross[2 * k + 1] = ci; peak = Math.max(peak, Math.hypot(cr, ci));
    }
    const re = new Float64Array(size), im = new Float64Array(size), floor = peak * 1e-3;
    for (let k = 0; k < FFT_SIZE; k += 1) {
      const cr = cross[2 * k], ci = cross[2 * k + 1], weight = 1 / (Math.hypot(cr, ci) + floor);
      const target = k <= half ? k : size - FFT_SIZE + k;
      re[target] = cr * weight; im[target] = ci * weight;
    }
    fft(re, im, true);
    pairs.push({ i, j, correlation: re });
  }
  const lookup = (correlation, lag) => {
    const position = lag * rate, index = Math.floor(position), fraction = position - index;
    const at = k => correlation[((k % size) + size) % size];
    return at(index) * (1 - fraction) + at(index + 1) * fraction;
  };

  const columns = AZIMUTH.max - AZIMUTH.min + 1, rows = ELEVATION.max - ELEVATION.min + 1;
  const map = new Float32Array(columns * rows);
  let low = Infinity, high = -Infinity, best = 0;
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const u = directionFor(frame, AZIMUTH.min + column, ELEVATION.max - row);
    const arrival = microphones.map(mic => -((mic.x - center.x) * u.x + (mic.y - center.y) * u.y + (mic.z - center.z) * u.z) / SPEED_OF_SOUND);
    let power = 0;
    for (const pair of pairs) power += lookup(pair.correlation, arrival[pair.i] - arrival[pair.j]);
    const index = row * columns + column;
    map[index] = power; low = Math.min(low, power);
    if (power > high) { high = power; best = index; }
  }
  for (let k = 0; k < map.length; k += 1) map[k] = high > low ? Math.min(1, Math.max(0, (map[k] - low) / (high - low))) : 0;
  map[best] = 1;

  const peakColumn = best % columns, peakRow = Math.floor(best / columns);
  const estimate = { azimuth: AZIMUTH.min + peakColumn, elevation: ELEVATION.max - peakRow };
  const estimateVector = directionFor(frame, estimate.azimuth, estimate.elevation);
  const truthVector = { x: source.x - center.x, y: source.y - center.y, z: source.z - center.z };

  // Strongest separate local maximum at least 20 degrees from the peak: an echo or ambiguity.
  let rival = null;
  for (let row = 1; row < rows - 1; row += 1) for (let column = 1; column < columns - 1; column += 1) {
    const value = map[row * columns + column];
    if (value < 0.5 || (rival && value <= rival.strength)) continue;
    let isPeak = true;
    for (let dr = -1; dr <= 1 && isPeak; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
      if ((dr || dc) && map[(row + dr) * columns + column + dc] > value) { isPeak = false; break; }
    }
    const angles = { azimuth: AZIMUTH.min + column, elevation: ELEVATION.max - row };
    if (isPeak && angleBetween(directionFor(frame, angles.azimuth, angles.elevation), estimateVector) >= 20) rival = { ...angles, strength: value };
  }

  const direct = microphones.map(mic => Math.hypot(source.x - mic.x, source.y - mic.y, source.z - mic.z) / SPEED_OF_SOUND);
  const first = Math.min(...direct);
  let spread = 0;
  for (const value of map) if (value >= 0.5) spread += 1;
  return {
    map, columns, rows, estimate, estimateVector, truth: anglesTo(frame, source), truthVector, range,
    errorDegrees: angleBetween(estimateVector, truthVector), rival, spread, delays: direct.map(time => time - first),
  };
}

const SYNONYMS = {
  alarm: 'alarm', alarms: 'alarm', clock: 'alarm', ring: 'alarm', rang: 'alarm', ringing: 'alarm', rings: 'alarm', beep: 'alarm', beeping: 'alarm',
  kettle: 'kettle', whistle: 'kettle', whistled: 'kettle', whistling: 'kettle', tea: 'kettle', boil: 'kettle', boiling: 'kettle', boiled: 'kettle',
  music: 'music', song: 'music', songs: 'music', radio: 'music', boombox: 'music', playing: 'music', played: 'music',
  television: 'speech', tv: 'speech', speech: 'speech', voice: 'speech', talking: 'speech', talk: 'speech', someone: 'speech',
  sofa: 'sofa', couch: 'sofa', armchair: 'armchair', chair: 'armchair', table: 'table', shelf: 'shelf', bookshelf: 'shelf',
  cabinet: 'cabinet', dresser: 'cabinet', desk: 'desk', floor: 'floor', plant: 'plant',
  behind: 'behind', hidden: 'behind', under: 'under', on: 'on', near: 'near', next: 'near', beside: 'near',
  left: 'left', right: 'right', ahead: 'ahead', front: 'ahead',
};
const VOCABULARY = new Set(Object.values(SYNONYMS));
const tokens = value => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(token => SYNONYMS[token] ?? token);

/**
 * Search session records by sound, place and direction words; this performs no audio classification.
 * Words outside the small vocabulary are ignored ("when did the alarm go off?" finds the alarm).
 * Every recognized word must match. An empty query returns everything; a query with no recognized
 * words returns nothing. Results are chronological and the input is not modified.
 */
export function searchEvents(records, query = '') {
  if (String(query ?? '').trim() === '') return records.slice().sort((a, b) => Number(a.time) - Number(b.time));
  const requested = [...new Set(tokens(query).filter(token => VOCABULARY.has(token)))];
  if (requested.length === 0) return [];
  return records.filter(record => {
    const available = new Set(tokens([record.label, record.type, record.caption, ...(record.keywords ?? [])].join(' ')));
    return requested.every(token => available.has(token));
  }).sort((a, b) => Number(a.time) - Number(b.time));
}
