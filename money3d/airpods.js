// "$10K in 1 month reselling AirPods" – 3D explainer with a photographer character.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { drawFront, drawBack, drawEdge, drawStrap } from './billtex.js';

const W = 1080, H = 1920;
const END = 57.4;

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const easeOutBack = (x) => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInCubic = (x) => Math.pow(clamp(x), 3);
const pop = (t, t0, d = 0.35) => easeOutBack((t - t0) / d);
function hash(i, k = 0) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------- renderer / world
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
function gradientTex(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const bgDark = gradientTex([[0, '#0d2a1a'], [0.55, '#06160d'], [1, '#020604']]);
scene.background = bgDark;
scene.fog = new THREE.Fog(0x030a06, 90, 240);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(50, W / H, 0.3, 600);

scene.add(new THREE.HemisphereLight(0xcfe8d8, 0x0a140e, 0.6));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(18, 45, 28);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
key.shadow.bias = -0.0004;
key.shadow.radius = 3;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6dffb0, 1.0);
rim.position.set(-25, 18, -30);
scene.add(rim);
const fill = new THREE.PointLight(0xffd59a, 220, 90, 1.6);
fill.position.set(-14, 16, 24);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x10261a }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// ---------------------------------------------------------------- money
const frontTex = canvasTex(drawFront(document.createElement('canvas')));
const backTex = canvasTex(drawBack(document.createElement('canvas')));
const edgeCanvas = drawEdge(document.createElement('canvas'));
const strapCanvas = drawStrap(document.createElement('canvas'));
const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, color: 0xe2e6d6, roughness: 0.78 });
const backMat = new THREE.MeshStandardMaterial({ map: backTex, color: 0xe2e6d6, roughness: 0.78 });
const BILL_W = 15.6, BILL_D = 6.6, T = 0.035;
function edgeMat(n, along = BILL_W) {
  const t = canvasTex(edgeCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(along / 8, n / 64);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}
function bentPlane(bend, twist) {
  const g = new THREE.PlaneGeometry(BILL_W, BILL_D, 24, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = x / (BILL_W / 2);
    p.setZ(i, bend * (1 - u * u) - bend * 0.5 + twist * u * (y / BILL_D));
  }
  g.computeVertexNormals();
  return g;
}
function backOf(g) {
  const b = g.clone();
  const idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
  const n = b.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const uv = b.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return b;
}
function billPair(geo, count) {
  const f = new THREE.InstancedMesh(geo, frontMat, count);
  const b = new THREE.InstancedMesh(backOf(geo), backMat, count);
  for (const m of [f, b]) { m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  return {
    set(i, m4) { f.setMatrixAt(i, m4); b.setMatrixAt(i, m4); },
    commit() { f.instanceMatrix.needsUpdate = true; b.instanceMatrix.needsUpdate = true; },
    vis(v) { f.visible = b.visible = v; },
  };
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function compose(px, py, pz, rx, ry, rz, s = 1, sy = s) {
  tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
  tmpP.set(px, py, pz); tmpS.set(s, sy, s);
  return tmpM.compose(tmpP, tmpQ, tmpS);
}
const RAIN_N = 150;
const rain = billPair(bentPlane(1.1, 0.9), RAIN_N);
const payBills = billPair(bentPlane(0.4, 0.2), 6);

const brick = new THREE.Group();
{
  const h = 100 * T;
  const body = new THREE.Mesh(new THREE.BoxGeometry(BILL_W, h, BILL_D),
    [edgeMat(100, BILL_D), edgeMat(100, BILL_D), frontMat, backMat, edgeMat(100), edgeMat(100)]);
  body.castShadow = body.receiveShadow = true;
  brick.add(body);
  const topC = document.createElement('canvas'); topC.width = 512; topC.height = 1024;
  const tx = topC.getContext('2d');
  tx.translate(512, 0); tx.rotate(Math.PI / 2); tx.drawImage(strapCanvas, 0, 0, 1024, 512);
  const plainC = document.createElement('canvas'); plainC.width = 256; plainC.height = 256;
  plainC.getContext('2d').drawImage(strapCanvas, 20, 20, 60, 60, 0, 0, 256, 256);
  const topMat = new THREE.MeshStandardMaterial({ map: canvasTex(topC), roughness: 0.55 });
  const plainMat = new THREE.MeshStandardMaterial({ map: canvasTex(plainC), roughness: 0.55 });
  const strap = new THREE.Mesh(new THREE.BoxGeometry(3.6, h + 0.08, BILL_D + 0.08), [plainMat, plainMat, topMat, plainMat, plainMat, plainMat]);
  strap.castShadow = true;
  brick.add(strap);
  brick.h = h;
  scene.add(brick);
}

// ---------------------------------------------------------------- earbuds case (generic white, no logos)
const CW = 6.0, CH = 4.6, CD = 2.4, CR = 1.45, SPLIT = 0.75; // split height (top of body)
const caseMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f6f3, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.18 });
const innerMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5 });
const gridMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
function caseShape(part) {
  const s = new THREE.Shape();
  const x0 = -CW / 2, x1 = CW / 2, y0 = -CH / 2, y1 = CH / 2, r = CR;
  if (part === 'body') {
    const ys = SPLIT;
    s.moveTo(x0, ys); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, ys); s.lineTo(x0, ys);
  } else {
    const ys = SPLIT + 0.06, rr = Math.min(r, y1 - ys - 0.05);
    s.moveTo(x0, ys); s.lineTo(x1, ys); s.lineTo(x1, y1 - rr); s.quadraticCurveTo(x1, y1, x1 - rr, y1);
    s.lineTo(x0 + rr, y1); s.quadraticCurveTo(x0, y1, x0, y1 - rr); s.lineTo(x0, ys);
  }
  return s;
}
const BEV = 0.5;
function caseGeo(part) {
  const g = new THREE.ExtrudeGeometry(caseShape(part), { depth: CD - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV * 0.55, bevelSegments: 7, curveSegments: 18 });
  g.translate(0, 0, -(CD - 2 * BEV) / 2);
  g.computeVertexNormals();
  return g;
}
const bodyGeo = caseGeo('body'), lidGeo = caseGeo('lid');
function budMesh() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), caseMat);
  head.scale.set(1, 0.9, 1.05);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), innerMat);
  tip.position.set(0, 0.1, -0.45);
  const grill = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), gridMat);
  grill.position.set(0, 0.25, 0.6); grill.rotation.x = -0.3;
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.4, 6, 12), caseMat);
  stem.position.set(0, -0.95, 0.1);
  g.add(head, tip, grill, stem);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}
