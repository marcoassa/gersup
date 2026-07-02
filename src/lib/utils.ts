import { differenceInDays, parseISO } from 'date-fns'
import type {
  Pregao,
  ItemPregao,
  Fornecimento,
  StatusPregao,
  StatusItem,
  CriticidadeCompra,
  PregaoCard,
  ItemPregaoEnriquecido,
} from '@/types'

// ─── Segurança Numérica ───────────────────────────────────────────────────────

export function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return isFinite(n) ? n : fallback
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !isFinite(denominator)) return fallback
  const result = numerator / denominator
  return isFinite(result) ? result : fallback
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function calcStatusPregao(dataVencimento: string): StatusPregao {
  const hoje = new Date()
  const vencimento = parseISO(dataVencimento)
  const dias = differenceInDays(vencimento, hoje)
  if (dias < 0) return 'VENCIDO'
  if (dias <= 60) return 'A_VENCER'
  return 'ATIVO'
}

export function calcDiasParaVencer(dataVencimento: string): number {
  return differenceInDays(parseISO(dataVencimento), new Date())
}

export function calcStatusItem(item: ItemPregao): StatusItem {
  const saldo = safeNum(item.saldo_empenho)
  const licitado = safeNum(item.quantidade_licitada)
  const empenhado = safeNum(item.quantidade_empenhada)

  // Se nunca houve empenho E saldo é zero, o item simplesmente não foi usado
  // (ex: pregão nunca ativado, item deserto/fracassado).
  // Neste caso, considera DISPONIVEL se o status_pncp indica homologação,
  // ou usa o próprio status_pncp para refletir a situação real.
  if (saldo <= 0 && empenhado <= 0) {
    // Item sem ATA (deserto/fracassado/cancelado) — não é ESGOTADO
    const statusPncp = (item.status_pncp ?? '').toLowerCase()
    if (statusPncp.includes('desert') || statusPncp.includes('fracass') || statusPncp.includes('cancel')) {
      return 'ESGOTADO' // Usa ESGOTADO como proxy para "não disponível" nestes casos
    }
    // Pregão homologado mas nunca usado → ainda disponível
    return 'DISPONIVEL'
  }

  // Saldo esgotado após uso real
  if (saldo <= 0) return 'ESGOTADO'

  if (licitado > 0 && saldo / licitado < 0.1) return 'CRITICO'
  return 'DISPONIVEL'
}

// ─── Pregão Card ──────────────────────────────────────────────────────────────

export function enrichPregao(pregao: Pregao): PregaoCard {
  const valorTotal = safeNum(pregao.valor_total)
  const valorEmpenhado = safeNum(pregao.valor_empenhado)
  const saldoDisponivel = valorTotal - valorEmpenhado
  const percentualEmpenhado = safeDivide(valorEmpenhado * 100, valorTotal)
  const itens = pregao.itens ?? []
  const itensEnriquecidos = itens.map(enrichItem)
  const itensCriticos = itensEnriquecidos.filter(i => i.status_item === 'CRITICO').length
  const itensEsgotados = itensEnriquecidos.filter(i => i.status_item === 'ESGOTADO').length

  let numeroAjustado = pregao.numero_pregao
  if (numeroAjustado && numeroAjustado.includes('/')) {
    const parts = numeroAjustado.split('/')
    if (parts.length > 2) {
      numeroAjustado = `${parts[0]}/${parts[1]}`
    }
  }

  return {
    ...pregao,
    numero_pregao: numeroAjustado,
    status: calcStatusPregao(pregao.data_vencimento),
    percentual_empenhado: percentualEmpenhado,
    saldo_disponivel: saldoDisponivel,
    quantidade_itens: itens.length,
    itens_criticos: itensCriticos,
    itens_esgotados: itensEsgotados,
    dias_para_vencer: calcDiasParaVencer(pregao.data_vencimento),
  }
}

export function enrichItem(item: ItemPregao): ItemPregaoEnriquecido {
  const licitado = safeNum(item.quantidade_licitada)
  const saldo = safeNum(item.saldo_empenho)
  return {
    ...item,
    status_item: calcStatusItem(item),
    percentual_saldo: safeDivide(saldo * 100, licitado),
  }
}

// ─── Consumo / Médias ─────────────────────────────────────────────────────────

export interface ConsumoAnual {
  ano: number
  quantidade: number
}

/**
 * Agrupa fornecimentos por ano e calcula consumo total por ano.
 */
