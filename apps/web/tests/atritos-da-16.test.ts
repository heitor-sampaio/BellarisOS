import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import { linhasDaConferencia } from '@/lib/financeiro/conferencia-do-fechamento'
import { baseDaOcupacao } from '@/lib/metrics/ocupacao'
import { chaveDaAbaPedida } from '@/lib/configuracoes/abas'
import * as frase from '@/lib/auditoria/frase'
const { fraseDaAuditoria, fraseDoGrupo, linhaDaAuditoria } = frase
import type { RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * Os atritos da 16ª simulação (2026-11-15) que se provam sem tela: o texto,
 * a regra pura de leitura e as funções puras. Os de tela estão nos specs
 * `*-atritos-da-16.spec.ts`.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

// ─── PDV, caixa e Financeiro ────────────────────────────────────────────────

describe('A2: a conta a receber se RECEBE, e o modal diz quanto e de quem', () => {
  it('o botão da linha é "Receber" na receita e "Pagar" na despesa', () => {
    expect(ler('components/branch/financial-table.tsx')).toMatch(/tx\.type === 'INCOME' \? 'Receber' : 'Pagar'/)
    expect(ler('components/admin/admin-financial-view.tsx')).toMatch(/t\.type === 'INCOME' \? 'Receber' : 'Pagar'/)
  })
  it('o modal leva a cliente, e mostra o valor e ela', () => {
    for (const f of ['components/branch/financial-table.tsx', 'components/admin/admin-financial-view.tsx']) {
      expect(ler(f)).toMatch(/<ReceberNoCartao[\s\S]{0,300}cliente=\{noCartao\.cliente\}/)
    }
    expect(ler('components/shared/receber-no-cartao.tsx')).toContain('data-receber-quanto')
  })
  it('a frase do filtro não sai quebrada, e a da baixa cita o botão que a tela mostra', () => {
    for (const f of ['components/admin/admin-financial-view.tsx', 'components/branch/financial-hub.tsx']) {
      const t = ler(f)
      expect(t).not.toContain('Todo o a receber em aberto')
      expect(t).not.toContain('o a receber em aberto com o vencimento')
      expect(t).toContain('use “Receber” na linha')
    }
  })
})

describe('A3: o Fechamento diz o estorno de hoje que já saiu das entradas', () => {
  it('o estornado no mesmo dia, por forma (a chave da linha do fechamento)', async () => {
    const { estornadoNoMesmoDiaPorForma } = await import('@/lib/metrics/estornos-por-forma')
    expect(estornadoNoMesmoDiaPorForma([
      { forma: 'DEBIT_CARD', vezes: null, valor: 320, mesmoDia: true },
      { forma: 'CREDIT_CARD', vezes: 3, valor: 100.1, mesmoDia: true },
      { forma: 'CREDIT_CARD', vezes: 3, valor: 0.2, mesmoDia: true },
      { forma: 'PIX', vezes: null, valor: 50, mesmoDia: false },
    ])).toEqual({ DEBIT_CARD: 320, 'CREDIT_CARD:3': 100.3 })
  })
  it('a linha da forma diz o estornado de hoje', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('estornado de um pagamento de hoje')
  })
})

describe('A5: o aviso da taxa diz quem cadastra, a quem não cadastra', () => {
  it('o texto', async () => {
    const { textoDeQuemCadastraATaxa } = await import('@/lib/financeiro/quem-cadastra-a-taxa')
    expect(textoDeQuemCadastraATaxa(null)).toBe('Cadastre em Configurações → Comissões e taxas.')
    expect(textoDeQuemCadastraATaxa(['Otávio Jasmim'])).toBe('Quem cadastra: Otávio Jasmim.')
    expect(textoDeQuemCadastraATaxa(['Ana', 'Bia'])).toBe('Quem cadastra: Ana ou Bia.')
    expect(textoDeQuemCadastraATaxa([])).toBe('Quem cadastra é quem tem o Financeiro em Gerenciar e “A rede inteira”.')
  })
  it('o aviso usa o texto', () => {
    const f = ler('components/shared/aviso-da-taxa.tsx')
    expect(f).toContain('textoDeQuemCadastraATaxa(')
    expect(f).not.toMatch(/>\s*Cadastre em Configurações → Comissões e taxas\./)
  })
})

