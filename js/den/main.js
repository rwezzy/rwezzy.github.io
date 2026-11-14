import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { forward, inverse, multiply, pose } from './lite6.js?v=1';
import { drawKeyboard, drawLaptopScreen } from './screen.js?v=1';
import { loadCarrier } from '../soundscope-hardware.js?v=3d1';

const $ = selector => document.querySelector(selector);
const DESK_Y = 0.75;
const BASE = new THREE.Vector3(0, DESK_Y, -1.27);          // where the Lite 6 is bolted to the desk
const PLAQUE = { w: 0.12, h: 0.085, t: 0.007, radius: 0.31 };
const PAGES = [
  { id: 'about', title: 'About' }, { id: 'projects', title: 'Projects' }, { id: 'research', title: 'Research' },
  { id: 'path', title: 'Path' }, { id: 'beyond', title: 'Beyond' }, { id: 'contact', title: 'Contact' },
];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

// ---------------------------------------------------------------- renderer and scene
const canvas = $('#den-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0a12');
scene.fog = new THREE.Fog('#0d0a12', 4, 9);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.16;
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.02, 30);
const HOME = { position: new THREE.Vector3(1.0, 1.6, 0.55), target: new THREE.Vector3(-0.05, 0.92, -1.15) };
camera.position.copy(HOME.position); camera.lookAt(HOME.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), small ? 0.35 : 0.5, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => { $('#den-progress').textContent = ` · ${Math.round(loaded / total * 100)}%`; };
const gltf = new GLTFLoader(manager), stl = new STLLoader(manager), textures = new THREE.TextureLoader(manager);
const texture = (name, repeat, color = false) => {
  const t = textures.load(`den/textures/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const shadows = object => { object.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } }); return object; };
async function model(id, { at, turn = 0, scale = 1 }) {
  const { scene: object } = await gltf.loadAsync(`den/models/${id}/${id}.gltf`);
  object.position.set(...at); object.rotation.y = turn; object.scale.setScalar(scale);
  scene.add(shadows(object));
  return object;
}

// ------------------------------------------------------------------------ the room
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.2), new THREE.MeshStandardMaterial({
    map: texture('floor_diff', [2.2, 1.6], true), roughnessMap: texture('floor_rough', [2.2, 1.6]), normalMap: texture('floor_nor', [2.2, 1.6]), color: '#c99a73',
  }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wallMaps = ['wall_diff', 'wall_rough', 'wall_nor'].map((name, i) => texture(name, [2, 1.2], i === 0));
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallMaps[0], roughnessMap: wallMaps[1], normalMap: wallMaps[2], color: '#b98f86' });
  for (const [w, x, z, turn] of [[4.4, 0, -1.6, 0], [3.2, -2.2, 0, Math.PI / 2], [3.2, 2.2, 0, -Math.PI / 2]]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6), wallMaterial);
    wall.position.set(x, 1.3, z); wall.rotation.y = turn; wall.receiveShadow = true; scene.add(wall);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.2), new THREE.MeshStandardMaterial({ color: '#2a2030', roughness: 1 }));
  ceiling.position.y = 2.6; ceiling.rotation.x = Math.PI / 2; scene.add(ceiling);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.5), new THREE.MeshStandardMaterial({
    map: texture('rug_diff', [2, 1.3], true), normalMap: texture('rug_nor', [2, 1.3]), roughness: 0.95, color: '#e7b7a0',
  }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.003, -0.45); rug.receiveShadow = true; scene.add(rug);

  // The window: a painted night city behind glass, with a frame and a sill.
  const city = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.98), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(drawCity()), toneMapped: false }));
  city.material.map.colorSpace = THREE.SRGBColorSpace;
  city.position.set(0, 1.66, -1.597); scene.add(city);
  const frame = new THREE.MeshStandardMaterial({ color: '#3a2b26', roughness: 0.6 });
  for (const [w, h, x, y] of [[1.44, 0.05, 0, 2.17], [1.44, 0.05, 0, 1.15], [0.05, 1.07, -0.7, 1.66], [0.05, 1.07, 0.7, 1.66], [0.03, 0.98, 0, 1.66], [1.34, 0.025, 0, 1.66]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frame); bar.position.set(x, y, -1.58); scene.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.03, 0.16), frame); sill.position.set(0, 1.12, -1.53); scene.add(shadows(sill));

  // Fairy lights draped above the window and along the left wall.
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.75), toneMapped: false }), 70);
  const wire = [];
  const place = (k, p) => { bulbs.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)); wire.push(p); };
  for (let k = 0; k < 44; k += 1) {
    const s = k / 43, x = -1.9 + s * 3.8, sag = Math.sin(s * Math.PI * 3) ** 2 * 0.16;
    place(k, new THREE.Vector3(x, 2.42 - sag, -1.57));
  }
  for (let k = 0; k < 26; k += 1) {
    const s = k / 25, z = -1.5 + s * 2.2, sag = Math.sin(s * Math.PI * 2) ** 2 * 0.14;
    place(44 + k, new THREE.Vector3(-2.17, 2.36 - sag, z));
  }
  scene.add(bulbs);
  for (const [x, y, z] of [[-1.1, 2.3, -1.45], [0.9, 2.3, -1.45], [-2.0, 2.25, -0.2]]) {
    const glow = new THREE.PointLight('#ffad5c', 1.4, 3.2, 1.6); glow.position.set(x, y, z); scene.add(glow);
  }

  // Light: a warm desk lamp, cool moonlight through the window, and a dim purple room.
  scene.add(new THREE.HemisphereLight('#5b4678', '#1c120d', 0.5));
  const moon = new THREE.DirectionalLight('#9db4ff', 0.5); moon.position.set(-0.6, 2.4, -3.5); moon.target.position.set(0, 0.7, -1); scene.add(moon, moon.target);
  const lamp = new THREE.SpotLight('#ffb067', 5.5, 4, 0.72, 0.7, 1.6);
  lamp.position.set(0.52, 1.44, -1.38); lamp.target.position.set(-0.02, DESK_Y, -1.05);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1536, 1536); lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.01;
  scene.add(lamp, lamp.target);
  const fill = new THREE.PointLight('#ff9a5a', 0.9, 2.5, 1.8); fill.position.set(1.3, 1.1, 0.4); scene.add(fill);
}

function drawCity() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 750;
  const g = c.getContext('2d'), sky = g.createLinearGradient(0, 0, 0, 750);
  sky.addColorStop(0, '#120c2e'); sky.addColorStop(0.55, '#3b2357'); sky.addColorStop(1, '#a24d5f');
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 750);
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 120; k += 1) { g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`; g.fillRect(rand() * 1024, rand() * 330, 1.6, 1.6); }
  g.fillStyle = '#fff1d8'; g.beginPath(); g.arc(790, 150, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,241,216,.12)'; g.beginPath(); g.arc(790, 150, 90, 0, Math.PI * 2); g.fill();
  for (const [layer, base, tint] of [[0, 470, '#24183a'], [1, 540, '#1a1229'], [2, 610, '#0f0b19']]) {
    let x = -20;
    while (x < 1044) {
      const w = 40 + rand() * 90, h = 120 + rand() * (layer === 0 ? 230 : 180);
      g.fillStyle = tint; g.fillRect(x, base - h + layer * 40, w, 750);
      for (let wy = base - h + layer * 40 + 12; wy < 740; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 11) {
        if (rand() < 0.28) { g.fillStyle = rand() < 0.75 ? `rgba(255,${180 + rand() * 50},${90 + rand() * 60},${0.5 + layer * 0.15})` : 'rgba(150,190,255,.55)'; g.fillRect(wx, wy, 5, 7); }
      }
      x += w + 4 + rand() * 12;
    }
  }
  return c;
}

