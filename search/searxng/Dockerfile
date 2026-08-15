# SearXNG als eigener Zeabur-Dienst.
#
# Zweck: die Twins sollen Gegenwartsfragen (Wetter, Nachrichten, Preise) mit echten
# Quellen beantworten koennen, statt sie pauschal als "nach meiner Zeit" abzutun.
# SearXNG ist eine Meta-Suchmaschine, die selbst gehostet wird - damit bleibt die
# Infrastruktur-Regel gewahrt (nur GitHub + Zeabur + iDrive e2), es faellt kein
# Anbieter-Key und keine Gebuehr pro Anfrage an.
FROM searxng/searxng:latest

# Die Standard-Instanz liefert ausschliesslich HTML. Der Backend-Provider
# (backend/app/ai/web_research.py -> SearxngSearchProvider) ruft /search?format=json
# auf und bekaeme sonst dauerhaft leere Ergebnisse. Deshalb eine eigene settings.yml,
# die auf den Standardwerten aufsetzt und nur das Noetige aendert.
COPY settings.yml /etc/searxng/settings.yml
