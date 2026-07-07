import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`FAILED profile cockpit UX check: ${message}`);
  process.exit(1);
}

function requireIncludes(source, expected, label) {
  if (!source.includes(expected)) fail(`${label} missing: ${expected}`);
}

function requireAbsentInProfile(source, forbidden, label) {
  const start = source.indexOf('function AccountProfileView');
  const end = source.indexOf('function DashboardView', start);
  const profileSource = source.slice(start, end > start ? end : undefined);
  if (profileSource.includes(forbidden)) fail(`${label} must not appear in AccountProfileView: ${forbidden}`);
}

const app = readFileSync('src/App.tsx', 'utf8');

requireIncludes(app, "data-smyst-profile-cockpit=\"true\"", 'profile cockpit marker');
requireIncludes(app, "title=\"Profil geschützt\"", 'compact protected profile login');
requireIncludes(app, 'compact', 'compact sign-in mode');
requireIncludes(app, "auth.status === 'loading'", 'profile session loading state');
requireIncludes(app, "canSeeAdmin && <button onClick={() => navigateTo('admin')}", 'desktop admin role gate');
requireIncludes(app, "...(canSeeAdmin ? [{ label: 'Admin'", 'mobile admin role gate');
requireIncludes(app, '<summary className="cursor-pointer text-lg font-semibold">Optionale öffentliche Angaben</summary>', 'collapsed public profile tools');
requireIncludes(app, '<summary className="cursor-pointer text-lg font-semibold">Chatverlauf suchen</summary>', 'collapsed chat search');

requireAbsentInProfile(app, 'Anmelden oder registrieren', 'old broad profile login heading');
requireAbsentInProfile(app, 'Erst anmelden, dann Profil sichern', 'old guided unauthenticated explanation');
requireAbsentInProfile(app, 'Chat darf sofort sichtbar sein', 'old login checklist');
requireAbsentInProfile(app, 'Early Access starten', 'early access CTA');

console.log('profile cockpit UX validation passed');
