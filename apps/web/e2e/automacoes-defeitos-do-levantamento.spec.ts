import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * F69 — as automações do levantamento das regras (07, 11/11/2026):
 *
 * - C53: a busca "sem visita há N dias" (o modelo Reativação) incluía quem
 *   acabou de se cadastrar: "Sentimos sua falta" a quem chegou anteontem.
 * - C54 (D16): esvaziar o silêncio ou o teto não desligava — o vazio voltava
 *   a 21:00/08:00/3 no motor e na tela reaberta. O vazio desliga, e a tela diz.
 * - C55: "a conversa de WhatsApp da cliente" é UMA régua (pela ficha, senão
 *   pelo telefone), sem as conversas de número removido.
 * - C65 (H1, a valendo já): antes de ligar uma automação que manda WhatsApp, a
 *   tela diz quantas a busca acharia e quantas têm conversa aberta.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let antiga = ''
let comConversa = ''
let peloTelefone = ''
let conversaBoa = ''
let conversaPeloTelefone = ''
let automacao = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`aut69${marca}`)
  const cemDiasAtras = new Date(Date.now() - 100 * 86_400_000).toISOString()
  antiga = await rede.criarCliente('Antiga')
  await rede.criarCliente('Nova') // chegou hoje
  comConversa = await rede.criarCliente('Com conversa')
  peloTelefone = await rede.criarCliente('Pelo telefone')
  for (const c of [antiga, comConversa, peloTelefone]) {
    expect((await db().from('clients').update({ created_at: cemDiasAtras }).eq('id', c)).error).toBeNull()
  }

  // Dois números: um removido da clínica, um no ar.
  const { data: nums, error: eN } = await db().from('whatsapp_numbers').insert([
    { tenant_id: rede.tenantId, provider: 'uazapi', label: `${PREFIXO} removido ${marca}`, is_active: false, removido_em: new Date().toISOString(), config: {} },
    { tenant_id: rede.tenantId, provider: 'uazapi', label: `${PREFIXO} no ar ${marca}`, is_active: true, config: {} },
  ]).select('id, label')
  expect(eN, eN?.message).toBeNull()
  const removido = nums!.find(n => (n.label as string).includes('removido'))!.id as string
  const noAr = nums!.find(n => (n.label as string).includes('no ar'))!.id as string

  const agora = Date.now()
  const { data: convs, error: eC } = await db().from('conversations').insert([
    // A mais recente é a do número removido: por ela nada sai.
    { tenant_id: rede.tenantId, client_id: comConversa, channel: 'whatsapp', status: 'open', whatsapp_number_id: removido,
      contact_phone: '5548900000001', last_inbound_at: new Date(agora).toISOString(), last_message_at: new Date(agora).toISOString() },
    { tenant_id: rede.tenantId, client_id: comConversa, channel: 'whatsapp', status: 'open', whatsapp_number_id: noAr,
      contact_phone: '5548900000002', last_inbound_at: new Date(agora - 3_600_000).toISOString(), last_message_at: new Date(agora - 3_600_000).toISOString() },
  ]).select('id, whatsapp_number_id')
  expect(eC, eC?.message).toBeNull()
  conversaBoa = convs!.find(c => c.whatsapp_number_id === noAr)!.id as string

  // A cliente sem a conversa ligada à ficha: acha-se pelo telefone do cadastro.
  const { data: tel } = await db().from('clients').select('phone').eq('id', peloTelefone).single<{ phone: string }>()
  const { data: cTel, error: eT } = await db().from('conversations').insert({
    tenant_id: rede.tenantId, channel: 'whatsapp', status: 'open', whatsapp_number_id: noAr,
    contact_phone: tel!.phone.replace(/\D/g, ''), last_inbound_at: new Date(agora).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eT, eT?.message).toBeNull()
  conversaPeloTelefone = cTel!.id

  const { data: auto, error: eA } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Reativação ${marca}`, status: 'RASCUNHO', gatilhos: [],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.agenda', nome: 'Todo dia', pos: { x: 80, y: 120 }, config: { frequencia: 'diaria', hora: '09:00' } },
        { id: 'b1', tipo: 'buscar.clientes', nome: 'Todas', pos: { x: 360, y: 120 }, config: { limite: 200 } },
        { id: 'm1', tipo: 'acao.mensagem', nome: 'Convite', pos: { x: 640, y: 120 }, config: { canal: 'whatsapp', texto: 'Oi, {{cliente.nome}}!' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'b1' }, { id: 'l2', de: 'b1', para: 'm1' }],
    },
    limites: { silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: 3 },
  }).select('id').single<{ id: string }>()
  expect(eA, eA?.message).toBeNull()
  automacao = auto!.id

  dona = await criarMembro(`aut69d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await db().from('automation_versions').delete().eq('automation_id', automacao)
  await db().from('automations').delete().eq('tenant_id', rede.tenantId)
  await db().from('conversations').delete().eq('tenant_id', rede.tenantId)
  await db().from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId)
  await dona?.limpar(); await rede?.limpar()
})

