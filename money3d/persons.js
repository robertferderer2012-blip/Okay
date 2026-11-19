// Stylized 3D people + dog built from smooth primitives, with simple posing.
import * as THREE from 'three';

const mats = new Map();
function m(col, rough = 0.6, extra = {}) {
  const k = col + ':' + rough + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshPhysicalMaterial({ color: col, roughness: rough, clearcoat: 0.15, ...extra }));
  return mats.get(k);
}
const G = {
  limb: (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20),
  sphere: (r) => new THREE.SphereGeometry(r, 40, 28),
};
function mesh(geo, mat, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }
function limb(r, len, mat) {
  const g = new THREE.Group();
  g.add(mesh(G.limb(r, len), mat, 0, -len / 2, 0));
  return g;
}

export const SKINS = [0xf1c7a5, 0xd9a07a, 0xa86b4a, 0x7a4a32, 0xf6d5bd, 0xc68863];
export const TOPS = [0x10b981, 0xf59e0b, 0x38bdf8, 0x8b5cf6, 0xf43f5e, 0x14b8a6, 0x6366f1, 0xec4899, 0x64748b, 0xfacc15];
export const HAIRS = [0x2a1b12, 0x6b3e1f, 0x111111, 0xc68a3a, 0x8b5a2b, 0x3b2a20];

