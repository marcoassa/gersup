/**
 * GERSUP — Serviço de integração com a API de Dados Abertos do Compras.gov.br
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  FLUXO CORRETO (validado com a API real):                               ║
 * ║                                                                          ║
 * ║  1. /modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id       ║
 * ║     → Obtém unidadeOrgaoCodigoUnidade (UASG) e anoCompraPncp           ║
 * ║                                                                          ║
 * ║  2. /modulo-arp/1_consultarARP                                          ║
 * ║     → Filtra por codigoUnidadeGerenciadora + janela de datas (365 dias) ║
 * ║     → Filtra resultado local por numeroControlePncpCompra = ID informado║
 * ║     → Retorna a ARP com: numeroAtaRegistroPreco,                        ║
 * ║       codigoUnidadeGerenciadora, numeroControlePncpAta, etc.            ║
 * ║                                                                          ║
 * ║  3. /modulo-arp/2_consultarARPItem (ou 2.1_consultarARPItem_Id)        ║
 * ║     → Busca itens da ARP pelo numero da ata ou pelo ID PNCP da ata     ║
 * ║                                                                          ║
 * ║  4. /modulo-arp/4_consultarEmpenhosSaldoItem                           ║
 * ║     → Saldo e empenhos por item (consolidação por numeroItem)           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// Utilizamos o proxy do Vite para contornar problemas de CORS localmente
const BASE = '/api-compras'
const TAMANHO_PAGINA = 500

// ─── Tipos da API ─────────────────────────────────────────────────────────────

interface ApiPage<T> {
  resultado?: T[]
  data?: T[]
  totalRegistros?: number
  totalPaginas?: number
  paginasRestantes?: number
}

/** VwFtPNCPCompraDTO — retorno de /modulo-contratacoes/1.1_... */
interface ContratacaoPncpDTO {
  idCompra?: string
  numeroControlePNCP?: string
  anoCompraPncp?: number
  sequencialCompraPncp?: number
  unidadeOrgaoCodigoUnidade?: string
  unidadeOrgaoNomeUnidade?: string
  orgaoEntidadeCnpj?: string
  objetoCompra?: string
  srp?: boolean
  [key: string]: unknown
}

/** VwFtArpDTO — retorno de /modulo-arp/1_consultarARP */
export interface ArpDTO {
  numeroAtaRegistroPreco: string
  codigoUnidadeGerenciadora: string
  nomeUnidadeGerenciadora?: string
  numeroCompra: string
  anoCompra: string | number
  dataVigenciaInicial: string
  dataVigenciaFinal: string
  statusAta?: string
  objeto?: string
  valorTotal?: number
  quantidadeItens?: number
  numeroControlePncpAta?: string
  numeroControlePncpCompra?: string
  idCompra?: string
  [key: string]: unknown
}

/** VwFtArpItemDTO — retorno de /modulo-arp/2_consultarARPItem ou 2.1_ */
export interface ItemArpDTO {
  numeroItem: string | number
  descricaoItem: string
  unidade?: string
  unidadeMedida?: string
  valorUnitario: number
  quantidadeHomologadaItem?: number
  quantidadeHomologadaVencedor?: number
  quantidadeEmpenhada?: number
  dataVigenciaInicial?: string
  dataVigenciaFinal?: string
  [key: string]: unknown
}

/** VwArpEmpenhosItemDTO — retorno de /modulo-arp/4_consultarEmpenhosSaldoItem */
interface EmpenhoSaldoDTO {
  numeroItem: string | number
  unidade?: string
  tipo?: string
  quantidadeRegistrada?: number
  quantidadeEmpenhada: number
  saldoEmpenho: number
  [key: string]: unknown
}

// ─── Resultado estruturado para upsert ───────────────────────────────────────

