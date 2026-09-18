// The editor: the sorter down the left, the slide in the middle, the inspector
// on the right.
//
// The sorter is where a deck's order lives, and the numbers in it are worked
// out from that order every time it is painted - never stored, never carried
// on a slide. Which is why dragging a slide up two places is one line of code
// and not a pass over the deck fixing numbers.

import { h, clear, toast } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { thumb, slideContext } from './slides.js';
import {
  resolveSlide, resolveLayout, numbering, sectionsOf, layoutOf,
  makeSlide, moveSlides, insertSlides, duplicateSlides, removeSlides, slideTitle, newId,
} from '../shared/model.js';
import { ribBtn, ribGroup, render, markDirty, state as app, setEditorMount, deck } from './app.js';

/** What the editor is looking at. */
export const ed = {
  selection: [],        // slide ids selected in the sorter
  current: null,        // the slide being edited
  picked: [],           // element ids selected on the canvas
  canvas: null,
  showLayout: null,     // a layout id when editing a master rather than a slide
};

let host = null;

export function mountEditor(open) {
  const d = open.working.deck;
  ed.selection = d.slides.length ? [d.slides[0].id] : [];
  ed.current = d.slides.length ? d.slides[0].id : null;
  ed.picked = [];
  ed.showLayout = null;
  setEditorMount(paint);
}

/* -------------------------------------------------------------- painting */

function paint(main) {
  host = main;
  clear(main);
  main.append(sorter(), stage(), inspector());
}

export function repaint() {
  if (host) paint(host);
}

const currentSlide = () => {
  const d = deck();
  if (!d) return null;
  return (d.slides || []).find((s) => s.id === ed.current) || null;
};

/* ---------------------------------------------------------------- sorter */

function sorter() {
  const d = deck();
  const nums = numbering(d);
  const panel = h('div.sidebar.sorter-panel');
  panel.append(h('div.sidebar-head', [
    h('span', 'Slides'),
    h('span.dim', nums.total + (nums.count > nums.total ? ' + ' + (nums.count - nums.total) : '')),
  ]));
  const list = h('div.sorter');
  for (const group of sectionsOf(d)) {
    if (group.section) list.append(sectionRow(group, nums));
    if (group.section && group.section.collapsed) continue;
    for (const slide of group.slides) list.append(slideRow(slide, nums, d));
  }
  list.append(h('button.sorter-add', { onclick: () => addSlide() }, [h('span.ico', icon('plus', 14)), 'New slide']));
  panel.append(list);
  return panel;
}

function sectionRow(group, nums) {
  const s = group.section;
  const row = h('div.section-row', [
    h('button.section-fold', {
      title: s.collapsed ? 'Show the slides in this section' : 'Fold this section away',
      onclick: () => { s.collapsed = !s.collapsed; markDirty(); repaint(); },
    }, icon(s.collapsed ? 'chevronRight' : 'chevronDown', 13)),
    h('span.section-name', s.title),
    // Numbers keep counting across sections, so a section says where it starts
    // rather than restarting at one.
    h('span.section-count', group.slides.length ? String(nums.numberOf(group.slides[0].id) || '–') : '–'),
  ]);
  return row;
}

function slideRow(slide, nums, d) {
  const n = nums.numberOf(slide.id);
  const resolved = resolveSlide(d, slide);
  const selected = ed.selection.includes(slide.id);
  const row = h('button.slide-row' + (selected ? '.active' : '') + (slide.hidden ? '.hidden-slide' : ''), {
    draggable: true,
    dataset: { id: slide.id },
    onclick: (e) => pickSlide(slide.id, e),
  }, [
    // The number is read from the numbering, not from the slide: the slide has
    // no number to read.
    h('span.slide-n', n == null ? '–' : String(n)),
    thumb(resolved, slideContext(d, slide, { numbers: nums, assets: app.open.assets }), (sha) => api.assetUrl(app.open.record.id, sha)),
    h('span.slide-title', slideTitle(d, slide, resolved.elements) || (layoutOf(d, slide.layout) || {}).name || 'Untitled'),
    slide.hidden ? h('span.slide-flag', { title: 'Hidden: skipped when presenting' }, icon('eyeOff', 12)) : null,
  ]);
  installDrag(row, slide.id);
  return row;
}

/* ------------------------------------------------------- drag to reorder */

let dragging = null;

function installDrag(row, id) {
  row.addEventListener('dragstart', (e) => {
    dragging = ed.selection.includes(id) ? ed.selection.slice() : [id];
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* some browsers */ }
  });
  row.addEventListener('dragend', () => {
    dragging = null;
    document.querySelectorAll('.slide-row').forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
  });
  row.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const box = row.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    document.querySelectorAll('.slide-row').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    row.classList.add(after ? 'drop-after' : 'drop-before');
  });
  row.addEventListener('drop', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const box = row.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    const d = deck();
    const at = d.slides.findIndex((s) => s.id === id) + (after ? 1 : 0);
    reorder(dragging, at, (d.slides.find((s) => s.id === id) || {}).sectionId || null);
  });
}

