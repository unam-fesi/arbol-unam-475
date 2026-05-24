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

  // Posición de las letras = (186.37, 0, -63.35) con rotationY = -1.493.
  // El logo va lateral (a la derecha del frente de las letras) a ~18m
  // de offset, dentro del mismo prado de césped. El user puede recalibrar.
  //
  // Cálculo del offset lateral (derecha de las letras):
  //   yaw_letras = -1.493
  //   right = (cos(yaw), 0, -sin(yaw)) ≈ (0.077, 0, 0.997)
  //   offset_18m = (186.37 + 18*0.077, 0, -63.35 + 18*0.997) ≈ (187.76, 0, -45.40)
  const config = {
    glbPath: 'data/Ahuehuete475.glb',
    position: { x: 187.76, y: 0, z: -45.40 },
    rotationX: 0,                   // 0 = el GLB ya viene Y-up parado. Si sale acostado, prueba -Math.PI/2
    rotationY: -1.493 + Math.PI,    // mirando opuesto a las letras (hacia el campus) — el user calibra después
    targetHeight: 18,               // ~18m de altura — "en grande"
    castShadow: true,
  };

  let _templatePromise = null;

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

          // Normalizar escala a targetHeight
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const heightDim = Math.max(size.y, 0.01);
          const scale = config.targetHeight / heightDim;
          root.scale.setScalar(scale);

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
    const liftY = -box.min.y;
    outer.position.set(
      config.position.x,
      config.position.y + liftY,
      config.position.z
    );
    scene.add(outer);
    console.warn(`🟢 Logo Ahuehuete475 en (${config.position.x}, ${(config.position.y + liftY).toFixed(2)}, ${config.position.z}) rotY=${(config.rotationY||0).toFixed(2)}  size=${(box.max.x-box.min.x).toFixed(1)}×${(box.max.y-box.min.y).toFixed(1)}×${(box.max.z-box.min.z).toFixed(1)}m`);
    return outer;
  }

  return { config, addTo, _loadTemplate };
})();
