import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import { resolveLeadSource } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { seedDefaultFunnel, listStages } from '@/lib/crm/funis'
import { registrarEventoLead, etapaAtualDoLead } from '@/lib/lead-events'
import { emitirEventoDeLead, eventoDoDesfecho, etapaDeCrm } from '@/lib/events/lead'
import { camposDaPerda, type PerdaInformada } from '@/lib/crm/motivos-perda'
import { TELEFONE_INCOMPLETO } from '@/lib/contatos/propagar'
import { pessoaDaOportunidadeNoBanco, somarTagsNaPessoa } from '@/lib/tags/da-pessoa'
import { normalizarTelefone } from '@/lib/importacao/normalizar'
import { recusaDoValorEstimado } from '@/lib/crm/valor-do-card'

/**
 * CRIAR uma oportunidade e MOVER de etapa — os núcleos que o quadro (actions/
 * leads.ts) e o Copilot dividem (2026-10-08). Não conferem o módulo nem o
 * recurso (quem chama confere); conferem a rede da etapa e da oportunidade.
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
  /** O valor estimado do card (a importação o traz; a tela edita depois). */
  valor?: number | null
  crmStageId?: string | null
  funnelId?: string | null
  procedureIds?: string[]
  /** As tags da PESSOA (crm-inbox.md §9.2.1): somadas à ficha, ou ao contato, depois de criada. */
  tags?: string[]
  fbclid?: string | null
  gclid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  /** A42 da 9ª: o dia do retorno combinado (yyyy-mm-dd) e o que fazer — o lembrete de quem tem o lead. */
  retornarEm?: string | null
  retornarObs?: string | null
}

/**
 * Opções de quem cria por fora da tela — a importação (2026-10-13):
 * `semEventos` não emite `lead.criado` (uma planilha não pode disparar mil
 * automações), `responsavelId` (já conferido por quem chama) e `clientId`.
 */
export interface OpcoesDaCriacao {
  semEventos?:    boolean
  responsavelId?: string | null
  clientId?:      string | null
  /**
   * A pessoa (contacts) da oportunidade, quando quem chama já a achou e o
   * gatilho não acharia: a linha da importação só com e-mail (D-10). Sem isto o
   * gatilho liga pela conversa ou pelo telefone, ou cria uma pessoa nova.
   */
  contatoId?:     string | null
}

export async function criarOportunidadeCore(
  admin: Admin, ctx: TenantContext, o: NovaOportunidade, opcoes: OpcoesDaCriacao = {},
): Promise<{ leadId: string; createdAt: string } | { error: string }> {
  const nome = o.nome?.trim()
  if (!nome) return { error: 'Nome é obrigatório.' }
  if (!o.telefone && !o.email && !o.social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }
  // O valor estimado que vem de quem chama (o Copilot, a importação): o negativo
  // e o que `leads.value` (numeric(12,2)) não guarda — a mesma régua da janela
  // (`lerValorEstimado`). Ia ao banco e voltava "numeric field overflow".
  const recusaDoValor = o.valor != null ? recusaDoValorEstimado(o.valor) : null
  if (recusaDoValor) return { error: recusaDoValor }
  // O telefone no formato do WhatsApp (C28, F70) — é por ele que o gatilho
  // acha a pessoa e que a próxima mensagem a encontra. Quem chama com o que a
  // pessoa DIGITOU (a tela, o Copilot) já recusou o incompleto; aqui o que não
  // se reconhece (o de fora vindo do WhatsApp, sem o "+") segue com os dígitos.
  const digitos = (o.telefone ?? '').replace(/\D/g, '')
  if (o.telefone && digitos.length < 8) return { error: TELEFONE_INCOMPLETO }
  const telefone = digitos ? (normalizarTelefone(o.telefone!) ?? digitos) : null

  // Origem canônica: se há atribuição, deriva; senão respeita a escolhida; sem nada, sem origem ("Não informado", D14).
  const derived = resolveLeadSource({ fbclid: o.fbclid ?? null, gclid: o.gclid ?? null, utm_source: o.utmSource ?? null, utm_medium: o.utmMedium ?? null }, o.origem ?? null)
  const etapaInicial = await resolverEtapa(ctx.tenantId!, o.crmStageId ?? null, o.funnelId ?? null)

  const { data: lead, error } = await admin.from('leads').insert({
    tenant_id: ctx.tenantId!,
    // Lead é SEMPRE da rede (não existe tag de unidade — H16).
    branch_id: null,
    name: nome, phone: telefone, email: o.email ?? null, social_media: o.social ?? null,
    source: derived.source, notes: o.observacoes ?? null,
    ...(o.valor !== undefined && o.valor !== null ? { value: o.valor } : {}),
    crm_stage_id: etapaInicial,
    fbclid: o.fbclid ?? null, gclid: o.gclid ?? null,
    utm_source: o.utmSource ?? null, utm_medium: o.utmMedium ?? null, utm_campaign: o.utmCampaign ?? null,
    ctwa_clid: derived.ctwa_clid ?? null,
    // Atribui o lead a quem o criou (base para KPIs por vendedor) — ou ao
    // responsável que quem chama escolheu e conferiu.
    owner_id: opcoes.responsavelId !== undefined ? opcoes.responsavelId : ctx.internalUserId,
    ...(opcoes.clientId ? { client_id: opcoes.clientId } : {}),
    ...(opcoes.contatoId ? { contato_id: opcoes.contatoId } : {}),
    ...(o.retornarEm ? { retornar_em: o.retornarEm, retornar_obs: o.retornarObs ?? null } : {}),
  }).select('id, created_at').single()
  if (error || !lead) {
    console.error('[criarOportunidadeCore]', error?.message)
    return { error: `Erro ao criar a oportunidade: ${error?.message ?? 'desconhecido'}` }
  }

  await salvarProcedimentosDeInteresse(admin, ctx.tenantId!, lead.id as string, o.procedureIds ?? [])
  // A oportunidade não tem tag própria: as marcadas ao criar vão para a PESSOA
  // dela (a ficha; sem ela, o contato que o gatilho ligou). A origem não vira
  // tag (T2 do Bloco Tags). Soma, nunca tira o que a pessoa já tinha.
  if (o.tags?.length) {
    const pessoa = await pessoaDaOportunidadeNoBanco(ctx.tenantId!, lead.id as string)
    if (pessoa) await somarTagsNaPessoa(ctx.tenantId!, pessoa, o.tags)
  }
  await registrarEventoLead({
    tenantId: ctx.tenantId!, leadId: lead.id as string, type: 'CREATED', toStageId: etapaInicial,
    actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
  })
  if (!opcoes.semEventos) await emitirEventoDeLead(EVENTOS.LEAD_CRIADO, lead.id as string, ctx)
  return { leadId: lead.id as string, createdAt: lead.created_at as string }
}

