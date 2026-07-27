// supabase-client.js
// Single Supabase connection, shared across the entire app.
// Load this script BEFORE login.js / admin-login.js / any dashboard scripts.

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';      
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
