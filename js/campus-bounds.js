// js/campus-bounds.js
// Polígono aproximado del campus FES Iztacala UNAM + helpers de clamp.
// Lo usan dashboard-vis (heatmap) y dashboard-iztacala (3D) para que árboles
// con GPS impreciso no se rendericen en la calle / fuera del polígono.
//
// El polígono fue derivado del modelo GLB del campus (iztacala_campus.glb)
// reproyectado a lat/lng (centro 19.52552345, -99.1881276).

(function () {
  'use strict';

  // Polígono [lat, lng] siguiendo el contorno del campus en sentido CCW.
  // Generoso ~20m hacia fuera para no clamp-ear árboles legítimos en la
  // banqueta interna o cerca del borde.
  const POLY = [
    [19.52790, -99.19140],
    [19.52800, -99.18950],
    [19.52800, -99.18760],
    [19.52760, -99.18560],
    [19.52680, -99.18420],
    [19.52540, -99.18370],
    [19.52400, -99.18410],
    [19.52270, -99.18560],
    [19.52210, -99.18720],
    [19.52210, -99.18870],
    [19.52270, -99.19010],
    [19.52400, -99.19130],
    [19.52550, -99.19210],
    [19.52690, -99.19190]
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
