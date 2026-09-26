from fastapi import APIRouter

from app.api.v1 import alerts, auth, health, incidents, services, users, ws

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(services.router, prefix="/services", tags=["services"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(ws.router, prefix="/ws", tags=["websocket"])