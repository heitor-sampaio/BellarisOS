import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * As correções da 24ª simulação (2026-11-18) — financeiro, comissões,
 * estoque, relatórios e auditoria; e "Novos clientes" só na rede (o Heitor,
 * 18/11: "o cliente é da rede"; sobre o número numa unidade: "Só na rede").
 */

const RAIZ = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8')
const MIGRATIONS = join(RAIZ, '..', '..', 'supabase', 'migrations')
const migrationDa24 = () => {
  return readdirSync(MIGRATIONS).filter(f => f.startsWith('202611236')).sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n')
}
const sp = (s: string) => s.replace(/[  ]/g, ' ')

describe('A10 (3): o custo fora do comum AVISA também sem referência (princípio 2)', () => {
  it('R$ 40.000 por embalagem, sem custo nem preço de venda, avisa — e não recusa', async () => {
    const { avisoDoCustoDaEntrada } = await import('@/lib/estoque/custo-da-entrada')
    const aviso = avisoDoCustoDaEntrada(40000, { custo: null, venda: null })
    expect(aviso && sp(aviso)).toMatch(/R\$ 40\.000,00/)
    expect(aviso).toMatch(/[Cc]onfira/)
    // Um custo comum, sem referência, não avisa.
    expect(avisoDoCustoDaEntrada(450, { custo: null, venda: null })).toBeNull()
  })
  it('o cadastro (estoque inicial) usa o mesmo aviso que a Entrada', () => {
    expect(ler('components/branch/stock-product-modal.tsx')).toMatch(/avisoDoCustoDaEntrada\(/)
  })
})

describe('A10 (1): o custo do lote se corrige enquanto nada saiu dele', () => {
  it('a action confere o Estoque em Gerenciar, a unidade ao alcance e grava pela função do banco', () => {
    const src = ler('actions/stock.ts')
    const corpo = src.slice(src.indexOf('export async function corrigirCustoDoLote'))
    expect(corpo.length, 'corrigirCustoDoLote em actions/stock.ts').toBeGreaterThan(100)
    const fim = corpo.indexOf('\nexport ', 10)
    const so = fim > 0 ? corpo.slice(0, fim) : corpo
    expect(so).toMatch(/assertPermission\(ctx, 'stock', 'MANAGE'\)/)
    expect(so).toMatch(/alcancaUnidade\(/)
    expect(so).toMatch(/estoque_corrigir_custo_do_lote/)
  })
  it('a lista dos lotes sabe quais têm o custo editável, e a tela oferece "Corrigir custo"', () => {
    expect(ler('lib/estoque/lotes.ts')).toMatch(/custoEditavel/)
    expect(ler('components/admin/admin-stock-view.tsx')).toMatch(/Corrigir custo/)
  })
  it('o banco: a função recusa o lote do qual já saiu algo, e a Auditoria guarda o custo', () => {
    const m = migrationDa24()
    expect(m).toMatch(/function public\.estoque_corrigir_custo_do_lote/)
    expect(m).toMatch(/m2\.quantity < 0/)
    // O produto é o rótulo do movimento: a edição do custo chega com ele.
    expect(m).toMatch(/auditar\('normal', 'product_id', 'type,quantity,unit_cost/)
  })
  it('a Auditoria diz o custo corrigido, de quanto para quanto, por embalagem', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const nomes: NomesDaAuditoria = {
      clientes: {}, membros: {}, unidades: {}, produtos: { pP: 'Preenchedor' },
      embalagensDosProdutos: { pP: { unidade: 'seringa', fator: 1 } },
    }
    const r: RegistroDaAuditoria = {
      id: 1, criado_em: '2026-11-18T10:00:00Z', branch_id: 'b', client_id: null, tabela: 'stock_movements', operacao: 'editou',
      registro_id: 'm1', colunas: ['unit_cost'], antes: { unit_cost: 40000, product_id: 'pP' }, depois: { unit_cost: 400, product_id: 'pP' },
      ator_user_id: null, ator_nome: 'Larissa', ator_tipo: 'membro', incompleto: false,
    }
    expect(sp(fraseDaAuditoria(r, nomes))).toBe('Corrigiu o custo do lote de Preenchedor: de R$ 40.000,00 para R$ 400,00 por seringa')
  })
})

describe('A10 (2): o ajuste com o motivo "Correção de cadastro" não é perda', () => {
  it('o núcleo do ajuste chama a função da correção quando a pessoa escolhe o motivo', () => {
    const src = ler('lib/estoque/movimentos.ts')
    expect(src).toMatch(/correcao/)
    expect(src).toMatch(/estoque_ajuste_de_correcao/)
    expect(ler('actions/stock.ts')).toMatch(/correcao_de_cadastro/)
  })
  it('a janela do Ajuste oferece o motivo', () => {
    expect(ler('components/admin/admin-stock-manage-modal.tsx')).toMatch(/Correção de cadastro/)
  })
  it('metrics_perdas deixa a correção de fora', () => {
    expect(migrationDa24()).toMatch(/and not m\.correcao_de_cadastro/)
  })
})

describe('A26: o lançamento do atendimento diz o procedimento', () => {
  it('descricaoComOProcedimento troca o "Atendimento concluído" pelo nome do procedimento', async () => {
    const m = await import('@/lib/financeiro/descricao-do-lancamento').catch(() => ({})) as Record<string, unknown>
    const f = m.descricaoComOProcedimento as ((d: string | null, p: string | null) => string | null) | undefined
    expect(f, 'descricaoComOProcedimento em lib/financeiro/descricao-do-lancamento').toBeTypeOf('function')
    expect(f!('Atendimento concluído', 'Preenchimento labial')).toBe('Preenchimento labial')
    expect(f!('Atendimento concluído — saldo', 'Limpeza de pele')).toBe('Limpeza de pele — saldo')
    expect(f!('Atendimento concluído', null)).toBe('Atendimento concluído')
    expect(f!('Venda do pacote X', 'Limpeza')).toBe('Venda do pacote X')
  })
  it('as duas telas do Financeiro e as parcelas da operadora usam o nome', () => {
    expect(ler('app/admin/financeiro/page.tsx')).toMatch(/comOProcedimento/)
    expect(ler('app/[slug]/financeiro/page.tsx')).toMatch(/comOProcedimento/)
  })
})

describe('A27: "A receber da operadora" mostra o em aberto grande, como o da cliente', () => {
  it('nos dois portais', () => {
    for (const arquivo of ['components/admin/admin-financial-view.tsx', 'components/branch/financial-hub.tsx']) {
      const src = ler(arquivo)
      const bloco = src.slice(src.indexOf('const cartaoDaOperadora'), src.indexOf('const cartaoAPagar'))
      expect(bloco, arquivo).toMatch(/NotaDoVencimento noTopoOEmAberto/)
      expect(bloco, arquivo).toMatch(/(value=\{fmtBRL\(operadora\.emAberto\)\}|curr=\{aReceberDaOperadora\.emAberto\})/)
    }
  })
})

describe('A28: as categorias de despesa, as mais comuns primeiro', () => {
  it('"Compra de estoque" abre a lista; "Fornecedores" não', async () => {
    const { CATEGORIAS_DE_DESPESA } = await import('@/lib/financeiro/categorias')
    expect(CATEGORIAS_DE_DESPESA[0]).toBe('Compra de estoque')
    expect(CATEGORIAS_DE_DESPESA.indexOf('Fornecedores')).toBeGreaterThan(4)
    expect(CATEGORIAS_DE_DESPESA[CATEGORIAS_DE_DESPESA.length - 1]).toBe('Outro')
  })
})

describe('A29: os últimos fechamentos das comissões', () => {
  it('dizem a hora do pagamento', async () => {
    const { textoDoFechamento } = await import('@/lib/comissoes/extrato-texto')
    const t = textoDoFechamento({ inicio: '2026-11-01T03:00:00Z', fim: '2026-11-18T02:31:00Z', paidAt: '2026-11-18T13:05:00Z' }, 'America/Sao_Paulo')
    expect(t).toMatch(/pago em 18\/11\/2026 às 10:05/)
  })
  it('o estorno abre numa janela, como nas outras telas', () => {
    const src = ler('components/shared/financeiro-comissoes.tsx')
    const linha = src.slice(src.indexOf('function LinhaDeFechamento'))
    expect(linha).toMatch(/<JanelaModal/)
    expect(linha).not.toMatch(/role="group" aria-label="Estornar o fechamento"/)
  })
})

describe('A30: cada aba dos Relatórios diz a base do valor', () => {
  it('Vendas e Procedimentos têm a nota da base, com a dica', () => {
    const src = ler('components/admin/reports-bi-view.tsx')
    expect(src).toMatch(/DEFINICOES\.baseDasVendas/)
    expect(src).toMatch(/DEFINICOES\.baseDosProcedimentos/)
  })
  it('a nota das Vendas diz o voucher; a dos Procedimentos, o líquido e a margem pelo preço do agendamento', async () => {
    const { DEFINICOES } = await import('@/lib/metrics/definicoes') as unknown as { DEFINICOES: Record<string, { texto: string } | undefined> }
    expect(DEFINICOES.baseDasVendas?.texto).toMatch(/voucher/)
    expect(DEFINICOES.baseDosProcedimentos?.texto).toMatch(/margem/)
  })
})

describe('A31: com uma categoria só, o Estoque diz que o gráfico não aparece e por quê', () => {
  it('uma linha no lugar do gráfico', () => {
    const src = ler('components/admin/reports-bi-view.tsx')
    expect(src).toMatch(/data-categoria-unica/)
  })
})

describe('A33: a Auditoria do lançamento editado diz o antes e o depois', () => {
  const base = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
    id: 10, criado_em: '2026-11-18T10:00:00Z', branch_id: 'b', client_id: null, tabela: 'financial_transactions', operacao: 'editou',
    registro_id: 't1', colunas: [], antes: {}, depois: {}, ator_user_id: null, ator_nome: 'Larissa', ator_tipo: 'membro', incompleto: false, ...x,
  })
  const nomes: NomesDaAuditoria = { clientes: {}, membros: {}, unidades: {}, fusos: { b: 'America/Sao_Paulo' } }

  it('"Editou o lançamento (valor: R$ 150,00 → R$ 100,00; …)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const frase = sp(fraseDaAuditoria(base({
      colunas: ['amount', 'data_de_referencia', 'is_paid'],
      antes:  { amount: 150, data_de_referencia: '2026-11-10T15:00:00Z', is_paid: false },
      depois: { amount: 100, data_de_referencia: '2026-11-12T15:00:00Z', is_paid: true },
    }), nomes))
    expect(frase).toMatch(/valor: R\$ 150,00 → R\$ 100,00/)
    expect(frase).toMatch(/data de referência: 10\/11\/2026 → 12\/11\/2026/)
    expect(frase).toMatch(/pago: não → sim/)
  })

  it('o estorno diz a forma e a parcela', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      base({ id: 21, operacao: 'criou', registro_id: 'e1', depois: { category: 'Estorno', amount: 100, type: 'EXPENSE', payment_method: 'PIX' } }),
      base({ id: 20, registro_id: 't1', colunas: ['notes'], antes: {}, depois: {} }),
    ]
    const frase = sp(fraseDoGrupo(linhas, { ...nomes, lancamentos: { t1: { tipo: 'INCOME', valor: 100, forma: 'PIX', parcela: 2, de: 4, agendamento: false, vezes: null } } }))
    expect(frase).toMatch(/^Estornou um pagamento \(R\$ 100,00 · Pix · parcela 2\/4\)/)
  })
})

