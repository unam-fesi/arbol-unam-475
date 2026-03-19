// ============================================================================
// AR Height Measurement - Camera-based tree height estimation
// ============================================================================

let arHeightData = {
  baseY: null,
  topY: null,
  distance: null,
  height: null
};

function openARHeightMeasure() {
  // Create fullscreen overlay with camera feed
  const overlay = document.createElement('div');
  overlay.id = 'ar-height-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: black;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  `;

  overlay.innerHTML = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; position: relative;">
      <!-- Camera Video/Canvas -->
      <video id="ar-height-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>
      <canvas id="ar-height-canvas" style="display: none;"></canvas>

      <!-- Overlay UI -->
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; pointer-events: none;">

        <!-- Top bar with title -->
        <div style="background: rgba(0, 0, 0, 0.7); color: white; padding: 1rem; text-align: center; pointer-events: auto;">
          <h2 style="margin: 0; font-size: 1.25rem;">📐 Medidor de Altura con Cámara</h2>
          <p style="margin: 0.5rem 0 0; font-size: 0.9rem; color: #ccc;" id="ar-height-step">Paso 1: Toca la BASE del árbol</p>
        </div>

        <!-- Center crosshair guide -->
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative;">
          <div style="
            width: 60px;
            height: 60px;
            border: 2px solid rgba(76, 175, 80, 0.8);
            border-radius: 50%;
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
          "></div>
          <div style="position: absolute; width: 40px; height: 2px; background: rgba(76, 175, 80, 0.8); top: 50%; left: 50%; transform: translate(-50%, -50%);"></div>
          <div style="position: absolute; width: 2px; height: 40px; background: rgba(76, 175, 80, 0.8); top: 50%; left: 50%; transform: translate(-50%, -50%);"></div>
        </div>

        <!-- Bottom info and controls -->
        <div style="background: rgba(0, 0, 0, 0.7); color: white; padding: 1.5rem; text-align: center; pointer-events: auto;">
          <p style="margin: 0 0 1rem 0; font-size: 0.95rem;" id="ar-height-instructions">
            Alinea la pantalla con la base del árbol y toca la pantalla para marcar.
          </p>

          <!-- Base and Top markers -->
          <div id="ar-height-markers" style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 1rem; font-size: 0.85rem;">
            <div id="ar-height-base-marker" style="padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.1); border-radius: 6px; border: 1px solid rgba(76, 175, 80, 0); transition: all 0.3s;">
              ⬜ Base: Sin marcar
            </div>
            <div id="ar-height-top-marker" style="padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.1); border-radius: 6px; border: 1px solid rgba(255, 193, 7, 0); transition: all 0.3s;">
              ⬜ Cima: Sin marcar
            </div>
          </div>

          <!-- Distance input (shown after both points marked) -->
          <div id="ar-height-distance-section" style="display: none; margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Distancia desde el árbol (metros):</label>
            <input type="number" id="ar-height-distance-input" placeholder="Ej: 5" min="0.1" max="100" step="0.1" style="
              width: 100%;
              max-width: 200px;
              padding: 0.75rem;
              border: none;
              border-radius: 6px;
              font-size: 1rem;
              text-align: center;
              background: white;
              color: black;
              box-sizing: border-box;
            ">
          </div>

          <!-- Action buttons -->
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button id="ar-height-reset-btn" onclick="arHeightReset()" style="
              background: #666;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.95rem;
              transition: all 0.3s;
              pointer-events: auto;
            " onmouseover="this.style.background='#888'" onmouseout="this.style.background='#666'">
              🔄 Reiniciar
            </button>
            <button id="ar-height-calculate-btn" onclick="arHeightCalculate()" style="
              background: #4CAF50;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.95rem;
              transition: all 0.3s;
              display: none;
              pointer-events: auto;
            " onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
              ✓ Calcular Altura
            </button>
            <button onclick="closeARHeightMeasure()" style="
              background: #d62828;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.95rem;
              transition: all 0.3s;
              pointer-events: auto;
            " onmouseover="this.style.background='#e74c3c'" onmouseout="this.style.background='#d62828'">
              ✕ Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Request camera access
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  }).then(stream => {
    const video = document.getElementById('ar-height-video');
    video.srcObject = stream;
    video.play();

    // Add click handlers to the video
    video.addEventListener('click', handleARHeightTap);
  }).catch(err => {
    console.error('Camera access error:', err);
    showToast('Error accediendo a la cámara', 'error');
    closeARHeightMeasure();
  });
}

