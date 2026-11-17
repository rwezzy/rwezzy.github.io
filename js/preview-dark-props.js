import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadCarrier } from './soundscope-hardware.js?v=3d1';
import { createOmniRing } from './studio-omniring.js';

const asset = name => new URL(`../assets/studio/${name}`, import.meta.url).href;
const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * Small desk objects in metres, with Y up. This module owns its own resources.
 *
 * Returns immediately: { ready, group, targets, hitTargets, setNotebookOpen,
 * setExploded, setPartHighlight, activate, dispose, warnings }.
 * `ready` resolves after optional images/CAD load. Assembly targets expose
 * { id, title, description, kind:'assembly', parts, center, normal, up, width,
 * height, depth }; their bounds include the FULL exploded layout. Each part is
 * { id, title, description, object }. Hit meshes identify pageId, assemblyId,
 * and partId. setExploded(id, 0..1) linearly interpolates cached local transforms;
 * the caller owns easing, animation timing, camera travel, and the fact panel.
 * About/Contact targets expose { id, kind, object, center, normal, up, width,
 * height }. Vectors are in world space and remain valid after notebook updates.
 * The host owns raycasting, camera motion and animation timing. Call
 * setNotebookOpen(0..1) during its tween; no independent render loop is started.
 * An optional portraitUrl can replace the honest name-card fallback.
 */
