# Propuestas de innovación — Proyecto Árbol UNAM 475

Roadmap sugerido de mejoras, ordenado por impacto vs. esfuerzo. Marcadas con (✅ ya base) las que ya tienen cimientos en la arquitectura actual.

## Prioridad alta — bajo esfuerzo, alto impacto

### 1. QR físico por árbol (campo + escaneo)
Cada árbol genera un QR descargable desde el panel admin que contiene `https://app/?t=<tree_code>`. Pegado al árbol en una placa de aluminio. Al escanear, abre el detalle del árbol directamente. Beneficio: cualquier persona del campus puede reportar problemas sin tener que buscar el código manualmente. Implementación: lib `qrcode.js`, generar PNG del QR descargable desde admin → "Imprimir placa".

### 2. Identificación de especie por foto (Gemini)
Reutiliza la Edge Function `pum-ai`: agrega un endpoint `identify-species` que reciba una foto y devuelva la especie probable + nivel de confianza. Útil al dar de alta un árbol nuevo: el admin sube foto y se autocompletan species/common_name/tree_type. Mejora la precisión y reduce typos.

### 3. Detección de plagas específicas vía IA
Extender el chat PUM-AI con un modo "detector de plagas": foto + comparación con catálogo de plagas conocidas en árboles del Valle de México (cochinilla, barrenador, muérdago, roya, araña roja). Devuelve diagnóstico estructurado: `{plaga: 'cochinilla', confianza: 0.82, severidad: 'media', tratamiento: '...'}`. Ya tienes Gemini conectado; solo es cambiar el prompt del system message.

### 4. Triggers de notificación automáticos
Triggers en BD que emitan eventos cuando:
- `health_score` cae más de 20 puntos vs. medición anterior → alerta al especialista responsable del jardín.
- Árbol pasa 30 días sin medición → recordatorio al usuario asignado.
- Árbol cambia status a `enfermo` o `seco` → notifica admin + especialista.
- Reporte nuevo en `problem_reports` con `urgency='critical'` → broadcast Telegram a admins.

Requiere: tabla `notification_triggers` (configurable por admin) + trigger Postgres que llame `send-telegram-notification` Edge Function vía `pg_net` o `http` extension. (✅ ya base — la función Telegram está)

### 5. Geocercas por jardín
Ya agregamos `bounds_polygon` (jsonb) a gardens. Cuando un usuario asigna ubicación a un árbol, validar que está dentro del jardín al que pertenece (PostGIS o cálculo simple ray-casting en JS). Si no, mostrar advertencia. También ayuda al admin a verificar visualmente en el dashboard.

### 6. Histórico de salud con gráfica temporal
Por árbol, mostrar gráfica temporal de health_score por mes (Chart.js, tipo `line`). Detecta tendencias (mejora/deterioro) y permite predecir intervenciones. Las mediciones ya tienen `measurement_date`.

## Prioridad media — esfuerzo medio

### 7. Modo offline con sincronización
Service Worker + IndexedDB para que el usuario pueda registrar mediciones sin conexión (común en zonas remotas del campus). Al reconectar, se sincroniza. Particularmente útil para fotos de árboles en zonas con cobertura pobre.

### 8. Reportes exportables (PDF/Excel)
Botón "Exportar" en dashboard admin que genera:
- PDF con plantilla institucional UNAM, fotos, gráficas, resumen ejecutivo.
- Excel con tablón completo de árboles, mediciones, asignaciones.

Usar el skill `xlsx` de Cowork para Excel y un servidor de PDF (Edge Function con Puppeteer o jsPDF en cliente).

### 9. Gamificación / Reconocimientos
- Badges por logros: "Primer registro", "10 seguimientos", "Salvador de árbol" (recuperación de salud >40 pts), "Reforestador" (5 árboles plantados).
- Leaderboard mensual por usuario o grupo (escuela/laboratorio).
- Reconocimiento institucional con sello FES.

### 10. Integración meteorológica
Edge Function diaria que consulta API de clima (openweathermap o similar) por campus y registra:
- Temperatura mín/máx
- Lluvia acumulada
- Alertas de helada / sequía

