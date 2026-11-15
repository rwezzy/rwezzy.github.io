# keith rwezahura — personal site

A static site built with HTML, CSS, JavaScript and Three.js. No build step is required.

## Studio version

The homepage uses the Lite6 CAD model to pick up translucent plaques for Projects, Research, Background and Beyond. The arm presents the selected plaque before the camera moves into its reading view. Selecting a different section zooms out, returns the current plaque and picks the next one from the wide view. About zooms into a standing frame without using the arm; Contact opens a notebook. The Motion control and the system's reduced-motion preference allow navigation without the animation.

The glass reading view has an uninterrupted dark frosted surface, with the suction tool softened behind it. Opening a plaque shows clickable glass tiles for that page's sections. These links scroll to the existing content without repeating the pickup, and can be opened directly by URL. The corner display reports the angles used to render the simulated arm during transitions, not telemetry from physical hardware. Desk props include the original adjustable SoundScope carrier on a tripod, detailed schematic sensors, and an OMEN-inspired laptop displaying the supplied screen image. About uses Keith's supplied striped-shirt portrait, while the desk frame uses his red-background portrait.

Beyond groups IEEE outreach, Student Senate and EOP teaching under Responsibilities. Its IEEE NJIT × Viam event entry is based on the supplied project record and distinguishes the November 6 organizing work from the September Gaze Arm project. Two supplied event photos appear below that entry. The interests section includes running and the supplied Strava screenshots and link, cooking with Keith's chapati photo, writing, pets and learning German. About includes the physical desk setup; SoundScope includes two stills from the supplied recording. Existing project wording and demo mechanisms remain unchanged. Photo sources and crop notes are in `assets/personal/README.md`.

This version is maintained in the separate `portfolio-studio` checkout on `design/studio-pages`. The original checkout is independent. `classic.html` retains the source page from the redesign snapshot; the existing demo implementations and project text are retained in `index.html`.

- `js/studio-shell.js`: section navigation, focus handling and intact demo-node placement.
- `js/studio-scene.js`: the homepage robot, plaques and pick/return animation.
- `js/studio-motion.js`: precomputed joint paths and continuous playback interpolation.
- `js/studio-props.js`: laptop, SoundScope stand, About frame, red opening Contact notebook and leaning running shoes. SoundScope separates its original 18 printed CAD pieces, camera and microphone into selectable groups; the Orbbec tripod stays assembled and stationary. Its sensor and tripod geometry is schematic. The green carrier recoloring affects only the desktop scene, not the existing project demo.
- `js/studio-omniring.js`: a teal adjustable strap concept with through-holes, a peg closure and an open USB-C cradle. The XIAO board is converted from Seeed's supplied STEP model and stays intact during explosion. This is a local visual concept, not verified universal-fit or print-ready hardware; source and revision details are in `models/omniring/README.md`.
- `js/studio-inspector.js` and `css/studio-inspector.css`: component details, assemble/explode controls, projected annotation cards and leader lines, and links back to the unchanged project demos. Click a desk object or use its named button; Escape returns to the desk.
- `css/studio.css`: site layout and page presentation.
- `css/studio-demos.css`: presentation of the existing demo controls.
- `tests/studio-preservation.test.mjs`: checks the original project text and demo implementations against a frozen snapshot, including a regression check for the SoundScope texture-loading race fixed in this version.
- `tests/studio-navigation.test.mjs`: checks deep links, delayed graphics loading, section changes and interrupted pick/return transitions.
- `tests/studio-inspector.test.mjs`: component selection, reassembly state, focus, Escape and cleanup. The hobbies view includes the supplied Strava link and German-learning note.

The canvas stays within the homepage's scene area, independent of its drawing-buffer resolution. Section text is immediately visible when scrolling; it does not wait for reveal animations. The Gaze Arm module loads when Projects is opened. The held scene renders on demand while reading instead of maintaining an idle animation loop.

Run the checks with `node --test tests/*.test.mjs`. The demo previews run locally in the browser; the Einstein chat still requires its configured backend. Loading Three.js and the existing detector dependencies requires internet access.

## Preview it on your computer

```bash
python -m http.server 8145 --bind 127.0.0.1 --directory C:/Users/danny/Developer/Meta_Hack/portfolio-studio
```

Then open http://127.0.0.1:8145. Use a local server rather than opening `index.html` directly, because the demos load JavaScript modules and model assets.

## Add your photos and videos

