// ============================================================================
// AR Height Measurement - Camera-based tree height estimation
// Live tracking with gyroscope + canvas overlay
// ============================================================================

// Polyfill: roundRect for older mobile browsers
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    var tl = r[0] || 0;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tl, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tl);
    this.lineTo(x + w, y + h - tl);
    this.quadraticCurveTo(x + w, y + h, x + w - tl, y + h);
    this.lineTo(x + tl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - tl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

let arHeightData = {
  baseY: null,
  topY: null,
  basePitch: null,
  currentPitch: null,
  distance: null,
  height: null,
  stream: null,
  animFrameId: null,
  orientationHandler: null,
  useGyroscope: false,
  step: 0, // 0=distance, 1=mark base, 2=live tracking, 3=done
  liveHeight: 0,
  baseScreenX: null,
  baseScreenY: null,
};

// ============================================================================
// Main entry point
// ============================================================================
function openARHeightMeasure() {
  // Reset all state
  arHeightData = {
    baseY: null, topY: null, basePitch: null, currentPitch: null,
    distance: null, height: null, stream: null, animFrameId: null,
    orientationHandler: null, useGyroscope: false, step: 0,
    liveHeight: 0, baseScreenX: null, baseScreenY: null,
  };

  const overlay = document.createElement('div');
  overlay.id = 'ar-height-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: black; z-index: 9999;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  `;

  overlay.innerHTML = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; position: relative;">
      <!-- Camera feed -->
      <video id="ar-height-video" autoplay playsinline muted
        style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;">
      </video>

      <!-- Canvas overlay for drawing dotted line + measurements -->
      <canvas id="ar-height-canvas"
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;">
      </canvas>

      <!-- UI Layer -->
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                  display: flex; flex-direction: column; pointer-events: none; z-index: 2;">

        <!-- Top bar -->
        <div style="background: rgba(0,0,0,0.75); color: white; padding: 0.75rem 1rem; text-align: center; pointer-events: auto;">
          <h2 style="margin: 0; font-size: 1.15rem;">📐 Medidor de Altura AR</h2>
          <p style="margin: 0.4rem 0 0; font-size: 0.85rem; color: #aaa;" id="ar-height-step">
            Paso 1: Ingresa tu distancia al árbol
          </p>
        </div>

        <!-- Center area: crosshair + live measurement label -->
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative;">
          <!-- Crosshair -->
          <div id="ar-crosshair" style="
            width: 50px; height: 50px;
            border: 2px solid rgba(76, 175, 80, 0.8);
            border-radius: 50%;
            box-shadow: 0 0 15px rgba(76, 175, 80, 0.4);
            position: absolute;
          "></div>
          <div style="position: absolute; width: 30px; height: 2px; background: rgba(76, 175, 80, 0.8);"></div>
          <div style="position: absolute; width: 2px; height: 30px; background: rgba(76, 175, 80, 0.8);"></div>

          <!-- Live measurement floating label (hidden initially) -->
          <div id="ar-live-measurement" style="
            display: none;
            position: absolute;
            top: 40%;
            right: 1rem;
            background: rgba(0,0,0,0.8);
            color: #4CAF50;
            padding: 0.6rem 1rem;
            border-radius: 8px;
            font-size: 1.4rem;
            font-weight: 700;
            border: 2px solid rgba(76,175,80,0.6);
            text-shadow: 0 0 10px rgba(76,175,80,0.5);
            pointer-events: none;
            z-index: 5;
          ">
            <div id="ar-live-height-value" style="font-size: 1.6rem;">0 cm</div>
            <div style="font-size: 0.75rem; color: #aaa; margin-top: 2px;">≈ <span id="ar-live-meters-value">0.00</span> m</div>
          </div>
        </div>

        <!-- Bottom panel -->
        <div id="ar-bottom-panel" style="background: rgba(0,0,0,0.8); color: white; padding: 1.25rem; text-align: center; pointer-events: auto;">

          <!-- Step 0: Distance input -->
          <div id="ar-distance-step">
            <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem;">
              ¿A cuántos metros estás del árbol?
            </p>
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 1rem;">
              <input type="number" id="ar-height-distance-input" placeholder="Ej: 5"
                min="0.5" max="100" step="0.5" value=""
                style="
                  width: 120px; padding: 0.75rem; border: 2px solid #4CAF50;
                  border-radius: 8px; font-size: 1.1rem; text-align: center;
                  background: rgba(255,255,255,0.95); color: #333;
                  box-sizing: border-box;
                ">
              <span style="font-size: 1rem; color: #ccc;">metros</span>
            </div>
            <button id="ar-distance-continue-btn" onclick="arHeightSetDistance()" style="
              background: #4CAF50; color: white; border: none;
              padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer;
              font-size: 1rem; font-weight: 600; transition: all 0.3s;
            ">
              Continuar →
            </button>
          </div>

          <!-- Step 1+: Markers + buttons (hidden initially) -->
          <div id="ar-tracking-controls" style="display: none;">
            <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem;" id="ar-height-instructions">
              Apunta a la BASE del árbol y toca la pantalla.
            </p>

            <!-- Markers row -->
            <div style="display: flex; gap: 0.75rem; justify-content: center; margin-bottom: 0.75rem; font-size: 0.8rem;">
              <div id="ar-height-base-marker" style="
                padding: 0.4rem 0.75rem; background: rgba(255,255,255,0.08);
                border-radius: 6px; border: 1px solid rgba(76,175,80,0);
                transition: all 0.3s;
              ">⬜ Base: Sin marcar</div>
              <div id="ar-height-top-marker" style="
                padding: 0.4rem 0.75rem; background: rgba(255,255,255,0.08);
                border-radius: 6px; border: 1px solid rgba(255,193,7,0);
                transition: all 0.3s;
              ">⬜ Cima: Sin marcar</div>
            </div>

            <!-- Distance badge -->
            <div style="margin-bottom: 0.75rem;">
              <span style="background: rgba(76,175,80,0.2); color: #4CAF50; padding: 0.3rem 0.75rem; border-radius: 20px; font-size: 0.8rem;">
                📏 Distancia: <span id="ar-distance-badge">?</span> m
              </span>
            </div>

            <!-- Buttons -->
            <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
              <button onclick="arHeightReset()" style="
                background: #555; color: white; border: none;
                padding: 0.6rem 1.2rem; border-radius: 6px;
                cursor: pointer; font-size: 0.9rem; transition: all 0.3s;
              ">🔄 Reiniciar</button>
              <button onclick="closeARHeightMeasure()" style="
                background: #d62828; color: white; border: none;
                padding: 0.6rem 1.2rem; border-radius: 6px;
                cursor: pointer; font-size: 0.9rem; transition: all 0.3s;
              ">✕ Cerrar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Base point marker (placed on screen) -->
      <div id="ar-base-dot" style="
        display: none; position: absolute; z-index: 3;
        width: 16px; height: 16px; border-radius: 50%;
        background: #4CAF50; border: 2px solid white;
        box-shadow: 0 0 12px rgba(76,175,80,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none;
      "></div>

      <!-- Top point marker -->
      <div id="ar-top-dot" style="
        display: none; position: absolute; z-index: 3;
        width: 16px; height: 16px; border-radius: 50%;
        background: #FFC107; border: 2px solid white;
        box-shadow: 0 0 12px rgba(255,193,7,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none;
      "></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Start camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(function(stream) {
    arHeightData.stream = stream;
    var video = document.getElementById('ar-height-video');
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    var p = video.play();
    if (p !== undefined) p.catch(function(e) { console.warn('AR play failed:', e.message); });

    // Try to get gyroscope access
    arHeightRequestOrientation();
  }).catch(function(err) {
    console.error('Camera error:', err);
    showToast('Error accediendo a la cámara. Verifica los permisos.', 'error');
    closeARHeightMeasure();
  });
}

// ============================================================================
// Device Orientation (Gyroscope) setup
// ============================================================================
function arHeightRequestOrientation() {
  // iOS 13+ requires explicit permission
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // We'll request permission when user interacts (tap), since iOS requires user gesture
    arHeightData.useGyroscope = false; // will enable after permission
  } else if ('DeviceOrientationEvent' in window) {
    // Android / desktop — try listening
    arHeightStartOrientationListener();
  }
}

function arHeightRequestiOSPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') {
        arHeightStartOrientationListener();
      }
    }).catch(function(e) {
      console.warn('Orientation permission denied:', e);
    });
  }
}

function arHeightStartOrientationListener() {
  var handler = function(e) {
    if (e.beta !== null) {
      arHeightData.useGyroscope = true;
      // beta: front-back tilt in degrees (-180 to 180)
      // When phone is vertical, beta ≈ 90. Pointing up: beta < 90. Pointing down: beta > 90.
      arHeightData.currentPitch = e.beta;
    }
  };
  window.addEventListener('deviceorientation', handler);
  arHeightData.orientationHandler = handler;
}

// ============================================================================
// Step 0: Set distance
// ============================================================================
function arHeightSetDistance() {
  var input = document.getElementById('ar-height-distance-input');
  var dist = parseFloat(input.value);
  if (!dist || dist < 0.5) {
    showToast('Ingresa una distancia válida (mínimo 0.5 m)', 'warning');
    return;
  }

  arHeightData.distance = dist;
  arHeightData.step = 1;

  // iOS: request orientation permission on user gesture
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    arHeightRequestiOSPermission();
  }

  // Update UI
  document.getElementById('ar-distance-step').style.display = 'none';
  document.getElementById('ar-tracking-controls').style.display = 'block';
  document.getElementById('ar-distance-badge').textContent = dist.toFixed(1);
  document.getElementById('ar-height-step').textContent = 'Paso 2: Toca la BASE del árbol';

  // Enable tap on video
  var video = document.getElementById('ar-height-video');
  video.style.pointerEvents = 'auto';
  video.addEventListener('touchend', handleARHeightTap);
  video.addEventListener('click', handleARHeightTap);

  // Setup canvas size
  arHeightResizeCanvas();
  window.addEventListener('resize', arHeightResizeCanvas);
}

