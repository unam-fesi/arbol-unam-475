// js/presentation-mode.js
// ============================================================================
// MODO PRESENTACIÓN (Versión B — espejo de navegación)
//
// Permite que un admin transmita su navegación del portal en vivo a otros
// miembros del staff. Cuando el presenter cambia de tab, abre un mapa 3D,
// aplica filtros o abre el detalle de un árbol → los espectadores ven lo
// mismo en su pantalla.
//
// Arquitectura:
//   • Canal Supabase Realtime único: 'presentation-mode' (global)
//   • Presence: el presenter se trackea con su user_id; los demás ven la
//     lista y muestran un banner "X está presentando".
//   • Broadcast: cada acción del presenter se manda como un evento
//     'nav' con un tipo (switchAdminTab, openMap3D, etc.) + payload.
//
// Estados:
//   • idle      — escuchando si hay alguien presentando (no envía nada)
//   • presenting — yo soy quien transmite (track presence, emit broadcasts)
//   • viewing   — recibo y aplico broadcasts del presenter activo
//
// Roles:
//   • Pueden PRESENTAR: admin, admin-campus, rectoria
//   • Pueden ser VIEWERS: admin, admin-campus, rectoria, specialist, responsable
//   • user (rol normal): no se suscribe ni ve banners
//
// Si Supabase Realtime falla, el modo presentación no funciona pero la app
// sigue funcionando 100% normal (todo está envuelto en try/catch).
// ============================================================================

