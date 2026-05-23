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

  // Devuelve el path del GLB más adecuado para un árbol según su código/nombre/especie.
  function pickTreeGLBPath(tree) {
    if (!tree) return GENERIC_GLB;
    const text = [tree.tree_code, tree.common_name, tree.species]
      .filter(Boolean).join(' ').toLowerCase();
    if (!text) return GENERIC_GLB;
    for (const entry of TREE_GLB_MAP) {
      for (const kw of entry.keywords) {
        if (text.includes(kw.toLowerCase())) {
          return 'data/trees/' + entry.glb;
        }
      }
    }
    return GENERIC_GLB;
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
      const loader = new THREE.GLTFLoader();
      loader.load(path,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => {
          console.warn(`TreeModels: falló cargar ${path}:`, err?.message || err);
          if (path !== GENERIC_GLB) {
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
