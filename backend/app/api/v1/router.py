from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
# future: api_router.include_router(auth.router, prefix="/auth", tags=["auth"])