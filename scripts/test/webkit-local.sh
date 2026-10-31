#!/bin/sh
# Starts Playwright's headless WebKit like its own launcher does, but keeps the libraries unpacked
# into ~/.cache/ctm-test-libs/extra on the path (machines without root; see docs/testing.md).
# CTM_WEBKIT_DIR is Playwright's minibrowser-wpe folder; CTM_EXTRA_LIBS the extra library path.
set -eu
MYDIR="$CTM_WEBKIT_DIR"
export WEBKIT_EXEC_PATH="$MYDIR/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$MYDIR/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$MYDIR/share"
export LD_LIBRARY_PATH="$MYDIR/lib:$MYDIR/sys/lib:$CTM_EXTRA_LIBS"
export WEBKIT_FORCE_COMPLEX_TEXT=1
# Mesa's EGL driver from the same local set (software rendering is enough for tests).
if [ -n "${CTM_EXTRA_ROOT:-}" ]; then
  export __EGL_VENDOR_LIBRARY_DIRS="$CTM_EXTRA_ROOT/usr/share/glvnd/egl_vendor.d"
  export LIBGL_DRIVERS_PATH="$CTM_EXTRA_ROOT/usr/lib/x86_64-linux-gnu/dri"
fi
exec "$MYDIR/bin/MiniBrowser" "$@"
