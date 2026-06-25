/**
 * useNotasCreditoStore — Store global para Notas de Crédito
 *
 * O orçamento é controlado em nível de Plano Interno (PI), não por SI individual.
 * Quando um PI cobre múltiplos SIs, o budget é um pool compartilhado entre eles.
 *
 * Exemplo: E4AVSUNCOLU cobre SI 01 e SI 02.
 *   NC cadastrada com PI=E4AVSUNCOLU, valor=R$100k
 *   → budget disponível para SI 01 + SI 02 = R$100k (compartilhado)
 *   → se SI 01 gastar R$60k e SI 02 gastar R$50k = R$110k > R$100k → alerta!
 */
import { create } from 'zustand'
import { getNotasCredito, upsertNotaCredito, deleteNotaCredito } from '@/lib/api'
import { getPiFromSi, getSisDoMesmoPI } from '@/lib/ementario'
import type { NotaCredito } from '@/types'

// ─── Tipos exportados ────────────────────────────────────────────────────────

export interface BudgetInfo {
  pi: string           // Plano Interno
  totalNC: number      // Soma de todas as NCs para este PI
  sisCobertas: string[] // SIs que compartilham este pool
  compartilhado: boolean // true se mais de 1 SI
}

// ─── Cálculos internos ───────────────────────────────────────────────────────

function calcTotalPorPI(notas: NotaCredito[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const nc of notas) {
    if (nc.plano_interno) {
      map[nc.plano_interno] = (map[nc.plano_interno] ?? 0) + Number(nc.valor)
    }
  }
  return map
}

// ─── Interface do store ──────────────────────────────────────────────────────

interface NotasCreditoState {
  notas: NotaCredito[]
  fetched: boolean
  loading: boolean
  error: string | null

  /**
   * Total disponível por Plano Interno (PI).
   * Esta é a fonte primária de orçamento — o SI é derivado pelo ementário.
   */
  totalPorPI: Record<string, number>

  /**
   * Retorna o BudgetInfo completo para um dado SI.
   * Leva em conta o PI que cobre aquele SI e o pool compartilhado.
   */
  getBudgetParaSi: (si: string) => BudgetInfo | null

  /**
   * Dado um mapa de gastos por SI { si → valor }, retorna um mapa
   * de gastos consolidados por PI { pi → valorTotal }.
   * Útil para calcular o consumo total do pool de um PI.
   */
  calcGastoPorPI: (gastoPorSi: Record<string, number>) => Record<string, number>

  fetchNotas: () => Promise<void>
  addNota: (payload: Omit<NotaCredito, 'id' | 'created_at' | 'updated_at'>) => Promise<string | null>
  removeNota: (id: string) => Promise<string | null>
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useNotasCreditoStore = create<NotasCreditoState>((set, get) => ({
  notas: [],
  fetched: false,
  loading: false,
  error: null,
  totalPorPI: {},

  getBudgetParaSi: (si: string): BudgetInfo | null => {
    const siPad = si.padStart(2, '0')
    const pi = getPiFromSi(siPad)
    if (!pi) return null
    const totalNC = get().totalPorPI[pi] ?? 0
    const sisCobertas = getSisDoMesmoPI(siPad)
    return {
      pi,
      totalNC,
      sisCobertas,
      compartilhado: sisCobertas.length > 1,
    }
  },

  calcGastoPorPI: (gastoPorSi: Record<string, number>): Record<string, number> => {
    const result: Record<string, number> = {}
    for (const [si, valor] of Object.entries(gastoPorSi)) {
      const pi = getPiFromSi(si.padStart(2, '0'))
      if (pi) {
        result[pi] = (result[pi] ?? 0) + valor
      }
    }
    return result
  },

  fetchNotas: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    const { data, error } = await getNotasCredito()
    if (error) {
      set({ loading: false, error })
      return
    }
    const notas = data ?? []
    set({ notas, fetched: true, loading: false, totalPorPI: calcTotalPorPI(notas) })
  },

  addNota: async (payload) => {
    const { data, error } = await upsertNotaCredito(payload)
    if (error) return error
    if (data) {
      const notas = [data, ...get().notas]
      set({ notas, totalPorPI: calcTotalPorPI(notas) })
    }
    return null
  },

  removeNota: async (id) => {
    const { error } = await deleteNotaCredito(id)
    if (error) return error
    const notas = get().notas.filter(n => n.id !== id)
    set({ notas, totalPorPI: calcTotalPorPI(notas) })
    return null
  },
}))
