// ============================================================================
// PUM-AI - Consultor de arboricultura usando Gemini API directo
// ============================================================================

let pumaiChatHistory = [];
let pumaiCurrentPhoto = null;

const PUMAI_SYSTEM_PROMPT = `Eres PUM-AI, un consultor experto en arboricultura de la UNAM (Universidad Nacional Autónoma de México), campus FES Iztacala. Tu especialidad es el cuidado de árboles endémicos y nativos de México.

Tus capacidades:
- Diagnóstico de enfermedades y plagas en árboles
- Recomendaciones de cuidado (riego, poda, fertilización)
- Identificación de especies por foto
- Evaluación de salud del árbol
- Consejos de conservación

Responde siempre en español, de forma clara y práctica. Si recibes una foto, analízala describiendo lo que observas del árbol (hojas, tronco, color, posibles problemas).`;

function initPumAI() {
  const container = document.getElementById('pumai-content');
  if (!container) return;
  if (container.dataset.initialized === 'true') return;
  container.dataset.initialized = 'true';

  container.innerHTML = `
    <div class="pum-ai-container" style="display:flex;gap:0;flex-direction:column;max-width:800px;margin:0 auto;">
      <div id="pumai-messages" style="background:white;border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow);min-height:350px;max-height:500px;overflow-y:auto;padding:1.5rem;">
        <div style="margin-bottom:1rem;">
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
    // Build Gemini API request
    const contents = [];

    // Add system instruction via first user turn context
    const parts = [];

    // Add text
    const userText = message || 'Analiza esta foto de mi árbol y dame un diagnóstico completo.';
    parts.push({ text: PUMAI_SYSTEM_PROMPT + '\n\nUsuario: ' + userText });

    // Add photo if present
    if (pumaiCurrentPhoto) {
      const base64Data = pumaiCurrentPhoto.split(',')[1]; // Remove data:image/...;base64, prefix
      const mimeType = pumaiCurrentPhoto.split(';')[0].split(':')[1] || 'image/jpeg';
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    contents.push({ role: 'user', parts });

    // Add chat history (last 6 messages)
    pumaiChatHistory.slice(-6).forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });

    // Re-add current message at end if we have history
    if (pumaiChatHistory.length > 0) {
      const currentParts = [{ text: userText }];
      if (pumaiCurrentPhoto) {
        const base64Data = pumaiCurrentPhoto.split(',')[1];
        const mimeType = pumaiCurrentPhoto.split(';')[0].split(':')[1] || 'image/jpeg';
        currentParts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
      }
      contents.push({ role: 'user', parts: currentParts });
    }

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    document.getElementById(typingId)?.remove();

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Error ${response.status}`);
    }

    const result = await response.json();
    const botReply = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta del modelo.';

    // Simple markdown-like formatting
    const formattedReply = botReply
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    addPumaiMessage(formattedReply, false);

    pumaiChatHistory.push(
      { role: 'user', content: userText },
      { role: 'assistant', content: botReply }
    );

    removePumaiPhoto();

    // Save conversation to DB (optional, non-blocking)
    if (currentUser) {
      sb.from('ai_conversations').insert([
        { user_id: currentUser.id, role: 'user', message: userText },
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

window.initPumAI = initPumAI;
window.sendPumaiMessage = sendPumaiMessage;
window.removePumaiPhoto = removePumaiPhoto;
