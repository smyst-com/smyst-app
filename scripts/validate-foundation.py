#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

ACTIVE_PRODUCTION_PATHS = [
    ".github/workflows",
    "config",
    "src",
    "workers",
]

REQUIRED_FILES = [
    "docs/FREE_ONLY_INFRASTRUCTURE.md",
    "docs/FREE_ONLY_DATA_MAP.md",
    "docs/02-database-architecture.md",
    "docs/LEGACY_LOCAL_REFERENCES.md",
    "docs/FREE_ONLY_SEO_AEO_GEO.md",
    "docs/FREE_ONLY_SECURITY_PRIVACY.md",
    "docs/FREE_ONLY_PERFORMANCE_MOBILE.md",
    "docs/FREE_ONLY_NATIVE_APPS.md",
    "docs/runbooks/release-governance.md",
    "docs/runbooks/backup-recovery.md",
    "config/backup-recovery-manifest.json",
    "config/change-protection-manifest.json",
    "config/final-readiness-scorecard.json",
    "scripts/check-backup-recovery.py",
    "scripts/check-change-protection.py",
    "scripts/check-final-readiness.py",
    "wrangler.toml",
    "workers/_shared.ts",
    "workers/api.ts",
    "workers/auth-github.ts",
    "workers/storage-idrive.ts",
    "workers/translator.ts",
    "src/components/GitHubSignInButton.tsx",
    "src/lib/analytics.ts",
    "public/robots.txt",
    "public/sitemap.xml",
    "public/llms.txt",
    "public/ai.txt",
    "public/.well-known/security.txt",
    "public/_headers",
    "public/manifest.webmanifest",
    "public/sw.js",
    "public/offline.html",
    "public/apple-touch-icon.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/maskable-512.png",
    "public/screenshots/smyst-mobile.png",
    "public/screenshots/smyst-desktop.png",
    "public/de/index.html",
    "public/en/index.html",
    "public/tr/index.html",
    "public/fr/index.html",
    "public/es/index.html",
    "public/pt/index.html",
    "public/ar/index.html",
    "public/zh/index.html",
    "public/ja/index.html",
    "public/ko/index.html",
    "public/locales/de.json",
    "public/locales/en.json",
    "public/locales/tr.json",
    "public/locales/fr.json",
    "public/locales/es.json",
    "public/locales/pt.json",
    "public/locales/ar.json",
    "public/locales/zh.json",
    "public/locales/ja.json",
    "public/locales/ko.json",
    "capacitor.config.ts",
    "android/app/src/main/AndroidManifest.xml",
    "android/app/src/main/res/values/strings.xml",
    "android/app/src/main/res/xml/network_security_config.xml",
    "android/app/src/main/res/xml/data_extraction_rules.xml",
    "ios/App/App/Info.plist",
    "database/init/006_run_integrity_migrations.sql",
    "database/migrations/0005_integrity_performance_hardening.sql",
]

