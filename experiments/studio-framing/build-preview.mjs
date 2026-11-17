// Local review of the published studio. Do not overwrite its approved sources.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>writeFileSync(new URL(p,root),s);
const change=(s,a,b)=>{if(!s.includes(a))throw Error('Missing source anchor: '+a.slice(0,90));return s.replace(a,b);};
const version=createHash('sha256').update(read('experiments/studio-framing/build-preview.mjs')+read('experiments/studio-framing/home-fit.mjs')).digest('hex').slice(0,10);
let guide=read('experiments/mobile-loading/plaque-guide.js');
guide=`import {guideRows} from './home-fit.mjs?v=${version}';\n`+guide;
guide=change(guide,'const first=narrow','const requestedFirst=narrow');
guide=change(guide,'const step=narrow?44:Math.max(44,(bottom(anchors[2]).y+12-first)/2);',
 `const {first,step}=guideRows(requestedFirst,narrow?44:(bottom(anchors[2]).y+12-requestedFirst)/2,height);`);
write('experiments/studio-framing/plaque-guide.js',guide);
let scene=read('js/preview-fast-scene.js');
scene=scene.replace(/\.\.\/experiments\/mobile-loading\/plaque-guide\.js\?v=[a-z0-9]+/,`../experiments/studio-framing/plaque-guide.js?v=${version}`);
scene=`import {fitHomeDistance} from '../experiments/studio-framing/home-fit.mjs?v=${version}';\n`+scene;
scene=change(scene,"['beyond', 'Beyond', 5]","['beyond', 'Involvement', 5]");
scene=change(scene,'  let width = 1, height = 1;',`  let width = 1, height = 1;
  let restComposition = [];
  // Cache physical bounds after the assets load in their rest poses. Never fit
  // the enormous shadow floor or recalculate from a moving/notebook-open pose.
  function cacheRestComposition() {
    scene.updateMatrixWorld(true);
    const objects=[...robot.children,...studioProps.group.children,scene.getObjectByName('Robot mounting base')];
    restComposition=[];
    for(const object of objects) {
      if(!object?.visible)continue;
      const bounds=new THREE.Box3().setFromObject(object,true);
      if(bounds.isEmpty())continue;
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
        restComposition.push([x,y,z]);
        // Include the footprint of the existing directional key light.
        if(y>0)restComposition.push([x+y*1.4/2.58,0,z-y*1.7/2.58]);
      }
    }
  }`);
scene=change(scene,`    // The shoes sit farther left than the photo wall. Leave a little breathing
    // room on small screens, blending the margin without a breakpoint jump.`,
 `    // Preserve the established scale where it already fits, then pull back
    // enough for all resting objects and shadows at this viewport size.`);
scene=change(scene,'    const distance = 1.42 * edgeMargin * Math.max(1, 1.64 / camera.aspect);',
 `    const minimum = 1.42 * edgeMargin * Math.max(1, 1.64 / camera.aspect);
    const fit=restComposition.length ? fitHomeDistance(restComposition,{
      target:homeTarget.toArray(),direction:homeDirection.toArray(),width,height,fov:camera.fov,minimum,
      padding:{left:16,right:32,top:56,bottom:width<500?24:48}
    }) : {distance:minimum};
    const distance=fit.distance;
    if(profiling&&fit.bounds)canvas.dataset.homeFraming=JSON.stringify({width,height,...fit});`);
scene=change(scene,'    applyJoints(joints); resize();','    applyJoints(joints); cacheRestComposition(); resize();');
write('js/preview-layout-scene.js',scene);
let shell=read('js/preview-fast-shell.js');
shell=shell.replace(/\.\/preview-fast-scene\.js\?v=[a-z0-9]+/,`./preview-layout-scene.js?v=${version}`);
shell=change(shell,"['beyond', 'Beyond', ['#campus', '#beyond', '#offclock']]","['beyond', 'Involvement', ['#campus', '#beyond', '#offclock']]");
write('js/preview-layout-shell.js',shell);
let html=read('studio-release-preview.html');
html=html.replace(/js\/preview-fast-shell\.js\?v=[a-z0-9]+/,`js/preview-layout-shell.js?v=${version}`);
html=change(html,'data-view="beyond">Beyond</a>','data-view="beyond">Involvement</a>');
html=change(html,'</head>',`<link rel="stylesheet" href="experiments/studio-framing/rectangular.css?v=${version}"></head>`);
html=change(html,'href="#offclock">Off the clock','href="#offclock">Interests');
html=change(html,'<h2>Outside engineering</h2>','<h2>Interests</h2>');
html=change(html,'content="index,follow,max-image-preview:large"','content="noindex,nofollow"');
write('studio-layout-preview.html',html);
console.log('Local review: http://127.0.0.1:8145/studio-layout-preview.html?mode=full&studio-profile');
