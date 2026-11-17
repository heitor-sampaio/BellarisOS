import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D1, D5, A27–A31 da 21ª simulação (2026-11-17), o Copilot.
 *
 * D1 [3]: "quanto saiu de despesa em cada unidade?" — o Copilot somou o
 * estorno (o contra-lançamento, `category = 'Estorno'`, tipo EXPENSE) às
 * despesas da Pajuçara: R$ 224, a tela diz R$ 64. O estorno não é despesa, e
 * a despesa do período é a da ferramenta `indicadores` (a conta da tela).
 * D5 [3]: o texto que veio numa volta que também chamou ferramenta parou no
 * meio ("17/11 — 16:"), sem o aviso de corte — o aviso só valia sem chamada.
 * A27 [3]: caminhos crus ("/lavanda-ponta-verde/agenda/<uuid>") no texto, e
 * "Confira e confirme no cartão abaixo" sem cartão nenhum.
 * A28 [3]: a troca só de quem atende saía como "Remarcar atendimento", com De e
 * Para iguais, sem quem atendia nem a unidade.
 * A29 [3]: o cartão da despesa paga não dizia a data do pagamento.
 * A30 [3]: "Receba a massagem da Bruna" perguntava "venda no PDV ou check-in?".
 * A31 [3, 7]: os agendamentos de quem foi desativado: o Copilot dizia "achei um
 * membro desativado… quer que eu procure?" em vez de listar e avisar.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

