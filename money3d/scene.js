// "$10K in 1 month" – 3D money explainer (1080x1920, deterministic per-frame render)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { drawFront, drawBack, drawEdge, drawStrap } from './billtex.js';

const W = 1080, H = 1920;
const END = 58.2;

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

// ---------------------------------------------------------------- renderer
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
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0d2a1a'); g.addColorStop(0.55, '#06160d'); g.addColorStop(1, '#020604');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
scene.fog = new THREE.Fog(0x030a06, 90, 260);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, W / H, 0.5, 600);

scene.add(new THREE.HemisphereLight(0xcfe8d8, 0x0a140e, 0.55));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(18, 45, 28);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
key.shadow.bias = -0.0004;
key.shadow.radius = 3;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6dffb0, 1.1);
rim.position.set(-25, 18, -30);
scene.add(rim);
const fill = new THREE.PointLight(0xffd59a, 220, 90, 1.6);
fill.position.set(-14, 16, 24);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
  new THREE.MeshLambertMaterial({ color: 0x10261a }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------- bill materials
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
const frontTex = canvasTex(drawFront(document.createElement('canvas')));
const backTex = canvasTex(drawBack(document.createElement('canvas')));
const edgeCanvas = drawEdge(document.createElement('canvas'));
const strapCanvas = drawStrap(document.createElement('canvas'));
const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, color: 0xe2e6d6, roughness: 0.78, metalness: 0.0 });
const backMat = new THREE.MeshStandardMaterial({ map: backTex, color: 0xe2e6d6, roughness: 0.78, metalness: 0.0 });

const BILL_W = 15.6, BILL_D = 6.6, T = 0.035; // world units ~ cm, thickness exaggerated
function edgeMat(n, along = BILL_W) {
  const t = canvasTex(edgeCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(along / 8, n / 64);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}

// flexible bill: front + back surfaces sharing one bent shape
function bentPlane(bend, twist) {
  const g = new THREE.PlaneGeometry(BILL_W, BILL_D, 24, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / (BILL_W / 2);
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
    count,
    set(i, m4) { f.setMatrixAt(i, m4); b.setMatrixAt(i, m4); },
    commit() { f.instanceMatrix.needsUpdate = true; b.instanceMatrix.needsUpdate = true; },
    vis(v) { f.visible = b.visible = v; },
  };
}

// ---------------------------------------------------------------- objects
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function compose(px, py, pz, rx, ry, rz, s = 1, sy = s) {
  tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
  tmpP.set(px, py, pz); tmpS.set(s, sy, s);
  return tmpM.compose(tmpP, tmpQ, tmpS);
}

// rain bills
const RAIN_N = 170;
const rain = billPair(bentPlane(1.1, 0.9), RAIN_N);

// fan bills (flat, slight curve)
const fan = billPair(bentPlane(0.35, 0), 10);

// stacks
function stackMesh(nBills, count) {
  const h = nBills * T;
  const geo = new THREE.BoxGeometry(BILL_W, h, BILL_D);
  const mats = [edgeMat(nBills, BILL_D), edgeMat(nBills, BILL_D), frontMat, backMat, edgeMat(nBills), edgeMat(nBills)];
  const m = new THREE.InstancedMesh(geo, mats, count);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
  m.h = h;
  return m;
}
const mini = stackMesh(4, 30);       // ~$334 per day (shown as small stacks)
const thou = stackMesh(10, 10);      // $1,000 = 10 x $100

// $10,000 brick with strap
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
  const px = plainC.getContext('2d'); px.drawImage(strapCanvas, 20, 20, 60, 60, 0, 0, 256, 256);
  const topMat = new THREE.MeshStandardMaterial({ map: canvasTex(topC), roughness: 0.55 });
  const plainMat = new THREE.MeshStandardMaterial({ map: canvasTex(plainC), roughness: 0.55 });
  const strap = new THREE.Mesh(new THREE.BoxGeometry(3.6, h + 0.08, BILL_D + 0.08),
    [plainMat, plainMat, topMat, plainMat, plainMat, plainMat]);
  strap.castShadow = true;
  brick.add(strap);
  brick.strap = strap;
  brick.h = h;
  scene.add(brick);
}

