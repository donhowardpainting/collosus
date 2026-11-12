// Example machines. They are built with exactly the same Design.add() calls the
// workshop makes when a player clicks parts into place — nothing here is special-cased.
import { Design, oriFor } from '../core/design.js';

const UP = [0, 1, 0], DOWN = [0, -1, 0], PX = [1, 0, 0], NX = [-1, 0, 0], PZ = [0, 0, 1], NZ = [0, 0, -1];
const o = oriFor;

function make(name, fn, extra = {}) {
  const d = new Design();
  d.name = name;
  const add = (t, x, y, z, ori = o(UP), cfg) => {
    const p = d.add(t, [x, y, z], ori, cfg);
    if (!p) throw new Error(`example "${name}": cannot place ${t} at ${x},${y},${z}`);
    return p;
  };
  // place a part and its mirror image across X=0 (motors mirrored)
  const pair = (t, x, y, z, dirL, spin = 0, cfg) => {
    add(t, x, y, z, o(dirL, spin), cfg);
    const dirR = [-dirL[0], dirL[1], dirL[2]];
    add(t, -x, y, z, o(dirR, spin), cfg);
  };
  fn(add, pair);
  Object.assign(d, extra);
  return d.toJSON();
}

export const EXAMPLES = {
  strider: () => make('Strider — six-legged walker', (add, pair) => {
    add('platform', 0, 2, -2); add('platform', 0, 2, 2);
    add('steel_beam', -1, 2, 0, o(PX));
    // six rotor hips on a shared gait clock; two tripods (phase 0 / 180) take turns carrying the hull
    [-3, 0, 3].forEach((z, i) => {
      add('rotor', 2, 2, z, o(PX), { mode: 'gait', phase: i % 2 ? 180 : 0 });
      add('rotor', -2, 2, z, o(NX), { mode: 'gait', phase: i % 2 ? 0 : 180 });
      add('wood_beam', 3, 2, z, o(DOWN)); add('wood_beam', -3, 2, z, o(DOWN));
    });
    add('power_core', 0, 3, -2); add('power_core', 0, 3, -1);
    add('control', 0, 3, 1);
    add('armor_block', 0, 3, 2);
    add('cannon', 0, 4, 2, o(PZ));
    add('spike', -1, 2, 4, o(PZ)); add('spike', 1, 2, 4, o(PZ)); add('steel_block', 0, 2, 4);
    add('spike', 0, 2, 5, o(PZ));
  }, { cruise: true }),

  buggy: () => make('Scrap Buggy — wheeled rammer', (add, pair) => {
    add('platform', 0, 1, 0);
    pair('wheel', 2, 1, 1, PX); pair('wheel', 2, 1, -1, PX);
    add('power_core', 0, 2, -1);
    add('control', 0, 2, 0);
    add('cannon', 0, 2, 1, o(PZ));
    add('spike', 0, 1, 2, o(PZ));
  }),
};
