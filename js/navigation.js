// ============================================================================
// NAVIGATION - Navbar, Sections, Role-based visibility
// ============================================================================

function showSection(sectionId) {
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
    else if (sectionId === 'section-pumai') initPumAI();
    else if (sectionId === 'section-admin') switchAdminTab('users');
    else if (sectionId === 'section-specialist') loadSpecialistTrees();
  }
}

function setupRoleBasedNav(role) {
  document.querySelectorAll('#navbarNav .nav-link[data-section]').forEach(link => {
    const section = link.dataset.section;
    let visible = true;

    if (section === 'section-admin' && role !== 'admin') visible = false;
    if (section === 'section-specialist' && !['specialist', 'admin'].includes(role)) visible = false;

    link.style.display = visible ? '' : 'none';
  });
}

// User menu dropdown toggle
document.addEventListener('DOMContentLoaded', function() {
  const menuBtn = document.getElementById('userMenuBtn');
  const dropdown = document.getElementById('userDropdown');

  if (menuBtn && dropdown) {
    menuBtn.addEventListener('click', () => dropdown.classList.toggle('show'));
    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});

window.showSection = showSection;
