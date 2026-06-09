// ============================================================================
// MI PORTAFOLIO — Orquestador del portal de usuario
// ============================================================================
// Reúne TODO lo asignado al usuario (árboles + jardines) en una sola vista
// con un selector de chips arriba. Despacha a:
//   - Vista de árbol (mi-arbol.js, función loadMyTree(force, treeId))
//   - Vista de jardín (renderGardenView, definida abajo)
//
// Asignaciones consideradas:
//   • tree_assignments.user_id = currentUser.id          (árbol directo)
//   • tree_assignments.group_id ∈ grupos del usuario      (árbol vía grupo)
//   • garden_assignments.user_id = currentUser.id        (jardín directo)
//   • garden_assignments.group_id ∈ grupos del usuario   (jardín vía grupo)
//
// El usuario solo ve lo asignado a él (directa o vía grupo).
// ============================================================================

let _portfolioLoaded = false;
let _activeEntity = null; // { type: 'tree'|'garden', id: <int> }
let _myTreeRecords = [];   // [{id, tree_code, common_name, species, garden_id, ...}]
let _myGardenRecords = []; // [{id, name, campus, soil_type, ...}]

async function loadMyPortfolio(forceReload) {
  const selectorEl = document.getElementById('portfolio-selector');
  const contentEl = document.getElementById('mi-arbol-content');
  if (!contentEl) return;

  // Setup delegation global UNA sola vez (sobrevive a innerHTML replacements)
  _setupPortfolioDelegation();

  if (_portfolioLoaded && !forceReload) return;

  // Banners (jardines + grupos) los maneja la propia mi-arbol.js originalmente,
  // pero ahora los disparamos aquí para garantizar consistencia.
  if (typeof loadMyGroups === 'function') loadMyGroups();
  if (typeof loadMyGardens === 'function') loadMyGardens();

  // Cargar árboles asignados
  _myTreeRecords = await _fetchAssignedTrees();
  // Cargar jardines asignados
  _myGardenRecords = await _fetchAssignedGardens();

  // Empty state global
  if (_myTreeRecords.length === 0 && _myGardenRecords.length === 0) {
    if (selectorEl) selectorEl.innerHTML = '';
    contentEl.innerHTML = `
      <div class="card" style="text-align:center;padding:3rem;">
        <div style="font-size:4rem;margin-bottom:1rem;">🌱</div>
        <h3>Aún no tienes árboles ni jardines asignados</h3>
        <p class="text-muted">Un administrador te asignará uno pronto. Mientras tanto puedes explorar Información o platicar con PUM-AI.</p>
      </div>`;
    _portfolioLoaded = true;
    return;
  }

  // Determinar entidad activa por default
  if (!_activeEntity || forceReload || !_isEntityValid(_activeEntity)) {
    if (_myTreeRecords.length > 0) {
      _activeEntity = { type: 'tree', id: _myTreeRecords[0].id };
    } else {
      _activeEntity = { type: 'garden', id: _myGardenRecords[0].id };
    }
  }

  // Render selector arriba
  _renderSelector();
  // Render entidad activa
  _renderActiveEntity();

  _portfolioLoaded = true;
}

// ============================================================================
// LOADERS — árboles + jardines del usuario (directos y vía grupos)
// ============================================================================
async function _fetchAssignedTrees() {
  try {
    // Grupos del usuario
    const { data: gm } = await sb
      .from('group_members').select('group_id').eq('user_id', currentUser.id);
    const groupIds = (gm || []).map(g => g.group_id);

    // Asignaciones directas
    const { data: dir } = await sb
      .from('tree_assignments').select('tree_id, group_id').eq('user_id', currentUser.id);

    // Asignaciones vía grupo
    let viaGroup = [];
    if (groupIds.length > 0) {
      const { data } = await sb
        .from('tree_assignments').select('tree_id, group_id').in('group_id', groupIds);
      viaGroup = data || [];
    }

    const ids = new Set();
    (dir || []).forEach(r => ids.add(r.tree_id));
    viaGroup.forEach(r => ids.add(r.tree_id));

    if (ids.size === 0) return [];

    const { data: trees } = await sb
      .from('trees_catalog')
      .select('id, tree_code, common_name, species, garden_id, photo_url, status')
      .in('id', [...ids]);
    // NATURAL SORT en cliente: Postgres ordena por bytes, así que "FESI 100"
    // sale antes de "FESI 11". localeCompare con numeric:true lo arregla.
    return (trees || []).sort((a, b) =>
      String(a.tree_code || '').localeCompare(String(b.tree_code || ''), 'es-MX', { numeric: true, sensitivity: 'base' })
    );
  } catch (e) {
    console.error('_fetchAssignedTrees error:', e);
    return [];
  }
}

async function _fetchAssignedGardens() {
  try {
    const { data: gm } = await sb
      .from('group_members').select('group_id').eq('user_id', currentUser.id);
    const groupIds = (gm || []).map(g => g.group_id);

    const { data: dir } = await sb
      .from('garden_assignments').select('garden_id').eq('user_id', currentUser.id);

    let viaGroup = [];
    if (groupIds.length > 0) {
      const { data } = await sb
        .from('garden_assignments').select('garden_id, group_id').in('group_id', groupIds);
      viaGroup = data || [];
    }

    const ids = new Set();
    (dir || []).forEach(r => ids.add(r.garden_id));
    viaGroup.forEach(r => ids.add(r.garden_id));

    if (ids.size === 0) return [];

    const { data: gardens } = await sb
      .from('gardens')
      .select('*')
      .in('id', [...ids])
      .order('name');
    return gardens || [];
  } catch (e) {
    console.error('_fetchAssignedGardens error:', e);
    return [];
  }
}

function _isEntityValid(entity) {
  if (!entity) return false;
  if (entity.type === 'tree') return _myTreeRecords.some(t => String(t.id) === String(entity.id));
  if (entity.type === 'garden') return _myGardenRecords.some(g => String(g.id) === String(entity.id));
  return false;
}

