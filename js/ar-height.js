// ============================================================================
// AR Height Measurement - Camera + Gyroscope tree height estimation
// Auto-distance calculation + live tracking with visual line
// ============================================================================

var arH = {
  step: 0,
  // 0=setup, 1=aim at base, 2=live tracking (tilt up), 3=done
  stream: null,
  animId: null,
  gyroHandler: null,
  hasGyro: false,

  // User's phone holding height (meters above ground)
  phoneHeight: 1.5,

  // Gyroscope angles (degrees)
  currentBeta: null,   // live device beta
  baseBeta: null,      // beta when base was marked
  topBeta: null,       // beta when top was marked

  // Calculated values
  distance: null,      // meters from tree (auto or manual)
  height: null,        // final calculated height (cm)
  autoDistance: true,   // whether to auto-calculate distance
};

// ============================================================================
// OPEN — Create overlay + start camera
// ============================================================================
function openARHeightMeasure() {
  arH = {
    step: 0, stream: null, animId: null, gyroHandler: null, hasGyro: false,
    phoneHeight: 1.5, currentBeta: null, baseBeta: null, topBeta: null,
    distance: null, height: null, autoDistance: true,
  };

  var ov = document.createElement('div');
  ov.id = 'ar-overlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:9999;';

  ov.innerHTML =
    '<div id="ar-box" style="position:relative;width:100%;height:100%;overflow:hidden;">' +

      '<video id="ar-vid" autoplay playsinline muted style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +
      '<canvas id="ar-cv" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></canvas>' +

      // UI layer
      '<div id="ar-ui" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;z-index:5;">' +

        // Top bar
        '<div style="background:rgba(0,0,0,0.8);color:#fff;padding:0.6rem 1rem;text-align:center;pointer-events:auto;">' +
          '<h2 style="margin:0;font-size:1.1rem;">📐 Medidor de Altura AR</h2>' +
          '<p id="ar-step-label" style="margin:0.3rem 0 0;font-size:0.8rem;color:#aaa;">Paso 1: Configuración</p>' +
        '</div>' +

        // Center — crosshair + live display
        '<div id="ar-center" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;">' +
          '<div style="position:absolute;width:50px;height:50px;border:2px solid rgba(76,175,80,0.8);border-radius:50%;box-shadow:0 0 15px rgba(76,175,80,0.4);"></div>' +
          '<div style="position:absolute;width:30px;height:2px;background:rgba(76,175,80,0.8);"></div>' +
          '<div style="position:absolute;width:2px;height:30px;background:rgba(76,175,80,0.8);"></div>' +
          // Live measurement (hidden until step 2)
          '<div id="ar-live-box" style="display:none;position:absolute;top:20%;right:0.75rem;' +
            'background:rgba(0,0,0,0.85);color:#4CAF50;padding:0.5rem 0.8rem;border-radius:10px;' +
            'border:2px solid rgba(76,175,80,0.6);text-shadow:0 0 8px rgba(76,175,80,0.4);z-index:6;">' +
            '<div id="ar-live-h" style="font-size:1.8rem;font-weight:700;">0 cm</div>' +
            '<div style="font-size:0.7rem;color:#aaa;">≈ <span id="ar-live-m">0.00</span> m</div>' +
          '</div>' +
          // Distance badge (shown in step 2)
          '<div id="ar-dist-badge" style="display:none;position:absolute;bottom:10%;left:50%;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.7);color:#aaa;padding:0.3rem 0.8rem;border-radius:20px;font-size:0.75rem;">' +
            '📏 Distancia: <span id="ar-dist-val">?</span> m</div>' +
        '</div>' +

        // Bottom panel
        '<div id="ar-bottom" style="background:rgba(0,0,0,0.85);color:#fff;padding:1rem;text-align:center;pointer-events:auto;">' +

          // === STEP 0: Setup ===
          '<div id="ar-setup">' +
            '<p style="margin:0 0 0.6rem;font-size:0.85rem;font-weight:600;">¿Cómo quieres medir la distancia al árbol?</p>' +

            // Auto option
            '<div id="ar-opt-auto" onclick="arSelectMode(true)" style="background:rgba(76,175,80,0.15);border:2px solid #4CAF50;' +
              'border-radius:10px;padding:0.6rem;margin-bottom:0.5rem;cursor:pointer;">' +
              '<div style="font-size:0.9rem;font-weight:600;color:#4CAF50;">🤖 Automático (recomendado)</div>' +
              '<div style="font-size:0.75rem;color:#aaa;margin-top:0.2rem;">Usa el giroscopio para calcular la distancia</div>' +
            '</div>' +

            // Manual option
            '<div id="ar-opt-manual" onclick="arSelectMode(false)" style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.2);' +
              'border-radius:10px;padding:0.6rem;margin-bottom:0.5rem;cursor:pointer;">' +
              '<div style="font-size:0.9rem;font-weight:600;color:#ccc;">📏 Manual</div>' +
              '<div style="font-size:0.75rem;color:#888;margin-top:0.2rem;">Ingresa la distancia tú mismo</div>' +
            '</div>' +

            // Auto: height input (hidden initially)
            '<div id="ar-auto-cfg" style="display:none;margin-top:0.6rem;">' +
              '<p style="margin:0 0 0.4rem;font-size:0.8rem;color:#aaa;">¿A qué altura sostienes el teléfono?</p>' +
              '<div style="display:flex;gap:0.4rem;justify-content:center;flex-wrap:wrap;margin-bottom:0.5rem;">' +
                '<button onclick="arSetHeight(1.2)" class="ar-h-btn" style="padding:0.4rem 0.7rem;border-radius:6px;border:1px solid #555;background:transparent;color:#ccc;font-size:0.8rem;cursor:pointer;">1.2m</button>' +
                '<button onclick="arSetHeight(1.4)" class="ar-h-btn" style="padding:0.4rem 0.7rem;border-radius:6px;border:1px solid #555;background:transparent;color:#ccc;font-size:0.8rem;cursor:pointer;">1.4m</button>' +
                '<button onclick="arSetHeight(1.5)" class="ar-h-btn" id="ar-h-default" style="padding:0.4rem 0.7rem;border-radius:6px;border:2px solid #4CAF50;background:rgba(76,175,80,0.15);color:#4CAF50;font-size:0.8rem;cursor:pointer;">1.5m</button>' +
                '<button onclick="arSetHeight(1.6)" class="ar-h-btn" style="padding:0.4rem 0.7rem;border-radius:6px;border:1px solid #555;background:transparent;color:#ccc;font-size:0.8rem;cursor:pointer;">1.6m</button>' +
                '<button onclick="arSetHeight(1.7)" class="ar-h-btn" style="padding:0.4rem 0.7rem;border-radius:6px;border:1px solid #555;background:transparent;color:#ccc;font-size:0.8rem;cursor:pointer;">1.7m</button>' +
              '</div>' +
              '<button onclick="arStartMeasure()" style="background:#4CAF50;color:#fff;border:none;padding:0.6rem 1.5rem;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Continuar →</button>' +
            '</div>' +

            // Manual: distance input (hidden initially)
            '<div id="ar-manual-cfg" style="display:none;margin-top:0.6rem;">' +
              '<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:0.5rem;">' +
                '<input type="number" id="ar-dist-input" placeholder="Ej: 5" min="0.5" max="100" step="0.5" ' +
                  'style="width:100px;padding:0.5rem;border:2px solid #4CAF50;border-radius:8px;font-size:1rem;text-align:center;background:rgba(255,255,255,0.9);color:#333;">' +
                '<span style="color:#ccc;">metros</span>' +
              '</div>' +
              '<button onclick="arStartManual()" style="background:#4CAF50;color:#fff;border:none;padding:0.6rem 1.5rem;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Continuar →</button>' +
            '</div>' +
          '</div>' +

          // === STEP 1+: Tracking controls ===
          '<div id="ar-controls" style="display:none;">' +
            '<p id="ar-instr" style="margin:0 0 0.5rem;font-size:0.85rem;"></p>' +
            '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">' +
              '<button onclick="arReset()" style="background:#555;color:#fff;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-size:0.85rem;">🔄 Reiniciar</button>' +
              '<button onclick="closeARHeightMeasure()" style="background:#d62828;color:#fff;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-size:0.85rem;">✕ Cerrar</button>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(ov);

  // Camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(function(stream) {
    arH.stream = stream;
    var v = document.getElementById('ar-vid');
    if (!v) return;
    v.srcObject = stream;
    var p = v.play();
    if (p && p.catch) p.catch(function() {});

    // Start gyro
    arInitGyro();
  }).catch(function(err) {
    console.error('Camera error:', err);
    if (typeof showToast === 'function') showToast('Error accediendo a la cámara.', 'error');
    closeARHeightMeasure();
  });
}

