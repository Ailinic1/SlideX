#!/usr/bin/env python3
"""Fetch an official Node.js for a platform and put it where slidex.py looks.

    python3 desktop/fetch-node.py win-x64      -> build/runtime/node/node.exe
    python3 desktop/fetch-node.py darwin-arm64 -> build/runtime/node/bin/node
    python3 desktop/fetch-node.py linux-x64    -> build/runtime/node/bin/node

The newest v22 LTS from nodejs.org, checked against its published SHA-256.
Only the node program and its licence are kept; npm is not needed to run.
"""
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINE = 'v22'


def fetch(url, timeout=600):
    with urllib.request.urlopen(url, timeout=timeout) as reply:
        return reply.read()


def main():
    platform = sys.argv[1] if len(sys.argv) > 1 else 'linux-x64'
    target = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, 'build', 'runtime', 'node')
    index = json.loads(fetch('https://nodejs.org/dist/index.json'))
    release = next(r['version'] for r in index if r['version'].startswith(LINE + '.') and r.get('lts'))
    name = f'node-{release}-{platform}.' + ('zip' if platform.startswith('win') else 'tar.gz')
    sums = fetch(f'https://nodejs.org/dist/{release}/SHASUMS256.txt').decode()
    expected = next(line.split()[0] for line in sums.splitlines() if line.endswith('  ' + name))
    data = fetch(f'https://nodejs.org/dist/{release}/{name}')
    if hashlib.sha256(data).hexdigest() != expected:
        sys.exit(name + ' did not match its published checksum')
    shutil.rmtree(target, ignore_errors=True)
    os.makedirs(target)
    if name.endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for member in archive.namelist():
                tail = member.split('/', 1)[-1]
                if tail in ('node.exe', 'LICENSE'):
                    with archive.open(member) as src, open(os.path.join(target, tail), 'wb') as dst:
                        shutil.copyfileobj(src, dst)
    else:
        os.makedirs(os.path.join(target, 'bin'))
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for member in archive.getmembers():
                tail = member.name.split('/', 1)[-1]
                if tail in ('bin/node', 'LICENSE'):
                    with archive.extractfile(member) as src, open(os.path.join(target, tail), 'wb') as dst:
                        shutil.copyfileobj(src, dst)
        os.chmod(os.path.join(target, 'bin', 'node'), 0o755)
    print(f'Node {release} for {platform} in {target}')


if __name__ == '__main__':
    main()
