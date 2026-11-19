// "How to build a business" – clean, light 3D explainer (1080x1920, supersampled)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePerson, makeDog, SKINS, TOPS, HAIRS } from './persons.js';

const W = 1080, H = 1920, SS = 2; // supersampling factor
const END = 52.6;

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const easeOutBack = (x, c1 = 1.6) => { x = clamp(x); const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const pop = (t, t0, d = 0.4) => easeOutBack((t - t0) / d);
function hash(i, k = 0) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

// palette
const C = { ink: '#1e293b', sub: '#64748b', green: '#10b981', amber: '#f59e0b', coral: '#f43f5e', sky: '#38bdf8', violet: '#8b5cf6', paper: '#f6f3ec' };
const BLOCKS = [
  { label: 'PROBLEM', emoji: '🎯', col: 0xf43f5e },
  { label: 'CUSTOMERS', emoji: '💬', col: 0xf59e0b },
  { label: 'PRODUCT', emoji: '📱', col: 0x38bdf8 },
  { label: 'SALES', emoji: '💰', col: 0x10b981 },
  { label: 'SYSTEMS', emoji: '⚙️', col: 0x8b5cf6 },
];
const FONT = '"Inter Display", Inter, Montserrat, sans-serif';
const EMOJI = '"Noto Color Emoji"';

// ---------------------------------------------------------------- renderer
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W * SS, H * SS, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
const BG = new THREE.Color('#efe9df');
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#fbf9f5'); g.addColorStop(0.6, '#f2ede4'); g.addColorStop(1, '#efe9df');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
scene.fog = new THREE.Fog(BG, 70, 160);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(42, W / H, 0.5, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d0bf, 1.25));
const key = new THREE.DirectionalLight(0xfff6ea, 2.2);
key.position.set(-16, 34, 22);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 120 });
key.shadow.radius = 14;
key.shadow.blurSamples = 20;
key.shadow.bias = -0.0005;
scene.add(key);
const fillL = new THREE.DirectionalLight(0xdbeafe, 0.6);
fillL.position.set(20, 10, 10);
scene.add(fillL);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.95, envMapIntensity: 0.2 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function plastic(col, opts = {}) {
  return new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, ...opts });
}
function labelPlane(w, h, pxW, draw) {
  const c = document.createElement('canvas'); c.width = pxW; c.height = Math.round(pxW * h / w);
  draw(c.getContext('2d'), c.width, c.height);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, toneMapped: false }));
  m.canvas = c;
  return m;
}
function track(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(o); return o; }

// ---------------------------------------------------------------- objects
// labelled step blocks (intro row + final tower)
const blockGeo = new RoundedBoxGeometry(11, 3.4, 5, 6, 0.55);
const blocks = BLOCKS.map((b, i) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(blockGeo, plastic(b.col));
  g.add(body);
  const lbl = labelPlane(10, 3, 1000, (ctx, w, h) => {
    ctx.font = `${Math.round(h * 0.5)}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.emoji, h * 0.55, h / 2 + 6);
    ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.round(h * 0.36)}px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(b.label, h * 1.05, h / 2 + 4);
  });
  lbl.position.z = 2.51; lbl.castShadow = false;
  g.add(lbl);
  // small numbered cube version for the intro
  return track(g);
});
const numCubes = BLOCKS.map((b, i) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(3.6, 3.6, 3.6, 6, 0.6), plastic(b.col)));
  const l = labelPlane(3, 3, 300, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(h * 0.62)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), w / 2, h / 2 + 6);
  });
  l.position.z = 1.81; g.add(l);
  return track(g);
});
const seed = track(new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.6, 2.6, 6, 0.5), plastic(0x1e293b)));

// speech bubbles (complaints)
function bubbleShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(-w / 2 + r + 0.6, -h / 2); s.lineTo(-w / 2 + r - 0.2, -h / 2 - 1.0); s.lineTo(-w / 2 + r + 1.6, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
const COMPLAINTS = [['💡', 'An app for… everything?'], ['😩', 'My walker cancelled again'], ['💸', '$40 for one walk?!'], ['😤', 'I work until 8pm'], ['🐕', 'He needs a walk NOW']];
const bubbles = COMPLAINTS.map(([e, txt], i) => {
  const g = new THREE.Group();
  const w = 11, h = 3;
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(bubbleShape(w, h, 1.2), { depth: 0.4, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 3, curveSegments: 12 }), plastic(0xffffff, { roughness: 0.5 }));
  g.add(slab);
  const l = labelPlane(w - 0.6, h - 0.4, 1000, (ctx, cw, ch) => {
    ctx.font = `${Math.round(ch * 0.5)}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, ch * 0.55, ch / 2 + 6);
    ctx.fillStyle = C.ink; ctx.font = `800 ${Math.round(ch * 0.3)}px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(txt, ch * 1.05, ch / 2 + 4);
  });
  l.position.z = 0.6; g.add(l);
  return track(g);
});
// lightbulb (an idea) + red cross
const bulb = new THREE.Group();
{
  const glass = new THREE.Mesh(new THREE.SphereGeometry(2.4, 40, 30), new THREE.MeshPhysicalMaterial({ color: 0xfff3c4, emissive: 0xffd36b, emissiveIntensity: 0.55, roughness: 0.15, clearcoat: 1 }));
  glass.position.y = 3.4; glass.scale.set(1, 1.08, 1); bulb.add(glass);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 1.6, 32), plastic(0xcbd5e1, { metalness: 0.6, roughness: 0.3 }));
  neck.position.y = 0.6; bulb.add(neck);
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.12, 10, 32), plastic(0x94a3b8, { metalness: 0.6 })); r.rotation.x = Math.PI / 2; r.position.y = 0.1 + k * 0.45; bulb.add(r); }
  const xm = plastic(0xef4444);
  for (const s of [-1, 1]) { const bar = new THREE.Mesh(new RoundedBoxGeometry(8, 0.9, 0.9, 4, 0.4), xm); bar.rotation.z = s * Math.PI / 4; bar.position.set(0, 2.6, 3); bar.name = 'x'; bulb.add(bar); }
  track(bulb);
}
// coin
const coinTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(110, 100, 10, 128, 128, 128); g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#f59e0b');
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#b45309'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#92400e'; x.font = `900 150px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 128, 138);
  return canvasTex(c);
})();
const coinGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.3, 40);
const coinMats = [new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.5, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.5, roughness: 0.3 })];
const coins = [...Array(11)].map(() => { const m = new THREE.Mesh(coinGeo, coinMats); m.castShadow = true; scene.add(m); return m; });

