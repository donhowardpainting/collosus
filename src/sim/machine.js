// Runtime machine: converts a Design's graph into rigid bodies + joints, and keeps
// that mapping correct as parts are destroyed (bodies split, joints re-bind, loose
// sections fall away). Rendering is injected through opts.makeMesh / opts.scene.
import { Vector3, Quaternion, Group } from 'three';
import { PARTS } from '../parts/catalog.js';
import { ORI, rot, cellCenter } from '../core/design.js';
import { buildGraph, weldComponents } from '../core/graph.js';
import { LOOSE_GROUPS, teamGroups } from '../physics/world.js';

const _v = new Vector3(), _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

// Lowest point of a design in its own frame (so we can spawn it resting on the ground).
export function designBounds(design) {
  let minY = Infinity, maxY = -Infinity, r = 0;
  for (const p of design.parts) {
    const c = cellCenter(p.cell);
    for (const pd of PARTS[p.type].pieces) for (const cd of pd.colliders) {
      const half = cd.shape === 'box' ? cd.half : [cd.r, cd.hh, cd.r];
      const h = rot(p.ori, half).map(Math.abs), o = rot(p.ori, cd.pos);
      minY = Math.min(minY, c.y + o[1] - h[1]);
      maxY = Math.max(maxY, c.y + o[1] + h[1]);
      r = Math.max(r, Math.hypot(c.x + o[0], c.z + o[2]) + Math.max(h[0], h[2]));
    }
  }
  return { minY: isFinite(minY) ? minY : 0, maxY: isFinite(maxY) ? maxY : 1, radius: r };
}

export class Machine {
  constructor(phys, design, opts = {}) {
    this.phys = phys;
    this.design = design;
    this.opts = opts;
    this.team = opts.team ?? 0;
    this.isPlayer = !!opts.isPlayer;
    this.hooks = opts.hooks || {};
    this.scene = opts.scene || null;
    this.bodies = new Set();
    this.debris = [];
    this.alive = true;
    this.time = 0;
    this.cruise = !!design.cruise;
    const bounds = designBounds(design);
    this.bounds = bounds;
    const o = opts.origin || new Vector3();
    this.origin = new Vector3(o.x, (opts.groundY ?? 0) - bounds.minY + 0.06, o.z);
    this.rootQuat = new Quaternion().setFromAxisAngle(UP, opts.yaw || 0);
    this.forwardLocal = new Vector3(...design.forward());

    const g = buildGraph(design);
    this.parts = [];
    const partOf = new Map();
    for (const src of design.parts) {
      const def = PARTS[src.type];
      const part = {
        id: src.id, src, def, type: src.type, cfg: { ...def.cfg, ...src.cfg }, hp: def.hp, maxHp: def.hp,
        pieces: [], joint: null, dead: false, detached: false, st: { cool: 0, target: 0, phaseT: 0 },
        center: new Vector3(),
      };
      const cells = design.cellsOf(src.type, src.cell, src.ori);
      cells.forEach((c) => part.center.add(cellCenter(c)));
      part.center.multiplyScalar(1 / cells.length);
      partOf.set(src, part);
      this.parts.push(part);
    }
    this.pieces = g.pieces.map((gp) => {
      const part = partOf.get(gp.part);
      const piece = {
        part, pd: gp.pd, welds: new Set(), rec: null, colliders: [], dead: false,
        lp: cellCenter(gp.part.cell), lq: ORI[gp.part.ori].q.clone(),
        mesh: opts.makeMesh ? opts.makeMesh(gp.part.type, gp.pd.key) : null,
      };
      if (piece.mesh) { piece.mesh.position.copy(piece.lp); piece.mesh.quaternion.copy(piece.lq); }
      part.pieces.push(piece);
      return piece;
    });
    for (const [a, b] of g.welds) { this.pieces[a].welds.add(this.pieces[b]); this.pieces[b].welds.add(this.pieces[a]); }
    this.control = this.parts.find((p) => p.def.control) || null;

    const pose = { t: this.origin, q: this.rootQuat };
    for (const comp of weldComponents(this.pieces)) this._newBody(comp, pose, null);
    this._refreshJoints();
    this._computeDrive();
    this.updateAttachment();
    this.totalHp = this.parts.reduce((s, p) => s + p.maxHp, 0);
  }

