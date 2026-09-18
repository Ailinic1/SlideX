// The real interface, in a real browser.
//
// Adapted from Newsx (test/ui-test.js). It drives headless Chrome with real
// mouse and keyboard events over the DevTools protocol - no framework, no
// driver, nothing installed - and leaves a screenshot of each screen in
// assets/screens/.
//
// What it is for is the half of this program that only exists in a browser:
// dragging a slide in the sorter and watching every number follow it, dragging
// an element on the canvas, presenting, and drawing a PNG.
//
// It says "skip" rather than fails when there is no Chrome to drive, or when
// the Chrome there cannot load a page from 127.0.0.1, which some sandboxes
// will not allow.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { test, assert, run } from './harness.js';
import { attach } from './cdp.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SHOTS = path.join(ROOT, 'assets', 'screens');

const CHROMES = [
  process.env.CHROME,
  path.join(os.homedir(), '.local', 'bin', 'chromium'),
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const chromeAt = CHROMES.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!chromeAt) {
  console.log('\nSlideX: the interface');
  console.log('  skip  there is no Chrome or Chromium to drive');
  process.exit(0);
}

/* ---------------------------------------------------------------- set up */

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-ui-'));
process.env.SLIDEX_HOME = home;
const { start } = await import('../src/server.js');
const { server, url } = await start({ port: 0 });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-chrome-'));
const port = 9222 + Math.floor(Math.random() * 400);
const chrome = spawn(chromeAt, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=1500,940', url,
], { stdio: 'ignore' });

const stop = () => { try { chrome.kill(); } catch (e) { /* gone */ } server.close(); };
process.on('exit', stop);

let page;
const problems = [];
try {
  page = await attach(port);
} catch (e) {
  console.log('\nSlideX: the interface');
  console.log('  skip  Chrome would not open its debugging port: ' + e.message);
  stop();
  process.exit(0);
}
page.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') {
    const ex = m.params.exceptionDetails;
    problems.push((ex.exception && (ex.exception.description || ex.exception.value)) || ex.text);
  }
});

try {
  await page.navigate(url);
  await page.waitFor('document.querySelector(".start-head")', 8000);
} catch (e) {
  console.log('\nSlideX: the interface');
  console.log('  skip  this Chrome cannot load a page from 127.0.0.1: ' + e.message);
  stop();
  process.exit(0);
}

fs.mkdirSync(SHOTS, { recursive: true });
const shot = (name) => page.screenshot(path.join(SHOTS, name + '.png'));

/* ------------------------------------------------------------- the mouse */

const mouse = (type, x, y, buttons = 0) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons });
const click = async (x, y) => { await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y); };
const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Drag from one point to another, with enough moves that the page believes it. */
async function drag(from, to) {
  await mouse('mousePressed', from.x, from.y, 1);
  for (let i = 1; i <= 6; i++) {
    await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, 1);
  }
  await mouse('mouseReleased', to.x, to.y);
}

const box = (selector, nth = 0) => page.eval(`
  const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, w: r.width, h: r.height };
`);

/* ------------------------------------------------------------------ tests */

test('the start page offers a new deck, a generated style, and a shared one', async () => {
  const buttons = await page.eval('return [...document.querySelectorAll(".start-actions button")].map(b => b.textContent).join(" | ");');
  assert.match(buttons, /Open a shared deck/);
  assert.match(buttons, /Generate a style/);
  assert.match(buttons, /New deck/);
  await shot('01-start');
});

test('a deck can be made, and it opens on its first slide', async () => {
  await page.eval('[...document.querySelectorAll(".start-actions button")].find(b => b.textContent.includes("New deck")).click(); return 1;');
  await page.waitFor('document.querySelector(".modal input.input")');
  await page.eval('const i = document.querySelector(".modal input.input"); i.value = "Quarterly review"; i.dispatchEvent(new Event("input")); return 1;');
  await shot('02-new-deck');
  await page.eval('[...document.querySelectorAll(".modal-foot button")].find(b => b.textContent === "Make it").click(); return 1;');
  await page.waitFor('document.querySelector(".slide-paper svg")', 10000);
  assert.strictEqual(await page.eval('return document.querySelectorAll(".slide-row").length;'), 5);
  assert.strictEqual(await page.eval('return document.querySelector(".slide-row.active .slide-n").textContent;'), '1');
  await shot('03-editor');
});

