// js/iztacala-mariposas.js
// ============================================================================
// 100 mariposas volando aleatoriamente dentro del polígono de FES Iztacala.
//   - Cada una con su propio mixer (clip "ANIM_slow_butterfly_wing_flap...")
//     desfasado aleatoriamente para que no aletean en sincronía
//   - Random walk suave (cambia de yaw cada 2-5s)
//   - Bobbing vertical sutil (cada una con fase distinta)
//   - Clamp al polígono Iztacala — si va a salir, rebota
//   - Posición Y entre 1m y 7m (altura típica de mariposa volando)
//   - Velocidad lenta (0.4-1.2 m/s)
//
// Uso:
//   await window.IztacalaMariposas.spawn(scene, count);
//   window.IztacalaMariposas.tick(dtSeconds);   ← llamar en cada frame del loop
//   window.IztacalaMariposas.destroy();
// ============================================================================

window.IztacalaMariposas = (function() {
  'use strict';

  const config = {
    glbPath: 'data/mariposa.glb',
    count: 100,
    minY: 1.0,
    maxY: 7.0,
    minSpeed: 0.4,
    maxSpeed: 1.2,
    targetSize: 3.0,         // tamaño visual ~3m (XL — sacrificamos proporción por visibilidad)
    campusName: 'Iztacala',  // de qué campus tomar el polígono (cambia con spawn(scene, count, campusName))
  };

  let _templatePromise = null;
  let _instances = [];        // array de { obj, mixer, vel, bobPhase, yawCurr, yawTarget, nextChange, t }
  let _hostScene = null;

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
      if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return resolve(null);
      const loader = _makeLoader();
      console.warn(`[Mariposas] ⏳ cargando ${config.glbPath} …`);
      loader.load(config.glbPath,
        (gltf) => {
          const root = gltf.scene;
          // Normalizar tamaño
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = config.targetSize / maxDim;
          root.scale.setScalar(scale);
          root.traverse(o => {
            if (o.isMesh) {
              o.castShadow = false;     // 100 sombras = overkill
              o.receiveShadow = false;
              if (o.material) {
                o.material = o.material.clone();
                o.material.side = THREE.DoubleSide;  // alas se ven de ambos lados
              }
            }
          });
          console.warn(`[Mariposas] ✓ cargado (escala ${scale.toFixed(3)}, animaciones=${gltf.animations.length})`);
          resolve({ scene: root, animations: gltf.animations });
        },
        undefined,
        (err) => {
          console.error('[Mariposas] ✗ falló cargar:', err?.message || err);
          resolve(null);
        });
    });
    return _templatePromise;
  }

  // Bounds del polígono de Iztacala — vienen de campus-bounds.js (que ya usa lat/lng).
  // Necesitamos el polígono en coords del MODELO (metros locales). Convertimos
  // desde lat/lng → metros usando los factores del centroide de Iztacala.
  function _getCampusPolyXZ() {
    if (!window.CampusBounds) return null;
    const camp = window.CampusBounds.get(config.campusName || 'Iztacala');
    if (!camp) return null;
    const cLat = camp.centroid[0];
    const cLon = camp.centroid[1];
    const mLat = camp.mPerLat;
    const mLon = camp.mPerLon;
    // En Three.js: world.x = json.x = (lng - centroid_lng) * mPerLon
    //              world.z = -json.y = -(lat - centroid_lat) * mPerLat
    return camp.polygon.map(([lat, lng]) => ({
      x: (lng - cLon) * mLon,
      z: -(lat - cLat) * mLat,
    }));
  }

  function _pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i].z, xi = poly[i].x;
      const yj = poly[j].z, xj = poly[j].x;
      const intersect = ((yi > pt.z) !== (yj > pt.z))
        && (pt.x < (xj - xi) * (pt.z - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function _randomPointInPoly(poly) {
    if (!poly || poly.length < 3) return { x: 0, z: 0 };
    // bbox
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    // rejection sampling
    for (let i = 0; i < 50; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);
      if (_pointInPoly({ x, z }, poly)) return { x, z };
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  }

  async function spawn(scene, count, campusName) {
    const template = await _loadTemplate();
    if (!template) return [];
    if (campusName) config.campusName = campusName;
    _hostScene = scene;
    const N = count || config.count;
    const poly = _getCampusPolyXZ();
    if (!poly) {
      console.warn('[Mariposas] No se encontró polígono del campus');
      return [];
    }
    _instances = [];
    const clip = template.animations && template.animations[0];
    for (let i = 0; i < N; i++) {
      const obj = template.scene.clone(true);
      // Cada una con un OFFSET random en el aleteo
      const mixer = clip ? new THREE.AnimationMixer(obj) : null;
      if (mixer && clip) {
        const action = mixer.clipAction(clip);
        action.play();
        // desfasar el tiempo de la acción para que no aletean en sincronía
        action.time = Math.random() * clip.duration;
        // velocidad de aleteo entre 0.7x y 1.3x para variedad
        action.timeScale = 0.7 + Math.random() * 0.6;
      }
      const p = _randomPointInPoly(poly);
      const y = config.minY + Math.random() * (config.maxY - config.minY);
      obj.position.set(p.x, y, p.z);
      const speed = config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed);
      const yaw = Math.random() * Math.PI * 2;
      const inst = {
        obj, mixer,
        speed,
        yawCurr: yaw,
        yawTarget: yaw,
        vy: 0,
        bobPhase: Math.random() * Math.PI * 2,
        bobFreq: 0.4 + Math.random() * 0.6,    // 0.4-1.0 Hz
        baseY: y,
        nextChange: 0,                          // s; cuándo elegir nuevo yaw
        timer: Math.random() * 3,               // desfase inicial
      };
      obj.rotation.y = yaw;
      scene.add(obj);
      _instances.push(inst);
    }
    console.warn(`🦋 ${_instances.length} mariposas spawneadas`);
    return _instances;
  }

  // Llamar en cada frame del loop principal. dt en segundos.
  function tick(dtSec) {
    if (!_instances.length) return;
    const poly = _getCampusPolyXZ();
    for (let i = 0; i < _instances.length; i++) {
      const inst = _instances[i];
      // Mixer (aleteo)
      if (inst.mixer) inst.mixer.update(dtSec);
      // Random walk del yaw: cada 2-5s elige nuevo target
      inst.timer += dtSec;
      if (inst.timer >= inst.nextChange) {
        inst.yawTarget = inst.yawCurr + (Math.random() - 0.5) * Math.PI;  // ±90° turn
        inst.nextChange = inst.timer + 2 + Math.random() * 3;
      }
      // Suavizar yaw hacia target
      let d = inst.yawTarget - inst.yawCurr;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      inst.yawCurr += d * Math.min(1, 1.2 * dtSec);
      inst.obj.rotation.y = inst.yawCurr;
      // Avanzar en la dirección de yaw
      const dx = Math.sin(inst.yawCurr) * inst.speed * dtSec;
      const dz = Math.cos(inst.yawCurr) * inst.speed * dtSec;
      const newX = inst.obj.position.x + dx;
      const newZ = inst.obj.position.z + dz;
      // Clamp al polígono — si se sale, rebota (gira 180° + un poco)
      if (poly && !_pointInPoly({ x: newX, z: newZ }, poly)) {
        inst.yawTarget = inst.yawCurr + Math.PI + (Math.random() - 0.5) * 0.6;
        inst.yawCurr = inst.yawTarget;       // gira en seco
        inst.nextChange = inst.timer + 2 + Math.random() * 3;
      } else {
        inst.obj.position.x = newX;
        inst.obj.position.z = newZ;
      }
      // Bobbing vertical sutil
      const bobY = Math.sin((inst.timer + inst.bobPhase) * inst.bobFreq * 2 * Math.PI) * 0.4;
      inst.obj.position.y = inst.baseY + bobY;
    }
  }

  function destroy() {
    if (_hostScene) {
      _instances.forEach(inst => {
        if (inst.obj && inst.obj.parent) inst.obj.parent.remove(inst.obj);
      });
    }
    _instances = [];
    _hostScene = null;
  }

  function getInstancesCount() { return _instances.length; }

  return { spawn, tick, destroy, config, getInstancesCount };
})();
