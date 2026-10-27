import * as THREE from 'three';
import type { GameState } from '../../game/types.ts';

const vertex = `varying vec3 vWorld; varying vec2 vUv;
void main(){ vUv=uv; vWorld=(modelMatrix*vec4(position,1.)).xyz;
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const noise = `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y); }
float cloud(vec2 p){ float n=noise2(p)*.65+noise2(p*2.03)*.25;
#ifdef DETAIL
n+=noise2(p*4.07)*.1;
#endif
return n; }`;

/** Two geometry passes, no framebuffer sampling, textures or post-process.
 * The arena layer follows the real floor through the elevator and collapse. */
export function createCinematicEnvironment(scene: THREE.Scene, floor: THREE.Group, quality: 'low' | 'high') {
  const root = new THREE.Group(); root.name = 'cinematic-environment'; scene.add(root);
  const uniforms = { uTime: { value: 0 }, uLower: { value: 0 }, uFlash: { value: 0 }, uOpacity: { value: 1 } };
  const defines = quality === 'high' ? { DETAIL: 1 } : {};
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: vertex, side: THREE.BackSide, depthWrite: false, fog: false,
    fragmentShader: `varying vec3 vWorld; varying vec2 vUv; uniform float uTime,uLower,uFlash;
${noise}
void main(){
 vec3 dir=normalize(vWorld); float h=dir.y;
 vec2 p=vec2(atan(dir.z,dir.x)*2.,h*4.);
 float c=cloud(p*2.+vec2(uTime*.009,-uTime*.004));
 vec3 col=vec3(.00012,.00014,.00022);
 // Sparse interference contours, separated by near-black negative space.
 float phase=p.x*6.5+h*19.+c*4.+uTime*.035;
 float interference=pow(.5+.5*sin(phase),96.)*pow(c,3.);
 float contour=exp(-abs(h-.08-sin(p.x*1.3+uTime*.007)*.1)*45.);
 col+=interference*vec3(.0012,.0018,.0029)*(1.-smoothstep(.35,.85,h));
 col+=contour*c*mix(vec3(.0007,.0014,.002),vec3(.0014,.0008,.002),uLower);
 col+=uFlash*vec3(.018,.024,.035)*smoothstep(-.15,.3,h);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 16), skyMaterial);
  sky.name = 'storm-vault-shader'; sky.renderOrder = -100; sky.frustumCulled = false; root.add(sky);
  const floorMaterial = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: vertex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    fragmentShader: `varying vec3 vWorld; varying vec2 vUv; uniform float uTime,uLower,uFlash,uOpacity;
${noise}
void main(){
 vec2 p=(vUv-.5)*48.; float r=length(p), a=atan(p.y,p.x);
 float fade=smoothstep(0.,2.,r)*(1.-smoothstep(21.,23.4,r));
 float n=cloud(p*.16+vec2(uTime*.014,-uTime*.009));
 float veins=pow(1.-abs(n*2.-1.),18.);
 float orbit=pow(.5+.5*cos(r*1.05-uTime*.22),36.);
 float spokes=pow(abs(cos(a*12.+r*.035)),90.);
 vec3 col=mix(vec3(.15,.49,.62),vec3(.44,.24,.64),uLower);
 float alpha=(veins*.045+orbit*.018+spokes*.02)*( .6+n*.4)*fade*uOpacity;
 gl_FragColor=vec4(col*(1.+uFlash*.2),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
  const inlay = new THREE.Mesh(new THREE.CircleGeometry(23.5, quality === 'high' ? 96 : 48), floorMaterial);
  inlay.name = 'living-obsidian-shader'; inlay.rotation.x = -Math.PI / 2; inlay.position.y = .034; floor.add(inlay);
  const stormLight = new THREE.DirectionalLight('#a9d7ff', 0); stormLight.name = 'storm-rim-light';
  stormLight.position.set(-22, 24, -32); root.add(stormLight);
  let disposed = false, time = 0;
  return {
    update(dt: number, state: GameState, reducedMotion: boolean, flash = 0, floorOpacity = 1) {
      if (disposed) return;
      if (Number.isFinite(dt) && dt > 0 && !reducedMotion) time += Math.min(dt, .1);
      uniforms.uTime.value = reducedMotion ? 0 : time;
      uniforms.uLower.value = state.encounter === 'logos' ? 1 : 0;
      uniforms.uFlash.value = reducedMotion ? 0 : THREE.MathUtils.clamp(Number.isFinite(flash) ? flash : 0, 0, 1);
      uniforms.uOpacity.value = THREE.MathUtils.clamp(floorOpacity, 0, 1);
      stormLight.intensity = uniforms.uFlash.value * .35;
    },
    reset() { time = 0; uniforms.uTime.value = uniforms.uFlash.value = stormLight.intensity = 0; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); inlay.removeFromParent();
      sky.geometry.dispose(); skyMaterial.dispose(); inlay.geometry.dispose(); floorMaterial.dispose();
    },
    stats: () => ({ passes: 2, particles: 0, textures: 0, renderTargets: 0, disposed }),
  };
}
