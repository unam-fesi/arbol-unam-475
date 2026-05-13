# Manual de Usuario — Proyecto Árbol UNAM 475

> Este manual es para **cuidadores** (rol `user`) que tienen uno o más árboles asignados y deben darles seguimiento.

---

## 1. ¿Qué hace esta plataforma?

Te permite **registrar el progreso** del árbol que se te asignó como parte del proyecto del 475 aniversario UNAM. Cada cierto tiempo (mensual o quincenal) tomas una foto, mides el árbol, evalúas su salud, y la app guarda toda la historia.

> 📷 **[screenshot-01-pantalla-bienvenida.png]** — *Captura de la pantalla inicial al entrar a la app, mostrando el video de bienvenida o la pantalla de login.*

---

## 2. Primer acceso

### 2.1 Recibir tu cuenta

El **administrador del proyecto** te crea una cuenta y te envía:
- Tu **correo** (probablemente tu correo UNAM)
- Una **contraseña inicial** (cámbiala apenas entres)

### 2.2 Iniciar sesión

1. Abre `https://unam-fesi.github.io/arbol-unam-475/` en tu navegador (recomendado: Chrome o Safari).
2. Ingresa tu correo y contraseña.
3. Click en **Iniciar Sesión**.

> 📷 **[screenshot-02-login.png]** — *Pantalla de login con campos de correo y contraseña, botón "Iniciar sesión" y enlace "¿Olvidaste tu contraseña?".*

### 2.3 Olvidé mi contraseña

Click en **"¿Olvidaste tu contraseña?"** debajo del botón de login. Ingresa tu correo y recibirás un enlace para resetearla.

> 📷 **[screenshot-03-forgot-password.png]** — *Panel de recuperación de contraseña expandido.*

---

## 3. Instalar la app en tu celular (recomendado)

La app es **PWA** (Progressive Web App), lo que significa que puedes instalarla como si fuera una app nativa:

### Android (Chrome)
1. Abre la app en Chrome.
2. Toca el menú **⋮** (tres puntos arriba a la derecha).
3. Elige **"Agregar a pantalla de inicio"** o **"Instalar app"**.

### iPhone (Safari)
1. Abre la app en Safari.
2. Toca el botón de **compartir** (cuadro con flecha hacia arriba).
3. Selecciona **"Agregar a inicio"**.

> 📷 **[screenshot-04-install-pwa.png]** — *Diálogo de instalación PWA en Chrome móvil.*

Una vez instalada, podrás abrirla como cualquier otra app y funcionará incluso sin internet (para registrar mediciones que se sincronizarán cuando recuperes señal).

---

## 4. Tu árbol asignado

Al iniciar sesión, verás la sección **"Mi Árbol"**. Si tienes árboles asignados, aparecerán los datos del primero. Si no, verás un mensaje pidiéndote esperar a que el admin te asigne uno.

> 📷 **[screenshot-05-mi-arbol-info.png]** — *Pestaña Info del árbol mostrando código, especie, estado, salud, foto, y mapa de ubicación.*

La pantalla está organizada en 4 pestañas:

| Pestaña | Contenido |
|---|---|
| **Info** | Datos básicos, foto, mapa, especie de referencia, calendario de cuidados, insignias, botón de reporte |
| **Seguimiento** | Histórico de tus registros + gráfica temporal de salud |
| **Nuevo Registro** | Formulario para agregar un seguimiento |
| **Metas** | Objetivos sugeridos para mejorar la salud del árbol |

---

## 5. Tu PRIMER REGISTRO — la "Plantación"

> ⚠️ El primer registro es especial: aquí capturas la **ubicación exacta** donde plantaste el árbol. Esto solo lo haces UNA VEZ.

### 5.1 Pasos

1. Ve a la pestaña **Nuevo Registro** (verás el título **"Primer Registro: Plantación"**).
2. **Captura la ubicación** del árbol — tienes 3 opciones:
   - **GPS automático** (recomendado): toca **"Usar mi ubicación actual"**. Asegúrate de estar parado **al lado del árbol** cuando lo hagas.
   - **Manual**: escribe la latitud y longitud si las conoces.
   - **Mapa**: toca el mapa que aparece para colocar/mover el marcador.

