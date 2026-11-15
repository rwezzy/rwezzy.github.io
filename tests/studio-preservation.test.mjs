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

// Explicitly approved user media and its supplied credits, not a regenerated
// baseline or a general HTML filter. Other changes reach the frozen checks.
const approvedMedia = {
  portrait: {
    current: '      <figure class="portrait s-personal-photo"><img src="assets/personal/keith-portrait.webp" alt="Keith in a striped shirt, sitting in sunlight" width="640" height="800" decoding="async"></figure>\n',
    original: '      <figure class="slot portrait" data-src="images/me.jpg" data-caption=""></figure>\n',
  },
  workspace: {
    current: `    <figure class="s-personal-photo s-workspace-photo">
      <a href="assets/personal/robotics-desk.webp" target="_blank" rel="noopener"><img src="assets/personal/robotics-desk.webp" alt="My desk by the window, with the robot arm, SoundScope hardware, laptop and bench power supply" width="1600" height="1200" loading="lazy" decoding="async"></a>
      <figcaption>My desk, with a few projects sharing the space.</figcaption>
    </figure>
`,
  },
  soundscope: {
    current: `      <div class="s-photo-gallery s-soundscope-photos" aria-label="SoundScope prototype photos">
        <figure class="s-personal-photo">
          <a href="assets/personal/soundscope-video-hardware.webp" target="_blank" rel="noopener"><img src="assets/personal/soundscope-video-hardware.webp" alt="SoundScope microphone array and depth camera in the printed carrier, on a tripod beside the laptop" width="1080" height="1260" loading="lazy" decoding="async"></a>
          <figcaption>The assembled prototype on my desk.</figcaption>
        </figure>
        <figure class="s-personal-photo">
          <a href="assets/personal/soundscope-video-live-app.webp" target="_blank" rel="noopener"><img src="assets/personal/soundscope-video-live-app.webp" alt="SoundScope running on the laptop, with its camera feed, heatmap and tentative annotations" width="1080" height="920" loading="lazy" decoding="async"></a>
          <figcaption>The camera feed and heatmap in the physical prototype's app. Still from a demo recording.</figcaption>
        </figure>
      </div>

`,
  },
  viam: {
    current: `      <div class="s-photo-gallery s-event-photos" aria-label="IEEE NJIT at Viam">
        <figure class="s-personal-photo">
          <a href="assets/personal/viam-education.webp" target="_blank" rel="noopener"><img src="assets/personal/viam-education.webp" alt="Four of us posing together at Viam" width="1600" height="1066" loading="lazy" decoding="async"></a>
          <figcaption>At Viam with fellow organizers and the education team.</figcaption>
        </figure>
        <figure class="s-personal-photo">
          <a href="assets/personal/viam-group.webp" target="_blank" rel="noopener"><img src="assets/personal/viam-group.webp" alt="Our group selfie outside Viam after the event" width="1600" height="1200" loading="lazy" decoding="async"></a>
          <figcaption>One more photo before heading home.</figcaption>
        </figure>
      </div>
`,
  },
  running: {
    current: `      <article class="hobby hobby--running">
        <figure class="s-personal-photo s-running-badge"><img src="assets/personal/running-10k.webp" alt="A Strava 10K record: 49 minutes 41 seconds, at 8 minutes per mile" width="450" height="500" loading="lazy" decoding="async"></figure>
`,
    original: `      <article class="hobby">
        <img src="assets/running.jpg" alt="A runner on a forest trail" loading="lazy">
`,
  },
  runHistory: {
    current: `          <details class="s-run-history">
            <summary>A few runs along the way <span aria-hidden="true">＋</span></summary>
            <div class="s-run-snapshots">
              <figure class="s-personal-photo"><a href="assets/personal/running-7-mile.webp" target="_blank" rel="noopener"><img src="assets/personal/running-7-mile.webp" alt="Strava activity showing 7.39 miles at 10:03 per mile and a route through Newark" width="900" height="1048" loading="lazy" decoding="async"></a><figcaption>7.39 mi · 10:03 / mi</figcaption></figure>
              <figure class="s-personal-photo"><a href="assets/personal/running-6-mile.webp" target="_blank" rel="noopener"><img src="assets/personal/running-6-mile.webp" alt="Strava activity showing 6.25 miles in 55:10, at 8:49 per mile" width="900" height="1065" loading="lazy" decoding="async"></a><figcaption>6.25 mi · 55:10</figcaption></figure>
              <figure class="s-personal-photo"><a href="assets/personal/running-september.webp" target="_blank" rel="noopener"><img src="assets/personal/running-september.webp" alt="September 22 Strava activity showing 6.31 miles in 49:21, at 7:49 per mile" width="900" height="922" loading="lazy" decoding="async"></a><figcaption>22 Sept 2026 · 6.31 mi · 49:21</figcaption></figure>
            </div>
          </details>
`,
  },
  cooking: {
    current: '        <img src="assets/personal/chapati.webp" alt="One of my chapatis browning in the pan" width="1600" height="1200" loading="lazy" decoding="async">\n',
    original: '        <img src="assets/cooking.jpg" alt="A pot steaming on a stove" loading="lazy">\n',
  },
  urbanArborCredit: {
    current: '        <p>I worked on Urban Arbor with Sai, Paul, John, Chisom, Selihom, Matthew and Kaya, alongside Aiko, the founder of Pro Bono.</p>\n',
  },
  urbanArborPhotos: {
    current: `      <div class="arbor__photos s-photo-gallery" aria-label="Urban Arbor planting and donation days">
        <figure class="s-personal-photo">
          <a href="assets/urban-arbor/team.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/team.webp" alt="Our volunteer team gathered on painted tires beneath a tree" width="1080" height="810" loading="lazy" decoding="async"></a>
          <figcaption>The team on planting day.</figcaption>
        </figure>
        <figure class="s-personal-photo">
          <a href="assets/urban-arbor/donation-day.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/donation-day.webp" alt="Volunteers, students and staff gathered with the donated equipment" width="1024" height="768" loading="lazy" decoding="async"></a>
          <figcaption>Together on donation day.</figcaption>
        </figure>
        <figure class="s-personal-photo">
          <a href="assets/urban-arbor/planting.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/planting.webp" alt="Volunteers planting and watering a young tree in the school grounds" width="960" height="1280" loading="lazy" decoding="async"></a>
          <figcaption>Planting and watering a young tree at KSPH.</figcaption>
        </figure>
        <figure class="s-personal-photo">
          <a href="assets/urban-arbor/equipment.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/equipment.webp" alt="Green barrels, a handwashing stand, chairs, baskets and watering cans arranged indoors" width="768" height="1024" loading="lazy" decoding="async"></a>
          <figcaption>Some of the equipment we donated.</figcaption>
        </figure>
      </div>
      <details class="s-arbor-more">
        <summary>More from both days <span aria-hidden="true">＋</span></summary>
        <div class="s-photo-gallery">
          <figure class="s-personal-photo">
            <a href="assets/urban-arbor/picnic.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/picnic.webp" alt="Volunteers preparing food on an outdoor table beneath the trees" width="768" height="1024" loading="lazy" decoding="async"></a>
            <figcaption>Getting the picnic ready after planting.</figcaption>
          </figure>
          <figure class="s-personal-photo">
            <a href="assets/urban-arbor/presentation.webp" target="_blank" rel="noopener"><img src="assets/urban-arbor/presentation.webp" alt="The volunteer team presenting the donated equipment to students and staff" width="1024" height="768" loading="lazy" decoding="async"></a>
            <figcaption>Sharing the equipment with the school.</figcaption>
          </figure>
        </div>
      </details>
`,
    original: `      <div class="arbor__photos">
        <figure class="slot" data-src="images/urban-arbor-1.jpg" data-caption="Planting day at KSPH"></figure>
        <figure class="slot" data-src="images/urban-arbor-2.jpg" data-caption="The donated equipment"></figure>
      </div>
`,
  },
  makingStridesPhoto: {
    current: `        <figure class="s-personal-photo s-service-photo">
          <a href="assets/personal/making-strides-volunteer.webp" target="_blank" rel="noopener"><img src="assets/personal/making-strides-volunteer.webp" alt="Me volunteering at Making Strides, wearing my volunteer badge and holding a pink direction sign" width="1600" height="1200" loading="lazy" decoding="async"></a>
          <figcaption>Volunteering at Making Strides Against Breast Cancer.</figcaption>
        </figure>
`,
  },
};

