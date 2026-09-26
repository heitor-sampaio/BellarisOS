import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * Quem assume o atendimento chega ao que foi dito na outra caixa.
 *
 * É o cruzamento que conserta o handoff. O cenário é o real: o lead entra pelo
 * número de marketing, alguém qualifica e agenda, e a unidade assume por OUTRO
 * número. Do lado do cliente são duas conversas — então aqui também são —, e até
 * agora quem abria a segunda não via nada da primeira. Justamente no momento em
 * que ler o histórico é o que mais importa.
 *
 * O bloco vive na seção do CONTATO do painel, não na das oportunidades: é sobre
 * a pessoa, não sobre o negócio.
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
        chat: { name: `${PREFIXO} Handoff ${marca}`, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: texto,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2EHF_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('o painel mostra a outra thread da mesma pessoa, e o clique leva até ela', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now()).slice(-9)

  const tokenMkt = `e2e-hf-mkt-${marca}`
  const tokenRec = `e2e-hf-rec-${marca}`
  const rotuloMkt = `${PREFIXO} Marketing ${marca}`
  const rotuloRec = `${PREFIXO} Recepcao ${marca}`

  const caixas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [[rotuloMkt, tokenMkt], [rotuloRec, tokenRec]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi', label: rotulo,
          is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    // A pessoa chega pelo marketing e depois é atendida pela recepção.
    expect((await entregar(request, tokenMkt, telefone, 'vi o anuncio de voces', 'mkt')).ok()).toBe(true)
    expect((await entregar(request, tokenRec, telefone, 'oi, quero confirmar meu horario', 'rec')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, whatsapp_number_id')
        .eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return convIds.length
    }, { message: 'duas caixas, duas threads' }).toBe(2)

    const { data: threads } = await db.from('conversations')
      .select('id, whatsapp_number_id')
      .eq('tenant_id', tenant).eq('contact_phone', telefone)

    const daRecepcao = (threads ?? []).find(t => t.whatsapp_number_id === caixas[1])!
    expect(daRecepcao, 'a thread da recepção precisa existir').toBeTruthy()

    // Abre a conversa da RECEPÇÃO — quem assumiu o atendimento.
    await page.goto(`/admin/inbox?c=${daRecepcao.id}`)
    await page.waitForLoadState('networkidle')

    // O painel precisa dizer que esta pessoa também falou no Marketing.
    await expect(page.getByText(/Também falou/i)).toBeVisible()
    const atalho = page.getByRole('button', { name: rotuloMkt })
    await expect(atalho,
      'sem este atalho, o histórico do marketing fica inalcançável no handoff',
    ).toBeVisible()

    // E o clique leva de fato até ela: o que foi dito no marketing aparece.
    await atalho.click()
    await expect(page.getByText('vi o anuncio de voces')).toBeVisible()

    // Estando na do marketing, o atalho aponta para o outro lado — é cruzamento,
    // não um link de mão única.
    await expect(page.getByRole('button', { name: rotuloRec })).toBeVisible()
  } finally {
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})

test('pessoa com uma thread só não ganha bloco nenhum', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 7).slice(-9)
  const token    = `e2e-hf-uma-${marca}`

  let caixaId: string | null = null
  let convIds: string[] = []

  try {
    const { data } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi',
        label: `${PREFIXO} Sozinha ${marca}`,
        is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
      })
      .select('id').single<Linha>()
    caixaId = data!.id

    expect((await entregar(request, token, telefone, 'oi', 'uma')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data: convs } = await db.from('conversations')
        .select('id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (convs ?? []).map(c => c.id as string)
      return convIds.length
    }, { message: 'a conversa deveria nascer' }).toBe(1)

    await page.goto(`/admin/inbox?c=${convIds[0]}`)
    await page.waitForLoadState('networkidle')

    // O caso comum é este, e nele o bloco não pode aparecer: seção vazia com
    // título é pior que seção ausente — ocupa espaço para não dizer nada.
    await expect(page.getByText(/Também falou/i)).toHaveCount(0)
  } finally {
    await apagarConversas(convIds)
    if (caixaId) await db.from('whatsapp_numbers').delete().eq('id', caixaId)
  }
})
