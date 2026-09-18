// Small DOM helpers: element building, modals, toasts.
//
// Copied from Newsx (web/js/ui.js).

import { icon } from './icons.js';

/** h('div.cls#id', {attrs}, [children]) -> HTMLElement */
export function h(spec, attrs, children) {
  const [tagPart, ...classParts] = String(spec).split('.');
  const [tag, id] = tagPart.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classParts.length) el.className = classParts.join(' ');
  if (attrs && (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node)) {
    children = attrs;
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  if (children == null) return el;
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ toast */

let toastHost = null;
export function toast(title, body, kind = '', ms = 4200) {
  if (!toastHost) {
    toastHost = h('div.toasts');
    document.body.appendChild(toastHost);
  }
  const el = h('div.toast' + (kind ? '.' + kind : ''), [
    h('div.t-title', title),
    body ? h('div.t-body', body) : null,
  ]);
  toastHost.appendChild(el);
  const kill = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
  el.addEventListener('click', kill);
  if (ms) setTimeout(kill, ms);
  return el;
}

/* --------------------------------------------------------------- download */

/**
 * Download a file the server writes, and say when it has arrived.
 *
 * Pointing the window at the file's address hands the whole thing to the
 * browser, which in an app window of its own shows nothing at all: the PDF
 * lands in the downloads folder, or does not, and whoever clicked is left
 * wondering whether the click did anything. Fetching it here means the page
 * knows - it says the file is being written, says when it has been saved and
 * under what name, and says why when it could not be.
 *
 * @param what   what is being downloaded, as it reads mid-sentence: "the PDF"
 * @param detail anything worth adding once it has arrived
 * @returns {{name, size}} or null when it failed
 */
export async function download(url, { what = 'the file', detail = '', fallbackName = 'download' } = {}) {
  const sentence = what.charAt(0).toUpperCase() + what.slice(1);
  const waiting = toast('Preparing ' + what + '\u2026', null, '', 0);
  waiting.dataset.role = 'download-waiting';
  try {
    const res = await fetch(url, { headers: { 'X-SlideX': '1' } });
    if (!res.ok) {
      let message = res.statusText || 'The server answered ' + res.status + '.';
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (e) { /* not a sentence from the server, keep the status */ }
      throw new Error(message);
    }
    const blob = await res.blob();
    const name = fileNameFrom(res.headers.get('Content-Disposition')) || fallbackName;
    const href = URL.createObjectURL(blob);
    const link = h('a', { href, download: name, style: { display: 'none' } });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    waiting.remove();
    const done = toast('Downloaded ' + name,
      sentence + ' (' + fileSize(blob.size) + ') has been saved to your downloads folder.' +
      (detail ? ' ' + detail : ''), 'ok', 7000);
    done.dataset.role = 'download-done';
    return { name, size: blob.size };
  } catch (e) {
    waiting.remove();
    const failed = toast('Could not download ' + what, e.message, 'bad', 9000);
    failed.dataset.role = 'download-failed';
    return null;
  }
}

/** The name a Content-Disposition header gives a file. */
function fileNameFrom(header) {
  const value = String(header || '');
  const encoded = value.match(/filename\*\s*=\s*(?:UTF-8'[^']*')?([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, '')); } catch (e) { /* fall back */ }
  }
  const plain = value.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : '';
}

/* ------------------------------------------------------------------ modal */

/**
 * openModal({title, subtitle, body, footer, size, onClose}) -> {close, el, setFooter, setBody}
 * `footer` receives the controller so buttons can close the dialog.
 */
export function openModal(opts) {
  const controller = {};
  const bodyEl = h('div.modal-body');
  const footEl = h('div.modal-foot');
  const titleEl = h('h2', opts.title || '');
  const subEl = h('div.sub', opts.subtitle || '');
  const modal = h('div.modal' + (opts.size ? '.' + opts.size : ''), [
    h('div.modal-head', [
      h('div', [titleEl, opts.subtitle ? subEl : null]),
      h('button.icon-btn', { onclick: () => controller.close(), title: 'Close' }, icon('close', 16)),
    ]),
    bodyEl,
    footEl,
  ]);
  const overlay = h('div.overlay', { onmousedown: (e) => { if (e.target === overlay && opts.dismissable !== false) controller.close(); } }, modal);

  controller.el = modal;
  controller.body = bodyEl;
  controller.close = (result) => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (opts.onClose) opts.onClose(result);
  };
  controller.setBody = (content) => { clear(bodyEl); append(bodyEl, content); };
  controller.setFooter = (content) => { clear(footEl); append(footEl, content); };
  controller.setTitle = (t, s) => { titleEl.textContent = t; if (s != null) subEl.textContent = s; };
  controller.setBusy = (busy, label) => {
    footEl.querySelectorAll('button').forEach((b) => (b.disabled = !!busy));
    if (busy && label) footEl.prepend(h('span.dim', { style: { marginRight: 'auto' } }, [h('span.spinner'), ' ' + label]));
  };

  const onKey = (e) => {
    if (e.key === 'Escape' && opts.dismissable !== false) { e.stopPropagation(); controller.close(); }
  };
  document.addEventListener('keydown', onKey, true);

  controller.setBody(typeof opts.body === 'function' ? opts.body(controller) : opts.body);
  controller.setFooter(typeof opts.footer === 'function' ? opts.footer(controller) : opts.footer);
  document.body.appendChild(overlay);
  const focusable = modal.querySelector('input, textarea, button.primary');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return controller;
}