// ============================================================================
// GYROSCOPE
// ============================================================================
function arInitGyro() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS — need user gesture, will request in arStartMeasure
    arH.hasGyro = false;
  } else if ('DeviceOrientationEvent' in window) {
    arListenGyro();
  }
}

function arRequestGyroiOS() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(s) {
      if (s === 'granted') arListenGyro();
    }).catch(function() {});
  }
}

function arListenGyro() {
  var h = function(e) {
    if (e.beta !== null) {
      arH.hasGyro = true;
      arH.currentBeta = e.beta;
    }
  };
  window.addEventListener('deviceorientation', h);
  arH.gyroHandler = h;
}

// Helper: beta → angle from horizontal (degrees)
// Phone vertical: beta≈90 → angle=0
// Phone tilted back (looking up): beta<90 → angle>0
// Phone tilted forward (looking down): beta>90 → angle<0
function betaToAngle(beta) {
  return 90 - beta; // degrees from horizontal
}

// ============================================================================
// SETUP: Mode selection
// ============================================================================
function arSelectMode(auto) {
  arH.autoDistance = auto;

  // Visual feedback
  var optAuto = document.getElementById('ar-opt-auto');
  var optMan = document.getElementById('ar-opt-manual');
  var cfgAuto = document.getElementById('ar-auto-cfg');
  var cfgMan = document.getElementById('ar-manual-cfg');

  if (auto) {
    optAuto.style.borderColor = '#4CAF50';
    optAuto.style.background = 'rgba(76,175,80,0.15)';
    optMan.style.borderColor = 'rgba(255,255,255,0.2)';
    optMan.style.background = 'rgba(255,255,255,0.05)';
    cfgAuto.style.display = 'block';
    cfgMan.style.display = 'none';
  } else {
    optMan.style.borderColor = '#4CAF50';
    optMan.style.background = 'rgba(76,175,80,0.15)';
    optAuto.style.borderColor = 'rgba(255,255,255,0.2)';
    optAuto.style.background = 'rgba(255,255,255,0.05)';
    cfgMan.style.display = 'block';
    cfgAuto.style.display = 'none';
  }
}

