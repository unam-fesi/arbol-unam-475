// ============================================================================
// dashboard-iztacala.js — Mapa 3D del campus FES Iztacala
// ============================================================================
// Renderiza el modelo del campus a partir de iztacala_campus.json
// (boundary + 63 edificios con footprint real de OSM, ya proyectado a metros
// locales). Capa de árboles dinámica desde Supabase con coloreado por health.
//
// Coordenadas:
//   JSON: x=Este, y=Norte (metros, origen en centroide del bbox del campus)
//   Three.js: usamos el mapeo (JSON.x, height, -JSON.y)
//   → así +Y JSON (norte real) apunta hacia -Z Three.js (lejos de la cámara)
// ============================================================================

window.IztacalaMap = (function() {
  'use strict';

  // ---- Constantes de proyección (de projection.py / Blender) ----
  const CENTER_LAT = 19.52552345;
  const CENTER_LON = -99.1881276;
  const M_PER_LAT = 110574.0;
  const M_PER_LON = 104918.28705381248;

  // ---- Estado del módulo ----
  let scene, camera, renderer, controls, raycaster, mouse;
  let buildingMeshes = [];
  let treeMeshes = [];
  let popupEl = null;
  let containerEl = null;
  let resizeObs = null;
  let animId = null;
  let mapData = null;
  let initialized = false;
  let hoveredObj = null;
  let windowTexture = null; // textura procedural de ventanas (lazy init)

  // ============================================================================
  // PROYECCIÓN lat/lon → x,y modelo (metros)
  // ============================================================================
  function latlonToModelXY(lat, lon) {
    return {
      x: (lon - CENTER_LON) * M_PER_LON,
      y: (lat - CENTER_LAT) * M_PER_LAT,
    };
  }

  // ============================================================================
  // COLORES
  // ============================================================================
  function colorForHealth(score) {
    if (score == null || isNaN(score)) return 0x9e9e9e; // gris (sin dato)
    if (score >= 70) return 0x4CAF50; // verde
    if (score >= 40) return 0xFFA726; // amarillo/ámbar
    return 0xEF5350;                  // rojo
  }

  // ============================================================================
  // SHAPE HELPERS
  // ============================================================================
  function makeShape(pts) {
    const shape = new THREE.Shape();
    if (!pts || pts.length === 0) return shape;
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    return shape;
  }

  // ============================================================================
  // INIT
  // ============================================================================
  async function init(containerSel) {
    containerEl = typeof containerSel === 'string'
      ? document.querySelector(containerSel)
      : containerSel;
    if (!containerEl) return;

    if (initialized) {
      // Re-attach + reload trees only
      if (renderer && !containerEl.contains(renderer.domElement)) {
        containerEl.innerHTML = '';
        containerEl.appendChild(renderer.domElement);
        if (popupEl) containerEl.appendChild(popupEl);
        handleResize();
      }
      await loadTrees();
      return;
    }

    // Loading state
    containerEl.style.position = 'relative';
    containerEl.style.minHeight = '500px';
    containerEl.innerHTML =
      '<div id="izta-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#666;background:#f5f5f0;">' +
        '<div style="text-align:center;">' +
          '<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i>' +
          '<div style="margin-top:0.7rem;">Cargando campus FES Iztacala 3D…</div>' +
        '</div>' +
      '</div>';

    // ---- Cargar JSON del campus ----
    try {
      const res = await fetch('data/iztacala_campus.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      mapData = await res.json();
    } catch (e) {
      console.error('Iztacala JSON load error:', e);
      containerEl.innerHTML =
        '<div style="padding:2rem;text-align:center;color:#c00;">' +
          '<i class="fas fa-exclamation-triangle"></i> Error cargando mapa del campus.<br>' +
          '<small style="color:#888;">Verifica que /data/iztacala_campus.json esté accesible.</small>' +
        '</div>';
      return;
    }

    // ---- Three.js scene ----
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8f0f5); // cielo muy claro casi blanco
    scene.fog = new THREE.Fog(0xe8f0f5, 1000, 2200);

    const w = containerEl.clientWidth || 800;
    const h = containerEl.clientHeight || 500;

    camera = new THREE.PerspectiveCamera(45, w / h, 1, 4000);
    // Posición inicial — se reajusta tras cargar el bbox
    camera.position.set(550, 500, 600);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    containerEl.innerHTML = '';
    containerEl.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;';

    // ---- Iluminación tipo "render arquitectónico" ----
    // Ambient suave + directional fuerte desde arriba-este (similar al mapa oficial UNAM)
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(amb);

    const sun = new THREE.DirectionalLight(0xfff8e8, 0.85);
    sun.position.set(400, 700, 250);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 2000;
    sun.shadow.camera.left = -700;
    sun.shadow.camera.right = 700;
    sun.shadow.camera.top = 700;
    sun.shadow.camera.bottom = -700;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Hemilight cielo→pasto para rellenar sombras con tonos correctos
    const hemi = new THREE.HemisphereLight(0xe8f0f5, 0x6fb24a, 0.4);
    scene.add(hemi);

    // ---- Terreno + boundary ----
    addTerrain(mapData.campus_boundary);

    // ---- Edificios ----
    (mapData.buildings || []).forEach(addBuilding);

    // ---- Auto-encuadrar cámara al bbox del campus ----
    fitCameraToCampus();

    // ---- Compass / norte ----
    addCompass();

    // ---- Controls ----
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // no debajo del piso
    controls.minDistance = 60;
    controls.maxDistance = 1800;
    controls.screenSpacePanning = false;

    // ---- Raycaster ----
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    renderer.domElement.addEventListener('click', onClick, false);
    renderer.domElement.addEventListener('mousemove', onMove, false);
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });

    // ---- Popup HTML ----
    popupEl = document.createElement('div');
    popupEl.id = 'izta-popup';
    popupEl.style.cssText = 'position:absolute;display:none;z-index:10;pointer-events:auto;' +
      'background:rgba(255,255,255,0.97);border-radius:12px;padding:0.7rem 0.9rem;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.25);min-width:200px;max-width:280px;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.85rem;' +
      'border:1px solid rgba(46,125,50,0.2);transform:translate(-50%,calc(-100% - 12px));';
    containerEl.appendChild(popupEl);

    // ---- HUD esquinas ----
    addHUD();

    // ---- Resize ----
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(handleResize);
      resizeObs.observe(containerEl);
    } else {
      window.addEventListener('resize', handleResize);
    }

    initialized = true;

    // ---- Cargar árboles desde Supabase ----
    await loadTrees();

    animate();
  }

  // ============================================================================
  // TERRENO + BOUNDARY
  // ============================================================================
  function addTerrain(boundary) {
    if (!boundary || boundary.length < 3) return;

    // Plano grande gris exterior (banqueta/fuera del campus)
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshLambertMaterial({ color: 0xa8a8a8 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.6;
    plane.receiveShadow = true;
    scene.add(plane);

    // ---- Anillo gris oscuro del boundary (estilo isométrico UNAM) ----
    // Generamos un ring extruido alrededor del polígono del campus
    const shape = makeShape(boundary);

    // Banqueta gris (extrudida levemente para dar sensación de "isla")
    const baseGeom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.5, bevelEnabled: false,
    });
    baseGeom.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = -0.5;
    base.receiveShadow = true;
    scene.add(base);

    // ---- Pasto verde brillante (encima de la banqueta) ----
    const grassGeom = new THREE.ShapeGeometry(shape);
    grassGeom.rotateX(-Math.PI / 2);
    const grassMat = new THREE.MeshLambertMaterial({
      color: 0x6fb24a, // verde vivo tipo mapa UNAM
      side: THREE.DoubleSide,
    });
    const grass = new THREE.Mesh(grassGeom, grassMat);
    grass.position.y = 0.05;
    grass.receiveShadow = true;
    scene.add(grass);

    // ---- Borde oscuro del campus (acento) ----
    const pts = boundary.map(p => new THREE.Vector3(p[0], 0.1, -p[1]));
    pts.push(pts[0]);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2d4a1a, linewidth: 2 });
    scene.add(new THREE.Line(lineGeom, lineMat));
  }

  // ============================================================================
  // TEXTURA PROCEDURAL DE VENTANAS
  // ============================================================================
  // Genera un canvas con un patrón de ventanas azules sobre pared crema.
  // La textura tiles 1 unidad horizontal = 4 m, 1 unidad vertical = 3.5 m
  // (un piso). UV coords se escalan en metros físicos por edificio.
  // ============================================================================
  function getWindowTexture() {
    if (windowTexture) return windowTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 224; // proporción 4×3.5 metros
    const ctx = canvas.getContext('2d');

    // Pared base (crema/beige claro)
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#fbf3e2');
    bg.addColorStop(1, '#eee2c5');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Línea horizontal sutil (separación de pisos)
    ctx.strokeStyle = 'rgba(150,120,80,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(canvas.width, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 4);
    ctx.lineTo(canvas.width, canvas.height - 4);
    ctx.stroke();

    // Ventanas: 4 columnas × 1 fila (un piso)
    const cols = 4;
    const winW = 38, winH = 60;
    const yPad = 70; // arriba para sea zócalo del piso
    const xMargin = 12;
    const usableW = canvas.width - 2 * xMargin;
    const colSpacing = (usableW - cols * winW) / (cols - 1);

    for (let c = 0; c < cols; c++) {
      const x = xMargin + c * (winW + colSpacing);
      const y = yPad;

      // Marco oscuro
      ctx.fillStyle = '#3a5066';
      ctx.fillRect(x - 1, y - 1, winW + 2, winH + 2);

      // Vidrio (gradiente azul cielo reflejo)
      const glassG = ctx.createLinearGradient(x, y, x, y + winH);
      glassG.addColorStop(0, '#9bc4dc');
      glassG.addColorStop(0.5, '#6fa3c4');
      glassG.addColorStop(1, '#5a8eb0');
      ctx.fillStyle = glassG;
      ctx.fillRect(x, y, winW, winH);

      // Cruz blanca de marco interno
      ctx.strokeStyle = '#f0e8d8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + winW / 2, y);
      ctx.lineTo(x + winW / 2, y + winH);
      ctx.moveTo(x, y + winH / 2);
      ctx.lineTo(x + winW, y + winH / 2);
      ctx.stroke();

      // Reflejo blanco diagonal sutil (esquina superior izquierda)
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + winW * 0.4, y + 2);
      ctx.lineTo(x + 2, y + winH * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    // Zócalo inferior (banda gris claro)
    ctx.fillStyle = '#cfc1a3';
    ctx.fillRect(0, canvas.height - 12, canvas.width, 12);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    windowTexture = tex;
    return tex;
  }

  // ============================================================================
  // EDIFICIOS — paredes con ventanas + techo coral
  // ============================================================================
  function addBuilding(b) {
    if (!b.pts || !b.pts.length || b.pts.length < 3) return;

    // ---- Altura: si no viene en tags, derivar del área del footprint ----
    // Edificios chicos (<200 m²) → 1 piso (3.5 m)
    // Medianos (200-700 m²) → 2 pisos (7 m)
    // Grandes (>700 m²) → 3 pisos (10.5 m)
    let height = parseFloat(b.tags?.height) || parseFloat(b.tags?.height_m);
    if (!height || isNaN(height)) {
      const area = polygonArea(b.pts);
      if (area < 200) height = 3.5;
      else if (area < 700) height = 7;
      else height = 10.5;
    }
    const numFloors = Math.max(1, Math.round(height / 3.5));

    // ---- Asegurar polígono cerrado ----
    const pts = b.pts.slice();
    const first = pts[0], last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);

    // ---- WALLS custom: BufferGeometry con UVs físicamente correctos ----
    // Para cada arista del polígono, generar un quad (2 triángulos).
    // U = perímetro acumulado / 4m (ancho de tile)
    // V = altura / 3.5m (alto de tile = 1 piso)
    const positions = [];
    const uvs = [];
    const indices = [];
    let vIdx = 0;

    const TILE_W = 4.0;  // 4 metros horizontales por tile
    const TILE_H = 3.5;  // 3.5 metros verticales por piso

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) continue;

      // Coords Three.js: x = JSON.x, z = -JSON.y
      const x0 = p0[0], z0 = -p0[1];
      const x1 = p1[0], z1 = -p1[1];

      // 4 vértices del quad
      // 0: bottom-start, 1: bottom-end, 2: top-end, 3: top-start
      positions.push(x0, 0, z0);
      positions.push(x1, 0, z1);
      positions.push(x1, height, z1);
      positions.push(x0, height, z0);

      // UVs: U va de 0 a (len/TILE_W), V va de 0 a (height/TILE_H)
      const uMax = len / TILE_W;
      const vMax = height / TILE_H;
      uvs.push(0, 0);
      uvs.push(uMax, 0);
      uvs.push(uMax, vMax);
      uvs.push(0, vMax);

      // Indices (2 triángulos por quad) — winding CCW visto desde fuera
      // Los pts del JSON están en CCW (visto desde +Z, mirando -Z),
      // pero después de mapear y → -z, el winding desde +Y queda invertido.
      // Para que las normales miren hacia afuera del edificio, usamos:
      //   tri 1: 0, 2, 1
      //   tri 2: 0, 3, 2
      indices.push(vIdx + 0, vIdx + 2, vIdx + 1);
      indices.push(vIdx + 0, vIdx + 3, vIdx + 2);
      vIdx += 4;
    }

    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    wallGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    wallGeom.setIndex(indices);
    wallGeom.computeVertexNormals();

    const wallMat = new THREE.MeshLambertMaterial({
      map: getWindowTexture(),
      side: THREE.DoubleSide,
    });
    const walls = new THREE.Mesh(wallGeom, wallMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    walls.userData = { type: 'building', data: b };
    scene.add(walls);
    buildingMeshes.push(walls);

    // ---- TECHO coral/salmón (ShapeGeometry separada) ----
    const shape = makeShape(b.pts);
    const roofGeom = new THREE.ShapeGeometry(shape);
    roofGeom.rotateX(-Math.PI / 2);
    // Variación de tono de techo (coral con leve aleatoriedad por edificio)
    const isSchool = b.tags?.building === 'school';
    const baseRoof = isSchool ? [0xc8554a, 0xd05a4d, 0xd86250] : [0xb04a40, 0xa84538];
    const roofColor = baseRoof[Math.abs(b.id || 0) % baseRoof.length];

    const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.y = height + 0.02;
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.userData = { type: 'building', data: b };
    scene.add(roof);
    buildingMeshes.push(roof);

    // ---- Borde oscuro del techo (alero) ----
    const ringPts = pts.map(p => new THREE.Vector3(p[0], height + 0.04, -p[1]));
    const lineG = new THREE.BufferGeometry().setFromPoints(ringPts);
    const lineM = new THREE.LineBasicMaterial({ color: 0x6b2820 });
    scene.add(new THREE.Line(lineG, lineM));

    // ---- Línea de separación de pisos en la pared (sutil) ----
    if (numFloors > 1) {
      for (let f = 1; f < numFloors; f++) {
        const yLine = (height / numFloors) * f;
        const floorRing = pts.map(p => new THREE.Vector3(p[0], yLine, -p[1]));
        const fG = new THREE.BufferGeometry().setFromPoints(floorRing);
        const fM = new THREE.LineBasicMaterial({ color: 0xb59f78, transparent: true, opacity: 0.5 });
        scene.add(new THREE.Line(fG, fM));
      }
    }
  }

  // Área de un polígono (shoelace) — para estimar pisos
  function polygonArea(pts) {
    if (!pts || pts.length < 3) return 0;
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      a += p0[0] * p1[1] - p1[0] * p0[1];
    }
    return Math.abs(a) / 2;
  }

  // ============================================================================
  // COMPASS (rosa de los vientos en el piso, esquina del campus)
  // ============================================================================
  function addCompass() {
    const bbox = computeBoundaryBBox();
    if (!bbox) return;

    // Esquina sur-este del campus en coords Three.js (x=JSON.x, z=-JSON.y)
    // sur = JSON.minY → Three.maxZ = -JSON.minY
    const cx = bbox.maxX - 30;
    const cz = -bbox.minY - 30; // -JSON.minY (positivo) menos margen

    // Disco
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(15, 24),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, 0.1, cz);
    scene.add(disc);

    // Flecha hacia +Y JSON = -Z Three (norte)
    const arrowDir = new THREE.Vector3(0, 0, -1);
    const arrowOrigin = new THREE.Vector3(cx, 0.2, cz);
    const arrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, 18, 0xc62828, 6, 4);
    scene.add(arrow);
  }

  function fitCameraToCampus() {
    const bb = computeBoundaryBBox();
    if (!bb) return;
    // En Three.js: x = JSON.x, z = -JSON.y
    const cx = (bb.minX + bb.maxX) / 2;
    const cz = -(bb.minY + bb.maxY) / 2;
    const sizeX = bb.maxX - bb.minX;
    const sizeZ = bb.maxY - bb.minY;
    const radius = Math.max(sizeX, sizeZ) * 0.6;

    // Vista isométrica desde el sur-este
    camera.position.set(cx + radius * 0.85, radius * 0.95, cz + radius * 1.05);
    camera.lookAt(cx, 0, cz);

    if (controls) {
      controls.target.set(cx, 0, cz);
      controls.update();
    }
  }

  function computeBoundaryBBox() {
    if (!mapData?.campus_boundary?.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    mapData.campus_boundary.forEach(p => {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });
    return { minX, maxX, minY, maxY };
  }

  // ============================================================================
  // ÁRBOLES (capa dinámica desde Supabase)
  // ============================================================================
  async function loadTrees() {
    // Limpiar árboles anteriores
    treeMeshes.forEach(t => {
      scene.remove(t.group);
      t.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    });
    treeMeshes = [];

    try {
      // sb es global (definido en config.js como `const sb`)
      if (typeof sb === 'undefined') {
        console.warn('Supabase client not available');
        return;
      }

      const { data: trees, error } = await sb
        .from('trees_catalog')
        .select('id, tree_code, common_name, species, health_score, status, location_lat, location_lng, photo_url, initial_height_cm');

      if (error) throw error;

      const valid = (trees || []).filter(t => t.location_lat && t.location_lng);
      valid.forEach(addTree);

      updateTreeCountHUD(valid.length, (trees || []).length);
    } catch (e) {
      console.error('loadTrees error:', e);
      updateTreeCountHUD(0, 0, true);
    }
  }

  function addTree(treeData) {
    const { x, y } = latlonToModelXY(treeData.location_lat, treeData.location_lng);
    const heightM = Math.max(1.5, Math.min((treeData.initial_height_cm || 250) / 100, 12));

    // Tronco (cilindro)
    const trunkGeom = new THREE.CylinderGeometry(
      heightM * 0.08, heightM * 0.1, heightM * 0.55, 8
    );
    const trunk = new THREE.Mesh(
      trunkGeom,
      new THREE.MeshLambertMaterial({ color: 0x6d4c2a })
    );
    trunk.position.set(x, heightM * 0.275, -y);
    trunk.castShadow = true;

    // Copa (esfera con color por salud)
    const crownColor = colorForHealth(treeData.health_score);
    const crownGeom = new THREE.SphereGeometry(heightM * 0.42, 10, 8);
    const crown = new THREE.Mesh(
      crownGeom,
      new THREE.MeshLambertMaterial({ color: crownColor })
    );
    crown.position.set(x, heightM * 0.78, -y);
    crown.castShadow = true;

    // Marcador inferior (anillo en el suelo del color de salud)
    const ringGeom = new THREE.RingGeometry(0.6, 1.0, 16);
    const ring = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({
        color: crownColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, -y);

    const group = new THREE.Group();
    group.add(trunk);
    group.add(crown);
    group.add(ring);
    group.userData = { type: 'tree', data: treeData };

    scene.add(group);
    treeMeshes.push({ group, crown, trunk, ring, data: treeData });
  }

  // ============================================================================
  // INTERACCIÓN — click + hover
  // ============================================================================
  function getEventNDC(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = ev.clientX != null ? ev.clientX :
               (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientX : 0);
    const cy = ev.clientY != null ? ev.clientY :
               (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientY : 0);
    return {
      x: ((cx - rect.left) / rect.width) * 2 - 1,
      y: -((cy - rect.top) / rect.height) * 2 + 1,
      screenX: cx - rect.left,
      screenY: cy - rect.top,
    };
  }

  function onClick(ev) {
    handlePick(ev);
  }
  function onTouchEnd(ev) {
    if (ev.changedTouches && ev.changedTouches.length === 1) {
      ev.preventDefault();
      handlePick(ev);
    }
  }

  function handlePick(ev) {
    const ndc = getEventNDC(ev);
    mouse.set(ndc.x, ndc.y);
    raycaster.setFromCamera(mouse, camera);

    // Primero árboles (capa que está encima)
    const treeObjs = treeMeshes.flatMap(t => [t.crown, t.trunk]);
    let hit = raycaster.intersectObjects(treeObjs, false)[0];
    if (hit) {
      // Subir al group
      let g = hit.object;
      while (g.parent && g.parent.userData?.type !== 'tree') g = g.parent;
      const treeGroup = g.parent?.userData?.type === 'tree' ? g.parent :
                        (g.userData?.type === 'tree' ? g : null);
      if (treeGroup) {
        showTreePopup(treeGroup.userData.data, ndc.screenX, ndc.screenY);
        return;
      }
    }

    // Luego edificios
    hit = raycaster.intersectObjects(buildingMeshes, false)[0];
    if (hit) {
      showBuildingPopup(hit.object.userData.data, ndc.screenX, ndc.screenY);
      return;
    }

    // Click en vacío → cerrar popup
    hidePopup();
  }

  function onMove(ev) {
    if (!treeMeshes.length && !buildingMeshes.length) return;
    const ndc = getEventNDC(ev);
    mouse.set(ndc.x, ndc.y);
    raycaster.setFromCamera(mouse, camera);

    const treeObjs = treeMeshes.flatMap(t => [t.crown, t.trunk]);
    const allObjs = [...treeObjs, ...buildingMeshes];
    const hit = raycaster.intersectObjects(allObjs, false)[0];

    if (hit) {
      renderer.domElement.style.cursor = 'pointer';
    } else {
      renderer.domElement.style.cursor = 'grab';
    }
  }

  // ============================================================================
  // POPUPS
  // ============================================================================
  async function showTreePopup(treeData, screenX, screenY) {
    if (!popupEl) return;
    let photoSrc = '';
    try {
      if (treeData.photo_url && typeof sb !== 'undefined') {
        if (/^https?:\/\//.test(treeData.photo_url)) {
          photoSrc = treeData.photo_url;
        } else {
          const { data } = await sb.storage
            .from('tree-photos')
            .createSignedUrl(treeData.photo_url, 3600);
          photoSrc = data?.signedUrl || '';
        }
      }
    } catch (_) {}

    const score = treeData.health_score;
    const badgeColor =
      score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
    const badgeText = score != null ? `${score}/100` : 's/dato';

    const esc = window.escapeHtml || (s => s);

    popupEl.innerHTML =
      (photoSrc ?
        `<img src="${photoSrc}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:0.5rem;" onerror="this.style.display='none'">`
        : '') +
      `<div style="font-weight:600;color:#1b5e20;font-size:0.95rem;line-height:1.2;">${esc(treeData.common_name || 'Árbol')}</div>` +
      (treeData.species ? `<div style="color:#666;font-size:0.78rem;font-style:italic;">${esc(treeData.species)}</div>` : '') +
      `<div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;flex-wrap:wrap;">` +
        `<span style="background:${badgeColor};color:#fff;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;">Salud: ${badgeText}</span>` +
        (treeData.tree_code ? `<span style="color:#999;font-size:0.7rem;font-family:ui-monospace,monospace;">${esc(treeData.tree_code)}</span>` : '') +
      `</div>` +
      `<div style="display:flex;gap:0.4rem;margin-top:0.7rem;">` +
        `<button onclick="window.IztacalaMap._openTreeDetail(${treeData.id})" style="flex:1;background:#2E7D32;color:#fff;border:none;padding:0.4rem;border-radius:7px;font-size:0.78rem;font-weight:600;cursor:pointer;">Ver detalle</button>` +
        `<button onclick="window.IztacalaMap._closePopup()" style="background:#f5f5f5;color:#444;border:none;padding:0.4rem 0.7rem;border-radius:7px;font-size:0.78rem;cursor:pointer;">✕</button>` +
      `</div>`;

    placePopup(screenX, screenY);
  }

  function showBuildingPopup(b, screenX, screenY) {
    if (!popupEl) return;
    const esc = window.escapeHtml || (s => s);
    const bType = b.tags?.building || 'edificio';

    popupEl.innerHTML =
      `<div style="font-weight:600;color:#1a4480;font-size:0.95rem;line-height:1.2;">🏛️ ${esc(b.name || 'Edificio')}</div>` +
      `<div style="color:#666;font-size:0.78rem;margin-top:0.2rem;">${esc(bType)}</div>` +
      `<div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;color:#999;font-size:0.7rem;font-family:ui-monospace,monospace;">` +
        `OSM ID: ${b.id}` +
      `</div>` +
      `<div style="text-align:right;margin-top:0.5rem;">` +
        `<button onclick="window.IztacalaMap._closePopup()" style="background:#f5f5f5;color:#444;border:none;padding:0.3rem 0.7rem;border-radius:7px;font-size:0.75rem;cursor:pointer;">Cerrar</button>` +
      `</div>`;

    placePopup(screenX, screenY);
  }

  function placePopup(screenX, screenY) {
    if (!popupEl) return;
    popupEl.style.left = screenX + 'px';
    popupEl.style.top = screenY + 'px';
    popupEl.style.display = 'block';
  }

  function hidePopup() {
    if (popupEl) popupEl.style.display = 'none';
  }

  // ============================================================================
  // HUD (esquinas: leyenda + counter)
  // ============================================================================
  function addHUD() {
    if (!containerEl) return;

    // Leyenda salud (top-left)
    const legend = document.createElement('div');
    legend.id = 'izta-legend';
    legend.style.cssText = 'position:absolute;top:0.7rem;left:0.7rem;z-index:5;' +
      'background:rgba(255,255,255,0.92);padding:0.5rem 0.75rem;border-radius:10px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.15);font-size:0.72rem;font-family:-apple-system,sans-serif;' +
      'border:1px solid rgba(0,0,0,0.08);';
    legend.innerHTML =
      '<div style="font-weight:600;color:#333;margin-bottom:0.3rem;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Salud del árbol</div>' +
      '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;">' +
        '<span style="display:flex;align-items:center;gap:0.3rem;"><span style="width:10px;height:10px;border-radius:50%;background:#4CAF50;display:inline-block;"></span>Buena (≥70)</span>' +
        '<span style="display:flex;align-items:center;gap:0.3rem;"><span style="width:10px;height:10px;border-radius:50%;background:#FFA726;display:inline-block;"></span>Media (40-69)</span>' +
        '<span style="display:flex;align-items:center;gap:0.3rem;"><span style="width:10px;height:10px;border-radius:50%;background:#EF5350;display:inline-block;"></span>Mala (&lt;40)</span>' +
      '</div>';
    containerEl.appendChild(legend);

    // Counter (top-right)
    const counter = document.createElement('div');
    counter.id = 'izta-counter';
    counter.style.cssText = 'position:absolute;top:0.7rem;right:0.7rem;z-index:5;' +
      'background:rgba(46,125,50,0.92);color:#fff;padding:0.5rem 0.85rem;border-radius:10px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.15);font-size:0.78rem;font-family:-apple-system,sans-serif;font-weight:600;';
    counter.innerHTML = '<i class="fas fa-tree"></i> <span id="izta-tree-count">cargando…</span>';
    containerEl.appendChild(counter);

    // Hint controles (bottom-right)
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:0.7rem;right:0.7rem;z-index:5;' +
      'background:rgba(0,0,0,0.55);color:#fff;padding:0.4rem 0.7rem;border-radius:8px;' +
      'font-size:0.7rem;font-family:-apple-system,sans-serif;backdrop-filter:blur(6px);';
    hint.innerHTML = '🖱️ arrastra · 🖱️ rueda zoom · ⌥+arrastra desplazar';
    containerEl.appendChild(hint);
  }

  function updateTreeCountHUD(visible, total, isError) {
    const el = document.getElementById('izta-tree-count');
    if (!el) return;
    if (isError) { el.textContent = 'error'; return; }
    if (total === 0) { el.textContent = '0 árboles'; return; }
    if (visible === total) {
      el.textContent = `${total} árbol${total !== 1 ? 'es' : ''}`;
    } else {
      el.textContent = `${visible}/${total} con ubicación`;
    }
  }

  // ============================================================================
  // ABRIR DETALLE DE ÁRBOL (delegado al admin existente)
  // ============================================================================
  function _openTreeDetail(treeId) {
    hidePopup();
    if (typeof window.editAdminTree === 'function') {
      window.editAdminTree(treeId);
    } else {
      console.warn('editAdminTree not available');
    }
  }

  function _closePopup() { hidePopup(); }

  // ============================================================================
  // RESIZE + ANIMATE
  // ============================================================================
  function handleResize() {
    if (!renderer || !camera || !containerEl) return;
    const w = containerEl.clientWidth || 800;
    const h = containerEl.clientHeight || 500;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    if (!initialized) return;
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  return {
    init,
    reload: loadTrees,
    latlonToModelXY,
    _openTreeDetail,
    _closePopup,
  };
})();
