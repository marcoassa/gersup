/**
 * Ementário NICAvEx 4002 — Mapeamento Plano Interno ↔ Subitem(s) (SI)
 * ND 3.3.90.30 - MATERIAL DE CONSUMO
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  REGRA DE ORÇAMENTO:                                               │
 * │  O saldo de uma NC é vinculado ao Plano Interno (PI), não ao SI.   │
 * │  Quando um PI cobre múltiplos SIs, o orçamento é COMPARTILHADO.    │
 * │  Ex: E4AVSUNCOLU cobre SI 01 e SI 02 — o budget é um pool único.  │
 * └─────────────────────────────────────────────────────────────────────┘
 */

// ─── PI → SIs (um PI pode cobrir múltiplos Subitens) ─────────────────────────

export const PLANO_INTERNO_TO_SIS: Record<string, string[]> = {
  // Cobre SI 01 (Automotivos) e SI 02 (Aviação) — pool compartilhado
  'E4AVSUNCOLU': ['01', '02'],

  // Cobre SI 04 (Gás) e SI 11 (Material Químico) — pool compartilhado
  'E4AVSUNQUIM': ['04', '11'],

  // Cobre múltiplos SIs "Outros" — pool compartilhado
  'E4AVSUNOUTR': ['13', '22', '26', '27', '28', '29', '35', '36'],

  // Planos com subitem único (SI derivado automaticamente)
  'E4AVSUNSIIN': ['17'],   // Processamento de dados
  'E4AVSUNACEM': ['19'],   // Acondicionamento e embalagem
  'E4AVSUNUNIF': ['23'],   // Uniformes, tecidos e aviamentos
  'E4AVSUNMABI': ['24'],   // Manutenção de bens imóveis
  'E4AVSUNAERO': ['32', '38', '42'], // Suprimento de aviação / Proteção ao voo / Ferramentas — pool
  'E4AVSUNARMA': ['37'],   // Sobressalente de armamento
  'E4AVVTRVASL': ['39'],   // Manutenção de veículos
}

// ─── PI → NC (Nota de Crédito) — atualizar no início de cada exercício ─────────
// Formato sugerido: "NC XXXX/AAAA" ou o número do documento de dotação orçamentária

export const PLANO_INTERNO_TO_NC: Record<string, string> = {
  'E4AVSUNCOLU': '',
  'E4AVSUNQUIM': '',
  'E4AVSUNOUTR': '',
  'E4AVSUNSIIN': '',
  'E4AVSUNACEM': '',
  'E4AVSUNUNIF': '',
  'E4AVSUNMABI': '',
  'E4AVSUNAERO': '',
  'E4AVSUNARMA': '',
  'E4AVVTRVASL': '',
}

export const SI_NAMES: Record<string, string> = {
  '01': 'Combustíveis Automotivos',
  '02': 'Combustível e Lubrificante de Aviação',
  '04': 'Gás Engarrafado',
  '11': 'Material Químico',
  '13': 'Material de Caça e Pesca',
  '17': 'Material de Processamento de Dados',
  '19': 'Material de Acondicionamento e Embalagem',
  '22': 'Material de Limpeza e Produtos de Higienização',
  '23': 'Uniformes, Tecidos e Aviamentos',
  '24': 'Material para Manutenção de Bens Imóveis',
  '26': 'Material Elétrico e Eletrônico',
  '27': 'Material de Manobra e Patrulhamento',
  '28': 'Material de Proteção e Segurança',
  '29': 'Material para Áudio, Vídeo e Foto',
  '32': 'Suprimento de Aviação',
  '35': 'Material Laboratorial',
  '36': 'Material Hospitalar',
  '37': 'Sobressalente de Armamento',
  '38': 'Material de Proteção ao Voo',
  '39': 'Manutenção de Veículos',
  '42': 'Ferramentas',
}

// ─── SI → PI (mapa reverso, construído automaticamente) ──────────────────────

export const SI_TO_PLANO_INTERNO: Record<string, string> = {}

Object.entries(PLANO_INTERNO_TO_SIS).forEach(([pi, sis]) => {
  sis.forEach(si => {
    SI_TO_PLANO_INTERNO[si.padStart(2, '0')] = pi
  })
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retorna os SIs possíveis para um Plano Interno.
 * Retorna array vazio se o PI não for encontrado.
 */
export function getSisFromPlanoInterno(planoInterno: string): string[] {
  return PLANO_INTERNO_TO_SIS[planoInterno.trim().toUpperCase()] ?? []
}

/**
 * Retorna o PI que cobre um determinado SI.
 */
export function getPiFromSi(si: string): string | null {
  return SI_TO_PLANO_INTERNO[si.padStart(2, '0')] ?? null
}

/**
 * Retorna a NC (Nota de Crédito) associada ao PI de um dado SI.
 */
export function getNcFromSi(si: string): string {
  const pi = getPiFromSi(si.padStart(2, '0'))
  if (!pi) return ''
  return PLANO_INTERNO_TO_NC[pi] ?? ''
}

/**
 * Retorna todos os SIs que compartilham o mesmo PI (pool) de um dado SI.
 * Inclui o próprio SI passado.
 */
export function getSisDoMesmoPI(si: string): string[] {
  const pi = getPiFromSi(si)
  if (!pi) return [si]
  return PLANO_INTERNO_TO_SIS[pi] ?? [si]
}

/**
 * Verifica se um SI compartilha orçamento com outros SIs (PI cobre > 1 SI).
 */
export function siTemOrcamentoCompartilhado(si: string): boolean {
  const pi = getPiFromSi(si)
  if (!pi) return false
  return (PLANO_INTERNO_TO_SIS[pi]?.length ?? 0) > 1
}

/**
 * Retorna o SI derivado automaticamente, apenas quando o PI mapeia para exatamente 1 SI.
 * Retorna null se o PI não existir ou mapear para múltiplos SIs.
 */
export function getSiUnicoFromPlanoInterno(planoInterno: string): string | null {
  const sis = getSisFromPlanoInterno(planoInterno)
  return sis.length === 1 ? sis[0] : null
}

/**
 * Lista todos os Planos Internos do ementário, ordenados pelo código.
 */
export function getListaPlanosInternos(): Array<{ planoInterno: string; sis: string[] }> {
  return Object.entries(PLANO_INTERNO_TO_SIS)
    .map(([planoInterno, sis]) => ({ planoInterno, sis }))
    .sort((a, b) => a.planoInterno.localeCompare(b.planoInterno))
}

/**
 * Verifica se um Plano Interno existe no ementário.
 */
export function planoInternoExiste(planoInterno: string): boolean {
  return planoInterno.trim().toUpperCase() in PLANO_INTERNO_TO_SIS
}
