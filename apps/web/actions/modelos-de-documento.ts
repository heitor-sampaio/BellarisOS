'use server'

/**
 * Modelos de termo e contrato da rede (Configurações → Documentos).
 *
 * Autoria de rede, como as fichas: pede `forms: MANAGE`. Colher a assinatura
 * do cliente é outro módulo (`documents`), e ligar o modelo ao procedimento é
 * do cadastro do procedimento (`procedures: MANAGE`).
 *
 * Gravar passa por `documento_modelo_salvar`: o modelo e a versão numa
 * transação só, e a versão nova só nasce quando o CONTEÚDO mudou. O app valida
 * o texto e calcula as variáveis (`lib/documentos/variaveis.ts`); o banco grava.
 */

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { PDFDocument } from 'pdf-lib'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro, ErroDeBanco } from '@/lib/db'
import { ensurePrivateBucket, getSignedUrl, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import { validarModelo, TIPOS_DE_MODELO, type TipoDeModelo } from '@/lib/documentos/variaveis'

type Resultado = { error?: string; id?: string; versao?: number; novaVersao?: boolean }

const MOMENTOS   = ['AGENDAMENTO', 'INICIO_ATENDIMENTO'] as const
const EXIGENCIAS = ['BLOQUEIA', 'AVISA'] as const
type Momento   = typeof MOMENTOS[number]
type Exigencia = typeof EXIGENCIAS[number]

/** PDF de modelo: até 10 MB e 50 páginas — ele é carimbado no servidor depois. */
const MAX_BYTES_DO_PDF   = 10 * 1024 * 1024
const MAX_PAGINAS_DO_PDF = 50

function revalidar() {
  revalidatePath('/admin/settings')
  revalidatePath('/[slug]/settings', 'page')
  revalidatePath('/admin/procedures')
}

/**
 * O único jeito de dar dois contratos de plano ativos é o índice recusar — e
 * aí a frase certa é esta, não "não consegui salvar".
 */
function mensagem(e: unknown): string {
  if (e instanceof ErroDeBanco && e.causa.code === '23505' && /contrato_de_plano/.test(e.causa.message)) {
    return 'A rede já tem um contrato de plano ativo. Desative o atual antes de ativar outro.'
  }
  return mensagemDoErro(e)
}

interface Configuracao {
  id?:       string | null
  nome:      string
  tipo:      TipoDeModelo
  momento?:  Momento | null
  exigencia: Exigencia
}

/** Confere o que vem do navegador antes de chegar ao banco. */
function conferir(c: Configuracao): string | null {
  if (!c.nome?.trim() || c.nome.trim().length < 2) return 'Dê um nome ao modelo.'
  if (!TIPOS_DE_MODELO.includes(c.tipo)) return 'Tipo de modelo inválido.'
  if (!EXIGENCIAS.includes(c.exigencia)) return 'Escolha se o documento bloqueia ou só avisa.'
  if (c.tipo !== 'CONTRATO_PLANO' && !MOMENTOS.includes(c.momento as Momento)) {
    return 'Escolha quando o documento nasce no atendimento.'
  }
  return null
}

async function salvar(
  tenantId: string,
  ator: string | null,
  c: Configuracao,
  conteudo:
    | { origem: 'EDITOR'; texto: string; variaveis: string[]; usaPagamento: boolean }
    | { origem: 'ARQUIVO'; arquivo: { path: string; sha256: string; nome: string; tamanho: number; paginas: number } | null },
) {
  const admin = createAdminClient()
  const r = await gravar(admin.rpc('documento_modelo_salvar', {
    p_tenant:          tenantId,
    p_modelo:          c.id ?? null,
    p_nome:            c.nome.trim(),
    p_tipo:            c.tipo,
    p_origem:          conteudo.origem,
    p_momento:         c.tipo === 'CONTRATO_PLANO' ? null : c.momento ?? null,
    p_exigencia:       c.exigencia,
    p_texto:           conteudo.origem === 'EDITOR' ? conteudo.texto : null,
    p_arquivo_path:    conteudo.origem === 'ARQUIVO' ? conteudo.arquivo?.path ?? null : null,
    p_arquivo_sha256:  conteudo.origem === 'ARQUIVO' ? conteudo.arquivo?.sha256 ?? null : null,
    p_arquivo_nome:    conteudo.origem === 'ARQUIVO' ? conteudo.arquivo?.nome ?? null : null,
    p_arquivo_tamanho: conteudo.origem === 'ARQUIVO' ? conteudo.arquivo?.tamanho ?? null : null,
    p_arquivo_paginas: conteudo.origem === 'ARQUIVO' ? conteudo.arquivo?.paginas ?? null : null,
    p_variaveis:       conteudo.origem === 'EDITOR' ? conteudo.variaveis : [],
    p_usa_pagamento:   conteudo.origem === 'EDITOR' ? conteudo.usaPagamento : false,
    p_ator:            ator,
  }), 'salvar o modelo de documento')
  return r as { id: string; versao: number; novaVersao: boolean }
}

// ─── Modelo do editor ────────────────────────────────────────────────────────

export async function salvarModeloDoEditor(input: Configuracao & { texto: string }): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'forms', 'MANAGE')

    const recusa = conferir(input)
    if (recusa) return { error: recusa }

    const texto = (input.texto ?? '').replace(/\r\n?/g, '\n')
    const validacao = validarModelo(texto, input.tipo)
    if (validacao.erro) return { error: validacao.erro }

    const r = await salvar(ctx.tenantId!, ctx.internalUserId ?? null, input, {
      origem: 'EDITOR', texto, variaveis: validacao.variaveis, usaPagamento: validacao.usaPagamento,
    })
    revalidar()
    return r
  } catch (e) {
    return { error: mensagem(e) }
  }
}

