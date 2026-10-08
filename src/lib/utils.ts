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
  const itens = pregao.itens ?? []
  let valorTotal = safeNum(pregao.valor_total)
  // Fallback: se valor_total estiver 0 mas houver itens, calcula a partir dos itens homologados
  if (valorTotal === 0 && itens.length > 0) {
    valorTotal = itens
      .filter(i => !i.status_pncp || ['Homologado', 'Adjudicado'].includes(i.status_pncp))
      .reduce((acc, i) => acc + (safeNum(i.quantidade_licitada) * safeNum(i.valor_unitario)), 0)
  }
  const valorEmpenhado = safeNum(pregao.valor_empenhado)
  const saldoDisponivel = valorTotal - valorEmpenhado
  const percentualEmpenhado = safeDivide(valorEmpenhado * 100, valorTotal)
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
  let d = descricao.trim()
  // Limpa prefixos de data de cabeçalho OCR/PDF (ex: "maio/2023 ")
  d = d.replace(/^(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/\d{4}\s+/i, '')

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

export interface ProdutoReferenciaTR {
  titulo: string
  ref: string | null
  marca: string | null
}

/**
 * Extrai o produto de referência e detalhes contidos no Termo de Referência (TR).
 * Retorna o título conciso do item, a referência (código/modelo/produto referência) e a marca/fabricante.
 */
export function extrairProdutoReferenciaTr(descricaoTr: string | null | undefined): ProdutoReferenciaTR | null {
  if (!descricaoTr || !descricaoTr.trim()) return null

  // 1. Procura por Referência / Produto Referência
  const mRef = descricaoTr.match(/(?:^|\n|[\s;.-])(?:⭐\s*)?(?:PRODUTO\s+)?Refer[eê]ncia\s*:\s*([^;\n]+)/i)
  let ref = mRef ? mRef[1].trim() : null
  if (ref) {
    ref = ref.replace(/\s*(?:Marca|Fabricante|Prazo|Embalagem).*$/i, '').trim()
    ref = ref.replace(/^[-\s]+/, '').trim()
  }

  // 2. Procura por Marca / Fabricante
  const mMarca = descricaoTr.match(/(?:^|\n|[\s;.-])(?:Marca|Fabricante|Marca\/Fabricante)\s*:\s*([^;\n]+)/i)
  let marca = mMarca ? mMarca[1].trim() : null
  if (marca) {
    marca = marca.replace(/\s*(?:Prazo|Validade|Embalagem|Referência).*$/i, '').trim()
    marca = marca.replace(/^[-\s]+/, '').trim()
  }

  // 3. Título do item no TR
  const titulo = extrairTituloItem(descricaoTr)

  return {
    titulo,
    ref,
    marca,
  }
}

/**
 * Extrai APENAS o modelo e marca de referência contidos no Termo de Referência.
 * Se houver modelo (referência) e marca, retorna ambos de forma concisa (ex: "Bpto 2197 — Air BP" ou "LOCTITE 242").
 * Se não houver TR extraído, retorna "SEM TERMO DE REFERENCIA".
 */
export function extrairModeloMarcaRef(descricaoTr: string | null | undefined): string {
  if (!descricaoTr || !descricaoTr.trim()) return 'SEM TERMO DE REFERENCIA'

  const tr = descricaoTr.trim()

  // 1. Procura por Referência / Produto Referência
  const mRef = tr.match(/(?:^|\n|[\s;.-])(?:⭐\s*)?(?:PRODUTO\s+)?Refer[eê]ncia\s*:\s*([^;\n]+)/i)
  let ref = mRef ? mRef[1].trim() : null
  if (ref) {
    ref = ref.replace(/\s*(?:Marca|Fabricante|Prazo|Embalagem|IDH).*$/i, '').trim()
    ref = ref.replace(/^[-\s.:]+/, '').trim()
  }

  // 2. Procura por Marca / Fabricante
  const mMarca = tr.match(/(?:^|\n|[\s;.-])(?:Marca|Fabricante|Marca\/Fabricante)\s*:\s*([^;\n]+)/i)
  let marca = mMarca ? mMarca[1].trim() : null
  if (marca) {
    marca = marca.replace(/\s*(?:Prazo|Validade|Embalagem|Referência|IDH).*$/i, '').trim()
    marca = marca.replace(/^[-\s.:]+/, '').trim()
  }

  // Limpa ruídos jurídicos/padrão
  const limpaBoilerplate = (s: string) => {
    return s
      .replace(/\s*\(\s*(?:ou\s+)?similar(?:\s+ou\s+superior)?\s*\)/gi, '')
      .replace(/\s*\(\s*EXCLUSIVAMENTE\s*\)/gi, '')
      .replace(/\s*\(\s*padroniza[cç][aã]o\s*\)/gi, '')
      .replace(/\s*\(\s*conforme\s+manual[^)]*\)/gi, '')
      .replace(/\s*;\s*$/, '')
      .replace(/\s*\.\s*$/, '')
      .trim()
  }

  const refLimpa = ref ? limpaBoilerplate(ref) : null
  const marcaLimpa = marca ? limpaBoilerplate(marca) : null

  if (refLimpa && marcaLimpa) {
    if (refLimpa.toLowerCase().includes(marcaLimpa.toLowerCase())) {
      return refLimpa
    }
    if (marcaLimpa.toLowerCase().includes(refLimpa.toLowerCase())) {
      return marcaLimpa
    }
    return `${refLimpa} — ${marcaLimpa}`
  }

  if (refLimpa) return refLimpa
  if (marcaLimpa) return marcaLimpa

  // Fallback: se não tiver linha específica de Referência/Marca no TR, pega o título conciso do TR
  let d = tr
  d = d.replace(/^(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/\d{4}\s+/i, '')
  const matchCom = /,\s*com\s+/i.exec(d)
  if (matchCom) {
    return d.slice(0, matchCom.index).trim()
  }
  const idxVirgula = d.indexOf(',')
  if (idxVirgula > 0) {
    return d.slice(0, idxVirgula).trim()
  }
  return d.length > 60 ? d.slice(0, 60) + '…' : d
}


/**
 * Extrai resumo conciso do Termo de Referência para exibição em menus flutuantes / tooltips.
 * Mantém o início da descrição técnica, ignora os detalhes intermediários excessivos ([...])
 * e garante a exibição do bloco final com Embalagem, Produto Referência e Marca/Fabricante.
 */
export function extrairResumoTR(texto: string | null | undefined): string {
  if (!texto) return ''
  let limpo = texto.replace(/\r\n/g, '\n').trim()

  // Limpa ruídos ou cabeçalhos repetidos de OCR/PDF
  limpo = limpo
    .replace(/Lic\s*–?\s*Aquisições[^\n]*\n?/gi, '')
    .replace(/ão e Inovação\n?/gi, '')
    .replace(/^\s*de\s*$\n?/gim, '')

  // Se o texto for curto (sem grandes detalhes técnicos), retorna direto
  if (limpo.length <= 150) return limpo

  // Localizar o bloco final: Embalagem, Referência, Marca, Fabricante, P/N
  const matchFinal = limpo.search(/(?:^|\n|[\s;.-])(?:Embalagem|Refer[eê]ncia|Marca|Fabricante|Marca\/Fabricante|P\/N)\s*:/i)

  // Se não encontrar nenhuma dessas palavras-chave finais, retorna o texto original
  if (matchFinal === -1) return limpo

  // 1. Início da descrição técnica
  let inicio = ''
  const matchCom = limpo.match(/^([\s\S]*?(?:,\s*com as seguintes[\s\S]*?caracter[ií]sticas:?|\n\n|[.;]\s*\n))/i)
  if (matchCom && matchCom[1].length < 350) {
    inicio = matchCom[1].trim()
  } else {
    const linhas = limpo.split('\n').filter(l => l.trim().length > 0)
    inicio = linhas.slice(0, 2).join('\n')
    if (inicio.length > 250) inicio = inicio.slice(0, 240) + '...'
  }

  let blocoFinal = limpo.slice(matchFinal).trim().replace(/^[\s;.-]+/, '')

  // Destaca a linha de Referência / Produto Referência
  blocoFinal = blocoFinal.replace(
    /(?:^|\n)(?:⭐\s*)?(?:PRODUTO\s+)?Refer[eê]ncia\s*:\s*(.*)/i,
    (_m, p1) => `\n⭐ PRODUTO REFERÊNCIA: ${p1.trim()}`
  )

  // Evitar duplicação se o bloco final já estiver dentro do início
  if (blocoFinal && !inicio.toLowerCase().includes(blocoFinal.slice(0, Math.min(25, blocoFinal.length)).toLowerCase())) {
    return `${inicio}\n\n[...]\n\n${blocoFinal}`
  }

  return limpo
}

/**
 * Extrai o número da NC (se existir na tag [NC: ...]) e o texto limpo da observação.
 */
export function extrairNcDeObservacoes(obs: string | null | undefined): { numeroNc: string | null; textoLimpo: string } {
  if (!obs) return { numeroNc: null, textoLimpo: '' }
  const match = obs.match(/\[NC:\s*([A-Za-z0-9_-]+)\]/i)
  if (match) {
    const numeroNc = match[1].trim()
    const textoLimpo = obs.replace(match[0], '').trim()
    return { numeroNc, textoLimpo }
  }
  return { numeroNc: null, textoLimpo: obs.trim() }
}

/**
 * Formata a string de observações preservando a tag [NC: ...].
 */
export function formatarObservacoesComNc(texto: string | null | undefined, numeroNc: string | null | undefined): string | null {
  const limpo = (texto || '').replace(/\[NC:\s*([A-Za-z0-9_-]+)\]/gi, '').trim()
  if (numeroNc && numeroNc.trim()) {
    return `[NC: ${numeroNc.trim()}] ${limpo}`.trim()
  }
  return limpo || null
}

