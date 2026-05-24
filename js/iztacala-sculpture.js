// js/iztacala-sculpture.js
// ============================================================================
// Carga e instancia "Barda Caída" — escultura icónica de FES Iztacala.
// Se usa tanto en IztacalaMap (vista 3D aérea) como en DashboardWalkthrough.
//
// Para ajustar posición/escala/rotación sin re-deploy:
//   window.IztacalaSculpture.config.position.x = ...
//   window.IztacalaSculpture.config.rotationY = ...
//   (cambios solo afectan a las próximas cargas; recarga la escena para ver)
// ============================================================================

window.IztacalaSculpture = (function() {
  'use strict';

  const config = {
    glbPath: 'data/barda_caida_v10.glb',
    // Posición en coords del modelo de Iztacala (metros).
    // Estimación inicial: centro-sur del campus (cerca de la "manita" del screenshot).
    position: { x: 80, y: 0, z: 100 },
    rotationY: 0,                  // radianes; ajustar si la orientación no es la correcta
    targetWidth: 12,               // ancho objetivo en metros (la barda caída original es ~10-15m)
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
        console.warn('[Sculpture] THREE.GLTFLoader no disponible');
        return resolve(null);
      }
      const loader = _makeLoader();
      console.warn(`[Sculpture] ⏳ cargando ${config.glbPath} …`);
      loader.load(config.glbPath,
        (gltf) => {
          const root = gltf.scene;
          // Normalizar escala al ancho deseado (basado en la dimensión horizontal mayor)
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.z) || 1;
          const scale = config.targetWidth / maxDim;
          root.scale.setScalar(scale);
          // Sombras
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          console.warn(`[Sculpture] ✓ cargado (escala ${scale.toFixed(3)}, bbox original X=${size.x.toFixed(2)} Y=${size.y.toFixed(2)} Z=${size.z.toFixed(2)})`);
          resolve(root);
        },
        undefined,
        (err) => {
          console.error('[Sculpture] ✗ falló cargar:', err?.message || err);
          resolve(null);
        });
    });
    return _templatePromise;
  }

  // Instancia (clona) la escultura y la agrega a la escena en la posición configurada.
  async function addTo(scene) {
    const template = await _loadTemplate();
    if (!template) return null;
    const instance = template.clone(true);
    instance.position.set(config.position.x, config.position.y, config.position.z);
    instance.rotation.y = config.rotationY;
    scene.add(instance);
    console.warn(`🗿 Barda Caída en escena en (${config.position.x}, ${config.position.y}, ${config.position.z})`);
    return instance;
  }

  return { config, addTo, _loadTemplate };
})();
