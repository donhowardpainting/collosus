// Destructible target structures: loose stacks of beams, slabs and panels.
// Each element is its own rigid body so structures collapse and scatter naturally.
import { Vector3, Quaternion } from 'three';
import { LOOSE_GROUPS } from '../physics/world.js';

const MATS = {
  wood: { density: 0.55, hp: 55, friction: 0.8 },
  steel: { density: 1.4, hp: 170, friction: 0.6 },
  stone: { density: 1.1, hp: 110, friction: 0.9 },
};

export class Structure {
  constructor(phys, opts = {}) {
    this.phys = phys; this.opts = opts; this.els = [];
    this.hooks = opts.hooks || {};
    this.name = opts.name || 'Structure';
  }
  addBox(pos, half, mat = 'wood', yaw = 0, extra = {}) {
    const { R, world } = this.phys, m = MATS[mat];
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos[0], pos[1], pos[2]).setRotation(q)
      .setLinearDamping(0.05).setAngularDamping(0.15));
    const col = world.createCollider(R.ColliderDesc.cuboid(half[0], half[1], half[2]).setDensity(m.density)
      .setFriction(m.friction).setRestitution(0.02).setCollisionGroups(LOOSE_GROUPS)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(60), body);
    body.sleep();
    const vol = half[0] * half[1] * half[2] * 8;
    const el = {
      body, col, half, mat, hp: m.hp * (0.6 + 0.25 * vol) * (extra.hpMul || 1), dead: false, toppled: false,
      home: new Vector3(...pos), mesh: null, value: extra.value || 10, core: !!extra.core,
    };
    el.maxHp = el.hp;
    el.mesh = this.opts.makeMesh ? this.opts.makeMesh(el) : null;
    this.phys.owners.set(col.handle, { kind: 'struct', structure: this, el, take: 1 });
    this.els.push(el);
    return el;
  }
  damage(el, amount, pos) {
    if (el.dead) return;
    el.hp -= amount;
    if (el.hp <= 0) {
      el.dead = true;
      const t = el.body.translation();
      this.hooks.onElementDestroyed?.(this, el, new Vector3(t.x, t.y, t.z));
      this._topple(el);
      this.phys.removeBody(el.body);
      if (el.mesh) el.mesh.removeFromParent();
    }
  }
  _topple(el) {
    if (el.toppled) return;
    el.toppled = true;
    this.hooks.onToppled?.(this, el);
  }
  update() {
    for (const el of this.els) {
      if (el.dead) continue;
      if (el.body.isSleeping() && el.synced) continue;
      const t = el.body.translation(), r = el.body.rotation();
      if (el.mesh) { el.mesh.position.set(t.x, t.y, t.z); el.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
      el.synced = true;
      if (!el.toppled && (Math.abs(t.x - el.home.x) + Math.abs(t.y - el.home.y) + Math.abs(t.z - el.home.z) > 1.6)) this._topple(el);
      if (t.y < -30) this.damage(el, 1e9);
    }
  }
  progress() {
    const n = this.els.length || 1;
    return this.els.filter((e) => e.toppled).length / n;
  }
  dispose() {
    for (const el of this.els) { if (!el.dead) this.phys.removeBody(el.body); if (el.mesh) el.mesh.removeFromParent(); }
    this.els = [];
  }
}

// ---- generators -------------------------------------------------------------
// A tower of post-and-slab storeys (the classic "collapses beautifully" build).
export function buildTower(st, cx, cz, storeys = 4, size = 3, mat = 'wood', baseY = 0) {
  let y = baseY;
  const h = 1.5, t = 0.25, post = 0.3;
  for (let s = 0; s < storeys; s++) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      st.addBox([cx + sx * (size - post), y + h, cz + sz * (size - post)], [post, h, post], mat);
    }
    y += h * 2;
    st.addBox([cx, y + t, cz], [size, t, size], s === storeys - 1 ? 'steel' : mat, 0, { value: 20 });
    y += t * 2;
    if (s < storeys - 1) {
      st.addBox([cx - size + 0.15, y + 0.9, cz], [0.15, 0.9, size * 0.7], mat, 0, { value: 5 });
      st.addBox([cx + size - 0.15, y + 0.9, cz], [0.15, 0.9, size * 0.7], mat, 0, { value: 5 });
    }
  }
  st.addBox([cx, y + 0.6, cz], [0.6, 0.6, 0.6], 'steel', 0.6, { value: 50, core: true });
  return y;
}
export function buildWall(st, cx, cz, yaw, cols = 6, rows = 4, mat = 'stone', baseY = 0) {
  const w = 1.0, h = 0.5, d = 0.5;
  const dx = Math.cos(yaw), dz = -Math.sin(yaw);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const off = (c - (cols - 1) / 2) * w * 2 + (r % 2 ? w : 0);
    st.addBox([cx + dx * off, baseY + h + r * h * 2, cz + dz * off], [w - 0.01, h, d], mat, yaw);
  }
}
