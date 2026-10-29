'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { headers } from 'next/headers'
import { getTenantContext, assertPermission, assertRecurso, alcancaUnidade, ownerFilter } from '@/lib/auth'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { origemPublicaDe } from '@/lib/origem'
import { novoToken, telefoneParaWhatsApp, VALIDADE_DO_LINK_DIAS } from '@/lib/documentos/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'
import { normalizeFormSchema, validateFormSchema, flattenFields } from '@/lib/anamnesis'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral, preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'
import { conversaDoCliente, envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'
import { enviarNaConversa } from '@/lib/inbox/enviar'
import { emitirEventoDeConversa } from '@/lib/events/conversa'
import { EVENTOS } from '@estetica-os/types'
import { mensagemDoLink } from '@/lib/saudacao'

/**
 * O pré-atendimento pela equipe (2026-10-20, decisões do Heitor): a ficha
 * universal da rede, o envio ao agendar e a anamnese do atendimento.
 *
 * A ficha e o envio são da REDE (uma ficha por rede): mudam só quem tem
 * `forms: MANAGE` e abrangência de rede — como os procedimentos e as demais
 * configurações. Personalizar a ficha é do plano (`fichas`), como as outras.
 */

type Resultado = { ok: true } | { error: string }

const ROTULO_FORA: Record<string, string> = { photo: 'foto', injectable_map: 'planejador de injetáveis' }

export async function salvarFichaDePreAtendimento(input: { id?: string; name: string; schema: unknown }): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'forms', 'MANAGE')
  assertRecurso(ctx, 'fichas')
  if (ctx.branchId !== null) throw semAcesso()

  const nome = String(input?.name ?? '').trim().slice(0, 120) || 'Pré-atendimento'
  const schema = normalizeFormSchema(input?.schema)
  const invalido = validateFormSchema(schema)
  if (invalido) return { error: invalido }
  const fora = flattenFields(schema).find(f => TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type))
  if (fora) return { error: `A cliente responde a ficha pelo celular: campo de ${ROTULO_FORA[fora.type] ?? fora.type} não entra no pré-atendimento ("${fora.label}").` }

  const admin = createAdminClient()
  const atualizadas = await gravar(admin.from('forms')
    .update({ name: nome, schema, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId!).eq('tipo', 'PRE_ATENDIMENTO').select('id'), 'salvar a ficha de pré-atendimento') as { id: string }[] | null
  if (!atualizadas?.length) return { error: 'A ficha de pré-atendimento da rede não foi encontrada.' }
  revalidatePath('/admin/settings')
  return { ok: true }
}

const EntradaDoEnvio = z.object({ envio: z.boolean(), validadeMeses: z.number().int().min(1).max(36) })

export async function definirEnvioDoPreAtendimento(input: unknown): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'forms', 'MANAGE')
  if (ctx.branchId !== null) throw semAcesso()
  const dados = EntradaDoEnvio.safeParse(input)
  if (!dados.success) return { error: 'A validade vai de 1 a 36 meses.' }

  await gravar(createAdminClient().from('tenants')
    .update({ pre_atendimento_envio: dados.data.envio, pre_atendimento_validade_meses: dados.data.validadeMeses })
    .eq('id', ctx.tenantId!), 'salvar o envio do pré-atendimento')
  revalidatePath('/admin/settings')
  return { ok: true }
}

const EntradaDaAnamnese = z.object({ clientId: z.string().uuid(), respostas: z.record(z.string(), z.unknown()) })

/** A equipe responde (ou corrige) a anamnese da cliente — na sessão, na clínica. */
export async function salvarAnamneseGeral(input: unknown): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const dados = EntradaDaAnamnese.safeParse(input)
  if (!dados.success) return { error: 'Dados inválidos.' }

  // A cliente é desta rede: com o id de uma cliente de OUTRA rede, seria
  // escrever a anamnese de saúde dela.
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id')
    .eq('id', dados.data.clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a cliente da anamnese')
  if (!cliente) return { error: 'Cliente não encontrada.' }

  await gravarAnamneseGeral(admin, {
    tenantId: ctx.tenantId!, clientId: dados.data.clientId, respostas: dados.data.respostas,
    origem: 'EQUIPE', porUsuario: ctx.internalUserId,
  })
  revalidatePath('/admin/clients')
  revalidatePath('/admin/agenda')
  return { ok: true }
}

// ─── O pré-atendimento de um agendamento: a situação e o link ───────────────

/**
 * O agendamento lido por id, conferido: da rede, ao alcance da unidade e, no
 * escopo "só a minha agenda", do próprio profissional.
 */
