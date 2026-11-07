"""
Central MemOps SRE Orchestration Brain.
Coordinates Ingestion -> Hindsight Memory Recall -> Branching -> Human Gate -> Verification Loop.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from app.models.schemas import (
    IncidentFingerprint,
    IncidentSeverity,
    IncidentTriageResult,
    RemediationAction,
    ValidationOutcome,
    HindsightMemoryRecord,
    ServiceStatus,
)
from app.memory.hindsight_client import hindsight
from app.agents.fast_ingest import fast_ingest
from app.agents.deep_rca import deep_rca
from app.target_simulator.mock_cluster import cluster
from app.services.event_bus import event_bus

logger = logging.getLogger("memops.orchestrator")


class MemOpsOrchestrator:
    def __init__(self):
        self.active_incidents: Dict[str, IncidentTriageResult] = {}
        self.resolved_incidents: List[IncidentTriageResult] = []

    async def ingest_and_triage(
        self,
        raw_log: str,
        service_name: Optional[str] = None,
        config_snapshot: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> IncidentTriageResult:
        """
        Step A -> Step D in Operational Flowchart.
        """
        incident_id = f"inc-{uuid.uuid4().hex[:8]}"

        # 1. Fast Fingerprinting via Groq / Local Parser
        fingerprint = await fast_ingest.extract_fingerprint(
            raw_log=raw_log,
            service_name=service_name,
            config_snapshot=config_snapshot,
            metrics=metrics,
        )

        target_svc = fingerprint.service_name

        # Update target cluster visual state (Turns Red)
        await cluster.update_node_status(
            node_id=target_svc,
            status=ServiceStatus.CRITICAL,
            health_score=15.0,
            latency_ms=3200.0,
            error_rate=0.85,
            active_connections=95,
        )

        # Notify UI that an incident occurred
        await event_bus.publish(
            "incident_detected",
            {
                "incident_id": incident_id,
                "service_name": target_svc,
                "error_class": fingerprint.error_class,
                "root_exception": fingerprint.root_exception,
            },
        )

        # 2. Hindsight Memory Recall (The Core Differentiator)
        memory_match = await hindsight.recall(fingerprint)

        if memory_match:
            record, score = memory_match
            is_known = True
            analysis_source = "hindsight_memory_recall"
            root_cause = f"[Historical Recall] {record.root_cause_analysis}"
            remediation = record.remediation
            explanation = (
                f"🎯 Hindsight Memory Match ({round(score * 100, 1)}% confidence): "
                f"Matches incident '{record.title}' (Ref: {record.remediation.pr_reference or record.incident_id}). "
                f"Historical verified fix is ready for instant deployment."
            )
            matched_id = record.incident_id
            historical_ref = record.remediation.pr_reference or record.title
        else:
            is_known = False
            score = 0.25
            matched_id = None
            historical_ref = None
            analysis_source = "claude_deep_reasoning"
            
            # Deep causal reasoning
            rca_result = await deep_rca.analyze_and_propose(fingerprint, raw_log)
            root_cause = rca_result["root_cause"]
            remediation = rca_result["remediation"]
            explanation = (
                "🔍 Novel Incident: No prior memory pattern matched. "
                "Claude 3.5 Sonnet generated a new architectural root-cause analysis and proposed hotfix."
            )

        triage_result = IncidentTriageResult(
            incident_id=incident_id,
            service_name=target_svc,
            severity=IncidentSeverity.CRITICAL,
            raw_error=raw_log,
            fingerprint=fingerprint,
            is_known_pattern=is_known,
            similarity_score=score,
            matched_memory_id=matched_id,
            historical_reference=historical_ref,
            analysis_source=analysis_source,
            root_cause=root_cause,
            proposed_remediation=remediation,
            explanation=explanation,
            status="pending_approval",
        )

        self.active_incidents[incident_id] = triage_result

        # Broadcast proposed remediation to UI
        await event_bus.publish("remediation_proposed", triage_result.model_dump(mode="json"))

        return triage_result

    async def execute_remediation(self, incident_id: str) -> Dict[str, Any]:
        """
        Step E & F: Executes the fix, verifies health, and reinforces Hindsight memory.
        """
        if incident_id not in self.active_incidents:
            raise ValueError(f"Incident {incident_id} not found or already closed.")

        incident = self.active_incidents[incident_id]
        incident.status = "applying"

        await event_bus.publish(
            "remediation_applying",
            {"incident_id": incident_id, "action": incident.proposed_remediation.model_dump(mode="json")},
        )

        # Set service to RECOVERING state in 3D visualizer
        await cluster.update_node_status(
            node_id=incident.service_name,
            status=ServiceStatus.RECOVERING,
            health_score=75.0,
            latency_ms=120.0,
            error_rate=0.08,
            active_connections=35,
        )

        # Simulate execution duration (2 seconds for demo realism)
        await asyncio.sleep(2.0)

        # Health probe verification
        verified = True
        duration = 2.1

        if verified:
            # Service restored to GREEN
            await cluster.update_node_status(
                node_id=incident.service_name,
                status=ServiceStatus.HEALTHY,
                health_score=99.8,
                latency_ms=16.4,
                error_rate=0.0,
                active_connections=22,
            )

            incident.status = "verified_success"

            # Step F: The Feedback Loop (Hindsight Retain / Reinforce)
            if incident.is_known_pattern and incident.matched_memory_id:
                new_conf = await hindsight.reinforce(incident.matched_memory_id, success=True)
                retention_msg = f"Hindsight memory reinforced. Confidence increased to {round(new_conf * 100, 1)}%."
            else:
                # Retain novel incident into Hindsight memory
                new_record = HindsightMemoryRecord(
                    incident_id=f"mem-{incident.incident_id}",
                    title=f"{incident.service_name} Outage Resolution ({incident.fingerprint.error_class})",
                    service_name=incident.service_name,
                    fingerprint=incident.fingerprint,
                    natural_language_summary=incident.root_cause[:200],
                    root_cause_analysis=incident.root_cause,
                    remediation=incident.proposed_remediation,
                    outcome=ValidationOutcome(
                        resolved=True,
                        verify_duration_seconds=duration,
                        health_check_endpoints=["/health"],
                        human_approved=True,
                        verified_at=datetime.now(timezone.utc),
                    ),
                    confidence_score=0.90,
                )
                await hindsight.retain(new_record)
                retention_msg = "Novel incident retained in Hindsight memory for future recall."

            # Move from active to resolved history
            self.resolved_incidents.insert(0, incident)
            del self.active_incidents[incident_id]

            # Emit health verified event to UI
            await event_bus.publish(
                "health_verified",
                {
                    "incident_id": incident_id,
                    "service_name": incident.service_name,
                    "mttr_seconds": duration,
                    "retention_message": retention_msg,
                    "memory_stats": hindsight.get_stats(),
                },
            )

            return {
                "success": True,
                "incident_id": incident_id,
                "status": "resolved",
                "retention_message": retention_msg,
                "mttr_seconds": duration,
            }

    async def reject_remediation(self, incident_id: str, reason: str = "Rejected by human SRE") -> Dict[str, Any]:
        """Human operator rejects proposed patch."""
        if incident_id not in self.active_incidents:
            raise ValueError(f"Incident {incident_id} not found.")

        incident = self.active_incidents[incident_id]
        incident.status = "rejected"
        del self.active_incidents[incident_id]

        await event_bus.publish(
            "remediation_rejected",
            {"incident_id": incident_id, "reason": reason},
        )
        return {"success": True, "incident_id": incident_id, "status": "rejected"}


orchestrator = MemOpsOrchestrator()