describe('A6/A7: o PDV vazio e a aba do pré-pago dizem o que valem', () => {
  it('A6: a comanda nasce quando o atendimento tem o que cobrar', () => {
    // A11 da 23ª: o texto do vazio foi para `vazioDasAbertas` (com a comanda aberta na outra unidade, ele diz a unidade).
    expect(ler('lib/pdv/situacoes.ts')).toContain('Ela nasce quando um atendimento é iniciado e tem o que cobrar.')
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/vazioDasAbertas\(/)
  })
  it('A7: a aba é "Procedimento pré-pago"', () => {
    expect(ler('components/shared/vender.tsx')).toContain("'Procedimento pré-pago'")
  })
})

describe('A8: a forma só com saída não pede conferência', () => {
  it('Pix só com a saída de R$ 120 não tem o campo; com entrada, tem', () => {
    const linhas = linhasDaConferencia({
      formas: [
        { forma: 'PIX', entradas: 0, saidas: 120, saldo: -120 },
        { forma: 'DEBIT_CARD', entradas: 200, saidas: 0, saldo: 200 },
      ],
      esperadoDinheiro: 0, ultimo: null,
    })
    expect(linhas.find(l => l.forma === 'PIX')!.conferivel).toBe(false)
    expect(linhas.find(l => l.forma === 'DEBIT_CARD')!.conferivel).toBe(true)
  })
  it('conferida antes (no último fechamento), segue com o campo', () => {
    const linhas = linhasDaConferencia({
      formas: [{ forma: 'PIX', entradas: 0, saidas: 120, saldo: -120 }],
      esperadoDinheiro: 0,
      ultimo: { contado: 0, diferenca: 0, conferido: { PIX: 0 }, resumo: [{ forma: 'PIX', entradas: 0, saidas: 120, saldo: -120 }] },
    })
    expect(linhas.find(l => l.forma === 'PIX')!.conferivel).toBe(true)
  })
})

// ─── Agenda e dashboard ─────────────────────────────────────────────────────

describe('A9: o agendar diz quais documentos bloqueiam o início', () => {
  it('a janela lê os que bloqueiam e os nomeia', () => {
    expect(ler('actions/documentos-da-janela.ts')).toContain('bloqueiam')
    expect(ler('components/branch/appointment-modal.tsx')).toContain('Sem assinatura, o atendimento não se inicia:')
  })
})

describe('A12: o Agendamentos do dashboard diz os que ainda vêm hoje', () => {
  it('conta os de hoje depois de agora, sem os cancelados e as faltas', async () => {
    const { aindaHojeNaAgenda } = await import('@/lib/metrics/agenda-do-dia')
    const agora = new Date('2026-11-15T13:00:00Z')
    expect(aindaHojeNaAgenda([
      { scheduled_at: '2026-11-15T12:00:00Z', status: 'SCHEDULED' },
      { scheduled_at: '2026-11-15T14:00:00Z', status: 'SCHEDULED' },
      { scheduled_at: '2026-11-15T15:00:00Z', status: 'CONFIRMED' },
      { scheduled_at: '2026-11-15T16:00:00Z', status: 'CANCELLED' },
      { scheduled_at: '2026-11-15T17:00:00Z', status: 'NO_SHOW' },
    ], agora)).toBe(2)
  })
  it('o funil leva a nota, e o "Ninguém sumiu" não diz "que você atendeu"', () => {
    expect(ler('app/[slug]/dashboard/page.tsx')).toContain('ainda hoje')
    const q = ler('components/shared/quadros-de-clientes.tsx')
    expect(q).toContain('data-nota-da-etapa')
    expect(q).not.toContain('que você atendeu')
  })
})

