'use server'

import { camposDaPerda } from '@/lib/crm/motivos-perda'
import { etapaDeCrm, eventoDoDesfecho, emitirEventoDeLead } from '@/lib/events/lead'
import type { LeadChange } from '@/lib/lead-events'
import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, ownerFilter, assertRecurso, can, temRecurso } from '@/lib/auth'
import { recusaDaConfigDaRede } from '@/lib/configuracao-da-rede'
import { EVENTOS } from '@estetica-os/types'
import { fichasDoTelefoneDoLead, respostaDaFichaDoTelefone } from '@/lib/crm/ficha-do-telefone'
import { diaDoRetorno } from '@/lib/crm/retorno'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  registrarEventoLead, estadoAtualDoLead,
  diferencas, listaLegivel,
} from '@/lib/lead-events'
import { parseDinheiro } from '@estetica-os/utils'
import { ler, lerTodas, mensagemDoErro } from '@/lib/db'
import { criarOportunidadeCore, etapaDaRede, moverEtapaCore, salvarProcedimentosDeInteresse } from '@/lib/crm/oportunidade'
import { pessoaDoNovoLeadValida } from '@/lib/crm/pessoa-para-novo-lead'
import { propagarDadosDaPessoa, digitosDoTelefone, telefoneParaGravar } from '@/lib/contatos/propagar'
import { leadAoAlcance } from '@/lib/crm/alcance'
import {
  automacoesQueOMovimentoDispara, COLUNAS_DO_CARD_PARA_PREVER, type CardParaPrever,
} from '@/lib/crm/automacoes-do-movimento'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { tagsDoVocabulario } from '@/lib/tags/escolha'
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
  const escolhido = str(fd, 'owner_id')
  // D1 da 11ª: o VAZIO só tira o responsável quando a tela mostrou o campo
  // (`_responsavelNaTela`). O de uma tela que não o mostrou (a página de um
  // deploy anterior, o select que ainda não tinha o valor) não troca quem
  // está — era assim que 4 de 6 leads nasceram sem ninguém.
  if (escolhido === null && !fd.has('_responsavelNaTela')) return undefined
  return escolhido
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
    // D7 da 18ª: a oportunidade nova marca só tags do vocabulário da rede.
    const pedidas      = parseStringArray(formData, 'tags')
    const manualTags   = pedidas.length ? tagsDoVocabulario(pedidas, await tagsAtivasDaRede(ctx.tenantId!), []) : []

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }
    // O incompleto é recusado já aqui (C28, F70): o núcleo grava no formato do WhatsApp.
    if (phone) {
      const t = telefoneParaGravar(phone)
      if ('error' in t) return { error: t.error }
    }

    // A pessoa do CRM que a busca universal mandou (A15): a oportunidade nasce
    // dela — a só com e-mail não seria achada pelo gatilho (criaria outra
    // pessoa). O id vem do navegador: é da rede e ainda sem oportunidade.
    const contatoId = str(formData, '_contatoId')
    if (contatoId && !(await pessoaDoNovoLeadValida(ctx.tenantId!, contatoId))) {
      return { error: 'Pessoa não encontrada, ou ela já tem oportunidade.' }
    }

    // D11 da 9ª: o telefone de uma CLIENTE pergunta "É a mesma pessoa?" antes
    // de gravar; o "Sim" liga a oportunidade à ficha. A pessoa que veio da
    // busca (`_contatoId`) já disse quem é.
    let clientId: string | null = null
    if (phone && !contatoId) {
      const fichas = await fichasDoTelefoneDoLead(ctx.tenantId!, phone)
      const resposta = respostaDaFichaDoTelefone(str(formData, '_fichaDoTelefone'))
      if (fichas.length && !resposta) {
        const quem = can(ctx, 'clients', 'VIEW') ? `da ficha de ${fichas[0]!.nome}` : 'de uma cliente da rede'
        return { error: `Responda antes de criar: este telefone é ${quem}. É a mesma pessoa? (logo abaixo do telefone)` }
      }
      if (resposta && 'mesma' in resposta) {
        if (!fichas.some(f => f.id === resposta.mesma)) return { error: 'A ficha deste telefone não foi encontrada. Confira o telefone.' }
        clientId = resposta.mesma
      }
    }

    // O núcleo (lib/crm/oportunidade.ts) é o mesmo do Copilot.
    const r = await criarOportunidadeCore(createAdminClient(), ctx, {
      nome: name, telefone: phone, email, social, origem: source, observacoes: notes,
      crmStageId, funnelId, procedureIds, tags: manualTags,
      fbclid, gclid, utmSource, utmMedium, utmCampaign,
      retornarEm: diaDoRetorno(str(formData, 'retornar_em')), retornarObs: str(formData, 'retornar_obs'),
    }, contatoId || clientId ? { ...(contatoId ? { contatoId } : {}), ...(clientId ? { clientId } : {}) } : undefined)
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
      if (!t.trocado && t.motivo) return { error: `Oportunidade criada, mas o responsável não mudou: ${t.motivo}` }
    }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    return { success: true, leadId: lead.id as string, createdAt: lead.created_at as string }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * D11 da 9ª: as fichas da clínica com o telefone que se digita no "Novo
 * lead" — a janela pergunta "É a mesma pessoa?" junto ao telefone, antes do
 * clique. Só lê. O nome da ficha vai a quem vê Clientes; aos outros, "uma
 * cliente da clínica".
 */
