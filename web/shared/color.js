// Colour on a slide.
//
// Copied from Newsx (web/shared/color.js), where it colours a newsletter page.
//
// An element names its colours by role - primary, accent, ink - rather than by
// value, so choosing another palette recolours every slide, every chart and
// every generated graphic in one step, and nothing is left in last year's blue.
// A literal #hex is allowed too, for the logo that has to be exactly its own
// colour.

export const ROLES = ['primary', 'secondary', 'accent', 'highlight', 'ink', 'muted', 'rule', 'tint', 'paper'];

export const ROLE_LABELS = {
  primary: 'Primary', secondary: 'Secondary', accent: 'Accent', highlight: 'Highlight',
  ink: 'Text', muted: 'Quiet text', rule: 'Lines', tint: 'Tint', paper: 'Paper',
};

/**
 * Palettes chosen to print well and to stay legible in black and white: the
 * primary and ink are always dark enough to carry white text or sit on paper.
 */
export const PALETTES = {
  harbor: {
    name: 'Harbor',
    primary: '#16324f', secondary: '#2a6f97', accent: '#e07a3f', highlight: '#61a5c2',
    ink: '#1b1f24', muted: '#5b6570', rule: '#d5dbe1', tint: '#eef3f7', paper: '#ffffff',
  },
  graphite: {
    name: 'Graphite',
    primary: '#17181a', secondary: '#4c5057', accent: '#8a8c90', highlight: '#b3b6ba',
    ink: '#17181a', muted: '#5c5e62', rule: '#dcdcde', tint: '#f1f1f2', paper: '#ffffff',
  },
  laboratory: {
    name: 'Laboratory',
    primary: '#0f4c45', secondary: '#1f8a70', accent: '#f2a541', highlight: '#8fc1a9',
    ink: '#1a2421', muted: '#56645f', rule: '#d3dfda', tint: '#edf5f1', paper: '#ffffff',
  },
  cardinal: {
    name: 'Cardinal',
    primary: '#6d1a2a', secondary: '#a8324a', accent: '#d9a441', highlight: '#e3a6a1',
    ink: '#24191b', muted: '#6a5b5e', rule: '#e4d6d8', tint: '#f8f0f0', paper: '#ffffff',
  },
  aurora: {
    name: 'Aurora',
    primary: '#2d1e5c', secondary: '#5b4bb7', accent: '#1fb5a6', highlight: '#f06c9b',
    ink: '#1d1a2b', muted: '#615d73', rule: '#dddbe8', tint: '#f2f1f8', paper: '#ffffff',
  },
  meadow: {
    name: 'Meadow',
    primary: '#2f4b26', secondary: '#6a994e', accent: '#bc4749', highlight: '#a7c957',
    ink: '#1f261c', muted: '#5e6758', rule: '#dde3d6', tint: '#f3f6ee', paper: '#fffdf8',
  },
  sunrise: {
    name: 'Sunrise',
    primary: '#7a2e0e', secondary: '#c2571a', accent: '#1c6e8c', highlight: '#f2b134',
    ink: '#2a1d16', muted: '#6d5d53', rule: '#eadbd0', tint: '#fbf3ec', paper: '#fffdfa',
  },
};

export const DEFAULT_PALETTE = 'harbor';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHex = (v) => HEX.test(String(v || ''));

/** A role or a hex, as a hex. Unknown values fall back to ink, never to nothing. */
export function resolveColor(value, palette) {
  if (value == null || value === '' || value === 'none') return null;
  if (isHex(value)) return normalizeHex(value);
  const p = palette || PALETTES[DEFAULT_PALETTE];
  if (p[value] && isHex(p[value])) return normalizeHex(p[value]);
  return normalizeHex(p.ink || '#000000');
}

export function normalizeHex(hex) {
  let h = String(hex).trim().toLowerCase();
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]) {
  const two = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + two(r) + two(g) + two(b);
}

/** a + (b - a) * t, in RGB. */
export function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of ink and paper reads better on a fill. */
export function textOn(fill, palette) {
  const dark = resolveColor('ink', palette) || '#000000';
  const light = '#ffffff';
  return contrast(fill, light) >= contrast(fill, dark) ? light : dark;
}

/**
 * The colours a chart or a generated graphic cycles through, in order: the
 * strong roles first, then lighter versions of them, so a sixth series still
 * belongs to the publication.
 */
export function seriesColors(palette, count = 6) {
  const p = palette || PALETTES[DEFAULT_PALETTE];
  const base = [p.primary, p.accent, p.secondary, p.highlight].filter(isHex);
  const out = [];
  for (let i = 0; out.length < count; i++) {
    const c = base[i % base.length];
    const round = Math.floor(i / base.length);
    out.push(round === 0 ? c : mix(c, p.paper || '#ffffff', Math.min(0.7, round * 0.35)));
  }
  return out.map(normalizeHex);
}

/**
 * How much contrast a piece of text needs.
 *
 * The rule WCAG states: text that is large - 16 points and up, or 14 and up
 * when it is bold - needs 3 to 1, and everything smaller needs 4.5. On a slide
 * almost everything is large, which is rather the point of a slide; what this
 * catches is the label, the caption and the footer, which are not.
 */
export function contrastFloor(size, bold) {
  return size >= 16 || (bold && size >= 14) ? 3 : 4.5;
}

/**
 * A colour for words on a fill: the first of `prefer` that reads on it, tried
 * at 4.5 first and then at whatever this size actually needs, and failing both
 * whichever of paper and ink reads better. Nothing here is assumed.
 *
 * `on` may be several fills, for a colour that has to read on more than one -
 * a label that appears both on paper and on a tinted band. It is what the
 * generator uses to choose every colour it puts words in, and what the
 * starters use for the same reason: an accent that reads on white in one
 * palette does not in the next.
 */
export function readableRole(palette, on, prefer, { size = 17, bold = false } = {}) {
  const fills = Array.isArray(on) ? on : [on];
  const floor = contrastFloor(size, bold);
  const worst = (role) => Math.min(...fills.map((f) => contrast(resolveColor(role, palette), resolveColor(f, palette))));
  for (const min of [4.5, floor]) {
    for (const role of prefer) if (worst(role) >= min) return role;
  }
  return worst('paper') >= worst('ink') ? 'paper' : 'ink';
}

/** A palette completed from whatever it was given. */
export function completePalette(p) {
  const base = PALETTES[DEFAULT_PALETTE];
  const out = { name: (p && p.name) || 'Custom' };
  for (const role of ROLES) out[role] = p && isHex(p[role]) ? normalizeHex(p[role]) : base[role];
  return out;
}