// 3D gold text
const gold = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });
const goldGreen = new THREE.MeshStandardMaterial({ color: 0x57f08f, metalness: 0.85, roughness: 0.25, envMapIntensity: 1.4 });
const texts = {};
async function buildTexts() {
  const font = await new Promise((res) => new FontLoader().load('node_modules/three/examples/fonts/helvetiker_bold.typeface.json', res));
  const mk = (str, size, mat) => {
    const g = new TextGeometry(str, { font, size, depth: size * 0.28, curveSegments: 8, bevelEnabled: true, bevelThickness: size * 0.05, bevelSize: size * 0.035, bevelSegments: 3 });
    g.computeBoundingBox(); g.center();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  texts.t10k = mk('$10,000', 3.4, gold);
  texts.t334 = mk('$334', 3.0, goldGreen);
  texts.t1000 = mk('$1,000', 3.0, gold);
}

// UI-style 3D panels (rounded slab + crisp canvas face)
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function makePanel(w, h, pxW, draw, slabColor = 0x111a16) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedShape(w, h, Math.min(w, h) * 0.18), { depth: 0.5, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 3, curveSegments: 10 }),
    new THREE.MeshStandardMaterial({ color: slabColor, metalness: 0.4, roughness: 0.3 }));
  slab.castShadow = true;
  g.add(slab);
  const c = document.createElement('canvas');
  c.width = pxW; c.height = Math.round(pxW * h / w);
  draw(c.getContext('2d'), c.width, c.height);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, toneMapped: false }));
  face.position.z = 0.72;
  g.add(face);
  scene.add(g);
  return g;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const EMOJI = '"Noto Color Emoji"';
function skillPanel(emoji, label, accent) {
  return makePanel(17, 4.6, 1100, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#16231c'); g.addColorStop(1, '#0c120f');
    rr(ctx, 6, 6, w - 12, h - 12, 60); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = accent; ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(h * 0.52, h / 2, h * 0.33, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(h * 0.36)}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, h * 0.52, h / 2 + 6);
    ctx.font = `900 ${Math.round(h * 0.3)}px Montserrat`; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText(label, h * 1.0, h / 2 + 4);
  });
}
let skills = [];
let offer;
function buildPanels() {
  skills = [skillPanel('🎬', 'VIDEO EDITING', '#22c55e'), skillPanel('💻', 'WEB DESIGN', '#38bdf8'), skillPanel('🤖', 'AI AUTOMATION', '#a78bfa')];
  offer = makePanel(19, 12.5, 1100, (ctx, w, h) => {
    rr(ctx, 6, 6, w - 12, h - 12, 70); ctx.fillStyle = '#f7f7f2'; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = '#22c55e'; ctx.stroke();
    ctx.fillStyle = '#16a34a'; rr(ctx, w / 2 - 230, 50, 460, 96, 48); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 56px Montserrat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('MY OFFER', w / 2, 100);
    ctx.font = `120px ${EMOJI}`; ctx.fillText('🎬', w / 2, 270);
    ctx.fillStyle = '#0b0f0d'; ctx.font = '900 92px Montserrat';
    ctx.fillText('30 SHORT VIDEOS', w / 2, 420);
    ctx.fillStyle = '#4b5563'; ctx.font = '800 64px Montserrat';
    ctx.fillText('edited for you · every month', w / 2, 515);
    ctx.setLineDash([22, 16]); ctx.lineWidth = 6; ctx.strokeStyle = '#9ca3af';
    rr(ctx, 120, 580, w - 240, 120, 30); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#9ca3af'; ctx.font = '800 50px Montserrat'; ctx.fillText('PRICE', w / 2, 640);
  }, 0xe9ece6);
}