// ============================================================================
// SELECTOR (chips de árboles + jardines)
// ============================================================================
function _renderSelector() {
  const sel = document.getElementById('portfolio-selector');
  if (!sel) return;

  // Si solo hay 1 entidad total, no mostrar selector (sería ruido)
  const total = _myTreeRecords.length + _myGardenRecords.length;
  if (total <= 1) {
    sel.innerHTML = '';
    return;
  }

  const chip = (type, id, label, icon, isActive) => {
    const activeStyle = isActive
      ? 'background:#2E7D32;color:#fff;border-color:#2E7D32;'
      : 'background:#fff;color:#444;border-color:#d6d6d6;';
    // Usamos data-* attributes en lugar de onclick inline para evitar
    // problemas de escapado con UUIDs / caracteres especiales en IDs.
    // El handler se engancha por delegación al final.
    return `
      <button class="portfolio-chip"
        data-portfolio-action="select-entity"
        data-entity-type="${escapeHtml(type)}"
        data-entity-id="${escapeHtml(String(id))}"
        style="padding:0.45rem 0.85rem;border-radius:20px;border:1.5px solid;font-size:0.82rem;
        font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem;
        transition:all 0.15s;${activeStyle}">
        ${icon} ${escapeHtml(label)}
      </button>`;
  };

  const treeChips = _myTreeRecords.map(t =>
    chip('tree', t.id,
      // Para usuarios con muchos árboles asignados (caso Isabel con 87), el
      // tree_code es la única forma de distinguir. Lo mostramos como label
      // principal con el common_name de complemento si existe.
      t.tree_code ? (t.common_name ? `${t.tree_code} · ${t.common_name}` : t.tree_code)
                  : (t.common_name || `Árbol #${t.id}`),
      '🌳',
      _activeEntity?.type === 'tree' && String(_activeEntity.id) === String(t.id))
  ).join('');

  const gardenChips = _myGardenRecords.map(g =>
    chip('garden', g.id,
      g.name || `Jardín`,
      '🌿',
      _activeEntity?.type === 'garden' && String(_activeEntity.id) === String(g.id))
  ).join('');

  sel.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem;padding:0.85rem 1.1rem;background:rgba(255,253,247,0.7);">
      <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;font-weight:600;">
        Selecciona qué quieres ver
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
        ${treeChips}
        ${_myTreeRecords.length > 0 && _myGardenRecords.length > 0 ? '<div style="width:1px;background:#ddd;margin:0 0.4rem;"></div>' : ''}
        ${gardenChips}
      </div>
    </div>
  `;

  // Los clicks se manejan vía delegation global en _setupPortfolioDelegation
}

// ============================================================================
// SWITCH — el usuario seleccionó una entidad
// ============================================================================
// Delegation GLOBAL — un solo handler para TODA la app, sobrevive a re-renders
// y evita problemas de escapado de UUIDs/caracteres en onclick inline.
// Cualquier elemento con data-portfolio-action="select-entity" funciona.
function _setupPortfolioDelegation() {
  if (document._portfolioDelegation) return;
  document.addEventListener('click', (e) => {
    // Selección de entidad (chips, cards, links del mapa)
    const sel = e.target.closest('[data-portfolio-action="select-entity"]');
    if (sel) {
      e.preventDefault();
      const type = sel.dataset.entityType;
      const id = sel.dataset.entityId;
      if (type && id != null) selectPortfolioEntity(type, id);
      return;
    }
    // Abrir form de visita al jardín
    const visitBtn = e.target.closest('[data-portfolio-action="open-garden-visit"]');
    if (visitBtn) {
      e.preventDefault();
      openGardenVisitForm(visitBtn.dataset.gardenId);
      return;
    }
    // Abrir modal de detalle de visita
    const detailBtn = e.target.closest('[data-portfolio-action="open-garden-visit-detail"]');
    if (detailBtn) {
      e.preventDefault();
      showGardenVisitDetail(detailBtn.dataset.visitId);
      return;
    }
  });
  document._portfolioDelegation = true;
}

function selectPortfolioEntity(type, id) {
  // Preservar id como vino: tree.id es int, garden.id es UUID string.
  // Si vino como string numérico (ej: "5"), convertir a number; si tiene
  // guiones/letras (UUID), dejarlo como string.
  let parsedId = id;
  if (typeof id === 'string' && /^\d+$/.test(id)) parsedId = parseInt(id, 10);
  _activeEntity = { type, id: parsedId };
  _renderSelector();
  _renderActiveEntity();
}

function _renderActiveEntity() {
  if (!_activeEntity) return;
  // El título "Mis Asignaciones" se mantiene fijo — los chips del selector
  // indican qué entidad se está viendo en este momento.

  if (_activeEntity.type === 'tree') {
    if (typeof loadMyTree === 'function') {
      myTreeLoaded = false; // reset cache flag — fuerza recarga con el id seleccionado
      loadMyTree(true, _activeEntity.id);
    }
  } else if (_activeEntity.type === 'garden') {
    renderGardenView(_activeEntity.id);
  }
}

// ============================================================================
// VISTA DE JARDÍN — info, seguimiento agregado, nuevo registro, metas
// ============================================================================
async function renderGardenView(gardenId) {
  const container = document.getElementById('mi-arbol-content');
  if (!container) return;

  // Comparación robusta — gardens.id es UUID string
  const garden = _myGardenRecords.find(g => String(g.id) === String(gardenId));
  if (!garden) {
    console.warn('Jardín no encontrado:', gardenId, 'records:', _myGardenRecords);
    container.innerHTML = '<p style="padding:2rem;text-align:center;">Jardín no encontrado.</p>';
    return;
  }

  // Loading state
  container.innerHTML = `
    <div style="text-align:center;padding:2rem;color:#666;">
      <i class="fas fa-spinner fa-spin"></i> Cargando jardín…
    </div>`;

  // Cargar árboles del jardín + sus visitas + mediciones
  const [treesInGarden, gardenVisits] = await Promise.all([
    _fetchTreesInGarden(gardenId),
    _fetchGardenVisits(gardenId),
  ]);
  const aggStats = _computeGardenStats(treesInGarden, gardenVisits);

  // Render shell con tabs
  container.innerHTML = `
    <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm garden-tab active" data-tab="g-info" onclick="switchGardenTab('g-info')"><i class="fas fa-leaf"></i> Info</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-seguimiento" onclick="switchGardenTab('g-seguimiento')"><i class="fas fa-chart-line"></i> Seguimiento</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-registro" onclick="switchGardenTab('g-registro')"><i class="fas fa-plus-circle"></i> Nuevo Registro</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-metas" onclick="switchGardenTab('g-metas')"><i class="fas fa-bullseye"></i> Metas</button>
    </div>

    <div id="g-info" class="garden-tab-content active">
      <div id="g-bitacora-container" data-garden-id="${garden.id}"></div>
      ${_renderGardenInfo(garden, aggStats)}
    </div>
    <div id="g-seguimiento" class="garden-tab-content" style="display:none;">${_renderGardenSeguimiento(treesInGarden, gardenVisits)}</div>
    <div id="g-registro" class="garden-tab-content" style="display:none;">${_renderGardenRegistro(garden, treesInGarden, gardenVisits)}</div>
    <div id="g-metas" class="garden-tab-content" style="display:none;">${_renderGardenMetas(garden, treesInGarden, aggStats)}</div>

    <div id="g-map-container" style="margin-top:2rem;border-radius:14px;overflow:hidden;height:400px;border:1px solid #d6d6d6;"></div>
  `;

  // Cache visitas para chart on-demand
  _lastGardenVisits = gardenVisits;

  // Pre-resolver photo_url de cada visita a signed URL (bucket privado).
  // Si es path relativo (ej "431/123.jpg") se convierte a signed URL temporal.
  // Se hace async sin bloquear el render — re-asigna in-place al objeto.
  if (Array.isArray(gardenVisits) && typeof resolvePhotoUrl === 'function') {
    gardenVisits.forEach(async (v) => {
      if (v.photo_url && !/^https?:\/\//.test(v.photo_url)) {
        try { v.photo_url = await resolvePhotoUrl(v.photo_url) || v.photo_url; } catch (_) {}
      }
    });
  }

  // Cargar bitácora mensual + anual del jardín (PUM-AI, bajo demanda con cache)
  _loadBitacoraGarden(garden.id);

  // Inicializar mapa + chart si el tab seguimiento se vuelve activo
  setTimeout(() => {
    _initGardenMap(garden, treesInGarden);
    _renderGardenHealthChart(gardenVisits);
  }, 100);
}

// Tipos de actividad disponibles para visitas al jardín
const GARDEN_ACTIVITIES = [
  { id: 'riego', label: 'Riego', icon: '💧' },
  { id: 'limpieza', label: 'Limpieza / basura', icon: '🧹' },
  { id: 'poda', label: 'Poda', icon: '✂️' },
  { id: 'fertilizacion', label: 'Fertilización', icon: '🌱' },
  { id: 'control_plagas', label: 'Control de plagas', icon: '🪲' },
  { id: 'control_maleza', label: 'Control de maleza', icon: '🌾' },
  { id: 'siembra_reposicion', label: 'Siembra / reposición', icon: '🪴' },
  { id: 'mantillo_hojarasca', label: 'Mantillo / hojarasca', icon: '🍂' },
  { id: 'aireacion', label: 'Aireación de suelo', icon: '🪛' },
  { id: 'inspeccion', label: 'Inspección general', icon: '🔍' },
  { id: 'mantenimiento_estructural', label: 'Mantenimiento estructural', icon: '🔧' },
  { id: 'cuidado_polinizadores', label: 'Cuidado de polinizadores', icon: '🐝' },
  { id: 'otro', label: 'Otro', icon: '📌' },
];

// Rúbrica de salud del jardín (0-25 cada criterio, total 0-100)
const GARDEN_RUBRIC = [
  { id: 'cobertura', label: 'Cobertura y densidad vegetal', desc: 'Qué tan cubierto y denso luce el jardín' },
  { id: 'vitalidad', label: 'Vitalidad de plantas/flores', desc: 'Sin marchitez, color saludable, hojas verdes' },
  { id: 'mantenimiento', label: 'Limpieza y mantenimiento', desc: 'Ausencia de basura, maleza controlada, podas al día' },
  { id: 'suelo_riego', label: 'Estado del suelo y riego', desc: 'Suelo húmedo, sin compactación ni encharcamiento' },
];

async function _fetchTreesInGarden(gardenId) {
  try {
    const { data: trees } = await sb
      .from('trees_catalog')
      .select('id, tree_code, common_name, species, health_score, status, location_lat, location_lng, photo_url, initial_height_cm, garden_id')
      .eq('garden_id', gardenId);
    if (!trees || trees.length === 0) return [];

    // Última medición de cada árbol
    const treeIds = trees.map(t => t.id);
    const { data: lastMeas } = await sb
      .from('tree_measurements')
      .select('tree_id, measurement_date, health_score')
      .in('tree_id', treeIds)
      .order('measurement_date', { ascending: false });

    const lastByTree = {};
    (lastMeas || []).forEach(m => {
      if (!lastByTree[m.tree_id]) lastByTree[m.tree_id] = m;
    });

    return trees.map(t => ({
      ...t,
      last_measurement: lastByTree[t.id] || null,
    }));
  } catch (e) {
    console.error('_fetchTreesInGarden error:', e);
    return [];
  }
}

async function _fetchGardenVisits(gardenId) {
  try {
    const { data: visits } = await sb
      .from('garden_visits')
      .select('id, garden_id, user_id, visit_date, visit_type, photo_url, health_score, rubric, activities, observations, location_lat, location_lng')
      .eq('garden_id', gardenId)
      .order('visit_date', { ascending: false });
    return visits || [];
  } catch (e) {
    console.error('_fetchGardenVisits error:', e);
    return [];
  }
}

function _computeGardenStats(trees, visits) {
  const total = trees.length;
  const withHealth = trees.filter(t => t.health_score != null);
  const treesAvgHealth = withHealth.length > 0
    ? withHealth.reduce((s, t) => s + t.health_score, 0) / withHealth.length
    : null;
  const sano = trees.filter(t => t.health_score >= 70).length;
  const medio = trees.filter(t => t.health_score >= 40 && t.health_score < 70).length;
  const malo = trees.filter(t => t.health_score < 40 && t.health_score != null).length;
  const sinDato = trees.filter(t => t.health_score == null).length;

  // Salud del jardín como tal — viene de la última visita registrada
  const lastVisit = (visits && visits.length > 0) ? visits[0] : null;
  const gardenHealth = lastVisit?.health_score ?? null;

  // Salud combinada = average de gardenHealth y treesAvgHealth (si hay árboles)
  let avgHealth = null;
  if (gardenHealth != null && treesAvgHealth != null) {
    avgHealth = Math.round((gardenHealth + treesAvgHealth) / 2);
  } else if (gardenHealth != null) {
    avgHealth = gardenHealth;
  } else if (treesAvgHealth != null) {
    avgHealth = Math.round(treesAvgHealth);
  }

  return { total, avgHealth, gardenHealth, treesAvgHealth, sano, medio, malo, sinDato, totalVisits: (visits || []).length, lastVisit };
}

// ============================================================================
// TAB: INFO del jardín
// ============================================================================
function _renderGardenInfo(g, stats) {
  const fields = [
    { label: 'Nombre', value: g.name },
    { label: 'Campus', value: g.campus },
    { label: 'Área', value: g.area_m2 ? `${g.area_m2} m²` : null },
    { label: 'Capacidad', value: g.max_capacity_trees ? `${g.max_capacity_trees} árboles` : null },
    { label: 'Tipo de suelo', value: g.soil_type },
    { label: 'Riego', value: g.irrigation_type },
    { label: 'Exposición solar', value: g.exposure },
    { label: 'Zona climática', value: g.climate_zone },
    { label: 'Establecido', value: g.established_date ? new Date(g.established_date).toLocaleDateString() : null },
    { label: 'Ubicación', value: g.location_desc },
  ].filter(f => f.value);

  const fieldsHtml = fields.map(f => `
    <div style="padding:0.6rem 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;gap:1rem;">
      <span style="color:#666;font-size:0.85rem;">${escapeHtml(f.label)}</span>
      <span style="font-weight:500;color:#333;font-size:0.9rem;text-align:right;">${escapeHtml(String(f.value))}</span>
    </div>`).join('');

  const avgHealth = stats.avgHealth != null ? stats.avgHealth : '—';
  const avgColor = stats.avgHealth >= 70 ? '#4CAF50' : stats.avgHealth >= 40 ? '#FFA726' : stats.avgHealth != null ? '#EF5350' : '#9e9e9e';
  const lastVisitDate = stats.lastVisit?.visit_date
    ? new Date(stats.lastVisit.visit_date).toLocaleDateString()
    : 'Nunca';

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
      <div class="card" style="padding:1.2rem;">
        <h4 style="margin:0 0 0.8rem;color:#1a4480;"><i class="fas fa-info-circle"></i> Características</h4>
        ${fieldsHtml || '<p class="text-muted">Sin datos disponibles.</p>'}
      </div>
      <div class="card" style="padding:1.2rem;">
        <h4 style="margin:0 0 0.8rem;color:#1a4480;"><i class="fas fa-heart"></i> Estado actual</h4>
        <div style="text-align:center;margin:1rem 0;">
          <div style="font-size:3rem;font-weight:700;color:${avgColor};line-height:1;">${avgHealth}</div>
          <div style="color:#888;font-size:0.85rem;margin-top:0.3rem;">Salud combinada del jardín</div>
        </div>

        <!-- Desglose: jardín vs árboles -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-top:1rem;">
          <div style="background:rgba(26,68,128,0.08);padding:0.6rem;border-radius:8px;text-align:center;">
            <div style="font-size:0.65rem;color:#1a4480;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Jardín</div>
            <div style="font-weight:700;color:#0d2d5c;font-size:1.2rem;margin-top:2px;">${stats.gardenHealth != null ? stats.gardenHealth : '—'}</div>
            <div style="font-size:0.65rem;color:#666;">${stats.totalVisits} visita${stats.totalVisits !== 1 ? 's' : ''}</div>
          </div>
          <div style="background:rgba(46,125,50,0.08);padding:0.6rem;border-radius:8px;text-align:center;">
            <div style="font-size:0.65rem;color:#2E7D32;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Árboles</div>
            <div style="font-weight:700;color:#1b5e20;font-size:1.2rem;margin-top:2px;">${stats.treesAvgHealth != null ? Math.round(stats.treesAvgHealth) : '—'}</div>
            <div style="font-size:0.65rem;color:#666;">${stats.total} árbol${stats.total !== 1 ? 'es' : ''}</div>
          </div>
        </div>

        ${stats.total > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.3rem;text-align:center;font-size:0.7rem;margin-top:0.8rem;">
          <div style="background:rgba(76,175,80,0.12);padding:0.4rem 0.2rem;border-radius:6px;">
            <div style="font-weight:700;color:#2E7D32;">${stats.sano}</div><div style="color:#666;font-size:0.62rem;">sanos</div>
          </div>
          <div style="background:rgba(255,167,38,0.12);padding:0.4rem 0.2rem;border-radius:6px;">
            <div style="font-weight:700;color:#E65100;">${stats.medio}</div><div style="color:#666;font-size:0.62rem;">atención</div>
          </div>
          <div style="background:rgba(239,83,80,0.12);padding:0.4rem 0.2rem;border-radius:6px;">
            <div style="font-weight:700;color:#C62828;">${stats.malo}</div><div style="color:#666;font-size:0.62rem;">críticos</div>
          </div>
          <div style="background:#f0f0f0;padding:0.4rem 0.2rem;border-radius:6px;">
            <div style="font-weight:700;color:#666;">${stats.sinDato}</div><div style="color:#888;font-size:0.62rem;">s/dato</div>
          </div>
        </div>` : ''}

        <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid #f0f0f0;text-align:center;color:#888;font-size:0.78rem;">
          Último registro del jardín: <strong style="color:#444;">${lastVisitDate}</strong>
        </div>
      </div>
    </div>
    ${g.notes ? `
      <div class="card" style="padding:1.2rem;margin-top:1rem;">
        <h4 style="margin:0 0 0.5rem;color:#1a4480;"><i class="fas fa-sticky-note"></i> Notas</h4>
        <p style="color:#444;line-height:1.5;">${escapeHtml(g.notes)}</p>
      </div>` : ''}
  `;
}

// ============================================================================
// TAB: SEGUIMIENTO — header + chart + timeline de visitas + tabla de árboles
// (mismo patrón que mi-arbol.js para consistencia visual)
// ============================================================================
function _renderGardenSeguimiento(trees, visits) {
  // ---- Sección 1: Header + Chart + Timeline de visitas al jardín ----
  let visitsHtml;
  if (!visits || visits.length === 0) {
    visitsHtml = `
      <div class="card" style="padding:2rem;text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:0.6rem;">🌿</div>
        <h4 style="margin:0 0 0.3rem;color:#1a4480;">Sin visitas registradas</h4>
        <p style="color:#888;margin:0;">Crea la primera visita desde el tab <strong>"Nuevo Registro"</strong>.</p>
      </div>`;
  } else {
    const chartCard = visits.length >= 2 ? `
      <div class="card" style="padding:1rem;margin-bottom:1rem;">
        <h4 style="margin-bottom:0.5rem;color:#1a4480;"><i class="fas fa-chart-area"></i> Evolución temporal de la salud</h4>
        <div style="height:280px;"><canvas id="garden-health-timeline-chart"></canvas></div>
      </div>` : '';

    visitsHtml = `${chartCard}${_buildGardenVisitTimeline(visits)}`;
  }

  // ---- Sección 2: Tabla de árboles (si hay) ----
  let treesHtml = '';
  if (trees && trees.length > 0) {

    const rows = trees.map(t => {
      const score = t.health_score;
      const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
      const scoreText = score != null ? `${score}/100` : 's/d';
      const lastDate = t.last_measurement?.measurement_date
        ? formatDayLocal(t.last_measurement.measurement_date)
        : 'Nunca';
      return `
        <tr>
          <td style="padding:0.7rem 0.5rem;font-weight:500;">
            ${t.tree_code
              ? `<span style="font-family:ui-monospace,monospace;color:#1b5e20;">${escapeHtml(t.tree_code)}</span>${t.common_name ? `<br><span style="color:#666;font-size:0.78rem;font-weight:400;">${escapeHtml(t.common_name)}</span>` : ''}`
              : escapeHtml(t.common_name || 'Árbol')}
          </td>
          <td style="padding:0.7rem 0.5rem;color:#666;font-size:0.85rem;font-style:italic;">${escapeHtml(t.species || '-')}</td>
          <td style="padding:0.7rem 0.5rem;text-align:center;">
            <span style="background:${color};color:#fff;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;">${scoreText}</span>
          </td>
          <td style="padding:0.7rem 0.5rem;text-align:center;color:#666;font-size:0.85rem;">${lastDate}</td>
        </tr>`;
    }).join('');

    treesHtml = `
      <div class="card" style="padding:1.2rem;margin-top:1rem;">
        <h4 style="margin:0 0 1rem;color:#1a4480;"><i class="fas fa-tree"></i> Árboles dentro del jardín</h4>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="border-bottom:2px solid #ddd;text-align:left;">
                <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Árbol</th>
                <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Especie</th>
                <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Salud</th>
                <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Último</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  return `
    <h3 style="margin-bottom:1rem;color:#1a4480;"><i class="fas fa-chart-line"></i> Historial del jardín</h3>
    ${visitsHtml}
    ${treesHtml}
  `;
}

