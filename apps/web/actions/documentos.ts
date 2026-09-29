'use server'

/**
 * Colher a assinatura de um termo ou contrato — pela EQUIPE, na clínica.
 *
 * Os quatro canais (clínica, papel, portal, link) terminam na mesma função do
 * banco, `documento_assinar`, que confere o hash do que foi mostrado e grava a
 * evidência numa transação. Aqui ficam os dois canais da equipe; o portal e o
 * link têm portas próprias (fases 5 e 6), porque quem chama é outro.
 *
 * Todo export é endpoint público: cada um confere o módulo (`documents`), a
 * rede do documento e o alcance da unidade antes de tocar nele.
 */

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { origemPublicaDe } from '@/lib/origem'
import { novoToken, telefoneParaWhatsApp, VALIDADE_DO_LINK_DIAS } from '@/lib/documentos/link'
import { conversaDoCliente, envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'
import { enviarNaConversa } from '@/lib/inbox/enviar'
import { emitirEventoDeConversa } from '@/lib/events/conversa'
import { EVENTOS } from '@estetica-os/types'
import { getTenantContext, assertPermission, alcancaUnidade, can, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { ensurePrivateBucket, DOCUMENTOS_ASSINADOS_BUCKET } from '@/lib/storage'
import { garantirRenderizado, sha256 } from '@/lib/documentos/renderizar'
import { prepararDocumentosDoPlano } from '@/lib/documentos/plano'
import { ipEAparelho, dadosDoAssinante, depoisDeAssinar, COLUNAS_ASSINAVEIS, type DocumentoAssinavel } from '@/lib/documentos/assinar'
import { notifyClient } from '@/lib/notifications/notify'
import { documentoParaExibir, resumirDocumentos, type ResumoDeDocumento } from '@/lib/documentos/leitura'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import type { DocumentoNaTela } from '@/components/shared/tela-de-assinatura'
import type { TenantContext } from '@estetica-os/types'

type Resultado = { error?: string; codigo?: string | null }

/** O documento, se for da rede da sessão e da unidade que ela alcança. */
async function documentoAoAlcance(ctx: TenantContext, id: string): Promise<DocumentoAssinavel | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = createAdminClient()
  const doc = await ler(admin.from('issued_documents')
    .select(COLUNAS_ASSINAVEIS)
    .eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o documento')
  if (!doc || !alcancaUnidade(ctx, (doc as unknown as DocumentoAssinavel).branch_id)) return null
  return doc as unknown as DocumentoAssinavel
}

// ─── Na clínica, na tela ─────────────────────────────────────────────────────

export async function assinarNaClinica(input: {
  id: string
  assinatura: string
  hashExibido: string
  identidadeConferida: boolean
  aceite: string
}): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, input.id)
    if (!doc) return { error: 'Documento não encontrado.' }
    if (!input.identidadeConferida) return { error: 'Confira o documento de identidade do cliente antes de entregar o aparelho.' }
    if (typeof input.assinatura !== 'string' || !input.assinatura.startsWith('data:image/png;base64,')) {
      return { error: 'Faça a assinatura antes de confirmar.' }
    }
    if (input.assinatura.length > 400_000) return { error: 'A imagem da assinatura ficou grande demais. Limpe e assine de novo.' }

    const [assinante, rede] = await Promise.all([dadosDoAssinante(doc.client_id), ipEAparelho()])
    const admin = createAdminClient()
    const r = await gravar(admin.rpc('documento_assinar', {
      p_doc:           doc.id,
      p_tenant:        ctx.tenantId!,
      p_canal:         'CLINICA',
      p_identidade:    'PRESENCIAL',
      p_hash_exibido:  input.hashExibido,
      p_png:           input.assinatura,
      p_png_sha256:    sha256(input.assinatura),
      p_nome:          assinante.nome,
      p_documento:     assinante.documento,
      p_ip:            rede.ip,
      p_ua:            rede.ua,
      p_conduzido_por: ctx.internalUserId ?? null,
      p_link:          null,
      p_scan_path:     null,
      p_scan_sha256:   null,
      p_aceite:        (input.aceite ?? '').slice(0, 300) || null,
    }), 'registrar a assinatura') as { codigo: string | null }

    await depoisDeAssinar(doc, ctx)
    return { codigo: r.codigo }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// ─── Papel ───────────────────────────────────────────────────────────────────

/** Cabeçalhos aceitos na digitalização: o arquivo, não o nome dele. */
function tipoDaDigitalizacao(bytes: Buffer): { ext: string; mime: string } | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG') return { ext: 'png', mime: 'image/png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  return null
}

