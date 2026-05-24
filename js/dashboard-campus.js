// ============================================================================
// dashboard-campus.js — Renderer 3D genérico para campus que tienen JSON
// (footprints de edificios desde OSM). Sirve a Acatlán, Aragón, etc.
//
// Si necesitas el modelo de Iztacala (con GLB de Blender de alta fidelidad)
// usa window.IztacalaMap. Este módulo es para los campus que solo tienen
// footprints OSM proyectados.
//
// Uso:
//   window.CampusMap.init('#contenedor', 'Acatlan');
//   window.CampusMap.init('#contenedor', 'Aragon');
//
// El JSON debe tener la estructura producida por scripts/build_campus_json.py
// (o el equivalente Python que descarga Overpass API):
//   { center_lat, center_lon, m_per_lat, m_per_lon, bbox, boundary, buildings }
// ============================================================================

window.CampusMap = (function() {
  'use strict';

  let scene, camera, renderer, controls, raycaster, mouse;
  let buildingMeshes = [];
  let treeMeshes = [];
  let popupEl = null;
  let containerEl = null;
  let animId = null;
  let currentCampus = null;
  let mapData = null;
  let hoveredObj = null;

  // ============================================================================
  // HELPERS
  // ============================================================================
  function colorForHealth(score) {
    if (score == null || isNaN(score)) return 0x9e9e9e;
    if (score >= 70) return 0x4CAF50;
    if (score >= 40) return 0xFFA726;
    return 0xEF5350;
  }

  function latlonToModelXY(lat, lon) {
    if (!mapData) return { x: 0, y: 0 };
    return {
      x: (lon - mapData.center_lon) * mapData.m_per_lon,
      y: (lat - mapData.center_lat) * mapData.m_per_lat,
    };
  }

  // ============================================================================
  // INIT
  // ============================================================================
  async function init(containerSel, campusName) {
    containerEl = typeof containerSel === 'string'
      ? document.querySelector(containerSel)
      : containerSel;
    if (!containerEl) return;

    // Si cambia de campus, destruir escena previa
    if (currentCampus && currentCampus !== campusName) {
      destroy();
    }
    currentCampus = campusName;

    // Loading state
    containerEl.style.position = 'relative';
    containerEl.style.minHeight = '500px';
    containerEl.innerHTML = `
      <div id="campus-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#666;background:#f5f5f0;">
        <div style="text-align:center;">
          <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i>
          <div style="margin-top:0.7rem;">Cargando campus ${campusName}…</div>
        </div>
      </div>`;

    // Cargar JSON
    const campus = window.CampusBounds.get(campusName);
    const jsonPath = campus.json;
    if (!jsonPath) {
      _renderUnderConstruction(campusName);
      return;
    }

    try {
      const res = await fetch(jsonPath);
      mapData = await res.json();
    } catch (e) {
      console.warn('No se pudo cargar JSON del campus:', e);
      _renderUnderConstruction(campusName);
      return;
    }

    // Setup escena
    await _setupScene(containerEl);
    animate();

    // Cargar árboles del campus
    await _loadTrees(campusName);
  }

  function _renderUnderConstruction(name) {
    containerEl.innerHTML = `
      <div style="height:100%;min-height:400px;display:flex;align-items:center;justify-content:center;
                  background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border-radius:12px;padding:2rem;">
        <div style="text-align:center;max-width:520px;">
          <div style="font-size:3rem;margin-bottom:1rem;">🏗️</div>
          <h3 style="margin:0 0 0.6rem;color:#1b5e20;">Modelo 3D en construcción</h3>
          <p style="color:#444;line-height:1.5;">
            Aún no tenemos los footprints OSM del campus <strong>${name}</strong>.
          </p>
        </div>
      </div>`;
  }

  // ============================================================================
  // SETUP ESCENA 3D
  // ============================================================================
  async function _setupScene(container) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8f0f5);
    scene.fog = new THREE.Fog(0xe8f0f5, 600, 2200);

    camera = new THREE.PerspectiveCamera(45, w / h, 1, 4000);
    // Centrar la cámara para ver el bbox completo
    const bbox = mapData.bbox || { min_x: -300, max_x: 300, min_y: -300, max_y: 300 };
    const span = Math.max(bbox.max_x - bbox.min_x, bbox.max_y - bbox.min_y);
    const camDist = span * 0.9;
    camera.position.set(camDist * 0.5, camDist * 0.6, camDist * 0.7);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.0);
    sun.position.set(200, 300, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -500;
    sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500;
    sun.shadow.camera.bottom = -500;
    scene.add(sun);

    // GROUND PLANE
    const groundSize = Math.max(span * 1.5, 1000);
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x8FBC5F, roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // BOUNDARY del campus (en azul-verde para delimitarlo)
    if (mapData.boundary && mapData.boundary.length > 2) {
      const pts = mapData.boundary.map(p => new THREE.Vector3(p[0], 0.1, -p[1]));
      pts.push(pts[0].clone()); // cerrar
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2E7D32, linewidth: 3 });
      scene.add(new THREE.Line(lineGeo, lineMat));

      // También un piso "campus" tintado dentro del polígono
      const shape = new THREE.Shape();
      mapData.boundary.forEach((p, i) => {
        if (i === 0) shape.moveTo(p[0], -p[1]);
        else shape.lineTo(p[0], -p[1]);
      });
      const campusGeo = new THREE.ShapeGeometry(shape);
      const campusMat = new THREE.MeshStandardMaterial({
        color: 0xD4E8B8, roughness: 0.95, transparent: true, opacity: 0.6,
      });
      const campusFloor = new THREE.Mesh(campusGeo, campusMat);
      campusFloor.rotation.x = -Math.PI / 2;
      campusFloor.position.y = 0.05;
      campusFloor.receiveShadow = true;
      scene.add(campusFloor);
    }

    // EDIFICIOS (footprints OSM extruidos a la altura del building)
    buildingMeshes = [];
    if (mapData.buildings) {
      const bldgMat = new THREE.MeshStandardMaterial({
        color: 0xE8DBC8, roughness: 0.85,
      });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xC0392B, roughness: 0.7,
      });
      mapData.buildings.forEach(b => {
        if (!b.footprint || b.footprint.length < 3) return;
        const shape = new THREE.Shape();
        b.footprint.forEach((p, i) => {
          if (i === 0) shape.moveTo(p[0], -p[1]);
          else shape.lineTo(p[0], -p[1]);
        });
        const h = b.height || 8;
        const extrudeSettings = { depth: h, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, bldgMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = h; // rotated, así que el "techo" queda en y=h
        // mejor: dejar position en 0 y rotar correctamente
        mesh.position.y = 0;
        mesh.userData = { isBuilding: true, name: b.name, height: h };
        scene.add(mesh);
        buildingMeshes.push(mesh);

        // Techo coloreado encima
        const roofGeo = new THREE.ShapeGeometry(shape);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.rotation.x = -Math.PI / 2;
        roof.position.y = h + 0.1;
        roof.receiveShadow = true;
        scene.add(roof);
      });
    }

    // Controls
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 50;
      controls.maxDistance = camDist * 3;
      controls.maxPolarAngle = Math.PI / 2.05;
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);

    // Resize observer
    window.addEventListener('resize', onResize);
  }

  // ============================================================================
  // CARGAR ÁRBOLES
  // ============================================================================
  async function _loadTrees(campusName) {
    if (typeof sb === 'undefined') return;
    try {
      const { data: trees, error } = await sb.from('trees_catalog')
        .select('id, tree_code, common_name, species, health_score, status, location_lat, location_lng, photo_url, initial_height_cm, campus')
        .eq('campus', campusName);
      if (error) throw error;
      const valid = (trees || []).filter(t => t.location_lat && t.location_lng);
      treeMeshes = [];
      valid.forEach(addTree);
      console.log(`🌳 ${campusName}: ${valid.length} árboles plotteados`);
    } catch (e) {
      console.warn(`Error cargando árboles de ${campusName}:`, e);
    }
  }

  function addTree(t) {
    if (!scene) return;
    const { x, y } = latlonToModelXY(t.location_lat, t.location_lng);
    const group = new THREE.Group();
    group.position.set(x, 0, -y);

    const healthColor = colorForHealth(t.health_score);
    const height = Math.max(2, Math.min(8, (t.initial_height_cm || 300) / 50));

    // Tronco
    const trunkH = height * 0.45;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, trunkH, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 0.95 })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Copa
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(height * 0.55, 1),
      new THREE.MeshStandardMaterial({ color: healthColor, roughness: 0.75, flatShading: true })
    );
    canopy.position.y = trunkH + height * 0.4;
    canopy.castShadow = true;
    group.add(canopy);

    // Disco de semáforo abajo
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24),
      new THREE.MeshBasicMaterial({ color: healthColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.12;
    group.add(disc);

    group.userData = { isTree: true, tree: t };
    scene.add(group);
    treeMeshes.push(group);
  }

  // ============================================================================
  // INTERACCIÓN
  // ============================================================================
  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function onPointerClick(e) {
    if (!raycaster || !mouse) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    // Intersect con árboles (priorizamos sobre edificios)
    const allTreeMeshes = treeMeshes.flatMap(g => g.children);
    const hits = raycaster.intersectObjects(allTreeMeshes);
    if (hits.length > 0) {
      let parent = hits[0].object;
      while (parent && !parent.userData?.tree) parent = parent.parent;
      const tree = parent?.userData?.tree;
      if (tree && typeof window.viewTreeMeasurementsAdmin === 'function') {
        window.viewTreeMeasurementsAdmin(parseInt(tree.id, 10));
      }
    }
  }

  function onResize() {
    if (!renderer || !camera || !containerEl) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    if (!renderer || !scene || !camera) {
      animId = null;
      return;
    }
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    }
    if (controls) controls.dispose();
    scene = renderer = camera = controls = null;
    buildingMeshes = [];
    treeMeshes = [];
    mapData = null;
    window.removeEventListener('resize', onResize);
  }

  return { init, destroy };
})();
