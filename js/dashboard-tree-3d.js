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

  // Cache del modelo GLB de árbol — se carga una sola vez y se clona N veces
  let _treeModelPromise = null;
  function getTreeModel() {
    if (_treeModelPromise) return _treeModelPromise;
    _treeModelPromise = new Promise((resolve) => {
      if (typeof THREE.GLTFLoader === 'undefined') return resolve(null);
      const loader = new THREE.GLTFLoader();
      loader.load('data/trees/tree_model.glb',
        (gltf) => resolve(gltf.scene),
        undefined,
        () => { console.warn('Bosque 3D: no se cargó tree_model.glb, usando árbol procedural'); resolve(null); }
      );
    });
    return _treeModelPromise;
  }

  // Color del semáforo de salud — usado en el anillo de la base
  function colorByHealth(score) {
    if (score == null) return 0x9e9e9e; // gris (sin dato)
    if (score >= 70) return 0x4CAF50;   // verde
    if (score >= 40) return 0xFFA726;   // ámbar
    return 0xEF5350;                    // rojo
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

  // Construye UN árbol clonando el modelo GLB compartido.
  // El semáforo de salud se muestra como ANILLO + DISCO en la base del árbol
  // (mismo enfoque que en FES Iztacala 3D). Si el GLB no cargó, fallback al
  // árbol procedural simple.
  function buildSingleTree(treeData, modelTemplate) {
    const group = new THREE.Group();
    const score = treeData ? (treeData.health_score || 0) : null;
    const isEmpty = !treeData;
    const healthColor = isEmpty ? 0x9e9e9e : colorByHealth(score);

    // Escalar altura
    let heightScale = 1.0;
    if (treeData && treeData.initial_height_cm) {
      const h = treeData.initial_height_cm;
      heightScale = 0.6 + Math.min(1.0, h / 600) * 0.8;
    }
    const targetHeight = 1.5 * heightScale; // altura visual ~1.5m por árbol

    // ---- ÁRBOL (clonado del GLB, o procedural si no hay) ----
    let canopyMeshes = []; // para hover-highlight
    if (modelTemplate) {
      const tree = modelTemplate.clone(true);
      // Normalizar escala al targetHeight
      const box = new THREE.Box3().setFromObject(tree);
      const size = new THREE.Vector3();
      box.getSize(size);
      const modelHeight = size.y || 1;
      const scale = targetHeight / modelHeight;
      tree.scale.setScalar(scale);
      tree.position.y = 0;

      // Casar sombras y juntar materiales para identificar canopy
      tree.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // Detectar follaje (más verde que rojo/azul) para canopy hover
          if (o.material && o.material.color) {
            const c = o.material.color;
            if (c.g > c.r && c.g > c.b * 0.7) {
              o.material = o.material.clone();
              canopyMeshes.push(o);
            }
          }
        }
      });

      // Si está vacío (slot sin árbol), opacar
      if (isEmpty) {
        tree.traverse(o => {
          if (o.isMesh && o.material) {
            o.material = o.material.clone();
            o.material.transparent = true;
            o.material.opacity = 0.35;
          }
        });
      }
      group.add(tree);
    } else {
      // Fallback procedural simple
      const trunkH = 0.7 * heightScale;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.16, trunkH, 7),
        new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 0.95, flatShading: true })
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x4a7c2a, roughness: 0.7, flatShading: true,
        transparent: isEmpty, opacity: isEmpty ? 0.45 : 1.0
      });
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 * heightScale, 0), canopyMat);
      blob.position.y = trunkH + 0.3 * heightScale;
      blob.castShadow = true;
      group.add(blob);
      canopyMeshes.push(blob);
    }

    // ---- SEMÁFORO DE SALUD: disco + anillo en la base ----
    // Solo si NO está vacío (los slots vacíos no muestran semáforo)
    if (!isEmpty) {
      // Disco relleno con opacidad
      const baseR = 0.55 * heightScale;
      const base = new THREE.Mesh(
        new THREE.CircleGeometry(baseR, 24),
        new THREE.MeshBasicMaterial({ color: healthColor, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.012;
      group.add(base);

      // Anillo de borde más oscuro
      const dark = new THREE.Color(healthColor).multiplyScalar(0.6).getHex();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(baseR * 0.90, baseR * 1.05, 28),
        new THREE.MeshBasicMaterial({ color: dark, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.014;
      group.add(ring);
    } else {
      // Slot vacío — disco muy tenue gris
      const empty = new THREE.Mesh(
        new THREE.CircleGeometry(0.40, 16),
        new THREE.MeshBasicMaterial({ color: 0xc5b5a0, transparent: true, opacity: 0.18 })
      );
      empty.rotation.x = -Math.PI / 2;
      empty.position.y = 0.01;
      group.add(empty);
    }

    // ---- Pick mesh invisible (esfera) para clicks más fáciles ----
    const pickMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.65 * heightScale, 6, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    pickMesh.position.y = targetHeight * 0.55;
    pickMesh.userData = {
      isTree: true, tree: treeData, isEmpty,
      canopyMeshes,
      wobblePhase: Math.random() * Math.PI * 2,
      baseY: pickMesh.position.y,
    };
    group.add(pickMesh);

    return { group, pickMesh };
  }

  // Construye el bosque entero con TODOS los árboles (no muestreo, no descarte)
  // así la proporción de colores (semáforo) refleja la realidad del campus.
  // Si hay <30 árboles, agregamos slots vacíos para que el bosque no se vea ralo.
  function buildForest(trees, modelTemplate) {
    const forest = new THREE.Group();
    pickableMeshes = [];

    // Mezclar el orden para que los colores se distribuyan visualmente
    // (sin ordenar por salud → no sesga la percepción)
    const all = (trees || []).slice();
    // Shuffle determinístico por id para consistencia entre renders
    all.sort((a, b) => {
      const ha = (String(a.id).charCodeAt(0) + (a.tree_code || '').length) || 0;
      const hb = (String(b.id).charCodeAt(0) + (b.tree_code || '').length) || 0;
      return ha - hb;
    });

    const totalReal = all.length;
    const minSlots = 30; // mínimo para que el bosque se vea poblado
    const totalSlots = Math.max(minSlots, totalReal);

    // Radio crece con el número de árboles para no apretarlos
    const radius = Math.max(5.5, Math.sqrt(totalSlots) * 0.85);
    const innerRadius = 0.5;

    for (let i = 0; i < totalSlots; i++) {
      const assignedTree = i < totalReal ? all[i] : null;

      const t = (i + 0.5) / totalSlots;
      const r = innerRadius + Math.sqrt(t) * (radius - innerRadius);
      const theta = i * 2.399;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      const { group, pickMesh } = buildSingleTree(assignedTree, modelTemplate);
      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;
      forest.add(group);
      pickableMeshes.push(pickMesh);
    }

    return forest;
  }

  async function setupScene(container, trees) {
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

    // Bosque (espera al GLB; si no carga, fallback a procedural)
    const modelTemplate = await getTreeModel();
    // Race-condition guard: si el usuario cambió de tab durante el await del
    // GLB (~500ms), destroy() ya corrió y scene es null. En ese caso, salimos
    // limpios sin tirar excepción ni dejar objetos a medias.
    if (!scene) {
      console.warn('Bosque 3D: setupScene abortado (cambio de tab durante carga del GLB)');
      return;
    }
    const forest = buildForest(trees, modelTemplate);
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

    // Reset previous highlight (canopy meshes)
    if (lastHovered && lastHovered !== (hit && hit.object)) {
      (lastHovered.userData.canopyMeshes || []).forEach(b => {
        if (b.material) b.material.emissiveIntensity = 0;
      });
    }
    if (hit) {
      const pick = hit.object;
      (pick.userData.canopyMeshes || []).forEach(b => {
        if (b.material) {
          b.material.emissive = new THREE.Color(0xffffff);
          b.material.emissiveIntensity = 0.4;
        }
      });
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
        (lastHovered.userData.canopyMeshes || []).forEach(b => {
          if (b.material) b.material.emissiveIntensity = 0;
        });
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
    // Guard: si destroy() corrió, renderer/scene/camera son null. No queremos
    // encolar el siguiente frame ni intentar renderizar (eso truena con
    // "can't access property 'render' of null" en cada frame).
    if (!renderer || !scene || !camera) {
      animId = null;
      return;
    }
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    // Wobble suave del bosque entero (efecto brisa)
    const t = Date.now() * 0.001;
    pickableMeshes.forEach((p, i) => {
      if (!p || !p.parent) return;
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

  async function init(containerSelector, trees) {
    if (!window.THREE) {
      console.warn('Three.js no cargado');
      return false;
    }
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (!container) return false;

    destroy();
    // Mostrar loading mientras carga el GLB
    container.innerHTML = '<div style="padding:3rem;text-align:center;color:#888;"><i class="fas fa-spinner fa-spin"></i> Plantando bosque…</div>';
    await setupScene(container, trees || []);
    animate();
    return true;
  }

  window.DashboardTree3D = { init, destroy };
})();
