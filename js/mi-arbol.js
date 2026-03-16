// ============================================================================
// MI ÁRBOL - Tree View, Photo Upload, Measurements, Seguimiento, Metas
// ============================================================================

// Reference data (used by Información section)
const ENDEMIC_TREE_REFERENCE = [
  { species: 'Taxodium mucronatum', common_name: 'Ahuehuete', description: 'Árbol nacional de México. Conífera de gran longevidad que habita zonas ribereñas. Puede vivir más de 1,000 años.', care: 'Requiere suelo húmedo y abundante agua. Tolera suelos alcalinos. No podar ramas gruesas.', icon: '🌲' },
  { species: 'Fraxinus uhdei', common_name: 'Fresno', description: 'Árbol caducifolio nativo del centro de México, muy común en CU y campus de la UNAM. Alcanza 25-30m.', care: 'Riego moderado. Poda de formación en invierno. Vigilar cochinilla y barrenador.', icon: '🌳' },
  { species: 'Liquidambar styraciflua', common_name: 'Liquidámbar', description: 'Árbol caducifolio con hojas palmeadas que enrojecen en otoño. Originario de Mesoamérica.', care: 'Suelo ácido y bien drenado. Riego regular. Proteger de heladas fuertes en ejemplares jóvenes.', icon: '🍁' },
  { species: 'Cupressus lusitanica', common_name: 'Cedro blanco', description: 'Conífera perenne nativa de las montañas de México. Muy utilizada en reforestación urbana. Crece 15-30m.', care: 'Tolerante a sequía una vez establecido. Poda ligera. Vigilar roya y araña roja.', icon: '🌿' },
  { species: 'Quercus rugosa', common_name: 'Encino', description: 'Encino endémico de los bosques templados mexicanos. Hojas coriáceas y rugosas. Importante para la biodiversidad.', care: 'Riego moderado. No fertilizar en exceso. Respetar la hojarasca alrededor del tronco.', icon: '🍂' },
  { species: 'Buddleja cordata', common_name: 'Tepozán', description: 'Árbol nativo del Valle de México, muy resistente. Atrae mariposas y polinizadores. Crece 6-12m.', care: 'Muy resistente a sequía. Poda después de floración. Excelente para restauración ecológica.', icon: '🦋' },
  { species: 'Erythrina coralloides', common_name: 'Colorín / Zompantle', description: 'Árbol caducifolio con flores rojas espectaculares. Sagrado para culturas mesoamericanas. Crece 5-10m.', care: 'Requiere pleno sol. Riego bajo. Semillas tóxicas - manejar con precaución.', icon: '🌺' },
  { species: 'Schinus molle', common_name: 'Pirú / Pirul', description: 'Árbol perenne de rápido crecimiento, muy extendido en el Valle de México. Hojas aromáticas. Alcanza 15m.', care: 'Extremadamente resistente. Riego mínimo. Podar ramas secas. Cuidado: invasivo en algunos ecosistemas.', icon: '🌴' }
];

const SPECIALIST_CONTACTS = [
  { name: 'Dr. Fernando Calderón Guzmán', specialty: 'Arboricultura Urbana y Fitosanidad', department: 'Departamento de Biología, FES Iztacala', contact: 'Laboratorio de Botánica Aplicada', icon: '🔬' },
  { name: 'Mtra. Patricia Rivera Torres', specialty: 'Ecología Forestal y Restauración', department: 'Jardín Botánico, UNAM', contact: 'Programa de Reforestación UNAM', icon: '🌱' },
  { name: 'Dr. Carlos Méndez Alonzo', specialty: 'Fisiología Vegetal y Estrés Hídrico', department: 'Instituto de Ecología, UNAM', contact: 'Laboratorio de Ecofisiología', icon: '💧' },
  { name: 'Ing. Ambiental Laura Sánchez Valdés', specialty: 'Control de Plagas y Enfermedades Forestales', department: 'CONAFOR / Colaboración UNAM', contact: 'Programa de Sanidad Forestal', icon: '🐛' }
];

let myTreeLoaded = false;
let currentTreeData = null;

