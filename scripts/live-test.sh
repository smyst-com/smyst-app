#!/usr/bin/env sh
set -eu

WEB_BASE_URL="${WEB_BASE_URL:-https://smyst.com}"
TMP_OUT="${TMPDIR:-/tmp}/smyst-live-test.out"
TMP_HEADERS="${TMPDIR:-/tmp}/smyst-live-test.headers"

need_curl() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required" >&2
    exit 2
  fi
}

check_url() {
  url="$1"
  expected_code="$2"
  code="$(curl -sS -D "$TMP_HEADERS" -o "$TMP_OUT" -w "%{http_code}" "$url")"
  if [ "$code" != "$expected_code" ]; then
    echo "FAILED $url expected $expected_code got $code" >&2
    cat "$TMP_OUT" >&2 || true
    exit 1
  fi
  echo "OK $url $code"
}

check_content_type() {
  url="$1"
  expected_type="$2"
  check_url "$url" "200"
  if ! grep -i "^content-type: .*${expected_type}" "$TMP_HEADERS" >/dev/null 2>&1; then
    echo "FAILED $url expected content-type containing ${expected_type}" >&2
    cat "$TMP_HEADERS" >&2 || true
    exit 1
  fi
}

check_body_contains() {
  url="$1"
  expected_body="$2"
  check_url "$url" "200"
  if ! grep -F "$expected_body" "$TMP_OUT" >/dev/null 2>&1; then
    echo "FAILED $url expected body to contain: ${expected_body}" >&2
    head -c 1000 "$TMP_OUT" >&2 || true
    echo >&2
    exit 1
  fi
}

need_curl

check_body_contains "$WEB_BASE_URL/" "id=\"root\""
check_content_type "$WEB_BASE_URL/manifest.webmanifest" "application/manifest+json"
check_content_type "$WEB_BASE_URL/sw.js" "application/javascript"
check_content_type "$WEB_BASE_URL/logo.svg" "image/svg+xml"
check_content_type "$WEB_BASE_URL/og-image.png" "image/png"
check_content_type "$WEB_BASE_URL/sitemap.xml" "application/xml"
check_content_type "$WEB_BASE_URL/robots.txt" "text/plain"
check_content_type "$WEB_BASE_URL/llms.txt" "text/plain"
check_body_contains "$WEB_BASE_URL/api/health" "\"ok\":true"

echo "Cloudflare Pages live smoke tests passed"
