// ============================================================================
// AR Height Measurement — Measure-app style
// Gyroscope-tracked base point + auto distance + clean minimal UI
// ============================================================================

var arM = {
  step: 0,         // 0=ready, 1=base marked (live tracking), 2=done
  stream: null,
  animId: null,
  gyroH: null,
  hasGyro: false,

  // Gyroscope
  curBeta: null,    // current device beta (live)
  baseBeta: null,   // beta when base was tapped
  topBeta: null,    // beta when top was tapped

  // Base point screen position (fraction 0–1 of the camera area)
  baseFracX: 0.5,
  baseFracY: 0.5,

  // Calculations
  phoneH: 1.5,     // assumed phone height above ground (m)
  dist: null,       // auto-calculated distance (m)
  height: null,     // final height (cm)

  // Camera area bounds (excluding UI bars)
  camTop: 0,
  camBot: 0,
};

// ============================================================================
// OPEN
// ============================================================================
function openARHeightMeasure() {
  arM = {
    step: 0, stream: null, animId: null, gyroH: null, hasGyro: false,
    curBeta: null, baseBeta: null, topBeta: null,
    baseFracX: 0.5, baseFracY: 0.5,
    phoneH: 1.5, dist: null, height: null, camTop: 0, camBot: 0,
  };

  var ov = document.createElement('div');
  ov.id = 'ar-ov';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:9999;';
  ov.innerHTML =
    '<div id="ar-box" style="position:relative;width:100%;height:100%;overflow:hidden;">' +

      // Video
      '<video id="ar-vid" autoplay playsinline muted ' +
        'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +

      // Canvas (for line drawing)
      '<canvas id="ar-cv" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;"></canvas>' +

      // ---- MINIMAL UI (like Measure app) ----

      // Top instruction bar (translucent, compact)
      '<div id="ar-top" style="position:absolute;top:0;left:0;width:100%;z-index:10;' +
        'background:linear-gradient(rgba(0,0,0,0.6),transparent);padding:0.6rem 1rem 1.5rem;pointer-events:none;">' +
        '<p id="ar-hint" style="margin:0;text-align:center;color:rgba(255,255,255,0.9);' +
          'font-size:0.85rem;font-weight:500;text-shadow:0 1px 4px rgba(0,0,0,0.7);">' +
          'Apunta a la base del árbol y presiona <b>+</b></p>' +
      '</div>' +

      // Close button (top-right)
      '<button id="ar-close" onclick="closeARHeightMeasure()" style="position:absolute;top:0.6rem;right:0.6rem;z-index:11;' +
        'width:40px;height:40px;border-radius:50%;border:none;background:rgba(0,0,0,0.5);' +
        'color:#fff;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">✕</button>' +

      // Crosshair (center, like Measure app — subtle white circle + dot)
      '<div id="ar-cross" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;pointer-events:none;">' +
        '<div style="width:40px;height:40px;border:1.5px solid rgba(255,255,255,0.7);border-radius:50%;' +
          'position:relative;display:flex;align-items:center;justify-content:center;">' +
          '<div style="width:6px;height:6px;background:#fff;border-radius:50%;"></div>' +
        '</div>' +
      '</div>' +

      // Bottom controls (minimal — + button center, undo left)
      '<div id="ar-btm" style="position:absolute;bottom:0;left:0;width:100%;z-index:10;' +
        'background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:1.5rem 1rem 1.2rem;' +
        'display:flex;align-items:center;justify-content:center;gap:2rem;">' +

        // Undo button (left)
        '<button id="ar-undo" onclick="arUndo()" style="width:44px;height:44px;border-radius:50%;border:none;' +
          'background:rgba(255,255,255,0.15);color:#fff;font-size:1.2rem;cursor:pointer;' +
          'display:none;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">↩</button>' +

        // + button (center, large)
        '<button id="ar-add" onclick="arAdd()" style="width:64px;height:64px;border-radius:50%;border:3px solid #fff;' +
          'background:rgba(255,255,255,0.2);color:#fff;font-size:2rem;cursor:pointer;' +
          'display:flex;align-items:center;justify-content:center;font-weight:300;' +
          'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
          'box-shadow:0 2px 12px rgba(0,0,0,0.3);">+</button>' +

        // Spacer (right, to balance undo)
        '<div style="width:44px;height:44px;"></div>' +
      '</div>' +

    '</div>';

  document.body.appendChild(ov);

  // Start camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(function(s) {
    arM.stream = s;
    var v = document.getElementById('ar-vid');
    if (!v) return;
    v.srcObject = s;
    var p = v.play();
    if (p && p.catch) p.catch(function() {});
    arInitGyro();
    arSyncCv();
  }).catch(function(e) {
    console.error('Cam:', e);
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
    // iOS — request on first user gesture (the + button tap)
    arM.hasGyro = false;
  } else if ('DeviceOrientationEvent' in window) {
    arListenGyro();
  }
}

