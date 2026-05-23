// dashboard-walkthrough.js — Walkthrough en primera persona del campus.
// Usa el MISMO modelo del campus que FES Iztacala 3D (`iztacala_campus.glb`)
// para que las coordenadas lat/lng de los árboles coincidan con la geometría
// del modelo. Cada árbol se renderiza con el modelo `tree_model.glb` (mismo
// de Bosque 3D) + un anillo del color del semáforo en la base.
//
// Controles:
//   • Click en el canvas → activa pointer-lock (mirar con el mouse)
//   • WASD               → caminar
//   • SHIFT              → correr 2.5x
//   • ESPACIO            → saltar (vuelve por gravedad)
//   • E                  → inspeccionar árbol que tienes al frente
//   • ESC                → salir del modo walk
//
// El módulo expone window.DashboardWalkthrough.{ init, destroy }.

(function () {
  'use strict';

  // ---- Proyección lat/lng → x,y en metros (mismo que iztacala) ----
  const CENTER_LAT = 19.52552345;
  const CENTER_LON = -99.1881276;
  const M_PER_LAT = 110574.0;
  const M_PER_LON = 104918.28705381248;

  // ---- Estado del módulo ----
  let scene, camera, renderer, raycaster;
  let animId = null;
  let containerEl = null;
  let resizeHandler = null;
  let pointerHandlers = null;
  let isLocked = false;
  let yaw = 0;
  let pitch = 0;
  let velY = 0;            // velocidad vertical (para gravedad/salto)
  let onGround = true;
  const keys = Object.create(null);
  const treeGroups = [];   // grupos clicables (uno por árbol)
  let treeTemplate = null;
  let crosshairEl = null;
  let hudEl = null;
  let promptEl = null;

  const EYE_HEIGHT = 1.7;
  const WALK_SPEED = 0.13;
  const RUN_FACTOR = 2.5;
  const GRAVITY = 0.018;
  const JUMP_SPEED = 0.32;
  const TREE_HEIGHT_M = 6;

  function latlonToModelXY(lat, lon) {
    return {
      x: (lon - CENTER_LON) * M_PER_LON,
      y: (lat - CENTER_LAT) * M_PER_LAT
    };
  }

  function colorForHealth(score) {
    if (score == null || isNaN(score)) return 0x9e9e9e;
    if (score >= 70) return 0x4CAF50;
    if (score >= 40) return 0xFFA726;
    return 0xEF5350;
  }

  // ---- INIT ---------------------------------------------------------------
  async function init(containerSelector) {
    if (!window.THREE) {
      console.warn('Three.js no cargado para walkthrough');
      return false;
    }
    containerEl = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (!containerEl) return false;

    destroy();

    const W = containerEl.clientWidth || 800;
    const H = 640;

    // Escena + cielo
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb0d8ff);
    scene.fog = new THREE.Fog(0xc8e4f3, 80, 380);

    camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 800);
    // Spawn al centro del campus, mirando hacia el norte (donde están la
    // mayoría de los árboles registrados en BD según los seguimientos)
    camera.position.set(0, EYE_HEIGHT, 50);
    camera.rotation.order = 'YXZ';
    yaw = 0;
    pitch = 0;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    containerEl.innerHTML = '';
    containerEl.style.position = 'relative';
    containerEl.appendChild(renderer.domElement);

    // Luz: ambiente + sol direccional
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.0);
    sun.position.set(50, 120, 40);
    scene.add(sun);
    const fill = new THREE.HemisphereLight(0x88c4ff, 0x6e8a55, 0.4);
    scene.add(fill);

    // Suelo fallback por si el GLB no trae piso (un disco grande de pasto)
    const groundGeo = new THREE.CircleGeometry(400, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x7da75a, roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    raycaster = new THREE.Raycaster();

    // HUD: crosshair + prompt + hint
    _setupHUD();
    _setupControls();

    resizeHandler = () => {
      if (!containerEl || !renderer || !camera) return;
      const w = containerEl.clientWidth || 800;
      camera.aspect = w / H;
      camera.updateProjectionMatrix();
      renderer.setSize(w, H);
    };
    window.addEventListener('resize', resizeHandler);

    // Cargar escenario (mismo del campus iztacala — coords ya alineadas) +
    // modelo de árbol + árboles desde BD en paralelo
    const [scenePromise, treePromise, treesData] = [
      _loadGLB('data/iztacala_campus.glb'),
      _loadGLB('data/trees/tree_model.glb'),
      _fetchTrees()
    ];

    // Mostrar escenario apenas cargue
    scenePromise.then((gltf) => {
      if (!scene || !gltf) return;
      scene.add(gltf.scene);
    }).catch((e) => console.warn('walkescene.glb no cargó:', e));

    // Esperar el modelo de árbol antes de plotear (los necesita)
    treeTemplate = await treePromise.catch(() => null);
    const trees = await treesData;

    // Plotear todos los árboles con coords
    const valid = (trees || []).filter(t => t.location_lat && t.location_lng);
    valid.forEach(tree => _addTree(tree));

    _setHUDInfo(valid.length, (trees || []).length);
    _startLoop();
    return true;
  }

  // ---- Loaders ------------------------------------------------------------
  function _loadGLB(path) {
    return new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader no cargado'));
      const loader = new THREE.GLTFLoader();
      loader.load(path, resolve, undefined, reject);
    });
  }

  async function _fetchTrees() {
    if (typeof sb === 'undefined') return [];
    try {
      const { data } = await sb
        .from('trees_catalog')
        .select('id, tree_code, common_name, species, health_score, location_lat, location_lng, status, photo_url')
        .not('location_lat', 'is', null);
      return data || [];
    } catch (e) {
      console.warn('No se pudieron cargar árboles:', e);
      return [];
    }
  }

  // ---- Añadir un árbol al mundo -------------------------------------------
  function _addTree(treeData) {
    const { x, y } = latlonToModelXY(treeData.location_lat, treeData.location_lng);
    const group = new THREE.Group();
    // En Three.js usamos -y como Z para que "norte real" = -Z (la cámara
    // mira -Z por defecto). Así caminar adelante es ir norte.
    group.position.set(x, 0, -y);

    // Modelo del árbol (clon del template GLB)
    if (treeTemplate) {
      const tree = treeTemplate.clone(true);
      // Normalizar altura: el modelo viene con varias escalas; lo
      // escalamos para que mida ~TREE_HEIGHT_M metros de alto.
      const box = new THREE.Box3().setFromObject(tree);
      const size = box.getSize(new THREE.Vector3());
      const scale = TREE_HEIGHT_M / Math.max(size.y, 0.01);
      tree.scale.setScalar(scale);
      // Bajar para que la base quede en y=0
      const newBox = new THREE.Box3().setFromObject(tree);
      tree.position.y = -newBox.min.y;
      // Pequeña variación angular para que no todos los árboles miren igual
      tree.rotation.y = (treeData.id || 0) * 0.7919 % (Math.PI * 2);
      group.add(tree);
    } else {
      // Fallback procedural si el GLB falló
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, 2.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
      );
      trunk.position.y = 1.4;
      group.add(trunk);
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a8f3a, roughness: 0.8 })
      );
      crown.position.y = 3.9;
      group.add(crown);
    }

    // Anillo semáforo en la base (mismo concepto que Bosque 3D)
    const ringColor = colorForHealth(treeData.health_score);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.08, 8, 24),
      new THREE.MeshStandardMaterial({
        color: ringColor, emissive: ringColor, emissiveIntensity: 0.55,
        roughness: 0.4, metalness: 0.3
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    // Disco translúcido del color (acentúa la presencia del árbol al verlo)
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24),
      new THREE.MeshBasicMaterial({
        color: ringColor, transparent: true, opacity: 0.12, side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    group.add(disc);

    group.userData = { tree: treeData };
    scene.add(group);
    treeGroups.push(group);
  }

  // ---- HUD ---------------------------------------------------------------
  function _setupHUD() {
    // Crosshair central
    crosshairEl = document.createElement('div');
    crosshairEl.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,0.85);
      box-shadow:0 0 0 1px rgba(0,0,0,0.4);pointer-events:none;
      transition:transform 0.1s,border-color 0.1s;`;
    containerEl.appendChild(crosshairEl);

    // Prompt "[E] Inspeccionar árbol"
    promptEl = document.createElement('div');
    promptEl.style.cssText = `
      position:absolute;left:50%;top:calc(50% + 28px);transform:translateX(-50%);
      background:rgba(0,0,0,0.65);color:#fff;padding:0.35rem 0.8rem;border-radius:14px;
      font-size:0.78rem;font-family:Inter,sans-serif;pointer-events:none;
      backdrop-filter:blur(6px);display:none;`;
    promptEl.innerHTML = '<kbd style="background:#fff;color:#000;padding:1px 5px;border-radius:3px;font-family:inherit;">E</kbd> Inspeccionar árbol';
    containerEl.appendChild(promptEl);

    // HUD inferior con instrucciones + contador
    hudEl = document.createElement('div');
    hudEl.style.cssText = `
      position:absolute;bottom:0.6rem;left:50%;transform:translateX(-50%);
      background:rgba(255,255,255,0.92);color:#1b3a5f;padding:0.5rem 1rem;border-radius:18px;
      font-size:0.75rem;font-family:Inter,sans-serif;pointer-events:none;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);font-weight:500;text-align:center;
      backdrop-filter:blur(6px);`;
    hudEl.innerHTML = `
      <div><strong>Click</strong> para entrar · <strong>WASD</strong> caminar · <strong>Shift</strong> correr · <strong>Espacio</strong> saltar · <strong>E</strong> inspeccionar · <strong>ESC</strong> salir</div>
    `;
    containerEl.appendChild(hudEl);
  }

  function _setHUDInfo(visible, total) {
    if (!hudEl) return;
    // Extender el HUD con stat de árboles
    const extra = document.createElement('div');
    extra.style.cssText = 'margin-top:0.2rem;color:#2e7d32;font-size:0.72rem;';
    extra.textContent = `🌳 ${visible} árboles visibles (${total} totales en BD)`;
    hudEl.appendChild(extra);
  }

  // ---- Controles ----------------------------------------------------------
  function _setupControls() {
    const onCanvasClick = () => {
      if (!isLocked && renderer && renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    const onPointerLockChange = () => {
      isLocked = (document.pointerLockElement === (renderer && renderer.domElement));
      if (crosshairEl) {
        crosshairEl.style.borderColor = isLocked ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
      }
    };
    const onMouseMove = (e) => {
      if (!isLocked) return;
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
    };
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === 'Escape' && isLocked) document.exitPointerLock();
      if (e.code === 'KeyE' && isLocked) _inspectFront();
      if (e.code === 'Space' && onGround && isLocked) {
        velY = JUMP_SPEED;
        onGround = false;
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => { keys[e.code] = false; };

    if (renderer && renderer.domElement) {
      renderer.domElement.addEventListener('click', onCanvasClick);
    }
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    pointerHandlers = { onCanvasClick, onPointerLockChange, onMouseMove, onKeyDown, onKeyUp };
  }

  // Raycast desde el centro de pantalla — si pega en un árbol, muestra modal
  function _inspectFront() {
    if (!raycaster || !camera) return;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(treeGroups, true);
    if (hits.length === 0) return;
    // Subir al group raíz para sacar el userData.tree
    let obj = hits[0].object;
    while (obj && !obj.userData?.tree) obj = obj.parent;
    if (obj && obj.userData?.tree) {
      _showTreeModal(obj.userData.tree);
    }
  }

  // ---- Modal de info del árbol (compacto) --------------------------------
  function _showTreeModal(tree) {
    let modal = document.getElementById('walk-tree-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'walk-tree-modal';
    const score = tree.health_score;
    const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
    const stateLabel = score >= 70 ? 'Sano' : score >= 40 ? 'Atención' : score != null ? 'Crítico' : 's/dato';

    modal.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,0.45);overflow:hidden;">
        <div style="background:${color};color:#fff;padding:0.9rem 1.2rem;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="margin:0;font-size:1.05rem;">${(tree.common_name || tree.species || 'Árbol').replace(/[<>&"]/g, '')}</h3>
            <div style="font-size:0.78rem;opacity:0.92;margin-top:0.15rem;">${(tree.species || '').replace(/[<>&"]/g, '')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.4rem;font-weight:700;">${score != null ? score : '–'}</div>
            <div style="font-size:0.72rem;opacity:0.9;">${stateLabel}</div>
          </div>
        </div>
        <div style="padding:1rem 1.2rem;">
          ${tree.tree_code ? `<div style="font-family:ui-monospace,monospace;color:#999;font-size:0.78rem;">Código: ${tree.tree_code}</div>` : ''}
          ${tree.status ? `<div style="color:#555;font-size:0.85rem;margin-top:0.3rem;">Estado: ${tree.status}</div>` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end;">
            <button id="walk-modal-close" style="background:#f0f0f0;color:#444;border:none;padding:0.55rem 1.1rem;border-radius:10px;font-weight:500;cursor:pointer;">Cerrar</button>
            <button id="walk-modal-detail" style="background:#2E7D32;color:#fff;border:none;padding:0.55rem 1.1rem;border-radius:10px;font-weight:600;cursor:pointer;">Ver detalle completo</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('walk-modal-close').onclick = () => modal.remove();
    document.getElementById('walk-modal-detail').onclick = () => {
      modal.remove();
      if (typeof editAdminTree === 'function') editAdminTree(tree.id);
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  // ---- Loop principal ----------------------------------------------------
  function _startLoop() {
    let last = performance.now();
    function loop() {
      if (!renderer || !scene || !camera) { animId = null; return; }
      animId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 16.67, 3);  // delta en frames (cap a 3)
      last = now;

      // Aplicar yaw/pitch a la cámara (orden YXZ)
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Movimiento WASD
      const move = new THREE.Vector3();
      if (keys['KeyW']) move.z -= 1;
      if (keys['KeyS']) move.z += 1;
      if (keys['KeyA']) move.x -= 1;
      if (keys['KeyD']) move.x += 1;
      if (move.lengthSq() > 0) {
        move.normalize();
        const speed = WALK_SPEED * (keys['ShiftLeft'] || keys['ShiftRight'] ? RUN_FACTOR : 1) * dt;
        // Aplicar solo el yaw (rotación horizontal) para que mirar arriba/abajo
        // no afecte la dirección de caminata
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const dx = move.x * cosY + move.z * sinY;
        const dz = -move.x * sinY + move.z * cosY;
        camera.position.x += dx * speed;
        camera.position.z += dz * speed;
      }

      // Gravedad / salto
      if (!onGround || velY > 0) {
        velY -= GRAVITY * dt;
        camera.position.y += velY;
        if (camera.position.y <= EYE_HEIGHT) {
          camera.position.y = EYE_HEIGHT;
          velY = 0;
          onGround = true;
        }
      } else {
        camera.position.y = EYE_HEIGHT;
      }

      // Mostrar/ocultar prompt "[E] Inspeccionar" según si tienes un árbol al frente
      if (raycaster && treeGroups.length > 0 && promptEl) {
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const hits = raycaster.intersectObjects(treeGroups, true);
        const closeHit = hits.find(h => h.distance < 12);
        promptEl.style.display = (closeHit && isLocked) ? 'block' : 'none';
      }

      renderer.render(scene, camera);
    }
    loop();
  }

  // ---- Destroy ------------------------------------------------------------
  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    if (pointerHandlers) {
      document.removeEventListener('pointerlockchange', pointerHandlers.onPointerLockChange);
      document.removeEventListener('mousemove', pointerHandlers.onMouseMove);
      document.removeEventListener('keydown', pointerHandlers.onKeyDown);
      document.removeEventListener('keyup', pointerHandlers.onKeyUp);
      if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('click', pointerHandlers.onCanvasClick);
      }
      pointerHandlers = null;
    }
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (_) {}
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (crosshairEl && crosshairEl.parentNode) crosshairEl.parentNode.removeChild(crosshairEl);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    if (promptEl && promptEl.parentNode) promptEl.parentNode.removeChild(promptEl);
    crosshairEl = hudEl = promptEl = null;
    scene = camera = renderer = raycaster = null;
    treeGroups.length = 0;
    treeTemplate = null;
    isLocked = false;
    yaw = pitch = 0;
    velY = 0;
    onGround = true;
    Object.keys(keys).forEach(k => delete keys[k]);
  }

  window.DashboardWalkthrough = { init, destroy };
})();
