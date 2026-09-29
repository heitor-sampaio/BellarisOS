import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar } from '@/lib/db'
import { limparParaWinAnsi } from '@/lib/pdf'
import { ensurePrivateBucket, DOCUMENTOS_ASSINADOS_BUCKET, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import { imagensDoDocumento, lerConteudo, PAGINA, type DocumentoResolvido, type Trecho } from './arvore'
import { FONTE_BASE } from './fontes'
import { bytesDaImagem } from './imagens'
import { FontesDoPdf } from './pdf/fontes'
import {
  diagramarDocumento, fontesDoDocumento, itensDeTexto, Paginador, type Contexto, type Item,
} from './pdf/diagramacao'
import { sha256 } from './renderizar'

/**
 * O PDF final de um documento assinado: o documento (desenhado da MESMA árvore
 * que a tela mostrou, com as mesmas fontes — `pdf/diagramacao.ts` —, ou o PDF
 * enviado pela clínica, como está), com um rodapé de assinatura em toda página
 * e uma PÁGINA DE EVIDÊNCIAS no fim — assinante, canal, identidade, horários,
 * IP, aparelho, o SHA-256 do que foi assinado, o código e o QR de verificação,
 * a trilha e a imagem da assinatura.
 *
 * Gerado depois da assinatura (`after()`, e o cron `documentos-pdf` recolhe o
 * que ficar para trás). Uma vez só: `documento_registrar_pdf` só grava se
 * ainda não houver PDF.
 */

const CINZA = rgb(0.42, 0.42, 0.42)

const CANAL: Record<string, string> = {
  CLINICA: 'Na clínica, na tela (presencial)', PAPEL: 'No papel (presencial)',
  PORTAL: 'Pelo portal do cliente', LINK: 'Por link enviado ao cliente',
}
const IDENTIDADE: Record<string, string> = {
  PRESENCIAL: 'Documento de identidade conferido pela equipe', SESSAO_PORTAL: 'Sessão autenticada do cliente no portal',
  CPF: 'CPF informado pelo cliente', NASCIMENTO: 'Data de nascimento informada pelo cliente',
  LEGADO: 'Assinatura colhida antes dos modelos de documento',
}
const EVENTO: Record<string, string> = {
  EMITIDO: 'Emitido', GERADO: 'Texto montado', INCOMPLETO: 'Aguardando dados do cadastro', VISUALIZADO: 'Aberto pelo cliente',
  LINK_GERADO: 'Link de assinatura gerado', LINK_REVOGADO: 'Link de assinatura revogado', LINK_ENVIADO_CONVERSA: 'Link enviado pela conversa do WhatsApp', IDENTIDADE_OK: 'Identidade conferida', IDENTIDADE_FALHOU: 'Identidade recusada',
  ASSINADO: 'Assinado', SUBSTITUIDO: 'Substituído', PDF_GERADO: 'PDF gerado',
}

const quando = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: tz }).format(new Date(iso))

function mascararDocumento(doc: string | null): string | null {
  const d = (doc ?? '').replace(/\D/g, '')
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  return d ? '(informado)' : null
}

export function urlDeVerificacao(codigo: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return `${base}/verificar/${codigo}`
}

async function pngDoDataUrl(pdf: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl?.startsWith('data:image/png;base64,')) return null
  try { return await pdf.embedPng(Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')) } catch { return null }
}

/** As imagens do documento, embutidas — cada uma conferida pelo sha256. */
async function imagensEmbutidas(pdf: PDFDocument, doc: DocumentoResolvido): Promise<Map<string, PDFImage>> {
  const mapa = new Map<string, PDFImage>()
  for (const { caminho, sha256: hash } of imagensDoDocumento(doc)) {
    const bytes = await bytesDaImagem(caminho, hash)
    mapa.set(caminho, caminho.endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes))
  }
  return mapa
}

// ─── Montar e gravar ─────────────────────────────────────────────────────────

