import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('tests/studio-preservation.json').toString('utf8'));
const classic = read('classic.html').toString('utf8').replace(/\r\n/g, '\n');
// Only the explicitly requested editorial changes are normalized; demo contracts,
// untouched content and the original frozen fixtures remain independently checked.
const reviewedEdits = JSON.parse(read('tests/fixtures/editorial-revision.json'));
let studio = read('index.html').toString('utf8').replace(/\r\n/g, '\n');
// The supplied bookshelf/exam photos and full-width interest layout are a later,
// explicitly requested revision. Restore only these exact bounded fragments
// before checking the earlier editorial changes and untouched classic content.
const personalInterestEdits = JSON.parse(read('tests/fixtures/personal-interests-revision.json'));
for (const { before, after } of personalInterestEdits) {
  assert.equal(studio.split(after).length, 2, 'Approved personal-interest fragment must remain unique');
  studio = studio.replace(after, before);
}
for (const { before, after } of [...reviewedEdits].reverse()) {
  if (!after) { // A removed lede had a unique position between status and narrative.
    const marker = '        <p>A ringing phone';
    assert.equal(studio.split(marker).length, 2);
    studio = studio.replace(marker, before + marker);
  } else {
    assert.equal(studio.split(after).length, 2, 'Reviewed editorial fragment must remain unique');
    studio = studio.replace(after, before);
  }
}

const soundscope = read('js/soundscope.js').toString('utf8');
const protectedFiles = [
  'js/soundscope-room.js', 'js/soundscope-describe.js',
  'js/soundscope-hardware.js', 'js/pick.js', 'css/soundscope.css',
];

// These are frozen inputs from before the studio redesign, not generated from index.html.
for (const path of protectedFiles) {
  test(`protected demo asset is byte-for-byte unchanged: ${path}`, () => {
    assert.match(manifest[path] ?? '', /^[a-f0-9]{64}$/, `Missing baseline hash for ${path}`);
    assert.equal(hash(read(path)), manifest[path], `${path} differs from its saved baseline`);
  });
}

// Restore only the approved Studio text palette, preserving the frozen demo bytes.
test('legacy gesture demo is preserved apart from Studio contrast and the new demo routing guard', () => {
  let source = read('js/demos.js').toString('utf8');
  source = source.replace("if (el.id === 'demo-zone' && window.portfolioGraphics) return window.portfolioGraphics.defer(el.querySelector('.demo__video'), fn, { label: 'Load video analysis', detail: 'Runs object detection on this device. Loading may take a moment.' }); ", '');
  const routingGuard = "    if (root.hasAttribute('data-living-room')) return; // Studio uses the simulated living-room interaction.\n";
  const ending = source.includes('\r\n') ? '\r\n' : '\n';
  assert.equal(source.split(routingGuard.replace(/\n/g, ending)).length, 2);
  source = source.replace(routingGuard.replace(/\n/g, ending), '');
  const palette = "    // Keep canvas and inline status text legible on Studio's light instrument panel.\r\n    const gestureText = document.body.classList.contains('studio-site')\r\n      ? { muted: '#626854', accent: '#704b72' }\r\n      : { muted: C.ink3, accent: C.hw };\r\n";
  const changes = [
    [palette, ''],
    ['anomaly.style.color = odd ? gestureText.accent : gestureText.muted;', 'anomaly.style.color = odd ? C.hw : C.ink3;'],
    ["text(ctx, 'press and draw here', w / 2, h / 2, gestureText.muted, 12, 'center')", "text(ctx, 'press and draw here', w / 2, h / 2, C.ink3, 12, 'center')"],
    ['12, 22, gestureText.accent, 13);', '12, 22, C.hw, 13);'],
  ];
  for (const [current, original] of changes) {
    const expected = current.replace(/\r?\n/g, ending);
    assert.equal(source.split(expected).length, 2, 'Each approved text contrast change must occur exactly once');
    source = source.replace(expected, original);
  }
  assert.equal(hash(source.replace(/\r?\n/g, '\r\n')), manifest['js/demos.js'], 'Gesture behavior and classic colors must match the original demo');
});