// ------------------------------------------------------------------------ the desk
function buildDesk() {
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.04, 0.72, 3, 0.008), new THREE.MeshPhysicalMaterial({
    map: texture('desk_diff', [1.6, 0.7], true), roughnessMap: texture('desk_rough', [1.6, 0.7]), normalMap: texture('desk_nor', [1.6, 0.7]),
    clearcoat: 0.4, clearcoatRoughness: 0.35, color: '#d29a6a',
  }));
  top.position.set(0, DESK_Y - 0.02, -1.22); scene.add(shadows(top));
  const steel = new THREE.MeshStandardMaterial({ color: '#1c1b1f', roughness: 0.45, metalness: 0.7 });
  for (const x of [-0.78, 0.78]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, DESK_Y - 0.04, 0.62), steel);
    leg.position.set(x, (DESK_Y - 0.04) / 2, -1.22); scene.add(shadows(leg));
  }
}

// An HP Omen 16-sized laptop (369 x 248 mm), drawn in code: dark chassis, backlit keys, a busy screen.
function buildLaptop() {
  const group = new THREE.Group(), body = new THREE.MeshPhysicalMaterial({ color: '#17181c', roughness: 0.42, metalness: 0.65, clearcoat: 0.2 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.369, 0.02, 0.248, 3, 0.006), body); base.position.y = 0.01; group.add(base);
  const keys = document.createElement('canvas'); keys.width = 1024; keys.height = 420; drawKeyboard(keys);
  const keyTexture = new THREE.CanvasTexture(keys); keyTexture.colorSpace = THREE.SRGBColorSpace;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.135), new THREE.MeshStandardMaterial({ map: keyTexture, emissiveMap: keyTexture, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6 }));
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.0205, -0.03); group.add(deck);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.02, -0.122); hinge.rotation.x = -0.32; group.add(hinge);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(0.369, 0.245, 0.008, 3, 0.004), body); lid.position.set(0, 0.1225, -0.004); hinge.add(lid);
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1600; screenCanvas.height = 1000;
  const screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.347, 0.217), new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) }));
  screen.position.set(0, 0.124, 0.0005); hinge.add(screen);
  const glow = new THREE.PointLight('#8db0ff', 0.6, 1.2, 2); glow.position.set(0, 0.14, 0.12); hinge.add(glow);
  group.position.set(-0.55, DESK_Y, -1.12); group.rotation.y = 0.42;
  scene.add(shadows(group)); screen.castShadow = false;
  let start = performance.now();
  return () => { drawLaptopScreen(screenCanvas, (performance.now() - start) / 1000); screenTexture.needsUpdate = true; };
}