async function agendamentoAoAlcance(ctx: Awaited<ReturnType<typeof getTenantContext>>, appointmentId: string) {
  if (!z.string().uuid().safeParse(appointmentId).success) return null
  const admin = createAdminClient()
  const ap = await ler(admin.from('appointments').select('id, client_id, branch_id, professional_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as
    { id: string; client_id: string | null; branch_id: string; professional_id: string | null } | null
  if (!ap || !alcancaUnidade(ctx, ap.branch_id)) return null
  const dono = ownerFilter(ctx, 'agenda')
  if (dono && ap.professional_id !== dono) return null
  return ap
}

export interface SituacaoDoPreAtendimento {
  estado: 'PENDENTE' | 'RESPONDIDO' | null
  modo?: 'COMPLETO' | 'CONFIRMAR'
  respondidoEm?: string | null
  /** O cadastro tem CPF ou nascimento — sem um dos dois, não há link. */
  podeLink: boolean
  /** A cliente do agendamento — para o atalho ao cadastro quando falta CPF e nascimento. */
  clienteId?: string
  /** A rede manda o link também pela conversa do inbox (a chave dos documentos). */
  pelaConversa?: boolean
  /** Já há um link valendo (não usado, não revogado, no prazo): até quando. */
  linkValidoAte?: string | null
}

/**
 * Na janela do agendamento: a ficha da cliente está pendente (a dela, mesmo
 * que aberta por outro horário) ou respondida para este agendamento. Só o
 * estado — nada das respostas, que são do prontuário.
 */
export async function situacaoDoPreAtendimento(appointmentId: string): Promise<SituacaoDoPreAtendimento | { error: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const ap = await agendamentoAoAlcance(ctx, appointmentId)
  if (!ap) return { error: 'Agendamento não encontrado.' }
  if (!ap.client_id) return { estado: null, podeLink: false }
  const admin = createAdminClient()
  const [pendente, deste, cliente, pelaConversa] = await Promise.all([
    ler(admin.from('pre_atendimentos').select('modo').eq('client_id', ap.client_id).eq('tenant_id', ctx.tenantId!)
      .eq('status', 'PENDENTE').maybeSingle(), 'buscar o pré-atendimento pendente'),
    // A ficha gravada vazia não é respondida (D2 da simulação de 2026-10-28).
    ler(admin.from('pre_atendimentos').select('respondido_em').eq('appointment_id', ap.id).eq('status', 'RESPONDIDO').neq('respostas', '{}')
      .order('respondido_em', { ascending: false }).limit(1).maybeSingle(), 'buscar o pré-atendimento do agendamento'),
    ler(admin.from('clients').select('document, birth_date').eq('id', ap.client_id).maybeSingle(), 'buscar a cliente'),
    envioPelaConversaLigado(ctx.tenantId!),
  ])
  const podeLink = ((cliente?.document as string | null) ?? '').replace(/\D/g, '').length > 0 || !!cliente?.birth_date
  if (pendente) {
    // O link que já está valendo: gerar outro o cancela, e a tela precisa dizer
    // (2026-10-21; a simulação viu o anterior ser revogado em silêncio).
    const { data: pre } = await admin.from('pre_atendimentos').select('id').eq('client_id', ap.client_id)
      .eq('tenant_id', ctx.tenantId!).eq('status', 'PENDENTE').maybeSingle()
    const valendo = pre ? await ler(admin.from('pre_atendimento_links').select('expires_at')
      .eq('pre_atendimento_id', pre.id as string).is('revoked_at', null).is('used_at', null)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      'buscar o link da ficha') as { expires_at: string } | null : null
    return {
      estado: 'PENDENTE', modo: pendente.modo as 'COMPLETO' | 'CONFIRMAR', podeLink, pelaConversa, clienteId: ap.client_id as string,
      linkValidoAte: valendo?.expires_at ?? null,
    }
  }
  if (deste) return { estado: 'RESPONDIDO', respondidoEm: deste.respondido_em as string | null, podeLink }
  return { estado: null, podeLink }
}

export interface LinkDoPreAtendimento {
  url:      string
  expiraEm: string
  /** Mensagem pronta para colar — genérica: a prévia aparece na tela de bloqueio. */
  mensagem: string
  /** `wa.me` com a mensagem; sem o número quando o cadastro não tem um válido. */
  whatsapp: string
}

/**
 * Gera o link da ficha pendente da cliente deste agendamento: 7 dias, e ela
 * confirma o CPF (ou o nascimento) antes de ver as perguntas. Gerar de novo
 * revoga o anterior — o token não fica no banco. O WhatsApp é o mínimo: a
 * mensagem pronta e o `wa.me`, enviados do aparelho de quem clicou.
 */
export async function gerarLinkDoPreAtendimento(appointmentId: string): Promise<{ error: string } | { link: LinkDoPreAtendimento }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const travado = bloqueioDoSuporte(ctx, 'mandar a ficha de pré-atendimento')
    if (travado) return { error: travado }
    const ap = await agendamentoAoAlcance(ctx, appointmentId)
    if (!ap?.client_id) return { error: 'Agendamento não encontrado.' }
    return await criarLinkDaFicha(ctx, { ...ap, client_id: ap.client_id })
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Manda o link da ficha pela conversa do inbox da cliente (2026-10-21): a
 * MESMA chave do link de assinatura (`documentos_link_pela_conversa`,
 * Configurações → Documentos), a mesma conversa (a que ela usou por último) e
 * a mesma regra — a conversa se acha ANTES de gerar, para não revogar à toa o
 * link que ela já tem. Não saiu (janela de 24h fechada, caixa fora do ar): o
 * link volta para copiar.
 */
export async function enviarFichaPelaConversa(appointmentId: string): Promise<{ error: string; link?: LinkDoPreAtendimento } | { link: LinkDoPreAtendimento; enviado: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const travado = bloqueioDoSuporte(ctx, 'mandar a ficha de pré-atendimento')
    if (travado) return { error: travado }
    const ap = await agendamentoAoAlcance(ctx, appointmentId)
    if (!ap?.client_id) return { error: 'Agendamento não encontrado.' }
    if (!(await envioPelaConversaLigado(ctx.tenantId!))) {
      return { error: 'O envio pela conversa está desligado nesta rede. Quem administra liga em Configurações → Documentos.' }
    }
    const conversa = await conversaDoCliente(ctx.tenantId!, ap.client_id)
    if (!conversa) {
      return { error: 'Esta cliente não tem conversa aberta no WhatsApp da clínica. Use "Enviar a ficha" para copiar ou abrir no WhatsApp do aparelho.' }
    }

    const criado = await criarLinkDaFicha(ctx, { ...ap, client_id: ap.client_id })
    if ('error' in criado) return criado

    const r = await enviarNaConversa(ctx.tenantId!, conversa, criado.link.mensagem,
      { id: ctx.internalUserId ?? null, nome: ctx.userName || null }, { pelaCaixaDaConversa: true })
    if (!r.ok) {
      return { error: `Não foi pela conversa: ${r.error ?? 'falha no envio.'} O link foi gerado — copie ou abra no WhatsApp do aparelho.`, link: criado.link }
    }
    // O mesmo fato que a resposta da equipe no inbox emite.
    await emitirEventoDeConversa(EVENTOS.CONVERSA_MENSAGEM_ENVIADA, conversa, ctx.tenantId!, {
      texto: criado.link.mensagem, mensagemId: r.mensagemId!, ctx,
    })
    return { link: criado.link, enviado: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** O link novo da ficha pendente (revoga o anterior), com a mensagem pronta. */
async function criarLinkDaFicha(
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  ap: { client_id: string; branch_id: string },
): Promise<{ error: string } | { link: LinkDoPreAtendimento }> {
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ap.client_id)
  if (!pendente || pendente.tenantId !== ctx.tenantId) return { error: 'A cliente não tem ficha de pré-atendimento esperando resposta.' }
  const cliente = await ler(admin.from('clients').select('name, document, birth_date, phone').eq('id', ap.client_id).single(), 'buscar a cliente')
  const temCpf = ((cliente?.document as string | null) ?? '').replace(/\D/g, '').length > 0
  if (!temCpf && !cliente?.birth_date) {
    // Sem nada para conferir, o link (com dado de saúde) valeria para quem o tivesse na mão.
    return { error: 'O cadastro da cliente não tem CPF nem data de nascimento, e o link precisa de um dos dois para conferir quem abre. Complete o cadastro.' }
  }

  const { token, hash } = novoToken()
  const expiraEm = new Date(Date.now() + VALIDADE_DO_LINK_DIAS * 86_400_000).toISOString()
  await gravar(admin.rpc('pre_atendimento_link_criar', {
    p_pre: pendente.id, p_tenant: ctx.tenantId!, p_token_hash: hash, p_expira: expiraEm, p_ator: ctx.internalUserId ?? null,
  }), 'gerar o link da ficha')

  const unidade = await ler(admin.from('branches').select('name').eq('id', ap.branch_id).maybeSingle(), 'buscar a unidade')
  const clinica = (unidade?.name as string) || 'A clínica'
  const url = `${origemPublicaDe(await headers())}/pre-atendimento/${token}`
  const mensagem = mensagemDoLink({
    nome: cliente?.name as string | null, pedido: `${clinica} mandou a sua ficha de pré-atendimento.`,
    acao: 'Para responder', temCpf, dias: VALIDADE_DO_LINK_DIAS, url,
  })
  const numero = telefoneParaWhatsApp(cliente?.phone as string | null)
  return { link: { url, expiraEm, mensagem, whatsapp: `https://wa.me/${numero ?? ''}?text=${encodeURIComponent(mensagem)}` } }
}
