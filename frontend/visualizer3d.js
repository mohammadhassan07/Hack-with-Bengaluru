/**
 * 3D Microservice Mesh Visualizer using Three.js.
 * Renders glowing microservice nodes, animated dependency links, and failure shockwaves.
 */

class MicroserviceVisualizer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.nodes = {};
    this.links = [];
    this.nodePositions = {
      "api-gateway": new THREE.Vector3(0, 16, 0),
      "auth-service": new THREE.Vector3(-18, 6, 8),
      "order-service": new THREE.Vector3(0, 4, -14),
      "payment-service": new THREE.Vector3(18, 6, 8),
      "postgres-db": new THREE.Vector3(0, -16, 0),
      "redis-cache": new THREE.Vector3(-16, -10, -14),
    };

    this.colors = {
      healthy: 0x10b981,     // Emerald green
      recovering: 0xf59e0b,  // Amber
      critical: 0xf43f5e,    // Rose / Crimson
      memory: 0xfbbf24,      // Gold / Hindsight hit
      gateway: 0x06b6d4,     // Cyan
      db: 0x8b5cf6,          // Purple
    };

    this.init();
  }

  init() {
    if (!this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    this.camera.position.set(0, 20, 65);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxDistance = 120;
      this.controls.minDistance = 25;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.6;
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(30, 40, 20);
    this.scene.add(dirLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(90, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -26;
    this.scene.add(gridHelper);

    // Window resize handler
    window.addEventListener('resize', () => this.onWindowResize());

    // Build default mesh
    this.buildNodes();
    this.buildLinks();

    // Start animation loop
    this.animate();
  }

  buildNodes() {
    const sphereGeo = new THREE.SphereGeometry(3.2, 32, 32);
    const auraGeo = new THREE.SphereGeometry(4.4, 16, 16);

    for (const [id, pos] of Object.entries(this.nodePositions)) {
      const isDb = id.includes('postgres') || id.includes('redis');
      const isGw = id.includes('gateway');
      const baseColor = isDb ? this.colors.db : (isGw ? this.colors.gateway : this.colors.healthy);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.2,
        metalness: 0.8,
        emissive: baseColor,
        emissiveIntensity: 0.4,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);

      // Outer glowing aura shell
      const auraMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      mesh.add(auraMesh);

      this.scene.add(mesh);
      this.nodes[id] = {
        mesh: mesh,
        aura: auraMesh,
        mat: mat,
        auraMat: auraMat,
        status: 'healthy',
        basePos: pos.clone(),
      };
    }
  }

  buildLinks() {
    const linkPairs = [
      ['api-gateway', 'auth-service'],
      ['api-gateway', 'order-service'],
      ['api-gateway', 'payment-service'],
      ['auth-service', 'postgres-db'],
      ['auth-service', 'redis-cache'],
      ['order-service', 'postgres-db'],
      ['order-service', 'redis-cache'],
      ['payment-service', 'postgres-db'],
    ];

    linkPairs.forEach(([sourceId, targetId]) => {
      const sourcePos = this.nodePositions[sourceId];
      const targetPos = this.nodePositions[targetId];

      if (sourcePos && targetPos) {
        const points = [sourcePos, targetPos];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.35,
          linewidth: 1.5,
        });

        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
        this.links.push({ line, sourceId, targetId });
      }
    });
  }

  updateNodeStatus(nodeId, status, isMemoryRecall = false) {
    const node = this.nodes[nodeId];
    if (!node) return;

    node.status = status;
    let targetColor = this.colors.healthy;

    if (isMemoryRecall) {
      targetColor = this.colors.memory;
    } else if (status === 'critical') {
      targetColor = this.colors.critical;
    } else if (status === 'recovering') {
      targetColor = this.colors.recovering;
    }

    node.mat.color.setHex(targetColor);
    node.mat.emissive.setHex(targetColor);
    node.mat.emissiveIntensity = status === 'critical' ? 0.9 : 0.4;
    node.auraMat.color.setHex(targetColor);
  }

  resetAllNodes() {
    for (const [id, node] of Object.entries(this.nodes)) {
      const isDb = id.includes('postgres') || id.includes('redis');
      const isGw = id.includes('gateway');
      const baseColor = isDb ? this.colors.db : (isGw ? this.colors.gateway : this.colors.healthy);
      
      node.status = 'healthy';
      node.mat.color.setHex(baseColor);
      node.mat.emissive.setHex(baseColor);
      node.mat.emissiveIntensity = 0.4;
      node.auraMat.color.setHex(baseColor);
      node.mesh.scale.set(1, 1, 1);
    }
  }

  onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.003;

    // Pulse critical nodes
    for (const [id, node] of Object.entries(this.nodes)) {
      if (node.status === 'critical') {
        const s = 1.0 + Math.sin(time * 3) * 0.22;
        node.mesh.scale.set(s, s, s);
        node.aura.rotation.y += 0.04;
      } else if (node.status === 'recovering') {
        const s = 1.0 + Math.sin(time * 1.5) * 0.1;
        node.mesh.scale.set(s, s, s);
      } else {
        node.aura.rotation.y += 0.005;
      }
    }

    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Global instance exposed
let visualizer = null;
window.addEventListener('DOMContentLoaded', () => {
  visualizer = new MicroserviceVisualizer3D('three-container');
});
