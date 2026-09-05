#!/usr/bin/env sh
# The port's load-bearing assumption, checked against a deployed response:
#
#   1. no <script> anywhere            — the `noScripts` route rule in nuxt.config.ts
#   2. no inline <style>               — `features.inlineStyles: false`
#   3. a <link rel=stylesheet>         — the one stylesheet, extracted to its own hashed file
#   4. the markup still server-rendered — noScripts drops the JS, not the HTML
#
# Together those are what let a page keep `default-src 'none'` with no `script-src` at all. Guide
# pages render markdown a stranger wrote and that CSP is the only thing making it safe, so if this
# stops passing, `/g/**` cannot move.
#
#   sh scripts/probe.sh https://passalong-web.<subdomain>.workers.dev [path]
#
# It runs against the landing page by default — a real page under the real route rule, rather than
# a fixture that could drift from one. `nuxt dev` cannot answer any of this: a development build
# ships scripts and inlines styles whatever the config says.
set -eu

origin=${1:?usage: probe.sh <origin> [path]}
path=${2:-/}
html=$(curl -fsS "$origin$path")
fail=0

check() {
  if [ "$1" = "ok" ]; then
    printf '  ok    %s\n' "$2"
  else
    printf '  FAIL  %s\n' "$2"
    fail=1
  fi
}

printf 'probing %s%s\n' "$origin" "$path"

case $html in
  *"<script"*) check no "no <script> in the response" ;;
  *) check ok "no <script> in the response" ;;
esac

case $html in
  *"<style"*) check no "no inline <style> in the response" ;;
  *) check ok "no inline <style> in the response" ;;
esac

case $html in
  *'rel="stylesheet"'*) check ok "stylesheet arrives as a <link>" ;;
  *) check no "stylesheet arrives as a <link>" ;;
esac

# noScripts removes the JavaScript, not the HTML: the page must still be server-rendered.
case $html in
  *"Hand finished work"*) check ok "markup is server-rendered" ;;
  *) check no "markup is server-rendered" ;;
esac

exit $fail
