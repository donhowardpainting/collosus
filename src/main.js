// Game bootstrap and state machine: title → workshop ⇄ simulation.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World, ARENA_R } from './render/scene.js';
import { FX } from './render/fx.js';
import { Sound } from './audio/audio.js';
import { Builder } from './build/builder.js';
import { UI } from './ui/ui.js';
import { Sim } from './sim/sim.js';
import { DT } from './physics/world.js';
import { Design } from './core/design.js';
import { makePieceMesh, makeEnemyPieceMesh, makeStructMesh, renderThumbnails, setScorched } from './parts/visuals.js';
import { CHALLENGES } from './game/challenges.js';
import { EXAMPLES } from './game/examples.js';
import { Storage } from './storage.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
const MAT_COLOR = { wood: 0x9a6a3c, steel: 0x8d949a, stone: 0x8d8478, armor: 0x4a5560, rubber: 0x222222 };

class Game {
  async init() {
    await RAPIER.init();
    Storage.load();
    this.world = new World(document.getElementById('c'));
    this.world.setQuality(Storage.data.quality);
    this.fx = new FX(this.world.scene);
    this.sound = new Sound(); this.sound.muted = Storage.data.muted;
    this.builder = new Builder(this.world, this.sound);
    this.challengeId = 'demolition';
    this.keys = new Set();
    this.mode = 'title';
    this.sim = null; this.player = null; this.challenge = null;
    this.simGroup = this.world.dynamic;
    this.sc = { yaw: 0, pitch: 0.3, dist: 26, tDist: 26, target: new THREE.Vector3(), user: 0, follow: true, intro: 0 };
    const thumbs = renderThumbnails(this.world.renderer, this.world.env);
    this.ui = new UI(this, thumbs);
    this.builder.onChange = () => { Storage.setCurrent(this.builder.design.toJSON()); this.ui.inspector(); };
    this.builder.onSelect = () => this.ui.inspector();
    this.builder.onBrush = (b) => this.ui.brushChanged(b);
    this.builder.load(Storage.data.current && Storage.data.current.parts?.length ? Storage.data.current : EXAMPLES.strider(), false);
    this.builder.undoStack.length = 0;
    this.builder.enter();
    Object.assign(this.builder.cam, { tDist: 32, dist: 32, tPitch: 0.13, pitch: 0.13 });
    if (Storage.data.current?.parts?.length && Storage.data.seenIntro) document.getElementById('t-go').textContent = `⚙ Activate “${this.builder.design.name.split(' — ')[0]}”`;
    this.ui.show('title');
    this._bind();
    this.last = performance.now(); this.acc = 0; this.time = 0;
    document.getElementById('loading').style.opacity = 0;
    setTimeout(() => document.getElementById('loading').remove(), 700);
    this.world.renderer.setAnimationLoop(() => this.frame());
  }

