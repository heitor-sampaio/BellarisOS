'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, ownerFilter, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  registrarEventoLead, estadoAtualDoLead,
  diferencas, listaLegivel,
} from '@/lib/lead-events'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { ler } from '@/lib/db'
import { criarOportunidadeCore, etapaDaRede, moverEtapaCore, salvarProcedimentosDeInteresse } from '@/lib/crm/oportunidade'
import { propagarDadosDaPessoa, digitosDoTelefone } from '@/lib/contatos/propagar'
import { podeTrocarResponsavel, trocarResponsavelCore } from '@/lib/crm/responsavel'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
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

/**
 * O responsável escolhido no form: `undefined` quando o campo não veio (quem
 * não pode trocar nem o recebe), `null` para "Sem responsável".
 */
function responsavelDoForm(fd: FormData): string | null | undefined {
  if (!fd.has('owner_id')) return undefined
  return str(fd, 'owner_id')
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

// --- Criar lead ---------------------------------------------------
export async function createLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
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

    // O núcleo (lib/crm/oportunidade.ts) é o mesmo do Copilot.
    const r = await criarOportunidadeCore(createAdminClient(), ctx, {
      nome: name, telefone: phone, email, social, origem: source, observacoes: notes,
      crmStageId, funnelId, procedureIds, tags: manualTags,
      fbclid, gclid, utmSource, utmMedium, utmCampaign,
    })
    if ('error' in r) return { error: r.error }
    const lead = { id: r.leadId, created_at: r.createdAt }

    // O lead nasce de quem o criou; outro responsável escolhido no form troca
    // em seguida (e a linha do tempo diz de quem para quem). Quem não pode
    // trocar não muda nada, mesmo que o campo venha.
    const responsavel = responsavelDoForm(formData)
    if (responsavel !== undefined && podeTrocarResponsavel(ctx)) {
      const t = await trocarResponsavelCore(createAdminClient(), ctx.tenantId!, r.leadId, responsavel, {
        actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
      })
      if (!t.trocado && t.motivo) return { error: `Lead criado, mas o responsável não mudou: ${t.motivo}` }
    }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    return { success: true, leadId: lead.id as string, createdAt: lead.created_at as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Responsável ----------------------------------------------------
/**
 * Quem pode ser responsável por uma oportunidade (os membros ATIVOS da rede),
 * e se quem pergunta pode trocar. O modal busca ao abrir; quem não pode trocar
 * recebe a lista vazia — vê só o nome que já está no card.
 */
export async function responsaveisParaOportunidade(): Promise<{
  pode: boolean; eu: string | null; pessoas: { id: string; name: string }[]
}> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'crm', 'VIEW')
  const pode = podeTrocarResponsavel(ctx)
  if (!pode) return { pode, eu: ctx.internalUserId ?? null, pessoas: [] }
  const pessoas = await ler(createAdminClient()
    .from('users').select('id, name')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true)
    .order('name'), 'listar os responsáveis') as { id: string; name: string }[] | null
  return { pode, eu: ctx.internalUserId ?? null, pessoas: pessoas ?? [] }
}

// --- Editar lead --------------------------------------------------
export async function updateLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
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
    if (crmStageId) {
      if (!(await etapaDaRede(ctx.tenantId!, crmStageId))) return { error: 'Etapa não encontrada.' }
      patch.crm_stage_id = crmStageId
    }

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

    await salvarProcedimentosDeInteresse(admin, ctx.tenantId!, leadId, procedureIds)

    // Nome e telefone do card são cópia da PESSOA: a pessoa, as conversas e as
    // outras oportunidades dela acompanham (`propagarDadosDaPessoa`). Até
    // 2026-09-28 corrigir o nome aqui mudava só este card.
    if (antes) {
      const mudouNome = (name ?? null) !== (antes.campos.name ?? null)
      const mudouFone = digitosDoTelefone(phone) !== digitosDoTelefone(antes.campos.phone)
      if (mudouNome || mudouFone) {
        const dono = await ler(admin.from('leads').select('contato_id')
          .eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a pessoa do lead')
        const contatoId = (dono as { contato_id: string | null } | null)?.contato_id
        if (contatoId) {
          await propagarDadosDaPessoa(admin, ctx, contatoId, {
            nome:             mudouNome ? name : undefined,
            telefone:         mudouFone ? phone : undefined,
            telefoneAnterior: antes.campos.phone ?? null,
          }, { excetoLead: leadId })
        }
      }
    }

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

    // O responsável: só quem tem o CRM em Gerenciar com escopo "todos"
    // (`podeTrocarResponsavel`). O núcleo confere a rede e se a pessoa está
    // ativa, e grava de quem para quem.
    const responsavel = responsavelDoForm(formData)
    if (responsavel !== undefined && podeTrocarResponsavel(ctx)) {
      const t = await trocarResponsavelCore(admin, ctx.tenantId!, leadId, responsavel, autor)
      if (!t.trocado && t.motivo) return { error: t.motivo }
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
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')

    // O núcleo (lib/crm/oportunidade.ts) é o mesmo do Copilot.
    const r = await moverEtapaCore(createAdminClient(), ctx, leadId, crm_stage_id)
    if ('error' in r) { console.error('[updateLeadStage]', r.error); return }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
  } catch (e) {
    console.error('[updateLeadStage]', e)
  }
}

// Conversão lead→cliente vive agora em `addClient` (actions/clients.ts) com `_leadId`,
// reutilizando a MESMA regra de criação de cliente (e-mail + CPF + login).

// Excluir lead não existe (decisão do Heitor, 2026-09-28): levava junto o
// histórico (`lead_events` em cascata). A oportunidade que não vai adiante é
// marcada como perdida, não apagada.
