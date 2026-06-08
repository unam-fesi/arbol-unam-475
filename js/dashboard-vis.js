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
    // Tiles OSM con crossOrigin para que html2canvas pueda exportarlos a PDF
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19, crossOrigin: 'anonymous'
    }).addTo(mapaInstance);

    // Helper: ¿puede este user editar la ubicación de este árbol?
    //  • admin → cualquier árbol
    //  • admin-campus / responsable → solo árboles de su mismo campus
    //  • rectoria/specialist/user → no edita (read-only)
    function canEditTreeLocation(t) {
      if (typeof currentUserProfile === 'undefined' || !currentUserProfile) return false;
      const role = String(currentUserProfile.role || '').toLowerCase();
      if (role === 'admin') return true;
      if (role === 'admin-campus' || role === 'responsable') {
        return (t.campus || '') === (currentUserProfile.campus || '');
      }
      return false;
    }

    // Inyectar CSS para cursor "grab" en markers draggable (una sola vez)
    if (!document.getElementById('mapa-drag-styles')) {
      const s = document.createElement('style');
      s.id = 'mapa-drag-styles';
      s.textContent = `
        .mapa-tree-marker.editable > div { cursor: grab; box-shadow: 0 4px 14px rgba(46,125,50,0.55) !important; }
        .mapa-tree-marker.editable.leaflet-marker-draggable:active > div { cursor: grabbing; }
      `;
      document.head.appendChild(s);
    }

    // Helper: extraer número corto del tree_code (FESI 12 FRESNO → "12")
    // Solo se usa al EXPORTAR PDF, NO en el mapa interactivo
    function shortLabel(code) {
      if (!code) return '·';
      const m = String(code).match(/^FES\w*\s*(\d+)/i);
      if (m) return m[1].padStart(2, '0');
      return String(code).slice(0, 3);
    }

    // Markers — div icons coloreados por salud, mismo estilo de siempre
    treesWithCoord.forEach(t => {
      const color = colorByHealthHex(t.health_score);
      const size = 28;
      const editable = canEditTreeLocation(t);
      const icon = L.divIcon({
        className: 'mapa-tree-marker' + (editable ? ' editable' : ''),
        // data-* para que el exportador filtre solo 475 (FESI*) y ponga el número
        html: `<div data-tree-num="${shortLabel(t.tree_code)}" data-is-fesi="${/^FES/i.test(t.tree_code || '') ? '1' : '0'}" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
                   border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);
                   display:flex;align-items:center;justify-content:center;color:white;
                   font-size:14px;font-weight:bold;">🌳</div>`,
        iconSize: [size, size], iconAnchor: [size/2, size/2]
      });
      const marker = L.marker([t.location_lat, t.location_lng], {
        icon,
        draggable: editable,
        title: editable ? 'Arrastra para reubicar este árbol' : (t.tree_code || ''),
      }).addTo(mapaInstance);

      const hint = editable
        ? `<div style="font-size:0.72rem;color:#2d5016;margin-top:6px;font-style:italic;">✋ Arrástralo para corregir su ubicación</div>`
        : '';
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
          ${hint}
        </div>
      `);

      // Drag → confirmar → UPDATE
      if (editable) {
        marker.on('dragend', async (e) => {
          const ll = e.target.getLatLng();
          const oldLat = t.location_lat, oldLng = t.location_lng;
          const lblCode = t.tree_code || `árbol #${t.id}`;
          const ok = window.confirm(
            `¿Mover ${lblCode} a la nueva ubicación?\n\n` +
            `De: ${oldLat.toFixed(6)}, ${oldLng.toFixed(6)}\n` +
            `A:  ${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`
          );
          if (!ok) {
            marker.setLatLng([oldLat, oldLng]);
            return;
          }
          try {
            const { error } = await sb.from('trees_catalog')
              .update({ location_lat: ll.lat, location_lng: ll.lng, updated_at: new Date().toISOString() })
              .eq('id', t.id);
            if (error) throw error;
            // Actualizar referencia in-place para que próximos render usen la nueva coord
            t.location_lat = ll.lat;
            t.location_lng = ll.lng;
            if (typeof showToast === 'function') {
              showToast(`✅ ${lblCode} reubicado`, 'success', 2800);
            }
          } catch (err) {
            console.warn('[mapa] update location failed:', err);
            marker.setLatLng([oldLat, oldLng]);
            if (typeof showToast === 'function') {
              showToast(`No se pudo guardar: ${err.message || err}`, 'error', 4000);
            }
          }
        });
      }
    });

    // Fit bounds
    const bounds = L.latLngBounds(treesWithCoord.map(t => [t.location_lat, t.location_lng]));
    if (treesWithCoord.length > 1) mapaInstance.fitBounds(bounds, { padding: [40, 40] });

    setTimeout(() => mapaInstance.invalidateSize(), 200);

    // ──────────────────────────────────────────────────────────────────────
    // Botón "📄 Descargar PDF" — solo en el momento del export:
    //   1) reemplaza el 🌳 de cada marker por su número (data-tree-num)
    //   2) html2canvas captura el mapa
    //   3) restaura el 🌳 original (sin alterar lo que ve el user)
    //   4) envuelve la imagen en un PDF con jsPDF y la descarga
    // ──────────────────────────────────────────────────────────────────────
    const DownloadCtrl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        btn.innerHTML = '<a href="#" title="Descargar mapa como PDF con números visibles" ' +
          'style="background:white;color:#1a4480;width:auto;padding:0 12px;height:30px;' +
          'line-height:30px;font-size:13px;font-weight:600;display:flex;align-items:center;' +
          'gap:6px;text-decoration:none;">📄 Descargar PDF</a>';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = async (e) => {
          e.preventDefault();
          if (typeof html2canvas !== 'function') {
            if (typeof showToast === 'function') showToast('html2canvas no cargado, espera 2 s', 'warning');
            return;
          }
          const jspdfLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
          if (typeof jspdfLib !== 'function') {
            if (typeof showToast === 'function') showToast('jsPDF no cargado, espera 2 s', 'warning');
            return;
          }
          if (typeof showToast === 'function') showToast('Generando PDF (8-10 s)…', 'info', 10000);

          // Mapa temporal a 3200×2000 (más píxeles → markers proporcionalmente
          // más chicos sobre el área real, menos amontonamiento)
          const tmpEl = document.createElement('div');
          tmpEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:3200px;height:2000px;background:#FAFAF7;';
          document.body.appendChild(tmpEl);
          let tmpMap = null;

          try {
            // 1) Crear mapa temporal
            tmpMap = L.map(tmpEl, { zoomControl: false, attributionControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19, crossOrigin: 'anonymous'
            }).addTo(tmpMap);

            // 2) Markers FESI*: tamaño 26px (sobre canvas 3200x2000 = ratio
            // similar a 16px sobre 2400x1500, pero con más detalle)
            const fesi = treesWithCoord.filter(t => /^FES/i.test(t.tree_code || ''));
            fesi.forEach(t => {
              const color = colorByHealthHex(t.health_score);
              const num = shortLabel(t.tree_code);
              const fs = num.length <= 2 ? 11 : (num.length === 3 ? 9 : 7);
              const isRector = /AHUEHUETE/i.test(t.tree_code || '') && /00/.test(t.tree_code || '');
              const size = isRector ? 36 : 26;
              const bg = isRector ? '#C62828' : color;
              const border = isRector ? '3px solid #FFC107' : '2.5px solid white';
              const icon = L.divIcon({
                className: 'pdf-marker',
                html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};
                       border:${border};box-shadow:0 2px 5px rgba(0,0,0,0.5);
                       display:flex;align-items:center;justify-content:center;color:white;
                       font-size:${fs}px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,0.85);
                       font-family:-apple-system,sans-serif;letter-spacing:-0.3px;">${num}</div>`,
                iconSize: [size, size], iconAnchor: [size/2, size/2]
              });
              L.marker([t.location_lat, t.location_lng], { icon }).addTo(tmpMap);
            });

            // 3) Fit bounds a los FESI* con padding generoso (más zoom)
            const bounds = L.latLngBounds(fesi.map(t => [t.location_lat, t.location_lng]));
            tmpMap.fitBounds(bounds, { padding: [100, 100], maxZoom: 19 });
            tmpMap.invalidateSize();

            // 4) Esperar a que TODAS las tiles del viewport carguen
            // (más fiable que un sleep fijo)
            await new Promise(resolve => {
              let pending = 0, settled = false;
              const tiles = tmpEl.querySelectorAll('img.leaflet-tile');
              if (!tiles.length) { setTimeout(resolve, 4000); return; }
              tiles.forEach(img => {
                if (img.complete) return;
                pending++;
                img.addEventListener('load', () => { if (--pending <= 0 && !settled) { settled = true; resolve(); } });
                img.addEventListener('error', () => { if (--pending <= 0 && !settled) { settled = true; resolve(); } });
              });
              if (pending === 0) resolve();
              // Hard cap: máximo 7 segundos
              setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 7000);
            });
            await new Promise(r => setTimeout(r, 500));  // small grace period

            // 5) Captura nativa (sin escala extra, ya estamos a 3200x2000)
            const canvas = await html2canvas(tmpEl, {
              useCORS: true, allowTaint: true, backgroundColor: '#FAFAF7',
              logging: false, scale: 1, width: 3200, height: 2000,
            });

            // 6) PDF A3 landscape
            const pdf = new jspdfLib({ orientation: 'landscape', unit: 'mm', format: 'a3' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 8;
            // Título + atribución
            pdf.setFontSize(14); pdf.setTextColor(26, 68, 128);
            pdf.text('FES IZTACALA — UNAM · Proyecto Árbol 475', margin, 12);
            pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
            pdf.text('Mapa de árboles FESI* · © OpenStreetMap contributors', margin, 17);
            // Imagen
            const availW = pageW - margin * 2;
            const availH = pageH - 25 - margin;
            const ratio = Math.min(availW / canvas.width, availH / canvas.height);
            const imgW = canvas.width * ratio, imgH = canvas.height * ratio;
            const x = (pageW - imgW) / 2, y = 22;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, imgW, imgH);
            const stamp = new Date().toISOString().slice(0, 10);
            pdf.save(`mapa-iztacala-${stamp}.pdf`);
            if (typeof showToast === 'function') showToast('✅ PDF descargado', 'success', 2800);
          } catch (err) {
            console.warn('[mapa] export PDF failed:', err);
            if (typeof showToast === 'function') showToast('Error al exportar: ' + (err.message || err), 'error', 4500);
          } finally {
            // Cleanup garantizado del mapa temporal
            try { if (tmpMap) tmpMap.remove(); } catch (_) {}
            try { tmpEl.remove(); } catch (_) {}
          }
        };
        return btn;
      }
    });
    new DownloadCtrl().addTo(mapaInstance);

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

    // FOV 65° + cámara más cerca para que las fotos no se vean diminutas
    // (antes z=75 → muy lejos). Las 3 zonas están en y=+30 / 0 / -30,
    // así que con z≈45 entran cómodamente con el FOV de 65°.
    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 700);
    camera.position.set(0, 1, 45);
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
    // Separación AMPLIA (±45) para que los sub-anillos de Sano no invadan
    // la banda de Atención (antes ±30 → se mezclaban verdes con amarillos
    // cuando Sano tenía muchos sub-anillos).
    const ZONES = [
      { name: 'Sano',     color: 0x4CAF50, y:  45, filter: t => (t.health_score || 0) >= 70 },
      { name: 'Atención', color: 0xFFA726, y:   0, filter: t => (t.health_score || 0) >= 40 && (t.health_score || 0) < 70 },
      { name: 'Crítico',  color: 0xEF5350, y: -45, filter: t => (t.health_score || 0) < 40 && t.health_score != null }
    ];

    // Cuántas fotos caben cómodamente en un anillo y cuánto separar los
    // sub-anillos verticalmente. Con más PHOTOS_PER_RING hay menos sub-anillos
    // (cilindro más bajo, no se mezclan zonas). El radio crece proporcional.
    const PHOTOS_PER_RING = 80;     // antes 50 — más fotos por anillo
    // Gap > altura máxima de foto (foto 2.0 alto × scale 1.6 = 3.2).
    // Con 5.0 hay 1.8 unidades de aire entre fotos de sub-anillos adyacentes.
    const SUB_RING_GAP = 5.0;       // antes 6.0 — sub-anillos más compactos
    const TARGET_ARC = 2.0;         // arco-unidad por foto (radio ≈ 25.5)

    ZONES.forEach(zone => {
      const count = (trees || []).filter(zone.filter).length;
      zone.count = count;
      // Radio fijo para todos los sub-anillos de la zona (uniforme)
      // Se calcula para que 50 fotos quepan con buen espaciado.
      zone.radius = PHOTOS_PER_RING * TARGET_ARC / (2 * Math.PI);  // ≈ 16
      zone.numSubRings = Math.max(1, Math.ceil(count / PHOTOS_PER_RING));
    });

    // ---- PEDESTAL-spotlight para cada zona ----
    // El anillo va DEBAJO del sub-anillo de fotos MÁS BAJO de la zona,
    // no en el centro. Así funciona como un "pedestal" del que emergen
    // las fotos hacia arriba, sin cruzar entre los sub-anillos.
    const RING_OFFSET_BELOW = 1.4;  // unidades debajo del sub-anillo más bajo
    ZONES.forEach(zone => {
      // Y del sub-anillo más bajo dentro de esta zona
      const totalSpread = (zone.numSubRings - 1) * SUB_RING_GAP;
      const lowestSubRingY = zone.y - totalSpread / 2;
      const ringY = lowestSubRingY - RING_OFFSET_BELOW;

      // Disco translúcido del color del semáforo (el "spotlight")
      const discGeo = new THREE.CircleGeometry(zone.radius + 0.6, 64);
      const discMat = new THREE.MeshBasicMaterial({
        color: zone.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = ringY + 0.02;
      scene.add(disc);

      // Anillo delgado y luminoso en el perímetro del disco
      const ringGeo = new THREE.TorusGeometry(zone.radius, 0.06, 10, 80);
      const ringMat = new THREE.MeshStandardMaterial({
        color: zone.color, emissive: zone.color, emissiveIntensity: 0.6,
        roughness: 0.4, metalness: 0.3
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ringY;
      scene.add(ring);

      // Etiqueta flotando ARRIBA del stack de sub-anillos. Solo texto, sin
      // fondo, en el color del semáforo, con stroke oscuro para legibilidad
      // sobre el cielo. Posición justo encima del sub-anillo más alto.
      // (totalSpread ya está declarado arriba en este mismo forEach)
      const labelTex = _makeZoneLabel(zone.name, zone.count, zone.color);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex, transparent: true, depthTest: false, depthWrite: false
      });
      const label = new THREE.Sprite(labelMat);
      // Centrado horizontalmente, justo encima del top de la pila de sub-anillos
      label.position.set(0, zone.y + totalSpread / 2 + 2.2, 0);
      label.scale.set(11, 2.8, 1);  // más grande, abarca proporciones del texto
      label.renderOrder = 999;
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

    // ---- Placeholders: cada foto va en uno de los sub-anillos de su zona ----
    // Las fotos se reparten en sub-anillos de máx PHOTOS_PER_RING, apilados
    // verticalmente dentro de la banda de la zona. Así Sano con 249 fotos
    // queda como 5 anillos de ~50 c/u en lugar de 249 amontonadas en uno.
    for (let zIdx = 0; zIdx < ZONES.length; zIdx++) {
      const zone = ZONES[zIdx];
      const zg = zoneGroups[zIdx];
      const treesInZone = (trees || []).filter(zone.filter);
      const numSub = zone.numSubRings;
      const totalSpread = (numSub - 1) * SUB_RING_GAP;

      for (let i = 0; i < treesInZone.length; i++) {
        const tree = treesInZone[i];
        const subRingIdx = Math.floor(i / PHOTOS_PER_RING);
        const posInSubRing = i % PHOTOS_PER_RING;
        // Cuántas fotos hay realmente en este sub-anillo (el último puede tener menos)
        const inThisRing = Math.min(
          PHOTOS_PER_RING,
          treesInZone.length - subRingIdx * PHOTOS_PER_RING
        );
        // Offset angular pequeño por sub-anillo para que no queden
        // todos los sub-anillos exactamente alineados (visual más interesante)
        const angle = (posInSubRing / inThisRing) * Math.PI * 2
          + (subRingIdx * 0.18);
        const r = zone.radius;
        const px = Math.cos(angle) * r;
        const pz = Math.sin(angle) * r;
        // Y dentro del grupo: centrar verticalmente la pila de sub-anillos
        const subY = subRingIdx * SUB_RING_GAP - totalSpread / 2;

        const plane = makePlaceholderPlane(tree, zone.color);
        plane.position.set(px, subY, pz);
        plane.userData = {
          tree, zoneIdx: zIdx, subRingIdx, angle, r, y: subY, isPlaceholder: true
        };
        zg.add(plane);
        photoPlanes.push(plane);
      }
    }

    // ---- Paso 2: Cargar fotos en paralelo (sin bloquear render) ----
    (async () => {
      try {
        const treeIds = (trees || []).map(t => t.id);
        // Para cada árbol, buscar la foto MÁS RECIENTE disponible.
        // Orden de prioridad:
        //   1) Seguimiento más reciente con foto (sea cual sea: primer seguimiento o último)
        //   2) Fallback: foto del alta del árbol (tree.photo_url)
        let lastMeasByTree = {};
        if (treeIds.length > 0 && typeof sb !== 'undefined') {
          const { data: meas } = await sb
            .from('tree_measurements')
            .select('tree_id, photo_url, measurement_date')
            .in('tree_id', treeIds)
            .not('photo_url', 'is', null)   // ← filtro server-side: solo seguimientos CON foto
            .neq('photo_url', '')           // ← rechazar string vacío también
            .order('measurement_date', { ascending: false });
          (meas || []).forEach(m => {
            // Primer match por tree_id = el más reciente (ya ordenamos DESC)
            if (!lastMeasByTree[m.tree_id]) {
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
          const lastMeas = lastMeasByTree[tree.id];
          const photoUrl = lastMeas?.photo_url || tree.photo_url;
          if (!photoUrl) continue;
          // Guardar el path ORIGINAL en userData para que el modal de detalle
          // pueda pedir la versión full-res (no el thumb que se ve en el carrusel)
          placeholder.userData.photoPath = photoUrl;
          // Origen + fecha para que el modal pueda mostrar contexto al usuario.
          if (lastMeas) {
            placeholder.userData.photoSource = 'seguimiento';
            placeholder.userData.photoDate = lastMeas.measurement_date;
          } else {
            placeholder.userData.photoSource = 'alta';
            placeholder.userData.photoDate = null;
          }
          if (/^https?:\/\//.test(photoUrl)) {
            placeholder.userData.resolvedUrl = photoUrl;
            continue;
          }
          pathsToSign.push(photoUrl);
          if (!placeholdersByPath.has(photoUrl)) placeholdersByPath.set(photoUrl, []);
          placeholdersByPath.get(photoUrl).push(placeholder);
        }

        // (b) Firmar URLs apuntando al thumbnail pre-generado.
        //   path original:  "424/123.jpg"
        //   thumbnail:      "424/123_thumb.jpg"
        // NOTA: usamos createSignedUrl (SINGULAR) en paralelo en lugar de
        // createSignedUrls (plural/batch) porque el endpoint batch del SDK 2.38
        // devuelve "schema is invalid or incompatible" en algunos proyectos.
        // El singular es estable. Para 100 fotos hace 100 requests pero
        // Promise.all los lanza en paralelo — sigue siendo rápido.
        if (pathsToSign.length > 0) {
          // Mapeo path original → path thumb
          const thumbPaths = pathsToSign.map(p =>
            (typeof thumbPathFor === 'function') ? thumbPathFor(p) : p
          );
          // Intentar firmar el THUMB primero (más rápido de cargar)
          const thumbResults = await Promise.all(
            thumbPaths.map(async (thumbPath) => {
              try {
                const { data, error } = await sb.storage
                  .from('tree-photos')
                  .createSignedUrl(thumbPath, 3600);
                if (error || !data?.signedUrl) return null;
                return { path: thumbPath, signedUrl: data.signedUrl };
              } catch (_) { return null; }
            })
          );
          // Para cada path original: usar el thumb si se firmó, si no firmar original
          await Promise.all(pathsToSign.map(async (orig, i) => {
            let signedUrl = thumbResults[i]?.signedUrl;
            if (!signedUrl) {
              // Fallback al original (foto vieja sin thumb pre-generado)
              try {
                const { data, error } = await sb.storage
                  .from('tree-photos')
                  .createSignedUrl(orig, 3600);
                if (!error && data?.signedUrl) signedUrl = data.signedUrl;
              } catch (_) {}
            }
            if (!signedUrl) return;
            const phs = placeholdersByPath.get(orig);
            if (phs) phs.forEach(ph => { ph.userData.resolvedUrl = signedUrl; });
          }));
        }

        // (c) Cargar texturas en paralelo desde los URLs ya resueltos
        for (const placeholder of placeholders) {
          const url = placeholder.userData.resolvedUrl;
          if (!url) continue;
          const tree = placeholder.userData.tree;
          loader.load(url,
            (tex) => {
              // OPACO (sin transparent). Si dejamos transparent:true el
              // renderer tiene que ordenar TODAS las fotos por profundidad
              // cada frame, y con planos billboard rotando los ordena mal.
              const mat = new THREE.MeshBasicMaterial({
                map: tex, side: THREE.DoubleSide
              });
              // Aspecto del plano segun la foto: si es landscape (típicamente
              // 4:3) usa 2.0x1.5; si es portrait (típicamente 3:4) usa 1.5x2.0.
              // Las texturas del celular vienen en ambos formatos.
              const imgW = tex.image?.width || 1;
              const imgH = tex.image?.height || 1;
              const isPortrait = imgH > imgW;
              const planeGeo = isPortrait
                ? new THREE.PlaneGeometry(1.5, 2.0)
                : new THREE.PlaneGeometry(2.0, 1.5);
              const photoPlane = new THREE.Mesh(planeGeo, mat);
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
    const autoSpeed = 0.0006;  // mitad de v39 — rotación muy contemplativa
    // Estado de cámara: pitch (vertical) + radio (zoom).
    // El zoom mueve la cámara más cerca/lejos del centro de los anillos.
    let camRadius = 60;            // valor inicial — más lejos: zona 45m+sub-anillos ocupa más altura
    const CAM_RADIUS_MIN = 14;     // zoom in tope más cercano — fotos llenan pantalla
    const CAM_RADIUS_MAX = 200;    // zoom out tope más amplio — vista panorámica completa
    let camPitch = 0;  // 0 = horizontal · negativo = mira hacia arriba (Sano)
    const PITCH_MIN = -1.20;       // ~69° hacia arriba (antes 31°) — ver bien la zona Sano
    const PITCH_MAX =  1.20;       // ~69° hacia abajo (antes 31°) — ver bien la zona Crítico

    const _updateCamera = () => {
      // Cámara en órbita vertical (pitch) y radial (zoom)
      // Bajamos el offset Y de 3 a 1 para que con escena más alta (zonas a
      // ±11 y sub-anillos arriba/abajo) la vista quede más balanceada.
      camera.position.x = 0;
      camera.position.y = -Math.sin(camPitch) * camRadius + 1 * Math.cos(camPitch);
      camera.position.z = Math.cos(camPitch) * camRadius;
      camera.lookAt(0, 0, 0);
    };
    _updateCamera();

    // ---- ZOOM con rueda del mouse / pinch en touch ----
    const onWheel = (e) => {
      e.preventDefault();
      // deltaY positivo = scroll abajo = zoom out
      const dir = e.deltaY > 0 ? 1 : -1;
      camRadius = Math.max(CAM_RADIUS_MIN, Math.min(CAM_RADIUS_MAX, camRadius + dir * 1.5));
      _updateCamera();
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Pinch-to-zoom para touch (dos dedos)
    let pinchStartDist = 0, pinchStartRadius = 22;
    const _pinchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = _pinchDist(e.touches);
        pinchStartRadius = camRadius;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        const d = _pinchDist(e.touches);
        const factor = pinchStartDist / d;  // dedos más juntos = factor alto = zoom out
        camRadius = Math.max(CAM_RADIUS_MIN, Math.min(CAM_RADIUS_MAX, pinchStartRadius * factor));
        _updateCamera();
      }
    }, { passive: true });

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
        const hit = hits[0].object;
        showMosaicoPhotoModal(
          hit.userData.tree,
          hit.material.map,
          hit.userData.photoPath,         // path original — para cargar full-res
          hit.userData.photoSource,       // 'seguimiento' | 'alta'
          hit.userData.photoDate          // measurement_date si vino de seguimiento
        );
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
      // Billboard + COVER FLOW:
      // Cuando hay muchas fotos por anillo (e.g. 249 en Sano), todas
      // quedan apretujadas en el frente. Para no ver un puré:
      //   • La(s) foto(s) al frente del aro (más cerca de cámara): escala 1.5
      //   • Las laterales: bajan a ~0.6
      //   • Las del back (lejos de cámara): casi desaparecen (escala 0.15)
      // Como el grupo del anillo rota, el "frente" cambia: el usuario ve
      // diferentes fotos grandes según cómo gire el aro.
      photoPlanes.forEach(p => {
        p.getWorldPosition(_v0);
        p.lookAt(camera.position);
        // Vector horizontal desde origen (eje del anillo) hacia la foto
        const dx = _v0.x, dz = _v0.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.01) return;
        // cosAngle = +1 cuando la foto está directamente entre el origen
        // y la cámara (frente); -1 cuando está en el lado opuesto (back).
        // Como la cámara está en (cx, cy, cz) con cx≈0, simplemente
        // comparamos dz contra distancia: dz/dist = cos del ángulo
        // entre el vector foto y el vector cámara en XZ.
        const camDirZ = camera.position.z;
        const cosFront = (camDirZ > 0 ? dz : -dz) / dist;
        // t en [0,1]: 0 = back, 1 = front
        const t = (cosFront + 1) / 2;
        // Curva con exponente: el back colapsa rápido (escala 0.05),
        // el front llega a 1.6x (no 2.0) para que no se enciman las fotos
        // de sub-anillos adyacentes (foto 2.0×1.6 = 3.2 unidades vs gap 6.0).
        const eased = Math.pow(t, 3);  // ease-in cúbico
        const scale = 0.05 + (1.6 - 0.05) * eased;
        p.scale.setScalar(scale);
        // El plano del back queda detrás de TODO mediante depthWrite/order
        p.renderOrder = Math.round(t * 1000);
        p.visible = scale > 0.08;  // ocultar las casi-invisibles para ganar perf
      });
      renderer.render(scene, camera);
    }
    const _v0 = new THREE.Vector3();
    animate();

    // HUD overlay con hint de uso
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:0.5rem;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.85);color:#1b3a5f;padding:0.4rem 0.9rem;border-radius:18px;font-size:0.72rem;pointer-events:none;backdrop-filter:blur(6px);font-weight:500;box-shadow:0 2px 10px rgba(0,0,0,0.1);';
    hint.innerHTML = '🖱️ Arrastra ↔ rota · ↕ tilta · rueda hace zoom · clic en foto = detalle';
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

  // Modal cuando se hace click en una foto del carrete.
  // texture: THREE.Texture del carrusel (thumb 400px — preview instantáneo)
  // photoPath: path original en Storage (ej. "424/123.jpg") — para cargar full-res
  function showMosaicoPhotoModal(tree, texture, photoPath, photoSource, photoDate) {
    let modal = document.getElementById('mosaico-photo-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'mosaico-photo-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);';

    // PREVIEW INSTANTÁNEO: convertir textura del carrusel (thumb) a data URL
    // para mostrar algo de inmediato. Luego en background se carga la
    // imagen ORIGINAL en alta resolución y se reemplaza.
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
        ${photoSrc ? `<img id="mosaico-modal-img" src="${photoSrc}" style="width:100%;max-height:50vh;object-fit:cover;border-radius:16px 16px 0 0;cursor:zoom-in;transition:filter 0.3s;filter:blur(2px);" onclick="window.open(this.src,'_blank')">` : ''}
        <div style="padding:1.3rem 1.4rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
            <div>
              <h3 style="margin:0;color:#1b5e20;">${(tree.common_name || tree.species || 'Árbol').replace(/[<>&"]/g, '')}</h3>
              <p style="margin:0.3rem 0 0;color:#666;font-size:0.85rem;font-style:italic;">${(tree.species || '').replace(/[<>&"]/g, '')}</p>
            </div>
            ${score != null ? `<span style="background:${color};color:#fff;padding:4px 12px;border-radius:14px;font-weight:600;font-size:0.85rem;">${score}/100</span>` : ''}
          </div>
          ${tree.tree_code ? `<div style="color:#999;font-family:ui-monospace,monospace;font-size:0.78rem;margin-top:0.4rem;">${tree.tree_code}</div>` : ''}
          ${(() => {
            // Badge informativo: de dónde viene esta foto
            if (photoSource === 'seguimiento' && photoDate) {
              const d = new Date(photoDate);
              const fmt = isNaN(d) ? photoDate : d.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
              return `<div style="margin-top:0.7rem;padding:6px 10px;background:rgba(46,125,50,0.08);border-left:3px solid #2E7D32;border-radius:6px;font-size:0.78rem;color:#2E7D32;"><i class="fas fa-camera"></i> Foto del seguimiento del ${fmt}</div>`;
            } else if (photoSource === 'alta') {
              return `<div style="margin-top:0.7rem;padding:6px 10px;background:rgba(123,79,33,0.08);border-left:3px solid #8B6F47;border-radius:6px;font-size:0.78rem;color:#8B6F47;"><i class="fas fa-seedling"></i> Foto del alta inicial — aún sin seguimientos con foto</div>`;
            }
            return '';
          })()}
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

    // Cargar la versión ORIGINAL (full-res) en background y reemplazar el src.
    // Mientras tanto el usuario ve el thumb del carrusel con un blur ligero
    // que indica "esto se está cargando en alta calidad".
    if (photoPath && typeof getThumbUrl === 'function') {
      getThumbUrl('tree-photos', photoPath, { thumb: false }).then(fullUrl => {
        if (!fullUrl) return;
        const img = document.getElementById('mosaico-modal-img');
        if (!img) return;
        // Pre-cargar para evitar flash
        const tmp = new Image();
        tmp.onload = () => {
          img.src = fullUrl;
          img.style.filter = 'none';
          // Cambiar el botón "Ver foto completa" al URL de alta resolución
          const btn = modal.querySelector('button[onclick*="window.open"]');
          if (btn) btn.setAttribute('onclick', `window.open('${safeJsAttr(fullUrl)}','_blank')`);
        };
        tmp.onerror = () => { img.style.filter = 'none'; };
        tmp.src = fullUrl;
      }).catch(() => {
        const img = document.getElementById('mosaico-modal-img');
        if (img) img.style.filter = 'none';
      });
    } else {
      // Sin photoPath, quitar el blur (no podemos cargar full)
      const img = document.getElementById('mosaico-modal-img');
      if (img) img.style.filter = 'none';
    }
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

  // ---- Etiqueta de zona: SOLO TEXTO sin fondo, en color del semáforo ----
  // Diseño "palabras flotando" sobre el cielo:
  //   • Nombre grande en el color del estado (verde/ámbar/rojo)
  //   • Conteo más pequeño debajo en el mismo color
  //   • Stroke oscuro semi-translúcido para que se lea sobre cielo claro
  function _makeZoneLabel(name, count, hexColor) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const ctx = c.getContext('2d');

    const colorStr = '#' + hexColor.toString(16).padStart(6, '0');

    // Glow blanco para que destaque sobre cielos saturados
    ctx.shadowColor = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 22;

    // Stroke oscuro para legibilidad
    ctx.font = '900 150px -apple-system, "SF Pro Display", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(20,30,50,0.6)';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeText(name, 512, 100);

    // Relleno en color del estado
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = colorStr;
    ctx.fillText(name, 512, 100);

    // Conteo debajo — más chico, mismo color
    ctx.font = '700 64px -apple-system, sans-serif';
    ctx.shadowColor = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(20,30,50,0.6)';
    ctx.lineWidth = 6;
    ctx.strokeText(`${count} árboles`, 512, 200);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = colorStr;
    ctx.fillText(`${count} árboles`, 512, 200);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;  // sin mipmaps — el texto se ve más nítido
    return tex;
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
    // Placeholder MINIMALISTA tipo "moneda" — un círculo del color del
    // semáforo con el código del árbol al centro. Mucho menos invasivo
    // que las tarjetas con emoji + "80%" que ocupaban toda la atención.
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');

    const hex = '#' + color.toString(16).padStart(6, '0');

    // Disco semi-transparente (el aire alrededor queda transparente —
    // necesitamos transparent en este material, pero como es un placeholder
    // efímero que se reemplaza con la foto real, no afecta perf general).
    const gradient = ctx.createRadialGradient(128, 128, 30, 128, 128, 120);
    gradient.addColorStop(0, hex + 'd0');   // centro más opaco
    gradient.addColorStop(0.7, hex + '80');
    gradient.addColorStop(1, hex + '00');   // borde transparente
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    // Borde sutil
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 95, 0, Math.PI * 2);
    ctx.stroke();

    // Código del árbol — texto compacto
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    const code = (tree.tree_code || '-').slice(0, 12);
    ctx.fillText(code, 128, 128);

    const tex = new THREE.CanvasTexture(c);
    const planeGeo = new THREE.PlaneGeometry(1.0, 1.0);  // más chico que las fotos (2x2)
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide,
      transparent: true,  // necesario para que el círculo no tenga fondo cuadrado
      alphaTest: 0.05
    });
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
