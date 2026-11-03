import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * r3-f14-04 (o Heitor, revisão de 2026-11-03): "Um botão 'Responder pelo
 * número X' com uma seleção dos números possíveis, na própria conversa, que
 * abre a conversa nova no número atual."
 *
 * A conversa do número REMOVIDO (r2-cfg-06) continua no inbox sem responder
 * por ela. No lugar do campo, a escolha dos números ATIVOS que a pessoa pode
 * usar e o botão "Responder pelo X": abre a conversa do mesmo contato nesse
 * número — a que já existe, se houver; senão, uma nova — e leva até ela,
 * pronta para escrever. As regras de envio de hoje continuam (a janela, o
 * suporte, o alcance). Nada sai para ninguém: os números falam com a uazapi
 * falsa. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const sufixo = String(Date.now()).slice(-7)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let uazapi: UazapiFalsa | null = null
let antigo = ''
let atual = ''
let marketing = ''
const rotulo = (r: string) => `${PREFIXO} ${r} ${marca}`

async function como<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ins(tabela: string, linha: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().from(tabela).insert(linha).select('id').single<{ id: string }>()
  expect(error, `inserir em ${tabela}`).toBeNull()
  return data!.id
}

/** A conversa da pessoa no número removido, com uma mensagem dela. */
async function conversaNoRemovido(tel: string, nome: string): Promise<string> {
  const ontem = new Date(Date.now() - 86_400_000).toISOString()
  const id = await ins('conversations', {
    tenant_id: rede!.tenantId, channel: 'whatsapp', status: 'open', contact_phone: tel, contact_external_id: tel,
    contact_name: nome, contact_aliases: [tel], whatsapp_number_id: antigo,
    last_message: 'Quero remarcar', last_message_at: ontem, last_inbound_at: ontem,
  })
  await ins('messages', {
    tenant_id: rede!.tenantId, conversation_id: id, direction: 'inbound', content: 'Quero remarcar',
    channel: 'whatsapp', created_at: ontem, is_read: true, whatsapp_number_id: antigo,
  })
  return id
}

const conversasDaPessoa = async (contato: string) =>
  ((await db().from('conversations').select('id, whatsapp_number_id, contato_id, contact_phone')
    .eq('tenant_id', rede!.tenantId).eq('contato_id', contato).order('created_at')).data ?? []) as
    { id: string; whatsapp_number_id: string | null; contato_id: string; contact_phone: string | null }[]

const contatoDa = async (conversa: string) =>
  ((await db().from('conversations').select('contato_id').eq('id', conversa).single()).data as { contato_id: string }).contato_id

test.beforeAll(async () => {
  uazapi = await subirUazapiFalsa()
  rede = await criarOutraRede(`ro${marca}`)
  antigo = await ins('whatsapp_numbers', {
    tenant_id: rede.tenantId, provider: 'uazapi', label: rotulo('Antigo'),
    is_active: false, is_default: false, config: {}, removido_em: new Date().toISOString(),
  })
  atual = await ins('whatsapp_numbers', {
    tenant_id: rede.tenantId, provider: 'uazapi', label: rotulo('Atual'), is_active: true, is_default: true,
    config: { token: `tok-atual-${marca}`, baseUrl: uazapi.url },
  })
  marketing = await ins('whatsapp_numbers', {
    tenant_id: rede.tenantId, provider: 'uazapi', label: rotulo('Marketing'), is_active: true, is_default: false,
    config: { token: `tok-mkt-${marca}`, baseUrl: uazapi.url },
  })
  recepcao = await criarMembro(`ro${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  soVe = await criarMembro(`rove${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o CRM', permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const falhas: string[] = []
    const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
    olhar('mensagens', await b.from('messages').delete().eq('tenant_id', rede.tenantId))
    olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', rede.tenantId))
    olhar('conversas', await b.from('conversations').delete().eq('tenant_id', rede.tenantId))
    olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', rede.tenantId))
    olhar('caixas', await b.from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId))
    expect(falhas).toEqual([])
  }
  await recepcao?.limpar()
  await soVe?.limpar()
  await rede?.limpar()
  await uazapi?.fechar()
})

test('r3-f14-04: na conversa do número removido, "Responder pelo X" abre a conversa nova da pessoa no número escolhido, pronta para escrever — e a mensagem sai por ele', async ({ browser }) => {
  test.setTimeout(150_000)
  const tel = `5548997${sufixo.slice(-6)}`
  const nome = rotulo('Carla')
  const velha = await conversaNoRemovido(tel, nome)
  const contato = await contatoDa(velha)

  await como(browser, recepcao!, async p => {
    await p.goto(`/admin/inbox?c=${velha}`)
    await expect(p.getByText('Quero remarcar').first()).toBeVisible()
    const aviso = p.locator('[data-numero-removido]')
    await expect(aviso).toContainText(`O número desta conversa (${rotulo('Antigo')}) foi removido`)

    // A escolha: só os números ATIVOS da clínica — o removido não está nela.
    const escolha = aviso.getByLabel('Responder por outro número')
    await expect(escolha.locator('option')).toHaveText([rotulo('Atual'), rotulo('Marketing')])
    await escolha.selectOption({ label: rotulo('Atual') })
    expect(await conversasDaPessoa(contato), 'escolher não cria nada').toHaveLength(1)
    await aviso.getByRole('button', { name: `Responder pelo ${rotulo('Atual')}` }).click()

    // Levou até a conversa nova, no número atual, com o campo livre e focado.
    await expect(p.locator('[data-numero-removido]')).toHaveCount(0)
    const campo = p.getByPlaceholder('Digite uma mensagem… (Enter para enviar)')
    await expect(campo).toBeEnabled()
    await expect(campo).toBeFocused()
    await campo.fill(`${PREFIXO} Oi, Carla ${marca}`)
    await campo.press('Enter')
    await expect.poll(() => uazapi!.para('/send/text').length, { message: 'saiu pela uazapi falsa' }).toBe(1)
  })

  const depois = await conversasDaPessoa(contato)
  expect(depois.map(c => c.whatsapp_number_id), 'a velha fica como está; a nova é do número atual, da MESMA pessoa').toEqual([antigo, atual])
  expect(depois[1]!.contact_phone).toBe(tel)
  const [saida] = uazapi!.para('/send/text')
  expect(saida!.token, 'saiu pelo número escolhido').toBe(`tok-atual-${marca}`)
  expect(saida!.corpo).toMatchObject({ number: tel, text: `${PREFIXO} Oi, Carla ${marca}` })
  const { data: msgs } = await db().from('messages').select('conversation_id, whatsapp_number_id, direction').eq('tenant_id', rede!.tenantId).eq('direction', 'outbound')
  expect(msgs, 'gravada na conversa nova, pelo número atual').toEqual([{ conversation_id: depois[1]!.id, whatsapp_number_id: atual, direction: 'outbound' }])
})

