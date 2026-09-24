# Release- und Änderungsschutz smyst.com — technischer Nachweis

**Aktiviert:** 25.09.2026 (Auftrag Inhaber 24.09.2026, Abschnitt 9) ·
**Git-Stand der Aktivierung:** PR #855 (cd1d709d) + PR #856 (67faffc4) auf main

## Umgesetzte Schutzmaßnahmen (technisch, serverseitig)

### 1. Branch-Protection main (GitHub, serverseitig erzwungen)

| Regel | Zustand | Wirkung |
|---|---|---|
| `required_pull_request_reviews` | aktiv | KEIN Direktpush — jede Änderung über PR |
| `enforce_admins` | **true** | Regeln gelten auch für Admins/Owner-Tokens — kein Agent kann sich über Adminrechte vorbeidrücken |
| `allow_force_pushes` | false | Kein Force-Push (kein silent history rewrite) |
| `allow_deletions` | false | Branch main nicht löschbar |

### 2. Negative Tests (Auftrag: „müssen tatsächlich scheitern") — 25.09. ausgeführt

| Versuch | Ergebnis |
|---|---|
| Direktpush auf main (fast-forward, Testdatei) | **abgelehnt**: „push declined due to repository rule violations" |
| Force-Push auf main | **abgelehnt**: „push declined due to repository rule violations" |
| Löschung main (`git push origin :main`) | **abgelehnt**: „refusing to delete the current branch" |

Ein Agent mit Git-Zugang kann main seitdem nur noch über einen PR
verändern — und jeder PR läuft durch die CI-Gates (Gitleaks, Build,
Typecheck, E2E, Free-only-Policy, Guards).

### 3. Deployment-Wege (geschützt)

- **Frontend (smyst.com, GitHub Pages):** deployt ausschließlich aus
  geschütztem main (github-pages.yml) **plus** Schwund-Waechter
  (check-profile-count-guard: >5 % Profilverlust = Abbruch — bewiesen am
  24.09., er blockierte den truncated-Index-Deploy) plus Publish-Index-
  Integritätsprüfung.
- **Backend (api.smyst.com, Zeabur):** Deploy nur über das Zeabur-Dashboard
  mit Inhaber-Session (kein technischer Fern-Deploy-Weg im Repo; GraphQL
  blockt Sessions Dritter). Agents können Backend-Code nur via PR auf main
  bringen; live geht er nur durch Inhaber-Redeploy.
- **Produktions-Env/Secrets (Zeabur, GitHub):** nur Inhaber (AGENTS.md).

### 4. Autopilot-Schutz (kein Selbst-Ernächtigen)

- Der Language-Autopilot ist ein **rein lesender Prüfdienst**: er verändert
  keine Profile, Chats, Prompts oder Modellkonfiguration; Persistenz nur
  anhängend (language-autopilot/ im Object Brain, nie löschend).
- Sein Ein-/Aus-Schalter liegt im Object Brain und ist nur über die
  Admin-API (admin:read) erreichbar; Admin-Sessions sind an die zwei
  hinterlegten Konten gebunden (PR #852, code-seitige Allowlist +
  Backend-Rollen-Fallback).
- Der Publish-Index-Verlust-Fix (PR #856) verhindert, dass ein
  Hintergrundlauf den Live-Bestand still überschreiben kann.
- Zeitpläne (Cron) liegen im geschützten main — Änderung nur per PR.

### 5. Audit und Rollback

- Jeder Merge ist über PR + CI-Checks nachvollziehbar (GitHub-Historie).
- Umschaltungen des Language-Autopiloten schreiben Zeitstempel + Rolle in
  `language-autopilot/status.json` (Object Brain).
- Rollback-Weg jedes Releases: `git revert` des Merge-Commits (main-Schutz
  erlaubt Revert-PRs); Sprach-Routing zusätzlich per Env
  `SMYST_LLM_LANGUAGES` ohne Redeploy steuerbar.
- Backups: Publish-Index-Sicherheitskopien (pre-reconcile-*), Pipeline-
  Backup-Workflow, Codeberg-Mirror, Object Brain (nie löschend).

## Ehrlichkeitsgrenzen (keine Behauptung absoluter Sicherheit)

- GitHub-Organisations-/Kontokontrolle liegt beim Inhaber; ein kompromittiertes
  Owner-Konto könnte Protection per API ändern (dann im Audit-Log sichtbar).
- `required_approving_review_count=0`: bewusst NICHT auf 1 erhöht, damit der
  Inhaber-Betrieb (Agenten mergen täglich PRs nach seiner Freigabe im Chat)
  nicht lahmgelegt wird. Alternativen (1 Review, Signed Commits) kann der
  Inhaber jederzeit anfordern.
- Backend-Deploy-Schutz beruht auf Zugangsbeschränkung des Zeabur-Dashboards
  (nur Inhaber-Login), nicht auf einem Code-Mechanismus.

## Freigabe-Protokoll

Änderungen am freigegebenen Produktivstand (Sprachrouting, Prompts, aktive
Modellversionen, Autopilot-Konfiguration, Datenbankschema) benötigen die
schriftliche Freigabe des Inhabers (Adam King) für den konkreten Umfang.
Dokumentationsform: Chat-Beleg + Eintrag in Memory_Bank.md mit Datum,
Umfang und Version. Diese Datei versioniert den Schutzstand selbst.
