// Dashboard visualizations: Mapa 3D, Mosaico de fotos 3D, Heatmap.
// Cada vista expone init(containerSelector, treeList) y destroy().

(function () {
  'use strict';

  function colorByHealthHex(score) {
    if (score == null) return '#c5b5a0';
    if (score >= 80) return '#4a7c2a';
    if (score >= 60) return '#95b86c';
    if (score >= 40) return '#d49b3a';
    if (score >= 0)  return '#b54f3a';
    return '#c5b5a0';
  }
  function colorByHealthHexInt(score) {
    if (score == null) return 0xc5b5a0;
    if (score >= 80) return 0x4a7c2a;
    if (score >= 60) return 0x95b86c;
    if (score >= 40) return 0xd49b3a;
    if (score >= 0)  return 0xb54f3a;
    return 0xc5b5a0;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // =========================================================
  // MAPA 3D — Leaflet con árboles plotteados por lat/lng
  // =========================================================
  let mapaInstance = null;

  function mapaInit(containerSel, trees) {
    const el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el || typeof L === 'undefined') return false;
    if (mapaInstance) { mapaInstance.remove(); mapaInstance = null; }
    el.innerHTML = '';

    const treesWithCoord = (trees || []).filter(t => t.location_lat && t.location_lng);
    if (treesWithCoord.length === 0) {
      el.innerHTML = '<div class="vis-loading">Sin árboles georreferenciados aún. Agrega ubicación a tus árboles desde el primer seguimiento.</div>';
      return true;
    }

    // Centro inicial = promedio de coordenadas
    const avgLat = treesWithCoord.reduce((s,t) => s + t.location_lat, 0) / treesWithCoord.length;
    const avgLng = treesWithCoord.reduce((s,t) => s + t.location_lng, 0) / treesWithCoord.length;

    mapaInstance = L.map(el, { zoomControl: true }).setView([avgLat, avgLng], 14);
    // Tiles Esri World Imagery (vista satélite, da look "3D-ish")
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(mapaInstance);

    // Markers — div icons coloreados por salud, con animación pulse
    treesWithCoord.forEach(t => {
      const color = colorByHealthHex(t.health_score);
      const size = 28;
      const icon = L.divIcon({
        className: 'mapa-tree-marker',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
                   border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);
                   display:flex;align-items:center;justify-content:center;color:white;
                   font-size:14px;font-weight:bold;">🌳</div>`,
        iconSize: [size, size], iconAnchor: [size/2, size/2]
      });
      const marker = L.marker([t.location_lat, t.location_lng], { icon }).addTo(mapaInstance);
      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:180px;">
          <strong>${escapeHtml(t.common_name || t.species || 'Árbol')}</strong>
          <div style="font-size:0.8rem;color:#6a5d4d;margin-top:4px;">${escapeHtml(t.tree_code || '-')} · ${escapeHtml(t.campus || '?')}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>
            <span style="font-size:0.85rem;">Salud ${t.health_score || 0}/100</span>
          </div>
          <button onclick="if(typeof editAdminTree==='function') editAdminTree(${t.id})"
                  style="margin-top:8px;background:#2d5016;color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;">
            Abrir árbol
          </button>
        </div>
      `);
    });

    // Fit bounds
    const bounds = L.latLngBounds(treesWithCoord.map(t => [t.location_lat, t.location_lng]));
    if (treesWithCoord.length > 1) mapaInstance.fitBounds(bounds, { padding: [40, 40] });

    setTimeout(() => mapaInstance.invalidateSize(), 200);
    return true;
  }

  function mapaDestroy() { if (mapaInstance) { mapaInstance.remove(); mapaInstance = null; } }

  // =========================================================
  // HEATMAP — Mismo Leaflet pero con círculos translúcidos
  // intensidad por salud (más rojo = más crítico)
  // =========================================================
  let heatmapInstance = null;

  function heatmapInit(containerSel, trees) {
    const el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el || typeof L === 'undefined') return false;
    if (heatmapInstance) { heatmapInstance.remove(); heatmapInstance = null; }
    el.innerHTML = '';

    // SIN clamp — preservamos coords reales (el polígono no es lo bastante
    // fiel al GLB y aplastaba 78 árboles contra su borde). Solo detectamos
    // outliers para marcarlos visualmente con anillo punteado, pero la
    // posición en el mapa permanece igual a la original.
    const detectFn = (window.IztacalaCampus && window.IztacalaCampus.pointInPolygon)
      ? window.IztacalaCampus.pointInPolygon
      : null;
    const withCoord = (trees || [])
      .filter(t => t.location_lat && t.location_lng)
      .map(t => {
        const outside = detectFn ? !detectFn(t.location_lat, t.location_lng) : false;
        return {
          ...t,
          _lat: t.location_lat,
          _lng: t.location_lng,
          _clamped: outside,        // se mantiene el nombre para no romper la UI
          _clampDistM: 0
        };
      });

    if (withCoord.length === 0) {
      el.innerHTML = '<div class="vis-loading">Sin árboles georreferenciados aún.</div>';
      return true;
    }

    const avgLat = withCoord.reduce((s,t) => s + t._lat, 0) / withCoord.length;
    const avgLng = withCoord.reduce((s,t) => s + t._lng, 0) / withCoord.length;

    heatmapInstance = L.map(el, { zoomControl: true }).setView([avgLat, avgLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(heatmapInstance);

    // Polígono del campus en overlay para que el usuario vea los límites.
    if (window.IztacalaCampus && window.IztacalaCampus.polygon) {
      console.log('[Heatmap v26] Pintando polígono del campus FES Iztacala con', window.IztacalaCampus.polygon.length, 'vértices');
      L.polygon(window.IztacalaCampus.polygon, {
        color: '#1b5e20',
        weight: 3,
        opacity: 1,
        fillColor: '#1b5e20',
        fillOpacity: 0.08,
        dashArray: '8 5',
        interactive: false
      }).addTo(heatmapInstance);
    } else {
      console.warn('[Heatmap v26] IztacalaCampus no está cargado — clamp/polígono deshabilitados');
    }

    // Color semáforo unificado (mismo umbral que Bosque 3D / Iztacala 3D)
    //   ≥70 Sano (#4CAF50) · 40-69 Atención (#FFA726) · <40 Crítico (#EF5350)
    const semaforoColor = (score) => {
      if (score == null) return '#9e9e9e';
      if (score >= 70) return '#4CAF50';
      if (score >= 40) return '#FFA726';
      return '#EF5350';
    };
    // Prioridad de pintado: críticos (1) arriba, atención (2), sanos (3) abajo.
    // Así los rojos/amarillos NO quedan tapados por los verdes al encimarse.
    const priority = (score) => {
      if (score == null) return 4;
      if (score < 40) return 1;
      if (score < 70) return 2;
      return 3;
    };
    const sortedTrees = withCoord.slice().sort(
      (a, b) => priority(b.health_score) - priority(a.health_score)
    );

    // Capa de intensidad: círculos más pequeños y translúcidos para no taparse
    sortedTrees.forEach(t => {
      const color = semaforoColor(t.health_score);
      const isCritical = (t.health_score != null && t.health_score < 70);
      const pos = [t._lat, t._lng];
      // Halo de "calor" pequeño y translúcido
      L.circle(pos, {
        radius: 15,
        color: color, fillColor: color,
        fillOpacity: isCritical ? 0.35 : 0.22,
        weight: 0
      }).addTo(heatmapInstance);
      // Marcar visualmente árboles cuyas coords caen fuera del polígono del
      // campus (probable GPS impreciso al registrar). NO se mueve su posición.
      const isOutside = !!t._clamped;
      if (isOutside) {
        L.circleMarker(pos, {
          radius: 9, color: '#FFB300', weight: 1.5,
          dashArray: '3 3', fill: false, opacity: 0.9
        }).addTo(heatmapInstance);
      }
      const tooltipExtra = isOutside
        ? `<br><span style="color:#b26500;font-size:0.72rem;">⚠ coord fuera del campus</span>`
        : '';
      const centerMarker = L.circleMarker(pos, {
        radius: isCritical ? 7 : 5,
        color: 'white',
        weight: 2,
        fillColor: color,
        fillOpacity: 1
      }).addTo(heatmapInstance).bindTooltip(
        `${escapeHtml(t.common_name || t.species || 'Árbol')} — ${t.health_score || 0}%${tooltipExtra}`,
        { direction: 'top' }
      );
      // Críticos siempre arriba en el orden Z del SVG
      if (isCritical) centerMarker.bringToFront();
    });

    // Conteo de árboles cuya coord cae fuera del polígono del campus
    const clampedCount = withCoord.filter(t => t._clamped).length;

    // Leyenda — colores actualizados para semáforo unificado
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
      const div = L.DomUtil.create('div', 'heatmap-legend');
      div.style.cssText = 'background:white;padding:8px 12px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:Inter,sans-serif;font-size:0.78rem;';
      div.innerHTML = `
        <strong style="display:block;margin-bottom:4px;">Salud</strong>
        <div style="display:flex;align-items:center;gap:4px;margin:2px 0;"><span style="width:14px;height:14px;background:#4CAF50;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #ccc;"></span> Sano (≥70)</div>
        <div style="display:flex;align-items:center;gap:4px;margin:2px 0;"><span style="width:14px;height:14px;background:#FFA726;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #ccc;"></span> Atención (40-69)</div>
        <div style="display:flex;align-items:center;gap:4px;margin:2px 0;"><span style="width:14px;height:14px;background:#EF5350;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #ccc;"></span> Crítico (&lt;40)</div>
        <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #ccc;display:flex;align-items:center;gap:4px;font-size:0.72rem;color:#6a5d4d;">
          <span style="display:inline-block;width:12px;height:12px;border:1.5px dashed #FFB300;border-radius:50%;"></span> Coord fuera del campus${clampedCount > 0 ? ` (${clampedCount})` : ''}
        </div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:4px;font-size:0.72rem;color:#6a5d4d;">
          <span style="display:inline-block;width:14px;height:0;border-top:2px dashed #2d5016;"></span> Límite del campus
        </div>
      `;
      return div;
    };
    legend.addTo(heatmapInstance);

    const bounds = L.latLngBounds(withCoord.map(t => [t._lat, t._lng]));
    if (withCoord.length > 1) heatmapInstance.fitBounds(bounds, { padding: [40, 40] });
    setTimeout(() => heatmapInstance.invalidateSize(), 200);
    return true;
  }

  function heatmapDestroy() { if (heatmapInstance) { heatmapInstance.remove(); heatmapInstance = null; } }

  // =========================================================
  // MOSAICO DE FOTOS 3D — Three.js, 3 zonas (verde / amarillo / rojo)
  // Cada foto del catálogo se posiciona en su zona según salud.
  // =========================================================
  let mosaicoState = null;

  async function mosaicoInit(containerSel, trees) {
    if (typeof THREE === 'undefined') return false;
    const el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el) return false;
    mosaicoDestroy();
    el.style.position = 'relative';
    el.style.background = 'linear-gradient(180deg, #5fa8d8 0%, #8ecbed 45%, #c8e4f3 85%, #e8f3fb 100%)';
    el.innerHTML = '<div class="vis-loading" style="color:#1b3a5f;padding:2rem;text-align:center;font-weight:500;">Cargando anillos del bosque…</div>';

    const w = el.clientWidth || 800;
    const h = 720;  // canvas más alto → más cielo visible

    const scene = new THREE.Scene();
    // ---- Fondo cielo con degradado vertical (canvas → CubeTexture-like) ----
    scene.background = _makeSkyBackground();
    scene.fog = new THREE.Fog(0xcfe7ff, 60, 180);

    // FOV 65° + cámara cercana (z=22) → los anillos llenan ~80% del ancho.
    // Suficientemente grandes sin caer en distorsión fish-eye.
    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 300);
    camera.position.set(0, 3, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // ---- Iluminación tipo "día soleado" ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff4d6, 0.9);
    sun.position.set(8, 20, 10);
    scene.add(sun);
    // Luz de relleno cálida desde abajo (rebote del suelo imaginario)
    const fill = new THREE.DirectionalLight(0xa8d5ff, 0.3);
    fill.position.set(-5, -10, 5);
    scene.add(fill);

    // ---- Nubes decorativas flotando en el fondo ----
    const clouds = _makeFloatingClouds(scene);

    // ---- 3 ZONAS apiladas VERTICALMENTE (cada una es un anillo horizontal) ----
    //   y = altura del anillo · radio escala según # de árboles en la zona
    const ZONES = [
      { name: 'Sano',     color: 0x4CAF50, y:  6.5, filter: t => (t.health_score || 0) >= 70 },
      { name: 'Atención', color: 0xFFA726, y:  0,   filter: t => (t.health_score || 0) >= 40 && (t.health_score || 0) < 70 },
      { name: 'Crítico',  color: 0xEF5350, y: -6.5, filter: t => (t.health_score || 0) < 40 && t.health_score != null }
    ];

    // Pre-calcular el radio de cada anillo según cuántos árboles tiene
    // (más árboles = anillo más grande para que no se encimen las fotos).
    // Arco objetivo ~2.0 por foto y máximo 16 para ocupar más ancho horizontal.
    ZONES.forEach(zone => {
      const count = (trees || []).filter(zone.filter).length;
      zone.radius = Math.max(6, Math.min(count * 2.0 / (2 * Math.PI), 16));
      zone.count = count;
    });

    // ---- PEDESTAL-spotlight para cada zona ----
    // Antes el anillo (torus) estaba a la misma altura que las fotos y las
    // cruzaba como una línea horizontal molesta. Ahora el anillo va DEBAJO
    // de las fotos (zone.y - 1.4) funcionando como un "halo de spotlight"
    // del que parecen flotar las imágenes. Se ve más limpio y no las tapa.
    const RING_OFFSET_Y = -1.4;
    ZONES.forEach(zone => {
      // Disco translúcido del color del semáforo (el "spotlight")
      const discGeo = new THREE.CircleGeometry(zone.radius + 0.6, 64);
      const discMat = new THREE.MeshBasicMaterial({
        color: zone.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = zone.y + RING_OFFSET_Y + 0.02;
      scene.add(disc);

      // Anillo delgado y luminoso en el perímetro del disco
      const ringGeo = new THREE.TorusGeometry(zone.radius, 0.06, 10, 80);
      const ringMat = new THREE.MeshStandardMaterial({
        color: zone.color, emissive: zone.color, emissiveIntensity: 0.6,
        roughness: 0.4, metalness: 0.3
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = zone.y + RING_OFFSET_Y;
      scene.add(ring);

      // Etiqueta de la zona — sprite billboard flotando arriba a la izquierda
      // del anillo, con diseño tipo "pill" del color de la zona.
      const labelTex = _makeZoneLabel(zone.name, zone.count, zone.color);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex, transparent: true, depthTest: false, depthWrite: false
      });
      const label = new THREE.Sprite(labelMat);
      // Lo colocamos arriba del anillo (no rotado por el grupo, fijo en el mundo)
      label.position.set(-(zone.radius * 0.65), zone.y + 2.2, 0);
      label.scale.set(4.5, 1.6, 1);
      label.renderOrder = 999;  // siempre encima de las fotos
      scene.add(label);
    });

    // ---- Grupos rotatorios — uno por zona, gira sobre su eje Y ----
    const photoPlanes = [];
    const zoneGroups = {};
    ZONES.forEach((zone, i) => {
      const g = new THREE.Group();
      g.position.y = zone.y;  // anclado a la altura del anillo
      scene.add(g);
      zoneGroups[i] = g;
    });

    // ---- Placeholders: cada foto se posiciona en el anillo de su zona ----
    for (let zIdx = 0; zIdx < ZONES.length; zIdx++) {
      const zone = ZONES[zIdx];
      const zg = zoneGroups[zIdx];
      const treesInZone = (trees || []).filter(zone.filter);
      for (let i = 0; i < treesInZone.length; i++) {
        const tree = treesInZone[i];
        const angle = (i / Math.max(treesInZone.length, 1)) * Math.PI * 2;
        const r = zone.radius;
        const px = Math.cos(angle) * r;
        const pz = Math.sin(angle) * r;
        // Pequeño jitter vertical para que no queden todas perfectamente alineadas
        const yOffset = (Math.sin(i * 1.7) * 0.4);

        const plane = makePlaceholderPlane(tree, zone.color);
        plane.position.set(px, yOffset, pz);
        plane.userData = { tree, zoneIdx: zIdx, angle, r, y: yOffset, isPlaceholder: true };
        zg.add(plane);
        photoPlanes.push(plane);
      }
    }

    // ---- Paso 2: Cargar fotos en paralelo (sin bloquear render) ----
    (async () => {
      try {
        const treeIds = (trees || []).map(t => t.id);
        let lastMeasByTree = {};
        if (treeIds.length > 0 && typeof sb !== 'undefined') {
          const { data: meas } = await sb
            .from('tree_measurements')
            .select('tree_id, photo_url, measurement_date')
            .in('tree_id', treeIds)
            .order('measurement_date', { ascending: false });
          (meas || []).forEach(m => {
            if (!lastMeasByTree[m.tree_id] && m.photo_url) {
              lastMeasByTree[m.tree_id] = m;
            }
          });
        }

        const loader = new THREE.TextureLoader();
        loader.crossOrigin = 'anonymous';

        // -------------------------------------------------------------------
        // PASO 1 — Juntar todos los paths que requieren firmar y BATCHEAR
        // la firma en UN solo POST a Supabase. Antes hacíamos 133 POSTs (uno
        // por foto). Ahora 1 POST que firma todos a la vez con
        // createSignedUrls (plural). Después le añadimos los params de
        // transform a mano sobre la URL devuelta para pedir thumbs 400px.
        // -------------------------------------------------------------------
        const placeholders = photoPlanes.filter(p => p.userData.isPlaceholder).slice();

        // (a) Resolver paths y URLs ya completas
        const pathsToSign = [];
        const placeholdersByPath = new Map();
        for (const placeholder of placeholders) {
          const tree = placeholder.userData.tree;
          const photoUrl = lastMeasByTree[tree.id]?.photo_url || tree.photo_url;
          if (!photoUrl) continue;
          if (/^https?:\/\//.test(photoUrl)) {
            placeholder.userData.resolvedUrl = photoUrl;
            continue;
          }
          pathsToSign.push(photoUrl);
          if (!placeholdersByPath.has(photoUrl)) placeholdersByPath.set(photoUrl, []);
          placeholdersByPath.get(photoUrl).push(placeholder);
        }

        // (b) Firmar en PARALELO con transform: 400px. El batch (createSignedUrls)
        // no soporta transform en el SDK y mi truco de swap-ear el endpoint
        // ignoraba los params, dejando las fotos en 300KB c/u. La alternativa:
        // 133 POSTs pero en paralelo (con Promise.all) — el navegador los
        // multiplexa, en la práctica termina en ~500ms vs varios segundos
        // serial. Mucho menos requests totales no logramos en plan free pero
        // los GETs ya bajan a ~25KB que es el grueso del ahorro.
        if (pathsToSign.length > 0) {
          try {
            const signed = await Promise.all(pathsToSign.map(async (p) => {
              try {
                const { data } = await sb.storage
                  .from('tree-photos')
                  .createSignedUrl(p, 3600, {
                    transform: { width: 400, height: 400, resize: 'cover', quality: 70 }
                  });
                return { path: p, url: data?.signedUrl || null };
              } catch (_) { return { path: p, url: null }; }
            }));
            signed.forEach(({ path, url }) => {
              if (!url) return;
              const phs = placeholdersByPath.get(path);
              if (phs) phs.forEach(ph => { ph.userData.resolvedUrl = url; });
            });
          } catch (e) {
            console.warn('Mosaico parallel sign falló:', e);
          }
        }

        // (c) Cargar texturas en paralelo desde los URLs ya resueltos
        for (const placeholder of placeholders) {
          const url = placeholder.userData.resolvedUrl;
          if (!url) continue;
          const tree = placeholder.userData.tree;
          loader.load(url,
            (tex) => {
              const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
              const photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), mat);
              photoPlane.position.copy(placeholder.position);
              photoPlane.userData = { ...placeholder.userData, isPlaceholder: false };
              const parent = placeholder.parent;
              if (parent) {
                parent.add(photoPlane);
                parent.remove(placeholder);
              }
              const idx = photoPlanes.indexOf(placeholder);
              if (idx > -1) photoPlanes.splice(idx, 1, photoPlane);
            },
            undefined,
            (err) => console.warn('Foto no cargó:', tree.tree_code, err)
          );
        }
      } catch (e) { console.warn('Mosaico photos async error:', e); }
    })();

    // ---- DRAG MANUAL ----
    // Horizontal: rota los 3 anillos sobre su eje Y
    // Vertical:   tilta la cámara para enfocar arriba (Sano) o abajo (Crítico)
    let isDragging = false;
    let lastX = 0, lastY = 0;
    const autoSpeed = 0.0012;  // 2.5x más lento — la rotación se siente más suave
    // Estado de cámara: ángulo de pitch que vamos a interpolar
    const CAM_RADIUS = 22;  // debe coincidir con camera.position.z inicial
    let camPitch = 0;  // 0 = horizontal · negativo = mira hacia arriba (Sano)
    const PITCH_MIN = -0.55;  // ~31° hacia arriba
    const PITCH_MAX =  0.55;  // ~31° hacia abajo

    const _updateCamera = () => {
      // Mantener cámara en órbita vertical de radio CAM_RADIUS alrededor del origen
      camera.position.x = 0;
      camera.position.y = -Math.sin(camPitch) * CAM_RADIUS + 3 * Math.cos(camPitch);
      camera.position.z = Math.cos(camPitch) * CAM_RADIUS;
      camera.lookAt(0, 0, 0);
    };
    _updateCamera();

    renderer.domElement.style.cursor = 'grab';

    const _getPos = (e) => {
      const t = (e.touches && e.touches[0]) || e;
      return { x: t.clientX || 0, y: t.clientY || 0 };
    };

    const onPointerDown = (e) => {
      isDragging = true;
      const p = _getPos(e);
      lastX = p.x; lastY = p.y;
      renderer.domElement.style.cursor = 'grabbing';
    };
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const p = _getPos(e);
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      lastX = p.x; lastY = p.y;
      // Horizontal → rotación de anillos
      Object.values(zoneGroups).forEach(zg => { zg.rotation.y += dx * 0.005; });
      // Vertical → pitch de cámara (drag abajo = mira hacia abajo)
      camPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camPitch + dy * 0.004));
      _updateCamera();
    };
    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('mousedown', onPointerDown);
    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('mouseup', onPointerUp);
    renderer.domElement.addEventListener('mouseleave', onPointerUp);
    renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: true });
    renderer.domElement.addEventListener('touchmove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('touchend', onPointerUp);

    // Raycaster — click en foto → modal de acción
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let clickStartX = null;
    const onClick = (e) => {
      // Si fue un drag, no es click
      const cx = e.clientX != null ? e.clientX : 0;
      if (clickStartX != null && Math.abs(cx - clickStartX) > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(photoPlanes);
      if (hits.length > 0 && hits[0].object.userData.tree) {
        showMosaicoPhotoModal(hits[0].object.userData.tree, hits[0].object.material.map);
      }
    };
    renderer.domElement.addEventListener('mousedown', (e) => { clickStartX = e.clientX; });
    renderer.domElement.addEventListener('click', onClick);

    let animId = null;
    const onResize = () => {
      const w2 = el.clientWidth || 800;
      camera.aspect = w2 / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h);
    };
    window.addEventListener('resize', onResize);

    function animate() {
      animId = requestAnimationFrame(animate);
      // Cada anillo gira a velocidad ligeramente distinta. Diferencial bajo
      // (idx*0.15) para que el ojo no se confunda con tres velocidades muy
      // distintas pero todavía note un poco de dinamismo.
      if (!isDragging) {
        Object.entries(zoneGroups).forEach(([idx, zg]) => {
          zg.rotation.y += autoSpeed * (1 + Number(idx) * 0.15);
        });
      }
      // Nubes — movimiento más sutil aún
      if (clouds && clouds.length) {
        const t = Date.now() * 0.00002;
        clouds.forEach((c, i) => {
          c.position.x = c.userData.baseX + Math.sin(t + i) * 3;
          c.position.y = c.userData.baseY + Math.sin(t * 1.2 + i * 0.7) * 0.5;
        });
      }
      // Billboard — las fotos miran a la cámara
      photoPlanes.forEach(p => {
        p.getWorldPosition(_v0);
        p.lookAt(camera.position);
      });
      renderer.render(scene, camera);
    }
    const _v0 = new THREE.Vector3();
    animate();

    // HUD overlay con hint de uso
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:0.5rem;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.85);color:#1b3a5f;padding:0.4rem 0.9rem;border-radius:18px;font-size:0.72rem;pointer-events:none;backdrop-filter:blur(6px);font-weight:500;box-shadow:0 2px 10px rgba(0,0,0,0.1);';
    hint.innerHTML = '🖱️ Arrastra ↔ para rotar · ↕ para mirar arriba/abajo · clic en una foto para detalle';
    el.appendChild(hint);

    mosaicoState = {
      destroy: () => {
        if (animId) cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('click', onClick);
        renderer.domElement.removeEventListener('mousedown', onPointerDown);
        renderer.domElement.removeEventListener('mousemove', onPointerMove);
        renderer.domElement.removeEventListener('mouseup', onPointerUp);
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      }
    };
    return true;
  }

  // Modal cuando se hace click en una foto del carrete
  function showMosaicoPhotoModal(tree, texture) {
    let modal = document.getElementById('mosaico-photo-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'mosaico-photo-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);';

    // Convertir la textura (THREE.Texture) a data URL si es posible
    let photoSrc = null;
    try {
      if (texture && texture.image) {
        const c = document.createElement('canvas');
        c.width = texture.image.width || 300;
        c.height = texture.image.height || 300;
        c.getContext('2d').drawImage(texture.image, 0, 0);
        photoSrc = c.toDataURL('image/jpeg', 0.85);
      }
    } catch (_) {}

    const score = tree.health_score;
    const color = score >= 70 ? '#4CAF50' : score >= 40 ? '#FFA726' : score != null ? '#EF5350' : '#9e9e9e';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.45);">
        ${photoSrc ? `<img src="${photoSrc}" style="width:100%;max-height:50vh;object-fit:cover;border-radius:16px 16px 0 0;cursor:zoom-in;" onclick="window.open(this.src,'_blank')">` : ''}
        <div style="padding:1.3rem 1.4rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
            <div>
              <h3 style="margin:0;color:#1b5e20;">${(tree.common_name || tree.species || 'Árbol').replace(/[<>&"]/g, '')}</h3>
              <p style="margin:0.3rem 0 0;color:#666;font-size:0.85rem;font-style:italic;">${(tree.species || '').replace(/[<>&"]/g, '')}</p>
            </div>
            ${score != null ? `<span style="background:${color};color:#fff;padding:4px 12px;border-radius:14px;font-weight:600;font-size:0.85rem;">${score}/100</span>` : ''}
          </div>
          ${tree.tree_code ? `<div style="color:#999;font-family:ui-monospace,monospace;font-size:0.78rem;margin-top:0.4rem;">${tree.tree_code}</div>` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:1.2rem;justify-content:flex-end;">
            <button onclick="document.getElementById('mosaico-photo-modal').remove()" style="background:#f0f0f0;color:#444;border:none;padding:0.6rem 1.1rem;border-radius:10px;font-weight:500;cursor:pointer;">Cerrar</button>
            ${photoSrc ? `<button onclick="window.open('${photoSrc}','_blank')" style="background:#1976D2;color:#fff;border:none;padding:0.6rem 1.1rem;border-radius:10px;font-weight:600;cursor:pointer;"><i class="fas fa-expand"></i> Ver foto completa</button>` : ''}
            <button onclick="if(typeof editAdminTree==='function'){editAdminTree(${parseInt(tree.id, 10) || `'${tree.id}'`});document.getElementById('mosaico-photo-modal').remove();}" style="background:#2E7D32;color:#fff;border:none;padding:0.6rem 1.1rem;border-radius:10px;font-weight:600;cursor:pointer;">Ver detalle</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }
  window.showMosaicoPhotoModal = showMosaicoPhotoModal;

  function makeLabelTexture(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    // Fondo redondeado semi-transparente para que sea legible sobre el cielo
    ctx.fillStyle = 'rgba(27, 58, 95, 0.78)';
    _roundRect(ctx, 16, 24, 480, 80, 16);
    ctx.fill();
    ctx.font = 'bold 50px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(c);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Etiqueta de zona: "pill" del color del semáforo + count ----
  function _makeZoneLabel(name, count, hexColor) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 256;
    const ctx = c.getContext('2d');

    const colorStr = '#' + hexColor.toString(16).padStart(6, '0');
    const PAD = 24;
    const W = c.width - PAD * 2;
    const H = c.height - PAD * 2;

    // Sombra suave
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // Pill blanco con borde de color
    ctx.fillStyle = '#ffffff';
    _roundRect(ctx, PAD, PAD, W, H, 80);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Banda lateral izquierda con color del semáforo
    ctx.fillStyle = colorStr;
    _roundRect(ctx, PAD, PAD, 70, H, 80);
    ctx.fill();
    // Tapa el lado derecho del pill para que solo quede de un lado
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(PAD + 50, PAD + 10, 25, H - 20);

    // Punto del color (semáforo) dentro de la banda
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(PAD + 35, PAD + H / 2, 18, 0, Math.PI * 2);
    ctx.fill();

    // Texto del nombre
    ctx.fillStyle = '#1b3a5f';
    ctx.font = 'bold 78px -apple-system, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, PAD + 110, PAD + H / 2 - 6);

    // Conteo en pill chiquito al final
    const countText = String(count);
    ctx.font = '600 56px -apple-system, sans-serif';
    const countW = ctx.measureText(countText).width;
    const badgeW = countW + 50;
    const badgeX = c.width - PAD - badgeW - 20;
    const badgeY = PAD + H / 2 - 36;
    ctx.fillStyle = colorStr;
    _roundRect(ctx, badgeX, badgeY, badgeW, 72, 36);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(countText, badgeX + badgeW / 2, badgeY + 36 + 2);

    return new THREE.CanvasTexture(c);
  }

  // ---- Fondo cielo (degradado vertical) renderizado en canvas ----
  // Azul cielo arriba → azul claro abajo, con sutil viñeta. Se usa como
  // CanvasTexture para scene.background (cubre todo el viewport).
  function _makeSkyBackground() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#5fa8d8');   // cielo arriba
    grad.addColorStop(0.45, '#8ecbed'); // cielo medio
    grad.addColorStop(0.85, '#c8e4f3'); // horizonte clarito
    grad.addColorStop(1, '#e8f3fb');   // suelo nebuloso
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 512);
    return new THREE.CanvasTexture(c);
  }

  // ---- Sprites de nubes flotantes ----
  // Genera ~6 nubes blancas que se mueven lentamente en el fondo.
  // Retorna el array para que la función animate las anime.
  function _makeFloatingClouds(scene) {
    const arr = [];
    const cloudTex = _makeCloudTexture();
    const positions = [
      { x: -16, y: 12, z: -25, scale: 8 },
      { x:  18, y: 14, z: -22, scale: 7 },
      { x:  -8, y:  6, z: -30, scale: 9 },
      { x:  12, y: -2, z: -28, scale: 6 },
      { x: -20, y: -8, z: -26, scale: 7 },
      { x:  16, y:-12, z: -24, scale: 8 }
    ];
    positions.forEach(p => {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false
      });
      const s = new THREE.Sprite(mat);
      s.position.set(p.x, p.y, p.z);
      s.scale.set(p.scale, p.scale * 0.55, 1);
      s.userData.baseX = p.x;
      s.userData.baseY = p.y;
      scene.add(s);
      arr.push(s);
    });
    return arr;
  }

  function _makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    // Varios círculos blandos solapados para parecer nube
    const blobs = [
      {x: 80, y: 80, r: 38}, {x: 130, y: 70, r: 46},
      {x: 175, y: 75, r: 38}, {x: 110, y: 95, r: 32},
      {x: 155, y: 95, r: 30}, {x: 195, y: 90, r: 28},
      {x: 60, y: 90, r: 25}
    ];
    blobs.forEach(b => {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
    return new THREE.CanvasTexture(c);
  }

  function makePlaceholderPlane(tree, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    // Marco color zona
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,253,247,0.95)';
    ctx.fillRect(8, 8, 240, 240);
    // Emoji
    ctx.font = '90px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌳', 128, 110);
    // Code
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillStyle = '#2d2418';
    ctx.fillText(tree.tree_code || '-', 128, 165);
    // Common name
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#6a5d4d';
    ctx.fillText((tree.common_name || tree.species || '').slice(0, 22), 128, 190);
    // Salud
    ctx.font = 'bold 26px -apple-system, sans-serif';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText((tree.health_score || 0) + '%', 128, 230);
    const tex = new THREE.CanvasTexture(c);
    const planeGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(planeGeo, planeMat);
  }

  function mosaicoDestroy() { if (mosaicoState) { mosaicoState.destroy(); mosaicoState = null; } }

  // =========================================================
  // EXPORT
  // =========================================================
  window.DashboardMapa = { init: mapaInit, destroy: mapaDestroy };
  window.DashboardHeatmap = { init: heatmapInit, destroy: heatmapDestroy };
  window.DashboardMosaico = { init: mosaicoInit, destroy: mosaicoDestroy };
})();
