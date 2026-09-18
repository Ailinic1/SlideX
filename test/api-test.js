// The HTTP API, and two people sharing a deck.
//
// Laid out as Newsx's test/api-test.js is: two servers with two home folders
// and one shared folder between them, pushing and pulling the way two
// computers would. Nothing is mocked; these are the real routes over real
// sockets, and the files they leave behind are the real files.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { test, assert, run } from './harness.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', 'src', 'server.js');

/* ------------------------------------------------------------ two computers */

const started = [];

/** A server with a home folder of its own, and a small client for it. */
async function computer(name, sharedFolder) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-' + name + '-'));
  const child = fork(SERVER, ['--no-open'], {
    env: { ...process.env, SLIDEX_HOME: home, SLIDEX_PORT: '0', SLIDEX_NO_OPEN: '1', SLIDEX_NO_REVEAL: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  started.push(child);
  // The server prints where it is listening; that is how this finds the port.
  const url = await new Promise((resolve, reject) => {
    let out = '';
    const onData = (chunk) => {
      out += chunk.toString();
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) resolve(m[0]);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.once('error', reject);
    setTimeout(() => reject(new Error('the server did not start: ' + out)), 15000);
  });

  const call = async (method, route, body, opts = {}) => {
    const res = await fetch(url + route, {
      method,
      headers: { 'X-SlideX': '1', ...(body !== undefined && !opts.raw ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
      body: body === undefined ? undefined : (opts.raw ? body : JSON.stringify(body)),
    });
    const type = res.headers.get('content-type') || '';
    const value = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const err = new Error((value && value.error) || res.statusText);
      err.status = res.status;
      err.body = value;
      throw err;
    }
    return value;
  };

  const client = {
    name, home, url, child,
    get: (r) => call('GET', r),
    post: (r, b) => call('POST', r, b),
    put: (r, b) => call('PUT', r, b),
    del: (r) => call('DELETE', r),
    raw: (method, r, buffer, headers) => call(method, r, buffer, { raw: true, headers }),
    bytes: async (r) => {
      const res = await fetch(url + r, { headers: { 'X-SlideX': '1' } });
      if (!res.ok) throw new Error('GET ' + r + ' answered ' + res.status);
      return { buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    },
  };
  if (sharedFolder) await client.put('/api/config', { sharedFolder, user: { name } });
  else await client.put('/api/config', { user: { name } });
  return client;
}

const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-shared-'));
const ana = await computer('Ana', shared);
const ben = await computer('Ben', shared);

const stop = () => { for (const child of started) child.kill(); };
process.on('exit', stop);

/* --------------------------------------------------------------- the basics */

test('the server says what it is, and where the decks live', async () => {
  const about = await ana.get('/api/about');
  assert.strictEqual(about.name, 'SlideX');
  assert.ok(about.version);
  assert.strictEqual(about.home, ana.home);
});

test('a write from outside the page is refused', async () => {
  const res = await fetch(ana.url + '/api/decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sneaky' }),
  });
  assert.strictEqual(res.status, 403);
  assert.match((await res.json()).error, /must come from the SlideX page/);
  // Reading is allowed: it is a local server serving its own page.
  assert.strictEqual((await fetch(ana.url + '/api/decks')).status, 200);
});

test('making a deck gives it slides, layouts and a folder of its own', async () => {
  const made = await ana.post('/api/decks', { name: 'Quarterly review', starter: 'plain', aspect: 'wide', palette: 'harbor' });
  assert.strictEqual(made.record.id, 'quarterly-review');
  assert.strictEqual(made.working.deck.title, 'Quarterly review');
  assert.ok(made.working.deck.slides.length >= 5);
  assert.ok(made.working.deck.layouts.length >= 10);
  assert.ok(fs.existsSync(path.join(ana.home, 'decks', 'quarterly-review', 'working.json')));
  // Two decks of one name get two folders, not one.
  const second = await ana.post('/api/decks', { name: 'Quarterly review' });
  assert.strictEqual(second.record.id, 'quarterly-review-2');
  await ana.del('/api/decks/quarterly-review-2');
});

test('a deck with no name, and a starter that does not exist, are refused in words', async () => {
  await assert.rejects(() => ana.post('/api/decks', { name: '  ' }), /Give the deck a name/);
  await assert.rejects(() => ana.post('/api/decks', { name: 'X', starter: 'nonsense' }), /no starter called that/);
});

test('a generated style is made again from its seed, element for element', async () => {
  const made = await ana.post('/api/decks', { name: 'Generated', starter: 'generated', seed: 'abc123', aspect: 'wide' });
  const again = await ana.post('/api/decks', { name: 'Generated twice', starter: 'generated', seed: 'abc123', aspect: 'wide' });
  const shape = (deck) => JSON.stringify(deck.layouts.map((l) => l.elements.map((e) => [e.type, e.name, e.x, e.y, e.w, e.h])));
  assert.strictEqual(shape(made.working.deck), shape(again.working.deck));
  assert.strictEqual(made.working.deck.generated.seed, 'abc123');
  await assert.rejects(() => ana.post('/api/decks', { name: 'No seed', starter: 'generated' }), /needs the seed/);
  await ana.del('/api/decks/generated');
  await ana.del('/api/decks/generated-twice');
});

/* ------------------------------------------------------------------ saving */

test('saving refuses a deck that is not one, and says which part', async () => {
  const { record, working } = await ana.get('/api/decks/quarterly-review');
  const bad = (deck) => ana.put('/api/decks/quarterly-review/working', { deck, revision: record.revision });
  await assert.rejects(() => bad({ ...working.deck, layouts: [] }), /no layouts/);
  await assert.rejects(() => bad({ ...working.deck, slides: null }), /slides are missing/);
  await assert.rejects(() => bad({ ...working.deck, slides: [{ id: 'a', layout: 'nope' }] }), /points at a layout that is not in the deck/);
  const twice = [working.deck.slides[0], working.deck.slides[0]];
  await assert.rejects(() => bad({ ...working.deck, slides: twice }), /same id/);
});

test('two windows cannot overwrite each other without being told', async () => {
  const { record, working } = await ana.get('/api/decks/quarterly-review');
  const saved = await ana.put('/api/decks/quarterly-review/working', { deck: working.deck, revision: record.revision });
  assert.strictEqual(saved.revision, record.revision + 1);
  // The second window still thinks it is on the old revision.
  await assert.rejects(
    () => ana.put('/api/decks/quarterly-review/working', { deck: working.deck, revision: record.revision }),
    /changed in another window/,
  );
});

test('the deck saved is the deck that comes back', async () => {
  const { record, working } = await ana.get('/api/decks/quarterly-review');
  const deck = JSON.parse(JSON.stringify(working.deck));
  deck.options.footer = 'Northwind · Confidential';
  deck.slides[0].notes = 'Thirty seconds, then move.';
  // Reordered, so the numbers everything shows are different afterwards.
  deck.slides = [deck.slides[deck.slides.length - 1], ...deck.slides.slice(0, -1)];
  await ana.put('/api/decks/quarterly-review/working', { deck, revision: record.revision });
  const back = (await ana.get('/api/decks/quarterly-review')).working.deck;
  assert.strictEqual(back.options.footer, 'Northwind · Confidential');
  assert.deepStrictEqual(back.slides.map((s) => s.id), deck.slides.map((s) => s.id));
  // And no slide picked up a number on the way.
  assert.ok(!/"number"\s*:/.test(JSON.stringify(back.slides)));
});

/* ---------------------------------------------------------------- pictures */

test('a picture goes in once, is named by its contents, and comes back', async () => {
  const png = fs.readFileSync(path.join(HERE, '..', 'assets', 'icon.png'));
  const asset = await ana.raw('POST', '/api/decks/quarterly-review/assets', png, { 'X-File-Name': 'icon.png' });
  assert.match(asset.id, /^[a-f0-9]{40}$/);
  assert.ok(asset.width > 0 && asset.height > 0);
  // The same bytes again are the same picture, not a second one.
  const again = await ana.raw('POST', '/api/decks/quarterly-review/assets', png, { 'X-File-Name': 'copy.png' });
  assert.strictEqual(again.id, asset.id);
  const files = fs.readdirSync(path.join(ana.home, 'decks', 'quarterly-review', 'assets'));
  assert.strictEqual(files.length, 1);
  const back = await ana.bytes('/api/decks/quarterly-review/assets/' + asset.id);
  assert.ok(back.buffer.equals(png));
  assert.match(back.headers.get('cache-control'), /immutable/);

  // Put it on a slide, so it is a picture the deck uses rather than a file that
  // happens to be in the folder - which is what a bundle carries.
  const { record, working } = await ana.get('/api/decks/quarterly-review');
  const deck = JSON.parse(JSON.stringify(working.deck));
  deck.slides[1].extras = [{
    id: 'elpic00001', type: 'image', name: 'Picture', x: 60, y: 200, w: 300, h: 200,
    locked: true, editable: true, style: { fit: 'cover', radius: 0, opacity: 1 },
    content: { asset: asset.id, focusX: 0.5, focusY: 0.5, alt: '' },
  }];
  await ana.put('/api/decks/quarterly-review/working', { deck, revision: record.revision });
});

test('a file that is not a picture is refused in words', async () => {
  await assert.rejects(
    () => ana.raw('POST', '/api/decks/quarterly-review/assets', Buffer.from('this is not a picture'), { 'X-File-Name': 'x.txt' }),
    /Only PNG and JPEG/,
  );
});

/* --------------------------------------------------------------------- PDF */

test('the PDF has a page per slide, at the size the slides are', async () => {
  const deck = (await ana.get('/api/decks/quarterly-review')).working.deck;
  const { buffer, headers } = await ana.bytes('/api/decks/quarterly-review/pdf');
  assert.match(headers.get('content-type'), /application\/pdf/);
  assert.match(headers.get('content-disposition'), /quarterly-review\.pdf/);
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.strictEqual((text.match(/\/Type \/Page /g) || []).length, deck.slides.filter((s) => !s.hidden).length);
  assert.ok(text.includes('/MediaBox [0 0 960 540]'));
  // And it is kept in the deck's own folder, not only in the downloads.
  assert.ok(fs.readdirSync(path.join(ana.home, 'decks', 'quarterly-review', 'out')).some((f) => f.endsWith('.pdf')));
});

test('the printed layouts are on paper, and a layout that is not one is refused', async () => {
  const notes = await ana.bytes('/api/decks/quarterly-review/pdf?layout=notes');
  assert.ok(notes.buffer.toString('latin1').includes('/MediaBox [0 0 595.28 841.89]'));
  const letter = await ana.bytes('/api/decks/quarterly-review/pdf?layout=handout6&paper=letter');
  assert.ok(letter.buffer.toString('latin1').includes('/MediaBox [0 0 612 792]'));
  await assert.rejects(() => ana.get('/api/decks/quarterly-review/pdf?layout=nonsense'), /no PDF layout called that/);
});

test('a PDF can be made of work that has not been saved', async () => {
  const { working } = await ana.get('/api/decks/quarterly-review');
  const deck = JSON.parse(JSON.stringify(working.deck));
  deck.slides = deck.slides.slice(0, 2);
  const res = await fetch(ana.url + '/api/decks/quarterly-review/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SlideX': '1' },
    body: JSON.stringify({ deck, layout: 'slides' }),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.strictEqual((buffer.toString('latin1').match(/\/Type \/Page /g) || []).length, 2);
  // And the deck on disk is untouched by it.
  assert.ok((await ana.get('/api/decks/quarterly-review')).working.deck.slides.length > 2);
});

/* ------------------------------------------------------- push, share, pull */

test('a push freezes a version and copies a bundle and a PDF into the shared folder', async () => {
  const result = await ana.post('/api/decks/quarterly-review/push', { note: 'The first version' });
  assert.strictEqual(result.version.versionNumber, 1);
  assert.strictEqual(result.shared.copied, true);
  const files = fs.readdirSync(shared);
  assert.ok(files.some((f) => f.endsWith('.sxbundle')), 'no bundle in the folder: ' + files.join());
  assert.ok(files.some((f) => f.endsWith('.pdf')), 'no PDF in the folder: ' + files.join());
  // Named by the moment and by whom, never by version number: two people
  // pushing the same afternoon each have a version 1.
  const bundle = files.find((f) => f.endsWith('.sxbundle'));
  assert.match(bundle, /^quarterly-review__\d{8}-\d{6}__ana\.sxbundle$/);
});

test('pushing again with nothing changed says so and writes nothing', async () => {
  const before = fs.readdirSync(shared).length;
  const result = await ana.post('/api/decks/quarterly-review/push', {});
  assert.strictEqual(result.unchanged, true);
  assert.strictEqual(fs.readdirSync(shared).length, before);
});

test('Ben opens Ana’s deck from the shared folder', async () => {
  const file = fs.readdirSync(shared).find((f) => f.endsWith('.sxbundle'));
  const brought = await ben.raw('POST', '/api/import', fs.readFileSync(path.join(shared, file)));
  assert.strictEqual(brought.isNew, true);
  assert.strictEqual(brought.deckId, 'quarterly-review');
  const his = await ben.get('/api/decks/quarterly-review');
  const hers = await ana.get('/api/decks/quarterly-review');
  assert.deepStrictEqual(his.working.deck.slides.map((s) => s.id), hers.working.deck.slides.map((s) => s.id));
  assert.strictEqual(his.working.deck.options.footer, hers.working.deck.options.footer);
  // The picture came with it.
  const asset = Object.keys(hers.assets)[0];
  assert.ok(his.assets[asset], 'the picture did not travel');
});

test('two people changing different slides merge without a question', async () => {
  // Ana rewrites the title slide.
  const mine = await ana.get('/api/decks/quarterly-review');
  const hers = JSON.parse(JSON.stringify(mine.working.deck));
  const titleSlide = hers.slides[0];
  const titleLayout = hers.layouts.find((l) => l.id === titleSlide.layout);
  const title = titleLayout.elements.find((e) => e.name === 'Title');
  titleSlide.overrides[title.id] = { content: { text: 'What the year looked like' } };
  await ana.put('/api/decks/quarterly-review/working', { deck: hers, revision: mine.record.revision });
  await ana.post('/api/decks/quarterly-review/push', { note: 'Rewrote the title' });

  // Ben, meanwhile, adds a slide and writes a note on another.
  const his = await ben.get('/api/decks/quarterly-review');
  const deck = JSON.parse(JSON.stringify(his.working.deck));
  deck.slides[2].notes = 'Pause here for questions.';
  deck.slides.push({ ...JSON.parse(JSON.stringify(deck.slides[3])), id: 'slben00001', overrides: {}, extras: [] });
  await ben.put('/api/decks/quarterly-review/working', { deck, revision: his.record.revision });

  // Ben pulls Ana's.
  const file = fs.readdirSync(shared).filter((f) => f.endsWith('.sxbundle')).sort().pop();
  const brought = await ben.post('/api/decks/quarterly-review/exchange/import', { file: path.join(shared, file) });
  const preview = await ben.get('/api/decks/quarterly-review/pull/' + brought.incomingHead);
  assert.deepStrictEqual(preview.conflicts, [], 'different slides should not conflict');
  assert.ok(preview.theirChanges.some((c) => /Title/.test(c.what)), JSON.stringify(preview.theirChanges.map((c) => c.what)));
  assert.ok(preview.yourChanges.some((c) => /Added a slide/.test(c.what)), JSON.stringify(preview.yourChanges.map((c) => c.what)));

  await ben.post('/api/decks/quarterly-review/pull/' + brought.incomingHead, {});
  const merged = (await ben.get('/api/decks/quarterly-review')).working.deck;
  // Both sides survived.
  const mergedTitle = merged.slides[0].overrides[title.id];
  assert.strictEqual(mergedTitle.content.text, 'What the year looked like', 'Ana’s title was lost');
  assert.strictEqual(merged.slides[2].notes, 'Pause here for questions.', 'Ben’s note was lost');
  assert.ok(merged.slides.some((s) => s.id === 'slben00001'), 'Ben’s new slide was lost');
  // And every number is still the order of the list.
  assert.ok(!/"number"\s*:/.test(JSON.stringify(merged.slides)));
});

test('only what both of them changed is a question, and it is asked once', async () => {
  // Both rewrite the same heading.
  const hers = await ana.get('/api/decks/quarterly-review');
  const a = JSON.parse(JSON.stringify(hers.working.deck));
  // Whichever slide has a heading on it: the deck has been reordered by now, so
  // which one that is has changed since it was made.
  const withHeading = (deck) => {
    for (const s of deck.slides) {
      const layout = deck.layouts.find((l) => l.id === s.layout);
      const found = layout && layout.elements.find((e) => e.type === 'text' && e.name === 'Title');
      if (found) return { slide: s, el: found };
    }
    throw new Error('no slide in this deck has a heading');
  };
  const { slide, el } = withHeading(a);
  slide.overrides[el.id] = { content: { text: 'Ana’s heading' } };
  await ana.put('/api/decks/quarterly-review/working', { deck: a, revision: hers.record.revision });
  await ana.post('/api/decks/quarterly-review/push', { note: 'Ana’s heading' });

  const his = await ben.get('/api/decks/quarterly-review');
  const b = JSON.parse(JSON.stringify(his.working.deck));
  const hisSlide = b.slides.find((s) => s.id === slide.id);
  hisSlide.overrides[el.id] = { content: { text: 'Ben’s heading' } };
  await ben.put('/api/decks/quarterly-review/working', { deck: b, revision: his.record.revision });

  const file = fs.readdirSync(shared).filter((f) => f.endsWith('.sxbundle')).sort().pop();
  const brought = await ben.post('/api/decks/quarterly-review/exchange/import', { file: path.join(shared, file) });
  const preview = await ben.get('/api/decks/quarterly-review/pull/' + brought.incomingHead);
  assert.strictEqual(preview.conflicts.length, 1, JSON.stringify(preview.conflicts.map((c) => c.key)));
  assert.strictEqual(preview.conflicts[0].ours, 'Ben’s heading');
  assert.strictEqual(preview.conflicts[0].theirs, 'Ana’s heading');
  assert.match(preview.conflicts[0].where, /Slide \d+/);

  // Pulling without choosing is refused, in words.
  await assert.rejects(() => ben.post('/api/decks/quarterly-review/pull/' + brought.incomingHead, {}), /Choose which to keep/);

  // Choosing Ana's keeps Ana's.
  await ben.post('/api/decks/quarterly-review/pull/' + brought.incomingHead, {
    resolutions: { [preview.conflicts[0].key]: 'theirs' },
  });
  const merged = (await ben.get('/api/decks/quarterly-review')).working.deck;
  assert.strictEqual(merged.slides.find((s) => s.id === slide.id).overrides[el.id].content.text, 'Ana’s heading');
});

test('the history is only ever added to, and going back is a new version', async () => {
  const history = await ana.get('/api/decks/quarterly-review/history');
  assert.ok(history.versions.length >= 2);
  const first = history.versions[history.versions.length - 1];
  const before = history.versions.length;

  const named = await ana.put('/api/decks/quarterly-review/versions/' + first.id, { label: 'What we showed the board' });
  assert.strictEqual(named.label, 'What we showed the board');

  const what = await ana.post('/api/decks/quarterly-review/restore', { version: first.id });
  assert.ok(Array.isArray(what.changes));
  await ana.post('/api/decks/quarterly-review/restore', { version: first.id, apply: true });

  const after = await ana.get('/api/decks/quarterly-review/history');
  assert.strictEqual(after.versions.length, before, 'going back removed a version');
  // And the deck is the old one again.
  const now = (await ana.get('/api/decks/quarterly-review')).working.deck;
  const detail = await ana.get('/api/decks/quarterly-review/versions/' + first.id);
  assert.deepStrictEqual(now.slides.map((s) => s.id), detail.version.state.slides.map((s) => s.id));
});

test('a bundle for another deck is refused, and so is a file that is not one', async () => {
  const other = await ben.post('/api/decks', { name: 'Something else' });
  const bundle = await ben.bytes('/api/decks/quarterly-review/bundle');
  await assert.rejects(
    () => ben.raw('POST', '/api/decks/' + other.record.id + '/bundle', bundle.buffer),
    /not this deck/,
  );
  await assert.rejects(() => ben.raw('POST', '/api/import', Buffer.from('not a zip at all')), /could not be opened as a SlideX bundle/);
});

/* ------------------------------------------------------------------ tidying */

test('deleting a deck moves it to the trash rather than removing it', async () => {
  await ana.post('/api/decks', { name: 'Throwaway' });
  const gone = await ana.del('/api/decks/throwaway');
  assert.ok(gone.trashed.includes('trash'));
  assert.ok(fs.existsSync(gone.trashed), 'the folder is not in the trash');
  await assert.rejects(() => ana.get('/api/decks/throwaway'), /no deck called that/);
});

test('an id that is not a folder name is refused rather than followed', async () => {
  for (const bad of ['..', '../../etc', 'a/b', 'A_B']) {
    await assert.rejects(() => ana.get('/api/decks/' + encodeURIComponent(bad)), (e) => e.status === 404);
  }
});

test('the page and its files are served, and nothing above them is', async () => {
  for (const file of ['/', '/index.html', '/presenter.html', '/js/app.js', '/css/app.css', '/shared/model.js', '/icon.svg']) {
    const res = await fetch(ana.url + file);
    assert.strictEqual(res.status, 200, file + ' answered ' + res.status);
  }
  for (const attempt of ['/../package.json', '/..%2fpackage.json', '/js/../../package.json']) {
    const res = await fetch(ana.url + attempt, { redirect: 'manual' });
    assert.ok(res.status === 404 || res.status === 400 || res.status >= 300, attempt + ' answered ' + res.status);
    if (res.status === 200) assert.ok(!(await res.text()).includes('"name": "slidex"'), attempt + ' served package.json');
  }
});

await run('SlideX: the HTTP API, and two people sharing a deck');
stop();
