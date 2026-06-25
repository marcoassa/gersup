/**
 * GERSUP — Motor de processamento de planilhas de dados reais
 * Lida com as três planilhas: Cadastro, Estoque e Fornecimentos.
 *
 * Pode rodar:
 *  - no browser (via File API + papaparse)
 *  - no Node.js (via script de importação)
 */

// ─── Tipos internos ────────────────────────────────────────────────────────────

export interface ProdutoProcessado {
  cdComp: string
  cdCompMaster: string
  isMaster: boolean
  pn: string | null
  mpn: string | null
  nsn: string | null
  nomenclatura: string
  descResumed: string | null
  fabricante: string | null
  cdFabr: string | null
  posFamilia: 'MASTER' | 'EQUIVALENTE'
  nd: string | null
  si: string | null
  aquisicoes: string
  dtAprovCadastro: string | null
  un: string | null
  precoEstimado: number
}

export interface EstoqueProcessado {
  cdComp: string
  cdCompMaster: string
  bsLocal: string
  qtdLib: number
  qtdRsv: number
  estoqueTotal: number
  mpnFamilia: string | null
}

export interface EstoquePorMaster {
  cdCompMaster: string
  qtdLib: number
  qtdRsv: number
  estoqueTotal: number
  componentes: EstoqueProcessado[]
}

export interface FornecimentoProcessado {
  cdCompOriginal: string
  cdCompMaster: string
  data: Date | null
  dataStr: string | null
  ano: number
  qtd: number
  solicitante: string | null
  ambiente: string
}

export interface ConsumoAnualMaster {
  cdCompMaster: string
  ano: number
  quantidade: number
}

export interface MediasMaster {
  cdCompMaster: string
  consumoPorAno: Record<number, number>
  mediaAnualSimples: number
  mediaAnualPonderada: number
  mediaMensal: number
  anosComConsumo: number
  consumoRecorrente: boolean
}

export interface ProdutoConsolidado {
  cdCompMaster: string
  produto: ProdutoProcessado
  equivalentes: ProdutoProcessado[]
  estoqueLiberado: number
  estoqueReservado: number
  estoqueTotal: number
  consumoPorAno: Record<number, number>
  mediaAnualSimples: number
  mediaAnualPonderada: number
  mediaMensal: number
  anosComConsumo: number
  consumoRecorrente: boolean
  coberturaMeses: number | null
}

// Resultado de cada etapa
export interface ResultadoCadastro {
  totalLinhasOriginal: number
  totalMercadoInterno: number
  totalMasters: number
  totalEquivalentes: number
  produtosValidos: ProdutoProcessado[]
  mastersValidos: ProdutoProcessado[]
  mapaComponenteParaMaster: Map<string, string>
}

export interface ResultadoEstoque {
  totalLinhasOriginal: number
  totalLinhasCavex: number
  totalLinhasMercadoInterno: number
  totalMastersComEstoque: number
  estoquePorMaster: EstoquePorMaster[]
}

export interface ResultadoFornecimentos {
  totalLinhasOriginal: number
  totalLinhasCavex: number
  totalLinhasUltimos5Anos: number
  totalLinhasMercadoInterno: number
  fornecimentosFiltrados: FornecimentoProcessado[]
  mediasPorMaster: MediasMaster[]
}

// ─── Utilitários ───────────────────────────────────────────────────────────────

/**
 * Normaliza texto: minúsculas + sem acentos.
 */
export function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Limpa código de componente: remove espaços e sufixo ".0" de números exportados.
 */
export function cleanCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\.0$/, '')
}

/**
 * Converte número no formato brasileiro ou americano para number.
 * Aceita: "10", "10,5", "10.5", "1.234,56", "1,234.56", null, ""
 */
export function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  let str = String(value).trim()
  if (!str) return 0
  // Padrão brasileiro: 1.234,56 (ponto = milhar, vírgula = decimal)
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    str = str.replace(',', '.')
  }
  const n = Number(str)
  return Number.isFinite(n) ? n : 0
}

