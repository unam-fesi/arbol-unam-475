// ============================================================================
// MI ÁRBOL - Tree View, Reference Info, Specialist Contacts, Care Checklist
// ============================================================================

// Catálogo de referencia de árboles endémicos de la UNAM / Valle de México
const ENDEMIC_TREE_REFERENCE = [
  {
    species: 'Taxodium mucronatum',
    common_name: 'Ahuehuete',
    description: 'Árbol nacional de México. Conífera de gran longevidad que habita zonas ribereñas. Puede vivir más de 1,000 años.',
    care: 'Requiere suelo húmedo y abundante agua. Tolera suelos alcalinos. No podar ramas gruesas.',
    icon: '🌲'
  },
  {
    species: 'Fraxinus uhdei',
    common_name: 'Fresno',
    description: 'Árbol caducifolio nativo del centro de México, muy común en CU y campus de la UNAM. Alcanza 25-30m.',
    care: 'Riego moderado. Poda de formación en invierno. Vigilar cochinilla y barrenador.',
    icon: '🌳'
  },
  {
    species: 'Liquidambar styraciflua',
    common_name: 'Liquidámbar',
    description: 'Árbol caducifolio con hojas palmeadas que enrojecen espectacularmente en otoño. Originario de Mesoamérica.',
    care: 'Suelo ácido y bien drenado. Riego regular. Proteger de heladas fuertes en ejemplares jóvenes.',
    icon: '🍁'
  },
  {
    species: 'Cupressus lusitanica',
    common_name: 'Cedro blanco',
    description: 'Conífera perenne nativa de las montañas de México. Muy utilizada en reforestación urbana. Crece 15-30m.',
    care: 'Tolerante a sequía una vez establecido. Poda ligera. Vigilar roya y araña roja.',
    icon: '🌿'
  },
  {
    species: 'Quercus rugosa',
    common_name: 'Encino',
    description: 'Encino endémico de los bosques templados mexicanos. Hojas coriáceas y rugosas. Importante para la biodiversidad.',
    care: 'Riego moderado. No fertilizar en exceso. Respetar la hojarasca alrededor del tronco.',
    icon: '🍂'
  },
  {
    species: 'Buddleja cordata',
    common_name: 'Tepozán',
    description: 'Árbol nativo del Valle de México, muy resistente. Atrae mariposas y polinizadores. Crece 6-12m.',
    care: 'Muy resistente a sequía. Poda después de floración. Excelente para restauración ecológica.',
    icon: '🦋'
  },
  {
    species: 'Erythrina coralloides',
    common_name: 'Colorín / Zompantle',
    description: 'Árbol caducifolio con flores rojas espectaculares. Sagrado para culturas mesoamericanas. Crece 5-10m.',
    care: 'Requiere pleno sol. Riego bajo. Semillas tóxicas - manejar con precaución.',
    icon: '🌺'
  },
  {
    species: 'Schinus molle',
    common_name: 'Pirú / Pirul',
    description: 'Árbol perenne de rápido crecimiento, muy extendido en el Valle de México. Hojas aromáticas. Alcanza 15m.',
    care: 'Extremadamente resistente. Riego mínimo. Podar ramas secas. Cuidado: invasivo en algunos ecosistemas.',
    icon: '🌴'
  }
];

