import { test, expect, type Page } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { subirUazapiFalsa, PORTA_DA_UAZAPI_FALSA, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * "Adicionar número" pela conexão gerenciada abre uma instância NOVA
 * (2026-10-07, bug relatado pelo Heitor).
 *
 * A tela de conexão não sabia de qual número falava: pedia "a conexão da rede"
 * sem id, e o servidor devolvia a única gerenciada que existisse — a JÁ
 * conectada. Quem clicava em "Adicionar número" via o número de antes, e não
 * tinha como criar o segundo. Com duas ou mais, depois de criar, a tela recarregava
 * sem o id da nova e nunca mostrava o QR dela.
 *
 * E o cartão diz quantas conexões o plano dá e quantas estão em uso.
 *
 * Só contra o build: a criação fala com a uazapi FALSA (porta fixa, que o build
 * recebe pelo ambiente). No `next dev` o `.env.local` aponta para a real, e cada
 * instância criada lá é cobrada.
 */

const TAB   = '/admin/settings?tab=integrations'
const marca = Date.now().toString(36)
const URL_FALSA = `http://127.0.0.1:${PORTA_DA_UAZAPI_FALSA}`

test.skip(process.env.UAZAPI_BASE_URL !== URL_FALSA, 'só contra o build: a uazapi tem de ser a falsa')

let falsa: UazapiFalsa
let conectada: string

async function abrirOCartao(page: Page) {
  await page.goto(TAB)
  await page.waitForLoadState('networkidle')
  const cartao = page.locator('#whatsapp')
  if (await cartao.count()) await cartao.first().click()
}

test.beforeAll(async () => {
  falsa = await subirUazapiFalsa(PORTA_DA_UAZAPI_FALSA)
  const token = `e2e-conectada-${marca}`
  falsa.conectadas.set(token, { jid: '5511987650000@s.whatsapp.net', nome: 'Recepção E2E' })

  // Uma conexão gerenciada JÁ conectada, na uazapi falsa.
  const { data, error } = await banco().from('whatsapp_numbers')
    .insert({
      tenant_id: await tenantId(), provider: 'uazapi', label: `${PREFIXO} Conectada ${marca}`,
      managed: true, is_active: true,
      config: { token, baseUrl: URL_FALSA, managed: true, instanceId: token, instanceName: token },
    })
    .select('id').single<{ id: string }>()
  expect(error, 'criar a conexão conectada').toBeNull()
  conectada = data!.id
})

test.afterAll(async () => {
  // As conversas do histórico trazido (a caixa não sai com conversa presa a ela).
  const { data: convs } = await banco().from('conversations').select('id').eq('contact_phone', FONE_DO_HISTORICO)
  if (convs?.length) await apagarConversas(convs.map(c => c.id as string))
  // A conectada e toda caixa que o teste criou (as da uazapi falsa).
  await banco().from('whatsapp_numbers').delete()
    .eq('tenant_id', await tenantId()).eq('config->>baseUrl', URL_FALSA)
  await falsa?.fechar()
})

test('"Adicionar número" cria uma instância nova e mostra o QR dela, não a conectada', async ({ page }) => {
  await abrirOCartao(page)
  await page.getByRole('button', { name: 'Adicionar número' }).click()
  await page.getByRole('button', { name: /^WhatsApp Web/ }).click()
  await page.getByRole('button', { name: 'Conectar por aqui', exact: true }).click()

  // A conexão nova começa do zero — não é a que já está no ar.
  await expect(page.getByRole('button', { name: 'Conectar WhatsApp' })).toBeVisible()
  await expect(page.getByText('5511987650000')).toHaveCount(0)

  await page.getByRole('button', { name: 'Conectar WhatsApp' }).click()

  // A instância nasceu na uazapi (falsa), e a tela mostra o QR DELA.
  await expect(page.getByRole('img', { name: 'QR code para conectar o WhatsApp' })).toBeVisible()
  expect(falsa.para('/instance/init')).toHaveLength(1)

  const { data } = await banco().from('whatsapp_numbers')
    .select('id, managed, is_active').eq('tenant_id', await tenantId())
    .eq('config->>baseUrl', URL_FALSA).neq('id', conectada)
  expect(data, 'a caixa nova, gerenciada e ainda não pareada').toEqual([
    expect.objectContaining({ managed: true, is_active: false }),
  ])
})

const FONE_DO_HISTORICO = `5549${String(Date.now()).slice(-9)}`

// O histórico do pareamento vem SOZINHO ao conectar (2026-10-13): a caixa
// passa a conectada (marcarConectada) e a importação abre e roda depois da
// resposta. A tela mostra o bloco do histórico na caixa conectada.
test('conectar traz o histórico do pareamento para o inbox, sozinho', async ({ page }) => {
  const token = `e2e-pareando-${marca}`
  const { data, error } = await banco().from('whatsapp_numbers').insert({
    tenant_id: await tenantId(), provider: 'uazapi', label: `${PREFIXO} Pareando ${marca}`,
    managed: true, is_active: false,
    config: { token, baseUrl: URL_FALSA, managed: true, instanceId: token, instanceName: token },
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a caixa ainda não pareada').toBeNull()
  const caixa = data!.id
  falsa.historico = {
    status: { processingComplete: true, progress: 100, diagnosis: [] },
    chats: [{ wa_chatid: `${FONE_DO_HISTORICO}@s.whatsapp.net`, phone: FONE_DO_HISTORICO, wa_contactName: `${PREFIXO} Histórico ${marca}`, wa_isGroup: false, wa_lastMsgTimestamp: Date.now() }],
    mensagens: { [`${FONE_DO_HISTORICO}@s.whatsapp.net`]: [
      { messageid: `HP${marca}`, chatid: `${FONE_DO_HISTORICO}@s.whatsapp.net`, fromMe: false, sender_pn: `${FONE_DO_HISTORICO}@s.whatsapp.net`, text: 'Mensagem de antes de conectar', messageTimestamp: Date.now() - 60_000 },
    ] },
  }
  // O celular leu o QR.
  falsa.conectadas.set(token, { jid: '5511987651111@s.whatsapp.net', nome: 'Pareando E2E' })

  await abrirOCartao(page)
  await page.locator(`[data-numero="${caixa}"]`).getByRole('button', { name: 'Conexão' }).click()
  await expect(page.locator('[data-historico-da-caixa]')).toBeVisible()
  await expect.poll(async () => (await banco().from('whatsapp_historicos').select('status')
    .eq('whatsapp_number_id', caixa)).data?.[0]?.status, { timeout: 60_000 }).toBe('concluida')
  const { data: msgs } = await banco().from('messages').select('content, importada')
    .eq('whatsapp_number_id', caixa)
  expect(msgs).toEqual([{ content: 'Mensagem de antes de conectar', importada: true }])
  await expect(page.locator('[data-historico-da-caixa]')).toContainText('1 conversa, 1 mensagem nova')
})

test('"Conexão" de uma caixa existente mostra ELA', async ({ page }) => {
  await abrirOCartao(page)
  await page.locator(`[data-numero="${conectada}"]`).getByRole('button', { name: 'Conexão' }).click()
  await expect(page.getByText('5511987650000')).toBeVisible()
  await expect(page.getByText('(Recepção E2E)')).toBeVisible()
})

test('o cartão diz quantas conexões estão em uso e quantas sobram', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()
  const { count: ativos } = await db.from('whatsapp_numbers')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('is_active', true)
  const { data: sub } = await db.from('tenant_subscriptions')
    .select('recursos, adicionais').eq('tenant_id', tenant).maybeSingle()
  const doPlano = (sub?.recursos as { limites?: { whatsapp?: number | null } } | null)?.limites?.whatsapp
  const extra = (sub?.adicionais as { whatsapp?: { quantidade?: number } } | null)?.whatsapp?.quantidade ?? 0
  const limite = !sub?.recursos || doPlano === null || doPlano === undefined ? null : doPlano + extra

  await abrirOCartao(page)
  const uso = page.locator('[data-uso-do-whatsapp]')
  if (limite === null) {
    await expect(uso).toContainText(`${ativos} em uso`)
    await expect(uso).toContainText('sem limite no plano')
  } else {
    await expect(uso).toContainText(`${ativos} de ${limite} em uso`)
    const sobra = Math.max(0, limite - (ativos ?? 0))
    await expect(uso).toContainText(sobra === 0 ? 'nenhuma disponível' : `${sobra} disponíve`)
  }
})

/**
 * A página aberta antes de um deploy (2026-10-08, relatado pelo Heitor): a
 * action tem o id do build velho, o servidor responde "não encontrada", e o
 * "Conectar por aqui" girava em "Carregando…" para sempre — o erro era
 * pego e não aparecia. Agora a página recarrega (e pega o build novo).
 * A resposta é a que o servidor dá a um id desconhecido: 404 com
 * `x-nextjs-action-not-found: 1`.
 */
test('página de um deploy anterior: a conexão recarrega a página em vez de girar', async ({ page }) => {
  await abrirOCartao(page)
  let respondidas = 0
  await page.route('**/admin/settings**', async route => {
    const r = route.request()
    if (r.method() === 'POST' && r.headers()['next-action'] && respondidas++ === 0) {
      return route.fulfill({
        status: 404, contentType: 'text/plain', body: 'Server action not found.',
        headers: { 'x-nextjs-action-not-found': '1' },
      })
    }
    return route.fallback()
  })

  const recarregou = page.waitForEvent('load')
  await page.getByRole('button', { name: 'Adicionar número' }).click()
  await recarregou
  expect(respondidas, 'a action do build velho foi chamada').toBeGreaterThan(0)
})

test('a leitura da conexão falhou: a tela diz e deixa tentar de novo, não gira', async ({ page }) => {
  await abrirOCartao(page)
  let respondidas = 0
  await page.route('**/admin/settings**', async route => {
    const r = route.request()
    if (r.method() === 'POST' && r.headers()['next-action'] && respondidas++ === 0) {
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'fora do ar' })
    }
    return route.fallback()
  })

  await page.getByRole('button', { name: 'Adicionar número' }).click()
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('button', { name: 'Conectar WhatsApp' })).toBeVisible()
})
