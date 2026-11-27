import { describe, it, expect } from 'vitest'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D7 da 36ª simulação (AD-16: no dinheiro, a frase diz quanto, como e de quem;
 * "a venda (com o crediário: entrada e parcelas)"). O crediário COM entrada já
 * dizia "Recebeu a entrada de … e lançou 3 parcelas no crediário"; SEM entrada,
 * a gravação só tinha as parcelas em aberto, nenhum recebimento, e caía na
 * frase genérica "Criou 3 lançamentos".
 */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-27T02:08:32.671Z', branch_id: 'bA', client_id: 'cE', tabela: 'financial_transactions', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Nádia', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = { clientes: { cE: 'Edileusa' }, membros: {}, unidades: { bA: 'Mossoró' } }
const parcela = (n: number, de = 3) => r({ registro_id: `p${n}`, depois: {
  type: 'INCOME', amount: 100, is_paid: false, category: 'Serviços', description: `Atendimento concluído — parcela ${n}/${de}`,
  parcela_numero: n, parcela_total: de, due_date: '2026-12-27T15:00:00+00:00' } })

describe('o crediário sem entrada diz as parcelas', () => {
  it('"Lançou 3 parcelas no crediário (R$ 300,00) — Edileusa", não "Criou 3 lançamentos"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [parcela(3), parcela(2), parcela(1)]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Lançou 3 parcelas no crediário (R$ 300,00) — Edileusa')
  })

  it('com a comanda e a comissão gravadas junto, o fato é o mesmo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'commissions', depois: { type: 'PERCENTAGE', amount: 90, status: 'AGUARDANDO' } }),
      parcela(3), parcela(2), parcela(1),
      r({ tabela: 'comandas', operacao: 'editou', registro_id: 'c1', colunas: ['status'], antes: { status: 'ABERTA' }, depois: { status: 'PAGA' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Lançou 3 parcelas no crediário (R$ 300,00) — Edileusa')
  })

  it('uma parcela só, sozinha na gravação, no singular', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([parcela(1, 1)], nomes))).toBe('Lançou 1 parcela no crediário (R$ 100,00) — Edileusa')
  })

  it('concluído na mesma gravação: "Concluiu o atendimento e lançou 3 parcelas no crediário"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      parcela(3), parcela(2), parcela(1),
      r({ tabela: 'appointments', operacao: 'editou', registro_id: 'a1', colunas: ['status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Concluiu o atendimento e lançou 3 parcelas no crediário (R$ 300,00) — Edileusa')
  })

  it('o a receber sem parcela segue "Criou a receita" (não é crediário)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const so = r({ depois: { type: 'INCOME', amount: 200, is_paid: false, category: 'Serviços' } })
    expect(sp(fraseDoGrupo([so], nomes))).toBe('Criou a receita Serviços (R$ 200,00) — Edileusa')
  })

  it('com entrada, a frase de antes', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      parcela(3), parcela(2), parcela(1),
      r({ registro_id: 'e1', depois: { type: 'INCOME', amount: 100, is_paid: true, paid_at: '2026-11-27T02:08:32Z', category: 'Serviços', payment_method: 'PIX' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu a entrada de R$ 100,00 (Pix) e lançou 3 parcelas no crediário (R$ 300,00) — Edileusa')
  })
})
