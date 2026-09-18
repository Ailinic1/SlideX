/**
 * Decks on disk, and their versions.
 *
 * Adapted from Newsx (src/lib/repo.js), which keeps publications the same way.
 *
 *   ~/SlideX/decks/<id>/
 *     deck.json          name, version number, when it was last pushed
 *     working.json       the deck as it is now, saved as you work
 *     assets.json        what each picture is: kind, width, height
 *     assets/<sha1>.png  the pictures, named by their contents
 *     versions/<id>.json every push, as the whole deck
 *     history.json       how the versions relate: parents, author, note
 *     out/               the PDFs and PNGs
 *
 * Push and pull work as they do in Newsx. A push freezes the working deck as a
 * version. A version from somebody else comes in through a bundle, joins the
 * history without touching anything, and is merged into the working deck only
 * when you pull - against the last version you both had, so each side's work
 * survives.
 */
import fs from 'fs';
import path from 'path';
import * as S from './store.js';
import { UserError, notFound } from './errors.js';
import { imageSize } from './images.js';
import { buildStarter, STARTERS } from '../../web/shared/starters.js';
import { generateDeck } from '../../web/shared/generate.js';
import { merge3, describeChanges, deepEqual, describePath } from '../../web/shared/merge.js';

const MAX_ASSET = 25 * 1024 * 1024;

/* ------------------------------------------------------------ reading */

const deckFile = (id) => path.join(S.paths.deck(id), 'deck.json');
const workingFile = (id) => path.join(S.paths.deck(id), 'working.json');
const historyFile = (id) => path.join(S.paths.deck(id), 'history.json');
const assetsFile = (id) => path.join(S.paths.deck(id), 'assets.json');

export function exists(id) {
  try { return fs.existsSync(deckFile(id)); } catch (e) { return false; }
}

function need(id) {
  if (!exists(id)) throw notFound('There is no deck called that. It may have been deleted.');
}

export const readHistory = (id) => S.readJson(historyFile(id), { head: null, versions: {} });
export const writeHistory = (id, h) => S.writeJson(historyFile(id), h);
export const readAssets = (id) => S.readJson(assetsFile(id), {});

export function readVersion(id, versionId) {
  if (!versionId || !/^[a-f0-9]{16}$/.test(versionId)) return null;
  return S.readJson(path.join(S.paths.versions(id), versionId + '.json'), null);
}

export function writeVersion(id, version) {
  S.writeJson(path.join(S.paths.versions(id), version.id + '.json'), version);
}

/** The part of the working file that is the deck itself. */
export function stateOf(working, record) {
  return { ...working.deck, title: record.name };
}

