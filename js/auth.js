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
  // ----- Deep link unificado: ?tree=<code> -----
  // Un solo QR por árbol. Al escanearlo, se muestra una pantalla de
  // bienvenida con dos opciones: iniciar sesión (cuidador/admin) o
  // reportar problema como ciudadano (sin cuenta).
  // Backwards compat: ?t= y ?report= siguen funcionando.
  const _params = new URLSearchParams(window.location.search);
  let _treeCode = _params.get('tree') || _params.get('t') || _params.get('report');
  const _isReportShortcut = !!_params.get('report');  // legacy
  // SECURITY: validar que el tree_code matchea el formato esperado antes de
  // usarlo en CUALQUIER lado. Esto bloquea vectores XSS de tipo
  // ?tree=');alert(1)// y limita a códigos legítimos (alfanuméricos, guiones).
  if (_treeCode && !/^[A-Za-z0-9_-]{1,40}$/.test(_treeCode)) {
    console.warn('[auth] tree code inválido, ignorando:', _treeCode);
    _treeCode = null;
  }
  if (_treeCode) {
    introFinished = true;
    const overlay = document.getElementById('intro-video-overlay');
    if (overlay) overlay.style.display = 'none';

    // Si la sesión ya está activa, llevarlo directo al árbol (sin landing)
    const { data: { session: _s } } = await sb.auth.getSession();
    if (_s) {
      currentUser = _s.user;
      await loadUserProfile();
      showMainApp();
      setTimeout(() => {
        if (typeof showSpecialistTree === 'function' || typeof loadMyTree === 'function') {
          handleDeepLinkTree(_treeCode);
        }
      }, 500);
      return;
    }

    // Sin sesión: si vino con ?report=, ir directo al form. Si vino con
    // ?tree= o ?t=, mostrar landing con elección.
    if (_isReportShortcut) {
      showPublicReportScreen(_treeCode);
    } else {
      showQrLandingScreen(_treeCode);
    }
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
  // IMPORTANTE: Supabase dispara SIGNED_IN cada vez que se refresca el token,
  // incluyendo cuando regresas a la pestaña tras estar en otra app. Para evitar
  // que showMainApp() se llame innecesariamente (lo que resetearía la sección
  // activa visualmente), distinguimos entre INITIAL login y re-auth.
  let _mainAppShown = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      // Solo mostrar la app la PRIMERA vez. Subsiguientes SIGNED_IN
      // (por refresh de token) no deben tocar la UI.
      if (!_mainAppShown) {
        _mainAppShown = true;
        loadUserProfile().then(() => showMainApp());
      } else {
        // Solo refrescar el perfil silenciosamente, sin tocar la sección
        loadUserProfile();
      }
    } else if (event === 'TOKEN_REFRESHED') {
      // Token refresh transparente — no tocar la UI
    } else if (event === 'SIGNED_OUT') {
      _mainAppShown = false;
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
  // Marca global: la app ya está montada, futuros SIGNED_IN del listener
  // no deben re-llamar a showMainApp (evita reseteo de sección al volver
  // de otra app cuando Supabase refresca el token).
  try { window._mainAppShown = true; } catch (_) {}
  // Restaurar última sección activa (no resetear a Mi Árbol al regresar a la app)
  let savedSection = 'section-mi-arbol';
  try {
    const ss = localStorage.getItem('lastActiveSection');
    if (ss && document.getElementById(ss)) savedSection = ss;
  } catch (_) {}
  showSection(savedSection);
  updateUserDisplay();
  // Sync any offline-queued measurements
  if (window.OfflineQueue && navigator.onLine) {
    window.OfflineQueue.syncPending().then(r => {
      if (r?.synced && typeof showToast === 'function') {
        showToast(`Sincronizadas ${r.synced} mediciones offline`, 'success');
      }
    }).catch(() => {});
  }
  // Pending tree code (de QR + login flow): redirigir al árbol
  let pendingTree = null;
  try { pendingTree = sessionStorage.getItem('pending_tree_code'); } catch (e) {}
  if (pendingTree) {
    setTimeout(() => handleDeepLinkTree(pendingTree), 600);
  } else {
    // Handle deep links legacy (?t=<code> from QR)
    setTimeout(handleDeepLink, 600);
  }
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

// Tracking client-side de intentos fallidos por email (para mostrar captcha)
const _failCountKey = (email) => `auth_fails_${email.toLowerCase()}`;
function _getFailCount(email) { return Number(sessionStorage.getItem(_failCountKey(email)) || 0); }
function _incrFailCount(email) { sessionStorage.setItem(_failCountKey(email), String(_getFailCount(email) + 1)); }
function _resetFailCount(email) { sessionStorage.removeItem(_failCountKey(email)); }

// Token de Turnstile (lo setea el callback global)
let _turnstileToken = null;
window.onTurnstileVerified = (token) => { _turnstileToken = token; };
window.onTurnstileLoad = () => {};

async function handleLogin(e) {
  if (e) e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const honeypot = (document.getElementById('login-website') || {}).value || '';
  const errorEl = document.getElementById('login-error');

  if (!email || !password) {
    errorEl.textContent = 'Completa todos los campos';
    errorEl.style.display = 'block';
    return;
  }

  // HONEYPOT: si el campo invisible viene lleno → bot. Registrar + rechazar.
  if (honeypot.trim().length > 0) {
    console.warn('[auth] honeypot triggered, rejecting');
    errorEl.textContent = 'Solicitud rechazada (anti-bot).';
    errorEl.style.display = 'block';
    // Disparar fetch a secure-login con bandera honeypot para que se registre
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/secure-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ email, password: '', honeypot: honeypot }),
      });
    } catch(_) {}
    return;
  }

  // CAPTCHA: si el email ya tiene ≥3 fallos en esta sesión, requerir Turnstile
  const failCount = _getFailCount(email);
  const captchaContainer = document.getElementById('login-captcha-container');
  if (failCount >= 3) {
    if (captchaContainer) captchaContainer.style.display = 'block';
    if (!_turnstileToken) {
      errorEl.textContent = 'Por favor verifica el captcha antes de continuar.';
      errorEl.style.display = 'block';
      return;
    }
  }

  errorEl.style.display = 'none';

  try {
    // Llamar a la Edge Function `secure-login` (rate-limit + bloqueo por IP).
    // Si la función no está deployada todavía, caer al signIn directo (legacy).
    let data, error;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/secure-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ email, password, captcha_token: _turnstileToken }),
      });
      const result = await resp.json();
      if (resp.status === 429 || result.error === 'blocked') {
        // IP bloqueada por rate limit
        errorEl.innerHTML = `🚫 <strong>Acceso bloqueado.</strong><br>` + (result.message || 'Demasiados intentos fallidos.');
        errorEl.style.display = 'block';
        errorEl.style.color = '#b54f3a';
        return;
      }
      if (!resp.ok || result.error) {
        _incrFailCount(email);
        let msg = result.message || 'Correo o contraseña incorrectos';
        if (result.blocked) {
          msg += ' (esta IP ha sido bloqueada)';
        } else if (result.recent_fails && result.recent_fails >= 3) {
          msg += ` · ${result.recent_fails} intentos recientes`;
        }
        // Mostrar captcha desde el 3er fallo
        if (_getFailCount(email) >= 3 && captchaContainer) {
          captchaContainer.style.display = 'block';
          msg += ' · Verifica el captcha para volver a intentar.';
        }
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        // Reset captcha token (cada intento requiere uno nuevo)
        _turnstileToken = null;
        try { window.turnstile && window.turnstile.reset(); } catch(_) {}
        return;
      }
      // login OK → reset
      _resetFailCount(email);
      _turnstileToken = null;
      // Edge Function devolvió session — instalarla en el cliente local
      if (result.session) {
        await sb.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }
      data = { user: result.user, session: result.session, _anomaly: result.anomaly };
      error = null;
    } catch (edgeErr) {
      console.warn('secure-login no disponible, fallback a signIn directo:', edgeErr);
      const r = await sb.auth.signInWithPassword({ email, password });
      data = r.data; error = r.error;
    }

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
    // Notificar al usuario si secure-login detectó un login anómalo
    if (data._anomaly) {
      setTimeout(() => {
        const kind = data._anomaly.new_ip ? 'ubicación' : 'dispositivo';
        showToast(`🔔 Login desde nueva ${kind}. Revisa tus notificaciones.`, 'warning');
      }, 1500);
    }
    // Iniciar el timer de inactividad (60 min default)
    if (window.SessionTimeout) window.SessionTimeout.start();
    // Splash cinematográfico post-login (una vez por sesión del browser)
    try {
      if (window.SplashVideo && !sessionStorage.getItem('splash_played')) {
        sessionStorage.setItem('splash_played', '1');
        window.SplashVideo.play();
      }
    } catch (_) {}
  } catch (err) {
    errorEl.textContent = 'Error de conexión';
    errorEl.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    // Parar el timer de inactividad
    if (window.SessionTimeout) window.SessionTimeout.stop();
    // Detener Walkthrough (canto del colibrí, animation loop) si está activo —
    // si no se hace, el audio sigue sonando incluso después del logout
    if (window.DashboardWalkthrough && typeof window.DashboardWalkthrough.destroy === 'function') {
      try { window.DashboardWalkthrough.destroy(); } catch (_) {}
    }
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
      // Sanea el rol: si viene null/undefined → 'user' (más seguro)
      if (!data.role) data.role = 'user';
      currentUserProfile = data;
      setupRoleBasedNav(data.role);
      updateUserDisplay();
      // Marca body con role-* para que CSS pueda gatear UI por rol
      if (typeof applyRoleBodyClass === 'function') applyRoleBodyClass();
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

    // Refrescar UI de Telegram (vinculado / no)
    refreshTelegramLinkUI();
  }
}