function arSetHeight(h) {
  arH.phoneHeight = h;
  // Highlight selected button
  var btns = document.querySelectorAll('.ar-h-btn');
  btns.forEach(function(b) {
    b.style.border = '1px solid #555';
    b.style.background = 'transparent';
    b.style.color = '#ccc';
  });
  event.target.style.border = '2px solid #4CAF50';
  event.target.style.background = 'rgba(76,175,80,0.15)';
  event.target.style.color = '#4CAF50';
}

// ============================================================================
// START MEASURING (auto mode)
// ============================================================================
function arStartMeasure() {
  // iOS gyro permission
  arRequestGyroiOS();

  arH.step = 1;
  document.getElementById('ar-setup').style.display = 'none';
  document.getElementById('ar-controls').style.display = 'block';
  document.getElementById('ar-step-label').textContent = 'Paso 2: Apunta a la BASE del árbol';
  document.getElementById('ar-instr').textContent = 'Apunta el centro de la pantalla a la base del árbol y toca.';

  // Enable taps
  var box = document.getElementById('ar-box');
  box.addEventListener('touchend', arTap, false);
  box.addEventListener('click', arTap, false);
}

// START MEASURING (manual mode)
function arStartManual() {
  var d = parseFloat(document.getElementById('ar-dist-input').value);
  if (!d || d < 0.5) {
    if (typeof showToast === 'function') showToast('Ingresa una distancia válida (mínimo 0.5 m)', 'warning');
    return;
  }
  arH.distance = d;
  arH.autoDistance = false;

  // iOS gyro permission
  arRequestGyroiOS();

  // Skip to step 1 (mark base) — but base just records the angle
  arH.step = 1;
  document.getElementById('ar-setup').style.display = 'none';
  document.getElementById('ar-controls').style.display = 'block';
  document.getElementById('ar-step-label').textContent = 'Paso 2: Apunta a la BASE del árbol';
  document.getElementById('ar-instr').textContent = 'Apunta el centro de la pantalla a la base del árbol y toca.';

  var box = document.getElementById('ar-box');
  box.addEventListener('touchend', arTap, false);
  box.addEventListener('click', arTap, false);
}

