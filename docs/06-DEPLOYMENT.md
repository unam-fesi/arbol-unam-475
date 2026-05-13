# Guía de Despliegue — Proyecto Árbol UNAM 475

Cómo desplegar el sistema desde cero, o cómo mantener el deploy actual.

---

## 1. Arquitectura de despliegue

| Componente | Plataforma | URL |
|---|---|---|
| Frontend (HTML/JS/CSS) | GitHub Pages | `https://unam-fesi.github.io/arbol-unam-475/` |
| Backend (BD + Auth + Storage) | Supabase | `https://hambscfdiaymowskislw.supabase.co` |
| Edge Functions (Deno) | Supabase Edge | `*.supabase.co/functions/v1/*` |
| Bot Telegram | Telegram BotFather | `@Pumai_treebot` |
| API IA | Google Gemini | `generativelanguage.googleapis.com` |
| API Clima | OpenWeather | `api.openweathermap.org` |

---

## 2. Despliegue desde cero

### 2.1 Crear proyecto en Supabase

1. Cuenta en https://supabase.com (gratuita o paga).
2. **New Project** → nombre `acacia-unam-475` (o el que prefieras), región más cercana.
3. Anota la **URL del proyecto** y la **anon key** (Project Settings → API).

### 2.2 Configurar variables iniciales

Project Settings → API:
- Copia el `Project URL` → lo necesitas para `js/config.js`
- Copia la `anon public key` → lo necesitas para `js/config.js`
- Anota la `service_role key` → la usarán las Edge Functions automáticamente

Project Settings → Auth → URL Configuration:
- Site URL: `https://unam-fesi.github.io/arbol-unam-475`
- Redirect URLs: agrega la misma URL para reset password

### 2.3 Crear schema de BD

En **SQL Editor**, ejecuta en orden:
1. Tu schema base original (si lo tienes — incluye creación de tablas como `user_profiles`, `trees_catalog`, etc.). Si arrancas en limpio, contacta al equipo para tener este SQL.
2. **`supabase-functions/01-hardening.sql`** — políticas RLS estrictas, drops de tablas legacy, columnas de especialista.
3. **`supabase-functions/02-innovations.sql`** — audit, badges, weather, species_care, problem_reports extras, RPC.

Verifica al final que no haya errores ejecutando:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
```
Todas deben mostrar `rowsecurity = true`.

### 2.4 Crear Storage buckets

Storage → New bucket:

| Nombre | Público? | Notas |
|---|---|---|
| `tree-photos` | **NO** (privado) | Fotos de árboles. Las URLs son firmadas con TTL. |
| `backups` | **NO** | Para `backup-export`. |

### 2.5 Configurar Auth

Authentication → Settings:
- Enable email signup: **OFF** (los usuarios los crea el admin).
- Confirm email: **ON** (en producción) o **OFF** (en desarrollo).
- Session expiry: dejar default 1h (refresh token rotación).

Authentication → Email Templates → personaliza:
- Reset password — branding UNAM, instrucciones claras
- Magic link — opcional

### 2.6 Crear primer admin

Vía SQL Editor (o Authentication → Users → Add user):

```sql
-- Usuario admin (por consola Auth, password manual)
INSERT INTO public.user_profiles(id, full_name, role, campus, academic_status)
VALUES (
  '<uuid-del-usuario-recien-creado>',
  'Administrador FESI',
  'admin',
  'Iztacala',
  'profesor'
);
```

### 2.7 Desplegar Edge Functions

Usar Supabase CLI o el dashboard. Vía dashboard:

1. Edge Functions → **Deploy a function**.
2. Para cada una de:
   - `create-user`
   - `send-telegram-notification`
   - `notification-cron`
   - `weather-sync`
   - `backup-export`
   - `pum-ai` (si no existe ya)

   Pega el contenido del archivo correspondiente desde `supabase-functions/<nombre>/index.ts`.

3. Edge Functions → Settings → **Secrets** — agrega:
   - `TELEGRAM_BOT_TOKEN` = (token del bot)
   - `OPENWEATHER_API_KEY` = (api key gratuita)
   - `GEMINI_API_KEY` = (api key)
   - Las `SUPABASE_*` variables son auto-provistas; no las pongas tú.

### 2.8 Configurar GitHub Pages

1. Repo en GitHub: `unam-fesi/arbol-unam-475` (o el que sea).
2. Subir TODOS los archivos del repo (excepto `supabase-functions/` que vive en Supabase).
3. Settings → Pages → Source: **main branch / root folder**.
4. Esperar deploy. URL: `https://<org>.github.io/<repo>/`

### 2.9 Configurar el bot de Telegram

1. En Telegram busca **@BotFather**.
2. `/newbot` → sigue el wizard. Nombre del bot: `Proyecto Árbol UNAM`. Username: `Pumai_treebot` (o el que esté disponible).
3. Anota el **token** que te da BotFather (formato `12345:ABC...`).
4. Pégalo en el secret `TELEGRAM_BOT_TOKEN` de Supabase Edge Functions.
5. (Opcional) `/setdescription` y `/setabouttext` para personalizar.

### 2.10 (Opcional) Programar pg_cron

Si tu plan de Supabase incluye `pg_cron` (pago), Database → Extensions → habilita `pg_cron` y `pg_net`. Después en SQL Editor:

