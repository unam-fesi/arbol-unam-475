// ============================================================================
// PUM-AI - Consultor de arboricultura via Edge Function (Gemini protegido)
// ============================================================================

let pumaiChatHistory = [];
let pumaiCurrentPhoto = null;

function initPumAI() {
  const container = document.getElementById('pumai-content');
  if (!container) return;
  if (container.dataset.initialized === 'true') return;
  container.dataset.initialized = 'true';

  container.innerHTML = `
    <div class="pum-ai-container" style="display:flex;gap:0;flex-direction:column;max-width:800px;margin:0 auto;">
      <div id="pumai-messages" style="position:relative;background:white;border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow);min-height:350px;max-height:500px;overflow-y:auto;padding:1.5rem;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.12;pointer-events:none;z-index:0;">
          <img src="img/pumai-logo.png" alt="" style="width:200px;height:200px;object-fit:contain;">
        </div>
        <div style="position:relative;z-index:1;margin-bottom:1rem;display:flex;gap:12px;align-items:flex-start;">
          <img src="img/pumai-logo.png" alt="PUM-AI" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;">
          <div style="background:#e8f5e9;padding:12px 16px;border-radius:12px;border-bottom-left-radius:4px;max-width:85%;font-size:0.95rem;">
            ¡Hola! Soy <strong>PUM-AI</strong>, tu consultor de arboricultura. Puedes subir una foto de tu árbol y/o hacerme preguntas sobre cuidados, plagas, diagnósticos, etc.
          </div>
        </div>
      </div>

      <div id="pumai-photo-bar" style="display:none;background:#f0f7f0;padding:10px 16px;border-left:1px solid var(--border-light);border-right:1px solid var(--border-light);align-items:center;gap:10px;">
        <img id="pumai-thumb" style="width:48px;height:48px;object-fit:cover;border-radius:6px;" alt="foto">
        <span style="flex:1;font-size:0.85rem;color:var(--text-light);">Foto adjunta al análisis</span>
        <button onclick="removePumaiPhoto()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;" title="Quitar foto">&times;</button>
      </div>

      <div style="background:white;border-radius:0 0 var(--radius-lg) var(--radius-lg);box-shadow:var(--shadow);padding:12px 16px;display:flex;align-items:center;gap:8px;">
        <input type="file" id="pumai-file" accept="image/*" style="display:none;">
        <button onclick="document.getElementById('pumai-file').click()" class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border-light);padding:8px 12px;" title="Adjuntar foto">
          <i class="fas fa-camera"></i>
        </button>
        <input type="text" id="pumai-input" placeholder="Escribe tu pregunta..." style="flex:1;border:1px solid var(--border-light);border-radius:20px;padding:10px 16px;font-size:0.95rem;">
        <button onclick="sendPumaiMessage()" class="btn btn-primary btn-sm" style="border-radius:20px;padding:8px 16px;">
          <i class="fas fa-paper-plane"></i> Enviar
        </button>
      </div>
    </div>
  `;

  document.getElementById('pumai-file').addEventListener('change', handlePumaiPhoto);
  document.getElementById('pumai-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendPumaiMessage();
  });
}

function handlePumaiPhoto() {
  const fileInput = document.getElementById('pumai-file');
  if (!fileInput.files || fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    pumaiCurrentPhoto = e.target.result;
    const bar = document.getElementById('pumai-photo-bar');
    const thumb = document.getElementById('pumai-thumb');
    if (bar) bar.style.display = 'flex';
    if (thumb) thumb.src = pumaiCurrentPhoto;
    showToast('Foto adjunta lista', 'success');
  };
  reader.readAsDataURL(file);
}

function removePumaiPhoto() {
  pumaiCurrentPhoto = null;
  const bar = document.getElementById('pumai-photo-bar');
  if (bar) bar.style.display = 'none';
  document.getElementById('pumai-file').value = '';
}

