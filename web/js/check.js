// Check the deck: everything that will not look right in the room, worst first.
//
// Adapted from Newsx (web/js/check.js).
//
// It is deliberately quiet. A deck with nothing wrong gets one line saying so,
// not a list of suggestions; a panel that always has something to say is a
// panel nobody opens. Clicking an item goes to it - the slide, and the thing on
// the slide - because a list you cannot act on is a list you learn to ignore.

import { h, openModal } from './ui.js';
import { icon } from './icons.js';
import { renderSlide, contrastOf } from '../shared/scene.js';
import { resolveSlide, numbering, slideTitle, referencesIn, layoutOf } from '../shared/model.js';
import { unprintable } from '../shared/fonts.js';
import { normalizeData } from '../shared/charts.js';
import { contrastFloor } from '../shared/generate.js';

const LEVELS = { bad: 0, warn: 1, note: 2 };

/**
 * Everything worth saying about a deck.
 *
 * @returns [{level, message, where, slideId, elementId}] worst first
 */
export function checkDeck(deck, assets = {}) {
  const out = [];
  const nums = numbering(deck);
  if (!deck.slides.length) {
    out.push({ level: 'bad', message: 'This deck has no slides.' });
    return out;
  }
  if (!nums.total) {
    out.push({ level: 'bad', message: 'Every slide in this deck is hidden, so there is nothing to present.' });
  }

  // References first, because a broken one is the thing a reorder can leave
  // behind and the thing nobody notices until they are standing up.
  for (const ref of referencesIn(deck)) {
    if (ref.ok) continue;
    const n = nums.numberOf(ref.slideId);
    out.push({
      level: 'bad',
      message: '“' + ref.name + '” points at a slide that has been deleted. Point it at another, or take it out.',
      where: 'Slide ' + (n == null ? '–' : n),
      slideId: ref.slideId,
      elementId: ref.elementId,
    });
  }

  for (const slide of deck.slides) {
    const resolved = resolveSlide(deck, slide);
    const n = nums.numberOf(slide.id);
    const layout = layoutOf(deck, slide.layout);
    if (!resolved) {
      out.push({ level: 'bad', message: 'This slide uses a layout that is no longer in the deck.', where: 'Slide ' + (n == null ? '–' : n), slideId: slide.id });
      continue;
    }
    const where = 'Slide ' + (n == null ? '– (hidden)' : n) + ' · ' + (slideTitle(deck, slide, resolved.elements) || layout.name);
    const { report } = renderSlide(resolved, { deck, slide, numbers: nums, assets, draft: false });

    // A slide nobody can name is a slide nobody can find in the sorter, on the
    // agenda or in the go-to box. What counts is what slideTitle finds, which
    // is the same thing those three show - a title element if there is one,
    // and the first words on the slide if there is not.
    if (!slideTitle(deck, slide, resolved.elements) && resolved.kind !== 'blank') {
      out.push({ level: 'warn', message: 'Nothing on this slide can be its title, so it has no name in the sorter, on the agenda or in the go-to box.', where, slideId: slide.id });
    }

    for (const el of resolved.elements) {
      const name = el.name || el.type;
      const at = { where: where + ' · ' + name, slideId: slide.id, elementId: el.id };
      const note = report[el.id] || {};

      if (note.error) out.push({ level: 'bad', message: name + ' could not be drawn: ' + note.error, ...at });
      if (note.overflow) {
        out.push({
          level: 'bad',
          message: (note.hiddenWords || 'Some') + (note.hiddenWords === 1 ? ' word does' : ' words do') + ' not fit in “' + name + '” and will be cut off.',
          ...at,
        });
      }
      if (note.clipped) out.push({ level: 'warn', message: '“' + name + '” is too wide for its box and has been cut.', ...at });
      if (note.tiny) {
        out.push({ level: 'warn', message: '“' + name + '” had to shrink to ' + note.tiny + ' points to fit, which nobody at the back will read.', ...at });
      } else if (note.shrunk && note.shrunk < 75) {
        out.push({ level: 'note', message: '“' + name + '” had to shrink its type to ' + note.shrunk + '% to fit.', ...at });
      }
      if (note.missing && el.editable !== false) {
        out.push({ level: 'warn', message: '“' + name + '” has no picture, and will be empty on the screen.', ...at });
      }
      if (note.lowResolution) {
        out.push({
          level: 'warn',
          message: 'The picture in “' + name + '” is ' + note.lowResolution + ' pixels to the point at this size, and will look soft on a projector.',
          ...at,
        });
      }
      if (note.empty && el.editable !== false && el.type !== 'agenda') {
        out.push({ level: 'warn', message: '“' + name + '” is empty.', ...at });
      }
      if (note.empty && el.type === 'agenda') {
        out.push({ level: 'warn', message: 'The agenda has nothing to list: the deck has no sections yet, or no slide has a title.', ...at });
      }

      // Off the slide entirely - which is what changing the shape of a deck
      // leaves behind.
      if (el.x + el.w < 1 || el.y + el.h < 1 || el.x > deck.size.width - 1 || el.y > deck.size.height - 1) {
        out.push({ level: 'warn', message: '“' + name + '” is off the slide.', ...at });
      } else if (el.x < -0.5 || el.y < -0.5 || el.x + el.w > deck.size.width + 0.5 || el.y + el.h > deck.size.height + 0.5) {
        out.push({ level: 'note', message: '“' + name + '” runs off the edge of the slide.', ...at });
      }

      // Words on whatever is behind them.
      if (['text', 'field', 'reference', 'agenda'].includes(el.type)) {
        const c = contrastOf(resolved.elements, el, deck.palette);
        const size = Number((el.style || {}).size) || 17;
        const floor = contrastFloor(size, !!(el.style || {}).bold);
        if (c && c.ratio < floor) {
          out.push({
            level: c.ratio < floor * 0.7 ? 'bad' : 'warn',
            message: '“' + name + '” has a contrast of ' + c.ratio.toFixed(1) + ':1 against what is behind it, and needs ' + floor + ':1 at this size.',
            ...at,
          });
        }
      }

      // Characters the PDF fonts do not have.
      const words = el.type === 'text' ? (el.content || {}).text
        : el.type === 'code' ? (el.content || {}).code
          : el.type === 'stat' ? (el.content || {}).value + ' ' + (el.content || {}).label
            : el.type === 'table' ? ((el.content || {}).rows || []).flat().join(' ')
              : '';
      if (words) {
        const odd = unprintable(words);
        if (odd.length) {
          out.push({
            level: 'warn',
            message: '“' + name + '” uses ' + odd.map((ch) => '“' + ch + '”').join(' ') + ', which the PDF fonts do not have; '
              + (odd.length === 1 ? 'it prints' : 'they print') + ' as a question mark.',
            ...at,
          });
        }
        const tokens = String(words).match(/\{[a-z][a-z.]*(?::[^}]*)?\}/gi) || [];
        const known = /^\{(n|number|total|title|section|deck|date|footer|ref|ref\.title)(:[^}]*)?\}$/i;
        const wrong = tokens.filter((tk) => !known.test(tk));
        if (wrong.length) {
          out.push({
            level: 'bad',
            message: '“' + name + '” has ' + wrong.join(', ') + ', which is not a field SlideX can fill in, and will print exactly as typed.',
            ...at,
          });
        }
      }

      // Words still exactly as the layout wrote them, in a box a slide is meant
      // to fill in, are nearly always a placeholder somebody forgot.
      if (el.fromLayout && el.editable !== false && el.type === 'text' && layout) {
        const own = (slide.overrides || {})[el.id];
        const placeholder = (layout.elements.find((e) => e.id === el.id) || {}).content || {};
        if (!(own && own.content && own.content.text != null) && placeholder.text && !/\{[a-z.:]+\}/i.test(placeholder.text)) {
          out.push({ level: 'note', message: '“' + name + '” still says what the layout says.', ...at, placeholder: true });
        }
      }

      if (el.type === 'chart') {
        const data = normalizeData((el.content || {}).data);
        const values = data.series.flatMap((s) => s.values).filter((v) => v != null);
        if (!values.length) out.push({ level: 'warn', message: '“' + name + '” has no numbers in it.', ...at });
        else if (['pie', 'donut', 'waffle'].includes(el.content.kind) && values.some((v) => v < 0)) {
          out.push({ level: 'bad', message: '“' + name + '” has a negative number in it, which cannot be a share of a whole.', ...at });
        }
      }
    }
  }

  // Placeholders are one line, however many there are: a deck straight off a
  // generated style has thirty of them and a list of thirty is a list nobody
  // reads.
  const placeholders = out.filter((x) => x.placeholder);
  if (placeholders.length > 3) {
    const rest = out.filter((x) => !x.placeholder);
    rest.push({
      level: 'note',
      message: placeholders.length + ' text boxes still say what their layout says.',
      where: 'Across the deck',
      slideId: placeholders[0].slideId,
      elementId: placeholders[0].elementId,
    });
    out.length = 0;
    out.push(...rest);
  }

  return out.sort((a, b) => LEVELS[a.level] - LEVELS[b.level]);
}

