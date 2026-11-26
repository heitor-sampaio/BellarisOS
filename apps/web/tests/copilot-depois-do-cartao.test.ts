import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * D10 da 32ª simulação (2026-11-26): a Nadja confirmou o cartão "Agendar Karen
 * Lazzari" ("Feito"), e na mensagem seguinte o Copilot disse "Não há nenhum
 * agendamento confirmado para ela em 27/11. Quer que eu gere o cartão?". O
 * modelo leu a nota "A pessoa CONFIRMOU e foi gravado" como a situação
 * "Confirmado" do agendamento, procurou os confirmados (o agendamento nasce
 * "Agendado") e ofereceu o cartão de novo. Princípio 3 e docs/regras/copilot.md
 * (o cartão confirmado é o que vale): a nota diz que JÁ está gravado, que o
 * "Confirmar" do cartão não é a situação de nada, e que o cartão não se oferece
 * de novo; a leitura feita com um cartão ainda esperando diz que o que ele
 * grava ainda não existe.
 */
describe('D10: depois do cartão, o turno seguinte vê o que o cartão gravou', () => {
  it('a nota do cartão feito diz que está gravado e não confunde com a situação "Confirmado"', async () => {
    const { notaDaDecisao } = await import('@/lib/copilot/executor')
    const t = notaDaDecisao('Agendar Karen Lazzari', 'feita', 'Agendado para 27/11, 10:00.')
    expect(t).toContain('Agendar Karen Lazzari')
    expect(t).toContain('Agendado para 27/11, 10:00.')
    expect(t).toMatch(/já está gravado/i)
    expect(t).toMatch(/não é a situação/i)
    expect(t).toMatch(/não prepare o mesmo cartão de novo/i)
  })

  it('a nota do cartão que falhou diz que nada foi gravado', async () => {
    const { notaDaDecisao } = await import('@/lib/copilot/executor')
    expect(notaDaDecisao('Agendar Karen', 'falhou', 'O horário foi ocupado.')).toMatch(/NÃO foi gravado: O horário foi ocupado\./)
  })

  it('a consulta feita com um cartão esperando diz que ele ainda não gravou', async () => {
    vi.doMock('@/lib/copilot/ferramentas', async orig => {
      const real = await orig<typeof import('@/lib/copilot/ferramentas')>()
      const lerTeste = {
        nome: 'ler_teste', tipo: 'leitura', descricao: 'teste', parametros: (await import('zod/v4')).z.object({}),
        executar: async () => ({ dados: { agendamentos: [] } }),
      }
      return { ...real, FERRAMENTAS: [...real.FERRAMENTAS, lerTeste] }
    })
    vi.resetModules()
    const { executarChamada } = await import('@/lib/copilot/executor')
    const pendente = { id: 'a1', resumo: { titulo: 'Agendar Karen Lazzari' }, status: 'pendente', expira_em: '2999-01-01T00:00:00Z' }
    const admin = {
      from(tabela: string) {
        const linhas = tabela === 'copilot_acoes' ? [pendente] : []
        const encadeia: unknown = new Proxy({}, {
          get(_, prop: string) {
            if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: linhas, error: null })
            return () => encadeia
          },
        })
        return encadeia
      },
    }
    const r = await executarChamada({ ctx: ctx(), admin: admin as never, pagina: '/admin/dashboard', slugDoPortal: null, conversaId: 'conv-1' },
      { nome: 'ler_teste', argumentos: '{}' })
    const dados = r.paraOModelo as { cartaoEsperando?: string }
    expect(dados.cartaoEsperando).toContain('Agendar Karen Lazzari')
    expect(dados.cartaoEsperando).toMatch(/ainda não/i)
    vi.doUnmock('@/lib/copilot/ferramentas')
  })

  it('o prompt separa o "Confirmar" do cartão da situação "Confirmado" do agendamento', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Ninfeia', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/O “Confirmar” do cartão não é a situação “Confirmado”/)
  })
})

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-nadja', userName: 'Nadja', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: null, unidades: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', agenda: 'MANAGE', clients: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
