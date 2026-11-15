import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Original visual simulation. This renderer never connects to a ring, TV or audio device.
const CHANNELS = ['AURORA', 'COAST', 'CITY'];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export async function createLivingRoom(canvas, { onError } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9edf5');
  scene.fog = new THREE.Fog('#e9edf5', 10, 24);
  const camera = new THREE.PerspectiveCamera(38, 1, .05, 30);
  const resources = new Set();
  const keep = object => { resources.add(object); return object; };
  const material = (color, options = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: .64, metalness: 0, envMapIntensity: .62, ...options }));
  const basic = (color, options = {}) => keep(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...options }));
  const mesh = (geometry, appearance, position, parent = scene) => {
    const object = new THREE.Mesh(keep(geometry), appearance);
    object.castShadow = true; object.receiveShadow = true;
    if (position) object.position.set(...position);
    parent.add(object); return object;
  };
  const box = (size, appearance, position, radius = .025, parent = scene) => mesh(new RoundedBoxGeometry(...size, 5, Math.min(radius, ...size.map(n => n / 2))), appearance, position, parent);
  const cylinder = (top, bottom, height, appearance, position, parent = scene) => mesh(new THREE.CylinderGeometry(top, bottom, height, 48), appearance, position, parent);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environmentScene, .04);
  scene.environment = environmentTarget.texture;
  environmentScene.dispose(); pmrem.dispose();

  const stone = material('#dce3ed', { roughness: .76 });
  const plaster = material('#edf1f7', { roughness: .92 });
  const white = material('#f5f7fc', { roughness: .36 });
  const graphite = material('#202b3d', { roughness: .36, metalness: .24 });
  const softGrey = material('#aebdd0', { roughness: .97 });
  const fabricHighlight = material('#c4cede', { roughness: .98 });
  const blueFabric = material('#385c94', { roughness: .94 });
  const chrome = material('#9daec6', { roughness: .25, metalness: .78 });
  const seam = material('#8495ad', { roughness: .96 });
  const cyanGlow = material('#9ce6ee', { emissive: '#40bddc', emissiveIntensity: .5, roughness: .4 });
  const violetGlow = material('#d2c7fa', { emissive: '#8470d6', emissiveIntensity: .3, roughness: .4 });

  // An open architectural cutaway: uninterrupted plaster, stone and floating forms.
  box([6.2, .13, 4.5], stone, [0, -.075, -.05], .045);
  box([6.2, 3.5, .13], plaster, [0, 1.69, -2.3], .015);
  box([.10, 3.5, 4.5], plaster, [-3.12, 1.69, -.05], .015);
  const floorSeam = material('#c5cedd', { roughness: .9 });
  for (const x of [-1.55, 0, 1.55]) box([.006, .002, 4.44], floorSeam, [x, -.008, -.05], .001);
  for (const z of [-.8, .7]) box([6.14, .002, .006], floorSeam, [0, -.008, z], .001);
  box([6.08, .035, .04], white, [0, .024, -2.207], .008);
  // Architectural accent lines keep the palette cool without neon clutter.
  box([.022, 2.75, .025], cyanGlow, [-2.72, 1.54, -2.212], .008);
  box([.022, 2.75, .025], violetGlow, [2.72, 1.54, -2.212], .008);

  // Soft daylight from a large, slim-framed side window.
  const windowGroup = new THREE.Group(); scene.add(windowGroup);
  box([.035, 1.83, 1.78], graphite, [-3.055, 1.95, -.6], .012, windowGroup);
  box([.038, 1.73, 1.68], basic('#e2f5ff'), [-3.031, 1.95, -.6], .009, windowGroup);
  box([.043, 1.74, .024], chrome, [-3.006, 1.95, -.6], .004, windowGroup);

  // Wall-mounted OLED-style TV, with a dark glass face and a genuinely thin bezel.
  box([3.45, 1.96, .065], graphite, [.16, 1.85, -2.165], .035);
  box([3.31, 1.84, .035], material('#070d19', { roughness: .14, metalness: .18 }), [.16, 1.85, -2.118], .014);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1536; screenCanvas.height = 864;
  const screenContext = screenCanvas.getContext('2d', { alpha: false });
  if (!screenContext) { environmentTarget.dispose(); renderer.dispose(); throw new Error('The TV screen could not be initialized.'); }
  const screenTexture = keep(new THREE.CanvasTexture(screenCanvas));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  screenTexture.minFilter = THREE.LinearFilter;
  screenTexture.generateMipmaps = false;
  const screen = mesh(new THREE.PlaneGeometry(3.285, 1.848), basic('#ffffff', { map: screenTexture }), [.16, 1.85, -2.094]);
  screen.castShadow = false; screen.receiveShadow = false;
  const powerLED = mesh(new THREE.SphereGeometry(.009, 16, 12), basic('#d4dee9'), [.16, .854, -2.117]);
  powerLED.castShadow = false;
  const screenWash = new THREE.PointLight('#75cdeb', 0, 4.5, 2);
  screenWash.position.set(.16, 1.5, -1.65); scene.add(screenWash);

  // Floating console: concealed wall support and a shadow gap, with no timber.
  box([3.95, .32, .55], white, [.16, .43, -1.97], .045);
  box([3.80, .018, .42], graphite, [.16, .255, -1.96], .008);
  for (const x of [-.48, .83]) box([.006, .21, .009], material('#ccd5e3'), [x, .43, -1.688], .002);
  box([3.6, .014, .025], cyanGlow, [.16, .247, -1.72], .005);
  // A low-profile speaker bar and understated sculptural ceramics.
  box([1.65, .075, .11], graphite, [.16, .624, -1.94], .03);
  cylinder(.075, .065, .13, material('#97a8c7', { roughness: .48 }), [-1.45, .66, -1.95]);
  const sculpture = mesh(new THREE.TorusGeometry(.095, .022, 16, 48), chrome, [1.74, .72, -1.96]);
  sculpture.rotation.y = -.3;

  // A low modular sofa sits to one side, leaving the TV unobstructed.
  const sofa = new THREE.Group(); sofa.position.set(-1.85, 0, .58); sofa.rotation.y = .12; scene.add(sofa);
  box([1.05, .23, 2.35], graphite, [0, .19, 0], .09, sofa);
  box([1.08, .29, 2.42], softGrey, [0, .39, 0], .12, sofa);
  for (const z of [-.57, .57]) box([.87, .17, 1.09], fabricHighlight, [.08, .57, z], .075, sofa);
  box([.24, .70, 2.39], softGrey, [-.50, .68, 0], .10, sofa);
  for (const z of [-1.14, 1.14]) box([.95, .40, .20], softGrey, [.04, .59, z], .085, sofa);
  for (const z of [-.55, .55]) {
    const cushion = box([.19, .49, .94], fabricHighlight, [-.345, .79, z], .07, sofa);
    cushion.rotation.z = -.10;
  }
  const pillow = box([.19, .40, .40], blueFabric, [-.19, .78, .67], .075, sofa); pillow.rotation.set(.13, 0, -.20);
  // Fine piping is rounded geometry, so cushions retain their shape up close.
  for (const z of [-.57, .57]) {
    for (const x of [-.33, .49]) box([.005, .005, .94], seam, [x, .648, z], .002, sofa);
    for (const edge of [-.51, .51]) box([.74, .005, .005], seam, [.08, .648, z + edge], .002, sofa);
  }

  // A soft-edged rug and sculptural low coffee table balance the foreground.
  const rug = box([2.55, .018, 1.72], material('#c5cfdf', { roughness: 1 }), [.60, .008, .68], .12);
  rug.rotation.y = -.06;
  const coffee = new THREE.Group(); coffee.position.set(.56, 0, .58); coffee.rotation.y = -.12; scene.add(coffee);
  box([1.45, .10, .81], graphite, [0, .42, 0], .14, coffee);
  for (const x of [-.43, .43]) box([.15, .34, .56], material('#64758e', { roughness: .4, metalness: .3 }), [x, .22, 0], .065, coffee);
  box([.31, .04, .23], material('#e5eaf4'), [-.30, .49, .02], .012, coffee);
  box([.29, .025, .21], material('#5d72a0'), [-.29, .522, .02], .008, coffee);
  cylinder(.085, .07, .08, white, [.38, .50, -.05], coffee);

  // Modern planter and gently curved foliage. Leaves use smooth ellipsoids.
  const leafMaterial = material('#3c746f', { roughness: .72 });
  const stemMaterial = material('#426d68', { roughness: .83 });
  cylinder(.19, .14, .43, white, [2.38, .22, -1.63]);
  cylinder(.17, .17, .012, material('#30444d'), [2.38, .44, -1.63]);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.399, height = .58 + (i % 3) * .13;
    const end = new THREE.Vector3(2.38 + Math.sin(angle) * .22, .44 + height, -1.63 + Math.cos(angle) * .19);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(2.38, .44, -1.63), new THREE.Vector3(2.38, .62, -1.63), end]);
    mesh(new THREE.TubeGeometry(curve, 16, .008, 8, false), stemMaterial);
    const leaf = mesh(new THREE.SphereGeometry(1, 24, 16), leafMaterial, end.toArray());
    leaf.scale.set(.085, .25, .022); leaf.rotation.set(.3, angle, Math.sin(angle) * .65);
  }

  scene.add(new THREE.HemisphereLight('#f3f8ff', '#78859c', 1.65));
  const sun = new THREE.DirectionalLight('#f5f8ff', 2.8);
  sun.position.set(-3.5, 6, 3.5); sun.target.position.set(0, .6, -.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.00018; sun.shadow.normalBias = .015;
  sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 14 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#c6d9ff', .75); fill.position.set(4, 3, 2); scene.add(fill);
  const glow = new THREE.PointLight('#91baff', .8, 5, 2); glow.position.set(-2.2, 1.5, -1.8); scene.add(glow);

  let state = { power: false, volume: 35, channel: 0 };
  let active = true, disposed = false, frame = 0, lastScreenFrame = -Infinity, elapsed = 0;
  let lastTime = 0, dirty = true, width = 0, height = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motion.matches;
  const roundedRect = (x, y, w, h, radius, fill) => {
    screenContext.beginPath(); screenContext.roundRect(x, y, w, h, radius); screenContext.fillStyle = fill; screenContext.fill();
  };
  function drawScreen(time) {
    const ctx = screenContext, w = screenCanvas.width, h = screenCanvas.height;
    if (!state.power) {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#18273b'); gradient.addColorStop(.48, '#080e18'); gradient.addColorStop(1, '#101a2b');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff04'; ctx.beginPath(); ctx.moveTo(w * .05, 0); ctx.lineTo(w * .32, 0); ctx.lineTo(w * .78, h); ctx.lineTo(w * .62, h); ctx.fill();
      ctx.fillStyle = '#8296b5'; ctx.font = '500 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('STANDBY', w / 2, h * .88);
      screenTexture.needsUpdate = true; return;
    }
    if (state.channel === 0) {
      const sky = ctx.createLinearGradient(0, 0, w, h); sky.addColorStop(0, '#121a45'); sky.addColorStop(.5, '#153e65'); sky.addColorStop(1, '#3b287b');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      for (let band = 0; band < 9; band++) {
        ctx.beginPath();
        for (let x = -80; x <= w + 80; x += 24) {
          const y = h * .30 + Math.sin(x / 340 + time * .28 + band * .30) * h * .16 + band * 24;
          x === -80 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ['#8effd580', '#70dbf279', '#b1a1ff75'][band % 3]; ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.stroke();
      }
      for (let i = 0; i < 48; i++) { const x = (i * 397 + 71) % w, y = (i * 193 + 53) % 440; ctx.fillStyle = '#f0f7ffb0'; ctx.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2); }
      ctx.fillStyle = '#0a172c'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * .70);
      for (let x = 0; x <= w + 80; x += 80) ctx.lineTo(x, h * .74 + Math.sin(x / 210) * 35);
      ctx.lineTo(w, h); ctx.fill();
    } else if (state.channel === 1) {
      const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#99cbe9'); sky.addColorStop(.5, '#e4f1f8'); sky.addColorStop(.51, '#54a6bf'); sky.addColorStop(1, '#143e67');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#eef8ff'; ctx.beginPath(); ctx.arc(w * .74, h * .24, 65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#406d89'; ctx.beginPath(); ctx.moveTo(0, h * .54); ctx.lineTo(0, h * .34); ctx.lineTo(w * .13, h * .22); ctx.lineTo(w * .31, h * .47); ctx.lineTo(w * .44, h * .54); ctx.fill();
      for (let i = 0; i < 16; i++) {
        const y = h * .54 + i * 23; ctx.beginPath();
        for (let x = 0; x <= w; x += 32) { const yy = y + Math.sin(x / (90 + i * 8) + time * .5 + i) * (2 + i * .4); x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
        ctx.strokeStyle = i % 3 === 0 ? '#c7f8f173' : '#a2e2ed38'; ctx.lineWidth = 2 + i * .25; ctx.stroke();
      }
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#131d41'); sky.addColorStop(.65, '#5e5595'); sky.addColorStop(1, '#c0a6db');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d4e7ff'; ctx.beginPath(); ctx.arc(w * .78, h * .20, 44, 0, Math.PI * 2); ctx.fill();
      for (let row = 0; row < 2; row++) for (let i = 0; i < 15; i++) {
        const bw = 70 + (i * 17 % 55), bh = 160 + ((i * 137 + row * 83) % 330), x = i * 116 - 40 + row * 42, y = h - bh + row * 65;
        ctx.fillStyle = row ? '#142239' : '#344065'; ctx.fillRect(x, y, bw, bh);
        for (let floor = 0; floor < bh / 28 - 1; floor++) for (let col = 0; col < 3; col++) {
          if ((i + floor * 3 + col * 5) % 7 < 3) continue;
          ctx.fillStyle = (i + floor + col) % 3 ? '#7cbddb' : '#c4c0f0'; ctx.fillRect(x + 13 + col * 24, y + 17 + floor * 28, 10, 13);
        }
      }
      ctx.fillStyle = '#5dcbe366'; ctx.fillRect((time * 80) % (w + 200) - 200, h - 95, 180, 3);
    }
    // The same state is also reported in accessible DOM by the demo controller.
    roundedRect(52, 45, 335, 110, 22, '#091221bb');
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9cde5'; ctx.font = '500 24px system-ui, sans-serif'; ctx.fillText(`CHANNEL ${String(state.channel + 1).padStart(2, '0')}`, 79, 84);
    ctx.fillStyle = '#f5f9ff'; ctx.font = '600 39px system-ui, sans-serif'; ctx.fillText(CHANNELS[state.channel], 77, 130);
    roundedRect(w * .27, h - 130, w * .46, 82, 25, '#091221c9');
    ctx.fillStyle = '#e8f4ff'; ctx.font = '500 25px system-ui, sans-serif'; ctx.fillText('VOL', w * .295, h - 79);
    roundedRect(w * .365, h - 97, w * .255, 14, 7, '#8b9ca846');
    if (state.volume > 0) roundedRect(w * .365, h - 97, w * .255 * state.volume / 100, 14, 7, '#9dece9');
    ctx.textAlign = 'right'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillStyle = '#f5f9ff'; ctx.fillText(String(state.volume), w * .70, h - 79);
    screenTexture.needsUpdate = true;
  }

  function requestRender() { if (active && !disposed && width && height && !frame) frame = requestAnimationFrame(render); }
  function render(now) {
    frame = 0;
    if (disposed || !active) return;
    const delta = lastTime ? Math.min(.05, (now - lastTime) / 1000) : 0; lastTime = now;
    if (state.power && !reducedMotion) elapsed += delta;
    if (dirty || state.power && !reducedMotion && now - lastScreenFrame >= 1000 / 24) {
      drawScreen(elapsed); dirty = false; lastScreenFrame = now;
      renderer.render(scene, camera);
    }
    if (state.power && !reducedMotion) requestRender();
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width; height = rect.height;
    renderer.setSize(Math.round(width), Math.round(height), false);
    camera.aspect = width / height;
    // On narrow screens, a straighter view preserves a useful TV screen size.
    const narrow = clamp((1.5 - camera.aspect) / .75, 0, 1);
    camera.position.set(2.15 - narrow * 1.25, 2.35 + narrow * .20, 5.65 + narrow * .40);
    camera.fov = camera.aspect < .85 ? 44 : 38;
    camera.lookAt(.05, 1.15, -.65); camera.updateProjectionMatrix();
    dirty = true; requestRender();
  }
  function update(next = {}) {
    if (disposed) return;
    state = {
      power: typeof next.power === 'boolean' ? next.power : state.power,
      volume: Number.isFinite(next.volume) ? clamp(Math.round(next.volume), 0, 100) : state.volume,
      channel: Number.isFinite(next.channel) ? ((Math.round(next.channel) % CHANNELS.length) + CHANNELS.length) % CHANNELS.length : state.channel,
    };
    screenWash.intensity = state.power ? 1.8 : 0;
    screenWash.color.set(['#77cfdf', '#93d9ed', '#a7a0ed'][state.channel]);
    powerLED.material.color.set(state.power ? '#9dece9' : '#d4dee9');
    dirty = true; requestRender();
  }
  function setActive(value) {
    active = Boolean(value);
    if (!active && frame) { cancelAnimationFrame(frame); frame = 0; }
    if (active) { lastTime = 0; dirty = true; requestRender(); }
  }
  const onMotionChange = event => { reducedMotion = event.matches; dirty = true; requestRender(); };
  const onContextLost = event => { event.preventDefault(); setActive(false); onError?.(new Error('The 3D room lost its graphics context.')); };
  motion.addEventListener('change', onMotionChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); update(state);
  return {
    update, setActive, resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect(); motion.removeEventListener('change', onMotionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      sun.shadow.map?.dispose(); environmentTarget.dispose();
      for (const resource of resources) resource.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