REQUIRED_TEXT = {
    "wrangler.toml": [
        "binding = \"METADATA\"",
        "main = \"workers/api.ts\"",
        "SMYST_OWNER_GITHUB_IDS",
        "SMYST_ADMIN_GITHUB_IDS",
        "IDRIVE_E2_MAX_FILE_BYTES",
        "IDRIVE_E2_USER_MONTHLY_BYTES",
        "IDRIVE_E2_GLOBAL_BYTES",
        "IDRIVE_E2_USER_STORAGE_BYTES",
        "IDRIVE_E2_GLOBAL_STORAGE_BYTES",
        "IDRIVE_E2_MAX_TWIN_DATA_BYTES",
    ],
    "workers/storage-idrive.ts": [
        "handleUploadComplete",
        "handleListUploads",
        "handleDeleteAccountStorage",
        "requireDeleteConfirmation",
        "delete-account-storage",
        "delete-file",
        "verifyObjectHead",
        "profile_image",
        "twin_data",
        "storage:user:",
        "meta:upload-by-key",
        "case 'twin_data'",
        "profile/images",
        "headers: { 'content-type': contentType }",
        "findUploadRecordByKey",
        "response-content-disposition",
        "supportsChunkUpload",
        "supportsResume",
    ],
    "workers/api.ts": ["handleAccountExport", "handleAccountDelete", "handleSupportReport", "meta:support-report", "requireDeleteConfirmation", "delete-account", "handleStartChat", "handleChatMessage", "handleCreateTwin", "handlePublicTwin", "privateSafeImageUrl", "public:twin:", "ruleBasedTwinReply", "free-only-static", "meta:chat:", "meta:twin:"],
    "workers/auth-github.ts": ["ROLE_PERMISSIONS", "auth:user:", "auth:sessions:", "handleLogoutAll", "storage:write", "twin:write", "admin:write", "tokenType", "SameSite=Strict", "validateAuthConfig", "SESSION_ID_PATTERN"],
    "workers/_shared.ts": ["securityHeaders", "rateLimit", "Retry-After", "method_not_allowed", "X-Smyst-Request-Id", "Server-Timing", "corsPreflight", "strictCorsPreflight", "requireSameOrigin", "csrf_header_required", "csrf_fetch_site_rejected", "DELETE_CONFIRM_HEADER", "requireDeleteConfirmation", "readJsonBody", "safeHandler"],
    "workers/translate.ts": ["STATIC_PASSTHROUGH_PATHS", "/.well-known/security.txt", "/ai.txt", "isStaticPassthroughPath", "headers.delete('X-Robots-Tag')", "return fetch(env.ORIGIN_URL + url.pathname + url.search)"],
    ".github/workflows/deploy.yml": ["workflow_dispatch", "release_approval", "release_freeze_confirmed", "rollback_plan_confirmed", "backup_restore_confirmed", "WEB_BASE_URL: https://smyst.com", "sh scripts/live-test.sh"],
    "scripts/live-test.sh": ["public root must not send X-Robots-Tag noindex", "expected PWA PNG icons", "Public and Private Policy", "Policy: https://smyst.com/trust", "GET\" \"$WEB_BASE_URL/storage/upload-url\" \"405\""],
    "scripts/check-dist-artifact.sh": ["icon-192.png", "screenshots", "Public and Private Policy", "Policy: https://smyst.com/trust"],
    "docs/FREE_ONLY_SECURITY_PRIVACY.md": ["CSRF", "CORS", "Session-Cookies", "SameSite=Strict", "Sec-Fetch-Site", "Upload-Completion", "Prompt-Injection", "SQL-Injection", "JWTs", "noindex,nofollow", "Phase 1 ist ein Free-Only-MVP"],
    "docs/FREE_ONLY_PERFORMANCE_MOBILE.md": ["Service Worker", "private", "lazy", "IDrive e2", "Phase-1-MVP", "meta:upload-by-key", "KV eignet sich fuer kleine Metadaten"],
    "docs/FREE_ONLY_NATIVE_APPS.md": ["com.smyst.app", "smyst://app", "IDrive e2", "Cleartext-Traffic", "Free-Only-MVP"],
    "docs/FREE_ONLY_DATA_MAP.md": ["Cloudflare KV Free", "IDrive e2", "auth:user", "admin:write", "twin:write", "meta:upload", "meta:upload-by-key", "meta:twin", "public:twin", "noindex,nofollow", "quota:global", "profile/images", "twins/{twinId}/data", "supportsChunkUpload: false", "supportsResume: false"],
    "docs/02-database-architecture.md": ["meta:upload:{userSub}:{uploadId}", "meta:twin:{userSub}:{twinId}", "storage:user:{userSub}:active", "0005_integrity_performance_hardening.sql", "Production nutzt in Phase 1 keine separat betriebene Datenbank"],
    "database/migrations/0005_integrity_performance_hardening.sql": ["chk_twins_visibility", "idx_sessions_user_expires", "smyst_touch_updated_at", "active_twins", "indexable_public_pages"],
    "docs/LEGACY_LOCAL_REFERENCES.md": ["non-production reference", "backend/", "database/", "docker/", "frontend/", "vector/", "must not be required by production", "Forbidden as production dependencies"],
    "frontend/README.md": ["Legacy local-development reference only", "root Vite/React app is the active production target", "not a production target"],
    "backend/app/security/audit.py": ["Legacy local-development reference only", "Cloudflare Workers", "Cloudflare KV", "IDrive e2"],
    "backend/app/ai/vector_search.py": ["Legacy local-development reference only", "pgvector is not part of the Free-only production architecture"],
    "index.html": ["rel=\"canonical\"", "hreflang=\"de\"", "og:title", "twitter:card", "application/ld+json", "FAQPage", "ai.txt", "llms.txt", "manifest.webmanifest", "apple-touch-icon", "icon-512.png"],
    "public/robots.txt": ["Sitemap: https://smyst.com/sitemap.xml", "AI-Policy: https://smyst.com/ai.txt", "GPTBot", "ClaudeBot", "Disallow: /private/", "Disallow: /api/"],
    "public/sitemap.xml": ["https://smyst.com/de/", "https://smyst.com/en/", "https://smyst.com/tr/", "https://smyst.com/ko/", "hreflang=\"x-default\"", "sitemap-image", "og-image.png"],
    "public/llms.txt": ["Free-only", "Cloudflare KV", "IDrive e2", "AI policy", "Turkish landing page", "Korean landing page", "Public profile pattern"],
    "public/ai.txt": ["smyst.com AI visibility file", "ChatGPT", "Gemini", "Claude", "IDrivee2.com", "Do not index or summarize private routes"],
    "public/_headers": ["/private/*", "X-Robots-Tag: noindex, nofollow", "/api/public/twins/*", "/assets/*", "/icons/*", "/screenshots/*", "/locales/*", "/.well-known/security.txt", "/sw.js"],
    "public/.well-known/security.txt": ["Contact: mailto:i@smyst.com", "Policy: https://smyst.com/trust", "Canonical: https://smyst.com/.well-known/security.txt"],
    "public/manifest.webmanifest": ["\"display\": \"standalone\"", "\"start_url\": \"/\"", "\"scope\": \"/\"", "\"orientation\": \"portrait-primary\"", "\"screenshots\"", "\"purpose\": \"maskable\""],
    "public/sw.js": ["smyst-v2", "APP_SHELL", "PRIVATE_PREFIXES", "staleWhileRevalidate", "networkFirst", "icon-512.png", "smyst-mobile.png"],
    "docs/FREE_ONLY_SEO_AEO_GEO.md": ["robots.txt", "sitemap.xml", "llms.txt", "ai.txt", "public/locales", "ProfilePage", "FAQPage", "ChatGPT", "Gemini", "Claude", "noindex,nofollow", "externe Webmaster-Portale"],
    "docs/runbooks/release-governance.md": ["Production Go/No-Go", "Public root does not send", "static file content, not SPA HTML", "Backup and restore dry-run evidence"],
    "docs/runbooks/backup-recovery.md": ["Cloudflare KV Export And Restore", "Restore dry-run", "bucket CORS", "server-side encryption", "production release is blocked"],
    "config/backup-recovery-manifest.json": ["cloudflare-kv-metadata", "idrive-e2-user-objects", "legacy-local-sql-reference", "KV restore dry-run result", "production data stored in legacy SQL or server filesystem"],
    "config/change-protection-manifest.json": ["productionDeployRequiresManualApproval", "destructiveRequestsRequireDeleteConfirmHeader", "DELETE /api/account", "rollback_plan_confirmed required", "Cloudflare Worker version rollback path"],
    "config/final-readiness-scorecard.json": ["security", "speed", "stability", "scale", "seo", "ai", "infrastructure", "usability", "maintainability", "future-readiness", "\"targetScore\": 10"],
    "scripts/check-backup-recovery.py": ["paid services must be disabled", "production database must be cloudflare-kv", "legacy SQL target must be blocked for production", "backup recovery manifest validation passed"],
    "scripts/check-change-protection.py": ["policy must enable", "missing destructive route", "change protection manifest validation passed"],
    "scripts/check-final-readiness.py": ["required_areas", "score below 10 must include blockers", "final readiness scorecard validation passed"],
    "src/lib/i18n.ts": ["'de'", "'en'", "'tr'", "'fr'", "'es'", "'pt'", "'ar'", "'zh'", "'ja'", "'ko'"],
    "src/lib/staticTranslations.ts": ["useStaticTranslations", "/locales/${lang}.json", "DEFAULT_TRANSLATIONS"],
    "capacitor.config.ts": ["appId: 'com.smyst.app'", "appName: 'smyst.com'", "webDir: 'dist'"],
    "android/app/src/main/AndroidManifest.xml": ["android:allowBackup=\"false\"", "android:usesCleartextTraffic=\"false\"", "android.intent.action.VIEW", "READ_MEDIA_IMAGES", "android:scheme=\"@string/custom_url_scheme\""],
    "android/app/src/main/res/values/strings.xml": ["<string name=\"custom_url_scheme\">smyst</string>"],
    "android/app/src/main/res/xml/network_security_config.xml": ["cleartextTrafficPermitted=\"false\"", "smyst.com", "idrivee2.com"],
    "android/app/src/main/res/xml/data_extraction_rules.xml": ["<cloud-backup", "<device-transfer"],
    "ios/App/App/Info.plist": ["CFBundleDisplayName", "smyst.com", "CFBundleURLSchemes", "NSCameraUsageDescription", "NSPhotoLibraryUsageDescription"],
}