// DM bubbles
const BUB_N = 150;
let bubbles;
function buildBubbles() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  rr(x, 10, 10, 492, 250, 70); x.fill();
  x.beginPath(); x.moveTo(80, 250); x.lineTo(60, 310); x.lineTo(150, 250); x.fill();
  x.fillStyle = '#c9d4e4'; x.beginPath(); x.arc(95, 135, 52, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#9fb0c8';
  rr(x, 175, 85, 270, 34, 17); x.fill();
  rr(x, 175, 150, 200, 34, 17); x.fill();
  const tex = canvasTex(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false, side: THREE.DoubleSide });
  bubbles = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 1.625), mat, BUB_N);
  bubbles.frustumCulled = false;
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  for (let i = 0; i < BUB_N; i++) bubbles.setColorAt(i, col.set(0x3b82f6));
  scene.add(bubbles);
}
// bubble wall layout
const BCOLS = 10, BROWS = 15;
const slotOrder = [...Array(BUB_N).keys()].sort((a, b) => hash(a, 3) - hash(b, 3));
const YES = [];
for (let i = 0; i < BUB_N && YES.length < 15; i++) if (hash(i, 9) < 0.11 || BUB_N - i <= 15 - YES.length) YES.push(i);
const yesIdx = new Map(YES.map((v, k) => [v, k]));
function slotPos(s) {
  const c = s % BCOLS, r = Math.floor(s / BCOLS);
  return [(c - (BCOLS - 1) / 2) * 2.95, 30 - r * 1.9, 0];
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

// ---------------------------------------------------------------- per-scene state
const st = { rainAmt: 0, rainSpeed: 1, rainCenter: new THREE.Vector3(), rainDepth: 30 };
function hideAll() {
  rain.vis(true); fan.vis(false); st.rainDepth = 30; mini.visible = false; thou.visible = false; brick.visible = false; brick.scale.setScalar(1);
  for (const k in texts) texts[k].visible = false;
  for (const s of skills) s.visible = false;
  offer.visible = false; bubbles.visible = false;
  for (let i = 0; i < 10; i++) fan.set(i, ZERO);
}
function showText(m, x, y, z, s, ry = 0, rx = 0) {
  m.visible = s > 0.001;
  m.position.set(x, y, z); m.scale.setScalar(Math.max(s, 0.0001)); m.rotation.set(rx, ry, 0);
}

// Scene 1 — hook: $10,000 in 1 month
function s1(t) {
  camKeys(t, [[0, [0, 8, 50], [0, 9, 0]], [5.1, [0, 10, 40], [0, 9, 0]]]);
  brick.visible = true;
  brick.position.set(0, brick.h / 2, 0);
  brick.rotation.set(0, -0.5 + t * 0.22, 0);
  brick.strap.scale.set(1, 1, 1);
  showText(texts.t10k, 0, 19.5, 2, pop(t, 0.15, 0.45), Math.sin(t * 1.7) * 0.18);
  st.rainAmt = 0.5; st.rainSpeed = 1; st.rainCenter.set(0, 12, -15); st.rainDepth = 16;
}

// Scene 2 — the math: 10,000 / 30 = 334 a day
function s2(t) {
  camKeys(t, [[5.04, [0, 12, 38], [0, 6, 0]], [6.4, [0, 54, 38], [0, 0, 4]], [10.7, [0, 49, 33], [0, 0, 4]], [12.99, [0, 22, 14], [0, 0, 0]]]);
  const split = 6.2;
  if (t < split) {
    brick.visible = true;
    const lift = ramp(t, 5.3, split);
    brick.position.set(0, brick.h / 2 + lift * 6, 0);
    brick.rotation.set(0, lift * 1.5 + 0.6, 0);
    showText(texts.t10k, 0, 19.5, 2, 1 - ramp(t, 5.04, 5.5));
  }
  mini.visible = t >= split;
  for (let i = 0; i < 30; i++) {
    const c = i % 5, r = Math.floor(i / 5);
    const tx = (c - 2) * 6.6, tz = (r - 2.5) * 3.6;
    const t0 = split + i * 0.035, u = easeOutCubic((t - t0) / 0.6);
    let x = lerp(0, tx, u), z = lerp(0, tz, u), y = lerp(6, 0, u) + Math.sin(u * Math.PI) * 6 + mini.h * 0.38 / 2;
    let rot = (1 - u) * (hash(i) * 6 - 3);
    let s = 0.38;
    if (i === 12) { // one day highlighted
      const hl = ramp(t, 8.1, 8.7) * (1 - ramp(t, 10.6, 11.2));
      y += hl * 4; s *= 1 + hl * 0.35; rot += hl * t * 1.2;
    }
    // fly away on "let's break it down"
    const away = easeInCubic((t - 11.9 - hash(i, 2) * 0.6) / 0.7);
    y += away * 40; rot += away * 4;
    mini.setMatrixAt(i, t < t0 ? ZERO : compose(x, y, z, 0, rot, 0, s));
  }
  mini.instanceMatrix.needsUpdate = true;
  const s334 = pop(t, 8.0, 0.4) * (1 - ramp(t, 10.6, 11.0));
  showText(texts.t334, 0, 5, -1.8, s334 * 1.2, 0, -0.95);
  st.rainAmt = 0; st.rainCenter.set(0, 5, 0);
}

// Scene 3 — step 1: pick one skill
function s3(t) {
  camKeys(t, [[13.0, [0, 13, 46], [0, 12, 0]], [19.97, [3, 11, 38], [0, 11.5, 0]]]);
  const times = [16.6, 17.55, 18.55];
  skills.forEach((p, i) => {
    const a = pop(t, times[i], 0.45);
    p.visible = t >= times[i];
    p.position.set((1 - a) * (i % 2 ? 14 : -14), 17.3 - i * 5.8, 0);
    p.rotation.set(0, Math.sin(t * 1.3 + i) * 0.1, 0);
    p.scale.setScalar(Math.max(0.001, a));
  });
  // pick ONE: dim the others
  const pick = ramp(t, 19.0, 19.5);
  skills[1].position.z -= pick * 6; skills[2].position.z -= pick * 6;
  skills[0].scale.multiplyScalar(1 + pick * 0.12);
  // money floating behind, big $ glow
  brick.visible = t < 16.6;
  brick.position.set(0, 9 + Math.sin(t * 2) * 0.6, -4);
  brick.rotation.set(0.35, t * 0.9, 0.15);
  brick.scale.setScalar(Math.max(0.001, 1 - ramp(t, 16.0, 16.6)));
  st.rainAmt = 0.35; st.rainSpeed = 0.45; st.rainCenter.set(0, 12, -24); st.rainDepth = 14;
}

// Scene 4 — step 2: one clear offer
function s4(t) {
  camKeys(t, [[19.97, [0, 17, 52], [0, 15, 0]], [26.0, [0, 15, 44], [0, 14, 0]], [27.8, [-4, 13, 38], [0, 13, 0]]]);
  const a = pop(t, 23.2, 0.5);
  offer.visible = t >= 23.2;
  offer.position.set(0, 17.2 - (1 - a) * 10, 0);
  offer.rotation.set(-0.05, Math.sin(t * 0.9) * 0.12, 0);
  offer.scale.setScalar(Math.max(0.001, a * 0.9));
  // price stamp
  const p = pop(t, 26.2, 0.4);
  showText(texts.t1000, 0, 11.95, 1.6, p * 0.78, Math.sin(t * 2) * 0.1);
  // money fan: 10 x $100
  fan.vis(t >= 24.0);
  const appear = easeOutCubic((t - 24.0) / 0.5);
  const spread = easeOutBack((t - 26.2) / 0.6);
  for (let i = 0; i < 10; i++) {
    const ang = (i - 4.5) / 4.5 * 0.95 * spread;
    const piv = new THREE.Vector3(0, -1.5, 7);
    const r = 5.2;
    tmpE.set(0, 0, ang + Math.PI / 2);
    tmpQ.setFromEuler(tmpE);
    const cx = piv.x - Math.sin(ang) * r, cy = piv.y + Math.cos(ang) * r;
    tmpP.set(cx, cy - (1 - appear) * 16, piv.z + i * 0.06);
    tmpS.setScalar(0.66);
    fan.set(i, tmpM.compose(tmpP, tmpQ, tmpS));
  }
  fan.commit();
  st.rainAmt = 0.25; st.rainSpeed = 0.5; st.rainCenter.set(0, 14, -26); st.rainDepth = 14;
}

// Scene 5 — step 3: find clients (DMs wall)
const colA = new THREE.Color(), colB = new THREE.Color();
function s5(t) {
  camKeys(t, [[27.8, [0, 18, 70], [0, 18, 0]], [33.0, [0, 18, 64], [0, 18, 0]], [36.5, [0, 17, 58], [0, 17, 0]], [39.47, [4, 16, 44], [0, 17, 4]]]);
  bubbles.visible = t > 30.0;
  for (let i = 0; i < BUB_N; i++) {
    const t0 = i < 50 ? 30.15 + i * 0.05 : 33.3 + (i - 50) * 0.017;
    const u = easeOutCubic((t - t0) / 0.55);
    const [sx, sy] = slotPos(slotOrder[i]);
    let x = lerp(0, sx, u), y = lerp(-6, sy, u) + Math.sin(u * Math.PI) * 4, z = lerp(14, 0, u);
    let s = u, rz = (1 - u) * (hash(i) - 0.5) * 3;
    colA.set(0x3b82f6);
    const k = yesIdx.get(i);
    if (k !== undefined) {
      const yt = 35.85 + k * 0.08;
      const y1 = easeOutBack((t - yt) / 0.35);
      colA.lerp(colB.set(0x22c55e), clamp((t - yt) / 0.2));
      z += y1 * 4; s *= 1 + y1 * 0.35;
      // gather: 15 clients form a 5x3 block in front
      const g = easeOutCubic((t - 37.75 - k * 0.03) / 0.7);
      const gx = ((k % 5) - 2) * 3.6, gy = 21 - Math.floor(k / 5) * 2.6;
      x = lerp(x, gx, g); y = lerp(y, gy, g); z = lerp(z, 10, g); s *= 1 + g * 0.25;
    } else {
      const dim = ramp(t, 35.9, 36.6);
      colA.lerp(colB.set(0x15233a), dim * 0.85);
      z -= dim * 3 + ramp(t, 37.7, 38.4) * 6;
    }
    bubbles.setColorAt(i, colA);
    bubbles.setMatrixAt(i, t < t0 ? ZERO : compose(x, y, z, 0, 0, rz, s));
  }
  bubbles.instanceMatrix.needsUpdate = true;
  bubbles.instanceColor.needsUpdate = true;
  st.rainAmt = 0; st.rainCenter.set(0, 18, -10);
}

// Scene 6 — step 4: 10 clients x $1,000 = $10,000
function s6(t) {
  camKeys(t, [[39.47, [9, 14, 38], [0, 3, 0]], [44.3, [6, 9, 33], [0, 3, 0]], [46.4, [-5, 11, 36], [0, 5, 0]]]);
  const done = 44.4;
  thou.visible = t < done;
  for (let i = 0; i < 10; i++) {
    const t0 = 41.9 + i * 0.21;
    const u = (t - t0) / 0.32;
    const yRest = i * thou.h + thou.h / 2;
    let y = u < 1 ? lerp(yRest + 26, yRest, easeInCubic(u)) : yRest + Math.max(0, Math.sin((u - 1) * 9) * 0.6 * Math.exp(-(u - 1) * 4));
    const wob = (1 - clamp(u)) * (hash(i) - 0.5) * 1.4;
    thou.setMatrixAt(i, t < t0 ? ZERO : compose((hash(i, 1) - 0.5) * 0.3 * (1 - clamp(u)), y, (hash(i, 2) - 0.5) * 0.3, 0, wob + (hash(i, 4) - 0.5) * 0.06, 0));
  }
  thou.instanceMatrix.needsUpdate = true;
  brick.visible = t >= done;
  brick.position.set(0, brick.h / 2 + Math.sin(ramp(t, done, done + 0.5) * Math.PI) * 0.6, 0);
  brick.rotation.set(0, ramp(t, done, 46.4) * 0.8, 0);
  brick.strap.scale.set(Math.max(0.001, easeOutBack((t - done) / 0.35)), 1, 1);
  showText(texts.t10k, 0, 9, 0, pop(t, done + 0.15, 0.45) * 0.72, Math.sin(t * 2) * 0.15);
  st.rainAmt = ramp(t, done, done + 0.3) * 0.8; st.rainSpeed = 1.1; st.rainCenter.set(0, 10, -16); st.rainDepth = 14;
}

// Scene 7 — step 5: deliver & referrals (stacks multiply 1 -> 2 -> 4 -> 8)
function s7(t) {
  camKeys(t, [[46.4, [0, 13, 30], [0, 1, 0]], [49.4, [0, 16, 32], [0, 1, 0]], [51.72, [0, 44, 46], [0, 0, 0]]]);
  thou.visible = true;
  const waves = [49.6, 50.3, 51.0], ns = [2, 4, 8];
  const lay = (n, k) => {
    if (n === 1) return [0, 0];
    const a = (k / n) * Math.PI * 2 + 0.4, r = n === 2 ? 9 : n === 4 ? 12 : 17;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.6];
  };
  for (let k = 0; k < 10; k++) {
    const w0 = k === 0 ? -1 : k < 2 ? 0 : k < 4 ? 1 : 2;
    const born = w0 < 0 ? 46.4 : waves[w0];
    if (k >= 8 || t < born) { thou.setMatrixAt(k, ZERO); continue; }
    const parent = k < 2 ? 0 : k < 4 ? k - 2 : k - 4;
    let p = w0 <= 0 ? [0, 0] : lay(ns[w0 - 1], parent);
    for (let w = Math.max(0, w0); w < 3; w++) {
      const u = easeOutCubic((t - waves[w]) / 0.5);
      const q = lay(ns[w], k);
      p = [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];
    }
    const age = (t - born) / 0.45;
    const jump = k === 0 ? 0 : Math.sin(clamp(age) * Math.PI) * 4;
    const s = k === 0 ? easeOutBack((t - 46.4) / 0.4) : easeOutBack(age);
    thou.setMatrixAt(k, compose(p[0], thou.h / 2 + jump, p[1], 0, (1 - clamp(age)) * 3 + Math.sin(t + k) * 0.05, 0, Math.max(0.001, s)));
  }
  thou.instanceMatrix.needsUpdate = true;
  st.rainAmt = 0;
}

