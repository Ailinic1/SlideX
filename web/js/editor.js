// The editor: the sorter down the left, the slide in the middle, the inspector
// on the right.
//
// The sorter is where a deck's order lives, and the numbers in it are worked
// out from that order every time it is painted - never stored, never carried
// on a slide. Which is why dragging a slide up two places is one line of code
// and not a pass over the deck fixing numbers.
//
// An element on a slide may come from the slide's layout. Editing it then
// writes a difference against the layout rather than changing the layout, so
// the other slides using it are untouched and "Back to layout" is forgetting
// that difference. Editing the layout itself - "Edit the layout" - changes it
// for every slide that has not said otherwise.

import { h, clear, toast, openModal, promptDialog, confirmDialog } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { thumb, slideContext } from './slides.js';
import { createCanvas } from './canvas.js';
import { paintInspector } from './inspector.js';
import { openCommands, provideCommands } from './commands.js';
import { openSlideLayouts, restyleDeck } from './generated.js';
import {
  resolveSlide, resolveLayout, numbering, sectionsOf, layoutOf, makeSlide, makeElement,
  moveSlides, insertSlides, duplicateSlides, removeSlides, slideTitle, newId, clone, rebaseSlides,
  ELEMENT_TYPES, FIELD_KINDS, LAYOUT_KINDS, ASPECTS, FONT_PAIRINGS, applyFonts,
} from '../shared/model.js';
import { parseTable } from '../shared/charts.js';
import { ribBtn, ribGroup, render, markDirty, refreshChrome, state as app, setEditorMount, deck } from './app.js';

/** What the editor is looking at. */
export const ed = {
  selection: [],        // slide ids selected in the sorter
  current: null,        // the slide being edited
  picked: [],           // element ids selected on the canvas
  canvas: null,
  layoutId: null,       // set while editing a layout rather than a slide
  showEditable: false,
  zoom: 1,
};

let host = null;
let clipboard = null;

export function mountEditor(open) {
  const d = open.working.deck;
  ed.selection = d.slides.length ? [d.slides[0].id] : [];
  ed.current = d.slides.length ? d.slides[0].id : null;
  ed.picked = [];
  ed.layoutId = null;
  snapshotNow();
  setEditorMount(paint);
  installKeyboard();
}

/* -------------------------------------------------------------- painting */

function paint(main) {
  host = main;
  clear(main);
  const stageHost = h('div.stage-host');
  const inspectorHost = h('div.inspector');
  main.append(sorter(), stageHost, inspectorHost);
  if (ed.canvas) ed.canvas.destroy();
  ed.canvas = createCanvas(stageHost, canvasOptions());
  ed.canvas.renderNow();
  ed.canvas.select(ed.picked, true);
  paintInspectorNow(inspectorHost);
}

export function repaint() {
  if (host) paint(host);
  refreshChrome();
}

/** Redraw the slide and the inspector without rebuilding the sorter. */
function refresh() {
  if (ed.canvas) ed.canvas.render();
  paintInspectorNow();
  paintSorterThumbs();
  refreshChrome();
}

function paintInspectorNow(target) {
  const node = target || document.querySelector('.inspector');
  if (!node) return;
  const d = deck();
  const slide = currentSlide();
  const layout = ed.layoutId ? layoutOf(d, ed.layoutId) : null;
  paintInspector(node, {
    deck: d,
    slide,
    editingLayout: layout,
    layoutName: slide ? (layoutOf(d, slide.layout) || {}).name : '',
    elements: shownElements(),
    selection: ed.picked,
    palette: d.palette,
    assets: app.open.assets,
    report: ed.canvas ? ed.canvas.report : {},
    isOverridden: (id) => !!(slide && slide.overrides && slide.overrides[id]),
    onStyle: (patch) => editSelected('style', patch),
    onContent: (patch) => editSelected('content', patch),
    onGeometry: (patch) => editSelected('geometry', patch),
    onName: (name) => editSelected('name', name),
    onBackToLayout: backToLayout,
    onSlide: (patch) => patchSlide(patch),
    onLayout: (patch) => patchLayout(patch),
    onSelect: (ids) => { ed.picked = ids; if (ed.canvas) ed.canvas.select(ids, true); paintInspectorNow(); },
    onCommand: elementCommand,
  });
}

const currentSlide = () => {
  const d = deck();
  if (!d) return null;
  return (d.slides || []).find((s) => s.id === ed.current) || null;
};

/** What the canvas is showing: a slide as it resolves, or a layout on its own. */
function shown() {
  const d = deck();
  if (ed.layoutId) {
    const layout = layoutOf(d, ed.layoutId);
    return layout ? resolveLayout(d, layout) : null;
  }
  const slide = currentSlide();
  return slide ? resolveSlide(d, slide) : null;
}

const shownElements = () => (shown() || { elements: [] }).elements;

