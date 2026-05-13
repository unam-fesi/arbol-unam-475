# API Reference — Proyecto Árbol UNAM 475

Referencia técnica de **base de datos**, **políticas RLS**, **funciones SQL**, **Edge Functions** y **deep links**.

---

## 1. Esquema de base de datos

Todas las tablas viven en el schema `public`. RLS está habilitado en TODAS.

### 1.1 `user_profiles`

Datos extendidos del usuario. 1:1 con `auth.users`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | FK a `auth.users(id)` |
| `full_name` | text NOT NULL | |
| `account_number` | text | Número de cuenta UNAM |
| `birth_date` | date | |
| `academic_status` | text CHECK | `alumno, exalumno, egresado, pasante, tesista, becario, postgrado, profesor, profesora` |
| `role` | text CHECK | `user, specialist, admin` |
| `campus` | text | Iztacala, Acatlan, Aragon, Cuautitlan, Zaragoza, CU |
| `telegram_chat_id` | text | Si lo configura, recibe notificaciones por TG |
| `telegram_active` | boolean | Default `true` |
| `specialty` | text | (specialist) |
| `department` | text | (specialist) |
| `contact_info` | text | (specialist) |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` (trigger lo actualiza) |

**Policies:**
- `Admin can view all profiles` (SELECT, `is_admin()`)
- `Admin can update any profile` (UPDATE, `is_admin()`)
- `Admin can insert profiles` (INSERT, `is_admin()`)
- `Admin can delete profiles` (DELETE, `is_admin()`)
- `Users can view own profile` (SELECT, `auth.uid() = id`)
- `Users can update own profile` (UPDATE, `auth.uid() = id` — pero NO puede cambiar `role`)

### 1.2 `trees_catalog`

Inventario maestro de árboles.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `tree_code` | text NOT NULL UNIQUE | Ej: `ARBOL-001` |
| `species` | text NOT NULL | Nombre científico |
| `common_name` | text | Nombre común |
| `tree_type` | text CHECK | `nativo, endemico, ornamental, frutal` |
| `size` | text CHECK | `pequeno, mediano, grande, muy_grande` |
| `campus` | text | |
| `garden_id` | uuid | FK a `gardens(id)` |
| `location_lat` | numeric(10,7) | NULL hasta primer seguimiento |
| `location_lng` | numeric(10,7) | NULL hasta primer seguimiento |
| `location_desc` | text | |
| `status` | text CHECK | `nuevo, activo, enfermo, en_tratamiento, seco, retirado` |
| `health_score` | int CHECK 0-100 | |
| `planting_date` | date | |
| `photo_url` | text | Path relativo en bucket |
| `notes` | text | |
| `initial_height_cm` | numeric | Medida al alta |
| `initial_trunk_diameter_cm` | numeric | |
| `initial_crown_diameter_cm` | numeric | |
| `initial_notes` | text | |
| `created_by` | uuid | FK auth.users |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Policies:**
- `Admin can view all trees` (SELECT, `is_admin()`)
- `Admin can insert trees` (INSERT, `is_admin()`)
- `Admin can delete trees` (DELETE, `is_admin()`)
- `Users can view assigned trees` (SELECT — solo árboles asignados al usuario)
- `Users can update assigned trees` (UPDATE — solo árboles asignados)

### 1.3 `tree_measurements`

Cada seguimiento de un árbol.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `tree_id` | bigint NOT NULL | FK |
| `user_id` | uuid NOT NULL | FK auth.users |
| `measurement_date` | timestamptz NOT NULL | |
| `height_cm` | numeric | |
| `trunk_diameter_cm` | numeric | |
| `crown_diameter_cm` | numeric | |
| `health_score` | int CHECK 0-100 | |
| `photo_url` | text | Path en bucket |
| `observations` | text | Puede contener `[RUBROS] {...}` y `[PLANTACION] {...}` |
| `location_lat` | numeric | Solo en primer registro |
| `location_lng` | numeric | |
| `location_source` | text CHECK | `gps, manual, map` |
| `created_at` | timestamptz | |

**Policies:**
- Admin: ALL
- Owner-write (`user_id = auth.uid()`)
- Owner-read del usuario asignado al árbol

**Trigger AFTER INSERT**: `recompute_badges_meas` → llama `recompute_badges(user_id)` para otorgar insignias.

### 1.4 `tree_assignments`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `tree_id` | bigint NOT NULL | |
| `user_id` | uuid | XOR con group_id (CHECK) |
| `group_id` | uuid | XOR con user_id |
| `assigned_by` | uuid NOT NULL | |
| `assigned_at` | timestamptz | |
| `notes` | text | Puede contener especialista asignado |

**Policies**: Admin ALL · users SELECT solo las suyas.

### 1.5 `gardens`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | Default `gen_random_uuid()` |
| `name` | text NOT NULL | |
| `campus` | text | |
| `location_lat`, `location_lng` | numeric | Centroide |
| `location_desc` | text | |
| `area_m2` | numeric(10,2) | |
| `max_capacity_trees` | int | |
| `soil_type` | CHECK | `arenoso, arcilloso, franco, mixto, rocoso` |
| `irrigation_type` | CHECK | `ninguno, manual, aspersion, goteo, automatizado` |
| `exposure` | CHECK | `sol_pleno, semi_sombra, sombra, mixto` |
| `climate_zone` | text | |
| `established_date` | date | |
| `responsible_specialist_id` | uuid | FK user_profiles |
| `bounds_polygon` | jsonb | GeoJSON polygon (geocerca) |
| `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

