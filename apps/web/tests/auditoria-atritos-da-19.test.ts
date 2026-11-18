import { describe, it, expect, vi } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A32–A36 da 19ª simulação (2026-11-16), a Auditoria — sobras da 17ª e da 18ª.
 *
 * A32 [3]: "(data de referência, pago, maquininha id e mais 3 campos)" — a
 * trava do A30 da 18ª cobria users, commissions, commission_payouts e
 * appointments; financial_transactions ficou de fora (colunas do banco em
 * 2026-11-16, sem id, created_at e updated_at).
 * A33 [3]: o voucher devolvido pelo estorno saía "Editou o voucher (situação,
 * uso e lançamento usado)", sem dizer que voltou a ativo; o "Fechou de novo o
 * dia" não trazia o conferido.
 * A34 [3]: o remarcar e o repasse eram "Editou o agendamento (…)".
 * A35 [3]: o contrato gerado depois da venda saía "Editou o documento (conteúdo,
 * pagamento combinado, geração…)" à parte; a ficha nova, "Criou a ficha da
 * cliente de X".
 * A36 [3]: a oportunidade (sem unidade) saía com "—" na coluna Unidade.
 */

const sp = (s: string) => s.replace(/ /g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-16T14:00:00.000Z', branch_id: 'bA', client_id: null, tabela: 'financial_transactions', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Sabrina Lima', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cT: 'Tereza Gomes', cL: 'Larissa Pinto' }, membros: { uC: 'Dr. Caio', uS: 'Sabrina Lima' }, unidades: { bA: 'Aldeota' },
  pacotes: { pk1: '5 depilações' },
}

const COLUNAS_DO_BANCO: Record<string, string[]> = {
  financial_transactions: ['branch_id', 'cash_register_id', 'appointment_id', 'type', 'category', 'description', 'amount', 'payment_method',
    'due_date', 'paid_at', 'is_paid', 'notes', 'created_by', 'client_id', 'treatment_plan_id', 'loyalty_discount', 'client_package_id',
    'sale_discount', 'procedure_sale_id', 'parcela_numero', 'parcela_total', 'parcela_grupo', 'data_de_referencia', 'cartao_vezes',
    'estorno_motivo', 'product_sale_id', 'desconto_motivo', 'cartao_bandeira', 'credito_vendido_id', 'vencimentos_anteriores',
    'fornecedor', 'nota_fiscal', 'valor_antes_do_estorno', 'recebido_por', 'estorno_de', 'maquininha_id'],
}

describe('A32: toda coluna do lançamento tem nome na Auditoria', () => {
  it('a trava', async () => {
    const { CAMPO_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    const sem = Object.entries(COLUNAS_DO_BANCO).flatMap(([t, cs]) => cs.filter(c => !CAMPO_DA_AUDITORIA[c]).map(c => `${t}.${c}`))
    expect(sem).toEqual([])
  })
  it('"maquininha", não "maquininha id"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ colunas: ['maquininha_id', 'cartao_bandeira'] }), nomes)).toBe('Editou o lançamento (maquininha e bandeira do cartão)')
  })
})

describe('A33: o voucher devolvido e o conferido do fechamento', () => {
  const devolvido = r({
    tabela: 'loyalty_vouchers', registro_id: 'v1', client_id: 'cL', colunas: ['status', 'used_at', 'used_transaction_id'],
    antes: { name: 'Voucher R$ 30', status: 'USADO' }, depois: { name: 'Voucher R$ 30', status: 'ATIVO' },
  })
  it('o voucher que volta a ativo diz que voltou', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(devolvido, nomes))).toBe('Devolveu o Voucher R$ 30 (voltou a ativo) — Larissa Pinto')
  })
  it('o estorno diz que o voucher voltou', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const estorno = r({ operacao: 'criou', registro_id: 'ft2', client_id: 'cL', depois: { category: 'Estorno', amount: 130, type: 'EXPENSE' } })
    const linhas = [estorno, devolvido]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Estornou um pagamento (R$ 130,00), e o Voucher R$ 30 voltou a ativo — Larissa Pinto')
  })
  it('o "Fechou de novo" traz o conferido', async () => {
    const { fraseDaAuditoria, conferidoDoFechamento } = await import('@/lib/auditoria/frase')
    expect(sp(conferidoDoFechamento(300, { PIX: 1200, 'CREDIT_CARD:3': 500 })))
      .toBe('Dinheiro R$ 300,00, Pix R$ 1.200,00 e Cartão de crédito 3x R$ 500,00')
    expect(conferidoDoFechamento(null, null)).toBe('')
    const fechou = r({ tabela: 'fechamentos_do_dia', operacao: 'criou', registro_id: 'fd2', depois: { dia: '2026-11-16', diferenca: 0 } })
    const comNomes = { ...nomes, fechamentosDeNovo: { fd2: true }, conferidosDoFechamento: { fd2: 'Dinheiro R$ 300,00 e Pix R$ 1.200,00' } }
    expect(sp(fraseDaAuditoria(fechou, comNomes))).toBe('Fechou de novo o dia 16/11/2026 (conferido: Dinheiro R$ 300,00 e Pix R$ 1.200,00)')
    const comDiferenca = r({ tabela: 'fechamentos_do_dia', operacao: 'criou', registro_id: 'fd2', depois: { dia: '2026-11-16', diferenca: -10 } })
    expect(sp(fraseDaAuditoria(comDiferenca, comNomes))).toBe('Fechou de novo o dia 16/11/2026 (conferido: Dinheiro R$ 300,00 e Pix R$ 1.200,00; diferença de -R$ 10,00)')
  })
})

