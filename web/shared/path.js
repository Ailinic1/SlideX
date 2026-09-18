// SVG path data, reduced to what a PDF can draw.
//
// Copied from Newsx (web/shared/path.js), unchanged but for this note.
//
// Icons, chart shapes and generated graphics are all written as SVG path data,
// because that is how they are drawn on screen. A PDF has only move, line,
// cubic curve and close, so every path is parsed once into those four -
// relative commands made absolute, arcs and quadratics turned into cubics - and
// both renderers draw from the result.

const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function tokenize(d) {
  const out = [];
  const re = /([mlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gi;
  let m;
  while ((m = re.exec(String(d || '')))) out.push(m[1] ? m[1] : parseFloat(m[2]));
  return out;
}

/**
 * Parse path data into absolute segments: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z'].
 */
export function parsePath(d) {
  const tokens = tokenize(fixArcFlags(d));
  const segs = [];
  let i = 0;
  let cmd = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl = null; // [x, y, kind] for S and T
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') { cmd = tokens[i]; i++; }
    else if (!cmd) { i++; continue; }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const n = ARGS[lower];
    if (lower === 'z') {
      segs.push(['Z']);
      x = sx; y = sy; lastCtrl = null;
      cmd = null;
      continue;
    }
    if (i + n > tokens.length || tokens.slice(i, i + n).some((t) => typeof t !== 'number')) break;
    const a = tokens.slice(i, i + n);
    i += n;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (lower) {
      case 'm':
        x = a[0] + ox; y = a[1] + oy; sx = x; sy = y;
        segs.push(['M', x, y]);
        cmd = rel ? 'l' : 'L'; // further pairs are lines
        lastCtrl = null;
        break;
      case 'l':
        x = a[0] + ox; y = a[1] + oy;
        segs.push(['L', x, y]); lastCtrl = null;
        break;
      case 'h':
        x = a[0] + ox;
        segs.push(['L', x, y]); lastCtrl = null;
        break;
      case 'v':
        y = a[0] + oy;
        segs.push(['L', x, y]); lastCtrl = null;
        break;
      case 'c': {
        const [x1, y1, x2, y2, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy];
        segs.push(['C', x1, y1, x2, y2, ex, ey]);
        lastCtrl = [x2, y2, 'c']; x = ex; y = ey;
        break;
      }
      case 's': {
        const [x1, y1] = lastCtrl && lastCtrl[2] === 'c' ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const [x2, y2, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
        segs.push(['C', x1, y1, x2, y2, ex, ey]);
        lastCtrl = [x2, y2, 'c']; x = ex; y = ey;
        break;
      }
      case 'q': {
        const [qx, qy, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
        segs.push(quadToCubic(x, y, qx, qy, ex, ey));
        lastCtrl = [qx, qy, 'q']; x = ex; y = ey;
        break;
      }
      case 't': {
        const [qx, qy] = lastCtrl && lastCtrl[2] === 'q' ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const [ex, ey] = [a[0] + ox, a[1] + oy];
        segs.push(quadToCubic(x, y, qx, qy, ex, ey));
        lastCtrl = [qx, qy, 'q']; x = ex; y = ey;
        break;
      }
      case 'a': {
        const ex = a[5] + ox;
        const ey = a[6] + oy;
        for (const c of arcToCubics(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey)) segs.push(c);
        x = ex; y = ey; lastCtrl = null;
        break;
      }
      default:
        break;
    }
  }
  return segs;
}

/** "a1 1 0 01.5.5" -> "a1 1 0 0 1 .5.5": arc flags are single digits with no separator required. */
function fixArcFlags(d) {
  return String(d || '').replace(/([aA])([^mlhvcsqtazMLHVCSQTAZ]*)/g, (all, cmd, body) => {
    const nums = [];
    let pos = 0;
    let slot = 0;
    const src = body;
    let out = '';
    while (pos < src.length) {
      const rest = src.slice(pos);
      const ws = rest.match(/^[\s,]+/);
      if (ws) { pos += ws[0].length; continue; }
      if (slot % 7 === 3 || slot % 7 === 4) {
        // A flag: exactly one character, 0 or 1.
        if (rest[0] === '0' || rest[0] === '1') { nums.push(rest[0]); pos += 1; slot++; continue; }
      }
      const m = rest.match(/^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i);
      if (!m) { out += rest; break; }
      nums.push(m[0]); pos += m[0].length; slot++;
    }
    return cmd + nums.join(' ') + (out ? ' ' + out : '') + ' ';
  });
}

function quadToCubic(x0, y0, qx, qy, x, y) {
  return ['C', x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y];
}

/** The endpoint-parameterised arc of SVG, as up to four cubic Béziers. */
export function arcToCubics(x1, y1, rx, ry, angle, largeArc, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [['L', x2, y2]];
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const vecAngle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  let theta = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / parts;
  const out = [];
  const k = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < parts; i++) {
    const t1 = theta + i * step;
    const t2 = t1 + step;
    const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
    const p = (px, py) => [cx + rx * px * cos - ry * py * sin, cy + rx * px * sin + ry * py * cos];
    const [ax, ay] = p(c1 - k * s1, s1 + k * c1);
    const [bx, by] = p(c2 + k * s2, s2 - k * c2);
    const [ex, ey] = p(c2, s2);
    out.push(['C', ax, ay, bx, by, ex, ey]);
  }
  // Land exactly on the endpoint, whatever the floating point did on the way.
  const last = out[out.length - 1];
  last[5] = x2; last[6] = y2;
  return out;
}

/** Apply [a b c d e f] to every point. */
export function transformPath(segs, [a, b, c, d, e, f]) {
  const pt = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  return segs.map((s) => {
    if (s[0] === 'Z') return s;
    const out = [s[0]];
    for (let i = 1; i < s.length; i += 2) out.push(...pt(s[i], s[i + 1]));
    return out;
  });
}

const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function pathToD(segs) {
  return segs.map((s) => s[0] + s.slice(1).map(fmt).join(' ')).join('');
}

/** A rounded rectangle as path segments (used for clips and for badges). */
export function roundedRect(x, y, w, h, r = 0) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  const k = 0.5523 * r;
  return [
    ['M', x + r, y], ['L', x + w - r, y], ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ['L', x + w, y + h - r], ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ['L', x + r, y + h], ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y], ['Z'],
  ];
}