// ============================================================================
// Vinculación con Telegram @Pumai_treebot
// ============================================================================
const TELEGRAM_BOT_USERNAME = 'Pumai_treebot';

function refreshTelegramLinkUI() {
  const status = document.getElementById('profile-telegram-status');
  const explain = document.getElementById('profile-telegram-explain');
  const linkBtn = document.getElementById('profile-telegram-link-btn');
  const unlinkBtn = document.getElementById('profile-telegram-unlink-btn');
  if (!status || !linkBtn) return;

  if (currentUserProfile?.telegram_chat_id) {
    status.innerHTML = '<span style="color:#2e7d32;font-weight:600;">✅ Vinculado</span>';
    explain.textContent = 'Estás recibiendo notificaciones del proyecto en Telegram.';
    linkBtn.querySelector('span').textContent = 'Re-vincular (otro Telegram)';
    if (unlinkBtn) unlinkBtn.style.display = 'inline-flex';
  } else {
    status.innerHTML = '<span style="color:#777;">⊘ Sin vincular</span>';
    explain.textContent = 'Recibe avisos del proyecto, recordatorios y alertas de tus árboles directo en Telegram.';
    linkBtn.querySelector('span').textContent = 'Vincular Telegram';
    if (unlinkBtn) unlinkBtn.style.display = 'none';
  }
}

