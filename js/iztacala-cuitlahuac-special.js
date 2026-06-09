// ============================================================================
// iztacala-cuitlahuac-special.js
// ============================================================================
// Caso especial: el árbol "Cuitláhuac" (tree_code FESI 00 AHUEHUETE, id=854)
// — plantado por Rectoría. En el mapa 3D Iztacala:
//   • Etiqueta estilo PLACA azul marino con letras doradas (no la verde de
//     Juan Ficus — quería distinguir simbólicamente el linaje del rector).
//   • Halo dorado pulsante (más sutil que Juan Ficus).
//   • Escala ligeramente mayor para que destaque entre los demás árboles.
//
// Activación:
//   IztacalaCuitlahuac.enhance(scene, treeMeshes)
// Llamado desde dashboard-iztacala.js tras plantar todos los árboles.
// Idempotente.
// ============================================================================

window.IztacalaCuitlahuac = (function () {
  'use strict';

  const TARGET_TREE_ID = 854;          // FESI 00 AHUEHUETE
  const NAVY   = 'rgba(10,31,68,0.96)';
  const NAVY_HEX = 0x0a1f44;
  const GOLD = '#FFD700';
  const GOLD_HEX = 0xffd700;
  const HALO_RADIUS = 8;                // metros
  const HALO_HEIGHT = 0.15;

  let enhanced = false;
  let targetGroup = null;
  let halo = null, glowLight = null;
  let sprite = null;
  let pulseStart = 0;

  async function enhance(scene, treeMeshes) {
    if (enhanced) return;
    if (!scene || !Array.isArray(treeMeshes)) return;
    const entry = treeMeshes.find(t => t?.data?.id === TARGET_TREE_ID);
    if (!entry) {
      console.warn('[IztacalaCuitlahuac] árbol id=' + TARGET_TREE_ID + ' no en escena');
      return;
    }
    targetGroup = entry.group;
    enhanced = true;

    // 1) Escala +18% SOLO en los children pre-existentes (árbol GLB +
    //    health marker), NO en el group entero. Si escaláramos el group,
    //    los enhancements que vamos a agregar abajo (halo, sprite, glow)
    //    también heredarían esa escala y quedarían des-posicionados.
    const preExisting = targetGroup.children.slice();
    preExisting.forEach(child => { child.scale.multiplyScalar(1.18); });

    // 2) Halo dorado en la base
    _addHalo(scene);
    // 3) Luz cálida tenue desde arriba
    _addGlowLight(scene);
    // 4) Etiqueta tipo PLACA azul marino + dorado
    _addLabel(scene);

    pulseStart = performance.now() / 1000;
    _animate();
    console.log('[IztacalaCuitlahuac] activado para árbol id=' + TARGET_TREE_ID);
  }

  function _treeCenter() {
    if (!targetGroup) return new THREE.Vector3(0, 0, 0);
    const box = new THREE.Box3().setFromObject(targetGroup);
    const c = new THREE.Vector3();
    box.getCenter(c);
    c.y = box.min.y;     // base, no centro vertical
    return c;
  }

  function _addHalo(scene) {
    // Como targetGroup está en (0,0,0) world y el árbol-child interno está
    // posicionado con su offset local, _treeCenter() (world) coincide con
    // la posición local cuando el group está en el origen. Agregamos el
    // halo COMO HIJO del group para que se mueva junto con el árbol al hacer
    // drag (si lo agregamos a scene se quedaría fijo).
    const c = _treeCenter();
    const geom = new THREE.RingGeometry(HALO_RADIUS * 0.6, HALO_RADIUS, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: GOLD_HEX, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false,
    });
    halo = new THREE.Mesh(geom, mat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(c.x, c.y + HALO_HEIGHT, c.z);
    halo.userData = { type: 'cuitlahuacHalo' };
    targetGroup.add(halo);
  }

  function _addGlowLight(scene) {
    const c = _treeCenter();
    glowLight = new THREE.PointLight(GOLD_HEX, 1.4, 30, 2);
    glowLight.position.set(c.x, c.y + 16, c.z);
    glowLight.userData = { type: 'cuitlahuacGlow' };
    targetGroup.add(glowLight);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _addLabel(scene) {
    // Canvas 1024x320 (ratio 3.2:1) — alta resolución para que se vea nítida
    // desde lejos en el mapa 3D.
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // Fondo navy
    ctx.fillStyle = NAVY;
    _roundRect(ctx, 16, 16, 992, 288, 28);
    ctx.fill();

    // Borde dorado
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    _roundRect(ctx, 22, 22, 980, 276, 24);
    ctx.stroke();

    // Esquinas decorativas (estilo certificado)
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    const cornerSize = 28;
    // top-left
    ctx.beginPath(); ctx.moveTo(40, 60); ctx.lineTo(40, 40); ctx.lineTo(60 + cornerSize, 40); ctx.stroke();
    // top-right
    ctx.beginPath(); ctx.moveTo(canvas.width - 40, 60); ctx.lineTo(canvas.width - 40, 40); ctx.lineTo(canvas.width - 60 - cornerSize, 40); ctx.stroke();
    // bottom-left
    ctx.beginPath(); ctx.moveTo(40, canvas.height - 60); ctx.lineTo(40, canvas.height - 40); ctx.lineTo(60 + cornerSize, canvas.height - 40); ctx.stroke();
    // bottom-right
    ctx.beginPath(); ctx.moveTo(canvas.width - 40, canvas.height - 60); ctx.lineTo(canvas.width - 40, canvas.height - 40); ctx.lineTo(canvas.width - 60 - cornerSize, canvas.height - 40); ctx.stroke();

    // Texto "RECTORÍA · UNAM" arriba (pequeño)
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.85;
    ctx.font = '500 30px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Letter-spacing manual: dibujar carácter a carácter
    _drawSpaced(ctx, 'RECTORÍA · UNAM', canvas.width / 2, 84, 8);
    ctx.globalAlpha = 1;

    // CUITLÁHUAC grande con sombra
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.font = '900 120px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = GOLD;
    _drawSpaced(ctx, 'CUITLÁHUAC', canvas.width / 2, 200, 14);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Línea inferior "Ahuehuete · Taxodium mucronatum"
    ctx.font = 'italic 26px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = '#fff7c8';
    ctx.globalAlpha = 0.75;
    ctx.fillText('Ahuehuete · Taxodium mucronatum', canvas.width / 2, 266);
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    sprite = new THREE.Sprite(mat);
    sprite.scale.set(22, 6.9, 1);    // ratio ~3.2:1 (1024/320)
    sprite.renderOrder = 999;
    const c = _treeCenter();
    sprite.position.set(c.x, 30, c.z);   // ligeramente más alto que Juan Ficus
    sprite.userData = { type: 'cuitlahuacLabel' };
    targetGroup.add(sprite);  // child del group para que viaje con el drag
  }

  // Dibujar texto con letter-spacing manual (Canvas no soporta letterSpacing
  // hasta versiones recientes y queremos compat con Safari/iOS)
  function _drawSpaced(ctx, text, x, y, spacing) {
    const chars = String(text).split('');
    const widths = chars.map(c => ctx.measureText(c).width + spacing);
    const total = widths.reduce((s, w) => s + w, 0) - spacing;
    let cx = x - total / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx + widths[i] / 2 - spacing / 2, y);
      cx += widths[i];
    }
  }

  function _animate() {
    if (!enhanced) return;
    requestAnimationFrame(_animate);
    const t = performance.now() / 1000 - pulseStart;
    // Halo: pulso suave 0.45 → 0.75 cada 2.4 s
    if (halo && halo.material) {
      halo.material.opacity = 0.5 + 0.25 * Math.sin(t * 2.6);
      const s = 1 + 0.06 * Math.sin(t * 2.6);
      halo.scale.set(s, s, 1);
    }
    // Glow light: intensidad pulsante
    if (glowLight) {
      glowLight.intensity = 1.2 + 0.4 * Math.sin(t * 2.6);
    }
  }

  return { enhance };
})();