/**
 * The panel.
 * @param opts {deck, assets, onGo(item)}
 */
export function openCheck(opts) {
  const items = checkDeck(opts.deck, opts.assets);
  const counts = {
    bad: items.filter((x) => x.level === 'bad').length,
    warn: items.filter((x) => x.level === 'warn').length,
    note: items.filter((x) => x.level === 'note').length,
  };
  const body = h('div.check-list');
  if (!items.length) {
    body.append(h('div.empty-state', [
      h('span.ico.ok', icon('check', 28)),
      h('h2', 'Nothing wrong with it'),
      h('p', 'Every slide fits, every reference points somewhere, and everything on them can be read.'),
    ]));
  } else {
    for (const item of items) {
      body.append(h('button.check-item.' + item.level, {
        onclick: () => { ctl.close(); opts.onGo(item); },
      }, [
        h('span.ico', icon(item.level === 'bad' ? 'close' : item.level === 'warn' ? 'suggest' : 'lightbulb', 15)),
        h('div.check-words', [
          h('div.check-message', item.message),
          item.where ? h('div.check-where', item.where) : null,
        ]),
        h('span.ico.go', icon('chevronRight', 14)),
      ]));
    }
  }
  const ctl = openModal({
    title: 'Check',
    subtitle: items.length
      ? [counts.bad ? counts.bad + ' to fix' : null, counts.warn ? counts.warn + ' worth looking at' : null, counts.note ? counts.note + ' to know about' : null]
        .filter(Boolean).join(' · ') + ' · click one to go to it'
      : 'Nothing to fix.',
    body,
    footer: (c) => [h('button.btn.primary', { onclick: () => c.close() }, 'Close')],
  });
  return ctl;
}