```sql
SELECT cron.schedule('notification-cron-daily', '0 7 * * *',
  $$SELECT net.http_post(
    url := 'https://hambscfdiaymowskislw.supabase.co/functions/v1/notification-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );$$);

SELECT cron.schedule('weather-sync-daily', '15 6 * * *', /* misma estructura para weather-sync */);
SELECT cron.schedule('backup-weekly', '0 4 * * 0', /* misma estructura para backup-export */);
```

Si NO tienes pg_cron, usa GitHub Actions (workflow scheduled) o cron-job.org como disparador externo.

---

## 3. Despliegue de cambios (workflow continuo)

### 3.1 Cambios en frontend

```bash
# Local: edita los archivos en js/, index.html, etc.
git add .
git commit -m "feat: descripción del cambio"
git push origin main
# GitHub Pages auto-redeploya en ~1 min
```

> ⚠️ Limpiar cache del navegador o cambiar el query string de la URL para forzar re-fetch del Service Worker.

### 3.2 Cambios en BD

Crea archivos SQL versionados en `supabase-functions/`:
- `03-feature-XXX.sql`
- `04-bugfix-YYY.sql`

Pega el contenido en SQL Editor de Supabase y ejecuta.

> 💡 Mantén los archivos en repo para historial.

### 3.3 Cambios en Edge Functions

Edita el archivo `.ts` localmente. Después en Dashboard:
1. Edge Functions → la función → **Edit**.
2. Pega el código actualizado.
3. **Deploy**.

> 💡 Si no quieres copy-paste, instala Supabase CLI (`npm install -g supabase`) y usa `supabase functions deploy`.

---

## 4. Configuración del cliente

Asegúrate que `js/config.js` tiene:

```javascript
const SUPABASE_URL = 'https://<tu-proyecto>.supabase.co';
const SUPABASE_KEY = 'eyJhbGc...';  // anon public key
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

> ⚠️ Esta key es **anon (pública)**, no la service_role. La security la dan las RLS policies.

---

## 5. Checklist de deploy

Después de desplegar, verifica con esta lista:

- [ ] Login funciona con admin@unam.mx
- [ ] PUM-AI responde a un mensaje de prueba
- [ ] Crear un árbol desde admin → aparece en tabla
- [ ] Crear un usuario desde admin → puede hacer login
- [ ] Asignar el árbol al usuario → el usuario lo ve
- [ ] Como usuario, hacer primer registro con GPS
- [ ] El árbol queda con `location_lat/lng` poblados
- [ ] El badge `first_measurement` se otorga
- [ ] El admin ve el registro en audit_log
- [ ] Generar QR de un árbol y escanearlo desde celular
- [ ] PWA instalable: aparece prompt de instalar en Chrome móvil
- [ ] Modo offline: encolar una medición, regresar online, se sincroniza
- [ ] Service Worker registrado: DevTools → Application → Service Workers → activo
- [ ] Telegram: enviar notificación a usuario con chat_id → recibe el mensaje
- [ ] Backup manual: invocar `backup-export` → archivo aparece en bucket `backups`
- [ ] Weather: invocar `weather-sync` → 6 filas en `weather_records`
- [ ] Forgot password: enlace en email funciona

---

## 6. Configuración de dominio personalizado (opcional)

Si quieres usar dominio propio en lugar de github.io:

1. GitHub: Settings → Pages → Custom domain → `arbol.unam.mx` (o el que sea).
2. DNS: agregar CNAME apuntando a `unam-fesi.github.io`.
3. Habilitar HTTPS.
4. Actualizar `js/config.js` y CORS en Supabase Edge Functions (`ALLOWED_ORIGINS`).
5. Actualizar `manifest.json` start_url y scope si cambia.

---

## 7. Rollback

Si un deploy rompe algo:

### Frontend
```bash
git revert HEAD
git push origin main
```

### BD
- Restaurar desde el último backup (`backups` bucket → JSON → import via SQL).
- Si fue un cambio de schema: drop / alter manual.

### Edge Function
- Edge Functions → función → versiones previas (Supabase guarda historial).
- Click en una versión anterior → **Redeploy this version**.

---

## 8. Monitoreo

| Qué monitorear | Dónde |
|---|---|
| Errores de Edge Functions | Supabase → Edge Functions → Logs |
| Errores de Auth | Supabase → Authentication → Logs |
| Queries lentas | Supabase → Database → Query Performance |
| Uso de Storage | Supabase → Storage → tamaño por bucket |
| Status de Supabase | https://status.supabase.com |
| Status de GitHub Pages | https://www.githubstatus.com |

---

## 9. Costos estimados

Para uso académico moderado (≤500 usuarios, ≤5000 árboles, ≤50000 mediciones/año):

| Servicio | Plan | Costo |
|---|---|---|
| Supabase | Free tier (500MB DB, 1GB Storage, 50k MAU) | $0 |
| GitHub Pages | Public repo | $0 |
| Telegram Bot API | — | $0 |
| OpenWeather API | Free (60 calls/min, 1M calls/month) | $0 |
| Google Gemini | Free tier (con límites) | $0 |
| Dominio (opcional) | `.org.mx` UNAM | $0 (institucional) |
| **Total** | | **$0/mes** |

Si crece a >50k usuarios o >100k mediciones/mes, considerar Supabase Pro ($25/mes).
