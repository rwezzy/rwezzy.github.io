import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const write=(p,v)=>writeFileSync(new URL(p,root),v);
let css=read('experiments/studio-framing/charcoal-mint.css');
for(const [a,b] of Object.entries({'#121617':'#0e0e0f','#1b2223':'#202020','#334441':'#3c3c3c','#4d6961':'#626262','#243c34':'#303030','#283b34':'#303030','#24362f':'#303030','#edf4f1':'#f0f0f0','#c1ceca':'#cccccc','#a0b3ad':'#b2b2b2','#aebfba':'#bcbcbc'}))css=css.replaceAll(a,b);
write('experiments/studio-framing/neutral-mint.css',css.replaceAll('body.studio-site','html[data-theme="dark"] body.studio-site'));

let props=read('js/preview-fast-props.js');
props=props.replace('frame.position.set(-.60, 0, -.035)', 'frame.position.set(-.72, 0, -.075)')
 .replace('rig.position.set(-.28, 0, -.035)', 'rig.position.set(-.28, 0, -.19)')
 .replace('notebook.rotation.y=-Math.PI/6', 'notebook.rotation.y=.12')
 .replace("material('#647c46'", "material('#668b7c'")
 .replaceAll("'#faf9f5'", "'#202124'")
 .replace("ctx.fillStyle = '#292d25'", "ctx.fillStyle = '#b6f3d6'")
 .replace("ctx.fillStyle = '#5e6855'", "ctx.fillStyle = '#a8c4b8'")
 .replaceAll("'#a71e32'", "'#252629'")
 .replace("ctx.fillStyle='#b51e36'", "ctx.fillStyle='#252629'")
 .replaceAll("'#fffdf5'", "'#b6f3d6'")
 .replace("600 150px Figtree", "700 174px Figtree")
 .replace('texture.anisotropy = 4;', 'texture.anisotropy = 16;')
 .replace("const coverFront=material('#ffffff',{map:coverMap,roughness:.82,metalness:0,side:THREE.FrontSide});", "const coverFront=basic({map:coverMap,side:THREE.FrontSide});");
write('js/preview-dark-props.js',props);

let scene=read('js/preview-layout-scene.js');
scene=scene.replace('new THREE.Vector3(0.57, 0.84, 1.04)', 'new THREE.Vector3(0.57, 1.00, 1.04)');
// Larger physical faces and a wider arc keep resting titles readable and separate.
scene=scene.replace('width: 0.180, height: 0.112', 'width: 0.225, height: 0.140');
scene=scene.replace('PLAQUE.angleStart + index * PLAQUE.angleStep', '[-93, -65, -30, 10][index]');
scene=scene.replace('../experiments/mobile-loading/motion.json','../experiments/studio-framing/large-plaque-motion.json');
scene=scene.replace('label.height = 637', 'label.height = 637');
scene=scene.replace("ctx.fillText(String(index + 1).padStart(2, '0'),54,90);", '// Leave the full face for the title.');

scene=scene.replace(/preview-fast-props.js\?v=\w+/,'preview-dark-props.js?v=charcoal1');
scene=scene.replace("'500 '+size+'px Arial, sans-serif'","'700 '+size+'px Arial, sans-serif'");
scene=scene.replace('let size = 200;', 'let size = 190;');
scene=scene.replace("'700 '+size+'px Arial, sans-serif'", "'600 '+size+'px Figtree, Arial, sans-serif'");
scene=scene.replace('ctx.measureText(title).width > 916', 'Math.max(...PAGES.map(([,name])=>ctx.measureText(name).width)) > 980');

scene=scene.replace('  plaqueGuide = createPlaqueGuide', `  document.fonts?.ready.then(()=>{
    if(disposed)return;
    plaques.forEach(plaque=>{
      const texture=drawLabel(plaque.title,plaque.pageNumber-1);
      plaque.labelMaterial.map=texture; plaque.reverseLabelMaterial.map=texture;
      plaque.labelMaterial.needsUpdate=true; plaque.reverseLabelMaterial.needsUpdate=true;
    });
    render();
  });
  plaqueGuide = createPlaqueGuide`);