// Scene 8 — outro: hero brick, heavy money rain, orbit
function s8(t) {
  const u = t - 51.72;
  const ang = 0.45 - u * 0.13;
  const R = 42 - u * 1.2;
  camPos.set(Math.sin(ang) * R, 9 + u * 0.5, Math.cos(ang) * R);
  camLook.set(0, 6.5, 0);
  brick.visible = true;
  const a = pop(t, 51.75, 0.5);
  brick.position.set(0, brick.h / 2 + (1 - a) * 20, 0);
  brick.rotation.set(0, 0.3, 0);
  brick.strap.scale.set(1, 1, 1);
  const tt = texts.t10k;
  showText(tt, 0, 10.5, 0, pop(t, 55.2, 0.5) * 0.72, Math.atan2(camPos.x, camPos.z));
  st.rainAmt = 0.75; st.rainSpeed = 1; st.rainCenter.set(0, 12, -14); st.rainDepth = 18;
}

const SCENES = [[0, s1], [5.04, s2], [13.0, s3], [19.97, s4], [27.8, s5], [39.47, s6], [46.4, s7], [51.72, s8]];

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
  [0.0, 2.45, 'How to make $10,000 in ONE month'],
  [3.02, 3.52, 'No luck.'],
  [3.9, 4.42, 'Just math.'],
  [5.04, 7.65, '$10,000 ÷ 30 days…'],
  [7.96, 10.39, 'is about $334 a day.'],
  [10.875, 11.37, 'Sounds hard?'],
  [11.8, 12.53, "Let's break it down."],
  [13.01, 13.58, 'Step one.'],
  [14.01, 16.21, 'Pick ONE skill people already pay for.'],
  [16.63, 19.5, 'Video editing, web design, or AI automation.'],
  [19.97, 20.53, 'Step two.'],
  [20.94, 22.87, 'Turn it into one clear offer.'],
  [23.22, 23.7, 'For example:'],
  [24.1, 25.83, 'I edit 30 short videos a month,'],
  [26.21, 27.35, 'for $1,000.'],
  [27.8, 28.4, 'Step three.'],
  [28.89, 29.78, 'Find clients.'],
  [30.12, 32.96, 'Send 50 personal messages every single day.'],
  [33.26, 35.22, "That's 1,500 messages a month."],
  [35.72, 37.4, 'If just 1% say yes…'],
  [37.71, 39.05, "that's 15 clients."],
  [39.47, 40.08, 'Step four.'],
  [40.46, 41.37, 'You only need 10.'],
  [41.83, 44.12, '10 clients × $1,000…'],
  [44.4, 46.02, '= $10,000.'],
  [46.4, 47.03, 'Step five.'],
  [47.44, 49.0, 'Deliver insanely well,'],
  [49.22, 51.28, 'and ask every client for a referral.'],
  [51.72, 52.41, 'One skill.'],
  [52.63, 53.41, 'One offer.'],
  [53.67, 54.84, 'A lot of outreach.'],
  [55.21, 56.87, 'Save this video, and start today.'],
];

