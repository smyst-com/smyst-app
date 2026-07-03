/**
 * Übergangs-Alias: Der GitHub-Login hat serverseitig keine Endpunkte
 * (es existiert kein /auth/github/* im Backend). Damit nirgendwo ein toter
 * Login-Button angezeigt wird, führen alle bisherigen GitHub-Anmeldeflächen
 * bis auf Weiteres zum funktionierenden Google-Login.
 *
 * Sobald GitHub-OAuth serverseitig implementiert ist, diese Datei wieder
 * durch die echte GitHub-Button-Komponente ersetzen (siehe Git-Historie).
 */
export { default } from './GoogleSignInButton';