/// Genera token corto, lo inserta en telegram_link_tokens y abre el deep link
async function startTelegramLink() {
  if (!currentUser) { showToast('Debes iniciar sesión primero', 'error'); return; }
  try {
    // Token corto único — usamos un slice del UUID para que entre en el deep link
    const token = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36)).replace(/-/g, '').slice(0, 12);
    const { error } = await sb.from('telegram_link_tokens').insert({
      token,
      user_id: currentUser.id,
    });
    if (error) throw error;

    const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`;
    // Abre Telegram (móvil) o tab web según dispositivo
    window.open(deepLink, '_blank');
    showToast('Te enviamos a Telegram. Presiona "Start" en el bot para completar la vinculación.', 'info');

    // Cada 3s revisar si ya se vinculó (se cierra solo cuando éxito o expira 15 min)
    pollTelegramLink(token);
  } catch (err) {
    showToast('Error iniciando vinculación: ' + (err.message || err), 'error');
    if (typeof logError === 'function') logError({ action: 'startTelegramLink', error: err });
  }
}

let _tgPollTimer = null;
function pollTelegramLink(token) {
  if (_tgPollTimer) clearInterval(_tgPollTimer);
  const start = Date.now();
  _tgPollTimer = setInterval(async () => {
    if (Date.now() - start > 15 * 60 * 1000) {     // 15 min timeout = token expirado
      clearInterval(_tgPollTimer); _tgPollTimer = null;
      return;
    }
    try {
      const { data } = await sb.from('telegram_link_tokens')
        .select('used_at').eq('token', token).maybeSingle();
      if (data?.used_at) {
        clearInterval(_tgPollTimer); _tgPollTimer = null;
        // Recargar perfil para tener el chat_id nuevo
        await loadUserProfile(true);
        refreshTelegramLinkUI();
        showToast('✅ Telegram vinculado correctamente', 'success');
      }
    } catch (_) {}
  }, 3000);
}

async function unlinkTelegram() {
  if (!currentUser || !currentUserProfile?.telegram_chat_id) return;
  if (!confirm('¿Quieres dejar de recibir notificaciones de Telegram?')) return;
  try {
    const { error } = await sb.from('user_profiles')
      .update({ telegram_chat_id: null })
      .eq('id', currentUser.id);
    if (error) throw error;
    currentUserProfile.telegram_chat_id = null;
    refreshTelegramLinkUI();
    showToast('Desvinculaste Telegram. Ya no recibirás avisos.', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (typeof logError === 'function') logError({ action: 'unlinkTelegram', error: err });
  }
}

window.startTelegramLink = startTelegramLink;
window.unlinkTelegram = unlinkTelegram;
window.refreshTelegramLinkUI = refreshTelegramLinkUI;

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

// ========== CAMBIO DE CONTRASEÑA (desde el perfil) ==========
// Validación de fortaleza: ≥8 chars, al menos 1 mayúscula y 1 dígito.
function _passwordIsStrong(pwd) {
  if (!pwd || pwd.length < 8) return { ok: false, msg: 'Mínimo 8 caracteres' };
  if (!/[A-Z]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos una mayúscula' };
  if (!/[0-9]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos un número' };
  return { ok: true };
}

function _setupPasswordLiveStrength(inputId, hintId) {
  const i = document.getElementById(inputId);
  const h = document.getElementById(hintId);
  if (!i || !h) return;
  i.oninput = () => {
    const v = i.value || '';
    if (!v) { h.textContent = ''; return; }
    const score = (v.length >= 8 ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0) +
                  (/[0-9]/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) ? 1 : 0);
    if (score <= 1)      { h.textContent = '🔴 Débil';   h.style.color = '#c62828'; }
    else if (score === 2){ h.textContent = '🟡 Media';   h.style.color = '#f57c00'; }
    else if (score === 3){ h.textContent = '🟢 Buena';   h.style.color = '#2e7d32'; }
    else                 { h.textContent = '✅ Excelente'; h.style.color = '#1b5e20'; }
  };
}

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (!modal) return;
  // Cerrar el modal de perfil para que no quede una capa encima
  const profileModal = document.getElementById('profile-modal');
  if (profileModal) profileModal.style.display = 'none';
  modal.style.display = 'flex';
  // Reset campos
  const np = document.getElementById('cp-new');
  const cp = document.getElementById('cp-confirm');
  const err = document.getElementById('cp-error');
  const hint = document.getElementById('cp-strength');
  if (np) np.value = '';
  if (cp) cp.value = '';
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  if (hint) hint.textContent = '';
  _setupPasswordLiveStrength('cp-new', 'cp-strength');
  setTimeout(() => { try { np?.focus(); } catch(_){} }, 100);
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.style.display = 'none';
}

async function submitChangePassword(e) {
  if (e) e.preventDefault();
  const np = document.getElementById('cp-new')?.value || '';
  const cp = document.getElementById('cp-confirm')?.value || '';
  const err = document.getElementById('cp-error');
  const showErr = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };
  if (err) { err.style.display = 'none'; err.textContent = ''; }

  if (np !== cp) return showErr('Las contraseñas no coinciden');
  const strength = _passwordIsStrong(np);
  if (!strength.ok) return showErr(strength.msg);

  // Verificar que haya sesión activa
  try {
    const { data: sessData } = await sb.auth.getSession();
    if (!sessData?.session) return showErr('Tu sesión expiró. Inicia sesión nuevamente.');
  } catch (_) {}

  try {
    const { error } = await sb.auth.updateUser({ password: np });
    if (error) return showErr('Error: ' + error.message);

    // Cerrar otras sesiones por seguridad (only si el SDK lo soporta)
    try { await sb.auth.signOut({ scope: 'others' }); } catch(_) {}

    closeChangePasswordModal();
    if (typeof showToast === 'function') {
      showToast('✓ Contraseña actualizada. Otras sesiones fueron cerradas.', 'success');
    }
  } catch (ex) {
    showErr('Error inesperado: ' + (ex.message || ex));
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

// ========== QR LANDING SCREEN (un solo QR → 2 caminos) ==========
// Cuando alguien escanea el QR ?tree=<code> y NO tiene sesión,
// le mostramos una pantalla con dos opciones:
//  1) Iniciar sesión (cuidador / admin / especialista)
//  2) Reportar problema sin cuenta (ciudadano)
function showQrLandingScreen(treeCode) {
  const login = document.getElementById('login-screen');
  const main = document.getElementById('main-app');
  if (login) login.style.display = 'none';
  if (main) main.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'qr-landing-overlay';
  overlay.className = 'login-container';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="login-box" style="max-width:480px;text-align:center;">
      <div class="login-logo">
        <div style="font-size:3rem;margin-bottom:0.5rem;">🌳</div>
        <div class="login-logo-text">${escapeHtml(treeCode)}</div>
        <div class="login-logo-subtitle">Proyecto Árbol UNAM 475</div>
      </div>
      <p style="color:var(--text-light);margin:1.5rem 0;">
        Escaneaste el QR de este árbol.<br>¿Cómo quieres continuar?
      </p>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <button class="login-btn" onclick="qrLandingChooseLogin('${safeJsAttr(treeCode)}')">
          <i class="fas fa-sign-in-alt"></i> Tengo cuenta &mdash; Iniciar sesión
        </button>
        <button class="btn btn-outline" style="padding:0.85rem;font-size:0.95rem;" onclick="qrLandingChooseAnon('${safeJsAttr(treeCode)}')">
          <i class="fas fa-flag"></i> Reportar problema sin cuenta
        </button>
      </div>
      <div class="login-footer" style="margin-top:1.5rem;">
        <p style="font-size:0.78rem;color:var(--text-light);">Universidad Nacional Autónoma de México</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function qrLandingChooseLogin(treeCode) {
  // Cerrar landing y mostrar login. Guardar treeCode para redirección después
  const overlay = document.getElementById('qr-landing-overlay');
  if (overlay) overlay.remove();
  // Stash el tree_code en sessionStorage para que post-login redirija al árbol
  try { sessionStorage.setItem('pending_tree_code', treeCode); } catch (e) {}
  showLoginScreen();
}

function qrLandingChooseAnon(treeCode) {
  const overlay = document.getElementById('qr-landing-overlay');
  if (overlay) overlay.remove();
  showPublicReportScreen(treeCode);
}

// Después de un login exitoso, si hay un treeCode pendiente, navegar al árbol
async function handleDeepLinkTree(treeCode) {
  if (!treeCode) return;
  try { sessionStorage.removeItem('pending_tree_code'); } catch (e) {}
  // Lookup tree
  const { data: tree } = await sb.from('trees_catalog')
    .select('id, tree_code, common_name, species, campus')
    .eq('tree_code', treeCode).maybeSingle();
  if (!tree) {
    if (typeof showToast === 'function') showToast('Árbol ' + treeCode + ' no encontrado', 'warning');
    return;
  }
  // Decidir vista según rol
  const role = currentUserProfile && currentUserProfile.role;
  if (role === 'specialist' || role === 'admin') {
    if (typeof showSection === 'function') showSection('section-specialist');
    setTimeout(() => {
      if (typeof showSpecialistTree === 'function') showSpecialistTree(tree.id);
    }, 400);
  } else {
    // Usuario regular: ir a Mi Árbol y dejarle ver el suyo
    if (typeof showSection === 'function') showSection('section-mi-arbol');
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

  // Guardar SIEMPRE el tree_code en el dataset (la Edge Function hará el lookup)
  document.getElementById('public-report-form').dataset.treeCode = treeCode;

  // Intentar lookup adicional para mostrar nombre del árbol al usuario.
  // Si RLS bloquea (anon no puede leer), mostramos solo el código.
  try {
    const { data: tree } = await sb.from('trees_catalog')
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
      document.getElementById('public-report-form').dataset.treeId = String(tree.id);
    } else if (info) {
      info.innerHTML = `
        <div style="background:rgba(74,124,42,0.10);padding:0.85rem 1rem;border-radius:12px;border-left:3px solid var(--primary);">
          <strong>Código: ${escapeHtml(treeCode)}</strong>
        </div>
      `;
    }
  } catch (e) {
    const info = document.getElementById('public-report-tree-info');
    if (info) info.innerHTML = `<div style="background:rgba(74,124,42,0.10);padding:0.85rem 1rem;border-radius:12px;border-left:3px solid var(--primary);"><strong>Código: ${escapeHtml(treeCode)}</strong></div>`;
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
  // No requerimos treeId — la Edge Function resuelve el tree_id desde el
  // tree_code (que SIEMPRE viene del QR). Anon no puede leer trees_catalog
  // por RLS, por eso treeId puede venir null en el flujo público.
  if (!treeCode) {
    if (status) { status.textContent = 'Código de árbol faltante.'; status.style.color = 'var(--danger)'; }
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
window.showQrLandingScreen = showQrLandingScreen;
window.qrLandingChooseLogin = qrLandingChooseLogin;
window.qrLandingChooseAnon = qrLandingChooseAnon;
window.handleDeepLinkTree = handleDeepLinkTree;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.submitChangePassword = submitChangePassword;
