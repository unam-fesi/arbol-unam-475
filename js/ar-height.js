// ============================================================================
// AR Height Measurement — Measure-app style
// Gyroscope-tracked base point + auto distance + clean minimal UI
// ============================================================================

var arM = {
  step: 0,         // 0=ready to mark base, 1=tracking (tilt up), 2=done
  stream: null,
  animId: null,
  gyroH: null,
  hasGyro: false,
  gyroReady: false, // true once we've received at least one gyro event

  curBeta: null,    // current device beta (live)
  baseBeta: null,   // beta when base was tapped
  topBeta: null,    // beta when top was tapped

  phoneH: 1.5,     // phone height above ground (m)
  dist: null,       // auto-calculated distance (m)
  height: null,     // final height (cm)
};

// ============================================================================
// OPEN
// ============================================================================
function openARHeightMeasure() {
  arM = {
    step: 0, stream: null, animId: null, gyroH: null,
    hasGyro: false, gyroReady: false,
    curBeta: null, baseBeta: null, topBeta: null,
    phoneH: 1.5, dist: null, height: null,
  };

  // ---- REQUEST GYROSCOPE PERMISSION IMMEDIATELY (user gesture context) ----
  // This is critical for iOS 13+ — must be in the click handler
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') _arListenGyro();
    }).catch(function(e) {
      console.warn('Gyro permission denied:', e);
    });
  } else if ('DeviceOrientationEvent' in window) {
    _arListenGyro();
  }

  // ---- CREATE OVERLAY ----
  var ov = document.createElement('div');
  ov.id = 'ar-ov';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:9999;';
  ov.innerHTML =
    '<div id="ar-box" style="position:relative;width:100%;height:100%;overflow:hidden;">' +

      '<video id="ar-vid" autoplay playsinline muted ' +
        'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +

      '<canvas id="ar-cv" style="position:absolute;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:2;"></canvas>' +

      // Top hint (gradient overlay)
      '<div style="position:absolute;top:0;left:0;width:100%;z-index:10;' +
        'background:linear-gradient(rgba(0,0,0,0.5),transparent);padding:0.5rem 1rem 1.5rem;pointer-events:none;">' +
        '<p id="ar-hint" style="margin:0;text-align:center;color:rgba(255,255,255,0.9);' +
          'font-size:0.85rem;text-shadow:0 1px 4px rgba(0,0,0,0.8);">' +
          'Apunta a la <b>base</b> del árbol y presiona <b>+</b></p>' +
      '</div>' +

      // Gyro status (shows briefly if no gyro)
      '<div id="ar-gyro-status" style="display:none;position:absolute;top:3rem;left:50%;transform:translateX(-50%);' +
        'z-index:10;background:rgba(200,50,50,0.8);color:#fff;padding:0.3rem 0.8rem;border-radius:20px;' +
        'font-size:0.75rem;pointer-events:none;"></div>' +

      // Close button (top-right)
      '<button onclick="closeARHeightMeasure()" style="position:absolute;top:0.5rem;right:0.5rem;z-index:11;' +
        'width:38px;height:38px;border-radius:50%;border:none;background:rgba(60,60,60,0.7);' +
        'color:#fff;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">✕</button>' +

      // Crosshair (center — white circle + dot, Measure style)
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;pointer-events:none;">' +
        '<div style="width:36px;height:36px;border:1.5px solid rgba(255,255,255,0.6);border-radius:50%;' +
          'display:flex;align-items:center;justify-content:center;">' +
          '<div style="width:5px;height:5px;background:rgba(255,255,255,0.9);border-radius:50%;"></div>' +
        '</div>' +
      '</div>' +

      // Bottom bar (+ button, undo)
      '<div id="ar-btm" style="position:absolute;bottom:0;left:0;width:100%;z-index:10;' +
        'background:linear-gradient(transparent,rgba(0,0,0,0.6));padding:1.5rem 1rem 1.2rem;' +
        'display:flex;align-items:center;justify-content:center;gap:2rem;">' +

        '<button id="ar-undo" onclick="_arUndo()" style="width:42px;height:42px;border-radius:50%;border:none;' +
          'background:rgba(255,255,255,0.15);color:#fff;font-size:1.1rem;cursor:pointer;' +
          'display:none;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">↩</button>' +

        '<button id="ar-add" onclick="_arAdd()" style="width:60px;height:60px;border-radius:50%;' +
          'border:3px solid rgba(255,255,255,0.9);background:rgba(255,255,255,0.15);color:#fff;' +
          'font-size:1.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
          'font-weight:300;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
          'box-shadow:0 2px 12px rgba(0,0,0,0.3);">+</button>' +

        '<div style="width:42px;"></div>' +
      '</div>' +

    '</div>';

  document.body.appendChild(ov);

  // ---- START CAMERA ----
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(function(s) {
    arM.stream = s;
    var v = document.getElementById('ar-vid');
    if (!v) return;
    v.srcObject = s;
    v.play().catch(function() {});
    _arSyncCv();

    // Check gyro status after 1.5s
    setTimeout(function() {
      if (!arM.gyroReady) {
        var gs = document.getElementById('ar-gyro-status');
        if (gs) {
          gs.style.display = 'block';
          gs.textContent = '⚠ Sin giroscopio — medición menos precisa';
        }
      }
    }, 1500);
  }).catch(function(e) {
    console.error('Cam:', e);
    if (typeof showToast === 'function') showToast('Error accediendo a la cámara.', 'error');
    closeARHeightMeasure();
  });
}

