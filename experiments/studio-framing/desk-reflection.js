import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

// A small planar render target, sampled softly. Uses the scene's existing
// on-demand rendering; it never starts an additional animation loop.
export function createDeskReflection(scene) {
 const size=matchMedia('(max-width:700px)').matches?256:384;
 const shader={uniforms:{tDiffuse:{value:null},color:{value:null},textureMatrix:{value:null},texel:{value:1/size},strength:{value:.075}},
 vertexShader:`uniform mat4 textureMatrix; varying vec4 projected; varying vec2 surface;
 void main(){surface=uv;projected=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float texel;uniform float strength;varying vec4 projected;varying vec2 surface;
 void main(){vec2 uv=projected.xy/projected.w;vec2 d=vec2(texel*2.6); 
 vec4 c=texture2D(tDiffuse,uv)*.4;
 c+=texture2D(tDiffuse,uv+vec2(d.x,0.))*.15;
 c+=texture2D(tDiffuse,uv-vec2(d.x,0.))*.15;
 c+=texture2D(tDiffuse,uv+vec2(0.,d.y))*.15;
 c+=texture2D(tDiffuse,uv-vec2(0.,d.y))*.15;
 float edge=smoothstep(0.,.18,min(min(surface.x,1.-surface.x),min(surface.y,1.-surface.y)));
 float falloff=smoothstep(.24,.52,surface.y);
 gl_FragColor=vec4(c.rgb,strength*c.a*edge*falloff);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`};
 const floor=new Reflector(new THREE.PlaneGeometry(3.4,3.4),{textureWidth:size,textureHeight:size,multisample:0,clipBias:.003,shader});
 floor.name='Dark satin reflection';floor.rotation.x=-Math.PI/2;floor.position.y=-.001;
 floor.material.transparent=true;floor.material.depthWrite=false;floor.renderOrder=-2;
 scene.add(floor);
 return {update(dark){floor.visible=true;floor.material.uniforms.strength.value=dark?.075:.085;},dispose(){floor.removeFromParent();floor.geometry.dispose();floor.dispose();}};
}
