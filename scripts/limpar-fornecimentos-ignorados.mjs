import { createClient } from '@supabase/supabase-js'

const url = 'https://axuvwfkhauoizforekxi.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg'

const supabase = createClient(url, key)

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const PALAVRAS_CHAVE_SOLICITANTE_IGNORADO = ['descart', 'audit', 'sucat', 'descaract'];
const SOLICITANTES_ESPECIFICOS_IGNORADOS = [
  'BMS - Cia Sup Trnsp Av (Estoque)',
  'BMS - Recebimento Técnico',
  'BMS - Triagem',
  'BMS - Modernizacao',
  'AIRBUS - TROCA STANDARD',
  'B Av T - RANCHO',
];

function isIgnorado(sol) {
  if (!sol) return false;
  let raw = String(sol).trim();
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).trim();
  const n = normalize(raw);
  for (const kw of PALAVRAS_CHAVE_SOLICITANTE_IGNORADO) {
    if (n.includes(normalize(kw))) return true;
  }
  for (const esp of SOLICITANTES_ESPECIFICOS_IGNORADOS) {
    if (n === normalize(esp)) return true;
  }
  return false;
}

async function main() {
  console.log('🔍 Buscando solicitantes existentes na tabela fornecimentos...')

  // Buscar todos os solicitantes distintos
  const { data, error } = await supabase
    .from('fornecimentos')
    .select('solicitante')

  if (error) {
    console.error('❌ Erro ao buscar fornecimentos:', error.message)
    return
  }

  const solicitantesIgnorados = new Set()
  for (const row of data || []) {
    if (isIgnorado(row.solicitante)) {
      solicitantesIgnorados.add(row.solicitante)
    }
  }

  console.log(`\n📋 Solicitantes ignorados encontrados no banco (${solicitantesIgnorados.size}):`)
  for (const s of solicitantesIgnorados) {
    console.log(` - "${s}"`)
  }

  if (solicitantesIgnorados.size === 0) {
    console.log('✅ Nenhum registro de solicitante ignorado encontrado no banco.')
    return
  }

  let totalExcluidos = 0
  for (const sol of solicitantesIgnorados) {
    const { data: delData, count, error: delErr } = await supabase
      .from('fornecimentos')
      .delete({ count: 'exact' })
      .eq('solicitante', sol)

    if (delErr) {
      console.error(`❌ Erro ao excluir "${sol}":`, delErr.message)
    } else {
      console.log(`🗑️ Excluídos ${count ?? 0} registros de "${sol}"`)
      totalExcluidos += (count ?? 0)
    }
  }

  console.log(`\n✅ Limpeza concluída com sucesso! Total de registros expurgados: ${totalExcluidos}`)

  const { count: finalCount } = await supabase
    .from('fornecimentos')
    .select('*', { count: 'exact', head: true })

  console.log(`📊 Novo total de registros em fornecimentos: ${finalCount}`)
}

main()
