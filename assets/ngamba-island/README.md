# Ngamba Island photographs

Eleven user-provided photographs from the Ngamba Island visit. Each WebP preserves the complete original composition and applies recorded orientation where needed. Exports limit the longest edge to 1600 pixels without upscaling, use WebP quality 84, and omit source metadata. Original files and colors remain unchanged apart from ordinary image encoding.

| Asset | Source | Dimensions |
| --- | --- | --- |
| `enrichment-team.webp` | Supplied enrichment activity team photo (`IMG-20221021-WA0033.jpg`) | 1080 x 720 |
| `chimpanzees.webp` | Supplied sanctuary chimpanzees photo (`IMG-20221020-WA0160.jpg`) | 1024 x 683 |
| `sanctuary-group.webp` | Supplied sanctuary group photo (`DSC_7407.jpg`) | 1600 x 1068 |
| `preparation.webp` | Supplied preparation activity photo (`IMG-20221020-WA0044.jpg`) | 768 x 1024 |
| `briefing.webp` | Supplied sanctuary briefing photo (`DSC_0544.JPG`) | 1600 x 1060 |
| `lake-sunset.webp` | Supplied lake sunset photo (`DSC_7094.jpg`) | 1600 x 1068 |
| `chimpanzee-branches.webp` | Supplied chimpanzee among branches photo (`IMG-20221020-WA0296.jpg`) | 1024 x 683 |

## Clips

The enrichment clip uses the full user-supplied MP4, replacing the earlier 4.20-second GIF export. It is encoded as H.264/yuv420p with faststart (libx264, medium preset, CRF 21). Its recorded orientation is applied to preserve the complete 480 x 848 portrait composition without upscaling or cropping. All 1,013 video frames are retained. The audio stream is removed entirely with `-an`; it is not merely muted in the player. Source metadata is removed. The 33.800-second export retains the full 33.797-second source video stream; the source's slightly longer 33.855-second container duration included the audio tail.

The sanctuary clip remains the user-supplied animated GIF converted to a silent H.264/yuv420p MP4 with faststart. Its original dimensions, full composition, all frames and 120 ms frame timing are preserved, without upscaling or cropping. The sanctuary poster is extracted from the converted clip; the enrichment poster preparation is described below.

| Asset | Source | Dimensions | Duration |
| --- | --- | --- | --- |
| `enrichment-preparation.mp4` | `VID-20221020-WA0053.MP4` | 480 x 848 | 33.80 s |
| `sanctuary-chimpanzees.mp4` | `Snapchat-1459380797_1.gif` | 368 x 736 | 3.60 s |
| `enrichment-poster.webp` | Original enrichment video at 24.00 s, AI-assisted upscale requested by the user | 943 x 1668 | Still |
| `sanctuary-poster.webp` | Sanctuary clip at 1.20 s | 368 x 736 | Still |

## Context sources

The user's account supplies their role and the cylinder activity. Organization and enrichment background were checked against [Chimpanzee Trust's sanctuary welfare page](https://chimpanzeetrust.org/sanctuary-welfare/) and [PASA's overview of primate enrichment](https://www.pasa.org/post/primate-enrichment-at-pasa-wildlife-centers). The page links to these sources beside the relevant descriptions.

## Additional photographs and selected poster

The fullscreen gallery also includes these supplied photographs, encoded as WebP at quality 88 with metadata removed and the complete composition preserved:

- `enrichment-table.webp`: `IMG-20221021-WA0030.jpg` (1080 × 720).
- `shoreline-chimpanzees.webp`: `IMG-20221020-WA0046.jpg` (1024 × 768).
- `community-visit.webp`: `IMG-20221020-WA0060.jpg` (1024 × 683).
- `gathering.webp`: `IMG-20221021-WA0019.jpg` (1080 × 720).

The main enrichment video now rests on its 24.00-second frame. FFmpeg extracted the original 480 × 848 frame; the built-in image generation tool made the user-requested upscale to 943 × 1668, encoded as WebP at quality 90. This is an AI-assisted poster, not a recovered high-resolution video frame; the underlying silent video is unchanged. The same still is available in the About portrait stack.

The final image-editing prompt was: “Upscale this exact frame to a clean high resolution portrait image, around 960 × 1696 or larger at the same aspect ratio. Apply only restrained deblocking, gentle noise reduction and detail-preserving sharpening. Preserve exactly all people's identities, faces, facial expression, mouth shape, eye direction, pose, body proportions, hands and fingers, shirt patterns, skin colour, hair, objects, background and framing. The central young man wearing the pink patterned shirt and holding a white enrichment tube must look exactly as he does in this frame. Keep the frame's natural video texture where detail cannot be recovered. Do not beautify, reshape, retouch faces, invent new details, change expression, move objects, crop, add UI, text or watermarks. This is a faithful upscale of a documentary still, not a reimagined photograph.”

Ngamba's main entry shows the chimpanzee clip link, enrichment team thumbnail and gallery tile beneath the text. The full-width Lake Victoria photograph is outside any disclosure.
