// Damage & destruction rules, independent of rendering.
// Impact damage is derived from how violently a body's velocity changed during the
// step at the point of contact: resting or rolling contacts cost nothing, crashes hurt.
import { Vector3 } from 'three';
import { DT } from '../physics/world.js';

const THRESHOLD = 3.2;  // m/s of sudden velocity change that parts shrug off
const PER_MS = 13;      // hit points per m/s beyond the threshold
const _p = new Vector3();

// How violent was this contact for the thing that was hit, in m/s of sudden velocity change?
// Machine parts: the contact impulse spread over the rigid assembly it acts on (immune to
// motor-driven accelerations). Loose structure elements: their measured change in velocity
// across the step (immune to static loads from whatever is stacked on top of them).
function severity(force, me, col) {
  if (me.kind === 'struct') {
    const el = me.el, v = el.body.linvel(), w = el.body.angvel(), p = el.pv;
    const r = Math.max(el.half[0], el.half[1], el.half[2]) * 0.5;
    return Math.hypot(v.x - p[0], v.y - p[1], v.z - p[2]) + Math.hypot(w.x - p[3], w.y - p[4], w.z - p[5]) * r;
  }
  let mass;
  if (!me.piece.rec?.loose) mass = me.machine.liveMass || 1;
  else { const b = col.parent(); mass = b ? b.mass() : 1; }
  return (force * DT) / Math.max(0.5, mass);
}

const dealOf = (o) => (o && o.kind === 'piece' && o.part.def.impact ? o.part.def.impact.deal : 1);
const takeOf = (o) => (o.kind === 'piece' ? (o.part.def.impact ? o.part.def.impact.take : 1) : o.take ?? 1);

export function hurt(owner, amount, pos, source) {
  if (!owner || amount <= 0) return;
  if (owner.kind === 'piece') {
    if (source && source.machine === owner.machine) return;
    owner.machine.damagePart(owner.part, source && owner.part.def.mat === 'armor' ? amount * 0.5 : amount, pos);
    if (source) owner.machine.lastHitBy = source.machine;
  } else if (owner.kind === 'struct') owner.structure.damage(owner.el, amount, pos);
}

// Called once per physics step after phys.step().
export function processImpacts(phys, sim) {
  const { world, owners, contacts } = phys;
  const hits = new Map();
  for (let i = 0; i < contacts.length; i += 3) {
    const h1 = contacts[i], h2 = contacts[i + 1], force = contacts[i + 2];
    const o1 = owners.get(h1), o2 = owners.get(h2);
    if (!o1 || !o2) continue;
    if (o1.kind === 'proj' || o2.kind === 'proj') {
      const pr = o1.kind === 'proj' ? o1 : o2, other = o1.kind === 'proj' ? o2 : o1;
      if (other.kind !== 'proj') sim.weapons.onHit(pr.proj, other);
      continue;
    }
    for (let s = 0; s < 2; s++) {
      const me = s ? o2 : o1, other = s ? o1 : o2, h = s ? h2 : h1;
      if (me.kind !== 'piece' && me.kind !== 'struct') continue;
      if (me.kind === 'piece' && me.part.dead) continue;
      const col = world.getCollider(h);
      if (!col) continue;
      // impact weapons concentrate the blow: they multiply how hard the hit lands
      const sev = severity(force, me, col) * dealOf(other);
      if (sev <= THRESHOLD) continue;
      const dmg = (sev - THRESHOLD) * PER_MS * takeOf(me);
      const key = me.kind === 'piece' ? me.part : me.el;
      const cur = hits.get(key);
      if (!cur || cur.dmg < dmg) {
        const t = col.translation();
        hits.set(key, { me, dmg, sev, force, pos: new Vector3(t.x, t.y, t.z), other });
      }
    }
  }
  for (const h of hits.values()) {
    sim.hooks.onImpact?.(h);
    if (h.me.kind === 'piece' && h.other.kind === 'piece' && h.other.machine !== h.me.machine) h.me.machine.lastHitBy = h.other.machine;
    hurt(h.me, h.dmg, h.pos, null);
  }
}

// Radial blast: damage with falloff plus an outward shove.
export function explode(phys, sim, pos, radius, damage, impulse, source) {
  const seen = new Set();
  const shove = (body, at, f) => {
    if (!body || !body.isDynamic()) return;
    _p.set(at.x - pos.x, at.y - pos.y + 0.6, at.z - pos.z);
    const d = _p.length() || 1;
    body.wakeUp();
    body.applyImpulseAtPoint(_p.multiplyScalar((impulse * f) / d), at, true);
  };
  const victims = [];
  for (const m of sim.machines) for (const part of m.parts) {
    if (part.dead) continue;
    const at = m.partPos(part);
    const d = at.distanceTo(pos);
    if (d < radius) victims.push({ o: { kind: 'piece', machine: m, part }, at, f: 1 - d / radius, body: part.pieces[0].rec?.body });
  }
  for (const st of sim.structures) for (const el of st.els) {
    if (el.dead) continue;
    const t = el.body.translation(), at = new Vector3(t.x, t.y, t.z);
    const d = at.distanceTo(pos);
    if (d < radius) victims.push({ o: { kind: 'struct', structure: st, el }, at, f: 1 - d / radius, body: el.body });
  }
  for (const v of victims) {
    if (v.body && !seen.has(v.body.handle)) { seen.add(v.body.handle); shove(v.body, v.at, v.f); }
    hurt(v.o, damage * v.f, v.at, source);
  }
  sim.hooks.onExplosion?.(pos, radius);
}
