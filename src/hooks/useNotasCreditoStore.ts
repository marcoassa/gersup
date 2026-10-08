import { create } from 'zustand'
import { getNotasCredito, upsertNotaCredito, updateNotaCredito, deleteNotaCredito, getPedidosCompra } from '@/lib/api'
import { getPiFromSi, getSisDoMesmoPI, getSisFromPlanoInterno } from '@/lib/ementario'
import { extrairNcDeObservacoes } from '@/lib/utils'
import type { NotaCredito, PedidoCompra } from '@/types'

// ─── Tipos exportados ────────────────────────────────────────────────────────

export interface BudgetInfo {
  pi: string            // Plano Interno
  totalNC: number       // Total original da NC (SI-level ou PI pool)
  disponivel: number    // Saldo disponível (total - gasto)
  sisCobertas: string[] // SIs que compartilham este pool (1 = exclusivo)
  compartilhado: boolean // true se pool do PI (múltiplos SIs, legado)
  siEspecifico: boolean  // true se o budget é por SI individual (novo comportamento)
}

// ─── Cálculos internos ───────────────────────────────────────────────────────

function calcTotalPorPI(notas: NotaCredito[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const nc of notas) {
    if (nc.status !== 'ENCERRADA' && nc.plano_interno) {
      const pi = nc.plano_interno.trim()
      const sis = getSisFromPlanoInterno(pi)
      if ((!nc.si || nc.si.trim() === '') && sis.length > 1) {
        map[pi] = (map[pi] ?? 0) + Number(nc.valor)
      }
    }
  }
  return map
}

function calcTotalPorSI(notas: NotaCredito[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const nc of notas) {
    if (nc.status !== 'ENCERRADA') {
      const si = nc.si?.trim()
      if (si) {
        const siPad = si.padStart(2, '0')
        map[siPad] = (map[siPad] ?? 0) + Number(nc.valor)
      } else if (nc.plano_interno) {
        const pi = nc.plano_interno.trim()
        const sis = getSisFromPlanoInterno(pi)
        if (sis.length === 1) {
          const siPad = sis[0].padStart(2, '0')
          map[siPad] = (map[siPad] ?? 0) + Number(nc.valor)
        }
      }
    }
  }
  return map
}

function calcGasto(pedidos: PedidoCompra[], notas: NotaCredito[]): {
  gastoPorSI: Record<string, number>
  gastoPorPI: Record<string, number>
  gastoPorNC: Record<string, number>
} {
  const gastoPorSI: Record<string, number> = {}
  const gastoPorPI: Record<string, number> = {}
  const gastoPorNC: Record<string, number> = {}

  for (const p of pedidos) {
    if ((p.status === 'FINALIZADO' || p.status === 'ENTREGUE') && p.itens && p.itens.length > 0) {
      const valorPedido = p.valor_total || p.itens.reduce((acc, i) => acc + (i.valor_total || 0), 0)
      const { numeroNc } = extrairNcDeObservacoes(p.observacoes)

      if (numeroNc) {
        const nc = notas.find(n => n.numero_nc === numeroNc)
        const key = nc ? nc.id : numeroNc
        gastoPorNC[key] = (gastoPorNC[key] ?? 0) + valorPedido
      } else {
        const siRef = p.itens[0]?.si ? p.itens[0].si.trim().padStart(2, '0') : null
        if (siRef) {
          const ncsDoSi = notas.filter(n => (n.si || '').trim().padStart(2, '0') === siRef)
          const ncEscolhida = ncsDoSi.find(n => n.status === 'ATIVA') || ncsDoSi[0]
          if (ncEscolhida) {
            gastoPorNC[ncEscolhida.id] = (gastoPorNC[ncEscolhida.id] ?? 0) + valorPedido
          }
        }
      }

      for (const item of p.itens) {
        if (item.si) {
          const siPad = item.si.padStart(2, '0')
          const valor = Number(item.quantidade) * Number(item.valor_unitario)
          gastoPorSI[siPad] = (gastoPorSI[siPad] ?? 0) + valor
          const pi = getPiFromSi(siPad)
          if (pi) {
            gastoPorPI[pi] = (gastoPorPI[pi] ?? 0) + valor
          }
        }
      }
    }
  }

  return { gastoPorSI, gastoPorPI, gastoPorNC }
}