function canvasOptions() {
  return {
    getSlide: shown,
    getCtx: () => slideContext(deck(), ed.layoutId ? null : currentSlide(), { assets: app.open.assets }),
    assetUrl: (sha) => api.assetUrl(app.open.record.id, sha),
    getConfig: () => app.config,
    canSelect: () => true,
    // An element the layout marks fixed - a band, a rule - is not dragged
    // about on a slide, but is on the layout, which is where it belongs.
    canMove: (el) => !!ed.layoutId || el.editable !== false,
    canResize: (el) => !!ed.layoutId || el.editable !== false,
    showEditable: () => ed.showEditable,
    allowMarquee: () => true,
    onSelect: (ids) => { ed.picked = ids; paintInspectorNow(); },
    onGeometry: applyGeometry,
    onEndpoint: (id, end, point) => { editElement(id, 'content', { [end]: point }); refresh(); },
    onDoubleClick: (el) => editInPlace(el),
    onDropInsert: (spec, pt) => insertElement(spec, pt),
    onDropFiles: (files, pt, over) => dropFiles(files, pt, over),
    onContextMenu: (e, el) => contextMenu(e, el),
    onZoom: (z) => { ed.zoom = z; paintStatus(); },
  };
}

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
  if (ed.layoutId) {
    list.append(h('div.layout-banner', [
      h('span', 'Editing the layout “' + (layoutOf(d, ed.layoutId) || {}).name + '”'),
      h('button.btn.sm', { onclick: () => { ed.layoutId = null; ed.picked = []; repaint(); } }, 'Back to the slide'),
    ]));
  }
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
  return h('div.section-row', [
    h('button.section-fold', {
      title: s.collapsed ? 'Show the slides in this section' : 'Fold this section away',
      onclick: () => { s.collapsed = !s.collapsed; markDirty(); repaint(); },
    }, icon(s.collapsed ? 'chevronRight' : 'chevronDown', 13)),
    h('span.section-name', {
      title: 'Rename this section',
      ondblclick: async () => {
        const title = await promptDialog({ title: 'Rename the section', label: 'Name', value: s.title, confirmLabel: 'Rename' });
        if (title) { s.title = title; pushUndo('Rename section'); markDirty(); repaint(); }
      },
    }, s.title + (group.first ? '' : ' (continued)')),
    // Numbers keep counting across sections, so a section says where it starts
    // rather than restarting at one.
    h('span.section-count', group.slides.length ? String(nums.numberOf(group.slides[0].id) || '–') : '–'),
  ]);
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
    slide.notes ? h('span.slide-flag.notes', { title: 'Has notes' }, icon('notes', 12)) : null,
  ]);
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); slideMenu(e, slide); });
  installDrag(row, slide.id);
  return row;
}

/** Redraw the sorter's thumbnails in place, so typing does not rebuild the list. */
function paintSorterThumbs() {
  const d = deck();
  const nums = numbering(d);
  for (const row of document.querySelectorAll('.slide-row')) {
    const slide = d.slides.find((s) => s.id === row.dataset.id);
    if (!slide) continue;
    const resolved = resolveSlide(d, slide);
    const fresh = thumb(resolved, slideContext(d, slide, { numbers: nums, assets: app.open.assets }), (sha) => api.assetUrl(app.open.record.id, sha));
    const old = row.querySelector('.thumb');
    if (old) old.replaceWith(fresh);
    const title = row.querySelector('.slide-title');
    if (title) title.textContent = slideTitle(d, slide, resolved.elements) || (layoutOf(d, slide.layout) || {}).name || 'Untitled';
  }
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
    const target = d.slides.find((s) => s.id === id);
    const at = d.slides.findIndex((s) => s.id === id) + (after ? 1 : 0);
    reorder(dragging, at, target ? target.sectionId || null : null);
  });
}

/**
 * Move slides, and let the numbering work itself out.
 *
 * There is nothing here about numbers, because there is nothing to fix: the
 * sorter, the fields on the slides, the agenda, the references, the presenter
 * view and the PDF all read the order, and this changed the order.
 */
export function reorder(ids, at, sectionId) {
  const d = deck();
  const before = JSON.stringify(d.slides.map((s) => s.id));
  d.slides = moveSlides(d, ids, at);
  // A slide dropped among another section's slides joins that section.
  if (sectionId !== undefined) for (const s of d.slides) if (ids.includes(s.id)) s.sectionId = sectionId;
  if (JSON.stringify(d.slides.map((s) => s.id)) === before && sectionId === undefined) return;
  pushUndo(ids.length === 1 ? 'Move a slide' : 'Move ' + ids.length + ' slides');
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
  ed.layoutId = null;
  repaint();
}

export function goToSlide(id) {
  ed.selection = [id];
  ed.current = id;
  ed.picked = [];
  ed.layoutId = null;
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
  ed.picked = [];
  markDirty();
  repaint();
}

export function duplicateCurrent() {
  const d = deck();
  if (!ed.selection.length) return;
  const copies = duplicateSlides(d, ed.selection);
  const last = Math.max(...ed.selection.map((id) => d.slides.findIndex((s) => s.id === id)));
  d.slides = insertSlides(d, copies, last + 1);
  pushUndo(copies.length === 1 ? 'Duplicate a slide' : 'Duplicate ' + copies.length + ' slides');
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
  pushUndo(ed.selection.length === 1 ? 'Delete a slide' : 'Delete ' + ed.selection.length + ' slides');
  const next = d.slides[Math.min(at, d.slides.length - 1)];
  ed.selection = next ? [next.id] : [];
  ed.current = next ? next.id : null;
  ed.picked = [];
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

export async function addSection() {
  const title = await promptDialog({ title: 'New section', label: 'What is this part about?', value: 'New section', confirmLabel: 'Add' });
  if (title == null) return;
  const d = deck();
  const section = { id: newId('sc'), title: title || 'New section', collapsed: false };
  d.sections = [...(d.sections || []), section];
  for (const id of ed.selection) {
    const s = d.slides.find((x) => x.id === id);
    if (s) s.sectionId = section.id;
  }
  pushUndo('New section');
  markDirty();
  repaint();
}

function patchSlide(patch) {
  const slide = currentSlide();
  if (!slide) return;
  Object.assign(slide, patch);
  pushUndo('Change the slide');
  markDirty();
  repaint();
}

function patchLayout(patch) {
  const layout = layoutOf(deck(), ed.layoutId);
  if (!layout) return;
  Object.assign(layout, patch);
  pushUndo('Change the layout');
  markDirty();
  repaint();
}

function slideMenu(e, slide) {
  if (!ed.selection.includes(slide.id)) pickSlide(slide.id);
  showMenu([
    ['New slide after this', 'plus', () => addSlide()],
    ['Duplicate', 'copy', duplicateCurrent],
    [slide.hidden ? 'Show when presenting' : 'Hide when presenting', 'eyeOff', toggleHidden],
    ['New section from here', 'folder', addSection],
    ['Edit this slide’s layout', 'layout', () => editLayout(slide.layout)],
    ['Delete', 'trash', deleteCurrent],
  ], e);
}

function showMenu(items, e) {
  const menu = h('div.context-menu', items.map(([label, ic, fn]) => h('button.menu-item', {
    onclick: () => { menu.remove(); fn(); },
  }, [h('span.ico', icon(ic, 14)), label])));
  menu.style.left = Math.min(e.clientX, window.innerWidth - 240) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - items.length * 30 - 16) + 'px';
  document.body.append(menu);
  const kill = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', kill, true); } };
  setTimeout(() => document.addEventListener('mousedown', kill, true), 0);
}

