// js/map-loader.js
// =============================================================================
// Spinner reutilizable para indicar carga de mapas 3D / walkthrough.
//
// Reusa la estética del splash inicial: círculo de progreso con anillo
// shimmer + arbolito SVG creciendo + mensaje en cursiva.
//
// Sólo aparece si la carga tarda más de DELAY_MS (default 500ms) para no
// parpadear en cargas instantáneas (Iztacala desde caché, por ejemplo).
//
// Uso:
//   const id = MapLoader.show(containerEl, 'Cargando FES Cuautitlán…');
//   // ... cuando termina:
//   MapLoader.hide(id);
//
//   MapLoader.setProgress(id, 45);   // opcional: anillo determinístico
// =============================================================================

window.MapLoader = (function () {
  'use strict';

  const DELAY_MS = 500;       // no mostrar si carga rápido
  const SHOW_AFTER_MS = 300;  // tiempo para animar entrada
  let _styleInjected = false;

  function _injectStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    const s = document.createElement('style');
    s.id = 'map-loader-styles';
    s.textContent = `
      .map-loader-overlay {
        position: absolute; inset: 0; z-index: 50;
        background: linear-gradient(135deg, rgba(245,250,240,0.95), rgba(220,235,210,0.95));
        backdrop-filter: blur(6px);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        opacity: 0;
        animation: mapLoaderIn 0.3s ease-out 0.1s forwards;
        pointer-events: none;
      }
      @keyframes mapLoaderIn { to { opacity: 1; } }
      @keyframes mapLoaderOut { to { opacity: 0; } }

      .map-loader-ring {
        position: relative;
        width: 120px; height: 120px;
        filter: drop-shadow(0 0 18px rgba(120, 220, 120, 0.45));
      }
      .map-loader-ring-bg {
        stroke: rgba(60, 120, 60, 0.15);
        fill: none; stroke-width: 5;
      }
      .map-loader-ring-fg {
        stroke: url(#mapLoaderGrad);
        fill: none; stroke-width: 6;
        stroke-linecap: round;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
        transition: stroke-dashoffset 0.4s ease-out;
        filter: drop-shadow(0 0 4px rgba(184, 229, 116, 0.7));
      }
      /* Anillo pulse indeterminado mientras no hay progreso real */
      .map-loader-pulse {
        stroke: rgba(110, 178, 74, 0.55);
        fill: none; stroke-width: 3;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
        stroke-dasharray: 60 200;
        animation: mapLoaderSpin 1.3s linear infinite;
      }
      @keyframes mapLoaderSpin {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -260; }
      }

      .map-loader-tree {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 36px;
        animation: mapLoaderBob 1.8s ease-in-out infinite;
      }
      @keyframes mapLoaderBob {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -55%) scale(1.08); }
      }

      .map-loader-text {
        font-family: 'Georgia', serif;
        font-style: italic;
        font-size: 15px;
        color: #2e5a2e;
        margin-top: 16px;
        max-width: 80%;
        text-align: center;
        text-shadow: 0 1px 4px rgba(255,255,255,0.6);
      }
      .map-loader-sub {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11px;
        color: #5a8a5a;
        margin-top: 6px;
        opacity: 0.85;
      }
    `;
    document.head.appendChild(s);
  }

  let _id = 0;
  const _activeLoaders = new Map();   // id → { containerEl, overlayEl, timer, ringEl, textEl }

  function _ensureContainerPositioned(containerEl) {
    if (!containerEl) return;
    const cs = window.getComputedStyle(containerEl);
    if (cs.position === 'static') containerEl.style.position = 'relative';
  }

  function show(containerEl, message) {
    if (!containerEl) return null;
    _injectStyles();
    _ensureContainerPositioned(containerEl);
    const id = ++_id;

    // Crear el overlay con DELAY_MS de retraso — si la carga termina antes,
    // no aparece spinner (evita parpadeo).
    const timer = setTimeout(() => {
      const overlay = document.createElement('div');
      overlay.className = 'map-loader-overlay';
      overlay.dataset.loaderId = String(id);
      overlay.innerHTML = `
        <div class="map-loader-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="mapLoaderGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#6FB24A"/>
                <stop offset="50%" stop-color="#B8E574"/>
                <stop offset="100%" stop-color="#E8C04A"/>
              </linearGradient>
            </defs>
            <circle class="map-loader-ring-bg" cx="60" cy="60" r="52"/>
            <circle class="map-loader-pulse" cx="60" cy="60" r="52"/>
            <circle class="map-loader-ring-fg" cx="60" cy="60" r="52"
                    stroke-dasharray="326.7" stroke-dashoffset="326.7"
                    style="display:none;"/>
          </svg>
          <div class="map-loader-tree">🌳</div>
        </div>
        <div class="map-loader-text">${message || 'Cargando mapa…'}</div>
        <div class="map-loader-sub">esto puede tardar unos segundos para campus grandes</div>
      `;
      containerEl.appendChild(overlay);
      _activeLoaders.get(id).overlayEl = overlay;
    }, DELAY_MS);

    _activeLoaders.set(id, { containerEl, overlayEl: null, timer });
    return id;
  }

  function setProgress(id, pct) {
    const entry = _activeLoaders.get(id);
    if (!entry || !entry.overlayEl) return;
    const fg = entry.overlayEl.querySelector('.map-loader-ring-fg');
    const pulse = entry.overlayEl.querySelector('.map-loader-pulse');
    if (fg) {
      fg.style.display = '';
      const C = 326.7;
      fg.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(100, Math.max(0, pct)) / 100)));
    }
    // Cuando hay progreso real, esconder el pulse indeterminado
    if (pulse) pulse.style.display = pct > 0 ? 'none' : '';
  }

  function setMessage(id, message) {
    const entry = _activeLoaders.get(id);
    if (!entry || !entry.overlayEl) return;
    const t = entry.overlayEl.querySelector('.map-loader-text');
    if (t) t.textContent = message;
  }

  function hide(id) {
    const entry = _activeLoaders.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    if (entry.overlayEl && entry.overlayEl.parentNode) {
      entry.overlayEl.style.animation = 'mapLoaderOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (entry.overlayEl && entry.overlayEl.parentNode) {
          entry.overlayEl.parentNode.removeChild(entry.overlayEl);
        }
      }, 300);
    }
    _activeLoaders.delete(id);
  }

  function hideAll() {
    Array.from(_activeLoaders.keys()).forEach(hide);
  }

  return { show, hide, hideAll, setProgress, setMessage };
})();
