#!/usr/bin/env python3
"""Build the Linux installers for SlideX: a pywebview app.

The installed program is the program from source - the local server, the page
and slidex.py, which puts the page in a pywebview window - with what it needs
brought along beside it:

    runtime/node/     an official Node.js build, so the machine needs none
    vendor/python/    pywebview and the pure-Python packages it uses

The window itself is WebKitGTK, which pywebview takes from the system (Linux
Mint and Ubuntu ship it), exactly as slidex.py does when run from source.

Out of this come, in dist/:

    SlideX-<version>-linux-x64.tar.gz   the program, for install-slidex.sh
    install-slidex.sh                   installs it for you alone, no administrator
    slidex_<version>_amd64.deb          installs it for everyone (sudo apt install ./...)

    python3 desktop/package.py
    python3 desktop/package.py --node-tarball ~/Downloads/node-v22.x.y-linux-x64.tar.xz
    python3 desktop/package.py --vendor-from .venv/lib/python3.12/site-packages

Node is downloaded from nodejs.org and checked against its published SHA-256
unless a tarball is given; pywebview is installed with pip unless a
site-packages to copy it from is given. Without a connection and without a
tarball the build still finishes, with no Node inside: the installers then use
the machine's (the .deb depends on the nodejs package, the install script says
so if there is none).
"""

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
CACHE = os.path.join(os.environ.get('XDG_CACHE_HOME') or os.path.expanduser('~/.cache'), 'slidex-build')
NODE_LINE = 'v22'

# What the program runs on. Tests, docs and build tooling stay out.
APP_FILES = [
    'src', 'web', 'slidex.py', 'SlideX.sh', 'requirements.txt', 'package.json',
    'LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md', 'CHANGELOG.md',
    'assets/icon.png', 'assets/icon.svg', 'desktop/icons/linux',
]
# pywebview and what it imports on Linux. All pure Python.
VENDORED = ['webview', 'proxy_tools', 'bottle.py', 'typing_extensions.py']
VENDORED_META = ['pywebview-', 'proxy_tools-', 'bottle-', 'typing_extensions-']


def say(message):
    print('  ' + message, flush=True)


def version():
    with open(os.path.join(ROOT, 'package.json'), encoding='utf-8') as handle:
        return json.load(handle)['version']


def fetch(url, timeout=30):
    with urllib.request.urlopen(url, timeout=timeout) as reply:
        return reply.read()


