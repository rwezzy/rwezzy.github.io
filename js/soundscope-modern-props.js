import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Original contemporary furniture and electronics. All dimensions are metres;
// each group rests at y=0 and faces +Z so the room's existing placement rules apply.
export function createModernRoomProps() {
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: 0, ...options });
  const stone = material('#e7edf1', { roughness: .44 });
  const white = material('#f3f6fa', { roughness: .4 });
  const graphite = material('#242c36', { roughness: .37, metalness: .2 });
  const black = material('#111820', { roughness: .48 });
  const aluminum = material('#7c8b9a', { roughness: .3, metalness: .8 });
  const blue = material('#69899c', { roughness: .95 });
  const paleFabric = material('#c6d4e0', { roughness: .96 });
  const green = material('#426c64', { roughness: .86 });
  const mesh = (geometry, appearance, parent, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, appearance); part.position.set(x, y, z); parent.add(part); return part;
  };
  const box = (w, h, d, radius, appearance, parent, x = 0, y = 0, z = 0) =>
    mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(radius, w / 2, h / 2, d / 2)), appearance, parent, x, y, z);
  const cylinder = (r, h, appearance, parent, x = 0, y = 0, z = 0, top = r) =>
    mesh(new THREE.CylinderGeometry(top, r, h, 48), appearance, parent, x, y, z);
  const line = (points, radius, appearance, parent) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 36, radius, 8, false), appearance, parent);
  const map = (w, h, paint) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
    return texture;
  };
  const fabricBump = map(128, 128, ctx => {
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
      ctx.fillStyle = ((x + y) % 8) ? '#999' : '#777'; ctx.fillRect(x, y, 2, 3);
    }
  });
  fabricBump.colorSpace = THREE.NoColorSpace; fabricBump.wrapS = fabricBump.wrapT = THREE.RepeatWrapping; fabricBump.repeat.set(10, 10);
  for (const fabric of [blue, paleFabric]) { fabric.bumpMap = fabricBump; fabric.bumpScale = .0007; }

  function feet(group, w, d, y = .09) {
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) cylinder(.018, y, graphite, group, x, y / 2, z);
  }
  function sofa() {
    const g = new THREE.Group(); g.name = 'Low modern sofa with blue woven cushions';
    feet(g, 1.62, .58, .11);
    box(1.92, .20, .83, .065, blue, g, 0, .21, 0);
    box(1.73, .43, .18, .08, blue, g, 0, .59, -.33);
    for (const x of [-.44, .44]) {
      box(.85, .15, .66, .065, paleFabric, g, x, .365, .045);
      const back = box(.84, .38, .15, .065, blue, g, x, .61, -.23); back.rotation.x = -.10;
    }
    for (const x of [-.89, .89]) box(.17, .38, .84, .075, blue, g, x, .40, 0);
    const pillow = box(.30, .31, .10, .055, paleFabric, g, -.65, .56, -.10); pillow.rotation.z = .18;
    return g;
  }
  function chair() {
    const g = new THREE.Group(); g.name = 'Sculpted contemporary lounge chair';
    cylinder(.28, .035, graphite, g, 0, .018, 0);
    cylinder(.055, .20, aluminum, g, 0, .12, 0);
    box(.73, .20, .68, .095, paleFabric, g, 0, .30, .01);
    const back = box(.72, .47, .18, .085, paleFabric, g, 0, .54, -.25); back.rotation.x = -.13;
    for (const x of [-.31, .31]) box(.13, .25, .59, .06, paleFabric, g, x, .40, .02);
    box(.53, .11, .55, .055, blue, g, 0, .38, .055);
    return g;
  }
  function console() {
    const g = new THREE.Group(); g.name = 'Minimal stone and charcoal media console';
    box(1.98, .10, .40, .025, graphite, g, 0, .05, 0);
    box(2.16, .38, .48, .035, white, g, 0, .29, 0);
    box(2.18, .045, .50, .015, stone, g, 0, .4975, 0);
    for (const x of [-.54, .54]) box(1.055, .31, .012, .006, stone, g, x, .29, .245);
    box(.003, .31, .014, .001, graphite, g, 0, .29, .25);
    return g;
  }
  function table(side = false) {
    const g = new THREE.Group(); g.name = side ? 'Round metal side table' : 'Oval pale-stone coffee table';
    const height = side ? .55 : .35;
    cylinder(side ? .23 : .28, .028, graphite, g, 0, .014, 0);
    cylinder(side ? .035 : .10, height - .048, graphite, g, 0, (height - .048) / 2 + .025, 0);
    const top = cylinder(side ? .30 : .44, .035, stone, g, 0, height - .0175, 0);
    if (!side) top.scale.set(1.35, 1, .88);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(side ? .298 : .439, .008, 10, 64), stone);
    rim.rotation.x = Math.PI / 2; rim.position.y = height - .015;
    if (!side) rim.scale.set(1.35, .88, 1);
    g.add(rim); return g;
  }
  function shelf() {
    const g = new THREE.Group(); g.name = 'Slim charcoal display shelving';
    for (const x of [-.29, .29]) for (const z of [.02, .30]) box(.018, 1.62, .018, .004, graphite, g, x, .81, z);
    for (const y of [.05, .43, .81, 1.19, 1.59]) box(.60, .026, .32, .009, graphite, g, 0, y, .16);
    for (let i = 0; i < 4; i++) {
      const book = box(.045, .22 + (i % 2) * .035, .18, .003, i % 2 ? white : blue, g, -.16 + i * .047, .455 + (.22 + (i % 2) * .035) / 2, .15);
      book.rotation.z = i === 3 ? -.09 : 0;
    }
    cylinder(.073, .15, paleFabric, g, -.11, .9, .16, .052);
    const orb = mesh(new THREE.SphereGeometry(.09, 32, 24), stone, g, .13, 1.295, .16); orb.scale.y = .8;
    return g;
  }
  function plant() {
    const g = new THREE.Group(); g.name = 'Plant in a matte white planter';
    cylinder(.073, .13, white, g, 0, .065, 0, .09);
    cylinder(.078, .008, graphite, g, 0, .132, 0);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4, length = .14 + (i % 3) * .035;
      const leaf = mesh(new THREE.SphereGeometry(1, 24, 16), green, g);
      leaf.scale.set(.018, length / 2, .007); leaf.position.set(Math.cos(angle) * .035, .15 + length / 2, Math.sin(angle) * .035);
      leaf.rotation.set(Math.sin(angle) * .5, angle, Math.cos(angle) * .5);
    }
    return g;
  }
  function television() {
    const g = new THREE.Group(); g.name = 'Thin bezel 4K television';
    box(.46, .018, .25, .009, graphite, g, 0, .009, .02);
    box(.045, .13, .035, .008, graphite, g, 0, .075, -.005);
    box(1.30, .75, .039, .018, black, g, 0, .485, 0);
    const art = map(1280, 720, (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#122840'); bg.addColorStop(.5, '#32536c'); bg.addColorStop(1, '#09233a'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = `rgba(110,205,224,${.12 + i * .025})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-70, 470 + i * 23); ctx.bezierCurveTo(260, -100 + i * 10, 710, 760 + i * 8, 1380, 140 + i * 28); ctx.stroke();
      }
      ctx.fillStyle = '#d8eaf3'; ctx.font = '500 33px Arial'; ctx.fillText('STUDIO', 62, 83);
      ctx.font = '20px Arial'; ctx.fillStyle = '#a6c7d6'; ctx.fillText('A moment of clarity', 64, 120);
    });
    mesh(new THREE.PlaneGeometry(1.267, .713), new THREE.MeshBasicMaterial({map:art,toneMapped:false}), g, 0, .485, .0201);
    mesh(new THREE.SphereGeometry(.0025, 12, 8), new THREE.MeshBasicMaterial({color:'#7ccdd9'}), g, .59, .12, .021);
    return g;
  }
  function speaker() {
    const g = new THREE.Group(); g.name = 'Pill-style portable mesh speaker';
    const weave = map(256, 128, ctx => {
      ctx.fillStyle = '#39414b'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#111820';
      for (let y = 0; y < 128; y += 7) for (let x = 0; x < 256; x += 7) { ctx.beginPath(); ctx.arc(x + (y % 14 ? 3 : 0), y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    });
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(2, 1);
    const grille = material('#748291', {map:weave,roughness:.86});
    const capsule = mesh(new THREE.CapsuleGeometry(.062, .18, 16, 48), grille, g, 0, .068, 0); capsule.rotation.z = Math.PI / 2;
    box(.12, .012, .048, .006, black, g, 0, .006, .005);
    for (const x of [-.105, .105]) {
      const end = mesh(new THREE.TorusGeometry(.053, .0035, 10, 48), black, g, x, .068, 0); end.rotation.y = Math.PI / 2;
    }
    const badge = map(128, 128, ctx => { ctx.clearRect(0, 0, 128, 128); ctx.fillStyle='#f0f4f8'; ctx.font='bold 104px Arial'; ctx.textAlign='center'; ctx.fillText('b',64,99); });
    mesh(new THREE.PlaneGeometry(.028, .028), new THREE.MeshBasicMaterial({map:badge,transparent:true,toneMapped:false}), g, 0, .067, .0622);
    for (const x of [-.025, .025]) box(.015, .003, .004, .001, aluminum, g, x, .131, 0);
    line([[.125,.10,-.02],[.18,.11,-.04],[.18,.04,-.04],[.132,.035,-.02]], .003, graphite, g);
    return g;
  }
  function alarm() {
    const g = new THREE.Group(); g.name = 'Compact digital alarm clock';
    box(.22, .10, .07, .02, graphite, g, 0, .05, 0);
    const digits = map(512, 200, ctx => {ctx.fillStyle='#111a25';ctx.fillRect(0,0,512,200);ctx.fillStyle='#c2e5f3';ctx.font='500 122px monospace';ctx.textAlign='center';ctx.fillText('07:30',256,142);});
    mesh(new THREE.PlaneGeometry(.19,.072),new THREE.MeshBasicMaterial({map:digits,toneMapped:false}),g,0,.053,.0352);
    box(.042,.007,.02,.003,aluminum,g,0,.102,-.005); return g;
  }
  function kettle() {
    const g = new THREE.Group(); g.name = 'Matte charcoal gooseneck kettle';
    cylinder(.095, .015, black, g, 0, .0075, 0);
    cylinder(.087, .13, graphite, g, 0, .082, 0, .069);
    const shoulder = mesh(new THREE.SphereGeometry(.074,40,24,0,Math.PI*2,0,Math.PI/2),graphite,g,0,.139,0); shoulder.scale.y=.32;
    cylinder(.056,.007,black,g,0,.163,0);
    cylinder(.018,.018,aluminum,g,0,.174,0,.015);
    line([[.06,.14,0],[.115,.16,0],[.145,.11,0],[.13,.045,0],[.07,.035,0]],.012,black,g);
    line([[-.07,.06,0],[-.12,.08,0],[-.14,.18,0],[-.19,.20,0]],.011,graphite,g);
    return g;
  }
  function laptop() {
    const g = new THREE.Group(); g.name = 'Slim aluminum laptop';
    box(.34,.013,.235,.006,aluminum,g,0,.0065,0);
    box(.145,.001,.06,.003,graphite,g,0,.0135,.065);
    for(let r=0;r<5;r++)for(let c=0;c<13;c++)box(.019,.001,.013,.002,black,g,-.14+c*.023,.014,-.082+r*.018);
    const hinge=new THREE.Group();hinge.position.set(0,.013,-.11);hinge.rotation.x=-.14;g.add(hinge);
    box(.34,.205,.008,.004,graphite,hinge,0,.1025,0);
    const screen=mesh(new THREE.PlaneGeometry(.318,.18),new THREE.MeshBasicMaterial({color:'#c6e3ed'}),hinge,0,.105,.0042);
    screen.material.name='modern_laptop_screen';
    return g;
  }
  const factories = {tv_cabinet:console,sofa,coffee_table:()=>table(false),armchair:chair,shelf,side_table:()=>table(true),plant,tv:television,boombox:speaker,alarm,kettle,laptop};
  return { create: id => { if(!factories[id])throw new Error(`Unknown modern room item: ${id}`); return factories[id](); } };
}
