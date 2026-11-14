import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { forward, inverse, multiply, pose } from './den/lite6.js';

// A visual-only Lite 6. These are the manufacturer's meshes and joint frames;
// nothing in this module connects to, or issues commands to, robot hardware.
const PAGES = [
  ['about', 'About'], ['projects', 'Projects'], ['research', 'Research'],
  ['background', 'Background'], ['beyond', 'Beyond'], ['contact', 'Contact'],
];
const COLORS = { studio: '#f7f7f2', paper: '#e6f0ec', ivory: '#deded4', ink: '#312b39', lime: '#dceac6', joint: '#36353b' };
const PLAQUE = { width: 0.145, height: 0.104, thickness: 0.009, radius: 0.37 };
const INITIAL_JOINTS = [0, 0.3, 1.2, 0, 1.2, 0];
const REST = pose([0.18, 0, 0.255], [0.35, 0, -1], [0, 1, 0]);
const DISPLAY = pose([0.27, 0, 0.29], [1, 0, 0], [0, 1, 0]);
// The plaque's top is tangent to the vacuum cup. This transform is its own inverse.
const ATTACH = new Float64Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, PLAQUE.thickness / 2, 1]);
const above = (matrix, height) => { const next = matrix.slice(); next[14] += height; return next; };
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const abortError = () => new DOMException('The studio scene was disposed.', 'AbortError');

