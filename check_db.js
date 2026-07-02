import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://axuvwfkhauoizforekxi.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase.from('pregoes').select('*');
  console.log('Error:', error);
  console.log('Pregoes:', data);
}

check();
