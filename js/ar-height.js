// ============================================================================
// AR Height Measurement - Camera-based tree height estimation
// Live tracking with gyroscope + canvas overlay
// ============================================================================

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
  // Base position stored as fraction of overlay (0–1) for resolution independence
  baseFracX: null,
  baseFracY: null,
};

// ============================================================================
// Main entry point
// ============================================================================
function openARHeightMeasure() {
  arHeightData = {
    baseY: null, topY: null, basePitch: null, currentPitch: null,
    distance: null, height: null, stream: null, animFrameId: null,
    orientationHandler: null, useGyroscope: false, step: 0,
    liveHeight: 0, baseFracX: null, baseFracY: null,
  };

  var overlay = document.createElement('div');
  overlay.id = 'ar-height-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'background:#000;z-index:9999;display:flex;flex-direction:column;';

  overlay.innerHTML =
    '<div id="ar-height-container" style="position:relative;width:100%;height:100%;overflow:hidden;">' +

      // Camera feed
      '<video id="ar-height-video" autoplay playsinline muted ' +
        'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +

      // Canvas overlay — sits on top of video
      '<canvas id="ar-height-canvas" ' +
        'style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></canvas>' +

      // Base dot
      '<div id="ar-base-dot" style="display:none;position:absolute;z-index:4;' +
        'width:18px;height:18px;border-radius:50%;background:#4CAF50;border:2px solid #fff;' +
        'box-shadow:0 0 12px rgba(76,175,80,0.8);transform:translate(-50%,-50%);pointer-events:none;"></div>' +

      // Top dot
      '<div id="ar-top-dot" style="display:none;position:absolute;z-index:4;' +
        'width:18px;height:18px;border-radius:50%;background:#FFC107;border:2px solid #fff;' +
        'box-shadow:0 0 12px rgba(255,193,7,0.8);transform:translate(-50%,-50%);pointer-events:none;"></div>' +

      // UI Layer (on top of canvas, pointer-events:none by default)
      '<div style="position:absolute;top:0;left:0;width:100%;height:100%;' +
        'display:flex;flex-direction:column;pointer-events:none;z-index:5;">' +

        // Top bar
        '<div style="background:rgba(0,0,0,0.75);color:#fff;padding:0.75rem 1rem;text-align:center;pointer-events:auto;">' +
          '<h2 style="margin:0;font-size:1.15rem;">📐 Medidor de Altura AR</h2>' +
          '<p id="ar-height-step" style="margin:0.4rem 0 0;font-size:0.85rem;color:#aaa;">' +
            'Paso 1: Ingresa tu distancia al árbol</p>' +
        '</div>' +

        // Center area (crosshair + live label) — pointer-events:none so taps go to video
        '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;">' +
          // Crosshair
          '<div style="position:absolute;width:50px;height:50px;border:2px solid rgba(76,175,80,0.8);' +
            'border-radius:50%;box-shadow:0 0 15px rgba(76,175,80,0.4);"></div>' +
          '<div style="position:absolute;width:30px;height:2px;background:rgba(76,175,80,0.8);"></div>' +
          '<div style="position:absolute;width:2px;height:30px;background:rgba(76,175,80,0.8);"></div>' +
          // Live measurement floating label
          '<div id="ar-live-measurement" style="display:none;position:absolute;top:35%;right:1rem;' +
            'background:rgba(0,0,0,0.85);color:#4CAF50;padding:0.6rem 1rem;border-radius:8px;' +
            'font-size:1.4rem;font-weight:700;border:2px solid rgba(76,175,80,0.6);' +
            'text-shadow:0 0 10px rgba(76,175,80,0.5);z-index:6;">' +
            '<div id="ar-live-height-value" style="font-size:1.6rem;">0 cm</div>' +
            '<div style="font-size:0.75rem;color:#aaa;margin-top:2px;">≈ <span id="ar-live-meters-value">0.00</span> m</div>' +
          '</div>' +
        '</div>' +

        // Bottom panel
        '<div id="ar-bottom-panel" style="background:rgba(0,0,0,0.85);color:#fff;padding:1.25rem;text-align:center;pointer-events:auto;">' +

          // Step 0: Distance
          '<div id="ar-distance-step">' +
            '<p style="margin:0 0 0.75rem;font-size:0.9rem;">¿A cuántos metros estás del árbol?</p>' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;margin-bottom:1rem;">' +
              '<input type="number" id="ar-height-distance-input" placeholder="Ej: 5" ' +
                'min="0.5" max="100" step="0.5" style="width:120px;padding:0.75rem;border:2px solid #4CAF50;' +
                'border-radius:8px;font-size:1.1rem;text-align:center;background:rgba(255,255,255,0.95);color:#333;">' +
              '<span style="font-size:1rem;color:#ccc;">metros</span>' +
            '</div>' +
            '<button onclick="arHeightSetDistance()" style="background:#4CAF50;color:#fff;border:none;' +
              'padding:0.75rem 2rem;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;">Continuar →</button>' +
          '</div>' +

          // Step 1+: Tracking controls
          '<div id="ar-tracking-controls" style="display:none;">' +
            '<p id="ar-height-instructions" style="margin:0 0 0.75rem;font-size:0.9rem;">' +
              'Apunta a la BASE del árbol y toca la pantalla.</p>' +
            '<div style="display:flex;gap:0.75rem;justify-content:center;margin-bottom:0.75rem;font-size:0.8rem;">' +
              '<div id="ar-height-base-marker" style="padding:0.4rem 0.75rem;background:rgba(255,255,255,0.08);' +
                'border-radius:6px;border:1px solid rgba(76,175,80,0);">⬜ Base: Sin marcar</div>' +
              '<div id="ar-height-top-marker" style="padding:0.4rem 0.75rem;background:rgba(255,255,255,0.08);' +
                'border-radius:6px;border:1px solid rgba(255,193,7,0);">⬜ Cima: Sin marcar</div>' +
            '</div>' +
            '<div style="margin-bottom:0.75rem;">' +
              '<span style="background:rgba(76,175,80,0.2);color:#4CAF50;padding:0.3rem 0.75rem;border-radius:20px;font-size:0.8rem;">' +
                '📏 Distancia: <span id="ar-distance-badge">?</span> m</span>' +
            '</div>' +
            '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">' +
              '<button onclick="arHeightReset()" style="background:#555;color:#fff;border:none;' +
                'padding:0.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:0.9rem;">🔄 Reiniciar</button>' +
              '<button onclick="closeARHeightMeasure()" style="background:#d62828;color:#fff;border:none;' +
                'padding:0.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:0.9rem;">✕ Cerrar</button>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Start camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(function(stream) {
    arHeightData.stream = stream;
    var video = document.getElementById('ar-height-video');
    if (!video) return;
    video.srcObject = stream;
    var p = video.play();
    if (p && p.catch) p.catch(function(e) { console.warn('AR play:', e.message); });
    arHeightRequestOrientation();
  }).catch(function(err) {
    console.error('Camera error:', err);
    if (typeof showToast === 'function') showToast('Error accediendo a la cámara. Verifica los permisos.', 'error');
    closeARHeightMeasure();
  });
}

