# Manual de Administrador — Proyecto Árbol UNAM 475

> Este manual es para usuarios con rol `admin`. Si tu rol es `user` o `specialist`, no podrás acceder al panel admin.

---

## 1. Acceso al panel admin

Después de iniciar sesión, verás en el menú superior un botón **"Admin"**. Solo aparece si tu rol es `admin`.

> 📷 **[screenshots/admin-01-menu.png]** — *Barra superior con menú admin visible.*

Click en **Admin** y verás 9 pestañas:

| Pestaña | Para qué sirve |
|---|---|
| **Usuarios** | Crear, editar y dar de baja cuentas |
| **Árboles** | Inventario maestro de árboles |
| **Jardines** | Áreas verdes con metadata |
| **Grupos** | Agrupar usuarios para asignaciones colectivas |
| **Notificaciones** | Enviar mensajes a usuarios/grupos |
| **Asignaciones** | Asignar árboles y jardines a responsables |
| **Dashboard** | Estadísticas, mapa, exportes, alertas climáticas |
| **Reportes Ciudadanos** | Ver y resolver reportes enviados por usuarios |
| **Auditoría** | Histórico de cambios en BD |

> 📷 **[screenshots/admin-02-tabs.png]** — *Pestañas del panel admin.*

---

## 2. Usuarios

### 2.1 Crear un usuario

1. Pestaña **Usuarios** → llena el formulario:
   - **Nombre completo** (requerido)
   - **Correo** (requerido, debe ser único)
   - **Contraseña** (mínimo 8 caracteres)
   - **Número de cuenta** (opcional)
   - **Fecha de nacimiento** (opcional)
   - **Estatus académico** (alumno, profesor, etc.)
   - **Rol** (user / specialist / admin)
   - **Campus**

2. Si el rol es **specialist**, aparecen 3 campos extras:
   - **Especialidad**
   - **Departamento / Unidad**
   - **Contacto adicional**

3. Click en **"Guardar Usuario"**.

> 📷 **[screenshots/admin-03-form-user.png]** — *Formulario de alta de usuario con sección de especialista visible (cuando role=specialist).*

✅ El usuario recibe su cuenta con la contraseña que pusiste. **Comunícale las credenciales por canal seguro** (correo o Telegram personal). Pídele que cambie la contraseña en su primer login.

### 2.2 Editar un usuario

En la tabla de usuarios → botón **Editar** en la fila correspondiente. Modal con todos los campos editables, incluyendo `telegram_chat_id` y los campos de especialista.

> 📷 **[screenshots/admin-04-edit-user.png]** — *Modal de edición de usuario.*

⚠️ El **correo** y la **contraseña** NO se editan desde aquí (Supabase los gestiona en `auth.users`). Para cambios usa la consola de Supabase o pide al usuario que use "Olvidé mi contraseña".

### 2.3 Dar de baja un usuario

Por seguridad, **no se borran** desde la UI. Marca al usuario como inactivo cambiando algún campo o pide al admin de Supabase que lo borre del dashboard.

---

## 3. Árboles

### 3.1 Alta de árbol (inventario)

> 💡 El alta es solo de **inventario**. La ubicación exacta (lat/lng) la captura el usuario asignado en su primer seguimiento.

Pestaña **Árboles** → llena:

- **Código** (único, ej: `ARBOL-001`)
- **Especie** (científica, ej: `Fraxinus uhdei`)
- **Nombre común** (ej: Fresno)
- **Tipo** (nativo / endémico / ornamental / frutal)
- **Tamaño** (pequeño / mediano / grande / muy grande)
- **Campus** (Iztacala / Acatlán / Aragón / Cuautitlán / Zaragoza / CU)
- **Jardín** (opcional, si pertenece a uno)
- **Fecha de plantación** (opcional)
- **Estado** (nuevo / activo / enfermo / en tratamiento / seco / retirado)
- **Salud** (0–100, default 80)
- **Medidas iniciales** (altura, tronco, copa)
- **Notas iniciales**

> 📷 **[screenshots/admin-05-form-tree.png]** — *Formulario de alta de árbol.*

Click **"Guardar Árbol"**.