// STL coordinates are metres. Match coincident vertices to a micrometre, then
// average only nearby face normals, weighted by each corner's angle. Positions
// remain byte-for-byte unchanged, including the manufacturer's sharp seams.
function smoothSTLNormals(input) {
  const geometry = input.index ? input.toNonIndexed() : input;
  const positions = geometry.getAttribute('position'), adjacency = new Map();
  const normals = new Float32Array(positions.count * 3), faces = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), normal = new THREE.Vector3();
  const keyAt = index => `${Math.round(positions.getX(index) * 1e6)},${Math.round(positions.getY(index) * 1e6)},${Math.round(positions.getZ(index) * 1e6)}`;
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index); b.fromBufferAttribute(positions, index + 1); c.fromBufferAttribute(positions, index + 2);
    normal.crossVectors(u.subVectors(b, a), v.subVectors(c, a)).normalize();
    const face = normal.clone(); faces.push(face);
    const corners = [a, b, c];
    corners.forEach((point, corner) => {
      u.subVectors(corners[(corner + 1) % 3], point).normalize();
      v.subVectors(corners[(corner + 2) % 3], point).normalize();
      const weight = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
      const key = keyAt(index + corner), list = adjacency.get(key) || [];
      list.push({ face, weight }); adjacency.set(key, list);
    });
  }
  const threshold = Math.cos(Math.PI / 3);
  for (let index = 0; index < positions.count; index += 1) {
    const face = faces[Math.floor(index / 3)]; normal.set(0, 0, 0);
    for (const neighbor of adjacency.get(keyAt(index))) {
      if (face.dot(neighbor.face) > threshold) normal.addScaledVector(neighbor.face, neighbor.weight);
    }
    normal.normalize().toArray(normals, index * 3);
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/**
 * Create the minimal portfolio stage. pick() and putBack() are serialized and
 * resolve only when their whole choreography has finished; either accepts
 * { immediate: true } to settle directly into its final state. Async presentation
 * hooks let the host resize the same canvas before zooming and before lowering.
 * The scene renders only when it changes, including behind a translucent reader.
 */
export async function createStudioScene(canvas, {
  onSelect = () => {}, onStatus = () => {}, onReady = () => {},
  onPresent = async () => {}, onRetract = async () => {}, onPresentationChange = () => {},
} = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('A canvas is required for the studio scene.');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    onStatus('The 3D studio is unavailable. You can still open every page.');
    throw error;
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  renderer.setClearColor(COLORS.studio, 0);
  scene.fog = new THREE.Fog(COLORS.studio, 2.8, 7);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.015, 12);
  const cameraTarget = new THREE.Vector3(0, 0.19, 0.03);
  const homeTarget = cameraTarget.clone();
  const homePosition = new THREE.Vector3();
  const homeDirection = new THREE.Vector3(0.57, 0.84, 1.04).normalize();
  let cameraProgress = 0;
  let active = true, readerMode = false, disposed = false, contextLost = false, held = null, hovered = null, pointerDown = null;
  let joints = INITIAL_JOINTS.slice(), operationQueue = Promise.resolve(), animationFrame = 0, cancelMotion = null;
  let width = 1, height = 1;
  const textures = new Set(), geometries = new Set(), materials = new Set();
  const keepGeometry = geometry => { geometries.add(geometry); return geometry; };
  const keepMaterial = material => { materials.add(material); return material; };
  const keepTexture = texture => { textures.add(texture); return texture; };
  let environmentTarget;

  const render = () => {
    if (!disposed && active && !contextLost && width > 0 && height > 0) {
      renderer.render(scene, camera);
      onPresentationChange(getPresentationRect());
    }
  };
  const notify = message => { if (!disposed) onStatus(message); };
  const setCamera = progress => {
    cameraProgress = progress;
    // The cup presents the plaque upright before the camera moves. The final
    // view is exactly frontal and the plate spans 92% of the canvas width.
    const face = new THREE.Matrix4().fromArray(multiply(DISPLAY, ATTACH)).premultiply(robot.matrix);
    const center = new THREE.Vector3(0, 0, -PLAQUE.thickness / 2).applyMatrix4(face);
    const normal = new THREE.Vector3(0, 0, -1).transformDirection(face);
    const up = new THREE.Vector3(0, -1, 0).transformDirection(face);
    const distance = PLAQUE.width / (0.92 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const reader = document.querySelector('#s-reader');
    const headerHeight = document.querySelector('.s-header')?.getBoundingClientRect().height || 74;
    const readerMargin = reader ? parseFloat(getComputedStyle(reader).marginTop) || 0 : 36;
    const topFraction = Math.min(0.32, (headerHeight + readerMargin) / Math.max(height, 1));
    const focusTarget = center.clone().addScaledVector(up, PLAQUE.height / 2 - worldHeight * (0.5 - topFraction));
    const closer = focusTarget.clone().addScaledVector(normal, distance);
    camera.position.lerpVectors(homePosition, closer, progress);
    cameraTarget.lerpVectors(homeTarget, focusTarget, progress);
    camera.lookAt(cameraTarget);
    if (held) held.labelMaterial.opacity = readerMode ? 0 : 1 - THREE.MathUtils.smoothstep(progress, 0.12, 0.72);
  };
  const resize = () => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Keep the full fan of plaques visible in narrow/mobile canvas containers.
    const distance = 1.34 * Math.max(1, 0.92 / camera.aspect);
    homePosition.copy(homeTarget).addScaledVector(homeDirection, distance);
    setCamera(cameraProgress);
    renderer.setSize(Math.round(width), Math.round(height), false);
    render();
  };

  // The URDF uses z-up and x-forward; Three uses y-up. Each STL stays in its
  // manufacturer's link frame, transformed by the tested forward kinematics.
  const robot = new THREE.Group();
  robot.matrixAutoUpdate = false;
  robot.matrix.set(0, 1, 0, 0, 0, 0, 1, 0.007, 1, 0, 0, -0.11, 0, 0, 0, 1);
  scene.add(robot);
  const links = [], plaques = [];
  const suctionSeal = new THREE.Group();
  suctionSeal.matrixAutoUpdate = false; robot.add(suctionSeal);
  const applyJoints = q => {
    const frames = forward(q);
    if (links.length) {
      links[0].matrix.identity();
      frames.links.forEach((frame, index) => links[index + 1].matrix.fromArray(frame));
      links[7].matrix.fromArray(frames.links[5]);
    }
    suctionSeal.matrix.fromArray(frames.tcp);
    if (held) held.mesh.matrix.fromArray(multiply(frames.tcp, ATTACH));
    robot.updateMatrixWorld(true);
  };

  const white = keepMaterial(new THREE.MeshPhysicalMaterial({ color: COLORS.ivory, roughness: 0.43, metalness: 0.06, clearcoat: 0.28, clearcoatRoughness: 0.38, envMapIntensity: 0.32 }));
  const charcoal = keepMaterial(new THREE.MeshPhysicalMaterial({ color: COLORS.joint, roughness: 0.48, metalness: 0.24, clearcoat: 0.15, envMapIntensity: 0.2 }));
  const paperGeometry = keepGeometry(new RoundedBoxGeometry(PLAQUE.width, PLAQUE.height, PLAQUE.thickness, 4, 0.004));
  const labelGeometry = keepGeometry(new THREE.PlaneGeometry(PLAQUE.width * 0.94, PLAQUE.height * 0.94));

  // The STL's actual cup tip is 15 mm across. Add its thin silicone sealing
  // lip at the real TCP, not a decorative circle on the front of the page.
  const sealLip = new THREE.Mesh(keepGeometry(new THREE.TorusGeometry(0.0078, 0.00065, 12, 72)),
    keepMaterial(new THREE.MeshPhysicalMaterial({ color: '#bfcbc4', roughness: 0.3, metalness: 0, clearcoat: 0.7, envMapIntensity: 0.25 })));
  sealLip.position.z = -0.00015; suctionSeal.add(sealLip);
  const sealInner = new THREE.Mesh(keepGeometry(new THREE.TorusGeometry(0.0065, 0.00022, 8, 64)),
    keepMaterial(new THREE.MeshStandardMaterial({ color: '#344c3c', roughness: 0.5, envMapIntensity: 0.15 })));
  sealInner.position.z = -0.00025; suctionSeal.add(sealInner);

  // Wait briefly for the actual label font; slow font servers must not block
  // navigation. The later fonts.ready refresh also covers the timeout case.
  if (document.fonts?.load) {
    let fontTimer;
    try {
      await Promise.race([
        Promise.all([document.fonts.load('500 48px Figtree'), document.fonts.load('600 48px Figtree'), document.fonts.load('500 48px "DM Mono"')]),
        new Promise(resolve => { fontTimer = setTimeout(resolve, 900); }),
      ]);
    } catch (_) { /* The system sans-serif remains a usable fallback. */ }
    clearTimeout(fontTimer);
  }

  function drawLabel(title, index) {
    const label = document.createElement('canvas');
    label.width = 1024; label.height = 736;
    const ctx = label.getContext('2d');
    if (!ctx) throw new Error('The studio could not create its page labels.');
    ctx.clearRect(0, 0, label.width, label.height);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '500 90px "DM Mono", monospace';
    ctx.fillText(String(index + 1).padStart(2, '0'), 66, 148);
    ctx.strokeStyle = 'rgba(64,73,64,.24)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(66, 202); ctx.lineTo(958, 202); ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    // Preserve letter proportions: shrink the font instead of canvas maxWidth,
    // which horizontally compresses long names such as Background.
    let fontSize = 172;
    ctx.font = `600 ${fontSize}px Figtree, Arial, sans-serif`;
    while (ctx.measureText(title).width > 890 && fontSize > 100) {
      fontSize -= 2; ctx.font = `600 ${fontSize}px Figtree, Arial, sans-serif`;
    }
    ctx.fillText(title, 64, 486);
    const texture = keepTexture(new THREE.CanvasTexture(label));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return texture;
  }

  PAGES.forEach(([id, title], index) => {
    const angle = THREE.MathUtils.degToRad(-67.5 + index * 27);
    const c = Math.cos(angle), s = Math.sin(angle);
    // Parallel page edges face the camera, rather than twisting labels around
    // the fan. The grasp pose is derived from this same physical plaque frame.
    const facing = Math.atan2(homeDirection.x, homeDirection.z), fs = Math.sin(facing), fc = Math.cos(facing);
    const rest = new Float64Array([-fs, fc, 0, 0, -fc, -fs, 0, 0, 0, 0, 1, 0, PLAQUE.radius * c, PLAQUE.radius * s, 0.006 + PLAQUE.thickness / 2, 1]);
    const material = keepMaterial(new THREE.MeshPhysicalMaterial({
      color: COLORS.paper, roughness: 0.16, metalness: 0, transmission: 0.62,
      transparent: true, opacity: 0.7, thickness: PLAQUE.thickness, ior: 1.46,
      attenuationColor: '#c4dacf', attenuationDistance: 0.2,
      clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.7,
    }));
    const mesh = new THREE.Mesh(paperGeometry, material);
    mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(rest);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.page = id;
    const labelMaterial = keepMaterial(new THREE.MeshBasicMaterial({ map: drawLabel(title, index), transparent: true, depthWrite: false, toneMapped: false }));
    const front = new THREE.Mesh(labelGeometry, labelMaterial);
    front.position.z = PLAQUE.thickness / 2 + 0.00015;
    const back = new THREE.Mesh(labelGeometry, labelMaterial);
    // The back becomes the readable front when the suction cup lifts the page.
    back.rotation.x = Math.PI; back.position.z = -PLAQUE.thickness / 2 - 0.00015;
    mesh.add(front, back); robot.add(mesh);
    plaques.push({ id, title, mesh, material, labelMaterial, rest, contact: multiply(rest, ATTACH) });
  });

  function buildStage() {
    // Only shadows are drawn on the floor. The transparent canvas lets the
    // surrounding CSS paper color continue through the stage without a seam.
    const ground = new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(200, 200)), keepMaterial(new THREE.ShadowMaterial({ color: '#554d5d', opacity: 0.2 })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const mount = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(0.079, 0.082, 0.008, 64)), keepMaterial(new THREE.MeshStandardMaterial({ color: '#d6d2c7', roughness: 0.7, envMapIntensity: 0.18 })));
    mount.position.set(0, 0.004, -0.11); mount.castShadow = true; mount.receiveShadow = true; scene.add(mount);

    // Broad, subtle contact darkening under the base; no room walls or furniture.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(73,62,70,.23)'); gradient.addColorStop(0.45, 'rgba(73,62,70,.10)'); gradient.addColorStop(1, 'rgba(73,62,70,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      const shadow = new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(0.5, 0.5)), keepMaterial(new THREE.MeshBasicMaterial({ map: keepTexture(new THREE.CanvasTexture(shadowCanvas)), transparent: true, depthWrite: false, toneMapped: false })));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.0005, -0.11); scene.add(shadow);
    }
    scene.add(new THREE.HemisphereLight('#fffdf8', '#c2b8c8', 1.05));
    const key = new THREE.DirectionalLight('#fff6e6', 1.9);
    key.position.set(-1.4, 2.7, 1.7); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 0.2; key.shadow.camera.far = 7;
    key.shadow.camera.left = -0.85; key.shadow.camera.right = 0.85; key.shadow.camera.top = 0.85; key.shadow.camera.bottom = -0.85;
    key.shadow.normalBias = 0.002; key.shadow.bias = -0.00015; key.shadow.radius = 4;
    key.target.position.set(0, 0.12, 0); scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#e6def0', 0.48); fill.position.set(1.7, 1.2, -0.8); scene.add(fill);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(environment, 0.05);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.5;
    environment.dispose(); pmrem.dispose();
  }

  async function buildPlant() {
    const loader = new GLTFLoader();
    const { scene: plant } = await loader.loadAsync(new URL('../den/models/potted_plant_02/potted_plant_02.gltf', import.meta.url).href);
    const ceramic = keepMaterial(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.46, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.24 }));
    const soil = keepMaterial(new THREE.MeshStandardMaterial({ color: '#383327', roughness: 1, envMapIntensity: 0.08 }));
    plant.traverse(object => {
      if (!object.isMesh) return;
      keepGeometry(object.geometry);
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      originals.forEach(material => {
        keepMaterial(material);
        Object.values(material).forEach(value => { if (value?.isTexture) keepTexture(value); });
      });
      if (object.name.endsWith('_pot')) object.material = ceramic;
      else if (object.name.endsWith('_dirt')) object.material = soil;
      else {
        object.material.envMapIntensity = 0.22;
        object.material.roughness = 0.78;
      }
      object.castShadow = true; object.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(plant), size = bounds.getSize(new THREE.Vector3());
    plant.scale.setScalar(0.33 / Math.max(size.y, 0.001));
    bounds.setFromObject(plant);
    const center = bounds.getCenter(new THREE.Vector3());
    plant.position.set(0.36 - center.x, -bounds.min.y, -0.29 - center.z);
    plant.rotation.y = -0.22;
    scene.add(plant);
  }

  async function buildArm() {
    const loader = new STLLoader();
    const names = ['link_base', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'vacuum_gripper_lite'];
    // allSettled lets us release every fulfilled geometry if any asset fails.
    const results = await Promise.allSettled(names.map(name => loader.loadAsync(new URL(`../models/lite6/${name}.stl`, import.meta.url).href)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) {
      results.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
      throw failed.reason;
    }
    results.forEach((result, index) => {
      const original = result.value;
      const smooth = smoothSTLNormals(original);
      if (smooth !== original) original.dispose();
      keepGeometry(smooth);
      // Small wrist/shoulder parts are charcoal; the long housing stays ivory.
      const mesh = new THREE.Mesh(smooth, [1, 6, 7].includes(index) ? charcoal : white);
      mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true;
      links.push(mesh); robot.add(mesh);
    });
  }

  function tween(duration, update) {
    if (disposed) return Promise.reject(abortError());
    if (reduceMotion.matches) { update(1); render(); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const began = performance.now();
      cancelMotion = () => { cancelAnimationFrame(animationFrame); cancelMotion = null; reject(abortError()); };
      const frame = now => {
        if (disposed) { cancelMotion?.(); return; }
        const progress = Math.min(1, (now - began) / duration);
        update(ease(progress)); render();
        if (progress < 1) animationFrame = requestAnimationFrame(frame);
        else { animationFrame = 0; cancelMotion = null; resolve(); }
      };
      animationFrame = requestAnimationFrame(frame);
    });
  }
  function move(target, duration) {
    const from = joints.slice();
    const result = inverse(target, from, { iterations: 220 });
    if (!result.ok) return Promise.reject(new Error('The studio could not reach this page.'));
    return tween(duration, progress => {
      joints = from.map((angle, index) => angle + (result.q[index] - angle) * progress);
      applyJoints(joints);
    });
  }
  const dolly = (progress, duration) => {
    const from = cameraProgress;
    return tween(duration, amount => setCamera(from + (progress - from) * amount));
  };
  function hover(pageId) {
    if (disposed) return;
    const id = pageId === 'path' ? 'background' : pageId;
    hovered = held ? null : plaques.find(plaque => plaque.id === id) || null;
    plaques.forEach(plaque => {
      plaque.material.color.set(plaque === hovered ? COLORS.lime : COLORS.paper);
      plaque.material.emissive.set(plaque === hovered ? '#aeb77b' : '#000000');
      plaque.material.emissiveIntensity = plaque === hovered ? 0.045 : 0;
      plaque.material.opacity = plaque === held ? 0.56 : 0.7;
    });
    canvas.style.cursor = hovered ? 'pointer' : 'default'; render();
  }
  async function returnHeld({ immediate = false } = {}) {
    readerMode = false;
    if (immediate || reduceMotion.matches) {
      const result = inverse(REST, joints, { iterations: 220 });
      if (!result.ok) throw new Error('The studio could not return to its resting pose.');
      if (held) {
        setCamera(0); render();
        await onRetract({ pageId: held.id, immediate: true });
        if (disposed) throw abortError();
        held.labelMaterial.opacity = 1;
        held.mesh.matrix.fromArray(held.rest);
      }
      held = null;
      joints = result.q; applyJoints(joints); setCamera(0); hover(null);
      notify('Ready when you are');
      return;
    }
    if (!held) { await dolly(0, 180); return; }
    const plaque = held;
    notify(`Putting ${plaque.title} back`);
    // Restore the wide camera completely before the robot begins to lower.
    await dolly(0, 520);
    await onRetract({ pageId: plaque.id, immediate: false });
    if (disposed) throw abortError();
    resize();
    await move(above(plaque.contact, 0.135), 330);
    await move(plaque.contact, 210);
    held = null; plaque.labelMaterial.opacity = 1; plaque.mesh.matrix.fromArray(plaque.rest);
    robot.updateMatrixWorld(true); hover(null);
    await move(above(plaque.contact, 0.09), 150);
    await move(REST, 220);
    notify('Ready when you are');
  }
  function enqueue(task) {
    const operation = operationQueue.then(() => {
      if (disposed) throw abortError();
      if (contextLost) throw new Error('The 3D canvas is temporarily unavailable.');
      return task();
    });
    operationQueue = operation.catch(() => {});
    return operation;
  }
  const pick = (pageId, { immediate = false } = {}) => enqueue(async () => {
    const id = pageId === 'path' ? 'background' : pageId;
    const plaque = plaques.find(item => item.id === id);
    if (!plaque) throw new RangeError(`Unknown studio page: ${pageId}`);
    if (held === plaque) return;
    if (held) await returnHeld({ immediate });
    readerMode = false;
    if (immediate || reduceMotion.matches) {
      const result = inverse(DISPLAY, joints, { iterations: 220 });
      if (!result.ok) throw new Error('The studio could not reach this page.');
      held = plaque;
      joints = result.q; applyJoints(joints);
      await onPresent({ pageId: id, immediate: true });
      if (disposed) throw abortError();
      resize(); setCamera(1); hover(null);
      notify(`${plaque.title} is ready`);
      return;
    }
    hover(id);
    notify(`Picking up ${plaque.title}`);
    await move(above(plaque.contact, 0.1), 430);
    await move(plaque.contact, 230);
    // Contact precedes attachment; thereafter the plaque follows the real TCP.
    held = plaque; hover(null); applyJoints(joints);
    await tween(70, () => {});
    await move(above(plaque.contact, 0.135), 270);
    await move(DISPLAY, 430);
    await onPresent({ pageId: id, immediate: false });
    if (disposed) throw abortError();
    resize();
    await dolly(1, 650);
    notify(`${plaque.title} is ready`);
  });
  const putBack = (options = {}) => enqueue(() => returnHeld(options));

  function getPresentationRect() {
    if (disposed || !held || !width || !height) return null;
    const bounds = canvas.getBoundingClientRect();
    camera.updateMatrixWorld(); robot.updateMatrixWorld(true);
    const project = world => {
      const point = world.clone().project(camera);
      return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2, depth: point.z };
    };
    const w = PLAQUE.width / 2, h = PLAQUE.height / 2, z = -PLAQUE.thickness / 2;
    // Clockwise, beginning at the reading face's top-left corner.
    const corners = [[-w, -h, z], [w, -h, z], [w, h, z], [-w, h, z]]
      .map(point => project(new THREE.Vector3(...point).applyMatrix4(held.mesh.matrixWorld)));
    const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y));
    const right = Math.max(...corners.map(point => point.x)), bottom = Math.max(...corners.map(point => point.y));
    const center = project(new THREE.Vector3(0, 0, z).applyMatrix4(held.mesh.matrixWorld));
    const toolFrame = new THREE.Matrix4().fromArray(forward(joints).tcp).premultiply(robot.matrix);
    const cupCenter = project(new THREE.Vector3(0, 0, 0).applyMatrix4(toolFrame));
    const cupEdge = project(new THREE.Vector3(0.00845, 0, 0).applyMatrix4(toolFrame));
    return {
      pageId: held.id, corners, left, top, right, bottom, width: right - left, height: bottom - top, center,
      suction: { x: cupCenter.x, y: cupCenter.y, radius: Math.hypot(cupEdge.x - cupCenter.x, cupEdge.y - cupCenter.y) },
      progress: cameraProgress,
      visible: corners.some(point => point.depth > -1 && point.depth < 1) && right > bounds.left && left < bounds.right && bottom > bounds.top && top < bounds.bottom,
    };
  }

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const hitPlaque = event => {
    if (held || disposed || !active || contextLost) return null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(plaques.map(plaque => plaque.mesh), false)[0];
    return hit ? plaques.find(plaque => plaque.mesh === hit.object) : null;
  };
  const onPointerMove = event => hover(hitPlaque(event)?.id);
  const onPointerLeave = () => { pointerDown = null; hover(null); };
  const onPointerDown = event => { pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerUp = event => {
    const down = pointerDown; pointerDown = null;
    if (!down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const plaque = hitPlaque(event);
    if (plaque) onSelect(plaque.id);
  };
  const onContextLost = event => {
    event.preventDefault(); contextLost = true;
    notify('The 3D studio paused. You can still open every page.');
  };
  const onContextRestored = () => { contextLost = false; resize(); notify(held ? `${held.title} is ready` : 'Ready when you are'); };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  window.addEventListener('resize', resize);

  function dispose() {
    if (disposed) return;
    disposed = true; active = false;
    cancelMotion?.(); cancelAnimationFrame(animationFrame);
    observer.disconnect(); window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointercancel', onPointerLeave);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    canvas.style.cursor = '';
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    environmentTarget?.dispose(); renderer.dispose(); scene.clear();
  }

  try {
    notify('Preparing the studio');
    buildStage(); resize();
    const assets = await Promise.allSettled([buildArm(), buildPlant()]);
    if (assets[0].status === 'rejected') throw assets[0].reason;
    if (assets[1].status === 'rejected') console.warn('The optional plant model could not load:', assets[1].reason);
    const rest = inverse(REST, INITIAL_JOINTS, { iterations: 220 });
    if (!rest.ok) throw new Error('The Lite 6 could not reach its resting pose.');
    joints = rest.q; applyJoints(joints); resize();
    notify('Ready when you are');
    onReady();
    // Refresh once custom fonts arrive, including when their loading was deferred.
    document.fonts?.ready.then(() => {
      if (disposed) return;
      plaques.forEach((plaque, index) => {
        const old = plaque.labelMaterial.map;
        plaque.labelMaterial.map = drawLabel(plaque.title, index);
        old.dispose(); textures.delete(old);
      });
      render();
    });
    return {
      pick, putBack, hover, dispose, getPresentationRect,
      setActive(value) { if (!disposed) { active = Boolean(value); if (active) resize(); } },
      setReaderMode(value) {
        if (disposed) return;
        readerMode = Boolean(value);
        if (readerMode) active = true;
        setCamera(cameraProgress); resize();
      },
    };
  } catch (error) {
    notify('The 3D studio is unavailable. You can still open every page.');
    dispose(); throw error;
  }
}
