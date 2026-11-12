// Part visuals: procedural materials + merged geometry per piece. Browser only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PARTS } from './catalog.js';

// ---------- procedural textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function woodTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#8a6844'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      const y = (i * s) / 4;
      g.fillStyle = `hsl(${rnd(26, 34)},${rnd(26, 36)}%,${rnd(36, 47)}%)`;
      g.fillRect(0, y, s, s / 4);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(${k % 2 ? 60 : 200},${k % 2 ? 35 : 150},${k % 2 ? 15 : 90},${rnd(0.05, 0.22)})`;
        g.lineWidth = rnd(0.5, 2);
        g.beginPath();
        const yy = y + rnd(2, s / 4 - 2);
        g.moveTo(0, yy); g.bezierCurveTo(s * 0.3, yy + rnd(-4, 4), s * 0.6, yy + rnd(-4, 4), s, yy + rnd(-2, 2)); g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.7)'; g.fillRect(0, y, s, 2.5);
      for (const x of [14, s - 14]) { g.fillStyle = '#3b3b3b'; g.beginPath(); g.arc(x, y + s / 8, 3.5, 0, 7); g.fill(); g.fillStyle = '#8a8a8a'; g.beginPath(); g.arc(x - 1, y + s / 8 - 1, 1.5, 0, 7); g.fill(); }
    }
  });
}
function metalTex(base, line, rivet, scratches = 220) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < scratches; i++) {
      g.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},255,${rnd(0.02, 0.07)})`;
      g.lineWidth = rnd(0.5, 1.5); g.beginPath();
      const y = rnd(0, s), x = rnd(0, s); g.moveTo(x, y); g.lineTo(x + rnd(20, 90), y + rnd(-3, 3)); g.stroke();
    }
    for (let i = 0; i < 14; i++) { // grime
      const grd = g.createRadialGradient(rnd(0, s), rnd(0, s), 2, rnd(0, s), rnd(0, s), rnd(30, 80));
      grd.addColorStop(0, 'rgba(60,35,15,0.10)'); grd.addColorStop(1, 'rgba(60,35,15,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }
    g.strokeStyle = line; g.lineWidth = 5; g.strokeRect(2.5, 2.5, s - 5, s - 5);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.5; g.strokeRect(7, 7, s - 14, s - 14);
    for (const [x, y] of [[22, 22], [s - 22, 22], [22, s - 22], [s - 22, s - 22], [s / 2, 22], [s / 2, s - 22], [22, s / 2], [s - 22, s / 2]]) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 7, 0, 7); g.fill();
      g.fillStyle = rivet; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - 2, y - 2, 2.2, 0, 7); g.fill();
    }
  });
}
function hazardTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#e0a418'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1b1b1b';
    for (let i = -s; i < s * 2; i += 42) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 21, 0); g.lineTo(i + 21 - s, s); g.lineTo(i - s, s); g.fill(); }
  });
}
function stoneTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#8d8478'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 240 : 0},${Math.random() > 0.5 ? 220 : 0},${rnd(0.02, 0.08)})`; g.fillRect(rnd(0, s), rnd(0, s), rnd(1, 5), rnd(1, 5)); }
    g.strokeStyle = 'rgba(30,25,20,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
  });
}