// pawns (people)
const PAWN_COLS = [0xf43f5e, 0xf59e0b, 0x10b981, 0x38bdf8, 0x8b5cf6, 0xec4899, 0x14b8a6, 0x6366f1];
const pawnBody = new THREE.CapsuleGeometry(0.85, 1.4, 8, 20);
const pawnHead = new THREE.SphereGeometry(0.85, 28, 20);
const eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
const skinMat = plastic(0xf1c7a5, { clearcoat: 0.2, roughness: 0.6 });
function makePawn(i) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(pawnBody, plastic(PAWN_COLS[i % PAWN_COLS.length])); b.position.y = 1.55; g.add(b);
  const h = new THREE.Mesh(pawnHead, skinMat); h.position.y = 3.55; g.add(h);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.3, 3.65, 0.78); g.add(e); }
  return track(g);
}
const STYLES = ['short', 'long', 'curly', 'cap', 'bun', 'short', 'long'];
const pawns = [...Array(20)].map((_, i) => {
  const p = makePerson({ skin: SKINS[(i * 5 + 1) % SKINS.length], top: TOPS[(i * 3) % TOPS.length], hair: HAIRS[(i * 7) % HAIRS.length], hairStyle: STYLES[i % STYLES.length], pants: [0x1e293b, 0x334155, 0x1d4ed8, 0x78716c][i % 4], glasses: i % 5 === 2, capCol: TOPS[(i + 4) % TOPS.length] });
  p.seed = i * 1.7;
  scene.add(p);
  return p;
});
const mia = makePerson({ skin: SKINS[1], top: 0xffffff, jacket: 0x10b981, hair: 0x2a1b12, hairStyle: 'bun', pants: 0x1e293b, shoe: 0xffffff });
scene.add(mia);
{
  const ph = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.9, 0.18, 3, 0.15), plastic(0x0f172a, { roughness: 0.25 }));
  ph.position.set(0, -0.6, 0.5); ph.rotation.set(Math.PI / 2 + 0.2, 0, 0); mia.prop.add(ph); mia.phoneProp = ph;
}
const dog = makeDog(0xc68a3a); dog.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); scene.add(dog);
const chatTex = labelPlane(1.8, 1.4, 180, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; rr(ctx, 6, 6, w - 12, h - 34, 34); ctx.fill();
  ctx.beginPath(); ctx.moveTo(40, h - 30); ctx.lineTo(30, h - 4); ctx.lineTo(70, h - 30); ctx.fill();
  ctx.fillStyle = '#94a3b8'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(w / 2 - 34 + k * 34, (h - 28) / 2 + 3, 9, 0, Math.PI * 2); ctx.fill(); }
}).material;
const chats = pawns.map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), chatTex); scene.add(m); return m; });