describe('A13: a ocupação diz "de", sem gênero, e não cita a agenda de outra unidade', () => {
  it('"menos 70 min de Dr. Caio Brandão atendendo em outra unidade"', () => {
    expect(baseDaOcupacao({ agendados: 0, abertos: 400, profissionais: 1, descontos: [{ minutos: 70, quem: 'Dr. Caio Brandão', onde: 'outra unidade' }] }))
      .toBe('0 min agendados de 400 min abertos (o horário de 1 profissional que atende, menos 70 min de Dr. Caio Brandão atendendo em outra unidade)')
    expect(baseDaOcupacao({ agendados: 0, abertos: 400, profissionais: 1, descontos: [{ minutos: 30, quem: 'Lia', onde: null }] }))
      .toBe('0 min agendados de 400 min abertos (o horário de 1 profissional que atende, menos 30 min bloqueados de Lia)')
  })
  it('a outra unidade fora do alcance sai sem o nome', () => {
    for (const f of ['app/[slug]/dashboard/page.tsx', 'app/[slug]/agenda/page.tsx']) {
      expect(ler(f)).toMatch(/onde: alcancaUnidade\(ctx, a\.branch_id\)/)
    }
  })
})

// ─── App da cliente ─────────────────────────────────────────────────────────

describe('A14: o Financeiro do app mostra o que está a pagar na unidade', () => {
  it('lê o a receber dos atendimentos, como o Histórico', () => {
    const f = ler('app/[slug]/cliente/financeiro/page.tsx')
    expect(f).toContain('getAtendimentosAReceber')
    expect(f).toContain('A pagar na unidade')
  })
})

// ─── Clientes e cadastros ───────────────────────────────────────────────────

describe('os cadastros da 16ª', () => {
  it('A20: a lista da rede não manda à barra lateral', () => {
    expect(ler('app/admin/clients/page.tsx')).not.toContain('Use a barra lateral para filtrar por unidade')
  })
  it('A22: o termo do procedimento leva à aba Documentos', () => {
    expect(ler('components/admin/procedure-form.tsx')).toContain('/settings?tab=documentos')
  })
  it('A23: a linha nova do pacote vem vazia', () => {
    const f = ler('components/admin/pacotes-catalogo.tsx')
    expect(f).not.toContain('procedureId: livre.id')
    expect(f).toContain('Escolha o procedimento')
  })
  it('A24: o desconto do pacote sobre as sessões avulsas', async () => {
    const { descontoDoPacote } = await import('@/lib/pacotes/desconto')
    expect(sp(descontoDoPacote(1650, 1950))).toBe('R$ 300,00 de desconto (15,4%) sobre as sessões avulsas')
    expect(descontoDoPacote(1950, 1950)).toBeNull()
    expect(descontoDoPacote(2000, 1950)).toBeNull()
    expect(ler('components/admin/pacotes-catalogo.tsx')).toContain('descontoDoPacote(')
  })
  it('A25: com uma unidade, o chip diz o nome da unidade', () => {
    expect(ler('app/_shared/catalogo-de-procedimentos.tsx')).toMatch(/branchList\.length === 1/)
  })
  it('A27: a aba Tags não diz que a tag entra sozinha', () => {
    const f = ler('components/admin/settings-tags.tsx')
    expect(f).not.toContain('entra aqui sozinha')
    expect(f).toContain('Adicionar tag')
  })
  it('A28: o catálogo de automações diz onde mora o envio da ficha de saúde', () => {
    expect(ler('components/admin/automacoes/lista.tsx')).toContain('Configurações → Fichas')
  })
  it('A29: os endereços em português levam à tela, e "acoes-em-lote" abre Lotes', () => {
    expect(existsSync(join(WEB, 'app/admin/equipe/page.tsx'))).toBe(true)
    expect(existsSync(join(WEB, 'app/[slug]/equipe/page.tsx'))).toBe(true)
    expect(ler('app/admin/equipe/page.tsx')).toMatch(/redirect\('\/admin\/team'\)/)
    expect(chaveDaAbaPedida('acoes-em-lote')).toBe('lotes')
  })
  it('A30: o "Ver detalhes" da unidade diz que ali estão as salas', () => {
    const f = ler('components/admin/settings-branches.tsx')
    expect(f).toContain('Salas e detalhes')
    expect(f).not.toMatch(/>\s*Ver detalhes\s*</)
  })
})

// ─── Copilot ────────────────────────────────────────────────────────────────

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

