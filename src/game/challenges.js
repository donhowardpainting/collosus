// Challenges: arena layouts, objectives, scoring. Each challenge only talks to the
// Sim (structures, statics, enemy spawns) through the small `ctx` it is given.
import * as THREE from 'three';
import { buildTower, buildWall } from '../sim/structure.js';
import { ENEMIES } from './examples.js';
import { Design } from '../core/design.js';
import { Pilot } from '../ai/ai.js';
import { MAT } from '../parts/visuals.js';

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function statics(ctx) {
  return (half, pos, rotX = 0, mat = 'stone', yaw = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, yaw, 0, 'YXZ'));
    ctx.sim.phys.staticBox(half, pos, q, 1.0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), MAT[mat]);
    m.position.set(...pos); m.quaternion.copy(q); m.castShadow = m.receiveShadow = true;
    ctx.group.add(m);
    return m;
  };
}
function gate(ctx, z, w = 9, color = 0xffc23a) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0.9 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), MAT.dark); p.position.set(s * (w + 1.2), 4.5, z); p.castShadow = true; g.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 3, 0.7, 0.7), mat); bar.position.set(0, 9, z); g.add(bar);
  ctx.group.add(g);
  return { z, w, bar, mat, passed: false };
}

class Demolition {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.done = null;
    const st = (this.st = ctx.sim.addStructure({ name: 'Demolition Yard' }));
    buildTower(st, 0, 21, 4, 3, 'wood');
    buildTower(st, -15, 36, 3, 2.6, 'wood');
    buildWall(st, 14, 34, 0.35, 6, 4, 'stone');
    buildTower(st, 2, 52, 5, 3.2, 'wood');
    buildWall(st, -6, 66, -0.2, 7, 3, 'stone');
    this.goal = 0.75;
  }
  get objective() { return `Topple ${Math.round(this.goal * 100)}% of the yard`; }
  get progress() { return Math.min(1, this.st.progress() / this.goal); }
  get status() { return `${Math.round(this.st.progress() * 100)}% toppled · ${fmtTime(this.t)}`; }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (!this.ctx.player.alive) this.done = { win: false, title: 'MACHINE DISABLED', lines: ['Your control module was destroyed.', 'Protect it with armor and try again.'], scrap: Math.round(this.st.progress() * 60) };
    else if (this.st.progress() >= this.goal) {
      const bonus = Math.max(0, Math.round((150 - this.t) * 2));
      this.done = { win: true, title: 'YARD DEMOLISHED', lines: [`Time ${fmtTime(this.t)}`, `Speed bonus +${bonus}`], scrap: 200 + bonus, record: { id: 'demolition', value: Math.round(this.t * 10) / 10, lower: true, label: 's' } };
    }
  }
}

class Gauntlet {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.done = null; this.started = false;
    const box = statics(ctx);
    for (const s of [-1, 1]) box([0.4, 0.9, 41], [s * 10.5, 0.9, 49.5], 0, 'stone');
    // 1. rumble bars
    [12, 15.5, 19, 22.5].forEach((z, i) => {
      const w = i % 2 ? 6 : 10, x = i % 2 ? (i === 1 ? 4 : -4) : 0;
      box([w, 0.06, 0.7], [x, 0.11, z - 0.62], -0.26, 'dark'); box([w, 0.06, 0.7], [x, 0.11, z + 0.62], 0.26, 'dark'); // speed humps
    });
    // 2. ramp up, plateau, ramp down
    box([8, 0.3, 6.2], [0, 1.2 - 0.294, 32.06], -0.195, 'steel');
    box([8, 1.2, 4], [0, 1.2, 42], 0, 'stone');
    box([8, 0.3, 4.18], [0, 0.913, 49.914], 0.2915, 'steel');
    // 3. slalom
    [[-2.5, 62], [3, 70], [-3, 78]].forEach(([x, z]) => box([1.1, 3, 1.1], [x, 3, z], 0, 'hazard'));
    // 4. barricade to smash through
    const st = (this.st = ctx.sim.addStructure({ name: 'Barricade' }));
    buildWall(st, 0, 85.5, 0, 9, 3, 'wood');
    this.gates = [gate(ctx, 24.5), gate(ctx, 42), gate(ctx, 81.5), gate(ctx, 90.5, 9, 0x50ff90)];
    this.next = 0;
  }
  get objective() { return 'Run the Gauntlet: bars, ramps, slalom, barricade'; }
  get progress() { return this.next / this.gates.length; }
  get status() { return `Gate ${Math.min(this.next + 1, this.gates.length)}/${this.gates.length} · ${fmtTime(this.t)}`; }
  update(dt) {
    if (this.done) return;
    const p = this.ctx.player.position();
    if (!this.started && p.z > 6) this.started = true;
    if (this.started) this.t += dt;
    const g = this.gates[this.next];
    if (g && p.z > g.z && Math.abs(p.x) < g.w + 1) {
      g.passed = true; g.mat.emissive.set(0x40ff80); this.next++;
      this.ctx.banner(this.next === this.gates.length ? 'FINISH!' : `GATE ${this.next}`, 1.2); this.ctx.sound.ui(true);
    }
    if (!this.ctx.player.alive) this.done = { win: false, title: 'MACHINE DISABLED', lines: ['The Gauntlet claims another design.'], scrap: this.next * 25 };
    else if (this.next >= this.gates.length) {
      const bonus = Math.max(0, Math.round((90 - this.t) * 4)), intact = Math.round(this.ctx.player.integrity() * 100);
      this.done = { win: true, title: 'GAUNTLET CLEARED', lines: [`Time ${fmtTime(this.t)}`, `Speed bonus +${bonus}`, `Machine intact ${intact}% → +${intact}`], scrap: 220 + bonus + intact, record: { id: 'gauntlet', value: Math.round(this.t * 10) / 10, lower: true, label: 's' } };
    }
  }
}

