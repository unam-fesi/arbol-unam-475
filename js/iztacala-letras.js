// js/iztacala-letras.js
// ============================================================================
// Letras monumentales "FES UNAM Iztacala" — el letrero icónico de la entrada.
// GLB creado con ayuda de ChatGPT, 7 meshes separados (base + FES dorado +
// unam azul + placa Iztacala azul + texto blanco + soportes), 14.6m de ancho.
//
// Mismo patrón que iztacala-sculpture.js: módulo independiente cargable
// desde IztacalaMap y DashboardWalkthrough.
//
// Para ajustar:
//   window.IztacalaLetras.config.position = { x: ..., y: ..., z: ... };
//   window.IztacalaLetras.config.rotationY = Math.PI / 4;
//   window.IztacalaLetras.config.targetWidth = 18;
// ============================================================================

window.IztacalaLetras = (function() {
  'use strict';

  const config = {
    glbPath: 'data/letras_fesi.glb',
    // Posición: al sur del edificio "Unidad de seminarios" (id 412815203,
    // centroide en (165.6, 41.1) JSON). Frente al edificio en zona de pasto.
    // En Three.js: world.x = json.x, world.z = -json.y
    //   json (165, -10) → world (165, 0, 10)
    position: { x: 165, y: 0, z: 10 },
    // Rotación 180° = letras dando la espalda al observador del norte.
    // Como el GLB tiene F a la izquierda en local, tras rotar PI queda a la
    // derecha del observador. ✓
    rotationY: Math.PI,
    targetWidth: 22,               // mismo tamaño que la Barda Caída
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
        console.warn('[Letras] THREE.GLTFLoader no disponible');
        return resolve(null);
      }
      const loader = _makeLoader();
      console.warn(`[Letras] ⏳ cargando ${config.glbPath} …`);
      loader.load(config.glbPath,
        (gltf) => {
          const root = gltf.scene;
          // Quitar la cámara que viene en el GLB (no la queremos en escena)
          const toRemove = [];
          root.traverse(o => {
            if (o.isCamera) toRemove.push(o);
          });
          toRemove.forEach(o => o.parent && o.parent.remove(o));

          // Normalizar escala al ancho deseado
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.z) || 1;
          const scale = config.targetWidth / maxDim;
          root.scale.setScalar(scale);

          // Asegurar sombras
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          console.warn(`[Letras] ✓ cargado (escala ${scale.toFixed(3)}, bbox ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)})`);
          resolve(root);
        },
        undefined,
        (err) => {
          console.error('[Letras] ✗ falló cargar:', err?.message || err);
          resolve(null);
        });
    });
    return _templatePromise;
  }

  async function addTo(scene) {
    const template = await _loadTemplate();
    if (!template) return null;
    const instance = template.clone(true);
    instance.position.set(config.position.x, config.position.y, config.position.z);
    instance.rotation.y = config.rotationY;
    scene.add(instance);
    console.warn(`🅵 Letras FES UNAM Iztacala en (${config.position.x}, ${config.position.y}, ${config.position.z})`);
    return instance;
  }

  return { config, addTo, _loadTemplate };
})();
