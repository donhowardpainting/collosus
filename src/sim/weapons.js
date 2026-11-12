// Projectile weapons: real rigid-body shot with recoil on the firing machine.
import { Vector3, Quaternion } from 'three';
import { groups, teamBit, G_LOOSE } from '../physics/world.js';
import { hurt, explode } from './damage.js';

const _q = new Quaternion();

export class Weapons {
  constructor(phys, sim) {
    this.phys = phys; this.sim = sim; this.list = [];
  }
  fire(machine, part) {
    const { R, world } = this.phys;
    const w = part.def.weapon, piece = part.pieces[0], body = piece.rec.body;
    const dir = new Vector3(0, 1, 0).applyQuaternion(piece.lq).applyQuaternion(machine.partQuat(part, _q)).normalize();
    const pos = machine.pieceWorld(piece, piece.lp.clone()).addScaledVector(dir, w.kind === 'cannon' ? 1.7 : 1.0);
    const bv = body.linvel();
    const r = w.kind === 'cannon' ? 0.22 : 0.34;
    const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(bv.x + dir.x * w.speed, bv.y + dir.y * w.speed, bv.z + dir.z * w.speed).setCcdEnabled(true));
    const mass = w.kind === 'cannon' ? 3 : 2;
    const c = world.createCollider(R.ColliderDesc.ball(r).setMass(mass).setRestitution(0.2)
      .setCollisionGroups(groups(G_LOOSE | teamBit(machine.team), 0xffff & ~teamBit(machine.team)))
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1), b);
    const proj = { body: b, kind: w.kind, w, machine, ttl: 7, dead: false, r, mesh: null };
    this.phys.owners.set(c.handle, { kind: 'proj', proj });
    this.list.push(proj);
    body.applyImpulseAtPoint({ x: -dir.x * w.recoil, y: -dir.y * w.recoil, z: -dir.z * w.recoil }, pos, true);
    this.sim.hooks.onFire?.(proj, pos, dir, machine);
    return proj;
  }
  onHit(proj, other) {
    if (proj.dead) return;
    if (other.kind === 'piece' && other.machine === proj.machine && !other.piece.rec?.loose) return;
    proj.dead = true;
    const t = proj.body.translation(), pos = new Vector3(t.x, t.y, t.z);
    const src = { machine: proj.machine };
    if (proj.kind === 'cannon') {
      hurt(other, proj.w.damage, pos, src);
      this.sim.hooks.onShotHit?.(proj, pos, other);
    } else {
      explode(this.phys, this.sim, pos, proj.w.radius, proj.w.damage, 60, src);
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.ttl -= dt;
      if (p.dead || p.ttl < 0 || p.body.translation().y < -20) {
        this.sim.hooks.onProjectileGone?.(p);
        this.phys.removeBody(p.body);
        this.list.splice(i, 1);
      }
    }
  }
  clear() { for (const p of this.list) { this.sim.hooks.onProjectileGone?.(p); this.phys.removeBody(p.body); } this.list = []; }
}