// ============================================================================
// Timeline de visitas (cards clickeables — patrón idéntico al de árboles)
// ============================================================================
function _buildGardenVisitTimeline(visits) {
  if (!visits || visits.length === 0) return '';

  // Ordenadas DESC (más reciente primero) — _fetchGardenVisits ya las regresa así
  return visits.map((v, i) => {
    const date = new Date(v.visit_date);
    const dateStr = date.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
    const score = v.health_score;
    const scoreClass = score >= 70 ? 'success' : score >= 40 ? 'warning' : score != null ? 'danger' : '';
    const scoreColor = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';

    // Chips compactos con métricas
    const chips = [];
    chips.push(`<div style="background:rgba(26,68,128,0.08);padding:0.4rem;border-radius:8px;text-align:center;font-size:0.72rem;">
      <div style="color:#666;font-size:0.65rem;">Tipo</div>
      <strong style="color:#0d2d5c;">${v.visit_type === 'primer_registro' ? '🌟 Primer reg.' : 'Visita'}</strong>
    </div>`);
    if (v.activities && v.activities.length) {
      chips.push(`<div style="background:rgba(46,125,50,0.10);padding:0.4rem;border-radius:8px;text-align:center;font-size:0.72rem;">
        <div style="color:#666;font-size:0.65rem;">Actividades</div>
        <strong style="color:#1b5e20;">${v.activities.length}</strong>
      </div>`);
    }
    if (v.photo_url) {
      chips.push(`<div style="background:rgba(2,136,209,0.10);padding:0.4rem;border-radius:8px;text-align:center;font-size:0.72rem;">
        <div style="color:#666;font-size:0.65rem;">Foto</div>
        <strong style="color:#01579b;"><i class="fas fa-camera"></i> Sí</strong>
      </div>`);
    }
    if (v.location_lat && v.location_lng) {
      chips.push(`<div style="background:rgba(255,167,38,0.12);padding:0.4rem;border-radius:8px;text-align:center;font-size:0.72rem;">
        <div style="color:#666;font-size:0.65rem;">GPS</div>
        <strong style="color:#E65100;"><i class="fas fa-map-marker-alt"></i> Sí</strong>
      </div>`);
    }

    // Rúbrica desglosada como mini-bars
    let rubricBar = '';
    if (v.rubric && typeof v.rubric === 'object') {
      const items = GARDEN_RUBRIC.map(r => {
        const sc = parseInt(v.rubric[r.id], 10);
        if (isNaN(sc)) return '';
        const pct = (sc / 25) * 100;
        const c = sc >= 18 ? '#4CAF50' : sc >= 12 ? '#FFA726' : '#EF5350';
        return `<div style="display:inline-flex;align-items:center;gap:0.3rem;background:rgba(0,0,0,0.04);padding:3px 9px;border-radius:10px;font-size:0.7rem;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};"></span>
          <span style="color:#555;">${escapeHtml(r.label.split(' ')[0])}</span>
          <strong style="color:#222;font-family:ui-monospace,monospace;">${sc}</strong>
        </div>`;
      }).filter(Boolean);
      if (items.length) {
        rubricBar = `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.6rem;">${items.join('')}</div>`;
      }
    }

    // Lista corta de actividades (primeras 4 con icono)
    let activitiesPreview = '';
    if (v.activities && v.activities.length) {
      const acts = v.activities.slice(0, 5).map(a => {
        const def = GARDEN_ACTIVITIES.find(x => x.id === a);
        return def ? `<span title="${escapeHtml(def.label)}" style="margin-right:0.4rem;">${def.icon}</span>` : '';
      }).join('');
      const more = v.activities.length > 5 ? ` <span style="color:#888;font-size:0.7rem;">+${v.activities.length - 5}</span>` : '';
      activitiesPreview = `<div style="margin-top:0.5rem;font-size:1rem;">${acts}${more}</div>`;
    }

    // Observaciones preview (corto)
    let obsPreview = '';
    if (v.observations && v.observations.trim()) {
      const clean = v.observations.trim();
      const truncated = clean.length > 100 ? clean.substring(0, 100) + '…' : clean;
      obsPreview = `<p class="text-small text-muted" style="margin-top:0.5rem;color:#666;font-size:0.8rem;">
        <i class="fas fa-sticky-note"></i> ${escapeHtml(truncated)}</p>`;
    }

    const borderColor = i === 0 ? '#2E7D32' : '#e0e0e0';
    const photoUrl = v.photo_url || '';
    // data-photo-path → el MutationObserver lo detecta y resuelve a signed URL
    const photoThumb = photoUrl ? `
      <img data-photo-path="${escapeHtml(photoUrl)}"
        style="width:80px;height:80px;object-fit:cover;border-radius:10px;flex-shrink:0;border:1px solid #eee;"
        onerror="this.style.display='none'">` : '';

    return `
      <div class="card"
        data-portfolio-action="open-garden-visit-detail"
        data-visit-id="${escapeHtml(String(v.id))}"
        style="padding:1.1rem;margin-bottom:0.8rem;border-left:4px solid ${borderColor};
        cursor:pointer;transition:box-shadow 0.2s, transform 0.15s;"
        onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,0.10)';this.style.transform='translateY(-1px)';"
        onmouseout="this.style.boxShadow='';this.style.transform='';">
        <div style="display:flex;gap:0.9rem;align-items:flex-start;">
          ${photoThumb}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
              <div>
                <strong style="color:#0d2d5c;"><i class="fas fa-calendar"></i> ${dateStr}</strong>
                ${score != null ? `<span class="badge badge-${scoreClass}" style="margin-left:0.5rem;background:${scoreColor};color:#fff;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;">Salud: ${score}/100</span>` : ''}
              </div>
              <div style="display:flex;gap:0.5rem;align-items:center;">
                ${i === 0 ? '<span class="badge badge-primary" style="background:#2E7D32;color:#fff;padding:2px 9px;border-radius:10px;font-size:0.7rem;font-weight:600;">Más reciente</span>' : ''}
                <i class="fas fa-chevron-right" style="color:#bbb;"></i>
              </div>
            </div>
            ${chips.length > 0 ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:0.4rem;margin-top:0.6rem;">${chips.join('')}</div>` : ''}
            ${activitiesPreview}
            ${rubricBar}
            ${obsPreview}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================================
// TAB: NUEVO REGISTRO — botón principal de visita al jardín + árboles si hay
// ============================================================================
function _renderGardenRegistro(garden, trees, visits) {
  const isFirst = !visits || visits.length === 0;
  const visitButtonLabel = isFirst ? '🌱 Hacer primer registro del jardín' : '➕ Nueva visita al jardín';
  const visitButtonHelp = isFirst
    ? 'Este será el registro inicial del jardín. Necesita foto y rúbrica de salud.'
    : 'Riego, limpieza, mantenimiento general. Foto + actividades + rúbrica.';

  const visitButton = `
    <div class="card" style="padding:1.2rem;background:linear-gradient(135deg,rgba(46,125,50,0.10),rgba(102,153,204,0.08));border:2px dashed rgba(46,125,50,0.35);">
      <h4 style="margin:0 0 0.4rem;color:#1a4480;"><i class="fas fa-leaf"></i> Visita al jardín</h4>
      <p style="color:#555;font-size:0.85rem;margin:0 0 0.9rem;">${visitButtonHelp}</p>
      <button data-portfolio-action="open-garden-visit" data-garden-id="${escapeHtml(String(garden.id))}"
        style="background:#2E7D32;color:#fff;border:none;padding:0.85rem 1.4rem;border-radius:11px;
        font-size:1rem;font-weight:600;cursor:pointer;width:100%;
        box-shadow:0 2px 10px rgba(46,125,50,0.35);transition:all 0.15s;"
        onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(46,125,50,0.45)';"
        onmouseout="this.style.transform='';this.style.boxShadow='0 2px 10px rgba(46,125,50,0.35)';">
        ${visitButtonLabel}
      </button>
    </div>
  `;

  if (!trees || trees.length === 0) {
    return `
      ${visitButton}
      <div class="card" style="padding:1.2rem;margin-top:1rem;background:#fafafa;color:#888;text-align:center;font-size:0.85rem;">
        Este jardín no tiene árboles individuales registrados aún.<br>
        Las visitas que registres arriba quedarán a nivel del jardín completo.
      </div>
    `;
  }

  const cards = trees.map(t => {
    const score = t.health_score;
    const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
    return `
      <div data-portfolio-action="select-entity"
        data-entity-type="tree"
        data-entity-id="${escapeHtml(String(t.id))}"
        style="background:#fff;border:1px solid #d6d6d6;border-radius:12px;padding:0.9rem;cursor:pointer;
        transition:all 0.15s;display:flex;align-items:center;gap:0.8rem;"
        onmouseover="this.style.borderColor='#2E7D32';this.style.boxShadow='0 2px 8px rgba(46,125,50,0.15)';"
        onmouseout="this.style.borderColor='#d6d6d6';this.style.boxShadow='';">
        <div style="width:8px;height:48px;background:${color};border-radius:4px;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:#1b5e20;font-family:ui-monospace,monospace;">${escapeHtml(t.tree_code || 'Árbol #' + t.id)}</div>
          ${t.common_name ? `<div style="color:#333;font-size:0.85rem;">${escapeHtml(t.common_name)}</div>` : ''}
          ${t.species ? `<div style="color:#666;font-size:0.78rem;font-style:italic;">${escapeHtml(t.species)}</div>` : ''}
        </div>
        <i class="fas fa-chevron-right" style="color:#bbb;"></i>
      </div>`;
  }).join('');

  return `
    ${visitButton}
    <div class="card" style="padding:1.2rem;margin-top:1rem;">
      <h4 style="margin:0 0 0.4rem;color:#1a4480;"><i class="fas fa-tree"></i> ...o registra el seguimiento de un árbol</h4>
      <p style="color:#666;font-size:0.85rem;margin:0 0 1rem;">Toca un árbol del jardín para abrir su formulario.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.7rem;">
        ${cards}
      </div>
    </div>
  `;
}

// ============================================================================
// TAB: METAS (dual — del jardín + mías)
// ============================================================================
function _renderGardenMetas(garden, trees, stats) {
  // Leer metas configuradas del jardín o usar defaults
  const goals = garden.goals || {};
  const targetHealth = goals.target_health ?? 70;
  const targetVisits = goals.target_visits ?? 1;
  const targetCoverage = goals.target_tree_coverage_pct ?? 80;
  const targetVariety = goals.target_activity_variety ?? 3;
  const period = goals.period || 'mensual';
  const aiSuggested = !!goals.ai_suggested;
  const aiReasoning = goals.ai_reasoning || '';

  const periodLabel = { mensual: 'mes', trimestral: 'trimestre', anual: 'año' }[period] || 'mes';

  // ---- Estado del jardín (datos reales) ----
  const pctSano = stats.total > 0 ? Math.round((stats.sano / stats.total) * 100) : 0;
  const pctConDato = stats.total > 0 ? Math.round(((stats.total - stats.sinDato) / stats.total) * 100) : 0;
  const gardenHealthPct = stats.gardenHealth != null ? stats.gardenHealth : 0;

  // Visitas en el periodo
  const periodStart = _periodStart(period);
  const visitsInPeriod = (stats.lastVisit && new Date(stats.lastVisit.visit_date) >= periodStart)
    ? _countVisitsSince(garden.id, periodStart)
    : 0; // se recalcula async abajo

  // Variedad de actividades — async se calcula
  const myContribId = 'g-my-contrib-' + garden.id;
  setTimeout(() => _loadMyContribution(garden.id, trees.map(t => t.id), myContribId), 100);

  // ---- Builder de meta cards ----
  const metaCard = (label, current, target, suffix, helpText) => {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const isMet = current >= target;
    const color = isMet ? '#4CAF50' : pct >= 50 ? '#FFA726' : '#90CAF9';
    return `
      <div class="card" style="padding:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.6rem;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.74rem;color:#666;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
            <div style="font-size:1.6rem;font-weight:700;color:${isMet ? '#2E7D32' : '#444'};margin-top:0.2rem;font-family:ui-monospace,monospace;">${current}${suffix || ''}<span style="font-size:0.85rem;color:#999;font-weight:500;"> / ${target}${suffix || ''}</span></div>
          </div>
          <div style="font-size:1.3rem;">${isMet ? '✅' : '🎯'}</div>
        </div>
        <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden;">
          <div style="background:${color};height:100%;width:${pct}%;transition:width 0.3s;"></div>
        </div>
        ${helpText ? `<div style="font-size:0.7rem;color:#888;margin-top:0.4rem;">${escapeHtml(helpText)}</div>` : ''}
      </div>`;
  };

  const aiBadge = aiSuggested
    ? `<span style="background:rgba(26,68,128,0.10);color:#1a4480;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:0.5rem;"><i class="fas fa-robot"></i> sugerido por PUM-AI</span>`
    : '';

  return `
    <div style="margin-bottom:1.5rem;">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.4rem;">
        <h4 style="margin:0;color:#1a4480;"><i class="fas fa-globe"></i> Estado del jardín</h4>
        ${aiBadge}
        <span style="background:#f0f0f0;color:#444;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:500;">Periodo: ${period}</span>
      </div>
      ${aiReasoning ? `<p style="font-size:0.78rem;color:#666;margin:0 0 0.8rem;line-height:1.4;"><i class="fas fa-quote-left" style="opacity:0.4;"></i> ${escapeHtml(aiReasoning)}</p>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;">
        ${metaCard('Salud del jardín', gardenHealthPct, targetHealth, '/100', 'Promedio de salud (jardín + árboles)')}
        ${stats.total > 0 ? metaCard('Árboles sanos', pctSano, 70, '%', `${stats.sano}/${stats.total} con salud ≥70`) : ''}
        ${stats.total > 0 ? metaCard('Cobertura', pctConDato, targetCoverage, '%', `Árboles con seguimiento`) : ''}
        ${metaCard(`Visitas este ${periodLabel}`, visitsInPeriod, targetVisits, '', `Visitas al jardín en el ${periodLabel} actual`)}
      </div>
    </div>

    <div>
      <h4 style="margin:0 0 1rem;color:#1a4480;"><i class="fas fa-user-check"></i> Mi contribución en este jardín</h4>
      <div id="${myContribId}" class="card" style="padding:1rem;">
        <div style="text-align:center;color:#999;"><i class="fas fa-spinner fa-spin"></i> Calculando…</div>
      </div>
    </div>
  `;
}

function _periodStart(period) {
  const now = new Date();
  if (period === 'anual') return new Date(now.getFullYear(), 0, 1);
  if (period === 'trimestral') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function _countVisitsSince(gardenId, sinceDate) {
  // Cuenta sincrónica desde el cache (las visitas ya fueron cargadas)
  if (!_lastGardenVisits) return 0;
  return _lastGardenVisits.filter(v =>
    String(v.garden_id) === String(gardenId)
    && new Date(v.visit_date) >= sinceDate
  ).length;
}

async function _loadMyContribution(gardenId, treeIds, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    // 1) Mediciones de árboles del jardín hechas por el usuario
    let treeMeas = [];
    if (treeIds && treeIds.length > 0) {
      const { data } = await sb
        .from('tree_measurements')
        .select('id, tree_id, measurement_date')
        .in('tree_id', treeIds)
        .eq('user_id', currentUser.id)
        .order('measurement_date', { ascending: false });
      treeMeas = data || [];
    }

    // 2) Visitas al jardín hechas por el usuario
    const { data: gardenV } = await sb
      .from('garden_visits')
      .select('id, visit_date, activities')
      .eq('garden_id', gardenId)
      .eq('user_id', currentUser.id)
      .order('visit_date', { ascending: false });
    const myGardenVisits = gardenV || [];

    // ---- Métricas combinadas ----
    const totalContributions = treeMeas.length + myGardenVisits.length;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const lastMonthMeas = treeMeas.filter(m => new Date(m.measurement_date) >= oneMonthAgo).length;
    const lastMonthVisits = myGardenVisits.filter(v => new Date(v.visit_date) >= oneMonthAgo).length;
    const totalLastMonth = lastMonthMeas + lastMonthVisits;

    // Última actividad (la más reciente entre ambas)
    const allDates = [
      ...treeMeas.map(m => m.measurement_date),
      ...myGardenVisits.map(v => v.visit_date),
    ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
    const lastDate = allDates[0] ? new Date(allDates[0]).toLocaleDateString() : '—';
    const daysSinceLast = allDates[0]
      ? Math.floor((Date.now() - new Date(allDates[0])) / (1000 * 60 * 60 * 24))
      : null;

    // Variedad: tipos de actividades distintas que el usuario ha hecho en este jardín
    const allActivities = new Set();
    myGardenVisits.forEach(v => (v.activities || []).forEach(a => allActivities.add(a)));
    const varietyCount = allActivities.size;

    // ---- Meta personal: ≥1 visita este mes ----
    const monthlyMet = totalLastMonth >= 1;

    // Estilo de "días desde última" (alerta si >30)
    const lastColor = daysSinceLast == null ? '#999' :
                      daysSinceLast > 30 ? '#EF5350' :
                      daysSinceLast > 14 ? '#FFA726' : '#4CAF50';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.7rem;text-align:center;margin-bottom:1rem;">
        <div style="background:rgba(46,125,50,0.08);padding:0.7rem;border-radius:10px;">
          <div style="font-size:1.8rem;font-weight:700;color:#2E7D32;">${totalContributions}</div>
          <div style="font-size:0.7rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Total</div>
          <div style="font-size:0.66rem;color:#888;margin-top:2px;">${myGardenVisits.length} visitas · ${treeMeas.length} medidas</div>
        </div>
        <div style="background:rgba(25,118,210,0.08);padding:0.7rem;border-radius:10px;">
          <div style="font-size:1.8rem;font-weight:700;color:#1976D2;">${totalLastMonth}</div>
          <div style="font-size:0.7rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Este mes</div>
        </div>
        <div style="background:rgba(142,36,170,0.08);padding:0.7rem;border-radius:10px;">
          <div style="font-size:1.8rem;font-weight:700;color:#8E24AA;">${varietyCount}</div>
          <div style="font-size:0.7rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Variedad de actividades</div>
        </div>
        <div style="padding:0.7rem;border-radius:10px;background:rgba(0,0,0,0.04);">
          <div style="font-size:1rem;font-weight:600;color:${lastColor};">${daysSinceLast != null ? daysSinceLast + ' días' : '—'}</div>
          <div style="font-size:0.7rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Desde última</div>
          <div style="font-size:0.66rem;color:#888;margin-top:2px;">${lastDate}</div>
        </div>
      </div>

      <!-- Meta del mes -->
      <div style="background:${monthlyMet ? 'rgba(76,175,80,0.10)' : '#fff8e1'};padding:0.8rem 1rem;border-radius:10px;border-left:3px solid ${monthlyMet ? '#4CAF50' : '#FFA726'};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <div>
            <strong style="color:#333;">${monthlyMet ? '✓ Meta del mes cumplida' : '🎯 Meta del mes'}</strong>
            <div style="font-size:0.78rem;color:#666;">Hacer al menos 1 actividad en el jardín cada mes.</div>
          </div>
          <div style="font-size:1.4rem;font-weight:700;color:${monthlyMet ? '#2E7D32' : '#E65100'};font-family:ui-monospace,monospace;">${totalLastMonth}/1</div>
        </div>
      </div>

      ${totalContributions === 0 ? '<p style="text-align:center;color:#888;margin-top:1rem;font-size:0.85rem;">Aún no has hecho actividad en este jardín. Ve a <strong>"Nuevo Registro"</strong> y haz tu primera visita.</p>' : ''}
    `;
  } catch (e) {
    console.error('_loadMyContribution error:', e);
    el.innerHTML = '<div style="text-align:center;color:#888;">No se pudieron cargar tus contribuciones.</div>';
  }
}

// ============================================================================
// MAPA DEL JARDÍN
// ============================================================================
function _initGardenMap(garden, trees) {
  const cont = document.getElementById('g-map-container');
  if (!cont || typeof L === 'undefined') return;

  // Determinar centro: location_lat/lng del jardín o promedio de árboles
  let center = null;
  if (garden.location_lat && garden.location_lng) {
    center = [garden.location_lat, garden.location_lng];
  } else if (trees.length > 0) {
    const withCoords = trees.filter(t => t.location_lat && t.location_lng);
    if (withCoords.length > 0) {
      const avgLat = withCoords.reduce((s, t) => s + t.location_lat, 0) / withCoords.length;
      const avgLng = withCoords.reduce((s, t) => s + t.location_lng, 0) / withCoords.length;
      center = [avgLat, avgLng];
    }
  }
  if (!center) {
    cont.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">Sin coordenadas para este jardín.</p>';
    return;
  }

  const map = L.map(cont, { zoomControl: true }).setView(center, 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  // Polígono del jardín si hay bounds_polygon
  if (garden.bounds_polygon) {
    try {
      const poly = typeof garden.bounds_polygon === 'string'
        ? JSON.parse(garden.bounds_polygon)
        : garden.bounds_polygon;
      L.geoJSON(poly, {
        style: { color: '#2E7D32', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.15 }
      }).addTo(map);
    } catch (_) {}
  }

  // Marker del jardín (centro)
  L.marker(center, {
    icon: L.divIcon({
      html: '<div style="background:#1a4480;color:#fff;padding:4px 10px;border-radius:14px;font-size:0.75rem;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🌿 ' + escapeHtml(garden.name) + '</div>',
      className: '',
      iconSize: [120, 24],
    })
  }).addTo(map);

  // Markers de árboles
  trees.filter(t => t.location_lat && t.location_lng).forEach(t => {
    const score = t.health_score;
    const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
    const icon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
      className: '',
      iconSize: [14, 14],
    });
    L.marker([t.location_lat, t.location_lng], { icon })
      .addTo(map)
      .bindPopup(`<strong style="font-family:ui-monospace,monospace;">${escapeHtml(t.tree_code || 'Árbol #' + t.id)}</strong><br>
        ${t.common_name ? `${escapeHtml(t.common_name)}<br>` : ''}
        ${t.species ? `<em>${escapeHtml(t.species)}</em><br>` : ''}
        Salud: ${score != null ? score + '/100' : 's/d'}<br>
        <a href="#" data-portfolio-action="select-entity" data-entity-type="tree" data-entity-id="${escapeHtml(String(t.id))}">Ver detalle</a>`);
  });

  // Ajustar viewport para mostrar todo
  setTimeout(() => map.invalidateSize(), 100);
}