### 3.2 Tabla de árboles

Cada fila tiene 3 botones:
- ✏️ **Editar** — abre modal con todos los campos (incluyendo lat/lng si ya fueron capturados)
- 📱 **QR** — genera la placa imprimible con dos QRs (ficha + reporte)
- 🗑️ **Eliminar** — borra el árbol y todas sus mediciones (cascade)

> 📷 **[screenshots/admin-06-tabla-arboles.png]** — *Tabla con árboles, columna estado, salud, ícono 📍 cuando tiene ubicación.*

⚠️ El icono **📍** indica si el árbol ya tiene ubicación capturada. Los recién creados aparecen con el icono **gris** hasta que el usuario asignado haga su primer seguimiento.

### 3.3 Generar y imprimir QR

Click en el botón **📱** de cualquier árbol → modal con dos QRs:

| QR | Para qué |
|---|---|
| **Identificación** | Lleva al ciudadano a la ficha del árbol |
| **Reporte ciudadano** | Lleva directo al formulario de reporte |

> 📷 **[screenshots/admin-07-qr-modal.png]** — *Modal con dos QRs lado a lado y botones "Imprimir placa" / "Descargar PNG".*

Click en **"Imprimir placa"** abre una vista lista para imprimir, con:
- Nombre común y código del árbol
- Los dos QRs
- Diseño de tarjeta para pegar al árbol

> 📷 **[screenshots/admin-08-placa-impresa.png]** — *Vista de impresión con la placa formateada.*

**Recomendación**: imprime en hoja vinílica autoadhesiva o lamina con plástico. Pégala a una altura visible (1.5m) en el tronco, con el QR de reporte hacia el lado más visible.

---

## 4. Jardines

### 4.1 Alta de jardín

Pestaña **Jardines** → llena:

| Campo | Ejemplo |
|---|---|
| Nombre | "Jardín Central FESI" |
| Campus | Iztacala |
| Latitud / Longitud (centroide) | 19.4880 / -99.2074 |
| Área (m²) | 500 |
| Capacidad máx. de árboles | 50 |
| Tipo de suelo | franco / arenoso / arcilloso / mixto / rocoso |
| Riego | manual / aspersión / goteo / automatizado / ninguno |
| Exposición solar | sol pleno / semi-sombra / sombra / mixto |
| Zona climática | "Templado subhúmedo" |
| Fecha de establecimiento | 2024-03-10 |
| Especialista responsable | (lista de specialists) |
| Descripción | "Zona cultural junto al circuito exterior" |
| Notas | Restricciones, recomendaciones |

> 📷 **[screenshots/admin-09-form-jardin.png]** — *Formulario completo de alta de jardín.*

### 4.2 Editar / borrar

Mismo patrón que árboles: tabla con botones **Editar** y **Eliminar**.

⚠️ Al borrar un jardín, los árboles que apuntaban a él quedan con `garden_id = NULL` (no se eliminan).

---

## 5. Grupos

Sirven para asignar árboles o jardines colectivamente (ej: "Grupo 4to semestre Biología").

### 5.1 Crear grupo

Pestaña **Grupos** → nombre + descripción → **Guardar**.

### 5.2 Agregar miembros

Click en el grupo → **Gestionar miembros** → busca y agrega usuarios.

> 📷 **[screenshots/admin-10-grupos.png]** — *Pestaña de grupos con miembros.*

---

## 6. Asignaciones

Aquí decides **quién es responsable de qué árbol o jardín**.

### 6.1 Asignar un árbol

Pestaña **Asignaciones**:
1. Selecciona **tipo de destinatario**: usuario o grupo.
2. Selecciona el **árbol** (los ya asignados aparecen marcados).
3. Selecciona el **destinatario**.
4. (Opcional) Selecciona un **especialista** para tutoreo.
5. (Opcional) Notas.
6. **Asignar**.

> 📷 **[screenshots/admin-11-asignar-arbol.png]** — *Formulario de asignación de árbol.*

### 6.2 Asignar un jardín

Igual pero con jardín y rangos de árboles que ese jardín contiene.

### 6.3 Quitar una asignación

Botón **Quitar** en la tabla de asignaciones existentes.

