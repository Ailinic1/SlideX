// The inspector: everything about whatever is selected.
//
// Adapted from Newsx (web/js/inspector.js).
//
// One column on the right, in sections, and nothing in it is a dialog. A colour
// is a role first - the swatches are the deck's palette - because a role is
// what makes another palette recolour the whole deck at once; the last swatch
// opens a picker, for the logo that has to be exactly its own colour.
//
// When an element comes from the layout, every control here writes a difference
// on the slide rather than changing the layout, and "Back to layout" forgets it
// again. The editor decides which; the inspector just calls what it is given.

import { h, clear } from './ui.js';
import { icon } from './icons.js';
import { ROLES, ROLE_LABELS, isHex, resolveColor } from '../shared/color.js';
import { FAMILIES, FAMILY_LABELS } from '../shared/fonts.js';
import { CHART_KINDS, parseTable, normalizeData, sampleData } from '../shared/charts.js';
import { PATTERN_GROUPS, PATTERN_SCHEMES, newSeed } from '../shared/patterns.js';
import { searchGlyphs, glyphLabel } from '../shared/glyphs.js';
import { ELEMENT_TYPES, FIELD_KINDS, TEXT_PRESETS, numbering, slideTitle } from '../shared/model.js';

/* ----------------------------------------------------------------- bits */

const row = (label, ctl) => h('div.insp-row', [h('label', label), h('div.ctl', ctl)]);

function section(label, items, extra) {
  return h('div.insp-section', [h('div.label', [h('span', label), extra || null]), ...items.filter(Boolean)]);
}

function seg(options, value, onPick) {
  const el = h('div.seg', options.map(([id, label, ic]) => h('button' + (id === value ? '.on' : ''), {
    title: typeof label === 'string' ? label : id,
    onclick: () => onPick(id),
  }, ic ? icon(ic, 13) : label)));
  return el;
}

function num(value, onSet, opts = {}) {
  return h('input.input.sm.num', {
    type: 'number', value: round(value), step: opts.step || 1, min: opts.min, max: opts.max,
    onchange: (e) => onSet(Number(e.target.value)),
  });
}

const round = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : 0);

function slider(value, onSet, { min = 0, max = 1, step = 0.05 } = {}) {
  return h('input', { type: 'range', min, max, step, value, oninput: (e) => onSet(Number(e.target.value)) });
}

function check(label, why, value, onSet) {
  return h('label.toggle', [
    h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onSet(e.target.checked) }),
    h('span', [label, why ? h('span.why', why) : null]),
  ]);
}

/**
 * The palette, as swatches. A role first; a literal colour last, and only
 * because some marks have to be exactly themselves.
 */
function colorPicker(value, palette, onSet, { allowNone = false } = {}) {
  const wrap = h('div.swatches');
  if (allowNone) {
    wrap.append(h('button.swatch.none' + (value == null || value === 'none' ? '.on' : ''), { title: 'No colour', onclick: () => onSet(null) }));
  }
  for (const role of ROLES) {
    const b = h('button.swatch' + (value === role ? '.on' : ''), { title: ROLE_LABELS[role], onclick: () => onSet(role) });
    b.style.background = palette[role];
    wrap.append(b);
  }
  const custom = h('button.swatch.custom' + (isHex(value) ? '.on' : ''), { title: 'A colour of its own' });
  const input = h('input', { type: 'color', value: resolveColor(value, palette) || '#000000', oninput: (e) => onSet(e.target.value) });
  custom.append(input);
  wrap.append(custom);
  return wrap;
}

/* ------------------------------------------------------------- the panel */

/**
 * @param o {deck, slide, elements, selection, palette, onStyle, onContent,
 *           onGeometry, onName, onBackToLayout, isOverridden, editingLayout,
 *           onSlide, onDeck, onSelect, onCommand, assets}
 */
export function paintInspector(host, o) {
  clear(host);
  const els = o.selection.map((id) => o.elements.find((e) => e.id === id)).filter(Boolean);
  if (!els.length) return paintSlidePanel(host, o);
  if (els.length > 1) return paintMany(host, o, els);
  return paintOne(host, o, els[0]);
}

/* ------------------------------------------------------- nothing picked */

