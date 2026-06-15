// ============================================================================
// CONFIG - Configuración central del proyecto
// ============================================================================
// La Supabase anon key ES pública por diseño - la seguridad la dan las RLS policies
const SUPABASE_URL = 'https://hambscfdiaymowskislw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWJzY2ZkaWF5bW93c2tpc2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDY1ODEsImV4cCI6MjA4OTA4MjU4MX0.5teS1HJdlZUmIJonrNXsBXKYIk3wexI9FQJ553pplTg';

// PUM-AI via Edge Function (Gemini API key vive en el servidor, NO en el frontend)
const PUMAI_FUNCTION_URL = SUPABASE_URL + '/functions/v1/pum-ai';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let currentUserProfile = null;

// ============================================================================
// HELPERS GLOBALES DE SEGURIDAD
// ----------------------------------------------------------------------------
// Se definen ANTES que cualquier otro JS (config.js está al inicio del bundle
// en index.html) para que estén disponibles cuando admin.js / dashboard-vis.js
// / auth.js / mi-arbol.js los usen via window.escapeHtml o window.safeJsAttr.
//
// Antes de esto, varios archivos hacían `const esc = window.escapeHtml || (s=>s)`
// y caían al fallback identidad — efectivamente NO escapaban nada. Y safeJsAttr
// se referenciaba en 13+ lugares sin estar definida, lo que tiraba ReferenceError.
// ============================================================================
window.escapeHtml = function (s) {
  // Escapa &, <, >, ", ' para inyección segura en innerHTML.
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
window.safeJsAttr = function (s) {
  // Para usar dentro de un atributo HTML que invoca JS, ej:
  //   onclick="doStuff('${safeJsAttr(value)}')"
  // Doble escape necesario: 1) escapar comillas del string JS (`\\'`) y
  // backslashes/saltos de línea; 2) escapar los caracteres HTML que romperían
  // el atributo (`"`, `<`, `>`).
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
};
