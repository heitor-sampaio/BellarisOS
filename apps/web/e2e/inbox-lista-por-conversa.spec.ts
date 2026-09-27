import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * A fila do inbox é de CONVERSAS: a mesma pessoa em duas caixas são duas linhas.
 *
 * Entre 2026-09-25 e 2026-09-26 foi uma linha por pessoa, e o clique escolhia a
 * thread. O Heitor viu com um caso real e achou confuso — não dava para saber em
 * qual conversa se ia cair, nem chegar à outra sem passar pelo painel. Voltou a
 * ser uma linha por conversa. O que liga as duas é a PESSOA no painel do contato
 * (oportunidades, tags, "Também falou"), não a fila.
 *
 * Com duas linhas do mesmo nome, o que as distingue é a caixa: ela aparece na
 * linha quando a rede fala por mais de um número.
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
          id: `E2ELC_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('a mesma pessoa em duas caixas são duas linhas, e cada uma abre a sua conversa', async ({ page, request }) => {
  const db       = banco()
  const tenant   = await tenantId()
  const telefone = '5548' + String(Date.now()).slice(-9)
  const nome     = `${PREFIXO} Duas linhas ${marca}`
  const rotuloA  = `${PREFIXO} Caixa A ${marca}`
  const rotuloB  = `${PREFIXO} Caixa B ${marca}`

  const caixas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [[rotuloA, `e2e-lc-A-${marca}`], [rotuloB, `e2e-lc-B-${marca}`]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi', label: rotulo,
          is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      caixas.push(data!.id)
    }

    expect((await entregar(request, `e2e-lc-A-${marca}`, telefone, nome, 'oi pela caixa A', 'a')).ok()).toBe(true)
    expect((await entregar(request, `e2e-lc-B-${marca}`, telefone, nome, 'oi pela caixa B', 'b')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id').eq('tenant_id', tenant).eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return convIds.length
    }, { message: 'duas caixas, duas conversas no banco' }).toBe(2)

    await page.goto('/admin/inbox')
    await page.waitForLoadState('networkidle')

    const linhas = page.locator('button.inbox-conversa').filter({ hasText: nome })
    await expect(linhas, 'cada conversa é uma linha da fila').toHaveCount(2)

    // A caixa distingue as duas — sem ela seriam duas linhas idênticas.
    const daA = linhas.filter({ hasText: rotuloA })
    const daB = linhas.filter({ hasText: rotuloB })
    await expect(daA).toHaveCount(1)
    await expect(daB).toHaveCount(1)

    // E cada clique leva à conversa daquela linha, sem escolha escondida.
    // Olhando só a área de mensagens: a prévia da lista tem o mesmo texto e
    // passaria mesmo abrindo a conversa errada.
    const mensagens = page.locator('.inbox-mensagens')
    await daA.click()
    await expect(mensagens.getByText('oi pela caixa A')).toBeVisible()
    await expect(mensagens.getByText('oi pela caixa B')).toHaveCount(0)
    await daB.click()
    await expect(mensagens.getByText('oi pela caixa B')).toBeVisible()
    await expect(mensagens.getByText('oi pela caixa A')).toHaveCount(0)
  } finally {
    await apagarConversas(convIds)
    if (caixas.length) await db.from('whatsapp_numbers').delete().in('id', caixas)
  }
})
