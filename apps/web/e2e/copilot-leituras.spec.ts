import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { apagarAgendamentos } from './apoio/limpeza'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * As LEITURAS do Copilot (fase 3, 2026-10-08): o que cada ferramenta lê do
 * banco de verdade, e as travas — a mesma régua da tela:
 *  - o cargo sem o módulo nem RECEBE a ferramenta, e a chamada forçada é recusada;
 *  - o escopo "só os meus" da agenda só traz os próprios;
 *  - quem tem unidade fixa não lê a outra unidade;
 *  - a ficha não leva o CPF inteiro nem as observações livres.
 *
 * O "modelo" é a OpenAI falsa: o teste manda chamar a ferramenta e confere o
 * que ela devolveu ao modelo (`saidasDeFerramenta`).
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let clienteId: string
let segundaUnidade: string
const agendamentos: string[] = []
const lancamentos: string[] = []

const AMANHA = (() => {
  const d = new Date(Date.now() + 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
})()
const PROFISSIONAL = `${PREFIXO} Prof copl${marca}`

/** Pergunta ao Copilot pela tela, com o "modelo" mandando chamar uma ferramenta. Devolve o que ela leu. */
async function chamar(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Pronto.' })
  await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  // A ÚLTIMA com esse nome: na mesma conversa, as anteriores voltam no histórico.
  const saida = falsa.saidasDeFerramenta().filter(s => s.nome === nome).at(-1)
  return { saida: saida?.saida as Record<string, unknown> | undefined, oferecidas: falsa.ferramentasOferecidas(0) }
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`lei${marca}`)
  const db = banco()
  // O profissional da rede atende, na unidade dela.
  expect((await db.from('users').update({ provides_services: true, branch_id: rede.outra.branchId, name: PROFISSIONAL })
    .eq('id', rede.outra.professionalId)).error).toBeNull()
  clienteId = await rede.outra.criarCliente('Leitura Maria')
  expect((await db.from('clients').update({ document: '12345678901', notes: 'NOTA-CLINICA-SECRETA alergia', birth_date: `1990-${AMANHA.slice(5, 7)}-15T00:00:00Z` })
    .eq('id', clienteId)).error).toBeNull()
  for (const hora of ['10:00', '14:00']) {
    const { data, error } = await db.from('appointments').insert({
      branch_id: rede.outra.branchId, client_id: clienteId, procedure_id: rede.outra.procedureId,
      professional_id: rede.outra.professionalId, scheduled_at: new Date(`${AMANHA}T${hora}:00-03:00`).toISOString(),
      duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error, 'criar o agendamento').toBeNull()
    agendamentos.push(data!.id)
  }
  const { data: tr, error: eTr } = await db.from('financial_transactions').insert({
    branch_id: rede.outra.branchId, type: 'INCOME', category: 'Serviço', description: `${PREFIXO} Receber copl${marca}`,
    amount: 150, created_by: 'e2e', due_date: new Date(Date.now() + 5 * 86_400_000).toISOString(), is_paid: false, client_id: clienteId,
  }).select('id').single<{ id: string }>()
  expect(eTr, 'criar o lançamento').toBeNull()
  lancamentos.push(tr!.id)
  const produto = await rede.outra.criarProduto('Luva copl', 1)
  expect((await db.from('branch_product_stock').update({ min_stock: 5 }).eq('product_id', produto)).error).toBeNull()
  const { data: b, error: eB } = await db.from('branches').insert({ tenant_id: rede.outra.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  segundaUnidade = b!.id
})

test.afterAll(async () => {
  const db = banco()
  const falhas = await apagarAgendamentos(agendamentos)
  if (lancamentos.length) await db.from('financial_transactions').delete().in('id', lancamentos)
  await rede?.limpar(async () => { if (segundaUnidade) await db.from('branches').delete().eq('id', segundaUnidade) })
  await falsa?.fechar()
  expect(falhas).toEqual([])
})

test('o dono lê a agenda, os horários livres, a ficha, o financeiro e o estoque — do banco', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')

    const ag = await chamar(p, 'agendamentos', { de: AMANHA })
    const lista = ag.saida!.agendamentos as { id: string; cliente: string; profissional: string }[]
    expect(lista.map(a => a.id).sort()).toEqual([...agendamentos].sort())
    expect(lista[0]!.cliente).toContain('Leitura Maria')
    expect(lista[0]!.profissional).toBe(PROFISSIONAL)

    const livres = await chamar(p, 'horarios_livres', { data: AMANHA, profissional: `Prof copl${marca}` })
    const horas = livres.saida!.livres as string[]
    expect(horas).toContain('09:00')
    expect(horas).not.toContain('10:00')
    expect(horas).not.toContain('14:00')

    const ficha = await chamar(p, 'cliente', { cliente: clienteId })
    expect(ficha.saida!.nome).toContain('Leitura Maria')
    expect(ficha.saida!.cpf).toBe('***.456.789-**')
    const texto = JSON.stringify(ficha.saida)
    expect(texto).not.toContain('12345678901')
    expect(texto).not.toContain('NOTA-CLINICA-SECRETA')
    expect((ficha.saida!.proximosAtendimentos as unknown[]).length).toBe(2)

    const aniversario = await chamar(p, 'clientes', { filtro: 'aniversariantes', mes: Number(AMANHA.slice(5, 7)) })
    expect(JSON.stringify(aniversario.saida)).toContain(clienteId)

    const fin = await chamar(p, 'lancamentos', { situacao: 'em_aberto' })
    expect(JSON.stringify(fin.saida)).toContain(`Receber copl${marca}`)

    const est = await chamar(p, 'estoque', { filtro: 'abaixo_do_minimo' })
    expect(JSON.stringify(est.saida)).toContain('Luva copl')
  })
})