// Especialistas de referencia
const SPECIALIST_CONTACTS = [
  {
    name: 'Dr. Fernando Calderón Guzmán',
    specialty: 'Arboricultura Urbana y Fitosanidad',
    department: 'Departamento de Biología, FES Iztacala',
    contact: 'Laboratorio de Botánica Aplicada',
    icon: '🔬'
  },
  {
    name: 'Mtra. Patricia Rivera Torres',
    specialty: 'Ecología Forestal y Restauración',
    department: 'Jardín Botánico, UNAM',
    contact: 'Programa de Reforestación UNAM',
    icon: '🌱'
  },
  {
    name: 'Dr. Carlos Méndez Alonzo',
    specialty: 'Fisiología Vegetal y Estrés Hídrico',
    department: 'Instituto de Ecología, UNAM',
    contact: 'Laboratorio de Ecofisiología',
    icon: '💧'
  },
  {
    name: 'Ing. Ambiental Laura Sánchez Valdés',
    specialty: 'Control de Plagas y Enfermedades Forestales',
    department: 'CONAFOR / Colaboración UNAM',
    contact: 'Programa de Sanidad Forestal',
    icon: '🐛'
  }
];

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
        <h2 style="margin-bottom: 2rem;">Mi Árbol</h2>
        <div class="card" style="text-align:center; padding:3rem;">
          <div style="font-size:4rem; margin-bottom:1rem;">🌱</div>
          <h3>No tienes árboles asignados aún</h3>
          <p class="text-muted">Un administrador te asignará un árbol pronto. Mientras, puedes explorar la información de referencia abajo.</p>
        </div>
        ${buildReferenceSection()}
        ${buildSpecialistSection()}
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
      container.innerHTML = '<h2 style="margin-bottom:2rem;">Mi Árbol</h2><p style="padding: 20px;">Datos del árbol no encontrados.</p>';
      return;
    }

    const tree = trees[0];

    // Find matching reference info
    const refMatch = ENDEMIC_TREE_REFERENCE.find(r =>
      tree.species && r.species.toLowerCase().includes(tree.species.toLowerCase().split(' ')[0])
    );

    let refCard = '';
    if (refMatch) {
      refCard = `
        <div class="tree-card" style="border-left:4px solid var(--accent);">
          <h4 style="margin-bottom:1rem;">${refMatch.icon} Información de Referencia</h4>
          <p style="margin-bottom:0.75rem;"><strong>${refMatch.common_name}</strong> (<em>${refMatch.species}</em>)</p>
          <p style="margin-bottom:0.75rem;">${refMatch.description}</p>
          <div style="background:#e8f5e9;padding:1rem;border-radius:8px;">
            <strong>💡 Consejos de cuidado:</strong> ${refMatch.care}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <h2 style="margin-bottom: 2rem;">Mi Árbol</h2>
      <div class="container">
        <div class="tree-info">
          <div class="tree-card">
            <div class="tree-header">
              <div class="tree-icon"><i class="fas fa-tree"></i></div>
              <div class="tree-header-content">
                <h3>${escapeHtml(tree.common_name || tree.species)}</h3>
                <p class="text-small text-muted">${escapeHtml(tree.species)} | Código: ${escapeHtml(tree.tree_code)}</p>
              </div>
            </div>
            <div class="tree-details">
              <div class="detail-item">
                <div class="detail-label">Ubicación</div>
                <div class="detail-value">${escapeHtml(tree.location_desc || tree.campus || '-')}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Tipo</div>
                <div class="detail-value">${escapeHtml(tree.tree_type || '-')}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Estado</div>
                <div class="detail-value"><span class="badge badge-${tree.status === 'healthy' ? 'success' : tree.status === 'critical' ? 'danger' : 'warning'}">${escapeHtml(tree.status || 'activo')}</span></div>
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

        ${refCard}

        ${buildReferenceSection()}
        ${buildSpecialistSection()}
      </div>
    `;

    // Init map if coordinates exist
    if (tree.location_lat && tree.location_lng) {
      setTimeout(() => {
        const map = L.map('treeMapContainer').setView([tree.location_lat, tree.location_lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        L.marker([tree.location_lat, tree.location_lng])
          .addTo(map)
          .bindPopup(`<b>${tree.common_name || tree.species}</b><br>${tree.tree_code}`)
          .openPopup();
      }, 100);
    }

  } catch (err) {
    console.error('Error loading tree:', err);
    container.innerHTML = `<h2 style="margin-bottom:2rem;">Mi Árbol</h2><p style="padding:20px;color:var(--danger);">Error cargando datos del árbol: ${err.message}</p>`;
  }
}

function buildReferenceSection() {
  const cards = ENDEMIC_TREE_REFERENCE.map(r => `
    <div style="background:white;border-radius:12px;padding:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:3px solid var(--accent);">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
        <span style="font-size:1.5rem;">${r.icon}</span>
        <div>
          <strong>${escapeHtml(r.common_name)}</strong>
          <div class="text-small text-muted"><em>${escapeHtml(r.species)}</em></div>
        </div>
      </div>
      <p class="text-small" style="margin-bottom:0.5rem;">${r.description}</p>
      <div style="background:#f0faf4;padding:0.5rem 0.75rem;border-radius:6px;font-size:0.85rem;">
        💡 ${r.care}
      </div>
    </div>
  `).join('');

  return `
    <div style="margin-top:2.5rem;">
      <h3 style="margin-bottom:1.5rem;">🌿 Árboles Endémicos de Referencia</h3>
      <p class="text-muted" style="margin-bottom:1.5rem;">Conoce las especies nativas más importantes del campus y el Valle de México.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${cards}
      </div>
    </div>
  `;
}

function buildSpecialistSection() {
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

  return `
    <div style="margin-top:2.5rem;">
      <h3 style="margin-bottom:1.5rem;">👨‍🔬 Especialistas de Apoyo</h3>
      <p class="text-muted" style="margin-bottom:1.5rem;">Si necesitas orientación profesional sobre el cuidado de tu árbol, puedes contactar a estos especialistas.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">
        ${contacts}
      </div>
    </div>
  `;
}

window.loadMyTree = loadMyTree;
