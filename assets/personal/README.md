# Personal photos and recordings

The desk photo wall reuses eight existing exports: the red-background portrait, Viam group and robot photos, the EOP class, Ngamba group and sunset, the pets, and Urban Arbor planting. They are composed into one 1200 × 1000 browser canvas texture in `studio-props.js`. Group photographs are contained within their cells; only the portrait and sunset fill their cells with a crop. The original exports remain unchanged.

These images were supplied by Keith for his portfolio. Originals remain unchanged. WebP exports use ordinary cropping, EXIF orientation correction and resizing; there is no generated or retouched imagery. Exports omit EXIF/GPS metadata. Group photos preserve the complete supplied composition. Third-party interfaces, logos and map attribution remain part of the screenshots.

| Asset | Supplied source | Preparation |
| --- | --- | --- |
| `keith-portrait.webp` | `IMG_0178.jpeg` | Striped-shirt portrait crop, 640 x 800; used in About |
| `keith-desk-portrait.webp` | `IMG_6123.jpg` | Portrait crop retaining the original red background, 640 x 800; used in the desk frame |
| `viam-group.webp` | `IEEE Viam Group Photo.JPEG` | Full group selfie, 1600 × 1200 |
| `viam-education.webp` | `IMG_6047.JPEG` | Full event photo, 1600 × 1066 |
| `robotics-desk.webp` | Supplied desk photo | Crop centered on the arm, laptop, power supply and table, 1600 × 1200 |
| `chapati.webp` | `IMG_5290.jpeg` | Crop of the bread and pan, 1600 × 1200 |
| `soundscope-video-hardware.webp` | `IMG_6352.MOV`, 02:13 | Cropped still of the assembled hardware and laptop, 1080 × 1260 |
| `soundscope-video-live-app.webp` | `IMG_6352.MOV`, 00:24 | Cropped still of the running app, 1080 × 920 |
| `soundscope-prototype.mp4` | `IMG_6352.MOV`, 02:04–02:22 | 18-second excerpt, 720 × 1280, 24 fps, H.264, 2.27 MB; audio and metadata removed, streaming header enabled; manual playback |
| `running-10k.webp` | `IMG_4433.PNG` | Crop of the 49:41 10K graphic, excluding story editor controls |
| `running-7-mile.webp` | `IMG_3306.jpg` | Activity and route crop, 7.39 miles |
| `running-6-mile.webp` | `IMG_3807.PNG` | Activity and route crop, 6.25 miles |
| `running-september.webp` | `IMG_4624.PNG` | Metrics and route crop, 6.31 miles on September 22, 2026; call overlay excluded |
| `making-strides-volunteer.webp` | Supplied Making Strides volunteer photo | Full photograph, 1600 × 1200; orientation corrected and resized |
| `casper-dimitri-rafiki.webp` | Supplied Casper, Dimitri and Rafiki photo | Full photograph, 531 x 544; no upscaling |
| `running-10k-metric.webp` | Supplied metric Strava 10K result graphic | Black-padding crop preserving the medal, 10K, 49:41, 4:58/km and Strava logo; 450 x 500 |
| `eop-english-class-2025.webp` | Supplied 2025 EOP English class last-day photo | Full photograph, 1600 x 1492; orientation corrected and resized |
| `viam-hackathon-win.webp` | Supplied Viam hackathon win photo (`IMG_1214.JPEG`) | Full photograph, 1600 x 1200; orientation corrected and resized |
| `viam-winner-robot.webp` | Supplied Viam hackathon winner and robot photo (`IMG_1219.JPEG`) | Full photograph, 1200 x 1600; orientation corrected and resized |

The 49:41 graphic is a recorded 10K result, not a claim about the current personal best. The 49:21 activity time covers 6.31 miles. The goal widget therefore keeps its personal-best field unset. SoundScope stills document the setup and interface, not verified localization accuracy; the separate browser simulation retains its existing explanation.

## Additional gallery photographs

- `keith-pink-selfie.webp`: supplied `IMG_0335 (1).jpeg`, complete composition with recorded orientation applied, 1200 × 1600, WebP quality 88. Included in the About portrait stack.
- `sonde-family-farm.webp`: supplied `ae7303b3-5ed3-490c-a5df-4407499a82f0 (1).JPG`, complete composition, 750 × 1000, WebP quality 90. The user identifies the people as himself and his younger brother Kyle at their family farm in Sonde, Uganda. The caption describes their own tree planting and intended harvest/replanting cycle, without asserting certification or measured sustainability outcomes.

These two exports remove source metadata and leave the original photographs unchanged. The separate Ngamba poster is an explicitly requested AI-assisted upscale; see `../ngamba-island/README.md`.

## Reading and writing

- `bedside-books.webp`: supplied `C:/Users/danny/Downloads/IMG_5203 (1).jpeg`, 2632 × 1676, full composition and native resolution, WebP quality 93 with metadata stripped. This clearer replacement was chosen over the earlier `IMG_5194.jpeg`; no generated spine lettering or upscaling was needed. The visible titles are listed as text below the photograph. The user identifies this as their bookshelf back home in Uganda and psychology and ideas as their favourite reading interest. They clarify that they did not finish the P. G. Wodehouse books; neither the page nor gallery claims that they read every book on the shelf.
- `discrete-analysis-handwriting.webp`: supplied `codex-clipboard-e73c20eb-7ab3-467d-ab7d-a85bc815f782.jpg`, 2852 × 2062, full composition and native resolution, WebP quality 93 with metadata stripped. The handwritten response and professor’s annotation are preserved. The user identifies the page as their Discrete Analysis for Computer Engineers exam and requests the exact caption “and yes, this is my handwriting.”

Both assets appear in the fullscreen gallery as well as their full-width Reading and Writing features. The source files are unchanged.

The `previews/` subdirectory contains 640px and 1280px-wide WebP derivatives (quality 88) of these two photographs. Responsive page images and gallery thumbnails use them to reduce mobile downloads. Opening either picture loads its full-resolution export. Image aspect ratios reserve space before lazy loading completes.