/**
 * Converte datas em vários formatos:
 * - dd/mm/yyyy, dd-MON-yy (ex: "05-APR-06"), yyyy-mm-dd, serial Excel
 */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

export function parseDateSafe(value: unknown): Date | null {
  if (!value || value === '-' || value === '' || value === 'null') return null

  // Objeto Date já
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const str = String(value).trim()

  // Serial Excel (número)
  const num = Number(str)
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000))
    return isNaN(date.getTime()) ? null : date
  }

  // dd-MON-yy ou dd-MON-yyyy (ex: "05-APR-06", "23-APR-25")
  const monMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (monMatch) {
    const day = parseInt(monMatch[1], 10)
    const month = MONTHS[monMatch[2].toLowerCase()]
    let year = parseInt(monMatch[3], 10)
    if (year < 100) year += year >= 50 ? 1900 : 2000
    if (month === undefined) return null
    const d = new Date(year, month, day)
    return isNaN(d.getTime()) ? null : d
  }

  // dd/mm/yyyy
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (brMatch) {
    const d = new Date(+brMatch[3], +brMatch[2] - 1, +brMatch[1])
    return isNaN(d.getTime()) ? null : d
  }

  // yyyy-mm-dd
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3])
    return isNaN(d.getTime()) ? null : d
  }

  // Tentar parse genérico como último recurso
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

export function dateToISO(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

// ─── Resolução de colunas (nomes variados) ─────────────────────────────────────

/**
 * Encontra o valor de uma linha tentando múltiplos nomes de campo.
 */
export function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    // tentativa exata
    if (key in row && row[key] !== undefined) return row[key]
    // tentativa normalizada
    const normKey = normalize(key)
    const found = Object.entries(row).find(([k]) => normalize(k) === normKey)
    if (found) return found[1]
  }
  return ''
}

// ─── ETAPA 1: Cadastro ─────────────────────────────────────────────────────────

