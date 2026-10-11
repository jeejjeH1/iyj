// Timeline for "What are TEEs, and why are they important for Seismic?"
// Everything on screen is a pure function of t (seconds) so frames can be rendered deterministically.
import * as THREE from 'three';
import { createStage, W, H } from './stage.js';
import { buildGolem, assembleGolem, emblemTexture } from './golem.js';
import { buildLogo, assembleLogo, logoSVG } from './logo.js';
import { makeRock, rockGeometry, INK, STONE } from './rock.js';
import { text, block, el, updateOverlay, morphText } from './overlay.js';
import { PAL, ease, seg, env, clamp, lerp, rng } from './util.js';

export const DURATION = 90;
export const CUTS = [0, 6.5, 13.5, 21.5, 31, 39.5, 48, 56.5, 63.5, 71, 78, 84.5, 90];
const [T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11] = CUTS;

const S = createStage(document.getElementById('c'));
const { scene, camera } = S;
const ov = document.getElementById('ov');

// ---------------------------------------------------------------- helpers
const _v = new THREE.Vector3();
let dirty = true;
function project(v) {
  if (dirty) { scene.updateMatrixWorld(true); dirty = false; }
  _v.copy(v).project(camera);
  return { x: (_v.x + 1) * 0.5 * W, y: (1 - _v.y) * 0.5 * H, behind: _v.z > 1 };
}
function place(e, v, dx = 0, dy = 0) {
  const p = project(v);
  e.style.left = (p.x + dx).toFixed(1) + 'px';
  e.style.top = (p.y + dy).toFixed(1) + 'px';
  return p;
}
const noise = (t, s) => Math.sin(t * 13.1 + s) * 0.5 + Math.sin(t * 23.7 + s * 2.3) * 0.3 + Math.sin(t * 41.3 + s * 5.1) * 0.2;
function setCam(pos, look, t, shake = 0, roll = 0, shift = 0, shiftY = 0) {
  if (shift || shiftY) camera.setViewOffset(W, H, -shift, shiftY, W, H);
  else camera.clearViewOffset();
  camera.position.copy(pos);
  if (shake > 0) camera.position.add(new THREE.Vector3(noise(t, 1), noise(t, 2), noise(t, 3)).multiplyScalar(shake));
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const vlerp = (a, b, k) => a.clone().lerp(b, k);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,248,236,1)');
  gr.addColorStop(0.25, 'rgba(255,236,210,0.55)');
  gr.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTexture();
const sprite = (scale, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(scale);
  return s;
};
const EMBLEM = emblemTexture(512);
const emblemPlane = (size, color = 1) => {
  const m = new THREE.MeshBasicMaterial({ map: EMBLEM, transparent: true, toneMapped: false, depthWrite: false });
  m.color.setScalar(color);
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
};
const creamLine = (opacity) => new THREE.LineBasicMaterial({ color: PAL.cream, transparent: true, opacity });

// ---------------------------------------------------------------- 3D sets
const sets = {};
const addSet = (name) => { const g = new THREE.Group(); g.visible = false; scene.add(g); sets[name] = g; return g; };

// logo
const L = buildLogo({ height: 2.4 });
addSet('logo').add(L.group);
const logoHalo = sprite(7, 0.0);
logoHalo.position.z = -1.2;
sets.logo.add(logoHalo);

// golem
const G = buildGolem();
addSet('golem').add(G.root);
const blob = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.55, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.01;
sets.golem.add(blob);

// public chain of glass blocks
const chain = addSet('chain');
const chainBlocks = [];
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  const geo = rockGeometry(1.45, 1.45, 1.45, { bevel: 0.14, jitter: 0, seed: 200 + i, palette: ['#efe2cc'] });
  const glass = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#efe2cc', transparent: true, opacity: 0.08, roughness: 0.25, metalness: 0.2, depthWrite: false, flatShading: true }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), creamLine(0.75));
  g.add(glass, edges);
  const r = rng(300 + i);
  for (let k = 0; k < 4; k++) {
    const len = 0.35 + r() * 0.55;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cream).multiplyScalar(1.6), toneMapped: false }));
    bar.position.set(-0.5 + len / 2 + r() * 0.2, -0.4 + k * 0.27, (r() - 0.5) * 0.5);
    g.add(bar);
  }
  g.position.set(i * 2.6 - 8, 0, 0);
  chain.add(g);
  chainBlocks.push(g);
  if (i > 0) {
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), new THREE.MeshBasicMaterial({ color: PAL.tan, transparent: true, opacity: 0.6 }));
    link.rotation.z = Math.PI / 2;
    link.position.set(i * 2.6 - 8 - 1.3, 0, 0);
    chain.add(link);
  }
}

// nested isolation layers + core + shield
const nested = addSet('nested');
const layers = [];
[[4.6, 0.8], [3.45, 0.8], [2.4, 0.8]].forEach(([s, hk], i) => {
  const geo = rockGeometry(s, s * hk, s, { bevel: 0.12, jitter: 0, seed: 90 + i, palette: ['#c9a882'] });
  const lineMat = creamLine(0.3);
  const fillMat = new THREE.MeshBasicMaterial({ color: PAL.tan, transparent: true, opacity: 0.025, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, fillMat), new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), lineMat));
  nested.add(g);
  layers.push({ g, lineMat, fillMat, corner: V3(-s / 2, s * hk * 0.5, s / 2) });
});
const core = makeRock(1.2, 1.2, 1.2, { palette: INK, bevel: 0.3, seed: 99, jitter: 0.02 });
nested.add(core);
const coreEmblems = [];
for (let k = 0; k < 4; k++) {
  const p = emblemPlane(0.78, 1.5);
  const a = (k * Math.PI) / 2;
  p.position.set(Math.sin(a) * 0.61, 0, Math.cos(a) * 0.61);
  p.rotation.y = a;
  core.add(p);
  coreEmblems.push(p.material);
}
const coreGlow = sprite(3.2, 0.5);
nested.add(coreGlow);
// shield: icosahedron with per-face crack displacement
const shieldGeo = new THREE.IcosahedronGeometry(1.32, 1);
{
  const n = shieldGeo.attributes.position.count;
  const rnd = new Float32Array(n), fc = new Float32Array(n * 3);
  const r = rng(11);
  const p = shieldGeo.attributes.position;
  for (let i = 0; i < n; i += 3) {
    const v = r();
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    for (let k = 0; k < 3; k++) { rnd[i + k] = v; fc[(i + k) * 3] = cx; fc[(i + k) * 3 + 1] = cy; fc[(i + k) * 3 + 2] = cz; }
  }
  shieldGeo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  shieldGeo.setAttribute('aCenter', new THREE.BufferAttribute(fc, 3));
}
const shieldMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uI: { value: 0.6 }, uCrack: { value: 0 }, uTime: { value: 0 }, uHit: { value: 0 } },
  vertexShader: `
    attribute float aRnd; attribute vec3 aCenter; uniform float uCrack; uniform float uTime;
    varying vec3 vN; varying vec3 vV; varying float vR;
    void main(){
      vec3 p = position;
      vec3 dir = normalize(aCenter);
      float j = uCrack * (0.25 + aRnd*0.9) * (0.7 + 0.3*sin(uTime*30.0 + aRnd*50.0));
      p += dir * j * 0.55;
      vN = normalize(normalMatrix * dir);
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      vV = normalize(-mv.xyz); vR = aRnd;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uI; uniform float uHit; varying vec3 vN; varying vec3 vV; varying float vR;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
      vec3 c = vec3(0.94,0.86,0.74) * (f*0.9 + 0.06 + uHit*0.35*(0.5+vR));
      gl_FragColor = vec4(c * uI, 1.0);
    }`,
});
const shield = new THREE.Mesh(shieldGeo, shieldMat);
nested.add(shield);
const shieldWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.32, 1)), creamLine(0.22));
nested.add(shieldWire);
const probes = [];
{
  const r = rng(404);
  for (let i = 0; i < 16; i++) {
    const dir = V3(r() - 0.5, (r() - 0.5) * 0.8, r() - 0.5).normalize();
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cream).multiplyScalar(2.5), toneMapped: false }));
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    const spark = sprite(0.9, 0);
    nested.add(m, trail, spark);
    probes.push({ m, trail, spark, dir, off: r(), speed: 0.55 + r() * 0.35 });
  }
}

