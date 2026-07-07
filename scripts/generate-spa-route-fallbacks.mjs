/**
 * smyst.com SPA route fallbacks for static hosting.
 *
 * GitHub Pages returns HTTP 404 for deep links unless a real file exists.
 * This script writes index.html copies for app-shell routes that must load
 * directly with HTTP 200 while keeping the public landing page unchanged.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(ROOT, 'dist');
const HOST = (process.env.VITE_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const templatePath = resolve(DIST, 'index.html');

const appShellRoutes = [
  'admin',
  'builder',
  'chat',
  'chats',
  'dashboard',
  'memory-upload',
  'onboarding',
  'profile',
  'settings',
  'start',
  'twin-builder',
  'twin-chat',
  'twins',
  'upload',
];

const publicShellRoutes = ['privacy', 'imprint', 'terms', 'trust'];

const redirectAliases = [
  ['impressum', 'imprint'],
  ['datenschutz', 'privacy'],
  ['agb', 'terms'],
];

function fail(message) {
  console.error(`generate-spa-route-fallbacks: ${message}`);
  process.exit(1);
}

if (!existsSync(templatePath)) fail('dist/index.html fehlt. Erst den Vite-Build ausfuehren.');

const template = readFileSync(templatePath, 'utf8');

function htmlForRoute(route, { noindex }) {
  const canonical = `${HOST}/${route}/`;
  let html = template
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`);

  if (noindex) {
    html = html.replace(
      /<meta name="robots" content="[^"]*" \/>/,
      '<meta name="robots" content="noindex,follow" />',
    );
  }

  return html;
}

function writeRoute(route, options) {
  const dir = resolve(DIST, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), htmlForRoute(route, options), 'utf8');
}

function redirectHtml(source, target) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/${target}/"><link rel="canonical" href="${HOST}/${target}/"><meta name="robots" content="noindex"><title>smyst.com</title><script>location.replace("/${target}/")</script></head><body></body></html>`;
}

for (const route of appShellRoutes) writeRoute(route, { noindex: true });
for (const route of publicShellRoutes) writeRoute(route, { noindex: false });
for (const [source, target] of redirectAliases) {
  const dir = resolve(DIST, source);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), redirectHtml(source, target), 'utf8');
}

copyFileSync(templatePath, resolve(DIST, '404.html'));

console.log(
  `generate-spa-route-fallbacks: ${appShellRoutes.length + publicShellRoutes.length} direkte Routen, ${redirectAliases.length} Aliase und 404.html erzeugt.`,
);
