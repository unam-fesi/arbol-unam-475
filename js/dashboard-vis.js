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

    const withCoord = (trees || []).filter(t => t.location_lat && t.location_lng);
    if (withCoord.length === 0) {
      el.innerHTML = '<div class="vis-loading">Sin árboles georreferenciados aún.</div>';
      return true;
    }

    const avgLat = withCoord.reduce((s,t) => s + t.location_lat, 0) / withCoord.length;
    const avgLng = withCoord.reduce((s,t) => s + t.location_lng, 0) / withCoord.length;

    heatmapInstance = L.map(el, { zoomControl: true }).setView([avgLat, avgLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(heatmapInstance);

    // Capa de intensidad: círculos translúcidos cuyo color y radio dependen de salud
    withCoord.forEach(t => {
      const color = colorByHealthHex(t.health_score);
      // Círculo grande para "calor" (diámetro fijo 50m)
      L.circle([t.location_lat, t.location_lng], {
        radius: 35,
        color: color, fillColor: color,
        fillOpacity: 0.45, weight: 0
      }).addTo(heatmapInstance);
      // Círculo pequeño central
      L.circleMarker([t.location_lat, t.location_lng], {
        radius: 6, color: 'white', weight: 2,
        fillColor: color, fillOpacity: 1
      }).addTo(heatmapInstance).bindTooltip(
        `${escapeHtml(t.common_name || t.species || 'Árbol')} — ${t.health_score || 0}%`,
        { direction: 'top' }
      );
    });

    // Leyenda
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
      const div = L.DomUtil.create('div', 'heatmap-legend');
      div.style.cssText = 'background:white;padding:8px 12px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:Inter,sans-serif;font-size:0.78rem;';
      div.innerHTML = `
        <strong style="display:block;margin-bottom:4px;">Salud</strong>
        <div style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:14px;background:#4a7c2a;border-radius:50%;"></span> Sano (≥80)</div>
        <div style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:14px;background:#95b86c;border-radius:50%;"></span> Bueno (60-79)</div>
        <div style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:14px;background:#d49b3a;border-radius:50%;"></span> Atención (40-59)</div>
        <div style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:14px;background:#b54f3a;border-radius:50%;"></span> Crítico (&lt;40)</div>
      `;
      return div;
    };
    legend.addTo(heatmapInstance);

    const bounds = L.latLngBounds(withCoord.map(t => [t.location_lat, t.location_lng]));
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
    el.innerHTML = '<div class="vis-loading" style="color:#c8aae0;">Cargando mosaico…</div>';

    const w = el.clientWidth || 800;
    const h = 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d2418);
    scene.fog = new THREE.Fog(0x2d2418, 25, 80);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(0, 6, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // Luz suave para que las fotos sean visibles
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.4);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    // 3 plataformas: verde, ámbar, rojo
    const ZONES = [
      { name: 'Sano',     color: 0x4a7c2a, x: -7,  filter: t => (t.health_score || 0) >= 70 },
      { name: 'Atención', color: 0xd49b3a, x: 0,   filter: t => (t.health_score || 0) >= 40 && (t.health_score || 0) < 70 },
      { name: 'Crítico',  color: 0xb54f3a, x: 7,   filter: t => (t.health_score || 0) < 40 }
    ];

    // Plataforma base por zona (disco)
    ZONES.forEach(zone => {
      const platGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.3, 16);
      const platMat = new THREE.MeshStandardMaterial({
        color: zone.color, roughness: 0.7, emissive: zone.color, emissiveIntensity: 0.25
      });
      const plat = new THREE.Mesh(platGeo, platMat);
      plat.position.set(zone.x, -0.5, 0);
      scene.add(plat);

      // Etiqueta flotante
      const labelTex = makeLabelTexture(zone.name);
      const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
      const label = new THREE.Sprite(labelMat);
      label.position.set(zone.x, -1.5, 0);
      label.scale.set(3, 0.8, 1);
      scene.add(label);
    });

    // Foto planes por árbol
    const photoPlanes = [];
    const treesWithPhotos = (trees || []).filter(t => t.photo_url);

    if (treesWithPhotos.length === 0) {
      // Si no hay fotos, mostrar emoji o placeholder
      ZONES.forEach(zone => {
        const treesInZone = (trees || []).filter(zone.filter);
        treesInZone.forEach((t, i) => {
          const placeholder = makePlaceholderPlane(t, zone.color);
          const angle = (i / Math.max(treesInZone.length, 1)) * Math.PI * 2;
          const r = 1.5 + Math.random() * 0.7;
          placeholder.position.set(zone.x + Math.cos(angle) * r, Math.random() * 2 + 0.5, Math.sin(angle) * r);
          placeholder.userData = { tree: t, isPhoto: true };
          scene.add(placeholder);
          photoPlanes.push(placeholder);
        });
      });
    } else {
      // Resolver signed URLs y crear texture-loaded planes
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      for (const t of treesWithPhotos) {
        try {
          // Obtener signed URL del bucket
          let url = t.photo_url;
          if (!url.startsWith('http')) {
            const { data } = await sb.storage.from('tree-photos').createSignedUrl(url, 3600);
            url = data && data.signedUrl;
          }
          if (!url) continue;

          const score = t.health_score || 0;
          const zone = ZONES.find(z => z.filter(t)) || ZONES[1];
          const idx = photoPlanes.length;
          const angle = (idx % 8) * (Math.PI / 4) + Math.random() * 0.3;
          const r = 1.5 + Math.random() * 0.8;

          loader.load(url, (tex) => {
            const planeGeo = new THREE.PlaneGeometry(1.4, 1.4);
            const planeMat = new THREE.MeshBasicMaterial({
              map: tex, transparent: true, side: THREE.DoubleSide
            });
            const plane = new THREE.Mesh(planeGeo, planeMat);
            plane.position.set(zone.x + Math.cos(angle) * r, idx * 0.05 + 1, Math.sin(angle) * r);
            plane.lookAt(camera.position);
            plane.userData = { tree: t, isPhoto: true };
            scene.add(plane);
            photoPlanes.push(plane);
          }, undefined, () => {
            // fallback al placeholder
            const placeholder = makePlaceholderPlane(t, zone.color);
            placeholder.position.set(zone.x + Math.cos(angle) * r, idx * 0.05 + 1, Math.sin(angle) * r);
            placeholder.userData = { tree: t, isPhoto: true };
            scene.add(placeholder);
            photoPlanes.push(placeholder);
          });
        } catch (e) { console.warn('Foto no cargó:', e); }
      }

      // Para árboles SIN foto pero que pertenecen a alguna zona, mostrar placeholder
      (trees || []).filter(t => !t.photo_url).forEach((t, i) => {
        const zone = ZONES.find(z => z.filter(t)) || ZONES[1];
        const placeholder = makePlaceholderPlane(t, zone.color);
        const angle = (i / 8) * Math.PI + Math.random() * 0.3;
        const r = 2.3 + Math.random() * 0.5;
        placeholder.position.set(zone.x + Math.cos(angle) * r, 2.5 + Math.random(), Math.sin(angle) * r);
        placeholder.userData = { tree: t, isPhoto: true };
        scene.add(placeholder);
        photoPlanes.push(placeholder);
      });
    }

    // Controls
    let controls = null;
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.minDistance = 12;
      controls.maxDistance = 35;
      controls.target.set(0, 1, 0);
      controls.enablePan = false;
    }

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(photoPlanes);
      if (hits.length > 0 && hits[0].object.userData.tree && typeof editAdminTree === 'function') {
        editAdminTree(parseInt(hits[0].object.userData.tree.id, 10));
      }
    };
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
      if (controls) controls.update();
      // Las fotos miran a la cámara (billboard)
      photoPlanes.forEach(p => p.lookAt(camera.position));
      renderer.render(scene, camera);
    }
    animate();

    mosaicoState = {
      destroy: () => {
        if (animId) cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('click', onClick);
        if (controls) controls.dispose();
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
    return true;
  }

  function makeLabelTexture(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = 'bold 56px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(text, 256, 64);
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
