/**
 * GERSUP — Camada de API Supabase
 * Todas as queries ao banco ficam centralizadas aqui.
 */
import { supabase } from '@/lib/supabase'
import type { Pregao, ItemPregao, Produto, Estoque, Fornecimento, PedidoCompra, ItemCarrinhoEnriquecido, StatusPedidoCompra, Fornecedor, FornecedorConsolidado } from '@/types'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface ApiResult<T> {
  data: T | null
  error: string | null
}

// ─── Fornecedores ─────────────────────────────────────────────────────────────

const IMPEDIDOS_STORAGE_KEY = 'gersup_fornecedores_impedidos'

export interface FornecedorImpedidoInfo {
  impedido: boolean
  motivo: string | null
  updated_at?: string
}

export function getImpedidosLocalStorage(): Record<string, FornecedorImpedidoInfo> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(IMPEDIDOS_STORAGE_KEY) : null
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function setImpedidosLocalStorage(cleanCnpj: string, info: FornecedorImpedidoInfo) {
  try {
    if (typeof window === 'undefined') return
    const current = getImpedidosLocalStorage()
    if (info.impedido) {
      current[cleanCnpj] = info
    } else {
      delete current[cleanCnpj]
    }
    localStorage.setItem(IMPEDIDOS_STORAGE_KEY, JSON.stringify(current))
    window.dispatchEvent(new CustomEvent('gersup_fornecedores_impedidos_change', { detail: { cleanCnpj, info } }))
  } catch (err) {
    console.error('Erro ao salvar impedimento no localStorage:', err)
  }
}

export function getFornecedoresImpedidosMapSync(): Map<string, { impedido: boolean; motivo: string | null }> {
  const map = new Map<string, { impedido: boolean; motivo: string | null }>()
  const local = getImpedidosLocalStorage()
  for (const [cleanCnpj, item] of Object.entries(local)) {
    if (item.impedido) {
      map.set(cleanCnpj, { impedido: true, motivo: item.motivo })
    }
  }
  return map
}

export async function getFornecedoresImpedidosMap(): Promise<Map<string, { impedido: boolean; motivo: string | null }>> {
  const map = getFornecedoresImpedidosMapSync()
  try {
    const { data } = await supabase.from('fornecedores').select('cnpj, impedido_empenho, motivo_impedimento')
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (row.cnpj) {
          const clean = row.cnpj.replace(/\D/g, '')
          if (row.impedido_empenho) {
            map.set(clean, { impedido: true, motivo: row.motivo_impedimento || null })
          } else if (!map.has(clean)) {
            map.delete(clean)
          }
        }
      })
    }
  } catch {
    // Ignora erro caso a coluna não exista no Supabase
  }
  return map
}

export async function getFornecedores(): Promise<ApiResult<Fornecedor[]>> {
  const { data, error } = await supabase.from('fornecedores').select('*').order('razao_social')
  return { data: (data as any) || [], error: error?.message ?? null }
}

export async function getFornecedoresConsolidados(): Promise<ApiResult<FornecedorConsolidado[]>> {
  try {
    let fornecedoresDb: any[] = []
    try {
      const { data } = await supabase.from('fornecedores').select('*')
      if (data) fornecedoresDb = data
    } catch {
      fornecedoresDb = []
    }

    const { data: itens, error: itensErr } = await supabase
      .from('itens_pregao')
      .select('fornecedor_cnpj, fornecedor_nome, pregao_id, pregoes(numero_pregao)')

    if (itensErr) {
      console.warn('Erro ao buscar itens de pregão para fornecedores:', itensErr)
    }

    const localImpedidos = getImpedidosLocalStorage()
    const consolidadoMap = new Map<string, FornecedorConsolidado>()

    fornecedoresDb.forEach(f => {
      if (!f.cnpj) return
      const clean = f.cnpj.replace(/\D/g, '')
      const local = localImpedidos[clean]
      const impedido = local !== undefined ? local.impedido : !!f.impedido_empenho
      const motivo = local !== undefined ? local.motivo : f.motivo_impedimento

      consolidadoMap.set(clean, {
        id: f.id,
        cnpj: f.cnpj,
        clean_cnpj: clean,
        razao_social: f.razao_social || 'Razão Social não informada',
        nome_fantasia: f.nome_fantasia,
        contato: f.contato,
        email: f.email,
        impedido_empenho: impedido,
        motivo_impedimento: motivo || null,
        total_itens: 0,
        total_pregoes: 0,
        pregoes: [],
      })
    })

    const pregoesSetPorCnpj = new Map<string, Set<string>>()

    ;(itens || []).forEach((it: any) => {
      if (!it.fornecedor_cnpj) return
      const clean = it.fornecedor_cnpj.replace(/\D/g, '')
      if (!clean) return

      if (!pregoesSetPorCnpj.has(clean)) {
        pregoesSetPorCnpj.set(clean, new Set())
      }
      if (it.pregoes?.numero_pregao) {
        pregoesSetPorCnpj.get(clean)!.add(it.pregoes.numero_pregao)
      }

      if (!consolidadoMap.has(clean)) {
        const local = localImpedidos[clean]
        consolidadoMap.set(clean, {
          cnpj: it.fornecedor_cnpj,
          clean_cnpj: clean,
          razao_social: it.fornecedor_nome || 'Empresa Vencedora em Pregão',
          impedido_empenho: !!local?.impedido,
          motivo_impedimento: local?.motivo || null,
          total_itens: 1,
          total_pregoes: 0,
          pregoes: [],
        })
      } else {
        const existing = consolidadoMap.get(clean)!
        existing.total_itens += 1
        if (!existing.razao_social || existing.razao_social === 'Razão Social não informada') {
          if (it.fornecedor_nome) existing.razao_social = it.fornecedor_nome
        }
      }
    })

    consolidadoMap.forEach((item, clean) => {
      const pSet = pregoesSetPorCnpj.get(clean)
      if (pSet) {
        item.pregoes = Array.from(pSet).sort()
        item.total_pregoes = item.pregoes.length
      }
    })

    const lista = Array.from(consolidadoMap.values()).sort((a, b) =>
      a.razao_social.localeCompare(b.razao_social, 'pt-BR')
    )

    return { data: lista, error: null }
  } catch (err: any) {
    return { data: [], error: err?.message || 'Erro ao consolidar fornecedores' }
  }
}