export const MAT = {};
export function initMaterials() {
  if (MAT.wood) return MAT;
  const S = (o) => new THREE.MeshStandardMaterial(o);
  MAT.wood = S({ map: woodTex(), roughness: 0.82, metalness: 0.0 });
  MAT.steel = S({ map: metalTex('#8d949a', 'rgba(20,24,28,0.75)', '#b9c0c6'), roughness: 0.42, metalness: 0.85 });
  MAT.dark = S({ map: metalTex('#3d4349', 'rgba(5,6,8,0.8)', '#6b7379'), roughness: 0.5, metalness: 0.85 });
  MAT.armor = S({ map: metalTex('#4a5560', 'rgba(8,10,12,0.9)', '#c49a4a', 320), roughness: 0.38, metalness: 0.9 });
  MAT.brass = S({ color: 0xc8963c, roughness: 0.3, metalness: 1.0 });
  MAT.chrome = S({ color: 0xdfe6ea, roughness: 0.12, metalness: 1.0 });
  MAT.rubber = S({ color: 0x1c1c1e, roughness: 0.95, metalness: 0.0 });
  MAT.red = S({ color: 0xa8281c, roughness: 0.45, metalness: 0.5 });
  MAT.hazard = S({ map: hazardTex(), roughness: 0.6, metalness: 0.3 });
  MAT.stone = S({ map: stoneTex(), roughness: 0.95, metalness: 0.0 });
  MAT.glow = S({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 3.2, roughness: 0.4 });
  MAT.glass = S({ color: 0x7fd4e8, emissive: 0x1a6a80, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.72 });
  MAT.ghostOk = new THREE.MeshBasicMaterial({ color: 0x5dffb0, transparent: true, opacity: 0.42, depthWrite: false });
  MAT.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.42, depthWrite: false });
  for (const k of Object.keys(MAT)) MAT[k].name = k;
  return MAT;
}
const scorched = new Map();
function scorchedOf(m) {
  if (!scorched.has(m)) {
    const c = m.clone();
    c.color.multiplyScalar(0.33); c.roughness = 1; c.metalness *= 0.4;
    if (c.emissive) c.emissiveIntensity *= 0.15;
    c.userData.orig = m; scorched.set(m, c);
  }
  return scorched.get(m);
}
export function setScorched(obj) {
  obj.traverse((o) => { if (o.isMesh && !o.material.userData.orig && !o.material.transparent) o.material = scorchedOf(o.material); });
}

// ---------- geometry helpers ----------
const X = new THREE.Vector3(1, 0, 0), Zv = new THREE.Vector3(0, 0, 1);
class Bld {
  constructor() { this.by = new Map(); this.extra = []; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, rx, rz, ry) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, rz, ry); }
  rbox(w, h, d, mat, x, y, z, r = 0.06) { return this.add(new RoundedBoxGeometry(w, h, d, 2, r), mat, x, y, z); }
  cyl(rt, rb, h, mat, x, y, z, rx, rz, seg = 20) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, rz); }
  done() { return [...this.by].map(([mat, geos]) => ({ mat, geo: mergeGeometries(geos) })); }
}
const H = Math.PI / 2;

function frameEdges(b, mat, s = 0.46, t = 0.09, diag = false) {
  for (const a of [-1, 1]) for (const c of [-1, 1]) {
    b.box(t, s * 2 + t, t, mat, a * s, 0, c * s); b.box(s * 2 + t, t, t, mat, 0, a * s, c * s); b.box(t, t, s * 2 + t, mat, a * s, c * s, 0);
  }
  if (diag) {
    const L = s * 2 * 1.38;
    for (const a of [-1, 1]) {
      b.box(t * 0.9, L, t * 0.9, mat, 0, 0, a * s, 0, Math.PI / 4); b.box(t * 0.9, L, t * 0.9, mat, 0, 0, a * s, 0, -Math.PI / 4);
      b.box(t * 0.9, L, t * 0.9, mat, a * s, 0, 0, Math.PI / 4, 0); b.box(t * 0.9, L, t * 0.9, mat, a * s, 0, 0, -Math.PI / 4, 0);
    }
  }
}
function wheel(b, R, w, y) {
  b.cyl(R, R, w, 'rubber', 0, y, 0, 0, 0, 28);
  b.cyl(R * 0.72, R * 0.72, w + 0.04, 'steel', 0, y, 0, 0, 0, 24);
  b.cyl(R * 0.28, R * 0.28, w + 0.16, 'brass', 0, y, 0, 0, 0, 12);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(R * 0.16, w + 0.06, R * 0.3), 'rubber', Math.cos(a) * R * 0.99, y, Math.sin(a) * R * 0.99, 0, 0, -a + H);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(R * 0.5, w + 0.1, R * 0.12), 'dark', Math.cos(a) * R * 0.48, y, Math.sin(a) * R * 0.48, 0, 0, -a);
  }
}

