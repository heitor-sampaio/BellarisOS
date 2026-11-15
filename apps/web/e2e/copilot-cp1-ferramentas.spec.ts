import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * CP1 — o bloco Copilot do plano de adaptação (docs/revisao.md): as
 * ferramentas que o sistema adaptado deixou para trás.
 *
 * - `fazer_check_in`: o núcleo da agenda (`checkinCore`) aceita o agendado E o
 *   confirmado; a ferramenta recusava o confirmado ("Este agendamento está
 *   confirmado"), contra a própria descrição.
 * - Quem tem VÁRIAS unidades (EQ1a): a ferramenta ficava presa na unidade da
 *   página e ignorava a pedida — mesmo sendo uma das dela.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let unidadeB = ''
let unidadeC = ''
let nomeDaB = ''
let slugA = ''
let duasUnidades: MembroDeTeste
let cliente = ''

async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}

test.beforeAll(async () => {
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`cp1f${marca}`)
  slugA = (await db().from('branches').select('slug').eq('id', rede.outra.branchId).single<{ slug: string }>()).data!.slug
  nomeDaB = `${PREFIXO} Unidade B cp1f${marca}`
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.outra.tenantId, name: nomeDaB, slug: `e2e-un-b-cp1f${marca}` }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  unidadeB = data!.id
  // A C antes de tudo: a lista das unidades da rede fica em cache.
  const { data: c, error: eC } = await db().from('branches')
    .insert({ tenant_id: rede.outra.tenantId, name: `${PREFIXO} Unidade C cp1f${marca}`, slug: `e2e-un-c-cp1f${marca}` }).select('id').single<{ id: string }>()
  expect(eC, eC?.message).toBeNull()
  unidadeC = c!.id
  duasUnidades = await criarMembro(`cp1fu${marca}`, {
    tenant: rede.outra.tenantId, branchId: rede.outra.branchId, outrasUnidades: [unidadeB], rotulo: 'Duas unidades',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'copilot', nivel: 'MANAGE' }],
  })
  cliente = await rede.outra.criarCliente('Carla')
})

test.afterAll(async () => {
  await duasUnidades?.limpar()
  await rede?.limpar(async () => {
    await db().from('appointments').delete().eq('branch_id', rede.outra.branchId)
    await db().from('clients').delete().eq('tenant_id', rede.outra.tenantId).eq('branch_id', unidadeB)
    await db().from('branches').delete().in('id', [unidadeB, unidadeC])
  })
  await falsa?.fechar()
})

test('o check-in do agendamento CONFIRMADO: o cartão sai e o Confirmar registra a chegada', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.outra.branchId, client_id: cliente, professional_id: rede.outra.professionalId, procedure_id: rede.outra.procedureId,
    scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED',
    confirmed_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, 'fazer_check_in', { agendamento: ag!.id })
    expect(JSON.stringify(falsa.saidasDeFerramenta()), 'a ferramenta não recusa o confirmado').not.toContain('Este agendamento está')
    await expect(cartao).toContainText('Check-in')
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data: depois } = await db().from('appointments').select('status').eq('id', ag!.id).single<{ status: string }>()
  expect(depois!.status).toBe('ARRIVED')
})

test('quem tem duas unidades cadastra na OUTRA dela, pedida pelo nome', async ({ browser }) => {
  const nome = `${PREFIXO} Cliente na B cp1f${marca}`
  await comSessao(browser, duasUnidades.estado, async p => {
    await p.goto(`/${slugA}/clients`)
    const cartao = await pedir(p, 'cadastrar_cliente', { nome, telefone: '48 99977-' + String(Date.now()).slice(-4), unidade: nomeDaB })
    await expect(cartao).toContainText(nomeDaB)
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data } = await db().from('clients').select('branch_id').eq('tenant_id', rede.outra.tenantId).eq('name', nome).single<{ branch_id: string }>()
  expect(data!.branch_id).toBe(unidadeB)
})

test('a unidade fora das dela continua recusada', async ({ browser }) => {
  await comSessao(browser, duasUnidades.estado, async p => {
    await p.goto(`/${slugA}/clients`)
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'cadastrar_cliente', args: { nome: `${PREFIXO} Na C ${marca}`, telefone: '48 99966-0000', unidade: `Unidade C cp1f${marca}` } }] }, { texto: 'Não deu.' })
    await falarComOCopilot(p, 'teste unidade C')
    await esperarResposta(p)
    expect(JSON.stringify(falsa.saidasDeFerramenta())).toContain('fora do seu alcance')
  })
})
