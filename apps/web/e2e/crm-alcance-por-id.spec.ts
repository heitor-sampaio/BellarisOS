import { test, expect } from '@playwright/test'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { membroComEscopoProprio, type MembroDeTeste } from './apoio/sessao'

/**
 * Com CRM "só os meus", a oportunidade de OUTRO dono não se mexe pelo id.
 *
 * O funil já recusava mover o card alheio (`updateLeadStage`), mas outras
 * actions recebiam o id da oportunidade e não conferiam o dono — marcar
 * ganho/perdido pelo inbox, abrir ou criar a conversa do card, agendar,
 * cadastrar cliente a partir dela. Nenhuma tela oferece o card alheio a quem
 * não o vê, então o furo só aparece fazendo o que um curioso faria: pegar uma
 * chamada legítima e REENVIÁ-LA trocando o id.
 *
 * É o que este teste faz. A SDR marca a oportunidade DELA como ganha pelo
 * painel; a chamada é capturada e reenviada com o id da oportunidade do admin.
 * O controle é a dela ter virado ganha — sem ele, "a alheia não mudou" poderia
 * ser só a chamada que não funciona.
 */

const marca = Date.now().toString(36)
const MEU    = `${PREFIXO} Meu lead ${marca}`
const ALHEIO = `${PREFIXO} Lead alheio ${marca}`

interface Cenario { convId: string; meuLead: string; alheioLead: string }

async function outcomeDo(leadId: string): Promise<string> {
  const { data } = await banco().from('leads')
    .select('crm_stages(outcome)').eq('id', leadId).single()
  return (data as unknown as { crm_stages: { outcome: string } }).crm_stages.outcome
}

test.describe.serial('oportunidade de outro dono, pelo id', () => {
  let sdr: MembroDeTeste | null = null
  let c: Cenario | null = null

  test.beforeAll(async () => {
    sdr = await membroComEscopoProprio(`al${marca}`)
    const db = banco()
    const tenant = await tenantId()

    const { data: etapa } = await db.from('crm_stages').select('id')
      .eq('tenant_id', tenant).eq('outcome', 'OPEN').limit(1).single<{ id: string }>()
    const { data: admin } = await db.from('users').select('id')
      .eq('email', process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br').single<{ id: string }>()

    const fone = '5548' + String(Date.now() + 53).slice(-9)
    const { data: conv, error: erroConv } = await db.from('conversations')
      .insert({
        tenant_id: tenant, channel: 'whatsapp', status: 'open', provider: 'uazapi',
        contact_name: MEU, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
        last_message_at: new Date().toISOString(), last_message: 'oi',
      })
      .select('id').single<{ id: string }>()
    expect(erroConv, 'criar a conversa da SDR').toBeNull()

    const { data: meu, error: erroMeu } = await db.from('leads')
      .insert({
        tenant_id: tenant, name: MEU, phone: fone, crm_stage_id: etapa!.id,
        owner_id: sdr.userId, conversation_id: conv!.id,
      })
      .select('id').single<{ id: string }>()
    expect(erroMeu, 'criar a oportunidade da SDR').toBeNull()
    await db.from('conversations').update({ lead_id: meu!.id }).eq('id', conv!.id)

    const { data: alheio, error: erroAlheio } = await db.from('leads')
      .insert({
        tenant_id: tenant, name: ALHEIO, phone: '5548' + String(Date.now() + 59).slice(-9),
        crm_stage_id: etapa!.id, owner_id: admin!.id,
      })
      .select('id').single<{ id: string }>()
    expect(erroAlheio, 'criar a oportunidade do outro dono').toBeNull()

    c = { convId: conv!.id, meuLead: meu!.id, alheioLead: alheio!.id }
  })

  test.afterAll(async () => {
    const db = banco()
    if (c) {
      const { data: contatos } = await db.from('leads').select('contato_id').in('id', [c.meuLead, c.alheioLead])
      await db.from('conversations').update({ lead_id: null }).eq('id', c.convId)
      await db.from('lead_events').delete().in('lead_id', [c.meuLead, c.alheioLead])
      await db.from('leads').delete().in('id', [c.meuLead, c.alheioLead])
      await apagarConversas([c.convId])
      // A pessoa da oportunidade alheia não tem conversa: o gatilho a criou só
      // pelo telefone, e `apagarConversas` não a alcança.
      const ids = (contatos ?? []).map(x => x.contato_id as string).filter(Boolean)
      if (ids.length) await db.from('contacts').delete().in('id', ids)
    }
    if (sdr) await sdr.limpar()
  })

  test('marcar como ganha a oportunidade alheia, reenviando a chamada, não muda nada', async ({ browser }) => {
    const ctx  = await browser.newContext({ storageState: sdr!.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/inbox?c=${c!.convId}`)
      await page.waitForLoadState('networkidle')

      // A chamada legítima: a SDR marca a DELA como ganha pelo painel.
      const painel = page.locator('.inbox-painel')
      // O card da oportunidade se identifica pelo funil e pela etapa, não pelo
      // nome da pessoa (que é o cabeçalho do painel).
      await painel.getByRole('button', { name: /Funil de vendas/ }).first().click()
      const capturada = capturarAcao(page, corpo => corpo.includes(c!.meuLead))
      await painel.getByRole('button', { name: 'Ganha' }).click()
      const req = await capturada

      await expect.poll(() => outcomeDo(c!.meuLead), { message: 'o controle: a dela virou ganha' }).toBe('WON')

      // O ataque: a mesma chamada, com o id da oportunidade do admin.
      await reenviarAcao(page, req, [[c!.meuLead, c!.alheioLead]])

      expect(await outcomeDo(c!.alheioLead), 'a oportunidade de outro dono não pode mudar pelo id')
        .toBe('OPEN')
    } finally {
      await ctx.close()
    }
  })
})
