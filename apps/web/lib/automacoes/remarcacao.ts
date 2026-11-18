import { createAdminClient } from '@/lib/supabase/admin'
import { NODES } from '@estetica-os/types'
import type { ConfigEsperaAte, GrafoDeAutomacao } from '@estetica-os/types'
import { caminhosDoCampo } from './condicoes'
import { hidratarParaCaminhos, type ContextoDaExecucao, type EventoDoGatilho } from './contexto'
import { quandoChegarEm } from './tempo'
import { limitesDe, vesperaSeCairNoSilencio } from './limites'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { chaveDoPasso } from './passos'
import { gravar, ler } from '@/lib/db'

/**
 * A remarcação reprograma o que espera aquele agendamento (D1 da 20ª
 * simulação, 2026-11-17; princípios 3 e 6).
 *
 * O "Lembrete antes do agendamento" espera "1 dia antes" do horário que o
 * FATO trouxe (`evento.dados.agendadoPara`, de propósito: o "Se" depois da
 * espera relê a situação). Remarcado de 23/11 para 24/11, o lembrete seguia
 * esperando até 22/11 — e, remarcado para mais cedo, sairia depois do
 * atendimento, ou nunca. Agora, a cada remarcação:
 *
 *  - toda execução que espera e fala deste agendamento passa a ter, no
 *    contexto, o horário que vale AGORA (`evento.dados.agendadoPara`): o
 *    texto e a reconferência do silêncio leem dele;
 *  - a que está parada numa espera "até uma data" (o último passo dela é o
 *    "Esperar até", esperando) tem a espera refeita com o dado de agora —
 *    "1 dia antes" do horário novo; o momento que já passou (o novo horário
 *    a menos de um dia) vira "agora", como na primeira vez (C57b), e o cron a
 *    leva na próxima passagem.
 *
 * A espera de DURAÇÃO ("30 dias depois do atendimento") não muda: ela conta
 * de quando o fluxo passou por ela, não do horário do agendamento.
 *
 * Nunca lança para quem remarcou: a remarcação já aconteceu.
 */

const RELER = ['agendamento', 'lead'] as const

type RunEsperando = {
  id: string; automation_id: string; no_atual: string | null; rodar_apos: string | null
  contexto: ContextoDaExecucao
}
type PassoGravado = { id: string; run_id: string; ordem: number; no_id: string; tipo: string; status: string; resumo: Record<string, unknown> | null }

function eventoDoContexto(contexto: ContextoDaExecucao): EventoDoGatilho {
  const e = (contexto.evento ?? {}) as Record<string, unknown>
  return {
    id:         (e.id as string) ?? '',
    nome:       (e.nome as string) ?? '',
    entidade:   (e.entidade as string) ?? '',
    entidadeId: (e.entidadeId as string) ?? null,
    dados:      (e.dados as Record<string, unknown>) ?? {},
    atorNome:   (e.ator as string) ?? null,
    atorTipo:   (e.atorTipo as string) ?? 'sistema',
    origem:     (e.origem as string) ?? 'app',
    ocorridoEm: (e.quando as string) ?? new Date().toISOString(),
    branchId:   null,
  }
}

