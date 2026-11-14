import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Actual 18-part v3 carrier CAD, with explicitly schematic device placeholders.
 * GLB: metres, X right / Y up / +Z forward; actual source assembly coordinates.
 * No manufacturer meshes, textures, logos or tripod geometry are included.
 * Returns { dispose, reset, setExplode }; all rendering is demand driven.
 */
export async function initHardware(root) {
  if (!root) return null;
  const canvas = root.querySelector('canvas[data-hardware-canvas]');
  const slider = root.querySelector('[data-explode]');
  const resetButton = root.querySelector('[data-hardware-reset]');
  const status = root.querySelector('[data-hardware-status]');
  if (!canvas) return null;
  if (root._soundscopeHardware) return root._soundscopeHardware;

  const description = '18 original CAD parts. Sensors are dimensional placeholders. Tripod not modeled.';
  const say = (text) => { if (status) status.textContent = text; };
  const resources = new Set();
  const listeners = new AbortController();
  let disposed = false;
  let visible = true;
  let frame = 0;
  let renderer;
  let controls;
  let resizeObserver;
  let visibilityObserver;
  const parts = [];
  const assembly = new THREE.Group();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e4eee4');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.001, 10);
  const target = new THREE.Vector3(0, 0.091, 0);
  const defaultDirection = new THREE.Vector3(0.47, 0.23, 1).normalize();
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3();
  let currentExplode = 0;
  root.dataset.hardwareReady = 'loading';
  say('Loading the original carrier CAD…');

  function scheduleRender() {
    if (disposed || frame || !visible || document.hidden || !renderer) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed && visible && !document.hidden) renderer.render(scene, camera);
    });
  }

  function material(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.43, metalness: 0.08, ...options });
    resources.add(value);
    return value;
  }

  function mesh(geometry, appearance, parent = assembly) {
    resources.add(geometry);
    const result = new THREE.Mesh(geometry, appearance);
    parent.add(result);
    return result;
  }

  function fitView(resetDirection = false) {
    if (!parts.length || !controls) return;
    assembly.updateMatrixWorld(true);
    bounds.setFromObject(assembly);
    bounds.getCenter(target);
    bounds.getSize(size);
    // Fit the bounding sphere in both axes, including a narrow mobile canvas.
    const radius = size.length() * 0.5;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.14;
    const direction = resetDirection ? defaultDirection.clone() : camera.position.clone().sub(controls.target).normalize();
    if (direction.lengthSq() < 0.5) direction.copy(defaultDirection);
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.minDistance = radius * 1.15;
    controls.maxDistance = Math.max(distance * 3.5, 1.5);
    camera.near = 0.001;
    camera.far = Math.max(10, distance * 8);
    camera.updateProjectionMatrix();
    controls.update();
    scheduleRender();
  }

  function resize() {
    if (!renderer || disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
    const nextAspect = rect.width / rect.height;
    const changed = Math.abs(camera.aspect - nextAspect) > 0.01;
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
    if (changed && parts.length) fitView(false);
    scheduleRender();
  }

  function explodeDirection(name, base) {
    const out = new THREE.Vector3();
    if (name === 'shared_frame') return out;
    if (name.startsWith('mic_')) {
      const radial = new THREE.Vector3(base.x, base.y - 0.128, 0).normalize();
      out.copy(radial).multiplyScalar(name.includes('shoe') ? 0.040 : 0.055);
      out.z = name.includes('toe_screw') ? 0.085 : name.includes('toe') ? 0.053 : name.includes('lock_screw') ? 0.030 : 0.012;
      if (name.includes('lock_screw')) out.addScaledVector(radial, 0.018);
    } else if (name.includes('pressure_bar')) {
      out.set(0, 0.007, 0.065);
    } else if (name.includes('screw')) {
      out.set(Math.sign(base.x) * 0.016, 0.045, 0.008);
    } else if (name.includes('nut')) {
      out.set(Math.sign(base.x) * 0.030, 0.012, 0.032);
    }
    return out;
  }

  function setExplode(value, refit = true) {
    currentExplode = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    for (const part of parts) part.node.position.copy(part.base).addScaledVector(part.explode, currentExplode);
    if (slider) {
      slider.value = String(currentExplode);
      slider.setAttribute('aria-valuetext', `${Math.round(currentExplode * 100)} percent exploded`);
    }
    if (refit) fitView(false);
    say(description);
    scheduleRender();
  }

  function reset() {
    setExplode(0, false);
    fitView(true);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    listeners.abort();
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    controls?.dispose();
    for (const resource of resources) resource.dispose();
    renderer?.dispose();
    delete root._soundscopeHardware;
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.addEventListener('change', scheduleRender);
    camera.position.copy(defaultDirection).multiplyScalar(0.6).add(target);
    controls.target.copy(target);
    controls.update();

    scene.add(new THREE.HemisphereLight('#f8fff5', '#365440', 2.7));
    const key = new THREE.DirectionalLight('#fff8e8', 3.1);
    key.position.set(-0.35, 0.65, 0.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#c5e6e9', 2.2);
    rim.position.set(0.5, 0.22, -0.45);
    scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffffff', 0.8);
    fill.position.set(0.3, -0.2, 0.45);
    scene.add(fill, assembly);

    canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive SoundScope carrier. Drag to rotate; scroll or plus and minus to zoom. Arrow keys rotate, Home resets. Sensors are dimensional placeholders; tripod not modeled.');
    canvas.style.touchAction = 'none';
    if (slider) slider.setAttribute('aria-label', 'Explode the original carrier assembly');
    slider?.addEventListener('input', () => setExplode(slider.value), { signal: listeners.signal });
    resetButton?.addEventListener('click', reset, { signal: listeners.signal });
    canvas.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      let handled = true;
      switch (event.key) {
        case 'ArrowLeft': spherical.theta -= 0.12; break;
        case 'ArrowRight': spherical.theta += 0.12; break;
        case 'ArrowUp': spherical.phi -= 0.12; break;
        case 'ArrowDown': spherical.phi += 0.12; break;
        case '+': case '=': spherical.radius *= 0.88; break;
        case '-': case '_': spherical.radius /= 0.88; break;
        case 'Home': reset(); event.preventDefault(); return;
        default: handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      scheduleRender();
    }, { signal: listeners.signal });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      say('The 3D view paused because its graphics context was lost. Reload the page to restore it.');
    }, { signal: listeners.signal });
    document.addEventListener('visibilitychange', scheduleRender, { signal: listeners.signal });
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) { resize(); scheduleRender(); }
      }, { rootMargin: '100px' });
      visibilityObserver.observe(root);
    }
    resize();

    const gltf = await new GLTFLoader().loadAsync(new URL('models/soundscope/carrier-v3.glb', document.baseURI).href);
    if (disposed) {
      gltf.scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((item) => item?.dispose());
      });
      return null;
    }
    // The compact GLB stores positions and triangle indices, without vertex normals.
    // Preserve GLTFLoader's flat-shading behavior when replacing its materials:
    // face normals are derived in the fragment shader, so CAD edges stay crisp.
    const print = material('#418565', { flatShading: true });
    const shoes = material('#76a98a', { flatShading: true });
    const contacts = material('#ed7195', { roughness: 0.34, flatShading: true });
    const fasteners = material('#3a5b45', { roughness: 0.33, flatShading: true });
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      const previous = Array.isArray(object.material) ? object.material : [object.material];
      previous.forEach((item) => item?.dispose());
      const name = object.name;
      object.material = name.includes('toe') && !name.includes('screw') || name.includes('pressure_bar') ? contacts
        : name.includes('shoe') ? shoes : name.includes('screw') || name.includes('nut') ? fasteners : print;
      const base = object.position.clone();
      parts.push({ node: object, base, explode: explodeDirection(name, base) });
    });
    if (parts.length !== 18) throw new Error(`Expected 18 original CAD parts, received ${parts.length}.`);
    assembly.add(gltf.scene);

    // A 100 x 1.2 mm dimensional PCB disc at the source design's actual nominal pose.
    // Four gold dots are schematic microphone symbols, not exact component CAD positions.
    const pcbMaterial = material('#253b32', { roughness: 0.55 });
    const gold = material('#d9b764', { metalness: 0.58, roughness: 0.28 });
    const pcb = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.0012, 96), pcbMaterial);
    pcb.name = 'Dimensional PCB placeholder — component layout schematic';
    pcb.rotation.x = Math.PI / 2;
    pcb.position.set(0, 0.128, 0.0146);
    const electronics = new THREE.Group();
    electronics.name = 'Schematic microphone markers — not manufacturer component geometry';
    assembly.add(electronics);
    for (const x of [-0.024, 0.024]) {
      for (const y of [-0.024, 0.024]) {
        const dot = mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.00065, 24), gold, electronics);
        dot.rotation.x = Math.PI / 2;
        dot.position.set(x, 0.128 + y, 0.0157);
      }
    }

    // Rounded dimensional envelope: 89.45977 x 25.0247 x 30 mm.
    // The casing/lens marks below are schematic; no manufacturer shape was copied.
    const radius = 0.01251235;
    const halfStraight = 0.044729885 - radius;
    const outline = new THREE.Shape();
    outline.moveTo(-halfStraight, -radius);
    outline.lineTo(halfStraight, -radius);
    outline.absarc(halfStraight, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    outline.lineTo(-halfStraight, radius);
    outline.absarc(-halfStraight, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
    const casing = new THREE.ExtrudeGeometry(outline, { depth: 0.030, bevelEnabled: false, curveSegments: 24 });
    casing.translate(0, 0, -0.015);
    const cameraProxy = mesh(casing, material('#27312f', { roughness: 0.4 }));
    cameraProxy.name = 'Dimensional camera placeholder — not manufacturer housing';
    cameraProxy.position.set(0, -0.00016025, -0.00365);
    const glass = material('#0f1e21', { metalness: 0.3, roughness: 0.2 });
    const bezel = material('#61746c', { metalness: 0.45, roughness: 0.35 });
    for (const x of [-0.025, 0.025]) {
      const ring = mesh(new THREE.TorusGeometry(0.0053, 0.00055, 12, 40), bezel);
      ring.position.set(x, -0.00016025, 0.0115);
      const lens = mesh(new THREE.CircleGeometry(0.0048, 40), glass);
      lens.position.set(x, -0.00016025, 0.01155);
    }
    root.dataset.hardwareReady = 'ready';
    setExplode(slider?.value || 0, false);
    fitView(true);
    say(description);
    const api = { dispose, reset, setExplode };
    root._soundscopeHardware = api;
    return api;
  } catch (error) {
    console.warn('SoundScope hardware view unavailable:', error);
    dispose();
    root.dataset.hardwareReady = 'error';
    say('The interactive 3D view is unavailable on this browser. The carrier contains 18 original printed CAD parts; the sensor shapes are dimensional placeholders, and the tripod is not modeled.');
    if (slider) slider.disabled = true;
    if (resetButton) resetButton.disabled = true;
    return null;
  }
}
