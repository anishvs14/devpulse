import asyncio
import contextlib
import logging
import time

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.api.v1.ws import manager
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.redis import REALTIME_CHANNEL, get_redis

setup_logging()
logger = logging.getLogger("devpulse.api")
settings = get_settings()


async def _redis_listener() -> None:
    client = get_redis()
    pubsub = client.pubsub()
    await pubsub.subscribe(REALTIME_CHANNEL)
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        await manager.broadcast(message["data"])


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_redis_listener())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(
    title=settings.project_name,
    description="A mini PagerDuty/Opsgenie-style engineering incident & service management platform.",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "health", "description": "Liveness/readiness checks."},
        {"name": "auth", "description": "Registration and JWT login."},
        {"name": "users", "description": "The authenticated user and (admin-only) the user list."},
        {"name": "services", "description": "Monitored services — health status and metadata."},
        {"name": "incidents", "description": "Incident lifecycle: CRUD, status workflow, assignment, comments, timeline, postmortems."},
        {"name": "alerts", "description": "Alert ingestion from external monitors and the resulting alert log."},
        {"name": "dashboard", "description": "Aggregate metrics across incidents."},
        {"name": "websocket", "description": "Real-time push of alert/incident/service events."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info("%s %s -> 500 (%.1fms) [unhandled]", request.method, request.url.path, duration_ms)
        raise  # re-raise so the handler below still produces the response
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %d (%.1fms)", request.method, request.url.path, response.status_code, duration_ms
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Every expected error path already raises HTTPException with its own
    # status/detail (404s, 403s, 409s, etc.) and never reaches this handler —
    # FastAPI resolves handlers by exact exception type first, so this only
    # catches genuine bugs. The client gets a plain message; the real
    # traceback still goes to the server log via logger.exception.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)