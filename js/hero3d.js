/* Hero: UFactory xArm6 + gripper, built from the official meshes and kinematics
 * (github.com/xArm-Developer/xarm_ros, BSD-3). The arm reaches for the cursor
 * using CCD inverse kinematics on its real joints and joint limits. Click to
 * close the gripper on the block; click again to drop it. */
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('xarm');
const wrap = document.getElementById('robot');
const loaderEl = document.getElementById('xarm-loader');
const jointsEl = document.getElementById('xarm-joints');
const hintEl = document.getElementById('xarm-hint');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const M = 'models/xarm6/';

const PI = Math.PI;
// [name, xyz, rpy, limits] from xarm6_default_kinematics.yaml / xarm6_robot_macro.xacro
const CHAIN = [
  ['link1', [0, 0, 0.267], [0, 0, 0], [-PI * 0.99, PI * 0.99]],
  ['link2', [0, 0, 0], [-PI / 2, 0, 0], [-2.059, 2.0944]],
  ['link3', [0.0535, -0.2845, 0], [0, 0, 0], [-PI * 0.99, 0.19198]],
  ['link4', [0.0775, 0.3425, 0], [-PI / 2, 0, 0], [-PI * 0.99, PI * 0.99]],
  ['link5', [0, 0, 0], [PI / 2, 0, 0], [-1.69297, PI * 0.99]],
  ['link6', [0.076, 0.097, 0], [-PI / 2, 0, 0], [-PI * 0.99, PI * 0.99]]
];

/* ---------------------------------------------------------------- scene */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
camera.position.set(1.25, 0.78, 1.45);
const lookAt = new THREE.Vector3(0, 0.3, 0);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(lookAt);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.45;
controls.enabled = !coarse; // on phones, one-finger drags must keep scrolling the page
if (coarse) canvas.style.touchAction = 'pan-y';

scene.add(new THREE.HemisphereLight(0xcffff0, 0x05140f, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1.2, 2.2, 1.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 6 });
scene.add(key);
const rimA = new THREE.SpotLight(0x2de2d0, 28, 6, 0.6, 0.5);  // turquoise
rimA.position.set(-1.4, 1.3, -1.2);
scene.add(rimA);
const rimB = new THREE.SpotLight(0x3cff8f, 22, 6, 0.6, 0.5);  // neon green
rimB.position.set(1.4, 0.9, -1.4);
scene.add(rimB);

const ground = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
ground.rotation.x = -PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.PolarGridHelper(0.9, 12, 6, 64, 0x0d5c55, 0x0d5c55);
grid.material.transparent = true; grid.material.opacity = 0.55;
scene.add(grid);

const white = new THREE.MeshStandardMaterial({ color: 0xe8eeeb, metalness: 0.25, roughness: 0.32 });
const dark = new THREE.MeshStandardMaterial({ color: 0x18211e, metalness: 0.55, roughness: 0.4 });

/* --------------------------------------------------------- kinematic tree */
const robot = new THREE.Group();
robot.rotation.x = -PI / 2; // ROS z-up → three.js y-up
scene.add(robot);

const joints = [];   // revolute frames we rotate about local z
function frame(parent, xyz, rpy) {
  const f = new THREE.Object3D();
  f.position.set(...xyz);
  f.rotation.set(rpy[0], rpy[1], rpy[2], 'ZYX'); // URDF rpy = Rz(yaw)·Ry(pitch)·Rx(roll)
  parent.add(f);
  return f;
}
const meshSlots = {};
const baseLink = new THREE.Object3D(); robot.add(baseLink); meshSlots.link_base = baseLink;
let parent = baseLink;
CHAIN.forEach(([name, xyz, rpy, lim]) => {
  const f = frame(parent, xyz, rpy);
  const rot = new THREE.Object3D(); f.add(rot);
  joints.push({ name, rot, lim, q: 0, axis: new THREE.Vector3(0, 0, 1) });
  meshSlots[name] = rot;
  parent = rot;
});
const link6 = parent;
const gripBase = frame(link6, [0, 0, 0], [0, 0, 0]); meshSlots['gripper/base_link'] = gripBase;
// mimic linkage, all driven by one angle g (0 open … 0.85 closed)
const G = [
  ['left_outer_knuckle', gripBase, [0, 0.035, 0.059098], [1, 0, 0]],
  ['right_outer_knuckle', gripBase, [0, -0.035, 0.059098], [-1, 0, 0]],
  ['left_inner_knuckle', gripBase, [0, 0.02, 0.074098], [1, 0, 0]],
  ['right_inner_knuckle', gripBase, [0, -0.02, 0.074098], [-1, 0, 0]]
];
const gripJoints = [];
G.forEach(([n, p, xyz, axis]) => { const f = frame(p, xyz, [0, 0, 0]); const r = new THREE.Object3D(); f.add(r); meshSlots['gripper/' + n] = r; gripJoints.push({ r, axis: new THREE.Vector3(...axis) }); });
const lf = frame(meshSlots['gripper/left_outer_knuckle'], [0, 0.035465, 0.042039], [0, 0, 0]); const lfr = new THREE.Object3D(); lf.add(lfr); meshSlots['gripper/left_finger'] = lfr; gripJoints.push({ r: lfr, axis: new THREE.Vector3(-1, 0, 0) });
const rf = frame(meshSlots['gripper/right_outer_knuckle'], [0, -0.035465, 0.042039], [0, 0, 0]); const rfr = new THREE.Object3D(); rf.add(rfr); meshSlots['gripper/right_finger'] = rfr; gripJoints.push({ r: rfr, axis: new THREE.Vector3(1, 0, 0) });
const tcp = new THREE.Object3D(); tcp.position.set(0, 0, 0.165); gripBase.add(tcp);

