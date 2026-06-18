#!/usr/bin/env sh
set -eu

WEB_BASE_URL="${WEB_BASE_URL:-https://smyst.com}"
API_BASE_URL="${API_BASE_URL:-$WEB_BASE_URL}"
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
  body="$(cat "$TMP_OUT")"
  case "$body" in
    *"$expected_body"*) ;;
    *)
      echo "FAILED $url expected body to contain: ${expected_body}" >&2
      head -c 1000 "$TMP_OUT" >&2 || true
      echo >&2
      exit 1
      ;;
  esac
}

check_header_not_contains() {
  url="$1"
  forbidden_header_text="$2"
  check_url "$url" "200"
  if grep -i "$forbidden_header_text" "$TMP_HEADERS" >/dev/null 2>&1; then
    echo "FAILED $url response headers must not contain: ${forbidden_header_text}" >&2
    cat "$TMP_HEADERS" >&2 || true
    exit 1
  fi
}

check_current_header_contains() {
  header_name="$1"
  expected_header_text="$2"
  if ! grep -i "^${header_name}: .*${expected_header_text}" "$TMP_HEADERS" >/dev/null 2>&1; then
    echo "FAILED expected response header ${header_name} to contain: ${expected_header_text}" >&2
    cat "$TMP_HEADERS" >&2 || true
    exit 1
  fi
}

check_status_content_type() {
  method="$1"
  url="$2"
  expected_code="$3"
  expected_type="$4"
  code="$(curl -sS -X "$method" -D "$TMP_HEADERS" -o "$TMP_OUT" -w "%{http_code}" "$url")"
  if [ "$code" != "$expected_code" ]; then
    echo "FAILED $method $url expected $expected_code got $code" >&2
    cat "$TMP_OUT" >&2 || true
    exit 1
  fi
  if ! grep -i "^content-type: .*${expected_type}" "$TMP_HEADERS" >/dev/null 2>&1; then
    echo "FAILED $method $url expected content-type containing ${expected_type}" >&2
    cat "$TMP_HEADERS" >&2 || true
    exit 1
  fi
  echo "OK $method $url $code"
}

need_curl

check_body_contains "$WEB_BASE_URL/" "id=\"root\""
if grep -i "^x-robots-tag: .*noindex" "$TMP_HEADERS" >/dev/null 2>&1; then
  echo "FAILED $WEB_BASE_URL/ public root must not send X-Robots-Tag noindex" >&2
  cat "$TMP_HEADERS" >&2 || true
  exit 1
fi
check_current_header_contains "content-security-policy" "frame-ancestors 'none'"
check_current_header_contains "permissions-policy" "payment=()"
check_current_header_contains "referrer-policy" "strict-origin-when-cross-origin"
check_current_header_contains "x-content-type-options" "nosniff"
check_current_header_contains "x-frame-options" "DENY"
check_current_header_contains "cross-origin-opener-policy" "same-origin"
check_current_header_contains "cross-origin-resource-policy" "same-site"
first_script="$(sed -n 's/.*src="\([^"]*\/assets\/[^"]*\.js\)".*/\1/p' "$TMP_OUT" | head -n 1)"
first_style="$(sed -n 's/.*href="\([^"]*\/assets\/[^"]*\.css\)".*/\1/p' "$TMP_OUT" | head -n 1)"
if [ -z "$first_script" ] || [ -z "$first_style" ]; then
  echo "FAILED $WEB_BASE_URL/ expected built JS and CSS asset links" >&2
  head -c 1000 "$TMP_OUT" >&2 || true
  echo >&2
  exit 1
fi
check_body_contains "$WEB_BASE_URL/__smyst_missing_route_probe_404" "id=\"root\""
check_current_header_contains "x-robots-tag" "noindex"
check_content_type "$WEB_BASE_URL$first_script" "application/javascript"
check_content_type "$WEB_BASE_URL$first_style" "text/css"
check_content_type "$WEB_BASE_URL/manifest.webmanifest" "application/manifest+json"
grep -F '"/icons/icon-192.png"' "$TMP_OUT" >/dev/null 2>&1 || {
  echo "FAILED $WEB_BASE_URL/manifest.webmanifest expected PWA PNG icons" >&2
  cat "$TMP_OUT" >&2 || true
  exit 1
}
check_content_type "$WEB_BASE_URL/sw.js" "application/javascript"
check_content_type "$WEB_BASE_URL/logo.svg" "image/svg+xml"
check_content_type "$WEB_BASE_URL/icons/icon-192.png" "image/png"
check_content_type "$WEB_BASE_URL/icons/icon-512.png" "image/png"
check_content_type "$WEB_BASE_URL/icons/maskable-512.png" "image/png"
check_content_type "$WEB_BASE_URL/apple-touch-icon.png" "image/png"
check_content_type "$WEB_BASE_URL/screenshots/smyst-mobile.png" "image/png"
check_content_type "$WEB_BASE_URL/screenshots/smyst-desktop.png" "image/png"
check_content_type "$WEB_BASE_URL/og-image.png" "image/png"
check_content_type "$WEB_BASE_URL/sitemap.xml" "application/xml"
check_content_type "$WEB_BASE_URL/robots.txt" "text/plain"
check_content_type "$WEB_BASE_URL/llms.txt" "text/plain"
check_content_type "$WEB_BASE_URL/ai.txt" "text/plain"
grep -F "Public and Private Policy" "$TMP_OUT" >/dev/null 2>&1 || {
  echo "FAILED $WEB_BASE_URL/ai.txt expected AI policy body" >&2
  cat "$TMP_OUT" >&2 || true
  exit 1
}
check_content_type "$WEB_BASE_URL/.well-known/security.txt" "text/plain"
grep -F "Policy: https://smyst.com/trust" "$TMP_OUT" >/dev/null 2>&1 || {
  echo "FAILED $WEB_BASE_URL/.well-known/security.txt expected security policy pointer" >&2
  cat "$TMP_OUT" >&2 || true
  exit 1
}
check_body_contains "$API_BASE_URL/api/health" "\"ok\":true"
check_status_content_type "GET" "$API_BASE_URL/auth/me" "200" "application/json"
check_status_content_type "GET" "$API_BASE_URL/api/public/twins" "200" "application/json"
check_status_content_type "GET" "$API_BASE_URL/api/twins" "401" "application/json"
check_status_content_type "GET" "$API_BASE_URL/storage/upload-url" "405" "application/json"
check_status_content_type "POST" "$API_BASE_URL/storage/upload-url" "403" "application/json"

echo "Cloudflare Pages live smoke tests passed"