/** Gera, guarda e registra o PDF de um documento assinado. Devolve o caminho. */
export async function gerarPdfAssinado(tenantId: string, docId: string): Promise<string | null> {
  const admin = createAdminClient()
  const doc = await ler(admin.from('issued_documents')
    .select('id, tenant_id, branch_id, client_id, kind, source, title, status, content, content_text, content_sha256, verification_code, signed_at, signed_pdf_path, template_version_id')
    .eq('id', docId).eq('tenant_id', tenantId).abortSignal(new AbortController().signal).maybeSingle(), 'buscar o documento assinado')
  if (!doc || doc.status !== 'ASSINADO') return null
  if (doc.signed_pdf_path) return doc.signed_pdf_path as string

  const [assinatura, rede, unidade, versao, eventos] = await Promise.all([
    ler(admin.from('document_signatures')
      .select('channel, identity_method, signer_name, signer_document, signature_png, ip, user_agent, content_sha256, conducted_by, accepted_text, signed_at')
      .eq('issued_document_id', doc.id).single(), 'buscar a assinatura'),
    ler(admin.from('tenants').select('name, document').eq('id', tenantId).single(), 'buscar a rede'),
    doc.branch_id
      ? ler(admin.from('branches').select('name, document').eq('id', doc.branch_id).maybeSingle(), 'buscar a unidade')
      : Promise.resolve(null),
    doc.template_version_id
      ? ler(admin.from('document_template_versions').select('version, file_path').eq('id', doc.template_version_id).maybeSingle(), 'buscar a versão do modelo')
      : Promise.resolve(null),
    ler(admin.from('issued_document_events').select('kind, channel, created_at')
      .eq('issued_document_id', doc.id).order('created_at'), 'buscar a trilha do documento'),
  ])
  if (!assinatura) return null
  let conduzidoPor: string | null = null
  if (assinatura.conducted_by) {
    const u = await ler(admin.from('users').select('name').eq('id', assinatura.conducted_by).maybeSingle(), 'buscar quem conduziu')
    conduzidoPor = (u?.name as string) ?? null
  }

  // O documento: o PDF enviado (como está) ou a árvore desenhada.
  let pdf: PDFDocument
  if (doc.source === 'ARQUIVO' && versao?.file_path) {
    const { data: original, error } = await admin.storage.from(MODELOS_DE_DOCUMENTO_BUCKET).download(versao.file_path as string)
    if (error || !original) throw new Error(`Não consegui abrir o PDF do modelo: ${error?.message}`)
    pdf = await PDFDocument.load(Buffer.from(await original.arrayBuffer()))
  } else {
    pdf = await PDFDocument.create()
  }
  const fontes = new FontesDoPdf(pdf)
  const imagem = await pngDoDataUrl(pdf, assinatura.signature_png as string | null)
  const nome = assinatura.signer_name as string

  // O que a tela mostrou; o legado sem árvore vira título + texto corrido.
  const arvore: DocumentoResolvido | null = doc.source === 'EDITOR'
    ? (doc.content
        ? lerConteudo(doc.content as string)
        : {
            versao: 2, base: { fonte: FONTE_BASE, tamanho: 11 }, cabecalho: [], rodape: [],
            blocos: [
              { tipo: 'titulo', nivel: 1, alinhar: 'centro', trechos: [{ texto: doc.title as string }] },
              ...String(doc.content_text ?? '').split(/\n\s*\n/).map(t => ({ tipo: 'paragrafo' as const, trechos: [{ texto: t }] })),
            ],
          })
    : null

  // As fontes da página de evidências são a base (Arimo): Unicode inteiro,
  // então um nome com acento ou símbolo sai como é.
  await fontes.preparar([[FONTE_BASE, 'regular'], [FONTE_BASE, 'negrito'], ...(arvore ? fontesDoDocumento(arvore) : [])])

  if (arvore) {
    const ctx: Contexto = { fontes, base: arvore.base, imagens: await imagensEmbutidas(pdf, arvore), assinatura: { imagem, nome } }
    diagramarDocumento(pdf, arvore, ctx)
  }

  // ── Página de evidências ──
  const ctx: Contexto = { fontes, base: { fonte: FONTE_BASE, tamanho: 9.5 }, imagens: new Map(), assinatura: { imagem, nome } }
  const largura = PAGINA.largura - 2 * PAGINA.margem
  const p = new Paginador(pdf)
  p.novaPagina()
  const texto = (trechos: Trecho[], opcoes: { tamanho?: number; cinza?: boolean } = {}): Item[] =>
    itensDeTexto(trechos, largura, ctx, { tamanho: opcoes.tamanho, cor: opcoes.cinza ? CINZA : undefined })
  const par = (rotulo: string, valor: string | null) =>
    (valor ? p.colocar(texto([{ texto: `${rotulo}: `, negrito: true }, { texto: valor }])) : undefined)
  const espaco = (altura: number): Item => ({ tipo: 'espaco', altura })

  const codigo = (doc.verification_code as string | null) ?? '—'
  const url = urlDeVerificacao(codigo)
  p.colocar([...texto([{ texto: 'Página de evidências da assinatura eletrônica', negrito: true }], { tamanho: 14 }), espaco(6)])
  par('Documento', `${doc.title}${versao?.version ? ` (modelo, versão ${versao.version})` : ''}`)
  par('Rede', [rede?.name, rede?.document].filter(Boolean).join(' — '))
  if (unidade) par('Unidade', [unidade.name, unidade.document].filter(Boolean).join(' — '))
  par('Assinante', [nome, mascararDocumento(assinatura.signer_document as string | null)].filter(Boolean).join(', CPF '))
  par('Canal', CANAL[assinatura.channel as string] ?? String(assinatura.channel))
  par('Identidade', IDENTIDADE[assinatura.identity_method as string] ?? String(assinatura.identity_method))
  par('Conduzido por', conduzidoPor)
  par('Aceite', assinatura.accepted_text as string | null)
  par('Assinado em', `${quando(assinatura.signed_at as string, 'America/Sao_Paulo')} (Brasília) · ${quando(assinatura.signed_at as string, 'UTC')} (UTC)`)
  par('IP', (assinatura.ip as string | null) ?? null)
  par('Aparelho', (assinatura.user_agent as string | null) ?? null)
  par('SHA-256 do conteúdo assinado', assinatura.content_sha256 as string)
  par('Código de verificação', codigo)
  par('Conferir em', url)

  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 1, width: 180 }))
  p.colocar([espaco(6), {
    tipo: 'linha', altura: 100, dx: 0,
    desenhar: (pg, x, yTopo) => {
      pg.drawImage(qr, { x, y: yTopo - 92, width: 92, height: 92 })
      if (imagem) {
        const escala = Math.min(180 / imagem.width, 70 / imagem.height)
        pg.drawImage(imagem, { x: x + 130, y: yTopo - 80, width: imagem.width * escala, height: imagem.height * escala })
      }
    },
  }])

  p.colocar(texto([{ texto: 'Trilha do documento', negrito: true }], { tamanho: 10.5 }))
  for (const e of (eventos ?? [])) {
    p.colocar(texto([{ texto: `${quando(e.created_at as string, 'America/Sao_Paulo')} — ${EVENTO[e.kind as string] ?? e.kind}${e.channel ? ` (${CANAL[e.channel as string] ?? e.channel})` : ''}` }], { tamanho: 8.5, cinza: true }))
  }
  p.colocar([espaco(8), ...texto([{
    texto: 'Documento assinado eletronicamente (assinatura eletrônica simples, Lei nº 14.063/2020), com validade entre as partes nos '
      + 'termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. A integridade e a autenticidade podem ser conferidas pelo '
      + 'código de verificação no endereço acima.',
  }], { tamanho: 8, cinza: true })])

  // ── Rodapé em todas as páginas (inclusive as do PDF enviado) ──
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
  const rodape = limparParaWinAnsi(`Assinado eletronicamente · Código ${codigo} · ${url}`)
  for (const pagina of pdf.getPages()) {
    const tamanho = 7
    const w = helvetica.widthOfTextAtSize(rodape, tamanho)
    pagina.drawText(rodape, { x: Math.max(12, (pagina.getWidth() - w) / 2), y: 16, size: tamanho, font: helvetica, color: CINZA })
  }

  const assinadoEm = new Date(assinatura.signed_at as string)
  pdf.setTitle(doc.title as string)
  pdf.setProducer('BellarisOS')
  pdf.setCreator('BellarisOS')
  pdf.setCreationDate(assinadoEm)
  pdf.setModificationDate(assinadoEm)
  const bytes = Buffer.from(await pdf.save())

  const caminho = `${tenantId}/${doc.client_id}/${doc.id}/assinado.pdf`
  await ensurePrivateBucket(DOCUMENTOS_ASSINADOS_BUCKET)
  const { error: erroUpload } = await admin.storage.from(DOCUMENTOS_ASSINADOS_BUCKET)
    .upload(caminho, bytes, { contentType: 'application/pdf', upsert: false })
  if (erroUpload && !/already exists|Duplicate/i.test(erroUpload.message)) throw new Error(`Não consegui guardar o PDF assinado: ${erroUpload.message}`)
  if (erroUpload) return caminho // outra geração chegou antes; a dela vale.

  const gravou = await gravar(admin.rpc('documento_registrar_pdf', {
    p_doc: doc.id, p_tenant: tenantId, p_path: caminho, p_sha256: sha256(bytes),
  }), 'registrar o PDF assinado')
  if (!gravou) {
    // Outra passagem registrou primeiro: o arquivo dela é o que vale.
    await tentar(admin.storage.from(DOCUMENTOS_ASSINADOS_BUCKET).remove([caminho]), 'desfazer o PDF que sobrou (outra geração registrou antes)')
  }
  return caminho
}
