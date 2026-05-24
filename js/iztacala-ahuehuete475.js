// js/iztacala-ahuehuete475.js
// ============================================================================
// Logo "Ahuehuete 475" (GLB) — al lado de las letras FES UNAM Iztacala,
// dentro del mismo pedazo de jardín al norte de Unidad de Seminarios.
//
// Mismo patrón que iztacala-letras.js: módulo independiente cargable desde
// IztacalaMap (vista 3D aérea) y DashboardWalkthrough (caminata).
//
// Para recalibrar posición/orientación, usa desde el walkthrough:
//   window.DashboardWalkthrough.debug.moveAhuehueteHere()
// o directamente:
//   window.IztacalaAhuehuete475.config.position = { x: ..., y: 0, z: ... };
//   window.IztacalaAhuehuete475.config.rotationY = Math.PI/4;
//   window.IztacalaAhuehuete475.config.targetHeight = 20;
// ============================================================================

window.IztacalaAhuehuete475 = (function() {
  'use strict';

  // Letras en (186.37, 0, -55) con rotationY = π/2 (paralelas al pasillo).
  // El logo va junto a las letras, mismo Z, alineado al lado izquierdo del
  // letrero (X menor) — dentro del mismo prado, paralelo al letrero.
  const config = {
    glbPath: 'data/Ahuehuete475.glb',
    // Centro del prado al lado oeste de las letras, mismo Z para alineación.
    // Las letras tienen targetWidth 22 → ocupan X de ~175 a ~197.
    // El logo va más a la izquierda (X menor) para no superponerse.
    position: { x: 150, y: 0, z: -55 },
    rotationX: 0,                   // auto-detect Z-up dentro de _loadTemplate puede pisarlo
    rotationY: -Math.PI / 2,        // mismo orient que las letras
    targetHeight: 15,               // ~15m — bajé un poco por si el prado es chico
    castShadow: true,
  };

  let _templatePromise = null;
  let _lastInstance = null;
  let _liftY = 0;

  function _makeLoader() {
    const loader = new THREE.GLTFLoader();
    if (typeof THREE.DRACOLoader !== 'undefined') {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      draco.setDecoderConfig({ type: 'js' });
      loader.setDRACOLoader(draco);
    }
    return loader;
  }

  function _loadTemplate() {
    if (_templatePromise) return _templatePromise;
    _templatePromise = new Promise((resolve) => {
      if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
        console.warn('[Ahuehuete475] THREE.GLTFLoader no disponible');
        return resolve(null);
      }
      const loader = _makeLoader();
      console.warn(`[Ahuehuete475] ⏳ cargando ${config.glbPath} …`);
      loader.load(config.glbPath,
        (gltf) => {
          const root = gltf.scene;
          // Quitar cámaras del GLB
          const toRemove = [];
          root.traverse(o => { if (o.isCamera) toRemove.push(o); });
          toRemove.forEach(o => o.parent && o.parent.remove(o));

          // Normalizar escala a targetHeight usando la DIM MÁS GRANDE del bbox
          // (robusto contra GLBs Z-up donde "altura" está en Z, no Y).
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.01);
          const scale = config.targetHeight / maxDim;
          root.scale.setScalar(scale);
          // Auto-detectar Z-up: si la dim Z es la más grande, el modelo está
          // acostado y necesita rotationX = -π/2 para pararse. El user puede
          // forzar manualmente en config.rotationX.
          const isZup = size.z > size.x && size.z > size.y;
          if (isZup && (config.rotationX === undefined || config.rotationX === null || config.rotationX === 0)) {
            console.warn(`[Ahuehuete475] auto-detect: GLB parece Z-up (size.z=${size.z.toFixed(1)} > size.y=${size.y.toFixed(1)}). Aplicando rotationX = -π/2`);
            config.rotationX = -Math.PI / 2;
          }

          // Asegurar sombras
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
              if (o.material) {
                o.material = o.material.clone();
                // Doble cara por si el logo tiene partes planas
                o.material.side = THREE.DoubleSide;
              }
            }
          });
          console.warn(`[Ahuehuete475] ✓ cargado (escala ${scale.toFixed(3)}, bbox ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)})`);
          resolve(root);
        },
        undefined,
        (err) => {
          console.error('[Ahuehuete475] ✗ falló cargar:', err?.message || err);
          resolve(null);
        });
    });
    return _templatePromise;
  }

  async function addTo(scene) {
    const template = await _loadTemplate();
    if (!template) return null;
    // Mismo patrón que letras: outer rota en Y mundo, inner en X local
    const inner = template.clone(true);
    inner.rotation.x = config.rotationX || 0;
    inner.position.set(0, 0, 0);

    const outer = new THREE.Group();
    outer.add(inner);
    outer.rotation.y = config.rotationY || 0;

    outer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(outer);
    _liftY = -box.min.y;
    outer.position.set(
      config.position.x,
      config.position.y + _liftY,
      config.position.z
    );
    scene.add(outer);
    _lastInstance = outer;
    console.warn(`🟢 Logo Ahuehuete475 en (${config.position.x}, ${(config.position.y + _liftY).toFixed(2)}, ${config.position.z}) rotX=${(config.rotationX||0).toFixed(2)} rotY=${(config.rotationY||0).toFixed(2)}  bbox-post=${(box.max.x-box.min.x).toFixed(1)}×${(box.max.y-box.min.y).toFixed(1)}×${(box.max.z-box.min.z).toFixed(1)}m  YRange[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}]`);
    return outer;
  }

  function setPosition(x, z) {
    config.position.x = x; config.position.z = z;
    if (_lastInstance) _lastInstance.position.set(x, config.position.y + _liftY, z);
  }
  function setRotationY(rad) {
    config.rotationY = rad;
    if (_lastInstance) _lastInstance.rotation.y = rad;
  }
  function getInstance() { return _lastInstance; }

  return { config, addTo, _loadTemplate, setPosition, setRotationY, getInstance };
})();