// transaction path into an Intel TDX node
const tx = addSet('tx');
const txNode = makeRock(1.9, 1.9, 1.9, { palette: INK, bevel: 0.22, seed: 120, jitter: 0.03 });
txNode.position.set(3.3, 0.2, 0);
txNode.rotation.y = -0.2;
tx.add(txNode);
const txEmblem = emblemPlane(1.65, 1);
txEmblem.position.set(0, 0, 1.04);
txNode.add(txEmblem);
const txShellGeo = rockGeometry(2.9, 2.9, 2.9, { bevel: 0.16, jitter: 0, seed: 121, palette: ['#c9a882'] });
const txShellMat = creamLine(0.3);
const txShell = new THREE.LineSegments(new THREE.EdgesGeometry(txShellGeo, 10), txShellMat);
txShell.position.copy(txNode.position);
tx.add(txShell);
const txGlow = sprite(4.5, 0);
txGlow.position.copy(txNode.position);
tx.add(txGlow);
const txCurve = new THREE.CatmullRomCurve3([V3(-6.5, -0.6, 0.6), V3(-3.6, 0.9, 0.2), V3(-0.6, -0.5, 0.5), V3(1.4, 0.35, 0.4), V3(2.4, 0.2, 0.3)]);
const txLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(txCurve.getPoints(240)), new THREE.LineDashedMaterial({ color: PAL.tan, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.6 }));
txLine.computeLineDistances();
tx.add(txLine);
const txSrc = makeRock(0.55, 0.55, 0.55, { seed: 130, bevel: 0.35, palette: ['#d9c3a2', '#c9a882', '#b79671'] });
txSrc.position.copy(txCurve.getPoint(0));
tx.add(txSrc);
const packet = new THREE.Group();
const packetCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cream).multiplyScalar(3), toneMapped: false }));
packet.add(packetCore, sprite(1.3, 0.8));
tx.add(packet);
const ghosts = [];
for (let i = 0; i < 10; i++) {
  const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * (1 - i / 12)), new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0.5 * (1 - i / 10), blending: THREE.AdditiveBlending, depthWrite: false }));
  tx.add(gm);
  ghosts.push(gm);
}

// storage tiles that flip to their shielded side
const tiles = addSet('tiles');
const tileList = [];
{
  const COLS = 7, ROWS = 4, S_ = 0.9, GAP = 0.14;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const g = new THREE.Group();
    const top = makeRock(S_, 0.07, S_, { seed: 500 + c * 10 + r, bevel: 0.3, jitter: 0, palette: ['#c9b08e', '#b89a78', '#a8835f'], outline: true });
    top.position.y = 0.035;
    const bot = makeRock(S_, 0.07, S_, { seed: 600 + c * 10 + r, bevel: 0.3, jitter: 0, palette: INK });
    bot.position.y = -0.035;
    const em = emblemPlane(0.62, 0.9);
    em.rotation.x = Math.PI / 2;
    em.position.y = -0.075;
    g.add(top, bot, em);
    g.position.set((c - (COLS - 1) / 2) * (S_ + GAP), 0, (r - (ROWS - 1) / 2) * (S_ + GAP));
    tiles.add(g);
    tileList.push({ g, c, r, em: em.material });
  }
}

// attestation: ring of nodes around the golem
const nodes = addSet('nodes');
const nodeList = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.3;
  const g = new THREE.Group();
  const rock = makeRock(0.95, 0.95, 0.95, { seed: 700 + i, bevel: 0.3, palette: INK, jitter: 0.03 });
  rock.position.y = 0.5;
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(rockGeometry(1.35, 1.35, 1.35, { bevel: 0.15, jitter: 0, seed: 710 + i, palette: ['#fff'] }), 10), creamLine(0));
  wire.position.y = 0.5;
  const ringM = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.86, 48), new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ringM.rotation.x = -Math.PI / 2;
  ringM.position.y = 0.02;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 6, 1, true), new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 2.3;
  const em = emblemPlane(0.5, 0);
  em.position.set(0, 0.5, 0.49);
  g.add(rock, wire, ringM, beam, em);
  g.position.set(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4);
  g.lookAt(0, 0, 0);
  g.rotateY(Math.PI);
  nodes.add(g);
  nodeList.push({ g, rock, wire, ringM, beam, em, a, rogue: i === 3 });
}
const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cream).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
scanRing.rotation.x = -Math.PI / 2;
scanRing.position.y = 0.04;
nodes.add(scanRing);

// faceted coins
const coins = addSet('coins');
const coinList = [];
{
  const coinMat = new THREE.MeshStandardMaterial({ color: '#c9a882', metalness: 0.55, roughness: 0.36, flatShading: true });
  const coinMat2 = new THREE.MeshStandardMaterial({ color: '#d8c4a4', metalness: 0.2, roughness: 0.6, flatShading: true });
  const coinMat3 = new THREE.MeshStandardMaterial({ color: '#7a5c45', metalness: 0.5, roughness: 0.4, flatShading: true });
  const r = rng(808);
  for (let i = 0; i < 16; i++) {
    const big = i === 0;
    const R = big ? 1.5 : 0.35 + r() * 0.45;
    const geo = new THREE.CylinderGeometry(R, R, R * 0.17, 10, 1);
    const m = new THREE.Mesh(geo, [coinMat, coinMat2, coinMat3][big ? 0 : Math.floor(r() * 3)]);
    const g = new THREE.Group();
    g.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), new THREE.LineBasicMaterial({ color: '#16110d', transparent: true, opacity: 0.5 })));
    if (big) {
      for (const s of [1, -1]) {
        const em = emblemPlane(R * 1.3, 1);
        em.material.color.set('#2a1e16');
        em.material.toneMapped = true;
        em.rotation.x = -s * Math.PI / 2;
        em.position.y = s * (R * 0.085 + 0.004);
        g.add(em);
      }
    }
    const pos = big ? V3(3.4, 0.4, 0) : V3(1.2 + r() * 7.5, -2.6 + r() * 6, -7 + r() * 5.5);
    g.position.copy(pos);
    coins.add(g);
    coinList.push({ g, base: pos.clone(), sp: V3((r() - 0.5) * 1.4, (r() - 0.5) * 1.4, (r() - 0.5) * 1.4), ph: r() * 6, big });
  }
}

// ---------------------------------------------------------------- overlay: HUD
const hud = el('div', '', '', {}, ov);
hud.id = 'hud';
const corners = [[44, 44, 'top', 'left'], [44, 44, 'top', 'right'], [44, 44, 'bottom', 'left'], [44, 44, 'bottom', 'right']];
for (const [a, b, v, h] of corners) {
  const c = el('div', 'corner', '', { [v]: a + 'px', [h]: b + 'px', ['border' + v[0].toUpperCase() + v.slice(1) + 'Width']: '1.5px', ['border' + h[0].toUpperCase() + h.slice(1) + 'Width']: '1.5px' }, hud);
}
const hudTL = el('div', 'hud-t', `<span style="display:inline-block;vertical-align:middle;margin-right:12px;transform:translateY(-2px)">${logoSVG(30)}</span>SEISMIC <span style="opacity:.45">/ TEE EXPLAINED</span>`, { left: '86px', top: '66px' }, hud);
const hudTR = el('div', 'hud-t', '', { right: '86px', top: '74px', textAlign: 'right' }, hud);
const hudTC = el('div', 'hud-t', '', { left: '86px', bottom: '62px', fontSize: '13px' }, hud);
const hudBR = el('div', 'hud-t', 'CONFIDENTIAL · EVM-COMPATIBLE', { right: '86px', bottom: '62px', fontSize: '13px' }, hud);
const prog = el('div', '', '<i></i>', {}, hud);
prog.id = 'prog';
for (const c of CUTS.slice(1, -2)) el('s', '', '', { left: (c / DURATION) * 100 + '%' }, prog);
const progBar = prog.querySelector('i');
const SECTION = ['', 'THE PROBLEM', "SEISMIC'S APPROACH", 'WHAT IS A TEE', '01 · TRANSACTION DATA', '02 · EXECUTION', '03 · OPERATORS', '04 · FINANCE', 'LIMITATIONS', 'THE BIGGER PICTURE', 'OUTRO', ''];

