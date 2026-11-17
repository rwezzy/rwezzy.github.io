// Rest-view fitting only. The selected-object cameras and robot paths stay intact.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function fitHomeDistance(points,{target,direction,width,height,fov=36,minimum=0,padding={}}) {
 const forward=unit(direction),right=unit(cross([0,1,0],forward)),up=cross(forward,right);
 const tangent=Math.tan(fov*Math.PI/360),aspect=width/height;
 const limits={left:1-2*(padding.left||0)/width,right:1-2*(padding.right||0)/width,
  top:1-2*(padding.top||0)/height,bottom:1-2*(padding.bottom||0)/height};
 if(Object.values(limits).some(v=>v<=0))throw Error('Camera padding leaves no visible scene');
 let distance=minimum;
 const local=points.map(point=>{
  const relative=point.map((value,i)=>value-target[i]);
  const x=dot(relative,right),y=dot(relative,up),z=dot(relative,forward);
  distance=Math.max(distance,z+Math.abs(x)/(tangent*aspect*(x<0?limits.left:limits.right)),
   z+Math.abs(y)/(tangent*(y<0?limits.bottom:limits.top)),z+.02);
  return {x,y,z};
 });
 const pixels=local.map(({x,y,z})=>({x:(1+x/((distance-z)*tangent*aspect))*width/2,y:(1-y/((distance-z)*tangent))*height/2}));
 return {distance,bounds:{left:Math.min(...pixels.map(p=>p.x)),right:Math.max(...pixels.map(p=>p.x)),
  top:Math.min(...pixels.map(p=>p.y)),bottom:Math.max(...pixels.map(p=>p.y))}};
}

// Keep all four buttons equally spaced and wholly inside the annotation layer.
export function guideRows(first,desiredStep,height,count=4) {
 const halfButton=18,padding=24,minFirst=halfButton+padding,maxLast=height-halfButton-padding;
 const step=Math.max(0,Math.min(Math.max(44,Math.min(64,desiredStep)),(maxLast-minFirst)/(count-1)));
 return {first:Math.max(minFirst,Math.min(first,maxLast-step*(count-1))),step};
}
