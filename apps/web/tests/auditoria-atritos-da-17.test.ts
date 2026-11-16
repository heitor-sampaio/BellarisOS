import { describe, it, expect } from 'vitest'
import { gruposDaAuditoria, fraseDoGrupo, gravacoesDaUnidade } from '@/lib/auditoria/frase'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A26, A27 e A28 da 17ª simulação (2026-11-15): a Auditoria ainda não dizia o
 * fato. As gravações abaixo são as da simulação, como o gatilho as guardou (o
 * `depois` com os poucos valores sem dado pessoal; `{}` em leads e contacts,
 * por minimização), da mais nova à mais antiga, como a leitura as entrega. O
 * que a gravação não guarda (o nome da oportunidade, do contato, o produto do
 * item da comanda, de quem é a comissão, a cliente dos pontos) se lê agora,
 * como o nome da cliente. A gravação não muda.
 */

const sp = (s: string) => s.replace(/ /g, ' ')

let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-16T00:14:18.231Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Rodrigo', ator_tipo: 'membro',
  incompleto: false, ...x,
})

const nomes: NomesDaAuditoria = {
  clientes: { cL: 'Lívia Prates', cP: 'Paula Reis' },
  membros: {}, unidades: { bS: 'Savassi', bP: 'Pampulha' },
  produtos: {},
  lancamentos: { ftAtend: { tipo: 'INCOME', valor: 320, forma: 'DEBIT_CARD', parcela: null, de: null, agendamento: true } },
  oportunidades: { ld1: 'Camila Duarte' },
  contatos: { ct1: 'Camila Duarte', ct2: 'Júlia Ramos' },
  etapas: { stNovo: 'Novo', stAnd: 'Em andamento' },
  itensDaComanda: { it1: 'Sérum Vitamina C' },
  pagamentosDeComissao: { po1: 'Dr. Fábio' },
  clientesDosPontos: { lt1: 'Lívia Prates', lt2: 'Lívia Prates' },
  fechamentosDeNovo: { fe1: false, fe2: true },
}
const grupos = (rs: RegistroDaAuditoria[]) => gruposDaAuditoria(rs, nomes, '/admin/auditoria', null)

