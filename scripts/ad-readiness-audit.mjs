#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

const app = read('src/App.tsx');
const consent = read('src/components/CookieConsent.tsx');
const analytics = read('src/lib/analytics.ts');
const ads = read('src/lib/ads.ts');
const adSlot = read('src/components/AdSlot.tsx');
const headers = read('public/_headers');
const workflow = read('.github/workflows/github-pages.yml');
const index = read('index.html');

check('legal_privacy_route', app.includes("privacy: '/privacy'") && app.includes("if (path === '/privacy')"));
check('legal_imprint_route', app.includes("imprint: '/imprint'") && app.includes("if (path === '/imprint')"));
check('legal_terms_route', app.includes("terms: '/terms'") && app.includes("if (path === '/terms')"));
check('legal_routes_prerendered', workflow.includes('Prerender legal routes with real 200 status'));
check('german_legal_aliases', workflow.includes('impressum:imprint') && workflow.includes('datenschutz:privacy'));

check('consent_banner_exists', consent.includes('Nur Notwendige') && consent.includes('Alle akzeptieren'));
check('granular_marketing_consent', consent.includes('Marketing') && consent.includes('setMarketing'));
check('cookie_settings_reopen_event', consent.includes('smyst:open-cookie-settings'));
check('consent_default_denied', analytics.includes("ad_storage: 'denied'") && analytics.includes("analytics_storage: 'denied'"));
check('marketing_consent_gate', analytics.includes('hasMarketingConsent') && ads.includes('hasMarketingConsent'));
check('consent_change_event', analytics.includes('smyst:consent-changed'));

check('adsense_env_disabled_by_default', ads.includes("VITE_ADSENSE_ENABLED") && ads.includes("=== 'true'"));
check('adsense_client_pattern', ads.includes('ca-pub-') && ads.includes('ADSENSE_CLIENT_PATTERN'));
check('adsense_noop_without_consent', ads.includes('if (!canRequestAds()) return'));
check('adslot_profile_footer', app.includes('<AdSlot placement="profile-footer"') && adSlot.includes("data-ad-placement"));
check('adslot_stable_reserved_space', adSlot.includes('min-h-[96px]'));
check('adslot_optional_failure_safe', adSlot.includes('never break the profile page'));

check('no_adsense_script_in_base_html', !index.includes('pagead2.googlesyndication.com'));
check('no_google_ads_csp_until_approval', !headers.includes('pagead2.googlesyndication.com'));
check('security_headers_present', headers.includes('Content-Security-Policy') && headers.includes('frame-ancestors') && headers.includes('X-Content-Type-Options'));

const failed = checks.filter((item) => !item.ok);
const result = {
  ok: failed.length === 0,
  checks,
  failed,
  note: 'AdSense is code-prepared but externally disabled until VITE_ADSENSE_ENABLED=true, a valid VITE_ADSENSE_CLIENT, a slot id, marketing consent, and explicit CSP approval exist.',
};

console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
