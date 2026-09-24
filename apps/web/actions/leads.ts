'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeadSource, mergeTags } from '@estetica-os/utils'
import { seedDefaultFunnel, listStages } from '@/actions/crm-funnels'
import {
  registrarEventoLead, etapaAtualDoLead, estadoAtualDoLead,
  diferencas, listaLegivel,
} from '@/lib/lead-events'
import { emitirEventoDeLead, eventoDoDesfecho, etapaDeCrm } from '@/lib/events/lead'
import { EVENTOS } from '@estetica-os/types'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { gravar } from '@/lib/db'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}

/**
 * Lead sempre nasce com etapa.
 *
 * O fallback antigo era `crm_stage_id ?? null`, e o quadro tratava nulo como
 * "primeira coluna". Com mais de um funil esse lead apareceria na primeira
 * coluna de todos eles ao mesmo tempo — então a etapa passou a ser resolvida
 * aqui: a informada, ou a primeira do funil indicado, ou a primeira do padrão.
 */
async function resolverEtapa(
  tenantId: string,
  crmStageId: string | null,
  funnelId: string | null,
): Promise<string | null> {
  if (crmStageId) return crmStageId

  const funis  = await seedDefaultFunnel(tenantId)
  const alvo   = funis.find(f => f.id === funnelId)
    ?? funis.find(f => f.is_default)
    ?? funis[0]
  if (!alvo) return null

  const etapas = await listStages(tenantId, alvo.id)
  return etapas[0]?.id ?? null
}

