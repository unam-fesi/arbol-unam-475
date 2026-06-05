// ============================================================================
// UTILS - Toast, Modal, Helpers
// ============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
    info: '#2196F3'
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    padding: 15px 20px;
    margin: 10px;
    border-radius: 8px;
    color: white;
    background: ${colors[type] || colors.info};
    animation: slideIn 0.3s ease-in-out;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 0.9rem;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showModal(title, bodyHtml) {
  let modal = document.getElementById('generic-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'generic-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 id="modal-title"></h3>
          <button class="modal-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <div id="modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });
  }
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('generic-modal');
  if (modal) modal.style.display = 'none';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Escape SEGURO para usar dentro de un onclick="fn('${...}')" o atributo similar.
// El parser HTML decodifica entidades ANTES de evaluar el JS del onclick, por
// eso `escapeHtml` (que convierte ' → &#39;) NO sirve aquí — el browser
// decodifica &#39; → ' y rompe el string literal del JS (vector XSS).
// safeJsAttr produce escapes que sobreviven el HTML parser y son válidos
// dentro de un string JS delimitado por comillas simples.
function safeJsAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')   // backslash primero, sino se escapa doble
    .replace(/'/g, "\\'")     // single quote (delimitador de string JS)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3c')   // evita romper con </script>, </button>, etc.
    .replace(/>/g, '\\x3e')
    .replace(/&/g, '\\x26')   // queda fuera del HTML parser → JS escape literal
    .replace(/"/g, '&quot;'); // por si rompe el atributo HTML envolvente
}
window.safeJsAttr = safeJsAttr;

// Sanitize markdown-like text: escape HTML first, then apply safe formatting
function safeMd(text) {
  if (!text) return '';
  let safe = escapeHtml(text);
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

// Compress image via canvas to reduce base64 size for API requests
// iOS Safari: large images (12MP+) can cause canvas memory issues,
// so we limit to 800x800 and use progressive quality reduction
function compressImageForAI(base64DataUrl, maxWidth, maxHeight, quality) {
  maxWidth = maxWidth || 800;
  maxHeight = maxHeight || 800;
  quality = quality || 0.65;
  // Max base64 output size: ~1.5MB (safe for Supabase Edge Functions)
  var MAX_OUTPUT_SIZE = 1.5 * 1024 * 1024;
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      try {
        var w = img.width, h = img.height;
        // Always resize - even if "smaller", ensures canvas doesn't OOM on iOS
        if (w > maxWidth || h > maxHeight) {
          var ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        var result = canvas.toDataURL('image/jpeg', quality);
        // If still too large, reduce quality progressively
        var currentQuality = quality;
        while (result.length > MAX_OUTPUT_SIZE && currentQuality > 0.2) {
          currentQuality -= 0.1;
          result = canvas.toDataURL('image/jpeg', currentQuality);
        }
        // If STILL too large, reduce dimensions further
        if (result.length > MAX_OUTPUT_SIZE) {
          var smallW = Math.round(w * 0.6);
          var smallH = Math.round(h * 0.6);
          canvas.width = smallW;
          canvas.height = smallH;
          ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, smallW, smallH);
          result = canvas.toDataURL('image/jpeg', 0.5);
        }
        // Clean up to free memory (important for iOS)
        canvas.width = 0;
        canvas.height = 0;
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = function() {
      reject(new Error('No se pudo cargar la imagen'));
    };
    img.src = base64DataUrl;
  });
}

// ============================================================================
// Comprimir File de imagen → Blob JPEG listo para upload a Supabase Storage.
// Reutiliza compressImageForAI internamente (lee File → base64 → canvas → JPEG).
// Uso:
//   const blob = await compressImageFile(file, 1200, 0.8);  // ~300-500 KB típico
//   await sb.storage.from('bucket').upload(path, blob, { contentType: 'image/jpeg' });
// ============================================================================
async function compressImageFile(file, maxDim, quality) {
  if (!file) throw new Error('compressImageFile: file requerido');
  maxDim = maxDim || 1200;
  quality = (quality != null) ? quality : 0.8;

  // Si ya es chica (<400KB) y razonable, no perder tiempo recomprimiéndola
  if (file.size < 400 * 1024 && /jpe?g$/i.test(file.type)) {
    return file;
  }

  // File → base64
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });

  // base64 → comprimido base64
  const compressedDataUrl = await compressImageForAI(dataUrl, maxDim, maxDim, quality);

  // base64 → Blob
  const base64 = compressedDataUrl.split(',')[1];
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: 'image/jpeg' });
}

