# Building the desktop app

Adapted from Newsx's BUILDING.md, and built by the same scripts.

The desktop app is the program from source in a window of its own:
[pywebview](https://pywebview.flowrey.dev) around the local server, exactly
what `./SlideX.sh` opens. pywebview draws with the web engine the system already
has - WebKitGTK on Linux, Edge WebView2 on Windows, WebKit on macOS - so the
installers are small, and an official [Node.js](https://nodejs.org) goes in
beside the program so nobody has to install one.

| System | File | What it does | Admin to install? |
| --- | --- | --- | --- |
| Linux Mint, Ubuntu, Debian (x64) | `SlideX-0.1.0-linux-x64.tar.gz` + `install-slidex.sh` | `bash install-slidex.sh` installs it for you into `~/.local/share/slidex`, with a menu entry, icons and a `slidex` command | **No** |
| | `slidex_0.1.0_amd64.deb` | Installs it for everyone into `/opt/slidex` | Yes |
| Windows 10/11 | `SlideX-Setup-0.1.0.exe` | Installs for the current user into `%LOCALAPPDATA%\Programs\SlideX`, with Start-menu and desktop shortcuts | **No** |
| | `SlideX-0.1.0-windows-portable.zip` | Unzip anywhere and run `SlideX.exe` | **No** |
| macOS 12+ | `SlideX-0.1.0-mac-arm64.dmg` (Apple silicon), `…-mac-x64.dmg` (Intel) | Drag SlideX into Applications | **No** |

Uninstalling never touches your decks, which live in `~/SlideX`
(`C:\Users\<you>\SlideX` on Windows).

What each system needs already there:

- **Linux**: Python 3 and WebKitGTK, which Linux Mint and Ubuntu desktops have.
  If the window cannot open, the install script says so and SlideX opens in the
  browser until `sudo apt install python3-gi gir1.2-webkit2-4.1` is run. The
  `.deb` installs them itself.
- **Windows**: the Edge WebView2 runtime, which Windows 11 and an up-to-date
  Windows 10 include.
- **macOS**: nothing.

---

## Linux

On Linux Mint or Ubuntu, with Python 3 and an internet connection:

```bash
git clone https://github.com/Ailinic1/Slidex.git
cd Slidex
python3 desktop/package.py        # or: npm run dist:linux
```

That downloads the newest Node 22 LTS from nodejs.org (checked against its
published SHA-256, and kept in `~/.cache/slidex-build`), installs pywebview into
the package with pip, and writes to `dist/`:

- `SlideX-0.1.0-linux-x64.tar.gz` and `install-slidex.sh`
- `slidex_0.1.0_amd64.deb` (if `dpkg-deb` is installed, as it is on Mint and Ubuntu)

Without a connection:

```bash
# pywebview from an environment that has it
python3 desktop/package.py --vendor-from .venv/lib/python3.12/site-packages
# a Node tarball downloaded earlier from nodejs.org
python3 desktop/package.py --node-tarball ~/Downloads/node-v22.x.y-linux-x64.tar.xz
```

With no Node tarball and no way to download one, the build still finishes with
no Node inside: the `.deb` then depends on the `nodejs` package, and the install
script says so if the machine has no `node`.

**Installing for yourself, with no administrator**, keep the tarball and the
script together and run:

```bash
bash install-slidex.sh             # and later: bash install-slidex.sh --uninstall
```

Running it again with a newer tarball updates SlideX. **For everyone on the
machine:** `sudo apt install ./slidex_0.1.0_amd64.deb` (and `sudo apt remove
slidex`).

To check an installed copy can open its window: `slidex --check`.

---

## Windows and macOS

These are built with [PyInstaller](https://pyinstaller.org), which freezes
`slidex.py` and its own Python into a program, and they have to be built on the
system they are for. The GitHub workflow below does both; by hand:

```bash
python -m pip install pyinstaller -r requirements.txt
python desktop/fetch-node.py win-x64            # darwin-arm64 or darwin-x64 on a Mac
python -m PyInstaller --noconfirm --distpath dist/pyinstaller --workpath build/pyinstaller desktop/pyinstaller/slidex.spec
```

- **Windows**: that makes `dist\pyinstaller\SlideX\SlideX.exe`. For the installer,
  install [Inno Setup 6](https://jrsoftware.org/isinfo.php) and run
  `iscc /DVersion=0.1.0 desktop\windows\slidex.iss`, which writes
  `dist\SlideX-Setup-0.1.0.exe`.
- **macOS**: that makes `dist/pyinstaller/SlideX.app`. Sign it ad hoc - without
  that it will not start on Apple silicon - and make the disk image:

  ```bash
  codesign --force --deep --sign - dist/pyinstaller/SlideX.app
  mkdir dmg && cp -R dist/pyinstaller/SlideX.app dmg/ && ln -s /Applications dmg/Applications
  hdiutil create -volname SlideX -srcfolder dmg -ov -format UDZO dist/SlideX-0.1.0-mac-arm64.dmg
  ```

**The first time it is opened.** Neither is signed with a certificate:

- Windows SmartScreen says *Windows protected your PC*: click **More info ▸ Run
  anyway**, once.
- A Mac refuses the first time on a machine other than the one that built it.
  On macOS 15 and later, open **System Settings ▸ Privacy & Security** and click
  **Open Anyway** beside SlideX; on macOS 12-14, right-click the app, choose
  **Open**, then **Open** again. If it says the app **is damaged**, it was
  quarantined on the way: `xattr -dr com.apple.quarantine /Applications/SlideX.app`.

---

## All three at once, on GitHub

`.github/workflows/desktop.yml` builds every installer on GitHub's own Linux,
Windows and macOS machines. It only runs when you start it, because on a private
repository GitHub bills macOS minutes at ten times the Linux rate:

1. On GitHub, open the repository's **Actions** tab.
2. Choose **Desktop installers** and click **Run workflow**.
3. When it finishes, download the installers from the run's **Artifacts**.

---

## A new version

1. Change `version` in `package.json` - the only place the number is kept.
2. Add an entry at the top of `CHANGELOG.md`.
3. Commit, tag it (`git tag v0.1.0 && git push origin v0.1.0`), and build.

## The icon

`desktop/icons/` holds the icon for each system - `icon.ico` (Windows),
`icon.icns` (macOS) and `linux/*.png` - and `assets/icon.png` is the one the
window and the page use. All of them are drawn from the same handful of
rounded rectangles as `assets/icon.svg`. After changing the mark, `npm run
icons` draws them all again:

```bash
npm run icons
```

It needs nothing installed and no display: a `.ico` and a `.icns` are, at the
sizes that matter, containers of PNGs, and the PNG encoder is the one the PDF
writer already has.

## Where the installed app keeps things

| | Decks | Log |
| --- | --- | --- |
| Linux | `~/SlideX` | `~/.local/state/SlideX/slidex.log` |
| Windows | `C:\Users\<you>\SlideX` | `%LOCALAPPDATA%\SlideX\slidex.log` |
| macOS | `~/SlideX` | `~/Library/Logs/SlideX/slidex.log` |

The log is where "the details are in…" points when something goes wrong.
