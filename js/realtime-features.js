// js/realtime-features.js
// ============================================================================
// Features en tiempo real (Supabase Realtime). Tres canales separados:
//
//   1. measurements-pulse  — escucha INSERT en tree_measurements y dispara
//                            evento custom 'tree:measured' que el mapa 3D
//                            usa para pulsar un árbol + toast notification.
//
//   2. security-events     — escucha INSERT en security_events y agrega
//                            la fila arriba de la tabla en admin/Seguridad
//                            con animación de slide-in.
//
//   3. admin-presence      — tracker de quién está conectado. Cada admin/
//                            specialist se "trackea" al loguearse. El chip
//                            en el header muestra el conteo + lista.
//
// Cleanup: todos los canales se desuscriben en handleLogout (auth.js).
// Si Realtime falla (red, RLS, etc.), los errores se silencian — la app
// sigue funcionando normalmente sin estos features.
// ============================================================================

window.RealtimeFeatures = (function () {
  'use strict';

  let _channels = {};   // { measurements, security, presence }
  let _started = false;

  // ─────────────────────────────────────────────────────────────────────────
  // TOP 1: Latido del campus
  // ─────────────────────────────────────────────────────────────────────────
  function _startMeasurementsPulse() {
    if (typeof sb === 'undefined' || !sb.channel) return null;
    try {
      const ch = sb.channel('measurements-pulse')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tree_measurements' },
          (payload) => {
            try { _onNewMeasurement(payload.new); }
            catch (e) { console.warn('[rt] onNewMeasurement:', e); }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[rt] measurements-pulse status:', status);
          }
        });
      return ch;
    } catch (e) {
      console.warn('[rt] cannot start measurements-pulse:', e);
      return null;
    }
  }

  async function _onNewMeasurement(row) {
    if (!row || !row.tree_id) return;
    // Buscamos info del árbol + autor para el toast.
    let treeName = 'un árbol', authorName = 'Alguien';
    try {
      const { data: tree } = await sb.from('trees_catalog')
        .select('tree_code, common_name, location_lat, location_lng, campus')
        .eq('id', row.tree_id).maybeSingle();
      if (tree) {
        treeName = tree.tree_code || tree.common_name || '#' + row.tree_id;
        // Disparar evento custom para que el mapa 3D pulse este árbol
        window.dispatchEvent(new CustomEvent('tree:measured', {
          detail: { treeId: row.tree_id, treeData: tree, measurement: row },
        }));
      }
      if (row.user_id) {
        const { data: prof } = await sb.from('user_profiles')
          .select('full_name').eq('id', row.user_id).maybeSingle();
        if (prof?.full_name) authorName = prof.full_name.split(' ')[0]; // primer nombre
      }
    } catch (e) { /* ignore */ }

    if (typeof showToast === 'function') {
      showToast(`🌱 ${authorName} midió ${treeName}`, 'info', 4000);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOP 2: Security live feed
  // ─────────────────────────────────────────────────────────────────────────
  function _startSecurityFeed() {
    if (typeof sb === 'undefined' || !sb.channel) return null;
    try {
      const ch = sb.channel('security-events-live')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'security_events' },
          (payload) => {
            try { _onSecurityEvent(payload.new); }
            catch (e) { console.warn('[rt] onSecurityEvent:', e); }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[rt] security-events status:', status);
          }
        });
      return ch;
    } catch (e) {
      console.warn('[rt] cannot start security-events:', e);
      return null;
    }
  }

  function _onSecurityEvent(row) {
    if (!row) return;
    // Toast siempre que sea high/critical
    if (typeof showToast === 'function' && (row.severity === 'high' || row.severity === 'critical')) {
      showToast(`🛡️ Ataque detectado: ${row.event_type || 'evento'} desde ${row.ip_address || '?'}`, 'warning', 6000);
    }
    // Disparar evento custom para que el dashboard de seguridad agregue la fila
    window.dispatchEvent(new CustomEvent('security:event', { detail: row }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOP 3: Presence "quién está conectado"
  // ─────────────────────────────────────────────────────────────────────────
  function _startPresence(currentUser, currentProfile) {
    if (typeof sb === 'undefined' || !sb.channel || !currentUser) return null;
    try {
      const ch = sb.channel('admin-presence', {
        config: { presence: { key: currentUser.id } },
      });
      ch.on('presence', { event: 'sync' }, () => {
        try {
          const state = ch.presenceState();
          const users = [];
          Object.keys(state).forEach(k => {
            const meta = state[k][0];
            if (meta) users.push(meta);
          });
          _renderPresenceChip(users);
          window.dispatchEvent(new CustomEvent('presence:sync', { detail: users }));
        } catch (e) { console.warn('[rt] presence sync:', e); }
      });
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            user_id: currentUser.id,
            email: currentUser.email,
            full_name: currentProfile?.full_name || currentUser.email,
            role: currentProfile?.role || 'user',
            campus: currentProfile?.campus || null,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[rt] presence status:', status);
        }
      });
      return ch;
    } catch (e) {
      console.warn('[rt] cannot start presence:', e);
      return null;
    }
  }

  function _renderPresenceChip(users) {
    let chip = document.getElementById('presence-chip');
    if (!chip) {
      // Crearlo si no existe, dentro del header del admin (.header-actions o body)
      const header = document.querySelector('.user-info') || document.body;
      if (!header) return;
      chip = document.createElement('div');
      chip.id = 'presence-chip';
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#eaf6ed;color:#2E7D32;border:1px solid #c2dcd3;border-radius:14px;padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px;position:relative;user-select:none;';
      chip.title = 'Click para ver quién está conectado';
      chip.addEventListener('click', _togglePresenceList);
      header.insertBefore(chip, header.firstChild);
    }
    const count = users.length;
    chip.innerHTML = `<span style="width:8px;height:8px;background:#3b7a3a;border-radius:50%;display:inline-block;box-shadow:0 0 6px #3b7a3a;"></span> ${count} en línea`;
    // Almacenar en data para el popover
    chip.dataset.users = JSON.stringify(users);
  }

  function _togglePresenceList() {
    const chip = document.getElementById('presence-chip');
    if (!chip) return;
    let popover = document.getElementById('presence-popover');
    if (popover) { popover.remove(); return; }
    const users = JSON.parse(chip.dataset.users || '[]');
    popover = document.createElement('div');
    popover.id = 'presence-popover';
    popover.style.cssText = 'position:absolute;top:30px;right:0;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:0.6rem;min-width:240px;max-width:320px;z-index:9999;';
    popover.innerHTML = `
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">${users.length} conectado${users.length === 1 ? '' : 's'}</div>
      ${users.length === 0 ? '<div style="color:#999;font-size:12px;">Solo tú</div>' :
        users.map(u => `
          <div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
            <span style="width:6px;height:6px;background:#3b7a3a;border-radius:50%;"></span>
            <span style="flex:1;color:#333;">${escapeHtml(u.full_name || u.email || '?')}</span>
            ${u.campus ? `<span style="font-size:10px;color:#5b8b7d;background:#eaf6ed;padding:1px 6px;border-radius:8px;">${escapeHtml(u.campus)}</span>` : ''}
          </div>`).join('')}
    `;
    chip.appendChild(popover);
    // Cerrar al click afuera
    setTimeout(() => {
      const closeOutside = (e) => {
        if (popover && !popover.contains(e.target) && e.target !== chip && !chip.contains(e.target)) {
          popover.remove();
          document.removeEventListener('click', closeOutside);
        }
      };
      document.addEventListener('click', closeOutside);
    }, 50);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────────────────
  function start(currentUser, currentProfile) {
    if (_started) return;
    _started = true;
    _channels.measurements = _startMeasurementsPulse();
    _channels.security     = _startSecurityFeed();
    _channels.presence     = _startPresence(currentUser, currentProfile);
    console.log('[rt] Realtime features iniciadas');
  }

  function stop() {
    if (!_started) return;
    Object.values(_channels).forEach(ch => {
      try { if (ch && sb?.removeChannel) sb.removeChannel(ch); } catch (e) {}
    });
    _channels = {};
    _started = false;
    // Quitar el chip de presence del header
    const chip = document.getElementById('presence-chip');
    if (chip) chip.remove();
    console.log('[rt] Realtime features detenidas');
  }

  // Helper escapeHtml local por si utils.js no cargó aún
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  return { start, stop };
})();
