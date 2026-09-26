import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * As tags são da PESSOA, e valem nas duas threads dela.
 *
 * Elas já eram do contato — `conversations.tags` sempre teve o comentário "Tags
 * do CONTATO: descrevem a pessoa, não o negócio". Ficavam na conversa por falta
 * de lugar, e com vários números isso deixou de ser só feio: a mesma pessoa
 * falando com duas caixas tinha DUAS listas, e marcar "botox" atendendo pela
 * recepção não aparecia para quem abria a thread do marketing.
 *
 * `conversations.tags` continua existindo como SEMENTE do nascimento da thread
 * (é de lá que vêm as tags derivadas da origem), e o gatilho as leva para a
 * pessoa. Nenhum leitor do app lê dali.
 */

const marca = Date.now().toString(36)
const TAG   = `${PREFIXO} tag ${marca}`

type Linha = { id: string }

async function entregar(
  request: import('@playwright/test').APIRequestContext,
  token: string, telefone: string, nome: string, sufixo: string,
) {
  return request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: nome, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: `oi pela ${sufixo}`,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2ETG_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('a tag marcada numa thread vale na outra', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now()).slice(-9)
  const nome     = `${PREFIXO} Tags ${marca}`

  const tokenA = `e2e-tg-A-${marca}`
  const tokenB = `e2e-tg-B-${marca}`
  const caixas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [['A', tokenA], ['B', tokenB]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} tag ${rotulo} ${marca}`,
          is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    expect((await entregar(request, tokenA, telefone, nome, 'A')).ok()).toBe(true)
    expect((await entregar(request, tokenB, telefone, nome, 'B')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, contato_id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return convIds.length
    }, { message: 'duas caixas, duas threads' }).toBe(2)

    const { data: threads } = await db.from('conversations')
      .select('id, whatsapp_number_id, contato_id')
      .eq('tenant_id', tenant).eq('contact_phone', telefone)

    const daA = (threads ?? []).find(t => t.whatsapp_number_id === caixas[0])!
    const daB = (threads ?? []).find(t => t.whatsapp_number_id === caixas[1])!
    const contatoId = daA.contato_id as string

    // A tag vai para a PESSOA — é onde o app grava agora.
    const { error: erroTag } = await db.from('contacts')
      .update({ tags: [TAG] }).eq('id', contatoId)
    expect(erroTag, erroTag?.message).toBeNull()

    // Abre a thread A: a tag está no painel do contato.
    await page.goto(`/admin/inbox?c=${daA.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(TAG).first(),
      'a tag da pessoa tem de aparecer na thread A',
    ).toBeVisible()

    // Abre a thread B: a MESMA tag. Antes eram duas listas, e esta ficava vazia.
    await page.goto(`/admin/inbox?c=${daB.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(TAG).first(),
      'a tag é da pessoa: marcar numa thread tem de valer na outra',
    ).toBeVisible()
  } finally {
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})

test('o filtro por tag encontra a pessoa em qualquer thread dela', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 13).slice(-9)
  const nome     = `${PREFIXO} Filtro ${marca}`
  const token    = `e2e-tg-f-${marca}`

  let caixaId: string | null = null
  let convIds: string[] = []

  try {
    const { data } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi',
        label: `${PREFIXO} filtro ${marca}`,
        is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
      })
      .select('id').single<Linha>()
    caixaId = data!.id

    expect((await entregar(request, token, telefone, nome, 'F')).ok()).toBe(true)

    let contatoId: string | null = null
    await expect.poll(async () => {
      const { data: convs } = await db.from('conversations')
        .select('id, contato_id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (convs ?? []).map(c => c.id as string)
      contatoId = (convs ?? [])[0]?.contato_id as string ?? null
      return convIds.length
    }).toBe(1)

    await db.from('contacts').update({ tags: [TAG] }).eq('id', contatoId!)

    await page.goto('/admin/inbox')
    await page.waitForLoadState('networkidle')

    // A busca do inbox olha as tags do contato. Se `lead_tags` ainda viesse da
    // semente na conversa, a pessoa não seria encontrada por uma tag marcada
    // depois do nascimento da thread — que é o caso normal.
    await page.getByPlaceholder(/pesquisar/i).first().fill(TAG)
    await expect(page.getByText(nome).first(),
      'a busca por tag tem de achar a pessoa',
    ).toBeVisible()
  } finally {
    await apagarConversas(convIds)
    if (caixaId) await db.from('whatsapp_numbers').delete().eq('id', caixaId)
  }
})
