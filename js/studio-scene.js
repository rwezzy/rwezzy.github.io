import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { forward, inverse, multiply, pose } from './den/lite6.js';

// A visual-only Lite 6. These are the manufacturer's meshes and joint frames;
// nothing in this module connects to, or issues commands to, robot hardware.
const PAGES = [
  ['about', 'About'], ['projects', 'Projects'], ['research', 'Research'],
  ['background', 'Background'], ['beyond', 'Beyond'], ['contact', 'Contact'],
];
const COLORS = { studio: '#f7f7f2', paper: '#e9e6dc', ivory: '#deded4', ink: '#312b39', lime: '#d5df9f', joint: '#36353b' };
const PLAQUE = { width: 0.145, height: 0.104, thickness: 0.009, radius: 0.37 };
const INITIAL_JOINTS = [0, 0.3, 1.2, 0, 1.2, 0];
const REST = pose([0.18, 0, 0.255], [0.35, 0, -1], [0, 1, 0]);
const DISPLAY = pose([0.27, 0, 0.29], [1, 0, 0], [0, 1, 0]);
// The plaque's top is tangent to the vacuum cup. This transform is its own inverse.
const ATTACH = new Float64Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, PLAQUE.thickness / 2, 1]);
const above = (matrix, height) => { const next = matrix.slice(); next[14] += height; return next; };
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const abortError = () => new DOMException('The studio scene was disposed.', 'AbortError');

/**
 * Create the minimal portfolio stage. pick() and putBack() are serialized and
 * resolve only when their whole choreography has finished; either accepts
 * { immediate: true } to settle directly into its final state. Call setActive(false)
 * while the HTML reader covers the stage. The scene renders only when it changes.
 */
export async function createStudioScene(canvas, { onSelect = () => {}, onStatus = () => {}, onReady = () => {} } = {}) {
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
  const focusTarget = new THREE.Vector3(0, 0.235, 0.11);
  let cameraProgress = 0;
  let active = true, disposed = false, contextLost = false, held = null, hovered = null, pointerDown = null;
  let joints = INITIAL_JOINTS.slice(), operationQueue = Promise.resolve(), animationFrame = 0, cancelMotion = null;
  let width = 1, height = 1;
  const textures = new Set(), geometries = new Set(), materials = new Set();
  const keepGeometry = geometry => { geometries.add(geometry); return geometry; };
  const keepMaterial = material => { materials.add(material); return material; };
  const keepTexture = texture => { textures.add(texture); return texture; };
  let environmentTarget;

  const render = () => {
    if (!disposed && active && !contextLost && width > 0 && height > 0) renderer.render(scene, camera);
  };
  const notify = message => { if (!disposed) onStatus(message); };
  const setCamera = progress => {
    cameraProgress = progress;
    // A small dolly after the lift, never an orbit or a jump into the plaque.
    const closer = homeTarget.clone().add(homePosition.clone().sub(homeTarget).multiplyScalar(0.85));
    camera.position.lerpVectors(homePosition, closer, progress);
    cameraTarget.lerpVectors(homeTarget, focusTarget, progress);
    camera.lookAt(cameraTarget);
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
  const applyJoints = q => {
    const frames = forward(q);
    if (links.length) {
      links[0].matrix.identity();
      frames.links.forEach((frame, index) => links[index + 1].matrix.fromArray(frame));
      links[7].matrix.fromArray(frames.links[5]);
    }
    if (held) held.mesh.matrix.fromArray(multiply(frames.tcp, ATTACH));
    robot.updateMatrixWorld(true);
  };

  const white = keepMaterial(new THREE.MeshPhysicalMaterial({ color: COLORS.ivory, roughness: 0.43, metalness: 0.06, clearcoat: 0.28, clearcoatRoughness: 0.38, envMapIntensity: 0.32 }));
  const charcoal = keepMaterial(new THREE.MeshPhysicalMaterial({ color: COLORS.joint, roughness: 0.48, metalness: 0.24, clearcoat: 0.15, envMapIntensity: 0.2 }));
  const paperGeometry = keepGeometry(new RoundedBoxGeometry(PLAQUE.width, PLAQUE.height, PLAQUE.thickness, 4, 0.004));
  const labelGeometry = keepGeometry(new THREE.PlaneGeometry(PLAQUE.width * 0.94, PLAQUE.height * 0.94));

  function drawLabel(title, index) {
    const label = document.createElement('canvas');
    label.width = 1024; label.height = 736;
    const ctx = label.getContext('2d');
    if (!ctx) throw new Error('The studio could not create its page labels.');
    ctx.clearRect(0, 0, label.width, label.height);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '500 100px "DM Mono", monospace';
    ctx.fillText(String(index + 1).padStart(2, '0'), 64, 154);
    ctx.strokeStyle = '#b7b0b7'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(64, 210); ctx.lineTo(960, 210); ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 180px Figtree, Arial, sans-serif';
    ctx.fillText(title, 60, 500, 910);
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
    const material = keepMaterial(new THREE.MeshPhysicalMaterial({ color: COLORS.paper, roughness: 0.7, metalness: 0.01, clearcoat: 0.08, clearcoatRoughness: 0.6, envMapIntensity: 0.18 }));
    const mesh = new THREE.Mesh(paperGeometry, material);
    mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(rest);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.page = id;
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
      const smooth = toCreasedNormals(original, Math.PI / 5);
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
      plaque.material.color.set(plaque === hovered || plaque === held ? COLORS.lime : COLORS.paper);
      plaque.material.emissive.set(plaque === hovered ? '#aeb77b' : '#000000');
      plaque.material.emissiveIntensity = plaque === hovered ? 0.12 : 0;
    });
    canvas.style.cursor = hovered ? 'pointer' : 'default'; render();
  }
  async function returnHeld({ immediate = false } = {}) {
    if (immediate || reduceMotion.matches) {
      const result = inverse(REST, joints, { iterations: 220 });
      if (!result.ok) throw new Error('The studio could not return to its resting pose.');
      if (held) held.mesh.matrix.fromArray(held.rest);
      held = null;
      joints = result.q; applyJoints(joints); setCamera(0); hover(null);
      notify('Ready when you are');
      return;
    }
    if (!held) { await dolly(0, 180); return; }
    const plaque = held;
    notify(`Putting ${plaque.title} back`);
    // Restore the wide camera completely before the robot begins to lower.
    await dolly(0, 220);
    await move(above(plaque.contact, 0.135), 330);
    await move(plaque.contact, 210);
    held = null; plaque.mesh.matrix.fromArray(plaque.rest);
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
    if (immediate || reduceMotion.matches) {
      const result = inverse(DISPLAY, joints, { iterations: 220 });
      if (!result.ok) throw new Error('The studio could not reach this page.');
      held = plaque;
      joints = result.q; applyJoints(joints); setCamera(1); hover(null);
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
    await dolly(1, 260);
    notify(`${plaque.title} is ready`);
  });
  const putBack = (options = {}) => enqueue(() => returnHeld(options));

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
    await buildArm();
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
      pick, putBack, hover, dispose,
      setActive(value) { if (!disposed) { active = Boolean(value); if (active) resize(); } },
    };
  } catch (error) {
    notify('The 3D studio is unavailable. You can still open every page.');
    dispose(); throw error;
  }
}