export interface DadosPregaoPncp {
  pregao: {
    id_pncp_compra: string
    id_pncp_ata: string
    numero_ata: string
    uasg_gerenciadora: string
    numero_compra: string
    ano_compra: number
    objeto: string
    status_ata: string
    data_vigencia_inicial: string | null
    data_vigencia_final: string | null
    data_ultima_atualizacao_api: string
    // campos legado
    numero_pregao: string
    data_vencimento: string
    valor_total: number
    valor_empenhado: number
  }
  itens: Array<{
    id_pncp_ata: string
    numero_ata: string
    uasg_gerenciadora: string
    numero_item: number
    descricao: string
    unidade: string
    valor_unitario: number
    quantidade_licitada: number
    quantidade_empenhada: number
    saldo_restante: number
    saldo_empenho: number
    data_vigencia_inicial: string | null
    data_vigencia_final: string | null
    data_ultima_atualizacao_api: string
    status_pncp?: string
  }>
  avisoSaldoIndisponivel?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function toNum(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function normalizeDate(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

function extractResultado<T>(raw: unknown): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as T[]
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.resultado)) return obj.resultado as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!resp.ok) {
    let detail = resp.statusText
    try { detail = await resp.text() } catch { /* noop */ }
    throw new Error(`HTTP ${resp.status} em ${url.substring(0, 100)}...: ${detail}`)
  }
  return resp.json() as Promise<T>
}

async function fetchAllPages<T>(buildUrl: (pagina: number) => string): Promise<T[]> {
  let pagina = 1
  const todos: T[] = []

  while (true) {
    const url = buildUrl(pagina)
    let raw: unknown

    try {
      raw = await fetchJson(url)
    } catch (err) {
      if (pagina === 1) throw err
      console.warn(`[ComprasGov] Falha na página ${pagina}, parando:`, err)
      break
    }

    const items = extractResultado<T>(raw)
    todos.push(...items)

    const page = raw as ApiPage<T>
    if (toNum(page?.paginasRestantes) <= 0 || items.length === 0) break
    pagina++
  }

  return todos
}

// ─── Validação do ID PNCP ─────────────────────────────────────────────────────

export interface PncpIdParsed {
  raw: string
  cnpj: string
  sequencial: string
  numero: string
  ano: string
}

export function parsePncpId(id: string): PncpIdParsed | null {
  const clean = id.trim().replace(/\s/g, '')
  const m = clean.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/)
  if (!m) return null
  return { raw: clean, cnpj: m[1], sequencial: m[2], numero: m[3], ano: m[4] }
}

// ─── Etapa 1: Buscar contratação ──────────────────────────────────────────────

async function buscarContratacao(idPncpCompra: string): Promise<ContratacaoPncpDTO | null> {
  const parsed = parsePncpId(idPncpCompra)
  if (!parsed) return null
  
  // Utiliza a API de consulta do PNCP diretamente (suporta CORS, sem necessidade de proxy)
  const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${parsed.cnpj}/compras/${parsed.ano}/${parsed.sequencial}`
  try {
    const raw = await fetchJson<any>(url)
    if (!raw || !raw.unidadeOrgao) return null
    
    // Mapear para o formato DTO que o resto do código espera
    return {
      idCompra: raw.idCompra,
      numeroControlePNCP: raw.numeroControlePNCP,
      anoCompraPncp: raw.anoCompra,
      sequencialCompraPncp: raw.sequencialCompra,
      unidadeOrgaoCodigoUnidade: raw.unidadeOrgao.codigoUnidade,
      unidadeOrgaoNomeUnidade: raw.unidadeOrgao.nomeUnidade,
      orgaoEntidadeCnpj: raw.orgaoEntidade?.cnpj,
      objetoCompra: raw.objetoCompra,
      srp: raw.srp
    }
  } catch (err) {
    console.warn('[ComprasGov] Falha ao buscar contratação no PNCP:', err)
    return null
  }
}

// ─── Etapa 2: Buscar ARPs da UASG e filtrar pela compra ───────────────────────

export interface PncpItemDTO {
  numeroItem: number
  descricao: string
  unidadeMedida?: string
  valorUnitarioEstimado?: number
  quantidade: number
  situacaoCompraItemNome?: string
}

async function buscarTodosItensPncp(cnpj: string, ano: string, sequencial: string): Promise<PncpItemDTO[]> {
  // O endpoint oficial do PNCP suporta paginação, mas geralmente os pregões têm até ~200 itens
  // e o tamanho padrão/máximo da página ajuda.
  const urlBase = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?tamanhoPagina=500`
  
  let pagina = 1
  const todos: PncpItemDTO[] = []

  while (true) {
    try {
      const url = `${urlBase}&pagina=${pagina}`
      const resp = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!resp.ok) {
        if (resp.status === 404 && pagina === 1) return [] // Pode acontecer se não existir
        throw new Error(`Erro API PNCP HTTP ${resp.status}`)
      }
      const raw = await resp.json() as ApiPage<PncpItemDTO> | PncpItemDTO[] | any
      // A API do PNCP geralmente retorna a lista num array direto, ou num objeto paginado
      let items: PncpItemDTO[] = []
      
      if (Array.isArray(raw)) items = raw
      else if (raw && Array.isArray(raw.data)) items = raw.data
      else if (raw && Array.isArray(raw.resultado)) items = raw.resultado
      // Tratamento específico do PNCP: se for paginado, vem num wrapper
      else if (raw && typeof raw === 'object') {
        const possivelArray = Object.values(raw).find(v => Array.isArray(v))
        if (possivelArray) items = possivelArray as PncpItemDTO[]
      }

      if (items.length === 0) break
      todos.push(...items)

      // Se a página retornou menos itens que o maximo (500), já acabaram as páginas
      if (items.length < 500) break
      
      pagina++
    } catch (err) {
      console.warn(`[ComprasGov] Falha ao buscar itens do PNCP na página ${pagina}:`, err)
      break
    }
  }

  return todos
}

