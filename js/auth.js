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
  // ----- Public deep link: ?report=<tree_code> NO requiere login -----
  // Esto permite que cualquier persona escanee el QR del árbol y reporte
  // un problema sin tener cuenta.
  const _params = new URLSearchParams(window.location.search);
  const _publicReport = _params.get('report');
  if (_publicReport) {
    // Salta el video intro y la pantalla de login
    introFinished = true;
    const overlay = document.getElementById('intro-video-overlay');
    if (overlay) overlay.style.display = 'none';
    showPublicReportScreen(_publicReport);
    return;
  }

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
  // Sync any offline-queued measurements
  if (window.OfflineQueue && navigator.onLine) {
    window.OfflineQueue.syncPending().then(r => {
      if (r?.synced && typeof showToast === 'function') {
        showToast(`Sincronizadas ${r.synced} mediciones offline`, 'success');
      }
    }).catch(() => {});
  }
  // Handle deep links (?t=<code> from QR)
  setTimeout(handleDeepLink, 600);
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
    // Only remove Supabase keys (don't clear all — shared domain on GitHub Pages)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.startsWith('supabase'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
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

// ========== FORGOT PASSWORD (#20) ==========
function showForgotPassword() {
  const p = document.getElementById('forgot-password-panel');
  if (p) p.style.display = 'block';
}

function hideForgotPassword() {
  const p = document.getElementById('forgot-password-panel');
  if (p) p.style.display = 'none';
  const s = document.getElementById('forgot-status');
  if (s) s.textContent = '';
}

async function sendPasswordReset() {
  const email = document.getElementById('forgot-email')?.value.trim();
  const status = document.getElementById('forgot-status');
  if (!email) { if (status) status.textContent = 'Ingresa tu correo'; return; }
  if (status) { status.textContent = 'Enviando...'; status.style.color = 'var(--text-light)'; }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname + '?reset=1'
    });
    if (error) throw error;
    if (status) {
      status.textContent = '✓ Si el correo existe, recibirás un enlace en breve.';
      status.style.color = 'var(--success, #2e7d32)';
    }
    setTimeout(hideForgotPassword, 4000);
  } catch (err) {
    if (status) {
      status.textContent = 'Error: ' + err.message;
      status.style.color = 'var(--danger)';
    }
  }
}

// ========== DEEP LINK HANDLER (#1 — QR scan) ==========
// When a user scans a tree QR they arrive at /?t=<tree_code>
async function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const treeCode = params.get('t');
  const reportTree = params.get('report');
  if (!treeCode && !reportTree) return;
  // Wait for session
  const { data } = await sb.auth.getSession();
  if (!data?.session) return; // login first; will be re-checked after login
  const code = treeCode || reportTree;
  // Look up tree
  const { data: tree } = await sb.from('trees_catalog')
    .select('id, tree_code, common_name, species, campus')
    .eq('tree_code', code).single();
  if (!tree) {
    if (typeof showToast === 'function') showToast('Árbol ' + code + ' no encontrado', 'warning');
    return;
  }
  if (reportTree && typeof openCitizenReport === 'function') {
    openCitizenReport(tree.id, tree.tree_code, tree.common_name);
  } else if (typeof showSpecialistTree === 'function') {
    showSection('section-specialist');
    setTimeout(() => showSpecialistTree(tree.id), 500);
  }
}

