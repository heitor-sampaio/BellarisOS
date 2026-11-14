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
 * Isolamento: uma unidade `[e2e]` na rede real, e as fichas daqui com uma tag
 * própria, a que a campanha mira (`tags`). Aniversariante de verdade não
 * recebe nada daqui. (Até 2026-11-14 era o filtro de unidade, `branch_ids`,
 * que saiu do público — MK2 do Bloco Tags.)
 *
 * Chamar o cron processa as campanhas ativas de TODAS as redes — o mesmo que
 * ele faz de hora em hora sozinho.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const TAG_DO_TESTE = `${PREFIXO} aniversário ${marca}`
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
        birth_date: nasceu(depois), is_active: true, phone: '5500' + String(Date.now() + i + j).slice(-9), tags: [TAG_DO_TESTE],
      }))).select('id')
      expect(error, 'semear o lote').toBeNull()
      clientes.push(...((data ?? []) as { id: string }[]).map(c => c.id))
    }

    for (const [rotulo, dia] of [['Hoje', hoje], ['Amanhã', amanha]] as const) {
      const { data, error } = await b.from('clients').insert({
        tenant_id: tenant, branch_id: unidade, name: `${PREFIXO} ${rotulo} Aniversário ${marca}`,
        phone: '5548' + String(Date.now() + clientes.length).slice(-9), birth_date: nasceu(dia), is_active: true, tags: [TAG_DO_TESTE],
      }).select('id').single<{ id: string }>()
      expect(error).toBeNull()
      clientes.push(data!.id)
    }

    const { data: c, error: ec } = await b.from('notification_campaigns').insert({
      tenant_id: tenant, name: `${PREFIXO} Aniversário ${marca}`, status: 'ACTIVE',
      type: 'AUTOMATED', trigger_type: 'BIRTHDAY',
      title: 'Feliz aniversário, {{first_name}}!', body: `${PREFIXO} presente ${marca}`,
      audience_rules: { tags: [TAG_DO_TESTE] },
    }).select('id').single<{ id: string }>()
    expect(ec).toBeNull()
    campanha = c!.id

    const rodar = async () => {
      const r = await request.get('/api/cron/notification-campaigns?hora=12', { headers: { authorization: `Bearer ${segredo}` } })
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

/**
 * D1 da 9ª simulação (2026-11-07): as campanhas AUTOMÁTICAS também ignoravam
 * o público — o aniversário só lia a unidade e o "só quem tem o app" (a tag,
 * o sexo, o procedimento e o "sem visita" ficavam de fora), e o "dias depois
 * da visita" e o "antes do agendamento" não liam regra nenhuma. Aqui, a tag
 * VIP nas três: só a VIP recebe. Rede `[e2e]` própria.
 */
test('D1: as campanhas automáticas mandam só para o público escolhido', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'CRON_SECRET não está no .env.local')
  const { criarOutraRede } = await import('./apoio/outra-rede')
  const b = db()
  const rede = await criarOutraRede(`anvd1${marca}`)
  try {
    const hoje = dayKeyTZ(new Date())
    const tag = `VIP ${marca}`
    const ficha = async (nome: string, tags: string[]) => {
      const { data, error } = await b.from('clients').insert({
        tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} ${nome} ${marca}`,
        phone: '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9),
        birth_date: `1990-${hoje.slice(5)}`, tags,
      }).select('id').single<{ id: string }>()
      expect(error, nome).toBeNull()
      return data!.id
    }
    const vip = await ficha('Vip', [tag])
    const comum = await ficha('Comum', [])
    // As duas foram atendidas há 3 dias e têm horário daqui a 24 h e meia.
    const ha3 = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    const em24 = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString()
    for (const cliente of [vip, comum]) {
      const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId,
        professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 30, price: 0 }
      const { error } = await b.from('appointments').insert([
        { ...base, status: 'COMPLETED', scheduled_at: ha3, completed_at: ha3 },
        { ...base, status: 'SCHEDULED', scheduled_at: em24 },
      ])
      expect(error, 'os atendimentos').toBeNull()
    }
    const campanhas: Record<string, string> = {}
    for (const [gatilho, config] of [['BIRTHDAY', null], ['DAYS_AFTER_VISIT', { days: 3 }], ['BEFORE_APPOINTMENT', { hours: 24 }]] as const) {
      const { data, error } = await b.from('notification_campaigns').insert({
        tenant_id: rede.tenantId, name: `${PREFIXO} D1 ${gatilho} ${marca}`, status: 'ACTIVE',
        type: 'AUTOMATED', trigger_type: gatilho, trigger_config: config,
        title: 'Oi, {{first_name}}', body: `${PREFIXO} D1 ${gatilho} ${marca}`, audience_rules: { tags: [tag] },
      }).select('id').single<{ id: string }>()
      expect(error, gatilho).toBeNull()
      campanhas[gatilho] = data!.id
    }
    const r = await request.get('/api/cron/notification-campaigns?hora=12', { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.status()).toBe(200)
    for (const [gatilho, id] of Object.entries(campanhas)) {
      const { data } = await b.from('client_notifications').select('client_id').eq('data->>campaign_id', id)
      expect(((data ?? []) as { client_id: string }[]).map(n => n.client_id), `${gatilho}: só a VIP`).toEqual([vip])
    }
  } finally {
    await rede.limpar()
  }
})
