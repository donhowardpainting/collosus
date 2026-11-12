// Machine graph: turns a Design into pieces, weld edges and joint edges,
// and answers structural questions (rigid groups, jams, loose parts, mass, power).
import { Vector3 } from 'three';
import { PARTS } from '../parts/catalog.js';
import { DIRS, ORI, invRot, key, cellCenter } from './design.js';

export function buildGraph(design) {
  const pieces = [];
  const joints = [];
  const byPart = new Map();
  for (const part of design.parts) {
    const def = PARTS[part.type];
    const idx = def.pieces.map((pd) => {
      pieces.push({ i: pieces.length, part, def, pd, welds: new Set() });
      return pieces.length - 1;
    });
    byPart.set(part, idx);
    if (def.joint) joints.push({ a: idx[0], b: idx[1], part, def });
  }
  const welds = [];
  for (const [k, o] of design.occ) {
    const c = k.split(',').map(Number);
    for (const d of [DIRS[0], DIRS[2], DIRS[4]]) {
      const n = design.occ.get(key([c[0] + d[0], c[1] + d[1], c[2] + d[2]]));
      if (!n || n.part === o.part) continue;
      const defA = PARTS[o.part.type], defB = PARTS[n.part.type];
      const fa = defA.face(o.ci, invRot(o.part.ori, d));
      const fb = defB.face(n.ci, invRot(n.part.ori, [-d[0], -d[1], -d[2]]));
      if (fa < 0 || fb < 0) continue;
      const a = pieces[byPart.get(o.part)[fa]], b = pieces[byPart.get(n.part)[fb]];
      if (!a.welds.has(b)) { a.welds.add(b); b.welds.add(a); welds.push([a.i, b.i]); }
    }
  }
  return { pieces, joints, welds, byPart };
}

// Connected components over weld edges, restricted to `subset` (iterable of pieces).
export function weldComponents(subset) {
  const set = new Set(subset), seen = new Set(), comps = [];
  for (const p of set) {
    if (seen.has(p)) continue;
    const comp = [], stack = [p];
    seen.add(p);
    while (stack.length) {
      const q = stack.pop();
      comp.push(q);
      for (const w of q.welds) if (set.has(w) && !seen.has(w)) { seen.add(w); stack.push(w); }
    }
    comps.push(comp);
  }
  return comps;
}

// Engineering report shown in the workshop.
export function analyze(design) {
  const g = buildGraph(design);
  const comps = weldComponents(g.pieces);
  const compOf = new Map();
  comps.forEach((c, i) => c.forEach((p) => compOf.set(p, i)));
  const jammed = g.joints.filter((j) => compOf.get(g.pieces[j.a]) === compOf.get(g.pieces[j.b])).map((j) => j.part);
  // reachability from the control module across welds + joints
  const adj = new Map(comps.map((_, i) => [i, new Set()]));
  for (const j of g.joints) {
    const a = compOf.get(g.pieces[j.a]), b = compOf.get(g.pieces[j.b]);
    adj.get(a).add(b); adj.get(b).add(a);
  }
  const control = design.parts.find((p) => PARTS[p.type].control);
  const reach = new Set();
  if (control) {
    const start = compOf.get(g.pieces[g.byPart.get(control)[0]]);
    const stack = [start]; reach.add(start);
    while (stack.length) for (const n of adj.get(stack.pop())) if (!reach.has(n)) { reach.add(n); stack.push(n); }
  }
  const loose = control ? design.parts.filter((p) => !g.byPart.get(p).some((i) => reach.has(compOf.get(g.pieces[i])))) : [];
  let mass = 0, supply = 0, demand = 0, hp = 0;
  const com = new Vector3();
  for (const p of design.parts) {
    const def = PARTS[p.type];
    const c = new Vector3();
    def.cells.forEach(() => 0);
    const cells = design.cellsOf(p.type, p.cell, p.ori);
    cells.forEach((cc) => c.add(cellCenter(cc)));
    c.multiplyScalar(1 / cells.length);
    com.addScaledVector(c, def.mass);
    mass += def.mass; hp += def.hp;
    supply += def.supply || 0;
    if (def.motor && p.cfg.mode !== 'free') demand += def.motor.demand;
  }
  if (mass > 0) com.multiplyScalar(1 / mass);
  const warnings = [];
  if (!design.parts.length) warnings.push('Empty design — pick a part and click the build pad.');
  else {
    if (!control) warnings.push('No Control Module — the machine cannot be piloted.');
    if (demand > 0 && supply === 0) warnings.push('No Power Core — motors have no power.');
    else if (demand > supply) warnings.push(`Underpowered: motors want ${demand}, cores supply ${supply}. Everything runs weak.`);
    if (jammed.length) warnings.push(`${jammed.length} joint(s) jammed: both sides are welded to the same structure.`);
    if (loose.length) warnings.push(`${loose.length} part(s) not connected to the Control Module will fall off.`);
  }
  return { graph: g, bodies: comps.length, jammed, loose, mass, supply, demand, hp, com, warnings, control, ORI };
}
