# COLOSSUS CONSTRUCTION

**Build. Activate. Conquer.**

A 3D browser game about designing, building, driving and fighting with enormous
mechanical machines. Nothing is a predefined vehicle: every machine is a set of
parts snapped together on a grid, turned into rigid bodies and joints, and then
left to the physics engine. If it walks, it walks because its legs push on the
ground. If it falls on its face, that is your engineering.

Three.js for rendering, Rapier (WASM) for rigid bodies and joints, Vite for the
build. No backend, no external APIs, no downloaded art or audio — textures and
sound are generated at runtime.

## Play

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL in a desktop browser. On the title screen press
**Activate the Strider**: a six-legged walker powers up, the camera pulls back,
and it marches into a timber tower under its own physics. Then open the
workshop and build your own.

### The loop

`BUILD → ACTIVATE → TEST → FIGHT → REPAIR → IMPROVE`

| Challenge | Goal |
| --- | --- |
| Demolition Yard | Topple 75% of the towers and walls. Faster pays more scrap. |
| The Gauntlet | Timed obstacle course: speed humps, ramps, slalom, a barricade to smash. |
| Iron Arena | Six waves of AI machines ending with the Juggernaut. Lose, repair, resume the wave. |
| Proving Ground | No rules. Ramps, crates and an unmanned target. |

### Workshop controls

| Input | Action |
| --- | --- |
| Click a catalog card | Pick a part |
| Click the pad / a part face | Snap the part onto that face |
| `R` / `T` | Spin about the face / tilt to another axis (works on the ghost or the selected part) |
| `M` | Mirror mode: every placement is duplicated across the centre line, motors mirrored |
| Click a part | Select it and configure it (control mode, speed, direction, keys, gait phase) |
| `C` | Duplicate: pick up the hovered part with its orientation and settings |
| `G` | Move the selected part |
| Right-click, `X`, `Delete` | Delete |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| Drag, `Shift`+drag, wheel | Orbit, pan, zoom |
| `1` `2` `3` | Orbit, overhead, close-up views |
| `Enter` | ACTIVATE |

The inspector shows mass, power supply versus draw, the number of independently
moving assemblies, the centre of mass (pink marker) and engineering warnings:
jammed joints (both sides welded to the same structure), parts that are not
connected to the control module, missing power.

Designs autosave, can be saved to named slots, and can be exported / imported
as JSON text.

### Driving controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Drive and steer everything set to *Drive* or *Walking gait* |
| `C` | Cruise control |
| `Space`, `F` | Default cannon / bomb launcher keys (rebindable per part) |
| `Q` `E` | Default keys for motors set to *Custom keys* (rebindable per part) |
| Drag, wheel, `V` | Look around, zoom, toggle chase camera |
| `R` | Restart the challenge |
| `B` / `Esc` | Back to the workshop (repair & improve) |

## Parts

**Structure** — timber block and beam, steel block and girder, lattice frame,
cross brace, 3×3 deck platform.
**Mechanical** — drive wheel, titan wheel, rotor motor, free hinge, servo
hinge, piston, suspension spring.
**Power & control** — power core (feeds every motor; explodes), control module
(defines *forward*; lose it and the machine is dead).
**Combat** — cannon, bomb launcher, ram spike, wrecking maul, armor block,
armor panel.

Things worth knowing:

- A joint part has a base and a moving head. Whatever touches the head's face
  moves with it; everything else welds to the base.
- Rotors in *Walking gait* mode share a machine-wide clock: a slow planted
  sweep, then a fast swing over the top. Give alternate legs phase 0 and 180
  and you get a tripod or trot. The legs still have to hold the machine up and
  find traction — the gait only sets target angles.
- Motors are torque-limited. Draw more than your cores supply and everything
  gets weaker.
- Drive direction and left/right steering are derived from where each motor
  sits relative to the control module, so a wheel works wherever you bolt it.