function paintSlidePanel(host, o) {
  const { deck, slide } = o;
  const nums = numbering(deck);
  host.append(h('div.insp-head', [
    h('span.ico', icon(o.editingLayout ? 'layout' : 'slides', 17)),
    h('div.title', [
      h('div.name', o.editingLayout ? o.editingLayout.name : (slideTitle(deck, slide) || 'Untitled slide')),
      h('div.kind', o.editingLayout ? 'Layout · every slide using it' : 'Slide'),
    ]),
  ]));
  if (o.editingLayout) {
    const used = deck.slides.filter((s) => s.layout === o.editingLayout.id).length;
    host.append(section('This layout', [
      row('Name', h('input.input.sm', { value: o.editingLayout.name, onchange: (e) => o.onLayout({ name: e.target.value }) })),
      row('Background', colorPicker(o.editingLayout.background, deck.palette, (v) => o.onLayout({ background: v || 'paper' }))),
      h('div.insp-note', used === 1 ? 'One slide uses this layout.' : used + ' slides use this layout. Changing it changes all of them, except where a slide has changed the same thing itself.'),
    ]));
    return host;
  }
  if (!slide) return host;
  host.append(section('This slide', [
    row('Number', h('span.dim', nums.numberOf(slide.id) == null ? 'not numbered (hidden)' : nums.numberOf(slide.id) + ' of ' + nums.total)),
    row('Layout', h('select.input.sm', {
      onchange: (e) => o.onSlide({ layout: e.target.value }),
    }, deck.layouts.map((l) => h('option', { value: l.id, selected: l.id === slide.layout }, l.name)))),
    row('Section', h('select.input.sm', {
      onchange: (e) => o.onSlide({ sectionId: e.target.value || null }),
    }, [h('option', { value: '', selected: !slide.sectionId }, 'None'), ...deck.sections.map((s) => h('option', { value: s.id, selected: s.id === slide.sectionId }, s.title))])),
    row('Transition', h('select.input.sm', {
      onchange: (e) => o.onSlide({ transition: e.target.value || null }),
    }, [['', 'As the deck says (' + (deck.options.transition || 'none') + ')'], ['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide']].map(([v, l]) => h('option', { value: v, selected: (slide.transition || '') === v }, l)))),
    check('Hide this slide', deck.options.numberHidden === 'keep'
      ? 'It keeps its number, and is skipped when presenting.'
      : 'It is skipped when presenting, and everything after it moves up a number.',
    slide.hidden, (v) => o.onSlide({ hidden: v })),
  ]));
  host.append(section('Notes', [
    h('textarea.input.content', {
      value: slide.notes || '',
      placeholder: 'What to say while this slide is up. Only the presenter view shows these.',
      onchange: (e) => o.onSlide({ notes: e.target.value }),
    }),
  ]));
  host.append(section('Everything on this slide', [
    h('div.layer-list', o.elements.slice().reverse().map((el) => h('div.layer' + (o.report[el.id] && (o.report[el.id].overflow || o.report[el.id].error) ? '.problem' : ''), {
      onclick: () => o.onSelect([el.id]),
    }, [
      h('span.flag', icon((ELEMENT_TYPES[el.type] || {}).icon || 'shapes', 13)),
      h('span.name', el.name || (ELEMENT_TYPES[el.type] || {}).label || el.type),
      el.fromLayout ? h('span.flag', { title: 'From the layout' }, icon('layout', 12)) : null,
    ]))),
  ]));
  return host;
}

/* ----------------------------------------------------- several selected */

function paintMany(host, o, els) {
  host.append(h('div.insp-head', [
    h('span.ico', icon('layers', 17)),
    h('div.title', [h('div.name', els.length + ' things selected'), h('div.kind', [...new Set(els.map((e) => (ELEMENT_TYPES[e.type] || {}).label || e.type))].join(', '))]),
  ]));
  host.append(section('Line them up', [
    h('div.insp-row', [h('label', 'Align'), h('div.ctl', [
      ...[['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight'], ['top', 'alignTop'], ['middle', 'alignMiddle'], ['bottom', 'alignBottom']]
        .map(([how, ic]) => h('button.icon-btn', { title: 'Align ' + how, onclick: () => o.onCommand('align', how) }, icon(ic, 15))),
    ])]),
    h('div.insp-row', [h('label', 'Space'), h('div.ctl', [
      h('button.btn.sm', { onclick: () => o.onCommand('distribute', 'x'), disabled: els.length < 3 }, 'Across'),
      h('button.btn.sm', { onclick: () => o.onCommand('distribute', 'y'), disabled: els.length < 3 }, 'Down'),
    ])]),
    els.length < 3 ? h('div.insp-note', 'Spacing evenly needs three.') : null,
  ]));
  host.append(commonStyle(o, els));
  return host;
}