describe('A34: a Auditoria volta às mais recentes de qualquer página', () => {
  it('"Voltar às mais recentes" no topo e no fim da página com ?antes=', () => {
    const src = ler('app/_shared/auditoria.tsx')
    expect(src.match(/Voltar às mais recentes/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('"Novos clientes" só na rede (o Heitor, 18/11)', () => {
  it('o núcleo e o "Por unidade" trazem o número NULO fora da rede inteira', () => {
    const m = migrationDa24()
    expect(m).toMatch(/select case when k\.toda then \(/)
    expect(m).toMatch(/case when public\.recorte_e_a_clinica\(p_tenant, array\[b\.id\]\) then/)
    expect(m).not.toMatch(/or exists \(\s*select 1 from public\.appointments a\s*join public\.branches b on b\.id = a\.branch_id\s*where a\.client_id = c\.id and a\.status <> 'CANCELLED'/)
    expect(ler('lib/metrics/queries.ts')).toMatch(/newClients:\s+number \| null/)
  })
  it('as telas escondem o número quando ele não existe', () => {
    expect(ler('components/admin/admin-dashboard-view.tsx')).not.toMatch(/Como os novos de cada unidade/)
    expect(ler('components/admin/admin-dashboard-view.tsx')).toMatch(/newClients !== null/)
    expect(ler('components/admin/reports-bi-view.tsx')).toMatch(/core\.newClients !== null/)
    expect(ler('app/[slug]/dashboard/page.tsx')).toMatch(/core\.newClients === null/)
  })
  it('o Reativar é sempre o da rede — nada de "atendidas na unidade" nem da unidade do cadastro', async () => {
    const unidade = ler('lib/metrics/unidade.ts')
    expect(unidade).not.toMatch(/rpc\('metrics_clientes_para_reativar'/)
    const { deQuemSaoAsClientes } = await import('@/components/shared/quadros-de-clientes')
    expect((deQuemSaoAsClientes as (r: { dela: boolean }) => string)({ dela: false })).toBe('da rede')
    for (const arquivo of ['app/[slug]/dashboard/page.tsx', 'app/admin/dashboard/page.tsx', 'components/shared/quadros-de-clientes.tsx']) {
      expect(ler(arquivo), arquivo).not.toMatch(/atendidas na unidade/)
    }
    expect(migrationDa24()).toMatch(/ult\.branch_id as unidade_id/)
  })
})
