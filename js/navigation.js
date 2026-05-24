// ============================================================================
// NAVIGATION - Navbar, Sections, Role-based visibility + Security
// ============================================================================

function showSection(sectionId) {
  const role = (currentUserProfile?.role || 'user').toLowerCase();

  // SECURITY: admin section accesible para admin (principal) y admin-campus
  if (sectionId === 'section-admin') {
    if (!['admin', 'admin-campus', 'responsable'].includes(role)) {
      showToast('Acceso denegado', 'error');
      showSection('section-mi-arbol');
      return;
    }
  }

  // SECURITY: specialist section
  if (sectionId === 'section-specialist') {
    if (!['specialist', 'admin'].includes(role)) {
      showToast('Acceso denegado: solo especialistas', 'error');
      showSection('section-mi-arbol');
      return;
    }
  }

  // Hide all sections
  document.querySelectorAll('[id^="section-"]').forEach(s => {
    s.style.display = 'none';
  });

  // Cleanup del Walkthrough si el user sale de la sección — detiene el canto
  // del colibrí, el animationFrame y libera pointer lock. Idempotente y barato:
  // si el módulo no estaba activo no hace nada.
  if (window.DashboardWalkthrough && typeof window.DashboardWalkthrough.destroy === 'function') {
    try { window.DashboardWalkthrough.destroy(); } catch (_) {}
  }

  // Update active nav link
  document.querySelectorAll('#navbarNav .nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.section === sectionId) {
      link.classList.add('active');
    }
  });

  // Persistir sección activa para que al regresar a la app no resetee a Mi Árbol
  try { localStorage.setItem('lastActiveSection', sectionId); } catch (_) {}

  // Show selected section
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = 'block';

    // Load data for section
    if (sectionId === 'section-mi-arbol') {
      // Si existe el orquestador de portafolio (jardín + árbol), úsalo;
      // si no, fallback al loader original de árbol
      if (typeof loadMyPortfolio === 'function') loadMyPortfolio();
      else if (typeof loadMyTree === 'function') loadMyTree();
    }
    else if (sectionId === 'section-info') loadInfoSection();
    else if (sectionId === 'section-pumai') initPumAI();
    else if (sectionId === 'section-admin') {
      switchAdminTab('users');
      // Aplicar restricciones de UI según el rol (oculta tabs prohibidas, etc.)
      if (typeof applyRoleBasedUIRestrictions === 'function') {
        setTimeout(applyRoleBasedUIRestrictions, 50);
      }
    }
    else if (sectionId === 'section-specialist') loadSpecialistTrees();
  }
}

function setupRoleBasedNav(role) {
  const r = (role || 'user').toLowerCase();
  const isAdmin = r === 'admin';
  const isAdminCampus = r === 'admin-campus';
  const isResponsable = r === 'responsable';
  const isSpecialist = r === 'specialist';
  // admin, admin-campus y responsable pueden ver el tab admin (con restricciones internas)
  const canSeeAdmin = isAdmin || isAdminCampus || isResponsable;

  document.querySelectorAll('#navbarNav .nav-link[data-section]').forEach(link => {
    const section = link.dataset.section;
    let visible = true;
    if (section === 'section-admin' && !canSeeAdmin) visible = false;
    if (section === 'section-specialist' && !(isSpecialist || isAdmin)) visible = false;
    link.style.display = visible ? '' : 'none';
  });

  // Defense in depth: borra el contenido de admin para usuarios sin acceso
  const adminSection = document.getElementById('section-admin');
  if (adminSection && !canSeeAdmin) {
    adminSection.style.display = 'none';
    adminSection.innerHTML = '';
  }

  const specialistSection = document.getElementById('section-specialist');
  if (specialistSection && !(isSpecialist || isAdmin)) {
    specialistSection.style.display = 'none';
  }

  const visible = document.querySelector('[id^="section-"]:not([style*="display:none"])');
  if (visible && visible.id === 'section-admin' && !canSeeAdmin) {
    showSection('section-mi-arbol');
  }
  if (visible && visible.id === 'section-specialist' && !(isSpecialist || isAdmin)) {
    showSection('section-mi-arbol');
  }
}

// NOTE: User dropdown toggle is handled in index.html DOMContentLoaded to avoid duplicates

window.showSection = showSection;
