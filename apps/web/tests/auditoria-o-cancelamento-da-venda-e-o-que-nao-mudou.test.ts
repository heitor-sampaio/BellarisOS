import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o FATO, e não grava o que não mudou (plataforma:AD-13, AD-16;
 * princípio 3; o texto das frases é decisão do Claude, 27/11):
 *
 * - D8: o cancelamento da venda de produto A RECEBER (`produto_estornar_venda`:
 *   o a receber sai marcado, sem contra-lançamento) saía "Editou a venda de
 *   produto (devolução ao estoque, estorno, quem estornou e mais 2 campos; 1
 *   itens)" — sem dizer que cancelou, quanto, o motivo nem o que voltou. E "1
 *   itens": a filha de uma só vai no singular.
 * - A3: salvar só a comissão do procedimento apagava e recriava quem realiza (e
 *   as salas, os insumos, as unidades, os preços por unidade) — "Apagou 3" /
 *   "Criou 3 profissionais do procedimento", de algo que não mudou. A action
 *   passa a gravar só a diferença; e a regra de comissão igual à gravada não
 *   se apaga e recria.
 */
const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-27T14:10:00.000Z', branch_id: 'bG', client_id: null, tabela: 'product_sales', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Creusa', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cA: 'Aparecida Moura' }, membros: {}, unidades: { bG: 'Garanhuns' },
  produtos: { pO: 'Óleo de rosa mosqueta' }, medidasDosProdutos: { pO: 'frasco' },
  lancamentos: { ft1: { tipo: 'INCOME', valor: 90, forma: null, parcela: null, de: null, agendamento: false, vezes: null, motivoDoEstorno: 'A cliente desistiu' } },
}

/** A gravação do `produto_estornar_venda` de uma venda a receber, na ordem da leitura (o id decrescente). */
const cancelamento = (voltou = true) => [
  r({ tabela: 'product_sales', registro_id: 'ps1', client_id: 'cA',
    colunas: voltou ? ['devolucao_movement_id', 'estorno_motivo', 'estornada_em', 'estornada_por', 'produto_voltou'] : ['estorno_motivo', 'estornada_em', 'estornada_por'] }),
  ...(voltou ? [
    r({ tabela: 'product_sale_items', registro_id: 'it1', client_id: 'cA', colunas: ['devolucao_movement_id'] }),
    r({ tabela: 'product_batches', registro_id: 'lt1', colunas: ['quantity'] }),
    r({ tabela: 'stock_movements', registro_id: 'mv1', operacao: 'criou', depois: { type: 'SALE_RETURN', quantity: 1, product_id: 'pO' } }),
  ] : []),
  r({ tabela: 'financial_transactions', registro_id: 'ft1', client_id: 'cA', colunas: ['estorno_motivo', 'notes'] }),
]

describe('D8: o cancelamento da venda de produto a receber é o fato (AD-13, AD-16)', () => {
  it('diz que cancelou, quanto estava a receber, o que voltou ao estoque e o motivo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(cancelamento(), nomes)))
      .toBe('Cancelou a venda de produto (R$ 90,00 a receber), e 1 frasco de Óleo de rosa mosqueta voltou ao estoque (motivo: A cliente desistiu) — Aparecida Moura')
  })
  it('o produto que não voltou também se diz', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(cancelamento(false), nomes)))
      .toBe('Cancelou a venda de produto (R$ 90,00 a receber), e o produto não voltou ao estoque (motivo: A cliente desistiu) — Aparecida Moura')
  })
  it('sem o lançamento lido, o motivo vem da venda cancelada', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const semLancamento = { ...nomes, lancamentos: {}, motivosDaVendaCancelada: { ps1: 'Produto com defeito' } }
    expect(sp(fraseDoGrupo(cancelamento(), semLancamento)))
      .toBe('Cancelou a venda de produto, e 1 frasco de Óleo de rosa mosqueta voltou ao estoque (motivo: Produto com defeito) — Aparecida Moura')
  })
  it('a venda paga segue "Estornou a venda de produto"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const paga = [
      r({ tabela: 'financial_transactions', registro_id: 'ft9', operacao: 'criou', client_id: 'cA', depois: { type: 'EXPENSE', amount: 90, category: 'Estorno' } }),
      ...cancelamento(),
    ]
    expect(sp(fraseDoGrupo(paga, nomes))).toMatch(/^Estornou a venda de produto \(R\$ 90,00/)
  })
  it('a leitura busca o motivo da venda de produto cancelada', () => {
    const leitura = ler('lib/auditoria/leitura.ts')
    expect(leitura).toMatch(/from\('product_sales'\)\.select\('id, estorno_motivo/)
  })
  it('a filha de uma só vai no singular ("1 item", não "1 itens")', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'product_sales', registro_id: 'ps2', client_id: 'cA', colunas: ['price'], antes: { price: 90 }, depois: { price: 80 } }),
      r({ tabela: 'product_sale_items', registro_id: 'it2', client_id: 'cA', colunas: ['quantity'] }),
    ]
    const frase = sp(fraseDoGrupo(linhas, nomes))
    expect(frase).toMatch(/1 item\)/)
    expect(frase).not.toMatch(/1 itens/)
  })
})

