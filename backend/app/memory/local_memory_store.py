"""
Persistent Memory Store for MemOps SRE (Hindsight Memory Engine).
Provides persistent vector-like and semantic recall with confidence reinforcement,
even when offline or running without external cloud dependencies.
"""

import json
import logging
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from app.config import settings
from app.models.schemas import (
    HindsightMemoryRecord,
    IncidentFingerprint,
    RemediationAction,
    ValidationOutcome,
)

logger = logging.getLogger("memops.memory")


class LocalMemoryStore:
    def __init__(self, storage_path: Optional[Path] = None):
        self.storage_path = storage_path or settings.MEMORY_DB_PATH
        self.records: Dict[str, HindsightMemoryRecord] = {}
        self._load_or_seed()

    def _tokenize(self, text: str) -> set[str]:
        """Normalize text into lowercase alphanumeric tokens."""
        clean = re.sub(r"[^a-zA-Z0-9_\-\.]", " ", text.lower())
        return {tok for tok in clean.split() if len(tok) > 2}

    def _compute_cosine_sim(self, text_a: str, text_b: str) -> float:
        """Compute token-frequency cosine similarity between two texts."""
        tokens_a = self._tokenize(text_a)
        tokens_b = self._tokenize(text_b)
        if not tokens_a or not tokens_b:
            return 0.0
        
        intersection = tokens_a.intersection(tokens_b)
        if not intersection:
            return 0.0
        
        return len(intersection) / math.sqrt(len(tokens_a) * len(tokens_b))

    def _compute_jaccard_sim(self, tokens_a: set[str], tokens_b: set[str]) -> float:
        """Compute Jaccard similarity between two token sets."""
        if not tokens_a or not tokens_b:
            return 0.0
        union = tokens_a.union(tokens_b)
        intersection = tokens_a.intersection(tokens_b)
        return len(intersection) / len(union)

    def calculate_match_score(
        self,
        live_fingerprint: IncidentFingerprint,
        hist_record: HindsightMemoryRecord,
    ) -> float:
        """
        Calculates MatchScore = w1 * CosineSim + w2 * Jaccard + w3 * ServiceMatch
        Weights: w1 = 0.60, w2 = 0.25, w3 = 0.15
        """
        w1, w2, w3 = 0.60, 0.25, 0.15
        
        # 1. Cosine similarity on normalized signature and error class
        live_text = f"{live_fingerprint.error_class} {live_fingerprint.root_exception} {live_fingerprint.normalized_signature}"
        hist_text = f"{hist_record.fingerprint.error_class} {hist_record.fingerprint.root_exception} {hist_record.fingerprint.normalized_signature}"
        cosine_sim = self._compute_cosine_sim(live_text, hist_text)

        # 2. Jaccard similarity on stack frame tokens
        live_tokens = self._tokenize(live_fingerprint.call_stack_hash)
        hist_tokens = self._tokenize(hist_record.fingerprint.call_stack_hash)
        jaccard_sim = self._compute_jaccard_sim(live_tokens, hist_tokens)

        # 3. Exact or related service match
        service_match = 1.0 if live_fingerprint.service_name == hist_record.service_name else 0.3

        raw_score = (w1 * cosine_sim) + (w2 * jaccard_sim) + (w3 * service_match)
        return min(max(raw_score, 0.0), 1.0)

    def recall(
        self,
        fingerprint: IncidentFingerprint,
        min_threshold: float = 0.60,
    ) -> Optional[Tuple[HindsightMemoryRecord, float]]:
        """
        Search memory for highest matching historical incident.
        Returns (record, similarity_score) if above threshold, else None.
        """
        best_match: Optional[HindsightMemoryRecord] = None
        best_score = 0.0

        for record in self.records.values():
            score = self.calculate_match_score(fingerprint, record)
            if score > best_score:
                best_score = score
                best_match = record

        if best_match and best_score >= min_threshold:
            # Update recall stats
            best_match.recall_count += 1
            best_match.last_recalled_at = datetime.now(timezone.utc)
            self._save()
            return best_match, round(best_score, 3)

        return None

    def retain(self, record: HindsightMemoryRecord) -> str:
        """Store or update a memory record in Hindsight."""
        self.records[record.incident_id] = record
        self._save()
        logger.info(f"Retained incident {record.incident_id} in Hindsight memory.")
        return record.incident_id

    def reinforce(self, incident_id: str, success: bool = True) -> float:
        """Reinforce confidence score following a verified live outcome."""
        if incident_id not in self.records:
            return 0.0

        record = self.records[incident_id]
        if success:
            record.confidence_score = min(0.99, record.confidence_score + settings.CONFIDENCE_BOOST_ON_VERIFY)
            record.outcome.resolved = True
        else:
            record.confidence_score = max(0.10, record.confidence_score - 0.20)
            record.outcome.resolved = False

        self._save()
        return record.confidence_score

    def get_all(self) -> List[HindsightMemoryRecord]:
        return sorted(list(self.records.values()), key=lambda r: r.timestamp, reverse=True)

    def get_stats(self) -> Dict[str, Any]:
        records_list = list(self.records.values())
        total = len(records_list)
        verified = sum(1 for r in records_list if r.outcome.resolved)
        total_recalls = sum(r.recall_count for r in records_list)
        avg_confidence = sum(r.confidence_score for r in records_list) / max(total, 1)

        return {
            "total_memories": total,
            "verified_solutions": verified,
            "total_recalls_served": total_recalls,
            "average_confidence": round(avg_confidence, 2),
            "estimated_mttr_saved_minutes": total_recalls * 35,  # ~35 mins saved per memory recall
        }

    def _save(self):
        """Persist records to disk."""
        data = {k: v.model_dump(mode="json") for k, v in self.records.items()}
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def _load_or_seed(self):
        """Load from disk or populate with realistic historical baseline data."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, v in data.items():
                        self.records[k] = HindsightMemoryRecord.model_validate(v)
                if self.records:
                    return
            except Exception as e:
                logger.warning(f"Could not load memory file ({e}), reseeding...")

        self._seed_baseline_memories()

    def _seed_baseline_memories(self):
        """Seed realistic historical incident from October 12th as mentioned in problem statement."""
        oct12_incident = HindsightMemoryRecord(
            incident_id="mem-oct12-postgres-conn-exhaust",
            timestamp=datetime(2026, 10, 12, 14, 22, 10, tzinfo=timezone.utc),
            title="PostgreSQL Connection Pool Exhaustion in Staging (Oct 12)",
            service_name="postgres-db",
            fingerprint=IncidentFingerprint(
                service_name="postgres-db",
                error_class="OperationalError",
                root_exception="FATAL: remaining connection slots are reserved for non-replication superuser connections",
                call_stack_hash="impl.py:get:order_service.py:create_order:database.py:db_session:QueuePool:OperationalError:FATAL_CONN_SLOTS",
                normalized_signature="POSTGRES-DB_PSYCOPG2_OPERATIONALERROR_FATAL_REMAININ",
                config_snapshot={"max_connections": 20, "pool_size": 5, "max_overflow": 0, "pool_timeout": 10},
                env_metrics={"active_conns": 20, "waiting_threads": 48},
            ),
            natural_language_summary="High concurrency test depleted SQLAlchemy connection pool without queue buffers, causing cascading 500s across order-service.",
            root_cause_analysis="Default SQLAlchemy QueuePool had max_overflow=0 and pool_size=5 with a 10s timeout. When burst traffic arrived, all connection handles locked waiting for PostgreSQL.",
            remediation=RemediationAction(
                action_type="config_patch",
                target_service="postgres-db",
                target_file="config/database.py",
                diff_patch="""--- a/config/database.py