// ============================================================================
// Device Orientation (Gyroscope)
// ============================================================================
function arHeightRequestOrientation() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    arHeightData.useGyroscope = false; // wait for user gesture
  } else if ('DeviceOrientationEvent' in window) {
    arHeightStartOrientationListener();
  }
}

function arHeightRequestiOSPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') arHeightStartOrientationListener();
    }).catch(function() {});
  }
}

function arHeightStartOrientationListener() {
  var handler = function(e) {
    if (e.beta !== null) {
      arHeightData.useGyroscope = true;
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
  var dist = parseFloat(document.getElementById('ar-height-distance-input').value);
  if (!dist || dist < 0.5) {
    if (typeof showToast === 'function') showToast('Ingresa una distancia válida (mínimo 0.5 m)', 'warning');
    return;
  }

  arHeightData.distance = dist;
  arHeightData.step = 1;

  // iOS: request gyroscope on user gesture
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    arHeightRequestiOSPermission();
  }

  // UI
  document.getElementById('ar-distance-step').style.display = 'none';
  document.getElementById('ar-tracking-controls').style.display = 'block';
  document.getElementById('ar-distance-badge').textContent = dist.toFixed(1);
  document.getElementById('ar-height-step').textContent = 'Paso 2: Toca la BASE del árbol';

  // Enable tap on container (not just video, to avoid event issues)
  var container = document.getElementById('ar-height-container');
  container.addEventListener('touchend', handleARHeightTap, false);
  container.addEventListener('click', handleARHeightTap, false);
}

// ============================================================================
// Ensure canvas buffer matches display size
// ============================================================================
function arHeightSyncCanvas() {
  var canvas = document.getElementById('ar-height-canvas');
  if (!canvas) return null;

  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var needW = Math.round(rect.width * dpr);
  var needH = Math.round(rect.height * dpr);

  // Only resize if difference is significant (>5px) to avoid flicker.
  // Setting canvas.width/height CLEARS the canvas, so we avoid doing it every frame.
  if (Math.abs(canvas.width - needW) > 5 || Math.abs(canvas.height - needH) > 5) {
    canvas.width = needW;
    canvas.height = needH;
  }
  return canvas;
}

// ============================================================================
// Get position relative to container (as fraction 0-1)
// ============================================================================
function arHeightGetPos(event) {
  var container = document.getElementById('ar-height-container');
  var rect = container.getBoundingClientRect();
  var cx, cy;
  if (event.changedTouches && event.changedTouches.length > 0) {
    cx = event.changedTouches[0].clientX;
    cy = event.changedTouches[0].clientY;
  } else {
    cx = event.clientX;
    cy = event.clientY;
  }
  return {
    fracX: (cx - rect.left) / rect.width,
    fracY: (cy - rect.top) / rect.height,
    absX: cx - rect.left,
    absY: cy - rect.top,
    containerW: rect.width,
    containerH: rect.height,
  };
}

// ============================================================================
// Tap handler
// ============================================================================
function handleARHeightTap(event) {
  // Ignore taps on buttons/inputs
  var tag = (event.target.tagName || '').toLowerCase();
  if (tag === 'button' || tag === 'input') return;

  if (event.type === 'touchend') event.preventDefault();

  var pos = arHeightGetPos(event);

  if (arHeightData.step === 1) {
    // === MARK BASE ===
    arHeightData.baseFracX = pos.fracX;
    arHeightData.baseFracY = pos.fracY;
    arHeightData.baseY = pos.absY; // pixel Y relative to container

    // Record gyroscope pitch
    if (arHeightData.useGyroscope && arHeightData.currentPitch !== null) {
      arHeightData.basePitch = arHeightData.currentPitch;
    }

    // Show base dot
    var baseDot = document.getElementById('ar-base-dot');
    baseDot.style.display = 'block';
    baseDot.style.left = (pos.fracX * 100) + '%';
    baseDot.style.top = (pos.fracY * 100) + '%';

    // UI
    document.getElementById('ar-height-base-marker').innerHTML = '✅ Base: Marcada';
    document.getElementById('ar-height-base-marker').style.borderColor = '#4CAF50';
    document.getElementById('ar-height-step').textContent = 'Paso 3: Apunta a la CIMA y toca';
    document.getElementById('ar-height-instructions').textContent =
      'Mueve la cámara hacia arriba. La línea y medida se actualizan en tiempo real. Toca para fijar.';
    document.getElementById('ar-live-measurement').style.display = 'block';

    arHeightData.step = 2;

    // Sync canvas and start animation
    arHeightSyncCanvas();
    arHeightStartLiveTracking();

  } else if (arHeightData.step === 2) {
    // === MARK TOP ===
    arHeightData.topY = pos.absY;
    arHeightData.step = 3;

    // Show top dot
    var topDot = document.getElementById('ar-top-dot');
    topDot.style.display = 'block';
    topDot.style.left = (pos.fracX * 100) + '%';
    topDot.style.top = (pos.fracY * 100) + '%';

    // UI
    document.getElementById('ar-height-top-marker').innerHTML = '✅ Cima: Marcada';
    document.getElementById('ar-height-top-marker').style.borderColor = '#FFC107';

    // Stop animation
    arHeightStopLiveTracking();

    // Remove tap listeners
    var container = document.getElementById('ar-height-container');
    container.removeEventListener('click', handleARHeightTap);
    container.removeEventListener('touchend', handleARHeightTap);

    // Calculate final height
    var finalHeight = arHeightCalculateFinal(pos.absY, pos.containerH);
    arHeightData.height = finalHeight;

    // Draw final line
    arHeightDrawFinalLine(pos.fracX, pos.fracY);

    // Show result
    showARHeightResult(finalHeight);
  }
}

// ============================================================================
// Live tracking animation
// ============================================================================
function arHeightStartLiveTracking() {
  function frame() {
    try {
      if (arHeightData.step !== 2) return;

      var canvas = arHeightSyncCanvas();
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        arHeightData.animFrameId = requestAnimationFrame(frame);
        return;
      }

      var ctx = canvas.getContext('2d');
      var cw = canvas.width;
      var ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // Base point in canvas-buffer coords
      var bx = arHeightData.baseFracX * cw;
      var by = arHeightData.baseFracY * ch;

      // Target = crosshair center (center of canvas)
      var tx = cw / 2;
      var ty = ch / 2;

      // Calculate live height
      var container = document.getElementById('ar-height-container');
      var containerH = container ? container.getBoundingClientRect().height : (ch / (window.devicePixelRatio || 1));
      var liveHeight = arHeightCalculateLive(containerH);
      var absH = Math.abs(liveHeight);
      arHeightData.liveHeight = liveHeight;

      // Update floating label
      var hValEl = document.getElementById('ar-live-height-value');
      var mValEl = document.getElementById('ar-live-meters-value');
      if (hValEl) hValEl.textContent = absH >= 100 ? absH.toFixed(0) + ' cm' : absH.toFixed(1) + ' cm';
      if (mValEl) mValEl.textContent = (absH / 100).toFixed(2);

      // ---- DRAW VERTICAL LINE from base UP to crosshair Y level ----
      // Use base X for both points (vertical measurement line)
      var lineTopY = ty; // crosshair Y level

      // Glow layer
      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -(Date.now() / 35) % 24; // animated marching
      ctx.strokeStyle = 'rgba(76,175,80,0.3)';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, lineTopY);
      ctx.stroke();
      ctx.restore();

      // Main dashed line (bright, thick)
      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -(Date.now() / 35) % 24;
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, lineTopY);
      ctx.stroke();
      ctx.restore();

      // Also draw a subtle horizontal connector from line top to crosshair
      if (Math.abs(bx - tx) > 5) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(76,175,80,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, lineTopY);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      }

      // Base circle (pulsing green)
      var pulse = 1 + 0.2 * Math.sin(Date.now() / 250);
      ctx.beginPath();
      ctx.arc(bx, by, 14 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76,175,80,0.5)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Top target circle (where the line reaches)
      ctx.beginPath();
      ctx.arc(bx, lineTopY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,193,7,0.6)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ---- MEASUREMENT LABEL next to the line ----
      var labelText = absH >= 100 ? absH.toFixed(0) + ' cm' : absH.toFixed(1) + ' cm';
      var labelY = (by + lineTopY) / 2; // midpoint of line
      var labelX = bx + 25; // offset to the right of the line

      ctx.font = 'bold 18px sans-serif';
      var tw = ctx.measureText(labelText).width;
      var padX = 10;
      var padY = 8;

      // Label background
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(labelX - padX, labelY - 12 - padY, tw + padX * 2, 24 + padY * 2);

      // Label border
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.strokeRect(labelX - padX, labelY - 12 - padY, tw + padX * 2, 24 + padY * 2);
      ctx.restore();

      // Label text
      ctx.fillStyle = '#4CAF50';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX, labelY);

      arHeightData.animFrameId = requestAnimationFrame(frame);
    } catch (err) {
      console.error('AR frame error:', err);
      // Keep the loop alive even on error
      arHeightData.animFrameId = requestAnimationFrame(frame);
    }
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
// Height calculations
// ============================================================================
function arHeightCalculateLive(containerH) {
  var distance = arHeightData.distance;
  if (!distance) return 0;

  // Gyroscope path (more accurate)
  if (arHeightData.useGyroscope && arHeightData.basePitch !== null && arHeightData.currentPitch !== null) {
    return arHeightCalcFromGyroscope(arHeightData.basePitch, arHeightData.currentPitch, distance);
  }

  // Fallback: screen position
  var basePixelY = arHeightData.baseY;
  var centerY = containerH / 2; // crosshair is at center
  return arHeightCalcFromScreen(basePixelY, centerY, containerH, distance);
}