describe('A26: as frases dizem o fato', () => {
  it('o pagamento da comissão diz de quem é', () => {
    const g = grupos([
      r({ tabela: 'commissions', operacao: 'editou', branch_id: 'bS', colunas: ['paid_at', 'paid_by', 'payout_id', 'status'], antes: { status: 'OPEN' }, depois: { status: 'PAID' } }),
      r({ tabela: 'commissions', operacao: 'editou', branch_id: 'bS', colunas: ['paid_at', 'paid_by', 'payout_id', 'status'], antes: { status: 'OPEN' }, depois: { status: 'PAID' } }),
      r({ tabela: 'commission_payouts', branch_id: 'bS', registro_id: 'po1' }),
      r({ tabela: 'financial_transactions', branch_id: 'bS', registro_id: 'ftC',
        depois: { type: 'EXPENSE', amount: 497, paid_at: '2026-11-16T00:14:18Z', category: 'Comissões', payment_method: 'PIX' } }),
    ])
    expect(g).toHaveLength(1)
    expect(sp(g[0]!.oQue)).toBe('Pagou a comissão de Dr. Fábio (R$ 497,00, Pix)')
  })

  it('a comissão editada diz os campos em português (sem "paid by" nem "payout id")', () => {
    const f = fraseDoGrupo([r({ tabela: 'commissions', operacao: 'editou', colunas: ['paid_at', 'paid_by', 'payout_id', 'status'] })], nomes)
    expect(f).not.toMatch(/paid|payout/)
    expect(f).toMatch(/quem pagou/)
  })

  it('o recebimento com o voucher cita o voucher', () => {
    const g = grupos([
      r({ tabela: 'loyalty_vouchers', operacao: 'editou', branch_id: 'bS', client_id: 'cL', colunas: ['status', 'used_at', 'used_transaction_id'],
        antes: { status: 'ATIVO' }, depois: { name: 'Voucher R$ 40', status: 'USADO' } }),
      r({ tabela: 'loyalty_transactions', branch_id: 'bS', registro_id: 'lt1', depois: { points: 1160 } }),
      r({ tabela: 'financial_transactions', branch_id: 'bS', client_id: 'cL',
        depois: { type: 'INCOME', amount: 1160, payment_method: 'CREDIT_CARD', paid_at: '2026-11-16T00:10:00Z', category: 'Atendimento' } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Recebeu R$ 1.160,00 (Crédito), com o Voucher R$ 40 — Lívia Prates')
  })

  it('o lançamento de pontos diz a quantidade e a cliente', () => {
    expect(sp(fraseDoGrupo([r({ tabela: 'loyalty_transactions', branch_id: 'bS', registro_id: 'lt1', depois: { points: 200 } })], nomes)))
      .toBe('Creditou 200 pontos a Lívia Prates')
    expect(sp(fraseDoGrupo([r({ tabela: 'loyalty_transactions', branch_id: 'bS', registro_id: 'lt2', depois: { points: -320 } })], nomes)))
      .toBe('Debitou 320 pontos de Lívia Prates')
  })

  it('o item da comanda diz qual', () => {
    expect(sp(fraseDoGrupo([r({ tabela: 'comanda_itens', branch_id: 'bS', registro_id: 'it1', depois: { quantidade: 1 } })], nomes)))
      .toBe('Pôs 1 Sérum Vitamina C na comanda')
  })

  it('o fechamento do dia diz o dia, e o "Fechar de novo" diz que é de novo', () => {
    expect(fraseDoGrupo([r({ tabela: 'fechamentos_do_dia', branch_id: 'bS', registro_id: 'fe1', depois: { dia: '2026-11-15', diferenca: 0 } })], nomes))
      .toBe('Fechou o dia 15/11/2026')
    expect(fraseDoGrupo([r({ tabela: 'fechamentos_do_dia', branch_id: 'bS', registro_id: 'fe2', depois: { dia: '2026-11-15', diferenca: 0 } })], nomes))
      .toBe('Fechou de novo o dia 15/11/2026')
  })

  it('o estorno do atendimento diz que foi o atendimento', () => {
    const g = grupos([
      r({ tabela: 'loyalty_transactions', branch_id: 'bS', registro_id: 'lt2', depois: { points: -320 } }),
      r({ tabela: 'financial_transactions', operacao: 'editou', branch_id: 'bS', client_id: 'cP', registro_id: 'ftAtend', colunas: ['estorno_motivo', 'notes'] }),
      r({ tabela: 'commissions', branch_id: 'bS', depois: { type: 'PERCENTAGE', amount: -96, status: 'OPEN' } }),
      r({ tabela: 'financial_transactions', branch_id: 'bS', client_id: 'cP',
        depois: { type: 'EXPENSE', amount: 320, paid_at: '2026-11-15T17:29:07Z', category: 'Estorno', payment_method: 'DEBIT_CARD' } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Estornou o atendimento (R$ 320,00) — Paula Reis')
  })

  it('"quando aconteceu" não aparece: é a conta do sistema, não um campo da pessoa', () => {
    const f = fraseDoGrupo([r({ tabela: 'appointments', operacao: 'editou', client_id: 'cP', colunas: ['aconteceu_em', 'scheduled_at'],
      antes: { scheduled_at: '2026-11-15T17:40:00Z' }, depois: { scheduled_at: '2026-11-15T18:00:00Z' } })], nomes)
    expect(f).not.toMatch(/aconteceu/)
    // A34 da 19ª: o horário mudado é o remarcar (era "Editou o agendamento — Paula Reis (horário)").
    expect(sp(f)).toBe('Remarcou o agendamento de Paula Reis para 15/11/2026 15:00')
  })
})

describe('A27: a oportunidade e o contato pelo nome, lido agora', () => {
  it('o contato criado diz o nome', () => {
    expect(fraseDoGrupo([r({ tabela: 'contacts', registro_id: 'ct2' })], nomes)).toBe('Criou o contato Júlia Ramos')
  })

  it('o contato e a oportunidade criados juntos são uma frase com o nome', () => {
    const g = grupos([
      r({ tabela: 'leads', registro_id: 'ld1' }),
      r({ tabela: 'contacts', registro_id: 'ct1' }),
    ])
    expect(g[0]!.oQue).toBe('Criou o contato e a oportunidade Camila Duarte')
  })

  it('a etapa mudada diz de quem; e de qual para qual quando a etapa está no registro', () => {
    expect(fraseDoGrupo([r({ tabela: 'leads', operacao: 'editou', registro_id: 'ld1', colunas: ['crm_stage_id'] })], nomes))
      .toBe('Mudou a etapa da oportunidade Camila Duarte')
    expect(fraseDoGrupo([r({ tabela: 'leads', operacao: 'editou', registro_id: 'ld1', colunas: ['crm_stage_id'],
      antes: { crm_stage_id: 'stNovo' }, depois: { crm_stage_id: 'stAnd' } })], nomes))
      .toBe('Mudou a etapa da oportunidade Camila Duarte de Novo para Em andamento')
  })
})

describe('A28: o filtro por unidade é pela unidade da GRAVAÇÃO', () => {
  // A conclusão na Pampulha, com a sessão do pacote vendido na Savassi.
  const conclusao = () => [
    r({ tabela: 'client_packages', operacao: 'editou', branch_id: 'bS', client_id: 'cP', colunas: ['used_sessions'] }),
    r({ tabela: 'package_sessions', operacao: 'editou', branch_id: 'bS', client_id: 'cP', colunas: ['status', 'used_at'] }),
    r({ tabela: 'appointments', operacao: 'editou', branch_id: 'bP', client_id: 'cP', registro_id: 'ag1',
      colunas: ['aconteceu_em', 'completed_at', 'status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
  ]
  it('filtrada pela Savassi, a conclusão da Pampulha não aparece', () => {
    expect(gravacoesDaUnidade(conclusao(), nomes, 'bS')).toEqual([])
  })
  it('filtrada pela Pampulha, a gravação vem inteira', () => {
    expect(gravacoesDaUnidade(conclusao(), nomes, 'bP')).toHaveLength(3)
  })
})