// OmniRing: a deliberately rough printed ring holding a XIAO nRF52840 Sense.
function buildOmniRing() {
  const group = new THREE.Group(), pla = new THREE.MeshStandardMaterial({ color: '#4d5a79', roughness: 0.85 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0042, 10, 22), pla); band.rotation.y = Math.PI / 2; band.position.y = 0.0157; group.add(band);
  const cradle = new THREE.Mesh(new RoundedBoxGeometry(0.027, 0.009, 0.024, 2, 0.002), pla); cradle.position.y = 0.0305; group.add(cradle);
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.0012, 0.0175), new THREE.MeshStandardMaterial({ color: '#1f2b3d', roughness: 0.5 })); pcb.position.y = 0.0356; group.add(pcb);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0018, 0.010), new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.3, metalness: 0.9 })); shield.position.set(0.002, 0.0371, 0); group.add(shield);
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0032, 0.009), new THREE.MeshStandardMaterial({ color: '#d8dade', roughness: 0.25, metalness: 0.9 })); usb.position.set(-0.0105, 0.0372, 0); group.add(usb);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.0008, 0.0015), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 1.2), toneMapped: false })); led.position.set(-0.005, 0.0365, 0.006); group.add(led);
  for (const s of [-1, 1]) { const tab = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.006, 0.026), pla); tab.position.set(s * 0.0125, 0.034, 0); group.add(tab); }
  group.position.set(0.43, DESK_Y, -0.99); group.rotation.y = -0.6; group.rotation.z = 0.12;
  scene.add(shadows(group));
}