const UNIDADES = [{ id: 'b-pv', name: 'Lavanda Ponta Verde', slug: 'lavanda-ponta-verde' }, { id: 'b-paj', name: 'Lavanda Pajuçara', slug: 'lavanda-pajucara' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Maceio',
  fusoDaRede: async () => 'America/Maceio',
}))
vi.mock('@/lib/appointments/alteracoes', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/alteracoes')>()),
  agendamentoAoAlcance: async () => ({
    id: 'ag-1', branch_id: 'b-pv', status: 'SCHEDULED', scheduled_at: '2026-11-20T13:00:00.000Z',
    professional_id: 'u-paulo', duration_min: 60, room_id: null, fuso: 'America/Maceio',
  }),
}))
vi.mock('@/lib/appointments/core', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/core')>()),
  horarioOcupado: async () => false,
}))
vi.mock('@/lib/agenda/bloqueios', () => ({ bloqueiosQueBatem: async () => [] }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', () => ({ redeTemRecurso: async () => true }))
vi.mock('@/lib/financeiro/vezes-da-rede', () => ({ maquininhasDaRede: async () => [] }))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-renato', userName: 'Renato', roleLabel: 'Dono',
    tenantId: 't1', branchId: null, unidades: null, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE', financial: 'MANAGE', cashier: 'MANAGE' } as ResolvedPermissions,
    scopes: ALL_SCOPES, reportTabs: [], providesServices: false, isNetworkAdmin: true, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}

/**
 * O Supabase falso: cada tabela devolve as suas linhas, filtradas pelos `eq`
 * e `in` cujas colunas a linha tem; os filtros ficam guardados.
 */
function adminFalso(tabelas: Record<string, Record<string, unknown>[]>) {
  const filtros: { tabela: string; metodo: string; args: unknown[] }[] = []
  const admin = {
    from(tabela: string) {
      const eqs: [string, unknown][] = []
      const ins: [string, unknown[]][] = []
      let um = false
      const encadeia: unknown = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') {
            const linhas = (tabelas[tabela] ?? []).filter(l =>
              eqs.every(([col, v]) => !(col in l) || l[col] === v) && ins.every(([col, vs]) => !(col in l) || vs.includes(l[col])))
            return (ok: (v: unknown) => void) => ok({ data: um ? (linhas[0] ?? null) : linhas, error: null })
          }
          return (...args: unknown[]) => {
            filtros.push({ tabela, metodo: prop, args })
            if (prop === 'eq') eqs.push([args[0] as string, args[1]])
            if (prop === 'in') ins.push([args[0] as string, args[1] as unknown[]])
            if (prop === 'single' || prop === 'maybeSingle') um = true
            return encadeia
          }
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { c: { ctx: ctx(), admin: admin as never, pagina: '/admin/dashboard', slugDoPortal: null }, filtros }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// ─── D1 ─────────────────────────────────────────────────────────────────────

const ESTORNO = {
  id: 't-est', type: 'EXPENSE', category: 'Estorno', description: 'Estorno: Atendimento concluído', amount: 160, payment_method: 'CREDIT_CARD',
  due_date: null, paid_at: '2026-11-17T16:53:00Z', is_paid: true, client_id: null, branch_id: 'b-paj', parcela_numero: null, parcela_total: null, notes: null,
}
const COMISSAO = { ...ESTORNO, id: 't-com', category: 'Comissões', description: 'Comissão da Tânia', amount: 64, payment_method: 'PIX' }

describe('D1: o estorno não é despesa no Copilot', () => {
  it('a linha do estorno vem como "estorno", não "despesa"', async () => {
    const { lancamentos } = await import('@/lib/copilot/ferramentas/gestao')
    const { c } = adminFalso({ financial_transactions: [COMISSAO, ESTORNO], branches: UNIDADES })
    const r = await lancamentos.executar(c, { situacao: 'pagos' })
    const linhas = (r.dados as { lancamentos: { id: string; tipo: string }[] }).lancamentos
    expect(linhas.find(l => l.id === 't-com')?.tipo).toBe('despesa')
    expect(linhas.find(l => l.id === 't-est')?.tipo).toBe('estorno')
  })

  it('pedidas as despesas (ou as receitas), o estorno fica de fora da consulta', async () => {
    const { lancamentos } = await import('@/lib/copilot/ferramentas/gestao')
    const { c, filtros } = adminFalso({ financial_transactions: [COMISSAO], branches: UNIDADES })
    await lancamentos.executar(c, { situacao: 'pagos', tipo: 'despesa' })
    const ors = filtros.filter(f => f.tabela === 'financial_transactions' && f.metodo === 'or').map(f => String(f.args[0]))
    expect(ors).toContain('category.is.null,category.neq.Estorno')
  })

  it('a descrição e o prompt mandam o TOTAL da despesa à ferramenta indicadores, e dizem que o estorno não é despesa', async () => {
    const { lancamentos } = await import('@/lib/copilot/ferramentas/gestao')
    expect(lancamentos.descricao).toMatch(/estorno.*não é despesa/i)
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Lavanda', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/despesa.*indicadores/i)
    expect(texto).toMatch(/nunca some as linhas de lancamentos/i)
  })
})

// ─── D5 ─────────────────────────────────────────────────────────────────────

function respostaSSE(eventos: Record<string, unknown>[]): Response {
  const corpo = eventos.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(corpo)); c.close() },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
const AVISO = '(A resposta foi cortada. Peça a continuação, se precisar.)'
const CHAMADA = { type: 'function_call', call_id: 'call_1', name: 'agendamentos', arguments: '{}' }

describe('D5: o texto cortado numa volta que chamou ferramenta também diz que foi cortado', () => {
  it('response.incomplete com chamada e texto: o aviso entra', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_text.delta', delta: 'Tânia:\n- 17/11 — 16:' },
      { type: 'response.output_item.done', item: CHAMADA },
      { type: 'response.incomplete', response: { output: [CHAMADA], usage: { input_tokens: 10, output_tokens: 3 } } },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const pedacos: string[] = []
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [], aoTexto: p => pedacos.push(p) })
    expect(r.chamadas).toHaveLength(1)
    expect(r.texto.endsWith(AVISO)).toBe(true)
    expect(pedacos.join('')).toBe(r.texto)
  })

  it('o stream que cai sem "concluída", com chamada e texto: o aviso entra', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_text.delta', delta: 'Tânia: 17/11 — 16:' },
      { type: 'response.output_item.done', item: CHAMADA },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [] })
    expect(r.texto.endsWith(AVISO)).toBe(true)
  })

  it('a volta só de chamada (sem texto) que termina incompleta não ganha aviso solto', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_item.done', item: CHAMADA },
      { type: 'response.incomplete', response: { output: [CHAMADA], usage: { input_tokens: 10, output_tokens: 3 } } },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [] })
    expect(r.texto).toBe('')
  })

  it('a volta concluída com chamada não ganha aviso', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_text.delta', delta: 'Vou olhar a agenda.' },
      { type: 'response.completed', response: { output: [CHAMADA], usage: { input_tokens: 10, output_tokens: 3 } } },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [] })
    expect(r.texto).toBe('Vou olhar a agenda.')
  })
})

