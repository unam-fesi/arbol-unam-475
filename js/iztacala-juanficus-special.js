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
  // Tamaño visible desde la cámara aérea (~80m). Una paloma de 1m casi no
  // se distingue; subimos a 9m de envergadura para que tenga presencia
  // SIMBÓLICA — es un memorial, debe imponer.
  const PALOMA_WINGSPAN_M = 9;
  const ORBIT_HEIGHT = 18;        // metros sobre el suelo (bien encima de la copa)
  const ORBIT_RADIUS = 16;        // metros — órbita ancha
  const ORBIT_SPEED = 0.14;       // rad/s — vuelo majestuoso lento (~45s vuelta)
  const WING_FLAP_HZ = 1.6;       // aleteo manual (1.6 Hz ≈ paloma real)
  const FLY_DURATION_MIN = 20;
  const FLY_DURATION_MAX = 35;
  const PERCH_DURATION_MIN = 3;
  const PERCH_DURATION_MAX = 6;

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
  // Animación de aleteo. Si el GLB trae animations las usamos; si no, animamos
  // bones manualmente buscando "wing"/"ala" en el nombre.
  let mixer = null;
  let flapAction = null;
  let wingBones = [];      // bones cuyo nombre contiene wing/ala/feather

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
    // Sprite con texto "Juan Ficus 🕊️" flotando encima del árbol.
    // Canvas alta resolución (1024x256, ratio 4:1) + sprite escalado grande
    // para que sea legible desde lejos en el mapa 3D.
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    // Fondo verde UNAM con borde redondeado más grueso
    ctx.fillStyle = 'rgba(46,81,23,0.94)';
    _roundRect(ctx, 12, 12, 1000, 232, 40);
    ctx.fill();
    // Borde dorado interior para realzar el rótulo
    ctx.strokeStyle = '#ffd866';
    ctx.lineWidth = 4;
    _roundRect(ctx, 14, 14, 996, 228, 38);
    ctx.stroke();
    // Texto dorado, grande, con sombra para legibilidad
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.font = 'bold 112px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = '#ffd866';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Juan Ficus 🕊️', canvas.width / 2, canvas.height / 2 + 6);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    // Etiqueta mucho más grande (antes 8x2). 18x4.5 mantiene ratio 4:1.
    sprite.scale.set(18, 4.5, 1);
    sprite.renderOrder = 999;  // siempre por encima
    const c = _treeCenter();
    // Sube el sprite un poco más para que no choque con la copa del árbol
    sprite.position.set(c.x, 26, c.z);
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
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
      console.warn('[IztacalaJuanFicus] THREE.GLTFLoader no disponible');
      return;
    }
    const loader = new THREE.GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(PALOMA_GLB_PATH, resolve, undefined, reject);
    });

    // ── Defensa contra "cabeza separada del cuerpo" ────────────────────────
    // Estrategia: NO escalamos directamente `gltf.scene`. En su lugar, lo
    // metemos como hijo de un Group "rig" y centramos su pivote. Esto evita
    // que offsets internos heredados del GLB (cuando algún sub-mesh tiene
    // position/scale propios) se amplifiquen al escalar el root y separen
    // visualmente cabeza y cuerpo.
    const inner = gltf.scene;
    inner.updateMatrixWorld(true);

    // Limpieza por mesh: resetear morph targets (a veces vienen con valores
    // != 0 que distorsionan cabeza/pico), normalizar skin weights, materiales
    // double-sided, y mantener todo dentro del frustum.
    const meshNames = [];
    const boneNames = [];
    inner.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        meshNames.push((o.isSkinnedMesh ? '[skinned] ' : '') + (o.name || '(unnamed mesh)'));
        o.castShadow = true;
        o.frustumCulled = false;
        // Reset morph targets — la causa más común de "cabeza desplazada"
        if (Array.isArray(o.morphTargetInfluences) && o.morphTargetInfluences.length) {
          o.morphTargetInfluences.fill(0);
        }
        // Normalizar pesos de skinning para que las uniones (cuello) no se
        // estiren cuando hay bones interpolados con suma de pesos != 1
        if (o.isSkinnedMesh && typeof o.normalizeSkinWeights === 'function') {
          try { o.normalizeSkinWeights(); } catch (_) {}
        }
        if (o.material) {
          // Algunos materials vienen como array (multimaterial)
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => {
            m.side = THREE.DoubleSide;
            m.color = new THREE.Color(0xffffff);
            m.emissive = new THREE.Color(0x444444);
            m.emissiveIntensity = 0.8;
            m.transparent = false;
            m.opacity = 1;
            m.needsUpdate = true;
          });
        }
      }
      if (o.isBone) boneNames.push(o.name || '(unnamed bone)');
      const n = (o.name || '').toLowerCase();
      if (o.isBone && (n.includes('wing') || n.includes('ala') || n.includes('feather') || n.includes('pluma'))) {
        wingBones.push(o);
      }
    });

    // Recentrar el GLB: medimos el bounding box ANTES de escalar, restamos el
    // centro a `inner.position` para que el pivote del Group quede en el
    // centro geométrico (no donde el modelador haya puesto el origen).
    const preBox = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    preBox.getSize(size);
    preBox.getCenter(center);
    inner.position.sub(center);   // ahora el centro del modelo está en (0,0,0) del rig
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const baseScale = PALOMA_WINGSPAN_M / maxDim;

    // Rig padre: la escala vive aquí, no en el inner. Toda animación de
    // bobbing / scale futura se hace sobre `palomaMesh` (= rig).
    palomaMesh = new THREE.Group();
    palomaMesh.name = 'palomaRig';
    palomaMesh.add(inner);
    palomaMesh.scale.setScalar(baseScale);
    palomaMesh.userData._baseScale = baseScale;
    palomaMesh.userData._inner = inner;

    // Si hay skeletons, forzar update después de los cambios
    inner.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) {
        o.skeleton.calculateInverses && o.skeleton.calculateInverses();
        o.skeleton.update && o.skeleton.update();
      }
    });
    palomaMesh.updateMatrixWorld(true);

    console.log('[IztacalaJuanFicus] paloma GLB → meshes:', meshNames, '| bones (' + boneNames.length + '):', boneNames.slice(0, 12));
    console.log('[IztacalaJuanFicus] modelo size pre-scale:', size.toArray().map(n => n.toFixed(2)), '→ baseScale=', baseScale.toFixed(3));

    // Si el GLB trae animaciones (idle_fly, flap, etc.) las usamos.
    // El mixer va al `inner` (donde viven los bones), no al rig escalado.
    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(inner);
      // Buscar la animación que parezca de aleteo
      const flapClip = gltf.animations.find(a => /flap|fly|wing|ala/i.test(a.name)) || gltf.animations[0];
      if (flapClip) {
        flapAction = mixer.clipAction(flapClip);
        flapAction.setLoop(THREE.LoopRepeat).play();
        console.log('[IztacalaJuanFicus] usando animación del GLB:', flapClip.name);
      }
    } else if (wingBones.length > 0) {
      console.log('[IztacalaJuanFicus] aleteo manual con ' + wingBones.length + ' bones de alas');
    } else {
      console.log('[IztacalaJuanFicus] GLB sin animación ni bones — aleteamos el mesh completo (fallback)');
    }

    const c = _treeCenter();
    palomaMesh.position.set(c.x + ORBIT_RADIUS, ORBIT_HEIGHT, c.z);
    scene.add(palomaMesh);
    console.log(`[IztacalaJuanFicus] paloma plantada | center=(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) | wingspan=${PALOMA_WINGSPAN_M}m`);
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
      halo.rotation.z = t * 0.15;
    }

    // ── ALETEO ──
    // Velocidad: rápido cuando vuela, lento cuando aterriza, quieto cuando posada.
    const flapping = (state === 'flying' || state === 'descending' || state === 'ascending');
    if (mixer) {
      // GLB con animación embebida
      const speed = flapping ? 1.0 : 0.0;
      if (flapAction) flapAction.setEffectiveTimeScale(speed);
      mixer.update(dt);
    } else if (wingBones.length > 0) {
      // Aleteo manual rotando bones (eje Z, simétrico izq/der)
      const amp = flapping ? 0.6 : 0.05;
      const angle = Math.sin(t * Math.PI * 2 * WING_FLAP_HZ) * amp;
      wingBones.forEach((b, i) => {
        // Asume orden alternado izquierda/derecha — invertir para una de las dos
        const side = (i % 2 === 0) ? 1 : -1;
        b.rotation.z = angle * side;
      });
    } else {
      // Fallback sin bones ni anim: NO modificamos scale.y solo (eso aplastaba la
      // paloma y separaba visualmente la cabeza del cuerpo). Mejor un "bobbing"
      // vertical de la POSICIÓN — sugiere vuelo sin deformar geometría.
      const base = palomaMesh.userData._baseScale || 1;
      // Asegurar escala uniforme cada frame (defensivo contra cualquier mutación previa)
      if (palomaMesh.scale.x !== base || palomaMesh.scale.y !== base || palomaMesh.scale.z !== base) {
        palomaMesh.scale.setScalar(base);
      }
      // El bobbing real se aplica en el switch de estados más abajo modificando .position.y
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