async function buildSoundScope() {
  const steel = new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.4, metalness: 0.75 });
  const rig = new THREE.Group(), head = 0.2;
  for (let k = 0; k < 3; k += 1) {
    const a = k * 2 * Math.PI / 3 + 0.4, foot = new THREE.Vector3(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075), top = new THREE.Vector3(0, head - 0.02, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, foot.distanceTo(top), 8), steel);
    leg.position.copy(foot).add(top).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()); rig.add(leg);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), steel); ball.position.y = head - 0.017; rig.add(ball);
  const { assembly } = await loadCarrier();
  assembly.position.y = head; assembly.rotation.y = -0.25; rig.add(assembly);
  rig.position.set(0.5, DESK_Y, -1.36);
  scene.add(shadows(rig));
}

async function buildProps() {
  await Promise.all([
    model('book_encyclopedia_set_01', { at: [-0.83, DESK_Y, -1.5], turn: 0 }),
    model('jug_01', { at: [-0.29, DESK_Y, -0.92], turn: 0.8, scale: 0.42 }),
    model('standing_picture_frame_01', { at: [0.7, DESK_Y, -1.02], turn: 2.3 }),
    model('potted_plant_02', { at: [1.35, 0, -1.4], turn: 0.4, scale: 1.05 }),
    model('wooden_bookshelf_worn', { at: [-1.91, 0, -0.55], turn: Math.PI / 2 }),
  ]);
}

// ------------------------------------------------------------------------ the arm
// Robot base frame (z up, x toward the camera) to world (y up).
const ROBOT = new THREE.Matrix4().set(0, 1, 0, BASE.x, 0, 0, 1, BASE.y, 1, 0, 0, BASE.z, 0, 0, 0, 1);
const robot = new THREE.Group(); robot.matrixAutoUpdate = false; robot.matrix.copy(ROBOT);
const links = [];
let joints = [0, 0.3, 1.2, 0, 1.2, 0];
let held = null;

async function buildArm() {
  const white = new THREE.MeshPhysicalMaterial({ color: '#d9d9d4', roughness: 0.38, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.5, metalness: 0.3 });
  const names = ['link_base', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'vacuum_gripper_lite'];
  const geometries = await Promise.all(names.map(name => stl.loadAsync(`models/lite6/${name}.stl`)));
  geometries.forEach((geometry, i) => {
    const smooth = toCreasedNormals(geometry, Math.PI / 6);
    const mesh = new THREE.Mesh(smooth, i === 7 ? dark : white);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    robot.add(mesh); links.push(mesh);
  });
  scene.add(robot);
}

const ATTACH = new Float64Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, PLAQUE.t / 2, 1]);   // plaque frame in the tool frame
const ATTACH_INVERSE = new Float64Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, PLAQUE.t / 2, 1]);
const DISPLAY = pose([0.27, 0, 0.3], [1, 0, 0], [0, 1, 0]);
const REST = pose([0.2, 0, 0.24], [0.35, 0, -1], [0, 1, 0]);
const above = (m, lift) => { const out = m.slice(); out[14] += lift; return out; };

function applyJoints(q) {
  const { links: frames, tcp } = forward(q);
  links[0].matrix.identity();
  frames.forEach((frame, i) => links[i + 1].matrix.fromArray(frame));
  links[7].matrix.fromArray(frames[5]);
  if (held) held.mesh.matrix.fromArray(multiply(tcp, ATTACH));
  robot.updateMatrixWorld(true);
  showPendant(q, tcp);
}

