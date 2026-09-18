// Slides drawn small, and the context every drawing of a slide needs.
//
// Adapted from Newsx (web/js/pages.js).

import { h } from './ui.js';
import { renderSlide } from '../shared/scene.js';
import { renderSVG } from '../shared/svg.js';
import { resolveSlide, resolveLayout, numbering } from '../shared/model.js';

let thumbCount = 0;

/**
 * The context the renderer wants.
 *
 * The numbering is worked out once here and handed to every slide drawn from
 * it, so a sorter full of thumbnails does not work out the same order forty
 * times - and so every one of them is numbered from the same answer.
 */
export function slideContext(deck, slide, extra = {}) {
  return {
    deck,
    slide: slide || null,
    numbers: extra.numbers || numbering(deck),
    assets: extra.assets || {},
    draft: true,
    ...extra,
  };
}

/** The slides of a deck as they will be drawn. */
export function slidesOf(deck) {
  return (deck.slides || []).map((s) => resolveSlide(deck, s)).filter(Boolean);
}

export function svgFor(slide, ctx, assetUrl) {
  const { ops } = renderSlide(slide, ctx);
  return renderSVG(ops, { width: ctx.deck.size.width, height: ctx.deck.size.height, assetUrl, idPrefix: 't' + (thumbCount++) });
}

/** A slide as a thumbnail element, at a fixed width. */
export function thumb(slide, ctx, assetUrl, width) {
  const deck = ctx.deck;
  const el = h('div.thumb', { style: { aspectRatio: deck.size.width + ' / ' + deck.size.height, width: width ? width + 'px' : null } });
  el.innerHTML = slide ? svgFor(slide, ctx, assetUrl) : '';
  return el;
}

/** A layout drawn as a slide using it would look. */
export function layoutThumb(deck, layout, assetUrl, width) {
  return thumb(resolveLayout(deck, layout), slideContext(deck, null), assetUrl, width);
}
