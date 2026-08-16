# SearXNG (Web-Recherche der Twins)

Selbst gehostete Meta-Suchmaschine. Sie versorgt die Twins mit aktuellen oeffentlichen
Fakten, wenn eine Frage von Gegenwartswissen abhaengt (Wetter, Nachrichten, Preise,
Recht, Kurse). Ohne diesen Dienst antworten Twins auf solche Fragen zu Recht mit
"das liegt nach meiner Zeit".

Warum selbst hosten statt Brave-/OpenAI-Suche: keine Kosten pro Anfrage, kein weiterer
Anbieter, kein Key. Die Infrastruktur bleibt bei GitHub + Zeabur + iDrive e2.

## Deployment (Zeabur)

Dienst `smyst-searxng` im Projekt, Quelle = dieses Repo (Arbitrary Git, Branch `main`).

**Wichtig:** Zeabur baut diesen Dienst **ohne Build-Kontext** — der erste Versuch mit
`COPY settings.yml` brach ab (`failed to calculate checksum ... "/settings.yml": not
found`, Kontext 2 B). Deshalb bleibt das Image unveraendert und die settings.yml wird
zur Laufzeit gemountet:

1. **Settings → Dockerfile:** nur `FROM searxng/searxng:latest`
2. **Settings → Configs → Add Config File:** Pfad `/etc/searxng/settings.yml`,
   Inhalt = die settings.yml aus diesem Ordner. Sie ist hier die Quelle der Wahrheit;
   nach jeder Aenderung muss sie in Zeabur nachgezogen werden.
3. **Networking → Private → Expose Port:** `8080`, Typ HTTP. Eine oeffentliche Domain
   braucht der Dienst nicht — nur das Backend ruft ihn auf.

Variablen am SearXNG-Dienst:

| Variable | Wert | Zweck |
| --- | --- | --- |
| `SEARXNG_SECRET` | beliebiger Zufallsstring | **Pflicht**, sonst startet der Dienst nicht |
| `SEARXNG_BIND_ADDRESS` | `0.0.0.0` | sonst nur localhost erreichbar |
| `SEARXNG_PORT` | `8080` | Port im internen Netz |
| `SEARXNG_BASE_URL` | `http://smyst-searxng.zeabur.internal:8080/` | Selbstreferenz |

`SEARXNG_SECRET` ist wirklich Pflicht, auch wenn das Entrypoint-Skript einen
Zufallswert erzeugen kann: es tut das nur, wenn es die settings.yml selbst aus der
Vorlage anlegt. Sobald eine eigene Datei gemountet ist, bleibt der Standardwert
stehen und SearXNG bricht beim Start ab:

```
ERROR:searx.webapp: server.secret_key is not changed. Please use something else.
[ERROR] Unexpected exit from worker-1
```

Der Wert selbst ist beliebig — er signiert nur Sitzungen einer Weboberflaeche, die
hier niemand benutzt. Zufallswert erzeugen:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Variablen am **Backend**-Dienst, damit die Suche benutzt wird:

| Variable | Wert |
| --- | --- |
| `WEB_RESEARCH_ENABLED` | `true` |
| `WEB_SEARCH_PROVIDER` | `searxng` |
| `SEARXNG_BASE_URL` | `http://smyst-searxng.zeabur.internal:8080` |

## Pruefen, ob es laeuft

```bash
curl -s -X POST https://smyst-api.zeabur.app/api/v1/web-research/preview -H 'Content-Type: application/json' -d '{"question":"Wie ist das Wetter morgen in Berlin?","context":{"context_type":"chat","public_research_allowed":true}}'
```

Erwartet: `provider: searxng`, `canCallProvider: true`. Meldet die Antwort
`web_search_provider_credentials_missing`, fehlt `SEARXNG_BASE_URL` am Backend.

Der zweite Test zeigt, ob wirklich Quellen zurueckkommen — `/api/v1/web-research/run`
mit derselben Nutzlast muss `searched: true` und gefuellte `sources` liefern.

## Warum eine eigene settings.yml

Das offizielle Image liefert nur HTML aus. `backend/app/ai/web_research.py`
(`SearxngSearchProvider`) ruft `/search?format=json` auf und bekaeme sonst dauerhaft
403. Die Datei setzt per `use_default_settings: true` auf den Standardwerten auf und
aendert nur das Noetige — insbesondere werden `secret_key` und `base_url` dort NICHT
gesetzt, damit die Env-Overrides des Images greifen.