// ------------------------------------------------------------------------ plaques
const plaques = [];
function buildPlaques() {
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#f2fbff', transmission: 1, thickness: 0.006, roughness: 0.06, ior: 1.5, metalness: 0,
    attenuationColor: '#cfe9ff', attenuationDistance: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true,
  });
  const geometry = new RoundedBoxGeometry(PLAQUE.w, PLAQUE.h, PLAQUE.t, 3, 0.003);
  PAGES.forEach((page, i) => {
    const angle = (-62.5 + i * 25) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    // Resting pose in the robot frame: lying flat, long side along the arc.
    const rest = new Float64Array([-s, c, 0, 0, -c, -s, 0, 0, 0, 0, 1, 0, PLAQUE.radius * c, PLAQUE.radius * s, PLAQUE.t / 2, 1]);
    const mesh = new THREE.Mesh(geometry, glass); mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(rest);
    mesh.castShadow = true; mesh.userData.page = page.id;
    const label = document.createElement('canvas'); label.width = 512; label.height = 360;
    const g = label.getContext('2d');
    g.fillStyle = 'rgba(255,248,236,.92)'; g.font = 'italic 300 120px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(page.title, 256, 170);
    g.font = '500 34px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,190,110,.9)'; g.fillText(`0${i + 1}`, 256, 290);
    const labelTexture = new THREE.CanvasTexture(label); labelTexture.colorSpace = THREE.SRGBColorSpace;
    const text = new THREE.Mesh(new THREE.PlaneGeometry(PLAQUE.w * 0.9, PLAQUE.h * 0.9), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.15, 1.1, 1.05) }));
    text.position.z = PLAQUE.t / 2 + 0.0004; mesh.add(text);
    robot.add(mesh);
    plaques.push({ page: page.id, title: page.title, mesh, rest, text });
    document.fonts?.ready.then(() => {
      g.clearRect(0, 0, 512, 360);
      g.fillStyle = 'rgba(255,248,236,.92)'; g.font = 'italic 300 120px Fraunces, Georgia, serif'; g.fillText(page.title, 256, 170);
      g.font = '500 34px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,190,110,.9)'; g.fillText(`0${i + 1}`, 256, 290);
      labelTexture.needsUpdate = true;
    });
  });
}

// ------------------------------------------------------------------------ motion
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function move(target, { speed = 3.4, min = 0.22 } = {}) {
  const goal = inverse(target, joints).q, from = joints.slice();
  const span = Math.max(...goal.map((v, i) => Math.abs(v - from[i])));
  const duration = reduceMotion ? 0.05 : Math.max(min, span / speed);
  setState('moving');
  return new Promise(resolve => {
    const began = performance.now();
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - began) / 1000 / duration)), k = ease(t);
      joints = from.map((v, i) => v + (goal[i] - v) * k);
      applyJoints(joints);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? 0 : ms));

let cameraTween = null;
function flyCamera(position, target, duration = 0.85) {
  const fromP = camera.position.clone(), fromT = view.target.clone(), began = performance.now();
  cameraTween = () => {
    const t = Math.min(1, Math.max(0, (performance.now() - began) / 1000 / (reduceMotion ? 0.01 : duration))), k = ease(t);
    view.base.lerpVectors(fromP, position, k); view.target.lerpVectors(fromT, target, k);
    if (t >= 1) cameraTween = null;
  };
}
const view = { base: HOME.position.clone(), target: HOME.target.clone(), mouse: new THREE.Vector2(), focused: false };

function focusPose() {
  const plaque = new THREE.Matrix4().fromArray(multiply(DISPLAY, ATTACH)).premultiply(ROBOT);
  const center = new THREE.Vector3().setFromMatrixPosition(plaque);
  const normal = new THREE.Vector3(0, 0, -1).transformDirection(plaque);   // the plaque's back faces the camera
  const vertical = THREE.MathUtils.degToRad(camera.fov), fitWidth = PLAQUE.w / 0.62;
  const distance = Math.max(fitWidth / (2 * Math.tan(vertical / 2) * camera.aspect), PLAQUE.h / 0.7 / (2 * Math.tan(vertical / 2)));
  return { position: center.clone().addScaledVector(normal, distance), target: center };
}