// ============================================================================
// TAP HANDLER
// ============================================================================
function arTap(e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'button' || tag === 'input') return;
  if (e.type === 'touchend') e.preventDefault();

  if (arH.step === 1) {
    // === MARK BASE ===
    if (arH.hasGyro && arH.currentBeta !== null) {
      arH.baseBeta = arH.currentBeta;
    } else {
      // No gyro — we can't do much, use screen-based fallback
      arH.baseBeta = 90; // assume phone is vertical
    }

    // Auto-calculate distance from phone height + tilt angle
    if (arH.autoDistance) {
      var angleFromHoriz = betaToAngle(arH.baseBeta); // degrees
      var angleRad = Math.abs(angleFromHoriz) * Math.PI / 180;

      if (angleRad > 0.05) { // at least ~3° of tilt
        arH.distance = arH.phoneHeight / Math.tan(angleRad);
      } else {
        // Phone is nearly horizontal — can't calculate reliably, use default
        arH.distance = 5;
      }
      // Clamp to reasonable range
      arH.distance = Math.max(1, Math.min(arH.distance, 50));
    }

    // Show distance
    document.getElementById('ar-dist-badge').style.display = 'block';
    document.getElementById('ar-dist-val').textContent = arH.distance.toFixed(1);

    // UI update
    document.getElementById('ar-step-label').textContent = 'Paso 3: Apunta a la CIMA del árbol';
    document.getElementById('ar-instr').textContent = 'Inclina el teléfono hacia arriba hasta la cima. La medida se actualiza en vivo. Toca para fijar.';
    document.getElementById('ar-live-box').style.display = 'block';

    arH.step = 2;
    arSyncCanvas();
    arStartAnim();

  } else if (arH.step === 2) {
    // === MARK TOP ===
    if (arH.hasGyro && arH.currentBeta !== null) {
      arH.topBeta = arH.currentBeta;
    }

    arH.step = 3;
    arStopAnim();

    // Remove tap listeners
    var box = document.getElementById('ar-box');
    box.removeEventListener('click', arTap);
    box.removeEventListener('touchend', arTap);

    // Calculate final height
    var h = arCalcHeight(arH.topBeta || arH.currentBeta || arH.baseBeta);
    arH.height = Math.max(Math.abs(h), 1);

    // Show result
    arShowResult(arH.height);
  }
}

// ============================================================================
// CANVAS SYNC (only resize if big diff to avoid flicker)
// ============================================================================
function arSyncCanvas() {
  var c = document.getElementById('ar-cv');
  if (!c) return null;
  var r = c.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var nw = Math.round(r.width * dpr);
  var nh = Math.round(r.height * dpr);
  if (Math.abs(c.width - nw) > 5 || Math.abs(c.height - nh) > 5) {
    c.width = nw;
    c.height = nh;
  }
  return c;
}

// ============================================================================
// HEIGHT CALCULATION
// ============================================================================
function arCalcHeight(currentBeta) {
  if (!arH.distance || !arH.baseBeta) return 0;

  var baseAngle = betaToAngle(arH.baseBeta) * Math.PI / 180;
  var curAngle = betaToAngle(currentBeta) * Math.PI / 180;

  // height = distance × (tan(curAngle) - tan(baseAngle))
  var hMeters = arH.distance * (Math.tan(curAngle) - Math.tan(baseAngle));
  return hMeters * 100; // cm
}