// Each entry: (builder for base piece, builder for head piece)
const BUILD = {
  wood_block: (b) => b.rbox(0.98, 0.98, 0.98, 'wood', 0, 0, 0),
  wood_beam: (b) => {
    b.rbox(0.88, 2.98, 0.88, 'wood', 0, 1, 0);
    for (const y of [-0.3, 1, 2.3]) b.box(0.94, 0.16, 0.94, 'dark', 0, y, 0);
  },
  steel_block: (b) => b.rbox(0.98, 0.98, 0.98, 'steel', 0, 0, 0, 0.04),
  steel_beam: (b) => {
    b.box(0.9, 2.98, 0.14, 'steel', 0, 1, 0);
    b.box(0.16, 2.98, 0.9, 'steel', -0.37, 1, 0); b.box(0.16, 2.98, 0.9, 'steel', 0.37, 1, 0);
    for (const y of [-0.42, 1, 2.42]) b.box(0.92, 0.12, 0.92, 'dark', 0, y, 0);
  },
  frame: (b) => frameEdges(b, 'steel', 0.45, 0.08, false),
  brace: (b) => frameEdges(b, 'dark', 0.45, 0.1, true),
  platform: (b) => {
    for (let i = -1; i <= 1; i++) b.rbox(0.96, 0.3, 2.96, 'wood', i, 0.34, 0, 0.04);
    b.box(2.98, 0.5, 0.2, 'steel', 0, -0.05, -1.39); b.box(2.98, 0.5, 0.2, 'steel', 0, -0.05, 1.39);
    b.box(0.2, 0.5, 2.98, 'steel', -1.39, -0.05, 0); b.box(0.2, 0.5, 2.98, 'steel', 1.39, -0.05, 0);
    b.box(2.9, 0.34, 0.16, 'dark', 0, -0.32, -0.5); b.box(2.9, 0.34, 0.16, 'dark', 0, -0.32, 0.5);
    b.box(0.16, 0.34, 2.9, 'dark', -0.5, -0.32, 0); b.box(0.16, 0.34, 2.9, 'dark', 0.5, -0.32, 0);
  },
  wheel: [(b) => { b.cyl(0.14, 0.14, 0.6, 'dark', 0, -0.2, 0); b.cyl(0.3, 0.3, 0.12, 'steel', 0, -0.44, 0); }, (b) => wheel(b, 1.0, 0.62, 0.05)],
  big_wheel: [(b) => { b.cyl(0.2, 0.2, 0.6, 'dark', 0, -0.2, 0); b.cyl(0.4, 0.4, 0.12, 'steel', 0, -0.44, 0); }, (b) => wheel(b, 1.7, 0.82, 0.1)],
  rotor: [
    (b) => { b.rbox(0.98, 0.62, 0.98, 'dark', 0, -0.18, 0, 0.05); b.cyl(0.5, 0.5, 0.1, 'hazard', 0, 0.14, 0, 0, 0, 24); b.box(0.3, 0.3, 1.02, 'red', 0, -0.2, 0); },
    (b) => { b.cyl(0.44, 0.44, 0.3, 'brass', 0, 0.34, 0, 0, 0, 24); b.cyl(0.16, 0.16, 0.36, 'dark', 0, 0.34, 0); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; b.cyl(0.05, 0.05, 0.34, 'chrome', Math.cos(a) * 0.32, 0.34, Math.sin(a) * 0.32, 0, 0, 8); } b.box(0.14, 0.33, 0.5, 'red', 0.3, 0.34, 0); },
  ],
  hinge: [
    (b) => { b.rbox(0.98, 0.2, 0.98, 'steel', 0, -0.4, 0, 0.04); b.box(0.14, 0.5, 0.5, 'steel', -0.42, -0.1, 0); b.box(0.14, 0.5, 0.5, 'steel', 0.42, -0.1, 0); b.cyl(0.12, 0.12, 1.0, 'brass', 0, 0, 0, 0, H, 12); },
    (b) => { b.rbox(0.8, 0.18, 0.8, 'steel', 0, 0.41, 0, 0.04); b.box(0.5, 0.5, 0.3, 'steel', 0, 0.16, 0); b.cyl(0.2, 0.2, 0.52, 'steel', 0, 0, 0, 0, H, 12); },
  ],
  servo: [
    (b) => { b.rbox(0.98, 0.2, 0.98, 'dark', 0, -0.4, 0, 0.04); b.box(0.14, 0.5, 0.5, 'dark', -0.42, -0.1, 0); b.box(0.14, 0.5, 0.5, 'dark', 0.42, -0.1, 0); b.cyl(0.12, 0.12, 1.04, 'brass', 0, 0, 0, 0, H, 12); b.cyl(0.24, 0.24, 0.1, 'red', 0.5, 0, 0, 0, H, 16); b.cyl(0.24, 0.24, 0.1, 'red', -0.5, 0, 0, 0, H, 16); },
    (b) => { b.rbox(0.8, 0.18, 0.8, 'dark', 0, 0.41, 0, 0.04); b.box(0.5, 0.5, 0.3, 'steel', 0, 0.16, 0); b.cyl(0.2, 0.2, 0.52, 'hazard', 0, 0, 0, 0, H, 12); },
  ],
  piston: [
    (b) => { b.cyl(0.4, 0.4, 0.78, 'dark', 0, -0.1, 0, 0, 0, 20); b.cyl(0.46, 0.46, 0.12, 'hazard', 0, 0.26, 0, 0, 0, 20); b.rbox(0.98, 0.16, 0.98, 'steel', 0, -0.42, 0, 0.04); },
    (b) => { b.rbox(0.9, 0.16, 0.9, 'steel', 0, 0.42, 0, 0.04); b.cyl(0.3, 0.3, 0.08, 'brass', 0, 0.32, 0); },
  ],
  spring: [(b) => b.rbox(0.9, 0.18, 0.9, 'dark', 0, -0.4, 0, 0.04), (b) => b.rbox(0.9, 0.18, 0.9, 'dark', 0, 0.4, 0, 0.04)],
  power_core: (b) => {
    frameEdges(b, 'dark', 0.44, 0.12, false);
    b.cyl(0.3, 0.3, 0.8, 'glow', 0, 0, 0, 0, 0, 16);
    b.cyl(0.4, 0.4, 0.12, 'brass', 0, 0.42, 0); b.cyl(0.4, 0.4, 0.12, 'brass', 0, -0.42, 0);
    for (const a of [0, 1, 2, 3]) b.box(0.08, 0.84, 0.08, 'chrome', Math.cos(a * H + 0.78) * 0.38, 0, Math.sin(a * H + 0.78) * 0.38);
  },
  control: (b) => {
    b.rbox(0.98, 0.5, 0.98, 'dark', 0, -0.24, 0, 0.05);
    b.add(new THREE.SphereGeometry(0.42, 18, 10, 0, 6.283, 0, H), 'glass', 0, 0, 0);
    b.box(0.2, 0.06, 0.5, 'brass', 0, 0.02, 0.44); // forward arrow shaft
    b.add(new THREE.ConeGeometry(0.2, 0.3, 4), 'brass', 0, 0.02, 0.72, H, 0);
    b.cyl(0.015, 0.015, 0.7, 'chrome', -0.4, 0.35, -0.4, 0, 0, 5);
    b.add(new THREE.SphereGeometry(0.05, 8, 6), 'glow', -0.4, 0.72, -0.4);
  },
  cannon: (b) => {
    b.rbox(0.9, 0.7, 0.9, 'dark', 0, -0.14, 0, 0.05);
    b.cyl(0.22, 0.3, 1.5, 'steel', 0, 0.75, 0, 0, 0, 16); b.cyl(0.3, 0.3, 0.2, 'dark', 0, 1.42, 0, 0, 0, 16);
    b.cyl(0.34, 0.34, 0.14, 'brass', 0, 0.3, 0, 0, 0, 16); b.box(0.96, 0.14, 0.3, 'red', 0, -0.2, 0);
  },
  launcher: (b) => {
    b.rbox(0.98, 0.5, 0.98, 'dark', 0, -0.24, 0, 0.05);
    // mortar tube leaning toward local +Z: bombs leave at ~40° in that direction
    b.cyl(0.4, 0.34, 0.8, 'steel', 0, 0.26, 0.2, 0.69, 0, 18); b.cyl(0.44, 0.44, 0.1, 'hazard', 0, 0.55, 0.44, 0.69, 0, 18);
    b.box(0.16, 0.06, 0.4, 'brass', 0.36, 0.03, 0.26); b.box(0.16, 0.06, 0.4, 'brass', -0.36, 0.03, 0.26);
  },
  spike: (b) => {
    b.rbox(0.9, 0.3, 0.9, 'dark', 0, -0.34, 0, 0.04);
    b.add(new THREE.ConeGeometry(0.38, 1.6, 6), 'steel', 0, 0.6, 0);
    b.cyl(0.42, 0.42, 0.12, 'brass', 0, -0.16, 0, 0, 0, 6);
  },
  maul: (b) => {
    b.rbox(1.22, 1.22, 1.22, 'dark', 0, 0, 0, 0.1);
    for (const [x, y, z, rx, rz] of [[0.7, 0, 0, 0, -H], [-0.7, 0, 0, 0, H], [0, 0.7, 0, 0, 0], [0, 0, 0.7, H, 0], [0, 0, -0.7, -H, 0]]) b.add(new THREE.ConeGeometry(0.26, 0.4, 5), 'steel', x, y, z, rx, rz);
    b.box(1.26, 0.2, 1.26, 'brass', 0, 0, 0);
  },
  armor_block: (b) => {
    b.rbox(0.98, 0.98, 0.98, 'armor', 0, 0, 0, 0.1);
    b.box(1.0, 0.16, 0.5, 'dark', 0, 0, 0); b.box(0.5, 0.16, 1.0, 'dark', 0, 0, 0);
  },
  armor_plate: (b) => {
    b.rbox(2.96, 0.46, 2.96, 'armor', 0, -0.26, 0, 0.08);
    b.box(2.6, 0.08, 0.3, 'dark', 0, 0, 0.9); b.box(2.6, 0.08, 0.3, 'dark', 0, 0, -0.9);
    for (const x of [-1.25, 1.25]) for (const z of [-1.25, 0, 1.25]) b.cyl(0.09, 0.09, 0.1, 'brass', x, 0, z, 0, 0, 8);
  },
};