+++ b/config/database.py
@@ -14,3 +14,5 @@
-    pool_size=5,
-    max_overflow=0,
-    pool_timeout=10,
+    pool_size=20,
+    max_overflow=30,
+    pool_timeout=30,
+    pool_recycle=1800,
""",
                pr_reference="PR #402",
                runbook_summary="Apply connection pool limits and overflow buffers (PR #402). Set pool_size=20, max_overflow=30, pool_timeout=30s.",
            ),
            outcome=ValidationOutcome(
                resolved=True,
                verify_duration_seconds=3.2,
                health_check_endpoints=["/health", "/api/v1/orders/health"],
                human_approved=True,
                metrics_delta={"connection_pool_saturation": "-78%", "p99_latency_ms": "-340ms"},
            ),
            confidence_score=0.95,
            recall_count=2,
            last_recalled_at=datetime(2026, 10, 28, 11, 4, tzinfo=timezone.utc),
        )

        oom_incident = HindsightMemoryRecord(
            incident_id="mem-nov02-order-service-oom",
            timestamp=datetime(2026, 11, 2, 9, 15, 45, tzinfo=timezone.utc),
            title="Order Service Container OOM Kill (Exit 137)",
            service_name="order-service",
            fingerprint=IncidentFingerprint(
                service_name="order-service",
                error_class="ContainerOOMKilled",
                root_exception="Process out of memory: heap allocation failed / Docker killed with status 137",
                call_stack_hash="docker.daemon.oom:order_service.worker.process_batch",
                normalized_signature="DOCKER_CONTAINER_OOM_EXIT_137",
                config_snapshot={"mem_limit": "512M", "batch_chunk_size": 10000},
                env_metrics={"memory_usage_pct": 100.0, "swap_pct": 98.4},
            ),
            natural_language_summary="Unbounded batch query in Order Service loaded 50,000 JSON records into heap memory at once, triggering Linux cgroup OOM killer.",
            root_cause_analysis="Batch order exporter lacked streaming or pagination, attempting to buffer massive customer payloads in a 512MB Docker container.",
            remediation=RemediationAction(
                action_type="config_patch",
                target_service="order-service",
                target_file="services/order_exporter.py",
                diff_patch="""--- a/services/order_exporter.py
+++ b/services/order_exporter.py
@@ -28,2 +28,4 @@
-    records = db.query(Order).all()
-    return json.dumps([r.to_dict() for r in records])
+    # Stream in chunks of 500 records to prevent memory spikes
+    return StreamingResponse(stream_order_chunks(chunk_size=500), media_type="application/json")
""",
                pr_reference="PR #418",
                runbook_summary="Enforce chunked streaming queries (chunk_size=500) and increase container memory limit from 512MB to 1024MB.",
            ),
            outcome=ValidationOutcome(
                resolved=True,
                verify_duration_seconds=4.1,
                health_check_endpoints=["/health"],
                human_approved=True,
            ),
            confidence_score=0.91,
            recall_count=1,
        )

        self.records[oct12_incident.incident_id] = oct12_incident
        self.records[oom_incident.incident_id] = oom_incident
        self._save()


# Singleton instance
memory_store = LocalMemoryStore()
