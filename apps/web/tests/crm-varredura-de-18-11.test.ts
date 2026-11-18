import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A varredura de conformidade de 18/11, área de clientes/CRM, inbox e
 * fidelidade (os itens CRM-02…CRM-10, FID-01 e o conflito C-1). Cada bloco
 * cita a regra que o código não cumpria.
 */

const RAIZ = join(__dirname, '..')
const MONO = join(RAIZ, '..', '..')
const fonte = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

/** O corpo de uma função exportada (até a próxima declaração do topo). */
function corpo(texto: string, nome: string): string {
  const i = texto.search(new RegExp(`(export )?async function ${nome}\\b`))
  expect(i, nome).toBeGreaterThanOrEqual(0)
  const resto = texto.slice(i + 10)
  const fim = resto.search(/\n(export |async function |function |const [A-Z_]+ =)/)
  return texto.slice(i, fim < 0 ? undefined : i + 10 + fim)
}

// --- O banco: pacote de fora e o plano pago (CRM-02, C-1) ------------------

const pasta = join(MONO, 'supabase', 'migrations')
const migrations = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
  .map(n => ({ nome: n, sql: readFileSync(join(pasta, n), 'utf8') }))

/** A ÚLTIMA definição da função nas migrations (a que vale). */
function ultimaDefinicao(funcao: string): string | null {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${funcao.replace('.', '\\.')}\\s*\\(`, 'i')
  let achada: string | null = null
  for (const m of migrations) {
    const i = m.sql.search(re)
    if (i < 0) continue
    const resto = m.sql.slice(i)
    const abre = /\$[a-z_]*\$/i.exec(resto)
    if (!abre) { achada = resto.slice(0, 4000); continue }
    const fecha = resto.indexOf(abre[0], abre.index + abre[0].length)
    achada = resto.slice(0, fecha < 0 ? 4000 : fecha + abre[0].length)
  }
  return achada
}

/** O nome da última migration que cria e da última que apaga o gatilho. */
function gatilho(nome: string) {
  const cria = migrations.filter(m => new RegExp(`create\\s+trigger\\s+${nome}\\b`, 'i').test(m.sql)).map(m => m.nome)
  const apaga = migrations.filter(m => new RegExp(`drop\\s+trigger\\s+(if\\s+exists\\s+)?${nome}\\b`, 'i').test(m.sql)).map(m => m.nome)
  return { cria: cria.at(-1) ?? null, apaga: apaga.at(-1) ?? null }
}

describe('o pacote trazido de fora não é compra (CRM-02; vendas-financeiro.md "Não é venda")', () => {
  it('o fato lead.cliente_comprou não nasce do pacote de fora', () => {
    const def = ultimaDefinicao('private.lead_cliente_comprou_pacote')
    expect(def).not.toBeNull()
    expect(def!).toMatch(/de_fora/)
  })
  it('o sinal "Comprou" do card não conta o pacote de fora', () => {
    for (const f of ['public.crm_sinais_do_quadro', 'public.crm_sinais_dos_clientes']) {
      const def = ultimaDefinicao(f)
      expect(def, f).not.toBeNull()
      expect(def!, f).toMatch(/not\s+cp\.de_fora/)
    }
  })
})

describe('o plano é venda no RECEBIMENTO, não no aceite (C-1; o Heitor, 18/11: "Uma coisa só foi vendida se foi paga.")', () => {
  it('o gatilho do aceite saiu, e o do pagamento do plano entrou', () => {
    const doAceite = gatilho('trg_lead_cliente_comprou_plano')
    expect(doAceite.apaga, 'há uma migration que apaga o gatilho do aceite').not.toBeNull()
    expect(doAceite.apaga! > doAceite.cria!, 'o drop vem depois do create').toBe(true)
    const doPagamento = gatilho('trg_lead_cliente_comprou_plano_pago')
    expect(doPagamento.cria).not.toBeNull()
    const m = migrations.find(x => x.nome === doPagamento.cria)!
    expect(m.sql).toMatch(/create\s+trigger\s+trg_lead_cliente_comprou_plano_pago[\s\S]*?on\s+public\.financial_transactions/i)
  })
  it('o primeiro recebimento do plano é o que conta, e o estorno não', () => {
    const def = ultimaDefinicao('private.lead_cliente_comprou_plano_pago')
    expect(def).not.toBeNull()
    expect(def!).toMatch(/plano_pagamento_que_vale\(new\)/)
    // Outro recebimento que vale do mesmo plano: este não é o primeiro.
    expect(def!).toMatch(/f\.treatment_plan_id = new\.treatment_plan_id[\s\S]*f\.id <> new\.id/)
    expect(def!).not.toMatch(/aceito_em/)
    const vale = ultimaDefinicao('private.plano_pagamento_que_vale')
    expect(vale).not.toBeNull()
    expect(vale!).toMatch(/treatment_plan_id is not null/)
    expect(vale!).toMatch(/is_paid/)
    expect(vale!).toMatch(/'Estorno'/)
    expect(vale!).toMatch(/'Estornada'/)
  })
  it('o sinal "Comprou" do card data o plano pelo primeiro recebimento', () => {
    for (const f of ['public.crm_sinais_do_quadro', 'public.crm_sinais_dos_clientes']) {
      const def = ultimaDefinicao(f)!
      expect(def, f).not.toMatch(/aceito_em/)
      expect(def, f).toMatch(/financial_transactions/)
    }
  })
})

// --- A aba Oportunidades da ficha (CRM-03) ---------------------------------

type Pedido = { tabela: string; ops: { op: string; args: unknown[] }[] }
const pedidos: Pedido[] = []
let respostaDosLeads: { data: unknown; error: unknown } = { data: [], error: null }
function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'or', 'in', 'order']) b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  b.then = (ok: (r: unknown) => unknown, ruim?: (e: unknown) => unknown) =>
    Promise.resolve(tabela === 'leads' ? respostaDosLeads : { data: [], error: null }).then(ok, ruim)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/auth', () => ({
  ownerFilter: (ctx: { scopes?: Record<string, string>; internalUserId: string }, m: string) => (ctx.scopes?.[m] === 'OWN' ? ctx.internalUserId : null),
  can: (ctx: { permissions: Record<string, string> }, m: string, n: string) =>
    n === 'VIEW' ? (ctx.permissions[m] ?? 'NONE') !== 'NONE' : ctx.permissions[m] === 'MANAGE',
  temRecurso: () => true,
}))

beforeEach(() => { pedidos.length = 0; respostaDosLeads = { data: [], error: null } })

const ctxDe = (crm: string, escopo: 'OWN' | 'ALL') =>
  ({ tenantId: 't1', internalUserId: 'u1', permissions: { crm, clients: 'VIEW' }, scopes: { crm: escopo } }) as never

describe('a aba Oportunidades da ficha segue o CRM (CRM-03; CLAUDE.md §11; o Heitor, 28/10: "Quem tem \'só os meus\' vê \'só os meus\', em qualquer lugar")', () => {
  it('o "só os meus" do CRM recorta as oportunidades da ficha', async () => {
    const { oportunidadesDoCliente } = await import('@/lib/crm/oportunidades-do-cliente')
    await oportunidadesDoCliente(ctxDe('VIEW', 'OWN'), 'c1')
    const leads = pedidos.find(p => p.tabela === 'leads')!
    expect(leads.ops).toContainEqual({ op: 'or', args: ['owner_id.is.null,owner_id.eq.u1'] })
  })
  it('o "todos" do CRM vê todas', async () => {
    const { oportunidadesDoCliente } = await import('@/lib/crm/oportunidades-do-cliente')
    await oportunidadesDoCliente(ctxDe('VIEW', 'ALL'), 'c1')
    expect(pedidos.find(p => p.tabela === 'leads')!.ops.some(o => o.op === 'or')).toBe(false)
  })
  it('sem o CRM, nenhuma oportunidade (nem consulta)', async () => {
    const { oportunidadesDoCliente } = await import('@/lib/crm/oportunidades-do-cliente')
    expect(await oportunidadesDoCliente(ctxDe('NONE', 'ALL'), 'c1')).toEqual([])
    expect(pedidos.find(p => p.tabela === 'leads')).toBeUndefined()
  })
  it('o erro da leitura não vira "Nenhuma oportunidade" (princípio 3)', async () => {
    respostaDosLeads = { data: null, error: { message: 'caiu' } }
    const { oportunidadesDoCliente } = await import('@/lib/crm/oportunidades-do-cliente')
    expect(await oportunidadesDoCliente(ctxDe('VIEW', 'ALL'), 'c1')).toBeNull()
    const ficha = fonte('components/branch/client-profile.tsx')
    expect(ficha).toMatch(/Não consegui ler as oportunidades desta cliente/)
  })
  it('as duas fichas passam o contexto (o escopo), e a aba some sem o CRM', () => {
    for (const p of ['app/admin/clients/[id]/page.tsx', 'app/[slug]/clients/[id]/page.tsx']) {
      const t = fonte(p)
      expect(t, p).toMatch(/oportunidadesDoCliente\(ctx, client\.id\)/)
      expect(t, p).toMatch(/veOportunidades=\{/)
    }
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/t\.key !== 'oportunidades' \|\| veOportunidades/)
  })
})

// --- O card no quadro da rede (CRM-04) -------------------------------------

describe('"Cadastrar cliente" no card também no quadro da rede (CRM-04; crm-inbox.md CR2; H5: a ficha é da rede)', () => {
  it('o quadro da rede não esconde o botão, e a página passa a permissão', () => {
    expect(fonte('components/branch/crm-board.tsx')).not.toMatch(/networkMode \|\| !podeCadastrarCliente/)
    expect(fonte('app/admin/oportunidades/page.tsx')).toMatch(/podeCadastrarCliente=\{can\(ctx, 'clients', 'MANAGE'\)\}/)
  })
})

// --- O lembrete de retorno atrasado (CRM-07) -------------------------------

describe('o aviso do retorno diz o que é (CRM-07; princípio 3)', () => {
  it('atrasado, sem a observação, não diz "Hoje é o dia combinado"', async () => {
    const { avisoDoRetorno } = await import('@/lib/crm/retorno')
    const atrasado = avisoDoRetorno({ nome: 'Ana', dia: '2026-11-10', obs: null }, '2026-11-18')
    expect(atrasado.title).toBe('Retorno atrasado: Ana (10/11)')
    expect(atrasado.body).toBe('O dia combinado para retomar o contato com Ana era 10/11.')
    const hoje = avisoDoRetorno({ nome: 'Ana', dia: '2026-11-18', obs: null }, '2026-11-18')
    expect(hoje).toEqual({ title: 'Retorno de hoje: Ana', body: 'Hoje é o dia combinado para retomar o contato com Ana.' })
    expect(avisoDoRetorno({ nome: 'Ana', dia: '2026-11-10', obs: 'mandar o orçamento' }, '2026-11-18').body).toBe('Combinado: mandar o orçamento')
    expect(fonte('app/api/cron/crm-lembretes/route.ts')).toMatch(/avisoDoRetorno\(/)
  })
})

// --- O modo suporte não manda nada ao paciente (CRM-08, CRM-09) ------------

describe('o modo suporte não libera nada ao app da cliente (CRM-08, CRM-09; CLAUDE.md §14)', () => {
  it('liberar o prontuário no pedido LGPD passa por bloqueioDoSuporte', () => {
    expect(corpo(fonte('actions/lgpd.ts'), 'reviewMedicalData')).toMatch(/bloqueioDoSuporte\(ctx,/)
  })
  it('o cadastro com acesso ao app (e o "Unificar" com acesso) passa por bloqueioDoSuporte antes do login', () => {
    const c = corpo(fonte('actions/clients.ts'), 'addClientInterno')
    const trava = c.search(/if \(comAcesso\)[^\n]*\n?[^\n]*bloqueioDoSuporte\(ctx, 'dar acesso ao app'\)|comAcesso \? bloqueioDoSuporte\(ctx, 'dar acesso ao app'\)/)
    expect(trava, 'a trava do suporte no acesso do cadastro').toBeGreaterThanOrEqual(0)
    expect(trava).toBeLessThan(c.indexOf('atualizarPeloCadastro('))
    expect(trava).toBeLessThan(c.indexOf('criarLoginDoCliente('))
  })
})

// --- Abrir a conversa pelo card (CRM-10) -----------------------------------

describe('o card abre só a conversa que o cargo vê no Inbox (CRM-10; crm-inbox.md, "Quais números o cargo vê")', () => {
  it('openLeadConversation filtra pelo alcance do dono e pelas caixas', () => {
    const c = corpo(fonte('actions/inbox.ts'), 'openLeadConversation')
    expect(c).toMatch(/passaNoAlcanceDoDono\(/)
    expect(c).toMatch(/passaNasCaixas\(/)
    // A conversa achada pelo telefone (o 23505) também.
    expect(c).toMatch(/conversaAoAlcance\(admin, ctx,/)
  })
})

// --- O voucher de outra unidade (FID-01) -----------------------------------

describe('o voucher não se recorta pela unidade (FID-01; fidelidade.md FD3)', () => {
  it('voucherAoAlcance confere a rede, não a unidade do voucher', () => {
    const c = corpo(fonte('actions/fidelidade.ts'), 'voucherAoAlcance')
    expect(c).not.toMatch(/alcancaUnidade/)
    // A entrega do produto continua conferindo a unidade do ESTOQUE.
    expect(corpo(fonte('actions/fidelidade.ts'), 'entregarVoucherProduto')).toMatch(/alcancaUnidade\(ctx, entrada\.branchId\)/)
  })
})

// --- A unidade na importação de clientes (pedido de 18/11) -----------------

describe('a importação de clientes só pergunta a unidade dos PACOTES de antes (H5/H16: a ficha é da rede; princípio 7)', () => {
  it('a tela não pergunta a unidade no passo 1; pergunta no das colunas, se há o pacote', () => {
    const t = fonte('components/branch/importador-de-contatos.tsx')
    expect(t).not.toMatch(/disabled=\{!arquivo \|\| \(destino === 'clientes' && !branchId\)/)
    expect(t).toMatch(/Unidade dos pacotes de antes/)
    expect(t).toMatch(/branchId: destino === 'clientes' && comPacote \? branchId : null/)
    expect(t).not.toMatch(/FICHA de cliente na unidade escolhida/)
  })
  it('o servidor só exige a unidade com a coluna do pacote', () => {
    const t = fonte('actions/importacao.ts')
    expect(t).toMatch(/Escolha a unidade dos pacotes de antes\./)
    expect(t).not.toMatch(/Escolha a unidade dos clientes\./)
    expect(t).toMatch(/mapeamento\.includes\('pacote'\)/)
  })
})
