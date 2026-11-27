import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o fato (AD-13, "a linha diz o fato"; decisão do Claude, 27/11):
 *
 * - A15: desmarcar uma pessoa de "Quem realiza" no cadastro do procedimento
 *   saía "Apagou quem faz o procedimento", sem dizer quem nem de qual. O
 *   gatilho de `procedure_professionals` não guardava valor nenhum; passa a
 *   guardar `user_id` e `procedure_id` (só os ids — os nomes se leem na hora
 *   de mostrar). A frase: "Tirou Damião de quem realiza Limpeza de pele" /
 *   "Marcou Damião em quem realiza Limpeza de pele".
 * - A16: a remarcação do vencimento e o estorno de uma conta (A pagar) não
 *   diziam qual conta. A frase usa a descrição da despesa, lida agora.
 */
let id = 9900
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-27T12:00:00.000Z', branch_id: null, client_id: null, tabela: 'procedure_professionals',
  operacao: 'apagou', registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Cristóvão',
  ator_tipo: 'membro', incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: {}, membros: { m1: 'Damião', m2: 'Leontina' }, unidades: { b1: 'Centro' }, fusos: { b1: 'America/Sao_Paulo' },
  procedimentos: { p1: 'Limpeza de pele' },
}

describe('A15: quem realiza o procedimento, pelo nome', () => {
  it('"Tirou Damião de quem realiza Limpeza de pele"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([r({ antes: { user_id: 'm1', procedure_id: 'p1' } })], nomes))
      .toBe('Tirou Damião de quem realiza Limpeza de pele')
  })

  it('"Marcou Damião em quem realiza Limpeza de pele"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([r({ operacao: 'criou', depois: { user_id: 'm1', procedure_id: 'p1' } })], nomes))
      .toBe('Marcou Damião em quem realiza Limpeza de pele')
  })

  it('duas de uma vez: "Tirou Damião e Leontina de quem realiza Limpeza de pele"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([
      r({ antes: { user_id: 'm1', procedure_id: 'p1' } }),
      r({ antes: { user_id: 'm2', procedure_id: 'p1' } }),
    ], nomes)).toBe('Tirou Damião e Leontina de quem realiza Limpeza de pele')
  })

  it('a gravação de antes (sem os ids) diz o que se sabe, sem "Apagou"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([r({})], nomes)).toBe('Tirou uma pessoa de quem realiza o procedimento')
  })

  it('a leitura busca o nome da pessoa e o do procedimento', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(fonte).toMatch(/r\.tabela === 'procedure_professionals'\)\.map\(r => doRegistro\(r, 'user_id'\)\)/)
    expect(fonte).toMatch(/r\.tabela === 'procedure_professionals'\)\.map\(r => r\.depois\?\.procedure_id \?\? r\.antes\?\.procedure_id\)/)
  })

  it('o gatilho de procedure_professionals passa a guardar a pessoa e o procedimento (a migration da faixa P)', () => {
    const pasta = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(f => /^2026121850\d{4}_auditoria_quem_realiza_o_procedimento\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa P').toBeTruthy()
    const sql = readFileSync(path.join(pasta, arquivo!), 'utf8')
    for (const op of ['ins', 'upd', 'del']) {
      expect(sql).toMatch(new RegExp(`create trigger auditoria_${op}[\\s\\S]*?on public\\.procedure_professionals[\\s\\S]*?private\\.auditar\\('normal', '', 'user_id,procedure_id', '', 'procedure_id,user_id'\\)`))
    }
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})

describe('A16: a conta remarcada e a estornada, pelo nome', () => {
  const conta = (x: Partial<RegistroDaAuditoria>) => r({ tabela: 'financial_transactions', branch_id: 'b1', registro_id: 't1', ...x })
  const comConta: NomesDaAuditoria = {
    ...nomes,
    lancamentos: { t1: { tipo: 'EXPENSE', valor: 2000, forma: 'BOLETO', parcela: null, de: null, descricao: 'Aluguel da sala', categoria: 'Aluguel' } },
  }

  it('"Remarcou o vencimento da despesa Aluguel da sala: 10/12/2026 → 20/12/2026"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const remarcou = conta({
      operacao: 'editou', colunas: ['due_date', 'vencimentos_anteriores'],
      antes: { due_date: '2026-12-10T15:00:00+00:00' }, depois: { due_date: '2026-12-20T15:00:00+00:00' },
    })
    expect(fraseDoGrupo([remarcou], comConta)).toBe('Remarcou o vencimento da despesa Aluguel da sala: 10/12/2026 → 20/12/2026')
  })

  it('sem a descrição lida, "do lançamento"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const remarcou = conta({
      operacao: 'editou', colunas: ['due_date', 'vencimentos_anteriores'],
      antes: { due_date: '2026-12-10T15:00:00+00:00' }, depois: { due_date: '2026-12-20T15:00:00+00:00' },
    })
    expect(fraseDoGrupo([remarcou], nomes)).toBe('Remarcou o vencimento do lançamento: 10/12/2026 → 20/12/2026')
  })

  it('o estorno da despesa diz qual: "Estornou a despesa Aluguel da sala (R$ 2.000,00 · Boleto)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      conta({ operacao: 'criou', registro_id: 'e1', depois: { category: 'Estorno', amount: 2000, type: 'INCOME', payment_method: 'BOLETO' } }),
      conta({ operacao: 'editou', colunas: ['notes'] }),
    ]
    expect(fraseDoGrupo(linhas, comConta).replace(/\s/g, ' ')).toMatch(/^Estornou a despesa Aluguel da sala \(R\$ 2\.000,00 · Boleto\)/)
  })
})
