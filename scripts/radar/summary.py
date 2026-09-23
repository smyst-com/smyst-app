#!/usr/bin/env python3
"""smyst radar — Lauf-Zusammenfassung als GitHub-Step-Summary (Markdown).

Liest den juengsten Tagesbericht im radar-state und schreibt ehrlich nur,
was wirklich gemessen wurde (keine erfundenen Lernerfolge).
"""

from __future__ import annotations

import json
import pathlib
import sys


def main() -> int:
    state = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "radar-state")
    reports = sorted((state / "reports").glob("*.json"))
    print("## smyst radar — Lauf")
    if not reports:
        print("Kein Tagesbericht geschrieben — Lauf prüfen.")
        return 0
    r = json.loads(reports[-1].read_text(encoding="utf-8"))
    print(f"\n### {r.get('title', '?')} ({r.get('day', '?')})\n")
    print(r.get("summary", "keine Zusammenfassung") + "\n")
    print(f"- Quellen untersucht: {r.get('sources_ok_count', 0)}/{r.get('sources_examined_count', 0)} erreichbar")
    print(f"- Fundstücke: {r.get('findings_count', 0)}")
    print(f"- Neue Erkenntnisse: {len(r.get('new_insights', []))}")
    print(f"- Verworfen: {len(r.get('rejected', []))} | Aktualisiert: {len(r.get('updated', []))} | Veraltet: {len(r.get('outdated', []))}")
    ru = r.get("rag_usage") or {}
    tests = ru.get("tests", [])
    if tests:
        ok = sum(1 for t in tests if t.get("found_correct_category"))
        print(f"- RAG-Testfragen: {ok}/{len(tests)} bestanden")
    ans = ru.get("answers", [])
    if ans:
        ok = sum(1 for a in ans if a.get("ok"))
        print(f"- Testantworten (smyst-Modell): {ok}/{len(ans)} erfolgreich")
    else:
        print("- Testantworten: nicht ausgeführt (kein Server/keine Treffer)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
