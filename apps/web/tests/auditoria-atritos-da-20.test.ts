import { describe, it, expect, vi } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A34–A37 da 20ª simulação (2026-11-17), a Auditoria — sobras da 19ª e do CF3a.
 *
 * A34 [3]: colunas cruas — "Editou o documento Contrato do pacote de peelings
 * (closed at, closed reason e situação)"; "Editou a sessão do pacote
 * (situação)" três vezes iguais; "validade dos erros" na importação.
 * A35 [3]: "Deu entrada em 1 Ácido…" sem o custo; o "Desfazer entrada" vira
 * "Editou o lote (quantidade)"; "Criou a importação" sem arquivo nem contagem.
 * A36 [3]: duas linhas "Criou o agendamento — Sofia Brandão" iguais, sem a
 * data, o procedimento nem quem atende.
 * A37 [3]: no CSV, "Criou a evolução do prontuário" sai "Da rede", na
 * gravação "Concluiu o atendimento" de uma unidade.
 */

const sp = (s: string) => s.replace(/ /g, ' ')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-17T14:00:00.000Z', branch_id: 'bA', client_id: null, tabela: 'issued_documents', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Lúcia Dália', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cT: 'Tereza Gomes', cS: 'Sofia Brandão' }, membros: { uC: 'Dr. Caio', uP: 'Dra. Paula' }, unidades: { bA: 'Nazaré' },
  produtos: { pAc: 'Ácido hialurônico' },
  motivosDoDocumento: { d1: 'Pacote cancelado', d2: 'A cliente desistiu' },
  sessoesDoPacote: { ps1: 'a sessão 1 do pacote 5 peelings', ps2: 'a sessão 2 do pacote 5 peelings', ps3: 'a sessão 3 do pacote 5 peelings' },
  pacotesDaCliente: { cp1: '5 peelings' },
  importacoes: { im1: { arquivo: 'clientes.csv', destino: 'clientes', total: 40, novas: 30, completadas: 8, comErro: 2 } },
  custosDasEntradas: { sm1: 240 },
  procedimentos: { pr1: 'Peeling químico', pr2: 'Limpeza de pele' },
}

describe('A34: o que a gravação fecha, cancela ou conclui diz o fato', () => {
  it('a trava: as colunas do fechamento, do desfazer e do cancelamento têm nome', async () => {
    const { CAMPO_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    const colunas = ['closed_at', 'closed_reason', 'closed_by', 'desfeita_em', 'desfeita_por', 'desfeita_motivo', 'desfeita_pelo',
      'cancelado_em', 'cancelado_por', 'cancelamento_motivo', 'valor_cancelado', 'cancelamento', 'nome_arquivo', 'destino', 'com_erro',
      'completadas', 'com_aviso', 'oportunidades', 'erro', 'erros', 'unit_cost', 'reference', 'balance_after']
    expect(colunas.filter(c => !CAMPO_DA_AUDITORIA[c])).toEqual([])
    expect(CAMPO_DA_AUDITORIA.erros_expiram_em).not.toBe('validade dos erros')
  })
  it('o documento cancelado, dispensado ou substituído', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const doc = (status: string, reg: string) => r({
      registro_id: reg, client_id: 'cT', colunas: ['status', 'closed_at', 'closed_reason'],
      antes: { title: 'Contrato do pacote de peelings', status: 'PENDENTE' }, depois: { title: 'Contrato do pacote de peelings', status },
    })
    expect(fraseDaAuditoria(doc('CANCELADO', 'd1'), nomes)).toBe('Cancelou o documento Contrato do pacote de peelings (motivo: Pacote cancelado) — Tereza Gomes')
    expect(fraseDaAuditoria(doc('DISPENSADO', 'd2'), nomes)).toBe('Dispensou o documento Contrato do pacote de peelings (motivo: A cliente desistiu) — Tereza Gomes')
    expect(fraseDaAuditoria(doc('SUBSTITUIDO', 'd9'), nomes)).toBe('Substituiu o documento Contrato do pacote de peelings — Tereza Gomes')
  })
  it('a sessão do pacote diz qual é e o que houve', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const s = (reg: string, de: string, para: string) => r({ tabela: 'package_sessions', registro_id: reg, colunas: ['status'], antes: { status: de }, depois: { status: para } })
    expect(fraseDaAuditoria(s('ps1', 'AVAILABLE', 'CANCELLED'), nomes)).toBe('Cancelou a sessão 1 do pacote 5 peelings')
    expect(fraseDaAuditoria(s('ps2', 'AVAILABLE', 'USED'), nomes)).toBe('Usou a sessão 2 do pacote 5 peelings')
    expect(fraseDaAuditoria(s('ps3', 'USED', 'AVAILABLE'), nomes)).toBe('Devolveu a sessão 3 do pacote 5 peelings')
  })
  it('a gravação do cancelamento do pacote é "Cancelou o pacote"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const cancelamento = [
      r({ tabela: 'issued_documents', registro_id: 'd1', client_id: 'cT', colunas: ['status', 'closed_at', 'closed_reason'], depois: { title: 'Contrato', status: 'CANCELADO' } }),
      r({ tabela: 'client_packages', registro_id: 'cp1', client_id: 'cT', colunas: ['cancelado_em', 'cancelado_por', 'cancelamento_motivo', 'valor_cancelado', 'cancelamento'] }),
      ...['ps1', 'ps2', 'ps3'].map(p => r({ tabela: 'package_sessions', registro_id: p, client_id: 'cT', colunas: ['status'], antes: { status: 'AVAILABLE' }, depois: { status: 'CANCELLED' } })),
    ]
    expect(fraseDoGrupo(cancelamento, nomes)).toBe('Cancelou o pacote 5 peelings — Tereza Gomes')
    const comEstorno = [r({ tabela: 'financial_transactions', operacao: 'criou', client_id: 'cT', depois: { category: 'Estorno', amount: 300, type: 'EXPENSE' } }), ...cancelamento]
    expect(sp(fraseDoGrupo(comEstorno, nomes))).toBe('Cancelou o pacote 5 peelings e estornou R$ 300,00 — Tereza Gomes')
  })
  it('a importação: criada com o arquivo e o tamanho, concluída com o placar, o resto pelo nome', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const imp = (x: Partial<RegistroDaAuditoria>) => r({ tabela: 'importacoes', registro_id: 'im1', ...x })
    expect(fraseDaAuditoria(imp({ operacao: 'criou', depois: { status: 'pendente' } }), nomes)).toBe('Criou a importação clientes.csv (40 linhas, para clientes)')
    expect(fraseDaAuditoria(imp({ colunas: ['status', 'concluida_em', 'processadas'], antes: { status: 'importando' }, depois: { status: 'concluida' } }), nomes))
      .toBe('Concluiu a importação clientes.csv (30 novas, 8 completadas, 2 com erro)')
    expect(fraseDaAuditoria(imp({ colunas: ['status', 'concluida_em'], antes: { status: 'importando' }, depois: { status: 'falhou' } }), nomes))
      .toBe('A importação clientes.csv falhou')
    expect(fraseDaAuditoria(imp({ colunas: ['erros_expiram_em'] }), nomes)).toBe('Editou a importação clientes.csv (prazo da lista de erros)')
  })
})

