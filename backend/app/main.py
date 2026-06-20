from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.version import APP_VERSION


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="AgentPro API",
        version=APP_VERSION,
        docs_url="/docs" if settings.docs_effective else None,
        redoc_url="/redoc" if settings.docs_effective else None,
        openapi_url="/openapi.json" if settings.docs_effective else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
