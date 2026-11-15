import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { galleryItems, portraitItems } from '../js/studio-gallery-data.js';
import { galleryFor, turnCard } from '../js/studio-gallery.js';

const root = new URL('../', import.meta.url);
test('portrait cards visit each supplied portrait, then the gallery, and wrap in both directions', () => {
  let current = 0;
  for (let index = 1; index <= portraitItems.length; index++) {
    current = turnCard(current); assert.equal(current, index);
  }
  assert.equal(turnCard(current), 0);
  assert.equal(turnCard(0, -1), portraitItems.length);
  assert.ok(portraitItems.some(item => item.id === 'personal-keith-pink-selfie'));
  assert.ok(portraitItems.some(item => item.id === 'ngamba-island-enrichment-portrait'));
  assert.ok(portraitItems.every(item => item.type === 'image'));
});

test('every gallery item has a unique identity, descriptive labels, and a usable local source', () => {
  assert.equal(new Set(galleryItems.map(item => item.id)).size, galleryItems.length);
  for (const item of galleryItems) {
    assert.ok(item.title && item.alt && item.category, item.id);
    assert.ok(item.width > 0 && item.height > 0, item.id);
    for (const path of [item.src, item.poster, item.preview].filter(Boolean)) assert.ok(existsSync(new URL(path.split('?')[0], root)), path);
  }
});

test('the full gallery covers every supplied photo and video export', () => {
  const sources = new Set(galleryItems.map(item => item.src.split('?')[0]));
  for (const dir of ['personal', 'urban-arbor', 'alternative-spring-break', 'spring-reins', 'senior-tech', 'ngamba-island']) {
    for (const file of readdirSync(new URL(`assets/${dir}/`, root))) {
      if (!/\.(webp|mp4)$/.test(file) || file.endsWith('-poster.webp')) continue;
      assert.ok(sources.has(`assets/${dir}/${file}`), `${dir}/${file} must be reachable in the gallery`);
    }
  }
});

test('gallery filters partition all media without losing items', () => {
  const categories = [...new Set(galleryItems.map(item => item.category))];
  assert.deepEqual(galleryFor('All'), galleryItems);
  assert.notEqual(galleryFor('All'), galleryItems);
  assert.equal(categories.flatMap(galleryFor).length, galleryItems.length);
  for (const category of categories) assert.ok(galleryFor(category).every(item => item.category === category));
  assert.deepEqual(galleryFor('Unknown'), []);
});

test('inline Ngamba links resolve to real gallery items and its sunset is not hidden in a disclosure', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const [, id] of html.matchAll(/data-gallery-item="([^"]+)"/g)) assert.ok(galleryItems.some(item => item.id === id), id);
  const ngamba = html.match(/<li id="service-ngamba-island"[\s\S]*?<\/li>/)[0];
  assert.doesNotMatch(ngamba, /<details/);
  assert.match(ngamba, /s-ngamba-lake/);
  assert.match(ngamba, /enrichment-poster.webp\?v=24/);
});