const flare = el('div', 'flare', '', { top: '540px', opacity: 0 }, ov);

// ---------------------------------------------------------------- overlay: scene copy
const at = (base) => (x) => base + x;

// S0 intro
{
  const a = at(T0);
  text('Seismic  ·  confidential computing 101', 'kicker', { left: '0', right: '0', top: '650px', textAlign: 'center' }, { in: a(2.9), out: T1 - 0.15, kind: 'scramble', stagger: 0.02, dur: 0.35 });
  text('What are [[Trusted Execution]]\n[[Environments]]?', 'h1', { left: '0', right: '0', top: '702px', textAlign: 'center', fontSize: '86px' }, { in: a(3.15), out: T1 - 0.1, stagger: 0.016 });
  text('— and why are they important for Seismic?', 'body', { left: '0', right: '0', top: '905px', textAlign: 'center', color: '#c9a882' }, { in: a(4.2), out: T1 - 0.1, kind: 'fade', dur: 0.8 });
}

// S1 problem
const chainCards = [];
{
  const a = at(T1);
  text('The problem', 'kicker', { left: '120px', top: '150px' }, { in: a(0.2), out: T2 - 0.1, kind: 'scramble', dur: 0.3 });
  text('One of the biggest challenges in blockchain is', 'h3', { left: '120px', top: '196px', fontSize: '42px', color: 'rgba(239,226,204,.85)' }, { in: a(0.35), out: T2 - 0.1, stagger: 0.012 });
  text('{{PRIVACY.}}', 'h1', { left: '112px', top: '252px', fontSize: '190px', fontWeight: 900, letterSpacing: '-0.05em' }, { in: a(1.0), out: T2 - 0.1, stagger: 0.06, dur: 0.7, dy: 0.3, blur: 18 });
  text('On public blockchains, transaction data and smart-contract interactions can expose [[sensitive financial information]].', 'body', { left: '120px', top: '860px', width: '1180px' }, { in: a(2.6), out: a(5.0), kind: 'rise', stagger: 0.006, dur: 0.5, blur: 6 });
  text('That limits businesses and financial apps that [[need confidentiality]].', 'body', { left: '120px', top: '860px', width: '1180px', fontSize: '36px', color: '#efe2cc' }, { in: a(5.15), out: T2 - 0.1, kind: 'rise', stagger: 0.008, dur: 0.5, blur: 6 });
  const data = [
    ['FROM', '0x7a3f…9e21', 'TO', '0x91cd…04be'],
    ['AMOUNT', '2,450,000 USDC', 'STATUS', 'PUBLIC'],
    ['POSITION', 'LONG 40× ETH', 'OWNER', '0x5be0…a771'],
    ['PAYROLL', '12,800 USDC', 'TO', 'employee.eth'],
    ['BALANCE', '9,214,330 USDC', 'WALLET', '0x0c4e…37fd'],
    ['INVOICE', '#2291 · 84,000', 'VENDOR', '0x3a90…bb12'],
    ['SWAP', '1,200 ETH → USDC', 'SLIPPAGE', '0.4%'],
    ['LOAN', '5,000,000 USDC', 'COLLATERAL', '0x88f1…0d2c'],
  ];
  data.forEach((d, i) => {
    const e = el('div', 'datacard', `<b>${d[0]}</b>${d[1]}<br><b>${d[2]}</b>${d[3]}`, {}, ov);
    chainCards.push(e);
  });
}

// S2 golem / TEE
{
  const a = at(T2);
  text("Seismic's approach", 'kicker', { left: '120px', top: '262px' }, { in: a(3.1), out: T3 - 0.1, kind: 'scramble', dur: 0.3 });
  text('Trusted\nExecution\n[[Environments]]', 'h1', { left: '116px', top: '312px', fontSize: '108px', lineHeight: '0.97' }, { in: a(3.3), out: T3 - 0.1, stagger: 0.025, dur: 0.7 });
  const tag = el('div', 'chip', '<i></i>TEE', { left: '120px', top: '680px' }, ov);
  block(tag, { in: a(4.2), out: T3 - 0.1, dx: -20, dy: 0 });
  text('Seismic approaches the privacy problem using TEEs.', 'body', { left: '120px', top: '770px', width: '820px' }, { in: a(4.7), out: T3 - 0.1, stagger: 0.008, dur: 0.5, blur: 6 });
  text('But how does this technology work?', 'body', { left: '120px', top: '826px', width: '820px', color: '#c9a882', fontStyle: 'italic' }, { in: a(6.0), out: T3 - 0.1, stagger: 0.012, dur: 0.5, blur: 6 });
}

// S3 what is a TEE
const layerLabels = [];
{
  const a = at(T3);
  text('What is a TEE?', 'kicker', { left: '120px', top: '230px' }, { in: a(0.2), out: a(5.3), kind: 'scramble', dur: 0.3 });
  text('A [[protected]] computing\nenvironment', 'h2', { left: '116px', top: '276px', fontSize: '78px' }, { in: a(0.35), out: a(5.3), stagger: 0.018 });
  text('designed to isolate code and data from:', 'body', { left: '120px', top: '470px' }, { in: a(1.1), out: a(5.3), stagger: 0.008, dur: 0.5, blur: 6 });
  const items = ['The operating system', 'The hypervisor', 'The infrastructure operator'];
  items.forEach((s, i) => {
    const e = el('div', 'warn', `<em style="width:56px">0${i + 1}</em>${s}`, { left: '120px', top: 548 + i * 70 + 'px', fontSize: '40px' }, ov);
    block(e, { in: a(1.8 + i * 0.5), out: a(5.3), dx: -40, dy: 0, blur: 6 });
  });
  text('Think of it as a\n[[secure workspace]]\ninside a computer.', 'h1', { left: '116px', top: '300px', fontSize: '96px' }, { in: a(5.5), out: a(7.7), stagger: 0.018 });
  text('Even if someone controls the machine running the app,', 'h3', { left: '120px', top: '330px', width: '900px', fontSize: '50px', color: 'rgba(239,226,204,.8)' }, { in: a(7.85), out: T4 - 0.1, stagger: 0.01 });
  text('the hardware is designed to block [[direct access]] to the protected data inside.', 'h3', { left: '120px', top: '470px', width: '900px', fontSize: '50px' }, { in: a(8.35), out: T4 - 0.1, stagger: 0.01 });
  ['Infrastructure operator', 'Hypervisor', 'Operating system', 'TEE · protected'].forEach((s, i) => {
    const e = el('div', 'label', `<span class="dot"></span>${s}`, {}, ov);
    layerLabels.push(e);
  });
}

