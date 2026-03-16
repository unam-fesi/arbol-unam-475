// ============================================================================
// MI ÁRBOL - Tree View, Care Checklist
// ============================================================================

async function loadMyTree() {
  const container = document.getElementById('section-mi-arbol');
  if (!container) return;

  try {
    // Get assigned trees for current user
    const { data: assignments, error: assignError } = await sb
      .from('tree_assignments')
      .select('tree_id')
      .eq('user_id', currentUser.id);

    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:3rem;">
          <div style="font-size:4rem; margin-bottom:1rem;">🌱</div>
          <h3>No tienes árboles asignados aún</h3>
          <p class="text-muted">Un administrador te asignará un árbol pronto. Mientras, puedes explorar las secciones de Cuidados y PUM-AI.</p>
        </div>
      `;
      return;
    }

    const treeIds = assignments.map(a => a.tree_id);
    const { data: trees, error: treeError } = await sb
      .from('trees_catalog')
      .select('*')
      .in('id', treeIds);

    if (treeError) throw treeError;

    if (!trees || trees.length === 0) {
      container.innerHTML = '<p style="padding: 20px;">Datos del árbol no encontrados.</p>';
      return;
    }

    const tree = trees[0];
    container.innerHTML = `
      <div class="container">
        <div class="tree-info">
          <div class="tree-card">
            <div class="tree-header">
              <div class="tree-icon"><i class="fas fa-tree"></i></div>
              <div class="tree-header-content">
                <h3>${escapeHtml(tree.common_name || tree.species)}</h3>
                <p class="text-small text-muted">${escapeHtml(tree.species)} | Código: ${escapeHtml(tree.code)}</p>
              </div>
            </div>
            <div class="tree-details">
              <div class="detail-item">
                <div class="detail-label">Ubicación</div>
                <div class="detail-value">${escapeHtml(tree.location || tree.campus || '-')}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Tipo</div>
                <div class="detail-value">${escapeHtml(tree.tree_type || '-')}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Estado</div>
                <div class="detail-value"><span class="badge badge-${tree.status === 'saludable' ? 'success' : 'warning'}">${escapeHtml(tree.status || 'activo')}</span></div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Salud</div>
                <div class="health-score">${tree.health_score || 0}/100</div>
              </div>
            </div>
          </div>

          <div class="tree-card">
            <h4 style="margin-bottom:1rem;">Ubicación en el mapa</h4>
            <div class="map-container" id="treeMapContainer" style="height:300px;border-radius:8px;overflow:hidden;">
            </div>
          </div>
        </div>
      </div>
    `;

    // Init map if coordinates exist
    if (tree.latitude && tree.longitude) {
      setTimeout(() => {
        const map = L.map('treeMapContainer').setView([tree.latitude, tree.longitude], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        L.marker([tree.latitude, tree.longitude])
          .addTo(map)
          .bindPopup(`<b>${tree.common_name || tree.species}</b><br>${tree.code}`)
          .openPopup();
      }, 100);
    }

  } catch (err) {
    console.error('Error loading tree:', err);
    container.innerHTML = `<p style="padding:20px;color:var(--danger);">Error cargando datos del árbol: ${err.message}</p>`;
  }
}

window.loadMyTree = loadMyTree;