// MVP: messy pile of grey blocks -> one clean block
const MESS_N = 34;
const messy = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.15), plastic(0xcbd5e1), MESS_N);
messy.castShadow = messy.receiveShadow = true; messy.frustumCulled = false; scene.add(messy);
const mvp = new THREE.Group();
{
  mvp.add(new THREE.Mesh(new RoundedBoxGeometry(5, 5, 5, 6, 0.8), plastic(0x10b981)));
  const l = labelPlane(4.4, 2.4, 500, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(h * 0.6)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MVP', w / 2, h / 2 + 6); });
  l.position.z = 2.51; mvp.add(l);
  track(mvp);
}
// phone with a one-button app
const phone = new THREE.Group();
{
  phone.add(new THREE.Mesh(new RoundedBoxGeometry(6.2, 12.4, 0.7, 6, 0.6), plastic(0x0f172a, { roughness: 0.25 })));
  const scr = labelPlane(5.6, 11.7, 600, (ctx, w, h) => {
    rr(ctx, 0, 0, w, h, 56); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.fillStyle = '#0f172a'; rr(ctx, w / 2 - 70, 18, 140, 30, 15); ctx.fill();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.font = `900 54px ${FONT}`; ctx.fillText('WalkBuddy', w / 2, 170);
    ctx.fillStyle = C.sub; ctx.font = `700 30px ${FONT}`; ctx.fillText('trusted dog walkers,', w / 2, 220); ctx.fillText('booked in 10 seconds.', w / 2, 258);
    ctx.font = `220px ${EMOJI}`; ctx.fillText('🐕', w / 2, 560);
    ctx.fillStyle = '#10b981'; rr(ctx, 60, h - 260, w - 120, 130, 65); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 50px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('Book a walk', w / 2, h - 193);
  });
  scr.position.z = 0.36; phone.add(scr);
  track(phone);
}
// action cards (message / call / serve)
function card(e, txt, col) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(5.4, 5.4, 0.8, 6, 0.6), plastic(0xffffff, { roughness: 0.5 })));
  const l = labelPlane(5, 5, 400, (ctx, w, h) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h * 0.38, h * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(h * 0.26)}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, w / 2, h * 0.39 + 4);
    ctx.fillStyle = C.ink; ctx.font = `900 ${Math.round(h * 0.13)}px ${FONT}`; ctx.fillText(txt, w / 2, h * 0.8);
  });
  l.position.z = 0.42; g.add(l);
  return track(g);
}
const actions = [card('✉️', 'MESSAGE', '#dbeafe'), card('📞', 'CALL', '#dcfce7'), card('🤝', 'SERVE', '#fef3c7')];
// bar chart
const CHANNELS = ['ADS', 'SEO', 'REFERRALS', 'SOCIAL', 'OUTREACH'];
const bars = CHANNELS.map((n, i) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1, 2.6, 4, 0.35), plastic(i === 2 ? 0x10b981 : 0xcbd5e1));
  m.position.y = 0.5; g.add(m); g.bar = m;
  const l = labelPlane(4.2, 1.1, 420, (ctx, w, h) => { ctx.fillStyle = i === 2 ? C.green : C.sub; ctx.font = `900 ${Math.round(h * 0.55)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, w / 2, h / 2 + 3); });
  l.rotation.x = -Math.PI / 2; l.position.set(0, 0.02, 2.5); g.add(l);
  return track(g);
});
// gear
function gearShape(R, r, teeth) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rad = i % 2 ? r : R;
    if (i === 0) s.moveTo(Math.cos(a0) * rad, Math.sin(a0) * rad);
    s.lineTo(Math.cos(a0) * rad, Math.sin(a0) * rad); s.lineTo(Math.cos(a1) * rad, Math.sin(a1) * rad);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.4, 0, Math.PI * 2, true); s.holes.push(hole);
  return s;
}
const gear = track(new THREE.Mesh(new THREE.ExtrudeGeometry(gearShape(3.2, 2.6, 12), { depth: 1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), plastic(0x8b5cf6)));
const gear2 = track(new THREE.Mesh(new THREE.ExtrudeGeometry(gearShape(2.0, 1.6, 8), { depth: 1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), plastic(0xa78bfa)));
// arrow up (growth)
const arrow = new THREE.Group();
{
  const m = plastic(0x10b981);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 24), m); shaft.position.y = 3; arrow.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 32), m); head.position.y = 7.2; arrow.add(head);
  track(arrow);
}
// flag on top of the finished tower
const flag = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 12), plastic(0x334155)); pole.position.y = 3; flag.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2, 10, 1), new THREE.MeshStandardMaterial({ color: 0x1e293b, side: THREE.DoubleSide, roughness: 0.7 }));
  cloth.position.set(1.75, 4.8, 0); flag.add(cloth); flag.cloth = cloth;
  track(flag);
}
// confetti
const CONF_N = 120;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 0.6), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), CONF_N);
confetti.frustumCulled = false;
{ const col = new THREE.Color(); for (let i = 0; i < CONF_N; i++) confetti.setColorAt(i, col.set(PAWN_COLS[i % PAWN_COLS.length])); }
scene.add(confetti);

// ---------------------------------------------------------------- camera & scene control
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function camKeys(t, keys) {
  if (t <= keys[0][0]) { camPos.fromArray(keys[0][1]); camLook.fromArray(keys[0][2]); return; }
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0, l0] = keys[i], [t1, p1, l1] = keys[i + 1];
    if (t <= t1) {
      const u = easeInOut((t - t0) / (t1 - t0));
      camPos.set(lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u), lerp(p0[2], p1[2], u));
      camLook.set(lerp(l0[0], l1[0], u), lerp(l0[1], l1[1], u), lerp(l0[2], l1[2], u));
      return;
    }
  }
  const k = keys[keys.length - 1]; camPos.fromArray(k[1]); camLook.fromArray(k[2]);
}
const ALL = [...blocks, ...numCubes, seed, ...bubbles, bulb, ...coins, ...pawns, ...chats, messy, mvp, phone, ...actions, ...bars, gear, gear2, arrow, flag, confetti, mia, dog];
function hideAll() { for (const o of ALL) { o.visible = false; o.scale.setScalar(1); o.rotation.set(0, 0, 0); } }
function place(o, x, y, z, s = 1, ry = 0, rx = 0, rz = 0) {
  o.visible = s > 0.002;
  o.position.set(x, y, z); o.scale.setScalar(Math.max(0.001, s)); o.rotation.set(rx, ry, rz);
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function compose(px, py, pz, rx, ry, rz, s = 1) { tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE); tmpP.set(px, py, pz); tmpS.setScalar(s); return tmpM.compose(tmpP, tmpQ, tmpS); }

const PS = 0.42; // people scale (≈7 units tall)
function person(p, x, z, s, ry, q, t) {
  place(p, x, 0, z, s * PS, ry);
  p.pose({ t, seed: p.seed ?? 0, ...q });
}

// A — intro: Mia + five steps
function sA(t) {
  camKeys(t, [[0, [0, 8, 40], [0, 6, 0]], [4.14, [0, 7.5, 33], [0, 6, 0]]]);
  const sd = pop(t, 0.15, 0.5) * (1 - ramp(t, 2.0, 2.35));
  place(seed, 2.5, 5.2 + Math.sin(t * 2) * 0.15, 0, sd, t * 0.8, 0.4);
  // Mia walks in and waves
  const wk = clamp((t - 0.1) / 1.4);
  person(mia, lerp(-16, -3.2, easeOutCubic(wk)), 3, 1, lerp(Math.PI / 2, 0.15, ramp(t, 1.2, 1.7)), { walk: wk < 1 ? 1 : 0, wave: ramp(t, 1.5, 1.8) * (1 - ramp(t, 3.4, 3.8)) }, t);
  for (let i = 0; i < 5; i++) {
    const t0 = 2.25 + i * 0.22;
    const u = easeOutBack((t - t0) / 0.45);
    const x = (i - 2) * 4.6;
    const y = lerp(16, 1.8, easeOutCubic((t - t0) / 0.45));
    place(numCubes[i], x, y, -5, clamp(u * 1.4), Math.sin(t * 1.2 + i) * 0.12 - 0.15);
  }
}

// B — step 1: find a problem (example: dog owners)
function sB(t) {
  camKeys(t, [[4.14, [0, 12, 44], [0, 9, 0]], [12.63, [-3, 11, 41], [0, 9, 0]]]);
  // Mia's "idea" gets crossed out
  const ba = pop(t, 6.4, 0.45) * (1 - ramp(t, 8.0, 8.5));
  place(bulb, 2, 9.5, 0, ba * 1.0, Math.sin(t * 1.2) * 0.3);
  bulb.children.filter((c) => c.name === 'x').forEach((c, k) => { c.visible = t > 7.1 + k * 0.08; c.scale.setScalar(Math.max(0.001, easeOutBack((t - 7.1 - k * 0.08) / 0.3))); });
  const miaOut = ramp(t, 8.4, 8.8);
  person(mia, lerp(-4, -16, miaOut), 2, 1, 0.3, { talk: t < 8.3 ? 1 : 0, walk: miaOut > 0 && miaOut < 1 ? 1 : 0 }, t);
  const ia = pop(t, 5.25, 0.45) * (1 - ramp(t, 6.2, 6.5));
  place(bubbles[0], 1.5, 12.5, 0, ia * 0.85, -0.1);
  // dog owners with real complaints
  const owners = [[-6.5, 0], [0, 1.5], [6.5, 0]];
  owners.forEach(([x, z], k) => person(pawns[k], x, z, pop(t, 8.75 + k * 0.15, 0.45), -x * 0.03, { sad: 1, talk: 0 }, t));
  place(dog, 3.0, 0, 4.5, pop(t, 9.1, 0.4) * 0.55, -0.6);
  dog.pose(t, 0);
  const pos = [[0, 0, 0], [-4.6, 9.4, 0], [4.6, 9.4, 1], [0, 12.0, 0.5], [-2.6, 14.4, 0]];
  for (let i = 1; i < 5; i++) {
    const t0 = 8.95 + (i - 1) * 0.5;
    const [x, y, z] = pos[i];
    place(bubbles[i], x, y + Math.sin(t * 1.6 + i) * 0.2, z, pop(t, t0, 0.45) * 0.62, Math.sin(t * 0.9 + i) * 0.08);
    // "...and would pay to fix" -> coin next to each bubble
    place(coins[i], x + 4.1, y + 0.9, z + 0.8, easeOutBack((t - 11.0 - i * 0.1) / 0.4) * 0.62, t * 3 + i, Math.PI / 2);
  }
}

// C — step 2: talk to 20 potential customers
function sC(t) {
  camKeys(t, [[12.63, [0, 17, 42], [0, 5, -2]], [20.45, [4, 15, 36], [0, 5, -2]]]);
  person(mia, 0, 7.5, pop(t, 12.8, 0.4) * 1.05, Math.PI, { talk: t > 13.7 ? 1 : 0 }, t);
  for (let i = 0; i < 20; i++) {
    const c = i % 5, r = Math.floor(i / 5);
    const x = (c - 2) * 4.0 + (r % 2) * 1.0, z = -r * 3.8 + 1;
    const u = pop(t, 13.75 + i * 0.06, 0.4);
    const ct = 14.3 + i * 0.13;
    const talking = t > ct ? 1 : 0;
    person(pawns[i], x, z, u, -x * 0.02, { nod: talking, talk: talking * (i % 3 === 0 ? 1 : 0) }, t);
    const ca = pop(t, ct, 0.3);
    const ch = chats[i];
    ch.visible = ca > 0.01;
    ch.position.set(x + 0.9, 8.0 + Math.sin(t * 3 + i) * 0.1, z);
    ch.scale.setScalar(Math.max(0.001, ca));
  }
}

// D — step 3: MVP
function sD(t) {
  camKeys(t, [[20.45, [0, 13, 40], [0, 8, 0]], [23.6, [0, 12, 36], [0, 7, 0]], [24.9, [0, 12, 38], [0, 9, 0]], [28.62, [4, 12, 34], [0, 9, 0]]]);
  messy.visible = t < 24.2;
  for (let i = 0; i < MESS_N; i++) {
    const t0 = 20.6 + i * 0.03;
    const u = easeOutBack((t - t0) / 0.35);
    const lay = Math.floor(i / 7), k = i % 7;
    const x = (k - 3) * 1.9 + (hash(i) - 0.5) * 1.6 + 2, y = 1.4 + lay * 2.2 + hash(i, 2), z = (hash(i, 3) - 0.5) * 3 - 2;
    const s = (1.2 + hash(i, 4) * 1.6) * u;
    const fly = easeOutCubic((t - 23.2 - hash(i, 5) * 0.4) / 0.6);
    messy.setMatrixAt(i, t < t0 ? ZERO : compose(x * (1 + fly * 2.5), y + fly * 8, z - fly * 10, hash(i, 6) * 3 * (1 + fly * 2), hash(i, 7) * 3, hash(i, 8), s * (1 - fly)));
  }
  messy.instanceMatrix.needsUpdate = true;
  const ma = pop(t, 23.8, 0.45) * (1 - ramp(t, 24.9, 25.2));
  place(mvp, 2, 4 + Math.sin(t * 2) * 0.2, 0, ma * 1.15, Math.sin(t * 1.4) * 0.5 + 0.4, 0.15);
  const pa = pop(t, 25.1, 0.5);
  place(phone, 3.0, 9.6 + Math.sin(t * 1.5) * 0.25, 0, pa * 0.9, Math.sin(t * 0.9) * 0.15 - 0.15, -0.05);
  // Mia looks at the over-built thing (head shake), then points at the app; dog happy
  person(mia, -6.5, 3, 1, 0.45, { point: ramp(t, 25.3, 25.7), look: t < 23.2 ? Math.sin(t * 6) * 0.25 : 0 }, t);
  place(dog, -2.2, 0, 5.5, pop(t, 25.6, 0.4) * 0.55, 0.4);
  dog.pose(t, 0);
}

// E — step 4: first 10 paying customers (+ doing things that don't scale)
function sE(t) {
  camKeys(t, [[28.62, [0, 13, 42], [0, 6, 0]], [33.5, [0, 12, 40], [0, 7, 0]], [37.02, [-3, 12, 36], [0, 8, 0]]]);
  const outAt = 33.55;
  for (let i = 0; i < 10; i++) {
    const c = i % 5, r = Math.floor(i / 5);
    const x = (c - 2) * 4.2 + r * 1.2, z = -r * 4.2 - 1;
    const u = pop(t, 29.6 + i * 0.06, 0.4) * (1 - ramp(t, outAt, outAt + 0.35));
    const paid = t > 30.0 + i * 0.16;
    person(pawns[i + 5], x, z, u, 0, { cheer: paid ? clamp((t - 30.0 - i * 0.16) / 0.3) : 0 }, t);
    const cu = easeOutBack((t - 30.0 - i * 0.16) / 0.35) * (1 - ramp(t, outAt, outAt + 0.35));
    place(coins[i], x, 10.2 + r * 1.6 + Math.sin(t * 3 + i) * 0.15, z, cu * 0.6, t * 2.5 + i, Math.PI / 2);
  }
  // Mia does it personally: on the phone, then handshake-wave
  person(mia, lerp(0, -5.5, ramp(t, 33.4, 33.9)), 5, pop(t, 28.8, 0.4), lerp(0, 0.4, ramp(t, 33.4, 33.9)), { phone: ramp(t, 34.6, 35.0) * (1 - ramp(t, 35.6, 35.9)), wave: ramp(t, 35.7, 36.0), talk: t > 33.7 && t < 34.6 ? 1 : 0, walk: t > 33.4 && t < 33.9 ? 1 : 0 }, t);
  mia.phoneProp.visible = t > 34.5 && t < 35.8;
  const at = [33.75, 34.85, 35.75];
  actions.forEach((a, i) => place(a, (i - 1) * 6.0 + 2.5, 11.5 + Math.sin(t * 1.5 + i) * 0.25 + (i === 1 ? 1.2 : 0), 0, pop(t, at[i], 0.45), Math.sin(t + i) * 0.12));
}

// F — step 5: track & double down
function sF(t) {
  camKeys(t, [[37.02, [0, 15, 42], [0, 7, 0]], [43.73, [5, 15, 38], [0, 8, 0]]]);
  const base = [4, 6, 5, 3.5, 5.5];
  bars.forEach((b, i) => {
    const grow = easeOutCubic((t - 40.0 - i * 0.1) / 0.8);
    let h = 0.6 + base[i] * grow;
    if (i === 2) h += easeOutCubic((t - 41.9) / 1.2) * 7;
    else h *= 1 - ramp(t, 42.0, 42.6) * 0.35;
    place(b, (i - 2) * 3.8 + 2, 0, 0, pop(t, 37.2 + i * 0.08, 0.4), 0);
    b.bar.scale.y = Math.max(0.001, h); b.bar.position.y = h / 2;
  });
  const ga = pop(t, 38.1, 0.45);
  place(gear, -8.5, 10.5, -5, ga * 0.75, 0, 0, t * 1.4);
  place(gear2, -5.5, 12.2, -5, ga * 0.75, 0, 0, -t * 1.4 * 1.5 + 0.2);
  person(mia, -9.5, 4, pop(t, 37.2, 0.4), 0.7, { point: ramp(t, 41.6, 42.0), nod: t > 38 && t < 41.5 ? 0.6 : 0 }, t);
}

// G — outro: the tower, the team, confetti
function sG(t) {
  const u = t - 43.73;
  const ang = 0.5 - u * 0.09, R = 55 - u * 0.5;
  camPos.set(Math.sin(ang) * R, 15 + u * 0.3, Math.cos(ang) * R);
  camLook.set(0, 11, 0);
  const at = [43.73, 44.56, 45.53, 46.32, 47.21];
  for (let i = 0; i < 5; i++) {
    const t0 = at[i];
    const k = (t - t0) / 0.45;
    const yRest = 1.7 + i * 3.45;
    const y = k < 1 ? lerp(yRest + 14, yRest, easeOutCubic(k)) : yRest + Math.max(0, Math.sin((k - 1) * 10) * 0.25 * Math.exp(-(k - 1) * 4));
    place(blocks[i], 0, y, 0, t < t0 ? 0 : 1, (1 - clamp(k)) * 0.8 + (i % 2 ? 0.04 : -0.04));
  }
  const fa = pop(t, 48.25, 0.5);
  place(flag, -0.2, 1.7 + 4 * 3.45 + 1.7, 0, fa * 0.8);
  const p = flag.cloth.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.7; p.setZ(i, Math.sin(x * 1.6 - t * 6) * 0.18 * x / 3.4); }
  p.needsUpdate = true;
  const ch = ramp(t, 48.2, 48.5);
  person(mia, -8.5, 5, 1, 0.5, { cheer: ch, wave: t < 48.2 ? ramp(t, 44.0, 44.4) : 0 }, t);
  [[8.5, 4, -0.5], [10.5, -1, -0.7], [-11, -1.5, 0.7]].forEach(([x, z, ry], k) => person(pawns[k + 1], x, z, pop(t, 48.3 + k * 0.1, 0.4), ry, { cheer: ch }, t));
  place(dog, -4.8, 0, 7.5, 0.55, 0.3);
  dog.pose(t, 0);
  confetti.visible = t > 48.2;
  for (let i = 0; i < CONF_N; i++) {
    const t0 = 48.25 + hash(i) * 0.4;
    const age = t - t0;
    if (age < 0) { confetti.setMatrixAt(i, ZERO); continue; }
    const a = hash(i, 2) * Math.PI * 2, sp = 4 + hash(i, 3) * 8;
    const x = Math.cos(a) * sp * Math.min(age, 1.2) * 0.9;
    const z = Math.sin(a) * sp * Math.min(age, 1.2) * 0.6;
    const y = 21 + 10 * Math.min(age, 0.6) - 4.5 * age * age * 0.5 - age * 2;
    confetti.setMatrixAt(i, y < 0 ? ZERO : compose(x, y, z, t * 4 + i, t * 3 + i * 2, i, 1));
  }
  confetti.instanceMatrix.needsUpdate = true;
}

const SCENES = [[0, sA], [4.14, sB], [12.63, sC], [20.45, sD], [28.62, sE], [37.02, sF], [43.73, sG]];

// ---------------------------------------------------------------- 2D overlay (clean typography)
const out = document.getElementById('out');
const ctx = out.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const SEG = [
  [0.0, 1.8, 'How to build a business from zero…'],
  [2.22, 3.63, 'in five simple steps.'],
  [4.14, 4.73, 'Step one.'],
  [5.18, 6.12, 'Find a problem.'],
  [6.57, 7.43, 'Not an idea…'],
  [7.8, 8.47, 'a problem.'],
  [8.97, 12.15, 'Something people already complain about, and would pay to fix.'],
  [12.63, 13.18, 'Step two.'],
  [13.73, 16.91, 'Talk to 20 potential customers before you build anything.'],
  [17.4, 18.65, 'Ask about their problem,'],
  [18.84, 19.9, 'not your solution.'],
  [20.45, 21.05, 'Step three.'],
  [21.51, 23.54, 'Build the smallest version that solves it.'],
  [23.83, 24.79, 'Your MVP.'],
  [25.17, 26.2, 'One core feature.'],
  [26.57, 28.1, 'Done in weeks, not months.'],
  [28.62, 29.2, 'Step four.'],
  [29.64, 31.69, 'Get your first 10 paying customers.'],
  [32.09, 33.36, "Do things that don't scale."],
  [33.72, 36.46, 'Message them, call them, and serve them personally.'],
  [37.02, 37.66, 'Step five.'],
  [38.12, 39.69, 'Find what works, and repeat it.'],
  [40.1, 43.27, 'Track your numbers, and double down on the channel that brings customers.'],
  [43.73, 44.21, 'Problem.'],
  [44.56, 45.17, 'Customers.'],
  [45.53, 46.01, 'Product.'],
  [46.32, 46.89, 'Sales.'],
  [47.21, 47.85, 'Systems.'],
  [48.21, 49.26, "That's a business."],
  [49.7, 51.39, 'Save this video, and start today.'],
];
// headline blocks: [t0, t1, [[text, color, size, y, at?]]]
const HEAD = [
  [0.05, 4.14, [['How to build', C.ink, 112, 300], ['a business', C.ink, 112, 420], ['from zero.', C.green, 112, 540, 0.9]]],
  [5.18, 6.5, [['Find a problem.', C.ink, 104, 360]]],
  [6.57, 8.6, [['Not an idea.', C.coral, 104, 360]]],
  [8.6, 12.63, [['A real problem', C.ink, 100, 330], ['people pay to fix.', C.green, 92, 440, 11.0], ['Example: dog owners 🐕', C.sub, 50, 535, 9.0]]],
  [13.73, 17.4, [['Talk to 20', C.ink, 112, 330], ['potential customers.', C.amber, 84, 440, 14.2], ['Mia asked 20 dog owners', C.sub, 50, 535, 15.0]]],
  [17.4, 20.45, [['Their problem ✓', C.green, 100, 330], ['Your solution ✗', C.coral, 100, 450, 18.84]]],
  [21.51, 25.17, [['Build the smallest', C.ink, 96, 330], ['version that works.', C.green, 88, 440, 22.4]]],
  [25.17, 28.62, [['One core feature.', C.ink, 100, 330], ['Weeks, not months.', C.sky, 84, 440, 26.57], ['Example: “Book a walk” – that’s it', C.sub, 46, 535, 25.6]]],
  [29.64, 33.6, [['First 10', C.ink, 120, 330], ['paying customers.', C.amber, 92, 450, 30.1], ["Do things that don't scale.", C.sub, 60, 545, 32.09]]],
  [33.72, 37.02, [['Do it personally.', C.ink, 104, 330], ['Mia called every customer herself', C.sub, 50, 440, 34.4]]],
  [38.12, 40.1, [['Find what works.', C.ink, 100, 330], ['Repeat it.', C.violet, 100, 440, 38.9]]],
  [40.1, 43.73, [['Track the numbers.', C.ink, 96, 330], ['Double down.', C.green, 104, 440, 41.9], ['Referrals worked best → more referrals', C.sub, 44, 535, 42.3]]],
  [48.21, 49.7, [["That's a business.", C.ink, 104, 330]]],
  [49.7, END, [['Save this.', C.ink, 112, 300], ['Start today.', C.green, 120, 420, 50.3]]],
];
const CHIPS = [[4.14, 12.63, 'STEP 1', C.coral], [12.63, 20.45, 'STEP 2', C.amber], [20.45, 28.62, 'STEP 3', C.sky], [28.62, 37.02, 'STEP 4', C.green], [37.02, 43.73, 'STEP 5', C.violet]];

function fitFont(text, weight, size, maxW) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}, ${EMOJI}`;
  while (ctx.measureText(text).width > maxW && s > 20) { s -= 3; ctx.font = `${weight} ${s}px ${FONT}, ${EMOJI}`; }
  return s;
}
function headText(text, color, size, y, a, k) {
  const s = fitFont(text, 900, size, 960);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, y + (1 - easeOutCubic(k)) * 40);
  ctx.font = `900 ${s}px ${FONT}, ${EMOJI}`;
  ctx.letterSpacing = '-2px';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 24;
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}
function headlines(t) {
  for (const [t0, t1, lines] of HEAD) {
    if (t < t0 || t >= t1) continue;
    const o = clamp((t1 - t) / 0.18);
    for (const [txt, col, size, y, at] of lines) {
      const ta = at ?? t0;
      if (t < ta) continue;
      const k = (t - ta) / 0.4;
      headText(txt, col, size, y, clamp(k * 2.5) * o, k);
    }
  }
}
function chip(t) {
  for (const [t0, t1, label, col] of CHIPS) {
    if (t < t0 || t >= t1) continue;
    const k = (t - t0) / 0.35;
    const o = clamp((t1 - t) / 0.18);
    ctx.save();
    ctx.globalAlpha = clamp(k * 2) * o;
    ctx.translate(W / 2, 190 + (1 - easeOutCubic(k)) * 20);
    ctx.font = `800 40px ${FONT}`;
    ctx.letterSpacing = '6px';
    const w = ctx.measureText(label).width + 70;
    rr(ctx, -w / 2, -36, w, 72, 36); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 3, 2);
    ctx.restore();
  }
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
  const size = 50;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.letterSpacing = '0px';
  const space = ctx.measureText(' ').width;
  const lines = [[]]; let lw = 0;
  words.forEach((w, i) => {
    const ww = ctx.measureText(w).width;
    if (lw + ww > 820 && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push([w, ww, i]); lw += ww + space;
  });
  const lineH = size * 1.3;
  const boxW = Math.max(...lines.map((ln) => ln.reduce((s, [, ww]) => s + ww, 0) + space * (ln.length - 1))) + 80;
  const boxH = lines.length * lineH + 44;
  const cy = 1560;
  const segA = clamp((t - a + 0.05) / 0.15);
  ctx.save();
  ctx.globalAlpha = segA * 0.92;
  ctx.shadowColor = 'rgba(15,23,42,0.12)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  rr(ctx, W / 2 - boxW / 2, cy - boxH / 2, boxW, boxH, 34); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
  const y0 = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, li) => {
    const tw = ln.reduce((s, [, ww]) => s + ww, 0) + space * (ln.length - 1);
    let x = W / 2 - tw / 2;
    for (const [w, ww, i] of ln) {
      const active = t >= starts[i] && (i === words.length - 1 ? t < b + 0.3 : t < starts[i + 1]);
      const said = t >= starts[i];
      ctx.save();
      ctx.globalAlpha = segA;
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? C.green : said ? C.ink : '#94a3b8';
      ctx.fillText(w, x, y0 + li * lineH + 2);
      ctx.restore();
      x += ww + space;
    }
  });
}
function progress(t) {
  // slim progress bar at the top
  ctx.fillStyle = 'rgba(30,41,59,0.08)'; rr(ctx, 80, 96, W - 160, 8, 4); ctx.fill();
  ctx.fillStyle = C.ink; rr(ctx, 80, 96, Math.max(8, (W - 160) * clamp(t / END)), 8, 4); ctx.fill();
}
function fades(t) {
  for (const [t0] of SCENES) {
    if (t0 === 0) continue;
    const d = t - t0;
    if (d >= 0 && d < 0.3) { ctx.fillStyle = `rgba(251,249,245,${0.7 * (1 - easeOutCubic(d / 0.3))})`; ctx.fillRect(0, 0, W, H); }
  }
  if (t < 0.3) { ctx.fillStyle = `rgba(251,249,245,${1 - t / 0.3})`; ctx.fillRect(0, 0, W, H); }
  if (t > END - 0.5) { ctx.fillStyle = `rgba(251,249,245,${clamp((t - (END - 0.5)) / 0.5)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  hideAll();
  let cur = SCENES[0][1];
  for (const [t0, fn] of SCENES) if (t >= t0) cur = fn;
  camera.position.copy(camPos); camera.lookAt(camLook);
  cur(t);
  camera.position.copy(camPos).add(tmpP.set(Math.sin(t * 0.6) * 0.15, Math.sin(t * 0.8 + 1) * 0.1, 0));
  camera.lookAt(camLook);
  for (const ch of chats) ch.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
  ctx.drawImage(glCanvas, 0, 0, W, H);
  progress(t);
  chip(t);
  headlines(t);
  captions(t);
  fades(t);
}

window.renderFrame = (t) => { renderFrame(t); return out.toDataURL('image/jpeg', 0.95); };
window.END = END;

(async () => {
  await Promise.all([document.fonts.load(`900 60px "Inter Display"`), document.fonts.load(`700 60px "Inter Display"`), document.fonts.load(`60px ${EMOJI}`, '🎯💬')]);
  hideAll();
  window.READY = true;
})().catch((e) => { window.ERR = String(e && e.stack || e); });
