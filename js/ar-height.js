// ============================================================================
// AR Height Measurement — CLINOMETER METHOD (Two-Angle / Christen's method)
// ============================================================================
// Método profesional de forestería que NO requiere ARKit, LiDAR ni WebXR.
// Funciona perfectamente en Safari iOS Web usando solo el giroscopio.
//
// PRINCIPIO:
//   1. El usuario apunta a la BASE del árbol → mide β (ángulo de depresión)
//   2. El usuario apunta a la CIMA del árbol → mide α (ángulo de elevación)
//   3. La distancia al árbol se DERIVA de la altura del teléfono:
//        D = phoneHeight / tan(β)
//   4. La altura total del árbol es:
//        H = phoneHeight + D × tan(α)
//        H = phoneHeight × (1 + tan(α)/tan(β))
//
// Ventajas:
//   • No hay "puntos en el mundo" que se muevan en pantalla.
//   • Solo se capturan ángulos en momentos puntuales (al hacer tap).
//   • Visualmente: cámara + retícula central FIJA + HUD digital en vivo.
//   • Es el método que usaban los forestales antes de los rangefinders láser.
// ============================================================================

var arM = {
  step: 0,           // 0 = pedir BASE, 1 = pedir TOP, 2 = resultado
  stream: null,
  gyroH: null,
  hasGyro: false,
  gyroReady: false,

  // Lectura cruda del beta del DeviceOrientation (filtrada con low-pass)
  curBeta: null,

  // Captura en cada tap
  baseBeta: null,    // beta cuando se apuntó a la base
  topBeta: null,     // beta cuando se apuntó a la cima

  // Configuración (fija — no se le pregunta al usuario para que la experiencia
  // sea seamless. 1.55 m es el promedio donde la gente sostiene un teléfono al
  // apuntar, error típico por estatura ±5% — invisible para el usuario).
  phoneH: 1.55,

  // Resultado
  dist: null,        // distancia horizontal calculada (m)
  height: null,      // altura del árbol (cm)
};

