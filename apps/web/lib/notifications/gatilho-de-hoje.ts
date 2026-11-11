import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { lerPublico, contarPublicoComAparelho } from '@/lib/clientes/publico'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'
import { partsInTZ, startOfDayTZ, endOfDayTZ, addDaysTZ } from '@/lib/datetime'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import type { AudienceRules, TriggerType } from '@/actions/notification-campaigns'

/**
 * QUEM o gatilho da campanha automática escolhe — a conta do cron
 * (`app/api/cron/notification-campaigns`) e do "Quem receberia hoje" do detalhe
 * da campanha, num lugar só (D10 da 12ª simulação, 2026-11-11; princípio 3: o
 * detalhe do Aniversário dizia "12 clientes no público", o público inteiro,
 * quando ninguém fazia aniversário). Só as clientes do público da campanha
 * (`filtrosDaCampanha`, no banco). Fora de `actions/`: recebe a rede pela
 * campanha, e quem chama já conferiu.
 */

export type Destinatario = { id: string; name: string }

export interface CampanhaDoGatilho {
  tenant_id:      string
  trigger_type:   TriggerType | null
  trigger_config: Record<string, unknown> | null
  audience_rules: AudienceRules | null
}

type Admin = ReturnType<typeof createAdminClient>

/** Das clientes que o FATO escolheu, só as do público da campanha (D1 da 9ª). */
export async function doPublico<T extends Destinatario>(camp: CampanhaDoGatilho, clientes: T[]): Promise<T[]> {
  if (!clientes.length) return clientes
  const doPublico = new Set((await lerPublico(camp.tenant_id, {
    ...filtrosDaCampanha(camp.audience_rules ?? {}),
    client_ids: clientes.map(c => c.id),
  })).map(c => c.id))
  return clientes.filter(c => doPublico.has(c.id))
}

function semRepetir<T extends Destinatario>(linhas: { client_id: string; clients: { name: string } | null }[], extra?: (l: never) => Partial<T>): T[] {
  const vistos = new Set<string>()
  const saida: T[] = []
  for (const l of linhas) {
    if (!l.clients || vistos.has(l.client_id)) continue
    vistos.add(l.client_id)
    saida.push({ id: l.client_id, name: l.clients.name, ...(extra ? extra(l as never) : {}) } as T)
  }
  return saida
}

/** As aniversariantes do dia (mês e dia da data gravada), do público. */
export async function aniversariantes(camp: CampanhaDoGatilho, hoje: { month: number; day: number }): Promise<Destinatario[]> {
  return (await lerPublico(camp.tenant_id, {
    ...filtrosDaCampanha(camp.audience_rules ?? {}),
    aniversario: { mes: hoje.month, dia: hoje.day },
  })).map(c => ({ id: c.id, name: c.name }))
}

