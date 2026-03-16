// ============================================================================
// NAVIGATION - Navbar, Sections, Role-based visibility + Security
// ============================================================================

function showSection(sectionId) {
  // SECURITY: block non-admin from admin section
  if (sectionId === 'section-admin') {
    if (!currentUserProfile || currentUserProfile.role !== 'admin') {
      showToast('Acceso denegado: solo administradores', 'error');
      showSection('section-mi-arbol');
      return;
    }
  }

  // SECURITY: block non-specialist/non-admin from specialist section
  if (sectionId === 'section-specialist') {
    if (!currentUserProfile || !['specialist', 'admin'].includes(currentUserProfile.role)) {
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
  document.querySelectorAll('#navbarNav .nav-link[data-section]').forEach(link => {
    const section = link.dataset.section;
    let visible = true;

    // Hide admin link for non-admins
    if (section === 'section-admin' && role !== 'admin') visible = false;
    // Hide specialist link for non-specialist/non-admin
    if (section === 'section-specialist' && !['specialist', 'admin'].includes(role)) visible = false;

    link.style.display = visible ? '' : 'none';
  });

  // Also hide the actual section content for non-admins (defense in depth)
  const adminSection = document.getElementById('section-admin');
  if (adminSection && role !== 'admin') {
    adminSection.style.display = 'none';
    adminSection.innerHTML = ''; // Clear content entirely for non-admins
  }

  const specialistSection = document.getElementById('section-specialist');
  if (specialistSection && !['specialist', 'admin'].includes(role)) {
    specialistSection.style.display = 'none';
  }
}

// NOTE: User dropdown toggle is handled in index.html DOMContentLoaded to avoid duplicates

window.showSection = showSection;
