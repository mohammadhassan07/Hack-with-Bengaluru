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
    this.isAutoRotate = true;

    this.nodePositions = {
      "api-gateway": new THREE.Vector3(0, 15, 0),
      "auth-service": new THREE.Vector3(-16, 5, 8),
      "order-service": new THREE.Vector3(0, 3, -14),
      "payment-service": new THREE.Vector3(16, 5, 8),
      "postgres-db": new THREE.Vector3(0, -15, 0),
      "redis-cache": new THREE.Vector3(-14, -8, -12),
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

    // Clear previous children if re-initializing
    this.container.innerHTML = '';

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 320;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    this.camera.position.set(0, 18, 62);

    // Renderer with transparent canvas
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxDistance = 110;
      this.controls.minDistance = 25;
      this.controls.autoRotate = this.isAutoRotate;
      this.controls.autoRotateSpeed = 0.8;
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    dirLight.position.set(25, 40, 20);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x818cf8, 0.8);
    backLight.position.set(-25, -20, -20);
    this.scene.add(backLight);

    // Subtle 3D Grid Floor
    const gridHelper = new THREE.GridHelper(80, 24, 0x334155, 0x1e293b);
    gridHelper.position.y = -24;
    this.scene.add(gridHelper);

    // Responsive Resize Observer
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.onWindowResize());
      ro.observe(this.container);
    }
    window.addEventListener('resize', () => this.onWindowResize());

    // Build default mesh
    this.buildNodes();
    this.buildLinks();

    // Start animation loop
    this.animate();
  }

  buildNodes() {
    const sphereGeo = new THREE.SphereGeometry(3.0, 32, 32);
    const auraGeo = new THREE.SphereGeometry(4.2, 16, 16);

    for (const [id, pos] of Object.entries(this.nodePositions)) {
      const isDb = id.includes('postgres') || id.includes('redis');
      const isGw = id.includes('gateway');
      const baseColor = isDb ? this.colors.db : (isGw ? this.colors.gateway : this.colors.healthy);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.25,
        metalness: 0.75,
        emissive: baseColor,
        emissiveIntensity: 0.45,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);

      // Outer glowing aura shell
      const auraMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.22,
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
    node.mat.emissiveIntensity = status === 'critical' ? 0.95 : 0.45;
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
      node.mat.emissiveIntensity = 0.45;
      node.auraMat.color.setHex(baseColor);
      node.mesh.scale.set(1, 1, 1);
    }
  }

  toggleAutoRotate() {
    this.isAutoRotate = !this.isAutoRotate;
    if (this.controls) {
      this.controls.autoRotate = this.isAutoRotate;
    }
    return this.isAutoRotate;
  }

  resetCamera() {
    if (this.camera && this.controls) {
      this.camera.position.set(0, 18, 62);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.003;

    // Pulse critical or recovering nodes
    for (const [id, node] of Object.entries(this.nodes)) {
      if (node.status === 'critical') {
        const s = 1.0 + Math.sin(time * 3.5) * 0.22;
        node.mesh.scale.set(s, s, s);
        node.aura.rotation.y += 0.05;
      } else if (node.status === 'recovering') {
        const s = 1.0 + Math.sin(time * 2.0) * 0.12;
        node.mesh.scale.set(s, s, s);
      } else {
        node.aura.rotation.y += 0.006;
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
