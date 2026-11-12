// Simulation container: owns the physics world, machines, structures and weapons,
// and advances them one fixed step at a time. Knows nothing about rendering or UI.
import { Phys, DT } from '../physics/world.js';
import { Machine } from './machine.js';
import { Structure } from './structure.js';
import { Weapons } from './weapons.js';
import { applyControls } from './controls.js';
import { processImpacts, explode } from './damage.js';

export const newInput = () => ({ fwd: 0, turn: 0, keys: new Set() });

export class Sim {
  constructor(RAPIER, hooks = {}, view = {}) {
    this.phys = new Phys(RAPIER);
    this.hooks = hooks;
    this.view = view; // { scene, makeMesh, makeStructMesh }
    this.machines = [];
    this.structures = [];
    this.weapons = new Weapons(this.phys, this);
    this.pending = [];
    this.time = 0;
    this.nextTeam = 1;
  }
  spawn(design, opts = {}) {
    const hooks = {
      ...this.hooks,
      onDestroyed: (m, part, pos) => {
        if (part.def.explosive) this.pending.push(() => explode(this.phys, this, pos, 5, 90, 70, { machine: null }));
        this.hooks.onDestroyed?.(m, part, pos);
      },
    };
    const m = new Machine(this.phys, design, {
      scene: this.view.scene, makeMesh: this.view.makeMesh, hooks,
      team: opts.isPlayer ? 0 : this.nextTeam++, ...opts,
    });
    m.input = newInput();
    this.machines.push(m);
    return m;
  }
  addStructure(opts = {}) {
    const s = new Structure(this.phys, { makeMesh: this.view.makeStructMesh, hooks: this.hooks, ...opts });
    this.structures.push(s);
    return s;
  }
  removeMachine(m) {
    m.dispose();
    this.machines.splice(this.machines.indexOf(m), 1);
  }
  step() {
    for (const m of this.machines) applyControls(m, m.input, DT, this.weapons);
    this.phys.step();
    this.time += DT;
    processImpacts(this.phys, this);
    while (this.pending.length) this.pending.shift()();
    this.weapons.update(DT);
    for (const m of this.machines) m.update(DT);
    for (const s of this.structures) s.update();
  }
  sync() { for (const m of this.machines) m.syncVisuals(); }
  dispose() {
    this.weapons.clear();
    for (const m of [...this.machines]) m.dispose();
    for (const s of this.structures) s.dispose();
    this.machines = []; this.structures = [];
    this.phys.free();
  }
}