test('cargo só com clientes: nem recebe agenda, financeiro e estoque — e a chamada forçada é recusada', async ({ browser }) => {
  const m = await rede.membro('cli', [{ modulo: 'clients', nivel: 'VIEW' }])
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/dashboard')
    const r = await chamar(p, 'agendamentos', { de: AMANHA })
    expect(r.oferecidas).toContain('cliente')
    for (const fora of ['agendamentos', 'horarios_livres', 'lancamentos', 'estoque', 'indicadores']) expect(r.oferecidas).not.toContain(fora)
    expect(String(r.saida?.erro)).toContain('não está liberada')
    expect(JSON.stringify(r.saida)).not.toContain(agendamentos[0]!)
  })
})

test('agenda "só os meus": só a própria agenda, nem pedindo a de outro', async ({ browser }) => {
  const m = await rede.membro('own', [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }])
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/dashboard')
    const minhas = await chamar(p, 'agendamentos', { de: AMANHA })
    expect(minhas.saida!.agendamentos).toEqual([])
    const doOutro = await chamar(p, 'agendamentos', { de: AMANHA, profissional: `Prof copl${marca}` })
    expect(String(doOutro.saida?.erro)).toContain('só vê a sua própria agenda')
  })
})

test('quem tem unidade fixa não lê a outra unidade, nem pedindo por ela', async ({ browser }) => {
  const m = await rede.membro('unb', [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW' }], { branchId: segundaUnidade })
  const { data: unidade } = await banco().from('branches').select('slug').eq('id', segundaUnidade).single<{ slug: string }>()
  await comSessao(browser, m.estado, async p => {
    await p.goto(`/${unidade!.slug}/dashboard`)
    const ag = await chamar(p, 'agendamentos', { de: AMANHA, unidade: rede.outra.branchId })
    expect(ag.saida!.agendamentos).toEqual([])
    const fin = await chamar(p, 'lancamentos', { situacao: 'todos' })
    expect(JSON.stringify(fin.saida)).not.toContain(`Receber copl${marca}`)
  })
})
