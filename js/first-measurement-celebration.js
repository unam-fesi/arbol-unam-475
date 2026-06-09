// js/first-measurement-celebration.js
// =============================================================================
// CELEBRACIÓN DE PRIMER SEGUIMIENTO — Modal overlay con confetti + placa de
// honor estilo "azul marino + dorado" mostrando el nombre del árbol del user.
//
// Se dispara desde mi-arbol.js / mi-portafolio.js cuando un usuario guarda su
// PRIMERA medición de un árbol (isFirst = true). Solo una vez por árbol.
//
// API pública:
//   window.FirstMeasurementCelebration.show(treeName)
//
// Requiere: canvas-confetti (cargado vía CDN en index.html).
// Si no está disponible, degrada con gracia (solo serpentinas + placa).
// =============================================================================

window.FirstMeasurementCelebration = (function () {
  'use strict';

  function _injectStyles() {
    if (document.getElementById('fmc-styles')) return;
    const s = document.createElement('style');
    s.id = 'fmc-styles';
    s.textContent = `
      @keyframes fmcBounceIn { 0%{transform:scale(.3) rotate(-15deg);opacity:0;} 50%{transform:scale(1.15) rotate(5deg);} 100%{transform:scale(1) rotate(0);opacity:1;} }
      @keyframes fmcPlacaIn { 0%{transform:scale(.4) translateY(20px);opacity:0;} 60%{transform:scale(1.08) translateY(-4px);} 100%{transform:scale(1) translateY(0);opacity:1;} }
      @keyframes fmcFadeUp { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }
      @keyframes fmcRainbow { from{background-position:0% 50%;} to{background-position:300% 50%;} }
      @keyframes fmcSerp { 0%{transform:translateY(-100px) rotate(0);opacity:1;} 100%{transform:translateY(110vh) rotate(720deg);opacity:.3;} }
      @keyframes fmcPulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.04);} }
      @keyframes fmcGlow { 0%,100%{box-shadow:0 12px 36px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,215,0,.3),inset 0 2px 8px rgba(255,255,255,.08),0 0 24px rgba(255,215,0,0);} 50%{box-shadow:0 12px 36px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,215,0,.3),inset 0 2px 8px rgba(255,255,255,.08),0 0 36px rgba(255,215,0,.5);} }
      @keyframes fmcFadeOut { to { opacity: 0; transform: scale(.95); } }
      .fmc-overlay { position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; }
      .fmc-msg-feli { font-size:clamp(40px, 8vw, 64px);font-weight:900;letter-spacing:-1px;line-height:1;background:linear-gradient(90deg,#FF3B3B,#FF8C00,#FFD700,#4CAF50,#2196F3,#9C27B0);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 6px 24px rgba(0,0,0,.4);animation:fmcRainbow 2.4s linear infinite, fmcBounceIn .7s cubic-bezier(.68,-0.55,.27,1.55), fmcPulse 2s ease-in-out 1s infinite; }
      .fmc-msg-sub { margin-top:14px;font-size:clamp(16px, 2.4vw, 22px);color:#fff;font-weight:500;line-height:1.5;text-shadow:0 2px 8px rgba(0,0,0,.7);opacity:0;animation:fmcFadeUp .6s ease-out .4s forwards; }
      .fmc-msg-sub .fmc-475 { font-size:1.4em;font-weight:700;color:#FFD700;display:inline-block; }
      .fmc-placa { position:relative;margin:22px auto 0;display:inline-block;padding:20px 44px;background:linear-gradient(135deg,#0a1f44 0%,#1a3a6e 50%,#0a1f44 100%);border:3px solid #FFD700;border-radius:12px;opacity:0;animation:fmcPlacaIn .8s cubic-bezier(.68,-0.55,.27,1.55) 1s forwards, fmcGlow 2.8s ease-in-out 1.8s infinite; }
      .fmc-placa-c { position:absolute;width:14px;height:14px; }
      .fmc-placa-c.tl { top:6px;left:6px;border-top:2px solid #FFD700;border-left:2px solid #FFD700; }
      .fmc-placa-c.tr { top:6px;right:6px;border-top:2px solid #FFD700;border-right:2px solid #FFD700; }
      .fmc-placa-c.bl { bottom:6px;left:6px;border-bottom:2px solid #FFD700;border-left:2px solid #FFD700; }
      .fmc-placa-c.br { bottom:6px;right:6px;border-bottom:2px solid #FFD700;border-right:2px solid #FFD700; }
      .fmc-placa-lbl { font-size:11px;letter-spacing:4px;color:#FFD700;opacity:.7;margin-bottom:6px;font-weight:500; }
      .fmc-placa-name { font-size:clamp(36px, 6.5vw, 60px);font-weight:900;letter-spacing:6px;color:#FFD700;text-shadow:0 2px 4px rgba(0,0,0,.6), 0 0 12px rgba(255,215,0,.4);line-height:1; }
      .fmc-tree-emoji { margin-top:14px;font-size:32px;opacity:0;animation:fmcFadeUp .6s ease-out 1.7s forwards; }
      .fmc-btn { margin-top:22px;padding:11px 30px;background:rgba(255,215,0,.15);color:#FFD700;border:1.5px solid #FFD700;border-radius:24px;font-size:14px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);opacity:0;animation:fmcFadeUp .6s ease-out 2.1s forwards;letter-spacing:.5px; }
      .fmc-btn:hover { background:rgba(255,215,0,.28); }
      .fmc-content { position:relative;z-index:10;text-align:center;padding:20px;max-width:92%; }
      .fmc-canvas { position:fixed;inset:0;pointer-events:none;z-index:99998; }
      .fmc-serp-wrap { position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:99997; }
    `;
    document.head.appendChild(s);
  }

  function _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function show(rawTreeName, opts) {
    opts = opts || {};
    _injectStyles();

    // Sanitizar y normalizar nombre: si viene "FESI 00 AHUEHUETE", extraer
    // "AHUEHUETE" o usar el common_name "Cuitláhuac" si está disponible.
    // El caller decide qué pasar.
    const treeName = String(rawTreeName || 'tu árbol').toUpperCase().trim();

    const overlay = document.createElement('div');
    overlay.className = 'fmc-overlay';
    overlay.innerHTML = `
      <canvas class="fmc-canvas" id="fmc-canvas"></canvas>
      <div class="fmc-serp-wrap" id="fmc-serp-wrap"></div>
      <div class="fmc-content">
        <div class="fmc-msg-feli">¡FELICIDADES!</div>
        <div class="fmc-msg-sub">
          Ahora eres parte de los<br>
          <span class="fmc-475">475 Guardianes</span><br>
          <span style="font-size:0.85em;opacity:0.9;">y cuidador oficial de</span>
        </div>
        <div class="fmc-placa">
          <span class="fmc-placa-c tl"></span>
          <span class="fmc-placa-c tr"></span>
          <span class="fmc-placa-c bl"></span>
          <span class="fmc-placa-c br"></span>
          <div class="fmc-placa-lbl">TU ÁRBOL</div>
          <div class="fmc-placa-name">${_escape(treeName)}</div>
        </div>
        <div class="fmc-tree-emoji">🌳</div>
        <button class="fmc-btn" id="fmc-btn-cerrar">Continuar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Disparar confetti si la lib está cargada
    let intervalo = null;
    try {
      if (typeof confetti === 'function') {
        const canvas = document.getElementById('fmc-canvas');
        const myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
        const burst = () => {
          myConfetti({ particleCount: 80, spread: 90, origin: { x: 0.5, y: 0.3 },
                       colors: ['#FFD700','#FF8C00','#FF3B3B','#4CAF50','#2196F3','#9C27B0','#FFFFFF'] });
          myConfetti({ particleCount: 50, angle: 60, spread: 70, origin: { x: 0, y: 0.7 },
                       colors: ['#FFD700','#0a1f44','#FFFFFF'] });
          myConfetti({ particleCount: 50, angle: 120, spread: 70, origin: { x: 1, y: 0.7 },
                       colors: ['#FFD700','#0a1f44','#FFFFFF'] });
        };
        burst();
        intervalo = setInterval(burst, 900);
        setTimeout(() => { if (intervalo) { clearInterval(intervalo); intervalo = null; } }, 6000);
      }
    } catch (e) { console.warn('[fmc] confetti not available:', e); }

    // Serpentinas
    try {
      const wrap = document.getElementById('fmc-serp-wrap');
      const colores = ['#FFD700','#0a1f44','#FF3B3B','#4CAF50','#2196F3','#9C27B0','#FF8C00','#FFFFFF'];
      for (let i = 0; i < 36; i++) {
        const s = document.createElement('div');
        const col = colores[i % colores.length];
        const izq = Math.random() * 100;
        const delay = Math.random() * 3;
        const dur = 2.5 + Math.random() * 1.5;
        const w = 4 + Math.random() * 4;
        const h = 18 + Math.random() * 16;
        s.style.cssText = `position:absolute;top:-40px;left:${izq}%;width:${w}px;height:${h}px;background:${col};border-radius:2px;animation: fmcSerp ${dur}s ease-in ${delay}s infinite;transform-origin:center;`;
        wrap.appendChild(s);
      }
    } catch (_) {}

    // Cerrar
    const close = () => {
      if (intervalo) { clearInterval(intervalo); intervalo = null; }
      overlay.style.animation = 'fmcFadeOut .4s ease-out forwards';
      setTimeout(() => { try { overlay.remove(); } catch (_) {} }, 450);
    };
    document.getElementById('fmc-btn-cerrar').addEventListener('click', close);
    // Auto-cierre a los 8 segundos (si el user no lo cierra antes)
    const autoTimer = setTimeout(close, 8000);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { clearTimeout(autoTimer); close(); }
    });
  }

  return { show };
})();
