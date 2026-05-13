// ============================================================================
// Social Poster — genera imágenes 1080×1080 (Instagram square / Facebook)
// y 1080×1920 (Stories / Reels) listas para descargar y subir a redes.
//
// 6 tipos de posts:
//   1. tree-of-month        — Árbol destacado del mes (1080×1080)
//   2. monthly-recap        — Resumen del mes con stats (1080×1920)
//   3. species-card         — Tarjeta didáctica de una especie (1080×1080)
//   4. milestone            — Hito alcanzado (1080×1080)
//   5. before-after         — Comparación primer vs último seguimiento (1080×1080)
//   6. co2-impact           — Impacto de captura de carbono (1080×1080)
//
// Cada función retorna un Canvas con `toBlob` listo para descargar o compartir.
// ============================================================================

window.SocialPoster = (function() {
  'use strict';

  // Paleta UNAM Árbol 475
  const COLORS = {
    primary: '#2E7D32',
    primaryDark: '#1B5E20',
    accent: '#FFA726',
    bg: '#FBF7EE',
    bgWarm: '#F5EAD3',
    text: '#1A1410',
    textLight: '#6A5D4D',
    danger: '#EF5350',
    blue: '#1976D2',
    lila: '#9C27B0',
    rose: '#E91E63',
  };

  async function loadImg(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function resolvePhoto(url, bucket = 'tree-photos') {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    try {
      const { data } = await sb.storage.from(bucket).createSignedUrl(url, 3600);
      return data?.signedUrl || null;
    } catch (_) { return null; }
  }

  // ============================================================================
  // HELPERS de dibujado
  // ============================================================================
  function drawBackground(ctx, W, H) {
    // Gradiente cálido base
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#FBF7EE');
    grad.addColorStop(0.5, '#F5EAD3');
    grad.addColorStop(1, '#E8DCC0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Blobs decorativos
    function blob(x, y, r, color) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    blob(W * 0.15, H * 0.15, W * 0.5, 'rgba(74,124,42,0.35)');
    blob(W * 0.85, H * 0.85, W * 0.6, 'rgba(255,165,120,0.32)');
    blob(W * 0.5, H * 0.5, W * 0.55, 'rgba(190,145,225,0.20)');
  }

  function drawFooter(ctx, W, H) {
    // Banda inferior con branding
    const fy = H - 60;
    ctx.fillStyle = 'rgba(46,125,50,0.95)';
    ctx.fillRect(0, fy, W, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px -apple-system, "Helvetica Neue", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🌳 Proyecto Árbol UNAM 475', 24, fy + 38);
    ctx.font = '18px -apple-system, "Helvetica Neue", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('FES Iztacala', W - 24, fy + 38);
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = (text || '').split(' ');
    let line = '';
    let yy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line.trim(), x, yy);
        line = words[i] + ' ';
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), x, yy);
    return yy + lineH;
  }

  // Marco redondeado para fotos
  function roundedClip(ctx, x, y, w, h, r) {
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

  // ============================================================================
  // 1. ÁRBOL DEL MES (1080×1080)
  // ============================================================================
  async function generateTreeOfMonth(tree) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    // Foto del árbol arriba
    const photoUrl = await resolvePhoto(tree.photo_url);
    const photo = await loadImg(photoUrl);

    if (photo) {
      const photoH = 560;
      ctx.save();
      roundedClip(ctx, 60, 60, W - 120, photoH, 24);
      ctx.clip();
      // Cover fit
      const sc = Math.max(photoH / photo.height, (W - 120) / photo.width);
      const pw = photo.width * sc, ph = photo.height * sc;
      ctx.drawImage(photo, 60 + ((W - 120) - pw) / 2, 60 + (photoH - ph) / 2, pw, ph);
      ctx.restore();
    } else {
      // Placeholder
      ctx.fillStyle = 'rgba(46,125,50,0.15)';
      roundedClip(ctx, 60, 60, W - 120, 560, 24);
      ctx.fill();
      ctx.fillStyle = COLORS.primary;
      ctx.font = '120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🌳', W / 2, 380);
    }

    // Etiqueta "ÁRBOL DEL MES"
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🌟 ÁRBOL DESTACADO', 60, 690);

    // Nombre común
    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 56px Playfair Display, Georgia, serif';
    wrapText(ctx, tree.common_name || tree.species || 'Árbol', 60, 750, W - 120, 64);

    // Especie científica
    ctx.fillStyle = COLORS.textLight;
    ctx.font = 'italic 32px -apple-system, sans-serif';
    ctx.fillText(tree.species || '', 60, 840);

    // Stats row
    const stats = [
      { label: 'SALUD', value: (tree.health_score || 0) + '%', color: tree.health_score >= 70 ? COLORS.primary : tree.health_score >= 40 ? COLORS.accent : COLORS.danger },
      { label: 'ALTURA', value: tree.initial_height_cm ? (tree.initial_height_cm / 100).toFixed(1) + ' m' : '—' },
      { label: 'CÓDIGO', value: tree.tree_code || '—' },
    ];
    stats.forEach((s, i) => {
      const x = 60 + i * 320;
      ctx.fillStyle = COLORS.textLight;
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.fillText(s.label, x, 900);
      ctx.fillStyle = s.color || COLORS.text;
      ctx.font = 'bold 40px -apple-system, sans-serif';
      ctx.fillText(s.value, x, 940);
    });

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // 2. RESUMEN DEL MES (1080×1920 — Stories/Reels)
  // ============================================================================
  function generateMonthlyRecap(stats) {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    // Título grande
    const monthName = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 80px Playfair Display, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Resumen', W / 2, 300);
    ctx.fillText('del mes', W / 2, 400);

    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 48px -apple-system, sans-serif';
    ctx.fillText(monthName.toUpperCase(), W / 2, 480);

    // Big stat 1: árboles cuidados
    const ss = [
      { label: 'Árboles cuidados', value: stats.trees || 0, color: COLORS.primary, icon: '🌳' },
      { label: 'Seguimientos del mes', value: stats.measurements || 0, color: COLORS.blue, icon: '📋' },
      { label: 'Kilos de CO₂ capturados', value: stats.co2 || '0', color: COLORS.lila, icon: '💨', big: true },
      { label: 'Cuidadores activos', value: stats.users || 0, color: COLORS.rose, icon: '👥' },
    ];

    let y = 600;
    ss.forEach((s, i) => {
      // Card
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundedClip(ctx, 80, y, W - 160, 250, 20);
      ctx.fill();

      // Borde de color
      ctx.fillStyle = s.color;
      ctx.fillRect(80, y, 12, 250);

      // Icon
      ctx.font = '90px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.icon, 130, y + 130);

      // Value
      ctx.fillStyle = s.color;
      ctx.font = `bold ${s.big ? 110 : 90}px -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(String(s.value), W - 110, y + 130);

      // Label
      ctx.fillStyle = COLORS.text;
      ctx.font = '30px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(s.label, W - 110, y + 190);

      y += 290;
    });

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // 3. TARJETA DIDÁCTICA DE ESPECIE (1080×1080)
  // ============================================================================
  function generateSpeciesCard(card) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    // Header con icono y nombre
    ctx.font = '140px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(card.icon || '🌳', W / 2, 200);

    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 64px Playfair Display, Georgia, serif';
    ctx.fillText(card.common_name, W / 2, 290);

    ctx.fillStyle = COLORS.textLight;
    ctx.font = 'italic 32px -apple-system, sans-serif';
    ctx.fillText(card.scientific, W / 2, 340);

    // Tag
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText('📚 ESPECIE DE LA SEMANA', W / 2, 390);

    // Datos en grid
    const fields = [
      { label: 'Origen', value: card.origin },
      { label: 'Longevidad', value: card.longevity },
      { label: 'Altura máx', value: card.max_height },
      { label: 'Crecimiento', value: card.growth_rate },
    ];
    fields.forEach((f, i) => {
      const x = 80 + (i % 2) * 480;
      const y = 470 + Math.floor(i / 2) * 110;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      roundedClip(ctx, x, y, 440, 90, 12);
      ctx.fill();
      ctx.fillStyle = COLORS.textLight;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(f.label.toUpperCase(), x + 20, y + 30);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.fillText(f.value, x + 20, y + 65);
    });

    // Dato curioso
    const fact = card.fun_facts[Math.floor(Math.random() * card.fun_facts.length)];
    ctx.fillStyle = 'rgba(46,125,50,0.10)';
    roundedClip(ctx, 80, 720, W - 160, 240, 20);
    ctx.fill();
    ctx.fillStyle = COLORS.primary;
    ctx.fillRect(80, 720, 8, 240);
    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('💡 ¿SABÍAS QUE?', 120, 760);
    ctx.fillStyle = COLORS.text;
    ctx.font = '28px Georgia, serif';
    wrapText(ctx, fact, 120, 810, W - 240, 38);

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // 4. HITO ALCANZADO (1080×1080)
  // ============================================================================
  function generateMilestone(milestone) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    // Confetti decorativo
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const colors = ['#2E7D32', '#FFA726', '#1976D2', '#E91E63', '#9C27B0'];
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, y, 8, 16);
    }
    ctx.globalAlpha = 1;

    ctx.font = '180px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎉', W / 2, 280);

    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 76px Playfair Display, Georgia, serif';
    ctx.fillText('¡Lo logramos!', W / 2, 420);

    // Número grande
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 220px -apple-system, sans-serif';
    ctx.fillText(milestone.number || '100', W / 2, 660);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 44px -apple-system, sans-serif';
    wrapText(ctx, milestone.label || 'seguimientos completados', 80, 760, W - 160, 56);

    if (milestone.subtitle) {
      ctx.fillStyle = COLORS.textLight;
      ctx.font = '30px -apple-system, sans-serif';
      wrapText(ctx, milestone.subtitle, 80, 880, W - 160, 38);
    }

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // 5. ANTES vs DESPUÉS (1080×1080)
  // ============================================================================
  async function generateBeforeAfter(tree, firstMeas, lastMeas) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📈 EVOLUCIÓN', W / 2, 80);

    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 52px Playfair Display, Georgia, serif';
    ctx.fillText(tree.common_name || tree.species, W / 2, 140);

    // Foto antes (izq) + después (der)
    const urls = await Promise.all([
      resolvePhoto(firstMeas?.photo_url),
      resolvePhoto(lastMeas?.photo_url),
    ]);
    const imgs = await Promise.all(urls.map(loadImg));

    async function drawPhoto(img, x, y, w, h, label, date) {
      ctx.save();
      roundedClip(ctx, x, y, w, h, 16);
      ctx.clip();
      ctx.fillStyle = 'rgba(46,125,50,0.10)';
      ctx.fillRect(x, y, w, h);
      if (img) {
        const sc = Math.max(w / img.width, h / img.height);
        const pw = img.width * sc, ph = img.height * sc;
        ctx.drawImage(img, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph);
      } else {
        ctx.fillStyle = COLORS.textLight;
        ctx.font = '80px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📷', x + w / 2, y + h / 2 + 30);
      }
      ctx.restore();
      // Etiqueta
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y + h - 80, w, 80);
      ctx.fillStyle = COLORS.primaryDark;
      ctx.font = 'bold 24px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h - 50);
      ctx.fillStyle = COLORS.textLight;
      ctx.font = '18px -apple-system, sans-serif';
      ctx.fillText(date || '', x + w / 2, y + h - 20);
    }

    await drawPhoto(imgs[0], 60, 220, 460, 700, 'ANTES', firstMeas ? new Date(firstMeas.measurement_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' }) : '');
    await drawPhoto(imgs[1], 560, 220, 460, 700, 'AHORA', lastMeas ? new Date(lastMeas.measurement_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' }) : '');

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // 6. IMPACTO CO₂ (1080×1080)
  // ============================================================================
  function generateCO2Impact(kgCO2, trees) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, W, H);

    ctx.font = '140px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌍', W / 2, 200);

    ctx.fillStyle = COLORS.primaryDark;
    ctx.font = 'bold 60px Playfair Display, Georgia, serif';
    ctx.fillText('Impacto ambiental', W / 2, 300);

    // Cifra grande
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 180px -apple-system, sans-serif';
    const formatted = kgCO2 >= 1000 ? (kgCO2 / 1000).toFixed(2) + ' t' : Math.round(kgCO2) + ' kg';
    ctx.fillText(formatted, W / 2, 500);

    ctx.fillStyle = COLORS.text;
    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillText('de CO₂ capturado', W / 2, 560);

    ctx.fillStyle = COLORS.textLight;
    ctx.font = '24px -apple-system, sans-serif';
    ctx.fillText(`por nuestros ${trees || 0} árboles cuidados`, W / 2, 600);

    // Equivalencias
    const equiv = window.CO2Calculator?.getEquivalences(kgCO2) || [];
    let y = 700;
    equiv.slice(0, 3).forEach(eq => {
      ctx.fillStyle = 'rgba(46,125,50,0.10)';
      roundedClip(ctx, 80, y, W - 160, 80, 12);
      ctx.fill();
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(eq.icon, 110, y + 50);
      ctx.fillStyle = COLORS.primary;
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(eq.value.toLocaleString(), W - 110, y + 50);
      ctx.fillStyle = COLORS.text;
      ctx.font = '20px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(eq.label, 165, y + 50);
      y += 95;
    });

    drawFooter(ctx, W, H);
    return canvas;
  }

  // ============================================================================
  // EXPORT — descarga + share
  // ============================================================================
  function canvasToDownload(canvas, filename) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  }

  async function canvasToShare(canvas, filename, text) {
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: text || '🌳 Proyecto Árbol UNAM 475' });
            resolve(true);
          } catch (e) {
            resolve(false);
          }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve(true);
        }
      }, 'image/png');
    });
  }

  // Caption sugerido por tipo de post
  function suggestedCaption(type, data) {
    const HASH = '#ProyectoArbolUNAM475 #FESIztacala #SemanaSantaDeLosBosques #ÁrbolesDelAniversario';
    switch (type) {
      case 'tree-of-month':
        return `🌟 Conoce a ${data.common_name || data.species}, nuestro árbol destacado del mes en el campus FES Iztacala 🌳\n\n${data.common_name} forma parte del Proyecto Árbol UNAM 475: monitoreo continuo, cuidado consciente y comunidad. ${HASH}`;
      case 'monthly-recap':
        return `📊 ¡Resumen del mes en el Proyecto Árbol UNAM 475!\n\n🌳 ${data.trees || 0} árboles cuidados\n📋 ${data.measurements || 0} seguimientos\n💨 ${data.co2 || 0} kg de CO₂ capturados\n👥 ${data.users || 0} cuidadores activos\n\n${HASH}`;
      case 'species-card':
        return `📚 Especie de la semana: ${data.common_name} (${data.scientific})\n\n${data.description}\n\n${HASH} #BotánicaMexicana`;
      case 'milestone':
        return `🎉 ¡Logramos un hito! ${data.label}\n\nGracias a todos los cuidadores del Proyecto Árbol UNAM 475 que hacen posible este monitoreo continuo. 🌳✨\n\n${HASH}`;
      case 'before-after':
        return `📈 ¡Mira la evolución de uno de nuestros árboles del campus FES Iztacala!\n\nGracias al cuidado constante de la comunidad UNAM, ${data.common_name} sigue creciendo fuerte. 🌳💚\n\n${HASH}`;
      case 'co2-impact':
        return `🌍 ¡Nuestro impacto ambiental! Los árboles cuidados por el Proyecto Árbol UNAM 475 han capturado más de ${data.co2 || 0} kg de CO₂.\n\nCada árbol cuida nuestro aire. 🌳💚\n\n${HASH} #AcciónClimática`;
      default:
        return HASH;
    }
  }

  return {
    generateTreeOfMonth,
    generateMonthlyRecap,
    generateSpeciesCard,
    generateMilestone,
    generateBeforeAfter,
    generateCO2Impact,
    canvasToDownload,
    canvasToShare,
    suggestedCaption,
  };
})();
