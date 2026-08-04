/**
 * smyst.com — Deploy-Gate gegen schrumpfenden Profilbestand.
 *
 * Der Pages-Build setzt den oeffentlichen Katalog aus zwei Quellen zusammen:
 * kuratierte Profile aus dem Repo und publizierte Pipeline-Profile aus dem
 * Publish-Index (IDrive e2). Faellt die zweite Quelle teilweise aus — Index
 * halb geschrieben, Merge-Fehler, abgebrochener Upload —, entsteht ein
 * technisch fehlerfreier Build mit deutlich weniger Profilen. Genau so lief
 * der Vorfall vom 30.07.2026 (Deploys #360/#361): die Site ging ohne die
 * bereits publizierten Pipeline-Profile live, ohne dass irgendetwas rot wurde.
 *
 * Der bestehende Schutz deckt nur den Totalausfall ab (Index nicht lesbar ->
 * Abbruch). Dieses Gate deckt den Teilausfall ab: es vergleicht den frisch
 * gebauten Katalog mit dem, was gerade live ausgeliefert wird, und bricht den
 * Deploy ab, wenn zu viele Profile fehlen.
 *
 * BEWUSST NICHT blockierend, wenn die Live-Seite nicht erreichbar ist: dann
 * gibt es keinen Vergleichswert, und ein Netzproblem darf keinen Deploy
 * verhindern. Ebenso wenig blockiert ein WACHSENDER Katalog.
 *
 * Legitime Massen-Unpublishes (Ethik-Watchlist) laufen mit
 * ALLOW_PROFILE_DROP=1 durch — bewusst eine Umgebungsvariable, damit der
 * Schritt im Workflow sichtbar bleibt und im Log dokumentiert ist.
 *
 * Start:
 *   node scripts/check-profile-count-guard.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG = resolve(ROOT, 'dist/api/public/twins/index.html');
const LIVE_URL = `${(process.env.VITE_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '')}/api/public/twins/`;

// Ab wieviel Schwund abgebrochen wird. 5 % lassen normale Schwankungen durch
// (einzelne Unpublishes, Slug-Kollisionen mit kuratierten Profilen), fangen
// aber jeden Teilausfall des Publish-Index zuverlaessig ab — dort fehlen
// hunderte Profile auf einmal.
const MAX_DROP = 0.05;
const MIN_LIVE_FOR_CHECK = 50; // darunter ist der Vergleich statistisch wertlos

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

if (!existsSync(CATALOG)) {
  fail(`Katalog fehlt: ${CATALOG} — der Pages-Build hat keine API erzeugt.`);
}

let built;
try {
  built = JSON.parse(readFileSync(CATALOG, 'utf8')).twins;
} catch (error) {
  fail(`Katalog unlesbar (${CATALOG}): ${error.message}`);
}
if (!Array.isArray(built)) fail('Katalog enthaelt kein twins-Array.');

const builtCount = built.length;
console.log(`Gebauter Katalog: ${builtCount} Profile.`);

let liveCount = null;
try {
  const response = await fetch(LIVE_URL, { signal: AbortSignal.timeout(30_000) });
  if (response.ok) {
    const payload = await response.json();
    if (Array.isArray(payload.twins)) liveCount = payload.twins.length;
  } else {
    console.log(`Live-Katalog nicht abrufbar (HTTP ${response.status}) — Gate uebersprungen.`);
  }
} catch (error) {
  console.log(`Live-Katalog nicht abrufbar (${error.message}) — Gate uebersprungen.`);
}

if (liveCount === null) process.exit(0);
console.log(`Live ausgeliefert: ${liveCount} Profile.`);

if (liveCount < MIN_LIVE_FOR_CHECK) {
  console.log(`Live-Bestand unter ${MIN_LIVE_FOR_CHECK} — Gate uebersprungen (Erstaufbau).`);
  process.exit(0);
}

const missing = liveCount - builtCount;
if (missing <= 0) {
  console.log(`Kein Schwund (${missing === 0 ? 'unveraendert' : `+${-missing}`}). Gate bestanden.`);
  process.exit(0);
}

const dropRatio = missing / liveCount;
const percent = (dropRatio * 100).toFixed(1);
if (dropRatio <= MAX_DROP) {
  console.log(`Schwund ${missing} Profile (${percent} %) liegt unter der Grenze von ${MAX_DROP * 100} %. Gate bestanden.`);
  process.exit(0);
}

if (process.env.ALLOW_PROFILE_DROP === '1') {
  console.log(`::warning::Schwund ${missing} Profile (${percent} %) — per ALLOW_PROFILE_DROP=1 bewusst freigegeben.`);
  process.exit(0);
}

fail(
  `Deploy abgebrochen: der gebaute Katalog hat ${builtCount} Profile, live sind es ${liveCount} — ` +
  `${missing} Profile (${percent} %) wuerden verschwinden. Das deutet auf einen unvollstaendigen ` +
  `Publish-Index oder einen fehlgeschlagenen Merge hin, nicht auf eine gewollte Aenderung. ` +
  `Ursache pruefen; ist der Schwund gewollt (z. B. Massen-Unpublish), den Lauf mit ` +
  `ALLOW_PROFILE_DROP=1 wiederholen.`
);