function handleARHeightTap(event) {
  // Get click position relative to video
  const rect = event.target.getBoundingClientRect();
  const clickY = event.clientY - rect.top;
  const videoHeight = rect.height;

  if (arHeightData.baseY === null) {
    // Mark base point
    arHeightData.baseY = clickY;
    document.getElementById('ar-height-base-marker').innerHTML = '✅ Base: Marcada';
    document.getElementById('ar-height-base-marker').style.borderColor = 'rgba(76, 175, 80, 1)';
    document.getElementById('ar-height-step').textContent = 'Paso 2: Toca la CIMA del árbol';
    document.getElementById('ar-height-instructions').textContent = 'Alinea la pantalla con la cima del árbol y toca nuevamente.';
  } else if (arHeightData.topY === null) {
    // Mark top point
    arHeightData.topY = clickY;
    document.getElementById('ar-height-top-marker').innerHTML = '✅ Cima: Marcada';
    document.getElementById('ar-height-top-marker').style.borderColor = 'rgba(255, 193, 7, 1)';
    document.getElementById('ar-height-step').textContent = 'Paso 3: Ingresa la distancia';
    document.getElementById('ar-height-instructions').textContent = 'Mide tu distancia desde la base del árbol en metros.';
    document.getElementById('ar-height-distance-section').style.display = 'block';
    document.getElementById('ar-height-calculate-btn').style.display = 'inline-block';
    document.getElementById('ar-height-video').removeEventListener('click', handleARHeightTap);
  }
}

function arHeightReset() {
  arHeightData.baseY = null;
  arHeightData.topY = null;
  arHeightData.distance = null;
  arHeightData.height = null;

  document.getElementById('ar-height-base-marker').innerHTML = '⬜ Base: Sin marcar';
  document.getElementById('ar-height-base-marker').style.borderColor = 'rgba(76, 175, 80, 0)';
  document.getElementById('ar-height-top-marker').innerHTML = '⬜ Cima: Sin marcar';
  document.getElementById('ar-height-top-marker').style.borderColor = 'rgba(255, 193, 7, 0)';
  document.getElementById('ar-height-distance-section').style.display = 'none';
  document.getElementById('ar-height-distance-input').value = '';
  document.getElementById('ar-height-calculate-btn').style.display = 'none';
  document.getElementById('ar-height-step').textContent = 'Paso 1: Toca la BASE del árbol';
  document.getElementById('ar-height-instructions').textContent = 'Alinea la pantalla con la base del árbol y toca la pantalla para marcar.';

  const video = document.getElementById('ar-height-video');
  video.addEventListener('click', handleARHeightTap);
}