const Y1 = '#facc15', G1 = '#4ade80', WH = '#ffffff';
// headline blocks: [t0, t1, [[text, color, size, y, popAt?]...]]
const HEAD = [
  [0.1, 3.0, [['HOW TO MAKE', WH, 120, 250], ['IN 1 MONTH', Y1, 150, 820, 0.6]]],
  [3.02, 5.04, [['NO LUCK.', WH, 170, 300], ['JUST MATH.', G1, 170, 480, 3.9]]],
  [5.04, 10.85, [['$10,000 ÷ 30 DAYS', WH, 112, 260], ['= $334 / DAY', G1, 150, 420, 7.96]]],
  [10.875, 13.0, [['SOUNDS HARD?', WH, 150, 300], ["LET'S BREAK IT DOWN 👇", Y1, 96, 460, 11.8]]],
  [14.0, 19.97, [['PICK ONE SKILL', WH, 130, 380], ['PEOPLE ALREADY PAY FOR', Y1, 76, 500, 14.6]]],
  [20.94, 27.8, [['ONE CLEAR OFFER', WH, 124, 380]]],
  [28.89, 30.1, [['FIND CLIENTS', WH, 140, 380]]],
  [35.72, 37.7, [['ONLY 1% SAY YES', Y1, 120, 380]]],
  [37.71, 39.47, [['= 15 CLIENTS ✅', G1, 130, 380]]],
  [40.46, 41.8, [['YOU ONLY NEED 10', WH, 130, 380]]],
  [41.83, 44.4, [['10 × $1,000', WH, 150, 380]]],
  [44.4, 46.4, [['= $10,000 💰', G1, 150, 380]]],
  [47.44, 49.2, [['DELIVER INSANELY WELL', WH, 104, 380], ['⭐⭐⭐⭐⭐', WH, 90, 510, 47.8]]],
  [49.22, 51.72, [['ASK FOR REFERRALS', WH, 118, 380], ['1 CLIENT → 2 → 4 → 8', Y1, 84, 510, 49.6]]],
  [51.72, 55.2, [['ONE SKILL.', WH, 130, 300], ['ONE OFFER.', WH, 130, 450, 52.63], ['A LOT OF OUTREACH.', Y1, 110, 600, 53.67]]],
  [55.2, END, [['SAVE THIS 📌', WH, 140, 320], ['START TODAY', G1, 160, 490, 55.9]]],
];
const CHIPS = [[13.01, 19.97, 'STEP 1'], [19.97, 27.8, 'STEP 2'], [27.8, 39.47, 'STEP 3'], [39.47, 46.4, 'STEP 4'], [46.4, 51.72, 'STEP 5']];

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
  ctx.translate(W / 2, y);
  ctx.scale(sc, sc);
  ctx.globalAlpha = a;
  ctx.font = `${s}px ${fam}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.lineWidth = s * 0.14; ctx.strokeStyle = '#000';
  ctx.strokeText(text, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
function counterHeadline(t) {
  if (t >= 30.12 && t < 35.72) {
    let n;
    if (t < 33.26) n = Math.round(50 * clamp((t - 30.12) / 2.6));
    else n = Math.round(lerp(50, 1500, easeOutCubic((t - 33.26) / 1.8)));
    const label = t < 33.26 ? 'DMs TODAY' : 'DMs THIS MONTH';
    const a = clamp((t - 30.12) / 0.15) * (1 - clamp((t - 35.6) / 0.12));
    bigText(n.toLocaleString('en-US'), n >= 1500 ? Y1 : WH, 170, 420, a, 1 + 0.06 * (1 - clamp((t - 33.26) / 0.3)) * (t > 33.26 ? 1 : 0));
    bigText(label, '#93c5fd', 80, 560, a, 1);
  }
}
function chip(t) {
  for (const [t0, t1, label] of CHIPS) {
    if (t < t0 || t >= t1) continue;
    const s = easeOutBack((t - t0) / 0.3);
    ctx.save();
    ctx.translate(W / 2, 230); ctx.scale(s, s);
    ctx.font = '900 58px Montserrat';
    const w = ctx.measureText(label).width + 90;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    rr(ctx, -w / 2, -48, w, 96, 48);
    ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 5; ctx.strokeStyle = '#bbf7d0'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 3);
    ctx.restore();
  }
}
function headlines(t) {
  for (const [t0, t1, lines] of HEAD) {
    if (t < t0 || t >= t1) continue;
    const out = clamp((t1 - t) / 0.12);
    for (const [txt, col, size, y, at] of lines) {
      const ta = at ?? t0;
      if (t < ta) continue;
      const k = (t - ta) / 0.28;
      bigText(txt, col, size, y, clamp(k * 3) * out, 0.55 + 0.45 * easeOutBack(k));
    }
  }
  counterHeadline(t);
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
  // layout with wrapping
  const size = 66;
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
  const y0 = 1500 - ((lines.length - 1) * lineH) / 2;
  const segA = clamp((t - a + 0.05) / 0.12);
  lines.forEach((ln, li) => {
    const tw = ln.reduce((s, [, ww]) => s + ww, 0) + space * (ln.length - 1);
    let x = W / 2 - tw / 2;
    for (const [w, ww, i] of ln) {
      const active = t >= starts[i] && (i === words.length - 1 ? t < b + 0.3 : t < starts[i + 1]);
      const said = t >= starts[i];
      const sc = active ? 1 + 0.12 * (1 - clamp((t - starts[i]) / 0.15)) : 1;
      ctx.save();
      ctx.translate(x + ww / 2, y0 + li * lineH);
      ctx.scale(sc, sc);
      ctx.globalAlpha = segA * (said ? 1 : 0.55);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 13; ctx.strokeStyle = '#000';
      ctx.strokeText(w, 0, 0);
      ctx.fillStyle = active ? Y1 : '#fff';
      ctx.fillText(w, 0, 0);
      ctx.restore();
      x += ww + space;
    }
  });
}
function vignette() {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function flash(t) {
  for (const [t0] of SCENES) {
    if (t0 === 0) continue;
    const d = t - t0;
    if (d >= 0 && d < 0.22) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - d / 0.22)})`; ctx.fillRect(0, 0, W, H); }
  }
  if (t < 0.25) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.25})`; ctx.fillRect(0, 0, W, H); }
  if (t > END - 0.4) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (END - 0.4)) / 0.4)})`; ctx.fillRect(0, 0, W, H); }
}
function disclaimer(t) {
  if (t < 55.2) return;
  ctx.save();
  ctx.globalAlpha = clamp((t - 55.2) / 0.4) * 0.8;
  ctx.font = '800 30px Montserrat'; ctx.textAlign = 'center'; ctx.fillStyle = '#e5e7eb';
  ctx.fillText('Example math, not a promise. Results depend on your skill & effort.', W / 2, 1650);
  ctx.restore();
}

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  hideAll();
  let cur = SCENES[0][1];
  for (const [t0, fn] of SCENES) if (t >= t0) cur = fn;
  cur(t);
  updateRain(t);
  // gentle handheld drift
  camera.position.copy(camPos).add(tmpP.set(Math.sin(t * 0.7) * 0.25, Math.sin(t * 0.9 + 1) * 0.18, 0));
  camera.lookAt(camLook);
  renderer.render(scene, camera);
  ctx.drawImage(glCanvas, 0, 0);
  vignette();
  chip(t);
  headlines(t);
  captions(t);
  disclaimer(t);
  flash(t);
}

window.renderFrame = (t) => { renderFrame(t); return out.toDataURL('image/jpeg', 0.93); };
window.END = END;

(async () => {
  await Promise.all([
    document.fonts.load('100px Anton'), document.fonts.load('900 60px Montserrat'), document.fonts.load('800 60px Montserrat'),
    document.fonts.load(`60px ${EMOJI}`, '🎬💰'),
  ]);
  // redraw bill textures now that fonts are loaded
  drawFront(frontTex.image); frontTex.needsUpdate = true;
  drawBack(backTex.image); backTex.needsUpdate = true;
  await buildTexts();
  buildPanels();
  buildBubbles();
  hideAll();
  window.READY = true;
})().catch((e) => { window.ERR = String(e && e.stack || e); });