// ============================================================================
// OPEN
// ============================================================================
function openARHeightMeasure() {
  arM = {
    step: 0, stream: null, gyroH: null,
    hasGyro: false, gyroReady: false,
    curBeta: null, baseBeta: null, topBeta: null,
    phoneH: 1.55, dist: null, height: null,
  };

  // ---- REQUEST GYROSCOPE PERMISSION (iOS 13+) ----
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(state) {
      if (state === 'granted') _arListenGyro();
      else _arGyroDenied();
    }).catch(function() { _arGyroDenied(); });
  } else if ('DeviceOrientationEvent' in window) {
    _arListenGyro();
  }

  // ---- OVERLAY ----
  var ov = document.createElement('div');
  ov.id = 'ar-ov';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

  ov.innerHTML =
    '<div id="ar-box" style="position:relative;width:100%;height:100%;overflow:hidden;">' +

      // Cámara
      '<video id="ar-vid" autoplay playsinline muted ' +
        'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +

      // Vignette para foco
      '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%);pointer-events:none;z-index:1;"></div>' +

      // Header
      '<div style="position:absolute;top:0;left:0;right:0;z-index:10;' +
        'background:linear-gradient(rgba(0,0,0,0.65),transparent);padding:0.9rem 1rem 1.6rem;pointer-events:none;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">' +
          '<div style="flex:1;">' +
            '<p id="ar-hint" style="margin:0;color:#fff;font-size:0.95rem;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.85);">' +
              'Apunta a la <span style="color:#FFD54F;">BASE</span> del árbol' +
            '</p>' +
            '<p id="ar-sub" style="margin:0.2rem 0 0;color:rgba(255,255,255,0.75);font-size:0.78rem;text-shadow:0 1px 3px rgba(0,0,0,0.85);">' +
              'Centra la retícula en el suelo donde nace el tronco' +
            '</p>' +
          '</div>' +
          '<button onclick="closeARHeightMeasure()" style="pointer-events:auto;width:34px;height:34px;border-radius:50%;border:none;background:rgba(40,40,40,0.7);' +
            'color:#fff;font-size:1.05rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);">✕</button>' +
        '</div>' +
      '</div>' +

      // ---- HUD CLINÓMETRO (top-left, debajo del header) ----
      '<div id="ar-hud" style="position:absolute;top:5.5rem;left:0.8rem;z-index:9;' +
        'background:rgba(0,0,0,0.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:0.5rem 0.75rem;' +
        'color:#fff;font-family:ui-monospace,Menlo,monospace;min-width:120px;">' +
        '<div style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.15rem;">Ángulo</div>' +
        '<div id="ar-angle-now" style="font-size:1.4rem;font-weight:600;line-height:1;">--.-°</div>' +
        '<div id="ar-angle-tag" style="font-size:0.62rem;color:rgba(255,255,255,0.55);margin-top:0.15rem;">— horizonte —</div>' +
      '</div>' +

      // ---- INDICADOR DE ESTABILIDAD (top-right) ----
      '<div id="ar-hud-stab" style="position:absolute;top:5.5rem;right:0.8rem;z-index:9;' +
        'background:rgba(0,0,0,0.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:0.5rem 0.75rem;color:#fff;display:flex;align-items:center;gap:0.55rem;">' +
        '<span id="ar-stab-led" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#FFA726;box-shadow:0 0 8px #FFA726;transition:background 0.2s,box-shadow 0.2s;"></span>' +
        '<div>' +
          '<div style="font-size:0.6rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;line-height:1;">Estabilidad</div>' +
          '<div id="ar-stab-text" style="font-size:0.78rem;font-weight:600;line-height:1.4;font-family:ui-monospace,Menlo,monospace;">…</div>' +
        '</div>' +
      '</div>' +

      // ---- RETÍCULA CENTRAL (FIJA, nunca se mueve) ----
      '<div id="ar-reticle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;pointer-events:none;width:64px;height:64px;">' +
        // anillo exterior
        '<div style="position:absolute;inset:0;border:1.5px solid rgba(255,255,255,0.85);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.4),0 0 12px rgba(0,0,0,0.6);"></div>' +
        // tics cardinales
        '<div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:rgba(255,255,255,0.9);"></div>' +
        '<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:rgba(255,255,255,0.9);"></div>' +
        '<div style="position:absolute;left:-6px;top:50%;transform:translateY(-50%);width:8px;height:1.5px;background:rgba(255,255,255,0.9);"></div>' +
        '<div style="position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:8px;height:1.5px;background:rgba(255,255,255,0.9);"></div>' +
        // punto central
        '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:5px;height:5px;background:#FFD54F;border-radius:50%;box-shadow:0 0 8px rgba(255,213,79,0.9),0 0 0 1.5px rgba(0,0,0,0.5);"></div>' +
      '</div>' +

      // Línea de horizonte (dinámica — siempre horizontal, marcada en pantalla cuando beta ≈ 90)
      '<div id="ar-horizon" style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,0.18);z-index:4;pointer-events:none;display:none;"></div>' +

      // ---- GYRO STATUS warning ----
      '<div id="ar-gyro-status" style="display:none;position:absolute;top:9rem;left:50%;transform:translateX(-50%);z-index:10;background:rgba(220,80,40,0.92);color:#fff;padding:0.5rem 0.9rem;border-radius:20px;font-size:0.78rem;pointer-events:none;font-weight:500;text-align:center;max-width:80%;"></div>' +

      // ---- BADGE de captura (aparece después del primer tap) ----
      '<div id="ar-base-badge" style="display:none;position:absolute;top:9rem;left:50%;transform:translateX(-50%);z-index:9;background:rgba(46,125,50,0.92);color:#fff;padding:0.4rem 0.85rem;border-radius:20px;font-size:0.78rem;font-weight:600;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,0.3);">' +
        '✓ BASE capturada · <span id="ar-base-angle-disp">--</span>' +
      '</div>' +

      // ---- BOTÓN PRINCIPAL DE CAPTURA (bottom) ----
      '<div style="position:absolute;bottom:0;left:0;right:0;z-index:11;background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:1.2rem 1rem 1.6rem;">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;">' +
          // Undo
          '<button id="ar-undo" onclick="_arUndo()" style="display:none;width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:1.2rem;cursor:pointer;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 10px rgba(0,0,0,0.3);">↩</button>' +

          // Capture button (big, central)
          '<button id="ar-capture" onclick="_arCapture()" style="width:78px;height:78px;border-radius:50%;border:4px solid rgba(255,255,255,0.85);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:transform 0.1s;">' +
            '<span id="ar-capture-inner" style="width:60px;height:60px;border-radius:50%;background:#FFD54F;display:block;"></span>' +
          '</button>' +

          // Phone height shortcut
          '<button id="ar-help" onclick="_arShowHelp()" style="width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 10px rgba(0,0,0,0.3);">?</button>' +
        '</div>' +
        '<div style="text-align:center;margin-top:0.6rem;color:rgba(255,255,255,0.85);font-size:0.78rem;text-shadow:0 1px 3px rgba(0,0,0,0.85);">' +
          '<span id="ar-step-text">Paso 1 de 2 · Apunta abajo a la base</span>' +
        '</div>' +
      '</div>' +

    '</div>';

  document.body.appendChild(ov);

  // ---- Cámara ----
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(function(s) {
    arM.stream = s;
    var v = document.getElementById('ar-vid');
    if (!v) return;
    v.srcObject = s;
    v.play().catch(function() {});

    // Inicia animación del HUD
    _arStartHudLoop();

    setTimeout(function() {
      if (!arM.gyroReady) {
        var gs = document.getElementById('ar-gyro-status');
        if (gs) {
          gs.style.display = 'block';
          gs.innerHTML = '⚠ Sin giroscopio detectado<br><span style="font-size:0.7rem;opacity:0.85;">Mueve el teléfono o revisa permisos</span>';
        }
      }
    }, 2000);
  }).catch(function(e) {
    console.error('Cam:', e);
    if (typeof showToast === 'function') showToast('Error accediendo a la cámara.', 'error');
    closeARHeightMeasure();
  });
}

