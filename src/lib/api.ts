/**
 * GERSUP — Camada de API Supabase
 * Todas as queries ao banco ficam centralizadas aqui.
 */
import { supabase } from '@/lib/supabase'
import type { Pregao, ItemPregao, Produto, Estoque, Fornecimento } from '@/types'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface ApiResult<T> {
  data: T | null
  error: string | null
}

// ─── Fornecedores ─────────────────────────────────────────────────────────────

export async function getFornecedores() {
  const { data, error } = await supabase.from('fornecedores').select('*').order('razao_social')
  return { data, error: error?.message ?? null }
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

  return {
    data: data as Pregao | null,
    error: error?.message ?? null,
  }
}

export async function searchItensGlobais(query: string): Promise<ApiResult<any[]>> {
  if (!query || query.trim().length < 2) return { data: [], error: null }
  
  const { data, error } = await supabase
    .from('itens_pregao')
    .select(`
      id,
      numero_item,
      descricao,
      pregao_id,
      pregoes (
        id,
        numero_pregao
      )
    `)
    .ilike('descricao', `%${query}%`)
    .limit(20)

  return {
    data: data,
    error: error?.message ?? null,
  }
}

export async function updatePregao(
  id: string,
  updates: Partial<Pick<Pregao, 'objeto' | 'data_vencimento' | 'observacoes'>>
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('pregoes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function deletePregao(id: string): Promise<ApiResult<null>> {
  // A exclusão em cascata deve ser tratada pelo Supabase. 
  // Mas por segurança, podemos excluir os itens primeiro se o ON DELETE CASCADE não estiver configurado.
  await supabase.from('itens_pregao').delete().eq('pregao_id', id)
  
  const { error } = await supabase.from('pregoes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function getPedidosPendentes(): Promise<ApiResult<Array<{ cd_comp_master: string; quantidade: number }>>> {
  try {
    // Busca itens de pedidos cujo status seja diferente de CANCELADO e que ainda não foram entregues
    // Como o módulo de pedidos está em desenvolvimento, fazemos uma query defensiva:
    const { data, error } = await supabase
      .from('itens_pedido_empenho')
      .select(`
        quantidade,
        pedido:pedidos_empenho!inner(status),
        item_pregao:itens_pregao!inner(cd_comp_master)
      `)
      .neq('pedido.status', 'CANCELADO')

    if (error) throw new Error(error.message)

    const list: Array<{ cd_comp_master: string; quantidade: number }> = []
    for (const row of (data as any[]) ?? []) {
      const cd_comp_master = row.item_pregao?.cd_comp_master
      const status = row.pedido?.status
      if (cd_comp_master && status !== 'CANCELADO') {
        list.push({ cd_comp_master, quantidade: Number(row.quantidade) || 0 })
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
  // 1. Buscar página de estoque CAVEX
  let estoqueQuery = supabase
    .from('estoque')
    .select('cd_comp, estoque_lib, estoque_res, estoque_total, data_referencia', { count: 'exact' })
    .eq('ambiente', 'CAVEX')

  const from = page * perPage
  const to = from + perPage - 1

  const { data: estoqueRaw, error: ee, count } = await estoqueQuery
    .order('estoque_total', { ascending: false })
    .range(from, to)

  if (ee) return { rows: [], total: 0, error: ee.message }
  if (!estoqueRaw || estoqueRaw.length === 0) return { rows: [], total: count ?? 0, error: null }

  // 2. Buscar os produtos correspondentes (cd_comp do estoque == cd_comp do MASTER)
  const cdComps = estoqueRaw.map(e => e.cd_comp)
  const { data: prods } = await supabase
    .from('produtos')
    .select('cd_comp, cd_comp_master, nomenclatura, pn, mpn, nd, si, fabricante, cm')
    .in('cd_comp', cdComps)

  // Se há busca textual, filtramos nos produtos
  let cdCompsValidos = new Set(cdComps)
  if (search && prods) {
    const q = search.toLowerCase()
    cdCompsValidos = new Set(
      prods.filter(p =>
        p.cd_comp.toLowerCase().includes(q) ||
        (p.nomenclatura ?? '').toLowerCase().includes(q) ||
        (p.pn ?? '').toLowerCase().includes(q) ||
        (p.cm ?? '').toLowerCase().includes(q)
      ).map(p => p.cd_comp)
    )
  }

  const prodMap = new Map((prods ?? []).map(p => [p.cd_comp, p]))

  const rows: EstoqueRow[] = estoqueRaw
    .filter(e => !search || cdCompsValidos.has(e.cd_comp))
    .map(e => ({
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

export async function deleteNotaCredito(id: string): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('notas_credito')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