> 📷 **[screenshot-06-primer-seguimiento-ubicacion.png]** — *Sección de "Ubicación de plantación" con botón GPS, campos lat/lng, descripción y mapa con marcador arrastrable.*

3. (Opcional) Agrega una **descripción del sitio** (ej: "Junto al edificio A2, cerca de la cancha de fútbol").
4. Selecciona la **fecha de plantación** (puede ser hoy si recién lo plantaste).
5. (Opcional) Sube una **foto** del árbol recién plantado.
6. (Opcional) Llena las **medidas iniciales** y **rúbricas de salud** (ver siguiente sección).
7. Toca **"Guardar Registro"**.

✅ La ubicación queda registrada en el árbol y aparecerá en el mapa de la pestaña Info.

---

## 6. Registros de seguimiento posteriores

Después del primer registro, los siguientes son más simples — sin mapa, solo datos del estado.

### 6.1 Agregar foto

1. Ve a **Nuevo Registro**.
2. Toca el campo de **foto**.
3. Toma una foto fresca del árbol (de cuerpo entero, en luz natural si es posible).
4. Una vez subida, puedes tocar **"Analizar con PUM-AI"** y la inteligencia artificial **evalúa automáticamente** los rubros visuales (vigor, copa, follaje, plagas...).

> 📷 **[screenshot-07-foto-analisis-ia.png]** — *Sección de foto con preview cargada y botón "Analizar con PUM-AI" después de procesar (mostrando que rúbricas fueron auto-rellenadas).*

### 6.2 Medidas biométricas

| Medida | Cómo |
|---|---|
| **Altura (cm)** | Con cinta métrica, o usa el ícono **📐** para medir con AR |
| **Diámetro de tronco (cm)** | A 1.30 m del suelo (DAP); con cinta o calibre |
| **Diámetro de copa (cm)** | Promedio de la proyección de la copa al suelo |

### 6.3 Medición AR de altura (con celular)

Toca el ícono **📐** junto al campo de altura. Esto abre la cámara y:

1. **Apunta a la BASE del árbol** (la parte donde toca el suelo).
2. Toca el botón **+** verde — el punto base queda fijo.
3. **Inclina el celular hacia arriba** hasta que el centro de la pantalla apunte a la **CIMA** del árbol.
4. Toca **+** otra vez. Te muestra la altura calculada.
5. Toca **"Usar"** para llenar el campo automáticamente.

> 📷 **[screenshot-08-ar-medicion.png]** — *Vista de la cámara con punto verde fijo en la base, línea verde hacia el punto superior, y label con la altura calculada.*

> 💡 **Tips para la AR**: párate a **una distancia mayor que la altura del árbol** (si crees que mide 5m, párate al menos a 5m). Mantén el celular vertical. Si no tienes giroscopio funcional, la app cambia automáticamente a modo manual (tocar base y cima en pantalla).

### 6.4 Rúbrica de salud (10 puntos)

Tienes **10 categorías** para evaluar. Cada una con un nivel del 1 al 5:

| # | Categoría | Auto IA | Peso |
|---|---|---|---|
| 1 | Vigor general | 🤖 | 12% |
| 2 | Condición de copa | 🤖 | 15% |
| 3 | Estado del tronco | 🤖 | 12% |
| 4 | Estado de ramas | 🤖 | 10% |
| 5 | Raíces y cuello | ✋ | 10% |
| 6 | Plagas y enfermedades | 🤖 | 12% |
| 7 | Condición foliar | 🤖 | 10% |
| 8 | Estabilidad estructural | 🤖 | 8% |
| 9 | Condiciones del sitio | ✋ | 6% |
| 10 | Parámetros biométricos | ✋ | 5% |

🤖 = la IA puede evaluar desde tu foto
✋ = solo tú puedes evaluarlo (mirando en persona)

Si subiste foto y usaste **Analizar con PUM-AI**, los rubros 🤖 ya estarán llenos. Tú solo completas los ✋.

> 📷 **[screenshot-09-rubrica-salud.png]** — *Lista de las 10 rúbricas con selects de 1-5 y el score calculado al fondo.*

### 6.5 Score de salud calculado

Mientras llenas la rúbrica, ves al fondo el **Salud Estimada** (0–100). Es el promedio ponderado.

