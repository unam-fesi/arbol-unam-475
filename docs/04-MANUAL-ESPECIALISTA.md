# Manual de Especialista — Proyecto Árbol UNAM 475

> Para usuarios con rol `specialist`. Si tu rol es `user` o `admin`, las funciones aquí descritas pueden estar limitadas o ser distintas.

---

## 1. Tu rol en el proyecto

Como **especialista** (biólogo, agrónomo, arboricultor, etc.) tu trabajo en la plataforma es:

- **Dictaminar** profesionalmente el estado de árboles en seguimiento
- Atender **reportes ciudadanos** asignados a tu jardín o experiencia
- Revisar árboles con **caídas de salud** o **status crítico**
- (Opcional) Apoyar a usuarios cuidadores con consultoría vía PUM-AI o directo

Recibes **alertas automáticas** cuando hay árboles que requieren tu atención.

---

## 2. Acceso

Misma URL que cualquier usuario: `https://unam-fesi.github.io/arbol-unam-475/`

Una vez dentro, en el menú superior verás un botón adicional: **Especialista**.

> 📷 **[screenshots/spec-01-menu.png]** — *Menú superior con la opción "Especialista" visible (que no aparece para usuarios regulares).*

---

## 3. Tu perfil de especialista

Al ingresar por primera vez, asegúrate de que tu perfil tenga:

| Campo | Importancia |
|---|---|
| Nombre completo | Para que los usuarios sepan a quién contactar |
| Especialidad | Aparece en la sección "Información" — Especialistas |
| Departamento / Unidad | "Biología, FES Iztacala", "CONAFOR", etc. |
| Contacto adicional | Tel/email/oficina/horario de atención |
| Telegram chat_id | Para recibir alertas de árboles críticos |

> 📷 **[screenshots/spec-02-perfil.png]** — *Modal de perfil con los campos de especialista llenos.*

Si te falta algún dato, contacta al admin para que actualice tu perfil.

---

## 4. Vista de Especialista

Click en **Especialista** en el menú. Verás dos paneles:

> 📷 **[screenshots/spec-03-vista-especialista.png]** — *Vista completa con panel izquierdo de árboles ordenados por salud y panel derecho de seguimiento.*

### 4.1 Panel izquierdo: Árboles para revisión

Lista los árboles ordenados por **salud ascendente** (los más críticos primero, hasta 20).

Cada item muestra:
- Nombre común y especie
- Código del árbol y campus
- Score de salud (con color: verde / ámbar / rojo)

Click en un árbol para abrir su seguimiento en el panel derecho.

### 4.2 Panel derecho: Registro de Seguimiento

Aquí registras tu **dictamen profesional** (independiente al seguimiento del cuidador):

- **Tipo de seguimiento**: inspection / treatment / resolution / observation / emergency
- **Score de salud profesional** (0–100)
- **Notas del dictamen** (recomendaciones, tratamientos, alertas)

> 📷 **[screenshots/spec-04-form-followup.png]** — *Form de seguimiento de especialista con tipo, score y notas.*

Al guardar, se inserta en `specialist_followups` (separado de `tree_measurements` que es del cuidador). El dueño del árbol verá tu dictamen como complemento al suyo.

---

## 5. Notificaciones que recibirás

Como especialista (y si tienes Telegram configurado), te llegan:

| Notificación | Cuándo |
|---|---|
| **Alerta de salud crítica** | Si un árbol bajo tu jardín cae 20+ pts entre dos mediciones |
| **Atención requerida** | Cuando un árbol del jardín cambia a `enfermo` o `seco` |
| **Reporte ciudadano nuevo** | Si se reporta un problema en un árbol de tu jardín (depende de cómo el admin configure routing) |
| **Mensajes del admin** | Para coordinar jornadas, consultas, eventos |

> 📷 **[screenshots/spec-05-notificacion.png]** — *Ejemplo de notificación de alerta recibida en Telegram.*

---

## 6. Cómo ayudar a los cuidadores

### 6.1 Vía PUM-AI

Los cuidadores pueden hacerte llegar consultas usando PUM-AI. Si la respuesta de la IA no fue suficiente, te pueden contactar directamente con tus datos del perfil.

### 6.2 Visita en campo

Si un árbol requiere atención presencial, coordina con el admin para acceso al campus y visita.

### 6.3 Tu dictamen

Después de cualquier intervención, registra el seguimiento (`specialist_followup`) para dejar historial trazable de qué se hizo y qué resultado dio.

---

## 7. Reportes ciudadanos

Los reportes hechos vía QR caen en una tabla que ve el admin. Si te asignan uno (informalmente o por correo), tu workflow:

1. Visita el árbol o pide foto al reportante
2. Diagnóstica y registra `specialist_followup` con tipo `inspection`
3. Si requiere tratamiento, regresa después y registra `treatment`
4. Cuando esté resuelto, registra `resolution` con notas finales

> 📷 **[screenshots/spec-06-flujo-reporte.png]** — *Diagrama o screenshot del flujo de atención de un reporte.*

---

## 8. Calendario de cuidados por especie

Como especialista, eres la persona ideal para **mantener actualizada** la tabla `species_care` (calendario de cuidados anuales por especie).

Los datos viven en BD y se muestran a los cuidadores en la sección Mi Árbol → Info. Si quieres agregar/editar entradas, **pide al admin** acceso o que lo modifique por ti vía SQL Editor:

```sql
INSERT INTO species_care(species, common_name, month, task_type, task_intensity, description)
VALUES ('Liquidambar styraciflua', 'Liquidámbar', 3, 'fertilizacion', 'media',
        'Aplicar fertilizante con micros antes del brote de primavera')
ON CONFLICT(species, month, task_type) DO UPDATE SET description = EXCLUDED.description;
```

Esto enriquece la app para todos los usuarios.

---

## 9. Buenas prácticas

✔️ **Sé objetivo en tus dictámenes** — usa la rúbrica de salud (mismo criterio 1-5 que los cuidadores).

✔️ **Documenta tratamientos químicos**: producto, dosis, fecha — son datos clave para auditoría ambiental.

✔️ **Foto antes y después** de intervenciones grandes.

✔️ **Notifica al cuidador** cuando hagas algo en su árbol (que el admin sirva de puente si no tienes su contacto).

✔️ **Comparte aprendizajes** — si encuentras una plaga nueva o tratamiento exitoso, escríbelo en notas para que quede en la BD.

---

## 10. Lista de pantallazos para este manual

1. `screenshots/spec-01-menu.png`
2. `screenshots/spec-02-perfil.png`
3. `screenshots/spec-03-vista-especialista.png`
4. `screenshots/spec-04-form-followup.png`
5. `screenshots/spec-05-notificacion.png`
6. `screenshots/spec-06-flujo-reporte.png`