/* ------------------------------------------------------------------ block */
const block = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x14b8a6, metalness: 0.1, roughness: 0.45, emissive: 0x0b3f39, emissiveIntensity: 0.4 }));
block.castShadow = true;
const blockHome = new THREE.Vector3(0.36, 0.025, 0.12);
block.position.copy(blockHome);
scene.add(block);
let held = false, blockVy = 0;

/* ---------------------------------------------------------------- loading */
const files = ['link_base', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'gripper/base_link',
  'gripper/left_outer_knuckle', 'gripper/right_outer_knuckle', 'gripper/left_inner_knuckle', 'gripper/right_inner_knuckle', 'gripper/left_finger', 'gripper/right_finger'];
const stl = new STLLoader();
let loaded = 0, ready = false;
Promise.all(files.map(f => new Promise((res, rej) => stl.load(M + f + '.stl', g => {
  const mesh = new THREE.Mesh(g, f.startsWith('gripper/') && !f.endsWith('base_link') ? dark : white);
  mesh.castShadow = true; mesh.receiveShadow = true;
  meshSlots[f].add(mesh);
  loaded++; loaderEl.textContent = `loading model… ${loaded}/${files.length}`;
  res();
}, undefined, rej)))).then(() => {
  ready = true; loaderEl.classList.add('done');
  setPose([0, -0.4, -1.1, 0, 1.5, 0]);
}).catch(() => { loaderEl.textContent = 'could not load the 3D model'; });

/* ------------------------------------------------------------------- IK */
function setPose(q) { joints.forEach((j, i) => { j.q = q[i]; j.rot.rotation.z = q[i]; }); }
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion();
function ccd(target, idx, iters, step) {
  for (let it = 0; it < iters; it++) {
    for (const i of idx) {
      const j = joints[i];
      j.rot.getWorldPosition(_p);
      j.rot.getWorldQuaternion(_q);
      _a.set(0, 0, 1).applyQuaternion(_q).normalize();
      tcp.getWorldPosition(_e).sub(_p);
      _t.copy(target).sub(_p);
      _e.addScaledVector(_a, -_e.dot(_a)); _t.addScaledVector(_a, -_t.dot(_a));
      if (_e.lengthSq() < 1e-8 || _t.lengthSq() < 1e-8) continue;
      _e.normalize(); _t.normalize();
      let ang = Math.atan2(_a.dot(new THREE.Vector3().crossVectors(_e, _t)), _e.dot(_t));
      ang = Math.max(-step, Math.min(step, ang));
      j.q = Math.max(j.lim[0], Math.min(j.lim[1], j.q + ang));
      j.rot.rotation.z = j.q;
      j.rot.updateMatrixWorld(true);
    }
  }
}
// keep the gripper pointing at the table by turning joint 5
const down = new THREE.Vector3(0, -1, 0), _z = new THREE.Vector3();
function wristDown() {
  const j = joints[4];
  for (let k = 0; k < 3; k++) {
    j.rot.getWorldPosition(_p); j.rot.getWorldQuaternion(_q);
    _a.set(0, 0, 1).applyQuaternion(_q).normalize();
    gripBase.getWorldQuaternion(_q); _z.set(0, 0, 1).applyQuaternion(_q);
    const e = _z.clone().addScaledVector(_a, -_z.dot(_a)), t = down.clone().addScaledVector(_a, -down.dot(_a));
    if (e.lengthSq() < 1e-6 || t.lengthSq() < 1e-6) return;
    e.normalize(); t.normalize();
    const ang = Math.atan2(_a.dot(new THREE.Vector3().crossVectors(e, t)), e.dot(t));
    j.q = Math.max(j.lim[0], Math.min(j.lim[1], j.q + ang * 0.5));
    j.rot.rotation.z = j.q; j.rot.updateMatrixWorld(true);
  }
}
let grip = 0, gripGoal = 0;
function setGrip(g) { gripJoints.forEach(({ r, axis }) => r.quaternion.setFromAxisAngle(axis, g)); }

