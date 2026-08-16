#!/usr/bin/env node
/**
 * Waechter fuer den schlanken Profil-Katalog.
 *
 * scripts/merge-pipeline-published.mjs schreibt nach
 * dist/api/public/twins/index.html nur noch die Felder aus CATALOG_FIELDS.
 * Liest die Startseite spaeter ein Feld, das dort fehlt, faellt es still auf
 * undefined — isCompletePublicProfile() wird dann falsch und Profile
 * verschwinden kommentarlos aus der Liste. Genau diesen Fall faengt dieser
 * Check ab, indem er die tatsaechlich gelesenen Felder aus src/App.tsx gegen
 * die Allowlist haelt.
 *
 * Bewusst grob: lieber ein Fehlalarm, den jemand mit einem Eintrag aufloest,
 * als ein stiller Datenverlust in der Liste.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'src/App.tsx');
const MERGE = resolve(ROOT, 'scripts/merge-pipeline-published.mjs');

/** Funktionen, die auf EINTRAEGEN DER LISTE arbeiten (nicht auf Einzelprofilen). */
const LIST_CONSUMERS = ['publicProfileToStartTwin', 'isCompletePublicProfile'];

/** Aus Hilfsfunktionen, die von den Verbrauchern aufgerufen werden. */
const EXTRA_REQUIRED = ['imageUrl', 'birthDate', 'deathDate', 'birthYear', 'deathYear', 'birthLabel', 'deathLabel'];

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
const allowed = new Set([...listMatch[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]));

const missing = [...required].filter((field) => !allowed.has(field)).sort();
if (missing.length > 0) {
  console.error('check-catalog-fields: Die Startseite liest Felder, die der Katalog nicht mehr enthaelt:');
  for (const field of missing) console.error(`  - ${field}`);
  console.error('\nEntweder in CATALOG_FIELDS (scripts/merge-pipeline-published.mjs) aufnehmen');
  console.error('oder die Nutzung in src/App.tsx entfernen. Sonst verschwinden Profile');
  console.error('stillschweigend aus der Liste.');
  process.exit(1);
}

const unused = [...allowed].filter((field) => !required.has(field)).sort();
console.log(`check-catalog-fields: ${required.size} gelesene Felder, alle im Katalog. OK.`);
if (unused.length > 0) {
  // Kein Fehler: einige Felder (z. B. quality) werden ueber Hilfsfunktionen
  // oder optional gelesen und tauchen im Regex nicht auf.
  console.log(`  Zusaetzlich mitgeliefert: ${unused.join(', ')}`);
}
