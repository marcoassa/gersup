/**
 * GERSUP — Upsert de pregões e itens importados via PNCP
 *
 * Chaves de idempotência:
 *   - pregoes:    UNIQUE (id_pncp_compra)  — um registro por compra PNCP
 *   - itens_pregao: UNIQUE (id_pncp_compra, numero_item) — um item por número por compra
 */
import { supabase } from '@/lib/supabase'
import type { DadosPregaoPncp } from '@/lib/comprasGovApi'
import type { ApiResult } from '@/lib/api'

export interface UpsertPregaoResult {
  pregaoId: string
  itensNovos: number
  itensAtualizados: number
}

export async function upsertPregaoPncp(
  dados: DadosPregaoPncp
): Promise<ApiResult<UpsertPregaoResult>> {
  const agora = new Date().toISOString()
  const idPncpCompra = dados.pregao.id_pncp_compra

  // ── 1. Upsert do pregão (chave: id_pncp_compra) ───────────────────────────
  const pregaoPayload = {
    ...dados.pregao,
    updated_at: agora,
  }

  const { data: pregaoData, error: pregaoError } = await supabase
    .from('pregoes')
    .upsert(pregaoPayload, {
      onConflict: 'id_pncp_compra',
      ignoreDuplicates: false,
    })
    .select('id')
    .single()

  if (pregaoError) {
    console.error('[Upsert] Erro ao salvar pregão:', pregaoError)
    return { data: null, error: `Erro ao salvar pregão: ${pregaoError.message}` }
  }

  const pregaoId = pregaoData.id as string

  // ── 2. Checar quais itens já existem (para contar novos vs atualizados) ────
  const numerosItem = dados.itens.map(i => i.numero_item)

  const { data: existentes } = await supabase
    .from('itens_pregao')
    .select('numero_item')
    .eq('pregao_id', pregaoId)
    .in('numero_item', numerosItem)

  const numerosExistentes = new Set((existentes ?? []).map(e => e.numero_item as number))
  let itensNovos = 0
  let itensAtualizados = 0

  // ── 3. Upsert dos itens em lotes de 100 ──────────────────────────────────
  const LOTE = 100
  const itensPayload = dados.itens.map(item => ({
    pregao_id: pregaoId,
    id_pncp_compra: idPncpCompra,
    id_pncp_ata: item.id_pncp_ata,
    numero_ata: item.numero_ata,
    uasg_gerenciadora: item.uasg_gerenciadora,
    numero_item: item.numero_item,
    descricao: item.descricao,
    unidade: item.unidade || 'UN',
    valor_unitario: item.valor_unitario,
    quantidade_licitada: item.quantidade_licitada,
    quantidade_empenhada: item.quantidade_empenhada,
    saldo_empenho: item.saldo_restante,
    saldo_restante: item.saldo_restante,
    data_vigencia_inicial: item.data_vigencia_inicial,
    data_vigencia_final: item.data_vigencia_final,
    data_ultima_atualizacao_api: item.data_ultima_atualizacao_api,
    status_pncp: item.status_pncp,
    updated_at: agora,
  }))

  for (let i = 0; i < itensPayload.length; i += LOTE) {
    const lote = itensPayload.slice(i, i + LOTE)

    const { error: itemErr } = await supabase
      .from('itens_pregao')
      .upsert(lote, {
        onConflict: 'pregao_id,numero_item',
        ignoreDuplicates: false,
      })

    if (itemErr) {
      console.error('[Upsert] Erro ao salvar itens:', itemErr)
      return { data: null, error: `Erro ao salvar itens: ${itemErr.message}` }
    }

    for (const item of lote) {
      if (numerosExistentes.has(item.numero_item)) itensAtualizados++
      else itensNovos++
    }
  }

  return {
    data: { pregaoId, itensNovos, itensAtualizados },
    error: null,
  }
}