export function ellipsePath(cx, cy, rx, ry) {
  const kx = 0.5523 * rx, ky = 0.5523 * ry;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
}

/** A pie slice or a donut segment, angles in radians clockwise from 12 o'clock. */
export function slicePath(cx, cy, r, inner, start, end) {
  const sweep = end - start;
  if (sweep >= Math.PI * 2 - 1e-6) {
    const outer = ellipsePath(cx, cy, r, r);
    return inner > 0 ? outer.concat(reverseRing(cx, cy, inner)) : outer;
  }
  const at = (radius, a) => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
  const large = sweep > Math.PI ? 1 : 0;
  const [ox1, oy1] = at(r, start);
  const [ox2, oy2] = at(r, end);
  const segs = [['M', ox1, oy1], ...arcToCubics(ox1, oy1, r, r, 0, large, 1, ox2, oy2)];
  if (inner > 0) {
    const [ix2, iy2] = at(inner, end);
    const [ix1, iy1] = at(inner, start);
    segs.push(['L', ix2, iy2], ...arcToCubics(ix2, iy2, inner, inner, 0, large, 0, ix1, iy1));
  } else {
    segs.push(['L', cx, cy]);
  }
  segs.push(['Z']);
  return segs;
}

/** A circle drawn counter-clockwise, to punch the hole in a full donut. */
function reverseRing(cx, cy, r) {
  const k = 0.5523 * r;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy - k, cx + k, cy - r, cx, cy - r],
    ['C', cx - k, cy - r, cx - r, cy - k, cx - r, cy],
    ['C', cx - r, cy + k, cx - k, cy + r, cx, cy + r],
    ['C', cx + k, cy + r, cx + r, cy + k, cx + r, cy],
    ['Z'],
  ];
}
