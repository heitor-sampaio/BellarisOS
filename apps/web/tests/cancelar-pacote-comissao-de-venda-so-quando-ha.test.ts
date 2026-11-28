import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A16 da 43ª (princípio 3; comissoes:CQ-07 "O pacote trazido de fora não tem
 * comissão de venda", vendas:PA-26): a janela de cancelar o pacote de antes
 * dizia "a comissão de venda volta na proporção do que caiu" — o texto era
 * fixo, e o pacote trazido não tem comissão de venda (nem a venda de pacote
 * sem a comissão ligada, nem o plano sem o "Venda de plano"). A frase só
 * aparece quando a venda TEM a linha de comissão de venda (a do pacote,
 * `client_package_id`, ou a do plano, `treatment_plan_id`, sem atendimento).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

const consultas: { tabela: string; filtros: [string, string, unknown][] }[] = []
let linhas: unknown[] = []
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const c = { tabela, filtros: [] as [string, string, unknown][] }
      consultas.push(c)
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { c.filtros.push(['eq', col, v]); return q },
        is: (col: string, v: unknown) => { c.filtros.push(['is', col, v]); return q },
        limit: () => q,
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok),
      }
      return q
    },
  }),
}))

beforeEach(() => { consultas.length = 0; linhas = [] })

describe('a janela de cancelar só fala da comissão de venda quando ela existe', () => {
  it('o fim da janela, com e sem a comissão de venda', async () => {
    const { fimDoCancelamento } = await import('@/lib/pacotes/cancelamento')
    expect(fimDoCancelamento(true))
      .toBe('As sessões que sobraram deixam de valer, e a comissão de venda volta na proporção do que caiu. Não se desfaz.')
    expect(fimDoCancelamento(false)).toBe('As sessões que sobraram deixam de valer. Não se desfaz.')
  })

  it('o pacote: a linha de venda dele (sem atendimento, ativa) na rede', async () => {
    const { temComissaoDeVenda } = await import('@/lib/pacotes/comissao-de-venda-do-cancelamento')
    expect(await temComissaoDeVenda('rede-1', { pacote: 'cp-1' })).toBe(false)
    linhas = [{ id: 'l1' }]
    expect(await temComissaoDeVenda('rede-1', { pacote: 'cp-1' })).toBe(true)
    expect(consultas[0]!.tabela).toBe('commission_lines')
    expect(consultas[0]!.filtros).toEqual(expect.arrayContaining([
      ['eq', 'tenant_id', 'rede-1'], ['eq', 'client_package_id', 'cp-1'], ['is', 'appointment_id', null], ['eq', 'status', 'ATIVA'],
    ]))
  })

  it('o plano: a linha de venda dele (sem atendimento, ativa) na rede', async () => {
    const { temComissaoDeVenda } = await import('@/lib/pacotes/comissao-de-venda-do-cancelamento')
    linhas = [{ id: 'l2' }]
    expect(await temComissaoDeVenda('rede-1', { plano: 'p-1' })).toBe(true)
    expect(consultas[0]!.filtros).toEqual(expect.arrayContaining([
      ['eq', 'tenant_id', 'rede-1'], ['eq', 'treatment_plan_id', 'p-1'], ['is', 'appointment_id', null], ['eq', 'status', 'ATIVA'],
    ]))
  })

  it('as duas prévias levam a resposta, e a janela a lê (sem o texto fixo)', () => {
    expect(fonte('actions/pacotes.ts')).toMatch(/comissaoDeVenda: await temComissaoDeVenda\(ctx\.tenantId!, \{ pacote: cp\.id \}\)/)
    expect(fonte('actions/treatment-plans.ts')).toMatch(/comissaoDeVenda: await temComissaoDeVenda\(ctx\.tenantId!, \{ plano: plano\.id \}\)/)
    const janela = fonte('components/shared/cancelar-pacote.tsx')
    expect(janela).toContain('fimDoCancelamento(previa.comissaoDeVenda === true)')
    expect(janela).not.toContain('a comissão de venda volta na proporção do que caiu')
  })
})