function arHeightCalculateFinal(topPixelY, containerH) {
  var distance = arHeightData.distance;
  if (!distance) return 10;

  // Gyroscope
  if (arHeightData.useGyroscope && arHeightData.basePitch !== null && arHeightData.currentPitch !== null) {
    return Math.max(Math.abs(arHeightCalcFromGyroscope(arHeightData.basePitch, arHeightData.currentPitch, distance)), 1);
  }

  // Screen
  return Math.max(Math.abs(arHeightCalcFromScreen(arHeightData.baseY, topPixelY, containerH, distance)), 1);
}

function arHeightCalcFromGyroscope(basePitch, currentPitch, distanceMeters) {
  var baseAngle = (90 - basePitch) * Math.PI / 180;
  var curAngle = (90 - currentPitch) * Math.PI / 180;
  return distanceMeters * (Math.tan(curAngle) - Math.tan(baseAngle)) * 100;
}

function arHeightCalcFromScreen(basePixelY, targetPixelY, viewportH, distanceMeters) {
  var fovDeg = 60;
  var halfFov = (fovDeg / 2) * Math.PI / 180;
  var center = viewportH / 2;
  var half = viewportH / 2;

  var baseAngle = Math.atan(((center - basePixelY) / half) * Math.tan(halfFov));
  var topAngle = Math.atan(((center - targetPixelY) / half) * Math.tan(halfFov));

  return distanceMeters * (Math.tan(topAngle) - Math.tan(baseAngle)) * 100;
}