/** Quem concluiu um atendimento no dia de `alvo` (o "N dias depois da visita"), do público. */
export async function concluiramNoDia(admin: Admin, camp: CampanhaDoGatilho, alvo: Date, fuso?: string): Promise<Destinatario[]> {
  const appts = await ler(admin
    .from('appointments')
    .select('client_id, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .eq('status', 'COMPLETED')
    .gte('completed_at', startOfDayTZ(alvo, fuso).toISOString())
    .lte('completed_at', endOfDayTZ(alvo, fuso).toISOString()), 'carregar os agendamentos')
  return doPublico(camp, semRepetir((appts ?? []) as unknown as { client_id: string; clients: { name: string } | null }[]))
}

/** Quem tem pacote (não cancelado) vencendo no dia de `alvo`, do público. */
export async function pacotesVencendoNoDia(admin: Admin, camp: CampanhaDoGatilho, alvo: Date, fuso?: string): Promise<Destinatario[]> {
  const pkgs = await ler(admin
    .from('client_packages')
    .select('client_id, clients!inner(id, name, tenant_id)')
    .eq('clients.tenant_id', camp.tenant_id)
    // O pacote cancelado (F2b) não vence: não há o que lembrar.
    .is('cancelado_em', null)
    .gte('expires_at', startOfDayTZ(alvo, fuso).toISOString())
    .lte('expires_at', endOfDayTZ(alvo, fuso).toISOString()), 'carregar os pacotes do cliente')
  return doPublico(camp, semRepetir((pkgs ?? []) as unknown as { client_id: string; clients: { name: string } | null }[]))
}

/** Quem tem agendamento (agendado ou confirmado) em [inicio, fim), do público — um por cliente. */
export async function agendadosNaJanela(admin: Admin, camp: CampanhaDoGatilho, inicio: Date, fim: Date): Promise<(Destinatario & { scheduled_at: string })[]> {
  const appts = await ler(admin
    .from('appointments')
    .select('client_id, scheduled_at, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .in('status', ['SCHEDULED', 'CONFIRMED'])
    .gte('scheduled_at', inicio.toISOString())
    .lt('scheduled_at', fim.toISOString()), 'carregar os agendamentos')
  return doPublico(camp, semRepetir<Destinatario & { scheduled_at: string }>(
    (appts ?? []) as unknown as { client_id: string; scheduled_at: string; clients: { name: string } | null }[],
    (l: { scheduled_at: string }) => ({ scheduled_at: l.scheduled_at }),
  ))
}

/**
 * O "Quem receberia hoje" da campanha automática: quantas o gatilho escolhe
 * HOJE e quantas delas têm o app, com a frase da tela. O lembrete do agendamento
 * conta o resto do dia (de agora ao fim de hoje, mais a antecedência) — o cron
 * passa de hora em hora. Nulo para a campanha que não é automática.
 */
export async function quemReceberiaHoje(camp: CampanhaDoGatilho, agora = new Date()): Promise<{ hoje: number; comAparelho: number; texto: string } | null> {
  const admin = createAdminClient()
  const cfg = (camp.trigger_config ?? {}) as { days?: number; hours?: number; month?: number; day?: number }
  // O relógio da clínica (F62), o mesmo do cron.
  const fuso = await fusoDaRede(camp.tenant_id)
  const p = partsInTZ(agora, fuso)
  let quem: Destinatario[]
  let ninguem: string
  let alguem: (n: number) => string
  switch (camp.trigger_type) {
    case 'BIRTHDAY':
      quem = await aniversariantes(camp, { month: p.month, day: p.day })
      ninguem = 'Hoje ninguém do público faz aniversário: a campanha não sai para ninguém hoje.'
      alguem = n => `${n} ${n === 1 ? 'aniversariante' : 'aniversariantes'} hoje`
      break
    case 'DAYS_AFTER_VISIT':
      quem = cfg.days ? await concluiramNoDia(admin, camp, addDaysTZ(agora, -cfg.days, fuso), fuso) : []
      ninguem = `Hoje ninguém do público fez ${cfg.days ?? '?'} dias de um atendimento concluído: a campanha não sai para ninguém hoje.`
      alguem = n => `${n} ${n === 1 ? 'cliente fez' : 'clientes fizeram'} ${cfg.days} dias de um atendimento concluído hoje`
      break
    case 'DAYS_BEFORE_EXPIRY':
      quem = cfg.days ? await pacotesVencendoNoDia(admin, camp, addDaysTZ(agora, cfg.days, fuso), fuso) : []
      ninguem = `Hoje ninguém do público tem pacote vencendo daqui a ${cfg.days ?? '?'} dias: a campanha não sai para ninguém hoje.`
      alguem = n => `${n} ${n === 1 ? 'cliente tem' : 'clientes têm'} pacote vencendo daqui a ${cfg.days} dias`
      break
    case 'BEFORE_APPOINTMENT': {
      const horas = cfg.hours ?? 24
      const inicio = new Date(agora.getTime() + horas * 3_600_000)
      const fim = new Date(endOfDayTZ(agora, fuso).getTime() + 1 + horas * 3_600_000)
      quem = await agendadosNaJanela(admin, camp, inicio, fim)
      ninguem = `Até o fim de hoje, ninguém do público tem agendamento ${horas} horas depois: nenhum lembrete sai hoje.`
      alguem = n => `${n} ${n === 1 ? 'lembrete sai' : 'lembretes saem'} até o fim de hoje`
      break
    }
    case 'ANNUAL_DATE': {
      const dd = (x: number | undefined) => String(x ?? 0).padStart(2, '0')
      quem = cfg.month === p.month && cfg.day === p.day ? await lerPublico(camp.tenant_id, filtrosDaCampanha(camp.audience_rules ?? {})) : []
      ninguem = `Hoje não é ${dd(cfg.day)}/${dd(cfg.month)}: a campanha não sai hoje.`
      alguem = n => `Hoje é a data: ${n} ${n === 1 ? 'cliente recebe' : 'clientes recebem'}`
      break
    }
    default:
      return null
  }
  if (!quem.length) return { hoje: 0, comAparelho: 0, texto: ninguem }
  const comAparelho = await contarPublicoComAparelho(camp.tenant_id, {
    ...filtrosDaCampanha(camp.audience_rules ?? {}), client_ids: quem.map(c => c.id),
  })
  const recebem = comAparelho === 0
    ? 'nenhuma tem o app para receber o aviso'
    : `${comAparelho} ${comAparelho === 1 ? 'vai' : 'vão'} receber o aviso no celular`
  return { hoje: quem.length, comAparelho, texto: `${alguem(quem.length)} · ${recebem}.` }
}
