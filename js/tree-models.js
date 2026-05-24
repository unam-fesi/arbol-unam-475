// js/tree-models.js
// ============================================================================
// Mapping y caché de modelos GLB de árboles. Usado por Bosque 3D, FES Iztacala
// 3D y Walkthrough para renderizar cada árbol con el modelo de su especie.
//
// Reglas de matching:
//   • Se toma `tree_code`, `common_name` y `species` (lo que esté disponible)
//     y se concatena en lowercase.
//   • Se busca en orden de la TREE_GLB_MAP: el primer match gana, por eso
//     las entradas MÁS ESPECÍFICAS van primero ("acacia azul" antes que
//     solo "acacia").
//   • Si nada matchea, se cae al modelo genérico tree_model.glb.
//   • Si un GLB falla en cargar, se cae al genérico también.
//
// Para agregar una especie nueva: pon el .glb en data/trees/ y agrega
// una entrada en TREE_GLB_MAP con los keywords que aparecen en los
// códigos/nombres reales de la BD.
// ============================================================================

(function () {
  'use strict';

  // BANNER de versión — si ves esto en consola, el archivo v85 SÍ se cargó.
  // Si NO lo ves, es problema de caché (haz Application → Storage → "Clear site data").
  console.warn('[TreeModels v85] módulo cargado — matching accent-insensitive activo');

  // ⚠ Orden importa: más específico arriba.
  const TREE_GLB_MAP = [
    // Especies con palabra única bien identificable
    { keywords: ['ahuehuete', 'ahue'],                       glb: 'ahuehuete.glb' },
    { keywords: ['jacaranda', 'jacarand', 'jacar'],          glb: 'jacaranda.glb' },
    { keywords: ['eucalipto', 'eucaliptus', 'eucal'],        glb: 'eucalipto.glb' },
    { keywords: ['manzano', 'manzana', 'manz'],              glb: 'manzano.glb' },
    { keywords: ['fresno', 'fres'],                          glb: 'fresno.glb' },
    { keywords: ['tejocote', 'tejo'],                        glb: 'tejocote.glb' },
    { keywords: ['níspero', 'nispero', 'nisper', 'nisp'],    glb: 'nispero.glb' },
    { keywords: ['palma', 'palmera'],                        glb: 'palma.glb' },
    { keywords: ['pino', 'pinaceae'],                        glb: 'pino.glb' },
    { keywords: ['pirul', 'pirules'],                        glb: 'pirul.glb' },
    { keywords: ['trueno', 'truen'],                         glb: 'trueno.glb' },
    // Acacias con sub-tipo PRIMERO
    { keywords: ['acacia azul', 'acacia blue'],              glb: 'acacia_azul.glb' },
    { keywords: ['acacia negra', 'acacia black'],            glb: 'acacia_negra.glb' },
    // Acacia genérica como fallback (después de azul/negra)
    { keywords: ['acacia', 'acac'],                          glb: 'acacia_azul.glb' },
  ];

  const GENERIC_GLB = 'data/trees/tree_model.glb';
  // Cache: path → Promise<THREE.Group> (cada modelo se descarga UNA vez)
  const _cache = Object.create(null);

  // DRACOLoader compartido para todos los GLBs que vienen comprimidos con
  // Google Draco (compresión moderna estándar de mallas). Sin este, los GLBs
  // comprimidos truenan con "No DRACOLoader instance provided".
  // Se inicializa lazily (la primera vez que se necesita) y se reusa.
  let _dracoLoader = null;
  function _getDracoLoader() {
    if (_dracoLoader) return _dracoLoader;
    if (typeof THREE === 'undefined' || !THREE.DRACOLoader) return null;
    _dracoLoader = new THREE.DRACOLoader();
    // Decoder hospedado por Google — soporta tanto .wasm como .js fallback
    _dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    _dracoLoader.setDecoderConfig({ type: 'js' });  // 'js' es universal; 'wasm' es más rápido
    return _dracoLoader;
  }

  // Construye un GLTFLoader configurado con DRACOLoader si está disponible.
  function _makeLoader() {
    const loader = new THREE.GLTFLoader();
    const draco = _getDracoLoader();
    if (draco) loader.setDRACOLoader(draco);
    return loader;
  }

  // Normaliza: lowercase + remueve acentos/diacríticos
  // ("Jacarandá" → "jacaranda", "níspero" → "nispero")
  function _normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  // Devuelve el path del GLB más adecuado para un árbol según su código/nombre/especie.
  function pickTreeGLBPath(tree) {
    if (!tree) return GENERIC_GLB;
    const raw = [tree.tree_code, tree.common_name, tree.species]
      .filter(Boolean).join(' ');
    const text = _normalize(raw);
    if (!text) {
      console.warn('[TreeModels] tree sin texto → genérico', tree);
      return GENERIC_GLB;
    }
    for (const entry of TREE_GLB_MAP) {
      for (const kw of entry.keywords) {
        if (text.includes(_normalize(kw))) {
          console.warn(`[TreeModels] match "${kw}" → ${entry.glb}  (text="${text}")`);
          return 'data/trees/' + entry.glb;
        }
      }
    }
    console.warn(`[TreeModels] sin match → genérico  (text="${text}")`);
    return GENERIC_GLB;
  }

  // Override de color de hojas por especie cuando los GLBs fueron exportados con
  // textura genérica verde (Blender NormalTree_Leaves). Esto pinta las hojas
  // del color correcto basándose solo en el nombre de archivo del GLB.
  // - color: hex del MeshStandardMaterial.color
  // - emissive: hex del MeshStandardMaterial.emissive (mantiene el color en sombra)
  const SPECIES_LEAF_COLOR = {
    'jacaranda.glb': { color: 0xA75DD9, emissive: 0x5A2A88, emissiveIntensity: 0.35 },  // morado/lavanda vivo
    'pirul.glb':     { color: 0xD9A66B, emissive: 0x7A4A20, emissiveIntensity: 0.15 },  // marrón claro/dorado
    // los demás: textura original
  };

  // Aplica el color override a los materiales de hoja del modelo cargado.
  // Detecta el material por nombre ("leaves", "leaf", "follaje", "canopy").
  function _applyLeafColorOverride(scene, path) {
    const fileName = (path || '').split('/').pop();
    const cfg = SPECIES_LEAF_COLOR[fileName];
    if (!cfg || !scene) return;
    if (typeof THREE === 'undefined') return;
    const targetColor = new THREE.Color(cfg.color);
    const targetEmissive = cfg.emissive != null ? new THREE.Color(cfg.emissive) : null;
    let recolored = 0;
    scene.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const matName = (o.material.name || '').toLowerCase();
      const isLeaf = matName.includes('leaves') || matName.includes('leaf') ||
                     matName.includes('follaje') || matName.includes('canopy') ||
                     matName.includes('foliage');
      if (!isLeaf) return;
      // Clonar material para no mutar el template compartido inadvertidamente
      o.material = o.material.clone();
      o.material.color = targetColor.clone();
      if (targetEmissive) {
        o.material.emissive = targetEmissive.clone();
        o.material.emissiveIntensity = cfg.emissiveIntensity != null ? cfg.emissiveIntensity : 0.3;
      }
      // Quitar la textura verde para que el color override sea el que se vea
      if (o.material.map) {
        o.material.map = null;
        o.material.needsUpdate = true;
      }
      recolored++;
    });
    if (recolored > 0) {
      console.warn(`[TreeModels]   ↳ aplicado override de color a ${recolored} material(es) de hoja en ${fileName}`);
    }
  }

  // Carga un GLB y devuelve la promesa cacheada de su scene.
  // Si falla, cae al genérico. Si el genérico falla, resuelve a null.
  function getTreeModel(path) {
    if (!path) path = GENERIC_GLB;
    if (_cache[path]) return _cache[path];
    _cache[path] = new Promise((resolve) => {
      if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
        console.warn('TreeModels: THREE.GLTFLoader no disponible');
        return resolve(null);
      }
      const loader = _makeLoader();
      console.warn(`[TreeModels] ⏳ cargando ${path} …`);
      loader.load(path,
        (gltf) => {
          console.warn(`[TreeModels] ✓ cargado ${path}`);
          // Aplicar tinte de color de hojas por especie ANTES de cachear,
          // así todas las copias del template comparten el color correcto.
          try { _applyLeafColorOverride(gltf.scene, path); } catch (e) {
            console.warn('leaf color override failed:', e);
          }
          resolve(gltf.scene);
        },
        undefined,
        (err) => {
          console.error(`[TreeModels] ✗ falló cargar ${path}:`, err?.message || err, err);
          if (path !== GENERIC_GLB) {
            console.warn(`[TreeModels]   → fallback al genérico para ${path}`);
            // Reintentar con el genérico (también se cachea)
            getTreeModel(GENERIC_GLB).then(resolve);
          } else {
            resolve(null);
          }
        }
      );
    });
    return _cache[path];
  }

  // Conveniencia: obtiene directo el modelo para un árbol específico.
  function getModelForTree(tree) {
    return getTreeModel(pickTreeGLBPath(tree));
  }

  // Pre-carga TODOS los modelos del map. Útil para que las cachés se llenen
  // antes de empezar a plotear y los modelos cambien de "genérico" a real
  // sin parpadeo.
  function preloadAll() {
    const paths = new Set([GENERIC_GLB]);
    TREE_GLB_MAP.forEach(e => paths.add('data/trees/' + e.glb));
    return Promise.all(Array.from(paths).map(getTreeModel));
  }

  window.TreeModels = {
    pickTreeGLBPath,
    getTreeModel,
    getModelForTree,
    preloadAll,
    GENERIC_GLB
  };
})();