// ============================================================================
// Sube una foto en DOS versiones: original (1200px ~400KB) + thumbnail
// (400px ~30KB). Esto reemplaza la dependencia del "image transform" de
// Supabase (limitado a 100 imágenes/mes en el plan free).
//   Path original:  baseFileName + ".jpg"
//   Path thumbnail: baseFileName + "_thumb.jpg"
// Devuelve { fullPath, thumbPath, thumbOk }.
// ============================================================================
async function uploadPhotoWithThumb(file, bucket, baseFileName, opts) {
  if (!file) throw new Error('uploadPhotoWithThumb: file requerido');
  opts = opts || {};
  const fullMax = opts.fullMax || 1200;
  const fullQ = opts.fullQ != null ? opts.fullQ : 0.8;
  const thumbMax = opts.thumbMax || 400;
  const thumbQ = opts.thumbQ != null ? opts.thumbQ : 0.65;

  // Comprimir en paralelo (ambas versiones desde el mismo File)
  const [fullBlob, thumbBlob] = await Promise.all([
    compressImageFile(file, fullMax, fullQ),
    compressImageFile(file, thumbMax, thumbQ)
  ]);

  const fullPath = baseFileName + '.jpg';
  const thumbPath = baseFileName + '_thumb.jpg';

  // Subir en paralelo. upsert:true → si el mismo path ya existe (reintento por
  // doble-click o timeout), se sobrescribe en lugar de fallar con 409 conflict.
  // Esto evita el bug "a veces no me deja subir foto" cuando hubo un reintento.
  const [fullRes, thumbRes] = await Promise.all([
    sb.storage.from(bucket).upload(fullPath, fullBlob, {
      cacheControl: '3600', upsert: true, contentType: 'image/jpeg'
    }),
    sb.storage.from(bucket).upload(thumbPath, thumbBlob, {
      cacheControl: '3600', upsert: true, contentType: 'image/jpeg'
    })
  ]);

  if (fullRes.error) {
    // Loguear el error con context útil antes de propagar
    if (typeof logError === 'function') {
      logError({
        severity: 'error', source: 'frontend_web', action: 'uploadPhotoWithThumb',
        error: fullRes.error,
        context: { bucket, fullPath, fileSize: file.size, fileName: file.name }
      });
    }
    throw fullRes.error;
  }
  if (thumbRes.error) {
    console.warn('Thumb upload failed (fallback al original):', thumbRes.error);
    if (typeof logError === 'function') {
      logError({
        severity: 'warning', source: 'frontend_web', action: 'uploadPhotoWithThumb.thumb',
        error: thumbRes.error, context: { bucket, thumbPath }
      });
    }
  }
  return {
    fullPath,
    thumbPath,
    thumbOk: !thumbRes.error
  };
}

