#!/usr/bin/env bash
# Convenience wrapper: this machine runs NixOS, where the Playwright browser
# bundle is only runnable inside the FHS-ish nix shell defined in ./shell.nix.
#
#   ./run-tests.sh                 # headless
#   HEADED=1 ./run-tests.sh        # headed (needs a display)
#
set -euo pipefail

cd "$(dirname "$0")"

if command -v nix-shell >/dev/null 2>&1; then
  exec nix-shell --run "npx playwright test $*"
else
  # Non-NixOS: just run it directly (browsers must be installed via
  # `npx playwright install firefox`).
  exec npx playwright test "$@"
fi