/* ---------------------------------------------------------------- layouts */

export function editLayout(id) {
  ed.layoutId = id || (currentSlide() || {}).layout;
  ed.picked = [];
  repaint();
}

/* ------------------------------------------------------- editing elements */
//
// One path in and out. Where a change lands depends on what is being edited:
// the layout itself, an element a slide added of its own, or a layout element
// a slide is differing from.

function targetOf(id) {
  const d = deck();
  if (ed.layoutId) {
    const layout = layoutOf(d, ed.layoutId);
    const el = layout && layout.elements.find((e) => e.id === id);
    return el ? { where: 'layout', el } : null;
  }
  const slide = currentSlide();
  if (!slide) return null;
  const extra = (slide.extras || []).find((e) => e.id === id);
  if (extra) return { where: 'extra', el: extra, slide };
  const layout = layoutOf(d, slide.layout);
  const el = layout && layout.elements.find((e) => e.id === id);
  return el ? { where: 'override', el, slide } : null;
}

/**
 * Change one element.
 * @param what 'style' | 'content' | 'geometry' | 'name'
 */
function editElement(id, what, patch) {
  const target = targetOf(id);
  if (!target) return;
  if (target.where === 'layout' || target.where === 'extra') {
    const el = target.el;
    if (what === 'name') el.name = patch;
    else if (what === 'geometry') Object.assign(el, patch);
    else el[what] = { ...(el[what] || {}), ...patch };
    return;
  }
  // A layout element on a slide: record the difference, not the value.
  const slide = target.slide;
  const ov = slide.overrides[id] || (slide.overrides[id] = {});
  if (what === 'name') ov.name = patch;
  else if (what === 'geometry') ov.geometry = { ...(ov.geometry || {}), ...patch };
  else ov[what] = { ...(ov[what] || {}), ...patch };
}

function editSelected(what, patch) {
  if (!ed.picked.length) return;
  for (const id of ed.picked) editElement(id, what, patch);
  pushUndo(what === 'content' ? 'Edit' : what === 'geometry' ? 'Move' : 'Restyle');
  markDirty();
  refresh();
}

function backToLayout(id) {
  const slide = currentSlide();
  if (!slide || !slide.overrides[id]) return;
  delete slide.overrides[id];
  pushUndo('Back to layout');
  markDirty();
  refresh();
}

/** The canvas hands geometry back during a drag, then once more at the end. */
function applyGeometry(changes, { final }) {
  if (changes) {
    for (const g of changes) editElement(g.id, 'geometry', { x: g.x, y: g.y, w: g.w, h: g.h });
    if (ed.canvas) ed.canvas.renderNow();
  }
  if (final) {
    pushUndo('Move');
    markDirty();
    refresh();
  }
}

function editInPlace(el) {
  if (el.type !== 'text' && el.type !== 'code' && el.type !== 'reference') {
    if (el.type === 'image') return elementCommand('chooseImage', el.id);
    return;
  }
  const key = el.type === 'code' ? 'code' : 'text';
  ed.canvas.select([el.id]);
  ed.canvas.editInline(el, (el.content || {})[key] || '', (value) => {
    editElement(el.id, 'content', { [key]: value });
    ed.canvas.renderNow();
  }, () => {
    pushUndo('Edit the words');
    markDirty();
    refresh();
  });
}

/* ------------------------------------------------------ element commands */

function elementCommand(name, arg) {
  switch (name) {
    case 'order': return reorderElements(arg);
    case 'align': return alignSelection(arg);
    case 'distribute': return distribute(arg);
    case 'center': return centreOnSlide();
    case 'chooseImage': return chooseImage(arg);
    case 'pasteTable': return pasteTableInto(arg);
    case 'insertField': return insertFieldToken();
    case 'insertReference': return insertReferenceToken();
    default: return undefined;
  }
}

function listFor(mutate) {
  const d = deck();
  if (ed.layoutId) {
    const layout = layoutOf(d, ed.layoutId);
    if (layout) mutate(layout.elements, (next) => { layout.elements = next; });
    return;
  }
  const slide = currentSlide();
  if (slide) mutate(slide.extras, (next) => { slide.extras = next; });
}

function reorderElements(where) {
  listFor((list, set) => {
    const picked = new Set(ed.picked);
    const moving = list.filter((e) => picked.has(e.id));
    if (!moving.length) {
      toast('That comes from the layout', 'Order is the layout’s to decide. Edit the layout to change it.', 'warn');
      return;
    }
    const rest = list.filter((e) => !picked.has(e.id));
    set(where === 'front' ? [...rest, ...moving] : [...moving, ...rest]);
  });
  pushUndo('Reorder');
  markDirty();
  refresh();
}

function alignSelection(how) {
  const els = shownElements().filter((e) => ed.picked.includes(e.id));
  if (els.length < 2) return;
  const x = Math.min(...els.map((e) => e.x));
  const right = Math.max(...els.map((e) => e.x + e.w));
  const y = Math.min(...els.map((e) => e.y));
  const bottom = Math.max(...els.map((e) => e.y + e.h));
  for (const el of els) {
    if (how === 'left') editElement(el.id, 'geometry', { x });
    if (how === 'right') editElement(el.id, 'geometry', { x: right - el.w });
    if (how === 'center') editElement(el.id, 'geometry', { x: (x + right) / 2 - el.w / 2 });
    if (how === 'top') editElement(el.id, 'geometry', { y });
    if (how === 'bottom') editElement(el.id, 'geometry', { y: bottom - el.h });
    if (how === 'middle') editElement(el.id, 'geometry', { y: (y + bottom) / 2 - el.h / 2 });
  }
  pushUndo('Align');
  markDirty();
  refresh();
}

