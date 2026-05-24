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

console.log('%c🐾 dashboard-walkthrough.js v71 cargado', 'color:#2E7D32;font-weight:bold;font-size:14px;');

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
  // Posición del JUGADOR (no de la cámara). En 3ª persona la cámara orbita
  // alrededor del jugador a cameraDistance metros.
  let playerPos = null;    // THREE.Vector3
  let avatar = null;       // mesh visible solo en 3ª persona
  let pumaYaw = 0;         // ORIENTACIÓN del puma (independiente de la cámara)
  let pumaYawTarget = 0;   // dirección a la que se está girando suavemente
  let pumaMixer = null;    // AnimationMixer si el GLB trae clips embebidos
  // Acciones que detectamos por nombre del clip (Mixamo / Blender NLA names)
  const pumaActions = { idle: null, walk: null, run: null, jump: null, dance: null };
  // Estado lógico (cuál animación queremos activa)
  let pumaState = 'idle';     // 'idle' | 'walk' | 'run' | 'jump' | 'dance'
  let danceToggled = false;   // toggle B
  let cameraDistance = 0;  // 0 = primera persona; >0 = tercera persona (zoom out)
  const CAM_DIST_MIN = 0;
  const CAM_DIST_MAX = 80;
  // Estado touch (móvil)
  let touchState = null;

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
    camera.rotation.order = 'YXZ';
    // El JUGADOR (no la cámara) se posiciona en el campus. La cámara
    // orbita alrededor del jugador en 3ª persona, o coincide con el
    // jugador en 1ª persona (cameraDistance = 0).
    // Spawn cerca del cluster de árboles del NE del campus para que el
    // usuario vea contenido inmediato al entrar.
    playerPos = new THREE.Vector3(50, EYE_HEIGHT, -80);
    yaw = -0.5;     // mirando ligeramente hacia el SO (centro del campus)
    pitch = -0.1;   // un poquito hacia abajo
    cameraDistance = 6;  // arranca en 3ª persona para que veas al pumita
    _updateCameraFromPlayer();

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

    // Avatar PUMITA UNAM. Intenta cargar GLB de `data/pumita.glb` (también
    // acepta `puma.glb`). Si no existe o falla, cae al puma procedural.
    avatar = _makePumaAvatar();  // placeholder inmediato mientras intenta el GLB
    avatar.position.copy(playerPos);
    avatar.position.y = 0;
    scene.add(avatar);
    _tryLoadPumaGLB();

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

    // ARRANCAR EL LOOP YA — así el usuario ve el cielo + suelo de inmediato
    // mientras se cargan los GLBs en background (en lugar de pantalla negra).
    _startLoop();

    // Cargar escenario + modelo de árbol + árboles desde BD en paralelo (no
    // bloqueante: cada uno se agrega a la escena conforme termine).
    _loadGLB('data/iztacala_campus.glb').then((gltf) => {
      if (!scene || !gltf) return;
      scene.add(gltf.scene);
      console.log('🏛️  Campus GLB cargado');
    }).catch((e) => console.warn('iztacala_campus.glb no cargó:', e?.message || e));

    // Pre-cargar TODOS los modelos GLB de las especies para que vayan
    // calentando el cache antes de que se rendericen los árboles.
    // Luego fetch + plot. Cada _addTree obtiene su modelo específico.
    (async () => {
      if (window.TreeModels) {
        // No esperar el preload — empezamos a plotear apenas tengamos data.
        window.TreeModels.preloadAll();
      }
      const trees = await _fetchTrees();
      if (!scene) return;
      const valid = (trees || []).filter(t => t.location_lat && t.location_lng);
      // _addTree es async pero las llamamos en paralelo (cada una espera su modelo)
      valid.forEach(tree => _addTree(tree));
      _setHUDInfo(valid.length, (trees || []).length);
      console.log(`🌲 ${valid.length} árboles plotteados en el walkthrough`);
    })();

    return true;
  }

  // ---- Loaders ------------------------------------------------------------
  function _loadGLB(path) {
    return new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader no cargado'));
      const loader = new THREE.GLTFLoader();
      // DRACOLoader para GLBs comprimidos con Draco (Blender los exporta así
      // por defecto con compresión activada).
      if (THREE.DRACOLoader) {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        draco.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(draco);
      }
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
  async function _addTree(treeData) {
    const { x, y } = latlonToModelXY(treeData.location_lat, treeData.location_lng);
    const group = new THREE.Group();
    group.position.set(x, 0, -y);

    const healthColorHex = colorForHealth(treeData.health_score);

    // Resolver el modelo específico de la especie usando el módulo compartido.
    // TreeModels matchea por keywords en tree_code/common_name/species y
    // cae al genérico tree_model.glb si no encuentra coincidencia.
    let template = null;
    if (window.TreeModels) {
      template = await window.TreeModels.getModelForTree(treeData);
    } else {
      template = treeTemplate;  // fallback al template legacy
    }
    if (!scene) return;  // guard: el dashboard puede haber sido destruido durante el await

    if (template) {
      const tree = template.clone(true);
      // Los materiales del GLB se MANTIENEN tal cual (cada especie tiene su
      // color natural). El color del semáforo solo se ve en el anillo de la
      // base, no en el follaje.
      const box = new THREE.Box3().setFromObject(tree);
      const size = box.getSize(new THREE.Vector3());
      const scale = TREE_HEIGHT_M / Math.max(size.y, 0.01);
      tree.scale.setScalar(scale);
      const newBox = new THREE.Box3().setFromObject(tree);
      tree.position.y = -newBox.min.y;
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

    // Anillo semáforo en la base (mismo concepto que Bosque 3D / Iztacala)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.08, 8, 24),
      new THREE.MeshStandardMaterial({
        color: healthColorHex, emissive: healthColorHex, emissiveIntensity: 0.55,
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
        color: healthColorHex, transparent: true, opacity: 0.12, side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    group.add(disc);

    group.userData = { tree: treeData };
    scene.add(group);
    treeGroups.push(group);
  }

  // ---- Cargar GLB del puma si existe -------------------------------------
  // Intenta data/pumita.glb y data/puma.glb (en ese orden). Si carga, sustituye
  // el avatar procedural. Si trae clips de animación (idle, walk, run...) los
  // configura en un AnimationMixer para reproducirlos según el estado.
  function _tryLoadPumaGLB() {
    const candidates = [
      'data/pumita.glb',
      'data/puma.glb',
      'data/trees/pumita.glb',
    ];
    const tryNext = (i) => {
      if (i >= candidates.length || !scene) return;
      const path = candidates[i];
      _loadGLB(path).then((gltf) => {
        if (!scene || !gltf) { tryNext(i + 1); return; }
        _setupPumaFromGLB(gltf);
        console.log(`🐾 Puma GLB cargado: ${path}`);
      }).catch((err) => {
        // 404 silencioso — solo loguear si no es el último
        if (i < candidates.length - 1) tryNext(i + 1);
        else console.log('🐾 No se encontró GLB del puma, usando procedural.');
      });
    };
    tryNext(0);
  }

  function _setupPumaFromGLB(gltf) {
    const newPuma = gltf.scene;
    // Normalizar altura: 1.85m porque la botarga del Puma UNAM es humanoide
    // (cabeza + cuerpo + pantalón + tenis), no cuadrúpedo.
    const box = new THREE.Box3().setFromObject(newPuma);
    const size = box.getSize(new THREE.Vector3());
    const targetHeight = 1.85;
    const scale = targetHeight / Math.max(size.y, 0.01);
    newPuma.scale.setScalar(scale);
    // Centrar horizontalmente y poner los pies en y=0
    const newBox = new THREE.Box3().setFromObject(newPuma);
    newPuma.position.y = -newBox.min.y;
    // Centro X y Z al origen del avatar (por si el GLB viene descentrado)
    const center = newBox.getCenter(new THREE.Vector3());
    newPuma.position.x = -center.x;
    newPuma.position.z = -center.z;

    // Sombras
    newPuma.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    // Reemplazar el avatar procedural
    if (avatar && avatar.parent) avatar.parent.remove(avatar);
    avatar = new THREE.Group();
    avatar.add(newPuma);
    // Sombra plana debajo
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    avatar.add(shadow);
    avatar.position.copy(playerPos);
    avatar.position.y = 0;
    scene.add(avatar);

    // Detectar huesos de brazo (para corregir el "se está tocando" durante el baile).
    // Tu rig se llama Hips/Spine/Chest/LeftShoulder/LeftArm/LeftForeArm/LeftHand (estilo Mixamo).
    // "LeftArm" = upper arm. Lo detectamos excluyendo ForeArm/Hand/Shoulder.
    avatar.userData.armBones = { leftShoulder: null, rightShoulder: null, leftUpper: null, rightUpper: null };
    const allBoneNames = [];
    avatar.traverse(o => {
      if (!o.isBone) return;
      allBoneNames.push(o.name);
      const n = (o.name || '').toLowerCase();
      const isL = /^left|\.l$|_l$|izq/i.test(n);
      const isR = /^right|\.r$|_r$|der/i.test(n);
      const isShoulder = /shoulder|clavicle|hombro/.test(n);
      // Upper arm: contiene "arm" o "brazo" o "humerus", PERO NO "forearm/lowerarm/shoulder/hand"
      const isUpperArm = /\barm\b|upperarm|brazo|humerus/.test(n)
                          && !/forearm|lowerarm|shoulder|hand|mano/.test(n);
      if (isShoulder && isL) avatar.userData.armBones.leftShoulder = o;
      if (isShoulder && isR) avatar.userData.armBones.rightShoulder = o;
      if (isUpperArm && isL && !avatar.userData.armBones.leftUpper)  avatar.userData.armBones.leftUpper  = o;
      if (isUpperArm && isR && !avatar.userData.armBones.rightUpper) avatar.userData.armBones.rightUpper = o;
    });
    console.log('🦴 Bones del puma:', allBoneNames.join(', '));
    console.log('  → leftShoulder:',  avatar.userData.armBones.leftShoulder?.name  || 'no detectado');
    console.log('  → rightShoulder:', avatar.userData.armBones.rightShoulder?.name || 'no detectado');
    console.log('  → leftUpper:',     avatar.userData.armBones.leftUpper?.name     || 'no detectado');
    console.log('  → rightUpper:',    avatar.userData.armBones.rightUpper?.name    || 'no detectado');

    // Si el GLB trae animaciones, configurar el mixer + acciones nombradas
    if (gltf.animations && gltf.animations.length > 0) {
      pumaMixer = new THREE.AnimationMixer(newPuma);
      const findClip = (regex) => gltf.animations.find(c => regex.test(c.name || ''));
      const map = {
        idle:  findClip(/^idle$|^stand|^rest/i),
        walk:  findClip(/^walk$|^trot/i),
        run:   findClip(/^run$|^sprint|^jog/i),
        jump:  findClip(/^jump|^leap/i),
        dance: findClip(/^dance|^party/i),
      };
      // Si no hay clip específico, fallback a walk/genérico
      if (!map.idle && gltf.animations.length > 0) map.idle = gltf.animations[0];
      if (!map.walk && map.idle) map.walk = map.idle;

      for (const [name, clip] of Object.entries(map)) {
        if (!clip) continue;
        const action = pumaMixer.clipAction(clip);
        // Loop config — jump no es loop, los demás sí
        action.loop = (name === 'jump') ? THREE.LoopOnce : THREE.LoopRepeat;
        if (name === 'jump') action.clampWhenFinished = true;
        action.setEffectiveWeight(name === 'idle' ? 1 : 0);
        action.play();
        pumaActions[name] = action;
      }
      console.log(`🎬 ${gltf.animations.length} animaciones del puma cargadas:`,
        gltf.animations.map(c => c.name).join(', '),
        '· mapeo:', Object.fromEntries(Object.entries(map).map(([k,v]) => [k, v?.name || null])));
    }
  }

  // ---- AVATAR PUMITA UNAM (procedural — fallback) ------------------------
  // Construido con primitivas — sin GLB. Es una representación cartoonish
  // del puma: cuerpo alargado, cabeza con orejas/ojos/nariz, 4 patas y cola.
  // Diseñado mirando hacia -Z (la dirección "forward" por defecto de Three.js),
  // así rotar avatar.rotation.y = yaw lo alinea con la cámara.
  function _makePumaAvatar() {
    const g = new THREE.Group();
    const tan = 0xc99054;       // color puma (tan/dorado UNAM)
    const tanDark = 0x9c6d3a;   // sombra
    const black = 0x222222;
    const goldEye = 0xffd54f;

    const bodyMat = new THREE.MeshStandardMaterial({ color: tan, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: tanDark, roughness: 0.7 });
    const blackMat = new THREE.MeshStandardMaterial({ color: black, roughness: 0.6 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: goldEye });

    // Cuerpo (esfera alargada en Z = longitud del cuerpo)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), bodyMat);
    body.scale.set(1, 0.85, 1.55);
    body.position.y = 0.55;
    g.add(body);

    // Cabeza (frontal — hacia -Z)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), bodyMat);
    head.position.set(0, 0.72, -0.55);
    head.scale.set(1.05, 1, 1.05);
    g.add(head);

    // Hocico (más oscuro, sobresale)
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), darkMat);
    muzzle.position.set(0, 0.6, -0.78);
    muzzle.scale.set(1, 0.85, 1);
    g.add(muzzle);

    // Nariz negra
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), blackMat);
    nose.position.set(0, 0.65, -0.92);
    g.add(nose);

    // Ojos amarillos + pupilas negras
    const eyeGeo = new THREE.SphereGeometry(0.055, 10, 8);
    const pupilGeo = new THREE.SphereGeometry(0.025, 8, 6);
    [-0.11, 0.11].forEach(x => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.78, -0.74);
      g.add(eye);
      const pupil = new THREE.Mesh(pupilGeo, blackMat);
      pupil.position.set(x, 0.78, -0.79);
      g.add(pupil);
    });

    // Orejas (conos)
    const earGeo = new THREE.ConeGeometry(0.1, 0.22, 8);
    [-0.16, 0.16].forEach(x => {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(x, 0.99, -0.5);
      ear.rotation.z = x < 0 ? 0.15 : -0.15;  // ligeramente hacia afuera
      g.add(ear);
      // Interior de la oreja (negro)
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), blackMat);
      inner.position.set(x, 0.98, -0.5);
      inner.rotation.z = x < 0 ? 0.15 : -0.15;
      g.add(inner);
    });

    // 4 patas. Las almaceno en userData.legs para animarlas al caminar
    const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8);
    const legPositions = [
      { x: -0.22, z: -0.35, key: 'FL' },  // delantera izquierda
      { x:  0.22, z: -0.35, key: 'FR' },  // delantera derecha
      { x: -0.22, z:  0.35, key: 'BL' },  // trasera izquierda
      { x:  0.22, z:  0.35, key: 'BR' },  // trasera derecha
    ];
    const legs = {};
    legPositions.forEach(p => {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(p.x, 0.27, p.z);
      g.add(leg);
      legs[p.key] = leg;
    });
    g.userData.legs = legs;

    // Cola (cilindro inclinado hacia arriba-atrás)
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.04, 0.85, 8),
      bodyMat
    );
    tail.position.set(0, 0.72, 0.7);
    tail.rotation.x = -Math.PI / 4.5;
    g.add(tail);
    g.userData.tail = tail;

    // Sombra plana debajo (disco oscuro)
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    g.add(shadow);

    return g;
  }

  // Actualizar la cámara según playerPos + yaw/pitch + cameraDistance.
  //
  // ESTILO ROBLOX:
  //   • En 1ª persona la cámara coincide con la cabeza del puma
  //   • En 3ª persona la cámara ORBITA alrededor del puma usando coordenadas
  //     esféricas (yaw, elevation, distance). Mientras más zoom-out, más
  //     ELEVACIÓN automática para dar vista panorámica del mapa.
  //   • camera.lookAt() garantiza que el puma SIEMPRE queda centrado, sin
  //     riesgo de errores de signo en la matemática manual.
  const _target = new THREE.Vector3();
  function _updateCameraFromPlayer() {
    if (!camera || !playerPos) return;

    if (cameraDistance <= 0.05) {
      // 1ª persona
      camera.position.copy(playerPos);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      return;
    }

    // 3ª persona — orbit Roblox-style
    // Elevation base: a más zoom-out, más alto va la cámara.
    //   d=2  → ~9°  (vista de hombro, casi al ras)
    //   d=15 → ~30° (vista isométrica)
    //   d=40 → ~52° (vista alta panorámica)
    //   d=80 → ~73° (vista casi cenital / satelital)
    // Curva con sqrt para que la elevación crezca rápido al principio
    // (cuando importa más) y suave en zooms lejanos.
    const distFrac = Math.sqrt((cameraDistance - CAM_DIST_MIN) / (CAM_DIST_MAX - CAM_DIST_MIN));
    const baseElevation = 0.15 + distFrac * 1.13;
    // El pitch del usuario suma sobre esa base (mouse arriba = más alto)
    const elevation = Math.max(-0.1, Math.min(1.30, baseElevation - pitch));
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);

    // Posición de cámara en coords esféricas alrededor del puma
    // yaw=0 → cámara DETRÁS del puma (a +Z relativa)
    // yaw=π/2 → cámara al ESTE
    const offX = Math.sin(yaw) * cosE * cameraDistance;
    const offY = sinE * cameraDistance;
    const offZ = Math.cos(yaw) * cosE * cameraDistance;

    camera.position.set(
      playerPos.x + offX,
      playerPos.y + offY,
      playerPos.z + offZ
    );

    // Apuntar al puma (a la altura del pecho — 1.2m sobre el suelo)
    _target.set(playerPos.x, playerPos.y - EYE_HEIGHT + 1.2, playerPos.z);
    camera.lookAt(_target);
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
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    hudEl.innerHTML = isTouch
      ? `<div><strong>Joystick</strong> caminar · <strong>Arrastra</strong> mirar · <strong>Pinch</strong> zoom · <strong>↑</strong> saltar · <strong>🔍</strong> inspeccionar</div>`
      : `<div><strong>Click</strong> entrar · <strong>WASD</strong> caminar · <strong>Shift</strong> correr · <strong>Espacio</strong> saltar · <strong>B</strong> bailar · <strong>Rueda</strong> zoom · <strong>V</strong> 1ª/3ª · <strong>E</strong> inspeccionar · <strong>ESC</strong> salir</div>`;
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
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    const onCanvasClick = () => {
      if (isTouch) return;  // touch usa otros controles
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
      // Clampear delta para evitar saltos enormes (trackpad de Mac manda
      // valores grandes con pointer-lock). Y bajar sensibilidad 2.5x: de
      // 0.002 a 0.0008 rad/pixel, para que un movimiento sutil sea sutil.
      const dx = Math.max(-50, Math.min(50, e.movementX));
      const dy = Math.max(-50, Math.min(50, e.movementY));
      yaw -= dx * 0.0008;
      pitch -= dy * 0.0008;
      pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
    };
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === 'Escape' && isLocked) document.exitPointerLock();
      if (e.code === 'KeyE' && isLocked) _inspectFront();
      // V toggle 1ª/3ª persona (mismo concepto que F5 en Minecraft)
      if (e.code === 'KeyV') {
        cameraDistance = cameraDistance > 0.05 ? 0 : 6;
      }
      if (e.code === 'Space' && onGround && isLocked) {
        velY = JUMP_SPEED;
        onGround = false;
        // Trigger jump animation (no loop, vuelve solo al terminar)
        if (pumaActions.jump) {
          pumaActions.jump.reset();
          pumaActions.jump.fadeIn(0.15);
          pumaActions.jump.play();
        }
        e.preventDefault();
      }
      if (e.code === 'KeyB' && isLocked) {
        // Toggle dance mode
        danceToggled = !danceToggled;
      }
    };
    const onKeyUp = (e) => { keys[e.code] = false; };

    // SCROLL WHEEL = zoom proporcional (estilo Google Maps).
    // Cada paso suma ~18% de la distancia actual, con mínimo de 0.6 unidades
    // y máximo 6. Así zoomear se siente igual de natural cerca (de 2→2.4m)
    // que lejos (de 30→35m).
    const onWheel = (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const step = Math.max(0.6, Math.min(6, cameraDistance * 0.18 + 0.6));
      cameraDistance = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST_MAX, cameraDistance + dir * step));
    };

    if (renderer && renderer.domElement) {
      renderer.domElement.addEventListener('click', onCanvasClick);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    }
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // ---- TOUCH (móvil): joystick virtual + look pad + pinch zoom ----
    if (isTouch) _setupTouchControls();

    pointerHandlers = { onCanvasClick, onPointerLockChange, onMouseMove, onKeyDown, onKeyUp, onWheel };
  }

  function _setupTouchControls() {
    // Estado del touch
    touchState = {
      active: true,
      joystick: { x: 0, y: 0 },
      lookTouchId: null,
      lookStartX: 0, lookStartY: 0,
      pinchStartDist: 0, pinchStartCamDist: 0
    };

    // Joystick virtual (esquina inferior izquierda)
    const stick = document.createElement('div');
    stick.style.cssText = `
      position:absolute;left:18px;bottom:18px;width:120px;height:120px;
      border-radius:50%;background:rgba(255,255,255,0.25);
      border:2px solid rgba(255,255,255,0.5);touch-action:none;
      backdrop-filter:blur(6px);z-index:5;`;
    const knob = document.createElement('div');
    knob.style.cssText = `
      position:absolute;left:35px;top:35px;width:50px;height:50px;
      border-radius:50%;background:rgba(255,255,255,0.7);
      box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:none;pointer-events:none;`;
    stick.appendChild(knob);
    containerEl.appendChild(stick);

    let stickTouchId = null;
    const STICK_RADIUS = 50;

    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickTouchId = t.identifier;
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (const t of e.changedTouches) {
        if (t.identifier !== stickTouchId) continue;
        let dx = t.clientX - cx;
        let dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) { dx = dx / d * STICK_RADIUS; dy = dy / d * STICK_RADIUS; }
        knob.style.left = `${35 + dx}px`;
        knob.style.top = `${35 + dy}px`;
        touchState.joystick.x = dx / STICK_RADIUS;
        touchState.joystick.y = dy / STICK_RADIUS;  // arriba = -y → adelante
      }
    }, { passive: false });
    const stickEnd = () => {
      stickTouchId = null;
      knob.style.left = '35px';
      knob.style.top = '35px';
      touchState.joystick.x = 0;
      touchState.joystick.y = 0;
    };
    stick.addEventListener('touchend', stickEnd);
    stick.addEventListener('touchcancel', stickEnd);

    // Botón "E" (inspeccionar) en esquina inferior derecha
    const eBtn = document.createElement('button');
    eBtn.textContent = '🔍 Inspeccionar';
    eBtn.style.cssText = `
      position:absolute;right:18px;bottom:18px;background:#2E7D32;color:#fff;
      border:none;padding:0.7rem 1.1rem;border-radius:24px;font-weight:600;
      box-shadow:0 4px 12px rgba(0,0,0,0.35);font-size:0.85rem;touch-action:manipulation;
      z-index:5;`;
    eBtn.addEventListener('touchstart', (e) => { e.preventDefault(); _inspectFront(); }, { passive: false });
    containerEl.appendChild(eBtn);

    // Botón "↕" saltar
    const jumpBtn = document.createElement('button');
    jumpBtn.textContent = '↑';
    jumpBtn.style.cssText = `
      position:absolute;right:18px;bottom:80px;background:rgba(255,255,255,0.85);
      color:#1b3a5f;border:none;width:50px;height:50px;border-radius:50%;
      font-weight:700;font-size:1.4rem;box-shadow:0 4px 12px rgba(0,0,0,0.25);
      touch-action:manipulation;z-index:5;`;
    jumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (onGround) { velY = JUMP_SPEED; onGround = false; }
    }, { passive: false });
    containerEl.appendChild(jumpBtn);

    // Look pad — arrastrar en el área de la pantalla (no sobre el joystick/botones)
    const canvas = renderer.domElement;
    // CSS para prevenir gestos del navegador (pinch-to-zoom de la página, etc.)
    canvas.style.touchAction = 'none';
    canvas.style.webkitTouchCallout = 'none';
    canvas.style.userSelect = 'none';

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (touchState.lookTouchId == null) {
          touchState.lookTouchId = t.identifier;
          touchState.lookStartX = t.clientX;
          touchState.lookStartY = t.clientY;
        }
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchState.pinchStartDist = Math.hypot(dx, dy);
        touchState.pinchStartCamDist = cameraDistance;
        // Si era look con 1 dedo, cancelarlo al empezar pinch
        touchState.lookTouchId = null;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();   // ← CLAVE: previene pinch-zoom del navegador
      // Pinch (2 dedos) — zoom de la cámara
      if (e.touches.length === 2 && touchState.pinchStartDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        // Dedos SEPARÁNDOSE = d > startDist → factor < 1 → zoom IN (menos distancia)
        // Dedos JUNTÁNDOSE = d < startDist → factor > 1 → zoom OUT (más distancia)
        // Eso es lo natural: spread = acercar (mismo que apps de fotos)
        const factor = touchState.pinchStartDist / d;
        cameraDistance = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST_MAX,
          touchState.pinchStartCamDist * factor));
        return;
      }
      // Look (1 dedo) — Roblox/FPS style: drag right = camera looks right
      for (const t of e.changedTouches) {
        if (t.identifier !== touchState.lookTouchId) continue;
        const dx = t.clientX - touchState.lookStartX;
        const dy = t.clientY - touchState.lookStartY;
        touchState.lookStartX = t.clientX;
        touchState.lookStartY = t.clientY;
        // SIGNOS INVERTIDOS respecto al desktop. En móvil/touch la convención
        // típica es "drag world": drag right = cámara mira izquierda.
        // Pero el usuario reportó que se siente al revés, así que usamos
        // "drag camera": drag right = cámara mira derecha (mismo que joystick).
        yaw += dx * 0.004;
        pitch += dy * 0.004;
        pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchState.lookTouchId) touchState.lookTouchId = null;
      }
      if (e.touches.length < 2) touchState.pinchStartDist = 0;
    }, { passive: false });

    // Guardar refs para destroy
    touchState.uiEls = [stick, eBtn, jumpBtn];
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
  // Vectores reusables (evita garbage collection cada frame)
  const _camFwd = new THREE.Vector3();
  const _camRight = new THREE.Vector3();

  function _startLoop() {
    let last = performance.now();
    let walkPhase = 0;  // para animar las patas del pumita

    function loop() {
      if (!renderer || !scene || !camera) { animId = null; return; }
      animId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;

      // ---- Input: WASD + joystick táctil ----
      const move = new THREE.Vector3();
      if (keys['KeyW']) move.z -= 1;
      if (keys['KeyS']) move.z += 1;
      if (keys['KeyA']) move.x -= 1;
      if (keys['KeyD']) move.x += 1;
      // Joystick virtual (móvil)
      if (touchState && touchState.joystick) {
        move.x += touchState.joystick.x;
        move.z += touchState.joystick.y;
      }

      let isWalking = false;
      if (move.lengthSq() > 0) {
        isWalking = true;
        move.normalize();
        const speed = WALK_SPEED * (keys['ShiftLeft'] || keys['ShiftRight'] ? RUN_FACTOR : 1) * dt;
        // Caminar en dirección a donde MIRA la cámara (Roblox-style).
        // Sacamos el forward horizontal de la cámara y derivamos el right.
        camera.getWorldDirection(_camFwd);
        _camFwd.y = 0;
        if (_camFwd.lengthSq() > 0.001) {
          _camFwd.normalize();
          // Right perpendicular (CCW desde arriba)
          _camRight.set(_camFwd.z, 0, -_camFwd.x);
          // Aplicar W/S (camFwd) y A/D (camRight)
          // move.z negativo = W = adelante
          playerPos.addScaledVector(_camFwd, -move.z * speed);
          playerPos.addScaledVector(_camRight, move.x * speed);
        }
      }

      // ---- Gravedad / salto del jugador ----
      if (!onGround || velY > 0) {
        velY -= GRAVITY * dt;
        playerPos.y += velY;
        if (playerPos.y <= EYE_HEIGHT) {
          playerPos.y = EYE_HEIGHT;
          velY = 0;
          onGround = true;
        }
      } else {
        playerPos.y = EYE_HEIGHT;
      }

      // ---- Avatar (puma): orientación INDEPENDIENTE de la cámara ----
      if (avatar) {
        avatar.position.set(playerPos.x, playerPos.y - EYE_HEIGHT, playerPos.z);

        // Cuando el puma CAMINA, gira para mirar la dirección hacia donde
        // apunta la cámara (no donde estoy moviendo). Así caminar S no le
        // voltea la cara — el puma simplemente retrocede mientras sigue de
        // espaldas a ti. Cuando NO camina, mantiene su orientación → la
        // cámara puede orbitar libremente alrededor del puma.
        // Usamos camera.getWorldDirection cada frame para garantizar valor
        // actualizado, sin depender del _camFwd del bloque de movimiento.
        if (isWalking) {
          const f = new THREE.Vector3();
          camera.getWorldDirection(f);
          f.y = 0;
          if (f.lengthSq() > 0.001) {
            f.normalize();
            pumaYawTarget = Math.atan2(f.x, f.z);
          }
        }
        let diff = pumaYawTarget - pumaYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        pumaYaw += diff * Math.min(1, 0.15 * dt);
        avatar.rotation.y = pumaYaw;
        // Debug log cada ~1 segundo
        if (Math.floor(now / 1000) !== Math.floor(last / 1000)) {
          console.log(`[Puma] walking=${isWalking} yaw=${pumaYaw.toFixed(2)} target=${pumaYawTarget.toFixed(2)} rotation.y=${avatar.rotation.y.toFixed(2)}`);
        }

        avatar.visible = cameraDistance > 1.5;

        // Animaciones — preferir mixer de GLB si existe.
        if (pumaMixer) {
          pumaMixer.update(dt / 60);
          // Decidir qué estado lógico queremos según el input
          const running = keys['ShiftLeft'] || keys['ShiftRight'];
          let desired = 'idle';
          if (danceToggled) desired = 'dance';
          else if (isWalking) desired = running ? 'run' : 'walk';

          // FIX: durante baile, SOBRESCRIBIR la rotación de los brazos para que
          // se mantengan abiertos hacia afuera. Antes sumaba a la animación y
          // se multiplicaban los movimientos (manos volando). Ahora seteamos
          // un valor fijo + un sine pequeño para que el baile tenga un poco de
          // movimiento sutil sin que las manos se agiten en exceso.
          if (desired === 'dance' && avatar?.userData?.armBones) {
            const t = Date.now() * 0.0025;
            const swing = Math.sin(t) * 0.15;        // mecida sutil ±8°
            const baseOut = 1.1;                      // ~63° hacia afuera (brazos en "T")
            const ab = avatar.userData.armBones;
            // SET (no +=) — esto domina la animación bakeada y mantiene los brazos abiertos.
            if (ab.leftUpper)  { ab.leftUpper.rotation.z  =  (baseOut + swing); ab.leftUpper.rotation.x  = 0; }
            if (ab.rightUpper) { ab.rightUpper.rotation.z = -(baseOut + swing); ab.rightUpper.rotation.x = 0; }
            // Los hombros sí los dejamos sumar suavemente para alinearse con el upper arm
            if (ab.leftShoulder)  ab.leftShoulder.rotation.z  = 0.15;
            if (ab.rightShoulder) ab.rightShoulder.rotation.z = -0.15;
          }
          // (jump no se setea aquí — el evento de Space ya lo dispara con fadeIn)

          // Crossfade hacia el estado deseado
          const targetWeights = {
            idle:  desired === 'idle'  ? 1 : 0,
            walk:  desired === 'walk'  ? 1 : 0,
            run:   desired === 'run'   ? 1 : 0,
            dance: desired === 'dance' ? 1 : 0,
            // jump no se afecta — su weight lo controla su LoopOnce
          };
          const fadeSpeed = 0.15 * dt;
          for (const [name, action] of Object.entries(pumaActions)) {
            if (!action || name === 'jump') continue;
            const cur = action.getEffectiveWeight();
            const tgt = targetWeights[name] != null ? targetWeights[name] : 0;
            action.setEffectiveWeight(cur + (tgt - cur) * Math.min(1, fadeSpeed));
          }
        } else if (avatar.userData.legs) {
          // Animación procedural del puma cartoon (con patas como nodos)
          if (isWalking) {
            walkPhase += dt * 0.25 * (keys['ShiftLeft'] ? 1.6 : 1);
            const legs = avatar.userData.legs;
            const swing = Math.sin(walkPhase) * 0.35;
            if (legs.FL) legs.FL.rotation.x = swing;
            if (legs.BR) legs.BR.rotation.x = swing;
            if (legs.FR) legs.FR.rotation.x = -swing;
            if (legs.BL) legs.BL.rotation.x = -swing;
            if (avatar.userData.tail) {
              avatar.userData.tail.rotation.z = Math.sin(walkPhase * 0.7) * 0.18;
            }
            avatar.position.y += Math.abs(Math.sin(walkPhase)) * 0.04;
          } else {
            const legs = avatar.userData.legs;
            ['FL','FR','BL','BR'].forEach(k => { if (legs[k]) legs[k].rotation.x *= 0.85; });
          }
        } else {
          // GLB ESTÁTICO sin clips ni patas separables (caso típico de
          // ComfyUI/TripoSR). Animamos el MODELO ENTERO para simular caminata:
          //   • Bob vertical sincopado (cuerpo sube/baja como felino al trotar)
          //   • Forward lean cuando corre (Shift)
          //   • Side-to-side sway leve (balanceo de gato)
          const running = keys['ShiftLeft'] || keys['ShiftRight'];
          if (isWalking) {
            walkPhase += dt * (running ? 0.40 : 0.27);
            const bob = Math.abs(Math.sin(walkPhase)) * (running ? 0.10 : 0.06);
            avatar.position.y += bob;
            // Sway lateral (rotación Z muy suave, como balanceo)
            const sway = Math.sin(walkPhase * 0.5) * (running ? 0.06 : 0.04);
            avatar.rotation.z = sway;
            // Forward lean al correr
            avatar.rotation.x = running ? -0.12 : -0.05;
          } else {
            // Idle: respiración sutil (escala suave) + retornar a postura recta
            const breathPhase = (Date.now() * 0.0015);
            const breathScale = 1 + Math.sin(breathPhase) * 0.012;
            // No sobreescribir scale total — preservar escala calculada al cargar
            // Aproximación: usar rotación pequeña que oscila
            avatar.rotation.z *= 0.88;  // decay hacia 0
            avatar.rotation.x *= 0.88;
          }
        }
      }

      // ---- Cámara sigue al jugador ----
      _updateCameraFromPlayer();

      // ---- Prompt "[E] Inspeccionar" ----
      if (raycaster && treeGroups.length > 0 && promptEl) {
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const hits = raycaster.intersectObjects(treeGroups, true);
        const closeHit = hits.find(h => h.distance < 14);
        const showPrompt = closeHit && (isLocked || (touchState && touchState.active));
        promptEl.style.display = showPrompt ? 'block' : 'none';
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
        if (pointerHandlers.onWheel) renderer.domElement.removeEventListener('wheel', pointerHandlers.onWheel);
      }
      pointerHandlers = null;
    }
    // Remover UI touch (joystick + botones) si existe
    if (touchState && touchState.uiEls) {
      touchState.uiEls.forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
    }
    touchState = null;
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
    avatar = null;
    playerPos = null;
    cameraDistance = 0;
    isLocked = false;
    yaw = pitch = 0;
    pumaYaw = pumaYawTarget = 0;
    if (pumaMixer) { try { pumaMixer.stopAllAction(); } catch (_) {} }
    pumaMixer = null;
    for (const k of Object.keys(pumaActions)) pumaActions[k] = null;
    pumaState = 'idle';
    danceToggled = false;
    velY = 0;
    onGround = true;
    Object.keys(keys).forEach(k => delete keys[k]);
  }

  window.DashboardWalkthrough = { init, destroy };
})();