// ─── A27 ────────────────────────────────────────────────────────────────────

describe('A27: sem caminho cru no texto, e a frase do cartão só com cartão', () => {
  it('o caminho solto (com id, inteiro ou cortado) sai do texto; o link com nome fica', async () => {
    const { blocosDoTexto } = await import('@/lib/copilot/texto')
    const b = blocosDoTexto('Bruna, 20/11 às 10:00 (/lavanda-ponta-verde/agenda/b4815201-cf2a-4f6b-9d1e-1a2b3c4d5e6f). Ivone: /admin/agenda/c1d2e3f4-aa… e [Abrir](/admin/agenda/1).')
    expect(b).toEqual([{ tipo: 'paragrafo', trechos: [
      { tipo: 'texto', texto: 'Bruna, 20/11 às 10:00. Ivone: e ' },
      { tipo: 'link', texto: 'Abrir', href: '/admin/agenda/1' },
      { tipo: 'texto', texto: '.' },
    ] }])
  })

  it('o prompt proíbe caminho solto e diz quando vale a frase do cartão', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Lavanda', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/nunca escreva um caminho/i)
    expect(texto).toMatch(/aguardando_confirmacao/)
    expect(texto).toMatch(/não pergunte se ela quer (outro|gerar outro)/i)
  })

  it('o erro do preparo diz ao modelo que nenhum cartão apareceu', () => {
    expect(fonte('lib/copilot/executor.ts')).toMatch(/Nenhum cartão apareceu/)
  })
})

// ─── A28 ────────────────────────────────────────────────────────────────────

const PAULO = { id: 'u-paulo', name: 'Dr. Paulo', branch_id: null, is_active: true, provides_services: true, tenant_id: 't1' }
const TANIA = { id: 'u-tania', name: 'Tânia', branch_id: 'b-paj', is_active: true, provides_services: true, tenant_id: 't1' }
const TABELAS_DA_TROCA = {
  appointments: [{ id: 'ag-1', client_id: 'c-bruna', procedure_id: 'p-mas', branch_id: 'b-pv' }],
  users: [PAULO, TANIA],
  clients: [{ id: 'c-bruna', name: 'Bruna', auth_id: null, tenant_id: 't1' }],
  procedures: [{ id: 'p-mas', name: 'Massagem' }],
  branches: UNIDADES,
}

describe('A28: trocar só quem atende não é "Remarcar"', () => {
  it('a mesma data e hora, outra pessoa: "Trocar quem atende", de quem para quem, e a unidade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T15:00:00.000Z'))
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const { c } = adminFalso(TABELAS_DA_TROCA)
    // 13:00 UTC = 10:00 em Maceió: o mesmo horário.
    const r = await remarcar.preparar(c, { agendamento: 'ag-1', data: '2026-11-20', hora: '10:00', profissional: 'Tânia' })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.resumo.titulo).toBe('Trocar quem atende')
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Quem atende', valor: 'Dr. Paulo → Tânia' })
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Unidade', valor: 'Lavanda Ponta Verde' })
    expect(r.resumo.linhas.some(l => l.rotulo === 'De' || l.rotulo === 'Para')).toBe(false)
  })

  it('outro horário E outra pessoa: "Remarcar atendimento", com o "Quem atende" de → para', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T15:00:00.000Z'))
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const { c } = adminFalso(TABELAS_DA_TROCA)
    const r = await remarcar.preparar(c, { agendamento: 'ag-1', data: '2026-11-21', hora: '11:00', profissional: 'Tânia' })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.resumo.titulo).toBe('Remarcar atendimento')
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Quem atende', valor: 'Dr. Paulo → Tânia' })
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Unidade', valor: 'Lavanda Ponta Verde' })
  })

  it('a mensagem da troca diz quem atende agora, não "Remarcado"', () => {
    const f = fonte('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(f).toMatch(/Agora quem atende é/)
  })
})

