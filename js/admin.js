// ============================================================================
// ADMIN - Dashboard, Users, Trees, Gardens, Groups, Notifications CRUD
// ============================================================================

// ---- TAB SWITCHING ----
function switchAdminTab(tabName) {
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });

  const content = document.getElementById(tabName + 'Tab');
  if (content) {
    content.style.display = 'block';
    content.classList.add('active');

    if (tabName === 'users') loadAdminUsers();
    else if (tabName === 'trees') loadAdminTrees();
    else if (tabName === 'gardens') loadAdminGardens();
    else if (tabName === 'groups') loadAdminGroups();
    else if (tabName === 'notifications') loadAdminNotifications();
    else if (tabName === 'dashboard') loadAdminDashboard();
  }

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) tab.classList.add('active');
  });
}

// ---- DASHBOARD ----
async function loadAdminDashboard() {
  try {
    const { count: userCount } = await sb.from('user_profiles').select('*', { count: 'exact', head: true });
    const { count: treeCount } = await sb.from('trees_catalog').select('*', { count: 'exact', head: true });
    const { data: trees } = await sb.from('trees_catalog').select('health_score, status, campus');

    const treeList = trees || [];
    const avgHealth = treeList.length > 0
      ? Math.round(treeList.reduce((sum, t) => sum + (t.health_score || 0), 0) / treeList.length) : 0;

    const statsEl = document.getElementById('dashboard-stats');
    if (statsEl) {
      statsEl.innerHTML = '<div class="card" style="text-align:center;"><div style="font-size:2rem;">&#x1F465;</div><h3>' + (userCount || 0) + '</h3><p class="text-muted">Usuarios</p></div>' +
        '<div class="card" style="text-align:center;"><div style="font-size:2rem;">&#x1F333;</div><h3>' + (treeCount || 0) + '</h3><p class="text-muted">Árboles</p></div>' +
        '<div class="card" style="text-align:center;"><div style="font-size:2rem;">&#x1F49A;</div><h3>' + avgHealth + '%</h3><p class="text-muted">Salud Promedio</p></div>';
    }

    // Destroy previous charts
    if (typeof Chart !== 'undefined') {
      Object.values(Chart.instances || {}).forEach(c => c.destroy());
    }

    if (treeList.length > 0) {
      const statusCounts = {};
      treeList.forEach(t => { statusCounts[t.status || 'activo'] = (statusCounts[t.status || 'activo'] || 0) + 1; });

      const healthCtx = document.getElementById('chart-health');
      if (healthCtx) {
        const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
        treeList.forEach(t => {
          const s = t.health_score || 0;
          if (s <= 20) buckets['0-20']++;
          else if (s <= 40) buckets['21-40']++;
          else if (s <= 60) buckets['41-60']++;
          else if (s <= 80) buckets['61-80']++;
          else buckets['81-100']++;
        });
        new Chart(healthCtx, { type: 'bar', data: { labels: Object.keys(buckets), datasets: [{ label: 'Salud', data: Object.values(buckets), backgroundColor: '#4CAF50' }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
      }

      const statusCtx = document.getElementById('chart-status');
      if (statusCtx) {
        new Chart(statusCtx, { type: 'doughnut', data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#4CAF50', '#FFC107', '#f44336', '#2196F3'] }] }, options: { responsive: true } });
      }
    }

    showToast('Dashboard cargado', 'success');
  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Error cargando dashboard: ' + err.message, 'error');
  }
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
      row.innerHTML = '<td>' + escapeHtml(user.full_name) + '</td>' +
        '<td>' + escapeHtml(user.email || '-') + '</td>' +
        '<td>' + escapeHtml(user.account_number || '-') + '</td>' +
        '<td><span class="badge badge-primary">' + user.role + '</span></td>' +
        '<td>' + escapeHtml(user.campus || '-') + '</td>' +
        '<td><button class="btn btn-sm btn-secondary" onclick="editAdminUser(\'' + user.id + '\')">Editar</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteAdminUser(\'' + user.id + '\', \'' + escapeHtml(user.full_name) + '\')">Eliminar</button></td>';
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading users:', err);
    showToast('Error cargando usuarios: ' + err.message, 'error');
  }
}

async function saveAdminUser(e) {
  if (e) e.preventDefault();
  const nombre = document.getElementById('admin-user-nombre')?.value.trim();
  const correo = document.getElementById('admin-user-correo')?.value.trim();
  const password = document.getElementById('admin-user-password')?.value.trim();
  const numCuenta = document.getElementById('admin-user-num-cuenta')?.value.trim();
  const fechaNac = document.getElementById('admin-user-fecha-nacimiento')?.value;
  const estatus = document.getElementById('admin-user-estatus')?.value;
  const role = document.getElementById('admin-user-role')?.value || 'user';

  if (!nombre || !correo) {
    showToast('Nombre y correo son requeridos', 'error');
    return;
  }

  try {
    const { data: { session } } = await sb.auth.getSession();

    const response = await fetch(ADMIN_USERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({
        action: 'create',
        email: correo,
        password: password || 'TempPass2026!',
        full_name: nombre,
        role: role,
        account_number: numCuenta,
        birth_date: fechaNac,
        academic_status: estatus
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error ' + response.status);
    }

    showToast('Usuario creado exitosamente', 'success');
    document.getElementById('form-admin-user')?.reset();
    loadAdminUsers();
  } catch (err) {
    console.error('Error creating user:', err);
    showToast('Error creando usuario: ' + err.message, 'error');
  }
}

async function editAdminUser(userId) {
  try {
    const { data: user, error } = await sb.from('user_profiles').select('*').eq('id', userId).single();
    if (error) throw error;

    showModal('Editar Usuario', '<form id="edit-user-form">' +
      '<div class="form-group"><label>Nombre</label><input type="text" id="edit-user-name" value="' + escapeHtml(user.full_name || '') + '" style="width:100%;padding:0.5rem;"></div>' +
      '<div class="form-group"><label>Rol</label><select id="edit-user-role" style="width:100%;padding:0.5rem;">' +
        '<option value="user"' + (user.role === 'user' ? ' selected' : '') + '>Usuario</option>' +
        '<option value="specialist"' + (user.role === 'specialist' ? ' selected' : '') + '>Especialista</option>' +
        '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>Administrador</option></select></div>' +
      '<div class="form-group"><label>Número de Cuenta</label><input type="text" id="edit-user-cuenta" value="' + escapeHtml(user.account_number || '') + '" style="width:100%;padding:0.5rem;"></div>' +
      '<div class="form-group"><label>Campus</label><input type="text" id="edit-user-campus" value="' + escapeHtml(user.campus || '') + '" style="width:100%;padding:0.5rem;"></div>' +
      '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:1rem;">Guardar Cambios</button></form>');

    document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const updates = {
        full_name: document.getElementById('edit-user-name').value.trim(),
        role: document.getElementById('edit-user-role').value,
        account_number: document.getElementById('edit-user-cuenta').value.trim(),
        campus: document.getElementById('edit-user-campus').value.trim()
      };

      const { error: updateError } = await sb.from('user_profiles').update(updates).eq('id', userId);
      if (updateError) {
        showToast('Error actualizando: ' + updateError.message, 'error');
        return;
      }
      showToast('Usuario actualizado', 'success');
      closeModal();
      loadAdminUsers();
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteAdminUser(userId, name) {
  if (!confirm('¿Eliminar al usuario "' + name + '"? Esta acción no se puede deshacer.')) return;
  try {
    const { error } = await sb.from('user_profiles').delete().eq('id', userId);
    if (error) throw error;
    showToast('Usuario eliminado', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast('Error eliminando: ' + err.message, 'error');
  }
}

// ---- TREES ----
async function loadAdminTrees() {
  try {
    const { data, error } = await sb.from('trees_catalog').select('*').order('code');
    if (error) throw error;

    const tbody = document.getElementById('trees-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    (data || []).forEach(tree => {
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + escapeHtml(tree.code) + '</td>' +
        '<td>' + escapeHtml(tree.species) + '</td>' +
        '<td>' + escapeHtml(tree.common_name || '-') + '</td>' +
        '<td>' + escapeHtml(tree.campus || '-') + '</td>' +
        '<td><span class="badge badge-' + (tree.status === 'saludable' ? 'success' : 'warning') + '">' + (tree.status || '-') + '</span></td>' +
        '<td>' + (tree.health_score || 0) + '</td>' +
        '<td><button class="btn btn-sm btn-secondary" onclick="editAdminTree(\'' + tree.id + '\')">Editar</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteAdminTree(\'' + tree.id + '\')">Eliminar</button></td>';
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando árboles: ' + err.message, 'error');
  }
}

async function saveAdminTree(e) {
  if (e) e.preventDefault();
  const tree = {
    code: document.getElementById('admin-tree-code')?.value.trim(),
    species: document.getElementById('admin-tree-species')?.value.trim(),
    common_name: document.getElementById('admin-tree-common-name')?.value.trim(),
    tree_type: document.getElementById('admin-tree-type')?.value,
    size: document.getElementById('admin-tree-size')?.value,
    campus: document.getElementById('admin-tree-campus')?.value.trim(),
    garden: document.getElementById('admin-tree-garden')?.value.trim(),
    location: document.getElementById('admin-tree-location')?.value.trim(),
    status: document.getElementById('admin-tree-status')?.value,
    health_score: parseInt(document.getElementById('admin-tree-health')?.value) || 80
  };

  if (!tree.code || !tree.species) {
    showToast('Código y especie son requeridos', 'error');
    return;
  }

  try {
    const { error } = await sb.from('trees_catalog').insert([tree]);
    if (error) throw error;
    showToast('Árbol agregado', 'success');
    document.getElementById('form-admin-tree')?.reset();
    loadAdminTrees();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function editAdminTree(treeId) {
  const { data: tree } = await sb.from('trees_catalog').select('*').eq('id', treeId).single();
  if (!tree) return;

  showModal('Editar Árbol', '<form id="edit-tree-form">' +
    '<div class="form-group"><label>Código</label><input type="text" id="edit-tree-code" value="' + escapeHtml(tree.code) + '" style="width:100%;padding:0.5rem;"></div>' +
    '<div class="form-group"><label>Especie</label><input type="text" id="edit-tree-species" value="' + escapeHtml(tree.species) + '" style="width:100%;padding:0.5rem;"></div>' +
    '<div class="form-group"><label>Nombre Común</label><input type="text" id="edit-tree-common" value="' + escapeHtml(tree.common_name || '') + '" style="width:100%;padding:0.5rem;"></div>' +
    '<div class="form-group"><label>Salud (0-100)</label><input type="number" id="edit-tree-health" value="' + (tree.health_score || 0) + '" min="0" max="100" style="width:100%;padding:0.5rem;"></div>' +
    '<div class="form-group"><label>Estado</label><select id="edit-tree-status" style="width:100%;padding:0.5rem;">' +
      '<option value="saludable"' + (tree.status === 'saludable' ? ' selected' : '') + '>Saludable</option>' +
      '<option value="enfermo"' + (tree.status === 'enfermo' ? ' selected' : '') + '>Enfermo</option>' +
      '<option value="en-riesgo"' + (tree.status === 'en-riesgo' ? ' selected' : '') + '>En Riesgo</option></select></div>' +
    '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:1rem;">Guardar</button></form>');

  document.getElementById('edit-tree-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('trees_catalog').update({
      code: document.getElementById('edit-tree-code').value.trim(),
      species: document.getElementById('edit-tree-species').value.trim(),
      common_name: document.getElementById('edit-tree-common').value.trim(),
      health_score: parseInt(document.getElementById('edit-tree-health').value) || 0,
      status: document.getElementById('edit-tree-status').value
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
async function loadAdminGardens() {
  try {
    const { data, error } = await sb.from('gardens').select('*').order('name');
    if (error) throw error;

    const tbody = document.getElementById('gardens-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    (data || []).forEach(g => {
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + escapeHtml(g.name) + '</td>' +
        '<td>' + escapeHtml(g.campus || '-') + '</td>' +
        '<td>' + (g.latitude || '-') + ', ' + (g.longitude || '-') + '</td>' +
        '<td>' + escapeHtml(g.description || '-') + '</td>' +
        '<td><button class="btn btn-sm btn-secondary" onclick="editAdminGarden(\'' + g.id + '\')">Editar</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteAdminGarden(\'' + g.id + '\')">Eliminar</button></td>';
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando jardines: ' + err.message, 'error');
  }
}

async function saveAdminGarden(e) {
  if (e) e.preventDefault();
  const garden = {
    name: document.getElementById('admin-garden-name')?.value.trim(),
    campus: document.getElementById('admin-garden-campus')?.value.trim(),
    latitude: parseFloat(document.getElementById('admin-garden-lat')?.value) || null,
    longitude: parseFloat(document.getElementById('admin-garden-lng')?.value) || null,
    description: document.getElementById('admin-garden-desc')?.value.trim()
  };
  if (!garden.name) { showToast('Nombre requerido', 'error'); return; }

  const { error } = await sb.from('gardens').insert([garden]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Jardín creado', 'success');
  document.getElementById('form-admin-garden')?.reset();
  loadAdminGardens();
}

async function editAdminGarden(id) {
  const { data: g } = await sb.from('gardens').select('*').eq('id', id).single();
  if (!g) return;
  showModal('Editar Jardín', '<form id="edit-garden-form">' +
    '<div class="form-group"><label>Nombre</label><input type="text" id="edit-garden-name" value="' + escapeHtml(g.name) + '" style="width:100%;padding:0.5rem;"></div>' +
    '<div class="form-group"><label>Campus</label><input type="text" id="edit-garden-campus" value="' + escapeHtml(g.campus || '') + '" style="width:100%;padding:0.5rem;"></div>' +
    '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:1rem;">Guardar</button></form>');
  document.getElementById('edit-garden-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('gardens').update({
      name: document.getElementById('edit-garden-name').value.trim(),
      campus: document.getElementById('edit-garden-campus').value.trim()
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
    const { data, error } = await sb.from('groups').select('*, group_members(count)').order('name');
    if (error) throw error;

    const tbody = document.getElementById('groups-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    (data || []).forEach(g => {
      const memberCount = g.group_members?.[0]?.count || 0;
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + escapeHtml(g.name) + '</td>' +
        '<td>' + escapeHtml(g.description || '-') + '</td>' +
        '<td>' + memberCount + '</td>' +
        '<td><button class="btn btn-sm btn-secondary" onclick="manageGroupMembers(\'' + g.id + '\', \'' + escapeHtml(g.name) + '\')">Miembros</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteAdminGroup(\'' + g.id + '\')">Eliminar</button></td>';
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

  const { error } = await sb.from('groups').insert([{ name, description: desc }]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Grupo creado', 'success');
  document.getElementById('form-admin-group')?.reset();
  loadAdminGroups();
}

async function deleteAdminGroup(id) {
  if (!confirm('¿Eliminar este grupo y todos sus miembros?')) return;
  try {
    await sb.from('group_members').delete().eq('group_id', id);
    const { error } = await sb.from('groups').delete().eq('id', id);
    if (error) throw error;
    showToast('Grupo eliminado', 'success');
    loadAdminGroups();
  } catch (err) {
    showToast('Error eliminando grupo: ' + err.message, 'error');
  }
}

async function manageGroupMembers(groupId, groupName) {
  try {
    const { data: members } = await sb
      .from('group_members')
      .select('*, user_profiles(full_name, email)')
      .eq('group_id', groupId);

    const { data: allUsers } = await sb.from('user_profiles').select('id, full_name, email').order('full_name');

    const memberIds = (members || []).map(m => m.user_id);

    let membersHtml = (members || []).map(m =>
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;">' +
        '<span>' + escapeHtml(m.user_profiles?.full_name || 'Usuario') + '</span>' +
        '<button onclick="removeGroupMember(\'' + groupId + '\', \'' + m.user_id + '\', \'' + escapeHtml(groupName) + '\')" class="btn btn-sm btn-danger">Quitar</button>' +
      '</div>'
    ).join('');

    if (!membersHtml) membersHtml = '<p class="text-muted">No hay miembros en este grupo</p>';

    let optionsHtml = (allUsers || [])
      .filter(u => !memberIds.includes(u.id))
      .map(u => '<option value="' + u.id + '">' + escapeHtml(u.full_name) + ' (' + escapeHtml(u.email || '') + ')</option>')
      .join('');

    showModal('Miembros: ' + groupName, '<div style="margin-bottom:1.5rem;">' +
      '<h4>Miembros actuales (' + (members || []).length + ')</h4>' +
      '<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:8px;margin-top:0.5rem;">' +
        membersHtml + '</div></div>' +
      '<div><h4>Agregar miembro</h4>' +
      '<div style="display:flex;gap:8px;margin-top:0.5rem;">' +
        '<select id="add-member-select" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;">' +
          '<option value="">Selecciona usuario...</option>' + optionsHtml + '</select>' +
        '<button onclick="addGroupMember(\'' + groupId + '\', \'' + escapeHtml(groupName) + '\')" class="btn btn-primary btn-sm">Agregar</button>' +
      '</div></div>');
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

// ---- NOTIFICATIONS ----
async function loadAdminNotifications() {
  try {
    const { data: groups } = await sb.from('groups').select('id, name').order('name');
    const { data: users } = await sb.from('user_profiles').select('id, full_name').order('full_name');

    const targetSelect = document.getElementById('notifUser');
    if (targetSelect) {
      targetSelect.innerHTML = '<option value="">Selecciona...</option>';
      (users || []).forEach(u => {
        targetSelect.innerHTML += '<option value="user:' + u.id + '">' + escapeHtml(u.full_name) + '</option>';
      });
      (groups || []).forEach(g => {
        targetSelect.innerHTML += '<option value="group:' + g.id + '">Grupo: ' + escapeHtml(g.name) + '</option>';
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
  const target = document.getElementById('notifUser')?.value;

  if (!title || !message) { showToast('Título y mensaje son requeridos', 'error'); return; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    const response = await fetch(TELEGRAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ title, message, target })
    });

    if (!response.ok) throw new Error('Error enviando notificación');
    showToast('Notificación enviada', 'success');
    document.getElementById('form-notification')?.reset();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- SPECIALIST ----
async function loadSpecialistTrees() {
  const container = document.getElementById('section-specialist');
  if (!container) return;
  container.innerHTML = '<div class="container"><h2>Panel de Especialista</h2><p class="text-muted">Funcionalidad de especialista en desarrollo.</p></div>';
}

// ---- EXPOSE ALL FUNCTIONS ----
window.switchAdminTab = switchAdminTab;
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminUsers = loadAdminUsers;
window.saveAdminUser = saveAdminUser;
window.editAdminUser = editAdminUser;
window.deleteAdminUser = deleteAdminUser;
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
window.loadSpecialistTrees = loadSpecialistTrees;
