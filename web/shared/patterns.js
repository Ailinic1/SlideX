// Generated graphics: decoration that is different every time and always on brand.
//
// Copied from Newsx (web/shared/patterns.js), where the same ten graphics
// decorate a newsletter.
//
// A deck whose every slide looks identical stops being watched. A generated
// graphic is drawn from a seed - the same seed always draws the same picture, so
// it survives a reload, a colleague's computer and a PDF unchanged - and
// "shuffle" is nothing more than a new seed. The deck decides the kind, the
// colours and how busy it is.
//
// No AI: a seeded random number generator and rules.

import { resolveColor, mix } from './color.js';
import { ellipsePath } from './path.js';

/**
 * Every kind of graphic, grouped by the character it has, because a person
 * choosing one is choosing a mood rather than an algorithm.
 *
 * The first ten came from Newsx. The rest were added for decks, which need more
 * variety than a newsletter does: a newsletter is read once a month and a deck
 * is twenty slides in a row, so the same picture twice is noticed.
 */
export const PATTERN_GROUPS = {
  'Lines and fields': {
    network: 'Network',
    waves: 'Waves',
    contours: 'Contours',
    orbits: 'Orbits',
    flow: 'Flow lines',
    topography: 'Topography',
    rays: 'Rays',
    spiral: 'Spiral',
  },
  'Grids and tiles': {
    mosaic: 'Mosaic',
    hexes: 'Hexagons',
    grid: 'Grid',
    isometric: 'Isometric',
    weave: 'Weave',
    lattice: 'Lattice',
    circuit: 'Circuit',
  },
  Dots: {
    halftone: 'Halftone',
    confetti: 'Confetti',
    starfield: 'Starfield',
    bubbles: 'Bubbles',
    scatter: 'Scatter',
  },
  Shapes: {
    blobs: 'Blobs',
    bars: 'Data bars',
    stripes: 'Stripes',
    arcs: 'Arcs',
    steps: 'Steps',
    shards: 'Shards',
  },
};

/** Every kind by name, which is what an element stores. */
export const PATTERN_KINDS = Object.assign({}, ...Object.values(PATTERN_GROUPS));

/** The kinds that read as decoration rather than as data, for a busy slide. */
export const QUIET_KINDS = ['contours', 'topography', 'halftone', 'grid', 'lattice', 'waves', 'flow', 'starfield', 'arcs', 'spiral'];

export const PATTERN_SCHEMES = {
  brand: 'Deck colours',
  primary: 'Shades of primary',
  accent: 'Shades of accent',
  soft: 'Soft tints',
  ink: 'Ink only',
  duo: 'Two colours',
  faint: 'Barely there',
};

/* ----------------------------------------------------------------- random */

export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and the same numbers in every browser and in Node. */
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length) % list.length];
  return next;
}

export function newSeed() {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

/**
 * The colours a scheme draws in.
 *
 * Everything that fades does so towards `surface` - what the graphic is
 * actually sitting on - rather than towards paper. On a light slide those are
 * the same thing; on a dark one they are opposites, and mixing towards paper
 * would make a "soft tint" the brightest thing on the slide.
 */
function schemeColors(scheme, palette, surface) {
  const r = (role) => resolveColor(role, palette);
  const back = surface || r('paper');
  switch (scheme) {
    case 'primary': return [r('primary'), mix(r('primary'), back, 0.3), mix(r('primary'), back, 0.55), mix(r('primary'), back, 0.78)];
    case 'accent': return [r('accent'), mix(r('accent'), back, 0.3), mix(r('accent'), back, 0.55), mix(r('accent'), back, 0.78)];
    case 'soft': return [mix(r('primary'), back, 0.8), mix(r('secondary'), back, 0.75), mix(r('accent'), back, 0.72), mix(r('highlight'), back, 0.7)];
    case 'duo': return [r('primary'), r('accent'), mix(r('primary'), back, 0.5), mix(r('accent'), back, 0.5)];
    case 'faint': return [mix(r('ink'), back, 0.86), mix(r('primary'), back, 0.88), mix(r('accent'), back, 0.9)];
    case 'ink': return [r('ink')];
    default: return [r('primary'), r('secondary'), r('accent'), r('highlight')];
  }
}

/**
 * How big a cell has to be so that a grid of them does not draw more than
 * `most` of them.
 *
 * Density is a slider a person drags, and a slide is four times the area of a
 * newsletter column, so "twice as busy" on a full-bleed background can mean
 * twenty thousand shapes: slow to draw, slow to scroll, and megabytes of PDF.
 * The slider still does something; it just stops before that.
 */
function cellFor(box, wanted, most) {
  return Math.max(wanted, Math.sqrt((box.w * box.h) / most));
}

/** The same, for a count rather than a cell size. */
const atMost = (count, most) => Math.min(Math.round(count), most);

/** A smooth closed curve through points (Catmull-Rom as cubic Béziers). */
function smoothClosed(points) {
  const n = points.length;
  const segs = [['M', points[0][0], points[0][1]]];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    segs.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
  }
  segs.push(['Z']);
  return segs;
}

