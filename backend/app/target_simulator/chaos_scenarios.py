"""
Chaos and Fault Injection Scenarios for MemOps SRE.
Simulates realistic failure modes in target Docker microservices and databases.
"""

from typing import Dict, Any


SCENARIO_POSTGRES_POOL = {
    "scenario_id": "postgres_pool_exhaustion",
    "name": "PostgreSQL Connection Pool Exhaustion",
    "target_service": "postgres-db",
    "affected_services": ["order-service", "auth-service"],
    "raw_log": """[2026-11-07 14:32:01] ERROR [order-service] [sqlalchemy.pool.impl.QueuePool] Exception during reset or checkout
Traceback (most recent call last):
  File "/app/venv/lib/python3.11/site-packages/sqlalchemy/pool/base.py", line 755, in _checkout
    fairy = self._pool.get(block=True, timeout=10.0)
  File "/app/venv/lib/python3.11/site-packages/sqlalchemy/pool/impl.py", line 144, in get
    raise TimeoutError(f"QueuePool limit of size {self.size()} overflow {self.overflow()} reached, connection timed out, timeout {self._timeout}")
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached, connection timed out, timeout 10.00

The above exception was the direct cause of the following exception:
Traceback (most recent call last):
  File "/app/services/order_service.py", line 84, in create_order
    with db_session() as session:
  File "/app/database.py", line 32, in db_session
    conn = engine.connect()
psycopg2.OperationalError: FATAL: remaining connection slots are reserved for non-replication superuser connections
""",
    "config_snapshot": {
        "max_connections": 20,
        "pool_size": 5,
        "max_overflow": 0,
        "pool_timeout": 10,
    },
    "metrics": {
        "active_conns": 20,
        "waiting_threads": 64,
        "db_latency_ms": 3450.0,
        "error_rate": 0.88,
    },
}


SCENARIO_DOCKER_OOM = {
    "scenario_id": "docker_oom_leak",
    "name": "Docker Container Memory Leak (Exit 137)",
    "target_service": "order-service",
    "affected_services": ["api-gateway"],
    "raw_log": """[2026-11-07 14:35:12] CRITICAL [dockerd] container 8a2f9b1c73e0 oom-kill event detected
Kernel: Task in /docker/8a2f9b1c73e0 killed as a result of limit of /docker/8a2f9b1c73e0
Memory cgroup out of memory: Kill process 28419 (python) score 1002 or sacrifice child
Killed process 28419 (python) total-vm:1048576kB, anon-rss:524288kB, file-rss:1280kB
docker-compose: container order-service exited with status 137
""",
    "config_snapshot": {
        "mem_limit": "512M",
        "batch_chunk_size": 10000,
    },
    "metrics": {
        "memory_usage_pct": 100.0,
        "container_status": "dead",
        "latency_ms": 9999.0,
        "error_rate": 1.0,
    },
}


SCENARIO_STAGING_DEPLOY_FAIL = {
    "scenario_id": "bad_staging_deploy",
    "name": "Faulty Staging Deployment (Missing Retry Timeout)",
    "target_service": "payment-service",
    "affected_services": ["order-service"],
    "raw_log": """[2026-11-07 14:38:40] ERROR [payment-service] [httpx.AsyncClient] Gateway timeout connecting to processor
Traceback (most recent call last):
  File "/app/services/payment.py", line 112, in process_transaction
    resp = await client.post("https://mock-gateway.internal/charge", timeout=None)
asyncio.exceptions.TimeoutError: Upstream gateway hung indefinitely with no socket timeout. Thread worker starved.
""",
    "config_snapshot": {
        "commit_hash": "a8f309d",
        "author": "dev-staging",
        "http_timeout": "infinite",
    },
    "metrics": {
        "blocked_workers": 32,
        "latency_ms": 60000.0,
        "error_rate": 0.95,
    },
}


CHAOS_CATALOG: Dict[str, Dict[str, Any]] = {
    "postgres_pool_exhaustion": SCENARIO_POSTGRES_POOL,
    "docker_oom_leak": SCENARIO_DOCKER_OOM,
    "bad_staging_deploy": SCENARIO_STAGING_DEPLOY_FAIL,
}
