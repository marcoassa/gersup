/**
 * correlacionar-pregao-90025-2025.mjs
 *
 * Correlaciona os itens do pregão 90025/2025 (Higiene e Limpeza)
 * com seus respectivos cd_comp_master na tabela itens_pregao.
 *
 * Uso: node scripts/correlacionar-pregao-90025-2025.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ── Configuração Supabase ─────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://axuvwfkhauoizforekxi.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg';
const NUMERO_PREGAO = '90025/2025';

// ── Tabela de correlação Item → cd_comp_master ────────────────────────────────
const CORRELACAO = [
  { item:  1, cd_comp_master: '88967' },
  { item:  2, cd_comp_master: '88698' },
  { item:  3, cd_comp_master: '25898' },
  { item:  4, cd_comp_master: '88969' },
  { item:  5, cd_comp_master: '88970' },
  { item:  6, cd_comp_master: '85724' },
  { item:  7, cd_comp_master: '89170' },
  { item:  8, cd_comp_master: '14844' },
  { item:  9, cd_comp_master: '88964' },
  { item: 10, cd_comp_master: '89014' },
  { item: 11, cd_comp_master: '89020' },
  { item: 12, cd_comp_master: '36807' },
  { item: 13, cd_comp_master: '23058' },
  { item: 15, cd_comp_master: '88963' },
  { item: 16, cd_comp_master: '24754' },
  { item: 20, cd_comp_master: '88698' },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\n🔍 Buscando pregão: ${NUMERO_PREGAO}`);

  // 1. Buscar o pregão pelo número
  const { data: pregao, error: errPregao } = await supabase
    .from('pregoes')
    .select('id, numero_pregao, objeto')
    .eq('numero_pregao', NUMERO_PREGAO)
    .maybeSingle();

  if (errPregao) {
    console.error('❌ Erro ao buscar pregão:', errPregao.message);
    process.exit(1);
  }

  if (!pregao) {
    console.error(`❌ Pregão "${NUMERO_PREGAO}" não encontrado no banco.`);
    console.error('   Verifique se o pregão foi importado via PNCP antes de correlacionar.');
    process.exit(1);
  }

  console.log(`✅ Pregão encontrado: ${pregao.numero_pregao} — ${pregao.objeto}`);
  console.log(`   ID: ${pregao.id}\n`);

  // 2. Buscar todos os itens desse pregão para validação
  const { data: itensDB, error: errItens } = await supabase
    .from('itens_pregao')
    .select('id, numero_item, descricao, cd_comp_master')
    .eq('pregao_id', pregao.id)
    .order('numero_item');

  if (errItens) {
    console.error('❌ Erro ao buscar itens:', errItens.message);
    process.exit(1);
  }

  console.log(`📋 ${itensDB.length} item(ns) encontrado(s) no banco para este pregão.`);

  // Mapa numero_item → registro do banco
  const itemMap = new Map(itensDB.map(i => [i.numero_item, i]));

  // 3. Aplicar as correlações
  const resultados = { ok: [], naoEncontrado: [], semAlteracao: [] };

  for (const { item, cd_comp_master } of CORRELACAO) {
    const registro = itemMap.get(item);

    if (!registro) {
      resultados.naoEncontrado.push({ item, cd_comp_master });
      console.warn(`⚠️  Item ${item.toString().padStart(3)} — não encontrado no banco`);
      continue;
    }

    if (registro.cd_comp_master === cd_comp_master) {
      resultados.semAlteracao.push({ item, cd_comp_master });
      console.log(`⏭️  Item ${item.toString().padStart(3)} — já está com cd_comp_master=${cd_comp_master} (sem alteração)`);
      continue;
    }

    const { error: errUpdate } = await supabase
      .from('itens_pregao')
      .update({ cd_comp_master })
      .eq('id', registro.id);

    if (errUpdate) {
      console.error(`❌ Item ${item.toString().padStart(3)} — erro ao atualizar:`, errUpdate.message);
    } else {
      resultados.ok.push({ item, cd_comp_master, descricao: registro.descricao });
      const anterior = registro.cd_comp_master ?? '(vazio)';
      console.log(`✅ Item ${item.toString().padStart(3)} — ${anterior} → ${cd_comp_master}  |  ${registro.descricao?.substring(0, 60)}`);
    }
  }

  // 4. Resumo final
  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`📊 RESUMO — Pregão ${NUMERO_PREGAO} (Higiene e Limpeza)`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   ✅ Atualizados com sucesso : ${resultados.ok.length}`);
  console.log(`   ⏭️  Já estavam corretos     : ${resultados.semAlteracao.length}`);
  console.log(`   ⚠️  Não encontrados no banco: ${resultados.naoEncontrado.length}`);

  if (resultados.naoEncontrado.length > 0) {
    console.log('\n   Itens não encontrados:');
    resultados.naoEncontrado.forEach(({ item, cd_comp_master }) =>
      console.log(`     Item ${item} → família ${cd_comp_master}`)
    );
    console.log('\n   💡 Dica: os itens acima podem não ter sido importados do PNCP ainda.');
  }

  console.log('\n✔️  Correlação concluída.\n');
}

main();
