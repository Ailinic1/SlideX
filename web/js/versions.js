// Push, pull, and the history.
//
// Adapted from Newsx (web/js/versions.js), and working the same way.
//
// There is no server holding the deck and no account to sign into. A push
// freezes the deck as a version and drops a bundle into a folder that already
// syncs itself - SharePoint, OneDrive, Dropbox - beside a PDF, for the people
// who only want to read it. A pull finds a colleague's bundle there, brings
// its versions into the history without touching anything, and shows what
// pulling would change before any of it is applied.
//
// What both of you changed, and only that, is shown side by side to choose
// between. Different slides, different words on different slides, one the
// palette and the other the order: those merge without a question.

import { h, clear, toast, openModal, confirmDialog, promptDialog, relTime, fullTime, fileSize, avatar, download } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { thumb, slideContext } from './slides.js';
import { resolveSlide, numbering, slideTitle } from '../shared/model.js';

/* ------------------------------------------------------------------ push */

/**
 * Freeze the deck as a version, and copy it into the shared folder.
 *
 * @param opts {deckId, name, onDone}
 */
export async function push(opts) {
  const note = await promptDialog({
    title: 'Push',
    label: 'What changed? (optional)',
    placeholder: 'Rewrote the second half',
    hint: 'This freezes the deck as a version, and copies it and a PDF into your shared folder.',
    confirmLabel: 'Push',
  });
  if (note == null) return;
  try {
    const result = await api.push(opts.deckId, { note });
    if (result.unchanged) {
      toast('Nothing to push', 'The deck has not changed since the last version.', '', 4000);
      return;
    }
    const shared = result.shared || {};
    const where = shared.copied
      ? 'Copied into ' + shared.folder + ': ' + shared.files.join(' and ') + '.'
      : shared.reason === 'no-folder'
        ? 'No shared folder is set, so nothing was copied. Settings ▸ Shared folder.'
        : shared.reason === 'missing'
          ? 'The shared folder ' + shared.folder + ' is not there any more, so nothing was copied.'
          : shared.message || '';
    toast('Version ' + result.version.versionNumber, (result.changes.length === 1 ? 'One change' : result.changes.length + ' changes') + '. ' + where, 'ok', 8000);
    if (opts.onDone) opts.onDone(result);
  } catch (e) {
    toast('Could not push', e.message, 'bad', 9000);
  }
}

/* ------------------------------------------------------------------ pull */

/** What is in the shared folder for this deck, and what pulling each would do. */
export function openPull(opts) {
  const body = h('div');
  const ctl = openModal({
    title: 'Pull',
    subtitle: 'Bundles in your shared folder that belong to this deck.',
    size: 'wide',
    body,
    footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Close')],
  });
  loadList();
  return ctl;

  async function loadList() {
    clear(body).append(h('div.empty-state', h('span.spinner')));
    let found;
    try {
      found = await api.exchange(opts.deckId);
    } catch (e) {
      clear(body).append(h('div.empty-state', [h('h2', 'Could not read the folder'), h('p', e.message)]));
      return;
    }
    clear(body);
    if (!found.configured) {
      body.append(h('div.empty-state', [
        h('h2', 'No shared folder yet'),
        h('p', 'Choose a folder that syncs itself - SharePoint, OneDrive, Dropbox - and a push will drop the deck and a PDF into it for your colleagues.'),
        h('button.btn.primary', { onclick: () => { ctl.close(); if (opts.onSettings) opts.onSettings(); } }, 'Choose a folder…'),
      ]));
      return;
    }
    if (found.missing) {
      body.append(h('div.empty-state', [h('h2', 'That folder is not there'), h('p', found.folder)]));
      return;
    }
    if (!found.items.length) {
      body.append(h('div.empty-state', [
        h('h2', 'Nothing of this deck in the folder yet'),
        h('p', 'Once somebody pushes, their bundle appears here.'),
        h('p.dim', found.folder),
      ]));
      return;
    }
    body.append(h('div.bundle-list', found.items.map(bundleRow)));
  }

  function bundleRow(item) {
    if (item.error) return h('div.bundle-row', [h('div.bundle-name', item.name), h('div.dim', item.error)]);
    const head = item.head || {};
    return h('div.bundle-row', [
      avatar(head.author || item.manifest.exportedBy || '?', 28),
      h('div.bundle-words', [
        h('div.bundle-name', (head.author || item.manifest.exportedBy || 'Somebody') + ' · ' + relTime(item.modifiedAt)),
        h('div.dim', [
          item.name,
          h('span', ' · ' + fileSize(item.size)),
          head.note ? h('span', ' · “' + head.note + '”') : null,
        ].filter(Boolean)),
      ]),
      item.state === 'have'
        ? h('span.pill.ok', 'You have this')
        : h('button.btn.sm.primary', { onclick: () => preview(item) }, 'See what it changes'),
    ]);
  }

  async function preview(item) {
    ctl.setBusy(true, 'Reading it…');
    try {
      const brought = await api.importFromFolder(opts.deckId, item.file);
      ctl.setBusy(false);
      if (brought.upToDate) {
        toast('Already up to date', 'Nothing in that bundle is new to this copy.', '', 5000);
        return;
      }
      ctl.close();
      openPullPreview({ ...opts, versionId: brought.incomingHead });
    } catch (e) {
      ctl.setBusy(false);
      toast('Could not read that bundle', e.message, 'bad', 9000);
    }
  }
}