// ========== PUBLIC REPORT SCREEN (QR ciudadano, sin login) ==========
async function showPublicReportScreen(treeCode) {
  // Oculta login y main app
  const login = document.getElementById('login-screen');
  const main = document.getElementById('main-app');
  if (login) login.style.display = 'none';
  if (main) main.style.display = 'none';

  // Crear overlay con form
  const overlay = document.createElement('div');
  overlay.id = 'public-report-overlay';
  overlay.className = 'login-container';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="login-box" style="max-width:480px;">
      <div class="login-logo">
        <div class="login-logo-text" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;">
          <span style="font-size:1.6rem;">🌳</span> Reporte Ciudadano
        </div>
        <div class="login-logo-subtitle">Proyecto Árbol UNAM 475</div>
      </div>
      <div id="public-report-tree-info" style="margin-bottom:1rem;text-align:center;color:var(--primary-dark);">
        Cargando datos del árbol…
      </div>
      <form id="public-report-form" onsubmit="submitPublicReport(event)">
        <div class="login-form-group">
          <label for="pr-name">Tu nombre (opcional)</label>
          <input type="text" id="pr-name" placeholder="Anónimo">
        </div>
        <div class="login-form-group">
          <label for="pr-contact">Tu contacto (opcional)</label>
          <input type="text" id="pr-contact" placeholder="email o teléfono">
        </div>
        <div class="login-form-group">
          <label for="pr-title">Título del reporte <span style="color:var(--danger);">*</span></label>
          <input type="text" id="pr-title" required placeholder="Ej: Rama caída, plaga visible">
        </div>
        <div class="login-form-group">
          <label for="pr-urgency">Urgencia</label>
          <select id="pr-urgency" style="width:100%;padding:0.85rem 1rem;border:1.5px solid var(--border-light);border-radius:12px;background:rgba(255,253,247,0.7);font-size:0.95rem;">
            <option value="low">Baja</option>
            <option value="normal" selected>Normal</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>
        <div class="login-form-group">
          <label for="pr-description">Descripción del problema <span style="color:var(--danger);">*</span></label>
          <textarea id="pr-description" required rows="4" style="width:100%;padding:0.85rem 1rem;border:1.5px solid var(--border-light);border-radius:12px;background:rgba(255,253,247,0.7);font-size:0.95rem;font-family:inherit;" placeholder="Describe lo que observaste…"></textarea>
        </div>
        <button type="submit" class="login-btn">
          <i class="fas fa-paper-plane"></i> Enviar reporte
        </button>
        <div id="pr-status" class="text-small" style="margin-top:0.75rem;text-align:center;"></div>
      </form>
      <div class="login-footer">
        <p style="font-size:0.78rem;color:var(--text-light);">Universidad Nacional Autónoma de México</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Lookup tree info (anon — política RLS permite SELECT autenticado)
  // Si la política bloquea anon, la búsqueda fallará — usamos un fallback
  // mostrando solo el código.
  try {
    const { data: tree, error } = await sb.from('trees_catalog')
      .select('id, tree_code, common_name, species, campus')
      .eq('tree_code', treeCode).maybeSingle();
    const info = document.getElementById('public-report-tree-info');
    if (tree && info) {
      info.innerHTML = `
        <div style="background:rgba(74,124,42,0.10);padding:0.85rem 1rem;border-radius:12px;border-left:3px solid var(--primary);">
          <strong>${escapeHtml(tree.common_name || tree.species || 'Árbol')}</strong>
          <div class="text-small text-muted">Código: ${escapeHtml(tree.tree_code)} · ${escapeHtml(tree.campus || 'Campus desconocido')}</div>
        </div>
      `;
      // Guardar tree_id en el form para el submit
      document.getElementById('public-report-form').dataset.treeId = String(tree.id);
      document.getElementById('public-report-form').dataset.treeCode = tree.tree_code;
    } else {
      if (info) {
        info.innerHTML = `<div class="text-muted text-small">Árbol con código <code>${escapeHtml(treeCode)}</code></div>`;
      }
      document.getElementById('public-report-form').dataset.treeCode = treeCode;
    }
  } catch (e) {
    const info = document.getElementById('public-report-tree-info');
    if (info) info.innerHTML = `<div class="text-muted">Código: ${escapeHtml(treeCode)}</div>`;
    document.getElementById('public-report-form').dataset.treeCode = treeCode;
  }
}

async function submitPublicReport(e) {
  if (e) e.preventDefault();
  const form = document.getElementById('public-report-form');
  const status = document.getElementById('pr-status');
  if (!form) return;

  const treeCode = form.dataset.treeCode;
  const treeId = form.dataset.treeId ? parseInt(form.dataset.treeId, 10) : null;
  const title = document.getElementById('pr-title').value.trim();
  const description = document.getElementById('pr-description').value.trim();
  const urgency = document.getElementById('pr-urgency').value;
  const reporterName = document.getElementById('pr-name').value.trim();
  const reporterContact = document.getElementById('pr-contact').value.trim();

  if (!title || !description) {
    if (status) { status.textContent = 'Por favor completa título y descripción.'; status.style.color = 'var(--danger)'; }
    return;
  }
  if (!treeId) {
    if (status) { status.textContent = 'No se pudo identificar el árbol.'; status.style.color = 'var(--danger)'; }
    return;
  }

  if (status) { status.textContent = 'Enviando…'; status.style.color = 'var(--text-light)'; }

  try {
    // Llamar Edge Function pública (sin auth)
    const url = SUPABASE_URL + '/functions/v1/submit-public-report';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY  // anon key como bearer
      },
      body: JSON.stringify({
        tree_id: treeId, tree_code: treeCode,
        title, description, urgency,
        reporter_name: reporterName || null,
        reporter_contact: reporterContact || null
      })
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Error ' + r.status);
    if (status) {
      status.style.color = 'var(--success)';
      status.innerHTML = '✓ Reporte enviado. Gracias por cuidar el bosque UNAM.';
    }
    form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
    setTimeout(() => {
      window.location.href = window.location.pathname;  // limpia URL params
    }, 3000);
  } catch (err) {
    if (status) {
      status.style.color = 'var(--danger)';
      status.textContent = 'Error: ' + err.message;
    }
  }
}

// ========== SERVICE WORKER REGISTRATION (#7 PWA) ==========
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Use absolute path relative to current location
  const swUrl = (window.location.pathname.replace(/\/[^\/]*$/, '/') + 'sw.js').replace(/\/+/g, '/');
  navigator.serviceWorker.register(swUrl).then(reg => {
    console.log('SW registered:', reg.scope);
  }).catch(err => console.warn('SW registration failed:', err));
}

// Make functions globally accessible
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;
window.skipIntro = skipIntro;
window.showForgotPassword = showForgotPassword;
window.hideForgotPassword = hideForgotPassword;
window.sendPasswordReset = sendPasswordReset;
window.handleDeepLink = handleDeepLink;
window.registerServiceWorker = registerServiceWorker;
window.showPublicReportScreen = showPublicReportScreen;
window.submitPublicReport = submitPublicReport;