/* --------------------------------------------------------------- targets */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
const target = new THREE.Vector3(0.35, 0.3, 0.1), goal = target.clone(), shoulder = new THREE.Vector3(0, 0.267, 0);
let pointerAt = 0, orbiting = false, idleT = 0;
function clampGoal(v) {
  v.y = Math.max(0.06, Math.min(0.72, v.y));
  const h = Math.hypot(v.x, v.z);
  if (h < 0.18) { const s = 0.18 / (h || 1); v.x *= s; v.z *= s; }
  const d = v.clone().sub(shoulder), max = 0.6;
  if (d.length() > max) v.copy(shoulder).addScaledVector(d.normalize(), max);
  return v;
}
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const n = camera.position.clone().setY(0).normalize();
  plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, 0));
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, hit)) { goal.copy(clampGoal(hit)); pointerAt = performance.now(); }
}
wrap.addEventListener('pointermove', e => { if (!orbiting && e.pointerType !== 'touch') pointer(e); });
controls.addEventListener('start', () => { orbiting = true; });
controls.addEventListener('end', () => { orbiting = false; });
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; if (e.pointerType === 'touch') pointer(e); });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // that was an orbit drag
  toggleGrip();
});
function toggleGrip() {
  if (held) { held = false; gripGoal = 0; blockVy = 0; return; }
  const p = tcp.getWorldPosition(new THREE.Vector3());
  if (p.distanceTo(block.position) < 0.075) { held = true; gripGoal = 0.62; }
  else { gripGoal = 0.85; setTimeout(() => { if (!held) gripGoal = 0; }, 450); }
}
if (coarse && hintEl) hintEl.textContent = 'tap to move · tap the block to grip';

/* ------------------------------------------------------------------- loop */
let visible = true, W = 0, H = 0, frameN = 0, last = performance.now();
function resize() {
  const r = wrap.getBoundingClientRect(); W = r.width; H = r.height;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  const aspect = W / H;
  camera.position.setLength(2.45 * Math.max(1, 1.15 / aspect));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(wrap);
resize();

// idle routine: hover over the block, descend, grip, carry, place, return
const idlePts = [new THREE.Vector3(0.36, 0.22, 0.12), new THREE.Vector3(0.36, 0.075, 0.12), new THREE.Vector3(0.1, 0.34, 0.38), new THREE.Vector3(-0.12, 0.08, 0.4), new THREE.Vector3(0.05, 0.36, 0.25)];
function idle(dt) {
  if (reduced) return;
  idleT += dt;
  const cyc = idleT % 10, seg = [0, 1.6, 3.0, 5.2, 7.2, 10];
  let k = 0; while (k < 4 && cyc > seg[k + 1]) k++;
  const a = idlePts[k], b = idlePts[(k + 1) % idlePts.length], f = Math.min(1, (cyc - seg[k]) / (seg[k + 1] - seg[k]));
  const s = f * f * (3 - 2 * f);
  goal.lerpVectors(a, b, s);
  if (k === 1 && f > 0.85 && !held && block.position.distanceTo(tcp.getWorldPosition(new THREE.Vector3())) < 0.075) { held = true; gripGoal = 0.62; }
  if (k === 3 && f > 0.9 && held) { held = false; gripGoal = 0; }
  if (k === 0 && !held && block.position.y < 0.03 && block.position.distanceTo(blockHome) > 0.05 && f < 0.05) block.position.copy(blockHome); // reset the demo
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!visible || !ready) { if (ready) renderer.render(scene, camera); return; }
  if (now - pointerAt > 4500) idle(dt); else idleT = 0;
  target.lerp(goal, 0.12);
  ccd(target, [0, 1, 2], 4, 0.12);
  wristDown();
  ccd(target, [0, 1, 2], 2, 0.08);
  grip += (gripGoal - grip) * 0.2; setGrip(grip);

  if (held) {
    tcp.getWorldPosition(block.position); block.position.y -= 0.01;
    gripBase.getWorldQuaternion(block.quaternion);
  } else if (block.position.y > 0.025) {
    blockVy -= 9.8 * dt; block.position.y = Math.max(0.025, block.position.y + blockVy * dt);
    if (block.position.y === 0.025) { blockVy = 0; block.quaternion.identity(); }
  }
  controls.update();
  renderer.render(scene, camera);

  if (++frameN % 6 === 0 && jointsEl) {
    jointsEl.innerHTML = joints.map((j, i) => `J${i + 1} <b>${(j.q * 180 / PI).toFixed(1).padStart(6, ' ')}°</b>`).join('\n') + `\ngrip <b>${held ? 'holding' : grip > 0.3 ? 'closed' : 'open'}</b>`;
  }
}
requestAnimationFrame(loop);
