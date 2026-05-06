// Forest FX — animaciones ambientales para tema Forest Academy
// Genera hojas cayendo, raíces que crecen, y micro-interacciones.

(function () {
  'use strict';

  // Respeta reduced motion
  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  // ========================================================
  // SVG paths para hojas (4 tipos para variedad)
  // ========================================================
  const LEAF_SVGS = [
    // Hoja simple curva
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
       <path d="M16 2 C8 8, 4 16, 6 24 C8 28, 14 30, 16 30 C18 30, 24 28, 26 24 C28 16, 24 8, 16 2 Z"
             fill="#4a7c2a"/>
       <path d="M16 4 L16 28" stroke="#2d5016" stroke-width="0.6" fill="none"/>
     </svg>`,
    // Hoja amarillenta otoñal
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
       <path d="M16 2 C10 6, 6 14, 8 22 C10 28, 16 30, 16 30 C16 30, 22 28, 24 22 C26 14, 22 6, 16 2 Z"
             fill="#d49b3a"/>
       <path d="M16 4 L16 28" stroke="#8b6f47" stroke-width="0.6" fill="none"/>
     </svg>`,
    // Hoja oliva
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
       <path d="M16 3 C9 9, 5 18, 8 25 C11 29, 16 29, 16 29 C16 29, 21 29, 24 25 C27 18, 23 9, 16 3 Z"
             fill="#708a3e"/>
       <path d="M16 5 L16 27" stroke="#3d2817" stroke-width="0.5" fill="none"/>
     </svg>`,
    // Hoja sage
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
       <path d="M16 2 C7 7, 3 16, 5 23 C9 28, 16 30, 16 30 C16 30, 23 28, 27 23 C29 16, 25 7, 16 2 Z"
             fill="#95b86c"/>
       <path d="M16 4 L16 28" stroke="#2d5016" stroke-width="0.5" fill="none"/>
     </svg>`,
  ];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ========================================================
  // Backdrop con hojas cayendo
  // - Una capa fija a nivel body (para main-app, fondo general)
  // - Otra capa absoluta DENTRO del login-screen (para verse sobre la foto)
  // ========================================================
  function makeLeavesLayer(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'forest-backdrop' + (opts.contained ? ' contained' : '');
    wrap.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < opts.count; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'leaf-falling';
      leaf.innerHTML = pick(LEAF_SVGS);
      leaf.style.left = rand(0, 100) + '%';
      leaf.style.animationDuration = rand(14, 26) + 's';
      leaf.style.animationDelay = rand(0, 20) + 's';
      const scale = rand(0.7, 1.4);
      // Combinamos scale con un offset inicial para que cada hoja arranque en distinta posición
      leaf.style.transform = 'scale(' + scale + ')';
      leaf.style.opacity = String(rand(opts.minOpacity || 0.4, opts.maxOpacity || 0.75));
      wrap.appendChild(leaf);
    }
    return wrap;
  }

  function createBackdrop() {
    const isMobile = window.innerWidth < 768;
    // En móvil ponemos MENOS hojas pero seguimos teniendo (antes a veces se invisibilizaban por GPU)
    const bodyCount = isMobile ? 8 : 14;
    const loginCount = isMobile ? 7 : 12;

    // Body-level (ambient, ya no se ve detrás del login porque login tapa con foto;
    //  pero sí se ve en el resto de la app)
    if (!document.querySelector('body > .forest-backdrop')) {
      const bodyLayer = makeLeavesLayer({ count: bodyCount, contained: false });
      document.body.insertBefore(bodyLayer, document.body.firstChild);
    }

    // Inside login-screen: absolute, z-index entre overlay y box → visible sobre la foto
    const login = document.getElementById('login-screen');
    if (login && !login.querySelector('.forest-backdrop')) {
      const loginLayer = makeLeavesLayer({
        count: loginCount, contained: true,
        minOpacity: 0.55, maxOpacity: 0.95   // más visibles contra el overlay oscuro
      });
      // Insertar después de la primera capa (sun rays) pero antes del login-box
      login.appendChild(loginLayer);
    }
  }

  // ========================================================
  // Decoración de raíces creciendo (en login)
  // ========================================================
  function addRootDecorationToLogin() {
    const login = document.getElementById('login-screen');
    if (!login || login.querySelector('.root-decoration')) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'root-decoration');
    svg.setAttribute('viewBox', '0 0 600 200');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'bottom:0;left:0;width:100%;height:200px;z-index:1;';
    svg.innerHTML = `
      <path d="M300 0 L300 100
               M300 100 Q280 130 250 145 Q230 160 200 165
               M300 100 Q320 135 360 150 Q400 165 440 170
               M300 100 Q295 140 285 175
               M300 100 Q310 145 325 180
               M250 145 Q230 175 215 195
               M360 150 Q380 175 400 195"
            stroke="#2d5016" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="300" cy="100" r="6" fill="#4a7c2a"/>
      <circle cx="200" cy="165" r="3" fill="#4a7c2a"/>
      <circle cx="440" cy="170" r="3" fill="#4a7c2a"/>
      <circle cx="285" cy="175" r="2" fill="#4a7c2a"/>
      <circle cx="325" cy="180" r="2" fill="#4a7c2a"/>
    `;
    login.appendChild(svg);
  }

  // ========================================================
  // Sun rays sutiles (radial gradient animado para login)
  // ========================================================
  function addSunRays() {
    const login = document.getElementById('login-screen');
    if (!login) return;
    const rays = document.createElement('div');
    rays.style.cssText =
      'position:absolute;top:-15%;left:50%;width:120%;height:50%;' +
      'transform:translateX(-50%);pointer-events:none;z-index:0;' +
      'background:radial-gradient(ellipse at center top,' +
      'rgba(255,220,140,0.18),transparent 60%);' +
      'animation:sun-pulse 8s ease-in-out infinite;';
    rays.setAttribute('aria-hidden', 'true');
    login.insertBefore(rays, login.firstChild);

    // Inserta keyframes una vez
    if (!document.getElementById('forest-fx-keyframes')) {
      const style = document.createElement('style');
      style.id = 'forest-fx-keyframes';
      style.textContent =
        '@keyframes sun-pulse {' +
        ' 0%,100% { opacity: 0.8; transform: translateX(-50%) scale(1); }' +
        ' 50%     { opacity: 1.0; transform: translateX(-50%) scale(1.05); }' +
        '}';
      document.head.appendChild(style);
    }
  }

  // ========================================================
  // Click ripple effect en botones (sutil)
  // ========================================================
  function attachRippleEffect() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.btn, .login-btn, .nav-link, .admin-tab, .mi-arbol-tab');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-fx';
      ripple.style.cssText =
        'position:absolute;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(255,255,255,0.45),transparent 60%);' +
        'pointer-events:none;width:0;height:0;' +
        'left:' + (e.clientX - rect.left) + 'px;' +
        'top:'  + (e.clientY - rect.top) + 'px;' +
        'transform:translate(-50%,-50%);' +
        'animation:ripple-out 600ms ease-out forwards;';
      // Asegura que el botón pueda contener el ripple
      const cs = window.getComputedStyle(btn);
      if (cs.position === 'static') btn.style.position = 'relative';
      if (cs.overflow !== 'hidden') btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 650);
    }, { passive: true });

    if (!document.getElementById('forest-fx-ripple-keyframes')) {
      const style = document.createElement('style');
      style.id = 'forest-fx-ripple-keyframes';
      style.textContent =
        '@keyframes ripple-out {' +
        '  to { width: 280px; height: 280px; opacity: 0; }' +
        '}';
      document.head.appendChild(style);
    }
  }

  // ========================================================
  // Health gauge: anima el número del 0 al valor real
  // (busca elementos con class "health-score" cuando entren al viewport)
  // ========================================================
  function animateHealthScore(el) {
    if (el._animated) return;
    el._animated = true;
    const text = el.textContent.trim();
    const m = text.match(/(\d+)/);
    if (!m) return;
    const target = parseInt(m[1], 10);
    if (!isFinite(target)) return;
    const suffix = text.replace(/^\d+/, '');
    let cur = 0;
    const start = performance.now();
    const dur = 900;
    function step(t) {
      const p = Math.min(1, (t - start) / dur);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - p, 3);
      cur = Math.round(target * ease);
      el.textContent = cur + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function setupHealthScoreObserver() {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) animateHealthScore(entry.target);
      });
    }, { threshold: 0.3 });

    const scan = function () {
      document.querySelectorAll('.health-score').forEach(function (el) {
        if (!el._observed) { obs.observe(el); el._observed = true; }
      });
    };
    scan();
    // Re-scan cuando cambien las secciones
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }

  // ========================================================
  // Inicializar
  // ========================================================
  function init() {
    createBackdrop();
    addRootDecorationToLogin();
    addSunRays();
    attachRippleEffect();
    setupHealthScoreObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