// ============================================================================
// GYROSCOPE
// ============================================================================
function _arListenGyro() {
  if (arM.gyroH) return;
  var smoothing = 0.18;
  var h = function(e) {
    if (e.beta !== null && e.beta !== undefined) {
      arM.hasGyro = true;
      arM.gyroReady = true;
      if (arM.curBeta === null) arM.curBeta = e.beta;
      else arM.curBeta = arM.curBeta * (1 - smoothing) + e.beta * smoothing;
      var gs = document.getElementById('ar-gyro-status');
      if (gs) gs.style.display = 'none';
    }
  };
  window.addEventListener('deviceorientation', h);
  arM.gyroH = h;
}

function _arGyroDenied() {
  var gs = document.getElementById('ar-gyro-status');
  if (gs) {
    gs.style.display = 'block';
    gs.innerHTML = '⚠ Permiso del giroscopio denegado<br><span style="font-size:0.7rem;opacity:0.85;">Revisa Ajustes › Safari › Movimiento</span>';
  }
}

// Convierte beta (DeviceOrientation) a ángulo respecto al horizonte (grados)
//   beta ≈ 90° cuando el teléfono está vertical apuntando horizontalmente
//   beta > 90° → mirando hacia arriba (elevación positiva)
//   beta < 90° → mirando hacia abajo (depresión, ángulo negativo aquí)
// Retorna ángulo respecto al horizonte: positivo = arriba, negativo = abajo.
function _arElevationDeg() {
  if (arM.curBeta === null) return null;
  return arM.curBeta - 90;
}

