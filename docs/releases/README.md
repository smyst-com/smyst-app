# Releases

Production releases are documented here.

Rules:

- Create one manifest per production release.
- Start from `release-manifest-template.md`.
- Name manifests as `<version>.md`, for example `0.1.0-foundation.1.md`.
- Keep the root `VERSION` file aligned with the current planned release version.
- Do not deploy production without completing `docs/runbooks/release-governance.md`.

## Einordnung der Altberichte (Stand 2026-08-20)

Die datierten Berichte in diesem Ordner sind Zeitdokumente und werden bewusst
nicht nachtraeglich umgeschrieben. Beim Lesen gilt:

- "Legacy edge provider" bezeichnet Cloudflare. Der Begriff stammt aus einer
  spaeteren Neutralisierung der Provider-Nennungen. Cloudflare war bis
  Mitte 2026 Edge-Provider und ist heute kein Produktionsbestandteil.
- Salad.com war bis Ende Juli 2026 der Compute-Layer. Seitdem laeuft das
  Backend auf Zeabur (`api.smyst.com`).
- Aussagen zu IDrive e2 als Website-Host sind ueberholt: Public Bucket Access
  ist im Free-Plan gesperrt, `smyst.com` lief immer ueber GitHub Pages.

Der verbindliche Live-Stand steht in `docs/ARCHITECTURE.md`,
`docs/INFRA_SETUP.md`, `docs/07-deployment-architecture.md` und
`docs/FREE_ONLY_DATA_MAP.md`.