// S4 01 transaction data
const txUI = {};
{
  const a = at(T4);
  text('01', 'num', { left: '96px', top: '120px' }, { in: a(0.1), out: T5 - 0.1, stagger: 0.08, dur: 0.8, dy: 0.2 });
  text('Protecting sensitive transaction data', 'kicker', { left: '120px', top: '345px' }, { in: a(0.3), out: T5 - 0.1, kind: 'scramble', stagger: 0.012, dur: 0.3 });
  text('Encrypted before it\nreaches the network', 'h2', { left: '116px', top: '392px', fontSize: '66px' }, { in: a(0.5), out: T5 - 0.1, stagger: 0.014 });
  const card = el('div', 'card', `<div class="bar"></div><div style="padding:20px 26px 22px">
      <div class="label" style="position:relative;color:#a8835f;font-size:15px" id="txHead">TX · CREATED BY USER</div>
      <div class="mono" id="txL1" style="font-size:27px;margin-top:12px;white-space:pre">send 50,000 USDC</div>
      <div class="mono" id="txL2" style="font-size:27px;white-space:pre">to   0x91cd…04be</div></div>`, { left: '120px', top: '600px', width: '470px' }, ov);
  block(card, { in: a(0.9), out: T5 - 0.1, dy: 30 });
  txUI.head = card.querySelector('#txHead');
  txUI.l1 = card.querySelector('#txL1');
  txUI.l2 = card.querySelector('#txL2');
  txUI.net = el('div', 'label', '<span class="dot"></span>Network observer<br><span style="color:#a8835f;letter-spacing:.05em" id="netSee">sees ▓▓▓▓▓▓▓▓▓▓▓</span>', { lineHeight: '1.7' }, ov);
  txUI.netItem = block(txUI.net, { in: a(3.2), out: T5 - 0.1, dy: 16 });
  txUI.nodeL = el('div', 'label', '<span class="dot"></span>Node · inside the TEE<br><span style="color:#a8835f">Intel TDX</span>', { lineHeight: '1.7' }, ov);
  block(txUI.nodeL, { in: a(1.4), out: T5 - 0.1, dy: 16 });
  txUI.exec = el('div', 'card', `<div style="padding:16px 22px"><div class="label" style="position:relative;font-size:14px;color:#a8835f" id="exHead">DECRYPTING INSIDE TEE…</div><div class="mono" id="exL" style="font-size:22px;margin-top:8px;white-space:pre">a9f2·c81e·77b0·3d5e</div></div>`, { width: '400px' }, ov);
  block(txUI.exec, { in: a(5.0), out: T5 - 0.1, dy: 20 });
  txUI.exHead = txUI.exec.querySelector('#exHead');
  txUI.exL = txUI.exec.querySelector('#exL');
  txUI.op = el('div', 'badge bad', 'NODE OPERATOR ✕ NO PLAINTEXT', {}, ov);
  block(txUI.op, { in: a(6.3), out: T5 - 0.1, dy: 14 });
  text('Seismic runs its nodes inside [[Intel TDX]] — sensitive input is decrypted and executed only inside the TEE.', 'body', { left: '120px', top: '890px', width: '1300px', fontSize: '29px' }, { in: a(5.6), out: T5 - 0.1, stagger: 0.005, dur: 0.5, blur: 6 });
}

// S5 02 execution
const stor = {};
{
  const a = at(T5);
  text('02', 'num', { left: '96px', top: '120px' }, { in: a(0.1), out: T6 - 0.1, stagger: 0.08, dur: 0.8, dy: 0.2 });
  text('Confidential during execution', 'kicker', { left: '120px', top: '345px' }, { in: a(0.3), out: T6 - 0.1, kind: 'scramble', stagger: 0.012, dur: 0.3 });
  text('Protected while it\'s\n[[being processed]]', 'h2', { left: '116px', top: '392px', fontSize: '66px' }, { in: a(0.5), out: T6 - 0.1, stagger: 0.014 });
  text('Privacy isn\'t just about encrypting data in transit. Data also needs protection when a smart contract processes it.', 'body', { left: '120px', top: '560px', width: '760px', fontSize: '29px' }, { in: a(1.2), out: T6 - 0.1, stagger: 0.004, dur: 0.5, blur: 6 });
  ['TEE-based execution', 'Shielded storage', 'Privacy-aware Solidity types'].forEach((s, i) => {
    const c = el('div', 'chip', `<i></i>${s}`, { left: '120px', top: 760 + i * 74 + 'px' }, ov);
    block(c, { in: a(3.0 + i * 0.3), out: T6 - 0.1, dx: -30, dy: 0 });
  });
  const code = [
    '<span class="k">contract</span> ConfidentialVault {',
    '  <span class="s">suint256</span> balance;   <span class="cm">// shielded</span>',
    '  <span class="s">saddress</span> owner;     <span class="cm">// shielded</span>',
    '',
    '  <span class="k">function</span> deposit(<span class="s">suint256</span> amt) {',
    '    balance += amt;',
    '  }',
    '}',
  ];
  const cc = el('div', 'card', `<div class="bar"></div><div style="padding:14px 28px 4px" class="label"><span style="color:#a8835f;font-size:14px;position:relative">VAULT.SOL · SEISMIC SOLIDITY</span></div>`, { left: '1010px', top: '430px', width: '790px', height: '390px' }, ov);
  block(cc, { in: a(1.6), out: T6 - 0.1, dy: 30 });
  code.forEach((ln, i) => {
    const e = el('div', 'code', ln || ' ', { left: '1040px', top: 478 + i * 40 + 'px' }, ov);
    block(e, { in: a(2.0 + i * 0.12), out: T6 - 0.1, kind: 'wipe', dy: 0, dur: 0.45 });
  });
  stor.card = el('div', 'card', `<div style="padding:16px 26px" class="mono"><div class="label" style="position:relative;font-size:14px;color:#a8835f">STORAGE · AS SEEN FROM OUTSIDE</div>
    <div style="font-size:22px;margin-top:10px;white-space:pre">balance → <span id="sv1">1,250,000</span></div>
    <div style="font-size:22px;white-space:pre">owner   → <span id="sv2">0x7a3f…9e21</span></div></div>`, { left: '1010px', top: '838px', width: '790px' }, ov);
  block(stor.card, { in: a(3.6), out: T6 - 0.1, dy: 20 });
  stor.v1 = stor.card.querySelector('#sv1');
  stor.v2 = stor.card.querySelector('#sv2');
}

// S6 03 operators
const nodeBadges = [];
{
  const a = at(T6);
  text('03', 'num', { left: '96px', top: '120px' }, { in: a(0.1), out: T7 - 0.1, stagger: 0.08, dur: 0.8, dy: 0.2 });
  text('Reducing trust in node operators', 'kicker', { left: '120px', top: '345px' }, { in: a(0.3), out: T7 - 0.1, kind: 'scramble', stagger: 0.012, dur: 0.3 });
  text('Don\'t trust the operator.\n[[Verify the hardware.]]', 'h2', { left: '116px', top: '392px', fontSize: '64px' }, { in: a(0.5), out: T7 - 0.1, stagger: 0.012 });
  text('Normally, a server admin can have extensive access to the machine running an app.', 'body', { left: '120px', top: '560px', width: '700px', fontSize: '29px' }, { in: a(1.2), out: a(3.3), stagger: 0.004, dur: 0.5, blur: 6 });
  text('With Seismic, [[hardware isolation]] + [[remote attestation]] help prove nodes run approved software in genuine protected environments.', 'body', { left: '120px', top: '560px', width: '700px', fontSize: '29px' }, { in: a(3.4), out: T7 - 0.1, stagger: 0.004, dur: 0.5, blur: 6 });
  text('→ Harder for an operator to inspect sensitive data or deploy unauthorized code.', 'body', { left: '120px', top: '790px', width: '700px', fontSize: '29px', color: '#efe2cc' }, { in: a(5.6), out: T7 - 0.1, stagger: 0.006, dur: 0.5, blur: 6 });
  nodeList.forEach((n) => {
    const b = el('div', n.rogue ? 'badge bad' : 'badge ok', n.rogue ? '✕ UNAPPROVED CODE' : '✓ ATTESTED', {}, ov);
    nodeBadges.push(b);
  });
}

// S7 04 finance
{
  const a = at(T7);
  text('04', 'num', { left: '96px', top: '120px' }, { in: a(0.1), out: T8 - 0.1, stagger: 0.08, dur: 0.8, dy: 0.2 });
  text('Confidential financial applications', 'kicker', { left: '120px', top: '345px' }, { in: a(0.3), out: T8 - 0.1, kind: 'scramble', stagger: 0.012, dur: 0.3 });
  text('Where privacy is\n[[essential]]', 'h2', { left: '116px', top: '392px', fontSize: '66px' }, { in: a(0.5), out: T8 - 0.1, stagger: 0.014 });
  const icons = [
    '<svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="#c9a882" stroke-width="2.4"><path d="M8 20h34M34 12l8 8-8 8"/><path d="M46 34H12M20 26l-8 8 8 8"/></svg>',
    '<svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="#c9a882" stroke-width="2.4"><path d="M8 44h38"/><path d="M12 36l9-10 8 6 13-16"/><rect x="30" y="8" width="16" height="12" rx="2"/><path d="M34 8V5h8v3"/></svg>',
    '<svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="#c9a882" stroke-width="2.4"><rect x="7" y="16" width="40" height="28" rx="4"/><path d="M20 16v-5h14v5M7 28h40"/><circle cx="27" cy="28" r="3"/></svg>',
  ];
  const titles = ['Confidential stablecoin transfers', 'Private financial positions', 'Business payments'];
  const subs = ['Amounts & counterparties kept confidential', 'Exposure not broadcast to the market', 'Payroll & vendor flows, out of public view'];
  titles.forEach((s, i) => {
    const c = el('div', 'card', `<div class="bar"></div><div style="padding:26px 30px">${icons[i]}<div style="font-family:IDisp;font-weight:700;font-size:33px;line-height:1.1;margin-top:16px;letter-spacing:-0.01em">${s}</div><div style="font-size:21px;margin-top:12px;color:rgba(239,226,204,.6);font-family:IDisp">${subs[i]}</div></div>`, { left: 120 + i * 470 + 'px', top: '590px', width: '440px', height: '270px' }, ov);
    block(c, { in: a(1.3 + i * 0.28), out: T8 - 0.1, dy: 60, scale: 0.94 });
  });
  text('For financial institutions and businesses, protecting transaction details can be [[an important requirement]].', 'body', { left: '120px', top: '900px', width: '1400px', fontSize: '29px' }, { in: a(3.4), out: T8 - 0.1, stagger: 0.005, dur: 0.5, blur: 6 });
}

