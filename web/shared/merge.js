// Merging two people's work on the same deck, and saying what changed.
//
// Copied from Newsx (web/shared/merge.js), which merges newsletters; nothing in
// it knows what it is merging.
//
// A deck is JSON - layouts, slides, sections - and almost all of it is lists of
// things with ids. So a merge is a three-way merge of JSON in which a list with
// ids is merged item by item rather than as one value. Two people who changed
// different slides, or different words on different slides, merge without a
// question. Only when both changed the same property of the same thing - the
// same heading, the same chart's data - is a conflict raised, for that property
// alone, and shown side by side for somebody to choose.
//
// Shared with the editor so the pull preview can draw the merged slides itself.

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null && a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

const keyed = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => isObj(x) && typeof x.id === 'string');

function keyedMerge(...sides) {
  const arrays = sides.filter((s) => Array.isArray(s));
  if (!arrays.length || arrays.length !== sides.filter((s) => s !== undefined).length) return false;
  const nonEmpty = arrays.filter((a) => a.length);
  return nonEmpty.length > 0 && nonEmpty.every(keyed);
}

/** A path as a string a resolution can be looked up by. */
export const pathKey = (path) => path.map((p) => (typeof p === 'object' ? '#' + p.id : p)).join('/');

/**
 * @param resolutions {pathKey: 'ours'|'theirs'}
 * @returns {value, conflicts: [{key, path, base, ours, theirs}]}
 */
export function merge3(base, ours, theirs, resolutions = {}) {
  const conflicts = [];
  const value = mergeValue(base, ours, theirs, [], conflicts, resolutions);
  return { value, conflicts };
}

function mergeValue(base, ours, theirs, path, conflicts, resolutions) {
  if (deepEqual(ours, theirs)) return ours;
  if (deepEqual(base, ours)) return theirs;
  if (deepEqual(base, theirs)) return ours;
  if (keyedMerge(base, ours, theirs) && Array.isArray(ours) && Array.isArray(theirs)) {
    return mergeList(Array.isArray(base) ? base : [], ours, theirs, path, conflicts, resolutions);
  }
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    const keys = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])];
    for (const k of keys) {
      const v = mergeValue(b[k], ours[k], theirs[k], path.concat(k), conflicts, resolutions);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  const key = pathKey(path);
  conflicts.push({ key, path, base, ours, theirs });
  return resolutions[key] === 'theirs' ? theirs : ours;
}

