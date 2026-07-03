"""Transaktionaler E-Mail-Versand für smyst.com.

Provider: Resend (https://resend.com) — kostenloser Tier, einfache HTTP-API,
keine zusätzliche Python-Dependency (httpx ist bereits vorhanden).

Aktivierung: Der Versand ist nur aktiv, wenn RESEND_API_KEY gesetzt ist
(GitHub-Secret → Salad-Runtime-Env). Ohne Key melden aufrufende Endpunkte
ehrlich "nicht verfügbar", statt Versand vorzutäuschen.
"""

from __future__ import annotations

import httpx

from app.core.config import settings

RESEND_API_URL = "https://api.resend.com/emails"


class EmailSendError(RuntimeError):
    """Versand fehlgeschlagen oder nicht konfiguriert."""


def is_email_sending_configured() -> bool:
    return bool(settings.resend_api_key)


async def send_email(to: str, subject: str, text: str) -> None:
    """Sendet eine reine Text-E-Mail. Wirft EmailSendError bei Fehlern."""
    if not is_email_sending_configured():
        raise EmailSendError("E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt).")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            RESEND_API_URL,
            json={
                "from": settings.mail_from,
                "to": [to],
                "subject": subject,
                "text": text,
            },
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )
    if response.status_code >= 400:
        raise EmailSendError(f"Resend-API antwortete mit {response.status_code}.")
