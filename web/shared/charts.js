// Charts, drawn in the deck's own colours.
//
// Copied from Newsx (web/shared/charts.js), with the research-entry data source
// taken out: a deck's numbers are typed or pasted, not counted from a month.
//
// Each kind of chart here is a function from data and a box to drawing
// operations, so a chart is vector in the PDF, crisp on any projector, and
// exactly what the editor showed.
//
// data: {labels: [..], series: [{name, values: [..]}]}

import { measure } from './fonts.js';
import { resolveColor, seriesColors, mix, textOn } from './color.js';
import { slicePath, roundedRect, parsePath, transformPath, ellipsePath } from './path.js';
import { GLYPHS } from './glyphs.js';

export const CHART_KINDS = {
  bar: { label: 'Columns', hint: 'Compare a few categories, or the same thing month by month' },
  hbar: { label: 'Bars', hint: 'Compare categories with long names' },
  stacked: { label: 'Stacked columns', hint: 'Show a total and what makes it up' },
  line: { label: 'Line', hint: 'Show a trend over time' },
  area: { label: 'Area', hint: 'Show a trend, with weight' },
  pie: { label: 'Pie', hint: 'Show shares of a whole' },
  donut: { label: 'Donut', hint: 'Show shares of a whole, with the total in the middle' },
  progress: { label: 'Progress', hint: 'Show progress towards targets, like enrolment' },
  rings: { label: 'Rings', hint: 'Show one or a few percentages' },
  waffle: { label: 'Waffle', hint: 'Show a share as a grid of 100' },
  pictogram: { label: 'Pictogram', hint: 'Show a count as rows of icons' },
  kpi: { label: 'Numbers', hint: 'Show a few big numbers with labels' },
  timeline: { label: 'Timeline', hint: 'Show milestones in order' },
  table: { label: 'Table', hint: 'Show the numbers themselves' },
};

/* ------------------------------------------------------------- numbers */