Every photo spot on the page is a dashed box that says exactly which file it wants, for example `images/gaze-arm-1.jpg`. Save a photo with that name into the `images` folder and refresh. That's it.

| File | Where it shows |
|---|---|
| `assets/personal/keith-portrait.webp` | About portrait (4:5) |
| `assets/personal/keith-desk-portrait.webp` | Portrait in the 3D desk frame (4:5) |
| `images/gaze-arm-1.jpg` | Gaze Arm: the xArm6 at the hackathon |
| `videos/gaze-arm-demo.mp4` | Gaze Arm: a short demo clip (muted, loops) |
| `images/omniring-1.jpg` | OmniRing: the XIAO prototype |
| `images/einstein-ui.png` | Einstein: a screenshot of the Gradio chat |
| `images/obstacle-robot.jpg` | Obstacle-avoiding robot |
| `images/urban-arbor-1.jpg` | Urban Arbor: planting day at KSPH |
| `images/urban-arbor-2.jpg` | Urban Arbor: the donated equipment |
| `images/ngamba.jpg` | Service: Ngamba Island |
| `images/newark.jpg` | Service: Newark volunteering |
| `resume.pdf` | The résumé button in the contact section |

Tips:
- Landscape photos at about 1600 px wide look best (they're shown 4:3).
- Keep videos short (10–20 s) and under ~15 MB. To shrink one: `ffmpeg -i in.mp4 -vf scale=1280:-2 -an -crf 28 videos/gaze-arm-demo.mp4`
- Don't use frames from the Eye of the Typer dataset that show participants' faces; use plots or your own face instead.
- Want a new photo spot? Copy any `<figure class="slot" data-src="images/NAME.jpg" data-caption="...">` line in `index.html`.

**Empty boxes only show while you're editing** (on `localhost`, on a `file://` path, or with `?edit` at the end of the URL). On the live site, a box without a photo simply disappears, and so does the résumé button until `resume.pdf` exists. So you can publish now and add photos later.

## Edit the words

Everything is in `index.html`, in the order it appears on the page. Each section starts with a comment like `<!-- 03 ZONELOGIC -->`. Update the "Right now" strip whenever what you're doing changes.

**Your 10K best:** in `index.html`, find `id="pace" data-pb=""` and put your time in, e.g. `data-pb="43:12"`. The running card then shows your best, your pace, and how many seconds per km you still need to cut. Leave it empty to show only the goal.

The hobby lines (cooking, writing) are short on purpose; rewrite them in your own words.

## Put it online (free, GitHub Pages)

1. Create a public GitHub repo named exactly `rwezzy.github.io`.
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Personal site"
   git branch -M main
   git remote add origin https://github.com/rwezzy/rwezzy.github.io.git
   git push -u origin main
   ```
3. In the repo: Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. A minute later it's live at https://rwezzy.github.io. Put that link on your résumé and LinkedIn.

## What's inside

### SoundScope

The project is at `#soundscope`, with an interactive experiment at `#soundscope-lab`.

- `js/soundscope.js` and `css/soundscope.css`: a furnished 3D room (Three.js) with the carrier on a tripod on a desk beside a laptop. Visitors orbit the room, drag the alarm clock, kettle, boombox and television onto floors and furniture, and play them. A second view renders what the carrier's camera sees, with the direction heatmap, the estimate and the candidate object drawn over it; the laptop screen shows the same view. Includes the guessing game (5 rounds; your miss against SoundScope's, in metres), the microphone-spacing and room-echo sliders, spatial audio from the visitor's viewpoint, and session-only event history/replay.
- `js/soundscope-room.js`: the simulation. Each sound is a sum of sinusoids, so every microphone receives an exactly delayed copy: the direct path, one reflection off each of the six room surfaces, and a decaying diffuse tail whose strength follows the echo slider. Signals are sampled at 16 kHz like the XVF3800's 6-channel firmware; four microphones sit upright on a square facing the room, as on the carrier, and direction comes from GCC-PHAT over all six pairs, steered over ±70° azimuth and ±45° elevation. The default 66 mm square matches the app's four-microphone geometry. The normalized map is relative support, not a probability or measured device accuracy. Distance is never estimated from sound.
- `js/soundscope-describe.js`: rule-based captions with no model or API. It uses only what the device could know: the sound's label, the estimated direction, the depth to the first visible surface along it, whether a visible object there could make that sound, and visible neighbours. That is how it reaches statements such as "nothing visible there makes that sound, so the source is probably behind or under the sofa."
- `models/room/`: CC0 models, floor texture and lighting from Poly Haven (about 21 MB, loaded only when the section is near). The desk and tripod are simple geometry drawn in code.
- `js/soundscope-hardware.js`: a lazy-loaded, keyboard-accessible Three.js view of the original adjustable carrier. Sensors are dimensional placeholders. See `models/soundscope/README.md` for provenance and dimensions.
- Search matches a small local vocabulary (sound names and left/right/front/behind) against sounds chosen by the visitor. It does not run Meta models or classify browser audio. No camera/microphone permission, upload, API key or persistent storage is used by the SoundScope demo. The project copy separately describes what runs in the physical application.