export function listDecks() {
  const dir = S.paths.decks();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    try {
      if (!exists(name)) continue;
      const record = S.readJson(deckFile(name));
      const working = S.readJson(workingFile(name), { deck: null });
      const deck = working.deck;
      out.push({
        ...record,
        slideCount: deck ? (deck.slides || []).length : 0,
        aspect: deck ? deck.aspect : 'wide',
        unpushed: hasUnpushed(name),
        // Enough to draw the first slide on the start page without opening the
        // rest of the deck.
        preview: { deck, assets: readAssets(name) },
      });
    } catch (e) {
      // A folder that is not a deck, or a damaged one, is not a reason to hide
      // every other deck.
    }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getDeck(id) {
  need(id);
  const record = S.readJson(deckFile(id));
  const working = S.readJson(workingFile(id));
  const history = readHistory(id);
  return { record, working, history, assets: readAssets(id), unpushed: hasUnpushed(id) };
}

export function hasUnpushed(id) {
  const history = readHistory(id);
  const working = S.readJson(workingFile(id), null);
  const record = S.readJson(deckFile(id), null);
  if (!working || !record) return false;
  const head = readVersion(id, history.head);
  if (!head) return true;
  return !deepEqual(head.state, stateOf(working, record));
}

/* ------------------------------------------------------------ writing */

export function createDeck(opts = {}) {
  const name = String(opts.name || '').trim();
  if (!name) throw new UserError('Give the deck a name.');
  if (name.length > 120) throw new UserError('That name is too long for a title slide.');
  const generated = opts.starter === 'generated';
  if (opts.starter && !generated && !STARTERS[opts.starter]) throw new UserError('There is no starter called that.');
  if (generated && !/^[\w-]{1,40}$/.test(String(opts.seed || ''))) throw new UserError('A generated style needs the seed it was generated from.');
  S.ensureDir(S.paths.decks());
  const id = S.uniqueSlug(S.paths.decks(), name);
  // A generated style is made again here from its seed, so the deck on the
  // server is the one that was on screen, element for element.
  const deck = generated
    ? generateDeck({ seed: opts.seed, aspect: opts.aspect, palette: opts.palette || undefined, mode: opts.mode || undefined, title: name })
    : buildStarter(opts.starter || 'plain', { palette: opts.palette, aspect: opts.aspect, title: name });
  deck.title = name;
  const now = S.nowIso();
  const record = { id, name, createdAt: now, updatedAt: now, starter: opts.starter || 'plain', versionNumber: 0, revision: 1 };
  S.ensureDir(S.paths.versions(id));
  S.ensureDir(S.paths.assets(id));
  S.writeJson(deckFile(id), record);
  S.writeJson(workingFile(id), { deck, updatedAt: now });
  writeHistory(id, { head: null, versions: {} });
  S.writeJson(assetsFile(id), {});
  return getDeck(id);
}

/**
 * Is this a deck we can save?
 *
 * The one thing checked here that is not shape is the order: slides are an
 * array of ids and nothing anywhere stores a number, so a deck that arrived
 * with numbers on its slides would be a deck from a different program.
 */
function validDeck(deck) {
  if (!deck || typeof deck !== 'object') throw new UserError('Nothing to save.');
  if (!deck.size || !Number.isFinite(deck.size.width) || !Number.isFinite(deck.size.height)) throw new UserError('The deck has no slide size.');
  if (!Array.isArray(deck.layouts) || !deck.layouts.length) throw new UserError('The deck has no layouts.');
  if (!Array.isArray(deck.slides)) throw new UserError('The slides are missing.');
  if (!Array.isArray(deck.sections)) throw new UserError('The sections are missing.');
  const layoutIds = new Set();
  for (const l of deck.layouts) {
    if (!l || typeof l.id !== 'string' || !Array.isArray(l.elements)) throw new UserError('A layout is damaged.');
    layoutIds.add(l.id);
  }
  const seen = new Set();
  for (const s of deck.slides) {
    if (!s || typeof s.id !== 'string') throw new UserError('A slide is damaged.');
    if (seen.has(s.id)) throw new UserError('Two slides have the same id.');
    seen.add(s.id);
    if (!layoutIds.has(s.layout)) throw new UserError('A slide points at a layout that is not in the deck.');
  }
}

/**
 * Save what is being worked on.
 *
 * `revision` is the revision the window last saw. If another window has saved
 * since, this is refused rather than silently overwriting it: the window says
 * so, and the newer work is not lost.
 */
export function saveWorking(id, body = {}) {
  need(id);
  const record = S.readJson(deckFile(id));
  if (body.revision != null && Number(body.revision) !== Number(record.revision || 0)) {
    throw new UserError('This deck was changed in another window since this one last saved. Reload to see those changes; nothing has been overwritten.', { status: 409, detail: { revision: record.revision } });
  }
  const deck = body.deck;
  validDeck(deck);
  const now = S.nowIso();
  S.writeJson(workingFile(id), { deck, updatedAt: now });
  const next = { ...record, name: deck.title || record.name, updatedAt: now, revision: (record.revision || 0) + 1 };
  S.writeJson(deckFile(id), next);
  return { revision: next.revision, updatedAt: now, unpushed: hasUnpushed(id) };
}

export function updateDeck(id, patch = {}) {
  need(id);
  const record = S.readJson(deckFile(id));
  const next = { ...record };
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new UserError('A deck needs a name.');
    next.name = name.slice(0, 120);
    const working = S.readJson(workingFile(id), null);
    if (working && working.deck) {
      working.deck.title = next.name;
      S.writeJson(workingFile(id), working);
    }
  }
  next.updatedAt = S.nowIso();
  next.revision = (record.revision || 0) + 1;
  S.writeJson(deckFile(id), next);
  return next;
}

/** Deleting moves the folder to ~/SlideX/trash, from which it can be put back by hand. */
export function deleteDeck(id) {
  need(id);
  S.ensureDir(S.paths.trash());
  const target = path.join(S.paths.trash(), id + '__' + Date.now());
  fs.renameSync(S.paths.deck(id), target);
  return { trashed: target };
}

/* ------------------------------------------------------------- pictures */