export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v == null ? '' : v).replace(/[,\s$€£%]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 12,400 - or 12.4k when there is not room for all of it. */
export function formatNumber(v, opts = {}) {
  const n = toNumber(v);
  if (n == null) return '';
  const decimals = Number.isFinite(Number(opts.decimals)) && opts.decimals !== '' ? Number(opts.decimals) : (Math.abs(n) < 10 && n % 1 ? 1 : 0);
  let body;
  if (opts.compact && Math.abs(n) >= 10000) {
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
    const [div, suffix] = units.find(([d]) => Math.abs(n) >= d);
    body = trimZeros((n / div).toFixed(1)) + suffix;
  } else {
    body = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return (opts.prefix || '') + body + (opts.unit || '');
}
const trimZeros = (s) => s.replace(/\.0$/, '');

/** Round axis bounds and a tick step a person would choose. */
export function niceScale(min, max, maxTicks = 5) {
  if (!(max > min)) { max = min + 1; }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: lo, max: hi, step, ticks };
}

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

/** A table of data made whole: every series as long as the labels, numbers as numbers. */
export function normalizeData(data) {
  const labels = ((data && data.labels) || []).map((l) => String(l == null ? '' : l));
  const series = ((data && data.series) || []).map((s, i) => ({
    name: String((s && s.name) || 'Series ' + (i + 1)),
    values: labels.map((_, j) => toNumber(s && s.values ? s.values[j] : null)),
  }));
  return { labels, series: series.length ? series : [{ name: 'Value', values: labels.map(() => null) }] };
}

/** Parse pasted rows (from a spreadsheet, or CSV) into chart data. */
export function parseTable(text) {
  const rows = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((r) => r.trim());
  if (!rows.length) return null;
  const sep = rows[0].includes('\t') ? '\t' : rows[0].includes(';') && !rows[0].includes(',') ? ';' : ',';
  const cells = rows.map((r) => splitRow(r, sep));
  const width = Math.max(...cells.map((r) => r.length));
  if (width < 2) {
    return { labels: cells.map((r) => r[0]), series: [{ name: 'Value', values: cells.map(() => null) }] };
  }
  const headerLooksLikeText = cells[0].slice(1).every((c) => toNumber(c) == null && c !== '');
  const header = headerLooksLikeText ? cells.shift() : null;
  const series = [];
  for (let col = 1; col < width; col++) {
    series.push({ name: header ? header[col] : 'Series ' + col, values: cells.map((r) => toNumber(r[col])) });
  }
  return { labels: cells.map((r) => r[0] || ''), series };
}

function splitRow(row, sep) {
  if (sep !== ',') return row.split(sep).map((c) => c.trim());
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------- drawing */

/** A string cut to fit, with an ellipsis. */
export function fitText(text, maxW, font) {
  const s = String(text || '');
  if (measure(s, font) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(s.slice(0, mid).trimEnd() + '…', font) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo ? s.slice(0, lo).trimEnd() + '…' : '';
}

function textOp(text, x, y, font, fill, align = 'left') {
  const w = measure(text, font);
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  return { t: 'text', x: left, y, text, family: font.family, bold: !!font.bold, italic: !!font.italic, size: font.size, fill };
}

/**
 * Draw a chart.
 * @param content {kind, title, data, options}
 * @param box     {x, y, w, h}
 * @param ctx     {palette, family, size, color}
 */
export function renderChart(content, box, ctx = {}) {
  const kind = CHART_KINDS[content && content.kind] ? content.kind : 'bar';
  const palette = ctx.palette;
  const family = ctx.family || 'sans';
  const base = Math.max(5, Number(ctx.size) || Math.max(7, Math.min(12, box.h / 18)));
  const options = (content && content.options) || {};
  const data = normalizeData(content && content.data);
  const colors = options.mono
    ? data.series.map((_, i) => mix(resolveColor(options.color || 'primary', palette), resolveColor('paper', palette), i * 0.28))
    : seriesColors(palette, Math.max(data.series.length, data.labels.length, 6));
  const g = {
    palette, family, base, options, data, colors,
    ink: resolveColor(ctx.color || 'ink', palette),
    muted: resolveColor('muted', palette),
    rule: resolveColor('rule', palette),
    tint: resolveColor('tint', palette),
    paper: resolveColor('paper', palette),
    font: (scale = 1, extra = {}) => ({ family, size: base * scale, ...extra }),
    fmt: (v) => formatNumber(v, { decimals: options.decimals, prefix: options.prefix, unit: options.unit, compact: options.compact }),
  };
  const ops = [];
  let inner = { ...box };
  const title = String((content && content.title) || '').trim();
  if (title) {
    const f = g.font(1.15, { bold: true });
    ops.push(textOp(fitText(title, box.w, f), box.x, box.y + f.size * 0.9, f, g.ink));
    inner = { x: box.x, y: box.y + f.size * 1.7, w: box.w, h: box.h - f.size * 1.7 };
  }
  if (inner.h < 8 || inner.w < 8) return ops;
  const drawers = { bar, hbar, stacked, line, area: line, pie, donut: pie, progress, rings, waffle, pictogram, kpi, timeline, table };
  drawers[kind](ops, inner, g, kind);
  return ops;
}

/* A legend along the bottom, returning the height it used. */
function legend(ops, box, g, names, colors) {
  if (g.options.legend === false || names.length < 2) return 0;
  const f = g.font(0.85);
  const sw = f.size * 0.8;
  let x = box.x;
  let rows = 1;
  const items = names.map((name, i) => ({ name: fitText(name, box.w * 0.6, f), color: colors[i % colors.length] }));
  const widths = items.map((it) => sw + 4 + measure(it.name, f) + 12);
  for (const w of widths) { if (x + w > box.x + box.w && x > box.x) { rows++; x = box.x; } x += w; }
  const h = rows * f.size * 1.5;
  let y = box.y + box.h - h + f.size * 1.05;
  x = box.x;
  items.forEach((it, i) => {
    if (x + widths[i] > box.x + box.w && x > box.x) { x = box.x; y += f.size * 1.5; }
    ops.push({ t: 'rect', x, y: y - sw * 0.9, w: sw, h: sw, r: sw * 0.25, fill: it.color });
    ops.push(textOp(it.name, x + sw + 4, y, f, g.muted));
    x += widths[i];
  });
  return h + f.size * 0.3;
}

function valueAxis(g, values, includeZero = true) {
  const nums = values.filter((v) => v != null);
  let lo = nums.length ? Math.min(...nums) : 0;
  let hi = nums.length ? Math.max(...nums) : 1;
  if (includeZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (toNumber(g.options.max) != null) hi = Math.max(hi, toNumber(g.options.max));
  if (lo === hi) hi = lo + 1;
  return niceScale(lo, hi, 5);
}

function bar(ops, box, g, kind, stackedMode = false) {
  const { labels, series } = g.data;
  const legendH = legend(ops, box, g, series.map((s) => s.name), g.colors);
  const area = { ...box, h: box.h - legendH };
  const totals = labels.map((_, j) => series.reduce((n, s) => n + (s.values[j] || 0), 0));
  const scale = valueAxis(g, stackedMode ? totals : series.flatMap((s) => s.values));
  const tickF = g.font(0.78);
  const labelF = g.font(0.82);
  const axisW = g.options.grid === false ? 0 : Math.max(...scale.ticks.map((t) => measure(g.fmt(t), tickF))) + 6;
  const plot = { x: area.x + axisW, y: area.y + base(g) * 0.9, w: area.w - axisW, h: area.h - labelF.size * 2.2 - base(g) * 0.9 };
  if (plot.h < 10) return;
  const yOf = (v) => plot.y + plot.h - ((v - scale.min) / (scale.max - scale.min)) * plot.h;
  if (g.options.grid !== false) {
    for (const t of scale.ticks) {
      const y = yOf(t);
      ops.push({ t: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: t === 0 ? g.muted : g.rule, lw: t === 0 ? 0.8 : 0.5 });
      ops.push(textOp(g.fmt(t), plot.x - 5, y + tickF.size * 0.35, tickF, g.muted, 'right'));
    }
  }
  const n = Math.max(1, labels.length);
  const slot = plot.w / n;
  // A lone column should not be a wall: bars keep a reasonable width however few.
  const groupW = Math.min(slot * 0.72, base(g) * 3.2 * (stackedMode ? 1 : Math.max(1, series.length)));
  const each = stackedMode ? groupW : groupW / Math.max(1, series.length);
  const radius = Math.min(each * 0.18, 3);
  labels.forEach((label, j) => {
    const gx = plot.x + slot * j + (slot - groupW) / 2;
    let stackTop = 0;
    series.forEach((s, i) => {
      const v = s.values[j];
      if (v == null) return;
      const from = stackedMode ? stackTop : 0;
      const to = stackedMode ? stackTop + v : v;
      stackTop = to;
      const x = stackedMode ? gx : gx + each * i;
      const y1 = yOf(Math.max(from, to));
      const y2 = yOf(Math.min(from, to));
      const w = stackedMode ? each : each * 0.9;
      ops.push({ t: 'path', segs: topRounded(x, y1, w, y2 - y1, stackedMode && i < series.length - 1 ? 0 : radius), fill: g.colors[i % g.colors.length] });
      if (g.options.values !== false && !stackedMode && each > tickF.size * 1.2) {
        ops.push(textOp(g.fmt(v), x + w / 2, y1 - 3, tickF, g.ink, 'center'));
      }
    });
    if (stackedMode && g.options.values !== false) {
      ops.push(textOp(g.fmt(totals[j]), gx + groupW / 2, yOf(totals[j]) - 3, g.font(0.8, { bold: true }), g.ink, 'center'));
    }
    ops.push(textOp(fitText(label, slot - 2, labelF), gx + groupW / 2, plot.y + plot.h + labelF.size * 1.4, labelF, g.muted, 'center'));
  });
}
const base = (g) => g.base;

function stacked(ops, box, g) { bar(ops, box, g, 'stacked', true); }

/** A bar with its top corners rounded and its base square, on the axis. */
function topRounded(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  if (!r || h <= 0) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  const k = 0.5523 * r;
  return [
    ['M', x, y + h], ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y],
    ['L', x + w - r, y], ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ['L', x + w, y + h], ['Z'],
  ];
}

function hbar(ops, box, g) {
  const { labels, series } = g.data;
  const legendH = legend(ops, box, g, series.map((s) => s.name), g.colors);
  const area = { ...box, h: box.h - legendH };
  const labelF = g.font(0.9);
  const valueF = g.font(0.82, { bold: true });
  const labelW = Math.min(area.w * 0.42, Math.max(0, ...labels.map((l) => measure(l, labelF))) + 8);
  const values = series.flatMap((s) => s.values);
  const scale = valueAxis(g, values);
  const maxLabel = Math.max(0, ...values.filter((v) => v != null).map((v) => measure(g.fmt(v), valueF)));
  const plot = { x: area.x + labelW, y: area.y, w: area.w - labelW - maxLabel - 6, h: area.h };
  if (plot.w < 10) return;
  const n = Math.max(1, labels.length);
  const slot = plot.h / n;
  const groupH = Math.min(slot * 0.74, base(g) * 2.6 * series.length);
  const each = groupH / Math.max(1, series.length);
  const xOf = (v) => plot.x + ((v - Math.min(0, scale.min)) / (scale.max - Math.min(0, scale.min))) * plot.w;
  labels.forEach((label, j) => {
    const gy = plot.y + slot * j + (slot - groupH) / 2;
    ops.push(textOp(fitText(label, labelW - 8, labelF), area.x, gy + groupH / 2 + labelF.size * 0.35, labelF, g.ink));
    ops.push({ t: 'rect', x: plot.x, y: gy, w: plot.w, h: groupH, r: Math.min(3, each * 0.25), fill: g.tint });
    series.forEach((s, i) => {
      const v = s.values[j];
      if (v == null) return;
      const y = gy + each * i;
      const x0 = xOf(0);
      const x1 = xOf(v);
      const w = Math.abs(x1 - x0);
      ops.push({ t: 'rect', x: Math.min(x0, x1), y: y + each * 0.06, w, h: each * 0.88, r: Math.min(3, each * 0.25), fill: g.colors[i % g.colors.length] });
      if (g.options.values !== false) ops.push(textOp(g.fmt(v), Math.max(x0, x1) + 4 + (plot.w - w) * 0, y + each / 2 + valueF.size * 0.35, valueF, g.ink));
    });
  });
}

function line(ops, box, g, kind) {
  const { labels, series } = g.data;
  const legendH = legend(ops, box, g, series.map((s) => s.name), g.colors);
  const area = { ...box, h: box.h - legendH };
  const tickF = g.font(0.78);
  const labelF = g.font(0.82);
  const scale = valueAxis(g, series.flatMap((s) => s.values), kind === 'area' || g.options.zero !== false);
  const axisW = Math.max(...scale.ticks.map((t) => measure(g.fmt(t), tickF))) + 6;
  const plot = { x: area.x + axisW, y: area.y + base(g) * 0.9, w: area.w - axisW - base(g), h: area.h - labelF.size * 2.2 - base(g) * 0.9 };
  if (plot.h < 10 || plot.w < 10) return;
  const yOf = (v) => plot.y + plot.h - ((v - scale.min) / (scale.max - scale.min)) * plot.h;
  const n = labels.length;
  const xOf = (j) => plot.x + (n <= 1 ? plot.w / 2 : (plot.w * j) / (n - 1));
  for (const t of scale.ticks) {
    const y = yOf(t);
    ops.push({ t: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: g.rule, lw: 0.5 });
    ops.push(textOp(g.fmt(t), plot.x - 5, y + tickF.size * 0.35, tickF, g.muted, 'right'));
  }
  const every = Math.max(1, Math.ceil((n * measure('Mmmmm', labelF)) / plot.w));
  labels.forEach((label, j) => {
    if (j % every && j !== n - 1) return;
    ops.push(textOp(fitText(label, (plot.w / Math.max(1, n)) * every, labelF), xOf(j), plot.y + plot.h + labelF.size * 1.4, labelF, g.muted, 'center'));
  });
  const lw = Math.max(1.2, base(g) * 0.2);
  series.forEach((s, i) => {
    const color = g.colors[i % g.colors.length];
    const pts = s.values.map((v, j) => (v == null ? null : [xOf(j), yOf(v)]));
    const runs = [];
    let run = [];
    for (const p of pts) { if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } }
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (kind === 'area' && r.length > 1) {
        const floor = yOf(Math.max(scale.min, 0));
        const segs = [['M', r[0][0], floor], ...r.map((p) => ['L', p[0], p[1]]), ['L', r[r.length - 1][0], floor], ['Z']];
        ops.push({ t: 'path', segs, fill: color, opacity: series.length > 1 ? 0.35 : 0.22 });
      }
      if (r.length > 1) ops.push({ t: 'path', segs: r.map((p, k) => [k ? 'L' : 'M', p[0], p[1]]), stroke: color, lw, cap: 'round', join: 'round' });
      for (const p of r) {
        ops.push({ t: 'ellipse', cx: p[0], cy: p[1], rx: lw * 1.6, ry: lw * 1.6, fill: g.paper, stroke: color, lw: lw * 0.9 });
      }
    }
    if (g.options.values !== false) {
      const last = pts.map((p, j) => [p, j]).filter(([p]) => p).pop();
      if (last) ops.push(textOp(g.fmt(s.values[last[1]]), last[0][0], last[0][1] - lw * 3, g.font(0.8, { bold: true }), color, 'center'));
    }
  });
}

function pie(ops, box, g, kind) {
  const { labels, series } = g.data;
  const values = series[0].values.map((v) => Math.max(0, v || 0));
  const total = values.reduce((a, b) => a + b, 0);
  const f = g.font(0.86);
  const colors = g.options.mono ? labels.map((_, i) => mix(resolveColor(g.options.color || 'primary', g.palette), g.paper, i * (0.75 / Math.max(1, labels.length)))) : g.colors;
  // The legend sits beside the pie when there is room, and under it when not.
  const side = box.w > box.h * 1.35;
  const legendW = side ? Math.min(box.w * 0.5, Math.max(...labels.map((l) => measure(l, f))) + f.size * 5) : box.w;
  const rowH = f.size * 1.6;
  const legendH = side ? 0 : Math.min(box.h * 0.45, labels.length * rowH);
  const d = Math.max(4, Math.min(side ? box.w - legendW - base(g) : box.w, box.h - legendH - (side ? 0 : base(g) * 0.6)));
  const r = d / 2;
  const cx = box.x + (side ? r : box.w / 2);
  const cy = box.y + (side ? box.h / 2 : r);
  const inner = kind === 'donut' ? r * 0.6 : 0;
  let angle = 0;
  if (total <= 0) {
    ops.push({ t: 'path', segs: slicePath(cx, cy, r, inner, 0, Math.PI * 2), fill: g.tint });
  } else {
    values.forEach((v, i) => {
      if (!v) return;
      const sweep = (v / total) * Math.PI * 2;
      ops.push({ t: 'path', segs: slicePath(cx, cy, r, inner, angle, angle + sweep), fill: colors[i % colors.length], stroke: g.paper, lw: Math.max(0.6, r * 0.02), join: 'round' });
      angle += sweep;
    });
  }
  if (kind === 'donut') {
    const big = g.font(Math.max(1, (inner * 0.55) / base(g)), { bold: true });
    ops.push(textOp(g.fmt(total), cx, cy + big.size * 0.3, big, g.ink, 'center'));
    if (g.options.centerLabel) {
      const small = g.font(0.8);
      ops.push(textOp(fitText(g.options.centerLabel, inner * 1.6, small), cx, cy + big.size * 0.3 + small.size * 1.4, small, g.muted, 'center'));
    }
  }
  const lx = side ? box.x + d + base(g) * 1.2 : box.x;
  let ly = side ? box.y + box.h / 2 - (labels.length * rowH) / 2 + rowH * 0.7 : box.y + d + base(g) * 0.6 + rowH * 0.7;
  const width = side ? box.x + box.w - lx : box.w;
  labels.forEach((label, i) => {
    if (ly > box.y + box.h + 1) return;
    const sw = f.size * 0.85;
    ops.push({ t: 'rect', x: lx, y: ly - sw * 0.85, w: sw, h: sw, r: sw * 0.25, fill: colors[i % colors.length] });
    const pct = total > 0 ? Math.round((values[i] / total) * 100) + '%' : '';
    const pf = g.font(0.86, { bold: true });
    const pw = measure(pct, pf);
    ops.push(textOp(fitText(label, width - sw - pw - 12, f), lx + sw + 5, ly, f, g.ink));
    ops.push(textOp(pct, lx + width, ly, pf, g.ink, 'right'));
    ly += rowH;
  });
}

function progress(ops, box, g) {
  const { labels, series } = g.data;
  const goalSeries = series[1];
  const goal = toNumber(g.options.goal);
  const labelF = g.font(0.92, { bold: true });
  const valueF = g.font(0.82);
  const n = Math.max(1, labels.length);
  const slot = box.h / n;
  const barH = Math.max(3, Math.min(slot * 0.28, base(g) * 0.9));
  labels.forEach((label, j) => {
    const v = series[0].values[j] || 0;
    const target = goalSeries ? goalSeries.values[j] : goal;
    const max = target && target > 0 ? target : Math.max(...series[0].values.map((x) => x || 0), 1);
    const frac = Math.max(0, Math.min(1, v / max));
    const y = box.y + slot * j + (slot - (labelF.size * 1.3 + barH)) / 2;
    const text = g.fmt(v) + (target ? ' of ' + g.fmt(target) : '');
    const tw = measure(text, valueF);
    ops.push(textOp(fitText(label, box.w - tw - 8, labelF), box.x, y + labelF.size * 0.9, labelF, g.ink));
    ops.push(textOp(text, box.x + box.w, y + labelF.size * 0.9, valueF, g.muted, 'right'));
    const by = y + labelF.size * 1.3;
    ops.push({ t: 'rect', x: box.x, y: by, w: box.w, h: barH, r: barH / 2, fill: g.tint });
    if (frac > 0) ops.push({ t: 'rect', x: box.x, y: by, w: Math.max(barH, box.w * frac), h: barH, r: barH / 2, fill: g.colors[j % g.colors.length] });
  });
}

function rings(ops, box, g) {
  const { labels, series } = g.data;
  const n = Math.max(1, Math.min(6, labels.length));
  const labelF = g.font(0.85);
  const cellW = box.w / n;
  const d = Math.max(6, Math.min(cellW * 0.82, box.h - labelF.size * 2.6));
  const r = d / 2;
  const thick = Math.max(2, r * 0.2);
  labels.slice(0, n).forEach((label, j) => {
    const v = series[0].values[j] || 0;
    const goal = series[1] ? series[1].values[j] : toNumber(g.options.goal) || 100;
    const frac = Math.max(0, Math.min(1, goal ? v / goal : 0));
    const cx = box.x + cellW * j + cellW / 2;
    const cy = box.y + r + 1;
    ops.push({ t: 'path', segs: slicePath(cx, cy, r, r - thick, 0, Math.PI * 2), fill: g.tint });
    if (frac > 0) ops.push({ t: 'path', segs: slicePath(cx, cy, r, r - thick, 0, Math.PI * 2 * frac), fill: g.colors[j % g.colors.length] });
    const big = g.font(Math.max(0.9, (r * 0.62) / base(g)), { bold: true });
    const shown = series[1] || toNumber(g.options.goal) ? Math.round(frac * 100) + '%' : g.fmt(v);
    ops.push(textOp(shown, cx, cy + big.size * 0.33, big, g.ink, 'center'));
    ops.push(textOp(fitText(label, cellW - 4, labelF), cx, cy + r + labelF.size * 1.6, labelF, g.muted, 'center'));
  });
}

function waffle(ops, box, g) {
  const { labels, series } = g.data;
  const values = series[0].values.map((v) => Math.max(0, v || 0));
  const total = toNumber(g.options.goal) || values.reduce((a, b) => a + b, 0) || 1;
  const f = g.font(0.85);
  const legendW = Math.min(box.w * 0.45, Math.max(0, ...labels.map((l) => measure(l, f))) + f.size * 5);
  const side = box.w - legendW > box.h * 0.8;
  const size = side ? Math.min(box.h, box.w - legendW - base(g)) : Math.min(box.w, box.h - labels.length * f.size * 1.6);
  const cell = size / 10;
  const gap = cell * 0.14;
  const counts = values.map((v) => Math.round((v / total) * 100));
  let k = 0;
  const owner = [];
  counts.forEach((c, i) => { for (let m = 0; m < c && owner.length < 100; m++) owner.push(i); });
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const idx = owner[k++];
      ops.push({ t: 'rect', x: box.x + col * cell + gap / 2, y: box.y + row * cell + gap / 2, w: cell - gap, h: cell - gap, r: cell * 0.18, fill: idx == null ? g.tint : g.colors[idx % g.colors.length] });
    }
  }
  const lx = side ? box.x + size + base(g) : box.x;
  let ly = side ? box.y + f.size * 1.1 : box.y + size + f.size * 1.6;
  labels.forEach((label, i) => {
    const sw = f.size * 0.85;
    ops.push({ t: 'rect', x: lx, y: ly - sw * 0.85, w: sw, h: sw, r: sw * 0.25, fill: g.colors[i % g.colors.length] });
    const pct = counts[i] + '%';
    ops.push(textOp(pct, lx + sw + 5, ly, g.font(0.85, { bold: true }), g.ink));
    const pw = measure(pct + ' ', g.font(0.85, { bold: true }));
    ops.push(textOp(fitText(label, (side ? box.x + box.w - lx : box.w) - sw - pw - 8, f), lx + sw + 5 + pw, ly, f, g.muted));
    ly += f.size * 1.6;
  });
}