/**
 * What a pull would change, in words and in pictures, before anything happens.
 */
export async function openPullPreview(opts) {
  let preview;
  try {
    preview = await api.pullPreview(opts.deckId, opts.versionId);
  } catch (e) {
    toast('Could not work out what that would change', e.message, 'bad', 9000);
    return;
  }
  const resolutions = {};
  const body = h('div');

  const paint = () => {
    clear(body);
    const unresolved = preview.conflicts.filter((c) => !resolutions[c.key]);
    if (preview.conflicts.length) {
      body.append(h('div.diff-section', [
        h('div.diff-head', [
          h('span.ico', icon('compare', 15)),
          h('span', preview.conflicts.length === 1 ? 'One thing you both changed' : preview.conflicts.length + ' things you both changed'),
          unresolved.length ? h('span.pill.warn', unresolved.length + ' still to choose') : h('span.pill.ok', 'All chosen'),
        ]),
        ...preview.conflicts.map(conflictRow),
      ]));
    }
    body.append(
      changeList('What ' + (preview.incoming.author || 'they') + ' changed', preview.theirChanges, 'add'),
      changeList('What you changed, which is kept', preview.yourChanges, 'del'),
      slidesThatChange(),
    );
    ctl.setFooter(footer());
  };

  const conflictRow = (c) => {
    const choose = (side) => { resolutions[c.key] = side; paint(); };
    return h('div.conflict', [
      h('div.conflict-where', c.where || c.key),
      h('div.conflict-sides', [
        h('button.conflict-side' + (resolutions[c.key] === 'ours' ? '.on' : ''), { onclick: () => choose('ours') }, [
          h('div.conflict-who', 'Yours'),
          h('div.conflict-value', show(c.ours)),
        ]),
        h('button.conflict-side' + (resolutions[c.key] === 'theirs' ? '.on' : ''), { onclick: () => choose('theirs') }, [
          h('div.conflict-who', preview.incoming.author || 'Theirs'),
          h('div.conflict-value', show(c.theirs)),
        ]),
      ]),
    ]);
  };

  const changeList = (title, changes, kind) => {
    if (!changes.length) return h('div.diff-section', [h('div.diff-head', title), h('div.dim', 'Nothing.')]);
    return h('div.diff-section', [
      h('div.diff-head', title),
      ...changes.slice(0, 60).map((c) => h('div.change.' + kind, [
        h('span.change-what', c.what),
        c.detail ? h('span.change-where', c.detail) : null,
        c.before != null && c.after != null ? h('div.change-words', [
          h('del', show(c.before)),
          h('ins', show(c.after)),
        ]) : null,
      ])),
      changes.length > 60 ? h('div.dim', 'and ' + (changes.length - 60) + ' more') : null,
    ]);
  };

  /** The slides the merge would change, drawn as they will look after it. */
  const slidesThatChange = () => {
    const merged = preview.merged;
    const before = opts.deck;
    const nums = numbering(merged);
    const changed = (merged.slides || []).filter((slide) => {
      const was = (before.slides || []).find((s) => s.id === slide.id);
      return !was || JSON.stringify(was) !== JSON.stringify(slide);
    }).slice(0, 8);
    if (!changed.length) return h('div.diff-section', [h('div.diff-head', 'No slide looks different afterwards.')]);
    return h('div.diff-section', [
      h('div.diff-head', changed.length === 1 ? 'The slide that changes, as it will look' : 'The slides that change, as they will look'),
      h('div.diff-slides', changed.map((slide) => h('div.diff-slide', [
        thumb(resolveSlide(merged, slide), slideContext(merged, slide, { numbers: nums, assets: opts.assets }), opts.assetUrl),
        h('div.dim', (nums.numberOf(slide.id) || '–') + '. ' + (slideTitle(merged, slide) || 'Untitled')),
      ]))),
    ]);
  };

  const footer = () => {
    const unresolved = preview.conflicts.filter((c) => !resolutions[c.key]).length;
    return [
      h('button.btn', { onclick: () => ctl.close() }, 'Cancel'),
      h('span.spacer'),
      unresolved ? h('span.dim', unresolved === 1 ? 'One thing still to choose' : unresolved + ' things still to choose') : null,
      h('button.btn.primary', {
        disabled: unresolved > 0,
        onclick: async () => {
          ctl.setBusy(true, 'Merging…');
          try {
            await api.pull(opts.deckId, opts.versionId, { resolutions });
            ctl.close();
            toast('Pulled', 'The deck now has ' + (preview.incoming.author || 'their') + ' changes in it, and yours.', 'ok');
            if (opts.onDone) opts.onDone();
          } catch (e) {
            ctl.setBusy(false);
            toast('Could not pull', e.message, 'bad', 9000);
          }
        },
      }, 'Pull it in'),
    ].filter(Boolean);
  };

  const ctl = openModal({
    title: 'Pull from ' + (preview.incoming.author || 'a colleague'),
    subtitle: fullTime(preview.incoming.at) + (preview.incoming.note ? ' · “' + preview.incoming.note + '”' : ''),
    size: 'wide',
    body,
    footer: [],
  });
  paint();
  return ctl;
}