Run the simulation and search checks with Node 22.7 or newer:

```bash
node --test tests/soundscope-room.test.mjs tests/soundscope-describe.test.mjs
```

Serve the site over HTTP for the module/CAD loaders; a `file://` preview cannot reliably load them. External Three.js imports use the same pinned CDN as the existing robot demo.

| File | What it does |
|---|---|
| `index.html` | All the content |
| `css/style.css` | The look: white and pale mint with leaf green, turquoise, teal, pink, and blue |
| `js/pick.js` | "Pick something up with your eyes": a 3D SO-ARM100 arm (three.js) with inverse kinematics and pick-and-place, driven by webcam gaze (MediaPipe face tracking + 3-dot calibration) or by the mouse |
| `js/demos.js` | ZoneLogic rules on real street footage (COCO-SSD), the OmniRing gesture pad, and FFT Wiener deconvolution |
| `js/main.js` | Clocks, nav, reveals, the Einstein chat box, trees, 10K pace bar |
| `js/slots.js` | Photo/video spots and their placeholders |
| `models/so100/` | SO-ARM100 meshes from Google DeepMind's MuJoCo Menagerie (Apache 2.0, LICENSE + NOTICE included) |
| `assets/` | Stock photos (Pexels), the crosswalk clip (Mixkit), the USAF 1951 chart (Wikimedia Commons, CC BY-SA 2.5), and the book cover |

Libraries (loaded from CDNs, all free): three.js, MediaPipe Tasks Vision, TensorFlow.js + COCO-SSD. Fonts: Fraunces, Figtree, and DM Mono from Google Fonts. The webcam only turns on when a visitor clicks the button, the video never leaves their browser, and the camera switches itself off after every pick, after 45 seconds without a pick, or when the visitor scrolls away or switches tabs. Webcams need HTTPS (or localhost), which GitHub Pages provides.

## Make Einstein chattable on the site (free)

The chatbot needs a Gemini API key, and a key can't live in a public web page (anyone could copy it).
So Einstein runs on Hugging Face Spaces, where the key stays secret, and the site embeds it.
Everything it needs is ready in `C:/Users/danny/Developer/einstein-space` (your prompt, a 20-message cap per visitor, and a length limit so strangers can't drain your quota).

1. Make a free account at https://huggingface.co and click **New Space**: name it `einstein`, SDK **Gradio**, hardware **CPU basic (free)**, visibility **Public**.
2. Upload the four files from `einstein-space` (Files → Add file → Upload files).
3. Settings → **Variables and secrets** → **New secret**: name `GEMINI_API_KEY`, value = your key.
4. When it shows "Running", copy the direct app URL (something like `https://rwezzy-einstein.hf.space`).
5. In `index.html`, find `class="einchat" data-api=""` and paste the URL between the quotes.

**To chat with Einstein on your own computer right now** (no Hugging Face needed), run this, then open the site at http://localhost:8137. The Einstein card's chat box talks to the local copy automatically:

```bash
C:/Users/danny/Developer/einstein-space/.venv/Scripts/python.exe C:/Users/danny/Developer/einstein-space/run_local.py
```

It reads your key from the original Einstein folder's `.env`, so no key is ever copied. When uploading to Hugging Face, upload only `app.py`, `requirements.txt`, `README.md` and `einstein.png` (not `.venv` or `run_local.py`).

The Einstein card then becomes a real chat box in the site's own style (visitors never leave your page). The Space keeps your key secret, only answers requests coming from rwezzy.github.io, and limits each visitor to 30 messages per 10 minutes and 20 per conversation. Free Spaces sleep when idle, so the first message after a quiet spell takes a few seconds.
