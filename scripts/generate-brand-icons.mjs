#!/usr/bin/env node
// Erzeugt die binaeren Brand-Assets (PNG/ICO) aus branding/generated/*.b64.
// Die Base64-Textdateien sind die Quelle der Wahrheit, weil Binaerdateien
// nicht ueber den GitHub-Web-Editor eingecheckt werden koennen.
// Die erwartete Byte-Groesse sichert gegen unbemerkt abgeschnittene Inhalte ab.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ASSETS = [
  ['icon-192.png.b64', 5924, ['public/icons/icon-192.png']],
  ['icon-512.png.b64', 24075, ['public/icons/icon-512.png', 'public/icons/maskable-512.png']],
  ['apple-touch-icon.png.b64', 7043, ['public/apple-touch-icon.png']],
  ['og-image.png.b64', 46605, ['public/og-image.png']],
  ['favicon.ico.b64', 472, ['public/favicon.ico']],
];

for (const [src, expectedBytes, targets] of ASSETS) {
  const b64 = readFileSync(join(root, 'branding/generated', src), 'utf8').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== expectedBytes) {
    console.error(`generate-brand-icons: ${src} ist beschaedigt (${buf.length} statt ${expectedBytes} Bytes)`);
    process.exit(1);
  }
  for (const target of targets) {
    const abs = join(root, target);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
  }
  console.log(`generate-brand-icons: ${targets.join(', ')} (${buf.length} Bytes)`);
}