export const WAVES = [['ramlet'], ['ramlet', 'ramlet'], ['gunbuggy', 'ramlet'], ['stalker', 'gunbuggy'], ['gunbuggy', 'gunbuggy', 'stalker'], ['juggernaut']];

class Arena {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.done = null;
    this.wave = Math.min(ctx.storage.data.arenaWave || 0, WAVES.length - 1);
    this.enemies = []; this.pause = 2.5; this.earned = 0; this.kills = 0;
    const st = ctx.sim.addStructure({ name: 'Cover' });
    buildWall(st, -18, 26, 0.5, 5, 3, 'stone'); buildWall(st, 20, 30, -0.6, 5, 3, 'stone'); buildWall(st, 0, 58, 0, 6, 3, 'stone');
    buildTower(st, -26, 52, 2, 2.4, 'wood'); buildTower(st, 28, 56, 2, 2.4, 'wood');
  }
  get objective() { return `Iron Arena — wave ${this.wave + 1} of ${WAVES.length}`; }
  get progress() { const n = this.enemies.length; return n ? this.enemies.filter((e) => !e.m.alive).length / n : 0; }
  get status() { return this.pause > 0 ? 'Incoming…' : `${this.enemies.filter((e) => e.m.alive).length} hostile(s) · ${fmtTime(this.t)}`; }
  spawnWave() {
    const kinds = WAVES[this.wave], p = this.ctx.player.position();
    this.enemies = kinds.map((kind, i) => {
      const a = Math.atan2(40 - p.z, -p.x) + (i - (kinds.length - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.3;
      let x = p.x + Math.cos(a) * 44, z = p.z + Math.sin(a) * 44;
      const r = Math.hypot(x, z); if (r > 80) { x *= 80 / r; z *= 80 / r; }
      const def = ENEMIES[kind];
      const m = this.ctx.sim.spawn(new Design(def.design()), { origin: new THREE.Vector3(x, 0, z), yaw: Math.atan2(p.x - x, p.z - z), enemy: true });
      return { m, pilot: new Pilot(m, def.style), def, paid: false };
    });
    this.ctx.banner(this.wave === WAVES.length - 1 ? 'THE JUGGERNAUT' : `WAVE ${this.wave + 1}`, 2.2);
  }
  update(dt) {
    if (this.done) return;
    const { player, storage } = this.ctx;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.spawnWave(); return; }
    this.t += dt;
    for (const e of this.enemies) {
      e.pilot.update(dt, player);
      if (!e.m.alive && !e.paid) { e.paid = true; this.earned += e.def.bounty; this.kills++; this.ctx.banner(`${e.def.design().name.toUpperCase()} DESTROYED  +${e.def.bounty}`, 1.6); }
    }
    if (!player.alive) {
      this.done = { win: false, title: 'MACHINE DESTROYED', lines: [`Fell on wave ${this.wave + 1}`, `Kills ${this.kills}`, 'Repair, improve, and resume this wave.'], scrap: this.earned };
    } else if (this.enemies.every((e) => !e.m.alive)) {
      this.wave++;
      storage.data.arenaWave = this.wave >= WAVES.length ? 0 : this.wave; storage.save();
      storage.record('arena', this.wave, false);
      if (this.wave >= WAVES.length) this.done = { win: true, title: 'ARENA CHAMPION', lines: ['The Juggernaut is scrap.', `Kills ${this.kills}`, 'Champion bonus +600'], scrap: this.earned + 600 };
      else { this.pause = 4; this.ctx.banner('WAVE CLEARED', 1.8); }
    }
  }
}

class Sandbox {
  constructor(ctx) {
    this.ctx = ctx; this.done = null;
    const box = statics(ctx);
    box([5, 0.3, 7], [-16, 1.35, 24], -0.2, 'steel'); box([5, 1.4, 4], [-16, 1.4, 34.6], 0, 'stone');
    box([4, 0.25, 0.5], [14, 0.25, 16], 0, 'dark'); box([4, 0.25, 0.5], [14, 0.25, 20], 0, 'dark');
    const st = ctx.sim.addStructure({ name: 'Crates' });
    buildTower(st, 14, 34, 3, 2.6, 'wood'); buildWall(st, 0, 30, 0, 5, 4, 'stone');
    const m = ctx.sim.spawn(new Design(ENEMIES.gunbuggy.design()), { origin: new THREE.Vector3(-4, 0, 48), yaw: Math.PI, enemy: true });
    this.dummy = m;
  }
  get objective() { return 'Proving Ground — free testing, no objective'; }
  get progress() { return 0; }
  get status() { return 'Ramps, crates and an unmanned target buggy'; }
  update() { if (!this.ctx.player.alive && !this.done) this.done = { win: false, title: 'MACHINE DISABLED', lines: ['Back to the drawing board.'], scrap: 0 }; }
}

export const CHALLENGES = [
  { id: 'demolition', name: 'Demolition Yard', blurb: 'Flatten the towers. Speed pays.', create: (c) => new Demolition(c) },
  { id: 'gauntlet', name: 'The Gauntlet', blurb: 'Obstacle course: rumble bars, ramps, slalom, barricade.', create: (c) => new Gauntlet(c) },
  { id: 'arena', name: 'Iron Arena', blurb: 'Six waves of hostile machines. Ends with the Juggernaut.', create: (c) => new Arena(c) },
  { id: 'sandbox', name: 'Proving Ground', blurb: 'No rules. Test anything.', create: (c) => new Sandbox(c) },
];