// ========== MAIN LOAD ==========
async function loadMyTree(forceReload) {
  const container = document.getElementById('mi-arbol-content');
  if (!container) return;
  if (myTreeLoaded && !forceReload) return;

  try {
    const { data: assignments, error: assignError } = await sb
      .from('tree_assignments').select('tree_id').eq('user_id', currentUser.id);
    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:3rem;">
          <div style="font-size:4rem; margin-bottom:1rem;">🌱</div>
          <h3>No tienes árboles asignados aún</h3>
          <p class="text-muted">Un administrador te asignará un árbol pronto.</p>
        </div>`;
      myTreeLoaded = true;
      return;
    }

    const treeIds = assignments.map(a => a.tree_id);
    const { data: trees, error: treeError } = await sb
      .from('trees_catalog').select('*').in('id', treeIds);
    if (treeError) throw treeError;
    if (!trees || trees.length === 0) {
      container.innerHTML = '<p style="padding:20px;">Datos del árbol no encontrados.</p>';
      return;
    }

    const tree = trees[0];
    currentTreeData = tree;

    // Load measurements
    const { data: measurements } = await sb
      .from('tree_measurements').select('*')
      .eq('tree_id', tree.id)
      .order('measurement_date', { ascending: false });

    const meas = measurements || [];

    // Reference match
    const refMatch = ENDEMIC_TREE_REFERENCE.find(r =>
      tree.species && r.species.toLowerCase().includes(tree.species.toLowerCase().split(' ')[0])
    );

    // Build tabs
    container.innerHTML = `
      <!-- Sub-navigation tabs -->
      <div style="display:flex;gap:0.5rem;margin-bottom:2rem;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm mi-arbol-tab active" data-tab="tab-info" onclick="switchMiArbolTab('tab-info')"><i class="fas fa-tree"></i> Info del Árbol</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-seguimiento" onclick="switchMiArbolTab('tab-seguimiento')"><i class="fas fa-chart-line"></i> Seguimiento</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-registro" onclick="switchMiArbolTab('tab-registro')"><i class="fas fa-plus-circle"></i> Nuevo Registro</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-metas" onclick="switchMiArbolTab('tab-metas')"><i class="fas fa-bullseye"></i> Metas</button>
      </div>

      <!-- TAB: Info del Árbol -->
      <div id="tab-info" class="mi-arbol-tab-content active">
        <div class="tree-card">
          <div class="tree-header">
            <div class="tree-icon"><i class="fas fa-tree"></i></div>
            <div class="tree-header-content">
              <h3>${escapeHtml(tree.common_name || tree.species)}</h3>
              <p class="text-small text-muted">${escapeHtml(tree.species)} | Código: ${escapeHtml(tree.tree_code)}</p>
            </div>
          </div>
          <div class="tree-details">
            <div class="detail-item"><div class="detail-label">Campus</div><div class="detail-value">${escapeHtml(tree.campus || '-')}</div></div>
            <div class="detail-item"><div class="detail-label">Tipo</div><div class="detail-value">${escapeHtml(tree.tree_type || '-')}</div></div>
            <div class="detail-item"><div class="detail-label">Estado</div><div class="detail-value"><span class="badge badge-${tree.status === 'healthy' ? 'success' : tree.status === 'critical' ? 'danger' : 'warning'}">${escapeHtml(tree.status || 'activo')}</span></div></div>
            <div class="detail-item"><div class="detail-label">Salud</div><div class="health-score">${tree.health_score || 0}/100</div></div>
          </div>
          ${tree.initial_height_cm ? `
          <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-light);">
            <h4 style="margin-bottom:0.75rem;">Medidas Iniciales</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;">
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Altura</div><strong>${tree.initial_height_cm} cm</strong></div>
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Diámetro tronco</div><strong>${tree.initial_trunk_diameter_cm || '-'} cm</strong></div>
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Diámetro copa</div><strong>${tree.initial_crown_diameter_cm || '-'} cm</strong></div>
            </div>
          </div>` : ''}
          ${tree.photo_url ? `<div style="margin-top:1rem;"><img src="${tree.photo_url}" alt="Foto del árbol" style="max-width:100%;max-height:400px;border-radius:8px;object-fit:cover;"></div>` : ''}
        </div>

        ${refMatch ? `
        <div class="tree-card" style="border-left:4px solid var(--accent);margin-top:1rem;">
          <h4 style="margin-bottom:0.75rem;">${refMatch.icon} Información de Referencia</h4>
          <p><strong>${refMatch.common_name}</strong> (<em>${refMatch.species}</em>)</p>
          <p style="margin:0.5rem 0;">${refMatch.description}</p>
          <div style="background:#e8f5e9;padding:0.75rem;border-radius:8px;">💡 ${refMatch.care}</div>
        </div>` : ''}

        <div class="tree-card" style="margin-top:1rem;">
          <h4 style="margin-bottom:1rem;">Ubicación en el mapa</h4>
          <div id="treeMapContainer" style="height:300px;border-radius:8px;overflow:hidden;"></div>
        </div>
      </div>

      <!-- TAB: Seguimiento -->
      <div id="tab-seguimiento" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1.5rem;"><i class="fas fa-chart-line"></i> Historial de Seguimiento</h3>
        ${meas.length === 0 ? '<div class="card" style="text-align:center;padding:2rem;"><p class="text-muted">No hay registros de seguimiento aún. Haz tu primer registro en la pestaña "Nuevo Registro".</p></div>' :
          buildMeasurementsTimeline(meas)}
      </div>

      <!-- TAB: Nuevo Registro -->
      <div id="tab-registro" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1.5rem;"><i class="fas fa-plus-circle"></i> Nuevo Registro de Seguimiento</h3>
        <div class="card" style="padding:1.5rem;">
          <form id="form-new-measurement" onsubmit="saveMeasurement(event)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label>Altura (cm)</label>
                <input type="number" id="meas-height" placeholder="Ej: 350" step="0.1" style="width:100%;padding:0.5rem;">
              </div>
              <div class="form-group">
                <label>Diámetro del tronco (cm)</label>
                <input type="number" id="meas-trunk" placeholder="Ej: 25" step="0.1" style="width:100%;padding:0.5rem;">
              </div>
              <div class="form-group">
                <label>Diámetro de copa (cm)</label>
                <input type="number" id="meas-crown" placeholder="Ej: 400" step="0.1" style="width:100%;padding:0.5rem;">
              </div>
              <div class="form-group">
                <label>Salud estimada (0-100)</label>
                <input type="number" id="meas-health" min="0" max="100" placeholder="Ej: 85" style="width:100%;padding:0.5rem;">
              </div>
            </div>
            <div class="form-group" style="margin-top:1rem;">
              <label>Foto del árbol (opcional)</label>
              <input type="file" id="meas-photo" accept="image/*" style="width:100%;padding:0.5rem;">
              <div id="meas-photo-preview" style="margin-top:0.5rem;"></div>
            </div>
            <div class="form-group" style="margin-top:1rem;">
              <label>Observaciones</label>
              <textarea id="meas-observations" rows="3" placeholder="Describe el estado del árbol, cambios observados, problemas detectados..." style="width:100%;padding:0.5rem;"></textarea>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:1rem;width:100%;"><i class="fas fa-save"></i> Guardar Registro</button>
          </form>
        </div>
      </div>

      <!-- TAB: Metas -->
      <div id="tab-metas" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1.5rem;"><i class="fas fa-bullseye"></i> Metas de Cuidado</h3>
        <div class="card" style="padding:1.5rem;">
          <p class="text-muted" style="margin-bottom:1.5rem;">Objetivos para mejorar la salud de tu árbol</p>
          <div id="metas-list">
            ${buildGoals(tree, meas)}
          </div>
        </div>
      </div>
    `;

    // Init map
    initTreeMap(tree);

    // Photo preview
    document.getElementById('meas-photo')?.addEventListener('change', function() {
      const file = this.files[0];
      const preview = document.getElementById('meas-photo-preview');
      if (file && preview) {
        const reader = new FileReader();
        reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:150px;border-radius:8px;object-fit:cover;">`; };
        reader.readAsDataURL(file);
      }
    });

    myTreeLoaded = true;
  } catch (err) {
    console.error('Error loading tree:', err);
    const container2 = document.getElementById('mi-arbol-content');
    if (container2) container2.innerHTML = `<p style="padding:20px;color:var(--danger);">Error cargando datos del árbol: ${err.message}</p>`;
  }
}

