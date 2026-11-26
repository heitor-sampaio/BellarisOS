import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A21 da 32ª simulação (2026-11-26; AD-04, AD-08), o pedido do Financeiro: a
 * antecipação da parcela da operadora ("Marcar como recebida" e "Voltar para a
 * receber") entra na Auditoria pelo gatilho de UPDATE em `recebiveis_do_cartao`
 * (migration 20261210400002: o rótulo é o número da parcela; os valores, o
 * dinheiro e as datas; a cliente e a unidade vêm do pagamento). A frase diz o
 * fato; o estorno, que cancela as parcelas na mesma gravação, segue a frase do
 * estorno — com o motivo, lido na hora de mostrar (AD-08).
 */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T14:00:00.000Z', branch_id: 'bCha', client_id: 'cK', tabela: 'recebiveis_do_cartao', operacao: 'editou',
  registro_id: 'rc1', colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Valdete', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cK: 'Karen Lazzari' }, membros: {}, unidades: { bCha: 'Ninfeia Chapecó' },
  recebiveis: { rc1: { valor: 100 } },
}

describe('A21: a parcela da operadora na Auditoria', () => {
  it('tem o nome e o plural', async () => {
    const { COISA_DA_AUDITORIA, PLURAL_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    expect(COISA_DA_AUDITORIA.recebiveis_do_cartao).toBe('a parcela da operadora')
    expect(PLURAL_DA_AUDITORIA.recebiveis_do_cartao).toBe('parcelas da operadora')
  })

  it('"Marcar como recebida": "Marcou como recebida a parcela 2/3 da operadora (R$ 100,00) — Karen"', async () => {
    const { fraseDaAuditoria, fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const marcou = r({ colunas: ['recebida_em', 'recebida_por'], antes: { recebida_em: null }, depois: { parcela_numero: 2, parcela_total: 3, recebida_em: '2026-11-26T14:00:00Z' } })
    expect(sp(fraseDaAuditoria(marcou, nomes))).toBe('Marcou como recebida a parcela 2/3 da operadora (R$ 100,00) — Karen Lazzari')
    expect(sp(fraseDoGrupo([marcou], nomes))).toBe('Marcou como recebida a parcela 2/3 da operadora (R$ 100,00) — Karen Lazzari')
  })

  it('"Voltar para a receber": "Voltou para a receber a parcela 2/3 da operadora"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const voltou = r({ colunas: ['recebida_em', 'recebida_por'], antes: { recebida_em: '2026-11-26T14:00:00Z' }, depois: { parcela_numero: 2, parcela_total: 3, recebida_em: null } })
    expect(sp(fraseDaAuditoria(voltou, nomes))).toBe('Voltou para a receber a parcela 2/3 da operadora (R$ 100,00) — Karen Lazzari')
    const semValor = r({ registro_id: 'rcX', colunas: ['recebida_em'], antes: { recebida_em: '2026-11-26T14:00:00Z' }, depois: { parcela_numero: 1, parcela_total: 1 } })
    expect(sp(fraseDaAuditoria(semValor, nomes))).toBe('Voltou para a receber a parcela 1/1 da operadora — Karen Lazzari')
  })

  it('as colunas têm nome em português', async () => {
    const { fraseDaAuditoria, campoTemNomeNaAuditoria } = await import('@/lib/auditoria/frase')
    for (const c of ['recebida_em', 'recebida_por', 'cancelada_em', 'estornada_em', 'vencimento', 'valor', 'liquido']) {
      expect(campoTemNomeNaAuditoria(c, 'recebiveis_do_cartao'), c).toBe(true)
    }
    const taxa = r({ colunas: ['liquido', 'vencimento'], depois: { parcela_numero: 2, parcela_total: 3, liquido: 95 } })
    expect(sp(fraseDaAuditoria(taxa, nomes))).toBe('Editou a parcela 2/3 da operadora (líquido e vencimento) — Karen Lazzari')
  })

  it('no estorno, as parcelas canceladas dobram na frase do estorno, com o motivo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const saida = r({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'fE', depois: { type: 'EXPENSE', category: 'Estorno', amount: 300, payment_method: 'CREDIT_CARD' } })
    const original = r({ tabela: 'financial_transactions', registro_id: 'fO', colunas: ['notes', 'estorno_motivo'] })
    const p1 = r({ registro_id: 'rc1', colunas: ['cancelada_em', 'estornada_em'], depois: { parcela_numero: 2, parcela_total: 3, cancelada_em: '2026-11-26T14:00:00Z' } })
    const p2 = r({ registro_id: 'rc2', colunas: ['cancelada_em', 'estornada_em'], depois: { parcela_numero: 3, parcela_total: 3, cancelada_em: '2026-11-26T14:00:00Z' } })
    const comMotivo: NomesDaAuditoria = {
      ...nomes,
      lancamentos: {
        fE: { tipo: 'EXPENSE', valor: 300, forma: 'CREDIT_CARD', parcela: null, de: null, vezes: 3, motivoDoEstorno: 'A cliente desistiu do pacote' },
        fO: { tipo: 'INCOME', valor: 300, forma: 'CREDIT_CARD', parcela: null, de: null, vezes: 3, motivoDoEstorno: 'A cliente desistiu do pacote' },
      },
    }
    const f = sp(fraseDoGrupo([saida, original, p1, p2], comMotivo))
    expect(f).toMatch(/^Estornou /)
    expect(f).not.toMatch(/parcela/)
    expect(f).toContain('(motivo: A cliente desistiu do pacote)')
    expect(f).toMatch(/— Karen Lazzari$/)
    // Sem o motivo lido, a frase de antes.
    expect(sp(fraseDoGrupo([saida, original, p1, p2], nomes))).not.toContain('motivo')
  })

  it('a leitura traz o valor da parcela e o motivo do estorno, na hora de mostrar', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(fonte).toMatch(/estorno_motivo/)
    expect(fonte).toMatch(/from\('recebiveis_do_cartao'\)/)
  })
})
