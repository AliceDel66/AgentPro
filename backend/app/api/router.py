from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.models.router import router as models_router
from app.modules.requirements.router import router as requirements_router
from app.modules.runner.router import router as runner_router

api_router = APIRouter()
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(health_router, tags=["health"])
api_router.include_router(models_router, tags=["models"])
api_router.include_router(requirements_router, tags=["requirements"])
api_router.include_router(runner_router, tags=["runner"])
