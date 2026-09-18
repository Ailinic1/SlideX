// Presenting: the full screen, and the presenter's own view of it.
//
// The slide on the screen is the same drawing the editor and the PDF make, so
// nothing moves when you start presenting - it only gets bigger. Everything the
// audience sees is one SVG scaled to the screen; everything the presenter needs
// is in a second window, which is the only thing here the audience must never
// see.
//
// Numbers, as everywhere, come from numbering.js. "Go to slide 7" during a talk
// means the seventh slide of the deck as it stands, which is the number printed
// on it and the number on the handout.

import { h, clear, append, toast } from './ui.js';
import { icon } from './icons.js';
import { renderSlide } from '../shared/scene.js';
import { renderSVG } from '../shared/svg.js';
import { resolveSlide, numbering, slideTitle, sectionOf } from '../shared/model.js';

/** How the two windows talk. One channel, one deck at a time. */
const CHANNEL = 'slidex-present';

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

/**
 * Present a deck.
 *
 * @param opts {deck, assetUrl, assets, from: slide id, onEnd(slideId)}
 */
export function startPresenting(opts) {
  const { deck } = opts;
  const nums = numbering(deck);
  if (!nums.total) {
    toast('Nothing to present', 'Every slide in this deck is hidden.', 'warn');
    return null;
  }

  // Hidden slides are not presented. They keep their place in the deck, and
  // their number if the deck says so, but nobody in the room sees them.
  const running = nums.visible;
  const startAt = Math.max(0, running.findIndex((s) => s.id === opts.from));
  let at = startAt < 0 ? 0 : startAt;
  let blank = null;           // null | 'black' | 'white'
  let laser = false;
  let typed = '';
  let channel = null;
  let presenterWindow = null;
  const startedAt = Date.now();

  const root = h('div.present');
  const stage = h('div.present-stage');
  const hint = h('div.present-hint');
  const typedBox = h('div.present-typed');
  const pointer = h('div.laser');
  root.append(stage, hint, typedBox, pointer);
  document.body.append(root);

  /* --------------------------------------------------------- the slide */

  const svgFor = (slide) => {
    const { ops } = renderSlide(resolveSlide(deck, slide), {
      deck, slide, numbers: nums, assets: opts.assets || {}, draft: false,
    });
    return renderSVG(ops, { width: deck.size.width, height: deck.size.height, assetUrl: opts.assetUrl, idPrefix: 'pr' + slide.id });
  };

  /** Which transition this slide arrives with. */
  const transitionOf = (slide) => {
    if (reducedMotion()) return 'none';
    const chosen = slide.transition || (deck.options || {}).transition || 'none';
    return ['none', 'fade', 'slide'].includes(chosen) ? chosen : 'none';
  };

  let showing = null;
  function draw(direction) {
    const slide = running[at];
    const move = transitionOf(slide);
    const next = h('div.present-slide' + (move !== 'none' ? '.enter-' + move + (direction < 0 ? '-back' : '') : ''));
    next.innerHTML = svgFor(slide);
    // Only the slide leaving and the slide arriving are ever in the page; a
    // deck of two hundred slides is still two nodes.
    if (showing && move !== 'none') {
      const leaving = showing;
      leaving.classList.add('leave-' + move + (direction < 0 ? '-back' : ''));
      setTimeout(() => leaving.remove(), 400);
      stage.append(next);
    } else {
      clear(stage).append(next);
    }
    showing = next;
    paintHint();
    send();
  }

  function paintHint() {
    const slide = running[at];
    const n = nums.numberOf(slide.id);
    append(clear(hint), [
      h('span', (n == null ? '–' : n) + ' / ' + nums.total),
      laser ? h('span.on', [icon('laser', 13), ' laser']) : null,
    ]);
    clear(typedBox);
    if (typed) typedBox.append('Go to slide ' + typed, h('kbd', 'Enter'));
    typedBox.classList.toggle('on', !!typed);
    root.dataset.blank = blank || '';
  }

  /* ------------------------------------------------------------- moving */

  function goTo(index, direction = 1) {
    const next = Math.max(0, Math.min(running.length - 1, index));
    if (next === at && showing) return;
    at = next;
    blank = null;
    draw(direction);
  }

  const forward = () => (at >= running.length - 1 ? end() : goTo(at + 1, 1));
  const back = () => goTo(at - 1, -1);

  /** Somebody typed a number and pressed Enter: the slide with that number. */
  function jump() {
    const wanted = Number(typed);
    typed = '';
    const slide = nums.at(wanted);
    if (!slide) {
      toast('There is no slide ' + wanted, 'This deck has ' + nums.total + '.', 'warn', 2500);
      paintHint();
      return;
    }
    const index = running.findIndex((s) => s.id === slide.id);
    if (index < 0) {
      toast('Slide ' + wanted + ' is hidden', 'It is skipped when presenting.', 'warn', 2500);
      paintHint();
      return;
    }
    goTo(index, index > at ? 1 : -1);
  }

  /* --------------------------------------------------- the second window */

  function send() {
    if (!channel) return;
    const slide = running[at];
    const after = running[at + 1] || null;
    channel.postMessage({
      kind: 'state',
      deckId: opts.deckId,
      at,
      total: nums.total,
      number: nums.numberOf(slide.id),
      startedAt,
      blank,
      slideId: slide.id,
      nextId: after ? after.id : null,
    });
  }

  function openPresenter() {
    if (presenterWindow && !presenterWindow.closed) {
      presenterWindow.focus();
      return;
    }
    const url = '/presenter.html?deck=' + encodeURIComponent(opts.deckId);
    let opened = null;
    try { opened = window.open(url, 'slidex-presenter', 'width=1200,height=760'); } catch (e) { opened = null; }
    if (!opened) {
      // A window of its own is the right place for notes, but some windows
      // cannot open one. Saying so is better than doing nothing.
      toast('The presenter view could not open', 'This window would not let a second one open. Open ' + url + ' yourself on the other screen; it follows along.', 'warn', 9000);
      return;
    }
    presenterWindow = opened;
    setTimeout(send, 400);
  }

  /* ------------------------------------------------------------ keyboard */

  function onKey(e) {
    const key = e.key;
    if (key === 'Escape') { e.preventDefault(); return end(); }
    if (/^[0-9]$/.test(key)) { e.preventDefault(); typed = (typed + key).slice(0, 4); return paintHint(); }
    if (key === 'Enter') { e.preventDefault(); return typed ? jump() : forward(); }
    if (key === 'Backspace') { e.preventDefault(); typed = typed.slice(0, -1); return paintHint(); }
    switch (key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'n':
        e.preventDefault(); return forward();
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'p':
        e.preventDefault(); return back();
      case 'Home': e.preventDefault(); return goTo(0, -1);
      case 'End': e.preventDefault(); return goTo(running.length - 1, 1);
      case 'b': case 'B': e.preventDefault(); blank = blank === 'black' ? null : 'black'; send(); return paintHint();
      case 'w': case 'W': e.preventDefault(); blank = blank === 'white' ? null : 'white'; send(); return paintHint();
      case 'l': case 'L': e.preventDefault(); laser = !laser; root.classList.toggle('laser-on', laser); return paintHint();
      case 's': case 'S': e.preventDefault(); return openPresenter();
      case 'f': case 'F': e.preventDefault(); return toggleFullscreen();
      default: return undefined;
    }
  }

  function onMove(e) {
    if (!laser) return;
    pointer.style.left = e.clientX + 'px';
    pointer.style.top = e.clientY + 'px';
  }

  function onClick(e) {
    if (e.target.closest('.present-exit')) return;
    // The right two-thirds go forward, the left third back: the way a remote
    // with two buttons works, for a room where the keyboard is out of reach.
    if (e.clientX < window.innerWidth / 3) back(); else forward();
  }

  /**
   * Full screen, if the window will. A window that refuses - a headless one, a
   * frame, a browser that wants a click first - still presents, at the size it
   * has; it just does not fill the screen.
   */
  function toggleFullscreen() {
    const ignore = () => {};
    try {
      const wanted = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
      if (wanted && typeof wanted.catch === 'function') wanted.catch(ignore);
    } catch (e) { ignore(); }
  }

  /* ----------------------------------------------------------------- end */

  function end() {
    document.removeEventListener('keydown', onKey, true);
    root.removeEventListener('mousemove', onMove);
    root.removeEventListener('click', onClick);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (channel) { channel.postMessage({ kind: 'ended', deckId: opts.deckId }); channel.close(); }
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* already out */ } }
    root.remove();
    if (opts.onEnd) opts.onEnd(running[at] ? running[at].id : null);
  }

  function onFullscreenChange() {
    // Leaving full screen with F11 or Escape ends the talk rather than leaving
    // a full-screen-looking page that is not one.
    if (!document.fullscreenElement && root.dataset.wasFull === '1') end();
    root.dataset.wasFull = document.fullscreenElement ? '1' : '0';
  }

  root.append(h('button.present-exit', { onclick: end, title: 'Stop presenting (Esc)' }, icon('close', 18)));
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('mousemove', onMove);
  root.addEventListener('click', onClick);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  try { channel = new BroadcastChannel(CHANNEL); } catch (e) { channel = null; }
  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (m.deckId !== opts.deckId) return;
      if (m.kind === 'hello') send();
      if (m.kind === 'go') goTo(m.at, m.at > at ? 1 : -1);
      if (m.kind === 'next') forward();
      if (m.kind === 'back') back();
      if (m.kind === 'blank') { blank = m.blank; paintHint(); send(); }
    };
  }
  if (opts.presenter !== false) openPresenter();
  if (opts.fullscreen !== false) toggleFullscreen();
  draw(1);
  return { end, goTo, openPresenter };
}