describe('A35: a entrada diz o custo; o desfazer é o fato', () => {
  const entrada = (x: Partial<RegistroDaAuditoria> = {}) => r({
    tabela: 'stock_movements', operacao: 'criou', registro_id: 'sm1', depois: { type: 'PURCHASE', quantity: 2, product_id: 'pAc' }, ...x,
  })
  it('a entrada com o custo, lido agora', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(entrada(), nomes))).toBe('Deu entrada em 2 Ácido hialurônico (R$ 240,00)')
    expect(fraseDaAuditoria(entrada({ registro_id: 'sm9' }), nomes)).toBe('Deu entrada em 2 Ácido hialurônico')
  })
  it('a entrada ao contrário (quantidade negativa) é o desfazer', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(entrada({ registro_id: 'sm2', depois: { type: 'PURCHASE', quantity: -2, product_id: 'pAc' } }), nomes))
      .toBe('Desfez a entrada de 2 Ácido hialurônico')
  })
  it('a gravação do desfazer — o lote gravado primeiro não vira "Editou o lote"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'products', registro_id: 'pAc', colunas: ['cost_price'], depois: { name: 'Ácido hialurônico' } }),
      r({ tabela: 'stock_movements', registro_id: 'sm1', colunas: ['desfeita_em', 'desfeita_por', 'desfeita_motivo', 'desfeita_pelo'] }),
      entrada({ registro_id: 'sm2', depois: { type: 'PURCHASE', quantity: -2, product_id: 'pAc' } }),
      r({ tabela: 'product_batches', registro_id: 'lt1', colunas: ['quantity'], antes: { quantity: 2 }, depois: { quantity: 0 } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Desfez a entrada de 2 Ácido hialurônico')
  })
  it('a gravação da entrada — com o lote gravado primeiro', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'products', registro_id: 'pAc', colunas: ['cost_price'], depois: { name: 'Ácido hialurônico' } }),
      entrada(),
      r({ tabela: 'product_batches', operacao: 'criou', registro_id: 'lt1', depois: { quantity: 2 } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Deu entrada em 2 Ácido hialurônico (R$ 240,00)')
  })
  it('a entrada marcada como desfeita, sozinha', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'stock_movements', registro_id: 'sm1', colunas: ['desfeita_em', 'desfeita_por', 'desfeita_motivo', 'desfeita_pelo'] }), nomes))
      .toBe('Marcou a entrada como desfeita')
  })
})

