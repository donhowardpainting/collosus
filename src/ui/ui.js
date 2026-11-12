// DOM user interface: title, workshop panels, simulation HUD, modals.
// Talks to the game only through the `game` facade passed in.
import { PARTS, CATEGORIES, MODE_LABELS } from '../parts/catalog.js';
import { CHALLENGES } from '../game/challenges.js';
import { EXAMPLES } from '../game/examples.js';
import { Storage } from '../storage.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const keyName = (code) => (code || '—').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('Arrow', '');

export class UI {
  constructor(game, thumbs) {
    this.game = game; this.thumbs = thumbs; this.cat = 'structure';
    const root = (this.root = $('#ui'));
    root.innerHTML = `
      <div id="vignette"></div>
      <div id="title" class="p">
        <div class="logo"><h1>COLOSSUS<span>CONSTRUCTION</span></h1><div class="tag">Build · Activate · Conquer</div></div>
        <div class="row"><button class="big" id="t-go">⚙ Activate the Strider</button><button class="ghost" id="t-build" style="font-size:18px;padding:10px 20px">Open Workshop</button></div>
        <div class="note">A six-legged walker is waiting on the pad. Wake it up and watch it walk under real physics — then tear it apart and build your own.</div>
      </div>
      <div id="build-ui" class="hidden">
        <div id="topbar" class="panel p">
          <div><div class="logo">COLOSSUS CONSTRUCTION</div><div class="loop">BUILD → ACTIVATE → TEST → FIGHT → REPAIR → IMPROVE</div></div>
          <div class="tabs" id="ch-tabs"></div>
          <div id="scrap"></div>
          <button class="big" id="b-activate" title="Enter">⚙ ACTIVATE</button>
        </div>
        <div id="catalog" class="panel p"><div class="tabs" id="cat-tabs"></div><div class="grid" id="cat-grid"></div><div id="tip"></div></div>
        <div id="inspector" class="panel p"></div>
        <div id="hints" class="panel"></div>
      </div>
      <div id="sim-ui" class="hidden">
        <div id="hud-obj" class="panel"><div class="cap" id="h-obj"></div><div class="bar"><i id="h-prog"></i></div><div class="st" id="h-status"></div></div>
        <div id="hud-right" class="panel">
          <div class="cap"><span>Integrity</span><span id="h-int"></span></div><div class="bar"><i id="h-intb"></i></div>
          <div class="cap"><span>Power</span><span id="h-pow"></span></div><div class="bar"><i id="h-powb"></i></div>
          <div class="cap"><span>Speed</span><span id="h-spd"></span></div>
          <div class="cap"><span>Scrap</span><span id="h-scrap" style="color:var(--amber)"></span></div>
        </div>
        <div id="hud-ctl" class="panel"></div>
        <div id="hud-btn" class="p"><button id="s-restart">↻ Restart <kbd>R</kbd></button><button id="s-build" class="on">🔧 Repair &amp; Improve <kbd>B</kbd></button></div>
        <div id="banner"></div>
      </div>
      <div id="toast" class="panel"></div>
      <div id="result" class="hidden p"></div>
      <div id="modal" class="hidden p"></div>`;
    $('#t-go').onclick = () => game.startIntro(true);
    $('#t-build').onclick = () => game.startIntro(false);
    $('#b-activate').onclick = () => game.activate();
    $('#s-restart').onclick = () => game.restart();
    $('#s-build').onclick = () => game.toWorkshop();
    this._tabs(); this._catalog(); this.hints(null, false);
  }
  show(mode) {
    $('#title').classList.toggle('hidden', mode !== 'title');
    $('#build-ui').classList.toggle('hidden', mode !== 'build');
    $('#sim-ui').classList.toggle('hidden', mode !== 'sim');
    $('#result').classList.add('hidden');
    if (mode === 'build') this.scrap();
  }
  scrap() { $('#scrap').textContent = `⛭ ${Storage.data.scrap} SCRAP`; }
  toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), ms); }
  banner(msg, secs = 2) { const b = $('#banner'); b.textContent = msg; b.classList.add('show'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), secs * 1000); }

  // ---------- workshop ----------
  _tabs() {
    const t = $('#ch-tabs'); t.innerHTML = '';
    for (const c of CHALLENGES) {
      const best = Storage.data.best[c.id];
      const b = el(`<button class="tab ${this.game.challengeId === c.id ? 'on' : ''}" title="${esc(c.blurb)}${best != null ? ` — best: ${best}` : ''}">${esc(c.name)}</button>`);
      b.onclick = () => { this.game.challengeId = c.id; this.game.sound.ui(); this._tabs(); this.toast(`${c.name}: ${c.blurb}`); };
      t.append(b);
    }
  }
  _catalog() {
    const tabs = $('#cat-tabs'), grid = $('#cat-grid'); tabs.innerHTML = ''; grid.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = el(`<button class="tab ${this.cat === c.id ? 'on' : ''}">${c.name}</button>`);
      b.onclick = () => { this.cat = c.id; this._catalog(); };
      tabs.append(b);
    }
    const brush = this.game.builder?.brush;
    for (const [id, def] of Object.entries(PARTS)) {
      if (def.cat !== this.cat) continue;
      const card = el(`<div class="card ${brush?.type === id ? 'on' : ''}"><img src="${this.thumbs[id]}" alt=""><div>${esc(def.name)}</div></div>`);
      card.onclick = () => { this.game.sound.ui(); this.game.builder.setBrush(brush?.type === id ? null : id); };
      card.onmouseenter = () => this.tip(id);
      grid.append(card);
    }
    this.tip(brush?.type);
  }
  tip(id) {
    const d = PARTS[id];
    $('#tip').innerHTML = d ? `<b>${esc(d.name)}</b>${esc(d.desc)}<br><span style="color:var(--amber)">mass ${d.mass} · hp ${d.hp}${d.supply ? ` · power +${d.supply}` : ''}${d.motor ? ` · draws ${d.motor.demand}` : ''}</span>` : 'Pick a part, then click the pad or a face of your machine to snap it on.';
  }
  brushChanged(brush) { this._catalog(); this.hints(brush, this.game.builder.mirror); this.inspector(); }
  hints(brush, mirror) {
    const k = (s) => `<kbd>${s}</kbd>`;
    $('#hints').innerHTML = brush
      ? `${k('Click')} place · ${k('R')} spin · ${k('T')} tilt · ${k('M')} mirror ${mirror ? '<b style="color:var(--green)">ON</b>' : 'off'} · ${k('Esc')} / ${k('Right-click')} drop tool · ${k('Drag')} orbit · ${k('Wheel')} zoom`
      : `${k('Click')} select · ${k('Right-click')} delete · ${k('C')} duplicate · ${k('G')} move · ${k('R')}/${k('T')} rotate · ${k('M')} mirror ${mirror ? '<b style="color:var(--green)">ON</b>' : 'off'} · ${k('Ctrl+Z')} undo · ${k('1')}${k('2')}${k('3')} views · ${k('Enter')} activate`;
  }
  inspector() {
    const b = this.game.builder, r = b.report, d = b.design, box = $('#inspector');
    if (!r) return;
    const focus = document.activeElement?.id;
    const pw = r.demand ? Math.min(1, r.supply / r.demand) : r.supply ? 1 : 0;
    let h = `<h3>Machine</h3><input type="text" id="i-name" value="${esc(d.name)}" maxlength="40">
      <div class="stat" style="margin-top:6px"><span>Parts</span><b>${d.parts.length}</b></div>
      <div class="stat"><span>Mass</span><b>${r.mass.toFixed(0)} t</b></div>
      <div class="stat"><span>Moving assemblies</span><b>${r.bodies}</b></div>
      <div class="stat"><span>Power (supply / draw)</span><b>${r.supply} / ${r.demand}</b></div>
      <div class="bar"><i style="width:${pw * 100}%;${pw < 1 ? 'background:var(--red)' : ''}"></i></div>`;
    h += r.warnings.length ? r.warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('') : `<div class="ok">✔ Structurally sound. Pink marker = centre of mass.</div>`;
    h += `<div class="rowb"><button id="i-mirror" class="${b.mirror ? 'on' : ''}">Mirror <kbd>M</kbd></button><button id="i-undo">Undo</button><button id="i-redo">Redo</button></div>
      <div class="rowb"><button data-v="orbit">Orbit</button><button data-v="top">Overhead</button><button data-v="close">Close-up</button></div>
      <label class="stat" style="cursor:pointer"><span>Cruise control on activation</span><input type="checkbox" id="i-cruise" ${d.cruise ? 'checked' : ''}></label>`;
    const p = b.selected;
    if (p) {
      const def = PARTS[p.type], c = p.cfg;
      h += `<h3>${esc(def.name)}</h3><div style="color:var(--dim);font-size:12px">${esc(def.desc)}</div>`;
      if (def.modes) h += `<div class="field"><label>Control</label><select id="c-mode">${def.modes.map((m) => `<option value="${m}" ${c.mode === m ? 'selected' : ''}>${MODE_LABELS[m]}</option>`).join('')}</select></div>`;
      if (def.motor || def.spring) h += `<div class="field"><label><span>${def.spring ? 'Stiffness' : 'Speed'}</span><span>${Math.round((c.speed ?? 0.5) * 100)}%</span></label><input type="range" id="c-speed" min="0.1" max="1" step="0.05" value="${c.speed ?? 0.5}"></div>`;
      if (def.motor) h += `<label class="stat" style="cursor:pointer"><span>Reverse direction</span><input type="checkbox" id="c-rev" ${c.reverse ? 'checked' : ''}></label>`;
      if (def.motor && (c.mode === 'gait' || (c.mode === 'auto' && def.motor.kind !== 'spin'))) {
        h += `<div class="field"><label><span>Phase</span><span>${c.phase || 0}°</span></label><input type="range" id="c-phase" min="0" max="270" step="90" value="${c.phase || 0}"></div>`;
        h += `<div class="field"><label><span>${def.motor.kind === 'spin' ? 'Stride' : 'Swing'}</span><span>${Math.round((c.amp ?? 0.6) * 100)}%</span></label><input type="range" id="c-amp" min="0.2" max="1" step="0.05" value="${c.amp ?? 0.6}"></div>`;
      }
      if ((def.motor && c.mode === 'keys') || def.weapon) {
        h += `<div class="field"><label>${def.weapon ? 'Fire key' : 'Keys (+ / −)'}</label><div class="keys"><button id="c-kp">${keyName(c.keyPos)}</button>${def.weapon ? '' : `<button id="c-kn">${keyName(c.keyNeg)}</button>`}</div></div>`;
      }
      h += `<div class="rowb"><button id="p-rot">Spin <kbd>R</kbd></button><button id="p-tilt">Tilt <kbd>T</kbd></button><button id="p-dup">Duplicate <kbd>C</kbd></button></div>
        <div class="rowb"><button id="p-move">Move <kbd>G</kbd></button><button id="p-del">Delete <kbd>X</kbd></button></div>`;
    } else h += `<div style="color:var(--dim);font-size:12px;margin-top:6px">Click a part to configure its motor, keys and direction.</div>`;
    h += `<h3>Designs</h3><div class="rowb"><button id="d-save">Save</button><button id="d-load">Load / Examples</button></div>
      <div class="rowb"><button id="d-clear">New (clear)</button><button id="d-io">Export / Import</button></div>
      <div class="rowb"><button id="d-q">Graphics: ${Storage.data.quality}</button><button id="d-mute">Sound: ${Storage.data.muted ? 'off' : 'on'}</button></div>`;
    box.innerHTML = h;
    const on = (id, ev, fn) => { const e = $('#' + id); if (e) e[ev] = fn; };
    on('i-name', 'oninput', (e) => { d.name = e.target.value; Storage.setCurrent(d.toJSON()); });
    on('i-mirror', 'onclick', () => { b.mirror = !b.mirror; this.brushChanged(b.brush); });
    on('i-undo', 'onclick', () => b.undo()); on('i-redo', 'onclick', () => b.redo());
    on('i-cruise', 'onchange', (e) => { d.cruise = e.target.checked; Storage.setCurrent(d.toJSON()); });
    box.querySelectorAll('[data-v]').forEach((x) => (x.onclick = () => b.setView(x.dataset.v)));
    if (p) {
      on('c-mode', 'onchange', (e) => b.setCfg(p, { mode: e.target.value }));
      on('c-speed', 'onchange', (e) => b.setCfg(p, { speed: +e.target.value }));
      on('c-rev', 'onchange', (e) => b.setCfg(p, { reverse: e.target.checked }));
      on('c-phase', 'onchange', (e) => b.setCfg(p, { phase: +e.target.value }));
      on('c-amp', 'onchange', (e) => b.setCfg(p, { amp: +e.target.value }));
      const bind = (id, field) => on(id, 'onclick', (e) => { e.target.textContent = 'press a key…'; this.game.captureKey((code) => b.setCfg(p, { [field]: code })); });
      bind('c-kp', 'keyPos'); bind('c-kn', 'keyNeg');
      on('p-rot', 'onclick', () => b.rotateSelected(false)); on('p-tilt', 'onclick', () => b.rotateSelected(true));
      on('p-dup', 'onclick', () => b.pick(p)); on('p-move', 'onclick', () => b.grab(p)); on('p-del', 'onclick', () => b.remove(p));
    }
    on('d-save', 'onclick', () => { Storage.saveDesign(d.name || 'Untitled', d.toJSON()); this.toast(`Saved “${d.name}”`); this.game.sound.ui(true); });
    on('d-load', 'onclick', () => this.loadModal());
    on('d-clear', 'onclick', () => b.clear());
    on('d-io', 'onclick', () => this.ioModal());
    on('d-q', 'onclick', () => { Storage.data.quality = Storage.data.quality === 'high' ? 'low' : 'high'; Storage.save(); this.game.world.setQuality(Storage.data.quality); this.inspector(); });
    on('d-mute', 'onclick', () => { Storage.data.muted = !Storage.data.muted; Storage.save(); this.game.sound.setMuted(Storage.data.muted); this.inspector(); });
    if (focus === 'i-name') { const n = $('#i-name'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }
  closeModal() { $('#modal').classList.add('hidden'); }
  loadModal() {
    const m = $('#modal'), b = this.game.builder;
    m.classList.remove('hidden');
    m.innerHTML = `<div class="panel"><h2>Load a machine</h2><div class="cap" style="color:var(--dim)">Example machines</div><div id="m-ex"></div>
      <div class="cap" style="color:var(--dim);margin-top:10px">Your saved designs</div><div id="m-sv"></div><div class="row"><button id="m-x">Close</button></div></div>`;
    for (const [id, fn] of Object.entries(EXAMPLES)) {
      const j = fn(), it = el(`<div class="item"><span>${esc(j.name)}<br><small>${j.parts.length} parts</small></span><button>Load</button></div>`);
      it.querySelector('button').onclick = () => { b.load(j); this.closeModal(); this.toast(`Loaded ${j.name}`); };
      $('#m-ex').append(it);
    }
    const names = Object.keys(Storage.data.designs);
    if (!names.length) $('#m-sv').innerHTML = '<div style="color:var(--dim);padding:6px">Nothing saved yet. Use Save in the workshop.</div>';
    for (const n of names) {
      const j = Storage.data.designs[n], it = el(`<div class="item"><span>${esc(n)}<br><small>${j.parts.length} parts</small></span><button class="l">Load</button><button class="d">✕</button></div>`);
      it.querySelector('.l').onclick = () => { b.load(j); this.closeModal(); };
      it.querySelector('.d').onclick = () => { Storage.deleteDesign(n); this.loadModal(); };
      $('#m-sv').append(it);
    }
    $('#m-x').onclick = () => this.closeModal();
  }
  ioModal() {
    const m = $('#modal'), b = this.game.builder;
    m.classList.remove('hidden');
    m.innerHTML = `<div class="panel"><h2>Export / Import</h2><div style="color:var(--dim);margin-bottom:6px">Copy this text to share a machine, or paste one and press Import.</div>
      <textarea id="m-t" rows="9" spellcheck="false">${esc(JSON.stringify(b.design.toJSON()))}</textarea>
      <div class="row"><button id="m-copy">Copy</button><button id="m-imp" class="on">Import</button><button id="m-x">Close</button></div></div>`;
    $('#m-copy').onclick = () => { $('#m-t').select(); navigator.clipboard?.writeText($('#m-t').value); this.toast('Copied to clipboard'); };
    $('#m-imp').onclick = () => { try { const j = JSON.parse($('#m-t').value); if (!Array.isArray(j.parts)) throw 0; b.load(j); this.closeModal(); this.toast('Design imported'); } catch { this.toast('That is not a valid machine design'); } };
    $('#m-x').onclick = () => this.closeModal();
  }

  // ---------- simulation HUD ----------
  simStart(machine, challenge) {
    $('#h-obj').textContent = challenge.objective;
    const drive = machine.parts.some((p) => p.def.motor && (p.cfg.mode === 'drive' || p.cfg.mode === 'gait'));
    const rows = [];
    if (drive) rows.push(`<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>C</kbd> cruise`);
    const groups = new Map();
    for (const p of machine.parts) {
      if (p.def.weapon) { const k = keyName(p.cfg.keyPos); groups.set(k + p.def.name, { k: `<kbd>${k}</kbd>`, n: p.def.name, c: (groups.get(k + p.def.name)?.c || 0) + 1 }); }
      else if (p.def.motor && p.cfg.mode === 'keys') { const k = `${keyName(p.cfg.keyNeg)}/${keyName(p.cfg.keyPos)}`; groups.set(k + p.def.name, { k: `<kbd>${keyName(p.cfg.keyNeg)}</kbd><kbd>${keyName(p.cfg.keyPos)}</kbd>`, n: p.def.name, c: (groups.get(k + p.def.name)?.c || 0) + 1 }); }
    }
    for (const g of groups.values()) rows.push(`${g.k} ${esc(g.n)}${g.c > 1 ? ' ×' + g.c : ''}`);
    rows.push(`<kbd>Drag</kbd> look · <kbd>Wheel</kbd> zoom · <kbd>V</kbd> chase cam`);
    $('#hud-ctl').innerHTML = rows.map((r) => `<div>${r}</div>`).join('');
  }
  simUpdate(machine, challenge, speed, scrap) {
    $('#h-obj').textContent = challenge.objective;
    $('#h-prog').style.width = challenge.progress * 100 + '%';
    $('#h-status').textContent = challenge.status;
    const i = machine.integrity();
    $('#h-int').textContent = Math.round(i * 100) + '%'; $('#h-intb').style.width = i * 100 + '%';
    $('#h-intb').style.background = i < 0.4 ? 'var(--red)' : '';
    $('#h-pow').textContent = machine.alive ? Math.round(machine.power * 100) + '%' : 'OFFLINE'; $('#h-powb').style.width = (machine.alive ? machine.power : 0) * 100 + '%';
    $('#h-spd').textContent = speed.toFixed(1) + ' m/s' + (machine.cruise ? ' · CRUISE' : '');
    $('#h-scrap').textContent = '⛭ ' + scrap;
  }
  result(res, handlers) {
    const r = $('#result'); r.classList.remove('hidden');
    r.innerHTML = `<div class="panel"><h2 class="${res.win ? 'win' : 'lose'}">${esc(res.title)}</h2><div class="lines">${res.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="scrap">+${res.scrap} SCRAP${res.newBest ? ' · NEW BEST!' : ''}</div>
      <div class="row"><button id="r-build" class="big" style="font-size:18px">🔧 Repair &amp; Improve</button><button id="r-retry">↻ ${res.win ? 'Run it again' : 'Retry'}</button>${res.next ? `<button id="r-next">Next: ${esc(res.next.name)} →</button>` : ''}</div></div>`;
    $('#r-build').onclick = handlers.build; $('#r-retry').onclick = handlers.retry;
    if (res.next) $('#r-next').onclick = handlers.next;
  }
  hideResult() { $('#result').classList.add('hidden'); }
  refreshTabs() { this._tabs(); }
}
