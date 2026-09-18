// The slide you build on.
//
// Adapted from Newsx (web/js/canvas.js), which is the same canvas for a page.
//
// The slide itself is drawn by the shared renderer, as SVG, exactly as the PDF
// and the projector will draw it. Over it lies a transparent sheet that does
// the interacting: selection boxes and handles, the guides that appear when an
// edge lines up with another, the equal-spacing hints, the marquee, the red
// marks on words that do not fit. Nothing on that sheet is ever part of the
// slide.
//
// The canvas knows geometry and nothing else. What a move or a resize means -
// changing the layout, or recording this slide's difference from it - is the
// caller's business, through the callbacks.

import { h, clear } from './ui.js';
import { renderSlide } from '../shared/scene.js';
import { renderSVG } from '../shared/svg.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_PX = 6;
/** How close two gaps must be, on screen, to count as the same gap. */
const SPACING_PX = 3;

/**
 * @param host element to fill
 * @param o    {getSlide, getCtx, assetUrl, getConfig, canSelect, canMove, canResize,
 *              onSelect, onGeometry, onDoubleClick, onDropInsert, onDropFiles,
 *              onContextMenu, onZoom, allowMarquee, showEditable}
 */
export function createCanvas(host, o) {
  const stage = h('div.stage');
  const inner = h('div.stage-inner');
  const wrap = h('div.slide-wrap');
  const paper = h('div.slide-paper');
  const overlay = h('div.slide-overlay');
  wrap.append(paper, overlay);
  inner.append(wrap);
  stage.append(inner);
  clear(host).append(stage);

  let zoom = 1;
  let fitMode = true;
  let selection = [];
  let report = {};
  let hover = null;
  let drag = null;
  let pending = 0;
  let lastSlide = null;
  let cycle = { x: null, y: null, index: 0 };

  const ctl = {
    get zoom() { return zoom; },
    get report() { return report; },
    get selection() { return selection.slice(); },
    stage,
  };

  /* ------------------------------------------------------------ drawing */

  function dims() {
    const deck = o.getCtx().deck;
    return { W: deck.size.width, H: deck.size.height, margin: 56 };
  }

  function fitZoom() {
    const { W, H } = dims();
    const availW = Math.max(200, stage.clientWidth - 72);
    const availH = Math.max(160, stage.clientHeight - 72);
    return Math.max(0.15, Math.min(availW / W, availH / H, 3));
  }

  function draw() {
    pending = 0;
    const slide = o.getSlide();
    lastSlide = slide;
    if (!slide) { paper.innerHTML = ''; clear(overlay); return; }
    const { W, H } = dims();
    if (fitMode) zoom = fitZoom();
    wrap.style.width = Math.round(W * zoom) + 'px';
    wrap.style.height = Math.round(H * zoom) + 'px';
    const result = renderSlide(slide, o.getCtx());
    report = result.report;
    paper.innerHTML = renderSVG(result.ops, { width: W, height: H, assetUrl: o.assetUrl, idPrefix: 'cv' });
    const ids = new Set(slide.elements.map((e) => e.id));
    const kept = selection.filter((id) => ids.has(id));
    if (kept.length !== selection.length) { selection = kept; o.onSelect(selection.slice()); }
    drawOverlay();
  }

  ctl.render = () => {
    if (!pending) pending = requestAnimationFrame(draw);
  };
  ctl.renderNow = () => {
    if (pending) cancelAnimationFrame(pending);
    draw();
  };

  const px = (v) => Math.round(v * zoom * 100) / 100 + 'px';
  const byId = (id) => (lastSlide ? lastSlide.elements.find((e) => e.id === id) : null);

  function drawOverlay(extra = {}) {
    clear(overlay);
    if (!lastSlide) return;
    if (o.showEditable && o.showEditable()) {
      for (const el of lastSlide.elements) {
        if (!o.canSelect(el) || selection.includes(el.id)) continue;
        overlay.append(h('div.editable-hint', { style: box(el) }));
      }
    }
    for (const [id, note] of Object.entries(report)) {
      const el = byId(id);
      if (!el || !(note.overflow || note.error)) continue;
      overlay.append(h('div.overflow-mark', {
        style: { left: px(el.x + el.w), top: px(el.y + el.h) },
        title: note.error ? 'This could not be drawn: ' + note.error : (note.hiddenWords || 'Some') + ' words do not fit',
      }, note.error ? '!' : '+' + (note.hiddenWords || '')));
    }
    if (hover && !selection.includes(hover) && !drag) {
      const el = byId(hover);
      if (el) overlay.append(h('div.hover-box', { style: box(el) }));
    }
    const sel = selection.map(byId).filter(Boolean);
    if (sel.length > 1) {
      for (const el of sel) overlay.append(h('div.sel-box.multi', { style: box(el) }));
      overlay.append(h('div.sel-box', { style: box(bounds(sel)) }));
    } else if (sel.length === 1) {
      const el = sel[0];
      const movable = o.canMove(el);
      overlay.append(h('div.sel-box' + (movable ? '' : '.locked'), { style: box(el), title: movable ? '' : 'Its place is fixed by the layout' }));
      if (o.canResize(el)) {
        for (const hd of HANDLES) {
          const [hx, hy] = handlePos(el, hd);
          overlay.append(h('div.handle', { dataset: { h: hd }, style: { left: px(hx), top: px(hy) } }));
        }
      }
      // A line's two ends are dragged on their own, so an arrow can point
      // anywhere without turning its box inside out.
      if (el.type === 'line') {
        for (const end of ['from', 'to']) {
          const p = (el.content || {})[end] || (end === 'from' ? [0, 0.5] : [1, 0.5]);
          overlay.append(h('div.handle.end', { dataset: { end }, style: { left: px(el.x + p[0] * el.w), top: px(el.y + p[1] * el.h) } }));
        }
      }
    }
    for (const g of extra.guides || []) {
      overlay.append(g.v != null ? h('div.guide.v', { style: { left: px(g.v) } }) : h('div.guide.h', { style: { top: px(g.h) } }));
    }
    // Equal-spacing hints: a pair of little bars over each gap that matches.
    for (const s of extra.spacing || []) {
      overlay.append(h('div.spacing' + (s.axis === 'x' ? '.h' : '.v'), {
        style: s.axis === 'x'
          ? { left: px(s.from), top: px(s.at), width: px(s.to - s.from) }
          : { top: px(s.from), left: px(s.at), height: px(s.to - s.from) },
        title: Math.round(s.to - s.from) + ' pt',
      }));
    }
    if (extra.marquee) overlay.append(h('div.marquee', { style: box(extra.marquee) }));
    if (extra.tip) overlay.append(h('div.size-tip', { style: { left: px(extra.tip.x), top: 'calc(' + px(extra.tip.y) + ' + 8px)' } }, extra.tip.text));
  }

  const box = (r) => ({ left: px(r.x), top: px(r.y), width: px(Math.max(0, r.w)), height: px(Math.max(0, r.h)) });

  function bounds(list) {
    const x = Math.min(...list.map((e) => e.x));
    const y = Math.min(...list.map((e) => e.y));
    return { x, y, w: Math.max(...list.map((e) => e.x + e.w)) - x, h: Math.max(...list.map((e) => e.y + e.h)) - y };
  }

  function handlePos(el, hd) {
    const x = hd.includes('w') ? el.x : hd.includes('e') ? el.x + el.w : el.x + el.w / 2;
    const y = hd.includes('n') ? el.y : hd.includes('s') ? el.y + el.h : el.y + el.h / 2;
    return [x, y];
  }

  /* ---------------------------------------------------------- selection */

  ctl.select = (ids, silent) => {
    selection = (ids || []).filter((id) => byId(id) || !lastSlide);
    drawOverlay();
    if (!silent) o.onSelect(selection.slice());
  };

  function toSlide(e) {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  /** Every selectable element under a point, topmost first. */
  function hitsAt(pt) {
    if (!lastSlide) return [];
    const slop = 3 / zoom;
    return lastSlide.elements.slice().reverse().filter((el) => o.canSelect(el) &&
      pt.x >= el.x - slop && pt.x <= el.x + el.w + slop && pt.y >= el.y - slop && pt.y <= el.y + el.h + slop);
  }

  /**
   * The element a click means. Plain click: the topmost. Clicking again in the
   * same place with Alt held goes one further down the stack, so a heading
   * lying over a picture does not make the picture unreachable.
   */
  function hitTest(pt, deeper) {
    const hits = hitsAt(pt);
    if (!hits.length) return null;
    const same = cycle.x != null && Math.abs(cycle.x - pt.x) < 2 && Math.abs(cycle.y - pt.y) < 2;
    cycle.index = deeper && same ? (cycle.index + 1) % hits.length : 0;
    cycle.x = pt.x; cycle.y = pt.y;
    return hits[cycle.index];
  }

  /* ------------------------------------------------------------ snapping */

  function snapLines(exclude) {
    const { W, H, margin } = dims();
    const xs = [0, W / 2, W, margin, W - margin];
    const ys = [0, H / 2, H, margin, H - margin];
    for (const el of lastSlide.elements) {
      if (exclude.has(el.id)) continue;
      // A full-bleed band gives a horizontal line worth snapping to and a
      // vertical one that is only the slide's own edge again.
      if (el.w < W - 1) xs.push(el.x, el.x + el.w / 2, el.x + el.w);
      if (el.h < H - 1) ys.push(el.y, el.y + el.h / 2, el.y + el.h);
    }
    return { xs, ys };
  }

  /** The smallest shift that puts one of `edges` on one of `lines`, if one is close. */
  function nearest(edges, lines) {
    const limit = SNAP_PX / zoom;
    let best = null;
    for (const e of edges) {
      for (const l of lines) {
        const d = l - e;
        if (Math.abs(d) <= limit && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: l };
      }
    }
    return best;
  }

  /**
   * Equal spacing.
   *
   * With three things in a row, the eye notices an uneven gap long before it
   * notices a misaligned edge. So while something is being dragged, the gap to
   * its neighbour on each side is compared, and when the two match the canvas
   * says so with a pair of bars - and nudges the drag onto the exact match if
   * it is within a few pixels of it.
   *
   * @returns {shift, hints} - shift in slide points along the given axis
   */
  function equalSpacing(moving, exclude, axis) {
    const near = axis === 'x'
      ? (el) => el.y < moving.y + moving.h && el.y + el.h > moving.y
      : (el) => el.x < moving.x + moving.w && el.x + el.w > moving.x;
    const lo = (el) => (axis === 'x' ? el.x : el.y);
    const hi = (el) => (axis === 'x' ? el.x + el.w : el.y + el.h);
    const others = lastSlide.elements.filter((el) => !exclude.has(el.id) && o.canSelect(el) && near(el));
    const before = others.filter((el) => hi(el) <= lo(moving) + 1).sort((a, b) => hi(b) - hi(a))[0];
    const after = others.filter((el) => lo(el) >= hi(moving) - 1).sort((a, b) => lo(a) - lo(b))[0];
    if (!before || !after) return { shift: 0, hints: [] };
    const gapBefore = lo(moving) - hi(before);
    const gapAfter = lo(after) - hi(moving);
    const even = (gapBefore + gapAfter) / 2;
    if (even < 1) return { shift: 0, hints: [] };
    const off = even - gapBefore;
    if (Math.abs(off) * zoom > SPACING_PX) return { shift: 0, hints: [] };
    const at = axis === 'x' ? moving.y + moving.h / 2 : moving.x + moving.w / 2;
    return {
      shift: off,
      hints: [
        { axis, at, from: hi(before), to: lo(moving) + off },
        { axis, at, from: hi(moving) + off, to: lo(after) },
      ],
    };
  }

  const grid = () => {
    const cfg = o.getConfig();
    return cfg.snap === false ? 0 : Number(cfg.grid) || 0;
  };
  const roundTo = (v, g) => (g ? Math.round(v / g) * g : Math.round(v * 10) / 10);

  /* ----------------------------------------------------------- pointer */

  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !lastSlide) return;
    if (e.target.closest('.inline-edit')) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    const pt = toSlide(e);
    const end = e.target.closest('.handle.end');
    if (end && selection.length === 1) {
      drag = { kind: 'endpoint', end: end.dataset.end, id: selection[0], moved: false, start: pt };
      return;
    }
    const handle = e.target.closest('.handle');
    if (handle && selection.length === 1) {
      const el = byId(selection[0]);
      drag = { kind: 'resize', h: handle.dataset.h, start: pt, orig: { x: el.x, y: el.y, w: el.w, h: el.h }, id: el.id, moved: false };
      return;
    }
    const hit = hitTest(pt, e.altKey);
    if (hit) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        ctl.select(selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : selection.concat(hit.id));
        return;
      }
      if (!selection.includes(hit.id) || e.altKey) ctl.select([hit.id]);
      const movers = selection.map(byId).filter((el) => el && o.canMove(el));
      if (movers.length) {
        drag = { kind: 'move', start: pt, orig: movers.map((el) => ({ id: el.id, x: el.x, y: el.y, w: el.w, h: el.h })), moved: false };
      }
      return;
    }
    if (!e.shiftKey) ctl.select([]);
    if (!o.allowMarquee || o.allowMarquee()) drag = { kind: 'marquee', start: pt, base: e.shiftKey ? selection.slice() : [] };
  });

  overlay.addEventListener('dblclick', (e) => {
    const hit = hitsAt(toSlide(e))[0];
    if (hit && o.onDoubleClick) o.onDoubleClick(hit);
  });

  overlay.addEventListener('contextmenu', (e) => {
    if (!o.onContextMenu) return;
    e.preventDefault();
    const hit = hitsAt(toSlide(e))[0];
    if (hit && !selection.includes(hit.id)) ctl.select([hit.id]);
    o.onContextMenu(e, hit || null);
  });

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  function onMove(e) {
    if (!lastSlide || !document.body.contains(stage)) return;
    const pt = toSlide(e);
    if (!drag) {
      const inside = e.target === overlay || overlay.contains(e.target);
      const next = inside ? (hitsAt(pt)[0] || {}).id || null : null;
      if (next !== hover) { hover = next; drawOverlay(); }
      return;
    }
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx * zoom, dy * zoom) < 3) return;
    drag.moved = true;

    if (drag.kind === 'marquee') {
      const m = { x: Math.min(drag.start.x, pt.x), y: Math.min(drag.start.y, pt.y), w: Math.abs(dx), h: Math.abs(dy) };
      const inside = lastSlide.elements.filter((el) => o.canSelect(el) && el.x >= m.x && el.y >= m.y && el.x + el.w <= m.x + m.w && el.y + el.h <= m.y + m.h).map((el) => el.id);
      selection = [...new Set(drag.base.concat(inside))];
      drawOverlay({ marquee: m });
      return;
    }

    if (drag.kind === 'endpoint') {
      const el = byId(drag.id);
      if (!el) return;
      const fx = Math.max(-0.5, Math.min(1.5, (pt.x - el.x) / Math.max(1, el.w)));
      const fy = Math.max(-0.5, Math.min(1.5, (pt.y - el.y) / Math.max(1, el.h)));
      o.onEndpoint(drag.id, drag.end, [round(fx * 1000) / 1000, round(fy * 1000) / 1000]);
      drag.last = { tip: { x: pt.x, y: pt.y, text: Math.round(pt.x) + ', ' + Math.round(pt.y) } };
      return;
    }

    const guides = [];
    let spacing = [];
    if (drag.kind === 'move') {
      const b = bounds(drag.orig);
      const exclude = new Set(drag.orig.map((x) => x.id));
      let nx = b.x + dx;
      let ny = b.y + dy;
      if (!e.altKey) {
        const lines = snapLines(exclude);
        const sx = nearest([nx, nx + b.w / 2, nx + b.w], lines.xs);
        const sy = nearest([ny, ny + b.h / 2, ny + b.h], lines.ys);
        if (sx) { nx += sx.d; guides.push({ v: sx.line }); } else nx = roundTo(nx, grid());
        if (sy) { ny += sy.d; guides.push({ h: sy.line }); } else ny = roundTo(ny, grid());
        const here = { x: nx, y: ny, w: b.w, h: b.h };
        const ex = equalSpacing(here, exclude, 'x');
        const ey = equalSpacing({ ...here, x: here.x + ex.shift }, exclude, 'y');
        nx += ex.shift;
        ny += ey.shift;
        spacing = [...ex.hints, ...ey.hints];
      }
      if (e.shiftKey) {
        // Shift keeps the move to one axis, whichever it has gone further along.
        if (Math.abs(dx) > Math.abs(dy)) ny = b.y; else nx = b.x;
        spacing = [];
      }
      const ox = nx - b.x;
      const oy = ny - b.y;
      o.onGeometry(drag.orig.map((g) => ({ id: g.id, x: round(g.x + ox), y: round(g.y + oy), w: g.w, h: g.h })), { final: false });
      drag.last = { guides, spacing, tip: { x: nx, y: ny + b.h, text: Math.round(nx) + ', ' + Math.round(ny) } };
    } else if (drag.kind === 'resize') {
      const r = { ...drag.orig };
      const hd = drag.h;
      let left = r.x, top = r.y, right = r.x + r.w, bottom = r.y + r.h;
      if (hd.includes('w')) left += dx;
      if (hd.includes('e')) right += dx;
      if (hd.includes('n')) top += dy;
      if (hd.includes('s')) bottom += dy;
      if (!e.altKey) {
        const lines = snapLines(new Set([drag.id]));
        const snapEdge = (value, list, axis) => {
          const s = nearest([value], list);
          if (s) { guides.push(axis === 'x' ? { v: s.line } : { h: s.line }); return s.line; }
          return roundTo(value, grid());
        };
        if (hd.includes('w')) left = snapEdge(left, lines.xs, 'x');
        if (hd.includes('e')) right = snapEdge(right, lines.xs, 'x');
        if (hd.includes('n')) top = snapEdge(top, lines.ys, 'y');
        if (hd.includes('s')) bottom = snapEdge(bottom, lines.ys, 'y');
      }
      const min = 4;
      if (right - left < min) { if (hd.includes('w')) left = right - min; else right = left + min; }
      if (bottom - top < min) { if (hd.includes('n')) top = bottom - min; else bottom = top + min; }
      let w = right - left;
      let hh = bottom - top;
      if (e.shiftKey && hd.length === 2) {
        // Shift on a corner keeps the proportions.
        const ratio = drag.orig.w / drag.orig.h;
        if (w / hh > ratio) w = hh * ratio; else hh = w / ratio;
        if (hd.includes('w')) left = right - w;
        if (hd.includes('n')) top = bottom - hh;
        guides.length = 0;
      }
      o.onGeometry([{ id: drag.id, x: round(left), y: round(top), w: round(w), h: round(hh) }], { final: false });
      drag.last = { guides, tip: { x: left, y: top + hh, text: Math.round(w) + ' × ' + Math.round(hh) + ' pt' } };
    }
  }

  const round = (v) => Math.round(v * 100) / 100;

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'marquee') {
      drawOverlay();
      o.onSelect(selection.slice());
      return;
    }
    if (d.moved) o.onGeometry(null, { final: true });
    drawOverlay();
  }

  // After every redraw during a drag, the guides, hints and tip go back on top.
  const baseDraw = drawOverlay;
  drawOverlay = (extra) => baseDraw(extra || (drag && drag.last) || {});

  /* --------------------------------------------------------------- drop */

  overlay.addEventListener('dragover', (e) => {
    const types = [...(e.dataTransfer.types || [])];
    if (!types.includes('application/x-slidex-insert') && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    overlay.classList.add('drop-target');
  });
  overlay.addEventListener('dragleave', () => overlay.classList.remove('drop-target'));
  overlay.addEventListener('drop', (e) => {
    overlay.classList.remove('drop-target');
    const pt = toSlide(e);
    const insert = e.dataTransfer.getData('application/x-slidex-insert');
    if (insert) {
      e.preventDefault();
      try { o.onDropInsert(JSON.parse(insert), pt); } catch (err) { /* not ours */ }
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      o.onDropFiles([...e.dataTransfer.files], pt, hitsAt(pt)[0] || null);
    }
  });

  /* --------------------------------------------------------------- zoom */

  ctl.setZoom = (z, anchor) => {
    const before = zoom;
    fitMode = z === 'fit';
    zoom = fitMode ? fitZoom() : Math.max(0.15, Math.min(4, z));
    ctl.renderNow();
    if (anchor && before) {
      const k = zoom / before;
      stage.scrollLeft = (stage.scrollLeft + anchor.x) * k - anchor.x;
      stage.scrollTop = (stage.scrollTop + anchor.y) * k - anchor.y;
    }
    if (o.onZoom) o.onZoom(zoom);
  };
  ctl.isFit = () => fitMode;

  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    ctl.setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  const resize = new ResizeObserver(() => { if (fitMode) ctl.render(); });
  resize.observe(stage);

  /* ------------------------------------------------------ inline editing */

  /**
   * Type into a text box where it sits. The words appear as typed, markup and
   * all, over the box; the slide underneath redraws as you go.
   */
  ctl.editInline = (el, value, onInput, onDone) => {
    const ta = h('textarea.inline-edit', {
      spellcheck: 'true',
      style: { left: px(el.x - 4), top: px(el.y - 4), width: 'max(280px, ' + px(el.w + 8) + ')', height: 'max(120px, ' + px(el.h + 8) + ')' },
    });
    ta.value = value;
    // Beside the overlay rather than in it: the overlay is redrawn on every
    // keystroke, and taking a focused textarea out of the page ends the edit.
    wrap.append(ta);
    ta.addEventListener('input', () => onInput(ta.value));
    ta.addEventListener('mousedown', (e) => e.stopPropagation());
    ta.addEventListener('blur', () => { ta.remove(); drawOverlay(); onDone(); }, { once: true });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); }
      // Tab and Shift+Tab indent a bullet rather than leaving the box, which is
      // what everybody's hands expect on a slide.
      if (e.key === 'Tab') {
        e.preventDefault();
        indentLine(ta, e.shiftKey ? -1 : 1);
        onInput(ta.value);
      }
    });
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };

  /** Move the line the cursor is on in or out by one level (two spaces). */
  function indentLine(ta, direction) {
    const value = ta.value;
    const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const line = value.slice(start, value.indexOf('\n', start) < 0 ? value.length : value.indexOf('\n', start));
    let next = line;
    if (direction > 0) next = '  ' + line;
    else next = line.replace(/^ {1,2}/, '');
    const shift = next.length - line.length;
    ta.value = value.slice(0, start) + next + value.slice(start + line.length);
    ta.setSelectionRange(ta.selectionStart + shift, ta.selectionEnd + shift);
  }

  ctl.destroy = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    resize.disconnect();
  };

  ctl.scrollToElement = (id) => {
    const el = byId(id);
    if (!el) return;
    const top = wrap.offsetTop + el.y * zoom - stage.clientHeight / 3;
    stage.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  stage.tabIndex = -1;
  return ctl;
}