// ============================================================================
// ANIMATION — Live line + measurement
// ============================================================================
function arStartAnim() {
  function frame() {
    try {
      if (arH.step !== 2) return;

      var c = arSyncCanvas();
      if (!c || c.width < 10 || c.height < 10) {
        arH.animId = requestAnimationFrame(frame);
        return;
      }

      var ctx = c.getContext('2d');
      var W = c.width;
      var H = c.height;
      ctx.clearRect(0, 0, W, H);

      // Calculate current height
      var beta = arH.hasGyro ? arH.currentBeta : arH.baseBeta;
      var liveH = Math.abs(arCalcHeight(beta || arH.baseBeta));

      // Update live display
      var hEl = document.getElementById('ar-live-h');
      var mEl = document.getElementById('ar-live-m');
      if (hEl) hEl.textContent = liveH >= 100 ? liveH.toFixed(0) + ' cm' : liveH.toFixed(1) + ' cm';
      if (mEl) mEl.textContent = (liveH / 100).toFixed(2);

      // ---- VISUAL: Vertical line from BOTTOM of camera area to CROSSHAIR ----
      // This always spans a large visible area regardless of where base was tapped
      var cx = W / 2;     // center X
      var cy = H / 2;     // crosshair Y (center)

      // Bottom edge of the camera visible area (above the bottom panel)
      // The bottom panel covers roughly the bottom 20-25% of the overlay
      var bottomY = H * 0.88; // just above the bottom panel

      // Animated dash offset (marching ants)
      var dashOff = -(Date.now() / 30) % 28;

      // Glow layer
      ctx.save();
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = dashOff;
      ctx.strokeStyle = 'rgba(76,175,80,0.25)';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, bottomY);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();

      // Main line
      ctx.save();
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = dashOff;
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, bottomY);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();

      // Arrows/ticks at ends
      // Bottom: green circle (BASE)
      ctx.beginPath();
      ctx.arc(cx, bottomY, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top: yellow pulsing circle (where you're aiming)
      var pulse = 1 + 0.2 * Math.sin(Date.now() / 200);
      ctx.beginPath();
      ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,193,7,0.7)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Labels: "BASE ▼" at bottom, "CIMA ▲" at crosshair
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(cx - 35, bottomY + 14, 70, 20);
      ctx.fillStyle = '#4CAF50';
      ctx.fillText('▲ BASE', cx, bottomY + 24);

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(cx - 30, cy - 34, 60, 20);
      ctx.fillStyle = '#FFC107';
      ctx.fillText('CIMA ▼', cx, cy - 24);

      // ---- MEASUREMENT LABEL at midpoint of line ----
      var midY = (bottomY + cy) / 2;
      var labelX = cx + 35;
      var txt = liveH >= 100 ? liveH.toFixed(0) + ' cm' : liveH.toFixed(1) + ' cm';

      ctx.font = 'bold 20px sans-serif';
      var tw = ctx.measureText(txt).width;
      var px = 10, py = 8;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(labelX - px, midY - 14 - py, tw + px * 2, 28 + py * 2);
      // Border
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.strokeRect(labelX - px, midY - 14 - py, tw + px * 2, 28 + py * 2);
      ctx.restore();
      // Text
      ctx.fillStyle = '#4CAF50';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, labelX, midY);

      // Small connector line from label to main line
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(76,175,80,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 12, midY);
      ctx.lineTo(labelX - px, midY);
      ctx.stroke();
      ctx.restore();

      arH.animId = requestAnimationFrame(frame);
    } catch (err) {
      console.error('AR frame error:', err);
      arH.animId = requestAnimationFrame(frame);
    }
  }
  arH.animId = requestAnimationFrame(frame);
}

function arStopAnim() {
  if (arH.animId) {
    cancelAnimationFrame(arH.animId);
    arH.animId = null;
  }
}