/** The few things worth setting on a mixed selection. */
function commonStyle(o, els) {
  const first = els[0].style || {};
  return section('All of them', [
    row('Colour', colorPicker(first.color, o.palette, (v) => o.onStyle({ color: v }), { allowNone: true })),
    row('Fade', slider(first.opacity == null ? 1 : first.opacity, (v) => o.onStyle({ opacity: v }))),
    h('div.insp-row', [h('label', 'Order'), h('div.ctl', [
      h('button.icon-btn', { title: 'Bring to front', onclick: () => o.onCommand('order', 'front') }, icon('bringFront', 15)),
      h('button.icon-btn', { title: 'Send to back', onclick: () => o.onCommand('order', 'back') }, icon('sendBack', 15)),
    ])]),
  ]);
}

/* ------------------------------------------------------------ one element */

function paintOne(host, o, el) {
  const kind = ELEMENT_TYPES[el.type] || { label: el.type, icon: 'shapes' };
  const s = el.style || {};
  const c = el.content || {};
  const style = (patch) => o.onStyle(patch);
  const content = (patch) => o.onContent(patch);

  host.append(h('div.insp-head', [
    h('span.ico', icon(kind.icon, 17)),
    h('div.title', [
      h('input.input.sm.name-field', { value: el.name || '', placeholder: kind.label, onchange: (e) => o.onName(e.target.value) }),
      h('div.kind', kind.label + (el.fromLayout ? ' · from the layout' : '')),
    ]),
  ]));

  if (el.fromLayout && !o.editingLayout) {
    const changed = o.isOverridden(el.id);
    host.append(h('div.insp-section', [
      h('div.insp-note', changed
        ? 'This slide has changed it. Every other slide with this layout still shows the layout’s version.'
        : 'This comes from the layout “' + o.layoutName + '”. Change it here and only this slide changes.'),
      changed ? h('button.btn.sm', { onclick: () => o.onBackToLayout(el.id) }, 'Back to layout') : null,
    ].filter(Boolean)));
  }

  /* geometry */
  host.append(section('Place', [
    h('div.geo', [
      h('div.num-field', [h('span.k', 'X'), num(el.x, (v) => o.onGeometry({ x: v }))]),
      h('div.num-field', [h('span.k', 'Y'), num(el.y, (v) => o.onGeometry({ y: v }))]),
      h('div.num-field', [h('span.k', 'W'), num(el.w, (v) => o.onGeometry({ w: Math.max(4, v) }))]),
      h('div.num-field', [h('span.k', 'H'), num(el.h, (v) => o.onGeometry({ h: Math.max(4, v) }))]),
    ]),
    h('div.insp-row', [h('label', 'Order'), h('div.ctl', [
      h('button.icon-btn', { title: 'Bring to front', onclick: () => o.onCommand('order', 'front') }, icon('bringFront', 15)),
      h('button.icon-btn', { title: 'Send to back', onclick: () => o.onCommand('order', 'back') }, icon('sendBack', 15)),
      h('button.icon-btn', { title: 'Centre on the slide', onclick: () => o.onCommand('center') }, icon('alignCenter', 15)),
    ])]),
  ]));

  switch (el.type) {
    case 'text': textPanel(host, o, el, s, c, style, content); break;
    case 'field': fieldPanel(host, o, el, s, c, style, content); break;
    case 'reference': referencePanel(host, o, el, s, c, style, content); break;
    case 'agenda': agendaPanel(host, o, el, s, c, style, content); break;
    case 'image': imagePanel(host, o, el, s, c, style, content); break;
    case 'icon': iconPanel(host, o, el, s, c, style, content); break;
    case 'chart': chartPanel(host, o, el, s, c, style, content); break;
    case 'table': tablePanel(host, o, el, s, c, style, content); break;
    case 'code': codePanel(host, o, el, s, c, style, content); break;
    case 'stat': statPanel(host, o, el, s, c, style, content); break;
    case 'shape': shapePanel(host, o, el, s, c, style, content); break;
    case 'line': linePanel(host, o, el, s, c, style, content); break;
    case 'pattern': patternPanel(host, o, el, s, c, style, content); break;
    default: break;
  }

  const note = o.report[el.id] || {};
  const problems = [
    note.overflow ? [(note.hiddenWords || 'Some') + (note.hiddenWords === 1 ? ' word does' : ' words do') + ' not fit and will be cut off.', 'bad'] : null,
    note.clipped ? ['Something is too wide for its box and has been cut.', 'warn'] : null,
    note.tiny ? ['The type shrank to ' + note.tiny + 'pt to fit, which nobody at the back will read.', 'warn'] : null,
    note.shrunk && !note.tiny ? ['The type shrank to ' + note.shrunk + '% to fit.', 'warn'] : null,
    note.missing ? ['There is no picture here yet.', 'warn'] : null,
    note.lowResolution ? ['This picture is ' + note.lowResolution + ' pixels a point at this size, and will look soft on a projector.', 'warn'] : null,
    note.brokenReference ? ['The slide this points at has been deleted.', 'bad'] : null,
    note.error ? ['This could not be drawn: ' + note.error, 'bad'] : null,
  ].filter(Boolean);
  if (problems.length) {
    host.append(h('div.insp-section', problems.map(([words, level]) => h('div.insp-note.' + level, words))));
  }
  return host;
}