test('r3-f14-04: se a pessoa já tem conversa no número escolhido, abre a que existe — não cria outra', async ({ browser }) => {
  const tel = `5548996${sufixo.slice(-6)}`
  const velha = await conversaNoRemovido(tel, rotulo('Dora'))
  const contato = await contatoDa(velha)
  const agora = new Date().toISOString()
  const noMarketing = await ins('conversations', {
    tenant_id: rede!.tenantId, channel: 'whatsapp', status: 'open', contact_phone: tel, contact_external_id: tel,
    contact_name: rotulo('Dora'), contact_aliases: [tel], whatsapp_number_id: marketing,
    last_message: 'Vi o anúncio', last_message_at: agora, last_inbound_at: agora,
  })
  await ins('messages', {
    tenant_id: rede!.tenantId, conversation_id: noMarketing, direction: 'inbound', content: 'Vi o anúncio',
    channel: 'whatsapp', created_at: agora, is_read: true, whatsapp_number_id: marketing,
  })
  expect(await contatoDa(noMarketing), 'a mesma pessoa').toBe(contato)

  await como(browser, recepcao!, async p => {
    await p.goto(`/admin/inbox?c=${velha}`)
    const aviso = p.locator('[data-numero-removido]')
    await expect(p.getByText('Vi o anúncio'), 'só na lista, antes de abrir').toHaveCount(1)
    await aviso.getByLabel('Responder por outro número').selectOption({ label: rotulo('Marketing') })
    await aviso.getByRole('button', { name: `Responder pelo ${rotulo('Marketing')}` }).click()
    await expect(p.locator('[data-numero-removido]')).toHaveCount(0)
    await expect(p.getByText('Vi o anúncio'), 'a conversa que existia abriu: na lista e na conversa').toHaveCount(2)
  })
  expect((await conversasDaPessoa(contato)).map(c => c.id), 'nenhuma conversa nova').toEqual([velha, noMarketing])
})

test('r3-f14-04: o servidor recusa o número removido, o de outra rede, a conversa que não é de número removido e quem só vê o CRM — e nada se cria', async ({ browser }) => {
  const tel = `5548995${sufixo.slice(-6)}`
  const velha = await conversaNoRemovido(tel, rotulo('Eva'))
  const contato = await contatoDa(velha)
  const outra = await criarOutraRede(`ro2${marca}`)
  try {
    const alheio = await ins('whatsapp_numbers', {
      tenant_id: outra.tenantId, provider: 'uazapi', label: rotulo('Alheio'), is_active: true, is_default: false,
      config: { token: `tok-alheio-${marca}`, baseUrl: uazapi!.url },
    })
    const ativa = await ins('conversations', {
      tenant_id: rede!.tenantId, channel: 'whatsapp', status: 'open', contact_phone: `5548994${sufixo.slice(-6)}`,
      contact_external_id: `5548994${sufixo.slice(-6)}`, contact_name: rotulo('Fábia'), whatsapp_number_id: atual,
    })
    const pedir = (p: Page, conversa: string, numero: string) =>
      chamarAcao(p, 'actions/inbox.ts', 'responderPorOutroNumero', '/admin/inbox', [conversa, numero])

    await como(browser, recepcao!, async p => {
      await p.goto('/admin/inbox')
      expect((await pedir(p, velha, antigo)).texto, 'o próprio número removido').toContain('não está disponível')
      expect((await pedir(p, velha, alheio)).texto, 'o número de outra rede').toContain('não está disponível')
      expect((await pedir(p, ativa, marketing)).texto, 'a conversa do número que continua').toContain('continua na clínica')
      // O controle: o pedido certo abre.
      expect((await pedir(p, velha, marketing)).texto).toMatch(/"conversationId":"[0-9a-f-]{36}"/)
    })
    expect((await conversasDaPessoa(contato)).map(c => c.whatsapp_number_id), 'só a do pedido certo').toEqual([antigo, marketing])

    await como(browser, soVe!, async p => {
      await p.goto('/admin/inbox')
      const r = await pedir(p, velha, atual)
      expect(r.texto).not.toMatch(/"conversationId"/)
    })
    expect((await conversasDaPessoa(contato)).map(c => c.whatsapp_number_id), 'quem só vê não abre conversa').toEqual([antigo, marketing])
  } finally {
    await db().from('conversations').delete().eq('tenant_id', outra.tenantId)
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
})