function arReqGyroiOS() {
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
      arM.hasGyro = true;
      arM.curBeta = e.beta;
    }
  };
  window.addEventListener('deviceorientation', h);
  arM.gyroH = h;
}

// beta → angle from horizontal in degrees
// vertical phone: beta≈90 → angle=0°
// tilted back (looking up): beta<90 → positive angle
// tilted forward (looking down): beta>90 → negative angle
function b2a(beta) { return 90 - beta; }

// ============================================================================
// CANVAS SYNC
// ============================================================================
function arSyncCv() {
  var c = document.getElementById('ar-cv');
  if (!c) return null;
  var r = c.getBoundingClientRect();
  var d = window.devicePixelRatio || 1;
  var nw = Math.round(r.width * d);
  var nh = Math.round(r.height * d);
  if (Math.abs(c.width - nw) > 5 || Math.abs(c.height - nh) > 5) {
    c.width = nw;
    c.height = nh;
  }
  return c;
}

// ============================================================================
// + BUTTON — Add point (base or top)
// ============================================================================
function arAdd() {
  // iOS: request gyro on first tap
  if (!arM.hasGyro) arReqGyroiOS();

  if (arM.step === 0) {
    // ==== MARK BASE ====
    arM.baseBeta = arM.curBeta;

    // Base is at center of screen (where crosshair is)
    arM.baseFracX = 0.5;
    arM.baseFracY = 0.5;

    // Auto-calculate distance from phone height + tilt angle
    if (arM.hasGyro && arM.baseBeta !== null) {
      var angleDown = Math.abs(b2a(arM.baseBeta)); // degrees below horizontal
      var angleRad = angleDown * Math.PI / 180;
      if (angleRad > 0.05) { // need at least ~3° tilt
        arM.dist = arM.phoneH / Math.tan(angleRad);
        arM.dist = Math.max(0.5, Math.min(arM.dist, 100));
      } else {
        arM.dist = 5; // fallback
      }
    } else {
      arM.dist = 5; // no gyro fallback
    }

    arM.step = 1;

    // Update UI
    document.getElementById('ar-hint').innerHTML =
      'Mueve hacia la cima del árbol y presiona <b>+</b>';
    document.getElementById('ar-undo').style.display = 'flex';

    // Change + button color to indicate "active measurement"
    var btn = document.getElementById('ar-add');
    btn.style.borderColor = '#4CAF50';
    btn.style.background = 'rgba(76,175,80,0.3)';

    // Start animation
    arSyncCv();
    arStartAnim();

  } else if (arM.step === 1) {
    // ==== MARK TOP ====
    arM.topBeta = arM.curBeta;
    arM.step = 2;

    arStopAnim();

    // Calculate final height
    var h = arCalcH(arM.topBeta || arM.baseBeta);
    arM.height = Math.max(Math.abs(h), 1);

    // Draw final state on canvas
    arDrawFinal();

    // Show result
    arShowResult(arM.height);
  }
}

// ============================================================================
// UNDO — go back to step 0
// ============================================================================
function arUndo() {
  arStopAnim();
  arM.step = 0;
  arM.baseBeta = null;
  arM.topBeta = null;
  arM.dist = null;
  arM.height = null;

  // Clear canvas
  var c = document.getElementById('ar-cv');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);

  // Reset UI
  document.getElementById('ar-hint').innerHTML =
    'Apunta a la base del árbol y presiona <b>+</b>';
  document.getElementById('ar-undo').style.display = 'none';
  var btn = document.getElementById('ar-add');
  btn.style.borderColor = '#fff';
  btn.style.background = 'rgba(255,255,255,0.2)';

  // Remove result
  var r = document.getElementById('ar-result');
  if (r) r.remove();
}