function parseStringArray(fd: FormData, key: string): string[] {
  try {
    const raw = str(fd, key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

function parseProcedureIds(fd: FormData): string[] {
  return parseStringArray(fd, 'procedure_ids')
}

/** Nomes dos procedimentos de interesse — o histórico não exibe UUID. */
async function nomesDeProcedimentos(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await admin
    .from('procedures')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) { console.error('[nomesDeProcedimentos]', error.message); return ids }
  return (data ?? []).map(p => p.name as string)
}

async function saveProcedures(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
  procedureIds: string[],
) {
  await gravar(admin.from('lead_procedures').delete().eq('lead_id', leadId), 'limpar os procedimentos de interesse')
  if (procedureIds.length > 0) {
    await gravar(admin.from('lead_procedures').insert(
      procedureIds.map(pid => ({ lead_id: leadId, procedure_id: pid })),
    ), 'salvar os procedimentos de interesse')
  }
}

// --- Criar lead ---------------------------------------------------
export async function createLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const slug       = str(formData, '_slug') ?? ''
    const crmStageId = str(formData, 'crm_stage_id')
    const funnelId   = str(formData, '_funnelId')

    const name   = str(formData, 'name')
    const phone  = str(formData, 'phone')
    const email  = str(formData, 'email')
    const social = str(formData, 'social_media')
    const source = str(formData, 'source')
    const notes  = str(formData, 'notes')
    const fbclid      = str(formData, 'fbclid')
    const gclid       = str(formData, 'gclid')
    const utmSource   = str(formData, 'utm_source')
    const utmMedium   = str(formData, 'utm_medium')
    const utmCampaign = str(formData, 'utm_campaign')
    const procedureIds = parseProcedureIds(formData)
    const manualTags   = parseStringArray(formData, 'tags')

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

    // Origem canônica: se há atribuição, deriva; senão respeita o dropdown; sem nada -> Orgânico.
    const derived = resolveLeadSource(
      { fbclid, gclid, utm_source: utmSource, utm_medium: utmMedium },
      source,
    )
    const tags = mergeTags(derived.tags, manualTags)

    const etapaInicial = await resolverEtapa(ctx.tenantId!, crmStageId, funnelId)

    const admin = createAdminClient()
    const { data: lead, error } = await admin
      .from('leads')
      .insert({
        tenant_id: ctx.tenantId!,
        // Lead é SEMPRE da rede. A unidade é a tag `Unidade: <nome>`, dimensão
        // de métrica e recorte de tela — não fronteira de dado.
        branch_id: null,
        name, phone, email, social_media: social,
        source: derived.source, notes,
        crm_stage_id: etapaInicial,
        fbclid, gclid,
        utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
        ctwa_clid: derived.ctwa_clid ?? null,
        tags,
        // Atribui o lead ao vendedor que o criou (base para KPIs por vendedor)
        owner_id: ctx.internalUserId,
      })
      .select('id, created_at')
      .single()

    if (error || !lead) {
      console.error('[createLead]', error?.message)
      return { error: `Erro ao criar lead: ${error?.message ?? 'desconhecido'}` }
    }

    await saveProcedures(admin, lead.id, procedureIds)

    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId:      lead.id,
      type:        'CREATED',
      toStageId:   etapaInicial,
      actorUserId: ctx.internalUserId,
      actorName:   ctx.userName || null,
    })

    await emitirEventoDeLead(EVENTOS.LEAD_CRIADO, lead.id as string, ctx)

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    return { success: true, leadId: lead.id as string, createdAt: lead.created_at as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Editar lead --------------------------------------------------
export async function updateLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const leadId     = str(formData, '_leadId')
    const slug       = str(formData, '_slug') ?? ''
    const crmStageId = str(formData, 'crm_stage_id')

    if (!leadId) return { error: 'Lead não identificado.' }

    const name   = str(formData, 'name')
    const phone  = str(formData, 'phone')
    const email  = str(formData, 'email')
    const social = str(formData, 'social_media')
    const source = str(formData, 'source')
    const notes  = str(formData, 'notes')
    const procedureIds = parseProcedureIds(formData)

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

    const patch: Record<string, unknown> = {
      name, phone, email, social_media: social, source, notes,
    }
    // Valor só entra quando o form mandou o campo: caller que não edita valor
    // (o quadro, por exemplo) não pode apagar o que foi negociado. Vazio é
    // NULO e não zero — zero seria "fechado por nada" e sujaria o ticket médio.
    if (formData.has('value')) {
      const bruto = str(formData, 'value')
      const numero = bruto ? Number(bruto.replace(/\./g, '').replace(',', '.')) : null
      patch.value = numero !== null && Number.isFinite(numero) ? numero : null
    }
    // Etapa só entra no patch quando o form mandou uma: gravar null aqui tirava
    // o lead de todos os quadros.
    if (crmStageId) patch.crm_stage_id = crmStageId

    // Só atualiza tags se o form as enviou (evita apagar tags de callers que não editam tags)
    const novasTags = formData.has('tags') ? parseStringArray(formData, 'tags') : null
    if (novasTags) patch.tags = novasTags

    // Retrato ANTES do update: depois já é o valor novo, e o histórico
    // registraria "de Y para Y".
    const antes = await estadoAtualDoLead(ctx.tenantId!, leadId)
    const etapaAnterior = antes?.crm_stage_id ?? null

    // Alcance "só os próprios leads" entra como filtro da própria query: sem
    // isso, o cargo não veria o lead na lista mas ainda o editaria pelo id.
    const admin = createAdminClient()
    let q = admin
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)
    const owner = ownerFilter(ctx, 'crm')
    if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)
    const { error } = await q

    if (error) {
      console.error('[updateLead]', error.message)
      return { error: `Erro ao atualizar lead: ${error.message}` }
    }

    await saveProcedures(admin, leadId, procedureIds)

    // --- Histórico ------------------------------------------------
    // Toda ação sobre o lead deixa rastro. A unidade tem evento próprio porque
    // é ela que decide em qual quadro o card aparece: como qualquer um pode
    // remarcar, o registro é o que substitui a trava.
    const autor = { actorUserId: ctx.internalUserId, actorName: ctx.userName || null }

    if (crmStageId && etapaAnterior !== crmStageId) {
      await registrarEventoLead({
        tenantId:    ctx.tenantId!,
        leadId,
        type:        'STAGE_CHANGED',
        fromStageId: etapaAnterior,
        toStageId:   crmStageId,
        ...autor,
      })
    }

    if (antes) {
      // A unidade é tag, e tag é conjunto: o lead pode ter mais de uma, ou
      // nenhuma. Ainda assim tem evento próprio, porque é a marca que diz para
      // quem o lead está endereçado — e trocá-la é o que alguém faria para
      // puxar um lead para si.
      const unidadesDepois = novasTags
        ? listaLegivel(novasTags.filter(isUnitTag).map(unitTagName))
        : antes.unidades
      if (unidadesDepois !== antes.unidades) {
        await registrarEventoLead({
          tenantId: ctx.tenantId!,
          leadId,
          type:     'UNIT_CHANGED',
          changes: [{
            campo: 'Unidade',
            de:    antes.unidades   || null,
            para:  unidadesDepois   || null,
          }],
          ...autor,
        })
      }

      const depois: Record<string, string | null> = {
        name, phone, email, social_media: social, source, notes,
        procedures: listaLegivel(await nomesDeProcedimentos(admin, ctx.tenantId!, procedureIds)),
      }
      if (novasTags) depois.tags = listaLegivel(novasTags.filter(t => !isUnitTag(t)))

      const mudou = diferencas(antes.campos, depois)
      if (mudou.length > 0) {
        await registrarEventoLead({
          tenantId: ctx.tenantId!, leadId, type: 'UPDATED', changes: mudou, ...autor,
        })
      }
    }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Mover entre colunas (drag & drop) ---------------------------