window.PresentationMode = (function () {
  'use strict';

  // Rectoría es read-only multicampus, NO presenta. Sí puede ver presentaciones.
  const PRESENTER_ROLES = ['admin', 'admin-campus'];
  const VIEWER_ROLES    = ['admin', 'admin-campus', 'rectoria', 'specialist', 'responsable'];

  let _channel = null;
  let _state = 'idle'; // 'idle' | 'presenting' | 'viewing'
  let _currentUser = null;
  let _currentProfile = null;
  let _activePresenter = null; // { user_id, full_name, role, started_at }
  let _viewerSyncFlag = false; // antiloop: cuando el viewer aplica un nav, no debe re-emitir

  // ---------------------------------------------------------------------------
  // Helpers de roles
  // ---------------------------------------------------------------------------
  function canPresent(profile) {
    if (!profile || !profile.role) return false;
    return PRESENTER_ROLES.includes(String(profile.role).toLowerCase());
  }
  function canView(profile) {
    if (!profile || !profile.role) return false;
    return VIEWER_ROLES.includes(String(profile.role).toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // Init: llamado desde auth.js al loguearse un usuario elegible.
  // Solo suscribimos el canal — no iniciamos presentación ni nada activo aún.
  // ---------------------------------------------------------------------------
  function init(user, profile) {
    if (!canView(profile)) return; // user normal: ni siquiera se conecta
    if (typeof sb === 'undefined' || !sb.channel) return;
    _currentUser = user;
    _currentProfile = profile;
    _injectStyles();
    _renderStartButton(); // solo aparece para roles que pueden presentar
    _subscribeChannel();
    // Hooks se instalan en cuanto las funciones globales existan.
    // admin.js define switchAdminTab/switchVisTab cuando carga; intentamos ya
    // y si no, reintentamos brevemente.
    _tryInstallHooks(0);
  }

  function _tryInstallHooks(attempt) {
    if (window.__pmHooksInstalled) return;
    const ready = typeof window.showSection === 'function'
               && typeof window.switchAdminTab === 'function';
    if (ready) { _installHooks(); return; }
    if (attempt > 20) return; // tras 20 intentos (10s) abandonamos
    setTimeout(() => _tryInstallHooks(attempt + 1), 500);
  }

  function _subscribeChannel() {
    if (_channel) return;
    try {
      console.log('[pm] init — rol:', _currentProfile?.role, '· puede presentar:', canPresent(_currentProfile));
      _channel = sb.channel('presentation-mode', {
        config: { presence: { key: _currentUser.id } },
      });

      const checkState = () => {
        try {
          const state = _channel.presenceState();
          let presenter = null;
          Object.keys(state).forEach(k => {
            const meta = state[k][0];
            if (meta && meta.is_presenter) presenter = meta;
          });
          console.log('[pm] presence sync — keys:', Object.keys(state).length, '· presenter:', presenter?.full_name || 'ninguno');
          _onPresenterChange(presenter);
        } catch (e) { console.warn('[pm] presence sync:', e); }
      };

      // Sync de presence: detectamos si hay un presenter activo
      _channel.on('presence', { event: 'sync' }, checkState);
      // Tambien escuchamos joins/leaves explícitos por si sync no llega
      _channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[pm] join:', key, newPresences?.[0]?.full_name);
        checkState();
      });
      _channel.on('presence', { event: 'leave' }, ({ key }) => {
        console.log('[pm] leave:', key);
        checkState();
      });

      // Broadcast: cuando soy viewer, aplico los nav events del presenter
      _channel.on('broadcast', { event: 'nav' }, ({ payload }) => {
        if (_state !== 'viewing') return;
        if (!payload || !payload.type) return;
        try { _applyNavEvent(payload); }
        catch (e) { console.warn('[pm] applyNavEvent:', e); }
      });

      _channel.subscribe(async (status) => {
        console.log('[pm] channel status:', status);
        if (status === 'SUBSCRIBED') {
          // CRÍTICO: track inmediatamente con is_presenter:false para que
          // Supabase active la presence para este cliente. Si esperamos hasta
          // que el user pulse "Iniciar", el track tardío a veces se acepta
          // pero NO se propaga al state (cliente queda como lurker).
          // Patrón idéntico al de RealtimeFeatures.admin-presence que sí
          // funciona.
          try {
            const baseTrack = {
              user_id: _currentUser.id,
              full_name: _currentProfile.full_name || _currentUser.email,
              role: _currentProfile.role,
              is_presenter: false,
              online_at: new Date().toISOString(),
            };
            console.log('[pm] initial track (lurker):', baseTrack);
            const r = await _channel.track(baseTrack);
            console.log('[pm] initial track result:', r);
          } catch (e) { console.warn('[pm] initial track failed:', e); }
          // Re-check explícito por si ya había un presenter en el canal
          setTimeout(checkState, 300);
          setTimeout(checkState, 1500);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[pm] channel error:', status);
        }
      });
    } catch (e) {
      console.warn('[pm] cannot subscribe:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Cuando cambia la lista de presenters activos
  // ---------------------------------------------------------------------------
  function _onPresenterChange(presenter) {
    const previousId = _activePresenter?.user_id;
    const currentId  = presenter?.user_id;

    _activePresenter = presenter;

    // Si yo soy el presenter activo, no muestro banner para mí mismo
    if (presenter && presenter.user_id === _currentUser?.id) {
      _hideBanner();
      return;
    }

    // Si dejé de ver porque el presenter terminó
    if (_state === 'viewing' && !presenter) {
      _state = 'idle';
      _hideViewerIndicator();
      _hideBanner();
      if (typeof showToast === 'function') {
        showToast('La presentación terminó', 'info', 3000);
      }
      window.dispatchEvent(new CustomEvent('presentation:ended'));
      return;
    }

    // Nuevo presenter detectado → mostrar banner (a menos que ya esté viendo)
    if (presenter && _state !== 'viewing') {
      _showBanner(presenter);
    } else if (!presenter) {
      _hideBanner();
    }
  }

  // ---------------------------------------------------------------------------
  // API: iniciar presentación (yo soy presenter)
  // ---------------------------------------------------------------------------
  async function startPresenting() {
    if (_state !== 'idle') return { error: 'Ya hay una sesión activa' };
    if (!canPresent(_currentProfile)) {
      return { error: 'Tu rol no permite presentar' };
    }
    if (!_channel) {
      return { error: 'Canal Realtime no disponible' };
    }
    // Guard: el canal debe estar SUBSCRIBED antes de poder trackear.
    // Si no lo está aún, esperamos hasta 3 segundos.
    if (_channel.state !== 'joined') {
      console.log('[pm] canal en estado:', _channel.state, '— esperando join...');
      const ok = await _waitForChannelJoin(3000);
      if (!ok) {
        return { error: 'Canal Realtime no terminó de conectar (revisa la red)' };
      }
    }
    try {
      const payload = {
        user_id: _currentUser.id,
        full_name: _currentProfile.full_name || _currentUser.email,
        role: _currentProfile.role,
        is_presenter: true,
        started_at: new Date().toISOString(),
      };
      console.log('[pm] tracking:', payload);
      const result = await _channel.track(payload);
      console.log('[pm] track result:', result);
      _state = 'presenting';
      _showPresenterIndicator();
      if (typeof showToast === 'function') {
        showToast('🎥 Presentación iniciada', 'success', 3000);
      }
      // Force-poll por si el sync event no llega solo
      setTimeout(() => {
        try {
          const state = _channel.presenceState();
          console.log('[pm] post-track presenceState:', state);
          Object.keys(state).forEach(k => {
            const meta = state[k][0];
            if (meta?.is_presenter) _onPresenterChange(meta);
          });
        } catch (e) { console.warn('[pm] post-track check:', e); }
      }, 300);
      return { ok: true };
    } catch (e) {
      console.warn('[pm] startPresenting failed:', e);
      return { error: e?.message || 'No se pudo iniciar' };
    }
  }

  // Espera a que el canal entre en estado 'joined' (= SUBSCRIBED)
  function _waitForChannelJoin(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (_channel?.state === 'joined') return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  async function stopPresenting() {
    if (_state !== 'presenting') return;
    try {
      await _channel.untrack();
    } catch (_) {}
    _state = 'idle';
    _hidePresenterIndicator();
    if (typeof showToast === 'function') {
      showToast('Presentación terminada', 'info', 2500);
    }
  }

  // ---------------------------------------------------------------------------
  // API: unirme como espectador
  // ---------------------------------------------------------------------------
  function joinAsViewer() {
    if (!_activePresenter) return { error: 'No hay presentación activa' };
    if (_state === 'presenting') return { error: 'Estás presentando' };
    _state = 'viewing';
    _hideBanner();
    _showViewerIndicator(_activePresenter);
    if (typeof showToast === 'function') {
      showToast(`Viendo presentación de ${_activePresenter.full_name}`, 'info', 2500);
    }
    return { ok: true };
  }

  function leaveViewer() {
    if (_state !== 'viewing') return;
    _state = 'idle';
    _hideViewerIndicator();
    if (_activePresenter) _showBanner(_activePresenter); // por si quiere reentrar
  }

  // ---------------------------------------------------------------------------
  // API: emitir un nav event (lo llaman los hooks de las funciones del portal)
  // ---------------------------------------------------------------------------
  function emitNav(type, payload) {
    if (_state !== 'presenting') return;
    if (_viewerSyncFlag) return; // anti-loop
    if (!_channel) return;
    try {
      _channel.send({
        type: 'broadcast',
        event: 'nav',
        payload: { type, payload, ts: Date.now() },
      });
    } catch (e) {
      console.warn('[pm] emitNav:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Recibir y aplicar un nav event (soy viewer)
  // Despacha por tipo a las funciones globales del portal envueltas con flag
  // antiloop para que su ejecución NO emita un nuevo broadcast.
  // ---------------------------------------------------------------------------
  function _applyNavEvent(event) {
    _viewerSyncFlag = true;
    try {
      const { type, payload } = event;
      switch (type) {
        case 'showSection':
          if (typeof window.showSection === 'function' && payload?.sectionId) {
            window.showSection(payload.sectionId);
          }
          break;
        case 'adminTab':
          if (typeof window.switchAdminTab === 'function' && payload?.tab) {
            window.switchAdminTab(payload.tab);
          }
          break;
        case 'visTab':
          if (typeof window.switchVisTab === 'function' && payload?.which) {
            window.switchVisTab(payload.which);
          }
          break;
        case 'treeDetail':
          if (typeof window.viewTreeMeasurementsAdmin === 'function' && payload?.treeId) {
            window.viewTreeMeasurementsAdmin(payload.treeId);
          }
          break;
        case 'filters':
          _applyFiltersPayload(payload);
          break;
        default:
          // Tipo no reconocido: solo disparamos el evento custom por si alguien escucha
          window.dispatchEvent(new CustomEvent('presentation:nav', { detail: event }));
      }
    } catch (e) {
      console.warn('[pm] applyNavEvent failed:', e);
    } finally {
      // Ventana corta para que la función termine sin re-emit
      setTimeout(() => { _viewerSyncFlag = false; }, 120);
    }
  }

  // Aplicar payload de filtros sobre la tabla admin/árboles
  function _applyFiltersPayload(p) {
    if (!p) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val == null ? '' : String(val);
    };
    set('ft-code',       p.code);
    set('ft-species',    p.species);
    set('ft-campus',     p.campus);
    set('ft-status',     p.status);
    set('ft-health-min', p.healthMin);
    set('ft-no-gps',     p.noGps);
    set('ft-no-photo',   p.noPhoto);
    if (typeof window._filterAdminTrees === 'function') {
      window._filterAdminTrees();
    }
  }

  // ---------------------------------------------------------------------------
  // Monkey-patch a las funciones globales del portal — solo agrega un emit
  // ANTES de delegar al original. No cambia firma ni return value.
  // ---------------------------------------------------------------------------
  function _installHooks() {
    if (window.__pmHooksInstalled) return;
    window.__pmHooksInstalled = true;

    _wrap('showSection',              (args) => ({ type: 'showSection', payload: { sectionId: args[0] } }));
    _wrap('switchAdminTab',           (args) => ({ type: 'adminTab',    payload: { tab: args[0] } }));
    _wrap('switchVisTab',             (args) => ({ type: 'visTab',      payload: { which: args[0] } }));
    _wrap('viewTreeMeasurementsAdmin',(args) => ({ type: 'treeDetail',  payload: { treeId: args[0] } }));

    // Filtros admin/árboles: envolver _filterAdminTrees para emitir el snapshot
    // completo después de aplicarse localmente (debounced 250ms).
    if (typeof window._filterAdminTrees === 'function' && !window._filterAdminTrees.__pmWrapped) {
      const orig = window._filterAdminTrees;
      let t = null;
      window._filterAdminTrees = function () {
        const r = orig.apply(this, arguments);
        if (_state === 'presenting' && !_viewerSyncFlag) {
          clearTimeout(t);
          t = setTimeout(() => {
            try {
              emitNav('filters', {
                code:      document.getElementById('ft-code')?.value || '',
                species:   document.getElementById('ft-species')?.value || '',
                campus:    document.getElementById('ft-campus')?.value || '',
                status:    document.getElementById('ft-status')?.value || '',
                healthMin: document.getElementById('ft-health-min')?.value || '',
                noGps:     !!document.getElementById('ft-no-gps')?.checked,
                noPhoto:   !!document.getElementById('ft-no-photo')?.checked,
              });
            } catch (e) { console.warn('[pm] filters emit:', e); }
          }, 250);
        }
        return r;
      };
      window._filterAdminTrees.__pmWrapped = true;
    }
  }

  function _wrap(fnName, payloadBuilder) {
    const orig = window[fnName];
    if (typeof orig !== 'function' || orig.__pmWrapped) return;
    window[fnName] = function () {
      // Emit ANTES de ejecutar — así el viewer recibe el mensaje rápido
      if (_state === 'presenting' && !_viewerSyncFlag) {
        try {
          const ev = payloadBuilder(Array.from(arguments));
          if (ev) emitNav(ev.type, ev.payload);
        } catch (e) { console.warn('[pm] hook emit:', fnName, e); }
      }
      return orig.apply(this, arguments);
    };
    window[fnName].__pmWrapped = true;
  }

  function isViewerSync() { return _viewerSyncFlag; }

  // ---------------------------------------------------------------------------
  // UI: banner, indicador presenter, indicador viewer
  // ---------------------------------------------------------------------------
  function _showBanner(presenter) {
    if (!presenter || presenter.user_id === _currentUser?.id) return;
    let banner = document.getElementById('pm-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'pm-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:linear-gradient(90deg,#1a4480 0%,#2E7D32 100%);color:#fff;padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:13px;animation:pmSlideDown .3s ease-out;';
      document.body.appendChild(banner);
    }
    const name = _escape(presenter.full_name || presenter.email || 'Alguien');
    banner.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;background:#ff4444;border-radius:50%;display:inline-block;animation:pmPulse 1.4s infinite;"></span>
        <strong>${name}</strong> está presentando
      </span>
      <button type="button" id="pm-banner-join" style="background:#fff;color:#1a4480;border:0;border-radius:14px;padding:4px 14px;font-weight:600;cursor:pointer;font-size:12px;">Unirme</button>
      <button type="button" id="pm-banner-dismiss" aria-label="Cerrar" title="Ignorar" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:50%;width:22px;height:22px;line-height:1;cursor:pointer;padding:0;font-size:13px;">×</button>
    `;
    document.getElementById('pm-banner-join')?.addEventListener('click', () => {
      const r = joinAsViewer();
      if (r?.error) showToast?.(r.error, 'warning');
    });
    document.getElementById('pm-banner-dismiss')?.addEventListener('click', _hideBanner);
    _shiftBodyDown(true);
    window.dispatchEvent(new CustomEvent('presentation:banner-show', { detail: presenter }));
  }
  function _hideBanner() {
    document.getElementById('pm-banner')?.remove();
    if (!document.getElementById('pm-viewer-bar')) _shiftBodyDown(false);
    window.dispatchEvent(new CustomEvent('presentation:banner-hide'));
  }

  function _showPresenterIndicator() {
    const btn = document.getElementById('pm-start-btn');
    if (btn) {
      btn.innerHTML = '<span style="width:8px;height:8px;background:#ff4444;border-radius:50%;display:inline-block;animation:pmPulse 1.4s infinite;margin-right:6px;"></span>En vivo · Terminar';
      btn.style.background = '#c62828';
      btn.style.color = '#fff';
      btn.dataset.mode = 'presenting';
    }
    window.dispatchEvent(new CustomEvent('presentation:presenter-on'));
  }
  function _hidePresenterIndicator() {
    const btn = document.getElementById('pm-start-btn');
    if (btn) {
      btn.innerHTML = '🎥 Iniciar presentación';
      btn.style.background = '';
      btn.style.color = '';
      btn.dataset.mode = 'idle';
    }
    window.dispatchEvent(new CustomEvent('presentation:presenter-off'));
  }

  function _showViewerIndicator(presenter) {
    let bar = document.getElementById('pm-viewer-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pm-viewer-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2E7D32;color:#fff;padding:6px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.2);';
      document.body.appendChild(bar);
    }
    const name = _escape(presenter?.full_name || 'admin');
    bar.innerHTML = `
      <span>👁️ Viendo presentación de <strong>${name}</strong> · Tus clicks están bloqueados — usa "Salir" para interactuar</span>
      <button type="button" id="pm-viewer-leave" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:3px 12px;font-weight:600;cursor:pointer;font-size:11px;">Salir</button>
    `;
    document.getElementById('pm-viewer-leave')?.addEventListener('click', leaveViewer);
    _shiftBodyDown(true);
    document.body.classList.add('pm-viewing'); // activa CSS de bloqueo
    _enableClickBlocker(true);
    window.dispatchEvent(new CustomEvent('presentation:viewer-on', { detail: presenter }));
  }
  function _hideViewerIndicator() {
    document.getElementById('pm-viewer-bar')?.remove();
    if (!document.getElementById('pm-banner')) _shiftBodyDown(false);
    document.body.classList.remove('pm-viewing');
    _enableClickBlocker(false);
    window.dispatchEvent(new CustomEvent('presentation:viewer-off'));
  }

  // ---------------------------------------------------------------------------
  // Bloqueador de clicks en modo viewer.
  // Atrapa clicks en capture-phase y los cancela ANTES de que lleguen al
  // handler de la app. Permite scroll, hover, selección de texto, atajos.
  // Excepción: clicks dentro de #pm-viewer-bar (el botón "Salir") sí pasan.
  // ---------------------------------------------------------------------------
  let _clickBlockerInstalled = false;
  let _clickBlockerToastDebounce = 0;
  function _clickBlockerHandler(e) {
    if (_state !== 'viewing') return;
    // Permitir interacción dentro de la barra de viewer
    const bar = document.getElementById('pm-viewer-bar');
    if (bar && bar.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    // Toast suave (debounced) para que el user entienda por qué nada hace nada
    const now = Date.now();
    if (now - _clickBlockerToastDebounce > 2500) {
      _clickBlockerToastDebounce = now;
      if (typeof showToast === 'function') {
        showToast('Modo espectador: pulsa "Salir" para interactuar', 'info', 2000);
      }
    }
  }
  function _enableClickBlocker(enable) {
    if (enable && !_clickBlockerInstalled) {
      document.addEventListener('click', _clickBlockerHandler, true);
      _clickBlockerInstalled = true;
    } else if (!enable && _clickBlockerInstalled) {
      document.removeEventListener('click', _clickBlockerHandler, true);
      _clickBlockerInstalled = false;
    }
  }

  // Empuja el body para que la navbar y el contenido no queden tapados por el banner
  function _shiftBodyDown(yes) {
    document.body.style.paddingTop = yes ? '36px' : '';
  }

  function _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ---------------------------------------------------------------------------
  // Botón "🎥 Iniciar presentación" en el navbar (solo roles que pueden presentar)
  // Se inserta perezosamente cuando init() detecta que el rol es elegible.
  // ---------------------------------------------------------------------------
  function _renderStartButton() {
    if (!canPresent(_currentProfile)) return;
    const host = document.querySelector('.navbar-user');
    if (!host) return;
    if (document.getElementById('pm-start-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'pm-start-btn';
    btn.type = 'button';
    btn.dataset.mode = 'idle';
    btn.innerHTML = '🎥 Iniciar presentación';
    btn.title = 'Inicia una presentación en vivo para el equipo';
    btn.style.cssText = 'background:transparent;color:#1a4480;border:1px solid #c2dcd3;border-radius:18px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;margin-right:10px;transition:all .15s;display:inline-flex;align-items:center;';
    btn.addEventListener('mouseenter', () => {
      if (btn.dataset.mode === 'idle') btn.style.background = '#eaf6ed';
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.dataset.mode === 'idle') btn.style.background = 'transparent';
    });
    btn.addEventListener('click', async () => {
      if (btn.dataset.mode === 'presenting') {
        if (!confirm('¿Terminar la presentación?')) return;
        await stopPresenting();
      } else {
        const r = await startPresenting();
        if (r?.error) showToast?.(r.error, 'warning');
      }
    });
    host.insertBefore(btn, host.firstChild);
  }

  // CSS de las animaciones (lo inyectamos una sola vez)
  function _injectStyles() {
    if (document.getElementById('pm-styles')) return;
    const s = document.createElement('style');
    s.id = 'pm-styles';
    s.textContent = `
      @keyframes pmPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.5;transform:scale(1.3);} }
      @keyframes pmSlideDown { from{transform:translateY(-100%);} to{transform:translateY(0);} }
      /* Modo viewer: el contenido se ve "guiado" pero clickable solo en la barra */
      body.pm-viewing { cursor: not-allowed; }
      body.pm-viewing #pm-viewer-bar,
      body.pm-viewing #pm-viewer-bar * { cursor: pointer; }
      /* Marco verde sutil para reforzar que estás en modo espectador */
      body.pm-viewing::after {
        content: ''; position: fixed; inset: 0; pointer-events: none;
        box-shadow: inset 0 0 0 3px rgba(46,125,50,0.55);
        z-index: 9997;
      }
      /* No mostrar el botón "Iniciar presentación" mientras estoy viendo a otro */
      body.pm-viewing #pm-start-btn { display: none !important; }
    `;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Cleanup en logout
  // ---------------------------------------------------------------------------
  async function cleanup() {
    try {
      if (_state === 'presenting') {
        try { await _channel?.untrack(); } catch (_) {}
      }
      if (_channel && sb?.removeChannel) {
        try { sb.removeChannel(_channel); } catch (_) {}
      }
    } catch (_) {}
    _channel = null;
    _state = 'idle';
    _currentUser = null;
    _currentProfile = null;
    _activePresenter = null;
    _hideBanner();
    _hidePresenterIndicator();
    _hideViewerIndicator();
    _enableClickBlocker(false);
    document.body.classList.remove('pm-viewing');
    // Quitar el botón del header (si existe) para limpieza visual en logout
    document.getElementById('pm-start-btn')?.remove();
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------
  return {
    init,
    startPresenting,
    stopPresenting,
    joinAsViewer,
    leaveViewer,
    cleanup,
    emitNav,
    isViewerSync,
    canPresent: () => canPresent(_currentProfile),
    canView:    () => canView(_currentProfile),
    getState:   () => _state,
    getActivePresenter: () => _activePresenter,
  };
})();