export async function reprogramarEsperasDoAgendamento(
  tenantId: string,
  appointmentId: string,
  agora: Date = new Date(),
): Promise<number> {
  const admin = createAdminClient()

  // O agendamento tem de ser desta rede (o horário novo vem do banco, não de quem chamou).
  const ag = await ler(admin.from('appointments')
    .select('scheduled_at, branch_id, branches!inner(tenant_id)')
    .eq('id', appointmentId)
    .eq('branches.tenant_id', tenantId)
    .maybeSingle(), 'buscar o horário do agendamento remarcado') as { scheduled_at: string | null; branch_id: string | null } | null
  if (!ag?.scheduled_at) return 0

  const runs = (await ler(admin.from('automation_runs')
    .select('id, automation_id, no_atual, rodar_apos, contexto')
    .eq('tenant_id', tenantId)
    .eq('status', 'esperando')
    .eq('simulacao', false)
    .eq('contexto->evento->>entidadeId', appointmentId), 'buscar as execuções que esperam o agendamento') ?? []) as RunEsperando[]
  if (!runs.length) return 0

  const [automacoes, passos] = await Promise.all([
    ler(admin.from('automations').select('id, grafo, limites')
      .eq('tenant_id', tenantId)
      .in('id', [...new Set(runs.map(r => r.automation_id))]), 'buscar as automações das execuções'),
    ler(admin.from('automation_run_steps').select('id, run_id, ordem, no_id, tipo, status, resumo')
      .in('run_id', runs.map(r => r.id))
      .order('ordem', { ascending: false }), 'buscar o último passo das execuções'),
  ])
  const grafoDe = new Map(((automacoes ?? []) as { id: string; grafo: GrafoDeAutomacao }[]).map(a => [a.id, a.grafo]))
  const limitesDaAutomacao = new Map(((automacoes ?? []) as { id: string; limites: unknown }[]).map(a => [a.id, limitesDe(a.limites)]))
  const fuso = ag.branch_id ? await fusoDaUnidade(tenantId, ag.branch_id) : undefined
  const ultimoDe = new Map<string, PassoGravado>()
  for (const p of (passos ?? []) as PassoGravado[]) if (!ultimoDe.has(p.run_id)) ultimoDe.set(p.run_id, p)

  let reprogramadas = 0
  for (const run of runs) {
    const contexto = run.contexto ?? {}
    const dados = ((contexto.evento ?? {}) as { dados?: Record<string, unknown> }).dados
    if (dados && 'agendadoPara' in dados) dados.agendadoPara = ag.scheduled_at

    let rodarApos: string | null = null
    const ultimo = ultimoDe.get(run.id)
    const no = ultimo ? grafoDe.get(run.automation_id)?.nos.find(n => n.id === ultimo.no_id) : undefined
    if (ultimo?.status === 'esperando' && no?.tipo === NODES.ESPERA_ATE) {
      const cfg = no.config as ConfigEsperaAte
      // Lido de novo, sem o que a hidratação guardou antes (a situação de então).
      for (const k of RELER) delete contexto[k]
      await hidratarParaCaminhos(contexto, eventoDoContexto(contexto), tenantId, caminhosDoCampo(cfg.campo ?? ''))
      const r = quandoChegarEm(cfg, contexto, agora)
      // D17 ("a + c opcional"): com a opção ligada, o lembrete que cairia no
      // silêncio sai na véspera às 20:00 — também no horário novo.
      const vespera = r.data && Number(cfg.minutos ?? 0) < 0
        ? vesperaSeCairNoSilencio(limitesDaAutomacao.get(run.automation_id) ?? limitesDe(null), r.data, agora, fuso)
        : null
      rodarApos = (vespera ?? r.data ?? agora).toISOString()
      for (const k of RELER) delete contexto[k]
      const doPasso = (contexto.passos as Record<string, Record<string, unknown>> | undefined)?.[chaveDoPasso(no, grafoDe.get(run.automation_id)!)]
      if (doPasso) doPasso.ate = rodarApos
      await gravar(admin.from('automation_run_steps')
        .update({ resumo: { ...(ultimo.resumo ?? {}), ate: rodarApos, remarcado: true } })
        .eq('id', ultimo.id), 'refazer a espera no passo a passo')
    }

    await gravar(admin.from('automation_runs')
      .update({ contexto, ...(rodarApos ? { rodar_apos: rodarApos } : {}) })
      .eq('id', run.id)
      .eq('status', 'esperando'), 'reprogramar a execução do agendamento remarcado')
    if (rodarApos) reprogramadas++
  }
  return reprogramadas
}
