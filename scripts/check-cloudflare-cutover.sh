#!/usr/bin/env sh
set -eu

DOMAIN="${SMYST_DOMAIN:-smyst.com}"
WEB_BASE_URL="${WEB_BASE_URL:-https://smyst.com}"
API_BASE_URL="${API_BASE_URL:-https://api.smyst.com}"
API_SALAD_TARGET="${API_SALAD_TARGET:-cherry-asparagus-a32jleuk8dgn22zu.salad.cloud}"
TMP_OUT="${TMPDIR:-/tmp}/smyst-cutover.out"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 2
  fi
}

fail() {
  echo "FAILED $1" >&2
  exit 1
}

need curl
need dig

ns_records="$(dig +short NS "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
echo "$DOMAIN NS:"
echo "$ns_records"
printf '%s\n' "$ns_records" | grep -F "cloudflare.com" >/dev/null 2>&1 \
  && fail "$DOMAIN still uses Cloudflare nameservers"

api_cname="$(dig +short CNAME "api.$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"
echo "api.$DOMAIN CNAME: ${api_cname:-'(none)'}"
test "$api_cname" = "$API_SALAD_TARGET" \
  || fail "api.$DOMAIN must CNAME to $API_SALAD_TARGET"

web_code="$(curl -sS -o "$TMP_OUT" -w "%{http_code}" "$WEB_BASE_URL/")"
test "$web_code" = "200" || fail "$WEB_BASE_URL/ expected 200 got $web_code"
grep -F 'id="root"' "$TMP_OUT" >/dev/null 2>&1 \
  || fail "$WEB_BASE_URL/ did not return the PWA shell"
echo "OK $WEB_BASE_URL/ $web_code"

api_code="$(curl -sS -o "$TMP_OUT" -w "%{http_code}" "$API_BASE_URL/api/v1/health/live")"
test "$api_code" = "200" || fail "$API_BASE_URL/api/v1/health/live expected 200 got $api_code"
grep -F '"status":"live"' "$TMP_OUT" >/dev/null 2>&1 \
  || fail "$API_BASE_URL/api/v1/health/live did not return live status"
echo "OK $API_BASE_URL/api/v1/health/live $api_code"

ready_code="$(curl -sS -o "$TMP_OUT" -w "%{http_code}" "$API_BASE_URL/api/v1/health/ready")"
test "$ready_code" = "200" || fail "$API_BASE_URL/api/v1/health/ready expected 200 got $ready_code"
grep -F '"status":"ready"' "$TMP_OUT" >/dev/null 2>&1 \
  || fail "$API_BASE_URL/api/v1/health/ready did not return ready status"
echo "OK $API_BASE_URL/api/v1/health/ready $ready_code"

echo "Cutover check passed. Cloudflare can be removed only after this stays green."