def node_tarball(given):
    """An official Linux x64 Node tarball, checked, or None when there is no way to get one."""
    if given:
        return os.path.abspath(os.path.expanduser(given))
    os.makedirs(CACHE, exist_ok=True)
    try:
        index = json.loads(fetch('https://nodejs.org/dist/index.json'))
        release = next(r['version'] for r in index if r['version'].startswith(NODE_LINE + '.') and r.get('lts'))
        name = f'node-{release}-linux-x64.tar.xz'
        path = os.path.join(CACHE, name)
        sums = fetch(f'https://nodejs.org/dist/{release}/SHASUMS256.txt').decode()
        expected = next(line.split()[0] for line in sums.splitlines() if line.endswith('  ' + name))
        if not (os.path.exists(path) and sha256(path) == expected):
            say('downloading ' + name)
            data = fetch(f'https://nodejs.org/dist/{release}/{name}', timeout=600)
            if hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError('the download did not match its published checksum')
            with open(path, 'wb') as handle:
                handle.write(data)
        return path
    except Exception as error:  # noqa: BLE001 - any failure means "no bundled Node"
        cached = sorted(f for f in os.listdir(CACHE) if f.startswith('node-' + NODE_LINE) and f.endswith('-linux-x64.tar.xz'))
        if cached:
            say(f'nodejs.org is out of reach ({error}); using the cached {cached[-1]}')
            return os.path.join(CACHE, cached[-1])
        say(f'nodejs.org is out of reach ({error}); building without a bundled Node')
        return None


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def unpack_node(tarball, target):
    """Only the node binary and its licence: npm and the headers are not needed to run."""
    os.makedirs(os.path.join(target, 'bin'), exist_ok=True)
    with tarfile.open(tarball) as archive:
        for member in archive.getmembers():
            parts = member.name.split('/', 1)
            if len(parts) < 2:
                continue
            if parts[1] == 'bin/node':
                with archive.extractfile(member) as src, open(os.path.join(target, 'bin', 'node'), 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                os.chmod(os.path.join(target, 'bin', 'node'), 0o755)
            elif parts[1] == 'LICENSE':
                with archive.extractfile(member) as src, open(os.path.join(target, 'LICENSE'), 'wb') as dst:
                    shutil.copyfileobj(src, dst)
    node = os.path.join(target, 'bin', 'node')
    out = subprocess.run([node, '-v'], capture_output=True, text=True, check=True).stdout.strip()
    say('bundled Node ' + out)


def vendor_python(target, source):
    """pywebview, from pip or from an existing site-packages."""
    os.makedirs(target, exist_ok=True)
    if not source:
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
                            '--no-compile', '--target', target, '-r', os.path.join(ROOT, 'requirements.txt')],
                           check=True, timeout=600)
            for name in os.listdir(target):
                if name not in VENDORED and not any(name.startswith(m) for m in VENDORED_META) and name != 'bin':
                    shutil.rmtree(os.path.join(target, name), ignore_errors=True)
            shutil.rmtree(os.path.join(target, 'bin'), ignore_errors=True)
            say('vendored pywebview from pip')
            return
        except (subprocess.SubprocessError, OSError) as error:
            raise SystemExit('pip could not install pywebview (' + str(error) + '). '
                             'Pass --vendor-from with a site-packages that has it, such as .venv/lib/python3.12/site-packages.')
    sources = [os.path.abspath(os.path.expanduser(source)), '/usr/lib/python3/dist-packages']
    for item in VENDORED:
        origin = next((os.path.join(s, item) for s in sources if os.path.exists(os.path.join(s, item))), None)
        if not origin:
            raise SystemExit(f'{item} is not in {source}.')
        copy(origin, os.path.join(target, item))
    for s in sources:
        for name in os.listdir(s):
            if name.endswith('.dist-info') and any(name.startswith(m) for m in VENDORED_META) and not os.path.exists(os.path.join(target, name)):
                if name.startswith('typing_extensions-') or s == sources[0]:
                    copy(os.path.join(s, name), os.path.join(target, name))
    say('vendored pywebview from ' + source)


def copy(src, dst):
    ignore = shutil.ignore_patterns('__pycache__', '*.pyc')
    if os.path.isdir(src):
        shutil.copytree(src, dst, ignore=ignore)
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def stage(work, node, vendor_from):
    app = os.path.join(work, 'SlideX')
    for item in APP_FILES:
        copy(os.path.join(ROOT, item), os.path.join(app, item))
    # Marks an installed copy, so slidex.py writes a log instead of a terminal.
    with open(os.path.join(app, '.packaged'), 'w') as handle:
        handle.write(version() + '\n')
    if node:
        unpack_node(node, os.path.join(app, 'runtime', 'node'))
    vendor_python(os.path.join(app, 'vendor', 'python'), vendor_from)
    for dirpath, _, files in os.walk(app):
        for name in files:
            path = os.path.join(dirpath, name)
            if name in ('slidex.py', 'SlideX.sh') or path.endswith('/bin/node'):
                os.chmod(path, 0o755)
    return app


def make_tarball(app, path):
    with tarfile.open(path, 'w:gz') as archive:
        archive.add(app, arcname='SlideX', filter=lambda info: _owned(info))
    say('wrote ' + os.path.relpath(path, ROOT))


def _owned(info):
    info.uid = info.gid = 0
    info.uname = info.gname = ''
    return info


DESKTOP_ENTRY = """[Desktop Entry]
Type=Application
Name=SlideX
GenericName=Deck editor
Comment=Make a presentation, and present it
Exec={exec} %U
Icon=slidex
Terminal=false
Categories=Office;Publishing;
StartupWMClass=slidex
"""


