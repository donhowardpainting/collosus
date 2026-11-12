import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
await RAPIER.init();
const name = process.argv[2] || 'strider', secs = +(process.argv[3] || 10);
const sim = new Sim(RAPIER, {});
sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
const m = sim.spawn(new Design(EXAMPLES[name]()), { isPlayer: true });
const up = new Vector3(), f = new Vector3();
for (let i = 0; i < secs * 60; i++) {
  m.input.fwd = 1; sim.step();
  if (i % 30 === 0) { const p = m.position(); up.set(0, 1, 0).applyQuaternion(m.partQuat(m.control)); m.forward(f);
    console.log((i / 60).toFixed(1), 'pos', p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1), 'up', up.x.toFixed(2), up.y.toFixed(2), up.z.toFixed(2), 'fwd', f.x.toFixed(2), f.z.toFixed(2), 'dead', m.parts.filter((p) => p.dead).map((p) => p.type).join(',')); }
}