// ─── Etapa 3: Buscar ARPs da UASG e filtrar pela compra ───────────────────────

/**
 * Busca ARPs da UASG dentro do ano da compra e retorna a(s) vinculada(s) ao ID PNCP informado.
 * O endpoint /modulo-arp/1_consultarARP aceita até 365 dias de janela.
 */
async function buscarArpsPorUasgEAno(
  uasg: string,
  ano: number
): Promise<ArpDTO[]> {
  const uasgEnc = encodeURIComponent(uasg)
  // Janela = o ano inteiro da compra (≤ 365 dias)
  const min = `${ano}-01-01`
  const max = `${ano}-12-31`

  try {
    return await fetchAllPages<ArpDTO>((pagina) =>
      `${BASE}/modulo-arp/1_consultarARP?codigoUnidadeGerenciadora=${uasgEnc}&dataVigenciaInicialMin=${min}&dataVigenciaInicialMax=${max}&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
    )
  } catch (err) {
    // Tenta também com o ano seguinte (ata pode viger a partir do ano seguinte)
    console.warn(`[ComprasGov] Falha ao buscar ARPs do ano ${ano}, tentando ${ano + 1}:`, err)
    const min2 = `${ano + 1}-01-01`
    const max2 = `${ano + 1}-12-31`
    return fetchAllPages<ArpDTO>((pagina) =>
      `${BASE}/modulo-arp/1_consultarARP?codigoUnidadeGerenciadora=${uasgEnc}&dataVigenciaInicialMin=${min2}&dataVigenciaInicialMax=${max2}&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
    )
  }
}

/**
 * Retorna TODAS as ATAs vinculadas a este ID PNCP de compra.
 * Uma compra SRP pode gerar múltiplas ATAs (uma por fornecedor vencedor).
 */
export async function buscarTodasArpsPorIdPncp(idPncpCompra: string): Promise<ArpDTO[]> {
  const parsed = parsePncpId(idPncpCompra)
  if (!parsed) return []

  // 1. Obtém a UASG e o ano da compra a partir da contratação
  const contratacao = await buscarContratacao(idPncpCompra)
  const uasg = toStr(contratacao?.unidadeOrgaoCodigoUnidade) || ''
  const ano = toNum(contratacao?.anoCompraPncp) || parseInt(parsed.ano)

  if (!uasg) {
    throw new Error(
      'Não foi possível obter dados da contratação no PNCP (a API pode estar instável). ' +
      'Tente novamente em alguns minutos.'
    )
  }

  // 2. Buscar ARPs no ano da compra e também nos anos adjacentes
  const anosParaBuscar = [ano, ano + 1]
  const todas: ArpDTO[] = []

  for (const a of anosParaBuscar) {
    try {
      const arps = await buscarArpsPorUasgEAno(uasg, a)
      const vinculadas = arps.filter(arp =>
        toStr(arp.numeroControlePncpCompra) === idPncpCompra
      )
      todas.push(...vinculadas)
    } catch (err) {
      console.warn(`[ComprasGov] Falha ao buscar ARPs do ano ${a}:`, err)
    }
  }

  // deduplicar por numeroControlePncpAta
  const vistas = new Set<string>()
  return todas.filter(a => {
    const chave = toStr(a.numeroControlePncpAta || a.numeroAtaRegistroPreco)
    if (vistas.has(chave)) return false
    vistas.add(chave)
    return true
  })
}

