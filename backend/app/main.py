"""
MemOps SRE Backend Application (FastAPI).
Routes, SSE Event Stream, Chaos Injection, and Static Dashboard Serving.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.models.schemas import ChaosTriggerRequest
from app.memory.hindsight_client import hindsight
from app.target_simulator.mock_cluster import cluster
from app.target_simulator.chaos_scenarios import CHAOS_CATALOG
from app.agents.orchestrator import orchestrator
from app.services.event_bus import event_bus
from app.services.github_service import github_service
from app.services.integrations_service import integrations_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("memops.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}...")
    yield
    logger.info("Shutting down MemOps SRE...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Memory-Augmented Site Reliability Engineering Agent Engine",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST API Endpoints ---

@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "memory_engine": hindsight.get_stats()["engine_mode"],
    }


@app.get("/api/v1/topology")
async def get_topology():
    """Retrieve microservice cluster nodes and dependency links."""
    return cluster.get_topology()


@app.get("/api/v1/stream")
async def event_stream(request: Request):
    """Server-Sent Events (SSE) live telemetry stream for dashboard."""
    return StreamingResponse(
        event_bus.subscribe(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/chaos/trigger")
async def trigger_chaos(req: ChaosTriggerRequest):
    """Inject a simulated outage (DB pool exhaustion, OOM leak, or deploy deadlock)."""
    if req.scenario not in CHAOS_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{req.scenario}'")

    scenario = CHAOS_CATALOG[req.scenario]

    # Ingest incident through the MemOps SRE brain
    triage_result = await orchestrator.ingest_and_triage(
        raw_log=scenario["raw_log"],
        service_name=scenario["target_service"],
        config_snapshot=scenario.get("config_snapshot"),
        metrics=scenario.get("metrics"),
    )

    return {
        "success": True,
        "scenario": scenario["name"],
        "triage": triage_result,
    }


@app.post("/api/v1/chaos/reset")
async def reset_chaos():
    """Restore all services to healthy green state."""
    await cluster.reset_all()
    orchestrator.active_incidents.clear()
    return {"success": True, "message": "Cluster reset to healthy state."}


@app.post("/api/v1/incidents/ingest")
async def ingest_incident(payload: Dict[str, Any]):
    """Ingest custom error trace or stack dump."""
    raw_log = payload.get("raw_log")
    if not raw_log:
        raise HTTPException(status_code=400, detail="Missing required field 'raw_log'")

    triage_result = await orchestrator.ingest_and_triage(
        raw_log=raw_log,
        service_name=payload.get("service_name"),
        config_snapshot=payload.get("config_snapshot"),
        metrics=payload.get("metrics"),
    )
    return triage_result


@app.get("/api/v1/incidents/active")
async def get_active_incidents():
    """Get active incidents awaiting human approval."""
    return list(orchestrator.active_incidents.values())


@app.get("/api/v1/incidents/history")
async def get_incident_history():
    """Get resolved incident history."""
    return orchestrator.resolved_incidents


@app.post("/api/v1/incidents/{incident_id}/remediate")
async def remediate_incident(incident_id: str):
    """Human-in-the-loop: Approve and apply proposed fix."""
    try:
        result = await orchestrator.execute_remediation(incident_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/v1/incidents/{incident_id}/reject")
async def reject_incident(incident_id: str):
    """Human-in-the-loop: Reject proposed fix."""
    try:
        result = await orchestrator.reject_remediation(incident_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/memory/records")
async def get_memory_records():
    """List all stored Hindsight memory records."""
    return hindsight.get_all()


@app.get("/api/v1/memory/stats")
async def get_memory_stats():
    """Get Hindsight memory performance and MTTR reduction statistics."""
    return hindsight.get_stats()


# --- GitHub Live Integration Endpoints ---

@app.post("/api/v1/github/connect")
async def connect_github_repo(request: Request):
    """Connect a GitHub repository to stream live issues, errors, and metadata."""
    payload = await request.json()
    repo = payload.get("repo", "mohammadhassan07/Hack-with-Bengaluru")
    token = payload.get("token")
    result = await github_service.connect(repo=repo, token=token)
    return result


@app.get("/api/v1/github/status")
async def get_github_status():
    """Get status of the connected GitHub repository."""
    return github_service.get_status()


@app.get("/api/v1/github/issues")
async def get_github_issues():
    """Get monitored issues and error reports from the connected repository."""
    return github_service.get_issues()


@app.post("/api/v1/github/triage/{issue_number}")
async def triage_github_issue(issue_number: int):
    """Trigger SRE ingestion and autonomous remediation on a GitHub issue."""
    try:
        result = await github_service.triage_issue(issue_number)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/v1/github/create-issue")
async def create_github_issue(request: Request):
    """Simulate or report an incident issue on the repository."""
    payload = await request.json()
    title = payload.get("title", "[OUTAGE] Microservice Connection Failure")
    service_name = payload.get("service_name", "postgres-db")
    error_log = payload.get("error_log", "Connection pool exhaustion detected.")
    result = await github_service.create_issue_simulation(title, service_name, error_log)
    return result


@app.get("/api/v1/integrations/status")
async def get_integrations_status():
    """Get honest connectivity status of external tools (Docker, K8s, APM, GitHub)."""
    return integrations_service.check_all_tools(github_service.repo)


@app.post("/api/v1/incidents/analyze-raw-log")
async def analyze_raw_log(request: Request):
    """Analyze real user-pasted log/stacktrace without fake mock data."""
    payload = await request.json()
    raw_log = payload.get("raw_log", "").strip()
    service_name = payload.get("service_name")
    if not raw_log:
        raise HTTPException(status_code=400, detail="Empty log content provided.")
    
    result = await orchestrator.ingest_and_triage(
        raw_log=raw_log,
        service_name=service_name,
    )
    return {"status": "triaged", "triage_result": result.model_dump()}


# Mount frontend static files if folder exists
if settings.FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=settings.FRONTEND_DIR), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(settings.FRONTEND_DIR / "index.html")
