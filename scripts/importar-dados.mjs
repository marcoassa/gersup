/**
 * SIS-SUP — Script de Importação de Dados Reais
 * Lê as três planilhas CSV, processa e insere no Supabase em lotes.
 *
 * Uso:
 *   node scripts/importar-dados.mjs [--cadastro] [--estoque] [--fornecimentos] [--all]
 *   node scripts/importar-dados.mjs --all
 */

import { createReadStream } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PLANILHAS = resolve(ROOT, 'Planilhas_fonte')

// ─── Configuração ──────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://axuvwfkhauoizforekxi.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg'
const BATCH_SIZE = 500

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Utilitários (duplicados aqui para não depender de TS) ─────────────────────

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function cleanCode(value) {
  return String(value ?? '').trim().replace(/\.0$/, '')
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  let str = String(value).trim()
  if (!str) return 0
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    str = str.replace(',', '.')
  }
  const n = Number(str)
  return Number.isFinite(n) ? n : 0
}

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 }

function parseDateSafe(value) {
  if (!value || value === '-' || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const str = String(value).trim()

  // Serial Excel
  const num = Number(str)
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d
  }
  // dd-MON-yy
  const monMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (monMatch) {
    const day = parseInt(monMatch[1], 10)
    const month = MONTHS[monMatch[2].toLowerCase()]
    let year = parseInt(monMatch[3], 10)
    if (year < 100) year += year >= 50 ? 1900 : 2000
    if (month === undefined) return null
    return new Date(year, month, day)
  }
  // dd/mm/yyyy
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (brMatch) return new Date(+brMatch[3], +brMatch[2]-1, +brMatch[1])
  // yyyy-mm-dd
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2]-1, +isoMatch[3])
  return null
}

function dateToISO(d) {
  return d ? d.toISOString().slice(0, 10) : null
}

function getField(row, ...keys) {
  for (const key of keys) {
    if (key in row && row[key] !== undefined) return row[key]
    const normKey = normalize(key)
    const found = Object.entries(row).find(([k]) => normalize(k) === normKey)
    if (found) return found[1]
  }
  return ''
}

// ─── Leitura de CSV com delimitador `;` ────────────────────────────────────────

async function* readCSV(filePath) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let headers = null
  for await (const line of rl) {
    const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''))
    if (!headers) {
      headers = cols
      continue
    }
    const row = {}
    headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
    yield row
  }
}

// ─── Inserção em lotes com retry ───────────────────────────────────────────────