function distribute(axis) {
  const els = shownElements().filter((e) => ed.picked.includes(e.id))
    .sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  if (els.length < 3) return;
  const size = (e) => (axis === 'x' ? e.w : e.h);
  const at = (e) => (axis === 'x' ? e.x : e.y);
  const span = at(els[els.length - 1]) + size(els[els.length - 1]) - at(els[0]);
  const used = els.reduce((n, e) => n + size(e), 0);
  const gap = (span - used) / (els.length - 1);
  let cursor = at(els[0]);
  for (const el of els) {
    editElement(el.id, 'geometry', axis === 'x' ? { x: Math.round(cursor * 10) / 10 } : { y: Math.round(cursor * 10) / 10 });
    cursor += size(el) + gap;
  }
  pushUndo('Space evenly');
  markDirty();
  refresh();
}

function centreOnSlide() {
  const d = deck();
  for (const el of shownElements().filter((e) => ed.picked.includes(e.id))) {
    editElement(el.id, 'geometry', { x: Math.round((d.size.width - el.w) / 2), y: Math.round((d.size.height - el.h) / 2) });
  }
  pushUndo('Centre');
  markDirty();
  refresh();
}

/* ------------------------------------------------------ inserting things */

export function insertElement(spec, pt) {
  const d = deck();
  const el = makeElement(spec.type, 0, 0, spec.preset);
  if (spec.style) el.style = { ...el.style, ...spec.style };
  if (spec.content) el.content = { ...el.content, ...spec.content };
  if (spec.name) el.name = spec.name;
  el.x = Math.round(pt ? pt.x - el.w / 2 : (d.size.width - el.w) / 2);
  el.y = Math.round(pt ? pt.y - el.h / 2 : (d.size.height - el.h) / 2);
  el.x = Math.max(0, Math.min(d.size.width - el.w, el.x));
  el.y = Math.max(0, Math.min(d.size.height - el.h, el.y));
  listFor((list) => list.push(el));
  pushUndo('Insert ' + (ELEMENT_TYPES[spec.type] || {}).label);
  ed.picked = [el.id];
  markDirty();
  refresh();
  if (ed.canvas) ed.canvas.select([el.id], true);
  paintInspectorNow();
}

async function insertFieldToken() {
  const choice = await pickFrom('Insert a field', 'A field is worked out from the deck, never typed.',
    Object.entries(FIELD_KINDS).map(([id, f]) => [id, f.label, f.text]));
  if (!choice) return;
  appendToText(FIELD_KINDS[choice].text);
}

async function insertReferenceToken() {
  const d = deck();
  const nums = numbering(d);
  const choice = await pickFrom('Refer to a slide', 'It remembers the slide, not its number, so reordering the deck keeps it right.',
    d.slides.filter((s) => s.id !== ed.current).map((s) => [s.id, (nums.numberOf(s.id) == null ? '–' : nums.numberOf(s.id)) + '. ' + (slideTitle(d, s) || 'Untitled'), 'slide {ref}']));
  if (!choice) return;
  appendToText('{ref:' + choice + '}');
}

function appendToText(token) {
  const el = shownElements().find((e) => e.id === ed.picked[0]);
  if (!el || (el.type !== 'text' && el.type !== 'field')) return;
  editElement(el.id, 'content', { text: ((el.content || {}).text || '') + (el.content.text ? ' ' : '') + token });
  pushUndo('Insert a field');
  markDirty();
  refresh();
}

function pickFrom(title, subtitle, options) {
  return new Promise((resolve) => {
    openModal({
      title, subtitle, size: 'narrow',
      body: h('div.pick-list', options.map(([id, label, hint]) => h('button.starter', {
        onclick: (e) => { e.target.closest('.overlay').remove(); resolve(id); },
      }, [h('div.starter-name', label), hint ? h('div.starter-why', hint) : null]))),
      footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Cancel')],
      onClose: () => resolve(null),
    });
  });
}

async function pasteTableInto(id) {
  const text = await promptDialog({
    title: 'Paste a block from a spreadsheet',
    label: 'Paste it here',
    hint: 'Rows separated by lines, cells by tabs or commas. The first row names the columns.',
    confirmLabel: 'Use it',
  });
  if (!text) return;
  const el = shownElements().find((e) => e.id === id);
  if (!el) return;
  if (el.type === 'table') {
    const rows = text.replace(/\r\n?/g, '\n').split('\n').filter((r) => r.trim()).map((r) => r.split(r.includes('\t') ? '\t' : ',').map((c) => c.trim()));
    editElement(id, 'content', { rows });
  } else {
    const data = parseTable(text);
    if (!data) return toast('That did not look like a table', 'Rows on lines, cells split by tabs or commas.', 'warn');
    editElement(id, 'content', { data });
  }
  pushUndo('Paste a table');
  markDirty();
  refresh();
  return undefined;
}

/* -------------------------------------------------------------- pictures */

function chooseImage(id) {
  const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    if (input.files && input.files[0]) await putImage(input.files[0], id);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

async function dropFiles(files, pt, over) {
  const image = files.find((f) => /^image\//.test(f.type));
  if (!image) return;
  if (over && over.type === 'image') return putImage(image, over.id);
  // Onto blank slide: a new picture element where it was dropped.
  const asset = await uploadImage(image);
  if (!asset) return;
  const ratio = asset.width / asset.height;
  const w = Math.min(deck().size.width * 0.5, 420);
  insertElement({ type: 'image', content: { asset: asset.id }, style: { fit: 'cover' } }, pt);
  const el = shownElements().find((e) => e.id === ed.picked[0]);
  if (el) {
    editElement(el.id, 'geometry', { w: Math.round(w), h: Math.round(w / ratio) });
    markDirty();
    refresh();
  }
  return undefined;
}

async function putImage(file, id) {
  const asset = await uploadImage(file);
  if (!asset) return;
  editElement(id, 'content', { asset: asset.id });
  pushUndo('Put a picture in');
  markDirty();
  refresh();
}

async function uploadImage(file) {
  try {
    const blob = /^image\/(png|jpeg)$/.test(file.type) ? file : await convertToPng(file);
    const asset = await api.uploadAsset(app.open.record.id, blob, file.name);
    app.open.assets[asset.id] = asset;
    return asset;
  } catch (e) {
    toast('Could not add that picture', e.message, 'bad');
    return null;
  }
}

/** A picture that is not already PNG or JPEG becomes a PNG, in the browser. */
function convertToPng(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('it could not be converted'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('it could not be read')); };
    img.src = url;
  });
}