const cache = new Map();
function pieceGeo(type, key) {
  const k = type + ':' + key;
  if (!cache.has(k)) {
    const def = BUILD[type];
    const fn = Array.isArray(def) ? def[key === 'base' ? 0 : 1] : key === 'base' ? def : null;
    const b = new Bld();
    if (fn) fn(b);
    cache.set(k, b.done());
  }
  return cache.get(k);
}
const enemyMats = new Map();
function enemyOf(name) {
  if (!['wood', 'steel', 'dark', 'armor'].includes(name)) return MAT[name];
  if (!enemyMats.has(name)) {
    const c = MAT[name].clone();
    c.color.set(name === 'wood' ? 0x7a4038 : name === 'dark' ? 0x8a3a30 : 0xc8605a);
    enemyMats.set(name, c);
  }
  return enemyMats.get(name);
}
export function makeEnemyPieceMesh(type, key) {
  const g = makePieceMesh(type, key);
  g.traverse((o) => { if (o.isMesh && o.material.name) o.material = enemyOf(o.material.name); });
  return g;
}
let rodGeo, coilGeo;
export function makePieceMesh(type, key, ghostMat = null) {
  initMaterials();
  const g = new THREE.Group();
  for (const { mat, geo } of pieceGeo(type, key)) {
    const m = new THREE.Mesh(geo, ghostMat || MAT[mat]);
    if (!ghostMat) { m.castShadow = true; m.receiveShadow = true; }
    g.add(m);
  }
  if (key === 'base' && (type === 'piston' || type === 'spring')) {
    if (!rodGeo) {
      rodGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 12).translate(0, 0.5, 0);
      const pts = [];
      for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2 * 5; pts.push(new THREE.Vector3(Math.cos(a) * 0.3, i / 120, Math.sin(a) * 0.3)); }
      coilGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.055, 6);
    }
    const rod = new THREE.Mesh(type === 'piston' ? rodGeo : coilGeo, ghostMat || (type === 'piston' ? MAT.chrome : MAT.brass));
    rod.castShadow = !ghostMat;
    rod.position.y = type === 'piston' ? -0.4 : -0.3;
    rod.userData.base = type === 'piston' ? 0.76 : 0.6;
    rod.scale.y = rod.userData.base;
    g.add(rod); g.userData.rod = rod;
  }
  return g;
}
export function makePartMesh(type, ghostMat = null) {
  const g = new THREE.Group();
  for (const pd of PARTS[type].pieces) g.add(makePieceMesh(type, pd.key, ghostMat));
  return g;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
export function makeStructMesh(el) {
  initMaterials();
  const m = new THREE.Mesh(unitBox, el.core ? MAT.hazard : MAT[el.mat]);
  m.scale.set(el.half[0] * 2, el.half[1] * 2, el.half[2] * 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Catalog thumbnails rendered with the live renderer.
export function renderThumbnails(renderer, envMap) {
  const size = 128, out = {};
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3); sun.position.set(3, 5, 4); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const buf = new Uint8Array(size * size * 4);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const prevTone = renderer.toneMapping;
  for (const type of Object.keys(PARTS)) {
    const mesh = makePartMesh(type);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.5;
    cam.position.set(c.x + r * 2.3, c.y + r * 1.7, c.z + r * 2.6); cam.lookAt(c);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    out[type] = cv.toDataURL();
    scene.remove(mesh);
  }
  renderer.setRenderTarget(null); renderer.toneMapping = prevTone;
  rt.dispose();
  return out;
}
