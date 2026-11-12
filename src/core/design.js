// Machine design data model: parts on an integer grid with one of 24 orientations.
// Pure data + math. Used by the builder, the graph, the simulator, AI machines and saves.
import { Quaternion, Vector3, Matrix4 } from 'three';
import { PARTS } from '../parts/catalog.js';

export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

// Orientation index = primary*4 + spin. `primary` is the world direction local +Y maps to.
const ALIGN = [
  new Quaternion().setFromAxisAngle(Z, -Math.PI / 2), // +Y -> +X
  new Quaternion().setFromAxisAngle(Z, Math.PI / 2),  // +Y -> -X
  new Quaternion(),                                   // +Y -> +Y
  new Quaternion().setFromAxisAngle(X, Math.PI),      // +Y -> -Y
  new Quaternion().setFromAxisAngle(X, Math.PI / 2),  // +Y -> +Z
  new Quaternion().setFromAxisAngle(X, -Math.PI / 2), // +Y -> -Z
];
export const ORI = [];
for (let p = 0; p < 6; p++) {
  for (let s = 0; s < 4; s++) {
    const q = ALIGN[p].clone().multiply(new Quaternion().setFromAxisAngle(Y, (s * Math.PI) / 2));
    const e = new Matrix4().makeRotationFromQuaternion(q).elements.map((v) => Math.round(v));
    // column-major: m[col][row]
    ORI.push({ q, m: [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]] });
  }
}
export const rot = (ori, v) => {
  const m = ORI[ori].m;
  return [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]];
};
export const invRot = (ori, v) => {
  const m = ORI[ori].m;
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
};
export const dirIndex = (d) => DIRS.findIndex((k) => k[0] === d[0] && k[1] === d[1] && k[2] === d[2]);
export const oriFor = (primaryDir, spin = 0) => dirIndex(primaryDir) * 4 + (((spin % 4) + 4) % 4);

const matKey = (m) => m.flat().join(',');
const ORI_LOOKUP = new Map(ORI.map((o, i) => [matKey(o.m), i]));
// Mirror across the X=0 plane: R' = M R M
export function mirrorOri(ori) {
  const m = ORI[ori].m;
  const r = m.map((col, c) => col.map((v, row) => v * (c === 0 ? -1 : 1) * (row === 0 ? -1 : 1)));
  return ORI_LOOKUP.get(matKey(r));
}

export const key = (c) => c[0] + ',' + c[1] + ',' + c[2];
export const cellCenter = (c) => new Vector3(c[0], c[1] + 0.5, c[2]);

let uid = 1;

export class Design {
  constructor(data) {
    this.name = 'Untitled Machine';
    this.cruise = false;
    this.parts = [];
    this.occ = new Map(); // "x,y,z" -> { part, ci }
    if (data) this.load(data);
  }
  cellsOf(type, cell, ori) {
    return PARTS[type].cells.map((o) => {
      const r = rot(ori, o);
      return [cell[0] + r[0], cell[1] + r[1], cell[2] + r[2]];
    });
  }
  canPlace(type, cell, ori, ignore = null) {
    const def = PARTS[type];
    if (!def) return false;
    if (def.unique && this.parts.some((p) => p.type === type && p !== ignore)) return false;
    return this.cellsOf(type, cell, ori).every((c) => {
      if (c[1] < 0 || c[1] > 40 || Math.abs(c[0]) > 30 || Math.abs(c[2]) > 30) return false;
      const o = this.occ.get(key(c));
      return !o || o.part === ignore;
    });
  }
  add(type, cell, ori, cfg) {
    if (!this.canPlace(type, cell, ori)) return null;
    const part = { id: uid++, type, cell: [...cell], ori, cfg: { ...PARTS[type].cfg, ...(cfg || {}) } };
    this.parts.push(part);
    this.cellsOf(type, cell, ori).forEach((c, ci) => this.occ.set(key(c), { part, ci }));
    return part;
  }
  remove(part) {
    const i = this.parts.indexOf(part);
    if (i < 0) return;
    this.parts.splice(i, 1);
    for (const c of this.cellsOf(part.type, part.cell, part.ori)) this.occ.delete(key(c));
  }
  at(cell) { const o = this.occ.get(key(cell)); return o ? o.part : null; }
  clear() { this.parts = []; this.occ.clear(); }
  toJSON() {
    return {
      v: 1, name: this.name, cruise: this.cruise,
      parts: this.parts.map((p) => ({ t: p.type, c: p.cell, o: p.ori, f: p.cfg })),
    };
  }
  load(data) {
    this.clear();
    this.name = data.name || 'Untitled Machine';
    this.cruise = !!data.cruise;
    for (const p of data.parts || []) if (PARTS[p.t]) this.add(p.t, p.c, p.o, p.f);
    return this;
  }
  clone() { return new Design(this.toJSON()); }
  // World-space (design frame) forward direction, defined by the control module's arrow (local +Z).
  forward() {
    const c = this.parts.find((p) => PARTS[p.type].control);
    if (!c) return [0, 0, 1];
    let f = rot(c.ori, [0, 0, 1]);
    if (f[1] !== 0) f = rot(c.ori, [0, 1, 0]);
    if (f[1] !== 0) f = [0, 0, 1];
    return f;
  }
}
