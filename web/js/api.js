// A thin wrapper over the local JSON API.
//
// Copied from Newsx (web/js/api.js), with decks where publications were.

const GUARD = { 'X-SlideX': '1' };

async function handle(res) {
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = res.statusText || 'The server answered ' + res.status + '.';
    let detail;
    if (type.includes('json')) {
      try {
        const body = await res.json();
        message = body.error || message;
        detail = body.detail;
      } catch (e) { /* keep the status */ }
    }
    const error = new Error(message);
    error.status = res.status;
    if (detail) error.detail = detail;
    throw error;
  }
  return type.includes('json') ? res.json() : res.blob();
}

const get = (url) => fetch(url, { headers: GUARD }).then(handle);
const send = (method) => (url, body) => fetch(url, {
  method,
  headers: { 'Content-Type': 'application/json', ...GUARD },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(handle);
const post = send('POST');
const put = send('PUT');
const del = send('DELETE');

function upload(url, blob, name = '') {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...GUARD },
    body: blob,
  }).then(handle);
}

const D = (id) => '/api/decks/' + encodeURIComponent(id);

export const api = {
  about: () => get('/api/about'),
  getConfig: () => get('/api/config'),
  setConfig: (patch) => put('/api/config', patch),
  starters: () => get('/api/starters'),

  listDecks: () => get('/api/decks'),
  createDeck: (body) => post('/api/decks', body),
  getDeck: (id) => get(D(id)),
  updateDeck: (id, patch) => put(D(id), patch),
  deleteDeck: (id) => del(D(id)),
  saveWorking: (id, body) => put(D(id) + '/working', body),

  uploadAsset: (id, blob, name) => upload(D(id) + '/assets', blob, name),
  assetUrl: (id, sha) => D(id) + '/assets/' + sha,

  pdfUrl: (id) => D(id) + '/pdf',
  pngUrl: (id, slideId) => D(id) + '/slides/' + encodeURIComponent(slideId) + '/png',

  push: (id, body) => post(D(id) + '/push', body || {}),
  history: (id) => get(D(id) + '/history'),
  version: (id, vid) => get(D(id) + '/versions/' + vid),
  labelVersion: (id, vid, label) => put(D(id) + '/versions/' + vid, { label }),
  restorePreview: (id, version) => post(D(id) + '/restore', { version }),
  restore: (id, version) => post(D(id) + '/restore', { version, apply: true }),
  pullPreview: (id, vid) => get(D(id) + '/pull/' + vid),
  pull: (id, vid, body) => post(D(id) + '/pull/' + vid, body || {}),

  reveal: (body) => post('/api/reveal', body),
  browse: (path) => get('/api/browse' + (path ? '?path=' + encodeURIComponent(path) : '')),
};

/** POST a body and download what comes back, for the PDF of unsaved work. */
export async function postForBlob(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...GUARD }, body: JSON.stringify(body) });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error || message; } catch (e) { /* keep */ }
    throw new Error(message);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const m = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i);
  return { blob: await res.blob(), name: m ? decodeURIComponent(m[1]) : 'download' };
}