export function createStudioProps({ scene, onSelect = () => {}, portraitUrl = null } = {}) {
  if (!scene?.isObject3D) throw new TypeError('Studio props require a Three.js scene or parent group.');
  const group = new THREE.Group();
  group.name = 'Studio desk objects';
  scene.add(group);
  const resources = new Set();
  const hitTargets = [];
  const warnings = [];
  const assemblyRecords = new Map();
  let disposed = false;
  const keep = resource => { resources.add(resource); return resource; };
  const material = (color, options = {}) => keep(new THREE.MeshStandardMaterial({
    color, roughness: .55, metalness: .06, envMapIntensity: .35, ...options,
  }));
  const basic = options => keep(new THREE.MeshBasicMaterial({ toneMapped: false, ...options }));
  const box = (width, height, depth, radius = .0015) => keep(new RoundedBoxGeometry(width, height, depth, 2, radius));
  const mesh = (geometry, appearance, parent = group) => {
    const object = new THREE.Mesh(geometry, appearance);
    object.castShadow = true; object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const cylinder = (radius, length, appearance, parent, segments = 20) =>
    mesh(keep(new THREE.CylinderGeometry(radius, radius, length, segments)), appearance, parent);
  const tubeBetween = (a, b, radius, appearance, parent) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const object = cylinder(radius, delta.length(), appearance, parent);
    object.position.copy(start).add(end).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  };
  const canvasMap = (width, height, paint) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The studio could not draw a prop surface.');
    paint(context, width, height);
    const texture = keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    return texture;
  };
  const plane = (width, height, appearance, parent) => {
    const object = mesh(keep(new THREE.PlaneGeometry(width, height)), appearance, parent);
    object.castShadow = false;
    return object;
  };
  const pageHit = (object, id) => {
    object.userData.page = id;
    object.userData.pageId = id;
    hitTargets.push(object);
    return object;
  };
  const loadTexture = async url => {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    if (disposed) { texture.dispose(); return null; }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    keep(texture);
    return texture;
  };
  const release = () => { resources.forEach(resource => resource.dispose?.()); resources.clear(); };
  const partOutline = new THREE.Box3Helper(new THREE.Box3(), '#c8dca7');
  partOutline.name = 'Selected assembly part'; partOutline.visible = false;
  partOutline.material.depthTest = false; partOutline.material.transparent = true; partOutline.material.opacity = .82;
  partOutline.renderOrder = 20; keep(partOutline.geometry); keep(partOutline.material); scene.add(partOutline);
  let highlightedPart = null;

  const graphite = material('#22262b', { roughness: .36, metalness: .42 });
  const darkMetal = material('#333b3c', { roughness: .42, metalness: .55 });
  const rubber = material('#161b1b', { roughness: .94, metalness: 0 });
  const paper = material('#f4efe2', { roughness: .93, metalness: 0 });
  const brass = material('#b89d62', { roughness: .36, metalness: .65 });

  // ---------------------------------------------------------------- laptop
  const laptop = new THREE.Group(); laptop.name = 'OMEN 16-inspired laptop — schematic enclosure';
  laptop.position.set(.38, .003, -.33); laptop.rotation.y = .15; group.add(laptop);
  const base = mesh(box(.348, .015, .234, .004), graphite, laptop); base.position.y = .008;
  const frontLip = mesh(box(.328, .002, .004, .0007), darkMetal, laptop); frontLip.position.set(0, .010, .116);
  for (const side of [-1, 1]) {
    const foot = mesh(box(.055, .003, .009, .001), rubber, laptop);
    foot.position.set(side * .12, .0015, .091);
    for (const z of [-.065, -.037]) {
      const port = mesh(box(.001, .004, .014, .0005), rubber, laptop);
      port.position.set(side * .1741, .008, z);
    }
    const hinge = cylinder(.0045, .045, darkMetal, laptop, 16);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(side * .115, .020, -.102);
  }

  const keyboardMap = canvasMap(1024, 400, (ctx, w, h) => {
    ctx.fillStyle = '#1b2027'; ctx.fillRect(0, 0, w, h);
    const rows = [
      ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'del'],
      ['~', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−', '=', '⌫'],
      ['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
      ['caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'enter'],
      ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'shift', '↑'],
    ];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach((row, r) => row.forEach((key, c) => {
      const x = 15 + c * 71, y = 12 + r * 61;
      ctx.fillStyle = '#394049'; ctx.fillRect(x, y, 64, 50);
      ctx.fillStyle = '#252b32'; ctx.fillRect(x + 2, y + 2, 60, 44);
      ctx.fillStyle = r < 2 ? '#a7c7d5' : r < 4 ? '#bdb7da' : '#d5b4d0';
      ctx.font = '500 15px Figtree, Arial, sans-serif'; ctx.fillText(key, x + 32, y + 24);
    }));
    const keys = [[15, 66, 'ctrl'], [88, 66, 'fn'], [161, 66, 'win'], [234, 66, 'alt'], [307, 358, ''], [672, 66, 'alt'], [745, 66, 'ctrl'], [818, 56, '←'], [881, 56, '↓'], [944, 56, '→']];
    keys.forEach(([x, width, label]) => {
      ctx.fillStyle = '#394049'; ctx.fillRect(x, 319, width, 52);
      ctx.fillStyle = '#252b32'; ctx.fillRect(x + 2, 321, width - 4, 46);
      ctx.fillStyle = '#c6bfd4'; ctx.font = '500 15px Figtree, Arial, sans-serif'; ctx.fillText(label, x + width / 2, 344);
    });
  });
  const keyboard = plane(.307, .12, material('#ffffff', { map: keyboardMap, roughness: .66, metalness: .12 }), laptop);
  keyboard.rotation.x = -Math.PI / 2; keyboard.position.set(0, .0157, -.031);
  const trackpad = mesh(box(.104, .001, .052, .003), material('#30363d', { metalness: .32, roughness: .45 }), laptop);
  trackpad.position.set(0, .016, .072);
  const grilleGeometry = keep(new THREE.BoxGeometry(.001, .0006, .010));
  const grille = new THREE.InstancedMesh(grilleGeometry, rubber, 54);
  keep(grille); laptop.add(grille);
  const transform = new THREE.Matrix4();
  for (let i = 0; i < 54; i++) { transform.makeTranslation(-.146 + i * .0055, .016, -.099); grille.setMatrixAt(i, transform); }
  grille.instanceMatrix.needsUpdate = true;

  const screenHinge = new THREE.Group(); screenHinge.position.set(0, .020, -.104); screenHinge.rotation.x = -.21; laptop.add(screenHinge);
  const screenHousing = mesh(box(.348, .203, .008, .003), graphite, screenHinge); screenHousing.position.y = .1015;
  const screenMaterial = basic({ color: '#ffffff', map: canvasMap(1024, 550, (ctx, w, h) => {
    ctx.fillStyle = '#0b1620'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#38503d'; ctx.fillRect(0, 0, w * .5, h);
    ctx.fillStyle = '#f0eee3'; ctx.font = '500 44px Figtree, Arial, sans-serif'; ctx.fillText('Enya', 45, 90);
    ctx.fillStyle = '#b5c7ba'; ctx.font = '24px monospace'; ctx.fillText('Wild Child', 45, 130);
    ctx.fillStyle = '#a6cfda'; ctx.font = '20px monospace'; ctx.fillText('class DisplayTransform:', 560, 100);
  }) });
  const screen = plane(.327, .1757, screenMaterial, screenHinge); screen.position.set(0, .106, .0042);
  const wordmarkMap = canvasMap(256, 48, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#a8acb4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '500 25px Figtree, Arial, sans-serif'; ctx.fillText('O M E N', w / 2, h / 2);
  });
  const wordmark = plane(.039, .0073, basic({ map: wordmarkMap, transparent: true }), screenHinge); wordmark.position.set(0, .010, .0044);
  const webcam = mesh(keep(new THREE.CircleGeometry(.0012, 12)), rubber, screenHinge); webcam.position.set(0, .197, .0043);
  const laptopReady = loadTexture(asset('laptop-screen.png')).then(texture => {
    if (!texture || disposed) return;
    screenMaterial.map = texture; screenMaterial.needsUpdate = true;
  });

  // --------------------------------------------------------- About photo wall
  // A small gallery board, front-facing from the desk camera. Unequal cells
  // make the portrait the anchor without turning it into the page background.
  const frame = new THREE.Group(); frame.name = 'About / photos — olive kr. frame';
  frame.position.set(-.72, 0, -.075); frame.rotation.y = .64; group.add(frame);
  const frameFace = new THREE.Group(); frameFace.position.set(0, .148, 0); frameFace.rotation.x = -.18; frame.add(frameFace);
  const galleryRed = material('#668b7c', { roughness: .45, metalness: .2 });
  pageHit(mesh(box(.215, .285, .012, .003), galleryRed, frameFace), 'about');
  const mount = pageHit(plane(.199, .269, material('#202124', { roughness: .95, metalness: 0 }), frameFace), 'about');
  mount.position.z = .0062;
  const monogram = canvasMap(512, 700, (ctx,w,h) => {
    ctx.fillStyle = '#202124'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#b6f3d6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 180px Arial, sans-serif'; ctx.fillText('kr.',w/2,h*.43);
    ctx.fillStyle = '#a8c4b8'; ctx.font = '20px Arial, sans-serif';
    ctx.fillText('About / photos',w/2,h*.78);
  });
  const gallery = pageHit(plane(.183,.250,basic({map:monogram}),frameFace),'about');
  gallery.position.z = .0066;
  // Red folded-metal feet give the board a clean, shallow stand.
  for (const x of [-.065, .065]) {
    tubeBetween([x, .160, -.018], [x, .004, -.075], .0025, galleryRed, frame);
    const foot = mesh(box(.050, .005, .075, .002), galleryRed, frame);
    foot.position.set(x, .0025, -.060);
  }

  // ------------------------------------------------------------ Contact book
  // A portrait memo pad propped on its hard covers, with a fine top binding.
  // Seven o'clock is 30 degrees left of the viewer.
  const notebook=new THREE.Group();notebook.name='Contact / red spiral notepad';
  notebook.position.set(.66,0,.20);
  notebook.scale.set(.83,.92,.92);
  // It sits on the right of the desk, nearly beneath the camera's x position.
  // Turn from that local viewing direction so the opened back cover is visible.
  notebook.rotation.y=.12;group.add(notebook);
  const notebookRed=material('#252629',{roughness:.78,metalness:0});
  const bindingMetal=material('#303932',{roughness:.34,metalness:.6});
  // A shallow 18-degree opening keeps the covers close to the paper stack.
  const frontAngle=.14,rearAngle=.18,hingeDepth=.032;
  const hingeHeight=.214*Math.cos(frontAngle)+.0035*Math.sin(frontAngle);
  const notepadBody=new THREE.Group();notepadBody.position.set(0,hingeHeight,hingeDepth);
  notepadBody.rotation.x=-frontAngle;notebook.add(notepadBody);
  const backing=pageHit(mesh(box(.150,.214,.003,.002),notebookRed,notepadBody),'contact');
  backing.position.set(0,-.107,-.002);
  // The hard back cover opens behind the paper and rests on the desk itself.
  // Its lower edge and the front cover's edge both meet y=0.
  const rearLength=(hingeHeight-.0015*Math.sin(rearAngle))/Math.cos(rearAngle);
  const rearHinge=new THREE.Group();rearHinge.position.set(0,hingeHeight,hingeDepth);
  rearHinge.rotation.x=rearAngle;notebook.add(rearHinge);
  const rearCover=pageHit(mesh(box(.150,rearLength,.003,.0014),notebookRed,rearHinge),'contact');
  rearCover.name='Contact / hard back cover supporting the pad';
  rearCover.position.set(0,-rearLength/2,0);
  const paperEdge=material('#e4e6dc',{roughness:1,metalness:0});
  for(let i=0;i<5;i++){
    const layer=pageHit(mesh(box(.141,.205,.0012,.0005),i%2?paper:paperEdge,notepadBody),'contact');
    layer.position.set(0,-.103,.0005+i*.0014);
  }
  const notebookFace=new THREE.Group();notebookFace.position.set(0,0,.008);
  notepadBody.add(notebookFace);
  const contactMap=canvasMap(632,1020,(ctx,w,h)=>{
    ctx.fillStyle='#f7f7ef';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#61723e';ctx.font='500 44px Figtree, Arial, sans-serif';ctx.fillText('Contact',60,108);
    ctx.fillStyle='#30392d';ctx.font='500 104px Figtree, Arial, sans-serif';ctx.fillText("Let's talk.",60,320);
    ctx.strokeStyle='#c8cec1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,380);ctx.lineTo(w-60,380);ctx.stroke();
    ctx.font='500 32px Figtree, Arial, sans-serif';ctx.fillText('kama.rwezahura@gmail.com',60,480);
    ctx.font='36px Figtree, Arial, sans-serif';ctx.fillText('github.com/rwezzy',60,560);
    ctx.fillStyle='#67725e';ctx.font='34px Figtree, Arial, sans-serif';ctx.fillText('Keith Rwezahura',60,900);
  });
  const fixedPage=pageHit(mesh(box(.141,.205,.001,.0004),paper,notebookFace),'contact');
  fixedPage.position.set(0,-.1025,-.0006);
  const contactPage=pageHit(plane(.140,.204,basic({map:contactMap}),notebookFace),'contact');
  contactPage.position.set(0,-.1025,.0001);
  const paintContactCover=(ctx,w,h)=>{
    ctx.fillStyle='#252629';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#b6f3d6';ctx.textAlign='center';ctx.font='700 174px Figtree, Arial, sans-serif';
    ctx.fillText('Contact',w/2,490);
    const x=w/2-78,y=610,ew=156,eh=100;
    ctx.strokeStyle='#b6f3d6';ctx.lineWidth=10;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.roundRect(x,y,ew,eh,10);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x+4,y+8);ctx.lineTo(w/2,y+58);ctx.lineTo(x+ew-4,y+8);ctx.stroke();
  };
  // Match the narrower physical cover so the lettering keeps its proportions.
  const coverMap=canvasMap(692,1040,paintContactCover);
  const linedMap=canvasMap(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#f7f6ed';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d8dfcf';ctx.lineWidth=1;
    for(let y=58;y<235;y+=27){ctx.beginPath();ctx.moveTo(23,y);ctx.lineTo(w-23,y);ctx.stroke();}
  });
  const leafFront=material('#ffffff',{map:linedMap,roughness:.94,metalness:0,side:THREE.FrontSide});
  const leafBack=material('#f5f3e8',{roughness:.94,metalness:0,side:THREE.BackSide});
  const coverFront=basic({map:coverMap,side:THREE.FrontSide});
  const coverBack=material('#252629',{roughness:.82,metalness:0,side:THREE.BackSide});
  function shapeLeaf(leaf,bend){
    if(Math.abs(bend-leaf.bend)<.00001)return;
    leaf.bend=bend;const positions=leaf.geometry.attributes.position;
    let y=0,z=0;
    for(let row=0;row<=24;row++){
      const s=row/24;
      if(row){const angle=bend*Math.pow(Math.max(0,((row-.5)/24-.45)/.55),2);y-=leaf.length/24*Math.cos(angle);z+=leaf.length/24*Math.sin(angle);}
      const inset=(row===0||row===24) ? .002 : 0;
      for(let col=0;col<=8;col++){
        const u=col/8;
        positions.setXYZ(row*9+col,(u-.5)*(leaf.width-2*inset),y,z+.00035*Math.sin(Math.PI*u)*Math.sin(Math.PI*s));
      }
    }
    positions.needsUpdate=true;leaf.geometry.computeVertexNormals();
  }
  function makeLeaf(name,width,length,angle,z,bend,front,back){
    const hinge=new THREE.Group();hinge.name=name;hinge.position.set(0,0,z);hinge.rotation.x=angle;notepadBody.add(hinge);
    const geometry=keep(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(25*9*3),3));
    const uv=[],indices=[];
    for(let row=0;row<=24;row++)for(let col=0;col<=8;col++){
      uv.push(col/8,1-row/24);
      if(row<24&&col<8){const a=row*9+col,c=a+9;indices.push(a,c,a+1,a+1,c,c+1);}
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    // Arc length bounds every bent state without per-frame bounds allocation.
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),Math.hypot(width/2,length));
    pageHit(mesh(geometry,front,hinge),'contact');pageHit(mesh(geometry,back,hinge),'contact');
    const leaf={hinge,geometry,width,length,angle,z,baseBend:bend,bend:NaN};
    shapeLeaf(leaf,bend);return leaf;
  }
  const paperLeaves=[0,1,2].map(i=>makeLeaf('Contact / front paper leaf '+(i+1),.141,.206-i*.0015,-.002-i*.004,.0095+i*.001,.015+i*.008,leafFront,leafBack));
  // Loose pages hang in the opening between the hard covers. Small differences
  // in angle and curl expose separate paper edges rather than one solid block.
  const hangingLeaves=Array.from({length:5},(_,i)=>makeLeaf('Contact / hanging paper leaf '+(i+1),.141,.201+(i%2)*.0004,frontAngle+.025+i*.026,-.0045-i*.00055,.012+i*.008,leafFront,leafBack));
  const coverLeaf=makeLeaf('Contact / hard red front cover',.147,.197,-.016,.014,0,coverFront,coverBack);
  const coverBoard=pageHit(mesh(box(.147,.197,.0012,.0005),notebookRed,coverLeaf.hinge),'contact');
  coverBoard.position.set(0,-.0985,-.0008);
  const flippingLeaves=[coverLeaf,...paperLeaves.slice().reverse(),...hangingLeaves];
  const leafDelay=.5/(flippingLeaves.length-1);
  const ringGeometry=keep(new THREE.TorusGeometry(.0074,.00085,8,24));
  // Nine close-set loops read as a notebook binding at the desk's small scale.
  for(let i=0;i<9;i++){
    const ring=pageHit(mesh(ringGeometry,bindingMetal,notepadBody),'contact');
    ring.rotation.y=Math.PI/2;ring.position.set((i-4)*.0148,.0015,.006);
  }
  document.fonts?.ready.then(()=>{
    if(disposed)return;
    const canvas=coverMap.image;paintContactCover(canvas.getContext('2d'),canvas.width,canvas.height);
    coverMap.needsUpdate=true;
  });

  const targets = {
    about: { id: 'about', title: 'About', kind: 'frame', object: frame, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .215, height: .285 },
    contact: { id: 'contact', title: 'Contact', kind: 'notebook', object: notebook, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .140*notebook.scale.x, height: .204*notebook.scale.y, openProgress: 0 },
  };
  function updateTargets(t = targets.contact.openProgress) {
    group.updateWorldMatrix(true, true);
    targets.about.center.set(0, 0, .007).applyMatrix4(frameFace.matrixWorld);
    targets.about.normal.set(0, 0, 1).transformDirection(frameFace.matrixWorld);
    targets.about.up.set(0, 1, 0).transformDirection(frameFace.matrixWorld);
    targets.contact.center.set(0,-.1025,.001).applyMatrix4(notebookFace.matrixWorld);
    targets.contact.normal.set(0,0,1).transformDirection(notebookFace.matrixWorld);
    targets.contact.up.set(0,1,0).transformDirection(notebookFace.matrixWorld);
    targets.contact.height=.204*notebook.scale.y;
    for (const record of assemblyRecords.values()) {
      record.target.center.copy(record.localCenter).applyMatrix4(record.object.matrixWorld);
      record.target.normal.copy(record.localNormal).transformDirection(record.object.matrixWorld);
      record.target.up.copy(record.localUp).transformDirection(record.object.matrixWorld);
    }
  }
  function setNotebookOpen(value){
    if(disposed)return;
    const t=clamp01(value);
    flippingLeaves.forEach((leaf,i)=>{
      const phase=clamp01((t-i*leafDelay)/.5),turn=phase*phase*(3-2*phase);
      leaf.hinge.rotation.x=THREE.MathUtils.lerp(leaf.angle,-Math.PI*2+.03,turn);
      leaf.hinge.position.z=THREE.MathUtils.lerp(leaf.z,-.006-i*.001,turn);
      leaf.hinge.position.y=.003*Math.sin(Math.PI*turn);
      shapeLeaf(leaf,i===0 ? 0 : leaf.baseBend*(1-2*turn)+.9*Math.sin(Math.PI*phase));
    });
    targets.contact.openProgress=t;updateTargets(t);
  }
  setNotebookOpen(0);

  function registerAssembly(id, title, description, object, partSpecs, localNormal = [0, .14, 1]) {
    const normal = new THREE.Vector3(...localNormal).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
    const target = { id, title, description, kind: 'assembly', object, parts: [], center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), width: .4, height: .4, depth: .2, explodedProgress: 0 };
    const record = { object, target, localCenter: new THREE.Vector3(0, .15, 0), localNormal: normal, localUp: up, transforms: [], appearances: new Map() };
    for (const spec of partSpecs) {
      const part = { id: spec.id, title: spec.title, description: spec.description, object: spec.object };
      const homePosition = spec.object.position.clone(), homeQuaternion = spec.object.quaternion.clone();
      record.transforms.push({ object: spec.object, homePosition, homeQuaternion,
        explodedPosition: homePosition.clone().add(new THREE.Vector3(...spec.offset)),
        explodedQuaternion: homeQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(spec.turn || [0, 0, 0])))),
      });
      target.parts.push(part);
    }
    targets[id] = target; assemblyRecords.set(id, record);
    return record;
  }
  function registerPartHits(record) {
    for (const part of record.target.parts) part.object.traverse(object => {
      if (!object.isMesh || object.userData.assemblyId === record.target.id) return;
      pageHit(object, record.target.id);
      object.userData.assemblyId = record.target.id; object.userData.partId = part.id;
      // Isolate highlight materials from the laptop, frame, and other parts.
      const appearances = Array.isArray(object.material) ? object.material : [object.material];
      const copies = appearances.map(original => {
        const copy = keep(original.clone());
        record.appearances.set(copy, { color: copy.color?.clone(), emissive: copy.emissive?.clone(), intensity: copy.emissiveIntensity });
        return copy;
      });
      object.material = Array.isArray(object.material) ? copies : copies[0];
    });
  }
  function applyExplosion(record, progress) {
    for (const transform of record.transforms) {
      transform.object.position.lerpVectors(transform.homePosition, transform.explodedPosition, progress);
      transform.object.quaternion.slerpQuaternions(transform.homeQuaternion, transform.explodedQuaternion, progress);
    }
    record.object.updateWorldMatrix(true, true);
  }
  function measureAssembly(record) {
    // The focused camera uses fixed full-explosion bounds, so opening parts
    // never causes a camera resize or crops the outermost component.
    applyExplosion(record, 1);
    const bounds = new THREE.Box3().setFromObject(record.object);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const normal = record.localNormal.clone().transformDirection(record.object.matrixWorld);
      const up = record.localUp.clone().transformDirection(record.object.matrixWorld);
      const right = new THREE.Vector3().crossVectors(up, normal).normalize();
      let width = 0, height = 0, depth = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const delta = new THREE.Vector3(x, y, z).sub(center);
        width = Math.max(width, Math.abs(delta.dot(right)) * 2);
        height = Math.max(height, Math.abs(delta.dot(up)) * 2);
        depth = Math.max(depth, Math.abs(delta.dot(normal)) * 2);
      }
      record.localCenter.copy(center).applyMatrix4(record.object.matrixWorld.clone().invert());
      record.target.width = width * 1.12; record.target.height = height * 1.12; record.target.depth = depth;
    }
    applyExplosion(record, record.target.explodedProgress);
    updateTargets();
  }
  function setExploded(id, value) {
    if (disposed) return;
    const record = assemblyRecords.get(id);
    if (!record) return;
    record.target.explodedProgress = clamp01(value);
    applyExplosion(record, record.target.explodedProgress); updateTargets();
    if (highlightedPart) partOutline.box.setFromObject(highlightedPart.object).expandByScalar(.003);
  }
  function setPartHighlight(id, partId = null) {
    if (disposed) return;
    highlightedPart = assemblyRecords.get(id)?.target.parts.find(part => part.id === partId) || null;
    partOutline.visible = Boolean(highlightedPart);
    if (highlightedPart) partOutline.box.setFromObject(highlightedPart.object).expandByScalar(.003);
    for (const record of assemblyRecords.values()) {
      for (const part of record.target.parts) part.object.traverse(object => {
        if (!object.isMesh) return;
        const selected = record.target.id === id && part.id === partId;
        for (const appearance of Array.isArray(object.material) ? object.material : [object.material]) {
          const original = record.appearances.get(appearance);
          if (!original) continue;
          if (original.emissive) {
            appearance.emissive.copy(selected ? new THREE.Color('#728744') : original.emissive);
            appearance.emissiveIntensity = selected ? .22 : original.intensity;
          } else if (original.color) appearance.color.copy(original.color).lerp(new THREE.Color('#dce8b9'), selected ? .2 : 0);
        }
      });
    }
  }

  // --------------------------------------------------------- SoundScope rig
  const rig = new THREE.Group(); rig.name = 'SoundScope original carrier with schematic sensors and tripod';
  // Forward and left of the arm: the board and tripod stay visible without
  // occupying the front-left plaque's pickup area.
  rig.position.set(-.28, 0, -.19); rig.rotation.y = .58; group.add(rig);
  const tripodPart = new THREE.Group(), framePart = new THREE.Group(), pressurePart = new THREE.Group();
  const clampsPart = new THREE.Group(), fastenersPart = new THREE.Group(), boardPart = new THREE.Group(), cameraPart = new THREE.Group();
  tripodPart.name = 'SoundScope / stationary tripod'; framePart.name = 'SoundScope / integrated ring and camera cradle';
  pressurePart.name = 'SoundScope / camera pressure bar'; clampsPart.name = 'SoundScope / microphone clamp pieces';
  fastenersPart.name = 'SoundScope / printed screws and nuts';
  boardPart.name = 'SoundScope / microphone board'; cameraPart.name = 'SoundScope / depth camera';
  for (const part of [framePart, pressurePart, clampsPart, fastenersPart, boardPart, cameraPart]) part.position.y = .116;
  rig.add(tripodPart, framePart, pressurePart, clampsPart, fastenersPart, boardPart, cameraPart);
  const column = cylinder(.0055, .072, darkMetal, tripodPart); column.position.y = .051;
  const collar = cylinder(.010, .014, rubber, tripodPart); collar.position.y = .031;
  const head = mesh(box(.036, .008, .026, .003), darkMetal, tripodPart); head.position.y = .090;
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + i * Math.PI * 2 / 3;
    const foot = [Math.cos(angle) * .087, .004, Math.sin(angle) * .087];
    tubeBetween([Math.cos(angle) * .012, .069, Math.sin(angle) * .012], foot, .004, darkMetal, tripodPart);
    const tip = mesh(keep(new THREE.SphereGeometry(.006, 12, 8)), rubber, tripodPart); tip.position.fromArray(foot); tip.scale.y = .55;
  }
  const soundRecord = registerAssembly('soundscope', 'SoundScope', 'Audio direction and RGB-D sensing in an adjustable printed carrier. The original carrier CAD is preserved; electronics and tripod details are schematic.', rig, [
    { id: 'board', title: 'Four-microphone array', description: 'Four synchronized microphone recordings from the reSpeaker XVF3800 feed SoundScope’s direction-estimation algorithm.', object: boardPart, offset: [.015, .150, .055], turn: [0, -.10, 0] },
    { id: 'camera', title: 'RGB-D camera', description: 'The Gemini 2 provides image and depth measurements.', object: cameraPart, offset: [.025, .065, .100], turn: [0, .10, 0] },
    { id: 'carrier', title: 'Ring & camera cradle', description: 'One original printed frame combines the microphone ring and camera cradle, keeping the sensors aligned.', object: framePart, offset: [-.170, .040, -.040] },
    { id: 'pressure-bar', title: 'Camera pressure bar', description: 'The printed bar secures the camera in its cradle.', object: pressurePart, offset: [-.120, -.035, .115] },
    { id: 'mic-clamps', title: 'Microphone clamps', description: 'Three printed shoes and three contact toes locate and secure the microphone board in the ring.', object: clampsPart, offset: [0, 0, 0] },
    { id: 'fasteners', title: 'Printed fasteners', description: 'The original camera nuts and screws, plus the clamp lock and toe screws, let the carrier be adjusted and secured.', object: fastenersPart, offset: [0, 0, 0] },
    { id: 'tripod', title: 'Tripod support', description: 'Supports the assembled sensor carrier and stays in place during the exploded view.', object: tripodPart, offset: [0, 0, 0] },
  ]);
  registerPartHits(soundRecord);
  const carrierReady = loadCarrier(resources).then(({ assembly, parts }) => {
    if (disposed) { release(); return; }
    assembly.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    const originalParts = parts.map(part => part.node || part);
    const sourceRoots = new Set();
    assembly.updateWorldMatrix(true, true);
    // Retain every source mesh and its exact assembled transform. Only the
    // desk instance is recolored; the standalone hardware demo is untouched.
    const sourcePoses = originalParts.map(object => {
      let root = object;
      while (root.parent && root.parent !== assembly) root = root.parent;
      sourceRoots.add(root);
      return { object, matrix: object.matrixWorld.clone() };
    });
    const printGreen = material('#32d66b', { roughness: .42, flatShading: true });
    const printDark = material('#0c7848', { roughness: .38, flatShading: true });
    const printContact = material('#25b964', { roughness: .36, flatShading: true });
    let fastenerIndex = 0;
    for (const { object, matrix } of sourcePoses) {
      const name = object.name;
      const isClamp = /^mic_(shoe|toe)_\d+$/.test(name);
      const isFastener = name.includes('screw') || name.includes('nut');
      const destination = name === 'shared_frame' ? framePart : name === 'camera_pressure_bar' ? pressurePart : isClamp ? clampsPart : fastenersPart;
      destination.add(object);
      matrix.decompose(object.position, object.quaternion, object.scale);
      object.matrixAutoUpdate = true;
      object.material = isFastener ? printDark : name.includes('toe') || name.includes('pressure_bar') ? printContact : printGreen;
      object.userData.sourceCadName = name;
      if (isClamp || isFastener) {
        const homePosition = object.position.clone(), homeQuaternion = object.quaternion.clone();
        let explodedPosition;
        if (isClamp) {
          const column = Number(name.match(/\d+$/)[0]) - 1;
          explodedPosition = new THREE.Vector3(.140 + column * .065, name.includes('shoe') ? .235 : .185, name.includes('shoe') ? .060 : .085);
        } else {
          const index = fastenerIndex++;
          explodedPosition = new THREE.Vector3(.125 + (index % 5) * .035, .080 - Math.floor(index / 5) * .050, .110);
        }
        soundRecord.transforms.push({ object, homePosition, homeQuaternion, explodedPosition, explodedQuaternion: homeQuaternion.clone() });
      }
    }
    for (const child of [...assembly.children]) {
      if (sourceRoots.has(child)) continue;
      if (child.name.includes('PCB') || child.name.includes('microphone')) boardPart.add(child);
      else cameraPart.add(child);
    }
    // Original explanatory geometry: a populated circular board, not copied
    // manufacturer STEP solids. The exact board layout is intentionally not claimed.
    const chipMaterial = material('#18201e', { roughness: .7 });
    const silver = material('#9aa6a0', { roughness: .3, metalness: .8 });
    const boardInk = material('#d6ded1', { roughness: .9 });
    const ledMaterial = material('#a9bc82', { roughness: .35, emissive: '#5a6e29', emissiveIntensity: .1 });
    const chip = mesh(box(.018, .018, .0024, .0005), chipMaterial, boardPart); chip.position.set(0, .128, .0172);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const led = mesh(box(.0026, .0026, .0012, .0002), ledMaterial, boardPart);
      led.position.set(Math.sin(angle) * .042, .128 + Math.cos(angle) * .042, .0164);
    }
    for (const [x, y, w, h] of [[-.017, .128, .006, .010], [.018, .130, .006, .015], [0, .150, .012, .006], [0, .105, .014, .007]]) {
      const component = mesh(box(w, h, .0018, .0003), chipMaterial, boardPart); component.position.set(x, y, .017);
      for (const side of [-1, 1]) {
        const contact = mesh(keep(new THREE.BoxGeometry(.0008, h * .85, .0005)), silver, boardPart); contact.position.set(x + side * (w / 2 + .0005), y, .0164);
      }
    }
    for (const x of [-.018, .018]) {
      const usb = mesh(box(.009, .004, .004, .0005), silver, boardPart); usb.position.set(x, .080, .017);
      const port = mesh(box(.0065, .002, .001, .0003), rubber, boardPart); port.position.set(x, .0784, .0188);
    }
    const boardLabel = canvasMap(512, 80, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d3dfd1';
      ctx.font = '500 34px Figtree, Arial, sans-serif'; ctx.fillText('reSpeaker  /  XVF3800', w / 2, h / 2);
    });
    const label = plane(.045, .007, basic({ map: boardLabel, transparent: true, depthWrite: false }), boardPart); label.position.set(0, .163, .016);
    const microphoneLabels = canvasMap(512, 512, ctx => {
      ctx.clearRect(0, 0, 512, 512); ctx.fillStyle = '#cbd9c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '500 20px Arial, sans-serif';
      [[126, 96], [386, 96], [126, 416], [386, 416]].forEach(([x, y], index) => ctx.fillText(`MIC ${index + 1}`, x, y));
    });
    const micSilkscreen = plane(.098, .098, basic({ map: microphoneLabels, transparent: true, depthWrite: false }), boardPart);
    micSilkscreen.position.set(0, .128, .0163);
    for (const x of [-.039, .039]) {
      const screw = mesh(keep(new THREE.CircleGeometry(.0013, 12)), boardInk, boardPart); screw.position.set(x, .128, .016);
    }
    registerPartHits(soundRecord); measureAssembly(soundRecord);
    updateTargets();
  });

  // ------------------------------------------------------- OmniRing concept
  // The board's supplied CAD, connector and onboard parts stay together;
  // only the illustrative cradle, perforated band and closure separate.
  const omniModel = createOmniRing();
  const omni = omniModel.object;
  omni.position.set(.34, .004, -.025); omni.rotation.y = -.22; omni.scale.setScalar(2.3); group.add(omni);
  const omniRecord = registerAssembly('omniring', omniModel.title, omniModel.description, omni, omniModel.parts, omniModel.localNormal);
  const omniReady = Promise.resolve(omniModel.ready).then(result => {
    if (disposed) { omniModel.dispose(); return; }
    warnings.push(...(result?.warnings || []));
    // A load fallback may refine a descriptor; keep the inspector accurate.
    for (const part of omniRecord.target.parts) {
      const current = omniModel.parts.find(spec => spec.id === part.id);
      if (current) { part.title = current.title; part.description = current.description; }
    }
    registerPartHits(omniRecord); measureAssembly(omniRecord); updateTargets();
  });

  const ready = Promise.allSettled([laptopReady, carrierReady, omniReady]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') warnings.push({ asset: ['laptop screen', 'SoundScope carrier', 'OmniRing'][index], message: String(result.reason?.message || result.reason) });
    });
    if (!disposed) {
      measureAssembly(soundRecord); measureAssembly(omniRecord); updateTargets();
    }
    return { warnings: warnings.slice() };
  });
  return {
    ready, group, targets, hitTargets, setNotebookOpen, setExploded, setPartHighlight, warnings,
    activate(value) {
      const id = typeof value === 'string' ? value : value?.userData?.pageId;
      if (!disposed && targets[id]) onSelect(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true; partOutline.removeFromParent(); omniModel.dispose(); group.removeFromParent(); group.clear(); hitTargets.length = 0; release();
    },
  };
}
