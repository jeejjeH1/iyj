// The rock golem from the artwork, rebuilt as a low-poly 3D figure.
import * as THREE from 'three';
import { makeRock, limb, SLATE, INK } from './rock.js';
import { rng } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Chest emblem, traced from emblem_ref.png: three nested rounded strokes per side,
// mirrored left/right, the outer pair meeting in a cusp top and bottom.
// Design space is the 350px reference centred on (0,0); `scale` keeps the old
// convention of ~490 units across.
export function drawEmblem(ctx, cx, cy, scale, fill = '#fff', outline = null) {
  const k = scale * (490 / 227);
  const paths = (sx) => {
    const X = (x) => cx + sx * x * k, Y = (y) => cy + y * k;
    const out = [];
    for (const sy of [-1, 1]) {
      // outer wing: straight lead-in, then an arc that meets the centre line
      const p = [];
      p.push([X(-107), Y(sy * -95)]);
      const c = [-74, 18], R = 113, end = Math.asin(74 / R);
      for (let i = 0; i <= 24; i++) {
        const th = (end * i) / 24;
        p.push([X(c[0] + R * Math.sin(th)), Y(sy * (c[1] - R * Math.cos(th)))]);
      }
      out.push(p);
    }
    // middle "D" and inner crescent
    for (const [x0, xc, R] of [[-82, -60, 61.5], [-69, -69, 30]]) {
      const p = [[X(x0), Y(-R)]];
      for (let i = 0; i <= 32; i++) {
        const th = -Math.PI / 2 + (Math.PI * i) / 32;
        p.push([X(xc + R * Math.cos(th)), Y(R * Math.sin(th))]);
      }
      p.push([X(x0), Y(R)]);
      out.push(p);
    }
    return out;
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const all = [...paths(1), ...paths(-1)];
  const stroke = (w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    for (const p of all) {
      ctx.beginPath();
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  };
  if (outline) stroke(13 * k + 8, outline);
  stroke(13 * k, fill);
}

export function emblemTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  drawEmblem(ctx, size / 2, size / 2, (size * 0.86) / 512, '#ffffff', null);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildGolem() {
  const root = new THREE.Group();
  const pieces = []; // every rock, for assembly animation
  const add = (parent, obj, seed) => {
    parent.add(obj);
    const r = rng(seed * 31 + 7);
    obj.userData.scatter = {
      dir: V(r() - 0.5, r() * 0.8 + 0.4, r() - 0.5).normalize(),
      dist: 2.5 + r() * 3.5,
      rot: V((r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6),
      order: 0,
    };
    pieces.push(obj);
    return obj;
  };

  // --- legs (root space)
  const legs = new THREE.Group();
  root.add(legs);
  for (const s of [-1, 1]) {
    const sd = s < 0 ? 0 : 50;
    const foot = add(legs, makeRock(0.92, 0.38, 1.28, { seed: 1 + sd, taperTop: 0.8, bevel: 0.36 }), 1 + sd);
    foot.position.set(s * 1.0, 0.19, 0.22);
    foot.rotation.y = s * 0.22;
    add(legs, limb(V(s * 0.97, 0.3, 0.05), V(s * 0.9, 0.84, 0.04), 0.8, 0.8, { seed: 2 + sd, taperTop: 1.04 }), 2 + sd);
    add(legs, makeRock(0.94, 0.4, 0.92, { seed: 3 + sd, bevel: 0.42, taperTop: 0.9 }), 3 + sd).position.set(s * 0.9, 0.9, 0.05);
    add(legs, limb(V(s * 0.86, 1.0, 0.03), V(s * 0.46, 1.68, 0), 0.68, 0.72, { seed: 4 + sd, taperBottom: 0.92 }), 4 + sd);
  }

  // --- pelvis
  const pelvis = new THREE.Group();
  root.add(pelvis);
  add(pelvis, makeRock(0.9, 0.55, 0.72, { seed: 11, taperBottom: 0.7, palette: SLATE }), 11).position.set(0, 1.72, 0);
  add(pelvis, makeRock(1.5, 0.32, 0.95, { seed: 12, bevel: 0.5 }), 12).position.set(0, 2.02, 0.05);
  add(pelvis, makeRock(1.1, 0.28, 0.78, { seed: 13, palette: SLATE, bevel: 0.45 }), 13).position.set(0, 2.25, 0);

  // --- torso (pivot at waist so it can breathe / lean)
  const torso = new THREE.Group();
  torso.position.set(0, 2.3, 0);
  root.add(torso);
  const chest = add(torso, makeRock(2.05, 1.08, 1.15, { seed: 21, taperBottom: 0.78, bevel: 0.3 }), 21);
  chest.position.set(0, 0.56, 0);

  // black chest plate + emblem
  const plate = add(torso, makeRock(0.98, 0.66, 0.16, { seed: 22, palette: INK, bevel: 0.45, jitter: 0.02 }), 22);
  plate.position.set(0, 0.64, 0.56);
  plate.rotation.x = -0.06;
  const emblemMat = new THREE.MeshBasicMaterial({
    map: emblemTexture(), transparent: true, toneMapped: false, depthWrite: false,
  });
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), emblemMat);
  emblem.position.set(0, 0, 0.085);
  plate.add(emblem);

  for (const s of [-1, 1]) {
    const sd = s < 0 ? 0 : 50;
    add(torso, makeRock(0.95, 0.85, 0.95, { seed: 23 + sd, taperTop: 0.82, bevel: 0.36 }), 23 + sd).position.set(s * 1.22, 0.86, 0);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.1);
  torso.add(head);
  const skull = add(head, makeRock(0.58, 0.58, 0.58, { seed: 31, bevel: 0.3, taperTop: 0.94, jitter: 0.035 }), 31);
  skull.position.set(0, 0.06, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), toneMapped: false });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), eyeMat);
    e.position.set(s * 0.125, 0.1, 0.285);
    e.scale.z = 0.4;
    head.add(e);
    eyes.push(e);
  }

  // arms: hands on hips
  const arms = [];
  for (const s of [-1, 1]) {
    const sd = s < 0 ? 0 : 50;
    const arm = new THREE.Group();
    arm.position.set(s * 1.3, 0.62, 0);
    torso.add(arm);
    const sh = V(0, 0, 0), el = V(s * 0.5, -0.88, -0.12), wr = V(s * -0.28, -1.12, 0.14);
    add(arm, limb(sh, el, 0.52, 0.52, { seed: 41 + sd }), 41 + sd);
    add(arm, makeRock(0.5, 0.42, 0.5, { seed: 42 + sd, bevel: 0.4 }), 42 + sd).position.copy(el);
    add(arm, limb(el, wr, 0.66, 0.64, { seed: 43 + sd, taperBottom: 1.08 }), 43 + sd);
    add(arm, makeRock(0.52, 0.48, 0.54, { seed: 44 + sd, bevel: 0.38 }), 44 + sd).position.set(wr.x - s * 0.05, wr.y - 0.06, wr.z + 0.04);
    arms.push(arm);
  }

  // assembly order: bottom-up; record the assembled pose
  pieces.forEach((p) => {
    p.userData.home = { p: p.position.clone(), q: p.quaternion.clone() };
    const wp = new THREE.Vector3();
    p.getWorldPosition(wp);
    p.userData.scatter.order = wp.y;
  });

  return { root, pieces, torso, head, arms, eyes, eyeMat, emblemMat, plate, legs, pelvis };
}

// k = 0 -> scattered, 1 -> assembled. Pieces snap in sequentially from the ground up.
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function assembleGolem(g, k, easeFn) {
  const minY = 0, maxY = 4;
  for (const p of g.pieces) {
    const { home, scatter } = p.userData;
    const delay = ((scatter.order - minY) / (maxY - minY)) * 0.55;
    const local = Math.min(1, Math.max(0, (k - delay) / 0.45));
    const e = easeFn(local);
    const inv = 1 - e;
    p.position.copy(home.p).addScaledVector(scatter.dir, scatter.dist * inv);
    _e.set(scatter.rot.x * inv, scatter.rot.y * inv, scatter.rot.z * inv);
    _q.setFromEuler(_e);
    p.quaternion.copy(home.q).premultiply(_q);
    p.visible = local > 0.001 || k >= 1;
    const s = 0.4 + 0.6 * Math.min(1, local * 2.2);
    p.scale.setScalar(s);
  }
}
