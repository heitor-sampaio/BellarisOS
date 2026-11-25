import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/notifications/push', () => ({
  sendFcmToTokens: vi.fn(async () => undefined),
  sendWebPushToSubs: vi.fn(async () => undefined),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { enviarCampanha } from '@/lib/notifications/envio-da-campanha'

/**
 * D9 da 28ª: a campanha contava "2 enviadas" e marcava "Enviada" a cliente sem
 * aparelho (a Iara, sem o app). NC-06 e princípio 3: a campanha é aviso no
 * celular (D-3, o Heitor, 29/10); sem aparelho registrado o aviso fica
 * guardado no sino do app e NÃO conta como enviada — como a automação já diz
 * (`lib/automacoes/acoes-mensagem.ts`).
 */
function bancoFalso(aparelhos: { client_id: string; token: string | null; endpoint: string | null; keys: null }[]) {
  const atualizacoes: { valores: Record<string, unknown>; ids: string[] }[] = []
  const resp = <T>(data: T) => Promise.resolve({ data, error: null })
  const admin = {
    from(tabela: string) {
      return {
        upsert(linhas: { client_id: string }[]) {
          return { select: () => resp(linhas.map((l, i) => ({ id: `d${i}`, client_id: l.client_id }))) }
        },
        insert(linhas: { client_id: string }[]) {
          return { select: () => resp(linhas.map((l, i) => ({ id: `n${i}`, client_id: l.client_id }))) }
        },
        update(valores: Record<string, unknown>) {
          return {
            eq: (_c: string, id: string) => { atualizacoes.push({ valores, ids: [id] }); return resp(null) },
            in: (_c: string, ids: string[]) => { atualizacoes.push({ valores, ids }); return resp(null) },
          }
        },
        tabela,
      }
    },
    rpc: () => resp(aparelhos),
  }
  return { admin, atualizacoes }
}

describe('a campanha não conta como enviada a cliente sem aparelho', () => {
  it('duas clientes, só uma com aparelho: 1 enviada, e a outra fica GUARDADA no sino', async () => {
    const { admin, atualizacoes } = bancoFalso([{ client_id: 'com', token: 'tok', endpoint: null, keys: null }])
    const n = await enviarCampanha(admin as never, { id: 'camp', title: 'Oi', body: 'VIP', notification_type: 'PROMO' },
      [{ id: 'com', name: 'Larissa' }, { id: 'sem', name: 'Iara' }], '2026-11-24')
    expect(n).toBe(1)
    const guardadas = atualizacoes.filter(a => a.valores.status === 'GUARDADA').flatMap(a => a.ids)
    expect(guardadas).toEqual(['d1'])
  })
  it('o detalhe da campanha diz "Guardada no sino", não "Falhou" nem "Enviada"', () => {
    const p = readFileSync(join(__dirname, '..', 'app/admin/notificacoes/[id]/page.tsx'), 'utf8')
    expect(p).toMatch(/d\.status === 'GUARDADA'\s*\?\s*\{ label: 'Guardada no sino'/)
  })
})