describe('A3: salvar o procedimento grava só o que mudou (AD-13, princípio 3)', () => {
  it('a diferença das ligações: o igual não se apaga nem se recria', async () => {
    const { diferencaDasLigacoes } = await import('@/lib/procedimentos/ligacoes')
    const iguais = diferencaDasLigacoes([{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }], [{ user_id: 'c' }, { user_id: 'a' }, { user_id: 'b' }], 'user_id')
    expect(iguais).toEqual({ apagar: [], criar: [], mudar: [] })
    const trocou = diferencaDasLigacoes([{ user_id: 'a' }, { user_id: 'b' }], [{ user_id: 'b' }, { user_id: 'c' }], 'user_id')
    expect(trocou).toEqual({ apagar: [{ user_id: 'a' }], criar: [{ user_id: 'c' }], mudar: [] })
  })
  it('a ligação com valor muda só onde o valor mudou (o numérico do banco vem como texto)', async () => {
    const { diferencaDasLigacoes } = await import('@/lib/procedimentos/ligacoes')
    const d = diferencaDasLigacoes(
      [{ product_id: 'p1', quantity: '2.000', unit_cost: '10' }, { product_id: 'p2', quantity: 1, unit_cost: 5 }],
      [{ product_id: 'p1', quantity: 2, unit_cost: 10 }, { product_id: 'p2', quantity: 3, unit_cost: 5 }],
      'product_id', ['quantity', 'unit_cost'],
    )
    expect(d).toEqual({ apagar: [], criar: [], mudar: [{ product_id: 'p2', quantity: 3, unit_cost: 5 }] })
    const nulos = diferencaDasLigacoes([{ branch_id: 'b1', price: null, labor_cost: '30.00' }], [{ branch_id: 'b1', price: null, labor_cost: 30 }], 'branch_id', ['price', 'labor_cost'])
    expect(nulos.mudar).toEqual([])
  })
  it('updateProcedure não apaga as ligações inteiras para regravar', () => {
    const fonte = ler('actions/procedures.ts')
    for (const tabela of ['procedure_professionals', 'procedure_rooms', 'procedure_products', 'procedure_branch_pricing', 'procedure_branch_availability']) {
      expect(fonte, tabela).not.toMatch(new RegExp(`from\\('${tabela}'\\)\\.delete\\(\\)\\.eq\\('procedure_id', procedureId\\)\\s*,`))
    }
    expect(fonte).toMatch(/diferencaDasLigacoes/)
  })
  it('a regra de comissão igual à gravada não se apaga e recria (migration)', () => {
    const dir = join(WEB, '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(dir).find(f => /^202612176\d{5}_.*comissao.*\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa da Auditoria').toBeTruthy()
    const sql = readFileSync(join(dir, arquivo!), 'utf8')
    expect(sql).toContain('create or replace function pg_temp.trocar_no_corpo')
    expect(sql).toMatch(/public\.comissao_do_procedimento_definir\(uuid, uuid, jsonb, jsonb, uuid, text\)/)
    expect(sql).toMatch(/trim_scale/)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