export async function atualizarImpedimentoFornecedor(
  cnpj: string,
  impedido: boolean,
  motivo: string | null,
  razaoSocial?: string
): Promise<ApiResult<null>> {
  const clean = cnpj.replace(/\D/g, '')
  if (!clean) return { data: null, error: 'CNPJ inválido' }

  // 1. Atualiza localStorage imediatamente
  setImpedidosLocalStorage(clean, {
    impedido,
    motivo: impedido ? (motivo?.trim() || 'Empresa impedida de empenho') : null,
    updated_at: new Date().toISOString(),
  })

  // 2. Tenta atualizar ou inserir no Supabase
  try {
    const { data: existente } = await supabase
      .from('fornecedores')
      .select('id')
      .eq('cnpj', cnpj)
      .maybeSingle()

    if (existente?.id) {
      await supabase
        .from('fornecedores')
        .update({
          impedido_empenho: impedido,
          motivo_impedimento: impedido ? motivo?.trim() : null,
        } as any)
        .eq('id', existente.id)
    } else {
      await supabase
        .from('fornecedores')
        .insert({
          cnpj,
          razao_social: razaoSocial || 'Fornecedor',
          impedido_empenho: impedido,
          motivo_impedimento: impedido ? motivo?.trim() : null,
        } as any)
    }
  } catch (err) {
    console.warn('Persistência no Supabase com fallback para localStorage ativo:', err)
  }

  return { data: null, error: null }
}

// ─── Pregões ──────────────────────────────────────────────────────────────────

export async function getPregoes(): Promise<ApiResult<Pregao[]>> {
  const { data, error } = await supabase
    .from('pregoes')
    .select(`
      *,
      itens:itens_pregao(*)
    `)
    .order('data_vencimento', { ascending: true })

  return {
    data: data as Pregao[] | null,
    error: error?.message ?? null,
  }
}