### 6.6 Observaciones

Texto libre para describir lo que observaste, comparar con el registro anterior, mencionar contexto (lluvia reciente, intervenciones, etc.).

### 6.7 Guardar

Toca **"Guardar Registro de Seguimiento"**. ✅ Listo.

---

## 7. Histórico y gráfica de salud

Ve a la pestaña **Seguimiento** para ver:
- **Gráfica de evolución** de salud y altura a lo largo del tiempo
- **Timeline de registros** con fotos en miniatura

> 📷 **[screenshot-10-historico-grafica.png]** — *Pestaña Seguimiento con gráfica Chart.js mostrando línea de salud y altura, y timeline de registros abajo.*

Toca cualquier registro de la timeline para ver el detalle (foto grande, rúbricas completas, observaciones).

---

## 8. PUM-AI — chatea con la IA

PUM-AI es un asistente con IA (Google Gemini) entrenado para responder dudas sobre el cuidado de árboles, identificar plagas, sugerir tratamientos, etc.

### 8.1 Cómo usarlo

1. Ve a la sección **PUM-AI** en el menú superior.
2. Escribe tu pregunta o sube una foto + texto: *"Mi árbol tiene hojas amarillas, ¿qué tiene?"*
3. Espera la respuesta (toma 5-15 segundos).

> 📷 **[screenshot-11-pumai-chat.png]** — *Pantalla del chat con un mensaje del usuario con foto y la respuesta de PUM-AI con diagnóstico y recomendaciones.*

### 8.2 Tips

- **Foto de buena calidad**: bien iluminada, enfocada, mostrando la parte problemática.
- **Mensaje claro**: describe síntomas, tiempo de aparición, condiciones recientes.
- Si la respuesta no es satisfactoria, **insiste** o reformula.

---

## 9. Reportar un problema (cualquier persona)

Si encuentras un árbol enfermo, dañado, o con un problema (incluso si no es tuyo), puedes reportarlo:

### 9.1 Vía QR (sin login si está habilitado)

Cada árbol tiene una **placa con QR** pegada. Si escaneas el QR de **reporte** con la cámara de tu celular, te lleva directo al formulario.

### 9.2 Desde la ficha del árbol

En la pestaña **Info** del árbol, toca **"Reportar problema con este árbol"**.

### 9.3 Llena el form

- **Título** (ej: "Rama caída", "Plaga visible")
- **Urgencia**: baja / normal / alta / crítica
- **Descripción** (qué viste, dónde, cuándo)

> 📷 **[screenshot-12-reporte-ciudadano.png]** — *Modal de reporte ciudadano con campos llenos y botón "Enviar reporte".*

✅ Un especialista o admin lo revisará y le dará seguimiento. Tú ganas la insignia **"Vigilante"** por reportar.

---

## 10. Insignias (gamificación)

Conforme uses la app, ganas **insignias** automáticamente:

| Insignia | Cómo se gana |
|---|---|
| 🌱 Primer Registro | Tu primer seguimiento |
| 📊 Constante | 10 seguimientos registrados |
| 🏆 Veterano | 50 seguimientos |
| 💚 Salvador | Recuperaste un árbol enfermo (>40 pts de mejora) |
| 📸 Fotógrafo | 10 fotos subidas |
| 🌳 Reforestador | Diste de alta una plantación |
| 🚨 Vigilante | Primer reporte ciudadano enviado |
| ⭐ Cuidador Estelar | Salud >85% por 3 mediciones consecutivas |

> 📷 **[screenshot-13-insignias.png]** — *Sección de insignias mostrando las que el usuario ha ganado con sus iconos y nombres.*

---

## 11. Tu perfil

Toca tu **avatar arriba a la derecha** → **Mi Perfil** para editar:
- Nombre
- Número de cuenta
- Fecha de nacimiento
- Estatus académico
- Campus
- (Opcional) Tu **chat_id de Telegram** para recibir notificaciones por ahí

> 📷 **[screenshot-14-perfil.png]** — *Modal de perfil con campos editables.*

### 11.1 Cómo conseguir tu chat_id de Telegram

