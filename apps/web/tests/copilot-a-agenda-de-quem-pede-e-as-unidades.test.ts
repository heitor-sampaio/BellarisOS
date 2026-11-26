import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O que o Copilot responde, pelo prompt (A19 e A20 da 34ª simulação):
 *
 * - A19, Decisão C do relatório (decisão do Claude, 26/11), "o Copilot faz o
 *   que a tela faz": quem tem a Agenda e NÃO atende e pede "a minha agenda"
 *   ouve que não atende, e a agenda da unidade se oferece (o Dênis ouviu "Não há
 *   agendamentos em aberto para você hoje", como se atendesse); quem atende
 *   sem a Agenda usa a Minha agenda; quem não tem nenhuma das duas, "a sua
 *   permissão não abre a agenda".
 * - A20: a unidade que a rede não tem ("Goiânia") se recusa antes de pedir o
 *   resto (a Zoraide ouviu primeiro "qual profissional?"); criar tag é
 *   configuração da rede, só da Admin da rede (§11 — o Copilot disse "quem tem
 *   Clientes em Gerenciar cria tag"); e numa rede de uma unidade só o número da
 *   unidade é o da rede ("não achei total da rede").
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>, over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Dênis', roleLabel: 'Atendimento',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}
const extras = { rede: 'Crisântemo', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null, fuso: 'America/Sao_Paulo' }
async function prompt(c: TenantContext, mais: Record<string, unknown> = {}) {
  const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
  return instrucoesDoCopilot(c, { ...extras, ...mais }).split('\n')
}

describe('A19 (Decisão C): "a minha agenda"', () => {
  it('com a Agenda e sem atender: diz que não atende e oferece a agenda da unidade', async () => {
    const p = await prompt(ctx({ agenda: 'VIEW', clients: 'VIEW' }))
    expect(p.some(l => /minha agenda/i.test(l) && /não atende/.test(l) && /agenda da unidade/.test(l))).toBe(true)
  })

  it('com a Agenda e atendendo: "a minha agenda" são os agendamentos com ela', async () => {
    const p = await prompt(ctx({ agenda: 'VIEW' }, { providesServices: true, atendeEm: ['b1'] }))
    expect(p.some(l => /minha agenda/i.test(l) && /agendamentos/.test(l) && /quem atende/.test(l))).toBe(true)
    expect(p.some(l => /minha agenda/i.test(l) && /não atende/.test(l))).toBe(false)
  })

  it('sem a Agenda e sem atender: "a sua permissão não abre a agenda", sem listar nada', async () => {
    const p = await prompt(ctx({ clients: 'VIEW' }))
    expect(p.some(l => /a sua permissão não abre a agenda/i.test(l))).toBe(true)
  })

  it('atendendo sem a Agenda: segue a Minha agenda (minha_agenda)', async () => {
    const p = (await prompt(ctx({}, { providesServices: true, atendeEm: ['b1'] }))).join('\n')
    expect(p).toMatch(/minha_agenda/)
    expect(p).not.toMatch(/a sua permissão não abre a agenda/i)
  })
})

describe('A20: os textos do modelo', () => {
  it('criar tag é só da Admin da rede; marcar a que existe pede Clientes em Gerenciar', async () => {
    const p = await prompt(ctx({ clients: 'VIEW', crm: 'MANAGE' }))
    const daTag = p.filter(l => /\btags?\b/i.test(l) && /criar/i.test(l))
    expect(daTag.some(l => /só (d)?a Admin da rede/.test(l))).toBe(true)
    expect(p.some(l => /[Mm]arcar[^\n]*tag[^\n]*Clientes em Gerenciar/.test(l))).toBe(true)
    // Nunca o "quem tem Clientes em Gerenciar cria tag".
    expect(p.some(l => /nunca diga que[^\n]*Clientes[^\n]*cria/i.test(l))).toBe(true)
  })

  it('marcar_tags, com a tag que não existe, diz que criar tag é só da Admin da rede', async () => {
    const { marcarTags } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    expect(marcarTags.descricao).toMatch(/só a Admin da rede/)
    const fonte = readFileSync(join(__dirname, '..', 'lib/copilot/ferramentas/clientes-escrita.ts'), 'utf8')
    expect(fonte).toMatch(/não existe na rede — criar tag é só da Admin da rede/)
  })

  it('a quem é da rede, o prompt diz as unidades da rede, e a que não existe se recusa antes do resto', async () => {
    const p = (await prompt(ctx({ agenda: 'MANAGE' }), { unidadesDaRede: ['Centro', 'Praia'] })).join('\n')
    expect(p).toMatch(/“Centro” e “Praia”/)
    expect(p).toMatch(/unidade que a rede não tem[^\n]*antes de perguntar/i)
  })

  it('numa rede de uma unidade só, o número da unidade é o da rede', async () => {
    const p = (await prompt(ctx({ agenda: 'MANAGE' }), { unidadesDaRede: ['Centro'] })).join('\n')
    expect(p).toMatch(/uma unidade só[^\n]*o da rede/i)
    const duas = (await prompt(ctx({ agenda: 'MANAGE' }), { unidadesDaRede: ['Centro', 'Praia'] })).join('\n')
    expect(duas).not.toMatch(/uma unidade só/i)
  })

  it('a rota passa as unidades da rede ao prompt', () => {
    const rota = readFileSync(join(__dirname, '..', 'app/api/copilot/route.ts'), 'utf8')
    expect(rota).toMatch(/unidadesDaRede/)
  })
})
