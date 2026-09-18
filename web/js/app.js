// SlideX, in the browser.
//
// The shell: the title bar, the ribbon, the start page and whatever is open.
// The editor itself is in editor.js, the canvas in canvas.js and the inspector
// in inspector.js; the model and the drawing are in web/shared/, which the
// server runs too.
//
// Laid out as Newsx's web/js/app.js is.

import { api } from './api.js';
import { h, clear, toast, openModal, confirmDialog, promptDialog, relTime } from './ui.js';
import { icon, brandMark } from './icons.js';
import { thumb, slideContext } from './slides.js';
import { resolveSlide, numbering, ASPECTS } from '../shared/model.js';
import { PALETTES } from '../shared/color.js';
import { mountEditor, editorRibbon, editorStatus } from './editor.js';
import { openDeckStyles } from './generated.js';
import { openSharedDeck } from './versions.js';

export const state = {
  view: 'start',        // 'start' | 'editor'
  config: null,
  about: null,
  decks: [],
  starters: [],
  // The deck that is open: {record, working, history, assets, unpushed}
  open: null,
  saving: 'saved',      // 'saved' | 'dirty' | 'saving' | 'failed'
  ribbonTab: 'home',
};

const root = () => document.getElementById('app');

/* ------------------------------------------------------------------ boot */

async function boot() {
  try {
    const [about, config, starters] = await Promise.all([api.about(), api.getConfig(), api.starters()]);
    state.about = about;
    state.config = config;
    state.starters = starters;
    applyTheme(config.theme);
    document.title = 'SlideX';
    await showStart();
  } catch (e) {
    clear(root()).append(h('div.empty-state', [
      h('h2', 'SlideX could not start'),
      h('p', e.message),
    ]));
  }
}

function safeStorage(op, key, value) {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') localStorage.setItem(key, value);
  } catch (e) {
    // A window with no storage is not a reason to refuse to run.
  }
  return null;
}

export function applyTheme(theme) {
  const next = ['dark', 'light', 'contrast'].includes(theme) ? theme : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  safeStorage('set', 'slidex.theme', next);
}

/* --------------------------------------------------------------- chrome */

function titlebar() {
  const bar = h('div.titlebar', [
    h('div.brand', { onclick: () => showStart(), title: 'All your decks' }, [
      h('span.brand-mark', brandMark(20)),
      'SlideX',
    ]),
    h('div.doc-title', state.open ? [h('strong', state.open.record.name), ' · ' + slideCount()] : ''),
    h('div.right', [
      state.open ? saveIndicator() : null,
      h('button.icon-btn', { title: 'Settings', onclick: openSettings }, icon('gear', 17)),
    ]),
  ]);
  return bar;
}

function slideCount() {
  const deck = state.open && state.open.working.deck;
  if (!deck) return '';
  const n = numbering(deck);
  const hidden = n.count - n.total;
  return n.total + (n.total === 1 ? ' slide' : ' slides') + (hidden ? ' (' + hidden + ' hidden)' : '');
}

function saveIndicator() {
  const el = h('button.save-state', { onclick: () => saveNow(true) });
  paintSave(el);
  return el;
}

function paintSave(el) {
  const node = el || document.querySelector('.save-state');
  if (!node) return;
  node.className = 'save-state' + (state.saving === 'saved' ? ' saved' : state.saving === 'saved' ? '' : ' dirty');
  node.textContent = state.saving === 'saving' ? 'Saving…'
    : state.saving === 'dirty' ? 'Not saved'
      : state.saving === 'failed' ? 'Could not save' : 'Saved';
  node.title = state.saving === 'failed' ? 'Click to try saving again' : 'Every change is saved as you make it';
}

export function setSaving(what) {
  state.saving = what;
  paintSave();
}

/**
 * The title bar's subtitle and the status bar, repainted where they stand.
 *
 * Both of them say which slide is which, and both read the numbering, so they
 * are repainted whenever the deck's order or the slide in front of you
 * changes - which is most of what the editor does.
 */
export function refreshChrome() {
  const title = document.querySelector('.doc-title');
  if (title && state.open) clear(title).append(h('strong', state.open.record.name), ' \u00b7 ' + slideCount());
  const bar = document.querySelector('.statusbar');
  if (bar && state.open) {
    clear(bar).append(h('span.dim', state.open.record.name), h('span.spacer'), ...editorStatus());
  }
}