function makeCase() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, caseMat);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // interior top surface
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.9, CD - 0.6), innerMat);
  inner.rotation.x = -Math.PI / 2; inner.position.y = SPLIT + 0.01;
  g.add(inner);
  const buds = new THREE.Group();
  for (const sx of [-1, 1]) { const b = budMesh(); b.position.set(sx * 1.25, SPLIT + 0.35, 0); b.rotation.y = sx * 0.5; buds.add(b); }
  g.add(buds);
  const pivot = new THREE.Group();
  pivot.position.set(0, SPLIT, -CD / 2 + 0.2);
  const lid = new THREE.Mesh(lidGeo, caseMat);
  lid.position.set(0, -SPLIT, CD / 2 - 0.2);
  lid.castShadow = true;
  pivot.add(lid);
  g.add(pivot);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  led.position.set(0, 0.2, CD / 2 + 0.02);
  g.add(led);
  g.setOpen = (a) => { pivot.rotation.x = -a * 1.95; buds.visible = a > 0.02; led.visible = a > 0.02; };
  g.setOpen(0);
  scene.add(g);
  return g;
}
const hero = makeCase();
const tableCase = makeCase();
const studioCase = makeCase();

// many closed cases (grid / pile)
const CASES_N = 200;
const caseBodies = new THREE.InstancedMesh(bodyGeo, caseMat, CASES_N);
const caseLids = new THREE.InstancedMesh(lidGeo, caseMat, CASES_N);
for (const m of [caseBodies, caseLids]) { m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const cc = new THREE.Color(0xffffff);
for (let i = 0; i < CASES_N; i++) { caseBodies.setColorAt(i, cc); caseLids.setColorAt(i, cc); }
function setCase(i, m4, col) {
  caseBodies.setMatrixAt(i, m4); caseLids.setMatrixAt(i, m4);
  if (col) { caseBodies.setColorAt(i, col); caseLids.setColorAt(i, col); }
}
function commitCases() {
  caseBodies.instanceMatrix.needsUpdate = caseLids.instanceMatrix.needsUpdate = true;
  caseBodies.instanceColor.needsUpdate = caseLids.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- photographer character
function mat(c, r = 0.7) { return new THREE.MeshStandardMaterial({ color: c, roughness: r }); }
const SKIN = mat(0xe3b08a, 0.6), HOOD = mat(0xf97316, 0.8), PANTS = mat(0x1f2a44, 0.85), SHOE = mat(0xf2f2f2, 0.5), HAIR = mat(0x2a1b12, 0.9), DARK = mat(0x111111, 0.4);
function limb(r, len, m) {
  // capsule hanging down from its origin (shoulder/hip)
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m);
  c.position.y = -len / 2; c.castShadow = true;
  g.add(c);
  g.len = len;
  return g;
}
const person = new THREE.Group();
const P = {};
{
  // legs
  for (const sx of [-1, 1]) {
    const leg = limb(0.85, 5.6, PANTS); leg.position.set(sx * 1.05, 7.4, 0); person.add(leg);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.3, 6, 12), SHOE);
    shoe.rotation.x = Math.PI / 2; shoe.position.set(sx * 1.05, 0.75, 0.45); shoe.castShadow = true; person.add(shoe);
  }
  // torso (hoodie) + hood
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(2.25, 3.3, 8, 20), HOOD);
  torso.position.y = 10.2; torso.scale.set(1, 1, 0.72); torso.castShadow = true; person.add(torso);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.3), mat(0xea580c, 0.85));
  pocket.position.set(0, 9.0, 1.6); person.add(pocket);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.45, 10, 24), HOOD);
  hood.rotation.x = Math.PI / 2; hood.position.set(0, 12.75, -0.2); person.add(hood);
  // head
  const head = new THREE.Group(); head.position.set(0, 15.0, 0); person.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.9, 32, 24), SKIN); skull.castShadow = true; head.add(skull);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.2, 14), SKIN); neck.position.set(0, 13.4, 0); person.add(neck);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), HAIR);
  hair.rotation.x = -0.35; hair.position.set(0, 0.15, -0.15); head.add(hair);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10), HAIR); fringe.scale.set(1.6, 0.55, 0.8); fringe.position.set(0.3, 1.25, 1.2); head.add(fringe);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), DARK); eye.position.set(sx * 0.68, 0.25, 1.72); head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), SKIN); ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 1.88, 0.0, 0); head.add(ear);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), HAIR); brow.rotation.z = Math.PI / 2 + sx * 0.12; brow.position.set(sx * 0.68, 0.72, 1.7); head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), SKIN); nose.position.set(0, -0.15, 1.9); head.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20, Math.PI), DARK); smile.rotation.z = Math.PI; smile.position.set(0, -0.62, 1.78); head.add(smile);
  P.head = head;
  // arms: shoulder -> upper arm -> elbow -> forearm -> hand
  P.arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 2.45, 12.0, 0); person.add(sh);
    const up = limb(0.62, 2.6, HOOD); sh.add(up);
    const el = new THREE.Group(); el.position.y = -3.0; up.add(el);
    const fo = limb(0.55, 2.4, HOOD); el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), SKIN); hand.position.y = -3.0; fo.add(hand);
    P.arms.push({ sh, up, el, fo, hand, sx });
  }
  // phone in right hand
  const phone = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.0, 0.22), mat(0x0f172a, 0.3)); pb.castShadow = true; phone.add(pb);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.8), new THREE.MeshBasicMaterial({ color: 0x9be7ff }));
  scr.position.z = -0.12; scr.rotation.y = Math.PI; phone.add(scr);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14), DARK); lens.rotation.x = Math.PI / 2; lens.position.set(-0.4, 1.1, 0.14); phone.add(lens);
  const flashBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flashBulb.position.set(-0.05, 1.1, 0.14); phone.add(flashBulb);
  const flashLight = new THREE.PointLight(0xffffff, 0, 40, 1.5); flashLight.position.set(0, 1.1, 1.2); phone.add(flashLight);
  const flashGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  flashGlow.position.set(-0.05, 1.1, 0.3); phone.add(flashGlow);
  P.phone = phone; P.flashLight = flashLight; P.flashGlow = flashGlow; P.screen = scr;
  person.add(phone);
  scene.add(person);
}
// pose: 0 = arms down/relaxed, 1 = holding phone up in front of the face
function posePerson(t, raise, flash) {
  const breathe = Math.sin(t * 2.2) * 0.05;
  P.head.rotation.set(0.12 * raise - 0.05, Math.sin(t * 0.8) * 0.06, 0);
  for (const a of P.arms) {
    const down = { x: 0.15 + breathe, z: a.sx * 0.12, el: -0.25 };
    const up = a.sx > 0 ? { x: -1.2, z: -0.55, el: -1.55 } : { x: -1.25, z: 0.5, el: -1.5 };
    a.sh.rotation.set(lerp(down.x, up.x, raise), 0, lerp(down.z, up.z, raise));
    a.el.rotation.set(lerp(down.el, up.el, raise), 0, 0);
  }
  // phone placement: rest near right hip -> up in front of face
  const pDown = new THREE.Vector3(2.9, 7.8, 0.9), pUp = new THREE.Vector3(0.0, 14.4, 4.4);
  P.phone.position.lerpVectors(pDown, pUp, raise);
  P.phone.rotation.set(lerp(0.2, 0, raise), lerp(0, 0, raise), lerp(-0.25, 0, raise));
  P.flashLight.intensity = flash * 900;
  P.flashGlow.material.opacity = flash * 0.9;
  P.flashGlow.scale.setScalar(0.5 + flash * 1.5);
  P.screen.material.color.setHex(flash > 0.1 ? 0xffffff : 0x9be7ff);
}

