# PyInstaller recipe for the Windows and macOS apps. See BUILDING.md.
#
# The app is slidex.py - the pywebview window - frozen with its own Python,
# with the server, the page and an official Node beside it. pywebview ships
# PyInstaller hooks of its own, so its platform code (Edge WebView2 through
# pythonnet on Windows, WebKit through PyObjC on macOS) comes along.
#
#   python desktop/fetch-node.py win-x64          (or darwin-arm64, darwin-x64)
#   pyinstaller --noconfirm desktop/pyinstaller/slidex.spec
#
# One folder, not one file: a single-file build unpacks itself to a temporary
# folder on every start, which is slow and what virus scanners dislike.
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(SPECPATH, '..', '..'))
VERSION = json.load(open(os.path.join(ROOT, 'package.json')))['version']
MAC = sys.platform == 'darwin'


def tree(rel):
    return (os.path.join(ROOT, rel), rel)


datas = [
    tree('src'), tree('web'),
    (os.path.join(ROOT, 'assets', 'icon.png'), 'assets'),
    (os.path.join(ROOT, 'assets', 'icon.svg'), 'assets'),
    (os.path.join(ROOT, 'package.json'), '.'),
    (os.path.join(ROOT, 'LICENSE'), '.'),
    (os.path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), '.'),
    (os.path.join(ROOT, 'build', 'runtime', 'node'), os.path.join('runtime', 'node')),
]

a = Analysis(
    [os.path.join(ROOT, 'slidex.py')],
    pathex=[ROOT],
    datas=datas,
    hiddenimports=['webview'],
    excludes=['tkinter', 'unittest', 'pydoc_data'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='SlideX',
    console=False,
    icon=os.path.join(ROOT, 'desktop', 'icons', 'icon.icns' if MAC else 'icon.ico'),
)
coll = COLLECT(exe, a.binaries, a.datas, name='SlideX')

if MAC:
    app = BUNDLE(
        coll,
        name='SlideX.app',
        icon=os.path.join(ROOT, 'desktop', 'icons', 'icon.icns'),
        bundle_identifier='io.github.ailinic1.slidex',
        version=VERSION,
        info_plist={
            'CFBundleShortVersionString': VERSION,
            'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '12.0',
            'LSApplicationCategoryType': 'public.app-category.productivity',
        },
    )