/* ------------------------------------------------------------------ text */

function textPanel(host, o, el, s, c, style, content) {
  host.append(section('Words', [
    h('textarea.input.content', {
      value: c.text || '',
      spellcheck: 'true',
      oninput: (e) => content({ text: e.target.value }),
    }),
    h('div.insp-note', 'One line is one paragraph. # heading, - bullet (two spaces in for a level), 1. numbered, > quote, **bold**, *italic*.'),
    h('div.insp-row', [h('label', 'Insert'), h('div.ctl', [
      h('button.btn.sm', { onclick: () => o.onCommand('insertField') }, 'A field…'),
      h('button.btn.sm', { onclick: () => o.onCommand('insertReference') }, 'A slide reference…'),
    ])]),
  ]));
  typePanel(host, o, el, s, style);
  boxPanel(host, o, el, s, style);
}

function typePanel(host, o, el, s, style) {
  host.append(section('Type', [
    row('Start from', h('select.input.sm', {
      onchange: (e) => { if (e.target.value) style(TEXT_PRESETS[e.target.value].style); },
    }, [h('option', { value: '' }, 'A preset…'), ...Object.entries(TEXT_PRESETS).map(([id, p]) => h('option', { value: id }, p.label))])),
    row('Font', h('select.input.sm', {
      onchange: (e) => style({ family: e.target.value }),
    }, FAMILIES.map((f) => h('option', { value: f, selected: (s.family || 'sans') === f }, FAMILY_LABELS[f])))),
    h('div.insp-row', [h('label', 'Size'), h('div.ctl', [
      num(s.size, (v) => style({ size: Math.max(4, v) }), { min: 4, max: 200 }),
      seg([['bold', h('b', 'B')], ['italic', h('i', 'I')]], null, (which) => style({ [which]: !s[which] })),
    ])]),
    row('Colour', colorPicker(s.color, o.palette, (v) => style({ color: v }))),
    h('div.insp-row', [h('label', 'Align'), h('div.ctl', [
      seg([['left', '', 'alignLeft'], ['center', '', 'alignCenter'], ['right', '', 'alignRight'], ['justify', '', 'alignJustify']], s.align || 'left', (v) => style({ align: v })),
      seg([['top', '', 'alignTop'], ['middle', '', 'alignMiddle'], ['bottom', '', 'alignBottom']], s.valign || 'top', (v) => style({ valign: v })),
    ])]),
    h('div.insp-row', [h('label', 'Line height'), h('div.ctl', num(s.lineHeight, (v) => style({ lineHeight: Math.max(0.8, v) }), { step: 0.05 }))]),
    h('div.insp-row', [h('label', 'Letter space'), h('div.ctl', num(s.tracking || 0, (v) => style({ tracking: v }), { step: 10 }))]),
    row('Capitals', seg([['none', 'Aa'], ['upper', 'AA']], s.transform || 'none', (v) => style({ transform: v }))),
    row('Columns', seg([[1, '1'], [2, '2'], [3, '3'], [4, '4']], Math.max(1, s.columns || 1), (v) => style({ columns: v }))),
    check('Shrink to fit', 'Makes the type smaller rather than cutting words off - never below half size, and never by splitting a word.',
      s.fit === 'shrink', (v) => style({ fit: v ? 'shrink' : 'none' })),
  ]));
}

function boxPanel(host, o, el, s, style) {
  host.append(section('Its box', [
    row('Fill', colorPicker(s.fill, o.palette, (v) => style({ fill: v }), { allowNone: true })),
    row('Border', colorPicker(s.stroke, o.palette, (v) => style({ stroke: v }), { allowNone: true })),
    h('div.insp-row', [h('label', 'Corners'), h('div.ctl', num(s.radius || 0, (v) => style({ radius: Math.max(0, v) })))]),
    h('div.insp-row', [h('label', 'Padding'), h('div.ctl', num(s.padding || 0, (v) => style({ padding: Math.max(0, v) })))]),
    row('Fade', slider(s.opacity == null ? 1 : s.opacity, (v) => style({ opacity: v }))),
  ]));
}

