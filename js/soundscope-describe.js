/**
 * Rule-based SoundScope captions, written in the browser without any model or API.
 * Inputs are only what the device itself could know: the sound's label, the estimated direction,
 * the depth to the first visible surface along that direction, which visible object that surface
 * belongs to, whether that object could make this kind of sound, and its visible neighbours.
 * It never sees where the simulated source really is.
 */

/** Plain-language direction for an azimuth/elevation pair (degrees, + = right/up). */
export function directionPhrase(azimuth, elevation = 0) {
  const side = azimuth < 0 ? 'left' : 'right', a = Math.abs(azimuth);
  let phrase = a < 6 ? 'straight ahead' : a < 20 ? `ahead, slightly ${side}` : a < 45 ? `ahead and to the ${side}` : `to the ${side}`;
  if (elevation > 20) phrase += ', up high';
  else if (elevation < -25) phrase += ', low down';
  return phrase;
}

const withArticle = name => (/^(the|a|an) /.test(name) ? name : `the ${name}`);
const metres = value => `${value < 1 ? value.toFixed(2) : value.toFixed(1)} m`;

/**
 * @param {object} facts
 * @param {string} facts.label           sound label, e.g. 'Alarm ringing'
 * @param {number} facts.azimuth         estimated azimuth, degrees
 * @param {number} facts.elevation       estimated elevation, degrees
 * @param {{name: string, kind: string, canMake: boolean, support?: string}|null} facts.surface
 *        first visible thing along the estimate; kind is 'object', 'furniture', 'wall' or 'floor'
 * @param {number|null} facts.depth      metres to that surface, from the depth camera
 * @param {{name: string, side: 'left'|'right'}|null} facts.neighbour  nearest other visible object in the image
 * @param {string|null} facts.rival      what an echo direction points at, if any
 * @param {number} facts.spread          number of one-degree cells with at least half the peak support
 * @returns {{caption: string, hidden: boolean, keywords: string[]}}
 */
export function describe({ label, azimuth, elevation, surface, depth, neighbour = null, rival = null, spread = 0 }) {
  const where = directionPhrase(azimuth, elevation), keywords = [], parts = [];
  const distance = Number.isFinite(depth) ? `, ${metres(depth)} away` : '';
  let hidden = false;
  if (!surface) {
    parts.push(`${label}, ${where}. Nothing visible lies in that direction within the camera's range.`);
    hidden = true;
  } else if (surface.canMake) {
    const support = surface.support ? ` on ${withArticle(surface.support)}` : '';
    parts.push(`${label}: ${withArticle(surface.name)}${support}${distance}, ${where}.`);
    keywords.push(surface.name, 'on');
    if (surface.support) keywords.push(surface.support);
  } else if (surface.kind === 'wall' || surface.kind === 'floor') {
    parts.push(`${label} from the direction of ${withArticle(surface.name)}${distance}, ${where}. Nothing visible there makes that sound; the source may be out of view, or this may be a reflection.`);
    hidden = true;
  } else {
    parts.push(`${label} from the direction of ${withArticle(surface.name)}${distance}, ${where}. Nothing visible there makes that sound, so the source is probably behind or under ${withArticle(surface.name)}.`);
    keywords.push(surface.name, 'behind');
    hidden = true;
  }
  if (neighbour) {
    parts.push(`That spot is ${neighbour.side} of ${withArticle(neighbour.name)}.`);
    keywords.push(neighbour.name, neighbour.side);
  }
  if (rival) parts.push(`An echo also points toward ${withArticle(rival)}, so treat this direction with some caution.`);
  else if (spread > 3500) parts.push('The direction is broad, so nearby surfaces are also possible.');
  keywords.push(...where.split(/[^a-z]+/).filter(word => ['left', 'right', 'ahead'].includes(word)));
  return { caption: parts.join(' '), hidden, keywords: [...new Set(keywords)] };
}