/* ----------------------------------------------------- copy and paste */

function copySelection(cut) {
  const els = shownElements().filter((e) => ed.picked.includes(e.id));
  if (els.length) {
    clipboard = { kind: 'elements', items: clone(els) };
    if (cut) deleteSelection();
    return;
  }
  const d = deck();
  clipboard = { kind: 'slides', items: clone(d.slides.filter((s) => ed.selection.includes(s.id))), layouts: clone(d.layouts) };
  if (cut) deleteCurrent();
}

function pasteClipboard() {
  if (!clipboard) return;
  const d = deck();
  if (clipboard.kind === 'elements') {
    const made = clipboard.items.map((el) => ({ ...clone(el), id: newId(), x: el.x + 12, y: el.y + 12, fromLayout: undefined }));
    listFor((list) => list.push(...made));
    pushUndo('Paste');
    ed.picked = made.map((e) => e.id);
    markDirty();
    refresh();
    if (ed.canvas) ed.canvas.select(ed.picked, true);
    return;
  }
  // Slides carry their layout with them: a slide pasted from another deck
  // would otherwise point at a layout that is not here.
  const copies = clipboard.items.map((slide) => {
    const next = { ...clone(slide), id: newId('sl'), extras: (slide.extras || []).map((e) => ({ ...clone(e), id: newId() })) };
    if (!d.layouts.some((l) => l.id === next.layout)) {
      const source = (clipboard.layouts || []).find((l) => l.id === next.layout);
      if (source) d.layouts = [...d.layouts, clone(source)];
      else next.layout = d.layouts[0].id;
    }
    if (next.sectionId && !d.sections.some((s) => s.id === next.sectionId)) next.sectionId = null;
    return next;
  });
  const at = ed.current ? d.slides.findIndex((s) => s.id === ed.current) + 1 : d.slides.length;
  d.slides = insertSlides(d, copies, at);
  pushUndo('Paste slides');
  ed.selection = copies.map((s) => s.id);
  ed.current = copies[0].id;
  markDirty();
  repaint();
}

function deleteSelection() {
  if (!ed.picked.length) return deleteCurrent();
  const slide = currentSlide();
  const picked = new Set(ed.picked);
  let hid = 0;
  listFor((list, set) => set(list.filter((e) => !picked.has(e.id))));
  // An element that comes from the layout is not deleted from this slide; it
  // is hidden on it, which every other slide with that layout ignores.
  if (slide && !ed.layoutId) {
    for (const id of ed.picked) {
      if ((slide.extras || []).some((e) => e.id === id)) continue;
      slide.overrides[id] = { ...(slide.overrides[id] || {}), hidden: true };
      hid++;
    }
  }
  pushUndo('Delete');
  ed.picked = [];
  markDirty();
  refresh();
  repaint();
  if (hid) toast('Hidden on this slide', hid === 1 ? 'It comes from the layout, so it is hidden here rather than deleted. Every other slide keeps it.' : 'They come from the layout, so they are hidden here rather than deleted.', '', 5000);
  return undefined;
}

function nudge(dx, dy) {
  if (!ed.picked.length) return;
  for (const el of shownElements().filter((e) => ed.picked.includes(e.id))) {
    editElement(el.id, 'geometry', { x: Math.round((el.x + dx) * 10) / 10, y: Math.round((el.y + dy) * 10) / 10 });
  }
  pushUndo('Nudge');
  markDirty();
  refresh();
}

function contextMenu(e, el) {
  const items = el ? [
    ['Bring to front', 'bringFront', () => reorderElements('front')],
    ['Send to back', 'sendBack', () => reorderElements('back')],
    ['Duplicate', 'copy', () => { copySelection(false); pasteClipboard(); }],
    ['Delete', 'trash', deleteSelection],
  ] : [
    ['Text', 'text', () => insertElement({ type: 'text', preset: 'body' }, lastPoint(e))],
    ['Picture', 'image', () => insertElement({ type: 'image' }, lastPoint(e))],
    ['Shape', 'shapes', () => insertElement({ type: 'shape' }, lastPoint(e))],
    ['Paste', 'copy', pasteClipboard],
  ];
  showMenu(items, e);
}

function lastPoint(e) {
  const overlay = document.querySelector('.slide-overlay');
  if (!overlay) return null;
  const r = overlay.getBoundingClientRect();
  return { x: (e.clientX - r.left) / ed.zoom, y: (e.clientY - r.top) / ed.zoom };
}

/* ----------------------------------------------------------------- undo */
//
// The whole deck, before and after. A deck is small - a few hundred kilobytes
// of JSON at worst - and one snapshot per edit is both simpler and more
// trustworthy than a list of reversible operations, because there is no
// operation anybody can forget to write the reverse of. Undo is unlimited:
// the stack is bounded only by what a session does.

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
  restoreDeck(entry.json);
  toast('Undone', entry.what, '', 1600);
}

export function redo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  undoStack.push({ what: entry.what, json: JSON.stringify(deck()) });
  restoreDeck(entry.json);
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function restoreDeck(json) {
  app.open.working.deck = JSON.parse(json);
  lastSnapshot = json;
  const d = deck();
  // A slide the undo brought back, or took away, must not leave the editor
  // pointing at nothing.
  const ids = new Set(d.slides.map((s) => s.id));
  ed.selection = ed.selection.filter((id) => ids.has(id));
  if (!ids.has(ed.current)) ed.current = d.slides.length ? d.slides[0].id : null;
  if (!ed.selection.length && ed.current) ed.selection = [ed.current];
  if (ed.layoutId && !layoutOf(d, ed.layoutId)) ed.layoutId = null;
  markDirty();
  render();
  // Whatever was selected before the undo is selected after it, as long as it
  // is still there: an undo that also deselects makes you find your place
  // again every time.
  const here = new Set(shownElements().map((x) => x.id));
  ed.picked = ed.picked.filter((id) => here.has(id));
  if (ed.canvas) ed.canvas.select(ed.picked, true);
  paintInspectorNow();
}

