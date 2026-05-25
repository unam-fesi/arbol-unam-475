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
        background: #050d05;
        display: flex; align-items: center; justify-content: center;
        animation: splashFadeIn 0.5s ease-out;
        overflow: hidden;
      }
      @keyframes splashFadeIn { from{opacity:0;} to{opacity:1;} }
      @keyframes splashFadeOut { from{opacity:1;} to{opacity:0;} }

      /* CINEMA LAYOUT: video vertical (1080x1920) centrado con BLUR del mismo
         video llenando los lados — efecto "letterbox blurred" tipo Netflix. */
      /* Fondo verde oscuro mientras el video carga (NO negro). En iPad/Safari
         el video puede tardar 1-2s en empezar; sin este fondo se ve pantalla
         negra y se siente roto. */
      #splash-video-overlay::after {
        background: linear-gradient(180deg, rgba(5,15,8,0.55) 0%, rgba(5,15,8,0) 25%, rgba(5,15,8,0) 60%, rgba(5,15,8,0.85) 100%);
      }
      #splash-video-bg {
        position: absolute; inset: -10px;
        width: calc(100% + 20px); height: calc(100% + 20px);
        object-fit: cover;
        filter: blur(40px) brightness(0.45) saturate(1.2);
        transform: scale(1.1);
        z-index: 0;
        opacity: 0;
        transition: opacity 0.8s ease-out;
      }
      #splash-video-bg.ready { opacity: 1; }
      #splash-video-main {
        position: relative;
        height: 100vh;
        width: auto;
        max-width: 100vw;
        object-fit: contain;
        z-index: 1;
        box-shadow: 0 0 80px rgba(0,0,0,0.6);
        opacity: 0;
        transition: opacity 0.6s ease-out;
      }
      #splash-video-main.ready { opacity: 1; }
      /* Decoración elegante mientras el video no está listo: un patrón sutil
         del color verde de la app, en lugar del cubo negro */
      #splash-video-overlay:not(.video-ready)::before {
        content: '';
        position: absolute; inset: 0; z-index: 0;
        background: radial-gradient(circle at 30% 40%, rgba(80,160,80,0.15), transparent 60%),
                    radial-gradient(circle at 70% 70%, rgba(60,140,100,0.12), transparent 50%),
                    #0a1f0a;
      }
      #splash-video-overlay::after {
        content: ''; position: absolute; inset: 0; z-index: 2;
        background: linear-gradient(180deg, rgba(5,15,8,0.55) 0%, rgba(5,15,8,0) 25%, rgba(5,15,8,0) 60%, rgba(5,15,8,0.85) 100%);
        pointer-events: none;
      }

      /* BRAND — elegante, grande, con dos líneas */
      #splash-brand {
        position: absolute; top: 5vh; left: 50%; transform: translateX(-50%);
        z-index: 4;
        text-align: center;
        animation: splashContentIn 1.2s ease-out both;
        max-width: 92vw;
      }
      #splash-brand-main {
        display: block;
        font-family: 'Georgia', 'Cormorant Garamond', 'Playfair Display', serif;
        font-size: clamp(28px, 5vw, 48px);
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.5px;
        text-shadow: 0 4px 24px rgba(0,0,0,0.85), 0 0 60px rgba(80,180,80,0.25);
        line-height: 1.1;
      }
      #splash-brand-sub {
        display: block;
        margin-top: 12px;
        font-family: 'Georgia', serif;
        font-style: italic;
        font-size: clamp(18px, 2.6vw, 28px);
        font-weight: 600;
        color: #d9f0d2;
        letter-spacing: 4px;
        text-shadow: 0 2px 14px rgba(0,0,0,0.85);
        text-transform: uppercase;
      }
      #splash-brand-divider {
        display: block;
        margin: 8px auto;
        width: clamp(40px, 8vw, 80px);
        height: 2px;
        background: linear-gradient(90deg, transparent, #b8e574, transparent);
      }

      /* MEDIDOR CIRCULAR — abajo, elaborado con anillo + árbol + íconos orbitales */
      #splash-progress-container {
        position: absolute; bottom: 4vh; left: 50%;
        transform: translateX(-50%);
        z-index: 4;
        display: flex; flex-direction: column; align-items: center;
        animation: splashContentIn 1.2s ease-out both;
        animation-delay: 0.4s;
      }
      #splash-progress-ring {
        position: relative;
        width: clamp(120px, 18vh, 180px);
        height: clamp(120px, 18vh, 180px);
        filter: drop-shadow(0 0 24px rgba(120, 220, 120, 0.5));
      }
      #splash-progress-percent {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Georgia', serif;
        font-size: clamp(20px, 3vh, 28px);
        font-weight: 700;
        color: #fff;
        text-shadow: 0 2px 8px rgba(0,0,0,0.7);
        z-index: 2;
        pointer-events: none;
      }
      #splash-progress-text {
        font-family: 'Georgia', serif;
        font-size: clamp(14px, 1.8vh, 17px);
        font-style: italic;
        color: #e8f5e0;
        font-weight: 400;
        text-shadow: 0 2px 8px rgba(0,0,0,0.85);
        margin-top: 14px;
        min-height: 22px;
        transition: opacity 0.4s;
        letter-spacing: 0.5px;
      }

      /* Ring SVG progress */
      .splash-ring-bg { stroke: rgba(255,255,255,0.12); fill: none; stroke-width: 5; }
      .splash-ring-fg {
        stroke: url(#splashRingGradient);
        fill: none;
        stroke-width: 6;
        stroke-linecap: round;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
        transition: stroke-dashoffset 0.4s ease-out;
        filter: drop-shadow(0 0 6px rgba(184, 229, 116, 0.7));
      }
      .splash-ring-pulse {
        stroke: rgba(184, 229, 116, 0.4);
        fill: none; stroke-width: 2;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
        animation: ringPulse 2.5s ease-out infinite;
      }
      @keyframes ringPulse {
        0%{opacity:0.9;stroke-dasharray:0 1000;}
        50%{opacity:0.4;}
        100%{opacity:0;stroke-dasharray:1000 0;}
      }

      /* Árbol detallado dentro del anillo */
      .splash-trunk { stroke-dasharray: 80; stroke-dashoffset: 80; animation: drawSeg 2.2s ease-out forwards; }
      .splash-branch { stroke-dasharray: 40; stroke-dashoffset: 40; }
      .splash-leaf { opacity: 0; transform-origin: center; }
      .splash-flower { opacity: 0; transform-origin: center; }
      @keyframes drawSeg { to { stroke-dashoffset: 0; } }
      @keyframes leafPop { 0%{opacity:0;transform:scale(0.2);} 60%{opacity:1;transform:scale(1.2);} 100%{opacity:1;transform:scale(1);} }
      @keyframes flowerSpin { 0%{opacity:0;transform:rotate(-180deg) scale(0.2);} 100%{opacity:1;transform:rotate(0deg) scale(1);} }

      /* Íconos orbitales (semilla, agua, sol, comunidad) */
      .splash-orbital {
        opacity: 0;
        transform-origin: 60px 60px;
        animation: orbitalAppear 0.6s ease-out forwards;
      }
      @keyframes orbitalAppear { to { opacity: 1; } }

      #splash-skip {
        position: absolute; bottom: 24px; right: 24px; z-index: 5;
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.25);
        color: #fff; padding: 8px 16px;
        border-radius: 999px; cursor: pointer;
        font-size: 13px; font-weight: 500;
        font-family: 'Georgia', serif;
        font-style: italic;
        transition: background 0.2s;
      }
      #splash-skip:hover { background: rgba(255,255,255,0.25); }
    `;
    document.head.appendChild(style);
  }

  // SVG ELABORADO: anillo de progreso circular + árbol detallado adentro (corteza,
  // múltiples ramas, hojas con varias tonalidades, flores rosadas, frutos, mariposa
  // y colibrí decorativos). 18 hojas + 4 flores aparecen progresivamente según %.
  // viewBox 240x240. El círculo de progreso usa stroke-dasharray controlado desde JS.
  // Circunferencia = 2π·105 ≈ 659.7
  function _treeSVG() {
    return `
      <svg id="splash-tree-svg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="splashRingGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#6FB24A"/>
            <stop offset="50%" stop-color="#B8E574"/>
            <stop offset="100%" stop-color="#E8C04A"/>
          </linearGradient>
          <radialGradient id="splashLeafGrad" cx="0.3" cy="0.3">
            <stop offset="0%" stop-color="#A8DC60"/>
            <stop offset="100%" stop-color="#5BA340"/>
          </radialGradient>
          <radialGradient id="splashLeafGradLight" cx="0.3" cy="0.3">
            <stop offset="0%" stop-color="#C8E875"/>
            <stop offset="100%" stop-color="#7BC04A"/>
          </radialGradient>
          <linearGradient id="splashTrunkGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#3a2818"/>
            <stop offset="50%" stop-color="#6b4828"/>
            <stop offset="100%" stop-color="#3a2818"/>
          </linearGradient>
        </defs>

        <!-- Anillo de fondo y pulso -->
        <circle class="splash-ring-bg" cx="120" cy="120" r="105"/>
        <circle class="splash-ring-pulse" cx="120" cy="120" r="105"/>

        <!-- Anillo de PROGRESO (stroke-dashoffset controlado por JS) -->
        <circle id="splash-ring-progress" class="splash-ring-fg" cx="120" cy="120" r="105"
                stroke-dasharray="659.7" stroke-dashoffset="659.7"/>

        <!-- Suelo (tierra) -->
        <ellipse cx="120" cy="200" rx="42" ry="5" fill="rgba(0,0,0,0.3)"/>
        <ellipse cx="120" cy="198" rx="38" ry="3" fill="rgba(95,60,30,0.4)"/>

        <!-- ÁRBOL: tronco con gradient + textura de corteza (líneas paralelas) -->
        <g class="splash-tree-group">
          <!-- Tronco principal (path con curvas naturales) -->
          <path class="splash-trunk" d="M 116 198 Q 117 160 119 130 Q 121 100 120 70 Q 119 50 121 35"
                stroke="url(#splashTrunkGrad)" stroke-width="9" fill="none" stroke-linecap="round"/>
          <!-- Líneas de corteza (más delgadas, encima) -->
          <path d="M 117 195 Q 118 165 120 135" stroke="rgba(40,25,15,0.6)" stroke-width="1.2" fill="none" stroke-linecap="round" style="animation:drawSeg 2.5s ease-out 0.3s forwards;stroke-dasharray:60;stroke-dashoffset:60;"/>
          <path d="M 121 193 Q 122 160 121 130" stroke="rgba(20,12,8,0.5)" stroke-width="0.8" fill="none" style="animation:drawSeg 2.5s ease-out 0.5s forwards;stroke-dasharray:60;stroke-dashoffset:60;"/>

          <!-- Raíces visibles -->
          <path d="M 120 198 Q 105 199 95 202" stroke="#3a2818" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawSeg 1s ease-out 0.4s forwards;stroke-dasharray:30;stroke-dashoffset:30;"/>
          <path d="M 120 198 Q 138 199 148 202" stroke="#3a2818" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawSeg 1s ease-out 0.5s forwards;stroke-dasharray:30;stroke-dashoffset:30;"/>
          <path d="M 120 198 Q 122 200 124 204" stroke="#3a2818" stroke-width="2" fill="none" stroke-linecap="round" style="animation:drawSeg 1s ease-out 0.6s forwards;stroke-dasharray:20;stroke-dashoffset:20;"/>

          <!-- Ramas (6 niveles, con sub-ramas para look natural) -->
          <path class="splash-branch" d="M 119 135 Q 105 125 88 118 Q 78 115 70 110" stroke="#4a3018" stroke-width="4" fill="none" stroke-linecap="round" style="animation:drawSeg 1.4s ease-out 1.0s forwards;stroke-dasharray:70;stroke-dashoffset:70;"/>
          <path class="splash-branch" d="M 120 110 Q 138 100 158 90 Q 168 86 175 80" stroke="#4a3018" stroke-width="4" fill="none" stroke-linecap="round" style="animation:drawSeg 1.4s ease-out 1.3s forwards;stroke-dasharray:70;stroke-dashoffset:70;"/>
          <path class="splash-branch" d="M 120 85 Q 102 75 88 65 Q 80 60 72 52" stroke="#4a3018" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawSeg 1.2s ease-out 1.6s forwards;stroke-dasharray:60;stroke-dashoffset:60;"/>
          <path class="splash-branch" d="M 121 60 Q 138 50 152 38 Q 160 32 168 26" stroke="#4a3018" stroke-width="3" fill="none" stroke-linecap="round" style="animation:drawSeg 1.2s ease-out 1.9s forwards;stroke-dasharray:60;stroke-dashoffset:60;"/>
          <!-- Sub-ramas pequeñas -->
          <path class="splash-branch" d="M 88 118 Q 82 110 78 100" stroke="#4a3018" stroke-width="2" fill="none" stroke-linecap="round" style="animation:drawSeg 0.7s ease-out 1.6s forwards;stroke-dasharray:25;stroke-dashoffset:25;"/>
          <path class="splash-branch" d="M 158 90 Q 165 80 168 70" stroke="#4a3018" stroke-width="2" fill="none" stroke-linecap="round" style="animation:drawSeg 0.7s ease-out 1.9s forwards;stroke-dasharray:25;stroke-dashoffset:25;"/>
          <path class="splash-branch" d="M 120 40 Q 110 25 102 18" stroke="#4a3018" stroke-width="2.5" fill="none" stroke-linecap="round" style="animation:drawSeg 0.7s ease-out 2.1s forwards;stroke-dasharray:30;stroke-dashoffset:30;"/>
          <path class="splash-branch" d="M 120 40 Q 132 28 142 22" stroke="#4a3018" stroke-width="2.5" fill="none" stroke-linecap="round" style="animation:drawSeg 0.7s ease-out 2.2s forwards;stroke-dasharray:30;stroke-dashoffset:30;"/>
        </g>

        <!-- HOJAS — 18 con dos gradientes para profundidad. Aparecen progresivas según %. -->
        <g id="splash-leaves">
          <!-- Lado izquierdo abajo -->
          <ellipse class="splash-leaf" data-i="0"  cx="70" cy="110" rx="13" ry="10" fill="url(#splashLeafGrad)"/>
          <ellipse class="splash-leaf" data-i="1"  cx="60" cy="104" rx="9"  ry="7"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="2"  cx="78" cy="100" rx="8"  ry="6"  fill="url(#splashLeafGrad)"/>
          <!-- Lado derecho abajo -->
          <ellipse class="splash-leaf" data-i="3"  cx="175" cy="80" rx="13" ry="10" fill="url(#splashLeafGrad)"/>
          <ellipse class="splash-leaf" data-i="4"  cx="185" cy="72" rx="9"  ry="7"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="5"  cx="165" cy="72" rx="8"  ry="6"  fill="url(#splashLeafGrad)"/>
          <!-- Medio izquierdo -->
          <ellipse class="splash-leaf" data-i="6"  cx="72" cy="52"  rx="11" ry="8"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="7"  cx="58" cy="44"  rx="8"  ry="6"  fill="url(#splashLeafGrad)"/>
          <ellipse class="splash-leaf" data-i="8"  cx="82" cy="38"  rx="9"  ry="7"  fill="url(#splashLeafGradLight)"/>
          <!-- Medio derecho -->
          <ellipse class="splash-leaf" data-i="9"  cx="168" cy="26" rx="11" ry="8"  fill="url(#splashLeafGrad)"/>
          <ellipse class="splash-leaf" data-i="10" cx="182" cy="20" rx="8"  ry="6"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="11" cx="158" cy="20" rx="9"  ry="7"  fill="url(#splashLeafGrad)"/>
          <!-- Copa -->
          <ellipse class="splash-leaf" data-i="12" cx="102" cy="18" rx="11" ry="9"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="13" cx="142" cy="22" rx="11" ry="9"  fill="url(#splashLeafGrad)"/>
          <ellipse class="splash-leaf" data-i="14" cx="121" cy="10" rx="12" ry="9"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="15" cx="121" cy="28" rx="10" ry="8"  fill="url(#splashLeafGrad)"/>
          <!-- Hojas extra para densidad -->
          <ellipse class="splash-leaf" data-i="16" cx="92" cy="62"  rx="7"  ry="5"  fill="url(#splashLeafGradLight)"/>
          <ellipse class="splash-leaf" data-i="17" cx="148" cy="62" rx="7"  ry="5"  fill="url(#splashLeafGradLight)"/>
        </g>

        <!-- FLORES rosadas/blancas (5 pétalos cada una, aparecen al 60-90% de progreso) -->
        <g id="splash-flowers">
          <g class="splash-flower" data-i="0" transform="translate(75 102)">
            <circle r="3" cx="0"  cy="-4" fill="#F8BBD0"/><circle r="3" cx="3.8" cy="-1" fill="#F8BBD0"/>
            <circle r="3" cx="2.4" cy="3" fill="#F8BBD0"/><circle r="3" cx="-2.4" cy="3" fill="#F8BBD0"/>
            <circle r="3" cx="-3.8" cy="-1" fill="#F8BBD0"/><circle r="1.8" cx="0" cy="0" fill="#FFD54F"/>
          </g>
          <g class="splash-flower" data-i="1" transform="translate(170 70)">
            <circle r="3" cx="0"  cy="-4" fill="#FFFFFF"/><circle r="3" cx="3.8" cy="-1" fill="#FFFFFF"/>
            <circle r="3" cx="2.4" cy="3" fill="#FFFFFF"/><circle r="3" cx="-2.4" cy="3" fill="#FFFFFF"/>
            <circle r="3" cx="-3.8" cy="-1" fill="#FFFFFF"/><circle r="1.8" cx="0" cy="0" fill="#FFB300"/>
          </g>
          <g class="splash-flower" data-i="2" transform="translate(112 30)">
            <circle r="3" cx="0"  cy="-4" fill="#F8BBD0"/><circle r="3" cx="3.8" cy="-1" fill="#F8BBD0"/>
            <circle r="3" cx="2.4" cy="3" fill="#F8BBD0"/><circle r="3" cx="-2.4" cy="3" fill="#F8BBD0"/>
            <circle r="3" cx="-3.8" cy="-1" fill="#F8BBD0"/><circle r="1.8" cx="0" cy="0" fill="#FFD54F"/>
          </g>
          <g class="splash-flower" data-i="3" transform="translate(135 14)">
            <circle r="3" cx="0"  cy="-4" fill="#FFFFFF"/><circle r="3" cx="3.8" cy="-1" fill="#FFFFFF"/>
            <circle r="3" cx="2.4" cy="3" fill="#FFFFFF"/><circle r="3" cx="-2.4" cy="3" fill="#FFFFFF"/>
            <circle r="3" cx="-3.8" cy="-1" fill="#FFFFFF"/><circle r="1.8" cx="0" cy="0" fill="#FFB300"/>
          </g>
        </g>

        <!-- MARIPOSA pequeña volando arriba derecha (animada al final) -->
        <g style="opacity:0;animation:leafPop 0.8s ease-out 3.2s forwards;transform-origin:200px 50px;">
          <g transform="translate(200 50)">
            <ellipse cx="-4" cy="-2" rx="5" ry="3.5" fill="#FF9E80" opacity="0.85"/>
            <ellipse cx="-3" cy="3"  rx="4" ry="3"   fill="#FFB59A" opacity="0.85"/>
            <ellipse cx="4"  cy="-2" rx="5" ry="3.5" fill="#FF9E80" opacity="0.85"/>
            <ellipse cx="3"  cy="3"  rx="4" ry="3"   fill="#FFB59A" opacity="0.85"/>
            <ellipse cx="0"  cy="0"  rx="0.8" ry="4" fill="#3a2818"/>
            <circle cx="-1" cy="-3.5" r="0.6" fill="#3a2818"/>
            <circle cx="1"  cy="-3.5" r="0.6" fill="#3a2818"/>
          </g>
        </g>

        <!-- COLIBRÍ pequeño volando arriba izquierda -->
        <g style="opacity:0;animation:leafPop 0.8s ease-out 3.5s forwards;transform-origin:40px 60px;">
          <g transform="translate(40 60)">
            <ellipse cx="0" cy="0" rx="6" ry="3" fill="#3D8B5C"/>
            <ellipse cx="-5" cy="-1" rx="2.5" ry="2" fill="#5BA56F"/>
            <path d="M 4 0 L 11 -1 L 11 1 Z" fill="#3a2818"/>
            <ellipse cx="-2" cy="-3" rx="4" ry="2" fill="rgba(220,220,255,0.7)" transform="rotate(-25)" style="animation:leafPop 0.3s ease-in-out infinite alternate;"/>
            <circle cx="-4" cy="-1" r="0.7" fill="#222"/>
          </g>
        </g>
      </svg>
    `;
  }

  // SVG decorativo de íconos orbitales que aparecen en las 4 esquinas del progreso
  function _orbitalIcons() {
    return `
      <div class="splash-orbital" data-i="0" style="position:absolute;top:8%;left:8%;animation-delay:1.5s;font-size:22px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.7));">🌱</div>
      <div class="splash-orbital" data-i="1" style="position:absolute;top:8%;right:8%;animation-delay:1.8s;font-size:22px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.7));">💧</div>
      <div class="splash-orbital" data-i="2" style="position:absolute;bottom:8%;left:8%;animation-delay:2.1s;font-size:22px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.7));">☀️</div>
      <div class="splash-orbital" data-i="3" style="position:absolute;bottom:8%;right:8%;animation-delay:2.4s;font-size:22px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.7));">🦋</div>
    `;
  }

  function _updateProgress(pct) {
    pct = Math.min(100, Math.max(0, pct));

    // Anillo circular: circumference = 2πr = 2π·105 ≈ 659.7
    const ring = document.getElementById('splash-ring-progress');
    if (ring) {
      const C = 659.7;
      ring.setAttribute('stroke-dashoffset', String(C * (1 - pct / 100)));
    }
    // % numérico al centro
    const pctEl = document.getElementById('splash-progress-percent');
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';

    if (svgEl) {
      // Hojas progresivas (18 hojas — una cada ~5.5% de progreso)
      const leaves = svgEl.querySelectorAll('.splash-leaf');
      leaves.forEach((leaf, i) => {
        const triggerAt = (i / leaves.length) * 85;   // hasta 85% para dejar espacio a flores
        if (pct >= triggerAt && !leaf.dataset.animated) {
          leaf.dataset.animated = '1';
          leaf.style.animation = `leafPop 0.6s ease-out forwards`;
        }
      });
      // Flores aparecen entre 60% y 95% (las 4 flores con offset)
      const flowers = svgEl.querySelectorAll('.splash-flower');
      flowers.forEach((flower, i) => {
        const triggerAt = 60 + (i / flowers.length) * 35;
        if (pct >= triggerAt && !flower.dataset.animated) {
          flower.dataset.animated = '1';
          flower.style.animation = `flowerSpin 0.7s ease-out forwards`;
        }
      });
    }
    // Mensaje rotativo
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
      <!-- Video BG: blur cover llenando los lados del viewport (efecto cine) -->
      <!-- webkit-playsinline + playsinline + muted son OBLIGATORIOS para autoplay en iOS Safari -->
      <video id="splash-video-bg" autoplay muted playsinline webkit-playsinline="true" loop preload="auto" disableRemotePlayback>
        <!-- mp4 primero porque iOS Safari prefiere ese sobre quicktime -->
        <source src="${VIDEO_PATH}" type="video/mp4">
        <source src="${VIDEO_PATH}" type="video/quicktime">
      </video>
      <!-- Video MAIN: vertical real, height 100vh, width auto → puma COMPLETO -->
      <video id="splash-video-main" autoplay muted playsinline webkit-playsinline="true" preload="auto" disableRemotePlayback>
        <source src="${VIDEO_PATH}" type="video/mp4">
        <source src="${VIDEO_PATH}" type="video/quicktime">
      </video>

      <div id="splash-brand">
        <span id="splash-brand-main">Proyecto Árbol UNAM 475</span>
        <span id="splash-brand-divider"></span>
        <span id="splash-brand-sub">FES Iztacala siembra para el mundo</span>
      </div>

      <div id="splash-progress-container">
        <div id="splash-progress-ring">
          ${_orbitalIcons()}
          ${_treeSVG()}
          <div id="splash-progress-percent">0%</div>
        </div>
        <div id="splash-progress-text">Plantando semillas digitales…</div>
      </div>

      <button id="splash-skip">Saltar →</button>
    `;
    document.body.appendChild(overlayEl);
    // El video que importa para el progreso es el MAIN. El BG se sincroniza por tiempo.
    videoEl = overlayEl.querySelector('#splash-video-main');
    const bgVideoEl = overlayEl.querySelector('#splash-video-bg');

    // iOS Safari: forzar carga explícita + play() programático.
    // Sin esto, en iPad a veces el video se queda en negro 1-2s
    [videoEl, bgVideoEl].forEach(v => {
      if (!v) return;
      try { v.load(); } catch(_) {}
      // Reveal al primer 'playing' event (cuando empieza a renderizar frames de verdad)
      v.addEventListener('playing', () => v.classList.add('ready'), { once: true });
      // Si autoplay falla (iOS bloquea sin gesto), reintentar
      const tryPlay = () => v.play().catch(() => {
        // Fallback: revelarlo igual a los 600ms para no quedar negro
        setTimeout(() => v.classList.add('ready'), 600);
      });
      if (v.readyState >= 2) tryPlay();
      else v.addEventListener('loadeddata', tryPlay, { once: true });
    });

    // Sincronizar BG con el main (mismo tiempo)
    if (videoEl && bgVideoEl) {
      videoEl.addEventListener('timeupdate', () => {
        if (Math.abs(bgVideoEl.currentTime - videoEl.currentTime) > 0.3) {
          bgVideoEl.currentTime = videoEl.currentTime;
        }
      });
      // Marcar overlay como "video-ready" para esconder el fondo radial decorativo
      videoEl.addEventListener('playing', () => overlayEl.classList.add('video-ready'), { once: true });
    }
    svgEl = overlayEl.querySelector('#splash-tree-svg');

    // ── Lógica simple y robusta ──
    // 1. Si video empieza a reproducir en ≤ MAX_WAIT_MS → reproducir todo
    // 2. Si NO empieza en MAX_WAIT_MS → cerrar splash y entrar al portal
    //    (el usuario ya está esperando demasiado, mejor entrar)
    const MAX_WAIT_MS = 4000;   // ventana de espera para que el video arranque
    const FALLBACK_TOTAL_MS = 25000;   // seguridad ABSOLUTA por si algo se atora
    let pct = 0;
    let videoStarted = false;
    const textEl = () => document.getElementById('splash-progress-text');
    const initTextEl = textEl();
    if (initTextEl) initTextEl.textContent = 'Cargando…';

    // Fallback duro: si NADA pasa en MAX_WAIT_MS, cerrar.
    let waitTimeout = setTimeout(() => {
      if (!videoStarted) {
        console.warn(`[Splash] video no inició en ${MAX_WAIT_MS}ms, cerrando.`);
        _close();
      }
    }, MAX_WAIT_MS);

    // Salvavidas absoluto: si por algún bug nada cierra el splash, fuerza cierre
    const absoluteSafety = setTimeout(() => {
      console.warn('[Splash] salvavidas absoluto activado, forzando cierre.');
      _close();
    }, FALLBACK_TOTAL_MS);

    if (videoEl) {
      videoEl.addEventListener('playing', () => {
        clearTimeout(waitTimeout);
        videoStarted = true;
        const t = textEl();
        if (t) t.textContent = LOADING_MESSAGES[0];
        console.log('[Splash] video iniciado, duration=', videoEl.duration);
      }, { once: true });

      videoEl.addEventListener('ended', () => {
        clearTimeout(absoluteSafety);
        setTimeout(_close, 400);
      });

      videoEl.addEventListener('error', (e) => {
        console.warn('[Splash] video error:', e);
        clearTimeout(waitTimeout);
        clearTimeout(absoluteSafety);
        setTimeout(_close, 600);
      });
    }

    // Loop de progreso atado al video real
    growthInterval = setInterval(() => {
      if (!videoStarted) {
        _updateProgress(0);
        return;
      }
      const videoReady = videoEl && videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0;
      const target = videoReady
        ? Math.min(100, (videoEl.currentTime / videoEl.duration) * 100)
        : 0;
      pct = pct + (target - pct) * 0.18;
      _updateProgress(pct);
      if (pct >= 99.5) { clearInterval(growthInterval); growthInterval = null; }
    }, 80);

    // Click "Saltar" cierra
    const skipBtn = overlayEl.querySelector('#splash-skip');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      clearTimeout(waitTimeout); clearTimeout(absoluteSafety); _close();
    });
  }

  function skip() { _close(); }

  return { play, skip };
})();