1. Abre Telegram en tu celular.
2. Busca **@userinfobot** y mándale `/start`.
3. Te responderá con tu **ID** (es un número como `123456789`).
4. Copia ese número y pégalo en el campo **Telegram Chat ID** de tu perfil.
5. Abre el bot del proyecto: **t.me/Pumai_treebot** y mándale `/start` (esto autoriza al bot a mandarte mensajes).

A partir de ese momento recibirás notificaciones automáticas por Telegram (recordatorios de seguimiento, alertas de helada, etc.).

---

## 12. Modo offline

Si no tienes conexión cuando intentas guardar un registro:
- La app te avisa **"Sin conexión: medición encolada"**.
- El registro se guarda localmente.
- Apenas tu celular vuelva a tener señal, **se sincroniza automáticamente**.

> ⚠️ Importante: las **fotos pesadas** pueden no encolarse si excedes el límite de almacenamiento del navegador. En zonas sin señal, prioriza datos numéricos y observaciones.

---

## 13. Notificaciones que recibirás

| Notificación | Cuándo |
|---|---|
| **Recordatorio de seguimiento** | Si tu árbol no tiene medición en 30 días |
| **Alerta de salud** | Si la salud del árbol cae 20+ puntos vs. último registro |
| **Alerta de helada** | Si se pronostica temperatura mínima ≤2°C en tu campus |
| **Mensajes del admin** | Avisos generales sobre el proyecto |
| **Logros** | Cuando ganas una nueva insignia |

Las recibes:
- **In-app** (campana arriba a la derecha)
- **Telegram** (si configuraste tu chat_id)

> 📷 **[screenshot-15-notificaciones.png]** — *Bandeja de notificaciones in-app o ejemplo de notificación en Telegram.*

---

## 14. Consejos generales

✔️ **Sé constante**: un seguimiento mensual es ideal. Quincenal en época crítica (sequía / lluvias).

✔️ **Foto desde el mismo ángulo cada vez**: para ver evolución comparable.

✔️ **No riegues en exceso**: muchos árboles mueren ahogados, no de sed.

✔️ **Respeta la hojarasca**: alimenta el suelo. No la barras alrededor del tronco.

✔️ **Si dudas, consulta a PUM-AI o reporta al especialista** del jardín — ellos son quienes saben más.

✔️ **Cuida la placa QR**: si se cae o daña, avísale al admin para que imprima una nueva.

---

## 15. Soporte

- **Dudas técnicas o bugs**: contacta al admin del proyecto (su correo está en la sección Información de la app).
- **Dudas botánicas**: usa PUM-AI o consulta a un especialista.
- **Mi cuenta no funciona**: usa "Olvidé mi contraseña". Si sigue sin funcionar, contacta al admin.

---

## 16. Lista de pantallazos a capturar (para quien arme este manual)

1. `screenshots/01-pantalla-bienvenida.png`
2. `screenshots/02-login.png`
3. `screenshots/03-forgot-password.png`
4. `screenshots/04-install-pwa.png`
5. `screenshots/05-mi-arbol-info.png`
6. `screenshots/06-primer-seguimiento-ubicacion.png`
7. `screenshots/07-foto-analisis-ia.png`
8. `screenshots/08-ar-medicion.png`
9. `screenshots/09-rubrica-salud.png`
10. `screenshots/10-historico-grafica.png`
11. `screenshots/11-pumai-chat.png`
12. `screenshots/12-reporte-ciudadano.png`
13. `screenshots/13-insignias.png`
14. `screenshots/14-perfil.png`
15. `screenshots/15-notificaciones.png`

Recomendación: capturar tanto en **desktop** (1280×800) como en **móvil** (375×812) para mostrar adaptabilidad. Para pantallazos del flujo AR (medición de altura), usar móvil real con árbol al fondo — los simuladores no devuelven datos reales de giroscopio.

Guarda los archivos PNG en `/Users/samuelf/Work/UNAM/arbol/docs/screenshots/` (carpeta a crear si no existe).

---

## 17. Glosario rápido