const show = (v) => {
  if (v == null) return '(nothing)';
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  return JSON.stringify(v).slice(0, 200);
};

/* --------------------------------------------------------------- history */

/**
 * Every version, who pushed it and what changed. The history is only ever
 * added to: going back never removes a version, and becomes a new version the
 * next time you push.
 */
export async function openHistory(opts) {
  let data;
  try {
    data = await api.history(opts.deckId);
  } catch (e) {
    toast('Could not read the history', e.message, 'bad');
    return;
  }
  const body = h('div');
  const paint = () => {
    clear(body);
    if (!data.versions.length) {
      body.append(h('div.empty-state', [
        h('h2', 'No versions yet'),
        h('p', 'Push to freeze the deck as a version. Every push after that is another, and any of them can be gone back to.'),
      ]));
      return;
    }
    body.append(h('div.history-list', data.versions.map(versionRow)));
  };

  const versionRow = (v) => h('div.history-row' + (v.id === data.head ? '.head' : ''), [
    avatar(v.author, 30),
    h('div.history-words', [
      h('div.history-title', [
        h('strong', 'Version ' + v.versionNumber),
        v.label ? h('span.pill.accent', v.label) : null,
        v.id === data.head ? h('span.pill.ok', 'Where you are') : null,
      ].filter(Boolean)),
      h('div.dim', v.author + ' · ' + relTime(v.at) + (v.note ? ' · “' + v.note + '”' : '')),
      h('div.dim', v.slides + (v.slides === 1 ? ' slide' : ' slides')
        + (v.stats && v.stats.changes ? ' · ' + v.stats.changes + ' changes' : '')),
    ]),
    h('div.history-actions', [
      h('button.btn.sm.ghost', { onclick: () => label(v) }, 'Name it…'),
      h('button.btn.sm.ghost', { onclick: () => whatChanged(v) }, 'What changed'),
      v.id === data.head ? null : h('button.btn.sm', { onclick: () => goBack(v) }, 'Go back to this'),
    ].filter(Boolean)),
  ]);

  async function label(v) {
    const name = await promptDialog({ title: 'Name this version', label: 'A name you will recognise', value: v.label || '', placeholder: 'What we showed the board', confirmLabel: 'Name it' });
    if (name == null) return;
    await api.labelVersion(opts.deckId, v.id, name);
    data = await api.history(opts.deckId);
    paint();
  }

  async function whatChanged(v) {
    const detail = await api.version(opts.deckId, v.id);
    openModal({
      title: 'Version ' + v.versionNumber,
      subtitle: v.author + ' · ' + fullTime(v.at),
      body: detail.changes.length
        ? h('div.diff-section', detail.changes.map((c) => h('div.change.add', [
          h('span.change-what', c.what),
          c.detail ? h('span.change-where', c.detail) : null,
        ])))
        : h('div.dim', 'This was the first version.'),
      footer: (c) => [h('button.btn.primary', { onclick: () => c.close() }, 'Close')],
    });
  }

  async function goBack(v) {
    const what = await api.restorePreview(opts.deckId, v.id);
    const yes = await confirmDialog({
      title: 'Go back to version ' + v.versionNumber + '?',
      message: (what.changes.length === 1 ? 'One thing' : what.changes.length + ' things')
        + ' would change back. Nothing is removed from the history: going back becomes a new version the next time you push, and every version stays where it is.',
      confirmLabel: 'Go back to it',
      danger: what.unpushed,
    });
    if (!yes) return;
    await api.restore(opts.deckId, v.id);
    ctl.close();
    toast('Back at version ' + v.versionNumber, 'Push when you are ready to share it.', 'ok');
    if (opts.onDone) opts.onDone();
  }

  const ctl = openModal({
    title: 'History',
    subtitle: 'Every push, with who made it and what changed. Only ever added to.',
    size: 'wide',
    body,
    footer: (c) => [
      h('button.btn', { onclick: () => download(api.bundleUrl(opts.deckId), { what: 'the bundle', detail: 'It carries the whole deck and its history.', fallbackName: 'deck.sxbundle' }) }, 'Save a bundle…'),
      h('span.spacer'),
      h('button.btn.primary', { onclick: () => c.close() }, 'Close'),
    ],
  });
  paint();
  return ctl;
}

