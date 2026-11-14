import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede } from './apoio/outra-rede'
import { partsInTZ } from '../lib/datetime'

/**
 * MK1 (a revisão do Heitor, 2026-11-13): a campanha AGENDADA também é "todo
 * ano numa data" (o Dia das Mães). Pelo cron de verdade: no dia dela, a partir
 * das 09:00 da rede, vai ao público escolhido — uma vez só no dia —, e a
 * campanha continua ATIVA para o ano que vem. (Substitui o
 * `campanha-aniversario.spec.ts`: o aniversário saiu da campanha e é um modelo
 * nas Automações — AU1.)
 *
 * Rede `[e2e]` própria, mas o cron passa por todas as redes: é compartilhado.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()

test('a data de todo ano sai no dia, a partir das 09:00, só ao público, uma vez — e segue ativa', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'CRON_SECRET não está no .env.local')
  const rede = await criarOutraRede(`anual${marca}`)
  try {
    const tag = `Mães ${marca}`
    const ficha = async (nome: string, tags: string[]) => {
      const { data, error } = await db().from('clients').insert({
        tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} ${nome} ${marca}`,
        phone: '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9), tags,
      }).select('id').single<{ id: string }>()
      expect(error, nome).toBeNull()
      return data!.id
    }
    const mae = await ficha('Mãe', [tag])
    const outra = await ficha('Outra', [])

    const hoje = partsInTZ(new Date())
    const { data: c, error } = await db().from('notification_campaigns').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} Dia das Mães ${marca}`, status: 'ACTIVE',
      type: 'SCHEDULED', trigger_type: 'ANNUAL_DATE', trigger_config: { month: hoje.month, day: hoje.day },
      title: 'Feliz dia, {{first_name}}', body: `${PREFIXO} mães ${marca}`, audience_rules: { tags: [tag] },
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    const campanha = c!.id

    const rodar = async (hora: number) => {
      const r = await request.get(`/api/cron/notification-campaigns?hora=${hora}`, { headers: { authorization: `Bearer ${segredo}` } })
      expect(r.status()).toBe(200)
    }
    const recebidas = async () => ((await db().from('client_notifications').select('client_id')
      .eq('data->>campaign_id', campanha)).data ?? []).map(n => n.client_id as string)

    // Antes das 09:00 da rede, nada.
    await rodar(8)
    expect(await recebidas()).toEqual([])

    await rodar(12)
    expect(await recebidas(), 'só quem tem a tag').toEqual([mae])
    expect(await recebidas()).not.toContain(outra)

    // De novo no mesmo dia: não manda outra vez.
    await rodar(13)
    expect(await recebidas()).toEqual([mae])

    const { data: depois } = await db().from('notification_campaigns').select('status, total_sent, last_run_at').eq('id', campanha).single()
    expect(depois!.status, 'a de todo ano não se conclui').toBe('ACTIVE')
    expect(depois!.total_sent).toBe(1)
    expect(depois!.last_run_at).not.toBeNull()
  } finally {
    await db().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
    await rede.limpar()
  }
})