export async function moverEtapaCore(
  admin: Admin, ctx: TenantContext, leadId: string, stageId: string,
  /**
   * O motivo da perda, quando o destino é uma etapa de desfecho LOST. A TELA
   * exige (`exigirMotivo`); o Copilot e as automações movem sem ele.
   */
  opcoes: {
    perda?: PerdaInformada | null; exigirMotivo?: boolean
    /** A35 da 22ª: o movimento se registra, mas não dispara automação (a pessoa disse "Não"). */
    semDespachar?: boolean
  } = {},
): Promise<{ ok: true } | { error: string }> {
  if (!(await etapaDaRede(ctx.tenantId!, stageId))) return { error: 'Etapa não encontrada.' }

  // Antes do update: é a única chance de saber de onde o card saiu.
  const etapaAnterior = await etapaAtualDoLead(ctx.tenantId!, leadId)
  const destinoAntes = await etapaDeCrm(ctx.tenantId!, stageId)
  const perda = await camposDaPerda(admin, ctx.tenantId!, {
    desfechoDestino: destinoAntes.desfecho, perda: opcoes.perda, exigirMotivo: !!opcoes.exigirMotivo,
  })
  if ('error' in perda) return perda
  // Mover para a MESMA etapa não mexe no motivo já registrado.
  const patch = etapaAnterior === stageId ? { crm_stage_id: stageId } : { crm_stage_id: stageId, ...perda.patch }

  const { data, error } = await admin.from('leads').update(patch)
    .eq('id', leadId).eq('tenant_id', ctx.tenantId!).select('id')
  if (error) { console.error('[moverEtapaCore]', error.message); return { error: 'Não foi possível mover a oportunidade.' } }
  if (!data?.length) return { error: 'Oportunidade não encontrada.' }

  if (etapaAnterior !== stageId) {
    await registrarEventoLead({
      tenantId: ctx.tenantId!, leadId, type: 'STAGE_CHANGED', fromStageId: etapaAnterior, toStageId: stageId,
      actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
      changes: perda.mudanca ? [perda.mudanca] : null,
    })
    // A corrente de eventos, ao lado da linha do tempo do card. O movimento
    // sempre emite; chegar numa etapa de desfecho emite TAMBÉM o ganho ou o
    // perdido — ver `lib/events/lead.ts` para o porquê de serem dois.
    const de      = await etapaDeCrm(ctx.tenantId!, etapaAnterior)
    const destino = await etapaDeCrm(ctx.tenantId!, stageId)
    const semDespachar = !!opcoes.semDespachar
    await emitirEventoDeLead(EVENTOS.LEAD_ETAPA_MUDOU, leadId, ctx, { deEtapaNome: de.nome, semDespachar })
    const evento = eventoDoDesfecho(destino.desfecho)
    if (evento) await emitirEventoDeLead(evento, leadId, ctx, { deEtapaNome: de.nome, semDespachar })
  }
  return { ok: true }
}
