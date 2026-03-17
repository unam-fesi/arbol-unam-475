// ============================================================================
// MI ÁRBOL - Tree View, Health Assessment, Seguimiento, Metas
// ============================================================================

// ========== REFERENCE DATA (for Información section) ==========
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

// ========== HEALTH RUBRICS ==========
// auto: true = Gemini puede evaluar desde foto
const HEALTH_RUBRICS = [
  {
    key: 'vigor', label: '1. Vigor General', icon: '💪', auto: true, weight: 12,
    options: [
      { value: 5, text: 'Excelente: follaje denso, color intenso, brotes nuevos abundantes' },
      { value: 4, text: 'Bueno: follaje sano, algunas ramas secas menores' },
      { value: 3, text: 'Regular: follaje algo ralo, crecimiento lento' },
      { value: 2, text: 'Deficiente: follaje escaso, muchas ramas secas' },
      { value: 1, text: 'Crítico: casi sin follaje, sin crecimiento visible' }
    ]
  },
  {
    key: 'copa', label: '2. Condición de Copa', icon: '🌿', auto: true, weight: 15,
    options: [
      { value: 5, text: 'Excelente: copa completa, simétrica, densa' },
      { value: 4, text: 'Buena: copa >75%, ligero raleo' },
      { value: 3, text: 'Regular: copa 50-75%, transparencia notable' },
      { value: 2, text: 'Mala: copa <50%, muy rala, deformada' },
      { value: 1, text: 'Crítica: copa <25%, mayormente muerta' }
    ]
  },
  {
    key: 'tronco', label: '3. Estado del Tronco', icon: '🪵', auto: true, weight: 12,
    options: [
      { value: 5, text: 'Excelente: sin grietas, cavidades ni daños' },
      { value: 4, text: 'Bueno: grietas menores, sin pudrición' },
      { value: 3, text: 'Regular: grietas o cavidades pequeñas, algo de exudado' },
      { value: 2, text: 'Malo: cavidades grandes, pudrición visible, descortezamiento' },
      { value: 1, text: 'Crítico: pudrición extensa, daño estructural severo' }
    ]
  },
  {
    key: 'ramas', label: '4. Estado de Ramas', icon: '🌳', auto: true, weight: 10,
    options: [
      { value: 5, text: 'Excelente: ramas sanas, sin roturas' },
      { value: 4, text: 'Bueno: pocas ramas secas menores' },
      { value: 3, text: 'Regular: ramas secas y uniones débiles' },
      { value: 2, text: 'Malo: ramas rotas, chancros, plagas en ramas' },
      { value: 1, text: 'Crítico: mayoría de ramas dañadas o muertas' }
    ]
  },
  {
    key: 'raices', label: '5. Estado de Raíces y Cuello', icon: '🌱', auto: false, weight: 10,
    options: [
      { value: 5, text: 'Excelente: cuello sano, suelo en buen estado' },
      { value: 4, text: 'Bueno: raíces estables, sin daños visibles' },
      { value: 3, text: 'Regular: algo de compactación o raíces expuestas' },
      { value: 2, text: 'Malo: raíces dañadas, pudrición en cuello, encharcamiento' },
      { value: 1, text: 'Crítico: raíces cortadas, suelo levantado, pudrición severa' }
    ]
  },
  {
    key: 'plagas', label: '6. Plagas y Enfermedades', icon: '🐛', auto: true, weight: 12,
    options: [
      { value: 5, text: 'Sin plagas ni enfermedades' },
      { value: 4, text: 'Presencia menor de insectos o manchas' },
      { value: 3, text: 'Infestación moderada, hongos o muérdago parcial' },
      { value: 2, text: 'Infestación fuerte, múltiples agentes' },
      { value: 1, text: 'Infestación severa, daño generalizado' }
    ]
  },
  {
    key: 'foliar', label: '7. Condición Foliar', icon: '🍃', auto: true, weight: 10,
    options: [
      { value: 5, text: 'Excelente: hojas verdes, tamaño normal, sin manchas' },
      { value: 4, text: 'Buena: ligera clorosis o manchas menores' },
      { value: 3, text: 'Regular: clorosis notable, necrosis parcial, enrollamiento' },
      { value: 2, text: 'Mala: marchitez, defoliación parcial >30%' },
      { value: 1, text: 'Crítica: defoliación severa, hojas necróticas' }
    ]
  },
  {
    key: 'estabilidad', label: '8. Estabilidad Estructural', icon: '🏗️', auto: true, weight: 8,
    options: [
      { value: 5, text: 'Excelente: recto, copa balanceada, sin riesgo' },
      { value: 4, text: 'Buena: ligera inclinación, estructura sólida' },
      { value: 3, text: 'Regular: inclinación notable, desbalance de copa' },
      { value: 2, text: 'Mala: inclinación fuerte, defectos estructurales' },
      { value: 1, text: 'Crítica: riesgo de caída inminente' }
    ]
  },
  {
    key: 'sitio', label: '9. Condiciones del Sitio', icon: '📍', auto: false, weight: 6,
    options: [
      { value: 5, text: 'Óptimo: buen suelo, luz, drenaje, espacio' },
      { value: 4, text: 'Bueno: condiciones adecuadas, alguna limitación menor' },
      { value: 3, text: 'Regular: suelo compactado o espacio limitado' },
      { value: 2, text: 'Malo: drenaje deficiente, contaminación, sin espacio' },
      { value: 1, text: 'Crítico: condiciones muy desfavorables' }
    ]
  },
  {
    key: 'biometrico', label: '10. Parámetros Biométricos', icon: '📏', auto: false, weight: 5,
    options: [
      { value: 5, text: 'Medidas en rango óptimo para la especie y edad' },
      { value: 4, text: 'Medidas ligeramente por debajo del rango esperado' },
      { value: 3, text: 'Medidas moderadamente por debajo' },
      { value: 2, text: 'Medidas muy por debajo del rango esperado' },
      { value: 1, text: 'Crecimiento severamente detenido' }
    ]
  }
];

