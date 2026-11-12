// AI opponents: produce the same input structure a human pilot does (fwd / turn / keys).
// They get no special physics — they drive whatever machine they were given.
import { Vector3 } from 'three';

const _p = new Vector3(), _t = new Vector3(), _f = new Vector3(), _v = new Vector3(), _u = new Vector3();

export class Pilot {
  constructor(machine, style = 'rammer') {
    this.m = machine; this.style = style;
    this.stuck = 0; this.reverse = 0; this.flipped = 0; this.bias = Math.random() < 0.5 ? -1 : 1;
    this.think = Math.random() * 0.3; this.aggro = 0.75 + Math.random() * 0.25;
  }
  update(dt, target) {
    const m = this.m, inp = m.input;
    inp.keys.clear();
    if (!m.alive) { inp.fwd = inp.turn = 0; return; }
    m.position(_p); m.forward(_f);
    _u.set(0, 1, 0).applyQuaternion(m.partQuat(m.control));
    this.flipped = _u.y < 0.25 ? this.flipped + dt : 0;
    this.crippled = m.mobile() ? 0 : (this.crippled || 0) + dt;
    if (this.flipped > 5 || this.crippled > 3) { m.destroyPart(m.control); return; } // helpless: the pilot bails out
    if (!target || !target.alive) { inp.fwd = 0; inp.turn = 0; return; }
    target.position(_t).sub(_p); _t.y = 0;
    const dist = _t.length() || 1;
    _t.multiplyScalar(1 / dist); _f.y = 0; _f.normalize();
    const ahead = _f.dot(_t), side = _t.x * -_f.z + _t.z * _f.x; // >0: target is to the right
    let fwd = ahead > 0.2 ? 1 : 0.35, turn = Math.max(-1, Math.min(1, side * 2.4));
    if (ahead < -0.2) turn = side >= 0 ? 1 : -1;
    if (this.style === 'gunner') {
      if (dist < 16) fwd = -0.7; else if (dist < 26) { fwd = 0.15; turn += this.bias * 0.25; }
      if (ahead > 0.985 && dist < 70) inp.keys.add('Space');
    } else if (this.style === 'boss') {
      if (dist < 12) fwd = 0.2;
      if (ahead > 0.97 && dist < 80) inp.keys.add('Space');
      if (ahead > 0.9 && dist > 12 && dist < 40) inp.keys.add('KeyF');
    } else if (ahead > 0.96 && dist < 60) inp.keys.add('Space');
    // unstick
    const speed = m.velocity(_v).length();
    if (this.reverse > 0) { this.reverse -= dt; fwd = -1; turn = this.bias; }
    else if (Math.abs(fwd) > 0.5 && speed < 0.6) { this.stuck += dt; if (this.stuck > 2.2) { this.stuck = 0; this.reverse = 1.4; this.bias *= -1; } }
    else this.stuck = Math.max(0, this.stuck - dt);
    inp.fwd = fwd * this.aggro; inp.turn = turn;
  }
}