function calcSaldosDiretos(notas: NotaCredito[], gastoPorNC: Record<string, number>): Record<string, number> {
  const saldoPorNC: Record<string, number> = {}

  for (const nc of notas) {
    const gasto = gastoPorNC[nc.id] ?? (nc.numero_nc ? gastoPorNC[nc.numero_nc] : 0) ?? 0
    if (nc.status === 'ENCERRADA') {
      saldoPorNC[nc.id] = 0
    } else {
      const saldo = Number(nc.valor) - gasto
      saldoPorNC[nc.id] = Math.max(0, Number(saldo.toFixed(2)))
    }
  }

  return saldoPorNC
}

// ─── Interface do store ──────────────────────────────────────────────────────

interface NotasCreditoState {
  notas: NotaCredito[]
  pedidos: PedidoCompra[] // Pedidos finalizados cacheados para recalcular FIFO
  fetched: boolean
  loading: boolean
  error: string | null

  totalPorPI: Record<string, number>
  totalPorSI: Record<string, number>
  gastoPorPI: Record<string, number>
  gastoPorSI: Record<string, number>
  gastoPorNC: Record<string, number>
  saldoPorNC: Record<string, number> // id -> saldo restante (líquido)

  getBudgetParaSi: (si: string) => BudgetInfo | null
  getBudgetEfetivoParaSi: (si: string) => number // Retorna o saldo disponível (líquido)
  getSisComNC: () => string[]
  
  fetchNotas: () => Promise<void>
  addNota: (payload: Omit<NotaCredito, 'id' | 'created_at' | 'updated_at'>) => Promise<string | null>
  updateNota: (id: string, updates: Partial<Omit<NotaCredito, 'id' | 'created_at' | 'updated_at'>>) => Promise<string | null>
  removeNota: (id: string) => Promise<string | null>
  
