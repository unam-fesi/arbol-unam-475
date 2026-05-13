// ============================================================================
// Time-lapse — genera un video de la evolución del árbol con sus seguimientos
// ============================================================================
// Toma todas las fotos del árbol (ordenadas por fecha), las anima en pantalla
// y permite descargar como GIF (formato universal para redes y mensajería).
//
// Para el GIF usamos gif.js cargado dinámicamente desde CDN.
// ============================================================================

window.TreeTimelapse = (function() {
  'use strict';

  // Carga lazy de gif.js (~30 KB)
  let _gifLoaded = false;
  function loadGifLib() {
    return new Promise((resolve) => {
      if (_gifLoaded || typeof GIF !== 'undefined') {
        _gifLoaded = true;
        return resolve(true);
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js';
      script.onload = () => { _gifLoaded = true; resolve(true); };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  // Resuelve photo_url a una URL utilizable (signed URL si es path relativo)
  async function resolvePhoto(url) {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    try {
      const { data } = await sb.storage.from('tree-photos').createSignedUrl(url, 3600);
      return data?.signedUrl || null;
    } catch (_) { return null; }
  }

  // Carga imagen a un HTMLImageElement
  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // ============================================================================
  // Abrir modal con time-lapse del árbol
  // ============================================================================
  async function open(treeId) {
    // Cargar árbol + mediciones
    const { data: tree } = await sb.from('trees_catalog')
      .select('id, tree_code, common_name, species, health_score').eq('id', treeId).single();
    if (!tree) { alert('Árbol no encontrado'); return; }

    const { data: meas } = await sb.from('tree_measurements')
      .select('id, measurement_date, photo_url, health_score, height_cm')
      .eq('tree_id', treeId)
      .order('measurement_date', { ascending: true });

    const withPhoto = (meas || []).filter(m => m.photo_url);
    if (withPhoto.length < 2) {
      alert('Este árbol necesita al menos 2 seguimientos con foto para generar un time-lapse.');
      return;
    }

    // Modal placeholder con loading
    const modal = document.createElement('div');
    modal.id = 'tl-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);';
    modal.innerHTML = `
      <div style="background:#1a1a1a;color:#fff;border-radius:14px;max-width:560px;width:100%;max-height:92vh;overflow:hidden;box-shadow:0 10px 50px rgba(0,0,0,0.6);position:relative;">
        <div style="padding:1rem 1.2rem;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="margin:0;font-size:1.05rem;">🎞️ Time-lapse</h3>
            <p style="margin:0.2rem 0 0;color:#aaa;font-size:0.78rem;">${escapeHtml(tree.common_name || tree.tree_code)} · ${withPhoto.length} fotos</p>
          </div>
          <button onclick="document.getElementById('tl-modal').remove()" style="background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;line-height:1;opacity:0.7;">×</button>
        </div>
        <div id="tl-stage" style="background:#000;width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;position:relative;">
          <div id="tl-status" style="text-align:center;color:#fff;">
            <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;"></i>
            <div style="margin-top:0.5rem;font-size:0.85rem;">Preparando imágenes…</div>
          </div>
          <canvas id="tl-canvas" width="600" height="600" style="display:none;width:100%;height:100%;object-fit:contain;"></canvas>
        </div>
        <div id="tl-controls" style="padding:1rem 1.2rem;display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
          <button id="tl-play" disabled style="background:#2E7D32;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-weight:500;opacity:0.5;">▶ Reproducir</button>
          <button id="tl-download" disabled style="background:#1976D2;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-weight:500;opacity:0.5;">⬇ Descargar GIF</button>
          <button id="tl-share" disabled style="background:#E91E63;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-weight:500;opacity:0.5;">📤 Compartir</button>
        </div>
        <div id="tl-progress" style="display:none;padding:0 1.2rem 1rem;">
          <div style="background:rgba(255,255,255,0.1);height:6px;border-radius:3px;overflow:hidden;">
            <div id="tl-progress-bar" style="background:#2E7D32;height:100%;width:0%;transition:width 0.2s;"></div>
          </div>
          <div id="tl-progress-text" style="text-align:center;font-size:0.78rem;color:#aaa;margin-top:0.3rem;">0%</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Cargar imágenes en paralelo
    const status = document.getElementById('tl-status');
    const images = [];
    for (let i = 0; i < withPhoto.length; i++) {
      status.querySelector('div').textContent = `Cargando foto ${i + 1}/${withPhoto.length}…`;
      const url = await resolvePhoto(withPhoto[i].photo_url);
      if (!url) continue;
      const img = await loadImage(url);
      if (img) images.push({ img, meta: withPhoto[i] });
    }

    if (images.length < 2) {
      status.innerHTML = '<div style="color:#f88;">No se pudieron cargar suficientes fotos.</div>';
      return;
    }

    // Animar en canvas
    const canvas = document.getElementById('tl-canvas');
    canvas.style.display = 'block';
    status.style.display = 'none';
    const ctx = canvas.getContext('2d');

    let playing = false;
    let frameIdx = 0;

    function drawFrame(i) {
      const { img, meta } = images[i];
      // Limpiar
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Dibujar imagen centrada y ajustada
      const sc = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * sc, h = img.height * sc;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

      // Overlay con fecha + salud
      const date = new Date(meta.measurement_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
      // Banda inferior
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, canvas.height - 70, canvas.width, 70);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(date, 16, canvas.height - 42);
      // Salud
      if (meta.health_score != null) {
        const sc2 = meta.health_score;
        const col = sc2 >= 70 ? '#4CAF50' : sc2 >= 40 ? '#FFA726' : '#EF5350';
        ctx.fillStyle = col;
        ctx.font = 'bold 20px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${sc2}/100`, canvas.width - 16, canvas.height - 42);
      }
      // Altura si está
      if (meta.height_cm) {
        ctx.fillStyle = '#ccc';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Altura: ${meta.height_cm} cm`, 16, canvas.height - 18);
      }
      // Frame counter
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${i + 1}/${images.length}`, canvas.width - 16, canvas.height - 18);
    }

    drawFrame(0);

    function play() {
      if (playing) return;
      playing = true;
      const btn = document.getElementById('tl-play');
      btn.textContent = '⏸ Pausa';
      const interval = setInterval(() => {
        if (!playing) { clearInterval(interval); return; }
        frameIdx = (frameIdx + 1) % images.length;
        drawFrame(frameIdx);
        if (frameIdx === 0) {
          playing = false;
          clearInterval(interval);
          btn.textContent = '▶ Reproducir';
        }
      }, 700);
    }

    // Habilitar botones
    const btnPlay = document.getElementById('tl-play');
    btnPlay.disabled = false;
    btnPlay.style.opacity = '1';
    btnPlay.onclick = () => { if (playing) playing = false; else play(); };

    const btnDl = document.getElementById('tl-download');
    btnDl.disabled = false;
    btnDl.style.opacity = '1';
    btnDl.onclick = () => generateGIF(images, tree);

    const btnShare = document.getElementById('tl-share');
    btnShare.disabled = false;
    btnShare.style.opacity = '1';
    btnShare.onclick = () => shareGIF(images, tree);

    // Auto-play
    setTimeout(play, 500);
  }

  // ============================================================================
  // Generar GIF con gif.js
  // ============================================================================
  async function generateGIF(images, tree, downloadAfter = true) {
    const status = document.getElementById('tl-progress');
    const bar = document.getElementById('tl-progress-bar');
    const txt = document.getElementById('tl-progress-text');
    status.style.display = 'block';
    txt.textContent = 'Cargando librería GIF…';

    const ok = await loadGifLib();
    if (!ok) {
      alert('No se pudo cargar la librería GIF. Verifica tu conexión.');
      status.style.display = 'none';
      return null;
    }

    txt.textContent = 'Componiendo GIF…';

    return new Promise((resolve) => {
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: 600,
        height: 600,
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
      });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 600; tempCanvas.height = 600;
      const tctx = tempCanvas.getContext('2d');

      for (let i = 0; i < images.length; i++) {
        const { img, meta } = images[i];
        tctx.fillStyle = '#000';
        tctx.fillRect(0, 0, 600, 600);
        const sc = Math.min(600 / img.width, 600 / img.height);
        const w = img.width * sc, h = img.height * sc;
        tctx.drawImage(img, (600 - w) / 2, (600 - h) / 2, w, h);

        // Banda inferior con info
        tctx.fillStyle = 'rgba(0,0,0,0.7)';
        tctx.fillRect(0, 530, 600, 70);
        tctx.fillStyle = '#fff';
        tctx.font = 'bold 24px sans-serif';
        tctx.textAlign = 'left';
        const date = new Date(meta.measurement_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
        tctx.fillText(date, 16, 558);
        if (meta.health_score != null) {
          const col = meta.health_score >= 70 ? '#4CAF50' : meta.health_score >= 40 ? '#FFA726' : '#EF5350';
          tctx.fillStyle = col;
          tctx.font = 'bold 20px sans-serif';
          tctx.textAlign = 'right';
          tctx.fillText(`${meta.health_score}/100`, 584, 558);
        }
        tctx.fillStyle = '#ccc';
        tctx.font = '14px sans-serif';
        tctx.textAlign = 'left';
        if (meta.height_cm) tctx.fillText(`${meta.height_cm} cm`, 16, 582);

        gif.addFrame(tctx, { copy: true, delay: 700 });
      }

      gif.on('progress', (p) => {
        const pct = Math.round(p * 100);
        bar.style.width = pct + '%';
        txt.textContent = `Procesando: ${pct}%`;
      });

      gif.on('finished', (blob) => {
        bar.style.width = '100%';
        txt.textContent = '¡Listo!';

        if (downloadAfter) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `timelapse-${tree.tree_code || tree.id}.gif`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        setTimeout(() => { status.style.display = 'none'; }, 1500);
        resolve(blob);
      });

      gif.render();
    });
  }

  // Web Share API si está disponible (móvil)
  async function shareGIF(images, tree) {
    const blob = await generateGIF(images, tree, false);
    if (!blob) return;
    const file = new File([blob], `timelapse-${tree.tree_code}.gif`, { type: 'image/gif' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Time-lapse: ${tree.common_name || tree.tree_code}`,
          text: `Mira la evolución de mi árbol en el Proyecto Árbol UNAM 475 🌳`,
        });
      } catch (e) {
        console.log('Share cancelado');
      }
    } else {
      // Fallback: descargar
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timelapse-${tree.tree_code || tree.id}.gif`;
      a.click();
      alert('Tu navegador no soporta compartir directo. El GIF se descargó — súbelo manualmente a tus redes.');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return { open };
})();

window.openTreeTimelapse = (treeId) => window.TreeTimelapse.open(treeId);