// ============================================================================
// GYROSCOPE LISTENER
// ============================================================================
function _arListenGyro() {
  if (arM.gyroH) return; // already listening
  var smoothing = 0.15; // Low-pass filter: 0=ignore new data, 1=no smoothing. 0.15 = very smooth.
  var h = function(e) {
    if (e.beta !== null) {
      arM.hasGyro = true;
      arM.gyroReady = true;
      // Low-pass filter to eliminate jitter and stabilize the base point
      if (arM.curBeta === null) {
        arM.curBeta = e.beta; // first reading, take directly
      } else {
        arM.curBeta = arM.curBeta * (1 - smoothing) + e.beta * smoothing;
      }
      // Hide warning if shown
      var gs = document.getElementById('ar-gyro-status');
      if (gs) gs.style.display = 'none';
    }
  };
  window.addEventListener('deviceorientation', h);
  arM.gyroH = h;
}

// beta → angle from horizontal (degrees)
function _b2a(beta) { return 90 - beta; }

// ============================================================================
// CANVAS SYNC
// ============================================================================
function _arSyncCv() {
  var c = document.getElementById('ar-cv');
  if (!c) return null;
  var r = c.getBoundingClientRect();
  var d = window.devicePixelRatio || 1;
  var nw = Math.round(r.width * d);
  var nh = Math.round(r.height * d);
  if (Math.abs(c.width - nw) > 5 || Math.abs(c.height - nh) > 5) {
    c.width = nw; c.height = nh;
  }
  return c;
}

// ============================================================================
// + BUTTON
// ============================================================================
function _arAdd() {
  if (arM.step === 0) {
    // ---- MARK BASE ----

    // Check if gyro is ready
    if (!arM.gyroReady || arM.curBeta === null) {
      // No gyro — try to use it anyway, or warn
      if (!arM.hasGyro) {
        // Show manual distance prompt as fallback
        _arShowManualFallback();
        return;
      }
    }

    arM.baseBeta = arM.curBeta;

    // Auto-calculate distance: dist = phoneHeight / tan(angle_below_horizontal)
    var angleDeg = _b2a(arM.baseBeta); // negative means looking down
    var angleRad = Math.abs(angleDeg) * Math.PI / 180;
    if (angleRad > 0.05) { // at least ~3°
      arM.dist = arM.phoneH / Math.tan(angleRad);
      arM.dist = Math.max(0.5, Math.min(arM.dist, 80));
    } else {
      arM.dist = 5; // nearly horizontal, use default
    }

    arM.step = 1;

    // Update UI
    document.getElementById('ar-hint').innerHTML =
      'Mueve hacia la <b>cima</b> y presiona <b>+</b>';
    document.getElementById('ar-undo').style.display = 'flex';
    var btn = document.getElementById('ar-add');
    btn.style.borderColor = '#4CAF50';
    btn.style.background = 'rgba(76,175,80,0.25)';

    // Start animation
    _arSyncCv();
    _arStartAnim();

  } else if (arM.step === 1) {
    // ---- MARK TOP ----
    arM.topBeta = arM.curBeta;
    arM.step = 2;

    _arStopAnim();

    var h = _arCalcH(arM.topBeta);
    arM.height = Math.max(Math.abs(h), 1);

    _arDrawFinal();
    _arShowResult(arM.height);
  }
}