FORBIDDEN_ACTIVE_PATTERNS = [
    "auth-google",
    "GoogleSignInButton",
    "signInWithGoogle",
    "/auth/google",
    "GOOGLE_OAUTH",
    "DEEPL_API_KEY",
    "GOOGLE_TRANSLATE_API_KEY",
    "googletagmanager",
    "VITE_GA",
    "VITE_GSC",
    "GA4",
    "Google Analytics",
    "Google Search Console",
    "DeepL",
    "Google Translate",
    "RackNerd",
    "VPS_HOST",
    "FastAPI",
    "DATABASE_URL",
    "REDIS_URL",
    "pgvector",
    "Caddy",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
]

FORBIDDEN_POSITIVE_PRODUCTION_PHRASES = [
    "Production writes go to PostgreSQL",
    "production implementation will query pgvector",
    "This folder is the target Next.js frontend",
    "FastAPI foundation backend",
]

NEGATIVE_POLICY_CONTEXT = [
    "not allowed",
    "not part of production",
    "not a production",
    "not a deployment",
    "not required by production",
    "not production",
    "keine",
    "kein",
    "keine production",
    "kein production",
    "nicht erlaubt",
    "deaktiviert",
    "disabled",
    "blocked",
    "forbidden",
    "verboten",
    "legacy",
    "local-development",
    "non-production",
]