function arHeightCalculate() {
  const distanceInput = document.getElementById('ar-height-distance-input');
  const distance = parseFloat(distanceInput.value);

  if (!distance || distance <= 0) {
    showToast('Ingresa una distancia válida', 'warning');
    return;
  }

  if (arHeightData.baseY === null || arHeightData.topY === null) {
    showToast('Marca ambos puntos primero', 'warning');
    return;
  }

  // Get video dimensions
  const video = document.getElementById('ar-height-video');
  const videoHeight = video.offsetHeight;
  const centerY = videoHeight / 2;

  // Typical smartphone camera vertical FOV ~55-65°, use 60° as default
  const verticalFOV_deg = 60;
  const halfFOV_rad = (verticalFOV_deg / 2) * Math.PI / 180;

  // Pixels per radian: half the screen height corresponds to tan(halfFOV)
  // So: pixelsFromCenter / (videoHeight/2) = tan(angle) / tan(halfFOV)
  const halfHeight = videoHeight / 2;

  // Angle from horizontal for each point
  // Positive = above center (looking up), Negative = below center (looking down)
  // In screen coords: Y increases downward, so below center means baseY > centerY
  const baseAngle = Math.atan(((centerY - arHeightData.baseY) / halfHeight) * Math.tan(halfFOV_rad));
  const topAngle = Math.atan(((centerY - arHeightData.topY) / halfHeight) * Math.tan(halfFOV_rad));

  // Tree height in meters = distance × (tan(topAngle) - tan(baseAngle))
  const heightMeters = distance * (Math.tan(topAngle) - Math.tan(baseAngle));
  const calculatedHeightCm = Math.max(Math.abs(heightMeters) * 100, 10); // Convert to cm, min 10cm

  arHeightData.distance = distance;
  arHeightData.height = calculatedHeightCm;

  // Show result (in cm for the form)
  showARHeightResult(calculatedHeightCm);
}

function showARHeightResult(height) {
  const resultOverlay = document.createElement('div');
  resultOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  resultOverlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem;">📐</div>
      <h3 style="margin: 0 0 0.5rem 0; color: var(--text-dark);">Altura Estimada</h3>
      <div style="
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--primary);
        margin: 1rem 0;
      ">${height.toFixed(0)} cm</div>
      <p style="color: var(--text-light); margin: 0.5rem 0; font-size: 1rem;">
        ≈ ${(height / 100).toFixed(2)} metros
      </p>
      <p style="color: var(--text-light); margin: 0.5rem 0; font-size: 0.9rem;">
        Distancia usada: ${arHeightData.distance.toFixed(1)} m
      </p>
      <p style="color: var(--text-light); margin: 1rem 0; font-size: 0.85rem; font-style: italic;">
        Nota: Esta es una estimación aproximada basada en óptica. Para mediciones precisas, usa un aparato especializado.
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem;">
        <button onclick="arHeightUseValue(${height.toFixed(1)})" style="
          background: var(--primary);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.3s;
        " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          ✓ Usar Este Valor
        </button>
        <button onclick="arHeightRetry()" style="
          background: #666;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.3s;
        " onmouseover="this.style.background='#888'" onmouseout="this.style.background='#666'">
          🔄 Reintentar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(resultOverlay);
}

function arHeightUseValue(height) {
  // Fill the height input field in the measurement form
  const heightInput = document.getElementById('meas-height');
  if (heightInput) {
    heightInput.value = height;
    // Trigger change event to update any listeners
    heightInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Close everything
  document.querySelectorAll('[id^="ar-height"]').forEach(el => {
    if (el.id.includes('overlay') || el.id.includes('result')) {
      el.remove();
    }
  });

  // Clean up and close
  const overlay = document.getElementById('ar-height-overlay');
  if (overlay) {
    const video = overlay.querySelector('#ar-height-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    overlay.remove();
  }

  // Close result overlay too
  const resultOverlays = document.querySelectorAll('[style*="z-index: 10000"]');
  resultOverlays.forEach(el => el.remove());

  showToast('Altura cargada en el formulario', 'success');
}

function arHeightRetry() {
  // Remove result overlay
  const resultOverlays = document.querySelectorAll('[style*="z-index: 10000"]');
  resultOverlays.forEach(el => el.remove());

  // Reset and continue
  arHeightReset();
}

function closeARHeightMeasure() {
  const overlay = document.getElementById('ar-height-overlay');
  if (overlay) {
    const video = overlay.querySelector('#ar-height-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    overlay.remove();
  }

  // Also remove any result overlays
  const resultOverlays = document.querySelectorAll('[style*="z-index: 10000"]');
  resultOverlays.forEach(el => el.remove());
}

// Expose to global scope
window.openARHeightMeasure = openARHeightMeasure;