### 1.6 `garden_assignments`, `user_groups`, `group_members`

Patrón estándar de M:N con campos de auditoría.

### 1.7 `specialist_followups`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `tree_id` | bigint NOT NULL | |
| `specialist_id` | uuid NOT NULL | FK user_profiles donde role='specialist' |
| `health_assessment` | int CHECK 0-100 | |
| `followup_type` | text CHECK | `inspection, treatment, resolution, observation, emergency` |
| `notes` | text | |
| `created_at` | timestamptz | |

### 1.8 `notifications`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `title`, `message` | text NOT NULL | |
| `target_user_id`, `target_group_id` | uuid | XOR (al menos uno o ambos NULL = broadcast) |
| `sender_id` | uuid | |
| `notification_type` | CHECK | `info, warning, alert, reminder, achievement` |
| `telegram_sent` | boolean | |
| `sent_at` | timestamptz | |

### 1.9 `notification_rules`

Reglas activas para `notification-cron` Edge Function.

| Columna | Tipo | Notas |
|---|---|---|
| `rule_key` | text UNIQUE | `stale_measurement_30d`, `health_drop_20pts`, `weather_frost_alert`, `status_critical` |
| `name`, `description` | text | |
| `enabled` | boolean | |
| `config` | jsonb | Parámetros (`days`, `threshold`, etc.) |

### 1.10 `audit_log`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `occurred_at` | timestamptz | |
| `actor_id` | uuid | FK auth.users (NULL si fue trigger system) |
| `actor_email` | text | |
| `action` | CHECK | `insert, update, delete` |
| `table_name` | text | |
| `row_id` | text | |
| `before_data`, `after_data` | jsonb | Snapshot |

Solo admin puede leer. Triggers la pueblan automáticamente para `trees_catalog`, `user_profiles`, `gardens`, `tree_assignments`.

### 1.11 `badges_catalog` (8 entradas seed)

| id | name | category |
|---|---|---|
| `first_measurement` | Primer Registro | seguimiento |
| `ten_measurements` | Constante | seguimiento |
| `fifty_measurements` | Veterano | seguimiento |
| `healer` | Salvador | salud |
| `photographer` | Fotógrafo | seguimiento |
| `planter` | Reforestador | plantacion |
| `citizen_reporter` | Vigilante | social |
| `high_health_streak` | Cuidador Estelar | salud |

