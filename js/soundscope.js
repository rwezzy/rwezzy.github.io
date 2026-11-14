import {
  AZIMUTH, DEFAULT_SPACING, ELEVATION, SOUNDS, rigFrame, searchEvents, simulate,
} from './soundscope-room.js?v=3d1';
import { describe, directionPhrase } from './soundscope-describe.js?v=3d1';

const root = document.querySelector('#soundscope');
if (root) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    initLab(root).catch(error => {
      console.warn('SoundScope room unavailable:', error);
      const say = root.querySelector('#ss-say');
      if (say) say.textContent = 'The 3D room could not load in this browser. The project description above still applies.';
    });
    import('./soundscope-hardware.js?v=3d1').then(module => module.initHardware(root.querySelector('.ss-hardware')))
      .catch(() => { root.querySelector('[data-hardware-status]').textContent = 'The 3D viewer could not load. You can still download the carrier model below.'; });
  }, { rootMargin: '300px' });
  observer.observe(root);
}

const ROOM = { min: { x: -2.8, y: 0, z: -2.4 }, max: { x: 2.8, y: 2.7, z: 2.4 } };
const DESK = { x: 0.55, z: 2.06, width: 1.3, depth: 0.6, height: 0.74 };
const FEED = { width: 640, height: 400, fov: 55 };
const ROUNDS = 5;
const MODEL = id => `models/room/${id}/${id}.gltf`;

// Furniture first, then the four things that make sounds. `on` names what an object starts on.
const FURNITURE = [
  { id: 'tv_cabinet', file: 'modern_wooden_cabinet', name: 'TV cabinet', at: [0, -2.13], turn: 0 },
  { id: 'sofa', file: 'sofa_03', name: 'sofa', at: [-1.3, -0.55], turn: Math.PI / 2 },
  { id: 'coffee_table', file: 'CoffeeTable_01', name: 'coffee table', at: [0.05, -0.7], turn: Math.PI / 2 },
  { id: 'armchair', file: 'ArmChair_01', name: 'armchair', at: [1.65, -0.35], turn: -2.2 },
  { id: 'shelf', file: 'Shelf_01', name: 'shelf', at: [-2.0, -2.4], turn: 0 },
  { id: 'side_table', file: 'side_table_01', name: 'side table', at: [2.3, -1.95], turn: -Math.PI / 4 },
  { id: 'plant', file: 'potted_plant_04', name: 'plant', at: [0.95, -2.15], turn: 0.4, on: 'tv_cabinet', scale: 1.5 },
];
const SOURCES = [
  { id: 'alarm', file: 'alarm_clock_01', name: 'alarm clock', sound: 'alarm', at: [0.2, -0.45], turn: 0.5, on: 'coffee_table', button: 'Ring the alarm clock' },
  { id: 'kettle', file: 'vintage_electric_kettle', name: 'kettle', sound: 'kettle', at: [2.3, -1.95], turn: -0.6, on: 'side_table', button: 'Boil the kettle' },
  { id: 'boombox', file: 'boombox', name: 'boombox', sound: 'music', at: [-2.3, -1.2], turn: Math.PI / 2, on: 'floor', button: 'Play the boombox' },
  { id: 'tv', file: 'Television_01', name: 'television', sound: 'speech', at: [-0.15, -2.15], turn: 0, on: 'tv_cabinet', scale: 1.35, button: 'Turn on the TV' },
];