  // Exposto para forçar re-cálculo caso um pedido seja finalizado noutra tela
  recalcStore: () => Promise<void>
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useNotasCreditoStore = create<NotasCreditoState>((set, get) => ({
  notas: [],
  pedidos: [],
  fetched: false,
  loading: false,
  error: null,
  totalPorPI: {},
  totalPorSI: {},
  gastoPorPI: {},
  gastoPorSI: {},
  gastoPorNC: {},
  saldoPorNC: {},

  getBudgetParaSi: (si: string): BudgetInfo | null => {
    const siPad = si.padStart(2, '0')
    const pi = getPiFromSi(siPad)
    if (!pi) return null

    const { notas, totalPorSI, totalPorPI, saldoPorNC } = get()

    if ((totalPorSI[siPad] ?? 0) > 0) {
      const total = totalPorSI[siPad]
      // Soma o saldo real das NCs específicas deste SI (e NCs de PI único)
      let disponivel = 0
      notas.forEach(nc => {
        const ncSi = nc.si?.trim()
          ? nc.si.trim().padStart(2, '0')
          : (nc.plano_interno && getSisFromPlanoInterno(nc.plano_interno).length === 1 ? getSisFromPlanoInterno(nc.plano_interno)[0].padStart(2, '0') : null)

        if (ncSi === siPad) {
          disponivel += (saldoPorNC[nc.id] ?? 0)
        }
      })

      return {
        pi,
        totalNC: total,
        disponivel: Math.max(0, disponivel),
        sisCobertas: [siPad],
        compartilhado: false,
        siEspecifico: true,
      }
    }

    const total = totalPorPI[pi] ?? 0
    // Soma o saldo real das NCs globais deste PI (sem SI específico)
    let disponivel = 0
    notas.forEach(nc => {
      if ((!nc.si || nc.si.trim() === '') && (nc.plano_interno?.trim() === pi)) {
        disponivel += (saldoPorNC[nc.id] ?? 0)
      }
    })

    const sisCobertas = getSisDoMesmoPI(siPad)
    return {
      pi,
      totalNC: total,
      disponivel: Math.max(0, disponivel),
      sisCobertas,
      compartilhado: sisCobertas.length > 1,
      siEspecifico: false,
    }
  },

  getBudgetEfetivoParaSi: (si: string): number => {
    const info = get().getBudgetParaSi(si)
    return info ? info.disponivel : 0
  },

  getSisComNC: (): string[] => {
    const { totalPorSI, totalPorPI } = get()
    const resultado = new Set<string>()

    for (const [si, total] of Object.entries(totalPorSI)) {
      if (total > 0) resultado.add(si.padStart(2, '0'))
    }

    for (const [pi, total] of Object.entries(totalPorPI)) {
      if (total > 0) {
        for (const si of getSisFromPlanoInterno(pi)) {
          resultado.add(si.padStart(2, '0'))
        }
      }
    }

    return Array.from(resultado).sort()
  },

  fetchNotas: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    
    const [ncRes, pedRes] = await Promise.all([
      getNotasCredito(),
      getPedidosCompra()
    ])
    
    if (ncRes.error) {
      set({ loading: false, error: ncRes.error })
      return
    }
    
    const notas = ncRes.data ?? []
    const pedidos = pedRes.data ?? []
    
    const totalPorPI = calcTotalPorPI(notas)
    const totalPorSI = calcTotalPorSI(notas)
    const { gastoPorSI, gastoPorPI, gastoPorNC } = calcGasto(pedidos, notas)
    const saldoPorNC = calcSaldosDiretos(notas, gastoPorNC)

    set({
      notas,
      pedidos,
      fetched: true,
      loading: false,
      totalPorPI,
      totalPorSI,
      gastoPorPI,
      gastoPorSI,
      gastoPorNC,
      saldoPorNC,
    })
  },

  addNota: async (payload) => {
    const { data, error } = await upsertNotaCredito(payload)
    if (error) return error
    if (data) {
      const notas = [data, ...get().notas]
      const { pedidos } = get()
      const totalPorPI = calcTotalPorPI(notas)
      const totalPorSI = calcTotalPorSI(notas)
      const { gastoPorSI, gastoPorPI, gastoPorNC } = calcGasto(pedidos, notas)
      set({
        notas,
        totalPorPI,
        totalPorSI,
        gastoPorPI,
        gastoPorSI,
        gastoPorNC,
        saldoPorNC: calcSaldosDiretos(notas, gastoPorNC),
      })
    }
    return null
  },

  updateNota: async (id, updates) => {
    const { data, error } = await updateNotaCredito(id, updates)
    if (error) return error
    if (data) {
      const notas = get().notas.map(n => n.id === id ? data : n)
      const { pedidos } = get()
      const totalPorPI = calcTotalPorPI(notas)
      const totalPorSI = calcTotalPorSI(notas)
      const { gastoPorSI, gastoPorPI, gastoPorNC } = calcGasto(pedidos, notas)
      set({
        notas,
        totalPorPI,
        totalPorSI,
        gastoPorPI,
        gastoPorSI,
        gastoPorNC,
        saldoPorNC: calcSaldosDiretos(notas, gastoPorNC),
      })
    }
    return null
  },

  removeNota: async (id) => {
    const { error } = await deleteNotaCredito(id)
    if (error) return error
    const notas = get().notas.filter(n => n.id !== id)
    const { pedidos } = get()
    const totalPorPI = calcTotalPorPI(notas)
    const totalPorSI = calcTotalPorSI(notas)
    const { gastoPorSI, gastoPorPI, gastoPorNC } = calcGasto(pedidos, notas)
    set({
      notas,
      totalPorPI,
      totalPorSI,
      gastoPorPI,
      gastoPorSI,
      gastoPorNC,
      saldoPorNC: calcSaldosDiretos(notas, gastoPorNC),
    })
    return null
  },
  
  recalcStore: async () => {
    // Basta chamar fetchNotas para refazer tudo
    await get().fetchNotas()
  }
}))