// S8 limitations
{
  const a = at(T8);
  text('However', 'kicker', { left: '120px', top: '235px' }, { in: a(0.2), out: T9 - 0.1, kind: 'scramble', dur: 0.3 });
  text('TEEs are not a perfect\n[[security solution.]]', 'h2', { left: '116px', top: '282px', fontSize: '76px' }, { in: a(0.35), out: T9 - 0.1, stagger: 0.014 });
  ['Hardware vulnerabilities', 'Side-channel attacks', 'Software bugs', 'Public metadata may remain visible'].forEach((s, i) => {
    const e = el('div', 'warn', `<em>RISK·0${i + 1}</em>${s}`, { left: '120px', top: 488 + i * 72 + 'px' }, ov);
    block(e, { in: a(1.4 + i * 0.4), out: T9 - 0.1, dx: -40, dy: 0, blur: 8 });
  });
  const c = el('div', 'card', `<div class="bar"></div><div style="padding:22px 30px;font-family:IDisp;font-weight:600;font-size:36px;line-height:1.2">Security depends on more than <span class="acc">hardware isolation alone.</span></div>`, { left: '120px', top: '810px', width: '900px' }, ov);
  block(c, { in: a(4.5), out: T9 - 0.1, dy: 30 });
}

// S9 bigger picture
const bigLabels = [];
{
  const a = at(T9);
  text('The bigger picture', 'kicker', { left: '0', right: '0', top: '120px', textAlign: 'center' }, { in: a(0.2), out: T10 - 0.1, kind: 'scramble', dur: 0.3 });
  ['TEE-based execution', 'Encrypted transactions', 'Shielded storage'].forEach((s) => {
    const e = el('div', 'chip', `<i></i>${s}`, {}, ov);
    bigLabels.push(e);
  });
  text('= Confidentiality in an [[EVM-compatible]] blockchain', 'h3', { left: '0', right: '0', top: '820px', textAlign: 'center', fontSize: '50px' }, { in: a(4.0), out: T10 - 0.1, stagger: 0.012 });
  text('Build on blockchain infrastructure — without exposing every piece of sensitive financial data.', 'body', { left: '0', right: '0', top: '900px', textAlign: 'center', fontSize: '28px' }, { in: a(4.8), out: T10 - 0.1, kind: 'fade', dur: 0.8 });
}

// S10 outro
{
  const a = at(T10);
  text('The future of blockchain isn\'t just about making transactions [[transparent.]]', 'h2', { left: '120px', top: '330px', width: '840px', fontSize: '66px' }, { in: a(0.4), out: a(3.3), stagger: 0.012 });
  text('It\'s also about making confidential transactions possible —', 'h2', { left: '120px', top: '300px', width: '840px', fontSize: '66px' }, { in: a(3.5), out: T11 - 0.1, stagger: 0.012 });
  text('{{when privacy matters.}}', 'h1', { left: '116px', top: '560px', width: '900px', fontSize: '100px', color: '#fff' }, { in: a(4.6), out: T11 - 0.1, stagger: 0.03, dur: 0.7 });
  // end card
  text('SEISMIC', 'h1', { left: '0', right: '0', top: '720px', textAlign: 'center', fontFamily: 'SG', fontWeight: 700, fontSize: '96px', letterSpacing: '0.32em', paddingLeft: '0.32em' }, { in: T11 + 1.3, out: 89.7, stagger: 0.07, dur: 0.8, blur: 16 });
  text('Privacy, when it matters.', 'kicker', { left: '0', right: '0', top: '860px', textAlign: 'center' }, { in: T11 + 2.2, out: 89.7, kind: 'scramble', stagger: 0.025, dur: 0.35 });
}