function pictogram(ops, box, g) {
  const { labels, series } = g.data;
  const icon = GLYPHS[g.options.icon] ? g.options.icon : 'user';
  const perIcon = toNumber(g.options.per) || 1;
  const maxIcons = 60;
  const labelF = g.font(0.9, { bold: true });
  const n = Math.max(1, labels.length);
  const rowH = box.h / n;
  labels.forEach((label, j) => {
    const v = Math.max(0, series[0].values[j] || 0);
    const goal = series[1] ? series[1].values[j] : null;
    const count = Math.min(maxIcons, Math.ceil(Math.max(v, goal || 0) / perIcon));
    const filled = v / perIcon;
    const text = label + '  ' + g.fmt(v) + (goal ? ' / ' + g.fmt(goal) : '');
    const top = box.y + rowH * j;
    ops.push(textOp(fitText(text, box.w, labelF), box.x, top + labelF.size, labelF, g.ink));
    const avail = rowH - labelF.size * 1.5;
    const perRow = Math.max(1, Math.min(count, Math.floor(box.w / Math.max(6, Math.min(avail, base(g) * 2.2)))));
    const rowsNeeded = Math.max(1, Math.ceil(count / perRow));
    const iconS = Math.max(4, Math.min(box.w / perRow, avail / rowsNeeded));
    for (let i = 0; i < count; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = box.x + col * iconS;
      const y = top + labelF.size * 1.4 + row * iconS;
      const on = i < Math.floor(filled) || (i < filled);
      ops.push(...iconOps(icon, x + iconS * 0.06, y + iconS * 0.06, iconS * 0.88, on ? g.colors[j % g.colors.length] : g.rule));
    }
  });
}