/* ------------------------------------------------------------- keyboard */

let keysInstalled = false;

function installKeyboard() {
  if (keysInstalled) return;
  keysInstalled = true;
  document.addEventListener('keydown', (e) => {
    if (app.view !== 'editor') return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); return openCommands(); }
    if (typing) return;
    if (document.querySelector('.overlay')) return;

    if (ctrl) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (k === 'y') { e.preventDefault(); return redo(); }
      if (k === 'c') { e.preventDefault(); return copySelection(false); }
      if (k === 'x') { e.preventDefault(); return copySelection(true); }
      if (k === 'v') { e.preventDefault(); return pasteClipboard(); }
      if (k === 'd') { e.preventDefault(); return ed.picked.length ? (copySelection(false), pasteClipboard()) : duplicateCurrent(); }
      if (k === 'm') { e.preventDefault(); return addSlide(); }
      if (k === 'a') { e.preventDefault(); ed.picked = shownElements().map((x) => x.id); ed.canvas.select(ed.picked); return paintInspectorNow(); }
      if (k === ']') { e.preventDefault(); return reorderElements('front'); }
      if (k === '[') { e.preventDefault(); return reorderElements('back'); }
      if (k === '=' || k === '+') { e.preventDefault(); return ed.canvas.setZoom(ed.zoom * 1.2); }
      if (k === '-') { e.preventDefault(); return ed.canvas.setZoom(ed.zoom / 1.2); }
      if (k === '0') { e.preventDefault(); return ed.canvas.setZoom('fit'); }
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); return deleteSelection();
      case 'Escape': ed.picked = []; ed.canvas.select([]); return paintInspectorNow();
      case 'Enter': {
        const el = shownElements().find((x) => x.id === ed.picked[0]);
        if (el) { e.preventDefault(); editInPlace(el); }
        return undefined;
      }
      case 'ArrowUp': if (ed.picked.length) { e.preventDefault(); return nudge(0, -step); } e.preventDefault(); return step === 1 ? move(-1) : undefined;
      case 'ArrowDown': if (ed.picked.length) { e.preventDefault(); return nudge(0, step); } e.preventDefault(); return step === 1 ? move(1) : undefined;
      case 'ArrowLeft': if (ed.picked.length) { e.preventDefault(); return nudge(-step, 0); } e.preventDefault(); return move(-1);
      case 'ArrowRight': if (ed.picked.length) { e.preventDefault(); return nudge(step, 0); } e.preventDefault(); return move(1);
      case 'PageUp': e.preventDefault(); return move(-1);
      case 'PageDown': e.preventDefault(); return move(1);
      default: return undefined;
    }
  });
}

/** The slide before or after this one. */
function move(by) {
  const d = deck();
  const i = d.slides.findIndex((s) => s.id === ed.current);
  const next = d.slides[Math.max(0, Math.min(d.slides.length - 1, i + by))];
  if (next && next.id !== ed.current) goToSlide(next.id);
}

/** Move the selected slides up or down the deck by one. */
export function moveSlideBy(by) {
  const d = deck();
  const i = d.slides.findIndex((s) => s.id === ed.selection[0]);
  reorder(ed.selection, Math.max(0, Math.min(d.slides.length, i + (by > 0 ? ed.selection.length + 1 : by))), undefined);
}

/* --------------------------------------------------------------- ribbon */

const INSERT_ITEMS = [
  ['Title', 'text', { type: 'text', preset: 'title' }],
  ['Heading', 'text', { type: 'text', preset: 'heading' }],
  ['Body text', 'text', { type: 'text', preset: 'body' }],
  ['Bullets', 'bullets', { type: 'text', preset: 'bullets' }],
  ['Quote', 'quote', { type: 'text', preset: 'quote' }],
  ['Picture', 'image', { type: 'image' }],
  ['Icon', 'sparkles', { type: 'icon' }],
  ['Chart', 'chartBar', { type: 'chart', preset: 'bar' }],
  ['Table', 'table', { type: 'table' }],
  ['Code', 'code', { type: 'code' }],
  ['Big number', 'target', { type: 'stat' }],
  ['Shape', 'shapes', { type: 'shape' }],
  ['Line', 'trendUp', { type: 'line' }],
  ['Graphic', 'pattern', { type: 'pattern' }],
  ['Slide number', 'hash', { type: 'field', preset: 'number' }],
  ['Reference', 'reference', { type: 'reference' }],
  ['Agenda', 'agenda', { type: 'agenda' }],
];

function insertButton([label, ic, spec]) {
  const btn = ribBtn(label, ic, () => insertElement(spec, null), { small: true });
  btn.draggable = true;
  btn.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-slidex-insert', JSON.stringify(spec));
  });
  btn.title = 'Click to put it in the middle, or drag it where it should go';
  return btn;
}