describe('A34: o remarcar e o repasse são o fato', () => {
  const remarcou = r({
    tabela: 'appointments', registro_id: 'ap1', client_id: 'cL', colunas: ['confirmed_at', 'room_id', 'scheduled_at', 'status'],
    antes: { scheduled_at: '2026-11-17T12:00:00+00:00', status: 'CONFIRMED' }, depois: { scheduled_at: '2026-11-17T14:00:00+00:00', status: 'SCHEDULED' },
  })
  it('"Remarcou o agendamento de X para dd/mm/aaaa hh:mm"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(remarcou, nomes))).toBe('Remarcou o agendamento de Larissa Pinto para 17/11/2026 11:00')
  })
  it('com quem atende trocado junto', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const comOutra = { ...remarcou, colunas: [...remarcou.colunas, 'professional_id'], depois: { ...remarcou.depois, professional_id: 'uC' } }
    expect(sp(fraseDaAuditoria(comOutra, nomes))).toBe('Remarcou o agendamento de Larissa Pinto para 17/11/2026 11:00, com Dr. Caio')
  })
  it('"Repassou o agendamento de X a Fulano"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const repasse = r({ tabela: 'appointments', registro_id: 'ap2', client_id: 'cL', colunas: ['professional_id'], antes: { professional_id: 'uS' }, depois: { professional_id: 'uC' } })
    expect(sp(fraseDaAuditoria(repasse, nomes))).toBe('Repassou o agendamento de Larissa Pinto a Dr. Caio')
  })
  it('na gravação com outros registros, o fato é o remarcar', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const outro = r({ tabela: 'issued_documents', registro_id: 'd9', client_id: 'cL', colunas: ['status'], antes: { title: 'Termo' }, depois: { title: 'Termo', status: 'PENDENTE' } })
    expect(sp(fraseDoGrupo([remarcou, outro], nomes))).toBe('Remarcou o agendamento de Larissa Pinto para 17/11/2026 11:00')
  })
})

