// js/campus-bounds.js
// ============================================================================
// Polígonos aproximados + centroides de TODOS los campus FES UNAM.
// Lo usan dashboard-vis (heatmap), dashboard-campus (3D) y walkthrough para
// proyectar lat/lng → coords del modelo y clampar árboles dentro del campus.
//
// Iztacala: polígono REAL derivado del modelo GLB (alta precisión).
// Otros campus: bounding boxes aproximados de OSM — refinar con polígonos
// reales cuando estén los modelos Blender precisos.
// ============================================================================

(function () {
  'use strict';

  // ============================================================================
  // POLÍGONOS [lat, lng] por campus
  // ============================================================================

  // FES Iztacala — polígono real del GLB (excluye calles perimetrales)
  const POLY_IZTACALA = [
    [19.52765, -99.18900], [19.52770, -99.18790], [19.52755, -99.18680],
    [19.52720, -99.18590], [19.52650, -99.18550], [19.52550, -99.18540],
    [19.52450, -99.18560], [19.52360, -99.18620], [19.52300, -99.18720],
    [19.52290, -99.18810], [19.52310, -99.18890], [19.52380, -99.18960],
    [19.52480, -99.18990], [19.52590, -99.18980], [19.52680, -99.18950],
    [19.52730, -99.18920]
  ];

  // FES Acatlán — polígono REAL de OSM way 31962082
  const POLY_ACATLAN = [
    [19.48516, -99.25005], [19.48491, -99.24992], [19.48112, -99.24799],
    [19.48066, -99.24773], [19.48082, -99.24723], [19.48101, -99.24686],
    [19.48125, -99.24636], [19.48136, -99.24609], [19.48193, -99.24486],
    [19.48196, -99.24479], [19.48205, -99.24444], [19.48210, -99.24400],
    [19.48274, -99.24407], [19.48300, -99.24345], [19.48408, -99.24398],
    [19.48580, -99.24493], [19.48718, -99.24560], [19.48703, -99.24604],
    [19.48699, -99.24616], [19.48679, -99.24675], [19.48675, -99.24689],
    [19.48666, -99.24715], [19.48662, -99.24730], [19.48670, -99.24770],
    [19.48652, -99.24797], [19.48613, -99.24886], [19.48583, -99.24945],
    [19.48555, -99.25002]
  ];

  // FES Aragón — polígono REAL de OSM way 83589558
  const POLY_ARAGON = [
    [19.47749, -99.04648], [19.47640, -99.04674], [19.47638, -99.04674],
    [19.47361, -99.04739], [19.47348, -99.04679], [19.47334, -99.04608],
    [19.47289, -99.04390], [19.47211, -99.03995], [19.47591, -99.03910]
  ];

  // FES Cuautitlán Campus 1 (Jiménez Cantú, zona Hospital Veterinario UNAM)
  // Polígono manual sobre bbox conocido — OSM no tiene polígono propio del campus
  const POLY_CUAUTITLAN_C1 = [
    [19.69500, -99.19500], [19.69500, -99.18500],
    [19.68700, -99.18500], [19.68700, -99.19500]
  ];

  // FES Cuautitlán Campus 4 — polígono REAL de OSM relation 12323197 (Romero Rubio)
  const POLY_CUAUTITLAN = [
    [19.63911, -99.20722], [19.63866, -99.20715], [19.63831, -99.20709],
    [19.63808, -99.20710], [19.63799, -99.20696], [19.63760, -99.20690],
    [19.63729, -99.20686], [19.63561, -99.20665], [19.63554, -99.20691],
    [19.63549, -99.20710], [19.63542, -99.20733], [19.63533, -99.20761],
    [19.63518, -99.20804], [19.63488, -99.20869], [19.63507, -99.20880],
    [19.63538, -99.20892], [19.63571, -99.20895], [19.63594, -99.20891],
    [19.63648, -99.20874], [19.63785, -99.20829], [19.63790, -99.20828],
    [19.63799, -99.20807], [19.63811, -99.20809], [19.63870, -99.20849],
    [19.63889, -99.20837], [19.63904, -99.20820], [19.63909, -99.20803],
    [19.63914, -99.20767], [19.63920, -99.20732], [19.63919, -99.20728],
    [19.63916, -99.20724], [19.63911, -99.20722]
  ];

  // FES Zaragoza — polígono REAL de OSM relation 12313406 (multi-edificios)
  const POLY_ZARAGOZA = [
    [19.38478, -99.03615], [19.38466, -99.03593], [19.38120, -99.03813],
    [19.38205, -99.03867], [19.38202, -99.03879], [19.38211, -99.03876],
    [19.38220, -99.03866], [19.38227, -99.03859], [19.38251, -99.03842],
    [19.38259, -99.03836], [19.38287, -99.03819], [19.38299, -99.03815],
    [19.38308, -99.03814], [19.38316, -99.03813], [19.38337, -99.03816],
    [19.38364, -99.03819], [19.38370, -99.03817], [19.38388, -99.03806],
    [19.38454, -99.03765], [19.38493, -99.03740], [19.38512, -99.03725],
    [19.38531, -99.03711], [19.38478, -99.03615]
  ];

  // CU (Ciudad Universitaria) — polígono REAL de OSM way 26531801 (34 puntos)
  const POLY_CU = [
    [19.33367, -99.19788], [19.33492, -99.19755], [19.33570, -99.19658],
    [19.33514, -99.19637], [19.33539, -99.19550], [19.33587, -99.19292],
    [19.33660, -99.19103], [19.33662, -99.18632], [19.33655, -99.18600],
    [19.33663, -99.18584], [19.33645, -99.18569], [19.33509, -99.18137],
    [19.33358, -99.17731], [19.33113, -99.17680], [19.32952, -99.17411],
    [19.32549, -99.17429], [19.32378, -99.17449], [19.32090, -99.17464],
    [19.31552, -99.17465], [19.31472, -99.17395], [19.31290, -99.17262],
    [19.31175, -99.17237], [19.31042, -99.17435], [19.31029, -99.18666],
    [19.30990, -99.19056], [19.31075, -99.19384], [19.31095, -99.19403],
    [19.31165, -99.19669], [19.31234, -99.19798], [19.31409, -99.19884],
    [19.31923, -99.19660], [19.32190, -99.19499], [19.32331, -99.19495],
    [19.33170, -99.19637]
  ];

  // ============================================================================
  // METADATA por campus
  // ============================================================================
  // - polygon: lista de [lat,lng]
  // - centroid: [lat,lng]
  // - hasRealModel: true si tiene GLB de Blender (Iztacala only por ahora)
  // - glb: ruta del modelo GLB si existe (null = procedural)
  // ============================================================================
  const CAMPUSES = {
    'Iztacala': {
      polygon: POLY_IZTACALA,
      centroid: [19.52552345, -99.1881276],
      hasRealModel: true,
      glb: 'data/iztacala_campus.glb',      // modelo GLB de Blender (alta fidelidad)
      json: 'data/iztacala_campus.json',    // fallback geométrico
      mPerLat: 110574.0,
      mPerLon: 104918.28705381248,
      displayName: 'FES Iztacala',
    },
    'Acatlan': {
      polygon: POLY_ACATLAN,
      centroid: [19.484270, -99.246783],   // real OSM centroid
      hasRealModel: true,
      glb: null,
      json: 'data/acatlan_campus.json',    // edificios reales OSM
      mPerLat: 110574.0,
      mPerLon: 104945.05,
      displayName: 'FES Acatlán',
    },
    'Aragon': {
      polygon: POLY_ARAGON,
      centroid: [19.474910, -99.044964],   // real OSM centroid
      hasRealModel: true,
      glb: null,
      json: 'data/aragon_campus.json',
      mPerLat: 110574.0,
      mPerLon: 104951.11,
      displayName: 'FES Aragón',
    },
    'Cuautitlan1': {
      polygon: POLY_CUAUTITLAN_C1,
      centroid: [19.691000, -99.190000],   // Campus 1 — zona Hospital Vet UNAM
      hasRealModel: true,
      glb: null,
      json: 'data/cuautitlan1_campus.json',
      mPerLat: 110574.0,
      mPerLon: 104810.39,
      displayName: 'FES Cuautitlán Campus 1',
    },
    'Cuautitlan': {
      polygon: POLY_CUAUTITLAN,
      centroid: [19.637575, -99.207842],   // Campus 4 — real OSM relation 12323197
      hasRealModel: true,
      glb: null,
      json: 'data/cuautitlan_campus.json',
      mPerLat: 110574.0,
      mPerLon: 104845.32,
      displayName: 'FES Cuautitlán Campus 4',
    },
    'Zaragoza': {
      polygon: POLY_ZARAGOZA,
      centroid: [19.383117, -99.038085],   // real OSM relation 12313406
      hasRealModel: true,
      glb: null,
      json: 'data/zaragoza_campus.json',
      mPerLat: 110574.0,
      mPerLon: 105010.44,
      displayName: 'FES Zaragoza',
    },
    'CU': {
      polygon: POLY_CU,
      centroid: [19.324533, -99.186987],
      hasRealModel: true,
      glb: null,
      json: 'data/cu_campus.json',
      mPerLat: 110574.0,
      mPerLon: 105048.16,
      displayName: 'Ciudad Universitaria',
    },
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  function getCampus(name) {
    return CAMPUSES[name] || CAMPUSES['Iztacala'];
  }

  function pointInPolygon(lat, lng, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i][0], xi = poly[i][1];
      const yj = poly[j][0], xj = poly[j][1];
      const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

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
    return { dist: Math.hypot(plng - (ax + t * dx), plat - (ay + t * dy)),
             lat: ay + t * dy, lng: ax + t * dx };
  }

  function clampToCampus(campusName, lat, lng) {
    const c = getCampus(campusName);
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      return { lat, lng, clamped: false, distanceM: 0 };
    }
    if (pointInPolygon(lat, lng, c.polygon)) {
      return { lat, lng, clamped: false, distanceM: 0 };
    }
    let best = { dist: Infinity, lat, lng };
    for (let i = 0, j = c.polygon.length - 1; i < c.polygon.length; j = i++) {
      const r = _closestOnSegment(lat, lng, c.polygon[i], c.polygon[j]);
      if (r.dist < best.dist) best = r;
    }
    // Inset ~6% hacia el centroide para no quedar pegados al borde
    const t = 0.06;
    const cLat = best.lat + (c.centroid[0] - best.lat) * t;
    const cLng = best.lng + (c.centroid[1] - best.lng) * t;
    const dLat = (lat - cLat) * c.mPerLat;
    const dLng = (lng - cLng) * c.mPerLon;
    return { lat: cLat, lng: cLng, clamped: true, distanceM: Math.hypot(dLat, dLng) };
  }

  // Proyectar lat/lng → coords del modelo (metros, origen en centroide del campus)
  function latlonToModelXY(campusName, lat, lng) {
    const c = getCampus(campusName);
    return {
      x: (lng - c.centroid[1]) * c.mPerLon,
      y: (lat - c.centroid[0]) * c.mPerLat,
    };
  }

  window.CampusBounds = {
    campuses: CAMPUSES,
    get: getCampus,
    pointInPolygon: (lat, lng, name) => pointInPolygon(lat, lng, getCampus(name).polygon),
    clampToCampus,
    latlonToModelXY,
  };

  // BACKWARDS-COMPAT: mantener IztacalaCampus para código viejo
  window.IztacalaCampus = {
    polygon: POLY_IZTACALA,
    centroid: CAMPUSES.Iztacala.centroid,
    pointInPolygon: (lat, lng) => pointInPolygon(lat, lng, POLY_IZTACALA),
    clampToCampus: (lat, lng) => clampToCampus('Iztacala', lat, lng),
  };
})();
