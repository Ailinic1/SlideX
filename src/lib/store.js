/**
 * Where everything lives on disk, and the small helpers every store shares.
 *
 * Adapted from Newsx (src/lib/store.js).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const HOME = process.env.SLIDEX_HOME || path.join(os.homedir(), 'SlideX');

export const paths = {
  home: () => HOME,
  config: () => path.join(HOME, 'config.json'),
  decks: () => path.join(HOME, 'decks'),
  deck: (id) => path.join(HOME, 'decks', safeId(id)),
  versions: (id) => path.join(HOME, 'decks', safeId(id), 'versions'),
  assets: (id) => path.join(HOME, 'decks', safeId(id), 'assets'),
  out: (id) => path.join(HOME, 'decks', safeId(id), 'out'),
  // A deck somebody deleted goes here rather than nowhere: deleting the talk
  // you give on Thursday should be a thing you can take back.
  trash: () => path.join(HOME, 'trash'),
};

/** An id is only ever a folder name here, never a path somebody can steer. */
export function safeId(id) {
  const s = String(id || '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(s)) {
    const err = new Error('There is no deck called that.');
    err.name = 'UserError';
    err.status = 404;
    throw err;
  }
  return s;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

/** Temp file and rename, so a crash never leaves half a file behind. */
export function writeJson(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}

export function writeFileAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(3).toString('hex');
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function slugify(s, fallback = 'untitled') {
  const out = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || fallback;
}

export function uniqueSlug(dir, name) {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) candidate = base + '-' + n++;
  return candidate;
}

export const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
export const nowIso = () => new Date().toISOString();

export const DEFAULT_CONFIG = {
  user: { name: os.userInfo().username || 'Presenter', email: '' },
  theme: 'dark',
  // The folder a push copies the deck and its PDF into - a SharePoint,
  // OneDrive or Dropbox folder that syncs itself. Empty means nowhere.
  sharedFolder: '',
  // Snap to a grid on the canvas, and how fine it is, in points.
  snap: true,
  grid: 8,
  // Simple, tasteful, or none at all.
  transitions: true,
};

export function getConfig() {
  const cfg = readJson(paths.config(), null);
  if (!cfg) return { ...DEFAULT_CONFIG, user: { ...DEFAULT_CONFIG.user } };
  return { ...DEFAULT_CONFIG, ...cfg, user: { ...DEFAULT_CONFIG.user, ...(cfg.user || {}) } };
}

export function setConfig(patch = {}) {
  const current = getConfig();
  const next = { ...current, ...patch };
  if (patch.user) next.user = { ...current.user, ...patch.user };
  if (!['dark', 'light', 'contrast'].includes(next.theme)) next.theme = 'dark';
  next.grid = Math.max(1, Math.min(72, Number(next.grid) || DEFAULT_CONFIG.grid));
  writeJson(paths.config(), next);
  return next;
}
