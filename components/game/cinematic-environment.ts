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

/** Three geometry passes, no framebuffer sampling, textures or post-process.
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
 float veil=smoothstep(.26,.78,c)*smoothstep(-.35,.25,h)*(1.-smoothstep(.2,.85,h));
 vec3 low=mix(vec3(.025,.043,.08),vec3(.045,.023,.078),uLower);
 vec3 high=mix(vec3(.013,.02,.047),vec3(.022,.014,.048),uLower);
 vec3 col=mix(low,high,smoothstep(-.2,.7,h));
 col+=veil*mix(vec3(.06,.13,.18),vec3(.11,.065,.17),uLower);
 float ribbon=exp(-abs(h-.12-sin(p.x*1.4+uTime*.012)*.11)*20.);
 col+=ribbon*c*vec3(.025,.055,.07);
 col+=uFlash*vec3(.075,.13,.19)*smoothstep(-.15,.3,h);
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
 float alpha=(veins*.12+orbit*.055+spokes*.055)*( .6+n*.4)*fade*uOpacity;
 gl_FragColor=vec4(col*(1.+uFlash*.2),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
  const inlay = new THREE.Mesh(new THREE.CircleGeometry(23.5, quality === 'high' ? 96 : 48), floorMaterial);
  inlay.name = 'living-obsidian-shader'; inlay.rotation.x = -Math.PI / 2; inlay.position.y = .034; floor.add(inlay);
  const count = quality === 'high' ? 160 : 64;
  const coordinates = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996323, radius = 4 + (i * 17 % 36);
    coordinates[i * 3] = Math.sin(angle) * radius;
    coordinates[i * 3 + 1] = .5 + (i * 7 % 150) * .1;
    coordinates[i * 3 + 2] = Math.cos(angle) * radius;
  }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; varying float vLight;
void main(){vec3 p=position; p.x+=sin(position.z+uTime*.13)*.15; p.y+=sin(position.x+uTime*.09)*.22;
 vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(35./max(1.,-mv.z),1.,3.); vLight=.25+.2*sin(position.x*3.+uTime*.6);}`,
    fragmentShader: `uniform float uLower; varying float vLight;
void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard;
gl_FragColor=vec4(mix(vec3(.62,.83,.92),vec3(.8,.67,.96),uLower),pow(1.-d*2.,2.)*vLight);}` });
  const dust = new THREE.Points(dustGeometry, dustMaterial); dust.name = 'suspended-aether'; root.add(dust);
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
      dust.visible = state.logos.stage !== 'escaped';
    },
    reset() { time = 0; uniforms.uTime.value = uniforms.uFlash.value = stormLight.intensity = 0; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); inlay.removeFromParent();
      sky.geometry.dispose(); skyMaterial.dispose(); inlay.geometry.dispose(); floorMaterial.dispose(); dustGeometry.dispose(); dustMaterial.dispose();
    },
    stats: () => ({ passes: 3, particles: count, textures: 0, renderTargets: 0, disposed }),
  };
}