  // ---------- body / collider management ----------
  _newBody(pieces, pose, from, loose = false) {
    const { R, world } = this.phys;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(pose.t.x, pose.t.y, pose.t.z).setRotation(pose.q)
      .setLinearDamping(0.02).setAngularDamping(0.05).setCanSleep(loose);
    const body = world.createRigidBody(desc);
    const rec = { body, pieces: new Set(), group: new Group(), loose, ttl: Infinity };
    rec.group.matrixAutoUpdate = true;
    if (this.scene) this.scene.add(rec.group);
    this.bodies.add(rec);
    for (const p of pieces) this._attach(p, rec);
    if (from) {
      body.recomputeMassPropertiesFromColliders();
      const v = from.linvel(), w = from.angvel(), c0 = from.worldCom(), c1 = body.worldCom();
      const rx = c1.x - c0.x, ry = c1.y - c0.y, rz = c1.z - c0.z;
      body.setLinvel({ x: v.x + w.y * rz - w.z * ry, y: v.y + w.z * rx - w.x * rz, z: v.z + w.x * ry - w.y * rx }, true);
      body.setAngvel(w, true);
    }
    return rec;
  }
  _attach(piece, rec) {
    const { R, world } = this.phys;
    for (const c of piece.colliders) this.phys.removeCollider(c);
    piece.colliders = [];
    if (piece.rec) piece.rec.pieces.delete(piece);
    piece.rec = rec;
    rec.pieces.add(piece);
    const n = piece.pd.colliders.length;
    const grp = rec.loose ? LOOSE_GROUPS : teamGroups(this.team);
    for (const cd of piece.pd.colliders) {
      const d = cd.shape === 'box' ? R.ColliderDesc.cuboid(cd.half[0], cd.half[1], cd.half[2]) : R.ColliderDesc.cylinder(cd.hh, cd.r);
      _v.fromArray(cd.pos).applyQuaternion(piece.lq).add(piece.lp);
      d.setTranslation(_v.x, _v.y, _v.z).setRotation(piece.lq)
        .setMass(piece.pd.mass / n).setFriction(piece.pd.friction ?? (piece.part.def.mat === 'wood' ? 0.9 : 0.75))
        .setRestitution(0.05).setCollisionGroups(grp)
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(40);
      const col = world.createCollider(d, rec.body);
      this.phys.owners.set(col.handle, { kind: 'piece', machine: this, piece, part: piece.part });
      piece.colliders.push(col);
    }
    if (piece.mesh) rec.group.add(piece.mesh);
  }
  _removeRec(rec) {
    for (const p of rec.pieces) { p.colliders = []; if (p.mesh) rec.group.remove(p.mesh); p.rec = null; }
    this.phys.removeBody(rec.body);
    if (this.scene) this.scene.remove(rec.group);
    this.bodies.delete(rec);
  }
  _resplit(rec) {
    const body = rec.body;
    const t = body.translation(), r = body.rotation();
    const pose = { t: new Vector3(t.x, t.y, t.z), q: new Quaternion(r.x, r.y, r.z, r.w) };
    const all = [...rec.pieces];
    for (const p of all) if (p.dead) {
      const d = this._newBody([p], pose, body, true);
      d.ttl = 5 + Math.random() * 3;
      const c = d.body.worldCom(), c0 = body.worldCom();
      _v.set(c.x - c0.x, c.y - c0.y + 0.4, c.z - c0.z).normalize().multiplyScalar(2.5 * d.body.mass());
      d.body.applyImpulse(_v, true);
      d.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 }, true);
    }
    const comps = weldComponents(all.filter((p) => !p.dead));
    if (!comps.length) { this._removeRec(rec); return; }
    const mass = (c) => c.reduce((s, p) => s + p.pd.mass, 0);
    comps.sort((a, b) => mass(b) - mass(a));
    for (let i = 1; i < comps.length; i++) this._newBody(comps[i], pose, body, rec.loose).ttl = rec.ttl;
    body.recomputeMassPropertiesFromColliders();
  }
  _refreshJoints() {
    const { R, world } = this.phys;
    for (const part of this.parts) {
      const jd = part.def.joint;
      if (!jd) continue;
      const [a, b] = part.pieces;
      const want = !part.dead && a.rec !== b.rec;
      if (part.joint && (!want || part.jA !== a.rec || part.jB !== b.rec)) {
        if (world.getImpulseJoint(part.joint.handle)) world.removeImpulseJoint(part.joint, true);
        part.joint = null;
      }
      part.jammed = !part.dead && a.rec === b.rec;
      if (!want || part.joint) continue;
      const anchor = _v.fromArray(jd.anchor).applyQuaternion(a.lq).add(a.lp).clone();
      const axis = new Vector3().fromArray(jd.axis).applyQuaternion(a.lq);
      const data = jd.type === 'revolute' ? R.JointData.revolute(anchor, anchor, axis) : R.JointData.prismatic(anchor, anchor, axis);
      const j = world.createImpulseJoint(data, a.rec.body, b.rec.body, true);
      j.setContactsEnabled(false);
      if (jd.limits) j.setLimits(jd.limits[0], jd.limits[1]);
      j.configureMotorModel(R.MotorModel.ForceBased);
      part.joint = j; part.jA = a.rec; part.jB = b.rec;
      part.anchor = anchor; part.axis = axis;
      if (part.def.spring) {
        const k = part.def.spring.stiffness * (0.4 + 1.6 * (part.cfg.speed ?? 0.5));
        j.configureMotorPosition(0, k, part.def.spring.damping);
      }
    }
  }
  // Which way each motor must turn for "forward", and which side of the machine it is on.
  _computeDrive() {
    const f = this.forwardLocal, right = new Vector3().crossVectors(f, UP);
    const c = this.control ? this.control.center : new Vector3();
    for (const part of this.parts) {
      if (!part.def.motor) continue;
      const axis = new Vector3().fromArray(part.def.joint.axis).applyQuaternion(part.pieces[0].lq);
      const d = new Vector3().crossVectors(axis, UP).dot(f);
      part.driveSign = Math.abs(d) > 0.5 ? Math.sign(d) : 0;
      const s = _v.copy(part.center).sub(c).dot(right);
      part.side = Math.abs(s) < 0.3 ? 0 : -Math.sign(s); // +1 = left
    }
  }

  // ---------- damage / destruction ----------
  damagePart(part, amount, pos) {
    if (part.dead || amount <= 0) return;
    part.hp -= amount;
    this.hooks.onDamage?.(this, part, amount, pos);
    if (part.hp <= 0) this.destroyPart(part, pos);
  }
  destroyPart(part, pos) {
    if (part.dead) return;
    part.dead = true;
    const wp = pos || this.partPos(part);
    const recs = new Set();
    for (const p of part.pieces) {
      p.dead = true;
      for (const w of p.welds) w.welds.delete(p);
      p.welds.clear();
      if (p.rec) recs.add(p.rec);
    }
    if (part.joint) {
      if (this.phys.world.getImpulseJoint(part.joint.handle)) this.phys.world.removeImpulseJoint(part.joint, true);
      part.joint = null;
    }
    for (const rec of recs) this._resplit(rec);
    this._refreshJoints();
    this.updateAttachment();
    this.hooks.onDestroyed?.(this, part, wp);
  }
  // Everything not connected to a living control module becomes loose wreckage.
  updateAttachment() {
    const reach = new Set();
    if (this.control && !this.control.dead) {
      const stack = [this.control.pieces[0]];
      reach.add(stack[0]);
      while (stack.length) {
        const p = stack.pop();
        const next = [...p.welds];
        if (p.part.def.joint && !p.part.dead) next.push(...p.part.pieces);
        for (const n of next) if (!n.dead && !reach.has(n)) { reach.add(n); stack.push(n); }
      }
    }
    let supply = 0, demand = 0;
    for (const part of this.parts) {
      if (part.dead) continue;
      const on = part.pieces.some((p) => reach.has(p));
      if (!on && !part.detached) {
        part.detached = true;
        if (part.joint) part.joint.configureMotorVelocity(0, 0);
      }
      if (on) {
        supply += part.def.supply || 0;
        if (part.def.motor && part.cfg.mode !== 'free') demand += part.def.motor.demand;
      }
    }
    for (const rec of this.bodies) {
      if (rec.loose) continue;
      const any = [...rec.pieces].some((p) => reach.has(p));
      if (!any) {
        rec.loose = true;
        rec.ttl = 14 + Math.random() * 4;
        rec.body.enableCcd(false);
        for (const p of rec.pieces) for (const c of p.colliders) c.setCollisionGroups(LOOSE_GROUPS);
      }
    }
    let live = 0;
    for (const rec of this.bodies) if (!rec.loose) for (const p of rec.pieces) live += p.pd.mass;
    this.liveMass = live;
    this.supply = supply; this.demand = demand;
    this.power = supply <= 0 ? 0 : Math.min(1, supply / Math.max(1, demand));
    const was = this.alive;
    this.alive = !!this.control && !this.control.dead;
    if (was && !this.alive) this.hooks.onDisabled?.(this);
  }

  // ---------- queries ----------
  pieceWorld(piece, local, out = new Vector3()) {
    const b = piece.rec.body, t = b.translation(), r = b.rotation();
    return out.copy(local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_v.set(t.x, t.y, t.z));
  }
  partPos(part, out = new Vector3()) {
    const p = part.pieces[part.pieces.length - 1];
    if (!p.rec) return out.copy(this.origin);
    return this.pieceWorld(p, part.center, out);
  }
  partQuat(part, out = new Quaternion()) {
    const p = part.pieces[0];
    const r = p.rec.body.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }
  position(out = new Vector3()) {
    if (this.control && this.control.pieces[0].rec) return this.partPos(this.control, out);
    return out.copy(this.origin);
  }
  forward(out = new Vector3()) {
    if (!this.control || !this.control.pieces[0].rec) return out.set(0, 0, 1);
    return out.copy(this.forwardLocal).applyQuaternion(this.partQuat(this.control, _q));
  }
  velocity(out = new Vector3()) {
    const rec = this.control?.pieces[0].rec;
    if (!rec) return out.set(0, 0, 0);
    const v = rec.body.linvel();
    return out.set(v.x, v.y, v.z);
  }
  mainBody() { return this.control?.pieces[0].rec?.body || null; }
  integrity() {
    let hp = 0;
    for (const p of this.parts) if (!p.dead && !p.detached) hp += Math.max(0, p.hp);
    return hp / this.totalHp;
  }

  // ---------- per-step upkeep ----------
  update(dt) {
    this.time += dt;
    // joint overload: a joint whose anchors have been torn apart snaps
    for (const part of this.parts) {
      if (!part.joint || part.dead) continue;
      const a = this.pieceWorld(part.pieces[0], part.anchor, _a1), b = this.pieceWorld(part.pieces[1], part.anchor, _a2);
      if (part.def.joint.type === 'prismatic') {
        const ax = _a3.copy(part.axis).applyQuaternion(this.partQuat(part, _q));
        b.sub(a); part.ext = b.dot(ax); b.addScaledVector(ax, -part.ext);
        part.strain = b.length();
      } else part.strain = a.distanceTo(b);
      if (part.strain > 0.6) { this.hooks.onSnap?.(this, part, a); this.destroyPart(part, a.clone()); }
    }
    for (const rec of [...this.bodies]) {
      if (!rec.loose) continue;
      rec.ttl -= dt;
      const y = rec.body.translation().y;
      if (rec.ttl < 0 || y < -30) {
        for (const p of rec.pieces) if (!p.part.dead) { p.part.dead = true; p.dead = true; }
        this._removeRec(rec);
      } else if (rec.ttl < 1) rec.group.scale.setScalar(Math.max(0.01, rec.ttl));
    }
  }
  syncVisuals() {
    for (const rec of this.bodies) {
      const t = rec.body.translation(), r = rec.body.rotation();
      rec.group.position.set(t.x, t.y, t.z);
      rec.group.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const part of this.parts) {
      const rod = part.pieces[0].mesh?.userData.rod;
      if (rod) rod.scale.y = Math.max(0.05, rod.userData.base + (part.dead || !part.joint ? 0 : part.ext || 0));
    }
  }
  dispose() {
    for (const part of this.parts) if (part.joint && this.phys.world.getImpulseJoint(part.joint.handle)) this.phys.world.removeImpulseJoint(part.joint, false);
    for (const rec of [...this.bodies]) this._removeRec(rec);
  }
}
const _a1 = new Vector3(), _a2 = new Vector3(), _a3 = new Vector3();
