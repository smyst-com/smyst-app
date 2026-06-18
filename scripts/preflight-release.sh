#!/usr/bin/env sh
set -eu

TARGET="${RELEASE_TARGET:-production}"
VERSION="${RELEASE_VERSION:-}"
APPROVAL="${RELEASE_APPROVAL:-}"
FREEZE_CONFIRMED="${RELEASE_FREEZE_CONFIRMED:-no}"
ROLLBACK_CONFIRMED="${ROLLBACK_PLAN_CONFIRMED:-no}"
BACKUP_RESTORE_CONFIRMED="${BACKUP_RESTORE_CONFIRMED:-no}"
LIVE_URL="${WEB_BASE_URL:-}"

if [ "${TARGET}" = "production" ]; then
  if [ "${APPROVAL}" != "Ja OK" ]; then
    echo "production release blocked: RELEASE_APPROVAL must be exactly \"Ja OK\"" >&2
    exit 10
  fi

  if [ -z "${VERSION}" ]; then
    echo "production release blocked: RELEASE_VERSION is required" >&2
    exit 10
  fi

  if [ -f VERSION ]; then
    REPO_VERSION="$(tr -d '[:space:]' < VERSION)"
    if [ "${VERSION}" != "${REPO_VERSION}" ]; then
      echo "production release blocked: RELEASE_VERSION must match VERSION (${REPO_VERSION})" >&2
      exit 10
    fi
  fi

  if [ "${FREEZE_CONFIRMED}" != "yes" ] && [ "${FREEZE_CONFIRMED}" != "true" ]; then
    echo "production release blocked: RELEASE_FREEZE_CONFIRMED=yes is required" >&2
    exit 10
  fi

  if [ "${ROLLBACK_CONFIRMED}" != "yes" ] && [ "${ROLLBACK_CONFIRMED}" != "true" ]; then
    echo "production release blocked: ROLLBACK_PLAN_CONFIRMED=yes is required" >&2
    exit 10
  fi

  if [ "${BACKUP_RESTORE_CONFIRMED}" != "yes" ] && [ "${BACKUP_RESTORE_CONFIRMED}" != "true" ]; then
    echo "production release blocked: BACKUP_RESTORE_CONFIRMED=yes is required" >&2
    exit 10
  fi

  if [ -z "${LIVE_URL}" ]; then
    echo "production release blocked: WEB_BASE_URL must point to the approved preview or production URL" >&2
    exit 10
  fi
fi

if command -v git >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)"
  echo "release target: ${TARGET}"
  echo "release version: ${VERSION:-unversioned-non-production}"
  echo "release branch: ${CURRENT_BRANCH:-unknown}"
  echo "release commit: ${CURRENT_COMMIT:-unknown}"
fi

sh scripts/test-all.sh

if [ "${TARGET}" = "production" ]; then
  WEB_BASE_URL="${LIVE_URL}" sh scripts/live-test.sh
fi

echo "release preflight passed"
