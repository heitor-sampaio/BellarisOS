import { describe, it, expect, vi } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A7, A33 e A34 da 21ª simulação (2026-11-17), a Auditoria.
 *
 * A7 [3]: o estorno do fechamento de comissão saía "Estornou um pagamento
 * (R$ 630,00)"; o CSV repetia a mesma frase em "O quê" e em "Gravação"; e
 * "Criou a aba de relatório do cargo" aparecia 13 vezes, sem dizer qual aba.
 * A33 [3]: "Transferiu 2 Toxina 1 frasco de…": a quantidade colada num nome de
 * produto que tem número — a medida do movimento vai junto ("2 frascos de").
 * A34 [3]: a evolução da conclusão saía "Da rede" no detalhe da gravação, com a
 * linha em "Pajuçara" (o CSV já levava a unidade da gravação, A37 da 20ª).
 */

const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-17T17:00:00.000Z', branch_id: 'bP', client_id: null, tabela: 'financial_transactions', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Helena Violeta', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cL: 'Laura Mendes' }, membros: {}, unidades: { bP: 'Pajuçara', bV: 'Ponta Verde' },
  produtos: { pT: 'Toxina 1 frasco', pS: 'Sérum facial' },
  medidasDosProdutos: { pT: 'frasco', pS: 'un' },
  pagamentosDeComissao: { po1: 'Dra. Sara' },
  cargos: { rt1: 'Balcão', rt2: 'Balcão', rp1: 'Balcão' },
}

describe('A7: o estorno do fechamento de comissão diz o fato', () => {
  it('"Estornou o fechamento da comissão de Dra. Sara", não "um pagamento"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ operacao: 'criou', registro_id: 'ft2', depois: { category: 'Estorno', amount: 630, type: 'EXPENSE' } }),
      r({ registro_id: 'ft1', colunas: ['estorno_motivo', 'notes'] }),
      r({ tabela: 'commissions', registro_id: 'co1', colunas: ['status', 'paid_at', 'paid_by', 'payout_id'], antes: { status: 'PAID' }, depois: { status: 'OPEN' } }),
      r({ tabela: 'commission_payouts', registro_id: 'po1', colunas: ['estornado_at', 'estornado_por', 'estorno_motivo', 'estorno_transaction_id'] }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Estornou o fechamento da comissão de Dra. Sara (R$ 630,00)')
  })
})

describe('A7: o CSV não repete a frase em "O quê" e em "Gravação"', () => {
  it('a gravação de um registro só: a frase no "O quê" (a da tela), a "Gravação" vazia', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const csv = linhasDoCsvDaAuditoria([r({ tabela: 'tags', operacao: 'criou', branch_id: null, depois: { nome: 'VIP' } })], nomes)
    expect(csv).toHaveLength(1)
    expect(csv[0]!.oQue).toBe('Criou a tag VIP')
    expect(csv[0]!.gravacao).toBe('')
  })
  it('a baixa sozinha diz o fato no "O quê" (como a tela), não "Editou o lançamento"', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const baixa = r({ registro_id: 'ft9', colunas: ['paid_at', 'is_paid', 'payment_method'], antes: { paid_at: null }, depois: { paid_at: '2026-11-17T17:00:00Z', payment_method: 'PIX' } })
    const csv = linhasDoCsvDaAuditoria([baixa], { ...nomes, lancamentos: { ft9: { tipo: 'INCOME', valor: 200, forma: 'PIX', parcela: 2, de: 3 } } })
    expect(sp(csv[0]!.oQue)).toBe('Recebeu a parcela 2/3 (R$ 200,00, Pix)')
    expect(csv[0]!.gravacao).toBe('')
  })
  it('na gravação de vários registros, a linha cuja frase é a da gravação não a repete', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const csv = linhasDoCsvDaAuditoria([
      r({ tabela: 'appointments', registro_id: 'ap1', client_id: 'cL', colunas: ['scheduled_at'], depois: { scheduled_at: '2026-11-20T13:00:00Z' } }),
      r({ tabela: 'leads', registro_id: 'l1', branch_id: null, colunas: ['owner_id'] }),
    ], nomes)
    const remarcou = csv.find(l => l.oQue.startsWith('Remarcou'))!
    expect(remarcou.gravacao).toBe('')
    const outra = csv.find(l => !l.oQue.startsWith('Remarcou'))!
    expect(outra.gravacao.startsWith('Remarcou')).toBe(true)
  })
})

describe('A7: a aba de relatório do cargo diz qual aba e de qual cargo', () => {
  it('cada linha diz a aba ("Financeiro") e o cargo', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'role_report_tabs', operacao: 'criou', registro_id: 'rt1', branch_id: null, depois: { tab: 'financeiro' } }), nomes))
      .toBe('Criou a aba de relatório Financeiro do cargo Balcão')
    expect(fraseDaAuditoria(r({ tabela: 'role_report_tabs', operacao: 'apagou', registro_id: 'rt9', branch_id: null, antes: { tab: 'comercial' } }), nomes))
      .toBe('Apagou a aba de relatório Oportunidades')
  })
  it('salvar os acessos de um cargo (permissões e abas, sem o cargo na gravação) é UMA frase com o cargo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'role_report_tabs', operacao: 'criou', registro_id: 'rt1', branch_id: null, depois: { tab: 'financeiro' } }),
      r({ tabela: 'role_report_tabs', operacao: 'criou', registro_id: 'rt2', branch_id: null, depois: { tab: 'vendas' } }),
      r({ tabela: 'role_permissions', operacao: 'editou', registro_id: 'rp1', branch_id: null, colunas: ['level'], depois: { module: 'reports', level: 'VIEW' } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Mudou os acessos do cargo Balcão (2 abas de relatório e 1 permissão)')
  })
})

