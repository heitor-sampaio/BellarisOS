import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { temRecurso } from '@/lib/auth'
import { ler } from '@/lib/db'
import { registrarEventoLead } from '@/lib/lead-events'
import { moverEtapaCore } from '@/lib/crm/oportunidade'
import { etapaParaAgendar, type EtapaDoFunil } from '@/lib/crm/etapa-agendado'

type Admin = ReturnType<typeof createAdminClient>

export interface OportunidadeDoAgendamento { leadId: string; aberta: boolean; etapaId: string | null; funnelId: string | null }

/**
 * A oportunidade a que um agendamento se liga (D11/A12, 2026-10-27).
 *
 * Quem chama pelo card já sabe qual é (`leadIdDado`, conferido por
 * `leadAoAlcance`); quem chama pela ficha, pela agenda, pelo Copilot ou pelo
 * portal não sabe — então é a oportunidade ABERTA mais recente da cliente.
 * Fora do plano da rede (`oportunidades`) não há o que ligar.
 *
 * ⚠️ Não é "ação sobre um id vindo do navegador": o id, quando existe, já passou
 * por `leadAoAlcance`; sem ele a busca é pela cliente, que o núcleo conferiu.
 */
export async function oportunidadeDoAgendamento(
  admin: Admin, ctx: TenantContext, clientId: string, leadIdDado?: string | null,
): Promise<OportunidadeDoAgendamento | null> {
  if (!temRecurso(ctx, 'oportunidades')) return null
  let q = admin.from('leads')
    .select('id, crm_stage_id, crm_stages(funnel_id, outcome)')
    .eq('tenant_id', ctx.tenantId!)
  q = leadIdDado ? q.eq('id', leadIdDado) : q.eq('client_id', clientId)
  const linhas = (await ler(q.order('created_at', { ascending: false }).limit(20), 'buscar a oportunidade da cliente') ?? []) as unknown as {
    id: string; crm_stage_id: string | null
    crm_stages: { funnel_id: string; outcome: string } | { funnel_id: string; outcome: string }[] | null
  }[]
  const lidas = linhas.map(l => {
    const e = Array.isArray(l.crm_stages) ? l.crm_stages[0] : l.crm_stages
    return { leadId: l.id, etapaId: l.crm_stage_id, funnelId: e?.funnel_id ?? null, aberta: e?.outcome === 'OPEN' }
  })
  return (leadIdDado ? lidas[0] : lidas.find(l => l.aberta)) ?? null
}

/**
 * Depois do agendamento criado: o card vai para a etapa de agendado (a MARCA,
 * nunca o nome) e a linha do tempo diz o que aconteceu. O agendamento JÁ
 * EXISTE aqui — falha só é registrada: a tela não pode dizer "falhou" para um
 * agendamento criado.
 */
export async function ligarAgendamentoAOportunidade(
  admin: Admin, ctx: TenantContext,
  o: OportunidadeDoAgendamento,
  agendamento: { procedureId: string | null; scheduledAt: string },
): Promise<void> {
  try {
    if (o.aberta && o.funnelId && o.etapaId) {
      const etapas = (await ler(admin.from('crm_stages').select('id, position, outcome, marca')
        .eq('funnel_id', o.funnelId).eq('tenant_id', ctx.tenantId!), 'buscar as etapas do funil') ?? []) as EtapaDoFunil[]
      const destino = etapaParaAgendar(etapas, o.etapaId)
      if (destino) {
        const r = await moverEtapaCore(admin, ctx, o.leadId, destino, { semAlcance: true })
        if ('error' in r) console.error('[ligarAgendamentoAOportunidade] mover:', r.error)
      }
    }
    const proc = agendamento.procedureId
      ? await ler(admin.from('procedures').select('name').eq('id', agendamento.procedureId).maybeSingle(), 'buscar o procedimento')
      : null
    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId:      o.leadId,
      type:        'APPOINTMENT_CREATED',
      actorUserId: ctx.internalUserId,
      actorName:   ctx.userName || null,
      changes: [{
        campo: 'Agendamento',
        de:    null,
        para:  [
          (proc as { name: string } | null)?.name,
          new Date(agendamento.scheduledAt).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }),
        ].filter(Boolean).join(' · '),
      }],
    })
  } catch (e) {
    console.error('[ligarAgendamentoAOportunidade]', e instanceof Error ? e.message : e)
  }
}
