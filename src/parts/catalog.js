// Part catalog: pure data. No rendering, no physics engine imports.
// Local frame convention: the part's anchor cell is centred on the origin,
// local +Y points "out" of the face the part was attached to.
// Every part is made of 1 or 2 pieces. Two-piece parts are mechanical joints:
// pieces[0] is the base (welds to its neighbours) and pieces[1] is the moving head.

const box = (hx, hy, hz, x = 0, y = 0, z = 0) => ({ shape: 'box', half: [hx, hy, hz], pos: [x, y, z] });
const cyl = (hh, r, x = 0, y = 0, z = 0, rot = null) => ({ shape: 'cyl', hh, r, pos: [x, y, z], rot });

const single = (mass, colliders, extra = {}) => [{ key: 'base', mass, colliders, ...extra }];

// Face rules: which piece owns a given (local direction) face. -1 = not weldable.
const FACE_ALL = () => 0;
const FACE_JOINT = (cell, d) => (d[1] === 1 ? 1 : 0); // +Y face belongs to the moving head
const FACE_WHEEL = (cell, d) => (d[1] === -1 ? 0 : -1); // only the axle side welds

const line = (n) => Array.from({ length: n }, (_, i) => [0, i, 0]);
const slab = () => {
  const c = [];
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) c.push([x, 0, z]);
  return c;
};

export const CATEGORIES = [
  { id: 'structure', name: 'Structure' },
  { id: 'mechanical', name: 'Mechanical' },
  { id: 'power', name: 'Power & Control' },
  { id: 'combat', name: 'Combat' },
];

