// Headless mechanical verification: machines assembled through the general
// construction API must actually move under physics.
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { Sim } from '../src/sim/sim.js';
import { Design, oriFor } from '../src/core/design.js';
import { analyze } from '../src/core/graph.js';
import { EXAMPLES } from '../src/game/examples.js';
import { buildTower } from '../src/sim/structure.js';

await RAPIER.init();
const UP = [0, 1, 0], DOWN = [0, -1, 0], PX = [1, 0, 0], NX = [-1, 0, 0], PZ = [0, 0, 1];
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) failed++; };

function run(design, seconds, drive = (m, t) => { m.input.fwd = 1; }, setup) {
  const sim = new Sim(RAPIER, {});
  sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m = sim.spawn(design, { isPlayer: true });
  setup?.(sim, m);
  const start = m.position();
  let maxTilt = 0, t = 0;
  const up = new Vector3();
  for (let i = 0; i < seconds * 60; i++) {
    t = i / 60; drive(m, t, sim); sim.step();
    if (m.control && !m.control.dead) { up.set(0, 1, 0).applyQuaternion(m.partQuat(m.control)); maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, up.y))); }
  }
  const end = m.position();
  const res = { sim, m, start, end, dz: end.z - start.z, dx: end.x - start.x, maxTilt, lost: m.parts.filter((p) => p.dead || p.detached).length };
  return res;
}
const fmt = (r) => `dz=${r.dz.toFixed(1)} dx=${r.dx.toFixed(1)} tilt=${(r.maxTilt * 57.3).toFixed(0)}° lost=${r.lost} y=${r.end.y.toFixed(2)}`;

// 1. A wheeled vehicle built from scratch, part by part.
{
  const d = new Design();
  d.add('steel_beam', [0, 1, -1], oriFor(PZ));           // spine along Z
  d.add('steel_block', [-1, 1, -1], 0); d.add('steel_block', [1, 1, -1], 0);
  d.add('steel_block', [-1, 1, 1], 0); d.add('steel_block', [1, 1, 1], 0);
  d.add('wheel', [2, 1, -1], oriFor(PX)); d.add('wheel', [-2, 1, -1], oriFor(NX));
  d.add('wheel', [2, 1, 1], oriFor(PX)); d.add('wheel', [-2, 1, 1], oriFor(NX));
  d.add('power_core', [0, 2, -1], oriFor(UP)); d.add('control', [0, 2, 0], oriFor(UP));
  const a = analyze(d);
  check('car: graph is sound', a.warnings.length === 0 && a.bodies === 5, `bodies=${a.bodies} mass=${a.mass} ${a.warnings.join('|')}`);
  let r = run(d, 6);
  check('car: drives forward', r.dz > 20 && r.maxTilt < 0.5 && r.lost === 0, fmt(r));
  r = run(d, 6, (m) => { m.input.fwd = -1; });
  check('car: reverses', r.dz < -20, fmt(r));
  r = run(d, 5, (m) => { m.input.turn = 1; });
  const f = r.m.forward();
  check('car: skid-steers', Math.abs(f.z) < 0.99 || f.z < 0, `fwd=${f.x.toFixed(2)},${f.z.toFixed(2)}`);
  r = run(d, 3, (m) => {});
  check('car: stays put with no input', Math.abs(r.dz) < 0.5 && r.lost === 0, fmt(r));
  // no power core -> no motion
  const d2 = d.clone(); d2.remove(d2.parts.find((p) => p.type === 'power_core'));
  r = run(d2, 4);
  check('car: without a power core it does not move', Math.abs(r.dz) < 1, fmt(r));
}

// 2. A walking machine built from scratch: four rotor hips with beam legs.
{
  const d = new Design();
  d.add('platform', [0, 2, 0], oriFor(UP));
  d.add('steel_beam', [0, 2, 2], oriFor(PZ)); d.add('steel_beam', [0, 2, -2], oriFor([0, 0, -1]));
  for (const [z, flip] of [[-4, 0], [4, 1]]) {
    d.add('steel_block', [1, 2, z], 0); d.add('steel_block', [-1, 2, z], 0);
    d.add('rotor', [2, 2, z], oriFor(PX), { mode: 'gait', phase: flip ? 180 : 0 });
    d.add('rotor', [-2, 2, z], oriFor(NX), { mode: 'gait', phase: flip ? 0 : 180 });
    d.add('wood_beam', [3, 2, z], oriFor(DOWN)); d.add('wood_beam', [-3, 2, z], oriFor(DOWN));
  }
  d.add('power_core', [0, 3, -1], oriFor(UP)); d.add('control', [0, 3, 0], oriFor(UP));
  const a = analyze(d);
  check('walker: graph is sound', a.warnings.length === 0 && a.bodies === 5, `bodies=${a.bodies} mass=${a.mass} ${a.warnings.join('|')}`);
  const r = run(d, 10);
  check('walker: walks forward on rotating legs', r.dz > 8 && r.lost === 0 && r.end.y > 2.5 && r.maxTilt < 0.6, fmt(r));
}

