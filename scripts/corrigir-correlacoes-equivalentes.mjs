/**
 * corrigir-correlacoes-equivalentes.mjs
 *
 * Audita e corrige todos os registros de itens_pregao onde cd_comp_master
 * aponta para um produto EQUIVALENTE em vez de um produto MASTER.
 *
 * Lógica:
 *   1. Carrega todos os produtos do banco (cd_comp, cd_comp_master, pos_familia)
 *   2. Constrói um mapa: cd_comp_equivalente → cd_comp_master real
 *   3. Varre itens_pregao com cd_comp_master preenchido
 *   4. Para cada item, verifica se o cd_comp_master referenciado é EQUIVALENTE
 *   5. Se sim, substitui pelo cd_comp_master real do MASTER da família
 *
 * Uso:
 *   node scripts/corrigir-correlacoes-equivalentes.mjs
 *
 * Por padrão roda em modo DRY-RUN (só exibe o que seria corrigido).
 * Para aplicar as correções, passe --apply como argumento:
 *   node scripts/corrigir-correlacoes-equivalentes.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://axuvwfkhauoizforekxi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg';

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  GERSUP — Correção de Correlações com Equivalentes');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(DRY_RUN
    ? '  ⚠️  MODO DRY-RUN (nenhuma alteração será feita no banco)'
    : '  🔴 MODO APPLY — as correções SERÃO gravadas no banco!'
  );
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. Carregar todos os produtos ──────────────────────────────────────────
  console.log('📦 Carregando cadastro de produtos...');

  let todosProdutos = [];
  let page = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('produtos')
      .select('cd_comp, cd_comp_master, pos_familia, nomenclatura')
      .eq('mercado', 'INTERNO')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('❌ Erro ao carregar produtos:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    todosProdutos.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`   ${todosProdutos.length} produtos carregados.\n`);

  // ── 2. Construir mapas ─────────────────────────────────────────────────────
  // Mapa: cd_comp → { pos_familia, cd_comp_master, nomenclatura }
  const prodMap = new Map(todosProdutos.map(p => [p.cd_comp, p]));

  // Conjunto de cd_comp que são MASTER
  const masters = new Set(
    todosProdutos.filter(p => p.pos_familia === 'MASTER').map(p => p.cd_comp)
  );

  // Mapa: cd_comp_equivalente → cd_comp_master (para equivalentes)
  const equivParaMaster = new Map();
  for (const p of todosProdutos) {
    if (p.pos_familia === 'EQUIVALENTE' && p.cd_comp_master) {
      equivParaMaster.set(p.cd_comp, p.cd_comp_master);
    }
  }

  console.log(`   MASTERs no cadastro : ${masters.size}`);
  console.log(`   EQUIVALENTEs mapeados: ${equivParaMaster.size}\n`);

  // ── 3. Carregar itens_pregao com cd_comp_master preenchido ─────────────────
  console.log('🔍 Buscando itens_pregao com cd_comp_master preenchido...');

  let todosItens = [];
  page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('itens_pregao')
      .select('id, numero_item, descricao, cd_comp_master, pregao_id')
      .not('cd_comp_master', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('❌ Erro ao carregar itens_pregao:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    todosItens.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`   ${todosItens.length} item(ns) com cd_comp_master preenchido.\n`);

  // ── 4. Auditar ─────────────────────────────────────────────────────────────
  const paraCorrigir = [];
  const corretos = [];
  const desconhecidos = [];

  for (const item of todosItens) {
    const cdAtual = item.cd_comp_master;
    const prod = prodMap.get(cdAtual);

    if (!prod) {
      // cd_comp_master aponta para um código que não existe no cadastro
      desconhecidos.push({ ...item, problema: 'Código não encontrado no cadastro' });
      continue;
    }

    if (prod.pos_familia === 'EQUIVALENTE') {
      // Aponta para um EQUIVALENTE — precisa corrigir
      const cdMasterCorreto = equivParaMaster.get(cdAtual);
      if (cdMasterCorreto) {
        const masterProd = prodMap.get(cdMasterCorreto);
        paraCorrigir.push({
          ...item,
          cd_comp_master_correto: cdMasterCorreto,
          nomenclatura_master: masterProd?.nomenclatura ?? '?',
          nomenclatura_equiv: prod.nomenclatura,
        });
      } else {
        desconhecidos.push({
          ...item,
          problema: `EQUIVALENTE sem cd_comp_master mapeado (${cdAtual})`,
        });
      }
      continue;
    }

    // pos_familia === 'MASTER' — está correto
    corretos.push(item);
  }

  // ── 5. Relatório ───────────────────────────────────────────────────────────
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`📊 AUDITORIA`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   ✅ Já corretos (apontam para MASTER) : ${corretos.length}`);
  console.log(`   🔧 Precisam de correção (EQUIVALENTE): ${paraCorrigir.length}`);
  console.log(`   ❓ Códigos desconhecidos             : ${desconhecidos.length}`);
  console.log('─────────────────────────────────────────────────────────────\n');

  if (paraCorrigir.length > 0) {
    console.log('🔧 Itens que serão corrigidos:');
    console.log('');
    for (const item of paraCorrigir) {
      console.log(
        `   Item ${String(item.numero_item).padStart(3)} — ${item.cd_comp_master} (EQUIV: "${item.nomenclatura_equiv?.substring(0, 40)}")`
      );
      console.log(
        `          → ${item.cd_comp_master_correto} (MASTER: "${item.nomenclatura_master?.substring(0, 40)}")`
      );
    }
    console.log('');
  }

  if (desconhecidos.length > 0) {
    console.log('❓ Itens com problemas não resolvidos:');
    for (const item of desconhecidos) {
      console.log(`   Item ${item.numero_item} cd=${item.cd_comp_master} — ${item.problema}`);
    }
    console.log('');
  }

  // ── 6. Aplicar correções ───────────────────────────────────────────────────
  if (paraCorrigir.length === 0) {
    console.log('✔️  Nenhuma correção necessária. Todos os vínculos já apontam para MASTERs.\n');
    return;
  }

  if (DRY_RUN) {
    console.log('ℹ️  Modo DRY-RUN: nenhuma alteração foi feita.');
    console.log('   Para aplicar, execute:');
    console.log('   node scripts/corrigir-correlacoes-equivalentes.mjs --apply\n');
    return;
  }

  console.log('🔴 Aplicando correções no banco...\n');
  let ok = 0;
  let erros = 0;

  for (const item of paraCorrigir) {
    const { error } = await supabase
      .from('itens_pregao')
      .update({
        cd_comp_master: item.cd_comp_master_correto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (error) {
      console.error(`   ❌ Item ${item.numero_item} (${item.cd_comp_master}) — Erro: ${error.message}`);
      erros++;
    } else {
      console.log(`   ✅ Item ${item.numero_item}: ${item.cd_comp_master} → ${item.cd_comp_master_correto}`);
      ok++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${ok} corrigido(s)  |  ${erros} erro(s)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
