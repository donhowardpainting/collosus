// Browser check of result / restart / explosion / modal flows. Usage: node tests/flows.mjs [url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${info}`); if (!ok) failed++; };
const G = (fn, a) => page.evaluate(fn, a);
await page.goto(url); await page.waitForFunction(() => window.__game?.ui, null, { timeout: 60000 });
await page.click('#t-build'); await page.waitForTimeout(400);
check('workshop opens from title', await page.isVisible('#catalog'));
// part config: select a rotor, change mode + rebind key
await G(() => { const b = window.__game.builder; b.select(b.design.parts.find((p) => p.type === 'cannon')); });
await page.click('#c-kp'); await page.keyboard.press('KeyG');
check('fire key rebinds', await G(() => window.__game.builder.design.parts.find((p) => p.type === 'cannon').cfg.keyPos === 'KeyG'));
await G(() => { const b = window.__game.builder; b.select(b.design.parts.find((p) => p.type === 'rotor')); });
await page.selectOption('#c-mode', 'drive');
check('motor mode changes', await G(() => window.__game.builder.design.parts.find((p) => p.type === 'rotor').cfg.mode === 'drive'));
await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
check('undo restores config', await G(() => { const d = window.__game.builder.design; return d.parts.find((p) => p.type === 'rotor').cfg.mode === 'gait' && d.parts.find((p) => p.type === 'cannon').cfg.keyPos === 'Space'; }));
await page.click('#d-io'); const json = await page.inputValue('#m-t'); check('export produces JSON', JSON.parse(json).parts.length > 10);
await page.click('#m-imp'); check('import round-trips', await G(() => window.__game.builder.design.parts.length > 10));
// win flow
await page.click('#b-activate'); await page.waitForTimeout(800);
await G(() => { window.__game.challenge.goal = 0.0; });
await page.waitForSelector('#result .panel', { timeout: 120000 });
check('win result appears with scrap', (await page.textContent('#result .scrap')).includes('SCRAP'), await page.textContent('#result h2'));
await page.click('#r-next'); await page.waitForTimeout(800);
check('"next" starts the Gauntlet', await G(() => window.__game.challengeId === 'gauntlet' && window.__game.mode === 'sim'));
// lose flow: blow up own power cores then the control module
await G(() => { const pl = window.__game.player; pl.parts.filter((p) => p.type === 'power_core').forEach((p) => pl.destroyPart(p)); });
await page.waitForTimeout(1500);
check('core loss cuts power', await G(() => window.__game.player.power === 0));
await G(() => { const pl = window.__game.player; pl.destroyPart(pl.control); });
await page.waitForSelector('#result .panel', { timeout: 120000 });
check('defeat result appears', (await page.textContent('#result h2')).includes('DISABLED'));
await page.click('#r-retry'); await page.waitForTimeout(600);
check('retry restarts intact', await G(() => window.__game.player.alive && window.__game.player.integrity() === 1));
// arena kill credit
await page.keyboard.press('KeyB'); await page.waitForTimeout(300);
await page.click('#ch-tabs button:has-text("Iron Arena")'); await page.click('#b-activate');
await page.waitForFunction(() => window.__game.challenge.enemies.length > 0, null, { timeout: 120000 });
await G(() => { const e = window.__game.challenge.enemies[0].m; e.destroyPart(e.parts.find((p) => p.type === 'power_core')); });
await page.waitForFunction(() => window.__game.challenge.kills > 0, null, { timeout: 120000 });
check('a crippled enemy counts as destroyed and the arena advances', await G(() => window.__game.challenge.wave === 1));
await page.screenshot({ path: 'shots/z-flows.png' });
check('scrap persisted', await G(() => JSON.parse(localStorage.getItem('colossus-construction.v1')).scrap > 0));
check('no runtime errors', errors.length === 0, errors.slice(0, 4).join(' || '));
await browser.close(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
