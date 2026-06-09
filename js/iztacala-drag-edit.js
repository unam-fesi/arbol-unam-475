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
  let ctx = null;          // { scene, camera, renderer, controls, treeMeshes, ... }
  let dragging = null;     // { entry, group, originalPos: Vector3, originalCoords: {lat,lng} }
  let raycaster, mouse, groundPlane, intersection;
  let toast = null;        // función showToast del global

  function _canEdit() {
    try {
      const role = String(window.currentUserProfile?.role || '').toLowerCase();
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
    dom.style.cursor = ''; // limpia

    console.log('[DragEdit] habilitado para rol:', window.currentUserProfile?.role);
    toast('Modo edición activado: arrastra cualquier árbol para reubicarlo', 'info', 3500);
  }

  function _updateMouseFromEvent(ev) {
    const dom = ctx.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function _onPointerDown(ev) {
    if (ev.button !== 0) return;   // solo botón izquierdo
    if (dragging) return;
    _updateMouseFromEvent(ev);
    raycaster.setFromCamera(mouse, ctx.camera);

    // Buscar pickable meshes de los árboles
    const allPickable = [];
    for (const t of ctx.treeMeshes) {
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

    // Empezar drag
    ev.preventDefault();
    ev.stopPropagation();
    dragging = {
      entry,
      group: entry.group,
      originalPos: entry.group.position.clone(),
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
      dragging.group.position.set(intersection.x, dragging.originalPos.y, intersection.z);
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

    const { lat, lng } = _modelXYZToLatLng(newPos.x, newPos.z);
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
