import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
await RAPIER.init();
{ const sim = new Sim(RAPIER, {}); sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m = sim.spawn(new Design(EXAMPLES.hopper()), { isPlayer: true }); let maxY = 0, y0;
  for (let i = 0; i < 300; i++) { if (i === 60) { y0 = m.position().y; m.input.keys.add('ShiftLeft'); } if (i === 90) { m.input.keys.clear(); m.input.keys.add('KeyQ'); } sim.step(); maxY = Math.max(maxY, m.position().y); }
  console.log('hopper rest y', y0.toFixed(2), 'peak', maxY.toFixed(2), 'lost', m.parts.filter((p) => p.dead).length); }
{ const sim = new Sim(RAPIER, {}); sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m = sim.spawn(new Design(EXAMPLES.flail()), { isPlayer: true });
  for (let i = 0; i < 600; i++) { m.input.fwd = 1; sim.step(); }
  const p = m.position(); console.log('flail z', p.z.toFixed(1), 'x', p.x.toFixed(1), 'y', p.y.toFixed(2), 'lost', m.parts.filter((p) => p.dead).map((p) => p.type).join()); }
