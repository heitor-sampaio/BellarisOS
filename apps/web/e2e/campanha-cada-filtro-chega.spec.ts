import { randomUUID } from 'node:crypto'
import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D1 da 9ª simulação (2026-11-07, ALTA): a "Reativação 60 dias" da Carolina
 * gravava `max_days_since_visit: 60`, e nem a prévia nem o disparo o passavam
 * ao banco. Ativada, ela iria a TODA cliente com aparelho — inclusive a quem
 * veio ontem —, e o "Revisar" dizia "Vieram nos últimos 60 dias".
 *
 * Aqui, cada regra que a campanha grava, uma por vez: a prévia conta só quem
 * a regra deixa, e o disparo (`activateCampaign` de uma campanha imediata)
 * manda só para elas. Rede `[e2e]` própria: o público são só as clientes
 * daqui, e nenhuma tem aparelho (o aviso fica no sino do portal).
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const DIA = 24 * 3600 * 1000
const db = () => banco()

type Nome = 'vip' | 'outraUnidade' | 'masculino' | 'fezHa100' | 'veioHa10' | 'nuncaVeioAntiga' | 'novaSemVisita' | 'comApp' | 'duasVisitas'
let f: { outra: OutraRede; membro: MembroDeTeste; segunda: string; c: Record<Nome, string> } | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`flt${marca}`)
  const { data: b2, error: eB } = await db().from('branches')
    .insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-flt2-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eB, 'a segunda unidade').toBeNull()

  const antiga = new Date(Date.now() - 200 * DIA).toISOString()
  const ficha = async (nome: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db().from('clients').insert({
      tenant_id: outra.tenantId, branch_id: outra.branchId, name: `${PREFIXO} ${nome} ${marca}`,
      phone: '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9),
      gender: 'F', created_at: antiga, ...extra,
    }).select('id').single<{ id: string }>()
    expect(error, nome).toBeNull()
    return data!.id
  }
  const c = {
    vip:             await ficha('Vip', { tags: [`VIP ${marca}`] }),
    outraUnidade:    await ficha('Outra unidade', { branch_id: b2!.id }),
    masculino:       await ficha('Masculino', { gender: 'M' }),
    fezHa100:        await ficha('Fez há 100 dias'),
    veioHa10:        await ficha('Veio há 10 dias'),
    nuncaVeioAntiga: await ficha('Nunca veio, antiga'),
    novaSemVisita:   await ficha('Nova sem visita', { created_at: new Date().toISOString() }),
    comApp:          await ficha('Com app', { auth_id: randomUUID() }),
    duasVisitas:     await ficha('Duas visitas'),
  }
  // Os atendimentos CONCLUÍDOS: quem veio há 10 dias "voltou"; a de 100 dias
  // fez o procedimento e sumiu; a de duas visitas, duas vezes há 5 dias.
  const atendimento = (cliente: string, diasAtras: number) => ({
    branch_id: outra.branchId, client_id: cliente, procedure_id: outra.procedureId,
    professional_id: outra.professionalId, status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - diasAtras * DIA).toISOString(),
  })
  const { error: eA } = await db().from('appointments').insert([
    atendimento(c.fezHa100, 100), atendimento(c.veioHa10, 10),
    atendimento(c.duasVisitas, 5), { ...atendimento(c.duasVisitas, 6) },
  ])
  expect(eA, 'os atendimentos concluídos').toBeNull()

  f = {
    outra, segunda: b2!.id, c,
    membro: await criarMembro(`flt${marca}`, {
      tenant: outra.tenantId, rotulo: 'Marketing',
      permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  // O login inventado da "Com app" não existe no Auth: sai antes da limpeza.
  expect((await db().from('clients').update({ auth_id: null }).eq('id', f.c.comApp)).error).toBeNull()
  await f.membro.limpar()
  await f.outra.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const casos: { regra: string; regras: () => Record<string, unknown>; quem: () => Nome[] }[] = [
  { regra: 'sem visita há mais de 60 dias', regras: () => ({ max_days_since_visit: 60 }),
    // Não entram: quem veio há 10 e há 5 dias, nem a cadastrada hoje.
    quem: () => ['vip', 'outraUnidade', 'masculino', 'fezHa100', 'nuncaVeioAntiga', 'comApp'] },
  { regra: 'tag', regras: () => ({ tags: [`VIP ${marca}`] }), quem: () => ['vip'] },
  // MK2 do Bloco Tags (2026-11-14): o público é da rede, sem filtro de unidade —
  // a regra de unidade gravada antes não recorta (a VIP é da outra unidade e recebe).
  { regra: 'unidade gravada antes (não recorta)', regras: () => ({ branch_ids: [f!.segunda], tags: [`VIP ${marca}`] }), quem: () => ['vip'] },
  { regra: 'sexo', regras: () => ({ genders: ['M'] }), quem: () => ['masculino'] },
  { regra: 'procedimento feito', regras: () => ({ procedure_ids: [f!.outra.procedureId] }), quem: () => ['fezHa100', 'veioHa10', 'duasVisitas'] },
  { regra: 'só quem tem o app', regras: () => ({ has_app_account: true }), quem: () => ['comApp'] },
  { regra: 'ao menos 2 visitas', regras: () => ({ min_visits: 2 }), quem: () => ['duasVisitas'] },
]

for (const caso of casos) {
  test(`D1: a regra "${caso.regra}" chega à prévia e ao disparo`, async ({ browser }) => {
    const esperadas = caso.quem().map(n => f!.c[n]).sort()
    await comoMembro(browser, async page => {
      const previa = await chamarAcao(page, 'actions/notification-campaigns.ts', 'previewAudienceCount',
        '/admin/notificacoes/nova', [caso.regras()])
      expect(previa.texto, 'a prévia conta só quem a regra deixa').toContain(`"count":${esperadas.length}`)

      const { data: camp, error } = await db().from('notification_campaigns').insert({
        tenant_id: f!.outra.tenantId, name: `${PREFIXO} Filtro ${caso.regra} ${marca}`, status: 'DRAFT',
        type: 'IMMEDIATE', title: 'Oi, {{first_name}}', body: `${PREFIXO} ${marca}`, notification_type: 'promotion',
        audience_rules: caso.regras(),
      }).select('id').single<{ id: string }>()
      expect(error, 'a campanha em rascunho').toBeNull()

      const r = await chamarAcao(page, 'actions/notification-campaigns.ts', 'activateCampaign',
        '/admin/notificacoes/nova', [camp!.id])
      expect(r.texto, 'o disparo não recusa').not.toMatch(/^\d+:\{"error":/m)

      await expect.poll(async () => {
        const { data } = await db().from('client_notifications').select('client_id').eq('data->>campaign_id', camp!.id)
        return ((data ?? []) as { client_id: string }[]).map(n => n.client_id).sort()
      }, { message: 'o disparo vai só para quem a regra deixa' }).toEqual(esperadas)
    })
  })
}
