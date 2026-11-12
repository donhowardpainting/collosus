// Visual effects: pooled particles (dust, smoke, sparks, fire), flying splinters,
// explosion flashes, projectile meshes and camera shake.
import * as THREE from 'three';

const VS = `attribute float size; attribute vec4 pcolor; varying vec4 vc;
void main(){ vc = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (520.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `varying vec4 vc; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a = smoothstep(1.0, SOFT, d); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vc.rgb, vc.a * a); }`;

class Pool {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0; this.live = 0;
    this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 4); this.s = new Float32Array(n);
    this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grow = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.a0 = new Float32Array(n);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.c, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS.replace('SOFT', '0.0'), transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, a, size, life, grow, grav, drag) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 4] = r; this.c[i * 4 + 1] = g; this.c[i * 4 + 2] = b; this.c[i * 4 + 3] = a; this.a0[i] = a;
    this.s[i] = size; this.life[i] = this.max[i] = life; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const { p, v, c, s, life, max } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { s[i] = 0; c[i * 4 + 3] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= d; v[i * 3 + 1] = v[i * 3 + 1] * d - this.grav[i] * dt; v[i * 3 + 2] *= d;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.05 && this.grav[i] > 0) { p[i * 3 + 1] = 0.05; v[i * 3 + 1] *= -0.35; }
      s[i] += this.grow[i] * dt;
      const k = life[i] / max[i];
      c[i * 4 + 3] = this.a0[i] * Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 12);
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.pcolor.needsUpdate = this.geo.attributes.size.needsUpdate = true;
  }
}

const R = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.soft = new Pool(scene, 1400, false);
    this.add = new Pool(scene, 900, true);
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    // splinters / shrapnel
    this.NS = 260; this.si = 0;
    this.spl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.NS);
    this.spl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.NS * 3), 3);
    this.spl.frustumCulled = false; this.spl.castShadow = true;
    this.sd = Array.from({ length: this.NS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3() }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.NS; i++) this.spl.setMatrixAt(i, zero);
    scene.add(this.spl);
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffa040, 0, 60, 1.6); scene.add(l); l.userData.t = 0; return l; });
    this.li = 0;
    this.shotGeo = new THREE.SphereGeometry(1, 12, 8);
    this.shotMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff5a10, emissiveIntensity: 2.5, roughness: 0.4, metalness: 0.8 });
    this.bombMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff2010, emissiveIntensity: 1.2, roughness: 0.6 });
    this.shots = new Map();
  }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  dust(p, n = 8, spread = 1, up = 1.5) {
    const sp = Math.min(spread, 6);
    for (let i = 0; i < n; i++) {
      const sh = R(0.5, 0.66);
      this.soft.emit(p.x + R(-sp, sp), Math.max(0.1, p.y + R(0, 0.3)), p.z + R(-sp, sp), R(-1.2, 1.2) * Math.min(sp, 2), R(0.3, up), R(-1.2, 1.2) * Math.min(sp, 2),
        sh, sh * 0.84, sh * 0.64, R(0.14, 0.3), R(0.7, 1.4), R(1.2, 2.8), R(0.9, 1.8), -0.15, 1.3);
    }
  }
  smoke(p, n = 4, scale = 1, dark = 0.14) {
    for (let i = 0; i < n; i++) {
      const sh = dark + R(0, 0.1);
      this.soft.emit(p.x + R(-0.3, 0.3) * scale, p.y + R(0, 0.4), p.z + R(-0.3, 0.3) * scale, R(-0.6, 0.6), R(1.5, 3.2), R(-0.6, 0.6), sh, sh, sh * 1.05, R(0.35, 0.6), R(0.7, 1.3) * scale, R(1.6, 3.4), 1.5 * scale, -0.4, 0.8);
    }
  }
  sparks(p, n = 12, speed = 9) {
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.283), e = R(-0.3, 1.2), s = R(0.3, 1) * speed;
      this.add.emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 1, R(0.5, 0.8), R(0.1, 0.3), 1, R(0.1, 0.24), R(0.3, 0.9), -0.1, 18, 0.6);
    }
  }
  fire(p, n = 10, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.283), s = R(0, 5) * scale;
      this.add.emit(p.x + R(-0.4, 0.4) * scale, p.y + R(-0.2, 0.5) * scale, p.z + R(-0.4, 0.4) * scale, Math.cos(a) * s, R(1, 6) * scale, Math.sin(a) * s, 1, R(0.35, 0.65), 0.12, R(0.5, 0.9), R(0.8, 2) * scale, R(0.25, 0.7), 2.5 * scale, -2, 2.5);
    }
  }
  splinters(p, color, n = 8, speed = 6, size = 0.3) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.si; this.si = (i + 1) % this.NS;
      const d = this.sd[i];
      d.life = R(1.2, 2.6); d.p.set(p.x + R(-0.4, 0.4), p.y + R(-0.4, 0.4), p.z + R(-0.4, 0.4));
      const a = R(0, 6.283); d.v.set(Math.cos(a) * R(0.3, 1) * speed, R(1, 1.2 * speed), Math.sin(a) * R(0.3, 1) * speed);
      d.w.set(R(-9, 9), R(-9, 9), R(-9, 9)); d.s.set(R(0.3, 1.6) * size, R(0.2, 0.5) * size, R(0.2, 0.6) * size);
      const sh = R(0.7, 1.1); this.spl.setColorAt(i, _c.copy(c).multiplyScalar(sh));
    }
    this.spl.instanceColor.needsUpdate = true;
  }
  flash(p, intensity = 600, color = 0xffa040) {
    const l = this.lights[this.li]; this.li = (this.li + 1) % this.lights.length;
    l.position.copy(p); l.position.y += 1; l.color.set(color); l.intensity = intensity; l.userData.t = 1; l.userData.i = intensity;
  }
  explosion(p, r = 4) {
    this.fire(p, 26, r * 0.4); this.sparks(p, 30, 16); this.smoke(p, 12, r * 0.45, 0.1); this.dust({ x: p.x, y: 0.2, z: p.z }, 14, r * 0.5, 2.5);
    this.splinters(p, 0x3a3a3a, 10, 10, 0.3);
    this.flash(p, 1400); this.shake(0.55);
  }
  muzzle(p, dir) {
    for (let i = 0; i < 10; i++) this.add.emit(p.x, p.y, p.z, dir.x * R(4, 20) + R(-2, 2), dir.y * R(4, 20) + R(-2, 2), dir.z * R(4, 20) + R(-2, 2), 1, R(0.6, 0.8), 0.25, 1, R(0.4, 1.0), R(0.08, 0.22), 3, 0, 4);
    for (let i = 0; i < 5; i++) this.soft.emit(p.x + dir.x * 0.5, p.y + dir.y * 0.5, p.z + dir.z * 0.5, dir.x * R(1, 5), dir.y * R(1, 5) + 0.6, dir.z * R(1, 5), 0.75, 0.74, 0.72, 0.4, R(0.5, 0.9), R(0.8, 1.6), 1.6, -0.2, 2);
    this.flash(p, 500); this.shake(0.22);
  }
  addShot(proj) {
    const m = new THREE.Mesh(this.shotGeo, proj.kind === 'cannon' ? this.shotMat : this.bombMat);
    m.scale.setScalar(proj.r * 1.2); m.castShadow = true;
    this.scene.add(m); this.shots.set(proj, m);
  }
  removeShot(proj) { const m = this.shots.get(proj); if (m) { this.scene.remove(m); this.shots.delete(proj); } }
  update(dt, camera) {
    this.soft.update(dt); this.add.update(dt);
    for (const [proj, m] of this.shots) {
      const t = proj.body.translation(); m.position.set(t.x, t.y, t.z);
      if (Math.random() < 0.7) this.soft.emit(t.x, t.y, t.z, 0, 0.3, 0, 0.6, 0.6, 0.6, 0.3, proj.r * 1.4, 0.5, 0.8, 0, 0);
    }
    let any = false;
    for (let i = 0; i < this.NS; i++) {
      const d = this.sd[i];
      if (d.life <= 0) continue;
      d.life -= dt; any = true;
      d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.08) { d.p.y = 0.08; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5); }
      _q.setFromEuler(_e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt)); d.q.premultiply(_q);
      const k = d.life <= 0 ? 0 : Math.min(1, d.life * 3);
      this.spl.setMatrixAt(i, _m.compose(d.p, d.q, _s.copy(d.s).multiplyScalar(k)));
    }
    if (any) this.spl.instanceMatrix.needsUpdate = true;
    for (const l of this.lights) if (l.userData.t > 0) { l.userData.t -= dt * 5; l.intensity = Math.max(0, l.userData.t) ** 2 * l.userData.i; }
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const s = this.trauma * this.trauma, t = performance.now() * 0.001;
    this.shakeOffset.set(Math.sin(t * 47.1) * s, Math.sin(t * 61.7 + 1.3) * s, Math.sin(t * 53.3 + 2.1) * s).multiplyScalar(0.9);
    if (camera) { camera.position.add(this.shakeOffset); camera.rotation.z += Math.sin(t * 39.7) * s * 0.035; }
  }
  clear() { for (const m of this.shots.values()) this.scene.remove(m); this.shots.clear(); }
}
const _c = new THREE.Color(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