// ─── Modelo de arquivo (PDF enviado) ─────────────────────────────────────────

/**
 * O PDF vai COMO ESTÁ (decisão do Heitor, 2026-09-29): sem variável, sem
 * preenchimento. Por isso ele é conferido aqui e não depois — criptografado,
 * corrompido ou grande demais, ele falharia na hora de carimbar a assinatura,
 * com o cliente já tendo assinado.
 */
export async function salvarModeloDeArquivo(formData: FormData): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'forms', 'MANAGE')

    const c: Configuracao = {
      id:        (formData.get('id') as string) || null,
      nome:      (formData.get('nome') as string) ?? '',
      tipo:      formData.get('tipo') as TipoDeModelo,
      momento:   (formData.get('momento') as Momento) || null,
      exigencia: formData.get('exigencia') as Exigencia,
    }
    const recusa = conferir(c)
    if (recusa) return { error: recusa }

    const file = formData.get('arquivo')
    const temArquivo = file instanceof File && file.size > 0
    if (!c.id && !temArquivo) return { error: 'Escolha o arquivo PDF do documento.' }

    let arquivo: { path: string; sha256: string; nome: string; tamanho: number; paginas: number } | null = null
    if (temArquivo) {
      if (file.size > MAX_BYTES_DO_PDF) return { error: 'O PDF passou de 10 MB.' }
      const bytes = Buffer.from(await file.arrayBuffer())
      // O cabeçalho, não o tipo que o navegador declarou: o `type` vem do
      // nome do arquivo, e um .docx renomeado passaria.
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'O arquivo não é um PDF.' }

      let paginas: number
      try {
        // Sem `ignoreEncryption`: PDF protegido por senha falha aqui, e é o
        // que se quer — ele não poderia ser carimbado depois.
        const pdf = await PDFDocument.load(bytes)
        paginas = pdf.getPageCount()
      } catch {
        return { error: 'Não consegui abrir este PDF. Ele pode estar protegido por senha ou corrompido — exporte de novo e tente outra vez.' }
      }
      if (paginas < 1) return { error: 'O PDF não tem páginas.' }
      if (paginas > MAX_PAGINAS_DO_PDF) return { error: `O PDF tem ${paginas} páginas; o máximo é ${MAX_PAGINAS_DO_PDF}.` }

      const sha256 = createHash('sha256').update(bytes).digest('hex')
      // O caminho é o hash: o mesmo arquivo enviado duas vezes é o mesmo objeto,
      // e uma versão nunca aponta para um arquivo que outra sobrescreveu.
      const path = `${ctx.tenantId}/${sha256}.pdf`
      await ensurePrivateBucket(MODELOS_DE_DOCUMENTO_BUCKET)
      const admin = createAdminClient()
      const { error: erroUpload } = await admin.storage
        .from(MODELOS_DE_DOCUMENTO_BUCKET)
        .upload(path, bytes, { contentType: 'application/pdf', upsert: false })
      if (erroUpload && !/already exists|Duplicate/i.test(erroUpload.message)) {
        return { error: `Não consegui enviar o PDF: ${erroUpload.message}` }
      }
      arquivo = { path, sha256, nome: file.name.slice(0, 200), tamanho: file.size, paginas }
    }

    const r = await salvar(ctx.tenantId!, ctx.internalUserId ?? null, c, { origem: 'ARQUIVO', arquivo })
    revalidar()
    return r
  } catch (e) {
    return { error: mensagem(e) }
  }
}

