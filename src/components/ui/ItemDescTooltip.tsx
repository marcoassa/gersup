import { useState, useRef, useCallback } from 'react'

interface ItemDescTooltipProps {
  titulo: React.ReactNode
  descricaoCompleta: React.ReactNode
}

/**
 * Exibe o título curto do item do pregão com tooltip estilizado
 * mostrando a descrição completa ao passar o mouse.
 *
 * Usa `position: fixed` para escapar do overflow:hidden/overflow-x:auto
 * da tabela de itens.
 */
export default function ItemDescTooltip({ titulo, descricaoCompleta }: ItemDescTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLSpanElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY })
    setVisible(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setVisible(false)
  }, [])

  // Calcula posição do tooltip: prefere abaixo do cursor; se muito perto do
  // fundo da tela, coloca acima.
  const isBottomHalf = pos.y > window.innerHeight / 2;
  
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    left: Math.min(pos.x + 12, window.innerWidth - 560),
    ...(isBottomHalf 
      ? { bottom: window.innerHeight - pos.y + 12 } 
      : { top: pos.y + 24 }),
    maxWidth: 560,
    minWidth: 280,
    maxHeight: '480px',
    overflowY: 'auto',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 1.6,
    color: '#e2e8f0',
    background: 'rgba(13, 18, 30, 0.98)',
    border: '1px solid rgba(99, 119, 175, 0.4)',
    boxShadow: '0 10px 35px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.2)',
    wordBreak: 'break-word',
    whiteSpace: 'pre-line',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 0.18s ease, transform 0.18s ease',
  }

  return (
    <>
      <span
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: 'help',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '3px',
          textDecorationColor: 'rgb(100 116 139 / 0.6)',
        }}
      >
        {titulo}
      </span>

      {/* Tooltip renderizado fora do fluxo normal via portal-like inline */}
      {visible && (
        <div style={tooltipStyle}>
          {descricaoCompleta}
        </div>
      )}
    </>
  )
}

interface ResumoTRTooltipContentProps {
  texto: string | null | undefined
  tituloItem?: string
  numeroItem?: number | string | null
}

/**
 * Renderiza o conteúdo completo do Termo de Referência (TR) ao passar o mouse.
 */
export function ResumoTRTooltipContent({
  texto,
  tituloItem,
  numeroItem,
}: ResumoTRTooltipContentProps) {
  if (!texto) return null
  const limpo = texto.replace(/\r\n/g, '\n').trim()

  return (
    <div className="space-y-2 font-sans text-left min-w-[280px]">
      <div className="text-[10px] font-bold tracking-wider text-primary-400 uppercase pb-1.5 border-b border-surface-700/60 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span>📄</span>
          <span>{tituloItem || 'Termo de Referência Completo'}</span>
        </span>
        {numeroItem != null && (
          <span className="text-[9px] text-amber-300 font-mono font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
            Item {numeroItem}
          </span>
        )}
      </div>

      <div className="text-surface-200 leading-relaxed text-xs whitespace-pre-wrap select-text">
        {limpo}
      </div>
    </div>
  )
}