function beforeApprovedMedia(source, names = Object.keys(approvedMedia)) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  for (const name of names) {
    const { current, original = '' } = approvedMedia[name];
    const expected = current.replace(/\n/g, lineEnding);
    assert.equal(source.split(expected).length, 2, `Approved ${name} media must appear exactly once and match its reviewed markup`);
    source = source.replace(expected, original.replace(/\n/g, lineEnding));
  }
  return source;
}

test('SoundScope preserves every original word, control, and attribute apart from its approved photo gallery', () => {
  assert.equal(soundscopeArticle(beforeApprovedMedia(studio, ['soundscope'])), soundscopeArticle(classic));
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
  assert.equal(hash(region(beforeApprovedMedia(studio, ['soundscope']))), manifest.soundscope_article, 'Original Studio SoundScope region changed outside the approved gallery');
});

test('original portfolio sections survive apart from the requested personal content and responsibility edits', () => {
  // Original sections contain no nested sections. Exact source comparison also protects
  // links, media paths, captions, labels, and the demo DOM contracts inside each section.
  const sections = [...classic.replace(/\r\n/g, '\n').matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)];
  assert.equal(sections.length, 7, 'The frozen classic snapshot should contain seven sections');
  const candidate = beforeApprovedMedia(studio).replace(/\r\n/g, '\n')
    .replace(/^      <article class="hobby hobby--pets" id="interest-dogs">[\s\S]*?^      <\/article>\n/m, '')
    .replace('      <p class="intro__lede">Currently looking for someone to peer pressure me into starting pickleball.</p>\n', '')
    .replace('    <p class="service-intro">I continue to volunteer in New Jersey, including park cleanups, community event support and the Making Strides Breast Cancer Awareness Walk.</p>\n', '')
    .replace(/^      <li id="service-(?:nrhh|st-patricks|making-strides)">[\s\S]*?^      <\/li>\n/gm, '');
  for (const [originalSection] of sections) {
    let section = originalSection;
    // These are the user's explicit November 14 changes, not a new baseline.
    // All project copy, demo DOM and other text remain compared byte-for-byte.
    section = section.replace('      <li><h4>IEEE · Senate · EOP</h4><p>As an Outreach Officer for NJIT\'s IEEE branch, I find industry speakers for our students. I also represent more than 200 computer engineering students in the Student Senate, and through the Educational Opportunity Program I taught 50 incoming students mathematics, physics, English and Python.</p></li>\n', '');
    section = section.replace('          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>', '          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>\n          <p>“How did your calves get so big?”<br>“A decade of trying to reach the top shelf.”</p>');
    section = section.replace('I enjoy cooking and experimenting with different preparations.', "I like cooking chapatis and Ugandan cuisine, but I'm also generally a pretty good cook when I'm not burning the food.");
    section = section.replace('          <p>I have written stories since I was six, and I am now developing a fictional universe of my own.</p>', `          <p>When my thoughts aren't haunting me, I'm turning them into fiction. I now have a pretty haunting repertoire of emotionally damaged characters and love-bound protagonists.</p>
          <p>I share these fun little stories with family and friends (whose characters have not yet made their way into my fiction). I do write children's stories though, and I hope to one day publish them.</p>`);
    const label = section.match(/^<section[^>]*>/)[0];
    assert.ok(candidate.includes(section), `Unrequested section change or missing content: ${label}`);
  }
  assert.ok(studio.includes('<h2>Responsibilities</h2>'));
  assert.ok(studio.includes('I represent more than 300 computer engineering students in the Student Senate.'));
  assert.ok(studio.includes('Through EOP, I taught 50 incoming students mathematics, physics, English and Python.'));
  assert.ok(studio.includes('<article class="hobby hobby--pets" id="interest-dogs">'));
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