| Término | Significado |
|---------|-------------|
| **Tutor** | Usuario adoptante de un árbol — eres tú al registrarte. |
| **Seguimiento** | Cada visita registrada (foto + métricas + notas + ubicación). |
| **Rúbrica de salud** | Cuestionario corto de 6–8 preguntas que devuelve un puntaje 0–100. |
| **PUM-AI** | Asistente de inteligencia artificial integrado en la app, especializado en árboles del Valle de México. |
| **DAP** | Diámetro a la altura del pecho — diámetro del tronco medido a 1.30 m del suelo. |
| **AR Height** | Medición de altura por realidad aumentada usando el giroscopio del celular. |
| **QR ciudadano** | Código QR pegado al árbol que cualquier transeúnte puede escanear para reportar problemas. |
| **Insignia** | Logro visual que se gana cumpliendo metas (primer seguimiento, 5 seguimientos, foto destacada, etc.). |
| **Especialista** | Usuario con permisos de revisor — biólogo o equivalente que valida y comenta tus seguimientos. |
| **Admin** | Coordinador del proyecto — gestiona usuarios, árboles, reportes y campañas. |

---

## 18. Preguntas frecuentes (FAQ)

**¿Necesito Internet siempre que use la app?**
No para registrar — la app guarda los seguimientos localmente (IndexedDB) y los sincroniza cuando regresa la red. Sí necesitas Internet para descargar la app la primera vez, recibir notificaciones y ver el dashboard del admin.

**¿Funciona en mi celular viejo?**
Funciona en cualquier móvil con navegador moderno (Safari iOS 13+, Chrome Android 90+). El AR de altura requiere giroscopio (la mayoría de celulares lo traen) y permisos de cámara.

**¿Pierdo mis datos si desinstalo la app?**
Los seguimientos sincronizados quedan a salvo en la nube (Supabase). Los pendientes de subir (sin red) sí se pierden si los borras antes de sincronizar — por eso intenta abrir la app conectado al menos una vez después de cada salida.

**¿Puedo cuidar más de un árbol?**
Sí — el admin puede asignarte tantos árboles como quieras. Cada uno aparece como una tarjeta separada en tu Home.

**¿Y si ya no puedo seguir cuidándolo?**
Avisa al admin para que reasigne el árbol a otro tutor. La continuidad del cuidado es lo que mantiene los datos útiles.

**¿La app rastrea mi ubicación todo el tiempo?**
No. Solo pide tu ubicación cuando registras un seguimiento, para verificar que estuviste físicamente con el árbol. No hay tracking en background.

**¿Mis fotos son privadas?**
Las fotos forman parte del seguimiento del árbol. Son visibles para ti, el especialista del jardín y el admin del proyecto. No se comparten públicamente sin tu autorización explícita.

**Encontré un bug — ¿dónde reporto?**
Pásalo al admin con un pantallazo y descripción de qué intentabas hacer. Mientras más detalle, más rápido se arregla.

---

## 19. Checklist de primer uso (resumen exprés)

Si estás registrando tu primer seguimiento, esta es la ruta más rápida:

```
1. Abrir la app → Login (o crear cuenta si es primera vez)
2. Ir a "Mis Árboles" → tocar tu árbol
3. Botón verde "Nuevo seguimiento"
4. Permitir cámara y ubicación cuando lo pida
5. Tomar foto del árbol completo
6. (Opcional) Tocar "Medir altura" → AR
7. Llenar rúbrica de salud (6 preguntas)
8. Anotar observaciones libres
9. Guardar
10. ¡Listo! Tu insignia aparecerá en tu perfil.
```

**Tiempo total estimado:** 5 a 8 minutos por árbol.

---

## Apéndice: contacto

- **Coordinación general (admin):** ver pestaña "Información" dentro de la app.
- **Soporte técnico:** mismo correo que admin.
- **Repositorio público:** [github.com/unam-fesi/arbol-unam-475](https://github.com/unam-fesi/arbol-unam-475)
- **Documentación complementaria:**
  - [03-MANUAL-ADMIN.md](03-MANUAL-ADMIN.md) — para coordinadores
  - [04-MANUAL-ESPECIALISTA.md](04-MANUAL-ESPECIALISTA.md) — para revisores botánicos
  - [01-ARQUITECTURA.md](01-ARQUITECTURA.md) — visión técnica del sistema

---

*Manual del usuario — Proyecto Árbol UNAM 475 · v1.0 · Mayo 2026*
*Cualquier mejora sugerida a este documento es bienvenida — abre un issue en el repo.*