// ============================================================================
// SWITCH TAB del jardín
// ============================================================================
function switchGardenTab(tabId) {
  document.querySelectorAll('.garden-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
    b.classList.toggle('btn-primary', b.dataset.tab === tabId);
    b.classList.toggle('btn-outline', b.dataset.tab !== tabId);
  });
  document.querySelectorAll('.garden-tab-content').forEach(p => {
    p.style.display = p.id === tabId ? 'block' : 'none';
    p.classList.toggle('active', p.id === tabId);
  });

  // Re-render chart al entrar al tab "Seguimiento" (canvas tiene que estar visible)
  if (tabId === 'g-seguimiento' && _lastGardenVisits) {
    setTimeout(() => _renderGardenHealthChart(_lastGardenVisits), 100);
  }
}

// Cache de visitas para re-renderizar chart on demand
let _lastGardenVisits = null;
let _gardenChartInstance = null;

function _renderGardenHealthChart(visits) {
  const ctx = document.getElementById('garden-health-timeline-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (_gardenChartInstance) {
    try { _gardenChartInstance.destroy(); } catch (_) {}
    _gardenChartInstance = null;
  }
  if (!visits || visits.length < 2) return;

  const sorted = [...visits].sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date));
  const labels = sorted.map(v => new Date(v.visit_date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }));
  const healthData = sorted.map(v => v.health_score != null ? v.health_score : null);

  // Datasets adicionales: cada criterio de la rúbrica (escalado a 0-100)
  const rubricDatasets = GARDEN_RUBRIC.map((r, i) => {
    const colors = ['#2E7D32', '#FFA726', '#1976D2', '#8E24AA'];
    return {
      label: r.label,
      data: sorted.map(v => {
        const s = v.rubric?.[r.id];
        return (s != null && !isNaN(s)) ? Math.round(s * 4) : null; // 0-25 → 0-100
      }),
      borderColor: colors[i],
      backgroundColor: 'transparent',
      tension: 0.25,
      hidden: true, // ocultos por default — el usuario los activa con click en la leyenda
      spanGaps: true,
      borderDash: [5, 5],
    };
  });

  _gardenChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Salud total (%)',
          data: healthData,
          borderColor: '#1a4480',
          backgroundColor: 'rgba(26,68,128,0.15)',
          tension: 0.3,
          fill: true,
          spanGaps: true,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#1a4480',
        },
        ...rubricDatasets,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: 'Puntaje (%)' },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { mode: 'index', intersect: false },
      },
    },
  });
}