// 3. Example machines
{
  let r = run(new Design(EXAMPLES.buggy()), 6);
  check('example buggy drives', r.dz > 20 && r.lost === 0, fmt(r));
  const sd = new Design(EXAMPLES.strider());
  const a = analyze(sd);
  check('example strider graph', a.warnings.length === 0, `bodies=${a.bodies} mass=${a.mass} supply=${a.supply}/${a.demand} ${a.warnings.join('|')}`);
  r = run(sd, 12, () => {});
  check('example strider walks on cruise control', r.dz > 12 && r.maxTilt < 0.6, fmt(r));
  r = run(sd, 8, (m) => { m.input.turn = 1; });
  const f = r.m.forward();
  check('example strider turns', f.z < 0.9, `fwd=${f.x.toFixed(2)},${f.z.toFixed(2)} ${fmt(r)}`);
  // wow moment: strider walks into a tower and scatters it
  let st;
  r = run(sd, 4, (m) => { m.cruise = false; }, (sim) => { st = sim.addStructure(); buildTower(st, 0, 26, 4, 3, 'wood'); });
  check('an untouched tower stands on its own', st.progress() === 0 && st.els.every((e) => !e.dead), `toppled=${(st.progress() * 100).toFixed(0)}%`);
  r = run(sd, 16, () => {}, (sim) => { st = sim.addStructure(); buildTower(st, 0, 26, 4, 3, 'wood'); });
  check('strider demolishes a tower', st.progress() > 0.5, `toppled=${(st.progress() * 100).toFixed(0)}% ${fmt(r)}`);
}

// 4. Structural failure: destroying parts splits bodies and disables the machine.
{
  const sim = new Sim(RAPIER, {});
  sim.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m = sim.spawn(new Design(EXAMPLES.buggy()), { isPlayer: true });
  for (let i = 0; i < 30; i++) sim.step();
  const n0 = m.bodies.size;
  m.destroyPart(m.parts.find((p) => p.type === 'wheel'));
  for (let i = 0; i < 30; i++) sim.step();
  check('destroyed wheel becomes debris', m.bodies.size === n0 + 1 && [...m.bodies].filter((b) => b.loose).length === 2, `bodies ${n0}->${m.bodies.size}`);
  m.destroyPart(m.parts.find((p) => p.type === 'platform'));
  for (let i = 0; i < 10; i++) sim.step();
  check('destroying the chassis scatters the machine', [...m.bodies].filter((b) => !b.loose).length === 1, `live bodies=${[...m.bodies].filter((b) => !b.loose).length} total=${m.bodies.size}`);
  m.destroyPart(m.control);
  check('losing the control module disables it', !m.alive);
  // a drop from height breaks a fragile machine
  const sim2 = new Sim(RAPIER, {});
  sim2.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m2 = sim2.spawn(new Design(EXAMPLES.buggy()), { isPlayer: true, groundY: 14 });
  for (let i = 0; i < 240; i++) sim2.step();
  check('a long fall causes damage', m2.parts.some((p) => p.hp < p.maxHp), `damaged=${m2.parts.filter((p) => p.hp < p.maxHp).length} dead=${m2.parts.filter((p) => p.dead).length}`);
  const sim3 = new Sim(RAPIER, {});
  sim3.phys.staticBox([300, 5, 300], [0, -5, 0]);
  const m3 = sim3.spawn(new Design(EXAMPLES.buggy()), { isPlayer: true });
  for (let i = 0; i < 300; i++) { m3.input.fwd = 1; sim3.step(); }
  check('normal driving causes no damage', m3.parts.every((p) => p.hp === p.maxHp));
  // cannon
  m3.input.keys.add('Space'); sim3.step(); m3.input.keys.clear();
  check('cannon fires a projectile', sim3.weapons.list.length === 1);
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