export function addAsset(id, buffer, fileName = '') {
  need(id);
  if (!buffer || !buffer.length) throw new UserError('That file is empty.');
  if (buffer.length > MAX_ASSET) throw new UserError('That picture is larger than 25 MB. Save a smaller copy and add that instead.');
  const size = imageSize(buffer);
  if (!size || !size.width || !size.height) throw new UserError('Only PNG and JPEG pictures can go on a slide. Other pictures are converted when dropped onto the canvas.');
  const sha = S.sha1(buffer);
  const file = path.join(S.paths.assets(id), sha + '.' + size.kind);
  if (!fs.existsSync(file)) S.writeFileAtomic(file, buffer);
  const assets = readAssets(id);
  if (!assets[sha]) {
    assets[sha] = { kind: size.kind, width: size.width, height: size.height, bytes: buffer.length, name: String(fileName).slice(0, 200), addedAt: S.nowIso() };
    S.writeJson(assetsFile(id), assets);
  }
  return { id: sha, ...assets[sha] };
}

export function assetPath(id, sha) {
  need(id);
  if (!/^[a-f0-9]{40}$/.test(String(sha))) throw notFound('No such picture.');
  const meta = readAssets(id)[sha];
  const file = meta ? path.join(S.paths.assets(id), sha + '.' + meta.kind) : null;
  if (!file || !fs.existsSync(file)) throw notFound('That picture is missing from this deck.');
  return { file, meta };
}

/** Pictures a deck uses, so a version and a bundle carry exactly those. */
export function assetsUsed(state) {
  const found = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.asset === 'string' && /^[a-f0-9]{40}$/.test(v.asset)) found.add(v.asset);
      Object.values(v).forEach(walk);
    }
  };
  walk(state);
  return [...found];
}

/* ------------------------------------------------------------- versions */

const versionIdOf = (v) => S.sha1(JSON.stringify({ parents: v.parents, author: v.author, at: v.at, state: v.state })).slice(0, 16);

export function summarize(v) {
  return {
    id: v.id, parents: v.parents, author: v.author, at: v.at, note: v.note || '', label: v.label || '',
    versionNumber: v.versionNumber, stats: v.stats || null,
    slides: (v.state.slides || []).length,
  };
}

const emptyDeck = (title) => ({ title, layouts: [], slides: [], sections: [] });

/**
 * Push: freeze the working deck as a version.
 * @returns {version, unchanged, changes}
 */
export function push(id, opts = {}) {
  need(id);
  const { record, working } = getDeck(id);
  const history = readHistory(id);
  const state = stateOf(working, record);
  const head = readVersion(id, history.head);
  if (head && deepEqual(head.state, state) && !opts.allowEmpty) {
    return { unchanged: true, version: summarize(head), changes: [] };
  }
  const changes = describeChanges(head ? head.state : emptyDeck(state.title), state);
  const author = String(opts.author || S.getConfig().user.name || 'Someone').slice(0, 80);
  const assets = readAssets(id);
  const version = {
    parents: history.head ? [history.head] : [],
    author,
    at: S.nowIso(),
    note: String(opts.note || '').slice(0, 500),
    versionNumber: (record.versionNumber || 0) + 1,
    stats: { changes: changes.length },
    state,
    assets: Object.fromEntries(assetsUsed(state).filter((a) => assets[a]).map((a) => [a, assets[a]])),
  };
  version.id = versionIdOf(version);
  writeVersion(id, version);
  history.versions[version.id] = summarize(version);
  history.head = version.id;
  writeHistory(id, history);
  const rec = S.readJson(deckFile(id));
  S.writeJson(deckFile(id), { ...rec, versionNumber: version.versionNumber, lastPushAt: version.at, lastPushBy: author });
  return { version: summarize(version), changes };
}

export function history(id) {
  need(id);
  const h = readHistory(id);
  const versions = Object.values(h.versions).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { head: h.head, versions, ancestry: ancestry(id, h.head, h) };
}

export function versionDetail(id, versionId) {
  need(id);
  const v = readVersion(id, versionId);
  if (!v) throw notFound('That version is not in this deck.');
  const parent = readVersion(id, (v.parents || [])[0]);
  return { version: v, changes: describeChanges(parent ? parent.state : emptyDeck(v.state.title), v.state) };
}

export function labelVersion(id, versionId, label) {
  need(id);
  const v = readVersion(id, versionId);
  if (!v) throw notFound('That version is not in this deck.');
  const h = readHistory(id);
  // The label is kept beside the version rather than in it: a version's id is
  // the hash of what it holds, and a name is not part of that.
  h.versions[versionId] = { ...(h.versions[versionId] || summarize(v)), label: String(label || '').slice(0, 80) };
  writeHistory(id, h);
  return h.versions[versionId];
}

/**
 * Go back to a version. Nothing in the history is removed or rewritten: the
 * restored deck becomes the working deck, and the next push makes it a new
 * version on top.
 */