test('C53: "sem visita há 60 dias" não acha quem acabou de se cadastrar', async ({ browser }) => {
  await como(browser, async p => {
    const rota = `/admin/automacoes/${automacao}`
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/automacoes.ts', 'contarBuscaDeClientes', rota, [{ semRetornoHaDias: 60, limite: 200 }])
    // Antiga, Com conversa e Pelo telefone são de 100 dias atrás; a Nova chegou hoje.
    expect(r.texto).toContain('"quantas":3')
  })
})

test('C55: a conversa da cliente pula a do número removido, e acha pelo telefone', async () => {
  const { data: a, error } = await db().rpc('conversa_de_whatsapp_da_cliente', { p_tenant: rede.tenantId, p_cliente: comConversa })
  expect(error, error?.message).toBeNull()
  expect(a, 'a do número no ar, não a mais recente do removido').toBe(conversaBoa)
  const { data: b } = await db().rpc('conversa_de_whatsapp_da_cliente', { p_tenant: rede.tenantId, p_cliente: peloTelefone })
  expect(b, 'sem a conversa ligada, pelo telefone do cadastro').toBe(conversaPeloTelefone)
  const { data: c } = await db().rpc('conversa_de_whatsapp_da_cliente', { p_tenant: rede.tenantId, p_cliente: antiga })
  expect(c).toBeNull()
  const { data: n } = await db().rpc('publico_com_conversa', { p_tenant: rede.tenantId, p_filtros: {} })
  expect(n, 'das quatro, duas têm conversa aberta').toBe(2)
})

test('C65: antes de ligar, a tela diz quantas a busca acharia e quantas têm conversa aberta', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/automacoes/${automacao}`)
    await p.getByRole('button', { name: 'Ligar' }).click()
    const janela = p.locator('[data-antes-de-ligar]')
    await expect(janela).toContainText('Hoje a busca acharia 4 clientes, e 2 têm conversa aberta no WhatsApp', { timeout: 20_000 })
    await expect(janela).toContainText('não abre conversa nova')
    // Desistir não liga.
    await janela.getByRole('button', { name: 'Agora não' }).click()
    await expect(p.locator('[data-antes-de-ligar]')).toHaveCount(0)
  })
  const { data } = await db().from('automations').select('status').eq('id', automacao).single<{ status: string }>()
  expect(data?.status).toBe('RASCUNHO')
})

test('C54: o silêncio e o teto vazios desligam, e a tela diz', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/automacoes/${automacao}`)
    await p.getByRole('button', { name: 'Limites' }).click()
    const painel = p.getByRole('complementary', { name: 'Limites da automação' })
    await painel.getByLabel('Começa às').fill('')
    await painel.getByLabel('Termina às').fill('')
    await expect(painel).toContainText('Sem silêncio: a mensagem sai a qualquer hora')
    await painel.getByLabel('No máximo, por cliente por dia').fill('')
    await expect(painel).toContainText('Sem teto')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(p.locator('[data-estado-do-salvo]')).toContainText('Salvo')

    await p.reload()
    await p.getByRole('button', { name: 'Limites' }).click()
    const reaberto = p.getByRole('complementary', { name: 'Limites da automação' })
    await expect(reaberto.getByLabel('Começa às')).toHaveValue('')
    await expect(reaberto).toContainText('Sem silêncio')
    await expect(reaberto).toContainText('Sem teto')
  })
  const { data } = await db().from('automations').select('limites').eq('id', automacao).single<{ limites: Record<string, unknown> }>()
  expect(data?.limites).toMatchObject({ silencioDe: null, silencioAte: null, tetoPorClienteDia: null })
})
