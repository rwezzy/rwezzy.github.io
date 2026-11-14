import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('tests/studio-preservation.json').toString('utf8'));
const classic = read('classic.html').toString('utf8');
const studio = read('index.html').toString('utf8');
const soundscope = read('js/soundscope.js').toString('utf8');
const protectedFiles = [
  'js/soundscope-room.js', 'js/soundscope-describe.js',
  'js/soundscope-hardware.js', 'js/pick.js', 'js/demos.js', 'css/soundscope.css',
];

// These are frozen inputs from before the studio redesign, not generated from index.html.
for (const path of protectedFiles) {
  test(`protected demo asset is byte-for-byte unchanged: ${path}`, () => {
    assert.match(manifest[path] ?? '', /^[a-f0-9]{64}$/, `Missing baseline hash for ${path}`);
    assert.equal(hash(read(path)), manifest[path], `${path} differs from its saved baseline`);
  });
}

// Permit only the reviewed initialization-order fix, then verify every original byte.
function beforeRenderInitializationFix(source) {
  const changes = [
    ['\n  // Textures can finish while model loading yields; defer rendering until setup is complete.\n  let frame = 0, animating = false, active = true, audio = null;\n  let renderReady = false;\n', ''],
    ['  const buffers = new Map();', '  let frame = 0, animating = false, active = true, audio = null;\n  const buffers = new Map();'],
    ['    if (!renderReady || frame || !active) return;', '    if (frame || !active) return;'],
    ['  renderReady = true;\n  showLesson();', '  showLesson();'],
  ];
  for (const [current, original] of changes) {
    assert.equal(source.split(current).length, 2, 'The reviewed scheduler change must appear exactly once');
    source = source.replace(current, original);
  }
  return source;
}

test('SoundScope matches its frozen baseline except for the reviewed render initialization fix', () => {
  assert.equal(hash(beforeRenderInitializationFix(soundscope)), manifest['js/soundscope.js']);
});

test('a texture finishing during model loading waits for setup before scheduling a render', async () => {
  // Run the production callback and scheduler in their source order. The microtask
  // stands in for a texture completion while initLab is suspended on a model load.
  async function exercise(source) {
    const parts = [];
    for (const pattern of [/let frame = [^;]+;/, /let renderReady = false;/, /renderReady = true;/, /function requestRender\(\) \{[\s\S]*?\n  \}/]) {
      const match = source.match(pattern);
      if (match) parts.push({ at: match.index, code: match[0] });
    }
    const texture = source.match(/const texture = textures\.load\([^,]+, \(\) => \{([\s\S]*?)\n    \}\);/);
    assert.ok(texture, 'Production floor texture callback must be exercised');
    parts.push({ at: texture.index, code: `
      await new Promise((resolve, reject) => queueMicrotask(() => {
        try {
          ${texture[1]}
          assert.equal(frames.length, 0, 'No frame may use incomplete scene state');
          resolve();
        } catch (error) { reject(error); }
      }));
    ` });
    const frames = [];
    let renders = 0;
    const context = {
      assert, queueMicrotask, frames, root: { dataset: {} },
      requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
      render: () => { renders += 1; },
    };
    await runInNewContext(`(async () => {
      ${parts.sort((a, b) => a.at - b.at).map(part => part.code).join('\n')}
      requestRender(); requestRender();
      assert.equal(frames.length, 1, 'Ready requests coalesce into one frame');
      frames.shift()();
      active = false; requestRender();
      assert.equal(frames.length, 0, 'Inactive canvases remain paused');
      active = true; requestRender();
      assert.equal(frames.length, 1, 'Reactivation schedules a render');
      frames.shift()();
    })()`, context);
    assert.equal(renders, 2);
  }
  await assert.rejects(exercise(beforeRenderInitializationFix(soundscope)),
    error => error.name === 'ReferenceError' && /frame/.test(error.message));
  await exercise(soundscope);
});

function soundscopeArticle(html) {
  const match = html.match(/<article\b[^>]*\bid="soundscope"[^>]*>[\s\S]*?<\/article>/);
  assert.ok(match, 'SoundScope article must exist');
  return match[0];
}

test('SoundScope article preserves every word, control, and attribute from the classic snapshot', () => {
  assert.equal(soundscopeArticle(studio), soundscopeArticle(classic));
});