  _bind() {
    const canvas = this.world.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (this._capture) { e.preventDefault(); const c = this._capture; this._capture = null; if (e.code !== 'Escape') c(e.code); else this.ui.inspector(); return; }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' && document.activeElement.type === 'text' || tag === 'TEXTAREA') { if (e.code === 'Escape' || e.code === 'Enter') document.activeElement.blur(); return; }
      this.sound.init();
      if (this.mode === 'title') { if (e.code === 'Enter' || e.code === 'Space') this.startIntro(true); return; }
      if (this.mode === 'build') {
        if (e.code === 'Enter') { this.activate(); e.preventDefault(); return; }
        if (this.builder.key(e)) e.preventDefault();
        return;
      }
      if (e.repeat) { e.preventDefault(); return; }
      this.keys.add(e.code);
      const bound = this.player?.parts.some((p) => !p.dead && (p.cfg.keyPos === e.code || p.cfg.keyNeg === e.code) && (p.def.weapon || p.cfg.mode === 'keys'));
      if (!bound) {
        if (e.code === 'KeyB' || e.code === 'Escape') this.toWorkshop();
        else if (e.code === 'KeyR') this.restart();
        else if (e.code === 'KeyV') { this.sc.follow = !this.sc.follow; this.ui.toast(`Chase camera ${this.sc.follow ? 'on' : 'off'}`); }
        else if (e.code === 'KeyC' && this.player) { this.player.cruise = !this.player.cruise; this.ui.toast(`Cruise control ${this.player.cruise ? 'ON' : 'off'}`); }
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.sound.init(); if (this.mode === 'sim') { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'sim' || !drag) return;
      this.sc.yaw -= (e.clientX - drag.x) * 0.006; this.sc.pitch = Math.max(0.04, Math.min(1.45, this.sc.pitch + (e.clientY - drag.y) * 0.005));
      drag.x = e.clientX; drag.y = e.clientY; this.sc.user = 3;
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener('wheel', (e) => { if (this.mode === 'sim') { e.preventDefault(); this.sc.tDist = Math.max(8, Math.min(90, this.sc.tDist * (e.deltaY > 0 ? 1.12 : 0.89))); } }, { passive: false });
  }
  captureKey(cb) { this._capture = cb; }

  // ---------- state changes ----------
  startIntro(activate) {
    this.sound.init(); this.sound.ui(true);
    Storage.data.seenIntro = true; Storage.save();
    this.mode = 'build'; this.ui.show('build'); this.builder.setView('orbit');
    if (activate) this.activate();
    else this.ui.toast('Welcome to the workshop. Pick parts on the left — or just press ACTIVATE.', 5000);
  }
  activate() {
    const d = this.builder.design;
    if (!d.parts.length) { this.ui.toast('Nothing to activate — place some parts first.'); this.sound.deny(); return; }
    if (!this.builder.report.control) { this.ui.toast('Add a Control Module (Power & Control) so the machine can be piloted.'); this.sound.deny(); return; }
    this.sound.init();
    this._startSim();
  }
  restart() { if (this.mode === 'sim') this._startSim(true); }
  toWorkshop() {
    if (this.mode !== 'sim') return;
    this._endSim();
    this.mode = 'build'; this.ui.show('build'); this.ui.refreshTabs(); this.ui.inspector();
    this.builder.enter(); this.sound.engine(false);
    const c = this.builder.cam; c.yaw = c.tYaw = this.sc.yaw; c.dist = this.sc.dist; c.target.copy(this.sc.target); this.builder.frame();
  }
  _endSim() {
    if (!this.sim) return;
    this.fx.clear();
    this.sim.dispose(); this.sim = null; this.player = null; this.challenge = null;
    this.simGroup.clear();
  }
  _startSim(isRestart = false) {
    this._endSim();
    const bc = this.builder.cam;
    if (this.mode === 'build') { this.sc.yaw = bc.yaw; this.sc.pitch = bc.pitch; this.sc.dist = bc.dist; this.sc.target.copy(bc.target); }
    this.builder.exit();
    this.mode = 'sim';
    const sim = (this.sim = new Sim(RAPIER, this._hooks(), { scene: this.simGroup, makeMesh: makePieceMesh, makeEnemyMesh: makeEnemyPieceMesh, makeStructMesh: (el) => { const m = makeStructMesh(el); m.position.copy(el.home); this.simGroup.add(m); return m; } }));
    sim.phys.staticBox([600, 5, 600], [0, -5, 0]);
    for (let i = 0; i < 40; i++) { // arena rim
      const a = (i / 40) * Math.PI * 2;
      sim.phys.staticBox([8, 8, 1.3], [Math.cos(a) * ARENA_R, 8, Math.sin(a) * ARENA_R], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2));
    }
    for (const sx of [-1, 1]) sim.phys.staticBox([1.1, 15, 1.1], [sx * 17, 15, -19]);
    const design = new Design(this.builder.design.toJSON());
    this.player = sim.spawn(design, { isPlayer: true });
    const def = CHALLENGES.find((c) => c.id === this.challengeId);
    this.scrapRun = 0; this.resultShown = false; this.resultDelay = 0;
    this.challenge = def.create({ sim, group: this.simGroup, player: this.player, storage: Storage, sound: this.sound, banner: (t, s) => this.ui.banner(t, s) });
    this.ui.show('sim'); this.ui.simStart(this.player, this.challenge);
    // cinematic pull-back as the motors engage
    this.player.forward(_f);
    const r = this.player.bounds.radius;
    this.sc.tDist = Math.max(18, r * 2.6 + 6); this.sc.intro = isRestart ? 0 : 3.2; this.sc.user = 0;
    this.sc.introYaw = Math.atan2(-_f.x, -_f.z) + 0.75; this.sc.introPitch = 0.24;
    if (!isRestart) this.sc.dist = Math.min(this.sc.dist, Math.max(9, r * 1.5));
    this.simTime = 0; this.acc = 0; this.stranded = 0; this.strandMsg = null;
    this.sound.activate(); this.fx.shake(0.5);
    this.ui.banner(isRestart ? 'RESET' : 'ACTIVATE', 1.4);
    this.player.position(_p); this.fx.dust({ x: _p.x, y: 0, z: _p.z }, 26, r * 0.8, 2.5);
  }

