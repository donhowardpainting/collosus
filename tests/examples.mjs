import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { analyze } from '../src/core/graph.js';
import { EXAMPLES, ENEMIES } from '../src/game/examples.js';
await RAPIER.init();
const all = { ...EXAMPLES, ...Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.design])) };
for (const [k, fn] of Object.entries(all)) {
  const d = new Design(fn()); const a = analyze(d);
  const sim = new Sim(RAPIER, {}); sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m = sim.spawn(d, { isPlayer: true }); const s = m.position();
  for (let i = 0; i < 480; i++) { m.input.fwd = 1; sim.step(); }
  const e = m.position();
  console.log(k.padEnd(11), 'mass', String(a.mass).padEnd(5), 'pwr', a.supply + '/' + a.demand, 'bodies', a.bodies, 'dz', (e.z - s.z).toFixed(1), 'dx', (e.x - s.x).toFixed(1), 'y', e.y.toFixed(1), 'lost', m.parts.filter((p) => p.dead || p.detached).length, a.warnings.join(' | '));
}
