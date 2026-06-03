# 🌳 Proyecto Árbol UNAM 475

Plataforma web para el registro, monitoreo y seguimiento del estado de salud de árboles plantados como parte de la conmemoración de los **475 años de la UNAM**, con foco operativo en **FES Iztacala** y soporte multi-campus.

> Estudiantes, profesores, especialistas y administradores colaboran para vigilar el desarrollo de cada árbol mediante seguimientos periódicos, análisis de salud asistido por IA, mediciones AR de altura, y notificaciones inteligentes vía Telegram.

---

## ✨ Funcionalidades principales

- **Inventario de árboles** por campus y jardín, con datos biométricos iniciales
- **Asignación** de árboles a usuarios o grupos para seguimiento responsable
- **Seguimiento periódico** con foto, medidas y rúbrica de salud de 10 puntos
- **Primer registro = plantación**: captura de ubicación GPS o manual con mapa interactivo
- **PUM-AI** (Google Gemini) para análisis automático de fotos y diagnóstico de plagas
- **Medición AR de altura** vía giroscopio del celular (estilo Measure de iOS)
- **Identificación QR** por árbol (placa imprimible para campo)
- **Reporte ciudadano** vía QR (cualquier persona reporta problemas)
- **Gamificación** con insignias automáticas
- **Notificaciones** por Telegram + en-app (con bot `@Pumai_treebot`)
- **Reglas automáticas**: recordatorios de seguimiento, alertas de salud, helada
- **Calendario de cuidados** por especie
- **Integración meteorológica** por campus
- **Reportes** PDF/Excel exportables
- **Modo offline** (PWA con Service Worker + cola de mediciones)
- **Auditoría** de todas las acciones administrativas
- **Roles** diferenciados: usuario, especialista, administrador

---

## 🚀 Quick start

### Para usuarios finales

Abre la app en `https://unam-fesi.github.io/arbol-unam-475/` con la cuenta que te haya dado el administrador. Ver [Manual de Usuario](docs/02-MANUAL-USUARIO.md).

### Para administradores

Pide tu cuenta admin al equipo del proyecto. Una vez dentro, ve al [Manual de Administrador](docs/03-MANUAL-ADMIN.md) para aprender a dar de alta árboles, jardines, usuarios y asignaciones.

### Para desarrolladores

1. Lee la [Arquitectura](docs/01-ARQUITECTURA.md) primero.
2. Para desplegar: [Deployment](docs/06-DEPLOYMENT.md).
3. Reportes de bugs: [Troubleshooting](docs/08-TROUBLESHOOTING.md) primero.

---

## 🔐 Roles del sistema

| Rol | Permisos |
|---|---|
| **user** (cuidador) | Ver árboles asignados, registrar seguimientos, usar PUM-AI, reportar problemas |
| **specialist** | Todo lo anterior + revisar árboles de su jardín, agregar dictamen profesional |
| **admin** | Todo lo anterior + gestionar usuarios, árboles, jardines, asignaciones, notificaciones, reportes y auditoría |

---

## 📊 Estado del proyecto

- **Versión actual**: 1.0.0 (mayo 2026)
- **Estado**: Producción
- **Mantenimiento**: Activo
- **Licencia**: Académico — UNAM FES Iztacala

---

## 👥 Autores y contacto

Proyecto académico de **FES Iztacala — UNAM** en el marco del 475 aniversario.

Para soporte técnico o reportes: contacta al administrador de la plataforma.

---

## 📚 Más documentación

- [Arquitectura técnica completa](docs/01-ARQUITECTURA.md)
- [Manual de Usuario](docs/02-MANUAL-USUARIO.md) (alumnos, cuidadores)
- [Manual de Administrador](docs/03-MANUAL-ADMIN.md)
- [Manual de Especialista](docs/04-MANUAL-ESPECIALISTA.md)
- [Referencia de API y BD](docs/05-API-REFERENCE.md)
- [Guía de despliegue](docs/06-DEPLOYMENT.md)
- [Seguridad](docs/07-SEGURIDAD.md)
- [Troubleshooting](docs/08-TROUBLESHOOTING.md)
- [Propuestas de innovación futura](PROPUESTAS-INNOVACION.md)
- [Historial de cambios](CHANGELOG.md)
