// ============================================================================
// CONFIG - Supabase + Gemini API + Global State
// ============================================================================

const SUPABASE_URL = 'https://hambscfdiaymowskislw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWJzY2ZkaWF5bW93c2tpc2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDY1ODEsImV4cCI6MjA4OTA4MjU4MX0.5teS1HJdlZUmIJonrNXsBXKYIk3wexI9FQJ553pplTg';
const GEMINI_API_KEY = 'AIzaSyAXBXjd95CpgqhR2l15R39WRRVoKAk28tk';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

// Initialize Supabase client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global state
let currentUser = null;
let currentUserProfile = null;
