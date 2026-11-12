import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim/sim.js';
import { buildTower, buildWall } from '../src/sim/structure.js';
await RAPIER.init();
const sim = new Sim(RAPIER, {}); sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
const st = sim.addStructure(); buildTower(st, 0, 21, 4, 3, 'wood'); buildWall(st, 14, 34, 0.35, 6, 4, 'stone'); buildTower(st, 2, 52, 5, 3.2, 'wood');
for (let i = 0; i < 600; i++) { sim.step(); if (i % 60 === 0) console.log(i / 60, 'toppled', st.progress().toFixed(2), 'dead', st.els.filter((e) => e.dead).length, 'awake', st.els.filter((e) => !e.dead && !e.body.isSleeping()).length); }
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
const m = sim.spawn(new Design(EXAMPLES.strider()), { isPlayer: true });
for (let i = 0; i < 1500; i++) { sim.step(); if (i % 120 === 0) console.log('strider', i / 60, 'z', m.position().z.toFixed(1), 'toppled', st.progress().toFixed(2), 'dead', st.els.filter((e) => e.dead).length, 'lost', m.parts.filter((p) => p.dead).map((p) => p.type).join()); }
