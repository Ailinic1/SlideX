// The icon set on screen. The drawings themselves live in shared/glyphs.js,
// where the slide and the PDF read them too, so a button and an icon placed on
// a slide are the same drawing.
//
// Copied from Newsx (web/js/icons.js), with SlideX's own mark.

import { GLYPHS } from '../shared/glyphs.js';

const NS = 'http://www.w3.org/2000/svg';

/** One icon as an <svg>, or null if there is no such icon. */
export function icon(name, size = 18) {
  const d = GLYPHS[name];
  if (!d) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

/** An icon if there is one, otherwise the text asked for (B, I, U stay letters). */
export function iconOrText(name, size) {
  return icon(name, size) || document.createTextNode(String(name == null ? '' : name));
}

/**
 * The program's mark: a slide with a title bar and a line under it, and beside
 * it the corner of the next slide - a deck, reduced to its shapes. Drawn in the
 * same three greys as Newsx's mark, so the two read as one family.
 */
export const BRAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="8" fill="#17181a"/>' +
  '<rect x="5.5" y="8" width="17" height="16" rx="2" fill="#ffffff"/>' +
  '<rect x="8" y="11" width="10" height="2.6" rx="1.3" fill="#17181a"/>' +
  '<rect x="8" y="15.6" width="7" height="1.8" rx=".9" fill="#8a8c90"/>' +
  '<rect x="8" y="19" width="5" height="1.8" rx=".9" fill="#8a8c90"/>' +
  '<path d="M24.5 10.5h2v11h-2z" fill="#8a8c90"/>' +
  '</svg>';

export function brandMark(size = 20) {
  const span = document.createElement('span');
  span.innerHTML = BRAND_SVG;
  const svg = span.firstChild;
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