// photo studio set (table + white sweep + ring light) beside the photographer
const studio = new THREE.Group();
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 7), mat(0xc79a6b, 0.6)); top.position.y = 7.25; top.castShadow = top.receiveShadow = true; studio.add(top);
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7, 0.45), mat(0x8b6a48)); l.position.set(x, 3.5, z); l.castShadow = true; studio.add(l); }
  // white backdrop: floor pad + back wall
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), white); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 7.51, 0); pad.receiveShadow = true; studio.add(pad);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), white); wall.position.set(0, 11, -3.0); wall.receiveShadow = true; studio.add(wall);
  // ring light on a stand
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.28, 12, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 }));
  ring.position.set(4.8, 13.5, 5.5); ring.rotation.y = -0.9; studio.add(ring);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 13.5, 8), DARK); pole.position.set(4.8, 6.75, 5.5); studio.add(pole);
  const ringLight = new THREE.PointLight(0xfff4e0, 260, 40, 1.7); ringLight.position.set(4.3, 13, 5); studio.add(ringLight);
  studio.ringLight = ringLight;
  scene.add(studio);
}

// off-screen mini studio that the phone "photographs" (render target)
const photoRT = new THREE.WebGLRenderTarget(640, 640, { samples: 4 });
const photoCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const shoot = new THREE.Group();
{
  const sweep = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshStandardMaterial({ color: 0x9fd8b4, roughness: 1, side: THREE.BackSide }));
  shoot.add(sweep);
  const l1 = new THREE.PointLight(0xffffff, 120, 60, 1.6); l1.position.set(6, 8, 10); shoot.add(l1);
  const l2 = new THREE.PointLight(0xffffff, 90, 60, 1.6); l2.position.set(-8, 4, 8); shoot.add(l2);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(29, 32), new THREE.MeshStandardMaterial({ color: 0x86c9a0, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -CH / 2; ground.receiveShadow = true; shoot.add(ground);
  shoot.position.set(400, 0, 0);
  scene.add(shoot);
  studioCase.position.set(400, 0, 0);
  studioCase.rotation.y = -0.45;
  studioCase.setOpen(0.62);
  photoCam.position.set(400 + 4.5, 4.2, 16);
  photoCam.lookAt(400, 0.1, 0);
}
function renderPhoto() {
  const bg = scene.background, fog = scene.fog;
  scene.background = null; scene.fog = null;
  shoot.visible = studioCase.visible = true;
  renderer.setRenderTarget(photoRT);
  renderer.render(scene, photoCam);
  renderer.setRenderTarget(null);
  scene.background = bg; scene.fog = fog;
}

// ---------------------------------------------------------------- 3D gold text
const gold = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });
const goldGreen = new THREE.MeshStandardMaterial({ color: 0x57f08f, metalness: 0.85, roughness: 0.25, envMapIntensity: 1.4 });
const texts = {};
async function buildTexts() {
  const font = await new Promise((res) => new FontLoader().load('node_modules/three/examples/fonts/helvetiker_bold.typeface.json', res));
  const mk = (str, size, m) => {
    const g = new TextGeometry(str, { font, size, depth: size * 0.28, curveSegments: 8, bevelEnabled: true, bevelThickness: size * 0.05, bevelSize: size * 0.035, bevelSegments: 3 });
    g.computeBoundingBox(); g.center();
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; scene.add(mesh);
    return mesh;
  };
  texts.t10k = mk('$10,000', 3.4, gold);
  texts.t120 = mk('$120', 2.6, gold);
  texts.t170 = mk('$170', 2.6, gold);
  texts.t50 = mk('+$50', 2.6, goldGreen);
}

