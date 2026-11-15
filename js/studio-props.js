import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadCarrier } from './soundscope-hardware.js?v=3d1';
import { createOmniRing } from './studio-omniring.js';

const asset = name => new URL(`../assets/studio/${name}`, import.meta.url).href;
const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * Small desk objects in metres, with Y up. This module owns its own resources.
 *
 * Returns immediately: { ready, group, targets, hitTargets, setNotebookOpen,
 * setExploded, setPartHighlight, activate, dispose, warnings }.
 * `ready` resolves after optional images/CAD load. Assembly targets expose
 * { id, title, description, kind:'assembly', parts, center, normal, up, width,
 * height, depth }; their bounds include the FULL exploded layout. Each part is
 * { id, title, description, object }. Hit meshes identify pageId, assemblyId,
 * and partId. setExploded(id, 0..1) linearly interpolates cached local transforms;
 * the caller owns easing, animation timing, camera travel, and the fact panel.
 * About/Contact targets expose { id, kind, object, center, normal, up, width,
 * height }. Vectors are in world space and remain valid after notebook updates.
 * The host owns raycasting, camera motion and animation timing. Call
 * setNotebookOpen(0..1) during its tween; no independent render loop is started.
 * An optional portraitUrl can replace the honest name-card fallback.
 */
export function createStudioProps({ scene, onSelect = () => {}, portraitUrl = null } = {}) {
  if (!scene?.isObject3D) throw new TypeError('Studio props require a Three.js scene or parent group.');
  const group = new THREE.Group();
  group.name = 'Studio desk objects';
  scene.add(group);
  const resources = new Set();
  const hitTargets = [];
  const warnings = [];
  const assemblyRecords = new Map();
  let disposed = false;
  const keep = resource => { resources.add(resource); return resource; };
  const material = (color, options = {}) => keep(new THREE.MeshStandardMaterial({
    color, roughness: .55, metalness: .06, envMapIntensity: .35, ...options,
  }));
  const basic = options => keep(new THREE.MeshBasicMaterial({ toneMapped: false, ...options }));
  const box = (width, height, depth, radius = .0015) => keep(new RoundedBoxGeometry(width, height, depth, 2, radius));
  const mesh = (geometry, appearance, parent = group) => {
    const object = new THREE.Mesh(geometry, appearance);
    object.castShadow = true; object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const cylinder = (radius, length, appearance, parent, segments = 20) =>
    mesh(keep(new THREE.CylinderGeometry(radius, radius, length, segments)), appearance, parent);
  const tubeBetween = (a, b, radius, appearance, parent) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const object = cylinder(radius, delta.length(), appearance, parent);
    object.position.copy(start).add(end).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  };
  const canvasMap = (width, height, paint) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The studio could not draw a prop surface.');
    paint(context, width, height);
    const texture = keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const plane = (width, height, appearance, parent) => {
    const object = mesh(keep(new THREE.PlaneGeometry(width, height)), appearance, parent);
    object.castShadow = false;
    return object;
  };
  const pageHit = (object, id) => {
    object.userData.page = id;
    object.userData.pageId = id;
    hitTargets.push(object);
    return object;
  };
  const loadTexture = async url => {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    if (disposed) { texture.dispose(); return null; }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    keep(texture);
    return texture;
  };
  const release = () => { resources.forEach(resource => resource.dispose?.()); resources.clear(); };
  const partOutline = new THREE.Box3Helper(new THREE.Box3(), '#c8dca7');
  partOutline.name = 'Selected assembly part'; partOutline.visible = false;
  partOutline.material.depthTest = false; partOutline.material.transparent = true; partOutline.material.opacity = .82;
  partOutline.renderOrder = 20; keep(partOutline.geometry); keep(partOutline.material); scene.add(partOutline);
  let highlightedPart = null;

  const graphite = material('#22262b', { roughness: .36, metalness: .42 });
  const darkMetal = material('#333b3c', { roughness: .42, metalness: .55 });
  const rubber = material('#161b1b', { roughness: .94, metalness: 0 });
  const paper = material('#f4efe2', { roughness: .93, metalness: 0 });
  const brass = material('#b89d62', { roughness: .36, metalness: .65 });

  // ---------------------------------------------------------- running shoes
  // Original procedural red/green Hoka-style trainers: a continuous fitted upper
  // over a deep rocker midsole, with actual collar openings and separate laces.
  const shoes = new THREE.Group(); shoes.name = 'Running — red and green trainers resting on their toes';
  shoes.position.set(-1.13, .001, .18); shoes.rotation.y = 1.30; group.add(shoes);
  const knitBump = canvasMap(256, 256, ctx => {
    ctx.fillStyle = '#999'; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
      const offset = y % 16 ? 4 : 0;
      ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + 3, y + 4); ctx.lineTo(x + offset, y + 8); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.ellipse(x + offset + 5, y + 3, 1, 2, .3, 0, Math.PI * 2); ctx.fill();
    }
  });
  knitBump.colorSpace = THREE.NoColorSpace; knitBump.wrapS = knitBump.wrapT = THREE.RepeatWrapping; knitBump.repeat.set(3, 5);
  const knit = material('#df3448', { roughness: .87, metalness: 0, bumpMap: knitBump, bumpScale: .00032 });
  const shoeAccent = material('#a72137', { roughness: .74, metalness: 0 });
  const heelGreen = material('#80b843', { roughness: .72, metalness: 0 });
  const soleFoam = material('#c8e685', { roughness: .82, metalness: 0 });
  const soleGroove = material('#7da744', { roughness: .86, metalness: 0 });
  const outsole = material('#243f30', { roughness: .96, metalness: 0 });
  const laceMaterial = material('#e0f1af', { roughness: .9, metalness: 0 });
  // z, half-width, lower surface, upper surface. Toe is negative z.
  // The upturned ends and broad forefoot describe a running last, not spheres.
  const soleSections = [
    [-.124, .001, .024, .040], [-.116, .019, .016, .041], [-.101, .032, .007, .037],
    [-.078, .041, .002, .031], [-.043, .042, .001, .031], [-.008, .037, .002, .034],
    [.029, .034, .003, .038], [.068, .037, .005, .043], [.099, .032, .010, .046],
    [.116, .018, .019, .047], [.124, .001, .027, .041],
  ];
  const upperSections = [
    [-.116, .001, .037, .039], [-.107, .019, .036, .046], [-.091, .031, .032, .053],
    [-.063, .038, .030, .059], [-.029, .035, .032, .067], [.002, .030, .035, .077],
    [.029, .028, .039, .084], [.058, .030, .042, .086], [.084, .028, .045, .086],
    [.103, .022, .046, .078], [.113, .001, .045, .063],
  ];
  const shoeSectionAt = (sections, z) => {
    const next = sections.findIndex(row => row[0] >= z);
    if (next <= 0) return sections[Math.max(0, next)];
    const a = sections[next - 1], b = sections[next], t = (z - a[0]) / (b[0] - a[0]);
    const p = sections[Math.max(0, next - 2)], n = sections[Math.min(sections.length - 1, next + 1)];
    // Cubic sections keep the toe, waist and rocker tangent-continuous.
    return a.map((value, index) => {
      if (!index) return z;
      const span = b[0] - a[0], m0 = (b[index] - p[index]) / (b[0] - p[0]) * span, m1 = (n[index] - a[index]) / (n[0] - a[0]) * span;
      return Math.max(index === 1 ? .001 : 0, (2*t*t*t - 3*t*t + 1)*value + (t*t*t - 2*t*t + t)*m0 + (-2*t*t*t + 3*t*t)*b[index] + (t*t*t - t*t)*m1);
    });
  };
  function shoeLoft(sections, upper = false) {
    const vertices = [], uvs = [], indices = [], around = 48, along = 80;
    const start = sections[0][0], end = sections.at(-1)[0];
    for (let i = 0; i <= along; i++) {
      const [z, width, low, high] = shoeSectionAt(sections, THREE.MathUtils.lerp(start, end, i / along));
      for (let j = 0; j <= around; j++) {
        const angle = j / around * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
        const x = width * (upper ? c : Math.sign(c) * Math.abs(c) ** .65);
        const y = upper ? low + (high - low) * Math.max(0, s) : (low + high) / 2 + (high - low) / 2 * Math.sign(s) * Math.abs(s) ** .65;
        vertices.push(x, y, z); uvs.push(j / around, i / along);
        if (i < along && j < around) {
          const a = i * (around + 1) + j, b = a + around + 1;
          indices.push(a, a + 1, b + 1, a, b + 1, b);
        }
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }
  const foamGeometry = shoeLoft(soleSections), upperGeometry = shoeLoft(upperSections, true);
  const shoeBrand = canvasMap(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#e1f5ad'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 112px Arial, sans-serif'; ctx.fillText('HOKA', w / 2, h / 2 + 4);
  });
  const brandMaterial = material('#ffffff', { map: shoeBrand, transparent: true, roughness: .9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
  const curvedLine = (points, radius, appearance, parent) => mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, radius, 5, false)), appearance, parent);
  const upperPoint = (z, fraction, side, offset = .0006) => {
    const [, width, low, high] = shoeSectionAt(upperSections, z);
    return [side * (width * Math.sqrt(1 - fraction * fraction) + offset), low + (high - low) * fraction, z];
  };
  function heelPanel(side, parent) {
    const positions = [], indices = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, z = .043 + t * .064, top = .24 + .55 * Math.sin(t * Math.PI / 2);
      positions.push(...upperPoint(z, .08, side), ...upperPoint(z, top, side));
      if (i < 24) { const a = i * 2; if (side > 0) indices.push(a,a+1,a+3,a,a+3,a+2); else indices.push(a,a+3,a+1,a,a+2,a+3); }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(geometry, heelGreen, parent).name = 'Green heel support panel';
  }
  function makeShoe(parent) {
    const shoe = new THREE.Group(); parent.add(shoe);
    mesh(foamGeometry, soleFoam, shoe).name = 'Sculpted rocker midsole';
    mesh(upperGeometry, knit, shoe).name = 'Continuous red mesh upper';
    // Segmented rubber contact pads follow the rocker, leaving the foam exposed.
    for (const z of [-.104, -.079, -.052, .064, .092]) {
      const [, width, low] = shoeSectionAt(soleSections, z);
      for (const side of [-1, 1]) {
        const pad = mesh(box(width * .77, .003, .019, .001), outsole, shoe);
        pad.position.set(side * width * .48, low + .0001, z);
        pad.rotation.x = z < -.09 ? -.38 : z > .08 ? .3 : 0;
      }
    }
    const opening = mesh(keep(new THREE.CircleGeometry(.023, 40)), rubber, shoe);
    opening.rotation.x = -Math.PI / 2; opening.scale.y = 1.28; opening.position.set(0, .087, .068);
    const collar = mesh(keep(new THREE.TorusGeometry(.023, .0046, 16, 64)), heelGreen, shoe);
    collar.rotation.x = Math.PI / 2; collar.scale.y = 1.28; collar.position.set(0, .087, .068);
    const tongue = mesh(box(.031, .004, .075, .002), shoeAccent, shoe); tongue.position.set(0, .075, .008); tongue.rotation.x = -.22;
    const heelTab = mesh(box(.011, .024, .003, .001), heelGreen, shoe); heelTab.position.set(0, .090, .103); heelTab.rotation.x = -.15;
    const heelReflector = mesh(box(.003, .013, .0034, .0006), laceMaterial, shoe); heelReflector.position.set(0, .092, .103); heelReflector.rotation.x = -.15;
    for (let i = 0; i < 5; i++) {
      const z = -.022 + i * .011, y = .069 + i * .0035;
      for (const side of [-1, 1]) {
        const eyelet = mesh(keep(new THREE.TorusGeometry(.0017, .0005, 6, 12)), heelGreen, shoe);
        eyelet.rotation.x = Math.PI / 2; eyelet.position.set(side * .015, y, z);
      }
      tubeBetween([-.015, y + .001, z], [.015, y + .0035, z + .009], .0009, laceMaterial, shoe);
      tubeBetween([.015, y + .001, z], [-.015, y + .0035, z + .009], .0009, laceMaterial, shoe);
    }
    // Small tied loops at the top of the lacing, rather than loose parallel bars.
    for (const side of [-1, 1]) curvedLine([[0, .087, .029], [side * .014, .090, .024], [side * .018, .089, .034], [0, .087, .029]], .00085, laceMaterial, shoe);
    for (const side of [-1, 1]) {
      heelPanel(side, shoe);
      for (const fraction of [.28, .62]) {
        const sidewall = soleSections.slice(1, -1).map(([z, width, low, high]) => [side * width * .99, low + (high - low) * fraction, z]);
        curvedLine(sidewall, .00065, soleGroove, shoe);
      }
      const seam = upperSections.slice(2, -1).map(([z, width, low]) => [side * width * .99, low + .003, z]);
      curvedLine(seam, .0012, shoeAccent, shoe);
      // Bonded eyestay rails and a toe reinforcement follow the curved mesh.
      curvedLine([[-.039,.82],[-.01,.91],[.025,.92],[.048,.84]].map(([z,f]) => upperPoint(z,f,side)), .00115, shoeAccent, shoe);
      curvedLine([[-.105,.24],[-.097,.37],[-.088,.30],[-.075,.12]].map(([z,f]) => upperPoint(z,f,side)), .00085, shoeAccent, shoe);
      // A conforming side graphic follows the mesh instead of floating beside it.
      const positions = [], uv = [], indices = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, z = -.052 + t * .091;
        const [, width, low, high] = shoeSectionAt(upperSections, z);
        for (let row = 0; row < 2; row++) {
          const fraction = row ? .81 : .27;
          positions.push(side * (width * Math.sqrt(1 - fraction * fraction) + .0005), low + (high - low) * fraction, z);
          uv.push(side > 0 ? 1 - t : t, row);
        }
        if (i < 16) { const a = i * 2; if (side > 0) indices.push(a, a + 1, a + 3, a, a + 3, a + 2); else indices.push(a, a + 3, a + 1, a, a + 2, a + 3); }
      }
      const graphic = keep(new THREE.BufferGeometry());
      graphic.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); graphic.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      graphic.setIndex(indices); graphic.computeVertexNormals(); mesh(graphic, brandMaterial, shoe);
    }
    return shoe;
  }
  const leftShoe = makeShoe(shoes), rightShoe = makeShoe(shoes);
  // Toes point forward and slightly right; raised heels lean on a low wall.
  leftShoe.position.set(.055, 0, 0); leftShoe.rotation.set(-1.10, Math.PI - .04, -.025, 'YXZ');
  rightShoe.position.set(-.055, 0, .008); rightShoe.rotation.set(-1.13, Math.PI + .04, .025, 'YXZ');
  for (const shoe of [leftShoe, rightShoe]) {
    shoes.updateWorldMatrix(true, true);
    // The desk is at world y=0. Precise vertices avoid the false low corner
    // of a tilted bounding box, which would leave a curved toe floating.
    const bounds = new THREE.Box3().setFromObject(shoe, true);
    shoe.position.y += .0002 - bounds.min.y;
  }
  shoes.updateWorldMatrix(true, true);
  // Find the backmost actual vertex in the pair's coordinates so the support
  // touches the heels without intersecting them or leaving a floating gap.
  let back = Infinity;
  const supportVertex = new THREE.Vector3();
  for (const shoe of [leftShoe, rightShoe]) shoe.traverse(object => {
    const positions = object.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      supportVertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      shoes.worldToLocal(supportVertex);
      back = Math.min(back, supportVertex.z);
    }
  });
  const backstop = mesh(box(.29, .28, .012, .004), material('#e4e6e1', { roughness: .95, metalness: 0 }), shoes);
  backstop.position.set(0, .139, back - .006);
  const toeShadowMap = canvasMap(128, 128, ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(38,41,35,.23)'); gradient.addColorStop(.5, 'rgba(38,41,35,.10)'); gradient.addColorStop(1, 'rgba(38,41,35,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  });
  for (const shoe of [leftShoe, rightShoe]) {
    const toe = shoes.worldToLocal(shoe.localToWorld(new THREE.Vector3(0, .024, -.124)));
    const shadow = plane(.105, .075, basic({ map: toeShadowMap, transparent: true, depthWrite: false }), shoes);
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(toe.x, .0001 - shoes.position.y, toe.z); shadow.raycast = () => {};
  }
  shoes.traverse(object => { if (object.isMesh) pageHit(object, 'hobbies'); });

  // ---------------------------------------------------------------- laptop
  const laptop = new THREE.Group(); laptop.name = 'OMEN 16-inspired laptop — schematic enclosure';
  laptop.position.set(.38, .003, -.33); laptop.rotation.y = .15; group.add(laptop);
  const base = mesh(box(.348, .015, .234, .004), graphite, laptop); base.position.y = .008;
  const frontLip = mesh(box(.328, .002, .004, .0007), darkMetal, laptop); frontLip.position.set(0, .010, .116);
  for (const side of [-1, 1]) {
    const foot = mesh(box(.055, .003, .009, .001), rubber, laptop);
    foot.position.set(side * .12, .0015, .091);
    for (const z of [-.065, -.037]) {
      const port = mesh(box(.001, .004, .014, .0005), rubber, laptop);
      port.position.set(side * .1741, .008, z);
    }
    const hinge = cylinder(.0045, .045, darkMetal, laptop, 16);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(side * .115, .020, -.102);
  }

  const keyboardMap = canvasMap(1024, 400, (ctx, w, h) => {
    ctx.fillStyle = '#1b2027'; ctx.fillRect(0, 0, w, h);
    const rows = [
      ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'del'],
      ['~', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−', '=', '⌫'],
      ['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
      ['caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'enter'],
      ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'shift', '↑'],
    ];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach((row, r) => row.forEach((key, c) => {
      const x = 15 + c * 71, y = 12 + r * 61;
      ctx.fillStyle = '#394049'; ctx.fillRect(x, y, 64, 50);
      ctx.fillStyle = '#252b32'; ctx.fillRect(x + 2, y + 2, 60, 44);
      ctx.fillStyle = r < 2 ? '#a7c7d5' : r < 4 ? '#bdb7da' : '#d5b4d0';
      ctx.font = '500 15px Figtree, Arial, sans-serif'; ctx.fillText(key, x + 32, y + 24);
    }));
    const keys = [[15, 66, 'ctrl'], [88, 66, 'fn'], [161, 66, 'win'], [234, 66, 'alt'], [307, 358, ''], [672, 66, 'alt'], [745, 66, 'ctrl'], [818, 56, '←'], [881, 56, '↓'], [944, 56, '→']];
    keys.forEach(([x, width, label]) => {
      ctx.fillStyle = '#394049'; ctx.fillRect(x, 319, width, 52);
      ctx.fillStyle = '#252b32'; ctx.fillRect(x + 2, 321, width - 4, 46);
      ctx.fillStyle = '#c6bfd4'; ctx.font = '500 15px Figtree, Arial, sans-serif'; ctx.fillText(label, x + width / 2, 344);
    });
  });
  const keyboard = plane(.307, .12, material('#ffffff', { map: keyboardMap, roughness: .66, metalness: .12 }), laptop);
  keyboard.rotation.x = -Math.PI / 2; keyboard.position.set(0, .0157, -.031);
  const trackpad = mesh(box(.104, .001, .052, .003), material('#30363d', { metalness: .32, roughness: .45 }), laptop);
  trackpad.position.set(0, .016, .072);
  const grilleGeometry = keep(new THREE.BoxGeometry(.001, .0006, .010));
  const grille = new THREE.InstancedMesh(grilleGeometry, rubber, 54);
  keep(grille); laptop.add(grille);
  const transform = new THREE.Matrix4();
  for (let i = 0; i < 54; i++) { transform.makeTranslation(-.146 + i * .0055, .016, -.099); grille.setMatrixAt(i, transform); }
  grille.instanceMatrix.needsUpdate = true;

  const screenHinge = new THREE.Group(); screenHinge.position.set(0, .020, -.104); screenHinge.rotation.x = -.21; laptop.add(screenHinge);
  const screenHousing = mesh(box(.348, .203, .008, .003), graphite, screenHinge); screenHousing.position.y = .1015;
  const screenMaterial = basic({ color: '#ffffff', map: canvasMap(1024, 550, (ctx, w, h) => {
    ctx.fillStyle = '#0b1620'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#38503d'; ctx.fillRect(0, 0, w * .5, h);
    ctx.fillStyle = '#f0eee3'; ctx.font = '500 44px Figtree, Arial, sans-serif'; ctx.fillText('Enya', 45, 90);
    ctx.fillStyle = '#b5c7ba'; ctx.font = '24px monospace'; ctx.fillText('Wild Child', 45, 130);
    ctx.fillStyle = '#a6cfda'; ctx.font = '20px monospace'; ctx.fillText('class DisplayTransform:', 560, 100);
  }) });
  const screen = plane(.327, .1757, screenMaterial, screenHinge); screen.position.set(0, .106, .0042);
  const wordmarkMap = canvasMap(256, 48, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#a8acb4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '500 25px Figtree, Arial, sans-serif'; ctx.fillText('O M E N', w / 2, h / 2);
  });
  const wordmark = plane(.039, .0073, basic({ map: wordmarkMap, transparent: true }), screenHinge); wordmark.position.set(0, .010, .0044);
  const webcam = mesh(keep(new THREE.CircleGeometry(.0012, 12)), rubber, screenHinge); webcam.position.set(0, .197, .0043);
  const laptopReady = loadTexture(asset('laptop-screen.png')).then(texture => {
    if (!texture || disposed) return;
    screenMaterial.map = texture; screenMaterial.needsUpdate = true;
  });

  // --------------------------------------------------------- About photo wall
  // A small gallery board, front-facing from the desk camera. Unequal cells
  // make the portrait the anchor without turning it into the page background.
  const frame = new THREE.Group(); frame.name = 'About — red photo wall';
  frame.position.set(-.66, 0, -.035); frame.rotation.y = .64; group.add(frame);
  const frameFace = new THREE.Group(); frameFace.position.set(0, .165, 0); frameFace.rotation.x = -.18; frame.add(frameFace);
  const galleryRed = material('#bd2036', { roughness: .38, metalness: .3 });
  pageHit(mesh(box(.366, .318, .012, .003), galleryRed, frameFace), 'about');
  const mount = pageHit(plane(.350, .302, material('#faf9f5', { roughness: .95, metalness: 0 }), frameFace), 'about');
  mount.position.z = .0062;
  const localPhoto = path => new URL(`../assets/${path}`, import.meta.url).href;
  const wallPhotos = [
    { name: 'Keith', url: portraitUrl || localPhoto('personal/keith-desk-portrait.webp'), cell: [0, 0, 444, 620], cover: true },
    { name: 'Viam hackathon', url: localPhoto('personal/viam-hackathon-win.webp'), cell: [460, 0, 384, 288] },
    { name: 'With the robot', url: localPhoto('personal/viam-winner-robot.webp'), cell: [860, 0, 340, 453] },
    { name: 'EOP English class', url: localPhoto('personal/eop-english-class-2025.webp'), cell: [460, 304, 384, 316] },
    { name: 'Ngamba sunset', url: localPhoto('ngamba-island/lake-sunset.webp'), cell: [860, 469, 340, 151], cover: true },
    { name: 'Ngamba Island', url: localPhoto('ngamba-island/sanctuary-group.webp'), cell: [0, 636, 584, 364] },
    { name: 'At home', url: localPhoto('personal/casper-dimitri-rafiki.webp'), cell: [600, 636, 354, 364] },
    { name: 'Urban Arbor', url: localPhoto('urban-arbor/planting.webp'), cell: [970, 636, 230, 364] },
  ];
  // One shared atlas keeps the photo wall to one image draw call. Group photos
  // fit inside their cells in full; no people are cut out to fill the grid.
  const galleryMap = canvasMap(1200, 1000, (ctx, w, h) => {
    ctx.fillStyle = '#faf9f5'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '24px Arial, sans-serif';
    for (const { name, cell: [x, y, width, height] } of wallPhotos) {
      ctx.fillStyle = '#ebe9e5'; ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#7e2c39'; ctx.fillText(name, x + width / 2, y + height / 2);
    }
  });
  const gallery = pageHit(plane(.332, .2767, basic({ map: galleryMap }), frameFace), 'about');
  gallery.position.z = .0066;
  // Red folded-metal feet give the board a clean, shallow stand.
  for (const x of [-.125, .125]) {
    tubeBetween([x, .182, -.018], [x, .004, -.090], .0025, galleryRed, frame);
    const foot = mesh(box(.050, .005, .075, .002), galleryRed, frame);
    foot.position.set(x, .0025, -.060);
  }
  const portraitReady = Promise.allSettled(wallPhotos.map(photo => new THREE.ImageLoader().loadAsync(photo.url))).then(results => {
    if (disposed) return;
    const ctx = galleryMap.image.getContext('2d');
    results.forEach((result, index) => {
      const photo = wallPhotos[index];
      if (result.status !== 'fulfilled') { warnings.push({ asset: photo.name, message: 'Photo unavailable' }); return; }
      const image = result.value, [x, y, width, height] = photo.cell;
      const scale = (photo.cover ? Math.max : Math.min)(width / image.width, height / image.height);
      const w = image.width * scale, h = image.height * scale;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
      ctx.fillStyle = '#faf9f5'; ctx.fillRect(x, y, width, height);
      ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h); ctx.restore();
    });
    galleryMap.needsUpdate = true;
  });

  // ------------------------------------------------------------ Contact book
  // A top-bound notebook opens toward the rear, clear of the robot's plaque fan.
  const notebook = new THREE.Group(); notebook.name = 'Contact — opening notebook'; notebook.position.set(.56, .003, .035); notebook.rotation.y = -.12; group.add(notebook);
  const coverMaterial = material('#a5222c', { roughness: .72, metalness: 0 });
  const bottom = pageHit(mesh(box(.22, .004, .165, .003), coverMaterial, notebook), 'contact'); bottom.position.y = .003;
  const pages = pageHit(mesh(box(.207, .010, .153, .0012), paper, notebook), 'contact'); pages.position.set(0, .009, .001);
  const contactMap = canvasMap(1100, 820, (ctx, w, h) => {
    ctx.fillStyle = '#f5f0e3'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#827869'; ctx.font = '500 26px Figtree, Arial, sans-serif'; ctx.fillText('CONTACT / KEITH RWEZAHURA', 65, 88);
    ctx.fillStyle = '#392f35'; ctx.font = '500 85px Figtree, Arial, sans-serif'; ctx.fillText("Let's talk.", 65, 218);
    ctx.strokeStyle = '#c7bfb0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(65, 267); ctx.lineTo(w - 65, 267); ctx.stroke();
    ctx.fillStyle = '#4e424b'; ctx.font = '500 34px Figtree, Arial, sans-serif';
    ctx.fillText('kama.rwezahura@gmail.com', 65, 355);
    ctx.fillText('github.com/rwezzy', 65, 425);
    ctx.font = '29px Figtree, Arial, sans-serif'; ctx.fillText('Robotics · embedded systems · machine learning', 65, 565);
    ctx.fillStyle = '#706657'; ctx.font = '27px Figtree, Arial, sans-serif'; ctx.fillText('Kampala → Newark', 65, 711);
  });
  const contactPage = pageHit(plane(.198, .1476, basic({ map: contactMap }), notebook), 'contact');
  contactPage.rotation.x = -Math.PI / 2; contactPage.position.set(0, .0142, .001);
  const coverHinge = new THREE.Group(); coverHinge.position.set(0, .018, -.0805); notebook.add(coverHinge);
  const frontCover = pageHit(mesh(box(.22, .004, .165, .003), coverMaterial, coverHinge), 'contact'); frontCover.position.z = .0825;
  const coverMap = canvasMap(1100, 820, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#dfccad'; ctx.textAlign = 'center';
    ctx.font = '500 78px Figtree, Arial, sans-serif'; ctx.fillText('CONTACT', w / 2, 380);
    ctx.font = '500 27px Figtree, Arial, sans-serif'; ctx.fillText('KEITH RWEZAHURA', w / 2, 450);
    ctx.strokeStyle = '#dfccad'; ctx.lineWidth = 2; ctx.strokeRect(60, 60, w - 120, h - 120);
  });
  const coverLabel = pageHit(plane(.202, .1506, basic({ map: coverMap, transparent: true, depthWrite: false }), coverHinge), 'contact');
  coverLabel.rotation.x = -Math.PI / 2; coverLabel.position.set(0, .0022, .0825);
  const insideMap = canvasMap(1024, 768, (ctx, w, h) => {
    ctx.fillStyle = '#e9e2d3'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6b5e54';
    ctx.font = '500 43px Figtree, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Keith Rwezahura', w / 2, 350);
    ctx.strokeStyle = '#bcb39e'; ctx.lineWidth = 2;
    for (let y = 430; y < 650; y += 55) { ctx.beginPath(); ctx.moveTo(130, y); ctx.lineTo(w - 130, y); ctx.stroke(); }
  });
  const inside = plane(.202, .1515, basic({ map: insideMap }), coverHinge); inside.rotation.x = Math.PI / 2; inside.position.set(0, -.0023, .0825);
  for (const x of [-.085, -.0425, 0, .0425, .085]) {
    const ring = mesh(keep(new THREE.TorusGeometry(.005, .0008, 6, 16)), brass, notebook);
    ring.rotation.y = Math.PI / 2; ring.position.set(x, .012, -.077);
  }
  for (let i = 0; i < 5; i++) {
    const edge = mesh(keep(new THREE.BoxGeometry(.206, .00025, .0004)), material('#d2c8b6'), notebook);
    edge.position.set(0, .005 + i * .0018, .0776);
  }

  const targets = {
    about: { id: 'about', title: 'About', kind: 'frame', object: frame, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .366, height: .318 },
    contact: { id: 'contact', kind: 'notebook', object: notebook, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .22, height: .165, openProgress: 0 },
    hobbies: { id: 'hobbies', title: 'Running', description: 'Running shoes — open the interests and off-clock section.', kind: 'object', object: shoes, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .22, height: .25 },
  };
  function updateTargets(t = targets.contact.openProgress) {
    group.updateWorldMatrix(true, true);
    targets.about.center.set(0, 0, .007).applyMatrix4(frameFace.matrixWorld);
    targets.about.normal.set(0, 0, 1).transformDirection(frameFace.matrixWorld);
    targets.about.up.set(0, 1, 0).transformDirection(frameFace.matrixWorld);
    targets.contact.center.set(0, .015, -.065 * t).applyMatrix4(notebook.matrixWorld);
    targets.contact.normal.set(0, 1, 0).transformDirection(notebook.matrixWorld);
    targets.contact.up.set(0, 0, -1).transformDirection(notebook.matrixWorld);
    targets.contact.height = .165 + .135 * t;
    targets.hobbies.center.set(0, .12, 0).applyMatrix4(shoes.matrixWorld);
    targets.hobbies.normal.set(0, .3, 1).normalize().transformDirection(shoes.matrixWorld);
    targets.hobbies.up.set(0, 1, -.3).normalize().transformDirection(shoes.matrixWorld);
    for (const record of assemblyRecords.values()) {
      record.target.center.copy(record.localCenter).applyMatrix4(record.object.matrixWorld);
      record.target.normal.copy(record.localNormal).transformDirection(record.object.matrixWorld);
      record.target.up.copy(record.localUp).transformDirection(record.object.matrixWorld);
    }
  }
  const flutterLeaves = [0, 1, 2].map(i => {
    const hinge = new THREE.Group(); hinge.position.set(0, .0145 + i * .0006, -.075); notebook.add(hinge);
    const leaf = mesh(box(.201, .0003, .146, .0001), paper, hinge);
    leaf.position.z = .073;
    return hinge;
  });
  function setNotebookOpen(value) {
    if (disposed) return;
    const t = clamp01(value);
    coverHinge.rotation.x = -Math.PI * .95 * t;
    flutterLeaves.forEach((leaf, i) => { leaf.rotation.x = t < .08 ? -t * (1.1 + i * .35) : 0; });
    targets.contact.openProgress = t;
    updateTargets(t);
  }
  setNotebookOpen(0);

  function registerAssembly(id, title, description, object, partSpecs, localNormal = [0, .14, 1]) {
    const normal = new THREE.Vector3(...localNormal).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
    const target = { id, title, description, kind: 'assembly', object, parts: [], center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .4, height: .4, depth: .2, explodedProgress: 0 };
    const record = { object, target, localCenter: new THREE.Vector3(0, .15, 0), localNormal: normal, localUp: up, transforms: [], appearances: new Map() };
    for (const spec of partSpecs) {
      const part = { id: spec.id, title: spec.title, description: spec.description, object: spec.object };
      const homePosition = spec.object.position.clone(), homeQuaternion = spec.object.quaternion.clone();
      record.transforms.push({ object: spec.object, homePosition, homeQuaternion,
        explodedPosition: homePosition.clone().add(new THREE.Vector3(...spec.offset)),
        explodedQuaternion: homeQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(spec.turn || [0, 0, 0])))),
      });
      target.parts.push(part);
    }
    targets[id] = target; assemblyRecords.set(id, record);
    return record;
  }
  function registerPartHits(record) {
    for (const part of record.target.parts) part.object.traverse(object => {
      if (!object.isMesh || object.userData.assemblyId === record.target.id) return;
      pageHit(object, record.target.id);
      object.userData.assemblyId = record.target.id; object.userData.partId = part.id;
      // Isolate highlight materials from the laptop, frame, and other parts.
      const appearances = Array.isArray(object.material) ? object.material : [object.material];
      const copies = appearances.map(original => {
        const copy = keep(original.clone());
        record.appearances.set(copy, { color: copy.color?.clone(), emissive: copy.emissive?.clone(), intensity: copy.emissiveIntensity });
        return copy;
      });
      object.material = Array.isArray(object.material) ? copies : copies[0];
    });
  }
  function applyExplosion(record, progress) {
    for (const transform of record.transforms) {
      transform.object.position.lerpVectors(transform.homePosition, transform.explodedPosition, progress);
      transform.object.quaternion.slerpQuaternions(transform.homeQuaternion, transform.explodedQuaternion, progress);
    }
    record.object.updateWorldMatrix(true, true);
  }
  function measureAssembly(record) {
    // The focused camera uses fixed full-explosion bounds, so opening parts
    // never causes a camera resize or crops the outermost component.
    applyExplosion(record, 1);
    const bounds = new THREE.Box3().setFromObject(record.object);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const normal = record.localNormal.clone().transformDirection(record.object.matrixWorld);
      const up = record.localUp.clone().transformDirection(record.object.matrixWorld);
      const right = new THREE.Vector3().crossVectors(up, normal).normalize();
      let width = 0, height = 0, depth = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const delta = new THREE.Vector3(x, y, z).sub(center);
        width = Math.max(width, Math.abs(delta.dot(right)) * 2);
        height = Math.max(height, Math.abs(delta.dot(up)) * 2);
        depth = Math.max(depth, Math.abs(delta.dot(normal)) * 2);
      }
      record.localCenter.copy(center).applyMatrix4(record.object.matrixWorld.clone().invert());
      record.target.width = width * 1.12; record.target.height = height * 1.12; record.target.depth = depth;
    }
    applyExplosion(record, record.target.explodedProgress);
    updateTargets();
  }
  function setExploded(id, value) {
    if (disposed) return;
    const record = assemblyRecords.get(id);
    if (!record) return;
    record.target.explodedProgress = clamp01(value);
    applyExplosion(record, record.target.explodedProgress); updateTargets();
    if (highlightedPart) partOutline.box.setFromObject(highlightedPart.object).expandByScalar(.003);
  }
  function setPartHighlight(id, partId = null) {
    if (disposed) return;
    highlightedPart = assemblyRecords.get(id)?.target.parts.find(part => part.id === partId) || null;
    partOutline.visible = Boolean(highlightedPart);
    if (highlightedPart) partOutline.box.setFromObject(highlightedPart.object).expandByScalar(.003);
    for (const record of assemblyRecords.values()) {
      for (const part of record.target.parts) part.object.traverse(object => {
        if (!object.isMesh) return;
        const selected = record.target.id === id && part.id === partId;
        for (const appearance of Array.isArray(object.material) ? object.material : [object.material]) {
          const original = record.appearances.get(appearance);
          if (!original) continue;
          if (original.emissive) {
            appearance.emissive.copy(selected ? new THREE.Color('#728744') : original.emissive);
            appearance.emissiveIntensity = selected ? .22 : original.intensity;
          } else if (original.color) appearance.color.copy(original.color).lerp(new THREE.Color('#dce8b9'), selected ? .2 : 0);
        }
      });
    }
  }

  // --------------------------------------------------------- SoundScope rig
  const rig = new THREE.Group(); rig.name = 'SoundScope original carrier with schematic sensors and tripod';
  // Forward and left of the arm: the board and tripod stay visible without
  // occupying the front-left plaque's pickup area.
  rig.position.set(-.28, 0, -.035); rig.rotation.y = .58; group.add(rig);
  const tripodPart = new THREE.Group(), framePart = new THREE.Group(), pressurePart = new THREE.Group();
  const clampsPart = new THREE.Group(), fastenersPart = new THREE.Group(), boardPart = new THREE.Group(), cameraPart = new THREE.Group();
  tripodPart.name = 'SoundScope / stationary tripod'; framePart.name = 'SoundScope / integrated ring and camera cradle';
  pressurePart.name = 'SoundScope / camera pressure bar'; clampsPart.name = 'SoundScope / microphone clamp pieces';
  fastenersPart.name = 'SoundScope / printed screws and nuts';
  boardPart.name = 'SoundScope / microphone board'; cameraPart.name = 'SoundScope / depth camera';
  for (const part of [framePart, pressurePart, clampsPart, fastenersPart, boardPart, cameraPart]) part.position.y = .116;
  rig.add(tripodPart, framePart, pressurePart, clampsPart, fastenersPart, boardPart, cameraPart);
  const column = cylinder(.0055, .072, darkMetal, tripodPart); column.position.y = .051;
  const collar = cylinder(.010, .014, rubber, tripodPart); collar.position.y = .031;
  const head = mesh(box(.036, .008, .026, .003), darkMetal, tripodPart); head.position.y = .090;
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + i * Math.PI * 2 / 3;
    const foot = [Math.cos(angle) * .087, .004, Math.sin(angle) * .087];
    tubeBetween([Math.cos(angle) * .012, .069, Math.sin(angle) * .012], foot, .004, darkMetal, tripodPart);
    const tip = mesh(keep(new THREE.SphereGeometry(.006, 12, 8)), rubber, tripodPart); tip.position.fromArray(foot); tip.scale.y = .55;
  }
  const soundRecord = registerAssembly('soundscope', 'SoundScope', 'Audio direction and RGB-D sensing in an adjustable printed carrier. The original carrier CAD is preserved; electronics and tripod details are schematic.', rig, [
    { id: 'board', title: 'Four-microphone array', description: 'Four synchronized microphone recordings from the reSpeaker XVF3800 feed SoundScope’s direction-estimation algorithm.', object: boardPart, offset: [.015, .150, .055], turn: [0, -.10, 0] },
    { id: 'camera', title: 'RGB-D camera', description: 'The Gemini 2 provides image and depth measurements.', object: cameraPart, offset: [.025, .065, .100], turn: [0, .10, 0] },
    { id: 'carrier', title: 'Ring & camera cradle', description: 'One original printed frame combines the microphone ring and camera cradle, keeping the sensors aligned.', object: framePart, offset: [-.170, .040, -.040] },
    { id: 'pressure-bar', title: 'Camera pressure bar', description: 'The printed bar secures the camera in its cradle.', object: pressurePart, offset: [-.120, -.035, .115] },
    { id: 'mic-clamps', title: 'Microphone clamps', description: 'Three printed shoes and three contact toes locate and secure the microphone board in the ring.', object: clampsPart, offset: [0, 0, 0] },
    { id: 'fasteners', title: 'Printed fasteners', description: 'The original camera nuts and screws, plus the clamp lock and toe screws, let the carrier be adjusted and secured.', object: fastenersPart, offset: [0, 0, 0] },
    { id: 'tripod', title: 'Tripod support', description: 'Supports the assembled sensor carrier and stays in place during the exploded view.', object: tripodPart, offset: [0, 0, 0] },
  ]);
  registerPartHits(soundRecord);
  const carrierReady = loadCarrier(resources).then(({ assembly, parts }) => {
    if (disposed) { release(); return; }
    assembly.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    const originalParts = parts.map(part => part.node || part);
    const sourceRoots = new Set();
    assembly.updateWorldMatrix(true, true);
    // Retain every source mesh and its exact assembled transform. Only the
    // desk instance is recolored; the standalone hardware demo is untouched.
    const sourcePoses = originalParts.map(object => {
      let root = object;
      while (root.parent && root.parent !== assembly) root = root.parent;
      sourceRoots.add(root);
      return { object, matrix: object.matrixWorld.clone() };
    });
    const printGreen = material('#32d66b', { roughness: .42, flatShading: true });
    const printDark = material('#0c7848', { roughness: .38, flatShading: true });
    const printContact = material('#25b964', { roughness: .36, flatShading: true });
    let fastenerIndex = 0;
    for (const { object, matrix } of sourcePoses) {
      const name = object.name;
      const isClamp = /^mic_(shoe|toe)_\d+$/.test(name);
      const isFastener = name.includes('screw') || name.includes('nut');
      const destination = name === 'shared_frame' ? framePart : name === 'camera_pressure_bar' ? pressurePart : isClamp ? clampsPart : fastenersPart;
      destination.add(object);
      matrix.decompose(object.position, object.quaternion, object.scale);
      object.matrixAutoUpdate = true;
      object.material = isFastener ? printDark : name.includes('toe') || name.includes('pressure_bar') ? printContact : printGreen;
      object.userData.sourceCadName = name;
      if (isClamp || isFastener) {
        const homePosition = object.position.clone(), homeQuaternion = object.quaternion.clone();
        let explodedPosition;
        if (isClamp) {
          const column = Number(name.match(/\d+$/)[0]) - 1;
          explodedPosition = new THREE.Vector3(.140 + column * .065, name.includes('shoe') ? .235 : .185, name.includes('shoe') ? .060 : .085);
        } else {
          const index = fastenerIndex++;
          explodedPosition = new THREE.Vector3(.125 + (index % 5) * .035, .080 - Math.floor(index / 5) * .050, .110);
        }
        soundRecord.transforms.push({ object, homePosition, homeQuaternion, explodedPosition, explodedQuaternion: homeQuaternion.clone() });
      }
    }
    for (const child of [...assembly.children]) {
      if (sourceRoots.has(child)) continue;
      if (child.name.includes('PCB') || child.name.includes('microphone')) boardPart.add(child);
      else cameraPart.add(child);
    }
    // Original explanatory geometry: a populated circular board, not copied
    // manufacturer STEP solids. The exact board layout is intentionally not claimed.
    const chipMaterial = material('#18201e', { roughness: .7 });
    const silver = material('#9aa6a0', { roughness: .3, metalness: .8 });
    const boardInk = material('#d6ded1', { roughness: .9 });
    const ledMaterial = material('#a9bc82', { roughness: .35, emissive: '#5a6e29', emissiveIntensity: .1 });
    const chip = mesh(box(.018, .018, .0024, .0005), chipMaterial, boardPart); chip.position.set(0, .128, .0172);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const led = mesh(box(.0026, .0026, .0012, .0002), ledMaterial, boardPart);
      led.position.set(Math.sin(angle) * .042, .128 + Math.cos(angle) * .042, .0164);
    }
    for (const [x, y, w, h] of [[-.017, .128, .006, .010], [.018, .130, .006, .015], [0, .150, .012, .006], [0, .105, .014, .007]]) {
      const component = mesh(box(w, h, .0018, .0003), chipMaterial, boardPart); component.position.set(x, y, .017);
      for (const side of [-1, 1]) {
        const contact = mesh(keep(new THREE.BoxGeometry(.0008, h * .85, .0005)), silver, boardPart); contact.position.set(x + side * (w / 2 + .0005), y, .0164);
      }
    }
    for (const x of [-.018, .018]) {
      const usb = mesh(box(.009, .004, .004, .0005), silver, boardPart); usb.position.set(x, .080, .017);
      const port = mesh(box(.0065, .002, .001, .0003), rubber, boardPart); port.position.set(x, .0784, .0188);
    }
    const boardLabel = canvasMap(512, 80, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d3dfd1';
      ctx.font = '500 34px Figtree, Arial, sans-serif'; ctx.fillText('reSpeaker  /  XVF3800', w / 2, h / 2);
    });
    const label = plane(.045, .007, basic({ map: boardLabel, transparent: true, depthWrite: false }), boardPart); label.position.set(0, .163, .016);
    const microphoneLabels = canvasMap(512, 512, ctx => {
      ctx.clearRect(0, 0, 512, 512); ctx.fillStyle = '#cbd9c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '500 20px Arial, sans-serif';
      [[126, 96], [386, 96], [126, 416], [386, 416]].forEach(([x, y], index) => ctx.fillText(`MIC ${index + 1}`, x, y));
    });
    const micSilkscreen = plane(.098, .098, basic({ map: microphoneLabels, transparent: true, depthWrite: false }), boardPart);
    micSilkscreen.position.set(0, .128, .0163);
    for (const x of [-.039, .039]) {
      const screw = mesh(keep(new THREE.CircleGeometry(.0013, 12)), boardInk, boardPart); screw.position.set(x, .128, .016);
    }
    registerPartHits(soundRecord); measureAssembly(soundRecord);
    updateTargets();
  });

  // ------------------------------------------------------- OmniRing concept
  // The board's supplied CAD, connector and onboard parts stay together;
  // only the illustrative cradle, perforated band and closure separate.
  const omniModel = createOmniRing();
  const omni = omniModel.object;
  omni.position.set(.34, .004, .025); omni.rotation.y = -.22; omni.scale.setScalar(2.3); group.add(omni);
  const omniRecord = registerAssembly('omniring', omniModel.title, omniModel.description, omni, omniModel.parts, omniModel.localNormal);
  const omniReady = Promise.resolve(omniModel.ready).then(result => {
    if (disposed) { omniModel.dispose(); return; }
    warnings.push(...(result?.warnings || []));
    // A load fallback may refine a descriptor; keep the inspector accurate.
    for (const part of omniRecord.target.parts) {
      const current = omniModel.parts.find(spec => spec.id === part.id);
      if (current) { part.title = current.title; part.description = current.description; }
    }
    registerPartHits(omniRecord); measureAssembly(omniRecord); updateTargets();
  });

  const ready = Promise.allSettled([laptopReady, portraitReady, carrierReady, omniReady]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') warnings.push({ asset: ['laptop screen', 'portrait', 'SoundScope carrier', 'OmniRing'][index], message: String(result.reason?.message || result.reason) });
    });
    if (!disposed) {
      measureAssembly(soundRecord); measureAssembly(omniRecord); updateTargets();
    }
    return { warnings: warnings.slice() };
  });
  return {
    ready, group, targets, hitTargets, setNotebookOpen, setExploded, setPartHighlight, warnings,
    activate(value) {
      const id = typeof value === 'string' ? value : value?.userData?.pageId;
      if (!disposed && targets[id]) onSelect(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true; partOutline.removeFromParent(); omniModel.dispose(); group.removeFromParent(); group.clear(); hitTargets.length = 0; release();
    },
  };
}
