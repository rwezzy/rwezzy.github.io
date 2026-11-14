import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadCarrier } from './soundscope-hardware.js?v=3d1';

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
  // Original, unbranded running-shoe silhouettes: layered soles, mesh panels,
  // collars, tongues, eyelets, and individual laces, rather than a shoe asset.
  const shoes = new THREE.Group(); shoes.name = 'Running — stacked training shoes';
  shoes.position.set(-.90, .003, .10); shoes.rotation.y = -.27; group.add(shoes);
  const knit = material('#394249', { roughness: .96, metalness: 0 });
  const soleFoam = material('#e4e6db', { roughness: .86, metalness: 0 });
  const shoeAccent = material('#a7b36f', { roughness: .72, metalness: 0 });
  const laceMaterial = material('#d6ddd4', { roughness: .88, metalness: 0 });
  const soleOutline = new THREE.Shape();
  soleOutline.moveTo(-.029, -.105);
  soleOutline.bezierCurveTo(-.044, -.106, -.043, -.057, -.035, -.023);
  soleOutline.bezierCurveTo(-.048, .018, -.050, .069, -.034, .099);
  soleOutline.bezierCurveTo(-.017, .124, .027, .124, .044, .096);
  soleOutline.bezierCurveTo(.052, .062, .046, .022, .036, -.020);
  soleOutline.bezierCurveTo(.034, -.053, .043, -.103, .026, -.106);
  soleOutline.quadraticCurveTo(0, -.117, -.029, -.105);
  function soleLayer(depth, appearance, parent, y, scale = 1) {
    const geometry = keep(new THREE.ExtrudeGeometry(soleOutline, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .0018, bevelThickness: .0012, curveSegments: 20 }));
    geometry.rotateX(-Math.PI / 2);
    const object = mesh(geometry, appearance, parent); object.position.y = y; object.scale.set(scale, 1, scale);
    return object;
  }
  function makeShoe(parent, upper) {
    const shoe = new THREE.Group(); parent.add(shoe);
    soleLayer(.004, rubber, shoe, 0);
    soleLayer(.012, soleFoam, shoe, .004, .985);
    soleLayer(.003, shoeAccent, shoe, .016, .97);
    const upperGeometry = keep(new THREE.SphereGeometry(1, 36, 20));
    const forefoot = mesh(upperGeometry, knit, shoe); forefoot.scale.set(.043, .027, .092); forefoot.position.set(.002, .028, -.025);
    const heel = mesh(upperGeometry, knit, shoe); heel.scale.set(.034, .044, .046); heel.position.set(0, .039, .071);
    const opening = mesh(keep(new THREE.SphereGeometry(1, 28, 16)), rubber, shoe); opening.scale.set(.024, .0015, .032); opening.position.set(0, .085, .068);
    const collar = mesh(keep(new THREE.TorusGeometry(.026, .005, 10, 36)), knit, shoe);
    collar.rotation.x = Math.PI / 2; collar.scale.y = 1.22; collar.position.set(0, .087, .068);
    const tongue = mesh(box(.035, .007, .065, .003), knit, shoe); tongue.position.set(0, .052, .015); tongue.rotation.x = -.2;
    for (let i = 0; i < 5; i++) {
      const z = -.017 + i * .011, y = .052 + i * .003;
      for (const side of [-1, 1]) {
        const eyelet = mesh(keep(new THREE.TorusGeometry(.002, .00065, 6, 12)), shoeAccent, shoe);
        eyelet.rotation.x = Math.PI / 2; eyelet.position.set(side * .018, y, z);
      }
      tubeBetween([-.018, y + .001, z], [.018, y + .0035, z + .009], .0011, laceMaterial, shoe);
      tubeBetween([.018, y + .001, z], [-.018, y + .0035, z + .009], .0011, laceMaterial, shoe);
    }
    // Small stitched panels and ventilation perforations remain code-native.
    for (const side of [-1, 1]) {
      tubeBetween([side * .030, .040, .071], [side * .039, .036, -.028], .0017, shoeAccent, shoe);
      tubeBetween([side * .038, .028, -.028], [side * .028, .027, -.087], .001, laceMaterial, shoe);
      for (let i = 0; i < 7; i++) {
        const vent = mesh(keep(new THREE.CircleGeometry(.0008, 7)), rubber, shoe);
        vent.rotation.y = side * Math.PI / 2; vent.position.set(side * .040, .037, -.065 + i * .009);
      }
    }
    if (upper) { shoe.position.set(.010, .087, -.014); shoe.rotation.set(.10, .18, -.12); }
    return shoe;
  }
  makeShoe(shoes, false); makeShoe(shoes, true);
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

  // ------------------------------------------------------------- About frame
  // Keep the portrait outside the carrier's silhouette, with a slight inward
  // turn toward the arm rather than facing across the entire desk.
  const frame = new THREE.Group(); frame.name = 'About — portrait frame'; frame.position.set(-.59, 0, .015); frame.rotation.y = .16; group.add(frame);
  const frameFace = new THREE.Group(); frameFace.position.set(0, .132, 0); frameFace.rotation.x = -.08; frame.add(frameFace);
  const walnut = material('#4e3930', { roughness: .45, metalness: 0 });
  const frameBack = pageHit(mesh(box(.184, .244, .012, .002), walnut, frameFace), 'about');
  const mount = plane(.166, .224, material('#ebe6d8', { roughness: .95 }), frameFace); mount.position.z = .0062;
  const nameCard = canvasMap(768, 1000, (ctx, w, h) => {
    ctx.fillStyle = '#e5e5d9'; ctx.fillRect(0, 0, w, h);
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, '#ffffff45'); wash.addColorStop(1, '#a5b29850'); ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#96a18b'; ctx.lineWidth = 2; ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.textAlign = 'center'; ctx.fillStyle = '#40513a'; ctx.font = '400 270px Georgia, serif'; ctx.fillText('kr.', w / 2, 455);
    ctx.fillStyle = '#293529'; ctx.font = '500 34px Figtree, Arial, sans-serif'; ctx.fillText('KEITH RWEZAHURA', w / 2, 650);
    ctx.fillStyle = '#53634b'; ctx.font = '500 25px Figtree, Arial, sans-serif'; ctx.fillText('KAMPALA · NEWARK', w / 2, 706);
    ctx.font = '500 28px Figtree, Arial, sans-serif'; ctx.fillText('ABOUT', w / 2, 860);
  });
  const portraitMaterial = basic({ map: nameCard });
  const portrait = pageHit(plane(.153, .1992, portraitMaterial, frameFace), 'about'); portrait.position.z = .0066;
  const glazing = plane(.164, .222, keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .055, roughness: .1, metalness: .08, clearcoat: .9, depthWrite: false })), frameFace);
  glazing.position.z = .007; glazing.raycast = () => {};
  tubeBetween([-.058, .165, -.012], [-.058, .004, -.074], .003, walnut, frame);
  tubeBetween([.058, .165, -.012], [.058, .004, -.074], .003, walnut, frame);
  const footBar = mesh(box(.14, .006, .018, .001), walnut, frame); footBar.position.set(0, .004, -.066);
  const portraitReady = portraitUrl ? loadTexture(portraitUrl).then(texture => {
    if (!texture || disposed) return;
    const imageAspect = texture.image.width / texture.image.height;
    const panelAspect = .153 / .1992;
    // Crop the portrait to its mat; never stretch a person's face.
    if (imageAspect > panelAspect) { texture.repeat.x = panelAspect / imageAspect; texture.offset.x = (1 - texture.repeat.x) / 2; }
    else { texture.repeat.y = imageAspect / panelAspect; texture.offset.y = (1 - texture.repeat.y) / 2; }
    portraitMaterial.map = texture; portraitMaterial.needsUpdate = true;
  }) : Promise.resolve();

  // ------------------------------------------------------------ Contact book
  // A top-bound notebook opens toward the rear, clear of the robot's plaque fan.
  const notebook = new THREE.Group(); notebook.name = 'Contact — opening notebook'; notebook.position.set(.56, .003, .035); notebook.rotation.y = -.12; group.add(notebook);
  const coverMaterial = material('#5c3e53', { roughness: .78, metalness: 0 });
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
    about: { id: 'about', kind: 'frame', object: frame, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .184, height: .244 },
    contact: { id: 'contact', kind: 'notebook', object: notebook, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .22, height: .165, openProgress: 0 },
    hobbies: { id: 'hobbies', title: 'Running', description: 'Running shoes — open the interests and off-clock section.', kind: 'object', object: shoes, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .16, height: .19 },
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
    targets.hobbies.center.set(0, .088, 0).applyMatrix4(shoes.matrixWorld);
    targets.hobbies.normal.set(0, .3, 1).normalize().transformDirection(shoes.matrixWorld);
    targets.hobbies.up.set(0, 1, -.3).normalize().transformDirection(shoes.matrixWorld);
    for (const record of assemblyRecords.values()) {
      record.target.center.copy(record.localCenter).applyMatrix4(record.object.matrixWorld);
      record.target.normal.copy(record.localNormal).transformDirection(record.object.matrixWorld);
      record.target.up.copy(record.localUp).transformDirection(record.object.matrixWorld);
    }
  }
  function setNotebookOpen(value) {
    if (disposed) return;
    const t = clamp01(value);
    coverHinge.rotation.x = -Math.PI * .95 * t;
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
  const tripodPart = new THREE.Group(), carrierPart = new THREE.Group(), boardPart = new THREE.Group(), cameraPart = new THREE.Group();
  tripodPart.name = 'SoundScope / tripod'; carrierPart.name = 'SoundScope / printed carrier';
  boardPart.name = 'SoundScope / microphone board'; cameraPart.name = 'SoundScope / depth camera';
  for (const part of [carrierPart, boardPart, cameraPart]) part.position.y = .116;
  rig.add(tripodPart, carrierPart, boardPart, cameraPart);
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
    { id: 'board', title: 'Four-microphone array', description: 'Four synchronized microphone recordings from the reSpeaker XVF3800 feed SoundScope’s direction-estimation algorithm.', object: boardPart, offset: [.055, .060, .105], turn: [0, -.10, 0] },
    { id: 'camera', title: 'RGB-D camera', description: 'The Gemini 2 provides image and depth measurements.', object: cameraPart, offset: [.045, .055, .130], turn: [0, .10, 0] },
    { id: 'carrier', title: 'Adjustable printed carrier', description: 'The original 18-part carrier keeps the microphone array and camera aligned while allowing their positions to be adjusted.', object: carrierPart, offset: [-.125, .020, -.035] },
    { id: 'tripod', title: 'Tripod support', description: 'Supports the microphone array, camera and adjustable carrier.', object: tripodPart, offset: [.200, 0, -.030] },
  ]);
  registerPartHits(soundRecord);
  const carrierReady = loadCarrier(resources).then(({ assembly, parts }) => {
    if (disposed) { release(); return; }
    assembly.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    const originalParts = new Set(parts.map(part => part.node || part));
    for (const child of [...assembly.children]) {
      let containsCarrier = false;
      child.traverse(object => { if (originalParts.has(object)) containsCarrier = true; });
      if (containsCarrier) carrierPart.add(child);
      else if (child.name.includes('PCB') || child.name.includes('microphone')) boardPart.add(child);
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
  // An enlarged desk miniature, explicitly a concept rather than finished CAD.
  const omni = new THREE.Group(); omni.name = 'OmniRing — wearable concept miniature';
  omni.position.set(.34, .004, .025); omni.rotation.y = -.22; omni.scale.setScalar(2.3); group.add(omni);
  const ringPart = new THREE.Group(), xiaoPart = new THREE.Group(), imuPart = new THREE.Group(), usbPart = new THREE.Group();
  ringPart.name = 'OmniRing / ring and enclosure'; xiaoPart.name = 'OmniRing / XIAO';
  imuPart.name = 'OmniRing / motion sensor'; usbPart.name = 'OmniRing / USB-C';
  xiaoPart.position.set(0, .034, 0);
  imuPart.position.set(.005, .036, -.0035);
  usbPart.position.set(0, .035, .0105);
  omni.add(ringPart, xiaoPart, imuPart, usbPart);
  const ringPolymer = material('#5e5067', { roughness: .46, metalness: .02 });
  const pcbGreen = material('#274f43', { roughness: .64, metalness: .08 });
  const solder = material('#bcc7c3', { roughness: .30, metalness: .76 });
  const goldPads = material('#c5ae69', { roughness: .42, metalness: .62 });
  const chipBlack = material('#20262a', { roughness: .62, metalness: .08 });
  const band = mesh(keep(new THREE.TorusGeometry(.0117, .0032, 16, 72)), ringPolymer, ringPart); band.position.y = .015;
  const innerBand = mesh(keep(new THREE.TorusGeometry(.0096, .0007, 10, 64)), material('#9e91a4', { roughness: .56 }), ringPart); innerBand.position.set(0, .015, .0005);
  const tray = mesh(box(.029, .0023, .025, .0017), ringPolymer, ringPart); tray.position.y = .030;
  for (const side of [-1, 1]) {
    const wall = mesh(box(.0022, .0055, .024, .0008), ringPolymer, ringPart); wall.position.set(side * .0136, .033, 0);
    const support = mesh(box(.0038, .007, .013, .001), ringPolymer, ringPart); support.position.set(side * .010, .027, 0);
    for (const z of [-.0085, .0085]) {
      const fastener = cylinder(.0011, .001, solder, ringPart, 14); fastener.position.set(side * .0115, .0353, z);
    }
  }
  const rearWall = mesh(box(.026, .0055, .0022, .0008), ringPolymer, ringPart); rearWall.position.set(0, .033, -.0115);
  const board = mesh(box(.021, .0016, .0175, .0006), pcbGreen, xiaoPart);
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const pad = mesh(box(.0016, .00045, .0013, .00016), goldPads, xiaoPart);
    pad.position.set(side * .0104, .0007, -.0072 + i * .0024);
    const via = cylinder(.00025, .0018, solder, xiaoPart, 8); via.position.set(side * .0103, 0, -.0072 + i * .0024);
  }
  const radioShield = mesh(box(.0085, .0015, .009, .00035), solder, xiaoPart); radioShield.position.set(-.0042, .0015, -.001);
  const mcu = mesh(box(.006, .0012, .006, .00025), chipBlack, xiaoPart); mcu.position.set(.0032, .0014, .0034);
  for (const [x, z, tint] of [[.0068, -.006, '#bbac85'], [-.006, .006, '#c6b994'], [.0078, .0057, '#a8b0a6'], [.003, -.007, '#b3a37c']]) {
    const component = mesh(box(.0016, .0008, .001, .0001), material(tint, { roughness: .65 }), xiaoPart); component.position.set(x, .0013, z);
  }
  const boardType = canvasMap(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#eef3e9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 95px Arial, sans-serif'; ctx.fillText('XIAO', w / 2, h / 2);
  });
  const xiaoLabel = plane(.008, .0025, basic({ map: boardType, transparent: true, depthWrite: false }), xiaoPart);
  xiaoLabel.rotation.x = -Math.PI / 2; xiaoLabel.position.set(-.0042, .00235, -.001);
  const imu = mesh(box(.004, .0014, .004, .00025), chipBlack, imuPart);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const pin = mesh(box(.0005, .0004, .00055, .00008), solder, imuPart); pin.position.set(side * .0021, -.0003, -.0011 + i * .0011);
  }
  const dot = cylinder(.00035, .0001, goldPads, imuPart, 10); dot.position.set(-.0011, .00075, -.0011);
  // A real opening through the metal connector shell, with an internal tongue.
  const connectorOutline = new THREE.Shape();
  const capsule = (path, halfWidth, halfHeight, clockwise = false) => {
    const straight = halfWidth - halfHeight;
    if (!clockwise) {
      path.moveTo(-straight, -halfHeight); path.lineTo(straight, -halfHeight);
      path.absarc(straight, 0, halfHeight, -Math.PI / 2, Math.PI / 2, false);
      path.lineTo(-straight, halfHeight); path.absarc(-straight, 0, halfHeight, Math.PI / 2, Math.PI * 1.5, false);
    } else {
      path.moveTo(-straight, halfHeight); path.lineTo(straight, halfHeight);
      path.absarc(straight, 0, halfHeight, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(-straight, -halfHeight); path.absarc(-straight, 0, halfHeight, -Math.PI / 2, -Math.PI * 1.5, true);
    }
    path.closePath();
  };
  capsule(connectorOutline, .0044, .00165);
  const connectorHole = new THREE.Path(); capsule(connectorHole, .0037, .0010, true); connectorOutline.holes.push(connectorHole);
  const shellGeometry = keep(new THREE.ExtrudeGeometry(connectorOutline, { depth: .0047, bevelEnabled: false, curveSegments: 20 }));
  shellGeometry.translate(0, 0, -.00235);
  mesh(shellGeometry, solder, usbPart);
  const tongue = mesh(box(.0058, .00045, .0021, .00012), chipBlack, usbPart); tongue.position.z = .0005;
  for (let i = 0; i < 8; i++) {
    const contact = mesh(keep(new THREE.BoxGeometry(.00028, .00008, .00125)), goldPads, usbPart);
    contact.position.set(-.0021 + i * .0006, .00027, .0007);
  }
  const omniRecord = registerAssembly('omniring', 'OmniRing', 'A schematic wearable concept: a XIAO-based gesture classifier, motion sensor, ring enclosure and USB-C connector. Dimensions and housing details here are illustrative.', omni, [
    { id: 'housing', title: 'Ring enclosure', description: 'A band and electronics tray for the wearable prototype.', object: ringPart, offset: [-.018, 0, -.008] },
    { id: 'xiao', title: 'XIAO nRF52840 Sense', description: 'Runs the gesture classifier on the wearable.', object: xiaoPart, offset: [0, .033, -.004], turn: [.10, -.10, 0] },
    { id: 'imu', title: 'Onboard motion sensor', description: 'The onboard six-axis sensor measures hand movement at 100 Hz. Its chip is separated here to explain its role.', object: imuPart, offset: [.031, .041, .001] },
    { id: 'usb-c', title: 'USB-C connector', description: 'Provides programming and power access through the open front of the enclosure.', object: usbPart, offset: [.010, .007, .036], turn: [0, -.10, 0] },
  ], [0, .48, 1]);
  registerPartHits(omniRecord); measureAssembly(omniRecord);

  const ready = Promise.allSettled([laptopReady, portraitReady, carrierReady]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') warnings.push({ asset: ['laptop screen', 'portrait', 'SoundScope carrier'][index], message: String(result.reason?.message || result.reason) });
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
      disposed = true; partOutline.removeFromParent(); group.removeFromParent(); group.clear(); hitTargets.length = 0; release();
    },
  };
}