export async function fichaDoTelefoneDoLead(telefone: string): Promise<{ fichas: { id: string; nome: string | null }[] }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'crm', 'MANAGE')
  const fichas = await fichasDoTelefoneDoLead(ctx.tenantId!, telefone)
  const veNome = can(ctx, 'clients', 'VIEW')
  return { fichas: fichas.map(f => ({ id: f.id, nome: veNome ? f.nome : null })) }
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
    // A35 da 22ª: a resposta à pergunta das automações ("Não" move sem disparar).
    const disparar = str(formData, '_disparar') !== 'nao'

    if (!leadId) return { error: 'Oportunidade não identificada.' }
    // C27 (F70): o alcance ANTES de tudo. O filtro do dono no update segurava
    // só a linha do card; o resto — o nome e o telefone da PESSOA, as
    // conversas, os procedimentos de interesse, a linha do tempo — rodava mesmo
    // assim com o id do card de outra pessoa.
    if (!(await leadAoAlcance(createAdminClient(), ctx, leadId))) return { error: 'Oportunidade não encontrada.' }

    const name   = str(formData, 'name')
    let   phone  = str(formData, 'phone')
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
      // A regra de todo campo de dinheiro (D3): "180.50" lia R$ 18.050,00.
      const numero = bruto ? parseDinheiro(bruto) : null
      patch.value = numero !== null && Number.isFinite(numero) ? numero : null
    }
    // Etapa só entra no patch quando o form mandou uma: gravar null aqui tirava
    // o lead de todos os quadros.
    if (crmStageId) {
      if (!(await etapaDaRede(ctx.tenantId!, crmStageId))) return { error: 'Etapa não encontrada.' }
      patch.crm_stage_id = crmStageId
    }

    // Só atualiza tags se o form as enviou (evita apagar tags de callers que não editam tags)
    // D7 da 18ª: só as do vocabulário da rede (e as que o card já tinha) —
    // a tag nova seria criada pelo gatilho, e criar tag é de Configurações → Tags (H7).
    let novasTags = formData.has('tags') ? parseStringArray(formData, 'tags') : null
    if (novasTags) {
      const [vocabulario, atual] = await Promise.all([
        tagsAtivasDaRede(ctx.tenantId!),
        ler(createAdminClient().from('leads').select('tags').eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
          'ler as tags da oportunidade') as Promise<{ tags: string[] | null } | null>,
      ])
      novasTags = tagsDoVocabulario(novasTags, vocabulario, atual?.tags ?? [])
      patch.tags = novasTags
    }

    // A42 da 9ª: o lembrete de retorno (o dia e o que fazer), só quando o form
    // o mandou. Trocar o dia zera o aviso — o novo dia avisa de novo.
    if (formData.has('retornar_em')) {
      const dia = diaDoRetorno(str(formData, 'retornar_em'))
      patch.retornar_em = dia
      patch.retornar_obs = dia ? str(formData, 'retornar_obs') : null
      const atual = await ler(createAdminClient().from('leads').select('retornar_em')
        .eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler o retorno da oportunidade') as { retornar_em: string | null } | null
      if ((atual?.retornar_em ?? null) !== dia) patch.retorno_avisado_em = null
    }

    // Retrato ANTES do update: depois já é o valor novo, e o histórico
    // registraria "de Y para Y".
    const antes = await estadoAtualDoLead(ctx.tenantId!, leadId)
    const etapaAnterior = antes?.crm_stage_id ?? null

    // O modal mostra o telefone com a máscara (J-19): "(41) 99200-0040" é o
    // MESMO número que o "5541992000040" do WhatsApp gravado. Salvar sem mexer
    // não troca o número (nem propaga, nem vira "mudou" no histórico).
    // Outro número entra no formato do WhatsApp (55 + DDD + número), e o
    // incompleto é recusado (C28, F70): "48998761234" não achava a pessoa
    // quando a próxima mensagem chegava como "5548998761234".
    {
      const t = telefoneParaGravar(phone, antes?.campos.phone ?? null)
      if ('error' in t) return { error: t.error }
      phone = t.fone
      patch.phone = phone
    }

    // Mudou de etapa pelo modal: a perdida pede o motivo (2026-10-21), e sair
    // dela limpa o motivo — a mesma regra do quadro (camposDaPerda).
    let mudancaDaPerda: LeadChange | null = null
    if (crmStageId && crmStageId !== etapaAnterior) {
      const destino = await etapaDeCrm(ctx.tenantId!, crmStageId)
      const motivoId = str(formData, 'motivo_perda_id')
      const perda = await camposDaPerda(createAdminClient(), ctx.tenantId!, {
        desfechoDestino: destino.desfecho, exigirMotivo: true,
        perda: motivoId ? { motivoId, obs: str(formData, 'motivo_perda_obs') } : null,
      })
      if ('error' in perda) return { error: perda.error }
      Object.assign(patch, perda.patch)
      mudancaDaPerda = perda.mudanca
    }

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
    const { data: gravadas, error } = await q.select('id')

    if (error) {
      console.error('[updateLead]', error.message)
      return { error: `Erro ao atualizar a oportunidade: ${error.message}` }
    }
    // Nenhuma linha = fora do alcance (ou apagada no meio): nada do resto roda.
    if (!gravadas?.length) return { error: 'Oportunidade não encontrada.' }

    await salvarProcedimentosDeInteresse(admin, ctx.tenantId!, leadId, procedureIds)

    // Nome e telefone do card são cópia da PESSOA: a pessoa, as conversas e as
    // outras oportunidades dela acompanham (`propagarDadosDaPessoa`). Até
    // 2026-09-28 corrigir o nome aqui mudava só este card.
    if (antes) {
      const mudouNome = (name ?? null) !== (antes.campos.name ?? null)
      const mudouFone = digitosDoTelefone(phone) !== digitosDoTelefone(antes.campos.phone)
      if (mudouNome || mudouFone) {
        const dono = await ler(admin.from('leads').select('contato_id')
          .eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a pessoa da oportunidade')
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
        changes:     mudancaDaPerda ? [mudancaDaPerda] : null,
      })
      // A35 da 22ª (o Heitor, 2026-11-18): mudar a etapa pelo modal é mover o
      // card como no quadro — os mesmos eventos (não emitia nenhum: a
      // automação de "entrou na etapa" não via o card movido por aqui), e o
      // "Não" da pergunta move sem disparar.
      const de = await etapaDeCrm(ctx.tenantId!, etapaAnterior)
      const destino = await etapaDeCrm(ctx.tenantId!, crmStageId)
      await emitirEventoDeLead(EVENTOS.LEAD_ETAPA_MUDOU, leadId, ctx, { deEtapaNome: de.nome, semDespachar: !disparar })
      const evento = eventoDoDesfecho(destino.desfecho)
      if (evento) await emitirEventoDeLead(evento, leadId, ctx, { deEtapaNome: de.nome, semDespachar: !disparar })
    }

    if (antes) {
      const depois: Record<string, string | null> = {
        name, phone, email, social_media: social, source, notes,
        procedures: listaLegivel(await nomesDeProcedimentos(admin, ctx.tenantId!, procedureIds)),
      }
      // A "Unidade: X" é uma tag como as outras (H16): sem evento próprio.
      if (novasTags) depois.tags = listaLegivel(novasTags)

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
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Mover entre colunas (drag & drop) ---------------------------
export async function updateLeadStage(
  leadId: string, crm_stage_id: string, slug: string,
  /** Levando à etapa perdida, o motivo (a tela exige — 2026-10-21). */
  perda?: { motivoId: string; obs?: string | null } | null,
  /** A35 da 22ª: a resposta à pergunta das automações — `false` move sem disparar. */
  disparar = true,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')

    // O núcleo (lib/crm/oportunidade.ts) é o mesmo do Copilot.
    const r = await moverEtapaCore(createAdminClient(), ctx, leadId, crm_stage_id, { perda, exigirMotivo: true, semDespachar: !disparar })
    if ('error' in r) return { error: r.error }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    return {}
  } catch (e) {
    console.error('[updateLeadStage]', e)
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

const UUID_DO_CARD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A pergunta antes de mover UM card pela tela (A35 da 22ª; o Heitor,
 * 2026-11-18: "Também ao arrastar um"): o arraste, o menu do card, outro
 * funil, o seletor de etapa do inbox e o modal. As automações ligadas que
 * aquela mudança dispararia — só as que casam (`automacoesQueOMovimentoDispara`).
 * Vazio: a tela move direto.
 */
export async function automacoesAoMoverOCard(
  leadId: string, paraStageId: string,
): Promise<{ automacoes: string[] } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!UUID_DO_CARD.test(leadId) || !UUID_DO_CARD.test(paraStageId)) return { error: 'Oportunidade não encontrada.' }
    const admin = createAdminClient()
    if (!(await leadAoAlcance(admin, ctx, leadId))) return { error: 'Oportunidade não encontrada.' }
    if (!(await etapaDaRede(ctx.tenantId!, paraStageId))) return { error: 'Etapa não encontrada.' }
    const card = await ler(admin.from('leads').select(COLUNAS_DO_CARD_PARA_PREVER)
      .eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler a oportunidade') as CardParaPrever | null
    if (!card) return { error: 'Oportunidade não encontrada.' }
    return { automacoes: await automacoesQueOMovimentoDispara(ctx, [card], paraStageId) }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Mover as oportunidades de uma etapa (A35 da 22ª) ------------------------

const UUID_DA_ETAPA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * As travas do "Mover as N para…" da configuração do funil: a tela é a de
 * Configurações (quem monta o funil — Configurações em Gerenciar, da rede
 * toda, H7), e mover cards é do CRM em Gerenciar.
 */
async function contextoDoMoverDaEtapa() {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'settings', 'MANAGE')
  assertPermission(ctx, 'crm', 'MANAGE')
  return ctx
}

type EtapaLida = { id: string; funnel_id: string | null; outcome: string | null; name: string }
async function etapaParaMover(tenantId: string, stageId: string): Promise<EtapaLida | null> {
  if (!UUID_DA_ETAPA.test(stageId)) return null
  return await ler(createAdminClient().from('crm_stages').select('id, funnel_id, outcome, name')
    .eq('id', stageId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a etapa') as EtapaLida | null
}

/** As oportunidades da etapa que a pessoa alcança (o CRM "só os meus": as dela e as sem responsável). */
function cardsDaEtapa(ctx: Awaited<ReturnType<typeof getTenantContext>>, deStageId: string, colunas: string) {
  const admin = createAdminClient()
  const dono = ownerFilter(ctx, 'crm')
  return lerTodas((ini, fim) => {
    let q = admin.from('leads').select(colunas).eq('tenant_id', ctx.tenantId!).eq('crm_stage_id', deStageId)
    if (dono) q = q.or(`owner_id.is.null,owner_id.eq.${dono}`)
    return q.order('id').range(ini, fim)
  }, 'ler as oportunidades da etapa')
}

/**
 * As automações LIGADAS que mover as oportunidades desta etapa para a outra
 * dispararia — só as que casam com a mudança (o destino e os filtros do
 * gatilho, `automacoesQueOMovimentoDispara`; 2026-11-18). A tela pergunta
 * "Disparar?" só quando há alguma (decisão do Heitor, 2026-11-17).
 */
export async function automacoesDoMovimento(
  deStageId: string, paraStageId: string,
): Promise<{ automacoes: string[] } | { error: string }> {
  try {
    const ctx = await contextoDoMoverDaEtapa()
    const daRede = recusaDaConfigDaRede(ctx)
    if (daRede) return { error: daRede }
    const [de, para] = await Promise.all([etapaParaMover(ctx.tenantId!, deStageId), etapaParaMover(ctx.tenantId!, paraStageId)])
    if (!de || !para) return { error: 'Etapa não encontrada.' }
    if (!temRecurso(ctx, 'automacoes')) return { automacoes: [] }
    const cards = (await cardsDaEtapa(ctx, deStageId, COLUNAS_DO_CARD_PARA_PREVER)) as unknown as CardParaPrever[] | null
    return { automacoes: await automacoesQueOMovimentoDispara(ctx, cards ?? [], paraStageId) }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * Move as oportunidades de uma etapa para outra do MESMO funil (A35 da 22ª),
 * uma a uma pelo núcleo do quadro (`moverEtapaCore`: o alcance, a linha do
 * tempo, os eventos). `disparar` é a resposta da pessoa à pergunta das
 * automações: no "Não", o movimento se registra e não vai ao motor. A etapa
 * perdida fica fora do destino: ali o quadro pede o motivo de cada uma.
 * Com o CRM "só os meus", movem-se as dela e as sem responsável; as outras
 * ficam, e a tela diz quantas.
 */
export async function moverOportunidadesDaEtapa(
  deStageId: string, paraStageId: string, slug: string, disparar: boolean,
): Promise<{ movidas: number; ficaram: number } | { error: string }> {
  try {
    const ctx = await contextoDoMoverDaEtapa()
    const daRede = recusaDaConfigDaRede(ctx)
    if (daRede) return { error: daRede }
    if (deStageId === paraStageId) return { error: 'Escolha outra etapa.' }
    const [de, para] = await Promise.all([etapaParaMover(ctx.tenantId!, deStageId), etapaParaMover(ctx.tenantId!, paraStageId)])
    if (!de || !para) return { error: 'Etapa não encontrada.' }
    if (de.funnel_id !== para.funnel_id) return { error: 'As duas etapas precisam ser do mesmo funil.' }
    if (para.outcome === 'LOST') return { error: 'Para a etapa perdida, mova no quadro: ali se diz o motivo de cada uma.' }

    const admin = createAdminClient()
    const leads = (await cardsDaEtapa(ctx, deStageId, 'id')) as unknown as { id: string }[] | null
    let movidas = 0
    for (const l of leads ?? []) {
      const r = await moverEtapaCore(admin, ctx, l.id as string, paraStageId, { semDespachar: !disparar })
      if ('ok' in r) movidas++
    }
    const { count, error } = await admin.from('leads').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!).eq('crm_stage_id', deStageId)
    if (error) return { error: `Erro ao contar as oportunidades: ${error.message}` }

    revalidatePath(`/${slug}/oportunidades`)
    revalidatePath('/admin/oportunidades')
    revalidatePath('/admin/settings')
    return { movidas, ficaram: count ?? 0 }
  } catch (e) {
    console.error('[moverOportunidadesDaEtapa]', e)
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// Conversão lead→cliente vive agora em `addClient` (actions/clients.ts) com `_leadId`,
// reutilizando a MESMA regra de criação de cliente (e-mail + CPF + login).

// Excluir lead não existe (decisão do Heitor, 2026-09-28): levava junto o
// histórico (`lead_events` em cascata). A oportunidade que não vai adiante é
// marcada como perdida, não apagada.