function mergeList(base, ours, theirs, path, conflicts, resolutions) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const b = byId(base), o = byId(ours), t = byId(theirs);
  const ids = (list) => list.map((x) => x.id);
  // Whoever changed the order decides it; if both did, ours stands.
  const skeleton = deepEqual(ids(base), ids(ours)) ? ids(theirs) : ids(ours);
  const order = skeleton.slice();
  const place = (id, list) => {
    if (order.includes(id)) return;
    const at = ids(list).indexOf(id);
    for (let i = at - 1; i >= 0; i--) {
      const prev = list[i].id;
      const pos = order.indexOf(prev);
      if (pos >= 0) { order.splice(pos + 1, 0, id); return; }
    }
    order.unshift(id);
  };
  for (const x of ours) place(x.id, ours);
  for (const x of theirs) place(x.id, theirs);
  const out = [];
  for (const id of order) {
    const v = mergeValue(b.get(id), o.get(id), t.get(id), path.concat({ id }), conflicts, resolutions);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/* --------------------------------------------------------- describing */

const snip = (s, n = 90) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export const elementLabel = (el) => (el && (el.name || el.type)) || 'an element';

function listDiff(before = [], after = []) {
  const b = new Map(before.map((x) => [x.id, x]));
  const a = new Map(after.map((x) => [x.id, x]));
  return {
    added: after.filter((x) => !b.has(x.id)),
    removed: before.filter((x) => !a.has(x.id)),
    both: after.filter((x) => b.has(x.id)).map((x) => [b.get(x.id), x]),
  };
}

/**
 * Where a slide is, said the way somebody would say it: by its number now, and
 * by its title. The number is worked out from the order in the state being
 * described - never read off the slide - so a sentence about slide 7 means the
 * seventh slide of that state.
 */
function slideWhere(deck, slide) {
  const order = (deck.slides || []).findIndex((s) => s.id === slide.id);
  const n = order < 0 ? null : (deck.slides || []).slice(0, order + 1).filter((s) => !s.hidden).length;
  const layout = (deck.layouts || []).find((l) => l.id === slide.layout);
  const name = layout ? layout.name : 'a slide';
  return (n ? 'Slide ' + n : 'A slide') + ' \u00b7 ' + name;
}

/**
 * What changed between two decks, in sentences.
 * @returns [{scope: 'deck'|'layout'|'slide', slideId, layoutId, elementId, what, detail, before, after}]
 */
export function describeChanges(before, after) {
  const out = [];
  const bd = before || { layouts: [], slides: [], sections: [] };
  const ad = after || { layouts: [], slides: [], sections: [] };
  const push = (c) => out.push(c);

  if (bd.title !== ad.title && bd.title != null) push({ scope: 'deck', what: 'Renamed the deck', detail: '\u201c' + ad.title + '\u201d' });
  if (!deepEqual(bd.palette, ad.palette)) push({ scope: 'deck', what: 'Changed the colours', detail: (ad.palette && ad.palette.name) || '' });
  if (!deepEqual(bd.fonts, ad.fonts)) push({ scope: 'deck', what: 'Changed the fonts' });
  if (bd.aspect !== ad.aspect) push({ scope: 'deck', what: 'Changed the slide shape', detail: ad.aspect === 'standard' ? '4:3' : '16:9' });
  if (!deepEqual(bd.options, ad.options)) push({ scope: 'deck', what: 'Changed the deck settings' });

  const sections = listDiff(bd.sections, ad.sections);
  for (const x of sections.added) push({ scope: 'deck', what: 'Added the section', detail: x.title });
  for (const x of sections.removed) push({ scope: 'deck', what: 'Removed the section', detail: x.title });
  for (const [b, a] of sections.both) {
    if (b.title !== a.title) push({ scope: 'deck', what: 'Renamed a section', detail: b.title + ' \u2192 ' + a.title });
  }

  const layouts = listDiff(bd.layouts, ad.layouts);
  for (const l of layouts.added) push({ scope: 'layout', layoutId: l.id, what: 'Added the layout', detail: l.name });
  for (const l of layouts.removed) push({ scope: 'layout', what: 'Removed the layout', detail: l.name });
  for (const [bl, al] of layouts.both) {
    const where = al.name;
    if (bl.name !== al.name) push({ scope: 'layout', layoutId: al.id, what: 'Renamed a layout', detail: bl.name + ' \u2192 ' + al.name });
    if (bl.background !== al.background) push({ scope: 'layout', layoutId: al.id, what: 'Changed the layout background', detail: where });
    const els = listDiff(bl.elements, al.elements);
    for (const e of els.added) push({ scope: 'layout', layoutId: al.id, what: 'Added ' + elementLabel(e), detail: where });
    for (const e of els.removed) push({ scope: 'layout', layoutId: al.id, what: 'Removed ' + elementLabel(e), detail: where });
    for (const [be, ae] of els.both) {
      const bits = elementChanges(be, ae);
      if (bits.length) push({ scope: 'layout', layoutId: al.id, elementId: ae.id, what: capital(elementLabel(ae)) + ': ' + bits.map((x) => x.what).join(', '), detail: where, before: bits.find((x) => x.before != null)?.before, after: bits.find((x) => x.after != null)?.after });
    }
    if (!deepEqual(ids(bl.elements), ids(al.elements)) && !els.added.length && !els.removed.length) push({ scope: 'layout', layoutId: al.id, what: 'Changed what sits in front of what', detail: where });
  }

  const slides = listDiff(bd.slides, ad.slides);
  for (const s of slides.added) push({ scope: 'slide', slideId: s.id, what: 'Added a slide', detail: slideWhere(ad, s) });
  for (const s of slides.removed) push({ scope: 'slide', what: 'Removed a slide', detail: slideWhere(bd, s) });
  // A reorder is one sentence about the deck, not one about every slide that
  // now has a different number.
  if (!deepEqual(ids(bd.slides).filter((id) => ids(ad.slides).includes(id)), ids(ad.slides).filter((id) => ids(bd.slides).includes(id)))) {
    push({ scope: 'deck', what: 'Reordered the slides' });
  }
  for (const [bs, as_] of slides.both) {
    const where = slideWhere(ad, as_);
    if (bs.layout !== as_.layout) push({ scope: 'slide', slideId: as_.id, what: 'Changed the layout', detail: where });
    if (bs.sectionId !== as_.sectionId) push({ scope: 'slide', slideId: as_.id, what: 'Moved to another section', detail: where });
    if (!!bs.hidden !== !!as_.hidden) push({ scope: 'slide', slideId: as_.id, what: as_.hidden ? 'Hid the slide' : 'Showed the slide again', detail: where });
    if ((bs.notes || '') !== (as_.notes || '')) push({ scope: 'slide', slideId: as_.id, what: 'Rewrote the notes', detail: where, before: snip(bs.notes, 160), after: snip(as_.notes, 160) });
    if (bs.transition !== as_.transition) push({ scope: 'slide', slideId: as_.id, what: 'Changed the transition', detail: where });
    const layout = (ad.layouts || []).find((l) => l.id === as_.layout) || { elements: [] };
    const keys = new Set([...Object.keys(bs.overrides || {}), ...Object.keys(as_.overrides || {})]);
    for (const k of keys) {
      const bo = (bs.overrides || {})[k] || {};
      const ao = (as_.overrides || {})[k] || {};
      if (deepEqual(bo, ao)) continue;
      const el = layout.elements.find((e) => e.id === k);
      const bits = overrideChanges(el, bo, ao);
      if (bits.length) push({ scope: 'slide', slideId: as_.id, elementId: k, what: capital(elementLabel(el)) + ': ' + bits.map((x) => x.what).join(', '), detail: where, before: bits.find((x) => x.before != null)?.before, after: bits.find((x) => x.after != null)?.after });
    }
    const extras = listDiff(bs.extras, as_.extras);
    for (const e of extras.added) push({ scope: 'slide', slideId: as_.id, what: 'Added ' + elementLabel(e), detail: where });
    for (const e of extras.removed) push({ scope: 'slide', slideId: as_.id, what: 'Removed ' + elementLabel(e), detail: where });
    for (const [be, ae] of extras.both) {
      const bits = elementChanges(be, ae);
      if (bits.length) push({ scope: 'slide', slideId: as_.id, elementId: ae.id, what: capital(elementLabel(ae)) + ': ' + bits.map((x) => x.what).join(', '), detail: where, before: bits.find((x) => x.before != null)?.before, after: bits.find((x) => x.after != null)?.after });
    }
  }
  return out;
}

const ids = (list) => (list || []).map((x) => x.id);
const capital = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function elementChanges(b, a) {
  const bits = [];
  if (b.x !== a.x || b.y !== a.y) bits.push({ what: 'moved' });
  if (b.w !== a.w || b.h !== a.h) bits.push({ what: 'resized' });
  if (!deepEqual(b.style, a.style)) bits.push({ what: 'restyled' });
  if (b.name !== a.name) bits.push({ what: 'renamed' });
  if (b.locked !== a.locked || b.editable !== a.editable) bits.push({ what: 'changed what a slide may change' });
  bits.push(...contentChanges(a.type, b.content || {}, a.content || {}));
  return bits;
}

function overrideChanges(el, b, a) {
  const bits = [];
  if (!!b.hidden !== !!a.hidden) bits.push({ what: a.hidden ? 'hidden' : 'shown again' });
  if (!deepEqual(b.geometry, a.geometry)) bits.push({ what: 'moved' });
  if (!deepEqual(b.style, a.style)) bits.push({ what: 'restyled' });
  const base = (el && el.content) || {};
  const bc = { ...base, ...(b.content || {}) };
  const ac = { ...base, ...(a.content || {}) };
  bits.push(...contentChanges(el && el.type, bc, ac));
  return bits;
}

function contentChanges(type, b, a) {
  if (deepEqual(b, a)) return [];
  switch (type) {
    case 'text':
      return [{ what: 'rewritten', before: snip(b.text, 160), after: snip(a.text, 160) }];
    case 'image':
      return [{ what: b.asset !== a.asset ? 'new picture' : 'picture reframed' }];
    case 'pattern':
      return [{ what: 'graphic shuffled' }];
    case 'chart':
      if (b.kind !== a.kind) return [{ what: 'now a ' + a.kind + ' chart' }];
      return [{ what: deepEqual(b.data, a.data) ? 'chart settings changed' : 'chart data changed' }];
    case 'icon':
      return [{ what: 'icon changed to ' + a.icon }];
    case 'stat':
      return [{ what: 'number changed', before: snip(b.value + ' ' + b.label), after: snip(a.value + ' ' + a.label) }];
    case 'table':
      return [{ what: 'table changed' }];
    case 'code':
      return [{ what: 'code rewritten', before: snip(b.code, 160), after: snip(a.code, 160) }];
    case 'reference':
      return [{ what: b.target !== a.target ? 'points at a different slide' : 'wording changed' }];
    case 'field':
      return [{ what: 'now shows the ' + String(a.field || 'slide number').replace(/([A-Z])/g, ' $1').toLowerCase() }];
    case 'agenda':
      return [{ what: 'agenda settings changed' }];
    default:
      return [{ what: 'content changed' }];
  }
}

/**
 * A conflict's path, as words: "Slide 3 \u00b7 Title and content \u00b7 Title \u00b7 the words".
 */
export function describePath(path, state) {
  const words = [];
  let node = state;
  let slide = null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (typeof p === 'object') {
      const item = Array.isArray(node) ? node.find((x) => x && x.id === p.id) : null;
      node = item;
      if (!item) { words.push('an item since removed'); break; }
      if (path[i - 1] === 'slides') { slide = item; words.push(slideWhere(state, item)); }
      else if (path[i - 1] === 'layouts') words.push('Layout \u00b7 ' + (item.name || 'a layout'));
      else if (path[i - 1] === 'sections') words.push('Section \u00b7 ' + (item.title || 'a section'));
      else words.push(elementLabel(item));
      continue;
    }
    if (path[i - 1] === 'overrides' && slide) {
      const layout = (state.layouts || []).find((l) => l.id === slide.layout);
      const el = layout && layout.elements.find((e) => e.id === p);
      words.push(elementLabel(el));
      node = node ? node[p] : undefined;
      continue;
    }
    node = node ? node[p] : undefined;
    if (['layouts', 'slides', 'sections', 'elements', 'overrides', 'extras', 'content'].includes(p)) continue;
    words.push(p === 'text' ? 'the words' : p === 'data' ? 'the data' : p === 'notes' ? 'the notes' : p);
  }
  return words.join(' \u00b7 ');
}
