import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BOARD_URL = new URL('../models/omniring/xiao-nrf52840-v15.glb', import.meta.url).href;
const RAD = Math.PI / 180;

/**
 * Adjustable OmniRing illustration, in metres, Y up, USB opening toward +Z.
 * The root is unplaced/unscaled: the desk owns placement and animation.
 * Every part group exists synchronously. Await ready before measuring or
 * registering mesh hits. USB-C and the sensor components stay in `xiao`.
 * Owns its original resources; the host owns any highlight-material clones.
 * See models/omniring/README.md for the supplied CAD and concept provenance.
 */
export function createOmniRing({ boardUrl = BOARD_URL } = {}) {
  const object = new THREE.Group();
  object.name = 'OmniRing — adjustable strap concept with Seeed-supplied board CAD';
  const resources = new Set(), warnings = [];
  let disposed = false;
  const keep = value => { resources.add(value); return value; };
  const appearance = (color, options = {}) => keep(new THREE.MeshStandardMaterial({
    color, roughness: .58, metalness: .02, envMapIntensity: .45, ...options,
  }));
  const teal = appearance('#247e72');
  const darkTeal = appearance('#195e58', { roughness: .46 });
  const edgeTeal = appearance('#54ab94', { roughness: .43 });
  const silver = appearance('#bfc8c8', { metalness: .72, roughness: .32 });
  const graphite = appearance('#1c2929', { roughness: .64 });
  const mesh = (geometry, material, parent) => {
    const child = new THREE.Mesh(keep(geometry), material);
    child.castShadow = true; child.receiveShadow = true; parent.add(child);
    return child;
  };
  const rounded = (w, h, d, radius = .0005) => new RoundedBoxGeometry(w, h, d, 2, radius);
  const makePart = name => { const part = new THREE.Group(); part.name = `OmniRing / ${name}`; object.add(part); return part; };
  const housing = makePart('open-front board cradle');
  const board = makePart('complete XIAO board including USB-C and onboard sensors');
  const band = makePart('perforated adjustable band');
  const closure = makePart('overlapping strap and peg closure');
  board.position.y = .028;

  // An open tray leaves the metal connector and cable entry unobstructed.
  // These enclosure dimensions are illustrative, not a tested fabrication file.
  const floor = mesh(rounded(.022, .0014, .025, .0010), darkTeal, housing);
  floor.position.set(0, .0265, -.0006);
  for (const side of [-1, 1]) {
    const rail = mesh(rounded(.00125, .0032, .0214, .00045), teal, housing);
    rail.position.set(side * .0104, .0286, -.0017);
    const shoulder = mesh(rounded(.0038, .0044, .0088, .0007), darkTeal, housing);
    shoulder.position.set(side * .0051, .0246, 0);
    for (const z of [-.008, .006]) {
      const seat = mesh(rounded(.0015, .0008, .002, .0002), edgeTeal, housing);
      seat.position.set(side * .0077, .0276, z);
    }
  }
  const rear = mesh(rounded(.021, .0032, .00125, .00045), teal, housing);
  rear.position.set(0, .0286, -.012);

  /** Build short flat cells with actual holes, then bend them into an open strap.
   * Short cells bound curvature error without a heavy tessellation dependency.
   * Normals follow the bend analytically, including each hole's inner wall.
   */
  function curvedStrap({ radius, start, end, width, thickness, holes = 0 }) {
    const length = radius * (end - start), count = Math.ceil(length / .0036);
    const pitch = length / count, pieces = [];
    for (let cell = 0; cell < count; cell += 1) {
      const a = cell * pitch, b = (cell + 1) * pitch;
      const shape = new THREE.Shape();
      shape.moveTo(a, -width / 2);
      for (let step = 1; step <= 4; step += 1) shape.lineTo(a + pitch * step / 4, -width / 2);
      shape.lineTo(b, width / 2);
      for (let step = 1; step <= 4; step += 1) shape.lineTo(b - pitch * step / 4, width / 2);
      shape.closePath();
      if (cell < holes) {
        const hole = new THREE.Path();
        hole.absarc((a + b) / 2, 0, .00078, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
      const position = geometry.attributes.position, normal = geometry.attributes.normal;
      for (let i = 0; i < position.count; i += 1) {
        const angle = start + position.getX(i) / radius;
        const r = radius + position.getZ(i), z = position.getY(i);
        const sin = Math.sin(angle), cos = Math.cos(angle);
        const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
        position.setXYZ(i, r * cos, .013 + r * sin, z);
        normal.setXYZ(i, -sin * nx + cos * nz, cos * nx + sin * nz, ny);
      }
      geometry.clearGroups(); pieces.push(geometry);
    }
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, firstHoleAngle: start + pitch / (2 * radius) };
  }
  const longStrap = curvedStrap({ radius: .0114, start: 145 * RAD, end: 420 * RAD, width: .0094, thickness: .0011, holes: 10 });
  const strapMesh = mesh(longStrap.geometry, teal, band);
  strapMesh.name = 'Continuous open strap with ten through-holes';
  strapMesh.userData.throughHoleCount = 10;
  const shortStrap = curvedStrap({ radius: .0127, start: 110 * RAD, end: 169 * RAD, width: .0094, thickness: .0010 });
  mesh(shortStrap.geometry, darkTeal, closure).name = 'Short overlap strap';

  // The peg passes through the first hole. It is part of the closure, not a
  // separate electronic component. Remaining holes illustrate adjustment.
  const pegAngle = longStrap.firstHoleAngle;
  const outward = new THREE.Vector3(Math.cos(pegAngle), Math.sin(pegAngle), 0);
  const placeRadial = (child, radius) => {
    child.position.copy(outward).multiplyScalar(radius); child.position.y += .013;
    child.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
  };
  const peg = mesh(new THREE.CylinderGeometry(.00053, .00053, .0032, 18), edgeTeal, closure);
  peg.name = 'Peg through selected adjustment hole'; placeRadial(peg, .0121);
  const cap = mesh(new THREE.CylinderGeometry(.00115, .00115, .00065, 24), edgeTeal, closure);
  cap.name = 'Low-profile closure cap'; placeRadial(cap, .0140);
  // A low keeper bridge holds the loose end alongside the overlap.
  const keeper = new THREE.Group(); closure.add(keeper); placeRadial(keeper, .0139);
  for (const side of [-1, 1]) {
    const sidewall = mesh(rounded(.0013, .0017, .001, .0002), darkTeal, keeper);
    sidewall.position.set(0, .0006, side * .0051);
  }
  mesh(rounded(.0013, .0008, .0112, .0002), edgeTeal, keeper).position.y = .0014;

  const parts = [
    { id: 'housing', title: 'Open-front cradle', description: 'Supports the board while leaving its USB-C connector accessible for programming and power.', object: housing, offset: [0, .011, -.008] },
    { id: 'xiao', title: 'XIAO nRF52840 Sense board', description: 'The microcontroller reads motion from the onboard sensor and sends gestures over Bluetooth. The USB-C connector remains attached. Shown using Seeed’s supplied XIAO mechanical model.', object: board, offset: [0, .032, .004], turn: [.18, -.12, .06] },
    { id: 'band', title: 'Adjustable perforated band', description: 'A row of small holes provides different fastening positions around the finger, instead of a fixed ring diameter.', object: band, offset: [-.017, -.001, .008], turn: [0, -.10, -.08] },
    { id: 'closure', title: 'Overlap and peg closure', description: 'The short strap overlaps the perforated end. A peg engages the selected hole, and a keeper holds the loose end.', object: closure, offset: [.018, .003, .014], turn: [0, .12, .12] },
  ];
  const release = () => { resources.forEach(resource => resource.dispose?.()); resources.clear(); };
  const trackTree = root => root.traverse(child => {
    if (child.geometry) keep(child.geometry);
    for (const material of child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []) {
      keep(material);
      for (const value of Object.values(material)) if (value?.isTexture) keep(value);
    }
  });
  const ready = new GLTFLoader().loadAsync(boardUrl).then(gltf => {
    trackTree(gltf.scene);
    if (disposed) { release(); return { warnings: warnings.slice() }; }
    gltf.scene.name = 'Seeed-supplied XIAO-nRF52840 v15 — all components attached';
    gltf.scene.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    board.add(gltf.scene);
    // Original readable identification; no copied certification or brand artwork.
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, 512, 256); context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillStyle = '#26332f'; context.font = '600 72px Arial, sans-serif'; context.fillText('XIAO', 256, 94);
        context.font = '36px Arial, sans-serif'; context.fillText('nRF52840', 256, 173);
        const texture = keep(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
        const material = keep(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
        const label = mesh(new THREE.PlaneGeometry(.0108, .0054), material, board);
        label.rotation.x = -Math.PI / 2; label.position.set(0, .00326, -.00176); label.castShadow = false;
      }
    }
    return { warnings: warnings.slice() };
  }).catch(error => {
    if (disposed) return { warnings: warnings.slice() };
    warnings.push({ asset: 'XIAO board CAD', message: String(error.message || error) });
    // Honest geometry fallback if a local asset request fails; still one board.
    mesh(rounded(.0178, .0012, .021, .0006), graphite, board).position.y = .0006;
    mesh(rounded(.0106, .002, .0126, .0003), silver, board).position.set(0, .0022, -.002);
    const connector = mesh(rounded(.0089, .0035, .0065, .0006), silver, board); connector.position.set(0, .0024, .0087);
    const mouth = mesh(rounded(.0074, .0022, .0002, .0007), graphite, board); mouth.position.set(0, .0024, .01201);
    parts[1].description = 'The supplied board CAD could not load, so this view shows a simplified XIAO-sized reference envelope. USB-C and the sensor belong to the board and are not separate explosion parts.';
    return { warnings: warnings.slice() };
  });

  return {
    object, parts, ready, warnings, localNormal: [0, .52, 1],
    title: 'OmniRing',
    description: 'Adjustable teal ring concept with a perforated strap and peg closure. The board uses Seeed-supplied XIAO STEP geometry; the enclosure and fit are illustrative.',
    dispose() { if (disposed) return; disposed = true; object.removeFromParent(); object.clear(); release(); },
  };
}