// ---------------------------------------------------------------- per-scene 3D
const SCENES = [
  // 0 intro: logo assembly
  (lt, t) => {
    sets.logo.visible = true;
    const k = seg(lt, 0.15, 2.4);
    assembleLogo(L, k, ease.outQuart);
    const up = ease.inOut(seg(lt, 2.75, 3.6));
    L.group.position.set(0, lerp(0, 1.35, up), 0);
    L.group.scale.setScalar(lerp(1, 0.62, up));
    L.group.rotation.set(Math.sin(lt * 0.9) * 0.08, lerp(-1.2, 0, ease.outQuart(seg(lt, 0, 2.6))) + Math.sin(lt * 0.7) * 0.32, 0);
    logoHalo.position.copy(L.group.position).add(V3(0, 0, -1.2));
    const hit = Math.exp(-Math.max(0, lt - 2.3) * 3.5) * (lt > 2.3 ? 1 : 0);
    logoHalo.material.opacity = 0.14 + hit * 0.3;
    S.finalPass.uniforms.uFlash.value = hit * 0.25;
    flare.style.opacity = (hit * 0.9).toFixed(3);
    flare.style.top = '540px';
    flare.style.transform = `scaleX(${0.4 + hit * 0.8})`;
    S.backMat.uniforms.uCenter.value.set(0.5, 0.5);
    S.backMat.uniforms.uRing.value = 1;
    S.backMat.uniforms.uColA.value.set('#3f2d20');
    setCam(V3(0, 0, lerp(13, 8.6, ease.outQuart(seg(lt, 0, 6.5)))), V3(0, 0.15 * up, 0), t, hit * 0.08);
    S.bloom.strength = 0.6 + hit * 0.45;
  },
  // 1 public chain
  (lt, t) => {
    sets.chain.visible = true;
    const x = lerp(-6.5, 3.5, ease.inOut(seg(lt, 0, 7)));
    setCam(V3(x - 1.5, 2.6, 11.5), V3(x + 1.2, 1.5, 0), t, 0, -0.04);
    chainBlocks.forEach((b, i) => {
      b.rotation.y = lt * 0.25 + i * 0.6;
      b.rotation.x = 0.25;
      b.position.y = Math.sin(lt * 1.2 + i) * 0.08;
      const appear = ease.outBack(seg(lt, 0.1 + i * 0.12, 0.7 + i * 0.12));
      b.scale.setScalar(Math.max(0.001, appear));
    });
    chainCards.forEach((e, i) => {
      const b = chainBlocks[i];
      const p = place(e, b.position.clone().add(V3(0, 1.0, 0)), -20, -80);
      const vis = env(lt, 1.6 + i * 0.25, 7.0, 0.4, 0.3) * clamp(1 - Math.abs(p.x - 1050) / 1100);
      e.style.opacity = vis.toFixed(3);
      e.style.display = vis > 0.01 ? '' : 'none';
    });
    S.backMat.uniforms.uCenter.value.set(0.6, 0.45);
    S.backMat.uniforms.uRing.value = 0;
    S.backMat.uniforms.uColA.value.set('#33251b');
  },
  // 2 golem reveal
  (lt, t) => {
    sets.golem.visible = true;
    S.ground.visible = true;
    const k = seg(lt, 0.0, 2.7);
    assembleGolem(G, k, ease.in);
    G.root.position.set(2.15, 0, 0);
    G.root.rotation.y = -0.32;
    G.root.scale.setScalar(1);
    const slam = lt > 2.62 ? Math.exp(-(lt - 2.62) * 4) : 0;
    const eyes = seg(lt, 2.9, 3.15) * (lt < 3.3 ? (Math.sin(lt * 90) > -0.2 ? 1 : 0.2) : 1);
    G.eyeMat.color.setScalar(eyes * 4);
    const em = ease.out(seg(lt, 3.3, 4.2));
    G.emblemMat.color.setScalar(em * 2.2 + Math.sin(t * 3) * 0.12 * em);
    S.glow.intensity = em * 6;
    S.groundMat.uniforms.uPulse.value = seg(lt, 2.6, 3.0);
    S.finalPass.uniforms.uFlash.value = slam * 0.25;
    S.bloom.strength = 0.65 + slam * 0.6;
    const p0 = V3(6.2, 0.35, 8.8), p1 = V3(3.4, 0.75, 7.4);
    const cp = vlerp(p0, p1, ease.inOut(seg(lt, 0, 8)));
    setCam(cp, V3(0.9, lerp(1.6, 2.35, ease.inOut(seg(lt, 0, 5))), 0), t, slam * 0.18);
    S.backMat.uniforms.uCenter.value.set(0.62, 0.6);
    S.backMat.uniforms.uColA.value.set('#45311f');
    S.backMat.uniforms.uRing.value = 0.6;
  },
  // 3 nested isolation
  (lt, t) => {
    sets.nested.visible = true;
    nested.position.set(0, 0.2, 0);
    const ang = lerp(0.35, 1.05, ease.inOut(seg(lt, 0, 9.5)));
    const dist = lerp(15.5, 13.5, ease.inOut(seg(lt, 0, 9.5)));
    setCam(V3(Math.sin(ang) * dist, 4.2, Math.cos(ang) * dist), V3(0, 0, 0), t, 0, 0, 400);
    layers.forEach((l, i) => {
      const s = ease.outBack(seg(lt, 0.1 + i * 0.2, 0.9 + i * 0.2));
      l.g.scale.setScalar(Math.max(0.001, s));
      l.g.rotation.y = (i % 2 ? -1 : 1) * lt * 0.12 + i * 0.3;
      // highlight in sync with the list (outermost = operator is item 03)
      const li = 2 - i;
      const hl = env(lt, 1.8 + li * 0.5, 5.3, 0.3, 0.4);
      l.lineMat.opacity = 0.22 + hl * 0.55;
      l.fillMat.opacity = 0.02 + hl * 0.05;
    });
    const coreIn = ease.outBack(seg(lt, 0.7, 1.5));
    core.scale.setScalar(Math.max(0.001, coreIn));
    core.rotation.y = lt * 0.4;
    core.rotation.x = 0.15;
    core.visible = true;
    coreEmblems.forEach((m) => m.color.setScalar(1.2 + Math.sin(t * 4) * 0.2));
    coreGlow.material.opacity = 0.4 * coreIn;
    const shieldIn = ease.out(seg(lt, 1.0, 1.8));
    shield.scale.setScalar(Math.max(0.001, shieldIn));
    shieldWire.scale.copy(shield.scale);
    shield.rotation.y = shieldWire.rotation.y = -lt * 0.2;
    shieldMat.uniforms.uCrack.value = 0;
    // probes try to reach the core and bounce off the shield
    const active = seg(lt, 2.0, 2.6);
    let hits = 0;
    for (const p of probes) {
      const cyc = (lt * p.speed + p.off) % 1;
      const r = lerp(3.3, 1.38, ease.in(Math.min(1, cyc / 0.8)));
      p.m.position.copy(p.dir).multiplyScalar(r);
      p.m.visible = cyc < 0.8 && active > 0;
      p.trail.visible = p.m.visible;
      p.trail.position.copy(p.dir).multiplyScalar(r + 0.45);
      p.trail.quaternion.setFromUnitVectors(V3(0, 1, 0), p.dir);
      p.trail.scale.set(1, 0.9, 1);
      const sp = cyc >= 0.8 ? 1 - (cyc - 0.8) / 0.2 : 0;
      p.spark.position.copy(p.dir).multiplyScalar(1.4);
      p.spark.material.opacity = sp * active * 0.9;
      p.spark.scale.setScalar(0.4 + (1 - sp) * 0.8);
      hits += sp * active;
    }
    shieldMat.uniforms.uHit.value = Math.min(1, hits * 0.4);
    shieldMat.uniforms.uI.value = 0.32 + Math.min(0.3, hits * 0.08);
    // layer labels
    const anchors = [V3(0.4, 2.15, 0.6), V3(1.75, -1.5, 1.4), V3(-1.45, 0.95, 1.2)];
    [0.8, 1.3, 1.8].forEach((tin, i) => {
      place(layerLabels[i], anchors[i].clone().add(nested.position), 0, -12);
      layerLabels[i].style.opacity = env(lt, tin, 9.4, 0.4, 0.3).toFixed(3);
    });
    place(layerLabels[3], core.getWorldPosition(V3()).add(V3(0, -1.75, 0)), -80, 0);
    layerLabels[3].style.opacity = env(lt, 1.6, 9.4, 0.4, 0.3).toFixed(3);
    S.backMat.uniforms.uCenter.value.set(0.66, 0.5);
    S.backMat.uniforms.uColA.value.set('#3a2a1e');
    S.backMat.uniforms.uRing.value = 0.3;
  },
  // 4 transaction path
  (lt, t) => {
    sets.tx.visible = true;
    setCam(V3(lerp(1.4, 2.4, ease.inOut(seg(lt, 0, 8.5))), 1.5, 11.5), V3(1.6, -0.15, 0), t);
    txNode.rotation.y = -0.25 + Math.sin(lt * 0.5) * 0.1;
    txShell.rotation.y = lt * 0.15;
    txSrc.rotation.set(lt * 0.6, lt * 0.8, 0);
    const pk = ease.inOut(seg(lt, 2.4, 5.0));
    const pt = txCurve.getPointAt(pk);
    packet.position.copy(pt);
    packet.rotation.set(lt * 3, lt * 2, 0);
    packet.visible = lt > 2.2 && lt < 5.1;
    ghosts.forEach((g, i) => {
      const kk = Math.max(0, pk - (i + 1) * 0.012);
      g.position.copy(txCurve.getPointAt(kk));
      g.visible = packet.visible && kk > 0;
    });
    const arrive = lt > 5.0 ? Math.exp(-(lt - 5.0) * 2.5) : 0;
    const lit = seg(lt, 5.0, 5.6);
    txEmblem.material.color.setScalar(0.5 + lit * 1.8 + arrive);
    txGlow.material.opacity = arrive * 0.9 + lit * 0.25;
    txShellMat.opacity = 0.3 + arrive * 0.6;
    S.finalPass.uniforms.uFlash.value = arrive * 0.12;
    txLine.material.opacity = 0.25 + 0.4 * seg(lt, 0.6, 1.4);
    // overlay
    const encK = seg(lt, 1.7, 2.5);
    morphText(txUI.l1, 'send 50,000 USDC', '0xa9f2c81e77b03d5e', t, T4 + 1.7, 0.8, 1);
    morphText(txUI.l2, 'to   0x91cd…04be', '0x3c09e1b44f7a21d8', t, T4 + 1.85, 0.8, 2);
    txUI.head.textContent = encK >= 1 ? 'TX · ENCRYPTED CLIENT-SIDE ✓' : 'TX · CREATED BY USER';
    place(txUI.net, txCurve.getPointAt(0.66).clone(), -60, 40);
    place(txUI.nodeL, txNode.position.clone().add(V3(-1.3, 1.95, 0)), -60, -30);
    place(txUI.exec, txNode.position.clone().add(V3(-0.9, -1.9, 0)), -120, 0);
    place(txUI.op, txNode.position.clone().add(V3(-1.3, 1.95, 0)), -60, 40);
    morphText(txUI.exL, 'a9f2·c81e·77b0·3d5e', 'send 50,000 USDC ✓', t, T4 + 5.3, 0.9, 3);
    txUI.exHead.textContent = lt > 6.2 ? 'EXECUTED INSIDE TEE ✓' : 'DECRYPTING INSIDE TEE…';
    S.backMat.uniforms.uCenter.value.set(0.72, 0.5);
    S.backMat.uniforms.uColA.value.set('#3b2b1f');
    S.backMat.uniforms.uRing.value = 0;
    S.bloom.strength = 0.7;
  },
  // 5 storage tiles
  (lt, t) => {
    sets.tiles.visible = true;
    tiles.position.set(0, 0, 0);
    tiles.rotation.set(0, -0.12, 0);
    const ang = lerp(-0.18, 0.12, ease.inOut(seg(lt, 0, 8.5)));
    setCam(V3(Math.sin(ang) * 12.5, 5.2, Math.cos(ang) * 12.5), V3(0, 0, 0), t, 0, 0, 430, 250);
    tileList.forEach(({ g, c, r, em }) => {
      const ft = 3.7 + c * 0.11 + r * 0.07;
      const f = ease.outBack(seg(lt, ft, ft + 0.55));
      g.rotation.x = f * Math.PI;
      g.position.y = Math.sin(f * Math.PI) * 0.6 + Math.sin(lt * 1.3 + c * 0.6 + r) * 0.04;
      em.color.setScalar(0.4 + seg(lt, ft + 0.3, ft + 0.8) * (0.9 + 0.25 * Math.sin(t * 3 + c + r)));
      const appear = ease.outQuart(seg(lt, 0.1 + (c + r) * 0.05, 0.6 + (c + r) * 0.05));
      g.scale.setScalar(Math.max(0.001, appear));
    });
    morphText(stor.v1, '1,250,000', '●●●●●●●●●●●●', t, T5 + 4.4, 0.7, 4);
    morphText(stor.v2, '0x7a3f…9e21', '●●●●●●●●●●●●', t, T5 + 4.6, 0.7, 5);
    S.backMat.uniforms.uCenter.value.set(0.7, 0.4);
    S.backMat.uniforms.uColA.value.set('#33251b');
  },
  // 6 attestation ring
  (lt, t) => {
    sets.golem.visible = true;
    sets.nodes.visible = true;
    S.ground.visible = true;
    assembleGolem(G, 1, ease.in);
    nodes.position.set(0, 0, 0);
    G.root.position.set(0, 0, 0);
    G.root.rotation.y = 0.15 + Math.sin(lt * 0.4) * 0.15;
    G.root.scale.setScalar(0.85);
    G.eyeMat.color.setScalar(4);
    G.emblemMat.color.setScalar(2 + Math.sin(t * 3) * 0.15);
    S.glow.intensity = 4;
    const ang = lerp(-0.25, 0.25, ease.inOut(seg(lt, 0, 8.5)));
    setCam(V3(Math.sin(ang) * 14.5, 6.8, Math.cos(ang) * 14.5), V3(0, 1.0, 0), t, 0, 0, 430, 40);
    const R = lerp(0.5, 5.2, ease.inOut(seg(lt, 2.4, 4.6)));
    scanRing.scale.setScalar(R);
    scanRing.material.opacity = env(lt, 2.4, 4.8, 0.2, 0.5) * 0.9;
    nodeList.forEach((n, i) => {
      const appear = ease.outBack(seg(lt, 0.2 + i * 0.12, 0.8 + i * 0.12));
      n.g.scale.setScalar(Math.max(0.001, appear));
      const tScan = lerp(2.4, 4.6, 0.6);
      const v = seg(lt, tScan + i * 0.06, tScan + 0.4 + i * 0.06);
      n.rock.rotation.y = lt * 0.5 + i;
      n.wire.rotation.y = -lt * 0.3;
      if (n.rogue) {
        const drop = ease.in(seg(lt, 4.6, 5.6));
        n.rock.position.y = 0.5 - drop * 1.3;
        n.wire.material.opacity = v * (Math.sin(lt * 40) > 0 ? 0.7 : 0.1) * (1 - drop);
        n.ringM.material.opacity = 0;
        n.beam.material.opacity = 0;
        n.em.material.color.setScalar(0);
      } else {
        n.wire.material.opacity = v * 0.75;
        n.ringM.material.opacity = v * 0.7;
        n.beam.material.opacity = v * 0.22;
        n.em.material.color.setScalar(v * 1.6);
      }
      const p = place(nodeBadges[i], n.g.getWorldPosition(V3()).add(V3(0, 1.75, 0)), -60, -20);
      nodeBadges[i].style.opacity = (v * env(lt, 0, 8.4, 0.01, 0.3)).toFixed(3);
    });
    S.groundMat.uniforms.uPulse.value = 0.4;
    S.backMat.uniforms.uCenter.value.set(0.7, 0.55);
    S.backMat.uniforms.uColA.value.set('#3c2b1e');
  },
  // 7 coins
  (lt, t) => {
    sets.coins.visible = true;
    setCam(V3(lerp(-0.6, 0.6, ease.inOut(seg(lt, 0, 7))), 0.9, 10), V3(1.6, 0.6, 0), t);
    coinList.forEach((c, i) => {
      c.g.position.copy(c.base).add(V3(Math.sin(lt * 0.5 + c.ph) * 0.3, Math.sin(lt * 0.7 + c.ph) * 0.35 + lt * 0.08, 0));
      if (c.big) {
        const ap = ease.outBack(seg(lt, 0.2, 1.3));
        c.g.scale.setScalar(Math.max(0.001, ap));
        c.g.rotation.set(Math.PI / 2 - 0.25, 0, lerp(-2.4, 0, ease.outQuart(seg(lt, 0.2, 2.2))) + Math.sin(lt * 0.8) * 0.2);
        c.g.position.set(4.2, 1.9, -1.2);
      } else {
        c.g.rotation.set(lt * c.sp.x + c.ph, lt * c.sp.y, lt * c.sp.z);
        c.g.scale.setScalar(Math.max(0.001, ease.outBack(seg(lt, 0.4 + i * 0.05, 1.2 + i * 0.05))));
      }
    });
    S.bloom.strength = 0.35;
    S.backMat.uniforms.uCenter.value.set(0.72, 0.35);
    S.backMat.uniforms.uColA.value.set('#3e2c1e');
  },
  // 8 limitations: cracked shield + glitch
  (lt, t) => {
    sets.nested.visible = true;
    nested.position.set(0, 0.2, 0);
    layers.forEach((l, i) => { l.g.scale.setScalar(1); l.g.rotation.y = lt * 0.1 * (i % 2 ? -1 : 1); l.lineMat.opacity = 0.16; l.fillMat.opacity = 0.015; });
    core.scale.setScalar(1);
    core.rotation.y = lt * 0.3;
    const crack = ease.out(seg(lt, 0.3, 1.6));
    shield.scale.setScalar(1);
    shieldWire.scale.setScalar(1 + crack * 0.08);
    shieldMat.uniforms.uCrack.value = crack * (0.9 + 0.4 * Math.sin(lt * 2));
    shieldMat.uniforms.uHit.value = 0.25;
    shieldMat.uniforms.uI.value = 0.35;
    shieldWire.material.opacity = 0.12;
    for (const p of probes) { p.m.visible = false; p.trail.visible = false; p.spark.material.opacity = 0; }
    const flick = (Math.sin(t * 37) > 0.6 ? 0.4 : 1);
    coreEmblems.forEach((m) => m.color.setScalar(1.1 * flick));
    coreGlow.material.opacity = 0.3 * flick;
    layerLabels.forEach((e) => (e.style.opacity = 0));
    const ang = 0.5 + lt * 0.06;
    const dist = 13.5 - lt * 0.15;
    setCam(V3(Math.sin(ang) * dist, 2.2, Math.cos(ang) * dist), V3(0, 0.1, 0), t, 0.02, 0, 430);
    const bursts = [0.0, 1.4, 1.8, 2.2, 2.6, 4.4];
    let g = 0;
    for (const b of bursts) g = Math.max(g, env(lt, b, b + 0.28, 0.03, 0.2));
    S.finalPass.uniforms.uGlitch.value = g * 0.9;
    S.backMat.uniforms.uCenter.value.set(0.72, 0.5);
    S.backMat.uniforms.uColA.value.set('#2e2219');
  },
  // 9 bigger picture: logo split into three pillars
  (lt, t) => {
    sets.logo.visible = true;
    assembleLogo(L, 1, ease.linear);
    L.group.position.set(0, 0.15, 0);
    L.group.scale.setScalar(0.95);
    const split = ease.inOut(seg(lt, 0.3, 1.4)) * (1 - ease.inExpo(seg(lt, 3.3, 3.9)));
    const offs = [V3(-1.6, -0.35, 0), V3(-0.9, 0.85, 0), V3(-0.9, 0.85, 0), V3(1.5, -0.4, 0), V3(1.5, -0.4, 0)];
    L.facets.forEach((f, i) => {
      f.position.add(offs[i].clone().multiplyScalar(split));
      f.rotation.y = split * Math.sin(lt * 1.2 + i) * 0.5;
    });
    L.group.rotation.set(0, Math.sin(lt * 0.6) * 0.25, 0);
    const join = lt > 3.9 ? Math.exp(-(lt - 3.9) * 6) : 0;
    S.finalPass.uniforms.uFlash.value = join * 0.22;
    S.bloom.strength = 0.6 + join * 0.4;
    logoHalo.position.set(0, 0.15, -1.2);
    logoHalo.material.opacity = 0.12 + join * 0.22;
    setCam(V3(0, 0.2, lerp(12, 10.8, ease.inOut(seg(lt, 0, 7)))), V3(0, 0.0, 0), t, join * 0.08);
    const anchors = [L.facets[0], L.facets[2], L.facets[3]];
    const dxs = [-330, -150, 40];
    const dys = [40, -110, 50];
    bigLabels.forEach((e, i) => {
      place(e, anchors[i].getWorldPosition(V3()), dxs[i], dys[i]);
      e.style.opacity = (env(lt, 0.9 + i * 0.25, 3.6, 0.4, 0.3)).toFixed(3);
    });
    S.backMat.uniforms.uCenter.value.set(0.5, 0.5);
    S.backMat.uniforms.uRing.value = 1;
    S.backMat.uniforms.uColA.value.set('#3f2d20');
  },
  // 10 outro hero
  (lt, t) => {
    sets.golem.visible = true;
    S.ground.visible = true;
    assembleGolem(G, 1, ease.in);
    G.root.position.set(2.1, 0, 0);
    G.root.rotation.y = -0.3;
    G.root.scale.setScalar(1);
    G.eyeMat.color.setScalar(4.5);
    G.emblemMat.color.setScalar(2.3 + Math.sin(t * 3) * 0.15);
    S.glow.intensity = 6;
    setCam(V3(lerp(4.6, 3.6, ease.inOut(seg(lt, 0, 6.5))), 0.45, lerp(8.8, 7.8, ease.inOut(seg(lt, 0, 6.5)))), V3(1.0, 2.45, 0), t, 0, 0, 260);
    S.groundMat.uniforms.uPulse.value = 1;
    S.backMat.uniforms.uCenter.value.set(0.66, 0.62);
    S.backMat.uniforms.uColA.value.set('#4a3422');
    S.backMat.uniforms.uRing.value = 0.6;
  },
  // 11 end card
  (lt, t) => {
    sets.logo.visible = true;
    const k = seg(lt, 0.05, 1.5);
    assembleLogo(L, k, ease.outQuart, 0.8);
    L.group.position.set(0, 1.0, 0);
    L.group.scale.setScalar(0.9);
    L.group.rotation.set(0, lerp(1.5, 0, ease.outQuart(seg(lt, 0, 2.2))) + Math.sin(lt * 0.8) * 0.18, 0);
    const hit = lt > 1.4 ? Math.exp(-(lt - 1.4) * 5) : 0;
    S.finalPass.uniforms.uFlash.value = hit * 0.18;
    flare.style.opacity = (hit * 0.9).toFixed(3);
    flare.style.top = '395px';
    flare.style.transform = `scaleX(${0.4 + hit * 0.8})`;
    logoHalo.position.set(0, 1.0, -1.2);
    logoHalo.material.opacity = 0.14 + hit * 0.25;
    S.bloom.strength = 0.6 + hit * 0.4;
    setCam(V3(0, 0.6, lerp(10.5, 9.8, seg(lt, 0, 5.5))), V3(0, 0.15, 0), t);
    S.backMat.uniforms.uCenter.value.set(0.5, 0.42);
    S.backMat.uniforms.uRing.value = 1;
    S.backMat.uniforms.uColA.value.set('#3f2d20');
  },
];