export function processarCadastro(rows: Record<string, string>[]): ResultadoCadastro {
  const totalLinhasOriginal = rows.length

  // 1. Identificar Mercado Interno e masters necessários
  const cdCompsMI = new Set<string>()
  const mastersNeeded = new Set<string>()

  rows.forEach(row => {
    const aquisicoes = getField(row, 'AQUISICOES', 'AQUISIÇÕES')
    if (normalize(aquisicoes).includes('mercado interno')) {
      const cdComp = cleanCode(getField(row, 'CD_COMPONENTE', 'CD_COMP', 'Cod_Componente', 'Cód_Componente'))
      const cdMasterRaw = cleanCode(getField(row, 'CD_COMP_MASTER', 'Cód_MPN_Familia', 'MPN_FAMILIA'))
      const posFamilia = normalize(getField(row, 'POS_FAMILIA', 'POSIÇÃO_FAMILIA', 'POSICAO_FAMILIA'))
      const isMaster = posFamilia === 'm' || (!cdMasterRaw && !posFamilia) || cdMasterRaw === cdComp || cdMasterRaw === ''
      const cdCompMaster = isMaster ? cdComp : (cdMasterRaw || cdComp)

      if (cdComp) {
        cdCompsMI.add(cdComp)
        mastersNeeded.add(cdCompMaster)
      }
    }
  })

  // 2. Filtrar os validos
  const rowsValidos = rows.filter(row => {
    const cdComp = cleanCode(getField(row, 'CD_COMPONENTE', 'CD_COMP', 'Cod_Componente', 'Cód_Componente'))
    return cdCompsMI.has(cdComp) || mastersNeeded.has(cdComp)
  })

  const produtosValidos: ProdutoProcessado[] = rowsValidos.map(row => {
    const cdComp = cleanCode(getField(row, 'CD_COMPONENTE', 'CD_COMP', 'Cod_Componente', 'Cód_Componente'))
    const cdMasterRaw = cleanCode(
      getField(row, 'CD_COMP_MASTER', 'Cód_MPN_Familia', 'MPN_FAMILIA')
    )
    const posFamilia = normalize(getField(row, 'POS_FAMILIA', 'POSIÇÃO_FAMILIA', 'POSICAO_FAMILIA'))

    const isMaster = posFamilia === 'm' || (!cdMasterRaw && !posFamilia) || cdMasterRaw === cdComp || cdMasterRaw === ''

    const cdCompMaster = isMaster ? cdComp : (cdMasterRaw || cdComp)

    const dtRaw = getField(row, 'DT_APROV_CADASTRO', 'DT_PRE_CADASTRO')
    const dt = parseDateSafe(dtRaw)

    let nom = getField(row, 'NOMENCLATURA', 'DESCRICAO', 'DESCRIÇÃO')
    if (nom === '-' || !nom) nom = getField(row, 'DESC_RESUMIDA')
    if (nom === '-' || !nom) nom = cdComp

    return {
      cdComp,
      cdCompMaster,
      isMaster,
      pn: getField(row, 'PN') || null,
      mpn: getField(row, 'MPN') || null,
      nsn: getField(row, 'NSN') || null,
      nomenclatura: nom,
      descResumed: getField(row, 'DESC_RESUMIDA') || null,
      fabricante: getField(row, 'FABRICANTE') || null,
      cdFabr: getField(row, 'CD_FABR') || null,
      posFamilia: isMaster ? 'MASTER' : 'EQUIVALENTE',
      nd: getField(row, 'ND') || null,
      si: getField(row, 'SI') || null,
      aquisicoes: getField(row, 'AQUISICOES', 'AQUISIÇÕES'),
      dtAprovCadastro: dateToISO(dt),
      un: getField(row, 'UN', 'UQ') || null,
      precoEstimado: parseNumber(getField(row, 'PRIXAN_REAIS', 'PRIXAN', 'PRECO', 'PREÇO', 'VALOR_UNITARIO', 'VALOR')),
    } as ProdutoProcessado
  }).filter(p => p.cdComp !== '') // remover linhas sem código

  const mastersValidos = produtosValidos.filter(p => p.isMaster)
  const equivalentes = produtosValidos.filter(p => !p.isMaster)

  // Mapa componente → MASTER
  const mapaComponenteParaMaster = new Map<string, string>()
  for (const p of produtosValidos) {
    mapaComponenteParaMaster.set(p.cdComp, p.cdCompMaster)
  }

  return {
    totalLinhasOriginal,
    totalMercadoInterno: produtosValidos.length,
    totalMasters: mastersValidos.length,
    totalEquivalentes: equivalentes.length,
    produtosValidos,
    mastersValidos,
    mapaComponenteParaMaster,
  }
}

// ─── ETAPA 2: Estoque ──────────────────────────────────────────────────────────

