/**
 * useModificadoresStore — Store Zustand global para overrides de dados do planejamento.
 *
 * Carregado uma única vez na aplicação e consumido por todas as telas
 * (Planejamento, Compras, Produtos) via hook.
 */
import { create } from 'zustand'
import type { ModificadorPlanejamento } from '@/types'
import { getModificadores, upsertModificador, deleteModificador } from '@/lib/api'

interface ModificadoresState {
  // Mapa de lookup O(1): cd_comp_master → ModificadorPlanejamento
  modificadoresMap: Map<string, ModificadorPlanejamento>
  // Lista para renderização na página de configurações
  lista: ModificadorPlanejamento[]
  loading: boolean
  error: string | null
  fetched: boolean

  // Ações
  fetchModificadores: () => Promise<void>
  upsert: (payload: Omit<ModificadorPlanejamento, 'id' | 'created_at' | 'updated_at'>) => Promise<string | null>
  remove: (cdCompMaster: string) => Promise<string | null>
  /** Ação rápida: marca/desmarca um MASTER como ignorado sem abrir o formulário completo */
  toggleIgnorar: (cdCompMaster: string, nomenclatura: string) => Promise<string | null>
}

export const useModificadoresStore = create<ModificadoresState>((set, get) => ({
  modificadoresMap: new Map(),
  lista: [],
  loading: false,
  error: null,
  fetched: false,

  fetchModificadores: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    const result = await getModificadores()
    if (result.error) {
      set({ loading: false, error: result.error })
      return
    }
    const lista = result.data ?? []
    const map = new Map(lista.map(m => [m.cd_comp_master, m]))
    set({ lista, modificadoresMap: map, loading: false, fetched: true })
  },

  upsert: async (payload) => {
    const result = await upsertModificador(payload)
    if (result.error) return result.error
    // Atualiza o estado local imediatamente sem refetch
    set(state => {
      const existing = state.modificadoresMap.get(payload.cd_comp_master)
      const updated: ModificadorPlanejamento = {
        id: existing?.id ?? crypto.randomUUID(),
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      }
      const newMap = new Map(state.modificadoresMap)
      newMap.set(payload.cd_comp_master, updated)
      const newLista = Array.from(newMap.values()).sort(
        (a, b) => b.updated_at.localeCompare(a.updated_at)
      )
      return { modificadoresMap: newMap, lista: newLista }
    })
    return null
  },

  remove: async (cdCompMaster) => {
    const result = await deleteModificador(cdCompMaster)
    if (result.error) return result.error
    set(state => {
      const newMap = new Map(state.modificadoresMap)
      newMap.delete(cdCompMaster)
      const newLista = Array.from(newMap.values()).sort(
        (a, b) => b.updated_at.localeCompare(a.updated_at)
      )
      return { modificadoresMap: newMap, lista: newLista }
    })
    return null
  },

  toggleIgnorar: async (cdCompMaster, nomenclatura) => {
    const existing = get().modificadoresMap.get(cdCompMaster)
    const jaIgnorado = existing?.ignorar === true
    const payload: Omit<ModificadorPlanejamento, 'id' | 'created_at' | 'updated_at'> = {
      cd_comp_master: cdCompMaster,
      ignorar: !jaIgnorado,
      // Mantém overrides existentes se o item já tinha modificador, ou usa null
      nomenclatura_override: existing?.nomenclatura_override ?? null,
      media_anual_override: existing?.media_anual_override ?? null,
      preco_unitario_override: existing?.preco_unitario_override ?? null,
      estoque_override: existing?.estoque_override ?? null,
      observacao: jaIgnorado
        ? (existing?.observacao ?? 'Item restaurado via ação rápida.')
        : `Item ignorado via ação rápida em ${new Date().toLocaleDateString('pt-BR')}. Nome: ${nomenclatura}.`,
      criado_por: 'GERSUP',
    }
    const result = await upsertModificador(payload)
    if (result.error) return result.error
    set(state => {
      const upd: ModificadorPlanejamento = {
        id: existing?.id ?? crypto.randomUUID(),
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      }
      const newMap = new Map(state.modificadoresMap)
      newMap.set(cdCompMaster, upd)
      const newLista = Array.from(newMap.values()).sort(
        (a, b) => b.updated_at.localeCompare(a.updated_at)
      )
      return { modificadoresMap: newMap, lista: newLista }
    })
    return null
  },
}))

