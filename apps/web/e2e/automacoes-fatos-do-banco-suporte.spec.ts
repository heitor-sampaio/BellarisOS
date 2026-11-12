import { test, expect } from '@playwright/test'
import { banco, PREFIXO, criarLoginDeTeste } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * C2 que sobrou da F69 (F71): durante uma sessão de suporte, só o fato cujo
 * ATOR é a sessão de suporte deixa de disparar automação. O que a equipe ou a
 * cliente faz no mesmo período dispara.
 *
 * Até a F71 o cron calava TODO fato do banco que ocorria com uma sessão de
 * suporte ativa na rede (`suporteAtivoEm`): o gatilho SQL não sabia quem
 * gravou. Agora o servidor diz ao banco (o cabeçalho `x-bellaris-suporte-sessao`
 * no cliente de serviço, só quando a requisição é da sessão de suporte), e o
 * gatilho de `domain_events` grava a marca `suporte_sessao_id` no fato — a
 * mesma que o fato do app já levava.
 *
 * Compartilhado: chama o cron (que passa por todas as redes).
 */

test.setTimeout(120_000)

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} fato do banco no suporte ${marca}`
let rede: OutraRede
let automacao = ''
let sessao = ''
let staff = ''
let loginDoStaff = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fdbs${marca}`)
  const grafo = {
    nos: [
      { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'pagamento.recebido' } },
      { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 260, y: 0 },
        config: { alvo: 'usuario', alvoId: rede.professionalId, titulo: TITULO, corpo: 'veio do banco' } },
    ],
    ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
  }
  const { data, error } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Pagamento no suporte ${marca}`, status: 'ATIVA',
    gatilhos: ['pagamento.recebido'], grafo,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  automacao = data!.id

  // Uma sessão de suporte ATIVA na rede, como o painel a deixa.
  const { data: membro } = await db().from('users').select('id, auth_id').eq('id', rede.professionalId).single<{ id: string; auth_id: string }>()
  const email = `e2e-plataforma-fdbs${marca}@bellaris.invalid`
  loginDoStaff = await criarLoginDeTeste(db(), email, 'criar o login do atendente')
  const { data: st, error: eS } = await db().from('platform_staff')
    .insert({ auth_id: loginDoStaff, name: `${PREFIXO} Atendente ${marca}`, email, papel: 'SUPORTE' })
    .select('id').single<{ id: string }>()
  expect(eS, eS?.message).toBeNull()
  staff = st!.id
  const { data: g, error: eG } = await db().from('support_grants').insert({
    tenant_id: rede.tenantId, target_user_id: membro!.id, via: 'configuracoes',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eG, eG?.message).toBeNull()
  const { data: s, error: eSe } = await db().from('support_sessions').insert({
    grant_id: g!.id, tenant_id: rede.tenantId, target_user_id: membro!.id, target_auth_id: membro!.auth_id,
    staff_id: staff, motivo: 'teste do fato do banco', includes_clinical: false, status: 'ativa',
    started_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eSe, eSe?.message).toBeNull()
  sessao = s!.id
})

test.afterAll(async () => {
  await db().from('user_notifications').delete().eq('title', TITULO)
  if (automacao) {
    const { data: runs } = await db().from('automation_runs').select('id').eq('automation_id', automacao)
    const ids = (runs ?? []).map(r => r.id as string)
    if (ids.length) await db().from('automation_run_steps').delete().in('run_id', ids)
    await db().from('automation_runs').delete().eq('automation_id', automacao)
    await db().from('automations').delete().eq('id', automacao)
  }
  await db().from('domain_events').delete().eq('tenant_id', rede.tenantId)
  if (staff) {
    await db().from('support_access_log').delete().eq('session_id', sessao)
    await db().from('support_sessions').delete().eq('staff_id', staff)
    await db().from('support_grants').delete().eq('tenant_id', rede.tenantId)
    await db().from('platform_staff').delete().eq('id', staff)
  }
  if (loginDoStaff) await db().auth.admin.deleteUser(loginDoStaff)
  await rede?.limpar()
})

const cron = (request: import('@playwright/test').APIRequestContext) =>
  request.get('/api/cron/automacoes', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })

const runsDo = async (evento: string) =>
  (await db().from('automation_runs').select('id, status').eq('automation_id', automacao).eq('evento_id', evento)).data ?? []

/** Grava o fato como o gatilho SQL grava (origem 'banco', sem ator), pelo PostgREST do cliente de serviço. */
async function fatoDoBanco(cabecalhos: Record<string, string> = {}): Promise<{ id: string; suporte_sessao_id: string | null }> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/domain_events?select=id,suporte_sessao_id`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json', Prefer: 'return=representation', ...cabecalhos,
    },
    body: JSON.stringify({
      tenant_id: rede.tenantId, branch_id: rede.branchId, nome: 'pagamento.recebido', entidade: 'pagamento',
      dados: { valor: 90, metodo: 'PIX' }, origem: 'banco', ator_tipo: 'sistema',
    }),
  })
  expect(r.status, await r.clone().text()).toBe(201)
  return ((await r.json()) as { id: string; suporte_sessao_id: string | null }[])[0]!
}

test('com a sessão de suporte aberta, o fato da EQUIPE (sem a marca do suporte) dispara a automação', async ({ request }) => {
  const ev = await fatoDoBanco()
  expect(ev.suporte_sessao_id, 'o fato da equipe não leva a marca do suporte').toBeNull()
  expect((await cron(request)).ok()).toBe(true)
  await expect.poll(async () => (await runsDo(ev.id)).length, {
    message: 'o fato de quem não é o suporte dispara, mesmo com o suporte na rede', timeout: 20_000,
  }).toBe(1)
})

test('o fato gravado pela sessão de suporte leva a marca e não dispara', async ({ request }) => {
  // O servidor diz ao banco que a requisição é da sessão de suporte: o gatilho
  // de domain_events grava a marca no fato que o gatilho SQL criou.
  const ev = await fatoDoBanco({ 'x-bellaris-suporte-sessao': sessao })
  expect(ev.suporte_sessao_id, 'o banco grava a sessão de suporte no fato').toBe(sessao)
  expect((await cron(request)).ok()).toBe(true)
  const { data: marcado } = await db().from('domain_events').select('despachado_em').eq('id', ev.id).single<{ despachado_em: string | null }>()
  expect(marcado?.despachado_em, 'o cron passou por ele').not.toBeNull()
  expect(await runsDo(ev.id), 'nada sai à paciente por causa do suporte').toHaveLength(0)
})

test('a marca só vale para uma sessão de suporte DESTA rede', async () => {
  const ev = await fatoDoBanco({ 'x-bellaris-suporte-sessao': '00000000-0000-4000-8000-000000000000' })
  expect(ev.suporte_sessao_id).toBeNull()
  const lixo = await fatoDoBanco({ 'x-bellaris-suporte-sessao': 'nao-e-uuid' })
  expect(lixo.suporte_sessao_id).toBeNull()
})
