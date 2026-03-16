// ============================================================================
// PUM-AI - Unified Analysis Panel (photo + chat in one)
// ============================================================================

let pumaiChatHistory = [];
let pumaiCurrentPhoto = null; // base64 data URL of uploaded photo

function initPumAI() {
  const container = document.getElementById('section-pumai');
  if (!container) return;

  // Only render once
  if (container.dataset.initialized === 'true') return;
  container.dataset.initialized = 'true';

  container.innerHTML = `
    <div class="container">
      <h2 style="margin-bottom:0.5rem;">Consultor PUM-AI</h2>
      <p class="text-muted" style="margin-bottom:1.5rem;">Sube una foto de tu árbol (opcional) y haz preguntas sobre cuidado, plagas o diagnóstico.</p>

      <div class="pum-ai-container" style="display:flex;gap:0;flex-direction:column;max-width:800px;margin:0 auto;">
        <!-- Chat messages -->
        <div id="pumai-messages" style="background:white;border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow);min-height:350px;max-height:500px;overflow-y:auto;padding:1.5rem;">
          <div class="msg-bot" style="margin-bottom:1rem;">
            <div style="background:#e8f5e9;padding:12px 16px;border-radius:12px;border-bottom-left-radius:4px;max-width:85%;font-size:0.95rem;">
              ¡Hola! Soy <strong>PUM-AI</strong>, tu consultor de arboricultura. Puedes subir una foto de tu árbol y/o hacerme preguntas sobre cuidados, plagas, diagnósticos, etc.
            </div>
          </div>
        </div>

        <!-- Photo preview bar (shown when photo is loaded) -->
        <div id="pumai-photo-bar" style="display:none;background:#f0f7f0;padding:10px 16px;border-left:1px solid var(--border-light);border-right:1px solid var(--border-light);align-items:center;gap:10px;">
          <img id="pumai-thumb" style="width:48px;height:48px;object-fit:cover;border-radius:6px;" alt="foto">
          <span style="flex:1;font-size:0.85rem;color:var(--text-light);">Foto adjunta al análisis</span>
          <button onclick="removePumaiPhoto()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;" title="Quitar foto">&times;</button>
        </div>

        <!-- Input bar -->
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
    </div>
  `;

  // Event listeners
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
  wrapper.style.cssText = `margin-bottom:1rem;display:flex;${isUser ? 'justify-content:flex-end' : ''}`;

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
    // Bot messages can have formatted HTML
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

  // Show user message
  let displayMsg = message || '(Foto enviada para análisis)';
  if (pumaiCurrentPhoto && message) {
    displayMsg = '📷 ' + message;
  } else if (pumaiCurrentPhoto) {
    displayMsg = '📷 Analiza esta foto de mi árbol';
  }
  addPumaiMessage(displayMsg, true);
  input.value = '';

  // Show typing indicator
  const typingId = 'typing-' + Date.now();
  const typingHtml = `<div id="${typingId}" style="margin-bottom:1rem;"><div style="background:#f0f4f8;padding:12px 16px;border-radius:12px;border-bottom-left-radius:4px;max-width:85%;"><em>PUM-AI está analizando...</em></div></div>`;
  document.getElementById('pumai-messages').insertAdjacentHTML('beforeend', typingHtml);

  try {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    if (sessionError || !session) {
      document.getElementById(typingId)?.remove();
      showToast('Sesión expirada, vuelve a iniciar sesión', 'error');
      return;
    }

    // Build request body
    const body = {
      message: message || 'Analiza esta foto de mi árbol y dame un diagnóstico',
      chat_history: pumaiChatHistory.slice(-6) // last 6 messages for context
    };

    // If photo is attached, send as base64 (no storage bucket needed)
    if (pumaiCurrentPhoto) {
      body.photo_base64 = pumaiCurrentPhoto;
    }

    const response = await fetch(PUMAI_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });

    document.getElementById(typingId)?.remove();

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Error ${response.status}`);
    }

    const result = await response.json();
    const botReply = result.analysis || result.message || result.reply || JSON.stringify(result);

    // Format response nicely
    let formattedReply = botReply;
    if (result.recommendations) {
      formattedReply += `<br><br><strong>Recomendaciones:</strong><br>${result.recommendations}`;
    }
    if (result.health_status) {
      formattedReply += `<br><br><strong>Estado de salud:</strong> ${result.health_status}`;
    }

    addPumaiMessage(formattedReply, false);

    // Update chat history
    pumaiChatHistory.push(
      { role: 'user', content: message || 'Analiza esta foto' },
      { role: 'assistant', content: botReply }
    );

    // Clear photo after sending
    removePumaiPhoto();

  } catch (err) {
    document.getElementById(typingId)?.remove();
    console.error('PUM-AI error:', err);
    addPumaiMessage(`<span style="color:var(--danger);">Error: ${escapeHtml(err.message)}</span><br><small>Verifica que la Edge Function 'pum-ai-analyze' esté desplegada en Supabase.</small>`, false);
  }
}

window.initPumAI = initPumAI;
window.sendPumaiMessage = sendPumaiMessage;
window.removePumaiPhoto = removePumaiPhoto;