/** An icon from the set, stroked into a square. */
export function iconOps(name, x, y, size, color, strokeScale = 1) {
  const d = GLYPHS[name];
  if (!d) return [];
  const s = size / 24;
  return [{ t: 'path', segs: transformPath(parsePathCached(d), [s, 0, 0, s, x, y]), stroke: color, lw: 1.6 * s * strokeScale, cap: 'round', join: 'round' }];
}

const PARSED = new Map();
export function parsePathCached(d) {
  if (!PARSED.has(d)) PARSED.set(d, parsePath(d));
  return PARSED.get(d);
}

function kpi(ops, box, g) {
  const { labels, series } = g.data;
  const n = Math.max(1, Math.min(6, labels.length));
  const cols = box.w / box.h > n * 0.9 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = box.w / cols;
  const cellH = box.h / rows;
  labels.slice(0, n).forEach((label, j) => {
    const col = j % cols;
    const row = Math.floor(j / cols);
    const x = box.x + col * cellW;
    const y = box.y + row * cellH;
    const value = g.fmt(series[0].values[j]);
    let big = g.font(1, { bold: true });
    big.size = Math.min(cellH * 0.5, (cellW * 0.86) / Math.max(1, measure(value, { ...big, size: 1 })));
    const small = { family: g.family, size: Math.max(6.5, Math.min(big.size * 0.24, cellH * 0.16)) };
    const color = g.colors[j % g.colors.length];
    const blockH = big.size * 0.9 + small.size * 1.7;
    const top = y + (cellH - blockH) / 2;
    if (col > 0) ops.push({ t: 'line', x1: x, y1: y + cellH * 0.15, x2: x, y2: y + cellH * 0.85, stroke: g.rule, lw: 0.6 });
    ops.push(textOp(value, x + cellW / 2, top + big.size * 0.82, big, color, 'center'));
    ops.push(textOp(fitText(label, cellW * 0.9, small), x + cellW / 2, top + big.size * 0.9 + small.size * 1.4, small, g.muted, 'center'));
    const delta = series[1] ? series[1].values[j] : null;
    if (delta != null && delta !== 0) {
      const df = g.font(0.75, { bold: true });
      const txt = (delta > 0 ? '+' : '') + formatNumber(delta, { decimals: g.options.decimals }) + (g.options.deltaUnit || '');
      ops.push(textOp(txt, x + cellW / 2, top + big.size * 0.9 + small.size * 1.4 + df.size * 1.4, df, delta > 0 ? resolveColor('secondary', g.palette) : resolveColor('accent', g.palette), 'center'));
    }
  });
}

