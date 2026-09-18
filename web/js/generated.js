// Generate a deck style, and generate a layout for one slide.
//
// Two screens over the same idea: a seed makes a design, another seed makes
// another, and the same seed always makes the same one - so a design somebody
// passed and wants back is one Previous away, and a design somebody liked can
// be made again next year from the seed written on it.
//
// There is no AI in it. See web/shared/generate.js, which is rules and a
// seeded random number generator, and test/no-llm-test.js, which keeps it that
// way.

import { h, clear, toast, openModal, confirmDialog } from './ui.js';
import { thumb, slideContext } from './slides.js';
import { generateDeck, generateSlideLayouts, generateLayoutsFor, newSeed } from '../shared/generate.js';
import { resolveSlide, layoutOf, rebaseSlides, numbering, ASPECTS } from '../shared/model.js';
import { PALETTES } from '../shared/color.js';

/* ------------------------------------------------- generate a deck style */

/**
 * The screen New deck opens on: a whole deck, drawn from a seed, with
 * Generate another, Previous, and a palette you can hold while you look.
 *
 * @param opts {title, aspect, onUse(deck, seed, palette)}
 */
export function openDeckStyles(opts = {}) {
  let aspect = opts.aspect || 'wide';
  // null means "leave the colours to each style", which is what makes pressing
  // G feel like shuffling a pack rather than recolouring one card.
  let palette = null;
  const history = [];
  let at = -1;

  const sheet = h('div.style-sheet');
  const meta = h('div.style-meta');

  const draw = () => {
    const { seed, deck } = history[at];
    clear(sheet);
    const nums = numbering(deck);
    for (const slide of deck.slides.slice(0, 6)) {
      sheet.append(h('div.style-slide', thumb(resolveSlide(deck, slide), slideContext(deck, slide, { numbers: nums }), () => '')));
    }
    clear(meta).append(
      h('span.palette-swatches', ['primary', 'secondary', 'accent', 'highlight', 'tint'].map((role) => {
        const sw = h('span.swatch-mini');
        sw.style.background = deck.palette[role];
        return sw;
      })),
      h('span', deck.palette.name),
      h('span.dim', deck.fonts.heading === deck.fonts.body ? deck.fonts.heading : deck.fonts.heading + ' and ' + deck.fonts.body),
      h('span.spacer'),
      h('code.seed', { title: 'The seed this was made from. The same seed always makes the same style.' }, seed),
    );
    ctl.setFooter(footer());
  };

  const another = () => {
    // Going back and then forward again shows the same styles, not new ones.
    if (at < history.length - 1) { at++; return draw(); }
    const seed = newSeed();
    history.push({ seed, deck: generateDeck({ seed, aspect, palette: palette || undefined, title: opts.title }) });
    at = history.length - 1;
    return draw();
  };

  const previous = () => { if (at > 0) { at--; draw(); } };

  const regenerate = () => {
    // Changing the shape or holding a palette re-makes what is on screen from
    // the same seed, so nothing jumps while you are choosing.
    history.length = 0;
    at = -1;
    another();
  };

  const footer = () => [
    h('button.btn', { onclick: () => ctl.close() }, 'Cancel'),
    h('span.spacer'),
    h('button.btn', { onclick: previous, disabled: at <= 0, title: 'The one before this' }, 'Previous'),
    h('button.btn', { onclick: another }, [h('span', 'Generate another'), h('kbd', 'G')]),
    h('button.btn.primary', {
      onclick: () => {
        const { seed, deck } = history[at];
        ctl.close();
        opts.onUse(deck, seed, palette, aspect);
      },
    }, 'Use this one'),
  ];

  const ctl = openModal({
    title: 'Generate a deck style',
    subtitle: 'Made by rules from a seed - a twelve-column grid, one scale of type, text measured for its words, and colours checked against what is behind them. No AI in it anywhere.',
    size: 'wide',
    body: h('div', [
      h('div.style-controls', [
        h('div.seg', Object.entries(ASPECTS).map(([id, a]) => h('button' + (id === aspect ? '.on' : ''), {
          onclick: (e) => {
            aspect = id;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
            regenerate();
          },
        }, a.ratio))),
        h('span.dim', 'Colours'),
        paletteHold((v) => { palette = v; regenerate(); }, () => palette),
      ]),
      sheet,
      meta,
    ]),
    footer: [],
  });

  // G generates another, as long as nothing is being typed into.
  const onKey = (e) => {
    if (!document.body.contains(ctl.el)) return document.removeEventListener('keydown', onKey, true);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return undefined;
    if (e.key === 'g' || e.key === 'G') { e.preventDefault(); another(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); previous(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); another(); }
    return undefined;
  };
  document.addEventListener('keydown', onKey, true);

  another();
  return ctl;
}

