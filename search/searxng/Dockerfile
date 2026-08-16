# SearXNG als eigener Zeabur-Dienst.
#
# Zweck: die Twins sollen Gegenwartsfragen (Wetter, Nachrichten, Preise) mit echten
# Quellen beantworten koennen, statt sie pauschal als "nach meiner Zeit" abzutun.
# SearXNG ist eine Meta-Suchmaschine, die selbst gehostet wird - damit bleibt die
# Infrastruktur-Regel gewahrt (nur GitHub + Zeabur + iDrive e2), es faellt kein
# Anbieter-Key und keine Gebuehr pro Anfrage an.
#
# Das Image bleibt bewusst unveraendert. settings.yml wird NICHT hineinkopiert:
# Zeabur baut diesen Dienst ohne Build-Kontext (der Build brach mit
# "failed to calculate checksum ... /settings.yml: not found" ab, Kontext 2 B),
# und /etc/searxng ist im Basis-Image ein VOLUME - hineingebackene Dateien waeren
# zur Laufzeit ohnehin unzuverlaessig. Stattdessen mountet Zeabur die daneben
# liegende settings.yml als Config-Datei nach /etc/searxng/settings.yml,
# siehe README.md.
FROM searxng/searxng:latest
