// Control inputs -> motor targets. The same function drives the player and AI machines.
// input = { fwd: -1..1, turn: -1..1 (right positive), keys: Set<KeyboardEvent.code> }
import { Quaternion } from 'three';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const GAIT_RATE = TAU / 2.3;  // leg cycles per second at the default speed setting
const DUTY = 0.56 * TAU;      // share of each cycle a leg spends planted
const _qa = new Quaternion(), _qb = new Quaternion();

// Measured angle of a revolute joint (head relative to base, about the joint axis).
function jointAngle(part) {
  const a = part.pieces[0].rec.body.rotation(), b = part.pieces[1].rec.body.rotation();
  _qa.set(-a.x, -a.y, -a.z, a.w).multiply(_qb.set(b.x, b.y, b.z, b.w));
  const ax = part.axis;
  return 2 * Math.atan2(_qa.x * ax.x + _qa.y * ax.y + _qa.z * ax.z, _qa.w);
}
// Walking-leg clock: a slow planted sweep through the stride, then a fast swing over the top.
// Returns the unwrapped leg angle for clock phase `ph` and signed stride `s`.
function legAngle(ph, s, amp) {
  const turns = Math.floor(ph / TAU), p = ph - turns * TAU;
  if (p < DUTY) return turns * TAU + (-amp + 2 * amp * (p / DUTY)) * s;
  return turns * TAU + amp * s + ((p - DUTY) / (TAU - DUTY)) * (TAU - 2 * amp * s);
}
const wrap = (a) => a - TAU * Math.round(a / TAU);

export function applyControls(machine, input, dt, weapons) {
  const live = machine.alive;
  let fwd = live ? input.fwd : 0;
  const turn = live ? input.turn : 0;
  if (machine.cruise && live && fwd === 0) fwd = 1;
  const keys = live ? input.keys : EMPTY;
  const power = machine.power;
  let effort = 0;
  // shared gait clock: runs while driving, then coasts on to the next half-cycle so legs park upright
  const g = machine.gait || (machine.gait = { t: 0, f: 0, tn: 0 });
  const k = Math.min(1, dt * 5);
  g.f += (fwd - g.f) * k; g.tn += (turn - g.tn) * k;
  if (Math.abs(fwd) + Math.abs(turn) > 0.01) g.t += dt * GAIT_RATE;
  else { const rem = Math.PI - (g.t % Math.PI); if (rem > 0.02 && rem < Math.PI - 0.02) g.t += Math.min(rem, dt * GAIT_RATE); }
  for (const part of machine.parts) {
    if (part.dead || part.detached) continue;
    const def = part.def, cfg = part.cfg, st = part.st, m = def.motor;
    if (def.weapon) {
      st.cool -= dt;
      if (st.cool <= 0 && keys.has(cfg.keyPos) && weapons) { st.cool = def.weapon.cooldown; weapons.fire(machine, part); }
      continue;
    }
    if (!m || !part.joint) continue;
    const dir = cfg.reverse ? -1 : 1;
    const key = (keys.has(cfg.keyPos) ? 1 : 0) - (keys.has(cfg.keyNeg) ? 1 : 0);
    if (m.kind === 'spin') {
      let cmd = 0;
      if (cfg.mode === 'drive') cmd = clamp(fwd + turn * part.side * 1.2, -1, 1) * part.driveSign;
      else if (cfg.mode === 'auto') cmd = live ? 1 : 0;
      else if (cfg.mode === 'keys') cmd = key;
      if (cfg.mode === 'gait' && power > 0) {
        const sgn = (part.driveSign || 1) * dir, rate = cfg.speed / 0.6;
        const stride = clamp(g.f + g.tn * part.side * 1.2, -1, 1);
        const ph = g.t * rate + ((cfg.phase || 0) * Math.PI) / 180, amp = cfg.amp ?? 0.55;
        const des = legAngle(ph, stride, amp);
        const vel = (legAngle(ph + 0.02, stride, amp) - des) / 0.02 * GAIT_RATE * rate * (Math.abs(fwd) + Math.abs(turn) > 0.01 ? 1 : 0);
        const err = wrap(des - sgn * jointAngle(part));
        part.joint.setMotorMaxForce(m.torque * power);
        part.joint.configureMotorVelocity(sgn * clamp(vel + err * 7, -m.maxSpeed * 1.4, m.maxSpeed * 1.4), m.torque * 1.5);
        effort += Math.abs(stride);
        continue;
      }
      if (cfg.mode === 'free' || power <= 0) { part.joint.configureMotorVelocity(0, cfg.mode === 'free' ? 0 : 2); continue; }
      part.joint.setMotorMaxForce(m.torque * power);
      part.joint.configureMotorVelocity(cmd * dir * cfg.speed * m.maxSpeed, m.torque * 1.5);
      effort += Math.abs(cmd);
    } else {
      // position-controlled actuators (servo angle / piston extension)
      const range = m.range;
      if (cfg.mode === 'keys') {
        if (m.kind === 'extend') st.target = key > 0 ? range : key < 0 ? 0 : st.target;
        else st.target = clamp(st.target + key * dir * m.rate * (0.4 + cfg.speed) * dt, -range, range);
        effort += Math.abs(key) * 0.5;
      } else {
        const drive = cfg.mode === 'auto' ? (live ? 1 : 0) : fwd;
        st.phaseT += dt * drive * (0.5 + cfg.speed * 2.5) * Math.PI * 2 * 0.5;
        const s = Math.sin(st.phaseT + ((cfg.phase || 0) * Math.PI) / 180);
        const amp = cfg.amp ?? 1;
        st.target = m.kind === 'extend' ? range * amp * (0.5 + 0.5 * s * dir) : range * amp * s * dir;
        effort += Math.abs(drive) * 0.5;
      }
      const maxF = (m.torque || m.force) * power;
      part.joint.setMotorMaxForce(maxF);
      part.joint.configureMotorPosition(st.target, m.stiffness * power, m.damping);
    }
  }
  machine.effort = effort;
}
const EMPTY = new Set();
