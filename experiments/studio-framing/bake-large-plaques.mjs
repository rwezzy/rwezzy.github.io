// Isolated preview: the live HTML, JS, CSS and original assets stay untouched.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';


import {prepareJointPath} from '../../js/studio-motion.js';
import {inverse,multiply,pose} from '../../js/den/lite6.js';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const write=(p,s)=>writeFileSync(new URL(p,root),s);
let scene=read('js/preview-dark-scene.js');
const names=['PLAQUE','INITIAL_JOINTS','REST','DISPLAY','ATTACH'];
const declarations=names.map(n=>scene.match(new RegExp(`const ${n} = [\\s\\S]*?;`))[0]).join('\n');
const config=runInNewContext(`${declarations}\n({${names.join(',')}})`,{pose,Float64Array});
const rest=inverse(config.REST,Array.from(config.INITIAL_JOINTS),{iterations:220});
if(!rest.ok)throw Error('Rest pose failed');
const above=(m,h)=>{const x=m.slice();x[14]+=h;return x;};
const facing=Math.atan2(.57,1.04),fs=Math.sin(facing),fc=Math.cos(facing);
const paths=['projects','research','background','beyond'].map((id,i)=>{
 const angle=facing+([-93,-65,-30,10][i])*Math.PI/180;
 const m=new Float64Array([-fs,fc,0,0,-fc,-fs,0,0,0,0,1,0,config.PLAQUE.radius*Math.cos(angle)-fs*config.PLAQUE.offset,config.PLAQUE.radius*Math.sin(angle)+fc*config.PLAQUE.offset,.006+config.PLAQUE.thickness/2,1]);
 console.log(id); const contact=multiply(m,config.ATTACH);
 const approach=prepareJointPath([above(contact,.1),contact],rest.q);
 const raise=prepareJointPath([above(contact,.08),above(contact,.15),config.DISPLAY],approach.end);
 return {id,approach,raise};
});
write('experiments/studio-framing/large-plaque-motion.json',JSON.stringify({rest:rest.q,paths}));

