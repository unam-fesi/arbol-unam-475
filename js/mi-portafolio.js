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
      .in('id', [...ids])
      .order('common_name');
    return trees || [];
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
      t.common_name || t.tree_code || `Árbol #${t.id}`,
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

    <div id="g-info" class="garden-tab-content active">${_renderGardenInfo(garden, aggStats)}</div>
    <div id="g-seguimiento" class="garden-tab-content" style="display:none;">${_renderGardenSeguimiento(treesInGarden, gardenVisits)}</div>
    <div id="g-registro" class="garden-tab-content" style="display:none;">${_renderGardenRegistro(garden, treesInGarden, gardenVisits)}</div>
    <div id="g-metas" class="garden-tab-content" style="display:none;">${_renderGardenMetas(garden, treesInGarden, aggStats)}</div>

    <div id="g-map-container" style="margin-top:2rem;border-radius:14px;overflow:hidden;height:400px;border:1px solid #d6d6d6;"></div>
  `;

  // Inicializar mapa con árboles del jardín + bounds
  setTimeout(() => _initGardenMap(garden, treesInGarden), 50);
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
// TAB: SEGUIMIENTO (visitas al jardín + tabla agregada de árboles)
// ============================================================================
function _renderGardenSeguimiento(trees, visits) {
  // ---- Sección 1: Visitas al jardín ----
  let visitsHtml;
  if (!visits || visits.length === 0) {
    visitsHtml = '<p style="color:#888;text-align:center;padding:1rem;">Aún no hay visitas registradas. Crea la primera en el tab "Nuevo Registro".</p>';
  } else {
    const visitRows = visits.slice(0, 10).map(v => {
      const score = v.health_score;
      const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
      const dt = new Date(v.visit_date).toLocaleDateString();
      const acts = (v.activities || []).map(a => {
        const act = GARDEN_ACTIVITIES.find(x => x.id === a);
        return act ? act.icon + ' ' + act.label : a;
      }).slice(0, 3).join(' · ');
      const moreActs = (v.activities || []).length > 3 ? ` +${(v.activities || []).length - 3}` : '';
      return `
        <div style="display:flex;gap:0.7rem;padding:0.7rem;border-bottom:1px solid #f0f0f0;align-items:center;">
          ${v.photo_url ? `<img src="${escapeHtml(v.photo_url)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.display='none'">` : '<div style="width:48px;height:48px;background:#eee;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#999;">📷</div>'}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
              <strong style="color:#0d2d5c;font-size:0.88rem;">
                ${v.visit_type === 'primer_registro' ? '🌟 Primer registro' : 'Visita'}
              </strong>
              ${score != null ? `<span style="background:${color};color:#fff;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">${score}/100</span>` : ''}
            </div>
            <div style="color:#666;font-size:0.78rem;margin-top:2px;">${escapeHtml(acts || '—')}${moreActs}</div>
            <div style="color:#999;font-size:0.7rem;margin-top:2px;">${dt}</div>
          </div>
        </div>`;
    }).join('');
    visitsHtml = `<div style="max-height:380px;overflow-y:auto;">${visitRows}</div>`;
  }

  // ---- Sección 2: Tabla de árboles (si hay) ----
  let treesHtml = '';
  if (trees && trees.length > 0) {

    const rows = trees.map(t => {
      const score = t.health_score;
      const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
      const scoreText = score != null ? `${score}/100` : 's/d';
      const lastDate = t.last_measurement?.measurement_date
        ? new Date(t.last_measurement.measurement_date).toLocaleDateString()
        : 'Nunca';
      return `
        <tr>
          <td style="padding:0.7rem 0.5rem;font-weight:500;">
            ${escapeHtml(t.common_name || 'Árbol')}
            ${t.tree_code ? `<span style="color:#999;font-size:0.7rem;font-family:ui-monospace,monospace;margin-left:0.4rem;">${escapeHtml(t.tree_code)}</span>` : ''}
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
    <div class="card" style="padding:1.2rem;">
      <h4 style="margin:0 0 1rem;color:#1a4480;"><i class="fas fa-clipboard-list"></i> Visitas al jardín</h4>
      ${visitsHtml}
    </div>
    ${treesHtml}
  `;
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
          <div style="font-weight:600;color:#1b5e20;">${escapeHtml(t.common_name || 'Árbol')}</div>
          ${t.species ? `<div style="color:#666;font-size:0.78rem;font-style:italic;">${escapeHtml(t.species)}</div>` : ''}
          ${t.tree_code ? `<div style="color:#999;font-size:0.7rem;font-family:ui-monospace,monospace;margin-top:2px;">${escapeHtml(t.tree_code)}</div>` : ''}
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
  // Estado del jardín
  const pctSano = stats.total > 0 ? Math.round((stats.sano / stats.total) * 100) : 0;
  const pctConDato = stats.total > 0 ? Math.round(((stats.total - stats.sinDato) / stats.total) * 100) : 0;

  const metaSano = pctSano >= 70;
  const metaCobertura = pctConDato >= 80;

  // Mi contribución (mediciones del usuario actual en árboles de este jardín)
  // Esto se calcula con un fetch async — placeholder por ahora, luego lo lleno
  const myContribId = 'g-my-contrib-' + garden.id;

  setTimeout(() => _loadMyContribution(garden.id, trees.map(t => t.id), myContribId), 100);

  const stateBox = (label, current, target, isMet, suffix) => `
    <div class="card" style="padding:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.6rem;">
        <div>
          <div style="font-size:0.78rem;color:#666;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
          <div style="font-size:1.6rem;font-weight:700;color:${isMet ? '#2E7D32' : '#666'};margin-top:0.2rem;">${current}${suffix || ''}</div>
        </div>
        <div style="font-size:1.3rem;">${isMet ? '✅' : '🎯'}</div>
      </div>
      <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden;">
        <div style="background:${isMet ? '#4CAF50' : '#90CAF9'};height:100%;width:${Math.min(100, (parseInt(current) / target) * 100)}%;transition:width 0.3s;"></div>
      </div>
      <div style="font-size:0.72rem;color:#888;margin-top:0.4rem;">Meta: ${target}${suffix || ''}</div>
    </div>`;

  return `
    <div style="margin-bottom:1.5rem;">
      <h4 style="margin:0 0 1rem;color:#1a4480;"><i class="fas fa-globe"></i> Estado del jardín</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;">
        ${stateBox('Árboles sanos', pctSano, 70, metaSano, '%')}
        ${stateBox('Cobertura de seguimiento', pctConDato, 80, metaCobertura, '%')}
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