async function upsertBatch(table, rows, conflictCol) {
  if (rows.length === 0) return { count: 0, errors: 0 }
  let errors = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table).upsert(batch, {
      onConflict: conflictCol,
      ignoreDuplicates: false,
    })
    if (error) {
      console.error(`  ⚠️  Lote ${Math.floor(i/BATCH_SIZE)+1} com erro: ${error.message}`)
      errors++
    } else {
      process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`)
    }
  }
  console.log('')
  return { count: rows.length, errors }
}

// ─── ETAPA 1: Importar Cadastro ────────────────────────────────────────────────

async function importarCadastro() {
  console.log('\n📋 CADASTRO DE COMPONENTES')
  console.log('─'.repeat(50))

  const mapaComponenteParaMaster = new Map()
  const produtosValidos = []
  let totalLinhas = 0
  let totalMI = 0
  const cdCompsMI = new Set()
  const mastersNeeded = new Set()

  console.log(`  Passo 1: Identificando componentes Mercado Interno e seus MASTERs...`)
  for await (const row of readCSV(resolve(PLANILHAS, 'ConsDinamicaCadComponentes.csv'))) {
    const aquisicoes = getField(row, 'AQUISICOES', 'AQUISIÇÕES')
    if (normalize(aquisicoes).includes('mercado interno')) {
      const cdComp = cleanCode(getField(row, 'CD_COMPONENTE', 'CD_COMP'))
      const cdMasterRaw = cleanCode(getField(row, 'CD_COMP_MASTER', 'Cód_MPN_Familia', 'MPN_FAMILIA'))
      const posFamilia = normalize(getField(row, 'POS_FAMILIA'))
      const isMaster = posFamilia === 'm' || cdMasterRaw === '' || cdMasterRaw === cdComp
      const cdCompMaster = isMaster ? cdComp : (cdMasterRaw || cdComp)
      
      if (cdComp) {
        cdCompsMI.add(cdComp)
        mastersNeeded.add(cdCompMaster)
      }
    }
  }

  console.log(`  Passo 2: Processando os componentes válidos...`)
  for await (const row of readCSV(resolve(PLANILHAS, 'ConsDinamicaCadComponentes.csv'))) {
    totalLinhas++
    const cdComp = cleanCode(getField(row, 'CD_COMPONENTE', 'CD_COMP'))
    if (!cdComp) continue

    if (!cdCompsMI.has(cdComp) && !mastersNeeded.has(cdComp)) continue
    
    totalMI++

    const cdMasterRaw = cleanCode(getField(row, 'CD_COMP_MASTER', 'Cód_MPN_Familia', 'MPN_FAMILIA'))
    const posFamilia = normalize(getField(row, 'POS_FAMILIA'))
    const isMaster = posFamilia === 'm' || cdMasterRaw === '' || cdMasterRaw === cdComp
    const cdCompMaster = isMaster ? cdComp : (cdMasterRaw || cdComp)

    mapaComponenteParaMaster.set(cdComp, cdCompMaster)

    const dtRaw = getField(row, 'DT_APROV_CADASTRO', 'DT_PRE_CADASTRO')
    const dt = parseDateSafe(dtRaw)

    let nom = getField(row, 'NOMENCLATURA', 'DESCRICAO', 'DESCRIÇÃO')
    if (nom === '-' || !nom) nom = getField(row, 'DESC_RESUMIDA')
    if (nom === '-' || !nom) nom = cdComp

    const aquisicoes = getField(row, 'AQUISICOES', 'AQUISIÇÕES')

    produtosValidos.push({
      cd_comp: cdComp,
      cd_comp_master: cdCompMaster,
      pn: getField(row, 'PN') || null,
      mpn: getField(row, 'MPN') || null,
      nomenclatura: nom,
      fabricante: getField(row, 'FABRICANTE') || null,
      nd: getField(row, 'ND') || null,
      si: getField(row, 'SI') || null,
      pos_familia: isMaster ? 'MASTER' : 'EQUIVALENTE',
      mercado: 'INTERNO',
      aquisicoes: aquisicoes,
      dt_aprov_cadastro: dateToISO(dt),
      ativo: true,
    })

    if (totalLinhas % 10000 === 0) process.stdout.write(`  Lidas ${totalLinhas} linhas...\r`)
  }

  const masters = produtosValidos.filter(p => p.pos_familia === 'MASTER').length
  const equivs = produtosValidos.filter(p => p.pos_familia === 'EQUIVALENTE').length

  console.log(`  Total original:     ${totalLinhas}`)
  console.log(`  Mercado Interno:    ${totalMI}`)
  console.log(`  MASTER:             ${masters}`)
  console.log(`  EQUIVALENTE:        ${equivs}`)
  console.log(`  Inserindo no banco...`)

  const { errors } = await upsertBatch('produtos', produtosValidos, 'cd_comp')
  console.log(`  ✅ ${produtosValidos.length} produtos importados (${errors} lotes com erro)`)

  return mapaComponenteParaMaster
}

// ─── ETAPA 2: Importar Estoque ─────────────────────────────────────────────────

async function importarEstoque(mapaComponenteParaMaster) {
  console.log('\n📦 ESTOQUE')
  console.log('─'.repeat(50))

  const estoqueMap = new Map() // cd_comp → {qtd_lib, qtd_rsv}
  let totalLinhas = 0, totalCavex = 0, totalMI = 0

  for await (const row of readCSV(resolve(PLANILHAS, 'ConsDinamicaEstoque.csv'))) {
    totalLinhas++
    const local = getField(row, 'BS_LOCAL', 'LOCAL', 'AMBIENTE')
    if (normalize(local) !== 'cavex') continue
    totalCavex++

    const cdComp = cleanCode(getField(row, 'CD_COMPONENTE_FK', 'CD_COMP', 'Cod_Componente'))
    if (!mapaComponenteParaMaster.has(cdComp)) continue
    totalMI++

    const qtdLib = parseNumber(getField(row, 'QTD_LIB'))
    const qtdRsv = parseNumber(getField(row, 'QTD_RSV'))

    const cur = estoqueMap.get(cdComp) ?? { qtd_lib: 0, qtd_rsv: 0 }
    estoqueMap.set(cdComp, {
      qtd_lib: cur.qtd_lib + qtdLib,
      qtd_rsv: cur.qtd_rsv + qtdRsv,
    })

    if (totalLinhas % 5000 === 0) process.stdout.write(`  Lidas ${totalLinhas} linhas...\r`)
  }

  // Montar registros para upsert
  const estoqueRows = Array.from(estoqueMap.entries()).map(([cdComp, vals]) => ({
    cd_comp: cdComp,
    ambiente: 'CAVEX',
    estoque_lib: vals.qtd_lib,
    estoque_res: vals.qtd_rsv,
    estoque_total: vals.qtd_lib + vals.qtd_rsv,
    data_referencia: new Date().toISOString().slice(0, 10),
  }))

  console.log(`  Total original:     ${totalLinhas}`)
  console.log(`  CAVEX:              ${totalCavex}`)
  console.log(`  Mercado Interno:    ${totalMI}`)
  console.log(`  Componentes únicos: ${estoqueRows.length}`)
  console.log(`  Inserindo no banco...`)

  const { errors } = await upsertBatch('estoque', estoqueRows, 'cd_comp,ambiente')
  console.log(`  ✅ ${estoqueRows.length} registros de estoque importados (${errors} lotes com erro)`)
}

// ─── ETAPA 3: Importar Fornecimentos ───────────────────────────────────────────

async function importarFornecimentos(mapaComponenteParaMaster) {
  console.log('\n📊 FORNECIMENTOS (últimos 5 anos)')
  console.log('─'.repeat(50))

  const hoje = new Date()
  const dataLimite = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate())

  const fornRows = []
  let totalLinhas = 0, totalCavex = 0, total5Anos = 0, totalMI = 0

  for await (const row of readCSV(resolve(PLANILHAS, 'ConsDinamicaMatFornecido.csv'))) {
    totalLinhas++
    const amb = getField(row, 'Ambiente', 'AMBIENTE')
    if (normalize(amb) !== 'cavex') continue
    totalCavex++

    const dtRaw = getField(row, 'Dt_Cadastro', 'Data', 'DATA_FORNECIMENTO')
    const data = parseDateSafe(dtRaw)
    if (!data || data < dataLimite) continue
    total5Anos++

    const cdComp = cleanCode(
      getField(row, 'Cod_Componente', 'Cód_Componente', 'CD_COMP', 'CD_COMPONENTE')
    )
    if (!mapaComponenteParaMaster.has(cdComp)) continue
    totalMI++

    const cdCompMaster = mapaComponenteParaMaster.get(cdComp)
    const qtd = parseNumber(getField(row, 'Qtd_Fornecida', 'QTD', 'Quantidade'))
    if (qtd <= 0) continue

    fornRows.push({
      cd_comp: cdComp,
      cd_comp_master: cdCompMaster,
      ano: data.getFullYear(),
      data: dateToISO(data),
      quantidade: qtd,
      solicitante: getField(row, 'Solicitante') || null,
      ambiente: 'CAVEX',
    })

    if (totalLinhas % 10000 === 0) process.stdout.write(`  Lidas ${totalLinhas} linhas...\r`)
  }

  console.log(`  Total original:     ${totalLinhas}`)
  console.log(`  CAVEX:              ${totalCavex}`)
  console.log(`  Últimos 5 anos:     ${total5Anos}`)
  console.log(`  Mercado Interno:    ${totalMI}`)
  console.log(`  Registros válidos:  ${fornRows.length}`)
  console.log(`  Inserindo no banco...`)

  // Limpar fornecimentos CAVEX existentes antes de reimportar
  const { error: delErr } = await supabase
    .from('fornecimentos')
    .delete()
    .eq('ambiente', 'CAVEX')
  if (delErr) console.warn(`  ⚠️  Aviso ao limpar: ${delErr.message}`)

  const { errors } = await upsertBatch('fornecimentos', fornRows, 'id')
  console.log(`  ✅ ${fornRows.length} registros de fornecimento importados (${errors} lotes com erro)`)
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const all = args.includes('--all') || args.length === 0
const runCadastro = all || args.includes('--cadastro')
const runEstoque = all || args.includes('--estoque')
const runFornecimentos = all || args.includes('--fornecimentos')

console.log('╔══════════════════════════════════════════════════╗')
console.log('║   SIS-SUP — Importação de Dados Reais            ║')
console.log('╚══════════════════════════════════════════════════╝')
console.log(`Data limite fornecimentos: ${new Date(new Date().getFullYear()-5, new Date().getMonth(), new Date().getDate()).toLocaleDateString('pt-BR')} até hoje`)

let mapaComponenteParaMaster = new Map()

if (runCadastro) {
  mapaComponenteParaMaster = await importarCadastro()
} else {
  // Se não importou cadastro, busca mapa do banco
  console.log('\n📋 Carregando mapa do banco (cadastro não reimportado)...')
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('produtos')
      .select('cd_comp, cd_comp_master')
      .eq('mercado', 'INTERNO')
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (error) { console.error('Erro ao buscar mapa:', error.message); break }
    if (!data || data.length === 0) break
    data.forEach(p => mapaComponenteParaMaster.set(p.cd_comp, p.cd_comp_master))
    page++
  }
  console.log(`  Mapa carregado: ${mapaComponenteParaMaster.size} componentes`)
}

if (runEstoque) {
  await importarEstoque(mapaComponenteParaMaster)
}

if (runFornecimentos) {
  await importarFornecimentos(mapaComponenteParaMaster)
}

console.log('\n✅ Importação concluída!\n')
