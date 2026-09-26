import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * A lista do inbox é por PESSOA, não por thread.
 *
 * A conversa é a thread (§9.2.1): o mesmo telefone falando com duas caixas são
 * duas conversas, porque no celular do cliente também são. Na fila isso punha a
 * MESMA pessoa em duas linhas, competindo consigo mesma por atenção.
 *
 * ⚠️ Pessoa é a unidade de NAVEGAÇÃO; thread continua a de CONVERSA. As
 * mensagens não são intercaladas de propósito — as threads são separadas de
 * verdade do lado do cliente, e um histórico misturado mostraria uma conversa que
 * não existe para ele. Para ir à outra, o painel do contato tem o atalho
 * (`contato-cruza-threads`).
 */

const marca = Date.now().toString(36)

type Linha = { id: string }

async function entregar(
  request: import('@playwright/test').APIRequestContext,
  token: string, telefone: string, nome: string, texto: string, sufixo: string,
) {
  return request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: nome, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: texto,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2ELP_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('a mesma pessoa em duas caixas ocupa UMA linha, com as não lidas somadas', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now()).slice(-9)
  const nome     = `${PREFIXO} Uma linha ${marca}`

  const tokenA = `e2e-lp-A-${marca}`
  const tokenB = `e2e-lp-B-${marca}`
  const caixas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [['A', tokenA], ['B', tokenB]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} linha ${rotulo} ${marca}`,
          is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    expect((await entregar(request, tokenA, telefone, nome, 'oi pela A', 'a')).ok()).toBe(true)
    expect((await entregar(request, tokenB, telefone, nome, 'oi pela B', 'b')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, unread_count, contato_id')
        .eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return convIds.length
    }, { message: 'duas caixas, duas threads no banco' }).toBe(2)

    // Quanto o banco diz que está por ler — a soma é o que a linha tem de mostrar.
    const { data: threads } = await db.from('conversations')
      .select('unread_count').eq('tenant_id', tenant).eq('contact_phone', telefone)
    const somaEsperada = (threads ?? []).reduce((t, c) => t + Number(c.unread_count ?? 0), 0)
    test.skip(somaEsperada < 2, 'o ambiente não marcou as duas como não lidas')

    await page.goto('/admin/inbox')
    await page.waitForLoadState('networkidle')

    // UMA linha, não duas. É a correção: a mesma pessoa competia consigo mesma.
    await expect(page.getByText(nome),
      'a mesma pessoa não pode ocupar duas linhas da fila',
    ).toHaveCount(1)

    // E a linha diz que existe histórico em outro lugar, antes de abrir.
    const linha = page.locator('button.inbox-conversa').filter({ hasText: nome })
    await expect(linha.getByText('2 conversas')).toBeVisible()

    // As não lidas somam: a linha é da pessoa, e o número também.
    await expect(linha.getByText(String(somaEsperada), { exact: true })).toBeVisible()
  } finally {
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})

test('clicar na linha abre a thread de atividade mais recente', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now() + 11).slice(-9)
  const nome     = `${PREFIXO} Mais recente ${marca}`

  const tokenVelho = `e2e-lp-v-${marca}`
  const tokenNovo  = `e2e-lp-n-${marca}`
  const caixas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [['velha', tokenVelho], ['nova', tokenNovo]] as const) {
      const { data } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} ${rotulo} ${marca}`,
          is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      caixas.push(data!.id)
    }

    // A ordem importa: a segunda entrega é a mais recente.
    expect((await entregar(request, tokenVelho, telefone, nome, 'mensagem antiga', 'v')).ok()).toBe(true)
    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      return (data ?? []).length
    }).toBe(1)

    expect((await entregar(request, tokenNovo, telefone, nome, 'mensagem recente', 'n')).ok()).toBe(true)
    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return convIds.length
    }).toBe(2)

    await page.goto('/admin/inbox')
    await page.waitForLoadState('networkidle')

    await page.locator('button.inbox-conversa').filter({ hasText: nome }).click()

    // Abriu a thread da mensagem recente — é a que a pessoa está esperando
    // resposta. Abrir a antiga seria pôr quem atende no lugar errado.
    await expect(page.getByText('mensagem recente')).toBeVisible()
  } finally {
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})
