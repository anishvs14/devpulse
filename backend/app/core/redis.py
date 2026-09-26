import json

import redis.asyncio as redis

from app.core.config import get_settings

ALERT_QUEUE_KEY = "devpulse:alerts:queue"
REALTIME_CHANNEL = "devpulse:realtime"

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """One connection-pooled client per process — cheap to call repeatedly."""
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


async def publish_event(event_type: str, data: dict) -> None:
    client = get_redis()
    await client.publish(REALTIME_CHANNEL, json.dumps({"type": event_type, "data": data}))