#!/usr/bin/env bash
# Starts SlideX in a window of its own.
#
# The window is pywebview around the local server. If pywebview is not there
# yet, this sets it up once - a .venv beside the program, with pywebview in it -
# and opens the window. Only if that cannot be done (no Python, no WebKitGTK,
# no connection the first time) does it open in your browser instead, and it
# says why. Either way the program runs: the window is how it is presented, not
# what it is.
#
#   ./SlideX.sh              the window, setting it up the first time
#   ./SlideX.sh --browser    the browser, on purpose
#   ./SlideX.sh --setup      try setting up the window again after it failed
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Node: the one an installer brought, or the machine's.
NODE=""
if [ -x "$DIR/runtime/node/bin/node" ]; then
  NODE="$DIR/runtime/node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE="node"
fi
if [ -z "$NODE" ]; then
  echo "SlideX needs Node.js (version 18 or newer)."
  echo "Download it from https://nodejs.org and run this again."
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 18 ]; then
  echo "SlideX needs Node.js 18 or newer (found $("$NODE" -v))."
  exit 1
fi

browser() {
  echo "Opening in your browser ($1)."
  exec "$NODE" "$DIR/src/server.js" "${ARGS[@]}"
}

ARGS=()
SETUP_AGAIN=0
for a in "$@"; do
  case "$a" in
    --setup) SETUP_AGAIN=1 ;;
    --browser) exec "$NODE" "$DIR/src/server.js" ;;
    *) ARGS+=("$a") ;;
  esac
done

VENV="$DIR/.venv"
FAILED="$VENV.setup-failed"
has_webview() { "$1" -c "import sys; sys.path.insert(0, '$DIR/vendor/python'); import webview" >/dev/null 2>&1; }

# 1. A pywebview already here: the .venv beside the program, or the machine's.
if [ -x "$VENV/bin/python" ] && has_webview "$VENV/bin/python"; then
  exec "$VENV/bin/python" "$DIR/slidex.py" "${ARGS[@]}"
fi
PYTHON=""
command -v python3 >/dev/null 2>&1 && PYTHON="python3"
if [ -z "$PYTHON" ]; then
  browser "there is no python3 for the window"
fi
if has_webview "$PYTHON"; then
  exec "$PYTHON" "$DIR/slidex.py" "${ARGS[@]}"
fi

# 2. The window's engine comes from the system on Linux, not from pip.
if [ "$(uname -s)" = "Linux" ]; then
  if ! "$PYTHON" -c "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')" >/dev/null 2>&1 &&
     ! "$PYTHON" -c "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.0')" >/dev/null 2>&1; then
    echo "For the window, SlideX needs WebKitGTK:  sudo apt install python3-gi gir1.2-webkit2-4.1"
    browser "WebKitGTK is not installed"
  fi
fi

# 3. Set pywebview up, once. A failure is remembered so every start is not a
#    wait for pip; ./SlideX.sh --setup tries again.
if [ -f "$FAILED" ] && [ "$SETUP_AGAIN" = 0 ]; then
  browser "setting up the window failed before - run ./SlideX.sh --setup to try again"
fi
echo "Setting up the SlideX window (once; this needs an internet connection)..."
rm -f "$FAILED"
VENV_OPTS=()
# The system's GTK bindings are not on pip, so the .venv must be able to see them.
[ "$(uname -s)" = "Linux" ] && VENV_OPTS+=(--system-site-packages)
if "$PYTHON" -m venv "${VENV_OPTS[@]}" "$VENV" >/dev/null 2>&1 &&
   "$VENV/bin/python" -m pip install --quiet --disable-pip-version-check -r "$DIR/requirements.txt" &&
   has_webview "$VENV/bin/python"; then
  echo "Done."
  exec "$VENV/bin/python" "$DIR/slidex.py" "${ARGS[@]}"
fi
date > "$FAILED"
if ! "$PYTHON" -m venv --help >/dev/null 2>&1 || ! [ -x "$VENV/bin/python" ]; then
  echo "Python could not make a .venv. On Linux Mint or Ubuntu:  sudo apt install python3-venv"
fi
browser "pywebview could not be installed"
