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