export const PARTS = {
  // ---------- structural ----------
  wood_block: {
    name: 'Timber Block', cat: 'structure', hp: 45, mat: 'wood',
    desc: 'Light and cheap. Splinters under heavy impacts.',
    cells: [[0, 0, 0]], pieces: single(2, [box(0.49, 0.49, 0.49)]),
  },
  wood_beam: {
    name: 'Timber Beam', cat: 'structure', hp: 70, mat: 'wood',
    desc: 'Three cells long. Good for legs, arms and booms.',
    cells: line(3), pieces: single(5, [box(0.45, 1.49, 0.45, 0, 1, 0)]),
  },
  steel_block: {
    name: 'Steel Block', cat: 'structure', hp: 130, mat: 'steel',
    desc: 'Heavy, tough structural cube.',
    cells: [[0, 0, 0]], pieces: single(6, [box(0.49, 0.49, 0.49)]),
  },
  steel_beam: {
    name: 'Steel Girder', cat: 'structure', hp: 190, mat: 'steel',
    desc: 'Three-cell I-beam. The backbone of serious machines.',
    cells: line(3), pieces: single(13, [box(0.45, 1.49, 0.45, 0, 1, 0)]),
  },
  frame: {
    name: 'Lattice Frame', cat: 'structure', hp: 40, mat: 'steel',
    desc: 'Almost weightless truss cube. Great for bulk, weak in a fight.',
    cells: [[0, 0, 0]], pieces: single(1.2, [box(0.49, 0.49, 0.49)]),
  },
  brace: {
    name: 'Cross Brace', cat: 'structure', hp: 110, mat: 'steel',
    desc: 'Light diagonal bracing that soaks up impacts.',
    cells: [[0, 0, 0]], pieces: single(2.2, [box(0.49, 0.49, 0.49)]),
  },
  platform: {
    name: 'Deck Platform', cat: 'structure', hp: 140, mat: 'wood',
    desc: '3×3 timber deck on steel ribs. Instant chassis.',
    cells: slab(), pieces: single(14, [box(1.49, 0.49, 1.49)]),
  },
  // ---------- mechanical ----------
  wheel: {
    name: 'Drive Wheel', cat: 'mechanical', hp: 90, mat: 'rubber',
    desc: 'Powered wheel. Axle follows the face you attach it to.',
    cells: [[0, 0, 0]], face: FACE_WHEEL,
    pieces: [
      { key: 'base', mass: 1, colliders: [box(0.15, 0.2, 0.15, 0, -0.3, 0)] },
      { key: 'head', mass: 6, friction: 1.7, colliders: [cyl(0.32, 1.0, 0, 0.05, 0)] },
    ],
    joint: { type: 'revolute', axis: [0, 1, 0], anchor: [0, 0, 0] },
    motor: { kind: 'spin', maxSpeed: 9, torque: 170, demand: 10, radius: 1.0 },
    cfg: { mode: 'drive', speed: 1, reverse: false, keyPos: 'KeyE', keyNeg: 'KeyQ' },
    modes: ['drive', 'auto', 'keys', 'free'],
  },
  big_wheel: {
    name: 'Titan Wheel', cat: 'mechanical', hp: 180, mat: 'rubber',
    desc: 'Huge high-torque wheel for heavy fortresses.',
    cells: [[0, 0, 0]], face: FACE_WHEEL,
    pieces: [
      { key: 'base', mass: 2, colliders: [box(0.2, 0.2, 0.2, 0, -0.3, 0)] },
      { key: 'head', mass: 14, friction: 1.7, colliders: [cyl(0.42, 1.7, 0, 0.1, 0)] },
    ],
    joint: { type: 'revolute', axis: [0, 1, 0], anchor: [0, 0, 0] },
    motor: { kind: 'spin', maxSpeed: 6, torque: 520, demand: 22, radius: 1.7 },
    cfg: { mode: 'drive', speed: 1, reverse: false, keyPos: 'KeyE', keyNeg: 'KeyQ' },
    modes: ['drive', 'auto', 'keys', 'free'],
  },
  rotor: {
    name: 'Rotor Motor', cat: 'mechanical', hp: 120, mat: 'steel',
    desc: 'Powered rotary joint. Whatever sits on its output face spins. Build legs, turrets, flails.',
    cells: [[0, 0, 0]], face: FACE_JOINT,
    pieces: [
      { key: 'base', mass: 4, colliders: [box(0.49, 0.32, 0.49, 0, -0.17, 0)] },
      { key: 'head', mass: 2, colliders: [cyl(0.16, 0.44, 0, 0.33, 0)] },
    ],
    joint: { type: 'revolute', axis: [0, 1, 0], anchor: [0, 0.16, 0] },
    motor: { kind: 'spin', maxSpeed: 6, torque: 1600, demand: 20, radius: 2.5 },
    cfg: { mode: 'drive', speed: 0.6, reverse: false, keyPos: 'KeyE', keyNeg: 'KeyQ', phase: 0, amp: 0.55 },
    modes: ['drive', 'gait', 'auto', 'keys'],
  },
  hinge: {
    name: 'Free Hinge', cat: 'mechanical', hp: 100, mat: 'steel',
    desc: 'Unpowered pivot. Swings freely about its pin — trailers, flails, linkages.',
    cells: [[0, 0, 0]], face: FACE_JOINT,
    pieces: [
      { key: 'base', mass: 2, colliders: [box(0.49, 0.24, 0.49, 0, -0.25, 0)] },
      { key: 'head', mass: 2, colliders: [box(0.4, 0.2, 0.4, 0, 0.29, 0)] },
    ],
    joint: { type: 'revolute', axis: [1, 0, 0], anchor: [0, 0, 0], limits: [-1.75, 1.75] },
  },
  servo: {
    name: 'Servo Hinge', cat: 'mechanical', hp: 110, mat: 'steel',
    desc: 'Powered hinge that holds an angle. Key-driven arms or rhythmic gait legs.',
    cells: [[0, 0, 0]], face: FACE_JOINT,
    pieces: [
      { key: 'base', mass: 3, colliders: [box(0.49, 0.24, 0.49, 0, -0.25, 0)] },
      { key: 'head', mass: 2, colliders: [box(0.4, 0.2, 0.4, 0, 0.29, 0)] },
    ],
    joint: { type: 'revolute', axis: [1, 0, 0], anchor: [0, 0, 0], limits: [-1.3, 1.3] },
    motor: { kind: 'angle', stiffness: 9000, damping: 900, torque: 2600, demand: 12, range: 1.3, rate: 1.6 },
    cfg: { mode: 'keys', speed: 0.6, reverse: false, keyPos: 'KeyE', keyNeg: 'KeyQ', phase: 0, amp: 0.6 },
    modes: ['keys', 'gait', 'auto'],
  },
  piston: {
    name: 'Piston', cat: 'mechanical', hp: 110, mat: 'steel',
    desc: 'Linear actuator with a two-cell stroke. Punch, lift, jump.',
    cells: [[0, 0, 0]], face: FACE_JOINT,
    pieces: [
      { key: 'base', mass: 4, colliders: [box(0.4, 0.4, 0.4, 0, -0.09, 0)] },
      { key: 'head', mass: 2, colliders: [box(0.42, 0.08, 0.42, 0, 0.41, 0)] },
    ],
    joint: { type: 'prismatic', axis: [0, 1, 0], anchor: [0, 0, 0], limits: [0, 2] },
    motor: { kind: 'extend', stiffness: 5000, damping: 500, force: 4200, demand: 12, range: 2 },
    cfg: { mode: 'keys', speed: 0.6, reverse: false, keyPos: 'KeyE', keyNeg: 'KeyQ', phase: 0, amp: 1 },
    modes: ['keys', 'gait', 'auto'],
  },
  spring: {
    name: 'Suspension Spring', cat: 'mechanical', hp: 90, mat: 'steel',
    desc: 'Passive spring-damper. Softens landings and keeps wheels planted.',
    cells: [[0, 0, 0]], face: FACE_JOINT,
    pieces: [
      { key: 'base', mass: 2, colliders: [box(0.4, 0.1, 0.4, 0, -0.39, 0)] },
      { key: 'head', mass: 2, colliders: [box(0.4, 0.1, 0.4, 0, 0.39, 0)] },
    ],
    joint: { type: 'prismatic', axis: [0, 1, 0], anchor: [0, 0, 0], limits: [-0.45, 0.6] },
    spring: { stiffness: 1500, damping: 160 },
    cfg: { speed: 0.5 }, // speed slider doubles as stiffness
  },
  // ---------- power & control ----------
  power_core: {
    name: 'Power Core', cat: 'power', hp: 160, mat: 'steel',
    desc: 'Feeds every motor. Lose it and the machine dies. It also explodes.',
    cells: [[0, 0, 0]], pieces: single(12, [box(0.49, 0.49, 0.49)]),
    supply: 100, explosive: true,
  },
  control: {
    name: 'Control Module', cat: 'power', hp: 150, mat: 'steel',
    desc: 'The pilot cabin. Its arrow defines FORWARD. One per machine.',
    cells: [[0, 0, 0]], pieces: single(5, [box(0.49, 0.49, 0.49)]),
    control: true, unique: true,
  },
  // ---------- combat ----------
  cannon: {
    name: 'Cannon', cat: 'combat', hp: 120, mat: 'steel',
    desc: 'Fires heavy shot along its barrel. Mind the recoil.',
    cells: [[0, 0, 0]], pieces: single(9, [box(0.45, 0.49, 0.45), cyl(0.5, 0.22, 0, 0.9, 0)]),
    weapon: { kind: 'cannon', cooldown: 1.1, speed: 55, damage: 75, recoil: 90 },
    cfg: { keyPos: 'Space' },
  },
  launcher: {
    name: 'Bomb Launcher', cat: 'combat', hp: 110, mat: 'steel',
    desc: 'Lobs explosive charges in a high arc. Area damage.',
    cells: [[0, 0, 0]], pieces: single(11, [box(0.49, 0.49, 0.49)]),
    weapon: { kind: 'bomb', cooldown: 2.6, speed: 24, damage: 110, recoil: 60, radius: 4.5 },
    cfg: { keyPos: 'KeyF' },
  },
  spike: {
    name: 'Ram Spike', cat: 'combat', hp: 260, mat: 'steel',
    desc: 'Hardened ram. Multiplies impact damage dealt, shrugs off its own.',
    cells: [[0, 0, 0]], pieces: single(5, [box(0.4, 0.49, 0.4), cyl(0.45, 0.2, 0, 0.9, 0)]),
    impact: { deal: 4, take: 0.15 },
  },
  maul: {
    name: 'Wrecking Maul', cat: 'combat', hp: 420, mat: 'steel',
    desc: 'A brutal lump of iron. Swing it on a rotor or hinge.',
    cells: [[0, 0, 0]], pieces: single(22, [box(0.62, 0.62, 0.62)]),
    impact: { deal: 5, take: 0.1 },
  },
  armor_block: {
    name: 'Armor Block', cat: 'combat', hp: 420, mat: 'armor',
    desc: 'Dense plated cube. Wrap your core and cabin in it.',
    cells: [[0, 0, 0]], pieces: single(11, [box(0.49, 0.49, 0.49)]),
    impact: { deal: 1, take: 0.5 },
  },
  armor_plate: {
    name: 'Armor Panel', cat: 'combat', hp: 600, mat: 'armor',
    desc: '3×3 bolted armor panel. Heavy, nearly indestructible.',
    cells: slab(), pieces: single(26, [box(1.49, 0.24, 1.49, 0, -0.25, 0)]),
    impact: { deal: 1, take: 0.5 },
  },
};

for (const [id, def] of Object.entries(PARTS)) {
  def.id = id;
  def.face = def.face || FACE_ALL;
  def.cfg = def.cfg || {};
  def.mass = def.pieces.reduce((s, p) => s + p.mass, 0);
}

export const MODE_LABELS = {
  drive: 'Drive (W/S/A/D)', auto: 'Always on', keys: 'Custom keys', free: 'Free-rolling', gait: 'Walking gait (W/S/A/D)',
};
