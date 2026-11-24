import { describe, it, expect } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { ferramentasDoCargo } from '@/lib/copilot/executor'
import { indicadores } from '@/lib/copilot/ferramentas/indicadores'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * O dinheiro de Relatórios segue as ABAS do cargo, e o Copilot também
 * (decisão do Heitor, 2026-11-01). A ferramenta `indicadores` é a única do
 * Copilot com o dinheiro dos Relatórios, e confere a aba (`podeVerRelatorio`)
 * antes de ler qualquer número; os lançamentos seguem o módulo Financeiro,
 * como a tela do Financeiro.
 *
 * Mudou em 2026-11-23 (o Heitor: "financeiro é uma coisa, vendas é outra.
 * financeiro ve entrada/saida/lucro, tudo. vendas é sobre performance de
 * vendas."): a aba Financeiro só vale com o Financeiro em Ver — sem ele, a aba
 * marcada não abre, nem na tela nem no Copilot.
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>, reportTabs: TenantContext['reportTabs']): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana', roleLabel: 'Contadora',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
    reportTabs, providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  }
}
const nomes = (c: TenantContext) => ferramentasDoCargo(c).map(f => f.nome)
// A recusa sai antes de qualquer consulta: o contexto de execução não precisa do banco.
const executar = (c: TenantContext, aba: Parameters<typeof indicadores.executar>[1]['aba']) =>
  indicadores.executar({ ctx: c } as unknown as Parameters<typeof indicadores.executar>[0], { aba })

describe('o dinheiro do Copilot segue as abas de Relatórios', () => {
  it('sem a aba, a ferramenta recusa e não devolve número nenhum', async () => {
    const soAgenda = ctx({ reports: 'VIEW' }, ['agenda'])
    for (const aba of ['overview', 'financeiro', 'vendas', 'procedimentos', 'profissionais', 'clientes'] as const) {
      const r = await executar(soAgenda, aba)
      expect(r.dados, aba).toEqual({ erro: expect.stringContaining(`não abre a aba "${aba}"`) })
    }
  })

  it('com as abas e SEM o Financeiro, o Copilot tem os indicadores, mas a aba Financeiro pede o Financeiro (como a tela)', async () => {
    const contadora = ctx({ reports: 'VIEW' }, ['overview', 'financeiro'])
    expect(nomes(contadora)).toContain('indicadores')
    expect(nomes(contadora)).not.toContain('lancamentos')
    const r = await executar(contadora, 'financeiro')
    expect(r.dados).toEqual({ erro: expect.stringContaining('pede o Financeiro') })
  })

  it('com o Financeiro e SEM Relatórios, os lançamentos (a tela do Financeiro), não os indicadores', () => {
    const financeiro = ctx({ financial: 'VIEW' }, [])
    expect(nomes(financeiro)).toContain('lancamentos')
    expect(nomes(financeiro)).not.toContain('indicadores')
  })
})

describe('o Copilot oferece e indica só o que a permissão da pessoa abre (princípio 3, copilot.md)', () => {
  const ler = (f: string) => nodeFs.readFileSync(nodePath.resolve(__dirname, '..', f), 'utf8')

  describe('a abertura do Copilot oferece só o que a permissão faz', () => {
    it('sem a agenda, sem números e sem cadastrar, nada disso aparece', async () => {
      const { aberturaDoCopilot } = await import('@/lib/copilot/abertura')
      const so = aberturaDoCopilot({ ferramentas: ['buscar', 'cliente'], veFaturamento: false })
      expect(so.texto).not.toMatch(/agendar|cadastrar|números|agenda/)
      expect(so.texto).toMatch(/achar um cliente/)
      expect(so.texto).not.toMatch(/confirmação/)
      expect(so.sugestoes).toEqual([])
      const tudo = aberturaDoCopilot({
        ferramentas: ['agendamentos', 'horarios_livres', 'cliente', 'indicadores', 'cadastrar_cliente', 'agendar'], veFaturamento: true,
      })
      expect(tudo.texto).toBe('Olá! Peça o que precisar: consultar a agenda, achar um cliente, ver números, cadastrar ou agendar. Toda gravação passa pela sua confirmação.')
      expect(tudo.sugestoes).toEqual([
        'Quais são os horários livres amanhã?', 'Quem são os agendamentos de hoje?', 'Quanto faturamos este mês?', 'Cadastrar uma cliente nova',
      ])
      // Os números sem o dinheiro: não oferece "Quanto faturamos".
      expect(aberturaDoCopilot({ ferramentas: ['indicadores'], veFaturamento: false }).sugestoes).toEqual([])
    })
    it('o painel usa a abertura do servidor, não uma lista fixa', () => {
      const tela = ler('components/copilot/copilot.tsx')
      expect(tela).not.toContain("'Cadastrar uma cliente nova'")
      expect(tela).not.toContain('cadastrar ou agendar')
      expect(tela).toContain('aberturaDoCopilotNaTela(')
      expect(ler('actions/copilot.ts')).toMatch(/export async function aberturaDoCopilotNaTela[\s\S]*ferramentasDoCargo\(/)
    })
  })

  describe('o Copilot não manda a pessoa a uma tela que ela não tem', () => {
    it('sem o PDV, não indica o PDV; sem o dinheiro, não indica o Dashboard para ele', async () => {
      const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
      const { NO_PERMISSIONS } = await import('@/lib/permissions')
      const base = {
        userId: 'a', internalUserId: 'u', userName: 'Ana', roleLabel: 'X', tenantId: 't', branchId: 'b1', unidades: ['b1'],
        role: 'RECEPTIONIST', roleId: 'r', clientId: null, reportTabs: [], providesServices: false,
        isNetworkAdmin: false, isClient: false, plano: null,
      }
      const extras = { rede: 'Rede', unidade: 'Pajuçara', pagina: '/pajucara/dashboard', slugDoPortal: 'pajucara' }
      const sem = instrucoesDoCopilot({ ...base, permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', agenda: 'VIEW' } } as never, extras)
      expect(sem).not.toMatch(/indique o PDV|dê o link do PDV/)
      expect(sem).toMatch(/A permissão dela não recebe nem vende/)
      expect(sem).toMatch(/não mostra os valores/)
      const com = instrucoesDoCopilot({ ...base, permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', cashier: 'MANAGE', financial: 'VIEW' } } as never, extras)
      expect(com).toMatch(/indique o PDV/)
      expect(com).not.toMatch(/não mostra os valores/)
    })
  })
})