> ⚠️ **Cada árbol solo puede estar asignado a UN usuario o grupo a la vez.** Si reasignas, la asignación anterior se reemplaza.

---

## 7. Notificaciones

### 7.1 Enviar una notificación

Pestaña **Notificaciones**:

1. **Tipo de destinatario**: Todos / Usuario específico / Grupo
2. **Tipo de notificación**: info / warning / alert / reminder / achievement
3. **Título** y **Mensaje**
4. **(Importante) Checkbox "Enviar también por Telegram"** — si lo activas, además de la in-app se envía vía bot.
5. Click **"Enviar"**.

> 📷 **[screenshots/admin-12-form-notif.png]** — *Formulario con checkbox de Telegram.*

⚠️ El envío de Telegram solo llega a usuarios que tienen `telegram_chat_id` configurado y `telegram_active = true` en su perfil.

### 7.2 Historial

Tabla con todas las notificaciones enviadas, destinatario y si Telegram fue exitoso.

### 7.3 Reglas automáticas (opcional)

Si tienes `pg_cron` activo, hay 4 reglas automáticas que disparan notificaciones sin que tú hagas nada:

| Regla | Frecuencia | Destinatario |
|---|---|---|
| `stale_measurement_30d` | Diaria | Usuario asignado al árbol con 30+ días sin medición |
| `health_drop_20pts` | Diaria | Admin + especialista del jardín, si la salud cae 20+ pts |
| `weather_frost_alert` | Diaria | Usuarios del campus si hay alerta de helada |
| `status_critical` | Cuando se detecte | Admin si un árbol cambia a `enfermo` o `seco` |

Para **dispararlas manualmente** desde el dashboard: botón **"Ejecutar reglas de notificación"**.

---

## 8. Dashboard

> 📷 **[screenshots/admin-13-dashboard.png]** — *Vista completa del dashboard con widget de clima, stats, charts, mapa.*

### 8.1 Widget de clima

Arriba, ves el clima actual de cada campus (si tienes `weather-sync` desplegada). Si hay alerta (helada/sequía/tormenta), aparece destacado.

### 8.2 Botones de acción

- **"Exportar PDF"** — descarga reporte ejecutivo con resumen y tabla de árboles
- **"Exportar Excel"** — descarga libro con hoja de árboles + hoja de mediciones
- **"Ejecutar reglas de notificación"** — dispara `notification-cron` manualmente

### 8.3 Estadísticas

Cards con:
- 👥 Total de usuarios
- 🌳 Total de árboles
- 💚 Salud promedio
- 🔗 Total de asignaciones

### 8.4 Charts

- **Distribución de salud** (histograma 0–20, 21–40, …, 81–100)
- **Status pie** (cuántos activos, enfermos, seco, etc.)
- **Árboles por campus** (barra)

### 8.5 Mapa de árboles

Mapa Leaflet con todos los árboles que tienen coordenadas. Cada uno con marcador color-codificado por salud (verde / amarillo / rojo). Click en un marcador → popup con info.

---

## 9. Reportes Ciudadanos

Pestaña **Reportes Ciudadanos**: lista todos los reportes enviados (vía QR escaneado o desde la ficha del árbol).

> 📷 **[screenshots/admin-14-reportes.png]** — *Tabla de reportes con columnas urgencia, estado, descripción.*

Cada reporte tiene:
- **Urgencia**: baja / normal / alta / **crítica** (rojo)
- **Estado**: open / in_progress / resolved / closed
- **Botón "Cambiar estado"**: actualiza estado y permite agregar notas de resolución

Workflow recomendado:
1. Ver reporte nuevo (estado `open`)
2. Asignar a un especialista (informalmente o vía notificación)
3. Cambiar a `in_progress`
4. Cuando se resuelva, marcar `resolved` con notas
5. `closed` para reportes ignorados o duplicados

---

## 10. Auditoría

Pestaña **Auditoría**: lista las **últimas 100 acciones** registradas (insert/update/delete) en tablas críticas.

> 📷 **[screenshots/admin-15-audit.png]** — *Tabla de auditoría con timestamp, actor email, acción, tabla.*

