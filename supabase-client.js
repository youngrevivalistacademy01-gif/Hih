// supabase-client.js
// Single Supabase connection, shared across the entire app.
// Load this script BEFORE login.js / admin-login.js / any dashboard scripts.

const SUPABASE_URL = 'https://jzqislpwulzsyztnhsqn.supabase.co';      
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cWlzbHB3dWx6c3l6dG5oc3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxODEwMDEsImV4cCI6MjEwMDc1NzAwMX0.GFnSq_1GsHSWrpU6PUWy2dxgVMbdZgpLYnW5HrYVTp8 ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
