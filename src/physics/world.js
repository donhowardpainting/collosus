// Thin wrapper around Rapier: world setup, collision groups, collider ownership,
// per-step velocity snapshots and contact-force event collection.
export const G_WORLD = 1 << 0;
export const G_LOOSE = 1 << 1;
export const teamBit = (team) => 1 << (2 + (team % 14));
export const groups = (member, filter) => ((member << 16) | (filter & 0xffff)) >>> 0;
export const LOOSE_GROUPS = groups(G_LOOSE, 0xffff);
export const WORLD_GROUPS = groups(G_WORLD, 0xffff);
export const teamGroups = (team) => groups(teamBit(team), 0xffff & ~teamBit(team));

export const DT = 1 / 60;

export class Phys {
  constructor(RAPIER) {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.world.numSolverIterations = 10;
    this.world.numInternalPgsIterations = 2;
    this.events = new RAPIER.EventQueue(true);
    this.owners = new Map(); // collider handle -> owner record
    this.prev = new Map();   // body handle -> [vx,vy,vz,wx,wy,wz] before the step
    this.contacts = [];
    this.time = 0;
  }
  addStatic(desc, owner = { kind: 'world' }) {
    desc.setCollisionGroups(WORLD_GROUPS);
    const c = this.world.createCollider(desc);
    this.owners.set(c.handle, owner);
    return c;
  }
  staticBox(half, pos, quat = null, friction = 1.0) {
    const d = this.R.ColliderDesc.cuboid(half[0], half[1], half[2]).setTranslation(pos[0], pos[1], pos[2]).setFriction(friction);
    if (quat) d.setRotation(quat);
    return this.addStatic(d);
  }
  removeCollider(c) {
    this.owners.delete(c.handle);
    this.world.removeCollider(c, true);
  }
  removeBody(b) {
    for (let i = 0; i < b.numColliders(); i++) this.owners.delete(b.collider(i).handle);
    this.prev.delete(b.handle);
    this.world.removeRigidBody(b);
  }
  step() {
    this.world.step(this.events);
    this.time += DT;
    this.contacts.length = 0;
    this.events.drainContactForceEvents((e) => {
      this.contacts.push(e.collider1(), e.collider2(), e.totalForceMagnitude());
    });
    this.events.drainCollisionEvents(() => {});
  }
  free() { this.world.free(); this.events.free(); }
}
