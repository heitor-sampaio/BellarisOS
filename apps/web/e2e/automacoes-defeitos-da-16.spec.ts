import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { MODELOS_DE_AUTOMACAO } from '../lib/automacoes/modelos'

/**
 * D3 da 16ª simulação (2026-11-15; princípio 3). O modelo "Lembrete antes do
 * agendamento" chegou ao sino da Rita como "Passando para lembrar do seu
 * horário de  em . Se precisar remarcar…": a hidratação do agendamento pedia
 * `users(name)`, ambíguo em `appointments` (professional_id e created_by_id,
 * PGRST201), e o erro virava agendamento nulo. Com o status nulo, o "Se ainda
 * está de pé" ("não é nenhum de Cancelado, Não compareceu, Concluído") dava
 * verdadeiro — o lembrete saía também para o agendamento CANCELADO.
 *
 * O modelo de ponta a ponta, como a rede o liga (em aviso no celular, sem
 * silêncio noturno para o teste rodar a qualquer hora): a execução retomada
 * pelo cron depois da espera. Compartilhado: chama o cron.
 */

test.setTimeout(120_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let automacao = ''
let procedimento = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`a16${marca}`)
  procedimento = (await db().from('procedures').select('name').eq('id', rede.procedureId).single<{ name: string }>()).data!.name
  const modelo = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'lembrete-antes-do-agendamento')!
  const grafo = modelo.grafo()
  for (const no of grafo.nos) {
    if (no.tipo === 'acao.mensagem') (no.config as { canal: string }).canal = 'push'
  }
  const { data, error } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Lembrete ${marca}`, status: 'ATIVA', gatilhos: ['agendamento.criado'], grafo,
    limites: { silencioDe: null, silencioAte: null, tetoPorClienteDia: null },
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  automacao = data!.id
})

test.afterAll(async () => {
  if (automacao) {
    const { data: runs } = await db().from('automation_runs').select('id').eq('automation_id', automacao)
    const ids = (runs ?? []).map(r => r.id as string)
    if (ids.length) await db().from('automation_run_steps').delete().in('run_id', ids)
    await db().from('automation_runs').delete().eq('automation_id', automacao)
    await db().from('automation_versions').delete().eq('automation_id', automacao)
    await db().from('automations').delete().eq('id', automacao)
  }
  await rede?.limpar()
})

/** Um agendamento daqui a 3 horas e a execução do lembrete, já depois da espera (o cron a retoma). */
async function lembreteDe(rotulo: string, status: 'SCHEDULED' | 'CANCELLED') {
  const cliente = await rede.criarCliente(rotulo)
  const agendadoPara = new Date(Date.now() + 3 * 3600_000).toISOString()
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 320, scheduled_at: agendadoPara,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  const { error: eRun } = await db().from('automation_runs').insert({
    tenant_id: rede.tenantId, automation_id: automacao, status: 'esperando', no_atual: 'n_lem_se',
    rodar_apos: new Date(Date.now() - 60_000).toISOString(), tentativas: 0, profundidade: 0,
    contexto: { evento: {
      id: crypto.randomUUID(), nome: 'agendamento.criado', entidade: 'agendamento', entidadeId: ag!.id,
      dados: { agendamentoId: ag!.id, clienteId: cliente, agendadoPara }, ator: null, atorTipo: 'membro', origem: 'app',
      quando: new Date().toISOString(),
    } },
  })
  expect(eRun, eRun?.message).toBeNull()
  return { cliente, agendamento: ag!.id }
}

test('D3: o lembrete sai com o procedimento e a data — e não sai para o agendamento cancelado', async ({ request }) => {
  const dePe = await lembreteDe('Rita', 'SCHEDULED')
  const cancelado = await lembreteDe('Cancelou', 'CANCELLED')

  const r = await request.get('/api/cron/automacoes', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  expect(r.ok()).toBe(true)
  await expect.poll(async () => {
    const { data } = await db().from('automation_runs').select('status').eq('automation_id', automacao)
    return (data ?? []).map(x => x.status).sort()
  }, { message: 'as duas execuções terminam', timeout: 30_000 }).toEqual(['ok', 'ok'])

  const { data: avisos } = await db().from('client_notifications').select('client_id, body')
    .in('client_id', [dePe.cliente, cancelado.cliente])
  expect((avisos ?? []).map(a => a.client_id), 'só o agendamento de pé recebe o lembrete').toEqual([dePe.cliente])
  const corpo = avisos![0]!.body as string
  expect(corpo).toContain(`horário de ${procedimento} em `)
  expect(corpo).not.toMatch(/horário de\s+em\s/)
  expect(corpo).not.toContain(' em . ')
})
