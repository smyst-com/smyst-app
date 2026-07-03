from fastapi import APIRouter

from app.api.v1.routes.ai import router as ai_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.auth_account import router as auth_account_router
from app.api.v1.routes.auth_email import router as auth_email_router
from app.api.v1.routes.chat import router as chat_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.public_twins import router as public_twins_router
from app.api.v1.routes.security import router as security_router
from app.api.v1.routes.storage import router as storage_router
from app.api.v1.routes.tts import router as tts_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(auth_account_router)
api_router.include_router(auth_email_router)
api_router.include_router(health_router)
api_router.include_router(public_twins_router)
api_router.include_router(ai_router)
api_router.include_router(chat_router)
api_router.include_router(security_router)
api_router.include_router(storage_router)
api_router.include_router(tts_router)
