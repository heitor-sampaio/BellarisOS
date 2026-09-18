'use client'

import { useState } from 'react'
import { PlanejamentoTratamento } from '@/components/branch/planejamento-tratamento'
import { PlanejamentoInjetaveis } from '@/components/branch/planejamento-injetaveis'
import type { TreatmentProcedure, AvailableProduct } from '@/components/branch/treatment-plan-editor'

/**
 * Os planejamentos do cliente, lado a lado.
 *
 * São duas coisas irmãs e de naturezas diferentes — o plano de tratamento é
 * comercial (vira venda no checkout), o mapa de injetáveis é clínico (vira
 * registro no prontuário) — mas ambas são do CLIENTE e se abrem de qualquer
 * atendimento. Daí a mesma casa, com abas.
 */
export function PainelPlanejamento({
  clientId, branchId, slug, appointmentId = null,
  procedures, availableProducts = [],
  podeEditar, podeReceber = false,
}: {
  clientId:       string
  branchId:       string
  slug:           string
  appointmentId?: string | null
  procedures:     TreatmentProcedure[]
  availableProducts?: AvailableProduct[]
  podeEditar:     boolean
  podeReceber?:   boolean
}) {
  const [aba, setAba] = useState<'tratamento' | 'injetaveis'>('tratamento')

  // Os produtos do mapa são os do estoque: é o que a clínica de fato aplica.
  const produtosInjetaveis = availableProducts.map(p => p.name)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {([
          ['tratamento', 'Plano de tratamento'],
          ['injetaveis', 'Injetáveis'],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setAba(k)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border:     aba === k ? '2px solid var(--brand)' : '1.5px solid var(--border)',
              background: aba === k ? 'var(--brand)'           : 'var(--surface)',
              color:      aba === k ? '#fff'                   : 'var(--text)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'tratamento' ? (
        <PlanejamentoTratamento
          clientId={clientId}
          branchId={branchId}
          slug={slug}
          appointmentId={appointmentId}
          procedures={procedures}
          availableProducts={availableProducts}
          podeEditar={podeEditar}
          podeReceber={podeReceber}
        />
      ) : (
        <PlanejamentoInjetaveis
          clientId={clientId}
          branchId={branchId}
          slug={slug}
          appointmentId={appointmentId}
          produtos={produtosInjetaveis}
          podeEditar={podeEditar}
        />
      )}
    </div>
  )
}
