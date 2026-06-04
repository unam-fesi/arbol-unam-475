// ============================================================================
// iztacala-juanficus-special.js
// ============================================================================
// Caso especial: el árbol "Juan Ficus" (id=861) — plantado en memoria de un
// empleado muy querido de FES Iztacala. En el mapa 3D:
//   • Se destaca con un halo dorado + columna de luz suave
//   • Una paloma blanca vuela en órbita lenta alrededor
//   • Cada 15-30s se posa aleatoriamente en una rama y descansa 3-5s,
//     luego vuelve a volar.
//
// Activación:
//   IztacalaJuanFicus.enhance(scene, treeMeshes)
// llamado desde dashboard-iztacala.js tras plantar todos los árboles.
// Idempotente — múltiples llamadas no apilan palomas ni halos.
// ============================================================================

window.IztacalaJuanFicus = (function() {
  'use strict';

  const TARGET_TREE_ID = 861;     // ID en BD del árbol "Juan Ficus"
  const PALOMA_GLB_PATH = 'data/paloma.glb';
  const PALOMA_SCALE = 1.5;       // multiplier sobre el auto-size de 2.5m
  const ORBIT_HEIGHT = 14;        // metros sobre el suelo (encima de la copa)
  const ORBIT_RADIUS = 12;        // metros — órbita ancha para verse desde lejos
  const ORBIT_SPEED = 0.18;       // rad/s (~lento, vuelta cada ~35s)
  const FLY_DURATION_MIN = 15;    // s entre aterrizajes
  const FLY_DURATION_MAX = 30;
  const PERCH_DURATION_MIN = 3;
  const PERCH_DURATION_MAX = 5;

  let enhanced = false;
  let palomaMesh = null;
  let targetGroup = null;
  let halo = null, glowLight = null;
  let clock = null;
  let state = 'flying';           // 'flying' | 'descending' | 'perched' | 'ascending'
  let stateTimer = 0;
  let stateDuration = 0;
  let perchPosition = new THREE.Vector3();
  let baselineY = ORBIT_HEIGHT;
  let randomNextFly;

  /**
   * Engancha los efectos al árbol target si está presente en la escena.
   * @param {THREE.Scene} scene
   * @param {Array<{group, data}>} treeMeshes  - resultado de loadTrees() en dashboard-iztacala.js
   */
  async function enhance(scene, treeMeshes) {
    if (enhanced) return;       // ya activo, no duplicar
    if (!scene || !Array.isArray(treeMeshes)) return;

    // Buscar el árbol target
    const entry = treeMeshes.find(t => t?.data?.id === TARGET_TREE_ID);
    if (!entry) {
      console.warn('[IztacalaJuanFicus] árbol target id=' + TARGET_TREE_ID + ' no encontrado en la escena. Skip.');
      return;
    }
    targetGroup = entry.group;
    enhanced = true;
    clock = new THREE.Clock();

    // 1) Destacar visualmente el árbol — escala un poco mayor para sobresalir
    targetGroup.scale.multiplyScalar(1.15);

    // 2) Halo dorado en la base
    _addHalo(scene);

    // 3) Luz cálida apuntando hacia abajo desde encima del árbol
    _addGlowLight(scene);

    // 4) Etiqueta flotante "Juan Ficus · 🕊️"
    _addLabel(scene);

    // 5) Cargar la paloma y empezar la animación
    try {
      await _loadPaloma(scene);
      _startAnimation();
    } catch (err) {
      console.warn('[IztacalaJuanFicus] no se pudo cargar paloma.glb:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Visual helpers
  // ─────────────────────────────────────────────────────────────────────────

  function _treeCenter() {
    // El targetGroup wrapper queda en (0,0,0); el árbol real está dentro como
    // child con su posición seteada por dashboard-iztacala.js. Usamos el
    // bounding box para sacar el centro REAL en coordenadas mundiales.
    if (!targetGroup) return new THREE.Vector3(0, 0, 0);
    const box = new THREE.Box3().setFromObject(targetGroup);
    const c = new THREE.Vector3();
    box.getCenter(c);
    c.y = 0;   // queremos las coords del suelo, no a media altura del árbol
    return c;
  }

  function _addHalo(scene) {
    const c = _treeCenter();
    // Anillo dorado pulsante GRANDE en la base — debe verse desde altura
    // de cámara aérea del Iztacala 3D (~80m). RingGeometry de 6 a 10m radio.
    const ringGeo = new THREE.RingGeometry(6, 10, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd866,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,                     // que no oculte cosas detrás
    });
    halo = new THREE.Mesh(ringGeo, ringMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(c.x, 0.10, c.z);
    halo.userData = { type: 'juanFicusHalo' };
    halo.renderOrder = 2;
    scene.add(halo);

    // Halo interior más pequeño y más sólido para hacer el "centro" más rico
    const innerGeo = new THREE.CircleGeometry(5.5, 64);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffeb99,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(c.x, 0.08, c.z);
    inner.renderOrder = 1;
    scene.add(inner);
  }

  function _addGlowLight(scene) {
    const c = _treeCenter();
    glowLight = new THREE.PointLight(0xfff4cc, 1.2, 30, 1.6);
    glowLight.position.set(c.x, 18, c.z);
    glowLight.castShadow = false;
    scene.add(glowLight);
  }

  function _addLabel(scene) {
    // Sprite con texto "Juan Ficus 🕊️" flotando encima del árbol
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(46,81,23,0.92)';
    _roundRect(ctx, 8, 8, 496, 112, 24);
    ctx.fill();
    ctx.font = 'bold 56px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = '#ffd866';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Juan Ficus 🕊️', canvas.width / 2, canvas.height / 2 + 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(8, 2, 1);
    const c = _treeCenter();
    sprite.position.set(c.x, 22, c.z);
    sprite.userData = { type: 'juanFicusLabel' };
    scene.add(sprite);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Paloma
  // ─────────────────────────────────────────────────────────────────────────

  async function _loadPaloma(scene) {
    // En este proyecto el GLTFLoader vive en THREE.GLTFLoader (cargado via
    // <script src="...examples/js/loaders/GLTFLoader.js">), NO en window.
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
      console.warn('[IztacalaJuanFicus] THREE.GLTFLoader no disponible');
      return;
    }
    const loader = new THREE.GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(PALOMA_GLB_PATH, resolve, undefined, reject);
    });
    palomaMesh = gltf.scene;

    // Auto-escalar al tamaño deseado (~1.2m wingspan) sin depender del
    // tamaño con el que se exportó el GLB.
    const box = new THREE.Box3().setFromObject(palomaMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetSize = 2.5;                  // 2.5m de envergadura visible
    palomaMesh.scale.setScalar(targetSize / maxDim * PALOMA_SCALE);

    palomaMesh.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        if (o.material) {
          o.material.color = new THREE.Color(0xffffff);
          o.material.emissive = new THREE.Color(0x222222);
        }
      }
    });
    // Posición inicial en órbita
    const c = _treeCenter();
    palomaMesh.position.set(c.x + ORBIT_RADIUS, ORBIT_HEIGHT, c.z);
    scene.add(palomaMesh);
    console.log(`[IztacalaJuanFicus] paloma plantada en órbita | center=(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) | size=${(targetSize).toFixed(1)}m`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Animación: órbita + aterrizajes aleatorios
  // ─────────────────────────────────────────────────────────────────────────

  function _startAnimation() {
    state = 'flying';
    stateTimer = 0;
    stateDuration = _rand(FLY_DURATION_MIN, FLY_DURATION_MAX);
    _tick();
  }

  function _tick() {
    if (!palomaMesh || !clock) return;
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();
    stateTimer += dt;
    const center = _treeCenter();

    // Halo pulsante
    if (halo) {
      const pulse = 0.55 + Math.sin(t * 1.5) * 0.20;
      halo.material.opacity = pulse;
      halo.rotation.z = t * 0.15;            // gira lento
    }

    switch (state) {
      case 'flying': {
        // Órbita circular a altura constante
        const angle = t * ORBIT_SPEED;
        const x = center.x + Math.cos(angle) * ORBIT_RADIUS;
        const z = center.z + Math.sin(angle) * ORBIT_RADIUS;
        palomaMesh.position.set(x, ORBIT_HEIGHT + Math.sin(t * 2) * 0.4, z);
        // La paloma mira en la dirección del vuelo (tangente al círculo)
        palomaMesh.lookAt(
          center.x + Math.cos(angle + 0.1) * ORBIT_RADIUS,
          ORBIT_HEIGHT,
          center.z + Math.sin(angle + 0.1) * ORBIT_RADIUS
        );
        if (stateTimer >= stateDuration) {
          state = 'descending';
          stateTimer = 0;
          stateDuration = 2.5;                // 2.5s para bajar
          // Elegir un punto aleatorio en la copa del árbol
          const branchAngle = Math.random() * Math.PI * 2;
          const branchR = 1.2 + Math.random() * 2.5;
          perchPosition.set(
            center.x + Math.cos(branchAngle) * branchR,
            6 + Math.random() * 3,            // altura entre 6 y 9m (copa)
            center.z + Math.sin(branchAngle) * branchR
          );
        }
        break;
      }
      case 'descending': {
        const k = Math.min(stateTimer / stateDuration, 1);
        palomaMesh.position.lerpVectors(palomaMesh.position, perchPosition, k * 0.15);
        palomaMesh.lookAt(perchPosition);
        if (stateTimer >= stateDuration) {
          state = 'perched';
          stateTimer = 0;
          stateDuration = _rand(PERCH_DURATION_MIN, PERCH_DURATION_MAX);
          palomaMesh.position.copy(perchPosition);
        }
        break;
      }
      case 'perched': {
        // Sutil bobbing — la paloma "respira" parada
        palomaMesh.position.y = perchPosition.y + Math.sin(t * 3) * 0.08;
        if (stateTimer >= stateDuration) {
          state = 'ascending';
          stateTimer = 0;
          stateDuration = 2.0;
        }
        break;
      }
      case 'ascending': {
        const k = Math.min(stateTimer / stateDuration, 1);
        const target = new THREE.Vector3(perchPosition.x, ORBIT_HEIGHT, perchPosition.z);
        palomaMesh.position.lerpVectors(palomaMesh.position, target, k * 0.20);
        if (stateTimer >= stateDuration) {
          state = 'flying';
          stateTimer = 0;
          stateDuration = _rand(FLY_DURATION_MIN, FLY_DURATION_MAX);
        }
        break;
      }
    }

    requestAnimationFrame(_tick);
  }

  function _rand(min, max) { return min + Math.random() * (max - min); }

  return { enhance };
})();
