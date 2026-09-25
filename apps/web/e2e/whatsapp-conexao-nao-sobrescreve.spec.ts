import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'

/**
 * O evento de conexão de uma caixa não pode mexer na outra.
 *
 * `tratarConexao` atualizava por `(tenant_id, provider)`: com duas caixas
 * uazapi na mesma rede, a segunda a conectar reescrevia `is_active` e
 * `connectedPhone` da PRIMEIRA. A clínica veria "conectado" nas duas e as
 * mensagens de uma delas parariam de sair, sem erro em lugar nenhum.
 *
 * O defeito não aparecia antes porque a rede só podia ter um número — é
 * exatamente o tipo de coisa que a frente de múltiplos números tinha de
 * desenterrar em vez de herdar.
 */

const marca = Date.now().toString(36)

type Linha = { id: string; is_active: boolean; phone_e164: string | null; config: Record<string, unknown> }

test('conectar a caixa B não altera a caixa A', async ({ request }) => {
  const db     = banco()
  const tenant = await tenantId()

  const tokenA = `e2e-conex-A-${marca}`
  const tokenB = `e2e-conex-B-${marca}`
  const criadas: string[] = []

  try {
    for (const [rotulo, token, ativa] of [
      ['A', tokenA, true],
      ['B', tokenB, false],
    ] as const) {
      const { data, error } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} conexao ${rotulo} ${marca}`,
          is_active: ativa,
          phone_e164: ativa ? '5511999990000' : null,
          config: { token, baseUrl: 'https://e2e.invalido', connectedPhone: ativa ? '5511999990000' : null },
        })
        .select('id').single<Linha>()
      expect(error, `criar a caixa ${rotulo}`).toBeNull()
      criadas.push(data!.id)
    }
    const [idA, idB] = criadas as [string, string]

    // Evento de conexão da caixa B. Sem `message` no corpo, o webhook trata
    // como mudança de estado da instância.
    const res = await request.post('/api/webhooks/uazapi', {
      data: {
        token: tokenB,
        data: { status: { connected: true, jid: '5511888887777@s.whatsapp.net' } },
      },
    })
    expect(res.ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('whatsapp_numbers')
        .select('is_active').eq('id', idB).single()
      return data?.is_active
    }, { message: 'a caixa B deveria ter ficado ativa' }).toBe(true)

    const { data: a } = await db.from('whatsapp_numbers')
      .select('is_active, phone_e164, config').eq('id', idA).single<Linha>()

    expect(a?.is_active, 'a caixa A não pode mudar de estado por causa da B').toBe(true)
    expect(a?.phone_e164, 'o número da caixa A não pode ser reescrito pelo da B')
      .toBe('5511999990000')
    expect((a?.config as Record<string, string>)?.connectedPhone,
      'nem dentro do config').toBe('5511999990000')

    const { data: b } = await db.from('whatsapp_numbers')
      .select('phone_e164').eq('id', idB).single<Linha>()
    expect(b?.phone_e164, 'a caixa B guarda o número que pareou nela')
      .toBe('5511888887777')
  } finally {
    if (criadas.length) await db.from('whatsapp_numbers').delete().in('id', criadas)
  }
})