// ============================================================================
// HUD LIVE LOOP (actualiza ángulo + estabilidad en tiempo real)
// ============================================================================
var _arHudId = null;
var _arBetaHistory = []; // últimas N lecturas de beta para calcular jitter
function _arStartHudLoop() {
  function tick() {
    var ang = _arElevationDeg();
    var elDisp = document.getElementById('ar-angle-now');
    var elTag = document.getElementById('ar-angle-tag');
    var horizon = document.getElementById('ar-horizon');
    var stabLed = document.getElementById('ar-stab-led');
    var stabText = document.getElementById('ar-stab-text');

    if (ang === null) {
      if (elDisp) elDisp.textContent = '--.-°';
      if (elTag) elTag.textContent = '— horizonte —';
      if (stabText) stabText.textContent = '…';
    } else {
      var sign = ang >= 0 ? '+' : '';
      if (elDisp) {
        elDisp.textContent = sign + ang.toFixed(1) + '°';
        if (arM.step === 0) {
          elDisp.style.color = ang < -2 ? '#FFD54F' : ang > 2 ? 'rgba(255,150,150,0.9)' : '#fff';
        } else if (arM.step === 1) {
          elDisp.style.color = ang > 2 ? '#81C784' : ang < -2 ? 'rgba(255,150,150,0.9)' : '#fff';
        } else {
          elDisp.style.color = '#fff';
        }
      }
      if (elTag) {
        if (Math.abs(ang) < 1) elTag.textContent = '— horizonte —';
        else if (ang > 0) elTag.textContent = '↑ elevación';
        else elTag.textContent = '↓ depresión';
      }
      if (horizon) horizon.style.display = Math.abs(ang) < 0.8 ? 'block' : 'none';

      // ---- ESTABILIDAD: desviación estándar de las últimas 30 lecturas ----
      _arBetaHistory.push(arM.curBeta);
      if (_arBetaHistory.length > 30) _arBetaHistory.shift();
      if (_arBetaHistory.length >= 8) {
        var sum = 0;
        for (var i = 0; i < _arBetaHistory.length; i++) sum += _arBetaHistory[i];
        var mean = sum / _arBetaHistory.length;
        var sq = 0;
        for (var j = 0; j < _arBetaHistory.length; j++) {
          var d = _arBetaHistory[j] - mean;
          sq += d * d;
        }
        var stdev = Math.sqrt(sq / _arBetaHistory.length);

        // Clasificación
        var stable = stdev < 0.35;
        var ok = stdev < 0.9;

        if (stabLed) {
          if (stable) {
            stabLed.style.background = '#4CAF50';
            stabLed.style.boxShadow = '0 0 10px #4CAF50';
          } else if (ok) {
            stabLed.style.background = '#FFA726';
            stabLed.style.boxShadow = '0 0 8px #FFA726';
          } else {
            stabLed.style.background = '#EF5350';
            stabLed.style.boxShadow = '0 0 8px #EF5350';
          }
        }
        if (stabText) {
          if (stable) stabText.textContent = 'ESTABLE';
          else if (ok) stabText.textContent = 'aguanta';
          else stabText.textContent = 'temblando';
        }
      }
    }
    _arHudId = requestAnimationFrame(tick);
  }
  _arHudId = requestAnimationFrame(tick);
}

function _arStopHudLoop() {
  if (_arHudId) { cancelAnimationFrame(_arHudId); _arHudId = null; }
}

// ============================================================================
// CAPTURE — botón circular grande
// ============================================================================
function _arCapture() {
  if (arM.curBeta === null || !arM.gyroReady) {
    if (typeof showToast === 'function') showToast('Esperando giroscopio…', 'warning');
    return;
  }

  var ang = _arElevationDeg();
  var btn = document.getElementById('ar-capture');
  if (btn) {
    btn.style.transform = 'scale(0.92)';
    setTimeout(function() { btn.style.transform = ''; }, 120);
  }

  if (arM.step === 0) {
    // ---- BASE ----
    if (ang > -1.5) {
      if (typeof showToast === 'function')
        showToast('Inclina más hacia abajo (apunta al suelo del árbol)', 'warning');
      return;
    }
    arM.baseBeta = arM.curBeta;
    arM.step = 1;

    // Actualiza UI
    document.getElementById('ar-hint').innerHTML =
      'Apunta a la <span style="color:#81C784;">CIMA</span> del árbol';
    document.getElementById('ar-sub').textContent =
      'Centra la retícula en la punta más alta';
    document.getElementById('ar-step-text').textContent = 'Paso 2 de 2 · Apunta arriba a la cima';

    // Cambia color del capture button
    var inner = document.getElementById('ar-capture-inner');
    if (inner) inner.style.background = '#81C784';

    // Mostrar badge de base capturada
    var badge = document.getElementById('ar-base-badge');
    var bd = document.getElementById('ar-base-angle-disp');
    if (badge && bd) {
      bd.textContent = ang.toFixed(1) + '°';
      badge.style.display = 'block';
    }

    // Mostrar undo
    var undo = document.getElementById('ar-undo');
    if (undo) undo.style.display = 'flex';

    // Distancia derivada de la altura del teléfono y el ángulo de depresión
    var betaRad = Math.abs(ang) * Math.PI / 180;
    arM.dist = arM.phoneH / Math.tan(betaRad);

    // Haptic feedback (si existe)
    if (navigator.vibrate) navigator.vibrate(30);

  } else if (arM.step === 1) {
    // ---- TOP ----
    if (ang < 1.5) {
      if (typeof showToast === 'function')
        showToast('Inclina más hacia arriba (apunta a la cima)', 'warning');
      return;
    }
    arM.topBeta = arM.curBeta;
    arM.step = 2;

    var height = _arComputeHeight();
    arM.height = Math.max(height, 1);

    if (navigator.vibrate) navigator.vibrate([30, 60, 30]);

    _arShowResult(arM.height);
  }
}

