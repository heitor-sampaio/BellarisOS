import { test, expect } from '@playwright/test'
import { banco, tenantId, nomeDeTeste, apagarConversas } from './apoio/banco'

/**
 * Conversa NOVA tem de aparecer no inbox sozinha — sem recarregar a página.
 *
 * O defeito que isto guarda foi relatado assim: "me parece que tá realtime
 * apenas pra novas mensagens". E era. A causa não estava no banco — a
 * publicação e as policies entregam o INSERT normalmente —, estava na ordem
 * dos fatos: `resolveConversation` cria o contato ainda mudo, e
 * `getConversations` descarta quem não tem `last_message_at`. O recarregamento
 * disparado pelo INSERT apagava da lista a conversa que ele mesmo acabara de
 * colocar, e o UPDATE seguinte — o do trigger `on_new_message`, que é onde ela
 * de fato vira conversa — só sabia mesclar o que já estava na lista.
 *
 * O teste reproduz a mesma ordem do webhook: primeiro o contato, depois a
 * mensagem. Numa só gravação o defeito não apareceria.
 */
const nome = nomeDeTeste('realtime inbox')
let convId: string | null = null

test.afterAll(async () => {
  if (convId) {
    await apagarConversas([convId])
  }
})

test('conversa nova aparece na lista sem recarregar a página', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()

  await page.goto('/admin/inbox')
  // A lista carregada é o ponto de partida: sem esperar por ela, o evento
  // chegaria antes de haver quem escutasse e o teste passaria por engano.
  await expect(page.getByPlaceholder(/pesquisar/i).first()).toBeVisible()
  await page.waitForTimeout(1500)

  const externo = 'e2e-rt-' + Date.now()

  // 1. O contato nasce MUDO, como no webhook.
  const { data: conv, error: erroConv } = await db.from('conversations').insert({
    tenant_id:           tenant,
    branch_id:           null,
    channel:             'manual',
    status:              'open',
    contact_name:        nome,
    contact_external_id: externo,
    contact_aliases:     [externo],
    attribution:         { source: 'E2E' },
    tags:                [],
  }).select('id').single()
  expect(erroConv, erroConv?.message).toBeNull()
  convId = conv!.id as string

  // Enquanto está mudo não é conversa: a lista não deve mostrá-lo.
  await page.waitForTimeout(1500)
  await expect(page.getByText(nome)).toHaveCount(0)

  // 2. A primeira mensagem. É o trigger `on_new_message` que a transforma em
  //    conversa — e é este UPDATE que a lista precisa entender.
  const { error: erroMsg } = await db.from('messages').insert({
    conversation_id: convId,
    tenant_id:       tenant,
    direction:       'inbound',
    content:         'Oi, vim pelo anuncio',
    channel:         'manual',
    status:          'delivered',
    external_id:     externo + '-1',
    is_read:         false,
  })
  expect(erroMsg, erroMsg?.message).toBeNull()

  // Sem nenhum reload: o card tem de entrar sozinho.
  await expect(page.getByText(nome).first()).toBeVisible({ timeout: 45_000 })
})

/**
 * A mensagem que chega na conversa ABERTA aparece sozinha. Desde 19/11 a tela
 * assina o sinal DAQUELA conversa (`c:<id>`) e relê pelo servidor — o recibo
 * de outra conversa não a acorda (ao Heitor: "o inbox que pode ter muita
 * atualização e vai atualizar toda rede").
 */
test('a mensagem que chega na conversa aberta aparece sem recarregar a página', async ({ page }) => {
  test.skip(!convId, 'depende da conversa do teste de cima')
  const db = banco()
  const tenant = await tenantId()

  await page.goto(`/admin/inbox?c=${convId}`)
  // Dentro da CONVERSA (as bolhas), não na lista: o cartão da lista mostra a
  // última mensagem também, e se recarrega por outro sinal (o da lista).
  const conversa = page.locator('.inbox-thread .bolha-linha')
  await expect(conversa.filter({ hasText: 'Oi, vim pelo anuncio' }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)

  const texto = `Chegou agora ${Date.now()}`
  const { error } = await db.from('messages').insert({
    conversation_id: convId, tenant_id: tenant, direction: 'inbound', content: texto,
    channel: 'manual', status: 'delivered', external_id: `e2e-rt-${Date.now()}-2`, is_read: false,
  })
  expect(error, error?.message).toBeNull()

  await expect(conversa.filter({ hasText: texto }).first()).toBeVisible({ timeout: 30_000 })
})