Tablas auditadas: `trees_catalog`, `user_profiles`, `gardens`, `tree_assignments`.

Útil para:
- Investigar quién borró un árbol
- Verificar cambios sospechosos
- Compliance institucional

> 💡 Para queries más complejas (filtrar por rango de fechas, exportar), usa el SQL Editor de Supabase con la tabla `audit_log`.

---

## 11. Tareas operativas comunes

### 11.1 Reseteo de password de un usuario

Pídele al usuario que use **"Olvidé mi contraseña"** en el login. Si Auth/SMTP no funciona, ve al dashboard de Supabase → Authentication → Users → busca el usuario → "Send password reset email" o "Update password manualmente".

### 11.2 Cambio de rol de un usuario

Pestaña Usuarios → Editar → cambia rol → Guardar.

### 11.3 Migrar un árbol a otro jardín

Pestaña Árboles → Editar → cambia "Jardín" → Guardar.

### 11.4 Reasignar un árbol a otro usuario

Pestaña Asignaciones → Quitar la asignación actual → crear nueva con destinatario distinto.

### 11.5 Forzar sincronización de clima

Si tienes `weather-sync` desplegada: Supabase → Edge Functions → weather-sync → **Run** (botón) → debería poblar `weather_records` para hoy.

### 11.6 Disparar backup manual

Supabase → Edge Functions → backup-export → **Run**. El archivo aparecerá en bucket **`backups`** con nombre `backup-YYYY-MM-DDTHH-MM-SS.json`.

### 11.7 Restaurar un backup

Esto requiere acceso técnico al SQL Editor:
1. Descarga el backup desde Storage → backups
2. Lee el JSON; cada llave es un nombre de tabla, valor es array de filas
3. Para restaurar, usa SQL `INSERT ... ON CONFLICT DO NOTHING`. Pide ayuda a un developer si no estás seguro.

---

## 12. Buenas prácticas

✔️ **Códigos consistentes** para árboles: `ARBOL-001`, `ARBOL-002` o por campus `IZT-001`, `ACT-001`.

✔️ **Asigna pronto** los árboles recién dados de alta para que se capture la ubicación.

✔️ **Imprime QRs antes** de la siembra y pégalos al momento (con la cinta lista para fotografiarse).

✔️ **Notifica con anticipación** eventos importantes (jornada de poda, evaluación general).

✔️ **Revisa reportes ciudadanos cada 2-3 días**.

✔️ **Backups**: aunque haya automáticos, descarga uno manual cada mes y guárdalo offline.

✔️ **Auditoría**: revisa periódicamente para detectar comportamiento anómalo.

✔️ **Especialistas**: dales el rol correcto y llena sus datos completos para que aparezcan bien en la sección de Información.

---

## 13. Soporte y escalación

| Problema | A quién acudir |
|---|---|
| Bug en la UI | Reportar al desarrollador / abrir issue en GitHub |
| Edge Function falla | Revisar logs en Supabase → Edge Functions |
| Caída de Supabase | Status: https://status.supabase.com |
| Datos corruptos | Restaurar desde backup |
| Compromiso de admin | Cambiar password admin + revisar audit_log |

---

## 14. Lista de pantallazos para este manual

Capturar en el orden listado abajo. Resolución sugerida: desktop 1280×800.

1. `screenshots/admin-01-menu.png`
2. `screenshots/admin-02-tabs.png`
3. `screenshots/admin-03-form-user.png` (con role=specialist mostrando campos extra)
4. `screenshots/admin-04-edit-user.png`
5. `screenshots/admin-05-form-tree.png`
6. `screenshots/admin-06-tabla-arboles.png`
7. `screenshots/admin-07-qr-modal.png`
8. `screenshots/admin-08-placa-impresa.png` (la vista de impresión)
9. `screenshots/admin-09-form-jardin.png`
10. `screenshots/admin-10-grupos.png`
11. `screenshots/admin-11-asignar-arbol.png`
12. `screenshots/admin-12-form-notif.png`
13. `screenshots/admin-13-dashboard.png`
14. `screenshots/admin-14-reportes.png`
15. `screenshots/admin-15-audit.png`
