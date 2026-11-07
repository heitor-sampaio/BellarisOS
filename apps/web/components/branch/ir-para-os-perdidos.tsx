'use client'

/**
 * A44 da 9ª simulação: o card perdido fica na coluna Perdido, fora da primeira
 * dobra do quadro. O "N perdidos" do resumo leva até ela (a coluna de desfecho
 * LOST, `data-coluna-desfecho`), sem rolar à mão.
 */
export function IrParaOsPerdidos({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" title="Ver a coluna dos perdidos"
      onClick={() => document.querySelector('[data-coluna-desfecho="LOST"]')
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </button>
  )
}
