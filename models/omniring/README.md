# OmniRing preview geometry

The board mesh is tessellated from the STEP package linked by Seeed Studio under the **XIAO nRF52840 Sense** mechanical resources. The adjustable band, cradle and closure are original illustrative geometry in `js/studio-omniring.js`; they are not manufactured or fit-tested parts.

## Board source

- Publisher/resource page: [Seeed Studio XIAO nRF52840 series](https://wiki.seeedstudio.com/XIAO_BLE/#seeed-studio-xiao-nrf52840-sense).
- Download: [Seeed-hosted 3D model ZIP](https://files.seeedstudio.com/wiki/XIAO-BLE/seeed-studio-xiao-nrf52840-3d-model.zip).
- Source filename, retained exactly: `XIAO-nRF52840 v15.step`.
- Retrieved November 14, 2026. The archive includes that STEP and two preview PNGs; it does not include a model-specific license or author credit.
- The supplied preview was compared with Seeed's [Sense front diagram](https://files.seeedstudio.com/wiki/XIAO-BLE/XIAO_nRF52840_Sense_front_pinout.png). The USB-C, radio shield and rear sensor area agree visually. The source file's revision has not been verified against the user's physical board, and its generic filename is preserved rather than renamed as revision-exact Sense CAD.
- Source STEP SHA-256: `7aae140f838ec4ccf624e1902c56fb5ad1161d8dc3b0d759ba379d1a83d75890`.

This asset is included for the requested **local visualization**. No deployment was performed. Seeed's [license page](https://wiki.seeedstudio.com/License/) distinguishes documentation from third-party resources; the ZIP itself does not establish a redistribution license. The older official resource page links to a [GrabCAD community model](https://grabcad.com/library/seeed-studio-xiao-nrf52840-sense-1). Do not label this CAD MIT merely because the separate Seeed project-hub repository uses MIT. Confirm the model's redistribution terms before publishing this asset independently or as part of a public site.

## Conversion

`xiao-nrf52840-v15.glb` contains the supplied solid geometry, including the open USB-C shell, contact details, PCB and populated components. All CAD meshes remain children of a single board group in the inspector. The USB-C connector and onboard IMU are not detached during an exploded view.

The existing local OpenCascade/OCP and trimesh toolchain tessellated the STEP at 0.035 mm linear and 0.22 rad angular deflection. STEP face/component colors were retained; PBR roughness and metalness were selected for the preview. The PNG render textures were not embedded. A separate original text label identifies the board without copying certification artwork.

The GLB uses metres, Y up, and USB facing +Z. Source coordinates in millimetres were transformed as:

```text
X = -(sourceZ + 6.1114) / 1000
Y =  (sourceY + 0.25) / 1000
Z =  (sourceX - 1.8042) / 1000
```

The PCB underside is Y=0. The board including the connector measures approximately 17.78 × 22.48 × 4.46 mm. The export is 848,868 bytes with 35,306 triangles and eight material groups. `conversion.json` records bounds, counts and hashes. Local conversion source and the unmodified archive remain in `tmp/omniring-source/` at the workspace root.

## Adjustable enclosure concept

The teal band is an open, curved strap with ten actual through-holes. A shorter overlapping strap carries a peg through one selected hole and a keeper over the loose end. Changing the selected hole is illustrated by the hole pattern; this preview does not simulate fitting a finger. The open-front cradle leaves the board's USB entry accessible.

The module exposes four mechanical groups: `housing`, `xiao`, `band`, and `closure`. Shape, material, flex, clearances, retention strength, comfort and fit across different fingers have not been validated. These visual parts are not print-ready manufacturing CAD. No battery, battery life or complete wireless enclosure is implied.
