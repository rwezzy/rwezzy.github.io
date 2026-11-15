import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { forward, inverse, multiply, pose } from './den/lite6.js';
import { prepareJointPath, sampleJointPath } from './studio-motion.js';
import { createStudioProps } from './studio-props.js?v=gallery3';
import { drawingBufferSize } from './studio-render-budget.js';

// A visual-only Lite 6. These are the manufacturer's meshes and joint frames;
// nothing in this module connects to, or issues commands to, robot hardware.
const PAGES = [
  ['projects', 'Projects', 2], ['research', 'Research', 3],
  ['background', 'Background', 4], ['beyond', 'Beyond', 5],
];
const COLORS = { studio: '#f7f7f2', paper: '#0f1517', ivory: '#deded4', ink: '#edf2ef', lime: '#21302d', joint: '#36353b' };
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
  onTelemetry = () => {}, onPartSelect = () => {}, onInspectionChange = () => {},
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
  // resize() controls physical pixels independently of the CSS viewport.
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.015, 12);
  const cameraTarget = new THREE.Vector3(-0.14, 0.19, 0.03);
  const homeTarget = cameraTarget.clone();
  const homePosition = new THREE.Vector3();
  const homeDirection = new THREE.Vector3(0.57, 0.84, 1.04).normalize();
  let cameraProgress = 0, focusAlignment = 0;
  let active = true, readerMode = false, disposed = false, contextLost = false, held = null, hovered = null, pointerDown = null;
  let selection = null, studioProps = null, phase = 'idle';
  let partOutline = null;
  const inspectionVisibility = new Map();
  let joints = INITIAL_JOINTS.slice(), restJoints = null, operationQueue = Promise.resolve(), animationFrame = 0, cancelMotion = null;
  let width = 1, height = 1;
  let bufferWidth = 0, bufferHeight = 0;
  const textures = new Set(), geometries = new Set(), materials = new Set();
  const keepGeometry = geometry => { geometries.add(geometry); return geometry; };
  const keepMaterial = material => { materials.add(material); return material; };
  const keepTexture = texture => { textures.add(texture); return texture; };
  let environmentTarget;
  // Opt-in local QA: expose frame timing on the canvas, never user data.
  const profiling = new URLSearchParams(location.search).has('studio-profile');
  let frameSamples = [], bufferResizes = 0;
  const reportFrames = () => {
    if (!profiling || !frameSamples.length) return;
    const sorted = [...frameSamples].sort((a, b) => a - b);
    canvas.dataset.frameProfile = JSON.stringify({ frames: sorted.length,
      medianMs: +sorted[Math.floor(sorted.length * .5)].toFixed(1), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1),
      maxMs: +sorted.at(-1).toFixed(1), over50Ms: sorted.filter(ms => ms > 50).length,
      bufferResizes, buffer: [canvas.width, canvas.height], drawCalls: renderer.info.render.calls });
  };

  const render = () => {
    if (!disposed && active && !contextLost && width > 0 && height > 0) {
      partOutline?.update();
      renderer.render(scene, camera);
      // The page tint needs only camera progress. Do not force a DOM layout
      // read and project the plaque/cup into CSS coordinates on every frame.
      onPresentationChange(selection ? { pageId: selection.id, kind: selection.kind, progress: cameraProgress } : null);
      onInspectionChange(getInspectionAnchors());
      onTelemetry({ jointsDeg: joints.map(angle => THREE.MathUtils.radToDeg(angle)), phase });
    }
  };
  const notify = message => { if (!disposed) onStatus(message); };
  const focusGeometry = () => {
    if (selection && selection.kind !== 'plaque') return selection;
    const face = new THREE.Matrix4().fromArray(multiply(DISPLAY, ATTACH)).premultiply(robot.matrix);
    const center = new THREE.Vector3(0, 0, -PLAQUE.thickness / 2).applyMatrix4(face);
    const normal = new THREE.Vector3(0, 0, -1).transformDirection(face);
    const up = new THREE.Vector3(0, -1, 0).transformDirection(face);
    return { center, normal, up, width: PLAQUE.width, height: PLAQUE.height };
  };
  const setCamera = progress => {
    cameraProgress = progress;
    const focus = focusGeometry();
    const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Cover the viewport with the physical face. Its center and the real cup
    // remain at screen center; no DOM measurements alter the camera mid-flight.
    const inspecting = selection?.kind === 'assembly';
    const panelFraction = width > 760 ? Math.min(.38, 370 / width) : 0;
    // On phones, keep every part between the two-row header and bottom sheet.
    const mobileTop = Math.min(.34, 140 / height), mobileBottom = .52;
    const mobileFit = Math.max(.16, mobileBottom - mobileTop) * .9;
    const distance = inspecting
      ? Math.max(focus.width / (fovScale * camera.aspect * (1 - panelFraction) * .82), focus.height / (fovScale * (width > 760 ? .78 : mobileFit)))
      : Math.min(focus.width / (1.04 * fovScale * camera.aspect), focus.height / (1.04 * fovScale));
    const wideTarget = homeTarget.clone().lerp(focus.center, focusAlignment);
    const widePosition = wideTarget.clone().add(homePosition.clone().sub(homeTarget));
    const closeTarget = focus.center.clone();
    if (inspecting) {
      const right = new THREE.Vector3().crossVectors(focus.up, focus.normal).normalize();
      if (width > 760) closeTarget.addScaledVector(right, distance * fovScale * camera.aspect * panelFraction / 2);
      else closeTarget.addScaledVector(focus.up, -distance * fovScale * (.5 - (mobileTop + mobileBottom) / 2));
    }
    const closer = closeTarget.clone().addScaledVector(focus.normal, Math.max(0.03, distance));
    camera.position.lerpVectors(widePosition, closer, progress);
    cameraTarget.lerpVectors(wideTarget, closeTarget, progress);
    camera.up.set(0, 1, 0).lerp(focus.up, progress).normalize();
    camera.lookAt(cameraTarget);
    // Ink belongs to the plaque. It is never rotated, replaced, or faded to
    // conveniently face the viewer as the camera travels around the glass.
  };
  const resize = () => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // The shoes sit farther left than the photo wall. Leave a little breathing
    // room on small screens, blending the margin without a breakpoint jump.
    const edgeMargin = THREE.MathUtils.lerp(1.08, 1, THREE.MathUtils.smoothstep(width, 600, 900));
    const distance = 1.62 * edgeMargin * Math.max(1, 1.64 / camera.aspect);
    homePosition.copy(homeTarget).addScaledVector(homeDirection, distance);
    setCamera(cameraProgress);
    // CSS transforms animate the apparent viewport, not its backing buffer.
    // A FLIP expansion therefore allocates once instead of once per frame.
    const buffer = drawingBufferSize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio || 1);
    if (buffer.width !== bufferWidth || buffer.height !== bufferHeight) {
      renderer.setSize(buffer.width, buffer.height, false);
      bufferWidth = buffer.width; bufferHeight = buffer.height;
      bufferResizes++;
    }
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
    renderer.shadowMap.needsUpdate = true;
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
  sealInner.position.z = 0.00005; suctionSeal.add(sealInner);

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
    label.width = 2048; label.height = 1472;
    const ctx = label.getContext('2d');
    if (!ctx) throw new Error('The studio could not create its page labels.');
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, 1024, 736);
    // Native sans-serif glyphs stay consistent from the first frame. The
    // oversampled texture and anisotropic filtering keep oblique labels crisp.
    ctx.fillStyle = '#aabbb3';
    ctx.font = '500 86px Arial, Helvetica, sans-serif';
    ctx.fillText(String(index + 1).padStart(2, '0'), 66, 148);
    ctx.strokeStyle = 'rgba(196,213,204,.32)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(66, 202); ctx.lineTo(958, 202); ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    // Preserve letter proportions: shrink the font instead of canvas maxWidth,
    // which horizontally compresses long names such as Background.
    let fontSize = 176;
    ctx.font = `500 ${fontSize}px Arial, Helvetica, sans-serif`;
    while (ctx.measureText(title).width > 890 && fontSize > 100) {
      fontSize -= 2; ctx.font = `500 ${fontSize}px Arial, Helvetica, sans-serif`;
    }
    ctx.fillText(title, 64, 486);
    const texture = keepTexture(new THREE.CanvasTexture(label));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    return texture;
  }

  PAGES.forEach(([id, title, pageNumber], index) => {
    const angle = THREE.MathUtils.degToRad(-45 + index * 30);
    const c = Math.cos(angle), s = Math.sin(angle);
    // Parallel page edges face the camera, rather than twisting labels around
    // the fan. The grasp pose is derived from this same physical plaque frame.
    const facing = Math.atan2(homeDirection.x, homeDirection.z), fs = Math.sin(facing), fc = Math.cos(facing);
    const rest = new Float64Array([-fs, fc, 0, 0, -fc, -fs, 0, 0, 0, 0, 1, 0, PLAQUE.radius * c, PLAQUE.radius * s, 0.006 + PLAQUE.thickness / 2, 1]);
    const material = keepMaterial(new THREE.MeshPhysicalMaterial({
      color: COLORS.paper, roughness: 0.44, metalness: 0, transmission: 0.12,
      transparent: true, opacity: 0.94, thickness: PLAQUE.thickness, ior: 1.46,
      attenuationColor: '#243532', attenuationDistance: 0.06,
      clearcoat: 0.32, clearcoatRoughness: 0.38, envMapIntensity: 0.24,
    }));
    const mesh = new THREE.Mesh(paperGeometry, material);
    mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(rest);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.page = id;
    const labelMaterial = keepMaterial(new THREE.MeshBasicMaterial({ map: drawLabel(title, pageNumber - 1), transparent: true, depthWrite: false, toneMapped: false }));
    const front = new THREE.Mesh(labelGeometry, labelMaterial);
    front.position.z = PLAQUE.thickness / 2 + 0.00015;
    const reverseLabelMaterial = keepMaterial(labelMaterial.clone());
    reverseLabelMaterial.side = THREE.BackSide; reverseLabelMaterial.opacity = .26;
    const back = new THREE.Mesh(labelGeometry, reverseLabelMaterial);
    // Same UVs and local orientation: seen through the underside, the print
    // is naturally reversed. This faint pass represents ink through smoked glass.
    back.position.z = -PLAQUE.thickness / 2 - 0.00015;
    mesh.add(front, back); robot.add(mesh);
    plaques.push({ id, title, pageNumber, kind: 'plaque', mesh, material, labelMaterial, reverseLabelMaterial, rest, contact: multiply(rest, ATTACH) });
  });

  function buildStage() {
    // Only shadows are drawn on the floor. The transparent canvas lets the
    // surrounding CSS paper color continue through the stage without a seam.
    const ground = new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(200, 200)), keepMaterial(new THREE.ShadowMaterial({ color: '#554d5d', opacity: 0.2 })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const mount = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(0.079, 0.082, 0.008, 64)), keepMaterial(new THREE.MeshStandardMaterial({ color: '#d6d2c7', roughness: 0.7, envMapIntensity: 0.18 })));
    mount.name = 'Robot mounting base';
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
    environmentTarget = pmrem.fromScene(environment, 0.04);
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
      let previousFrame = began;
      cancelMotion = () => { cancelAnimationFrame(animationFrame); cancelMotion = null; reject(abortError()); };
      const frame = now => {
        if (disposed) { cancelMotion?.(); return; }
        if (profiling) frameSamples.push(now - previousFrame);
        previousFrame = now;
        const progress = Math.min(1, (now - began) / duration);
        update(ease(progress)); render();
        if (progress < 1) animationFrame = requestAnimationFrame(frame);
        else { animationFrame = 0; cancelMotion = null; resolve(); }
      };
      animationFrame = requestAnimationFrame(frame);
    });
  }
  function playPath(path, duration, reverse = false, updateCamera = false) {
    return tween(duration, progress => {
      joints = sampleJointPath(path, progress, reverse);
      applyJoints(joints);
      if (updateCamera) { focusAlignment = 1 - progress; setCamera(0); }
    });
  }
  const dolly = (progress, duration) => {
    const from = cameraProgress;
    return tween(duration, amount => setCamera(from + (progress - from) * amount));
  };
  function hover(pageId) {
    if (disposed) return;
    const id = pageId === 'path' ? 'background' : pageId;
    const nextHovered = selection ? null : plaques.find(plaque => plaque.id === id) || studioProps?.targets[id] || null;
    if (nextHovered === hovered) return;
    hovered = nextHovered;
    plaques.forEach(plaque => {
      plaque.material.color.set(plaque === hovered ? COLORS.lime : COLORS.paper);
      plaque.material.emissive.set(plaque === hovered ? '#43574d' : '#000000');
      plaque.material.emissiveIntensity = plaque === hovered ? 0.045 : 0;
      plaque.material.opacity = 0.94;
    });
    canvas.style.cursor = hovered ? 'pointer' : 'default'; render();
  }
  function highlightPart(id) {
    if (partOutline) {
      scene.remove(partOutline); partOutline.geometry.dispose(); partOutline.material.dispose(); partOutline = null;
    }
    const part = selection?.kind === 'assembly' ? selection.parts.find(item => item.id === id) : null;
    if (part?.object) {
      partOutline = new THREE.BoxHelper(part.object, '#a998e3');
      partOutline.material.transparent = true; partOutline.material.opacity = .55;
      partOutline.material.depthTest = false; partOutline.renderOrder = 4;
      scene.add(partOutline);
    }
    render();
  }
  function isolateAssembly(target) {
    renderer.shadowMap.needsUpdate = true;
    // The interactive inspection uses the same models, isolated from the desk
    // so the arm cannot obscure a floating board when its camera angle changes.
    for (const object of [robot, ...(studioProps?.group.children || []), ...scene.children.filter(item => item.name === 'Robot mounting base')]) {
      if (object === target.object) continue;
      inspectionVisibility.set(object, object.visible); object.visible = false;
    }
  }
  function restoreDesk() {
    for (const [object, visible] of inspectionVisibility) object.visible = visible;
    inspectionVisibility.clear();
    renderer.shadowMap.needsUpdate = true;
  }
  const updateNotebook = value => { studioProps.setNotebookOpen(value); renderer.shadowMap.needsUpdate = true; };
  const updateAssembly = (id, value) => { studioProps.setExploded(id, value); renderer.shadowMap.needsUpdate = true; };
  async function returnHeld({ immediate = false } = {}) {
    readerMode = false;
    const target = selection;
    if (!target) return;
    const instant = immediate || reduceMotion.matches;
    highlightPart(null);
    if (target.kind === 'assembly') {
      const from = target.explodedProgress || 0;
      phase = 'assembling';
      if (instant) updateAssembly(target.id, 0);
      else await tween(420, t => updateAssembly(target.id, from * (1 - t)));
      restoreDesk();
    }
    notify(target.kind === 'plaque' ? `Putting ${target.title} back` : 'Returning to the studio');
    // Keep the page centered throughout the entire zoom-out. The arm stays
    // completely still until the camera reaches a genuinely wide view.
    phase = 'zooming-out'; focusAlignment = 1;
    if (instant) setCamera(0); else await dolly(0, 600);
    if (target.kind === 'plaque') {
      phase = 'returning';
      if (instant) { joints = target.motion.raise.start.slice(); applyJoints(joints); }
      else await playPath(target.motion.raise, 660, true, true);
      phase = 'releasing';
      held = null; target.labelMaterial.opacity = 1; target.mesh.matrix.fromArray(target.rest);
      robot.updateMatrixWorld(true);
      phase = 'retracting';
      if (instant) { joints = restJoints.slice(); applyJoints(joints); }
      else await playPath(target.motion.approach, 450, true);
    } else if (target.kind === 'notebook') {
      phase = 'closing';
      if (instant) updateNotebook(0);
      else await tween(480, progress => {
        updateNotebook(1 - progress); focusAlignment = 1 - progress; setCamera(0);
      });
    } else if (!instant) {
      await tween(260, progress => { focusAlignment = 1 - progress; setCamera(0); });
    }
    highlightPart(null);
    selection = null; focusAlignment = 0; phase = 'idle'; setCamera(0); hover(null);
    // The shell can keep the full canvas when another page is queued. Its
    // inset layout is restored only after all physical return motion ends.
    await onRetract({ pageId: target.id, kind: target.kind, immediate: instant });
    if (disposed) throw abortError();
    resize();
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
    if (profiling) { frameSamples = []; bufferResizes = 0; }
    const id = pageId === 'path' ? 'background' : pageId;
    const target = plaques.find(item => item.id === id) || studioProps?.targets[id];
    if (!target) throw new RangeError(`Unknown studio page: ${pageId}`);
    if (selection === target) return;
    if (selection) await returnHeld({ immediate });
    const instant = immediate || reduceMotion.matches;
    readerMode = false; focusAlignment = 0;
    // Expand the same canvas before any physical movement. No layout change
    // occurs between pickup, presentation, camera travel, and the next return.
    await onPresent({ pageId: id, kind: target.kind, immediate: instant });
    if (disposed) throw abortError();
    resize();
    selection = target;
    if (target.kind === 'plaque') {
      notify(`Picking up ${target.title}`);
      if (instant) { held = target; joints = target.motion.raise.end.slice(); applyJoints(joints); }
      else {
        phase = 'approaching'; await playPath(target.motion.approach, 740);
        phase = 'sealing'; held = target; hover(null); applyJoints(joints);
        await tween(80, () => {});
        phase = 'lifting'; await playPath(target.motion.raise, 760);
      }
    } else if (target.kind === 'notebook') {
      notify('Opening the contact notebook'); phase = 'opening';
      if (instant) updateNotebook(1);
      else await tween(620, progress => updateNotebook(progress));
    } else notify('Looking closer at About');
    phase = 'zooming-in';
    if (instant) setCamera(1); else await dolly(1, target.kind === 'plaque' ? 700 : 800);
    phase = 'reading'; hover(null); render();
    notify(`${target.title || (id === 'about' ? 'About' : 'Contact')} is ready`);
    reportFrames();
  });
  const putBack = (options = {}) => enqueue(() => returnHeld(options));

  const inspect = (id, { immediate = false } = {}) => enqueue(async () => {
    const target = studioProps?.targets[id];
    if (target?.kind !== 'assembly') throw new RangeError(`Unknown desk assembly: ${id}`);
    if (selection === target) return describeAssembly(target);
    if (selection) await returnHeld({ immediate });
    const instant = immediate || reduceMotion.matches;
    readerMode = false; focusAlignment = 0;
    await onPresent({ pageId: id, kind: 'assembly', immediate: instant });
    if (disposed) throw abortError();
    selection = target; isolateAssembly(target); resize();
    phase = 'inspecting'; notify(`Exploring ${target.title}`);
    if (instant) { updateAssembly(id, 1); setCamera(1); }
    else {
      await dolly(1, 650);
      await tween(560, t => updateAssembly(id, t));
    }
    phase = 'inspecting'; render();
    return describeAssembly(target);
  });
  const describeAssembly = target => ({
    id: target.id, title: target.title, description: target.description,
    parts: target.parts.map(({ id, title, description }) => ({ id, title, description })),
    exploded: (target.explodedProgress || 0) > .5,
  });
  const setExploded = value => enqueue(async () => {
    if (selection?.kind !== 'assembly') return;
    const target = selection, from = target.explodedProgress || 0, to = value ? 1 : 0;
    phase = value ? 'exploding' : 'assembling';
    await tween(480, t => updateAssembly(target.id, from + (to - from) * t));
    phase = 'inspecting'; render();
  });

  // Project the real mesh positions into viewport CSS pixels so labels follow
  // the parts during reassembly, zooming and responsive layout changes.
  function getInspectionAnchors() {
    if (selection?.kind !== 'assembly' || disposed || !width || !height) return null;
    const viewport = canvas.getBoundingClientRect();
    camera.updateMatrixWorld(); selection.object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3(), center = new THREE.Vector3(), corner = new THREE.Vector3();
    return {
      viewport: { left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height },
      parts: selection.parts.map(part => {
        bounds.setFromObject(part.object);
        if (bounds.isEmpty()) return { id: part.id, x: 0, y: 0, visible: false };
        bounds.getCenter(center).project(camera);
        const rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z).project(camera);
          const px = viewport.left + (corner.x + 1) * viewport.width / 2;
          const py = viewport.top + (1 - corner.y) * viewport.height / 2;
          rect.left = Math.min(rect.left, px); rect.right = Math.max(rect.right, px);
          rect.top = Math.min(rect.top, py); rect.bottom = Math.max(rect.bottom, py);
        }
        return { id: part.id,
          x: viewport.left + (center.x + 1) * viewport.width / 2,
          y: viewport.top + (1 - center.y) * viewport.height / 2,
          rect,
          visible: part.object.visible && Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1 && center.z > -1 && center.z < 1,
        };
      }),
    };
  }

  function getPresentationRect() {
    if (disposed || !selection || !width || !height) return null;
    const bounds = canvas.getBoundingClientRect();
    camera.updateMatrixWorld(); robot.updateMatrixWorld(true);
    const project = world => {
      const point = world.clone().project(camera);
      return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2, depth: point.z };
    };
    let corners, center, suction = null;
    if (selection.kind === 'plaque') {
      const w = PLAQUE.width / 2, h = PLAQUE.height / 2, z = -PLAQUE.thickness / 2;
      corners = [[-w, -h, z], [w, -h, z], [w, h, z], [-w, h, z]]
        .map(point => project(new THREE.Vector3(...point).applyMatrix4(selection.mesh.matrixWorld)));
      center = project(new THREE.Vector3(0, 0, z).applyMatrix4(selection.mesh.matrixWorld));
      if (held) {
        const toolFrame = new THREE.Matrix4().fromArray(forward(joints).tcp).premultiply(robot.matrix);
        const cupCenter = project(new THREE.Vector3(0, 0, 0).applyMatrix4(toolFrame));
        const cupEdge = project(new THREE.Vector3(0.00845, 0, 0).applyMatrix4(toolFrame));
        suction = { x: cupCenter.x, y: cupCenter.y, radius: Math.hypot(cupEdge.x - cupCenter.x, cupEdge.y - cupCenter.y) };
      }
    } else {
      const focus = focusGeometry(), right = new THREE.Vector3().crossVectors(focus.up, focus.normal).normalize();
      corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => project(focus.center.clone()
        .addScaledVector(right, x * focus.width / 2).addScaledVector(focus.up, y * focus.height / 2)));
      center = project(focus.center);
    }
    const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y));
    const right = Math.max(...corners.map(point => point.x)), bottom = Math.max(...corners.map(point => point.y));
    return {
      pageId: selection.id, kind: selection.kind, corners, left, top, right, bottom, width: right - left, height: bottom - top, center, suction,
      progress: cameraProgress,
      visible: corners.some(point => point.depth > -1 && point.depth < 1) && right > bounds.left && left < bounds.right && bottom > bounds.top && top < bounds.bottom,
    };
  }

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const hitPlaque = event => {
    if ((selection && selection.kind !== 'assembly') || disposed || !active || contextLost) return null;
    if (selection?.kind === 'assembly' && phase !== 'inspecting') return null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = selection?.kind === 'assembly' ? selection.parts.map(part => part.object)
      : [...plaques.map(plaque => plaque.mesh), ...(studioProps?.hitTargets || [])];
    const hit = raycaster.intersectObjects(candidates, true)[0];
    if (!hit) return null;
    let object = hit.object, id;
    if (selection?.kind === 'assembly') {
      while (object && !id) { id = object.userData.partId; object = object.parent; }
      return id ? { id, kind: 'part' } : null;
    }
    while (object && !id) { id = object.userData.pageId || object.userData.page; object = object.parent; }
    return plaques.find(plaque => plaque.id === id) || studioProps?.targets[id] || null;
  };
  const onPointerMove = event => {
    const hit = hitPlaque(event);
    if (selection?.kind === 'assembly') canvas.style.cursor = hit ? 'pointer' : 'default';
    else hover(hit?.id);
  };
  const onPointerLeave = () => { pointerDown = null; hover(null); };
  const onPointerDown = event => { pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerUp = event => {
    const down = pointerDown; pointerDown = null;
    if (!down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const plaque = hitPlaque(event);
    if (plaque?.kind === 'part') { highlightPart(plaque.id); onPartSelect(plaque.id); }
    else if (plaque) onSelect(plaque.kind === 'assembly' ? `inspect:${plaque.id}` : plaque.id === 'hobbies' ? 'offclock' : plaque.id);
  };
  const onContextLost = event => {
    event.preventDefault(); contextLost = true;
    notify('The 3D studio paused. You can still open every page.');
  };
  const onContextRestored = () => { contextLost = false; renderer.shadowMap.needsUpdate = true; resize(); notify(selection ? `${selection.title || selection.id} is ready` : 'Ready when you are'); };
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
    if (partOutline) { partOutline.geometry.dispose(); partOutline.material.dispose(); }
    studioProps?.dispose();
    environmentTarget?.dispose(); renderer.dispose(); scene.clear();
  }

  try {
    notify('Preparing the studio');
    buildStage();
    studioProps = createStudioProps({ scene, onSelect, portraitUrl: new URL('../assets/personal/keith-desk-portrait.webp', import.meta.url).href });
    resize();
    const rest = inverse(REST, INITIAL_JOINTS, { iterations: 220 });
    if (!rest.ok) throw new Error('The Lite 6 could not reach its resting pose.');
    restJoints = rest.q.slice(); joints = rest.q;
    // Cache both paths once; reverse playback is exactly the same path, and
    // runtime frames only sample six joint angles instead of solving IK.
    const armReady = buildArm();
    plaques.forEach(plaque => {
      const approach = prepareJointPath([above(plaque.contact, 0.1), plaque.contact], restJoints);
      const raise = prepareJointPath([above(plaque.contact, 0.08), above(plaque.contact, 0.15), DISPLAY], approach.end);
      plaque.motion = { approach, raise };
    });
    const assets = await Promise.allSettled([armReady, studioProps.ready]);
    if (assets[0].status === 'rejected') throw assets[0].reason;
    if (assets[1].status === 'rejected') console.warn('A studio prop texture could not load:', assets[1].reason);
    applyJoints(joints); resize();
    notify('Ready when you are');
    onReady();
    // Refresh once custom fonts arrive, including when their loading was deferred.
    document.fonts?.ready.then(() => {
      if (disposed) return;
      plaques.forEach(plaque => {
        const old = plaque.labelMaterial.map;
        plaque.labelMaterial.map = drawLabel(plaque.title, plaque.pageNumber - 1);
        plaque.reverseLabelMaterial.map = plaque.labelMaterial.map;
        old.dispose(); textures.delete(old);
      });
      render();
    });
    return {
      pick, putBack, inspect, setExploded, highlightPart, hover, dispose, getPresentationRect, resizeViewport: resize,
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