let myTreeLoaded = false;
let currentTreeData = null;
let pendingPhotoBase64 = null;
let pendingPhotoFile = null;

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

    const { data: measurements } = await sb
      .from('tree_measurements').select('*')
      .eq('tree_id', tree.id)
      .order('measurement_date', { ascending: false });
    const meas = measurements || [];

    const refMatch = ENDEMIC_TREE_REFERENCE.find(r =>
      tree.species && r.species.toLowerCase().includes(tree.species.toLowerCase().split(' ')[0])
    );

    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;margin-bottom:2rem;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm mi-arbol-tab active" data-tab="tab-info" onclick="switchMiArbolTab('tab-info')"><i class="fas fa-tree"></i> Info</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-seguimiento" onclick="switchMiArbolTab('tab-seguimiento')"><i class="fas fa-chart-line"></i> Seguimiento (${meas.length})</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-registro" onclick="switchMiArbolTab('tab-registro')"><i class="fas fa-plus-circle"></i> Nuevo Registro</button>
        <button class="btn btn-outline btn-sm mi-arbol-tab" data-tab="tab-metas" onclick="switchMiArbolTab('tab-metas')"><i class="fas fa-bullseye"></i> Metas</button>
      </div>

      <!-- TAB: Info -->
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;">
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Altura</div><strong>${tree.initial_height_cm} cm</strong></div>
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Tronco ⌀</div><strong>${tree.initial_trunk_diameter_cm || '-'} cm</strong></div>
              <div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Copa ⌀</div><strong>${tree.initial_crown_diameter_cm || '-'} cm</strong></div>
            </div>
          </div>` : ''}
          ${tree.photo_url ? `<div style="margin-top:1rem;"><img src="${tree.photo_url}" alt="Foto" style="max-width:100%;max-height:400px;border-radius:8px;object-fit:cover;"></div>` : ''}
        </div>
        ${refMatch ? `<div class="tree-card" style="border-left:4px solid var(--accent);margin-top:1rem;"><h4 style="margin-bottom:0.75rem;">${refMatch.icon} Referencia</h4><p><strong>${refMatch.common_name}</strong> (<em>${refMatch.species}</em>)</p><p style="margin:0.5rem 0;">${refMatch.description}</p><div style="background:#e8f5e9;padding:0.75rem;border-radius:8px;">💡 ${refMatch.care}</div></div>` : ''}
        <div class="tree-card" style="margin-top:1rem;"><h4 style="margin-bottom:1rem;">Ubicación</h4><div id="treeMapContainer" style="height:300px;border-radius:8px;overflow:hidden;"></div></div>
      </div>

      <!-- TAB: Seguimiento -->
      <div id="tab-seguimiento" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1.5rem;"><i class="fas fa-chart-line"></i> Historial de Seguimiento</h3>
        ${meas.length === 0 ? '<div class="card" style="text-align:center;padding:2rem;"><p class="text-muted">No hay registros aún. Haz tu primer registro en "Nuevo Registro".</p></div>' : buildTimeline(meas)}
      </div>

      <!-- TAB: Nuevo Registro -->
      <div id="tab-registro" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1rem;"><i class="fas fa-plus-circle"></i> Nuevo Registro de Seguimiento</h3>
        <div class="card" style="padding:1.5rem;">
          <form id="form-new-measurement" onsubmit="saveMeasurement(event)">

            <!-- FOTO + análisis IA -->
            <div style="background:linear-gradient(135deg,#e8f5e9,#e3f2fd);padding:1.25rem;border-radius:12px;margin-bottom:1.5rem;">
              <h4 style="margin-bottom:0.75rem;"><i class="fas fa-camera"></i> Foto del Árbol</h4>
              <p class="text-small text-muted" style="margin-bottom:0.75rem;">Sube una foto y PUM-AI analizará automáticamente los rubros visuales (🤖)</p>
              <input type="file" id="meas-photo" accept="image/*" style="width:100%;padding:0.5rem;" onchange="handleMeasPhoto(this)">
              <div id="meas-photo-preview" style="margin-top:0.75rem;"></div>
              <button type="button" class="btn btn-sm" style="margin-top:0.75rem;background:var(--accent);color:white;" onclick="analyzePhotoWithAI()" id="btn-ai-analyze" disabled>
                <i class="fas fa-robot"></i> Analizar con PUM-AI
              </button>
              <div id="ai-analysis-status" style="margin-top:0.5rem;"></div>
            </div>

            <!-- MEDIDAS MANUALES -->
            <h4 style="margin-bottom:0.75rem;"><i class="fas fa-ruler"></i> Medidas Biométricas</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:1.5rem;">
              <div class="form-group"><label>Altura (cm)</label><input type="number" id="meas-height" step="0.1" style="width:100%;padding:0.5rem;"></div>
              <div class="form-group"><label>⌀ Tronco (cm)</label><input type="number" id="meas-trunk" step="0.1" style="width:100%;padding:0.5rem;"></div>
              <div class="form-group"><label>⌀ Copa (cm)</label><input type="number" id="meas-crown" step="0.1" style="width:100%;padding:0.5rem;"></div>
            </div>

            <!-- RUBROS DE SALUD -->
            <h4 style="margin-bottom:0.75rem;"><i class="fas fa-heartbeat"></i> Evaluación de Salud (10 rubros)</h4>
            <p class="text-small text-muted" style="margin-bottom:1rem;">🤖 = evaluable por IA desde la foto | ✋ = requiere evaluación manual</p>
            <div id="health-rubrics-form">
              ${HEALTH_RUBRICS.map(r => `
                <div class="rubric-group" style="margin-bottom:1rem;padding:1rem;background:var(--bg);border-radius:8px;border-left:3px solid ${r.auto ? 'var(--primary)' : 'var(--text-light)'};">
                  <label style="font-weight:600;display:block;margin-bottom:0.5rem;">
                    ${r.icon} ${r.label} ${r.auto ? '<span style="font-size:0.75rem;background:var(--primary);color:white;padding:1px 6px;border-radius:4px;">🤖 IA</span>' : '<span style="font-size:0.75rem;background:#9e9e9e;color:white;padding:1px 6px;border-radius:4px;">✋ Manual</span>'}
                    <span class="text-small text-muted" style="float:right;">Peso: ${r.weight}%</span>
                  </label>
                  <select id="rubric-${r.key}" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--border-light);">
                    <option value="">Sin evaluar</option>
                    ${r.options.map(o => `<option value="${o.value}">${o.value}/5 - ${o.text}</option>`).join('')}
                  </select>
                </div>
              `).join('')}
            </div>

            <!-- Score calculado -->
            <div style="background:white;padding:1rem;border-radius:8px;border:2px solid var(--primary);margin:1rem 0;text-align:center;">
              <strong>Salud Estimada:</strong> <span id="calculated-health" style="font-size:1.5rem;font-weight:700;color:var(--primary);">--</span>/100
              <button type="button" class="btn btn-sm btn-outline" style="margin-left:1rem;" onclick="recalcHealth()">Recalcular</button>
            </div>

            <!-- OBSERVACIONES -->
            <div class="form-group" style="margin-top:1rem;">
              <label><i class="fas fa-sticky-note"></i> Observaciones</label>
              <textarea id="meas-observations" rows="3" style="width:100%;padding:0.5rem;" placeholder="Describe el estado general, cambios observados..."></textarea>
            </div>

            <button type="submit" class="btn btn-primary" style="margin-top:1rem;width:100%;padding:0.75rem;font-size:1rem;">
              <i class="fas fa-save"></i> Guardar Registro de Seguimiento
            </button>
          </form>
        </div>
      </div>

      <!-- TAB: Metas -->
      <div id="tab-metas" class="mi-arbol-tab-content" style="display:none;">
        <h3 style="margin-bottom:1.5rem;"><i class="fas fa-bullseye"></i> Metas de Cuidado</h3>
        <div class="card" style="padding:1.5rem;">
          <p class="text-muted" style="margin-bottom:1.5rem;">Objetivos para mejorar la salud de tu árbol</p>
          ${buildGoals(tree, meas)}
        </div>
      </div>
    `;

    // Init map
    initTreeMap(tree);

    // Bind rubric change events to recalculate
    HEALTH_RUBRICS.forEach(r => {
      document.getElementById(`rubric-${r.key}`)?.addEventListener('change', recalcHealth);
    });

    myTreeLoaded = true;
  } catch (err) {
    console.error('Error loading tree:', err);
    document.getElementById('mi-arbol-content').innerHTML = `<p style="padding:20px;color:var(--danger);">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// ========== PHOTO HANDLING ==========
function handleMeasPhoto(input) {
  if (!input.files || !input.files[0]) return;
  pendingPhotoFile = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    pendingPhotoBase64 = e.target.result;
    const preview = document.getElementById('meas-photo-preview');
    if (preview) preview.innerHTML = `<img src="${pendingPhotoBase64}" style="max-width:300px;max-height:200px;border-radius:8px;object-fit:cover;">`;
    document.getElementById('btn-ai-analyze').disabled = false;
  };
  reader.readAsDataURL(pendingPhotoFile);
}


// ========== GEMINI AI ANALYSIS ==========
async function analyzePhotoWithAI() {
  if (!pendingPhotoBase64 || !currentTreeData) return;

  const statusEl = document.getElementById('ai-analysis-status');
  const btn = document.getElementById('btn-ai-analyze');
  btn.disabled = true;
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando imagen con PUM-AI...';

  try {
    // Compress image before sending to Edge Function (max 1024px, JPEG 70%)
    const compressedDataUrl = await compressImageForAI(pendingPhotoBase64, 1024, 1024, 0.7);
    const base64Data = compressedDataUrl.split(',')[1];
    const mimeType = 'image/jpeg'; // Always JPEG after compression

    const autoRubrics = HEALTH_RUBRICS.filter(r => r.auto);
    const rubricPrompt = autoRubrics.map(r =>
      `"${r.key}": evalúa ${r.label} (1=crítico a 5=excelente). Opciones: ${r.options.map(o => o.value + '=' + o.text.split(':')[0]).join(', ')}`
    ).join('\n');

    const prompt = `Eres un experto arboricultor de la UNAM. Analiza esta foto de un árbol (${currentTreeData.common_name || currentTreeData.species}, código ${currentTreeData.tree_code}).

Evalúa SOLO estos rubros visibles en la imagen y responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto extra):

