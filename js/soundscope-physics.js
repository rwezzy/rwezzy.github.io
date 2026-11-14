/**
 * Browser-only acoustic experiment, not a microphone connection.
 * The 66 mm square matches the app's upright four-microphone geometry.
 * Noise is synthetic timing perturbation, never measured confidence.
 * x/y are image-plane slopes; z is supplied scene depth, not an estimate.
 */
export const SPEED_OF_SOUND = 343;
export const IMAGE_BOUNDS = Object.freeze({ left: -1, right: 1, bottom: -0.7, top: 0.7 });
// An illustrative ±70 microsecond bound at noise=1, not a hardware measurement.
export const MAX_TIMING_JITTER_SECONDS = 70e-6;

const MICROPHONES = [
  { id: 'upper-left', x: -0.033, y: 0.033, z: 0 },
  { id: 'upper-right', x: 0.033, y: 0.033, z: 0 },
  { id: 'lower-right', x: 0.033, y: -0.033, z: 0 },
  { id: 'lower-left', x: -0.033, y: -0.033, z: 0 },
];

export function microphonePositions() {
  return MICROPHONES.map(microphone => ({ ...microphone }));
}

function validateSource(source) {
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.z)) {
    throw new TypeError('source must contain finite x, y and z coordinates');
  }
  if (source.x < -1 || source.x > 1 || source.y < -0.7 || source.y > 0.7 || source.z < 0.7 || source.z > 2.5) {
    throw new RangeError('source must be inside x [-1, 1], y [-0.7, 0.7], z [0.7, 2.5]');
  }
}

function relativeToEarliest(values) {
  const first = Math.min(...values);
  return values.map(value => value - first);
}

function delaysAt(x, y, z) {
  return relativeToEarliest(MICROPHONES.map(microphone =>
    Math.hypot(x * z - microphone.x, y * z - microphone.y, z) / SPEED_OF_SOUND));
}

/** Four relative arrival delays in seconds, ordered like microphonePositions(). */
export function arrivalDelays(source) {
  validateSource(source);
  return delaysAt(source.x, source.y, source.z);
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function differenceErrorSquared(expected, observed) {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      const residual = (expected[i] - expected[j]) - (observed[i] - observed[j]);
      sum += residual * residual;
    }
  }
  return sum / 6;
}

/**
 * Score candidate camera-facing rays against six observed timing differences.
 * Grid is row-major, top (+y) to bottom (-y), normalized to its best candidate.
 * Scores are relative visual support, not classification probabilities.
 * ambiguity is the fraction of candidates at least half as strong as the peak.
 * Each seed creates one fixed four-channel perturbation, reused for all rays.
 * Only one source is modeled; multiple-source events must be labeled scripted.
 * Valid inputs: x [-1,1], y [-0.7,0.7], z [0.7,2.5] metres, noise [0,1],
 * finite seed, and integer grid dimensions [3,501]. Invalid inputs throw.
 */
export function localize(source, { noise = 0, seed = 1, width = 61, height = 43 } = {}) {
  validateSource(source);
  if (!Number.isFinite(noise) || noise < 0 || noise > 1) {
    throw new RangeError('noise must be between 0 and 1');
  }
  if (!Number.isFinite(seed)) throw new TypeError('seed must be finite');
  if (![width, height].every(size => Number.isInteger(size) && size >= 3 && size <= 501)) {
    throw new RangeError('grid dimensions must be integers from 3 to 501');
  }

  const idealDelays = arrivalDelays(source);
  const random = randomGenerator(seed);
  const delays = relativeToEarliest(idealDelays.map(delay =>
    delay + (random() * 2 - 1) * noise * MAX_TIMING_JITTER_SECONDS));
  const errors = new Float64Array(width * height);
  let bestError = Infinity;
  let peak;

  for (let row = 0; row < height; row += 1) {
    const y = 0.7 - row * 1.4 / (height - 1);
    for (let column = 0; column < width; column += 1) {
      const x = -1 + column * 2 / (width - 1);
      const error = differenceErrorSquared(delaysAt(x, y, source.z), delays);
      errors[row * width + column] = error;
      if (error < bestError) {
        bestError = error;
        peak = { x, y, row, column, residualSeconds: Math.sqrt(error) };
      }
    }
  }

  // Broader synthetic timing uncertainty intentionally makes the map less sharp.
  const timingBandwidth = 4e-6 + noise * 35e-6;
  const grid = new Float32Array(errors.length);
  let supportedCandidates = 0;
  for (let i = 0; i < errors.length; i += 1) {
    grid[i] = Math.exp(-(errors[i] - bestError) / (2 * timingBandwidth ** 2));
    if (grid[i] >= 0.5) supportedCandidates += 1;
  }

  return {
    grid, width, height, peak, delays, idealDelays,
    ambiguity: supportedCandidates / grid.length,
    noise,
    range: source.z,
    timingBandwidthSeconds: timingBandwidth,
  };
}

const SYNONYMS = {
  phone: 'phone', telephone: 'phone', ring: 'phone', rings: 'phone', rang: 'phone', ringing: 'phone',
  clap: 'clap', claps: 'clap', clapped: 'clap', clapping: 'clap', applause: 'clap',
  speech: 'speech', speak: 'speech', speaking: 'speech', spoke: 'speech', voice: 'speech', talking: 'speech',
};

const QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
  'there', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'did', 'do', 'does',
  'have', 'has', 'had', 'when', 'where', 'what', 'which', 'who', 'how', 'please',
  'show', 'find', 'any', 'some', 'on', 'in', 'at', 'of', 'to', 'for', 'from', 'and',
]);

function tokens(value) {
  return String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map(token => SYNONYMS[token] ?? token);
}

/** Search supplied scripted labels/captions only; this performs no audio classification.
 * Records use time (seconds); optional text fields: label, caption, type, keywords[].
 * Returns matching original records in chronological order without mutating input.
 * All non-stopword query tokens must match; an empty query shows every record.
 * A nonempty query with only stopwords or unknown words yields no matches.
 */
export function searchEvents(records, query = '') {
  const emptyQuery = String(query ?? '').trim().length === 0;
  const requested = [...new Set(tokens(query).filter(token => !QUERY_STOPWORDS.has(token)))];
  if (!emptyQuery && requested.length === 0) return [];
  return records.filter(record => {
    const available = new Set(tokens([record.label, record.caption, record.type,
      ...(Array.isArray(record.keywords) ? record.keywords : [])].filter(Boolean).join(' ')));
    return requested.every(token => available.has(token));
  }).slice().sort((a, b) => Number(a.time) - Number(b.time));
}
