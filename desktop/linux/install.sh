#!/usr/bin/env bash
# Puts SlideX in your applications menu, for you alone.
#
# No administrator password, and nothing outside your home folder: the program
# goes to ~/.local/share/slidex, its icons to ~/.local/share/icons, a menu entry
# to ~/.local/share/applications and a `slidex` command to ~/.local/bin.
#
#   bash install-slidex.sh                               the tarball beside this script
#   bash install-slidex.sh SlideX-0.3.0-linux-x64.tar.gz
#   bash install-slidex.sh --uninstall
#
# SlideX opens in a pywebview window, drawn by the WebKitGTK your system already
# has. Installing again replaces the program and keeps every deck, which
# lives in ~/SlideX and is never touched by this script.
set -euo pipefail

APP_ID=slidex
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DEST="$DATA/$APP_ID"
BIN_DIR="$HOME/.local/bin"
MENU="$DATA/applications/$APP_ID.desktop"
ICONS="$DATA/icons/hicolor"
SIZES="16 24 32 48 64 128 256 512"

refresh() {
  update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
  gtk-update-icon-cache --quiet --ignore-theme-index --force "$ICONS" >/dev/null 2>&1 || true
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$MENU" "$BIN_DIR/slidex"
  rm -rf "$DEST"
  for s in $SIZES; do rm -f "$ICONS/${s}x${s}/apps/$APP_ID.png"; done
  refresh
  echo "SlideX is uninstalled. Your decks in ~/SlideX are still there."
  exit 0
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  SOURCE="$(ls -1t "$HERE"/SlideX-*-linux-x64.tar.gz 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$SOURCE" ] || [ ! -f "$SOURCE" ]; then
  echo "No SlideX package found. Put this script in the same folder as it, or name it:" >&2
  echo "  bash $0 path/to/SlideX-linux-x64.tar.gz" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "SlideX needs Python 3, which Linux Mint and Ubuntu come with. Install it:  sudo apt install python3" >&2
  exit 1
fi

# Unpacked beside the old copy and swapped in, so a failed install leaves the
# old one working.
mkdir -p "$DATA" "$DATA/applications" "$BIN_DIR"
WORK="$(mktemp -d "$DATA/.slidex-install-XXXX")"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$SOURCE" -C "$WORK"
if [ ! -f "$WORK/SlideX/slidex.py" ]; then
  echo "That file is not a SlideX package." >&2
  exit 1
fi
rm -rf "$DEST.old"
[ -d "$DEST" ] && mv "$DEST" "$DEST.old"
mv "$WORK/SlideX" "$DEST"
rm -rf "$DEST.old"

cat > "$BIN_DIR/slidex" <<EOF
#!/bin/sh
exec python3 "$DEST/slidex.py" "\$@"
EOF
chmod 755 "$BIN_DIR/slidex"

found=0
for s in $SIZES; do
  icon="$DEST/desktop/icons/linux/${s}x${s}.png"
  if [ -f "$icon" ]; then
    mkdir -p "$ICONS/${s}x${s}/apps"
    cp -f "$icon" "$ICONS/${s}x${s}/apps/$APP_ID.png"
    found=1
  fi
done
[ "$found" = 0 ] && echo "Note: the package has no icons; the menu entry will use a generic one." >&2

# Exec is quoted so a home folder with a space in its name still works.
cat > "$MENU" <<EOF
[Desktop Entry]
Type=Application
Name=SlideX
GenericName=Deck editor
Comment=Make a presentation, and present it
Exec=python3 "$DEST/slidex.py" %U
Icon=$APP_ID
Terminal=false
Categories=Office;Publishing;
StartupWMClass=$APP_ID
EOF
chmod 644 "$MENU"
refresh

echo "SlideX is installed. Open it from the applications menu, under Office, or run: slidex"

# Say plainly what is missing, rather than have the menu entry fail quietly.
if ! python3 "$DEST/slidex.py" --check >/dev/null 2>&1; then
  echo
  python3 "$DEST/slidex.py" --check 2>&1 | sed 's/^/  /'
  echo "SlideX will open in your browser until that is fixed. For its own window:"
  echo "  sudo apt install python3-gi gir1.2-webkit2-4.1"
fi
if [ ! -x "$DEST/runtime/node/bin/node" ] && ! command -v node >/dev/null 2>&1; then
  echo
  echo "This package has no Node.js inside it, and none is installed. Install it:"
  echo "  sudo apt install nodejs"
fi