// ============================================================================
// CÁLCULO DE ALTURA (clinómetro de dos ángulos)
// ============================================================================
//   β = ángulo de depresión a la base   (positivo, en grados)
//   α = ángulo de elevación a la cima   (positivo, en grados)
//   D = distancia horizontal             = phoneH / tan(β)
//   H = phoneH + D × tan(α)              = phoneH × (1 + tan(α)/tan(β))
// Retorna altura en CM.
// ============================================================================
function _arComputeHeight() {
  if (arM.baseBeta === null || arM.topBeta === null) return 0;
  var beta = Math.abs(arM.baseBeta - 90);  // depresión
  var alpha = Math.abs(arM.topBeta - 90);  // elevación
  var betaR = beta * Math.PI / 180;
  var alphaR = alpha * Math.PI / 180;
  if (Math.tan(betaR) < 0.005) return 0;

  var hMeters = arM.phoneH * (1 + Math.tan(alphaR) / Math.tan(betaR));
  return hMeters * 100; // cm
}

// ============================================================================
// RESULT CARD
// ============================================================================
function _arShowResult(heightCm) {
  // Limpia botón principal
  var capBtn = document.getElementById('ar-capture');
  if (capBtn) capBtn.style.display = 'none';
  var hlpBtn = document.getElementById('ar-help');
  if (hlpBtn) hlpBtn.style.display = 'none';
  var stepText = document.getElementById('ar-step-text');
  if (stepText) stepText.style.display = 'none';

  // Reposiciona undo
  var undoBtn = document.getElementById('ar-undo');
  if (undoBtn) undoBtn.style.display = 'none';

  var beta = Math.abs(arM.baseBeta - 90);
  var alpha = Math.abs(arM.topBeta - 90);
  var dist = arM.dist || 0;

  var disp = heightCm >= 100 ? heightCm.toFixed(0) : heightCm.toFixed(1);
  var m = (heightCm / 100).toFixed(2);

  var card = document.createElement('div');
  card.id = 'ar-result';
  card.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:10001;display:flex;justify-content:center;padding:0.8rem;animation:arSlideUp 0.35s ease-out;';
  card.innerHTML =
    '<style>@keyframes arSlideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}</style>' +
    '<div style="background:#fff;border-radius:18px;padding:1.1rem 1.3rem;text-align:center;max-width:340px;width:100%;box-shadow:0 -4px 30px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,sans-serif;">' +
      // Result big
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:0.35rem;">' +
        '<span style="font-size:2.2rem;font-weight:700;color:#2E7D32;line-height:1;">' + disp + '</span>' +
        '<span style="font-size:1rem;color:#4CAF50;font-weight:500;">cm</span>' +
        '<span style="font-size:0.85rem;color:#888;margin-left:0.4rem;">(' + m + ' m)</span>' +
      '</div>' +
      // Detalles trigonométricos (transparencia)
      '<div style="margin-top:0.7rem;padding-top:0.7rem;border-top:1px solid #eee;display:flex;justify-content:space-around;font-family:ui-monospace,Menlo,monospace;font-size:0.7rem;color:#666;">' +
        '<div><div style="opacity:0.6;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;">β base</div><div style="font-weight:600;color:#333;">' + beta.toFixed(1) + '°</div></div>' +
        '<div><div style="opacity:0.6;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;">α cima</div><div style="font-weight:600;color:#333;">' + alpha.toFixed(1) + '°</div></div>' +
        '<div><div style="opacity:0.6;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;">distancia</div><div style="font-weight:600;color:#333;">' + dist.toFixed(1) + ' m</div></div>' +
      '</div>' +
      // Acciones
      '<div style="display:flex;gap:0.5rem;justify-content:center;margin-top:0.9rem;">' +
        '<button onclick="_arUndo()" style="flex:1;background:#f5f5f5;color:#444;border:none;padding:0.7rem;border-radius:11px;font-size:0.9rem;font-weight:500;cursor:pointer;">↩ Repetir</button>' +
        '<button onclick="arUseVal(' + heightCm.toFixed(1) + ')" style="flex:2;background:#2E7D32;color:#fff;border:none;padding:0.7rem;border-radius:11px;font-size:0.95rem;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(46,125,50,0.4);">✓ Usar ' + m + ' m</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(card);
}

