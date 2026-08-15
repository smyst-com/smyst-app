# SearXNG (Web-Recherche der Twins)

Selbst gehostete Meta-Suchmaschine. Sie versorgt die Twins mit aktuellen oeffentlichen
Fakten, wenn eine Frage von Gegenwartswissen abhaengt (Wetter, Nachrichten, Preise,
Recht, Kurse). Ohne diesen Dienst antworten Twins auf solche Fragen zu Recht mit
"das liegt nach meiner Zeit".

Warum selbst hosten statt Brave-/OpenAI-Suche: keine Kosten pro Anfrage, kein weiterer
Anbieter, kein Key. Die Infrastruktur bleibt bei GitHub + Zeabur + iDrive e2.

## Deployment (Zeabur)

Eigener Dienst im Projekt, Quelle = dieses Repo, Root-Verzeichnis `search/searxng`.

Variablen am SearXNG-Dienst:

| Variable | Wert | Zweck |
| --- | --- | --- |
| `SEARXNG_SECRET` | zufaelliger String | Signier-Secret, Pflicht |
| `SEARXNG_BIND_ADDRESS` | `0.0.0.0` | sonst nur localhost erreichbar |
| `SEARXNG_PORT` | `8080` | Port im internen Netz |
| `SEARXNG_BASE_URL` | interne URL des Dienstes | Selbstreferenz von SearXNG |

Variablen am **Backend**-Dienst, damit die Suche benutzt wird:

| Variable | Wert |
| --- | --- |
| `WEB_RESEARCH_ENABLED` | `true` |
| `WEB_SEARCH_PROVIDER` | `searxng` |
| `SEARXNG_BASE_URL` | interne URL des SearXNG-Dienstes |

Der Dienst braucht **keine** oeffentliche Domain - er wird nur aus dem internen
Zeabur-Netz vom Backend aufgerufen.

## Pruefen, ob es laeuft

```bash
curl -s -X POST https://smyst-api.zeabur.app/api/v1/web-research/preview \
  -H 'Content-Type: application/json' \
  -d '{"question":"Wie ist das Wetter morgen in Berlin?","context":{"context_type":"chat","public_research_allowed":true}}'
```

Erwartet: `provider: searxng`, `canCallProvider: true`. Meldet die Antwort
`web_search_provider_credentials_missing`, fehlt `SEARXNG_BASE_URL` am Backend.

Der zweite Test zeigt, ob wirklich Quellen zurueckkommen - `/api/v1/web-research/run`
mit derselben Nutzlast muss `searched: true` und gefuellte `sources` liefern.

## Warum eine eigene settings.yml

Das offizielle Image liefert nur HTML aus. `backend/app/ai/web_research.py`
(`SearxngSearchProvider`) ruft `/search?format=json` auf und bekaeme sonst dauerhaft
403. Die Datei setzt per `use_default_settings: true` auf den Standardwerten auf und
aendert nur das Noetige - insbesondere werden `secret_key` und `base_url` dort NICHT
gesetzt, damit die Env-Overrides des Images greifen.