// ============================================================================
// Canvas resize helper
// ============================================================================
function arHeightResizeCanvas() {
  var canvas = document.getElementById('ar-height-canvas');
  if (canvas) {
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  }
}

// ============================================================================
// Tap handler (marks base or top)
// ============================================================================
function handleARHeightTap(event) {
  if (event.type === 'touchend') event.preventDefault();

  var rect = event.target.getBoundingClientRect();
  var clientX, clientY;
  if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  if (arHeightData.step === 1) {
    // === MARK BASE ===
    arHeightData.baseY = clientY - rect.top;
    arHeightData.baseScreenX = clientX;
    arHeightData.baseScreenY = clientY;

    // Record gyroscope pitch at base
    if (arHeightData.useGyroscope && arHeightData.currentPitch !== null) {
      arHeightData.basePitch = arHeightData.currentPitch;
    }

    // Show base dot on screen
    var baseDot = document.getElementById('ar-base-dot');
    baseDot.style.display = 'block';
    baseDot.style.left = clientX + 'px';
    baseDot.style.top = clientY + 'px';

    // Update UI
    document.getElementById('ar-height-base-marker').innerHTML = '✅ Base: Marcada';
    document.getElementById('ar-height-base-marker').style.borderColor = 'rgba(76,175,80,1)';
    document.getElementById('ar-height-step').textContent = 'Paso 3: Apunta a la CIMA y toca';
    document.getElementById('ar-height-instructions').textContent =
      'Mueve la cámara hacia arriba. La línea y medida se actualizan en tiempo real. Toca para fijar.';

    // Show live measurement label
    document.getElementById('ar-live-measurement').style.display = 'block';

    arHeightData.step = 2;

    // Start live tracking animation
    arHeightStartLiveTracking();

  } else if (arHeightData.step === 2) {
    // === MARK TOP ===
    arHeightData.topY = clientY - rect.top;
    arHeightData.step = 3;

    // Show top dot
    var topDot = document.getElementById('ar-top-dot');
    topDot.style.display = 'block';
    topDot.style.left = clientX + 'px';
    topDot.style.top = clientY + 'px';

    // Update UI
    document.getElementById('ar-height-top-marker').innerHTML = '✅ Cima: Marcada';
    document.getElementById('ar-height-top-marker').style.borderColor = 'rgba(255,193,7,1)';

    // Stop live tracking
    arHeightStopLiveTracking();

    // Remove tap listeners
    var video = document.getElementById('ar-height-video');
    video.removeEventListener('click', handleARHeightTap);
    video.removeEventListener('touchend', handleARHeightTap);

    // Calculate final height
    var finalHeight = arHeightCalculateFinal(clientY - rect.top);
    arHeightData.height = finalHeight;

    // Draw final line on canvas
    arHeightDrawFinalLine(clientX, clientY);

    // Show result
    showARHeightResult(finalHeight);
  }
}

