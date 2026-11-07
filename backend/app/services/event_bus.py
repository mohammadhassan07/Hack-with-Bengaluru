"""
Real-time Event Bus for Server-Sent Events (SSE).
Streams live agent decisions, topology shifts, and memory recalls to the frontend.
"""

import asyncio
import json
import logging
from typing import AsyncGenerator, Set

logger = logging.getLogger("memops.events")


class EventBus:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    async def subscribe(self) -> AsyncGenerator[str, None]:
        """Subscribe to the SSE event stream."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            # Yield initial connection heartbeat
            yield f"event: ping\ndata: {json.dumps({'status': 'connected'})}\n\n"
            while True:
                data = await queue.get()
                yield data
        except asyncio.CancelledError:
            pass
        finally:
            self._subscribers.discard(queue)

    async def publish(self, event_type: str, payload: dict):
        """Broadcast an event to all connected dashboard clients."""
        formatted = f"event: {event_type}\ndata: {json.dumps(payload, default=str)}\n\n"
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(formatted)
            except asyncio.QueueFull:
                logger.warning("Subscriber queue full; dropping frame.")


event_bus = EventBus()