/**
 * O cliente assinou o documento IMPRESSO. A digitalização do papel é opcional
 * — muita clínica guarda o papel na pasta —, mas quando vem fica junto da
 * evidência, com o hash dela.
 */
export async function marcarAssinadoEmPapel(formData: FormData): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, formData.get('id') as string)
    if (!doc) return { error: 'Documento não encontrado.' }

    const admin = createAdminClient()
    let scan: { path: string; sha: string } | null = null
    const file = formData.get('digitalizacao')
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) return { error: 'A digitalização passou de 10 MB.' }
      const bytes = Buffer.from(await file.arrayBuffer())
      const tipo = tipoDaDigitalizacao(bytes)
      if (!tipo) return { error: 'A digitalização tem de ser PDF, JPG ou PNG.' }
      const path = `${ctx.tenantId}/${doc.client_id}/${doc.id}/papel-${Date.now()}.${tipo.ext}`
      await ensurePrivateBucket(DOCUMENTOS_ASSINADOS_BUCKET)
      await gravar(admin.storage.from(DOCUMENTOS_ASSINADOS_BUCKET)
        .upload(path, bytes, { contentType: tipo.mime, upsert: false }), 'guardar a digitalização')
      scan = { path, sha: sha256(bytes) }
    }

    const [assinante, rede] = await Promise.all([dadosDoAssinante(doc.client_id), ipEAparelho()])
    const r = await gravar(admin.rpc('documento_assinar', {
      p_doc:           doc.id,
      p_tenant:        ctx.tenantId!,
      p_canal:         'PAPEL',
      p_identidade:    'PRESENCIAL',
      p_hash_exibido:  formData.get('hashExibido') as string,
      p_png:           null,
      p_png_sha256:    null,
      p_nome:          assinante.nome,
      p_documento:     assinante.documento,
      p_ip:            rede.ip,
      p_ua:            rede.ua,
      p_conduzido_por: ctx.internalUserId ?? null,
      p_link:          null,
      p_scan_path:     scan?.path ?? null,
      p_scan_sha256:   scan?.sha ?? null,
      p_aceite:        'Assinado no documento impresso',
    }), 'registrar a assinatura em papel') as { codigo: string | null }

    await depoisDeAssinar(doc, ctx)
    return { codigo: r.codigo }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// ─── Checkout do plano ───────────────────────────────────────────────────────

