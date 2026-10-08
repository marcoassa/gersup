import { useState, useMemo } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import type { Pregao, ItemCompras } from '@/types'
import { calcStatusPregao, extrairModeloMarcaRef } from '@/lib/utils'

interface ModalAdicionarAvulsoProps {
  onClose: () => void
  onAdd: (item: ItemCompras, qtd: number) => void
  pregoes: Pregao[]
}

export default function ModalAdicionarAvulso({ onClose, onAdd, pregoes }: ModalAdicionarAvulsoProps) {
  const [selectedPregaoId, setSelectedPregaoId] = useState<string>('')
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [qtd, setQtd] = useState<number>(1)

  const ativos = useMemo(() => {
    return pregoes.filter(p => calcStatusPregao(p.data_vencimento) !== 'VENCIDO')
  }, [pregoes])

  const pregaoSelecionado = useMemo(() => {
    return ativos.find(p => p.id === selectedPregaoId)
  }, [ativos, selectedPregaoId])

  const itemSelecionado = useMemo(() => {
    return pregaoSelecionado?.itens?.find(i => i.id === selectedItemId)
  }, [pregaoSelecionado, selectedItemId])

  const handleAdd = () => {
    if (!pregaoSelecionado || !itemSelecionado) return

    const refModel = extrairModeloMarcaRef(itemSelecionado.descricao_tr)
    const descRef = refModel !== 'SEM TERMO DE REFERENCIA'
      ? refModel
      : (itemSelecionado.descricao || '').replace(/^\[NÃO MAPEADO\]\s*/i, '').trim()
    const mockItem: ItemCompras = {
      cd_comp_master: itemSelecionado.cd_comp_master || `AVULSO-${itemSelecionado.id}`,
      nomenclatura: descRef || `Item ${itemSelecionado.numero_item} do Pregão`,
      pn: null,
      mpn: null,
      nd: null,
      si: null, // Usuário pode ajustar SI no carrinho depois
      cm: null,
      estoque_atual: 0,
      pedidos_pendentes: 0,
      saldo_pregoes: itemSelecionado.saldo_empenho,
      custo_unitario_pregao: itemSelecionado.valor_unitario,
      media_mensal: 0,
      cobertura_meses: 0,
      anos_com_consumo: 0,
      tem_pregao_ativo: true,
      quantidade_sugerida: qtd,
      criticidade: 'SEM_HIST',
      item_pregao_id: itemSelecionado.id,
      numero_item_pregao: itemSelecionado.numero_item,
      numero_pregao_ativo: pregaoSelecionado.numero_pregao,
      descricao_pregao_ativo: descRef || itemSelecionado.descricao,
      numero_pregao_Ativo: pregaoSelecionado.numero_pregao,
    } as any

    onAdd(mockItem, qtd)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-5 shadow-2xl bg-surface-800 space-y-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-surface-400 hover:text-surface-100 transition-colors"
        >
          <X size={18} />
        </button>
        <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
          <Plus size={18} className="text-primary-400" />
          Adicionar Item Avulso
        </h2>

        <div>
          <label className="stat-label block mb-1">Pregão</label>
          <select
            className="input w-full"
            value={selectedPregaoId}
            onChange={e => {
              setSelectedPregaoId(e.target.value)
              setSelectedItemId('')
            }}
          >
            <option value="">Selecione um pregão ativo...</option>
            {ativos.map(p => (
              <option key={p.id} value={p.id}>
                {p.numero_pregao} — {p.fornecedor?.nome_fantasia || p.fornecedor?.razao_social || 'Sem fornecedor'}
              </option>
            ))}
          </select>
        </div>

        {pregaoSelecionado && (
          <div>
            <label className="stat-label block mb-1">Item do Pregão</label>
            <select
              className="input w-full"
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
            >
              <option value="">Selecione um item...</option>
              {(pregaoSelecionado.itens || []).map(i => {
                const ref = extrairModeloMarcaRef(i.descricao_tr)
                const desc = ref !== 'SEM TERMO DE REFERENCIA' ? ref : (i.descricao.substring(0, 60) + (i.descricao.length > 60 ? '...' : ''))
                return (
                  <option key={i.id} value={i.id}>
                    Item {i.numero_item} — {i.cd_comp_master ? `[${i.cd_comp_master}] ` : ''}{desc}
                  </option>
                )
              })}
            </select>
            {itemSelecionado && (
              <div className="mt-2 p-3 bg-surface-900 rounded-lg border border-surface-700/50 text-xs text-surface-300 space-y-1">
                <p><strong className="text-surface-200">Saldo:</strong> {itemSelecionado.saldo_empenho}</p>
                <p><strong className="text-surface-200">Valor Unit.:</strong> {itemSelecionado.valor_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                {itemSelecionado.descricao_tr ? (
                  <p className="text-[11px] mt-1 text-emerald-300 font-medium">
                    <strong>Ref:</strong> {extrairModeloMarcaRef(itemSelecionado.descricao_tr)}
                  </p>
                ) : (
                  <p className="text-[10px] mt-1 text-amber-400 font-semibold">SEM TERMO DE REFERENCIA</p>
                )}
              </div>
            )}
          </div>
        )}

        {itemSelecionado && (
          <div>
            <label className="stat-label block mb-1">Quantidade</label>
            <input
              type="number"
              min={1}
              max={itemSelecionado.saldo_empenho || undefined}
              className="input w-full"
              value={qtd}
              onChange={e => setQtd(Math.max(1, parseInt(e.target.value) || 1))}
            />
            {qtd > itemSelecionado.saldo_empenho && (
              <p className="text-amber-400 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                Atenção: Quantidade solicitada é maior que o saldo do pregão.
              </p>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={!itemSelecionado || qtd < 1}
            onClick={handleAdd}
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </div>
    </div>
  )
}
