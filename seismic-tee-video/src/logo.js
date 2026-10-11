// The faceted gem logo, traced from the supplied artwork and extruded in 3D.
import * as THREE from 'three';
import { rng } from './util.js';

// facet polygons traced from logo_ref.png (normalised, y up), darkest -> lightest
const FACETS = [
  { pts: [[-0.0254, 0.2979], [0.205, -0.0069], [-0.1114, -0.4682], [-0.336, -0.1097]], col: '#9c7752' }, // main diamond
  { pts: [[-0.0289, 0.4486], [-0.0393, 0.3158], [-0.2644, 0.0214]], col: '#b08a63' },                  // left sliver
  { pts: [[-0.0058, 0.4815], [0.2413, 0.3701], [0.2107, 0.0254], [-0.0162, 0.3187]], col: '#c7a57e' },  // top
  { pts: [[0.2229, -0.0208], [0.3233, -0.1495], [0.1998, -0.4908], [-0.0941, -0.4931]], col: '#d8bd98' }, // bottom right
  { pts: [[0.3227, -0.1103], [0.2281, 0.0023], [0.254, 0.2904]], col: '#efe2cc' },                      // right sliver
];
const CX = -0.0064, CY = -0.0058, H = 0.9746;

export function logoShapes2D() {
  // normalised to height 1, centred
  return FACETS.map((f) => ({ col: f.col, pts: f.pts.map(([x, y]) => [(x - CX) / H, (y - CY) / H]) }));
}

export function buildLogo({ height = 2, depth = 0.24, emissive = 0 } = {}) {
  const group = new THREE.Group();
  const facets = [];
  const r = rng(77);
  logoShapes2D().forEach((f, i) => {
    const shape = new THREE.Shape(f.pts.map(([x, y]) => new THREE.Vector2(x * height, y * height)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 1, curveSegments: 1,
    });
    geo.translate(0, 0, -depth / 2);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, 0); // pivot at facet centre for nicer tumbling
    const mat = new THREE.MeshStandardMaterial({
      color: f.col, roughness: 0.38, metalness: 0.3, flatShading: true,
      emissive: new THREE.Color(f.col), emissiveIntensity: emissive,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(c);
    m.userData.home = c.clone();
    m.userData.scatter = {
      dir: new THREE.Vector3(r() - 0.5, r() - 0.5, r() * 0.6 + 0.2).normalize(),
      dist: 4 + r() * 4,
      rot: new THREE.Vector3((r() - 0.5) * 8, (r() - 0.5) * 8, (r() - 0.5) * 8),
      delay: i * 0.08,
    };
    group.add(m);
    facets.push(m);
  });
  return { group, facets };
}

// k: 0 scattered -> 1 assembled
export function assembleLogo(L, k, easeFn, spread = 1) {
  for (const m of L.facets) {
    const s = m.userData.scatter;
    const local = Math.min(1, Math.max(0, (k - s.delay) / (1 - 0.32)));
    const inv = 1 - easeFn(local);
    m.position.copy(m.userData.home).addScaledVector(s.dir, s.dist * inv * spread);
    m.rotation.set(s.rot.x * inv, s.rot.y * inv, s.rot.z * inv);
  }
}

export function logoSVG(size = 120, mono = null) {
  const pts = logoShapes2D();
  const polys = pts.map((f) => {
    const p = f.pts.map(([x, y]) => `${(50 + x * 92).toFixed(2)},${(50 - y * 92).toFixed(2)}`).join(' ');
    return `<polygon points="${p}" fill="${mono || f.col}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${polys}</svg>`;
}
