#!/usr/bin/env node
/**
 * Waechter fuer den schlanken Profil-Katalog.
 *
 * scripts/merge-pipeline-published.mjs schreibt nach
 * dist/api/public/twins/index.html nur noch die Felder aus CATALOG_FIELDS.
 * Liest die Startseite spaeter ein Feld, das dort fehlt, faellt es still auf
 * undefined — isCompletePublicProfile() wird dann falsch und Profile
 * verschwinden kommentarlos aus der Liste. Genau diesen Fall faengt dieser
 * Check ab, indem er die tatsaechlich gelesenen Felder gegen die Allowlist
 * haelt — aus src/App.tsx automatisch, aus allen weiteren Verbrauchern ueber
 * EXTERNAL_CONSUMERS.
 *
 * Bewusst grob: lieber ein Fehlalarm, den jemand mit einem Eintrag aufloest,
 * als ein stiller Datenverlust in der Liste.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'src/App.tsx');
const MERGE = resolve(ROOT, 'scripts/merge-pipeline-published.mjs');

/** Funktionen, die auf EINTRAEGEN DER LISTE arbeiten (nicht auf Einzelprofilen). */
const LIST_CONSUMERS = ['publicProfileToStartTwin', 'isCompletePublicProfile'];

/** Aus Hilfsfunktionen, die von den Verbrauchern aufgerufen werden. */
const EXTRA_REQUIRED = ['imageUrl', 'birthDate', 'deathDate', 'birthYear', 'deathYear', 'birthLabel', 'deathLabel'];

/**
 * Verbraucher AUSSERHALB von src/App.tsx, die denselben Katalog lesen.
 *
 * Die erste Fassung dieses Checks kannte nur das Frontend — und genau deshalb
 * fiel nicht auf, dass mit 'id' das Baseline-Eval starb: run_model_eval
 * verwirft jeden Eintrag ohne id und fand danach keinen einzigen Twin
 * (Vorfall 16.08.2026). Ein Waechter, der nur die Verbraucher kennt, an die
 * sein Autor gerade dachte, ist kein Waechter.
 *
 * Neuer Verbraucher? Hier eintragen, welche Felder er aus der LISTE liest
 * (nicht aus dem Einzelprofil /api/public/twins/<slug>/).
 */
const EXTERNAL_CONSUMERS = {
  'backend/app/workers/run_model_eval.py': ['id', 'name'],
  'backend/app/workers/publish_profiles.py': ['slug'],
  'scripts/check-twin-duplicates.mjs': ['slug', 'name'],
  'scripts/curated-profile-database-audit.mjs': ['slug'],
};

function functionBody(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Funktion ${name} nicht in src/App.tsx gefunden — Check anpassen.`);

  // Erst das Ende der Parameterliste suchen. Ein Standardwert darin kann
  // geschweifte Klammern enthalten ("usage: ProfileUsage = { chatCount: 0 }");
  // zaehlte man ab hier Geschweifte, endete der "Rumpf" schon dort und die
  // Feldnutzungen im echten Rumpf blieben unsichtbar.
  let parens = 0;
  let bodyStart = -1;
  for (let i = start + marker.length - 1; i < source.length; i += 1) {
    if (source[i] === '(') parens += 1;
    else if (source[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        bodyStart = source.indexOf('{', i);
        break;
      }
    }
  }
  if (bodyStart === -1) throw new Error(`Parameterliste von ${name} nicht auswertbar.`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`Ende von ${name} nicht gefunden.`);
}

const app = readFileSync(APP, 'utf8');
const required = new Set(EXTRA_REQUIRED);
for (const name of LIST_CONSUMERS) {
  const body = functionBody(app, name);
  for (const match of body.matchAll(/\bprofile(?:\?)?\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    required.add(match[1]);
  }
}

const merge = readFileSync(MERGE, 'utf8');
const listMatch = merge.match(/const CATALOG_FIELDS = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error('check-catalog-fields: CATALOG_FIELDS nicht gefunden. Wurde der Generator umgebaut?');
  process.exit(1);
}
// Kommentare ZUERST entfernen. Sonst zaehlen Feldnamen mit, die nur im
// Fliesstext stehen — der Warnhinweis "'id' NICHT entfernen" liess den Check
// gruen bleiben, nachdem 'id' aus der Liste geloescht war (beim Negativtest
// am 16.08.2026 aufgefallen).
const fieldBlock = listMatch[1].replace(/\/\/[^\n]*/g, '');
const allowed = new Set([...fieldBlock.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]));

// Die externen Verbraucher kommen dazu — und zwar samt Quelle, damit die
// Fehlermeldung sagt, WER das Feld braucht.
const origin = new Map([...required].map((field) => [field, 'src/App.tsx']));
for (const [file, fields] of Object.entries(EXTERNAL_CONSUMERS)) {
  if (!existsSync(resolve(ROOT, file))) {
    console.error(`check-catalog-fields: Verbraucher ${file} existiert nicht mehr — Liste anpassen.`);
    process.exit(1);
  }
  for (const field of fields) {
    required.add(field);
    if (!origin.has(field)) origin.set(field, file);
  }
}

const missing = [...required].filter((field) => !allowed.has(field)).sort();
if (missing.length > 0) {
  console.error('check-catalog-fields: Es werden Felder gelesen, die der Katalog nicht mehr enthaelt:');
  for (const field of missing) console.error(`  - ${field}  (gebraucht von ${origin.get(field)})`);
  console.error('\nEntweder in CATALOG_FIELDS (scripts/merge-pipeline-published.mjs) aufnehmen');
  console.error('oder die Nutzung beim genannten Verbraucher entfernen. Sonst faellt das');
  console.error('Feld live still auf undefined — Profile verschwinden aus der Liste oder');
  console.error('ein Werkzeug findet gar keine Twins mehr (Vorfall 16.08.2026 mit id).');
  process.exit(1);
}

const unused = [...allowed].filter((field) => !required.has(field)).sort();
console.log(`check-catalog-fields: ${required.size} gelesene Felder aus ${Object.keys(EXTERNAL_CONSUMERS).length + 1} Verbrauchern, alle im Katalog. OK.`);
if (unused.length > 0) {
  // Kein Fehler: einige Felder (z. B. quality) werden ueber Hilfsfunktionen
  // oder optional gelesen und tauchen im Regex nicht auf.
  console.log(`  Zusaetzlich mitgeliefert: ${unused.join(', ')}`);
}