// ------------------------------------------------------------------------ pages
let current = null, busy = false, queued = null;
async function show(page) {
  if (busy) { queued = page; return; }
  if (page === current) return;
  busy = true;
  closeSheet();
  if (held) {
    const slot = held.plaque.rest, contact = multiply(slot, ATTACH_INVERSE);
    if (!view.focused || page === 'desk') flyCamera(HOME.position, HOME.target);
    await move(above(contact, 0.07));
    await move(contact, { min: 0.16 });
    setState('suction'); await wait(90);
    held.plaque.mesh.matrix.fromArray(slot); held = null; robot.updateMatrixWorld(true);
    await move(above(contact, 0.07), { min: 0.16 });
  }
  if (page === 'desk') {
    view.focused = false; flyCamera(HOME.position, HOME.target);
    await move(REST); setState('idle'); current = null; markDock(null);
    if (location.hash) history.replaceState(null, '', location.pathname);
  } else {
    const plaque = plaques.find(p => p.page === page), contact = multiply(plaque.rest, ATTACH_INVERSE);
    if (view.focused) { flyCamera(HOME.position, HOME.target, 0.6); view.focused = false; }
    await move(above(contact, 0.08));
    await move(contact, { min: 0.16 });
    setState('suction'); squish(); await wait(110);
    held = { plaque, mesh: plaque.mesh }; plaque.text.visible = false;
    await move(above(contact, 0.1), { min: 0.16 });
    const focus = focusPose();
    flyCamera(focus.position, focus.target, 0.75); view.focused = true;
    await move(DISPLAY, { speed: 3.8 });
    setState('suction'); current = page; markDock(page);
    openSheet(page);
    if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
  }
  plaques.forEach(p => { if (!held || p !== held.plaque) p.text.visible = true; });
  busy = false;
  if (queued) { const next = queued; queued = null; show(next); }
}
function squish() {
  const cup = links[7], began = performance.now();
  const step = () => {
    const t = Math.max(0, (performance.now() - began) / 180), s = 1 - 0.12 * Math.sin(Math.min(1, t) * Math.PI);
    cup.matrix.fromArray(forward(joints).links[5]); cup.matrix.multiply(new THREE.Matrix4().makeScale(1, 1, s));
    if (t < 1) requestAnimationFrame(step); else applyJoints(joints);
  };
  requestAnimationFrame(step);
}

const sheet = $('#den-sheet'), inner = $('#den-sheet-inner');
function openSheet(page) {
  inner.replaceChildren($(`#page-${page}`).content.cloneNode(true));
  inner.scrollTop = 0;
  sheet.hidden = false; $('#den').classList.add('is-reading');
  placeCup();
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  inner.focus({ preventScroll: true });
}
function closeSheet() {
  sheet.classList.remove('is-open'); $('#den').classList.remove('is-reading');
  setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.hidden = true; }, 300);
}
// Keep the clear circle in the page exactly over the suction cup.
function placeCup() {
  if (sheet.hidden) return;
  const tcp = new THREE.Matrix4().fromArray(forward(joints).tcp).premultiply(ROBOT);
  const center = new THREE.Vector3().setFromMatrixPosition(tcp), edge = center.clone().add(new THREE.Vector3(0.036, 0, 0));
  const toScreen = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const a = toScreen(center), b = toScreen(edge), box = inner.getBoundingClientRect();
  inner.style.setProperty('--cup-x', `${a.x - box.left}px`); inner.style.setProperty('--cup-y', `${a.y - box.top + inner.scrollTop}px`);
  document.documentElement.style.setProperty('--cup', `${Math.max(18, Math.hypot(b.x - a.x, b.y - a.y))}px`);
}
inner.addEventListener('scroll', placeCup);

function markDock(page) {
  document.querySelectorAll('.den-dock [data-page]').forEach(button => {
    if (button.dataset.page === 'desk') button.hidden = !page;
    else button.setAttribute('aria-current', String(button.dataset.page === page));
  });
  $('#den-hint').style.opacity = page ? 0 : 1;
}
document.querySelectorAll('.den-dock [data-page]').forEach(button => button.addEventListener('click', () => show(button.dataset.page)));
addEventListener('keydown', event => {
  if (event.key === 'Escape') show('desk');
  const index = Number(event.key) - 1;
  if (index >= 0 && index < PAGES.length && !event.target.closest?.('input, textarea')) show(PAGES[index].id);
});

