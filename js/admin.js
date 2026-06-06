// ============================================================================
// ADMIN - Dashboard, Users, Trees, Gardens, Groups, Notifications, Assignments
// ============================================================================

// ============================================================================
// ROLE HELPERS — admin / admin-campus / specialist / responsable / user
// ============================================================================
function _userRole() {
  return (currentUserProfile && currentUserProfile.role) || 'user';
}
function _userCampus() {
  return (currentUserProfile && currentUserProfile.campus) || 'Iztacala';
}
function isAdminRole()         { return _userRole() === 'admin'; }
function isAdminCampusRole()   { return _userRole() === 'admin-campus'; }
function isResponsableRole()   { return _userRole() === 'responsable'; }
function isSpecialistRole()    { return _userRole() === 'specialist'; }
/** Rol especial del Rector UNAM: ve TODO en admin pero solo-lectura,
 *  con excepción de SU árbol asignado donde sí edita.
 *  Mantiene PUM-AI y exportar reportes. */
function isRectoriaRole()      { return _userRole() === 'rectoria'; }

// admin, admin-campus y responsable pueden entrar al panel admin.
// rectoria también entra pero en modo read-only (el CSS body.role-rectoria
// esconde los botones de mutación; la lógica de edición permite solo SU árbol).
function canAccessAdminPanel() {
  return isAdminRole() || isAdminCampusRole() || isResponsableRole() || isRectoriaRole();
}
/** True si el rol puede MUTAR datos en el panel admin (crear/editar/borrar). */
function canMutateAdmin() {
  return isAdminRole() || isAdminCampusRole() || isResponsableRole();
  // rectoria: NO. Tiene su edición específica solo en su árbol.
}
// Solo el admin PRINCIPAL puede gestionar jardines, configuración global y auditoría completa.
function canManageGardens()    { return isAdminRole(); }
function canManageGlobalConfig() { return isAdminRole(); }
function canSeeAllAuditLogs()  { return isAdminRole(); }

// Filtro de campus: el admin principal tiene su propio dropdown ("Todos" o uno específico).
// admin-campus y responsable están FIJOS a su campus (no pueden cambiar).
// `_globalCampusFilter` solo lo usa el admin principal.
let _globalCampusFilter = ''; // '' = todos los campus
function effectiveCampusFilter() {
  // admin y rectoria pueden ver TODOS los campus (rectoria solo en read-only).
  // Ambos respetan el dropdown global para filtrar.
  if (isAdminRole() || isRectoriaRole()) return _globalCampusFilter || '';
  return _userCampus();                                   // demás roles: su campus
}
window._userRole = _userRole;
window._userCampus = _userCampus;
window.isAdminRole = isAdminRole;
window.isAdminCampusRole = isAdminCampusRole;
window.isResponsableRole = isResponsableRole;
window.isRectoriaRole = isRectoriaRole;
window.canAccessAdminPanel = canAccessAdminPanel;
window.canMutateAdmin = canMutateAdmin;
window.effectiveCampusFilter = effectiveCampusFilter;

// ── Aplicar la clase body.role-rectoria al cargar el perfil ──
// El CSS (forest-theme.css §rectoria-readonly) usa esta clase para esconder
// botones de creación/edición/borrado en todo el admin.
function applyRoleBodyClass() {
  document.body.classList.toggle('role-rectoria', isRectoriaRole());
  document.body.classList.toggle('role-admin', isAdminRole());
  document.body.classList.toggle('role-admin-campus', isAdminCampusRole());
  document.body.classList.toggle('role-responsable', isResponsableRole());

  // DEFENSE IN DEPTH para rectoria:
  // Garantizar que los nav-link de "Mi Árbol" y "Admin" estén SIEMPRE visibles.
  // setupRoleBasedNav() ya los habilita, pero si algún flujo posterior los
  // hubiera ocultado por mistake, aquí los restauramos. No tocamos otros
  // links — Mi Árbol e Info son visibles para todos por default.
  if (isRectoriaRole()) {
    document.querySelectorAll('#navbarNav .nav-link[data-section="section-admin"], #navbarNav .nav-link[data-section="section-mi-arbol"]').forEach(el => {
      if (el.style.display === 'none') el.style.display = '';
    });
  }
}
window.applyRoleBodyClass = applyRoleBodyClass;

// ---- TAB SWITCHING ----
// Tabs restringidas para admin-campus:
//   - 'gardens'  → solo admin principal (no admin-campus)
//   - 'audit'    → solo admin principal
//   - 'kpis'     → solo admin principal
const TABS_ADMIN_ONLY = new Set(['gardens', 'audit', 'kpis', 'security', 'quotas']);

// Mapeo: cada tab pertenece a un grupo (gestión, monitoreo, comunicación, seguridad)
const TAB_GROUP = {
  users: 'gestion', trees: 'gestion', gardens: 'gestion', groups: 'gestion',
  assignments: 'gestion', coordinacion: 'gestion',
  dashboard: 'monitoreo', kpis: 'monitoreo',
  notifications: 'comunicacion', reports: 'comunicacion',
  audit: 'seguridad', security: 'seguridad', quotas: 'seguridad',
};

// Para rectoría: NUNCA ve ninguna tab del grupo "gestion".
// Las demás (monitoreo, comunicación, seguridad) las ve en modo read-only.
const TABS_HIDDEN_FOR_RECTORIA = new Set(
  Object.entries(TAB_GROUP).filter(([_, g]) => g === 'gestion').map(([t]) => t)
);

// Cambia el GRUPO de tabs visibles (Gestión / Monitoreo / Comunicación / Seguridad)
function switchAdminGroup(groupName) {
  // SEGURIDAD: 'seguridad' SOLO admin principal. 'monitoreo' admin global y
  // admin-campus (este último viendo solo su campus — effectiveCampusFilter
  // ya lo fuerza). Las tabs internas más restrictivas (kpis, security,
  // quotas, audit) están en TABS_ADMIN_ONLY y se filtran en switchAdminTab.
  // Rectoría puede entrar a TODOS los grupos en modo read-only — los botones
  // de edición ya están bloqueados por el CSS body.role-rectoria.
  if (groupName === 'seguridad' && !(isAdminRole() || isRectoriaRole())) {
    showToast('Acceso denegado: solo administrador principal', 'error');
    return;
  }
  if (groupName === 'monitoreo' && !(isAdminRole() || isAdminCampusRole() || isRectoriaRole())) {
    showToast('Acceso denegado: solo admin / admin-campus', 'error');
    return;
  }
  // Actualizar estilo de los botones de grupo
  document.querySelectorAll('.admin-tab-group').forEach(btn => {
    const isActive = btn.dataset.group === groupName;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? '#fff' : 'transparent';
    btn.style.color = isActive ? '#333' : '#666';
    btn.style.boxShadow = isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none';
  });
  // Mostrar solo la fila de subtabs del grupo activo
  document.querySelectorAll('[id^="admin-subtabs-"]').forEach(el => {
    el.style.display = el.id === `admin-subtabs-${groupName}` ? '' : 'none';
  });
  // Auto-seleccionar la primera tab visible del grupo (que no esté oculta por rol)
  const firstTab = document.querySelector(`#admin-subtabs-${groupName} .admin-tab:not([style*="display: none"])`);
  if (firstTab) {
    const tabName = firstTab.dataset.tab;
    if (tabName) switchAdminTab(tabName);
  }
}
window.switchAdminGroup = switchAdminGroup;

function switchAdminTab(tabName) {
  // admin principal Y admin-campus pueden entrar al panel
  if (!canAccessAdminPanel()) {
    showToast('Acceso denegado: solo administradores', 'error');
    showSection('section-mi-arbol');
    return;
  }
  // Bloquear tabs que solo admin principal puede ver.
  // Rectoría también las puede ver (en read-only — el CSS body.role-rectoria
  // se encarga de ocultar botones de creación/edición/borrado).
  if (TABS_ADMIN_ONLY.has(tabName) && !(isAdminRole() || isRectoriaRole())) {
    showToast('Esta sección solo está disponible para el admin principal', 'warning');
    return;
  }
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });
  const content = document.getElementById(`${tabName}Tab`);
  if (content) {
    content.style.display = 'block';
    content.classList.add('active');
    if (tabName === 'users') loadAdminUsers();
    else if (tabName === 'trees') loadAdminTrees();
    else if (tabName === 'gardens') loadAdminGardens();
    else if (tabName === 'groups') loadAdminGroups();
    else if (tabName === 'coordinacion') loadCoordinacion();
    else if (tabName === 'notifications') loadAdminNotifications();
    else if (tabName === 'assignments') loadAssignments();
    else if (tabName === 'dashboard') { loadAdminDashboard(true); loadWeatherWidget(); }
    else if (tabName === 'reports') loadCitizenReports();
    else if (tabName === 'audit') loadAuditLog();
    else if (tabName === 'kpis') loadKpis();
    else if (tabName === 'security') loadSecurityDashboard();
    else if (tabName === 'quotas') loadQuotasDashboard();
    else if (tabName === 'logs') loadAppLogs();
  }
  // Tabs que son SIEMPRE globales (no filtran por campus) → esconder el dropdown del filter
  // El dropdown lo ven admin global Y RECTORÍA (que necesita ver todos los campus).
  // admin-campus tiene su campus fijo (lo dice el banner).
  const globalTabs = new Set(['kpis', 'security', 'quotas', 'audit']);
  const campusFilterWrap = document.getElementById('admin-campus-filter-wrap')
                        || document.getElementById('admin-campus-filter')?.parentElement;
  if (campusFilterWrap) {
    if (!(isAdminRole() || isRectoriaRole())) {
      campusFilterWrap.style.display = 'none';
    } else {
      campusFilterWrap.style.display = globalTabs.has(tabName) ? 'none' : 'flex';
    }
  }
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) tab.classList.add('active');
  });
  // Asegurar que el grupo de la tab esté visible (por si se navegó directo a una tab)
  const group = TAB_GROUP[tabName];
  if (group) {
    document.querySelectorAll('.admin-tab-group').forEach(btn => {
      const isActive = btn.dataset.group === group;
      btn.classList.toggle('active', isActive);
      btn.style.background = isActive ? '#fff' : 'transparent';
      btn.style.color = isActive ? '#333' : '#666';
      btn.style.boxShadow = isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none';
    });
    document.querySelectorAll('[id^="admin-subtabs-"]').forEach(el => {
      el.style.display = el.id === `admin-subtabs-${group}` ? '' : 'none';
    });
  }
}

// ============================================================================
// CAMPUS THEMES — tinte de color del panel admin según el campus activo
// para que el usuario vea inmediatamente en cuál está parado.
// ============================================================================
const CAMPUS_THEMES = {
  'Iztacala':   { color: '#d4a574', name: 'durazno' },
  'Acatlan':    { color: '#95b86c', name: 'verde hoja' },
  'Aragon':     { color: '#5b8b7d', name: 'azul-verde' },
  'Cuautitlan1':{ color: '#a08260', name: 'marrón medio' },
  'Cuautitlan': { color: '#8b6f47', name: 'marrón claro' },
  'Zaragoza':   { color: '#b54f3a', name: 'terracota' },
  'CU':         { color: '#4a7c2a', name: 'verde primario' },
};

function _applyCampusTheme() {
  // Para admin principal sin filtro → durazno (Iztacala default).
  // Para admin principal CON filtro → el color del campus filtrado.
  // Para admin-campus / responsable → siempre el color de SU campus.
  let cf = effectiveCampusFilter();
  if (!cf && (isAdminCampusRole() || isResponsableRole())) cf = _userCampus();
  if (!cf) cf = 'Iztacala';
  const theme = CAMPUS_THEMES[cf] || CAMPUS_THEMES['Iztacala'];

  const panel = document.querySelector('.admin-panel');
  if (panel) {
    // Gradiente sutil que tinta el panel sin dominar la lectura
    panel.style.background = `linear-gradient(135deg, ${theme.color}33, ${theme.color}11 40%, rgba(255,253,247,0.85) 70%)`;
    panel.style.borderLeft = `6px solid ${theme.color}`;
    panel.style.transition = 'background 0.4s ease, border-color 0.4s ease';
  }

  // También colorear el banner del campus (cuando es admin-campus/responsable)
  const banner = document.getElementById('admin-campus-banner');
  if (banner && banner.style.display !== 'none') {
    banner.style.background = `${theme.color}1f`;
    banner.style.borderColor = `${theme.color}66`;
    banner.style.color = theme.color;
  }
}
window._applyCampusTheme = _applyCampusTheme;

// Aplicar restricciones UI según rol cuando se monta el panel admin
function applyRoleBasedUIRestrictions() {
  // PASO 0 — RESETEAR todas las tabs y grupos a visibles
  document.querySelectorAll('.admin-tab').forEach(t => { t.style.display = ''; });
  document.querySelectorAll('.admin-tab-group').forEach(t => { t.style.display = ''; });

  // SEGURIDAD por GRUPO:
  //   - "seguridad" : admin principal + RECTORIA (solo lectura, vía CSS body.role-rectoria)
  //   - "monitoreo" : admin principal + admin-campus + RECTORIA (esta última solo lectura)
  //   - Responsable : ni monitoreo ni seguridad
  // Rectoría ve TODO en modo read-only; los botones de
  // crear/editar/borrar se ocultan por el bloque CSS body.role-rectoria.
  const showMonitoreo = isAdminRole() || isAdminCampusRole() || isRectoriaRole();
  const showSeguridad = isAdminRole() || isRectoriaRole();
  document.querySelectorAll('.admin-tab-group').forEach(btn => {
    const g = btn.dataset.group;
    if (g === 'seguridad' && !showSeguridad) btn.style.display = 'none';
    if (g === 'monitoreo' && !showMonitoreo) btn.style.display = 'none';
  });
  const monRow = document.getElementById('admin-subtabs-monitoreo');
  const segRow = document.getElementById('admin-subtabs-seguridad');
  if (segRow && !showSeguridad) segRow.style.display = 'none';
  if (monRow && !showMonitoreo) monRow.style.display = 'none';

  // Ocultar tabs prohibidas para admin-campus
  if (isAdminCampusRole()) {
    document.querySelectorAll('.admin-tab').forEach(t => {
      if (TABS_ADMIN_ONLY.has(t.dataset.tab)) {
        t.style.display = 'none';
      }
    });
  }
  // RECTORÍA: NO ve ninguna tab del grupo "gestion" (usuarios, árboles,
  // grupos, asignaciones, jardines, coordinación). Sí ve Monitoreo,
  // Comunicación y Seguridad — todos en read-only por CSS body.role-rectoria.
  // El botón de grupo "Gestión" en sí también se oculta porque no quedan tabs.
  if (isRectoriaRole()) {
    document.querySelectorAll('.admin-tab').forEach(t => {
      if (TABS_HIDDEN_FOR_RECTORIA.has(t.dataset.tab)) {
        t.style.display = 'none';
      }
    });
    document.querySelectorAll('.admin-tab-group').forEach(btn => {
      if (btn.dataset.group === 'gestion') btn.style.display = 'none';
    });
    const gestRow = document.getElementById('admin-subtabs-gestion');
    if (gestRow) gestRow.style.display = 'none';
    // Forzar landing en una tab visible (monitoreo > dashboard) si estaba en una de gestion
    setTimeout(() => {
      const active = document.querySelector('.admin-tab.active');
      if (active && TABS_HIDDEN_FOR_RECTORIA.has(active.dataset.tab)) {
        if (typeof switchAdminGroup === 'function') switchAdminGroup('monitoreo');
        else if (typeof switchAdminTab === 'function') switchAdminTab('dashboard');
      }
    }, 100);
  }
  // El responsable solo ve la tab "Coordinación"
  if (isResponsableRole()) {
    document.querySelectorAll('.admin-tab').forEach(t => {
      if (t.dataset.tab !== 'coordinacion') {
        t.style.display = 'none';
      }
    });
    // Forzar landing en coordinacion si está en otra tab
    setTimeout(() => {
      const active = document.querySelector('.admin-tab.active');
      if (!active || active.dataset.tab !== 'coordinacion') {
        switchAdminTab('coordinacion');
      }
    }, 100);
  }
  // Mostrar/ocultar selector global de campus.
  // Admin y rectoría pueden filtrar entre TODOS los campus.
  const sel = document.getElementById('admin-campus-filter');
  if (sel) {
    sel.style.display = (isAdminRole() || isRectoriaRole()) ? 'flex' : 'none';
  }
  // Banner persistente para admin-campus mostrando su campus
  const banner = document.getElementById('admin-campus-banner');
  if (banner) {
    if (isAdminCampusRole() || isResponsableRole()) {
      banner.style.display = 'block';
      banner.innerHTML = `<i class="fas fa-map-marker-alt"></i> Tu vista está limitada al campus <strong>${escapeHtml(_userCampus())}</strong>`;
    } else {
      banner.style.display = 'none';
    }
  }

  // ---- Aplicar tinte de color del panel según campus activo ----
  _applyCampusTheme();

  // ---- Limitar dropdowns de campus en forms (usuarios y árboles) ----
  // admin-campus/responsable solo ven SU campus en los selects de creación.
  // admin principal ve todos los campus siempre.
  _applyCampusRestrictionsToForms();

  // ---- Esconder rol "admin principal" en form de creación de usuarios ----
  _applyRoleRestrictionsToUserForm();

  // ---- Esconder jardines fuera de Iztacala (jardines solo existen en Iztacala) ----
  _applyGardenVisibility();

  // ---- Actualizar título del tab "Campus 3D" según el campus activo ----
  _applyCampus3DTitle();
}

// Limita los <select> de campus de los forms a sólo el campus permitido para
// admin-campus/responsable. Para admin principal restaura todos los campus.
function _applyCampusRestrictionsToForms() {
  const ids = ['admin-user-campus', 'admin-tree-campus'];
  const restrict = isAdminCampusRole() || isResponsableRole();
  ids.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    Array.from(sel.options).forEach(opt => {
      if (restrict) {
        opt.hidden = (opt.value !== _userCampus());
        opt.disabled = (opt.value !== _userCampus());
      } else {
        opt.hidden = false;
        opt.disabled = false;
      }
    });
    if (restrict) {
      sel.value = _userCampus();
    }
  });
}

// Oculta la opción "admin" (admin principal) del form de creación de usuarios
// cuando el caller es admin-campus.
function _applyRoleRestrictionsToUserForm() {
  const roleSel = document.getElementById('admin-user-role');
  if (!roleSel) return;
  Array.from(roleSel.options).forEach(opt => {
    if (opt.value === 'admin') {
      // Solo el admin PRINCIPAL puede crear otros admins principales
      opt.hidden = !isAdminRole();
      opt.disabled = !isAdminRole();
    }
    if (opt.value === 'admin-campus') {
      // admin principal y admin-campus pueden crear admin-campus
      const allowed = isAdminRole() || isAdminCampusRole();
      opt.hidden = !allowed;
      opt.disabled = !allowed;
    }
  });
  // Si el valor actual es uno oculto, resetear a 'user'
  if (roleSel.selectedOptions[0]?.hidden) roleSel.value = 'user';
}

// Oculta el bloque "Asignar Jardín" + "Asignaciones de Jardines" + el form
// de creación de jardines + el dropdown de jardín en el form de árboles
// cuando el campus efectivo NO es Iztacala.
// (Los jardines solo existen en FES Iztacala por ahora.)
function _applyGardenVisibility() {
  const cf = effectiveCampusFilter();
  // Rectoría supervisa todo: siempre debe ver el módulo de jardines aunque
  // su campus efectivo no sea Iztacala (los jardines solo existen ahí pero
  // rectoría quiere poder revisarlos en read-only).
  const showGardens = !cf || cf === 'Iztacala' || isRectoriaRole();
  // Form de asignar jardín (en tab Asignaciones)
  const assignForm = document.getElementById('assign-garden-form-wrap');
  if (assignForm) assignForm.style.display = showGardens ? '' : 'none';
  // Tabla de asignaciones de jardín
  const assignTable = document.getElementById('garden-assignments-section');
  if (assignTable) assignTable.style.display = showGardens ? '' : 'none';
  // Tab "Jardines" en la barra de tabs admin (admin-campus YA está oculto por TABS_ADMIN_ONLY,
  // pero el admin principal también lo verá oculto si filtra a un campus != Iztacala)
  // Rectoría también debe ver el tab "Jardines" (read-only).
  const gardensTab = document.querySelector('.admin-tab[data-tab="gardens"]');
  if (gardensTab && (isAdminRole() || isRectoriaRole())) {
    gardensTab.style.display = showGardens ? '' : 'none';
  }
  // Dropdown "Jardín (opcional)" del form de alta de árbol — fuera de Iztacala no existen jardines
  const treeGardenWrap = document.getElementById('admin-tree-garden-wrap');
  if (treeGardenWrap) treeGardenWrap.style.display = showGardens ? '' : 'none';
  // Limpiar el valor para que no se envíe garden_id de un jardín de Iztacala
  const treeGardenSel = document.getElementById('admin-tree-garden');
  if (treeGardenSel && !showGardens) treeGardenSel.value = '';
}

// Actualiza el label del tab "FES Iztacala 3D" para reflejar el campus activo.
// Si campus = Acatlán → "FES Acatlán 3D"; si "Todos" → "FES Iztacala 3D" (default).
function _applyCampus3DTitle() {
  const tabBtn = document.querySelector('.vis-tab[data-vis="iztacala"]');
  if (!tabBtn) return;
  const cf = effectiveCampusFilter();
  const labelMap = {
    'Iztacala':  'FES Iztacala 3D',
    'Acatlan':   'FES Acatlán 3D',
    'Aragon':    'FES Aragón 3D',
    'Cuautitlan1':'FES Cuautitlán C1 3D',
    'Cuautitlan':'FES Cuautitlán C4 3D',
    'Zaragoza':  'FES Zaragoza 3D',
    'CU':        'CU 3D',
  };
  const label = labelMap[cf] || 'FES Iztacala 3D';
  tabBtn.innerHTML = `<i class="fas fa-university"></i> ${label}`;
}
window.applyRoleBasedUIRestrictions = applyRoleBasedUIRestrictions;

// Cambio del dropdown global de campus (solo admin principal)
function onAdminCampusFilterChange(value) {
  _globalCampusFilter = value || '';
  // Re-aplicar restricciones de UI (oculta jardines fuera de Iztacala, ajusta título 3D, tinte panel)
  if (typeof applyRoleBasedUIRestrictions === 'function') applyRoleBasedUIRestrictions();
  // Aplicar el tinte del campus inmediatamente (sin esperar el reload de la tab activa)
  if (typeof _applyCampusTheme === 'function') _applyCampusTheme();
  // Re-cargar lo que esté visible actualmente
  const activePane = document.querySelector('.tab-pane.active');
  if (!activePane) return;
  const id = activePane.id;
  if (id === 'usersTab') loadAdminUsers();
  else if (id === 'treesTab') loadAdminTrees();
  else if (id === 'gardensTab') loadAdminGardens();
  else if (id === 'groupsTab') loadAdminGroups();
  else if (id === 'notificationsTab') loadAdminNotifications();
  else if (id === 'assignmentsTab') loadAssignments();
  else if (id === 'dashboardTab') loadAdminDashboard(true);
  else if (id === 'reportsTab') loadCitizenReports();
  else if (id === 'auditTab') loadAuditLog();
}
window.onAdminCampusFilterChange = onAdminCampusFilterChange;

// ---- DASHBOARD ----
let dashboardLoaded = false;

async function loadAdminDashboard(forceReload) {
  if (dashboardLoaded && !forceReload) return;
  try {
    const campusFilter = effectiveCampusFilter();

    // Usuarios: filtramos por campus. Para mantener visibles a los admin principales
    // (que no tienen campus asignado) cuando hay filtro, los incluimos siempre.
    let userQ = sb.from('user_profiles').select('*', { count: 'exact', head: true });
    if (campusFilter) {
      // M-6: escapar el campusFilter antes de interpolar en el string de .or()
      // (aunque viene de dropdown controlado, defense in depth contra futuras
      // fuentes donde campusFilter sea text input del usuario).
      const safeCampus = validators.escapeOrFilter(campusFilter);
      userQ = userQ.or(`campus.eq.${safeCampus},role.eq.admin`);
    }
    const { count: userCount } = await userQ;

    // Árboles: filtrar por campus
    let treeQ = sb.from('trees_catalog').select('*', { count: 'exact', head: true });
    if (campusFilter) treeQ = treeQ.eq('campus', campusFilter);
    const { count: treeCount } = await treeQ;

    // Trees con detalle para calcular salud promedio
    let trQ = sb.from('trees_catalog').select('id, tree_code, common_name, species, health_score, status, campus, location_lat, location_lng, photo_url, initial_height_cm');
    if (campusFilter) trQ = trQ.eq('campus', campusFilter);
    const { data: trees } = await trQ;
    const treeList = trees || [];
    const avgHealth = treeList.length > 0
      ? Math.round(treeList.reduce((sum, t) => sum + (t.health_score || 0), 0) / treeList.length) : 0;

    // Asignaciones: tree_assignments NO tiene columna campus, hay que filtrar por
    // tree_id ∈ árboles del campus. Si no hay filtro, conteo global.
    let assignCount = 0;
    if (campusFilter) {
      const treeIds = treeList.map(t => t.id);
      if (treeIds.length > 0) {
        // Supabase tiene un límite ~1000 IDs en .in(), si excede se paginan
        const CHUNK = 500;
        for (let i = 0; i < treeIds.length; i += CHUNK) {
          const slice = treeIds.slice(i, i + CHUNK);
          const { count } = await sb.from('tree_assignments')
            .select('*', { count: 'exact', head: true })
            .in('tree_id', slice);
          assignCount += (count || 0);
        }
      }
    } else {
      const { count } = await sb.from('tree_assignments')
        .select('*', { count: 'exact', head: true });
      assignCount = count || 0;
    }

    const statsEl = document.getElementById('dashboard-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="card" style="text-align:center;"><div style="font-size:2rem;">👥</div><h3>${userCount || 0}</h3><p class="text-muted">Usuarios</p></div>
        <div class="card" style="text-align:center;"><div style="font-size:2rem;">🌳</div><h3>${treeCount || 0}</h3><p class="text-muted">Árboles</p></div>
        <div class="card" style="text-align:center;"><div style="font-size:2rem;">💚</div><h3>${avgHealth}%</h3><p class="text-muted">Salud Promedio</p></div>
        <div class="card" style="text-align:center;"><div style="font-size:2rem;">🔗</div><h3>${assignCount || 0}</h3><p class="text-muted">Asignaciones</p></div>
      `;
    }

    // Load recent assignments for dashboard (simple queries, no FK hints)
    const { data: recentAssign } = await sb.from('tree_assignments')
      .select('*')
      .order('assigned_at', { ascending: false }).limit(10);

    // Lookup names separately to avoid FK hint issues
    const allTreeIds = [...new Set((recentAssign || []).map(a => a.tree_id))];
    const allUserIds = [...new Set((recentAssign || []).filter(a => a.user_id).map(a => a.user_id))];
    const allGroupIds = [...new Set((recentAssign || []).filter(a => a.group_id).map(a => a.group_id))];

    let treeLookup = {}, userLookup = {}, groupLookup = {};
    if (allTreeIds.length > 0) {
      const { data: tData } = await sb.from('trees_catalog').select('id, tree_code, common_name').in('id', allTreeIds);
      (tData || []).forEach(t => { treeLookup[t.id] = t; });
    }
    if (allUserIds.length > 0) {
      const { data: uData } = await sb.from('user_profiles').select('id, full_name').in('id', allUserIds);
      (uData || []).forEach(u => { userLookup[u.id] = u; });
    }
    if (allGroupIds.length > 0) {
      const { data: gData } = await sb.from('user_groups').select('id, name').in('id', allGroupIds);
      (gData || []).forEach(g => { groupLookup[g.id] = g; });
    }

    const dashAssignEl = document.getElementById('dashboard-assignments');
    if (dashAssignEl) {
      let assignHtml = '<h4 style="margin-bottom:1rem;cursor:pointer;" onclick="switchAdminTab(\'assignments\')">🔗 Asignaciones Recientes <span style="font-size:0.8rem;color:var(--primary);">(ver todas →)</span></h4>';
      if (recentAssign && recentAssign.length > 0) {
        assignHtml += recentAssign.map(a => {
          const tree = treeLookup[a.tree_id] || {};
          const targetName = a.user_id ? ('👤 ' + escapeHtml(userLookup[a.user_id]?.full_name || 'Usuario')) : ('📂 ' + escapeHtml(groupLookup[a.group_id]?.name || 'Grupo'));
          return `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #eee;">
            <span>🌳 ${escapeHtml(tree.tree_code || '-')} (${escapeHtml(tree.common_name || '')})</span>
            <span>→ ${targetName}</span>
            <span class="text-muted text-small">${formatDate(a.assigned_at)}</span>
          </div>`;
        }).join('');
      } else {
        assignHtml += '<p class="text-muted" style="padding:1rem;">Sin asignaciones aún</p>';
      }
      dashAssignEl.innerHTML = assignHtml;
    }

    if (typeof Chart !== 'undefined') {
      Object.values(Chart.instances || {}).forEach(c => c.destroy());
    }
    if (treeList.length > 0) {
      const statusCounts = {};
      treeList.forEach(t => { statusCounts[t.status || 'healthy'] = (statusCounts[t.status || 'healthy'] || 0) + 1; });
      const healthCtx = document.getElementById('chart-health');
      if (healthCtx) {
        const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
        treeList.forEach(t => {
          const s = t.health_score || 0;
          if (s <= 20) buckets['0-20']++; else if (s <= 40) buckets['21-40']++; else if (s <= 60) buckets['41-60']++; else if (s <= 80) buckets['61-80']++; else buckets['81-100']++;
        });
        new Chart(healthCtx, { type: 'bar', data: { labels: Object.keys(buckets), datasets: [{ label: 'Salud', data: Object.values(buckets), backgroundColor: '#4CAF50' }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
      }
      const statusCtx = document.getElementById('chart-status');
      if (statusCtx) {
        new Chart(statusCtx, { type: 'doughnut', data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#4CAF50', '#FFC107', '#f44336', '#2196F3'] }] }, options: { responsive: true } });
      }
      const campusCounts = {};
      treeList.forEach(t => { campusCounts[t.campus || 'Sin campus'] = (campusCounts[t.campus || 'Sin campus'] || 0) + 1; });
      const campusCtx = document.getElementById('chart-campus');
      if (campusCtx) {
        new Chart(campusCtx, { type: 'bar', data: { labels: Object.keys(campusCounts), datasets: [{ label: 'Árboles', data: Object.values(campusCounts), backgroundColor: '#2196F3' }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
      }
    }
    // Load map with tree locations
    loadAdminMap(treeList);

    // Render Bosque UNAM (Opción C — visualización árbol orgánico)
    if (typeof renderDashboardTree === 'function') {
      renderDashboardTree(treeList);
    }

    dashboardLoaded = true;
    showToast('Dashboard cargado', 'success');
  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Error cargando dashboard: ' + err.message, 'error');
  }
}

let adminMapInstance = null;

function loadAdminMap(treeList) {
  const mapEl = document.getElementById('admin-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Destroy previous map instance
  if (adminMapInstance) {
    adminMapInstance.remove();
    adminMapInstance = null;
  }

  // Centro del Estado de México / zona FESI (Tlalnepantla)
  const defaultCenter = [19.5322, -99.1847];
  adminMapInstance = L.map('admin-map').setView(defaultCenter, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(adminMapInstance);

  // Fetch trees with coordinates from DB — filtrado por campus efectivo
  const _campusFilterMap = effectiveCampusFilter();
  let _mapQuery = sb.from('trees_catalog')
    .select('id, tree_code, common_name, species, location_lat, location_lng, health_score, status, campus')
    .not('location_lat', 'is', null)
    .not('location_lng', 'is', null);
  if (_campusFilterMap) _mapQuery = _mapQuery.eq('campus', _campusFilterMap);
  _mapQuery
    .then(({ data: geoTrees, error }) => {
      if (error || !geoTrees || geoTrees.length === 0) {
        // No trees with coordinates, show message
        L.popup()
          .setLatLng(defaultCenter)
          .setContent('<p>No hay árboles con coordenadas registradas aún.<br>Agrega ubicaciones desde el panel de árboles.</p>')
          .openOn(adminMapInstance);
        return;
      }

      const markers = [];
      geoTrees.forEach(t => {
        const healthColor = (t.health_score || 0) >= 70 ? '#4CAF50' : (t.health_score || 0) >= 40 ? '#FFC107' : '#f44336';
        const icon = L.divIcon({
          className: 'tree-marker',
          html: `<div style="background:${healthColor};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;">🌳</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const marker = L.marker([t.location_lat, t.location_lng], { icon })
          .addTo(adminMapInstance)
          .bindPopup(`
            <b>${escapeHtml(t.common_name || t.species || 'Árbol')}</b><br>
            Código: ${escapeHtml(t.tree_code || '-')}<br>
            Campus: ${escapeHtml(t.campus || '-')}<br>
            Salud: ${t.health_score || 0}%<br>
            Status: ${escapeHtml(t.status || '-')}
          `);
        markers.push(marker);
      });

      // Fit bounds to show all markers
      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        adminMapInstance.fitBounds(group.getBounds().pad(0.2));
      }
    });

  // Force map to recalculate size after render
  setTimeout(() => { adminMapInstance.invalidateSize(); }, 200);
}

// ---- USERS ----
let _usersCache = [];
async function loadAdminUsers() {
  try {
    let q = sb.from('user_profiles').select('*').order('full_name');
    const campusFilter = effectiveCampusFilter();
    if (campusFilter) q = q.eq('campus', campusFilter);
    const { data, error } = await q;
    if (error) throw error;
    _usersCache = data || [];
    _renderUsers(_usersCache);
  } catch (err) {
    showToast('Error cargando usuarios: ' + err.message, 'error');
  }
}

function _renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  users.forEach(user => {
    const row = document.createElement('tr');
    // data-label hace que el CSS mobile muestre cada celda como "Label: valor"
    row.innerHTML = `
      <td data-label="Nombre">${escapeHtml(user.full_name || '-')}</td>
      <td data-label="No. Cuenta">${escapeHtml(user.account_number || '-')}</td>
      <td data-label="Rol"><span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${user.role || 'user'}</span></td>
      <td data-label="Estatus"><span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${escapeHtml(user.academic_status || '-')}</span></td>
      <td data-label="Campus">${escapeHtml(user.campus || '-')}</td>
      <td data-label="Telegram">${user.telegram_chat_id ? '✅' : '❌'}</td>
      <td data-label="Acciones" style="white-space:nowrap;">
        <button class="btn btn-sm btn-secondary" onclick="editAdminUser('${user.id}')" title="Editar">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAdminUser('${user.id}','${safeJsAttr(user.full_name || user.email || '')}')" title="Borrar usuario">🗑️</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Normaliza un string de campus para comparación robusta: minúsculas, sin acentos,
// sin espacios extras. Acepta variantes como "FES Iztacala", " Iztacala ", "iztacala"
function _normCampus(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/^fes\s+/i, '')                              // "FES Iztacala" → "iztacala"
    .trim();
}

// ─── Sort genérico para tablas admin ───
// Estado por tabla. dir = 'asc' | 'desc' | null (null = sin orden, usa orden de origen).
const _adminSortState = {
  users: { field: null, dir: null },
  trees: { field: null, dir: null },
};

// Comparador robusto: strings case-insensitive sin acentos, numbers numéricos,
// booleans (true>false), null/undefined siempre al final.
function _sortCompare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;   // nulls al final
  if (b == null) return -1;
  // numérico
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // boolean
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a === b) ? 0 : a ? -1 : 1;
  // strings: lowercase + sin acentos
  const sa = String(a).toLocaleLowerCase('es-MX').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sb = String(b).toLocaleLowerCase('es-MX').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return sa.localeCompare(sb, 'es-MX', { numeric: true });
}

function _sortRows(rows, field, dir) {
  if (!field || !dir) return rows;
  const out = [...rows];
  out.sort((r1, r2) => {
    const cmp = _sortCompare(r1[field], r2[field]);
    return dir === 'desc' ? -cmp : cmp;
  });
  return out;
}

// Toggle: null → asc → desc → null
function _toggleSort(table, field) {
  const s = _adminSortState[table];
  if (!s) return;
  if (s.field !== field) { s.field = field; s.dir = 'asc'; }
  else if (s.dir === 'asc') { s.dir = 'desc'; }
  else if (s.dir === 'desc') { s.field = null; s.dir = null; }
  else { s.dir = 'asc'; }
}

// Actualiza el indicador visual ▲/▼ en los headers de la tabla.
// El styling (opacity / glow) lo maneja el CSS via [data-sort-active].
function _updateSortIndicators(tableSelector) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  const tableName = table.dataset.sortTable; // 'users' | 'trees'
  const s = _adminSortState[tableName];
  table.querySelectorAll('[data-sort-field]').forEach(el => {
    const f = el.dataset.sortField;
    const ind = el.querySelector('.sort-ind');
    if (!ind) return;
    if (s && s.field === f && s.dir) {
      ind.textContent = s.dir === 'asc' ? '▲' : '▼';
      el.setAttribute('data-sort-active', s.dir);
    } else {
      ind.textContent = '⇅';
      el.removeAttribute('data-sort-active');
    }
  });
}

// Click handler universal (HTML invoca esto desde onclick)
function _sortAdminTable(table, field) {
  _toggleSort(table, field);
  if (table === 'users') {
    _filterUsers();
    _updateSortIndicators('#users-table-body')?.closest?.('table');
    _updateSortIndicators('table[data-sort-table="users"]');
  } else if (table === 'trees') {
    _filterAdminTrees();
    _updateSortIndicators('table[data-sort-table="trees"]');
  }
}
window._sortAdminTable = _sortAdminTable;

function _filterUsers() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fName = get('u-name'), fAcc = get('u-acc'), fRole = get('u-role'),
        fStatus = get('u-status'), fCampus = get('u-campus'), fTg = get('u-tg');
  const fCampusN = _normCampus(fCampus);
  const filtered = _usersCache.filter(u => {
    if (fName && !(u.full_name || '').toLowerCase().includes(fName)) return false;
    if (fAcc && !(u.account_number || '').toLowerCase().includes(fAcc)) return false;
    if (fRole && (u.role || 'user').toLowerCase() !== fRole) return false;
    if (fStatus && (u.academic_status || '').toLowerCase() !== fStatus) return false;
    if (fCampusN && _normCampus(u.campus) !== fCampusN) return false;
    if (fTg === 'yes' && !u.telegram_chat_id) return false;
    if (fTg === 'no' && u.telegram_chat_id) return false;
    return true;
  });
  const { field, dir } = _adminSortState.users;
  // Para telegram, el "field" del objeto NO es booleano puro — lo convertimos al sortear
  const filteredSorted = (field === 'telegram')
    ? _sortRows(filtered.map(u => ({ ...u, telegram: !!u.telegram_chat_id })), field, dir)
    : _sortRows(filtered, field, dir);
  _renderUsers(filteredSorted);
  _updateSortIndicators('table[data-sort-table="users"]');
}
window._normCampus = _normCampus;

function _clearUsersFilters() {
  ['u-name','u-acc','u-role','u-status','u-campus','u-tg'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _adminSortState.users = { field: null, dir: null };
  _renderUsers(_usersCache);
  _updateSortIndicators('table[data-sort-table="users"]');
}

window._filterUsers = _filterUsers;
window._clearUsersFilters = _clearUsersFilters;

async function deleteAdminUser(userId, userName) {
  if (!confirm(`¿Borrar al usuario "${userName}"?\n\n⚠ Se eliminarán TAMBIÉN:\n• Sus asignaciones de árboles y jardines\n• Sus mediciones/seguimientos\n• Sus reportes\n• Su perfil completo\n• La cuenta de auth\n\nNo se puede recuperar.`)) return;

  try {
    // Toda la limpieza se hace en la Edge Function `delete-user`,
    // que invoca la función SQL `admin_delete_user_full` (atómica).
    // El JS no toca BD directo — así no hay limpieza dispersa que pueda
    // dejar huérfanos (como pasaba antes).
    const { data, error } = await sb.functions.invoke('delete-user', { body: { userId } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    showToast('Usuario eliminado', 'success');
    loadAdminUsers();
  } catch (err) {
    console.error('deleteAdminUser error:', err);
    showToast('Error al borrar usuario: ' + (err.message || err), 'error');
  }
}
window.deleteAdminUser = deleteAdminUser;

// Handler para el dropdown de rol en el modal de EDITAR usuario.
// Refleja la misma lógica que toggleSpecialistFields() del form de CREAR:
// - muestra/oculta el bloque de especialista
// - deshabilita campus + fija 'CU' + muestra hint cuando role=rectoria
function _editUserRoleChanged(sel) {
  const role = sel.value;
  const specBlock = document.getElementById('edit-spec-fields');
  if (specBlock) specBlock.style.display = role === 'specialist' ? 'block' : 'none';
  const campusSel = document.getElementById('edit-user-campus');
  const hint = document.getElementById('edit-user-campus-hint');
  if (campusSel) {
    if (role === 'rectoria') {
      campusSel.value = 'CU';
      campusSel.disabled = true;
      if (hint) hint.style.display = 'inline';
    } else {
      // Solo re-habilitar si el caller es admin principal (admin-campus no puede tocarlo)
      const callerIsAdminPrincipal = isAdminRole();
      campusSel.disabled = !callerIsAdminPrincipal;
      if (hint) hint.style.display = 'none';
    }
  }
}
window._editUserRoleChanged = _editUserRoleChanged;

function toggleSpecialistFields() {
  const role = document.getElementById('admin-user-role')?.value;
  const block = document.getElementById('specialist-fields');
  if (block) block.style.display = role === 'specialist' ? 'block' : 'none';

  // Rectoría supervisa TODOS los campus → el campo "campus" no aplica.
  // Lo deshabilitamos y forzamos a 'CU' (Ciudad Universitaria) como valor
  // institucional por convención. Para otros roles se restaura selectable.
  const campusSel = document.getElementById('admin-user-campus');
  const campusGroup = campusSel?.closest('.form-group');
  if (campusSel) {
    if (role === 'rectoria') {
      campusSel.value = 'CU';
      campusSel.disabled = true;
      campusSel.title = 'Rectoría no pertenece a un campus específico — fijado en CU institucional';
      if (campusGroup && !campusGroup.querySelector('.campus-rectoria-hint')) {
        const hint = document.createElement('small');
        hint.className = 'campus-rectoria-hint';
        hint.style.cssText = 'display:block;color:#777;font-size:0.75rem;margin-top:3px;';
        hint.innerHTML = '<i class="fas fa-info-circle"></i> Rectoría supervisa todos los campus.';
        campusGroup.appendChild(hint);
      }
    } else {
      campusSel.disabled = false;
      campusSel.title = '';
      const hint = campusGroup?.querySelector('.campus-rectoria-hint');
      if (hint) hint.remove();
    }
  }
}

async function saveAdminUser(e) {
  if (e) e.preventDefault();
  // M-6: validar y limpiar todos los inputs antes de tocar BD.
  const vNombre = validators.text(document.getElementById('admin-user-nombre')?.value, {
    min: 2, max: 200, label: 'Nombre',
    pattern: /^[\p{L}\p{N}\s\-'.,()ñÑáéíóúÁÉÍÓÚüÜ]+$/u,
    required: true
  });
  if (!vNombre.ok) { showToast(vNombre.error, 'error'); return; }
  const nombre = vNombre.value;

  const vCorreo = validators.email(document.getElementById('admin-user-correo')?.value, { required: true });
  if (!vCorreo.ok) { showToast(vCorreo.error, 'error'); return; }
  const correo = vCorreo.value;

  const password = (document.getElementById('admin-user-password')?.value || '').trim();
  if (password.length > 200) { showToast('Password demasiado largo', 'error'); return; }

  const vCuenta = validators.text(document.getElementById('admin-user-num-cuenta')?.value, {
    max: 50, label: 'No. cuenta', pattern: /^[A-Za-z0-9\-/]+$/
  });
  if (!vCuenta.ok) { showToast(vCuenta.error, 'error'); return; }
  const numCuenta = vCuenta.value;

  const fechaNac = document.getElementById('admin-user-fecha-nacimiento')?.value;
  // El input type=date ya valida formato YYYY-MM-DD a nivel HTML.
  if (fechaNac && !/^\d{4}-\d{2}-\d{2}$/.test(fechaNac)) {
    showToast('Fecha de nacimiento inválida', 'error'); return;
  }
  const estatus = document.getElementById('admin-user-estatus')?.value || 'alumno';
  let role = document.getElementById('admin-user-role')?.value || 'user';
  // Política de password (debe coincidir EXACTO con la del edge function create-user
  // y con la del cambio de password en el perfil): ≥8 chars + 1 mayúscula + 1 dígito.
  if (!password || password.length < 8) {
    showToast('La contraseña debe tener al menos 8 caracteres', 'error');
    document.getElementById('admin-user-password')?.focus();
    return;
  }
  if (!/[A-Z]/.test(password)) {
    showToast('La contraseña debe incluir al menos una letra mayúscula', 'error');
    document.getElementById('admin-user-password')?.focus();
    return;
  }
  if (!/[0-9]/.test(password)) {
    showToast('La contraseña debe incluir al menos un número', 'error');
    document.getElementById('admin-user-password')?.focus();
    return;
  }

  let campus = document.getElementById('admin-user-campus')?.value || 'Iztacala';

  // RESTRICCIONES PARA ADMIN-CAMPUS:
  //   • No puede crear admin principal ni admin-campus de otros campus
  //   • Forzado: el campus del nuevo usuario = su campus
  if (isAdminCampusRole()) {
    if (role === 'admin') {
      showToast('Solo el admin principal puede crear administradores principales', 'error');
      return;
    }
    if (role === 'admin-campus' && campus !== _userCampus()) {
      showToast('Solo puedes crear admin-campus de tu propio campus', 'error');
      return;
    }
    // Forzar campus del nuevo usuario al campus del admin-campus
    campus = _userCampus();
  }

  // Specialist-only fields
  const specialty = document.getElementById('admin-user-specialty')?.value.trim() || null;
  const department = document.getElementById('admin-user-department')?.value.trim() || null;
  const contactInfo = document.getElementById('admin-user-contact-info')?.value.trim() || null;

  try {
    // Use Edge Function to create user (bypasses signups disabled)
    const { data, error } = await sb.functions.invoke('create-user', {
      body: {
        email: correo,
        password: password,
        full_name: nombre,
        role: role,
        account_number: numCuenta || null,
        birth_date: fechaNac || null,
        academic_status: estatus,
        campus: campus
      }
    });

    // supabase-js v2 envuelve respuestas no-2xx como FunctionsHttpError y NO
    // expone el body por default. Hay que extraerlo de error.context para
    // ver el {error, diagCode} real que mandó el edge function.
    if (error) {
      let realMsg = error.message || 'Error en create-user';
      let diagCode = '';
      try {
        const ctx = error.context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) realMsg = body.error;
          if (body?.diagCode) diagCode = ' [' + body.diagCode + ']';
        } else if (ctx && typeof ctx.text === 'function') {
          const txt = await ctx.text();
          if (txt) realMsg = txt;
        }
      } catch (_) { /* fallback al mensaje genérico */ }
      throw new Error(realMsg + diagCode);
    }
    if (data?.error) throw new Error(data.error + (data.diagCode ? ' [' + data.diagCode + ']' : ''));

    // If user is a specialist, save the extra fields directly to user_profiles
    if (role === 'specialist' && data?.userId) {
      const { error: updErr } = await sb.from('user_profiles').update({
        specialty, department, contact_info: contactInfo
      }).eq('id', data.userId);
      if (updErr) console.warn('No se guardaron campos de especialista:', updErr.message);
    }

    showToast('Usuario creado exitosamente.', 'success');
    document.getElementById('form-admin-user')?.reset();
    toggleSpecialistFields();
    loadAdminUsers();
  } catch (err) {
    console.error('Error creating user:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

async function editAdminUser(userId) {
  try {
    const { data: user, error } = await sb.from('user_profiles').select('*').eq('id', userId).single();
    if (error) throw error;

    // Traer el email desde auth.users vía Edge Function (admin no tiene acceso directo a auth.users)
    let currentEmail = '';
    try {
      const { data: emailData } = await sb.functions.invoke('get-user-email', { body: { userId } });
      currentEmail = emailData?.email || '';
    } catch (_) { /* opcional — si no existe la función, solo no precarga */ }

    const statusOptions = ['alumno','exalumno','egresado','pasante','tesista','becario','postgrado','profesor','profesora'];
    const statusSelect = statusOptions.map(s =>
      `<option value="${s}" ${user.academic_status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    const campusOptions = ['Iztacala','Acatlan','Aragon','Cuautitlan1','Cuautitlan','Zaragoza','CU'];
    const campusSelect = campusOptions.map(c =>
      `<option value="${c}" ${user.campus === c ? 'selected' : ''}>${c === 'CU' ? 'CU' : 'FES ' + c}</option>`
    ).join('');

    // Restricciones por rol del CALLER (no del usuario editado):
    // admin-campus no puede ver opción "admin principal" y no puede cambiar el campus
    const callerIsAdminPrincipal = isAdminRole();
    const callerIsAdminCampus = isAdminCampusRole();
    const showAdminRoleOption = callerIsAdminPrincipal;
    const campusReadOnly = !callerIsAdminPrincipal; // admin-campus no puede cambiar campus de un usuario

    const isSpec = user.role === 'specialist';
    showModal('Editar Usuario', `
      <form id="edit-user-form">
        <div class="form-group" style="margin-bottom:1rem;"><label>Nombre</label><input type="text" id="edit-user-name" value="${escapeHtml(user.full_name || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;">
          <label>Email <small style="color:#888;">(cambia el correo de acceso)</small></label>
          <input type="email" id="edit-user-email" value="${escapeHtml(currentEmail)}" placeholder="correo@unam.mx" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group" style="margin-bottom:1rem;">
          <label>Nueva contraseña <small style="color:#888;">(deja vacío para no cambiar)</small></label>
          <input type="password" id="edit-user-password" value="" placeholder="Mínimo 8 caracteres" style="width:100%;padding:0.5rem;" autocomplete="new-password">
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Rol</label>
          <select id="edit-user-role" style="width:100%;padding:0.5rem;" onchange="_editUserRoleChanged(this)">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
            <option value="responsable" ${user.role === 'responsable' ? 'selected' : ''}>Responsable</option>
            <option value="specialist" ${user.role === 'specialist' ? 'selected' : ''}>Especialista</option>
            <option value="admin-campus" ${user.role === 'admin-campus' ? 'selected' : ''}>Admin de campus</option>
            ${showAdminRoleOption ? `<option value="rectoria" ${user.role === 'rectoria' ? 'selected' : ''}>Rectoría UNAM (solo lectura + su árbol)</option>` : ''}
            ${showAdminRoleOption ? `<option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador principal</option>` : ''}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Estatus Académico</label>
          <select id="edit-user-status" style="width:100%;padding:0.5rem;">${statusSelect}</select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>No. Cuenta</label><input type="text" id="edit-user-cuenta" value="${escapeHtml(user.account_number || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Campus${campusReadOnly ? ' <small style="color:#888;">(no editable)</small>' : ''}<small id="edit-user-campus-hint" style="display:${user.role === 'rectoria' ? 'inline' : 'none'};color:#777;margin-left:6px;"><i class="fas fa-info-circle"></i> Rectoría supervisa todos los campus</small></label>
          <select id="edit-user-campus" style="width:100%;padding:0.5rem;" ${campusReadOnly || user.role === 'rectoria' ? 'disabled' : ''}>${campusSelect}</select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Telegram Chat ID</label><input type="text" id="edit-user-telegram" value="${escapeHtml(user.telegram_chat_id || '')}" style="width:100%;padding:0.5rem;" placeholder="123456789"></div>
        <div id="edit-spec-fields" style="display:${isSpec?'block':'none'};border-left:3px solid var(--primary);padding:0.75rem;margin-bottom:1rem;background:#f9fdf9;border-radius:6px;">
          <h5 style="margin:0 0 0.5rem;color:var(--primary);"><i class="fas fa-microscope"></i> Datos del Especialista</h5>
          <div class="form-group" style="margin-bottom:0.5rem;"><label>Especialidad</label><input type="text" id="edit-user-specialty" value="${escapeHtml(user.specialty || '')}" style="width:100%;padding:0.5rem;"></div>
          <div class="form-group" style="margin-bottom:0.5rem;"><label>Departamento</label><input type="text" id="edit-user-department" value="${escapeHtml(user.department || '')}" style="width:100%;padding:0.5rem;"></div>
          <div class="form-group" style="margin-bottom:0.5rem;"><label>Contacto adicional</label><input type="text" id="edit-user-contact" value="${escapeHtml(user.contact_info || '')}" style="width:100%;padding:0.5rem;"></div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:1rem;">Guardar</button>
      </form>
    `);

    document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const newEmail = document.getElementById('edit-user-email').value.trim();
      const newPassword = document.getElementById('edit-user-password').value.trim();
      const profileUpdates = {
        full_name: document.getElementById('edit-user-name').value.trim(),
        role: document.getElementById('edit-user-role').value,
        academic_status: document.getElementById('edit-user-status').value,
        account_number: document.getElementById('edit-user-cuenta').value.trim() || null,
        telegram_chat_id: document.getElementById('edit-user-telegram').value.trim() || null,
        specialty: document.getElementById('edit-user-specialty')?.value.trim() || null,
        department: document.getElementById('edit-user-department')?.value.trim() || null,
        contact_info: document.getElementById('edit-user-contact')?.value.trim() || null,
        updated_at: new Date().toISOString()
      };
      if (!campusReadOnly) {
        profileUpdates.campus = document.getElementById('edit-user-campus').value;
      }
      // Si el rol resultante es rectoria, forzar campus 'CU' (el select está
      // disabled visualmente pero .value sigue legible). Esto blinda contra
      // estados inconsistentes si el admin cambió el rol sin tocar campus.
      if (profileUpdates.role === 'rectoria') {
        profileUpdates.campus = 'CU';
      }

      try {
        // Si cambia email o password → llamar Edge Function update-user (requiere service_role)
        const emailChanged = newEmail && newEmail !== currentEmail;
        const passwordChanged = !!newPassword;
        if (emailChanged || passwordChanged) {
          if (passwordChanged && newPassword.length < 8) {
            showToast('La contraseña debe tener al menos 8 caracteres', 'error'); return;
          }
          const { data, error: efErr } = await sb.functions.invoke('update-user', {
            body: {
              userId,
              email: emailChanged ? newEmail : undefined,
              password: passwordChanged ? newPassword : undefined,
              profile: profileUpdates,
            }
          });
          if (efErr) throw efErr;
          if (data?.error) throw new Error(data.error);
        } else {
          // Solo cambios al perfil — update directo
          const { error: updateError } = await sb.from('user_profiles').update(profileUpdates).eq('id', userId);
          if (updateError) throw updateError;
        }
        showToast('Usuario actualizado', 'success');
        closeModal();
        loadAdminUsers();
      } catch (err) {
        showToast('Error: ' + (err.message || err), 'error');
      }
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- TREES ----
// Cache global de árboles cargados — se usa para filtrado client-side
let _adminTreesCache = [];

// Sets que indican qué árboles tienen foto / GPS en *alguna* medición
// (incluye el caso legacy donde la ubicación estaba codificada en observations
// como "[PLANTACION] {\"lat\":..,\"lng\":..}"). Se pueblan por _hydrateAdminTreesMedia.
let _adminTreesHasPhoto = new Set();
let _adminTreesHasLoc = new Set();

async function loadAdminTrees() {
  // SEGURIDAD UX: admin-campus, responsable y specialist NO pueden crear/editar/borrar
  // árboles. La sección colapsable "Agregar/Editar Árbol" se oculta para ellos.
  // (La verdadera barrera está en las RLS policies de trees_catalog: aunque
  // alguien forzara el formulario por consola, el INSERT/UPDATE/DELETE se
  // rechaza desde la BD.)
  _applyTreeAdminOnlyUI();

  // Populate the garden dropdown for the create form
  populateGardenDropdown('admin-tree-garden');
  try {
    let q = sb.from('trees_catalog').select('*').order('tree_code');
    const campusFilter = effectiveCampusFilter();
    if (campusFilter) q = q.eq('campus', campusFilter);
    const { data, error } = await q;
    if (error) throw error;
    _adminTreesCache = data || [];
    _setupAdminTreesFilters();
    _renderAdminTreesRows(_adminTreesCache);
    // Hidratar info de foto/GPS desde tree_measurements (incluye legacy
    // [PLANTACION] en observations). No bloquea el primer render.
    _hydrateAdminTreesMedia(_adminTreesCache).catch(e => console.warn('[adminTrees] hydrate media:', e));
  } catch (err) {
    showToast('Error cargando árboles: ' + err.message, 'error');
  }
}

// Consulta tree_measurements y arma los sets _adminTreesHasPhoto / _adminTreesHasLoc.
// Después re-renderiza los rows para que los iconos 📷 / 📍 de la columna Estado
// reflejen también los datos que viven en mediciones (no solo en trees_catalog).
async function _hydrateAdminTreesMedia(trees) {
  if (!Array.isArray(trees) || trees.length === 0) return;
  const ids = trees.map(t => t.id).filter(x => x != null);
  if (ids.length === 0) return;
  try {
    // Traemos solo las columnas necesarias. RLS aplica según rol.
    // Nota: chunking por si la lista es muy larga (límite de URL para .in()).
    const CHUNK = 400;
    const photoSet = new Set();
    const locSet = new Set();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from('tree_measurements')
        .select('tree_id, photo_url, location_lat, location_lng, observations')
        .in('tree_id', slice);
      if (error) {
        console.warn('[adminTrees] tree_measurements query error:', error);
        continue;
      }
      (data || []).forEach(m => {
        if (m.photo_url && String(m.photo_url).trim().length > 0) {
          photoSet.add(m.tree_id);
        }
        if (m.location_lat != null && m.location_lng != null) {
          locSet.add(m.tree_id);
        } else if (typeof m.observations === 'string'
          && /\[PLANTACION\]\s*\{[^}]*"lat"\s*:\s*-?\d/.test(m.observations)) {
          // Legacy: la ubicación está embebida en el texto de observations.
          locSet.add(m.tree_id);
        }
      });
    }
    _adminTreesHasPhoto = photoSet;
    _adminTreesHasLoc = locSet;
    // Re-render respetando filtros actuales si los hay.
    if (typeof _filterAdminTrees === 'function'
      && (document.getElementById('ft-code')?.value
        || document.getElementById('ft-species')?.value
        || document.getElementById('ft-campus')?.value
        || document.getElementById('ft-status')?.value
        || document.getElementById('ft-health-min')?.value)) {
      _filterAdminTrees();
    } else {
      _renderAdminTreesRows(_adminTreesCache);
    }
  } catch (e) {
    console.warn('[adminTrees] hydrate media exception:', e);
  }
}

// Oculta el form "Agregar/Editar Árbol" para usuarios que NO son admin global.
function _applyTreeAdminOnlyUI() {
  const isAdmin = isAdminRole();
  // Buscar el <details class="admin-collapsible"> dentro del tab de árboles
  // que contiene al form#form-admin-tree
  const treeForm = document.getElementById('form-admin-tree');
  const detailsBlock = treeForm?.closest('details') || treeForm?.closest('.admin-form');
  if (detailsBlock) {
    detailsBlock.style.display = isAdmin ? '' : 'none';
  }
  // También si está abierto, cerrarlo
  if (detailsBlock && detailsBlock.tagName === 'DETAILS' && !isAdmin) {
    detailsBlock.removeAttribute('open');
  }
}

// Inyecta los inputs de filtro en el thead (una sola vez)
function _setupAdminTreesFilters() {
  const tbody = document.getElementById('trees-table-body');
  if (!tbody) return;
  const table = tbody.closest('table');
  if (!table) return;
  const thead = table.querySelector('thead');
  if (!thead || thead.dataset.filtersReady === '1') return;

  // Inputs de filtro embebidos como segunda fila del header
  // (placeholder = nombre de columna, gris claro; al teclear desaparece)
  // SIEMPRE mostrar TODOS los campus canónicos (no solo los que ya tienen árboles)
  // + unir cualquier valor legacy presente en datos.
  const CANONICAL = ['Iztacala','Acatlan','Aragon','Cuautitlan1','Cuautitlan','Zaragoza','CU'];
  const CAMPUS_LABEL = {
    'Iztacala':   'FES Iztacala',
    'Acatlan':    'FES Acatlán',
    'Aragon':     'FES Aragón',
    'Cuautitlan1':'FES Cuautitlán C1',
    'Cuautitlan': 'FES Cuautitlán C4',
    'Zaragoza':   'FES Zaragoza',
    'CU':         'Ciudad Universitaria',
  };
  const dataCampus = [...new Set(_adminTreesCache.map(t => t.campus).filter(Boolean))];
  const extraCampus = dataCampus.filter(c => !CANONICAL.includes(c)).sort();
  const allCampus = [...CANONICAL, ...extraCampus];
  const allStatus = [...new Set(_adminTreesCache.map(t => t.status).filter(Boolean))].sort();
  const campusOpts = allCampus
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(CAMPUS_LABEL[c] || c)}</option>`)
    .join('');
  const statusOpts = allStatus.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(TREE_STATUS_LABELS[s] || s)}</option>`).join('');

  const filterRow = document.createElement('tr');
  filterRow.className = 'admin-trees-filter-row';
  filterRow.innerHTML = `
    <th style="padding:0.3rem 0.5rem;background:#fafafa;">
      <input type="text" id="ft-code" placeholder="Código…"
        oninput="_filterAdminTrees()"
        style="width:100%;padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:6px;font-size:0.82rem;background:#fff;">
    </th>
    <th style="padding:0.3rem 0.5rem;background:#fafafa;">
      <input type="text" id="ft-species" placeholder="Especie…"
        oninput="_filterAdminTrees()"
        style="width:100%;padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:6px;font-size:0.82rem;background:#fff;">
    </th>
    <th style="padding:0.3rem 0.5rem;background:#fafafa;">
      <select id="ft-campus" onchange="_filterAdminTrees()"
        style="width:100%;padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:6px;font-size:0.82rem;background:#fff;color:${''};">
        <option value="">Todos campus</option>
        ${campusOpts}
      </select>
    </th>
    <th style="padding:0.3rem 0.5rem;background:#fafafa;">
      <select id="ft-status" onchange="_filterAdminTrees()"
        style="width:100%;padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:6px;font-size:0.82rem;background:#fff;">
        <option value="">Todos estados</option>
        ${statusOpts}
      </select>
    </th>
    <th style="padding:0.3rem 0.5rem;background:#fafafa;">
      <input type="number" id="ft-health-min" min="0" max="100" placeholder="≥ %"
        oninput="_filterAdminTrees()"
        style="width:100%;padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:6px;font-size:0.82rem;background:#fff;">
    </th>
    <th style="padding:0.3rem 0.5rem;background:#fafafa;text-align:right;white-space:nowrap;">
      <label style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;color:#555;margin-right:0.4rem;cursor:pointer;" title="Mostrar solo árboles sin ubicación GPS">
        <input type="checkbox" id="ft-no-gps" onchange="_filterAdminTrees()" style="margin:0;cursor:pointer;">
        📍 Sin GPS
      </label>
      <button type="button" onclick="_exportTreesNoGpsCsv()"
        style="background:transparent;color:#5b8b7d;border:1px solid #c2dcd3;padding:0.3rem 0.5rem;border-radius:6px;font-size:0.72rem;cursor:pointer;margin-right:0.25rem;"
        title="Exportar CSV de árboles sin GPS">⬇ CSV</button>
      <button type="button" onclick="_clearAdminTreesFilters()"
        style="background:transparent;color:#666;border:1px solid #ddd;padding:0.35rem 0.6rem;border-radius:6px;font-size:0.78rem;cursor:pointer;"
        title="Limpiar filtros">↺</button>
    </th>
  `;
  thead.appendChild(filterRow);
  thead.dataset.filtersReady = '1';
}

function _filterAdminTrees() {
  const code = (document.getElementById('ft-code')?.value || '').toLowerCase().trim();
  const species = (document.getElementById('ft-species')?.value || '').toLowerCase().trim();
  const campus = (document.getElementById('ft-campus')?.value || '').trim();
  const status = (document.getElementById('ft-status')?.value || '').trim();
  const healthMin = parseInt(document.getElementById('ft-health-min')?.value);
  const noGps = !!document.getElementById('ft-no-gps')?.checked;

  const filtered = _adminTreesCache.filter(t => {
    if (code && !(t.tree_code || '').toLowerCase().includes(code)) return false;
    if (species) {
      const text = ((t.species || '') + ' ' + (t.common_name || '')).toLowerCase();
      if (!text.includes(species)) return false;
    }
    if (campus && t.campus !== campus) return false;
    if (status && t.status !== status) return false;
    if (!isNaN(healthMin) && (t.health_score || 0) < healthMin) return false;
    // "Sin GPS": el árbol no tiene coords en trees_catalog. (No considera
    // mediciones porque la columna en BD es la que cuenta para mapas/exports.)
    if (noGps && (t.location_lat != null && t.location_lng != null)) return false;
    return true;
  });

  const { field, dir } = _adminSortState.trees;
  const filteredSorted = _sortRows(filtered, field, dir);
  _renderAdminTreesRows(filteredSorted);
  _updateSortIndicators('table[data-sort-table="trees"]');

  // Contador en consola para debug y feedback visual
  const tbody = document.getElementById('trees-table-body');
  if (tbody && filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:#888;">
      Sin árboles que coincidan con los filtros. <a href="#" onclick="_clearAdminTreesFilters();return false;" style="color:#2E7D32;">Limpiar filtros</a>
    </td></tr>`;
  }
}

function _clearAdminTreesFilters() {
  ['ft-code', 'ft-species', 'ft-health-min'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['ft-campus', 'ft-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const noGpsEl = document.getElementById('ft-no-gps');
  if (noGpsEl) noGpsEl.checked = false;
  _adminSortState.trees = { field: null, dir: null };
  _renderAdminTreesRows(_adminTreesCache);
  _updateSortIndicators('table[data-sort-table="trees"]');
}

// Exporta a CSV los árboles del cache actual que NO tienen GPS en trees_catalog.
// Útil para el equipo de campo: lista de árboles pendientes de geolocalizar.
function _exportTreesNoGpsCsv() {
  if (!Array.isArray(_adminTreesCache) || _adminTreesCache.length === 0) {
    showToast('No hay árboles cargados', 'info');
    return;
  }
  const rows = _adminTreesCache.filter(t => t.location_lat == null || t.location_lng == null);
  if (rows.length === 0) {
    showToast('¡Todos los árboles cargados tienen GPS!', 'success');
    return;
  }
  // Escape RFC4180: "field" con dobles comillas escapadas.
  const csvEsc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['id', 'tree_code', 'campus', 'species', 'common_name', 'status', 'health_score', 'created_at'];
  const lines = [header.join(',')];
  rows.forEach(t => lines.push(header.map(h => csvEsc(t[h])).join(',')));
  // BOM UTF-8 para que Excel respete acentos.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `arboles_sin_gps_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast(`Exportados ${rows.length} árboles sin GPS`, 'success');
}
window._exportTreesNoGpsCsv = _exportTreesNoGpsCsv;

function _renderAdminTreesRows(trees) {
  const tbody = document.getElementById('trees-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  // SEGURIDAD UX:
  //   - admin global   : ve todos los botones (editar, editar-ubicación, borrar)
  //   - admin-campus   : ve editar + editar-ubicación (de su campus), SIN borrar
  //   - responsable / specialist / user: solo lectura (📋, 📱)
  // Las RLS de trees_catalog son la barrera dura en BD.
  const canEdit   = isAdminRole() || isAdminCampusRole();
  const canDelete = isAdminRole();
  trees.forEach(tree => {
    const row = document.createElement('tr');
    const statusLabel = TREE_STATUS_LABELS[tree.status] || tree.status || '—';
    // Foto / ubicación: el árbol puede tenerlas en trees_catalog (campos directos)
    // O en alguna medición posterior (incluso embebida como [PLANTACION] {...} en
    // observations para datos legacy). _adminTreesHasPhoto / _adminTreesHasLoc
    // se hidratan después del primer render con la info de tree_measurements.
    const hasLocOnTree  = tree.location_lat != null && tree.location_lng != null;
    const hasLocOnMeas  = _adminTreesHasLoc instanceof Set && _adminTreesHasLoc.has(tree.id);
    const hasLocation   = hasLocOnTree || hasLocOnMeas;
    const hasPhotoOnTree = tree.photo_url && String(tree.photo_url).length > 0;
    const hasPhotoOnMeas = _adminTreesHasPhoto instanceof Set && _adminTreesHasPhoto.has(tree.id);
    const hasPhoto       = hasPhotoOnTree || hasPhotoOnMeas;
    // Tooltips claros para distinguir origen del dato.
    const locTooltip = hasLocOnTree
      ? 'Ubicación capturada (catálogo)'
      : (hasLocOnMeas ? 'Ubicación capturada en seguimiento' : 'Sin ubicación — se capturará en primer seguimiento');
    const photoTooltip = hasPhotoOnTree
      ? 'Foto registrada (catálogo)'
      : (hasPhotoOnMeas ? 'Foto registrada en seguimiento' : 'Sin foto registrada — se capturará en próxima medición');
    const co2 = window.CO2Calculator?.calculateCO2Stored(tree) || 0;
    const co2Tag = co2 > 0
      ? ` <small style="color:#1976D2;font-weight:500;" title="CO₂ capturado estimado">·💨${window.CO2Calculator.formatCO2(co2, 0)}</small>`
      : '';
    // admin-campus solo ve editar para árboles de SU campus (extra safety)
    const showEditForRow = isAdminRole() || (isAdminCampusRole() && tree.campus === _userCampus());
    const editButtons = (canEdit && showEditForRow) ? `
        <button class="btn btn-sm btn-secondary" onclick="editAdminTree(${tree.id})" title="Editar">✏️</button>
        <button class="btn btn-sm" style="background:#2e7d32;color:white;" onclick="editAdminTreeLocation(${tree.id})" title="Editar ubicación en mapa">📍</button>` : '';
    const deleteButton = canDelete ? `
        <button class="btn btn-sm btn-danger" onclick="deleteAdminTree(${tree.id})" title="Eliminar">🗑️</button>` : '';
    row.innerHTML = `
      <td>${escapeHtml(tree.tree_code || '-')}</td>
      <td>${escapeHtml(tree.species || '-')}</td>
      <td>${escapeHtml(tree.campus || '-')}</td>
      <td>
        <span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${escapeHtml(statusLabel)}</span>
        ${hasLocation
          ? `<span title="${escapeHtml(locTooltip)}" style="margin-left:4px;">📍</span>`
          : `<span title="${escapeHtml(locTooltip)}" style="margin-left:4px;opacity:0.4;">📍</span>`}
        ${hasPhoto
          ? `<span title="${escapeHtml(photoTooltip)}" style="margin-left:4px;">📷</span>`
          : `<span title="${escapeHtml(photoTooltip)}" style="margin-left:4px;opacity:0.4;">📷</span>`}
      </td>
      <td>${tree.health_score || 0}%${co2Tag}</td>
      <td>${editButtons}
        <button class="btn btn-sm" style="background:#1a4480;color:white;" onclick="viewTreeMeasurementsAdmin(${tree.id})" title="Ver seguimientos">📋</button>
        <button class="btn btn-sm" style="background:#0288d1;color:white;" onclick="showTreeQR(${tree.id}, '${safeJsAttr(tree.tree_code)}', '${safeJsAttr(tree.common_name || '')}')" title="QR">📱</button>${deleteButton}
      </td>
    `;
    tbody.appendChild(row);
  });
}

window._filterAdminTrees = _filterAdminTrees;
window._clearAdminTreesFilters = _clearAdminTreesFilters;

// Valid CHECK constraint values (must match BD)
const TREE_STATUS_VALUES = ['nuevo','activo','enfermo','en_tratamiento','seco','retirado'];
const TREE_TYPE_VALUES = ['nativo','endemico','ornamental','frutal'];
const TREE_SIZE_VALUES = ['pequeno','mediano','grande','muy_grande'];
const TREE_STATUS_LABELS = {
  nuevo: 'Nuevo', activo: 'Activo', enfermo: 'Enfermo',
  en_tratamiento: 'En tratamiento', seco: 'Seco', retirado: 'Retirado'
};
const TREE_TYPE_LABELS = {
  nativo: 'Nativo', endemico: 'Endémico', ornamental: 'Ornamental', frutal: 'Frutal'
};
const TREE_SIZE_LABELS = {
  pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande', muy_grande: 'Muy grande'
};

async function populateGardenDropdown(selectId, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const { data, error } = await sb.from('gardens').select('id, name, campus').order('name');
    if (error) throw error;
    const placeholder = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (placeholder) sel.appendChild(placeholder);
    else sel.appendChild(new Option('— Sin jardín asignado —', ''));
    (data || []).forEach(g => {
      const opt = new Option(`${g.name} (${g.campus || '—'})`, g.id);
      if (currentValue && currentValue === g.id) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.warn('No se pudo cargar jardines:', err.message);
  }
}

async function saveAdminTree(e) {
  if (e) e.preventDefault();
  // SEGURIDAD: admin global (cualquier campus) o admin-campus (solo de SU campus)
  // pueden crear/editar árboles. La policy RLS de trees_catalog ya hace cumplir
  // la regla en BD; aquí solo evitamos llamadas inútiles que sabemos que fallarán.
  if (!isAdminRole() && !isAdminCampusRole()) {
    showToast('Solo administradores pueden crear o editar árboles', 'error');
    return;
  }

  // Recoger metas del árbol (sección "Metas del árbol")
  const goals = _readTreeGoalsFromForm('admin-tree');

  const tree = {
    tree_code: document.getElementById('admin-tree-code')?.value.trim(),
    species: document.getElementById('admin-tree-species')?.value.trim(),
    common_name: document.getElementById('admin-tree-common-name')?.value.trim() || null,
    tree_type: document.getElementById('admin-tree-type')?.value,
    size: document.getElementById('admin-tree-size')?.value,
    campus: document.getElementById('admin-tree-campus')?.value || null,
    garden_id: document.getElementById('admin-tree-garden')?.value || null,
    planting_date: document.getElementById('admin-tree-planting-date')?.value || null,
    status: document.getElementById('admin-tree-status')?.value,
    health_score: parseInt(document.getElementById('admin-tree-health')?.value) || 80,
    initial_height_cm: parseFloat(document.getElementById('admin-tree-height')?.value) || null,
    initial_trunk_diameter_cm: parseFloat(document.getElementById('admin-tree-trunk')?.value) || null,
    initial_crown_diameter_cm: parseFloat(document.getElementById('admin-tree-crown')?.value) || null,
    initial_notes: document.getElementById('admin-tree-notes')?.value.trim() || null,
    goals: goals,
    created_by: currentUser?.id,
  };
  if (!tree.tree_code || !tree.species) { showToast('Código y especie son requeridos', 'error'); return; }
  if (!TREE_STATUS_VALUES.includes(tree.status)) { showToast('Estado inválido', 'error'); return; }
  if (!TREE_TYPE_VALUES.includes(tree.tree_type)) { showToast('Tipo inválido', 'error'); return; }
  if (!TREE_SIZE_VALUES.includes(tree.size)) { showToast('Tamaño inválido', 'error'); return; }

  // RESTRICCIÓN admin-campus: solo puede crear árboles de SU campus.
  if (isAdminCampusRole() || isResponsableRole()) {
    if (tree.campus && tree.campus !== _userCampus()) {
      showToast(`Solo puedes crear árboles del campus ${_userCampus()}`, 'error');
      return;
    }
    tree.campus = _userCampus();  // forzar
  }

  try {
    // 1. Insertar árbol y obtener su id (necesario para el path de la foto,
    //    porque la RLS de tree-photos verifica que el primer segmento sea
    //    un tree_id válido)
    const { data: inserted, error } = await sb
      .from('trees_catalog')
      .insert([tree])
      .select('id')
      .single();
    if (error) throw error;

    // 2. Si hay foto en el form, subirla a Storage y actualizar photo_url.
    //    BUG previo: el save NO subía la foto — solo se llegaba a subir
    //    indirectamente cuando se invocaba PUM-AI, por eso la foto aparecía
    //    solo cuando el admin usaba PUM-AI antes de guardar.
    const photoFile = document.getElementById('admin-tree-photo')?.files?.[0];
    if (photoFile && inserted?.id) {
      try {
        // Subir DOS versiones: original (1200px) + thumbnail (400px).
        // El mosaico/listas usan el thumb (~25KB c/u) — así evitamos
        // depender del "image transform" de Supabase (límite 100/mes en free).
        const baseFileName = `${inserted.id}/${Date.now()}`;
        const { fullPath } = await uploadPhotoWithThumb(photoFile, 'tree-photos', baseFileName);
        // Guardamos el path del ORIGINAL como photo_url; el thumb se deriva
        // automáticamente con thumbPathFor() al mostrarse.
        const { error: updErr } = await sb
          .from('trees_catalog')
          .update({ photo_url: fullPath })
          .eq('id', inserted.id);
        if (updErr) console.warn('photo_url update warning:', updErr.message);
      } catch (photoErr) {
        console.error('Photo upload failed:', photoErr);
        showToast('Árbol creado, pero la foto no se subió: ' + (photoErr.message || photoErr), 'warning');
      }
    }

    showToast('Árbol agregado al inventario. La ubicación exacta se capturará en el primer seguimiento del usuario asignado.', 'success');
    document.getElementById('form-admin-tree')?.reset();
    loadAdminTrees();
    populateGardenDropdown('admin-tree-garden');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Lee los selectores de metas del árbol del form
function _readTreeGoalsFromForm(prefix) {
  const v = id => document.getElementById(`${prefix}-${id}`)?.value || '';
  return {
    frequency: v('goal-frequency') || null,
    target_health: parseInt(v('goal-health'), 10) || null,
    growth_cm_per_year: parseInt(v('goal-growth'), 10) || null,
    focus: v('goal-focus') || null,
    period: v('goal-period') || 'mensual',
    season_at_creation: getCurrentSeason(),
    ai_suggested: !!document.getElementById(`${prefix}-goals-ai-flag`)?.value,
    ai_reasoning: document.getElementById(`${prefix}-goals-ai-reasoning`)?.value || null,
  };
}

// ============================================================================
// HELPER — estación del año (hemisferio norte / México)
// ============================================================================
function getCurrentSeason(date) {
  const d = date || new Date();
  const m = d.getMonth() + 1; // 1-12
  if (m >= 3 && m <= 5) return 'primavera';
  if (m >= 6 && m <= 8) return 'verano';
  if (m >= 9 && m <= 11) return 'otoño';
  return 'invierno';
}

// ============================================================================
// HELPER — comprimir foto a base64 (reutiliza compressImageForAI si existe)
// ============================================================================
async function _imageFileToBase64(file, maxW = 1024, maxH = 1024, quality = 0.7) {
  if (!file) return null;
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  // Si compressImageForAI está global, usarla. Si no, fallback simple.
  let compressed = dataUrl;
  if (typeof compressImageForAI === 'function') {
    try { compressed = await compressImageForAI(dataUrl, maxW, maxH, quality); }
    catch (_) {}
  } else {
    compressed = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  const base64 = compressed.split(',')[1];
  const mime = (compressed.match(/^data:(image\/[a-zA-Z+]+);/) || [, 'image/jpeg'])[1];
  return { base64, mime };
}

// ============================================================================
// PUM-AI sugiere metas para ÁRBOL (foto + estación + ubicación + especie)
// ============================================================================
async function suggestTreeGoalsWithAI() {
  const btn = document.getElementById('btn-tree-goals-ai');
  const feedback = document.getElementById('admin-tree-goals-ai-feedback');
  if (!btn) return;

  // Recoger contexto
  const ctx = {
    code: document.getElementById('admin-tree-code')?.value || 'sin código',
    species: document.getElementById('admin-tree-species')?.value || 'no especificada',
    common_name: document.getElementById('admin-tree-common-name')?.value || '',
    tree_type: document.getElementById('admin-tree-type')?.value || 'no especificado',
    size: document.getElementById('admin-tree-size')?.value || 'mediano',
    campus: document.getElementById('admin-tree-campus')?.value || 'desconocido',
    health: document.getElementById('admin-tree-health')?.value || '80',
    height: document.getElementById('admin-tree-height')?.value || '?',
    notes: document.getElementById('admin-tree-notes')?.value || '',
  };

  if (!ctx.species || ctx.species === 'no especificada') {
    showToast('Llena al menos la especie del árbol antes de pedir sugerencias', 'warning');
    return;
  }

  // Foto opcional
  const photoFile = document.getElementById('admin-tree-photo')?.files?.[0];
  let imageData = null;
  try {
    if (photoFile) imageData = await _imageFileToBase64(photoFile);
  } catch (_) {}

  const season = (document.getElementById('admin-tree-season')?.value) || getCurrentSeason();

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando…';
  if (feedback) { feedback.style.display = 'none'; feedback.innerHTML = ''; }

  try {
    const prompt = `Eres PUM-AI, experto en arboricultura urbana del Valle de México (UNAM/FES Iztacala). Estoy registrando un árbol y necesito que sugieras metas de gestión razonables y alcanzables.

Datos del árbol:
- Código: ${ctx.code}
- Especie: ${ctx.species}
- Nombre común: ${ctx.common_name || '(no especificado)'}
- Tipo: ${ctx.tree_type}
- Tamaño actual: ${ctx.size}
- Campus: ${ctx.campus}
- Salud inicial: ${ctx.health}/100
- Altura inicial: ${ctx.height} cm
- Notas: ${ctx.notes || 'sin notas'}
- Estación del año al registrar: ${season} (hemisferio norte, Valle de México ~2240m altura, clima templado)
${imageData ? '\nSe adjunta una foto del árbol para que la analices.' : '\n(No hay foto disponible — usa solo datos textuales)'}

Considerando especie, tamaño actual, estación del año y clima local, sugiere metas. Responde ÚNICAMENTE con JSON válido (sin markdown):

{
  "frequency": "quincenal" | "mensual" | "trimestral" | "anual",
  "target_health": <50, 60, 70, 80 o 90>,
  "growth_cm_per_year": <5, 15, 30 o 60 según especie/edad>,
  "focus": "riego" | "poda" | "control_plagas" | "general" | "establecimiento",
  "period": "mensual" | "trimestral" | "anual",
  "reasoning": "<2-3 frases explicando por qué estas metas para esta especie en esta estación>"
}

Notas:
- Para árboles jóvenes recién plantados (talla 'pequeño'), recomienda focus 'establecimiento' y frecuencia 'quincenal' o 'mensual'
- Para árboles maduros sanos (talla 'grande'), suele bastar 'trimestral' o 'anual'
- En verano caluroso de Valle de México, riego es prioridad
- En invierno, poda y revisión estructural`;

    const body = imageData
      ? { message: prompt, imageBase64: imageData.base64, imageType: imageData.mime }
      : { message: prompt };

    const { data, error } = await sb.functions.invoke('pum-ai', { body });
    if (error) throw error;

    let reply = data?.reply || '';
    reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(reply); }
    catch (_) {
      const m = reply.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed) throw new Error('Respuesta de PUM-AI no interpretable');

    const setIf = (id, val) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const opt = Array.from(sel.options).find(o => String(o.value) === String(val));
      if (opt) sel.value = String(val);
    };
    setIf('admin-tree-goal-frequency', parsed.frequency);
    setIf('admin-tree-goal-health', parsed.target_health);
    setIf('admin-tree-goal-growth', parsed.growth_cm_per_year);
    setIf('admin-tree-goal-focus', parsed.focus);
    setIf('admin-tree-goal-period', parsed.period);

    // Marcador interno
    const ensureHidden = (id, val) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.id = id;
        btn.parentElement?.appendChild(el);
      }
      el.value = val;
    };
    ensureHidden('admin-tree-goals-ai-flag', '1');
    ensureHidden('admin-tree-goals-ai-reasoning', parsed.reasoning || '');

    if (feedback) {
      feedback.innerHTML = `<strong style="color:#0d2d5c;"><i class="fas fa-robot"></i> PUM-AI sugiere:</strong> ${escapeHtml(parsed.reasoning || 'Metas aplicadas al formulario.')}`;
      feedback.style.display = 'block';
    }
    showToast('Metas del árbol sugeridas por PUM-AI ✓', 'success');
  } catch (e) {
    console.error('suggestTreeGoalsWithAI error:', e);
    if (feedback) {
      feedback.innerHTML = `<span style="color:#c00;"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(e.message || String(e))}. Llena las metas manualmente.</span>`;
      feedback.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function editAdminTree(treeId) {
  // SEGURIDAD: admin global y admin-campus pueden editar árboles.
  // Para admin-campus, solo árboles de SU campus (las RLS también lo verifican).
  if (!isAdminRole() && !isAdminCampusRole()) {
    showToast('Solo administradores pueden editar árboles', 'error');
    return;
  }
  const { data: tree } = await sb.from('trees_catalog').select('*').eq('id', treeId).single();
  if (!tree) return;
  if (isAdminCampusRole() && tree.campus !== _userCampus()) {
    showToast(`Solo puedes editar árboles de tu campus (${_userCampus()})`, 'error');
    return;
  }

  // Jardines SOLO existen en Iztacala. Solo cargar+mostrar dropdown si el árbol es de Iztacala.
  const showGardens = (tree.campus === 'Iztacala');
  let gardenOpts = '';
  if (showGardens) {
    const { data: gardens } = await sb.from('gardens').select('id, name, campus').order('name');
    gardenOpts = '<option value="">— Sin jardín —</option>' +
      (gardens || []).map(g =>
        `<option value="${g.id}" ${tree.garden_id === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${escapeHtml(g.campus || '—')})</option>`
      ).join('');
  }

  const statusOpts = TREE_STATUS_VALUES.map(s =>
    `<option value="${s}" ${tree.status === s ? 'selected' : ''}>${TREE_STATUS_LABELS[s]}</option>`).join('');
  const typeOpts = TREE_TYPE_VALUES.map(s =>
    `<option value="${s}" ${tree.tree_type === s ? 'selected' : ''}>${TREE_TYPE_LABELS[s]}</option>`).join('');
  const sizeOpts = TREE_SIZE_VALUES.map(s =>
    `<option value="${s}" ${tree.size === s ? 'selected' : ''}>${TREE_SIZE_LABELS[s]}</option>`).join('');
  const campusOpts = ['Iztacala','Acatlan','Aragon','Cuautitlan1','Cuautitlan','Zaragoza','CU'].map(c =>
    `<option value="${c}" ${tree.campus === c ? 'selected' : ''}>${c === 'CU' ? 'CU' : 'FES ' + c}</option>`).join('');
  // Para admin-campus: el campus queda BLOQUEADO al del árbol (no puede migrarlo
  // a otro campus). La RLS también lo impide a nivel BD.
  const campusFieldDisabled = isAdminCampusRole() ? 'disabled' : '';
  const campusFieldHint = isAdminCampusRole()
    ? ' <small style="color:#888;">(no editable)</small>' : '';

  // ---- Última foto: del seguimiento más reciente; fallback a la del alta ----
  let latestPhotoSrc = null;
  let latestPhotoLabel = '';
  try {
    const { data: latestMeas } = await sb.from('tree_measurements')
      .select('photo_url, measurement_date')
      .eq('tree_id', treeId)
      .not('photo_url', 'is', null)
      .order('measurement_date', { ascending: false })
      .limit(1);
    if (latestMeas && latestMeas.length > 0 && latestMeas[0].photo_url) {
      latestPhotoSrc = await _resolveStoragePhoto(latestMeas[0].photo_url, 'tree-photos');
      const dt = new Date(latestMeas[0].measurement_date);
      latestPhotoLabel = dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
    }
    if (!latestPhotoSrc && tree.photo_url) {
      latestPhotoSrc = await _resolveStoragePhoto(tree.photo_url, 'tree-photos');
      latestPhotoLabel = 'Inicial';
    }
  } catch (_) { /* sin foto = no se muestra thumbnail */ }

  // M-5: validar que la URL sea HTTPS de Supabase Storage antes de renderizar.
  // escapeHtml() previene HTML injection pero NO bloquea javascript:/data:/file:
  // URIs que podrían ejecutarse en el onclick. Solo aceptamos https://*.supabase.co/
  const _isSafePhotoUrl = (u) => typeof u === 'string'
    && /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co\//.test(u);
  const _safePhotoSrc = (latestPhotoSrc && _isSafePhotoUrl(latestPhotoSrc))
    ? latestPhotoSrc
    : null;
  const latestPhotoThumb = _safePhotoSrc
    ? `<div style="flex-shrink:0;text-align:center;">
         <img src="${escapeHtml(_safePhotoSrc)}"
              onclick="window.open('${safeJsAttr(_safePhotoSrc)}','_blank')"
              title="Última foto — click para ver completa"
              style="width:80px;height:80px;object-fit:cover;border-radius:10px;cursor:zoom-in;border:2px solid #2E7D32;box-shadow:0 2px 8px rgba(0,0,0,0.15);"
              onerror="this.style.display='none'">
         <div style="font-size:0.65rem;color:#888;margin-top:3px;">📸 ${escapeHtml(latestPhotoLabel)}</div>
       </div>`
    : '';

  showModal('Editar Árbol', `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.7rem;">
      <div style="flex:1;color:#666;font-size:0.85rem;">
        <strong>${escapeHtml(tree.tree_code || '')}</strong> · <em>${escapeHtml(tree.common_name || tree.species || '')}</em>
      </div>
      ${latestPhotoThumb}
    </div>
    <form id="edit-tree-form">
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Código</label><input type="text" id="edit-tree-code" value="${escapeHtml(tree.tree_code || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Especie</label><input type="text" id="edit-tree-species" value="${escapeHtml(tree.species || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Nombre Común</label><input type="text" id="edit-tree-common" value="${escapeHtml(tree.common_name || '')}" style="width:100%;padding:0.5rem;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Tipo</label><select id="edit-tree-type" style="width:100%;padding:0.5rem;">${typeOpts}</select></div>
        <div class="form-group"><label>Tamaño</label><select id="edit-tree-size" style="width:100%;padding:0.5rem;">${sizeOpts}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:${showGardens ? '1fr 1fr' : '1fr'};gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Campus${campusFieldHint}</label><select id="edit-tree-campus" style="width:100%;padding:0.5rem;" ${campusFieldDisabled}>${campusOpts}</select></div>
        ${showGardens ? `<div class="form-group"><label>Jardín</label><select id="edit-tree-garden" style="width:100%;padding:0.5rem;">${gardenOpts}</select></div>` : ''}
      </div>
      <div class="form-group" style="margin-bottom:0.75rem;">
        <label>Ubicación (lat/lng)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.5rem;align-items:stretch;">
          <input type="number" step="any" id="edit-tree-lat" placeholder="Latitud"
                 value="${tree.location_lat || ''}" style="width:100%;padding:0.5rem;">
          <input type="number" step="any" id="edit-tree-lng" placeholder="Longitud"
                 value="${tree.location_lng || ''}" style="width:100%;padding:0.5rem;">
          <button type="button" id="edit-tree-loc-mapbtn"
                  style="background:#2e7d32;color:#fff;border:none;padding:0 1rem;border-radius:6px;cursor:pointer;font-weight:500;white-space:nowrap;">
            📍 Mapa
          </button>
        </div>
        <small style="color:#666;font-size:0.75rem;">Click en "📍 Mapa" para arrastrar un pin en el mapa real</small>
      </div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Salud (0-100)</label><input type="number" id="edit-tree-health" value="${tree.health_score || 0}" min="0" max="100" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Estado</label>
        <select id="edit-tree-status" style="width:100%;padding:0.5rem;">${statusOpts}</select>
      </div>
      <h4 style="margin:1rem 0 0.5rem;border-top:1px solid #eee;padding-top:0.75rem;">Medidas Iniciales</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Altura (cm)</label><input type="number" step="0.1" id="edit-tree-height" value="${tree.initial_height_cm || ''}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group"><label>Tronco (cm)</label><input type="number" step="0.1" id="edit-tree-trunk" value="${tree.initial_trunk_diameter_cm || ''}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group"><label>Copa (cm)</label><input type="number" step="0.1" id="edit-tree-crown" value="${tree.initial_crown_diameter_cm || ''}" style="width:100%;padding:0.5rem;"></div>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Guardar</button>
    </form>
  `);
  // Botón "📍 Mapa" abre el editor gráfico y actualiza los inputs sin guardar
  // todavía (el user tiene que seguir con el form completo).
  const locBtn = document.getElementById('edit-tree-loc-mapbtn');
  if (locBtn) {
    locBtn.addEventListener('click', () => {
      const curLat = parseFloat(document.getElementById('edit-tree-lat').value);
      const curLng = parseFloat(document.getElementById('edit-tree-lng').value);
      openLocationMapEditor({
        initialLat: isFinite(curLat) ? curLat : null,
        initialLng: isFinite(curLng) ? curLng : null,
        treeCode: tree.tree_code,
        treeName: tree.common_name || tree.species || 'Árbol',
        onSave: (lat, lng) => {
          document.getElementById('edit-tree-lat').value = lat.toFixed(6);
          document.getElementById('edit-tree-lng').value = lng.toFixed(6);
          showToast('Coords actualizadas — recuerda "Guardar" abajo para confirmar', 'info');
        }
      });
    });
  }

  document.getElementById('edit-tree-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    // SEGURIDAD UX: admin-campus no puede migrar el árbol a otro campus.
    // El select está disabled (que no envía valor), pero por defensa forzamos
    // el campus original. La RLS de trees_catalog también lo rechaza si lo
    // intentaran via consola.
    const campusToSave = isAdminCampusRole()
      ? tree.campus
      : document.getElementById('edit-tree-campus').value;
    const { error } = await sb.from('trees_catalog').update({
      tree_code: document.getElementById('edit-tree-code').value.trim(),
      species: document.getElementById('edit-tree-species').value.trim(),
      common_name: document.getElementById('edit-tree-common').value.trim() || null,
      tree_type: document.getElementById('edit-tree-type').value,
      size: document.getElementById('edit-tree-size').value,
      campus: campusToSave,
      garden_id: document.getElementById('edit-tree-garden')?.value || null,
      location_lat: parseFloat(document.getElementById('edit-tree-lat').value) || null,
      location_lng: parseFloat(document.getElementById('edit-tree-lng').value) || null,
      health_score: parseInt(document.getElementById('edit-tree-health').value) || 0,
      status: document.getElementById('edit-tree-status').value,
      initial_height_cm: parseFloat(document.getElementById('edit-tree-height').value) || null,
      initial_trunk_diameter_cm: parseFloat(document.getElementById('edit-tree-trunk').value) || null,
      initial_crown_diameter_cm: parseFloat(document.getElementById('edit-tree-crown').value) || null,
      updated_at: new Date().toISOString()
    }).eq('id', treeId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Árbol actualizado', 'success');
    closeModal();
    loadAdminTrees();
  });
}

async function deleteAdminTree(treeId) {
  // SEGURIDAD: solo admin global puede borrar árboles.
  if (!isAdminRole()) {
    showToast('Solo el administrador principal puede borrar árboles', 'error');
    return;
  }
  if (!confirm('¿Eliminar este árbol?\n\n⚠ Se eliminarán TAMBIÉN:\n• Todos sus seguimientos (mediciones)\n• Sus asignaciones a usuarios\n• Sus reportes ciudadanos\n• Sus bitácoras y resúmenes anuales')) return;

  try {
    // Borrar dependencias en orden (algunas tablas no tienen CASCADE)
    // No-throw individual: si una falla, intentamos las siguientes
    const tables = [
      'tree_measurements',
      'tree_assignments',
      'problem_reports',
      'specialist_followups',
      'tree_monthly_summaries',
      'tree_annual_summaries',
    ];
    for (const t of tables) {
      const { error } = await sb.from(t).delete().eq('tree_id', treeId);
      if (error && !/relation .* does not exist/.test(error.message)) {
        // Solo log; continuamos. Si la tabla no existe, no es problema.
        console.warn(`Cleanup ${t} warning:`, error.message);
      }
    }

    // Finalmente borrar el árbol
    const { error } = await sb.from('trees_catalog').delete().eq('id', treeId);
    if (error) throw error;

    showToast('Árbol eliminado correctamente', 'success');
    loadAdminTrees();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
    console.error('deleteAdminTree:', err);
  }
}

// ---- GARDENS ----
// Valid CHECK constraint values for gardens
const GARDEN_SOIL_VALUES = ['arenoso','arcilloso','franco','mixto','rocoso'];
const GARDEN_IRRIGATION_VALUES = ['ninguno','manual','aspersion','goteo','automatizado'];
const GARDEN_EXPOSURE_VALUES = ['sol_pleno','semi_sombra','sombra','mixto'];

async function populateSpecialistDropdown(selectId, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const { data } = await sb.from('user_profiles')
      .select('id, full_name, specialty')
      .eq('role', 'specialist')
      .order('full_name');
    const placeholder = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (placeholder) sel.appendChild(placeholder);
    else sel.appendChild(new Option('— Sin asignar —', ''));
    (data || []).forEach(s => {
      const label = `${s.full_name}${s.specialty ? ' — ' + s.specialty : ''}`;
      const opt = new Option(label, s.id);
      if (currentValue && currentValue === s.id) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.warn('No se pudieron cargar especialistas:', err.message);
  }
}

let _gardensCache = [];
async function loadAdminGardens() {
  populateSpecialistDropdown('admin-garden-specialist');
  try {
    let q = sb.from('gardens').select('*').order('name');
    // Jardines son solo de Iztacala (regla de negocio) — pero igual respetamos filtro
    const campusFilter = effectiveCampusFilter();
    if (campusFilter) q = q.eq('campus', campusFilter);
    const { data, error } = await q;
    if (error) throw error;
    _gardensCache = data || [];
    _renderGardens(_gardensCache);
  } catch (err) {
    showToast('Error cargando jardines: ' + err.message, 'error');
  }
}

function _renderGardens(rows) {
  const tbody = document.getElementById('gardens-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  rows.forEach(g => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(g.name)}</td>
      <td>${escapeHtml(g.campus || '-')}</td>
      <td>${g.location_lat != null ? g.location_lat + ', ' + g.location_lng : '<span class="text-muted">—</span>'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editAdminGarden('${g.id}')" title="Editar">✏️</button>
        <button class="btn btn-sm" style="background:#1a4480;color:white;" onclick="viewGardenVisitsAdmin('${g.id}')" title="Ver seguimientos">📋</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAdminGarden('${g.id}')" title="Eliminar">🗑️</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function _filterGardens() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fName = get('g-name'), fCampus = get('g-campus'), fLoc = get('g-loc');
  const filtered = _gardensCache.filter(g => {
    if (fName && !(g.name || '').toLowerCase().includes(fName)) return false;
    if (fCampus && (g.campus || '') !== fCampus) return false;
    if (fLoc) {
      const locStr = `${g.location_lat || ''} ${g.location_lng || ''}`.toLowerCase();
      if (!locStr.includes(fLoc)) return false;
    }
    return true;
  });
  _renderGardens(filtered);
}

function _clearGardensFilters() {
  ['g-name','g-campus','g-loc'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderGardens(_gardensCache);
}

window._filterGardens = _filterGardens;
window._clearGardensFilters = _clearGardensFilters;

async function saveAdminGarden(e) {
  if (e) e.preventDefault();
  const soil = document.getElementById('admin-garden-soil')?.value || null;
  const irrigation = document.getElementById('admin-garden-irrigation')?.value || null;
  const exposure = document.getElementById('admin-garden-exposure')?.value || null;

  if (soil && !GARDEN_SOIL_VALUES.includes(soil)) { showToast('Tipo de suelo inválido', 'error'); return; }
  if (irrigation && !GARDEN_IRRIGATION_VALUES.includes(irrigation)) { showToast('Riego inválido', 'error'); return; }
  if (exposure && !GARDEN_EXPOSURE_VALUES.includes(exposure)) { showToast('Exposición inválida', 'error'); return; }

  // Recoger metas del jardín (sección "Metas del jardín")
  const goals = _readGardenGoalsFromForm('admin-garden');

  const garden = {
    name: document.getElementById('admin-garden-name')?.value.trim(),
    campus: document.getElementById('admin-garden-campus')?.value || null,
    location_lat: parseFloat(document.getElementById('admin-garden-lat')?.value) || null,
    location_lng: parseFloat(document.getElementById('admin-garden-lng')?.value) || null,
    location_desc: document.getElementById('admin-garden-desc')?.value.trim() || null,
    area_m2: parseFloat(document.getElementById('admin-garden-area')?.value) || null,
    max_capacity_trees: parseInt(document.getElementById('admin-garden-capacity')?.value) || null,
    soil_type: soil,
    irrigation_type: irrigation,
    exposure: exposure,
    climate_zone: document.getElementById('admin-garden-climate')?.value.trim() || null,
    established_date: document.getElementById('admin-garden-established')?.value || null,
    responsible_specialist_id: document.getElementById('admin-garden-specialist')?.value || null,
    notes: document.getElementById('admin-garden-notes')?.value.trim() || null,
    goals: goals,
  };
  if (!garden.name) { showToast('Nombre requerido', 'error'); return; }
  if (!garden.campus) { showToast('Campus requerido', 'error'); return; }
  const { error } = await sb.from('gardens').insert([garden]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Jardín creado', 'success');
  document.getElementById('form-admin-garden')?.reset();
  populateSpecialistDropdown('admin-garden-specialist');
  loadAdminGardens();
}

// Lee los selectores de metas del form (prefijo del id determina si es create o edit)
function _readGardenGoalsFromForm(prefix) {
  const v = id => document.getElementById(`${prefix}-${id}`)?.value || '';
  const num = id => {
    const x = parseInt(v(id), 10);
    return isNaN(x) ? null : x;
  };
  return {
    target_health: num('target-health'),
    target_visits: num('target-visits'),
    target_tree_coverage_pct: num('target-coverage'),
    target_activity_variety: num('target-variety'),
    period: v('target-period') || 'mensual',
    ai_suggested: !!document.getElementById(`${prefix}-goals-ai-flag`)?.value,
    ai_reasoning: document.getElementById(`${prefix}-goals-ai-reasoning`)?.value || null,
  };
}

// ============================================================================
// PUM-AI sugiere metas del jardín basándose en su metadata
// ============================================================================
async function suggestGardenGoalsWithAI() {
  const btn = document.getElementById('btn-garden-goals-ai');
  const feedback = document.getElementById('admin-garden-goals-ai-feedback');
  if (!btn) return;

  // Recoger contexto del jardín del form
  const ctx = {
    name: document.getElementById('admin-garden-name')?.value || 'jardín sin nombre',
    campus: document.getElementById('admin-garden-campus')?.value || 'desconocido',
    lat: document.getElementById('admin-garden-lat')?.value || '',
    lng: document.getElementById('admin-garden-lng')?.value || '',
    soil: document.getElementById('admin-garden-soil')?.value || 'no especificado',
    irrigation: document.getElementById('admin-garden-irrigation')?.value || 'no especificado',
    exposure: document.getElementById('admin-garden-exposure')?.value || 'no especificada',
    area: document.getElementById('admin-garden-area')?.value || '?',
    capacity: document.getElementById('admin-garden-capacity')?.value || '?',
    climate: document.getElementById('admin-garden-climate')?.value || 'Valle de México',
    notes: document.getElementById('admin-garden-notes')?.value || '',
  };

  if (!ctx.name || ctx.name === 'jardín sin nombre') {
    showToast('Llena al menos el nombre del jardín antes de pedir sugerencias', 'warning');
    return;
  }

  // Foto opcional + estación
  const photoFile = document.getElementById('admin-garden-photo')?.files?.[0];
  let imageData = null;
  try {
    if (photoFile) imageData = await _imageFileToBase64(photoFile);
  } catch (_) {}
  const season = (document.getElementById('admin-garden-season')?.value) || getCurrentSeason();

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando…';
  if (feedback) { feedback.style.display = 'none'; feedback.innerHTML = ''; }

  try {
    const prompt = `Eres PUM-AI, experto en jardinería del Valle de México (UNAM/FES Iztacala). Estoy registrando un jardín y necesito que me sugieras metas de gestión razonables y alcanzables.

Datos del jardín:
- Nombre: ${ctx.name}
- Campus: ${ctx.campus}
- Ubicación: lat ${ctx.lat || 'no especif.'}, lon ${ctx.lng || 'no especif.'}
- Suelo: ${ctx.soil}
- Riego: ${ctx.irrigation}
- Exposición solar: ${ctx.exposure}
- Área: ${ctx.area} m²
- Capacidad: ${ctx.capacity} árboles
- Zona climática: ${ctx.climate}
- Notas: ${ctx.notes || 'sin notas adicionales'}
- Estación del año al registrar: ${season} (hemisferio norte, Valle de México ~2240m altura, clima templado)
${imageData ? '\nSe adjunta una foto del jardín para que la analices.' : '\n(No hay foto disponible — usa solo datos textuales)'}

Considera que en verano el riego es crítico, en invierno la poda es prioritaria, y las visitas deben ser más frecuentes para jardines en establecimiento.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto adicional):

{
  "target_health": <número entero entre 50 y 90>,
  "target_visits": <número de visitas objetivo en el periodo: 1, 2, 4, 8 o 12>,
  "target_tree_coverage_pct": <50, 70, 80 o 100>,
  "target_activity_variety": <2, 3, 5 o 7>,
  "period": "mensual" | "trimestral" | "anual",
  "reasoning": "<2-3 frases explicando por qué estas metas son adecuadas para este jardín en esta estación>"
}`;

    const body = imageData
      ? { message: prompt, imageBase64: imageData.base64, imageType: imageData.mime }
      : { message: prompt };

    const { data, error } = await sb.functions.invoke('pum-ai', { body });
    if (error) throw error;

    let reply = data?.reply || '';
    reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(reply); }
    catch (_) {
      const m = reply.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed) throw new Error('Respuesta de PUM-AI no interpretable');

    // Setear los selectores con clamp a opciones válidas
    const setIf = (id, val) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const opt = Array.from(sel.options).find(o => String(o.value) === String(val));
      if (opt) sel.value = String(val);
    };
    setIf('admin-garden-target-health', parsed.target_health);
    setIf('admin-garden-target-visits', parsed.target_visits);
    setIf('admin-garden-target-coverage', parsed.target_tree_coverage_pct);
    setIf('admin-garden-target-variety', parsed.target_activity_variety);
    if (parsed.period && document.getElementById('admin-garden-target-period')) {
      document.getElementById('admin-garden-target-period').value = parsed.period;
    }

    // Marcador interno (para guardar que fueron AI-suggested)
    let flag = document.getElementById('admin-garden-goals-ai-flag');
    if (!flag) {
      flag = document.createElement('input');
      flag.type = 'hidden';
      flag.id = 'admin-garden-goals-ai-flag';
      btn.parentElement?.appendChild(flag);
    }
    flag.value = '1';

    let reason = document.getElementById('admin-garden-goals-ai-reasoning');
    if (!reason) {
      reason = document.createElement('input');
      reason.type = 'hidden';
      reason.id = 'admin-garden-goals-ai-reasoning';
      btn.parentElement?.appendChild(reason);
    }
    reason.value = parsed.reasoning || '';

    if (feedback) {
      feedback.innerHTML = `<strong style="color:#0d2d5c;"><i class="fas fa-robot"></i> PUM-AI sugiere:</strong> ${escapeHtml(parsed.reasoning || 'Metas aplicadas al formulario.')}`;
      feedback.style.display = 'block';
    }
    showToast('Metas sugeridas por PUM-AI ✓', 'success');
  } catch (e) {
    console.error('suggestGardenGoalsWithAI error:', e);
    if (feedback) {
      feedback.innerHTML = `<span style="color:#c00;"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(e.message || String(e))}. Llena las metas manualmente.</span>`;
      feedback.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function editAdminGarden(id) {
  const { data: g } = await sb.from('gardens').select('*').eq('id', id).single();
  if (!g) return;
  const { data: specialists } = await sb.from('user_profiles')
    .select('id, full_name, specialty').eq('role','specialist').order('full_name');
  const specOpts = '<option value="">— Sin asignar —</option>' +
    (specialists || []).map(s =>
      `<option value="${s.id}" ${g.responsible_specialist_id === s.id ? 'selected' : ''}>${escapeHtml(s.full_name)}${s.specialty ? ' — ' + escapeHtml(s.specialty) : ''}</option>`
    ).join('');
  const campusOpts = ['Iztacala','Acatlan','Aragon','Cuautitlan1','Cuautitlan','Zaragoza','CU'].map(c =>
    `<option value="${c}" ${g.campus === c ? 'selected' : ''}>${c === 'CU' ? 'CU' : 'FES ' + c}</option>`).join('');
  const soilOpts = '<option value="">—</option>' + GARDEN_SOIL_VALUES.map(v =>
    `<option value="${v}" ${g.soil_type === v ? 'selected' : ''}>${v}</option>`).join('');
  const irrOpts = '<option value="">—</option>' + GARDEN_IRRIGATION_VALUES.map(v =>
    `<option value="${v}" ${g.irrigation_type === v ? 'selected' : ''}>${v}</option>`).join('');
  const expOpts = '<option value="">—</option>' + GARDEN_EXPOSURE_VALUES.map(v =>
    `<option value="${v}" ${g.exposure === v ? 'selected' : ''}>${v.replace('_',' ')}</option>`).join('');

  showModal('Editar Jardín', `
    <form id="edit-garden-form">
      <div class="form-group" style="margin-bottom:0.5rem;"><label>Nombre</label><input type="text" id="edit-garden-name" value="${escapeHtml(g.name)}" style="width:100%;padding:0.5rem;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
        <div class="form-group"><label>Campus</label><select id="edit-garden-campus" style="width:100%;padding:0.5rem;">${campusOpts}</select></div>
        <div class="form-group"><label>Especialista</label><select id="edit-garden-specialist" style="width:100%;padding:0.5rem;">${specOpts}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
        <div class="form-group"><label>Latitud</label><input type="number" step="any" id="edit-garden-lat" value="${g.location_lat || ''}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group"><label>Longitud</label><input type="number" step="any" id="edit-garden-lng" value="${g.location_lng || ''}" style="width:100%;padding:0.5rem;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
        <div class="form-group"><label>Área (m²)</label><input type="number" step="any" id="edit-garden-area" value="${g.area_m2 || ''}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group"><label>Cap. árboles</label><input type="number" id="edit-garden-capacity" value="${g.max_capacity_trees || ''}" style="width:100%;padding:0.5rem;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
        <div class="form-group"><label>Suelo</label><select id="edit-garden-soil" style="width:100%;padding:0.5rem;">${soilOpts}</select></div>
        <div class="form-group"><label>Riego</label><select id="edit-garden-irrigation" style="width:100%;padding:0.5rem;">${irrOpts}</select></div>
        <div class="form-group"><label>Exposición</label><select id="edit-garden-exposure" style="width:100%;padding:0.5rem;">${expOpts}</select></div>
      </div>
      <div class="form-group" style="margin-bottom:0.5rem;"><label>Zona climática</label><input type="text" id="edit-garden-climate" value="${escapeHtml(g.climate_zone || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.5rem;"><label>Fecha establecimiento</label><input type="date" id="edit-garden-established" value="${g.established_date || ''}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.5rem;"><label>Descripción</label><textarea id="edit-garden-desc" style="width:100%;padding:0.5rem;">${escapeHtml(g.location_desc || '')}</textarea></div>
      <div class="form-group" style="margin-bottom:0.5rem;"><label>Notas</label><textarea id="edit-garden-notes" style="width:100%;padding:0.5rem;">${escapeHtml(g.notes || '')}</textarea></div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Guardar</button>
    </form>
  `);
  document.getElementById('edit-garden-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('gardens').update({
      name: document.getElementById('edit-garden-name').value.trim(),
      campus: document.getElementById('edit-garden-campus').value,
      location_lat: parseFloat(document.getElementById('edit-garden-lat').value) || null,
      location_lng: parseFloat(document.getElementById('edit-garden-lng').value) || null,
      location_desc: document.getElementById('edit-garden-desc').value.trim() || null,
      area_m2: parseFloat(document.getElementById('edit-garden-area').value) || null,
      max_capacity_trees: parseInt(document.getElementById('edit-garden-capacity').value) || null,
      soil_type: document.getElementById('edit-garden-soil').value || null,
      irrigation_type: document.getElementById('edit-garden-irrigation').value || null,
      exposure: document.getElementById('edit-garden-exposure').value || null,
      climate_zone: document.getElementById('edit-garden-climate').value.trim() || null,
      established_date: document.getElementById('edit-garden-established').value || null,
      responsible_specialist_id: document.getElementById('edit-garden-specialist').value || null,
      notes: document.getElementById('edit-garden-notes').value.trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Jardín actualizado', 'success');
    closeModal();
    loadAdminGardens();
  });
}

async function deleteAdminGarden(id) {
  if (!confirm('¿Eliminar este jardín?\n\n⚠ Se eliminarán TAMBIÉN:\n• Todas sus visitas (seguimientos)\n• Sus asignaciones a usuarios\n• Sus bitácoras y resúmenes anuales\n\nLos árboles dentro del jardín NO se borrarán, solo perderán la asociación.')) return;

  try {
    // Borrar dependencias en orden
    const tables = [
      'garden_visits',
      'garden_assignments',
      'garden_monthly_summaries',
      'garden_annual_summaries',
    ];
    for (const t of tables) {
      const { error } = await sb.from(t).delete().eq('garden_id', id);
      if (error && !/relation .* does not exist/.test(error.message)) {
        console.warn(`Cleanup ${t} warning:`, error.message);
      }
    }

    // Desasociar árboles del jardín (no los borra, solo nullifica garden_id)
    const { error: utErr } = await sb.from('trees_catalog').update({ garden_id: null }).eq('garden_id', id);
    if (utErr) console.warn('Tree disassociate warning:', utErr.message);

    // Finalmente borrar el jardín
    const { error } = await sb.from('gardens').delete().eq('id', id);
    if (error) throw error;

    showToast('Jardín eliminado correctamente', 'success');
    loadAdminGardens();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
    console.error('deleteAdminGarden:', err);
  }
}

// ---- GROUPS ----
let _groupsCache = [];
async function loadAdminGroups() {
  try {
    let q = sb.from('user_groups').select('*, group_members(count)').order('name');
    // Filtrado por campus (admin-campus / responsable / dropdown global del admin principal)
    const campusFilter = effectiveCampusFilter();
    if (campusFilter) q = q.eq('campus', campusFilter);
    const { data, error } = await q;
    if (error) throw error;

    // Traer SIMULTÁNEAMENTE los campus de cada miembro de cada grupo.
    // 1 query a group_members + 1 a user_profiles. Mapeamos en cliente.
    const groupIds = (data || []).map(g => g.id);
    const campusByGroup = new Map();   // group_id -> Map(campus -> count)
    if (groupIds.length > 0) {
      const [memRes, profRes] = await Promise.all([
        sb.from('group_members').select('group_id, user_id').in('group_id', groupIds),
        sb.from('user_profiles').select('id, campus'),
      ]);
      const profCampus = new Map((profRes.data || []).map(p => [p.id, p.campus || null]));
      (memRes.data || []).forEach(m => {
        const c = profCampus.get(m.user_id) || 'Sin campus';
        if (!campusByGroup.has(m.group_id)) campusByGroup.set(m.group_id, new Map());
        const inner = campusByGroup.get(m.group_id);
        inner.set(c, (inner.get(c) || 0) + 1);
      });
    }

    _groupsCache = (data || []).map(g => ({
      ...g,
      _memberCount: g.group_members?.[0]?.count || 0,
      _campusCounts: campusByGroup.get(g.id) || new Map(),
    }));
    _renderGroups(_groupsCache);
  } catch (err) {
    showToast('Error cargando grupos: ' + err.message, 'error');
  }
}

function _renderGroups(rows) {
  const tbody = document.getElementById('groups-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  // Etiqueta humanizada por campus (consistente con resto del admin)
  const CAMPUS_LABEL_GRP = {
    'Iztacala':   'FES Iztacala',
    'Acatlan':    'FES Acatlán',
    'Aragon':     'FES Aragón',
    'Cuautitlan': 'FES Cuautitlán',
    'Cuautitlan1':'FES Cuautitlán C1',
    'Zaragoza':   'FES Zaragoza',
    'CU':         'Ciudad Universitaria',
    'Sin campus': 'Sin campus',
  };
  rows.forEach(g => {
    const row = document.createElement('tr');
    const counts = g._campusCounts instanceof Map ? g._campusCounts : new Map();
    const sortedCampus = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const campusChips = sortedCampus.length === 0
      ? '<span style="color:#aaa;font-size:0.78rem;">Sin miembros</span>'
      : sortedCampus.map(([c, n]) => {
          const isUnknown = c === 'Sin campus';
          const color = isUnknown ? '#666' : '#0d2d5c';
          const bg = isUnknown ? '#f0f0f0' : '#e8f5fe';
          const border = isUnknown ? '#ddd' : '#c9e1f5';
          return `<span style="display:inline-block;font-size:0.72rem;background:${bg};color:${color};padding:2px 8px;border-radius:10px;margin:1px 2px 1px 0;border:1px solid ${border};white-space:nowrap;">
            <i class="fas fa-map-marker-alt" style="font-size:0.6rem;"></i>
            ${escapeHtml(CAMPUS_LABEL_GRP[c] || c)} <strong>×${n}</strong>
          </span>`;
        }).join('');
    row.innerHTML = `
      <td>${escapeHtml(g.name)} <small style="color:#888;">(${g._memberCount} miembros)</small></td>
      <td>${escapeHtml(g.description || '-')}</td>
      <td style="line-height:1.6;">${campusChips}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="manageGroupMembers('${g.id}', '${safeJsAttr(g.name)}')">Miembros</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAdminGroup('${g.id}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Mapa keys → label humanizada en minúsculas, usado por el filtro de grupos
// (lo dejamos en módulo para evitar IIFE inline que el parser no aceptaba)
const _GROUP_FILTER_CAMPUS_LABELS = {
  'Iztacala':   'fes iztacala',
  'Acatlan':    'fes acatlán',
  'Aragon':     'fes aragón',
  'Cuautitlan': 'fes cuautitlán',
  'Cuautitlan1':'fes cuautitlán c1',
  'Zaragoza':   'fes zaragoza',
  'CU':         'ciudad universitaria',
  'Sin campus': 'sin campus',
};

function _filterGroups() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fName = get('grp-name'), fDesc = get('grp-desc'), fCampus = get('grp-campus');
  const filtered = _groupsCache.filter(g => {
    if (fName && !(g.name || '').toLowerCase().includes(fName)) return false;
    if (fDesc && !(g.description || '').toLowerCase().includes(fDesc)) return false;
    if (fCampus) {
      // Buscar en los nombres de campus de los miembros (key y label humanizada)
      const counts = g._campusCounts instanceof Map ? g._campusCounts : new Map();
      const keys = Array.from(counts.keys());
      const labels = keys.map(k => _GROUP_FILTER_CAMPUS_LABELS[k] || k.toLowerCase());
      const haystack = keys.join(' ').toLowerCase() + ' ' + labels.join(' ');
      if (!haystack.includes(fCampus)) return false;
    }
    return true;
  });
  _renderGroups(filtered);
}

function _clearGroupsFilters() {
  ['grp-name','grp-desc','grp-campus'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderGroups(_groupsCache);
}

window._filterGroups = _filterGroups;
window._clearGroupsFilters = _clearGroupsFilters;

async function saveAdminGroup(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('admin-group-name')?.value.trim();
  const desc = document.getElementById('admin-group-desc')?.value.trim();
  if (!name) { showToast('Nombre requerido', 'error'); return; }
  // Campus: admin-campus/responsable → su campus; admin principal → respeta selector global o default Iztacala
  const groupCampus = (isAdminCampusRole() || isResponsableRole())
    ? _userCampus()
    : (effectiveCampusFilter() || _userCampus() || 'Iztacala');
  const { error } = await sb.from('user_groups').insert([{
    name, description: desc, campus: groupCampus, created_by: currentUser?.id
  }]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Grupo creado', 'success');
  document.getElementById('form-admin-group')?.reset();
  loadAdminGroups();
}

async function deleteAdminGroup(id) {
  if (!confirm('¿Eliminar este grupo y todos sus miembros?')) return;
  try {
    await sb.from('group_members').delete().eq('group_id', id);
    const { error } = await sb.from('user_groups').delete().eq('id', id);
    if (error) throw error;
    showToast('Grupo eliminado', 'success');
    loadAdminGroups();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function manageGroupMembers(groupId, groupName) {
  try {
    // Dos queries separadas (más robusto ante quirks de RLS / FK joins)
    const { data: rawMembers, error: errM } = await sb
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    if (errM) throw errM;

    // Traemos campus también para mostrarlo al lado del nombre/rol.
    const { data: allUsers, error: errU } = await sb
      .from('user_profiles')
      .select('id, full_name, role, campus')
      .order('full_name');
    if (errU) throw errU;

    // Etiqueta humanizada por campus (consistente con el resto del admin)
    const CAMPUS_LABEL = {
      'Iztacala':   'FES Iztacala',
      'Acatlan':    'FES Acatlán',
      'Aragon':     'FES Aragón',
      'Cuautitlan': 'FES Cuautitlán',
      'Cuautitlan1':'FES Cuautitlán C1',
      'Zaragoza':   'FES Zaragoza',
      'CU':         'Ciudad Universitaria',
    };
    const campusBadge = (campus) => {
      if (!campus) return '';
      const label = CAMPUS_LABEL[campus] || campus;
      return `<span style="font-size:0.7rem;background:#e8f5fe;color:#0d2d5c;padding:2px 8px;border-radius:10px;margin-left:6px;border:1px solid #c9e1f5;" title="Campus del usuario">
        <i class="fas fa-map-marker-alt" style="font-size:0.65rem;"></i> ${escapeHtml(label)}
      </span>`;
    };

    const userMap = new Map((allUsers || []).map(u => [u.id, u]));
    const memberIds = (rawMembers || []).map(m => m.user_id);
    const members = memberIds.map(id => ({
      user_id: id,
      profile: userMap.get(id) || null,
    }));

    // Resumen por campus arriba del listado (ej. "FES Iztacala × 5 · CU × 2")
    const campusCounts = {};
    members.forEach(m => {
      if (!m.profile) return;
      const c = m.profile.campus || 'Sin campus';
      campusCounts[c] = (campusCounts[c] || 0) + 1;
    });
    const campusSummaryEntries = Object.entries(campusCounts).sort((a, b) => b[1] - a[1]);
    const campusSummary = campusSummaryEntries.length === 0 ? '' :
      `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.4rem 0 0.8rem;font-size:0.75rem;">
        ${campusSummaryEntries.map(([c, n]) => `
          <span style="background:#0d2d5c;color:white;padding:3px 10px;border-radius:12px;">
            <i class="fas fa-map-marker-alt" style="font-size:0.65rem;"></i>
            ${escapeHtml(CAMPUS_LABEL[c] || c)} <strong>×${n}</strong>
          </span>`).join('')}
      </div>`;

    let membersHtml = members.map(m => {
      const name = m.profile ? (m.profile.full_name || 'Sin nombre') : 'Usuario eliminado';
      const role = m.profile ? m.profile.role : '';
      const campus = m.profile ? m.profile.campus : '';
      const roleBadge = role
        ? `<span style="font-size:0.7rem;background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;margin-left:6px;">${escapeHtml(role)}</span>`
        : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;gap:8px;">
        <span style="flex:1;min-width:0;">${escapeHtml(name)}${roleBadge}${campusBadge(campus)}</span>
        <button onclick="removeGroupMember('${groupId}', '${m.user_id}', '${safeJsAttr(groupName)}')" class="btn btn-sm btn-danger" style="flex-shrink:0;">Quitar</button>
      </div>`;
    }).join('') || '<p class="text-muted" style="padding:8px;">Sin miembros</p>';

    // Para "Agregar miembro": mostrar TODOS los usuarios (no filtrar los que ya
    // están), porque un usuario puede estar en varios grupos. El INSERT con
    // UNIQUE(group_id, user_id) bloqueará el duplicado solo si ya está en ESTE
    // grupo, lo cual también detectamos manualmente para mejor UX.
    let optionsHtml = (allUsers || [])
      .map(u => {
        const isMember = memberIds.includes(u.id);
        const campusLabel = u.campus ? (CAMPUS_LABEL[u.campus] || u.campus) : '';
        const parts = [u.full_name || 'Sin nombre'];
        if (u.role) parts.push(u.role);
        if (campusLabel) parts.push(campusLabel);
        const label = parts.join(' · ') + (isMember ? ' (ya en este grupo)' : '');
        return `<option value="${u.id}"${isMember ? ' disabled' : ''} data-campus="${escapeHtml(u.campus || '')}">${escapeHtml(label)}</option>`;
      }).join('');

    showModal(`Miembros: ${groupName}`, `
      <div style="margin-bottom:1.5rem;">
        <h4 style="margin-bottom:0.3rem;">Miembros (${members.length})</h4>
        ${campusSummary}
        <div style="max-height:240px;overflow-y:auto;border:1px solid #eee;border-radius:8px;">${membersHtml}</div>
      </div>
      <div>
        <h4>Agregar miembro</h4>
        <p style="font-size:0.78rem;color:#666;margin:0.3rem 0;">Un usuario puede estar en varios grupos. El nombre del usuario muestra <em>rol · campus</em>.</p>
        <div style="display:flex;gap:8px;margin-top:0.5rem;">
          <select id="add-member-select" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;">
            <option value="">Selecciona usuario...</option>${optionsHtml}
          </select>
          <button onclick="addGroupMember('${groupId}', '${safeJsAttr(groupName)}')" class="btn btn-primary btn-sm">Agregar</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast('Error cargando miembros: ' + err.message, 'error');
  }
}

async function addGroupMember(groupId, groupName) {
  const userId = document.getElementById('add-member-select')?.value;
  if (!userId) { showToast('Selecciona un usuario', 'warning'); return; }
  const { error } = await sb.from('group_members').insert([{ group_id: groupId, user_id: userId }]);
  if (error) {
    // Mensaje más claro si es duplicado en este grupo
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      showToast('Ese usuario ya está en este grupo', 'warning');
    } else {
      showToast('Error: ' + error.message, 'error');
    }
    return;
  }
  showToast('Miembro agregado', 'success');
  manageGroupMembers(groupId, groupName);
}

async function removeGroupMember(groupId, userId, groupName) {
  const { error } = await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Miembro removido', 'success');
  manageGroupMembers(groupId, groupName);
}

// ---- NOTIFICATIONS (fix check constraint) ----
// ============================================================================
// TELEGRAM BLAST (envío masivo @Pumai_treebot)
// ============================================================================
const TG_ROLES = ['admin','admin-campus','responsable','specialist','user','rectoria'];

function onTgFilterChange() {
  const f = document.getElementById('tg-filter')?.value;
  const wrap = document.getElementById('tg-value-wrap');
  const sel = document.getElementById('tg-value-select');
  const inp = document.getElementById('tg-value-input');
  const label = document.getElementById('tg-value-label');
  if (!wrap) return;
  // Reset
  wrap.style.display = 'none';
  sel.style.display = 'none';
  inp.style.display = 'none';
  sel.innerHTML = '';
  inp.value = '';

  if (f === 'all') return;

  wrap.style.display = '';

  if (f === 'role') {
    label.textContent = 'Rol';
    sel.style.display = '';
    sel.innerHTML = TG_ROLES.map(r => `<option value="${r}">${r}</option>`).join('');
  } else if (f === 'campus') {
    label.textContent = 'Campus';
    sel.style.display = '';
    const opts = ['Iztacala','Acatlan','Aragon','Cuautitlan1','Cuautitlan','Zaragoza','CU'];
    sel.innerHTML = opts.map(c => `<option value="${c}">${c}</option>`).join('');
    if (isAdminCampusRole()) {
      sel.value = _userCampus();
      sel.disabled = true;
    }
  } else if (f === 'group') {
    label.textContent = 'Grupo';
    sel.style.display = '';
    sel.innerHTML = '<option value="">Cargando grupos…</option>';
    sb.from('user_groups').select('id, name, campus').order('name')
      .then(({ data }) => {
        const campusFilter = isAdminCampusRole() ? _userCampus() : null;
        const groups = (data || []).filter(g => !campusFilter || g.campus === campusFilter);
        sel.innerHTML = groups.length
          ? groups.map(g => `<option value="${g.id}">${g.name} (${g.campus||'—'})</option>`).join('')
          : '<option value="">No hay grupos</option>';
      });
  } else if (f === 'user') {
    label.textContent = 'Email o ID del usuario';
    inp.style.display = '';
    inp.placeholder = 'correo@unam.mx o UUID';
  }
}

function _tgGetFilterValue() {
  const f = document.getElementById('tg-filter').value;
  if (f === 'all') return { filter: 'all', value: null };
  const sel = document.getElementById('tg-value-select');
  const inp = document.getElementById('tg-value-input');
  let value = (sel.style.display !== 'none' ? sel.value : inp.value).trim();
  return { filter: f, value };
}

async function previewTelegramBlast() {
  const status = document.getElementById('tg-status');
  status.textContent = 'Calculando…';
  try {
    const { filter, value } = _tgGetFilterValue();
    let v = value;
    // Para 'user' por email, resolver a id primero (la edge espera UUID)
    if (filter === 'user' && value && value.includes('@')) {
      const { data: u } = await sb.from('user_profiles')
        .select('id').eq('id', value).maybeSingle();
      // Email → id: no podemos buscar por email en user_profiles directo;
      // simpler: enviar el email a un endpoint para resolver. Por ahora dejamos
      // que el caller pase UUID y mostramos error.
      if (!u) {
        status.innerHTML = '<span style="color:var(--danger);">Para destino "Usuario específico" pega el UUID del user_profile (no email). Lo puedes ver en el tab Usuarios.</span>';
        return;
      }
      v = u.id;
    }
    const { data, error } = await sb.functions.invoke('send-telegram-notification', {
      body: { filter, value: v, message: '__preview__', dry_run: true }
    });
    if (error) throw error;
    const sample = (data?.recipients_sample || [])
      .map(r => `• ${escapeHtml(r.name || '?')} (${escapeHtml(r.role||'')} · ${escapeHtml(r.campus||'')})`).join('<br>');
    status.innerHTML = `
      <strong style="color:#229ED9;">${data?.recipients_total ?? 0}</strong>
      destinatarios con Telegram vinculado.
      ${sample ? '<details style="margin-top:0.3rem;"><summary>Muestra (primeros 10)</summary><div style="font-size:0.78rem;color:#555;margin-top:0.3rem;">' + sample + '</div></details>' : ''}
    `;
  } catch (err) {
    status.innerHTML = '<span style="color:var(--danger);">Error: ' + escapeHtml(err.message || err) + '</span>';
    if (typeof logError === 'function') logError({ action: 'previewTelegramBlast', error: err });
  }
}

async function sendTelegramBlast() {
  const status = document.getElementById('tg-status');
  const message = document.getElementById('tg-message').value.trim();
  if (!message) { showToast('Escribe un mensaje', 'warning'); return; }
  if (message.length > 4000) { showToast('Máximo 4000 caracteres', 'warning'); return; }

  const { filter, value } = _tgGetFilterValue();
  if (filter !== 'all' && !value) { showToast('Elige un destinatario', 'warning'); return; }

  const photoUrl = (document.getElementById('tg-photo-url').value || '').trim() || null;

  // Confirmación con conteo previo
  status.textContent = 'Calculando destinatarios…';
  try {
    const { data: pre } = await sb.functions.invoke('send-telegram-notification', {
      body: { filter, value, message: '__preview__', dry_run: true }
    });
    const total = pre?.recipients_total ?? 0;
    if (total === 0) {
      status.innerHTML = '<span style="color:var(--danger);">0 destinatarios — nadie con Telegram vinculado coincide con el filtro.</span>';
      return;
    }
    if (!confirm(`¿Enviar este mensaje a ${total} usuarios vía Telegram?\n\nEsto NO se puede deshacer.`)) {
      status.textContent = '';
      return;
    }

    status.innerHTML = `<span style="color:#229ED9;">Enviando a ${total}…</span>`;
    const { data, error } = await sb.functions.invoke('send-telegram-notification', {
      body: { filter, value, message, photo_url: photoUrl, parse_mode: 'HTML' }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const sent = data?.sent ?? 0;
    const failed = data?.failed ?? 0;
    status.innerHTML = `
      <span style="color:var(--success);">✅ Enviados: <b>${sent}</b></span>
      ${failed > 0 ? ` · <span style="color:var(--danger);">Fallaron: <b>${failed}</b></span>` : ''}
      · ${Math.round((data?.duration_ms||0)/1000)}s
    `;
    showToast(`Enviado a ${sent} usuarios. ${failed > 0 ? failed + ' fallaron.' : ''}`,
              failed > 0 ? 'warning' : 'success');
    document.getElementById('tg-message').value = '';
    document.getElementById('tg-photo-url').value = '';
  } catch (err) {
    status.innerHTML = '<span style="color:var(--danger);">Error: ' + escapeHtml(err.message || err) + '</span>';
    if (typeof logError === 'function') logError({ action: 'sendTelegramBlast', error: err });
  }
}

async function loadTelegramHistory() {
  const c = document.getElementById('tg-history-container');
  if (!c) return;
  c.innerHTML = '<p class="text-muted">Cargando…</p>';
  try {
    const { data, error } = await sb.from('telegram_messages_log')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    if (!data || data.length === 0) {
      c.innerHTML = '<p class="text-muted">Sin envíos previos.</p>';
      return;
    }
    let html = '<table class="admin-table"><thead><tr>' +
      '<th>Fecha</th><th>Quién</th><th>Destino</th><th>Mensaje</th><th>Enviados</th><th>Estado</th>' +
      '</tr></thead><tbody>';
    data.forEach(r => {
      const date = new Date(r.created_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
      const preview = escapeHtml((r.message_text || '').slice(0, 100)) + ((r.message_text||'').length > 100 ? '…' : '');
      const stateColor = r.status === 'completed' ? 'var(--success)' : (r.status === 'failed' ? 'var(--danger)' : '#777');
      html += `<tr>
        <td data-label="Fecha"><span style="font-family:monospace;font-size:0.78rem;">${date}</span></td>
        <td data-label="Quién">${escapeHtml(r.sent_by_email||'—')}<br><small>${escapeHtml(r.sent_by_role||'')} · ${escapeHtml(r.sent_by_campus||'')}</small></td>
        <td data-label="Destino">${escapeHtml(r.target_label||r.target_filter)}</td>
        <td data-label="Mensaje"><span style="font-size:0.85rem;">${preview}</span></td>
        <td data-label="Enviados"><b>${r.recipients_sent}</b>/${r.recipients_total}${r.recipients_failed>0?` <span style="color:var(--danger);">(${r.recipients_failed} fail)</span>`:''}</td>
        <td data-label="Estado"><span style="color:${stateColor};font-weight:600;">${r.status}</span></td>
      </tr>`;
    });
    html += '</tbody></table>';
    c.innerHTML = html;
  } catch (err) {
    c.innerHTML = '<p style="color:var(--danger);">Error: ' + escapeHtml(err.message) + '</p>';
    if (typeof logError === 'function') logError({ action: 'loadTelegramHistory', error: err });
  }
}

window.onTgFilterChange = onTgFilterChange;
window.previewTelegramBlast = previewTelegramBlast;
window.sendTelegramBlast = sendTelegramBlast;
window.loadTelegramHistory = loadTelegramHistory;

async function loadAdminNotifications() {
  try {
    const { data: groups } = await sb.from('user_groups').select('id, name').order('name');
    const { data: users } = await sb.from('user_profiles').select('id, full_name').order('full_name');

    const targetSelect = document.getElementById('notifUser');
    if (targetSelect) {
      targetSelect.innerHTML = '<option value="">Selecciona...</option>';
      (users || []).forEach(u => {
        targetSelect.innerHTML += `<option value="user:${u.id}">👤 ${escapeHtml(u.full_name || 'Sin nombre')}</option>`;
      });
      (groups || []).forEach(g => {
        targetSelect.innerHTML += `<option value="group:${g.id}">📂 Grupo: ${escapeHtml(g.name)}</option>`;
      });
    }

    const { data: history } = await sb.from('notifications').select('*').order('sent_at', { ascending: false }).limit(200);
    _notificationsCache = history || [];
    _renderNotifications(_notificationsCache);
  } catch (err) {
    showToast('Error cargando notificaciones: ' + err.message, 'error');
  }
}

let _notificationsCache = [];

function _renderNotifications(rows) {
  const tbody = document.getElementById('notificationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  rows.forEach(n => {
    const dest = n.target_user_id ? 'Usuario' : n.target_group_id ? 'Grupo' : 'Todos';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(n.title || '-')}</td>
      <td>${dest}</td>
      <td>${formatDate(n.sent_at)}</td>
      <td>${n.telegram_sent ? '✅ Enviada' : '⏳ Pendiente'}</td>
    `;
    tbody.appendChild(row);
  });
}

function _filterNotifications() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fTitle = get('n-title'), fDest = get('n-dest'), fDate = get('n-date'), fStatus = get('n-status');
  const filtered = _notificationsCache.filter(n => {
    if (fTitle && !(n.title || '').toLowerCase().includes(fTitle)) return false;
    if (fDest) {
      const dest = (n.target_user_id ? 'usuario' : n.target_group_id ? 'grupo' : 'todos');
      if (!dest.includes(fDest)) return false;
    }
    if (fDate) {
      const dateStr = (n.sent_at || '').toLowerCase();
      if (!dateStr.includes(fDate)) return false;
    }
    if (fStatus) {
      const statusMatches = (fStatus === 'enviada' && n.telegram_sent)
        || (fStatus === 'fallida' && n.telegram_failed)
        || (fStatus === 'leida' && n.read_at)
        || (fStatus === 'no leida' && !n.read_at);
      if (!statusMatches) return false;
    }
    return true;
  });
  _renderNotifications(filtered);
}

function _clearNotificationsFilters() {
  ['n-title','n-dest','n-date','n-status'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderNotifications(_notificationsCache);
}

window._filterNotifications = _filterNotifications;
window._clearNotificationsFilters = _clearNotificationsFilters;

// sendNotification fue eliminada: las notificaciones in-app no se mostraban
// en ninguna UI del usuario (no había inbox), así que quedaban huérfanas en
// BD. Ahora toda comunicación a usuarios se hace exclusivamente vía Telegram
// usando el bloque "Telegram — envío masivo" (sendTelegramBlast).

// ---- ASSIGNMENTS TAB ----
async function loadAssignments() {
  try {
    // Populate dropdowns — INCLUIR campus en el SELECT para que el filtro client-side
    // por campus en populateAssignTarget / assign-tree funcione correctamente.
    const { data: users } = await sb.from('user_profiles').select('id, full_name, campus, role').order('full_name');
    const { data: groups } = await sb.from('user_groups').select('id, name, campus').order('name');
    const { data: trees } = await sb.from('trees_catalog').select('id, tree_code, common_name, species, campus').order('tree_code');
    const { data: gardens } = await sb.from('gardens').select('id, name, campus').order('name');

    // Tree assignment target dropdown
    populateAssignTarget('assign-target-type', 'assign-target', users, groups);
    // Garden assignment target dropdown
    populateAssignTarget('assign-garden-target-type', 'assign-garden-target', users, groups);

    // Load existing tree assignments to mark those as disabled
    const { data: treeAssignmentsData } = await sb.from('tree_assignments')
      .select('tree_id')
      .order('assigned_at', { ascending: false });
    const assignedTreeIds = new Set((treeAssignmentsData || []).map(a => a.tree_id));

    // Tree dropdown — filtrado por campus para admin-campus/responsable
    const treeSelect = document.getElementById('assign-tree');
    if (treeSelect) {
      treeSelect.innerHTML = '<option value="">Selecciona árbol...</option>';
      const campusFilter = effectiveCampusFilter();
      (trees || []).filter(t => !campusFilter || t.campus === campusFilter).forEach(t => {
        const isAssigned = assignedTreeIds.has(t.id);
        const suffix = isAssigned ? ' (Ya asignado)' : '';
        const disabled = isAssigned ? 'disabled' : '';
        treeSelect.innerHTML += `<option value="${t.id}" ${disabled}>${escapeHtml(t.tree_code)} - ${escapeHtml(t.common_name || t.species)} (${escapeHtml(t.campus || '?')})${suffix}</option>`;
      });
    }

    // Garden dropdown
    const gardenSelect = document.getElementById('assign-garden-select');
    if (gardenSelect) {
      gardenSelect.innerHTML = '<option value="">Selecciona jardín...</option>';
      (gardens || []).forEach(g => {
        gardenSelect.innerHTML += `<option value="${g.id}">${escapeHtml(g.name)} (${escapeHtml(g.campus || '-')})</option>`;
      });
    }

    // Specialist dropdown — populated dynamically from BD (no more hardcoded list)
    const specSelect = document.getElementById('assign-specialist');
    if (specSelect) {
      const { data: specs } = await sb.from('user_profiles')
        .select('id, full_name, specialty')
        .eq('role', 'specialist')
        .order('full_name');
      specSelect.innerHTML = '<option value="">Ninguno</option>';
      (specs || []).forEach(s => {
        const label = `${s.full_name}${s.specialty ? ' — ' + s.specialty : ''}`;
        specSelect.innerHTML += `<option value="${escapeHtml(s.id)}">${escapeHtml(label)}</option>`;
      });
      specSelect.innerHTML += '<option value="Otro">Otro (texto libre)</option>';
    }

    // Listen for type changes
    document.getElementById('assign-target-type')?.addEventListener('change', function() {
      populateAssignTarget('assign-target-type', 'assign-target', users, groups);
    });
    document.getElementById('assign-garden-target-type')?.addEventListener('change', function() {
      populateAssignTarget('assign-garden-target-type', 'assign-garden-target', users, groups);
    });

    // Listen for specialist dropdown changes to show/hide custom specialist input
    document.getElementById('assign-specialist')?.addEventListener('change', function() {
      const customRow = document.getElementById('specialist-custom-row');
      if (this.value === 'Otro') {
        customRow.style.display = 'block';
        document.getElementById('assign-specialist-custom')?.focus();
      } else {
        customRow.style.display = 'none';
        document.getElementById('assign-specialist-custom').value = '';
      }
    });

    // Load existing tree assignments (simple query, then lookup names)
    const { data: treeAssignments } = await sb.from('tree_assignments')
      .select('*')
      .order('assigned_at', { ascending: false });

    // Build lookups for tree assignments
    const taTreeIds = [...new Set((treeAssignments || []).map(a => a.tree_id))];
    const taUserIds = [...new Set((treeAssignments || []).filter(a => a.user_id).map(a => a.user_id))];
    const taGroupIds = [...new Set((treeAssignments || []).filter(a => a.group_id).map(a => a.group_id))];

    let taTreeMap = {}, taUserMap = {}, taGroupMap = {};
    if (taTreeIds.length > 0) {
      const { data: td } = await sb.from('trees_catalog').select('id, tree_code, common_name, campus').in('id', taTreeIds);
      (td || []).forEach(t => { taTreeMap[t.id] = t; });
    }
    if (taUserIds.length > 0) {
      const { data: ud } = await sb.from('user_profiles').select('id, full_name').in('id', taUserIds);
      (ud || []).forEach(u => { taUserMap[u.id] = u; });
    }
    if (taGroupIds.length > 0) {
      const { data: gd } = await sb.from('user_groups').select('id, name').in('id', taGroupIds);
      (gd || []).forEach(g => { taGroupMap[g.id] = g; });
    }

    // Pre-cargar TODOS los especialistas para resolver UUIDs viejos en notes
    const { data: allSpecialists } = await sb.from('user_profiles')
      .select('id, full_name, specialty').eq('role', 'specialist');
    const specialistMap = {};
    (allSpecialists || []).forEach(s => {
      specialistMap[s.id] = s.full_name + (s.specialty ? ` — ${s.specialty}` : '');
    });
    const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Pre-procesar cada asignación de árbol con los campos display
    const treeAssignmentsEnrichedAll = (treeAssignments || []).map(a => {
      const tree = taTreeMap[a.tree_id] || {};
      const targetName = a.user_id ? (taUserMap[a.user_id]?.full_name || 'Usuario') : (taGroupMap[a.group_id]?.name || 'Grupo');
      const type = a.user_id ? 'Usuario' : 'Grupo';
      const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';
      let specialist = '-';
      if (a.notes && a.notes.startsWith('[ESPECIALISTA:')) {
        const match = a.notes.match(/\[ESPECIALISTA:\s*([^\]]+)\]/);
        if (match) {
          let raw = match[1].trim();
          // Si el valor es un UUID, resolver al nombre del especialista
          specialist = UUID_RX.test(raw) ? (specialistMap[raw] || raw) : raw;
        }
      }
      // campus al nivel raíz para que el sort y filtro funcionen sobre r.campus
      return { raw: a, tree, campus: tree.campus || null, targetName, type, badgeClass, specialist };
    });
    // Filtrar por campus efectivo del usuario actual (admin-campus / responsable ven solo el suyo;
    // admin principal ve todo si no hay campus filter, o filtra cuando elige uno).
    const _campusEff_TA = effectiveCampusFilter();
    const treeAssignmentsEnriched = _campusEff_TA
      ? treeAssignmentsEnrichedAll.filter(r => r.campus === _campusEff_TA)
      : treeAssignmentsEnrichedAll;
    _treeAssignmentsCache = treeAssignmentsEnriched;
    _renderTreeAssignments(treeAssignmentsEnriched);

    // Load existing garden assignments (simple query)
    const { data: gardenAssignments } = await sb.from('garden_assignments')
      .select('*')
      .order('assigned_at', { ascending: false });

    const gaGardenIds = [...new Set((gardenAssignments || []).map(a => a.garden_id))];
    const gaUserIds = [...new Set((gardenAssignments || []).filter(a => a.user_id).map(a => a.user_id))];
    const gaGroupIds = [...new Set((gardenAssignments || []).filter(a => a.group_id).map(a => a.group_id))];

    let gaGardenMap = {}, gaUserMap = {}, gaGroupMap = {};
    if (gaGardenIds.length > 0) {
      const { data: gard } = await sb.from('gardens').select('id, name, campus').in('id', gaGardenIds);
      (gard || []).forEach(g => { gaGardenMap[g.id] = g; });
    }
    if (gaUserIds.length > 0) {
      const { data: ud2 } = await sb.from('user_profiles').select('id, full_name').in('id', gaUserIds);
      (ud2 || []).forEach(u => { gaUserMap[u.id] = u; });
    }
    if (gaGroupIds.length > 0) {
      const { data: gd2 } = await sb.from('user_groups').select('id, name').in('id', gaGroupIds);
      (gd2 || []).forEach(g => { gaGroupMap[g.id] = g; });
    }

    // Pre-procesar cada asignación de jardín con los campos display
    const gardenAssignmentsEnrichedAll = (gardenAssignments || []).map(a => {
      const garden = gaGardenMap[a.garden_id] || {};
      const targetName = a.user_id ? (gaUserMap[a.user_id]?.full_name || 'Usuario') : (gaGroupMap[a.group_id]?.name || 'Grupo');
      const type = a.user_id ? 'Usuario' : 'Grupo';
      const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';
      return { raw: a, garden, campus: garden.campus || null, targetName, type, badgeClass };
    });
    const _campusEff_GA = effectiveCampusFilter();
    const gardenAssignmentsEnriched = _campusEff_GA
      ? gardenAssignmentsEnrichedAll.filter(r => r.campus === _campusEff_GA)
      : gardenAssignmentsEnrichedAll;
    _gardenAssignmentsCache = gardenAssignmentsEnriched;
    _renderGardenAssignments(gardenAssignmentsEnriched);

  } catch (err) {
    console.error('Load assignments error:', err);
    showToast('Error cargando asignaciones: ' + err.message, 'error');
  }
}

// ============================================================================
// FILTROS DE ASIGNACIONES — mismo patrón que tablas de árboles
// ============================================================================
let _treeAssignmentsCache = [];
let _gardenAssignmentsCache = [];

function _renderTreeAssignments(rows) {
  const tbody = document.getElementById('tree-assignments-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  rows.forEach(r => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Árbol">🌳 ${escapeHtml(r.tree.tree_code || '-')} - ${escapeHtml(r.tree.common_name || '')}</td>
      <td data-label="Campus">${escapeHtml(r.campus || '-')}</td>
      <td data-label="Asignado a">${escapeHtml(r.targetName)}</td>
      <td data-label="Tipo"><span class="assignment-badge ${r.badgeClass}">${r.type}</span></td>
      <td data-label="Especialista">${escapeHtml(r.specialist)}</td>
      <td data-label="Fecha">${formatDate(r.raw.assigned_at)}</td>
      <td data-label="Acciones"><button class="btn btn-sm btn-danger" onclick="removeTreeAssignment('${r.raw.id}')">Quitar</button></td>
    `;
    tbody.appendChild(row);
  });
}

function _renderGardenAssignments(rows) {
  const tbody = document.getElementById('garden-assignments-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  rows.forEach(r => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Jardín">🌿 ${escapeHtml(r.garden.name || '-')}</td>
      <td data-label="Campus">${escapeHtml(r.campus || '-')}</td>
      <td data-label="Asignado a">${escapeHtml(r.targetName)}</td>
      <td data-label="Tipo"><span class="assignment-badge ${r.badgeClass}">${r.type}</span></td>
      <td data-label="Fecha">${formatDate(r.raw.assigned_at)}</td>
      <td data-label="Acciones"><button class="btn btn-sm btn-danger" onclick="removeGardenAssignment('${r.raw.id}')">Quitar</button></td>
    `;
    tbody.appendChild(row);
  });
}

function _filterTreeAssignments() {
  const get = sel => (document.querySelector(`[data-filter="${sel}"]`)?.value || '').toLowerCase().trim();
  const fTree = get('ta-tree');
  const fCampus = get('ta-campus');
  const fTarget = get('ta-target');
  const fType = get('ta-type');
  const fSpec = get('ta-specialist');
  const fCampusN = _normCampus(fCampus);
  const filtered = _treeAssignmentsCache.filter(r => {
    const treeText = `${r.tree.tree_code || ''} ${r.tree.common_name || ''}`.toLowerCase();
    if (fTree && !treeText.includes(fTree)) return false;
    if (fCampusN && _normCampus(r.campus) !== fCampusN) return false;
    if (fTarget && !(r.targetName || '').toLowerCase().includes(fTarget)) return false;
    if (fType && r.type !== fType) return false;
    if (fSpec && !(r.specialist || '').toLowerCase().includes(fSpec)) return false;
    return true;
  });
  _renderTreeAssignments(filtered);
}

function _clearTreeAssignmentFilters() {
  ['ta-tree','ta-campus','ta-target','ta-type','ta-specialist'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderTreeAssignments(_treeAssignmentsCache);
}

function _filterGardenAssignments() {
  const get = sel => (document.querySelector(`[data-filter="${sel}"]`)?.value || '').toLowerCase().trim();
  const fGarden = get('ga-garden');
  const fCampus = get('ga-campus');
  const fTarget = get('ga-target');
  const fType = get('ga-type');
  const fCampusN = _normCampus(fCampus);
  const filtered = _gardenAssignmentsCache.filter(r => {
    const gText = `${r.garden.name || ''}`.toLowerCase();
    if (fGarden && !gText.includes(fGarden)) return false;
    if (fCampusN && _normCampus(r.campus) !== fCampusN) return false;
    if (fTarget && !(r.targetName || '').toLowerCase().includes(fTarget)) return false;
    if (fType && r.type !== fType) return false;
    return true;
  });
  _renderGardenAssignments(filtered);
}

function _clearGardenAssignmentFilters() {
  ['ga-garden','ga-campus','ga-target','ga-type'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderGardenAssignments(_gardenAssignmentsCache);
}

window._filterTreeAssignments = _filterTreeAssignments;
window._clearTreeAssignmentFilters = _clearTreeAssignmentFilters;
window._filterGardenAssignments = _filterGardenAssignments;
window._clearGardenAssignmentFilters = _clearGardenAssignmentFilters;

function populateAssignTarget(typeSelectId, targetSelectId, users, groups) {
  const typeSelect = document.getElementById(typeSelectId);
  const targetSelect = document.getElementById(targetSelectId);
  if (!typeSelect || !targetSelect) return;

  const type = typeSelect.value;
  targetSelect.innerHTML = '<option value="">Selecciona...</option>';
  // Filtrado por campus para admin-campus / responsable / cuando admin tiene filter global
  const campusFilter = effectiveCampusFilter();
  if (type === 'user') {
    (users || []).filter(u => !campusFilter || u.campus === campusFilter).forEach(u => {
      targetSelect.innerHTML += `<option value="${u.id}">👤 ${escapeHtml(u.full_name || 'Sin nombre')} (${escapeHtml(u.campus || '?')})</option>`;
    });
  } else {
    (groups || []).forEach(g => {
      targetSelect.innerHTML += `<option value="${g.id}">📂 ${escapeHtml(g.name)}</option>`;
    });
  }
}

async function doAssignTreeFromTab() {
  const targetType = document.getElementById('assign-target-type')?.value;
  const targetId = document.getElementById('assign-target')?.value;
  const treeId = document.getElementById('assign-tree')?.value;
  const specialist = document.getElementById('assign-specialist')?.value;
  const specialistCustom = document.getElementById('assign-specialist-custom')?.value.trim();
  const notes = document.getElementById('assign-notes')?.value.trim();

  if (!targetId || !treeId) { showToast('Selecciona destinatario y árbol', 'warning'); return; }

  // Determine final specialist name
  let finalSpecialist = '';
  if (specialist === 'Otro') {
    if (!specialistCustom) { showToast('Ingresa nombre del especialista personalizado', 'warning'); return; }
    finalSpecialist = specialistCustom;
  } else if (specialist && specialist !== '') {
    // BUG FIX: el value del select es el UUID, pero queremos guardar el NOMBRE
    // (el textContent de la opción). Si el value es UUID, sacar el texto.
    const specEl = document.getElementById('assign-specialist');
    const opt = specEl?.options[specEl.selectedIndex];
    finalSpecialist = (opt?.textContent || specialist).trim();
  }

  // Build notes with specialist prefix if specialist is selected
  let finalNotes = '';
  if (finalSpecialist) {
    finalNotes = `[ESPECIALISTA: ${finalSpecialist}] `;
  }
  if (notes) {
    finalNotes += notes;
  }

  const data = {
    tree_id: parseInt(treeId),
    assigned_by: currentUser?.id,
    notes: finalNotes || null
  };
  if (targetType === 'user') data.user_id = targetId;
  else data.group_id = targetId;

  try {
    const { error } = await sb.from('tree_assignments').insert([data]);
    if (error) throw error;
    showToast('Árbol asignado exitosamente', 'success');
    document.getElementById('form-assign-tree')?.reset();
    document.getElementById('specialist-custom-row').style.display = 'none';
    loadAssignments();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function doAssignGardenFromTab() {
  const targetType = document.getElementById('assign-garden-target-type')?.value;
  const targetId = document.getElementById('assign-garden-target')?.value;
  const gardenId = document.getElementById('assign-garden-select')?.value;

  if (!targetId || !gardenId) { showToast('Selecciona destinatario y jardín', 'warning'); return; }

  const data = {
    garden_id: gardenId,
    assigned_by: currentUser?.id
  };
  if (targetType === 'user') data.user_id = targetId;
  else data.group_id = targetId;

  try {
    const { error } = await sb.from('garden_assignments').insert([data]);
    if (error) throw error;
    showToast('Jardín asignado exitosamente', 'success');
    document.getElementById('form-assign-garden')?.reset();
    loadAssignments();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function removeTreeAssignment(id) {
  if (!confirm('¿Quitar esta asignación?')) return;
  const { error } = await sb.from('tree_assignments').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Asignación removida', 'success');
  loadAssignments();
}

async function removeGardenAssignment(id) {
  if (!confirm('¿Quitar esta asignación?')) return;
  const { error } = await sb.from('garden_assignments').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Asignación removida', 'success');
  loadAssignments();
}

// ---- SPECIALIST ----
async function loadSpecialistTrees() {
  const content = document.getElementById('specialist-content');
  if (!content) return;

  try {
    const { data: trees } = await sb.from('trees_catalog').select('*').order('health_score', { ascending: true }).limit(20);

    let html = '<div class="specialist-container"><div class="trees-list-panel"><h3>Árboles para Revisión</h3>';
    if (!trees || trees.length === 0) {
      html += '<p class="text-muted">No hay árboles registrados.</p>';
    } else {
      trees.forEach(t => {
        const statusColor = t.health_score >= 70 ? '#4CAF50' : t.health_score >= 40 ? '#FFC107' : '#f44336';
        html += `
          <div class="tree-list-item" onclick="showSpecialistTree(${t.id})">
            <div>
              <div class="tree-list-item-name">${escapeHtml(t.common_name || t.species)}</div>
              <div class="tree-list-item-code">${escapeHtml(t.tree_code)} | ${escapeHtml(t.campus || '-')}</div>
            </div>
            <span style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;font-size:0.85rem;">${t.health_score || 0}%</span>
          </div>
        `;
      });
    }
    html += '</div>';

    html += `<div class="tracking-panel"><h3>Registro de Seguimiento</h3>
      <form class="tracking-form" id="specialist-form">
        <div class="form-group"><label>Árbol</label>
          <select id="spec-tree-id" style="width:100%;padding:0.5rem;">
            <option value="">Selecciona...</option>
            ${(trees || []).map(t => `<option value="${t.id}">${t.tree_code} - ${t.common_name || t.species}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Evaluación de Salud (0-100)</label>
          <input type="number" id="spec-health" min="0" max="100" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group"><label>Notas</label>
          <textarea id="spec-notes" rows="4" style="width:100%;padding:0.5rem;"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Guardar Seguimiento</button>
      </form>
    </div></div>`;

    content.innerHTML = html;

    document.getElementById('specialist-form')?.addEventListener('submit', async function(e) {
      e.preventDefault();
      const treeId = document.getElementById('spec-tree-id')?.value;
      const health = parseInt(document.getElementById('spec-health')?.value);
      const notes = document.getElementById('spec-notes')?.value.trim();
      if (!treeId) { showToast('Selecciona un árbol', 'error'); return; }

      await sb.from('specialist_followups').insert([{
        tree_id: parseInt(treeId),
        specialist_id: currentUser?.id,
        health_assessment: health || null,
        notes: notes
      }]);

      if (health) {
        await sb.from('trees_catalog').update({ health_score: health }).eq('id', parseInt(treeId));
      }

      showToast('Seguimiento guardado', 'success');
      document.getElementById('specialist-form').reset();
      loadSpecialistTrees();
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function showSpecialistTree(treeId) {
  const { data: tree } = await sb.from('trees_catalog').select('*').eq('id', treeId).single();
  if (!tree) return;
  const { data: followups } = await sb.from('specialist_followups').select('*').eq('tree_id', treeId).order('created_at', { ascending: false }).limit(5);

  let historyHtml = (followups || []).map(f =>
    `<div style="padding:8px;border-bottom:1px solid #eee;">
      <strong>${formatDate(f.created_at)}</strong> — Salud: ${f.health_assessment || '-'}%
      <br><small>${escapeHtml(f.notes || 'Sin notas')}</small>
    </div>`
  ).join('') || '<p class="text-muted">Sin seguimientos previos</p>';

  showModal(`${tree.common_name || tree.species} (${tree.tree_code})`, `
    <p><strong>Campus:</strong> ${tree.campus || '-'} | <strong>Estado:</strong> ${tree.status || '-'} | <strong>Salud:</strong> ${tree.health_score || 0}%</p>
    <h4 style="margin-top:1rem;">Historial de Seguimientos</h4>
    <div style="max-height:250px;overflow-y:auto;border:1px solid #eee;border-radius:8px;margin-top:0.5rem;">
      ${historyHtml}
    </div>
  `);
}

// ============================================================================
// KPIs MULTI-CAMPUS — solo admin principal. Métricas comparativas entre
// todos los campus FES (Iztacala, Acatlan, Aragon, Cuautitlan, Zaragoza, CU).
// ============================================================================
const _KPI_CAMPUS_LIST = ['Iztacala', 'Acatlan', 'Aragon', 'Cuautitlan1', 'Cuautitlan', 'Zaragoza', 'CU'];

async function loadKpis() {
  const wrap = document.getElementById('kpis-container');
  if (!wrap) return;
  if (!(isAdminRole() || isRectoriaRole())) {
    wrap.innerHTML = '<p class="text-muted">Solo el administrador principal o Rectoría pueden ver esta sección.</p>';
    return;
  }
  wrap.innerHTML = '<p>Cargando métricas de todos los campus…</p>';
  try {
    // Fetch en paralelo. Schema real verificado:
    //   trees_catalog, gardens, user_profiles, user_groups,
    //   tree_measurements (measurement_date), garden_visits (visit_date),
    //   problem_reports (NO citizen_reports), tree_assignments, user_badges
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const safe = async (promiseLike) => {
      try { const r = await promiseLike; return r && r.data ? r.data : []; }
      catch (_) { return []; }
    };
    const [trees, gardens, users, groups, meas, gvisits, followups, reports, treeAssigns, badges, measAll, measPhotos] = await Promise.all([
      safe(sb.from('trees_catalog').select('id, campus, common_name, species, health_score, status, photo_url, location_lat, location_lng, created_at, initial_height_cm')),
      safe(sb.from('gardens').select('id, campus, name')),
      safe(sb.from('user_profiles').select('id, campus, role')),
      safe(sb.from('user_groups').select('id, campus, name')),
      safe(sb.from('tree_measurements').select('id, tree_id, user_id, measurement_date').gte('measurement_date', monthAgo)),
      safe(sb.from('garden_visits').select('id, garden_id, visit_date').gte('visit_date', monthAgo)),
      safe(sb.from('specialist_followups').select('id, tree_id, followup_date').gte('followup_date', monthAgo)),
      safe(sb.from('problem_reports').select('id, status, urgency, created_at, tree_id')),
      safe(sb.from('tree_assignments').select('id, tree_id, user_id, assigned_at')),
      safe(sb.from('user_badges').select('id, user_id, badge_id, awarded_at')),
      // TODAS las mediciones (no solo 30d) para calcular % de engagement
      safe(sb.from('tree_measurements').select('id, tree_id, user_id, photo_url')),
      // Set de tree_ids con foto en mediciones (más usado que photo_url en trees_catalog)
      safe(sb.from('tree_measurements').select('tree_id').not('photo_url', 'is', null)),
    ]);

    // Indexar árboles por id para resolver mediciones → campus
    const treeById = new Map(trees.map(t => [t.id, t]));
    const gardenById = new Map(gardens.map(g => [g.id, g]));
    const userById = new Map(users.map(u => [u.id, u]));
    // Set de tree_ids que tienen al menos UNA foto (en trees_catalog.photo_url o en tree_measurements.photo_url)
    const treesWithAnyPhoto = new Set();
    trees.forEach(t => { if (t.photo_url) treesWithAnyPhoto.add(t.id); });
    (measPhotos || []).forEach(m => { if (m.tree_id) treesWithAnyPhoto.add(m.tree_id); });
    // Set de tree_ids que tienen al menos UNA medición (engagement = % activo)
    const treesWithMeas = new Set();
    (measAll || []).forEach(m => { if (m.tree_id) treesWithMeas.add(m.tree_id); });

    // Calcular KPIs por campus
    function emptyKpi() {
      return {
        trees: 0, treesWithPhoto: 0, treesWithGPS: 0, treesWithMeas: 0,
        healthSum: 0, healthCount: 0,
        healthBuena: 0, healthMedia: 0, healthMala: 0,
        gardens: 0, users: 0, students: 0, responsables: 0, adminCampus: 0, specialists: 0,
        groups: 0, measurements30d: 0, gardenVisits30d: 0, followups30d: 0,
        treeAssignments: 0, badges: 0, problemsOpen: 0,
        co2KgYear: 0,            // CO2 capturado estimado (~22kg/año por árbol — promedio conservador)
        speciesCount: {},        // count por especie para top
      };
    }
    const byCampus = Object.create(null);
    _KPI_CAMPUS_LIST.forEach(c => byCampus[c] = emptyKpi());

    trees.forEach(t => {
      const c = byCampus[t.campus] || (byCampus[t.campus] = emptyKpi());
      c.trees++;
      if (treesWithAnyPhoto.has(t.id)) c.treesWithPhoto++;
      if (t.location_lat && t.location_lng) c.treesWithGPS++;
      if (treesWithMeas.has(t.id)) c.treesWithMeas++;
      const h = (t.health_score == null) ? null : Number(t.health_score);
      if (h != null && !isNaN(h)) {
        c.healthSum += h; c.healthCount++;
        if (h >= 70) c.healthBuena++;
        else if (h >= 40) c.healthMedia++;
        else c.healthMala++;
      }
      // CO2 capturado estimado: ~22kg CO2/año por árbol urbano joven
      // (referencia: estudios de FAO/UN-Habitat para árboles urbanos).
      // Si tenemos altura inicial, escalamos: árboles más altos absorben más.
      const baseCO2 = 22;
      const heightFactor = t.initial_height_cm ? Math.min(2.5, Math.max(0.5, t.initial_height_cm / 200)) : 1;
      c.co2KgYear += baseCO2 * heightFactor;
      // Conteo de especies para top
      const sp = (t.common_name || t.species || 'sin-especie').trim().toLowerCase();
      if (sp) c.speciesCount[sp] = (c.speciesCount[sp] || 0) + 1;
    });
    gardens.forEach(g => { (byCampus[g.campus] = byCampus[g.campus] || emptyKpi()).gardens++; });
    users.forEach(u => {
      const c = byCampus[u.campus] = byCampus[u.campus] || emptyKpi();
      c.users++;
      const r = (u.role || 'user').toLowerCase();
      if (r === 'admin-campus') c.adminCampus++;
      else if (r === 'responsable') c.responsables++;
      else if (r === 'specialist') c.specialists++;
      else if (r === 'user' || r === '') c.students++;
    });
    groups.forEach(g => { (byCampus[g.campus] = byCampus[g.campus] || emptyKpi()).groups++; });
    meas.forEach(m => {
      const t = treeById.get(m.tree_id);
      if (t && byCampus[t.campus]) byCampus[t.campus].measurements30d++;
    });
    gvisits.forEach(v => {
      const g = gardenById.get(v.garden_id);
      if (g && byCampus[g.campus]) byCampus[g.campus].gardenVisits30d++;
    });
    followups.forEach(f => {
      const t = treeById.get(f.tree_id);
      if (t && byCampus[t.campus]) byCampus[t.campus].followups30d++;
    });
    treeAssigns.forEach(a => {
      const t = treeById.get(a.tree_id);
      if (t && byCampus[t.campus]) byCampus[t.campus].treeAssignments++;
    });
    badges.forEach(b => {
      const u = userById.get(b.user_id);
      if (u && byCampus[u.campus]) byCampus[u.campus].badges++;
    });
    reports.forEach(r => {
      const t = treeById.get(r.tree_id);
      const isOpen = !['resolved', 'closed'].includes((r.status || 'open').toLowerCase());
      if (isOpen && t && byCampus[t.campus]) byCampus[t.campus].problemsOpen++;
    });

    // Render
    wrap.innerHTML = _renderKpisHtml(byCampus, { trees, gardens, users, groups, reports, treeAssigns, badges });
  } catch (err) {
    console.error('loadKpis error:', err);
    wrap.innerHTML = `<p class="text-muted" style="color:#a33;">Error cargando KPIs: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function _renderKpisHtml(byCampus, raw) {
  const campusOrder = _KPI_CAMPUS_LIST.filter(c => byCampus[c] && byCampus[c].trees + byCampus[c].users + byCampus[c].gardens > 0);
  if (campusOrder.length === 0) {
    return '<p class="text-muted">No hay datos en ningún campus todavía.</p>';
  }
  // Globales
  const totals = campusOrder.reduce((acc, c) => {
    const k = byCampus[c];
    acc.trees += k.trees;
    acc.treesWithPhoto += k.treesWithPhoto;
    acc.treesWithGPS += k.treesWithGPS;
    acc.treesWithMeas += k.treesWithMeas;
    acc.healthSum += k.healthSum;
    acc.healthCount += k.healthCount;
    acc.healthBuena += k.healthBuena;
    acc.healthMedia += k.healthMedia;
    acc.healthMala += k.healthMala;
    acc.gardens += k.gardens;
    acc.users += k.users;
    acc.measurements30d += k.measurements30d;
    acc.co2KgYear += k.co2KgYear;
    return acc;
  }, { trees: 0, treesWithPhoto: 0, treesWithGPS: 0, treesWithMeas: 0, healthSum: 0, healthCount: 0, healthBuena: 0, healthMedia: 0, healthMala: 0, gardens: 0, users: 0, measurements30d: 0, co2KgYear: 0 });
  const avgHealth = totals.healthCount > 0 ? (totals.healthSum / totals.healthCount) : null;
  const pctPhoto = totals.trees > 0 ? Math.round(100 * totals.treesWithPhoto / totals.trees) : 0;
  const pctGPS = totals.trees > 0 ? Math.round(100 * totals.treesWithGPS / totals.trees) : 0;
  const pctEngagement = totals.trees > 0 ? Math.round(100 * totals.treesWithMeas / totals.trees) : 0;
  const openReports = (raw.reports || []).filter(r => !['resolved', 'closed'].includes((r.status || 'open').toLowerCase())).length;
  const totalAssigns = (raw.treeAssigns || []).length;
  const totalBadges = (raw.badges || []).length;
  // Equivalencias del CO2 capturado para hacerlo tangible
  const co2Tons = totals.co2KgYear / 1000;
  const carEquiv = Math.round(totals.co2KgYear / 4600);   // 1 carro promedio ~4.6 ton/año
  const personEquiv = Math.round(totals.co2KgYear / 400); // 1 persona respira ~400 kg/año

  // Theme colors per campus para barras
  const colorOf = (c) => (CAMPUS_THEMES[c] && CAMPUS_THEMES[c].color) || '#999';

  // Helper card global
  const card = (label, value, sub, icon, color) => `
    <div style="background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid ${color || '#3b7a3a'};min-width:140px;flex:1;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${icon||''} ${label}</div>
      <div style="font-size:24px;font-weight:700;color:#222;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#777;margin-top:2px;">${sub}</div>` : ''}
    </div>`;

  // Barras por campus para un KPI dado
  const maxOf = (metric) => Math.max(...campusOrder.map(c => byCampus[c][metric]), 1);
  const bars = (metric, label) => {
    const m = maxOf(metric);
    return `
    <div style="background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="font-size:12px;color:#555;font-weight:600;margin-bottom:8px;">${label}</div>
      ${campusOrder.map(c => {
        const v = byCampus[c][metric];
        const pct = m > 0 ? Math.round(100 * v / m) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;">
          <div style="width:80px;color:#666;">${c}</div>
          <div style="flex:1;background:#f0ede5;border-radius:6px;height:14px;overflow:hidden;">
            <div style="width:${pct}%;background:${colorOf(c)};height:100%;transition:width 0.4s;"></div>
          </div>
          <div style="width:48px;text-align:right;color:#333;font-weight:600;">${v}</div>
        </div>`;
      }).join('')}
    </div>`;
  };

  // Tabla comparativa
  const tableRows = campusOrder.map(c => {
    const k = byCampus[c];
    const avgH = k.healthCount > 0 ? (k.healthSum / k.healthCount).toFixed(1) : '—';
    const photoPct = k.trees > 0 ? Math.round(100 * k.treesWithPhoto / k.trees) + '%' : '—';
    const gpsPct = k.trees > 0 ? Math.round(100 * k.treesWithGPS / k.trees) + '%' : '—';
    const engagePct = k.trees > 0 ? Math.round(100 * k.treesWithMeas / k.trees) + '%' : '—';
    return `
      <tr>
        <td style="font-weight:600;color:${colorOf(c)};"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(c)};margin-right:6px;"></span>${c}</td>
        <td style="text-align:right;">${k.trees}</td>
        <td style="text-align:right;">${k.gardens}</td>
        <td style="text-align:right;">${k.users}</td>
        <td style="text-align:right;">${k.students}</td>
        <td style="text-align:right;">${k.responsables}</td>
        <td style="text-align:right;">${k.groups}</td>
        <td style="text-align:right;">${photoPct}</td>
        <td style="text-align:right;">${gpsPct}</td>
        <td style="text-align:right;">${engagePct}</td>
        <td style="text-align:right;">${avgH}</td>
        <td style="text-align:right;">${k.measurements30d}</td>
        <td style="text-align:right;">${k.gardenVisits30d}</td>
        <td style="text-align:right;">${k.treeAssignments}</td>
        <td style="text-align:right;">${k.badges}</td>
        <td style="text-align:right;">${(k.co2KgYear/1000).toFixed(1)} t</td>
        <td style="text-align:right;color:${k.problemsOpen>0?'#b54f3a':'#999'};">${k.problemsOpen}</td>
      </tr>`;
  }).join('');

  // Top 5 especies globales
  const speciesGlobal = {};
  campusOrder.forEach(c => {
    Object.entries(byCampus[c].speciesCount).forEach(([sp, n]) => {
      speciesGlobal[sp] = (speciesGlobal[sp] || 0) + n;
    });
  });
  const top5Species = Object.entries(speciesGlobal).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return `
    <!-- Banner que aclara que es vista global, no filtrada -->
    <div style="background:linear-gradient(90deg,#3b7a3a22,#5b8b7d22);border-left:4px solid #3b7a3a;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12px;color:#2e5a2e;">
      <i class="fas fa-globe-americas"></i> <strong>Vista global multi-campus.</strong> Incluye los ${campusOrder.length} campus con datos. El filtro de campus del header NO aplica aquí.
    </div>

    <!-- KPIs globales -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
      ${card('Árboles totales', totals.trees, `${campusOrder.length} campus`, '🌳', '#3b7a3a')}
      ${card('Jardines', totals.gardens, '', '🌿', '#5b8b7d')}
      ${card('Usuarios', totals.users, `${raw.users.filter(u=>u.role==='admin-campus').length} admin · ${raw.users.filter(u=>u.role==='responsable').length} resp.`, '👥', '#8b6f47')}
      ${card('Salud promedio', avgHealth != null ? avgHealth.toFixed(1) : '—', avgHealth != null ? (avgHealth >= 70 ? 'Buena' : avgHealth >= 40 ? 'Media' : 'Mala') : '', '❤️', avgHealth != null ? (avgHealth >= 70 ? '#3b7a3a' : avgHealth >= 40 ? '#d4a574' : '#b54f3a') : '#999')}
      ${card('% con foto', pctPhoto + '%', `${totals.treesWithPhoto}/${totals.trees} árboles`, '📷', '#4a7c2a')}
      ${card('% con GPS', pctGPS + '%', `${totals.treesWithGPS}/${totals.trees}`, '📍', '#5b8b7d')}
      ${card('% engagement', pctEngagement + '%', `${totals.treesWithMeas}/${totals.trees} con seguimiento`, '🎯', pctEngagement >= 50 ? '#3b7a3a' : pctEngagement >= 25 ? '#d4a574' : '#b54f3a')}
      ${card('Seguimientos árbol 30d', totals.measurements30d, 'últimos 30 días', '📈', '#d4a574')}
      ${card('CO₂ capturado', co2Tons.toFixed(1) + ' t/año', `≈ ${carEquiv} auto${carEquiv!==1?'s':''} · ${personEquiv} persona${personEquiv!==1?'s':''}`, '🌬️', '#2E7D32')}
      ${card('Asignaciones activas', totalAssigns, 'árboles con responsable', '🔗', '#5b8b7d')}
      ${card('Badges otorgados', totalBadges, '', '🏅', '#4a7c2a')}
      ${card('Reportes abiertos', openReports, '', '🚨', openReports > 0 ? '#b54f3a' : '#999')}
    </div>

    <!-- Distribución de salud (barra apilada) -->
    <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">❤️ Distribución de salud por campus</div>
      ${campusOrder.map(c => {
        const k = byCampus[c];
        const total = k.healthBuena + k.healthMedia + k.healthMala;
        if (total === 0) return '';
        const pB = (100*k.healthBuena/total).toFixed(1);
        const pM = (100*k.healthMedia/total).toFixed(1);
        const pX = (100*k.healthMala/total).toFixed(1);
        return `
          <div style="margin:8px 0;font-size:11px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-weight:600;color:${colorOf(c)};">${c}</span>
              <span style="color:#666;">${total} árboles con dato de salud</span>
            </div>
            <div style="display:flex;height:18px;border-radius:4px;overflow:hidden;border:1px solid #e0d8c8;">
              <div style="width:${pB}%;background:#3b7a3a;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;" title="Buena ≥70: ${k.healthBuena}">${k.healthBuena>0?k.healthBuena:''}</div>
              <div style="width:${pM}%;background:#d4a574;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;" title="Media 40-69: ${k.healthMedia}">${k.healthMedia>0?k.healthMedia:''}</div>
              <div style="width:${pX}%;background:#b54f3a;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;" title="Mala <40: ${k.healthMala}">${k.healthMala>0?k.healthMala:''}</div>
            </div>
          </div>`;
      }).join('')}
      <div style="display:flex;gap:14px;font-size:10px;color:#666;margin-top:8px;">
        <span><span style="display:inline-block;width:10px;height:10px;background:#3b7a3a;border-radius:2px;margin-right:4px;"></span>Buena ≥70</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#d4a574;border-radius:2px;margin-right:4px;"></span>Media 40-69</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#b54f3a;border-radius:2px;margin-right:4px;"></span>Mala &lt;40</span>
      </div>
    </div>

    <!-- Top 5 especies -->
    ${top5Species.length > 0 ? `
    <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">🌿 Top 5 especies más comunes</div>
      ${top5Species.map(([sp, n], i) => {
        const pct = Math.round(100 * n / totals.trees);
        return `
          <div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;">
            <div style="width:24px;color:#888;font-weight:600;">${i+1}.</div>
            <div style="flex:1;text-transform:capitalize;color:#333;">${sp}</div>
            <div style="flex:2;background:#f0ede5;border-radius:6px;height:14px;overflow:hidden;">
              <div style="width:${pct}%;background:#4a7c2a;height:100%;"></div>
            </div>
            <div style="width:80px;text-align:right;color:#555;font-weight:600;">${n} <span style="color:#888;font-weight:normal;">(${pct}%)</span></div>
          </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Barras comparativas -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:18px;">
      ${bars('trees', '🌳 Árboles por campus')}
      ${bars('users', '👥 Usuarios por campus')}
      ${bars('gardens', '🌿 Jardines por campus')}
      ${bars('measurements30d', '📈 Seguimientos árbol 30d')}
      ${bars('gardenVisits30d', '🌿 Visitas jardín 30d')}
      ${bars('treeAssignments', '🔗 Árboles con asignación')}
    </div>

    <!-- Tabla detallada -->
    <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow-x:auto;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">📊 Comparativa detallada</div>
      <table class="admin-table" style="font-size:12px;width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;">Campus</th>
            <th style="text-align:right;">Árboles</th>
            <th style="text-align:right;">Jardines</th>
            <th style="text-align:right;">Usuarios</th>
            <th style="text-align:right;">Estudiantes</th>
            <th style="text-align:right;">Responsables</th>
            <th style="text-align:right;">Grupos</th>
            <th style="text-align:right;" title="Árboles con al menos una foto (en catálogo o seguimientos)">% Foto</th>
            <th style="text-align:right;" title="Árboles con coordenadas GPS">% GPS</th>
            <th style="text-align:right;" title="% árboles con al menos 1 seguimiento histórico">% Engage</th>
            <th style="text-align:right;" title="Salud promedio 0-100">Salud ø</th>
            <th style="text-align:right;" title="Seguimientos de árbol últimos 30 días (tree_measurements)">Segui. árbol 30d</th>
            <th style="text-align:right;" title="Visitas a jardines últimos 30 días (garden_visits)">Visitas jardín 30d</th>
            <th style="text-align:right;">Asign.</th>
            <th style="text-align:right;">Badges</th>
            <th style="text-align:right;" title="CO₂ capturado estimado por año (~22kg base + factor altura)">CO₂/año</th>
            <th style="text-align:right;">Probl.</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <p class="text-muted text-small" style="margin-top:10px;line-height:1.5;">
      <i class="fas fa-info-circle"></i> Datos en tiempo real. Salud 0-100 (Buena ≥70, Media 40-69, Mala &lt;40).
      <strong>% Engage</strong> = árboles con al menos 1 seguimiento histórico.
      <strong>% Foto</strong> = árboles con foto en catálogo o en algún seguimiento.
      <strong>CO₂</strong> estimado con ~22 kg/año por árbol urbano joven, escalado por altura inicial.
    </p>
  `;
}

window.loadKpis = loadKpis;

// ============================================================================
// SEGURIDAD — auth_attempts + ip_blocklist (solo admin principal)
// ============================================================================
async function loadSecurityDashboard() {
  const wrap = document.getElementById('security-container');
  if (!wrap) return;
  if (!(isAdminRole() || isRectoriaRole())) {
    wrap.innerHTML = '<p class="text-muted">Solo el administrador principal o Rectoría pueden ver esta sección.</p>';
    return;
  }
  wrap.innerHTML = '<p>Cargando intentos y bloqueos…</p>';
  try {
    const dayAgo  = new Date(Date.now() - 86400000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [attemptsRes, blocksRes, weekRes, secEvtsRes, alertCfgRes] = await Promise.all([
      sb.from('auth_attempts').select('*').gte('occurred_at', dayAgo).order('occurred_at', { ascending: false }).limit(200),
      sb.from('ip_blocklist').select('*').is('unlocked_at', null).order('blocked_at', { ascending: false }),
      sb.from('auth_attempts').select('id, success, occurred_at').gte('occurred_at', weekAgo),
      sb.from('security_events').select('*').gte('occurred_at', weekAgo).order('occurred_at', { ascending: false }).limit(200),
      sb.from('notification_rules').select('config, enabled').eq('rule_key', 'security_telegram_alert').maybeSingle(),
    ]);
    const alertCfg = alertCfgRes?.data?.config || {};
    const alertChatId = (alertCfg.chat_id || '').toString();
    const alertEnabled = alertCfgRes?.data?.enabled !== false;
    const alertMinSev = alertCfg.min_severity || 'high';
    const attempts = attemptsRes.data || [];
    const blocks = blocksRes.data || [];
    const weekAttempts = weekRes.data || [];
    const secEvents = secEvtsRes.data || [];
    // Cachear eventos para filtrado client-side sin re-fetch (DEBE ir
    // DESPUÉS de declarar `secEvents` — antes daba TDZ ReferenceError).
    _secEventsCache = secEvents;
    const fails24h = attempts.filter(a => !a.success).length;
    const ok24h = attempts.filter(a => a.success).length;
    const fails7d = weekAttempts.filter(a => !a.success).length;
    const ok7d = weekAttempts.filter(a => a.success).length;
    // Stats de eventos de seguridad
    const secEvents24h = secEvents.filter(e => new Date(e.occurred_at).getTime() > Date.now() - 86400000);
    const secEventsUnreviewed = secEvents.filter(e => !e.reviewed_at).length;
    const secByType = {};
    secEvents24h.forEach(e => { secByType[e.event_type] = (secByType[e.event_type] || 0) + 1; });
    const topSecTypes = Object.entries(secByType).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const secByIp = {};
    secEvents24h.forEach(e => { if (e.ip) secByIp[e.ip] = (secByIp[e.ip] || 0) + 1; });
    const topAttackIps = Object.entries(secByIp).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top IPs fallidas (24h)
    const ipFails = {};
    attempts.filter(a => !a.success && a.ip).forEach(a => {
      ipFails[a.ip] = (ipFails[a.ip] || 0) + 1;
    });
    const topIPs = Object.entries(ipFails).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Timeline por hora últimas 24h
    const buckets = new Array(24).fill(0).map(() => ({ ok: 0, fail: 0 }));
    attempts.forEach(a => {
      const hoursAgo = Math.floor((Date.now() - new Date(a.occurred_at).getTime()) / 3600000);
      if (hoursAgo >= 0 && hoursAgo < 24) {
        const i = 23 - hoursAgo;
        if (a.success) buckets[i].ok++; else buckets[i].fail++;
      }
    });
    const maxBucket = Math.max(...buckets.map(b => b.ok + b.fail), 1);

    const card = (label, value, sub, icon, color) => `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid ${color};min-width:140px;flex:1;">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${icon||''} ${label}</div>
        <div style="font-size:24px;font-weight:700;color:#222;">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#777;margin-top:2px;">${sub}</div>` : ''}
      </div>`;

    wrap.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        ${card('Logins exitosos 24h', ok24h, '', '✅', '#3b7a3a')}
        ${card('Fallos 24h', fails24h, '', '❌', fails24h > 20 ? '#b54f3a' : '#d4a574')}
        ${card('Logins 7d', ok7d, `${fails7d} fallos`, '📊', '#5b8b7d')}
        ${card('IPs bloqueadas activas', blocks.length, blocks.filter(b=>!b.blocked_until).length + ' permanentes', '🚫', blocks.length > 0 ? '#b54f3a' : '#999')}
        ${card('Intentos de ataque 24h', secEvents24h.length, secEventsUnreviewed > 0 ? `${secEventsUnreviewed} sin revisar` : 'todos revisados', '🛡️', secEvents24h.length > 0 ? '#c62828' : '#3b7a3a')}
      </div>

      <!-- Timeline 24h -->
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">📈 Intentos por hora (últimas 24h)</div>
        <div style="display:flex;align-items:flex-end;height:80px;gap:2px;">
          ${buckets.map(b => {
            const total = b.ok + b.fail;
            const okH = total > 0 ? (b.ok / maxBucket) * 100 : 0;
            const failH = total > 0 ? (b.fail / maxBucket) * 100 : 0;
            return `<div style="flex:1;display:flex;flex-direction:column-reverse;align-items:stretch;" title="${total} intentos: ${b.ok} ok, ${b.fail} fallidos">
              <div style="background:#3b7a3a;height:${okH}%;"></div>
              <div style="background:#b54f3a;height:${failH}%;"></div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:4px;">
          <span>-24h</span><span>-12h</span><span>ahora</span>
        </div>
        <div style="display:flex;gap:14px;font-size:10px;color:#666;margin-top:8px;">
          <span><span style="display:inline-block;width:10px;height:10px;background:#3b7a3a;margin-right:4px;"></span>Exitosos</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#b54f3a;margin-right:4px;"></span>Fallidos</span>
        </div>
      </div>

      <!-- IPs bloqueadas -->
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;overflow-x:auto;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">🚫 IPs bloqueadas activas (${blocks.length})</div>
        ${blocks.length === 0 ? '<p class="text-muted text-small">Sin IPs bloqueadas.</p>' : `
          <table class="admin-table" style="font-size:12px;width:100%;">
            <thead><tr>
              <th>IP</th><th>Bloqueada desde</th><th>Hasta</th><th>Bloqueos seguidos</th><th>Razón</th><th></th>
            </tr></thead>
            <tbody>
              ${blocks.map(b => `
                <tr>
                  <td style="font-family:monospace;">${b.ip}</td>
                  <td>${new Date(b.blocked_at).toLocaleString('es-MX')}</td>
                  <td>${b.blocked_until ? new Date(b.blocked_until).toLocaleString('es-MX') : '<strong style="color:#b54f3a;">Permanente</strong>'}</td>
                  <td style="text-align:center;">${b.consecutive_blocks}</td>
                  <td style="font-size:11px;color:#666;">${b.reason}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-outline" style="padding:4px 10px;font-size:11px;margin-right:4px;" onclick="showIpDetail('${b.ip}')" title="Ver detalle (usuario, ubicación, intentos)">🔍 Detalle</button>
                    <button class="btn btn-outline" style="padding:4px 10px;font-size:11px;" onclick="unblockIPHandler('${b.ip}')">🔓 Desbloquear</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>`}
      </div>

      <!-- Top IPs fallidas -->
      ${topIPs.length > 0 ? `
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">🎯 Top IPs con fallos (últimas 24h)</div>
        ${topIPs.map(([ip, n]) => {
          const pct = Math.round(100 * n / Math.max(...topIPs.map(x=>x[1])));
          return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;">
            <div style="width:160px;font-family:monospace;color:#333;">${ip}</div>
            <div style="flex:1;background:#f0ede5;border-radius:6px;height:14px;overflow:hidden;">
              <div style="width:${pct}%;background:#b54f3a;height:100%;"></div>
            </div>
            <div style="width:50px;text-align:right;font-weight:600;">${n}</div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Configuración de alertas Telegram para ataques (solo admin) -->
      ${isAdminRole() ? `
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;border-left:4px solid #229ED9;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:#333;">
            <i class="fab fa-telegram" style="color:#229ED9;"></i> Alertas de seguridad por Telegram
          </div>
          <span style="font-size:11px;color:${alertEnabled && alertChatId ? '#3b7a3a' : '#999'};">
            ${alertEnabled && alertChatId ? '✅ Activas' : '⊘ Inactivas'}
          </span>
        </div>
        <p style="font-size:0.82rem;color:#666;margin:0 0 0.6rem;">
          Cuando se detecta un ataque (XSS, SQLi, etc.) y se bloquea una IP automáticamente, se envía un mensaje al chat_id configurado.
          Mínimo severity: <code>${escapeHtml(alertMinSev)}</code>. La IP se bloquea 30 min al primer intento, permanente al tercero.
        </p>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <label style="font-size:0.78rem;color:#555;display:block;margin-bottom:3px;">Chat ID de Telegram (numérico)</label>
            <input id="sec-alert-chat-id" type="text"
              value="${escapeHtml(alertChatId)}"
              placeholder="123456789"
              style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:6px;font-family:monospace;">
          </div>
          <button class="btn btn-primary btn-sm" onclick="saveSecurityAlertConfig()">
            <i class="fas fa-save"></i> Guardar
          </button>
          <button class="btn btn-outline btn-sm" onclick="testSecurityAlert()" ${!alertChatId ? 'disabled' : ''}>
            <i class="fas fa-paper-plane"></i> Enviar prueba
          </button>
        </div>
        <details style="margin-top:0.6rem;">
          <summary style="cursor:pointer;font-size:0.78rem;color:#888;">¿Cómo obtengo mi chat_id?</summary>
          <p style="font-size:0.78rem;color:#666;margin:0.4rem 0 0;line-height:1.5;">
            1. Abre <a href="https://t.me/Pumai_treebot" target="_blank" style="color:#0d6acb;">@Pumai_treebot</a> en Telegram.<br>
            2. Manda <code>/start</code> y vincula tu cuenta desde tu perfil (si aún no lo has hecho).<br>
            3. Luego manda <code>/status</code> al bot. El número que comienza con <code>123…</code> es tu chat_id, o pídeselo a tu administrador.<br>
            <strong>Tip:</strong> también puedes usar un grupo dedicado — agrega el bot, manda cualquier mensaje y el chat_id del grupo aparece en los logs del webhook (empieza con <code>-100…</code>).
          </p>
        </details>
      </div>
      ` : ''}

      <!-- Intentos de ataque detectados -->
      <div id="sec-events-section" style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:18px;border-left:4px solid #c62828;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#333;">🛡️ Intentos de ataque detectados (7d)</div>
          <div style="font-size:11px;color:#666;">
            ${secEvents.length} total
            ${secEventsUnreviewed > 0 ? `· <span style="color:#c62828;font-weight:600;">${secEventsUnreviewed} sin revisar</span>` : ''}
          </div>
        </div>

        <!-- Filtros + refresh -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;padding:8px;background:#fafafa;border-radius:6px;">
          <input type="text" id="sec-flt-type"
            placeholder="🔍 Tipo (ej. xss, sqli, honeypot)"
            oninput="_filterSecEvents()"
            style="flex:1;min-width:160px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;">
          <select id="sec-flt-severity" onchange="_filterSecEvents()"
            style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;background:white;">
            <option value="">Todas severidades</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <input type="text" id="sec-flt-ip"
            placeholder="🔍 IP"
            oninput="_filterSecEvents()"
            style="width:130px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;font-family:monospace;">
          <input type="text" id="sec-flt-user"
            placeholder="🔍 Usuario"
            oninput="_filterSecEvents()"
            style="width:140px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;">
          <label style="font-size:11px;color:#666;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="sec-flt-unreviewed" onchange="_filterSecEvents()" style="margin:0;">
            Solo sin revisar
          </label>
          <button class="btn btn-outline" style="padding:4px 10px;font-size:11px;margin-left:auto;" onclick="loadSecurityDashboard()" title="Refrescar todo el dashboard">
            <i class="fas fa-sync-alt"></i> Refrescar
          </button>
          <button class="btn btn-outline" style="padding:4px 10px;font-size:11px;" onclick="_clearSecEventsFilters()">↺ Limpiar</button>
        </div>

        ${topSecTypes.length > 0 ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            ${topSecTypes.map(([type, n]) => `
              <span style="background:#fce4e4;color:#7a1f1f;padding:4px 10px;border-radius:12px;font-size:11px;border:1px solid #f5b9b9;">
                ${escapeHtml(type)} <strong>×${n}</strong>
              </span>`).join('')}
          </div>
          ${topAttackIps.length > 0 ? `
            <div style="font-size:11px;color:#666;margin-bottom:8px;">
              <strong>IPs atacando:</strong>
              ${topAttackIps.map(([ip, n]) => `
                <a href="#" onclick="showIpDetail('${escapeHtml(ip)}');return false;" style="color:#0d6acb;text-decoration:none;margin-left:6px;font-family:monospace;">
                  ${escapeHtml(ip)} <span style="color:#c62828;font-weight:600;">(${n})</span>
                </a>`).join('')}
            </div>` : ''}` : '<p class="text-muted text-small" style="margin:0;">Sin intentos de ataque detectados en los últimos 7 días.</p>'}

        ${secEvents.length > 0 ? `
          <div style="max-height:260px;overflow-y:auto;border:1px solid #eee;border-radius:6px;margin-top:6px;">
            <table class="admin-table" style="font-size:11px;width:100%;">
              <thead><tr style="position:sticky;top:0;background:#f4f4f4;">
                <th>Fecha</th><th>Tipo</th><th>Severidad</th><th>IP</th>
                <th>Usuario</th><th>Campo</th><th>Snippet</th><th></th>
              </tr></thead>
              <tbody id="sec-events-tbody">
                ${secEvents.slice(0, 80).map(ev => {
                  const sevColor = { critical:'#7a1f1f', high:'#c62828', medium:'#d4a574', low:'#888', info:'#5b8b7d' }[ev.severity] || '#666';
                  const snippet = (() => {
                    try { return JSON.stringify(ev.payload || {}).slice(0, 100); }
                    catch { return ''; }
                  })();
                  return `<tr style="background:${ev.reviewed_at ? '' : 'rgba(198,40,40,0.04)'};">
                    <td style="white-space:nowrap;">${new Date(ev.occurred_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })}</td>
                    <td><code style="font-size:0.7rem;background:#fce4e4;color:#7a1f1f;padding:1px 5px;border-radius:3px;">${escapeHtml(ev.event_type)}</code></td>
                    <td><span style="color:${sevColor};font-weight:600;text-transform:uppercase;font-size:0.68rem;">${escapeHtml(ev.severity)}</span></td>
                    <td style="font-family:monospace;font-size:0.7rem;">${ev.ip || '—'}</td>
                    <td style="font-size:0.7rem;">${escapeHtml(ev.user_email || (ev.user_id ? ev.user_id.slice(0,8) : '—'))}</td>
                    <td style="font-size:0.7rem;color:#666;">${escapeHtml(ev.field_name || '—')}</td>
                    <td style="font-family:monospace;font-size:0.65rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(snippet)}">${escapeHtml(snippet)}</td>
                    <td style="white-space:nowrap;">
                      ${!ev.reviewed_at && isAdminRole() ? `<button class="btn btn-outline" style="padding:2px 6px;font-size:10px;" onclick="markSecEventReviewed('${ev.id}')" title="Marcar como revisado">✓</button>` : '✓'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>

      <!-- Intentos de imágenes con deepfakes (en construcción) -->
      <div style="background:#f8f8f8;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:18px;border-left:4px solid #9e9e9e;opacity:0.65;position:relative;pointer-events:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:#666;">
            🎭 Intentos de imágenes con deepfakes
            <span style="background:#fff3cd;color:#856404;border:1px solid #ffeeba;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:8px;text-transform:uppercase;letter-spacing:0.04em;">
              🚧 En construcción
            </span>
          </div>
          <div style="font-size:11px;color:#888;">Próximamente · Reality Defender</div>
        </div>
        <p style="font-size:0.82rem;color:#666;margin:0 0 0.8rem;line-height:1.5;">
          Detección automática de imágenes generadas por IA o manipuladas (deepfakes) en las fotos
          de seguimientos y reportes ciudadanos. Cuando esté activo, mostrará los intentos
          detectados con score de probabilidad, tipo de manipulación detectada y la opción de
          aceptar o rechazar la foto.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;opacity:0.6;">
          <span style="background:#e0e0e0;color:#666;padding:4px 10px;border-radius:12px;font-size:11px;border:1px solid #ccc;">
            face_swap <strong>×—</strong>
          </span>
          <span style="background:#e0e0e0;color:#666;padding:4px 10px;border-radius:12px;font-size:11px;border:1px solid #ccc;">
            ai_generated <strong>×—</strong>
          </span>
          <span style="background:#e0e0e0;color:#666;padding:4px 10px;border-radius:12px;font-size:11px;border:1px solid #ccc;">
            inpainting <strong>×—</strong>
          </span>
          <span style="background:#e0e0e0;color:#666;padding:4px 10px;border-radius:12px;font-size:11px;border:1px solid #ccc;">
            metadata_strip <strong>×—</strong>
          </span>
        </div>
        <div style="border:1px dashed #ccc;border-radius:6px;padding:1.5rem;text-align:center;background:#fafafa;">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;filter:grayscale(1);">🚧</div>
          <div style="font-size:0.85rem;color:#888;font-weight:500;">Módulo en construcción</div>
          <div style="font-size:0.75rem;color:#aaa;margin-top:0.3rem;">
            Sprint 9 · Integración con Reality Defender API (deepfake detection)
          </div>
        </div>
      </div>

      <!-- Últimos 50 intentos de login -->
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow-x:auto;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#333;">🕐 Últimos 50 intentos de login (24h)</div>
        <table class="admin-table" style="font-size:11px;width:100%;">
          <thead><tr><th>Fecha</th><th>Email</th><th>IP</th><th>Resultado</th><th>Razón</th></tr></thead>
          <tbody>
            ${attempts.slice(0, 50).map(a => `
              <tr style="${a.success ? '' : 'background:rgba(181,79,58,0.05);'}">
                <td>${new Date(a.occurred_at).toLocaleString('es-MX')}</td>
                <td>${a.email || '—'}</td>
                <td style="font-family:monospace;">${a.ip || '—'}</td>
                <td style="color:${a.success ? '#3b7a3a' : '#b54f3a'};font-weight:600;">${a.success ? '✓ OK' : '✗ FAIL'}</td>
                <td style="color:#666;">${a.reason || ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('loadSecurityDashboard error:', err);
    wrap.innerHTML = `<p class="text-muted" style="color:#a33;">Error: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

// Cache de eventos de seguridad para filtrado client-side
let _secEventsCache = [];

// Filtro de eventos de seguridad — opera sobre _secEventsCache
function _filterSecEvents() {
  const tbody = document.getElementById('sec-events-tbody');
  if (!tbody) return;
  const fType = (document.getElementById('sec-flt-type')?.value || '').trim().toLowerCase();
  const fSev = (document.getElementById('sec-flt-severity')?.value || '').trim();
  const fIp = (document.getElementById('sec-flt-ip')?.value || '').trim();
  const fUser = (document.getElementById('sec-flt-user')?.value || '').trim().toLowerCase();
  const fUnreviewed = document.getElementById('sec-flt-unreviewed')?.checked;

  const filtered = (_secEventsCache || []).filter(ev => {
    if (fType && !(ev.event_type || '').toLowerCase().includes(fType)) return false;
    if (fSev && ev.severity !== fSev) return false;
    if (fIp && !(ev.ip || '').toString().includes(fIp)) return false;
    if (fUser) {
      const haystack = ((ev.user_email || '') + ' ' + (ev.user_id || '')).toLowerCase();
      if (!haystack.includes(fUser)) return false;
    }
    if (fUnreviewed && ev.reviewed_at) return false;
    return true;
  });

  // Re-render solo el tbody (no toda la sección)
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:#888;font-size:0.85rem;">
      Sin eventos que coincidan con los filtros.
    </td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.slice(0, 80).map(ev => {
    const sevColor = { critical:'#7a1f1f', high:'#c62828', medium:'#d4a574', low:'#888', info:'#5b8b7d' }[ev.severity] || '#666';
    const snippet = (() => {
      try { return JSON.stringify(ev.payload || {}).slice(0, 100); }
      catch { return ''; }
    })();
    return `<tr style="background:${ev.reviewed_at ? '' : 'rgba(198,40,40,0.04)'};">
      <td style="white-space:nowrap;">${new Date(ev.occurred_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })}</td>
      <td><code style="font-size:0.7rem;background:#fce4e4;color:#7a1f1f;padding:1px 5px;border-radius:3px;">${escapeHtml(ev.event_type)}</code></td>
      <td><span style="color:${sevColor};font-weight:600;text-transform:uppercase;font-size:0.68rem;">${escapeHtml(ev.severity)}</span></td>
      <td style="font-family:monospace;font-size:0.7rem;">${ev.ip || '—'}</td>
      <td style="font-size:0.7rem;">${escapeHtml(ev.user_email || (ev.user_id ? ev.user_id.slice(0,8) : '—'))}</td>
      <td style="font-size:0.7rem;color:#666;">${escapeHtml(ev.field_name || '—')}</td>
      <td style="font-family:monospace;font-size:0.65rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(snippet)}">${escapeHtml(snippet)}</td>
      <td style="white-space:nowrap;">
        ${!ev.reviewed_at && isAdminRole() ? `<button class="btn btn-outline" style="padding:2px 6px;font-size:10px;" onclick="markSecEventReviewed('${ev.id}')" title="Marcar como revisado">✓</button>` : '✓'}
      </td>
    </tr>`;
  }).join('');
}
window._filterSecEvents = _filterSecEvents;

function _clearSecEventsFilters() {
  ['sec-flt-type','sec-flt-ip','sec-flt-user','sec-flt-severity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cb = document.getElementById('sec-flt-unreviewed');
  if (cb) cb.checked = false;
  _filterSecEvents();
}
window._clearSecEventsFilters = _clearSecEventsFilters;

// Guardar chat_id del Telegram alert (solo admin)
async function saveSecurityAlertConfig() {
  if (!isAdminRole()) { showToast('Solo admin principal puede configurar alertas', 'error'); return; }
  const raw = document.getElementById('sec-alert-chat-id')?.value || '';
  const chatId = raw.trim();
  // Validar formato: numérico positivo o negativo (grupos empiezan con -100)
  if (chatId && !/^-?\d+$/.test(chatId)) {
    showToast('Chat ID debe ser numérico (ej. 123456789 o -100123456)', 'error');
    return;
  }
  try {
    // Leer config actual para mergear
    const { data: row } = await sb.from('notification_rules')
      .select('config').eq('rule_key', 'security_telegram_alert').maybeSingle();
    const newConfig = Object.assign({}, row?.config || {}, { chat_id: chatId });
    const { error } = await sb.from('notification_rules')
      .update({ config: newConfig })
      .eq('rule_key', 'security_telegram_alert');
    if (error) throw error;
    showToast(chatId ? 'Alertas Telegram configuradas' : 'Alertas Telegram desactivadas (chat_id vacío)', 'success');
    loadSecurityDashboard();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}
window.saveSecurityAlertConfig = saveSecurityAlertConfig;

// Disparar una alerta de prueba al chat_id configurado
async function testSecurityAlert() {
  if (!isAdminRole()) return;
  try {
    showToast('Enviando alerta de prueba…', 'info');
    const { data, error } = await sb.functions.invoke('log-security-event', {
      body: {
        event_type: 'other',
        severity: 'critical',
        payload: { test: true, triggered_by: currentUserProfile?.full_name || 'admin' },
        field_name: 'manual_test',
        detection_rule: 'admin_test_button',
        route: '/admin/security',
        notes: 'Alerta de prueba disparada manualmente desde el dashboard',
        blocked: false,
      }
    });
    if (error) throw error;
    showToast('Alerta enviada. Revisa el Telegram del chat configurado.', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}
window.testSecurityAlert = testSecurityAlert;

// Marcar un evento de seguridad como revisado (solo admin)
async function markSecEventReviewed(eventId) {
  if (!isAdminRole()) { showToast('Solo admin principal puede marcar eventos', 'error'); return; }
  try {
    const { error } = await sb.from('security_events').update({
      reviewed_by: currentUser?.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', eventId);
    if (error) throw error;
    showToast('Evento marcado como revisado', 'success');
    loadSecurityDashboard();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}
window.markSecEventReviewed = markSecEventReviewed;

async function unblockIPHandler(ip) {
  if (!confirm(`¿Desbloquear la IP ${ip}?`)) return;
  try {
    const { error } = await sb.rpc('unblock_ip', { p_ip: ip });
    if (error) throw error;
    showToast(`IP ${ip} desbloqueada`, 'success');
    loadSecurityDashboard();
  } catch (e) {
    showToast(`Error al desbloquear: ${e.message}`, 'error');
  }
}
window.loadSecurityDashboard = loadSecurityDashboard;
window.unblockIPHandler = unblockIPHandler;

// ============================================================================
// Detalle de IP bloqueada — modal con geo-IP, usuarios afectados, intentos
// ============================================================================
async function showIpDetail(ip) {
  if (!ip) return;
  const modalId = '_ipDetailModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10002;align-items:center;justify-content:center;';
    modal.onclick = (e) => { if (e.target === modal) closeIpDetail(); };
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div style="background:white;border-radius:14px;padding:1.4rem;width:94%;max-width:640px;max-height:92vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3 style="margin:0;color:#0d2d5c;">🔍 Detalle de IP <code style="font-size:0.85em;background:#f4f4f4;padding:2px 8px;border-radius:4px;">${escapeHtml(ip)}</code></h3>
        <button onclick="closeIpDetail()" style="background:none;border:none;font-size:1.6rem;cursor:pointer;color:#888;line-height:1;">&times;</button>
      </div>
      <div id="ip-detail-body" style="font-size:0.88rem;color:#333;">
        <div style="text-align:center;padding:2rem;color:#888;">
          <div style="font-size:1.4rem;margin-bottom:0.5rem;">⏳</div>
          Cargando datos…
        </div>
      </div>
    </div>`;

  // Helper: geo-IP con 2 proveedores. Normaliza respuesta a un schema común.
  // 1) ipapi.co/json/  → primario
  // 2) ipwho.is/       → fallback si ipapi falla / rate-limit / error
  async function fetchGeoIp(ipAddr) {
    // ipapi.co
    try {
      const r = await fetch(`https://ipapi.co/${encodeURIComponent(ipAddr)}/json/`,
        { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error && d.country_name) {
          return {
            source: 'ipapi.co',
            country_name: d.country_name,
            country_code: d.country_code,
            region: d.region,
            city: d.city,
            postal: d.postal,
            latitude: d.latitude,
            longitude: d.longitude,
            timezone: d.timezone,
            languages: d.languages,
            org: d.org,
            asn: d.asn,
          };
        }
      }
    } catch (_) { /* fall through to fallback */ }
    // ipwho.is (fallback)
    try {
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(ipAddr)}`,
        { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        if (d && d.success === true) {
          return {
            source: 'ipwho.is',
            country_name: d.country,
            country_code: d.country_code,
            region: d.region,
            city: d.city,
            postal: d.postal || '',
            latitude: d.latitude,
            longitude: d.longitude,
            timezone: d.timezone?.id || d.timezone?.utc || '',
            languages: '',
            org: d.connection?.isp || d.connection?.org || '',
            asn: d.connection?.asn ? `AS${d.connection.asn}` : '',
          };
        }
      }
    } catch (_) {}
    return null;
  }

  // Fetch en paralelo: geo-IP + auth_attempts + ip_blocklist
  const body = document.getElementById('ip-detail-body');
  const [geoRes, attemptsRes, blockRes] = await Promise.allSettled([
    fetchGeoIp(ip),
    sb.from('auth_attempts')
      .select('email, user_agent, success, reason, occurred_at, metadata')
      .eq('ip', ip)
      .order('occurred_at', { ascending: false })
      .limit(200),
    sb.from('ip_blocklist').select('*').eq('ip', ip).order('blocked_at', { ascending: false }).limit(5),
  ]);

  const geo = geoRes.status === 'fulfilled' ? geoRes.value : null;
  const attempts = (attemptsRes.status === 'fulfilled' ? attemptsRes.value?.data : null) || [];
  const blocks = (blockRes.status === 'fulfilled' ? blockRes.value?.data : null) || [];

  // Agregaciones
  const emailCounts = {};
  const uaCounts = {};
  let okCount = 0, failCount = 0;
  let firstSeen = null, lastSeen = null;
  attempts.forEach(a => {
    if (a.email) emailCounts[a.email] = (emailCounts[a.email] || 0) + 1;
    if (a.user_agent) uaCounts[a.user_agent] = (uaCounts[a.user_agent] || 0) + 1;
    if (a.success) okCount++; else failCount++;
    const t = new Date(a.occurred_at).getTime();
    if (firstSeen === null || t < firstSeen) firstSeen = t;
    if (lastSeen === null || t > lastSeen) lastSeen = t;
  });
  const topEmails = Object.entries(emailCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topUAs = Object.entries(uaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Render
  const geoBlock = (() => {
    if (!geo || geo.error) {
      return `<div style="background:#f8f8f8;padding:0.7rem;border-radius:6px;color:#888;font-size:0.8rem;">
        <i class="fas fa-globe"></i> No se pudo obtener geolocalización para esta IP (servicio externo no disponible o IP privada).
      </div>`;
    }
    const rows = [
      ['País',         (geo.country_name || '—') + (geo.country_code ? ` (${geo.country_code})` : '')],
      ['Región',       geo.region || '—'],
      ['Ciudad',       geo.city || '—'],
      ['Código postal',geo.postal || '—'],
      ['Latitud/Lng',  (geo.latitude && geo.longitude) ? `${geo.latitude}, ${geo.longitude}` : '—'],
      ['Zona horaria', geo.timezone || '—'],
      ['Idioma',       geo.languages || '—'],
      ['ISP / Org',    geo.org || geo.org_name || '—'],
      ['ASN',          geo.asn || '—'],
    ];
    const mapsLink = (geo.latitude && geo.longitude)
      ? `<a href="https://www.google.com/maps?q=${geo.latitude},${geo.longitude}" target="_blank" rel="noopener" style="color:#0d6acb;font-size:0.78rem;">
           <i class="fas fa-map-marker-alt"></i> Ver en Google Maps
         </a>` : '';
    return `<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:4px 8px;color:#666;width:130px;">${k}</td>
        <td style="padding:4px 8px;font-weight:500;">${escapeHtml(String(v))}</td>
      </tr>`).join('')}
    </table>
    ${mapsLink ? `<div style="margin-top:0.5rem;">${mapsLink}</div>` : ''}`;
  })();

  const fmt = (t) => t ? new Date(t).toLocaleString('es-MX') : '—';
  const totalAttempts = attempts.length;

  body.innerHTML = `
    <!-- Resumen -->
    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:1rem;">
      <div style="flex:1;min-width:120px;background:#f8f8f8;padding:0.6rem;border-radius:8px;border-left:3px solid #b54f3a;">
        <div style="font-size:0.7rem;color:#888;text-transform:uppercase;">Intentos totales</div>
        <div style="font-size:1.3rem;font-weight:700;">${totalAttempts}</div>
        <div style="font-size:0.72rem;color:#666;">${failCount} fallidos · ${okCount} exitosos</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f8f8f8;padding:0.6rem;border-radius:8px;border-left:3px solid #5b8b7d;">
        <div style="font-size:0.7rem;color:#888;text-transform:uppercase;">Bloqueos históricos</div>
        <div style="font-size:1.3rem;font-weight:700;">${blocks.length}</div>
        <div style="font-size:0.72rem;color:#666;">${blocks.filter(b => !b.unlocked_at).length} activos</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f8f8f8;padding:0.6rem;border-radius:8px;border-left:3px solid #d4a574;">
        <div style="font-size:0.7rem;color:#888;text-transform:uppercase;">Primera vista</div>
        <div style="font-size:0.84rem;font-weight:500;">${fmt(firstSeen)}</div>
        <div style="font-size:0.72rem;color:#666;">Última: ${fmt(lastSeen)}</div>
      </div>
    </div>

    <!-- Geo -->
    <h4 style="margin:1rem 0 0.4rem;font-size:0.92rem;color:#0d2d5c;"><i class="fas fa-globe-americas" style="color:#5b8b7d;"></i> Geolocalización</h4>
    ${geoBlock}

    <!-- Usuarios afectados -->
    <h4 style="margin:1.2rem 0 0.4rem;font-size:0.92rem;color:#0d2d5c;">
      <i class="fas fa-user-shield" style="color:#b54f3a;"></i> Cuentas que intentaron desde esta IP
    </h4>
    ${topEmails.length === 0
      ? `<p class="text-muted text-small" style="margin:0;">Sin intentos registrados con email.</p>`
      : `<table style="width:100%;font-size:0.82rem;border-collapse:collapse;">
          <thead><tr style="background:#f4f4f4;">
            <th style="text-align:left;padding:6px 8px;">Email</th>
            <th style="text-align:center;padding:6px 8px;width:80px;">Intentos</th>
          </tr></thead>
          <tbody>${topEmails.map(([e, n]) => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 8px;font-family:monospace;font-size:0.78rem;">${escapeHtml(e)}</td>
            <td style="padding:6px 8px;text-align:center;font-weight:600;">${n}</td>
          </tr>`).join('')}</tbody>
        </table>`}

    <!-- User agents -->
    ${topUAs.length > 0 ? `
      <h4 style="margin:1.2rem 0 0.4rem;font-size:0.92rem;color:#0d2d5c;">
        <i class="fas fa-desktop" style="color:#5b8b7d;"></i> User-Agents principales
      </h4>
      <div style="font-size:0.74rem;color:#555;">
        ${topUAs.map(([ua, n]) => `<div style="padding:4px 6px;background:#fafafa;border-radius:4px;margin-bottom:3px;">
          <strong>${n}×</strong> <code style="word-break:break-all;">${escapeHtml(ua.slice(0, 200))}</code>
        </div>`).join('')}
      </div>` : ''}

    <!-- Últimos intentos -->
    ${attempts.length > 0 ? `
      <h4 style="margin:1.2rem 0 0.4rem;font-size:0.92rem;color:#0d2d5c;">
        <i class="fas fa-clock"></i> Últimos ${Math.min(20, attempts.length)} intentos
      </h4>
      <div style="max-height:240px;overflow-y:auto;border:1px solid #eee;border-radius:6px;">
        <table style="width:100%;font-size:0.76rem;border-collapse:collapse;">
          <thead><tr style="background:#f4f4f4;position:sticky;top:0;">
            <th style="text-align:left;padding:5px 8px;">Fecha</th>
            <th style="text-align:left;padding:5px 8px;">Email</th>
            <th style="text-align:center;padding:5px 8px;width:50px;">OK</th>
            <th style="text-align:left;padding:5px 8px;">Razón</th>
          </tr></thead>
          <tbody>${attempts.slice(0, 20).map(a => `<tr style="border-bottom:1px solid #f4f4f4;${a.success ? '' : 'background:rgba(181,79,58,0.04);'}">
            <td style="padding:4px 8px;color:#666;">${new Date(a.occurred_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td style="padding:4px 8px;font-family:monospace;">${escapeHtml(a.email || '—')}</td>
            <td style="padding:4px 8px;text-align:center;color:${a.success ? '#3b7a3a' : '#b54f3a'};font-weight:700;">${a.success ? '✓' : '✗'}</td>
            <td style="padding:4px 8px;color:#666;">${escapeHtml(a.reason || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

    <!-- Acciones -->
    <div style="display:flex;gap:0.6rem;margin-top:1.2rem;justify-content:flex-end;border-top:1px solid #eee;padding-top:0.8rem;">
      <button class="btn btn-outline btn-sm" onclick="closeIpDetail()">Cerrar</button>
      <button class="btn btn-sm" style="background:#3b7a3a;color:white;" onclick="unblockIPHandler('${escapeHtml(ip)}');closeIpDetail();">
        🔓 Desbloquear esta IP
      </button>
    </div>`;
}

function closeIpDetail() {
  const m = document.getElementById('_ipDetailModal');
  if (m) m.style.display = 'none';
}

window.showIpDetail = showIpDetail;
window.closeIpDetail = closeIpDetail;

// ============================================================================
// CUOTAS — service_quotas (Gemini, Supabase DB/Storage)
// ============================================================================
async function loadQuotasDashboard() {
  const wrap = document.getElementById('quotas-container');
  if (!wrap) return;
  if (!(isAdminRole() || isRectoriaRole())) {
    wrap.innerHTML = '<p class="text-muted">Solo el administrador principal o Rectoría pueden ver esta sección.</p>';
    return;
  }
  wrap.innerHTML = '<p>Cargando cuotas…</p>';
  try {
    const { data: quotas } = await sb.from('service_quotas').select('*').order('updated_at', { ascending: false });
    const latestByService = {};
    (quotas || []).forEach(q => {
      if (!latestByService[q.service] ||
          new Date(q.updated_at) > new Date(latestByService[q.service].updated_at)) {
        latestByService[q.service] = q;
      }
    });
    const services = Object.values(latestByService);

    const colorFor = pct => pct >= 95 ? '#b54f3a' : pct >= 80 ? '#d4a574' : '#3b7a3a';
    const labelFor = pct => pct >= 95 ? 'CRÍTICO' : pct >= 90 ? 'Alerta' : pct >= 80 ? 'Advertencia' : 'OK';

    wrap.innerHTML = `
      <p class="text-muted text-small" style="margin-bottom:14px;">
        <i class="fas fa-info-circle"></i> Snapshot tomado por el job <code>check-quotas</code>.
        Si una cuota supera 80% se crea una notificación al admin; si supera 90% se envía email.
        Ejecuta manualmente: <code>supabase functions invoke check-quotas</code>
      </p>
      ${services.length === 0 ? `
        <div style="background:#fff;padding:24px;border-radius:10px;text-align:center;color:#888;">
          No hay datos de cuotas todavía. Despliega <code>check-quotas</code> y agrega su cron.
        </div>
      ` : services.map(q => `
        <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:12px;border-left:4px solid ${colorFor(q.pct)};">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;font-weight:600;color:#333;text-transform:capitalize;">${q.service.replace(/_/g,' ')}</div>
              <div style="font-size:11px;color:#777;margin-top:2px;">
                ${Number(q.current_usage).toLocaleString('es-MX')} / ${Number(q.quota_limit).toLocaleString('es-MX')} ${q.metric}
                ${q.period_end ? ` · ciclo termina ${new Date(q.period_end).toLocaleDateString('es-MX')}` : ''}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:24px;font-weight:700;color:${colorFor(q.pct)};">${Number(q.pct).toFixed(1)}%</div>
              <div style="font-size:10px;color:${colorFor(q.pct)};font-weight:600;">${labelFor(q.pct)}</div>
            </div>
          </div>
          <div style="background:#f0ede5;border-radius:6px;height:10px;overflow:hidden;">
            <div style="width:${Math.min(100, q.pct)}%;background:${colorFor(q.pct)};height:100%;transition:width 0.4s;"></div>
          </div>
          <div style="font-size:10px;color:#999;margin-top:6px;">Actualizado: ${new Date(q.updated_at).toLocaleString('es-MX')}</div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    console.error('loadQuotasDashboard error:', err);
    wrap.innerHTML = `<p class="text-muted" style="color:#a33;">Error: ${escapeHtml(err.message || String(err))}</p>`;
  }
}
window.loadQuotasDashboard = loadQuotasDashboard;

// ---- EXPOSE ALL ----
window.switchAdminTab = switchAdminTab;
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminUsers = loadAdminUsers;
window.saveAdminUser = saveAdminUser;
window.editAdminUser = editAdminUser;
window.loadAdminTrees = loadAdminTrees;
window.saveAdminTree = saveAdminTree;
window.editAdminTree = editAdminTree;

// ============================================================================
// EDITOR GRÁFICO DE UBICACIÓN (estilo Uber: pin draggable en mapa)
// ----------------------------------------------------------------------------
// Modal con Leaflet centrado en la coord actual del árbol. El admin arrastra
// el pin (o hace click en el mapa) para corregir la ubicación. Al guardar,
// los 3 mapas (Mapa 3D, Heatmap, FES Iztacala 3D) se sincronizan solos
// porque todos leen del mismo campo trees_catalog.location_lat/lng.
// ============================================================================

// Implementación reusable. Acepta callback onSave para que pueda usarse
// tanto desde el botón de la fila (guarda directo a BD) como desde el form
// de edición (solo actualiza los inputs lat/lng).
function openLocationMapEditor(opts) {
  const { initialLat, initialLng, treeCode, treeName, onSave } = opts;
  if (typeof L === 'undefined') {
    showToast('Leaflet no está cargado', 'error');
    return;
  }

  // Coord inicial: la del árbol o el centro de FES Iztacala como fallback
  const lat0 = (initialLat != null && isFinite(initialLat)) ? initialLat : 19.52552345;
  const lng0 = (initialLng != null && isFinite(initialLng)) ? initialLng : -99.1881276;
  const hadCoord = (initialLat != null && initialLng != null);

  const existing = document.getElementById('tree-location-editor-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'tree-location-editor-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:1rem;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 50px rgba(0,0,0,0.45);overflow:hidden;">
      <div style="padding:0.9rem 1.3rem;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
        <div>
          <h3 style="margin:0;color:#1b5e20;font-size:1.05rem;"><i class="fas fa-map-marker-alt"></i> Editar ubicación</h3>
          <p style="margin:0.2rem 0 0;color:#666;font-size:0.82rem;">${escapeHtml(treeCode || '')} · ${escapeHtml(treeName || 'Árbol')}</p>
        </div>
        <button id="tree-loc-close-x" style="background:transparent;border:none;font-size:1.4rem;cursor:pointer;color:#999;line-height:1;">&times;</button>
      </div>
      <div id="tree-location-map" style="flex:1;min-height:460px;"></div>
      <div style="padding:0.8rem 1.3rem;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;background:#fafafa;flex-wrap:wrap;">
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.78rem;color:#444;">
          <span style="color:#888;">Coord:</span> <span id="tree-loc-coords">${lat0.toFixed(6)}, ${lng0.toFixed(6)}</span>
          ${!hadCoord ? '<span style="color:#c66;margin-left:0.5rem;">(sin ubicación previa, partiendo del centro de FES Iztacala)</span>' : ''}
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button id="tree-loc-cancel" style="background:#f0f0f0;color:#444;border:none;padding:0.6rem 1.1rem;border-radius:10px;font-weight:500;cursor:pointer;">Cancelar</button>
          <button id="tree-loc-save" style="background:#2E7D32;color:#fff;border:none;padding:0.6rem 1.2rem;border-radius:10px;font-weight:600;cursor:pointer;">Guardar ubicación</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Inicializar el mapa después de que el modal esté en el DOM
  setTimeout(() => {
    const mapEl = document.getElementById('tree-location-map');
    const map = L.map(mapEl, { zoomControl: true }).setView([lat0, lng0], 18);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);

    // Overlay del polígono del campus (referencia visual)
    if (window.IztacalaCampus && window.IztacalaCampus.polygon) {
      L.polygon(window.IztacalaCampus.polygon, {
        color: '#1b5e20', weight: 2, opacity: 0.7,
        fillColor: '#1b5e20', fillOpacity: 0.05,
        dashArray: '6 4', interactive: false
      }).addTo(map);
    }

    // Pin draggable
    const pin = L.marker([lat0, lng0], {
      draggable: true,
      autoPan: true
    }).addTo(map);
    pin.bindTooltip('Arrastra para mover · o haz click en el mapa', {
      permanent: true, direction: 'top', offset: [-15, -8]
    }).openTooltip();

    const updateCoordDisplay = (latlng) => {
      document.getElementById('tree-loc-coords').textContent =
        `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    };
    pin.on('drag', () => updateCoordDisplay(pin.getLatLng()));
    map.on('click', (e) => {
      pin.setLatLng(e.latlng);
      updateCoordDisplay(e.latlng);
    });

    // Botones
    const closeModal = () => modal.remove();
    document.getElementById('tree-loc-close-x').addEventListener('click', closeModal);
    document.getElementById('tree-loc-cancel').addEventListener('click', closeModal);
    document.getElementById('tree-loc-save').addEventListener('click', async () => {
      const pos = pin.getLatLng();
      try {
        if (typeof onSave === 'function') await onSave(pos.lat, pos.lng);
        closeModal();
      } catch (err) {
        showToast('Error: ' + (err.message || err), 'error');
      }
    });

    // Cerrar con click en backdrop (pero no dentro del modal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Asegurar que el mapa se renderice bien después del setTimeout
    setTimeout(() => map.invalidateSize(), 80);
  }, 50);
}

// Handler para el botón de la fila (guarda directo a BD)
async function editAdminTreeLocation(treeId) {
  const { data: tree, error } = await sb
    .from('trees_catalog')
    .select('id, tree_code, common_name, species, location_lat, location_lng')
    .eq('id', treeId)
    .single();
  if (error || !tree) {
    showToast('No se pudo cargar el árbol', 'error');
    return;
  }
  openLocationMapEditor({
    initialLat: tree.location_lat,
    initialLng: tree.location_lng,
    treeCode: tree.tree_code,
    treeName: tree.common_name || tree.species || 'Árbol',
    onSave: async (lat, lng) => {
      const { error: upErr } = await sb.from('trees_catalog').update({
        location_lat: lat,
        location_lng: lng,
        updated_at: new Date().toISOString()
      }).eq('id', treeId);
      if (upErr) throw upErr;
      showToast('Ubicación actualizada ✓', 'success');
      if (typeof loadAdminTrees === 'function') loadAdminTrees();
    }
  });
}

window.openLocationMapEditor = openLocationMapEditor;
window.editAdminTreeLocation = editAdminTreeLocation;
// ============================================================================
// HELPER — Resuelve photo_url de Storage a URL utilizable
// ============================================================================
// Si la URL ya es absoluta (https://...) la devuelve tal cual.
// Si es un path relativo (ej: "196/1778517852295.jpg"), genera una signed URL
// del bucket indicado, válida 1 hora.
async function _resolveStoragePhoto(photoUrl, bucket) {
  if (!photoUrl) return null;
  if (/^https?:\/\//.test(photoUrl)) return photoUrl;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(photoUrl, 3600);
    if (error) {
      // Antes ignorábamos el error → la foto se veía "deshabilitada" sin pista
      console.warn('[_resolveStoragePhoto] signed URL error', { bucket, photoUrl, error });
      if (typeof logError === 'function') {
        logError({
          severity: 'warning', source: 'frontend_web',
          action: '_resolveStoragePhoto',
          error_message: error.message || String(error),
          error_code: error.statusCode || error.code || null,
          context: { bucket, photoUrl }
        });
      }
      return null;
    }
    return data?.signedUrl || null;
  } catch (e) {
    console.warn('Signed URL exception', bucket, photoUrl, e);
    return null;
  }
}

// ============================================================================
// VER SEGUIMIENTOS DE UN ÁRBOL (modal admin)
// ============================================================================
async function viewTreeMeasurementsAdmin(treeId) {
  try {
    const { data: tree } = await sb.from('trees_catalog').select('id, tree_code, common_name, species, photo_url').eq('id', treeId).single();
    if (!tree) { showToast('Árbol no encontrado', 'error'); return; }

    const { data: meas } = await sb.from('tree_measurements')
      .select('id, measurement_date, height_cm, trunk_diameter_cm, crown_diameter_cm, health_score, photo_url, observations, user_id, location_lat, location_lng')
      .eq('tree_id', treeId)
      .order('measurement_date', { ascending: false });

    // Foto INICIAL: primero la del árbol (creada al alta), si no, la del seguimiento más antiguo
    let initialPhotoSrc = null;
    if (tree.photo_url) {
      initialPhotoSrc = await _resolveStoragePhoto(tree.photo_url, 'tree-photos');
    } else if (meas && meas.length > 0) {
      // El más antiguo es el último del array (descending order)
      const oldest = meas[meas.length - 1];
      if (oldest.photo_url) {
        initialPhotoSrc = await _resolveStoragePhoto(oldest.photo_url, 'tree-photos');
      }
    }

    // Cargar nombres de usuarios
    const userIds = [...new Set((meas || []).map(m => m.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await sb.from('user_profiles').select('id, full_name').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u.full_name; });
    }

    // Resolver TODAS las photo_url a signed URLs (en paralelo)
    await Promise.all((meas || []).map(async (m) => {
      m._photoSrc = await _resolveStoragePhoto(m.photo_url, 'tree-photos');
    }));

    let rowsHtml;
    if (!meas || meas.length === 0) {
      rowsHtml = '<div style="padding:2rem;text-align:center;color:#888;">Este árbol aún no tiene seguimientos.</div>';
    } else {
      rowsHtml = meas.map((m, i) => {
        // formatDayLocal extrae solo el día del string (evita el bug de TZ
        // donde "2026-06-05 00:00 UTC" se ve como "4 jun 18:00" en México)
        const dateStr = formatDayLocal(m.measurement_date);
        // La hora ya no es informativa (era 00:00 UTC por el bug). La omitimos.
        const timeStr = '';
        const score = m.health_score;
        const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
        const userName = userMap[m.user_id] || 'Usuario';

        // Limpiar observaciones de tags [RUBROS], [PLANTACION]
        let cleanObs = (m.observations || '').replace(/\[RUBROS\]\s*\{[^}]*\}/g, '').replace(/\[PLANTACION\]\s*\{[^}]*\}/g, '').trim();
        if (cleanObs.length > 120) cleanObs = cleanObs.substring(0, 120) + '…';

        // ── Foto ──
        // Si _photoSrc carga: imagen real. Si NO carga (error de signed URL),
        // todavía sabemos que TENÍA foto (m.photo_url no es null) → mostramos
        // ícono con badge ⚠ para indicar "tiene foto pero no se pudo cargar".
        let photoTag;
        if (m._photoSrc) {
          photoTag = `<img src="${escapeHtml(m._photoSrc)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:zoom-in;" onclick="window.open(this.src,'_blank')" onerror="this.style.display='none'">`;
        } else if (m.photo_url) {
          photoTag = '<div style="width:64px;height:64px;background:#fff5e6;border:1px dashed #d97706;border-radius:8px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#d97706;font-size:1.1rem;" title="Tiene foto pero no se pudo cargar la URL firmada">📷<span style="font-size:0.55rem;margin-top:2px;">⚠ link</span></div>';
        } else {
          photoTag = '<div style="width:64px;height:64px;background:#eee;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:1.4rem;" title="Sin foto">📷</div>';
        }

        // ── Indicador de ubicación ──
        const hasLoc = (m.location_lat != null && m.location_lng != null);
        const locTag = hasLoc
          ? `<a href="https://www.google.com/maps?q=${m.location_lat},${m.location_lng}" target="_blank" title="Ver ubicación en Google Maps (${m.location_lat.toFixed(5)}, ${m.location_lng.toFixed(5)})" style="width:64px;height:30px;background:rgba(46,125,50,0.12);color:#1b5e20;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:0.2rem;font-size:0.78rem;text-decoration:none;flex-shrink:0;margin-top:4px;"><i class="fas fa-map-marker-alt"></i> GPS</a>`
          : `<div title="Sin ubicación registrada en este seguimiento" style="width:64px;height:30px;background:#eee;color:#bbb;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:0.2rem;font-size:0.78rem;flex-shrink:0;margin-top:4px;"><i class="fas fa-map-marker-alt"></i> —</div>`;

        // Wrapper foto + pin (columna)
        const mediaCol = `<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">${photoTag}${locTag}</div>`;

        return `
          <div style="display:flex;gap:0.9rem;padding:0.9rem;border-bottom:1px solid #f0f0f0;align-items:flex-start;${i === 0 ? 'background:rgba(46,125,50,0.04);' : ''}">
            ${mediaCol}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <strong style="color:#1b5e20;">${dateStr} <span style="color:#999;font-size:0.78rem;font-weight:normal;">· ${timeStr}</span></strong>
                  ${score != null ? `<span style="background:${color};color:#fff;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;margin-left:0.4rem;">${score}/100</span>` : ''}
                </div>
                <div style="display:flex;gap:0.3rem;">
                  <button class="btn btn-sm btn-secondary" onclick="editAdminMeasurement(${m.id}, ${treeId})" style="padding:3px 8px;font-size:0.72rem;" title="Editar medición">✏️</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteAdminMeasurement(${m.id}, ${treeId})" style="padding:3px 8px;font-size:0.72rem;" title="Eliminar medición">🗑️</button>
                </div>
              </div>
              <div style="font-size:0.78rem;color:#666;margin-top:2px;">por ${escapeHtml(userName)}</div>
              <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;font-size:0.72rem;color:#444;">
                ${m.height_cm != null ? `<span style="background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:6px;">📏 ${m.height_cm} cm</span>` : ''}
                ${m.trunk_diameter_cm != null ? `<span style="background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:6px;">🪵 ${m.trunk_diameter_cm} cm</span>` : ''}
                ${m.crown_diameter_cm != null ? `<span style="background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:6px;">🌿 ${m.crown_diameter_cm} cm</span>` : ''}
              </div>
              ${cleanObs ? `<p class="text-small" style="margin:0.5rem 0 0;color:#555;font-size:0.78rem;line-height:1.4;"><i class="fas fa-sticky-note"></i> ${escapeHtml(cleanObs)}</p>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    const initialThumb = initialPhotoSrc
      ? `<div style="flex-shrink:0;text-align:center;">
           <img src="${escapeHtml(initialPhotoSrc)}"
                onclick="window.open('${safeJsAttr(initialPhotoSrc)}','_blank')"
                title="Foto inicial — click para ver completa"
                style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:zoom-in;border:2px solid #4CAF50;box-shadow:0 2px 6px rgba(0,0,0,0.15);"
                onerror="this.style.display='none'">
           <div style="font-size:0.65rem;color:#888;margin-top:2px;">📸 Inicial</div>
         </div>`
      : '';

    showModal(`Seguimientos: ${escapeHtml(tree.common_name || tree.tree_code)}`, `
      <div style="margin-bottom:0.7rem;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="color:#666;font-size:0.85rem;flex:1;">
          <strong>${escapeHtml(tree.tree_code)}</strong> · <em>${escapeHtml(tree.species || '')}</em><br>
          ${(meas || []).length} seguimiento${(meas || []).length !== 1 ? 's' : ''}
        </div>
        ${initialThumb}
      </div>
      <div style="max-height:60vh;overflow-y:auto;border:1px solid #eee;border-radius:10px;">
        ${rowsHtml}
      </div>
    `);
  } catch (err) {
    showToast('Error cargando seguimientos: ' + err.message, 'error');
  }
}

// ============================================================================
// VER VISITAS DE UN JARDÍN (modal admin)
// ============================================================================
async function viewGardenVisitsAdmin(gardenId) {
  try {
    const { data: garden } = await sb.from('gardens').select('id, name, campus').eq('id', gardenId).single();
    if (!garden) { showToast('Jardín no encontrado', 'error'); return; }

    const { data: visits } = await sb.from('garden_visits')
      .select('id, visit_date, visit_type, photo_url, health_score, activities, observations, user_id')
      .eq('garden_id', gardenId)
      .order('visit_date', { ascending: false });

    const userIds = [...new Set((visits || []).map(v => v.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await sb.from('user_profiles').select('id, full_name').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u.full_name; });
    }

    // Resolver photo_url de cada visita (bucket garden-photos)
    await Promise.all((visits || []).map(async (v) => {
      v._photoSrc = await _resolveStoragePhoto(v.photo_url, 'garden-photos');
    }));

    const activitiesDict = {
      riego: '💧 Riego', limpieza: '🧹 Limpieza', poda: '✂️ Poda',
      fertilizacion: '🌱 Fertilización', control_plagas: '🪲 Plagas',
      control_maleza: '🌾 Maleza', siembra_reposicion: '🪴 Siembra',
      mantillo_hojarasca: '🍂 Mantillo', aireacion: '🪛 Aireación',
      inspeccion: '🔍 Inspección', mantenimiento_estructural: '🔧 Estructural',
      cuidado_polinizadores: '🐝 Polinizadores', otro: '📌 Otro',
    };

    let rowsHtml;
    if (!visits || visits.length === 0) {
      rowsHtml = '<div style="padding:2rem;text-align:center;color:#888;">Este jardín aún no tiene visitas registradas.</div>';
    } else {
      rowsHtml = visits.map((v, i) => {
        const dt = new Date(v.visit_date);
        const dateStr = dt.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const score = v.health_score;
        const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';
        const userName = userMap[v.user_id] || 'Usuario';

        const acts = (v.activities || []).map(a => activitiesDict[a] || a).join(' · ');
        const obsTrunc = (v.observations || '').trim().substring(0, 120);
        const obs = obsTrunc + ((v.observations || '').length > 120 ? '…' : '');

        const photoTag = v._photoSrc
          ? `<img src="${escapeHtml(v._photoSrc)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:zoom-in;" onclick="window.open(this.src,'_blank')" onerror="this.style.display='none'">`
          : '<div style="width:64px;height:64px;background:#eee;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:1.4rem;">📷</div>';

        return `
          <div style="display:flex;gap:0.9rem;padding:0.9rem;border-bottom:1px solid #f0f0f0;align-items:flex-start;${i === 0 ? 'background:rgba(26,68,128,0.04);' : ''}">
            ${photoTag}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <strong style="color:#0d2d5c;">${v.visit_type === 'primer_registro' ? '🌟 Primer registro' : 'Visita'} — ${dateStr} <span style="color:#999;font-size:0.78rem;font-weight:normal;">· ${timeStr}</span></strong>
                  ${score != null ? `<span style="background:${color};color:#fff;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;margin-left:0.4rem;">${score}/100</span>` : ''}
                </div>
                <div style="display:flex;gap:0.3rem;">
                  <button class="btn btn-sm btn-secondary" onclick="editAdminGardenVisit('${v.id}','${gardenId}')" style="padding:3px 8px;font-size:0.72rem;" title="Editar">✏️</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteAdminGardenVisit('${v.id}','${gardenId}')" style="padding:3px 8px;font-size:0.72rem;" title="Eliminar">🗑️</button>
                </div>
              </div>
              <div style="font-size:0.78rem;color:#666;margin-top:2px;">por ${escapeHtml(userName)}</div>
              ${acts ? `<div style="margin-top:0.5rem;font-size:0.75rem;color:#444;">${escapeHtml(acts)}</div>` : ''}
              ${obs ? `<p class="text-small" style="margin:0.5rem 0 0;color:#555;font-size:0.78rem;line-height:1.4;"><i class="fas fa-sticky-note"></i> ${escapeHtml(obs)}</p>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    showModal(`Seguimientos: ${escapeHtml(garden.name)}`, `
      <div style="margin-bottom:0.7rem;color:#666;font-size:0.85rem;">
        Campus <strong>${escapeHtml(garden.campus || '—')}</strong> · ${(visits || []).length} visita${(visits || []).length !== 1 ? 's' : ''}
      </div>
      <div style="max-height:60vh;overflow-y:auto;border:1px solid #eee;border-radius:10px;">
        ${rowsHtml}
      </div>
    `);
  } catch (err) {
    showToast('Error cargando visitas: ' + err.message, 'error');
  }
}

window.viewTreeMeasurementsAdmin = viewTreeMeasurementsAdmin;
window.viewGardenVisitsAdmin = viewGardenVisitsAdmin;

// ============================================================================
// EDIT / DELETE de mediciones de árbol (admin)
// ============================================================================
async function editAdminMeasurement(measId, treeId) {
  const { data: m } = await sb.from('tree_measurements').select('*').eq('id', measId).single();
  if (!m) { showToast('Medición no encontrada', 'error'); return; }
  // Extraer YYYY-MM-DD del string sin convertir TZ (evita el bug de mostrar
  // "4 jun" cuando en BD dice "2026-06-05 00:00 UTC").
  const dateOnly = m.measurement_date ? String(m.measurement_date).slice(0, 10) : '';

  showModal('Editar medición', `
    <form id="edit-meas-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.6rem;">
        <div class="form-group">
          <label>Fecha del seguimiento</label>
          <input type="date" id="em-date" value="${dateOnly}" max="${todayLocalYMD()}" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group">
          <label>Salud (0-100)</label>
          <input type="number" id="em-health" min="0" max="100" value="${m.health_score ?? ''}" style="width:100%;padding:0.5rem;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.6rem;margin-bottom:0.6rem;">
        <div class="form-group">
          <label>Altura (cm)</label>
          <input type="number" step="0.1" id="em-height" value="${m.height_cm ?? ''}" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group">
          <label>Tronco (cm)</label>
          <input type="number" step="0.1" id="em-trunk" value="${m.trunk_diameter_cm ?? ''}" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group">
          <label>Copa (cm)</label>
          <input type="number" step="0.1" id="em-crown" value="${m.crown_diameter_cm ?? ''}" style="width:100%;padding:0.5rem;">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem;">
        <label>Observaciones</label>
        <textarea id="em-obs" rows="3" style="width:100%;padding:0.5rem;">${escapeHtml(m.observations || '')}</textarea>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar cambios</button>
      </div>
    </form>
  `);

  document.getElementById('edit-meas-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {
      // Fijar mediodía hora México (-06:00) en lugar de UTC midnight
      measurement_date: dateInputToMexicoNoon(document.getElementById('em-date').value),
      health_score: parseInt(document.getElementById('em-health').value) || null,
      height_cm: parseFloat(document.getElementById('em-height').value) || null,
      trunk_diameter_cm: parseFloat(document.getElementById('em-trunk').value) || null,
      crown_diameter_cm: parseFloat(document.getElementById('em-crown').value) || null,
      observations: document.getElementById('em-obs').value.trim() || null,
    };
    const { error } = await sb.from('tree_measurements').update(updates).eq('id', measId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Medición actualizada', 'success');
    closeModal();
    viewTreeMeasurementsAdmin(treeId);
  });
}

async function deleteAdminMeasurement(measId, treeId) {
  if (!confirm('¿Eliminar esta medición? No se puede deshacer.')) return;
  const { error } = await sb.from('tree_measurements').delete().eq('id', measId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Medición eliminada', 'success');
  viewTreeMeasurementsAdmin(treeId);
}

// ============================================================================
// EDIT / DELETE de visitas al jardín (admin)
// ============================================================================
async function editAdminGardenVisit(visitId, gardenId) {
  const { data: v } = await sb.from('garden_visits').select('*').eq('id', visitId).single();
  if (!v) { showToast('Visita no encontrada', 'error'); return; }
  const dateLocal = v.visit_date ? new Date(v.visit_date).toISOString().slice(0, 16) : '';
  const activities = v.activities || [];
  const allActivities = ['riego','limpieza','poda','fertilizacion','control_plagas','control_maleza','siembra_reposicion','mantillo_hojarasca','aireacion','inspeccion','mantenimiento_estructural','cuidado_polinizadores','otro'];

  const actsHtml = allActivities.map(a => `
    <label style="display:inline-flex;align-items:center;gap:0.3rem;background:${activities.includes(a) ? 'rgba(46,125,50,0.15)' : '#f5f5f5'};padding:4px 10px;border-radius:12px;font-size:0.78rem;cursor:pointer;border:1px solid ${activities.includes(a) ? '#2E7D32' : '#ddd'};">
      <input type="checkbox" value="${a}" name="ev-activity" ${activities.includes(a) ? 'checked' : ''} style="margin:0;">
      ${a.replace(/_/g, ' ')}
    </label>
  `).join('');

  showModal('Editar visita al jardín', `
    <form id="edit-visit-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.6rem;">
        <div class="form-group">
          <label>Fecha y hora</label>
          <input type="datetime-local" id="ev-date" value="${dateLocal}" style="width:100%;padding:0.5rem;">
        </div>
        <div class="form-group">
          <label>Salud (0-100)</label>
          <input type="number" id="ev-health" min="0" max="100" value="${v.health_score ?? ''}" style="width:100%;padding:0.5rem;">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem;">
        <label>Actividades realizadas</label>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.3rem;">${actsHtml}</div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem;">
        <label>Observaciones</label>
        <textarea id="ev-obs" rows="3" style="width:100%;padding:0.5rem;">${escapeHtml(v.observations || '')}</textarea>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar cambios</button>
      </div>
    </form>
  `);

  document.getElementById('edit-visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedActs = Array.from(document.querySelectorAll('input[name="ev-activity"]:checked')).map(c => c.value);
    const updates = {
      visit_date: new Date(document.getElementById('ev-date').value).toISOString(),
      health_score: parseInt(document.getElementById('ev-health').value) || null,
      activities: selectedActs,
      observations: document.getElementById('ev-obs').value.trim() || null,
    };
    const { error } = await sb.from('garden_visits').update(updates).eq('id', visitId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Visita actualizada', 'success');
    closeModal();
    viewGardenVisitsAdmin(gardenId);
  });
}

async function deleteAdminGardenVisit(visitId, gardenId) {
  if (!confirm('¿Eliminar esta visita al jardín? No se puede deshacer.')) return;
  const { error } = await sb.from('garden_visits').delete().eq('id', visitId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Visita eliminada', 'success');
  viewGardenVisitsAdmin(gardenId);
}

window.editAdminMeasurement = editAdminMeasurement;
window.deleteAdminMeasurement = deleteAdminMeasurement;
window.editAdminGardenVisit = editAdminGardenVisit;
window.deleteAdminGardenVisit = deleteAdminGardenVisit;
window.suggestGardenGoalsWithAI = suggestGardenGoalsWithAI;

// ============================================================================
// GENERADOR DE POSTS PARA REDES SOCIALES (Bloque 1 — innovación)
// Genera imágenes 1080×1080 / 1080×1920 listas para descargar/compartir.
// ============================================================================
async function generateAndDownloadPost(type) {
  if (!window.SocialPoster) {
    showToast('Módulo de redes aún no carga, intenta de nuevo en 1 segundo', 'warning');
    return;
  }
  const preview = document.getElementById('post-preview');
  if (preview) {
    preview.style.display = 'block';
    preview.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#666;"><i class="fas fa-spinner fa-spin"></i> Generando contenido…</div>';
  }

  let canvas, caption, filename;
  try {
    if (type === 'tree-of-month') {
      const { data: trees } = await sb.from('trees_catalog').select('*').order('health_score', { ascending: false }).limit(1);
      if (!trees || !trees[0]) { showToast('No hay árboles registrados', 'warning'); return; }
      canvas = await window.SocialPoster.generateTreeOfMonth(trees[0]);
      caption = window.SocialPoster.suggestedCaption('tree-of-month', trees[0]);
      filename = `arbol-mes-${trees[0].tree_code || trees[0].id}.png`;
    }

    else if (type === 'monthly-recap') {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data: trees } = await sb.from('trees_catalog').select('*');
      const { data: meas } = await sb.from('tree_measurements').select('id').gte('measurement_date', monthStart.toISOString());
      const { count: usersCount } = await sb.from('user_profiles').select('*', { count: 'exact', head: true });
      const co2Total = window.CO2Calculator?.totalCO2Stored(trees || []) || 0;
      const data = {
        trees: (trees || []).length,
        measurements: (meas || []).length,
        co2: Math.round(co2Total),
        users: usersCount || 0,
      };
      canvas = window.SocialPoster.generateMonthlyRecap(data);
      caption = window.SocialPoster.suggestedCaption('monthly-recap', data);
      filename = `resumen-mes-${new Date().toISOString().slice(0,7)}.png`;
    }

    else if (type === 'species-card') {
      const cards = window.SPECIES_CARDS || [];
      if (!cards.length) { showToast('No hay fichas botánicas cargadas', 'warning'); return; }
      const card = cards[Math.floor(Math.random() * cards.length)];
      canvas = window.SocialPoster.generateSpeciesCard(card);
      caption = window.SocialPoster.suggestedCaption('species-card', card);
      filename = `especie-${card.common_name.replace(/\s+/g, '-').toLowerCase()}.png`;
    }

    else if (type === 'milestone') {
      const { count: total } = await sb.from('tree_measurements').select('*', { count: 'exact', head: true });
      const m = {
        number: total || 0,
        label: 'seguimientos completados',
        subtitle: 'Gracias a la comunidad UNAM por su cuidado constante.',
      };
      canvas = window.SocialPoster.generateMilestone(m);
      caption = window.SocialPoster.suggestedCaption('milestone', m);
      filename = `hito-${total}-seguimientos.png`;
    }

    else if (type === 'before-after') {
      const { data: trees } = await sb.from('trees_catalog').select('id, tree_code, common_name, species').limit(30);
      let chosen = null, firstM = null, lastM = null;
      for (const t of (trees || [])) {
        const { data: m } = await sb.from('tree_measurements')
          .select('*').eq('tree_id', t.id).order('measurement_date');
        if (m && m.length >= 2 && m[0].photo_url && m[m.length - 1].photo_url) {
          chosen = t; firstM = m[0]; lastM = m[m.length - 1]; break;
        }
      }
      if (!chosen) {
        showToast('No hay árboles con suficientes fotos para comparar', 'warning');
        if (preview) preview.style.display = 'none';
        return;
      }
      canvas = await window.SocialPoster.generateBeforeAfter(chosen, firstM, lastM);
      caption = window.SocialPoster.suggestedCaption('before-after', chosen);
      filename = `evolucion-${chosen.tree_code || chosen.id}.png`;
    }

    else if (type === 'co2-impact') {
      const { data: trees } = await sb.from('trees_catalog').select('*');
      const total = window.CO2Calculator?.totalCO2Stored(trees || []) || 0;
      canvas = window.SocialPoster.generateCO2Impact(total, (trees || []).length);
      caption = window.SocialPoster.suggestedCaption('co2-impact', { co2: Math.round(total) });
      filename = 'impacto-co2-campus.png';
    }

    if (!canvas || !preview) return;

    // Insertar preview
    preview.innerHTML = `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start;margin-top:1rem;">
        <div id="post-canvas-holder" style="flex:0 0 280px;"></div>
        <div style="flex:1;min-width:240px;">
          <h5 style="margin:0 0 0.5rem;color:#1b5e20;">Caption sugerido:</h5>
          <textarea id="post-caption" style="width:100%;height:140px;padding:0.6rem;border:1px solid #ddd;border-radius:8px;font-size:0.82rem;font-family:inherit;resize:vertical;">${caption}</textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" id="post-btn-share">📤 Compartir</button>
            <button class="btn btn-outline btn-sm" id="post-btn-download">⬇ Descargar imagen</button>
            <button class="btn btn-outline btn-sm" id="post-btn-copy">📋 Copiar caption</button>
          </div>
          <p class="text-muted text-small" style="margin-top:0.6rem;">Descarga la imagen, copia el caption y súbelo a Instagram/Facebook manualmente.</p>
        </div>
      </div>
    `;
    canvas.style.maxWidth = '280px';
    canvas.style.width = '100%';
    canvas.style.borderRadius = '12px';
    canvas.style.border = '1px solid #ddd';
    document.getElementById('post-canvas-holder').appendChild(canvas);

    document.getElementById('post-btn-share').onclick = () => {
      const cap = document.getElementById('post-caption').value;
      window.SocialPoster.canvasToShare(canvas, filename, cap);
    };
    document.getElementById('post-btn-download').onclick = () => {
      window.SocialPoster.canvasToDownload(canvas, filename);
    };
    document.getElementById('post-btn-copy').onclick = async () => {
      const cap = document.getElementById('post-caption').value;
      try {
        await navigator.clipboard.writeText(cap);
        showToast('Caption copiado al portapapeles', 'success');
      } catch (_) {
        showToast('No se pudo copiar — selecciona y copia manualmente', 'warning');
      }
    };
  } catch (e) {
    console.error('generateAndDownloadPost error:', e);
    if (preview) preview.innerHTML = `<div style="color:#c00;padding:1rem;">Error: ${e.message || e}</div>`;
  }
}
window.generateAndDownloadPost = generateAndDownloadPost;
window.suggestTreeGoalsWithAI = suggestTreeGoalsWithAI;
window.getCurrentSeason = getCurrentSeason;
window.deleteAdminTree = deleteAdminTree;
window.loadAdminGardens = loadAdminGardens;
window.saveAdminGarden = saveAdminGarden;
window.editAdminGarden = editAdminGarden;
window.deleteAdminGarden = deleteAdminGarden;
window.loadAdminGroups = loadAdminGroups;
window.saveAdminGroup = saveAdminGroup;
window.deleteAdminGroup = deleteAdminGroup;
window.manageGroupMembers = manageGroupMembers;
window.addGroupMember = addGroupMember;
window.removeGroupMember = removeGroupMember;
window.loadAdminNotifications = loadAdminNotifications;
// window.sendNotification eliminada — la UI ya no la usa.
window.loadAssignments = loadAssignments;
window.doAssignTreeFromTab = doAssignTreeFromTab;
window.doAssignGardenFromTab = doAssignGardenFromTab;
window.removeTreeAssignment = removeTreeAssignment;
window.removeGardenAssignment = removeGardenAssignment;
window.loadSpecialistTrees = loadSpecialistTrees;
window.showSpecialistTree = showSpecialistTree;
window.toggleSpecialistFields = toggleSpecialistFields;
window.populateGardenDropdown = populateGardenDropdown;
window.populateSpecialistDropdown = populateSpecialistDropdown;

// =============================================================
// INNOVACIÓN #1 — QR físico por árbol
// =============================================================
function showTreeQR(treeId, treeCode, commonName) {
  // Un solo QR por árbol. Al escanearlo, el usuario ve una pantalla de
  // bienvenida con dos opciones: iniciar sesión o reportar como ciudadano.
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  const targetUrl = `${baseUrl}?tree=${encodeURIComponent(treeCode)}`;

  showModal(`QR — ${treeCode}`, `
    <div style="text-align:center;">
      <p class="text-muted text-small">Imprime y pega esta placa en el árbol. Al escanear, el usuario verá un menú con dos opciones: iniciar sesión (cuidador) o reportar problema (ciudadano sin cuenta).</p>
      <div style="margin:1.5rem auto;max-width:240px;">
        <div id="qr-canvas-tree" style="background:white;padding:1.25rem;border:1px solid #ddd;border-radius:12px;display:inline-block;"></div>
      </div>
      <div style="background:rgba(74,124,42,0.08);padding:0.75rem 1rem;border-radius:8px;font-size:0.8rem;border-left:3px solid var(--primary);">
        <strong>${escapeHtml(commonName || treeCode)}</strong><br>
        <span class="text-muted">Código: <code>${escapeHtml(treeCode)}</code></span>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1.25rem;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="printTreeQR('${safeJsAttr(treeCode)}','${safeJsAttr(commonName || '')}')">
          <i class="fas fa-print"></i> Imprimir placa
        </button>
        <button class="btn btn-outline" onclick="downloadQR('qr-canvas-tree','${safeJsAttr(treeCode)}')">
          <i class="fas fa-download"></i> Descargar PNG
        </button>
      </div>
    </div>
  `);

  setTimeout(() => {
    if (typeof QRCode === 'undefined') {
      document.getElementById('qr-canvas-tree').innerHTML = '<p class="text-muted">QRCode lib no cargada</p>';
      return;
    }
    new QRCode(document.getElementById('qr-canvas-tree'), {
      text: targetUrl, width: 200, height: 200,
      colorDark: '#1b3a0a', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M
    });
  }, 100);
}

function downloadQR(containerId, treeCode) {
  const img = document.querySelector(`#${containerId} img, #${containerId} canvas`);
  if (!img) { showToast('QR no encontrado', 'error'); return; }
  const dataUrl = img.tagName === 'CANVAS' ? img.toDataURL('image/png') : img.src;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `arbol-${treeCode}-qr.png`;
  a.click();
}

function printTreeQR(treeCode, commonName) {
  const img = document.querySelector('#qr-canvas-tree img, #qr-canvas-tree canvas');
  if (!img) { showToast('QR aún generándose, intenta de nuevo', 'warning'); return; }
  const data = img.tagName === 'CANVAS' ? img.toDataURL() : img.src;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Placa ${treeCode}</title>
    <style>
      body{font-family:Inter,sans-serif;padding:20mm;margin:0;}
      .placa{border:3px solid #2d5016;padding:14mm 10mm;text-align:center;border-radius:8mm;max-width:100mm;margin:0 auto;}
      .placa h1{color:#2d5016;margin:0;font-size:14pt;}
      .placa .code{font-family:'Courier New',monospace;font-size:18pt;background:#e8f5e9;padding:2mm 4mm;border-radius:2mm;display:inline-block;margin:3mm 0;}
      .qr{margin:6mm 0;}
      .qr img{width:50mm;height:50mm;}
      .instr{font-size:8pt;color:#555;margin-top:2mm;line-height:1.4;}
      .footer{margin-top:6mm;font-size:8pt;color:#888;}
    </style></head><body>
    <div class="placa">
      <h1>🌳 Proyecto Árbol UNAM 475</h1>
      <div style="margin-top:4mm;font-size:11pt;">${escapeHtml(commonName || '')}</div>
      <div class="code">${escapeHtml(treeCode)}</div>
      <div class="qr"><img src="${data}"></div>
      <div class="instr">Escanea con la cámara<br>de tu celular para ver el<br>árbol o reportar un problema</div>
      <div class="footer">FES Iztacala · UNAM</div>
    </div>
    <script>setTimeout(()=>{window.print();},500)</script>
  </body></html>`);
  w.document.close();
}

// =============================================================
// INNOVACIÓN #8 — Reportes PDF / Excel
// =============================================================
async function exportTreesToExcel() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS no cargada', 'error'); return; }
  showToast('Generando Excel...', 'info');
  try {
    const { data: trees } = await sb.from('trees_catalog').select('*').order('tree_code');
    const { data: meas } = await sb.from('tree_measurements')
      .select('tree_id, measurement_date, height_cm, trunk_diameter_cm, crown_diameter_cm, health_score')
      .order('measurement_date', { ascending: false });
    const { data: assigns } = await sb.from('tree_assignments').select('tree_id, user_id');
    const { data: profiles } = await sb.from('user_profiles').select('id, full_name');
    const profilesMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));

    const treeRows = (trees || []).map(t => ({
      Código: t.tree_code,
      Especie: t.species,
      'Nombre común': t.common_name,
      Tipo: t.tree_type,
      Tamaño: t.size,
      Campus: t.campus,
      Estado: t.status,
      'Salud (%)': t.health_score,
      Latitud: t.location_lat,
      Longitud: t.location_lng,
      'Fecha plantación': t.planting_date,
      'Asignado a': (assigns || []).filter(a => a.tree_id === t.id).map(a => profilesMap[a.user_id] || '?').join(', '),
    }));
    const measRows = (meas || []).map(m => ({
      'Tree ID': m.tree_id,
      Fecha: m.measurement_date,
      'Altura (cm)': m.height_cm,
      'Tronco (cm)': m.trunk_diameter_cm,
      'Copa (cm)': m.crown_diameter_cm,
      'Salud (%)': m.health_score,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(treeRows), 'Árboles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(measRows), 'Mediciones');
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `arbol-unam-${stamp}.xlsx`);
    showToast('Excel descargado', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function exportDashboardToPDF() {
  if (!window.jspdf) { showToast('jsPDF no cargada', 'error'); return; }
  const { jsPDF } = window.jspdf;
  showToast('Generando PDF...', 'info');
  try {
    const { count: userCount } = await sb.from('user_profiles').select('*', { count: 'exact', head: true });
    const { count: treeCount } = await sb.from('trees_catalog').select('*', { count: 'exact', head: true });
    const { data: trees } = await sb.from('trees_catalog').select('*');
    const avgHealth = trees && trees.length ? Math.round(trees.reduce((s,t)=>s+(t.health_score||0),0) / trees.length) : 0;

    const doc = new jsPDF();
    doc.setFillColor(45, 106, 79);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.text('Proyecto Árbol UNAM 475', 14, 14);
    doc.setFontSize(10); doc.text('Reporte Ejecutivo — ' + new Date().toLocaleDateString('es-MX'), 14, 22);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14); doc.text('Resumen', 14, 45);
    doc.setFontSize(10);
    doc.text(`Total de usuarios: ${userCount || 0}`, 14, 55);
    doc.text(`Total de árboles: ${treeCount || 0}`, 14, 62);
    doc.text(`Salud promedio: ${avgHealth}%`, 14, 69);

    if (doc.autoTable && trees) {
      const rows = trees.slice(0, 80).map(t => [
        t.tree_code, t.common_name || t.species, t.campus || '-', t.status, t.health_score + '%',
      ]);
      doc.autoTable({
        startY: 78,
        head: [['Código','Nombre','Campus','Estado','Salud']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [45, 106, 79] },
        styles: { fontSize: 9 },
      });
    }
    doc.save(`reporte-arbol-unam-${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('PDF descargado', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// =============================================================
// INNOVACIÓN #18 — Vista de Audit Log (admin)
// =============================================================
let _auditCache = [];
// ============================================================================
// LOGS DE APLICACIÓN (tabla app_logs)
// ============================================================================
let _appLogsCache = [];

// ─── Traductor de acciones snake_case/camelCase → texto natural ES ───
const _APP_LOG_ACTION_LABELS = {
  // Errores genéricos del browser
  'window.onerror':            'Error JS no manejado en el navegador',
  'unhandledrejection':        'Promesa rechazada sin .catch()',
  'unknown':                   'Acción desconocida',

  // ===== USUARIOS =====
  'saveAdminUser':             'Crear usuario desde admin',
  'updateAdminUser':           'Editar usuario desde admin',
  'editAdminUser':             'Abrir edición de usuario',
  'deleteAdminUser':           'Borrar usuario desde admin',
  'loadAdminUsers':            'Cargar lista de usuarios',
  'reset_password':            'Restablecer contraseña',
  'change_password':           'Cambiar contraseña propia',
  'profile_save':              'Guardar perfil personal',
  'saveProfile':               'Guardar perfil personal',
  'admin_change_user_email':   'Cambiar email de usuario',

  // ===== ÁRBOLES =====
  'saveAdminTree':             'Crear árbol desde admin',
  'editAdminTree':             'Editar árbol desde admin',
  'editAdminTreeLocation':     'Editar ubicación GPS del árbol',
  'deleteAdminTree':           'Borrar árbol desde admin',
  'loadAdminTrees':            'Cargar lista de árboles',
  'loadMyTree':                'Cargar mi árbol asignado',
  'loadMyPortfolio':           'Cargar mi portafolio (árboles + jardines)',
  'updateTreeGoals':           'Guardar metas del árbol',
  'suggest_tree_goals':        'Sugerir metas con PUM-AI',
  'bulk_import_trees':         'Importar árboles en masa (CSV)',

  // ===== SEGUIMIENTOS / MEDICIONES =====
  'saveMeasurement':           'Guardar seguimiento de árbol',
  'saveMeasurement.uploadPhoto': 'Subir foto del seguimiento',
  'deleteMeasurement':         'Borrar seguimiento',
  'loadMeasurements':          'Cargar historial de seguimientos',
  'showMeasurementDetail':     'Ver detalle de seguimiento',

  // ===== JARDINES =====
  'saveAdminGarden':           'Crear jardín desde admin',
  'editAdminGarden':           'Editar jardín desde admin',
  'deleteAdminGarden':         'Borrar jardín',
  'loadAdminGardens':          'Cargar lista de jardines',
  'saveGardenVisit':           'Registrar visita al jardín',
  'deleteAdminGardenVisit':    'Borrar visita de jardín',
  'analyzeGardenPhotoWithAI':  'Analizar foto del jardín con PUM-AI',
  'updateGardenGoals':         'Guardar metas del jardín',

  // ===== FOTOS / STORAGE =====
  'uploadPhotoWithThumb':      'Subir foto con miniatura',
  'uploadPhotoWithThumb.thumb':'Subir miniatura (no crítico)',
  'createSignedUrl':           'Generar URL temporal de foto',
  'photo_delete':              'Borrar foto del storage',

  // ===== PUM-AI =====
  'analyzePhotoWithAI':        'Analizar foto con PUM-AI (rúbricas de salud)',
  'sendPumaiMessage':          'Enviar mensaje al chat PUM-AI',
  'pum-ai':                    'Edge function PUM-AI (Gemini)',
  'pumai_image_compress':      'Comprimir imagen para PUM-AI',
  'generateBitacora':          'Generar bitácora con PUM-AI',

  // ===== GRUPOS / ASIGNACIONES =====
  'saveAdminGroup':            'Crear grupo desde admin',
  'editAdminGroup':            'Editar grupo',
  'deleteAdminGroup':          'Borrar grupo',
  'manageGroupMembers':        'Gestionar miembros de grupo',
  'addTreeAssignment':         'Asignar árbol a usuario o grupo',
  'removeTreeAssignment':      'Quitar asignación de árbol',
  'addGardenAssignment':       'Asignar jardín a usuario o grupo',
  'removeGardenAssignment':    'Quitar asignación de jardín',
  'addResponsableStudent':     'Asignar estudiante a responsable',

  // ===== AUTH =====
  'login':                     'Iniciar sesión',
  'secure-login':              'Iniciar sesión (con rate-limit)',
  'logout':                    'Cerrar sesión',
  'session_refresh':           'Renovar sesión / token',
  'get-user-email':            'Obtener email del usuario (admin)',

  // ===== EDGE FUNCTIONS =====
  'create-user':               'Edge: crear usuario',
  'update-user':               'Edge: editar usuario',
  'delete-user':               'Edge: borrar usuario',
  'send-telegram-notification':'Edge: enviar notificación Telegram',
  'submit-public-report':      'Edge: reporte ciudadano público',
  'weather-sync':              'Edge: sincronización del clima',
  'backup-export':             'Edge: exportar backup',
  'check-quotas':              'Edge: verificar cuotas',
  'log-error':                 'Edge: registrar error (este sistema)',

  // ===== ADMIN — varios =====
  'loadAuditLog':              'Cargar registro de auditoría',
  'loadAppLogs':               'Cargar logs (este tab)',
  'markAppLogResolved':        'Marcar log como resuelto',
  'loadKpis':                  'Cargar KPIs',
  'loadSecurityDashboard':     'Cargar dashboard de seguridad',
  'loadQuotasDashboard':       'Cargar dashboard de cuotas',
  'loadCitizenReports':        'Cargar reportes ciudadanos',
  'loadAssignments':           'Cargar asignaciones',
  'loadCoordinacion':          'Cargar coordinación responsable-estudiantes',
  'loadAdminNotifications':    'Cargar notificaciones admin',
  'sendNotification':          'Enviar notificación a usuario o grupo',
  'unblockIp':                 'Desbloquear IP',
  'blockIp':                   'Bloquear IP manualmente',
  'updateQuota':               'Actualizar cuota de servicio',

  // ===== VISUALIZACIONES =====
  'loadBosqueUNAM':            'Cargar Bosque UNAM 3D',
  'loadIztacalaMap':           'Cargar mapa 3D FES Iztacala',
  'loadWalkthrough':           'Cargar walkthrough 1ª persona',
  'maybeShowUserIztacala3D':   'Inicializar mapa 3D del usuario VIP',
  'iztacala_juanficus_enhance':'Cargar paloma + halo de Juan Ficus',
  'loadCampusMap':             'Cargar mapa 3D del campus',

  // ===== iOS específicos =====
  'PumAIService.send':         'iOS: enviar a PUM-AI',
  'TreeService.createMeasurement':'iOS: guardar seguimiento',
  'TreeService.uploadMeasurementPhoto':'iOS: subir foto del seguimiento',
  'GardenService.createVisit': 'iOS: guardar visita de jardín',
  'GardenService.uploadVisitPhoto':'iOS: subir foto de jardín',
  'AppState.login':            'iOS: iniciar sesión',
  'AppState.logout':           'iOS: cerrar sesión',
  'ARMeasureController':       'iOS: medición AR con LiDAR',
  'GPSCaptureBox.capture':     'iOS: capturar GPS',
};
function _humanizeAction(action) {
  if (!action) return '—';
  if (_APP_LOG_ACTION_LABELS[action]) return _APP_LOG_ACTION_LABELS[action];
  // Fallback: snake_case/dot.path → Title Case con espacios
  return action.replace(/[._]/g, ' ')
               .replace(/([A-Z])/g, ' $1')
               .replace(/\s+/g, ' ').trim()
               .replace(/^./, c => c.toUpperCase());
}

// ─── Traductor masivo de códigos de error → causa probable humana + sugerencia ───
// El orden importa: las reglas se evalúan de arriba abajo y la primera que matchee gana.
// Por eso los códigos específicos van ANTES que los HTTP genéricos.
const _APP_LOG_ERROR_TRANSLATIONS = [

  // ═══ Postgres SQLSTATE codes (los más comunes en este proyecto) ═══
  { match: /^23505$/i, label: 'Duplicado: un código o identificador único ya existe en BD',
    advice: 'Cambia el código (tree_code, email, etc.) o verifica si el registro ya está creado.' },
  { match: /^23503$/i, label: 'Referencia rota: el row vinculado no existe (Foreign Key)',
    advice: 'El usuario/árbol/jardín al que se hace referencia ya fue borrado.' },
  { match: /^23502$/i, label: 'Falta un campo obligatorio (NOT NULL)',
    advice: 'Revisa qué columna del payload viene en blanco — el frontend olvidó enviarla.' },
  { match: /^23514$/i, label: 'Valor fuera del rango permitido (CHECK constraint)',
    advice: 'Suele ser un rol, estatus o tipo que no está en la lista válida del schema.' },
  { match: /^23P01$/i, label: 'Conflicto de exclusión (otro row bloquea esta operación)' },
  { match: /^40001$/i, label: 'Conflicto de serialización (race condition entre transacciones)',
    advice: 'Reintentar suele resolver — el cliente debe reintentar automáticamente.' },
  { match: /^40P01$/i, label: 'Deadlock detectado entre transacciones',
    advice: 'Reintenta la operación; Postgres ya canceló una de las dos.' },
  { match: /^42501$/i, label: 'Permiso denegado por RLS (Row-Level Security)',
    advice: 'El usuario actual no tiene rol/policy para esta operación. Revisa policies en BD.' },
  { match: /^42P01$/i, label: 'Tabla no encontrada en la BD',
    advice: 'Una migración no se aplicó, o el nombre de la tabla está mal escrito.' },
  { match: /^42703$/i, label: 'Columna no encontrada en la tabla',
    advice: 'El frontend envía un campo que ya no existe en el schema actual.' },
  { match: /^42P02$/i, label: 'Parámetro no encontrado (placeholder $N sin valor)' },
  { match: /^42883$/i, label: 'Función SQL no existe o tipo de argumento incorrecto' },
  { match: /^22P02$/i, label: 'Tipo de dato inválido (parse error)',
    advice: 'Un texto donde se esperaba número, UUID malformado, fecha mal formato, etc.' },
  { match: /^22001$/i, label: 'Texto demasiado largo para la columna (VARCHAR limit)' },
  { match: /^22003$/i, label: 'Número fuera del rango permitido del tipo (overflow)' },
  { match: /^22008$/i, label: 'Fecha u hora fuera de rango' },
  { match: /^08\w+$/i, label: 'Error de conexión con la base de datos',
    advice: 'Supabase tuvo un blip; reintentar suele funcionar.' },
  { match: /^53\w+$/i, label: 'BD sin recursos (memoria/disco/conexiones)',
    advice: 'Supabase saturado momentáneamente o se agotó la cuota.' },
  { match: /^53300$/i, label: 'Demasiadas conexiones simultáneas a la BD',
    advice: 'Revisa pgBouncer / connection pool del cliente.' },
  { match: /^57014$/i, label: 'Query cancelado por timeout o user request' },
  { match: /^P0001$/i, label: 'Excepción lanzada por una función SQL personalizada',
    advice: 'Revisa los triggers o funciones plpgsql del schema.' },

  // ═══ PostgREST codes (API REST autogenerada) ═══
  { match: /^PGRST100$/i, label: 'PostgREST: parámetro de URL inválido' },
  { match: /^PGRST101$/i, label: 'PostgREST: método HTTP no soportado para este recurso' },
  { match: /^PGRST102$/i, label: 'PostgREST: error de parseo del body JSON' },
  { match: /^PGRST103$/i, label: 'PostgREST: rango (Range header) inválido' },
  { match: /^PGRST106$/i, label: 'PostgREST: el schema solicitado no está en la search_path' },
  { match: /^PGRST116$/i, label: 'No se encontró ningún row (.single() esperaba 1)',
    advice: 'La query con .single() requiere exactamente 1 resultado; tuvo 0 o múltiples.' },
  { match: /^PGRST200$/i, label: 'PostgREST: foreign key embedding mal especificado' },
  { match: /^PGRST201$/i, label: 'PostgREST: ambigüedad en relación entre tablas' },
  { match: /^PGRST301$/i, label: 'JWT expirado o inválido',
    advice: 'La sesión venció; pide al usuario que cierre y vuelva a iniciar sesión.' },
  { match: /^PGRST302$/i, label: 'JWT no contiene el claim requerido' },
  { match: /^PGRST(.+)$/i, label: 'Error de PostgREST (API REST de Supabase)',
    advice: 'Código PGRST específico desconocido — revisa el mensaje.' },

  // ═══ Supabase Auth (GoTrue) ═══
  { match: /invalid.?login.?credentials|invalid_credentials|Invalid email or password/i,
    label: 'Email o contraseña incorrectos',
    advice: 'El usuario tecleó mal el email o el password.' },
  { match: /email.?not.?confirmed|email_not_confirmed/i, label: 'Email no confirmado',
    advice: 'El usuario debe confirmar su email primero — pero en este proyecto los creamos con email_confirm:true automáticamente.' },
  { match: /user.?already.?registered|already.?been.?registered|email.?already.?in.?use|user_already_exists/i,
    label: 'Ese email ya está registrado',
    advice: 'Buscar el usuario existente y reactivarlo en lugar de crear nuevo.' },
  { match: /weak.?password|password.?too.?short|password_too_short/i,
    label: 'Contraseña demasiado débil',
    advice: 'Debe tener ≥8 caracteres, al menos 1 mayúscula y 1 dígito.' },
  { match: /user.?not.?found|no.?user.?found/i, label: 'Usuario no encontrado en auth.users' },
  { match: /rate.?limit.?exceeded.*auth|over_email_send_rate_limit/i,
    label: 'Demasiados emails enviados (rate limit)',
    advice: 'Supabase Auth limita a 4 emails/hora por defecto. Espera y reintenta.' },
  { match: /Token has expired|Auth session missing|JWT expired/i,
    label: 'Sesión expirada',
    advice: 'El JWT venció. Llama a refresh o pide reloguear.' },
  { match: /SignupNotAllowedException|signups.?disabled/i,
    label: 'Auto-registro deshabilitado',
    advice: 'El sistema requiere crear usuarios vía edge create-user.' },
  { match: /Email rate limit/i, label: 'Rate limit de email alcanzado' },

  // ═══ Edge Functions diagCodes (los nuestros) ═══
  { match: /^NO_AUTH$/i, label: 'Usuario no autenticado (sin sesión válida)',
    advice: 'El header Authorization llegó vacío o el token está mal formado.' },
  { match: /^NO_PROFILE$/i, label: 'El usuario no tiene perfil en user_profiles',
    advice: 'Probable usuario huérfano — existe en auth.users pero falta su row en user_profiles.' },
  { match: /^NOT_ALLOWED_ROLE$/i, label: 'Tu rol no tiene permiso para esta operación' },
  { match: /^WEAK_PASSWORD$/i, label: 'Contraseña no cumple política',
    advice: 'Debe tener ≥8 caracteres, al menos 1 mayúscula y 1 dígito.' },
  { match: /^BAD_EMAIL$/i, label: 'Email con formato inválido' },
  { match: /^BAD_ROLE$/i, label: 'Rol no válido (no está en la lista permitida)' },
  { match: /^BAD_JSON$/i, label: 'El body de la request no es JSON válido' },
  { match: /^MISSING_FIELDS$/i, label: 'Faltan campos obligatorios en el body' },
  { match: /^AC_NO_ADMIN$/i, label: 'admin-campus intentó crear admin principal',
    advice: 'Solo el admin principal puede crear otros admins.' },
  { match: /^RESP_ONLY_USER$/i, label: 'Responsable solo puede crear usuarios con rol user' },
  { match: /^RECTORIA_ADMIN_ONLY$/i, label: 'Solo el admin principal puede asignar rectoría' },
  { match: /^AUTH_CREATE_FAIL$/i, label: 'Auth rechazó crear el usuario',
    advice: 'Email duplicado o password rechazado por Supabase Auth — revisa el mensaje técnico.' },
  { match: /^PROFILE_UPSERT_FAIL$/i, label: 'No se pudo guardar el perfil',
    advice: 'auth.user se creó pero user_profiles falló — revisa CHECK constraints o RLS.' },
  { match: /^UNCAUGHT$/i, label: 'Excepción no atrapada en el edge function',
    advice: 'Bug en código — revisa stack trace.' },

  // ═══ PUM-AI / Gemini ═══
  { match: /GEMINI.*not configured|GEMINI_API_KEY/i, label: 'GEMINI_API_KEY no configurada',
    advice: 'Revisa los secrets del proyecto en Supabase.' },
  { match: /Demasiadas solicitudes.*intentar|Rate limit.*PUM/i,
    label: 'Rate limit de PUM-AI (10/min por usuario)',
    advice: 'Espera 1 minuto antes de reintentar.' },
  { match: /Imagen demasiado grande|image.*too.*large/i, label: 'Imagen demasiado grande para PUM-AI',
    advice: 'Comprimir a <2MB en base64 o <800px de lado.' },
  { match: /Tipo de imagen no soportado/i, label: 'Tipo de imagen no soportado por Gemini',
    advice: 'Solo acepta jpeg, png, webp, gif.' },
  { match: /Mensaje demasiado largo/i, label: 'Mensaje a PUM-AI excede 4000 caracteres' },
  { match: /Token inválido o sesión expirada/i, label: 'Token expirado al llamar a PUM-AI',
    advice: 'Pide reloguear.' },
  { match: /Error al procesar tu consulta.*Gemini|Gemini API/i, label: 'Gemini API devolvió error',
    advice: 'Quizás cuota de Google agotada, o el modelo cambió de versión.' },
  { match: /Servicio no disponible/i, label: 'Servicio PUM-AI fuera de línea momentáneamente' },

  // ═══ Storage ═══
  { match: /already exists|duplicate.*object|Duplicate/i, label: 'El archivo ya existe en Storage',
    advice: 'Usar upsert:true al subir o cambiar el nombre del archivo.' },
  { match: /Bucket not found|bucket.*does not exist/i, label: 'Bucket de Storage no existe',
    advice: 'Revisa que el bucket esté creado en Supabase Storage.' },
  { match: /Payload too large|file.*too.*large|exceeds.*size/i,
    label: 'Archivo demasiado grande para el bucket',
    advice: 'Comprimir antes de subir o aumentar el límite del bucket.' },
  { match: /Invalid mime type|unsupported file type/i, label: 'Tipo de archivo no soportado por el bucket' },
  { match: /signature.*invalid|signed url.*expired/i, label: 'URL firmada expirada o inválida',
    advice: 'Regenera la signed URL — duran 1 hora por default.' },

  // ═══ Red / Conectividad ═══
  { match: /Failed to fetch|TypeError.*fetch|net::ERR_/i, label: 'Sin conexión a internet o servidor inalcanzable',
    advice: 'El usuario perdió conexión durante la operación. Reintenta cuando vuelva.' },
  { match: /NetworkError|Network request failed/i, label: 'Error de red genérico',
    advice: 'Conexión inestable; reintentar suele funcionar.' },
  { match: /CORS|Cross-Origin|cross origin/i, label: 'Bloqueo por CORS',
    advice: 'El servidor no devolvió header Access-Control-Allow-Origin para este origin.' },
  { match: /timeout|timed? out|ETIMEDOUT/i, label: 'La operación tardó demasiado y se canceló',
    advice: 'Conexión lenta o servidor saturado.' },
  { match: /aborted|AbortError/i, label: 'Operación cancelada por el usuario o por timeout' },
  { match: /SSL|TLS|cert.*expired|cert.*invalid/i, label: 'Error de certificado SSL/TLS' },
  { match: /DNS|getaddrinfo|ENOTFOUND/i, label: 'No se pudo resolver el nombre del servidor (DNS)' },

  // ═══ Permisos del browser / iOS ═══
  { match: /Permission denied.*camera|NotAllowedError.*camera/i,
    label: 'Permiso de cámara denegado',
    advice: 'Pide al usuario habilitar cámara en Ajustes del browser/iOS.' },
  { match: /Permission denied.*location|geolocation.*denied/i,
    label: 'Permiso de ubicación denegado',
    advice: 'GPS bloqueado; revisar permisos del browser/iOS.' },
  { match: /Permission denied.*camera|NotAllowedError.*microphone/i,
    label: 'Permiso de micrófono denegado' },
  { match: /NotFoundError.*camera|no camera available/i, label: 'No hay cámara disponible en el dispositivo' },
  { match: /QuotaExceededError|exceeded.*quota/i, label: 'Storage local del browser lleno',
    advice: 'localStorage/IndexedDB lleno; limpiar caché.' },

  // ═══ ARKit / iOS específicos ═══
  { match: /ARKit.*not supported|tracking unavailable/i, label: 'Dispositivo iOS no soporta ARKit',
    advice: 'Se necesita procesador A12 o superior.' },
  { match: /LiDAR.*not available/i, label: 'Dispositivo iOS no tiene LiDAR (cae a AR World)' },

  // ═══ HTTP status codes (genéricos — al final para no opacar los específicos) ═══
  { match: /\b400\b/, label: 'Petición mal formada (Bad Request)',
    advice: 'Revisa el body que envió el cliente.' },
  { match: /\b401\b/, label: 'Sesión expirada o token inválido',
    advice: 'Pide al usuario que cierre y vuelva a iniciar sesión.' },
  { match: /\b403\b/, label: 'Acceso denegado por permisos',
    advice: 'El rol del usuario no permite esta acción, o la RLS la bloquea.' },
  { match: /\b404\b/, label: 'Recurso no encontrado' },
  { match: /\b405\b/, label: 'Método HTTP no permitido para este endpoint' },
  { match: /\b406\b/, label: 'Content-Type negociado no es aceptable' },
  { match: /\b409\b/, label: 'Conflicto (duplicado o estado inconsistente)' },
  { match: /\b410\b/, label: 'Recurso eliminado permanentemente (Gone)' },
  { match: /\b413\b/, label: 'Archivo o request demasiado grande' },
  { match: /\b422\b/, label: 'Datos no procesables (validación falló)' },
  { match: /\b429\b/, label: 'Muchas peticiones — rate limit excedido',
    advice: 'El usuario o IP está siendo limitado; esperar y reintentar.' },
  { match: /\b500\b/, label: 'Error interno del servidor (revisar logs)' },
  { match: /\b502\b/, label: 'Bad Gateway (upstream caído)' },
  { match: /\b503\b/, label: 'Servicio no disponible momentáneamente' },
  { match: /\b504\b/, label: 'Gateway timeout (upstream tardó demasiado)' },
  { match: /\b5\d\d\b/, label: 'Error del servidor (5xx)',
    advice: 'Revisa logs del backend para ver qué pasó.' },
];

function _translateError(errCode, errMsg, httpStatus) {
  const haystack = `${errCode || ''} ${errMsg || ''} ${httpStatus || ''}`;
  for (const t of _APP_LOG_ERROR_TRANSLATIONS) {
    if (t.match.test(errCode || '') || t.match.test(errMsg || '') || t.match.test(String(httpStatus || ''))) {
      return { label: t.label, advice: t.advice || null };
    }
  }
  return null;
}

async function loadAppLogs() {
  const container = document.getElementById('logs-container');
  if (!container) return;
  container.innerHTML = '<p class="text-muted">Cargando…</p>';
  try {
    const sev   = document.getElementById('logs-filter-severity')?.value || '';
    const src   = document.getElementById('logs-filter-source')?.value || '';
    const res   = document.getElementById('logs-filter-resolved')?.value || 'open';
    const q     = (document.getElementById('logs-filter-search')?.value || '').trim().toLowerCase();

    let query = sb.from('app_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (sev) query = query.eq('severity', sev);
    if (src) query = query.eq('source', src);
    if (res === 'open') query = query.eq('resolved', false);
    else if (res === 'resolved') query = query.eq('resolved', true);

    const { data, error } = await query;
    if (error) throw error;
    _appLogsCache = data || [];

    // Filtro client-side por texto (action o error_message)
    const rows = q
      ? _appLogsCache.filter(r =>
          (r.action || '').toLowerCase().includes(q) ||
          (r.error_message || '').toLowerCase().includes(q) ||
          (r.error_code || '').toLowerCase().includes(q))
      : _appLogsCache;

    if (rows.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding:2rem;">Sin logs que coincidan con los filtros.</p>';
      return;
    }

    // Stats compactas
    const totals = { critical:0, error:0, warning:0, info:0 };
    rows.forEach(r => { if (totals[r.severity] !== undefined) totals[r.severity]++; });

    const stats = `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem;font-size:0.78rem;">
        <span style="background:#7a1f1f;color:white;padding:4px 10px;border-radius:8px;">🚨 Crítico: <b>${totals.critical}</b></span>
        <span style="background:#b54f3a;color:white;padding:4px 10px;border-radius:8px;">❌ Error: <b>${totals.error}</b></span>
        <span style="background:#d4a047;color:#222;padding:4px 10px;border-radius:8px;">⚠️ Warning: <b>${totals.warning}</b></span>
        <span style="background:#5b8b7d;color:white;padding:4px 10px;border-radius:8px;">ℹ️ Info: <b>${totals.info}</b></span>
        <span style="background:#eee;color:#555;padding:4px 10px;border-radius:8px;">Total mostrados: <b>${rows.length}</b></span>
      </div>`;

    // Tabla responsive con traductor de acciones y causas probables.
    let html = stats + `
      <table class="admin-table" data-sort-table="logs">
        <thead><tr>
          <th>Cuándo</th>
          <th>Severidad</th>
          <th>Usuario · Campus</th>
          <th>Qué intentó hacer</th>
          <th>Causa probable</th>
          <th>Mensaje técnico</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>`;
    rows.forEach(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'medium' }) : '—';
      const sevBadge = _appLogSeverityBadge(r.severity);
      const srcMini = _appLogSourceBadge(r.source);

      // Usuario: nombre completo grande + email + rol/campus pequeños
      const fullName = r.user_full_name || (r.user_email ? r.user_email.split('@')[0] : null);
      const campusLabel = r.user_campus
        ? (typeof CAMPUS_LABELS !== 'undefined' && CAMPUS_LABELS[r.user_campus]) || ('FES ' + r.user_campus)
        : '';
      const userBlock = fullName
        ? `<div style="line-height:1.2;">
             <div style="font-weight:600;">${escapeHtml(fullName)}</div>
             <div style="font-size:0.72rem;color:#888;">${escapeHtml(r.user_email||'—')}</div>
             <div style="font-size:0.72rem;color:#555;">
               <span style="background:rgba(46,81,23,0.10);padding:1px 6px;border-radius:6px;">${escapeHtml(r.user_role||'sin rol')}</span>
               ${campusLabel ? ' · ' + escapeHtml(campusLabel) : ''}
             </div>
           </div>`
        : '<span style="color:#999;font-style:italic;">(anónimo / sin sesión)</span>';

      // Acción humanizada
      const actionHuman = _humanizeAction(r.action);
      const actionBlock = `
        <div style="line-height:1.25;">
          <div style="font-weight:500;">${escapeHtml(actionHuman)}</div>
          <div style="font-size:0.7rem;color:#999;font-family:monospace;">${escapeHtml(r.action||'—')}</div>
          <div style="margin-top:2px;">${srcMini}</div>
        </div>`;

      // Causa probable (traducción de error)
      const translation = _translateError(r.error_code, r.error_message, r.http_status);
      const causeBlock = translation
        ? `<div style="line-height:1.3;">
             <div style="font-weight:500;color:var(--danger);">${escapeHtml(translation.label)}</div>
             ${translation.advice ? `<div style="font-size:0.72rem;color:#666;margin-top:2px;">💡 ${escapeHtml(translation.advice)}</div>` : ''}
           </div>`
        : '<span style="color:#999;font-size:0.78rem;">— Sin traducción —</span>';

      // Mensaje técnico
      const errCode = r.error_code ? `<code style="background:#fef3c7;padding:0 4px;border-radius:3px;font-size:0.72rem;">${escapeHtml(r.error_code)}</code> ` : '';
      const httpSt = r.http_status ? `<code style="background:#fee2e2;padding:0 4px;border-radius:3px;font-size:0.72rem;">HTTP ${r.http_status}</code> ` : '';
      const msg = escapeHtml((r.error_message || '').slice(0, 140)) + ((r.error_message||'').length > 140 ? '…' : '');
      const msgBlock = `<div style="font-size:0.78rem;">${errCode}${httpSt}<span style="color:#555;">${msg}</span></div>`;

      html += `
        <tr ${r.resolved ? 'style="opacity:0.55;"' : ''}>
          <td data-label="Cuándo"><span style="font-family:monospace;font-size:0.75rem;color:#555;">${date}</span></td>
          <td data-label="Severidad">${sevBadge}</td>
          <td data-label="Usuario">${userBlock}</td>
          <td data-label="Qué intentó hacer">${actionBlock}</td>
          <td data-label="Causa probable">${causeBlock}</td>
          <td data-label="Mensaje técnico">${msgBlock}</td>
          <td data-label="Acciones" style="white-space:nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="showAppLogDetail('${r.id}')" title="Ver detalle completo">🔍</button>
            ${r.resolved
              ? '<span style="font-size:0.78rem;color:var(--success);">✓</span>'
              : `<button class="btn btn-sm" style="background:#e8f5e9;color:#2e7d32;" onclick="markAppLogResolved('${r.id}')" title="Marcar como resuelto">✓</button>`}
          </td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);padding:1rem;">Error: ${escapeHtml(err.message)}</p>`;
    if (typeof logError === 'function') {
      logError({ action: 'loadAppLogs', error: err });
    }
  }
}

function _appLogSeverityBadge(s) {
  const map = {
    critical: { bg:'#7a1f1f', fg:'white', label:'🚨 Crítico' },
    error:    { bg:'#b54f3a', fg:'white', label:'❌ Error' },
    warning:  { bg:'#d4a047', fg:'#222',  label:'⚠️ Warning' },
    info:     { bg:'#5b8b7d', fg:'white', label:'ℹ️ Info' },
  };
  const c = map[s] || { bg:'#999', fg:'white', label: s||'—' };
  return `<span style="background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:8px;font-size:0.72rem;font-weight:600;">${c.label}</span>`;
}

function _appLogSourceBadge(s) {
  const labels = {
    frontend_web: '🌐 Web',
    frontend_ios: '📱 iOS',
    edge_function: '⚡ Edge',
    database: '💾 DB',
    unknown: '— Desconocido',
  };
  return `<span style="font-size:0.78rem;color:#555;">${labels[s] || s}</span>`;
}

function showAppLogDetail(id) {
  const r = _appLogsCache.find(x => x.id === id);
  if (!r) return;
  const ctx = r.context ? JSON.stringify(r.context, null, 2) : '(vacío)';
  const stack = r.stack_trace || '(sin stack trace)';
  const date = r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '—';
  const translation = _translateError(r.error_code, r.error_message, r.http_status);
  const campusLabel = r.user_campus
    ? (typeof CAMPUS_LABELS !== 'undefined' && CAMPUS_LABELS[r.user_campus]) || ('FES ' + r.user_campus)
    : '—';

  // Resumen humanizado arriba (lo más útil)
  const summary = `
    <div style="background:linear-gradient(135deg,rgba(46,81,23,0.06),rgba(255,253,247,0.6));padding:1rem;border-radius:10px;border-left:4px solid var(--primary);margin-bottom:1rem;">
      <div style="font-size:0.78rem;color:#777;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;">Qué intentó hacer</div>
      <div style="font-size:1.1rem;font-weight:600;color:#222;margin-bottom:0.6rem;">${escapeHtml(_humanizeAction(r.action))}</div>
      ${translation ? `
        <div style="font-size:0.78rem;color:#777;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;">Causa probable</div>
        <div style="font-size:1rem;color:var(--danger);font-weight:500;margin-bottom:0.3rem;">${escapeHtml(translation.label)}</div>
        ${translation.advice ? `<div style="background:rgba(255,193,7,0.10);padding:0.5rem 0.8rem;border-radius:6px;border-left:3px solid #FFA726;font-size:0.88rem;color:#5a4730;">💡 <strong>Sugerencia:</strong> ${escapeHtml(translation.advice)}</div>` : ''}
      ` : ''}
    </div>
  `;

  // Bloque de usuario destacado
  const userBlock = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;margin-bottom:1rem;font-size:0.9rem;">
      <strong>Nombre:</strong>          <span>${escapeHtml(r.user_full_name || '(no disponible — usuario anónimo o nuevo)')}</span>
      <strong>Email:</strong>           <span>${escapeHtml(r.user_email || '—')}</span>
      <strong>Rol:</strong>             <code style="background:rgba(46,81,23,0.10);padding:2px 6px;border-radius:4px;">${escapeHtml(r.user_role || '(sin rol)')}</code>
      <strong>Campus:</strong>          <span>${escapeHtml(campusLabel)}</span>
      <strong>Cuándo:</strong>          <span style="font-family:monospace;">${date}</span>
      <strong>IP:</strong>              <code style="font-size:0.78rem;">${escapeHtml(r.ip_address||'—')}</code>
    </div>
  `;

  // Bloque técnico
  const techBlock = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;margin-bottom:1rem;font-size:0.85rem;">
      <strong>Severidad:</strong>       <span>${_appLogSeverityBadge(r.severity)}</span>
      <strong>Origen:</strong>          <span>${_appLogSourceBadge(r.source)}</span>
      <strong>Acción (código):</strong> <code style="background:#e8f5e9;padding:2px 6px;border-radius:4px;">${escapeHtml(r.action||'—')}</code>
      <strong>Error code:</strong>      <code style="background:#fef3c7;padding:2px 6px;border-radius:4px;">${escapeHtml(r.error_code||'—')}</code>
      <strong>HTTP status:</strong>     <span>${r.http_status||'—'}</span>
      <strong>URL:</strong>             <code style="word-break:break-all;font-size:0.75rem;">${escapeHtml(r.url||'—')}</code>
      <strong>User-Agent:</strong>      <span style="font-size:0.75rem;color:#666;">${escapeHtml((r.user_agent||'').slice(0,160))}</span>
    </div>
  `;

  const html = summary + userBlock + techBlock + `
    <h5 style="margin:0.8rem 0 0.3rem;">Mensaje técnico completo</h5>
    <pre style="background:#fff5f5;padding:0.8rem;border-radius:6px;white-space:pre-wrap;border-left:3px solid var(--danger);font-size:0.85rem;max-height:200px;overflow-y:auto;">${escapeHtml(r.error_message||'')}</pre>
    <h5 style="margin:0.8rem 0 0.3rem;">Stack trace</h5>
    <pre style="background:#1e1e1e;color:#dcdcdc;padding:0.8rem;border-radius:6px;overflow:auto;font-size:0.72rem;max-height:240px;">${escapeHtml(stack)}</pre>
    <h5 style="margin:0.8rem 0 0.3rem;">Context (JSON)</h5>
    <pre style="background:#f7f3e8;padding:0.8rem;border-radius:6px;overflow:auto;font-size:0.78rem;max-height:240px;">${escapeHtml(ctx)}</pre>
    ${r.resolved
      ? `<p style="color:var(--success);margin-top:1rem;">✓ Marcado como resuelto ${r.resolved_at ? 'el ' + new Date(r.resolved_at).toLocaleString('es-MX') : ''} por ${escapeHtml((r.resolved_by||'').slice(0,8))}.</p>`
      : `<button class="btn btn-primary" onclick="markAppLogResolved('${r.id}', true)" style="margin-top:1rem;">✓ Marcar como resuelto</button>`}
  `;
  showModal('Detalle del log', html);
}

async function markAppLogResolved(id, closeModalAfter) {
  try {
    const { error } = await sb.from('app_logs')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: currentUser?.id })
      .eq('id', id);
    if (error) throw error;
    showToast('Log marcado como resuelto', 'success');
    if (closeModalAfter && typeof closeModal === 'function') closeModal();
    loadAppLogs();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (typeof logError === 'function') logError({ action: 'markAppLogResolved', error: err, context: { logId: id } });
  }
}

window.loadAppLogs = loadAppLogs;
window.showAppLogDetail = showAppLogDetail;
window.markAppLogResolved = markAppLogResolved;

// Cache: actor_email → { full_name, campus, role }
// Se llena en loadAuditLog() y lo usa _renderAudit para mostrar contexto del usuario.
let _auditActorMeta = {};

async function loadAuditLog() {
  const container = document.getElementById('audit-log-container');
  if (!container) return;
  try {
    const { data, error } = await sb.from('audit_log')
      .select('*').order('occurred_at', { ascending: false }).limit(1000);
    if (error) throw error;
    _auditCache = data || [];

    // Hidratar metadata (campus + full_name) de los actores únicos.
    // Las acciones automáticas ('system', 'mcp-*', 'cron-*') no tienen perfil.
    const uniqueActors = [...new Set(
      _auditCache.map(e => e.actor_email).filter(e => e && !_isSystemActor(e))
    )];
    if (uniqueActors.length > 0) {
      try {
        // Resolver IDs por email vía auth.users es servidor-only; mejor por actor_id
        // (que el trigger sí llena cuando hay JWT). Hago dos joins:
        const ids = [...new Set(_auditCache.map(e => e.actor_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: profs } = await sb.from('user_profiles')
            .select('id, full_name, campus, role').in('id', ids);
          (profs || []).forEach(p => {
            // Mapeo doble: por id Y por email (resuelto vía audit_log)
            const evtsForUser = _auditCache.filter(e => e.actor_id === p.id);
            evtsForUser.forEach(e => {
              if (e.actor_email) _auditActorMeta[e.actor_email] = p;
            });
          });
        }
      } catch (e) { console.warn('audit metadata fetch failed:', e?.message); }
    }

    // Stats: agrupar por acción / tabla / actor (top 5)
    const byAction = {}, byTable = {}, byActor = {};
    _auditCache.forEach(e => {
      byAction[e.action] = (byAction[e.action] || 0) + 1;
      byTable[e.table_name] = (byTable[e.table_name] || 0) + 1;
      byActor[e.actor_email || '—'] = (byActor[e.actor_email || '—'] || 0) + 1;
    });
    const topTables = Object.entries(byTable).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topActors = Object.entries(byActor).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const last24h = _auditCache.filter(e => Date.now() - new Date(e.occurred_at) < 86400000).length;
    const last7d = _auditCache.filter(e => Date.now() - new Date(e.occurred_at) < 7*86400000).length;

    container.innerHTML = `
      <!-- KPI cards arriba -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="background:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid #5b8b7d;min-width:120px;flex:1;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Total acciones</div>
          <div style="font-size:22px;font-weight:700;color:#333;">${_auditCache.length}</div>
          <div style="font-size:11px;color:#777;">${last24h} en 24h · ${last7d} en 7d</div>
        </div>
        <div style="background:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid #4CAF50;min-width:90px;flex:1;">
          <div style="font-size:11px;color:#888;">INSERT</div>
          <div style="font-size:22px;font-weight:700;color:#4CAF50;">${byAction.insert || 0}</div>
        </div>
        <div style="background:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid #FFC107;min-width:90px;flex:1;">
          <div style="font-size:11px;color:#888;">UPDATE</div>
          <div style="font-size:22px;font-weight:700;color:#d4a574;">${byAction.update || 0}</div>
        </div>
        <div style="background:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:4px solid #f44336;min-width:90px;flex:1;">
          <div style="font-size:11px;color:#888;">DELETE</div>
          <div style="font-size:22px;font-weight:700;color:#b54f3a;">${byAction.delete || 0}</div>
        </div>
      </div>

      <!-- Top tablas + actores -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-bottom:14px;">
        <div style="background:#fff;padding:12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <div style="font-size:12px;font-weight:600;color:#333;margin-bottom:8px;">🗂 Top tablas modificadas</div>
          ${topTables.map(([t, n]) => {
            const max = topTables[0][1];
            return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:11px;">
              <div style="flex:1;color:#555;">${t}</div>
              <div style="flex:2;background:#f0ede5;border-radius:4px;height:10px;overflow:hidden;">
                <div style="width:${100*n/max}%;background:#5b8b7d;height:100%;"></div>
              </div>
              <div style="width:36px;text-align:right;font-weight:600;">${n}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="background:#fff;padding:12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <div style="font-size:12px;font-weight:600;color:#333;margin-bottom:8px;">👤 Top usuarios activos</div>
          ${topActors.map(([u, n]) => {
            const max = topActors[0][1];
            return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:11px;">
              <div style="flex:1;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(u)}</div>
              <div style="flex:2;background:#f0ede5;border-radius:4px;height:10px;overflow:hidden;">
                <div style="width:${100*n/max}%;background:#8b6f47;height:100%;"></div>
              </div>
              <div style="width:36px;text-align:right;font-weight:600;">${n}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;gap:8px;">
        <div class="text-small text-muted">${_auditCache.length} eventos cargados</div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-sm" style="background:#f0f0f0;color:#444;" onclick="_clearAuditFilters()">Limpiar filtros</button>
          <button type="button" class="btn btn-sm" style="background:#3b7a3a;color:#fff;" onclick="_exportAuditCSV()">📥 Exportar CSV</button>
        </div>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th><div>Fecha</div><input type="text" class="filter-input" data-filter="a-date" placeholder="🔍 fecha" oninput="_filterAudit()" autocomplete="off"></th>
            <th><div>Usuario</div><input type="text" class="filter-input" data-filter="a-user" placeholder="🔍 email" oninput="_filterAudit()" autocomplete="off"></th>
            <th><div>Acción</div><select class="filter-input" data-filter="a-action" onchange="_filterAudit()"><option value="">— Todas —</option><option value="insert">insert</option><option value="update">update</option><option value="delete">delete</option></select></th>
            <th><div>Tabla</div><input type="text" class="filter-input" data-filter="a-table" placeholder="🔍 tabla" oninput="_filterAudit()" autocomplete="off"></th>
            <th><div>Row ID</div><input type="text" class="filter-input" data-filter="a-row" placeholder="🔍 id" oninput="_filterAudit()" autocomplete="off"></th>
            <th><div>Diff</div></th>
          </tr>
        </thead>
        <tbody id="audit-log-tbody"></tbody>
      </table>
    `;
    _renderAudit(_auditCache);
  } catch (err) {
    container.innerHTML = `<p class="text-danger">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// Detecta actores no-humanos (cron, edge function service-role, MCP, etc.)
function _isSystemActor(email) {
  if (!email) return true;
  const e = String(email).toLowerCase();
  return e === 'system' || e.startsWith('mcp-') || e.startsWith('cron-') || e.startsWith('edge-');
}

// Devuelve HTML del actor: ícono + nombre/email + campus.
// Para system: ícono robot + tooltip explicativo.
function _renderAuditActor(e) {
  const email = e.actor_email || '—';
  if (_isSystemActor(email)) {
    let label, tooltip;
    if (email === 'system') {
      label = '🤖 Sistema';
      tooltip = 'Acción automática: trigger, cron, edge function con service-role, o admin SQL directo.';
    } else if (email.startsWith('mcp-')) {
      label = '🛠 ' + email;
      tooltip = 'Admin ejecutó SQL via Supabase MCP (puente Claude ↔ BD). Acción manual de mantenimiento.';
    } else if (email.startsWith('cron-')) {
      label = '⏱ ' + email;
      tooltip = 'Job programado del servidor.';
    } else {
      label = '⚙ ' + email;
      tooltip = 'Acción de servicio (edge function con service-role).';
    }
    return `<span title="${escapeHtml(tooltip)}" style="color:#888;font-style:italic;">${escapeHtml(label)}</span>`;
  }
  const meta = _auditActorMeta[email];
  if (!meta) {
    return `<span>${escapeHtml(email)}</span>`;
  }
  const name = meta.full_name ? escapeHtml(meta.full_name) : escapeHtml(email);
  const campus = meta.campus ? `<span style="font-size:10px;color:#5b8b7d;background:#eaf3ef;border:1px solid #c2dcd3;border-radius:8px;padding:1px 6px;margin-left:4px;">${escapeHtml(meta.campus)}</span>` : '';
  return `<span title="${escapeHtml(email + (meta.role ? ' · ' + meta.role : ''))}">${name}${campus}</span>`;
}

function _renderAudit(rows) {
  const tbody = document.getElementById('audit-log-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  rows.forEach(e => {
    const color = e.action === 'delete' ? '#f44336' : e.action === 'update' ? '#FFC107' : '#4CAF50';
    const row = document.createElement('tr');
    const hasDiff = e.before_data || e.after_data;
    row.innerHTML = `
      <td>${formatDate(e.occurred_at)}</td>
      <td>${_renderAuditActor(e)}</td>
      <td><span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${e.action}</span></td>
      <td>${escapeHtml(e.table_name)}</td>
      <td>${escapeHtml(e.row_id || '')}</td>
      <td>${hasDiff ? `<button class="btn btn-sm" style="padding:2px 8px;font-size:11px;" onclick="_showAuditDiff(${e.id})">👁 Ver</button>` : ''}</td>
    `;
    tbody.appendChild(row);
  });
}

function _filterAudit() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fDate = get('a-date'), fUser = get('a-user'), fAction = get('a-action'),
        fTable = get('a-table'), fRow = get('a-row');
  const filtered = _auditCache.filter(e => {
    if (fDate && !(e.occurred_at || '').toLowerCase().includes(fDate)) return false;
    if (fUser && !(e.actor_email || '').toLowerCase().includes(fUser)) return false;
    if (fAction && (e.action || '') !== fAction) return false;
    if (fTable && !(e.table_name || '').toLowerCase().includes(fTable)) return false;
    if (fRow && !(e.row_id || '').toLowerCase().includes(fRow)) return false;
    return true;
  });
  _renderAudit(filtered);
}

function _clearAuditFilters() {
  ['a-date','a-user','a-action','a-table','a-row'].forEach(k => {
    const el = document.querySelector(`[data-filter="${k}"]`);
    if (el) el.value = '';
  });
  _renderAudit(_auditCache);
}

window._filterAudit = _filterAudit;
window._clearAuditFilters = _clearAuditFilters;

// Export CSV del audit log filtrado
function _exportAuditCSV() {
  const get = k => (document.querySelector(`[data-filter="${k}"]`)?.value || '').toLowerCase().trim();
  const fDate = get('a-date'), fUser = get('a-user'), fAction = get('a-action'),
        fTable = get('a-table'), fRow = get('a-row');
  const rows = _auditCache.filter(e => {
    if (fDate && !(e.occurred_at || '').toLowerCase().includes(fDate)) return false;
    if (fUser && !(e.actor_email || '').toLowerCase().includes(fUser)) return false;
    if (fAction && (e.action || '') !== fAction) return false;
    if (fTable && !(e.table_name || '').toLowerCase().includes(fTable)) return false;
    if (fRow && !(e.row_id || '').toLowerCase().includes(fRow)) return false;
    return true;
  });
  const header = ['id','occurred_at','actor_email','action','table_name','row_id','before_data','after_data'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')].concat(rows.map(r =>
    header.map(h => esc(typeof r[h] === 'object' ? JSON.stringify(r[h]) : r[h])).join(',')
  ));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${rows.length} eventos exportados a CSV`, 'success');
}
window._exportAuditCSV = _exportAuditCSV;

// Diff before → after del audit log
function _showAuditDiff(id) {
  const e = _auditCache.find(x => x.id === id);
  if (!e) return;
  const before = e.before_data || {};
  const after  = e.after_data || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows = [];
  keys.forEach(k => {
    const b = before[k], a = after[k];
    const changed = JSON.stringify(b) !== JSON.stringify(a);
    rows.push({ key: k, before: b, after: a, changed });
  });
  rows.sort((x,y) => (y.changed - x.changed));   // cambios arriba

  const fmt = v => v === undefined ? '<em style="color:#999;">undefined</em>'
                 : v === null ? '<em style="color:#999;">null</em>'
                 : typeof v === 'object' ? `<code>${escapeHtml(JSON.stringify(v))}</code>`
                 : `<code>${escapeHtml(String(v))}</code>`;

  const html = `
    <div style="max-height:60vh;overflow-y:auto;">
      <div style="margin-bottom:10px;font-size:12px;color:#666;">
        <strong>${e.action.toUpperCase()}</strong> en <code>${escapeHtml(e.table_name)}</code> · row_id <code>${escapeHtml(e.row_id||'')}</code><br>
        ${formatDate(e.occurred_at)} · por ${escapeHtml(e.actor_email||'—')}
      </div>
      <table class="admin-table" style="font-size:11px;width:100%;">
        <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr style="${r.changed ? 'background:rgba(255,193,7,0.1);' : ''}">
              <td style="font-weight:${r.changed?'600':'400'};">${escapeHtml(r.key)}</td>
              <td style="word-break:break-all;">${fmt(r.before)}</td>
              <td style="word-break:break-all;">${fmt(r.after)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (typeof showModal === 'function') {
    showModal(`Diff #${id}`, html);
  } else {
    alert(`Diff #${id}:\nbefore: ${JSON.stringify(before, null, 2)}\nafter: ${JSON.stringify(after, null, 2)}`);
  }
}
window._showAuditDiff = _showAuditDiff;

// =============================================================
// INNOVACIÓN #10 — Widget de clima en dashboard admin
// =============================================================
async function loadWeatherWidget() {
  const container = document.getElementById('admin-weather-widget');
  if (!container) return;
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await sb.from('weather_records')
      .select('*').eq('recorded_for_date', today);
    if (!data || data.length === 0) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
          <div>
            <h4 style="margin:0 0 0.25rem;"><i class="fas fa-cloud-sun"></i> Clima</h4>
            <p class="text-muted text-small" style="margin:0;">Sin datos meteorológicos para hoy. Ejecuta la sincronización para traer el clima de los 6 campus.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="runWeatherSync()">
            <i class="fas fa-sync"></i> Sincronizar clima ahora
          </button>
        </div>`;
      return;
    }
    let html = '<h4 style="margin:0 0 0.5rem;"><i class="fas fa-cloud-sun"></i> Clima hoy</h4>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.5rem;">';
    data.forEach(w => {
      const alert = w.alert ? `<div style="background:#ffebee;color:#c62828;padding:2px 6px;border-radius:4px;font-size:0.75rem;margin-top:0.25rem;">⚠ ${w.alert}</div>` : '';
      html += `<div style="background:#f5f5f5;padding:0.6rem;border-radius:6px;font-size:0.85rem;">
        <strong>${escapeHtml(w.campus)}</strong>
        <div>🌡 ${w.temp_min}°/${w.temp_max}°C · 💧${w.humidity_pct||'?'}%</div>
        <div class="text-small text-muted">${escapeHtml(w.condition_summary || '')}</div>
        ${alert}
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="text-small text-muted">Sin clima (${escapeHtml(err.message || String(err))})</p>`;
  }
}

// =============================================================
// INNOVACIÓN #12 — Reportes ciudadanos en panel admin
// =============================================================
async function loadCitizenReports() {
  const container = document.getElementById('citizen-reports-container');
  if (!container) return;
  try {
    const { data, error } = await sb.from('problem_reports')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">Sin reportes ciudadanos aún.</p>';
      return;
    }
    const treeIds = [...new Set(data.map(r => r.tree_id).filter(Boolean))];
    const userIds = [...new Set(data.map(r => r.reported_by).filter(Boolean))];
    const [{ data: trees }, { data: users }] = await Promise.all([
      treeIds.length ? sb.from('trees_catalog').select('id, tree_code, common_name').in('id', treeIds) : { data: [] },
      userIds.length ? sb.from('user_profiles').select('id, full_name').in('id', userIds) : { data: [] },
    ]);
    const tMap = Object.fromEntries((trees || []).map(t => [t.id, t]));
    const uMap = Object.fromEntries((users || []).map(u => [u.id, u]));
    let html = '<table class="admin-table"><thead><tr><th>Fecha</th><th>Árbol</th><th>Reportado por</th><th>Urgencia</th><th>Estado</th><th>Descripción</th><th>Acciones</th></tr></thead><tbody>';
    data.forEach(r => {
      const tree = tMap[r.tree_id] || {};
      const user = uMap[r.reported_by] || {};
      const ucolor = r.urgency === 'critical' ? '#f44336' : r.urgency === 'high' ? '#FF9800' : r.urgency === 'normal' ? '#4CAF50' : '#9e9e9e';
      const scolor = r.status === 'resolved' ? '#4CAF50' : r.status === 'in_progress' ? '#2196F3' : r.status === 'closed' ? '#9e9e9e' : '#FFC107';
      html += `<tr>
        <td>${formatDate(r.created_at)}</td>
        <td>${escapeHtml(tree.tree_code || r.tree_id)}<br><span class="text-muted text-small">${escapeHtml(tree.common_name || '')}</span></td>
        <td>${escapeHtml(user.full_name || '—')}</td>
        <td><span style="background:${ucolor};color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${r.urgency || '-'}</span></td>
        <td><span style="background:${scolor};color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${r.status || '-'}</span></td>
        <td style="max-width:300px;">${escapeHtml((r.description || '').slice(0,150))}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="resolveCitizenReport(${r.id})">Cambiar estado</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="text-danger">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function resolveCitizenReport(id) {
  const newStatus = prompt('Nuevo estado: open / in_progress / resolved / closed', 'in_progress');
  if (!newStatus) return;
  if (!['open','in_progress','resolved','closed'].includes(newStatus)) {
    showToast('Estado inválido', 'error'); return;
  }
  const update = { status: newStatus };
  if (newStatus === 'resolved') {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = currentUser?.id || null;
    const notes = prompt('Notas de resolución (opcional)');
    if (notes) update.resolution_notes = notes;
  }
  const { error } = await sb.from('problem_reports').update(update).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Reporte actualizado', 'success');
  loadCitizenReports();
}

// =============================================================
// INNOVACIÓN #4 — Disparar manualmente notification-cron
// =============================================================
async function runNotificationCron() {
  if (!confirm('¿Ejecutar revisión de reglas de notificación ahora?')) return;
  try {
    const { data, error } = await sb.functions.invoke('notification-cron');
    if (error) throw error;
    showToast(`Cron OK: ${JSON.stringify(data?.summary || {})}`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function runWeatherSync() {
  showToast('Sincronizando clima de 6 campus…', 'info');
  try {
    const { data, error } = await sb.functions.invoke('weather-sync');
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const ok = (data?.results || []).filter(r => !r.error).length;
    const fail = (data?.results || []).filter(r => r.error).length;
    showToast(`Clima sincronizado: ${ok} OK, ${fail} fallos`, ok > 0 ? 'success' : 'warning');
    // Recargar widget
    loadWeatherWidget();
  } catch (err) {
    // Caso típico: función no desplegada o secret faltante
    let msg = err.message;
    if (msg && msg.toLowerCase().includes('not found')) {
      msg = 'La Edge Function "weather-sync" no está desplegada. Despliégala desde Supabase Dashboard → Edge Functions.';
    } else if (msg && msg.toLowerCase().includes('openweather')) {
      msg = 'Falta el secret OPENWEATHER_API_KEY en la Edge Function.';
    }
    showToast('Error: ' + msg, 'error');
  }
}

// =============================================================
// Expose
// =============================================================
window.showTreeQR = showTreeQR;
window.downloadQR = downloadQR;
window.printTreeQR = printTreeQR;
window.exportTreesToExcel = exportTreesToExcel;
window.exportDashboardToPDF = exportDashboardToPDF;
window.loadAuditLog = loadAuditLog;
window.loadWeatherWidget = loadWeatherWidget;
window.loadCitizenReports = loadCitizenReports;
window.resolveCitizenReport = resolveCitizenReport;
window.runNotificationCron = runNotificationCron;
window.runWeatherSync = runWeatherSync;

// =============================================================
// Bosque UNAM — Opción C: visualización dashboard como árbol vivo
// =============================================================

// Posiciones de hojas (50 slots distribuidos orgánicamente sobre las ramas)
const BOSQUE_LEAF_POSITIONS = [
  // Top canopy
  {x:285, y:55, r:7}, {x:300, y:35, r:8}, {x:315, y:55, r:7},
  {x:280, y:75, r:6}, {x:300, y:65, r:7}, {x:320, y:75, r:6},
  // Left high branch
  {x:255, y:50, r:6}, {x:240, y:65, r:7}, {x:225, y:55, r:6},
  // Left mid-high branch
  {x:210, y:95, r:7}, {x:190, y:108, r:6}, {x:170, y:98, r:7},
  // Left mid branch
  {x:160, y:135, r:7}, {x:140, y:148, r:8}, {x:120, y:158, r:7}, {x:100, y:165, r:6},
  {x:200, y:130, r:6}, {x:225, y:138, r:6},
  // Left low branch
  {x:135, y:175, r:6}, {x:160, y:185, r:7}, {x:185, y:175, r:6},
  {x:150, y:235, r:7}, {x:170, y:245, r:8}, {x:195, y:235, r:7}, {x:130, y:245, r:6},
  // Right high branch
  {x:345, y:50, r:6}, {x:360, y:65, r:7}, {x:375, y:55, r:6},
  // Right mid-high branch
  {x:390, y:95, r:7}, {x:410, y:108, r:6}, {x:430, y:98, r:7},
  // Right mid branch
  {x:440, y:135, r:7}, {x:460, y:148, r:8}, {x:480, y:158, r:7}, {x:500, y:165, r:6},
  {x:400, y:130, r:6}, {x:375, y:138, r:6},
  // Right low branch
  {x:415, y:175, r:6}, {x:440, y:185, r:7}, {x:465, y:175, r:6},
  {x:450, y:235, r:7}, {x:430, y:245, r:8}, {x:405, y:235, r:7}, {x:470, y:245, r:6},
  // Center fillers
  {x:290, y:110, r:6}, {x:310, y:115, r:6}, {x:300, y:90, r:6},
  {x:280, y:170, r:6}, {x:320, y:170, r:6}, {x:300, y:200, r:6}
];

function bosqueColorByHealth(score) {
  const s = score == null ? -1 : score;
  if (s >= 80) return '#4a7c2a';   // primary-light
  if (s >= 60) return '#95b86c';   // sage / leaf
  if (s >= 40) return '#d49b3a';   // warning amber
  if (s >= 0)  return '#b54f3a';   // danger
  return '#c5b5a0';                 // sin datos
}

function bosqueGenerateLeafPath(x, y, r) {
  // SVG path para una hoja estilizada (más orgánica que un círculo)
  // Forma: gota apuntando hacia arriba-fuera del centro del árbol
  const cx = 300; // center X del árbol
  // Ángulo desde el centro
  const angle = Math.atan2(y - 250, x - cx);
  const tx = x + Math.cos(angle) * r * 0.3;
  const ty = y + Math.sin(angle) * r * 0.3;
  return `M ${tx} ${ty} c ${-r} ${-r*0.5}, ${-r*1.4} ${-r*0.4}, 0 ${-r*1.6} c ${r*1.4} ${-r*0.4 + r*1.6}, ${r} ${r*1.1}, 0 ${r*1.6} z`;
}

// Cache del último treeList para que switchVisTab tenga datos sin re-fetchear
let _lastDashboardTrees = [];

function renderDashboardTree(treeList) {
  _lastDashboardTrees = treeList || [];
  const container = document.getElementById('dashboard-tree-vis');
  if (!container) return;
  container.style.display = 'block';

  // Asegurar que el título del tab Campus 3D refleja el campus activo
  if (typeof _applyCampus3DTitle === 'function') _applyCampus3DTitle();

  // Render la tab activa
  const activeTab = document.querySelector('.vis-tab.active');
  const which = activeTab ? activeTab.dataset.vis : 'bosque';
  switchVisTab(which);
}

// Dispatcher entre las 4 visualizaciones (Bosque, Mapa, Mosaico, Heatmap)
function switchVisTab(which) {
  // UI: marcar tab activa
  document.querySelectorAll('.vis-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.vis === which);
  });
  document.querySelectorAll('.vis-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('vis-' + which);
  if (pane) pane.classList.add('active');

  // Actualizar descripción
  const desc = document.getElementById('vis-description');
  if (desc) {
    const texts = {
      bosque: 'Cada árbol del bosque representa uno real del proyecto. Color = salud, tamaño = altura medida.',
      mapa: 'Cada árbol plotteado en sus coordenadas reales del campus. Click → abre detalles.',
      mosaico: 'Tres zonas según salud: verde (sano), ámbar (atención) y rojo (crítico). Cada foto es un árbol.',
      heatmap: 'Mapa de calor por salud. Zonas cálidas = árboles sanos, zonas frías = árboles en riesgo.',
      iztacala: 'Modelo 3D del campus FES Iztacala con edificios reales (OSM) y árboles del proyecto. Click sobre un árbol para ver detalle.'
    };
    desc.textContent = texts[which] || '';
  }

  const trees = _lastDashboardTrees;

  // Cleanup de visualizaciones inactivas (libera memoria GPU/Leaflet)
  // Nota: IztacalaMap no tiene destroy — se mantiene viva para no perder la
  // escena ya cargada. Solo se reataja el canvas si vuelves a entrar.
  ['DashboardTree3D','DashboardMapa','DashboardMosaico','DashboardHeatmap','DashboardWalkthrough'].forEach(mod => {
    if (window[mod] && window[mod].destroy) {
      try { window[mod].destroy(); } catch (e) {}
    }
  });

  // Visualizaciones 3D específicas a Iztacala (FES Iztacala 3D, Walkthrough) →
  // si el campus efectivo NO es Iztacala/Todos, mostramos mensaje en lugar de cargar
  const campusFilter = (typeof effectiveCampusFilter === 'function') ? effectiveCampusFilter() : '';
  const isIzta = !campusFilter || campusFilter === 'Iztacala';

  // Inicializar la visualización activa
  setTimeout(() => {
    try {
      if (which === 'bosque' && window.DashboardTree3D) {
        window.DashboardTree3D.init('#dashboard-tree-3d', trees);
      } else if (which === 'mapa' && window.DashboardMapa) {
        window.DashboardMapa.init('#dashboard-mapa-vis', trees);
      } else if (which === 'mosaico' && window.DashboardMosaico) {
        window.DashboardMosaico.init('#dashboard-mosaico-vis', trees);
      } else if (which === 'heatmap' && window.DashboardHeatmap) {
        window.DashboardHeatmap.init('#dashboard-heatmap-vis', trees);
      } else if (which === 'iztacala') {
        const cf = campusFilter || 'Iztacala';
        console.warn(`[switchVisTab] tab="iztacala" campusFilter="${cf}" hasCampusMap=${!!window.CampusMap} hasIztacalaMap=${!!window.IztacalaMap}`);
        if (cf === 'Iztacala' && window.IztacalaMap) {
          window.IztacalaMap.init('#dashboard-iztacala-vis');
        } else if (['Acatlan', 'Aragon', 'Cuautitlan1', 'Cuautitlan', 'Zaragoza', 'CU'].includes(cf) && window.CampusMap) {
          window.CampusMap.init('#dashboard-iztacala-vis', cf);
        } else {
          _showCampusUnderConstruction('#dashboard-iztacala-vis', cf);
        }
      } else if (which === 'walkthrough') {
        // Walkthrough soporta los 6 campus: Iztacala (GLB Blender) +
        // Acatlan, Aragon, Cuautitlan, Zaragoza, CU (procedurales OSM)
        const cf = campusFilter || 'Iztacala';
        const supported = ['Iztacala', 'Acatlan', 'Aragon', 'Cuautitlan1', 'Cuautitlan', 'Zaragoza', 'CU'].includes(cf);
        if (supported && window.DashboardWalkthrough) {
          window.DashboardWalkthrough.init('#dashboard-walkthrough-vis', cf);
        } else {
          _showCampusUnderConstruction('#dashboard-walkthrough-vis', campusFilter);
        }
      }
    } catch (e) {
      console.warn('Vis init failed:', which, e);
    }
  }, 50);
}

// Mensaje "Modelo 3D en construcción" para campus sin GLB todavía
function _showCampusUnderConstruction(selector, campusName) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = `
    <div style="height:100%;min-height:400px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border-radius:12px;padding:2rem;">
      <div style="text-align:center;max-width:520px;">
        <div style="font-size:3rem;margin-bottom:1rem;">🏗️</div>
        <h3 style="margin:0 0 0.6rem;color:#1b5e20;">Modelo 3D en construcción</h3>
        <p style="color:#444;line-height:1.5;">
          Aún no hay un modelo 3D del campus <strong>${escapeHtml(campusName || '?')}</strong>.<br>
          Solo el campus <strong>FES Iztacala</strong> tiene modelo disponible por ahora.
        </p>
        <p style="color:#888;font-size:0.85rem;margin-top:1rem;">
          Por mientras, usa el <strong>Heatmap campus</strong> o el <strong>Mapa 3D</strong>, que sí funcionan para cualquier campus.
        </p>
      </div>
    </div>
  `;
}

window.switchVisTab = switchVisTab;

// Función legacy (compatibilidad)
function renderDashboardTreeLegacy(treeList) {
  const container = document.getElementById('dashboard-tree-vis');
  if (!container) return;
  container.style.display = 'block';

  if (window.DashboardTree3D && window.THREE) {
    try {
      const ok = window.DashboardTree3D.init('#dashboard-tree-3d', treeList || []);
      if (ok) return;
    } catch (e) {
      console.warn('Bosque 3D falló:', e);
    }
  }

  // -------- Fallback SVG (legacy) --------
  const slotsGroup = document.getElementById('dashboard-leaf-slots');
  if (!slotsGroup) return;

  slotsGroup.innerHTML = '';

  const trees = (treeList || []).slice();
  const totalSlots = BOSQUE_LEAF_POSITIONS.length;
  const total = trees.length;

  trees.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));

  const scaled = total > totalSlots;

  // Primera pasada: crear todos los path elements con datos pero sin la clase 'show'
  const pathsToReveal = [];
  for (let i = 0; i < totalSlots; i++) {
    const pos = BOSQUE_LEAF_POSITIONS[i];
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'leaf-slot');
    path.setAttribute('d', bosqueGenerateLeafPath(pos.x, pos.y, pos.r));
    path.setAttribute('stroke', 'rgba(0,0,0,0.15)');
    path.setAttribute('stroke-width', '0.5');

    let assignedTree = null;
    if (!scaled) {
      assignedTree = trees[i] || null;
    } else {
      const idx = Math.floor(i * total / totalSlots);
      assignedTree = trees[idx] || null;
    }

    if (assignedTree && assignedTree.id != null) {
      const score = assignedTree.health_score || 0;
      path.setAttribute('fill', bosqueColorByHealth(score));
      path.setAttribute('data-tree-id', String(assignedTree.id));
      path.setAttribute('data-tree-code', assignedTree.tree_code || '');
      path.setAttribute('data-tree-name', assignedTree.common_name || assignedTree.species || 'Árbol');
      path.setAttribute('data-health', String(score));
      path.setAttribute('data-status', assignedTree.status || '');
      path.setAttribute('data-campus', assignedTree.campus || '');
      path.style.transitionDelay = (i * 35) + 'ms';
      pathsToReveal.push(path);
    } else {
      path.setAttribute('fill', '#c5b5a0');
      path.classList.add('empty');
    }
    slotsGroup.appendChild(path);
  }

  // Segunda pasada: pequeño delay para que el browser pinte el estado inicial
  // (opacity:0, scale:0) antes de aplicar la clase 'show' que dispara la
  // transición. Probado: rAF no es suficiente para SVG paths recién creados.
  void slotsGroup.getBoundingClientRect();  // force layout
  setTimeout(() => {
    pathsToReveal.forEach(p => p.classList.add('show'));
  }, 30);

  // Bind hover/click handlers
  bindBosqueLeafEvents();
}

function bindBosqueLeafEvents() {
  const slotsGroup = document.getElementById('dashboard-leaf-slots');
  const tooltip = document.getElementById('dashboard-tree-tooltip');
  if (!slotsGroup || !tooltip) return;

  slotsGroup.querySelectorAll('.leaf-slot:not(.empty)').forEach(leaf => {
    leaf.addEventListener('mousemove', e => {
      const code = leaf.getAttribute('data-tree-code');
      const name = leaf.getAttribute('data-tree-name');
      const h = leaf.getAttribute('data-health');
      const status = leaf.getAttribute('data-status');
      const campus = leaf.getAttribute('data-campus');
      tooltip.innerHTML = `
        <strong>${escapeHtml(name)} <span style="opacity:0.7;">(${escapeHtml(code)})</span></strong>
        Salud: ${h}/100 — ${escapeHtml(status || '?')}<br>
        Campus: ${escapeHtml(campus || '?')}
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = e.clientX + 'px';
      tooltip.style.top = e.clientY + 'px';
    });
    leaf.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
    leaf.addEventListener('click', () => {
      const id = leaf.getAttribute('data-tree-id');
      if (id && typeof editAdminTree === 'function') {
        editAdminTree(parseInt(id, 10));
      }
    });
    // Touch support
    leaf.addEventListener('touchstart', e => {
      const t = e.touches[0];
      const code = leaf.getAttribute('data-tree-code');
      const name = leaf.getAttribute('data-tree-name');
      const h = leaf.getAttribute('data-health');
      tooltip.innerHTML = `<strong>${escapeHtml(name)} (${escapeHtml(code)})</strong>Salud: ${h}/100`;
      tooltip.style.display = 'block';
      tooltip.style.left = t.clientX + 'px';
      tooltip.style.top = t.clientY + 'px';
      setTimeout(() => { tooltip.style.display = 'none'; }, 2500);
    }, { passive: true });
  });
}

window.renderDashboardTree = renderDashboardTree;

// ============================================================================
// COORDINACIÓN — gestión de responsables ↔ estudiantes coordinados
// 1 tab que sirve 2 vistas según rol:
//   - admin / admin-campus → ven y gestionan TODOS los responsables del campus
//   - responsable → ve solo SUS estudiantes coordinados
// La seguridad real vive en RLS de responsable_assignments — la UI es solo UX.
// ============================================================================

async function loadCoordinacion() {
  const wrap = document.getElementById('coordinacion-content');
  if (!wrap) return;

  if (isResponsableRole()) {
    return _loadCoordinacionResponsable(wrap);
  }
  if (isAdminRole() || isAdminCampusRole()) {
    return _loadCoordinacionAdmin(wrap);
  }
  wrap.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;">Sin permiso para ver esta sección.</p>';
}

// ---- Vista del ADMIN / ADMIN-CAMPUS ----
async function _loadCoordinacionAdmin(wrap) {
  wrap.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando responsables…</p>';
  try {
    const campusFilter = effectiveCampusFilter();

    // 1) Traer todos los responsables (filtrados por campus si aplica)
    let qResp = sb.from('user_profiles')
      .select('id, full_name, account_number, campus, academic_status')
      .eq('role', 'responsable')
      .order('full_name');
    if (campusFilter) qResp = qResp.eq('campus', campusFilter);
    const { data: responsables, error: errR } = await qResp;
    if (errR) throw errR;

    // 2) Contar estudiantes por responsable
    const { data: assigns } = await sb.from('responsable_assignments')
      .select('responsable_id, user_id');
    const studentsCount = {};
    (assigns || []).forEach(a => {
      studentsCount[a.responsable_id] = (studentsCount[a.responsable_id] || 0) + 1;
    });

    if (!responsables || responsables.length === 0) {
      wrap.innerHTML = `
        <div style="padding:2rem;text-align:center;color:#888;">
          <div style="font-size:3rem;margin-bottom:0.8rem;">👥</div>
          <h3 style="margin:0 0 0.6rem;color:#1b5e20;">No hay responsables en este campus</h3>
          <p>Asigna el rol <strong>responsable</strong> a algún usuario desde la tab <strong>Usuarios</strong> y aparecerá aquí para coordinar estudiantes.</p>
        </div>`;
      return;
    }

    const rows = responsables.map(r => {
      const count = studentsCount[r.id] || 0;
      return `
        <tr>
          <td>${escapeHtml(r.full_name || '-')}</td>
          <td>${escapeHtml(r.account_number || '-')}</td>
          <td>${escapeHtml(r.campus || '-')}</td>
          <td><span style="background:#e8f5e9;color:#2e7d32;padding:2px 10px;border-radius:10px;font-weight:600;">${count}</span></td>
          <td><button class="btn btn-sm btn-primary" onclick="manageResponsableStudents('${r.id}','${safeJsAttr(r.full_name)}','${safeJsAttr(r.campus)}')">Gestionar estudiantes</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <h3 style="margin:0 0 1rem;">Coordinación de estudiantes</h3>
      <p class="text-muted" style="margin-bottom:1rem;">Asigna estudiantes a cada responsable para que los coordine. Los estudiantes solo pueden ser asignados a un responsable a la vez.</p>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Responsable</th>
            <th>No. Cuenta</th>
            <th>Campus</th>
            <th>Estudiantes</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    console.error('loadCoordinacionAdmin error:', err);
    wrap.innerHTML = `<p style="color:#c62828;padding:1rem;">Error: ${escapeHtml(err.message || err)}</p>`;
  }
}

// ---- Vista del RESPONSABLE ----
async function _loadCoordinacionResponsable(wrap) {
  wrap.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando tus estudiantes…</p>';
  try {
    const myId = currentUser?.id;
    if (!myId) {
      wrap.innerHTML = '<p style="color:#c62828;">No estás autenticado.</p>';
      return;
    }

    // 1) Mis asignaciones
    const { data: assigns, error: errA } = await sb.from('responsable_assignments')
      .select('user_id, campus, assigned_at, notes')
      .eq('responsable_id', myId)
      .order('assigned_at', { ascending: false });
    if (errA) throw errA;

    if (!assigns || assigns.length === 0) {
      wrap.innerHTML = `
        <div style="padding:2rem;text-align:center;color:#888;">
          <div style="font-size:3rem;margin-bottom:0.8rem;">🎓</div>
          <h3 style="margin:0 0 0.6rem;color:#1b5e20;">Aún no tienes estudiantes asignados</h3>
          <p>Un administrador del campus debe asignarte estudiantes para coordinar. En cuanto te asignen alguno, aparecerá aquí.</p>
        </div>`;
      return;
    }

    // 2) Datos de los estudiantes
    const userIds = assigns.map(a => a.user_id);
    const { data: students } = await sb.from('user_profiles')
      .select('id, full_name, account_number, academic_status, campus')
      .in('id', userIds);
    const studentMap = {};
    (students || []).forEach(s => { studentMap[s.id] = s; });

    // 3) Asignaciones de árboles (para contar árboles asignados)
    const { data: treeAssigns } = await sb.from('tree_assignments')
      .select('user_id, tree_id')
      .in('user_id', userIds);
    const treesCount = {};
    (treeAssigns || []).forEach(t => {
      treesCount[t.user_id] = (treesCount[t.user_id] || 0) + 1;
    });

    // 4) Últimos seguimientos para mostrar actividad
    const { data: lastMeas } = await sb.from('tree_measurements')
      .select('user_id, measurement_date')
      .in('user_id', userIds)
      .order('measurement_date', { ascending: false });
    const lastActivity = {};
    (lastMeas || []).forEach(m => {
      if (!lastActivity[m.user_id]) lastActivity[m.user_id] = m.measurement_date;
    });

    const cards = assigns.map(a => {
      const s = studentMap[a.user_id];
      if (!s) return ''; // perfil borrado
      const trees = treesCount[a.user_id] || 0;
      const last = lastActivity[a.user_id];
      const lastStr = last ? new Date(last).toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' }) : 'Sin actividad';
      const lastColor = last && (Date.now() - new Date(last).getTime()) < 30*24*3600*1000 ? '#2e7d32' : '#c62828';
      const inactive = !last || (Date.now() - new Date(last).getTime()) >= 30*24*3600*1000;
      const notes = (a.notes || '').trim();
      return `
        <div style="background:white;border:1px solid #e0e0e0;border-radius:12px;padding:1rem 1.25rem;margin-bottom:0.8rem;box-shadow:0 1px 3px rgba(0,0,0,0.05);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;"
             onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';"
             onmouseleave="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)';"
             onclick="showStudentDetail('${s.id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <h4 style="margin:0 0 0.3rem;color:#1b5e20;">${escapeHtml(s.full_name)} <i class="fas fa-chevron-right" style="font-size:0.7rem;opacity:0.4;margin-left:4px;"></i></h4>
              <div style="font-size:0.85rem;color:#666;">
                <span>${escapeHtml(s.account_number || 'Sin cuenta')}</span> ·
                <span>${escapeHtml(s.academic_status || '-')}</span>
              </div>
              ${notes ? `<p style="margin:0.5rem 0 0;font-size:0.82rem;color:#777;font-style:italic;"><i class="fas fa-sticky-note"></i> ${escapeHtml(notes)}</p>` : ''}
              <div style="margin-top:0.6rem;display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button class="btn btn-sm btn-primary" style="font-size:0.75rem;padding:4px 10px;" onclick="event.stopPropagation();openAssignTreeToStudent('${s.id}','${safeJsAttr(s.full_name)}','${safeJsAttr(s.campus || _userCampus())}')"><i class="fas fa-plus"></i> Asignar árbol</button>
                ${inactive ? `<button class="btn btn-sm" style="background:#ff9800;color:white;font-size:0.75rem;padding:4px 10px;" onclick="event.stopPropagation();sendReminderToStudent('${s.id}','${safeJsAttr(s.full_name)}')"><i class="fas fa-bell"></i> Recordar</button>` : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:0.78rem;color:#888;">Árboles</div>
              <div style="font-size:1.5rem;font-weight:700;color:#2e7d32;">${trees}</div>
              <div style="font-size:0.72rem;color:${lastColor};margin-top:0.3rem;">Último seguimiento:<br>${lastStr}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = `
      <h3 style="margin:0 0 0.6rem;">Mis estudiantes coordinados</h3>
      <p class="text-muted" style="margin-bottom:1rem;">Coordinas <strong>${assigns.length}</strong> estudiante${assigns.length !== 1 ? 's' : ''} en el campus <strong>${escapeHtml(_userCampus())}</strong>. Click en una tarjeta para ver detalle.</p>
      ${cards}

      <details style="margin-top:1.5rem;background:white;border:1px solid #e0e0e0;border-radius:12px;padding:0.8rem 1rem;">
        <summary style="cursor:pointer;font-weight:600;color:#1b5e20;font-size:1rem;">🌳 Bosque 3D de mis estudiantes</summary>
        <div id="bosque-responsable-wrap" style="margin-top:1rem;">
          <p class="text-muted" style="text-align:center;padding:0.5rem;">
            <button class="btn btn-sm btn-primary" onclick="_loadBosqueDelResponsable('#bosque-responsable-wrap')"><i class="fas fa-tree"></i> Cargar bosque 3D</button>
          </p>
        </div>
      </details>
    `;
  } catch (err) {
    console.error('loadCoordinacionResponsable error:', err);
    wrap.innerHTML = `<p style="color:#c62828;padding:1rem;">Error: ${escapeHtml(err.message || err)}</p>`;
  }
}

// ---- MODAL: gestionar estudiantes de un responsable ----
async function manageResponsableStudents(responsableId, responsableName, responsableCampus) {
  try {
    // 1) Estudiantes ya asignados a este responsable
    const { data: currentAssigns } = await sb.from('responsable_assignments')
      .select('user_id, notes')
      .eq('responsable_id', responsableId);
    const assignedIds = new Set((currentAssigns || []).map(a => a.user_id));

    // 2) Candidatos: users del MISMO campus que el responsable, rol 'user' o 'responsable' (no admins)
    const { data: candidates } = await sb.from('user_profiles')
      .select('id, full_name, account_number, role, campus')
      .eq('campus', responsableCampus)
      .in('role', ['user', 'responsable'])
      .neq('id', responsableId)  // no asignarse a sí mismo
      .order('full_name');

    const candidatesList = (candidates || []).map(u => {
      const isAssigned = assignedIds.has(u.id);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.55rem 0.8rem;border-bottom:1px solid #f0f0f0;${isAssigned?'background:rgba(46,125,50,0.05);':''}">
          <div style="flex:1;min-width:0;">
            <strong>${escapeHtml(u.full_name)}</strong>
            <span style="color:#888;font-size:0.78rem;">· ${escapeHtml(u.account_number || 'sin cuenta')}</span>
            ${u.role === 'responsable' ? '<span style="background:#fff7e6;color:#7a5a2a;font-size:0.7rem;padding:1px 6px;border-radius:6px;margin-left:6px;">responsable</span>' : ''}
          </div>
          ${isAssigned
            ? `<button class="btn btn-sm btn-danger" onclick="unassignStudentFromResponsable('${responsableId}','${u.id}',this)">Quitar</button>`
            : `<button class="btn btn-sm btn-primary" onclick="assignStudentToResponsable('${responsableId}','${u.id}','${responsableCampus}',this)">Asignar</button>`
          }
        </div>
      `;
    }).join('');

    showModal(`Estudiantes de ${responsableName}`, `
      <p class="text-muted" style="margin:0 0 0.8rem;">Selecciona usuarios del campus <strong>${escapeHtml(responsableCampus)}</strong> para asignarlos a este responsable.</p>
      <div style="max-height:60vh;overflow-y:auto;border:1px solid #eee;border-radius:10px;">
        ${candidatesList || '<p class="text-muted" style="padding:1.5rem;text-align:center;">No hay candidatos en este campus.</p>'}
      </div>
      <div style="margin-top:1rem;text-align:right;">
        <button class="btn btn-secondary" onclick="closeModal(); loadCoordinacion();">Cerrar</button>
      </div>
    `);
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

async function assignStudentToResponsable(responsableId, userId, campus, btn) {
  try {
    const { error } = await sb.from('responsable_assignments').insert([{
      responsable_id: responsableId,
      user_id: userId,
      campus: campus,
      assigned_by: currentUser?.id
    }]);
    if (error) throw error;
    // Cambiar el botón inmediatamente
    if (btn) {
      const row = btn.closest('div').parentElement;
      btn.outerHTML = `<button class="btn btn-sm btn-danger" onclick="unassignStudentFromResponsable('${responsableId}','${userId}',this)">Quitar</button>`;
      if (row) row.style.background = 'rgba(46,125,50,0.05)';
    }
    showToast('Estudiante asignado', 'success');
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

async function unassignStudentFromResponsable(responsableId, userId, btn) {
  if (!confirm('¿Quitar este estudiante de la coordinación?')) return;
  try {
    const { error } = await sb.from('responsable_assignments').delete()
      .eq('responsable_id', responsableId)
      .eq('user_id', userId);
    if (error) throw error;
    if (btn) {
      // Encontrar el campus desde el contexto (busca en la lista) — fallback simple: refrescar modal
      const parentDiv = btn.closest('div')?.parentElement;
      const campus = '';  // dejamos vacío, el handler re-fetchea al recrear
      btn.outerHTML = `<button class="btn btn-sm btn-primary" onclick="manageResponsableStudents_refresh('${responsableId}')">Recargar</button>`;
      if (parentDiv) parentDiv.style.background = '';
    }
    showToast('Estudiante quitado', 'success');
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

window.loadCoordinacion = loadCoordinacion;
window.manageResponsableStudents = manageResponsableStudents;
window.assignStudentToResponsable = assignStudentToResponsable;
window.unassignStudentFromResponsable = unassignStudentFromResponsable;

// ============================================================================
// VISTA DEL RESPONSABLE — extensiones
// 1) Click en card → modal detalle del estudiante (árboles + seguimientos)
// 2) Asignar nuevo árbol al estudiante
// 3) Recordar seguimiento (notificación)
// 4) Bosque 3D filtrado a sus estudiantes
// ============================================================================

async function showStudentDetail(userId) {
  try {
    showModal('Cargando…', '<p class="text-muted" style="padding:1rem;text-align:center;"><i class="fas fa-spinner fa-spin"></i></p>');

    // Datos del estudiante
    const { data: student } = await sb.from('user_profiles')
      .select('id, full_name, account_number, academic_status, campus, telegram_chat_id')
      .eq('id', userId)
      .single();
    if (!student) { showToast('Estudiante no encontrado', 'error'); closeModal(); return; }

    // Árboles asignados
    const { data: treeAssigns } = await sb.from('tree_assignments')
      .select('tree_id, assigned_at, notes')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false });

    const treeIds = (treeAssigns || []).map(a => a.tree_id);
    let trees = [];
    if (treeIds.length > 0) {
      const { data: t } = await sb.from('trees_catalog')
        .select('id, tree_code, common_name, species, campus, health_score, status, photo_url')
        .in('id', treeIds);
      trees = t || [];
    }

    // Últimos 5 seguimientos del estudiante
    const { data: lastMeas } = await sb.from('tree_measurements')
      .select('id, tree_id, measurement_date, height_cm, health_score, observations, photo_url')
      .eq('user_id', userId)
      .order('measurement_date', { ascending: false })
      .limit(5);

    // Mapa tree_id → datos
    const treeMap = {};
    trees.forEach(t => { treeMap[t.id] = t; });

    // Resolver thumbs en paralelo (signed URLs)
    await Promise.all((lastMeas || []).map(async m => {
      if (m.photo_url) {
        try {
          const { data } = await sb.storage.from('tree-photos')
            .createSignedUrl(thumbPathFor(m.photo_url) || m.photo_url, 3600);
          m._photoSrc = data?.signedUrl || null;
        } catch (_) { m._photoSrc = null; }
      }
    }));

    // Render trees table
    const treesHtml = trees.length === 0
      ? '<p class="text-muted" style="padding:1rem;text-align:center;">Aún no tiene árboles asignados.</p>'
      : `<table class="admin-table" style="font-size:0.85rem;">
          <thead><tr><th>Código</th><th>Especie</th><th>Salud</th><th>Estado</th></tr></thead>
          <tbody>
            ${trees.map(t => {
              const color = (t.health_score||0) >= 70 ? '#4CAF50' : (t.health_score||0) >= 40 ? '#FFA726' : '#EF5350';
              return `<tr>
                <td><strong>${escapeHtml(t.tree_code||'-')}</strong></td>
                <td>${escapeHtml(t.common_name || t.species || '-')}</td>
                <td><span style="background:${color};color:#fff;padding:2px 8px;border-radius:8px;font-size:0.75rem;">${t.health_score||0}</span></td>
                <td><span style="background:#eee;padding:2px 8px;border-radius:6px;font-size:0.75rem;">${escapeHtml(TREE_STATUS_LABELS[t.status]||t.status||'-')}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;

    // Render measurements
    const measHtml = !lastMeas || lastMeas.length === 0
      ? '<p class="text-muted" style="padding:1rem;text-align:center;">Sin seguimientos registrados aún.</p>'
      : lastMeas.map(m => {
          const tree = treeMap[m.tree_id] || {};
          const dt = m.measurement_date ? new Date(m.measurement_date).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '?';
          const color = (m.health_score||0) >= 70 ? '#4CAF50' : (m.health_score||0) >= 40 ? '#FFA726' : '#EF5350';
          const photoTag = m._photoSrc
            ? `<img src="${escapeHtml(m._photoSrc)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:zoom-in;" onclick="window.open(this.src,'_blank')">`
            : '<div style="width:56px;height:56px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#aaa;">📷</div>';
          return `<div style="display:flex;gap:0.8rem;padding:0.6rem;border-bottom:1px solid #f0f0f0;align-items:center;">
            ${photoTag}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <strong>🌳 ${escapeHtml(tree.tree_code || '?')}</strong>
                <span style="font-size:0.78rem;color:#777;">${dt}</span>
              </div>
              <div style="font-size:0.78rem;color:#555;margin-top:3px;">
                ${m.height_cm != null ? `📏 ${m.height_cm} cm · ` : ''}
                <span style="color:${color};font-weight:600;">Salud ${m.health_score||0}/100</span>
              </div>
            </div>
          </div>`;
        }).join('');

    showModal(`👤 ${escapeHtml(student.full_name)}`, `
      <div style="margin-bottom:1rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:0.85rem;color:#666;">
        <div>
          <strong>${escapeHtml(student.account_number || 'Sin número de cuenta')}</strong>
          <span> · ${escapeHtml(student.academic_status || '-')}</span>
          <span> · ${escapeHtml(student.campus || '-')}</span>
        </div>
        <div>${student.telegram_chat_id ? '✅ Telegram' : '❌ Sin Telegram'}</div>
      </div>

      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
        <button class="btn btn-sm btn-primary" onclick="openAssignTreeToStudent('${userId}','${safeJsAttr(student.full_name)}','${safeJsAttr(student.campus)}')"><i class="fas fa-plus"></i> Asignar árbol</button>
        <button class="btn btn-sm" style="background:#ff9800;color:white;" onclick="sendReminderToStudent('${userId}','${safeJsAttr(student.full_name)}')"><i class="fas fa-bell"></i> Recordar seguimiento</button>
      </div>

      <h4 style="margin:1rem 0 0.5rem;border-top:1px solid #eee;padding-top:0.8rem;">🌳 Árboles asignados (${trees.length})</h4>
      ${treesHtml}

      <h4 style="margin:1rem 0 0.5rem;border-top:1px solid #eee;padding-top:0.8rem;">📋 Últimos seguimientos</h4>
      <div style="border:1px solid #eee;border-radius:10px;max-height:300px;overflow-y:auto;">
        ${measHtml}
      </div>
    `);
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
    closeModal();
  }
}

// ---- Asignar árbol a estudiante (selecciona uno de los disponibles en el campus) ----
async function openAssignTreeToStudent(userId, userName, userCampus) {
  try {
    // Árboles del campus que NO están asignados a NADIE
    const { data: trees } = await sb.from('trees_catalog')
      .select('id, tree_code, common_name, species, campus, health_score')
      .eq('campus', userCampus)
      .order('tree_code');
    const { data: existing } = await sb.from('tree_assignments').select('tree_id');
    const assigned = new Set((existing || []).map(a => a.tree_id));
    const available = (trees || []).filter(t => !assigned.has(t.id));

    if (available.length === 0) {
      showToast('No hay árboles disponibles en ' + userCampus + ' (todos están asignados)', 'warning');
      return;
    }

    const opts = available.map(t =>
      `<option value="${t.id}">${escapeHtml(t.tree_code)} - ${escapeHtml(t.common_name || t.species || '?')}</option>`
    ).join('');

    showModal(`Asignar árbol a ${userName}`, `
      <form id="assign-tree-student-form">
        <div class="form-group" style="margin-bottom:1rem;">
          <label>Árbol disponible (${available.length})</label>
          <select id="ats-tree" style="width:100%;padding:0.5rem;" required>
            <option value="">Selecciona…</option>${opts}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;">
          <label>Notas (opcional)</label>
          <input type="text" id="ats-notes" style="width:100%;padding:0.5rem;" placeholder="Ej: árbol asignado por su responsable">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Asignar</button>
      </form>
    `);

    document.getElementById('assign-tree-student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const treeId = document.getElementById('ats-tree').value;
      const notes = document.getElementById('ats-notes').value.trim() || null;
      if (!treeId) return;
      try {
        const { error } = await sb.from('tree_assignments').insert([{
          tree_id: treeId,
          user_id: userId,
          assigned_by: currentUser?.id,
          notes: notes
        }]);
        if (error) throw error;
        showToast('Árbol asignado a ' + userName, 'success');
        closeModal();
        // Reabrir el modal de detalle para que refleje el cambio
        showStudentDetail(userId);
      } catch (err) {
        showToast('Error: ' + (err.message || err), 'error');
      }
    });
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

// ---- Enviar recordatorio (notificación in-app) ----
async function sendReminderToStudent(userId, userName) {
  if (!confirm('¿Enviar recordatorio de seguimiento a ' + userName + '?')) return;
  try {
    const { error } = await sb.from('notifications').insert([{
      title: 'Recordatorio de tu coordinador',
      message: 'Tu coordinador te recuerda hacer seguimiento de tus árboles asignados. Tu trabajo es importante para el proyecto Árbol UNAM 475 🌳',
      sender_id: currentUser?.id || null,
      notification_type: 'info',
      target_user_id: userId,
      sent_at: new Date().toISOString()
    }]);
    if (error) throw error;
    showToast('Recordatorio enviado a ' + userName, 'success');
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

// ---- BOSQUE 3D del responsable (filtrado a sus estudiantes) ----
async function _loadBosqueDelResponsable(containerSel) {
  const el = document.querySelector(containerSel);
  if (!el) return;
  el.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando bosque…</p>';
  try {
    const myId = currentUser?.id;
    const { data: assigns } = await sb.from('responsable_assignments')
      .select('user_id')
      .eq('responsable_id', myId);
    const studentIds = (assigns || []).map(a => a.user_id);
    if (studentIds.length === 0) {
      el.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;">Sin estudiantes coordinados.</p>';
      return;
    }
    const { data: treeAssigns } = await sb.from('tree_assignments')
      .select('tree_id').in('user_id', studentIds);
    const treeIds = [...new Set((treeAssigns || []).map(t => t.tree_id))];
    if (treeIds.length === 0) {
      el.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;">Tus estudiantes aún no tienen árboles asignados.</p>';
      return;
    }
    const { data: trees } = await sb.from('trees_catalog')
      .select('id, tree_code, common_name, species, health_score, status, initial_height_cm, campus')
      .in('id', treeIds);

    if (!window.DashboardTree3D) {
      el.innerHTML = '<p class="text-muted">Módulo 3D no disponible.</p>';
      return;
    }
    // Crear un contenedor interno para el 3D
    el.innerHTML = '<div id="bosque-resp-3d" style="width:100%;height:560px;border-radius:12px;overflow:hidden;background:#a8d4f0;"></div>';
    window.DashboardTree3D.init('#bosque-resp-3d', trees || []);
  } catch (err) {
    el.innerHTML = `<p style="color:#c62828;">Error: ${escapeHtml(err.message || err)}</p>`;
  }
}

window.showStudentDetail = showStudentDetail;
window.openAssignTreeToStudent = openAssignTreeToStudent;
window.sendReminderToStudent = sendReminderToStudent;
window._loadBosqueDelResponsable = _loadBosqueDelResponsable;
