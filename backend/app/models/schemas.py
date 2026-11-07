"""
Data models and schemas for MemOps SRE.
Represents incidents, fingerprints, memory records, remediations, and cluster state.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import uuid


class ServiceStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    RECOVERING = "recovering"


class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentFingerprint(BaseModel):
    service_name: str
    error_class: str
    root_exception: str
    call_stack_hash: str
    normalized_signature: str
    config_snapshot: Dict[str, Any] = Field(default_factory=dict)
    env_metrics: Dict[str, Any] = Field(default_factory=dict)


class RemediationAction(BaseModel):
    action_type: str = "config_patch"  # config_patch, container_restart, pool_resize, rollback
    target_service: str
    target_file: Optional[str] = None
    diff_patch: Optional[str] = None
    command: Optional[str] = None
    pr_reference: Optional[str] = None
    runbook_summary: str


class ValidationOutcome(BaseModel):
    resolved: bool = False
    verify_duration_seconds: float = 0.0
    health_check_endpoints: List[str] = Field(default_factory=list)
    human_approved: bool = False
    verified_at: Optional[datetime] = None
    metrics_delta: Dict[str, Any] = Field(default_factory=dict)


class HindsightMemoryRecord(BaseModel):
    incident_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    title: str
    service_name: str
    fingerprint: IncidentFingerprint
    embedding: Optional[List[float]] = None
    natural_language_summary: str
    root_cause_analysis: str
    remediation: RemediationAction
    outcome: ValidationOutcome
    confidence_score: float = 0.85
    recall_count: int = 0
    last_recalled_at: Optional[datetime] = None


class IncidentTriageResult(BaseModel):
    incident_id: str
    service_name: str
    severity: IncidentSeverity
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_error: str
    fingerprint: IncidentFingerprint
    is_known_pattern: bool
    similarity_score: float
    matched_memory_id: Optional[str] = None
    historical_reference: Optional[str] = None
    analysis_source: str  # "hindsight_memory_recall" or "claude_deep_reasoning"
    root_cause: str
    proposed_remediation: RemediationAction
    explanation: str
    status: str = "pending_approval"  # pending_approval, approved, applied, verified, rejected


class ChaosTriggerRequest(BaseModel):
    scenario: str  # "postgres_pool_exhaustion", "docker_oom_leak", "bad_staging_deploy"
    target_service: Optional[str] = None
    intensity: float = 1.0


class ServiceNode(BaseModel):
    id: str
    name: str
    type: str  # "gateway", "service", "database", "cache"
    status: ServiceStatus = ServiceStatus.HEALTHY
    health_score: float = 100.0
    active_connections: int = 0
    latency_ms: float = 15.0
    error_rate: float = 0.0
    dependencies: List[str] = Field(default_factory=list)
