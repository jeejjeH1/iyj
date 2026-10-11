// Renderer, lighting, backdrop, ground, dust and post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { rng } from './util.js';

export const W = 1920, H = 1080;

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0a08');
  scene.fog = new THREE.Fog('#0d0a08', 14, 40);

  const camera = new THREE.PerspectiveCamera(32, W / H, 0.05, 200);
  scene.add(camera);

  // lights
  const hemi = new THREE.HemisphereLight('#f3e3cb', '#2a1d15', 0.75);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0dd', 2.5);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#fff6ea', 3.2);
  rim.position.set(5, 4, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#a07a58', 0.9);
  fill.position.set(6, -1, 4);
  scene.add(fill);
  const glow = new THREE.PointLight('#ffe9cc', 0, 6, 1.6);
  scene.add(glow);

  // backdrop: big radial gradient glued to the camera
  const backMat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uCenter: { value: new THREE.Vector2(0.62, 0.55) },
      uColA: { value: new THREE.Color('#3a2a1e') },
      uColB: { value: new THREE.Color('#0b0806') },
      uRadius: { value: 0.75 },
      uTime: { value: 0 },
      uRing: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform vec2 uCenter; uniform vec3 uColA; uniform vec3 uColB; uniform float uRadius; uniform float uTime; uniform float uRing;
      void main(){
        vec2 p = vUv - uCenter; p.x *= 1.7778;
        float d = length(p);
        float g = smoothstep(uRadius, 0.0, d);
        vec3 c = mix(uColB, uColA, pow(g, 1.6));
        // faint concentric seismic rings
        float rings = sin(d*70.0 - uTime*2.2)*0.5+0.5;
        rings = smoothstep(0.92, 1.0, rings) * smoothstep(1.1, 0.15, d) * uRing;
        c += vec3(0.85,0.72,0.56) * rings * 0.035;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMat);
  back.renderOrder = -10;
  back.frustumCulled = false;
  back.position.z = -150;
  const setBackScale = () => {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 150;
    back.scale.set((h * camera.aspect) / 2 * 1.8, h / 2 * 1.8, 1);
  };
  setBackScale();
  camera.add(back);

  // ground disc with fine grid + seismic rings
  const groundMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 1 }, uPulse: { value: 0 }, uGrid: { value: 1 },
      uCol: { value: new THREE.Color('#e8d3b4') },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vP; uniform float uTime; uniform float uOpacity; uniform float uPulse; uniform float uGrid; uniform vec3 uCol;
      float line(float x, float w){ float f = abs(fract(x)-0.5); return smoothstep(w, 0.0, 0.5-f); }
      void main(){
        float d = length(vP);
        float fade = smoothstep(16.0, 2.0, d);
        float g = max(line(vP.x*0.5, 0.025), line(vP.y*0.5, 0.025)) * 0.10 * uGrid;
        float ring = 0.0;
        for(int i=0;i<3;i++){
          float r = mod(uTime*3.2 + float(i)*5.0, 15.0);
          ring += smoothstep(0.35, 0.0, abs(d - r)) * (1.0 - r/15.0);
        }
        float contact = smoothstep(2.6, 0.0, d) * 0.55;
        vec3 col = uCol * (g + ring * 0.22 * uPulse);
        float a = (g + ring*0.22*uPulse) * fade;
        // darken under the figure
        gl_FragColor = vec4(mix(col, vec3(0.0), contact), max(a, contact*0.8) * uOpacity);
      }`,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = -5;
  scene.add(ground);

  // dust motes: positions animated entirely in the shader from uTime
  const N = 900, r = rng(5);
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * 30;
    pos[i * 3 + 1] = r() * 12 - 1;
    pos[i * 3 + 2] = (r() - 0.5) * 30;
    seed[i] = r();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: 0 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform float uWind; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime*(0.15+aSeed*0.25);
        p.x += sin(t + aSeed*40.0)*0.8 + uWind*uTime*(0.5+aSeed);
        p.y = mod(p.y + uTime*(0.12+aSeed*0.2), 12.0) - 1.0;
        p.z += cos(t*0.8 + aSeed*20.0)*0.8;
        p.x = mod(p.x + 15.0, 30.0) - 15.0;
        p += uCenter;
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_Position = projectionMatrix*mv;
        float tw = 0.55+0.45*sin(uTime*2.0+aSeed*60.0);
        vA = tw * smoothstep(-28.0,-3.0, mv.z) * smoothstep(-0.2, -2.0, mv.z);
        gl_PointSize = (1.2 + aSeed*3.2) * (14.0 / -mv.z) * 3.0;
      }`,
    fragmentShader: `
      uniform float uOpacity; varying float vA;
      void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5,0.0,d);
        gl_FragColor = vec4(vec3(1.0,0.9,0.76)*a, a*vA*uOpacity*0.55); }`,
  });
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // post
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.55, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass(W, H));
  const finalPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 },
      uAberr: { value: 0.0008 }, uGlitch: { value: 0 }, uGrain: { value: 0.045 }, uVig: { value: 0.9 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; uniform float uFlash; uniform float uAberr; uniform float uGlitch; uniform float uGrain; uniform float uVig;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv = vUv;
        // glitch: horizontal slice displacement
        float band = floor(uv.y*28.0 + floor(uTime*24.0)*3.0);
        float gs = step(1.0 - uGlitch*0.45, h(vec2(band, floor(uTime*24.0))));
        uv.x += (h(vec2(band*1.7, floor(uTime*30.0))) - 0.5) * 0.08 * uGlitch * gs;
        vec2 dir = uv - 0.5;
        float ab = uAberr + uGlitch*0.012;
        vec3 c;
        c.r = texture2D(tDiffuse, uv + dir*ab*2.0).r;
        c.g = texture2D(tDiffuse, uv).g;
        c.b = texture2D(tDiffuse, uv - dir*ab*2.0).b;
        // warm grade
        c = pow(c, vec3(0.98, 1.0, 1.04));
        // vignette
        float v = smoothstep(1.15, 0.25, length(dir*vec2(1.0,1.1))*1.25);
        c *= mix(1.0, v, uVig);
        // grain
        float n = h(vUv*vec2(1920.0,1080.0) + fract(uTime*7.31)*100.0) - 0.5;
        c += n * uGrain;
        // scanline during glitch
        c *= 1.0 - uGlitch*0.18*step(0.5, fract(vUv.y*540.0));
        c = mix(c, vec3(1.0,0.97,0.92), uFlash);
        c *= 1.0 - uFade;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(finalPass);

  return {
    renderer, scene, camera, composer, bloom, finalPass, key, rim, fill, hemi, glow,
    backMat, groundMat, ground, dust, dustMat,
    render() { composer.render(); },
  };
}