// ============================================================================
// FORM MODAL — Nueva visita al jardín
// ============================================================================
let _currentGardenVisitId = null; // jardín activo para el form

async function openGardenVisitForm(gardenId) {
  const garden = _myGardenRecords.find(g => String(g.id) === String(gardenId));
  if (!garden) {
    alert('Jardín no encontrado.');
    return;
  }

  // Verificar si ya hubo primer registro
  const { data: existing } = await sb
    .from('garden_visits')
    .select('id')
    .eq('garden_id', gardenId)
    .limit(1);
  const isFirst = !existing || existing.length === 0;

  _currentGardenVisitId = gardenId;

  // Construir modal
  let modal = document.getElementById('garden-visit-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'garden-visit-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(3px);';

  const activitiesChips = GARDEN_ACTIVITIES.map(a => `
    <label style="cursor:pointer;display:inline-flex;align-items:center;gap:0.35rem;padding:0.35rem 0.7rem;border:1.5px solid #d6d6d6;border-radius:18px;font-size:0.78rem;font-weight:500;transition:all 0.15s;background:#fff;color:#444;"
      onmouseover="this.style.borderColor='#2E7D32';"
      onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#d6d6d6';">
      <input type="checkbox" name="gv-activity" value="${a.id}" style="display:none;"
        onchange="this.parentElement.style.background = this.checked ? 'rgba(46,125,50,0.12)' : '#fff';
                  this.parentElement.style.borderColor = this.checked ? '#2E7D32' : '#d6d6d6';
                  this.parentElement.style.color = this.checked ? '#1b5e20' : '#444';">
      ${a.icon} ${a.label}
    </label>`).join('');

  const rubricSliders = GARDEN_RUBRIC.map((r, i) => `
    <div style="margin-bottom:0.9rem;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.3rem;">
        <label style="font-size:0.85rem;font-weight:500;color:#333;">${r.label}</label>
        <span id="gv-rubric-${r.id}-val" style="font-size:0.78rem;color:#2E7D32;font-weight:600;font-family:ui-monospace,monospace;">15/25</span>
      </div>
      <input type="range" min="0" max="25" value="15" id="gv-rubric-${r.id}"
        oninput="document.getElementById('gv-rubric-${r.id}-val').textContent=this.value+'/25'; _updateGardenVisitTotal();"
        style="width:100%;accent-color:#2E7D32;">
      <div style="font-size:0.7rem;color:#888;margin-top:2px;">${r.desc}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="card" style="background:#fff;border-radius:18px;padding:1.5rem;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.8rem;">
        <div>
          <h3 style="margin:0;color:#1a4480;">${isFirst ? '🌱 Primer registro del jardín' : '➕ Nueva visita al jardín'}</h3>
          <p style="margin:0.2rem 0 0;color:#666;font-size:0.85rem;">${escapeHtml(garden.name || 'Jardín')}</p>
        </div>
        <button onclick="closeGardenVisitForm()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#999;line-height:1;">×</button>
      </div>

      <form id="form-garden-visit" onsubmit="return false;">
        <input type="hidden" id="gv-garden-id" value="${escapeHtml(String(gardenId))}">
        <input type="hidden" id="gv-visit-type" value="${isFirst ? 'primer_registro' : 'seguimiento'}">

        <!-- Foto OBLIGATORIA -->
        <div style="margin-bottom:1.2rem;">
          <label style="font-weight:600;font-size:0.9rem;color:#333;display:block;margin-bottom:0.4rem;">
            <i class="fas fa-camera" style="color:#2E7D32;"></i> Foto del jardín
            <span style="color:#c00;">*obligatoria</span>
          </label>
          <input type="file" id="gv-photo" accept="image/*" capture="environment" required
            style="width:100%;padding:0.6rem;border:1.5px dashed #2E7D32;border-radius:10px;background:rgba(46,125,50,0.05);cursor:pointer;">
          <div id="gv-photo-preview" style="margin-top:0.6rem;display:none;">
            <img id="gv-photo-img" src="" style="max-width:100%;max-height:200px;border-radius:10px;">
          </div>

          <!-- Botón Analizar con PUM-AI (auto-llena la rúbrica) -->
          <button type="button" id="gv-ai-btn" onclick="analyzeGardenPhotoWithAI()" disabled
            style="margin-top:0.6rem;width:100%;background:#1a4480;color:#fff;border:none;
            padding:0.65rem 1rem;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:0.5rem;
            opacity:0.5;transition:all 0.15s;">
            <i class="fas fa-robot"></i> Analizar con PUM-AI y llenar rúbrica
          </button>
          <div id="gv-ai-justification" style="display:none;margin-top:0.5rem;padding:0.65rem 0.8rem;background:rgba(26,68,128,0.08);border-radius:8px;font-size:0.78rem;color:#444;line-height:1.4;"></div>
        </div>

        <!-- Actividades realizadas -->
        <div style="margin-bottom:1.2rem;">
          <label style="font-weight:600;font-size:0.9rem;color:#333;display:block;margin-bottom:0.4rem;">
            <i class="fas fa-tools" style="color:#2E7D32;"></i> ¿Qué hiciste en esta visita?
          </label>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${activitiesChips}</div>
        </div>

        <!-- Rúbrica de salud -->
        <div style="margin-bottom:1.2rem;padding:1rem;background:#f8f8f5;border-radius:12px;">
          <label style="font-weight:600;font-size:0.9rem;color:#333;display:block;margin-bottom:0.7rem;">
            <i class="fas fa-clipboard-check" style="color:#2E7D32;"></i> Rúbrica de salud del jardín
            <span id="gv-total" style="float:right;background:#2E7D32;color:#fff;padding:2px 10px;border-radius:12px;font-size:0.85rem;">60/100</span>
          </label>
          ${rubricSliders}
        </div>

        <!-- Observaciones -->
        <div style="margin-bottom:1.2rem;">
          <label style="font-weight:600;font-size:0.9rem;color:#333;display:block;margin-bottom:0.4rem;">
            <i class="fas fa-pen" style="color:#2E7D32;"></i> Observaciones libres
          </label>
          <textarea id="gv-observations" rows="3" placeholder="¿Notaste algo importante? ¿Algún problema? ¿Qué se ve mejor?"
            style="width:100%;padding:0.7rem;border:1.5px solid #d6d6d6;border-radius:10px;font-family:inherit;font-size:0.9rem;resize:vertical;"></textarea>
        </div>

        <!-- GPS automático -->
        <div style="margin-bottom:1.2rem;font-size:0.78rem;color:#666;display:flex;align-items:center;gap:0.5rem;">
          <i class="fas fa-map-marker-alt" style="color:#2E7D32;"></i>
          <span id="gv-gps-status">Capturando ubicación…</span>
        </div>

        <!-- Botones -->
        <div style="display:flex;gap:0.6rem;justify-content:flex-end;">
          <button type="button" onclick="closeGardenVisitForm()"
            style="background:#f0f0f0;color:#444;border:none;padding:0.7rem 1.2rem;border-radius:10px;font-weight:500;cursor:pointer;">
            Cancelar
          </button>
          <button type="button" onclick="saveGardenVisit()" id="gv-save-btn"
            style="background:#2E7D32;color:#fff;border:none;padding:0.7rem 1.4rem;border-radius:10px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(46,125,50,0.35);">
            Guardar visita
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  // Preview de foto al seleccionar + habilitar botón AI
  document.getElementById('gv-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('gv-photo-img').src = ev.target.result;
      document.getElementById('gv-photo-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Habilitar botón de PUM-AI
    const aiBtn = document.getElementById('gv-ai-btn');
    if (aiBtn) {
      aiBtn.disabled = false;
      aiBtn.style.opacity = '1';
      aiBtn.style.cursor = 'pointer';
    }
    // Limpiar justificación previa
    const just = document.getElementById('gv-ai-justification');
    if (just) {
      just.style.display = 'none';
      just.innerHTML = '';
    }
  });

  // GPS
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('gv-gps-status').textContent =
          `Ubicación: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        document.getElementById('gv-gps-status').dataset.lat = pos.coords.latitude;
        document.getElementById('gv-gps-status').dataset.lng = pos.coords.longitude;
      },
      () => {
        document.getElementById('gv-gps-status').textContent = 'Sin ubicación (puedes guardar igual)';
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  _updateGardenVisitTotal();
}

function _updateGardenVisitTotal() {
  let total = 0;
  GARDEN_RUBRIC.forEach(r => {
    const v = parseInt(document.getElementById('gv-rubric-' + r.id)?.value || '0', 10);
    total += v;
  });
  const el = document.getElementById('gv-total');
  if (el) {
    el.textContent = total + '/100';
    el.style.background = total >= 70 ? '#2E7D32' : total >= 40 ? '#FFA726' : '#EF5350';
  }
}

function closeGardenVisitForm() {
  const m = document.getElementById('garden-visit-modal');
  if (m) m.remove();
  _currentGardenVisitId = null;
}

async function saveGardenVisit() {
  const btn = document.getElementById('gv-save-btn');
  const photoInput = document.getElementById('gv-photo');
  const file = photoInput?.files?.[0];

  if (!file) {
    alert('La foto es obligatoria.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const gardenId = document.getElementById('gv-garden-id').value;
    const visitType = document.getElementById('gv-visit-type').value;

    // Subir foto al bucket garden-photos
    // Path: <garden_id>/<visit_id>.<ext> — la policy RLS verifica que el
    // primer segmento (garden_id) esté en garden_assignments del usuario.
    const visitId = (crypto.randomUUID && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Subir foto + thumbnail (evita usar image transforms de Supabase)
    const baseFileName = `${gardenId}/${visitId}`;
    const { fullPath } = await uploadPhotoWithThumb(file, 'garden-photos', baseFileName);
    const path = fullPath;

    // Generar URL firmada (válida 7 días) para guardar como photo_url
    let photoUrl = path; // fallback al path crudo si createSignedUrl no funciona
    try {
      const { data: urlData } = await sb.storage.from('garden-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (urlData?.signedUrl) photoUrl = urlData.signedUrl;
    } catch (_) {}

    // Actividades seleccionadas
    const activities = Array.from(document.querySelectorAll('input[name="gv-activity"]:checked'))
      .map(c => c.value);

    // Rúbrica
    const rubric = {};
    let totalScore = 0;
    GARDEN_RUBRIC.forEach(r => {
      const v = parseInt(document.getElementById('gv-rubric-' + r.id)?.value || '0', 10);
      rubric[r.id] = v;
      totalScore += v;
    });

    // GPS
    const gpsEl = document.getElementById('gv-gps-status');
    const lat = gpsEl?.dataset?.lat ? parseFloat(gpsEl.dataset.lat) : null;
    const lng = gpsEl?.dataset?.lng ? parseFloat(gpsEl.dataset.lng) : null;

    // Observaciones
    const obs = document.getElementById('gv-observations').value.trim();

    // Insertar en BD
    const { error } = await sb.from('garden_visits').insert([{
      id: visitId,
      garden_id: gardenId,
      user_id: currentUser.id,
      visit_type: visitType,
      photo_url: photoUrl,
      health_score: totalScore,
      rubric,
      activities,
      observations: obs || null,
      location_lat: lat,
      location_lng: lng,
    }]);
    if (error) throw error;

    if (typeof showToast === 'function') showToast('Visita registrada ✓', 'success');
    closeGardenVisitForm();
    // Recargar la vista del jardín
    renderGardenView(gardenId);
  } catch (e) {
    console.error('saveGardenVisit error:', e);
    alert('Error al guardar: ' + (e.message || e));
    btn.disabled = false;
    btn.textContent = 'Guardar visita';
  }
}

// ============================================================================
// PUM-AI — Análisis de foto del jardín y autollenado de rúbrica
// ============================================================================
// Patrón idéntico al de árboles (mi-arbol.js → analyzePhotoWithAI):
//   1. Comprimir foto a 1024px JPEG 70%
//   2. Convertir a base64
//   3. Llamar Edge Function 'pum-ai' con prompt específico de jardín
//   4. Parsear JSON con los 4 criterios + justificación
//   5. Setear sliders y mostrar justificación
// ============================================================================

async function analyzeGardenPhotoWithAI() {
  const aiBtn = document.getElementById('gv-ai-btn');
  const justEl = document.getElementById('gv-ai-justification');
  const photoInput = document.getElementById('gv-photo');
  const file = photoInput?.files?.[0];

  if (!file) {
    if (typeof showToast === 'function') showToast('Selecciona una foto primero', 'warning');
    return;
  }

  const originalLabel = aiBtn.innerHTML;
  aiBtn.disabled = true;
  aiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando…';
  if (justEl) { justEl.style.display = 'none'; justEl.innerHTML = ''; }

  try {
    // 1) Leer y comprimir
    const dataUrl = await _fileToDataUrl(file);
    const compressed = (typeof compressImageForAI === 'function')
      ? await compressImageForAI(dataUrl, 1024, 1024, 0.7)
      : await _compressImageGarden(dataUrl, 1024, 1024, 0.7);
    const base64Data = compressed.split(',')[1];
    const mimeType = (compressed.match(/^data:(image\/[a-zA-Z+]+);/) || [, 'image/jpeg'])[1];

    // 2) Prompt específico para jardín
    const prompt = `Eres PUM-AI, un asistente experto en jardinería del Valle de México (FES Iztacala UNAM). Analiza esta foto de un JARDÍN (no un árbol individual) y evalúa estos 4 criterios en escala 0 a 25 cada uno:

1. cobertura (0-25): cobertura y densidad vegetal — qué tan cubierto y denso luce el jardín, presencia de plantas/flores, áreas sin cubrir
2. vitalidad (0-25): vitalidad de plantas/flores — ausencia de marchitez, color saludable, hojas verdes y turgentes, flores en buen estado
3. mantenimiento (0-25): limpieza y mantenimiento — sin basura, maleza controlada, podas al día, bordes definidos
4. suelo_riego (0-25): estado del suelo y riego — suelo aparentemente húmedo, sin compactación visible, sin encharcamiento ni erosión

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto adicional, sin explicaciones extra), así:

{"cobertura": <num 0-25>, "vitalidad": <num 0-25>, "mantenimiento": <num 0-25>, "suelo_riego": <num 0-25>, "justificacion": "<2-3 frases breves de lo que ves>"}`;

    // 3) Llamar Edge Function
    const { data, error } = await sb.functions.invoke('pum-ai', {
      body: { message: prompt, imageBase64: base64Data, imageType: mimeType },
    });
    if (error) throw error;

    let reply = data?.reply || '';
    // Limpiar markdown fences si los hay
    reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 4) Extraer JSON
    let parsed = null;
    try {
      parsed = JSON.parse(reply);
    } catch (_) {
      // Fallback: buscar el primer objeto JSON en el texto
      const m = reply.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (_) {}
      }
    }
    if (!parsed) throw new Error('No se pudo interpretar la respuesta de PUM-AI.');

    // 5) Setear sliders (con clamp 0-25)
    const setSlider = (key) => {
      const v = parseInt(parsed[key], 10);
      if (isNaN(v)) return;
      const clamped = Math.max(0, Math.min(25, v));
      const slider = document.getElementById('gv-rubric-' + key);
      const valEl = document.getElementById('gv-rubric-' + key + '-val');
      if (slider) {
        slider.value = clamped;
        if (valEl) valEl.textContent = clamped + '/25';
      }
    };
    GARDEN_RUBRIC.forEach(r => setSlider(r.id));
    _updateGardenVisitTotal();

    // 6) Mostrar justificación
    if (justEl) {
      const justText = parsed.justificacion || parsed.justification || 'Análisis completado.';
      justEl.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:0.5rem;">
          <i class="fas fa-robot" style="color:#1a4480;margin-top:2px;flex-shrink:0;"></i>
          <div>
            <strong style="color:#0d2d5c;">PUM-AI dice:</strong>
            ${escapeHtml(justText)}
          </div>
        </div>`;
      justEl.style.display = 'block';
    }

    if (typeof showToast === 'function') showToast('Rúbrica autollenada por PUM-AI ✓', 'success');
  } catch (e) {
    console.error('analyzeGardenPhotoWithAI error:', e);
    if (justEl) {
      justEl.innerHTML = `<span style="color:#c00;"><i class="fas fa-exclamation-triangle"></i> No se pudo analizar la foto: ${escapeHtml(e.message || String(e))}. Llena la rúbrica manualmente.</span>`;
      justEl.style.display = 'block';
    }
  } finally {
    aiBtn.disabled = false;
    aiBtn.innerHTML = originalLabel;
  }
}

// Helpers locales
function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Fallback de compresión si compressImageForAI no está disponible globalmente
function _compressImageGarden(dataUrl, maxW, maxH, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback al original
    img.src = dataUrl;
  });
}

// ============================================================================
// MODAL DE DETALLE DE VISITA AL JARDÍN
// ============================================================================
async function showGardenVisitDetail(visitId) {
  if (!_lastGardenVisits) return;
  const v = _lastGardenVisits.find(x => String(x.id) === String(visitId));
  if (!v) return;

  // Pre-resolver photo_url a signed URL si es path relativo del bucket
  if (v.photo_url && !/^https?:\/\//.test(v.photo_url) && typeof resolvePhotoUrl === 'function') {
    try { v.photo_url = await resolvePhotoUrl(v.photo_url) || v.photo_url; } catch (_) {}
  }

  let modal = document.getElementById('garden-visit-detail-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'garden-visit-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(3px);';

  const date = new Date(v.visit_date);
  const dateStr = date.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const score = v.health_score;
  const scoreColor = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';

  // Rúbrica desglosada — barras grandes
  let rubricHtml = '';
  if (v.rubric && typeof v.rubric === 'object') {
    rubricHtml = GARDEN_RUBRIC.map(r => {
      const sc = parseInt(v.rubric[r.id], 10);
      if (isNaN(sc)) return '';
      const pct = (sc / 25) * 100;
      const c = sc >= 18 ? '#4CAF50' : sc >= 12 ? '#FFA726' : '#EF5350';
      return `
        <div style="margin-bottom:0.7rem;">
          <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.25rem;">
            <span style="color:#333;font-weight:500;">${escapeHtml(r.label)}</span>
            <strong style="color:${c};font-family:ui-monospace,monospace;">${sc}/25</strong>
          </div>
          <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden;">
            <div style="background:${c};width:${pct}%;height:100%;transition:width 0.3s;"></div>
          </div>
          <div style="font-size:0.7rem;color:#888;margin-top:2px;">${escapeHtml(r.desc)}</div>
        </div>`;
    }).join('');
  }

  // Actividades
  let activitiesHtml = '';
  if (v.activities && v.activities.length) {
    activitiesHtml = v.activities.map(a => {
      const def = GARDEN_ACTIVITIES.find(x => x.id === a);
      const label = def ? `${def.icon} ${def.label}` : a;
      return `<span style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(46,125,50,0.10);color:#1b5e20;padding:0.35rem 0.75rem;border-radius:14px;font-size:0.8rem;font-weight:500;border:1px solid rgba(46,125,50,0.25);">${escapeHtml(label)}</span>`;
    }).join('');
  }

  modal.innerHTML = `
    <div class="card" style="background:#fff;border-radius:18px;max-width:680px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);">
      <div style="padding:1.3rem 1.4rem 1rem;border-bottom:1px solid #f0f0f0;position:sticky;top:0;background:#fff;z-index:1;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
          <div>
            <div style="font-size:0.78rem;color:#888;text-transform:uppercase;letter-spacing:0.05em;">${v.visit_type === 'primer_registro' ? '🌟 Primer registro' : 'Visita al jardín'}</div>
            <h3 style="margin:0.2rem 0 0;color:#0d2d5c;text-transform:capitalize;">${dateStr}</h3>
            <div style="color:#888;font-size:0.85rem;">${timeStr} hrs</div>
          </div>
          <button onclick="closeGardenVisitDetail()" style="background:none;border:none;font-size:1.6rem;cursor:pointer;color:#999;line-height:1;">×</button>
        </div>
        ${score != null ? `
          <div style="margin-top:0.9rem;background:${scoreColor};color:#fff;padding:0.6rem 1rem;border-radius:12px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-weight:500;">Salud del jardín</span>
            <strong style="font-size:1.3rem;font-family:ui-monospace,monospace;">${score}/100</strong>
          </div>` : ''}
      </div>

      <div style="padding:1.3rem 1.4rem;">
        ${v.photo_url ? `
          <div style="margin-bottom:1.2rem;">
            <img data-photo-path="${escapeHtml(v.photo_url)}"
              style="width:100%;border-radius:12px;cursor:zoom-in;"
              onclick="window.open(this.src,'_blank')"
              onerror="this.style.display='none'">
          </div>` : ''}

        ${rubricHtml ? `
          <div style="margin-bottom:1.3rem;">
            <h4 style="margin:0 0 0.7rem;color:#1a4480;"><i class="fas fa-clipboard-check"></i> Rúbrica de salud</h4>
            ${rubricHtml}
          </div>` : ''}

        ${activitiesHtml ? `
          <div style="margin-bottom:1.3rem;">
            <h4 style="margin:0 0 0.6rem;color:#1a4480;"><i class="fas fa-tools"></i> Actividades realizadas</h4>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${activitiesHtml}</div>
          </div>` : ''}

        ${v.observations && v.observations.trim() ? `
          <div style="margin-bottom:1.3rem;">
            <h4 style="margin:0 0 0.5rem;color:#1a4480;"><i class="fas fa-sticky-note"></i> Observaciones</h4>
            <p style="background:#f8f8f5;padding:0.85rem 1rem;border-radius:10px;color:#444;line-height:1.5;font-size:0.9rem;margin:0;white-space:pre-wrap;">${escapeHtml(v.observations.trim())}</p>
          </div>` : ''}

        ${v.location_lat && v.location_lng ? `
          <div style="font-size:0.78rem;color:#666;display:flex;align-items:center;gap:0.4rem;">
            <i class="fas fa-map-marker-alt" style="color:#2E7D32;"></i>
            ${parseFloat(v.location_lat).toFixed(5)}, ${parseFloat(v.location_lng).toFixed(5)}
          </div>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  // Click en el backdrop cierra
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeGardenVisitDetail();
  });
}

