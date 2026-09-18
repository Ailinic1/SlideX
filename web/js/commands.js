// The command palette: <kbd>Ctrl</kbd>+<kbd>K</kbd>.
//
// One box that does everything a menu does, and the only way to reach a slide
// by typing its number. Type a number and it offers "go to slide 7"; type
// words and it matches commands, slides by their titles, and sections.
//
// Slide numbers here come from the same place everything else's do - the deck's
// order - so "go to slide 7" means the seventh slide as the deck stands, not
// whatever slide was seventh when somebody last saved.

import { h, clear } from './ui.js';
import { icon } from './icons.js';
import { numbering, slideTitle } from '../shared/model.js';
import { state as app, deck } from './app.js';

let open = null;

/** Everything the palette can do. Filled in by the editor and present mode. */
const providers = [];
export function provideCommands(fn) { providers.push(fn); }

export function openCommands(initial = '') {
  if (open) { open.close(); open = null; }
  const d = deck();
  if (!d) return;
  const nums = numbering(d);

  const input = h('input.cmd-input', { placeholder: 'A command, a slide, or a number…', value: initial, spellcheck: 'false' });
  const list = h('div.cmd-list');
  const panel = h('div.cmd-panel', [
    h('div.cmd-head', [h('span.ico', icon('search', 15)), input, h('kbd', 'Esc')]),
    list,
    h('div.cmd-foot', [h('span.dim', 'Type a number to go to that slide.')]),
  ]);
  const overlay = h('div.overlay.cmd-overlay', { onmousedown: (e) => { if (e.target === overlay) close(); } }, panel);
  document.body.append(overlay);

  let items = [];
  let cursor = 0;

  function collect(query) {
    const q = query.trim().toLowerCase();
    const out = [];
    // A bare number is almost always somebody wanting that slide.
    const asNumber = /^\d+$/.test(q) ? Number(q) : null;
    if (asNumber != null) {
      const slide = nums.at(asNumber);
      out.push(slide
        ? { label: 'Go to slide ' + asNumber, hint: slideTitle(d, slide) || 'Untitled', ic: 'slides', run: () => goTo(slide.id) }
        : { label: 'There is no slide ' + asNumber, hint: 'This deck has ' + nums.total + '.', ic: 'close', disabled: true });
    }
    for (const provide of providers) out.push(...provide(q));
    for (const slide of d.slides) {
      const n = nums.numberOf(slide.id);
      const title = slideTitle(d, slide) || 'Untitled';
      out.push({
        label: (n == null ? '–' : n) + '. ' + title,
        hint: 'Go to this slide' + (slide.hidden ? ' (hidden)' : ''),
        ic: 'slides',
        group: 'Slides',
        run: () => goTo(slide.id),
      });
    }
    for (const section of d.sections || []) {
      const first = d.slides.find((s) => s.sectionId === section.id);
      if (!first) continue;
      out.push({ label: section.title, hint: 'Go to this section', ic: 'folder', group: 'Sections', run: () => goTo(first.id) });
    }
    if (!q) return out.filter((x) => x.group !== 'Slides' || d.slides.length <= 12).slice(0, 40);
    return out.filter((x) => (x.label + ' ' + (x.hint || '')).toLowerCase().includes(q)).slice(0, 40);
  }

  function goTo(id) {
    close();
    import('./editor.js').then((m) => m.goToSlide(id));
  }

  function paint() {
    clear(list);
    items = collect(input.value);
    if (!items.length) {
      list.append(h('div.cmd-empty', 'Nothing matches that.'));
      return;
    }
    cursor = Math.max(0, Math.min(items.length - 1, cursor));
    let group = null;
    items.forEach((item, i) => {
      if (item.group && item.group !== group) {
        group = item.group;
        list.append(h('div.cmd-group', group));
      }
      const row = h('button.cmd-item' + (i === cursor ? '.on' : '') + (item.disabled ? '.dim' : ''), {
        onmousemove: () => { if (cursor !== i) { cursor = i; paintCursor(); } },
        onclick: () => choose(i),
      }, [
        h('span.ico', icon(item.ic || 'chevronRight', 14)),
        h('span.cmd-label', item.label),
        item.hint ? h('span.cmd-hint', item.hint) : null,
        item.keys ? h('kbd', item.keys) : null,
      ]);
      list.append(row);
    });
  }

  function paintCursor() {
    [...list.querySelectorAll('.cmd-item')].forEach((row, i) => row.classList.toggle('on', i === cursor));
  }

  function choose(i) {
    const item = items[i];
    if (!item || item.disabled || !item.run) return;
    const run = item.run;
    close();
    run();
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    open = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(items.length - 1, cursor + 1); return scrollInto(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); return scrollInto(); }
    if (e.key === 'Enter') { e.preventDefault(); return choose(cursor); }
    return undefined;
  }

  function scrollInto() {
    paintCursor();
    const row = list.querySelectorAll('.cmd-item')[cursor];
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => { cursor = 0; paint(); });
  document.addEventListener('keydown', onKey, true);
  paint();
  input.focus();
  open = { close };
  return open;
}
