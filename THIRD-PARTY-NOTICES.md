# Third-party notices

SlideX's own code is released under the MIT License (see `LICENSE`). This file
lists everything else SlideX comes into contact with, what licence each is
under, and whether it is *in* this repository or *bundled* into the installers.

In short: the repository contains no third-party code; the installers bundle
Node.js and pywebview (with the small pure-Python packages it uses), and the
Windows and macOS builds a Python runtime through PyInstaller. SlideX fetches
nothing while it runs.

---

## 1. In the repository

No third-party source code. The server, the page, the page renderer, the chart
and graphics engines, the icon set and the PDF writer are written for this
program and need nothing installed (`"dependencies": {}` in `package.json`).

`web/shared/metrics.js` holds the advance widths of the WinAnsi characters in
Liberation Sans, Serif and Mono, read from those fonts by
`tools/make-metrics.py`. They are numbers, not font data; the fonts themselves
are not included. The PDFs SlideX writes name the standard PDF fonts (Helvetica,
Times, Courier), which every PDF reader provides, and embed no fonts.

### Carried over from Newsx

SlideX is a sibling of [Newsx](https://github.com/Ailinic1/Newsx), by the same
author and under the same licence. A good deal of this repository began there
and was adapted here: the palettes and colour rules, the font metrics and text
layout, the path, SVG and PDF writers, the chart engine, the icon set, the ten
generated graphics, the three-way merge, the store and the bundle format, the
theme tokens and chrome in `web/css/app.css`, the canvas, the inspector and the
packaging scripts. Every one of those files says in its first lines which Newsx
file it came from. Newsx's own icon set follows the drawing style of Prtclx's,
also by the same author.

The icons are drawn by `desktop/make-icons.mjs` from a few rounded rectangles,
and written by the same PNG encoder the PDF writer uses. Nothing is borrowed to
make them.

### Build tools (not distributed)

| Tool | Licence | Used for |
| --- | --- | --- |
| [PyInstaller](https://pyinstaller.org) | GPL-2.0 with a bootloader exception that permits distributing the programs it builds under any licence | The Windows and macOS apps |
| [Inno Setup](https://jrsoftware.org/isinfo.php) | Inno Setup License (permissive) | The Windows installer |
| [fontTools](https://github.com/fonttools/fonttools) | MIT | Regenerating `web/shared/metrics.js` |

### Optional, when run from source

| Package | Licence | Notes |
| --- | --- | --- |
| [pywebview](https://github.com/r0x0r/pywebview) | BSD-3-Clause | Installed into `.venv` by `SlideX.sh` / `SlideX.bat` (or `pip install -r requirements.txt`) for the window `slidex.py` opens. |

---

## 2. Bundled into the desktop installers

### Node.js

An official build of [Node.js](https://nodejs.org) 22 runs the local server.
Node.js is released under the MIT License and includes components under their
own permissive licences (among them V8, libuv, OpenSSL under Apache-2.0, ICU and
zlib); its `LICENSE` file, which holds all of them, is installed beside it in
`runtime/node/`.

### pywebview and its packages

| Package | Licence |
| --- | --- |
| [pywebview](https://github.com/r0x0r/pywebview) | BSD-3-Clause |
| [bottle](https://bottlepy.org) | MIT |
| [proxy_tools](https://github.com/jtushman/proxy_tools) | MIT |
| [typing_extensions](https://github.com/python/typing_extensions) | PSF-2.0 |
| [pythonnet](https://github.com/pythonnet/pythonnet) (Windows) | MIT |
| [PyObjC](https://github.com/ronaldoussoren/pyobjc) (macOS) | MIT |

On Linux they are in `vendor/python/`, each with its licence in its
`.dist-info` folder. The window's web engine is not bundled: it is the system's
own WebKitGTK (LGPL-2.1), Edge WebView2 or WebKit.

### Python (Windows and macOS)

PyInstaller includes the [Python](https://www.python.org) runtime, released
under the PSF License Agreement, with the licences of the libraries Python
itself contains.

### Installer and package formats

| Component | Where | Licence |
| --- | --- | --- |
| [Inno Setup](https://jrsoftware.org/isinfo.php) | The Windows installer and uninstaller | Inno Setup License |

### SlideX's own

`LICENSE` and this file are installed with the program as well.
