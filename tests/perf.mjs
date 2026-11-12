// Physics cost of the heaviest scene (Juggernaut wave + cover structures).
import RAPIER from '@dimforge/rapier3d-compat';
import { Group } from 'three';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
import { CHALLENGES } from '../src/game/challenges.js';
import { Pilot } from '../src/ai/ai.js';
await RAPIER.init();
const sim = new Sim(RAPIER, {}); sim.phys.staticBox([600, 5, 600], [0, -5, 0]);
const player = sim.spawn(new Design(EXAMPLES.fortress()), { isPlayer: true });
const ch = CHALLENGES.find((c) => c.id === 'arena').create({ sim, group: new Group(), player, storage: { data: { arenaWave: 4 }, save() {}, record() {} }, sound: { ui() {} }, banner() {} });
const bot = new Pilot(player, 'boss');
for (let i = 0; i < 200; i++) { ch.update(1 / 60); sim.step(); }
const t0 = performance.now(), N = 900;
for (let i = 0; i < N; i++) { bot.update(1 / 60, ch.enemies.find((e) => e.m.alive)?.m); ch.update(1 / 60); sim.step(); }
console.log(`wave ${ch.wave + 1}: ${sim.machines.length} machines, ${sim.phys.world.bodies.len()} bodies → ${((performance.now() - t0) / N).toFixed(2)} ms per physics step (budget 16.7)`);