// ========== SUB-TAB NAVIGATION ==========
function switchMiArbolTab(tabId) {
  document.querySelectorAll('.mi-arbol-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.mi-arbol-tab').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-outline');
  });
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  const btn = document.querySelector(`.mi-arbol-tab[data-tab="${tabId}"]`);
  if (btn) { btn.classList.add('active', 'btn-primary'); btn.classList.remove('btn-outline'); }
}

// ========== MEASUREMENTS TIMELINE ==========
function buildMeasurementsTimeline(measurements) {
  return `<div class="timeline">
    ${measurements.map((m, i) => {
      const date = new Date(m.measurement_date);
      const dateStr = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div class="card" style="padding:1.25rem;margin-bottom:1rem;border-left:4px solid ${i === 0 ? 'var(--primary)' : 'var(--border-light)'};">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <div>
              <strong style="font-size:1.1rem;"><i class="fas fa-calendar"></i> ${dateStr}</strong>
              ${m.health_score != null ? `<span class="badge badge-${m.health_score >= 70 ? 'success' : m.health_score >= 40 ? 'warning' : 'danger'}" style="margin-left:0.5rem;">Salud: ${m.health_score}%</span>` : ''}
            </div>
            ${i === 0 ? '<span class="badge badge-primary">Más reciente</span>' : ''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;margin-top:1rem;">
            ${m.height_cm ? `<div style="text-align:center;padding:0.5rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Altura</div><strong>${m.height_cm} cm</strong></div>` : ''}
            ${m.trunk_diameter_cm ? `<div style="text-align:center;padding:0.5rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Tronco</div><strong>${m.trunk_diameter_cm} cm</strong></div>` : ''}
            ${m.crown_diameter_cm ? `<div style="text-align:center;padding:0.5rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Copa</div><strong>${m.crown_diameter_cm} cm</strong></div>` : ''}
          </div>
          ${m.photo_url ? `<div style="margin-top:0.75rem;"><img src="${m.photo_url}" alt="Foto" style="max-width:100%;max-height:250px;border-radius:8px;object-fit:cover;"></div>` : ''}
          ${m.observations ? `<p style="margin-top:0.75rem;padding:0.75rem;background:#f8f9fa;border-radius:6px;font-size:0.9rem;"><i class="fas fa-sticky-note"></i> ${escapeHtml(m.observations)}</p>` : ''}
        </div>`;
    }).join('')}
  </div>`;
}