Permite correlacionar deterioro de árboles con eventos climáticos. Disparador automático de notificaciones: "Helada esperada esta noche, revisar árboles jóvenes".

### 11. Calendario de cuidados por especie
Cada especie tiene calendario sugerido de actividades (poda, fertilización, riego intensificado por estación). El sistema genera tareas automáticas en el dashboard del usuario asignado, con recordatorios push/Telegram.

### 12. Reporte ciudadano (problem_reports)
La tabla ya existe. Habilitar formulario público (sin login, o con login mínimo) para que cualquier estudiante reporte problemas vía QR del árbol. Foto + descripción + nivel de urgencia. Se asigna automáticamente al especialista del jardín.

## Prioridad larga — alto esfuerzo, alto valor

### 13. Mapa colaborativo con capas
Mapa principal del campus mostrando todos los árboles, con filtros:
- Por especie / tipo / estado de salud
- Por usuario asignado / grupo
- Heatmap de salud (rojo = árboles en riesgo)
- Capa de jardines con polígono y datos
- Tracking de mediciones recientes

Podría exportarse como capa GeoJSON para uso de áreas verdes UNAM.

### 14. Aplicación móvil PWA con AR mejorada
Convertir a Progressive Web App (manifest + service worker + iconos) para que usuarios puedan "instalar" en móvil. La medición AR podría mejorarse con WebXR para anclaje en world-space real (ARKit/ARCore via WebXR Polyfill cuando disponible) — supera la limitación actual del giroscopio.

### 15. Modelo predictivo de salud
ML supervisado entrenado con histórico de mediciones que predice probabilidad de deterioro a 30/60/90 días, basándose en historial de `health_score`, especie, edad, ubicación, eventos climáticos. Permite intervenciones preventivas. Inicialmente puede ser un modelo simple (regresión logística) en una Edge Function con Python.

### 16. Integración con redes académicas
- API pública (con auth) para que otras instituciones (CONAFOR, otras universidades) consulten datos agregados.
- Compartición de aprendizajes: "qué especies sobreviven mejor en X campus", "qué tratamientos funcionan para Y plaga".
- Publicación periódica como dataset abierto (CSV en Zenodo o similar) para investigación.

### 17. Sponsorship / adopción
Empresas o ex-alumnos pueden "adoptar" árboles con donativo. A cambio reciben:
- Reportes mensuales del árbol adoptado
- Foto del árbol con placa con su nombre
- Actualización vía Telegram con su crecimiento

Genera financiamiento para el programa.

## Mejoras de seguridad y operación

### 18. Auditoría de acciones admin
Tabla `audit_log` que registra cada acción admin (quién creó/borró qué, cuándo, IP). Útil para compliance institucional y trazabilidad si hay dispute sobre cambios.

### 19. Roles más granulares
Hoy: `user`, `specialist`, `admin`. Considerar:
- `coordinator` (puede gestionar grupos pero no toda la admin)
- `read_only` (solo lectura para dirección/visitantes)
- `volunteer` (similar a user pero limitado a 1 árbol)

### 20. Verificación de email + reset password
La Edge Function `create-user` actualmente crea usuarios sin enviar email de bienvenida. Agregar:
- Email de bienvenida con instrucciones
- Flujo de "olvidé mi contraseña"
- 2FA opcional para admin/specialist

### 21. Backup automatizado
Cron job que exporta tablas críticas a S3/cualquier object storage con retención de 30 días. Recovery sencillo.

---

## Recomendación de implementación inmediata (post correcciones actuales)

Si tuviera que priorizar 3 para los próximos 2-3 sprints:

1. **QR + reporte ciudadano** (#1 y #12) — democratiza el sistema, multiplicador de datos.
2. **Triggers automáticos de notificación** (#4) — convierte el sistema de pasivo a proactivo.
3. **Identificación de especie por foto** (#2) — UX excelente y reutiliza infraestructura ya pagada (Gemini).

Las tres se apoyan mutuamente y reutilizan piezas que ya existen.
