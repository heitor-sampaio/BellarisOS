import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import { resolveLeadSource, mergeTags } from '@estetica-os/utils'
import { ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { seedDefaultFunnel, listStages } from '@/lib/crm/funis'
import { registrarEventoLead, etapaAtualDoLead } from '@/lib/lead-events'
import { emitirEventoDeLead, eventoDoDesfecho, etapaDeCrm } from '@/lib/events/lead'

/**
 * CRIAR uma oportunidade e MOVER de etapa — os núcleos que o quadro (actions/
 * leads.ts) e o Copilot dividem (2026-10-08). Não conferem o módulo nem o
 * recurso (quem chama confere); conferem a rede da etapa e o "só os meus".
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * A etapa é DA REDE?
 *
 * O id da etapa vem do formulário e do arrasto do quadro. Sem esta conferência,
 * um card movido para a etapa de outra rede sumia de todos os quadros desta.
 */
export async function etapaDaRede(tenantId: string, stageId: string): Promise<boolean> {
  const etapa = await ler(createAdminClient()
    .from('crm_stages').select('id')
    .eq('id', stageId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a etapa')
  return !!etapa
}

/**
 * Lead sempre nasce com etapa.
 *
 * O fallback antigo era `crm_stage_id ?? null`, e o quadro tratava nulo como
 * "primeira coluna". Com mais de um funil esse lead apareceria na primeira
 * coluna de todos eles ao mesmo tempo — então a etapa passou a ser resolvida
 * aqui: a informada, ou a primeira do funil indicado, ou a primeira do padrão.
 */
export async function resolverEtapa(tenantId: string, crmStageId: string | null, funnelId: string | null): Promise<string | null> {
  if (crmStageId) {
    if (!(await etapaDaRede(tenantId, crmStageId))) throw new Error('Etapa não encontrada.')
    return crmStageId
  }
  const funis = await seedDefaultFunnel(tenantId)
  const alvo = funis.find(f => f.id === funnelId) ?? funis.find(f => f.is_default) ?? funis[0]
  if (!alvo) return null
  const etapas = await listStages(tenantId, alvo.id)
  return etapas[0]?.id ?? null
}

/** Os procedimentos de interesse (só os DA REDE). */
export async function salvarProcedimentosDeInteresse(admin: Admin, tenantId: string, leadId: string, procedureIds: string[]) {
  await gravar(admin.from('lead_procedures').delete().eq('lead_id', leadId), 'limpar os procedimentos de interesse')
  if (!procedureIds.length) return
  const daRede = await ler(admin.from('procedures').select('id').eq('tenant_id', tenantId).in('id', procedureIds), 'conferir os procedimentos') as { id: string }[] | null
  const validos = (daRede ?? []).map(p => p.id)
  if (validos.length) {
    await gravar(admin.from('lead_procedures').insert(validos.map(pid => ({ lead_id: leadId, procedure_id: pid }))),
      'salvar os procedimentos de interesse')
  }
}

export interface NovaOportunidade {
  nome: string
  telefone?: string | null
  email?: string | null
  social?: string | null
  origem?: string | null
  observacoes?: string | null
  crmStageId?: string | null
  funnelId?: string | null
  procedureIds?: string[]
  tags?: string[]
  fbclid?: string | null
  gclid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}

export async function criarOportunidadeCore(admin: Admin, ctx: TenantContext, o: NovaOportunidade): Promise<{ leadId: string; createdAt: string } | { error: string }> {
  const nome = o.nome?.trim()
  if (!nome) return { error: 'Nome é obrigatório.' }
  if (!o.telefone && !o.email && !o.social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

  // Origem canônica: se há atribuição, deriva; senão respeita a escolhida; sem nada -> Orgânico.
  const derived = resolveLeadSource({ fbclid: o.fbclid ?? null, gclid: o.gclid ?? null, utm_source: o.utmSource ?? null, utm_medium: o.utmMedium ?? null }, o.origem ?? null)
  const tags = mergeTags(derived.tags, o.tags ?? [])
  const etapaInicial = await resolverEtapa(ctx.tenantId!, o.crmStageId ?? null, o.funnelId ?? null)

  const { data: lead, error } = await admin.from('leads').insert({
    tenant_id: ctx.tenantId!,
    // Lead é SEMPRE da rede. A unidade é a tag `Unidade: <nome>`, dimensão
    // de métrica e recorte de tela — não fronteira de dado.
    branch_id: null,
    name: nome, phone: o.telefone ?? null, email: o.email ?? null, social_media: o.social ?? null,
    source: derived.source, notes: o.observacoes ?? null,
    crm_stage_id: etapaInicial,
    fbclid: o.fbclid ?? null, gclid: o.gclid ?? null,
    utm_source: o.utmSource ?? null, utm_medium: o.utmMedium ?? null, utm_campaign: o.utmCampaign ?? null,
    ctwa_clid: derived.ctwa_clid ?? null,
    tags,
    // Atribui o lead a quem o criou (base para KPIs por vendedor).
    owner_id: ctx.internalUserId,
  }).select('id, created_at').single()
  if (error || !lead) {
    console.error('[criarOportunidadeCore]', error?.message)
    return { error: `Erro ao criar lead: ${error?.message ?? 'desconhecido'}` }
  }

  await salvarProcedimentosDeInteresse(admin, ctx.tenantId!, lead.id as string, o.procedureIds ?? [])
  await registrarEventoLead({
    tenantId: ctx.tenantId!, leadId: lead.id as string, type: 'CREATED', toStageId: etapaInicial,
    actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
  })
  await emitirEventoDeLead(EVENTOS.LEAD_CRIADO, lead.id as string, ctx)
  return { leadId: lead.id as string, createdAt: lead.created_at as string }
}

export async function moverEtapaCore(admin: Admin, ctx: TenantContext, leadId: string, stageId: string): Promise<{ ok: true } | { error: string }> {
  if (!(await etapaDaRede(ctx.tenantId!, stageId))) return { error: 'Etapa não encontrada.' }

  // Antes do update: é a única chance de saber de onde o card saiu.
  const etapaAnterior = await etapaAtualDoLead(ctx.tenantId!, leadId)

  let q = admin.from('leads').update({ crm_stage_id: stageId }).eq('id', leadId).eq('tenant_id', ctx.tenantId!)
  const owner = ownerFilter(ctx, 'crm')
  if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)
  const { data, error } = await q.select('id')
  if (error) { console.error('[moverEtapaCore]', error.message); return { error: 'Não foi possível mover a oportunidade.' } }
  if (!data?.length) return { error: 'Oportunidade não encontrada.' }

  if (etapaAnterior !== stageId) {
    await registrarEventoLead({
      tenantId: ctx.tenantId!, leadId, type: 'STAGE_CHANGED', fromStageId: etapaAnterior, toStageId: stageId,
      actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
    })
    // A corrente de eventos, ao lado da linha do tempo do card. O movimento
    // sempre emite; chegar numa etapa de desfecho emite TAMBÉM o ganho ou o
    // perdido — ver `lib/events/lead.ts` para o porquê de serem dois.
    const de      = await etapaDeCrm(ctx.tenantId!, etapaAnterior)
    const destino = await etapaDeCrm(ctx.tenantId!, stageId)
    await emitirEventoDeLead(EVENTOS.LEAD_ETAPA_MUDOU, leadId, ctx, { deEtapaNome: de.nome })
    const evento = eventoDoDesfecho(destino.desfecho)
    if (evento) await emitirEventoDeLead(evento, leadId, ctx, { deEtapaNome: de.nome })
  }
  return { ok: true }
}
