// Bosque UNAM 3D — un pequeño bosque circular donde cada árbol = un árbol real
// Estilo low-poly intencional (Ghibli / Monument Valley vibe).
// - Un árbol low-poly por cada árbol del proyecto (1:1)
// - Color del canopy según salud (verde / sage / ámbar / rojo)
// - Tamaño según altura real del árbol (initial_height_cm)
// - Distribución circular en jardín, vista isométrica con auto-rotación
// - Hover/click sobre un árbol → datos / abre edición

(function () {
  'use strict';

  let scene, camera, renderer, controls;
  let pickableMeshes = [];
  let raycaster, mouse;
  let animId = null;
  let resizeHandler = null;
  let lastHovered = null;

  function colorByHealth(score) {
    if (score == null) return 0xc5b5a0;
    if (score >= 80) return 0x4a7c2a;
    if (score >= 60) return 0x95b86c;
    if (score >= 40) return 0xd49b3a;
    if (score >= 0)  return 0xb54f3a;
    return 0xc5b5a0;
  }

  function createSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#a8d4f0');
    g.addColorStop(0.55, '#dde8d9');
    g.addColorStop(0.80, '#f5ede0');
    g.addColorStop(1.00, '#d4b896');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    return new THREE.CanvasTexture(c);
  }

  // Construye UN árbol low-poly estilizado.
  // height factor (0-1) basado en altura real → escala vertical.
  function buildSingleTree(treeData) {
    const group = new THREE.Group();

    // Determinar atributos visuales del árbol
    const score = treeData ? (treeData.health_score || 0) : null;
    const isEmpty = !treeData;
    const canopyColor = isEmpty ? 0xc5b5a0 : colorByHealth(score);
    const trunkColor = 0x6b4f2a;
    // Escalar altura: árboles bajos = 0.6, altos = 1.4 (basado en initial_height_cm)
    let heightScale = 1.0;
    if (treeData && treeData.initial_height_cm) {
      const h = treeData.initial_height_cm;
      heightScale = 0.6 + Math.min(1.0, h / 600) * 0.8;  // 0.6 a 1.4
    }

    // Tronco: cilindro corto cónico
    const trunkH = 0.7 * heightScale;
    const trunkGeo = new THREE.CylinderGeometry(0.10, 0.16, trunkH, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkColor, roughness: 0.95, flatShading: true
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Canopy: 2-3 esferas/icosaedros apilados (look low-poly Ghibli)
    const canopyMat = new THREE.MeshStandardMaterial({
      color: canopyColor,
      roughness: 0.7,
      flatShading: true,
      emissive: isEmpty ? 0x000000 : canopyColor,
      emissiveIntensity: isEmpty ? 0 : 0.15,
      transparent: isEmpty, opacity: isEmpty ? 0.45 : 1.0
    });

    const blob1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 * heightScale, 0), canopyMat);
    blob1.position.y = trunkH + 0.30 * heightScale;
    blob1.castShadow = true;
    blob1.userData = { isTree: true, tree: treeData, isEmpty };
    group.add(blob1);

    const blob2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * heightScale, 0), canopyMat);
    blob2.position.set(0.20 * heightScale, trunkH + 0.55 * heightScale, -0.10 * heightScale);
    blob2.castShadow = true;
    blob2.userData = { isTree: true, tree: treeData, isEmpty };
    group.add(blob2);

    const blob3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 * heightScale, 0), canopyMat);
    blob3.position.set(-0.18 * heightScale, trunkH + 0.45 * heightScale, 0.15 * heightScale);
    blob3.castShadow = true;
    blob3.userData = { isTree: true, tree: treeData, isEmpty };
    group.add(blob3);

    // Pickable mesh = un sphere wrapper invisible más grande para click más fácil
    const pickGeo = new THREE.SphereGeometry(0.6 * heightScale, 6, 6);
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickMesh = new THREE.Mesh(pickGeo, pickMat);
    pickMesh.position.y = trunkH + 0.4 * heightScale;
    pickMesh.userData = {
      isTree: true, tree: treeData, isEmpty,
      blobs: [blob1, blob2, blob3], canopyMat,
      wobblePhase: Math.random() * Math.PI * 2,
      baseY: pickMesh.position.y
    };
    group.add(pickMesh);

    // Sombra disco bajo el árbol
    const shadowGeo = new THREE.CircleGeometry(0.45 * heightScale, 12);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    group.add(shadow);

    return { group, pickMesh };
  }

  // Construye el bosque entero con N árboles
  function buildForest(trees) {
    const forest = new THREE.Group();
    pickableMeshes = [];

    const totalSlots = 50;
    const sorted = (trees || []).slice().sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
    const total = sorted.length;
    const scaled = total > totalSlots;

    // Distribución espiral de Fibonacci en círculo (look natural y ordenado)
    const radius = 5.5;
    const innerRadius = 0.5;

    for (let i = 0; i < totalSlots; i++) {
      let assignedTree = null;
      if (!scaled) assignedTree = sorted[i] || null;
      else assignedTree = sorted[Math.floor(i * total / totalSlots)] || null;

      // Distribución espiral
      const t = i / totalSlots;
      const r = innerRadius + Math.sqrt(t) * (radius - innerRadius);
      const theta = i * 2.399;  // golden angle
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      const { group, pickMesh } = buildSingleTree(assignedTree);
      group.position.set(x, 0, z);
      // Pequeña rotación aleatoria
      group.rotation.y = Math.random() * Math.PI * 2;
      forest.add(group);
      pickableMeshes.push(pickMesh);
    }

    return forest;
  }

  function setupScene(container, trees) {
    const w = container.clientWidth;
    const h = Math.min(560, Math.max(380, Math.round(w * 0.65)));

    scene = new THREE.Scene();
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(0xeae0c8, 18, 50);

    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
    camera.position.set(0, 8, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.style.position = 'relative';
    container.appendChild(renderer.domElement);

    // Lighting
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.3);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    scene.add(sun);

    scene.add(new THREE.AmbientLight(0xb8d4f0, 0.55));
    scene.add(new THREE.HemisphereLight(0xfff8e0, 0x6b8a3e, 0.45));

    // Suelo: disco de tierra con anillo de hierba
    const groundGeo = new THREE.CircleGeometry(8, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x7a6342, roughness: 0.96
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Hierba: anillo verde más oscuro alrededor
    const grassGeo = new THREE.RingGeometry(2, 7.5, 48);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x6b8a3e, roughness: 0.9, side: THREE.DoubleSide,
      transparent: true, opacity: 0.55
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.005;
    scene.add(grass);

    // Camino central
    const pathGeo = new THREE.RingGeometry(0, 0.6, 16);
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0xa89368, roughness: 0.85, side: THREE.DoubleSide
    });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.01;
    scene.add(path);

    // Bosque
    const forest = buildForest(trees);
    scene.add(forest);

    // Controls
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.8;
      controls.minDistance = 7;
      controls.maxDistance = 20;
      controls.minPolarAngle = Math.PI / 8;
      controls.maxPolarAngle = Math.PI / 2.1;
      controls.target.set(0, 1.5, 0);
      controls.enablePan = false;
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });

    resizeHandler = () => onResize(container);
    window.addEventListener('resize', resizeHandler);
  }

  function onResize(container) {
    if (!renderer || !camera || !container) return;
    const w = container.clientWidth;
    const h = Math.min(560, Math.max(380, Math.round(w * 0.65)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function pickTree(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(pickableMeshes);
    return hits.find(h => !h.object.userData.isEmpty);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function onPointerMove(e) {
    const tooltip = document.getElementById('dashboard-tree-tooltip');
    const hit = pickTree(e.clientX, e.clientY);

    // Reset previous highlight
    if (lastHovered && lastHovered !== (hit && hit.object)) {
      lastHovered.userData.blobs.forEach(b => b.material.emissiveIntensity = 0.15);
    }
    if (hit) {
      const pick = hit.object;
      pick.userData.blobs.forEach(b => b.material.emissiveIntensity = 0.5);
      lastHovered = pick;
      const t = pick.userData.tree;
      if (tooltip && t) {
        tooltip.innerHTML =
          '<strong>' + escapeHtml(t.common_name || t.species || 'Árbol') +
          ' <span style="opacity:0.7;">(' + escapeHtml(t.tree_code || '-') + ')</span></strong>' +
          'Salud: ' + (t.health_score || 0) + '/100 — ' + escapeHtml(t.status || '?') + '<br>' +
          'Campus: ' + escapeHtml(t.campus || '?');
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
      }
      renderer.domElement.style.cursor = 'pointer';
      if (controls) controls.autoRotate = false;
    } else {
      if (lastHovered) {
        lastHovered.userData.blobs.forEach(b => b.material.emissiveIntensity = 0.15);
        lastHovered = null;
      }
      if (tooltip) tooltip.style.display = 'none';
      renderer.domElement.style.cursor = 'grab';
      if (controls) {
        clearTimeout(window._bosqueResumeTimer);
        window._bosqueResumeTimer = setTimeout(() => {
          if (controls) controls.autoRotate = true;
        }, 3000);
      }
    }
  }

  function onPointerClick(e) {
    const hit = pickTree(e.clientX, e.clientY);
    if (hit) {
      const t = hit.object.userData.tree;
      if (t && t.id != null && typeof editAdminTree === 'function') {
        editAdminTree(parseInt(t.id, 10));
      }
    }
  }

  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    const t = e.touches[0];
    onPointerMove(t);
    setTimeout(() => {
      const tooltip = document.getElementById('dashboard-tree-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    }, 2500);
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    // Wobble suave del bosque entero (efecto brisa)
    const t = Date.now() * 0.001;
    pickableMeshes.forEach((p, i) => {
      const phase = p.userData.wobblePhase;
      p.parent.rotation.z = Math.sin(t + phase) * 0.015;
    });
    renderer.render(scene, camera);
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (controls) controls.dispose();
    scene = camera = renderer = controls = null;
    pickableMeshes = [];
    lastHovered = null;
  }

  function init(containerSelector, trees) {
    if (!window.THREE) {
      console.warn('Three.js no cargado');
      return false;
    }
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (!container) return false;

    destroy();
    setupScene(container, trees || []);
    animate();
    return true;
  }

  window.DashboardTree3D = { init, destroy };
})();
