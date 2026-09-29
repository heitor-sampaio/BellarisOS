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

import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade, can, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { ensurePrivateBucket, DOCUMENTOS_ASSINADOS_BUCKET } from '@/lib/storage'
import { garantirRenderizado, sha256 } from '@/lib/documentos/renderizar'
import { prepararDocumentosDoPlano } from '@/lib/documentos/plano'
import { gerarPdfAssinado } from '@/lib/documentos/pdf'
import { documentoParaExibir, resumirDocumentos, type ResumoDeDocumento } from '@/lib/documentos/leitura'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import type { DocumentoNaTela } from '@/components/shared/tela-de-assinatura'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS, type TenantContext } from '@estetica-os/types'

type Resultado = { error?: string; codigo?: string | null }

/** O documento, se for da rede da sessão e da unidade que ela alcança. */
async function documentoAoAlcance(ctx: TenantContext, id: string) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = createAdminClient()
  const doc = await ler(admin.from('issued_documents')
    .select('id, tenant_id, branch_id, client_id, appointment_id, title, status')
    .eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o documento')
  if (!doc || !alcancaUnidade(ctx, doc.branch_id as string | null)) return null
  return doc as { id: string; tenant_id: string; branch_id: string | null; client_id: string; appointment_id: string | null; title: string; status: string }
}

/**
 * O IP de quem está na tela. Atrás do proxy do Railway, o primeiro do
 * `x-forwarded-for`. Só vai para o banco se tiver cara de IP: o parâmetro é
 * `inet`, e um valor torto faria a ASSINATURA inteira falhar.
 */
async function ipEAparelho(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const bruto = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0]!.trim()
  const ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(bruto) || /^[0-9a-f:]+$/i.test(bruto) && bruto.includes(':') ? bruto : null
  return { ip, ua: (h.get('user-agent') ?? '').slice(0, 500) || null }
}

async function dadosDoAssinante(clientId: string) {
  const admin = createAdminClient()
  const c = await ler(admin.from('clients').select('name, document').eq('id', clientId).single(), 'buscar o cliente')
  if (!c) throw new Error('Cliente do documento não encontrado.')
  const cpf = ((c.document as string | null) ?? '').replace(/\D/g, '')
  return { nome: c.name as string, documento: cpf || null }
}

async function depoisDeAssinar(ctx: TenantContext, doc: NonNullable<Awaited<ReturnType<typeof documentoAoAlcance>>>) {
  // O evento é aviso do que aconteceu: sai depois, e só se a assinatura gravou.
  await emitirEventoClinico(EVENTOS.TERMO_ASSINADO, doc.id, ctx, {
    clientId:      doc.client_id,
    agendamentoId: doc.appointment_id,
    referencia:    doc.title,
    branchId:      doc.branch_id,
    chave:         'termo.assinado:' + doc.id,
  })
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  // O PDF final (documento + página de evidências) sai depois da resposta: a
  // assinatura já está gravada, e quem assinou não espera o PDF. O cron
  // `documentos-pdf` recolhe o que falhar aqui.
  const tenantId = ctx.tenantId!
  after(async () => {
    try { await gerarPdfAssinado(tenantId, doc.id) }
    catch (e) { console.error('[documentos] PDF assinado ficou para o cron:', (e as Error).message) }
  })
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

    await depoisDeAssinar(ctx, doc)
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

    await depoisDeAssinar(ctx, doc)
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
        cliente: { nome: d.cliente.nome }, conteudo: d.conteudo, pdfUrl: d.pdfUrl, assinatura: d.assinatura,
      },
    }
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
