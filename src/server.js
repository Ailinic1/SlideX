#!/usr/bin/env node
/**
 * SlideX local server.
 *
 * Adapted from Newsx (src/server.js).
 *
 * Runs on your own computer and nowhere else: it serves the editor to a window
 * or a browser on 127.0.0.1, and a small JSON API over the files in ~/SlideX.
 * There is no account and nothing is fetched from the internet - the fonts, the
 * icons, the charts and the PDF writer are all here - so a deck can be written
 * on a plane and shown in a room with no wifi.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

import * as S from './lib/store.js';
import * as repo from './lib/repo.js';
import { UserError, notFound } from './lib/errors.js';
import { NAME, VERSION } from './lib/version.js';
import { STARTERS } from '../web/shared/starters.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const ASSETS = path.join(ROOT, 'assets');
const DEFAULT_PORT = parseInt(process.env.SLIDEX_PORT || '7431', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

/* ------------------------------------------------------------- replies */

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(buf);
}
const json = (res, data, status = 200) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });

function attachment(res, buffer, fileName, type) {
  send(res, 200, buffer, {
    'Content-Type': type,
    'Content-Disposition': 'attachment; filename="' + fileName.replace(/[^\w.-]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(fileName),
  });
}

/**
 * Where the details of a failure were written. The desktop app has no terminal
 * window; it writes to a log file and tells the server which.
 */
function whereDetailsAre() {
  return process.env.SLIDEX_LOG ? 'in ' + process.env.SLIDEX_LOG : 'in the terminal window';
}

function fail(res, err) {
  const mine = err && err.name === 'UserError';
  const status = mine ? err.status || 400 : 500;
  if (!mine) console.error('[SlideX]', err && err.stack ? err.stack : err);
  json(res, {
    error: mine ? err.message : 'Something went wrong inside SlideX. Your work is saved; the details are ' + whereDetailsAre() + '.',
    ...(mine && err.detail ? { detail: err.detail } : {}),
  }, status);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new UserError('That file is too large.', { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw new UserError('The request could not be read.'); }
}

const header = (req, name) => {
  const v = req.headers[name];
  try { return v ? decodeURIComponent(String(v)) : ''; } catch (e) { return String(v || ''); }
};

/* --------------------------------------------------- opening things for you */

const BROWSERS = ['firefox', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];
const onPath = (cmd) => (process.env.PATH || '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, cmd)));
const noOpen = () => process.env.SLIDEX_NO_OPEN === '1' || !!process.env.CI;

function openInBrowser(url) {
  if (noOpen()) return false;
  const candidates = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['explorer'] : [process.env.BROWSER, ...BROWSERS, 'xdg-open'].filter(Boolean);
  const cmd = candidates.find((c) => process.platform !== 'linux' || onPath(c));
  if (!cmd) return false;
  execFile(cmd, [url], () => {});
  return true;
}

/**
 * Show a folder, because somebody clicked Open folder. SLIDEX_NO_OPEN is about
 * not opening a browser at start - the window sets it - so it does not stop
 * this; only a test run does.
 */
function reveal(target) {
  if (process.env.CI || process.env.SLIDEX_NO_REVEAL === '1') return false;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(cmd, [target], () => {});
  return true;
}

/* ---------------------------------------------------------------- routes */

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/about$/, (req, res) => json(res, { name: NAME, version: VERSION, home: S.HOME, node: process.version }));
route('GET', /^\/api\/config$/, (req, res) => json(res, S.getConfig()));
route('PUT', /^\/api\/config$/, async (req, res) => {
  const body = await readJson(req);
  const patch = {};
  for (const k of ['theme', 'sharedFolder', 'snap', 'grid', 'transitions', 'user']) if (body[k] !== undefined) patch[k] = body[k];
  if (patch.sharedFolder && !fs.existsSync(String(patch.sharedFolder))) throw new UserError('There is no folder at ' + patch.sharedFolder + '.');
  json(res, S.setConfig(patch));
});
route('GET', /^\/api\/starters$/, (req, res) => json(res, Object.entries(STARTERS).map(([id, s]) => ({ id, name: s.name, description: s.description }))));

route('GET', /^\/api\/decks$/, (req, res) => json(res, repo.listDecks()));
route('POST', /^\/api\/decks$/, async (req, res) => json(res, repo.createDeck(await readJson(req)), 201));
route('GET', /^\/api\/decks\/([^/]+)$/, (req, res, [id]) => json(res, repo.getDeck(id)));
route('PUT', /^\/api\/decks\/([^/]+)$/, async (req, res, [id]) => json(res, repo.updateDeck(id, await readJson(req))));
route('DELETE', /^\/api\/decks\/([^/]+)$/, (req, res, [id]) => json(res, repo.deleteDeck(id)));
route('PUT', /^\/api\/decks\/([^/]+)\/working$/, async (req, res, [id]) => json(res, repo.saveWorking(id, await readJson(req))));

route('POST', /^\/api\/decks\/([^/]+)\/assets$/, async (req, res, [id]) => {
  const buf = await readBody(req, 30 * 1024 * 1024);
  json(res, repo.addAsset(id, buf, header(req, 'x-file-name')), 201);
});
route('GET', /^\/api\/decks\/([^/]+)\/assets\/([a-f0-9]{40})$/, (req, res, [id, sha]) => {
  const { file, meta } = repo.assetPath(id, sha);
  // A picture's name is its contents, so it can be cached for ever.
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME['.' + meta.kind], 'Cache-Control': 'private, max-age=31536000, immutable' });
});

