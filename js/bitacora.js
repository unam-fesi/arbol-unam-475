// ============================================================================
// Bitácora — resúmenes mensuales y anuales generados por PUM-AI
// ============================================================================
// Bajo demanda: cuando el usuario abre un árbol o jardín, busca en cache la
// bitácora del periodo. Si no existe, la genera llamando a pum-ai y la guarda.
//
// La bitácora MENSUAL muestra el mes ANTERIOR completo (no el actual, que aún
// está en curso). La bitácora ANUAL se ofrece si ya pasó el 1 de diciembre o
// si el usuario explícitamente la pide.
// ============================================================================

window.Bitacora = (function() {
  'use strict';

  // Helper — formato 'YYYY-MM' del MES ANTERIOR
  function previousMonthYM() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function previousYear() {
    return new Date().getFullYear() - 1;
  }

  function monthLabel(yearMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }

  function resolvePhoto(url, bucket = 'tree-photos') {
    if (!url) return Promise.resolve(null);
    if (/^https?:\/\//.test(url)) return Promise.resolve(url);
    return sb.storage.from(bucket).createSignedUrl(url, 3600 * 24)
      .then(r => r?.data?.signedUrl || null).catch(() => null);
  }

  // ============================================================================
  // BITÁCORA MENSUAL DE ÁRBOL
  // ============================================================================
  async function getOrGenerateTreeMonthly(treeId, yearMonth, force) {
    yearMonth = yearMonth || previousMonthYM();

    // 1) Buscar en cache
    if (!force) {
      const { data: cached } = await sb
        .from('tree_monthly_summaries')
        .select('*').eq('tree_id', treeId).eq('year_month', yearMonth).maybeSingle();
      if (cached) return cached;
    }

    // 2) Cargar datos del árbol + mediciones del mes
    const { data: tree } = await sb.from('trees_catalog')
      .select('*').eq('id', treeId).maybeSingle();
    if (!tree) return null;

    const [yy, mm] = yearMonth.split('-').map(Number);
    const monthStart = new Date(yy, mm - 1, 1).toISOString();
    const monthEnd = new Date(yy, mm, 1).toISOString();
    const { data: meas } = await sb.from('tree_measurements')
      .select('*').eq('tree_id', treeId)
      .gte('measurement_date', monthStart).lt('measurement_date', monthEnd)
      .order('measurement_date');

    // 3) Si NO hay mediciones en ese mes, generar mensaje genérico
    if (!meas || meas.length === 0) {
      return await _save('tree_monthly_summaries', {
        tree_id: treeId,
        year_month: yearMonth,
        summary_text: `Durante ${monthLabel(yearMonth)}, no se registraron seguimientos para ${tree.common_name || tree.species || 'este árbol'}. Te invitamos a visitarlo este mes para registrar sus avances y cuidados — cada observación es valiosa para su monitoreo a largo plazo.`,
        photo_highlighted_url: tree.photo_url || null,
        key_metrics: { measurements: 0 },
      });
    }

    // 4) Construir contexto para PUM-AI
    const prevMonth = new Date(yy, mm - 2, 1).toISOString();
    const { data: prevMeas } = await sb.from('tree_measurements')
      .select('*').eq('tree_id', treeId)
      .gte('measurement_date', prevMonth).lt('measurement_date', monthStart)
      .order('measurement_date', { ascending: false });

    const lastInMonth = meas[meas.length - 1];
    const firstInMonth = meas[0];
    const prevLast = (prevMeas || [])[0];

    const heightChange = (lastInMonth.height_cm && prevLast?.height_cm)
      ? (lastInMonth.height_cm - prevLast.height_cm) : null;
    const healthChange = (lastInMonth.health_score != null && prevLast?.health_score != null)
      ? (lastInMonth.health_score - prevLast.health_score) : null;
    const avgHealth = meas.reduce((s, m) => s + (m.health_score || 0), 0) / meas.length;

    const ctx = {
      tree: tree.common_name || tree.species || 'árbol',
      species: tree.species || '',
      monthName: monthLabel(yearMonth),
      measurements: meas.length,
      photos: meas.filter(m => m.photo_url).length,
      lastHealth: lastInMonth.health_score,
      avgHealth: Math.round(avgHealth),
      healthChange,
      heightChange,
      lastHeight: lastInMonth.height_cm,
      observations: meas.map(m => m.observations).filter(Boolean).join(' | ').substring(0, 400),
    };

    const prompt = `Eres PUM-AI, asistente cálido del Proyecto Árbol UNAM 475 (FES Iztacala).

Escribe una "Carta del mes" para el usuario que cuida ${ctx.tree} (especie ${ctx.species || 'no especificada'}).

Datos del mes ${ctx.monthName}:
- ${ctx.measurements} seguimientos registrados
- ${ctx.photos} fotos tomadas
- Salud al final del mes: ${ctx.lastHealth ?? '?'}/100 (promedio del mes: ${ctx.avgHealth})
- Cambio en salud vs mes anterior: ${ctx.healthChange != null ? (ctx.healthChange > 0 ? '+' : '') + ctx.healthChange + ' puntos' : 'sin comparación'}
- Cambio en altura vs mes anterior: ${ctx.heightChange != null ? (ctx.heightChange > 0 ? '+' : '') + ctx.heightChange + ' cm' : 'sin comparación'}
- Altura actual: ${ctx.lastHeight || '?'} cm
- Observaciones del cuidador: ${ctx.observations || 'sin notas relevantes'}

Escribe un párrafo cálido y motivador (150-200 palabras) que:
1. Reconozca el esfuerzo del cuidador
2. Mencione los datos relevantes (subida/bajada de salud, crecimiento)
3. Sugiera 1-2 acciones concretas para el siguiente mes
4. Use el nombre del árbol con cariño

Responde ÚNICAMENTE con el texto del párrafo (sin markdown, sin JSON, sin comillas alrededor).`;

    let summary;
    try {
      const { data, error } = await sb.functions.invoke('pum-ai', { body: { message: prompt } });
      if (error) throw error;
      summary = (data?.reply || '').trim();
      // Limpiar markdown si llegara
      summary = summary.replace(/^["']|["']$/g, '').replace(/\*\*/g, '');
    } catch (e) {
      console.warn('PUM-AI falló, usando resumen automático:', e);
      summary = _fallbackTreeMonthly(ctx);
    }

    // 5) Foto destacada: la del último seguimiento con foto
    let highlightedPhoto = null;
    for (let i = meas.length - 1; i >= 0; i--) {
      if (meas[i].photo_url) {
        highlightedPhoto = await resolvePhoto(meas[i].photo_url);
        break;
      }
    }

    return await _save('tree_monthly_summaries', {
      tree_id: treeId,
      year_month: yearMonth,
      summary_text: summary,
      photo_highlighted_url: highlightedPhoto,
      key_metrics: {
        measurements: ctx.measurements,
        avg_health: ctx.avgHealth,
        last_health: ctx.lastHealth,
        health_change: ctx.healthChange,
        height_change: ctx.heightChange,
      },
    });
  }

  function _fallbackTreeMonthly(ctx) {
    const verb = ctx.healthChange > 0 ? 'mejoró' : ctx.healthChange < 0 ? 'descendió' : 'se mantuvo estable';
    return `Durante ${ctx.monthName}, ${ctx.tree} tuvo ${ctx.measurements} seguimientos registrados. Su salud ${verb} ${ctx.healthChange != null ? `(${ctx.healthChange > 0 ? '+' : ''}${ctx.healthChange} puntos)` : ''} con un puntaje final de ${ctx.lastHealth || '—'}/100. ${ctx.heightChange ? `Creció ${ctx.heightChange > 0 ? '+' : ''}${ctx.heightChange} cm. ` : ''}Sigue con tu cuidado constante — cada visita cuenta. Para el próximo mes te recomendamos mantener la frecuencia de seguimiento y observar señales de plagas u otros cambios.`;
  }

  // ============================================================================
  // BITÁCORA ANUAL DE ÁRBOL (Wrapped)
  // ============================================================================
  async function getOrGenerateTreeAnnual(treeId, year, force) {
    year = year || previousYear();

    if (!force) {
      const { data: cached } = await sb
        .from('tree_annual_summaries')
        .select('*').eq('tree_id', treeId).eq('year', year).maybeSingle();
      if (cached) return cached;
    }

    const { data: tree } = await sb.from('trees_catalog')
      .select('*').eq('id', treeId).maybeSingle();
    if (!tree) return null;

    const start = new Date(year, 0, 1).toISOString();
    const end = new Date(year + 1, 0, 1).toISOString();
    const { data: meas } = await sb.from('tree_measurements')
      .select('*').eq('tree_id', treeId)
      .gte('measurement_date', start).lt('measurement_date', end)
      .order('measurement_date');

    if (!meas || meas.length === 0) {
      return await _save('tree_annual_summaries', {
        tree_id: treeId, year,
        summary_text: `Durante ${year}, no se registraron seguimientos para ${tree.common_name || tree.species || 'este árbol'}. Te invitamos a continuar su monitoreo el próximo año.`,
        highlights: { measurements: 0 },
      });
    }

    const photos = meas.filter(m => m.photo_url).length;
    const first = meas[0], last = meas[meas.length - 1];
    const heightGrowth = (last.height_cm && first.height_cm) ? (last.height_cm - first.height_cm) : null;
    const startHealth = first.health_score;
    const endHealth = last.health_score;
    // Extraer mes del string sin TZ (evita off-by-one en seguimientos cerca de medianoche)
    const months = new Set(meas.map(m => String(m.measurement_date || '').slice(5, 7))).size;
    const avgHealth = Math.round(meas.reduce((s, m) => s + (m.health_score || 0), 0) / meas.length);

    const co2 = window.CO2Calculator?.calculateCO2Stored(tree) || 0;

    const highlights = {
      measurements: meas.length,
      photos,
      months_active: months,
      height_growth: heightGrowth,
      start_health: startHealth,
      end_health: endHealth,
      avg_health: avgHealth,
      co2_stored: Math.round(co2 * 10) / 10,
    };

    const prompt = `Eres PUM-AI. Escribe el "Resumen anual ${year}" para ${tree.common_name || tree.species || 'un árbol'} del Proyecto Árbol UNAM 475 — estilo emotivo tipo "Spotify Wrapped".

Datos del año ${year}:
- ${meas.length} seguimientos en ${months} meses distintos
- ${photos} fotos tomadas
- Crecimiento de altura: ${heightGrowth ? heightGrowth + ' cm' : 'sin datos suficientes'}
- Salud al inicio: ${startHealth ?? '?'}/100
- Salud al final: ${endHealth ?? '?'}/100
- Salud promedio: ${avgHealth}/100
- CO₂ capturado estimado: ${Math.round(co2)} kg

Escribe un párrafo de 200-280 palabras emotivo y celebratorio que:
1. Felicite por el año de cuidados
2. Destaque 2-3 logros concretos
3. Si hubo retos (salud bajó), reconócelos con empatía
4. Termine con una mirada al futuro

ÚNICAMENTE el texto, sin markdown ni JSON.`;

    let summary;
    try {
      const { data, error } = await sb.functions.invoke('pum-ai', { body: { message: prompt } });
      if (error) throw error;
      summary = (data?.reply || '').trim().replace(/^["']|["']$/g, '').replace(/\*\*/g, '');
    } catch (e) {
      summary = `${year} fue un año importante para ${tree.common_name || tree.species || 'tu árbol'}: ${meas.length} seguimientos en ${months} meses distintos, ${photos} fotos para documentar su evolución. La salud promedio del año fue ${avgHealth}/100. ¡Gracias por tu compromiso!`;
    }

    let highlightedPhoto = null;
    for (let i = meas.length - 1; i >= 0; i--) {
      if (meas[i].photo_url) {
        highlightedPhoto = await resolvePhoto(meas[i].photo_url);
        break;
      }
    }

    return await _save('tree_annual_summaries', {
      tree_id: treeId, year, summary_text: summary, highlights, photo_highlighted_url: highlightedPhoto,
    });
  }

  // ============================================================================
  // BITÁCORA MENSUAL DE JARDÍN
  // ============================================================================
  async function getOrGenerateGardenMonthly(gardenId, yearMonth, force) {
    yearMonth = yearMonth || previousMonthYM();

    if (!force) {
      const { data: cached } = await sb
        .from('garden_monthly_summaries')
        .select('*').eq('garden_id', gardenId).eq('year_month', yearMonth).maybeSingle();
      if (cached) return cached;
    }

    const { data: garden } = await sb.from('gardens')
      .select('*').eq('id', gardenId).maybeSingle();
    if (!garden) return null;

    const [yy, mm] = yearMonth.split('-').map(Number);
    const monthStart = new Date(yy, mm - 1, 1).toISOString();
    const monthEnd = new Date(yy, mm, 1).toISOString();
    const { data: visits } = await sb.from('garden_visits')
      .select('*').eq('garden_id', gardenId)
      .gte('visit_date', monthStart).lt('visit_date', monthEnd)
      .order('visit_date');

    if (!visits || visits.length === 0) {
      return await _save('garden_monthly_summaries', {
        garden_id: gardenId, year_month: yearMonth,
        summary_text: `Durante ${monthLabel(yearMonth)}, no se registraron visitas para el jardín ${garden.name}. Te invitamos a programar una visita pronto para mantener su seguimiento.`,
        key_metrics: { visits: 0 },
      });
    }

    const avgHealth = Math.round(visits.reduce((s, v) => s + (v.health_score || 0), 0) / visits.length);
    const allActivities = new Set();
    visits.forEach(v => (v.activities || []).forEach(a => allActivities.add(a)));

    const prompt = `Eres PUM-AI. Escribe una "Carta del mes" para el jardín "${garden.name}" del Proyecto Árbol UNAM 475.

Datos de ${monthLabel(yearMonth)}:
- ${visits.length} visitas registradas
- Salud promedio del jardín: ${avgHealth}/100
- Actividades realizadas: ${[...allActivities].join(', ') || 'sin registro de actividades'}
- Tipo de jardín: ${garden.soil_type || 'sin datos'}, exposición ${garden.exposure || 'no especificada'}, riego ${garden.irrigation_type || 'no especificado'}

Escribe 150-200 palabras cálidas que:
1. Reconozcan el trabajo del equipo
2. Mencionen acciones concretas realizadas
3. Sugieran 1-2 acciones para el próximo mes según la estación actual
4. Sean específicas a ese jardín

ÚNICAMENTE el texto.`;

    let summary;
    try {
      const { data, error } = await sb.functions.invoke('pum-ai', { body: { message: prompt } });
      if (error) throw error;
      summary = (data?.reply || '').trim().replace(/^["']|["']$/g, '').replace(/\*\*/g, '');
    } catch (e) {
      summary = `Durante ${monthLabel(yearMonth)}, el jardín ${garden.name} recibió ${visits.length} visitas con una salud promedio de ${avgHealth}/100. Las actividades realizadas incluyeron: ${[...allActivities].join(', ') || 'inspecciones generales'}. Sigue con el cuidado regular.`;
    }

    let highlightedPhoto = null;
    for (let i = visits.length - 1; i >= 0; i--) {
      if (visits[i].photo_url) {
        highlightedPhoto = await resolvePhoto(visits[i].photo_url, 'garden-photos');
        break;
      }
    }

    return await _save('garden_monthly_summaries', {
      garden_id: gardenId, year_month: yearMonth,
      summary_text: summary, photo_highlighted_url: highlightedPhoto,
      key_metrics: { visits: visits.length, avg_health: avgHealth, activities: [...allActivities] },
    });
  }

  // ============================================================================
  // BITÁCORA ANUAL DE JARDÍN
  // ============================================================================
  async function getOrGenerateGardenAnnual(gardenId, year, force) {
    year = year || previousYear();

    if (!force) {
      const { data: cached } = await sb
        .from('garden_annual_summaries')
        .select('*').eq('garden_id', gardenId).eq('year', year).maybeSingle();
      if (cached) return cached;
    }

    const { data: garden } = await sb.from('gardens')
      .select('*').eq('id', gardenId).maybeSingle();
    if (!garden) return null;

    const start = new Date(year, 0, 1).toISOString();
    const end = new Date(year + 1, 0, 1).toISOString();
    const { data: visits } = await sb.from('garden_visits')
      .select('*').eq('garden_id', gardenId)
      .gte('visit_date', start).lt('visit_date', end);

    if (!visits || visits.length === 0) {
      return await _save('garden_annual_summaries', {
        garden_id: gardenId, year,
        summary_text: `Durante ${year} no se registraron visitas para el jardín ${garden.name}.`,
        highlights: { visits: 0 },
      });
    }

    const avgHealth = Math.round(visits.reduce((s, v) => s + (v.health_score || 0), 0) / visits.length);
    const months = new Set(visits.map(v => new Date(v.visit_date).getMonth())).size;
    const allActivities = new Set();
    visits.forEach(v => (v.activities || []).forEach(a => allActivities.add(a)));

    const highlights = {
      visits: visits.length,
      months_active: months,
      avg_health: avgHealth,
      activities_variety: allActivities.size,
      activities: [...allActivities],
    };

    const prompt = `Eres PUM-AI. Escribe el "Resumen anual ${year}" para el jardín "${garden.name}" del Proyecto Árbol UNAM 475 — emotivo tipo "Spotify Wrapped".

Datos ${year}:
- ${visits.length} visitas en ${months} meses
- Salud promedio: ${avgHealth}/100
- Variedad de actividades: ${allActivities.size} tipos (${[...allActivities].join(', ')})

200-280 palabras celebratorias.`;

    let summary;
    try {
      const { data, error } = await sb.functions.invoke('pum-ai', { body: { message: prompt } });
      if (error) throw error;
      summary = (data?.reply || '').trim().replace(/^["']|["']$/g, '').replace(/\*\*/g, '');
    } catch (e) {
      summary = `${year} en el jardín ${garden.name}: ${visits.length} visitas en ${months} meses, salud promedio ${avgHealth}/100, ${allActivities.size} tipos de actividades realizadas. ¡Gracias por el trabajo constante!`;
    }

    let highlightedPhoto = null;
    for (let i = visits.length - 1; i >= 0; i--) {
      if (visits[i].photo_url) {
        highlightedPhoto = await resolvePhoto(visits[i].photo_url, 'garden-photos');
        break;
      }
    }

    return await _save('garden_annual_summaries', {
      garden_id: gardenId, year, summary_text: summary, highlights, photo_highlighted_url: highlightedPhoto,
    });
  }

  async function _save(table, record) {
    record.generated_by_user = currentUser?.id;
    const { data, error } = await sb.from(table).upsert(record).select().single();
    if (error) { console.warn(`Bitacora save error (${table}):`, error); return record; }
    return data;
  }

  // ============================================================================
  // RENDER — HTML de una bitácora
  // ============================================================================
  function renderBitacoraCard(bitacora, type) {
    if (!bitacora) return '';
    const esc = window.escapeHtml || (s => s);
    const title = type === 'annual'
      ? `🎉 Resumen del año ${bitacora.year || ''}`
      : `📝 Carta del mes — ${bitacora.year_month ? monthLabel(bitacora.year_month) : ''}`;
    const accent = type === 'annual' ? '#9C27B0' : '#1a4480';
    const bg = type === 'annual'
      ? 'linear-gradient(135deg,rgba(156,39,176,0.10),rgba(255,167,38,0.10))'
      : 'linear-gradient(135deg,rgba(26,68,128,0.10),rgba(46,125,50,0.08))';

    let metricsHtml = '';
    if (bitacora.highlights) {
      const h = bitacora.highlights;
      const m = [];
      if (h.measurements != null || h.visits != null)
        m.push({ label: type === 'annual' ? 'Total registros' : 'Visitas', value: h.measurements ?? h.visits });
      if (h.months_active) m.push({ label: 'Meses activos', value: `${h.months_active}/12` });
      if (h.height_growth) m.push({ label: 'Crecimiento', value: `+${h.height_growth} cm` });
      if (h.co2_stored) m.push({ label: 'CO₂ capturado', value: `${h.co2_stored} kg` });
      if (h.avg_health != null) m.push({ label: 'Salud promedio', value: `${h.avg_health}/100` });
      if (h.activities_variety) m.push({ label: 'Variedad actividades', value: h.activities_variety });
      if (m.length > 0) {
        metricsHtml = `
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.8rem 0;">
            ${m.map(x => `<span style="background:rgba(255,255,255,0.7);padding:0.35rem 0.8rem;border-radius:18px;font-size:0.78rem;color:#444;"><strong>${x.value}</strong> ${x.label}</span>`).join('')}
          </div>`;
      }
    }

    return `
      <div class="card" style="padding:1.3rem;margin-bottom:1rem;background:${bg};border-left:4px solid ${accent};">
        <div style="display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
          ${bitacora.photo_highlighted_url ? `
            <img src="${esc(bitacora.photo_highlighted_url)}"
              style="width:96px;height:96px;border-radius:14px;object-fit:cover;flex-shrink:0;cursor:zoom-in;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.15);"
              onclick="window.open(this.src,'_blank')" onerror="this.style.display='none'">
          ` : ''}
          <div style="flex:1;min-width:240px;">
            <h4 style="margin:0 0 0.3rem;color:${accent};">${title}</h4>
            <p style="margin:0 0 0.4rem;font-size:0.7rem;color:#888;">
              <i class="fas fa-robot"></i> Generado por PUM-AI · ${new Date(bitacora.generated_at).toLocaleDateString('es-MX')}
            </p>
          </div>
        </div>
        ${metricsHtml}
        <p style="color:#333;line-height:1.6;margin:0.5rem 0 0;font-size:0.92rem;white-space:pre-wrap;">${esc(bitacora.summary_text)}</p>
      </div>
    `;
  }

  return {
    getOrGenerateTreeMonthly,
    getOrGenerateTreeAnnual,
    getOrGenerateGardenMonthly,
    getOrGenerateGardenAnnual,
    renderBitacoraCard,
    previousMonthYM,
    previousYear,
  };
})();
