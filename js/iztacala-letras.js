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
    // Posición calibrada por el user con DashboardWalkthrough.debug.moveLetrasHere('back').
    // Quedan al norte de Unidad de Seminarios, orientadas con la cara hacia atrás
    // (alguien que mira desde el campus las lee al revés, como en la entrada real).
    position: { x: 186.37, y: 0, z: -63.35 },
    rotationX: -Math.PI / 2,    // Z-up → Y-up (letras paradas verticalmente)
    rotationY: -1.493,          // calibrada — orientation 'back'
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
    // ARQUITECTURA: dos contenedores anidados para que las rotaciones X e Y
    // NO se mezclen entre sí (problema clásico del orden Euler XYZ default):
    //   outer (rotación Y alrededor del eje vertical MUNDO)
    //     └─ inner (rotación X para enderezar Z-up→Y-up — letras paradas)
    //          └─ clone del GLB
    // Antes lo hacíamos como `instance.rotation.set(rx, ry, 0)` y Y rotaba
    // alrededor del eje Y *local ya rotado por X*, tumbando las letras al piso.
    const inner = template.clone(true);
    inner.rotation.x = config.rotationX || 0;
    inner.position.set(0, 0, 0);

    const outer = new THREE.Group();
    outer.add(inner);
    outer.rotation.y = config.rotationY || 0;

    // Calcular bbox YA con la rotación final aplicada
    outer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(outer);
    const liftY = -box.min.y;
    outer.position.set(
      config.position.x,
      config.position.y + liftY,
      config.position.z
    );
    scene.add(outer);

    console.warn(`🅵 Letras FES UNAM Iztacala en (${config.position.x}, ${(config.position.y + liftY).toFixed(2)}, ${config.position.z}) rotX(inner)=${(config.rotationX||0).toFixed(2)} rotY(outer)=${(config.rotationY||0).toFixed(2)}  size: ${(box.max.x-box.min.x).toFixed(1)}×${(box.max.y-box.min.y).toFixed(1)}×${(box.max.z-box.min.z).toFixed(1)}m`);
    let meshNames = [];
    outer.traverse(o => { if (o.isMesh) meshNames.push(o.name || '?'); });
    console.warn(`🅵 Meshes en escena: ${meshNames.join(', ')}`);
    return outer;
  }

  return { config, addTo, _loadTemplate };
})();
