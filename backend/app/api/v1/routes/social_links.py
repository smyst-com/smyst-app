"""Social-Media-Links: Import, Pruefung und KI-Zusammenfassung (Phase 1).

Der Nutzer verknuepft eigene Social-Media-Profile (Instagram, TikTok,
YouTube, X, Facebook, LinkedIn, Snapchat, Website u. a.). Der Import liest
ausschliesslich erlaubte OEFFENTLICHE Informationen (OpenGraph-/Meta-Tags
der Profilseite, transparenter User-Agent) - kein Login-Bypass, kein
aggressives Scraping, keine privaten Daten. Die KI (LLM-Router) erstellt
eine kurze Einordnung (Person/Firma/Kuenstler/...) und Zusammenfassung;
ohne erreichbaren LLM greift eine deterministische Heuristik.

Privacy & Security by Design:
- Nur fuer das eigene, angemeldete Konto; jederzeit einsehbar, editierbar,
  neu pruefbar und loeschbar.
- SSRF-Schutz: nur http/https, keine Zugangsdaten in der URL, Zielhost muss
  auf oeffentliche IPs aufloesen, Groessen- und Zeitlimits beim Abruf.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
import time
import uuid
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.ai.llm_router import build_default_router
from app.ai.models import LLMRequest
from app.api.v1.routes.user_mvp import _clean_text, _error, _load_doc, _require_sub
from app.integrations import user_store

router = APIRouter(tags=["social"])

MAX_LINKS = 25
FETCH_TIMEOUT_SECONDS = 6.0
MAX_FETCH_BYTES = 512 * 1024
AI_DEADLINE_SECONDS = 14.0
USER_AGENT = "smyst.com LinkCheck/1.0 (+https://smyst.com)"

PLATFORM_HOSTS: list[tuple[str, list[str]]] = [
    ("instagram", ["instagram.com"]),
    ("tiktok", ["tiktok.com"]),
    ("youtube", ["youtube.com", "youtu.be"]),
    ("x", ["x.com", "twitter.com"]),
    ("facebook", ["facebook.com", "fb.com"]),
    ("linkedin", ["linkedin.com"]),
    ("snapchat", ["snapchat.com"]),
    ("pinterest", ["pinterest.com"]),
    ("github", ["github.com"]),
    ("twitch", ["twitch.tv"]),
    ("telegram", ["t.me", "telegram.me"]),
    ("whatsapp", ["wa.me", "whatsapp.com"]),
    ("spotify", ["open.spotify.com", "spotify.com"]),
    ("threads", ["threads.net", "threads.com"]),
    ("xing", ["xing.com"]),
    ("reddit", ["reddit.com"]),
]

CATEGORY_VALUES = {
    "person", "firma", "restaurant", "kuenstler", "influencer",
    "dienstleistung", "marke", "organisation", "sonstiges",
}


class SocialLinkCreate(BaseModel):
    url: str = Field(min_length=4, max_length=500)


class SocialLinkPatch(BaseModel):
    displayName: str | None = None
    category: str | None = None
    bio: str | None = None
    topics: list[str] | None = None
    summary: str | None = None


def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_url(raw: str) -> str:
    value = raw.strip()
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = "https://" + value
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = re.sub(r"/{2,}", "/", parsed.path or "/").rstrip("/") or "/"
    return urlunparse(("https", host, path, "", parsed.query, ""))


def _detect_platform(host: str) -> str:
    bare = host[4:] if host.startswith("www.") else host
    for platform, hosts in PLATFORM_HOSTS:
        for candidate in hosts:
            if bare == candidate or bare.endswith("." + candidate):
                return platform
    return "website"


def _username_from_url(platform: str, parsed_path: str) -> str:
    segments = [seg for seg in parsed_path.split("/") if seg]
    if not segments:
        return ""
    first = segments[0]
    if platform == "linkedin" and len(segments) >= 2 and segments[0] in {"in", "company", "school"}:
        return segments[1]
    if platform == "youtube" and first.startswith("@"):
        return first[1:]
    if platform in {"instagram", "tiktok", "x", "facebook", "snapchat", "github", "twitch", "telegram", "threads", "pinterest"}:
        return first[1:] if first.startswith("@") else first
    return ""


def _suspicious_reason(raw: str, parsed: Any) -> str:
    if parsed.scheme not in {"http", "https"}:
        return "Nur http/https-Links sind erlaubt."
    if parsed.username or parsed.password:
        return "Zugangsdaten in der URL sind nicht erlaubt."
    host = parsed.hostname or ""
    if not host or "." not in host:
        return "Kein gueltiger Hostname."
    if host.startswith("xn--") or ".xn--" in host:
        return "Punycode-Domain - bitte manuell pruefen."
    if parsed.port not in (None, 80, 443):
        return "Ungewoehnlicher Port."
    if len(raw) > 500:
        return "Link ist ungewoehnlich lang."
    return ""


def _resolves_public(host: str) -> bool:
    """SSRF-Schutz: Host muss ausschliesslich auf oeffentliche IPs aufloesen."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    addresses = {info[4][0] for info in infos}
    if not addresses:
        return False
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            return False
        if not ip.is_global:
            return False
    return True


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self._in_title = False
        self.title = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        if tag != "meta":
            return
        attr = dict(attrs)
        key = (attr.get("property") or attr.get("name") or "").lower()
        content = (attr.get("content") or "").strip()
        if key and content and key not in self.meta:
            self.meta[key] = content

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and len(self.title) < 300:
            self.title += data


