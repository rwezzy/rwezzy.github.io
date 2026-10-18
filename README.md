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
| `images/gaze-research-1.jpg` | Gaze research: an error-trace frame or a results plot |
| `images/omniring-1.jpg` | OmniRing: the XIAO prototype |
| `images/einstein-ui.png` | Einstein: a screenshot of the Gradio chat |
| `images/obstacle-robot.jpg` | Obstacle-avoiding robot |
| `images/urban-arbor-1.jpg` | Polaroid: planting day at KSPH |
| `images/urban-arbor-2.jpg` | Polaroid: the donated equipment |
| `images/ngamba.jpg` | Polaroid: Ngamba Island |
| `images/newark.jpg` | Polaroid: Newark volunteering |
| `images/og-cover.jpg` | The preview image when someone shares your link (1200×630) |
| `resume.pdf` | The résumé button in the contact section |

Tips:
- Landscape photos at about 1600 px wide look best. Polaroids are cropped square.
- Keep videos short (10–20 s) and under ~15 MB. To shrink one: `ffmpeg -i in.mp4 -vf scale=1280:-2 -an -crf 28 videos/gaze-arm-demo.mp4`
- Don't use frames from the Eye of the Typer dataset that show participants' faces; use plots or your own face instead.
- Want a new photo spot? Copy any `<figure class="slot" data-src="images/NAME.jpg" data-caption="...">` line in `index.html`.

**Empty boxes only show while you're editing** (on `localhost`, on a `file://` path, or with `?edit` at the end of the URL). On the live site, a box without a photo simply disappears, and so does the résumé button until `resume.pdf` exists. So you can publish now and add photos later.

## Edit the words

Everything is in `index.html`, in the order it appears on the page. Each section starts with a comment like `<!-- EXP 03 · ZONELOGIC -->`. The "Right now" section has a "last updated" date: change it when you change the cards.

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
| `css/style.css` | The look: graph paper, ink, safety orange (hardware) and cobalt (software) |
| `js/arm.js` | The hero robot arm (FABRIK inverse kinematics; click to grab) |
| `js/demos.js` | The figure demos: dwell selector, gaze error, crosswalk logic, gesture classifier, optics blur, obstacle robot |
| `js/main.js` | Clocks, smooth scrolling, reveals, counters, the project map, timeline, trees, draggable polaroids |
| `js/slots.js` | Photo/video spots and their placeholders |

Libraries (loaded from CDNs, all free): GSAP + ScrollTrigger for scroll animation, Lenis for smooth scrolling. Fonts: Instrument Serif, Bricolage Grotesque, and JetBrains Mono from Google Fonts. If a CDN is down, the page still works without the animations.
