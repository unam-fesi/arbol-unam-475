// js/iztacala-calibrator.js
// ============================================================================
// UI de calibración en vivo para mover las letras "FES UNAM Iztacala" y el
// logo "Ahuehuete 475" en el mapa 3D del campus.
//
// Botón flotante "🎯 Calibrar" en la esquina inferior izquierda del canvas
// 3D. Al click abre un panel con sliders X / Z / rotationY para ambos GLBs.
// Mueve en VIVO (sin recargar la escena) modificando outer.position/rotation.
// Botón "Copiar config" → pega en el portapapeles el snippet listo para
// hardcodear en iztacala-letras.js / iztacala-ahuehuete475.js.
//
// Para desactivar: window.IztacalaCalibrator.disable() o quitar la llamada
// a IztacalaCalibrator.mount() en dashboard-iztacala.js.
// ============================================================================

window.IztacalaCalibrator = (function() {
  'use strict';

  let _hostEl = null;
  let _panelEl = null;
  let _toggleBtn = null;
  let _mounted = false;

  function _fmt(n) { return Math.round(n * 100) / 100; }
  function _rad2deg(r) { return Math.round(r * 180 / Math.PI); }
  function _deg2rad(d) { return d * Math.PI / 180; }

  function _renderPanel() {
    const L = window.IztacalaLetras && window.IztacalaLetras.config;
    const A = window.IztacalaAhuehuete475 && window.IztacalaAhuehuete475.config;
    const html = `
      <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:#222;display:flex;justify-content:space-between;align-items:center;">
        <span>🎯 Calibrador GLBs</span>
        <button id="iz-cal-close" style="background:none;border:0;font-size:18px;cursor:pointer;color:#666;">×</button>
      </div>

      ${L ? `
      <fieldset style="border:1px solid #e0d8c8;padding:8px;margin:0 0 10px 0;border-radius:6px;">
        <legend style="font-size:12px;color:#5a4d2e;font-weight:600;padding:0 4px;">Letras FES UNAM Iztacala</legend>
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">X: <span id="iz-cal-lx-v">${_fmt(L.position.x)}</span></label>
        <input type="range" id="iz-cal-lx" min="-300" max="300" step="0.5" value="${L.position.x}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">Z: <span id="iz-cal-lz-v">${_fmt(L.position.z)}</span></label>
        <input type="range" id="iz-cal-lz" min="-300" max="300" step="0.5" value="${L.position.z}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">RotY: <span id="iz-cal-lr-v">${_rad2deg(L.rotationY||0)}°</span></label>
        <input type="range" id="iz-cal-lr" min="-180" max="180" step="1" value="${_rad2deg(L.rotationY||0)}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">RotX: <span id="iz-cal-lrx-v">${_rad2deg(L.rotationX||0)}°</span></label>
        <input type="range" id="iz-cal-lrx" min="-180" max="180" step="5" value="${_rad2deg(L.rotationX||0)}" style="width:100%;">
      </fieldset>
      ` : '<div style="color:#888;font-size:11px;">Letras no cargadas</div>'}

      ${A ? `
      <fieldset style="border:1px solid #c8d8c8;padding:8px;margin:0 0 10px 0;border-radius:6px;">
        <legend style="font-size:12px;color:#2e5a4d;font-weight:600;padding:0 4px;">Logo Ahuehuete 475</legend>
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">X: <span id="iz-cal-ax-v">${_fmt(A.position.x)}</span></label>
        <input type="range" id="iz-cal-ax" min="-300" max="300" step="0.5" value="${A.position.x}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">Z: <span id="iz-cal-az-v">${_fmt(A.position.z)}</span></label>
        <input type="range" id="iz-cal-az" min="-300" max="300" step="0.5" value="${A.position.z}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">RotY: <span id="iz-cal-ar-v">${_rad2deg(A.rotationY||0)}°</span></label>
        <input type="range" id="iz-cal-ar" min="-180" max="180" step="1" value="${_rad2deg(A.rotationY||0)}" style="width:100%;">
        <label style="display:block;font-size:11px;color:#555;margin-top:4px;">RotX (voltear si está de cabeza): <span id="iz-cal-arx-v">${_rad2deg(A.rotationX||0)}°</span></label>
        <input type="range" id="iz-cal-arx" min="-180" max="180" step="5" value="${_rad2deg(A.rotationX||0)}" style="width:100%;">
      </fieldset>
      ` : '<div style="color:#888;font-size:11px;">Logo no cargado (revisar 404)</div>'}

      <button id="iz-cal-copy" style="width:100%;padding:8px;background:#3b7a3a;color:#fff;border:0;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">
        📋 Copiar config al portapapeles
      </button>
      <div id="iz-cal-status" style="font-size:11px;color:#666;margin-top:6px;text-align:center;min-height:14px;"></div>
    `;
    _panelEl.innerHTML = html;

    const close = document.getElementById('iz-cal-close');
    if (close) close.onclick = () => _panelEl.style.display = 'none';

    // Letras
    if (L) {
      const apply = () => {
        const x = parseFloat(document.getElementById('iz-cal-lx').value);
        const z = parseFloat(document.getElementById('iz-cal-lz').value);
        const rDeg = parseFloat(document.getElementById('iz-cal-lr').value);
        document.getElementById('iz-cal-lx-v').textContent = _fmt(x);
        document.getElementById('iz-cal-lz-v').textContent = _fmt(z);
        document.getElementById('iz-cal-lr-v').textContent = rDeg + '°';
        window.IztacalaLetras.setPosition(x, z);
        window.IztacalaLetras.setRotationY(_deg2rad(rDeg));
      };
      ['iz-cal-lx','iz-cal-lz','iz-cal-lr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', apply);
      });
    }
    // Logo
    if (A) {
      const apply = () => {
        const x = parseFloat(document.getElementById('iz-cal-ax').value);
        const z = parseFloat(document.getElementById('iz-cal-az').value);
        const rDeg = parseFloat(document.getElementById('iz-cal-ar').value);
        document.getElementById('iz-cal-ax-v').textContent = _fmt(x);
        document.getElementById('iz-cal-az-v').textContent = _fmt(z);
        document.getElementById('iz-cal-ar-v').textContent = rDeg + '°';
        window.IztacalaAhuehuete475.setPosition(x, z);
        window.IztacalaAhuehuete475.setRotationY(_deg2rad(rDeg));
      };
      ['iz-cal-ax','iz-cal-az','iz-cal-ar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', apply);
      });
    }

    // Copiar config
    const copyBtn = document.getElementById('iz-cal-copy');
    if (copyBtn) copyBtn.onclick = () => {
      const Lc = window.IztacalaLetras && window.IztacalaLetras.config;
      const Ac = window.IztacalaAhuehuete475 && window.IztacalaAhuehuete475.config;
      const txt = [
        '// ── Letras (iztacala-letras.js) ──',
        Lc ? `position: { x: ${_fmt(Lc.position.x)}, y: 0, z: ${_fmt(Lc.position.z)} },` : '',
        Lc ? `rotationY: ${(Lc.rotationY || 0).toFixed(4)},  // ${_rad2deg(Lc.rotationY||0)}°` : '',
        '',
        '// ── Logo Ahuehuete475 (iztacala-ahuehuete475.js) ──',
        Ac ? `position: { x: ${_fmt(Ac.position.x)}, y: 0, z: ${_fmt(Ac.position.z)} },` : '',
        Ac ? `rotationY: ${(Ac.rotationY || 0).toFixed(4)},  // ${_rad2deg(Ac.rotationY||0)}°` : '',
      ].filter(Boolean).join('\n');
      const st = document.getElementById('iz-cal-status');
      try {
        navigator.clipboard.writeText(txt).then(() => {
          if (st) st.textContent = '✓ Copiado al portapapeles';
          console.log('[Calibrator] Config copiada:\n' + txt);
        });
      } catch (e) {
        if (st) st.textContent = 'Mira la consola';
        console.log('[Calibrator] Config:\n' + txt);
      }
    };
  }

  function mount(containerEl) {
    if (_mounted) return;
    if (!containerEl) return;
    _hostEl = containerEl;
    // Botón flotante
    _toggleBtn = document.createElement('button');
    _toggleBtn.textContent = '🎯 Calibrar';
    _toggleBtn.style.cssText = 'position:absolute;bottom:14px;left:14px;z-index:200;padding:8px 12px;background:#fff;border:1px solid #d0c2a0;border-radius:8px;font-size:12px;font-weight:600;color:#5a4d2e;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.15);';
    _toggleBtn.onclick = () => {
      if (_panelEl.style.display === 'none') {
        _renderPanel();   // refresh con valores actuales
        _panelEl.style.display = 'block';
      } else {
        _panelEl.style.display = 'none';
      }
    };
    // Panel
    _panelEl = document.createElement('div');
    _panelEl.style.cssText = 'position:absolute;bottom:54px;left:14px;z-index:201;width:280px;background:#fffef7;border:1px solid #d0c2a0;border-radius:10px;padding:12px;box-shadow:0 4px 14px rgba(0,0,0,0.18);display:none;font-family:system-ui,sans-serif;max-height:80vh;overflow-y:auto;';

    // Asegurar position:relative en el host
    const cs = window.getComputedStyle(_hostEl);
    if (cs.position === 'static') _hostEl.style.position = 'relative';

    _hostEl.appendChild(_toggleBtn);
    _hostEl.appendChild(_panelEl);
    _mounted = true;
    console.warn('[Calibrator] montado. Click en "🎯 Calibrar" para abrir.');
  }

  function disable() {
    if (_toggleBtn && _toggleBtn.parentNode) _toggleBtn.parentNode.removeChild(_toggleBtn);
    if (_panelEl && _panelEl.parentNode) _panelEl.parentNode.removeChild(_panelEl);
    _toggleBtn = _panelEl = _hostEl = null;
    _mounted = false;
    console.warn('[Calibrator] desactivado.');
  }

  return { mount, disable };
})();