async def _fetch_public_meta(url: str) -> tuple[str, dict[str, str]]:
    """Laedt die Profilseite und extrahiert Meta-Tags.

    Rueckgabe: (status, meta) mit status in ok|limited|unreachable.
    """
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=4,
            timeout=FETCH_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "de,en;q=0.8"},
        ) as client:
            response = await client.get(url)
    except Exception:
        return "unreachable", {}
    if response.status_code in {401, 403, 429, 999}:
        return "limited", {}
    if response.status_code >= 400:
        return "unreachable", {}
    body = response.text[:MAX_FETCH_BYTES]
    parser = _MetaParser()
    try:
        parser.feed(body)
    except Exception:
        return "limited", {}
    meta = parser.meta
    result = {
        "title": meta.get("og:title") or parser.title.strip(),
        "description": meta.get("og:description") or meta.get("description") or "",
        "image": meta.get("og:image") or "",
        "siteName": meta.get("og:site_name") or "",
        "locale": meta.get("og:locale") or "",
    }
    login_markers = ("log in", "login", "anmelden", "sign up")
    title_lower = (result["title"] or "").lower()
    if not result["title"] and not result["description"]:
        return "limited", result
    if any(marker in title_lower for marker in login_markers) and len(title_lower) < 40:
        return "limited", result
    return "ok", result


def _heuristic_category(platform: str, meta: dict[str, str]) -> str:
    text = ((meta.get("title") or "") + " " + (meta.get("description") or "")).lower()
    rules = [
        ("restaurant", ["restaurant", "pizzeria", "cafe", "café", "imbiss", "kueche", "küche", "menu", "speisekarte"]),
        ("kuenstler", ["musiker", "artist", "band", "maler", "musician", "singer", "saenger"]),
        ("influencer", ["creator", "influencer", "follow", "abonnieren", "vlog"]),
        ("firma", ["gmbh", " ag ", "inc.", "llc", "company", "unternehmen", "startup"]),
        ("organisation", ["verein", "ngo", "stiftung", "organisation", "organization", "e.v."]),
        ("dienstleistung", ["service", "beratung", "consulting", "agentur", "studio", "coach"]),
        ("marke", ["brand", "marke", "official store", "shop"]),
    ]
    for category, words in rules:
        if any(word in text for word in words):
            return category
    return "person"


def _heuristic_topics(meta: dict[str, str]) -> list[str]:
    text = (meta.get("description") or "")[:300]
    words = re.findall(r"[A-Za-zÄÖÜäöüß]{5,}", text)
    seen: list[str] = []
    for word in words:
        lowered = word.lower()
        if lowered not in {w.lower() for w in seen}:
            seen.append(word)
        if len(seen) >= 5:
            break
    return seen