// ---------------------------------------------------------------- UI panels
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function makePanel(w, h, pxW, draw, slabColor = 0x111a16) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedShape(w, h, Math.min(w, h) * 0.16), { depth: 0.5, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 3, curveSegments: 10 }),
    new THREE.MeshStandardMaterial({ color: slabColor, metalness: 0.4, roughness: 0.3 }));
  slab.castShadow = true;
  g.add(slab);
  const c = document.createElement('canvas');
  c.width = pxW; c.height = Math.round(pxW * h / w);
  const ctx = c.getContext('2d');
  draw(ctx, c.width, c.height);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, toneMapped: false }));
  face.position.z = 0.72;
  g.add(face);
  g.canvas = c; g.ctx = ctx; g.face = face; g.w = w; g.h = h;
  scene.add(g);
  return g;
}
const EMOJI = '"Noto Color Emoji"';
function sourcePanel(emoji, label, accent) {
  return makePanel(17, 4.4, 1100, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#16231c'); g.addColorStop(1, '#0c120f');
    rr(ctx, 6, 6, w - 12, h - 12, 60); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = accent; ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(h * 0.52, h / 2, h * 0.33, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(h * 0.36)}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, h * 0.52, h / 2 + 6);
    ctx.font = `900 ${Math.round(h * 0.29)}px Montserrat`; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText(label, h * 1.0, h / 2 + 4);
  });
}
const CHECKS = [['🔢', 'SERIAL NUMBER'], ['🔊', 'SOUND'], ['🔋', 'BATTERY'], ['📶', 'PAIRING']];
function drawChecklist(ctx, w, h, n) {
  ctx.clearRect(0, 0, w, h);
  rr(ctx, 6, 6, w - 12, h - 12, 60); ctx.fillStyle = '#0f1713'; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#22c55e'; ctx.stroke();
  ctx.fillStyle = '#86efac'; ctx.font = '900 64px Montserrat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('AUTHENTICITY CHECK', w / 2, 90);
  CHECKS.forEach(([e, label], i) => {
    const y = 210 + i * 150;
    const done = i < n;
    rr(ctx, 50, y - 60, w - 100, 120, 30); ctx.fillStyle = done ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.font = `68px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(e, 130, y + 4);
    ctx.font = '900 62px Montserrat'; ctx.textAlign = 'left'; ctx.fillStyle = done ? '#ffffff' : '#9ca3af';
    ctx.fillText(label, 200, y + 4);
    ctx.lineWidth = 7; ctx.strokeStyle = done ? '#22c55e' : '#4b5563';
    rr(ctx, w - 190, y - 40, 80, 80, 18); ctx.stroke();
    if (done) { ctx.fillStyle = '#22c55e'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(w - 172, y); ctx.lineTo(w - 155, y + 20); ctx.lineTo(w - 125, y - 22); ctx.stroke(); }
  });
}
let sources = [], checklist, checkState = -1, listing, polaroid;
function buildPanels() {
  sources = [sourcePanel('🛒', 'MARKETPLACE', '#38bdf8'), sourcePanel('🏷️', 'GARAGE SALES', '#f59e0b'), sourcePanel('📱', 'UPGRADERS', '#a78bfa')];
  checklist = makePanel(17, 11.4, 1100, (ctx, w, h) => drawChecklist(ctx, w, h, 0));
  // marketplace-style listing card with a slot for the product photo
  listing = makePanel(17, 22, 1000, (ctx, w, h) => {
    rr(ctx, 6, 6, w - 12, h - 12, 60); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.fillStyle = '#16a34a'; rr(ctx, 6, 6, w - 12, 120, 60); ctx.fill(); ctx.fillRect(6, 70, w - 12, 56);
    ctx.fillStyle = '#fff'; ctx.font = '900 54px Montserrat'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('NEW LISTING', 60, 70);
    ctx.font = `50px ${EMOJI}`; ctx.textAlign = 'right'; ctx.fillText('🛍️', w - 60, 70);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(60, 160, w - 120, w - 120); // photo slot
    const y0 = 160 + w - 120 + 70;
    ctx.textAlign = 'left'; ctx.fillStyle = '#0b0f0d'; ctx.font = '900 54px Montserrat';
    ctx.fillText('Wireless earbuds Pro', 60, y0);
    ctx.fillText('– like new', 60, y0 + 64);
    ctx.fillStyle = '#4b5563'; ctx.font = '800 38px Montserrat';
    ctx.fillText('✓ Genuine  ✓ Tested  ✓ Cleaned', 60, y0 + 140);
    ctx.fillText('📍 Local pickup · ships today', 60, y0 + 196);
  }, 0xe9ece6);
  const slot = (17 * (1000 - 120) / 1000);
  const ph = new THREE.Mesh(new THREE.PlaneGeometry(slot, slot), new THREE.MeshBasicMaterial({ map: photoRT.texture }));
  ph.position.set(0, 11 - (160 + (1000 - 120) / 2) / 1000 * 17, 0.8);
  listing.add(ph);
  // polaroid that pops out after the shot
  polaroid = makePanel(8, 9.4, 600, (ctx, w, h) => {
    ctx.fillStyle = '#fbfbf8'; rr(ctx, 4, 4, w - 8, h - 8, 30); ctx.fill();
    ctx.fillStyle = '#333'; ctx.font = '800 40px Montserrat'; ctx.textAlign = 'center';
    ctx.fillText('📸 listing photo', w / 2, h - 50);
  }, 0xf3f3ef);
  const pp = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: photoRT.texture }));
  pp.position.set(0, 0.8, 0.8);
  polaroid.add(pp);
}

// sparkles (cleaning)
const SPK_N = 40;
let sparkles;
function buildSparkles() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,230,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(64, 0); x.lineTo(70, 58); x.lineTo(128, 64); x.lineTo(70, 70); x.lineTo(64, 128); x.lineTo(58, 70); x.lineTo(0, 64); x.lineTo(58, 58); x.fill();
  const m = new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  sparkles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, SPK_N);
  sparkles.frustumCulled = false;
  scene.add(sparkles);
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function camKeys(t, keys) {
  if (t <= keys[0][0]) { camPos.fromArray(keys[0][1]); camLook.fromArray(keys[0][2]); return; }
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0, l0] = keys[i], [t1, p1, l1] = keys[i + 1];
    if (t <= t1) {
      const u = smooth((t - t0) / (t1 - t0));
      camPos.set(lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u), lerp(p0[2], p1[2], u));
      camLook.set(lerp(l0[0], l1[0], u), lerp(l0[1], l1[1], u), lerp(l0[2], l1[2], u));
      return;
    }
  }
  const k = keys[keys.length - 1]; camPos.fromArray(k[1]); camLook.fromArray(k[2]);
}

// ---------------------------------------------------------------- scenes
const st = { rainAmt: 0, rainSpeed: 1, rainCenter: new THREE.Vector3(), rainDepth: 20 };
function hideAll() {
  rain.vis(true); payBills.vis(false);
  brick.visible = false; brick.scale.setScalar(1); brick.rotation.set(0, 0, 0);
  for (const k in texts) texts[k].visible = false;
  for (const s of sources) s.visible = false;
  checklist.visible = listing.visible = polaroid.visible = false;
  hero.visible = tableCase.visible = studioCase.visible = shoot.visible = false;
  hero.scale.setScalar(1); hero.rotation.set(0, 0, 0);
  person.visible = studio.visible = false;
  caseBodies.visible = caseLids.visible = false;
  sparkles.visible = false;
  st.rainDepth = 20;
  scene.background = bgDark;
}
function showText(m, x, y, z, s, ry = 0, rx = 0) {
  m.visible = s > 0.001;
  m.position.set(x, y, z); m.scale.setScalar(Math.max(s, 0.0001)); m.rotation.set(rx, ry, 0);
}
function heroAt(x, y, z, s, ry, open) {
  hero.visible = s > 0.001;
  hero.position.set(x, y, z); hero.scale.setScalar(Math.max(0.001, s)); hero.rotation.set(0, ry, 0);
  hero.setOpen(open);
}

// A — hook
function sA(t) {
  camKeys(t, [[0, [0, 6, 34], [0, 6.5, 0]], [4.7, [0, 7, 28], [0, 6.5, 0]]]);
  const drop = easeOutBack((t - 0.1) / 0.6);
  heroAt(0, lerp(18, CH / 2 * 1.35, drop), 2, 1.35, Math.sin(t * 0.9) * 0.35 - 0.2, ramp(t, 1.0, 1.6));
  showText(texts.t10k, 0, 14.6, -2, pop(t, 0.5, 0.45) * 0.9, Math.sin(t * 1.7) * 0.18);
  st.rainAmt = 0.5; st.rainSpeed = 1; st.rainCenter.set(0, 12, -16); st.rainDepth = 14;
}

// B — step 1: buy used / open-box (~$120)
function sB(t) {
  camKeys(t, [[4.7, [0, 13, 44], [0, 12, 0]], [11.9, [0, 12, 40], [0, 12, 0]], [12.4, [0, 9, 30], [0, 7.5, 0]], [15.18, [3, 8, 27], [0, 7.5, 0]]]);
  const times = [8.62, 9.65, 10.45];
  sources.forEach((p, i) => {
    const a = pop(t, times[i], 0.45) * (1 - ramp(t, 11.7, 12.1));
    p.visible = t >= times[i] && a > 0.01;
    p.position.set((1 - a) * (i % 2 ? 14 : -14), 18.5 - i * 5.6, 0);
    p.rotation.set(0, Math.sin(t * 1.3 + i) * 0.1, 0);
    p.scale.setScalar(Math.max(0.001, a));
  });
  // case intro while "buy used or open-box" is said, then the price close-up
  const early = pop(t, 5.6, 0.5) * (1 - ramp(t, 8.3, 8.7));
  const late = pop(t, 11.95, 0.5);
  if (t < 9) heroAt(0, 11, 0, 2.2 * early, t * 0.8, 0.0);
  else heroAt(-2.5, CH / 2 * 1.3, 0, 1.3 * late, -0.35 + Math.sin(t) * 0.1, 0.0);
  showText(texts.t120, 3.2, 10.6, 0, pop(t, 13.05, 0.4) * 0.95, -0.2);
  // two bills slide in as payment
  payBills.vis(t > 13.2);
  for (let i = 0; i < 2; i++) {
    const u = easeOutCubic((t - 13.3 - i * 0.18) / 0.5);
    payBills.set(i, compose(lerp(18, 3.5 + i * 1.2, u), 0.3 + i * 0.06, lerp(4, 3.2 - i * 0.4, u), -Math.PI / 2, 0.25 - i * 0.35, 0, 0.55));
  }
  for (let i = 2; i < 6; i++) payBills.set(i, ZERO);
  payBills.commit();
  st.rainAmt = 0; st.rainCenter.set(0, 12, -20);
}

// C — step 2: check authenticity
function sC(t) {
  camKeys(t, [[15.18, [0, 13, 42], [0, 12, 0]], [24.91, [-2, 12, 37], [0, 12, 0]]]);
  heroAt(0, 17.2, 0, 1.15 * pop(t, 15.3, 0.45), t * 0.9, ramp(t, 16.2, 16.8));
  const a = pop(t, 17.0, 0.5);
  checklist.visible = t > 17.0;
  checklist.position.set(0, 6.6 - (1 - a) * 8, 0);
  checklist.scale.setScalar(Math.max(0.001, a * 0.85));
  checklist.rotation.set(-0.04, Math.sin(t * 0.8) * 0.08, 0);
  const ticks = [18.45, 19.3, 19.95, 20.95];
  const n = ticks.filter((x) => t >= x).length;
  if (n !== checkState) { drawChecklist(checklist.ctx, checklist.canvas.width, checklist.canvas.height, n); checklist.face.material.map.needsUpdate = true; checkState = n; }
  st.rainAmt = 0;
}

// D — step 3: clean like new + photographer
function sD(t) {
  // close-up cleaning shot, then pull back to reveal the photographer
  camKeys(t, [[24.91, [4.6, 9.5, 7.5], [3.5, 8.5, 0.3]], [27.2, [4.2, 9.3, 6.4], [3.5, 8.5, 0.3]], [28.3, [7, 12.5, 33], [0, 10.5, 0]], [32.54, [9, 12, 30], [0, 10.5, 0]]]);
  studio.visible = true; studio.position.set(3.5, 0, 0);
  tableCase.visible = true;
  tableCase.position.set(3.5, 7.5 + CH / 2 * 0.42, 0.3); tableCase.scale.setScalar(0.42);
  tableCase.rotation.set(0, -0.6 + (t < 27.3 ? (t - 24.9) * 1.6 : 2.4 * 1.6 - 0.15), 0);
  tableCase.setOpen(ramp(t, 26.4, 27.0) * 0.62);
  person.visible = true;
  person.position.set(-5.2, 0, 1.2);
  person.rotation.set(0, Math.PI / 2 - 0.12, 0);
  const shots = [28.55, 29.25, 29.95, 30.75, 31.55];
  let flash = 0;
  for (const s of shots) flash = Math.max(flash, t >= s ? Math.exp(-(t - s) * 14) : 0);
  posePerson(t, ramp(t, 27.4, 28.2), flash);
  studio.ringLight.intensity = (t < 27.6 ? 120 : 260) + flash * 200;
  // sparkles while cleaning
  sparkles.visible = t < 28.6;
  for (let i = 0; i < SPK_N; i++) {
    const ph = (t * 0.9 + hash(i)) % 1;
    const vis = t > 25.9 ? Math.sin(ph * Math.PI) : 0;
    const a = hash(i, 2) * Math.PI * 2, r = 0.9 + hash(i, 3) * 1.1;
    const s = vis * (0.15 + hash(i, 4) * 0.3);
    sparkles.setMatrixAt(i, s <= 0.001 ? ZERO : compose(3.5 + Math.cos(a) * r, 8.4 + Math.sin(a) * r * 0.8 + ph * 0.6, 0.3 + hash(i, 5) * 1.5, 0, 0, t + i, s));
  }
  sparkles.instanceMatrix.needsUpdate = true;
  sparkles.quaternion.copy(camera.quaternion);
  // polaroid result
  if (t > 28.6) {
    renderPhoto();
    const pa = pop(t, 28.75, 0.5);
    polaroid.visible = true;
    polaroid.position.set(lerp(-0.5, 3.8, pa), lerp(14.4, 16.0, pa), 5);
    polaroid.rotation.set(0, 0.35, lerp(0.4, -0.08, pa));
    polaroid.scale.setScalar(Math.max(0.001, pa * 0.62));
  }
  st.rainAmt = 0;
}

// E — step 4: list for ~$170, +$50 profit
function sE(t) {
  camKeys(t, [[32.54, [0, 13, 44], [0, 12.5, 0]], [38.83, [2, 12.5, 39], [0, 12.5, 0]]]);
  renderPhoto();
  const a = pop(t, 32.7, 0.5);
  listing.visible = true;
  listing.position.set(0, 15.2 - (1 - a) * 12, 0);
  listing.rotation.set(-0.03, Math.sin(t * 0.7) * 0.1, 0);
  listing.scale.setScalar(Math.max(0.001, a * 0.68));
  showText(texts.t170, 4.6, 6.2, 3, pop(t, 34.6, 0.4) * 0.95, -0.15);
  showText(texts.t50, -4.6, 6.2, 3, pop(t, 36.3, 0.4) * 0.95, 0.15);
  st.rainAmt = ramp(t, 36.3, 36.6) * 0.35; st.rainSpeed = 0.7; st.rainCenter.set(0, 14, -22); st.rainDepth = 12;
}

// F — math: 10,000 / 50 = 200 pairs ~ 7/day
const COLS = 10, ROWS = 20;
const colWhite = new THREE.Color(0xffffff), colGreen = new THREE.Color(0x4ade80), colDim = new THREE.Color(0x667066), colTmp = new THREE.Color();
const SEVEN = [93, 94, 95, 96, 104, 105, 106];
function sF(t) {
  camKeys(t, [[38.83, [0, 16, 52], [0, 13, 0]], [44.5, [0, 15, 58], [0, 13, 0]], [46.57, [0, 14, 52], [0, 13, 0]]]);
  caseBodies.visible = caseLids.visible = t > 42.8;
  for (let i = 0; i < CASES_N; i++) {
    const c = i % COLS, r = Math.floor(i / COLS);
    const order = hash(i, 7);
    const t0 = 42.85 + order * 1.2;
    const u = easeOutBack((t - t0) / 0.35);
    let x = (c - (COLS - 1) / 2) * 3.4, y = 31 - r * 1.85, z = 0, s = 0.48 * u;
    const k = SEVEN.indexOf(i);
    colTmp.copy(colWhite);
    if (t > 44.6) {
      if (k >= 0) { const h = easeOutBack((t - 44.65 - k * 0.07) / 0.35); z += h * 6; s *= 1 + h * 0.5; colTmp.lerp(colGreen, clamp(h)); }
      else colTmp.lerp(colDim, ramp(t, 44.6, 45.0) * 0.8);
    }
    setCase(i, t < t0 ? ZERO : compose(x, y, z, 0.1, Math.sin(t * 2 + i) * 0.12, 0, s), colTmp);
  }
  commitCases();
  showText(texts.t10k, 0, 15, 2, pop(t, 39.9, 0.4) * (1 - ramp(t, 42.5, 42.85)), Math.sin(t * 1.5) * 0.15);
  st.rainAmt = 0;
}

// G — step 5: reinvest, buy in bulk
function sG(t) {
  camKeys(t, [[46.57, [0, 13, 40], [0, 6, 0]], [51.36, [4, 15, 44], [0, 6, 0]]]);
  brick.visible = true;
  brick.position.set(-8.5, brick.h / 2 * 0.7, 2); brick.scale.setScalar(0.7); brick.rotation.set(0, 0.5, 0);
  caseBodies.visible = caseLids.visible = true;
  // cases fly from the money into a growing pile (pyramid)
  let slot = 0;
  const layers = [[5, 4], [4, 3], [3, 2], [2, 1], [1, 1]];
  for (let i = 0; i < CASES_N; i++) setCase(i, ZERO, colWhite);
  for (let L = 0; L < layers.length; L++) {
    const [nx, nz] = layers[L];
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const i = slot++;
      const t0 = 47.7 + i * 0.07;
      const u = easeOutCubic((t - t0) / 0.5);
      const tx = 7 + (ix - (nx - 1) / 2) * 3.2, ty = 0.55 * CH / 2 + L * 0.55 * CH * 0.98, tz = (iz - (nz - 1) / 2) * 2.4 + 1;
      const x = lerp(-8.5, tx, u), y = lerp(2, ty, u) + Math.sin(u * Math.PI) * 6, z = lerp(2, tz, u);
      setCase(i, t < t0 ? ZERO : compose(x, y, z, 0, (1 - u) * 4 + (hash(i) - 0.5) * 0.3, 0, 0.55), colWhite);
    }
  }
  commitCases();
  st.rainAmt = 0.25; st.rainSpeed = 0.7; st.rainCenter.set(0, 14, -20); st.rainDepth = 12;
}

// H — outro
function sH(t) {
  const u = t - 51.36;
  const ang = 0.5 - u * 0.12, R = 36 - u * 1.0;
  camPos.set(Math.sin(ang) * R, 9 + u * 0.4, Math.cos(ang) * R);
  camLook.set(0, 7, 0);
  brick.visible = true;
  const a = pop(t, 51.4, 0.5);
  brick.position.set(0, brick.h / 2 + (1 - a) * 20, 0); brick.rotation.set(0, 0.3, 0);
  heroAt(0, brick.h + CH / 2 * 1.2 + (1 - pop(t, 51.9, 0.5)) * 15, 0.5, 1.2, 0.3 + Math.sin(t) * 0.2, ramp(t, 52.3, 52.9));
  st.rainAmt = 0.7; st.rainSpeed = 1; st.rainCenter.set(0, 12, -14); st.rainDepth = 16;
}

const SCENES = [[0, sA], [4.7, sB], [15.18, sC], [24.91, sD], [32.54, sE], [38.83, sF], [46.57, sG], [51.36, sH]];

function updateRain(t) {
  const c = st.rainCenter;
  for (let i = 0; i < RAIN_N; i++) {
    if (hash(i, 5) >= st.rainAmt) { rain.set(i, ZERO); continue; }
    const sp = (7 + hash(i, 6) * 5) * st.rainSpeed;
    const range = 56;
    const y = c.y + 28 - ((t * sp + hash(i, 7) * range) % range);
    const x = c.x + (hash(i, 8) - 0.5) * 44 + Math.sin(t * 1.3 + i) * 1.5;
    const z = c.z + (hash(i, 10) - 0.5) * st.rainDepth;
    rain.set(i, compose(x, y, z, t * (0.8 + hash(i, 11) * 1.6) + i, t * (0.4 + hash(i, 12)) + i * 2, Math.sin(t * 2 + i) * 0.6, 0.9));
  }
  rain.commit();
}

// ---------------------------------------------------------------- 2D overlay
const out = document.getElementById('out');
const ctx = out.getContext('2d');
const SEG = [
  [0.0, 2.51, 'How to make $10,000 in one month…'],
  [3.1, 4.18, 'reselling AirPods.'],
  [4.7, 5.28, 'Step one.'],
  [5.68, 8.21, 'Buy used or open-box AirPods locally.'],
  [8.62, 11.54, 'Marketplace, garage sales, people who just upgraded.'],
  [11.99, 12.84, 'Your target price:'],
  [13.07, 14.68, 'around $120.'],
  [15.18, 15.75, 'Step two.'],
  [16.16, 17.44, "Make sure they're real."],
  [17.88, 21.37, 'Check the serial number, the sound, the battery, and the pairing.'],
  [21.74, 24.42, 'Never buy fakes, and never sell fakes.'],
  [24.91, 25.49, 'Step three.'],
  [25.9, 27.14, 'Clean them like new…'],
  [27.5, 29.23, 'and take bright, clean photos.'],
  [29.61, 32.01, 'Good photos sell faster, and for more money.'],
  [32.54, 33.14, 'Step four.'],
  [33.55, 35.92, 'List them for around $170.'],
  [36.27, 38.29, "That's $50 profit per pair."],
  [38.83, 39.35, 'Now the math.'],
  [39.9, 42.53, '$10,000 ÷ $50…'],
  [42.83, 44.22, 'is 200 pairs.'],
  [44.59, 46.08, "That's about 7 pairs a day."],
  [46.57, 47.22, 'Step five.'],
  [47.62, 50.86, 'Reinvest every dollar, and buy in bulk to grow faster.'],
  [51.36, 51.99, 'Buy smart.'],
  [52.24, 53.12, 'Sell honest.'],
  [53.42, 53.9, 'Repeat.'],
  [54.35, 56.11, 'Save this video, and start today.'],
];
const Y1 = '#facc15', G1 = '#4ade80', WH = '#ffffff', RED = '#f87171';
const HEAD = [
  [0.1, 4.7, [['HOW TO MAKE', WH, 120, 250], ['IN 1 MONTH', Y1, 130, 690, 0.7], ['RESELLING AIRPODS 🎧', G1, 100, 830, 3.1]]],
  [5.68, 11.9, [['BUY USED / OPEN-BOX', WH, 104, 380], ['LOCALLY 📍', Y1, 90, 510, 6.6]]],
  [11.99, 15.18, [['TARGET BUY PRICE', WH, 120, 380]]],
  [16.16, 21.74, [['MAKE SURE THEY\'RE REAL', WH, 100, 380]]],
  [21.74, 24.91, [['NEVER BUY FAKES', RED, 120, 380], ['NEVER SELL FAKES', RED, 120, 530, 23.1]]],
  [25.9, 27.5, [['CLEAN LIKE NEW ✨', WH, 120, 380]]],
  [27.5, 29.61, [['BRIGHT, CLEAN PHOTOS 📸', WH, 100, 380]]],
  [29.61, 32.54, [['SELLS FASTER', G1, 120, 380], ['+ FOR MORE MONEY 📈', Y1, 92, 520, 30.6]]],
  [33.55, 36.27, [['LIST FOR ≈ $170', WH, 120, 360]]],
  [36.27, 38.83, [['$170 − $120 = $50 💰', G1, 104, 360]]],
  [38.83, 42.83, [['NOW THE MATH 🧮', WH, 120, 300], ['$10,000 ÷ $50', Y1, 130, 450, 39.9]]],
  [42.83, 44.59, [['= 200 PAIRS', G1, 150, 300]]],
  [44.59, 46.57, [['≈ 7 PAIRS / DAY', Y1, 140, 300]]],
  [47.62, 51.36, [['REINVEST EVERY $ 🔁', WH, 108, 380], ['BUY IN BULK 📦', Y1, 120, 530, 49.2]]],
  [51.36, 54.35, [['BUY SMART.', WH, 130, 300], ['SELL HONEST.', G1, 130, 450, 52.24], ['REPEAT. 🔁', Y1, 130, 600, 53.42]]],
  [54.35, END, [['SAVE THIS 📌', WH, 140, 320], ['START TODAY', G1, 160, 490, 55.2]]],
];
const CHIPS = [[4.7, 15.18, 'STEP 1 · BUY'], [15.18, 24.91, 'STEP 2 · CHECK'], [24.91, 32.54, 'STEP 3 · PHOTOS'], [32.54, 38.83, 'STEP 4 · LIST'], [46.57, 51.36, 'STEP 5 · SCALE']];

function fitFont(text, size, family, maxW) {
  let s = size;
  ctx.font = `${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 20) { s -= 4; ctx.font = `${s}px ${family}`; }
  return s;
}
function bigText(text, color, size, y, a, sc) {
  const fam = `Anton, ${EMOJI}`;
  const s = fitFont(text, size, fam, 980);
  ctx.save();
  ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.globalAlpha = a;
  ctx.font = `${s}px ${fam}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.lineWidth = s * 0.14; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}
function chip(t) {
  for (const [t0, t1, label] of CHIPS) {
    if (t < t0 || t >= t1) continue;
    const s = easeOutBack((t - t0) / 0.3);
    ctx.save();
    ctx.translate(W / 2, 230); ctx.scale(s, s);
    ctx.font = '900 54px Montserrat';
    const w = ctx.measureText(label).width + 90;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    rr(ctx, -w / 2, -46, w, 92, 46); ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 5; ctx.strokeStyle = '#bbf7d0'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 3);
    ctx.restore();
  }
}
function headlines(t) {
  for (const [t0, t1, lines] of HEAD) {
    if (t < t0 || t >= t1) continue;
    const o = clamp((t1 - t) / 0.12);
    for (const [txt, col, size, y, at] of lines) {
      const ta = at ?? t0;
      if (t < ta) continue;
      const k = (t - ta) / 0.28;
      bigText(txt, col, size, y, clamp(k * 3) * o, 0.55 + 0.45 * easeOutBack(k));
    }
  }
}
function stamp(t) {
  // red "NO FAKES" stamp
  if (t < 22.3 || t >= 24.91) return;
  const k = (t - 22.3) / 0.25;
  const s = lerp(2.2, 1, easeOutCubic(k));
  ctx.save();
  ctx.translate(W / 2, 1180); ctx.rotate(-0.18); ctx.scale(s, s);
  ctx.globalAlpha = clamp(k * 2) * clamp((24.91 - t) / 0.12);
  ctx.lineWidth = 16; ctx.strokeStyle = '#ef4444'; rr(ctx, -330, -105, 660, 210, 30); ctx.stroke();
  ctx.lineWidth = 6; rr(ctx, -305, -82, 610, 164, 20); ctx.stroke();
  ctx.fillStyle = '#ef4444'; ctx.font = '120px Anton'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('NO FAKES', 0, 6);
  ctx.restore();
}
function captions(t) {
  let seg = null;
  for (let i = 0; i < SEG.length; i++) {
    const [a, b] = SEG[i];
    const next = SEG[i + 1] ? SEG[i + 1][0] : END;
    if (t >= a - 0.05 && t < Math.min(next, b + 0.6)) seg = SEG[i];
  }
  if (!seg) return;
  const [a, b, text] = seg;
  const words = text.split(' ');
  const total = words.reduce((s, w) => s + w.length + 1, 0);
  let acc = 0;
  const starts = words.map((w) => { const s = a + (acc / total) * (b - a); acc += w.length + 1; return s; });
  const size = 64;
  ctx.font = `900 ${size}px Montserrat, ${EMOJI}`;
  const space = ctx.measureText(' ').width + 16;
  const lines = [[]];
  let lw = 0;
  words.forEach((w, i) => {
    const ww = ctx.measureText(w).width;
    if (lw + ww > 900 && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push([w, ww, i]);
    lw += ww + space;
  });
  const lineH = size * 1.22;
  const y0 = 1520 - ((lines.length - 1) * lineH) / 2;
  const segA = clamp((t - a + 0.05) / 0.12);
  lines.forEach((ln, li) => {
    const tw = ln.reduce((s, [, ww]) => s + ww, 0) + space * (ln.length - 1);
    let x = W / 2 - tw / 2;
    for (const [w, ww, i] of ln) {
      const active = t >= starts[i] && (i === words.length - 1 ? t < b + 0.3 : t < starts[i + 1]);
      const said = t >= starts[i];
      const sc = active ? 1 + 0.12 * (1 - clamp((t - starts[i]) / 0.15)) : 1;
      ctx.save();
      ctx.translate(x + ww / 2, y0 + li * lineH); ctx.scale(sc, sc);
      ctx.globalAlpha = segA * (said ? 1 : 0.55);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 13; ctx.strokeStyle = '#000'; ctx.strokeText(w, 0, 0);
      ctx.fillStyle = active ? Y1 : '#fff'; ctx.fillText(w, 0, 0);
      ctx.restore();
      x += ww + space;
    }
  });
}
function vignette() {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
const SHOTS = [28.55, 29.25, 29.95, 30.75, 31.55];
function flash(t) {
  for (const [t0] of SCENES) {
    if (t0 === 0) continue;
    const d = t - t0;
    if (d >= 0 && d < 0.22) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - d / 0.22)})`; ctx.fillRect(0, 0, W, H); }
  }
  for (const s of SHOTS) { const d = t - s; if (d >= 0 && d < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - d / 0.12)})`; ctx.fillRect(0, 0, W, H); } }
  if (t < 0.25) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.25})`; ctx.fillRect(0, 0, W, H); }
  if (t > END - 0.4) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (END - 0.4)) / 0.4)})`; ctx.fillRect(0, 0, W, H); }
}
function disclaimer(t) {
  if (t < 54.35) return;
  ctx.save();
  ctx.globalAlpha = clamp((t - 54.35) / 0.4) * 0.8;
  ctx.font = '800 28px Montserrat'; ctx.textAlign = 'center'; ctx.fillStyle = '#e5e7eb';
  ctx.fillText('Example math, not a promise. Prices vary. Only resell genuine products.', W / 2, 1660);
  ctx.restore();
}

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  hideAll();
  let cur = SCENES[0][1];
  for (const [t0, fn] of SCENES) if (t >= t0) cur = fn;
  camera.position.copy(camPos); camera.lookAt(camLook);
  cur(t);
  updateRain(t);
  shoot.visible = studioCase.visible = false;
  camera.position.copy(camPos).add(tmpP.set(Math.sin(t * 0.7) * 0.2, Math.sin(t * 0.9 + 1) * 0.15, 0));
  camera.lookAt(camLook);
  sparkles.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
  ctx.drawImage(glCanvas, 0, 0);
  vignette();
  chip(t);
  headlines(t);
  stamp(t);
  captions(t);
  disclaimer(t);
  flash(t);
}

window.renderFrame = (t) => { renderFrame(t); return out.toDataURL('image/jpeg', 0.93); };
window.END = END;

(async () => {
  await Promise.all([
    document.fonts.load('100px Anton'), document.fonts.load('900 60px Montserrat'), document.fonts.load('800 60px Montserrat'),
    document.fonts.load(`60px ${EMOJI}`, '🎧📸'),
  ]);
  drawFront(frontTex.image); frontTex.needsUpdate = true;
  drawBack(backTex.image); backTex.needsUpdate = true;
  await buildTexts();
  buildPanels();
  buildSparkles();
  hideAll();
  window.READY = true;
})().catch((e) => { window.ERR = String(e && e.stack || e); });