function statusbar(right) {
  return h('div.statusbar', [
    h('span.dim', state.open ? state.open.record.name : 'SlideX ' + (state.about ? state.about.version : '')),
    h('span.spacer'),
    ...(right || []),
  ]);
}

/* --------------------------------------------------------------- ribbon */

export function ribBtn(label, ic, onclick, opts = {}) {
  const btn = h('button.rib-btn' + (opts.small ? '.small' : '') + (opts.primary ? '.primary' : '') + (opts.active ? '.active' : ''), {
    onclick, title: opts.title || label, disabled: !!opts.disabled,
  }, [ic ? h('span.ico', icon(ic, opts.small ? 15 : 17)) : null, h('span', label)]);
  return btn;
}

export function ribGroup(label, items) {
  return h('div.rib-group', [
    h('div.rib-group-items', items.filter(Boolean)),
    h('div.rib-group-label', label),
  ]);
}

function ribbon(tabs, bodies) {
  const tabRow = h('div.ribbon-tabs', tabs.map(([id, label]) => h('button.ribbon-tab' + (state.ribbonTab === id ? '.active' : ''), {
    onclick: () => { state.ribbonTab = id; render(); },
  }, label)));
  return h('div.ribbon', [tabRow, ...tabs.map(([id]) => h('div.ribbon-body' + (state.ribbonTab === id ? '.active' : ''), bodies[id] || []))]);
}

/* ------------------------------------------------------------ rendering */

export function render() {
  const host = clear(root());
  if (state.view === 'editor' && state.open) return renderEditor(host);
  return renderStart(host);
}

/* ------------------------------------------------------------ start page */

export async function showStart() {
  state.view = 'start';
  state.open = null;
  state.decks = await api.listDecks();
  render();
}

function renderStart(host) {
  host.append(titlebar());
  const main = h('div.main');
  const page = h('div.start');
  page.append(
    h('div.start-head', [
      h('h1', 'Your decks'),
      h('div.start-actions', [
        h('button.btn.ghost', { onclick: () => openSharedDeck(() => showStart()) }, 'Open a shared deck\u2026'),
        h('button.btn', { onclick: generateNewDeck }, 'Generate a style\u2026'),
        h('button.btn.primary', { onclick: newDeck }, 'New deck'),
      ]),
    ]),
  );
  if (!state.decks.length) {
    page.append(h('div.empty-state', [
      h('h2', 'Nothing here yet'),
      h('p', 'A deck is slides, the layouts they share, and a palette. Make one, and the first slide opens straight away.'),
      h('div.row', { style: { flex: '0 0 auto', justifyContent: 'center' } }, [
        h('button.btn', { onclick: generateNewDeck }, 'Generate a style\u2026'),
        h('button.btn.primary', { onclick: newDeck }, 'New deck'),
      ]),
    ]));
  } else {
    page.append(h('div.deck-grid', state.decks.map(deckCard)));
  }
  main.append(page);
  host.append(main, statusbar([h('span.dim', 'Decks live in ' + (state.about ? state.about.home : '~/SlideX'))]));
}

function deckCard(d) {
  const preview = d.preview && d.preview.deck;
  const first = preview && preview.slides && preview.slides[0];
  const card = h('button.deck-card', { onclick: () => openDeck(d.id) }, [
    first ? thumb(resolveSlide(preview, first), slideContext(preview, first, { assets: d.preview.assets }), (sha) => api.assetUrl(d.id, sha)) : h('div.thumb'),
    h('div.deck-name', d.name),
    h('div.deck-meta', [
      h('span', d.slideCount + (d.slideCount === 1 ? ' slide' : ' slides')),
      h('span.dim', relTime(d.updatedAt)),
      d.unpushed ? h('span.pill.warn', 'Not shared') : null,
    ]),
  ]);
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    deckMenu(d);
  });
  return card;
}

function deckMenu(d) {
  openModal({
    title: d.name, size: 'narrow',
    body: h('div.menu-list', [
      h('button.btn.ghost', { onclick: async (e) => { e.target.closest('.overlay').remove(); await renameDeck(d); } }, 'Rename…'),
      h('button.btn.ghost.danger', { onclick: async (e) => { e.target.closest('.overlay').remove(); await deleteDeck(d); } }, 'Delete'),
    ]),
    footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Close')],
  });
}

