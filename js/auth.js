// ============================================================================
// AUTH - Login, Logout, Session Management, Profile
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
  updateUserDisplay();
}

function updateUserDisplay() {
  if (!currentUserProfile) return;

  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  const avatarImgEl = document.getElementById('userAvatarImg');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownEmail = document.getElementById('dropdownUserEmail');
  const dropdownRole = document.getElementById('dropdownUserRole');

  const displayName = currentUserProfile.full_name || 'Usuario';
  const initial = displayName.charAt(0).toUpperCase();

  if (nameEl) nameEl.textContent = displayName;
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownEmail) dropdownEmail.textContent = currentUser?.email || '';
  if (dropdownRole) {
    const roleLabels = { admin: 'Administrador', specialist: 'Especialista', user: 'Usuario' };
    dropdownRole.textContent = roleLabels[currentUserProfile.role] || currentUserProfile.role;
  }

  // Handle avatar photo
  if (currentUserProfile.avatar_url) {
    if (avatarImgEl) {
      avatarImgEl.src = currentUserProfile.avatar_url;
      avatarImgEl.style.display = 'block';
    }
    if (avatarEl) avatarEl.style.display = 'none';
  } else {
    if (avatarImgEl) avatarImgEl.style.display = 'none';
    if (avatarEl) {
      avatarEl.style.display = 'flex';
      avatarEl.textContent = initial;
    }
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
    showToast('Bienvenido, ' + (currentUserProfile?.full_name || ''), 'success');
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

    // Clear all local storage related to Supabase
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.startsWith('supabase'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Also clear session storage
    sessionStorage.clear();

    showLoginScreen();
    showToast('Sesión cerrada correctamente', 'info');
  } catch (err) {
    console.error('Logout error:', err);
    // Force cleanup even on error
    currentUser = null;
    currentUserProfile = null;
    localStorage.clear();
    sessionStorage.clear();
    showLoginScreen();
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
      updateUserDisplay();
    }
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

// ========== PROFILE MODAL ==========
function openProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Close dropdown
  const dd = document.getElementById('userDropdown');
  if (dd) dd.classList.remove('show');

  // Fill form with current data
  if (currentUserProfile) {
    document.getElementById('profile-fullname').value = currentUserProfile.full_name || '';
    document.getElementById('profile-email').value = currentUser?.email || '';
    document.getElementById('profile-phone').value = currentUserProfile.phone || '';
    document.getElementById('profile-academic-status').value = currentUserProfile.academic_status || '';
    document.getElementById('profile-department').value = currentUserProfile.department || '';

    // Avatar
    const preview = document.getElementById('profile-avatar-preview');
    const placeholder = document.getElementById('profile-avatar-placeholder');
    if (currentUserProfile.avatar_url) {
      preview.src = currentUserProfile.avatar_url;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = (currentUserProfile.full_name || 'U').charAt(0).toUpperCase();
    }
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
}

let pendingAvatarBase64 = null;

function handleProfilePhotoChange(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  if (file.size > 2 * 1024 * 1024) {
    showToast('La imagen no debe superar 2MB', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    pendingAvatarBase64 = e.target.result;
    const preview = document.getElementById('profile-avatar-preview');
    const placeholder = document.getElementById('profile-avatar-placeholder');
    if (preview) {
      preview.src = pendingAvatarBase64;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function saveProfile(e) {
  if (e) e.preventDefault();
  if (!currentUser) return;

  const fullName = document.getElementById('profile-fullname').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const academicStatus = document.getElementById('profile-academic-status').value;
  const department = document.getElementById('profile-department').value.trim();

  if (!fullName) {
    showToast('El nombre es obligatorio', 'warning');
    return;
  }

  const updates = {
    full_name: fullName,
    phone: phone || null,
    academic_status: academicStatus || null,
    department: department || null,
    updated_at: new Date().toISOString()
  };

  // Handle avatar upload
  if (pendingAvatarBase64) {
    // Store avatar as data URL in avatar_url field (simple approach)
    // For large scale, use Supabase Storage instead
    updates.avatar_url = pendingAvatarBase64;
    pendingAvatarBase64 = null;
  }

  try {
    const { error } = await sb
      .from('user_profiles')
      .update(updates)
      .eq('id', currentUser.id);

    if (error) {
      console.error('Profile update error:', error);
      showToast('Error al guardar: ' + error.message, 'error');
      return;
    }

    // Update local profile
    Object.assign(currentUserProfile, updates);
    updateUserDisplay();
    closeProfileModal();
    showToast('Perfil actualizado correctamente', 'success');
  } catch (err) {
    console.error('Profile save error:', err);
    showToast('Error al guardar el perfil', 'error');
  }
}

// Make functions globally accessible
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.handleProfilePhotoChange = handleProfilePhotoChange;
window.saveProfile = saveProfile;