${rubricPrompt}

Formato exacto de respuesta (JSON puro):
{"vigor":3,"copa":4,"tronco":3,"ramas":4,"plagas":5,"foliar":4,"estabilidad":4,"justificacion":"Breve explicación de la evaluación"}`;

    const { data, error } = await sb.functions.invoke('pum-ai', {
      body: { message: prompt, imageBase64: base64Data, imageType: mimeType }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    let reply = data?.reply || '';
    // Clean up: remove markdown code fences, thinking blocks, etc.
    reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Extract JSON from response — find the outermost { ... }
    let jsonStr = reply;
    const jsonMatch = reply.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    // Clean common Gemini formatting issues
    jsonStr = jsonStr.replace(/[\r\n]+/g, ' ').replace(/,\s*}/g, '}').trim();

    let scores;
    try {
      scores = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Fallback: try to extract individual values with regex
      console.warn('JSON parse failed, trying regex fallback:', parseErr.message, 'Raw:', jsonStr);
      scores = {};
      const autoRubricKeys = HEALTH_RUBRICS.filter(r => r.auto).map(r => r.key);
      autoRubricKeys.forEach(key => {
        const m = reply.match(new RegExp(`"${key}"\\s*:\\s*(\\d)`));
        if (m) scores[key] = parseInt(m[1]);
      });
      // Try to get justificacion
      const justMatch = reply.match(/"justificacion"\s*:\s*"([^"]+)/);
      if (justMatch) scores.justificacion = justMatch[1];
    }

    // Fill in the rubric selects
    let filled = 0;
    autoRubrics.forEach(r => {
      if (scores[r.key] && scores[r.key] >= 1 && scores[r.key] <= 5) {
        const sel = document.getElementById(`rubric-${r.key}`);
        if (sel) { sel.value = scores[r.key]; filled++; }
      }
    });

    recalcHealth();

    let justText = scores.justificacion ? `<br><em style="font-size:0.85rem;">"${escapeHtml(scores.justificacion)}"</em>` : '';
    statusEl.innerHTML = `<span style="color:var(--success);"><i class="fas fa-check-circle"></i> IA evaluó ${filled} de ${autoRubrics.length} rubros visuales.</span>${justText}`;

  } catch (err) {
    console.error('AI analysis error:', err);
    statusEl.innerHTML = `<span style="color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> Error: ${escapeHtml(err.message)}. Puedes evaluar manualmente.</span>`;
  }
  btn.disabled = false;
}

