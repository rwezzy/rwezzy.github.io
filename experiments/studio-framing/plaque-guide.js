import {guideRows} from './home-fit.mjs?v=52aae983dd';
// A compact reading key for scenes whose physical lettering is too small.
// Aligned controls with horizontal leaders. Lower routes turn upward at the
// plaque, leaving the space beside the buttons clear and orderly.
export function createPlaqueGuide(host, pages, {onSelect,onHover}) {
 const svgNS='http://www.w3.org/2000/svg';
 const guide=document.createElement('div'); guide.className='plaque-guide'; guide.hidden=true;
 guide.setAttribute('role','group'); guide.setAttribute('aria-label','Desk plaques');
 const lines=document.createElementNS(svgNS,'svg'); lines.setAttribute('aria-hidden','true');
 guide.append(lines);
 const entries=pages.map(([id,title])=>{
  const line=document.createElementNS(svgNS,'path'),dot=document.createElementNS(svgNS,'circle');
  dot.setAttribute('r','2'); lines.append(line,dot);
  const button=document.createElement('button'); button.type='button';
  const label=document.createElement('span'); label.textContent=title;
  const arrow=document.createElementNS(svgNS,'svg'); arrow.setAttribute('viewBox','0 0 16 16');
  arrow.setAttribute('aria-hidden','true'); arrow.classList.add('plaque-guide-arrow');
  const mark=document.createElementNS(svgNS,'path'); mark.setAttribute('d','M3 8h10M9 4l4 4-4 4');
  arrow.append(mark); button.append(label,arrow);
  button.setAttribute('aria-label',`Open ${title}`); guide.append(button);
  const highlight=active=>{line.classList.toggle('is-active',active);dot.classList.toggle('is-active',active);onHover(active?id:null);};
  button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')highlight(true);});
  button.addEventListener('pointerleave',()=>highlight(false));
  button.addEventListener('focus',()=>highlight(true)); button.addEventListener('blur',()=>highlight(false));
  button.addEventListener('click',()=>onSelect(id));
  return {button,line,dot};
 });
 host.append(guide);
 let signature='';
 return {
  update(width,height,anchors,visible) {
   const hidden=!visible||width>=1100;
   if(guide.hidden!==hidden)guide.hidden=hidden;
   if(hidden)return;
   const narrow=width<500,left=narrow?8:16,start=left+(narrow?112:132);
   const bottom=anchor=>{
    const [a,b]=anchor.corners,t=narrow ? .65 : .5;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
   };
   const firstFace=anchors[0].corners;
   const requestedFirst=narrow ? Math.min(bottom(anchors[0]).y+28,height-158)
     : (Math.min(...firstFace.map(p=>p.y))+Math.max(...firstFace.map(p=>p.y)))/2;
   // Keep every row equally spaced, with the lower two runs below their plaques.
   const {first,step}=guideRows(requestedFirst,narrow?44:(bottom(anchors[2]).y+12-requestedFirst)/2,height);
   const next=[width,height,first,step,...anchors.flatMap(p=>[p.x.toFixed(1),p.y.toFixed(1)])].join(',');
   if(next===signature)return; signature=next;
   lines.setAttribute('viewBox',`0 0 ${width} ${height}`);
   guide.classList.toggle('plaque-guide-narrow',narrow);
   entries.forEach(({button,line,dot},i)=>{
    const y=first+i*step,anchor=anchors[i];
    button.style.left=left+'px'; button.style.top=(y-18)+'px';
    // Intersect the label's horizontal row with the actual projected face.
    // The first two rows can meet the left edge directly on wider scenes.
    const crossings=[];
    for(let c=0;c<4;c++){
     const a=anchor.corners[c],b=anchor.corners[(c+1)%4];
     if(Math.abs(b.y-a.y)<.001)continue;
     const t=(y-a.y)/(b.y-a.y);
     if(t>=0&&t<=1)crossings.push(a.x+t*(b.x-a.x));
    }
    const edge=crossings.length?Math.min(...crossings):null;
    let target;
    if(!narrow&&i<2&&edge!==null&&edge>=start+6){
     target={x:edge,y};
     line.setAttribute('d',`M ${start} ${y} H ${edge}`);
     line.dataset.route='horizontal';
    }else{
     target=bottom(anchor);
     line.setAttribute('d',`M ${start} ${y} H ${target.x} V ${target.y}`);
     line.dataset.route='bottom';
    }
    dot.setAttribute('cx',target.x);dot.setAttribute('cy',target.y);
   });
  },
  dispose(){guide.remove();}
 };
}