async function initLab(root) {
  const $ = selector => root.querySelector(selector);
  const THREE = await import('three');
  const [{ GLTFLoader }, { OrbitControls }, { RGBELoader }, { loadCarrier }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'),
    import('three/addons/loaders/RGBELoader.js'), import('./soundscope-hardware.js?v=3d1'),
  ]);
  const canvas = $('#ss-room'), feed = $('#ss-feed'), feedCtx = feed.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = (text, hot = false) => { const el = $('#ss-say'); el.textContent = text; el.classList.toggle('hot', hot); };
  say('Loading the room…');

  // Textures can finish while model loading yields; defer rendering until setup is complete.
  let frame = 0, animating = false, active = true, audio = null;
  let renderReady = false;

  // ------------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2ee');
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.05, 40);
  camera.position.set(3.1, 2.7, 4.3);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-0.1, 0.55, -0.45);
  controls.enablePan = false; controls.enableDamping = false;
  controls.minDistance = 1.6; controls.maxDistance = 8; controls.maxPolarAngle = 1.48;
  controls.update();

  const loader = new GLTFLoader(), textures = new THREE.TextureLoader();
  const [environment] = await Promise.all([new RGBELoader().loadAsync('models/room/env/brown_photostudio_02_1k.hdr')]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(environment).texture;
  scene.environmentIntensity = 0.55;
  environment.dispose(); pmrem.dispose();

  // ------------------------------------------------------------------- the room
  const surfaces = [];            // meshes that objects can rest on or that block the view
  const items = new Map();        // id -> item record
  const register = (object, item) => {
    object.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.item = item; surfaces.push(child); } });
  };
  const floorMaps = ['diff', 'rough', 'nor'].map(kind => {
    const texture = textures.load(`models/room/floor/laminate_floor_02_${kind}_1k.jpg`, () => {
      if (root.dataset.roomReady === 'ready') { captureFeed(); drawFeed(); } else requestRender();
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2.8, 2.4); texture.anisotropy = 8;
    if (kind === 'diff') texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  const width = ROOM.max.x - ROOM.min.x, depth = ROOM.max.z - ROOM.min.z, height = ROOM.max.y;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: floorMaps[0], roughnessMap: floorMaps[1], normalMap: floorMaps[2], roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  floor.userData.item = { name: 'floor', kind: 'floor' };
  scene.add(floor); surfaces.push(floor);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#ebe6de', roughness: 0.93 });
  const walls = [
    { name: 'back wall', size: [width, height], position: [0, height / 2, ROOM.min.z], turn: 0 },
    { name: 'front wall', size: [width, height], position: [0, height / 2, ROOM.max.z], turn: Math.PI },
    { name: 'left wall', size: [depth, height], position: [ROOM.min.x, height / 2, 0], turn: Math.PI / 2 },
    { name: 'right wall', size: [depth, height], position: [ROOM.max.x, height / 2, 0], turn: -Math.PI / 2 },
  ];
  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...wall.size), wallMaterial);
    mesh.position.set(...wall.position); mesh.rotation.y = wall.turn; mesh.receiveShadow = true;
    mesh.userData.item = { name: wall.name, kind: 'wall' };
    scene.add(mesh); surfaces.push(mesh);
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(wall.size[0], 0.09, 0.015), new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.6 }));
    skirting.position.set(wall.position[0], 0.045, wall.position[2]); skirting.rotation.y = wall.turn;
    skirting.translateZ(0.008); scene.add(skirting);
  }
  // A window on the left wall: a bright pane plus the sunlight that comes through it.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ color: '#f7fbff' }));
  pane.position.set(ROOM.min.x + 0.006, 1.55, -0.9); pane.rotation.y = Math.PI / 2; scene.add(pane);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.5 });
  for (const [w, h, y, z] of [[1.6, 0.06, 2.18, -0.9], [1.6, 0.06, 0.92, -0.9], [0.06, 1.3, 1.55, -1.67], [0.06, 1.3, 1.55, -0.13], [0.04, 1.2, 1.55, -0.9]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w), frameMaterial);
    bar.position.set(ROOM.min.x + 0.02, y, z); scene.add(bar);
  }
  scene.add(new THREE.HemisphereLight('#fffaf0', '#8b7d6b', 0.35));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
  sun.position.set(-5.5, 4.2, -1.4); sun.target.position.set(0.4, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 14 });
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight('#ffd9a8', 1.6, 6, 1.6);
  lamp.position.set(1.6, 2.3, 1.2); scene.add(lamp);

  // The desk with the laptop and the SoundScope rig on a small tripod.
  const deskGroup = new THREE.Group();
  const walnut = new THREE.MeshPhysicalMaterial({ color: '#6b4a32', roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2f31', roughness: 0.38, metalness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.width, 0.035, DESK.depth), walnut);
  top.position.set(0, DESK.height - 0.0175, 0); deskGroup.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, DESK.height - 0.035, 0.04), steel);
    leg.position.set(sx * (DESK.width / 2 - 0.05), (DESK.height - 0.035) / 2, sz * (DESK.depth / 2 - 0.05)); deskGroup.add(leg);
  }
  deskGroup.position.set(DESK.x, 0, DESK.z);
  const deskItem = { name: 'desk', kind: 'furniture' };
  scene.add(deskGroup); deskGroup.updateMatrixWorld(true); register(deskGroup, deskItem);

  const rigGroup = new THREE.Group();
  const tripodBase = new THREE.Vector3(DESK.x - 0.25, DESK.height, DESK.z - 0.08), headHeight = 0.34;
  for (let k = 0; k < 3; k += 1) {
    const angle = k * 2 * Math.PI / 3 + 0.3, foot = new THREE.Vector3(Math.cos(angle) * 0.1, 0, Math.sin(angle) * 0.1);
    const head = new THREE.Vector3(0, headHeight - 0.03, 0), legLength = foot.distanceTo(head);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, legLength, 10), steel);
    leg.position.copy(foot).add(head).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), head.clone().sub(foot).normalize());
    rigGroup.add(leg);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 20, 14), steel);
  ball.position.y = headHeight - 0.025; rigGroup.add(ball);
  const carrier = await loadCarrier();
  carrier.assembly.rotation.y = Math.PI;                // the carrier's +Z faces the room (-z)
  carrier.assembly.position.y = headHeight + 0.0;
  rigGroup.add(carrier.assembly);
  rigGroup.position.copy(tripodBase);
  scene.add(rigGroup);
  rigGroup.traverse(child => { if (child.isMesh) child.castShadow = true; });
  const lens = new THREE.Vector3(tripodBase.x, tripodBase.y + headHeight, tripodBase.z);
  const micCenter = new THREE.Vector3(tripodBase.x, tripodBase.y + headHeight + 0.128, tripodBase.z - 0.0146);
  const rig = { position: { ...lens }, micCenter: { x: micCenter.x, y: micCenter.y, z: micCenter.z }, yaw: 0 };
  const rigCamera = new THREE.PerspectiveCamera(FEED.fov, FEED.width / FEED.height, 0.05, 20);
  rigCamera.position.copy(lens); rigCamera.lookAt(lens.x, lens.y, lens.z - 1);

  // ------------------------------------------------------------------ the models
  const loadItem = async spec => {
    const gltf = await loader.loadAsync(MODEL(spec.file));
    const object = gltf.scene;
    object.rotation.y = spec.turn ?? 0;
    if (spec.scale) object.scale.setScalar(spec.scale);
    return object;
  };
  const restingHeight = (x, z, ignore) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(surfaces, false).find(h => !ignore || h.object.userData.item !== ignore);
    return hit ? { y: hit.point.y, item: hit.object.userData.item } : { y: 0, item: floor.userData.item };
  };
  const loaded = await Promise.all([...FURNITURE, ...SOURCES].map(spec => loadItem(spec).then(object => ({ spec, object }))));
  for (const { spec, object } of loaded.filter(entry => !entry.spec.sound && !entry.spec.on)) place(spec, object);
  for (const { spec, object } of loaded.filter(entry => !entry.spec.sound && entry.spec.on)) place(spec, object);
  for (const { spec, object } of loaded.filter(entry => entry.spec.sound)) place(spec, object);
  function place(spec, object) {
    const item = { ...spec, kind: spec.sound ? 'object' : 'furniture', object };
    const [x, z] = spec.at, rest = spec.on && spec.on !== 'floor' ? restingHeight(x, z) : { y: 0 };
    object.position.set(x, rest.y, z);
    scene.add(object); object.updateMatrixWorld(true);   // later raycasts need its real position
    register(object, item); items.set(spec.id, item);
  }
  // The laptop shows the SoundScope feed on its screen.
  const laptop = await loader.loadAsync(MODEL('classic_laptop'));
  laptop.scene.scale.setScalar(0.62); laptop.scene.rotation.y = -0.35;
  laptop.scene.position.set(DESK.x + 0.28, DESK.height, DESK.z + 0.02);
  scene.add(laptop.scene); register(laptop.scene, { name: 'laptop', kind: 'furniture' });
  const screenTexture = new THREE.CanvasTexture(feed);
  screenTexture.colorSpace = THREE.SRGBColorSpace; screenTexture.flipY = false;
  laptop.scene.traverse(child => {
    if (child.isMesh && child.material?.name === 'classic_laptop_screen') {
      child.material = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    }
  });

  // ------------------------------------------------------------ helpers in the room
  const teal = new THREE.Color('#14b5aa');
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 10),
    new THREE.MeshBasicMaterial({ color: teal, transparent: true, opacity: 0.85 }));
  const beamTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), new THREE.MeshBasicMaterial({ color: teal }));
  const truthMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: '#e8578f' }));
  const guessMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: '#3d7be0' }));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#e8578f', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  for (const helper of [beam, beamTip, truthMarker, guessMarker, pulse]) { helper.visible = false; scene.add(helper); }
  function showBeam(direction, distance) {
    const end = micCenter.clone().addScaledVector(direction, distance);
    beam.position.copy(micCenter).add(end).multiplyScalar(0.5);
    beam.scale.set(1, distance, 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    beamTip.position.copy(end);
    beam.visible = beamTip.visible = true;
  }

  // Clickable name tags that follow the sound objects.
  const tags = new Map();
  for (const spec of SOURCES) {
    const tag = document.createElement('button');
    tag.type = 'button'; tag.className = 'ss-tag'; tag.textContent = spec.name;
    tag.setAttribute('aria-label', `${spec.button}`);
    tag.addEventListener('click', () => { if (state.mode === 'explore') play(items.get(spec.id)); });
    $('.ss-stage').append(tag); tags.set(spec.id, tag);
  }

  // ------------------------------------------------------------------ state
  const state = { mode: 'explore', spacing: DEFAULT_SPACING, echo: 0.25, last: null, reveal: 1, events: [], game: null };
  const buffers = new Map();

  // ------------------------------------------------------------ rendering loop
  function placeTags() {
    const rect = canvas.getBoundingClientRect();
    for (const [id, tag] of tags) {
      const item = items.get(id), box = new THREE.Box3().setFromObject(item.object);
      const point = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.08, (box.min.z + box.max.z) / 2).project(camera);
      const visible = point.z < 1 && Math.abs(point.x) < 1.05 && Math.abs(point.y) < 1.05 && state.mode === 'explore';
      tag.hidden = !visible;
      if (visible) { tag.style.left = `${(point.x + 1) / 2 * rect.width}px`; tag.style.top = `${(1 - point.y) / 2 * rect.height}px`; }
    }
  }
  function render() {
    renderer.render(scene, camera);
    placeTags();
  }
  function requestRender() {
    if (!renderReady || frame || !active) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); if (animating) requestRender(); });
  }
  controls.addEventListener('change', requestRender);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => { active = entries[0].isIntersecting; if (active) requestRender(); }).observe(canvas);

  // ------------------------------------------------- the SoundScope camera feed
  const target = new THREE.WebGLRenderTarget(FEED.width, FEED.height, { colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(FEED.width * FEED.height * 4);
  const base = document.createElement('canvas'); base.width = FEED.width; base.height = FEED.height;
  const baseCtx = base.getContext('2d');
  feed.width = FEED.width; feed.height = FEED.height;
  function captureFeed() {
    const hidden = [rigGroup, beam, beamTip, truthMarker, guessMarker, pulse].map(object => [object, object.visible]);
    hidden.forEach(([object]) => { object.visible = false; });
    renderer.setRenderTarget(target); renderer.render(scene, rigCamera); renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(target, 0, 0, FEED.width, FEED.height, pixels);
    hidden.forEach(([object, visible]) => { object.visible = visible; });
    const image = baseCtx.createImageData(FEED.width, FEED.height), rowBytes = FEED.width * 4;
    for (let y = 0; y < FEED.height; y += 1) image.data.set(pixels.subarray((FEED.height - 1 - y) * rowBytes, (FEED.height - y) * rowBytes), y * rowBytes);
    baseCtx.putImageData(image, 0, 0);
  }
  const heat = document.createElement('canvas'), heatCtx = heat.getContext('2d');
  heat.width = 160; heat.height = 100;
  const tanX = Math.tan(FEED.fov * Math.PI / 360) * FEED.width / FEED.height, tanY = Math.tan(FEED.fov * Math.PI / 360);
  function paintHeat(result) {
    const image = heatCtx.createImageData(heat.width, heat.height), { map, columns, rows } = result;
    for (let y = 0; y < heat.height; y += 1) for (let x = 0; x < heat.width; x += 1) {
      const dx = ((x + 0.5) / heat.width * 2 - 1) * tanX, dy = (1 - (y + 0.5) / heat.height * 2) * tanY;
      const azimuth = Math.atan(dx) * 180 / Math.PI, elevation = Math.atan2(dy, Math.hypot(1, dx)) * 180 / Math.PI;
      const column = Math.min(columns - 1.001, Math.max(0, azimuth - AZIMUTH.min)), row = Math.min(rows - 1.001, Math.max(0, ELEVATION.max - elevation));
      const c0 = Math.floor(column), r0 = Math.floor(row), fc = column - c0, fr = row - r0;
      const at = (r, c) => map[r * columns + c];
      const value = (at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc) * fr;
      const strength = Math.max(0, (value - 0.35) / 0.65), i = (y * heat.width + x) * 4;
      // teal at the edge of the support region, warming to yellow at the peak
      image.data[i] = Math.round(20 + 230 * strength ** 2); image.data[i + 1] = Math.round(181 + 40 * strength); image.data[i + 2] = Math.round(170 - 110 * strength);
      image.data[i + 3] = Math.round(Math.min(1, strength * 1.4) * 170);
    }
    heatCtx.putImageData(image, 0, 0);
  }
  function project(point) {
    const p = point.clone().project(rigCamera);
    return { x: (p.x + 1) / 2 * FEED.width, y: (1 - p.y) / 2 * FEED.height, inFront: p.z < 1 };
  }
  function drawFeed() {
    feedCtx.drawImage(base, 0, 0);
    const shot = state.last, showing = shot && (state.mode === 'explore' || shot.revealed);
    if (showing) {
      feedCtx.save(); feedCtx.globalAlpha = state.reveal; feedCtx.imageSmoothingEnabled = true;
      feedCtx.drawImage(heat, 0, 0, FEED.width, FEED.height); feedCtx.restore();
      if (state.reveal > 0.9) {
        if (shot.surfaceBox) {
          const corners = [];
          for (const x of [shot.surfaceBox.min.x, shot.surfaceBox.max.x]) for (const y of [shot.surfaceBox.min.y, shot.surfaceBox.max.y]) for (const z of [shot.surfaceBox.min.z, shot.surfaceBox.max.z]) corners.push(project(new THREE.Vector3(x, y, z)));
          const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
          const left = Math.max(4, Math.min(...xs)), right = Math.min(FEED.width - 4, Math.max(...xs)), top = Math.max(4, Math.min(...ys)), bottom = Math.min(FEED.height - 4, Math.max(...ys));
          const color = shot.facts.surface?.canMake ? '#3ddc84' : '#ffffff';
          feedCtx.strokeStyle = color; feedCtx.lineWidth = 2; feedCtx.setLineDash(shot.facts.surface?.canMake ? [] : [6, 5]);
          feedCtx.strokeRect(left, top, right - left, bottom - top); feedCtx.setLineDash([]);
          const tag = `${shot.facts.surface.name} · ${shot.facts.depth.toFixed(1)} m${shot.facts.surface.canMake ? '' : ' · not the source'}`;
          feedCtx.font = '600 13px Figtree, sans-serif'; const w = feedCtx.measureText(tag).width + 14;
          feedCtx.fillStyle = 'rgba(16,28,26,.82)'; feedCtx.fillRect(left, Math.max(0, top - 24), w, 22);
          feedCtx.fillStyle = color; feedCtx.fillText(tag, left + 7, Math.max(16, top - 8));
        }
        const p = project(micCenter.clone().addScaledVector(shot.direction, 3));
        feedCtx.strokeStyle = '#fff'; feedCtx.lineWidth = 2;
        feedCtx.beginPath(); feedCtx.arc(p.x, p.y, 11, 0, Math.PI * 2); feedCtx.stroke();
        for (const [ax, ay, bx, by] of [[-18, 0, -12, 0], [12, 0, 18, 0], [0, -18, 0, -12], [0, 12, 0, 18]]) { feedCtx.beginPath(); feedCtx.moveTo(p.x + ax, p.y + ay); feedCtx.lineTo(p.x + bx, p.y + by); feedCtx.stroke(); }
      }
    }
    // App chrome: a status line like the live viewer's.
    feedCtx.fillStyle = 'rgba(16,28,26,.72)'; feedCtx.fillRect(0, FEED.height - 26, FEED.width, 26);
    feedCtx.font = '12px "DM Mono", monospace'; feedCtx.fillStyle = '#d7efe6';
    const status = !shot ? 'listening · 4 mics · 16 kHz' : state.mode === 'game' && !shot.revealed ? 'listening · hidden sound' :
      `${SOUNDS[shot.sound].label.toLowerCase()} · ${directionPhrase(shot.result.estimate.azimuth, shot.result.estimate.elevation)} · cone ${shot.result.spread}°²`;
    feedCtx.fillText(status, 10, FEED.height - 9);
    feedCtx.fillStyle = '#e8578f'; feedCtx.beginPath(); feedCtx.arc(FEED.width - 16, FEED.height - 13, 4, 0, Math.PI * 2); feedCtx.fill();
    screenTexture.needsUpdate = true;
    requestRender();
  }

  // ------------------------------------------------------------------- audio
  async function sound(type, position) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
      if (!buffers.has(type)) {
        const voice = SOUNDS[type], length = Math.ceil(voice.duration * audio.sampleRate);
        const buffer = audio.createBuffer(1, length, audio.sampleRate), data = buffer.getChannelData(0);
        let peak = 0;
        for (let n = 0; n < length; n += 1) { data[n] = voice.render(n / audio.sampleRate); peak = Math.max(peak, Math.abs(data[n])); }
        for (let n = 0; n < length; n += 1) data[n] *= 0.6 / (peak || 1);
        buffers.set(type, buffer);
      }
      // You hear it from where you are looking: the listener is the room view's camera.
      const listener = audio.listener, forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      if (listener.positionX) {
        listener.positionX.value = camera.position.x; listener.positionY.value = camera.position.y; listener.positionZ.value = camera.position.z;
        listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z;
        listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
      } else {
        listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
        listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
      const node = audio.createBufferSource(), panner = new PannerNode(audio, {
        panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1.5, positionX: position.x, positionY: position.y, positionZ: position.z,
      });
      node.buffer = buffers.get(type); node.connect(panner).connect(audio.destination); node.start();
      return true;
    } catch { return false; }
  }

  // ------------------------------------------------------- analysis and wording
  const raycaster = new THREE.Raycaster();
  const firstHit = (from, direction, ignore = null) => {
    raycaster.set(from, direction); raycaster.far = 12;
    return raycaster.intersectObjects(surfaces, false).find(hit => hit.object.userData.item !== ignore && hit.object.userData.item !== deskItem) ?? null;
  };
  function itemBox(item) { return item.object ? new THREE.Box3().setFromObject(item.object) : null; }
  function analyse(source, type, seed = 1) {
    const result = simulate({ source, rig, room: ROOM, sound: type, spacing: state.spacing, echo: state.echo, seed });
    const direction = new THREE.Vector3(result.estimateVector.x, result.estimateVector.y, result.estimateVector.z).normalize();
    let hit = firstHit(micCenter, direction);
    let hitItem = hit?.object.userData.item ?? null;
    // Like the device, prefer a visible object that could make this kind of sound and lies
    // within a few degrees of the estimate, rather than whatever surface the centre line touches.
    let best = Math.max(5, Math.min(9, Math.sqrt(result.spread) / 8));
    for (const item of items.values()) {
      if (item.sound !== type) continue;
      const center = itemBox(item).getCenter(new THREE.Vector3()), toward = center.clone().sub(micCenter).normalize();
      const off = toward.angleTo(direction) * 180 / Math.PI, seen = firstHit(micCenter, toward);
      if (off < best && seen?.object.userData.item === item) { best = off; hit = seen; hitItem = item; }
    }
    let support;
    if (hitItem?.kind === 'object') {
      const box = itemBox(hitItem), below = restingHeight((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, hitItem);
      support = below.item?.name;
    }
    const surface = hitItem ? { name: hitItem.name, kind: hitItem.kind, canMake: hitItem.sound === type, support } : null;
    // The nearest other visible object in the camera image, for "left of the television".
    let neighbour = null;
    if (hit) {
      const spot = project(hit.point);
      let best = Infinity;
      for (const item of items.values()) {
        if (item === hitItem || item.name === support) continue;
        const box = itemBox(item), center = box.getCenter(new THREE.Vector3()), p = project(center);
        if (!p.inFront || p.x < 0 || p.x > FEED.width || p.y < 0 || p.y > FEED.height) continue;
        const toward = center.clone().sub(micCenter).normalize(), blocker = firstHit(micCenter, toward);
        if (blocker && blocker.object.userData.item !== item) continue;      // not visible to the camera
        const distance = Math.hypot(p.x - spot.x, p.y - spot.y);
        if (distance < best && distance < FEED.width * 0.35) { best = distance; neighbour = { name: item.name, side: spot.x < p.x ? 'left' : 'right' }; }
      }
    }
    let rival = null;
    if (result.rival && result.rival.strength > 0.65) {
      const rf = rigFrame(rig, state.spacing), a = result.rival.azimuth * Math.PI / 180, e = result.rival.elevation * Math.PI / 180;
      const v = new THREE.Vector3(
        rf.forward.x * Math.cos(e) * Math.cos(a) + rf.right.x * Math.cos(e) * Math.sin(a),
        Math.sin(e), rf.forward.z * Math.cos(e) * Math.cos(a) + rf.right.z * Math.cos(e) * Math.sin(a)).normalize();
      rival = firstHit(micCenter, v)?.object.userData.item?.name ?? null;
    }
    const facts = {
      label: SOUNDS[type].label, azimuth: result.estimate.azimuth, elevation: result.estimate.elevation,
      surface, depth: hit ? hit.distance : null, neighbour, rival, spread: result.spread,
    };
    return { result, direction, hit, facts, words: describe(facts), surfaceBox: hitItem?.object ? itemBox(hitItem) : null, sound: type, source };
  }
  function showShot(shot) {
    state.last = shot;
    paintHeat(shot.result);
    if (shot.hit) showBeam(shot.direction, shot.hit.distance); else showBeam(shot.direction, 3);
    beam.visible = beamTip.visible = state.mode === 'explore' || shot.revealed;
    captureFeed();
    const truth = shot.result.truth;
    $('#ss-caption').textContent = state.mode === 'game' && !shot.revealed ? 'Listening… SoundScope will show its answer after your guess.' : shot.words.caption;
    $('#ss-out-estimate').textContent = `${directionPhrase(shot.result.estimate.azimuth, shot.result.estimate.elevation)} (${Math.round(shot.result.estimate.azimuth)}°, ${Math.round(shot.result.estimate.elevation)}°)`;
    $('#ss-out-actual').textContent = `${Math.round(truth.azimuth)}°, ${Math.round(truth.elevation)}°`;
    $('#ss-out-error').textContent = `${shot.result.errorDegrees.toFixed(1)}°`;
    $('#ss-out-depth').textContent = shot.hit ? `${shot.hit.distance.toFixed(2)} m to the ${shot.facts.surface.name}` : '—';
    $('#ss-readout').hidden = state.mode === 'game' && !shot.revealed;
    reveal();
  }
  function reveal() {
    if (reduceMotion) { state.reveal = 1; drawFeed(); return; }
    const began = performance.now();
    animating = true;
    const step = now => {
      state.reveal = Math.min(1, (now - began) / 450);
      drawFeed();
      if (state.reveal < 1) requestAnimationFrame(step); else animating = false;
    };
    state.reveal = 0; requestAnimationFrame(step);
  }
  function ripple(position) {
    if (reduceMotion) return;
    pulse.position.copy(position); pulse.visible = true;
    const began = performance.now();
    animating = true;
    const step = now => {
      const t = (now - began) / 900;
      pulse.lookAt(camera.position);
      pulse.scale.setScalar(0.05 + t * 0.6); pulse.material.opacity = Math.max(0, 0.8 * (1 - t));
      requestRender();
      if (t < 1) requestAnimationFrame(step); else { pulse.visible = false; animating = false; requestRender(); }
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ explore
  const sourceCenter = item => itemBox(item).getCenter(new THREE.Vector3());
  async function play(item) {
    const center = sourceCenter(item);
    const shot = analyse(center, item.sound);
    shot.item = item;
    showShot(shot);
    ripple(center);
    say(`${SOUNDS[item.sound].label} · ${directionPhrase(shot.result.estimate.azimuth, shot.result.estimate.elevation)}`, true);
    const event = {
      id: Date.now() + Math.random(), time: Date.now() / 1000, type: item.sound, label: SOUNDS[item.sound].label,
      caption: shot.words.caption, keywords: [...SOUNDS[item.sound].keywords, ...shot.words.keywords],
      item, position: item.object.position.clone(), spacing: state.spacing, echo: state.echo, error: shot.result.errorDegrees,
    };
    state.events.push(event); if (state.events.length > 40) state.events.shift();
    $('#ss-query').value = ''; showEvents();
    if (!await sound(item.sound, center)) say('Audio is unavailable in this browser; the direction experiment still works.');
  }
  function rerun() {
    clearTimeout(rerun.timer);
    rerun.timer = setTimeout(() => {
      const shot = state.last;
      if (!shot) return;
      const next = analyse(shot.source, shot.sound, shot.seed ?? 1);
      Object.assign(next, { item: shot.item, revealed: shot.revealed, seed: shot.seed, guess: shot.guess });
      showShot(next);
      if (state.mode === 'game' && shot.revealed) scoreRound(next);
    }, 120);
  }

  // ---------------------------------------------------------------- dragging
  const pointer = new THREE.Vector2(), sources = [...items.values()].filter(item => item.kind === 'object');
  let drag = null;
  function pick(event, objects) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera); raycaster.far = 40;
    return raycaster.intersectObjects(objects, true)[0] ?? null;
  }
  const sourceMeshes = () => sources.map(item => item.object);
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, item: null, moved: false };
    if (state.mode !== 'explore') return;
    const hit = pick(event, sourceMeshes());
    if (hit) { drag.item = hit.object.userData.item; controls.enabled = false; canvas.setPointerCapture(event.pointerId); }
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag?.item) {
      if (state.mode === 'explore' && !drag) canvas.style.cursor = pick(event, sourceMeshes()) ? 'grab' : 'default';
      return;
    }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4 && !drag.moved) return;
    drag.moved = true; canvas.style.cursor = 'grabbing';
    const hit = pick(event, surfaces.filter(mesh => mesh.userData.item !== drag.item && mesh.userData.item.kind !== 'wall'));
    if (!hit || hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < 0.6) return;
    const p = hit.point, margin = 0.25;
    drag.item.object.position.set(Math.min(ROOM.max.x - margin, Math.max(ROOM.min.x + margin, p.x)), p.y, Math.min(ROOM.max.z - margin, Math.max(ROOM.min.z + margin, p.z)));
    if (micCenter.distanceTo(drag.item.object.position) < 0.6) drag.item.object.position.z = Math.min(drag.item.object.position.z, micCenter.z - 0.6);
    requestRender();
  });
  const finish = event => {
    const current = drag; drag = null; controls.enabled = true;
    if (!current) return;
    if (current.item) {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = 'grab';
      if (!current.moved) play(current.item);
      else say(`Moved the ${current.item.name}. Select it to play its sound.`);
      return;
    }
    const clicked = Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5;
    if (clicked && state.mode === 'game') guess(event);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  // ---------------------------------------------------------------- the game
  function newGame() {
    state.game = { round: 0, history: [], current: null };
    truthMarker.visible = guessMarker.visible = beam.visible = beamTip.visible = false;
    state.last = null; captureFeed(); drawFeed(); showGame();
    $('#ss-caption').textContent = 'Press “Play a hidden sound”, listen from where you are looking, then click where you think it came from.';
    $('#ss-readout').hidden = true;
  }
  async function hidden() {
    const game = state.game;
    if (game.current && !game.current.revealed) { sound(game.current.sound, game.current.source); return; }
    if (game.round >= ROUNDS) newGame();
    const types = Object.keys(SOUNDS), type = types[Math.floor(Math.random() * types.length)];
    let source;
    for (let tries = 0; tries < 50 && !source; tries += 1) {
      const x = ROOM.min.x + 0.4 + Math.random() * (width - 0.8), z = ROOM.min.z + 0.4 + Math.random() * (depth - 1.6);
      const rest = restingHeight(x, z);
      const candidate = new THREE.Vector3(x, rest.y + 0.12, z);
      if (candidate.distanceTo(micCenter) > 1.2 && candidate.y < 1.9) source = candidate;
    }
    const seed = Math.floor(Math.random() * 1e6);
    const shot = analyse(source, type, seed);
    Object.assign(shot, { revealed: false, seed });
    game.round += 1; game.current = shot;
    truthMarker.visible = guessMarker.visible = false;
    showShot(shot);
    say('Where did that come from? Click the spot in the room.', true);
    showGame();
    await sound(type, source);
  }
  function guess(event) {
    const shot = state.game?.current;
    if (!shot || shot.revealed) return;
    const hit = pick(event, surfaces);
    if (!hit) return;
    shot.guess = hit.point.clone(); shot.revealed = true;
    guessMarker.position.copy(shot.guess); guessMarker.visible = true;
    truthMarker.position.copy(shot.source); truthMarker.visible = true;
    scoreRound(shot);
    state.game.history.push(shot);
    showShot(shot); showGame();
  }
  function scoreRound(shot) {
    const truth = shot.source;
    shot.yourMiss = shot.guess.distanceTo(truth);
    // SoundScope's miss: how far the true source lies from its estimated direction.
    const toTruth = truth.clone().sub(micCenter), along = toTruth.dot(shot.direction);
    shot.machineMiss = toTruth.clone().sub(shot.direction.clone().multiplyScalar(along)).length();
    const verdict = shot.yourMiss < shot.machineMiss ? 'You beat SoundScope this round.' : shot.yourMiss < 0.6 ? 'Close.' : 'SoundScope wins this round.';
    say(`You were ${shot.yourMiss.toFixed(1)} m off; SoundScope's direction passed ${shot.machineMiss.toFixed(2)} m from the source. ${verdict}`, true);
  }
  function showGame() {
    const game = state.game;
    if (!game) return;
    const done = game.history.length, mean = key => game.history.reduce((sum, shot) => sum + shot[key], 0) / Math.max(done, 1);
    const waiting = game.current && !game.current.revealed;
    $('#ss-round').textContent = waiting ? `Round ${game.round} of ${ROUNDS}: listen, then click` : done >= ROUNDS ? 'Game over' : `Round ${Math.min(game.round + 1, ROUNDS)} of ${ROUNDS}`;
    $('#ss-you').textContent = done ? `${mean('yourMiss').toFixed(1)} m off` : '—';
    $('#ss-machine').textContent = done ? `${mean('machineMiss').toFixed(2)} m off` : '—';
    $('#ss-mystery').textContent = waiting ? 'Play it again' : done >= ROUNDS ? 'Play again' : done ? 'Next hidden sound' : 'Play a hidden sound';
    $('#ss-game-note').textContent = done >= ROUNDS
      ? `Average over ${ROUNDS} rounds: you ${mean('yourMiss').toFixed(1)} m, SoundScope ${mean('machineMiss').toFixed(2)} m. Try again with the echo turned up, or look from a different spot before you guess.`
      : 'The sound plays from where your view is, through your speakers or headphones. Headphones help.';
  }

  // ---------------------------------------------------------------- the memory
  const timeLabel = time => new Date(time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function showEvents(query = '') {
    const matches = searchEvents(state.events, query), list = $('#ss-events');
    list.replaceChildren();
    for (const event of matches.slice().reverse()) {
      const item = document.createElement('li'), button = document.createElement('button');
      button.className = 'ss-event'; button.type = 'button';
      const title = document.createElement('b'), where = document.createElement('span'), when = document.createElement('small');
      title.textContent = event.label; where.textContent = event.caption; when.textContent = `${timeLabel(event.time)} · replay ↗`;
      button.append(title, where, when); item.append(button); list.append(item);
      button.addEventListener('click', () => {
        if (state.mode !== 'explore') setMode('explore');
        event.item.object.position.copy(event.position);
        state.spacing = event.spacing; state.echo = event.echo;
        $('#ss-spacing').value = String(Math.round(event.spacing * 1000)); $('#ss-echo').value = String(event.echo); showLesson();
        const center = sourceCenter(event.item), shot = analyse(center, event.type);
        shot.item = event.item; showShot(shot); ripple(center); sound(event.type, center);
        $('#ss-search-answer').textContent = `Replaying the ${event.label.toLowerCase()} from ${timeLabel(event.time)}.`;
      });
    }
    const answer = $('#ss-search-answer');
    if (query.trim()) {
      const latest = matches.at(-1);
      answer.textContent = latest ? `${matches.length} matching ${matches.length === 1 ? 'sound' : 'sounds'}. Most recent, at ${timeLabel(latest.time)}: ${latest.caption}`
        : 'No matching sounds in this session. Try “alarm,” “kettle,” “music,” “TV,” or a place such as “behind the sofa.”';
    } else {
      answer.textContent = state.events.length ? `${state.events.length} ${state.events.length === 1 ? 'sound' : 'sounds'} saved in this session. Ask “did my alarm ring?” or select an event to replay it.`
        : 'Play a sound above to start a history. Nothing is recorded from your microphone.';
    }
  }

  // ---------------------------------------------------------------- controls
  function showLesson() {
    const mm = Math.round(state.spacing * 1000), notes = [];
    if (mm < 45) notes.push('With the microphones this close, the arrival differences shrink to a few microseconds, so the heatmap spreads out.');
    else if (mm > 120) notes.push('Wider spacing sharpens the heatmap, but high-pitched sounds such as the kettle can now match more than one direction.');
    else notes.push(mm === 66 ? '66 mm matches the square used in SoundScope\'s four-microphone geometry.' : `${mm} mm is close to the 66 mm square used in SoundScope's four-microphone geometry.`);
    if (state.echo >= 0.6) notes.push('Strong reflections arrive from other directions; continuous sounds such as the kettle are the most easily misled.');
    $('#ss-lesson').textContent = notes.join(' ');
    $('#ss-spacing-out').textContent = `${mm} mm`;
    $('#ss-echo-out').textContent = state.echo === 0 ? 'none' : state.echo < 0.35 ? 'low' : state.echo < 0.65 ? 'medium' : 'high';
  }
  function setMode(mode) {
    state.mode = mode;
    root.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    $('[data-panel="explore"]').hidden = mode !== 'explore';
    $('[data-panel="game"]').hidden = mode !== 'game';
    sources.forEach(item => { item.object.visible = true; });
    if (mode === 'game') { newGame(); say('Press “Play a hidden sound”, then click where you think it came from.'); }
    else {
      state.game = null; truthMarker.visible = guessMarker.visible = false; state.last = null;
      captureFeed(); drawFeed(); $('#ss-readout').hidden = true;
      $('#ss-caption').textContent = 'Select a sound to see what SoundScope reports.';
      say('Select a sound, drag objects to move them, or drag the room to look around.');
    }
    requestRender();
  }
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  root.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => { if (state.mode === 'explore') play(items.get(button.dataset.source)); }));
  $('#ss-mystery').addEventListener('click', hidden);
  $('#ss-new-game').addEventListener('click', () => { newGame(); say('New game. Press “Play a hidden sound”.'); });
  $('#ss-spacing').addEventListener('input', event => { state.spacing = Number(event.target.value) / 1000; showLesson(); rerun(); });
  $('#ss-echo').addEventListener('input', event => { state.echo = Number(event.target.value); showLesson(); rerun(); });
  $('#ss-search-form').addEventListener('submit', event => { event.preventDefault(); showEvents($('#ss-query').value); });
  $('#ss-query').addEventListener('search', () => showEvents($('#ss-query').value));
  $('#ss-clear').addEventListener('click', () => { state.events = []; $('#ss-query').value = ''; showEvents(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); say('The 3D room paused because the graphics context was lost. Reload the page to restore it.'); });

  renderReady = true;
  showLesson(); showEvents(); resize();
  setMode('explore');
  captureFeed(); drawFeed();
  root.dataset.roomReady = 'ready';
}
