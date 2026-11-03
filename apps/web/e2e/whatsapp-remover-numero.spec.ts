import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa } from './apoio/uazapi-falsa'

/**
 * Remover um número de WhatsApp que tem conversas (F7c, achado do Heitor em
 * 2026-11-02, Bellaris Clinic, contato …3707).
 *
 * `conversations.whatsapp_number_id` é ON DELETE SET NULL, e o índice único
 * `uniq_conversations_sem_numero_external` (rede, canal, contato) WHERE sem
 * número recusava o remover quando o contato JÁ tinha uma conversa "sem número"
 * (de uma conexão antiga): a tela mostrava "duplicate key value violates unique
 * constraint" e o número ficava. Agora o remover JUNTA, numa transação, a
 * conversa do número na que já existia — as mensagens e as oportunidades vão
 * para ela — e só então apaga o número. Numa rede [e2e] própria.
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

test('remover o número com conversas: a conversa que colide JUNTA na que já existia, com as mensagens e as oportunidades', async ({ browser }) => {
  const numero = await ins('whatsapp_numbers', {
    tenant_id: rede!.tenantId, provider: 'official', label: `${PREFIXO} Antigo ${marca}`,
    is_active: false, is_default: false, phone_number_id: `7${sufixo}01`, waba_id: `6${sufixo}01`,
    config: { provider: 'official', phoneNumberId: `7${sufixo}01`, accessToken: 'x' },
  })
  const tel = `5548997${sufixo.slice(-6)}`
  const outroTel = `5548996${sufixo.slice(-6)}`
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

  // E uma conversa do número que não colide com nada: só perde o número.
  const solta = await ins('conversations', {
    tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: outroTel, contact_external_id: outroTel,
    contact_name: `${PREFIXO} Outra ${marca}`, contact_aliases: [outroTel], whatsapp_number_id: numero.id,
  })
  await mensagem(solta.id, 'Tem horário?', ontem)

  const naoLidas = async (id: string) =>
    ((await db().from('conversations').select('unread_count').eq('id', id).single()).data?.unread_count as number) ?? 0
  const naoLidasAntes = (await naoLidas(antiga.id)) + (await naoLidas(doNumero.id))
  expect(naoLidasAntes).toBeGreaterThan(0)

  const r = await como(browser, p =>
    chamarAcao(p, 'actions/integrations.ts', 'removerNumeroWhatsApp', '/admin/settings', [numero.id]))
  expect(r.texto, 'o remover não mostra erro técnico').not.toMatch(/duplicate key|unique constraint/i)
  expect(r.texto).toContain('"ok":true')

  const { data: caixa } = await db().from('whatsapp_numbers').select('id').eq('id', numero.id).maybeSingle()
  expect(caixa, 'o número saiu').toBeNull()

  // Uma conversa só da pessoa: a que já existia, com as três mensagens.
  const { data: daPessoa } = await db().from('conversations')
    .select('id, whatsapp_number_id, last_message, unread_count')
    .eq('tenant_id', rede!.tenantId).eq('contact_external_id', tel)
  expect(daPessoa, 'as duas viraram uma').toHaveLength(1)
  expect(daPessoa![0]!.id, 'fica a que já existia').toBe(antiga.id)
  expect(daPessoa![0]!.whatsapp_number_id).toBeNull()
  expect(daPessoa![0]!.last_message, 'a última mensagem é a mais recente das duas').toBe('Quero remarcar')
  expect(daPessoa![0]!.unread_count, 'as não lidas vêm junto').toBe(naoLidasAntes)
  const { data: msgs } = await db().from('messages').select('content').eq('conversation_id', antiga.id).order('created_at')
  expect((msgs ?? []).map(m => m.content)).toEqual(['Oi, em setembro', 'Bom dia', 'Quero remarcar'])

  // As oportunidades apontam para a conversa que ficou.
  const { data: cards } = await db().from('leads').select('id, conversation_id').in('id', [leadAntigo.id, leadNovo.id])
  expect((cards ?? []).map(c => c.conversation_id)).toEqual([antiga.id, antiga.id])

  // A que não colidia continua, sem o número, com a mensagem dela.
  const { data: semColisao } = await db().from('conversations').select('id, whatsapp_number_id').eq('id', solta.id).maybeSingle()
  expect(semColisao?.whatsapp_number_id).toBeNull()
  const { count } = await db().from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', solta.id)
  expect(count).toBe(1)
})

test('remover a conexão gerenciada (WhatsApp Web) com conversa que colide também junta, e a instância sai', async ({ browser }) => {
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

    const { data: caixa } = await db().from('whatsapp_numbers').select('id').eq('id', numero.id).maybeSingle()
    expect(caixa).toBeNull()
    const { data: msgs } = await db().from('messages').select('content').eq('conversation_id', antiga.id).order('created_at')
    expect((msgs ?? []).map(m => m.content)).toEqual(['Antes', 'Depois'])
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
    const { data } = await db().from('whatsapp_numbers').select('id').eq('id', alheio.id).maybeSingle()
    expect(data, 'o número da outra rede fica').not.toBeNull()
  } finally {
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
})