scene=scene.replace("from './studio-render-budget.js'","from '../experiments/studio-framing/text-render-budget.mjs'");
scene=scene.replace('width > 916','width > 980');
scene=scene.replace('ctx.fillText(title,512,370+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);', `ctx.save();
    ctx.translate(512,318);
    // Uniform vertical expansion offsets the resting face's foreshortening.
    // Width, font size and vertical scale are shared by every plaque.
    ctx.scale(1,1.35);
    ctx.fillText(title,0,(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);
    ctx.restore();`);
scene=scene.replace('Canvas and plaque share an aspect ratio; glyphs are never stretched.', 'All labels share the same vertical expansion for resting readability.');
scene="import {createDeskReflection} from '../experiments/studio-framing/desk-reflection.js?v=1';\n"+scene;
scene=scene.replace('  const scene = new THREE.Scene();','  const scene = new THREE.Scene();\n  const deskReflection=createDeskReflection(scene);');
scene=scene.replace('      partOutline?.update();',"      deskReflection.update(document.documentElement.dataset.theme==='dark');\n      partOutline?.update();");
scene=scene.replace('    studioProps?.dispose();','    deskReflection.dispose();\n    studioProps?.dispose();');
scene=scene.replace('THREE.PCFSoftShadowMap','THREE.VSMShadowMap');
scene=scene.replace('key.shadow.radius = 4;','key.shadow.radius = 20; key.shadow.blurSamples = 12;');
scene=scene.replace("ground.rotation.x = -Math.PI / 2;", "ground.name='Desk shadow receiver'; ground.rotation.x = -Math.PI / 2;");
scene=scene.replace("      deskReflection.update(document.documentElement.dataset.theme==='dark');",`      const dark=document.documentElement.dataset.theme==='dark';
      deskReflection.update(dark);
      const ground=scene.getObjectByName('Desk shadow receiver');
      if(ground){ground.material.color.set(dark?'#000000':'#554d5d');ground.material.opacity=dark?.35:.2;}`);
scene=scene.replaceAll('rgba(73,62,70,','rgba(0,0,0,');
scene=scene.replace('  scene.fog = new THREE.Fog(COLORS.studio, 2.8, 7);',`  scene.fog = new THREE.Fog(document.documentElement.dataset.theme==='dark'?'#0e0e0f':COLORS.studio, 2.8, 7);
  const updateTheme=()=>{scene.fog.color.set(document.documentElement.dataset.theme==='dark'?'#0e0e0f':COLORS.studio); render();};
  window.addEventListener('studio-theme-change',updateTheme);`);
scene=scene.replace('    disposed = true; active = false;','    window.removeEventListener(\'studio-theme-change\',updateTheme);\n    disposed = true; active = false;');
write('js/preview-dark-scene.js',scene);
write('js/preview-dark-shell.js',read('js/preview-layout-shell.js').replace(/preview-layout-scene.js\?v=\w+/,'preview-dark-scene.js?v=mint3'));
let html=read('studio-layout-preview.html').replace(/preview-layout-shell.js\?v=\w+/,'preview-dark-shell.js?v=mint3');
html=html.replaceAll('the red flip notebook','the charcoal flip notebook');
html=html.replace('</head>','<link rel="stylesheet" href="experiments/studio-framing/neutral-mint.css?v=3"><link rel="stylesheet" href="experiments/studio-framing/theme-toggle.css"><link rel="stylesheet" href="experiments/studio-framing/dark-glass.css?v=1"><script src="experiments/studio-framing/theme-toggle.js"></script></head>');
html=html.replace('<a class="s-contact-link"','<button id="theme-toggle" class="s-theme-toggle" type="button" aria-label="Switch to light theme">Light mode</button><a class="s-contact-link"');
write('studio-dark-preview.html',html.replaceAll('href="?mode=','href="studio-dark-preview.html?mode='));
console.log('Built neutral charcoal preview with live theme toggle.');




