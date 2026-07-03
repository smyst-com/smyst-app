from fastapi import APIRouter
from fastapi.responses import RedirectResponse

# Oeffentliche Profil-Daten werden statisch ueber GitHub Pages ausgeliefert
# (Single Source: smyst.com). Salad leitet nur weiter, statt 404 zu liefern.
router = APIRouter(prefix="/public", tags=["public"])

STATIC_BASE = "https://smyst.com/api/public"


@router.get("/twins")
def list_public_twins() -> RedirectResponse:
    return RedirectResponse(f"{STATIC_BASE}/twins/", status_code=307)


@router.get("/twins/{slug}")
def get_public_twin(slug: str) -> RedirectResponse:
    safe_slug = ''.join(ch for ch in slug if ch.isalnum() or ch == '-')[:120]
    return RedirectResponse(f"{STATIC_BASE}/twins/{safe_slug}/", status_code=307)