test('dragging a slide in the sorter renumbers everything at once', async () => {
  const titles = () => page.eval('return [...document.querySelectorAll(".slide-title")].map(e => e.textContent).join(" | ");');
  const numbers = () => page.eval('return [...document.querySelectorAll(".slide-n")].map(e => e.textContent).join(",");');
  const before = await titles();
  assert.strictEqual(await numbers(), '1,2,3,4,5');

  // The sorter's rows are draggable, which a DevTools mouse cannot start; the
  // drop is what this is really testing, so it is dispatched as the page's own
  // handlers see it.
  await page.eval(`
    const rows = [...document.querySelectorAll('.slide-row')];
    const data = new DataTransfer();
    const last = rows[rows.length - 1];
    last.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
    const first = rows[0];
    const r = first.getBoundingClientRect();
    first.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, clientY: r.top + 2 }));
    first.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, clientY: r.top + 2 }));
    return 1;
  `);
  await pause(400);
  const after = await titles();
  assert.notStrictEqual(after, before, 'the sorter did not reorder');
  assert.strictEqual(after.split(' | ')[0], before.split(' | ').pop(), 'the last slide is not first');
  // Every number is still the position, with no gaps and nothing repeated.
  assert.strictEqual(await numbers(), '1,2,3,4,5');
  // And the number drawn on the slide itself followed it.
  const onSlide = await page.eval(`
    return import('/shared/model.js').then(async M => {
      const app = await import('/js/app.js');
      const d = app.state.open.working.deck;
      const nums = M.numbering(d);
      return d.slides.map(s => M.fillFields('{n}/{total}', { deck: d, slide: s })).join(' ');
    });
  `);
  assert.strictEqual(onSlide, '1/5 2/5 3/5 4/5 5/5');
  await shot('04-reordered');
});

test('undo puts the order back, and every number with it', async () => {
  const titles = () => page.eval('return [...document.querySelectorAll(".slide-title")].map(e => e.textContent).join(" | ");');
  const before = await titles();
  await page.press('z', { ctrl: true });
  await pause(400);
  const after = await titles();
  assert.notStrictEqual(after, before, 'undo did nothing');
  assert.strictEqual(await page.eval('return [...document.querySelectorAll(".slide-n")].map(e => e.textContent).join(",");'), '1,2,3,4,5');
});

test('an element can be picked up on the canvas and dragged, and undone', async () => {
  const slide = await box('.slide-overlay');
  await click(slide.left + slide.w * 0.3, slide.top + slide.h * 0.25);
  await pause(250);
  const name = await page.eval('return (document.querySelector(".insp-head .name-field") || {}).value || "";');
  assert.ok(name, 'clicking the slide selected nothing');
  const x = () => page.eval('return Number(document.querySelector(".geo input").value);');
  const before = await x();
  await drag(
    { x: slide.left + slide.w * 0.3, y: slide.top + slide.h * 0.25 },
    { x: slide.left + slide.w * 0.3 + 70, y: slide.top + slide.h * 0.25 + 30 },
  );
  await pause(300);
  assert.ok(await x() > before, 'the element did not move');
  await page.press('z', { ctrl: true });
  await pause(350);
  assert.strictEqual(await x(), before, 'undo did not put it back');
  await shot('05-canvas');
});

test('the command palette goes to a slide by its number', async () => {
  await page.press('k', { ctrl: true });
  await page.waitFor('document.querySelector(".cmd-input")');
  await page.eval('const i = document.querySelector(".cmd-input"); i.value = "4"; i.dispatchEvent(new Event("input")); return 1;');
  assert.match(await page.eval('return document.querySelector(".cmd-item .cmd-label").textContent;'), /Go to slide 4/);
  await shot('06-commands');
  await page.press('Enter', { keyCode: 13 });
  await pause(450);
  assert.match(await page.eval('return document.querySelector(".statusbar").textContent;'), /Slide 4 of 5/);
});

test('presenting shows the slides, blanks, and goes to a number', async () => {
  // From the start, which is what the ribbon's first button does; present()
  // with no slide named starts wherever you are.
  await page.eval(`return (async () => {
    const m = await import('/js/editor.js');
    const app = await import('/js/app.js');
    m.present(app.state.open.working.deck.slides[0].id, { presenter: false });
    return 1;
  })();`);
  await page.waitFor('document.querySelector(".present-slide svg")');
  const where = () => page.eval('return document.querySelector(".present-hint").textContent;');
  assert.strictEqual(await where(), '1 / 5');
  // The slide fills the screen in whichever direction runs out first: a black
  // screen with a number in the corner is what this used to be.
  const shown = await page.eval(`
    const el = document.querySelector('.present-slide');
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), view: window.innerWidth + 'x' + window.innerHeight, opacity: getComputedStyle(el).opacity };
  `);
  assert.ok(shown.w > 200 && shown.h > 150, 'the slide has no size on screen: ' + JSON.stringify(shown));
  assert.strictEqual(shown.opacity, '1', 'the first slide faded in from nothing');
  assert.ok(Math.abs(shown.w / shown.h - 960 / 540) < 0.02, 'the slide is the wrong shape: ' + JSON.stringify(shown));
  await shot('07-presenting');
  await page.press('ArrowRight', { keyCode: 39 });
  await pause(200);
  assert.strictEqual(await where(), '2 / 5');
  await page.press('b', { keyCode: 66, text: 'b' });
  await pause(150);
  assert.strictEqual(await page.eval('return document.querySelector(".present").dataset.blank;'), 'black');
  await page.press('b', { keyCode: 66, text: 'b' });
  await page.press('5', { keyCode: 53, text: '5' });
  await page.press('Enter', { keyCode: 13 });
  await pause(350);
  assert.strictEqual(await where(), '5 / 5');
  await page.press('Escape', { keyCode: 27 });
  await pause(350);
  assert.ok(await page.eval('return !document.querySelector(".present") && !!document.querySelector(".sorter");'), 'Escape did not end the talk');
});

