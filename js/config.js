// ============================================================================
// CONFIG - Supabase Configuration
// ============================================================================

const SUPABASE_URL = 'https://hambscfdiaymowskislw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWJzY2ZkaWF5bW93c2tpc2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDY1ODEsImV4cCI6MjA4OTA4MjU4MX0.5teS1HJdlZUmIJonrNXsBXKYIk3wexI9FQJ553pplTg';
const PUMAI_FN_URL = SUPABASE_URL + '/functions/v1/pum-ai-analyze';
const ADMIN_USERS_URL = SUPABASE_URL + '/functions/v1/admin-users';
const TELEGRAM_URL = SUPABASE_URL + '/functions/v1/send-telegram-notification';

// Initialize Supabase client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global state
let currentUser = null;
let currentUserProfile = null;