/**
 * Move slides, and let the numbering work itself out.
 *
 * There is nothing here about numbers, because there is nothing to fix: the
 * sorter, the fields on the slides, the agenda, the references and the PDF all
 * read the order, and this changed the order.
 */
export function reorder(ids, at, sectionId) {
  const d = deck();
  const before = d.slides;
  d.slides = moveSlides(d, ids, at);
  // A slide dropped among another section's slides joins that section.
  if (sectionId !== undefined) for (const s of d.slides) if (ids.includes(s.id)) s.sectionId = sectionId;
  if (before === d.slides) return;
  pushUndo('Move slides');
  markDirty();
  repaint();
}

/* -------------------------------------------------------- slide commands */

function pickSlide(id, e) {
  const d = deck();
  if (e && e.shiftKey && ed.current) {
    const a = d.slides.findIndex((s) => s.id === ed.current);
    const b = d.slides.findIndex((s) => s.id === id);
    ed.selection = d.slides.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.id);
  } else if (e && (e.metaKey || e.ctrlKey)) {
    ed.selection = ed.selection.includes(id) ? ed.selection.filter((x) => x !== id) : [...ed.selection, id];
  } else {
    ed.selection = [id];
  }
  ed.current = id;
  ed.picked = [];
  ed.showLayout = null;
  repaint();
}

export function addSlide(layoutId) {
  const d = deck();
  const here = currentSlide();
  const layout = layoutId || (here ? here.layout : (d.layouts.find((l) => l.kind === 'titleContent') || d.layouts[0]).id);
  const slide = makeSlide(d, layout, { sectionId: here ? here.sectionId : null });
  const at = here ? d.slides.findIndex((s) => s.id === here.id) + 1 : d.slides.length;
  d.slides = insertSlides(d, [slide], at);
  pushUndo('New slide');
  ed.selection = [slide.id];
  ed.current = slide.id;
  markDirty();
  repaint();
}

export function duplicateCurrent() {
  const d = deck();
  if (!ed.selection.length) return;
  const copies = duplicateSlides(d, ed.selection);
  const last = Math.max(...ed.selection.map((id) => d.slides.findIndex((s) => s.id === id)));
  d.slides = insertSlides(d, copies, last + 1);
  pushUndo('Duplicate slides');
  ed.selection = copies.map((s) => s.id);
  ed.current = copies[0].id;
  markDirty();
  repaint();
}

export function deleteCurrent() {
  const d = deck();
  if (!ed.selection.length) return;
  if (d.slides.length <= ed.selection.length) {
    toast('A deck needs a slide', 'Add another before deleting this one.', 'warn');
    return;
  }
  const at = d.slides.findIndex((s) => s.id === ed.selection[0]);
  d.slides = removeSlides(d, ed.selection);
  pushUndo('Delete slides');
  const next = d.slides[Math.min(at, d.slides.length - 1)];
  ed.selection = next ? [next.id] : [];
  ed.current = next ? next.id : null;
  markDirty();
  repaint();
}

export function toggleHidden() {
  const d = deck();
  const any = ed.selection.some((id) => !(d.slides.find((s) => s.id === id) || {}).hidden);
  for (const id of ed.selection) {
    const s = d.slides.find((x) => x.id === id);
    if (s) s.hidden = any;
  }
  pushUndo(any ? 'Hide slides' : 'Show slides');
  markDirty();
  repaint();
}

export function addSection() {
  const d = deck();
  const section = { id: newId('sc'), title: 'New section', collapsed: false };
  d.sections = [...(d.sections || []), section];
  for (const id of ed.selection) {
    const s = d.slides.find((x) => x.id === id);
    if (s) s.sectionId = section.id;
  }
  pushUndo('New section');
  markDirty();
  repaint();
}

/* ----------------------------------------------------------------- undo */
//
// The whole deck, before and after. A deck is small - a few hundred kilobytes
// of JSON at worst - and one snapshot per edit is both simpler and more
// trustworthy than a list of reversible operations, because there is no
// operation anybody can forget to write the reverse of. Undo is unlimited: the
// stack is only bounded by what a session does.

const undoStack = [];
const redoStack = [];
let lastSnapshot = null;

export function snapshotNow() {
  lastSnapshot = JSON.stringify(deck());
}

export function pushUndo(what) {
  const now = JSON.stringify(deck());
  if (lastSnapshot && lastSnapshot !== now) {
    undoStack.push({ what, json: lastSnapshot });
    redoStack.length = 0;
  }
  lastSnapshot = now;
}

export function undo() {
  if (!undoStack.length) return;
  const entry = undoStack.pop();
  redoStack.push({ what: entry.what, json: JSON.stringify(deck()) });
  restore(entry.json);
  toast('Undone', entry.what, '', 1800);
}