// ─── A29 ────────────────────────────────────────────────────────────────────

describe('A29: o cartão da despesa paga diz a data do pagamento', () => {
  it('"Pago em" com o dia de hoje, e o dia vai ao núcleo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T16:31:00.000Z'))
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const { c } = adminFalso({ branches: UNIDADES })
    const r = await lancar.preparar(c, { tipo: 'despesa', descricao: 'Café', valor: 45, categoria: 'Material de consumo', pago: true, forma: 'pix', unidade: 'Ponta Verde' })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Pago em', valor: '17/11/2026' })
    expect((r.payload as { pagoEm?: string }).pagoEm).toBe('2026-11-17')
  })
})

// ─── A30 ────────────────────────────────────────────────────────────────────

describe('A30: "receba o atendimento" diz que o recebimento é no PDV, sem perguntar o caminho', () => {
  it('o prompt', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Lavanda', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/receba a massagem/i)
    expect(texto).toMatch(/não pergunte o caminho/i)
  })
})

// ─── A31 ────────────────────────────────────────────────────────────────────

describe('A31: os agendamentos de quem foi desativado se listam, com o aviso', () => {
  const PAULO_FORA = { ...PAULO, is_active: false, provides_services: false }
  const AGS = [
    { id: 'a1', scheduled_at: '2026-11-20T13:00:00Z', duration_min: 60, status: 'SCHEDULED', branch_id: 'b-pv', client_id: 'c-ivone', procedure_id: 'p-mas', professional_id: 'u-paulo' },
  ]

  it('pelo nome: lista os dele e diz que o acesso está desativado, com o caminho', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T17:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({
      users: [PAULO_FORA, TANIA], appointments: AGS, clients: [{ id: 'c-ivone', name: 'Ivone' }], procedures: [{ id: 'p-mas', name: 'Massagem' }], branches: UNIDADES,
    })
    const r = await agendamentos.executar(c, { profissional: 'Dr. Paulo', de: '2026-11-17', ate: '2026-12-17' })
    const dados = r.dados as { erro?: string; aviso?: string; agendamentos?: { profissional: string }[] }
    expect(dados.erro).toBeUndefined()
    expect(filtros).toContainEqual({ tabela: 'appointments', metodo: 'eq', args: ['professional_id', 'u-paulo'] })
    expect(dados.aviso).toMatch(/Dr\. Paulo está com o acesso desativado/)
    expect(dados.aviso).toMatch(/troque quem atende/i)
    expect(dados.agendamentos?.[0]?.profissional).toBe('Dr. Paulo (acesso desativado)')
  })

  it('sem filtro de quem atende: a linha de quem foi desativado também diz', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T17:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c } = adminFalso({
      users: [PAULO_FORA, TANIA], appointments: AGS, clients: [{ id: 'c-ivone', name: 'Ivone' }], procedures: [{ id: 'p-mas', name: 'Massagem' }], branches: UNIDADES,
    })
    const r = await agendamentos.executar(c, { de: '2026-11-17', ate: '2026-12-17' })
    const dados = r.dados as { aviso?: string; agendamentos?: { profissional: string }[] }
    expect(dados.agendamentos?.[0]?.profissional).toBe('Dr. Paulo (acesso desativado)')
    expect(dados.aviso).toMatch(/acesso desativado/)
  })
})