def make_deb(app, path, bundled_node):
    ver = version()
    work = tempfile.mkdtemp(prefix='slidex-deb-')
    try:
        root = os.path.join(work, 'root')
        copy(app, os.path.join(root, 'opt', 'slidex'))
        os.makedirs(os.path.join(root, 'usr', 'bin'))
        with open(os.path.join(root, 'usr', 'bin', 'slidex'), 'w') as handle:
            handle.write('#!/bin/sh\nexec /usr/bin/python3 /opt/slidex/slidex.py "$@"\n')
        os.chmod(os.path.join(root, 'usr', 'bin', 'slidex'), 0o755)
        apps = os.path.join(root, 'usr', 'share', 'applications')
        os.makedirs(apps)
        with open(os.path.join(apps, 'slidex.desktop'), 'w') as handle:
            handle.write(DESKTOP_ENTRY.format(exec='/usr/bin/slidex'))
        for png in os.listdir(os.path.join(app, 'desktop', 'icons', 'linux')):
            size = png.split('.')[0]
            copy(os.path.join(app, 'desktop', 'icons', 'linux', png), os.path.join(root, 'usr', 'share', 'icons', 'hicolor', size, 'apps', 'slidex.png'))
        size_kb = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(root) for f in fs) // 1024
        depends = ['python3 (>= 3.8)', 'python3-gi', 'gir1.2-webkit2-4.1 | gir1.2-webkit2-4.0', 'xdg-utils', 'xdg-user-dirs']
        if not bundled_node:
            depends.insert(0, 'nodejs (>= 18)')
        control = os.path.join(root, 'DEBIAN')
        os.makedirs(control)
        with open(os.path.join(control, 'control'), 'w') as handle:
            handle.write('\n'.join([
                'Package: slidex',
                'Version: ' + ver,
                'Section: editors',
                'Priority: optional',
                'Architecture: amd64',
                'Maintainer: Arseniy A. Ilinich <ailinic1@users.noreply.github.com>',
                'Depends: ' + ', '.join(depends),
                'Installed-Size: ' + str(size_kb),
                'Homepage: https://github.com/Ailinic1/Slidex',
                'Description: Offline presentation editor',
                ' Slides that renumber themselves the moment they are moved, deck styles',
                ' generated from a seed by rules, charts, icons and generated graphics,',
                ' PDF and PNG export, present mode with a presenter view, and versions',
                ' shared by push and pull through a folder that already syncs itself.',
                ' Runs entirely on this computer. Opens in a pywebview window.',
                '',
            ]))
        for script, body in (
            ('postinst', '#!/bin/sh\nset -e\nupdate-desktop-database -q /usr/share/applications 2>/dev/null || true\ngtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true\n'),
            ('postrm', '#!/bin/sh\nset -e\nupdate-desktop-database -q /usr/share/applications 2>/dev/null || true\n'),
        ):
            with open(os.path.join(control, script), 'w') as handle:
                handle.write(body)
            os.chmod(os.path.join(control, script), 0o755)
        subprocess.run(['dpkg-deb', '--root-owner-group', '--build', root, path], check=True, stdout=subprocess.DEVNULL)
        say('wrote ' + os.path.relpath(path, ROOT))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description='Build the SlideX Linux installers.')
    parser.add_argument('--node-tarball', help='an official node-v*-linux-x64.tar.xz to bundle, instead of downloading one')
    parser.add_argument('--no-node', action='store_true', help='do not bundle Node; use the machine\'s')
    parser.add_argument('--vendor-from', help='a site-packages with pywebview in it, instead of pip')
    parser.add_argument('--no-deb', action='store_true', help='skip the .deb')
    args = parser.parse_args()

    ver = version()
    print(f'SlideX {ver}: Linux installers')
    node = None if args.no_node else node_tarball(args.node_tarball)
    work = tempfile.mkdtemp(prefix='slidex-build-')
    try:
        app = stage(work, node, args.vendor_from)
        os.makedirs(DIST, exist_ok=True)
        for old in os.listdir(DIST):
            if old.startswith(('SlideX-', 'slidex_', 'install-slidex')) or old in ('linux-unpacked', 'builder-debug.yml', 'builder-effective-config.yaml'):
                target = os.path.join(DIST, old)
                shutil.rmtree(target) if os.path.isdir(target) else os.remove(target)
        make_tarball(app, os.path.join(DIST, f'SlideX-{ver}-linux-x64.tar.gz'))
        copy(os.path.join(ROOT, 'desktop', 'linux', 'install.sh'), os.path.join(DIST, 'install-slidex.sh'))
        os.chmod(os.path.join(DIST, 'install-slidex.sh'), 0o755)
        say('wrote dist/install-slidex.sh')
        if not args.no_deb:
            if shutil.which('dpkg-deb'):
                make_deb(app, os.path.join(DIST, f'slidex_{ver}_amd64.deb'), bool(node))
            else:
                say('dpkg-deb is not installed, so there is no .deb')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