export async function updateLeadStage(leadId: string, crm_stage_id: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    // Antes do update: é a única chance de saber de onde o card saiu.
    const etapaAnterior = await etapaAtualDoLead(ctx.tenantId!, leadId)

    const admin = createAdminClient()
    let q = admin
      .from('leads')
      .update({ crm_stage_id })
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)
    const owner = ownerFilter(ctx, 'crm')
    if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)
    const { error } = await q

    // Erro aqui era descartado: o card voltava sozinho para a coluna antiga no
    // próximo refresh, sem nada dizer que o movimento não foi gravado.
    if (error) { console.error('[updateLeadStage]', error.message); return }

    if (etapaAnterior !== crm_stage_id) {
      await registrarEventoLead({
        tenantId:    ctx.tenantId!,
        leadId,
        type:        'STAGE_CHANGED',
        fromStageId: etapaAnterior,
        toStageId:   crm_stage_id,
        actorUserId: ctx.internalUserId,
        actorName:   ctx.userName || null,
      })

      // A corrente de eventos, ao lado da linha do tempo do card. O movimento
      // sempre emite; chegar numa etapa de desfecho emite TAMBÉM o ganho ou o
      // perdido — ver `lib/events/lead.ts` para o porquê de serem dois.
      const de      = await etapaDeCrm(ctx.tenantId!, etapaAnterior)
      const destino = await etapaDeCrm(ctx.tenantId!, crm_stage_id)

      await emitirEventoDeLead(EVENTOS.LEAD_ETAPA_MUDOU, leadId, ctx, { deEtapaNome: de.nome })

      const evento = eventoDoDesfecho(destino.desfecho)
      if (evento) await emitirEventoDeLead(evento, leadId, ctx, { deEtapaNome: de.nome })
    }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
  } catch (e) {
    console.error('[updateLeadStage]', e)
  }
}

// Conversão lead→cliente vive agora em `addClient` (actions/clients.ts) com `_leadId`,
// reutilizando a MESMA regra de criação de cliente (e-mail + CPF + login).

// --- Excluir lead -------------------------------------------------
export async function deleteLead(leadId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    let q = admin
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)
    const owner = ownerFilter(ctx, 'crm')
    if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)
    await q

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
  } catch (e) {
    console.error('[deleteLead]', e)
  }
}
