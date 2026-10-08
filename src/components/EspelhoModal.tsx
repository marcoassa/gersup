import { useState, useMemo } from 'react'
import { X, Copy, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react'
import { getPiFromSi, SI_NAMES } from '@/lib/ementario'
import { formatCurrency } from '@/lib/utils'
import type { PedidoCompra, NotaCredito } from '@/types'

type PregaoMap = Map<string, { objeto: string; nup: string | null; numero_pregao_atual: string }>

interface EspelhoModalProps {
  pedido: PedidoCompra
  ncs: NotaCredito[]
  pregaoMap: PregaoMap
  onClose: () => void
}

function formatCNPJ(cnpj: string | null | undefined) {
  if (!cnpj) return '—'
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
    return `${d.getDate().toString().padStart(2, '0')} ${meses[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`
  } catch {
    return dateStr
  }
}

export function EspelhoModal({ pedido, ncs, pregaoMap, onClose }: EspelhoModalProps) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const [grupoExpandido, setGrupoExpandido] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<Record<string, string>>({})

  const itens = pedido.itens ?? []

  // Agrupar itens da mesma forma que o PDF
  const grupos = useMemo(() => {
    const porPregao = new Map<string, Map<string, typeof itens>>()
    for (const item of itens) {
      const pregaoInfo = item.item_pregao_id ? pregaoMap.get(item.item_pregao_id) : pregaoMap.get(item.numero_pregao ?? '')
      const pregao = pregaoInfo?.numero_pregao_atual || item.numero_pregao || 'Sem Pregão'
      const empresa = item.fornecedor_nome ?? 'Empresa não identificada'
      const siRef = item.si ?? ''
      const pi = siRef ? (getPiFromSi(siRef.padStart(2, '0')) ?? '—') : '—'

      let ncId = 'sem-nc'
      if (pi !== '—') {
        const siPad = siRef.padStart(2, '0')
        const nc = ncs.find(n => n.si && n.si.padStart(2, '0') === siPad && n.plano_interno === pi)
          || ncs.find(n => n.plano_interno === pi && (!n.si || n.si.trim() === ''))
          || ncs.find(n => n.plano_interno === pi)
        if (nc) ncId = nc.id
      }

      const groupingKey = `${empresa}::${ncId}`

      if (!porPregao.has(pregao)) porPregao.set(pregao, new Map())
      const porEmpresa = porPregao.get(pregao)!
      if (!porEmpresa.has(groupingKey)) porEmpresa.set(groupingKey, [])
      porEmpresa.get(groupingKey)!.push(item)
    }

    const resultado = []
    for (const [pregao, porEmpresa] of porPregao) {
      for (const [groupingKey, itensDaEmpresa] of porEmpresa) {
        itensDaEmpresa.sort((a, b) => (Number(a.numero_item) || 0) - (Number(b.numero_item) || 0))
        resultado.push({ pregao, groupingKey, itensDaEmpresa })
      }
    }
    return resultado
  }, [itens, pregaoMap, ncs])

  // Define aba inicial para cada grupo e expande o primeiro grupo
  useMemo(() => {
    if (grupos.length > 0 && !grupoExpandido) {
      setGrupoExpandido(`${grupos[0].pregao}::${grupos[0].groupingKey}`)
    }
    const abasIniciais: Record<string, string> = {}
    grupos.forEach(g => {
      abasIniciais[`${g.pregao}::${g.groupingKey}`] = 'termo'
    })
    setAbaAtiva(abasIniciais)
  }, [grupos])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiado(id)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  const renderContent = (grupo: any) => {
    const { pregao, groupingKey, itensDaEmpresa } = grupo
    const empresa = groupingKey.split('::')[0]
    
    const pregaoInfo = pregaoMap.get(pregao)
    const nup = pregaoInfo?.nup ?? '[NUP]'
    const cnpj = itensDaEmpresa[0]?.fornecedor_cnpj ?? '[CNPJ]'
    
    const siRef = itensDaEmpresa[0]?.si ?? ''
    const siPad = siRef.padStart(2, '0')
    const pi = siRef ? (getPiFromSi(siPad) ?? '[PI]') : '[PI]'
    const subitemNome = SI_NAMES[siPad] ?? '[SUBITEM]'
    const expressaoMaterial = /^material\b/i.test(subitemNome)
      ? subitemNome
      : `material de ${subitemNome}`
    
    let nc: NotaCredito | undefined
    if (pi !== '[PI]') {
      nc = ncs.find(n => n.si && n.si.padStart(2, '0') === siPad && n.plano_interno === pi)
        || ncs.find(n => n.plano_interno === pi && (!n.si || n.si.trim() === ''))
        || ncs.find(n => n.plano_interno === pi)
    }
    
    const ncNum = nc?.numero_nc ?? '[NC]'
    const dataNc = nc?.data_emissao ? formatDate(nc.data_emissao) : '[DATA_NC]'
    const ugNc = nc?.ug_emitente ?? '[UG_NC]'
    const ugAprov = nc?.ugr ?? '160504'
    const ptres = nc?.ptres ?? '[PTRES]'
    const nd = nc?.natureza_despesa ?? '[ND]'

    const grupoId = `${pregao}::${groupingKey}`
    const aba = abaAtiva[grupoId] || 'termo'

    let assunto = ''
    let html = ''

    if (aba === 'termo') {
      assunto = `Termo de abertura para processo eletrônico para aquisição de ${expressaoMaterial}`
      html = `<p class="item_nivel_1">Em conformidade com a legisla&ccedil;&atilde;o pertinente, o presente processo eletr&ocirc;nico tem como objetivo a aquisi&ccedil;&atilde;o de ${expressaoMaterial} para o B Mnt Sup Av Ex.</p>`
    } else if (aba === 'assunto') {
      assunto = `Requisição de Empenho (${expressaoMaterial} - ${empresa})`
      html = assunto
    } else if (aba === 'requisicao') {
      assunto = `Requisição de Empenho (${expressaoMaterial} - ${empresa})`
      
      const itensOrdenados = [...itensDaEmpresa].sort((a: any, b: any) => (Number(a.numero_item) || 0) - (Number(b.numero_item) || 0))
      const linhasTabela = itensOrdenados.map((i: any) => `
		<tr>
			<td style="text-align:center">${i.numero_item ?? ''}</td>
			<td style="text-align:center">${i.descricao_pregao || i.item_pregao?.descricao || ''}</td>
			<td style="text-align:center">${i.quantidade}</td>
			<td style="text-align:center">${formatCurrency(i.valor_unitario)}</td>
			<td style="text-align:center">${formatCurrency(i.valor_total)}</td>
		</tr>`).join('')

      html = `<p class="item_nivel_1">1. Solicito verificar a possibilidade de empenhar o material abaixo discriminado com o recurso da ${ncNum} &nbsp; - ${ugNc} &ndash; ${dataNc}. Justificativa: aquisi&ccedil;&atilde;o de ${expressaoMaterial} para o B Mnt Sup Av Ex.</p>

<p class="item_nivel_2">- Preg&atilde;o Eletr&ocirc;nico n&ordm; ${pregao}, Preg&atilde;o NUP: ${nup}, UASG (160518) - Ba Av Taubaté, fornecedor: ${empresa}; CNPJ: ${formatCNPJ(cnpj)}; Sub-Item: ${siPad}.</p>

<table align="center" border="1" cellpadding="1" cellspacing="1" style="width:500px">
	<thead>
		<tr align="center" style="text-align:center; font-weight:bold">
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Item do Preg&atilde;o</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Descri&ccedil;&atilde;o</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Qtd</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Valor Unit&aacute;rio</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Valor Total</strong></th>
		</tr>
	</thead>
	<tbody>${linhasTabela}
	</tbody>
</table>
<p>&nbsp;</p>`
    } else if (aba === 'despacho') {
      assunto = `Despacho do OD autorizando o pagamento`
      html = `<p class="item_nivel_2">a) Autorizo o empenho da Requisi&ccedil;&atilde;o n&ordm; XXXX - Ba Av Taubat&eacute;, empregando o Cr&eacute;dito dispon&iacute;vel na nota de cr&eacute;dito ${ncNum} (UG ${ugNc} de ${dataNc}).</p>

<p class="item_nivel_2">b) Para fins, empregar os recursos conforme abaixo discriminado</p>

<table align="center" border="1" cellpadding="1" cellspacing="1" style="width:500px">
	<thead>
		<tr align="center" style="text-align:center; font-weight:bold">
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Unidade Or&ccedil;ament&aacute;ria</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>P T Res</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>PI</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>ND</strong></th>
			<th scope="col" align="center" style="text-align:center; font-weight:bold"><strong>Fonte de Recursos</strong></th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td style="text-align:center">${ugAprov}</td>
			<td>
			<table border="0" cellspacing="0">
				<tbody>
					<tr>
						<td style="text-align:center; vertical-align:middle">${ptres}</td>
					</tr>
				</tbody>
			</table>
			</td>
			<td>
			<table border="0" cellspacing="0">
				<tbody>
					<tr>
						<td style="text-align:center; vertical-align:middle">${pi}</td>
					</tr>
				</tbody>
			</table>
			</td>
			<td>
			<table border="0" cellspacing="0">
				<tbody>
					<tr>
						<td style="text-align:center; vertical-align:middle">${nd}</td>
					</tr>
				</tbody>
			</table>
			</td>
			<td style="text-align:center">1000000000</td>
		</tr>
	</tbody>
</table>
<p>&nbsp;</p>`
    }

    return (
      <div className="mt-4 border border-surface-600 rounded-lg overflow-hidden">
        <div className="flex bg-surface-700/50 border-b border-surface-600 overflow-x-auto">
          {[
            { id: 'termo', label: 'Termo de Abertura' },
            { id: 'assunto', label: 'Assunto do Processo' },
            { id: 'requisicao', label: 'Requisição' },
            { id: 'despacho', label: 'Despacho OD' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setAbaAtiva({ ...abaAtiva, [grupoId]: t.id })}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap ${aba === t.id ? 'bg-primary-900/40 text-primary-300 border-b-2 border-primary-500' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-600/30'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 bg-surface-800">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-surface-400 uppercase">Assunto</span>
              <button
                onClick={() => copyToClipboard(assunto, `${grupoId}-${aba}-assunto`)}
                className="btn-secondary !py-1 !px-2 text-[10px] flex items-center gap-1"
              >
                {copiado === `${grupoId}-${aba}-assunto` ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                Copiar Assunto
              </button>
            </div>
            <div className="p-2 bg-surface-900 border border-surface-700 rounded text-sm text-surface-200 font-medium">
              {assunto}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-surface-400 uppercase">Corpo do Texto (HTML)</span>
              <button
                onClick={() => copyToClipboard(html, `${grupoId}-${aba}-html`)}
                className="btn-primary !py-1 !px-2 text-[10px] flex items-center gap-1"
              >
                {copiado === `${grupoId}-${aba}-html` ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                Copiar HTML para SPED
              </button>
            </div>
            <div className="relative">
              <textarea
                readOnly
                value={html}
                className="w-full h-48 p-3 bg-surface-900 border border-surface-700 rounded font-mono text-[11px] text-surface-300 focus:outline-none focus:border-primary-500/50 resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-surface-800 border border-surface-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Espelho para SPED</h2>
            <p className="text-xs text-surface-400">Pedido #{String(pedido.numero).padStart(4, '0')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-surface-400 hover:text-surface-100 bg-surface-700/30 hover:bg-surface-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {grupos.length === 0 && (
            <p className="text-center text-surface-400 text-sm py-8">Nenhum item válido para gerar espelho.</p>
          )}

          {grupos.map((grupo) => {
            const { pregao, groupingKey, itensDaEmpresa } = grupo
            const empresa = groupingKey.split('::')[0]
            const grupoId = `${pregao}::${groupingKey}`
            const isExpanded = grupoExpandido === grupoId

            return (
              <div key={grupoId} className="border border-surface-700 bg-surface-800 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 bg-surface-700/20 hover:bg-surface-700/40 transition-colors"
                  onClick={() => setGrupoExpandido(isExpanded ? null : grupoId)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={16} className="text-surface-400" /> : <ChevronRight size={16} className="text-surface-400" />}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-surface-200">{empresa}</p>
                      <p className="text-xs text-surface-400">Pregão: {pregao} | Itens: {itensDaEmpresa.length}</p>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-surface-700">
                    {renderContent(grupo)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
