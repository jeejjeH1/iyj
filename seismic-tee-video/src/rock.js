// Faceted low-poly "rock" primitives in the style of the golem artwork:
// chamfered convex hulls, flat-shaded patches of brown, thin ink outlines.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { rng } from './util.js';

export const STONE = ['#5e4a3d', '#6d5747', '#4a3a30', '#826856', '#3b2f28', '#9a7f6a', '#67564b'];
export const STONE_W = [3, 3, 2, 2, 1.2, 1, 1.5];
export const SLATE = ['#2c2a2e', '#34313a', '#252226', '#3c3741'];
export const INK = ['#161210', '#1c1714', '#120f0d'];

const pick = (r, list, weights) => {
  if (!weights) return list[Math.floor(r() * list.length)];
  const tot = weights.reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) return list[i]; }
  return list[list.length - 1];
};

export function rockGeometry(w, h, d, o = {}) {
  const { bevel = 0.28, jitter = 0.05, seed = 1, taperTop = 1, taperBottom = 1,
    palette = STONE, weights = palette === STONE ? STONE_W : null, skewX = 0 } = o;
  const r = rng(seed * 7919 + 13);
  const pts = [];
  const bx = w / 2, by = h / 2, bz = d / 2;
  const m = Math.min(w, h, d);
  const bv = m * bevel;
  const J = () => (r() - 0.5) * 2 * jitter * m;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const tap = sy > 0 ? taperTop : taperBottom;
    const X = bx * tap, Z = bz * tap;
    const off = sy * skewX * by;
    pts.push(new THREE.Vector3(sx * X + off + J(), sy * (by - bv) + J(), sz * (Z - bv) + J()));
    pts.push(new THREE.Vector3(sx * (X - bv) + off + J(), sy * by + J(), sz * (Z - bv) + J()));
    pts.push(new THREE.Vector3(sx * (X - bv) + off + J(), sy * (by - bv) + J(), sz * Z + J()));
  }
  const geo = new ConvexGeometry(pts);
  // colour faces in patches: triangles whose normals agree share a colour
  const pos = geo.attributes.position;
  const n = pos.count / 3;
  const colors = new Float32Array(pos.count * 3);
  const clusters = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    a.fromBufferAttribute(pos, i * 3);
    b.fromBufferAttribute(pos, i * 3 + 1);
    c.fromBufferAttribute(pos, i * 3 + 2);
    const nn = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    let cl = clusters.find((k) => k.n.dot(nn) > 0.965);
    if (!cl) {
      tmp.set(pick(r, palette, weights));
      const v = 0.92 + r() * 0.16;
      cl = { n: nn, col: tmp.clone().multiplyScalar(v) };
      clusters.push(cl);
    }
    for (let k = 0; k < 3; k++) {
      colors[(i * 3 + k) * 3] = cl.col.r;
      colors[(i * 3 + k) * 3 + 1] = cl.col.g;
      colors[(i * 3 + k) * 3 + 2] = cl.col.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export const rockMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.04,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
});
export const inkMat = new THREE.LineBasicMaterial({ color: '#0f0b09', transparent: true, opacity: 0.9 });

export function makeRock(w, h, d, o = {}) {
  const geo = rockGeometry(w, h, d, o);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, o.material || rockMat);
  g.add(mesh);
  if (o.outline !== false) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 14), o.lineMat || inkMat);
    g.add(lines);
  }
  g.userData.mesh = mesh;
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
// a rock whose long axis spans from point A to point B
export function limb(A, B, w, d, o = {}) {
  const dir = B.clone().sub(A);
  const len = dir.length();
  const g = makeRock(w, len + (o.extra ?? 0.12), d, o);
  g.position.copy(A).add(B).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(UP, dir.normalize());
  if (o.twist) g.rotateY(o.twist);
  return g;
}
