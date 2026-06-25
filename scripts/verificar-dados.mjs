/**
 * SIS-SUP — Verificação de integridade dos dados importados
 */
import pkg from 'pg'
const { Client } = pkg

const client = new Client({
  connectionString: 'postgresql://postgres:56BvwCaTqkfwUBA2@db.axuvwfkhauoizforekxi.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

function sep(title) { console.log(`\n${'═'.repeat(56)}\n  ${title}\n${'─'.repeat(56)}`) }
function ok(msg) { console.log(`  ✅ ${msg}`) }
function warn(msg) { console.log(`  ⚠️  ${msg}`) }
function err(msg) { console.log(`  ❌ ${msg}`) }
function row(label, val) { console.log(`  ${label.padEnd(38)} ${String(val).padStart(10)}`) }

await client.connect()

// ─── 1. CADASTRO ──────────────────────────────────────────────────────────────
sep('1. CADASTRO DE COMPONENTES (tabela produtos)')

const { rows: [totais] } = await client.query(`
  SELECT
    COUNT(*)                                       AS total,
    COUNT(*) FILTER (WHERE pos_familia = 'MASTER') AS masters,
    COUNT(*) FILTER (WHERE pos_familia = 'EQUIVALENTE') AS equivalentes,
    COUNT(*) FILTER (WHERE mercado = 'INTERNO')    AS mercado_interno,
    COUNT(*) FILTER (WHERE ativo = true)           AS ativos
  FROM produtos
`)
row('Total de produtos:', totais.total)
row('→ Mercado Interno:', totais.mercado_interno)
row('→ MASTER:', totais.masters)
row('→ EQUIVALENTE:', totais.equivalentes)
row('→ Ativos:', totais.ativos)

// Verificar que todos são Mercado Interno
if (totais.total === totais.mercado_interno) ok('Todos os produtos são Mercado Interno')
else warn(`${totais.total - totais.mercado_interno} produtos SEM mercado=INTERNO`)

// Amostras de MASTER
const { rows: amostras } = await client.query(`
  SELECT cd_comp, cd_comp_master, nomenclatura, pos_familia, nd, si
  FROM produtos WHERE pos_familia = 'MASTER' AND mercado = 'INTERNO'
  ORDER BY cd_comp LIMIT 5
`)
console.log('\n  Amostra de MASTER:')
amostras.forEach(r => console.log(`    ${r.cd_comp.padEnd(10)} | ${String(r.nd).padEnd(4)} ${String(r.si).padEnd(4)} | ${r.nomenclatura?.slice(0,50)}`))

// Amostras de EQUIVALENTE
const { rows: equivs } = await client.query(`
  SELECT cd_comp, cd_comp_master, pos_familia
  FROM produtos WHERE pos_familia = 'EQUIVALENTE' LIMIT 5
`)
console.log('\n  Amostra de EQUIVALENTE (cd_comp → cd_comp_master):')
equivs.forEach(r => console.log(`    ${r.cd_comp.padEnd(10)} → ${r.cd_comp_master}`))

// Verificar MASTER que apontam para si mesmo
const { rows: [masterCheck] } = await client.query(`
  SELECT COUNT(*) AS ok, COUNT(*) FILTER (WHERE cd_comp != cd_comp_master) AS wrong
  FROM produtos WHERE pos_familia = 'MASTER'
`)
if (masterCheck.wrong === '0') ok('Todos os MASTER têm cd_comp_master = cd_comp')
else warn(`${masterCheck.wrong} MASTER com cd_comp_master diferente de cd_comp`)

// ─── 2. ESTOQUE ───────────────────────────────────────────────────────────────
sep('2. ESTOQUE (tabela estoque)')

const { rows: [estoq] } = await client.query(`
  SELECT
    COUNT(*)                                       AS total,
    COUNT(*) FILTER (WHERE ambiente = 'CAVEX')     AS cavex,
    COUNT(*) FILTER (WHERE estoque_total > 0)      AS com_estoque,
    SUM(estoque_lib)                               AS total_lib,
    SUM(estoque_res)                               AS total_rsv,
    SUM(estoque_total)                             AS total_geral,
    MIN(estoque_total)                             AS min_est,
    MAX(estoque_total)                             AS max_est
  FROM estoque
`)
row('Total de registros:', estoq.total)
row('→ CAVEX:', estoq.cavex)
row('→ Com estoque > 0:', estoq.com_estoque)
row('→ Total Liberado (soma):', Number(estoq.total_lib).toLocaleString('pt-BR'))
row('→ Total Reservado (soma):', Number(estoq.total_rsv).toLocaleString('pt-BR'))
row('→ Total Geral (soma):', Number(estoq.total_geral).toLocaleString('pt-BR'))

// Verificar que todos os cd_comp do estoque existem em produtos (MASTER MI)
const { rows: [orphans] } = await client.query(`
  SELECT COUNT(*) AS orphans
  FROM estoque e
  WHERE NOT EXISTS (
    SELECT 1 FROM produtos p
    WHERE p.cd_comp = e.cd_comp AND p.mercado = 'INTERNO'
  )
`)
if (orphans.orphans === '0') ok('Todos os cd_comp do estoque existem no cadastro (Mercado Interno)')
else warn(`${orphans.orphans} registros de estoque SEM correspondente no cadastro`)

// Maiores estoques
const { rows: top5 } = await client.query(`
  SELECT e.cd_comp, p.nomenclatura, e.estoque_lib, e.estoque_res, e.estoque_total
  FROM estoque e
  LEFT JOIN produtos p ON p.cd_comp = e.cd_comp
  WHERE e.ambiente = 'CAVEX'
  ORDER BY e.estoque_total DESC LIMIT 5
`)
console.log('\n  Top 5 MASTER por estoque total:')
top5.forEach(r => console.log(`    ${r.cd_comp.padEnd(10)} | lib=${Number(r.estoque_lib).toFixed(0).padStart(6)} rsv=${Number(r.estoque_res).toFixed(0).padStart(6)} total=${Number(r.estoque_total).toFixed(0).padStart(6)} | ${r.nomenclatura?.slice(0,35) ?? '(sem cadastro)'}`))

// ─── 3. FORNECIMENTOS ─────────────────────────────────────────────────────────
sep('3. FORNECIMENTOS (tabela fornecimentos)')

const { rows: [forn] } = await client.query(`
  SELECT
    COUNT(*)                                        AS total,
    COUNT(*) FILTER (WHERE ambiente = 'CAVEX')      AS cavex,
    MIN(data)                                       AS data_mais_antiga,
    MAX(data)                                       AS data_mais_recente,
    COUNT(DISTINCT cd_comp_master)                  AS masters_distintos,
    COUNT(DISTINCT cd_comp)                         AS comps_distintos,
    COUNT(DISTINCT solicitante)                     AS solicitantes,
    SUM(quantidade)                                 AS total_qtd
  FROM fornecimentos
`)
row('Total de registros:', forn.total)
row('→ CAVEX:', forn.cavex)
row('→ Data mais antiga:', forn.data_mais_antiga)
row('→ Data mais recente:', forn.data_mais_recente)
row('→ MASTER distintos:', forn.masters_distintos)
row('→ Componentes distintos:', forn.comps_distintos)
row('→ Solicitantes distintos:', forn.solicitantes)
row('→ Quantidade total fornecida:', Number(forn.total_qtd).toLocaleString('pt-BR'))

// Verificar data mais antiga >= 5 anos atrás
const limite5Anos = new Date()
limite5Anos.setFullYear(limite5Anos.getFullYear() - 5)
const dataAntiga = new Date(forn.data_mais_antiga)
if (dataAntiga >= limite5Anos) ok(`Dados dentro do filtro de 5 anos (≥ ${limite5Anos.toLocaleDateString('pt-BR')})`)
else warn(`Data mais antiga (${dataAntiga.toLocaleDateString('pt-BR')}) está fora dos 5 anos — verificar filtro`)

// Verificar que todos os cd_comp do fornecimento existem em produtos
const { rows: [orphansForn] } = await client.query(`
  SELECT COUNT(DISTINCT cd_comp) AS orphans
  FROM fornecimentos f
  WHERE NOT EXISTS (
    SELECT 1 FROM produtos p WHERE p.cd_comp = f.cd_comp AND p.mercado = 'INTERNO'
  )
`)
if (orphansForn.orphans === '0') ok('Todos os cd_comp dos fornecimentos existem no cadastro (Mercado Interno)')
else warn(`${orphansForn.orphans} cd_comp nos fornecimentos SEM correspondente no cadastro`)

// Consumo por ano
const { rows: porAno } = await client.query(`
  SELECT ano, COUNT(*) AS registros, SUM(quantidade) AS quantidade
  FROM fornecimentos WHERE ambiente = 'CAVEX'
  GROUP BY ano ORDER BY ano
`)
console.log('\n  Consumo por ano (CAVEX):')
porAno.forEach(r => console.log(`    ${r.ano}  |  ${String(r.registros).padStart(5)} registros  |  ${Number(r.quantidade).toLocaleString('pt-BR').padStart(10)} un`))

// Top 5 MASTER mais consumidos
const { rows: top5Forn } = await client.query(`
  SELECT f.cd_comp_master, p.nomenclatura, SUM(f.quantidade) AS total
  FROM fornecimentos f
  LEFT JOIN produtos p ON p.cd_comp = f.cd_comp_master AND p.pos_familia = 'MASTER'
  WHERE f.ambiente = 'CAVEX'
  GROUP BY f.cd_comp_master, p.nomenclatura
  ORDER BY total DESC LIMIT 5
`)
console.log('\n  Top 5 MASTER mais consumidos (últimos 5 anos):')
top5Forn.forEach(r => console.log(`    ${r.cd_comp_master?.padEnd(10)} | ${Number(r.total).toLocaleString('pt-BR').padStart(8)} un | ${r.nomenclatura?.slice(0,40) ?? '(sem cadastro)'}`))

// ─── 4. CONSISTÊNCIA CRUZADA ─────────────────────────────────────────────────
sep('4. CONSISTÊNCIA CRUZADA')

// MASTER com estoque E histórico
const { rows: [cross] } = await client.query(`
  SELECT
    COUNT(DISTINCT e.cd_comp)                                   AS masters_com_estoque,
    COUNT(DISTINCT f.cd_comp_master)                            AS masters_com_historico,
    COUNT(DISTINCT e.cd_comp) FILTER (
      WHERE EXISTS (SELECT 1 FROM fornecimentos forn WHERE forn.cd_comp_master = e.cd_comp)
    )                                                           AS masters_com_ambos
  FROM estoque e
  FULL OUTER JOIN (
    SELECT DISTINCT cd_comp_master FROM fornecimentos WHERE ambiente = 'CAVEX'
  ) f ON f.cd_comp_master = e.cd_comp
  WHERE e.ambiente = 'CAVEX' OR e.cd_comp IS NULL
`)
row('MASTER com estoque:', cross.masters_com_estoque)
row('MASTER com histórico de consumo:', cross.masters_com_historico)
row('MASTER com estoque E histórico:', cross.masters_com_ambos)

// Verificar cobertura 0 (estoque mas sem histórico = SEM_HIST)
const { rows: [semHist] } = await client.query(`
  SELECT COUNT(DISTINCT e.cd_comp) AS count
  FROM estoque e
  WHERE e.ambiente = 'CAVEX'
  AND NOT EXISTS (
    SELECT 1 FROM fornecimentos f WHERE f.cd_comp_master = e.cd_comp AND f.ambiente = 'CAVEX'
  )
`)
row('MASTER com estoque mas sem histórico (SEM_HIST):', semHist.count)

sep('5. RESUMO FINAL')
ok(`Cadastro: ${totais.masters} MASTER + ${totais.equivalentes} EQUIVALENTES`)
ok(`Estoque CAVEX: ${estoq.cavex} registros`)
ok(`Fornecimentos CAVEX: ${forn.total} registros | ${forn.masters_distintos} MASTER`)
ok(`Janela temporal: ${forn.data_mais_antiga} → ${forn.data_mais_recente}`)
console.log('')

await client.end()