function timeline(ops, box, g) {
  const { labels, series } = g.data;
  const n = Math.max(1, labels.length);
  const horizontal = box.w >= box.h;
  const dotR = Math.max(2.5, base(g) * 0.42);
  const f = g.font(0.82);
  const bold = g.font(0.9, { bold: true });
  const notes = series[0].values;
  const done = toNumber(g.options.done) != null ? toNumber(g.options.done) : n;
  if (horizontal) {
    const y = box.y + box.h * 0.35;
    const step = box.w / n;
    ops.push({ t: 'line', x1: box.x + step / 2, y1: y, x2: box.x + box.w - step / 2, y2: y, stroke: g.rule, lw: Math.max(1, dotR * 0.45), cap: 'round' });
    labels.forEach((label, j) => {
      const x = box.x + step * j + step / 2;
      const on = j < done;
      if (j > 0 && j < done) ops.push({ t: 'line', x1: x - step, y1: y, x2: x, y2: y, stroke: g.colors[0], lw: Math.max(1, dotR * 0.45), cap: 'round' });
      ops.push({ t: 'ellipse', cx: x, cy: y, rx: dotR, ry: dotR, fill: on ? g.colors[0] : g.paper, stroke: on ? g.colors[0] : g.muted, lw: dotR * 0.35 });
      const parts = String(label).split(/\s*[|:]\s*/);
      ops.push(textOp(fitText(parts[0], step - 4, bold), x, y - dotR - bold.size * 0.7, bold, g.ink, 'center'));
      if (parts[1]) ops.push(textOp(fitText(parts.slice(1).join(': '), step - 4, f), x, y + dotR + f.size * 1.5, f, g.muted, 'center'));
      if (notes[j] != null) ops.push(textOp(g.fmt(notes[j]), x, y + dotR + f.size * (parts[1] ? 2.9 : 1.5), f, g.muted, 'center'));
    });
  } else {
    const x = box.x + dotR + 1;
    const step = box.h / n;
    ops.push({ t: 'line', x1: x, y1: box.y + step / 2, x2: x, y2: box.y + box.h - step / 2, stroke: g.rule, lw: Math.max(1, dotR * 0.45), cap: 'round' });
    labels.forEach((label, j) => {
      const y = box.y + step * j + step / 2;
      const on = j < done;
      ops.push({ t: 'ellipse', cx: x, cy: y, rx: dotR, ry: dotR, fill: on ? g.colors[0] : g.paper, stroke: on ? g.colors[0] : g.muted, lw: dotR * 0.35 });
      const parts = String(label).split(/\s*[|:]\s*/);
      const tx = x + dotR * 2.5;
      ops.push(textOp(fitText(parts[0], box.x + box.w - tx, bold), tx, y + (parts[1] ? -bold.size * 0.15 : bold.size * 0.35), bold, g.ink));
      if (parts[1]) ops.push(textOp(fitText(parts.slice(1).join(': '), box.x + box.w - tx, f), tx, y + f.size * 1.1, f, g.muted));
    });
  }
}