route('POST', /^\/api\/decks\/([^/]+)\/push$/, async (req, res, [id]) => {
  const body = await readJson(req);
  json(res, repo.push(id, { note: body.note, author: body.author }));
});
route('GET', /^\/api\/decks\/([^/]+)\/history$/, (req, res, [id]) => json(res, repo.history(id)));
route('GET', /^\/api\/decks\/([^/]+)\/versions\/([a-f0-9]{16})$/, (req, res, [id, vid]) => json(res, repo.versionDetail(id, vid)));
route('PUT', /^\/api\/decks\/([^/]+)\/versions\/([a-f0-9]{16})$/, async (req, res, [id, vid]) => json(res, repo.labelVersion(id, vid, (await readJson(req)).label)));
route('POST', /^\/api\/decks\/([^/]+)\/restore$/, async (req, res, [id]) => {
  const body = await readJson(req);
  json(res, repo.restore(id, body.version, { apply: !!body.apply }));
});
route('GET', /^\/api\/decks\/([^/]+)\/pull\/([a-f0-9]{16})$/, (req, res, [id, vid]) => json(res, repo.previewPull(id, vid)));
route('POST', /^\/api\/decks\/([^/]+)\/pull\/([a-f0-9]{16})$/, async (req, res, [id, vid]) => {
  const body = await readJson(req);
  json(res, repo.pull(id, vid, { resolutions: body.resolutions || {}, note: body.note }));
});

route('POST', /^\/api\/reveal$/, async (req, res) => {
  const body = await readJson(req);
  let target = String(body.path || '');
  if (body.deck) target = S.ensureDir(S.paths.out(body.deck));
  if (!target || !fs.existsSync(target)) throw notFound('That folder is not there any more.');
  json(res, { opened: reveal(target) });
});

/** Folders, for choosing the shared folder without typing a path. */
route('GET', /^\/api\/browse$/, (req, res, _, url) => {
  const start = url.searchParams.get('path') || os.homedir();
  const dir = path.resolve(start);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw notFound('There is no folder at ' + dir + '.');
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    throw new UserError('That folder cannot be read.');
  }
  const parent = path.dirname(dir);
  json(res, { path: dir, parent: parent !== dir ? parent : null, entries, home: os.homedir() });
});

/* ---------------------------------------------------------------- static */

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/icon.svg' || rel === '/icon.png') {
    const file = path.join(ASSETS, rel.slice(1));
    if (fs.existsSync(file)) return send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] });
  }
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        // Another site open in the same browser cannot send this header without
        // asking first, and a local server has no business answering it.
        if (req.method !== 'GET' && req.headers['x-slidex'] !== '1') {
          return json(res, { error: 'Requests must come from the SlideX page.' }, 403);
        }
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = url.pathname.match(r.pattern);
          if (m) return await r.handler(req, res, m.slice(1).map(decodeURIComponent), url);
        }
        return json(res, { error: 'There is no such request.' }, 404);
      }
      if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      return fail(res, e);
    }
  });
}

/**
 * Start listening on 127.0.0.1.
 *
 * @param opts {port, anyPort} - with anyPort, a port somebody else holds is not
 *   an error: the desktop app takes whatever port is free rather than refusing
 *   to open because a copy run from source is already on 7431.
 * @returns {server, url}
 */
export function start(opts = {}) {
  const wanted = opts.port == null ? DEFAULT_PORT : opts.port;
  const listen = (port) => new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({ server, url: 'http://127.0.0.1:' + server.address().port });
    });
  });
  S.ensureDir(S.HOME);
  return listen(wanted).catch((e) => {
    if (e.code === 'EADDRINUSE' && opts.anyPort) return listen(0);
    throw e;
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  start().then(({ url }) => {
    console.log(NAME + ' ' + VERSION + ' is running at ' + url);
    console.log('Your decks are in ' + S.HOME + '. Leave this window open while you work.');
    if (!process.argv.includes('--no-open') && !noOpen() && !openInBrowser(url)) console.log('Open ' + url + ' in your browser.');
  }).catch((e) => {
    if (e.code === 'EADDRINUSE') {
      const url = 'http://127.0.0.1:' + DEFAULT_PORT;
      console.log(NAME + ' is already running at ' + url + '.');
      if (!process.argv.includes('--no-open')) openInBrowser(url);
    } else {
      console.error(e);
      process.exit(1);
    }
  });
}