// ============================================================================
// Draw final locked line
// ============================================================================
function arHeightDrawFinalLine(topFracX, topFracY) {
  var canvas = arHeightSyncCanvas();
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var cw = canvas.width;
  var ch = canvas.height;

  var bx = arHeightData.baseFracX * cw;
  var by = arHeightData.baseFracY * ch;
  var ty = topFracY * ch;

  ctx.clearRect(0, 0, cw, ch);

  // Solid vertical line (from base to top, same X)
  ctx.save();
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(76,175,80,0.5)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx, ty);
  ctx.stroke();
  ctx.restore();

  // Base circle (green)
  ctx.beginPath();
  ctx.arc(bx, by, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#4CAF50';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Top circle (yellow)
  ctx.beginPath();
  ctx.arc(bx, ty, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#FFC107';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Labels "BASE" and "CIMA"
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('BASE', bx + 20, by);
  ctx.fillText('CIMA', bx + 20, ty);

  // Measurement label at midpoint
  var midY = (by + ty) / 2;
  var labelX = bx + 25;
  var h = arHeightData.height || 0;
  var label = h >= 100 ? h.toFixed(0) + ' cm' : h.toFixed(1) + ' cm';

  ctx.font = 'bold 20px sans-serif';
  var tw = ctx.measureText(label).width;
  var px = 12, py = 10;

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(labelX - px, midY - 14 - py, tw + px * 2, 28 + py * 2);
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 2;
  ctx.strokeRect(labelX - px, midY - 14 - py, tw + px * 2, 28 + py * 2);

  ctx.fillStyle = '#4CAF50';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX, midY);
}