describe('o Copilot da 16ª', () => {
  it('A31: o painel vazio oferece continuar a conversa anterior', () => {
    expect(ler('components/copilot/copilot.tsx')).toContain('Continuar a conversa anterior')
  })
  it('A32/A34: o cartão é a confirmação; o texto não pede outra nem repete o cartão', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const t = instrucoesDoCopilot(ctx({ agenda: 'MANAGE' }), { rede: 'Jasmim', unidade: 'Moinhos', pagina: '/moinhos/agenda', slugDoPortal: 'moinhos', fuso: 'America/Sao_Paulo' })
    expect(t).not.toContain('peça a confirmação no cartão')
    expect(t).toContain('O cartão é a confirmação')
    expect(t).toMatch(/Não peça que a pessoa responda/)
    expect(t).toMatch(/não repita/i)
  })
  it('A33: o cartão diz o aviso que chega de fato à cliente', async () => {
    const { avisoDoAgendarParaACliente } = await import('@/lib/copilot/ferramentas/aviso-do-agendar')
    expect(avisoDoAgendarParaACliente({ temAcesso: true, portalNoPlano: true })).toBe('Ela recebe o aviso “Horário marcado” no app.')
    expect(avisoDoAgendarParaACliente({ temAcesso: false, portalNoPlano: true })).toBe('Nada é enviado a ela agora: ela não tem acesso ao app.')
    expect(avisoDoAgendarParaACliente({ temAcesso: true, portalNoPlano: false })).toBe('Nada é enviado a ela agora: a rede não tem o app da cliente no plano.')
    expect(ler('lib/copilot/ferramentas/agenda-escrita.ts')).not.toContain('O cliente recebe a confirmação do agendamento.')
  })
  it('A34: "Ficha de Helena Prado criada"', () => {
    const f = ler('lib/copilot/ferramentas/clientes-escrita.ts')
    expect(f).toContain('Ficha de ${')
    expect(f).not.toMatch(/\$\{[^}]+\} cadastrad[oa]/)
  })
})

// ─── Auditoria ──────────────────────────────────────────────────────────────