### 1.12 `user_badges`

UNIQUE(user_id, badge_id). Otorgadas por trigger `recompute_badges_meas`.

### 1.13 `weather_records`

UNIQUE(campus, recorded_for_date). Pobladas por `weather-sync`.

### 1.14 `species_care`

UNIQUE(species, month, task_type). Calendario anual por especie.

### 1.15 `problem_reports`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `tree_id` | bigint NOT NULL | |
| `reported_by` | uuid NOT NULL | |
| `title`, `description` | text | |
| `urgency` | CHECK | `low, normal, high, critical` |
| `status` | CHECK | `open, in_progress, resolved, closed` |
| `photo_url` | text | |
| `resolved_at`, `resolved_by`, `resolution_notes` | | |
| `created_at` | | |

### 1.16 `ai_conversations`

Histórico de chat con PUM-AI. Owner-only access.

---

## 2. Funciones SQL útiles

### `is_admin() → boolean`

Chequea si el caller actual es admin. Usado en políticas RLS.

```sql
SELECT public.is_admin();  -- true / false
```

### `recompute_badges(user_id uuid) → void`

Recalcula y otorga las insignias para un usuario. Llamada automáticamente por el trigger; también puedes invocarla manualmente:

```sql
SELECT public.recompute_badges('uuid-del-usuario');
```

### `trees_within_radius(lat, lng, radius_m) → table`

RPC para encontrar árboles cercanos a una coordenada. Útil para QR scan que pasa coords.

```javascript
const { data } = await sb.rpc('trees_within_radius', {
  p_lat: 19.488, p_lng: -99.207, p_radius_m: 50
});
// Returns [{id, tree_code, common_name, distance_m}, ...]
```

---

## 3. Edge Functions

### 3.1 `create-user`

**POST** `/functions/v1/create-user`

Headers: `Authorization: Bearer <admin_jwt>`

```json
{
  "email": "user@example.com",
  "password": "MinSec1234!",
  "full_name": "Nombre Apellido",
  "role": "user",
  "academic_status": "alumno",
  "campus": "Iztacala",
  "account_number": "318...",
  "birth_date": "2000-01-01",
  "specialty": "(opcional, role=specialist)",
  "department": "(opcional)",
  "contact_info": "(opcional)"
}
```

**Respuestas**:
- `200 { success: true, userId: "uuid" }`
- `200 { error: "Solo administradores pueden crear usuarios" }` (no eres admin)
- `200 { error: "<mensaje específico>" }`

### 3.2 `send-telegram-notification`

**POST** `/functions/v1/send-telegram-notification`

Headers: `Authorization: Bearer <admin_jwt>`

Payload (uno de los tres):
```json
{ "broadcast": true, "title": "...", "message": "...", "notificationType": "info" }
{ "groupId": "uuid", "title": "...", "message": "..." }
{ "userId": "uuid", "title": "...", "message": "..." }
```

**Respuesta**:
```json
{
  "success": true,
  "recipients_total": 5,
  "sent": 4,
  "failed": 1,
  "results": [
    {"user_id": "...", "full_name": "...", "ok": true},
    ...
  ]
}
```

Persiste un `notifications` row por destinatario con `telegram_sent` boolean.

### 3.3 `notification-cron`

**POST** `/functions/v1/notification-cron`

No requiere body. Ejecuta todas las reglas en `notification_rules` activas.

Respuesta:
```json
{
  "ok": true,
  "summary": {
    "stale_measurement_30d": 12,
    "health_drop_20pts": 3,
    "weather_frost_alert": 0
  },
  "ranAt": "2026-05-06T07:00:00Z"
}
```

Disparable manualmente desde el Dashboard admin (botón) o vía pg_cron.

### 3.4 `weather-sync`

**POST** `/functions/v1/weather-sync`