// ============================================================================
// MANUAL FALLBACK (when no gyroscope)
// ============================================================================
function _arShowManualFallback() {
  var hint = document.getElementById('ar-hint');
  if (hint) {
    hint.innerHTML =
      'Giroscopio no disponible.<br>' +
      '<span style="font-size:0.75rem;">Toca la BASE en la pantalla, luego la CIMA.</span>';
  }
  // Switch to tap-based mode
  arM.dist = 5; // default distance
  arM.step = 10; // special step for manual mode

  // Enable direct screen taps
  var box = document.getElementById('ar-box');
  box.addEventListener('touchend', _arManualTap, false);
  box.addEventListener('click', _arManualTap, false);

  // Show distance input
  var btm = document.getElementById('ar-btm');
  btm.innerHTML =
    '<div style="text-align:center;width:100%;">' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:0.5rem;">' +
        '<span style="color:#aaa;font-size:0.8rem;">Distancia:</span>' +
        '<input type="number" id="ar-man-dist" value="5" min="0.5" max="100" step="0.5" ' +
          'style="width:70px;padding:0.4rem;border:1.5px solid #4CAF50;border-radius:6px;' +
          'font-size:0.9rem;text-align:center;background:rgba(255,255,255,0.9);color:#333;">' +
        '<span style="color:#aaa;font-size:0.8rem;">m</span>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center;">' +
        '<button onclick="_arUndo()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;' +
          'padding:0.4rem 1rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">↩ Reiniciar</button>' +
        '<button onclick="closeARHeightMeasure()" style="background:rgba(200,50,50,0.7);color:#fff;border:none;' +
          'padding:0.4rem 1rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">✕ Cerrar</button>' +
      '</div>' +
    '</div>';
}

var _arManualBase = null;
function _arManualTap(e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'button' || tag === 'input') return;
  if (e.type === 'touchend') e.preventDefault();

  var box = document.getElementById('ar-box');
  var rect = box.getBoundingClientRect();
  var cy = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY) - rect.top;
  var fracY = cy / rect.height;

  if (!_arManualBase) {
    // Mark base
    _arManualBase = fracY;
    document.getElementById('ar-hint').innerHTML =
      'Ahora toca la <b>CIMA</b> del árbol en la pantalla.';
  } else {
    // Mark top
    var topFracY = fracY;
    var distInput = document.getElementById('ar-man-dist');
    var dist = distInput ? parseFloat(distInput.value) || 5 : 5;

    // Calculate using FOV
    var vfov = 60;
    var halfFov = (vfov / 2) * Math.PI / 180;
    var center = 0.5;

    var baseAngle = Math.atan(((center - _arManualBase) / 0.5) * Math.tan(halfFov));
    var topAngle = Math.atan(((center - topFracY) / 0.5) * Math.tan(halfFov));
    var hMeters = dist * (Math.tan(topAngle) - Math.tan(baseAngle));
    var hCm = Math.max(Math.abs(hMeters) * 100, 1);

    arM.height = hCm;
    arM.dist = dist;
    arM.step = 2;

    // Remove listeners
    box.removeEventListener('touchend', _arManualTap);
    box.removeEventListener('click', _arManualTap);
    _arManualBase = null;

    _arShowResult(hCm);
  }
}

