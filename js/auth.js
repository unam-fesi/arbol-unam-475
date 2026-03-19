// ============================================================================
// AUTH - Login, Logout, Session Management, Profile
// ============================================================================

let introFinished = false;
let pendingAfterIntro = null; // 'login' or 'app'

function initIntroVideo() {
  const overlay = document.getElementById('intro-video-overlay');
  const video = document.getElementById('intro-video');
  if (!overlay || !video) {
    // No video element, skip intro
    introFinished = true;
    return;
  }

  // When video ends, dismiss overlay and show what's pending
  video.addEventListener('ended', function() { dismissIntro(); });

  // If video fails to load (no file), skip intro
  video.addEventListener('error', function() {
    console.warn('Intro video not found, skipping...');
    dismissIntro();
  });

  // Also handle source error
  var source = video.querySelector('source');
  if (source) {
    source.addEventListener('error', function() {
      console.warn('Intro video source not found, skipping...');
      dismissIntro();
    });
  }

  // iOS Safari: autoplay may be silently blocked (no error event fires).
  // Fallback: if video hasn't started playing within 3 seconds, dismiss.
  var safariTimeout = setTimeout(function() {
    if (!introFinished && (video.paused || video.readyState < 2)) {
      console.warn('Video autoplay blocked or stalled, skipping intro...');
      dismissIntro();
    }
  }, 3000);

  // Also try to explicitly play and catch rejection (iOS Safari)
  var playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(function(err) {
      console.warn('Video autoplay rejected:', err.message);
      clearTimeout(safariTimeout);
      dismissIntro();
    });
  }

  // Clear timeout once video starts playing normally
  video.addEventListener('playing', function() {
    clearTimeout(safariTimeout);
  });
}

function dismissIntro() {
  if (introFinished) return;
  introFinished = true;
  const overlay = document.getElementById('intro-video-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 500);
  }
  const video = document.getElementById('intro-video');
  if (video) { try { video.pause(); } catch(e) {} }

  // Show pending screen
  if (pendingAfterIntro === 'app') {
    showMainApp();
  } else {
    showLoginScreen();
  }
}

function skipIntro() {
  dismissIntro();
}

async function initApp() {
  // Start intro video
  initIntroVideo();

  // Check for existing session
  const { data: { session }, error } = await sb.auth.getSession();

  if (session) {
    currentUser = session.user;
    await loadUserProfile();
    if (introFinished) {
      showMainApp();
    } else {
      pendingAfterIntro = 'app';
    }
  } else {
    if (introFinished) {
      showLoginScreen();
    } else {
      pendingAfterIntro = 'login';
    }
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
    // Reset section caches
    if (typeof myTreeLoaded !== 'undefined') myTreeLoaded = false;
    if (typeof dashboardLoaded !== 'undefined') dashboardLoaded = false;

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

async function loadUserProfile(forceReload) {
  if (!currentUser) return;
  // Skip if already loaded (unless forced)
  if (currentUserProfile && !forceReload) {
    setupRoleBasedNav(currentUserProfile.role);
    updateUserDisplay();
    return;
  }
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
    document.getElementById('profile-account-number').value = currentUserProfile.account_number || '';
    document.getElementById('profile-birth-date').value = currentUserProfile.birth_date || '';
    document.getElementById('profile-academic-status').value = currentUserProfile.academic_status || '';
    document.getElementById('profile-campus').value = currentUserProfile.campus || '';

    // Avatar placeholder (initials)
    const placeholder = document.getElementById('profile-avatar-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.textContent = (currentUserProfile.full_name || 'U').charAt(0).toUpperCase();
    }
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
}

async function saveProfile(e) {
  if (e) e.preventDefault();
  if (!currentUser) return;

  const fullName = document.getElementById('profile-fullname').value.trim();
  const accountNumber = document.getElementById('profile-account-number').value.trim();
  const birthDate = document.getElementById('profile-birth-date').value;
  const academicStatus = document.getElementById('profile-academic-status').value;
  const campus = document.getElementById('profile-campus').value.trim();

  if (!fullName) {
    showToast('El nombre es obligatorio', 'warning');
    return;
  }

  const updates = {
    full_name: fullName,
    account_number: accountNumber || null,
    birth_date: birthDate || null,
    academic_status: academicStatus || null,
    campus: campus || null
  };

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
window.saveProfile = saveProfile;
window.skipIntro = skipIntro;