/** Open a deck somebody shared, from a bundle file. */
export function openSharedDeck(onOpened) {
  const input = h('input', { type: 'file', accept: '.sxbundle,application/zip', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    try {
      const info = await api.inspectBundle(file);
      const yes = await confirmDialog({
        title: info.exists ? 'Bring “' + info.manifest.deckName + '” up to date?' : 'Open “' + info.manifest.deckName + '”?',
        message: info.exists
          ? 'You already have this deck. The versions in the bundle that you do not have will be added to its history; nothing changes until you pull.'
          : (info.manifest.versionCount || 0) + ' versions, shared by ' + info.manifest.exportedBy + ' ' + relTime(info.manifest.exportedAt) + '.',
        confirmLabel: info.exists ? 'Bring it in' : 'Open it',
      });
      if (!yes) return;
      const brought = await api.importNew(file);
      toast(brought.isNew ? 'Opened' : 'Brought in', brought.isNew
        ? '“' + info.manifest.deckName + '” is now on this computer.'
        : brought.imported + ' versions added to its history. Pull to bring them into the deck.', 'ok', 7000);
      if (onOpened) onOpened(brought);
    } catch (e) {
      toast('Could not open that file', e.message, 'bad', 9000);
    }
  });
  document.body.append(input);
  input.click();
}