// ============================================================================
// HEIGHT CALCULATION (gyro mode)
// ============================================================================
function _arCalcH(currentBeta) {
  if (!arM.dist || arM.baseBeta === null || currentBeta === null) return 0;
  var baseA = _b2a(arM.baseBeta) * Math.PI / 180;
  var curA = _b2a(currentBeta) * Math.PI / 180;
  return arM.dist * (Math.tan(curA) - Math.tan(baseA)) * 100; // cm
}

// ============================================================================
// ANIMATION — Live tracking
// ============================================================================
function _arStartAnim() {
  var vfov = 60;

  function frame() {
    try {
      if (arM.step !== 1) return;

      var c = _arSyncCv();
      if (!c || c.width < 10) {
        arM.animId = requestAnimationFrame(frame);
        return;
      }

      var ctx = c.getContext('2d');
      var W = c.width;
      var H = c.height;
      var dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, W, H);

      var pixPerDeg = H / vfov;

      // ---- TAP-TO-PLACE: base point stays FIXED at screen center ----
      // The dot does NOT follow the gyroscope. Once placed, it's locked on
      // screen at H/2. The crosshair (also at H/2) is what the user re-aims
      // at the tree top. The line we draw represents the tilt offset using
      // a virtual "top indicator" anchored above the base by an amount
      // proportional to (baseBeta - curBeta).
      var baseScreenX = W / 2;
      var baseScreenY = H / 2; // FROZEN — never moves with gyro
      var clampedBaseY = baseScreenY;

      // Crosshair center
      var crossX = W / 2;
      var crossY = H / 2;

      // Calculate live height
      var liveH = Math.abs(_arCalcH(arM.curBeta));

      // Virtual "top indicator": where the new mark would land if user pressed
      // + right now. Anchored above the base by gyro delta. Used purely as a
      // visual cue so the user sees how much they've tilted.
      var topIndicatorY = crossY;
      if (arM.hasGyro && arM.baseBeta !== null && arM.curBeta !== null) {
        var deltaDeg = arM.baseBeta - arM.curBeta; // positive when tilted up
        topIndicatorY = baseScreenY - Math.max(0, deltaDeg * pixPerDeg);
      }
      // Clamp inside viewport
      topIndicatorY = Math.max(20 * dpr, Math.min(topIndicatorY, H - 20 * dpr));

      // ---- DRAW THE MEASUREMENT LINE ----
      // Line goes from the FIXED base dot up to the virtual top indicator.
      var lineLen = Math.abs(baseScreenY - topIndicatorY);

      if (lineLen > 3) {
        // Glow
        ctx.save();
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.lineDashOffset = -(Date.now() / 50) % (8 * dpr);
        ctx.strokeStyle = 'rgba(76,175,80,0.18)';
        ctx.lineWidth = 10 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseScreenX, baseScreenY);
        ctx.lineTo(baseScreenX, topIndicatorY);
        ctx.stroke();
        ctx.restore();

        // Main dotted line (green, Measure style)
        ctx.save();
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.lineDashOffset = -(Date.now() / 50) % (8 * dpr);
        ctx.strokeStyle = 'rgba(76,175,80,0.95)';
        ctx.lineWidth = 2.5 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseScreenX, baseScreenY);
        ctx.lineTo(baseScreenX, topIndicatorY);
        ctx.stroke();
        ctx.restore();
      }

      // ---- BASE DOT (green, FROZEN at H/2) ----
      ctx.beginPath();
      ctx.arc(baseScreenX, baseScreenY, 6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76,175,80,1)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(baseScreenX, baseScreenY, 6 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();

      // ---- TOP INDICATOR (small ring at top of line) ----
      if (lineLen > 8) {
        ctx.beginPath();
        ctx.arc(baseScreenX, topIndicatorY, 5 * dpr, 0, Math.PI * 2);
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
      }

      // ---- MEASUREMENT LABEL (pill, Measure style) ----
      var txt;
      if (liveH >= 100) {
        txt = liveH.toFixed(0) + ' cm';
      } else if (liveH >= 1) {
        txt = liveH.toFixed(1) + ' cm';
      } else {
        txt = '0 cm';
      }

      // Position: near the midpoint of the line, offset right
      var labelMidY = (baseScreenY + topIndicatorY) / 2;
      var labelX = baseScreenX + 25 * dpr;

      ctx.font = (14 * dpr) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      var tw = ctx.measureText(txt).width;
      var px = 8 * dpr, py = 5 * dpr;
      var pillW = tw + px * 2;
      var pillH = 16 * dpr + py * 2;
      var pillR = pillH / 2;

      // Pill background
      ctx.fillStyle = 'rgba(45,45,45,0.88)';
      ctx.beginPath();
      ctx.moveTo(labelX + pillR, labelMidY - pillH / 2);
      ctx.lineTo(labelX + pillW - pillR, labelMidY - pillH / 2);
      ctx.arc(labelX + pillW - pillR, labelMidY, pillR, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(labelX + pillR, labelMidY + pillH / 2);
      ctx.arc(labelX + pillR, labelMidY, pillR, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, labelX + px, labelMidY);

      // ---- HINT if user hasn't moved ----
      if (liveH < 2 && lineLen < 10) {
        ctx.font = (11 * dpr) + 'px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('↑ Inclina hacia arriba', W / 2, crossY - 40 * dpr);
      }

      // ---- Distance info (small, bottom-right) ----
      ctx.font = (10 * dpr) + 'px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'right';
      ctx.fillText('dist: ' + arM.dist.toFixed(1) + 'm', W - 10 * dpr, H - 80 * dpr);

      arM.animId = requestAnimationFrame(frame);
    } catch (e) {
      console.error('AR frame:', e);
      arM.animId = requestAnimationFrame(frame);
    }
  }
  arM.animId = requestAnimationFrame(frame);
}