// ========== SAVE NEW MEASUREMENT ==========
async function saveMeasurement(e) {
  if (e) e.preventDefault();
  if (!currentTreeData || !currentUser) return;

  const height = parseFloat(document.getElementById('meas-height')?.value) || null;
  const trunk = parseFloat(document.getElementById('meas-trunk')?.value) || null;
  const crown = parseFloat(document.getElementById('meas-crown')?.value) || null;
  const health = parseInt(document.getElementById('meas-health')?.value) || null;
  const observations = document.getElementById('meas-observations')?.value.trim() || null;
  const photoFile = document.getElementById('meas-photo')?.files[0];

  if (!height && !trunk && !crown && !observations) {
    showToast('Ingresa al menos una medida u observación', 'warning');
    return;
  }

  try {
    let photoUrl = null;

    // Upload photo if provided
    if (photoFile) {
      const fileName = `${currentTreeData.id}/${Date.now()}_${photoFile.name}`;
      const { data: uploadData, error: uploadError } = await sb.storage
        .from('tree-photos')
        .upload(fileName, photoFile, { contentType: photoFile.type, upsert: false });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        showToast('Error subiendo foto, pero se guardará el registro sin ella', 'warning');
      } else {
        const { data: urlData } = sb.storage.from('tree-photos').getPublicUrl(fileName);
        photoUrl = urlData?.publicUrl || null;
      }
    }

    const { error } = await sb.from('tree_measurements').insert([{
      tree_id: currentTreeData.id,
      user_id: currentUser.id,
      height_cm: height,
      trunk_diameter_cm: trunk,
      crown_diameter_cm: crown,
      health_score: health,
      photo_url: photoUrl,
      observations: observations
    }]);

    if (error) throw error;

    // Update tree health if provided
    if (health) {
      await sb.from('trees_catalog').update({ health_score: health }).eq('id', currentTreeData.id);
    }

    showToast('Registro de seguimiento guardado', 'success');
    document.getElementById('form-new-measurement')?.reset();
    document.getElementById('meas-photo-preview').innerHTML = '';

    // Reload to show new measurement
    myTreeLoaded = false;
    loadMyTree(true);
  } catch (err) {
    console.error('Error saving measurement:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ========== GOALS ==========
function buildGoals(tree, measurements) {
  const healthScore = tree.health_score || 0;
  const totalMeasurements = measurements.length;

  const goals = [
    { title: 'Alcanzar salud del 90%', desc: 'Mantener cuidado consistente hasta lograr salud óptima', progress: Math.min(100, Math.round(healthScore / 90 * 100)), done: healthScore >= 90 },
    { title: 'Realizar primer seguimiento', desc: 'Registra las primeras medidas de tu árbol', progress: totalMeasurements > 0 ? 100 : 0, done: totalMeasurements > 0 },
    { title: '3 registros de seguimiento', desc: 'Documenta el crecimiento con al menos 3 mediciones', progress: Math.min(100, Math.round(totalMeasurements / 3 * 100)), done: totalMeasurements >= 3 },
    { title: 'Subir foto del árbol', desc: 'Registra el estado visual con una fotografía', progress: measurements.some(m => m.photo_url) ? 100 : 0, done: measurements.some(m => m.photo_url) },
    { title: 'Seguimiento mensual', desc: 'Realiza al menos un registro por mes durante 3 meses', progress: Math.min(100, Math.round(getMonthlyProgress(measurements) / 3 * 100)), done: getMonthlyProgress(measurements) >= 3 }
  ];

  return goals.map(g => `
    <div style="display:flex;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid var(--border-light);">
      <div style="font-size:1.5rem;">${g.done ? '✅' : '⬜'}</div>
      <div style="flex:1;">
        <strong>${g.title}</strong>
        <p class="text-small text-muted" style="margin:0.25rem 0 0.5rem;">${g.desc}</p>
        <div class="progress-bar" style="height:6px;background:#eee;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${g.progress}%;background:${g.done ? 'var(--success)' : 'var(--primary)'};border-radius:3px;transition:width 0.3s;"></div>
        </div>
        <small class="text-muted">${g.progress}%</small>
      </div>
    </div>
  `).join('');
}

function getMonthlyProgress(measurements) {
  const months = new Set();
  measurements.forEach(m => {
    const d = new Date(m.measurement_date);
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  });
  return months.size;
}

// ========== MAP ==========
function initTreeMap(tree) {
  if (tree.location_lat && tree.location_lng) {
    setTimeout(() => {
      const mapContainer = document.getElementById('treeMapContainer');
      if (!mapContainer || typeof L === 'undefined') return;
      if (mapContainer._leaflet_id) return;
      const map = L.map('treeMapContainer').setView([tree.location_lat, tree.location_lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      L.marker([tree.location_lat, tree.location_lng])
        .addTo(map)
        .bindPopup(`<b>${escapeHtml(tree.common_name || tree.species)}</b><br>${escapeHtml(tree.tree_code)}`)
        .openPopup();
      setTimeout(() => { map.invalidateSize(); }, 200);
    }, 300);
  } else {
    const mapContainer = document.getElementById('treeMapContainer');
    if (mapContainer) {
      mapContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-light);"><p>Sin coordenadas registradas para este árbol</p></div>';
    }
  }
}

// ========== INFORMACIÓN SECTION (called from loadInfoSection) ==========
function loadInfoSection() {
  const endemicEl = document.getElementById('info-endemic-trees');
  const specialistEl = document.getElementById('info-specialists');

  if (endemicEl) {
    const cards = ENDEMIC_TREE_REFERENCE.map(r => `
      <div style="background:white;border-radius:12px;padding:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:3px solid var(--accent);">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
          <span style="font-size:1.5rem;">${r.icon}</span>
          <div><strong>${escapeHtml(r.common_name)}</strong><div class="text-small text-muted"><em>${escapeHtml(r.species)}</em></div></div>
        </div>
        <p class="text-small" style="margin-bottom:0.5rem;">${r.description}</p>
        <div style="background:#f0faf4;padding:0.5rem 0.75rem;border-radius:6px;font-size:0.85rem;">💡 ${r.care}</div>
      </div>
    `).join('');
    endemicEl.innerHTML = `
      <h3 style="margin-bottom:1.5rem;">🌿 Árboles Endémicos de Referencia</h3>
      <p class="text-muted" style="margin-bottom:1.5rem;">Conoce las especies nativas más importantes del campus y el Valle de México.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">${cards}</div>
    `;
  }

  if (specialistEl) {
    const contacts = SPECIALIST_CONTACTS.map(s => `
      <div style="background:white;border-radius:12px;padding:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;gap:1rem;align-items:flex-start;">
        <div style="font-size:2rem;min-width:40px;text-align:center;">${s.icon}</div>
        <div>
          <strong>${escapeHtml(s.name)}</strong>
          <div class="text-small" style="color:var(--primary);font-weight:500;margin:0.25rem 0;">${escapeHtml(s.specialty)}</div>
          <div class="text-small text-muted">${escapeHtml(s.department)}</div>
          <div class="text-small" style="margin-top:0.25rem;">📩 ${escapeHtml(s.contact)}</div>
        </div>
      </div>
    `).join('');
    specialistEl.innerHTML = `
      <h3 style="margin-bottom:1.5rem;">👨‍🔬 Especialistas de Apoyo</h3>
      <p class="text-muted" style="margin-bottom:1.5rem;">Si necesitas orientación profesional sobre el cuidado de tu árbol, puedes contactar a estos especialistas.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">${contacts}</div>
    `;
  }
}

// Expose
window.loadMyTree = loadMyTree;
window.switchMiArbolTab = switchMiArbolTab;
window.saveMeasurement = saveMeasurement;
window.loadInfoSection = loadInfoSection;
