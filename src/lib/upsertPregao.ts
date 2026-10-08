/**
 * GERSUP — Upsert de pregões e itens importados via PNCP
 *
 * Chaves de idempotência:
 *   - pregoes:    UNIQUE (id_pncp_compra)  — um registro por compra PNCP
 *   - itens_pregao: UNIQUE (id_pncp_compra, numero_item) — um item por número por compra
 */
import { supabase } from '@/lib/supabase'
import type { DadosPregaoPncp } from '@/lib/comprasGovApi'
import { buscarFornecedorVencedorItem } from '@/lib/comprasGovApi'
import type { ApiResult } from '@/lib/api'

export interface UpsertPregaoResult {
  pregaoId: string
  itensNovos: number
  itensAtualizados: number
  numero_pregao?: string
  objeto?: string
}

export async function upsertPregaoPncp(
  dados: DadosPregaoPncp
): Promise<ApiResult<UpsertPregaoResult>> {
  const agora = new Date().toISOString()
  const idPncpCompra = dados.pregao.id_pncp_compra

  // ── 1. Upsert do pregão (chave: id_pncp_compra) ───────────────────────────
  // Verifica se o pregão já existe atrelado a este ID da contratação (id_pncp_compra).
  // Se existir, preserva numero_pregao e objeto (descrição) editados/customizados no sistema.
  const { data: pregaoExistente, error: errExistente } = await supabase
    .from('pregoes')
    .select('id, numero_pregao, objeto, nup, observacoes')
    .eq('id_pncp_compra', idPncpCompra)
    .maybeSingle()

  if (errExistente) {
    console.warn('[Upsert] Aviso ao buscar pregão existente:', errExistente.message)
  }

  const numeroPregaoFinal = pregaoExistente?.numero_pregao || dados.pregao.numero_pregao
  const objetoFinal = pregaoExistente?.objeto || dados.pregao.objeto

  const pregaoPayload = {
    ...dados.pregao,
    numero_pregao: numeroPregaoFinal,
    objeto: objetoFinal,
    nup: pregaoExistente?.nup ?? undefined,
    observacoes: pregaoExistente?.observacoes ?? null,
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

  // ── 2. Checar quais itens já existem (para preservar empenhos e dados locais) ────
  const { data: existentes } = await supabase
    .from('itens_pregao')
    .select('id, numero_item, quantidade_empenhada, saldo_empenho, cd_comp_master, descricao_tr')
    .eq('pregao_id', pregaoId)

  const existentesMap = new Map<number, { id: string; quantidade_empenhada: number; saldo_empenho: number; cd_comp_master?: string | null; descricao_tr?: string | null }>()
  for (const e of existentes ?? []) {
    existentesMap.set(e.numero_item as number, e as any)
  }

  // ── 2b. Buscar empenhos consolidados de pedidos finalizados para este pregão ──
  const empenhosPedidosMap = new Map<number, number>()
  try {
    const { data: pedidosFinalizados } = await supabase
      .from('pedidos_compra')
      .select('id')
      .eq('status', 'FINALIZADO')

    const idsFinalizados = new Set((pedidosFinalizados ?? []).map(p => p.id))
    if (idsFinalizados.size > 0) {
      const { data: itensPedidos } = await supabase
        .from('itens_pedido_compra')
        .select('numero_item, quantidade, pedido_id, numero_pregao, item_pregao_id')

      for (const ip of itensPedidos ?? []) {
        if (!idsFinalizados.has(ip.pedido_id)) continue
        const numP = (ip.numero_pregao || '').trim()
        const pregaoNum = (numeroPregaoFinal || '').trim()
        const matchPregao = numP && pregaoNum && (numP === pregaoNum || numP.replace(/^0+/, '') === pregaoNum.replace(/^0+/, ''))
        const matchItem = ip.item_pregao_id && existentesMap.has(ip.numero_item) && existentesMap.get(ip.numero_item)?.id === ip.item_pregao_id

        if ((matchPregao || matchItem) && ip.numero_item) {
          empenhosPedidosMap.set(ip.numero_item, (empenhosPedidosMap.get(ip.numero_item) || 0) + Number(ip.quantidade || 0))
        }
      }
    }
  } catch (errPed) {
    console.warn('[Upsert] Erro ao consultar pedidos finalizados:', errPed)
  }

  let itensNovos = 0
  let itensAtualizados = 0

  // ── 3. Buscar fornecedor vencedor por item via API PNCP (em paralelo, lotes de 5) ──
  const LOTE_FORNECEDOR = 5
  const fornecedoresPorItem = new Map<number, { nome: string; cnpj: string }>()

  if (dados.pregao.id_pncp_compra) {
    for (let i = 0; i < dados.itens.length; i += LOTE_FORNECEDOR) {
      const lote = dados.itens.slice(i, i + LOTE_FORNECEDOR)
      const resultados = await Promise.all(
        lote.map(item =>
          buscarFornecedorVencedorItem(dados.pregao.id_pncp_compra, item.numero_item)
            .then(f => ({ numero_item: item.numero_item, fornecedor: f }))
        )
      )
      for (const r of resultados) {
        if (r.fornecedor) fornecedoresPorItem.set(r.numero_item, r.fornecedor)
      }
    }
  }

  // ── 4. Upsert dos itens em lotes de 100 ──────────────────────────────────
  const LOTE = 100
  let totalEmpenhadoConsolidado = 0

  const itensPayload = dados.itens.map(item => {
    const forn = fornecedoresPorItem.get(item.numero_item)
    const existente = existentesMap.get(item.numero_item)
    
    const qtdApi = Number(item.quantidade_empenhada) || 0
    const qtdExistente = Number(existente?.quantidade_empenhada) || 0
    const qtdPedidos = empenhosPedidosMap.get(item.numero_item) || 0

    // Preserva o maior valor de empenho disponível (API, banco ou pedidos finalizados)
    const qtdFinal = Math.max(qtdApi, qtdExistente, qtdPedidos)
    const qtdLic = Number(item.quantidade_licitada) || 0
    const saldoFinal = Math.max(0, qtdLic - qtdFinal)
    const valUnit = Number(item.valor_unitario) || 0

    totalEmpenhadoConsolidado += qtdFinal * valUnit

    return ({
      pregao_id: pregaoId,
      id_pncp_compra: idPncpCompra,
      id_pncp_ata: item.id_pncp_ata,
      numero_ata: item.numero_ata,
      uasg_gerenciadora: item.uasg_gerenciadora,
      numero_item: item.numero_item,
      descricao: item.descricao,
      descricao_tr: existente?.descricao_tr ?? null,
      cd_comp_master: existente?.cd_comp_master ?? null,
      unidade: item.unidade || 'UN',
      valor_unitario: valUnit,
      quantidade_licitada: qtdLic,
      quantidade_empenhada: qtdFinal,
      saldo_empenho: saldoFinal,
      saldo_restante: saldoFinal,
      data_vigencia_inicial: item.data_vigencia_inicial,
      data_vigencia_final: item.data_vigencia_final,
      data_ultima_atualizacao_api: item.data_ultima_atualizacao_api,
      status_pncp: item.status_pncp,
      fornecedor_nome: forn?.nome ?? null,
      fornecedor_cnpj: forn?.cnpj ?? null,
      updated_at: agora,
    })
  })

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
      if (existentesMap.has(item.numero_item)) itensAtualizados++
      else itensNovos++
    }
  }

  // ── 5. Atualizar o valor_empenhado consolidado no cabeçalho do pregão ─────
  await supabase
    .from('pregoes')
    .update({
      valor_empenhado: +totalEmpenhadoConsolidado.toFixed(2),
      updated_at: agora,
    })
    .eq('id', pregaoId)

  return {
    data: { pregaoId, itensNovos, itensAtualizados, numero_pregao: numeroPregaoFinal, objeto: objetoFinal },
    error: null,
  }
}