/* ---------------------------------------------------------------- fields */

function fieldPanel(host, o, el, s, c, style, content) {
  host.append(section('What it shows', [
    row('Field', h('select.input.sm', {
      onchange: (e) => content({ field: e.target.value }),
    }, Object.entries(FIELD_KINDS).map(([id, f]) => h('option', { value: id, selected: id === c.field }, f.label)))),
    h('div.insp-note', 'A field is worked out, never typed. The slide number comes from where this slide sits in the deck, so moving it is all it takes to change what this says.'),
  ]));
  typePanel(host, o, el, s, style);
}

function referencePanel(host, o, el, s, c, style, content) {
  const { deck } = o;
  const nums = numbering(deck);
  const target = deck.slides.find((x) => x.id === c.target);
  host.append(section('Which slide', [
    row('Points at', h('select.input.sm', {
      onchange: (e) => content({ target: e.target.value || null }),
    }, [
      h('option', { value: '', selected: !c.target }, 'Nothing yet'),
      ...deck.slides.map((x) => h('option', { value: x.id, selected: x.id === c.target },
        (nums.numberOf(x.id) == null ? '–' : nums.numberOf(x.id)) + '. ' + (slideTitle(deck, x) || 'Untitled'))),
    ])),
    row('Wording', h('input.input.sm', { value: c.text || '', onchange: (e) => content({ text: e.target.value }) })),
    h('div.insp-note', c.target && !target
      ? 'The slide this pointed at has been deleted. Choose another, or delete this.'
      : 'It remembers the slide, not its number, so reordering the deck keeps it pointing at the same slide. {ref} is that slide’s number, {ref.title} its title.'),
  ]));
  typePanel(host, o, el, s, style);
}

function agendaPanel(host, o, el, s, c, style, content) {
  host.append(section('What it lists', [
    row('From', seg([['sections', 'Sections'], ['titles', 'Slide titles']], c.source || 'sections', (v) => content({ source: v }))),
    check('Show numbers', 'The number each part starts at, worked out from the deck as it is now.', c.numbers !== false, (v) => content({ numbers: v })),
    h('div.insp-row', [h('label', 'At most'), h('div.ctl', num(c.limit || 12, (v) => content({ limit: Math.max(1, v) })))]),
    row('Numbers in', colorPicker(s.numberColor || 'accent', o.palette, (v) => style({ numberColor: v }))),
    h('div.insp-note', 'Built from the deck every time it is drawn, so adding or moving a slide moves the agenda with it.'),
  ]));
  typePanel(host, o, el, s, style);
}

/* -------------------------------------------------------------- pictures */

function imagePanel(host, o, el, s, c, style, content) {
  const meta = c.asset ? (o.assets || {})[c.asset] : null;
  host.append(section('Picture', [
    h('div.insp-row', [h('label', 'File'), h('div.ctl', [
      h('button.btn.sm', { onclick: () => o.onCommand('chooseImage', el.id) }, c.asset ? 'Replace…' : 'Choose…'),
      c.asset ? h('button.btn.sm.ghost', { onclick: () => content({ asset: null }) }, 'Remove') : null,
    ])]),
    meta ? h('div.insp-note', meta.width + ' × ' + meta.height + ' pixels' + (meta.name ? ' · ' + meta.name : '')) : h('div.insp-note', 'Drop a picture onto the slide, or onto this frame to fill it.'),
    row('Fit', seg([['cover', 'Fill'], ['contain', 'Fit'], ['stretch', 'Stretch']], s.fit || 'cover', (v) => style({ fit: v }))),
    s.fit !== 'stretch' ? h('div.insp-row', [h('label', 'Crop'), h('div.ctl', [
      slider(c.focusX == null ? 0.5 : c.focusX, (v) => content({ focusX: v })),
      slider(c.focusY == null ? 0.5 : c.focusY, (v) => content({ focusY: v })),
    ])]) : null,
    h('div.insp-row', [h('label', 'Corners'), h('div.ctl', num(s.radius || 0, (v) => style({ radius: Math.max(0, v) })))]),
    row('Border', colorPicker(s.stroke, o.palette, (v) => style({ stroke: v }), { allowNone: true })),
    row('Fade', slider(s.opacity == null ? 1 : s.opacity, (v) => style({ opacity: v }))),
  ]));
}

/* ----------------------------------------------------------------- icons */

