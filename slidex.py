#!/usr/bin/env python3
"""SlideX in a window of its own.

Adapted from Newsx (newsx.py).

The program is a small HTTP server and a page. An editor you present from
should not be one more tab in a browser already full of them, so this starts
the server, waits until it answers, and puts a pywebview window on it with the
program's own title and icon. Closing the window stops the server; nothing is
left running.

pywebview draws with whatever the system already has - WebKitGTK on Linux, Edge
WebView2 on Windows, WebKit on macOS - so the window is small and native, and
the installed app is this same file:

    python3 slidex.py              the window
    python3 slidex.py --browser    the browser, on purpose
    python3 slidex.py --port 7500  somewhere else

What it needs it looks for beside itself first, and on the machine second:

    runtime/node/...     a Node the installer brought, else `node` on the PATH
    vendor/python/       a pywebview the installer brought, else one pip installed

If the window cannot be had - no pywebview, no WebKit, no display - it says so in
one sentence and opens the browser instead, rather than failing to start.

SLIDEX_PORT and SLIDEX_HOME work here as they do everywhere else.
"""

import argparse
import base64
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

# A frozen build (PyInstaller, on Windows and macOS) unpacks its files to
# sys._MEIPASS; from source and in the Linux package they are beside this file.
HERE = getattr(sys, '_MEIPASS', None) or os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, 'src', 'server.js')
ICON = os.path.join(HERE, 'assets', 'icon.png')
VENDOR = os.path.join(HERE, 'vendor', 'python')
# GTK on X11 quietly drops a window icon as large as the 512px one, leaving the
# task bar with nothing to show, so the window gets the sized ones instead.
LINUX_ICONS = os.path.join(HERE, 'desktop', 'icons', 'linux')
LINUX_SIZES = (16, 24, 32, 48, 64, 128, 256)
# The window's class on Linux, which is how a task bar finds the menu entry
# (StartupWMClass) and its icon. Left alone it would be "slidex.py".
WM_CLASS = 'slidex'
DEFAULT_PORT = 7431

# The window a deck is made in. Big enough for the ribbon to lay itself out
# without collapsing, and for the sorter, the slide and the inspector to sit
# side by side, which is the whole layout of the editor.
WINDOW = {'width': 1480, 'height': 940, 'min_size': (960, 620)}

if os.path.isdir(VENDOR):
    sys.path.insert(0, VENDOR)

# A windowed Windows build has no console, and Python gives it no stdout or
# stderr at all; printing would then be an error rather than nothing.
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')


def free_port(preferred):
    """`preferred` if nothing holds it, otherwise whatever the OS gives us.

    A second copy of the program is a reasonable thing to want - two publications
    open at once - and it should not be a port collision with a message about
    EADDRINUSE.
    """
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', preferred))
            return preferred
        except OSError:
            pass
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def find_node():
    """The Node the installer brought, or the one on the PATH."""
    for candidate in (
        os.path.join(HERE, 'runtime', 'node', 'bin', 'node'),
        os.path.join(HERE, 'runtime', 'node', 'node.exe'),
    ):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return shutil.which('node')


def start_server(port, log=None):
    """Run the server the way `npm start` does, minus the browser."""
    node = find_node()
    if not node:
        fail('SlideX needs Node.js 18 or newer, and there is no `node` on the PATH. '
             'Install it from https://nodejs.org and try again.')
    env = {
        **os.environ,
        'SLIDEX_PORT': str(port),
        # The window is the browser. Without this the machine would open a
        # second one on the same address.
        'SLIDEX_NO_OPEN': '1',
    }
    if log:
        env['SLIDEX_LOG'] = log
    out = open(log, 'a', encoding='utf-8') if log else None
    flags = 0x08000000 if sys.platform == 'win32' else 0  # CREATE_NO_WINDOW: no console flashes up
    return subprocess.Popen([node, SERVER], cwd=HERE, env=env, stdout=out, stderr=out, creationflags=flags)


def wait_until_up(url, process, seconds=20):
    """Block until the server answers, or say why it never did."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        if process.poll() is not None:
            return False, f'The server stopped before it was ready (exit {process.returncode}).'
        try:
            with urllib.request.urlopen(url, timeout=1) as reply:
                if reply.status == 200:
                    return True, ''
        except (urllib.error.URLError, OSError):
            time.sleep(0.15)
    return False, f'The server did not answer on {url} within {seconds} seconds.'


def stop_server(process):
    """Ask, then insist. Either way, do not leave a server behind."""
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def installed():
    """Started from a menu or an installer, with no terminal to print to."""
    return bool(getattr(sys, 'frozen', False)) or os.path.exists(os.path.join(HERE, '.packaged'))


def log_file():
    """Where an installed app writes what a terminal would have shown."""
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    elif sys.platform == 'darwin':
        base = os.path.expanduser('~/Library/Logs')
    else:
        base = os.environ.get('XDG_STATE_HOME') or os.path.expanduser('~/.local/state')
    folder = os.path.join(base, 'SlideX')
    try:
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, 'slidex.log')
        if os.path.exists(path) and os.path.getsize(path) > 2 * 1024 * 1024:
            os.replace(path, path + '.old')
        return path
    except OSError:
        return None


def fail(message):
    """Say why it cannot start - in a dialog too, when nobody is watching a terminal."""
    print(message, file=sys.stderr)
    if installed() and sys.platform == 'win32':
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, 'SlideX could not start', 0x10)
        except Exception:
            pass
    sys.exit(1)


def downloads_folder():
    """The person's Downloads folder, however their system names it."""
    if sys.platform.startswith('linux'):
        try:
            out = subprocess.run(['xdg-user-dir', 'DOWNLOAD'], capture_output=True, text=True, timeout=3).stdout.strip()
            if out and out != os.path.expanduser('~'):
                return out
        except (OSError, subprocess.SubprocessError):
            pass
    return os.path.join(os.path.expanduser('~'), 'Downloads')


