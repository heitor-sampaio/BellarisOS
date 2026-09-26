import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * A oportunidade é da PESSOA, não da thread onde nasceu.
 *
 * `leads.conversation_id` é singular. No handoff — o lead entra pelo número do
 * marketing e a unidade assume por outro — o card ficava preso na thread do
 * marketing, e quem abria a da unidade via "nenhuma oportunidade" para a pessoa
 * que estava atendendo. Agora a dona é `leads.contato_id`.
 *
 * E o cadastro manual em Oportunidades nunca gravou `conversation_id`: o lead
 * nascia sem pessoa nenhuma. O gatilho dá uma a ele, pelo telefone, no mesmo
 * formato que o webhook usa — então quando a pessoa escrever, cai nela.
 */

const marca = Date.now().toString(36)

type Linha = { id: string }

async function entregar(
  request: import('@playwright/test').APIRequestContext,
  token: string, telefone: string, texto: string, sufixo: string,
) {
  return request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: `${PREFIXO} Oport ${marca}`, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: texto,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2EOP_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

async function etapaAberta(tenant: string): Promise<string> {
  const { data, error } = await banco().from('crm_stages')
    .select('id').eq('tenant_id', tenant).eq('outcome', 'OPEN').limit(1)
  expect(error, 'ler uma etapa aberta').toBeNull()
  expect(data?.length, 'a rede de teste precisa de um funil com etapa aberta').toBeTruthy()
  return data![0]!.id as string
}

test('o card que nasceu no marketing aparece na thread da unidade', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 11).slice(-9)
  const etapa    = await etapaAberta(tenant)

  const caixas: string[] = []
  let convIds: string[] = []
  let leadId: string | null = null

  try {
    for (const rotulo of ['Mkt', 'Unid']) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} ${rotulo} ${marca}`,
          is_active: true, config: { token: `e2e-op-${rotulo}-${marca}`, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    expect((await entregar(request, `e2e-op-Mkt-${marca}`, telefone, 'vi o anuncio', 'mkt')).ok()).toBe(true)
    expect((await entregar(request, `e2e-op-Unid-${marca}`, telefone, 'quero remarcar', 'unid')).ok()).toBe(true)

    let threads: { id: string; whatsapp_number_id: string; contato_id: string }[] = []
    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, whatsapp_number_id, contato_id')
        .eq('tenant_id', tenant).eq('contact_phone', telefone)
      threads = (data ?? []) as typeof threads
      convIds = threads.map(t => t.id)
      return threads.length
    }, { message: 'duas caixas, duas threads' }).toBe(2)

    const doMkt  = threads.find(t => t.whatsapp_number_id === caixas[0])!
    const daUnid = threads.find(t => t.whatsapp_number_id === caixas[1])!

    // O card nasce na thread do MARKETING, sem dizer de quem é.
    const { data: lead, error } = await db.from('leads')
      .insert({
        tenant_id: tenant, name: `${PREFIXO} Oport ${marca}`, phone: telefone,
        crm_stage_id: etapa, conversation_id: doMkt.id,
      })
      .select('id, contato_id').single<{ id: string; contato_id: string }>()
    expect(error, 'criar a oportunidade').toBeNull()
    leadId = lead!.id
    expect(lead!.contato_id, 'o gatilho dá a pessoa da thread de origem').toBe(doMkt.contato_id)

    // Quem abre a thread da UNIDADE vê o negócio da pessoa que está atendendo.
    await page.goto(`/admin/inbox?c=${daUnid.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Oportunidades (1)'),
      'o card preso na thread do marketing é o defeito que esta frente veio consertar',
    ).toBeVisible()
  } finally {
    if (leadId) {
      await db.from('lead_events').delete().eq('lead_id', leadId)
      await db.from('leads').delete().eq('id', leadId)
    }
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})

test('lead do cadastro manual ganha pessoa, e quem escreve depois cai nela', async ({ request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 23).slice(-9)
  const etapa    = await etapaAberta(tenant)
  const token    = `e2e-op-manual-${marca}`

  let caixaId: string | null = null
  let convIds: string[] = []
  let leadId: string | null = null
  let contatoId: string | null = null

  try {
    // Como `createLead` grava: sem conversa nenhuma, telefone como digitado.
    const formatado = `+${telefone.slice(0, 2)} (${telefone.slice(2, 4)}) ${telefone.slice(4)}`
    const { data: lead, error } = await db.from('leads')
      .insert({ tenant_id: tenant, name: `${PREFIXO} Manual ${marca}`, phone: formatado, crm_stage_id: etapa })
      .select('id, contato_id').single<{ id: string; contato_id: string | null }>()
    expect(error, 'criar a oportunidade sem conversa').toBeNull()
    leadId = lead!.id
    contatoId = lead!.contato_id
    expect(contatoId, 'oportunidade sem pessoa é o furo que o gatilho fecha').toBeTruthy()

    const { data: pessoa } = await db.from('contacts')
      .select('identifiers').eq('id', contatoId!).single<{ identifiers: string[] }>()
    expect(pessoa!.identifiers, 'telefone em dígitos, como o webhook grava').toContain(telefone)

    // A pessoa escreve pelo WhatsApp: a thread nasce ligada a ELA, não a outra.
    const { data: caixa } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Manual ${marca}`,
        is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
      })
      .select('id').single<Linha>()
    caixaId = caixa!.id

    expect((await entregar(request, token, telefone, 'oi, me cadastraram ai', 'man')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, contato_id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return (data ?? []).map(c => c.contato_id)
    }, { message: 'a thread nova tem de achar a pessoa do card' }).toEqual([contatoId])
  } finally {
    if (leadId) {
      await db.from('lead_events').delete().eq('lead_id', leadId)
      await db.from('leads').delete().eq('id', leadId)
    }
    await apagarConversas(convIds)
    // Sem thread nenhuma (webhook falhou), a pessoa do card ficaria para trás.
    if (contatoId) await db.from('contacts').delete().eq('id', contatoId)
    if (caixaId) await db.from('whatsapp_numbers').delete().eq('id', caixaId)
  }
})
