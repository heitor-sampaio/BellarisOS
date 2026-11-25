import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'

/**
 * As "Clientes específicas" da campanha não têm teto (PU-05 do catálogo das
 * Automações, princípio 2: o sistema não recusa o valor que a rede escolheu —
 * nada diz que passar de 200 é impossível). Eram cortadas em 200: a tela
 * travava a busca e o `filtrosDaCampanha` cortava em silêncio o que passasse
 * (princípio 3).
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

describe('"Clientes específicas" sem teto', () => {
  it('as 250 escolhidas vão todas ao público', () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i))
    expect(filtrosDaCampanha({ client_ids: ids }).client_ids).toHaveLength(250)
  })
  it('a busca não trava num máximo', () => {
    expect(fonte('components/admin/escolher-clientes.tsx')).not.toMatch(/maximo/)
    expect(fonte('components/admin/notification-campaign-form.tsx')).not.toMatch(/MAXIMO_DE_CLIENTES_ESPECIFICAS/)
  })
})
