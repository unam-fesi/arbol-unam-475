// js/session-timeout.js
// =============================================================================
// Cierre automático de sesión por inactividad. 60 min default (configurable).
// A los 55 min muestra un modal de "tu sesión está por expirar" con botón
// "Continuar" que reinicia el contador, y "Cerrar sesión" que cierra ya.
//
// Configuración:
//   window.SessionTimeout.config = { totalMs: 60 * 60_000, warnMs: 5 * 60_000 };
//   window.SessionTimeout.start();   // automático al login
//   window.SessionTimeout.stop();    // automático al logout
// =============================================================================

window.SessionTimeout = (function() {
  'use strict';

  const config = {
    totalMs: 60 * 60_000,    // 60 minutos de inactividad → cierra sesión
    warnMs:   5 * 60_000,    // 5 min antes mostrar warning
  };

  let _lastActivity = Date.now();
  let _interval = null;
  let _warningEl = null;
  let _started = false;

  // Eventos que cuentan como actividad
  const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

  function _touch() {
    _lastActivity = Date.now();
    _hideWarning();
  }

  function _showWarning(secondsLeft) {
    if (_warningEl) {
      const counter = document.getElementById('session-warning-counter');
      if (counter) counter.textContent = Math.max(0, Math.round(secondsLeft));
      return;
    }
    _warningEl = document.createElement('div');
    _warningEl.id = 'session-warning-modal';
    _warningEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    _warningEl.innerHTML = `
      <div style="background:#fff;padding:24px 28px;border-radius:12px;max-width:420px;width:90%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
        <div style="font-size:48px;margin-bottom:8px;">⏰</div>
        <h3 style="margin:0 0 8px;color:#5a4d2e;">Tu sesión está por expirar</h3>
        <p style="color:#666;margin-bottom:16px;font-size:14px;">
          Cerraremos tu sesión por inactividad en
          <strong id="session-warning-counter" style="color:#b54f3a;font-size:18px;">${Math.round(secondsLeft)}</strong> segundos.
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button onclick="SessionTimeout.continueSession()" class="btn btn-primary" style="padding:10px 20px;">
            ✓ Continuar trabajando
          </button>
          <button onclick="SessionTimeout.logoutNow()" class="btn btn-outline" style="padding:10px 20px;">
            Cerrar sesión
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(_warningEl);
  }

  function _hideWarning() {
    if (_warningEl && _warningEl.parentNode) {
      _warningEl.parentNode.removeChild(_warningEl);
      _warningEl = null;
    }
  }

  function _check() {
    const idleMs = Date.now() - _lastActivity;
    if (idleMs >= config.totalMs) {
      // Cerrar sesión
      _hideWarning();
      stop();
      if (typeof handleLogout === 'function') {
        showToast && showToast('Sesión cerrada por inactividad', 'info');
        handleLogout();
      }
    } else if (idleMs >= config.totalMs - config.warnMs) {
      _showWarning((config.totalMs - idleMs) / 1000);
    }
  }

  function start() {
    if (_started) return;
    _started = true;
    _lastActivity = Date.now();
    ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, _touch, { passive: true }));
    _interval = setInterval(_check, 10_000);   // chequeo cada 10s
    console.warn(`[SessionTimeout] activo. Cierre tras ${config.totalMs/60000}min de inactividad.`);
  }

  function stop() {
    if (!_started) return;
    _started = false;
    ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, _touch));
    if (_interval) { clearInterval(_interval); _interval = null; }
    _hideWarning();
  }

  function continueSession() {
    _touch();
    _hideWarning();
  }

  function logoutNow() {
    stop();
    if (typeof handleLogout === 'function') handleLogout();
  }

  return { start, stop, continueSession, logoutNow, config };
})();