async function renameDeck(d) {
  const name = await promptDialog({ title: 'Rename the deck', label: 'Name', value: d.name, confirmLabel: 'Rename' });
  if (name == null || !name) return;
  await api.updateDeck(d.id, { name });
  await showStart();
}

async function deleteDeck(d) {
  const yes = await confirmDialog({
    title: 'Delete “' + d.name + '”?',
    message: 'It goes to the trash folder beside your decks, so it can be put back by hand. Nothing is removed from your computer.',
    confirmLabel: 'Delete', danger: true,
  });
  if (!yes) return;
  await api.deleteDeck(d.id);
  toast('Deleted', '“' + d.name + '” is in the trash folder.', 'ok');
  await showStart();
}

/* ------------------------------------------------------------- new deck */

function newDeck() {
  let name = 'Untitled deck';
  let starter = state.starters[0] ? state.starters[0].id : 'plain';
  let aspect = 'wide';
  let palette = 'harbor';
  const c = openModal({
    title: 'New deck',
    subtitle: 'Choose how it starts. Everything in it can be changed afterwards.',
    body: h('div', [
      h('div.field', [
        h('label', 'What is it called?'),
        h('input.input', { value: name, oninput: (e) => { name = e.target.value; } }),
        h('div.hint', 'This is the title slide’s {deck} field, and the folder it lives in.'),
      ]),
      h('div.field', [
        h('label', 'Shape'),
        h('div.seg', Object.entries(ASPECTS).map(([id, a]) => h('button' + (id === aspect ? '.on' : ''), {
          onclick: (e) => {
            aspect = id;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
          },
        }, a.ratio))),
        h('div.hint', 'Widescreen is what a projector and a screen-share both want. 4:3 is for the rooms that still have the old projector.'),
      ]),
      h('div.field', [
        h('label', 'Start from'),
        h('div.starter-list', state.starters.map((s) => h('button.starter' + (s.id === starter ? '.on' : ''), {
          onclick: (e) => {
            starter = s.id;
            e.currentTarget.parentElement.querySelectorAll('.starter').forEach((b) => b.classList.remove('on'));
            e.currentTarget.classList.add('on');
          },
        }, [h('div.starter-name', s.name), h('div.starter-why', s.description)]))),
      ]),
      h('div.field', [
        h('label', 'Colours'),
        h('div.swatches', Object.entries(PALETTES).map(([id, p]) => {
          const b = h('button.swatch' + (id === palette ? '.on' : ''), {
            title: p.name,
            onclick: (e) => {
              palette = id;
              e.target.parentElement.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
              e.target.classList.add('on');
            },
          });
          b.style.background = 'linear-gradient(135deg, ' + p.primary + ' 0 50%, ' + p.accent + ' 50% 100%)';
          return b;
        })),
        h('div.hint', 'Elements name their colours by role, so another palette recolours every slide, chart and graphic at once.'),
      ]),
    ]),
    footer: (ctl) => [
      h('button.btn', { onclick: () => ctl.close() }, 'Cancel'),
      h('button.btn.primary', {
        onclick: async () => {
          ctl.setBusy(true, 'Making it…');
          try {
            const made = await api.createDeck({ name: name.trim() || 'Untitled deck', starter, aspect, palette });
            ctl.close();
            await openDeck(made.record.id);
          } catch (e) {
            ctl.setBusy(false);
            toast('Could not make the deck', e.message, 'bad');
          }
        },
      }, 'Make it'),
    ],
  });
  return c;
}

/**
 * Not sure what the deck should look like? This is the first thing on the
 * start page: a whole style drawn by rules from a seed, and another, and
 * another, until one of them is right.
 */
function generateNewDeck() {
  openDeckStyles({
    title: 'Untitled deck',
    onUse: async (generated, seed, palette, aspect) => {
      const name = await promptDialog({
        title: 'What is the deck called?',
        label: 'Name',
        value: 'Untitled deck',
        hint: 'The style you chose was made from the seed ' + seed + ', and is kept with the deck.',
        confirmLabel: 'Make it',
      });
      if (name == null) return;
      try {
        const made = await api.createDeck({ name: name.trim() || 'Untitled deck', starter: 'generated', seed, aspect, palette: palette || undefined });
        await openDeck(made.record.id);
      } catch (e) {
        toast('Could not make the deck', e.message, 'bad');
      }
    },
  });
}

