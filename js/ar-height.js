// ============================================================================
// AR Height Measurement — Measure-app style
// Gyroscope-tracked base point + auto distance + clean minimal UI
// ============================================================================

var arM = {
  step: 0,
  stream: null,
  animId: null,
  gyroH: null,
  hasGyro: false,
  gyroReady: false,

  curBeta: null,
  baseBeta: null,
  topBeta: null,

  // Posición DE TAP donde el usuario tocó. Sirve como ancla inicial
  // (en el instante del tap, el punto está exactamente ahí). Después
  // se ajusta con el delta del gyro para "pegarse" al punto del mundo.
  baseScreenX: null,
  baseScreenY: null,
  topScreenX: null,
  topScreenY: null,

  // Multiplicador de signo del gyro: por si el dispositivo reporta beta
  // al revés que esperamos. Toggle con botón "INV".
  gyroSign: 1,

  phoneH: 1.5,
  dist: null,
  height: null,
};

// ============================================================================
// OPEN
// ============================================================================
function openARHeightMeasure() {
  arM = {
    step: 0, stream: null, animId: null, gyroH: null,
    hasGyro: false, gyroReady: false,
    curBeta: null, baseBeta: null, topBeta: null,
    baseScreenX: null, baseScreenY: null,
    topScreenX: null, topScreenY: null,
    gyroSign: 1,
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
        'background:linear-gradient(rgba(0,0,0,0.55),transparent);padding:1rem 1rem 1.8rem;pointer-events:none;">' +
        '<p id="ar-hint" style="margin:0;text-align:center;color:rgba(255,255,255,0.95);' +
          'font-size:0.95rem;text-shadow:0 1px 4px rgba(0,0,0,0.85);font-weight:500;">' +
          'Apunta al <b>primer punto</b> y <b>toca la pantalla</b></p>' +
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

      // Crosshair (center — solo visible en step 0, antes del primer tap)
      '<div id="ar-html-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;pointer-events:none;">' +
        '<div style="width:36px;height:36px;border:1.5px solid rgba(255,255,255,0.7);border-radius:50%;' +
          'display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);">' +
          '<div style="width:5px;height:5px;background:rgba(255,255,255,1);border-radius:50%;"></div>' +
        '</div>' +
      '</div>' +

      // Tap-overlay invisible para capturar clicks/taps en TODA la pantalla
      // (ahora sin botón "+", el usuario toca cualquier parte para fijar puntos)
      '<div id="ar-tap-zone" onclick="_arTapToMark(event)" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;cursor:crosshair;"></div>' +

      // Bottom bar minimal: solo undo + indicador de step
      '<div id="ar-btm" style="position:absolute;bottom:0;left:0;width:100%;z-index:11;' +
        'background:linear-gradient(transparent,rgba(0,0,0,0.65));padding:1rem 1rem 1.2rem;' +
        'display:flex;align-items:center;justify-content:space-between;gap:1rem;pointer-events:none;">' +

        '<button id="ar-undo" onclick="_arUndo();event.stopPropagation();" style="pointer-events:auto;width:42px;height:42px;border-radius:50%;border:none;' +
          'background:rgba(255,255,255,0.20);color:#fff;font-size:1.2rem;cursor:pointer;' +
          'display:none;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
          'box-shadow:0 2px 8px rgba(0,0,0,0.3);">↩</button>' +

        '<div id="ar-step-indicator" style="flex:1;text-align:center;color:#fff;font-size:0.85rem;text-shadow:0 1px 4px rgba(0,0,0,0.8);">' +
          '<span id="ar-step-text">Paso 1 de 2</span>' +
        '</div>' +

        '<button id="ar-invert" onclick="_arToggleInvert();event.stopPropagation();" title="Invertir si el punto verde se mueve al revés" style="pointer-events:auto;width:42px;height:42px;border-radius:50%;border:none;' +
          'background:rgba(255,255,255,0.20);color:#fff;font-size:0.65rem;font-weight:600;cursor:pointer;' +
          'display:none;align-items:center;justify-content:center;line-height:1;' +
          'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
          'box-shadow:0 2px 8px rgba(0,0,0,0.3);">⇅<br>INV</button>' +
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
  // Filtro pasa-bajo MUY agresivo (0.06 = muy suave) para eliminar el jitter
  // que el usuario reportó. Una vez tapeado el base, agregamos también un
  // "deadzone" en step 1 para evitar que el dot baile con micro-movimientos.
  var smoothing = 0.06;
  var h = function(e) {
    if (e.beta !== null) {
      arM.hasGyro = true;
      arM.gyroReady = true;
      if (arM.curBeta === null) {
        arM.curBeta = e.beta;
      } else {
        // Aplicamos deadzone: cambios menores a 0.3° se ignoran (anti-jitter)
        var raw = arM.curBeta * (1 - smoothing) + e.beta * smoothing;
        if (Math.abs(raw - arM.curBeta) >= 0.05) {
          arM.curBeta = raw;
        }
      }
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
// TAP TO MARK — toca cualquier parte de la pantalla para fijar puntos
// Flujo:
//   Step 0: tap → marca BASE en (x,y) del tap, snapshot baseBeta
//   Step 1: el TOP indicator sigue el giroscopio, línea punteada animada,
//           tap → marca TOP, congela y muestra resultado
// ============================================================================
function _arTapToMark(e) {
  // Convertir coordenadas del tap a coordenadas del canvas
  var box = document.getElementById('ar-box');
  if (!box) return;
  var rect = box.getBoundingClientRect();
  var clientX = e.clientX != null ? e.clientX : (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX);
  var clientY = e.clientY != null ? e.clientY : (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY);
  if (clientX == null || clientY == null) return;

  var dpr = window.devicePixelRatio || 1;
  var tapX = (clientX - rect.left) * dpr;
  var tapY = (clientY - rect.top) * dpr;

  if (arM.step === 0) {
    // ---- MARK PUNTO 1 ----
    // El punto se queda EXACTAMENTE donde tocaste. NUNCA se mueve.
    // El gyro se usa solo para guardar el ángulo de cámara para calcular
    // la altura, no para mover el punto en pantalla.
    if (!arM.gyroReady || arM.curBeta === null) {
      if (!arM.hasGyro) {
        _arShowManualFallback();
        return;
      }
    }

    arM.baseBeta = arM.curBeta;
    arM.baseScreenX = tapX;
    arM.baseScreenY = tapY;

    // Auto-calculate distance basado en ángulo abajo del horizonte
    var angleDeg = _b2a(arM.baseBeta);
    var angleRad = Math.abs(angleDeg) * Math.PI / 180;
    if (angleRad > 0.05) {
      arM.dist = arM.phoneH / Math.tan(angleRad);
      arM.dist = Math.max(0.5, Math.min(arM.dist, 80));
    } else {
      arM.dist = 5;
    }

    arM.step = 1;

    document.getElementById('ar-hint').innerHTML =
      'Apunta al <b>segundo punto</b> y <b>toca la pantalla</b>';
    document.getElementById('ar-step-text').textContent = 'Paso 2 de 2';
    document.getElementById('ar-undo').style.display = 'flex';

    // Ocultar HTML crosshair — el cursor ahora se dibuja en canvas alineado
    // con el verde, para que la línea sea vertical y no diagonal.
    var hc = document.getElementById('ar-html-crosshair');
    if (hc) hc.style.display = 'none';

    _arSyncCv();
    _arStartAnim();

  } else if (arM.step === 1) {
    // ---- MARK PUNTO 2 ----
    // BLOQUEO VERTICAL: el punto 2 se alinea en la misma columna X
    // que el punto 1 — así la línea siempre es vertical (medir altura).
    // Solo respetamos la Y del tap.
    arM.topBeta = arM.curBeta;
    arM.topScreenX = arM.baseScreenX;
    arM.topScreenY = tapY;
    arM.step = 2;

    _arStopAnim();

    var h = _arCalcH(arM.topBeta);
    arM.height = Math.max(Math.abs(h), 1);

    _arDrawFinal();
    _arShowResult(arM.height);

    var tz = document.getElementById('ar-tap-zone');
    if (tz) tz.style.pointerEvents = 'none';
  }
}

// Compatibilidad con código legacy (manual fallback usa _arAdd?)
function _arAdd() { _arTapToMark({ clientX: window.innerWidth/2, clientY: window.innerHeight/2 }); }

// Toggle inversión del gyro (en caso de que el dispositivo reporte beta al revés
// y el punto verde se mueva en la dirección equivocada)
function _arToggleInvert() {
  arM.gyroSign = -arM.gyroSign;
  if (typeof showToast === 'function') {
    showToast('Dirección del gyro ' + (arM.gyroSign === 1 ? 'normal' : 'invertida'), 'info');
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

      // ---- PUNTO 1 (verde): donde tocaste, NO se mueve nunca ----
      var baseScreenX = arM.baseScreenX != null ? arM.baseScreenX : W / 2;
      var baseScreenY = arM.baseScreenY != null ? arM.baseScreenY : H / 2;

      // ---- CURSOR (preview punto 2): MISMA X que el verde, Y arriba ----
      // Línea vertical desde el verde hacia arriba. El cursor se posiciona
      // al centro VERTICAL de la pantalla pero alineado X con el verde.
      var topScreenX = baseScreenX;  // bloqueo vertical
      var topScreenY = H / 2;

      // Altura en vivo (siempre positiva)
      var liveH = Math.abs(_arCalcH(arM.curBeta));
      var lineLen = Math.abs(baseScreenY - topScreenY);

      // ---- LÍNEA PUNTEADA del BASE al TOP ----
      if (lineLen > 3) {
        // Glow
        ctx.save();
        ctx.setLineDash([5 * dpr, 5 * dpr]);
        ctx.lineDashOffset = -(Date.now() / 60) % (10 * dpr);
        ctx.strokeStyle = 'rgba(76,175,80,0.20)';
        ctx.lineWidth = 11 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseScreenX, baseScreenY);
        ctx.lineTo(topScreenX, topScreenY);
        ctx.stroke();
        ctx.restore();

        // Línea punteada principal
        ctx.save();
        ctx.setLineDash([5 * dpr, 5 * dpr]);
        ctx.lineDashOffset = -(Date.now() / 60) % (10 * dpr);
        ctx.strokeStyle = 'rgba(76,175,80,1)';
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseScreenX, baseScreenY);
        ctx.lineTo(topScreenX, topScreenY);
        ctx.stroke();
        ctx.restore();
      }

      // ---- PUNTO 1 (verde, screen-anchored, NO SE MUEVE) ----
      ctx.beginPath();
      ctx.arc(baseScreenX, baseScreenY, 16 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76,175,80,0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(baseScreenX, baseScreenY, 8 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76,175,80,1)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(baseScreenX, baseScreenY, 8 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();

      // ---- CURSOR para punto 2 (white circle alineado con verde) ----
      ctx.beginPath();
      ctx.arc(topScreenX, topScreenY, 14 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(topScreenX, topScreenY, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();

      // ---- MEASUREMENT LABEL (pill, Measure style) ----
      var txt;
      if (liveH >= 100) {
        txt = liveH.toFixed(0) + ' cm';
      } else if (liveH >= 1) {
        txt = liveH.toFixed(1) + ' cm';
      } else {
        txt = '0 cm';
      }

      // Position: EN MEDIO de la línea diagonal (mid X and mid Y)
      var labelX = (baseScreenX + topScreenX) / 2;
      var labelMidY = (baseScreenY + topScreenY) / 2;

      // Solo mostrar pill si la línea tiene longitud
      if (lineLen > 30) {
        ctx.font = 'bold ' + (15 * dpr) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        var tw = ctx.measureText(txt).width;
        var px = 11 * dpr, py = 7 * dpr;
        var pillW = tw + px * 2;
        var pillH = 18 * dpr + py * 2;
        var pillR = pillH / 2;
        // Centrada horizontalmente sobre la línea
        var pillLeft = labelX - pillW / 2;

        // Pill background con sombra
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 8 * dpr;
        ctx.shadowOffsetY = 2 * dpr;
        ctx.fillStyle = 'rgba(76,175,80,0.95)';
        ctx.beginPath();
        ctx.moveTo(pillLeft + pillR, labelMidY - pillH / 2);
        ctx.lineTo(pillLeft + pillW - pillR, labelMidY - pillH / 2);
        ctx.arc(pillLeft + pillW - pillR, labelMidY, pillR, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(pillLeft + pillR, labelMidY + pillH / 2);
        ctx.arc(pillLeft + pillR, labelMidY, pillR, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Text centrado
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, labelX, labelMidY);
      }

      // ---- HINT si el usuario aún no inclinó ----
      if (liveH < 2 && lineLen < 30) {
        ctx.font = 'bold ' + (12 * dpr) + 'px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText('↑ Inclina el celular hacia arriba', W / 2, baseScreenY - 50 * dpr);
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

  // Ambos puntos screen-anchored — exactamente donde el usuario tocó.
  var baseScreenX = arM.baseScreenX != null ? arM.baseScreenX : W / 2;
  var baseScreenY = arM.baseScreenY != null ? arM.baseScreenY : H / 2;
  var topX = arM.topScreenX != null ? arM.topScreenX : W / 2;
  var topY = arM.topScreenY != null ? arM.topScreenY : H / 2;

  // Línea punteada congelada entre punto 1 (verde) y punto 2 (azul)
  ctx.save();
  ctx.setLineDash([5 * dpr, 5 * dpr]);
  ctx.strokeStyle = 'rgba(76,175,80,1)';
  ctx.lineWidth = 3 * dpr;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseScreenX, baseScreenY);
  ctx.lineTo(topX, topY);
  ctx.stroke();
  ctx.restore();

  // Punto 1 (verde)
  ctx.beginPath();
  ctx.arc(baseScreenX, baseScreenY, 16 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(76,175,80,0.22)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(baseScreenX, baseScreenY, 8 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(76,175,80,1)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(baseScreenX, baseScreenY, 8 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 2.5 * dpr;
  ctx.strokeStyle = '#fff';
  ctx.stroke();

  // Punto 2 (azul)
  ctx.beginPath();
  ctx.arc(topX, topY, 18 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,180,230,0.22)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(topX, topY, 9 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,180,230,1)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(topX, topY, 9 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 2.5 * dpr;
  ctx.strokeStyle = '#fff';
  ctx.stroke();

  // Label centrado en medio de la línea diagonal
  var midX = (baseScreenX + topX) / 2;
  var midY = (baseScreenY + topY) / 2;
  var h = arM.height || 0;
  var txt = h >= 100 ? h.toFixed(0) + ' cm' : h.toFixed(1) + ' cm';
  ctx.font = 'bold ' + (16 * dpr) + 'px -apple-system, sans-serif';
  var tw = ctx.measureText(txt).width;
  var px = 12 * dpr, py = 8 * dpr;
  var pillW = tw + px * 2, pillH = 20 * dpr + py * 2;
  var lx = midX - pillW / 2;
  var pillR = pillH / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10 * dpr; ctx.shadowOffsetY = 2 * dpr;
  ctx.fillStyle = 'rgba(76,175,80,0.95)';
  ctx.beginPath();
  ctx.moveTo(lx + pillR, midY - pillH / 2);
  ctx.lineTo(lx + pillW - pillR, midY - pillH / 2);
  ctx.arc(lx + pillW - pillR, midY, pillR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(lx + pillR, midY + pillH / 2);
  ctx.arc(lx + pillR, midY, pillR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, midX, midY);
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
  arM.baseScreenX = null;
  arM.baseScreenY = null;
  arM.topScreenX = null;
  arM.topScreenY = null;
  arM.dist = null;
  arM.height = null;
  _arManualBase = null;

  var c = document.getElementById('ar-cv');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);

  var hint = document.getElementById('ar-hint');
  if (hint) hint.innerHTML = 'Apunta al <b>primer punto</b> y <b>toca la pantalla</b>';
  var stepText = document.getElementById('ar-step-text');
  if (stepText) stepText.textContent = 'Paso 1 de 2';

  var undo = document.getElementById('ar-undo');
  if (undo) undo.style.display = 'none';

  // Re-habilitar tap-zone
  var tz = document.getElementById('ar-tap-zone');
  if (tz) tz.style.pointerEvents = 'auto';
  // Re-mostrar HTML crosshair
  var hc = document.getElementById('ar-html-crosshair');
  if (hc) hc.style.display = 'block';

  var r = document.getElementById('ar-result');
  if (r) r.remove();

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
window._arTapToMark = _arTapToMark;
window._arToggleInvert = _arToggleInvert;
window._arUndo = _arUndo;
window.closeARHeightMeasure = closeARHeightMeasure;
window.arUseVal = arUseVal;
