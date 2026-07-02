import { useState, useRef, useCallback } from 'react'

interface ItemDescTooltipProps {
  titulo: string
  descricaoCompleta: string
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
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    left: Math.min(pos.x + 12, window.innerWidth - 440),
    top: pos.y + 24,
    maxWidth: 420,
    minWidth: 260,
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 1.6,
    color: '#e2e8f0',
    background: 'rgba(13, 18, 30, 0.98)',
    border: '1px solid rgba(99, 119, 175, 0.4)',
    boxShadow: '0 10px 35px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.2)',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
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