class Api:
    """What the page may ask of the window, beyond what a browser page can do.

    A web view left to itself either refuses a download or asks where to put
    it, differently on each system. Saving through here puts every PDF and
    bundle straight into Downloads, never over a file already there - which is
    where the page's message says it went.
    """

    def save_download(self, name, data):
        name = os.path.basename(str(name or 'download')) or 'download'
        name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name)
        folder = downloads_folder()
        os.makedirs(folder, exist_ok=True)
        stem, ext = os.path.splitext(name)
        target = os.path.join(folder, name)
        n = 2
        while os.path.exists(target):
            target = os.path.join(folder, f'{stem} ({n}){ext}')
            n += 1
        with open(target, 'wb') as handle:
            handle.write(base64.b64decode(data))
        return {'path': target, 'folder': folder}


def linux_icons():
    """The sized icons that exist, smallest first."""
    paths = [os.path.join(LINUX_ICONS, f'{s}x{s}.png') for s in LINUX_SIZES]
    return [p for p in paths if os.path.exists(p)]


def prepare_gtk_window():
    """Name the window's class and give every window the sized icons.

    Has to run before GTK opens the display. Where there is no GTK this does
    nothing, and pywebview uses whatever backend it finds.
    """
    try:
        import gi
        gi.require_version('Gtk', '3.0')
        gi.require_version('GdkPixbuf', '2.0')
        from gi.repository import GdkPixbuf, GLib, Gtk
    except (ImportError, ValueError):
        return
    GLib.set_prgname(WM_CLASS)
    try:
        Gtk.Window.set_default_icon_list(
            [GdkPixbuf.Pixbuf.new_from_file(p) for p in linux_icons()])
    except GLib.Error:
        pass


def open_in_browser(url):
    import webbrowser
    webbrowser.open(url)
    print(f'SlideX is at {url}. Close this terminal to stop it.')


def main(argv=None):
    parser = argparse.ArgumentParser(description='SlideX')
    parser.add_argument('--port', type=int,
                        default=int(os.environ.get('SLIDEX_PORT') or DEFAULT_PORT))
    parser.add_argument('--browser', action='store_true',
                        help='open in the default browser instead of a window')
    parser.add_argument('--check', action='store_true',
                        help='say whether the window can be opened here, and stop')
    args = parser.parse_args(argv)

    # Asked for before the server starts, so "pywebview is not installed" is a
    # sentence on its own rather than something discovered after a server is
    # already running.
    webview = None
    why_not = None
    if not args.browser:
        try:
            import webview as webview_module
            webview = webview_module
        except ImportError:
            why_not = 'pywebview is not installed'
        if webview and sys.platform.startswith('linux'):
            try:
                import gi
                gi.require_version('Gtk', '3.0')
                try:
                    gi.require_version('WebKit2', '4.1')
                except ValueError:
                    gi.require_version('WebKit2', '4.0')
                from gi.repository import WebKit2  # noqa: F401
            except (ImportError, ValueError):
                webview = None
                why_not = 'WebKitGTK is not installed (sudo apt install python3-gi gir1.2-webkit2-4.1)'
        if webview and sys.platform.startswith('linux') and not (
                os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
            # Asked here rather than left to GTK, which does not raise when it
            # cannot open a display: it prints a warning and ends the process,
            # so there would be nothing to catch and fall back from.
            webview = None
            why_not = 'there is no display here'

    if args.check:
        try:
            from importlib.metadata import version
            which = 'pywebview ' + version('pywebview')
        except Exception:
            which = 'pywebview'
        print('window: ' + (which if webview else 'no - ' + str(why_not)))
        print('node: ' + str(find_node()))
        return 0 if webview else 1

    if why_not and not args.browser:
        print(why_not + ', so SlideX will open in your browser.', file=sys.stderr)

    log = log_file() if installed() else None
    port = free_port(args.port)
    url = f'http://127.0.0.1:{port}'
    server = start_server(port, log)
    up, why = wait_until_up(url + '/api/config', server)
    if not up:
        stop_server(server)
        fail('SlideX could not start: ' + why + (f' The details are in {log}.' if log else ''))

    if not webview:
        open_in_browser(url)
        try:
            server.wait()
        except KeyboardInterrupt:
            pass
        finally:
            stop_server(server)
        return 0

    try:
        webview.create_window('SlideX', url, js_api=Api(), hidden=os.environ.get('SLIDEX_WINDOW_HIDDEN') == '1', **WINDOW)
        # Links out open in the browser, not in the window.
        try:
            webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
            webview.settings['ALLOW_DOWNLOADS'] = True
        except (AttributeError, TypeError):
            pass
        start = {'private_mode': False}
        icon = ICON
        if sys.platform.startswith('linux'):
            prepare_gtk_window()
            sized = linux_icons()
            if sized:
                icon = sized[-1]
        if os.path.exists(icon):
            start['icon'] = icon
        webview.start(**start)
    except Exception as error:                      # no display, no WebKit, ...
        print(f'The window could not be opened ({error}); using your browser instead.',
              file=sys.stderr)
        open_in_browser(url)
        try:
            server.wait()
        except KeyboardInterrupt:
            pass
    finally:
        stop_server(server)
    return 0


if __name__ == '__main__':
    sys.exit(main())