describe('a Auditoria da 16ª', () => {
  let id = 5000
  const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
    id: id--, criado_em: '2026-11-15T12:00:00.123Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
    registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Bianca', ator_tipo: 'membro',
    incompleto: false, ...x,
  })
  const nomes = { clientes: { c1: 'Dona Cida' }, membros: {}, unidades: { b1: 'Moinhos' } }

  it('A35: os campos que a auditoria já gravou têm nome em português', () => {
    const colunas = ['used_sessions', 'total_sessions', 'plan_name', 'plan_status', 'trial_ends_at', 'failed_attempts', 'used_transaction_id']
    const f = fraseDaAuditoria(r({ tabela: 'client_packages', operacao: 'editou', colunas: colunas.slice(0, 2) }), nomes)
    expect(f).toBe('Editou o pacote da cliente (sessões usadas e total de sessões)')
    for (const c of colunas) {
      const frase = fraseDaAuditoria(r({ tabela: 'tags', operacao: 'editou', colunas: [c], depois: { nome: 'X' } }), nomes)
      expect(frase, c).not.toMatch(/[a-z]+ [a-z]+ (id|at|name|status|sessions|attempts)\)/)
      expect(frase, c).not.toContain(c.replace(/_/g, ' '))
    }
  })
  it('A35: toda tabela que a auditoria nomeia tem o plural (nada de "registros (document_sign_links)")', () => {
    const { COISA_DA_AUDITORIA, PLURAL_DA_AUDITORIA } = frase as unknown as Record<string, Record<string, string>>
    expect(COISA_DA_AUDITORIA, 'a lista de coisas é exportada').toBeTruthy()
    for (const t of Object.keys(COISA_DA_AUDITORIA!)) expect(PLURAL_DA_AUDITORIA?.[t], t).toBeTruthy()
    const g = fraseDoGrupo([r({ tabela: 'document_sign_links' }), r({ tabela: 'document_sign_links' })], nomes)
    expect(g).toBe('Criou 2 links de assinatura')
  })
  it('A35: o lançamento diz o que é e quanto; a sala, a unidade', () => {
    expect(sp(fraseDaAuditoria(r({ tabela: 'financial_transactions', branch_id: 'b1', depois: { type: 'EXPENSE', amount: 120, category: 'Material de limpeza' } }), nomes)))
      .toBe('Criou a despesa Material de limpeza (R$ 120,00)')
    expect(sp(fraseDaAuditoria(r({ tabela: 'financial_transactions', branch_id: 'b1', depois: { type: 'INCOME', amount: 89 } }), nomes)))
      .toBe('Criou a receita (R$ 89,00)')
    expect(fraseDaAuditoria(r({ tabela: 'rooms', branch_id: 'b1', depois: { name: 'Cabine 1' } }), nomes))
      .toBe('Criou a sala Cabine 1 em Moinhos')
  })
  it('A35: abrir o documento sem mudar nada não grava de novo (as 14 "gerações")', async () => {
    const { montagemMudou } = await import('@/lib/documentos/montagem-mudou')
    const doc = { status: 'INCOMPLETO', content_sha256: 'h1', missing_fields: ['cliente.cpf'] }
    expect(montagemMudou(doc, { status: 'INCOMPLETO', hash: 'h1', faltando: ['cliente.cpf'], comPagamento: false })).toBe(false)
    expect(montagemMudou(doc, { status: 'INCOMPLETO', hash: 'h2', faltando: ['cliente.cpf'], comPagamento: false })).toBe(true)
    expect(montagemMudou(doc, { status: 'PENDENTE', hash: 'h1', faltando: [], comPagamento: false })).toBe(true)
    expect(montagemMudou(doc, { status: 'INCOMPLETO', hash: 'h1', faltando: ['cliente.cpf'], comPagamento: true })).toBe(true)
    expect(montagemMudou({ status: 'A_GERAR', content_sha256: null, missing_fields: [] }, { status: 'PENDENTE', hash: 'h1', faltando: [], comPagamento: false })).toBe(true)
    expect(ler('lib/documentos/renderizar.ts')).toContain('montagemMudou(')
  })
  it('A36: o que a cliente fez pelo link é dela, "pelo link"', () => {
    const resposta = r({ tabela: 'pre_atendimentos', operacao: 'editou', client_id: 'c1', colunas: ['origem', 'respondido_em', 'respostas', 'status'], ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' })
    const l = linhaDaAuditoria(resposta, nomes, '/admin/auditoria', null)
    expect(l.quem).toBe('Dona Cida, pelo link')
    expect(l.tipoDeAtor).toBe('cliente')
    expect(l.oQue).toBe('Respondeu a ficha de saúde')
    const tentativa = r({ tabela: 'pre_atendimento_links', operacao: 'editou', client_id: 'c1', colunas: ['failed_attempts'], ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' })
    expect(linhaDaAuditoria(tentativa, nomes, '/admin/auditoria', null).quem).toBe('Dona Cida, pelo link')
    // O link criado pelo sistema (a automação) segue do sistema.
    const criado = r({ tabela: 'pre_atendimento_links', client_id: 'c1', ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' })
    expect(linhaDaAuditoria(criado, nomes, '/admin/auditoria', null).quem).toBe('O sistema')
  })
  it('A37: o filtro "Só o que foi pelo Copilot"', () => {
    expect(ler('app/_shared/auditoria.tsx')).toContain('Só o que foi pelo Copilot')
    expect(ler('lib/auditoria/leitura.ts')).toMatch(/eq\('via', 'copilot'\)/)
  })
  it('A38: o CSV leva a frase da gravação em cada linha', () => {
    const estorno = [
      r({ tabela: 'financial_transactions', client_id: 'c1', branch_id: 'b1', depois: { type: 'EXPENSE', amount: 139, category: 'Estorno' } }),
      r({ tabela: 'product_sales', client_id: 'c1', branch_id: 'b1', operacao: 'editou', colunas: ['estornada_em', 'estorno_motivo'] }),
    ]
    const { linhasDoCsvDaAuditoria } = frase as unknown as { linhasDoCsvDaAuditoria?: (rs: RegistroDaAuditoria[], n: typeof nomes) => { gravacao: string }[] }
    expect(linhasDoCsvDaAuditoria, 'o CSV tem a linha com a gravação').toBeTypeOf('function')
    const linhas = linhasDoCsvDaAuditoria!(estorno, nomes)
    expect(linhas).toHaveLength(2)
    for (const l of linhas) expect(sp(l.gravacao)).toBe('Estornou a venda de produto (R$ 139,00) — Dona Cida')
    expect(ler('app/api/auditoria/csv/route.ts')).toContain('Gravação')
  })
})