// Dado el path de una foto original (e.g. "424/1779207400433.jpg"),
// devuelve el path del thumbnail correspondiente ("424/1779207400433_thumb.jpg").
function thumbPathFor(fullPath) {
  if (!fullPath) return null;
  if (/^https?:\/\//i.test(fullPath)) return fullPath; // URLs absolutas no se tocan
  if (/_thumb\.jpg$/i.test(fullPath)) return fullPath; // ya es thumb
  return fullPath.replace(/\.(jpe?g|png|webp)$/i, '_thumb.jpg');
}

// Generar URL firmada para un path. Si pides thumb=true, intenta primero
// la versión _thumb.jpg; si no existe, cae al original.
async function getThumbUrl(bucket, path, opts) {
  if (!path) return null;
  if (typeof sb === 'undefined') return null;
  if (/^https?:\/\//i.test(path)) return path;
  opts = opts || {};
  const wantThumb = opts.thumb !== false;
  // Por compatibilidad con llamadas antiguas getThumbUrl(bucket, path, 400)
  if (typeof opts === 'number') { /* ignore old size param */ }

  // Pedir thumbnail si lo queremos. Si no existe, .signedUrl puede dar 400
  // al fetch — manejamos fallback en el caller. Aquí solo firmamos URLs.
  const target = wantThumb ? thumbPathFor(path) : path;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(target, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (_) {}
  // Si fallamos firmando el thumb (no existe), firmar el original
  if (wantThumb) {
    try {
      const { data } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    } catch (_) {}
  }
  return null;
}

// ============================================================================
// Mobile responsive helper — auto-asigna data-label a celdas de tablas
// para que el CSS responsive las muestre como tarjetas en móvil.
// ============================================================================
function applyMobileTableLabels(rootEl) {
  const root = rootEl || document;
  root.querySelectorAll('.admin-table').forEach(function(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map(function(th) {
      return th.textContent.trim();
    });
    if (headers.length === 0) return;
    table.querySelectorAll('tbody tr').forEach(function(tr) {
      Array.from(tr.children).forEach(function(td, i) {
        if (headers[i] && !td.hasAttribute('data-label')) {
          td.setAttribute('data-label', headers[i]);
        }
      });
    });
  });
}

// Observador global: cada vez que se modifica una <tbody> de admin, reaplica labels
(function() {
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(function(mutations) {
    let needsApply = false;
    for (const m of mutations) {
      if (m.target && m.target.tagName === 'TBODY' && m.target.closest('.admin-table')) {
        needsApply = true;
        break;
      }
    }
    if (needsApply) applyMobileTableLabels();
  });
  // Inicia el observer cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

// ============================================================================
// Detección de móvil — útil para condicionales en JS
// ============================================================================
function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches
      || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

window.applyMobileTableLabels = applyMobileTableLabels;
window.isMobile = isMobile;

// ============================================================================
// Fechas: helpers que evitan el bug de zona horaria
// ============================================================================
// Bug clásico: un date string como "2026-06-05T00:00:00+00" interpretado
// con new Date() y mostrado con toLocaleString en México (UTC-6) sale como
// "4 jun 18:00". Para fechas que representan un DÍA del calendario (no un
// instante exacto), sólo nos importa el día — ignoramos la hora.

// Toma cualquier representación de fecha (ISO con TZ, Date, "2026-06-05") y
// devuelve string "5 jun 2026" usando el DÍA tal cual viene en el string,
// sin convertir a otra zona horaria.
function formatDayLocal(input, opts = {}) {
  if (!input) return '—';
  const s = (input instanceof Date) ? input.toISOString() : String(input);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString('es-MX', Object.assign({
    day: 'numeric', month: 'short', year: 'numeric'
  }, opts));
}

// "2026-06-05" → "2026-06-05T12:00:00-06:00" (mediodía hora México).
// Garantiza que el día se preserva sin importar dónde corra el código.
function dateInputToMexicoNoon(dateStr) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr + 'T12:00:00-06:00';
}

// "YYYY-MM-DD" de HOY en zona horaria LOCAL del navegador (para inputs date).
// new Date().toISOString().split('T')[0] daba UTC → cerca de medianoche
// México pasaba al día siguiente. Esto da la fecha correcta siempre.
function todayLocalYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

window.formatDayLocal = formatDayLocal;
window.dateInputToMexicoNoon = dateInputToMexicoNoon;
window.todayLocalYMD = todayLocalYMD;

// ============================================================================
// logError(): envía errores a la tabla app_logs vía edge function log-error
// ============================================================================
// Uso:
//   logError({ source: 'frontend_web', action: 'save_tree', error: err, context: {...} });
//   logError({ severity: 'warning', action: 'photo_upload', error_message: 'timeout' });
//
// Captura automática (sin llamada manual):
//   - window.onerror — errores JS no manejados
//   - unhandledrejection — promises rejected sin .catch
//
// Anti-flood: throttle de 30 envíos/minuto y dedup por (action+message+5min).

const _logErrorDedup = new Map();
let _logErrorBudget = 30;
setInterval(() => { _logErrorBudget = 30; }, 60_000);

async function logError(opts = {}) {
  try {
    if (_logErrorBudget <= 0) return;

    const action = opts.action || 'unknown';
    const errMsg = opts.error_message
                || opts.message
                || (opts.error && (opts.error.message || String(opts.error)))
                || '(sin mensaje)';

    const dedupKey = action + '||' + errMsg.slice(0, 80);
    const lastReport = _logErrorDedup.get(dedupKey);
    if (lastReport && Date.now() - lastReport < 5 * 60_000) return;
    _logErrorDedup.set(dedupKey, Date.now());
    _logErrorBudget--;

    // Obtener token (best-effort; si no hay sesión, va con anon key)
    let accessToken = null;
    try {
      if (typeof sb !== 'undefined' && sb.auth?.getSession) {
        const { data } = await sb.auth.getSession();
        accessToken = data?.session?.access_token || null;
      }
    } catch (_) {}

    const payload = {
      severity: opts.severity || 'error',
      source: opts.source || 'frontend_web',
      action,
      error_message: errMsg,
      error_code: opts.error_code
                 || (opts.error && (opts.error.code || opts.error.statusCode))
                 || null,
      http_status: opts.http_status
                  || (opts.error && opts.error.status)
                  || null,
      stack_trace: opts.stack_trace
                  || (opts.error && opts.error.stack)
                  || null,
      url: opts.url || window.location.href,
      context: {
        ...(opts.context || {}),
        viewport: window.innerWidth + 'x' + window.innerHeight,
        ts: new Date().toISOString(),
        user_campus: (typeof currentUserProfile !== 'undefined' && currentUserProfile?.campus) || null,
      },
    };

    const url = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/log-error';
    const anonKey = (typeof SUPABASE_KEY !== 'undefined') ? SUPABASE_KEY : '';
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + (accessToken || anonKey),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* silent */ });
  } catch (_) { /* nunca propagamos: el logger no puede romper la app */ }
}

// Captura automática de errores no manejados
window.addEventListener('error', (e) => {
  logError({
    severity: 'error',
    source: 'frontend_web',
    action: 'window.onerror',
    error_message: e.message || 'window error',
    stack_trace: e.error?.stack,
    url: e.filename ? (e.filename + ':' + e.lineno + ':' + e.colno) : window.location.href,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  logError({
    severity: 'error',
    source: 'frontend_web',
    action: 'unhandledrejection',
    error_message: (r && (r.message || r.toString())) || 'Promise rejected sin handler',
    stack_trace: r && r.stack,
  });
});

window.logError = logError;
