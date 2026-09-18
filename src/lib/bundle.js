/**
 * Sharing without a server.
 *
 * Adapted from Newsx (src/lib/bundle.js).
 *
 * A deck travels as one .sxbundle file - a zip of its history, every version,
 * and the pictures they use - that a push drops into a shared folder
 * (SharePoint, OneDrive, Dropbox: anything that syncs). A colleague's copy of
 * SlideX finds it there, brings its versions into the history without touching
 * anything, and shows what pulling it would change.
 */
import fs from 'fs';
import path from 'path';
import * as S from './store.js';
import * as repo from './repo.js';
import { readZip, writeZip } from './zip.js';
import { UserError, notFound } from './errors.js';
import { renderPdf, pdfFileName } from './render.js';

export const EXT = '.sxbundle';
const FORMAT = 'slidex-bundle/1';

function stamp(at = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return at.getFullYear() + two(at.getMonth() + 1) + two(at.getDate()) + '-' + two(at.getHours()) + two(at.getMinutes()) + two(at.getSeconds());
}

/**
 * Named by the moment it was shared and by whom, never by version number: two
 * people pushing the same afternoon each have a "version 4", and a shared
 * folder is no place for two different files with one name.
 */
export function bundleFileName(record, author, at = new Date()) {
  return [S.slugify(record.name), stamp(at), S.slugify(author || 'someone')].join('__') + EXT;
}

export function exportBundle(id) {
  const { record, history } = repo.getDeck(id);
  const entries = [];
  const add = (name, data) => entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
  const assets = repo.readAssets(id);
  const used = new Set();
  const vdir = S.paths.versions(id);
  for (const vid of Object.keys(history.versions)) {
    const file = path.join(vdir, vid + '.json');
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file);
    add('versions/' + vid + '.json', raw);
    for (const a of Object.keys(JSON.parse(raw.toString('utf8')).assets || {})) used.add(a);
  }
  const shipped = {};
  for (const a of used) {
    const meta = assets[a];
    if (!meta) continue;
    const file = path.join(S.paths.assets(id), a + '.' + meta.kind);
    if (!fs.existsSync(file)) continue;
    add('assets/' + a + '.' + meta.kind, fs.readFileSync(file));
    shipped[a] = meta;
  }
  const author = S.getConfig().user.name;
  const manifest = {
    format: FORMAT,
    deckId: record.id,
    deckName: record.name,
    head: history.head,
    versionNumber: record.versionNumber || 0,
    exportedBy: author,
    exportedAt: S.nowIso(),
    versionCount: Object.keys(history.versions).length,
  };
  add('manifest.json', JSON.stringify(manifest, null, 2));
  add('history.json', JSON.stringify(history, null, 2));
  add('assets.json', JSON.stringify(shipped, null, 2));
  return { buffer: writeZip(entries), fileName: bundleFileName(record, author), manifest };
}

function open(buffer) {
  let zip;
  try {
    zip = readZip(buffer);
  } catch (e) {
    throw new UserError('That file could not be opened as a SlideX bundle. Look for the one ending in ' + EXT + '.');
  }
  const m = zip.get('manifest.json');
  if (!m) throw new UserError('That is not a SlideX bundle. Look for the file ending in ' + EXT + '.');
  let manifest;
  try { manifest = JSON.parse(m.data.toString('utf8')); } catch (e) { throw new UserError('That bundle is damaged: its manifest cannot be read.'); }
  if (manifest.format !== FORMAT) throw new UserError('That bundle was made by a version of SlideX this one does not understand.');
  return { zip, manifest };
}

export function inspectBundle(buffer) {
  const { zip, manifest } = open(buffer);
  const history = zip.get('history.json') ? JSON.parse(zip.get('history.json').data.toString('utf8')) : { versions: {} };
  const head = history.versions[history.head] || null;
  return { manifest, head, exists: repo.exists(manifest.deckId) };
}

/**
 * Bring a bundle in. A deck new to this computer is created from it, at its
 * head. For one that is already here, the versions it does not have are added
 * to its history and nothing else changes until somebody pulls.
 */