function addPumaiMessage(content, isUser) {
  const container = document.getElementById('pumai-messages');
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `margin-bottom:1rem;display:flex;gap:10px;align-items:flex-start;${isUser ? 'justify-content:flex-end' : ''}`;

  // Add PUM-AI avatar for bot messages
  if (!isUser) {
    const avatar = document.createElement('img');
    avatar.src = 'img/pumai-logo.png';
    avatar.alt = 'PUM-AI';
    avatar.style.cssText = 'width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;margin-top:2px;';
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.style.cssText = `
    padding:12px 16px;border-radius:12px;max-width:85%;font-size:0.95rem;line-height:1.5;
    ${isUser
      ? 'background:var(--primary);color:white;border-bottom-right-radius:4px;'
      : 'background:#f0f4f8;color:var(--text-dark);border-bottom-left-radius:4px;'
    }
  `;

  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = content;
  }

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

async function sendPumaiMessage() {
  const input = document.getElementById('pumai-input');
  const message = input.value.trim();

  if (!message && !pumaiCurrentPhoto) {
    showToast('Escribe una pregunta o adjunta una foto', 'warning');
    return;
  }

  let displayMsg = message || '(Foto enviada para análisis)';
  if (pumaiCurrentPhoto && message) displayMsg = '📷 ' + message;
  else if (pumaiCurrentPhoto) displayMsg = '📷 Analiza esta foto de mi árbol';
  addPumaiMessage(displayMsg, true);
  input.value = '';

  const typingId = 'typing-' + Date.now();
  document.getElementById('pumai-messages').insertAdjacentHTML('beforeend',
    `<div id="${typingId}" style="margin-bottom:1rem;"><div style="background:#f0f4f8;padding:12px 16px;border-radius:12px;border-bottom-left-radius:4px;max-width:85%;"><em>PUM-AI está analizando...</em></div></div>`
  );

  try {
    // Build request body for Edge Function
    const requestBody = {
      message: message || 'Analiza esta foto de mi árbol y dame un diagnóstico completo.'
    };

    // Add photo if present — compress first to avoid request size limits
    if (pumaiCurrentPhoto) {
      let photoToSend = pumaiCurrentPhoto;
      if (typeof compressImageForAI === 'function') {
        try { photoToSend = await compressImageForAI(pumaiCurrentPhoto, 1024, 1024, 0.7); } catch(e) {}
      }
      requestBody.imageBase64 = photoToSend.split(',')[1];
      requestBody.imageType = 'image/jpeg';
    }

    // Use sb.functions.invoke() - handles auth headers automatically
    const { data, error } = await sb.functions.invoke('pum-ai', {
      body: requestBody
    });

    document.getElementById(typingId)?.remove();

    if (error) {
      throw new Error(error.message || 'Error llamando a PUM-AI');
    }

    // Check for error in body (Edge Function always returns 200)
    if (data?.error) {
      throw new Error(data.error);
    }

    const botReply = data?.reply || 'Sin respuesta del modelo.';

    // Safe markdown-like formatting (escape HTML first, then apply formatting)
    const formattedReply = safeMd(botReply);

    addPumaiMessage(formattedReply, false);

    pumaiChatHistory.push(
      { role: 'user', content: requestBody.message },
      { role: 'assistant', content: botReply }
    );

    removePumaiPhoto();

    // Save conversation to DB (non-blocking)
    if (currentUser) {
      sb.from('ai_conversations').insert([
        { user_id: currentUser.id, role: 'user', message: requestBody.message },
        { user_id: currentUser.id, role: 'assistant', message: botReply }
      ]).then(() => {}).catch(() => {});
    }

  } catch (err) {
    document.getElementById(typingId)?.remove();
    console.error('PUM-AI error:', err);
    addPumaiMessage(`<span style="color:var(--danger);">Error: ${escapeHtml(err.message)}</span>`, false);
  }
}

window.initPumAI = initPumAI;
window.sendPumaiMessage = sendPumaiMessage;
window.removePumaiPhoto = removePumaiPhoto;