export function agruparPorAno(fornecimentos: Fornecimento[]): ConsumoAnual[] {
  const map = new Map<number, number>()
  for (const f of fornecimentos) {
    const atual = map.get(f.ano) ?? 0
    map.set(f.ano, atual + safeNum(f.quantidade))
  }
  return Array.from(map.entries())
    .map(([ano, quantidade]) => ({ ano, quantidade }))
    .sort((a, b) => a.ano - b.ano)
}

/**
 * Calcula média simples anual.
 */
export function mediaSimples(consumoAnual: ConsumoAnual[]): number {
  if (consumoAnual.length === 0) return 0
  const total = consumoAnual.reduce((s, c) => s + c.quantidade, 0)
  return safeDivide(total, consumoAnual.length)
}

/**
 * Calcula média ponderada dando mais peso aos anos mais recentes.
 * Ano mais antigo: peso 1, depois 2, 3, 4, 5, ...
 */
export function mediaPonderada(consumoAnual: ConsumoAnual[]): number {
  if (consumoAnual.length === 0) return 0
  const ordenado = [...consumoAnual].sort((a, b) => a.ano - b.ano)
  let somaPonderada = 0
  let somaPesos = 0
  ordenado.forEach((c, idx) => {
    const peso = idx + 1
    somaPonderada += c.quantidade * peso
    somaPesos += peso
  })
  return safeDivide(somaPonderada, somaPesos)
}

/**
 * Calcula anos com consumo dentro do range dos últimos N anos a partir do ano mais recente.
 */
export function anosComConsumoNosUltimosN(
  consumoAnual: ConsumoAnual[],
  n: number
): number {
  if (consumoAnual.length === 0) return 0
  const anoAtual = new Date().getFullYear()
  const anoInicio = anoAtual - n
  const anosNoRange = consumoAnual.filter(c => c.ano > anoInicio && c.quantidade > 0)
  return anosNoRange.length
}

/**
 * Calcula cobertura em meses.
 */
export function calcCobertura(estoqueTotal: number, mediaMonsal: number): number {
  return safeDivide(estoqueTotal, mediaMonsal, 9999)
}

/**
 * Retorna criticidade com base na cobertura em meses.
 */
export function calcCriticidade(coberturaMeses: number, temHistorico: boolean): CriticidadeCompra {
  if (!temHistorico) return 'SEM_HIST'
  if (coberturaMeses <= 2) return 'CRITICO'
  if (coberturaMeses <= 6) return 'BAIXO'
  if (coberturaMeses <= 12) return 'NORMAL'
  return 'ALTO'
}

/**
 * Quantidade sugerida para atingir cobertura alvo (em meses).
 */
export function calcQuantidadeSugerida(
  mediaMonsal: number,
  coberturaAlvo: number,
  estoqueAtual: number,
  saldoPregoes: number
): number {
  const necessario = mediaMonsal * coberturaAlvo
  const disponivel = estoqueAtual + saldoPregoes
  return Math.max(0, Math.ceil(necessario - disponivel))
}

