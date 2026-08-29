from fastapi import APIRouter

from app.api.v1.routes.admin_approvals import router as admin_approvals_router
from app.api.v1.routes.admin_finance import router as admin_finance_router
from app.api.v1.routes.admin_ideas import router as admin_ideas_router
from app.api.v1.routes.admin_moderation import router as admin_moderation_router
from app.api.v1.routes.admin_overview import router as admin_overview_router
from app.api.v1.routes.admin_quality import router as admin_quality_router
from app.api.v1.routes.admin_registrations import router as admin_registrations_router
from app.api.v1.routes.admin_users import router as admin_users_router
from app.api.v1.routes.admin_versions import router as admin_versions_router
from app.api.v1.routes.ads import router as ads_router
from app.api.v1.routes.ai import router as ai_router
from app.api.v1.routes.asr import router as asr_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.auth_account import router as auth_account_router
from app.api.v1.routes.auth_email import router as auth_email_router
from app.api.v1.routes.billing import router as billing_router
from app.api.v1.routes.chat import router as chat_router
from app.api.v1.routes.ci_gateway import router as ci_gateway_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.public_twins import router as public_twins_router
from app.api.v1.routes.security import router as security_router
from app.api.v1.routes.social_links import router as social_links_router
from app.api.v1.routes.storage import router as storage_router
from app.api.v1.routes.tts import router as tts_router
from app.api.v1.routes.twins_delete import router as twins_delete_router
from app.api.v1.routes.user_mvp import router as user_mvp_router
from app.api.v1.routes.visits import router as visits_router
from app.api.v1.routes.web_research import router as web_research_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(auth_account_router)
api_router.include_router(auth_email_router)
api_router.include_router(health_router)
api_router.include_router(public_twins_router)
api_router.include_router(ai_router)
api_router.include_router(asr_router)
api_router.include_router(chat_router)
api_router.include_router(security_router)
api_router.include_router(social_links_router)
api_router.include_router(storage_router)
api_router.include_router(tts_router)
api_router.include_router(user_mvp_router)
api_router.include_router(twins_delete_router)
api_router.include_router(web_research_router)
api_router.include_router(admin_quality_router)
api_router.include_router(admin_versions_router)
api_router.include_router(admin_overview_router)
api_router.include_router(admin_approvals_router)
api_router.include_router(admin_ideas_router)
api_router.include_router(admin_users_router)
api_router.include_router(admin_registrations_router)
api_router.include_router(admin_moderation_router)
api_router.include_router(admin_finance_router)
api_router.include_router(ads_router)
api_router.include_router(visits_router)
api_router.include_router(billing_router)
api_router.include_router(ci_gateway_router)

