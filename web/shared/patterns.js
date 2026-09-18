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

export const PATTERN_KINDS = {
  network: 'Network',
  waves: 'Waves',
  halftone: 'Halftone',
  contours: 'Contours',
  mosaic: 'Mosaic',
  orbits: 'Orbits',
  bars: 'Data bars',
  hexes: 'Hexagons',
  confetti: 'Confetti',
  blobs: 'Blobs',
};

export const PATTERN_SCHEMES = {
  brand: 'Deck colours',
  primary: 'Shades of primary',
  accent: 'Shades of accent',
  soft: 'Soft tints',
  ink: 'Ink only',
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

function schemeColors(scheme, palette) {
  const r = (role) => resolveColor(role, palette);
  const paper = r('paper');
  switch (scheme) {
    case 'primary': return [r('primary'), mix(r('primary'), paper, 0.3), mix(r('primary'), paper, 0.55), mix(r('primary'), paper, 0.78)];
    case 'accent': return [r('accent'), mix(r('accent'), paper, 0.3), mix(r('accent'), paper, 0.55), mix(r('accent'), paper, 0.78)];
    case 'soft': return [mix(r('primary'), paper, 0.8), mix(r('secondary'), paper, 0.75), mix(r('accent'), paper, 0.72), mix(r('highlight'), paper, 0.7)];
    case 'ink': return [r('ink')];
    default: return [r('primary'), r('secondary'), r('accent'), r('highlight')];
  }
}

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
 * @param spec {kind, seed, scheme, density (0.2-2), stroke (line weight multiplier)}
 */
export function renderPattern(spec, box, palette) {
  const kind = PATTERN_KINDS[spec && spec.kind] ? spec.kind : 'network';
  const random = rng(String((spec && spec.seed) || 'slidex') + ':' + kind);
  const colors = schemeColors(spec && spec.scheme, palette);
  const density = Math.max(0.2, Math.min(2.5, Number(spec && spec.density) || 1));
  const weight = Math.max(0.2, Math.min(4, Number(spec && spec.stroke) || 1));
  const g = { random, colors, density, weight, palette, paper: resolveColor('paper', palette) };
  return DRAW[kind](box, g);
}

const DRAW = {
  network(box, g) {
    const { random, colors } = g;
    const count = Math.round(Math.max(6, (box.w * box.h) / 2600) * g.density);
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
    const lines = Math.round(Math.max(3, box.h / 14) * g.density);
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
    const step = Math.max(4, 11 / g.density);
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
    const cell = Math.max(10, 40 / g.density);
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
    const n = Math.round(Math.max(6, box.w / 9) * g.density);
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
    const size = Math.max(6, 18 / g.density);
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
    const count = Math.round(Math.max(8, (box.w * box.h) / 1400) * g.density);
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
};