// ─── Formatação ───────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR').format(parseISO(dateStr))
  } catch {
    return dateStr
  }
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 1)}%`
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Filtra consumo recorrente: consumo em pelo menos minAnos dos últimos 4 anos
 * e média mensal >= mediaMin.
 */
export function isConsumoRecorrente(
  consumoAnual: ConsumoAnual[],
  minAnos: number,
  mediaMin: number
): boolean {
  const anosRecentes = anosComConsumoNosUltimosN(consumoAnual, 4)
  if (anosRecentes < minAnos) return false
  const media = mediaPonderada(consumoAnual)
  const mediaMensal = safeDivide(media, 12)
  return mediaMensal >= mediaMin
}

// ─── Ementário de Subitens (SI) — ND 30 ──────────────────────────────────────

export const MAPA_SI_TITULOS: Record<string, string> = {
  '01': 'COMBUSTÍVEIS E LUBRIFICANTES AUTOMOTIVOS',
  '02': 'COMBUSTÍVEL E LUBRIFICANTE DE AVIAÇÃO',
  '04': 'GÁS ENGARRAFADO',
  '11': 'MATERIAL QUÍMICO',
  '13': 'MATERIAL DE CAÇA E PESCA',
  '16': 'MATERIAL DE EXPEDIENTE',
  '17': 'MATERIAL DE PROCESSAMENTO DADOS',
  '19': 'MATERIAL DE ACONDICIONAMENTO E EMBALAGEM',
  '22': 'MATERIAL DE LIMPEZA E PRODUTOS DE HIGIENIZAÇÃO',
  '23': 'UNIFORMES, TECIDOS E AVIAMENTOS',
  '24': 'MATERIAL PARA MANUTENÇÃO DE BENS IMÓVEIS',
  '26': 'MATERIAL ELÉTRICO E ELETRÔNICO',
  '27': 'MATERIAL DE MANOBRA E PATRULHAMENTO',
  '28': 'MATERIAL DE PROTEÇÃO E SEGURANÇA',
  '29': 'MATERIAL PARA ÁUDIO, VÍDEO E FOTO',
  '32': 'SUPRIMENTO DE AVIAÇÃO',
  '35': 'MATERIAL LABORATORIAL',
  '36': 'MATERIAL HOSPITALAR',
  '37': 'SOBRESSALENTE DE ARMAMENTO',
  '38': 'SUPRIMENTO DE PROTEÇÃO AO VOO',
  '57': 'SERVIÇOS DE PROCESSAMENTO DE DADOS',
  '39': 'MATERIAL PARA MANUTENÇÃO DE VEÍCULOS',
  '42': 'FERRAMENTAS',
}

export function getSiTitulo(si: string | null | undefined): string {
  if (!si) return ''
  const clean = si.trim()
  const padSi = clean.length === 1 ? `0${clean}` : clean
  return MAPA_SI_TITULOS[padSi] ?? ''
}

/**
 * Extrai o título curto de um item de pregão.
 *
 * Suporta dois formatos principais vindos do PNCP:
 *
 * Formato A — com categoria:
 *   "CATEGORIA, NOME ESPECÍFICO DO ITEM, com as seguintes características: ..."
 *   → retorna "NOME ESPECÍFICO DO ITEM" (último segmento antes de ", com")
 *
 * Formato B — direto:
 *   "NOME COMPLETO DO ITEM, com as seguintes características: ..."
 *   → retorna "NOME COMPLETO DO ITEM"
 *
 * Formato C — sem padrão "com as seguintes":
 *   "NOME, atributo1, atributo2, ..."
 *   → retorna o primeiro segmento (antes da primeira vírgula)
 */
export function extrairTituloItem(descricao: string | null | undefined): string {
  if (!descricao) return '—'
  const d = descricao.trim()

  // 1. Procura pelo separador ", com " (padrão principal do PNCP)
  //    Ex: "TRINCHA, TRINCHA DE 1\", com as seguintes características:..."
  //    Ex: "ETIQUETA DE IDENTIFICAÇÃO DE MATERIAL CONDENADO (VERMELHO), com as seguintes..."
  const matchCom = /,\s*com\s+/i.exec(d)
  if (matchCom) {
    // Retorna tudo o que vem antes do ", com " exatamente como está.
    // Ex: "ETIQUETA DE IDENTIFICAÇÃO DE MATERIAL CONDENADO (VERMELHO)"
    return d.slice(0, matchCom.index).trim()
  }

  // 2. Fallback: não encontrou ", com " — tenta incluir os 2 primeiros segmentos
  //    para dar mais contexto quando todas as descrições têm o mesmo prefixo.
  //    Ex: "ETIQUETA IDENTIFICAÇÃO, MATERIAL PAPEL ADESIVO, COR BRANCA..."
  //    → "ETIQUETA IDENTIFICAÇÃO, MATERIAL PAPEL ADESIVO"
  const idxVirgula = d.indexOf(',')
  if (idxVirgula > 0) {
    const seg1 = d.slice(0, idxVirgula).trim()
    const resto = d.slice(idxVirgula + 1).trim()
    const idxVirgula2 = resto.indexOf(',')
    if (idxVirgula2 > 0) {
      const seg2 = resto.slice(0, idxVirgula2).trim()
      const dois = `${seg1}, ${seg2}`
      return dois.length > 90 ? dois.slice(0, 87) + '…' : dois
    }
    // Só tem um segmento — retorna ele + trunca o resto se for diferente
    const completo = `${seg1}, ${resto}`
    return completo.length > 90 ? completo.slice(0, 87) + '…' : completo
  }

  // 3. Sem vírgula alguma — trunca em 80 chars
  return d.length > 80 ? d.slice(0, 80) + '…' : d
}
