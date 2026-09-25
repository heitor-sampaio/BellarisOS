'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { PlanejamentoTratamento } from '@/components/branch/planejamento-tratamento'
import { PlanejamentoInjetaveis } from '@/components/branch/planejamento-injetaveis'
import type { TreatmentProcedure, AvailableProduct } from '@/components/branch/treatment-plan-editor'
import { rotaComParams } from '@/lib/query-params'
import { SegSelect } from '@/components/shared/seg-select'

type Aba = 'tratamento' | 'injetaveis'

/**
 * Os planejamentos do cliente, lado a lado.
 *
 * São duas coisas irmãs e de naturezas diferentes — o plano de tratamento é
 * comercial (vira venda no checkout), o mapa de injetáveis é clínico (vira
 * registro no prontuário) — mas ambas são do CLIENTE e se abrem de qualquer
 * atendimento. Daí a mesma casa, com abas.
 *
 * Na ficha do cliente (`navegarPorUrl`), a aba e o que está aberto moram na
 * URL: o voltar do aparelho anda um passo de cada vez — plano → lista de
 * planos → aba anterior → lista de clientes — em vez de sair da ficha inteira.
 * Dentro de um atendimento não: ali a URL é a do atendimento, e empurrar
 * histórico atrapalharia quem está no meio de uma sessão.
 */
export function PainelPlanejamento({
  clientId, branchId, slug, appointmentId = null,
  procedures, availableProducts = [],
  podeEditar, podeReceber = false, navegarPorUrl = false,
}: {
  clientId:       string
  branchId:       string
  slug:           string
  appointmentId?: string | null
  procedures:     TreatmentProcedure[]
  availableProducts?: AvailableProduct[]
  podeEditar:     boolean
  podeReceber?:   boolean
  /** Guarda a aba e o item aberto na URL, em vez de em estado local. */
  navegarPorUrl?: boolean
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const [abaLocal,    setAbaLocal]    = useState<Aba>('tratamento')
  const [abertoLocal, setAbertoLocal] = useState<string | null>(null)

  const abaDaUrl = params.get('planejamento')
  const aba: Aba = navegarPorUrl
    ? (abaDaUrl === 'injetaveis' ? 'injetaveis' : 'tratamento')
    : abaLocal
  const aberto = navegarPorUrl ? params.get('aberto') : abertoLocal

  function trocarAba(k: Aba) {
    if (!navegarPorUrl) { setAbaLocal(k); setAbertoLocal(null); return }
    // O item aberto é de uma aba só: mantê-lo ao trocar abriria um mapa com o
    // id de um plano.
    router.push(rotaComParams(pathname, params, {
      planejamento: k === 'tratamento' ? null : k,
      aberto: null,
    }), { scroll: false })
  }

  function abrir(id: string | null) {
    if (!navegarPorUrl) { setAbertoLocal(id); return }
    router.push(rotaComParams(pathname, params, { aberto: id }), { scroll: false })
  }

  // Os produtos do mapa são os do estoque: é o que a clínica de fato aplica.
  const produtosInjetaveis = availableProducts.map(p => p.name)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <SegSelect
          options={[
            { key: 'tratamento', label: 'Plano de tratamento' },
            { key: 'injetaveis', label: 'Injetáveis' },
          ]}
          value={aba}
          onSelect={k => trocarAba(k as Aba)}
          ariaLabel="Seção do planejamento"
        />
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
          abertoId={aberto}
          onAbrir={abrir}
        />
      ) : (
        <PlanejamentoInjetaveis
          clientId={clientId}
          branchId={branchId}
          slug={slug}
          appointmentId={appointmentId}
          produtos={produtosInjetaveis}
          podeEditar={podeEditar}
          abertoId={aberto}
          onAbrir={abrir}
        />
      )}
    </div>
  )
}