// ---------------------------------------------------------------- frame
const fmt = (s) => {
  const f = Math.floor((s % 1) * 30);
  return `00:${String(Math.floor(s)).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};
let lastSection = -1;
export function renderAt(t) {
  // defaults
  for (const k in sets) sets[k].visible = false;
  S.ground.visible = false;
  S.finalPass.uniforms.uFlash.value = 0;
  S.finalPass.uniforms.uGlitch.value = 0;
  S.bloom.strength = 0.6;
  S.glow.intensity = 0;
  S.groundMat.uniforms.uPulse.value = 0;
  flare.style.opacity = 0;
  for (const e of chainCards) e.style.display = 'none';
  for (const e of layerLabels) e.style.opacity = 0;
  for (const e of nodeBadges) e.style.opacity = 0;
  for (const e of bigLabels) e.style.opacity = 0;
  dirty = true;

  let si = 0;
  for (let i = 0; i < CUTS.length - 1; i++) if (t >= CUTS[i]) si = i;
  const lt = t - CUTS[si];

  // golem idle motion (applies whenever visible)
  G.torso.position.y = 2.3 + Math.sin(t * 1.5) * 0.018;
  G.torso.rotation.z = Math.sin(t * 0.7) * 0.012;
  G.head.rotation.y = Math.sin(t * 0.45) * 0.16;
  G.head.rotation.x = -0.05 + Math.sin(t * 0.6) * 0.04;
  G.arms.forEach((a, i) => (a.rotation.z = Math.sin(t * 1.5 + i) * 0.015));
  G.emblemMat.color.setScalar(0);
  G.eyeMat.color.setScalar(0);

  SCENES[si](lt, t);
  scene.updateMatrixWorld(true);
  // the emblem's light follows the golem chest
  S.glow.position.copy(G.plate.getWorldPosition(V3()).add(V3(0, 0, 0.9)));

  S.dustMat.uniforms.uTime.value = t;
  S.groundMat.uniforms.uTime.value = t;
  S.backMat.uniforms.uTime.value = t;
  shieldMat.uniforms.uTime.value = t;
  S.finalPass.uniforms.uTime.value = t;

  // cut transitions: dip + chromatic kick
  let dip = 0;
  for (let i = 1; i < CUTS.length - 1; i++) {
    const d = t - CUTS[i];
    if (d > -0.2 && d < 0) dip = Math.max(dip, ease.in(seg(d, -0.2, 0)));
    if (d >= 0 && d < 0.32) dip = Math.max(dip, 1 - ease.out(seg(d, 0, 0.32)));
  }
  const fadeIn = 1 - seg(t, 0, 0.6);
  const fadeOut = seg(t, DURATION - 0.8, DURATION - 0.05);
  S.finalPass.uniforms.uFade.value = Math.max(dip * 0.92, fadeIn, fadeOut);
  S.finalPass.uniforms.uAberr.value = 0.0007 + dip * 0.01;

  // HUD
  const hudVis = env(t, T1, T11, 0.6, 0.6);
  hud.style.opacity = hudVis.toFixed(3);
  progBar.style.width = ((t / DURATION) * 100).toFixed(2) + '%';
  hudTC.textContent = fmt(t) + '   ·   ' + String(si).padStart(2, '0') + ' / 10';
  if (si !== lastSection) lastSection = si;
  morphText(hudTR, '', SECTION[si] || '', t, CUTS[si] + 0.1, 0.6, 9);
  ov.style.transform = S.finalPass.uniforms.uGlitch.value > 0.3 ? `translateX(${(noise(t, 7) * 10).toFixed(1)}px)` : '';
  ov.style.opacity = (1 - Math.max(dip * 0.9, fadeOut)).toFixed(3);

  updateOverlay(t);
  S.render();
}

window.renderAt = renderAt;
window.DURATION = DURATION;
document.fonts.ready.then(() => { window.ready = true; });
