// js/night-mode.js
// ============================================================================
// MODO BOSQUE DEL 475 — vista cinematográfica nocturna del mapa 3D.
//
// Aporta:
//   • Cielo estrellado (THREE.Points con sprites)
//   • Luciérnagas amarillo cálido orbitando cada árbol vivo (cantidad ∝ health_score)
//   • Halo dorado UNAM (#ffd866) sobre árboles del 475 aniversario (tree_code FES*)
//   • Reducción de luz ambiente para sensación de noche real
//
// Uso desde los dashboards 3D:
//   const nightFx = NightMode.enable(scene, treeMeshes, { savedKey: 'izta' });
//   // En el animate loop:  nightFx.tick(elapsed);
//   // Para apagar:         nightFx.disable();
//
// Estado: ON/OFF persistente en localStorage por dashboard (savedKey).
// ============================================================================

window.NightMode = (function () {
  'use strict';

  const STAR_COUNT = 900;
  const FIREFLY_GLOW_HEX = 0xFFE680;     // amarillo cálido cálido
  const HALO_GOLD_HEX    = 0xFFD866;     // oro UNAM
  const NIGHT_SKY_HEX    = 0x070d20;     // azul casi-negro
  const NIGHT_AMBIENT    = 0.12;

  // ---------------------------------------------------------------------------
  // Texturas procedurales (cached). Evita network — generamos los sprites con canvas.
  // ---------------------------------------------------------------------------
  let _starTexture = null;
  function _getStarTexture() {
    if (_starTexture) return _starTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(220,230,255,0.6)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    _starTexture = new THREE.CanvasTexture(c);
    return _starTexture;
  }

  let _fireflyTexture = null;
  function _getFireflyTexture() {
    if (_fireflyTexture) return _fireflyTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(255,240,170,1)');
    grad.addColorStop(0.4, 'rgba(255,220,100,0.6)');
    grad.addColorStop(1.0, 'rgba(255,200,50,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    _fireflyTexture = new THREE.CanvasTexture(c);
    return _fireflyTexture;
  }

  // Partícula de polvo dorado: punto suave brillante con tinte cálido.
  let _dustTexture = null;
  function _getDustTexture() {
    if (_dustTexture) return _dustTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0.0, 'rgba(255,236,170,1)');
    grad.addColorStop(0.4, 'rgba(255,216,102,0.85)');
    grad.addColorStop(1.0, 'rgba(255,180,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    _dustTexture = new THREE.CanvasTexture(c);
    return _dustTexture;
  }

  // ---------------------------------------------------------------------------
  // CREATE FX para una escena. Devuelve un handle con tick() y disable().
  // ---------------------------------------------------------------------------
  function enable(scene, treeMeshes, opts = {}) {
    if (!scene || typeof THREE === 'undefined') {
      console.warn('[NightMode] scene o THREE no disponibles');
      return null;
    }

    // ---- 1. Guardar estado original para poder restaurar al desactivar ----
    const originalState = {
      background: scene.background,
      ambientLights: [],
      directionalIntensities: new Map(),
    };
    scene.traverse(obj => {
      if (obj.isAmbientLight) {
        originalState.ambientLights.push({ light: obj, intensity: obj.intensity });
        obj.intensity = NIGHT_AMBIENT;
      } else if (obj.isDirectionalLight || obj.isHemisphereLight) {
        originalState.directionalIntensities.set(obj, obj.intensity);
        obj.intensity *= 0.35;
      }
    });

    // ---- 2. Cielo nocturno (color sólido azul muy oscuro) ----
    scene.background = new THREE.Color(NIGHT_SKY_HEX);

    // ---- 3. Estrellas (puntos en una esfera lejana) ----
    const starsGroup = new THREE.Group();
    starsGroup.name = '__nightStars';
    {
      const positions = new Float32Array(STAR_COUNT * 3);
      const colors = new Float32Array(STAR_COUNT * 3);
      const sizes = new Float32Array(STAR_COUNT);
      const R = 800;
      for (let i = 0; i < STAR_COUNT; i++) {
        // Esfera uniforme arriba del horizonte
        const u = Math.random();
        const v = Math.random() * 0.5 + 0.3; // bias hacia "arriba"
        const theta = 2 * Math.PI * u;
        const phi  = Math.acos(2 * v - 1);
        positions[i * 3]     = R * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = R * Math.cos(phi);
        positions[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
        // Color con tinte ligero (algunas más cálidas, otras más frías)
        const warm = Math.random();
        colors[i * 3]     = 0.85 + warm * 0.15;
        colors[i * 3 + 1] = 0.85 + warm * 0.10;
        colors[i * 3 + 2] = 0.95 + (1 - warm) * 0.05;
        sizes[i] = 6 + Math.random() * 18;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('size',  new THREE.BufferAttribute(sizes, 1));
      const mat = new THREE.PointsMaterial({
        size: 8,
        sizeAttenuation: true,
        map: _getStarTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      starsGroup.add(new THREE.Points(geo, mat));
    }
    scene.add(starsGroup);

    // ---- 4. Luciérnagas por árbol (cantidad ∝ salud) ----
    const fireflies = []; // { sprite, baseY, phase, orbitR, speed, treeX, treeZ }
    const treeArr = Array.isArray(treeMeshes) ? treeMeshes : [];

    // Recolectamos los árboles FES (para el polvo dorado del 475).
    const fesTrees = [];

    // Helper: obtener la posición real del árbol en world coords.
    // CRÍTICO: en Iztacala el group.position es (0,0,0) — la translación se
    // aplica al mesh interno. Por eso necesitamos calcular el bbox del group
    // y usar su centro horizontal (X,Z). Funciona también con CampusMap donde
    // sí se setea group.position directamente.
    const _tmpBox = new THREE.Box3();
    const _tmpVec = new THREE.Vector3();
    function _treeWorldPos(group) {
      _tmpBox.setFromObject(group);
      _tmpBox.getCenter(_tmpVec);
      const minY = isFinite(_tmpBox.min.y) ? _tmpBox.min.y : 0;
      return { x: _tmpVec.x, z: _tmpVec.z, y: minY };
    }

    treeArr.forEach((entry) => {
      // entry puede ser { group, data } (Iztacala) o solo el group (CampusMap)
      const group = entry.group || entry;
      if (!group || !group.traverse) return;
      const data = entry.data || group.userData?.tree || {};
      const health = Number(data.health_score) || 50;
      const isFES = /^FES/i.test(String(data.tree_code || ''));
      const wp = _treeWorldPos(group);
      const x = wp.x;
      const z = wp.z;
      // Si el bbox resultó vacío/inválido (mesh aún cargando), saltar.
      if (!isFinite(x) || !isFinite(z)) return;

      // --- Luciérnagas (0 a 5 según salud) ---
      const nFireflies = health < 30 ? 0 : Math.round(health / 20);
      for (let i = 0; i < nFireflies; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: _getFireflyTexture(),
          color: FIREFLY_GLOW_HEX,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.9,
        }));
        sprite.scale.set(0.6, 0.6, 0.6);
        const orbitR = 1.5 + Math.random() * 2.5;
        const baseY = 1.2 + Math.random() * 3.5;
        const phase = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 0.8;
        sprite.position.set(x + orbitR, baseY, z);
        scene.add(sprite);
        fireflies.push({ sprite, baseY, phase, orbitR, speed, treeX: x, treeZ: z });
      }

      if (isFES) fesTrees.push({ x, z });
    });

    // ---- Polvo dorado luminoso ascendente sobre árboles 475 ----
    // Un solo THREE.Points con todas las partículas de TODOS los FES*: 1 draw call.
    // Cada partícula tiene origen, velocidad y vida propias. ShaderMaterial custom
    // permite fade por partícula (alpha varying) sin overhead de 1 sprite c/u.
    const DUST_PER_TREE = 35;
    const TOTAL_DUST = fesTrees.length * DUST_PER_TREE;
    let dust = null;
    if (TOTAL_DUST > 0) {
      const positions = new Float32Array(TOTAL_DUST * 3);
      const alphas    = new Float32Array(TOTAL_DUST);
      const ages      = new Float32Array(TOTAL_DUST);
      const lifetimes = new Float32Array(TOTAL_DUST);
      const velocities = new Float32Array(TOTAL_DUST * 3);
      const origins    = new Float32Array(TOTAL_DUST * 3);

      fesTrees.forEach((t, ti) => {
        for (let i = 0; i < DUST_PER_TREE; i++) {
          const idx = ti * DUST_PER_TREE + i;
          // origen dentro de un radio pequeño en la base del árbol
          const r = Math.random() * 1.2;
          const ang = Math.random() * Math.PI * 2;
          const ox = t.x + Math.cos(ang) * r;
          const oz = t.z + Math.sin(ang) * r;
          const oy = 0.15 + Math.random() * 0.25;
          origins[idx * 3] = ox; origins[idx * 3 + 1] = oy; origins[idx * 3 + 2] = oz;
          // posición inicial dispersada en altura → no se ven "naciendo" todas al tiempo
          const startAge = Math.random();
          positions[idx * 3]     = ox + (Math.random() - 0.5) * 0.3;
          positions[idx * 3 + 1] = oy + startAge * 5.0;
          positions[idx * 3 + 2] = oz + (Math.random() - 0.5) * 0.3;
          // velocidad ascendente con drift lateral leve (efecto "humo dorado")
          velocities[idx * 3]     = (Math.random() - 0.5) * 0.18;
          velocities[idx * 3 + 1] = 0.55 + Math.random() * 0.55;
          velocities[idx * 3 + 2] = (Math.random() - 0.5) * 0.18;
          lifetimes[idx] = 3.0 + Math.random() * 2.0;
          ages[idx] = startAge * lifetimes[idx];
          alphas[idx] = 1.0 - startAge;
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('alpha',    new THREE.BufferAttribute(alphas, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap:   { value: _getDustTexture() },
          uColor: { value: new THREE.Color(HALO_GOLD_HEX) },
          uScale: { value: 1800.0 },  // tamaño en pixeles a 1 unidad de cámara
        },
        vertexShader: [
          'attribute float alpha;',
          'varying float vAlpha;',
          'uniform float uScale;',
          'void main() {',
          '  vAlpha = alpha;',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  gl_Position = projectionMatrix * mv;',
          '  // Tamaño en pixeles: uScale/distancia. Clamp [6, 80] para que',
          '  // se vea bien desde cerca y desde lejos sin saturar la pantalla.',
          '  gl_PointSize = clamp(uScale / -mv.z, 6.0, 80.0);',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D uMap;',
          'uniform vec3 uColor;',
          'varying float vAlpha;',
          'void main() {',
          '  vec4 tex = texture2D(uMap, gl_PointCoord);',
          '  if (tex.a < 0.02) discard;',
          '  gl_FragColor = vec4(uColor, tex.a * vAlpha);',
          '}',
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false; // el bbox cambia c/ frame → evitar pop
      scene.add(points);
      dust = { points, geo, mat, positions, alphas, ages, lifetimes, velocities, origins, count: TOTAL_DUST };
    }

    // ---- 5. Handle con tick + disable ----
    const handle = {
      isNight: true,
      tick(elapsed, dt) {
        const _dt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : 0.016;
        // Luciérnagas: orbita pequeña + twinkle de opacity
        for (let i = 0; i < fireflies.length; i++) {
          const f = fireflies[i];
          const t = elapsed * f.speed + f.phase;
          f.sprite.position.x = f.treeX + Math.cos(t) * f.orbitR;
          f.sprite.position.z = f.treeZ + Math.sin(t) * f.orbitR;
          f.sprite.position.y = f.baseY + Math.sin(t * 1.7) * 0.4;
          f.sprite.material.opacity = 0.45 + Math.abs(Math.sin(t * 2.3)) * 0.55;
        }
        // Polvo dorado: integración euler simple + respawn al cumplir su vida.
        // Opacidad: rampa rápida de aparición + desvanecido al subir (linear t).
        if (dust) {
          const pos = dust.positions;
          const alp = dust.alphas;
          const age = dust.ages;
          const life = dust.lifetimes;
          const vel = dust.velocities;
          const org = dust.origins;
          for (let i = 0; i < dust.count; i++) {
            age[i] += _dt;
            if (age[i] >= life[i]) {
              // respawn en la base del mismo árbol con jitter
              age[i] = 0;
              pos[i*3]     = org[i*3]     + (Math.random() - 0.5) * 0.5;
              pos[i*3 + 1] = org[i*3 + 1] + (Math.random() - 0.5) * 0.1;
              pos[i*3 + 2] = org[i*3 + 2] + (Math.random() - 0.5) * 0.5;
            } else {
              pos[i*3]     += vel[i*3]     * _dt;
              pos[i*3 + 1] += vel[i*3 + 1] * _dt;
              pos[i*3 + 2] += vel[i*3 + 2] * _dt;
            }
            // Curva de opacidad: sube rápido a 1.0 al spawn, baja linealmente a 0 al final.
            const u = age[i] / life[i];   // 0..1
            // fade in en primeros 12%, fade out lineal después
            let a;
            if (u < 0.12) a = u / 0.12;
            else          a = (1 - u) / 0.88;
            alp[i] = Math.max(0, Math.min(1, a));
          }
          dust.geo.attributes.position.needsUpdate = true;
          dust.geo.attributes.alpha.needsUpdate    = true;
        }
      },
      disable() {
        // Restaurar iluminación original
        originalState.ambientLights.forEach(({ light, intensity }) => {
          light.intensity = intensity;
        });
        originalState.directionalIntensities.forEach((intensity, light) => {
          light.intensity = intensity;
        });
        scene.background = originalState.background;
        // Quitar stars
        scene.remove(starsGroup);
        starsGroup.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        // Quitar luciérnagas
        fireflies.forEach(f => {
          scene.remove(f.sprite);
          f.sprite.material.dispose();
        });
        fireflies.length = 0;
        // Quitar polvo dorado
        if (dust) {
          scene.remove(dust.points);
          dust.geo.dispose();
          dust.mat.dispose();
          dust = null;
        }
        handle.isNight = false;
      },
    };
    return handle;
  }

  // ---------------------------------------------------------------------------
  // BOTÓN TOGGLE flotante (esquina inferior-derecha del contenedor del mapa).
  // El dashboard pasa un callback onToggle(isNight:boolean) que recibe la decisión.
  // El estado se persiste en localStorage bajo 'arbol_night_<savedKey>'.
  // ---------------------------------------------------------------------------
  function attachToggleButton(containerEl, savedKey, onToggle) {
    if (!containerEl) return null;
    const STORE = 'arbol_night_' + (savedKey || 'default');
    const initial = localStorage.getItem(STORE) === '1';

    const btn = document.createElement('button');
    btn.id = 'night-toggle-' + (savedKey || 'def');
    btn.type = 'button';
    btn.title = 'Modo Bosque del 475 (nocturno)';
    btn.style.cssText = [
      'position:absolute', 'right:0.7rem', 'bottom:0.7rem',
      'z-index:30', 'width:46px', 'height:46px',
      'border-radius:50%', 'border:1px solid rgba(0,0,0,0.15)',
      'background:rgba(255,255,255,0.92)', 'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)', 'font-size:22px',
      'display:flex', 'align-items:center', 'justify-content:center',
      'transition:background 0.2s, transform 0.15s',
    ].join(';');

    function paint(isNight) {
      btn.textContent = isNight ? '☀️' : '🌙';
      btn.title = isNight
        ? 'Volver al modo día'
        : 'Modo Bosque del 475 (nocturno con luciérnagas)';
      btn.style.background = isNight
        ? 'rgba(20,30,60,0.92)'
        : 'rgba(255,255,255,0.92)';
    }
    paint(initial);

    btn.addEventListener('click', () => {
      const wasNight = localStorage.getItem(STORE) === '1';
      const newState = !wasNight;
      localStorage.setItem(STORE, newState ? '1' : '0');
      paint(newState);
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 120);
      try { if (typeof onToggle === 'function') onToggle(newState); } catch (e) { console.warn(e); }
    });

    containerEl.appendChild(btn);
    // Notificamos al dashboard del estado inicial para que aplique si era ON
    if (initial && typeof onToggle === 'function') {
      // Defer: el dashboard tal vez todavía no terminó de cargar árboles
      setTimeout(() => { try { onToggle(true); } catch (_) {} }, 400);
    }
    return { button: btn, getState: () => localStorage.getItem(STORE) === '1' };
  }

  return { enable, attachToggleButton };
})();
