import 'server-only'
import { after } from 'next/server'
import { z } from 'zod'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { alcancaUnidade, can, isOwnScope } from '@/lib/auth'
import { gravar, ler, lerTodas } from '@/lib/db'
import { conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { logHistory, loadApptCtx, fmtDateTime } from '@/lib/appointments/avisos'
import { notifyUser } from '@/lib/notifications/notify'
import { podeTrocarResponsavel, trocarResponsavelCore } from '@/lib/crm/responsavel'
import { quemRealizaOsProcedimentos, realiza } from '@/lib/procedimentos/quem-realiza'

/**
 * O REPASSE ao desativar um membro (H6, decisão do Heitor, 5ª simulação,
 * 2026-11-01): "os agendamentos e oportunidades de quem é desativado, no
 * momento da desativação, [dar] a opção de repassar para outra pessoa, caso a
 * caso ou todos de uma vez". Na simulação (A8) a Renata saiu com o Seu Valdir
 * agendado com ela e o Vítor com 12 oportunidades — nada avisou.
 *
 * - O que fica: os agendamentos FUTUROS em aberto (agendado ou confirmado) e
 *   as oportunidades ABERTAS (etapa de desfecho `OPEN`, ou sem etapa).
 * - O agendamento só vai para quem ATENDE na unidade dele
 *   (`provides_services`, ativo, da unidade ou da rede — a regra de
 *   `filtroDeQuemAtendeNaUnidade`) e está livre no horário (`horarioOcupado`,
 *   a conta do núcleo da agenda). Não há cadastro de "quem faz qual
 *   procedimento": quem atende na unidade faz todos (a regra do "Sem
 *   preferência"). O que conflita é avisado e fica para o caso a caso.
 * - A oportunidade vai para quem tem o CRM (Ver ou Gerenciar, ou a Admin da
 *   rede), pelo núcleo `trocarResponsavelCore` — que grava o "de → para".
 * - Repassar pede o que a tela pede para o mesmo gesto: a agenda em Gerenciar
 *   com "todos" (o "só os meus" não mexe no de outra) e `podeTrocarResponsavel`.
 *   Sem isso, a janela mostra quanto fica e não oferece o repasse.
 *
 * O app CONFERE de novo cada item na hora de gravar (a lista da tela é só
 * sugestão), e cada repasse é uma gravação completa e independente — a mesma
 * da troca de profissional da agenda. O que falhar volta como aviso, e a
 * desativação não acontece até o repasse escolhido valer (a janela recarrega).
 */

type Admin = ReturnType<typeof createAdminClient>

const ABERTOS = ['SCHEDULED', 'CONFIRMED']

export interface PessoaDoRepasse { id: string; nome: string }

export interface AgendamentoParaRepassar {
  id: string
  /** ISO. */
  quando: string
  duracaoMin: number
  cliente: string
  procedimento: string
  unidade: string
  /** Quem atende na unidade e está livre no horário. */
  livres: PessoaDoRepasse[]
  /** Quem atende na unidade, mas já tem atendimento no horário. */
  ocupadas: PessoaDoRepasse[]
}

export interface OportunidadeParaRepassar { id: string; nome: string; etapa: string | null }

export interface PendenciasDoMembro {
  nome: string
  agendamentos: AgendamentoParaRepassar[]
  podeRepassarAgendamentos: boolean
  /** Quem atende em alguma das unidades dos agendamentos (o "todos para"). */
  quemAtende: PessoaDoRepasse[]
  oportunidades: OportunidadeParaRepassar[]
  podeRepassarOportunidades: boolean
  /** Quem tem o CRM e está ativo. */
  quemTemCrm: PessoaDoRepasse[]
}

export const EntradaDoRepasse = z.object({
  agendamentos:  z.array(z.object({ id: z.string().uuid(), para: z.string().uuid() })).max(2000).default([]),
  /** `para` nulo = "Sem responsável" (volta ao bolo comum). */
  oportunidades: z.array(z.object({ id: z.string().uuid(), para: z.string().uuid().nullable() })).max(5000).default([]),
})
export type Repasse = z.infer<typeof EntradaDoRepasse>

export function podeRepassarAgendamentos(ctx: TenantContext): boolean {
  return can(ctx, 'agenda', 'MANAGE') && !isOwnScope(ctx, 'agenda')
}

interface LinhaDoAgendamento {
  id: string; scheduled_at: string; duration_min: number | null; branch_id: string; procedure_id: string | null
  clients: { name: string } | null; procedures: { name: string } | null; branches: { name: string; tenant_id: string } | null
}

/** Os agendamentos futuros em aberto do membro, nas unidades ao alcance de quem age. */
async function agendamentosDoMembro(admin: Admin, ctx: TenantContext, membroId: string): Promise<LinhaDoAgendamento[]> {
  const agora = new Date().toISOString()
  const linhas = await lerTodas((de, ate) => admin.from('appointments')
    .select('id, scheduled_at, duration_min, branch_id, procedure_id, clients(name), procedures(name), branches!inner(name, tenant_id)')
    .eq('branches.tenant_id', ctx.tenantId!)
    .eq('professional_id', membroId)
    .in('status', ABERTOS)
    .gte('scheduled_at', agora)
    .order('scheduled_at').order('id').range(de, ate), 'carregar os agendamentos do membro') as unknown as LinhaDoAgendamento[]
  return linhas.filter(a => alcancaUnidade(ctx, a.branch_id))
}

/** Quem atende (ativo, `provides_services`) na rede, menos o membro que sai. */
async function quemAtendeNaRede(admin: Admin, tenantId: string, membroId: string) {
  return ((await ler(admin.from('users').select('id, name, branch_id, atende_em')
    .eq('tenant_id', tenantId).eq('is_active', true).eq('provides_services', true).neq('id', membroId)
    .order('name'), 'carregar quem atende')) ?? []) as { id: string; name: string; branch_id: string | null; atende_em: string[] | null }[]
}

/** Quem tem o CRM (Ver ou Gerenciar, ou o cargo de sistema Admin da rede), ativo, menos o membro. */
async function quemTemCrm(admin: Admin, tenantId: string, membroId: string): Promise<PessoaDoRepasse[]> {
  const [cargosComCrm, admins, membros] = await Promise.all([
    ler(admin.from('role_permissions').select('role_id')
      .eq('tenant_id', tenantId).eq('module', 'crm').in('level', ['VIEW', 'MANAGE']), 'carregar os cargos com o CRM'),
    ler(admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN').eq('is_system', true), 'carregar o cargo de Admin da rede'),
    ler(admin.from('users').select('id, name, role_id')
      .eq('tenant_id', tenantId).eq('is_active', true).neq('id', membroId).order('name'), 'carregar a equipe'),
  ])
  const cargos = new Set([
    ...((cargosComCrm ?? []) as { role_id: string }[]).map(c => c.role_id),
    ...((admins ?? []) as { id: string }[]).map(c => c.id),
  ])
  return ((membros ?? []) as { id: string; name: string; role_id: string | null }[])
    .filter(m => m.role_id && cargos.has(m.role_id))
    .map(m => ({ id: m.id, nome: m.name }))
}

/** A mesma regra de `filtroDeQuemAtendeNaUnidade` (a unidade marcada no "Atende"), sobre a lista já lida. */
const atendeNaUnidade = (p: { atende_em: string[] | null }, unidade: string) => (p.atende_em ?? []).includes(unidade)

/** O que fica com o membro, e para quem pode ir. Não grava nada. */
export async function pendenciasDoMembro(
  admin: Admin, ctx: TenantContext, membro: { id: string; nome: string },
): Promise<PendenciasDoMembro> {
  const [ags, equipe, oportunidades, crm] = await Promise.all([
    agendamentosDoMembro(admin, ctx, membro.id),
    quemAtendeNaRede(admin, ctx.tenantId!, membro.id),
    oportunidadesAbertas(admin, ctx.tenantId!, membro.id),
    quemTemCrm(admin, ctx.tenantId!, membro.id),
  ])
  // Quem realiza cada procedimento (por-01): o repasse oferece só elas.
  const realizam = await quemRealizaOsProcedimentos(admin, ags.map(a => a.procedure_id).filter((x): x is string => !!x))

  // Os horários de quem pode receber, de uma vez (não um por par).
  const ocupados = new Map<string, { ini: number; fim: number }[]>()
  if (ags.length && equipe.length) {
    const inicio = new Date(new Date(ags[0]!.scheduled_at).getTime() - 12 * 3_600_000).toISOString()
    const ultimo = ags[ags.length - 1]!
    const fim = new Date(new Date(ultimo.scheduled_at).getTime() + (ultimo.duration_min || 60) * 60_000).toISOString()
    const agenda = await lerTodas((de, ate) => admin.from('appointments')
      .select('id, professional_id, scheduled_at, duration_min, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!)
      .in('professional_id', equipe.map(p => p.id))
      .not('status', 'in', '("CANCELLED","NO_SHOW")')
      .gte('scheduled_at', inicio).lt('scheduled_at', fim)
      .order('scheduled_at').order('id').range(de, ate), 'carregar a agenda de quem pode receber') as unknown as
      { professional_id: string; scheduled_at: string; duration_min: number | null }[]
    for (const a of agenda) {
      const ini = new Date(a.scheduled_at).getTime()
      const lista = ocupados.get(a.professional_id) ?? []
      lista.push({ ini, fim: ini + (a.duration_min || 60) * 60_000 })
      ocupados.set(a.professional_id, lista)
    }
  }

  const unidadesDosAgendamentos = new Set(ags.map(a => a.branch_id))
  return {
    nome: membro.nome,
    agendamentos: ags.map(a => {
      const ini = new Date(a.scheduled_at).getTime()
      const fim = ini + (a.duration_min || 60) * 60_000
      const daUnidade = equipe.filter(p => atendeNaUnidade(p, a.branch_id) && realiza(realizam.get(a.procedure_id ?? ''), p.id))
      const bate = (p: { id: string }) => (ocupados.get(p.id) ?? []).some(o => ini < o.fim && fim > o.ini)
      return {
        id: a.id, quando: a.scheduled_at, duracaoMin: a.duration_min || 60,
        cliente: a.clients?.name ?? 'Cliente', procedimento: a.procedures?.name ?? 'Atendimento', unidade: a.branches?.name ?? '',
        livres:   daUnidade.filter(p => !bate(p)).map(p => ({ id: p.id, nome: p.name })),
        ocupadas: daUnidade.filter(bate).map(p => ({ id: p.id, nome: p.name })),
      }
    }),
    podeRepassarAgendamentos: podeRepassarAgendamentos(ctx),
    quemAtende: equipe.filter(p => [...unidadesDosAgendamentos].some(u => atendeNaUnidade(p, u))).map(p => ({ id: p.id, nome: p.name })),
    oportunidades,
    podeRepassarOportunidades: podeTrocarResponsavel(ctx),
    quemTemCrm: crm,
  }
}

/** As oportunidades ABERTAS do membro (desfecho `OPEN` ou sem etapa). Lidas todas, em páginas. */
async function oportunidadesAbertas(admin: Admin, tenantId: string, membroId: string): Promise<OportunidadeParaRepassar[]> {
  const linhas = await lerTodas((de, ate) => admin.from('leads')
    .select('id, name, crm_stages(name, outcome)')
    .eq('tenant_id', tenantId).eq('owner_id', membroId)
    .order('created_at', { ascending: false }).order('id').range(de, ate), 'carregar as oportunidades do membro') as unknown as
    { id: string; name: string; crm_stages: { name: string; outcome: string | null } | null }[]
  return linhas
    .filter(l => !l.crm_stages || !l.crm_stages.outcome || l.crm_stages.outcome === 'OPEN')
    .map(l => ({ id: l.id, nome: l.name, etapa: l.crm_stages?.name ?? null }))
}

/**
 * Aplica o repasse escolhido, conferindo cada item de novo. Devolve as
 * falhas (texto para a tela); vazio = tudo repassado.
 */
export async function aplicarRepasse(
  admin: Admin, ctx: TenantContext, membro: { id: string; nome: string }, repasse: Repasse,
): Promise<string[]> {
  const falhas: string[] = []
  if (repasse.agendamentos.length && !podeRepassarAgendamentos(ctx)) {
    return ['Seu cargo não repassa agendamentos (pede a Agenda em Gerenciar, de todos).']
  }
  if (repasse.oportunidades.length && !podeTrocarResponsavel(ctx)) {
    return ['Seu cargo não troca o responsável das oportunidades (pede o CRM em Gerenciar, de todos).']
  }

  if (repasse.agendamentos.length) {
    const [ags, equipe] = await Promise.all([
      agendamentosDoMembro(admin, ctx, membro.id),
      quemAtendeNaRede(admin, ctx.tenantId!, membro.id),
    ])
    const porId = new Map(ags.map(a => [a.id, a]))
    const porPessoa = new Map(equipe.map(p => [p.id, p]))
    const realizam = await quemRealizaOsProcedimentos(admin, ags.map(a => a.procedure_id).filter((x): x is string => !!x))
    for (const item of repasse.agendamentos) {
      const ag = porId.get(item.id)
      if (!ag) { falhas.push('Um dos agendamentos já não é desta pessoa (ou já passou).'); continue }
      const quando = fmtDateTime(ag.scheduled_at)
      const para = porPessoa.get(item.para)
      if (!para || !atendeNaUnidade(para, ag.branch_id)) {
        falhas.push(`O agendamento de ${quando} não foi repassado: a pessoa escolhida não atende nesta unidade.`)
        continue
      }
      // Só quem REALIZA o procedimento (por-01; sem ninguém marcado, todas).
      if (!realiza(realizam.get(ag.procedure_id ?? ''), para.id)) {
        falhas.push(`O agendamento de ${quando} não foi repassado: ${para.name} não realiza este procedimento.`)
        continue
      }
      // As peças pelo núcleo da agenda (a pessoa da rede e ativa, a unidade ao alcance).
      const recusa = await conferirPecasDoAgendamento(admin, ctx, { branchId: ag.branch_id, professionalId: para.id })
      if (recusa) { falhas.push(`O agendamento de ${quando} não foi repassado: ${recusa}`); continue }
      if (await horarioOcupado(admin, {
        tenantId: ctx.tenantId!, professionalId: para.id, inicio: new Date(ag.scheduled_at),
        duracaoMin: ag.duration_min || 60, excluir: ag.id,
      })) {
        falhas.push(`O agendamento de ${quando} não foi repassado: ${para.name} já tem atendimento nesse horário.`)
        continue
      }
      // A mesma gravação da troca de profissional da agenda, conferindo que
      // ainda é do membro (outra pessoa pode ter mexido no meio).
      const trocados = await gravar(admin.from('appointments')
        .update({ professional_id: para.id })
        .eq('id', ag.id).eq('professional_id', membro.id).in('status', ABERTOS).select('id'),
      'repassar o agendamento') as { id: string }[] | null
      if (!trocados?.length) { falhas.push(`O agendamento de ${quando} mudou enquanto isso: confira na agenda.`); continue }
      await logHistory(admin, ag.id, ctx.internalUserId, ctx.userName || 'Equipe', 'REASSIGNED',
        `Repassado de ${membro.nome} para ${para.name} ao desativar ${membro.nome}`,
        { de: membro.id, new_professional_id: para.id, new_professional_name: para.name, motivo: 'desativacao' })
      after(async () => {
        const c = await loadApptCtx(admin, ag.id)
        if (!c) return
        await notifyUser(admin, para.id, {
          type: 'appointment_new', title: 'Novo agendamento',
          body: `${c.clientName} — ${c.procedureName} em ${fmtDateTime(c.scheduledAt)}.`, data: { appointment_id: ag.id },
        })
      })
    }
  }

  if (repasse.oportunidades.length) {
    const [abertas, crm] = await Promise.all([
      oportunidadesAbertas(admin, ctx.tenantId!, membro.id),
      quemTemCrm(admin, ctx.tenantId!, membro.id),
    ])
    const minhas = new Set(abertas.map(o => o.id))
    const comCrm = new Map(crm.map(p => [p.id, p]))
    for (const item of repasse.oportunidades) {
      if (!minhas.has(item.id)) { falhas.push('Uma das oportunidades já não é desta pessoa (ou já fechou).'); continue }
      if (item.para && !comCrm.has(item.para)) {
        falhas.push('Uma oportunidade não foi repassada: a pessoa escolhida não tem o CRM.')
        continue
      }
      const r = await trocarResponsavelCore(admin, ctx.tenantId!, item.id, item.para,
        { actorUserId: ctx.internalUserId, actorName: ctx.userName || null })
      if (!r.trocado && r.motivo) falhas.push(`Uma oportunidade não foi repassada: ${r.motivo}`)
    }
  }
  return falhas
}