Requiere secret `OPENWEATHER_API_KEY`. Recorre los 6 campus, obtiene forecast 24h y persiste en `weather_records`.

### 3.5 `backup-export`

**POST** `/functions/v1/backup-export`

Exporta JSON de tablas críticas a bucket `backups` con nombre `backup-YYYY-MM-DDTHH-MM-SS.json`. Retención automática 90 días.

### 3.6 `pum-ai`

(Función pre-existente, no modificada en este proyecto). Proxy a Gemini API para chat de texto y análisis de imágenes.

---

## 4. Deep Links

URLs especiales que la app interpreta al cargar:

| URL | Comportamiento |
|---|---|
| `?t=<tree_code>` | Abre la ficha del árbol (vista de especialista). Usado en QR de identificación. |
| `?report=<tree_code>` | Abre formulario de reporte ciudadano para ese árbol. Usado en QR de reporte. |
| `?reset=1` | (Reservado) — flujo de password reset, gestionado por Supabase Auth. |

Implementado en `auth.js → handleDeepLink()`. Se ejecuta después de showMainApp.

---

## 5. Almacenamiento (Storage)

| Bucket | Acceso | Contenido |
|---|---|---|
| `tree-photos` | Privado (signed URLs) | Fotos de árboles (catálogo + mediciones). Path: `<tree_id>/<timestamp>.jpg` |
| `backups` | Privado (admin) | Exports JSON automáticos (vía backup-export) |

Las fotos se compriman client-side antes del upload (1200×1200, JPEG 80%).

Para mostrar una foto, el frontend genera una **signed URL** con TTL de 1 hora:

```javascript
const { data } = await sb.storage.from('tree-photos').createSignedUrl(path, 3600);
// data.signedUrl es la URL temporal
```

---

## 6. Constraints CHECK importantes

```sql
trees_catalog.status IN ('nuevo','activo','enfermo','en_tratamiento','seco','retirado')
trees_catalog.tree_type IN ('nativo','endemico','ornamental','frutal')
trees_catalog.size IN ('pequeno','mediano','grande','muy_grande')
trees_catalog.health_score BETWEEN 0 AND 100

user_profiles.role IN ('user','specialist','admin')
user_profiles.academic_status IN ('alumno','exalumno','pasante','profesor','postgrado','tesista','becario','egresado','profesora')

gardens.soil_type IN ('arenoso','arcilloso','franco','mixto','rocoso')
gardens.irrigation_type IN ('ninguno','manual','aspersion','goteo','automatizado')
gardens.exposure IN ('sol_pleno','semi_sombra','sombra','mixto')

notifications.notification_type IN ('info','warning','alert','reminder','achievement')

problem_reports.urgency IN ('low','normal','high','critical')
problem_reports.status IN ('open','in_progress','resolved','closed')

specialist_followups.followup_type IN ('inspection','treatment','resolution','observation','emergency')

species_care.task_type IN ('riego','poda','fertilizacion','inspeccion','plagas','heladas','tutoreo')
species_care.task_intensity IN ('baja','media','alta')
```

---

## 7. Variables de entorno (Edge Functions)

| Secret | Función que lo usa | Descripción |
|---|---|---|
| `SUPABASE_URL` | todas | Auto-provisto por Supabase |
| `SUPABASE_ANON_KEY` | todas | Auto-provisto |
| `SUPABASE_SERVICE_ROLE_KEY` | todas | Auto-provisto |
| `TELEGRAM_BOT_TOKEN` | send-telegram-notification, notification-cron | Token del bot `@Pumai_treebot` |
| `OPENWEATHER_API_KEY` | weather-sync | API key de openweathermap.org |
| `GEMINI_API_KEY` | pum-ai | API key de Google AI Studio |

Configurar en: Supabase Dashboard → Edge Functions → Settings → Secrets.

---

## 8. Cambios recientes

Ver [CHANGELOG.md](../CHANGELOG.md) en la raíz del repo.
