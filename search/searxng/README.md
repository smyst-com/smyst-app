# SearXNG (Web-Recherche der Twins)

Selbst gehostete Meta-Suchmaschine. Sie versorgt die Twins mit aktuellen oeffentlichen
Fakten, wenn eine Frage von Gegenwartswissen abhaengt (Wetter, Nachrichten, Preise,
Recht, Kurse). Ohne diesen Dienst antworten Twins auf solche Fragen zu Recht mit
"das liegt nach meiner Zeit".

Warum selbst hosten statt Brave-/OpenAI-Suche: keine Kosten pro Anfrage, kein weiterer
Anbieter, kein Key. Die Infrastruktur bleibt bei GitHub + Zeabur + iDrive e2.

## Deployment (Zeabur)

Dienst **`SearXNG`** im Projekt, angelegt aus dem offiziellen Zeabur-Template
(`zeabur.com/templates/77FSH6`, Add Service → Template → SearXNG). Das Template
erzeugt `SEARXNG_SECRET` selbst — ohne diesen Wert startet SearXNG nicht
("server.secret_key is not changed"), und genau daran scheiterte der erste,
selbst gebaute Anlauf.

- Erreichbar nur intern: `searxng.zeabur.internal:8080` (Private Port, HTTP)
- **Keine oeffentliche Domain** — einziger Aufrufer ist das Backend
- Das Dockerfile und die settings.yml in diesem Ordner sind **nicht mehr im Einsatz**;
  sie bleiben als Vorlage liegen, falls der Dienst je ohne Template neu gebaut wird.
  Achtung dabei: Zeabur baut "Arbitrary Git"-Dienste mit inline hinterlegtem
  Dockerfile **ohne Build-Kontext** (`transferring context: 2B`), ein `COPY` schlaegt
  dort fehl.

Variablen am **Backend**-Dienst, damit die Suche benutzt wird:

| Variable | Wert |
| --- | --- |
| `WEB_RESEARCH_ENABLED` | `true` |
| `WEB_SEARCH_PROVIDER` | `searxng` |
| `SEARXNG_ENGINES` | `bing,wikipedia` (Standard im Code) |
| `SEARXNG_BASE_URL` | `http://searxng.zeabur.internal:8080` |

## Pruefen, ob es laeuft

```bash
curl -s -X POST https://smyst-api.zeabur.app/api/v1/web-research/preview -H 'Content-Type: application/json' -d '{"question":"Wie ist das Wetter morgen in Berlin?","context":{"context_type":"chat","public_research_allowed":true}}'
```

Erwartet: `provider: searxng`, `canCallProvider: true`. Meldet die Antwort
`web_search_provider_credentials_missing`, fehlt `SEARXNG_BASE_URL` am Backend.

Der zweite Test zeigt, ob wirklich Quellen zurueckkommen — `/api/v1/web-research/run`
mit derselben Nutzlast muss `searched: true` und gefuellte `sources` liefern.

## Warum nicht der Standard-Suchmaschinensatz

SearXNG fragt ohne Vorgabe google, duckduckgo, brave, startpage & Co. Von einer
Rechenzentrums-IP liefern die **nichts**. Am 16.08.2026 aus dem Backend-Container
gegen die eigene Instanz gemessen, Suchbegriff „wetter berlin morgen":

| Engine | Treffer |
| --- | --- |
| google | 0 |
| duckduckgo | 0 |
| brave | 0 |
| mojeek | 0 |
| startpage | 0 |
| **bing** | **10** |

Deshalb schickt der Provider `SEARXNG_ENGINES` (Default `bing,wikipedia`) als
`engines=`-Parameter mit. Faellt Bing eines Tages aus, reicht ein Aendern dieser
Variable am Backend — kein Deploy noetig. Leerer Wert = SearXNG entscheidet selbst.

Messbefehl fuer den naechsten Verdacht (Command-Konsole am smyst-backend):

```bash
python -c "import httpx,os;u=os.environ['SEARXNG_BASE_URL'];[print(e, httpx.get(u+'/search',params={'q':'wetter berlin morgen','engines':e},timeout=25).text.count('article class=\"result')) for e in ['google','duckduckgo','bing','brave','mojeek','wikipedia','startpage']]"
```
