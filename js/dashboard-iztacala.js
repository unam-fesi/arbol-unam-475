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
    scene.background = new THREE.Color(0xc7e0f2);
    scene.fog = new THREE.Fog(0xc7e0f2, 800, 1800);

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

    // ---- Iluminación ----
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);

    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(300, 600, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 1500;
    sun.shadow.camera.left = -600;
    sun.shadow.camera.right = 600;
    sun.shadow.camera.top = 600;
    sun.shadow.camera.bottom = -600;
    scene.add(sun);

    // Hemilight para llenar sombras suavemente
    const hemi = new THREE.HemisphereLight(0xc7e0f2, 0x9bc285, 0.35);
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

    // Plano grande de pasto (verde) bajo todo
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshLambertMaterial({ color: 0xc8c0a0 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.5;
    plane.receiveShadow = true;
    scene.add(plane);

    // Polígono del campus (verde más vivo)
    const shape = makeShape(boundary);
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshLambertMaterial({
      color: 0x9bc285,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Borde del campus (línea oscura)
    const pts = boundary.map(p => new THREE.Vector3(p[0], 0.05, -p[1]));
    pts.push(pts[0]);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2E7D32, linewidth: 2 });
    scene.add(new THREE.Line(lineGeom, lineMat));
  }

  // ============================================================================
  // EDIFICIOS
  // ============================================================================
  function addBuilding(b) {
    if (!b.pts || b.pts.length < 3) return;

    // Altura (default 6m, escalada por tamaño visualmente)
    let height = parseFloat(b.tags?.height) || parseFloat(b.tags?.height_m) || 6;

    // Color según tipo
    const isSchool = b.tags?.building === 'school';
    const baseColor = isSchool ? 0xe8d8b8 : 0xd9c8a8; // tonos beige
    const roofColor = isSchool ? 0xa0826d : 0x8a6d56;

    // Footprint extruido
    const shape = makeShape(b.pts);
    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    extrude.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshLambertMaterial({ color: baseColor });
    const mesh = new THREE.Mesh(extrude, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: 'building', data: b };
    scene.add(mesh);
    buildingMeshes.push(mesh);

    // Borde superior del edificio (línea oscura para realzar techos)
    const ringPts = b.pts.map(p => new THREE.Vector3(p[0], height + 0.05, -p[1]));
    if (ringPts.length > 1) {
      ringPts.push(ringPts[0]);
      const lineG = new THREE.BufferGeometry().setFromPoints(ringPts);
      const lineM = new THREE.LineBasicMaterial({ color: roofColor });
      scene.add(new THREE.Line(lineG, lineM));
    }
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
