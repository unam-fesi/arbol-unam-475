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
    // Posición sobre el prado al norte de Unidad de Seminarios, alejadas del
    // asfalto y paralelas al pasillo principal. Cara blanca "Iztacala" al frente.
    position: { x: 173.5, y: 0, z: -66 },   // calibrado por el user
    rotationX: -Math.PI / 2,    // Z-up → Y-up (letras paradas verticalmente)
    rotationY: -1.4835,         // -85° calibrado por el user (prueba +π/2 si "Iztacala" sigue atrás)
    targetWidth: 22,
    castShadow: true,
  };

  let _templatePromise = null;
  let _lastInstance = null;    // ref al outer Group activo (para calibrar/mover en vivo)
  let _liftY = 0;              // offset Y aplicado para que la base toque el piso

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

          // FIX CRÍTICO: el GLB tiene IZTACALA (placa azul + texto blanco) en
          // la cara OPUESTA al FES UNAM dorado/azul. Específicamente:
          //   FES_gold / UNAM_blue:   local Y centro = +0.05  (cara FRONTAL)
          //   IZTACALA_blue_sign_board: local Y centro = -0.34 (cara TRASERA)
          //   IZTACALA_white_raised_text: local Y centro = -0.19 (atrás)
          // Por eso al mirar el letrero desde FES UNAM, IZTACALA está atrás.
          // Movemos placa + texto al mismo lado que FES UNAM (sumamos 0.68 en Y local).
          // Adicionalmente, el texto blanco sobresale 0.20 más para destacar
          // de la placa azul.
          root.traverse(o => {
            if (o.isMesh) {
              if (config.castShadow) o.castShadow = true;
              o.receiveShadow = true;
              const name = o.name || '';
              // Placa azul "Iztacala": del Y=-0.34 → +0.34 (mismo lado que FES)
              if (/IZTACALA.*blue.*sign|iztacala.*board/i.test(name)) {
                o.position.y += 0.68;
                console.warn(`[Letras]   ↳ placa "Iztacala" movida +0.68 al frente (Y opuesto)`);
              }
              // Texto blanco "Iztacala": del Y=-0.19 → +0.49 (placa +0.20 al frente)
              else if (/IZTACALA.*white|white.*raised|iztacala.*text/i.test(name)) {
                o.position.y += 0.68 + 0.20;
                if (o.material) {
                  o.material = o.material.clone();
                  o.material.side = THREE.DoubleSide;
                  o.material.emissive = new THREE.Color(0xffffff);
                  o.material.emissiveIntensity = 0.2;
                }
                console.warn(`[Letras]   ↳ texto "Iztacala" movido +0.88 al frente y con emissive`);
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
    _liftY = -box.min.y;
    outer.position.set(
      config.position.x,
      config.position.y + _liftY,
      config.position.z
    );
    _lastInstance = outer;
    scene.add(outer);

    console.warn(`🅵 Letras FES UNAM Iztacala en (${config.position.x}, ${(config.position.y + liftY).toFixed(2)}, ${config.position.z}) rotX(inner)=${(config.rotationX||0).toFixed(2)} rotY(outer)=${(config.rotationY||0).toFixed(2)}  size: ${(box.max.x-box.min.x).toFixed(1)}×${(box.max.y-box.min.y).toFixed(1)}×${(box.max.z-box.min.z).toFixed(1)}m`);
    let meshNames = [];
    outer.traverse(o => { if (o.isMesh) meshNames.push(o.name || '?'); });
    console.warn(`🅵 Meshes en escena: ${meshNames.join(', ')}`);
    return outer;
  }

  // ── Helpers para mover/rotar en vivo (sin recargar la escena) ──
  function setPosition(x, z) {
    config.position.x = x; config.position.z = z;
    if (_lastInstance) _lastInstance.position.set(x, config.position.y + _liftY, z);
  }
  function setRotationY(rad) {
    config.rotationY = rad;
    if (_lastInstance) _lastInstance.rotation.y = rad;
  }
  function setRotationX(rad) {
    config.rotationX = rad;
    if (_lastInstance && _lastInstance.children[0]) {
      _lastInstance.children[0].rotation.x = rad;
      _lastInstance.position.y = 0;
      _lastInstance.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(_lastInstance);
      _liftY = -b.min.y;
      _lastInstance.position.y = config.position.y + _liftY;
    }
  }
  function getInstance() { return _lastInstance; }

  return { config, addTo, _loadTemplate, setPosition, setRotationY, setRotationX, getInstance };
})();