function iconPanel(host, o, el, s, c, style, content) {
  const search = h('input.input.sm', { placeholder: 'Search by what it means: risk, growth, deadline…' });
  const grid = h('div.icon-grid');
  const fill = (q) => {
    clear(grid);
    for (const name of searchGlyphs(q).slice(0, 120)) {
      const cell = h('button.icon-cell' + (name === c.icon ? '.on' : ''), { title: glyphLabel(name), onclick: () => content({ icon: name }) });
      cell.append(icon(name, 20));
      grid.append(cell);
    }
    if (!grid.children.length) grid.append(h('div.insp-note', 'Nothing matches that.'));
  };
  search.addEventListener('input', () => fill(search.value));
  fill('');
  host.append(section('Which icon', [search, grid]));
  host.append(section('How it looks', [
    row('Colour', colorPicker(s.color, o.palette, (v) => style({ color: v }))),
    row('Badge', seg([['none', 'None'], ['circle', '●'], ['rounded', '■'], ['ring', '○']], s.badge || 'none', (v) => style({ badge: v }))),
    s.badge && s.badge !== 'none' ? row('Badge colour', colorPicker(s.badgeColor, o.palette, (v) => style({ badgeColor: v }))) : null,
    row('Weight', slider(s.weight == null ? 1 : s.weight, (v) => style({ weight: v }), { min: 0.5, max: 2.5, step: 0.1 })),
  ]));
}

/* ---------------------------------------------------------------- charts */

function chartPanel(host, o, el, s, c, style, content) {
  const kinds = h('div.kind-grid', Object.entries(CHART_KINDS).map(([id, k]) => h('button.kind-btn' + (id === c.kind ? '.on' : ''), {
    title: k.hint,
    onclick: () => content({ kind: id, data: c.data && c.data.labels && c.data.labels.length ? c.data : sampleData(id) }),
  }, k.label)));
  host.append(section('Kind', [kinds, h('div.insp-note', (CHART_KINDS[c.kind] || {}).hint || '')]));
  host.append(section('Numbers', [
    sheet(c.data, (data) => content({ data })),
    h('div.insp-row', [h('label', 'Paste'), h('div.ctl', [
      h('button.btn.sm', {
        onclick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            const parsed = parseTable(text);
            if (parsed) content({ data: parsed });
          } catch (e) {
            o.onCommand('pasteTable', el.id);
          }
        },
      }, 'From a spreadsheet'),
    ])]),
    h('div.insp-note', 'Copy a block of cells from Excel, Google Sheets or a CSV and paste it here: the first row names the series, the first column labels them.'),
  ]));
  host.append(section('Options', [
    row('Title', h('input.input.sm', { value: c.title || '', onchange: (e) => content({ title: e.target.value }) })),
    row('Units', h('input.input.sm', { value: (c.options || {}).unit || '', placeholder: '%, kg, …', onchange: (e) => content({ options: { ...c.options, unit: e.target.value } }) })),
    row('Prefix', h('input.input.sm', { value: (c.options || {}).prefix || '', placeholder: '$', onchange: (e) => content({ options: { ...c.options, prefix: e.target.value } }) })),
    check('Short numbers', '12,400 becomes 12.4k.', (c.options || {}).compact, (v) => content({ options: { ...c.options, compact: v } })),
    check('Show the legend', null, (c.options || {}).legend !== false, (v) => content({ options: { ...c.options, legend: v } })),
    check('Shades of one colour', 'Instead of the palette’s series colours.', (c.options || {}).mono, (v) => content({ options: { ...c.options, mono: v } })),
    row('Label size', num(s.size || 0, (v) => style({ size: v }))),
  ]));
}