/** The "hold this palette" control: a row of palettes, plus "leave it to chance". */
function paletteHold(onSet, get) {
  const wrap = h('div.swatches.hold');
  const mark = () => {
    for (const b of wrap.children) b.classList.toggle('on', b.dataset.p === (get() || ''));
  };
  const any = h('button.swatch.none', { dataset: { p: '' }, title: 'Leave the colours to each style', onclick: () => { onSet(null); mark(); } });
  wrap.append(any);
  for (const [id, p] of Object.entries(PALETTES)) {
    const b = h('button.swatch', { dataset: { p: id }, title: 'Hold ' + p.name + ' while you try layouts', onclick: () => { onSet(id); mark(); } });
    b.style.background = 'linear-gradient(135deg, ' + p.primary + ' 0 50%, ' + p.accent + ' 50% 100%)';
    wrap.append(b);
  }
  mark();
  return wrap;
}

/* --------------------------------------------- generate one slide's layout */

/**
 * Six layouts for the slide in front of you, in the deck's own colours, with
 * Six more after that. Choosing one is the ordinary "this slide uses that
 * layout", and what the slide has written moves to the element of the same
 * name - so a title stays a title.
 *
 * @param opts {deck, slide, onUse(layout), assetUrl}
 */
export function openSlideLayouts(opts = {}) {
  const { deck, slide } = opts;
  const kind = (layoutOf(deck, slide.layout) || {}).kind || 'titleContent';
  const seed = newSeed();
  // The deck's own palette is held, which is what makes six options look like
  // six versions of this deck rather than six different decks.
  const paletteKey = Object.keys(PALETTES).find((k) => PALETTES[k].name === deck.palette.name);
  let offset = 0;
  let options = [];
  const grid = h('div.layout-grid');

  const more = () => {
    options = generateSlideLayouts({ seed, kind, aspect: deck.aspect, palette: paletteKey, count: 6, offset });
    offset += 6;
    clear(grid);
    for (const option of options) {
      // Drawn as this slide would look on it: what the slide has written is
      // already moved across, so the preview is the answer, not a sample.
      const preview = { ...deck, layouts: [...deck.layouts, option.layout] };
      const { slides } = rebaseSlides(deck, preview, [slide]);
      const moved = { ...slides[0], layout: option.layout.id };
      preview.slides = deck.slides.map((s) => (s.id === slide.id ? moved : s));
      grid.append(h('button.layout-card', {
        onclick: () => { ctl.close(); opts.onUse(option.layout); },
      }, [
        thumb(resolveSlide(preview, moved), slideContext(preview, moved, { assets: opts.assets }), opts.assetUrl),
        h('div.layout-name', option.layout.name),
      ]));
    }
  };

  const ctl = openModal({
    title: 'Generate a layout for this slide',
    subtitle: 'Six at a time, in this deck’s colours. What this slide has written moves to the element of the same name.',
    size: 'wide',
    body: grid,
    footer: (c) => [
      h('button.btn', { onclick: () => c.close() }, 'Cancel'),
      h('span.spacer'),
      h('button.btn', { onclick: more }, 'Six more'),
    ],
  });
  more();
  return ctl;
}

/* ------------------------------ a new generated style for a whole deck */

/**
 * Put a deck onto a newly generated style.
 *
 * Nothing moves until the person choosing has been told what will: how many of
 * the things they have written find a place on the new design, and how many
 * have nowhere to go. One undo puts the old style back, which is why this only
 * has to be honest, not reversible in itself.
 */
export async function restyleDeck(deck, { onApply }) {
  const style = generateLayoutsFor({ seed: newSeed(), aspect: deck.aspect });
  const next = { ...deck, layouts: style.layouts, palette: style.palette, fonts: style.fonts };
  const { slides, carried, dropped } = rebaseSlides(deck, next, deck.slides);
  const said = (n, one, many) => (n === 1 ? '1 ' + one : n + ' ' + many);
  const yes = await confirmDialog({
    title: 'Put this deck onto a new style?',
    message: dropped
      ? said(carried, 'thing you have written moves', 'things you have written move') + ' onto the new design. '
        + said(dropped, 'has', 'have') + ' nowhere to go on it, and will be left behind. One Ctrl+Z puts the old style back.'
      : said(carried, 'thing you have written moves', 'things you have written move')
        + ' onto the new design, and nothing is left behind. One Ctrl+Z puts the old style back.',
    confirmLabel: 'Use the new style',
    danger: dropped > 0,
  });
  if (!yes) return;
  onApply({ ...next, slides }, { carried, dropped, seed: style.seed });
  toast('New style', dropped
    ? carried + ' moved across, ' + dropped + ' left behind. Ctrl+Z puts the old one back.'
    : carried + ' moved across. Ctrl+Z puts the old one back.', 'ok', 7000);
}