function _arStopAnim() {
  if (arM.animId) { cancelAnimationFrame(arM.animId); arM.animId = null; }
}

// ============================================================================
// FINAL DRAW
// ============================================================================
function _arDrawFinal() {
  var c = _arSyncCv();
  if (!c) return;
  var ctx = c.getContext('2d');
  var W = c.width, H = c.height;
  var dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, W, H);

  // Tap-to-place: base stays FIXED at H/2; top sits above by gyro delta
  var pixPerDeg = H / 60;
  var baseY = H / 2;
  var topY = H / 2;
  if (arM.hasGyro && arM.baseBeta !== null && arM.topBeta !== null) {
    var d = Math.max(0, arM.baseBeta - arM.topBeta);
    topY = baseY - d * pixPerDeg;
  }
  topY = Math.max(20 * dpr, Math.min(topY, H - 20 * dpr));

  // Line
  ctx.save();
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.strokeStyle = 'rgba(76,175,80,0.95)';
  ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(W / 2, baseY);
  ctx.lineTo(W / 2, topY);
  ctx.stroke();
  ctx.restore();

  // Base dot (green, white border)
  ctx.beginPath();
  ctx.arc(W / 2, baseY, 6 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(76,175,80,1)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, baseY, 6 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#fff';
  ctx.stroke();

  // Top dot (white)
  ctx.beginPath();
  ctx.arc(W / 2, topY, 5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Label
  var midY = (baseY + topY) / 2;
  var h = arM.height || 0;
  var txt = h >= 100 ? h.toFixed(0) + ' cm' : h.toFixed(1) + ' cm';
  ctx.font = 'bold ' + (15 * dpr) + 'px -apple-system, sans-serif';
  var tw = ctx.measureText(txt).width;
  var px = 10 * dpr, py = 6 * dpr;
  var pillW = tw + px * 2, pillH = 18 * dpr + py * 2;
  var lx = W / 2 + 20 * dpr, pillR = pillH / 2;

  ctx.fillStyle = 'rgba(45,45,45,0.9)';
  ctx.beginPath();
  ctx.moveTo(lx + pillR, midY - pillH / 2);
  ctx.lineTo(lx + pillW - pillR, midY - pillH / 2);
  ctx.arc(lx + pillW - pillR, midY, pillR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(lx + pillR, midY + pillH / 2);
  ctx.arc(lx + pillR, midY, pillR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, lx + px, midY);
}

// ============================================================================
// RESULT CARD
// ============================================================================
function _arShowResult(height) {
  var el = document.createElement('div');
  el.id = 'ar-result';
  el.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;z-index:10001;' +
    'display:flex;justify-content:center;padding:0.8rem;';

  var disp = height >= 100 ? height.toFixed(0) : height.toFixed(1);
  var m = (height / 100).toFixed(2);

  el.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:1rem 1.2rem;text-align:center;' +
      'max-width:320px;width:100%;box-shadow:0 -2px 20px rgba(0,0,0,0.25);">' +
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:0.3rem;">' +
        '<span style="font-size:2rem;font-weight:700;color:#333;">' + disp + '</span>' +
        '<span style="font-size:0.9rem;color:#888;">cm</span>' +
        '<span style="font-size:0.85rem;color:#aaa;margin-left:0.4rem;">(' + m + ' m)</span>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center;margin-top:0.8rem;">' +
        '<button onclick="arUseVal(' + height.toFixed(1) + ')" style="flex:1;max-width:140px;background:#4CAF50;color:#fff;' +
          'border:none;padding:0.6rem;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;">Usar</button>' +
        '<button onclick="_arUndo()" style="flex:1;max-width:140px;background:#f0f0f0;color:#333;' +
          'border:none;padding:0.6rem;border-radius:10px;font-size:0.9rem;cursor:pointer;">Reintentar</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(el);
  var addBtn = document.getElementById('ar-add');
  if (addBtn) addBtn.style.display = 'none';
}

// ============================================================================
// UNDO / USE / CLOSE
// ============================================================================
function _arUndo() {
  _arStopAnim();
  arM.step = 0;
  arM.baseBeta = null;
  arM.topBeta = null;
  arM.dist = null;
  arM.height = null;
  _arManualBase = null;

  var c = document.getElementById('ar-cv');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);

  document.getElementById('ar-hint').innerHTML =
    'Apunta a la <b>base</b> del árbol y presiona <b>+</b>';

  var undo = document.getElementById('ar-undo');
  if (undo) undo.style.display = 'none';

  var addBtn = document.getElementById('ar-add');
  if (addBtn) {
    addBtn.style.display = 'flex';
    addBtn.style.borderColor = 'rgba(255,255,255,0.9)';
    addBtn.style.background = 'rgba(255,255,255,0.15)';
  }

  var r = document.getElementById('ar-result');
  if (r) r.remove();

  // Re-check if we need manual fallback mode
  var box = document.getElementById('ar-box');
  if (box) {
    box.removeEventListener('touchend', _arManualTap);
    box.removeEventListener('click', _arManualTap);
  }
}

function arUseVal(h) {
  var inp = document.getElementById('meas-height');
  if (inp) {
    inp.value = h;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  if (typeof showToast === 'function') showToast('Altura cargada en el formulario', 'success');
}

function closeARHeightMeasure() {
  _arStopAnim();
  if (arM.gyroH) { window.removeEventListener('deviceorientation', arM.gyroH); arM.gyroH = null; }
  if (arM.stream) { arM.stream.getTracks().forEach(function(t) { t.stop(); }); arM.stream = null; }
  var ov = document.getElementById('ar-ov');
  if (ov) {
    var v = ov.querySelector('#ar-vid');
    if (v && v.srcObject) v.srcObject.getTracks().forEach(function(t) { t.stop(); });
    ov.remove();
  }
  var r = document.getElementById('ar-result');
  if (r) r.remove();
}

window.openARHeightMeasure = openARHeightMeasure;

