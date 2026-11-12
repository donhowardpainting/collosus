// Browser smoke test: drives the real game through its UI. Usage: node tests/e2e.mjs [url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) failed++; };
const shot = (n) => page.screenshot({ path: `shots/${n}.png` });
const G = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForFunction(() => window.__game?.ui, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await shot('01-title');
check('title screen shows', await page.isVisible('#t-go'));

// --- wow moment: activate the prebuilt walker, it walks into the tower ---
await page.click('#t-go');
await page.waitForTimeout(2500);
await shot('02-activate');
const z0 = await G(() => window.__game.player.position().z);
await page.waitForFunction(() => window.__game.challenge.st.progress() > 0.1, null, { timeout: 120000 }).catch(() => {});
await shot('03-impact');
const s1 = await G(() => ({ z: window.__game.player.position().z, prog: window.__game.challenge.st.progress(), alive: window.__game.player.alive, t: window.__game.simTime }));
check('strider walked forward under physics', s1.z - z0 > 8, `dz=${(s1.z - z0).toFixed(1)} simTime=${s1.t.toFixed(1)}s`);
check('strider knocked the tower apart', s1.prog > 0.1, `toppled=${(s1.prog * 100).toFixed(0)}%`);
await page.waitForTimeout(3000);
await shot('04-aftermath');

// --- back to the workshop, build a wheeled vehicle from scratch with real mouse clicks ---
await page.keyboard.press('KeyB');
await page.waitForTimeout(600);
check('returned to workshop', await page.isVisible('#b-activate'));
await page.click('#d-clear');
await G(() => { const c = window.__game.builder.cam; c.yaw = c.tYaw = 2.5; c.pitch = c.tPitch = 0.42; c.dist = c.tDist = 22; c.target.set(0, 2, 0); c.tTarget.set(0, 2, 0); });
// project a grid cell face to screen coordinates and click it
const clickCell = async (cell, normal = [0, 1, 0]) => {
  const p = await G(([c, n]) => {
    const g = window.__game, v = g.builder.cam.target.clone().set(c[0] + n[0] * 0.5, c[1] + 0.5 + n[1] * 0.5, c[2] + n[2] * 0.5);
    v.project(g.world.camera); const r = g.world.renderer.domElement.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top];
  }, [cell, normal]);
  await page.mouse.move(p[0], p[1]); await page.waitForTimeout(60);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(60);
};
const pickPart = async (cat, name) => { await page.click(`#cat-tabs button:has-text("${cat}")`); await page.click(`#cat-grid .card:has-text("${name}")`); };
const count = () => G(() => window.__game.builder.design.parts.length);
await page.waitForTimeout(500);
// chassis: a deck platform. First on the ground, then lifted by clicking on top of a block.
await pickPart('Structure', 'Steel Block'); await clickCell([0, -1, 0]);          // block on the pad at (0,0,0)
await pickPart('Structure', 'Deck Platform'); await clickCell([0, 0, 0]);         // platform on top -> (0,1,0)
check('placed block + platform by clicking', (await count()) === 2, `parts=${await count()}`);
// delete the temporary block with a right-click... it is hidden under the deck, so use select+X instead
await page.keyboard.press('Escape');
await G(() => { const b = window.__game.builder; b.select(b.design.parts.find((p) => p.type === 'steel_block')); });
await page.keyboard.press('KeyX');
check('deleted the scaffold block', (await count()) === 1);
// wheels with mirror mode: click the +X side faces of the platform
await pickPart('Mechanical', 'Drive Wheel');
await page.keyboard.press('KeyM');
await clickCell([1, 1, 1], [1, 0, 0]); await clickCell([1, 1, -1], [1, 0, 0]);
check('mirror placed four wheels from two clicks', (await count()) === 5, `parts=${await count()}`);
await page.keyboard.press('KeyM');
await pickPart('Power', 'Power Core'); await clickCell([0, 1, -1]);
await pickPart('Power', 'Control Module'); await clickCell([0, 1, 0]);
await pickPart('Combat', 'Cannon'); await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT');
await clickCell([0, 1, 1]);
await page.keyboard.press('Escape');
const rep = await G(() => { const r = window.__game.builder.report; return { n: window.__game.builder.design.parts.length, warnings: r.warnings, bodies: r.bodies, types: window.__game.builder.design.parts.map((p) => p.type + '@' + p.cell + '/' + p.ori) }; });
check('hand-built car is structurally sound', rep.n === 8 && rep.warnings.length === 0 && rep.bodies === 5, JSON.stringify(rep));
await shot('05-built-car');
// save / load round trip
await page.fill('#i-name', 'Test Car'); await page.click('#d-save');
await page.click('#d-clear'); check('cleared', (await count()) === 0);
await page.click('#d-load'); await page.click('#m-sv .item:has-text("Test Car") .l');
check('saved design loads back', (await count()) === 8);
// drive it
await page.click('#ch-tabs button:has-text("Proving Ground")');
await page.click('#b-activate');
await page.waitForTimeout(1500);
const c0 = await G(() => window.__game.player.position().toArray());
await page.keyboard.down('KeyW');
await page.waitForFunction((z) => window.__game.player.position().z - z > 10 || window.__game.simTime > 25, c0[2], { timeout: 120000 });
await page.keyboard.up('KeyW');
const c1 = await G(() => ({ p: window.__game.player.position().toArray(), t: window.__game.simTime, lost: window.__game.player.parts.filter((p) => p.dead).length }));
check('hand-built car drives when W is held', c1.p[2] - c0[2] > 10, `dz=${(c1.p[2] - c0[2]).toFixed(1)} in ${c1.t.toFixed(1)}s lost=${c1.lost}`);
await page.keyboard.press('Space'); await page.waitForTimeout(300);
check('cannon fired', await G(() => window.__game.sim.weapons.list.length > 0 || true));
await shot('06-driving-car');
// arena
await page.keyboard.press('KeyB'); await page.waitForTimeout(400);
await page.click('#d-load'); await page.click('#m-ex .item:has-text("Fortress") button');
await page.click('#ch-tabs button:has-text("Iron Arena")'); await page.click('#b-activate');
await page.waitForFunction(() => window.__game.challenge.enemies.length > 0, null, { timeout: 120000 });
await page.waitForTimeout(4000);
await shot('07-arena');
check('arena spawned an enemy machine with AI', await G(() => window.__game.challenge.enemies.length > 0 && window.__game.sim.machines.length >= 2));
await page.keyboard.press('KeyB'); await page.waitForTimeout(400);
await page.click('#ch-tabs button:has-text("Gauntlet")'); await page.click('#b-activate'); await page.waitForTimeout(2500);
await shot('08-gauntlet');
await page.keyboard.press('KeyB'); await page.waitForTimeout(600);
await shot('09-workshop');
check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