describe('A36: o agendamento criado diz quando, o quê e com quem', () => {
  const agendou = (x: Partial<RegistroDaAuditoria>) => r({
    tabela: 'appointments', operacao: 'criou', client_id: 'cS',
    depois: { status: 'SCHEDULED', scheduled_at: '2026-11-18T13:00:00.000Z', procedure_id: 'pr1', professional_id: 'uP' }, ...x,
  })
  it('sozinho', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(agendou({}), nomes)).toBe('Agendou Sofia Brandão para 18/11/2026 10:00 — Peeling químico, com Dra. Paula')
    expect(fraseDaAuditoria(agendou({ depois: { scheduled_at: '2026-11-25T13:00:00.000Z', procedure_id: 'pr2' } }), nomes))
      .toBe('Agendou Sofia Brandão para 25/11/2026 10:00 — Limpeza de pele')
  })
  it('numa gravação com outros registros (a oportunidade, o link da ficha)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'pre_atendimento_links', operacao: 'criou', client_id: 'cS' }),
      agendou({}),
      r({ tabela: 'leads', registro_id: 'l1', branch_id: null, colunas: ['crm_stage_id'] }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Agendou Sofia Brandão para 18/11/2026 10:00 — Peeling químico, com Dra. Paula')
  })
})

describe('A37: no CSV, o registro clínico sem unidade leva a unidade da gravação', () => {
  it('a evolução da conclusão sai na unidade do atendimento; a oportunidade segue da rede', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'medical_record_entries', operacao: 'criou', branch_id: null, client_id: 'cT' }),
      r({ tabela: 'leads', registro_id: 'l1', branch_id: null, colunas: ['crm_stage_id'] }),
      r({ tabela: 'appointments', registro_id: 'ap1', client_id: 'cT', colunas: ['status', 'completed_at'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
    ]
    const csv = linhasDoCsvDaAuditoria(linhas, nomes)
    expect(csv.find(l => l.oQue.startsWith('Criou a evolução'))?.unidade).toBe('Nazaré')
    expect(csv.find(l => l.oQue.startsWith('Mudou a etapa'))?.unidade).toBe('Da rede')
    expect(csv.every(l => l.gravacao.startsWith('Concluiu o atendimento'))).toBe(true)
  })
})

// ─── A leitura: o que as frases novas leem agora ───────────────────────────

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

const U = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`
const daRede = { isNetworkAdmin: true, permissions: { audit: 'MANAGE' }, tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u9' } as unknown as TenantContext

describe('A34–A36: a leitura busca o que a frase diz', () => {
  it('o procedimento do agendamento, o custo da entrada, a importação, o motivo do documento, a sessão e o pacote', async () => {
    consultas.length = 0
    dadosDaAuditoria = [
      r({ tabela: 'appointments', operacao: 'criou', registro_id: U(1), depois: { procedure_id: U(2), scheduled_at: '2026-11-18T13:00:00Z' } }),
      r({ tabela: 'stock_movements', operacao: 'criou', registro_id: U(3), depois: { type: 'PURCHASE', quantity: 2, product_id: U(4) } }),
      r({ tabela: 'importacoes', operacao: 'criou', registro_id: U(5) }),
      r({ tabela: 'issued_documents', registro_id: U(6), colunas: ['status', 'closed_reason'], depois: { status: 'CANCELADO' } }),
      r({ tabela: 'package_sessions', registro_id: U(7), colunas: ['status'], depois: { status: 'CANCELLED' } }),
      r({ tabela: 'client_packages', registro_id: U(8), colunas: ['cancelado_em', 'cancelamento'] }),
    ]
    dadosPorTabela.procedures = [{ id: U(2), name: 'Peeling químico' }]
    dadosPorTabela.stock_movements = [{ id: U(3), quantity: 2, unit_cost: 120 }]
    dadosPorTabela.importacoes = [{ id: U(5), nome_arquivo: 'clientes.csv', destino: 'contatos', total: 12, novas: 10, completadas: 1, com_erro: 1 }]
    dadosPorTabela.issued_documents = [{ id: U(6), closed_reason: 'Pacote cancelado' }]
    dadosPorTabela.package_sessions = [{ id: U(7), session_number: 2, client_packages: { service_packages: { name: '5 peelings' } } }]
    dadosPorTabela.client_packages = [{ id: U(8), service_packages: { name: '5 peelings' } }]
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    const p = await lerAuditoria(daRede, { period: 'month' }, { porGravacao: true })
    expect(p.nomes.procedimentos?.[U(2)]).toBe('Peeling químico')
    expect(p.nomes.custosDasEntradas?.[U(3)]).toBe(240)
    expect(p.nomes.importacoes?.[U(5)]).toEqual({ arquivo: 'clientes.csv', destino: 'contatos', total: 12, novas: 10, completadas: 1, comErro: 1 })
    expect(p.nomes.motivosDoDocumento?.[U(6)]).toBe('Pacote cancelado')
    expect(p.nomes.sessoesDoPacote?.[U(7)]).toBe('a sessão 2 do pacote 5 peelings')
    expect(p.nomes.pacotesDaCliente?.[U(8)]).toBe('5 peelings')
    // Tudo pela rede da sessão.
    for (const t of ['procedures', 'importacoes', 'issued_documents']) {
      expect(consultas.some(c => c.tabela === t && c.metodo === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === 't1'), t).toBe(true)
    }
    for (const t of ['stock_movements', 'package_sessions', 'client_packages']) {
      expect(consultas.some(c => c.tabela === t && c.metodo === 'eq' && String(c.args[0]).endsWith('tenant_id') && c.args[1] === 't1'), t).toBe(true)
    }
  })
})
