import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * C2 do levantamento das regras (F69, ALTA): os fatos que nascem NO BANCO
 * (`origem = 'banco'`: pagamento recebido e estornado, estoque, comissão
 * liberada e paga, termo emitido, pontos ganhos) não disparavam automação
 * nenhuma. Os gatilhos SQL gravavam em `domain_events`, mas só o
 * `emitirEvento` do TS criava execução, e nenhum cron lia os fatos novos. A
 * clínica montava "Pagamento recebido → avisar", o ensaio passava, ela ligava,
 * e nada saía.
 *
 * Agora o cron de 5 minutos despacha os fatos do banco ainda não despachados,
 * reivindicando a linha (`despachado_em`): duas passagens juntas criam UMA
 * execução. Compartilhado: chama o cron (que passa por todas as redes).
 */

test.setTimeout(120_000)

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} pagamento do banco ${marca}`
let rede: OutraRede
let automacao = ''
let membro = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fdb${marca}`)
  membro = rede.professionalId
  const grafo = {
    nos: [
      { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'pagamento.recebido' } },
      { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 260, y: 0 },
        config: { alvo: 'usuario', alvoId: membro, titulo: TITULO, corpo: 'veio do banco' } },
    ],
    ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
  }
  const { data, error } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Pagamento recebido ${marca}`, status: 'ATIVA',
    gatilhos: ['pagamento.recebido'], grafo,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  automacao = data!.id
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
  await rede?.limpar()
})

test('o fato gravado pelo banco dispara a automação, uma vez só, com duas passagens do cron juntas', async ({ request }) => {
  // O fato como o gatilho SQL o grava: origem 'banco', sem ator.
  const { data: ev, error } = await db().from('domain_events').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, nome: 'pagamento.recebido', entidade: 'pagamento',
    dados: { valor: 150, metodo: 'PIX' }, origem: 'banco', ator_tipo: 'sistema',
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()

  const cron = () => request.get('/api/cron/automacoes', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  const [a, b] = await Promise.all([cron(), cron()])
  expect(a.ok() && b.ok(), 'as duas passagens respondem').toBe(true)

  const runs = async () => (await db().from('automation_runs').select('id, status').eq('automation_id', automacao).eq('evento_id', ev!.id)).data ?? []
  await expect.poll(async () => (await runs()).length, { message: 'o cron cria a execução do fato do banco', timeout: 20_000 }).toBe(1)
  await expect.poll(async () => (await runs())[0]?.status, { timeout: 20_000 }).toBe('ok')

  const { data: avisos } = await db().from('user_notifications').select('id').eq('title', TITULO)
  expect(avisos ?? [], 'a equipe é avisada UMA vez').toHaveLength(1)

  const { data: marcado } = await db().from('domain_events').select('despachado_em').eq('id', ev!.id).single<{ despachado_em: string | null }>()
  expect(marcado?.despachado_em, 'o fato fica marcado como despachado').not.toBeNull()

  // Uma terceira passagem não despacha de novo.
  expect((await cron()).ok()).toBe(true)
  expect(await runs()).toHaveLength(1)
})

test('o fato do app não passa pelo cron (já foi despachado na hora)', async ({ request }) => {
  const { data: ev, error } = await db().from('domain_events').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, nome: 'pagamento.recebido', entidade: 'pagamento',
    dados: { valor: 10 }, origem: 'app', ator_tipo: 'sistema',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await request.get('/api/cron/automacoes', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).ok()).toBe(true)
  const { data } = await db().from('automation_runs').select('id').eq('evento_id', ev!.id)
  expect(data ?? []).toHaveLength(0)
})