async def _ai_enrich(platform: str, username: str, meta: dict[str, str]) -> dict[str, Any]:
    """KI-Einordnung + Zusammenfassung; faellt bei Fehlern auf Heuristik zurueck."""
    category = _heuristic_category(platform, meta)
    topics = _heuristic_topics(meta)
    summary = _clean_text(meta.get("description"), 280) or (
        f"{platform}-Profil" + (f" von {username}" if username else "") + "."
    )
    title = _clean_text(meta.get("title"), 160)
    description = _clean_text(meta.get("description"), 600)
    if not title and not description:
        return {"category": category, "topics": topics, "summary": summary, "aiUsed": False}
    prompt = (
        "Analysiere dieses oeffentliche Social-Media-Profil fuer smyst.com.\n"
        f"Plattform: {platform}\n"
        f"Benutzername: {username or 'unbekannt'}\n"
        f"Titel: {title}\n"
        f"Beschreibung: {description}\n\n"
        "Antworte EXAKT in diesem Format (3 Zeilen, Deutsch):\n"
        "Kategorie: <person|firma|restaurant|kuenstler|influencer|dienstleistung|marke|organisation|sonstiges>\n"
        "Themen: <2-5 Stichworte, kommagetrennt>\n"
        "Zusammenfassung: <1-2 kurze, sachliche Saetze worum es geht>"
    )
    system_prompt = (
        "Du bist ein praeziser Analyst fuer smyst.com. Du bewertest nur die "
        "gegebenen oeffentlichen Angaben, erfindest nichts hinzu und antwortest "
        "strikt im geforderten Format."
    )
    try:
        response = await asyncio.wait_for(
            build_default_router().complete(
                LLMRequest(prompt=prompt, system_prompt=system_prompt, max_tokens=180, temperature=0.1)
            ),
            timeout=AI_DEADLINE_SECONDS,
        )
        text = (response.text or "").strip()
    except Exception:
        return {"category": category, "topics": topics, "summary": summary, "aiUsed": False}
    ai_category = category
    ai_topics = topics
    ai_summary = summary
    for line in text.splitlines():
        lowered = line.lower().strip()
        if lowered.startswith("kategorie:"):
            value = line.split(":", 1)[1].strip().lower()
            if value in CATEGORY_VALUES:
                ai_category = value
        elif lowered.startswith("themen:"):
            values = [t.strip() for t in line.split(":", 1)[1].split(",") if t.strip()]
            if values:
                ai_topics = values[:5]
        elif lowered.startswith("zusammenfassung:"):
            value = _clean_text(line.split(":", 1)[1], 320)
            if value:
                ai_summary = value
    return {"category": ai_category, "topics": ai_topics, "summary": ai_summary, "aiUsed": True}


def _links_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    links = doc.get("socialLinks")
    if not isinstance(links, list):
        links = []
        doc["socialLinks"] = links
    return links


async def _check_and_import(link: dict[str, Any]) -> None:
    """Fuellt Status + oeffentliche Infos + KI-Zusammenfassung fuer einen Link."""
    parsed = urlparse(link["url"])
    host = parsed.hostname or ""
    suspicious = _suspicious_reason(link["url"], parsed)
    if suspicious:
        link.update({"status": "suspicious", "statusDetail": suspicious, "importStatus": "blocked"})
        return
    public = await asyncio.to_thread(_resolves_public, host)
    if not public:
        link.update({
            "status": "suspicious",
            "statusDetail": "Host nicht oeffentlich aufloesbar - Import blockiert.",
            "importStatus": "blocked",
        })
        return
    status, meta = await _fetch_public_meta(link["url"])
    link["lastCheckedAt"] = _now_ms()
    if status == "unreachable":
        link.update({
            "status": "broken",
            "statusDetail": "Seite nicht erreichbar oder Link kaputt.",
            "importStatus": "failed",
        })
        return
    enriched = await _ai_enrich(link["platform"], link.get("username", ""), meta)
    display = _clean_text(meta.get("title"), 160)
    link.update({
        "status": "ok" if status == "ok" else "limited",
        "statusDetail": (
            "Oeffentliche Infos importiert."
            if status == "ok"
            else "Erreichbar, aber die Plattform gibt ohne Login kaum oeffentliche Infos frei."
        ),
        "importStatus": "imported" if status == "ok" else "partial",
        "displayName": display or link.get("displayName") or link.get("username") or "",
        "bio": _clean_text(meta.get("description"), 500),
        "imageUrl": _clean_text(meta.get("image"), 400),
        "language": _clean_text(meta.get("locale"), 20),
        "category": enriched["category"],
        "topics": enriched["topics"],
        "summary": enriched["summary"],
        "aiUsed": bool(enriched.get("aiUsed")),
        "publicLinks": [],
        "source": "og-meta",
    })


