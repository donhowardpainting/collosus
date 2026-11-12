// Rendering: renderer, sky, terrain, industrial scenery, lighting, post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { initMaterials, MAT } from '../parts/visuals.js';

export const ARENA_R = 96;
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const HORIZON = new THREE.Color(0xf0c49a), ZENITH = new THREE.Color(0x2f5f9a);

// cheap value noise
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
}
function fbm(x, y) { let a = 0, f = 1, w = 0.5; for (let i = 0; i < 5; i++) { a += noise(x * f, y * f) * w; f *= 2.03; w *= 0.5; } return a; }

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR }, hor: { value: HORIZON }, zen: { value: ZENITH }, time: { value: 0 } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 d; uniform vec3 sun, hor, zen; uniform float time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0., w=.5; for(int i=0;i<5;i++){ a+=n(p)*w; p=p*2.02+7.1; w*=.5; } return a; }
      void main(){
        vec3 v = normalize(d);
        float t = pow(clamp(v.y*1.15+0.04, 0., 1.), 0.55);
        vec3 c = mix(hor, zen, t);
        float sd = max(dot(v, sun), 0.);
        c += vec3(1.0,0.62,0.3) * pow(sd, 6.0) * 0.55;
        c += vec3(1.0,0.9,0.7) * pow(sd, 900.0) * 14.0;
        if (v.y > 0.0) {
          vec2 uv = v.xz / (v.y + 0.18) * 1.3 + vec2(time*0.004, 0.);
          float cl = smoothstep(0.48, 0.82, fbm(uv));
          float lit = fbm(uv + sun.xz * 0.12);
          vec3 cc = mix(vec3(0.35,0.3,0.36), vec3(1.0,0.78,0.58), smoothstep(0.3,0.75,lit) * (0.45 + 0.55*sd));
          c = mix(c, cc, cl * smoothstep(0.0, 0.16, v.y) * 0.85);
        }
        c = mix(c, hor*0.82, smoothstep(0.03, -0.08, v.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.frustumCulled = false;
  return m;
}

function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b3a288'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${v > 0.5 ? 235 : 30},${v > 0.5 ? 215 : 22},${v > 0.5 ? 185 : 14},${0.03 + Math.random() * 0.07})`;
    const s = 1 + Math.random() * 5; g.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  for (let i = 0; i < 40; i++) { // cracks / tracks
    g.strokeStyle = `rgba(40,28,18,${0.03 + Math.random() * 0.05})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); } g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < ARENA_R + 6) return 0;
  const k = Math.min(1, (r - ARENA_R - 6) / 300);
  const ridge = Math.abs(fbm(x * 0.012 + 3.1, z * 0.012 - 1.7) - 0.5) * 2;
  return k * k * (3 - 2 * k) * ((1 - ridge) * 70 + fbm(x * 0.05, z * 0.05) * 14) + Math.min(1, (r - ARENA_R - 6) / 14) * fbm(x * 0.2, z * 0.2) * 3;
}

function makeTerrain() {
  const geo = new THREE.PlaneGeometry(1800, 1800, 200, 200).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), dust = new THREE.Color(0xd6c2a2), rock = new THREE.Color(0x7d695a), dark = new THREE.Color(0x3d3431);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrainHeight(x, z);
    pos.setY(i, y);
    const n = fbm(x * 0.03 + 9, z * 0.03);
    c.copy(dust).lerp(rock, Math.min(1, y / 30 + n * 0.5)).lerp(dark, Math.max(0, Math.min(1, (y - 35) / 60)));
    const r = Math.hypot(x, z);
    if (r < ARENA_R) c.multiplyScalar(0.9 + n * 0.25); // scuffed arena floor
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTexture(), vertexColors: true, roughness: 0.96, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

// --- colossal background machinery (static, merged) ---
function titan(seed) {
  const g = [];
  const add = (geo, x, y, z, rx = 0, rz = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z); g.push(geo.toNonIndexed()); };
  const R = (a, b) => a + hash(seed++, 7.7) * (b - a);
  const legs = 3, hullY = R(34, 46), L = R(26, 34), W = R(14, 18);
  add(new THREE.BoxGeometry(W, 12, L), 0, hullY, 0);
  add(new THREE.BoxGeometry(W * 0.7, 9, L * 0.5), 0, hullY + 10, -L * 0.1);
  add(new THREE.BoxGeometry(W * 0.4, 7, L * 0.25), 0, hullY + 18, -L * 0.15);
  add(new THREE.CylinderGeometry(2.2, 2.2, 22, 8), 0, hullY + 4, L * 0.5 + 9, Math.PI / 2.3); // main gun
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(1.4, 1.9, R(14, 24), 8), R(-4, 4), hullY + 26, -L * 0.3 + i * 5); // stacks
  for (let i = 0; i < legs; i++) for (const s of [-1, 1]) {
    const z = (i - (legs - 1) / 2) * L * 0.42, lean = R(-0.25, 0.25);
    add(new THREE.BoxGeometry(4, hullY * 0.6, 4.5), s * (W * 0.5 + 6), hullY * 0.72, z, lean, s * 0.5);
    add(new THREE.BoxGeometry(3.4, hullY * 0.6, 3.8), s * (W * 0.5 + 11), hullY * 0.28, z + lean * 6, -lean, -s * 0.12);
    add(new THREE.CylinderGeometry(3.4, 3.4, 5.4, 10), s * (W * 0.5 + 9.5), hullY * 0.52, z + lean * 3, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(8, 2.4, 9), s * (W * 0.5 + 11.5), 1.2, z + lean * 9);
  }
  return mergeGeometries(g);
}
function scenery(scene) {
  initMaterials();
  const rust = new THREE.MeshStandardMaterial({ color: 0x4a3a32, roughness: 0.85, metalness: 0.5 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.7, metalness: 0.7 });
  const spots = [[-210, -330, 0.5, 1.5], [260, -280, -0.7, 1.9], [-380, 60, 1.6, 1.3], [330, 190, 2.6, 1.2], [60, -460, 0.1, 2.6]];
  spots.forEach(([x, z, yaw, s], i) => {
    const m = new THREE.Mesh(titan(i * 31 + 5), i % 2 ? rust : iron);
    m.position.set(x, terrainHeight(x, z) - 2, z); m.rotation.y = yaw; m.scale.setScalar(s);
    scene.add(m);
  });
  // refinery towers + pipes on the rim
  const g = [];
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 3.3) * Math.PI * 2, r = ARENA_R + 30 + hash(i, 9.1) * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainHeight(x, z), h = 18 + hash(i, 5.5) * 50;
    const t = hash(i, 1.1) > 0.5 ? new THREE.CylinderGeometry(1.5 + hash(i, 2) * 2, 3 + hash(i, 4) * 3, h, 8) : new THREE.BoxGeometry(5, h, 5);
    t.translate(x, y + h / 2 - 2, z); g.push(t.toNonIndexed());
    const cap = new THREE.BoxGeometry(9, 2, 9); cap.translate(x, y + h * 0.7, z); g.push(cap.toNonIndexed());
  }
  scene.add(new THREE.Mesh(mergeGeometries(g), rust));
  // half-buried giant gears
  for (const [x, z, R, tilt] of [[-70, -82, 22, 1.2], [84, -64, 16, 1.0], [-95, 30, 13, 1.35]]) {
    const gg = [new THREE.TorusGeometry(R, R * 0.14, 8, 40).toNonIndexed(), new THREE.CylinderGeometry(R * 0.25, R * 0.25, R * 0.3, 16).rotateX(Math.PI / 2).toNonIndexed()];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; const t = new THREE.BoxGeometry(R * 0.18, R * 0.3, R * 0.22); t.rotateZ(a - Math.PI / 2); t.translate(Math.cos(a) * R * 1.16, Math.sin(a) * R * 1.16, 0); gg.push(t.toNonIndexed()); }
    for (let i = 0; i < 4; i++) { const sp = new THREE.BoxGeometry(R * 2, R * 0.16, R * 0.12); sp.rotateZ((i / 4) * Math.PI); gg.push(sp.toNonIndexed()); }
    const m = new THREE.Mesh(mergeGeometries(gg), i2(iron, rust, x));
    m.position.set(x, R * 0.25, z); m.rotation.set(tilt, x * 0.1, 0.3); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  // arena rim: concrete barrier ring with hazard posts
  const ring = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.283, b = new THREE.BoxGeometry((6.283 * ARENA_R) / N * 0.96, 3.2, 2.4);
    b.rotateY(-a + Math.PI / 2); b.translate(Math.cos(a) * ARENA_R, 1.6, Math.sin(a) * ARENA_R); ring.push(b);
  }
  const rim = new THREE.Mesh(mergeGeometries(ring), MAT.stone); rim.castShadow = rim.receiveShadow = true; scene.add(rim);
  const posts = [];
  for (let i = 0; i < N; i += 3) { const a = (i / N) * 6.283, p = new THREE.BoxGeometry(1.2, 7, 1.2); p.translate(Math.cos(a) * (ARENA_R + 0.4), 3.5, Math.sin(a) * (ARENA_R + 0.4)); posts.push(p); }
  const pm = new THREE.Mesh(mergeGeometries(posts), MAT.hazard); pm.castShadow = true; scene.add(pm);
}
const i2 = (a, b, x) => (x > 0 ? a : b);

// Workshop build pad + gantry (only decorative; the pad surface is the flat ground).
function buildPad(scene) {
  const grp = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5e64'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
  const cells = 22;
  for (let i = 0; i <= cells; i++) { const p = (i / cells) * 512; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  g.strokeStyle = '#e0a418'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 496);
  g.strokeStyle = 'rgba(224,164,24,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(256, 20); g.lineTo(256, 492); g.stroke();
  g.fillStyle = 'rgba(224,164,24,0.8)'; g.beginPath(); g.moveTo(256, 500); g.lineTo(236, 470); g.lineTo(276, 470); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  pad.rotation.x = -Math.PI / 2; pad.rotation.z = Math.PI; pad.position.y = 0.02; pad.receiveShadow = true;
  grp.add(pad);
  // crane gantry standing behind the pad, boom reaching over it
  const gs = [];
  for (const sx of [-1, 1]) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.BoxGeometry(0.35, 30, 0.35); p.translate(sx * 17 + dx * 0.9, 15, -19 + dz * 0.9); gs.push(p); }
    for (let y = 2; y < 30; y += 4) { const r = new THREE.BoxGeometry(2.2, 0.25, 2.2); r.translate(sx * 17, y, -19); gs.push(r); const d = new THREE.BoxGeometry(0.2, 4.5, 0.2); d.rotateZ(0.45); d.translate(sx * 17, y + 2, -19.9); gs.push(d); }
  }
  const top = new THREE.BoxGeometry(37, 1.6, 2.4); top.translate(0, 30, -19); gs.push(top);
  const boom = new THREE.BoxGeometry(1.6, 1.2, 26); boom.translate(4, 29.4, -7); gs.push(boom);
  const cable = new THREE.BoxGeometry(0.16, 9, 0.16); cable.translate(4, 24.5, 3); gs.push(cable);
  const hb = new THREE.BoxGeometry(1.6, 1.2, 1.6); hb.translate(4, 19.6, 3); gs.push(hb);
  const gantry = new THREE.Mesh(mergeGeometries(gs), MAT.dark); gantry.castShadow = true; grp.add(gantry);
  scene.add(grp);
  return grp;
}

export class World {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0xdcc0a4), 0.0019);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.3, 3000);
    this.sky = makeSky();
    this.scene.add(this.sky);
    // image-based lighting baked once from the sky
    const pm = new THREE.PMREMGenerator(r), envScene = new THREE.Scene();
    envScene.add(makeSky());
    this.env = pm.fromScene(envScene, 0, 1, 2000).texture;
    this.scene.environment = this.env; this.scene.environmentIntensity = 0.9;
    pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xb8d0ff, 0x8a6a4c, 1.25));
    const sun = (this.sun = new THREE.DirectionalLight(0xffdcb0, 4.4));
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -46; sc.right = sc.top = 46; sc.near = 10; sc.far = 320;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
    this.scene.add(sun, sun.target);
    this.terrain = makeTerrain(); this.scene.add(this.terrain);
    scenery(this.scene);
    this.pad = buildPad(this.scene);
    this.dynamic = new THREE.Group(); // everything owned by the current simulation / workshop
    this.scene.add(this.dynamic);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.quality = 'high';
    this.focus = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.75));
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render(t) {
    // keep the shadow frustum centred on the action (snapped to texels to avoid shimmer)
    const f = this.focus, snap = 92 / 2048 * 4;
    const fx = Math.round(f.x / snap) * snap, fz = Math.round(f.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + SUN_DIR.x * 150, SUN_DIR.y * 150, fz + SUN_DIR.z * 150);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.time.value = t;
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
}
