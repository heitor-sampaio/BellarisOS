'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SegSelect } from '@/components/shared/seg-select'
import { mesclarParams } from '@/lib/query-params'
import type { CRMFunnel } from '@/lib/crm'

/**
 * Seletor de funil — o mesmo no quadro do CRM, no dashboard e no comercial.
 *
 * O funil vive na URL (`?funil=`) para sobreviver a refresh, deep-link e ao
 * botão voltar. A query é remontada com `mesclarParams` porque essas telas
 * carregam outros parâmetros na mesma URL (`view`, `c`, `period`, `from`,
 * `to`) — montar do zero apagaria todos.
 *
 * Com um funil só o seletor não aparece: não há escolha a oferecer.
 */
export function FunnelSelect({
  funnels, activeId, compacto = false,
}: {
  funnels:  Pick<CRMFunnel, 'id' | 'name'>[]
  activeId: string
  /** Altura reduzida, para a barra de filtros do quadro. */
  compacto?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()

  if (funnels.length <= 1) return null

  return (
    <SegSelect
      options={funnels.map(f => ({ key: f.id, label: f.name }))}
      value={activeId}
      onSelect={id => router.push(mesclarParams(params, { funil: id }))}
      ariaLabel="Selecionar funil"
      compacto={compacto}
    />
  )
}
