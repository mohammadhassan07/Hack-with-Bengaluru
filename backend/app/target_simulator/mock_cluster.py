"""
Simulated Target Microservice Cluster Topology.
Maintains state and health telemetry for services in the sandbox.
"""

from typing import Dict, List, Any
from app.models.schemas import ServiceNode, ServiceStatus
from app.services.event_bus import event_bus


class MockCluster:
    def __init__(self):
        self.nodes: Dict[str, ServiceNode] = {}
        self.edges: List[Dict[str, str]] = []
        self._init_topology()

    def _init_topology(self):
        """Build the microservice dependency graph."""
        self.nodes = {
            "api-gateway": ServiceNode(
                id="api-gateway",
                name="API Gateway",
                type="gateway",
                status=ServiceStatus.HEALTHY,
                health_score=99.8,
                active_connections=142,
                latency_ms=12.4,
                error_rate=0.01,
                dependencies=["auth-service", "order-service", "payment-service"],
            ),
            "auth-service": ServiceNode(
                id="auth-service",
                name="Auth Service",
                type="service",
                status=ServiceStatus.HEALTHY,
                health_score=100.0,
                active_connections=45,
                latency_ms=18.2,
                error_rate=0.0,
                dependencies=["postgres-db", "redis-cache"],
            ),
            "order-service": ServiceNode(
                id="order-service",
                name="Order Service",
                type="service",
                status=ServiceStatus.HEALTHY,
                health_score=99.2,
                active_connections=88,
                latency_ms=24.5,
                error_rate=0.02,
                dependencies=["postgres-db", "redis-cache"],
            ),
            "payment-service": ServiceNode(
                id="payment-service",
                name="Payment Service",
                type="service",
                status=ServiceStatus.HEALTHY,
                health_score=100.0,
                active_connections=34,
                latency_ms=32.1,
                error_rate=0.0,
                dependencies=["postgres-db"],
            ),
            "postgres-db": ServiceNode(
                id="postgres-db",
                name="PostgreSQL Cluster",
                type="database",
                status=ServiceStatus.HEALTHY,
                health_score=100.0,
                active_connections=18,
                latency_ms=4.2,
                error_rate=0.0,
                dependencies=[],
            ),
            "redis-cache": ServiceNode(
                id="redis-cache",
                name="Redis Cache",
                type="cache",
                status=ServiceStatus.HEALTHY,
                health_score=100.0,
                active_connections=110,
                latency_ms=1.1,
                error_rate=0.0,
                dependencies=[],
            ),
        }

        self.edges = [
            {"source": "api-gateway", "target": "auth-service"},
            {"source": "api-gateway", "target": "order-service"},
            {"source": "api-gateway", "target": "payment-service"},
            {"source": "auth-service", "target": "postgres-db"},
            {"source": "auth-service", "target": "redis-cache"},
            {"source": "order-service", "target": "postgres-db"},
            {"source": "order-service", "target": "redis-cache"},
            {"source": "payment-service", "target": "postgres-db"},
        ]

    def get_topology(self) -> Dict[str, Any]:
        return {
            "nodes": [n.model_dump(mode="json") for n in self.nodes.values()],
            "edges": self.edges,
        }

    async def update_node_status(
        self,
        node_id: str,
        status: ServiceStatus,
        health_score: float,
        latency_ms: float,
        error_rate: float,
        active_connections: int,
    ):
        if node_id in self.nodes:
            node = self.nodes[node_id]
            node.status = status
            node.health_score = health_score
            node.latency_ms = latency_ms
            node.error_rate = error_rate
            node.active_connections = active_connections

            # Notify UI
            await event_bus.publish(
                "cluster_update",
                {
                    "node": node.model_dump(mode="json"),
                    "topology": self.get_topology(),
                },
            )

    async def reset_all(self):
        """Restore all nodes to pristine green healthy state."""
        self._init_topology()
        await event_bus.publish("cluster_update", {"topology": self.get_topology()})


cluster = MockCluster()
