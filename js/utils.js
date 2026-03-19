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