export function processarEstoque(
  rows: Record<string, string>[],
  mapaComponenteParaMaster: Map<string, string>
): ResultadoEstoque {
  const totalLinhasOriginal = rows.length

  // 1. Filtrar CAVEX
  const cavexRows = rows.filter(row => {
    const local = getField(row, 'BS_LOCAL', 'LOCAL', 'AMBIENTE')
    return normalize(local) === 'cavex'
  })

  // 2. Mapear e filtrar por Mercado Interno
  const mapeados: EstoqueProcessado[] = cavexRows.map(row => {
    const cdComp = cleanCode(
      getField(row, 'CD_COMPONENTE_FK', 'CD_COMP', 'Cod_Componente', 'Cód_Componente')
    )
    const cdCompMaster = mapaComponenteParaMaster.get(cdComp)
      ?? cleanCode(getField(row, 'MPN_FAMILIA', 'Cód_MPN_Familia', 'CD_COMP_MASTER'))

    return {
      cdComp,
      cdCompMaster,
      bsLocal: getField(row, 'BS_LOCAL', 'LOCAL', 'AMBIENTE'),
      qtdLib: parseNumber(getField(row, 'QTD_LIB')),
      qtdRsv: parseNumber(getField(row, 'QTD_RSV')),
      estoqueTotal: parseNumber(getField(row, 'QTD_LIB')) + parseNumber(getField(row, 'QTD_RSV')),
      mpnFamilia: getField(row, 'MPN_FAMILIA', 'Cód_MPN_Familia') || null,
    }
  }).filter(e => mapaComponenteParaMaster.has(e.cdComp)) // só Mercado Interno

  // 3. Agrupar por MASTER
  const gruposMaster = new Map<string, EstoqueProcessado[]>()
  for (const e of mapeados) {
    const key = e.cdCompMaster || e.cdComp
    const grupo = gruposMaster.get(key) ?? []
    grupo.push(e)
    gruposMaster.set(key, grupo)
  }

  const estoquePorMaster: EstoquePorMaster[] = Array.from(gruposMaster.entries()).map(([cdMaster, comps]) => ({
    cdCompMaster: cdMaster,
    qtdLib: comps.reduce((s, c) => s + c.qtdLib, 0),
    qtdRsv: comps.reduce((s, c) => s + c.qtdRsv, 0),
    estoqueTotal: comps.reduce((s, c) => s + c.estoqueTotal, 0),
    componentes: comps,
  }))

  return {
    totalLinhasOriginal,
    totalLinhasCavex: cavexRows.length,
    totalLinhasMercadoInterno: mapeados.length,
    totalMastersComEstoque: estoquePorMaster.length,
    estoquePorMaster,
  }
}

// ─── ETAPA 3: Fornecimentos ────────────────────────────────────────────────────

export function processarFornecimentos(
  rows: Record<string, string>[],
  mapaComponenteParaMaster: Map<string, string>
): ResultadoFornecimentos {
  const totalLinhasOriginal = rows.length
  const hoje = new Date()
  const dataLimite = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate())

  // 1. Filtrar CAVEX
  const cavexRows = rows.filter(row => {
    const amb = getField(row, 'Ambiente', 'AMBIENTE')
    return normalize(amb) === 'cavex'
  })

  // 2. Mapear
  const mapeados = cavexRows.map(row => {
    const dtRaw = getField(row, 'Dt_Cadastro', 'Data', 'DATA_FORNECIMENTO')
    const data = parseDateSafe(dtRaw)
    const cdComp = cleanCode(
      getField(row, 'Cod_Componente', 'Cód_Componente', 'CD_COMP', 'CD_COMPONENTE')
    )
    const cdCompMaster = mapaComponenteParaMaster.get(cdComp)
      ?? cleanCode(getField(row, 'Cód_MPN_Familia', 'MPN_FAMILIA', 'CD_COMP_MASTER'))
    const qtd = parseNumber(getField(row, 'Qtd_Fornecida', 'QTD', 'Quantidade'))

    return {
      cdCompOriginal: cdComp,
      cdCompMaster,
      data,
      dataStr: dateToISO(data),
      ano: data ? data.getFullYear() : 0,
      qtd,
      solicitante: getField(row, 'Solicitante') || null,
      ambiente: getField(row, 'Ambiente', 'AMBIENTE'),
    } as FornecimentoProcessado
  })

  // 3. Filtrar últimos 5 anos
  const ultimos5Anos = mapeados.filter(f => f.data && f.data >= dataLimite && f.ano > 0)

  // 4. Filtrar Mercado Interno e quantidade > 0
  const filtrados = ultimos5Anos.filter(f =>
    mapaComponenteParaMaster.has(f.cdCompOriginal) && f.qtd > 0
  )

  // 5. Calcular médias por MASTER
  const mapConsumoPorMaster = new Map<string, Record<number, number>>()
  for (const f of filtrados) {
    const key = f.cdCompMaster
    const mapa = mapConsumoPorMaster.get(key) ?? {}
    mapa[f.ano] = (mapa[f.ano] ?? 0) + f.qtd
    mapConsumoPorMaster.set(key, mapa)
  }

  const mediasPorMaster: MediasMaster[] = Array.from(mapConsumoPorMaster.entries()).map(([cdMaster, consumoPorAno]) => {
    const anos = Object.keys(consumoPorAno).map(Number).sort((a, b) => a - b)

    // Média simples (considerando todos os anos com consumo)
    const somaTotal = anos.reduce((s, a) => s + consumoPorAno[a], 0)
    const mediaAnualSimples = anos.length > 0 ? somaTotal / anos.length : 0

    // Média ponderada (peso crescente: mais antigo=1, mais recente=n)
    let somaPonderada = 0
    let somaPesos = 0
    anos.forEach((ano, idx) => {
      const peso = idx + 1
      somaPonderada += consumoPorAno[ano] * peso
      somaPesos += peso
    })
    const mediaAnualPonderada = somaPesos > 0 ? somaPonderada / somaPesos : 0
    const mediaMensal = mediaAnualPonderada > 0 ? mediaAnualPonderada / 12 : 0

    // Anos com consumo
    const anosComConsumo = anos.filter(a => consumoPorAno[a] > 0).length

    // Consumo recorrente: ≥3 dos últimos 4 anos com consumo + média mensal ≥ 0.5
    const anoAtual = hoje.getFullYear()
    const ultimos4 = [anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual]
    const anosNosUltimos4 = ultimos4.filter(a => (consumoPorAno[a] ?? 0) > 0).length
    const consumoRecorrente = anosNosUltimos4 >= 3 && mediaMensal >= 0.5

    return {
      cdCompMaster: cdMaster,
      consumoPorAno,
      mediaAnualSimples,
      mediaAnualPonderada,
      mediaMensal,
      anosComConsumo,
      consumoRecorrente,
    }
  })

  return {
    totalLinhasOriginal,
    totalLinhasCavex: cavexRows.length,
    totalLinhasUltimos5Anos: ultimos5Anos.length,
    totalLinhasMercadoInterno: filtrados.length,
    fornecimentosFiltrados: filtrados,
    mediasPorMaster,
  }
}