test('the SoundScope region still matches its frozen manifest fingerprint', () => {
  // The manifest was captured with Python read_text(), which normalizes CRLF to LF.
  const region = html => {
    const match = html.replace(/\r\n/g, '\n').match(/    <!-- SOUNDSCOPE -->([\s\S]*?)    <!-- GAZE ARM -->/);
    assert.ok(match, 'SoundScope preservation boundaries must remain present');
    return match[1];
  };
  assert.match(manifest.soundscope_article ?? '', /^[a-f0-9]{64}$/);
  assert.equal(hash(region(classic)), manifest.soundscope_article, 'Classic SoundScope snapshot changed');
  assert.equal(hash(region(studio)), manifest.soundscope_article, 'Studio SoundScope region changed');
});

test('original portfolio sections survive apart from the requested hobbies and responsibility edits', () => {
  // Original sections contain no nested sections. Exact source comparison also protects
  // links, media paths, captions, labels, and the demo DOM contracts inside each section.
  const sections = [...classic.replace(/\r\n/g, '\n').matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)];
  assert.equal(sections.length, 7, 'The frozen classic snapshot should contain seven sections');
  const candidate = studio.replace(/\r\n/g, '\n').replace(/^      <article class="hobby hobby--dogs"[\s\S]*?^      <\/article>\n/m, '');
  for (const [originalSection] of sections) {
    let section = originalSection;
    // These are the user's explicit November 14 changes, not a new baseline.
    // All project copy, demo DOM and other text remain compared byte-for-byte.
    section = section.replace('      <li><h4>IEEE · Senate · EOP</h4><p>As an Outreach Officer for NJIT\'s IEEE branch, I find industry speakers for our students. I also represent more than 200 computer engineering students in the Student Senate, and through the Educational Opportunity Program I taught 50 incoming students mathematics, physics, English and Python.</p></li>\n', '');
    section = section.replace('          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>', '          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>\n          <p>People ask why my calves are so big when I do not go to the gym. I tell them there are plenty of things to run away from in Uganda.</p>');
    section = section.replace('I enjoy cooking and experimenting with different preparations.', 'I particularly enjoy making chapatis and Ugandan food. I am also generally a pretty good cook, provided I have not burned the food.');
    const label = section.match(/^<section[^>]*>/)[0];
    assert.ok(candidate.includes(section), `Unrequested section change or missing content: ${label}`);
  }
  assert.ok(studio.includes('<h2>Responsibilities</h2>'));
  assert.ok(studio.includes('I represent more than 200 computer engineering students in the Student Senate.'));
  assert.ok(studio.includes('Through EOP, I taught 50 incoming students mathematics, physics, English and Python.'));
  assert.ok(studio.includes('I have a lot of dogs back home in Uganda, and I enjoy spending time with them.'));
});

test('original demo IDs remain unique and available for selectors and deep links', () => {
  const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const oldIds = ids(classic);
  const newIds = ids(studio);
  assert.equal(new Set(newIds).size, newIds.length, 'Duplicate IDs can break demo selectors');
  for (const id of oldIds) {
    assert.equal(newIds.filter(value => value === id).length, 1, `Original ID #${id} must survive exactly once`);
  }
  for (const id of ['pick', 'pick-canvas', 'soundscope', 'soundscope-lab', 'ss-room', 'ss-feed', 'demo-zone', 'demo-gesture', 'demo-optics', 'einchat-input']) {
    assert.ok(oldIds.includes(id), `Frozen snapshot is missing required demo ID #${id}`);
  }
});

test('the original demo scripts and Three.js import map remain wired into the studio page', () => {
  const scripts = [...classic.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g)].map(match => match[0]);
  assert.equal(scripts.length, 5, 'The classic snapshot should load five demo/support scripts');
  for (const script of scripts) {
    if (script.includes('src="js/pick.js"')) {
      const shell = readFileSync(new URL('../js/studio-shell.js', import.meta.url), 'utf8');
      assert.ok(shell.includes("import('./pick.js')"), 'Original picking demo must still load on demand');
      continue;
    }
    // Asset versions can change to invalidate an old cached renderer after the startup fix.
    const withoutVersion = text => text.replace(/(src="[^"?]+)\?[^"\s]+/g, '$1');
    assert.ok(withoutVersion(studio).includes(withoutVersion(script)), `Missing original script element: ${script}`);
  }
  const importMap = classic.match(/<script\b[^>]*type="importmap"[^>]*>[\s\S]*?<\/script>/)?.[0];
  assert.ok(importMap, 'Classic snapshot must declare its Three.js import map');
  assert.ok(studio.includes(importMap), 'Three.js import map must be preserved');
});