function closeGardenVisitDetail() {
  const m = document.getElementById('garden-visit-detail-modal');
  if (m) m.remove();
}

// ============================================================================
// EXPORTS
// ============================================================================
window.loadMyPortfolio = loadMyPortfolio;
window.selectPortfolioEntity = selectPortfolioEntity;
window.renderGardenView = renderGardenView;
window.switchGardenTab = switchGardenTab;
window.openGardenVisitForm = openGardenVisitForm;
window.closeGardenVisitForm = closeGardenVisitForm;
window.saveGardenVisit = saveGardenVisit;
window._updateGardenVisitTotal = _updateGardenVisitTotal;
window.analyzeGardenPhotoWithAI = analyzeGardenPhotoWithAI;

// ============================================================================
// Bitácora del jardín — mensual + anual con PUM-AI
// ============================================================================
async function _loadBitacoraGarden(gardenId) {
  const container = document.getElementById('g-bitacora-container');
  if (!container || !window.Bitacora) return;

  container.innerHTML = `
    <div class="card" style="padding:1rem;text-align:center;color:#888;background:rgba(26,68,128,0.05);margin-bottom:1rem;">
      <i class="fas fa-robot"></i> PUM-AI está preparando la bitácora del jardín…
    </div>`;

  try {
    const monthly = await window.Bitacora.getOrGenerateGardenMonthly(gardenId);
    const now = new Date();
    let annual = null;
    if (now.getMonth() <= 1 || now.getMonth() === 11) {
      annual = await window.Bitacora.getOrGenerateGardenAnnual(gardenId);
    }
    let html = '';
    if (annual) html += window.Bitacora.renderBitacoraCard(annual, 'annual');
    if (monthly) html += window.Bitacora.renderBitacoraCard(monthly, 'monthly');
    container.innerHTML = html || '';
  } catch (e) {
    console.error('Bitácora garden error:', e);
    container.innerHTML = '';
  }
}
window._loadBitacoraGarden = _loadBitacoraGarden;
window.showGardenVisitDetail = showGardenVisitDetail;
window.closeGardenVisitDetail = closeGardenVisitDetail;

