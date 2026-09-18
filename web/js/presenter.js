// The presenter view, on its own page.
//
// It is a page rather than a panel because it lives on a second screen: the
// editor can be scrolled, clicked or closed without the notes going with it.
// It loads the deck from the local server itself, and follows the talk through
// a channel the two windows share.

import { h, clear } from './ui.js';
import { api } from './api.js';
import { mountPresenter } from './present.js';

const host = document.getElementById('presenter');

async function boot() {
  const deckId = new URL(window.location.href).searchParams.get('deck');
  if (!deckId) {
    clear(host).append(h('div.empty-state', [
      h('h2', 'Nothing to present'),
      h('p', 'Open this from the Present tab of a deck, and it follows the talk.'),
    ]));
    return;
  }
  try {
    const [open, config] = await Promise.all([api.getDeck(deckId), api.getConfig()]);
    document.documentElement.setAttribute('data-theme', ['dark', 'light', 'contrast'].includes(config.theme) ? config.theme : 'dark');
    document.title = open.record.name + ' — presenter view';
    mountPresenter(host, {
      deck: open.working.deck,
      deckId,
      assets: open.assets,
      assetUrl: (sha) => api.assetUrl(deckId, sha),
    });
  } catch (e) {
    clear(host).append(h('div.empty-state', [h('h2', 'That deck could not be opened'), h('p', e.message)]));
  }
}

boot();