- Impact damage comes from how violently a contact changes velocity. Rolling
  and standing are free; crashes, falls and rams are not. Spikes and mauls
  multiply the blow they deliver. Joints that get wrenched apart snap.
- Destroying a part splits the rigid body it belonged to. Sections no longer
  connected to the control module fall away as wreckage.

## Architecture

Each system is its own module and only depends downward.

```
src/
  parts/catalog.js     part data: cells, masses, colliders, joints, motors, weapons
  parts/visuals.js     procedural materials + merged meshes per part (browser only)
  core/design.js       design model: grid cells, 24 orientations, mirror, serialise
  core/graph.js        machine graph: pieces, weld edges, joint edges, components, analysis
  build/builder.js     workshop: snapping, ghost, mirror, pick/move/delete, undo, cameras
  physics/world.js     Rapier wrapper: world, collision groups, contact events
  sim/machine.js       runtime machine: bodies + joints from the graph, splitting, wreckage
  sim/controls.js      inputs -> motor targets (drive, gait clock, servos, pistons, weapons)
  sim/damage.js        impact damage, explosions
  sim/weapons.js       projectiles with recoil
  sim/structure.js     destructible towers and walls
  sim/sim.js           fixed-step simulation container
  ai/ai.js             AI pilots (produce the same inputs a human does)
  game/examples.js     example and enemy machines, built through Design.add()
  game/challenges.js   arenas, objectives, scoring
  render/scene.js      renderer, sky, terrain, scenery, lighting, bloom
  render/fx.js         particles, splinters, flashes, camera shake
  audio/audio.js       synthesised sound
  ui/ui.js             DOM interface
  storage.js           localStorage saves
  main.js              state machine: title -> workshop <-> simulation
```

The simulation core (`core`, `physics`, `sim`, `ai`, `game`) has no DOM or
WebGL dependency, which is why it can be tested headlessly in Node.

## Tests

```bash
npm test
```

Headless mechanical checks on the real simulation: a wheeled car assembled part
by part drives, reverses, skid-steers, holds still, and does nothing without a
power core; a four-legged walker assembled part by part walks; the example
Strider walks, turns and demolishes a tower that otherwise stands on its own;
destroyed parts split bodies and disable the machine; falls cause damage while
normal driving does not; servo, hinge, spring, rotor turret and jam detection
behave.

```bash
npm run test:gameplay
```

Bots play the Gauntlet, Iron Arena and Demolition Yard on the real simulation
and print the outcome. This is a balance probe rather than a pass/fail suite:
the bots steer naively and do get wedged against slalom pillars.

```bash
npm run build && npm run preview
```

```bash
npm run test:e2e
```

Drives the built game in headless Chromium through the actual UI: activates the
Strider and waits for the tower to come down, then builds a car with real mouse
clicks (including mirror mode), saves and reloads it, drives it, fires its
cannon and enters the arena. Needs Playwright; set `PLAYWRIGHT_PATH` to its
entry file if it is installed globally.

## Deploying to Vercel

The game is a static site. `vercel.json` already declares the framework, build
command and output directory.

**From the dashboard:** import the GitHub repository at vercel.com/new and
accept the detected settings (Framework *Vite*, build `npm run build`, output
`dist`). Every push deploys.

**From the CLI:**

```bash
npx vercel login
```

```bash
npx vercel --prod
```

Any other static host works too: run `npm run build` and serve `dist/`.

## Performance notes

- Physics runs at a fixed 60 Hz, at most four catch-up steps per frame.
- Welded parts are merged into single compound rigid bodies, so a 40-part
  machine is usually 5–10 bodies. Parts of one machine do not collide with
  each other until they break off.
- Geometry is merged per part and per material; scenery is a handful of
  merged meshes.
- The inspector has a *Graphics* toggle: `low` drops bloom, pixel ratio and
  shadow resolution.
- The Rapier WASM chunk is about 1.7 MB gzipped and loads separately from the
  190 KB application shell.

## License

MIT
