import { createClient } from '@supabase/supabase-js'

const url = 'https://axuvwfkhauoizforekxi.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg'

const supabase = createClient(url, key)

const { data, error } = await supabase.from('pregoes').select('id, numero_pregao, data_vencimento').limit(3)

if (error) {
  console.error('❌ Erro Supabase:', error.message, error.code)
} else {
  console.log('✅ Conexão OK! Pregões encontrados:')
  data.forEach(p => console.log(' -', p.numero_pregao, p.data_vencimento))
}
