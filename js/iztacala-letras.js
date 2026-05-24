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
    // Posición tentativa al norte del edificio Unidad de seminarios — zona verde.
    // El user puede recalibrar con DashboardWalkthrough.debug.moveLetrasHere().
    position: { x: 165, y: 0, z: -50 },
    rotationX: -Math.PI / 2,    // Z-up → Y-up (letras paradas verticalmente)
    // rotationY: 0 = letras mirando al SUR (su frente apunta a +Z mundo).
    // El observador default del IztacalaMap orbita y puede ver desde cualquier
    // lado. Si quieres que se lean al revés, usa Math.PI.
    rotationY: 0,
    targetWidth: 22,
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

          // Asegurar sombras + FIX: empujar el texto blanco "Iztacala" hacia adelante
          // para que sobresalga claramente del cartel azul (sino se ve oculto)
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
              // Texto blanco "Iztacala" — sobresalir 0.15m
              if (o.name && /IZTACALA.*white|white.*raised|iztacala.*text/i.test(o.name)) {
                o.position.y += 0.15;   // local Y = profundidad antes de rotación
                // También hacer el material doble-cara y emisivo sutil para
                // que sea más visible desde distintos ángulos.
                if (o.material) {
                  o.material = o.material.clone();
                  o.material.side = THREE.DoubleSide;
                  o.material.emissive = new THREE.Color(0xffffff);
                  o.material.emissiveIntensity = 0.15;
                }
                console.warn(`[Letras]   ↳ texto "Iztacala" empujado +0.15 al frente y con emissive`);
              }
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
    // Aplicar rotación PRIMERO en una posición temporal para calcular el bbox real
    instance.rotation.set(config.rotationX || 0, config.rotationY || 0, 0);
    instance.position.set(0, 0, 0);
    instance.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(instance);
    // Subir el modelo para que su bottom (min Y) quede en config.position.y
    const liftY = -box.min.y;
    instance.position.set(
      config.position.x,
      config.position.y + liftY,
      config.position.z
    );
    scene.add(instance);
    console.warn(`🅵 Letras FES UNAM Iztacala en (${config.position.x}, ${(config.position.y + liftY).toFixed(2)}, ${config.position.z}) rot=(${(config.rotationX||0).toFixed(2)}, ${(config.rotationY||0).toFixed(2)})  bbox YZ post-rot: Y[${box.min.y.toFixed(2)}, ${box.max.y.toFixed(2)}]  size: ${(box.max.x-box.min.x).toFixed(1)}×${(box.max.y-box.min.y).toFixed(1)}×${(box.max.z-box.min.z).toFixed(1)}m`);
    // Listar los meshes hijos para confirmar que cargaron las letras
    let meshNames = [];
    instance.traverse(o => { if (o.isMesh) meshNames.push(o.name || '?'); });
    console.warn(`🅵 Meshes en escena: ${meshNames.join(', ')}`);
    return instance;
  }

  return { config, addTo, _loadTemplate };
})();
