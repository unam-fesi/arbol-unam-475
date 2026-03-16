// ============================================================================
// ADMIN - Dashboard, Users, Trees, Gardens, Groups, Notifications, Assignments
// ============================================================================

// ---- TAB SWITCHING ----
function switchAdminTab(tabName) {
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
    const { count: assignCount } = await sb.from('tree_assignments').select('*', { count: 'exact', head: true });
    const { data: trees } = await sb.from('trees_catalog').select('health_score, status, campus');
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

    // Load recent assignments for dashboard
    const { data: recentAssign } = await sb.from('tree_assignments')
      .select('*, trees_catalog(tree_code, common_name), user_profiles!tree_assignments_user_id_fkey(full_name)')
      .order('assigned_at', { ascending: false }).limit(5);

    const dashAssignEl = document.getElementById('dashboard-assignments');
    if (dashAssignEl && recentAssign && recentAssign.length > 0) {
      dashAssignEl.innerHTML = '<h4 style="margin-bottom:1rem;">Asignaciones Recientes</h4>' +
        recentAssign.map(a => `
          <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #eee;">
            <span>🌳 ${escapeHtml(a.trees_catalog?.tree_code || '-')} (${escapeHtml(a.trees_catalog?.common_name || '')})</span>
            <span>→ 👤 ${escapeHtml(a.user_profiles?.full_name || 'Grupo')}</span>
            <span class="text-muted text-small">${formatDate(a.assigned_at)}</span>
          </div>
        `).join('');
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

  try {
    const { data: signUpData, error: signUpError } = await sb.auth.signUp({
      email: correo,
      password: password,
      options: {
        data: { full_name: nombre, role: role }
      }
    });

    if (signUpError) throw signUpError;

    const newUserId = signUpData.user?.id;
    if (newUserId) {
      await sb.from('user_profiles').upsert({
        id: newUserId,
        full_name: nombre,
        role: role,
        account_number: numCuenta || null,
        birth_date: fechaNac || null,
        academic_status: estatus,
        campus: 'FES Iztacala'
      });
    }

    showToast('Usuario creado. Recibirá email de confirmación.', 'success');
    document.getElementById('form-admin-user')?.reset();
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

    const statusOptions = ['alumno', 'exalumno', 'postgrado', 'doctorante', 'profesor', 'investigador', 'administrativo'];
    const statusSelect = statusOptions.map(s =>
      `<option value="${s}" ${user.academic_status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    showModal('Editar Usuario', `
      <form id="edit-user-form">
        <div class="form-group" style="margin-bottom:1rem;"><label>Nombre</label><input type="text" id="edit-user-name" value="${escapeHtml(user.full_name || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Rol</label>
          <select id="edit-user-role" style="width:100%;padding:0.5rem;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
            <option value="specialist" ${user.role === 'specialist' ? 'selected' : ''}>Especialista</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Estatus Académico</label>
          <select id="edit-user-status" style="width:100%;padding:0.5rem;">${statusSelect}</select>
        </div>
        <div class="form-group" style="margin-bottom:1rem;"><label>No. Cuenta</label><input type="text" id="edit-user-cuenta" value="${escapeHtml(user.account_number || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Campus</label><input type="text" id="edit-user-campus" value="${escapeHtml(user.campus || '')}" style="width:100%;padding:0.5rem;"></div>
        <div class="form-group" style="margin-bottom:1rem;"><label>Telegram Chat ID</label><input type="text" id="edit-user-telegram" value="${escapeHtml(user.telegram_chat_id || '')}" style="width:100%;padding:0.5rem;"></div>
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:1rem;">Guardar</button>
      </form>
    `);

    document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const { error: updateError } = await sb.from('user_profiles').update({
        full_name: document.getElementById('edit-user-name').value.trim(),
        role: document.getElementById('edit-user-role').value,
        academic_status: document.getElementById('edit-user-status').value,
        account_number: document.getElementById('edit-user-cuenta').value.trim(),
        campus: document.getElementById('edit-user-campus').value.trim(),
        telegram_chat_id: document.getElementById('edit-user-telegram').value.trim() || null
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
  try {
    const { data, error } = await sb.from('trees_catalog').select('*').order('tree_code');
    if (error) throw error;
    const tbody = document.getElementById('trees-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    (data || []).forEach(tree => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(tree.tree_code || '-')}</td>
        <td>${escapeHtml(tree.species || '-')}</td>
        <td>${escapeHtml(tree.campus || '-')}</td>
        <td>${tree.health_score || 0}%</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editAdminTree(${tree.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAdminTree(${tree.id})">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showToast('Error cargando árboles: ' + err.message, 'error');
  }
}

async function saveAdminTree(e) {
  if (e) e.preventDefault();
  const tree = {
    tree_code: document.getElementById('admin-tree-code')?.value.trim(),
    species: document.getElementById('admin-tree-species')?.value.trim(),
    common_name: document.getElementById('admin-tree-common-name')?.value.trim(),
    tree_type: document.getElementById('admin-tree-type')?.value,
    size: document.getElementById('admin-tree-size')?.value,
    campus: document.getElementById('admin-tree-campus')?.value.trim(),
    location_desc: document.getElementById('admin-tree-location')?.value.trim(),
    status: document.getElementById('admin-tree-status')?.value,
    health_score: parseInt(document.getElementById('admin-tree-health')?.value) || 80,
    created_by: currentUser?.id
  };
  if (!tree.tree_code || !tree.species) { showToast('Código y especie son requeridos', 'error'); return; }

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
  showModal('Editar Árbol', `
    <form id="edit-tree-form">
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Código</label><input type="text" id="edit-tree-code" value="${escapeHtml(tree.tree_code || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Especie</label><input type="text" id="edit-tree-species" value="${escapeHtml(tree.species || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Nombre Común</label><input type="text" id="edit-tree-common" value="${escapeHtml(tree.common_name || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Campus</label><input type="text" id="edit-tree-campus" value="${escapeHtml(tree.campus || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Salud (0-100)</label><input type="number" id="edit-tree-health" value="${tree.health_score || 0}" min="0" max="100" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Estado</label>
        <select id="edit-tree-status" style="width:100%;padding:0.5rem;">
          <option value="healthy" ${tree.status === 'healthy' ? 'selected' : ''}>Saludable</option>
          <option value="at-risk" ${tree.status === 'at-risk' ? 'selected' : ''}>En Riesgo</option>
          <option value="critical" ${tree.status === 'critical' ? 'selected' : ''}>Crítico</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Guardar</button>
    </form>
  `);
  document.getElementById('edit-tree-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('trees_catalog').update({
      tree_code: document.getElementById('edit-tree-code').value.trim(),
      species: document.getElementById('edit-tree-species').value.trim(),
      common_name: document.getElementById('edit-tree-common').value.trim(),
      campus: document.getElementById('edit-tree-campus').value.trim(),
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
      row.innerHTML = `
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.campus || '-')}</td>
        <td>${g.location_lat ? g.location_lat + ', ' + g.location_lng : '-'}</td>
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
  const garden = {
    name: document.getElementById('admin-garden-name')?.value.trim(),
    campus: document.getElementById('admin-garden-campus')?.value.trim(),
    location_lat: parseFloat(document.getElementById('admin-garden-lat')?.value) || null,
    location_lng: parseFloat(document.getElementById('admin-garden-lng')?.value) || null,
    location_desc: document.getElementById('admin-garden-desc')?.value.trim()
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
  showModal('Editar Jardín', `
    <form id="edit-garden-form">
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Nombre</label><input type="text" id="edit-garden-name" value="${escapeHtml(g.name)}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Campus</label><input type="text" id="edit-garden-campus" value="${escapeHtml(g.campus || '')}" style="width:100%;padding:0.5rem;"></div>
      <div class="form-group" style="margin-bottom:0.75rem;"><label>Descripción</label><input type="text" id="edit-garden-desc" value="${escapeHtml(g.location_desc || '')}" style="width:100%;padding:0.5rem;"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Guardar</button>
    </form>
  `);
  document.getElementById('edit-garden-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { error } = await sb.from('gardens').update({
      name: document.getElementById('edit-garden-name').value.trim(),
      campus: document.getElementById('edit-garden-campus').value.trim(),
      location_desc: document.getElementById('edit-garden-desc').value.trim()
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

  if (!title || !message) { showToast('Título y mensaje son requeridos', 'error'); return; }

  try {
    // Build notification data - only include fields that are definitely valid
    const notifData = {
      title,
      message,
      sender_id: currentUser?.id || null
    };

    // Parse target - the select values are formatted as "user:uuid" or "group:uuid"
    if (targetType === 'user' && targetValue) {
      const uid = targetValue.replace('user:', '').replace('group:', '');
      notifData.target_user_id = uid;
    } else if (targetType === 'group' && targetValue) {
      const gid = targetValue.replace('group:', '').replace('user:', '');
      notifData.target_group_id = gid;
    }
    // When 'all', don't set target_user_id or target_group_id (both null)

    const { error } = await sb.from('notifications').insert([notifData]);
    if (error) {
      console.error('Notification insert error:', error);
      // If check constraint fails, try minimal insert
      if (error.message && error.message.includes('check')) {
        const minData = { title, message };
        if (notifData.target_user_id) minData.target_user_id = notifData.target_user_id;
        if (notifData.target_group_id) minData.target_group_id = notifData.target_group_id;
        const { error: retryErr } = await sb.from('notifications').insert([minData]);
        if (retryErr) throw retryErr;
      } else {
        throw error;
      }
    }

    showToast('Notificación enviada', 'success');
    document.getElementById('form-notification')?.reset();
    document.getElementById('notif-user-field').style.display = 'none';
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

    // Tree dropdown
    const treeSelect = document.getElementById('assign-tree');
    if (treeSelect) {
      treeSelect.innerHTML = '<option value="">Selecciona árbol...</option>';
      (trees || []).forEach(t => {
        treeSelect.innerHTML += `<option value="${t.id}">${escapeHtml(t.tree_code)} - ${escapeHtml(t.common_name || t.species)}</option>`;
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

    // Listen for type changes
    document.getElementById('assign-target-type')?.addEventListener('change', function() {
      populateAssignTarget('assign-target-type', 'assign-target', users, groups);
    });
    document.getElementById('assign-garden-target-type')?.addEventListener('change', function() {
      populateAssignTarget('assign-garden-target-type', 'assign-garden-target', users, groups);
    });

    // Load existing tree assignments
    const { data: treeAssignments } = await sb.from('tree_assignments')
      .select('*, trees_catalog(tree_code, common_name), user_profiles!tree_assignments_user_id_fkey(full_name)')
      .order('assigned_at', { ascending: false });

    const treeBody = document.getElementById('tree-assignments-body');
    if (treeBody) {
      treeBody.innerHTML = '';
      (treeAssignments || []).forEach(a => {
        const row = document.createElement('tr');
        const name = a.user_profiles?.full_name || (a.group_id ? 'Grupo' : '-');
        const type = a.user_id ? 'Usuario' : 'Grupo';
        const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';
        row.innerHTML = `
          <td>🌳 ${escapeHtml(a.trees_catalog?.tree_code || '-')} - ${escapeHtml(a.trees_catalog?.common_name || '')}</td>
          <td>${escapeHtml(name)}</td>
          <td><span class="assignment-badge ${badgeClass}">${type}</span></td>
          <td>${formatDate(a.assigned_at)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="removeTreeAssignment('${a.id}')">Quitar</button></td>
        `;
        treeBody.appendChild(row);
      });
      if (!treeAssignments || treeAssignments.length === 0) {
        treeBody.innerHTML = '<tr><td colspan="5" class="text-muted text-center" style="padding:2rem;">Sin asignaciones de árboles</td></tr>';
      }
    }

    // Load existing garden assignments
    const { data: gardenAssignments } = await sb.from('garden_assignments')
      .select('*, gardens(name, campus), user_profiles!garden_assignments_user_id_fkey(full_name)')
      .order('assigned_at', { ascending: false });

    const gardenBody = document.getElementById('garden-assignments-body');
    if (gardenBody) {
      gardenBody.innerHTML = '';
      (gardenAssignments || []).forEach(a => {
        const name = a.user_profiles?.full_name || (a.group_id ? 'Grupo' : '-');
        const type = a.user_id ? 'Usuario' : 'Grupo';
        const badgeClass = a.user_id ? 'assignment-badge-user' : 'assignment-badge-group';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>🌿 ${escapeHtml(a.gardens?.name || '-')} (${escapeHtml(a.gardens?.campus || '')})</td>
          <td>${escapeHtml(name)}</td>
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
  const notes = document.getElementById('assign-notes')?.value.trim();

  if (!targetId || !treeId) { showToast('Selecciona destinatario y árbol', 'warning'); return; }

  const data = {
    tree_id: parseInt(treeId),
    assigned_by: currentUser?.id,
    notes: notes || null
  };
  if (targetType === 'user') data.user_id = targetId;
  else data.group_id = targetId;

  try {
    const { error } = await sb.from('tree_assignments').insert([data]);
    if (error) throw error;
    showToast('Árbol asignado exitosamente', 'success');
    document.getElementById('form-assign-tree')?.reset();
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
