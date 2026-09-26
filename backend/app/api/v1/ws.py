import uuid

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.user import User

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)

    async def broadcast(self, message: str) -> None:
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def _authenticate(token: str | None) -> User | None:
    if token is None:
        return None
    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
    except jwt.PyJWTError:
        return None

    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id_str))
    return user if (user is not None and user.is_active) else None


@router.websocket("/updates")
async def websocket_updates(websocket: WebSocket, token: str | None = None):
    # Browsers' native WebSocket API can't set an Authorization header on the
    # handshake, so the JWT travels as a query param instead — the standard
    # workaround. (A first-message auth scheme would keep it out of server
    # access logs; noted as a follow-up, not done here for simplicity.)
    user = await _authenticate(token)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keeps the loop alive to detect disconnects
    except WebSocketDisconnect:
        manager.disconnect(websocket)