// ============================================================================
// NAVIGATION - Navbar, Sections, Role-based visibility + Security
// ============================================================================

function showSection(sectionId) {
  // Normaliza el rol: si viene null/undefined → 'user' (más seguro)
  const role = (currentUserProfile?.role || 'user').toLowerCase();

  // SECURITY: block non-admin from admin section
  if (sectionId === 'section-admin') {
    if (role !== 'admin') {
      showToast('Acceso denegado: solo administradores', 'error');
      showSection('section-mi-arbol');
      return;
    }
  }

  // SECURITY: block non-specialist/non-admin from specialist section
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

  // Update active nav link
  document.querySelectorAll('#navbarNav .nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.section === sectionId) {
      link.classList.add('active');
    }
  });

  // Show selected section
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = 'block';

    // Load data for section
    if (sectionId === 'section-mi-arbol') loadMyTree();
    else if (sectionId === 'section-info') loadInfoSection();
    else if (sectionId === 'section-pumai') initPumAI();
    else if (sectionId === 'section-admin') switchAdminTab('users');
    else if (sectionId === 'section-specialist') loadSpecialistTrees();
  }
}

function setupRoleBasedNav(role) {
  // Normaliza: null/undefined → 'user', y lowercase
  const r = (role || 'user').toLowerCase();
  const isAdmin = r === 'admin';
  const isSpecialist = r === 'specialist';

  document.querySelectorAll('#navbarNav .nav-link[data-section]').forEach(link => {
    const section = link.dataset.section;
    let visible = true;

    // Tabs administrativos: solo admin
    if (section === 'section-admin' && !isAdmin) visible = false;
    // Tab especialista: specialist o admin
    if (section === 'section-specialist' && !(isSpecialist || isAdmin)) visible = false;

    link.style.display = visible ? '' : 'none';
  });

  // Defense in depth: borra el contenido de admin para no-admins
  const adminSection = document.getElementById('section-admin');
  if (adminSection && !isAdmin) {
    adminSection.style.display = 'none';
    adminSection.innerHTML = ''; // limpia DOM (no se queda renderizado en background)
  }

  // Defense in depth: oculta especialista
  const specialistSection = document.getElementById('section-specialist');
  if (specialistSection && !(isSpecialist || isAdmin)) {
    specialistSection.style.display = 'none';
  }

  // Si el usuario está en una sección que no debería ver, lo redirige
  // (caso: refrescó la página estando en /admin)
  const visible = document.querySelector('[id^="section-"]:not([style*="display:none"])');
  if (visible && visible.id === 'section-admin' && !isAdmin) {
    showSection('section-mi-arbol');
  }
  if (visible && visible.id === 'section-specialist' && !(isSpecialist || isAdmin)) {
    showSection('section-mi-arbol');
  }
}

// NOTE: User dropdown toggle is handled in index.html DOMContentLoaded to avoid duplicates

window.showSection = showSection;
