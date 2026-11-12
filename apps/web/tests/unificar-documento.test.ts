import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import { atualizarFichaComOPreenchido } from '@/lib/clients/ja-existe'

/**
 * C31 do levantamento das regras (F70): "Unificar com a ficha" trazendo um
 * PASSAPORTE (ou RNE) gravava por cima — entrava na ficha que já tinha CPF, e
 * trocava o passaporte diferente que ela tinha. Agora segue a regra do CPF:
 * a ficha tem UM documento, e o diferente é recusado.
 */

type Ficha = { name: string; document: string | null; documento_tipo: string | null; documento_numero: string | null; notes: null; tags: null; is_active: true }
const base: Ficha = { name: 'Ana', document: null, documento_tipo: null, documento_numero: null, notes: null, tags: null, is_active: true }

/** Lê a ficha; qualquer gravação é anotada (o teste confere que nada se gravou). */
function adminFalso(ficha: Ficha, gravou: string[]) {
  const q = {
    select: () => q, eq: () => q, neq: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve({ data: ficha, error: null }),
    update: () => { gravou.push('update'); return q },
    then: (ok: (r: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
  }
  return { from: () => q } as unknown as Parameters<typeof atualizarFichaComOPreenchido>[0]
}
const ctx = { tenantId: 't' } as TenantContext
const passaporte = (numero: string) => ({ document: null, documento_tipo: 'PASSAPORTE', documento_numero: numero })

describe('C31: unificar com passaporte segue a regra do CPF', () => {
  it('a ficha que já tem CPF não ganha um passaporte', async () => {
    const gravou: string[] = []
    const r = await atualizarFichaComOPreenchido(adminFalso({ ...base, document: '52998224725' }, gravou), ctx, 'c', { documento: passaporte('AB123') })
    expect(r.error).toMatch(/já tem CPF/)
    expect(gravou).toEqual([])
  })

  it('o passaporte diferente do que a ficha tem é recusado', async () => {
    const gravou: string[] = []
    const r = await atualizarFichaComOPreenchido(adminFalso({ ...base, documento_tipo: 'PASSAPORTE', documento_numero: 'XY999' }, gravou), ctx, 'c', { documento: passaporte('AB123') })
    expect(r.error).toMatch(/outro documento/)
    expect(gravou).toEqual([])
  })
})
