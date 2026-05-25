// js/splash-video.js
// ============================================================================
// Splash cinematográfico post-login: reproduce data/IztayCalaSembrando.mov en
// pantalla completa con overlay translúcido y un contador gráfico de carga en
// forma de "árbol creciendo" (SVG inline animado). Se cierra al terminar el
// video o cuando el usuario hace click.
//
// Uso:
//   window.SplashVideo.play();        // muestra el splash una vez
//   window.SplashVideo.skip();        // forzar cerrar
// ============================================================================

window.SplashVideo = (function() {
  'use strict';

  const VIDEO_PATH = 'data/IztayCalaSembrando.mov';
  const STORAGE_KEY = 'splash_shown_session';
  let overlayEl = null;
  let videoEl = null;
  let svgEl = null;
  let growthInterval = null;
  let _onCloseCb = null;

  // Mensajes que rotan durante la carga (relacionados al proyecto)
  const LOADING_MESSAGES = [
    'Plantando semillas digitales…',
    'Despertando al colibrí…',
    'Midiendo árboles de Iztacala…',
    'Calculando CO₂ capturado…',
    'Sembrando comunidad…',
    'Iztacala siembra para el mundo',
    'Cuidando el bosque urbano…',
    'Conectando con la UNAM…',
  ];

  function _injectStyles() {
    if (document.getElementById('splash-video-styles')) return;
    const style = document.createElement('style');
    style.id = 'splash-video-styles';
    style.textContent = `
      #splash-video-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: #0a1f0a;
        display: flex; align-items: center; justify-content: center;
        animation: splashFadeIn 0.5s ease-out;
        overflow: hidden;
      }
      @keyframes splashFadeIn { from{opacity:0;} to{opacity:1;} }
      @keyframes splashFadeOut { from{opacity:1;} to{opacity:0;} }
      #splash-video-overlay video {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        filter: brightness(0.85) saturate(1.15);
      }
      #splash-video-overlay::before {
        content: ''; position: absolute; inset: 0; z-index: 1;
        background: radial-gradient(ellipse at center, rgba(10,40,15,0.0) 30%, rgba(5,20,10,0.7) 100%);
        pointer-events: none;
      }
      #splash-tree-container {
        position: relative; z-index: 2;
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
        animation: splashContentIn 1s ease-out both;
        animation-delay: 0.3s;
      }
      @keyframes splashContentIn { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
      #splash-tree-svg {
        width: min(280px, 30vw); height: min(280px, 30vw);
        margin-bottom: 16px;
        filter: drop-shadow(0 0 20px rgba(180, 240, 150, 0.4));
      }
      #splash-progress-text {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 18px;
        color: #fff;
        font-weight: 500;
        text-shadow: 0 2px 8px rgba(0,0,0,0.6);
        margin-bottom: 8px;
        min-height: 24px;
        transition: opacity 0.4s;
      }
      #splash-progress-bar {
        width: min(280px, 30vw);
        height: 6px;
        background: rgba(255,255,255,0.15);
        border-radius: 999px;
        overflow: hidden;
        backdrop-filter: blur(4px);
      }
      #splash-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #6fb24a, #b8e574, #6fb24a);
        background-size: 200% 100%;
        border-radius: 999px;
        transition: width 0.4s ease-out;
        animation: splashShimmer 2s linear infinite;
      }
      @keyframes splashShimmer {
        0%{background-position:0% 0;} 100%{background-position:200% 0;}
      }
      #splash-skip {
        position: absolute; bottom: 24px; right: 24px; z-index: 3;
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
        color: #fff; padding: 8px 16px;
        border-radius: 999px; cursor: pointer;
        font-size: 13px; font-weight: 500;
        transition: background 0.2s;
      }
      #splash-skip:hover { background: rgba(255,255,255,0.2); }
      #splash-brand {
        position: absolute; top: 32px; left: 50%; transform: translateX(-50%);
        z-index: 3;
        font-family: 'Georgia', serif;
        font-size: 22px;
        color: rgba(255,255,255,0.95);
        text-shadow: 0 2px 12px rgba(0,0,0,0.7);
        letter-spacing: 1px;
        animation: splashContentIn 1.2s ease-out both;
      }
      #splash-brand small {
        display: block;
        font-family: -apple-system, sans-serif;
        font-size: 11px;
        letter-spacing: 3px;
        opacity: 0.85;
        margin-top: 4px;
      }
      /* Animaciones internas del árbol */
      .tree-trunk { stroke-dasharray: 200; stroke-dashoffset: 200; animation: drawTrunk 3s ease-out forwards; }
      .tree-branch { stroke-dasharray: 120; stroke-dashoffset: 120; }
      .tree-leaf { opacity: 0; transform-origin: center; }
      @keyframes drawTrunk { to { stroke-dashoffset: 0; } }
      @keyframes drawBranch { to { stroke-dashoffset: 0; } }
      @keyframes leafPop { 0%{opacity:0;transform:scale(0.2);} 60%{opacity:1;transform:scale(1.15);} 100%{opacity:1;transform:scale(1);} }
    `;
    document.head.appendChild(style);
  }

  // SVG del árbol creciendo. Cada hoja aparece con delay progresivo controlado
  // desde JS según el progreso (0-100). Más progreso = más hojas visibles.
  function _treeSVG() {
    return `
      <svg id="splash-tree-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <!-- Suelo -->
        <ellipse cx="100" cy="185" rx="50" ry="6" fill="rgba(0,0,0,0.25)"/>
        <!-- Tronco principal -->
        <path class="tree-trunk" d="M 100 180 Q 98 130 100 90 Q 102 60 100 30"
              stroke="#5a3f25" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- Ramas -->
        <path class="tree-branch" data-i="0" d="M 100 110 Q 80 100 60 90"
              stroke="#5a3f25" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawBranch 1s ease-out 1.0s forwards;"/>
        <path class="tree-branch" data-i="1" d="M 100 90 Q 120 80 140 70"
              stroke="#5a3f25" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawBranch 1s ease-out 1.4s forwards;"/>
        <path class="tree-branch" data-i="2" d="M 100 70 Q 85 55 70 45"
              stroke="#5a3f25" stroke-width="2.5" fill="none" stroke-linecap="round" style="animation:drawBranch 0.8s ease-out 1.8s forwards;"/>
        <path class="tree-branch" data-i="3" d="M 100 50 Q 115 40 130 30"
              stroke="#5a3f25" stroke-width="2.5" fill="none" stroke-linecap="round" style="animation:drawBranch 0.8s ease-out 2.0s forwards;"/>
        <!-- Hojas / copa (12 círculos verdes que aparecen progresivamente) -->
        <g id="splash-leaves">
          <circle class="tree-leaf" data-i="0"  cx="60" cy="90"  r="14" fill="#7BC04A"/>
          <circle class="tree-leaf" data-i="1"  cx="50" cy="80"  r="11" fill="#8FCE56"/>
          <circle class="tree-leaf" data-i="2"  cx="70" cy="78"  r="10" fill="#6FB24A"/>
          <circle class="tree-leaf" data-i="3"  cx="140" cy="70" r="14" fill="#7BC04A"/>
          <circle class="tree-leaf" data-i="4"  cx="150" cy="58" r="11" fill="#8FCE56"/>
          <circle class="tree-leaf" data-i="5"  cx="128" cy="60" r="10" fill="#6FB24A"/>
          <circle class="tree-leaf" data-i="6"  cx="70" cy="45"  r="12" fill="#7BC04A"/>
          <circle class="tree-leaf" data-i="7"  cx="58" cy="36"  r="9"  fill="#8FCE56"/>
          <circle class="tree-leaf" data-i="8"  cx="130" cy="30" r="12" fill="#7BC04A"/>
          <circle class="tree-leaf" data-i="9"  cx="145" cy="22" r="9"  fill="#8FCE56"/>
          <circle class="tree-leaf" data-i="10" cx="100" cy="22" r="14" fill="#7BC04A"/>
          <circle class="tree-leaf" data-i="11" cx="100" cy="10" r="10" fill="#8FCE56"/>
        </g>
        <!-- Colibrí decorativo (silueta) -->
        <g style="opacity:0;animation:leafPop 0.6s ease-out 3.5s forwards;transform-origin:170px 50px;">
          <path d="M 170 50 q -3 -2 -8 -1 q -2 -3 -6 -2 q 3 4 1 6 q 5 1 7 3 q 4 2 6 -6 z"
                fill="#E8C04A" opacity="0.95"/>
          <circle cx="172" cy="48" r="1.2" fill="#222"/>
        </g>
      </svg>
    `;
  }

  function _updateProgress(pct) {
    const fill = document.getElementById('splash-progress-fill');
    if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    // Activar hojas progresivamente: 12 hojas, una nueva cada ~8.3% de progreso
    if (svgEl) {
      const leaves = svgEl.querySelectorAll('.tree-leaf');
      leaves.forEach((leaf, i) => {
        const triggerAt = (i / leaves.length) * 100;
        if (pct >= triggerAt && !leaf.dataset.animated) {
          leaf.dataset.animated = '1';
          leaf.style.animation = `leafPop 0.6s ease-out forwards`;
        }
      });
    }
    // Cambiar texto de mensaje cada 12% (aprox 8 mensajes)
    const textEl = document.getElementById('splash-progress-text');
    if (textEl) {
      const idx = Math.min(LOADING_MESSAGES.length - 1, Math.floor(pct / (100 / LOADING_MESSAGES.length)));
      const msg = LOADING_MESSAGES[idx];
      if (textEl.dataset.msg !== msg) {
        textEl.dataset.msg = msg;
        textEl.style.opacity = '0';
        setTimeout(() => { textEl.textContent = msg; textEl.style.opacity = '1'; }, 200);
      }
    }
  }

  function _close() {
    if (!overlayEl) return;
    if (growthInterval) { clearInterval(growthInterval); growthInterval = null; }
    overlayEl.style.animation = 'splashFadeOut 0.6s ease-in forwards';
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = videoEl = svgEl = null;
      if (typeof _onCloseCb === 'function') _onCloseCb();
      _onCloseCb = null;
    }, 600);
  }

  function play(opts = {}) {
    if (overlayEl) return;            // ya está mostrándose
    _onCloseCb = opts.onClose || null;
    _injectStyles();

    overlayEl = document.createElement('div');
    overlayEl.id = 'splash-video-overlay';
    overlayEl.innerHTML = `
      <video autoplay muted playsinline preload="auto">
        <source src="${VIDEO_PATH}" type="video/quicktime">
        <source src="${VIDEO_PATH}" type="video/mp4">
      </video>
      <div id="splash-brand">
        Proyecto Árbol UNAM 475
        <small>FES IZTACALA SIEMBRA PARA EL MUNDO</small>
      </div>
      <div id="splash-tree-container">
        ${_treeSVG()}
        <div id="splash-progress-text">Plantando semillas digitales…</div>
        <div id="splash-progress-bar"><div id="splash-progress-fill"></div></div>
      </div>
      <button id="splash-skip">Saltar →</button>
    `;
    document.body.appendChild(overlayEl);
    videoEl = overlayEl.querySelector('video');
    svgEl = overlayEl.querySelector('#splash-tree-svg');

    // Simulación de progreso. Acompaña al video o dura mínimo 6 segundos.
    let pct = 0;
    const startTime = Date.now();
    growthInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      // Progreso basado en video real si tenemos duration, sino lineal sobre 6s
      let target;
      if (videoEl && videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
        target = Math.min(100, (videoEl.currentTime / videoEl.duration) * 100);
      } else {
        target = Math.min(100, (elapsed / 6) * 100);
      }
      pct = pct + (target - pct) * 0.15;   // suavizado
      _updateProgress(pct);
      if (pct >= 99.5) {
        clearInterval(growthInterval); growthInterval = null;
      }
    }, 80);

    // Cerrar cuando termina el video o auto a los 10s si el video falla
    let closeTimer = setTimeout(_close, 10000);
    if (videoEl) {
      videoEl.addEventListener('ended', () => { clearTimeout(closeTimer); setTimeout(_close, 400); });
      videoEl.addEventListener('error', () => { console.warn('[Splash] video falló, cerrando en 4s'); clearTimeout(closeTimer); setTimeout(_close, 4000); });
      videoEl.addEventListener('loadedmetadata', () => {
        if (videoEl.duration > 0) {
          clearTimeout(closeTimer);
          // duración total + 0.5s de transición de salida
          closeTimer = setTimeout(_close, videoEl.duration * 1000 + 500);
        }
      });
    }

    // Click "Saltar" cierra
    const skipBtn = overlayEl.querySelector('#splash-skip');
    if (skipBtn) skipBtn.addEventListener('click', () => { clearTimeout(closeTimer); _close(); });
  }

  function skip() { _close(); }

  return { play, skip };
})();