/** A small spreadsheet: labels down the side, series across the top. */
function sheet(data, onSet) {
  const d = normalizeData(data);
  const table = h('table.sheet');
  const head = h('tr', [h('th', ''), ...d.series.map((ser, i) => h('th', h('input', {
    value: ser.name,
    onchange: (e) => {
      const next = clone(d);
      next.series[i].name = e.target.value;
      onSet(next);
    },
  }))), h('th.tools', h('button.icon-btn.sm', {
    title: 'Another series', onclick: () => {
      const next = clone(d);
      next.series.push({ name: 'Series ' + (next.series.length + 1), values: next.labels.map(() => null) });
      onSet(next);
    },
  }, icon('plus', 11)))]);
  table.append(head);
  d.labels.forEach((label, r) => {
    table.append(h('tr', [
      h('td', h('input', { value: label, onchange: (e) => { const next = clone(d); next.labels[r] = e.target.value; onSet(next); } })),
      ...d.series.map((ser, i) => h('td', h('input.num', {
        value: ser.values[r] == null ? '' : ser.values[r],
        onchange: (e) => { const next = clone(d); next.series[i].values[r] = e.target.value === '' ? null : Number(e.target.value); onSet(next); },
      }))),
      h('td.tools', h('button.icon-btn.sm', { title: 'Remove this row', onclick: () => { const next = clone(d); next.labels.splice(r, 1); next.series.forEach((x) => x.values.splice(r, 1)); onSet(next); } }, icon('minus', 11))),
    ]));
  });
  const add = h('button.btn.sm', {
    onclick: () => {
      const next = clone(d);
      next.labels.push('Row ' + (next.labels.length + 1));
      next.series.forEach((x) => x.values.push(null));
      onSet(next);
    },
  }, 'Another row');
  return h('div', [table, add]);
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---------------------------------------------------------------- tables */

function tablePanel(host, o, el, s, c, style, content) {
  const rows = (c.rows || []).map((r) => r.slice());
  const set = (next) => content({ rows: next });
  const table = h('table.sheet');
  rows.forEach((r, ri) => {
    table.append(h('tr', [
      ...r.map((cell, ci) => h('td', h('input', {
        value: cell,
        onchange: (e) => { const next = rows.map((x) => x.slice()); next[ri][ci] = e.target.value; set(next); },
      }))),
      h('td.tools', h('button.icon-btn.sm', { title: 'Remove this row', onclick: () => set(rows.filter((_, i) => i !== ri)) }, icon('minus', 11))),
    ]));
  });
  const width = Math.max(1, ...rows.map((r) => r.length));
  host.append(section('Cells', [
    table,
    h('div.insp-row', [h('div.ctl', [
      h('button.btn.sm', { onclick: () => set([...rows, new Array(width).fill('')]) }, 'Another row'),
      h('button.btn.sm', { onclick: () => set(rows.map((r) => [...r, ''])) }, 'Another column'),
      h('button.btn.sm', { onclick: () => o.onCommand('pasteTable', el.id) }, 'Paste…'),
    ])]),
    h('div.insp-note', 'Numbers sit against the right of their column; words against the left.'),
  ]));
  host.append(section('How it looks', [
    check('First row is a heading', null, s.header !== false, (v) => style({ header: v })),
    check('Shade every other row', null, s.zebra !== false, (v) => style({ zebra: v })),
    s.header !== false ? row('Heading fill', colorPicker(s.headFill, o.palette, (v) => style({ headFill: v }))) : null,
    row('Lines', colorPicker(s.rule, o.palette, (v) => style({ rule: v }))),
    row('Text', colorPicker(s.color, o.palette, (v) => style({ color: v }))),
    h('div.insp-row', [h('label', 'Size'), h('div.ctl', num(s.size || 14, (v) => style({ size: Math.max(5, v) })))]),
  ]));
}

/* ------------------------------------------------------------------ code */

function codePanel(host, o, el, s, c, style, content) {
  host.append(section('Code', [
    h('textarea.input.content.code', {
      value: c.code || '',
      spellcheck: 'false',
      oninput: (e) => content({ code: e.target.value }),
    }),
    h('div.insp-note', 'Set in the monospaced font, and never wrapped: a line too long for the box is reported rather than folded, because folded code is unreadable.'),
  ]));
  host.append(section('How it looks', [
    h('div.insp-row', [h('label', 'Size'), h('div.ctl', num(s.size || 14, (v) => style({ size: Math.max(5, v) })))]),
    check('Line numbers', null, s.numbers, (v) => style({ numbers: v })),
    row('Background', colorPicker(s.fill, o.palette, (v) => style({ fill: v }), { allowNone: true })),
    row('Text', colorPicker(s.color, o.palette, (v) => style({ color: v }))),
    h('div.insp-row', [h('label', 'Padding'), h('div.ctl', num(s.padding || 0, (v) => style({ padding: Math.max(0, v) })))]),
  ]));
}

/* ------------------------------------------------------------ big number */

function statPanel(host, o, el, s, c, style, content) {
  host.append(section('The number', [
    row('Value', h('input.input.sm', { value: c.value || '', onchange: (e) => content({ value: e.target.value }) })),
    row('Label', h('input.input.sm', { value: c.label || '', onchange: (e) => content({ label: e.target.value }) })),
    row('Icon', seg([['none', 'None'], ['left', 'Beside'], ['top', 'Above']], s.iconSide || 'none', (v) => style({ iconSide: v }))),
    row('Colour', colorPicker(s.color, o.palette, (v) => style({ color: v }))),
    row('Label colour', colorPicker(s.labelColor, o.palette, (v) => style({ labelColor: v }))),
    row('Align', seg([['left', 'Left'], ['center', 'Centre']], s.align || 'left', (v) => style({ align: v }))),
  ]));
  boxPanel(host, o, el, s, style);
}

/* ---------------------------------------------------- shapes and lines */

function shapePanel(host, o, el, s, c, style, content) {
  host.append(section('Shape', [
    row('Kind', h('select.input.sm', {
      onchange: (e) => style({ shape: e.target.value }),
    }, [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['pill', 'Pill'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['chevron', 'Chevron'], ['corner', 'Corner']]
      .map(([v, l]) => h('option', { value: v, selected: (s.shape || 'rect') === v }, l)))),
    row('Fill', colorPicker(s.fill, o.palette, (v) => style({ fill: v }), { allowNone: true })),
    row('Border', colorPicker(s.stroke, o.palette, (v) => style({ stroke: v }), { allowNone: true })),
    h('div.insp-row', [h('label', 'Border width'), h('div.ctl', num(s.lw || 1, (v) => style({ lw: Math.max(0, v) }), { step: 0.5 }))]),
    (s.shape || 'rect') === 'rect' ? h('div.insp-row', [h('label', 'Corners'), h('div.ctl', num(s.radius || 0, (v) => style({ radius: Math.max(0, v) })))]) : null,
    row('Fade', slider(s.opacity == null ? 1 : s.opacity, (v) => style({ opacity: v }))),
  ]));
}

function linePanel(host, o, el, s, c, style, content) {
  host.append(section('Line', [
    row('Colour', colorPicker(s.stroke, o.palette, (v) => style({ stroke: v }))),
    h('div.insp-row', [h('label', 'Width'), h('div.ctl', num(s.lw || 2, (v) => style({ lw: Math.max(0.25, v) }), { step: 0.5 }))]),
    check('Dashed', null, s.dash, (v) => style({ dash: v })),
    row('Start', seg([['none', 'None'], ['arrow', '◀'], ['dot', '●']], s.startHead || 'none', (v) => style({ startHead: v }))),
    row('End', seg([['none', 'None'], ['arrow', '▶'], ['dot', '●']], s.endHead || 'none', (v) => style({ endHead: v }))),
    h('div.insp-row', [h('label', 'Straighten'), h('div.ctl', [
      h('button.btn.sm', { onclick: () => content({ from: [0, 0.5], to: [1, 0.5] }) }, 'Across'),
      h('button.btn.sm', { onclick: () => content({ from: [0.5, 0], to: [0.5, 1] }) }, 'Down'),
    ])]),
    h('div.insp-note', 'Drag either end on the slide to point it anywhere.'),
  ]));
}

/* ---------------------------------------------------- generated graphics */

function patternPanel(host, o, el, s, c, style, content) {
  host.append(section('Generated graphic', [
    // Twenty-five kinds is too many for one flat list, so they come in the
    // groups they are named by: lines, grids, dots, shapes.
    row('Kind', h('select.input.sm', {
      onchange: (e) => style({ kind: e.target.value }),
    }, Object.entries(PATTERN_GROUPS).map(([group, kinds]) => h('optgroup', { label: group },
      Object.entries(kinds).map(([id, label]) => h('option', { value: id, selected: id === s.kind }, label)))))),
    row('Colours', h('select.input.sm', {
      onchange: (e) => style({ scheme: e.target.value }),
    }, Object.entries(PATTERN_SCHEMES).map(([id, label]) => h('option', { value: id, selected: id === s.scheme }, label)))),
    row('How busy', slider(s.density == null ? 1 : s.density, (v) => style({ density: v }), { min: 0.3, max: 2.4, step: 0.1 })),
    row('Line weight', slider(s.stroke == null ? 1 : s.stroke, (v) => style({ stroke: v }), { min: 0.3, max: 3, step: 0.1 })),
    h('div.insp-row', [h('label', 'Seed'), h('div.ctl', [
      h('code.seed', String(c.seed || '')),
      h('button.btn.sm', { onclick: () => content({ seed: newSeed() }) }, 'Shuffle'),
    ])]),
    h('div.insp-note', 'Drawn from the seed by rules - no AI anywhere in it. The seed is saved with the slide, so the picture is the same on reload, on a colleague’s computer and in the PDF. Shuffle is nothing more than a new seed.'),
    row('Background', colorPicker(s.fill, o.palette, (v) => style({ fill: v }), { allowNone: true })),
    h('div.insp-row', [h('label', 'Corners'), h('div.ctl', num(s.radius || 0, (v) => style({ radius: Math.max(0, v) })))]),
    row('Fade', slider(s.opacity == null ? 1 : s.opacity, (v) => style({ opacity: v }))),
  ]));
}
