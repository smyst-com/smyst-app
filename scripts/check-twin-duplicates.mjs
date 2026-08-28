/**
 * smyst.com — Dubletten-Wächter für den fertigen Twins-Index.
 *
 * Läuft im Pages-Build NACH scripts/merge-pipeline-published.mjs und prüft
 * dist/api/public/twins/index.html (kuratierte + Pipeline-Profile zusammen)
 * auf Profile, die nach Normalisierung denselben Namen oder Slug tragen.
 *
 * Normalisierung = Kleinschreibung, Diakritika entfernen (ü -> u) UND
 * deutsche Umschriften falten (ue -> u, oe -> o, ae -> a, ss -> s). Befund
 * 2026-07-29: 'Mustafa Kemal Atatuerk' (kuratiert) und 'Mustafa Kemal
 * Atatürk' (Pipeline) waren gleichzeitig live, weil der exakte
 * Slug-Vergleich 'atatuerk' vs. 'ataturk' nicht als Dublette erkannte.
 *
 * Findet der Check eine Dublette, bricht der Build mit Exit 1 ab — der
 * Deploy läuft erst wieder, wenn eines der Profile entfernt oder korrigiert
 * wurde. Fehlt der Index, schlägt der Check ebenfalls fehl (der Build hat
 * dann ein größeres Problem als Dubletten).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const INDEX_PATH = resolve(DIST, 'api', 'public', 'twins', 'index.html');

function normalize(value) {
  let text = String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const [src, dst] of [['ae', 'a'], ['oe', 'o'], ['ue', 'u'], ['ss', 's']]) {
    text = text.replaceAll(src, dst);
  }
  return text.replace(/[^a-z0-9]/g, '');
}

if (!existsSync(INDEX_PATH)) {
  console.error(`check-twin-duplicates: Twins-Index fehlt (${INDEX_PATH}).`);
  process.exit(1);
}

let twins;
try {
  const api = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  twins = Array.isArray(api.twins) ? api.twins : [];
} catch (error) {
  console.error(`check-twin-duplicates: Twins-Index unlesbar: ${error.message}`);
  process.exit(1);
}

const byName = new Map();
const bySlug = new Map();
for (const twin of twins) {
  if (!twin || !twin.slug) continue;
  const nameKey = normalize(twin.name || '');
  const slugKey = normalize(twin.slug);
  const entry = { slug: twin.slug, qid: twin.wikidataQid || null };
  if (nameKey) {
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(entry);
  }
  if (!bySlug.has(slugKey)) bySlug.set(slugKey, []);
  bySlug.get(slugKey).push(entry);
}

// Zwei Profile mit gleichem Namen sind erst eine Dublette, wenn die
// Identitaet kollidiert: gleiche Wikidata-QID ODER ein Eintrag ohne QID
// (kuratiert) ist mit allem namensgleichen kollidierbar (Originalbefund
// 2026-07-29: kuratiertes 'Atatuerk' + Pipeline-'Atatuerk' = dieselbe Person).
// Namensvetter mit verschiedenen QIDs sind legitime Eigenprofile
// (z. B. die beiden Heinrich Meiboms, die beiden Cornelius Gurlitts).
function nameCollision(entries) {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (!a.qid || !b.qid || a.qid === b.qid) return [a, b];
    }
  }
  return null;
}

let failed = false;
for (const [key, entries] of byName) {
  if (entries.length < 2) continue;
  const collision = nameCollision(entries);
  if (collision) {
    console.error(`check-twin-duplicates: Dublette (Name '${key}'): ${collision.map((e) => e.slug).join(', ')}`);
    failed = true;
  }
}
for (const [key, entries] of bySlug) {
  const unique = [...new Set(entries.map((e) => e.slug))];
  if (unique.length > 1) {
    console.error(`check-twin-duplicates: Dublette (Slug '${key}'): ${entries.map((e) => e.slug).join(', ')}`);
    failed = true;
  }
}

if (failed) {
  console.error('check-twin-duplicates: Deploy abgebrochen — Dubletten zuerst entfernen (unpublish) oder korrigieren.');
  process.exit(1);
}
console.log(`check-twin-duplicates: ${twins.length} Profile geprüft, keine Dubletten. OK.`);
