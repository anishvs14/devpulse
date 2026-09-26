# backend/listen_ws.py
import asyncio
import sys
import websockets

async def listen():
    token = sys.argv[1]
    uri = f"ws://localhost:8000/api/v1/ws/updates?token={token}"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print(" Connected to WebSocket stream! Waiting for events...\n")
        while True:
            msg = await ws.recv()
            print(f"[WS EVENT RECEIVED]:\n{msg}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python listen_ws.py <JWT_TOKEN>")
        sys.exit(1)
    asyncio.run(listen())