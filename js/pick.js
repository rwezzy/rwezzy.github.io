/* Look-to-pick: an SO-ARM100 (MuJoCo Menagerie model, Apache 2.0) picks up whatever
 * you look at. Gaze is deliberately simple: head yaw + iris position, mapped to
 * left / middle / right by a three-dot calibration. The mouse works too.
 * Selection uses the same evidence rule as the real Gaze Arm (gaze_lock.py). */
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.getElementById('pick');
if (root) init();

function init() {
  const canvas = document.getElementById('pick-canvas');
  const stageEl = root.querySelector('.pick__stage');
  const say = root.querySelector('.pick__say');
  const camBox = root.querySelector('.pick__cam'), camVideo = camBox.querySelector('video'), camCanvas = camBox.querySelector('canvas');
  const gazeBar = root.querySelector('.pick__gaze'), gazeDot = gazeBar.querySelector('i');
  const btnCam = root.querySelector('[data-cam]'), btnRecal = root.querySelector('[data-recal]'), btnReset = root.querySelector('[data-reset]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PI = Math.PI, UP = new THREE.Vector3(0, 1, 0);
  const tell = (s, hot = false) => { if (say.textContent !== s) say.textContent = s; say.classList.toggle('hot', hot); };

  /* ------------------------------------------------------------- renderer */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { tell('3D needs WebGL, which this browser has turned off'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 10);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8ece3, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(0.35, 0.9, 0.45); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002;
  Object.assign(sun.shadow.camera, { left: -0.4, right: 0.4, top: 0.4, bottom: -0.4, near: 0.1, far: 3 });
  scene.add(sun);
  const table = new THREE.Mesh(new THREE.CircleGeometry(0.5, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  table.rotation.x = -PI / 2; table.receiveShadow = true; scene.add(table);

  /* --------------------------------------------- SO-ARM100 kinematic tree */
  // Transcribed from mujoco_menagerie/trs_so_arm100/so_arm100.xml (MuJoCo is z-up).
  const Q = (w, x, y, z) => new THREE.Quaternion(x, y, z, w);
  const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const SPEC = [
    { pos: [0, 0, 0], rot: Q(1, 0, 0, 0), meshes: ['Base', 'Base_Motor'] },
    { pos: [0, -0.0452, 0.0165], rot: Q(0.707105, 0.707108, 0, 0), axis: [0, 1, 0], lim: [-1.92, 1.92], meshes: ['Rotation_Pitch', 'Rotation_Pitch_Motor'] },
    { pos: [0, 0.1025, 0.0306], rot: E(1.57079, 0, 0), axis: [1, 0, 0], lim: [-3.32, 0.174], meshes: ['Upper_Arm', 'Upper_Arm_Motor'] },
    { pos: [0, 0.11257, 0.028], rot: E(-1.57079, 0, 0), axis: [1, 0, 0], lim: [-0.174, 3.14], meshes: ['Lower_Arm', 'Lower_Arm_Motor'] },
    { pos: [0, 0.0052, 0.1349], rot: E(-1.57079, 0, 0), axis: [1, 0, 0], lim: [-1.66, 1.66], meshes: ['Wrist_Pitch_Roll', 'Wrist_Pitch_Roll_Motor'] },
    { pos: [0, -0.0601, 0], rot: E(0, 1.57079, 0), axis: [0, 1, 0], lim: [-2.79, 2.79], meshes: ['Fixed_Jaw', 'Fixed_Jaw_Motor'] },
    { pos: [-0.0202, -0.0244, 0], rot: Q(1.34924e-11, -3.67321e-06, 1, -3.67321e-06), axis: [0, 0, 1], lim: [-0.174, 1.75], meshes: ['Moving_Jaw'] }
  ];
  const robot = new THREE.Group(); robot.rotation.x = -PI / 2; scene.add(robot);
  const J = []; let parent = robot;
  SPEC.forEach(s => {
    const frame = new THREE.Object3D(); frame.position.set(...s.pos); frame.quaternion.copy(s.rot); parent.add(frame);
    const rot = new THREE.Object3D(); frame.add(rot);
    s.node = rot;
    if (s.axis) J.push({ rot, axis: new THREE.Vector3(...s.axis), lim: s.lim, q: 0 });
    parent = rot;
  });
  const [ROT, PITCH, ELBOW, WPITCH, WROLL, JAW] = [0, 1, 2, 3, 4, 5];
  const tcp = new THREE.Object3D(); tcp.position.set(0.001, -0.085, 0); SPEC[5].node.add(tcp);
  function setQ(i, v) { const j = J[i]; j.q = Math.max(j.lim[0], Math.min(j.lim[1], v)); j.rot.quaternion.setFromAxisAngle(j.axis, j.q); }
  [0, -1.57, 1.57, 1.57, -1.57, 0].forEach((v, i) => setQ(i, v)); // the model's "home" keyframe
  robot.updateMatrixWorld(true);

  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f1, roughness: 0.55, metalness: 0 });
  const motor = new THREE.MeshStandardMaterial({ color: 0x2e3432, roughness: 0.45, metalness: 0.2 });

  /* ------------------------------------------------------------- the IK */
  const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
  const wristPos = v => J[WPITCH].rot.getWorldPosition(v);
  function rotateToward(i, end, target, step) {
    const j = J[i];
    j.rot.getWorldPosition(_p); j.rot.getWorldQuaternion(_q);
    _a.copy(j.axis).applyQuaternion(_q).normalize();
    _e.copy(end).sub(_p); _t.copy(target).sub(_p);
    _e.addScaledVector(_a, -_e.dot(_a)); _t.addScaledVector(_a, -_t.dot(_a));
    if (_e.lengthSq() < 1e-10 || _t.lengthSq() < 1e-10) return;
    _e.normalize(); _t.normalize();
    const ang = Math.atan2(_a.dot(_c.crossVectors(_e, _t)), _e.dot(_t));
    setQ(i, j.q + Math.max(-step, Math.min(step, ang)));
    j.rot.updateMatrixWorld(true);
  }
  const wv = new THREE.Vector3(), tv = new THREE.Vector3(), down = new THREE.Vector3();
  let Ltool = 0.12;
  // Approach mostly from above, tilted ~26° away from the base (a straight-down
  // approach pushes this arm's wrist into its joint limit). Place the wrist,
  // aim the tool, then a final pass puts the fingertips exactly on target.
  const TILT = 0.45, tdir = new THREE.Vector3(), radial = new THREE.Vector3(), aim = new THREE.Vector3();
  function solve(tcpTarget, iters = 14) {
    radial.copy(tcpTarget).sub(base).setY(0);
    if (radial.lengthSq() < 1e-6) radial.copy(F);
    radial.normalize();
    tdir.copy(UP).multiplyScalar(-Math.cos(TILT)).addScaledVector(radial, Math.sin(TILT));
    const wristTarget = tcpTarget.clone().addScaledVector(tdir, -Ltool);
    for (let k = 0; k < iters; k++) for (const i of [ELBOW, PITCH, ROT]) { wristPos(wv); rotateToward(i, wv, wristTarget, 0.35); }
    for (let k = 0; k < 4; k++) { wristPos(wv); tcp.getWorldPosition(tv); aim.copy(wv).addScaledVector(tdir, Ltool); rotateToward(WPITCH, tv, aim, 0.6); }
    for (let k = 0; k < 6; k++) for (const i of [WPITCH, ELBOW, PITCH, ROT]) { tcp.getWorldPosition(tv); rotateToward(i, tv, tcpTarget, 0.2); }
  }

  /* --------------------------------------------------------- the props */
  const OBJ = [
    { name: 'pink cube', color: 0xe8578f, geo: new THREE.BoxGeometry(0.022, 0.022, 0.022), h: 0.022 },
    { name: 'blue can', color: 0x3d7be0, geo: new THREE.CylinderGeometry(0.011, 0.011, 0.034, 40), h: 0.034 },
    { name: 'green ball', color: 0x27a35f, geo: new THREE.SphereGeometry(0.0125, 40, 20), h: 0.025 }
  ];
  OBJ.forEach(o => {
    o.mesh = new THREE.Mesh(o.geo, new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.4 }));
    o.mesh.castShadow = true; scene.add(o.mesh);
    o.ringBase = new THREE.Mesh(new THREE.RingGeometry(0.021, 0.026, 64), new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.18 }));
    o.ringBase.rotation.x = -PI / 2; scene.add(o.ringBase);
    o.ring = new THREE.Mesh(new THREE.RingGeometry(0.021, 0.026, 64, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: o.color }));
    o.ring.rotation.x = -PI / 2; scene.add(o.ring);
    o.ev = 0; o.prog = -1; o.state = 'table';
  });
  const tray = new THREE.Group(); scene.add(tray);
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xd9f5f2, roughness: 0.7 });
  [[0.1, 0.004, 0.1, 0, 0.002, 0], [0.1, 0.022, 0.004, 0, 0.011, 0.048], [0.1, 0.022, 0.004, 0, 0.011, -0.048], [0.004, 0.022, 0.1, 0.048, 0.011, 0], [0.004, 0.022, 0.1, -0.048, 0.011, 0]]
    .forEach(([w, h, d, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trayMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; tray.add(m); });

  /* --------------------------------------------------- layout & camera */
  const base = new THREE.Vector3(), F = new THREE.Vector3(), S = new THREE.Vector3();
  let readyT = new THREE.Vector3(), trayDrop = new THREE.Vector3();
  function layout() {
    J[ROT].rot.getWorldPosition(base); base.y = 0;
    // forward = where the arm reaches at rotation 0, from forward kinematics
    tcp.getWorldPosition(F); F.sub(base).setY(0);
    if (F.lengthSq() < 1e-6) F.set(0, 0, -1);
    F.normalize(); S.crossVectors(F, UP).normalize();
    wristPos(wv); tcp.getWorldPosition(tv); Ltool = wv.distanceTo(tv);
    const R = 0.19, angs = [-0.72, 0, 0.72];
    OBJ.forEach((o, i) => {
      const d = F.clone().applyAxisAngle(UP, angs[i]);
      o.home = base.clone().addScaledVector(d, R).setY(o.h / 2);
      o.mesh.position.copy(o.home);
      o.ringBase.position.set(o.home.x, 0.0008, o.home.z); o.ring.position.copy(o.ringBase.position);
    });
    const td = F.clone().applyAxisAngle(UP, 1.85);
    tray.position.copy(base).addScaledVector(td, 0.175); tray.lookAt(base.x, 0, base.z);
    trayDrop.copy(tray.position).setY(0.075);
    readyT = base.clone().addScaledVector(F, 0.14).setY(0.085);
    // the robot sits across the table from you, objects in between
    camera.position.copy(base).addScaledVector(F, 0.58).addScaledVector(S, 0.19).addScaledVector(UP, 0.36);
    camera.lookAt(base.clone().addScaledVector(F, 0.1).setY(0.09));
    fit();
  }
  function fit() {
    const r = stageEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = camera.aspect < 0.9 ? 52 : camera.aspect < 1.3 ? 44 : 36;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => fit()).observe(stageEl);

  /* ------------------------------------------------------------ loading */
  const loader = new STLLoader();
  const files = SPEC.flatMap((s, i) => s.meshes.map(m => [m, i]));
  let loaded = 0, ready = false;
  Promise.all(files.map(([m, i]) => new Promise((res, rej) => loader.load('models/so100/' + m + '.stl', g => {
    const mesh = new THREE.Mesh(g, m.endsWith('Motor') ? motor : white);
    mesh.castShadow = true; mesh.receiveShadow = true;
    SPEC[i].node.add(mesh); loaded++; tell(`loading the robot… ${loaded}/${files.length}`); res();
  }, undefined, rej)))).then(() => {
    robot.updateMatrixWorld(true);
    layout();
    target.copy(readyT); solve(target, 40);
    ready = true;
    tell(coarse ? 'Tap an object, or use your webcam' : 'Rest your mouse on an object, or use your webcam');
  }).catch(() => tell('could not load the robot model'));

  /* --------------------------------------------- selection (gaze_lock.py) */
  const SELECT = 0.9, TAU = 1.5, DOM = 2, CAP = SELECT * 1.5;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let mouse = null, mouseAt = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tableP = new THREE.Plane(UP, 0), hit = new THREE.Vector3();
  function tablePoint(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(tableP, hit) ? hit.clone() : null;
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; mouseAt = performance.now(); } });
  canvas.addEventListener('pointerleave', () => { mouse = null; });
  canvas.addEventListener('pointerdown', e => {
    if (!ready || mode !== 'idle') return;
    const p = tablePoint(e); if (!p) return;
    let best = null, bd = 0.05;
    OBJ.forEach(o => { if (o.state !== 'table') return; const d = Math.hypot(o.home.x - p.x, o.home.z - p.z); if (d < bd) { bd = d; best = o; } });
    if (best) startPick(best);
  });
  function scoresFromMouse() {
    if (!mouse || performance.now() - mouseAt > 3000) return null;
    // distance on screen, like gaze: full credit within ~3% of the width, falling off beyond
    const sig = 0.05 * mouse.w;
    return OBJ.map(o => {
      if (o.state !== 'table') return 0;
      const v = o.home.clone().project(camera), sx = (v.x + 1) / 2 * mouse.w, sy = (1 - v.y) / 2 * mouse.h;
      const d = Math.max(0, Math.hypot(sx - mouse.x, sy - mouse.y) - 0.03 * mouse.w);
      return Math.exp(-((d / sig) ** 2));
    });
  }

  /* -------------------------------------------------------- pick & place */
  let mode = 'idle', task = null;
  const target = new THREE.Vector3();
  let jawQ = 0.6, jawGoal = 0.6;
  function startPick(o) {
    mode = 'busy';
    OBJ.forEach(x => x.ev = 0);
    const above = o.home.clone().setY(o.h / 2 + 0.075), grasp = o.home.clone().setY(o.h / 2 + 0.002);
    const slot = OBJ.filter(x => x.state === 'tray').length, off = [[-0.022, -0.018], [0.022, -0.012], [0, 0.022]][slot];
    const place = tray.localToWorld(new THREE.Vector3(off[0], 0, off[1]));
    task = {
      o, i: 0, t: 0, from: target.clone(), place,
      steps: [
        { to: above, dur: 0.95, jaw: 0.95, say: `Picking up the ${o.name}` },
        { to: grasp, dur: 0.6, jaw: 0.95 },
        { to: grasp, dur: 0.35, jaw: 0.02, end: () => { o.state = 'held'; tcp.attach(o.mesh); } },
        { to: above.clone().setY(0.11), dur: 0.5, jaw: 0.02 },
        { to: trayDrop, dur: 1.0, jaw: 0.02, say: 'Into the tray' },
        { to: trayDrop, dur: 0.35, jaw: 0.95, start: () => { scene.attach(o.mesh); o.state = 'falling'; o.vy = 0; o.slot = place; } },
        { to: readyT, dur: 0.9, jaw: 0.6 }
      ]
    };
  }
  const ease = x => x * x * (3 - 2 * x);
  function runTask(dt) {
    const s = task.steps[task.i];
    if (task.t === 0) { if (s.say) tell(s.say, true); if (s.start) s.start(); }
    task.t += dt;
    const k = Math.min(1, task.t / s.dur);
    target.lerpVectors(task.from, s.to, ease(k));
    jawGoal = s.jaw;
    if (k >= 1) {
      if (s.end) s.end();
      task.i++; task.t = 0; task.from = s.to.clone();
      if (task.i >= task.steps.length) {
        task = null; mode = 'idle';
        const left = OBJ.filter(o => o.state === 'table').length;
        tell(left ? 'Look at, or point at, another one' : 'All three in the tray!', !left);
        if (!left) setTimeout(resetAll, 3500);
      }
    }
  }
  function resetAll() {
    if (mode !== 'idle') return;
    OBJ.forEach(o => { scene.attach(o.mesh); o.state = 'returning'; o.from = o.mesh.position.clone(); o.rt = 0; o.mesh.rotation.set(0, 0, 0); });
    tell(camOn ? 'Look at an object' : coarse ? 'Tap an object, or use your webcam' : 'Rest your mouse on an object, or use your webcam');
  }
  btnReset.addEventListener('click', resetAll);

  /* ----------------------------------------------------- webcam gaze */
  const VB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  let camOn = false, lm = null, stream = null, feat = null, gx = 0, lastVT = -1, wGaze = null, calib = null;
  async function startCam() {
    btnCam.disabled = true; btnCam.textContent = 'Starting camera…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      camVideo.srcObject = stream; await camVideo.play();
      camBox.hidden = false;
      tell('Loading face tracking…');
      if (!lm) {
        const vision = await import(VB + '/vision_bundle.mjs');
        const fs = await vision.FilesetResolver.forVisionTasks(VB + '/wasm');
        lm = await vision.FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true
        });
      }
      camOn = true; gazeBar.hidden = false; btnRecal.hidden = false;
      btnCam.textContent = 'Turn off webcam'; btnCam.disabled = false;
      startCalibration();
    } catch (err) {
      btnCam.disabled = false; btnCam.textContent = 'Use my webcam';
      tell(err && err.name === 'NotAllowedError' ? 'Camera permission was blocked' : 'Could not start the camera');
      stopCam(true);
    }
  }
  function stopCam(quiet) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; camOn = false; calib = null; camBox.hidden = true; gazeBar.hidden = true; btnRecal.hidden = true;
    btnCam.textContent = 'Use my webcam';
    if (!quiet) tell(coarse ? 'Tap an object, or use your webcam' : 'Rest your mouse on an object, or use your webcam');
  }
  btnCam.addEventListener('click', () => camOn ? stopCam() : startCam());
  btnRecal.addEventListener('click', () => camOn && startCalibration());

  // objects ordered left → right as they appear on screen; calibration targets −1, 0, +1
  function screenOrder() {
    return OBJ.map(o => ({ o, x: o.home.clone().project(camera).x })).sort((a, b) => a.x - b.x).map(e => e.o);
  }
  function startCalibration() {
    if (mode === 'busy') return;
    mode = 'calib';
    const order = screenOrder();
    order.forEach((o, i) => o.gx = i - 1);
    calib = { order, k: 0, t: 0, samples: [] };
    OBJ.forEach(o => o.ev = 0);
  }
  function runCalibration(dt) {
    const c = calib, o = c.order[c.k];
    c.t += dt;
    tell(`Calibrating ${c.k + 1}/3: look at the ${o.name}`, true);
    OBJ.forEach(x => x.ev = x === o ? Math.min(SELECT, (c.t / 1.8) * SELECT) : 0);
    if (c.t > 0.7 && feat) c.samples.push([feat[0], feat[1], 1, o.gx]);
    if (c.t > 1.8) {
      c.k++; c.t = 0;
      if (c.k === 3) {
        wGaze = fitLinear(c.samples);
        calib = null; mode = 'idle'; OBJ.forEach(x => x.ev = 0);
        tell(wGaze ? 'Calibrated. Now look at an object and hold it' : 'I lost your face. Try Recalibrate', !!wGaze);
      }
    }
  }
  // least squares: gaze = w0·yaw + w1·irisX + w2
  function fitLinear(rows) {
    if (rows.length < 12) return null;
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    rows.forEach(r => { for (let i = 0; i < 3; i++) { b[i] += r[i] * r[3]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } });
    for (let i = 0; i < 3; i++) A[i][i] += 1e-6 * rows.length;
    // Gaussian elimination
    for (let i = 0; i < 3; i++) {
      let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let r = i + 1; r < 3; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const w = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < 3; c++) s -= A[i][c] * w[c]; w[i] = s / A[i][i]; }
    return w;
  }
  const ratio = (p, a, b) => { const vx = b.x - a.x, vy = b.y - a.y; return ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1); };
  function readFace() {
    if (!camOn || !lm || camVideo.readyState < 2 || camVideo.currentTime === lastVT) return;
    lastVT = camVideo.currentTime;
    const res = lm.detectForVideo(camVideo, performance.now());
    const pts = res.faceLandmarks && res.faceLandmarks[0];
    const cr = camCanvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    camCanvas.width = cr.width * dpr; camCanvas.height = cr.height * dpr;
    const x = camCanvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!pts) { feat = null; return; }
    const m = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
    const yaw = m ? Math.atan2(m.data[8], m.data[10]) * 180 / PI : 0;
    const irisX = (ratio(pts[468], pts[33], pts[133]) + ratio(pts[473], pts[362], pts[263])) / 2;
    feat = [yaw, irisX];
    // mirror-drawn face points and irises
    const vw = camVideo.videoWidth, vh = camVideo.videoHeight, s = Math.max(cr.width / vw, cr.height / vh), ox = (cr.width - vw * s) / 2, oy = (cr.height - vh * s) / 2;
    const P = p => [cr.width - (ox + p.x * vw * s), oy + p.y * vh * s];
    x.fillStyle = 'rgba(20,181,170,.8)';
    for (let i = 0; i < 468; i += 6) { const [a, b] = P(pts[i]); x.fillRect(a - .8, b - .8, 1.6, 1.6); }
    x.fillStyle = '#e8578f';
    [468, 473].forEach(i => { const [a, b] = P(pts[i]); x.beginPath(); x.arc(a, b, 2.6, 0, PI * 2); x.fill(); });
  }
  function scoresFromGaze() {
    if (!wGaze || !feat) return null;
    const g = wGaze[0] * feat[0] + wGaze[1] * feat[1] + wGaze[2];
    gx += (g - gx) * 0.35;
    gazeDot.style.left = (50 + Math.max(-1.3, Math.min(1.3, gx)) * 38) + '%';
    return OBJ.map(o => o.state !== 'table' || o.gx === undefined ? 0 : Math.exp(-(((gx - o.gx) / 0.42) ** 2)));
  }

  /* --------------------------------------------------------------- loop */
  let visible = true, last = performance.now(), idleT = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(stageEl);
  function updateRing(o) {
    const p = Math.round(Math.min(1, o.ev / SELECT) * 60) / 60;
    if (p === o.prog) return;
    o.prog = p; o.ring.geometry.dispose();
    o.ring.geometry = new THREE.RingGeometry(0.021, 0.026, 64, 1, PI / 2, Math.max(0.001, p * PI * 2));
  }
  const lean = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || !ready) return;
    if (camOn) readFace();

    if (mode === 'calib') runCalibration(dt);
    else if (mode === 'busy') runTask(dt);
    else {
      const sc = camOn ? scoresFromGaze() : scoresFromMouse();
      OBJ.forEach((o, i) => { const s = sc ? sc[i] : 0; o.ev = o.state === 'table' ? Math.min(CAP, o.ev * Math.exp(-dt * (1 - s) / TAU) + s * dt) : 0; });
      const r = [...OBJ].sort((a, b) => b.ev - a.ev);
      if (r[0].ev >= SELECT && r[0].ev >= DOM * r[1].ev) startPick(r[0]);
      else if (r[0].ev > 0.12) tell(`Looking at the ${r[0].name}… ${Math.round(Math.min(1, r[0].ev / SELECT) * 100)}%`);
      // idle: lean gently toward whatever has the most attention
      idleT += dt;
      lean.copy(readyT);
      if (r[0].ev > 0.05) lean.lerp(r[0].home.clone().setY(0.09), Math.min(1, r[0].ev / SELECT) * 0.45);
      else if (!reduced) lean.addScaledVector(S, Math.sin(idleT * 0.6) * 0.02);
      target.lerp(lean, 0.06);
      jawGoal = 0.6;
    }
    solve(target);
    jawQ += (jawGoal - jawQ) * 0.25; setQ(JAW, jawQ);
    robot.updateMatrixWorld(true);

    OBJ.forEach(o => {
      updateRing(o);
      o.ring.visible = o.ringBase.visible = o.state === 'table';
      if (o.state === 'falling') {
        o.vy -= 9.8 * dt;
        const p = o.mesh.position; p.x += (o.slot.x - p.x) * 0.2; p.z += (o.slot.z - p.z) * 0.2; p.y += o.vy * dt;
        const floor = 0.004 + o.h / 2;
        if (p.y <= floor) { p.y = floor; o.state = 'tray'; }
      } else if (o.state === 'returning') {
        o.rt += dt; const k = ease(Math.min(1, o.rt / 0.8));
        o.mesh.position.lerpVectors(o.from, o.home, k); o.mesh.position.y += Math.sin(k * PI) * 0.06;
        if (k >= 1) o.state = 'table';
      }
    });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