/** Resolves true only if the user actually confirms. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    // close() carries the answer, so dismissing (Escape, backdrop, ✕) is a "no"
    // rather than racing the button handlers.
    openModal({
      title, size: 'narrow',
      body: h('div', { style: { fontSize: '13.5px', lineHeight: '1.6', color: 'var(--text-dim)' } }, message),
      footer: (c) => [
        h('button.btn', { onclick: () => c.close(false) }, 'Cancel'),
        h('button.btn.primary' + (danger ? '.danger' : ''), { onclick: () => c.close(true) }, confirmLabel),
      ],
      onClose: (result) => resolve(result === true),
    });
  });
}

/**
 * Resolves the typed text, '' if the user confirmed without typing anything,
 * or null if they cancelled - so callers can tell "no note" from "changed my mind".
 */
export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'OK', hint }) {
  return new Promise((resolve) => {
    let input;
    const c = openModal({
      title, size: 'narrow',
      body: h('div.field', [
        label ? h('label', label) : null,
        (input = h('input.input', { value, placeholder })),
        hint ? h('div.hint', hint) : null,
      ]),
      footer: (ctl) => [
        h('button.btn', { onclick: () => ctl.close(null) }, 'Cancel'),
        h('button.btn.primary', { onclick: () => ctl.close(input.value.trim()) }, confirmLabel),
      ],
      onClose: (result) => resolve(typeof result === 'string' ? result : null),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') c.close(input.value.trim());
    });
  });
}

/* ---------------------------------------------------------------- people */

const AVATAR_COLORS = ['#4c9aff', '#f2777a', '#4ec9a5', '#e2b93b', '#b57edc', '#4bc0d9', '#ef8354', '#7ea172'];
export function colorForName(name) {
  let hash = 0;
  for (const ch of String(name || '?')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
export function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
export function avatar(name, size) {
  const el = h('span.avatar', { title: name, text: initialsOf(name) });
  el.style.background = colorForName(name);
  if (size) { el.style.width = el.style.height = size + 'px'; el.style.fontSize = Math.round(size * 0.42) + 'px'; }
  return el;
}

/* ----------------------------------------------------------------- dates */

export function relTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 90) return 'a minute ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + ' minutes ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
  return new Date(iso).toLocaleDateString();
}
/** "4 September" - a date said the way somebody would say it out loud. */
export function dayMonth(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'an unknown date';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
export function fullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '';
}
export function fileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