// ============================================================================
// Result display
// ============================================================================
function showARHeightResult(height) {
  var el = document.createElement('div');
  el.id = 'ar-height-result-overlay';
  el.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;';

  var disp = height >= 100 ? height.toFixed(0) : height.toFixed(1);
  var gyroLabel = arHeightData.useGyroscope ? '🔄 Giroscopio: Sí' : '📱 Giroscopio: No';

  el.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:2rem;text-align:center;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:3rem;margin-bottom:0.75rem;">📐</div>' +
      '<h3 style="margin:0 0 0.5rem;color:#333;">Altura Estimada</h3>' +
      '<div style="font-size:2.5rem;font-weight:700;color:#4CAF50;margin:0.75rem 0;">' + disp + ' cm</div>' +
      '<p style="color:#888;margin:0.3rem 0;font-size:1rem;">≈ ' + (height / 100).toFixed(2) + ' metros</p>' +
      '<p style="color:#888;margin:0.3rem 0;font-size:0.85rem;">📏 Distancia: ' + arHeightData.distance.toFixed(1) + ' m &nbsp;|&nbsp; ' + gyroLabel + '</p>' +
      '<p style="color:#aaa;margin:1rem 0 0;font-size:0.8rem;font-style:italic;">Estimación óptica aproximada.</p>' +
      '<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem;">' +
        '<button onclick="arHeightUseValue(' + height.toFixed(1) + ')" style="background:#4CAF50;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:8px;cursor:pointer;font-size:0.95rem;font-weight:600;">✓ Usar Este Valor</button>' +
        '<button onclick="arHeightRetry()" style="background:#666;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:8px;cursor:pointer;font-size:0.95rem;">🔄 Reintentar</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(el);
}