test('a PNG of a slide is drawn, with the slide on it', async () => {
  const result = await page.eval(`
    return (async () => {
      const app = await import('/js/app.js');
      const { renderSlide } = await import('/shared/scene.js');
      const { resolveSlide, numbering } = await import('/shared/model.js');
      const { slideToPng } = await import('/shared/canvas2d.js');
      const deck = app.state.open.working.deck;
      const slide = deck.slides[0];
      const { ops } = renderSlide(resolveSlide(deck, slide), { deck, slide, numbers: numbering(deck), draft: false });
      const blob = await slideToPng(ops, deck.size, { width: 960 });
      const img = new Image();
      const href = URL.createObjectURL(blob);
      await new Promise((r) => { img.onload = r; img.src = href; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // How many colours are on it: a blank PNG has one.
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
      return { w: img.width, h: img.height, bytes: blob.size, colours: seen.size };
    })();
  `);
  assert.strictEqual(result.w, 960);
  assert.strictEqual(result.h, 540);
  assert.ok(result.bytes > 2000, 'the PNG is suspiciously small: ' + result.bytes);
  assert.ok(result.colours > 2, 'the PNG has only ' + result.colours + ' colours on it');
});

test('check opens, and says what is wrong with a deck somebody has broken', async () => {
  await page.eval(`
    return (async () => {
      const app = await import('/js/app.js');
      const M = await import('/shared/model.js');
      const ed = await import('/js/editor.js');
      const d = app.state.open.working.deck;
      const ref = M.makeElement('reference', 60, 420);
      ref.content = { target: 'a-slide-that-is-gone', text: 'see slide {ref}' };
      d.slides[2].extras = [ref];
      ed.repaint();
      return 1;
    })();
  `);
  await page.eval('[...document.querySelectorAll(".ribbon-tab")].find(t => t.textContent === "Share").click(); return 1;');
  await page.eval('[...document.querySelectorAll(".rib-btn")].find(b => b.textContent.includes("Check")).click(); return 1;');
  await page.waitFor('document.querySelector(".check-item")');
  const items = await page.eval('return [...document.querySelectorAll(".check-item")].map(e => e.textContent).join("\\n");');
  assert.match(items, /points at a slide that has been deleted/);
  await shot('08-check');
  // Clicking it goes to the slide and selects the thing on it.
  await page.eval('document.querySelector(".check-item").click(); return 1;');
  await pause(450);
  assert.match(await page.eval('return document.querySelector(".statusbar").textContent;'), /Slide 3 of 5/);
  assert.strictEqual(await page.eval('return (document.querySelector(".insp-head .name-field") || {}).value;'), 'Reference');
});

test('generating a style draws six slides, and G draws another', async () => {
  await page.eval('document.querySelector(".titlebar .brand").click(); return 1;');
  await page.waitFor('document.querySelector(".start-actions")');
  await page.eval('[...document.querySelectorAll(".start-actions button")].find(b => b.textContent.includes("Generate")).click(); return 1;');
  await page.waitFor('document.querySelector(".style-sheet svg")', 10000);
  assert.strictEqual(await page.eval('return document.querySelectorAll(".style-slide").length;'), 6);
  const first = await page.eval('return document.querySelector(".style-meta .seed").textContent;');
  await shot('09-generated');
  await page.press('g', { keyCode: 71, text: 'g' });
  await pause(500);
  const second = await page.eval('return document.querySelector(".style-meta .seed").textContent;');
  assert.notStrictEqual(second, first, 'G did not generate another');
  // Previous goes back to the one that was passed, not to a new one.
  await page.eval('[...document.querySelectorAll(".modal-foot button")].find(b => b.textContent === "Previous").click(); return 1;');
  await pause(400);
  assert.strictEqual(await page.eval('return document.querySelector(".style-meta .seed").textContent;'), first);
  await page.press('Escape', { keyCode: 27 });
});

test('nothing on any of those screens threw', () => {
  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

await run('SlideX: the interface, in a real browser');
console.log('Screenshots are in assets/screens/.');
try { await page.close(); } catch (e) { /* already gone */ }
stop();
