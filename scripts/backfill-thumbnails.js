#!/usr/bin/env node
/**
 * scripts/backfill-thumbnails.js
 * -------------------------------------------------------------------
 * Genera y sube los thumbnails (_thumb.jpg) para todas las fotos que
 * actualmente NO los tienen en los buckets `tree-photos` y `garden-photos`.
 *
 * Ejecutar UNA VEZ desde tu máquina local después de migrar a v49:
 *
 *   cd /Users/samuelf/Work/UNAM/arbol/scripts
 *   npm install @supabase/supabase-js sharp
 *   SUPABASE_URL="https://hambscfdiaymowskislw.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
 *   node backfill-thumbnails.js
 *
 * El service_role key lo sacas de Supabase → Project Settings → API.
 * USA ese key (NO el anon) — es el único que puede listar/escribir todo.
 *
 * El script es idempotente: si un thumbnail ya existe lo salta.
 * -------------------------------------------------------------------
 */

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BUCKETS = ['tree-photos', 'garden-photos'];
const THUMB_MAX = 400;
const THUMB_QUALITY = 65;

function isThumbName(name) {
  return /_thumb\.jpg$/i.test(name);
}
function thumbNameFor(name) {
  return name.replace(/\.(jpe?g|png|webp)$/i, '_thumb.jpg');
}

async function listAllObjects(bucket, prefix = '') {
  // El SDK list() solo regresa hasta 100 items y no es recursivo, así que
  // recorremos por carpeta. En este proyecto las carpetas son tree_id/garden_id.
  const out = [];
  const { data: top } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const item of (top || [])) {
    if (item.id === null && item.name) {
      // Es una carpeta — recursionar
      const sub = await listAllObjects(bucket, prefix ? `${prefix}/${item.name}` : item.name);
      out.push(...sub);
    } else if (item.name) {
      out.push({ path: prefix ? `${prefix}/${item.name}` : item.name, size: item.metadata?.size || 0 });
    }
  }
  return out;
}

async function processBucket(bucket) {
  console.log(`\n=== Procesando bucket: ${bucket} ===`);
  const all = await listAllObjects(bucket);
  const originals = all.filter(o => !isThumbName(o.path));
  const existingThumbs = new Set(all.filter(o => isThumbName(o.path)).map(o => o.path));

  console.log(`  Total objetos: ${all.length}`);
  console.log(`  Originales: ${originals.length}`);
  console.log(`  Thumbs existentes: ${existingThumbs.size}`);

  let created = 0, skipped = 0, failed = 0;
  for (const orig of originals) {
    const thumbPath = thumbNameFor(orig.path);
    if (existingThumbs.has(thumbPath)) {
      skipped++;
      continue;
    }
    try {
      // Descargar original
      const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(orig.path);
      if (dlErr) throw dlErr;
      const buffer = Buffer.from(await blob.arrayBuffer());

      // Generar thumbnail con sharp (400px max, JPEG quality 65)
      const thumbBuffer = await sharp(buffer)
        .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toBuffer();

      // Subir
      const { error: upErr } = await sb.storage.from(bucket).upload(thumbPath, thumbBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg'
      });
      if (upErr) throw upErr;

      console.log(`  ✓ ${orig.path} → ${thumbPath} (${(thumbBuffer.length / 1024).toFixed(0)} KB)`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${orig.path}:`, err.message || err);
      failed++;
    }
  }
  console.log(`  Resumen: ${created} creados · ${skipped} ya existían · ${failed} fallos`);
}

(async () => {
  for (const bucket of BUCKETS) {
    try {
      await processBucket(bucket);
    } catch (err) {
      console.error(`Error procesando bucket ${bucket}:`, err);
    }
  }
  console.log('\n✓ Backfill terminado.');
})();