export function importBundle(buffer, opts = {}) {
  const { zip, manifest } = open(buffer);
  const id = opts.deckId || manifest.deckId;
  try { S.safeId(id); } catch (e) { throw new UserError('That bundle names its deck in a way this program will not use as a folder.'); }
  const incomingHistory = zip.get('history.json') ? JSON.parse(zip.get('history.json').data.toString('utf8')) : null;
  if (!incomingHistory || !incomingHistory.head) throw new UserError('That bundle has no versions in it. It is made when somebody pushes.');
  const isNew = !repo.exists(id);
  if (isNew) {
    S.ensureDir(S.paths.versions(id));
    S.ensureDir(S.paths.assets(id));
  }

  // Pictures first, so no version can refer to one that is not here.
  const shippedMeta = zip.get('assets.json') ? JSON.parse(zip.get('assets.json').data.toString('utf8')) : {};
  const assets = isNew ? {} : repo.readAssets(id);
  for (const [name, entry] of zip) {
    const m = name.match(/^assets\/([a-f0-9]{40})\.(png|jpeg)$/);
    if (!m) continue;
    if (S.sha1(entry.data) !== m[1]) continue; // a picture that is not what its name says is not trusted
    const file = path.join(S.paths.assets(id), m[1] + '.' + m[2]);
    if (!fs.existsSync(file)) S.writeFileAtomic(file, entry.data);
    if (!assets[m[1]] && shippedMeta[m[1]]) assets[m[1]] = shippedMeta[m[1]];
  }
  S.writeJson(path.join(S.paths.deck(id), 'assets.json'), assets);

  const history = isNew ? { head: null, versions: {} } : repo.readHistory(id);
  let imported = 0;
  for (const [name, entry] of zip) {
    const m = name.match(/^versions\/([a-f0-9]{16})\.json$/);
    if (!m || history.versions[m[1]]) continue;
    let version;
    try { version = JSON.parse(entry.data.toString('utf8')); } catch (e) { continue; }
    if (version.id !== m[1] || !version.state || !Array.isArray(version.state.layouts)) continue;
    repo.writeVersion(id, version);
    history.versions[version.id] = repo.summarize(version);
    imported++;
  }
  if (!history.versions[incomingHistory.head]) throw new UserError('That bundle is damaged: the version it was shared at is missing from it.');

  if (isNew) {
    const head = repo.readVersion(id, incomingHistory.head);
    history.head = head.id;
    repo.writeHistory(id, history);
    const now = S.nowIso();
    S.writeJson(path.join(S.paths.deck(id), 'working.json'), { deck: head.state, updatedAt: now });
    S.writeJson(path.join(S.paths.deck(id), 'deck.json'), {
      id, name: head.state.title || manifest.deckName, createdAt: now, updatedAt: now,
      versionNumber: head.versionNumber || 0, revision: 1, importedFrom: manifest.exportedBy, importedAt: now,
    });
  } else {
    repo.writeHistory(id, history);
  }
  const upToDate = !isNew && repo.ancestry(id, history.head, history).includes(incomingHistory.head);
  return { deckId: id, isNew, imported, incomingHead: incomingHistory.head, manifest, upToDate };
}

/**
 * The bundles in a shared folder that belong to a deck, newest first, each
 * saying whether its latest version is already here.
 */
export function scanFolder(id, folder) {
  const dir = String(folder || S.getConfig().sharedFolder || '').trim();
  if (!dir) return { folder: '', configured: false, items: [] };
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { folder: dir, configured: true, missing: true, items: [] };
  const known = repo.exists(id) ? repo.readHistory(id) : { versions: {}, head: null };
  const mine = repo.exists(id) ? new Set(repo.ancestry(id, known.head, known)) : new Set();
  const items = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(EXT)) continue;
    const file = path.join(dir, name);
    try {
      const buf = fs.readFileSync(file);
      const { manifest, head } = inspectBundle(buf);
      if (manifest.deckId !== id) continue;
      items.push({
        file, name, manifest, head,
        size: buf.length,
        modifiedAt: fs.statSync(file).mtime.toISOString(),
        state: mine.has(manifest.head) ? 'have' : known.versions[manifest.head] ? 'imported' : 'new',
      });
    } catch (e) {
      items.push({ file, name, error: e.message });
    }
  }
  items.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  return { folder: dir, configured: true, items };
}

/**
 * After a push: the bundle, and the deck as a PDF, into the shared folder.
 *
 * The PDF is there because most of the people in a shared folder want to read
 * the deck, not edit it, and asking them to install something first is how a
 * shared folder stops being read.
 */
export function publishToFolder(id, folder) {
  const dir = String(folder || S.getConfig().sharedFolder || '').trim();
  if (!dir) return { copied: false, reason: 'no-folder' };
  if (!fs.existsSync(dir)) return { copied: false, reason: 'missing', folder: dir };
  const { buffer, fileName } = exportBundle(id);
  const written = [];
  S.writeFileAtomic(path.join(dir, fileName), buffer);
  written.push(fileName);
  const { record, working, assets } = repo.getDeck(id);
  const deck = { ...working.deck, title: working.deck.title || record.name };
  if ((deck.slides || []).some((s) => !s.hidden)) {
    const pdf = renderPdf(id, deck, { layout: 'slides', assets });
    const name = pdfFileName(deck, 'slides');
    S.writeFileAtomic(path.join(dir, name), pdf.buffer);
    written.push(name);
  }
  return { copied: true, folder: dir, files: written };
}

export function readBundleFile(file) {
  const p = String(file || '');
  if (!p.endsWith(EXT)) throw new UserError('Only ' + EXT + ' files can be brought in this way.');
  if (!fs.existsSync(p)) throw notFound('That file is no longer in the folder.');
  return fs.readFileSync(p);
}