describe('A35: o contrato gerado é parte da venda; a ficha é "de X"', () => {
  it('"Criou a ficha de X" / "Editou a ficha de X (telefone)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'clients', operacao: 'criou', client_id: 'cT', registro_id: 'cT', branch_id: null }), nomes)).toBe('Criou a ficha de Tereza Gomes')
    expect(fraseDaAuditoria(r({ tabela: 'clients', client_id: 'cT', registro_id: 'cT', colunas: ['phone'] }), nomes)).toBe('Editou a ficha de Tereza Gomes (telefone)')
  })

  const gerou = r({
    criado_em: '2026-11-16T14:00:02.500Z', tabela: 'issued_documents', registro_id: 'd1', client_id: 'cT',
    colunas: ['content', 'content_text', 'payment_snapshot', 'rendered_at', 'status'], antes: { title: 'Contrato de pacote' },
    depois: { title: 'Contrato de pacote', status: 'PENDENTE' },
  })
  it('a geração do documento sozinha: "Gerou o documento X"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([gerou], nomes))).toBe('Gerou o documento Contrato de pacote — Tereza Gomes')
  })
  it('logo depois da venda que criou o documento, entra na gravação da venda', async () => {
    const { gruposDaAuditoria, agruparAuditoria } = await import('@/lib/auditoria/frase')
    const venda = [
      r({ tabela: 'issued_documents', operacao: 'criou', registro_id: 'd1', client_id: 'cT', depois: { title: 'Contrato de pacote', status: 'PENDENTE' } }),
      r({ tabela: 'client_packages', operacao: 'criou', registro_id: 'cp1', client_id: 'cT', depois: { package_id: 'pk1', price: 1000 } }),
    ]
    // A mais nova primeiro, como a leitura devolve.
    const registros = [gerou, ...venda]
    expect(agruparAuditoria(registros)).toHaveLength(1)
    const [g] = gruposDaAuditoria(registros, nomes, '/admin/auditoria', null)
    expect(sp(g!.oQue)).toBe('Vendeu o pacote 5 depilações (R$ 1.000,00) — Tereza Gomes')
    expect(g!.detalhes.map(d => sp(d.oQue))).toContain('Gerou o documento Contrato de pacote — Tereza Gomes')
  })
  it('de outra pessoa, ou muito depois, fica à parte', async () => {
    const { agruparAuditoria } = await import('@/lib/auditoria/frase')
    const venda = r({ tabela: 'issued_documents', operacao: 'criou', registro_id: 'd1', client_id: 'cT' })
    expect(agruparAuditoria([{ ...gerou, ator_user_id: 'u2', ator_nome: 'Vítor' }, venda])).toHaveLength(2)
    expect(agruparAuditoria([{ ...gerou, criado_em: '2026-11-16T15:00:00.000Z' }, venda])).toHaveLength(2)
  })
})

describe('A36: a linha sem unidade diz "Da rede"', () => {
  it('a oportunidade, a tag; a entrada no sistema não', async () => {
    const { linhaDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(linhaDaAuditoria(r({ tabela: 'leads', operacao: 'criou', branch_id: null }), nomes, '/admin/auditoria', null).unidade).toBe('Da rede')
    expect(linhaDaAuditoria(r({ tabela: 'leads', operacao: 'criou', branch_id: 'bA' }), nomes, '/admin/auditoria', null).unidade).toBe('Aldeota')
    expect(linhaDaAuditoria(r({ tabela: 'auth', operacao: 'entrou', branch_id: null }), nomes, '/admin/auditoria', null).unidade).toBeNull()
  })
})

// ─── A leitura: os nomes que as frases novas usam ───────────────────────────

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

const UUID_C = '11111111-1111-4111-8111-111111111111'
const UUID_F = '22222222-2222-4222-8222-222222222222'
// A Auditoria é só da Admin da rede (2026-11-16): o contexto que lê a tem.
const daRede = { isNetworkAdmin: true, permissions: { audit: 'MANAGE' }, tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u9' } as unknown as TenantContext

describe('A34 e A33: a leitura busca quem atende e o conferido', () => {
  it('o profissional do agendamento remarcado ou repassado entra nos nomes da equipe', async () => {
    consultas.length = 0
    dadosDaAuditoria = [r({ tabela: 'appointments', registro_id: 'ap2', colunas: ['professional_id'], depois: { professional_id: UUID_C } })]
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    await lerAuditoria(daRede, { period: 'month' }, { porGravacao: true })
    const daEquipe = consultas.find(c => c.tabela === 'users' && c.metodo === 'in')
    expect(daEquipe?.args[1]).toContain(UUID_C)
  })
  it('o fechamento lê o contado e o conferido', async () => {
    consultas.length = 0
    dadosDaAuditoria = [r({ tabela: 'fechamentos_do_dia', operacao: 'criou', registro_id: UUID_F, depois: { dia: '2026-11-16' } })]
    dadosPorTabela.fechamentos_do_dia = [{ id: UUID_F, branch_id: 'bA', dia: '2026-11-16', fechado_em: '2026-11-16T20:00:00Z', contado_dinheiro: 300, conferido: { PIX: 1200 } }]
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    const p = await lerAuditoria(daRede, { period: 'month' }, { porGravacao: true })
    expect(sp(p.nomes.conferidosDoFechamento?.[UUID_F] ?? '')).toBe('Dinheiro R$ 300,00 e Pix R$ 1.200,00')
    delete dadosPorTabela.fechamentos_do_dia
  })
})