// ============================================================================
// RESULT
// ============================================================================
function arShowResult(height) {
  var el = document.createElement('div');
  el.id = 'ar-result';
  el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;';

  var disp = height >= 100 ? height.toFixed(0) : height.toFixed(1);
  var meters = (height / 100).toFixed(2);
  var distTxt = arH.distance ? arH.distance.toFixed(1) : '?';
  var modeTxt = arH.autoDistance ? '🤖 Auto' : '📏 Manual';
  var gyroTxt = arH.hasGyro ? '✅ Giroscopio activo' : '⚠️ Sin giroscopio';

  el.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:1.5rem;text-align:center;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:2.5rem;margin-bottom:0.5rem;">📐</div>' +
      '<h3 style="margin:0 0 0.3rem;color:#333;font-size:1.1rem;">Altura Estimada</h3>' +
      '<div style="font-size:2.5rem;font-weight:700;color:#4CAF50;margin:0.5rem 0;">' + disp + ' cm</div>' +
      '<p style="color:#888;margin:0.2rem 0;font-size:0.95rem;">≈ ' + meters + ' metros</p>' +
      '<div style="background:#f5f5f5;border-radius:8px;padding:0.5rem;margin:0.75rem 0;font-size:0.8rem;color:#666;">' +
        '<div>📏 Distancia: ' + distTxt + ' m (' + modeTxt + ')</div>' +
        '<div>' + gyroTxt + '</div>' +
      '</div>' +
      '<p style="color:#aaa;margin:0.5rem 0;font-size:0.75rem;font-style:italic;">Estimación aproximada basada en óptica y giroscopio.</p>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:1rem;">' +
        '<button onclick="arUseValue(' + height.toFixed(1) + ')" style="background:#4CAF50;color:#fff;border:none;padding:0.7rem 1.3rem;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;">✓ Usar</button>' +
        '<button onclick="arRetry()" style="background:#666;color:#fff;border:none;padding:0.7rem 1.3rem;border-radius:8px;cursor:pointer;font-size:0.9rem;">🔄 Reintentar</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(el);
}

// ============================================================================
// USE VALUE / RETRY / RESET / CLOSE
// ============================================================================
function arUseValue(h) {
  var inp = document.getElementById('meas-height');
  if (inp) {
    inp.value = h;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  if (typeof showToast === 'function') showToast('Altura cargada en el formulario', 'success');
}

function arRetry() {
  var r = document.getElementById('ar-result');
  if (r) r.remove();
  arReset();
}

function arReset() {
  arStopAnim();
  arH.baseBeta = null;
  arH.topBeta = null;
  arH.distance = null;
  arH.height = null;
  arH.step = 0;

  // Clear canvas
  var c = document.getElementById('ar-cv');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);

  // Hide live elements
  var lb = document.getElementById('ar-live-box');
  if (lb) lb.style.display = 'none';
  var db = document.getElementById('ar-dist-badge');
  if (db) db.style.display = 'none';

  // Show setup, hide controls
  var setup = document.getElementById('ar-setup');
  var ctrl = document.getElementById('ar-controls');
  if (setup) setup.style.display = 'block';
  if (ctrl) ctrl.style.display = 'none';

  var sl = document.getElementById('ar-step-label');
  if (sl) sl.textContent = 'Paso 1: Configuración';

  // Remove tap listeners
  var box = document.getElementById('ar-box');
  if (box) {
    box.removeEventListener('click', arTap);
    box.removeEventListener('touchend', arTap);
  }

  // Remove result
  var r = document.getElementById('ar-result');
  if (r) r.remove();
}

function closeARHeightMeasure() {
  arStopAnim();

  if (arH.gyroHandler) {
    window.removeEventListener('deviceorientation', arH.gyroHandler);
    arH.gyroHandler = null;
  }

  if (arH.stream) {
    arH.stream.getTracks().forEach(function(t) { t.stop(); });
    arH.stream = null;
  }

  var ov = document.getElementById('ar-overlay');
  if (ov) {
    var v = ov.querySelector('#ar-vid');
    if (v && v.srcObject) v.srcObject.getTracks().forEach(function(t) { t.stop(); });
    ov.remove();
  }

  var r = document.getElementById('ar-result');
  if (r) r.remove();
}

// Expose
window.openARHeightMeasure = openARHeightMeasure;