export function editorRibbon() {
  const d = deck();
  return {
    home: [
      ribGroup('Slides', [
        ribBtn('New slide', 'plus', () => addSlide()),
        ribBtn('Duplicate', 'copy', duplicateCurrent, { small: true }),
        ribBtn('Delete', 'trash', deleteCurrent, { small: true }),
        ribBtn('Hide', 'eyeOff', toggleHidden, { small: true }),
      ]),
      ribGroup('Sections', [
        ribBtn('New section', 'folder', addSection, { small: true }),
        ribBtn('Move up', 'arrowUp', () => moveSlideBy(-1), { small: true }),
        ribBtn('Move down', 'arrowDown', () => moveSlideBy(1), { small: true }),
      ]),
      ribGroup('Undo', [
        ribBtn('Undo', 'undo', undo, { small: true, disabled: !canUndo() }),
        ribBtn('Redo', 'redo', redo, { small: true, disabled: !canRedo() }),
      ]),
      ribGroup('Find', [
        ribBtn('Commands', 'search', () => openCommands(), { small: true, title: 'Ctrl+K' }),
      ]),
    ],
    insert: [
      ribGroup('Words', INSERT_ITEMS.slice(0, 5).map(insertButton)),
      ribGroup('Things', INSERT_ITEMS.slice(5, 14).map(insertButton)),
      ribGroup('Fields', INSERT_ITEMS.slice(14).map(insertButton)),
    ],
    design: [
      ribGroup('Generate', [
        ribBtn('A layout for this slide', 'dice', generateForSlide, { title: 'Six layouts at a time, in this deck\u2019s colours' }),
        ribBtn('A style for the deck', 'shuffle', generateStyle, { small: true }),
      ]),
      ribGroup('Layouts', [
        ribBtn('Edit the layout', 'layout', () => editLayout(), { small: true }),
        ribBtn('Change layout', 'replace', chooseLayout, { small: true }),
      ]),
      ribGroup('Look', [
        ribBtn('Palette', 'palette', choosePalette, { small: true }),
        ribBtn('Fonts', 'text', chooseFonts, { small: true }),
        ribBtn('Shape', 'columns', chooseAspect, { small: true }),
        ribBtn('Deck settings', 'gear', deckSettings, { small: true }),
      ]),
      ribGroup('Graphics', [
        ribBtn('Shuffle all', 'shuffle', shuffleAll, { small: true, title: 'A new seed for every generated graphic on this slide' }),
      ]),
    ],
    present: [ribGroup('Present', [ribBtn('From the start', 'play', () => {}, { disabled: true })])],
    share: [ribGroup('Share', [ribBtn('Push', 'upload', () => {}, { disabled: true })])],
  };
}

/* ------------------------------------------------------------ the design */

function chooseLayout() {
  const d = deck();
  const slide = currentSlide();
  if (!slide) return;
  openModal({
    title: 'Which layout?',
    subtitle: 'What this slide has written stays where its name matches.',
    body: h('div.layout-grid', d.layouts.map((l) => h('button.layout-card' + (l.id === slide.layout ? '.on' : ''), {
      onclick: (e) => {
        e.target.closest('.overlay').remove();
        slide.layout = l.id;
        pushUndo('Change the layout');
        markDirty();
        repaint();
      },
    }, [
      thumb(resolveLayout(d, l), slideContext(d, slide), (sha) => api.assetUrl(app.open.record.id, sha)),
      h('div.layout-name', l.name),
      h('div.layout-why', (LAYOUT_KINDS[l.kind] || {}).hint || ''),
    ]))),
    footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Cancel')],
  });
}

function choosePalette() {
  import('../shared/color.js').then(({ PALETTES, completePalette }) => {
    const d = deck();
    openModal({
      title: 'Colours',
      subtitle: 'Elements name their colours by role, so this recolours every slide, chart and graphic at once.',
      size: 'narrow',
      body: h('div.palette-list', Object.entries(PALETTES).map(([id, p]) => h('button.palette-row' + (p.name === d.palette.name ? '.on' : ''), {
        onclick: (e) => {
          e.target.closest('.overlay').remove();
          d.palette = completePalette(p);
          pushUndo('Change the colours');
          markDirty();
          repaint();
        },
      }, [
        h('div.palette-swatches', ['primary', 'secondary', 'accent', 'highlight', 'tint'].map((role) => {
          const sw = h('span.swatch-mini');
          sw.style.background = p[role];
          return sw;
        })),
        h('span.palette-name', p.name),
      ]))),
      footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Cancel')],
    });
  });
}

/** Six generated layouts for this slide, then six more. */
function generateForSlide() {
  const d = deck();
  const slide = currentSlide();
  if (!slide) return;
  openSlideLayouts({
    deck: d,
    slide,
    assets: app.open.assets,
    assetUrl: (sha) => api.assetUrl(app.open.record.id, sha),
    onUse: (layout) => {
      // The layout joins the deck, and what this slide has written moves to the
      // element of the same name on it.
      const next = { ...d, layouts: [...d.layouts, layout] };
      const { slides } = rebaseSlides(d, next, [slide]);
      const moved = { ...slides[0], layout: layout.id };
      d.layouts = next.layouts;
      d.slides = d.slides.map((s) => (s.id === slide.id ? moved : s));
      ed.current = moved.id;
      ed.selection = [moved.id];
      pushUndo('Generate a layout');
      markDirty();
      repaint();
    },
  });
  return undefined;
}

/** A whole new generated style for the deck, told first what will move. */
function generateStyle() {
  const d = deck();
  restyleDeck(d, {
    onApply: (next) => {
      Object.assign(d, { layouts: next.layouts, palette: next.palette, fonts: next.fonts, slides: next.slides });
      ed.picked = [];
      ed.layoutId = null;
      pushUndo('A new style for the deck');
      markDirty();
      repaint();
    },
  });
}

function chooseFonts() {
  const d = deck();
  const now = d.fonts || { heading: 'sans', body: 'sans' };
  openModal({
    title: 'Fonts',
    subtitle: 'Three faces, and the PDF names them Helvetica, Times and Courier - the ones every reader already has, so the screen and the file cannot disagree.',
    size: 'narrow',
    body: h('div.starter-list', FONT_PAIRINGS.map((p) => h('button.starter' + (p.heading === now.heading && p.body === now.body ? '.on' : ''), {
      onclick: (e) => {
        e.target.closest('.overlay').remove();
        applyFonts(d, p);
        pushUndo('Change the fonts');
        markDirty();
        repaint();
      },
    }, [h('div.starter-name', p.label), h('div.starter-why', p.why)]))),
    footer: (c) => [h('button.btn', { onclick: () => c.close() }, 'Cancel')],
  });
}

