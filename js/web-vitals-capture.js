// js/web-vitals-capture.js
// ============================================================================
// Captura Web Vitals (LCP, CLS, INP/FID, TTFB, FCP) y los manda a la edge
// function `log-vitals` UNA sola vez por página (batched al visibilitychange).
//
// Estrategia:
//   • Lazy-load `web-vitals` (v4) desde unpkg (~2.5 KB gzipped).
//   • Cada métrica se registra en un buffer local.
//   • Al cerrar/ocultar la pestaña, se envían TODAS las métricas en 1 sola POST.
//   • También se envía al cabo de 30 segundos (por si el usuario se queda mucho).
//
// Privacidad: enviamos métricas anónimas + el user_id (si está logueado vía JWT).
// No enviamos contenido, queries, ni texto del usuario. Solo timing y rating.
// ============================================================================

(function () {
  'use strict';

  // Bypass si estamos en localhost o el cliente quiso desactivarlo
  try {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
    if (sessionStorage.getItem('disable_vitals') === '1') return;
  } catch (_) {}

  const SUPABASE_URL = (window.SUPABASE_URL || (window.sb && window.sb.supabaseUrl) || '');
  const ANON_KEY = (window.SUPABASE_ANON_KEY || (window.sb && window.sb.supabaseKey) || '');
  if (!SUPABASE_URL) return;

  const ENDPOINT = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/log-vitals';
  const buffer = [];
  let sent = false;

  function getAuthToken() {
    // Intenta obtener access_token del session de Supabase (sin bloquear)
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (k) {
        const parsed = JSON.parse(localStorage.getItem(k));
        return parsed?.access_token || null;
      }
    } catch (_) {}
    return null;
  }

  function flush() {
    if (sent || buffer.length === 0) return;
    sent = true;
    const payload = JSON.stringify(buffer.splice(0));
    const headers = {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    };
    const token = getAuthToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // sendBeacon es ideal: no bloquea el unload + el browser garantiza entrega.
    // Si no está disponible, fallback a fetch keepalive.
    try {
      if (navigator.sendBeacon) {
        // sendBeacon no acepta headers custom, así que mandamos como blob.
        // El edge function valida desde la URL/body sin requerir apikey en este caso
        // pero como verify_jwt:false, lo aceptará igual.
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
        return;
      }
    } catch (_) {}
    fetch(ENDPOINT, { method: 'POST', headers, body: payload, keepalive: true }).catch(() => {});
  }

  function record(metric) {
    if (!metric || !metric.name) return;
    buffer.push({
      page: (location.pathname + (location.hash || '')).slice(0, 200),
      metric: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating || null,
      navigation_type: metric.navigationType || null,
    });
  }

  // Disparadores: cuando la página se oculta o el usuario se va
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  // Safety net: a los 30s, mandar lo que haya
  setTimeout(flush, 30000);

  // Lazy-load web-vitals v4 desde unpkg
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/web-vitals@4.2.4/dist/web-vitals.attribution.iife.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    try {
      const WV = window.webVitals;
      if (!WV) return;
      // onCLS y onLCP reportan múltiples veces (cuando cambian); el último valor cuenta.
      // Para evitar duplicados, mantenemos solo el último por nombre.
      const latestByName = {};
      const trackerOf = (name) => (metric) => {
        metric.name = name;
        latestByName[name] = {
          name,
          value: metric.value,
          rating: metric.rating,
          navigationType: metric.navigationType,
        };
        // Actualizar el buffer: reemplazar entrada existente del mismo nombre
        const idx = buffer.findIndex(b => b.metric === name);
        const item = latestByName[name];
        const entry = {
          page: (location.pathname + (location.hash || '')).slice(0, 200),
          metric: name,
          value: Math.round(item.value * 1000) / 1000,
          rating: item.rating || null,
          navigation_type: item.navigationType || null,
        };
        if (idx >= 0) buffer[idx] = entry;
        else buffer.push(entry);
      };
      WV.onCLS(trackerOf('CLS'));
      WV.onLCP(trackerOf('LCP'));
      WV.onINP(trackerOf('INP'));
      WV.onTTFB(trackerOf('TTFB'));
      WV.onFCP(trackerOf('FCP'));
    } catch (e) { console.warn('[vitals] init failed', e); }
  };
  script.onerror = () => { /* silencioso — si no carga, no hay métricas */ };
  document.head.appendChild(script);
})();