test('SoundScope preserves its audio, interaction, and placement logic while the room is modernized', () => {
  const source = soundscope.replace(/\r\n/g, '\n');
  // These bounded fingerprints were independently captured from pre-change HEAD,
  // not the revised renderer. The original frozen manifest remains untouched.
  const regions = [
    ['  // ------------------------------------------------------------------- audio', null, 'f9a274d4146c4116d3b6fb3f7a161cc4a701b3f0f1e133f02151c7f4c876cf9b'],
    ['  const restingHeight =', '  // The laptop', '7dc2661bcafcd2784be664e0f60abcf92e594956ce33145872465488b7b0505e'],
  ];
  for (const [start, end, expected] of regions) {
    assert.equal(source.split(start).length, 2, `Protected region must have a unique start: ${start}`);
    if (end) assert.equal(source.split(end).length, 2, `Protected region must have a unique end: ${end}`);
    const from = source.indexOf(start), to = end ? source.indexOf(end) : source.length;
    assert.ok(to > from, 'Protected region boundaries must remain ordered');
    assert.equal(hash(source.slice(from, to)), expected, `Nonvisual SoundScope logic changed: ${start}`);
  }
});

test('SoundScope rendering waits for setup, coalesces requests, and pauses when inactive', async () => {
  // Exercise the actual scheduler around a model-loading yield. Modern props no
  // longer have the old floor texture callback, but early render requests still
  // must not reach an incomplete scene.
  async function exercise(source) {
    source = source.replace(/\r\n/g, '\n');
    const extract = pattern => {
      const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
      assert.equal(matches.length, 1, `Production scheduler part must appear exactly once: ${pattern}`);
      return matches[0];
    };
    const state = extract(/let frame = [^;]+;/);
    const unready = extract(/let renderReady = false;/);
    const ready = extract(/renderReady = true;/);
    const scheduler = extract(/function requestRender\(\) \{[\s\S]*?\n  \}/);
    const modelYield = extract(/const carrier = await loadCarrier\(\);/);
    assert.ok(state.index < modelYield.index && unready.index < modelYield.index, 'Scheduler state must exist before asynchronous model loading');
    assert.ok(ready.index > scheduler.index && ready.index > modelYield.index, 'Rendering becomes ready only after scene and scheduler setup');
    const frames = [];
    let renders = 0;
    const context = {
      assert, queueMicrotask, frames,
      requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
      render: () => { renders += 1; },
    };
    await runInNewContext(`(async () => {
      ${state[0]}
      ${unready[0]}
      ${scheduler[0]}
      await new Promise((resolve, reject) => queueMicrotask(() => {
        try {
          requestRender();
          assert.equal(frames.length, 0, 'No frame may use incomplete scene state');
          resolve();
        } catch (error) { reject(error); }
      }));
      ${ready[0]}
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
  await assert.rejects(exercise(soundscope.replace('!renderReady || ', '')),
    error => error.name === 'AssertionError' && /incomplete scene state/.test(error.message),
    'The fixture must catch removal of the initialization guard');
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
        <figure class="s-personal-photo s-running-badge"><img src="assets/personal/running-10k-metric.webp" alt="A Strava 10K record: 49 minutes 41 seconds, at 4 minutes 58 seconds per kilometre" width="450" height="500" loading="lazy" decoding="async"></figure>
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
  springReinsSummary: {
    current: 'helping with a spring cleanup at Spring Reins of Hope',
    original: 'caring for therapy animals at Spring Reins of Hope',
  },
  springReins: {
    current: `      <li id="service-spring-reins" class="s-service-feature">
        <div>
          <h4>Spring Reins of Hope</h4>
          <p class="service-hours mono">Spring cleanup</p>
          <p>I volunteered for a spring cleanup at Spring Reins of Hope, helping clear the grounds and animal enclosures with the other volunteers.</p>
          <p>Spring Reins of Hope &amp; Growth offers equine-assisted psychotherapy and learning: activities with horses that support mental health, personal growth and skills such as communication and teamwork.</p>
          <p><a href="https://www.springreinsofhope.com/about-us" target="_blank" rel="noopener">About Spring Reins of Hope ↗</a></p>
        </div>
        <figure class="s-personal-photo s-service-photo">
          <a href="assets/spring-reins/team.webp" target="_blank" rel="noopener"><img src="assets/spring-reins/team.webp" alt="Our volunteer group at Spring Reins of Hope, with a horse in the background" width="1591" height="1080" loading="lazy" decoding="async"></a>
          <figcaption>The spring cleanup team.</figcaption>
        </figure>
        <details class="s-service-more">
          <summary>Photos and video from the cleanup <span aria-hidden="true">＋</span></summary>
          <div class="s-cleanup-gallery">
            <figure class="s-personal-photo">
              <a href="assets/spring-reins/cleanup.webp" target="_blank" rel="noopener"><img src="assets/spring-reins/cleanup.webp" alt="Emptying a tub of cleared bedding into a trailer during the spring cleanup" width="739" height="1600" loading="lazy" decoding="async"></a>
              <figcaption>Clearing out the animal enclosures.</figcaption>
            </figure>
            <figure class="s-personal-photo">
              <a href="assets/spring-reins/briefing.webp" target="_blank" rel="noopener"><img src="assets/spring-reins/briefing.webp" alt="Volunteers gathered for a briefing outside the barn, with goats nearby" width="900" height="1600" loading="lazy" decoding="async"></a>
              <figcaption>A briefing with the team.</figcaption>
            </figure>
            <figure class="s-personal-photo">
              <video controls muted playsinline preload="none" poster="assets/spring-reins/cleanup-poster.webp" width="392" height="848" aria-label="Spring cleanup at Spring Reins of Hope, raking an outdoor enclosure">
                <source src="assets/spring-reins/cleanup.mp4" type="video/mp4">
                <a href="assets/spring-reins/cleanup.mp4">Watch the spring cleanup video</a>.
              </video>
              <figcaption>Raking the enclosure. A short clip from the day.</figcaption>
            </figure>
          </div>
        </details>
      </li>
`,
  },
  seniorTech: {
    current: `      <li id="service-senior-tech" class="s-service-wide">
        <h4>Technology help for senior citizens</h4>
        <p class="service-hours mono">Device support</p>
        <p>I volunteered to teach senior citizens how to use their phones and other gadgets.</p>
        <div class="s-photo-gallery s-senior-gallery" aria-label="Senior technology support volunteering">
          <figure class="s-personal-photo">
            <a href="assets/senior-tech/teaching.webp" target="_blank" rel="noopener"><img src="assets/senior-tech/teaching.webp" alt="Helping a participant use a phone at a table during the technology support session" width="1600" height="739" loading="lazy" decoding="async"></a>
            <figcaption>Working through a phone together.</figcaption>
          </figure>
          <figure class="s-personal-photo">
            <a href="assets/senior-tech/group.webp" target="_blank" rel="noopener"><img src="assets/senior-tech/group.webp" alt="Volunteers and participants posing together at the technology support session" width="1600" height="739" loading="lazy" decoding="async"></a>
            <figcaption>The volunteers and participants together.</figcaption>
          </figure>
        </div>
        <details class="s-service-more">
          <summary>One more from the day <span aria-hidden="true">＋</span></summary>
          <figure class="s-personal-photo s-service-selfie">
            <a href="assets/senior-tech/selfie.webp" target="_blank" rel="noopener"><img src="assets/senior-tech/selfie.webp" alt="A group selfie with volunteers and participants at the technology support session" width="1600" height="1200" loading="lazy" decoding="async"></a>
            <figcaption>A group selfie from the day.</figcaption>
          </figure>
        </details>
      </li>
`,
  },
  alternativeSpringBreak: {
    current: `      <li id="service-alternative-spring-break" class="s-service-feature">
        <div>
          <h4>Alternative spring break</h4>
          <p class="service-hours mono">Camp Hoover · Greater Newark Conservancy</p>
          <p>I volunteered with a group to clean up Camp Hoover and also spent time gardening at the Greater Newark Conservancy.</p>
          <p>Working with people I had never met before helped me become a better communicator and teammate. Learning about gardening also gave me new ideas to bring back home to Uganda and into my work as an engineer.</p>
        </div>
        <figure class="s-personal-photo s-service-photo">
          <a href="assets/alternative-spring-break/camp-team.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/camp-team.webp" alt="Our alternative spring break group gathered by the lake at Camp Hoover" width="1600" height="983" loading="lazy" decoding="async"></a>
          <figcaption>The Camp Hoover crew.</figcaption>
        </figure>
        <details class="s-service-more s-spring-reflection">
          <summary>Read my journal entry <span aria-hidden="true">＋</span></summary>
          <div class="s-service-journal">
            <p>During the Camp Hoover portion of alternative spring break, I met so many new people, as I did not know anybody in my crew. On my bus ride to the location, I hardly spoke with anybody and dreaded the thought of working with all these strangers. I am grateful that this attitude did not carry over into my participation in the various tasks we did throughout the day. I spent hours teaming up with one new person after another to achieve a common goal, gaining a sense of camaraderie along the way.</p>
            <p>I learned how to talk to strangers. This skill would transfer to other activities I engaged in throughout the semester, from volunteering to my Senate duties. Beyond that, I learned how to inspire and borrow motivation from the people I work with. It was an especially useful skill to develop through the hours of work that we undertook.</p>
            <p>Besides Camp Hoover, I also volunteered at the Greater Newark Conservancy. In addition to developing my growing interpersonal skills, this experience required me to learn new technical gardening skills. I was not thoroughly educated on hydroponic farming, and I still have questions, but I now recognize it as a venture I could implement back home in my country, Uganda, where access to water for irrigation tends to be scarce in certain communities.</p>
            <p>It was educational to plant different crops. I learned from the caretakers that they offered more than just aesthetic value: they contributed to the ecosystem of the soil while simultaneously providing produce for human consumption. I found this inspirational—the ability to implement systems that span a vast number of benefits. I hope to transfer this synchronized interdependency into how I approach my professional and academic career as an engineer.</p>
            <p>These were memorable experiences that gave me the opportunity to grow as a person, a scholar, a problem solver and a leader during spring break, and I look forward to volunteering with each of these organizations again. The relationships I have made have offered me inspiration and professional development, and the undertakings I performed have broadened my perspective on what it means to be a positive influence in a society. I am grateful for such opportunities to grow.</p>
          </div>
        </details>
        <details class="s-service-more">
          <summary>More from alternative spring break <span aria-hidden="true">＋</span></summary>
          <div class="s-photo-gallery">
            <figure class="s-personal-photo">
              <a href="assets/alternative-spring-break/cabin-cleanup.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/cabin-cleanup.webp" alt="Cleaning a bunk mattress inside a wooden cabin at Camp Hoover" width="1200" height="1600" loading="lazy" decoding="async"></a>
              <figcaption>Cleaning the cabins.</figcaption>
            </figure>
            <figure class="s-personal-photo">
              <a href="assets/alternative-spring-break/outdoor-team.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/outdoor-team.webp" alt="Five volunteers together outdoors with a rake during the camp cleanup" width="1200" height="1600" loading="lazy" decoding="async"></a>
              <figcaption>Outdoors with the cleanup crew.</figcaption>
            </figure>
            <figure class="s-personal-photo">
              <a href="assets/alternative-spring-break/crew-cart.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/crew-cart.webp" alt="Volunteers gathered around a utility cart carrying cleaning equipment" width="1600" height="1200" loading="lazy" decoding="async"></a>
              <figcaption>The team and our cleaning supplies.</figcaption>
            </figure>
            <figure class="s-personal-photo">
              <a href="assets/alternative-spring-break/indoor-team.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/indoor-team.webp" alt="Our group in red volunteer shirts gathered inside the camp building" width="1600" height="1066" loading="lazy" decoding="async"></a>
              <figcaption>A moment together at camp.</figcaption>
            </figure>
            <figure class="s-personal-photo s-gallery-wide">
              <a href="assets/alternative-spring-break/volunteer-group.webp" target="_blank" rel="noopener"><img src="assets/alternative-spring-break/volunteer-group.webp" alt="A large group of alternative spring break volunteers posing together indoors" width="1600" height="739" loading="lazy" decoding="async"></a>
              <figcaption>Alternative spring break volunteers.</figcaption>
            </figure>
          </div>
        </details>
      </li>
`,
  },
  ngambaIsland: {
    current: `      <li id="service-ngamba-island" class="s-service-feature s-ngamba-feature">
        <div>
          <h4>Ngamba Island, 2022</h4>
          <p class="service-hours mono">Chimpanzee care · Enrichment preparation</p>
          <p>During high school, I volunteered at the Ngamba Island chimpanzee sanctuary on Lake Victoria, where I helped feed the rescued chimpanzees, clean their habitats and prepare enrichment activities.</p>
          <p>Ngamba Island provides a home for orphaned and rescued chimpanzees in Uganda. Chimpanzee Trust manages the sanctuary, providing ongoing care, food, veterinary support and enrichment. <a href="https://chimpanzeetrust.org/sanctuary-welfare/" target="_blank" rel="noopener">About the sanctuary ↗</a></p>
          <p>In the clip, I am the one in the pink patterned shirt preparing a food puzzle. We placed food at the bottom of a cylinder, with the idea that the chimpanzees would use materials from their environment as tools to retrieve it.</p>
          <p>Feeding puzzles are a form of enrichment: they encourage natural behaviours such as foraging and give the chimpanzees opportunities to explore and solve problems while finding food. <a href="https://www.pasa.org/post/primate-enrichment-at-pasa-wildlife-centers" target="_blank" rel="noopener">How enrichment works ↗</a></p>
          <div class="s-ngamba-highlights" aria-label="More from Ngamba Island">
            <a class="s-ngamba-tile" href="assets/ngamba-island/sanctuary-chimpanzees.mp4" data-gallery-item="ngamba-island-sanctuary-chimpanzees" aria-label="Watch the chimpanzees at the sanctuary">
              <span class="s-ngamba-preview"><img src="assets/ngamba-island/sanctuary-poster.webp" alt="Chimpanzees in the sanctuary enclosure" width="368" height="736" loading="lazy" decoding="async"><span class="s-ngamba-play" aria-hidden="true">▶</span></span>
              <span>At the sanctuary <small>Silent clip</small></span>
            </a>
            <a class="s-ngamba-tile" href="assets/ngamba-island/enrichment-team.webp" data-gallery-item="ngamba-island-enrichment-team" aria-label="View the enrichment preparation team">
              <span class="s-ngamba-preview"><img src="assets/ngamba-island/enrichment-team.webp" alt="Our group preparing food and enrichment cylinders around a table" width="1080" height="720" loading="lazy" decoding="async"></span>
              <span>Preparing together <small>Ngamba Island, 2022</small></span>
            </a>
            <a class="s-ngamba-tile s-ngamba-more" href="assets/ngamba-island/sanctuary-group.webp" data-gallery-category="Ngamba Island" aria-label="Open all Ngamba Island pictures">
              <span aria-hidden="true">＋</span><strong>More pictures</strong><small>Open the Ngamba gallery ↗</small>
            </a>
          </div>
        </div>
        <figure class="s-personal-photo s-portrait-media s-service-photo">
          <video controls muted playsinline preload="none" poster="assets/ngamba-island/enrichment-poster.webp?v=24" width="480" height="848" aria-label="Me in a pink patterned shirt preparing a food puzzle for the chimpanzees at Ngamba Island">
            <source src="assets/ngamba-island/enrichment-preparation.mp4?v=2" type="video/mp4">
            <a href="assets/ngamba-island/enrichment-preparation.mp4?v=2">Watch the enrichment preparation clip</a>.
          </video>
          <figcaption>Preparing enrichment for the chimpanzees.</figcaption>
        </figure>
        <figure class="s-personal-photo s-ngamba-lake">
          <a href="assets/ngamba-island/lake-sunset.webp" data-gallery-item="ngamba-island-lake-sunset"><img src="assets/ngamba-island/lake-sunset.webp" alt="Soft evening colours above Lake Victoria" width="1600" height="1068" loading="lazy" decoding="async"></a>
          <figcaption>Evening on Lake Victoria.</figcaption>
        </figure>
      </li>
`,
    original: '      <li><h4>Ngamba Island, 2022</h4><p>During high school, I volunteered at the Ngamba Island chimpanzee sanctuary on Lake Victoria, where I helped feed the rescued chimpanzees, clean their habitats and prepare enrichment activities.</p><figure class="slot" data-src="images/ngamba.jpg" data-caption="Ngamba Island"></figure></li>\n',
  },
  eopClassPhoto: {
    current: `        <figure class="s-personal-photo">
          <a href="assets/personal/eop-english-class-2025.webp" target="_blank" rel="noopener"><img src="assets/personal/eop-english-class-2025.webp" alt="Our 2025 EOP English class gathered in the hallway on the last day" width="1600" height="1492" loading="lazy" decoding="async"></a>
          <figcaption>Last day of our 2025 EOP English class.</figcaption>
        </figure>
`,
  },
  gazeWinnerPhoto: {
    current: `        <figure class="s-personal-photo s-gaze-winner-photo">
          <a href="assets/personal/viam-winner-robot.webp" target="_blank" rel="noopener"><img src="assets/personal/viam-winner-robot.webp" alt="Beside the robot arm at Viam, with our hackathon winner medals" width="1200" height="1600" loading="lazy" decoding="async"></a>
          <figcaption>Our winner medals, with the robot we built Gaze Arm around.</figcaption>
        </figure>
`,
    original: '        <figure class="slot" data-src="images/gaze-arm-1.jpg" data-caption="The xArm6 at the Viam hackathon"></figure>\n',
  },
  gazeMemories: {
    current: `      <details class="s-service-more s-gaze-memories">
        <summary>Celebrating the win <span aria-hidden="true">＋</span></summary>
        <figure class="s-personal-photo">
          <a href="assets/personal/viam-hackathon-win.webp" target="_blank" rel="noopener"><img src="assets/personal/viam-hackathon-win.webp" alt="A group selfie at Viam after the hackathon win, with winner medals on display" width="1600" height="1200" loading="lazy" decoding="async"></a>
          <figcaption>Celebrating after the Viam hackathon.</figcaption>
        </figure>
      </details>
`,
  },
};

function beforeApprovedMedia(source, names = Object.keys(approvedMedia)) {
  source = source.replaceAll('<a href="https://en.wikipedia.org/wiki/Lake_Victoria" target="_blank" rel="noopener">Lake Victoria</a>', 'Lake Victoria');
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  for (const name of names) {
    const { current, original = '' } = approvedMedia[name];
    const expected = current.replace(/\n/g, lineEnding);
    assert.equal(source.split(expected).length, 2, `Approved ${name} media must appear exactly once and match its reviewed markup`);
    source = source.replace(expected, original.replace(/\n/g, lineEnding));
  }
  return source;
}

function beforeApprovedSpeakerCopy(source) {
  const changes = [
    ['Selecting the alarm clock, kettle, portable speaker or television plays its sound:', 'Selecting the alarm clock, kettle, boombox or television plays its sound:'],
    ['drag the alarm clock, kettle, portable speaker or television to move them;', 'drag the alarm clock, kettle, boombox or television to move them;'],
    ['<button type="button" class="pill" data-source="boombox">Play the portable speaker</button>', '<button type="button" class="pill" data-source="boombox">Play the boombox</button>'],
  ];
  for (const [current, original] of changes) {
    assert.equal(source.split(current).length, 2, 'Each approved portable speaker label must occur exactly once');
    source = source.replace(current, original);
  }
  return source;
}

function beforeApprovedOmniRingDemo(source) {
  const ending = source.includes('\r\n') ? '\r\n' : '\n';
  const originalPattern = /^        <div class="demo" id="demo-gesture">[\s\S]*?(?=^        <figure class="slot" data-src="images\/omniring-1\.jpg")/gm;
  const currentPattern = /^        <div class="demo or-demo" id="demo-gesture" data-living-room>[\s\S]*?(?=^        <figure class="slot" data-src="images\/omniring-1\.jpg")/gm;
  const originals = [...classic.replace(/\r\n/g, '\n').matchAll(originalPattern)];
  const currents = [...source.replace(/\r\n/g, '\n').matchAll(currentPattern)];
  assert.equal(originals.length, 1, 'Classic gesture demo must have one bounded baseline');
  assert.equal(currents.length, 1, 'Simulated living room must occupy only the original demo slot');
  return source.replace(currents[0][0].replace(/\n/g, ending), originals[0][0].replace(/\n/g, ending));
}

test('SoundScope preserves every original word, control, and attribute apart from its approved gallery and speaker labels', () => {
  assert.equal(soundscopeArticle(beforeApprovedSpeakerCopy(beforeApprovedMedia(studio, ['soundscope']))), soundscopeArticle(classic));
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
  assert.equal(hash(region(beforeApprovedSpeakerCopy(beforeApprovedMedia(studio, ['soundscope'])))), manifest.soundscope_article, 'Original Studio SoundScope region changed outside the approved gallery and speaker labels');
});

function beforeApprovedInternshipCopy(source) {
  const changes = [
    ['<p class="s-home-description">Robotics, embedded systems <br>and machine learning.<br><a href="#contact" data-view="contact">Open to Summer 2027 internships ↗</a></p>', '<p class="s-home-description">Robotics, embedded systems <br>and machine learning.</p>'],
    ['<li><span class="dot dot--blue"></span> seeking Summer 2027 internships in robotics, embedded systems, and digital hardware design</li>', '<li><span class="dot dot--blue"></span> open to internships in computer architecture, digital design, embedded systems, and ML systems</li>'],
    ['<li class="path__next"><time class="mono">next</time><div><h4>Summer 2027 internships</h4><p>I am seeking Summer 2027 internships in robotics, embedded systems, and digital hardware design. <a href="#contact">Contact me.</a></p></div></li>', '<li class="path__next"><time class="mono">next</time><div><h4>Internship opportunities</h4><p>I am seeking an internship in computer architecture, digital design, embedded systems or machine learning systems. <a href="#contact">Contact me.</a></p></div></li>'],
    ['<p>I am seeking Summer 2027 internships in robotics, embedded systems, and digital hardware design. I would also be happy to discuss the implementation, limitations or further development of any of the projects described here.</p>', '<p>I am seeking internships in computer architecture, digital design, embedded systems and machine learning systems, where I can develop my technical understanding through practical work. I would also be happy to discuss the implementation, limitations or further development of any of the projects described here.</p>'],
  ];
  for (const [current, original] of changes) {
    assert.equal(source.split(current).length, 2, 'Each approved Summer 2027 internship edit must occur exactly once');
    source = source.replace(current, original);
  }
  return source;
}

function beforeApprovedAboutAndSenateCopy(source) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const changes = [
    // The portrait has already been restored by beforeApprovedMedia. Only the
    // repeated highlights beneath it are removed at the user's request.
    [`    <div class="intro__side">
      <figure class="slot portrait" data-src="images/me.jpg" data-caption=""></figure>
    </div>`, `    <div class="intro__side">
      <figure class="slot portrait" data-src="images/me.jpg" data-caption=""></figure>
      <ul class="facts">
        <li><b>1st</b> place, Viam robotics hackathon</li>
        <li><b>Dean's List</b>, Albert Dorman Honors College</li>
        <li><b>180+</b> students at the school supported by Urban Arbor</li>
      </ul>
    </div>`],
    ["<li><time class=\"mono\">Oct 2025</time><div><h4>Computer Engineering Senator</h4><p>I was elected to NJIT's Student Senate, where I represent over 200 computer engineering students.</p></div></li>", '<li><time class="mono">Oct 2025</time><div><h4>Student Senator</h4><p>I was elected to represent Computer Engineering in the Student Senate.</p></div></li>'],
  ];
  for (const [current, original] of changes) {
    const expected = current.replace(/\n/g, lineEnding);
    assert.equal(source.split(expected).length, 2, 'Each approved About and Senate edit must occur exactly once');
    source = source.replace(expected, original.replace(/\n/g, lineEnding));
  }
  return source;
}

test('original portfolio sections survive apart from the requested content and simulated living room demo edits', () => {
  // Original sections contain no nested sections. Exact source comparison also protects
  // links, media paths, captions, labels, and the demo DOM contracts inside each section.
  const sections = [...classic.replace(/\r\n/g, '\n').matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)];
  assert.equal(sections.length, 7, 'The frozen classic snapshot should contain seven sections');
  const candidate = beforeApprovedOmniRingDemo(beforeApprovedSpeakerCopy(beforeApprovedInternshipCopy(beforeApprovedAboutAndSenateCopy(beforeApprovedMedia(studio))))).replace(/\r\n/g, '\n')
    .replace(/^      <article class="hobby hobby--pets" id="interest-dogs">[\s\S]*?^      <\/article>\n/m, '')
    .replace('      <p class="intro__lede">Currently looking for someone to peer pressure me into starting pickleball.</p>\n', '')
    .replace('    <p class="service-intro">I continue to volunteer in New Jersey, including park cleanups, community event support and the Making Strides Breast Cancer Awareness Walk.</p>\n', '')
    .replace(/^      <li id="service-(?:nrhh|st-patricks|making-strides)">[\s\S]*?^      <\/li>\n/gm, '');
  for (const [originalSection] of sections) {
    let section = originalSection;
    // These are the user's explicitly requested changes, not a new baseline.
    // Project copy and demo DOM outside the explicitly replaced OmniRing slot
    // remain compared byte-for-byte.
    section = section.replace('      <li><h4>IEEE · Senate · EOP</h4><p>As an Outreach Officer for NJIT\'s IEEE branch, I find industry speakers for our students. I also represent more than 200 computer engineering students in the Student Senate, and through the Educational Opportunity Program I taught 50 incoming students mathematics, physics, English and Python.</p></li>\n', '');
    section = section.replace('          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>', '          <p>I am working toward a 10 km time below 40 minutes, which requires maintaining an average pace of just under four minutes per kilometre across the full distance.</p>\n          <p>“How did your calves get so big?”<br>A decade of trying to reach the top shelf.</p>');
    section = section.replace('I enjoy cooking and experimenting with different preparations.', "I like cooking chapatis and Ugandan cuisine, but I'm also generally a pretty good cook when I'm not burning the food.");
    section = section.replace('          <p>I have written stories since I was six, and I am now developing a fictional universe of my own.</p>', `          <p>When my thoughts aren't haunting me, I'm turning them into fiction. I now have a pretty haunting repertoire of emotionally damaged characters and love-bound protagonists.</p>
          <p>I share these fun little stories with family and friends (whose characters have not yet made their way into my fiction). I do write children's stories though, and I hope to one day publish them.</p>`);
    const label = section.match(/^<section[^>]*>/)[0];
    assert.ok(candidate.includes(section), `Unrequested section change or missing content: ${label}`);
  }
  assert.ok(studio.includes('<h2>Responsibilities</h2>'));
  assert.ok(studio.includes(`<article id="student-senate">
        <p class="proj__meta mono">NJIT · Student Senate</p>
        <h3>Computer Engineering Senator</h3>
        <p>I represent over 200 computer engineering students in NJIT's Student Senate.</p>
      </article>`.replace(/\n/g, studio.includes('\r\n') ? '\r\n' : '\n')));
  assert.ok(!studio.includes('<ul class="facts">'), 'The repeated About highlights must stay removed');
  assert.ok(!studio.includes('300 computer engineering students'), 'The outdated representation count must not return');
  assert.ok(studio.includes('Through EOP, I taught 50 incoming students mathematics, physics, English and Python.'));
  assert.ok(studio.includes('<article class="hobby hobby--pets" id="interest-dogs">'));
  assert.ok(studio.includes('<img src="assets/personal/casper-dimitri-rafiki.webp"'));
  assert.ok(read('assets/personal/casper-dimitri-rafiki.webp').byteLength > 0, 'The supplied pet photo must exist');
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