// ============================================================================
// HEIGHT CALCULATION
// ============================================================================
function arCalcH(currentBeta) {
  if (!arM.dist || arM.baseBeta === null || currentBeta === null) return 0;
  var baseA = b2a(arM.baseBeta) * Math.PI / 180;
  var curA = b2a(currentBeta) * Math.PI / 180;
  return arM.dist * (Math.tan(curA) - Math.tan(baseA)) * 100; // cm
}

// ============================================================================
// ANIMATION — Live line + measurement (Measure-app style)
// ============================================================================
function arStartAnim() {
  var vfov = 60; // degrees — approximate smartphone vertical FOV
  var pixPerDeg; // will calculate based on canvas height

  function frame() {
    try {
      if (arM.step !== 1) return;

      var c = arSyncCv();
      if (!c || c.width < 10 || c.height < 10) {
        arM.animId = requestAnimationFrame(frame);
        return;
      }

      var ctx = c.getContext('2d');
      var W = c.width;
      var H = c.height;
      var dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, W, H);

      // Pixels per degree of tilt
      pixPerDeg = H / vfov;

      // ---- Track base point position ----
      // When user marked base, it was at center (0.5, 0.5).
      // As they tilt up (baseBeta decreases), the base moves DOWN on screen.
      var baseX = W / 2;
      var baseY = H / 2; // start at center

      if (arM.hasGyro && arM.baseBeta !== null && arM.curBeta !== null) {
        var deltaDeg = arM.baseBeta - arM.curBeta;
        // positive deltaDeg = tilted up = base should move down
        baseY = H / 2 + (deltaDeg * pixPerDeg);
      }

      // Crosshair position (always center)
      var crossX = W / 2;
      var crossY = H / 2;

      // Calculate live height
      var liveH = Math.abs(arCalcH(arM.curBeta || arM.baseBeta));

      // ---- DRAW DOTTED LINE from base to crosshair ----
      // Clamp base Y to stay on screen (but allow slightly off for effect)
      var drawBaseY = Math.min(baseY, H + 20 * dpr);

      // Line style: white dotted chain (like Measure app)
      // Outer glow
      ctx.save();
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineDashOffset = -(Date.now() / 60) % (8 * dpr);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 8 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, drawBaseY);
      ctx.lineTo(crossX, crossY);
      ctx.stroke();
      ctx.restore();

      // Main dotted line (white, like Measure app)
      ctx.save();
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineDashOffset = -(Date.now() / 60) % (8 * dpr);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, drawBaseY);
      ctx.lineTo(crossX, crossY);
      ctx.stroke();
      ctx.restore();

      // ---- BASE DOT (if still on screen) ----
      if (drawBaseY < H) {
        ctx.beginPath();
        ctx.arc(baseX, drawBaseY, 5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }

      // ---- MEASUREMENT LABEL (floating near line midpoint, like Measure) ----
      var midY = (drawBaseY + crossY) / 2;
      // Position label to the right of the line
      var labelX = baseX + 20 * dpr;

      var txt;
      if (liveH >= 100) {
        txt = liveH.toFixed(0) + ' cm';
      } else {
        txt = liveH.toFixed(1) + ' cm';
      }

      ctx.font = (15 * dpr) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      var tw = ctx.measureText(txt).width;
      var px = 8 * dpr;
      var py = 5 * dpr;
      var lh = 18 * dpr;

      // Pill-shaped background (like Measure app label)
      var pillW = tw + px * 2;
      var pillH = lh + py * 2;
      var pillX = labelX;
      var pillY = midY - pillH / 2;
      var pillR = pillH / 2; // fully rounded ends

      ctx.fillStyle = 'rgba(50,50,50,0.85)';
      ctx.beginPath();
      // Rounded rect manually
      ctx.moveTo(pillX + pillR, pillY);
      ctx.lineTo(pillX + pillW - pillR, pillY);
      ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
      ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
      ctx.lineTo(pillX + pillR, pillY + pillH);
      ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
      ctx.lineTo(pillX, pillY + pillR);
      ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, pillX + px, midY);

      // If height is very small and user hasn't moved, show hint
      if (liveH < 5) {
        ctx.font = (12 * dpr) + 'px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('↑ Inclina hacia arriba', W / 2, crossY - 50 * dpr);
      }

      arM.animId = requestAnimationFrame(frame);
    } catch (e) {
      console.error('AR frame:', e);
      arM.animId = requestAnimationFrame(frame);
    }
  }
  arM.animId = requestAnimationFrame(frame);
}