// ============================================================================
// Use value
// ============================================================================
function arHeightUseValue(height) {
  var inp = document.getElementById('meas-height');
  if (inp) {
    inp.value = height;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  if (typeof showToast === 'function') showToast('Altura cargada en el formulario', 'success');
}

// ============================================================================
// Retry
// ============================================================================
function arHeightRetry() {
  var r = document.getElementById('ar-height-result-overlay');
  if (r) r.remove();
  arHeightReset();
}

// ============================================================================
// Reset (back to step 1, keeps distance)
// ============================================================================
function arHeightReset() {
  arHeightStopLiveTracking();

  arHeightData.baseY = null;
  arHeightData.topY = null;
  arHeightData.basePitch = null;
  arHeightData.height = null;
  arHeightData.liveHeight = 0;
  arHeightData.baseFracX = null;
  arHeightData.baseFracY = null;
  arHeightData.step = 1;

  // Clear canvas
  var canvas = document.getElementById('ar-height-canvas');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Hide dots
  var bd = document.getElementById('ar-base-dot');
  var td = document.getElementById('ar-top-dot');
  if (bd) bd.style.display = 'none';
  if (td) td.style.display = 'none';

  // Hide live label
  var lm = document.getElementById('ar-live-measurement');
  if (lm) lm.style.display = 'none';

  // Reset markers
  var bm = document.getElementById('ar-height-base-marker');
  var tm = document.getElementById('ar-height-top-marker');
  if (bm) { bm.innerHTML = '⬜ Base: Sin marcar'; bm.style.borderColor = 'rgba(76,175,80,0)'; }
  if (tm) { tm.innerHTML = '⬜ Cima: Sin marcar'; tm.style.borderColor = 'rgba(255,193,7,0)'; }

  var step = document.getElementById('ar-height-step');
  var inst = document.getElementById('ar-height-instructions');
  if (step) step.textContent = 'Paso 2: Toca la BASE del árbol';
  if (inst) inst.textContent = 'Apunta a la BASE del árbol y toca la pantalla.';

  // Re-attach tap listeners
  var container = document.getElementById('ar-height-container');
  if (container) {
    container.addEventListener('touchend', handleARHeightTap, false);
    container.addEventListener('click', handleARHeightTap, false);
  }

  // Remove result if present
  var r = document.getElementById('ar-height-result-overlay');
  if (r) r.remove();
}

// ============================================================================
// Close
// ============================================================================
function closeARHeightMeasure() {
  arHeightStopLiveTracking();

  if (arHeightData.orientationHandler) {
    window.removeEventListener('deviceorientation', arHeightData.orientationHandler);
    arHeightData.orientationHandler = null;
  }

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

  var r = document.getElementById('ar-height-result-overlay');
  if (r) r.remove();
}

// Expose
window.openARHeightMeasure = openARHeightMeasure;
