// Getting a deck out: a PDF, and PNGs.
//
// The PDF is written by the server from the same drawing operations the editor
// and the projector use, so it is exactly what was on screen - real text in the
// standard PDF fonts, vector charts and graphics, pictures embedded once each.
//
// The PNGs are drawn here rather than on the server, because a picture of a
// slide needs a rasteriser and the browser already is one. They are drawn from
// the same operations, through canvas2d.js, so a PNG and the PDF are the same
// picture.

import { h, clear, toast, openModal, download } from './ui.js';
import { postForBlob } from './api.js';
import { renderSlide } from '../shared/scene.js';
import { resolveSlide, numbering, slideTitle } from '../shared/model.js';
import { slideToPng } from '../shared/canvas2d.js';

const LAYOUTS = [
  ['slides', 'One slide to a page', 'The deck itself, at the size the slides are. This is the one to send.'],
  ['notes', 'Notes', 'Each slide on a page with what you were going to say under it, for you.'],
  ['handout2', 'Handout, two to a page', 'For the room.'],
  ['handout3', 'Handout, three to a page', 'With ruled lines beside each slide to write on.'],
  ['handout6', 'Handout, six to a page', 'The whole deck in a few sheets.'],
];

/**
 * A PDF.
 *
 * The deck is posted rather than read from disk, so a PDF can be made of work
 * that has not finished saving.
 */
export function exportPdf({ deck, deckId }) {
  let layout = 'slides';
  let paper = 'a4';
  let hidden = false;
  const nums = numbering(deck);

  const paperRow = h('div.field');
  const paint = () => {
    clear(paperRow);
    // The slides themselves are the size the slides are; only the printed
    // layouts have a paper size to choose.
    if (layout === 'slides') {
      paperRow.append(h('div.hint', 'The pages will be ' + Math.round(deck.size.width) + ' × ' + Math.round(deck.size.height)
        + ' points, which is the size the slides are - not a sheet of paper with a slide in the middle of it.'));
      return;
    }
    paperRow.append(
      h('label', 'Paper'),
      h('div.seg', [['a4', 'A4'], ['letter', 'US Letter']].map(([v, label]) => h('button' + (paper === v ? '.on' : ''), {
        onclick: (e) => {
          paper = v;
          e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          e.target.classList.add('on');
        },
      }, label))),
    );
  };

  const ctl = openModal({
    title: 'PDF',
    subtitle: 'Drawn from exactly what is on the screen: real text you can search and select, vector charts and graphics, and every picture put in once.',
    size: 'narrow',
    body: h('div', [
      h('div.field', [
        h('label', 'What kind'),
        h('div.starter-list', LAYOUTS.map(([id, label, why]) => h('button.starter' + (id === layout ? '.on' : ''), {
          onclick: (e) => {
            layout = id;
            e.currentTarget.parentElement.querySelectorAll('.starter').forEach((b) => b.classList.remove('on'));
            e.currentTarget.classList.add('on');
            paint();
          },
        }, [h('div.starter-name', label), h('div.starter-why', why)]))),
      ]),
      paperRow,
      nums.count > nums.total ? h('label.toggle', [
        h('input', { type: 'checkbox', onchange: (e) => { hidden = e.target.checked; } }),
        h('span', ['Include the ' + (nums.count - nums.total) + ' hidden slides',
          h('span.why', 'They are left out by default, so the PDF is the talk.')]),
      ]) : null,
    ]),
    footer: (c) => [
      h('button.btn', { onclick: () => c.close() }, 'Cancel'),
      h('button.btn.primary', {
        onclick: async () => {
          c.setBusy(true, 'Writing it…');
          try {
            const { blob, name } = await postForBlob('/api/decks/' + encodeURIComponent(deckId) + '/pdf', { deck, layout, paper, hidden });
            saveBlob(blob, name);
            c.close();
            toast('Saved ' + name, 'It is in your downloads folder, and in the deck’s own folder.', 'ok', 7000);
          } catch (e) {
            c.setBusy(false);
            toast('Could not make the PDF', e.message, 'bad', 9000);
          }
        },
      }, 'Make the PDF'),
    ],
  });
  paint();
  return ctl;
}

/**
 * PNGs: this slide, or every slide.
 *
 * Every slide means a file each rather than a zip, because a zip is one more
 * thing to open and a browser can save twenty files as happily as one.
 */
export function exportPng({ deck, deckId, assets, slideId }) {
  let which = 'one';
  let width = 1920;
  const nums = numbering(deck);
  const here = deck.slides.find((s) => s.id === slideId) || deck.slides[0];

  const ctl = openModal({
    title: 'PNG',
    subtitle: 'Drawn from the same operations as the PDF, so a picture of a slide is the slide.',
    size: 'narrow',
    body: h('div', [
      h('div.field', [
        h('label', 'Which slides'),
        h('div.seg', [
          ['one', 'This one (' + (nums.numberOf(here.id) || '–') + ')'],
          ['all', 'All ' + nums.total],
        ].map(([v, label]) => h('button' + (which === v ? '.on' : ''), {
          onclick: (e) => {
            which = v;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
          },
        }, label))),
      ]),
      h('div.field', [
        h('label', 'How wide'),
        h('div.seg', [[960, 'Screen'], [1920, 'Full HD'], [3840, '4K']].map(([v, label]) => h('button' + (width === v ? '.on' : ''), {
          onclick: (e) => {
            width = v;
            e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
          },
        }, label + ' · ' + v + 'px'))),
        h('div.hint', 'A slide is ' + deck.size.width + ' points across, so Full HD is two pixels to the point - enough for any projector.'),
      ]),
    ]),
    footer: (c) => [
      h('button.btn', { onclick: () => c.close() }, 'Cancel'),
      h('button.btn.primary', {
        onclick: async () => {
          const slides = which === 'all' ? nums.visible : [here];
          c.setBusy(true, 'Drawing ' + slides.length + (slides.length === 1 ? ' slide…' : ' slides…'));
          try {
            const base = slug(deck.title) || 'deck';
            for (const slide of slides) {
              const { ops } = renderSlide(resolveSlide(deck, slide), { deck, slide, numbers: nums, assets, draft: false });
              const blob = await slideToPng(ops, deck.size, {
                width,
                assetUrl: (sha) => '/api/decks/' + encodeURIComponent(deckId) + '/assets/' + sha,
              });
              if (!blob) throw new Error('the picture could not be drawn');
              const n = nums.numberOf(slide.id);
              const name = base + '-' + String(n == null ? 'hidden' : n).padStart(2, '0')
                + (slideTitle(deck, slide) ? '-' + slug(slideTitle(deck, slide)).slice(0, 40) : '') + '.png';
              saveBlob(blob, name);
              // A browser given twenty downloads at once drops most of them.
              await new Promise((r) => setTimeout(r, 120));
            }
            c.close();
            toast(slides.length === 1 ? 'Saved one PNG' : 'Saved ' + slides.length + ' PNGs', 'They are in your downloads folder.', 'ok', 7000);
          } catch (e) {
            c.setBusy(false);
            toast('Could not make the PNGs', e.message, 'bad', 9000);
          }
        },
      }, 'Make the PNGs'),
    ],
  });
  return ctl;
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Hand a blob to the browser to save, under a name. */
function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const link = h('a', { href, download: name, style: { display: 'none' } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export { download };
