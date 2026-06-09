// ============================================================================
// iztacala-drag-edit.js
// ============================================================================
// Drag-and-drop de árboles en el mapa 3D Iztacala para corregir su ubicación.
// Solo habilitado para roles ['admin', 'rectoria'].
//
// Flujo:
//   1. Click sostenido sobre un árbol → entra en modo drag
//   2. Mover el cursor → el árbol sigue al ratón sobre el plano del suelo
//   3. Soltar → modal "¿Mover X a la nueva ubicación?" → UPDATE en trees_catalog
//   4. Si se cancela o falla, el árbol regresa a su posición original
//
// Activación:
//   IztacalaDragEdit.init({ scene, camera, renderer, controls, treeMeshes,
//                            latlonToModelXY, CENTER_LAT, CENTER_LON,
//                            M_PER_LAT, M_PER_LON })
// Idempotente — múltiples llamadas no instalan handlers duplicados.
// ============================================================================

window.IztacalaDragEdit = (function () {
  'use strict';

  const ALLOWED_ROLES = ['admin', 'rectoria'];

  let installed = false;
  let enabled = false;     // modo edición OFF por default (toggle del user)
  let ctx = null;          // { scene, camera, renderer, controls, treeMeshes, ... }
  let dragging = null;     // { entry, group, originalPos: Vector3, originalCoords: {lat,lng} }
  let raycaster, mouse, groundPlane, intersection;
  let toast = null;        // función showToast del global
  let toggleBtn = null;    // referencia al botón flotante para actualizar estado visual

  function _canEdit() {
    try {
      // currentUserProfile es 'let' en config.js — variable global del archivo,
      // NO está en window. Hay que accederla directamente.
      const profile = (typeof currentUserProfile !== 'undefined') ? currentUserProfile : null;
      const role = String(profile?.role || '').toLowerCase();
      return ALLOWED_ROLES.includes(role);
    } catch { return false; }
  }

  function init(deps) {
    if (installed) return;
    if (!deps || !deps.scene || !deps.renderer || !deps.camera) {
      console.warn('[DragEdit] dependencias incompletas, skip'); return;
    }
    if (!_canEdit()) {
      console.log('[DragEdit] usuario sin permiso para drag, skip');
      return;
    }
    ctx = deps;
    installed = true;
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    intersection = new THREE.Vector3();
    toast = (typeof window.showToast === 'function') ? window.showToast : function(){};

    const dom = ctx.renderer.domElement;
    dom.addEventListener('pointerdown', _onPointerDown);
    dom.addEventListener('pointermove', _onPointerMove);
    dom.addEventListener('pointerup', _onPointerUp);
    dom.addEventListener('pointercancel', _cancelDrag);
    dom.style.cursor = '';

    _renderToggle();

    console.log('[DragEdit] disponible para rol:', (typeof currentUserProfile !== 'undefined' ? currentUserProfile?.role : '?'), '— modo edición:', enabled ? 'ON' : 'OFF');
  }

  function _renderToggle() {
    const dom = ctx.renderer.domElement;
    const container = dom.parentElement;
    if (!container) {
      console.warn('[DragEdit] no parent del renderer — toggle no se puede renderizar');
      return;
    }
    if (container.querySelector('#izta-edit-toggle')) {
      console.log('[DragEdit] toggle ya existe, no duplico');
      return;
    }

    // Asegurar position:relative en el contenedor para que absolute funcione
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';
    console.log('[DragEdit] renderizando toggle dentro de:', container.tagName + (container.id ? '#'+container.id : '') + '.' + (container.className||''));

    const btn = document.createElement('button');
    btn.id = 'izta-edit-toggle';
    btn.type = 'button';
    btn.title = 'Modo edición — arrastrar árboles';
    btn.innerHTML = `<span class="lock-icon">🔒</span><span class="lock-text">Editar ubicación</span>`;
    btn.style.cssText = `
      position: absolute;
      top: 55px;
      right: 11px;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.85);
      color: #555;
      border: 1px solid rgba(0,0,0,0.15);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      cursor: pointer;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      user-select: none;
      transition: all 0.15s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      if (!enabled) btn.style.background = 'rgba(255,255,255,0.95)';
    });
    btn.addEventListener('mouseleave', () => {
      _updateToggleVisual();
    });
    btn.addEventListener('click', _toggleEnabled);
    // En iPad evitar que el touch sobre el botón inicie drag del mapa
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('touchstart', (e) => e.stopPropagation());

    container.appendChild(btn);
    toggleBtn = btn;
  }

  function _updateToggleVisual() {
    if (!toggleBtn) return;
    if (enabled) {
      toggleBtn.style.background = 'rgba(46,125,50,0.92)';
      toggleBtn.style.color = '#fff';
      toggleBtn.style.borderColor = 'rgba(46,125,50,0.6)';
      toggleBtn.style.boxShadow = '0 2px 12px rgba(46,125,50,0.4)';
      toggleBtn.querySelector('.lock-icon').textContent = '✏️';
      toggleBtn.querySelector('.lock-text').textContent = 'Modo edición ON';
    } else {
      toggleBtn.style.background = 'rgba(255,255,255,0.85)';
      toggleBtn.style.color = '#555';
      toggleBtn.style.borderColor = 'rgba(0,0,0,0.15)';
      toggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      toggleBtn.querySelector('.lock-icon').textContent = '🔒';
      toggleBtn.querySelector('.lock-text').textContent = 'Editar ubicación';
    }
  }

  function _toggleEnabled() {
    enabled = !enabled;
    _updateToggleVisual();
    if (enabled) {
      toast('Modo edición ACTIVADO — arrastra árboles para reubicarlos', 'success', 3200);
    } else {
      // Si había drag en curso, cancelarlo
      if (dragging) _cancelDrag();
      toast('Modo edición desactivado', 'info', 1800);
    }
  }

  function _updateMouseFromEvent(ev) {
    const dom = ctx.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function _onPointerDown(ev) {
    if (!enabled) return;          // toggle OFF → no interceptamos clicks
    if (ev.button !== 0 && ev.pointerType !== 'touch') return;  // izq o touch
    if (dragging) return;
    _updateMouseFromEvent(ev);
    raycaster.setFromCamera(mouse, ctx.camera);

    // Buscar pickable meshes de los árboles — solo los VISIBLES (filtrados).
    // Si un árbol está oculto por filtro, no debe capturar el drag.
    const allPickable = [];
    for (const t of ctx.treeMeshes) {
      if (t.group?.visible === false) continue;
      if (t.pickable && Array.isArray(t.pickable)) {
        for (const m of t.pickable) {
          m.userData._treeEntry = t;
          allPickable.push(m);
        }
      }
    }
    const hits = raycaster.intersectObjects(allPickable, false);
    if (!hits.length) return;

    const entry = hits[0].object.userData._treeEntry;
    if (!entry || !entry.group || !entry.data) return;

    // Calcular el "offset de agarre": diferencia entre la posición del árbol
    // y dónde el cursor toca el suelo en ese momento. Esto es CRÍTICO para
    // que el árbol no salte al iniciar el drag — si agarras la copa (a 15m
    // de altura), el ray proyecta el cursor más lejos en el ground plane que
    // la base del árbol. Sin offset, el árbol "salta" a esa posición.
    const groundHit = new THREE.Vector3();
    let grabOffset = new THREE.Vector3(0, 0, 0);
    if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      grabOffset.copy(entry.group.position).sub(groundHit);
      // Solo X y Z importan (Y se mantiene constante en el ground plane)
      grabOffset.y = 0;
    }

    // Empezar drag
    ev.preventDefault();
    ev.stopPropagation();
    dragging = {
      entry,
      group: entry.group,
      originalPos: entry.group.position.clone(),
      grabOffset,            // posición árbol – posición cursor-suelo al iniciar
      originalCoords: {
        lat: entry.data.location_lat,
        lng: entry.data.location_lng,
      },
    };
    if (ctx.controls) ctx.controls.enabled = false;
    ctx.renderer.domElement.style.cursor = 'grabbing';
  }

  function _onPointerMove(ev) {
    if (!dragging) return;
    _updateMouseFromEvent(ev);
    raycaster.setFromCamera(mouse, ctx.camera);
    if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
      // Aplicar el offset capturado al inicio del drag para mantener el
      // "agarre" — el árbol sigue al cursor exactamente desde donde lo agarraste,
      // sin saltos.
      const newX = intersection.x + dragging.grabOffset.x;
      const newZ = intersection.z + dragging.grabOffset.z;
      dragging.group.position.set(newX, dragging.originalPos.y, newZ);
    }
  }

  function _modelXYZToLatLng(x, z) {
    // Three.js: position.set(x, 0, -y), donde y = (lat - CENTER_LAT) * M_PER_LAT
    // Entonces  y = -z  →  lat = CENTER_LAT + (-z) / M_PER_LAT
    //                       lng = CENTER_LON + x / M_PER_LON
    const lat = ctx.CENTER_LAT + (-z) / ctx.M_PER_LAT;
    const lng = ctx.CENTER_LON + x / ctx.M_PER_LON;
    return { lat, lng };
  }

  async function _onPointerUp(ev) {
    if (!dragging) return;
    if (ctx.controls) ctx.controls.enabled = true;
    ctx.renderer.domElement.style.cursor = '';
    const drag = dragging;
    dragging = null;

    const newPos = drag.group.position;
    // Si el usuario apenas movió el árbol (< 0.5 m), cancelar silenciosamente
    const dx = newPos.x - drag.originalPos.x;
    const dz = newPos.z - drag.originalPos.z;
    if (Math.hypot(dx, dz) < 0.5) {
      return;
    }

    // CRÍTICO: el árbol GLB tiene posición LOCAL fija dentro del group, así
    // que group.position NO equivale a la world position del árbol. En vez
    // de tratar de calcular eso, aplico el DELTA del drag (dx, dz en metros)
    // sobre las coords originales en lat/lng. Esto es independiente de cómo
    // esté estructurado el group y evita errores por bbox que incluye etiquetas.
    const dLat = -dz / ctx.M_PER_LAT;   // Z negativo = norte (lat aumenta)
    const dLng = dx / ctx.M_PER_LON;
    const lat = drag.originalCoords.lat + dLat;
    const lng = drag.originalCoords.lng + dLng;
    const t = drag.entry.data;
    const lbl = t.nickname || t.tree_code || ('árbol #' + t.id);
    const ok = window.confirm(
      `¿Mover "${lbl}" a la nueva ubicación?\n\n` +
      `De: ${drag.originalCoords.lat?.toFixed(6)}, ${drag.originalCoords.lng?.toFixed(6)}\n` +
      `A:  ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );
    if (!ok) {
      // Revertir posición visual
      drag.group.position.copy(drag.originalPos);
      return;
    }

    try {
      const { error } = await sb.from('trees_catalog')
        .update({ location_lat: lat, location_lng: lng, updated_at: new Date().toISOString() })
        .eq('id', t.id);
      if (error) throw error;
      // Actualizar el data del entry para que próximos drags partan de la nueva pos
      t.location_lat = lat;
      t.location_lng = lng;
      toast(`✅ ${lbl} reubicado`, 'success', 2800);
    } catch (err) {
      console.warn('[DragEdit] update failed:', err);
      drag.group.position.copy(drag.originalPos);
      toast(`No se pudo guardar: ${err.message || err}`, 'error', 4000);
    }
  }

  function _cancelDrag() {
    if (!dragging) return;
    if (ctx.controls) ctx.controls.enabled = true;
    ctx.renderer.domElement.style.cursor = '';
    dragging.group.position.copy(dragging.originalPos);
    dragging = null;
  }

  return { init };
})();