/* ---------------------------------------------------------- the presenter */

/**
 * The presenter's own window: the slide that is up, the one after it, the notes
 * for this slide, the time it has taken so far and the time of day.
 *
 * It is a second page on the same server rather than part of the editor,
 * because it lives on a second screen and must survive the editor being
 * scrolled, clicked or closed.
 */
export function mountPresenter(host, { deck, deckId, assets, assetUrl }) {
  const nums = numbering(deck);
  const running = nums.visible;
  let at = 0;
  let startedAt = Date.now();
  let blank = null;
  let channel = null;

  const current = h('div.pv-current');
  const next = h('div.pv-next');
  const notes = h('div.pv-notes');
  const elapsed = h('span.pv-elapsed');
  const clock = h('span.pv-clock');
  const where = h('span.pv-where');
  const title = h('div.pv-title');

  const svgFor = (slide) => {
    if (!slide) return '';
    const { ops } = renderSlide(resolveSlide(deck, slide), { deck, slide, numbers: nums, assets: assets || {}, draft: false });
    return renderSVG(ops, { width: deck.size.width, height: deck.size.height, assetUrl, idPrefix: 'pv' + slide.id });
  };

  const say = (kind, extra = {}) => channel && channel.postMessage({ kind, deckId, ...extra });

  function paint() {
    const slide = running[at];
    const after = running[at + 1] || null;
    if (!slide) return;
    current.innerHTML = svgFor(slide);
    next.innerHTML = after ? svgFor(after) : '';
    const section = sectionOf(deck, slide);
    append(clear(title), [
      h('span.pv-n', String(nums.numberOf(slide.id) == null ? '–' : nums.numberOf(slide.id))),
      h('span.pv-slide-title', slideTitle(deck, slide) || 'Untitled'),
      section ? h('span.pill', section.title) : null,
    ]);
    clear(notes);
    if (slide.notes) {
      for (const line of String(slide.notes).split('\n')) notes.append(h('p', line || ' '));
    } else {
      notes.append(h('p.dim', 'No notes for this slide.'));
    }
    where.textContent = (nums.numberOf(slide.id) || '–') + ' of ' + nums.total
      + (after ? '' : ' · last slide');
    host.dataset.blank = blank || '';
  }

  function tick() {
    const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const two = (n) => String(n).padStart(2, '0');
    elapsed.textContent = (secs >= 3600 ? Math.floor(secs / 3600) + ':' + two(Math.floor((secs % 3600) / 60)) : Math.floor(secs / 60)) + ':' + two(secs % 60);
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  clear(host).append(
    h('div.pv-bar', [
      h('div.pv-times', [
        h('span.ico', icon('timer', 15)), elapsed,
        h('span.ico', icon('clock', 15)), clock,
        h('button.btn.sm.ghost', { onclick: () => { startedAt = Date.now(); tick(); }, title: 'Start the timer again' }, 'Reset'),
      ]),
      where,
      h('div.pv-buttons', [
        h('button.btn.sm', { onclick: () => say('back') }, [icon('arrowLeft', 14), 'Back']),
        h('button.btn.sm', { onclick: () => say('next') }, ['Next', icon('arrowRight', 14)]),
        h('button.btn.sm', { onclick: () => { blank = blank === 'black' ? null : 'black'; say('blank', { blank }); paint(); }, title: 'Blank the audience’s screen (B)' }, icon('blankScreen', 14)),
      ]),
    ]),
    h('div.pv-main', [
      h('div.pv-left', [title, current]),
      h('div.pv-right', [
        h('div.pv-label', 'Next'),
        next,
        h('div.pv-label', 'Notes'),
        notes,
      ]),
    ]),
  );

  try { channel = new BroadcastChannel(CHANNEL); } catch (e) { channel = null; }
  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (m.deckId !== deckId) return;
      if (m.kind === 'state') {
        at = m.at;
        startedAt = m.startedAt || startedAt;
        blank = m.blank || null;
        paint();
      }
      if (m.kind === 'ended') {
        clear(host).append(h('div.empty-state', [h('h2', 'The talk has finished'), h('p', 'You can close this window.')]));
      }
    };
    say('hello');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); say('next'); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); say('back'); }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); blank = blank === 'black' ? null : 'black'; say('blank', { blank }); paint(); }
  });

  paint();
  tick();
  setInterval(tick, 1000);
  return { paint };
}