// ============================================================================
// Live tracking: draws dotted line + updates measurement in real-time
// ============================================================================
function arHeightStartLiveTracking() {
  var canvas = document.getElementById('ar-height-canvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;

  function frame() {
    if (arHeightData.step !== 2) return;

    var cw = canvas.width;
    var ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Base point (in canvas coordinates)
    var baseX = arHeightData.baseScreenX * dpr;
    var baseY = arHeightData.baseScreenY * dpr;

    // Current target: center of screen (crosshair position)
    var centerX = cw / 2;
    var centerY = ch / 2;

    // Calculate current live height
    var liveHeight = arHeightCalculateLive(ch / dpr);

    arHeightData.liveHeight = liveHeight;

    // Update live measurement display
    var absHeight = Math.abs(liveHeight);
    document.getElementById('ar-live-height-value').textContent =
      absHeight >= 100 ? absHeight.toFixed(0) + ' cm' : absHeight.toFixed(1) + ' cm';
    document.getElementById('ar-live-meters-value').textContent = (absHeight / 100).toFixed(2);

    // Draw dotted line from base to crosshair center
    ctx.save();
    ctx.setLineDash([10 * dpr, 8 * dpr]);
    ctx.lineDashOffset = -(Date.now() / 50) % (18 * dpr); // Animated march
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.9)';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();

    // Draw glow effect
    ctx.setLineDash([10 * dpr, 8 * dpr]);
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.lineWidth = 8 * dpr;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
    ctx.restore();

    // Draw base point circle (pulsing)
    var pulse = 1 + 0.15 * Math.sin(Date.now() / 300);
    ctx.beginPath();
    ctx.arc(baseX, baseY, 10 * dpr * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    // Draw midpoint measurement label on the line
    var midX = (baseX + centerX) / 2;
    var midY = (baseY + centerY) / 2;
    var labelText = absHeight >= 100 ? absHeight.toFixed(0) + ' cm' : absHeight.toFixed(1) + ' cm';

    // Background for label
    ctx.font = 'bold ' + (14 * dpr) + 'px sans-serif';
    var metrics = ctx.measureText(labelText);
    var pad = 6 * dpr;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    var rr = 4 * dpr;
    var lx = midX - metrics.width / 2 - pad;
    var ly = midY - 10 * dpr - pad;
    var lw = metrics.width + pad * 2;
    var lh = 20 * dpr + pad;
    ctx.roundRect(lx, ly, lw, lh, rr);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#4CAF50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, midX, midY);

    arHeightData.animFrameId = requestAnimationFrame(frame);
  }

  arHeightData.animFrameId = requestAnimationFrame(frame);
}

function arHeightStopLiveTracking() {
  if (arHeightData.animFrameId) {
    cancelAnimationFrame(arHeightData.animFrameId);
    arHeightData.animFrameId = null;
  }
}

// ============================================================================
// Height calculation (live + final)
// ============================================================================
function arHeightCalculateLive(viewportHeight) {
  var distance = arHeightData.distance;
  if (!distance) return 0;

  // If gyroscope is available, use pitch angles
  if (arHeightData.useGyroscope && arHeightData.basePitch !== null && arHeightData.currentPitch !== null) {
    return arHeightCalcFromGyroscope(arHeightData.basePitch, arHeightData.currentPitch, distance);
  }

  // Fallback: use screen Y position (base vs center crosshair)
  var centerY = viewportHeight / 2;
  return arHeightCalcFromScreen(arHeightData.baseY, centerY, viewportHeight, distance);
}

function arHeightCalculateFinal(topScreenY) {
  var distance = arHeightData.distance;
  if (!distance) return 10;

  var video = document.getElementById('ar-height-video');
  var viewportHeight = video.offsetHeight;

  // If gyroscope available, use pitch at base vs current pitch at top tap
  if (arHeightData.useGyroscope && arHeightData.basePitch !== null && arHeightData.currentPitch !== null) {
    var h = arHeightCalcFromGyroscope(arHeightData.basePitch, arHeightData.currentPitch, distance);
    return Math.max(Math.abs(h), 1);
  }

  // Fallback: screen-based
  var h = arHeightCalcFromScreen(arHeightData.baseY, topScreenY, viewportHeight, distance);
  return Math.max(Math.abs(h), 1);
}

// Gyroscope-based: uses device pitch angle difference
function arHeightCalcFromGyroscope(basePitch, currentPitch, distanceMeters) {
  // beta: 90° = phone vertical, <90 = tilted back (looking up), >90 = tilted forward (looking down)
  // Angle from horizontal = 90 - beta
  // When looking up, angle is positive; looking down, negative
  var baseAngleRad = (90 - basePitch) * Math.PI / 180;
  var currentAngleRad = (90 - currentPitch) * Math.PI / 180;

  // Height = distance × (tan(topAngle) - tan(baseAngle))
  var heightMeters = distanceMeters * (Math.tan(currentAngleRad) - Math.tan(baseAngleRad));
  return heightMeters * 100; // cm
}

// Screen-based fallback: converts pixel positions to angles via estimated FOV
function arHeightCalcFromScreen(baseScreenY, targetScreenY, viewportHeight, distanceMeters) {
  var verticalFOV_deg = 60;
  var halfFOV_rad = (verticalFOV_deg / 2) * Math.PI / 180;
  var centerY = viewportHeight / 2;
  var halfHeight = viewportHeight / 2;

  var baseAngle = Math.atan(((centerY - baseScreenY) / halfHeight) * Math.tan(halfFOV_rad));
  var topAngle = Math.atan(((centerY - targetScreenY) / halfHeight) * Math.tan(halfFOV_rad));

  var heightMeters = distanceMeters * (Math.tan(topAngle) - Math.tan(baseAngle));
  return heightMeters * 100; // cm
}

// ============================================================================
// Draw final locked line
// ============================================================================
function arHeightDrawFinalLine(topX, topY) {
  var canvas = document.getElementById('ar-height-canvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;

  var baseX = arHeightData.baseScreenX * dpr;
  var baseY = arHeightData.baseScreenY * dpr;
  var tX = topX * dpr;
  var tY = topY * dpr;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Solid line (locked)
  ctx.save();
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 3 * dpr;
  ctx.shadowColor = 'rgba(76, 175, 80, 0.5)';
  ctx.shadowBlur = 10 * dpr;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(tX, tY);
  ctx.stroke();
  ctx.restore();

  // Base circle
  ctx.beginPath();
  ctx.arc(baseX, baseY, 10 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#4CAF50';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();

  // Top circle
  ctx.beginPath();
  ctx.arc(tX, tY, 10 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#FFC107';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();

  // Final measurement label at midpoint
  var midX = (baseX + tX) / 2;
  var midY = (baseY + tY) / 2;
  var h = arHeightData.height || 0;
  var label = h >= 100 ? h.toFixed(0) + ' cm' : h.toFixed(1) + ' cm';
  ctx.font = 'bold ' + (16 * dpr) + 'px sans-serif';
  var metrics = ctx.measureText(label);
  var pad = 8 * dpr;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.roundRect(midX - metrics.width / 2 - pad, midY - 12 * dpr - pad, metrics.width + pad * 2, 24 * dpr + pad, 6 * dpr);
  ctx.fill();

  ctx.fillStyle = '#4CAF50';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, midX, midY);
}

// ============================================================================
// Result display
// ============================================================================
function showARHeightResult(height) {
  var resultOverlay = document.createElement('div');
  resultOverlay.id = 'ar-height-result-overlay';
  resultOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); display: flex;
    align-items: center; justify-content: center; z-index: 10000;
  `;

  var heightDisplay = height >= 100 ? height.toFixed(0) : height.toFixed(1);

  resultOverlay.innerHTML = `
    <div style="
      background: white; border-radius: 16px; padding: 2rem;
      text-align: center; max-width: 380px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    ">
      <div style="font-size: 3rem; margin-bottom: 0.75rem;">📐</div>
      <h3 style="margin: 0 0 0.5rem 0; color: #333;">Altura Estimada</h3>
      <div style="
        font-size: 2.5rem; font-weight: 700; color: #4CAF50; margin: 0.75rem 0;
      ">${heightDisplay} cm</div>
      <p style="color: #888; margin: 0.3rem 0; font-size: 1rem;">
        ≈ ${(height / 100).toFixed(2)} metros
      </p>
      <p style="color: #888; margin: 0.3rem 0; font-size: 0.85rem;">
        📏 Distancia usada: ${arHeightData.distance.toFixed(1)} m
        ${arHeightData.useGyroscope ? '&nbsp; | &nbsp; 🔄 Giroscopio: Sí' : '&nbsp; | &nbsp; 📱 Giroscopio: No'}
      </p>
      <p style="color: #aaa; margin: 1rem 0 0; font-size: 0.8rem; font-style: italic;">
        Estimación óptica aproximada. Para mayor precisión, usa un clinómetro o hipsómetro.
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem;">
        <button onclick="arHeightUseValue(${height.toFixed(1)})" style="
          background: #4CAF50; color: white; border: none;
          padding: 0.75rem 1.5rem; border-radius: 8px;
          cursor: pointer; font-size: 0.95rem; font-weight: 600;
        ">✓ Usar Este Valor</button>
        <button onclick="arHeightRetry()" style="
          background: #666; color: white; border: none;
          padding: 0.75rem 1.5rem; border-radius: 8px;
          cursor: pointer; font-size: 0.95rem;
        ">🔄 Reintentar</button>
      </div>
    </div>
  `;

  document.body.appendChild(resultOverlay);
}

// ============================================================================
// Use value — fill form field
// ============================================================================
function arHeightUseValue(height) {
  var heightInput = document.getElementById('meas-height');
  if (heightInput) {
    heightInput.value = height;
    heightInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  showToast('Altura cargada en el formulario', 'success');
}

// ============================================================================
// Retry — remove result, reset to step 1
// ============================================================================
function arHeightRetry() {
  var result = document.getElementById('ar-height-result-overlay');
  if (result) result.remove();
  arHeightReset();
}

// ============================================================================
// Reset — go back to step 1 (base marking) keeping the distance
// ============================================================================
function arHeightReset() {
  arHeightStopLiveTracking();

  arHeightData.baseY = null;
  arHeightData.topY = null;
  arHeightData.basePitch = null;
  arHeightData.height = null;
  arHeightData.liveHeight = 0;
  arHeightData.baseScreenX = null;
  arHeightData.baseScreenY = null;
  arHeightData.step = 1;

  // Clear canvas
  var canvas = document.getElementById('ar-height-canvas');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Hide dots
  var baseDot = document.getElementById('ar-base-dot');
  var topDot = document.getElementById('ar-top-dot');
  if (baseDot) baseDot.style.display = 'none';
  if (topDot) topDot.style.display = 'none';

  // Hide live measurement
  var liveMeas = document.getElementById('ar-live-measurement');
  if (liveMeas) liveMeas.style.display = 'none';

  // Reset markers
  document.getElementById('ar-height-base-marker').innerHTML = '⬜ Base: Sin marcar';
  document.getElementById('ar-height-base-marker').style.borderColor = 'rgba(76,175,80,0)';
  document.getElementById('ar-height-top-marker').innerHTML = '⬜ Cima: Sin marcar';
  document.getElementById('ar-height-top-marker').style.borderColor = 'rgba(255,193,7,0)';

  document.getElementById('ar-height-step').textContent = 'Paso 2: Toca la BASE del árbol';
  document.getElementById('ar-height-instructions').textContent = 'Apunta a la BASE del árbol y toca la pantalla.';

  // Re-enable tap listeners
  var video = document.getElementById('ar-height-video');
  if (video) {
    video.addEventListener('touchend', handleARHeightTap);
    video.addEventListener('click', handleARHeightTap);
  }

  // Remove result overlay if present
  var result = document.getElementById('ar-height-result-overlay');
  if (result) result.remove();
}

// ============================================================================
// Close — cleanup everything
// ============================================================================
function closeARHeightMeasure() {
  arHeightStopLiveTracking();

  // Stop gyroscope listener
  if (arHeightData.orientationHandler) {
    window.removeEventListener('deviceorientation', arHeightData.orientationHandler);
    arHeightData.orientationHandler = null;
  }

  window.removeEventListener('resize', arHeightResizeCanvas);

  // Stop camera
  if (arHeightData.stream) {
    arHeightData.stream.getTracks().forEach(function(t) { t.stop(); });
    arHeightData.stream = null;
  }

  var overlay = document.getElementById('ar-height-overlay');
  if (overlay) {
    var video = overlay.querySelector('#ar-height-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(function(t) { t.stop(); });
    }
    overlay.remove();
  }

  // Remove result overlay
  var result = document.getElementById('ar-height-result-overlay');
  if (result) result.remove();
}

// Expose to global scope
window.openARHeightMeasure = openARHeightMeasure;