// ============================================================================
// Photo hydration: cuando se inyecta un <img data-photo-path="..."> al DOM,
// el MutationObserver lo detecta y resuelve la ruta del bucket privado
// tree-photos a una signed URL temporal (vía resolvePhotoUrl).
// Esto evita 404 cuando el path es relativo (ej. "431/123.jpg") y el browser
// intentaba cargarlo como ruta del sitio.
// ============================================================================
(function _installPhotoHydrator() {
  if (typeof window === 'undefined' || window.__photoHydrateInstalled) return;
  window.__photoHydrateInstalled = true;

  async function _hydrate(img) {
    const path = img.getAttribute('data-photo-path');
    if (!path) return;
    img.removeAttribute('data-photo-path');
    if (/^https?:\/\//.test(path)) { img.src = path; return; }
    if (typeof resolvePhotoUrl === 'function') {
      try {
        const url = await resolvePhotoUrl(path);
        if (url) img.src = url;
      } catch (e) { /* ignore */ }
    }
  }

  function _scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches('img[data-photo-path]')) { _hydrate(root); return; }
    const list = root.querySelectorAll && root.querySelectorAll('img[data-photo-path]');
    if (list) list.forEach(_hydrate);
  }

  // Hidrata todo lo que ya esté en el DOM al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _scan(document.body));
  } else {
    _scan(document.body);
  }

  // Escucha nuevos elementos
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) _scan(node);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
