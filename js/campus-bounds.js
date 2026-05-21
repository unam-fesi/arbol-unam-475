// js/campus-bounds.js
// Polígono aproximado del campus FES Iztacala UNAM + helpers de clamp.
// Lo usan dashboard-vis (heatmap) y dashboard-iztacala (3D) para que árboles
// con GPS impreciso no se rendericen en la calle / fuera del polígono.
//
// El polígono fue derivado del modelo GLB del campus (iztacala_campus.glb)
// reproyectado a lat/lng (centro 19.52552345, -99.1881276).

(function () {
  'use strict';

  // Polígono [lat, lng] siguiendo el contorno REAL del campus FES Iztacala
  // (área amarilla de OSM con la etiqueta "Facultad de Estudios Superiores
  // Iztacala"). Excluye calles perimetrales (Av. de los Barrios, San Carlos,
  // Calle del Eucalipto) y el ferroviario al oriente.
  const POLY = [
    [19.52765, -99.18900],  // NW (esquina con Av. de los Barrios)
    [19.52770, -99.18790],  // N (cerca de Calle San Carlos)
    [19.52755, -99.18680],  // N-NE
    [19.52720, -99.18590],  // NE-top
    [19.52650, -99.18550],  // NE (antes del ferroviario)
    [19.52550, -99.18540],  // E
    [19.52450, -99.18560],  // E-SE
    [19.52360, -99.18620],  // SE
    [19.52300, -99.18720],  // S-SE
    [19.52290, -99.18810],  // S
    [19.52310, -99.18890],  // S-SW
    [19.52380, -99.18960],  // SW
    [19.52480, -99.18990],  // W-SW
    [19.52590, -99.18980],  // W (sobre Av. de los Barrios)
    [19.52680, -99.18950],  // NW-down
    [19.52730, -99.18920]   // NW-back
  ];

  // Centroide aproximado del campus (mismo que CENTER_LAT/LON en iztacala 3D)
  const CENTROID = [19.52552345, -99.1881276];

  function pointInPolygon(lat, lng) {
    let inside = false;
    for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
      const yi = POLY[i][0], xi = POLY[i][1];
      const yj = POLY[j][0], xj = POLY[j][1];
      const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Distancia (en unidades de grados) y punto más cercano sobre el segmento ab
  function _closestOnSegment(plat, plng, a, b) {
    const ay = a[0], ax = a[1];
    const by = b[0], bx = b[1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return { dist: Math.hypot(plng - ax, plat - ay), lat: ay, lng: ax };
    }
    let t = ((plng - ax) * dx + (plat - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return { dist: Math.hypot(plng - cx, plat - cy), lat: cy, lng: cx };
  }

  // Si (lat,lng) está fuera del polígono, devuelve el punto más cercano dentro
  // (con inset ~8m hacia el centroide para que no quede pegado al borde).
  // Si está dentro, devuelve los mismos valores.
  function clampToCampus(lat, lng) {
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      return { lat, lng, clamped: false, distanceM: 0 };
    }
    if (pointInPolygon(lat, lng)) {
      return { lat, lng, clamped: false, distanceM: 0 };
    }
    let best = { dist: Infinity, lat, lng };
    for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
      const r = _closestOnSegment(lat, lng, POLY[i], POLY[j]);
      if (r.dist < best.dist) best = r;
    }
    // Inset ~5% hacia el centroide para no quedar pegados al borde
    const t = 0.06;
    const cLat = best.lat + (CENTROID[0] - best.lat) * t;
    const cLng = best.lng + (CENTROID[1] - best.lng) * t;
    // Distancia aproximada en metros (1° lat ≈ 110.5km, 1° lng ≈ 105km a 19.5°)
    const dLat = (lat - cLat) * 110574;
    const dLng = (lng - cLng) * 104918;
    const distanceM = Math.hypot(dLat, dLng);
    return { lat: cLat, lng: cLng, clamped: true, distanceM };
  }

  window.IztacalaCampus = {
    polygon: POLY,
    centroid: CENTROID,
    pointInPolygon,
    clampToCampus
  };
})();
