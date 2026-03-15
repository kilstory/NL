// Supabase configuration
const SUPABASE_URL = 'https://siquixdnkxrcovbppubv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcXVpeGRua3hyY292YnBwdWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjIzMjQsImV4cCI6MjA4OTA5ODMyNH0.4tS-OuzicJIVtGkedhsZlbI0GWf9tq57EO0Cpp5okRM';

// Initialize the Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabaseClient as supabase };