// ------------------------------------------------------------------------ pendant
const jointList = $('#den-joints'), pendant = $('.den-pendant');
const rows = [...'123456'].map(n => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = `J${n}`; jointList.append(dt, dd); return dd; });
const tcpRows = ['X', 'Y', 'Z'].map(axis => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = axis; jointList.append(dt, dd); return dd; });
function showPendant(q, tcp) {
  q.forEach((v, i) => { rows[i].textContent = `${(v * 180 / Math.PI).toFixed(1)}°`; });
  [12, 13, 14].forEach((k, i) => { tcpRows[i].textContent = `${(tcp[k] * 1000).toFixed(0)} mm`; });
}
function setState(state) {
  pendant.dataset.state = state;
  $('#den-state').textContent = state === 'moving' ? 'moving' : state === 'suction' ? (held ? 'suction on · holding' : 'suction') : 'idle';
}

// ------------------------------------------------------------------------ pointer
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), tip = $('#den-tip');
let hovered = null, down = null;
function pickPlaque(event) {
  pointer.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(plaques.map(p => p.mesh), false)[0];
  return hit ? plaques.find(p => p.mesh === hit.object) : null;
}
canvas.addEventListener('pointermove', event => {
  view.mouse.set(event.clientX / innerWidth - 0.5, event.clientY / innerHeight - 0.5);
  const plaque = view.focused ? null : pickPlaque(event);
  hovered = plaque && plaque !== held?.plaque ? plaque : null;
  canvas.style.cursor = hovered ? 'pointer' : 'default';
  tip.hidden = !hovered;
  if (hovered) { tip.textContent = hovered.title; tip.style.left = `${event.clientX}px`; tip.style.top = `${event.clientY}px`; }
});
canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointerup', event => {
  if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
  const plaque = view.focused ? null : pickPlaque(event);
  if (plaque) show(plaque.page);
  else if (view.focused && current) show('desk');
});

// ------------------------------------------------------------------------ loop
let refreshScreen = () => {};
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  if (view.focused) { const focus = focusPose(); view.base.copy(focus.position); view.target.copy(focus.target); }
  placeCup();
}
addEventListener('resize', resize);
let lastScreen = 0, frames = 0, sampleStart = 0, degraded = false;
// On slow machines, drop the expensive effects after a short sample instead of stuttering.
function adapt(now) {
  if (degraded) return;
  if (!sampleStart) { sampleStart = now; return; }
  frames += 1;
  if (now - sampleStart < 2500) return;
  if (frames / ((now - sampleStart) / 1000) < 28) {
    degraded = true; bloom.enabled = false; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false;
    scene.traverse(object => { if (object.material?.transmission) { object.material.transmission = 0; object.material.opacity = 0.35; object.material.needsUpdate = true; } });
    resize();
  }
  sampleStart = Infinity;
}
function frame(now) {
  adapt(now);
  if (cameraTween) cameraTween(now);
  const sway = view.focused ? 0.004 : 0.07;
  camera.position.set(view.base.x + view.mouse.x * sway, view.base.y - view.mouse.y * sway * 0.6, view.base.z);
  camera.lookAt(view.target);
  if (now - lastScreen > 1000) { lastScreen = now; refreshScreen(); }
  if (!sheet.hidden) placeCup();
  composer.render();
  requestAnimationFrame(frame);
}

async function start() {
  buildRoom(); buildDesk(); buildOmniRing(); buildPlaques();
  refreshScreen = buildLaptop();
  await Promise.all([buildArm(), buildSoundScope(), buildProps()]);
  joints = inverse(REST, joints).q;
  applyJoints(joints); setState('idle');
  resize();
  requestAnimationFrame(frame);
  $('#den-loader').classList.add('is-done');
  const linked = location.hash.slice(1);
  if (PAGES.some(page => page.id === linked)) setTimeout(() => show(linked), 600);
}
addEventListener('hashchange', () => {
  const linked = location.hash.slice(1);
  if (PAGES.some(page => page.id === linked)) show(linked);
});
start().catch(error => {
  console.error(error);
  $('#den-loader p').innerHTML = 'The room could not load in this browser. <a href="index.html">Open the plain version.</a>';
});
