// Workshop: grid snapping, ghost preview, mirror, rotate, pick/duplicate, move, delete, undo.
// Works purely on a Design; the simulator never sees this module.
import * as THREE from 'three';
import { PARTS } from '../parts/catalog.js';
import { Design, DIRS, ORI, oriFor, mirrorOri, cellCenter, key } from '../core/design.js';
import { analyze } from '../core/graph.js';
import { makePartMesh, MAT, initMaterials } from '../parts/visuals.js';

const PAD = 10; // half-size of the build pad in cells

export class Builder {
  constructor(world, sound) {
    initMaterials();
    this.world = world; this.sound = sound;
    this.design = new Design();
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.meshes = new Map();
    this.brush = null;          // { type, spin, primary (dir index or -1 = follow surface), cfg }
    this.mirror = false;
    this.selected = null;
    this.hover = null;
    this.undoStack = []; this.redoStack = [];
    this.onChange = () => {}; this.onSelect = () => {}; this.onBrush = () => {};
    this.active = false;
    this.cam = { target: new THREE.Vector3(0, 2.5, 0), yaw: 0.75, pitch: 0.3, dist: 24, tTarget: new THREE.Vector3(0, 2.5, 0), tYaw: 0.75, tPitch: 0.42, tDist: 24 };
    this.mouse = new THREE.Vector2(); this.ray = new THREE.Raycaster();
    this.drag = null;
    // helpers
    this.ghost = new THREE.Group(); this.ghost2 = new THREE.Group(); this.group.add(this.ghost, this.ghost2);
    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({ color: 0xffd34a, depthTest: false })); this.selBox.renderOrder = 20; this.selBox.visible = false;
    this.hovBox = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false })); this.hovBox.renderOrder = 19; this.hovBox.visible = false;
    this.group.add(this.selBox, this.hovBox);
    this.warn = new THREE.Group(); this.group.add(this.warn);
    this.warnGeo = boxGeo;
    this.mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), new THREE.MeshBasicMaterial({ color: 0x4ad0ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    this.mirrorPlane.rotation.y = Math.PI / 2; this.mirrorPlane.position.y = 7; this.mirrorPlane.visible = false; this.group.add(this.mirrorPlane);
    this.com = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff4fd0, depthTest: false })); ball.renderOrder = 21;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xff4fd0, depthTest: false, transparent: true, opacity: 0.6 })); line.renderOrder = 21;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4fd0, depthTest: false, transparent: true, opacity: 0.7 })); ring.renderOrder = 21;
    this.com.add(ball, line, ring); this.com.userData = { line, ring }; this.group.add(this.com);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.85, depthTest: false }));
    this.arrow.renderOrder = 21; this.group.add(this.arrow);
    this._bind(world.renderer.domElement);
  }

  // ---------- design mutation ----------
  _snapshot() { this.undoStack.push(JSON.stringify(this.design.toJSON())); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack.length = 0; }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.design.toJSON())); this._restore(JSON.parse(this.undoStack.pop())); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.design.toJSON())); this._restore(JSON.parse(this.redoStack.pop())); }
  _restore(json) { this.design.load(json); this.select(null); this.rebuild(); }
  load(json, snapshot = true) { if (snapshot) this._snapshot(); this.design.load(json); this.select(null); this.rebuild(); this.frame(); }
  clear() { this._snapshot(); this.design.clear(); this.design.name = 'Untitled Machine'; this.design.cruise = false; this.select(null); this.rebuild(); }
  rebuild() {
    for (const m of this.meshes.values()) this.group.remove(m);
    this.meshes.clear();
    for (const p of this.design.parts) this._addMesh(p);
    this.changed();
  }
  _addMesh(p) {
    const m = makePartMesh(p.type);
    m.position.copy(cellCenter(p.cell)); m.quaternion.copy(ORI[p.ori].q);
    this.group.add(m); this.meshes.set(p, m);
  }
  changed() {
    this.report = analyze(this.design);
    this._updateOverlays();
    this.onChange(this.report);
  }
  _mirrorOf(type, cell, ori, cfg) {
    const c = { ...cfg }, def = PARTS[type];
    if (def.motor) {
      if (c.mode === 'auto' || c.mode === 'keys') c.reverse = !c.reverse;
      if (c.mode === 'gait') c.phase = ((c.phase || 0) + 180) % 360;
    }
    return { cell: [-cell[0], cell[1], cell[2]], ori: mirrorOri(ori), cfg: c };
  }
  place(type, cell, ori, cfg) {
    if (!this.design.canPlace(type, cell, ori)) { this.sound.deny(); return null; }
    this._snapshot();
    const p = this.design.add(type, cell, ori, cfg);
    this._addMesh(p);
    if (this.mirror) {
      const mm = this._mirrorOf(type, cell, ori, p.cfg);
      const q = this.design.add(type, mm.cell, mm.ori, mm.cfg);
      if (q) this._addMesh(q);
    }
    this.sound.place();
    this.changed();
    return p;
  }
  _removeOne(p) { this.design.remove(p); const m = this.meshes.get(p); if (m) { this.group.remove(m); this.meshes.delete(p); } if (this.selected === p) this.select(null); }
  remove(p, snapshot = true) {
    if (!p) return;
    if (snapshot) this._snapshot();
    const twin = this.mirror ? this.design.parts.find((q) => q !== p && q.type === p.type && q.cell[0] === -p.cell[0] && q.cell[1] === p.cell[1] && q.cell[2] === p.cell[2]) : null;
    this._removeOne(p); if (twin) this._removeOne(twin);
    this.sound.remove();
    this.changed();
  }
  rotateSelected(tilt) {
    const p = this.selected; if (!p) return;
    const prim = Math.floor(p.ori / 4), spin = p.ori % 4;
    const ori = tilt ? ((prim + 1) % 6) * 4 + spin : prim * 4 + ((spin + 1) % 4);
    if (!this.design.canPlace(p.type, p.cell, ori, p)) { this.sound.deny(); return; }
    this._snapshot();
    const cfg = p.cfg, cell = p.cell, type = p.type;
    this._removeOne(p);
    const q = this.design.add(type, cell, ori, cfg); this._addMesh(q);
    this.select(q); this.sound.ui(); this.changed();
  }
  setCfg(part, patch) { this._snapshot(); Object.assign(part.cfg, patch); this.changed(); }

  // ---------- brush / selection ----------
  setBrush(type, opts = {}) {
    this.brush = type ? { type, spin: opts.spin ?? 0, primary: opts.primary ?? -1, cfg: opts.cfg || null, moving: opts.moving || null } : null;
    this.ghost.clear(); this.ghost2.clear();
    if (type) { this.ghost.add(makePartMesh(type, MAT.ghostOk)); this.ghost2.add(makePartMesh(type, MAT.ghostOk)); this.select(null); }
    this.onBrush(this.brush);
  }
  select(p) { this.selected = p; this.onSelect(p); this._updateOverlays(); }
  pick(p) { if (!p) return; this.setBrush(p.type, { spin: p.ori % 4, primary: Math.floor(p.ori / 4), cfg: { ...p.cfg } }); this.sound.ui(true); }
  grab(p) { if (!p) return; const info = { spin: p.ori % 4, primary: Math.floor(p.ori / 4), cfg: { ...p.cfg }, moving: true }; const type = p.type; this.remove(p); this.setBrush(type, info); }
  cancel() {
    if (this.brush?.moving) { this.setBrush(null); this.undo(); return; }
    if (this.brush) this.setBrush(null); else this.select(null);
  }

  // ---------- picking ----------
  _cast() {
    this.ray.setFromCamera(this.mouse, this.world.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const pos = [o.x + 0.5, o.y, o.z + 0.5], dir = [d.x, d.y, d.z];
    const v = pos.map(Math.floor), step = dir.map((x) => (x > 0 ? 1 : -1));
    const tMax = [0, 1, 2].map((i) => (dir[i] === 0 ? Infinity : (v[i] + (step[i] > 0 ? 1 : 0) - pos[i]) / dir[i]));
    const tDelta = dir.map((x) => (x === 0 ? Infinity : Math.abs(1 / x)));
    let normal = [0, 1, 0];
    for (let n = 0; n < 500; n++) {
      const part = this.design.occ.get(key(v));
      if (part) return { part: part.part, cell: [...v], normal, target: [v[0] + normal[0], v[1] + normal[1], v[2] + normal[2]] };
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      v[a] += step[a]; tMax[a] += tDelta[a];
      normal = [0, 0, 0]; normal[a] = -step[a];
      if (v[1] < 0) {
        if (dir[1] >= 0) return null;
        if (Math.abs(v[0]) > PAD || Math.abs(v[2]) > PAD) return null;
        return { part: null, cell: null, normal: [0, 1, 0], target: [v[0], 0, v[2]] };
      }
    }
    return null;
  }
  _brushOri(normal) {
    const b = this.brush;
    const prim = b.primary >= 0 ? DIRS[b.primary] : normal;
    return oriFor(prim, b.spin);
  }
  _updateHover() {
    const h = (this.hover = this.active && !this.quiet && !this.drag?.moved ? this._cast() : null);
    const g = this.ghost, g2 = this.ghost2;
    g.visible = g2.visible = false; this.hovBox.visible = false;
    if (!h) return;
    if (this.brush) {
      const ori = this._brushOri(h.normal), ok = this.design.canPlace(this.brush.type, h.target, ori);
      h.ori = ori; h.ok = ok;
      const set = (grp, cell, o, good) => {
        grp.visible = true; grp.position.copy(cellCenter(cell)); grp.quaternion.copy(ORI[o].q);
        grp.traverse((m) => { if (m.isMesh) m.material = good ? MAT.ghostOk : MAT.ghostBad; });
      };
      set(g, h.target, ori, ok);
      if (this.mirror) {
        const mm = this._mirrorOf(this.brush.type, h.target, ori, {});
        const same = mm.cell[0] === h.target[0] && mm.ori === ori;
        if (!same) set(g2, mm.cell, mm.ori, ok && this.design.canPlace(this.brush.type, mm.cell, mm.ori));
      }
    } else if (h.part) this._fitBox(this.hovBox, h.part);
  }
  _fitBox(box, p) {
    const cells = this.design.cellsOf(p.type, p.cell, p.ori), b = new THREE.Box3();
    for (const c of cells) b.expandByPoint(new THREE.Vector3(c[0] - 0.5, c[1], c[2] - 0.5)).expandByPoint(new THREE.Vector3(c[0] + 0.5, c[1] + 1, c[2] + 0.5));
    b.getCenter(box.position); b.getSize(box.scale).addScalar(0.06); box.visible = true;
  }
  _updateOverlays() {
    this.selBox.visible = false;
    if (this.selected) this._fitBox(this.selBox, this.selected);
    this.warn.clear();
    const r = this.report; if (!r) return;
    const mark = (p, color) => { const b = new THREE.LineSegments(this.warnGeo, new THREE.LineBasicMaterial({ color, depthTest: false })); b.renderOrder = 18; this._fitBox(b, p); b.scale.addScalar(0.1); this.warn.add(b); };
    r.jammed.forEach((p) => mark(p, 0xff8a1a)); r.loose.forEach((p) => mark(p, 0xff2a2a));
    this.com.visible = this.design.parts.length > 0;
    this.com.position.copy(r.com); this.com.userData.line.scale.y = r.com.y; this.com.userData.ring.position.y = -r.com.y + 0.04;
    const c = r.control;
    this.arrow.visible = !!c;
    if (c) { const f = this.design.forward(); this.arrow.position.set(c.cell[0] + f[0] * 2.2, c.cell[1] + 1.6, c.cell[2] + f[2] * 2.2); this.arrow.lookAt(this.arrow.position.x + f[0], this.arrow.position.y, this.arrow.position.z + f[2]); }
  }

  // ---------- camera ----------
  frame() {
    let maxY = 3, r = 6;
    for (const p of this.design.parts) { maxY = Math.max(maxY, p.cell[1] + 1); r = Math.max(r, Math.hypot(p.cell[0], p.cell[2]) + 2); }
    this.cam.tTarget.set(0, maxY * 0.45, 0); this.cam.tDist = Math.max(16, r * 2.2 + maxY);
  }
  setView(v) {
    const c = this.cam; this.view = v;
    if (v === 'top') { c.tPitch = 1.5; this.frame(); c.tDist *= 1.1; }
    else if (v === 'close') { const p = this.selected || this.hover?.part; if (p) c.tTarget.copy(cellCenter(p.cell)); c.tDist = 8; c.tPitch = 0.35; }
    else { c.tPitch = 0.42; this.frame(); }
  }
  helpers(on) { this.com.visible = on && this.design.parts.length > 0; this.arrow.visible = on && !!this.report?.control; if (!on) { this.hovBox.visible = false; this.ghost.visible = this.ghost2.visible = false; } this.quiet = !on; }
  enter() { this.active = true; this.group.visible = true; this.world.pad.visible = true; }
  exit() { this.active = false; this.group.visible = false; this.setBrush(null); this.select(null); }
  update(dt) {
    if (!this.active) return;
    const c = this.cam, k = 1 - Math.exp(-dt * 10);
    c.yaw += (c.tYaw - c.yaw) * k; c.pitch += (c.tPitch - c.pitch) * k; c.dist += (c.tDist - c.dist) * k; c.target.lerp(c.tTarget, k);
    const cp = Math.cos(c.pitch), cam = this.world.camera;
    cam.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
    cam.lookAt(c.target);
    this.world.focus.set(0, 0, 0);
    cam.updateMatrixWorld();
    this._updateHover();
    this.mirrorPlane.visible = this.mirror;
    const t = performance.now() * 0.004; this.arrow.material.opacity = 0.55 + 0.3 * Math.sin(t);
  }

  // ---------- input ----------
  _bind(el) {
    const setMouse = (e) => { const r = el.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      setMouse(e); el.setPointerCapture(e.pointerId);
      this.drag = { b: e.button, x: e.clientX, y: e.clientY, moved: false, pan: e.button === 1 || e.shiftKey };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      setMouse(e);
      const d = this.drag; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true; d.x = e.clientX; d.y = e.clientY;
      const c = this.cam;
      if (d.pan) {
        const s = c.dist * 0.0016, cam = this.world.camera;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        c.tTarget.addScaledVector(right, -dx * s).addScaledVector(up, dy * s); c.tTarget.y = Math.max(0, c.tTarget.y);
      } else { c.tYaw -= dx * 0.006; c.tPitch = Math.max(0.03, Math.min(1.52, c.tPitch + dy * 0.005)); }
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag; this.drag = null;
      if (!this.active || !d || d.moved) return;
      setMouse(e); this.world.camera.updateMatrixWorld();
      const h = this._cast(); this.hover = h;
      if (d.b === 0) {
        if (this.brush) {
          if (!h) return;
          const ori = this._brushOri(h.normal);
          const p = this.place(this.brush.type, h.target, ori, this.brush.cfg);
          if (p && this.brush.moving) { this.setBrush(null); this.select(p); }
        } else { this.select(h?.part || null); if (h?.part) this.sound.ui(); }
      } else if (d.b === 2) { if (this.brush) this.setBrush(null); else if (h?.part) this.remove(h.part); }
    });
    el.addEventListener('wheel', (e) => { if (!this.active) return; e.preventDefault(); this.cam.tDist = Math.max(5, Math.min(70, this.cam.tDist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
  }
  key(e) {
    if (!this.active) return false;
    const k = e.code;
    if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.shiftKey ? this.redo() : this.undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && k === 'KeyY') { this.redo(); return true; }
    if (e.ctrlKey || e.metaKey) return false;
    if (k === 'KeyR') { if (this.brush) { this.brush.spin = (this.brush.spin + 1) % 4; this.sound.ui(); } else this.rotateSelected(false); }
    else if (k === 'KeyT') { if (this.brush) { this.brush.primary = this.brush.primary >= 5 ? -1 : this.brush.primary + 1; this.sound.ui(); } else this.rotateSelected(true); }
    else if (k === 'KeyM') { this.mirror = !this.mirror; this.sound.ui(this.mirror); this.onBrush(this.brush); }
    else if (k === 'KeyX' || k === 'Delete' || k === 'Backspace') this.remove(this.selected || this.hover?.part);
    else if (k === 'KeyC') this.pick(this.selected || this.hover?.part);
    else if (k === 'KeyG') this.grab(this.selected || this.hover?.part);
    else if (k === 'Escape') this.cancel();
    else if (k === 'Digit1') this.setView('orbit');
    else if (k === 'Digit2') this.setView('top');
    else if (k === 'Digit3') this.setView('close');
    else if (k === 'KeyF') this.frame();
    else return false;
    return true;
  }
}