export function restore(id, versionId, opts = {}) {
  need(id);
  const v = readVersion(id, versionId);
  if (!v) throw notFound('That version is not in this deck.');
  const { record, working } = getDeck(id);
  const changes = describeChanges(stateOf(working, record), v.state);
  if (!opts.apply) return { changes, version: summarize(v), unpushed: hasUnpushed(id) };
  S.writeJson(workingFile(id), { deck: v.state, updatedAt: S.nowIso() });
  const rec = S.readJson(deckFile(id));
  S.writeJson(deckFile(id), { ...rec, updatedAt: S.nowIso(), revision: (rec.revision || 0) + 1 });
  return { restored: true, changes, version: summarize(v) };
}

export function ancestry(id, versionId, cached) {
  const h = cached || readHistory(id);
  const out = [];
  const seen = new Set();
  const queue = versionId ? [versionId] : [];
  while (queue.length) {
    const v = queue.shift();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    for (const p of (h.versions[v] && h.versions[v].parents) || []) queue.push(p);
  }
  return out;
}

export function commonAncestor(id, a, b) {
  const h = readHistory(id);
  const mine = new Set(ancestry(id, a, h));
  const shared = ancestry(id, b, h).filter((v) => mine.has(v));
  shared.sort((x, y) => String((h.versions[y] || {}).at).localeCompare(String((h.versions[x] || {}).at)));
  return shared[0] || null;
}

function mergeFor(id, incomingId, resolutions) {
  const { record, working } = getDeck(id);
  const h = readHistory(id);
  const incoming = readVersion(id, incomingId);
  if (!incoming) throw notFound('That version has not been brought into this deck yet. Open the file it came in first.');
  const baseId = commonAncestor(id, h.head, incomingId);
  const base = readVersion(id, baseId);
  const ours = stateOf(working, record);
  const baseState = base ? base.state : { ...incoming.state, slides: [], sections: [] };
  const { value, conflicts } = merge3(baseState, ours, incoming.state, resolutions || {});
  return { record, h, incoming, base, ours, merged: value, conflicts, baseState };
}

/** What pulling a version would do, changing nothing. */
export function previewPull(id, incomingId) {
  need(id);
  const { h, incoming, base, ours, merged, conflicts, baseState } = mergeFor(id, incomingId, {});
  return {
    incoming: summarize(incoming),
    base: base ? summarize(base) : null,
    alreadyHave: ancestry(id, h.head).includes(incomingId),
    theirChanges: describeChanges(baseState, incoming.state),
    yourChanges: describeChanges(baseState, ours),
    conflicts: conflicts.map((c) => ({ key: c.key, where: describePath(c.path, merged) || describePath(c.path, incoming.state), ours: c.ours, theirs: c.theirs, base: c.base })),
    merged,
    incomingAssets: incoming.assets || {},
  };
}

/** Pull: merge the version into the working deck, and record the merge as a version. */
export function pull(id, incomingId, opts = {}) {
  need(id);
  const { record, h, incoming, merged, conflicts, ours } = mergeFor(id, incomingId, opts.resolutions || {});
  const unresolved = conflicts.filter((c) => !(opts.resolutions || {})[c.key]);
  if (unresolved.length && !opts.keepOursForUnresolved) {
    throw new UserError(unresolved.length === 1 ? 'One change was made on both sides. Choose which to keep before pulling.' : unresolved.length + ' changes were made on both sides. Choose which to keep before pulling.', { status: 409, detail: { conflicts: unresolved.map((c) => c.key) } });
  }
  const author = String(opts.author || S.getConfig().user.name || 'Someone').slice(0, 80);
  const now = S.nowIso();
  const state = { ...merged, title: record.name };
  S.writeJson(workingFile(id), { deck: state, updatedAt: now });
  const assets = readAssets(id);
  const version = {
    parents: [h.head, incomingId].filter(Boolean),
    author,
    at: now,
    note: opts.note || 'Pulled changes from ' + incoming.author,
    versionNumber: Math.max(record.versionNumber || 0, incoming.versionNumber || 0) + 1,
    stats: { changes: describeChanges(ours, state).length, conflicts: conflicts.length },
    state,
    assets: Object.fromEntries(assetsUsed(state).filter((a) => assets[a]).map((a) => [a, assets[a]])),
  };
  version.id = versionIdOf(version);
  writeVersion(id, version);
  h.versions[version.id] = summarize(version);
  h.head = version.id;
  writeHistory(id, h);
  const rec = S.readJson(deckFile(id));
  S.writeJson(deckFile(id), { ...rec, versionNumber: version.versionNumber, updatedAt: now, lastPullAt: now, revision: (rec.revision || 0) + 1 });
  return { version: summarize(version), conflicts: conflicts.length };
}

export { S };
