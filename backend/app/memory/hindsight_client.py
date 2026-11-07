"""
Hindsight Cloud Client with Local Fallback Engine.
Provides a unified interface for Retain, Recall, and Reinforce.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
import httpx

from app.config import settings
from app.models.schemas import HindsightMemoryRecord, IncidentFingerprint
from app.memory.local_memory_store import memory_store

logger = logging.getLogger("memops.hindsight")


class HindsightClient:
    def __init__(self):
        self.api_key = settings.HINDSIGHT_API_KEY
        self.api_url = settings.HINDSIGHT_API_URL
        self.is_cloud_enabled = bool(self.api_key)
        self.local_store = memory_store

    async def recall(
        self,
        fingerprint: IncidentFingerprint,
        min_threshold: Optional[float] = None,
    ) -> Optional[Tuple[HindsightMemoryRecord, float]]:
        """
        Recall matching past incidents from Hindsight Memory.
        Uses Cloud API if configured; falls back gracefully to local vector store.
        """
        threshold = min_threshold or settings.MEMORY_SIMILARITY_THRESHOLD

        if self.is_cloud_enabled:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(
                        f"{self.api_url}/recall",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=fingerprint.model_dump(mode="json"),
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("match"):
                            record = HindsightMemoryRecord.model_validate(data["match"])
                            score = float(data.get("similarity_score", 0.9))
                            return record, score
            except Exception as e:
                logger.warning(f"Hindsight Cloud recall failed ({e}). Falling back to local store.")

        # Local semantic store recall
        return self.local_store.recall(fingerprint, min_threshold=threshold)

    async def retain(self, record: HindsightMemoryRecord) -> str:
        """
        Retain an incident and its verified solution in Hindsight.
        """
        # Always retain locally
        local_id = self.local_store.retain(record)

        if self.is_cloud_enabled:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    await client.post(
                        f"{self.api_url}/retain",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=record.model_dump(mode="json"),
                    )
            except Exception as e:
                logger.warning(f"Hindsight Cloud retain sync failed ({e}). Stored locally.")

        return local_id

    async def reinforce(self, incident_id: str, success: bool = True) -> float:
        """
        Reinforce memory confidence score after outcome verification.
        """
        score = self.local_store.reinforce(incident_id, success=success)

        if self.is_cloud_enabled:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.post(
                        f"{self.api_url}/reinforce",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json={"incident_id": incident_id, "success": success},
                    )
            except Exception as e:
                logger.warning(f"Hindsight Cloud reinforce sync failed: {e}")

        return score

    def get_all(self) -> List[HindsightMemoryRecord]:
        return self.local_store.get_all()

    def get_stats(self) -> Dict[str, Any]:
        stats = self.local_store.get_stats()
        stats["engine_mode"] = "Hindsight Cloud (Connected)" if self.is_cloud_enabled else "Hindsight Local Engine (Embedded)"
        return stats


# Global client instance
hindsight = HindsightClient()