  // ---------- simulation → effects ----------
  _near(pos) { return this.world.camera.position.distanceTo(pos) < 140; }
  _hooks() {
    const fx = this.fx, snd = this.sound;
    return {
      onDamage: (m, part, amount, pos) => {
        if (amount > 6 && pos && this._near(pos)) fx.sparks(pos, Math.min(14, 3 + amount / 6), 7);
        if (part.hp < part.maxHp * 0.5 && !part.scorched) { part.scorched = true; for (const p of part.pieces) if (p.mesh) setScorched(p.mesh); }
      },
      onDestroyed: (m, part, pos) => {
        const wood = part.def.mat === 'wood';
        fx.splinters(pos, MAT_COLOR[part.def.mat] || 0x777777, wood ? 12 : 7, 7, wood ? 0.45 : 0.3);
        fx.smoke(pos, 5, 1.2); fx.sparks(pos, wood ? 4 : 16, 10);
        if (part.def.control || part.def.explosive) { fx.explosion(pos, 4); snd.boom(); }
        wood ? snd.crack() : snd.clank(1);
        if (m === this.player) fx.shake(0.3);
        else if (m.lastHitBy === this.player || !m.isPlayer) this.scrapRun += 4;
        for (const p of part.pieces) if (p.mesh) setScorched(p.mesh);
      },
      onSnap: (m, part, pos) => { fx.sparks(pos, 22, 12); snd.snap(); if (m === this.player) this.ui.toast(`${part.def.name} tore itself apart under load!`); },
      onImpact: (h) => {
        if (!this._near(h.pos)) return;
        const s = Math.min(1, h.sev / 12);
        fx.dust({ x: h.pos.x, y: Math.min(h.pos.y, 0.5), z: h.pos.z }, 4 + s * 8, 0.6 + s, 2);
        h.other.kind === 'world' || (h.me.kind === 'struct' && h.me.el.mat !== 'steel') ? snd.thud(s) : snd.clank(s);
        fx.shake(s * 0.25);
      },
      onExplosion: (pos, r) => { fx.explosion(pos, r); snd.boom(); },
      onFire: (proj, pos, dir) => { fx.addShot(proj); fx.muzzle(pos, dir); snd.cannon(); },
      onProjectileGone: (proj) => fx.removeShot(proj),
      onShotHit: (proj, pos) => { fx.sparks(pos, 24, 14); fx.smoke(pos, 3, 0.8); fx.flash(pos, 300); snd.clank(1); snd.thud(0.8); },
      onElementDestroyed: (st, el, pos) => {
        fx.splinters(pos, MAT_COLOR[el.mat], Math.min(14, 5 + el.half[0] * el.half[1] * el.half[2] * 6), 6, el.mat === 'wood' ? 0.5 : 0.35);
        fx.dust(pos, 6, 1, 1.5); el.mat === 'wood' ? snd.crack() : snd.thud(0.7);
        this.scrapRun += Math.round(el.value / 5);
      },
      onToppled: (st, el) => { this.scrapRun += Math.round(el.value / 10); },
      onDisabled: (m) => {
        m.position(_p);
        fx.explosion(_p.clone(), 5); snd.boom();
        if (m === this.player) this.ui.banner('MACHINE DISABLED', 2.5);
      },
    };
  }
  // dust and thumps where legs and wheels meet the ground
  _groundContacts() {
    const { contacts, owners, world } = this.sim.phys, now = this.simTime;
    for (let i = 0; i < contacts.length; i += 3) {
      const a = owners.get(contacts[i]), b = owners.get(contacts[i + 1]);
      const pc = a?.kind === 'piece' ? a : b?.kind === 'piece' ? b : null, other = pc === a ? b : a;
      if (!pc || other?.kind !== 'world' || pc.piece.dead) continue;
      const piece = pc.piece, force = contacts[i + 2], m = pc.machine;
      const fresh = now - (piece.lastGround ?? -9) > 0.3;
      piece.lastGround = now;
      const col = world.getCollider(pc === a ? contacts[i] : contacts[i + 1]); if (!col) continue;
      const t = col.translation();
      if (fresh && force > 120) {
        _p.set(t.x, 0.1, t.z); if (!this._near(_p)) continue;
        const s = Math.min(1, force / (m.liveMass * 25));
        this.fx.dust(_p, 5 + s * 9, 0.8 + s, 1.6);
        this.sound.thud(0.25 + s * 0.6);
        if (m === this.player) this.fx.shake(0.06 + s * 0.14);
      } else if (piece.pd.friction > 1.5 && Math.random() < 0.12) {
        const v = piece.rec.body.linvel();
        if (v.x * v.x + v.z * v.z > 9) this.fx.dust({ x: t.x, y: 0.1, z: t.z }, 1, 0.5, 0.8);
      }
    }
  }
  _simStep() {
    const sim = this.sim, pl = this.player, k = this.keys;
    pl.input.fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    pl.input.turn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (pl.input.fwd < 0 && pl.cruise) pl.cruise = false;
    pl.input.keys = this.sc.intro > 2.2 ? new Set() : k;
    this.challenge.update(DT);
    sim.step();
    this.simTime += DT;
    this._groundContacts();
    for (const m of [...sim.machines]) if (!m.alive && m !== pl && m.bodies.size === 0) sim.removeMachine(m);
  }
  _simFrame(dt) {
    this.acc = Math.min(this.acc + dt, DT * 4);
    while (this.acc >= DT) { this._simStep(); this.acc -= DT; }
    const sim = this.sim, pl = this.player, sc = this.sc;
    sim.sync();
    // damaged machinery smokes
    for (const m of sim.machines) for (const part of m.parts) {
      if (part.dead || part.hp > part.maxHp * 0.4 || Math.random() > 0.06) continue;
      m.partPos(part, _p); if (this._near(_p)) this.fx.smoke(_p, 1, 0.7, part.def.explosive ? 0.3 : 0.12);
    }
    const speed = pl.velocity(_v).length();
    this.sound.engine(pl.alive && pl.power > 0, Math.min(1, (pl.effort || 0) / 3 + speed / 14));
    // camera
    pl.position(_p);
    sc.target.lerp(_p, 1 - Math.exp(-dt * 6));
    sc.user = Math.max(0, sc.user - dt);
    if (sc.intro > 0) {
      sc.intro -= dt;
      const k = 1 - Math.exp(-dt * 1.6);
      sc.yaw += Math.atan2(Math.sin(sc.introYaw - sc.yaw), Math.cos(sc.introYaw - sc.yaw)) * k; sc.pitch += (sc.introPitch - sc.pitch) * k;
      sc.dist += (sc.tDist - sc.dist) * (1 - Math.exp(-dt * 1.3));
    } else {
      sc.dist += (sc.tDist - sc.dist) * (1 - Math.exp(-dt * 6));
      if (sc.follow && sc.user <= 0 && pl.alive && speed > 1.5) {
        pl.forward(_f);
        const want = Math.atan2(-_f.x, -_f.z) + 0.35;
        sc.yaw += Math.atan2(Math.sin(want - sc.yaw), Math.cos(want - sc.yaw)) * (1 - Math.exp(-dt * 0.9));
      }
    }
    const cp = Math.cos(sc.pitch), cam = this.world.camera;
    cam.position.set(sc.target.x + Math.sin(sc.yaw) * cp * sc.dist, Math.max(0.8, sc.target.y + Math.sin(sc.pitch) * sc.dist), sc.target.z + Math.cos(sc.yaw) * cp * sc.dist);
    cam.lookAt(sc.target.x, sc.target.y + 0.5 + sc.dist * 0.16, sc.target.z);
    this.world.focus.copy(sc.target);
    this.ui.simUpdate(pl, this.challenge, speed, this.scrapRun);
    // stranded? tell the player why, once
    if (pl.alive && !this.challenge.done && this.simTime > 2) {
      pl.partQuat(pl.control, _q); _f.set(0, 1, 0).applyQuaternion(_q);
      const why = pl.power <= 0 ? 'No power — every Power Core is gone.' : !pl.mobile() ? 'Immobilised — no working drive motors left.' : _f.y < 0.2 ? 'Flipped over!' : null;
      this.stranded = why ? (this.stranded || 0) + dt : 0;
      if (this.stranded > 2.5 && this.strandMsg !== why) { this.strandMsg = why; this.ui.toast(`${why}  Press B to repair & improve, or R to restart.`, 6000); }
      if (!why) this.strandMsg = null;
    }
    // results
    const res = this.challenge.done;
    if (res && !this.resultShown) {
      this.resultDelay += dt;
      if (this.resultDelay > (res.win ? 1.6 : 2.6)) {
        this.resultShown = true;
        res.scrap += this.scrapRun; this.scrapRun = 0;
        Storage.addScrap(res.scrap);
        if (res.record) res.newBest = Storage.record(res.record.id, res.record.value, res.record.lower);
        const i = CHALLENGES.findIndex((c) => c.id === this.challengeId);
        res.next = res.win && CHALLENGES[i + 1] && CHALLENGES[i + 1].id !== 'sandbox' ? CHALLENGES[i + 1] : null;
        this.sound.fanfare(res.win);
        this.ui.result(res, {
          build: () => this.toWorkshop(), retry: () => this.restart(),
          next: () => { this.challengeId = res.next.id; this.restart(); },
        });
      }
    }
  }
  frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    if (this.mode === 'sim') this._simFrame(dt);
    else {
      if (this.mode === 'title') this.builder.cam.tYaw += dt * 0.12;
      this.builder.helpers(this.mode !== 'title');
      this.builder.update(dt);
    }
    this.fx.update(dt, this.world.camera);
    this.world.render(this.time);
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); document.getElementById('loading').innerHTML = `<div><h1>Startup failed</h1><p>${e.message}</p></div>`; });