// ========== HEALTH CALCULATION ==========
function recalcHealth() {
  let totalWeight = 0;
  let weightedSum = 0;
  HEALTH_RUBRICS.forEach(r => {
    const val = parseInt(document.getElementById(`rubric-${r.key}`)?.value);
    if (val && val >= 1 && val <= 5) {
      weightedSum += (val / 5) * r.weight;
      totalWeight += r.weight;
    }
  });
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null;
  const el = document.getElementById('calculated-health');
  if (el) {
    el.textContent = score !== null ? score : '--';
    el.style.color = score >= 70 ? 'var(--success)' : score >= 40 ? '#FFC107' : 'var(--danger)';
  }
  return score;
}

// ========== SAVE MEASUREMENT ==========
async function saveMeasurement(e) {
  if (e) e.preventDefault();
  if (!currentTreeData || !currentUser) return;

  const height = parseFloat(document.getElementById('meas-height')?.value) || null;
  const trunk = parseFloat(document.getElementById('meas-trunk')?.value) || null;
  const crown = parseFloat(document.getElementById('meas-crown')?.value) || null;
  const observations = document.getElementById('meas-observations')?.value.trim() || null;
  const healthScore = recalcHealth();

  // Collect rubric scores
  const rubricScores = {};
  HEALTH_RUBRICS.forEach(r => {
    const val = parseInt(document.getElementById(`rubric-${r.key}`)?.value);
    if (val) rubricScores[r.key] = val;
  });

  if (!height && !trunk && !crown && !observations && Object.keys(rubricScores).length === 0) {
    showToast('Ingresa al menos una medida, evaluación u observación', 'warning');
    return;
  }

  try {
    let photoUrl = null;
    if (pendingPhotoFile) {
      const fileName = `${currentTreeData.id}/${Date.now()}_${pendingPhotoFile.name}`;
      const { error: uploadError } = await sb.storage.from('tree-photos').upload(fileName, pendingPhotoFile, { contentType: pendingPhotoFile.type });
      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        showToast('Error subiendo foto, se guardará sin ella', 'warning');
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
      health_score: healthScore,
      photo_url: photoUrl,
      observations: observations ? (observations + (Object.keys(rubricScores).length > 0 ? '\n\n[RUBROS] ' + JSON.stringify(rubricScores) : '')) : (Object.keys(rubricScores).length > 0 ? '[RUBROS] ' + JSON.stringify(rubricScores) : null)
    }]);
    if (error) throw error;

    if (healthScore) {
      await sb.from('trees_catalog').update({ health_score: healthScore }).eq('id', currentTreeData.id);
    }

    showToast('Registro de seguimiento guardado', 'success');
    pendingPhotoBase64 = null;
    pendingPhotoFile = null;
    myTreeLoaded = false;
    loadMyTree(true);
  } catch (err) {
    console.error('Error saving measurement:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ========== TIMELINE ==========
function buildTimeline(measurements) {
  return measurements.map((m, i) => {
    const date = new Date(m.measurement_date);
    const dateStr = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    const hasPhoto = !!m.photo_url;

    // Parse rubric scores from observations
    let rubricData = null;
    let cleanObs = m.observations || '';
    const rubricMatch = cleanObs.match(/\[RUBROS\]\s*(\{.*\})/);
    if (rubricMatch) {
      try { rubricData = JSON.parse(rubricMatch[1]); } catch(e) {}
      cleanObs = cleanObs.replace(/\n?\n?\[RUBROS\].*$/, '').trim();
    }

    return `
      <div class="card" style="padding:1.25rem;margin-bottom:1rem;border-left:4px solid ${i === 0 ? 'var(--primary)' : 'var(--border-light)'};cursor:pointer;transition:box-shadow 0.2s;" onclick="showMeasurementDetail(${m.id})" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow=''">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <strong><i class="fas fa-calendar"></i> ${dateStr}</strong>
            ${m.health_score != null ? `<span class="badge badge-${m.health_score >= 70 ? 'success' : m.health_score >= 40 ? 'warning' : 'danger'}" style="margin-left:0.5rem;">Salud: ${m.health_score}%</span>` : ''}
            ${hasPhoto ? '<span style="margin-left:0.5rem;"><i class="fas fa-camera" style="color:var(--primary);"></i></span>' : ''}
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            ${i === 0 ? '<span class="badge badge-primary">Más reciente</span>' : ''}
            <i class="fas fa-chevron-right" style="color:var(--text-light);"></i>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:0.5rem;margin-top:0.75rem;">
          ${m.height_cm ? `<div style="text-align:center;padding:0.4rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Altura</div><strong>${m.height_cm} cm</strong></div>` : ''}
          ${m.trunk_diameter_cm ? `<div style="text-align:center;padding:0.4rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Tronco</div><strong>${m.trunk_diameter_cm} cm</strong></div>` : ''}
          ${m.crown_diameter_cm ? `<div style="text-align:center;padding:0.4rem;background:var(--bg);border-radius:6px;"><div class="text-small text-muted">Copa</div><strong>${m.crown_diameter_cm} cm</strong></div>` : ''}
        </div>
        ${cleanObs ? `<p class="text-small text-muted" style="margin-top:0.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;"><i class="fas fa-sticky-note"></i> ${escapeHtml(cleanObs.substring(0, 100))}${cleanObs.length > 100 ? '...' : ''}</p>` : ''}
      </div>`;
  }).join('');
}

// ========== DETAIL VIEW ==========
async function showMeasurementDetail(measId) {
  try {
    const { data: m, error } = await sb.from('tree_measurements').select('*').eq('id', measId).single();
    if (error || !m) { showToast('Error cargando detalle', 'error'); return; }

    const date = new Date(m.measurement_date);
    const dateStr = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let rubricData = null;
    let cleanObs = m.observations || '';
    const rubricMatch = cleanObs.match(/\[RUBROS\]\s*(\{.*\})/);
    if (rubricMatch) {
      try { rubricData = JSON.parse(rubricMatch[1]); } catch(e) {}
      cleanObs = cleanObs.replace(/\n?\n?\[RUBROS\].*$/, '').trim();
    }

    let rubricHtml = '';
    if (rubricData && Object.keys(rubricData).length > 0) {
      rubricHtml = '<h4 style="margin:1rem 0 0.5rem;">Evaluación por Rubros</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">';
      HEALTH_RUBRICS.forEach(r => {
        if (rubricData[r.key]) {
          const val = rubricData[r.key];
          const color = val >= 4 ? '#4CAF50' : val >= 3 ? '#FFC107' : '#f44336';
          rubricHtml += `<div style="padding:0.5rem;background:var(--bg);border-radius:6px;border-left:3px solid ${color};">
            <div class="text-small">${r.icon} ${r.label.replace(/^\d+\.\s*/, '')}</div>
            <strong style="color:${color};">${val}/5</strong>
          </div>`;
        }
      });
      rubricHtml += '</div>';
    }

    showModal(`Registro: ${dateStr}`, `
      <div style="text-align:center;margin-bottom:1rem;">
        ${m.health_score != null ? `<div style="font-size:2.5rem;font-weight:700;color:${m.health_score >= 70 ? '#4CAF50' : m.health_score >= 40 ? '#FFC107' : '#f44336'};">${m.health_score}%</div><div class="text-muted">Salud Estimada</div>` : ''}
      </div>

      ${m.photo_url ? `<div style="text-align:center;margin-bottom:1rem;"><img src="${m.photo_url}" alt="Foto del árbol" style="max-width:100%;max-height:400px;border-radius:12px;object-fit:cover;box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem;">
        ${m.height_cm ? `<div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">Altura</div><strong style="font-size:1.2rem;">${m.height_cm} cm</strong></div>` : '<div></div>'}
        ${m.trunk_diameter_cm ? `<div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">⌀ Tronco</div><strong style="font-size:1.2rem;">${m.trunk_diameter_cm} cm</strong></div>` : '<div></div>'}
        ${m.crown_diameter_cm ? `<div style="text-align:center;padding:0.75rem;background:var(--bg);border-radius:8px;"><div class="text-small text-muted">⌀ Copa</div><strong style="font-size:1.2rem;">${m.crown_diameter_cm} cm</strong></div>` : '<div></div>'}
      </div>

      ${rubricHtml}

      ${cleanObs ? `<div style="margin-top:1rem;padding:1rem;background:#f8f9fa;border-radius:8px;"><h4 style="margin-bottom:0.5rem;"><i class="fas fa-sticky-note"></i> Observaciones</h4><p>${escapeHtml(cleanObs)}</p></div>` : ''}

      <div class="text-small text-muted" style="margin-top:1rem;text-align:center;">Registrado: ${date.toLocaleString('es-MX')}</div>
    `);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ========== GOALS ==========
function buildGoals(tree, measurements) {
  const h = tree.health_score || 0;
  const n = measurements.length;
  const goals = [
    { title: 'Alcanzar salud del 90%', desc: 'Mantener cuidado consistente', progress: Math.min(100, Math.round(h / 90 * 100)), done: h >= 90 },
    { title: 'Realizar primer seguimiento', desc: 'Registra las primeras medidas', progress: n > 0 ? 100 : 0, done: n > 0 },
    { title: '3 registros de seguimiento', desc: 'Documenta el crecimiento', progress: Math.min(100, Math.round(n / 3 * 100)), done: n >= 3 },
    { title: 'Subir foto del árbol', desc: 'Registro visual', progress: measurements.some(m => m.photo_url) ? 100 : 0, done: measurements.some(m => m.photo_url) },
    { title: 'Evaluación completa con IA', desc: 'Usa PUM-AI para evaluar los 10 rubros', progress: measurements.some(m => m.observations?.includes('[RUBROS]')) ? 100 : 0, done: measurements.some(m => m.observations?.includes('[RUBROS]')) },
    { title: 'Seguimiento mensual (3 meses)', desc: 'Al menos 1 registro por mes', progress: Math.min(100, Math.round(getMonthlyProgress(measurements) / 3 * 100)), done: getMonthlyProgress(measurements) >= 3 }
  ];
  return goals.map(g => `
    <div style="display:flex;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid var(--border-light);">
      <div style="font-size:1.5rem;">${g.done ? '✅' : '⬜'}</div>
      <div style="flex:1;"><strong>${g.title}</strong><p class="text-small text-muted" style="margin:0.25rem 0 0.5rem;">${g.desc}</p>
        <div style="height:6px;background:#eee;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${g.progress}%;background:${g.done ? 'var(--success)' : 'var(--primary)'};border-radius:3px;"></div></div>
        <small class="text-muted">${g.progress}%</small>
      </div>
    </div>
  `).join('');
}

function getMonthlyProgress(measurements) {
  const months = new Set();
  measurements.forEach(m => { const d = new Date(m.measurement_date); months.add(`${d.getFullYear()}-${d.getMonth()}`); });
  return months.size;
}

// ========== SUB-TAB NAV ==========
function switchMiArbolTab(tabId) {
  document.querySelectorAll('.mi-arbol-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.mi-arbol-tab').forEach(btn => { btn.classList.remove('active', 'btn-primary'); btn.classList.add('btn-outline'); });
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  const btn = document.querySelector(`.mi-arbol-tab[data-tab="${tabId}"]`);
  if (btn) { btn.classList.add('active', 'btn-primary'); btn.classList.remove('btn-outline'); }
}

// ========== MAP ==========
function initTreeMap(tree) {
  if (tree.location_lat && tree.location_lng) {
    setTimeout(() => {
      const c = document.getElementById('treeMapContainer');
      if (!c || typeof L === 'undefined' || c._leaflet_id) return;
      const map = L.map('treeMapContainer').setView([tree.location_lat, tree.location_lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
      L.marker([tree.location_lat, tree.location_lng]).addTo(map).bindPopup(`<b>${escapeHtml(tree.common_name || tree.species)}</b><br>${escapeHtml(tree.tree_code)}`).openPopup();
      setTimeout(() => map.invalidateSize(), 200);
    }, 300);
  } else {
    const c = document.getElementById('treeMapContainer');
    if (c) c.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-light);"><p>Sin coordenadas registradas</p></div>';
  }
}

// ========== INFORMACIÓN SECTION ==========
function loadInfoSection() {
  const endemicEl = document.getElementById('info-endemic-trees');
  const specialistEl = document.getElementById('info-specialists');
  if (endemicEl) {
    endemicEl.innerHTML = `<h3 style="margin-bottom:1.5rem;">🌿 Árboles Endémicos de Referencia</h3>
      <p class="text-muted" style="margin-bottom:1.5rem;">Especies nativas del campus y Valle de México.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${ENDEMIC_TREE_REFERENCE.map(r => `<div style="background:white;border-radius:12px;padding:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:3px solid var(--accent);">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;"><span style="font-size:1.5rem;">${r.icon}</span><div><strong>${escapeHtml(r.common_name)}</strong><div class="text-small text-muted"><em>${escapeHtml(r.species)}</em></div></div></div>
          <p class="text-small" style="margin-bottom:0.5rem;">${r.description}</p>
          <div style="background:#f0faf4;padding:0.5rem 0.75rem;border-radius:6px;font-size:0.85rem;">💡 ${r.care}</div>
        </div>`).join('')}
      </div>`;
  }
  if (specialistEl) {
    specialistEl.innerHTML = `<h3 style="margin-bottom:1.5rem;">👨‍🔬 Especialistas de Apoyo</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">
        ${SPECIALIST_CONTACTS.map(s => `<div style="background:white;border-radius:12px;padding:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;gap:1rem;">
          <div style="font-size:2rem;">${s.icon}</div><div><strong>${escapeHtml(s.name)}</strong><div class="text-small" style="color:var(--primary);">${escapeHtml(s.specialty)}</div><div class="text-small text-muted">${escapeHtml(s.department)}</div></div>
        </div>`).join('')}
      </div>`;
  }
}

// ========== EXPOSE ==========
window.loadMyTree = loadMyTree;
window.switchMiArbolTab = switchMiArbolTab;
window.saveMeasurement = saveMeasurement;
window.showMeasurementDetail = showMeasurementDetail;
window.analyzePhotoWithAI = analyzePhotoWithAI;
window.handleMeasPhoto = handleMeasPhoto;
window.recalcHealth = recalcHealth;
window.loadInfoSection = loadInfoSection;
