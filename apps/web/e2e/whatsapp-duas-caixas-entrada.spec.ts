import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * O MESMO telefone falando com duas caixas são DUAS conversas.
 *
 * É o teste central da frente de múltiplos números, porque é a coisa que o
 * sistema não sabia fazer: a chave de dedup era
 * `(tenant_id, channel, contact_external_id)` — a caixa não entrava. Com dois
 * números, a pessoa que escreve para a Recepção e para o Comercial viraria uma
 * conversa só, e a resposta da clínica sairia pelo número errado.
 *
 * E são duas conversas porque **do lado do cliente são duas conversas**: dois
 * contatos no celular dele, dois históricos, duas janelas de 24h. Juntar aqui o
 * que está separado lá é o tipo de simplificação que só aparece no atendimento.
 *
 * ⚠️ Este teste cria DUAS caixas uazapi com tokens falsos. Ele nunca envia nada
 * — só alimenta o webhook, que é entrada pura. Os tokens são inventados e
 * exclusivos da rodada, e o `finally` apaga tudo que ele criou.
 */

const marca    = Date.now().toString(36)
const telefone = '5548' + String(Date.now()).slice(-9)

type Linha = { id: string }

async function entregar(
  request: import('@playwright/test').APIRequestContext,
  token: string, sufixo: string,
) {
  return request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: `${PREFIXO} Duas caixas`, phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: `Oi, cheguei pela caixa ${sufixo}`,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: `E2E2CX_${sufixo}_${marca}`,
          fromMe: false,
        },
      },
    },
  })
}

test('o mesmo telefone em duas caixas vira duas conversas', async ({ request }) => {
  const db     = banco()
  const tenant = await tenantId()

  const tokenA = `e2e-token-A-${marca}`
  const tokenB = `e2e-token-B-${marca}`
  const criadas: string[] = []
  let convIds: string[] = []

  try {
    for (const [rotulo, token] of [['A', tokenA], ['B', tokenB]] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} caixa ${rotulo} ${marca}`,
          is_active: true,
          // O token é o que o webhook compara — é por ele que a entrega é
          // roteada, e é também o segredo. Aqui é falso de propósito: nada sai.
          config: { token, baseUrl: 'https://e2e.invalido' },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      criadas.push(data!.id)
    }
    const [idA, idB] = criadas as [string, string]

    expect((await entregar(request, tokenA, 'A')).ok()).toBe(true)
    expect((await entregar(request, tokenB, 'B')).ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, whatsapp_number_id')
        .eq('tenant_id', tenant)
        .eq('contact_phone', telefone)
      convIds = (data ?? []).map(c => c.id as string)
      return (data ?? []).length
    }, {
      message: 'duas caixas, duas conversas — do lado do cliente também são duas',
    }).toBe(2)

    const { data: convs } = await db.from('conversations')
      .select('whatsapp_number_id')
      .eq('tenant_id', tenant)
      .eq('contact_phone', telefone)

    const caixas = (convs ?? []).map(c => c.whatsapp_number_id as string).sort()
    expect(caixas, 'cada conversa aponta para a caixa que de fato recebeu')
      .toEqual([idA, idB].sort())
  } finally {
    // `conversations` primeiro: as caixas são referenciadas por elas. E por
    // `apagarConversas`, que também tira o contato que o gatilho criou junto —
    // limpar isso à mão em cada spec é como os órfãos apareceram.
    await apagarConversas(convIds)
    if (criadas.length) await db.from('whatsapp_numbers').delete().in('id', criadas)
  }
})
