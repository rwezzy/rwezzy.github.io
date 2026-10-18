# keith rwezahura — personal site

A static site: plain HTML, CSS, and JavaScript, no build step. Open it, edit it, push it.

## Preview it on your computer

```bash
python -m http.server 8137 --directory C:/Users/danny/Developer/portfolio
```

Then open http://localhost:8137. (Opening `index.html` directly also works, but a local server behaves like the real site.)

## Add your photos and videos

Every photo spot on the page is a dashed box that says exactly which file it wants, for example `images/gaze-arm-1.jpg`. Save a photo with that name into the `images` folder and refresh. That's it.

| File | Where it shows |
|---|---|
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

| File | What it does |
|---|---|
| `index.html` | All the content |
| `css/style.css` | The look: near-black forest greens with sunlit-leaf green, neon green, turquoise, and teal |
| `js/hero3d.js` | The hero: a real UFactory xArm6 + gripper in three.js, built from UFactory's meshes and kinematics, reaching for the cursor with CCD inverse kinematics |
| `js/demos.js` | Live demos: COCO-SSD object detection (Gaze Arm dwell selection, ZoneLogic rules on real footage), MediaPipe face/iris tracking on the visitor's webcam, phone motion sensors for OmniRing, and FFT Wiener deconvolution for the optics project |
| `js/main.js` | Clocks, smooth scrolling, reveals, counters, the project map, timeline, trees, 10K pace bar |
| `js/slots.js` | Photo/video spots and their placeholders |
| `models/xarm6/` | xArm6 and gripper meshes from github.com/xArm-Developer/xarm_ros (BSD-3, license included) |
| `assets/` | Stock photos (Pexels), the crosswalk clip (Mixkit), the USAF 1951 chart (Wikimedia Commons, CC BY-SA 2.5), and the book cover |

Libraries (loaded from CDNs, all free): three.js, TensorFlow.js + COCO-SSD, MediaPipe Tasks Vision, GSAP + ScrollTrigger, Lenis, qrcode-generator. Fonts: Archivo, Geist, and Geist Mono from Google Fonts. The webcam demo only starts when a visitor clicks the button, and nothing leaves their browser.

Note: the OmniRing demo uses phone motion sensors, which browsers only allow on HTTPS, so test it on the live GitHub Pages site, not on localhost from your phone.
