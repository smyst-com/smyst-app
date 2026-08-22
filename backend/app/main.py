from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.http_client import aclose_shared_client
from app.core.logging import configure_logging
from app.security.middleware import RateLimitMiddleware, SecurityHeadersMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Der geteilte HTTP-Client wird beim ersten Aufruf angelegt; hier wird er
    # nur sauber geschlossen, damit offene Keep-Alive-Verbindungen nicht als
    # Warnung im Log landen.
    yield
    await aclose_shared_client()


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        lifespan=lifespan,
        title="Smyst API",
        version="0.1.0",
        openapi_url=f"/api/{settings.api_version}/openapi.json",
        docs_url=f"/api/{settings.api_version}/docs" if settings.app_env != "production" else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.include_router(api_router, prefix=f"/api/{settings.api_version}")
    app.include_router(api_router, prefix="/api")
    app.include_router(api_router)
    return app


app = create_app()
