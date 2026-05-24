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
    // Punto medio entre edificios L4 (-1.6, -116.4) y A3 (-23.5, -42.6).
    // En Three.js: world.x = json.x, world.z = -json.y
    position: { x: -12.5, y: 0, z: 79.5 },
    rotationY: 0,
    targetWidth: 22,               // ancho en metros (un poco más grande)
    mirror: true,                  // espejo horizontal (palo levantado queda a la izquierda)
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
          // Mirror horizontal vía scale.x negativo (el "palo levantado" cambia de lado).
          // Al usar scale negativo, el winding order de los triángulos se invierte
          // y Three.js los ve como "back faces" — fix: DoubleSide en materiales.
          root.scale.set(config.mirror ? -scale : scale, scale, scale);
          // Sombras + DoubleSide para evitar caras invisibles tras el mirror
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
              if (config.mirror && o.material) {
                // Clonar material para no mutar el template compartido
                o.material = o.material.clone();
                o.material.side = THREE.DoubleSide;
              }
            }
          });
          console.warn(`[Sculpture] ✓ cargado (escala ${scale.toFixed(3)}, mirror=${!!config.mirror}, bbox X=${size.x.toFixed(2)} Y=${size.y.toFixed(2)} Z=${size.z.toFixed(2)})`);
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