// Manter compatibilidade com chamadas existentes
export async function buscarArpPorIdPncp(idPncpCompra: string): Promise<ArpDTO | null> {
  const todas = await buscarTodasArpsPorIdPncp(idPncpCompra)
  return todas[0] ?? null
}

// ─── Etapa 3: Buscar itens da ARP ────────────────────────────────────────────

/**
 * Extrai o número puro da ata (sem o ano): "00359/2025" → "00359"
 * pois o endpoint 2_consultarARPItem pode exigir apenas o número
 */
function numAtaPuro(numeroAta: string): string {
  return numeroAta.split('/')[0]
}

export async function buscarItensArp(
  arp: ArpDTO
): Promise<ItemArpDTO[]> {
  const uasgEnc = encodeURIComponent(toStr(arp.codigoUnidadeGerenciadora))

  // Estratégia 1: usar o numeroControlePncpAta com endpoint 2.1
  if (arp.numeroControlePncpAta) {
    const ataEnc = encodeURIComponent(toStr(arp.numeroControlePncpAta))
    try {
      const itens = await fetchAllPages<ItemArpDTO>((pagina) =>
        `${BASE}/modulo-arp/2.1_consultarARPItem_Id?numeroControlePncpAta=${ataEnc}&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
      )
      if (itens.length > 0) return itens
    } catch (err) {
      console.warn('[ComprasGov] 2.1_consultarARPItem_Id falhou:', err)
    }
  }

  // Estratégia 2: usar o numero da ata (puro, sem ano) + UASG
  const numeroPuro = numAtaPuro(toStr(arp.numeroAtaRegistroPreco))
  const numeroCompleto = toStr(arp.numeroAtaRegistroPreco)

  for (const numAta of [numeroPuro, numeroCompleto]) {
    const ataEnc = encodeURIComponent(numAta)
    try {
      const itens = await fetchAllPages<ItemArpDTO>((pagina) =>
        `${BASE}/modulo-arp/2_consultarARPItem?numeroAtaRegistroPreco=${ataEnc}&codigoUnidadeGerenciadora=${uasgEnc}&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
      )
      if (itens.length > 0) return itens
    } catch (err) {
      console.warn(`[ComprasGov] 2_consultarARPItem com ata="${numAta}" falhou:`, err)
    }
  }

  return []
}

// ─── Etapa 4: Buscar empenhos e saldo ────────────────────────────────────────

interface EmpenhoConsolidado {
  unidade: string
  quantidadeLicitada: number
  quantidadeEmpenhada: number
  saldoRestante: number
}