function table(ops, box, g) {
  const { labels, series } = g.data;
  const head = g.font(0.82, { bold: true });
  const cellF = g.font(0.88);
  const rows = labels.length + 1;
  const rowH = Math.min(box.h / Math.max(1, rows), base(g) * 2.2);
  const firstW = box.w * (series.length > 2 ? 0.34 : 0.46);
  const colW = (box.w - firstW) / Math.max(1, series.length);
  const headColor = resolveColor('primary', g.palette);
  ops.push({ t: 'rect', x: box.x, y: box.y, w: box.w, h: rowH, r: Math.min(3, rowH * 0.2), fill: headColor });
  const onHead = textOn(headColor, g.palette);
  ops.push(textOp(fitText(g.options.labelHeader || '', firstW - 8, head), box.x + 6, box.y + rowH / 2 + head.size * 0.35, head, onHead));
  series.forEach((s, i) => {
    ops.push(textOp(fitText(s.name, colW - 8, head), box.x + firstW + colW * (i + 1) - 6, box.y + rowH / 2 + head.size * 0.35, head, onHead, 'right'));
  });
  labels.forEach((label, j) => {
    const y = box.y + rowH * (j + 1);
    if (y + rowH > box.y + box.h + 0.5) return;
    if (j % 2 === 1) ops.push({ t: 'rect', x: box.x, y, w: box.w, h: rowH, fill: g.tint });
    ops.push(textOp(fitText(label, firstW - 8, cellF), box.x + 6, y + rowH / 2 + cellF.size * 0.35, cellF, g.ink));
    series.forEach((s, i) => {
      ops.push(textOp(g.fmt(s.values[j]), box.x + firstW + colW * (i + 1) - 6, y + rowH / 2 + cellF.size * 0.35, cellF, g.ink, 'right'));
    });
  });
  ops.push({ t: 'line', x1: box.x, y1: box.y + rowH * Math.min(rows, Math.floor(box.h / rowH)), x2: box.x + box.w, y2: box.y + rowH * Math.min(rows, Math.floor(box.h / rowH)), stroke: g.rule, lw: 0.6 });
}

