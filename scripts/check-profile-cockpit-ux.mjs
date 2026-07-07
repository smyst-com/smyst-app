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
const mobileNav = readFileSync('src/components/MobileNav.tsx', 'utf8');
const authHook = readFileSync('src/lib/useAuth.ts', 'utf8');
const translations = readFileSync('src/lib/staticTranslations.ts', 'utf8');

requireIncludes(app, "data-smyst-profile-cockpit=\"true\"", 'profile cockpit marker');
requireIncludes(app, "title=\"Profil geschützt\"", 'compact protected profile login');
requireIncludes(app, "auth.status === 'loading'", 'profile session loading state');
requireIncludes(app, "canSeeAdmin && <button onClick={() => navigateTo('admin')}", 'desktop admin role gate');
requireIncludes(app, "...(canSeeAdmin ? [{ label: 'Admin'", 'mobile admin role gate');
requireIncludes(app, "onClick={() => navigateTo('account-profile')}", 'app header login routes to protected profile');
requireIncludes(app, "adminOnly: true", 'chat menu admin role marker');
requireIncludes(app, 'visibleMenuItems.map((item)', 'chat menu admin filtering');
requireIncludes(app, '<summary className="cursor-pointer text-lg font-semibold">Optionale öffentliche Angaben</summary>', 'collapsed public profile tools');
requireIncludes(app, '<summary className="cursor-pointer text-lg font-semibold">Chatverlauf suchen</summary>', 'collapsed chat search');
requireIncludes(mobileNav, 'Sicherer Login', 'mobile drawer neutral login copy');
requireIncludes(authHook, 'sharedAuthState', 'shared auth state');
requireIncludes(authHook, 'subscribeAuth(setState)', 'shared auth subscription');
requireIncludes(translations, "signInTitle: 'Twins geschützt'", 'compact twins sign-in title');

requireAbsentInProfile(app, 'Anmelden oder registrieren', 'old broad profile login heading');
requireAbsentInProfile(app, 'Erst anmelden, dann Profil sichern', 'old guided unauthenticated explanation');
requireAbsentInProfile(app, 'Chat darf sofort sichtbar sein', 'old login checklist');
requireAbsentInProfile(app, 'Early Access starten', 'early access CTA');
for (const forbidden of [
  'Chat darf sofort sichtbar sein',
  'Private Daten erst nach Login speichern',
  'Fehlertext sagt immer, was zu tun ist',
  'Login bleibt geschützt und klar getrennt',
  'Export/Löschung direkt auffindbar',
  'Bot-Schutz an, ohne dass Login stört',
]) {
  if (app.includes(forbidden)) fail(`old login checklist must not appear anywhere in App.tsx: ${forbidden}`);
}
if (mobileNav.includes('Sicher angemeldet')) fail('mobile drawer must not claim the user is signed in without auth');
if (mobileNav.includes("['72', 'Profil']") || mobileNav.includes("['12', 'Chats']") || mobileNav.includes("['38', 'Memories']")) {
  fail('mobile drawer must not show fixed demo profile stats');
}

console.log('profile cockpit UX validation passed');
