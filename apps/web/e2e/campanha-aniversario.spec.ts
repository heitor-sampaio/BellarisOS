import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { apagarClientes } from './apoio/limpeza'
import { dayKeyTZ, addDaysTZ } from '../lib/datetime'

/**
 * A campanha automática de aniversário, pelo cron de verdade.
 *
 * Até 2026-09-27 ela nunca mandou nada: o select não trazia `birth_date`, o
 * filtro lia um campo que não veio e a lista de aniversariantes saía sempre
 * vazia — um `any` escondia. E, com a coluna, `new Date('1990-09-27')` em São
 * Paulo cai no dia 26: a campanha sairia na véspera.
 *
 * Isolamento: uma unidade `[e2e]` na rede real e a campanha restrita a ela
 * (`branch_ids`). Aniversariante de verdade não recebe nada daqui.
 *
 * Chamar o cron processa as campanhas ativas de TODAS as redes — o mesmo que
 * ele faz de hora em hora sozinho.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()

test('aniversariante do dia recebe uma vez; o de amanhã não', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'CRON_SECRET não está no .env.local')

  const b = db()
  const tenant = await tenantId()
  const hoje   = dayKeyTZ(new Date())
  const amanha = dayKeyTZ(addDaysTZ(new Date(), 1))
  // O ano não importa; mês e dia são os de hoje (e amanhã) no fuso da clínica.
  const nasceu = (dia: string) => `1990-${dia.slice(5)}`

  let unidade: string | null = null
  let campanha: string | null = null
  const clientes: string[] = []
  try {
    const { data: u, error: eu } = await b.from('branches')
      .insert({ tenant_id: tenant, name: `${PREFIXO} Unidade aniversário ${marca}`, slug: `e2e-aniv-${marca}`, is_active: true })
      .select('id').single<{ id: string }>()
    expect(eu).toBeNull()
    unidade = u!.id

    // 1010 clientes da unidade que NÃO fazem aniversário hoje, criadas ANTES da
    // aniversariante (2026-10-22). O cron lia os clientes sem ordem e o
    // PostgREST devolvia só 1000: o filtro do dia, feito em JavaScript, nunca
    // via quem ficava depois — e a aniversariante não recebia nada.
    const depois = dayKeyTZ(addDaysTZ(new Date(), 2))
    for (let i = 0; i < 1010; i += 250) {
      const { data, error } = await b.from('clients').insert(Array.from({ length: Math.min(250, 1010 - i) }, (_, j) => ({
        tenant_id: tenant, branch_id: unidade, name: `${PREFIXO} Lote ${i + j} Aniversário ${marca}`,
        birth_date: nasceu(depois), is_active: true, phone: '5500' + String(Date.now() + i + j).slice(-9),
      }))).select('id')
      expect(error, 'semear o lote').toBeNull()
      clientes.push(...((data ?? []) as { id: string }[]).map(c => c.id))
    }

    for (const [rotulo, dia] of [['Hoje', hoje], ['Amanhã', amanha]] as const) {
      const { data, error } = await b.from('clients').insert({
        tenant_id: tenant, branch_id: unidade, name: `${PREFIXO} ${rotulo} Aniversário ${marca}`,
        phone: '5548' + String(Date.now() + clientes.length).slice(-9), birth_date: nasceu(dia), is_active: true,
      }).select('id').single<{ id: string }>()
      expect(error).toBeNull()
      clientes.push(data!.id)
    }

    const { data: c, error: ec } = await b.from('notification_campaigns').insert({
      tenant_id: tenant, name: `${PREFIXO} Aniversário ${marca}`, status: 'ACTIVE',
      type: 'AUTOMATED', trigger_type: 'BIRTHDAY',
      title: 'Feliz aniversário, {{first_name}}!', body: `${PREFIXO} presente ${marca}`,
      audience_rules: { branch_ids: [unidade] },
    }).select('id').single<{ id: string }>()
    expect(ec).toBeNull()
    campanha = c!.id

    const rodar = async () => {
      const r = await request.get('/api/cron/notification-campaigns', { headers: { authorization: `Bearer ${segredo}` } })
      expect(r.status()).toBe(200)
    }
    const recebidas = async (cliente: string) =>
      (await b.from('client_notifications').select('title, body').eq('client_id', cliente)
        .eq('body', `${PREFIXO} presente ${marca}`)).data ?? []

    await rodar()
    const [aniversariante, deAmanha] = clientes.slice(-2)
    expect(await recebidas(aniversariante!)).toEqual([{ title: `Feliz aniversário, ${PREFIXO}!`, body: `${PREFIXO} presente ${marca}` }])
    expect(await recebidas(deAmanha!), 'o de amanhã ainda não').toHaveLength(0)

    // Rodar de novo no mesmo dia não manda outra vez.
    await rodar()
    expect(await recebidas(aniversariante!)).toHaveLength(1)
    const { data: camp } = await b.from('notification_campaigns').select('total_sent').eq('id', campanha).single()
    expect(camp!.total_sent).toBe(1)
  } finally {
    if (campanha) await b.from('notification_campaigns').delete().eq('id', campanha)
    const falhas = []
    for (let i = 0; i < clientes.length; i += 150) falhas.push(...await apagarClientes(clientes.slice(i, i + 150)))
    if (unidade) await b.from('branches').delete().eq('id', unidade)
    expect(falhas).toEqual([])
  }
})