async function _loadMyContribution(gardenId, treeIds, containerId) {
  const el = document.getElementById(containerId);
  if (!el || treeIds.length === 0) return;
  try {
    const { data: myMeas, error } = await sb
      .from('tree_measurements')
      .select('id, tree_id, measurement_date')
      .in('tree_id', treeIds)
      .eq('user_id', currentUser.id)
      .order('measurement_date', { ascending: false });
    if (error) throw error;

    const total = (myMeas || []).length;
    const lastDate = myMeas?.[0]?.measurement_date
      ? new Date(myMeas[0].measurement_date).toLocaleDateString()
      : '—';

    // Mediciones del último mes
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const lastMonth = (myMeas || []).filter(m => new Date(m.measurement_date) >= oneMonthAgo).length;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;text-align:center;">
        <div>
          <div style="font-size:2rem;font-weight:700;color:#2E7D32;">${total}</div>
          <div style="font-size:0.78rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Seguimientos totales</div>
        </div>
        <div>
          <div style="font-size:2rem;font-weight:700;color:#1976D2;">${lastMonth}</div>
          <div style="font-size:0.78rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Este mes</div>
        </div>
        <div>
          <div style="font-size:1.1rem;font-weight:600;color:#333;margin-top:0.5rem;">${lastDate}</div>
          <div style="font-size:0.78rem;color:#666;text-transform:uppercase;letter-spacing:0.04em;margin-top:0.2rem;">Último</div>
        </div>
      </div>
      ${total === 0 ? '<p style="text-align:center;color:#888;margin-top:1rem;font-size:0.85rem;">Aún no has hecho seguimientos en este jardín. Ve a "Nuevo Registro" y elige un árbol para empezar.</p>' : ''}
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
      .bindPopup(`<strong>${escapeHtml(t.common_name || 'Árbol')}</strong><br>
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

    // Subir foto al bucket tree-photos con prefijo gardens/
    const visitId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `gardens/${gardenId}/${visitId}.${ext}`;
    const { error: upErr } = await sb.storage.from('tree-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from('tree-photos').createSignedUrl
      ? await sb.storage.from('tree-photos').createSignedUrl(path, 60 * 60 * 24 * 7)
      : { data: { signedUrl: path } };
    const photoUrl = urlData?.signedUrl || path;

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