export function redo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  undoStack.push({ what: entry.what, json: JSON.stringify(deck()) });
  restore(entry.json);
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function restore(json) {
  app.open.working.deck = JSON.parse(json);
  lastSnapshot = json;
  const d = deck();
  // A slide that the undo brought back, or took away, must not leave the
  // editor pointing at nothing.
  const ids = new Set(d.slides.map((s) => s.id));
  ed.selection = ed.selection.filter((id) => ids.has(id));
  if (!ids.has(ed.current)) ed.current = d.slides.length ? d.slides[0].id : null;
  if (!ed.selection.length && ed.current) ed.selection = [ed.current];
  markDirty();
  render();
}

/* ----------------------------------------------------------------- stage */

function stage() {
  const d = deck();
  const wrap = h('div.stage-host');
  const slide = currentSlide();
  const shown = ed.showLayout ? resolveLayout(d, layoutOf(d, ed.showLayout)) : slide ? resolveSlide(d, slide) : null;
  if (!shown) {
    wrap.append(h('div.empty-state', h('p', 'This deck has no slides yet.')));
    return wrap;
  }
  const ctx = slideContext(d, ed.showLayout ? null : slide, { assets: app.open.assets });
  const view = h('div.stage-slide');
  view.append(thumb(shown, ctx, (sha) => api.assetUrl(app.open.record.id, sha)));
  wrap.append(h('div.stage-inner', view));
  return wrap;
}

/* ------------------------------------------------------------- inspector */

function inspector() {
  const d = deck();
  const slide = currentSlide();
  const panel = h('div.inspector');
  panel.append(h('div.insp-head', [
    h('span.ico', icon('slides', 17)),
    h('div.title', [
      h('div.name', slide ? (slideTitle(d, slide) || 'Untitled slide') : 'Nothing selected'),
      h('div.kind', slide ? (layoutOf(d, slide.layout) || {}).name || '' : ''),
    ]),
  ]));
  if (!slide) return panel;
  const nums = numbering(d);
  panel.append(h('div.insp-section', [
    h('div.label', 'This slide'),
    h('div.insp-row', [h('label', 'Number'), h('div.ctl', h('span.dim', nums.numberOf(slide.id) == null ? 'not numbered (hidden)' : nums.numberOf(slide.id) + ' of ' + nums.total))]),
    h('div.insp-row', [h('label', 'Layout'), h('div.ctl', h('select.input.sm', {
      onchange: (e) => { slide.layout = e.target.value; pushUndo('Change layout'); markDirty(); repaint(); },
    }, d.layouts.map((l) => h('option', { value: l.id, selected: l.id === slide.layout }, l.name))))]),
    h('label.toggle', [
      h('input', { type: 'checkbox', checked: !!slide.hidden, onchange: () => toggleHidden() }),
      h('span', ['Hide this slide', h('span.why', d.options.numberHidden === 'keep' ? 'It keeps its number but is skipped when presenting.' : 'It is skipped when presenting, and the slides after it move up a number.')]),
    ]),
  ]));
  panel.append(h('div.insp-section', [
    h('div.label', 'Notes'),
    h('textarea.input.content', {
      value: slide.notes || '',
      placeholder: 'What to say while this slide is up. Only the presenter view shows these.',
      onchange: (e) => { slide.notes = e.target.value; pushUndo('Notes'); markDirty(); },
    }),
  ]));
  return panel;
}

/* --------------------------------------------------------------- ribbon */

export function editorRibbon() {
  return {
    home: [
      ribGroup('Slides', [
        ribBtn('New slide', 'plus', () => addSlide()),
        ribBtn('Duplicate', 'copy', () => duplicateCurrent(), { small: true }),
        ribBtn('Delete', 'trash', () => deleteCurrent(), { small: true }),
        ribBtn('Section', 'folder', () => addSection(), { small: true }),
      ]),
      ribGroup('Undo', [
        ribBtn('Undo', 'undo', () => undo(), { small: true, disabled: !canUndo() }),
        ribBtn('Redo', 'redo', () => redo(), { small: true, disabled: !canRedo() }),
      ]),
    ],
    insert: [ribGroup('Insert', [ribBtn('Text', 'text', () => {}, { disabled: true })])],
    design: [ribGroup('Design', [ribBtn('Palette', 'palette', () => {}, { disabled: true })])],
    present: [ribGroup('Present', [ribBtn('From the start', 'play', () => {}, { disabled: true })])],
    share: [ribGroup('Share', [ribBtn('Push', 'upload', () => {}, { disabled: true })])],
  };
}

export function editorStatus() {
  const d = deck();
  if (!d) return [];
  const nums = numbering(d);
  const slide = currentSlide();
  return [
    h('span.dim', slide ? 'Slide ' + (nums.numberOf(slide.id) || '–') + ' of ' + nums.total : ''),
    h('span.dim', ASPECT_LABEL[d.aspect] || d.aspect),
  ];
}

const ASPECT_LABEL = { wide: '16:9', standard: '4:3' };