describe('A33: a quantidade do movimento vai com a medida', () => {
  it('"Transferiu 2 frascos de Toxina 1 frasco"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'stock_movements', operacao: 'criou', branch_id: 'bV', depois: { type: 'TRANSFER_OUT', quantity: -2, product_id: 'pT' } }),
      r({ tabela: 'stock_movements', operacao: 'criou', branch_id: 'bP', depois: { type: 'TRANSFER_IN', quantity: 2, product_id: 'pT' } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Transferiu 2 frascos de Toxina 1 frasco de Ponta Verde para Pajuçara')
  })
  it('a sigla fica ("1 un de Sérum facial"); sem a medida lida, como antes', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'stock_movements', operacao: 'criou', depois: { type: 'LOSS', quantity: -1, product_id: 'pS' } }), nomes))
      .toBe('Registrou a perda de 1 un de Sérum facial')
    expect(fraseDaAuditoria(r({ tabela: 'stock_movements', operacao: 'criou', depois: { type: 'LOSS', quantity: -1, product_id: 'pS' } }), { ...nomes, medidasDosProdutos: {} }))
      .toBe('Registrou a perda de 1 Sérum facial')
  })
})

describe('A34: o detalhe da gravação leva a unidade dela no registro clínico sem unidade', () => {
  it('a evolução da conclusão sai em Pajuçara no detalhe, como na linha', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const g = gruposDaAuditoria([
      r({ tabela: 'medical_record_entries', operacao: 'criou', branch_id: null, client_id: 'cL' }),
      r({ tabela: 'appointments', registro_id: 'ap1', client_id: 'cL', colunas: ['status', 'completed_at'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
    ], nomes, '/admin/auditoria', null)
    expect(g).toHaveLength(1)
    expect(g[0]!.unidade).toBe('Pajuçara')
    expect(g[0]!.detalhes.map(d => d.unidade)).toEqual(['Pajuçara', 'Pajuçara'])
  })
})

// ─── A leitura: a medida do produto e o cargo da aba de relatório ──────────

const consultas: { tabela: string; metodo: string; args: unknown[] }[] = []
let dadosDaAuditoria: unknown[] = []
const dadosPorTabela: Record<string, unknown[]> = {}
function construtor(tabela: string) {
  const p: unknown = new Proxy({}, {
    get(_, prop: string) {
      if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: tabela === 'auditoria' ? dadosDaAuditoria : dadosPorTabela[tabela] ?? [], error: null })
      return (...args: unknown[]) => { consultas.push({ tabela, metodo: prop, args }); return p }
    },
  })
  return p
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor, rpc: () => construtor('rpc') }) }))
// D2 da 23ª: a leitura pede o fuso do recorte (cacheado: fora do Next, sem o cache).
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({ fusoDoRecorte: async () => 'America/Sao_Paulo' }))

const U = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`
const daRede = { isNetworkAdmin: true, permissions: { audit: 'MANAGE' }, tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u9' } as unknown as TenantContext

describe('A7/A33: a leitura busca a medida do produto e o cargo da aba de relatório', () => {
  it('a medida do movimento (a de consumo, quando há) e o cargo pela linha da aba', async () => {
    consultas.length = 0
    dadosDaAuditoria = [
      r({ tabela: 'stock_movements', operacao: 'criou', registro_id: U(1), depois: { type: 'LOSS', quantity: -1, product_id: U(2) } }),
      r({ tabela: 'stock_movements', operacao: 'criou', registro_id: U(3), depois: { type: 'LOSS', quantity: -50, product_id: U(4) } }),
      r({ tabela: 'role_report_tabs', operacao: 'criou', registro_id: U(5), depois: { tab: 'financeiro' } }),
    ]
    dadosPorTabela.products = [
      { id: U(2), name: 'Toxina 1 frasco', unit: 'frasco', consumption_unit: null, units_per_package: null },
      { id: U(4), name: 'Peeling', unit: 'frasco', consumption_unit: 'ml', units_per_package: 500 },
    ]
    dadosPorTabela.role_report_tabs = [{ id: U(5), role_id: U(6) }]
    dadosPorTabela.tenant_roles = [{ id: U(6), name: 'Balcão' }]
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    const p = await lerAuditoria(daRede, { period: 'month' }, { porGravacao: true })
    expect(p.nomes.medidasDosProdutos?.[U(2)]).toBe('frasco')
    expect(p.nomes.medidasDosProdutos?.[U(4)]).toBe('ml')
    expect(p.nomes.cargos?.[U(5)]).toBe('Balcão')
    expect(consultas.some(c => c.tabela === 'role_report_tabs' && c.metodo === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === 't1')).toBe(true)
  })
})