// ============================================================================
// HELP
// ============================================================================
function _arShowHelp() {
  alert(
    'CÓMO MEDIR\n\n' +
    '1) Párate a una distancia donde puedas ver claramente la base y la cima del árbol (3 a 30 metros funciona bien).\n\n' +
    '2) Apunta la retícula amarilla a la BASE del árbol (donde toca el suelo) y presiona el botón de captura.\n\n' +
    '3) Apunta la retícula a la CIMA del árbol y presiona captura otra vez.\n\n' +
    'La altura se calcula con trigonometría usando los dos ángulos. Mientras más perpendicular estés al árbol, más precisa será la medida. Mantén el teléfono lo más estable posible (busca el indicador verde "ESTABLE" arriba a la derecha).'
  );
}

// ============================================================================
// UNDO
// ============================================================================
function _arUndo() {
  arM.step = 0;
  arM.baseBeta = null;
  arM.topBeta = null;
  arM.dist = null;
  arM.height = null;

  document.getElementById('ar-hint').innerHTML =
    'Apunta a la <span style="color:#FFD54F;">BASE</span> del árbol';
  document.getElementById('ar-sub').textContent =
    'Centra la retícula en el suelo donde nace el tronco';

  var stepText = document.getElementById('ar-step-text');
  if (stepText) {
    stepText.textContent = 'Paso 1 de 2 · Apunta abajo a la base';
    stepText.style.display = 'block';
  }

  var capBtn = document.getElementById('ar-capture');
  if (capBtn) capBtn.style.display = 'flex';
  var hlpBtn = document.getElementById('ar-help');
  if (hlpBtn) hlpBtn.style.display = 'flex';

  var inner = document.getElementById('ar-capture-inner');
  if (inner) inner.style.background = '#FFD54F';

  var undo = document.getElementById('ar-undo');
  if (undo) undo.style.display = 'none';

  var badge = document.getElementById('ar-base-badge');
  if (badge) badge.style.display = 'none';

  var r = document.getElementById('ar-result');
  if (r) r.remove();
}

// ============================================================================
// USE / CLOSE
// ============================================================================
function arUseVal(heightCm) {
  var inp = document.getElementById('meas-height');
  if (inp) {
    inp.value = heightCm.toFixed(1);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeARHeightMeasure();
  if (typeof showToast === 'function') showToast('Altura cargada en el formulario', 'success');
}

function closeARHeightMeasure() {
  _arStopHudLoop();
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

// ============================================================================
// EXPORTS
// ============================================================================
window.openARHeightMeasure = openARHeightMeasure;
window._arCapture = _arCapture;
window._arUndo = _arUndo;
window._arShowHelp = _arShowHelp;
window.closeARHeightMeasure = closeARHeightMeasure;
window.arUseVal = arUseVal;
