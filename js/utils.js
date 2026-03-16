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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