POLICY_SCAN_PATHS = [
    ".github/workflows",
    "config",
    "src",
    "workers",
    "public",
    "scripts",
]

POLICY_SCAN_FILES = [
    "README.md",
    "SETUP.md",
    "package.json",
    "wrangler.toml",
    "capacitor.config.ts",
    "index.html",
    "frontend/README.md",
    "backend/README.md",
    "docker/README.md",
    "docs/ARCHITECTURE.md",
    "docs/ROADMAP.md",
    "docs/FREE_ONLY_INFRASTRUCTURE.md",
    "docs/FREE_ONLY_DATA_MAP.md",
    "docs/LEGACY_LOCAL_REFERENCES.md",
    "docs/07-deployment-architecture.md",
    "docs/11-complete-inventory-roadmap.md",
    "docs/12-foundation-decisions.md",
    "docs/14-frontend-implementation.md",
    "docs/INFRA_SETUP.md",
    "android/app/src/main/AndroidManifest.xml",
    "ios/App/App/Info.plist",
    "app-mockup.html",
]


def iter_text_files(base: Path):
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {".git", "node_modules", "dist"} for part in path.parts):
            continue
        try:
            path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        yield path


def line_has_negative_context(line: str) -> bool:
    lower = line.lower()
    return any(marker in lower for marker in NEGATIVE_POLICY_CONTEXT)


def scan_for_policy_violations(path: Path, text: str) -> list[str]:
    violations: list[str] = []
    relative = path.relative_to(ROOT)
    if relative.as_posix() in {"scripts/validate-foundation.py", "scripts/check-dist-artifact.sh"}:
        return violations

    for phrase in FORBIDDEN_POSITIVE_PRODUCTION_PHRASES:
        if phrase in text:
            violations.append(f"{relative} contains forbidden positive production phrase: {phrase}")

    if path.suffix.lower() in {".md", ".txt"}:
        return violations

    for line_no, line in enumerate(text.splitlines(), start=1):
        for pattern in FORBIDDEN_ACTIVE_PATTERNS:
            if pattern in line and not line_has_negative_context(line):
                violations.append(
                    f"{relative}:{line_no} contains forbidden production pattern outside a negative/legacy context: {pattern}"
                )

    return violations


def main() -> None:
    missing = [item for item in REQUIRED_FILES if not (ROOT / item).is_file()]
    if missing:
        raise SystemExit("missing required free-only files:\n" + "\n".join(missing))

    missing_text: list[str] = []
    for path, needles in REQUIRED_TEXT.items():
        text = (ROOT / path).read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                missing_text.append(f"{path} missing required text: {needle}")
    if missing_text:
        raise SystemExit("missing required free-only architecture text:\n" + "\n".join(missing_text))

    violations: list[str] = []
    for production_path in ACTIVE_PRODUCTION_PATHS:
        base = ROOT / production_path
        if not base.exists():
            continue
        for path in iter_text_files(base):
            text = path.read_text(encoding="utf-8")
            for pattern in FORBIDDEN_ACTIVE_PATTERNS:
                if pattern in text:
                    violations.append(f"{path.relative_to(ROOT)} contains forbidden production pattern: {pattern}")

    for production_path in POLICY_SCAN_PATHS:
        base = ROOT / production_path
        if not base.exists():
            continue
        for path in iter_text_files(base):
            violations.extend(scan_for_policy_violations(path, path.read_text(encoding="utf-8")))

    for rel_path in POLICY_SCAN_FILES:
        path = ROOT / rel_path
        if path.is_file():
            violations.extend(scan_for_policy_violations(path, path.read_text(encoding="utf-8")))

    if violations:
        raise SystemExit("free-only production policy violations:\n" + "\n".join(violations))

    print("free-only production validation passed")


if __name__ == "__main__":
    main()
