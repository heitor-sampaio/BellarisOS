import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * D2 e D5 da 16ª simulação (2026-11-15), o Copilot.
 *
 * D2 [princípio 7]: a Mirela (Agenda em Gerenciar, sem a Equipe) pediu "com o
 * Dr. Caio". O Copilot procurou o profissional pela `buscar`, que prometia
 * "membros da equipe" — e a busca só traz membro a quem tem a Equipe
 * (`MODULO_DO_TIPO.membro = 'team'`). "Nada encontrado", "não tenho uma lista
 * de profissionais", "sua permissão não me deixa": seis mensagens para um
 * agendamento. `agendar` e `horarios_livres` acham pelo NOME entre quem atende
 * (`resolverProfissional`), sem a Equipe. A busca não promete o que não traz,
 * e o Copilot é mandado ao caminho certo.
 *
 * D5 [princípios 3 e 4]: "Material de limpeza" foi lançado como "Compra de
 * estoque", que fica fora do resultado (`lib/financeiro/categorias.ts`). A
 * ferramenta diz o que é essa categoria e manda perguntar quando nada da lista
 * serve (ou usar "Outro") — sem categoria nova.
 */

vi.mock('@/actions/busca', () => ({ buscarTudo: async () => ({ grupos: [] }) }))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Mirela', roleLabel: 'Agenda',
    tenantId: 't1', branchId: 'b1', role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', ...permissions } as ResolvedPermissions,
    scopes: ALL_SCOPES, reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}

describe('D2: o profissional se acha pelo nome nas ferramentas da agenda, sem a Equipe', () => {
  it('a `buscar` não promete membros da equipe a quem não os vê', async () => {
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    expect(buscar.descricao).toMatch(/Equipe/)
    expect(buscar.descricao).toMatch(/agendar/)
    expect(buscar.descricao).toMatch(/horarios_livres/)
  })

  it('a `buscar` sem nada, a quem não tem a Equipe, aponta o caminho: o nome direto em agendar/horarios_livres', async () => {
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    const c = { ctx: ctx({ agenda: 'MANAGE', clients: 'MANAGE' }), slugDoPortal: 'moinhos', pagina: '/moinhos/agenda' }
    const r = await buscar.executar(c as unknown as Parameters<typeof buscar.executar>[0], { termo: 'Dr. Caio' })
    expect(JSON.stringify(r.dados)).toMatch(/horarios_livres/)
    expect(JSON.stringify(r.dados)).toMatch(/agendar/)
  })

  it('`agendar` e `horarios_livres` dizem que acham o profissional pelo nome, entre quem atende', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const { horariosLivres } = await import('@/lib/copilot/ferramentas/agenda')
    for (const d of [agendar.descricao, horariosLivres.descricao]) {
      expect(d).toMatch(/pelo nome/i)
      expect(d).toMatch(/quem atende/i)
    }
  })

  it('o prompt manda passar o nome do profissional direto, sem procurá-lo na busca', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ agenda: 'MANAGE' }), { rede: 'Jasmim', unidade: 'Moinhos', pagina: '/moinhos/agenda', slugDoPortal: 'moinhos', fuso: 'America/Sao_Paulo' })
    expect(texto).toMatch(/profissional[^\n]*pelo nome[^\n]*(agendar|horarios_livres)/i)
  })
})

describe('D5: a categoria da despesa', () => {
  it('a `lancar` diz o que é "Compra de estoque" (fora do resultado) e manda perguntar quando nada serve', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(lancar.descricao).toMatch(/Compra de estoque[^.]*mercadoria[^.]*estoque/i)
    expect(lancar.descricao).toMatch(/fora do (lucro|resultado)/i)
    expect(lancar.descricao).toMatch(/pergunte/i)
    expect(lancar.descricao).toMatch(/"Outro"/)
  })
})
