#!/usr/bin/env python3
"""The pywebview window, driven for real.

Adapted from Newsx (test/window-test.py).

Starts SlideX the way slidex.py does - the server, then a window on it - with a
home and a Downloads folder of its own and the window hidden, and checks what
only the window does: the page loads inside it, saving a file goes straight
into Downloads without overwriting, and closing the window stops the server.

    python3 test/window-test.py            with whatever pywebview Python finds
    .venv/bin/python test/window-test.py   with the one requirements.txt installed

It needs pywebview and a display, and says "skip" without them.
"""
import os
import socket
import sys
import tempfile
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import slidex  # noqa: E402

results = []


def ok(name, cond, detail=''):
    results.append(cond)
    print(('  ok    ' if cond else '  FAIL  ') + name + ('' if cond or not detail else '\n        ' + str(detail)))


def main():
    try:
        import webview
    except ImportError:
        print('skip: pywebview is not installed')
        return 0
    if sys.platform.startswith('linux') and not (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
        print('skip: no display to open a window on')
        return 0

    tmp = tempfile.mkdtemp(prefix='slidex-window-')
    downloads = os.path.join(tmp, 'Downloads')
    os.environ['SLIDEX_HOME'] = os.path.join(tmp, 'home')
    slidex.downloads_folder = lambda: downloads
    port = slidex.free_port(17480)
    url = f'http://127.0.0.1:{port}'
    server = slidex.start_server(port)
    up, why = slidex.wait_until_up(url + '/api/config', server)
    print('\nSlideX: the pywebview window')
    ok('the server starts with ' + str(slidex.find_node()), up, why)
    if not up:
        return 1

    window = webview.create_window('SlideX', url, js_api=slidex.Api(), hidden=True, **slidex.WINDOW)

    def drive():
        try:
            for _ in range(150):
                try:
                    if window.evaluate_js('!!(document.querySelector(".start h1") && window.pywebview && window.pywebview.api && window.pywebview.api.save_download)'):
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            title = window.evaluate_js('document.querySelector(".start h1") ? document.querySelector(".start h1").textContent : ""')
            ok('the page loads in the window', title == 'Your decks', title)
            save = "window.pywebview.api.save_download('Deck.pdf', btoa('%PDF-1.4 WORDS'))"
            first = window.evaluate_js(save)
            second = window.evaluate_js(save)
            ok('a download is saved straight into Downloads', os.path.exists(os.path.join(downloads, 'Deck.pdf')), first)
            ok('and a second with the same name does not overwrite it',
               os.path.exists(os.path.join(downloads, 'Deck (2).pdf')) and open(os.path.join(downloads, 'Deck.pdf')).read() == '%PDF-1.4 WORDS', second)
            ok('names cannot climb out of Downloads', slidex.Api().save_download('../../evil.txt', 'eA==')['path'].startswith(downloads))
        except Exception as error:  # noqa: BLE001
            ok('driving the window', False, error)
        finally:
            window.destroy()

    webview.start(drive, private_mode=True)
    slidex.stop_server(server)
    time.sleep(0.3)
    with socket.socket() as probe:
        closed = probe.connect_ex(('127.0.0.1', port)) != 0
    ok('closing the window stops the server', closed)
    print(f'\n{sum(results)} of {len(results)} passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