// height ~ 17 units (scale per use)
export function makePerson(o = {}) {
  const skinM = m(o.skin ?? SKINS[0], 0.55);
  const topM = m(o.top ?? TOPS[0], 0.75);
  const pantsM = m(o.pants ?? 0x1e293b, 0.85);
  const hairM = m(o.hair ?? HAIRS[0], 0.8);
  const shoeM = m(o.shoe ?? 0xf8fafc, 0.4);
  const darkM = m(0x111827, 0.3);
  const p = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 7.4; p.add(hips);
  // legs
  p.legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 1.05, 0, 0); hips.add(hip);
    const thigh = limb(0.85, 3.0, pantsM); hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -3.3; thigh.add(knee);
    const shin = limb(0.78, 2.6, pantsM); knee.add(shin);
    const shoe = mesh(G.limb(0.72, 1.3), shoeM, 0, -3.65, 0.45); shoe.rotation.x = Math.PI / 2; shin.add(shoe);
    const sole = mesh(new THREE.BoxGeometry(1.4, 0.25, 2.6), m(0xcbd5e1, 0.6), 0, -4.25, 0.45); shin.add(sole);
    p.legs.push({ hip, knee });
  }
  // torso
  const torso = new THREE.Group(); torso.position.y = 7.4; p.add(torso);
  const chest = mesh(G.limb(2.25, 3.2), topM, 0, 2.8, 0); chest.scale.set(1, 1, 0.74); torso.add(chest);
  const belt = mesh(new THREE.CylinderGeometry(2.05, 2.1, 0.5, 32), pantsM, 0, 0.55, 0); belt.scale.z = 0.74; torso.add(belt);
  if (o.jacket) {
    const jM = m(o.jacket, 0.7);
    const jacket = mesh(G.limb(2.34, 3.15), jM, 0, 2.8, 0); jacket.scale.set(1.02, 1, 0.78); torso.add(jacket);
    const shirt = mesh(new THREE.BoxGeometry(1.3, 4.0, 0.2), topM, 0, 3.0, 1.66); torso.add(shirt);
  }
  const collar = mesh(new THREE.TorusGeometry(0.95, 0.28, 12, 28), topM, 0, 5.35, 0); collar.rotation.x = Math.PI / 2; torso.add(collar);
  // head
  const neck = mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.0, 20), skinM, 0, 5.8, 0); torso.add(neck);
  const head = new THREE.Group(); head.position.set(0, 7.75, 0); torso.add(head);
  head.add(mesh(G.sphere(1.85), skinM));
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.2, 16, 12), darkM, sx * 0.62, 0.22, 1.66); head.add(eye);
    const hl = mesh(new THREE.SphereGeometry(0.06, 8, 6), m(0xffffff, 0.2), sx * 0.62 + 0.07, 0.3, 1.84); head.add(hl);
    const ear = mesh(G.sphere(0.4), skinM, sx * 1.82, 0, 0); ear.scale.set(0.45, 1, 0.75); head.add(ear);
    const brow = mesh(G.limb(0.075, 0.42), hairM, sx * 0.62, 0.68, 1.66); brow.rotation.z = Math.PI / 2 + sx * 0.12; head.add(brow);
    const cheek = mesh(new THREE.SphereGeometry(0.28, 12, 10), m(0xf87171, 0.6, { transparent: true, opacity: 0.35 }), sx * 1.0, -0.35, 1.45); head.add(cheek);
  }
  head.add(mesh(new THREE.SphereGeometry(0.26, 14, 10), skinM, 0, -0.12, 1.86));
  const mouth = mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20, Math.PI), darkM, 0, -0.6, 1.72); mouth.rotation.z = Math.PI; head.add(mouth);
  // hair styles
  const style = o.hairStyle ?? 'short';
  const cap = mesh(new THREE.SphereGeometry(1.95, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.12, -0.12); cap.rotation.x = -0.3; head.add(cap);
  if (style === 'short') {
    const f = mesh(G.sphere(0.85), hairM, 0.35, 1.25, 1.1); f.scale.set(1.6, 0.5, 0.8); head.add(f);
  } else if (style === 'bun') {
    head.add(mesh(G.sphere(0.85), hairM, 0, 1.75, -0.95));
    const f = mesh(G.sphere(0.9), hairM, -0.3, 1.25, 1.05); f.scale.set(1.7, 0.45, 0.8); head.add(f);
    for (const sx of [-1, 1]) { const s = mesh(G.limb(0.55, 1.2), hairM, sx * 1.55, 0.2, -0.3); head.add(s); }
  } else if (style === 'curly') {
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; head.add(mesh(G.sphere(0.62), hairM, Math.cos(a) * 1.55, 1.15 + Math.sin(a * 3) * 0.15, Math.sin(a) * 1.4 - 0.2)); }
    head.add(mesh(G.sphere(1.0), hairM, 0, 1.7, 0));
  } else if (style === 'long') {
    const back = mesh(G.limb(1.5, 2.2), hairM, 0, -1.1, -0.9); back.scale.set(1.25, 1, 0.6); head.add(back);
    const f = mesh(G.sphere(0.9), hairM, 0.4, 1.25, 1.05); f.scale.set(1.7, 0.45, 0.8); head.add(f);
  } else if (style === 'cap') {
    const c = mesh(new THREE.SphereGeometry(2.0, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.45), m(o.capCol ?? 0xef4444, 0.6), 0, 0.25, 0); head.add(c);
    const brim = mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 30, 1, false, -Math.PI / 2, Math.PI), m(o.capCol ?? 0xef4444, 0.6), 0, 0.85, 1.4); head.add(brim);
  }
  if (o.glasses) {
    for (const sx of [-1, 1]) { const r = mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 24), darkM, sx * 0.62, 0.22, 1.78); head.add(r); }
    head.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), darkM, 0, 0.3, 1.82));
  }
  // arms
  p.arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 2.4, 4.6, 0); torso.add(sh);
    const up = limb(0.62, 2.4, o.jacket ? m(o.jacket, 0.7) : topM); sh.add(up);
    const el = new THREE.Group(); el.position.y = -2.9; up.add(el);
    const fo = limb(0.56, 2.2, o.jacket ? m(o.jacket, 0.7) : topM); el.add(fo);
    const hand = mesh(G.sphere(0.6), skinM, 0, -2.95, 0); fo.add(hand);
    p.arms.push({ sh, el, hand, sx });
  }
  // prop holder in right hand
  p.prop = new THREE.Group(); p.arms[1].hand.add(p.prop);
  p.torso = torso; p.head = head; p.hips = hips; p.mouth = mouth;
  p.pose = (q = {}) => poseP(p, q);
  p.pose();
  return p;
}

