import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`FAILED safe destructive actions check: ${message}`);
  process.exit(1);
}

function requireIncludes(source, expected, label) {
  if (!source.includes(expected)) fail(`${label} missing: ${expected}`);
}

function requireAbsent(source, forbidden, label) {
  if (source.includes(forbidden)) fail(`${label} must not contain: ${forbidden}`);
}

const social = readFileSync('src/components/SocialLinksCard.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const socialApi = readFileSync('backend/app/api/v1/routes/social_links.py', 'utf8');

requireIncludes(social, 'MoreHorizontal', 'social options menu');
requireIncludes(social, 'Entfernen vorbereiten', 'social two-step removal');
requireIncludes(social, 'Ja, entfernen', 'social explicit removal confirmation');
requireIncludes(social, 'Rückgängig', 'social undo');
requireIncludes(social, "'X-Smyst-Delete-Confirm': 'delete-social-link'", 'social delete API call');
requireAbsent(social, "window.confirm('Diesen Social-Media-Link wirklich entfernen?')", 'social delete UX');
requireAbsent(social, '>Entfernen</button>', 'social direct remove button');

requireIncludes(socialApi, 'DELETE_CONFIRM_HEADER = "X-Smyst-Delete-Confirm"', 'social API delete confirmation header');
requireIncludes(socialApi, 'DELETE_CONFIRM_VALUE = "delete-social-link"', 'social API delete confirmation value');
requireIncludes(socialApi, 'delete_confirmation_required', 'social API delete protection error');

requireIncludes(app, 'Gefährliche Aktionen', 'account destructive action section');
requireIncludes(app, 'accountDeleteWord.trim().toUpperCase() !==', 'account typed delete guard');
requireIncludes(app, 'Wirklich löschen', 'memory explicit delete confirmation');
requireIncludes(app, 'Löschen vorbereiten', 'memory staged delete action');
requireAbsent(app, "window.confirm('Account, Chats, Twins und bekannte Dateien wirklich löschen?')", 'account delete UX');
requireAbsent(app, "window.confirm('Diese Memory wirklich löschen?')", 'memory delete UX');

console.log('safe destructive actions validation passed');