/** Example data for a new chart of a kind, so it never starts as an empty box. */
export function sampleData(kind) {
  switch (kind) {
    case 'pie': case 'donut': case 'waffle':
      return { labels: ['Direct', 'Partners', 'Online', 'Retail'], series: [{ name: 'Share', values: [42, 26, 19, 13] }] };
    case 'progress':
      return { labels: ['North', 'South', 'West'], series: [{ name: 'Booked', values: [84, 52, 23] }, { name: 'Target', values: [100, 80, 60] }] };
    case 'rings':
      return { labels: ['Adoption', 'Retention', 'Coverage'], series: [{ name: 'Percent', values: [72, 91, 64] }] };
    case 'pictogram':
      return { labels: ['On the team'], series: [{ name: 'People', values: [7] }, { name: 'Places', values: [10] }] };
    case 'kpi':
      return { labels: ['Customers', 'Markets', 'Revenue'], series: [{ name: 'This year', values: [1420, 12, 8600000] }] };
    case 'timeline':
      return { labels: ['Q1 | Pilot', 'Q2 | First release', 'Q3 | Second market', 'Q4 | General release'], series: [{ name: 'Note', values: [] }] };
    case 'line': case 'area':
      return { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: 'This year', values: [6, 9, 8, 12, 11, 15] }, { name: 'Last year', values: [3, 4, 6, 7, 6, 9] }] };
    case 'table':
      return { labels: ['North', 'South', 'West'], series: [{ name: 'Sold', values: [124, 98, 71] }, { name: 'Returned', values: [6, 4, 3] }] };
    case 'hbar':
      return { labels: ['Manufacturing', 'Services', 'Public sector', 'Education'], series: [{ name: 'Customers', values: [140, 112, 84, 51] }] };
    default:
      return { labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'This year', values: [8, 12, 10, 15] }, { name: 'Last year', values: [5, 7, 9, 8] }] };
  }
}

export { ellipsePath, roundedRect };