/* --------------------------------------------------------------- editor */

export async function openDeck(id) {
  const open = await api.getDeck(id);
  state.open = open;
  state.view = 'editor';
  state.saving = 'saved';
  state.ribbonTab = 'home';
  safeStorage('set', 'slidex.last', id);
  mountEditor(open);
  render();
}

export const deck = () => (state.open ? state.open.working.deck : null);
export const assetUrl = (sha) => (state.open ? api.assetUrl(state.open.record.id, sha) : '');

function renderEditor(host) {
  host.append(titlebar());
  const bodies = editorRibbon();
  host.append(ribbon([['home', 'Home'], ['insert', 'Insert'], ['design', 'Design'], ['present', 'Present'], ['share', 'Share']], bodies));
  const main = h('div.main.editor-main');
  host.append(main, statusbar(editorStatus()));
  mountEditorInto(main);
}

let mountInto = () => {};
export function setEditorMount(fn) { mountInto = fn; }
function mountEditorInto(main) { mountInto(main); }

/* ---------------------------------------------------------------- saving */

let saveTimer = null;
let pending = false;

/** Say that the deck changed: the editor calls this after every edit. */
export function markDirty() {
  pending = true;
  setSaving('dirty');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(), 900);
  refreshChrome();
}

export async function saveNow(force) {
  if (!state.open || (!pending && !force)) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  pending = false;
  setSaving('saving');
  try {
    const result = await api.saveWorking(state.open.record.id, {
      deck: state.open.working.deck,
      revision: state.open.record.revision,
    });
    state.open.record.revision = result.revision;
    state.open.record.updatedAt = result.updatedAt;
    state.open.unpushed = result.unpushed;
    setSaving('saved');
  } catch (e) {
    setSaving('failed');
    toast('Could not save', e.message, 'bad', 9000);
  }
}

/* ------------------------------------------------------------- settings */

function openSettings() {
  openModal({
    title: 'Settings', size: 'narrow',
    body: h('div', [
      h('div.field', [
        h('label', 'Theme'),
        h('div.seg', [['dark', 'Dark'], ['light', 'Light'], ['contrast', 'High contrast']].map(([id, label]) => h('button' + (state.config.theme === id ? '.on' : ''), {
          onclick: async (e) => {
            state.config = await api.setConfig({ theme: id });
            applyTheme(id);
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
          },
        }, label))),
        h('div.hint', 'The chrome is black, white and grey in every theme. The colour on screen is the deck’s.'),
      ]),
      h('div.field', [
        h('label', 'Snap to the grid'),
        h('label.toggle', [
          h('input', {
            type: 'checkbox', checked: state.config.snap,
            onchange: async (e) => { state.config = await api.setConfig({ snap: e.target.checked }); },
          }),
          h('span', ['Line elements up as you drag them', h('span.why', 'Hold Alt while dragging to place something freely.')]),
        ]),
      ]),
      h('div.field', [
        h('label', 'Your name'),
        h('input.input', {
          value: state.config.user.name,
          onchange: async (e) => { state.config = await api.setConfig({ user: { name: e.target.value } }); },
        }),
        h('div.hint', 'Who a shared version says it came from.'),
      ]),
      h('div.field', [
        h('label', 'Shared folder'),
        h('input.input', {
          value: state.config.sharedFolder || '',
          placeholder: 'A folder that syncs itself: SharePoint, OneDrive, Dropbox',
          onchange: async (e) => {
            try {
              state.config = await api.setConfig({ sharedFolder: e.target.value.trim() });
              toast('Shared folder set', 'A push will copy the deck and a PDF into it.', 'ok', 5000);
            } catch (err) {
              toast('That folder could not be used', err.message, 'bad');
            }
          },
        }),
        h('div.hint', 'A push drops a .sxbundle and a PDF in here; a pull reads your colleagues\u2019 bundles out of it. Nothing else ever leaves this computer.'),
      ]),
      h('div.field', [
        h('label', 'Where your decks are'),
        h('div.hint', state.about ? state.about.home : ''),
      ]),
    ]),
    footer: (c) => [h('span.dim', 'SlideX ' + (state.about ? state.about.version : '')), h('span.spacer'), h('button.btn.primary', { onclick: () => c.close() }, 'Done')],
  });
}

boot();