function arStopAnim() {
  if (arM.animId) {
    cancelAnimationFrame(arM.animId);
    arM.animId = null;
  }
}

// ============================================================================
// DRAW FINAL (locked measurement)
// ============================================================================
function arDrawFinal() {
  var c = arSyncCv();
  if (!c) return;
  var ctx = c.getContext('2d');
  var W = c.width;
  var H = c.height;
  var dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, W, H);

  var pixPerDeg = H / 60;

  // Base position
  var baseX = W / 2;
  var baseY = H / 2;
  if (arM.hasGyro && arM.baseBeta !== null && arM.topBeta !== null) {
    var delta = arM.baseBeta - arM.topBeta;
    baseY = H / 2 + (delta * pixPerDeg);
  }
  baseY = Math.min(baseY, H - 10);
  var crossY = H / 2;

  // Solid line
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2 * dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(baseX, crossY);
  ctx.stroke();
  ctx.restore();

  // Dots
  ctx.beginPath();
  ctx.arc(baseX, baseY, 5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(baseX, crossY, 5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Label
  var midY = (baseY + crossY) / 2;
  var h = arM.height || 0;
  var txt = h >= 100 ? h.toFixed(0) + ' cm' : h.toFixed(1) + ' cm';

  ctx.font = 'bold ' + (16 * dpr) + 'px -apple-system, sans-serif';
  var tw = ctx.measureText(txt).width;
  var px = 10 * dpr, py = 6 * dpr;
  var pillW = tw + px * 2;
  var pillH = 20 * dpr + py * 2;
  var pillX = baseX + 20 * dpr;
  var pillY = midY - pillH / 2;
  var pillR = pillH / 2;

  ctx.fillStyle = 'rgba(50,50,50,0.9)';
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
  ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, pillX + px, midY);
}

// ============================================================================
// RESULT
// ============================================================================
function arShowResult(height) {
  var el = document.createElement('div');
  el.id = 'ar-result';
  el.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;z-index:10001;' +
    'display:flex;justify-content:center;padding:1rem;';

  var disp = height >= 100 ? height.toFixed(0) : height.toFixed(1);
  var m = (height / 100).toFixed(2);
  var d = arM.dist ? arM.dist.toFixed(1) : '?';

  el.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:1.2rem 1.5rem;text-align:center;' +
      'max-width:340px;width:100%;box-shadow:0 -4px 24px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:0.3rem;">' +
        '<span style="font-size:2rem;font-weight:700;color:#333;">' + disp + '</span>' +
        '<span style="font-size:1rem;color:#888;">cm</span>' +
        '<span style="font-size:0.9rem;color:#aaa;margin-left:0.5rem;">(' + m + ' m)</span>' +
      '</div>' +
      '<div style="font-size:0.75rem;color:#999;margin:0.3rem 0 0.8rem;">Dist. estimada: ' + d + ' m' +
        (arM.hasGyro ? ' · Giroscopio ✓' : ' · Sin giroscopio') + '</div>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center;">' +
        '<button onclick="arUseVal(' + height.toFixed(1) + ')" style="flex:1;background:#4CAF50;color:#fff;border:none;' +
          'padding:0.65rem;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;">Usar</button>' +
        '<button onclick="arUndo()" style="flex:1;background:#f0f0f0;color:#333;border:none;' +
          'padding:0.65rem;border-radius:10px;font-size:0.9rem;cursor:pointer;">Reintentar</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(el);

  // Hide the + button
  var addBtn = document.getElementById('ar-add');
  if (addBtn) addBtn.style.display = 'none';
}

// ============================================================================
// USE VALUE
// ============================================================================
function arUseVal(h) {
  var inp = document.getElementById('meas-height');
  if (inp) {
    inp.value = h;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  if (typeof showToast === 'function') showToast('Altura cargada en el formulario', 'success');
}

// ============================================================================
// CLOSE
// ============================================================================
function closeARHeightMeasure() {
  arStopAnim();

  if (arM.gyroH) {
    window.removeEventListener('deviceorientation', arM.gyroH);
    arM.gyroH = null;
  }

  if (arM.stream) {
    arM.stream.getTracks().forEach(function(t) { t.stop(); });
    arM.stream = null;
  }

  var ov = document.getElementById('ar-ov');
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