// ─── Ativar / desativar ──────────────────────────────────────────────────────

/**
 * Modelo não se apaga — documento emitido aponta para ele. Desativado, ele
 * sai da lista do procedimento e deixa de nascer em atendimento novo.
 */
export async function definirModeloAtivo(id: string, ativo: boolean): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'forms', 'MANAGE')
    const admin = createAdminClient()
    const linhas = await gravar(admin
      .from('document_templates')
      .update({ is_active: ativo, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId!)
      .select('id'), 'mudar a situação do modelo')
    if (!linhas?.length) return { error: 'Modelo não encontrado.' }
    revalidar()
    return { id }
  } catch (e) {
    return { error: mensagem(e) }
  }
}

// ─── Envio do link de assinatura pela conversa ───────────────────────────────

/**
 * Liga ou desliga, para a REDE inteira, o envio do link de assinatura pela
 * conversa do inbox. Por ser da rede, pede abrangência de rede — quem é de
 * uma unidade vê a escolha, mas não a muda.
 */
export async function definirEnvioDoLinkPelaConversa(ligado: boolean): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'forms', 'MANAGE')
    if (ctx.branchId !== null) return { error: 'Esta escolha vale para a rede inteira: quem muda é quem administra a rede.' }
    if (typeof ligado !== 'boolean') return { error: 'Escolha inválida.' }
    const admin = createAdminClient()
    const linhas = await gravar(admin.from('tenants')
      .update({ documentos_link_pela_conversa: ligado })
      .eq('id', ctx.tenantId!)
      .select('id'), 'mudar o envio do link pela conversa')
    if (!linhas?.length) return { error: 'Rede não encontrada.' }
    revalidar()
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    return {}
  } catch (e) {
    return { error: mensagem(e) }
  }
}

// ─── Arquivo do modelo (para conferir) ───────────────────────────────────────

/** Link temporário do PDF de uma versão — só da própria rede. */
export async function linkDoArquivoDoModelo(versaoId: string): Promise<{ url?: string; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'forms', 'MANAGE')
    const admin = createAdminClient()
    const versao = await ler(admin
      .from('document_template_versions')
      .select('file_path')
      .eq('id', versaoId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle(), 'buscar o arquivo do modelo')
    if (!versao?.file_path) return { error: 'Arquivo não encontrado.' }
    const url = await getSignedUrl(MODELOS_DE_DOCUMENTO_BUCKET, versao.file_path, 10 * 60)
    return url ? { url } : { error: 'Não consegui abrir o arquivo agora.' }
  } catch (e) {
    return { error: mensagem(e) }
  }
}