function smoothOpen(points) {
  const n = points.length;
  const segs = [['M', points[0][0], points[0][1]]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    segs.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
  }
  return segs;
}

/**
 * Draw a generated graphic into a box.
 *
 * @param spec {kind, seed, scheme, density (0.2-2.5), stroke (line weight)}
 * @param opts {surface} - the colour behind it, so a graphic on a dark slide
 *   fades into the dark rather than out of it. A role or a hex; paper if unsaid.
 */
export function renderPattern(spec, box, palette, opts = {}) {
  const kind = PATTERN_KINDS[spec && spec.kind] ? spec.kind : 'network';
  const random = rng(String((spec && spec.seed) || 'slidex') + ':' + kind);
  const surface = resolveColor(opts.surface || (spec && spec.fill) || 'paper', palette) || resolveColor('paper', palette);
  const colors = schemeColors(spec && spec.scheme, palette, surface);
  const density = Math.max(0.2, Math.min(2.5, Number(spec && spec.density) || 1));
  const weight = Math.max(0.2, Math.min(4, Number(spec && spec.stroke) || 1));
  const g = { random, colors, density, weight, palette, surface, paper: surface };
  return DRAW[kind](box, g);
}

const DRAW = {
  network(box, g) {
    const { random, colors } = g;
    // Every pair of nodes is considered for a line between them, so the work
    // here grows as the square of the count; this is the one that must be
    // bounded tightly.
    const count = atMost(Math.max(6, (box.w * box.h) / 2600) * g.density, 120);
    const pts = [];
    for (let i = 0; i < count; i++) {
      pts.push({ x: box.x + random() * box.w, y: box.y + random() * box.h, r: random.range(1.2, 3.8) * g.weight, c: random.pick(colors), big: random() < 0.12 });
    }
    const ops = [];
    const reach = Math.sqrt((box.w * box.h) / count) * 1.6;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < reach) ops.push({ t: 'line', x1: pts[i].x, y1: pts[i].y, x2: pts[j].x, y2: pts[j].y, stroke: colors[0], lw: 0.6 * g.weight, opacity: 0.25 + 0.45 * (1 - d / reach) });
      }
    }
    for (const p of pts) {
      const r = p.big ? p.r * 2.2 : p.r;
      ops.push({ t: 'ellipse', cx: p.x, cy: p.y, rx: r, ry: r, fill: p.big ? g.paper : p.c, stroke: p.big ? p.c : null, lw: p.big ? 1.2 * g.weight : 0 });
    }
    return ops;
  },

  waves(box, g) {
    const { random, colors } = g;
    const lines = atMost(Math.max(3, box.h / 14) * g.density, 160);
    const ops = [];
    const freq = random.range(1, 2.6);
    const phase = random.range(0, Math.PI * 2);
    const amp = box.h / Math.max(3, lines) * random.range(1.2, 2.6);
    for (let i = 0; i < lines; i++) {
      const pts = [];
      const baseY = box.y + (box.h * (i + 0.5)) / lines;
      const localPhase = phase + i * random.range(0.12, 0.3);
      const steps = 14;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pts.push([box.x - 10 + t * (box.w + 20), baseY + Math.sin(t * Math.PI * 2 * freq + localPhase) * amp * (0.6 + 0.4 * Math.sin(i * 0.7))]);
      }
      ops.push({ t: 'path', segs: smoothOpen(pts), stroke: colors[i % colors.length], lw: random.range(0.8, 2.2) * g.weight, cap: 'round', opacity: 0.85 });
    }
    return ops;
  },

  halftone(box, g) {
    const { random, colors } = g;
    const step = cellFor(box, Math.max(4, 11 / g.density), 2600);
    const cx = box.x + random.range(0.1, 0.9) * box.w;
    const cy = box.y + random.range(0.1, 0.9) * box.h;
    const reach = Math.hypot(box.w, box.h) * random.range(0.55, 0.9);
    const angle = random.range(0, Math.PI);
    const ops = [];
    for (let y = box.y + step / 2; y < box.y + box.h; y += step) {
      for (let x = box.x + step / 2; x < box.x + box.w; x += step) {
        const d = Math.hypot(x - cx, y - cy) / reach;
        const wave = 0.5 + 0.5 * Math.sin((x * Math.cos(angle) + y * Math.sin(angle)) / (step * 3));
        const r = (step / 2) * Math.max(0, 1 - d) * (0.55 + 0.45 * wave) * g.weight;
        if (r < 0.35) continue;
        ops.push({ t: 'ellipse', cx: x, cy: y, rx: r, ry: r, fill: colors[0] });
      }
    }
    return ops;
  },

  contours(box, g) {
    const { random, colors } = g;
    const ops = [];
    const centres = random.int(1, 3);
    for (let c = 0; c < centres; c++) {
      const cx = box.x + random.range(0.15, 0.85) * box.w;
      const cy = box.y + random.range(0.15, 0.85) * box.h;
      const rings = Math.round(random.int(5, 9) * g.density);
      const harmonics = [random.range(0, 6), random.range(0, 6), random.range(0, 6)];
      const maxR = Math.max(box.w, box.h) * random.range(0.35, 0.7);
      for (let i = 1; i <= rings; i++) {
        const base = (maxR * i) / rings;
        const pts = [];
        const n = 18;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const wobble = 1 + 0.16 * Math.sin(a * 2 + harmonics[0]) + 0.09 * Math.sin(a * 3 + harmonics[1] + i * 0.2) + 0.05 * Math.sin(a * 5 + harmonics[2]);
          pts.push([cx + Math.cos(a) * base * wobble, cy + Math.sin(a) * base * wobble * 0.85]);
        }
        ops.push({ t: 'path', segs: smoothClosed(pts), stroke: colors[(c + i) % colors.length], lw: 0.9 * g.weight, opacity: 0.35 + 0.6 * (1 - i / rings) });
      }
    }
    return ops;
  },

  mosaic(box, g) {
    const { random, colors } = g;
    // Two triangles to a cell, so the budget is half what it looks like.
    const cell = cellFor(box, Math.max(10, 40 / g.density), 900);
    const cols = Math.ceil(box.w / cell) + 1;
    const rows = Math.ceil(box.h / cell) + 1;
    const jitter = [];
    for (let r = 0; r <= rows; r++) {
      jitter.push([]);
      for (let c = 0; c <= cols; c++) {
        const edge = r === 0 || c === 0 || r === rows || c === cols;
        jitter[r].push([box.x + c * cell + (edge ? 0 : random.range(-0.3, 0.3) * cell), box.y + r * cell + (edge ? 0 : random.range(-0.3, 0.3) * cell)]);
      }
    }
    const ops = [];
    const fills = [...colors, ...colors.map((c) => mix(c, g.paper, 0.45)), ...colors.map((c) => mix(c, g.paper, 0.8))];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = jitter[r][c], b = jitter[r][c + 1], d = jitter[r + 1][c], e = jitter[r + 1][c + 1];
        const tris = random() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
        for (const t of tris) {
          ops.push({ t: 'path', segs: [['M', ...t[0]], ['L', ...t[1]], ['L', ...t[2]], ['Z']], fill: random.pick(fills), stroke: g.paper, lw: 0.4 * g.weight, join: 'round' });
        }
      }
    }
    return ops;
  },

  orbits(box, g) {
    const { random, colors } = g;
    const cx = box.x + random.range(0.2, 0.8) * box.w;
    const cy = box.y + random.range(0.2, 0.8) * box.h;
    const rings = Math.round(random.int(4, 8) * g.density);
    const maxR = Math.hypot(box.w, box.h) * 0.55;
    const ops = [];
    for (let i = 1; i <= rings; i++) {
      const r = (maxR * i) / (rings + 1);
      const start = random.range(0, Math.PI * 2);
      const sweep = random.range(Math.PI * 0.6, Math.PI * 1.7);
      const color = colors[i % colors.length];
      const steps = 8;
      const pts = [];
      for (let s = 0; s <= steps; s++) {
        const a = start + (sweep * s) / steps;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      ops.push({ t: 'path', segs: smoothOpen(pts), stroke: color, lw: random.range(0.8, 2.6) * g.weight, cap: 'round' });
      const end = pts[pts.length - 1];
      const dot = random.range(1.8, 4) * g.weight;
      ops.push({ t: 'ellipse', cx: end[0], cy: end[1], rx: dot, ry: dot, fill: colors[(i + 1) % colors.length] });
    }
    return ops;
  },

  bars(box, g) {
    const { random, colors } = g;
    const n = atMost(Math.max(6, box.w / 9) * g.density, 400);
    const w = box.w / n;
    const ops = [];
    let level = random.range(0.3, 0.7);
    for (let i = 0; i < n; i++) {
      level = Math.max(0.08, Math.min(1, level + random.range(-0.18, 0.2)));
      const h = level * box.h;
      ops.push({ t: 'rect', x: box.x + i * w + w * 0.14, y: box.y + box.h - h, w: w * 0.72, h, r: Math.min(2, w * 0.2), fill: colors[Math.floor((i / n) * colors.length) % colors.length], opacity: 0.55 + 0.45 * level });
    }
    return ops;
  },

  hexes(box, g) {
    const { random, colors } = g;
    const size = cellFor(box, Math.max(6, 18 / g.density), 1400) / 1.6;
    const hw = Math.sqrt(3) * size;
    const ops = [];
    let row = 0;
    for (let y = box.y - size; y < box.y + box.h + size; y += size * 1.5, row++) {
      for (let x = box.x - hw + (row % 2 ? hw / 2 : 0); x < box.x + box.w + hw; x += hw) {
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          pts.push([x + Math.cos(a) * size * 0.92, y + Math.sin(a) * size * 0.92]);
        }
        const segs = [['M', ...pts[0]], ...pts.slice(1).map((p) => ['L', ...p]), ['Z']];
        const roll = random();
        if (roll < 0.22) ops.push({ t: 'path', segs, fill: random.pick(colors), opacity: random.range(0.5, 1) });
        else if (roll < 0.6) ops.push({ t: 'path', segs, stroke: colors[0], lw: 0.7 * g.weight, opacity: 0.35, join: 'round' });
      }
    }
    return ops;
  },

  confetti(box, g) {
    const { random, colors } = g;
    const count = atMost(Math.max(8, (box.w * box.h) / 1400) * g.density, 900);
    const ops = [];
    for (let i = 0; i < count; i++) {
      const x = box.x + random() * box.w;
      const y = box.y + random() * box.h;
      const s = random.range(2.5, 6.5) * g.weight;
      const color = random.pick(colors);
      const shape = random.int(0, 3);
      if (shape === 0) ops.push({ t: 'ellipse', cx: x, cy: y, rx: s / 2, ry: s / 2, fill: color });
      else if (shape === 1) ops.push({ t: 'path', segs: [['M', x - s / 2, y], ['L', x + s / 2, y], ['M', x, y - s / 2], ['L', x, y + s / 2]], stroke: color, lw: 1.3 * g.weight, cap: 'round' });
      else if (shape === 2) {
        const a = random.range(0, Math.PI * 2);
        const pts = [0, 1, 2].map((k) => [x + Math.cos(a + (k * 2 * Math.PI) / 3) * s * 0.6, y + Math.sin(a + (k * 2 * Math.PI) / 3) * s * 0.6]);
        ops.push({ t: 'path', segs: [['M', ...pts[0]], ['L', ...pts[1]], ['L', ...pts[2]], ['Z']], fill: color });
      } else {
        ops.push({ t: 'path', segs: smoothOpen([[x - s, y], [x - s / 3, y - s / 2], [x + s / 3, y + s / 2], [x + s, y]]), stroke: color, lw: 1.2 * g.weight, cap: 'round' });
      }
    }
    return ops;
  },

  blobs(box, g) {
    const { random, colors } = g;
    const count = Math.round(random.int(3, 5) * g.density);
    const ops = [];
    for (let i = 0; i < count; i++) {
      const cx = box.x + random.range(0, 1) * box.w;
      const cy = box.y + random.range(0, 1) * box.h;
      const r = Math.max(box.w, box.h) * random.range(0.15, 0.42);
      const pts = [];
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = r * random.range(0.72, 1.12);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      ops.push({ t: 'path', segs: smoothClosed(pts), fill: colors[i % colors.length], opacity: random.range(0.55, 0.9) });
    }
    if (random() < 0.7) {
      const r = Math.min(box.w, box.h) * random.range(0.05, 0.12);
      ops.push({ t: 'path', segs: ellipsePath(box.x + random() * box.w, box.y + random() * box.h, r, r), stroke: colors[colors.length - 1], lw: 1.5 * g.weight });
    }
    return ops;
  },

  /* ------------------------------------------------- lines and fields */

  /**
   * Streamlines through a field of angles that turns slowly across the box.
   * Nothing in it is random except where the lines start; the shape of the
   * field is arithmetic, which is why it reads as weather rather than as mess.
   */
  flow(box, g) {
    const { random, colors } = g;
    const lines = atMost(Math.max(8, (box.w + box.h) / 22) * g.density, 260);
    const scale = random.range(0.004, 0.011);
    const turn = random.range(0, Math.PI * 2);
    const swirl = random.range(1.2, 3.2);
    const angleAt = (x, y) => turn
      + Math.sin((x - box.x) * scale * swirl) * 1.5
      + Math.cos((y - box.y) * scale * 2.1) * 1.5;
    const ops = [];
    const step = Math.max(3, Math.min(box.w, box.h) / 26);
    for (let i = 0; i < lines; i++) {
      let x = box.x + random() * box.w;
      let y = box.y + random() * box.h;
      const pts = [[x, y]];
      for (let k = 0; k < 22; k++) {
        const a = angleAt(x, y);
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        if (x < box.x - step || x > box.x + box.w + step || y < box.y - step || y > box.y + box.h + step) break;
        pts.push([x, y]);
      }
      if (pts.length < 3) continue;
      ops.push({ t: 'path', segs: smoothOpen(pts), stroke: colors[i % colors.length], lw: random.range(0.6, 1.8) * g.weight, cap: 'round', opacity: random.range(0.4, 0.9) });
    }
    return ops;
  },

  /** Filled bands following a wandering line: a map's contours, shaded in. */
  topography(box, g) {
    const { random, colors } = g;
    const bands = atMost(Math.max(4, box.h / 26) * g.density, 90);
    const freq = random.range(0.8, 2.2);
    const phase = random.range(0, Math.PI * 2);
    const amp = box.h * random.range(0.07, 0.17);
    const ops = [];
    const at = (t, i) => box.y + (box.h * (i + 0.6)) / (bands + 1)
      + Math.sin(t * Math.PI * 2 * freq + phase + i * 0.55) * amp
      + Math.sin(t * Math.PI * 2 * freq * 1.9 + phase) * amp * 0.28;
    // One colour, deepening band by band. Four different hues laid over each
    // other at half opacity average out to grey, which is what a map of
    // nowhere looks like.
    const base = colors[0];
    const far = colors[colors.length - 1];
    for (let i = bands - 1; i >= 0; i--) {
      const top = [];
      const steps = 16;
      for (let s = 0; s <= steps; s++) top.push([box.x - 6 + (s / steps) * (box.w + 12), at(s / steps, i)]);
      const segs = smoothOpen(top);
      segs.push(['L', box.x + box.w + 6, box.y + box.h + 6], ['L', box.x - 6, box.y + box.h + 6], ['Z']);
      const t = bands < 2 ? 0 : i / (bands - 1);
      ops.push({ t: 'path', segs, fill: mix(mix(base, far, t * 0.5), g.surface, 0.72 * t) });
    }
    return ops;
  },

  /** Lines radiating from a point off to one side: a sunburst, half seen. */
  rays(box, g) {
    const { random, colors } = g;
    const cx = box.x + random.range(-0.25, 1.25) * box.w;
    const cy = box.y + random.range(-0.25, 1.25) * box.h;
    const count = Math.round(random.int(14, 30) * g.density);
    const reach = Math.hypot(box.w, box.h) * 1.4;
    const start = random.range(0, Math.PI * 2);
    const wedge = random() < 0.4;
    const ops = [];
    for (let i = 0; i < count; i++) {
      const a = start + (i / count) * Math.PI * 2;
      const color = colors[i % colors.length];
      if (wedge) {
        const b = a + (Math.PI * 2) / count / 2;
        ops.push({
          t: 'path',
          segs: [['M', cx, cy], ['L', cx + Math.cos(a) * reach, cy + Math.sin(a) * reach], ['L', cx + Math.cos(b) * reach, cy + Math.sin(b) * reach], ['Z']],
          fill: color,
          opacity: 0.16 + 0.24 * ((i % 3) / 3),
        });
      } else {
        ops.push({
          t: 'line',
          x1: cx + Math.cos(a) * Math.min(box.w, box.h) * 0.06,
          y1: cy + Math.sin(a) * Math.min(box.w, box.h) * 0.06,
          x2: cx + Math.cos(a) * reach,
          y2: cy + Math.sin(a) * reach,
          stroke: color,
          lw: random.range(0.6, 2.4) * g.weight,
          cap: 'round',
          opacity: random.range(0.3, 0.85),
        });
      }
    }
    return ops;
  },

  /** One line turning around a centre, as dots or as a drawn curve. */
  spiral(box, g) {
    const { random, colors } = g;
    const cx = box.x + random.range(0.3, 0.7) * box.w;
    const cy = box.y + random.range(0.3, 0.7) * box.h;
    const turns = random.range(2.5, 5.5);
    const maxR = Math.min(box.w, box.h) * random.range(0.42, 0.62);
    const asDots = random() < 0.5;
    const steps = atMost(Math.max(40, 150 * g.density), 400);
    const pts = [];
    const ops = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      const r = maxR * t;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * random.range(0.98, 1.02);
      if (asDots) {
        if (i % 2) continue;
        const dot = (0.7 + 2.6 * t) * g.weight;
        ops.push({ t: 'ellipse', cx: x, cy: y, rx: dot, ry: dot, fill: colors[Math.floor(t * colors.length * 2) % colors.length], opacity: 0.35 + 0.6 * t });
      } else {
        pts.push([x, y]);
      }
    }
    if (!asDots) ops.push({ t: 'path', segs: smoothOpen(pts), stroke: colors[0], lw: 1.4 * g.weight, cap: 'round', opacity: 0.8 });
    return ops;
  },

  /* ---------------------------------------------------- grids and tiles */

  /** Graph paper, with a few squares filled in. */
  grid(box, g) {
    const { random, colors } = g;
    const cell = cellFor(box, Math.max(8, 26 / g.density), 2000);
    const cols = Math.ceil(box.w / cell);
    const rows = Math.ceil(box.h / cell);
    const ops = [];
    const dots = random() < 0.4;
    if (dots) {
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          ops.push({ t: 'ellipse', cx: box.x + c * cell, cy: box.y + r * cell, rx: 0.9 * g.weight, ry: 0.9 * g.weight, fill: colors[0], opacity: 0.45 });
        }
      }
    } else {
      for (let c = 0; c <= cols; c++) ops.push({ t: 'line', x1: box.x + c * cell, y1: box.y, x2: box.x + c * cell, y2: box.y + box.h, stroke: colors[0], lw: 0.5 * g.weight, opacity: 0.3 });
      for (let r = 0; r <= rows; r++) ops.push({ t: 'line', x1: box.x, y1: box.y + r * cell, x2: box.x + box.w, y2: box.y + r * cell, stroke: colors[0], lw: 0.5 * g.weight, opacity: 0.3 });
    }
    // A handful of squares picked out, which is what stops it being wallpaper.
    const filled = Math.round(random.int(3, 9) * g.density);
    for (let i = 0; i < filled; i++) {
      const c = random.int(0, Math.max(0, cols - 1));
      const r = random.int(0, Math.max(0, rows - 1));
      ops.push({ t: 'rect', x: box.x + c * cell, y: box.y + r * cell, w: cell, h: cell, fill: random.pick(colors), opacity: random.range(0.25, 0.75) });
    }
    return ops;
  },

  /** Cubes on an isometric grid, each face a different shade. */
  isometric(box, g) {
    const { random, colors } = g;
    // Three faces to a cube, and about half the places are left empty.
    const size = cellFor(box, Math.max(10, 34 / g.density), 900);
    const w = size * Math.cos(Math.PI / 6);
    const h = size / 2;
    const ops = [];
    const face = (cx, cy, which) => {
      const top = [[cx, cy - size / 2], [cx + w, cy - h], [cx, cy], [cx - w, cy - h]];
      const left = [[cx - w, cy - h], [cx, cy], [cx, cy + size], [cx - w, cy + size - h]];
      const right = [[cx + w, cy - h], [cx, cy], [cx, cy + size], [cx + w, cy + size - h]];
      return [top, left, right][which];
    };
    for (let row = -1; row * h * 1.5 < box.h + size * 2; row++) {
      for (let col = -1; col * w * 2 < box.w + size * 2; col++) {
        const cx = box.x + col * w * 2 + (row % 2 ? w : 0);
        const cy = box.y + row * (size * 0.75);
        if (random() > 0.55) continue;
        const base = random.pick(colors);
        for (let f = 0; f < 3; f++) {
          const pts = face(cx, cy, f);
          ops.push({
            t: 'path',
            segs: [['M', ...pts[0]], ...pts.slice(1).map((pt) => ['L', ...pt]), ['Z']],
            fill: mix(base, g.surface, [0, 0.35, 0.6][f]),
            opacity: 0.9,
          });
        }
      }
    }
    return ops;
  },

  /** Bars over and under each other, the way a basket is woven. */
  weave(box, g) {
    const { random, colors } = g;
    const band = Math.max(9, 30 / g.density);
    const gap = band * random.range(0.25, 0.55);
    const pitch = band + gap;
    const ops = [];
    const rows = Math.ceil(box.h / pitch) + 1;
    const cols = Math.ceil(box.w / pitch) + 1;
    // Horizontals first, then the verticals that pass over them, then the
    // pieces of horizontal that pass back over those: an over-under weave.
    for (let r = 0; r < rows; r++) {
      ops.push({ t: 'rect', x: box.x, y: box.y + r * pitch, w: box.w, h: band, fill: colors[r % colors.length], opacity: 0.55, r: band * 0.18 });
    }
    for (let c = 0; c < cols; c++) {
      ops.push({ t: 'rect', x: box.x + c * pitch, y: box.y, w: band, h: box.h, fill: colors[(c + 1) % colors.length], opacity: 0.72, r: band * 0.18 });
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2) continue;
        ops.push({ t: 'rect', x: box.x + c * pitch, y: box.y + r * pitch, w: band, h: band, fill: colors[r % colors.length], opacity: 0.85, r: band * 0.18 });
      }
    }
    return ops;
  },

  /** A diamond lattice with a node at every crossing. */
  lattice(box, g) {
    const { random, colors } = g;
    const cell = Math.max(14, 44 / g.density);
    const ops = [];
    const reach = Math.hypot(box.w, box.h);
    const angle = random.pick([Math.PI / 4, Math.PI / 3, Math.PI / 6]);
    for (const dir of [angle, -angle]) {
      const stepX = cell / Math.abs(Math.sin(dir)) || cell;
      for (let i = -Math.ceil(reach / stepX); i * stepX < box.w + reach; i++) {
        const x = box.x + i * stepX;
        ops.push({
          t: 'line',
          x1: x - Math.cos(dir) * reach, y1: box.y + box.h / 2 - Math.sin(dir) * reach,
          x2: x + Math.cos(dir) * reach, y2: box.y + box.h / 2 + Math.sin(dir) * reach,
          stroke: colors[0], lw: 0.6 * g.weight, opacity: 0.35,
        });
      }
    }
    const nodes = Math.round(random.int(6, 16) * g.density);
    for (let i = 0; i < nodes; i++) {
      const r = random.range(1.6, 4) * g.weight;
      ops.push({ t: 'ellipse', cx: box.x + random() * box.w, cy: box.y + random() * box.h, rx: r, ry: r, fill: random.pick(colors), opacity: 0.85 });
    }
    return ops;
  },

  /** Traces turning at right angles between pads, the way a board is laid out. */
  circuit(box, g) {
    const { random, colors } = g;
    const step = Math.max(10, 30 / g.density);
    const traces = Math.round(random.int(5, 12) * g.density);
    const ops = [];
    const snap = (v, origin) => origin + Math.round((v - origin) / step) * step;
    for (let i = 0; i < traces; i++) {
      let x = snap(box.x + random() * box.w, box.x);
      let y = snap(box.y + random() * box.h, box.y);
      const segs = [['M', x, y]];
      const color = colors[i % colors.length];
      const legs = random.int(3, 8);
      for (let k = 0; k < legs; k++) {
        const horizontal = k % 2 === 0;
        const run = step * random.int(1, 4) * (random() < 0.5 ? -1 : 1);
        if (horizontal) x = Math.max(box.x, Math.min(box.x + box.w, x + run));
        else y = Math.max(box.y, Math.min(box.y + box.h, y + run));
        segs.push(['L', x, y]);
      }
      ops.push({ t: 'path', segs, stroke: color, lw: 1.1 * g.weight, cap: 'round', join: 'round', opacity: 0.75 });
      const pad = 2.4 * g.weight;
      ops.push({ t: 'ellipse', cx: segs[0][1], cy: segs[0][2], rx: pad, ry: pad, fill: color });
      ops.push({ t: 'ellipse', cx: x, cy: y, rx: pad, ry: pad, fill: g.surface, stroke: color, lw: 1.1 * g.weight });
    }
    return ops;
  },

  /* ------------------------------------------------------------- dots */

  /** Small dots, a few bright ones, and a haze behind them. */
  starfield(box, g) {
    const { random, colors } = g;
    const ops = [];
    // The haze first, so the stars are on it rather than under it.
    const clouds = random.int(1, 3);
    for (let i = 0; i < clouds; i++) {
      const r = Math.max(box.w, box.h) * random.range(0.18, 0.4);
      ops.push({
        t: 'ellipse',
        cx: box.x + random() * box.w, cy: box.y + random() * box.h,
        rx: r, ry: r * random.range(0.5, 1),
        fill: colors[i % colors.length], opacity: 0.09,
      });
    }
    const count = atMost(Math.max(24, (box.w * box.h) / 900) * g.density, 1100);
    for (let i = 0; i < count; i++) {
      const bright = random() < 0.06;
      const r = (bright ? random.range(1.6, 3) : random.range(0.35, 1.2)) * g.weight;
      const x = box.x + random() * box.w;
      const y = box.y + random() * box.h;
      const color = bright ? random.pick(colors) : colors[0];
      ops.push({ t: 'ellipse', cx: x, cy: y, rx: r, ry: r, fill: color, opacity: bright ? 0.95 : random.range(0.25, 0.8) });
      if (bright) {
        const arm = r * 3.2;
        ops.push({ t: 'path', segs: [['M', x - arm, y], ['L', x + arm, y], ['M', x, y - arm], ['L', x, y + arm]], stroke: color, lw: 0.5 * g.weight, cap: 'round', opacity: 0.5 });
      }
    }
    return ops;
  },

  /**
   * Circles packed against each other, largest first, none overlapping.
   * Each one is tried a few times and dropped if it will not fit, which is
   * what makes the sizes look chosen rather than scattered.
   */
  bubbles(box, g) {
    const { random, colors } = g;
    // Each circle is tried against every one already placed, so this grows as
    // the square of the count as well.
    const want = atMost(Math.max(10, (box.w * box.h) / 2600) * g.density, 260);
    const biggest = Math.min(box.w, box.h) * 0.22;
    const placed = [];
    for (let i = 0; i < want; i++) {
      const wanted = biggest * Math.pow(random.range(0.16, 1), 1.6);
      for (let attempt = 0; attempt < 14; attempt++) {
        const x = box.x + random() * box.w;
        const y = box.y + random() * box.h;
        let room = wanted;
        for (const other of placed) {
          room = Math.min(room, Math.hypot(x - other.x, y - other.y) - other.r);
          if (room < 3) break;
        }
        if (room >= 3) { placed.push({ x, y, r: room, c: random.pick(colors) }); break; }
      }
    }
    const outline = random() < 0.35;
    return placed.map((c) => (outline
      ? { t: 'ellipse', cx: c.x, cy: c.y, rx: c.r, ry: c.r, stroke: c.c, lw: 1.1 * g.weight, opacity: 0.8 }
      : { t: 'ellipse', cx: c.x, cy: c.y, rx: c.r, ry: c.r, fill: c.c, opacity: random.range(0.45, 0.9) }));
  },

  /** Points with a line through them: a scatter plot, with no numbers on it. */
  scatter(box, g) {
    const { random, colors } = g;
    const count = atMost(Math.max(14, box.w / 7) * g.density, 500);
    const slope = random.range(-0.8, 0.8);
    const spread = box.h * random.range(0.1, 0.26);
    const mid = box.y + box.h * random.range(0.35, 0.65);
    const ops = [];
    const at = (t) => mid - slope * box.h * (t - 0.5);
    // The trend first, so the points sit on top of it.
    ops.push({
      t: 'line',
      x1: box.x, y1: at(0), x2: box.x + box.w, y2: at(1),
      stroke: colors[colors.length - 1], lw: 1.6 * g.weight, opacity: 0.55, dash: [6 * g.weight, 5 * g.weight],
    });
    for (let i = 0; i < count; i++) {
      const t = random();
      const noise = (random() + random() + random() - 1.5) * spread;
      const y = Math.max(box.y + 2, Math.min(box.y + box.h - 2, at(t) + noise));
      const r = random.range(1.6, 4.4) * g.weight;
      ops.push({ t: 'ellipse', cx: box.x + t * box.w, cy: y, rx: r, ry: r, fill: colors[i % colors.length], opacity: random.range(0.45, 0.95) });
    }
    return ops;
  },

  /* ----------------------------------------------------------- shapes */

  /** Bands across the box at an angle, of varying width. */
  stripes(box, g) {
    const { random, colors } = g;
    const angle = random.pick([0, Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI / 6]);
    const reach = Math.hypot(box.w, box.h);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const ops = [];
    let at = -reach / 2;
    let i = 0;
    while (at < reach / 2) {
      const width = (reach / random.range(8, 26)) * (1 / Math.max(0.4, g.density));
      const a = angle;
      const nx = Math.cos(a + Math.PI / 2);
      const ny = Math.sin(a + Math.PI / 2);
      const x0 = cx + nx * at;
      const y0 = cy + ny * at;
      const x1 = x0 + nx * width;
      const y1 = y0 + ny * width;
      const dx = Math.cos(a) * reach;
      const dy = Math.sin(a) * reach;
      ops.push({
        t: 'path',
        segs: [['M', x0 - dx, y0 - dy], ['L', x0 + dx, y0 + dy], ['L', x1 + dx, y1 + dy], ['L', x1 - dx, y1 - dy], ['Z']],
        fill: colors[i % colors.length],
        opacity: random.range(0.3, 0.85),
      });
      at += width + width * random.range(0.35, 1.6);
      i++;
    }
    return ops;
  },

  /** Nested arcs from a corner, like the rings of a record. */
  arcs(box, g) {
    const { random, colors } = g;
    const corner = random.int(0, 3);
    const cx = box.x + (corner === 1 || corner === 2 ? box.w : 0);
    const cy = box.y + (corner >= 2 ? box.h : 0);
    const count = Math.round(random.int(6, 14) * g.density);
    const maxR = Math.hypot(box.w, box.h) * random.range(0.8, 1.15);
    const filled = random() < 0.4;
    const ops = [];
    for (let i = count; i >= 1; i--) {
      const r = (maxR * i) / count;
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const segs = smoothClosed(pts);
      if (filled) ops.push({ t: 'path', segs, fill: colors[i % colors.length], opacity: 0.2 + 0.5 * (1 - i / count) });
      else ops.push({ t: 'path', segs, stroke: colors[i % colors.length], lw: random.range(0.8, 2.6) * g.weight, opacity: 0.5 + 0.4 * (1 - i / count) });
    }
    return ops;
  },

  /** A skyline of rectangles, each a step up or down from the last. */
  steps(box, g) {
    const { random, colors } = g;
    const n = atMost(Math.max(5, box.w / 26) * g.density, 300);
    const w = box.w / n;
    const fromTop = random() < 0.35;
    const ops = [];
    let level = random.range(0.25, 0.6);
    for (let i = 0; i < n; i++) {
      level = Math.max(0.1, Math.min(1, level + random.range(-0.22, 0.24)));
      const h = level * box.h;
      ops.push({
        t: 'rect',
        x: box.x + i * w,
        y: fromTop ? box.y : box.y + box.h - h,
        w: w + 0.5,
        h,
        fill: colors[Math.floor(level * colors.length) % colors.length],
        opacity: 0.35 + 0.5 * level,
      });
    }
    return ops;
  },

  /** Angular fragments, as though something were broken and laid out flat. */
  shards(box, g) {
    const { random, colors } = g;
    const count = Math.round(random.int(7, 18) * g.density);
    const ops = [];
    for (let i = 0; i < count; i++) {
      const cx = box.x + random() * box.w;
      const cy = box.y + random() * box.h;
      const r = Math.min(box.w, box.h) * random.range(0.08, 0.3);
      const corners = random.int(3, 5);
      const turn = random.range(0, Math.PI * 2);
      const pts = [];
      for (let k = 0; k < corners; k++) {
        const a = turn + (k / corners) * Math.PI * 2 + random.range(-0.25, 0.25);
        const rr = r * random.range(0.55, 1.15);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      const segs = [['M', ...pts[0]], ...pts.slice(1).map((pt) => ['L', ...pt]), ['Z']];
      const color = random.pick(colors);
      if (random() < 0.3) ops.push({ t: 'path', segs, stroke: color, lw: 1.2 * g.weight, join: 'round', opacity: 0.8 });
      else ops.push({ t: 'path', segs, fill: color, opacity: random.range(0.3, 0.85) });
    }
    return ops;
  },
};
