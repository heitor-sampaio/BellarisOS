'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegSelect } from '@/components/shared/seg-select'
import { Dica } from '@/components/shared/dica'
import { mesclarParams } from '@/lib/query-params'
import type { CRMFunnel } from '@/lib/crm'
import { cookieDoFunilLembrado, funilParaLembrar } from '@/lib/crm/funil-lembrado'

/**
 * Seletor de funil — o mesmo no quadro do CRM, no dashboard e no comercial.
 *
 * O funil vive na URL (`?funil=`) para sobreviver a refresh, deep-link e ao
 * botão voltar. A query é remontada com `mesclarParams` porque essas telas
 * carregam outros parâmetros na mesma URL (`view`, `c`, `period`, `from`,
 * `to`) — montar do zero apagaria todos.
 *
 * Com um funil só o seletor não aparece: não há escolha a oferecer.
 *
 * A escolha também fica anotada (A34 da 23ª, `lib/crm/funil-lembrado.ts`):
 * sem `?funil=`, a tela abre no último escolhido. O `?funil=` que abriu a
 * tela também conta (A42 da 24ª), e a dica diz que o lembrado é deste navegador.
 */
export function FunnelSelect({
  funnels, activeId,
}: {
  funnels:  Pick<CRMFunnel, 'id' | 'name'>[]
  activeId: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const pedido = params.get('funil')

  useEffect(() => {
    const lembrar = funilParaLembrar(pedido, activeId)
    if (lembrar) document.cookie = cookieDoFunilLembrado(lembrar)
  }, [pedido, activeId])

  if (funnels.length <= 1) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <SegSelect
        options={funnels.map(f => ({ key: f.id, label: f.name }))}
        value={activeId}
        onSelect={id => {
          document.cookie = cookieDoFunilLembrado(id)
          router.push(mesclarParams(params, { funil: id }))
        }}
        ariaLabel="Selecionar funil"
      />
      <Dica rotulo="Sobre o funil que abre">
        O funil escolhido (aqui ou por um link) fica lembrado neste navegador: as Oportunidades e os Relatórios
        abrem nele. Em outro aparelho ou navegador, abrem no funil padrão — ou, sem oportunidade nele, no primeiro
        funil que tem.
      </Dica>
    </span>
  )
}