export async function getPregaoById(id: string): Promise<ApiResult<Pregao>> {
  const { data, error } = await supabase
    .from('pregoes')
    .select(`
      *,
      itens:itens_pregao(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return {
      data: null,
      error: error?.message ?? null,
    }
  }

  const pregao = data as Pregao

  // Buscar dados dos produtos MASTER vinculados
  const cdCompMasters = Array.from(
    new Set(
      (pregao.itens || [])
        .map(i => i.cd_comp_master)
        .filter((cd): cd is string => !!cd)
    )
  )

  if (cdCompMasters.length > 0) {
    const { data: produtos } = await supabase
      .from('produtos')
      .select('cd_comp, pn, mpn, nomenclatura, cm')
      .in('cd_comp', cdCompMasters)
    
    if (produtos && produtos.length > 0) {
      const prodMap = new Map(produtos.map(p => [p.cd_comp, p]))
      pregao.itens?.forEach(item => {
        if (item.cd_comp_master && prodMap.has(item.cd_comp_master)) {
          const prod = prodMap.get(item.cd_comp_master) as any
          item.produto = prod
          item.cm = prod?.cm ?? item.cm ?? null
        }
      })
    }
  }

  return {
    data: pregao,
    error: null,
  }
}

export async function searchItensGlobais(query: string, incluirVencidos: boolean = false): Promise<ApiResult<any[]>> {
  if (!query || query.trim().length < 2) return { data: [], error: null }

  const clean = query.trim().replace(/[,()]/g, '')
  if (!clean) return { data: [], error: null }
  
  let q = supabase
    .from('itens_pregao')
    .select(`
      id,
      numero_item,
      descricao,
      descricao_tr,
      cd_comp_master,
      pregao_id,
      pregoes!inner (
        id,
        numero_pregao,
        objeto,
        data_vencimento
      )
    `)
    .or(`descricao.ilike.%${clean}%,descricao_tr.ilike.%${clean}%,cd_comp_master.ilike.%${clean}%`)

  const { data, error } = await q.limit(50)

  let itens = data || []
  if (!incluirVencidos && itens.length > 0) {
    const hojeStr = new Date().toISOString().split('T')[0]
    itens = itens.filter((i: any) => !i.pregoes?.data_vencimento || i.pregoes.data_vencimento >= hojeStr)
  }

  return {
    data: itens,
    error: error?.message ?? null,
  }
}

export async function updatePregao(
  id: string,
  updates: Partial<Pick<Pregao, 'objeto' | 'data_vencimento' | 'observacoes' | 'nup' | 'numero_pregao'>>
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('pregoes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return { data: null, error: error.message }
  }

  // Se o número do pregão foi atualizado, sincroniza nos itens de pedido vinculados
  if (updates.numero_pregao) {
    try {
      const { data: itensDoPregao } = await supabase
        .from('itens_pregao')
        .select('id')
        .eq('pregao_id', id)

      const itemIds = (itensDoPregao ?? []).map(i => i.id)
      if (itemIds.length > 0) {
        await supabase
          .from('itens_pedido_compra')
          .update({ numero_pregao: updates.numero_pregao })
          .in('item_pregao_id', itemIds)
      }
    } catch (errSync) {
      console.warn('[updatePregao] Aviso ao sincronizar numero_pregao em pedidos:', errSync)
    }
  }

  return { data: null, error: null }
}

export async function deletePregao(id: string): Promise<ApiResult<null>> {
  // A exclusão em cascata deve ser tratada pelo Supabase. 
  // Mas por segurança, podemos excluir os itens primeiro se o ON DELETE CASCADE não estiver configurado.
  await supabase.from('itens_pregao').delete().eq('pregao_id', id)
  
  const { error } = await supabase.from('pregoes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export interface ItemPedidoPendente {
  cd_comp_master: string | null
  item_pregao_id?: string | null
  quantidade: number
  pedido_id: string
  pedido_numero: number
  status: StatusPedidoCompra
  criado_em?: string
}

export async function getPedidosPendentes(): Promise<ApiResult<ItemPedidoPendente[]>> {
  try {
    // Busca itens de pedidos cujo status seja diferente de CANCELADO e que ainda não foram entregues
    const { data, error } = await supabase
      .from('itens_pedido_compra')
      .select(`
        quantidade,
        cd_comp_master,
        item_pregao_id,
        pedido:pedidos_compra!inner(id, numero, status, criado_em)
      `)
      .neq('pedido.status', 'CANCELADO')
      .neq('pedido.status', 'ENTREGUE')

    if (error) throw new Error(error.message)

    const list: ItemPedidoPendente[] = []
    for (const row of (data as any[]) ?? []) {
      const pedido = row.pedido
      const status = pedido?.status
      if (status !== 'CANCELADO' && status !== 'ENTREGUE') {
        list.push({
          cd_comp_master: row.cd_comp_master || null,
          item_pregao_id: row.item_pregao_id || null,
          quantidade: Number(row.quantidade) || 0,
          pedido_id: pedido?.id || '',
          pedido_numero: Number(pedido?.numero) || 0,
          status: status,
          criado_em: pedido?.criado_em,
        })
      }
    }
    return { data: list, error: null }
  } catch (err: any) {
    // Retorna vazio silenciosamente caso a tabela ainda não exista ou as FKs não estejam configuradas
    return { data: [], error: null }
  }
}

// ─── Itens do Pregão ──────────────────────────────────────────────────────────

export async function getItensByPregao(pregaoId: string): Promise<ApiResult<ItemPregao[]>> {
  const { data, error } = await supabase
    .from('itens_pregao')
    .select('*')
    .eq('pregao_id', pregaoId)
    .order('numero_item')
  return { data, error: error?.message ?? null }
}

export async function updateItemPregao(
  id: string,
  updates: Partial<Pick<ItemPregao, 'cd_comp_master'>>
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('itens_pregao')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

/**
 * Função utilitária para buscar todos os registros paginando automaticamente
 * e contornando o limite de 1000 linhas do PostgREST.
 */
async function fetchAllRows<T>(queryFn: () => any, pageSize = 1000): Promise<T[]> {
  const allRows: T[] = []
  let page = 0
  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await queryFn().range(from, to)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    page++
  }
  return allRows
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

export async function getProdutos(mercado = 'INTERNO'): Promise<ApiResult<Produto[]>> {
  try {
    const data = await fetchAllRows<Produto>(() =>
      supabase
        .from('produtos')
        .select('*')
        .eq('mercado', mercado)
        .eq('ativo', true)
        .order('nomenclatura')
    )
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao buscar produtos' }
  }
}

export async function getMasters(mercado = 'INTERNO'): Promise<ApiResult<Produto[]>> {
  try {
    const data = await fetchAllRows<Produto>(() =>
      supabase
        .from('produtos')
        .select('*')
        .eq('pos_familia', 'MASTER')
        .eq('mercado', mercado)
        .eq('ativo', true)
        .order('nomenclatura')
    )
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao buscar masters' }
  }
}

export async function getEquivalentesByMaster(cdCompMaster: string): Promise<ApiResult<Produto[]>> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('cd_comp_master', cdCompMaster)
    .eq('pos_familia', 'EQUIVALENTE')
  return { data, error: error?.message ?? null }
}

// ─── Estoque ──────────────────────────────────────────────────────────────────

export async function getEstoque(ambiente = 'CAVEX'): Promise<ApiResult<Estoque[]>> {
  try {
    const data = await fetchAllRows<Estoque>(() =>
      supabase
        .from('estoque')
        .select('*')
        .eq('ambiente', ambiente)
    )
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao buscar estoque' }
  }
}

export async function getEstoquePorComp(cdComp: string, ambiente = 'CAVEX'): Promise<ApiResult<Estoque | null>> {
  const { data, error } = await supabase
    .from('estoque')
    .select('*')
    .eq('cd_comp', cdComp)
    .eq('ambiente', ambiente)
    .maybeSingle()
  return { data, error: error?.message ?? null }
}

// ─── Fornecimentos ────────────────────────────────────────────────────────────

export async function getFornecimentos(ambiente = 'CAVEX'): Promise<ApiResult<Fornecimento[]>> {
  try {
    const data = await fetchAllRows<Fornecimento>(() =>
      supabase
        .from('fornecimentos')
        .select('*')
        .eq('ambiente', ambiente)
        .order('ano')
    )
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao buscar fornecimentos' }
  }
}

export async function getFornecimentosByFamilia(
  cdCompMaster: string,
  ambiente = 'CAVEX'
): Promise<ApiResult<Fornecimento[]>> {
  const { data, error } = await supabase
    .from('fornecimentos')
    .select('*')
    .eq('cd_comp_master', cdCompMaster)
    .eq('ambiente', ambiente)
    .order('ano')
  return { data, error: error?.message ?? null }
}

export async function getSolicitantes(): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase
    .from('fornecimentos')
    .select('solicitante')
    .eq('ambiente', 'CAVEX')
    .not('solicitante', 'is', null)
    .limit(5000)
  if (error) return { data: null, error: error.message }
  const unique = [...new Set((data ?? []).map(r => r.solicitante).filter(Boolean) as string[])]
  return { data: unique.sort(), error: null }
}

// ─── Estoque paginado (server-side) ───────────────────────────────────────────

export interface EstoqueRow {
  cd_comp: string
  estoque_lib: number
  estoque_res: number
  estoque_total: number
  data_referencia: string | null
  produto: Pick<Produto, 'cd_comp' | 'cd_comp_master' | 'nomenclatura' | 'pn' | 'mpn' | 'nd' | 'si' | 'fabricante' | 'cm'> | null
}

export interface EstoquePaginadoResult {
  rows: EstoqueRow[]
  total: number
  error: string | null
}

export async function getEstoquePaginado(
  search: string,
  page: number,
  perPage = 50
): Promise<EstoquePaginadoResult> {
  
  let cdCompsValidos: string[] | null = null
  if (search) {
    const q = `%${search}%`
    const { data: matchedProds } = await supabase
      .from('produtos')
      .select('cd_comp')
      .or(`cd_comp.ilike.${q},nomenclatura.ilike.${q},pn.ilike.${q},cm.ilike.${q}`)
      .limit(1500)
    
    if (matchedProds) {
      cdCompsValidos = matchedProds.map(p => p.cd_comp)
    }
    
    if (cdCompsValidos && cdCompsValidos.length === 0) {
      return { rows: [], total: 0, error: null }
    }
  }

  // 1. Buscar página de estoque CAVEX
  let estoqueQuery = supabase
    .from('estoque')
    .select('cd_comp, estoque_lib, estoque_res, estoque_total, data_referencia', { count: 'exact' })
    .eq('ambiente', 'CAVEX')

  if (cdCompsValidos) {
    estoqueQuery = estoqueQuery.in('cd_comp', cdCompsValidos)
  }

  const from = page * perPage
  const to = from + perPage - 1

  const { data: estoqueRaw, error: ee, count } = await estoqueQuery
    .order('estoque_total', { ascending: false })
    .range(from, to)

  if (ee) return { rows: [], total: 0, error: ee.message }
  if (!estoqueRaw || estoqueRaw.length === 0) return { rows: [], total: count ?? 0, error: null }

  // 2. Buscar os produtos correspondentes
  const cdComps = estoqueRaw.map(e => e.cd_comp)
  const { data: prods } = await supabase
    .from('produtos')
    .select('cd_comp, cd_comp_master, nomenclatura, pn, mpn, nd, si, fabricante, cm')
    .in('cd_comp', cdComps)

  const prodMap = new Map((prods ?? []).map(p => [p.cd_comp, p]))

  const rows: EstoqueRow[] = estoqueRaw.map(e => ({
    cd_comp: e.cd_comp,
    estoque_lib: Number(e.estoque_lib),
    estoque_res: Number(e.estoque_res),
    estoque_total: Number(e.estoque_total),
    data_referencia: e.data_referencia,
    produto: prodMap.get(e.cd_comp) ?? null,
  }))

  return { rows, total: count ?? 0, error: null }
}

// Busca estoque por cd_comp exato (para detalhe do MASTER)
export async function getEquivalentesComEstoque(
  cdCompMaster: string
): Promise<ApiResult<Array<Produto & { estoque?: Estoque }>>> {
  const { data: prods, error: ep } = await supabase
    .from('produtos')
    .select('*')
    .eq('cd_comp_master', cdCompMaster)
    .eq('mercado', 'INTERNO')

  if (ep) return { data: null, error: ep.message }

  const cdComps = (prods ?? []).map(p => p.cd_comp)
  const { data: estoques, error: ee } = await supabase
    .from('estoque')
    .select('*')
    .in('cd_comp', cdComps)
    .eq('ambiente', 'CAVEX')

  if (ee) return { data: null, error: ee.message }

  const estoqueMap = new Map((estoques ?? []).map(e => [e.cd_comp, e]))
  const result = (prods ?? []).map(p => ({ ...p, estoque: estoqueMap.get(p.cd_comp) }))
  return { data: result as any, error: null }
}

// ─── Fornecimentos paginado (server-side) ─────────────────────────────────────

export interface MasterConsumoRow {
  cdComp: string
  nomenclatura: string
  nd: string | null
  si: string | null
  consumoPorAno: Record<number, number>
  mediaSimples: number
  mediaPonderada: number
  mediaMensal: number
  anosComConsumo: number
}

export interface FornecimentosPaginadoResult {
  rows: MasterConsumoRow[]
  total: number
  error: string | null
}

export async function getFornecimentosPaginado(
  search: string,
  page: number,
  perPage = 40
): Promise<FornecimentosPaginadoResult> {
  // 1. Busca MASTERs distintos que têm fornecimentos, com pesquisa
  let prodQuery = supabase
    .from('produtos')
    .select('cd_comp, nomenclatura, nd, si', { count: 'exact' })
    .eq('pos_familia', 'MASTER')
    .eq('mercado', 'INTERNO')
    .eq('ativo', true)

  if (search) {
    prodQuery = prodQuery.or(`cd_comp.ilike.%${search}%,nomenclatura.ilike.%${search}%`)
  }

  const from = page * perPage
  const to = from + perPage - 1
  const { data: masters, error: em, count } = await prodQuery
    .order('nomenclatura')
    .range(from, to)

  if (em) return { rows: [], total: 0, error: em.message }
  if (!masters || masters.length === 0) return { rows: [], total: count ?? 0, error: null }

  // 2. Busca fornecimentos desses MASTERs (últimos 5 anos)
  const cdComps = masters.map(m => m.cd_comp)
  const dataLimite = new Date()
  dataLimite.setFullYear(dataLimite.getFullYear() - 5)
  const dataLimiteStr = dataLimite.toISOString().slice(0, 10)

  const { data: forns, error: ef } = await supabase
    .from('fornecimentos')
    .select('cd_comp_master, ano, quantidade')
    .in('cd_comp_master', cdComps)
    .eq('ambiente', 'CAVEX')
    .gte('data', dataLimiteStr)

  if (ef) return { rows: [], total: 0, error: ef.message }

  // 3. Agrega consumo por MASTER e ano
  const consumoMap = new Map<string, Record<number, number>>()
  for (const f of forns ?? []) {
    const mapa = consumoMap.get(f.cd_comp_master) ?? {}
    mapa[f.ano] = (mapa[f.ano] ?? 0) + Number(f.quantidade)
    consumoMap.set(f.cd_comp_master, mapa)
  }

  // 4. Calcula médias
  const rows: MasterConsumoRow[] = masters.map(m => {
    const consumoPorAno = consumoMap.get(m.cd_comp) ?? {}
    const anos = Object.keys(consumoPorAno).map(Number).sort((a, b) => a - b)

    const soma = anos.reduce((s, a) => s + consumoPorAno[a], 0)
    const mediaSimp = anos.length > 0 ? soma / anos.length : 0

    let somaPond = 0, somaPesos = 0
    anos.forEach((ano, idx) => {
      const peso = idx + 1
      somaPond += consumoPorAno[ano] * peso
      somaPesos += peso
    })
    const mediaPond = somaPesos > 0 ? somaPond / somaPesos : 0
    const mediaMens = mediaPond > 0 ? mediaPond / 12 : 0

    return {
      cdComp: m.cd_comp,
      nomenclatura: m.nomenclatura,
      nd: m.nd,
      si: m.si,
      consumoPorAno,
      mediaSimples: mediaSimp,
      mediaPonderada: mediaPond,
      mediaMensal: mediaMens,
      anosComConsumo: anos.filter(a => consumoPorAno[a] > 0).length,
    }
  })

  return { rows, total: count ?? 0, error: null }
}

export async function getFornecimentosByMaster(
  cdCompMaster: string
): Promise<ApiResult<Array<{ cd_comp: string; data: string | null; ano: number; quantidade: number; solicitante: string | null }>>> {
  const { data, error } = await supabase
    .from('fornecimentos')
    .select('cd_comp, data, ano, quantidade, solicitante')
    .eq('cd_comp_master', cdCompMaster)
    .eq('ambiente', 'CAVEX')
    .order('data', { ascending: false })
    .limit(200)
  return { data, error: error?.message ?? null }
}

// ─── Produtos paginado (server-side) ──────────────────────────────────────────

export interface ProdutoPaginadoResult {
  rows: Produto[]
  total: number
  error: string | null
}

export async function getProdutosPaginado(
  search: string,
  somenteMaster: boolean,
  fornecimentoRelevante: boolean,
  page: number,
  perPage = 40
): Promise<ProdutoPaginadoResult> {
  try {
    let relevantMasters: string[] | null = null

    if (fornecimentoRelevante) {
      // Descobrir o último ano na base para basear os "últimos 5 anos"
      const { data: maxDateRow } = await supabase
        .from('fornecimentos')
        .select('ano')
        .eq('ambiente', 'CAVEX')
        .order('ano', { ascending: false })
        .limit(1)
        .maybeSingle()
        
      const lastAno = maxDateRow?.ano || new Date().getFullYear()
      const anoLimite = lastAno - 4 // últimos 5 anos (ex: 2023, 2022, 2021, 2020, 2019)

      // Supabase limita a 1000 registros. Vamos fazer um loop ou fetch em paralelo.
      const { count: totalForns, error: ec } = await supabase
        .from('fornecimentos')
        .select('cd_comp_master', { count: 'exact', head: true })
        .eq('ambiente', 'CAVEX')
        .gte('ano', anoLimite)

      if (ec) throw new Error(ec.message)
      
      const allForns: any[] = []
      if (totalForns && totalForns > 0) {
        const limit = 1000
        const promises = []
        for (let i = 0; i < totalForns; i += limit) {
          promises.push(
            supabase
              .from('fornecimentos')
              .select('cd_comp_master, ano')
              .eq('ambiente', 'CAVEX')
              .gte('ano', anoLimite)
              .range(i, i + limit - 1)
          )
        }
        const results = await Promise.all(promises)
        for (const res of results) {
          if (res.error) throw new Error(res.error.message)
          if (res.data) allForns.push(...res.data)
        }
      }

      const anosPorMaster = new Map<string, Set<number>>()
      for (const f of allForns) {
        if (!f.cd_comp_master || !f.ano) continue
        const set = anosPorMaster.get(f.cd_comp_master) ?? new Set<number>()
        set.add(f.ano)
        anosPorMaster.set(f.cd_comp_master, set)
      }

      relevantMasters = []
      for (const [cdMaster, anos] of anosPorMaster.entries()) {
        if (anos.size >= 3) {
          relevantMasters.push(cdMaster)
        }
      }

      if (relevantMasters.length === 0) {
        return { rows: [], total: 0, error: null }
      }
    }

    let prodQuery = supabase
      .from('produtos')
      .select('*', { count: 'exact' })
      .eq('mercado', 'INTERNO')
      .eq('ativo', true)

    if (somenteMaster) {
      prodQuery = prodQuery.eq('pos_familia', 'MASTER')
    }

    if (search) {
      prodQuery = prodQuery.or(`cd_comp.ilike.%${search}%,nomenclatura.ilike.%${search}%,cm.ilike.%${search}%,pn.ilike.%${search}%`)
    }

    if (relevantMasters !== null) {
      const filterList = relevantMasters.join(',')
      prodQuery = prodQuery.or(`cd_comp.in.(${filterList}),cd_comp_master.in.(${filterList})`)
    }

    const from = page * perPage
    const to = from + perPage - 1

    const { data, error, count } = await prodQuery
      .order('nomenclatura')
      .range(from, to)

    if (error) throw new Error(error.message)

    return { rows: data as Produto[], total: count ?? 0, error: null }
  } catch (error: any) {
    return { rows: [], total: 0, error: error.message }
  }
}

export async function getMasterByCdComp(cdComp: string): Promise<ApiResult<Produto>> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('cd_comp', cdComp)
    .single()
  return { data, error: error?.message ?? null }
}

export async function updateFamiliaCM(cdCompMaster: string, cm: string | null): Promise<ApiResult<null>> {
  // Contagia o CM para o MASTER e todos os seus equivalentes
  const { error } = await supabase
    .from('produtos')
    .update({ cm, updated_at: new Date().toISOString() })
    .or(`cd_comp.eq.${cdCompMaster},cd_comp_master.eq.${cdCompMaster}`)
    
  return { data: null, error: error?.message ?? null }
}

export async function getAllFornecimentosMasterReport(): Promise<ApiResult<MasterConsumoRow[]>> {
  try {
    // 1. Contar total de produtos MASTER ativos do mercado INTERNO
    const { count, error: ec } = await supabase
      .from('produtos')
      .select('cd_comp', { count: 'exact', head: true })
      .eq('pos_familia', 'MASTER')
      .eq('mercado', 'INTERNO')
      .eq('ativo', true)

    if (ec) throw new Error(ec.message)
    if (!count) return { data: [], error: null }

    // 2. Buscar todos os MASTERs em lotes de 1000
    const allMasters: Array<{ cd_comp: string; nomenclatura: string; nd: string | null; si: string | null }> = []
    const limit = 1000
    const masterPromises = []
    for (let i = 0; i < count; i += limit) {
      masterPromises.push(
        supabase
          .from('produtos')
          .select('cd_comp, nomenclatura, nd, si')
          .eq('pos_familia', 'MASTER')
          .eq('mercado', 'INTERNO')
          .eq('ativo', true)
          .order('nomenclatura')
          .range(i, i + limit - 1)
      )
    }
    const masterResults = await Promise.all(masterPromises)
    for (const res of masterResults) {
      if (res.error) throw new Error(res.error.message)
      if (res.data) allMasters.push(...res.data)
    }

    // 3. Buscar fornecimentos dos últimos 5 anos de todo o ambiente CAVEX em lotes
    const dataLimite = new Date()
    dataLimite.setFullYear(dataLimite.getFullYear() - 5)
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10)

    const { count: totalForns, error: efc } = await supabase
      .from('fornecimentos')
      .select('cd_comp_master', { count: 'exact', head: true })
      .eq('ambiente', 'CAVEX')
      .gte('data', dataLimiteStr)

    if (efc) throw new Error(efc.message)

    const allForns: Array<{ cd_comp_master: string; ano: number; quantidade: number }> = []
    if (totalForns && totalForns > 0) {
      const fornPromises = []
      for (let i = 0; i < totalForns; i += limit) {
        fornPromises.push(
          supabase
            .from('fornecimentos')
            .select('cd_comp_master, ano, quantidade')
            .eq('ambiente', 'CAVEX')
            .gte('data', dataLimiteStr)
            .range(i, i + limit - 1)
        )
      }
      const fornResults = await Promise.all(fornPromises)
      for (const res of fornResults) {
        if (res.error) throw new Error(res.error.message)
        if (res.data) allForns.push(...res.data)
      }
    }

    // 4. Agrupar em um Set os cd_comp dos masters para filtrar os fornecimentos válidos
    const masterComps = new Set(allMasters.map(m => m.cd_comp))

    // 5. Agrega consumo por MASTER e ano
    const consumoMap = new Map<string, Record<number, number>>()
    for (const f of allForns) {
      if (!f.cd_comp_master || !masterComps.has(f.cd_comp_master)) continue
      const mapa = consumoMap.get(f.cd_comp_master) ?? {}
      mapa[f.ano] = (mapa[f.ano] ?? 0) + Number(f.quantidade)
      consumoMap.set(f.cd_comp_master, mapa)
    }

    // 6. Calcula médias
    const rows: MasterConsumoRow[] = allMasters.map(m => {
      const consumoPorAno = consumoMap.get(m.cd_comp) ?? {}
      const anos = Object.keys(consumoPorAno).map(Number).sort((a, b) => a - b)

      const soma = anos.reduce((s, a) => s + consumoPorAno[a], 0)
      const mediaSimp = anos.length > 0 ? soma / anos.length : 0

      let somaPond = 0, somaPesos = 0
      anos.forEach((ano, idx) => {
        const peso = idx + 1
        somaPond += consumoPorAno[ano] * peso
        somaPesos += peso
      })
      const mediaPond = somaPesos > 0 ? somaPond / somaPesos : 0
      const mediaMens = mediaPond > 0 ? mediaPond / 12 : 0

      return {
        cdComp: m.cd_comp,
        nomenclatura: m.nomenclatura,
        nd: m.nd,
        si: m.si,
        consumoPorAno,
        mediaSimples: mediaSimp,
        mediaPonderada: mediaPond,
        mediaMensal: mediaMens,
        anosComConsumo: anos.filter(a => consumoPorAno[a] > 0).length,
      }
    })

    return { data: rows, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}


// ─── Modificadores de Planejamento (overrides) ────────────────────────────────

import type { ModificadorPlanejamento } from '@/types'

export async function getModificadores(): Promise<ApiResult<ModificadorPlanejamento[]>> {
  const { data, error } = await supabase
    .from('modificadores_planejamento')
    .select('*')
    .order('updated_at', { ascending: false })
  return { data: data as ModificadorPlanejamento[] | null, error: error?.message ?? null }
}

export async function upsertModificador(
  payload: Omit<ModificadorPlanejamento, 'id' | 'created_at' | 'updated_at'>
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('modificadores_planejamento')
    .upsert(
      { ...payload, updated_at: new Date().toISOString() },
      { onConflict: 'cd_comp_master' }
    )
  return { data: null, error: error?.message ?? null }
}

export async function deleteModificador(cdCompMaster: string): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('modificadores_planejamento')
    .delete()
    .eq('cd_comp_master', cdCompMaster)
  return { data: null, error: error?.message ?? null }
}


// ─── Notas de Crédito ────────────────────────────────────────────────────────────────────

import type { NotaCredito } from '@/types'

export async function getNotasCredito(): Promise<ApiResult<NotaCredito[]>> {
  const { data, error } = await supabase
    .from('notas_credito')
    .select('*')
    .order('created_at', { ascending: false })
  return { data: data as NotaCredito[] | null, error: error?.message ?? null }
}

export async function upsertNotaCredito(
  payload: Omit<NotaCredito, 'id' | 'created_at' | 'updated_at'>
): Promise<ApiResult<NotaCredito>> {
  const { data, error } = await supabase
    .from('notas_credito')
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as NotaCredito | null, error: error?.message ?? null }
}

export async function updateNotaCredito(
  id: string,
  updates: Partial<Omit<NotaCredito, 'id' | 'created_at' | 'updated_at'>>
): Promise<ApiResult<NotaCredito>> {
  const { data, error } = await supabase
    .from('notas_credito')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as NotaCredito | null, error: error?.message ?? null }
}

export async function deleteNotaCredito(id: string): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('notas_credito')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─── Pedidos de Compra ───────────────────────────────────────────────────

export async function getPedidosCompra(): Promise<ApiResult<PedidoCompra[]>> {
  const { data, error } = await supabase
    .from('pedidos_compra')
    .select(`
      *,
      itens:itens_pedido_compra(
        *,
        item_pregao:itens_pregao(descricao, descricao_tr)
      )
    `)
    .order('criado_em', { ascending: false })

  // Mapeia descricao_pregao para cada item
  const mapped = (data ?? []).map((p: any) => ({
    ...p,
    itens: (p.itens ?? []).map((i: any) => ({
      ...i,
      descricao_pregao: i.item_pregao?.descricao ?? null,
      descricao_tr: i.item_pregao?.descricao_tr ?? null,
    })),
  }))
  return { data: mapped as PedidoCompra[] | null, error: error?.message ?? null }
}

export async function getPedidoCompraById(id: string): Promise<ApiResult<PedidoCompra>> {
  const { data, error } = await supabase
    .from('pedidos_compra')
    .select('*, itens:itens_pedido_compra(*, item_pregao:itens_pregao(descricao, descricao_tr))')
    .eq('id', id)
    .single()

  let mappedData = null
  if (data) {
    mappedData = {
      ...data,
      itens: (data.itens ?? []).map((i: any) => ({
        ...i,
        descricao_pregao: i.item_pregao?.descricao ?? null,
        descricao_tr: i.item_pregao?.descricao_tr ?? null,
      }))
    }
  }

  return { data: mappedData as PedidoCompra | null, error: error?.message ?? null }
}

export async function criarPedidoCompra(
  itens: Array<{ cdCompMaster: string; item: ItemCarrinhoEnriquecido }>,
  observacoes: string | null,
  criadoPor: string | null
): Promise<ApiResult<PedidoCompra>> {
  // 1. Buscar fornecedor de cada item_pregao_id (já salvo em itens_pregao)
  const idsPregão = itens.map(i => i.item.item_pregao_id).filter(Boolean) as string[]
  const fornMap = new Map<string, { nome: string | null; cnpj: string | null }>()

  if (idsPregão.length > 0) {
    const { data: itensPregao } = await supabase
      .from('itens_pregao')
      .select('id, fornecedor_nome, fornecedor_cnpj')
      .in('id', idsPregão)
    ;(itensPregao ?? []).forEach(ip => {
      fornMap.set(ip.id, { nome: ip.fornecedor_nome, cnpj: ip.fornecedor_cnpj })
    })
  }

  // 2. Calcular valor total
  const valorTotal = itens.reduce((acc, { item }) => acc + item.valor_unitario * item.qtd, 0)

  // 3. Criar cabeçalho do pedido
  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos_compra')
    .insert({ observacoes, valor_total: valorTotal, criado_por: criadoPor, status: 'RASCUNHO' })
    .select()
    .single()

  if (errPedido || !pedido) {
    return { data: null, error: errPedido?.message ?? 'Erro ao criar pedido' }
  }

  // 4. Inserir itens
  const itensPayload = itens.map(({ cdCompMaster, item }) => {
    const forn = item.item_pregao_id ? fornMap.get(item.item_pregao_id) : undefined
    return {
      pedido_id: pedido.id,
      item_pregao_id: item.item_pregao_id,
      cd_comp_master: cdCompMaster,
      nomenclatura: item.nomenclatura,
      pn: item.pn,
      mpn: item.mpn,
      nd: item.nd,
      si: item.si,
      cm: item.cm,
      numero_pregao: item.numero_pregao,
      numero_item: item.numero_item,
      valor_unitario: item.valor_unitario,
      quantidade: item.qtd,
      valor_total: +(item.valor_unitario * item.qtd).toFixed(2),
      fornecedor_nome: forn?.nome ?? null,
      fornecedor_cnpj: forn?.cnpj ?? null,
    }
  })

  const { error: errItens } = await supabase.from('itens_pedido_compra').insert(itensPayload)
  if (errItens) {
    // Rollback manual do pedido
    await supabase.from('pedidos_compra').delete().eq('id', pedido.id)
    return { data: null, error: `Erro ao salvar itens: ${errItens.message}` }
  }

  return { data: pedido as PedidoCompra, error: null }
}

export async function atualizarStatusPedidoCompra(
  id: string,
  status: StatusPedidoCompra
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('pedidos_compra')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (!error) {
    // Sincroniza empenhos nos itens dos pregões em segundo plano
    recalcularSaldosPregaoDePedidos().catch(err =>
      console.warn('[API] Erro ao sincronizar saldos de pedidos finalizados:', err)
    )
  }

  return { data: null, error: error?.message ?? null }
}

export async function atualizarObservacoesPedidoCompra(
  id: string,
  observacoes: string | null
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('pedidos_compra')
    .update({ observacoes, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  return { data: null, error: error?.message ?? null }
}

export async function deletePedidoCompra(id: string): Promise<ApiResult<null>> {
  // itens_pedido_compra têm ON DELETE CASCADE, serão removidos automaticamente
  const { error } = await supabase
    .from('pedidos_compra')
    .delete()
    .eq('id', id)

  if (!error) {
    recalcularSaldosPregaoDePedidos().catch(err =>
      console.warn('[API] Erro ao sincronizar saldos após deletar pedido:', err)
    )
  }

  return { data: null, error: error?.message ?? null }
}

export async function deleteItemPedidoCompra(
  id: string,
  pedidoId?: string,
  novoTotal?: number
): Promise<ApiResult<null>> {
  let targetPedidoId = pedidoId
  if (!targetPedidoId) {
    const { data: item } = await supabase
      .from('itens_pedido_compra')
      .select('pedido_id')
      .eq('id', id)
      .maybeSingle()
    targetPedidoId = item?.pedido_id
  }

  const { error } = await supabase
    .from('itens_pedido_compra')
    .delete()
    .eq('id', id)

  if (error) {
    return { data: null, error: error.message }
  }

  if (targetPedidoId) {
    let total = novoTotal
    if (total === undefined) {
      const { data: restantes } = await supabase
        .from('itens_pedido_compra')
        .select('valor_total')
        .eq('pedido_id', targetPedidoId)
      total = (restantes ?? []).reduce((acc: number, r: any) => acc + Number(r.valor_total || 0), 0)
    }

    // Ao excluir um item, o pedido é marcado como em aberto ('RASCUNHO') e tem o valor recalculado
    await supabase
      .from('pedidos_compra')
      .update({
        status: 'RASCUNHO',
        valor_total: total,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', targetPedidoId)
  }

  recalcularSaldosPregaoDePedidos().catch(err =>
    console.warn('[API] Erro ao sincronizar saldos após deletar item de pedido:', err)
  )

  return { data: null, error: null }
}

/**
 * Atualiza manualmente a quantidade empenhada de um item de pregão,
 * recalculando o saldo_empenho do item e o valor_empenhado total do pregão.
 */
export async function atualizarEmpenhoItemPregao(
  itemId: string,
  novaQtdEmpenhada: number
): Promise<ApiResult<{ quantidade_empenhada: number; saldo_empenho: number; valorEmpenhadoPregao: number }>> {
  try {
    const { data: item, error: errItem } = await supabase
      .from('itens_pregao')
      .select('id, pregao_id, quantidade_licitada, valor_unitario')
      .eq('id', itemId)
      .single()

    if (errItem || !item) {
      return { data: null, error: errItem?.message ?? 'Item do pregão não encontrado' }
    }

    const qtdLic = Number(item.quantidade_licitada) || 0
    const qtdEmp = Math.max(0, Number(novaQtdEmpenhada) || 0)
    const saldo = Math.max(0, qtdLic - qtdEmp)
    const agora = new Date().toISOString()

    const { error: errUpd } = await supabase
      .from('itens_pregao')
      .update({
        quantidade_empenhada: qtdEmp,
        saldo_empenho: saldo,
        saldo_restante: saldo,
        updated_at: agora,
      })
      .eq('id', itemId)

    if (errUpd) {
      return { data: null, error: errUpd.message }
    }

    // Recalcula o valor_empenhado total do pregão
    const { data: todosItens } = await supabase
      .from('itens_pregao')
      .select('quantidade_empenhada, valor_unitario')
      .eq('pregao_id', item.pregao_id)

    const totalEmpenhadoPregao = (todosItens ?? []).reduce((acc, it) => {
      return acc + (Number(it.quantidade_empenhada || 0) * Number(it.valor_unitario || 0))
    }, 0)

    await supabase
      .from('pregoes')
      .update({ valor_empenhado: +totalEmpenhadoPregao.toFixed(2), updated_at: agora })
      .eq('id', item.pregao_id)

    return {
      data: {
        quantidade_empenhada: qtdEmp,
        saldo_empenho: saldo,
        valorEmpenhadoPregao: +totalEmpenhadoPregao.toFixed(2),
      },
      error: null,
    }
  } catch (err: any) {
    return { data: null, error: err.message ?? 'Erro ao atualizar empenho do item' }
  }
}

/**
 * Consolida os itens de todos os pedidos de compra com status 'FINALIZADO',
 * garantindo que a quantidade empenhada em cada item de pregão seja no mínimo
 * a quantidade solicitada nos pedidos finalizados.
 */
export async function recalcularSaldosPregaoDePedidos(pregaoIdFiltro?: string): Promise<ApiResult<{ itensAtualizados: number }>> {
  try {
    // 1. Buscar pedidos finalizados
    const { data: pedidosFinalizados, error: errPed } = await supabase
      .from('pedidos_compra')
      .select('id')
      .eq('status', 'FINALIZADO')

    if (errPed) return { data: null, error: errPed.message }

    const idsPedidosFinalizados = new Set((pedidosFinalizados ?? []).map(p => p.id))
    if (idsPedidosFinalizados.size === 0) {
      return { data: { itensAtualizados: 0 }, error: null }
    }

    // 2. Buscar itens dos pedidos finalizados
    const { data: itensPedidos, error: errItensPed } = await supabase
      .from('itens_pedido_compra')
      .select('item_pregao_id, numero_pregao, numero_item, quantidade, valor_total, pedido_id')

    if (errItensPed) return { data: null, error: errItensPed.message }

    // Mapa de empenhos por item_pregao_id e por (numero_pregao, numero_item)
    const empenhosPorItemId = new Map<string, number>()
    const empenhosPorPregaoEItem = new Map<string, number>()

    for (const it of itensPedidos ?? []) {
      if (!idsPedidosFinalizados.has(it.pedido_id)) continue
      const qtd = Number(it.quantidade) || 0

      if (it.item_pregao_id) {
        empenhosPorItemId.set(it.item_pregao_id, (empenhosPorItemId.get(it.item_pregao_id) || 0) + qtd)
      }

      if (it.numero_pregao && it.numero_item) {
        // Normaliza número de pregão removendo zeros à esquerda se houver (ex: "90016/2026")
        const chave = `${it.numero_pregao.trim()}#${it.numero_item}`
        empenhosPorPregaoEItem.set(chave, (empenhosPorPregaoEItem.get(chave) || 0) + qtd)
      }
    }

    // 3. Buscar pregões correspondentes
    let queryPregoes = supabase.from('pregoes').select('id, numero_pregao')
    if (pregaoIdFiltro) {
      queryPregoes = queryPregoes.eq('id', pregaoIdFiltro)
    }
    const { data: pregoesList, error: errPregoes } = await queryPregoes
    if (errPregoes) return { data: null, error: errPregoes.message }

    let totalItensAtualizados = 0
    const agora = new Date().toISOString()

    for (const p of pregoesList ?? []) {
      const { data: itensDoPregao, error: errItens } = await supabase
        .from('itens_pregao')
        .select('id, numero_item, quantidade_licitada, quantidade_empenhada, valor_unitario')
        .eq('pregao_id', p.id)

      if (errItens || !itensDoPregao) continue

      let pregaoTeveMudanca = false

      for (const item of itensDoPregao) {
        const qtdPorId = empenhosPorItemId.get(item.id) || 0
        const chaveNum = `${(p.numero_pregao || '').trim()}#${item.numero_item}`
        const qtdPorChave = empenhosPorPregaoEItem.get(chaveNum) || 0
        const qtdFinalizados = Math.max(qtdPorId, qtdPorChave)

        const qtdAtual = Number(item.quantidade_empenhada) || 0
        // A quantidade empenhada deve ser pelo menos a soma dos pedidos finalizados
        if (qtdFinalizados > qtdAtual) {
          const qtdLic = Number(item.quantidade_licitada) || 0
          const novoSaldo = Math.max(0, qtdLic - qtdFinalizados)

          await supabase
            .from('itens_pregao')
            .update({
              quantidade_empenhada: qtdFinalizados,
              saldo_empenho: novoSaldo,
              saldo_restante: novoSaldo,
              updated_at: agora,
            })
            .eq('id', item.id)

          item.quantidade_empenhada = qtdFinalizados
          pregaoTeveMudanca = true
          totalItensAtualizados++
        }
      }

      if (pregaoTeveMudanca) {
        const totalEmpenhado = itensDoPregao.reduce((acc, it) => {
          return acc + (Number(it.quantidade_empenhada || 0) * Number(it.valor_unitario || 0))
        }, 0)

        await supabase
          .from('pregoes')
          .update({ valor_empenhado: +totalEmpenhado.toFixed(2), updated_at: agora })
          .eq('id', p.id)
      }
    }

    return { data: { itensAtualizados: totalItensAtualizados }, error: null }
  } catch (err: any) {
    return { data: null, error: err.message ?? 'Erro ao recalcular saldos' }
  }
}

