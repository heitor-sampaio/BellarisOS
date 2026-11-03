import { describe, it, expect } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { ferramentasDoCargo } from '@/lib/copilot/executor'
import { indicadores } from '@/lib/copilot/ferramentas/indicadores'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O dinheiro de Relatórios segue as ABAS do cargo, e o Copilot também
 * (decisão do Heitor, 2026-11-01: "concordo" — "Quem não tem Financeiro vê o
 * dinheiro nos Relatórios e no Copilot pela aba"). A ferramenta `indicadores`
 * é a única do Copilot com o dinheiro dos Relatórios, e confere a aba
 * (`podeVerRelatorio`) antes de ler qualquer número; os lançamentos seguem o
 * módulo Financeiro, como a tela do Financeiro.
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>, reportTabs: TenantContext['reportTabs']): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana', roleLabel: 'Contadora',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
    scopes: ALL_SCOPES, reportTabs, providesServices: false, isNetworkAdmin: false, isClient: false,
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
      expect(r.dados, aba).toEqual({ erro: expect.stringContaining(`não vê a aba "${aba}"`) })
    }
  })

  it('com a aba e SEM o Financeiro, o Copilot lê o dinheiro dela (como a tela)', () => {
    const contadora = ctx({ reports: 'VIEW' }, ['overview', 'financeiro'])
    expect(nomes(contadora)).toContain('indicadores')
    expect(nomes(contadora)).not.toContain('lancamentos')
  })

  it('com o Financeiro e SEM Relatórios, os lançamentos (a tela do Financeiro), não os indicadores', () => {
    const financeiro = ctx({ financial: 'VIEW' }, [])
    expect(nomes(financeiro)).toContain('lancamentos')
    expect(nomes(financeiro)).not.toContain('indicadores')
  })
})
