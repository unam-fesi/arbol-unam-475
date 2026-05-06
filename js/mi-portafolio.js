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
  if (entity.type === 'tree') return _myTreeRecords.some(t => t.id === entity.id);
  if (entity.type === 'garden') return _myGardenRecords.some(g => g.id === entity.id);
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
    return `
      <button onclick="selectPortfolioEntity('${type}', ${id})"
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
      _activeEntity?.type === 'tree' && _activeEntity.id === t.id)
  ).join('');

  const gardenChips = _myGardenRecords.map(g =>
    chip('garden', g.id,
      g.name || `Jardín #${g.id}`,
      '🌿',
      _activeEntity?.type === 'garden' && _activeEntity.id === g.id)
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
}

// ============================================================================
// SWITCH — el usuario seleccionó una entidad
// ============================================================================
function selectPortfolioEntity(type, id) {
  _activeEntity = { type, id: parseInt(id, 10) };
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

  const garden = _myGardenRecords.find(g => g.id === gardenId);
  if (!garden) {
    container.innerHTML = '<p style="padding:2rem;text-align:center;">Jardín no encontrado.</p>';
    return;
  }

  // Loading state
  container.innerHTML = `
    <div style="text-align:center;padding:2rem;color:#666;">
      <i class="fas fa-spinner fa-spin"></i> Cargando jardín…
    </div>`;

  // Cargar árboles del jardín + sus mediciones más recientes
  const treesInGarden = await _fetchTreesInGarden(gardenId);
  const aggStats = _computeGardenStats(treesInGarden);

  // Render shell con tabs
  container.innerHTML = `
    <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm garden-tab active" data-tab="g-info" onclick="switchGardenTab('g-info')"><i class="fas fa-leaf"></i> Info</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-seguimiento" onclick="switchGardenTab('g-seguimiento')"><i class="fas fa-chart-line"></i> Seguimiento (${treesInGarden.length})</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-registro" onclick="switchGardenTab('g-registro')"><i class="fas fa-plus-circle"></i> Nuevo Registro</button>
      <button class="btn btn-outline btn-sm garden-tab" data-tab="g-metas" onclick="switchGardenTab('g-metas')"><i class="fas fa-bullseye"></i> Metas</button>
    </div>

    <div id="g-info" class="garden-tab-content active">${_renderGardenInfo(garden, aggStats)}</div>
    <div id="g-seguimiento" class="garden-tab-content" style="display:none;">${_renderGardenSeguimiento(treesInGarden)}</div>
    <div id="g-registro" class="garden-tab-content" style="display:none;">${_renderGardenRegistro(treesInGarden)}</div>
    <div id="g-metas" class="garden-tab-content" style="display:none;">${_renderGardenMetas(garden, treesInGarden, aggStats)}</div>

    <div id="g-map-container" style="margin-top:2rem;border-radius:14px;overflow:hidden;height:400px;border:1px solid #d6d6d6;"></div>
  `;

  // Inicializar mapa con árboles del jardín + bounds
  setTimeout(() => _initGardenMap(garden, treesInGarden), 50);
}

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

function _computeGardenStats(trees) {
  const total = trees.length;
  const withHealth = trees.filter(t => t.health_score != null);
  const avgHealth = withHealth.length > 0
    ? withHealth.reduce((s, t) => s + t.health_score, 0) / withHealth.length
    : null;
  const sano = trees.filter(t => t.health_score >= 70).length;
  const medio = trees.filter(t => t.health_score >= 40 && t.health_score < 70).length;
  const malo = trees.filter(t => t.health_score < 40 && t.health_score != null).length;
  const sinDato = trees.filter(t => t.health_score == null).length;
  return { total, avgHealth, sano, medio, malo, sinDato };
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

  const avgHealth = stats.avgHealth != null ? stats.avgHealth.toFixed(0) : '—';
  const avgColor = stats.avgHealth >= 70 ? '#4CAF50' : stats.avgHealth >= 40 ? '#FFA726' : stats.avgHealth != null ? '#EF5350' : '#9e9e9e';

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
          <div style="color:#888;font-size:0.85rem;margin-top:0.3rem;">Salud promedio del jardín</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem;text-align:center;font-size:0.75rem;margin-top:1rem;">
          <div style="background:rgba(76,175,80,0.12);padding:0.5rem 0.3rem;border-radius:8px;">
            <div style="font-weight:700;color:#2E7D32;">${stats.sano}</div>
            <div style="color:#666;">sanos</div>
          </div>
          <div style="background:rgba(255,167,38,0.12);padding:0.5rem 0.3rem;border-radius:8px;">
            <div style="font-weight:700;color:#E65100;">${stats.medio}</div>
            <div style="color:#666;">atención</div>
          </div>
          <div style="background:rgba(239,83,80,0.12);padding:0.5rem 0.3rem;border-radius:8px;">
            <div style="font-weight:700;color:#C62828;">${stats.malo}</div>
            <div style="color:#666;">críticos</div>
          </div>
          <div style="background:#f0f0f0;padding:0.5rem 0.3rem;border-radius:8px;">
            <div style="font-weight:700;color:#666;">${stats.sinDato}</div>
            <div style="color:#888;">sin dato</div>
          </div>
        </div>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #f0f0f0;text-align:center;color:#666;font-size:0.85rem;">
          <strong>${stats.total}</strong> árbol${stats.total !== 1 ? 'es' : ''} en este jardín
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
// TAB: SEGUIMIENTO (tabla agregada de árboles del jardín)
// ============================================================================
function _renderGardenSeguimiento(trees) {
  if (trees.length === 0) {
    return '<div class="card" style="padding:2rem;text-align:center;color:#888;">Este jardín aún no tiene árboles registrados.</div>';
  }

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

  return `
    <div class="card" style="padding:1.2rem;">
      <h4 style="margin:0 0 1rem;color:#1a4480;"><i class="fas fa-clipboard-list"></i> Estado de los árboles del jardín</h4>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead>
            <tr style="border-bottom:2px solid #ddd;text-align:left;">
              <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Árbol</th>
              <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Especie</th>
              <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Salud</th>
              <th style="padding:0.5rem;color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Último seguimiento</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================================
// TAB: NUEVO REGISTRO (lista clickeable de árboles del jardín)
// ============================================================================
function _renderGardenRegistro(trees) {
  if (trees.length === 0) {
    return '<div class="card" style="padding:2rem;text-align:center;color:#888;">No hay árboles en este jardín para registrar.</div>';
  }

  const cards = trees.map(t => {
    const score = t.health_score;
    const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
    return `
      <div onclick="selectPortfolioEntity('tree', ${t.id})"
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
    <div class="card" style="padding:1.2rem;">
      <h4 style="margin:0 0 0.4rem;color:#1a4480;"><i class="fas fa-tree"></i> Selecciona un árbol para registrar</h4>
      <p style="color:#666;font-size:0.85rem;margin:0 0 1rem;">Toca un árbol para abrir su formulario de seguimiento.</p>
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
        <a href="#" onclick="selectPortfolioEntity('tree', ${t.id});return false;">Ver detalle</a>`);
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
// EXPORTS
// ============================================================================
window.loadMyPortfolio = loadMyPortfolio;
window.selectPortfolioEntity = selectPortfolioEntity;
window.renderGardenView = renderGardenView;
window.switchGardenTab = switchGardenTab;
