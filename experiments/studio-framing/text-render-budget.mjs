// Supersample fine desk lettering even on a 1x display. Retain the existing
// total pixel ceiling so large canvases cannot allocate an unbounded buffer.
export function drawingBufferSize(width,height,pixelRatio=1,pixelBudget=1800000){
 const w=Math.max(1,width),h=Math.max(1,height);
 const scale=Math.min(Math.max(1.75,pixelRatio),2,Math.sqrt(pixelBudget/(w*h)));
 return {width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale))};
}
