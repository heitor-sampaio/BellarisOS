'use client'

import { BANDEIRAS, temBandeira } from '@/lib/financeiro/bandeiras'

/**
 * "Bandeira" no pagamento no cartão (r3-f13-01; o Heitor, 2026-11-03:
 * "Lembre-se, flexibilidade. Prazo por bandeira. Taxas também configuráveis por
 * bandeira."). Opcional: vazia, vale a regra geral do prazo da operadora e das
 * taxas da maquininha (Configurações → Comissões). Só no crédito e no débito.
 * Com `name`, vai no FormData do formulário.
 */
export function CampoDaBandeira({ metodo, valor, aoMudar, name, rotuloComoLabel = 'field-label' }: {
  metodo: string | null | undefined
  valor: string
  aoMudar: (v: string) => void
  name?: string
  /** A classe do rótulo, para seguir o formulário em volta. */
  rotuloComoLabel?: string
}) {
  if (!temBandeira(metodo)) return null
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className={rotuloComoLabel}>Bandeira (opcional)</span>
      <select className="field" name={name} aria-label="Bandeira" value={valor} onChange={e => aoMudar(e.target.value)}>
        <option value="">Não informada — vale a regra geral</option>
        {BANDEIRAS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
      </select>
    </label>
  )
}