async function chooseAspect() {
  const d = deck();
  const other = d.aspect === 'wide' ? 'standard' : 'wide';
  const yes = await confirmDialog({
    title: 'Change the slide shape to ' + ASPECTS[other].ratio + '?',
    message: 'Everything keeps its place in points, so things on the right of a widescreen slide will hang off a 4:3 one until they are moved. The check panel lists whatever ends up off the slide.',
    confirmLabel: 'Change it',
  });
  if (!yes) return;
  d.aspect = other;
  d.size = { width: ASPECTS[other].width, height: ASPECTS[other].height };
  pushUndo('Change the slide shape');
  markDirty();
  repaint();
}

function deckSettings() {
  const d = deck();
  openModal({
    title: 'Deck settings', size: 'narrow',
    body: h('div', [
      h('div.field', [
        h('label', 'Footer'),
        h('input.input', { value: d.options.footer || '', placeholder: 'Company · Confidential', onchange: (e) => { d.options.footer = e.target.value; pushUndo('Footer'); markDirty(); refresh(); } }),
        h('div.hint', 'What every {footer} field on every slide says.'),
      ]),
      h('div.field', [
        h('label', 'Hidden slides'),
        h('div.seg', [['skip', 'Skip them in the numbering'], ['keep', 'Keep them in it']].map(([v, label]) => h('button' + ((d.options.numberHidden || 'skip') === v ? '.on' : ''), {
          onclick: (e) => {
            d.options.numberHidden = v;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
            pushUndo('Numbering');
            markDirty();
            repaint();
          },
        }, label))),
        h('div.hint', 'Skipping means the audience sees 1, 2, 3 with no gaps. Keeping them in suits a deck whose hidden slides are backup material people still cite by number.'),
      ]),
      h('div.field', [
        h('label', 'The first slide is number'),
        h('input.input', { type: 'number', value: d.options.startNumber == null ? 1 : d.options.startNumber, onchange: (e) => { d.options.startNumber = Math.max(0, Number(e.target.value) || 0); pushUndo('Numbering'); markDirty(); repaint(); } }),
      ]),
      h('div.field', [
        h('label', 'Transition'),
        h('div.seg', [['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide']].map(([v, label]) => h('button' + ((d.options.transition || 'none') === v ? '.on' : ''), {
          onclick: (e) => {
            d.options.transition = v;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
            pushUndo('Transition');
            markDirty();
          },
        }, label))),
        h('div.hint', 'A slide can choose its own. Anything showier than these is a distraction from what is on the slide; a machine asking for less motion gets none at all.'),
      ]),
    ]),
    footer: (c) => [h('button.btn.primary', { onclick: () => c.close() }, 'Done')],
  });
}

function shuffleAll() {
  import('../shared/patterns.js').then(({ newSeed }) => {
    let n = 0;
    for (const el of shownElements()) {
      if (el.type !== 'pattern') continue;
      editElement(el.id, 'content', { seed: newSeed() });
      n++;
    }
    if (!n) return toast('No generated graphics here', 'Insert one from the Insert tab.', '', 3000);
    pushUndo('Shuffle');
    markDirty();
    refresh();
    return undefined;
  });
}

/* ------------------------------------------------------------- statusbar */

export function editorStatus() {
  const d = deck();
  if (!d) return [];
  const nums = numbering(d);
  const slide = currentSlide();
  return [
    h('span.dim', slide ? 'Slide ' + (nums.numberOf(slide.id) || '–') + ' of ' + nums.total : ''),
    h('span.dim', ASPECTS[d.aspect] ? ASPECTS[d.aspect].ratio : d.aspect),
    h('button.status-btn', { onclick: () => ed.canvas.setZoom('fit'), title: 'Fit the slide to the window (Ctrl+0)' }, Math.round(ed.zoom * 100) + '%'),
  ];
}

function paintStatus() {
  const bar = document.querySelector('.statusbar .status-btn');
  if (bar) bar.textContent = Math.round(ed.zoom * 100) + '%';
}

/* --------------------------------------------------- the command palette */

// Everything on the ribbon, by name, so nobody has to know which tab it is on.
provideCommands(() => {
  const d = deck();
  if (!d || app.view !== 'editor') return [];
  const group = 'Do';
  const cmd = (label, ic, run, keys) => ({ label, ic, run, group, keys });
  return [
    cmd('New slide', 'plus', () => addSlide(), 'Ctrl+M'),
    cmd('Duplicate this slide', 'copy', duplicateCurrent, 'Ctrl+D'),
    cmd('Delete this slide', 'trash', deleteCurrent),
    cmd('Hide this slide when presenting', 'eyeOff', toggleHidden),
    cmd('New section', 'folder', addSection),
    cmd('Move this slide up', 'arrowUp', () => moveSlideBy(-1)),
    cmd('Move this slide down', 'arrowDown', () => moveSlideBy(1)),
    cmd('Undo', 'undo', undo, 'Ctrl+Z'),
    cmd('Redo', 'redo', redo, 'Ctrl+Y'),
    cmd('Edit this slide\u2019s layout', 'layout', () => editLayout()),
    cmd('Change this slide\u2019s layout', 'replace', chooseLayout),
    cmd('Change the colours', 'palette', choosePalette),
    cmd('Change the fonts', 'text', chooseFonts),
    cmd('Generate a layout for this slide', 'dice', generateForSlide),
    cmd('Generate a new style for the deck', 'shuffle', generateStyle),
    cmd('Change the slide shape', 'columns', chooseAspect),
    cmd('Deck settings', 'gear', deckSettings),
    cmd('Shuffle the generated graphics', 'shuffle', shuffleAll),
    cmd('Fit the slide to the window', 'maximize', () => ed.canvas.setZoom('fit'), 'Ctrl+0'),
    ...INSERT_ITEMS.map(([label, ic, spec]) => ({ label: 'Insert ' + label.toLowerCase(), ic, group: 'Insert', run: () => insertElement(spec, null) })),
  ];
});

export { currentSlide, shownElements, refresh, paintInspectorNow, copySelection, pasteClipboard, deleteSelection };
