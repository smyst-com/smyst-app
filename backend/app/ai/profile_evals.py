"""Profil-Evals fuer bereits veroeffentlichte smyst.com Twins (Domain).

Baustein 1 der Qualitaetsschleife: Waehrend qa_checks das einmalige
Vorab-Gate VOR der Veroeffentlichung ist, prueft dieses Modul Profile
NACH der Veroeffentlichung wiederkehrend (Regressions-Evals):

1. Die 5 Standardfragen aus qa_checks (Identitaet, Werk, Epoche, Sprache, Falle).
2. Profil-spezifische Fragen, deterministisch aus den Kandidatendaten
   abgeleitet (Geburtsjahr, Kategorie, letztes Lebensjahr) — pruefbar ohne LLM.
3. Feedback-Faelle: Nutzerfragen, die per Daumen-runter gemeldet wurden.
   Bestanden, wenn die neue Antwort nicht mehr der gemeldeten Antwort gleicht.

Jeder Lauf ergibt einen EvalReport mit Score; der Vergleich zum vorherigen
Score erkennt Regressionen (Prompt-/Wissensaenderung hat Profil verschlechtert).

Kein Netzwerk, kein Speicher, kein LLM-Import — alles injizierbar
(gleiches Prinzip wie qa_checks).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.ai.qa_checks import QA_QUESTIONS, evaluate_chat_answers

#: Mehr Feedback-Faelle pro Lauf bringen kaum Signal, kosten aber LLM-Budget.
MAX_FEEDBACK_CASES = 5


def _normalize(text: str) -> str:
    return " ".join((text or "").casefold().split())


def build_profile_questions(candidate_doc: dict) -> list[dict]:
    """Profil-spezifische Zusatzfragen, deterministisch aus den Stammdaten.

    Jede Frage traegt ihre Pruefregel als 'kind' (der Evaluator kennt die
    Regeln); es wird nur erzeugt, was die Datenlage hergibt.
    """
    questions: list[dict] = []
    birth = str(candidate_doc.get("birth_date") or "")
    if len(birth) >= 4 and birth[:4].isdigit():
        questions.append(
            {
                "id": "profile_birth",
                "frage": "In welchem Jahr wurdest du geboren?",
                "kind": "expect_text",
                "expect": birth[:4],
            }
        )
    death = str(candidate_doc.get("death_date") or "")
    if len(death) >= 4 and death[:4].isdigit():
        questions.append(
            {
                "id": "profile_last_years",
                "frage": "Wie hast du die letzten Jahre deines Lebens verbracht?",
                "kind": "nontrivial",
            }
        )
    category = str(candidate_doc.get("category") or "").strip()
    if category:
        questions.append(
            {
                "id": "profile_category",
                "frage": f"Wie kamst du zu deinem Wirken im Bereich {category}?",
                "kind": "nontrivial",
            }
        )
    return questions


def build_feedback_questions(feedback_records: list[dict]) -> list[dict]:
    """Gemeldete Nutzerfragen (Daumen runter / Meldung) als Regressions-Faelle.

    Neueste zuerst, dedupliziert ueber die normalisierte Frage, maximal
    MAX_FEEDBACK_CASES. Records ohne Frage-Text werden uebersprungen.
    """
    cases: list[dict] = []
    seen: set[str] = set()
    ordered = sorted(
        feedback_records, key=lambda record: record.get("createdAt") or 0, reverse=True
    )
    for record in ordered:
        if record.get("rating") not in ("down", "report"):
            continue
        question = str(record.get("question") or "").strip()
        if not question:
            continue
        key = _normalize(question)
        if key in seen:
            continue
        seen.add(key)
        cases.append(
            {
                "id": f"feedback_{len(cases) + 1}",
                "frage": question,
                "kind": "improve_on",
                "bad_answer": str(record.get("answer") or ""),
            }
        )
        if len(cases) >= MAX_FEEDBACK_CASES:
            break
    return cases


def build_eval_questions(candidate_doc: dict, feedback_records: list[dict]) -> list[dict]:
    """Komplettes Fragenset eines Eval-Laufs: Standard + Profil + Feedback."""
    standard = [{**question, "kind": "standard"} for question in QA_QUESTIONS]
    return standard + build_profile_questions(candidate_doc) + build_feedback_questions(feedback_records)


def evaluate_eval_answers(
    questions: list[dict],
    answers: dict[str, str],
    candidate_doc: dict,
    *,
    llm_judge: Callable[[str, str], bool] | None = None,
) -> tuple[dict[str, str], list[str]]:
    """Bewertet alle Antworten; Ergebnis je Frage 'pass' | 'fail'.

    Standardfragen laufen durch die bewaehrten qa_checks-Regeln; die
    Zusatzarten pruefen regelbasiert:
    - expect_text:  erwarteter Text (z. B. Geburtsjahr) kommt in der Antwort vor.
    - nontrivial:   Antwort ist nicht leer/zu kurz (>= 20 Zeichen).
    - improve_on:   Antwort ist nicht leer und gleicht nicht der gemeldeten
                    schlechten Antwort.
    """
    results: dict[str, str] = {}
    issues: list[str] = []

    standard_answers = {
        question["id"]: answers.get(question["id"], "")
        for question in questions
        if question.get("kind") == "standard"
    }
    if standard_answers:
        _, standard_issues = evaluate_chat_answers(
            standard_answers, candidate_doc, llm_judge=llm_judge
        )
        failed_ids = {
            issue.split(":", 1)[0].removeprefix("Chat-Test ").strip()
            for issue in standard_issues
        }
        for question_id in standard_answers:
            results[question_id] = "fail" if question_id in failed_ids else "pass"
        issues += standard_issues

    for question in questions:
        kind = question.get("kind")
        if kind == "standard":
            continue
        question_id = question["id"]
        answer = (answers.get(question_id) or "").strip()
        problems: list[str] = []
        if len(answer) < 20:
            problems.append(f"Eval {question_id}: Antwort fehlt oder zu kurz")
        elif kind == "expect_text" and _normalize(question.get("expect", "")) not in _normalize(answer):
            problems.append(
                f"Eval {question_id}: erwarteter Text '{question.get('expect')}' fehlt in der Antwort"
            )
        elif kind == "improve_on" and _normalize(answer) == _normalize(question.get("bad_answer", "")):
            problems.append(
                f"Eval {question_id}: Antwort gleicht weiterhin der gemeldeten schlechten Antwort"
            )
        if not problems and llm_judge is not None and kind in ("expect_text", "nontrivial", "improve_on"):
            if not llm_judge(question["frage"], answer):
                problems.append(f"Eval {question_id}: LLM-Judge lehnt Antwort ab")
        results[question_id] = "fail" if problems else "pass"
        issues += problems

    return results, issues


@dataclass(frozen=True)
class EvalReport:
    profile_qid: str
    results: dict[str, str]              # frage-id -> "pass" | "fail"
    issues: tuple[str, ...]
    score: float                         # Anteil bestandener Fragen [0..1]
    previous_score: float | None = None
    regression: bool = False
    chat_answers: dict[str, str] = field(default_factory=dict)

    def as_document(self) -> dict:
        return {
            "profile_qid": self.profile_qid,
            "results": dict(self.results),
            "issues": list(self.issues),
            "score": self.score,
            "previous_score": self.previous_score,
            "regression": self.regression,
            "chat_answers": dict(self.chat_answers),
        }


def run_profile_eval(
    candidate_doc: dict,
    feedback_records: list[dict],
    *,
    chat_fn: Callable[[str], str],
    llm_judge: Callable[[str, str], bool] | None = None,
    previous_score: float | None = None,
) -> EvalReport:
    """Fuehrt einen kompletten Eval-Lauf fuer ein Profil aus.

    chat_fn darf ChatProviderDegradedError werfen (wie in qa_checks) — das
    reicht der Aufrufer durch, der Lauf gilt dann als nicht bewertbar.
    """
    questions = build_eval_questions(candidate_doc, feedback_records)
    answers: dict[str, str] = {}
    issues: list[str] = []
    for question in questions:
        try:
            answers[question["id"]] = chat_fn(question["frage"])
        except Exception as error:
            from app.ai.qa_checks import ChatProviderDegradedError

            if isinstance(error, ChatProviderDegradedError):
                raise
            answers[question["id"]] = ""
            issues.append(f"Eval {question['id']}: Fehler {type(error).__name__}")

    results, eval_issues = evaluate_eval_answers(
        questions, answers, candidate_doc, llm_judge=llm_judge
    )
    issues += eval_issues
    total = len(results) or 1
    score = sum(1 for status in results.values() if status == "pass") / total
    regression = previous_score is not None and score < previous_score
    return EvalReport(
        profile_qid=str(candidate_doc.get("wikidata_qid") or ""),
        results=results,
        issues=tuple(issues),
        score=round(score, 4),
        previous_score=previous_score,
        regression=regression,
        chat_answers=answers,
    )
