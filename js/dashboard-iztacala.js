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
  // SHAPE HELPERS (legacy — solo usados por funciones procedurales que ya no
  // se invocan desde init(), preservadas como referencia)
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

    // (El JSON ya no se carga aquí — usamos el modelo GLB del Blender directamente.
    //  La proyección lat/lon → XY sigue funcionando porque las constantes están
    //  hardcodeadas y el modelo Blender usa el mismo sistema de coordenadas.)

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

    // ---- Cargar el modelo GLB del campus (Blender) ----
    await loadCampusGLB();

    // ---- Auto-encuadrar cámara al bbox del modelo ----
    fitCameraToCampus();

    // ---- Compass / norte (esquina del modelo) ----
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
  // CARGAR MODELO GLB (campus completo desde Blender)
  // ============================================================================
  // El GLB trae: 118 partes de edificios (W=walls, R=roof) con osm_id en el
  // nombre, ~89 calles, 6 estacionamientos, 4 canchas, banqueta, pasto y
  // calles perimetrales. Materiales y geometría exactos del Blender.
  // ============================================================================
  function loadCampusGLB() {
    return new Promise((resolve) => {
      if (typeof THREE.GLTFLoader === 'undefined') {
        console.error('GLTFLoader not available');
        return resolve();
      }
      const loader = new THREE.GLTFLoader();
      loader.load(
        'data/iztacala_campus.glb',
        (gltf) => {
          const root = gltf.scene;

          // Caché de materiales mejorados (compartidos entre meshes)
          const matCache = {};
          const detailTasks = []; // tareas de overlay diferidas

          // Recorrer cada mesh para activar sombras, parsear nombre, mejorar
          // materiales y registrar como clickeable.
          root.traverse((obj) => {
            if (!obj.isMesh) return;

            obj.castShadow = true;
            obj.receiveShadow = true;

            const name = obj.name || '';
            const meta = parseMeshName(name);
            const matName = obj.material?.name || '';

            // ---- MEJORA DE MATERIALES con texturas procedurales ----
            if (matName === 'Mat_Asphalt') {
              if (!matCache.asphalt) matCache.asphalt = makeAsphaltMaterial();
              obj.material = matCache.asphalt;
            } else if (matName === 'Mat_Sidewalk') {
              if (!matCache.sidewalk) matCache.sidewalk = makeSidewalkMaterial();
              obj.material = matCache.sidewalk;
            } else if (matName === 'Mat_Grass' || matName === 'Mat_Grass_Dark') {
              // Pasto: leve mejora con variación de tono usando textura
              if (!matCache.grass) matCache.grass = makeGrassMaterial();
              obj.material = matCache.grass;
            }

            // Pasto/banqueta: solo recibe sombra (no proyecta)
            if (meta.kind === 'terrain') {
              obj.castShadow = false;
            }

            // Edificios: clickeable
            if (meta.kind === 'building') {
              obj.userData = {
                type: 'building',
                data: {
                  id: meta.osm_id,
                  name: meta.label,
                  tags: { building: 'school' },
                  part: meta.part,
                },
              };
              buildingMeshes.push(obj);
            }

            // Diferir detalles que requieren bbox (después del scene.add)
            if (meta.kind === 'court') {
              detailTasks.push({ type: 'court', mesh: obj, name });
            } else if (meta.kind === 'parking') {
              detailTasks.push({ type: 'parking', mesh: obj });
            } else if (meta.kind === 'road') {
              detailTasks.push({ type: 'road', mesh: obj });
            } else if (name === 'Calles_Perimetro') {
              detailTasks.push({ type: 'avenue', mesh: obj });
            }
          });

          scene.add(root);

          // Forzar actualización de matrices del mundo para que computeCenterline
          // pueda transformar vértices a world space correctamente
          root.updateMatrixWorld(true);

          // ---- Aplicar overlays de detalle DESPUÉS de scene.add ----
          // Acumulamos puntos de centerlines en arrays para crear pocos meshes
          // en lugar de uno por camino (mucho mejor para performance).
          const roadCenterlinePts = [];
          const avenueDashes = [];

          detailTasks.forEach((t) => {
            try {
              if (t.type === 'court') addCourtMarkings(t.mesh, t.name);
              else if (t.type === 'parking') addParkingLines(t.mesh);
              else if (t.type === 'road') {
                const cl = computeCenterline(t.mesh, 8);
                appendPolylineSegments(cl, roadCenterlinePts);
              } else if (t.type === 'avenue') {
                const cl = computeCenterline(t.mesh, 30);
                appendDashedPolyline(cl, avenueDashes, 3.0, 2.0);
              }
            } catch (e) {
              console.warn('Detail overlay failed:', t, e);
            }
          });

          // Crear meshes consolidados de líneas de caminos y avenidas
          if (roadCenterlinePts.length > 0) {
            const g = new THREE.BufferGeometry().setFromPoints(roadCenterlinePts);
            const m = new THREE.LineBasicMaterial({
              color: 0xffffff, transparent: true, opacity: 0.6,
            });
            scene.add(new THREE.LineSegments(g, m));
          }
          if (avenueDashes.length > 0) {
            const g = new THREE.BufferGeometry().setFromPoints(avenueDashes);
            const m = new THREE.LineBasicMaterial({ color: 0xffd54a });
            scene.add(new THREE.LineSegments(g, m));
          }

          console.log(
            `Iztacala GLB loaded: ${buildingMeshes.length} edificios clickeables`
          );
          resolve();
        },
        // onProgress
        (xhr) => {
          if (xhr.lengthComputable) {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            const lt = document.getElementById('izta-loading');
            if (lt) {
              const subtitle = lt.querySelector('div div:last-child');
              if (subtitle) subtitle.textContent = `Cargando campus 3D… ${pct}%`;
            }
          }
        },
        (err) => {
          console.error('GLB load error:', err);
          if (containerEl) {
            containerEl.innerHTML =
              '<div style="padding:2rem;text-align:center;color:#c00;">' +
                '<i class="fas fa-exclamation-triangle"></i> Error cargando modelo del campus.<br>' +
                '<small style="color:#888;">Verifica que /data/iztacala_campus.glb esté accesible.</small>' +
              '</div>';
          }
          resolve();
        }
      );
    });
  }

  // Extrae info útil del nombre del nodo:
  //   B_<label>_<osm_id>_W   → edificio, pared
  //   B_<label>_<osm_id>_R   → edificio, techo
  //   Road_<osm_id>_<idx>    → vialidad
  //   Park_<osm_id>          → estacionamiento
  //   Cancha_<tipo>          → cancha
  //   Banqueta | Pasto_Campus | Calles_Perimetro → terreno
  function parseMeshName(name) {
    if (!name) return { kind: 'unknown' };

    // Edificios: B_<label_with_underscores>_<osm_id>_(W|R)
    const buildMatch = name.match(/^B_(.+)_(\d+)_(W|R)$/);
    if (buildMatch) {
      return {
        kind: 'building',
        label: buildMatch[1].replace(/_/g, ' '),
        osm_id: parseInt(buildMatch[2], 10),
        part: buildMatch[3],
      };
    }

    if (/^Road_/.test(name)) return { kind: 'road' };
    if (/^Park_/.test(name)) return { kind: 'parking' };
    if (/^Cancha_/.test(name)) {
      let courtType = 'generic';
      if (/soccer|futbol/i.test(name)) courtType = 'soccer';
      else if (/basket/i.test(name)) courtType = 'basketball';
      else if (/show/i.test(name)) courtType = 'showball';
      return { kind: 'court', courtType };
    }
    if (name === 'Banqueta' || name === 'Pasto_Campus' || name === 'Calles_Perimetro') {
      return { kind: 'terrain' };
    }
    return { kind: 'other' };
  }

  // ============================================================================
  // TEXTURAS PROCEDURALES PARA MATERIALES DEL GLB
  // ============================================================================

  // Asfalto granulado con leve variación
  function makeAsphaltMaterial() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');

    g.fillStyle = '#3d3d3d';
    g.fillRect(0, 0, 256, 256);

    // Ruido de gravilla
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const v = 30 + Math.random() * 35;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1.5, 1.5);
    }
    // Grietas sutiles
    g.strokeStyle = 'rgba(20,20,20,0.6)';
    g.lineWidth = 0.5;
    for (let i = 0; i < 20; i++) {
      g.beginPath();
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
      g.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  // Cemento/banqueta con baldosas
  function makeSidewalkMaterial() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');

    // Base cemento claro
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#bdb6a8');
    grad.addColorStop(1, '#a8a195');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);

    // Líneas de baldosas (juntas)
    g.strokeStyle = 'rgba(80,75,65,0.55)';
    g.lineWidth = 1.5;
    for (let y = 0; y <= 256; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    }
    for (let x = 0; x <= 256; x += 64) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke();
    }

    // Manchas / desgaste
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random() * 6 + 2;
      g.fillStyle = `rgba(140,130,115,${Math.random() * 0.25})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  // Pasto con variación de tono
  function makeGrassMaterial() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');

    g.fillStyle = '#6fb24a';
    g.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 1200; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const v = Math.random();
      const r = 90 + Math.floor(v * 30);
      const gr = 150 + Math.floor(v * 40);
      const b = 60 + Math.floor(v * 25);
      g.fillStyle = `rgba(${r},${gr},${b},${0.35 + Math.random() * 0.3})`;
      g.fillRect(x, y, 1.2, 1.2);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20);
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  // ============================================================================
  // OVERLAYS DE LÍNEAS — CANCHAS Y ESTACIONAMIENTOS
  // ============================================================================

  // Marcas reglamentarias en cancha según tipo
  function addCourtMarkings(mesh, name) {
    const bbox = new THREE.Box3().setFromObject(mesh);
    if (!isFinite(bbox.min.x)) return;

    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;
    const sx = bbox.max.x - bbox.min.x;
    const sz = bbox.max.z - bbox.min.z;
    const yLine = bbox.max.y + 0.04;

    // Lado largo determina orientación de la línea central
    const longAxis = sx >= sz ? 'x' : 'z';
    const longLen = Math.max(sx, sz);
    const shortLen = Math.min(sx, sz);

    const points = [];

    // Borde inset
    const inset = 0.6;
    const xMin = bbox.min.x + inset;
    const xMax = bbox.max.x - inset;
    const zMin = bbox.min.z + inset;
    const zMax = bbox.max.z - inset;

    // Rectángulo perimetral (común a todas)
    pushRect(points, xMin, xMax, zMin, zMax, yLine);

    // Línea media
    if (longAxis === 'x') {
      // Línea perpendicular al largo, parte el rectángulo
      points.push(
        new THREE.Vector3(cx, yLine, zMin),
        new THREE.Vector3(cx, yLine, zMax)
      );
    } else {
      points.push(
        new THREE.Vector3(xMin, yLine, cz),
        new THREE.Vector3(xMax, yLine, cz)
      );
    }

    // Círculo central
    const r = Math.min(sx, sz) * 0.13;
    pushCircle(points, cx, cz, yLine, r, 32);

    const lname = (name || '').toLowerCase();
    const isSoccer = /soccer|futbol/.test(lname);
    const isBasket = /basket/.test(lname);

    if (isSoccer) {
      // Áreas de portería en los extremos cortos
      const goalDepth = shortLen * 0.18;
      const goalWidth = longLen * 0.12;
      if (longAxis === 'x') {
        // Portería en xMin y xMax
        const zg1 = cz - goalWidth / 2;
        const zg2 = cz + goalWidth / 2;
        pushRect(points, xMin, xMin + goalDepth, zg1, zg2, yLine);
        pushRect(points, xMax - goalDepth, xMax, zg1, zg2, yLine);
      } else {
        const xg1 = cx - goalWidth / 2;
        const xg2 = cx + goalWidth / 2;
        pushRect(points, xg1, xg2, zMin, zMin + goalDepth, yLine);
        pushRect(points, xg1, xg2, zMax - goalDepth, zMax, yLine);
      }
    } else if (isBasket) {
      // Áreas de tiros libres (rectángulos pequeños en los extremos cortos)
      const keyDepth = shortLen * 0.40;
      const keyWidth = longLen * 0.20;
      if (longAxis === 'x') {
        const zk1 = cz - keyWidth / 2;
        const zk2 = cz + keyWidth / 2;
        pushRect(points, xMin, xMin + keyDepth, zk1, zk2, yLine);
        pushRect(points, xMax - keyDepth, xMax, zk1, zk2, yLine);
        // Semicírculo de tiros libres
        pushArc(points, xMin + keyDepth, cz, yLine, keyWidth / 2, 16, -Math.PI / 2, Math.PI / 2);
        pushArc(points, xMax - keyDepth, cz, yLine, keyWidth / 2, 16, Math.PI / 2, 3 * Math.PI / 2);
      } else {
        const xk1 = cx - keyWidth / 2;
        const xk2 = cx + keyWidth / 2;
        pushRect(points, xk1, xk2, zMin, zMin + keyDepth, yLine);
        pushRect(points, xk1, xk2, zMax - keyDepth, zMax, yLine);
        pushArc(points, cx, zMin + keyDepth, yLine, keyWidth / 2, 16, 0, Math.PI);
        pushArc(points, cx, zMax - keyDepth, yLine, keyWidth / 2, 16, Math.PI, 2 * Math.PI);
      }
    }
    // (showball / generic: solo rectángulo + línea central + círculo)

    if (points.length === 0) return;
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lines = new THREE.LineSegments(geom, mat);
    scene.add(lines);
  }

  // Líneas de cajones de estacionamiento perpendiculares al lado largo
  function addParkingLines(mesh) {
    const bbox = new THREE.Box3().setFromObject(mesh);
    if (!isFinite(bbox.min.x)) return;

    const sx = bbox.max.x - bbox.min.x;
    const sz = bbox.max.z - bbox.min.z;
    const yLine = bbox.max.y + 0.04;

    if (sx < 4 || sz < 4) return; // muy chico, omitir

    const longAxis = sx >= sz ? 'x' : 'z';
    const longLen = Math.max(sx, sz);
    const slotW = 2.7; // ancho típico de cajón
    const numSlots = Math.max(4, Math.floor(longLen / slotW));

    const points = [];

    // Marco perimetral
    const inset = 0.4;
    const xMin = bbox.min.x + inset;
    const xMax = bbox.max.x - inset;
    const zMin = bbox.min.z + inset;
    const zMax = bbox.max.z - inset;
    pushRect(points, xMin, xMax, zMin, zMax, yLine);

    // Líneas de cajones perpendiculares al lado largo
    for (let i = 1; i < numSlots; i++) {
      const t = i / numSlots;
      if (longAxis === 'x') {
        const x = bbox.min.x + t * sx;
        points.push(
          new THREE.Vector3(x, yLine, zMin),
          new THREE.Vector3(x, yLine, zMax)
        );
      } else {
        const z = bbox.min.z + t * sz;
        points.push(
          new THREE.Vector3(xMin, yLine, z),
          new THREE.Vector3(xMax, yLine, z)
        );
      }
    }

    // Si el estacionamiento es muy ancho, agregar línea central
    // (separación entre dos filas espalda con espalda)
    const shortLen = Math.min(sx, sz);
    if (shortLen > 8) {
      if (longAxis === 'x') {
        const cz = (bbox.min.z + bbox.max.z) / 2;
        points.push(
          new THREE.Vector3(xMin, yLine, cz),
          new THREE.Vector3(xMax, yLine, cz)
        );
      } else {
        const cx = (bbox.min.x + bbox.max.x) / 2;
        points.push(
          new THREE.Vector3(cx, yLine, zMin),
          new THREE.Vector3(cx, yLine, zMax)
        );
      }
    }

    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const lines = new THREE.LineSegments(geom, mat);
    scene.add(lines);
  }

  // Helpers de geometría
  function pushRect(points, xMin, xMax, zMin, zMax, y) {
    points.push(
      new THREE.Vector3(xMin, y, zMin), new THREE.Vector3(xMax, y, zMin),
      new THREE.Vector3(xMax, y, zMin), new THREE.Vector3(xMax, y, zMax),
      new THREE.Vector3(xMax, y, zMax), new THREE.Vector3(xMin, y, zMax),
      new THREE.Vector3(xMin, y, zMax), new THREE.Vector3(xMin, y, zMin)
    );
  }
  function pushCircle(points, cx, cz, y, r, segments) {
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r),
        new THREE.Vector3(cx + Math.cos(a2) * r, y, cz + Math.sin(a2) * r)
      );
    }
  }
  function pushArc(points, cx, cz, y, r, segments, startAngle, endAngle) {
    const total = segments;
    for (let i = 0; i < total; i++) {
      const a1 = startAngle + (i / total) * (endAngle - startAngle);
      const a2 = startAngle + ((i + 1) / total) * (endAngle - startAngle);
      points.push(
        new THREE.Vector3(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r),
        new THREE.Vector3(cx + Math.cos(a2) * r, y, cz + Math.sin(a2) * r)
      );
    }
  }

  // ============================================================================
  // CENTERLINE — algoritmo de bandas promediadas
  // ============================================================================
  // Para un mesh tipo "calle" (largo y delgado), divide el eje largo del bbox
  // en N bandas. Para cada banda, promedia la coordenada perpendicular de los
  // vértices del mesh que caen en esa banda. La conexión de esos promedios da
  // una polilínea que aproxima el centro del camino (funciona para rectos,
  // ligeramente curvos, y en L con cierta pérdida en las esquinas).
  //
  // Retorna array de THREE.Vector3 ordenados a lo largo del eje, o [] si el
  // camino es muy cuadrado / muy chico para tener centerline.
  // ============================================================================
  function computeCenterline(mesh, samples) {
    if (!mesh || !mesh.geometry) return [];
    const posAttr = mesh.geometry.getAttribute('position');
    if (!posAttr || posAttr.count < 3) return [];

    const bbox = new THREE.Box3().setFromObject(mesh);
    if (!isFinite(bbox.min.x)) return [];

    const sx = bbox.max.x - bbox.min.x;
    const sz = bbox.max.z - bbox.min.z;
    const longLen = Math.max(sx, sz);
    const shortLen = Math.min(sx, sz);

    // Filtros: muy chico o muy cuadrado (ratio < 2:1) → omitir
    if (longLen < 6) return [];
    if (longLen / Math.max(shortLen, 0.01) < 2.0) return [];

    const longAxis = sx >= sz ? 'x' : 'z';
    const yLine = bbox.max.y + 0.04;

    // Transformar vértices a world space (una sola vez)
    const tmp = new THREE.Vector3();
    const worldVerts = [];
    for (let i = 0; i < posAttr.count; i++) {
      tmp.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      tmp.applyMatrix4(mesh.matrixWorld);
      worldVerts.push({ x: tmp.x, z: tmp.z });
    }

    const N = Math.max(4, Math.min(samples, Math.floor(longLen / 3)));
    const minLong = longAxis === 'x' ? bbox.min.x : bbox.min.z;
    const bandSize = (longAxis === 'x' ? sx : sz) / N;

    const points = [];
    for (let i = 0; i < N; i++) {
      const bandMin = minLong + i * bandSize;
      const bandMax = bandMin + bandSize;

      let sumPerp = 0;
      let count = 0;
      for (let v = 0; v < worldVerts.length; v++) {
        const w = worldVerts[v];
        const along = longAxis === 'x' ? w.x : w.z;
        if (along >= bandMin && along <= bandMax) {
          sumPerp += longAxis === 'x' ? w.z : w.x;
          count++;
        }
      }
      if (count < 2) continue;

      const perpAvg = sumPerp / count;
      const alongCenter = bandMin + bandSize * 0.5;
      const p = (longAxis === 'x')
        ? new THREE.Vector3(alongCenter, yLine, perpAvg)
        : new THREE.Vector3(perpAvg, yLine, alongCenter);
      points.push(p);
    }
    return points;
  }

  // Convertir polilínea (puntos consecutivos) a pares para LineSegments
  function appendPolylineSegments(polyline, out) {
    for (let i = 0; i < polyline.length - 1; i++) {
      out.push(polyline[i], polyline[i + 1]);
    }
  }

  // Convertir polilínea a pares discontinuos (dashes)
  // dashLen y gapLen en metros
  function appendDashedPolyline(polyline, out, dashLen, gapLen) {
    if (polyline.length < 2) return;
    const total = dashLen + gapLen;

    // Tomamos toda la polilínea como una secuencia continua y vamos
    // recorriéndola con un cursor de distancia "t". Cada [t, t+dashLen]
    // se convierte en un segmento; saltamos gapLen y repetimos.
    let inDash = true;
    let remain = dashLen;
    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i];
      const b = polyline[i + 1];
      const segLen = a.distanceTo(b);
      if (segLen < 0.01) continue;

      let cursor = 0;
      let segStart = a.clone();
      while (cursor < segLen) {
        const need = inDash ? remain : remain;
        const take = Math.min(need, segLen - cursor);
        const t1 = cursor / segLen;
        const t2 = (cursor + take) / segLen;
        const p1 = new THREE.Vector3().lerpVectors(a, b, t1);
        const p2 = new THREE.Vector3().lerpVectors(a, b, t2);
        if (inDash) out.push(p1, p2);

        cursor += take;
        remain -= take;
        if (remain <= 0.001) {
          inDash = !inDash;
          remain = inDash ? dashLen : gapLen;
        }
      }
    }
  }

  // ============================================================================
  // (Funciones legacy deshabilitadas — geometría procedural reemplazada por GLB)
  // ============================================================================
  // eslint-disable-next-line no-unused-vars
  function _legacy_addTerrain(boundary) {
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
    // Calcula el bbox del modelo GLB cargado (en coords Three.js: x, z).
    // Convierte de vuelta a coords JSON (y = -z) para mantener API consistente.
    if (!scene) return null;
    const box = new THREE.Box3();
    let hasMesh = false;
    scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const meshBox = new THREE.Box3().setFromObject(obj);
        if (isFinite(meshBox.min.x)) {
          box.union(meshBox);
          hasMesh = true;
        }
      }
    });
    if (!hasMesh) return null;
    return {
      minX: box.min.x,
      maxX: box.max.x,
      // En JSON coords, y = -z (Three.js)
      minY: -box.max.z,
      maxY: -box.min.z,
    };
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

      console.log(`🌳 Iztacala: ${valid.length} árboles con coordenadas plotteados (de ${(trees || []).length} totales en BD)`);
      updateTreeCountHUD(valid.length, (trees || []).length);
    } catch (e) {
      console.error('loadTrees error:', e);
      updateTreeCountHUD(0, 0, true);
    }
  }

  // ---- Cache global de modelos GLB de árboles para no recargarlos por cada árbol ----
  const TREE_MODELS_CACHE = {};
  // Mapeo especie/tipo → archivo GLB. Si el archivo no existe, se usa el modelo procedural.
  // Pon los GLB en /data/trees/ — recomendado: descargar pack CC0 de Quaternius.
  function _pickTreeModelPath(treeData) {
    // Un solo modelo para TODOS los árboles. La salud se distingue por el
    // tinte de color de la copa + anillo en el suelo. El detalle por especie
    // se ve en el modal de detalle del árbol, no en el mapa.
    return 'data/trees/tree_model';
  }

  function _getTreeModel(stem) {
    if (TREE_MODELS_CACHE[stem]) return TREE_MODELS_CACHE[stem];
    TREE_MODELS_CACHE[stem] = new Promise((resolve) => {
      if (typeof THREE.GLTFLoader === 'undefined') {
        console.error('❌ THREE.GLTFLoader no está cargado');
        return resolve(null);
      }
      const loader = new THREE.GLTFLoader();
      const tryLoad = (path, onFail) => {
        console.log(`🔍 Intentando cargar ${path}…`);
        loader.load(path,
          (gltf) => {
            console.log(`✅ Modelo cargado: ${path}`);
            resolve(gltf.scene);
          },
          undefined,
          (err) => {
            console.warn(`⚠ Falló ${path}:`, err?.message || err);
            onFail();
          }
        );
      };
      tryLoad(stem + '.glb', () => {
        tryLoad(stem + '.gltf', () => {
          console.warn(`❌ No se cargó modelo ${stem} (.glb ni .gltf) — fallback procedural`);
          resolve(null);
        });
      });
    });
    return TREE_MODELS_CACHE[stem];
  }

  function addTree(treeData) {
    // SIN clamp — preservamos coords reales. El polígono que se usaba antes
    // estaba mal calibrado y aplastaba todos los árboles contra su borde.
    // Si un árbol tiene GPS impreciso, se renderiza ligeramente fuera del
    // modelo GLB; mejor eso que aplastar 78 árboles en el mismo lugar.
    const { x, y } = latlonToModelXY(treeData.location_lat, treeData.location_lng);
    // Escala visual EXAGERADA porque el campus es de 800x500m y un árbol real
    // de 5m sería un puntito desde la cámara. Los datos reales no cambian.
    const realHeight = (treeData.initial_height_cm || 400) / 100;
    const heightM = Math.max(8, Math.min(realHeight * 2.5, 28));

    // Intentar cargar modelo GLB. Si existe, usarlo. Si no, fallback procedural.
    const modelPath = _pickTreeModelPath(treeData);
    _getTreeModel(modelPath).then(template => {
      if (template) {
        _addTreeFromModel(treeData, x, y, heightM, template);
      } else {
        _addTreeProcedural(treeData, x, y, heightM);
      }
    });
  }

  // Coloca un clon del modelo GLB en la posición del árbol
  let _firstModelLogged = false;
  function _addTreeFromModel(treeData, x, y, heightM, template) {
    const tree = template.clone(true);

    // Calcular bounding box del template para normalizar la escala
    const box = new THREE.Box3().setFromObject(tree);
    const size = new THREE.Vector3();
    box.getSize(size);
    const modelHeight = size.y || size.x || 1;
    const scale = heightM / modelHeight;
    tree.scale.setScalar(scale);

    // Log SOLO la primera vez para diagnosticar
    if (!_firstModelLogged) {
      _firstModelLogged = true;
      console.log(`🌳 Primer árbol GLB plantado | modelSize=${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} | scale=${scale.toFixed(3)} | heightFinal=${heightM.toFixed(1)}m | pos=(${x.toFixed(1)}, 0, ${(-y).toFixed(1)})`);
    }

    // Posicionar el árbol con la base al suelo
    tree.position.set(x, 0, -y);

    // Tintar follaje con color de salud (busca meshes verdosos)
    const crownColor = colorForHealth(treeData.health_score);
    tree.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material && o.material.color) {
          const c = o.material.color;
          if (c.g > c.r && c.g > c.b * 0.7) {
            o.material = o.material.clone();
            o.material.color.setHex(crownColor);
          }
        }
      }
    });

    const group = new THREE.Group();
    group.add(tree);
    _addHealthMarker(group, x, y, heightM, crownColor);

    group.userData = { type: 'tree', data: treeData };
    scene.add(group);
    const pickable = [];
    group.traverse(o => { if (o.isMesh) pickable.push(o); });
    treeMeshes.push({ group, crown: pickable[0], trunk: pickable[0], pickable, data: treeData });
  }

  // Círculo grande + anillo grueso + disco central blanco + cilindro corto
  // del color de salud para que sea SUPER VISIBLE desde la cámara aérea.
  function _addHealthMarker(group, x, y, heightM, crownColor) {
    // Disco BASE de color (relleno sólido, muy grande para verse de lejos)
    const baseR = heightM * 0.65;
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(baseR, 32),
      new THREE.MeshBasicMaterial({ color: crownColor, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(x, 0.15, -y);
    group.add(base);

    // Anillo de borde más oscuro (contraste)
    const ringInnerR = heightM * 0.60;
    const ringOuterR = heightM * 0.70;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ringInnerR, ringOuterR, 32),
      new THREE.MeshBasicMaterial({
        color: _darken(crownColor, 0.4),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.20, -y);
    group.add(ring);

    // Cilindro corto color salud al pie del árbol (visible desde el lateral)
    const stub = new THREE.Mesh(
      new THREE.CylinderGeometry(heightM * 0.08, heightM * 0.10, heightM * 0.20, 12),
      new THREE.MeshLambertMaterial({ color: crownColor })
    );
    stub.position.set(x, heightM * 0.10, -y);
    group.add(stub);
  }

  function _darken(hex, amount) {
    const c = new THREE.Color(hex);
    c.r *= (1 - amount);
    c.g *= (1 - amount);
    c.b *= (1 - amount);
    return c.getHex();
  }

  // Versión procedural (fallback si no hay modelo GLB cargado)
  function _addTreeProcedural(treeData, x, y, heightM) {

    // Determinar variante por especie/tipo del árbol (deterministic por id)
    const variantIdx = Math.abs(parseInt(String(treeData.id).replace(/[^\d]/g, '').slice(-4)) || 0) % 3;
    const isConifer = treeData.tree_type === 'endemico' && /pino|cedro|cipres|abeto|pinus|cupressus/i.test(treeData.species || '');

    const crownColor = colorForHealth(treeData.health_score);
    const darkCrown = _shadeColor(crownColor, -0.20);
    const lightCrown = _shadeColor(crownColor, 0.18);

    const group = new THREE.Group();

    // ---- TRONCO LARGO Y VISIBLE (60% de la altura total, no 40%) ----
    const trunkH = heightM * 0.55;
    const trunkGeom = new THREE.CylinderGeometry(
      heightM * 0.05,
      heightM * 0.08,
      trunkH,
      6
    );
    const trunk = new THREE.Mesh(
      trunkGeom,
      new THREE.MeshLambertMaterial({ color: 0x6d4a2a })
    );
    trunk.position.set(x, trunkH / 2, -y);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // ---- COPA ----
    if (isConifer) {
      // CONÍFERA: 4 conos apilados — pino navideño puntiagudo
      const numCones = 5;
      const coneStart = trunkH * 0.75;
      for (let i = 0; i < numCones; i++) {
        const t = i / (numCones - 1);
        const radius = heightM * (0.40 - t * 0.30);
        const coneH = heightM * 0.18;
        const coneY = coneStart + i * (coneH * 0.65);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(radius, coneH, 6),
          new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? crownColor : darkCrown })
        );
        cone.position.set(x, coneY + coneH / 2, -y);
        cone.castShadow = true;
        group.add(cone);
      }
    } else {
      // CADUCIFOLIO: copa esponjada con BLOBS DISTRIBUIDOS EN ALTURA
      // (no apilamos esferas en el mismo nivel — las separamos verticalmente
      //  y horizontalmente para que se vea estructura, no una masa uniforme)
      const baseCrown = trunkH * 0.95;

      // 3 niveles de follaje (bajo, medio, alto) — cada uno con sus esferas
      const layers = [
        { y: baseCrown,            blobs: [
          { dx:  0.00, dz:  0.00, r: 0.32, c: crownColor },
          { dx:  0.40, dz:  0.10, r: 0.26, c: lightCrown },
          { dx: -0.35, dz:  0.05, r: 0.28, c: darkCrown },
          { dx:  0.05, dz: -0.42, r: 0.27, c: crownColor },
        ]},
        { y: baseCrown + heightM * 0.18, blobs: [
          { dx:  0.18, dz:  0.20, r: 0.30, c: lightCrown },
          { dx: -0.20, dz: -0.18, r: 0.32, c: crownColor },
          { dx:  0.32, dz: -0.10, r: 0.22, c: darkCrown },
        ]},
        { y: baseCrown + heightM * 0.32, blobs: [
          { dx:  0.05, dz:  0.05, r: 0.28, c: lightCrown },
          { dx: -0.10, dz: -0.05, r: 0.20, c: crownColor },
        ]},
      ];

      layers.forEach(layer => {
        layer.blobs.forEach(b => {
          const sub = new THREE.Mesh(
            new THREE.SphereGeometry(heightM * b.r, 6, 5),
            new THREE.MeshPhongMaterial({ color: b.c, flatShading: true, shininess: 5 })
          );
          sub.position.set(
            x + heightM * b.dx,
            layer.y,
            -y + heightM * b.dz
          );
          sub.castShadow = true;
          group.add(sub);
        });
      });

      // Ramas visibles saliendo del tronco antes de la copa
      const branchData = [
        { startY: trunkH * 0.70, dx:  0.20, dz:  0.05, tilt:  0.6, len: 0.35 },
        { startY: trunkH * 0.80, dx: -0.18, dz:  0.10, tilt: -0.65, len: 0.30 },
        { startY: trunkH * 0.85, dx:  0.05, dz: -0.18, tilt:  0.5, len: 0.32 },
      ];
      branchData.forEach(b => {
        const branchGeom = new THREE.CylinderGeometry(
          heightM * 0.012,
          heightM * 0.020,
          heightM * b.len,
          4
        );
        const branch = new THREE.Mesh(
          branchGeom,
          new THREE.MeshLambertMaterial({ color: 0x5a3f25 })
        );
        branch.position.set(
          x + heightM * b.dx * 0.5,
          b.startY + heightM * b.len * 0.4,
          -y + heightM * b.dz * 0.5
        );
        branch.rotation.z = b.tilt;
        branch.castShadow = true;
        group.add(branch);
      });
    }

    _addHealthMarker(group, x, y, heightM, crownColor);

    group.userData = { type: 'tree', data: treeData };
    scene.add(group);

    // Para raycaster — todos los meshes del árbol procedural son pickeables
    const pickable = [];
    group.traverse(o => {
      if (o.isMesh) pickable.push(o);
    });
    treeMeshes.push({ group, crown: pickable[1] || pickable[0], trunk, pickable, data: treeData });
  }

  // Helper: aclarar/oscurecer un color hex
  function _shadeColor(hex, amount) {
    const c = new THREE.Color(hex);
    if (amount > 0) {
      c.r += (1 - c.r) * amount;
      c.g += (1 - c.g) * amount;
      c.b += (1 - c.b) * amount;
    } else {
      c.r *= (1 + amount);
      c.g *= (1 + amount);
      c.b *= (1 + amount);
    }
    return c.getHex();
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

    // Primero árboles (capa que está encima) — usamos TODAS las partes del árbol
    const treeObjs = treeMeshes.flatMap(t => t.pickable || [t.crown, t.trunk].filter(Boolean));
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

    const treeObjs = treeMeshes.flatMap(t => t.pickable || [t.crown, t.trunk].filter(Boolean));
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
        } else if (typeof getThumbUrl === 'function') {
          // Thumbnail de 600px para el popup (suficiente para preview, ~40KB)
          photoSrc = await getThumbUrl('tree-photos', treeData.photo_url, 600) || '';
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
