// Headless gameplay verification: bots play the real challenges on the real simulation.
import RAPIER from '@dimforge/rapier3d-compat';
import { Group, Vector3 } from 'three';
import { Sim } from '../src/sim/sim.js';
import { Design } from '../src/core/design.js';
import { EXAMPLES } from '../src/game/examples.js';
import { CHALLENGES } from '../src/game/challenges.js';
import { Pilot } from '../src/ai/ai.js';
await RAPIER.init();
const only = process.argv[2];
function setup(challengeId, example, arenaWave = 0) {
  const sim = new Sim(RAPIER, {});
  sim.phys.staticBox([600, 5, 600], [0, -5, 0]);
  const player = sim.spawn(new Design(EXAMPLES[example]()), { isPlayer: true });
  const storage = { data: { arenaWave }, save() {}, record() {} };
  const log = [];
  const ch = CHALLENGES.find((c) => c.id === challengeId).create({ sim, group: new Group(), player, storage, sound: { ui() {} }, banner: (t) => log.push(t) });
  return { sim, player, ch, storage, log };
}
const _f = new Vector3();
function steerTo(m, x, z) {
  const p = m.position(); m.forward(_f);
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
  const side = (dx / d) * -_f.z + (dz / d) * _f.x;
  m.input.turn = Math.max(-1, Math.min(1, side * 3)); m.input.fwd = 1;
  return d;
}
if (!only || only === 'gauntlet') for (const ex of ['buggy', 'strider', 'fortress']) {
  const { sim, player, ch } = setup('gauntlet', ex);
  const wps = [[0, 12], [0, 26], [0, 54], [4.5, 60], [-4, 69], [4.5, 78], [0, 84], [0, 97]];
  let wi = 0, t = 0, stuck = 0, rev = 0;
  for (; t < 150 && !ch.done; t += 1 / 60) {
    if (wi < wps.length - 1 && player.position().z > wps[wi][1] - 2.5) wi++;
    steerTo(player, ...wps[wi]);
    // like a human would: back up when wedged
    if (rev > 0) { rev -= 1 / 60; player.input.fwd = -1; player.input.turn *= -1; } else if (player.velocity().length() < 0.4) { if ((stuck += 1 / 60) > 2) { stuck = 0; rev = 1.5; } } else stuck = 0;
    ch.update(1 / 60); sim.step();
    if (process.env.TRACE && Math.round(t * 60) % 120 === 0) { const p = player.position(); console.log('   ', t.toFixed(0), p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1), 'wp', wi, 'v', player.velocity().length().toFixed(1)); }
  }
  const p = player.position();
  console.log(`gauntlet/${ex}: ${ch.done ? ch.done.title : 'TIMEOUT'} t=${ch.t.toFixed(1)}s gate=${ch.next}/4 pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} integrity=${(player.integrity() * 100).toFixed(0)}% lost=[${player.parts.filter((q) => q.dead).map((q) => q.type)}] scrap=${ch.done?.scrap}`);
}
if (!only || only === 'arena') for (const ex of ['fortress', 'strider', 'buggy']) {
  const { sim, player, ch, log } = setup('arena', ex);
  const bot = new Pilot(player, 'boss');
  let t = 0, lastWave = -1;
  for (; t < 600 && !ch.done; t += 1 / 60) {
    const target = ch.enemies.find((e) => e.m.alive)?.m;
    bot.update(1 / 60, target); ch.update(1 / 60); sim.step();
    for (const m of [...sim.machines]) if (!m.alive && m !== player && m.bodies.size === 0) sim.removeMachine(m);
    if (ch.wave !== lastWave) { lastWave = ch.wave; console.log(`  arena/${ex} t=${t.toFixed(0)}s wave ${ch.wave + 1} integrity=${(player.integrity() * 100).toFixed(0)}% bodies=${sim.phys.world.bodies.len()}`); }
  }
  console.log(`arena/${ex}: ${ch.done ? ch.done.title : 'TIMEOUT'} t=${t.toFixed(0)}s wave=${ch.wave + 1} kills=${ch.kills} integrity=${(player.integrity() * 100).toFixed(0)}% enemies=[${ch.enemies.map((e) => e.def.design().name + ':' + (e.m.alive ? (e.m.integrity() * 100).toFixed(0) + '%' : 'dead'))}]`);
}
if (!only || only === 'demolition') {
  const { sim, player, ch } = setup('demolition', 'strider');
  const wps = [[0, 21], [2, 52], [-6, 66], [-15, 36], [14, 34], [0, 21], [2, 52]];
  let wi = 0, t = 0;
  for (; t < 240 && !ch.done; t += 1 / 60) {
    if (steerTo(player, ...wps[wi]) < 3) wi = (wi + 1) % wps.length;
    if (Math.floor(t * 2) % 2 === 0) player.input.keys.add('Space'); else player.input.keys.clear();
    ch.update(1 / 60); sim.step();
  }
  console.log(`demolition/strider: ${ch.done ? ch.done.title : 'TIMEOUT'} t=${ch.t.toFixed(0)}s toppled=${(ch.st.progress() * 100).toFixed(0)}% integrity=${(player.integrity() * 100).toFixed(0)}% scrap=${ch.done?.scrap}`);
}
