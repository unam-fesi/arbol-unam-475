// ============================================================================
// AUTH - Login, Logout, Session Management
// ============================================================================

async function initApp() {
  // Check for existing session
  const { data: { session }, error } = await sb.auth.getSession();

  if (session) {
    currentUser = session.user;
    await loadUserProfile();
    showMainApp();
  } else {
    showLoginScreen();
  }

  // Listen for auth state changes
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      loadUserProfile().then(() => showMainApp());
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentUserProfile = null;
      showLoginScreen();
    }
  });
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  showSection('section-mi-arbol');

  // Update user display
  if (currentUserProfile) {
    const nameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = currentUserProfile.full_name || 'Usuario';
    if (avatarEl) avatarEl.textContent = (currentUserProfile.full_name || 'U').charAt(0).toUpperCase();
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (!email || !password) {
    errorEl.textContent = 'Completa todos los campos';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      errorEl.textContent = error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos'
        : error.message;
      errorEl.style.display = 'block';
      return;
    }

    currentUser = data.user;
    await loadUserProfile();
    showMainApp();
    showToast('Bienvenido', 'success');
  } catch (err) {
    errorEl.textContent = 'Error de conexión';
    errorEl.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    await sb.auth.signOut();
    currentUser = null;
    currentUserProfile = null;
    showLoginScreen();
    showToast('Sesión cerrada', 'info');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

async function loadUserProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await sb
      .from('user_profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading profile:', error);
      return;
    }

    if (data) {
      currentUserProfile = data;
      setupRoleBasedNav(data.role);
    }
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

// Make functions globally accessible
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