// q: { t, wave, talk, phone, point, cheer, walk, nod, look }
function poseP(p, q) {
  const t = q.t ?? 0;
  const breathe = Math.sin(t * 2.1 + (q.seed ?? 0)) * 0.04;
  const [L, R] = p.arms;
  // defaults: relaxed
  let l = { x: 0.08 + breathe, z: -0.12, el: -0.2 }, r = { x: 0.08 + breathe, z: 0.12, el: -0.2 };
  if (q.talk) { const k = Math.sin(t * 5 + (q.seed ?? 0)); r = { x: -0.7 + k * 0.15, z: 0.35, el: -1.4 + k * 0.2 }; l = { x: -0.3, z: -0.25, el: -0.9 - k * 0.15 }; }
  if (q.phone) { r = { x: lerp(r.x, -1.05, q.phone), z: lerp(r.z, -0.35, q.phone), el: lerp(r.el, -1.7, q.phone) }; }
  if (q.wave) { const k = Math.sin(t * 9 + (q.seed ?? 0)); r = { x: lerp(r.x, -0.2, q.wave), z: lerp(r.z, 2.6 + k * 0.25, q.wave), el: lerp(r.el, -0.6 + k * 0.4, q.wave) }; }
  if (q.point) { r = { x: lerp(r.x, -1.45, q.point), z: lerp(r.z, 0.25, q.point), el: lerp(r.el, -0.1, q.point) }; }
  if (q.cheer) { const k = Math.sin(t * 7 + (q.seed ?? 0)) * 0.15; l = { x: 0, z: lerp(l.z, -2.7 - k, q.cheer), el: lerp(l.el, -0.3, q.cheer) }; r = { x: 0, z: lerp(r.z, 2.7 + k, q.cheer), el: lerp(r.el, -0.3, q.cheer) }; }
  if (q.sad) { l.el = -0.05; r.el = -0.05; }
  L.sh.rotation.set(l.x, 0, l.z); L.el.rotation.set(l.el, 0, 0);
  R.sh.rotation.set(r.x, 0, r.z); R.el.rotation.set(r.el, 0, 0);
  // legs: walk cycle
  const w = q.walk ?? 0;
  const ph = t * 8 + (q.seed ?? 0);
  p.legs.forEach((g, i) => {
    const s = Math.sin(ph + i * Math.PI) * 0.55 * w;
    g.hip.rotation.x = s; g.knee.rotation.x = Math.max(0, -Math.sin(ph + i * Math.PI + 0.6)) * 0.9 * w;
  });
  p.torso.position.y = 7.4 + Math.abs(Math.sin(ph)) * 0.25 * w + (q.cheer ? Math.abs(Math.sin(t * 7)) * 0.4 * q.cheer : 0);
  p.hips.position.y = p.torso.position.y;
  p.head.rotation.set((q.nod ? Math.sin(t * 6) * 0.12 * q.nod : 0) + (q.sad ? 0.25 : 0) + (q.lookDown ?? 0), q.look ?? 0, q.sad ? 0.08 : 0);
  p.mouth.scale.y = q.sad ? -1 : 1;
  p.mouth.position.y = q.sad ? -0.75 : -0.6;
}
const lerp = (a, b, t) => a + (b - a) * t;

export function makeDog(col = 0xc68a3a) {
  const d = new THREE.Group();
  const fur = m(col, 0.8), dark = m(0x3b2a20, 0.7), nose = m(0x111111, 0.3);
  const body = mesh(G.limb(1.1, 2.6), fur, 0, 2.4, 0); body.rotation.x = Math.PI / 2; d.add(body);
  const head = new THREE.Group(); head.position.set(0, 3.8, 2.2); d.add(head);
  head.add(mesh(G.sphere(1.05), fur));
  const snout = mesh(G.sphere(0.6), m(0xe9d3b0, 0.8), 0, -0.25, 0.85); snout.scale.set(1, 0.8, 1.1); head.add(snout);
  head.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), nose, 0, -0.05, 1.45));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), nose, sx * 0.42, 0.3, 0.88));
    const ear = mesh(G.limb(0.32, 0.9), dark, sx * 0.9, 0.0, -0.1); ear.rotation.z = sx * 0.4; head.add(ear);
  }
  d.legs = [];
  for (const [x, z] of [[-0.65, 1.2], [0.65, 1.2], [-0.65, -1.2], [0.65, -1.2]]) {
    const hip = new THREE.Group(); hip.position.set(x, 2.0, z); d.add(hip);
    hip.add(mesh(G.limb(0.35, 1.3), fur, 0, -0.9, 0));
    d.legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 2.8, -2.2); d.add(tail);
  const tm = mesh(G.limb(0.2, 1.1), fur, 0, 0.6, -0.2); tm.rotation.x = -0.5; tail.add(tm);
  d.head = head; d.tail = tail;
  d.pose = (t, walk = 0) => {
    d.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 10 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 * walk; });
    d.tail.rotation.z = Math.sin(t * 14) * 0.5;
    d.head.rotation.x = Math.sin(t * 3) * 0.08;
  };
  return d;
}
