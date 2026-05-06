// ============================================================================
// ADMIN - Dashboard, Users, Trees, Gardens, Groups, Notifications, Assignments
// ============================================================================

// ---- ROLE GUARD: block non-admin from admin panel ----
function isAdminRole() {
  return currentUserProfile && currentUserProfile.role === 'admin';
}

// ---- TAB SWITCHING ----
function switchAdminTab(tabName) {
  // Double-check: only admin can use admin tabs
  if (!isAdminRole()) {
    showToast('Acceso denegado: solo administradores', 'error');
    showSection('section-mi-arbol');
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
    else if (tabName === 'notifications') loadAdminNotifications();
    else if (tabName === 'assignments') loadAssignments();
    else if (tabName === 'dashboard') { loadAdminDashboard(); loadWeatherWidget(); }
    else if (tabName === 'reports') loadCitizenReports();
    else if (tabName === 'audit') loadAuditLog();
  }
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) tab.classList.add('active');
  });
}

// ---- DASHBOARD ----
let dashboardLoaded = false;

async function loadAdminDashboard(forceReload) {
  if (dashboardLoaded && !forceReload) return;
  try {
    const { count: userCount } = await sb.from('user_profiles').select('*', { count: 'exact', head: true });
    const { count: treeCount } = await sb.from('trees_catalog').select('*', { count: 'exact', head: true });
    const { count: assignCount } = await sb.from('tree_assignments').select('*', { count: 'exact', head: true });
    const { data: trees } = await sb.from('trees_catalog').select('id, tree_code, common_name, species, health_score, status, campus, location_lat, location_lng, photo_url, initial_height_cm');
    const treeList = trees || [];
    const avgHealth = treeList.length > 0
      ? Math.round(treeList.reduce((sum, t) => sum + (t.health_score || 0), 0) / treeList.length) : 0;

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

  // Fetch trees with coordinates from DB
  sb.from('trees_catalog')
    .select('id, tree_code, common_name, species, location_lat, location_lng, health_score, status, campus')
    .not('location_lat', 'is', null)
    .not('location_lng', 'is', null)
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
async function loadAdminUsers() {
  try {
    const { data, error } = await sb.from('user_profiles').select('*').order('full_name');
    if (error) throw error;
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (data || []).forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(user.full_name || '-')}</td>
        <td>${escapeHtml(user.account_number || '-')}</td>
        <td><span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${user.role || 'user'}</span></td>
        <td><span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${escapeHtml(user.academic_status || '-')}</span></td>
        <td>${escapeHtml(user.campus || '-')}</td>
        <td>${user.telegram_chat_id ? '✅' : '❌'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editAdminUser('${user.id}')">Editar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando usuarios: ' + err.message, 'error');
  }
}

function toggleSpecialistFields() {
  const role = document.getElementById('admin-user-role')?.value;
  const block = document.getElementById('specialist-fields');
  if (block) block.style.display = role === 'specialist' ? 'block' : 'none';
}

async function saveAdminUser(e) {
  if (e) e.preventDefault();
  const nombre = document.getElementById('admin-user-nombre')?.value.trim();
  const correo = document.getElementById('admin-user-correo')?.value.trim();
  const password = document.getElementById('admin-user-password')?.value.trim();
  const numCuenta = document.getElementById('admin-user-num-cuenta')?.value.trim();
  const fechaNac = document.getElementById('admin-user-fecha-nacimiento')?.value;
  const estatus = document.getElementById('admin-user-estatus')?.value || 'alumno';
  const role = document.getElementById('admin-user-role')?.value || 'user';

  if (!nombre || !correo) { showToast('Nombre y correo son requeridos', 'error'); return; }
  if (!password || password.length < 6) { showToast('Contraseña de al menos 6 caracteres', 'error'); return; }

  const campus = document.getElementById('admin-user-campus')?.value || 'Iztacala';

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

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

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

    const statusOptions = ['alumno','exalumno','egresado','pasante','tesista','becario','postgrado','profesor','profesora'];
    const statusSelect = statusOptions.map(s =>
      `<option value="${s}" ${user.academic_status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    const campusOptions = ['Iztacala','Acatlan','Aragon','Cuautitlan','Zaragoza','CU'];
    const campusSelect = campusOptions.map(c =>
      `<option value="${c}" ${user.campus === c ? 'selected' : ''}>${c === 'CU' ? 'CU' : 'FES ' + c}</option>`
    ).join('');

    const isSpec = user.role === 'specialist';
    showModal('Editar Usuario', `
      <form id="edit-user-form">
        <div class="form-group" style="margin-bottom:1rem;"><label>Nombre</label><input type="text" id="edit-user-name" value="${escapeHtml(user.full_name || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Rol</label>
          <select id="edit-user-role" style="width:100%;padding:0.5rem;" onchange="document.getElementById('edit-spec-fields').style.display = this.value === 'specialist' ? 'block':'none';">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
            <option value="specialist" ${user.role === 'specialist' ? 'selected' : ''}>Especialista</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Estatus Académico</label>
          <select id="edit-user-status" style="width:100%;padding:0.5rem;">${statusSelect}</select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>No. Cuenta</label><input type="text" id="edit-user-cuenta" value="${escapeHtml(user.account_number || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Campus</label>
          <select id="edit-user-campus" style="width:100%;padding:0.5rem;">${campusSelect}</select>
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
      const { error: updateError } = await sb.from('user_profiles').update({
        full_name: document.getElementById('edit-user-name').value.trim(),
        role: document.getElementById('edit-user-role').value,
        academic_status: document.getElementById('edit-user-status').value,
        account_number: document.getElementById('edit-user-cuenta').value.trim() || null,
        campus: document.getElementById('edit-user-campus').value,
        telegram_chat_id: document.getElementById('edit-user-telegram').value.trim() || null,
        specialty: document.getElementById('edit-user-specialty')?.value.trim() || null,
        department: document.getElementById('edit-user-department')?.value.trim() || null,
        contact_info: document.getElementById('edit-user-contact')?.value.trim() || null,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
      if (updateError) { showToast('Error: ' + updateError.message, 'error'); return; }
      showToast('Usuario actualizado', 'success');
      closeModal();
      loadAdminUsers();
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- TREES ----
async function loadAdminTrees() {
  // Populate the garden dropdown for the create form
  populateGardenDropdown('admin-tree-garden');
  try {
    const { data, error } = await sb.from('trees_catalog').select('*').order('tree_code');
    if (error) throw error;
    const tbody = document.getElementById('trees-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (data || []).forEach(tree => {
      const row = document.createElement('tr');
      const statusLabel = TREE_STATUS_LABELS[tree.status] || tree.status || '—';
      const hasLocation = tree.location_lat != null && tree.location_lng != null;
      row.innerHTML = `
        <td>${escapeHtml(tree.tree_code || '-')}</td>
        <td>${escapeHtml(tree.species || '-')}</td>
        <td>${escapeHtml(tree.campus || '-')}</td>
        <td>
          <span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${escapeHtml(statusLabel)}</span>
          ${hasLocation ? '<span title="Ubicación capturada" style="margin-left:4px;">📍</span>' : '<span title="Sin ubicación — se capturará en primer seguimiento" style="margin-left:4px;opacity:0.4;">📍</span>'}
        </td>
        <td>${tree.health_score || 0}%</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editAdminTree(${tree.id})" title="Editar">✏️</button>
          <button class="btn btn-sm" style="background:#0288d1;color:white;" onclick="showTreeQR(${tree.id}, '${escapeHtml(tree.tree_code)}', '${escapeHtml(tree.common_name || '')}')" title="QR">📱</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAdminTree(${tree.id})" title="Eliminar">🗑️</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando árboles: ' + err.message, 'error');
  }
}

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
    created_by: currentUser?.id
  };
  if (!tree.tree_code || !tree.species) { showToast('Código y especie son requeridos', 'error'); return; }
  if (!TREE_STATUS_VALUES.includes(tree.status)) { showToast('Estado inválido', 'error'); return; }
  if (!TREE_TYPE_VALUES.includes(tree.tree_type)) { showToast('Tipo inválido', 'error'); return; }
  if (!TREE_SIZE_VALUES.includes(tree.size)) { showToast('Tamaño inválido', 'error'); return; }

  try {
    const { error } = await sb.from('trees_catalog').insert([tree]);
    if (error) throw error;
    showToast('Árbol agregado al inventario. La ubicación exacta se capturará en el primer seguimiento del usuario asignado.', 'success');
    document.getElementById('form-admin-tree')?.reset();
    loadAdminTrees();
    populateGardenDropdown('admin-tree-garden');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function editAdminTree(treeId) {
  const { data: tree } = await sb.from('trees_catalog').select('*').eq('id', treeId).single();
  if (!tree) return;

  const { data: gardens } = await sb.from('gardens').select('id, name, campus').order('name');
  const gardenOpts = '<option value="">— Sin jardín —</option>' +
    (gardens || []).map(g =>
      `<option value="${g.id}" ${tree.garden_id === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${escapeHtml(g.campus || '—')})</option>`
    ).join('');

  const statusOpts = TREE_STATUS_VALUES.map(s =>
    `<option value="${s}" ${tree.status === s ? 'selected' : ''}>${TREE_STATUS_LABELS[s]}</option>`).join('');
  const typeOpts = TREE_TYPE_VALUES.map(s =>
    `<option value="${s}" ${tree.tree_type === s ? 'selected' : ''}>${TREE_TYPE_LABELS[s]}</option>`).join('');
  const sizeOpts = TREE_SIZE_VALUES.map(s =>
    `<option value="${s}" ${tree.size === s ? 'selected' : ''}>${TREE_SIZE_LABELS[s]}</option>`).join('');
  const campusOpts = ['Iztacala','Acatlan','Aragon','Cuautitlan','Zaragoza','CU'].map(c =>
    `<option value="${c}" ${tree.campus === c ? 'selected' : ''}>${c === 'CU' ? 'CU' : 'FES ' + c}</option>`).join('');

  showModal('Editar Árbol', `
    <form id="edit-tree-form">
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Código</label><input type="text" id="edit-tree-code" value="${escapeHtml(tree.tree_code || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Especie</label><input type="text" id="edit-tree-species" value="${escapeHtml(tree.species || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Nombre Común</label><input type="text" id="edit-tree-common" value="${escapeHtml(tree.common_name || '')}" style="width:100%;padding:0.5rem;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Tipo</label><select id="edit-tree-type" style="width:100%;padding:0.5rem;">${typeOpts}</select></div>
        <div class="form-group"><label>Tamaño</label><select id="edit-tree-size" style="width:100%;padding:0.5rem;">${sizeOpts}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Campus</label><select id="edit-tree-campus" style="width:100%;padding:0.5rem;">${campusOpts}</select></div>
        <div class="form-group"><label>Jardín</label><select id="edit-tree-garden" style="width:100%;padding:0.5rem;">${gardenOpts}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        <div class="form-group"><label>Latitud (capturada en seguimiento)</label><input type="number" step="any" id="edit-tree-lat" value="${tree.location_lat || ''}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group"><label>Longitud (capturada en seguimiento)</label><input type="number" step="any" id="edit-tree-lng" value="${tree.location_lng || ''}" style="width:100%;padding:0.5rem;"></div>
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
  document.getElementById('edit-tree-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('trees_catalog').update({
      tree_code: document.getElementById('edit-tree-code').value.trim(),
      species: document.getElementById('edit-tree-species').value.trim(),
      common_name: document.getElementById('edit-tree-common').value.trim() || null,
      tree_type: document.getElementById('edit-tree-type').value,
      size: document.getElementById('edit-tree-size').value,
      campus: document.getElementById('edit-tree-campus').value,
      garden_id: document.getElementById('edit-tree-garden').value || null,
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
  if (!confirm('¿Eliminar este árbol?')) return;
  const { error } = await sb.from('trees_catalog').delete().eq('id', treeId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Árbol eliminado', 'success');
  loadAdminTrees();
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

async function loadAdminGardens() {
  // Populate the specialist dropdown for garden create form
  populateSpecialistDropdown('admin-garden-specialist');
  try {
    const { data, error } = await sb.from('gardens').select('*').order('name');
    if (error) throw error;
    const tbody = document.getElementById('gardens-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (data || []).forEach(g => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.campus || '-')}</td>
        <td>${g.location_lat != null ? g.location_lat + ', ' + g.location_lng : '<span class="text-muted">—</span>'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editAdminGarden('${g.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAdminGarden('${g.id}')">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando jardines: ' + err.message, 'error');
  }
}

async function saveAdminGarden(e) {
  if (e) e.preventDefault();
  const soil = document.getElementById('admin-garden-soil')?.value || null;
  const irrigation = document.getElementById('admin-garden-irrigation')?.value || null;
  const exposure = document.getElementById('admin-garden-exposure')?.value || null;

  if (soil && !GARDEN_SOIL_VALUES.includes(soil)) { showToast('Tipo de suelo inválido', 'error'); return; }
  if (irrigation && !GARDEN_IRRIGATION_VALUES.includes(irrigation)) { showToast('Riego inválido', 'error'); return; }
  if (exposure && !GARDEN_EXPOSURE_VALUES.includes(exposure)) { showToast('Exposición inválida', 'error'); return; }

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
    notes: document.getElementById('admin-garden-notes')?.value.trim() || null
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

async function editAdminGarden(id) {
  const { data: g } = await sb.from('gardens').select('*').eq('id', id).single();
  if (!g) return;
  const { data: specialists } = await sb.from('user_profiles')
    .select('id, full_name, specialty').eq('role','specialist').order('full_name');
  const specOpts = '<option value="">— Sin asignar —</option>' +
    (specialists || []).map(s =>
      `<option value="${s.id}" ${g.responsible_specialist_id === s.id ? 'selected' : ''}>${escapeHtml(s.full_name)}${s.specialty ? ' — ' + escapeHtml(s.specialty) : ''}</option>`
    ).join('');
  const campusOpts = ['Iztacala','Acatlan','Aragon','Cuautitlan','Zaragoza','CU'].map(c =>
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
  if (!confirm('¿Eliminar este jardín?')) return;
  const { error } = await sb.from('gardens').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Jardín eliminado', 'success');
  loadAdminGardens();
}

// ---- GROUPS ----
async function loadAdminGroups() {
  try {
    const { data, error } = await sb.from('user_groups').select('*, group_members(count)').order('name');
    if (error) throw error;
    const tbody = document.getElementById('groups-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (data || []).forEach(g => {
      const memberCount = g.group_members?.[0]?.count || 0;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.description || '-')}</td>
        <td>${memberCount}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="manageGroupMembers('${g.id}', '${escapeHtml(g.name)}')">Miembros</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAdminGroup('${g.id}')">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando grupos: ' + err.message, 'error');
  }
}

async function saveAdminGroup(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('admin-group-name')?.value.trim();
  const desc = document.getElementById('admin-group-desc')?.value.trim();
  if (!name) { showToast('Nombre requerido', 'error'); return; }
  const { error } = await sb.from('user_groups').insert([{ name, description: desc, created_by: currentUser?.id }]);
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
    const { data: members } = await sb.from('group_members').select('*, user_profiles(full_name)').eq('group_id', groupId);
    const { data: allUsers } = await sb.from('user_profiles').select('id, full_name').order('full_name');
    const memberIds = (members || []).map(m => m.user_id);

    let membersHtml = (members || []).map(m =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;">
        <span>${escapeHtml(m.user_profiles?.full_name || 'Usuario')}</span>
        <button onclick="removeGroupMember('${groupId}', '${m.user_id}', '${escapeHtml(groupName)}')" class="btn btn-sm btn-danger">Quitar</button>
      </div>`
    ).join('') || '<p class="text-muted" style="padding:8px;">Sin miembros</p>';

    let optionsHtml = (allUsers || []).filter(u => !memberIds.includes(u.id))
      .map(u => `<option value="${u.id}">${escapeHtml(u.full_name || 'Sin nombre')}</option>`).join('');

    showModal(`Miembros: ${groupName}`, `
      <div style="margin-bottom:1.5rem;">
        <h4>Miembros (${(members || []).length})</h4>
        <div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:8px;margin-top:0.5rem;">${membersHtml}</div>
      </div>
      <div>
        <h4>Agregar miembro</h4>
        <div style="display:flex;gap:8px;margin-top:0.5rem;">
          <select id="add-member-select" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;">
            <option value="">Selecciona usuario...</option>${optionsHtml}
          </select>
          <button onclick="addGroupMember('${groupId}', '${escapeHtml(groupName)}')" class="btn btn-primary btn-sm">Agregar</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function addGroupMember(groupId, groupName) {
  const userId = document.getElementById('add-member-select')?.value;
  if (!userId) { showToast('Selecciona un usuario', 'warning'); return; }
  const { error } = await sb.from('group_members').insert([{ group_id: groupId, user_id: userId }]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
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

    const { data: history } = await sb.from('notifications').select('*').order('sent_at', { ascending: false }).limit(20);
    const historyBody = document.getElementById('notificationsTableBody');
    if (historyBody) {
      historyBody.innerHTML = '';
      (history || []).forEach(n => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${escapeHtml(n.title || '-')}</td>
          <td>${n.target_user_id ? 'Usuario' : n.target_group_id ? 'Grupo' : 'Todos'}</td>
          <td>${formatDate(n.sent_at)}</td>
          <td>${n.telegram_sent ? '✅' : '⏳'}</td>
        `;
        historyBody.appendChild(row);
      });
    }
  } catch (err) {
    showToast('Error cargando notificaciones: ' + err.message, 'error');
  }
}

async function sendNotification(e) {
  if (e) e.preventDefault();
  const title = document.getElementById('notif-title')?.value.trim();
  const message = document.getElementById('notif-message')?.value.trim();
  const targetType = document.getElementById('notif-target-type')?.value;
  const targetValue = document.getElementById('notifUser')?.value;
  const sendTelegram = document.getElementById('notif-send-telegram')?.checked;
  const notificationType = document.getElementById('notif-type')?.value || 'info';

  if (!title || !message) { showToast('Título y mensaje son requeridos', 'error'); return; }

  try {
    // Parse target into clean ids
    let targetUserId = null, targetGroupId = null;
    if (targetType === 'user' && targetValue) {
      targetUserId = targetValue.replace(/^(user|group):/, '');
    } else if (targetType === 'group' && targetValue) {
      targetGroupId = targetValue.replace(/^(user|group):/, '');
    }

    // If Telegram is requested, the Edge Function handles BOTH the BD insert
    // (per-recipient notification rows with telegram_sent flag) AND the actual
    // Telegram delivery. Otherwise fall back to a single in-app notification row.
    if (sendTelegram) {
      const payload = { title, message, notificationType };
      if (targetGroupId) payload.groupId = targetGroupId;
      else if (targetUserId) payload.userId = targetUserId;
      else payload.broadcast = true;

      const { data, error } = await sb.functions.invoke('send-telegram-notification', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sent = data?.sent || 0, failed = data?.failed || 0, total = data?.recipients_total || 0;
      showToast(`Telegram: ${sent}/${total} entregados${failed ? ' (' + failed + ' fallidos)' : ''}`, sent > 0 ? 'success' : 'warning');
    } else {
      // In-app only: single notification row
      const notifData = {
        title, message,
        sender_id: currentUser?.id || null,
        notification_type: notificationType,
        target_user_id: targetUserId,
        target_group_id: targetGroupId,
        sent_at: new Date().toISOString()
      };
      const { error } = await sb.from('notifications').insert([notifData]);
      if (error) throw error;
      showToast('Notificación enviada (en-app)', 'success');
    }

    document.getElementById('form-notification')?.reset();
    const userField = document.getElementById('notif-user-field');
    if (userField) userField.style.display = 'none';
    loadAdminNotifications();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- ASSIGNMENTS TAB ----
async function loadAssignments() {
  try {
    // Populate dropdowns
    const { data: users } = await sb.from('user_profiles').select('id, full_name').order('full_name');
    const { data: groups } = await sb.from('user_groups').select('id, name').order('name');
    const { data: trees } = await sb.from('trees_catalog').select('id, tree_code, common_name, species').order('tree_code');
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

    // Tree dropdown
    const treeSelect = document.getElementById('assign-tree');
    if (treeSelect) {
      treeSelect.innerHTML = '<option value="">Selecciona árbol...</option>';
      (trees || []).forEach(t => {
        const isAssigned = assignedTreeIds.has(t.id);
        const suffix = isAssigned ? ' (Ya asignado)' : '';
        const disabled = isAssigned ? 'disabled' : '';
        treeSelect.innerHTML += `<option value="${t.id}" ${disabled}>${escapeHtml(t.tree_code)} - ${escapeHtml(t.common_name || t.species)}${suffix}</option>`;
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
      const { data: td } = await sb.from('trees_catalog').select('id, tree_code, common_name').in('id', taTreeIds);
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

    const treeBody = document.getElementById('tree-assignments-body');
    if (treeBody) {
      treeBody.innerHTML = '';
      (treeAssignments || []).forEach(a => {
        const row = document.createElement('tr');
        const tree = taTreeMap[a.tree_id] || {};
        const targetName = a.user_id ? (taUserMap[a.user_id]?.full_name || 'Usuario') : (taGroupMap[a.group_id]?.name || 'Grupo');
        const type = a.user_id ? 'Usuario' : 'Grupo';
        const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';

        // Extract specialist from notes if it exists
        let specialist = '-';
        if (a.notes && a.notes.startsWith('[ESPECIALISTA:')) {
          const match = a.notes.match(/\[ESPECIALISTA:\s*([^\]]+)\]/);
          if (match) specialist = escapeHtml(match[1].trim());
        }

        row.innerHTML = `
          <td>🌳 ${escapeHtml(tree.tree_code || '-')} - ${escapeHtml(tree.common_name || '')}</td>
          <td>${escapeHtml(targetName)}</td>
          <td><span class="assignment-badge ${badgeClass}">${type}</span></td>
          <td>${specialist}</td>
          <td>${formatDate(a.assigned_at)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="removeTreeAssignment('${a.id}')">Quitar</button></td>
        `;
        treeBody.appendChild(row);
      });
      if (!treeAssignments || treeAssignments.length === 0) {
        treeBody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:2rem;">Sin asignaciones de árboles</td></tr>';
      }
    }

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

    const gardenBody = document.getElementById('garden-assignments-body');
    if (gardenBody) {
      gardenBody.innerHTML = '';
      (gardenAssignments || []).forEach(a => {
        const garden = gaGardenMap[a.garden_id] || {};
        const targetName = a.user_id ? (gaUserMap[a.user_id]?.full_name || 'Usuario') : (gaGroupMap[a.group_id]?.name || 'Grupo');
        const type = a.user_id ? 'Usuario' : 'Grupo';
        const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>🌿 ${escapeHtml(garden.name || '-')} (${escapeHtml(garden.campus || '')})</td>
          <td>${escapeHtml(targetName)}</td>
          <td><span class="assignment-badge ${badgeClass}">${type}</span></td>
          <td>${formatDate(a.assigned_at)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="removeGardenAssignment('${a.id}')">Quitar</button></td>
        `;
        gardenBody.appendChild(row);
      });
      if (!gardenAssignments || gardenAssignments.length === 0) {
        gardenBody.innerHTML = '<tr><td colspan="5" class="text-muted text-center" style="padding:2rem;">Sin asignaciones de jardines</td></tr>';
      }
    }

  } catch (err) {
    console.error('Load assignments error:', err);
    showToast('Error cargando asignaciones: ' + err.message, 'error');
  }
}

function populateAssignTarget(typeSelectId, targetSelectId, users, groups) {
  const typeSelect = document.getElementById(typeSelectId);
  const targetSelect = document.getElementById(targetSelectId);
  if (!typeSelect || !targetSelect) return;

  const type = typeSelect.value;
  targetSelect.innerHTML = '<option value="">Selecciona...</option>';
  if (type === 'user') {
    (users || []).forEach(u => {
      targetSelect.innerHTML += `<option value="${u.id}">👤 ${escapeHtml(u.full_name || 'Sin nombre')}</option>`;
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
    finalSpecialist = specialist;
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

// ---- EXPOSE ALL ----
window.switchAdminTab = switchAdminTab;
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminUsers = loadAdminUsers;
window.saveAdminUser = saveAdminUser;
window.editAdminUser = editAdminUser;
window.loadAdminTrees = loadAdminTrees;
window.saveAdminTree = saveAdminTree;
window.editAdminTree = editAdminTree;
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
window.sendNotification = sendNotification;
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
        <button class="btn btn-primary" onclick="printTreeQR('${escapeHtml(treeCode)}','${escapeHtml(commonName || '')}')">
          <i class="fas fa-print"></i> Imprimir placa
        </button>
        <button class="btn btn-outline" onclick="downloadQR('qr-canvas-tree','${escapeHtml(treeCode)}')">
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
async function loadAuditLog() {
  const container = document.getElementById('audit-log-container');
  if (!container) return;
  try {
    const { data, error } = await sb.from('audit_log')
      .select('*').order('occurred_at', { ascending: false }).limit(100);
    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">Sin eventos registrados.</p>';
      return;
    }
    let html = '<table class="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Row ID</th></tr></thead><tbody>';
    data.forEach(e => {
      const color = e.action === 'delete' ? '#f44336' : e.action === 'update' ? '#FFC107' : '#4CAF50';
      html += `<tr>
        <td>${formatDate(e.occurred_at)}</td>
        <td>${escapeHtml(e.actor_email || '—')}</td>
        <td><span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:0.8rem;">${e.action}</span></td>
        <td>${escapeHtml(e.table_name)}</td>
        <td>${escapeHtml(e.row_id || '')}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="text-danger">Error: ${escapeHtml(err.message)}</p>`;
  }
}

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
    container.innerHTML = `<p class="text-small text-muted">Sin clima (${err.message})</p>`;
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
      heatmap: 'Mapa de calor por salud. Zonas cálidas = árboles sanos, zonas frías = árboles en riesgo.'
    };
    desc.textContent = texts[which] || '';
  }

  const trees = _lastDashboardTrees;

  // Cleanup de visualizaciones inactivas (libera memoria GPU/Leaflet)
  ['DashboardTree3D','DashboardMapa','DashboardMosaico','DashboardHeatmap'].forEach(mod => {
    if (window[mod] && window[mod].destroy) {
      try { window[mod].destroy(); } catch (e) {}
    }
  });

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
      }
    } catch (e) {
      console.warn('Vis init failed:', which, e);
    }
  }, 50);
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