export async function buscarEmpenhosSaldo(
  arp: ArpDTO
): Promise<Map<number, EmpenhoConsolidado>> {
  const uasgEnc = encodeURIComponent(toStr(arp.codigoUnidadeGerenciadora))
  const numeroPuro = numAtaPuro(toStr(arp.numeroAtaRegistroPreco))
  const numeroCompleto = toStr(arp.numeroAtaRegistroPreco)

  let todos: EmpenhoSaldoDTO[] = []

  for (const numAta of [numeroPuro, numeroCompleto]) {
    const ataEnc = encodeURIComponent(numAta)
    try {
      const result = await fetchAllPages<EmpenhoSaldoDTO>((pagina) =>
        `${BASE}/modulo-arp/4_consultarEmpenhosSaldoItem?numeroAta=${ataEnc}&unidadeGerenciadora=${uasgEnc}&pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`
      )
      if (result.length > 0) { todos = result; break }
    } catch (err) {
      console.warn(`[ComprasGov] Empenhos com ata="${numAta}" falhou:`, err)
    }
  }

  // Consolidar por numeroItem (somar múltiplos registros do mesmo item)
  const mapa = new Map<number, EmpenhoConsolidado>()
  for (const r of todos) {
    const num = toNum(r.numeroItem)
    const existing = mapa.get(num)
    if (existing) {
      existing.quantidadeEmpenhada += toNum(r.quantidadeEmpenhada)
      existing.saldoRestante += toNum(r.saldoEmpenho)
      existing.quantidadeLicitada += toNum(r.quantidadeRegistrada)
    } else {
      mapa.set(num, {
        unidade: toStr(r.unidade),
        quantidadeLicitada: toNum(r.quantidadeRegistrada),
        quantidadeEmpenhada: toNum(r.quantidadeEmpenhada),
        saldoRestante: toNum(r.saldoEmpenho),
      })
    }
  }
  return mapa
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

export async function importarOuAtualizarPregaoPorPncp(idRaw: string): Promise<DadosPregaoPncp> {
  // Validar formato
  const parsed = parsePncpId(idRaw)
  if (!parsed) {
    throw Object.assign(
      new Error(`ID PNCP inválido: "${idRaw}". Formato esperado: 00394452000103-1-008230/2025`),
      { tipoErro: 'ID_INVALIDO' }
    )
  }

  // ── Etapa 1+2: Buscar TODAS as ATAs da compra ──────────────────────────────
  // Uma compra SRP pode ter múltiplas ATAs (uma por fornecedor vencedor de lotes)
  let todasArps: ArpDTO[]
  try {
    todasArps = await buscarTodasArpsPorIdPncp(parsed.raw)
  } catch (err) {
    throw Object.assign(
      new Error(`Erro ao buscar ATAs: ${(err as Error).message}`),
      { tipoErro: 'ERRO_REDE' }
    )
  }

  if (todasArps.length === 0) {
    throw Object.assign(
      new Error(
        'Nenhuma Ata de Registro de Preços foi encontrada para este ID PNCP. ' +
        'Verifique se a compra é do tipo SRP e se já possui ata vigente.'
      ),
      { tipoErro: 'ATA_NAO_ENCONTRADA' }
    )
  }

  const agora = new Date().toISOString()

  // ── Etapa 3+4: Buscar itens e empenhos de TODAS as ATAs em paralelo ────────
  const resultadosPorAta = await Promise.all(
    todasArps.map(async (arp) => {
      const [itens, empenhos] = await Promise.all([
        buscarItensArp(arp),
        buscarEmpenhosSaldo(arp),
      ])
      return { arp, itens, empenhos }
    })
  )

  // ── Consolidar itens de TODAS as ATAs ─────────────────────────────────────
  // numero_item é único por compra (cada item vai para um único fornecedor)
  const itensPorNumero = new Map<number, DadosPregaoPncp['itens'][number]>()
  
  // O aviso só deve aparecer se NENHUMA das atas tiver dados de empenho
  const totalEmpenhos = resultadosPorAta.reduce((acc, r) => acc + r.empenhos.size, 0)
  const avisoSaldoIndisponivel = totalEmpenhos === 0
  
  let valorTotal = 0
  let valorEmpenhado = 0

  const arpPrincipal = todasArps[0]
  const idPncpCompra = toStr(arpPrincipal.numeroControlePncpCompra ?? parsed.raw)

  // Vigência: intervalo mais abrangente entre todas as ATAs
  let dataVigIniFinal: string | null = null
  let dataVigFimFinal: string | null = null

  for (const { arp, itens, empenhos } of resultadosPorAta) {
    const ataVigIni = normalizeDate(arp.dataVigenciaInicial)
    const ataVigFim = normalizeDate(arp.dataVigenciaFinal)

    if (!dataVigIniFinal || (ataVigIni && ataVigIni < dataVigIniFinal)) dataVigIniFinal = ataVigIni
    if (!dataVigFimFinal || (ataVigFim && ataVigFim > dataVigFimFinal)) dataVigFimFinal = ataVigFim

    for (const item of itens) {
      const numItem = toNum(item.numeroItem)
      if (itensPorNumero.has(numItem)) continue // já mapeado por outra ATA

      const emp = empenhos.get(numItem)
      const qtdLicitada = toNum(
        item.quantidadeHomologadaVencedor ?? item.quantidadeHomologadaItem ?? emp?.quantidadeLicitada ?? 0
      )
      const qtdEmpenhada = emp ? emp.quantidadeEmpenhada : toNum(item.quantidadeEmpenhada ?? 0)
      const saldoRestante = emp ? emp.saldoRestante : Math.max(0, qtdLicitada - qtdEmpenhada)
      const valorUnit = toNum(item.valorUnitario)
      
      // Prioriza unidadeMedida da ATA ou da API. O emp?.unidade muitas vezes retorna a Unidade Compradora (ex: 160518 - BASE...)
      let unidade = toStr(item.unidadeMedida || item.unidade || emp?.unidade || 'UN')
      if (unidade.includes(' - ')) unidade = 'UN' // Fallback caso pegue o nome da UG

      valorTotal += qtdLicitada * valorUnit
      valorEmpenhado += qtdEmpenhada * valorUnit

      itensPorNumero.set(numItem, {
        id_pncp_ata: toStr(arp.numeroControlePncpAta ?? ''),
        numero_ata: toStr(arp.numeroAtaRegistroPreco),
        uasg_gerenciadora: toStr(arp.codigoUnidadeGerenciadora),
        numero_item: numItem,
        descricao: toStr(item.descricaoItem),
        unidade,
        valor_unitario: valorUnit,
        quantidade_licitada: qtdLicitada,
        quantidade_empenhada: qtdEmpenhada,
        saldo_restante: saldoRestante,
        saldo_empenho: saldoRestante,
        data_vigencia_inicial: normalizeDate(item.dataVigenciaInicial) ?? ataVigIni,
        data_vigencia_final: normalizeDate(item.dataVigenciaFinal) ?? ataVigFim,
        data_ultima_atualizacao_api: agora,
        status_pncp: 'Homologado', // Será atualizado depois com os dados reais do PNCP se houver
      })
    }
  }

  // ── Etapa 5: Buscar a lista COMPLETA de itens do PNCP e mesclar ──────────
  try {
    const pncpItens = await buscarTodosItensPncp(parsed.cnpj, parsed.ano, parsed.numero)
    for (const pncp of pncpItens) {
      const existente = itensPorNumero.get(pncp.numeroItem)
      if (existente) {
        // Atualiza o status se achou o item
        existente.status_pncp = pncp.situacaoCompraItemNome ?? existente.status_pncp
      } else {
        // Item deserto, fracassado, cancelado ou não gerou ata
        itensPorNumero.set(pncp.numeroItem, {
          id_pncp_ata: '', // Não tem ATA
          numero_ata: '',
          uasg_gerenciadora: arpPrincipal.codigoUnidadeGerenciadora,
          numero_item: pncp.numeroItem,
          descricao: pncp.descricao,
          unidade: pncp.unidadeMedida || 'UN',
          valor_unitario: toNum(pncp.valorUnitarioEstimado),
          quantidade_licitada: toNum(pncp.quantidade),
          quantidade_empenhada: 0,
          saldo_restante: 0,
          saldo_empenho: 0,
          data_vigencia_inicial: null,
          data_vigencia_final: null,
          data_ultima_atualizacao_api: agora,
          status_pncp: pncp.situacaoCompraItemNome || 'Cancelado/Deserto',
        })
      }
    }
  } catch (err) {
    console.warn('[ComprasGov] Erro ao tentar cruzar itens com PNCP:', err)
  }

  const itens = Array.from(itensPorNumero.values())
    .sort((a, b) => a.numero_item - b.numero_item)

  if (itens.length === 0) {
    throw Object.assign(
      new Error('ATAs localizadas, mas nenhum item foi retornado pela API.'),
      { tipoErro: 'ITENS_VAZIOS' }
    )
  }

  const anoCompra = toNum(arpPrincipal.anoCompra) || parseInt(parsed.ano)

  return {
    pregao: {
      id_pncp_compra: idPncpCompra,
      id_pncp_ata: toStr(arpPrincipal.numeroControlePncpAta ?? ''),
      numero_ata: toStr(arpPrincipal.numeroAtaRegistroPreco),
      uasg_gerenciadora: toStr(arpPrincipal.codigoUnidadeGerenciadora),
      numero_compra: toStr(arpPrincipal.numeroCompra),
      ano_compra: anoCompra,
      objeto: toStr(arpPrincipal.objeto),
      status_ata: toStr(arpPrincipal.statusAta || 'ATIVO'),
      data_vigencia_inicial: dataVigIniFinal,
      data_vigencia_final: dataVigFimFinal,
      data_ultima_atualizacao_api: agora,
      numero_pregao: toStr(arpPrincipal.numeroCompra).includes('/') 
        ? toStr(arpPrincipal.numeroCompra) 
        : `${toStr(arpPrincipal.numeroCompra)}/${anoCompra}`,
      data_vencimento: dataVigFimFinal ?? new Date().toISOString().slice(0, 10),
      valor_total: valorTotal,
      valor_empenhado: valorEmpenhado,
    },
    itens,
    avisoSaldoIndisponivel,
  }
}
