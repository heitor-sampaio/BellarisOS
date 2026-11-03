import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa } from './apoio/uazapi-falsa'

/**
 * Remover um número de WhatsApp que tem conversas.
 *
 * F7c (2026-11-02): `conversations.whatsapp_number_id` é ON DELETE SET NULL, e
 * o índice único do ramo "sem número" recusava o remover quando a pessoa JÁ
 * tinha uma conversa sem número ("duplicate key" na tela). A F7c juntava as
 * duas conversas numa só.
 *
 * r2-cfg-06 (o Heitor, 03/11): NÃO junta mais — "não tem como juntar duas
 * conversas em uma só e manter alguma coerência, ela estava falando com
 * pessoas diferentes … mantém as duas conversas no inbox, porque o inbox é uma
 * visualização unificada de todos os inbox; se a pessoa quiser, existem os
 * filtros para isso". Removendo, o número SAI da clínica (das Configurações,
 * da escolha de saída, da credencial) mas a linha fica marcada como removida:
 * as conversas dele continuam como estão, cada uma com as mensagens e o card
 * dela, na lista e no filtro "Número" ("· número removido"); responder nela
 * diz por que não dá. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const sufixo = String(Date.now()).slice(-7)
const db = () => banco()
let rede: OutraRede | null = null
let config: MembroDeTeste | null = null
let etapa = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: config!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ins<T = { id: string }>(tabela: string, linha: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().from(tabela).insert(linha).select('id').single()
  expect(error, `inserir em ${tabela}`).toBeNull()
  return data as T
}

async function mensagem(conversa: string, texto: string, quando: Date, direcao: 'inbound' | 'outbound' = 'inbound') {
  await ins('messages', {
    tenant_id: rede!.tenantId, conversation_id: conversa, direction: direcao, content: texto,
    channel: 'whatsapp', created_at: quando.toISOString(), is_read: true,
  })
}

const conteudos = async (conversa: string) =>
  ((await db().from('messages').select('content').eq('conversation_id', conversa).order('created_at')).data ?? []).map(m => m.content)

test.beforeAll(async () => {
  rede = await criarOutraRede(`rn${marca}`)
  const funil = await ins('crm_funnels', { tenant_id: rede.tenantId, name: 'F', is_default: true, position: 0 })
  etapa = (await ins('crm_stages', { tenant_id: rede.tenantId, funnel_id: funil.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' })).id
  config = await criarMembro(`rncfg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Configura o WhatsApp',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const falhas: string[] = []
    const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
    const { data: leads } = await b.from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (leads ?? []).map(l => l.id as string)
    if (ids.length) {
      olhar('eventos dos leads', await b.from('lead_events').delete().in('lead_id', ids))
      olhar('leads', await b.from('leads').delete().in('id', ids))
    }
    olhar('mensagens', await b.from('messages').delete().eq('tenant_id', rede.tenantId))
    olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', rede.tenantId))
    olhar('conversas', await b.from('conversations').delete().eq('tenant_id', rede.tenantId))
    olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', rede.tenantId))
    olhar('caixas', await b.from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId))
    expect(falhas).toEqual([])
  }
  await config?.limpar()
  await rede?.limpar()
})

test('r2-cfg-06: remover o número NÃO junta — as duas conversas da pessoa ficam, cada uma com as mensagens e o card dela, e a do número removido abre, aparece no filtro e diz por que não responde', async ({ browser }) => {
  test.setTimeout(150_000)
  const rotulo = `${PREFIXO} Antigo ${marca}`
  const numero = await ins('whatsapp_numbers', {
    tenant_id: rede!.tenantId, provider: 'official', label: rotulo,
    is_active: false, is_default: false, phone_number_id: `7${sufixo}01`, waba_id: `6${sufixo}01`,
    config: { provider: 'official', phoneNumberId: `7${sufixo}01`, accessToken: 'x' },
  })
  const tel = `5548997${sufixo.slice(-6)}`
  const setembro = new Date('2026-09-10T15:00:00Z')
  const ontem = new Date(Date.now() - 86_400_000)

  // A conversa "sem número", de uma conexão antiga, com uma mensagem e um card.
  const antiga = await ins('conversations', {
    tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: tel, contact_external_id: tel,
    contact_name: `${PREFIXO} Cliente ${marca}`, contact_aliases: [tel],
    last_message: 'Oi, em setembro', last_message_at: setembro.toISOString(), last_inbound_at: setembro.toISOString(),
    created_at: setembro.toISOString(),
  })
  await mensagem(antiga.id, 'Oi, em setembro', setembro)
  const leadAntigo = await ins('leads', { tenant_id: rede!.tenantId, name: `${PREFIXO} Card antigo ${marca}`, phone: tel, crm_stage_id: etapa, conversation_id: antiga.id })

  // A do número que vai sair: a mesma pessoa, com mensagens de ontem e outro card.
  const doNumero = await ins('conversations', {
    tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: tel, contact_external_id: tel,
    contact_name: `${PREFIXO} Cliente ${marca}`, contact_aliases: [tel], whatsapp_number_id: numero.id,
    last_message: 'Quero remarcar', last_message_at: ontem.toISOString(), last_inbound_at: ontem.toISOString(),
  })
  await mensagem(doNumero.id, 'Bom dia', new Date(ontem.getTime() - 60_000))
  await mensagem(doNumero.id, 'Quero remarcar', ontem)
  const leadNovo = await ins('leads', { tenant_id: rede!.tenantId, name: `${PREFIXO} Card novo ${marca}`, phone: tel, crm_stage_id: etapa, conversation_id: doNumero.id })

  const r = await como(browser, p =>
    chamarAcao(p, 'actions/integrations.ts', 'removerNumeroWhatsApp', '/admin/settings', [numero.id]))
  expect(r.texto, 'o remover não mostra erro técnico').not.toMatch(/duplicate key|unique constraint/i)
  expect(r.texto).toContain('"ok":true')

  // Nada se move, nada se junta: as duas conversas, cada uma com as dela.
  const { data: daPessoa } = await db().from('conversations')
    .select('id, whatsapp_number_id').eq('tenant_id', rede!.tenantId).eq('contact_external_id', tel).order('created_at')
  expect(daPessoa, 'as duas continuam').toEqual([
    { id: antiga.id, whatsapp_number_id: null },
    { id: doNumero.id, whatsapp_number_id: numero.id },
  ])
  expect(await conteudos(antiga.id)).toEqual(['Oi, em setembro'])
  expect(await conteudos(doNumero.id)).toEqual(['Bom dia', 'Quero remarcar'])
  const { data: cards } = await db().from('leads').select('id, conversation_id').in('id', [leadAntigo.id, leadNovo.id]).order('name')
  expect((cards ?? []).map(c => c.conversation_id).sort(), 'cada card na sua').toEqual([antiga.id, doNumero.id].sort())

  // O número saiu da clínica: marcado como removido, sem a credencial, fora do ar.
  const { data: caixa } = await db().from('whatsapp_numbers').select('removido_em, is_active, is_default, phone_number_id, config').eq('id', numero.id).single()
  expect(caixa!.removido_em, 'marcado como removido').not.toBeNull()
  expect([caixa!.is_active, caixa!.is_default, caixa!.phone_number_id, caixa!.config]).toEqual([false, false, null, {}])

  await como(browser, async p => {
    // Fora das Configurações.
    const lista = await chamarAcao(p, 'actions/integrations.ts', 'listarNumerosWhatsApp', '/admin/settings', [])
    expect(lista.texto, 'o removido não aparece nas Configurações').not.toContain(rotulo)

    // A conversa do número removido abre, com as mensagens e o aviso.
    await p.goto(`/admin/inbox?c=${doNumero.id}`)
    await expect(p.getByText('Quero remarcar').first()).toBeVisible()
    const aviso = p.locator('[data-numero-removido]')
    await expect(aviso).toContainText(`O número desta conversa (${rotulo}) foi removido`)
    // E as duas estão na lista: a do número removido diz isso.
    await expect(p.getByText(`${rotulo} · número removido`).first()).toBeVisible()

    // O filtro "Número" a oferece; escolhido, só ela fica.
    await p.getByTitle('Filtrar conversas').click()
    await p.locator('.painel-de-filtros').getByRole('group', { name: 'Número de WhatsApp' })
      .getByRole('button', { name: `${rotulo} · número removido` }).click()
    await expect(p.getByText('Oi, em setembro')).toHaveCount(0)

    // Responder diz por que não dá.
    const envio = await chamarAcao(p, 'actions/inbox.ts', 'sendMessage', `/admin/inbox?c=${doNumero.id}`, [doNumero.id, 'Oi!'])
    expect(envio.texto).toContain('foi removido')
  })
  expect(await conteudos(doNumero.id), 'nada gravado na conversa').toEqual(['Bom dia', 'Quero remarcar'])
})

test('r3-f14-11: o filtro "Número" escolhe VÁRIOS números — Recepção + Comercial + o removido —, e fica de fora só o que não foi marcado', async ({ browser }) => {
  test.setTimeout(150_000)
  const agora = Date.now()
  const caixa = async (r: string, removido = false) => ins('whatsapp_numbers', {
    tenant_id: rede!.tenantId, provider: 'uazapi', label: `${PREFIXO} ${r} ${marca}`, is_default: false,
    is_active: !removido, config: removido ? {} : { token: `tok-${r}-${marca}`, baseUrl: 'https://e2e.invalido' },
    ...(removido ? { removido_em: new Date().toISOString() } : {}),
  })
  const recepcao = await caixa('Recepção')
  const comercial = await caixa('Comercial')
  const marketing = await caixa('Marketing')
  const antigo = await caixa('Velho', true)
  const conversa = async (numero: string, texto: string, i: number) => {
    const tel = `5548993${sufixo.slice(-5)}${i}`
    const quando = new Date(agora - i * 60_000).toISOString()
    const id = (await ins('conversations', {
      tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: tel, contact_external_id: tel, contact_aliases: [tel],
      contact_name: `${PREFIXO} Pessoa ${i} ${marca}`, whatsapp_number_id: numero,
      last_message: texto, last_message_at: quando, last_inbound_at: quando,
    })).id
    await mensagem(id, texto, new Date(quando))
  }
  await conversa(recepcao.id, `Na recepção ${marca}`, 1)
  await conversa(comercial.id, `No comercial ${marca}`, 2)
  await conversa(marketing.id, `No marketing ${marca}`, 3)
  await conversa(antigo.id, `No velho ${marca}`, 4)

  await como(browser, async p => {
    await p.goto('/admin/inbox')
    await expect(p.getByText(`No marketing ${marca}`)).toBeVisible()
    await p.getByTitle('Filtrar conversas').click()
    const numeros = p.locator('.painel-de-filtros').getByRole('group', { name: 'Número de WhatsApp' })
    await numeros.getByRole('button', { name: `${PREFIXO} Recepção ${marca}`, exact: true }).click()
    await numeros.getByRole('button', { name: `${PREFIXO} Comercial ${marca}`, exact: true }).click()
    await numeros.getByRole('button', { name: `${PREFIXO} Velho ${marca} · número removido` }).click()
    await expect(numeros.getByRole('button', { pressed: true }), 'os três marcados juntos').toHaveCount(3)
    await expect(p.getByText(`Na recepção ${marca}`)).toBeVisible()
    await expect(p.getByText(`No comercial ${marca}`)).toBeVisible()
    await expect(p.getByText(`No velho ${marca}`)).toBeVisible()
    await expect(p.getByText(`No marketing ${marca}`), 'o que não foi marcado sai').toHaveCount(0)
    // Desmarcar um tira só ele.
    await numeros.getByRole('button', { name: `${PREFIXO} Comercial ${marca}`, exact: true }).click()
    await expect(p.getByText(`No comercial ${marca}`)).toHaveCount(0)
    await expect(p.getByText(`Na recepção ${marca}`)).toBeVisible()
  })
})

test('r2-cfg-06: remover a conexão gerenciada (WhatsApp Web) também não junta, e a instância sai', async ({ browser }) => {
  const uazapi = await subirUazapiFalsa()
  try {
    const numero = await ins('whatsapp_numbers', {
      tenant_id: rede!.tenantId, provider: 'uazapi', label: `${PREFIXO} Web ${marca}`, managed: true,
      is_active: false, is_default: false,
      config: { provider: 'uazapi', token: `tok-${marca}`, baseUrl: uazapi.url, managed: true, instanceId: `inst-${marca}` },
    })
    const tel = `5548995${sufixo.slice(-6)}`
    const antiga = await ins('conversations', {
      tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: tel, contact_external_id: tel,
      contact_name: `${PREFIXO} Web ${marca}`, contact_aliases: [tel],
    })
    await mensagem(antiga.id, 'Antes', new Date(Date.now() - 5 * 86_400_000))
    const doNumero = await ins('conversations', {
      tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: tel, contact_external_id: tel,
      contact_name: `${PREFIXO} Web ${marca}`, contact_aliases: [tel], whatsapp_number_id: numero.id,
    })
    await mensagem(doNumero.id, 'Depois', new Date())

    const r = await como(browser, p =>
      chamarAcao(p, 'actions/uazapi-connection.ts', 'removerConexaoUazapi', '/admin/settings', [numero.id]))
    expect(r.texto).not.toMatch(/duplicate key|unique constraint/i)
    expect(r.texto).toContain('"ok":true')
    expect(uazapi.para('/instance').length, 'a instância foi apagada na uazapi').toBeGreaterThan(0)

    const { data: caixa } = await db().from('whatsapp_numbers').select('removido_em, config').eq('id', numero.id).single()
    expect(caixa!.removido_em).not.toBeNull()
    expect(caixa!.config, 'o token da instância não fica').toEqual({})
    expect(await conteudos(antiga.id)).toEqual(['Antes'])
    expect(await conteudos(doNumero.id)).toEqual(['Depois'])
  } finally {
    await uazapi.fechar()
  }
})

test('o remover recusa o número de outra rede (o id é conferido no banco)', async ({ browser }) => {
  const outra = await criarOutraRede(`rn2${marca}`)
  try {
    const alheio = await ins('whatsapp_numbers', {
      tenant_id: outra.tenantId, provider: 'official', label: `${PREFIXO} Alheio ${marca}`,
      is_active: false, is_default: false, phone_number_id: `7${sufixo}02`,
      config: { provider: 'official', phoneNumberId: `7${sufixo}02`, accessToken: 'x' },
    })
    const r = await como(browser, p =>
      chamarAcao(p, 'actions/integrations.ts', 'removerNumeroWhatsApp', '/admin/settings', [alheio.id]))
    expect(r.texto).toContain('não encontrada nesta rede')
    const { data } = await db().from('whatsapp_numbers').select('id, removido_em').eq('id', alheio.id).maybeSingle()
    expect(data, 'o número da outra rede fica, e não é marcado').toEqual({ id: alheio.id, removido_em: null })
  } finally {
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
})
