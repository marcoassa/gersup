/**
 * correlacionar-pregao-90006-2026.mjs
 *
 * Correlaciona os 35 itens do pregão 90006/2026
 * com seus respectivos cd_comp_master na tabela itens_pregao.
 *
 * Fonte das correlações: itens_familias_extraidos.md (baixado em 18/06/2026)
 *
 * Uso: node scripts/correlacionar-pregao-90006-2026.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ── Configuração Supabase ─────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://axuvwfkhauoizforekxi.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg';
const NUMERO_PREGAO = '90006/2026';

// ── Tabela de correlação Item → cd_comp_master ────────────────────────────────
// Fonte: itens_familias_extraidos.md
const CORRELACAO = [
  { item:  1, cd_comp_master:  '89092' },
  { item:  2, cd_comp_master:  '89057' },
  { item:  3, cd_comp_master:  'N3652' },
  { item:  4, cd_comp_master:  '36438' },
  { item:  5, cd_comp_master:  '89088' },
  { item:  6, cd_comp_master:  '20574' },
  { item:  7, cd_comp_master:  '94729' },
  { item:  8, cd_comp_master:  '94811' },
  { item:  9, cd_comp_master:  '89077' },
  { item: 10, cd_comp_master:  '34502' },
  { item: 11, cd_comp_master:  '89082' },
  { item: 12, cd_comp_master:  '93631' },
  { item: 13, cd_comp_master:  '89066' },
  { item: 14, cd_comp_master: '101315' },
  { item: 15, cd_comp_master:  '98214' },
  { item: 16, cd_comp_master:  '89107' },
  { item: 17, cd_comp_master:  '21971' },
  { item: 18, cd_comp_master:  '90085' },
  { item: 19, cd_comp_master:  '89097' },
  { item: 20, cd_comp_master:  '89097' }, // mesma família do item 19
  { item: 21, cd_comp_master:  '89098' },
  { item: 22, cd_comp_master:  '89096' },
  { item: 23, cd_comp_master:  '98215' },
  { item: 24, cd_comp_master:  '89104' },
  { item: 25, cd_comp_master:  '85846' },
  { item: 26, cd_comp_master:  '89104' }, // mesma família do item 24
  { item: 27, cd_comp_master:  '89104' }, // mesma família do item 24
  { item: 28, cd_comp_master:  '22305' },
  { item: 29, cd_comp_master:  '89069' },
  { item: 30, cd_comp_master:  '97633' },
  { item: 31, cd_comp_master:  '92397' },
  { item: 32, cd_comp_master:  '90080' },
  { item: 33, cd_comp_master:  '92397' }, // mesma família do item 31
  { item: 34, cd_comp_master:  '38742' },
  { item: 35, cd_comp_master:  '89110' },
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
    console.error('\n   💡 Dica: tente também os formatos "90006-2026" ou "90006/26" caso');
    console.error('   o número tenha sido salvo de forma diferente.');
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
  console.log(`📊 RESUMO — Pregão ${NUMERO_PREGAO}`);
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