// ─── CONSOLIDAÇÃO FINAL ────────────────────────────────────────────────────────

export function consolidar(
  cadastro: ResultadoCadastro,
  estoque: ResultadoEstoque,
  fornecimentos: ResultadoFornecimentos
): ProdutoConsolidado[] {
  const estoqueMap = new Map(estoque.estoquePorMaster.map(e => [e.cdCompMaster, e]))
  const mediasMap = new Map(fornecimentos.mediasPorMaster.map(m => [m.cdCompMaster, m]))
  const equivMap = new Map<string, ProdutoProcessado[]>()

  for (const p of cadastro.produtosValidos) {
    if (!p.isMaster) {
      const lista = equivMap.get(p.cdCompMaster) ?? []
      lista.push(p)
      equivMap.set(p.cdCompMaster, lista)
    }
  }

  return cadastro.mastersValidos.map(master => {
    const estoqueM = estoqueMap.get(master.cdComp)
    const mediasM = mediasMap.get(master.cdComp)
    const equivalentes = equivMap.get(master.cdComp) ?? []

    const estoqueTotal = estoqueM?.estoqueTotal ?? 0
    const mediaMensal = mediasM?.mediaMensal ?? 0
    const coberturaMeses = mediaMensal > 0 ? estoqueTotal / mediaMensal : null

    return {
      cdCompMaster: master.cdComp,
      produto: master,
      equivalentes,
      estoqueLiberado: estoqueM?.qtdLib ?? 0,
      estoqueReservado: estoqueM?.qtdRsv ?? 0,
      estoqueTotal,
      consumoPorAno: mediasM?.consumoPorAno ?? {},
      mediaAnualSimples: mediasM?.mediaAnualSimples ?? 0,
      mediaAnualPonderada: mediasM?.mediaAnualPonderada ?? 0,
      mediaMensal,
      anosComConsumo: mediasM?.anosComConsumo ?? 0,
      consumoRecorrente: mediasM?.consumoRecorrente ?? false,
      coberturaMeses,
    }
  })
}