@router.get("/social/links")
def list_social_links(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    return {"links": _links_of(doc), "limits": {"maxLinks": MAX_LINKS}}


@router.post("/social/links")
async def add_social_link(request: Request, payload: SocialLinkCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    links = _links_of(doc)
    if len(links) >= MAX_LINKS:
        return _error(409, "social_limit", f"Maximal {MAX_LINKS} Social-Media-Links pro Konto.")
    raw = payload.url.strip()
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = "https://" + raw
    raw_reason = _suspicious_reason(raw, urlparse(raw))
    url = _normalize_url(payload.url)
    parsed = urlparse(url)
    if not parsed.hostname or "." not in parsed.hostname:
        return _error(422, "social_invalid", "Bitte einen gueltigen Link eingeben.")
    if any(item.get("url") == url for item in links):
        return _error(409, "social_duplicate", "Dieser Link ist bereits gespeichert.")
    platform = _detect_platform(parsed.hostname)
    now = _now_ms()
    link: dict[str, Any] = {
        "id": f"social-{uuid.uuid4().hex[:12]}",
        "url": url,
        "platform": platform,
        "username": _username_from_url(platform, parsed.path or ""),
        "displayName": "",
        "bio": "",
        "imageUrl": "",
        "language": "",
        "category": "",
        "topics": [],
        "publicLinks": [],
        "summary": "",
        "status": "pending",
        "statusDetail": "",
        "importStatus": "pending",
        "lastCheckedAt": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    if raw_reason:
        link.update({"status": "suspicious", "statusDetail": raw_reason, "importStatus": "blocked"})
    else:
        await _check_and_import(link)
    link["updatedAt"] = _now_ms()
    links.append(link)
    user_store.save_user_doc(sub, doc)
    return {"link": link}


@router.post("/social/links/{link_id}/recheck")
async def recheck_social_link(request: Request, link_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    link = next((item for item in _links_of(doc) if item.get("id") == link_id), None)
    if not link:
        return _error(404, "social_not_found", "Link nicht gefunden.")
    await _check_and_import(link)
    link["updatedAt"] = _now_ms()
    user_store.save_user_doc(sub, doc)
    return {"link": link}


@router.patch("/social/links/{link_id}")
def patch_social_link(request: Request, link_id: str, patch: SocialLinkPatch) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    link = next((item for item in _links_of(doc) if item.get("id") == link_id), None)
    if not link:
        return _error(404, "social_not_found", "Link nicht gefunden.")
    if patch.displayName is not None:
        link["displayName"] = _clean_text(patch.displayName, 160)
    if patch.category is not None and patch.category in CATEGORY_VALUES:
        link["category"] = patch.category
    if patch.bio is not None:
        link["bio"] = _clean_text(patch.bio, 500)
    if patch.topics is not None:
        link["topics"] = [_clean_text(t, 40) for t in patch.topics if _clean_text(t, 40)][:5]
    if patch.summary is not None:
        link["summary"] = _clean_text(patch.summary, 320)
    link["updatedAt"] = _now_ms()
    user_store.save_user_doc(sub, doc)
    return {"link": link}


@router.delete("/social/links/{link_id}")
def delete_social_link(request: Request, link_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    links = _links_of(doc)
    remaining = [item for item in links if item.get("id") != link_id]
    if len(remaining) == len(links):
        return _error(404, "social_not_found", "Link nicht gefunden.")
    doc["socialLinks"] = remaining
    user_store.save_user_doc(sub, doc)
    return {"ok": True}

