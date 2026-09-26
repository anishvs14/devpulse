import asyncio
import contextlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.api.v1.ws import manager
from app.core.config import get_settings
from app.core.redis import REALTIME_CHANNEL, get_redis

settings = get_settings()


async def _redis_listener() -> None:
    """Subscribes to Redis pub/sub and fans every message out to connected
    WebSocket clients. Runs inside the API process; the worker process is the
    one PUBLISHing (see app/workers/alert_worker.py) — pub/sub is what bridges
    them, since they're separate processes with no shared memory."""
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


app = FastAPI(title=settings.project_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)