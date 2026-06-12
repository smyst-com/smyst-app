#!/usr/bin/env sh
set -eu

DIST_DIR="${DIST_DIR:-dist}"

fail() {
  echo "FAILED dist artifact: $*" >&2
  exit 1
}

require_file() {
  path="$DIST_DIR/$1"
  test -f "$path" || fail "missing $path"
}

require_contains() {
  path="$DIST_DIR/$1"
  expected="$2"
  require_file "$1"
  grep -F "$expected" "$path" >/dev/null 2>&1 || fail "$path missing: $expected"
}

require_not_contains() {
  path="$DIST_DIR/$1"
  forbidden="$2"
  require_file "$1"
  if grep -F "$forbidden" "$path" >/dev/null 2>&1; then
    fail "$path contains forbidden text: $forbidden"
  fi
}

require_contains "index.html" "id=\"root\""
require_contains "index.html" "manifest.webmanifest"
require_contains "index.html" "og-image.png"
require_contains "index.html" "application/ld+json"
require_not_contains "index.html" "fonts.googleapis.com"
require_not_contains "index.html" "fonts.gstatic.com"
require_not_contains "index.html" "Mobile App Only"

require_contains "manifest.webmanifest" "\"display\": \"standalone\""
require_contains "manifest.webmanifest" "\"start_url\": \"/\""
require_contains "manifest.webmanifest" "\"src\": \"/icons/icon-192.png\""
require_contains "manifest.webmanifest" "\"src\": \"/icons/icon-512.png\""
require_contains "manifest.webmanifest" "\"src\": \"/icons/maskable-512.png\""
require_contains "manifest.webmanifest" "\"screenshots\""
require_contains "sw.js" "APP_SHELL"
require_contains "sw.js" "/.well-known/security.txt"
require_contains "robots.txt" "Sitemap: https://smyst.com/sitemap.xml"
require_contains "sitemap.xml" "https://smyst.com/de/"
require_contains "llms.txt" "Free-only"
require_contains "ai.txt" "Public and Private Policy"
require_contains ".well-known/security.txt" "Policy: https://smyst.com/trust"

require_file "logo.svg"
require_file "og-image.png"
require_file "icons/icon-192.png"
require_file "icons/icon-512.png"
require_file "icons/maskable-512.png"
require_file "apple-touch-icon.png"
require_file "screenshots/smyst-mobile.png"
require_file "screenshots/smyst-desktop.png"
require_file ".well-known/security.txt"
require_file "_headers"

echo "dist artifact checks passed"
