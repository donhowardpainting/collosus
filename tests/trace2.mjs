import RAPIER from '@dimforge/rapier3d-compat';
import { Group, Vector3 } from 'three';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
import { CHALLENGES } from '../src/game/challenges.js';
await RAPIER.init();
const sim = new Sim(RAPIER, { onDamage: (m, part, a) => console.log('   dmg', part.type, a.toFixed(0)) });
sim.phys.staticBox([600, 5, 600], [0, -5, 0]);
const player = sim.spawn(new Design(EXAMPLES[process.argv[2] || 'buggy']()), { isPlayer: true });
const ch = CHALLENGES.find((c) => c.id === 'gauntlet').create({ sim, group: new Group(), player, storage: { data: {} }, sound: { ui() {} }, banner() {} });
const up = new Vector3();
for (let i = 0; i < 60 * 14; i++) { player.input.fwd = 1; if (process.argv[3]) { const p = player.position(), f = player.forward(); const side = (-p.x / 12) * -f.z + 1 * f.x; player.input.turn = Math.max(-1, Math.min(1, side * 3)); } ch.update(1 / 60); sim.step();
  if (i % 20 === 0) { const p = player.position(); up.set(0, 1, 0).applyQuaternion(player.partQuat(player.control)); console.log((i / 60).toFixed(1), p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1), 'up.y', up.y.toFixed(2), 'v', player.velocity().length().toFixed(1), 'turn', player.input.turn.toFixed(2), 'fwd', player.forward().x.toFixed(2)); } }