/** O pagamento que veio do navegador tem a forma de um pagamento? */
function pagamentoValido(p: unknown): p is PagamentoDoPlano | null {
  if (p === null) return true
  if (!p || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  const texto = (v: unknown) => typeof v === 'string' && v.length <= 40
  const data = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
  switch (x.forma) {
    case 'AVISTA':    return texto(x.metodo)
    case 'A_RECEBER': return (x.metodo === null || texto(x.metodo)) && data(x.vencimento)
    case 'PARCELADO': return texto(x.metodo) && Number.isFinite(x.entrada) && (x.entrada as number) >= 0
      && Number.isInteger(x.parcelas) && (x.parcelas as number) >= 1 && (x.parcelas as number) <= 48 && data(x.primeiroVencimento)
    default:          return false
  }
}

/**
 * Os documentos do fechamento do plano, com o pagamento escolhido: um termo
 * por procedimento e o contrato de plano. Quem pode fechar o plano (prontuário
 * ou recebimento — o mesmo gate do checkout) prepara.
 */
export async function prepararDocumentosDoCheckout(planId: string, pagamento: unknown): Promise<{ itens?: ResumoDeDocumento[]; error?: string }> {
  try {
    const ctx = await getTenantContext()
    if (!can(ctx, 'medical_records', 'MANAGE') && !podeReceber(ctx)) throw semAcesso()
    if (!pagamentoValido(pagamento)) return { error: 'Forma de pagamento inválida.' }
    const admin = createAdminClient()
    const plano = await ler(admin.from('treatment_plans')
      .select('id, status, branch_id, branches!branch_id(tenant_id)')
      .eq('id', planId).maybeSingle(), 'buscar o plano')
    const rede = (plano?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!plano || rede !== ctx.tenantId || !alcancaUnidade(ctx, plano.branch_id as string)) return { error: 'Plano não encontrado.' }
    if (plano.status !== 'PROPOSED') return { error: 'Apenas planos enviados para recepção podem ser finalizados.' }

    const docs = await prepararDocumentosDoPlano(ctx.tenantId!, planId, pagamento, ctx.internalUserId ?? null)
    return { itens: await resumirDocumentos(ctx.tenantId!, docs) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * O pagamento combinado de um contrato do PROCEDIMENTO (atendimento avulso),
 * antes de o cliente assinar — decisão do Heitor, 2026-09-30. No plano o
 * pagamento vem do checkout; no avulso ele só é recebido depois do
 * atendimento, então a recepção o define aqui para o contrato poder citá-lo.
 * Sem isso, o contrato que usa `pagamento.*` fica INCOMPLETO.
 *
 * `null` = "no atendimento" (a receber depois, sem prazo). Trocar é possível
 * até a assinatura: o texto é montado de novo, e o hash com ele.
 */
export async function definirPagamentoDoContrato(id: string, pagamento: unknown): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    if (!pagamentoValido(pagamento)) return { error: 'Forma de pagamento inválida.' }
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    const admin = createAdminClient()
    const linha = await ler(admin.from('issued_documents').select('kind').eq('id', doc.id).single(), 'buscar o tipo do documento')
    if (linha?.kind !== 'CONTRATO' || !doc.appointment_id) {
      return { error: 'Só o contrato do procedimento tem o pagamento definido aqui (o do plano vem do fechamento do plano).' }
    }
    if (!['A_GERAR', 'INCOMPLETO', 'PENDENTE'].includes(doc.status)) {
      return { error: 'Este contrato não está mais esperando assinatura: o pagamento dele não muda.' }
    }
    await garantirRenderizado(ctx.tenantId!, doc.id, { forcar: true, pagamento: { valor: pagamento } })
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Um documento inteiro, para assinar DENTRO de outra tela (o checkout). */
export async function documentoParaAssinar(id: string): Promise<{ doc?: DocumentoNaTela; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const alvo = await documentoAoAlcance(ctx, id)
    if (!alvo) return { error: 'Documento não encontrado.' }
    const d = await documentoParaExibir(ctx.tenantId!, alvo.id, { montarDeNovo: true })
    if (!d) return { error: 'Documento não encontrado.' }
    return {
      doc: {
        id: d.resumo.id, titulo: d.resumo.titulo, tipo: d.resumo.tipo, status: d.resumo.status,
        faltando: d.resumo.faltando, codigo: d.resumo.codigo, motivo: d.resumo.motivo,
        cliente: { nome: d.cliente.nome }, conteudo: d.conteudo, pdfUrl: d.pdfUrl, imagens: d.imagens, assinatura: d.assinatura,
      },
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// ─── Pedir pelo portal ───────────────────────────────────────────────────────

/**
 * Manda o documento para o portal do cliente: fica pendente lá, e um push
 * avisa. O texto é GENÉRICO de propósito — o título do documento pode dizer o
 * procedimento, e aviso na tela de bloqueio do celular é dado de saúde exposto.
 */
export async function pedirAssinaturaNoPortal(id: string): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    const montado = await garantirRenderizado(ctx.tenantId!, doc.id)
    if (montado?.status === 'INCOMPLETO') return { error: 'Faltam dados do cliente neste documento. Complete o cadastro antes de pedir a assinatura.' }
    if (montado?.status !== 'PENDENTE') return { error: 'Este documento não está esperando assinatura.' }

    const admin = createAdminClient()
    const cliente = await ler(admin.from('clients').select('auth_id, branch_id').eq('id', doc.client_id).single(), 'buscar o cliente')
    if (!cliente?.auth_id) {
      return { error: 'Este cliente ainda não tem acesso ao portal. Colha a assinatura na clínica.' }
    }
    // O portal é o da unidade do cliente (ou a do documento, se ele não tiver).
    const unidadeId = (cliente.branch_id as string | null) ?? doc.branch_id
    const [unidade, rede] = await Promise.all([
      unidadeId ? ler(admin.from('branches').select('slug, name').eq('id', unidadeId).maybeSingle(), 'buscar a unidade') : Promise.resolve(null),
      ler(admin.from('tenants').select('name').eq('id', ctx.tenantId!).single(), 'buscar a rede'),
    ])
    if (!unidade?.slug) return { error: 'Não encontrei a unidade do portal deste cliente.' }

    await notifyClient(admin, doc.client_id, {
      type:  'document_to_sign',
      title: 'Documento para assinar',
      body:  `${(unidade.name as string) || (rede?.name as string) || 'A clínica'} pediu a sua assinatura em um documento.`,
      data:  { link: `/${unidade.slug}/cliente/documentos/${doc.id}` },
    })
    await gravar(admin.from('issued_document_events').insert({
      issued_document_id: doc.id, tenant_id: ctx.tenantId!, kind: 'NOTIFICADO_PORTAL', actor_user_id: ctx.internalUserId ?? null,
    }), 'registrar o pedido no portal')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// ─── Link público (e o WhatsApp mínimo) ──────────────────────────────────────

export interface LinkDeAssinatura {
  url:       string
  expiraEm:  string
  /** Mensagem pronta para colar — genérica, como a do portal. */
  mensagem:  string
  /** `wa.me` com a mensagem; sem o número quando o cadastro não tem um válido. */
  whatsapp:  string
  /** O que o cliente vai confirmar ao abrir. */
  pede:      'CPF' | 'NASCIMENTO'
}

/**
 * Gera o link público de assinatura: uso único, 7 dias, e o cliente confirma
 * o CPF (ou a data de nascimento) antes de ver o documento. Gerar de novo
 * revoga o anterior — o token não fica no banco, então não se "mostra de
 * novo".
 *
 * O WhatsApp é o mínimo: a mensagem pronta e o `wa.me`. Não depende de caixa
 * conectada, janela de 24h nem provedor — quem envia é a pessoa, do aparelho.
 */
/**
 * Cria o link (revogando o anterior) e monta a mensagem. Não exportada: quem
 * chama já conferiu o módulo, a rede e a unidade do documento.
 */
async function criarLink(ctx: TenantContext, doc: DocumentoAssinavel): Promise<{ error: string } | { link: LinkDeAssinatura }> {
  const montado = await garantirRenderizado(ctx.tenantId!, doc.id)
  if (montado?.status === 'INCOMPLETO') return { error: 'Faltam dados do cliente neste documento. Complete o cadastro antes de enviar o link.' }
  if (montado?.status !== 'PENDENTE') return { error: 'Este documento não está esperando assinatura.' }

  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('name, document, birth_date, phone').eq('id', doc.client_id).single(), 'buscar o cliente')
  const temCpf = ((cliente?.document as string | null) ?? '').replace(/\D/g, '').length > 0
  if (!temCpf && !cliente?.birth_date) {
    // Sem nada para conferir, o link valeria para quem o tivesse na mão.
    return { error: 'O cadastro do cliente não tem CPF nem data de nascimento, e o link precisa de um dos dois para conferir quem abre. Complete o cadastro ou colha na clínica.' }
  }

  const { token, hash } = novoToken()
  const expiraEm = new Date(Date.now() + VALIDADE_DO_LINK_DIAS * 86_400_000).toISOString()
  await gravar(admin.rpc('documento_link_criar', {
    p_doc: doc.id, p_tenant: ctx.tenantId!, p_token_hash: hash, p_expira: expiraEm, p_ator: ctx.internalUserId ?? null,
  }), 'gerar o link de assinatura')

  const [unidade, rede] = await Promise.all([
    doc.branch_id ? ler(admin.from('branches').select('name').eq('id', doc.branch_id).maybeSingle(), 'buscar a unidade') : Promise.resolve(null),
    ler(admin.from('tenants').select('name').eq('id', ctx.tenantId!).single(), 'buscar a rede'),
  ])
  const clinica = (unidade?.name as string) || (rede?.name as string) || 'a clínica'
  const url = `${origemPublicaDe(await headers())}/assinar/${token}`
  const primeiroNome = ((cliente?.name as string) ?? '').trim().split(/\s+/)[0] ?? ''
  // Genérica de propósito: a prévia do WhatsApp aparece na tela de bloqueio.
  const mensagem = `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! ${clinica} pediu a sua assinatura em um documento. `
    + `Para ler e assinar, abra o link abaixo e confirme o seu ${temCpf ? 'CPF' : 'data de nascimento'}. O link vale por ${VALIDADE_DO_LINK_DIAS} dias.\n\n${url}`
  const numero = telefoneParaWhatsApp(cliente?.phone as string | null)
  const whatsapp = `https://wa.me/${numero ?? ''}?text=${encodeURIComponent(mensagem)}`

  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  return { link: { url, expiraEm, mensagem, whatsapp, pede: temCpf ? 'CPF' : 'NASCIMENTO' } }
}

export async function gerarLinkDeAssinatura(id: string): Promise<{ error?: string; link?: LinkDeAssinatura }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    return await criarLink(ctx, doc)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Manda o link pela conversa do cliente no inbox — só com a opção da REDE
 * ligada (Configurações → Documentos).
 *
 * - Gera um link NOVO a cada envio: o token não fica no banco, então não há
 *   como reenviar o anterior.
 * - Sai pela caixa DA CONVERSA (`pelaCaixaDaConversa`), nunca pelo número
 *   próprio de quem clicou: o cliente tem de receber do número que conhece,
 *   e é ali que a janela de 24h dele está aberta. A janela é conferida por
 *   `enviarNaConversa`, o mesmo caminho do inbox e das automações.
 * - Quem manda não precisa de `crm`: não lê nada da conversa, só recebe
 *   "enviado" ou o motivo. É a rede, ao ligar a opção, que autoriza a equipe
 *   de `documents: MANAGE` a mandar ESTA mensagem por ali.
 * - Falhou (janela fechada, caixa desconectada): o link já nasceu, e volta
 *   junto com o motivo — a tela oferece copiar e o WhatsApp do aparelho.
 */
export async function enviarLinkPelaConversa(id: string): Promise<{ error?: string; link?: LinkDeAssinatura; enviado?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    if (!(await envioPelaConversaLigado(ctx.tenantId!))) {
      return { error: 'O envio pela conversa está desligado nesta rede. Quem administra liga em Configurações → Documentos.' }
    }
    // Antes de gerar: sem conversa, não se revoga à toa o link que já existe.
    const conversa = await conversaDoCliente(ctx.tenantId!, doc.client_id)
    if (!conversa) {
      return { error: 'Este cliente não tem conversa aberta no WhatsApp da clínica. Use "Enviar link" para copiar ou abrir no WhatsApp do aparelho.' }
    }

    const criado = await criarLink(ctx, doc)
    if ('error' in criado) return criado

    const r = await enviarNaConversa(ctx.tenantId!, conversa, criado.link.mensagem,
      { id: ctx.internalUserId ?? null, nome: ctx.userName || null }, { pelaCaixaDaConversa: true })
    if (!r.ok) {
      return { error: `Não foi pela conversa: ${r.error ?? 'falha no envio.'} O link foi gerado — copie ou abra no WhatsApp do aparelho.`, link: criado.link }
    }

    const admin = createAdminClient()
    await gravar(admin.from('issued_document_events').insert({
      issued_document_id: doc.id, tenant_id: ctx.tenantId!, kind: 'LINK_ENVIADO_CONVERSA',
      actor_user_id: ctx.internalUserId ?? null, channel: 'LINK', details: { conversa },
    }), 'registrar o envio pela conversa')
    // O mesmo fato que a resposta da equipe no inbox emite.
    await emitirEventoDeConversa(EVENTOS.CONVERSA_MENSAGEM_ENVIADA, conversa, ctx.tenantId!, {
      texto: criado.link.mensagem, mensagemId: r.mensagemId!, ctx,
    })
    return { link: criado.link, enviado: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Revoga o link ativo do documento (mandado para a pessoa errada, por exemplo). */
export async function revogarLinkDeAssinatura(id: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    const admin = createAdminClient()
    await gravar(admin.rpc('documento_link_criar', {
      p_doc: doc.id, p_tenant: ctx.tenantId!, p_token_hash: null, p_expira: null, p_ator: ctx.internalUserId ?? null,
    }), 'revogar o link de assinatura')
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    return {}
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// ─── Dispensar e montar de novo ──────────────────────────────────────────────

/**
 * Dispensar cumpre a exigência sem assinatura, com motivo registrado. É a saída
 * para um modelo mal configurado não travar a agenda da clínica.
 */
export async function dispensarDocumento(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    const admin = createAdminClient()
    await gravar(admin.rpc('documento_dispensar', {
      p_doc: doc.id, p_tenant: ctx.tenantId!, p_motivo: (motivo ?? '').slice(0, 500), p_ator: ctx.internalUserId ?? null,
    }), 'dispensar o documento')
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    return {}
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Monta o texto de novo — depois de completar o cadastro do cliente. */
export async function montarDocumentoDeNovo(id: string): Promise<Resultado & { faltando?: number }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'documents', 'MANAGE')
    const doc = await documentoAoAlcance(ctx, id)
    if (!doc) return { error: 'Documento não encontrado.' }
    const novo = await garantirRenderizado(ctx.tenantId!, doc.id, { forcar: true })
    return { faltando: novo?.status === 'INCOMPLETO' ? 1 : 0 }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
