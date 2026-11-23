import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta da agenda carrega o Supabase e o núcleo:
// sozinho leva 1 s, mas sob a suíte inteira em paralelo passava dos 5 s do padrão.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D4, A22, A23, A24 e A25 da 17ª simulação (2026-11-15), o Copilot.
 *
 * D4 [3]: a descrição de `horarios_livres` dizia "das 8h às 20h", e o modelo
 * leu a grade de 30 em 30 como a agenda inteira: disse que 21:25 "não está
 * disponível", e o `agendar` aceitava esse horário.
 * A22 [7]: a lista de categorias de despesa não tinha material de consumo.
 * A23 [3]: os cartões de remarcar e cancelar prometiam o aviso ao cliente
 * sempre; o de agendar já dizia o canal de fato.
 * A24 [3]: a recusa da comissão mandava a uma tela onde a pessoa também não pode.
 * A25 [7]: o "Continuar a conversa anterior" ficava abaixo do "Olá".
 */

vi.mock('@/actions/busca', () => ({ buscarTudo: async () => ({ grupos: [] }) }))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Tânia', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: 'b1', role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', ...permissions } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
const extras = { rede: 'Camélia', unidade: 'Savassi', pagina: '/savassi/agenda', slugDoPortal: 'savassi', fuso: 'America/Sao_Paulo' }

describe('D4: a grade de horarios_livres é sugestão; o horário pedido se tenta no agendar', () => {
  it('a descrição não diz o horário fixo de antes, e diz que é o horário da unidade e uma sugestão', async () => {
    const { horariosLivres } = await import('@/lib/copilot/ferramentas/agenda')
    expect(horariosLivres.descricao).not.toMatch(/8h às 20h/)
    expect(horariosLivres.descricao).toMatch(/horário da unidade/i)
    expect(horariosLivres.descricao).toMatch(/sugest/i)
    expect(horariosLivres.descricao).toMatch(/agendar/)
  })

  it('o prompt manda tentar o agendar com o horário pedido, sem concluir da grade que está ocupado', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ agenda: 'MANAGE' }), extras)
    expect(texto).toMatch(/chame agendar[^\n]*horário pedido/i)
    expect(texto).toMatch(/fora da grade[^\n]*(não|nunca)[^\n]*ocupado/i)
  })
})

describe('A22: "Material de consumo (limpeza, copa)" na lista única', () => {
  it('a `lancar` oferece a categoria e diz que o material de limpeza vai nela', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(lancar.descricao).toContain('Material de consumo (limpeza, copa)')
    expect(lancar.descricao).toMatch(/limpeza[^.]*"Material de consumo \(limpeza, copa\)"/)
  })
})

describe('A23: os cartões de remarcar e de cancelar dizem o canal de fato', () => {
  it('o aviso do remarcar e do cancelar segue o acesso ao app e o plano', async () => {
    const { avisoDaAgendaParaACliente } = await import('@/lib/copilot/ferramentas/aviso-do-agendar')
    expect(avisoDaAgendaParaACliente('remarcar', { temAcesso: true, portalNoPlano: true })).toBe('Ela recebe o aviso “Agendamento remarcado” no app.')
    expect(avisoDaAgendaParaACliente('cancelar', { temAcesso: true, portalNoPlano: true })).toBe('Ela recebe o aviso “Agendamento cancelado” no app.')
    expect(avisoDaAgendaParaACliente('remarcar', { temAcesso: false, portalNoPlano: true })).toBe('Nada é enviado a ela agora: ela não tem acesso ao app.')
    expect(avisoDaAgendaParaACliente('cancelar', { temAcesso: true, portalNoPlano: false })).toBe('Nada é enviado a ela agora: a rede não tem o app da cliente no plano.')
  })
  it('o texto fixo saiu dos cartões', () => {
    const f = readFileSync(join(__dirname, '..', 'lib/copilot/ferramentas/agenda-escrita.ts'), 'utf8')
    expect(f).not.toContain('O cliente recebe o aviso do novo horário.')
    expect(f).not.toContain('O cliente recebe o aviso do cancelamento.')
  })
})

describe('A24: a recusa fala da permissão, sem mandar a uma tela onde a pessoa também não pode', () => {
  it('o prompt diz o nível de cada módulo da pessoa', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ agenda: 'MANAGE', financial: 'VIEW' }), extras)
    expect(texto).toMatch(/Financeiro e comissões: Ver/)
    expect(texto).toMatch(/Agenda: Gerenciar/)
  })
  it('o prompt manda, sem a permissão de mudar, dizer quem muda (pela permissão) em vez de indicar a tela', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ financial: 'VIEW' }), extras)
    expect(texto).toMatch(/comissões[^\n]*Financeiro e comissões[^\n]*Gerenciar/i)
    expect(texto).toMatch(/não indique a tela[^\n]*quem tem/i)
  })
})

describe('A25: o "Continuar a conversa anterior" vem antes do "Olá"', () => {
  it('na tela vazia, o botão de continuar é o primeiro', () => {
    const f = readFileSync(join(__dirname, '..', 'components/copilot/copilot.tsx'), 'utf8')
    const vazio = f.slice(f.indexOf('className="copilot-vazio"><p>Nenhuma') + 10)
    const bloco = vazio.slice(vazio.indexOf('className="copilot-vazio"'))
    expect(bloco.indexOf('data-continuar-conversa')).toBeGreaterThan(-1)
    expect(bloco.indexOf('data-continuar-conversa')).toBeLessThan(bloco.indexOf('<p>Olá!'))
  })
})
