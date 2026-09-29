import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar } from '@/lib/db'
import { limparParaWinAnsi } from '@/lib/pdf'
import { ensurePrivateBucket, DOCUMENTOS_ASSINADOS_BUCKET, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import type { ArvoreResolvida, TrechoResolvido } from './marcacao'
import { sha256 } from './renderizar'

/**
 * O PDF final de um documento assinado: o documento (desenhado da MESMA árvore
 * que a tela mostrou, ou o PDF enviado pela clínica, como está), com um rodapé
 * de assinatura em toda página e uma PÁGINA DE EVIDÊNCIAS no fim — assinante,
 * canal, identidade, horários, IP, aparelho, o SHA-256 do que foi assinado, o
 * código e o QR de verificação, a trilha e a imagem da assinatura.
 *
 * Gerado depois da assinatura (`after()`, e o cron `documentos-pdf` recolhe o
 * que ficar para trás). Uma vez só: `documento_registrar_pdf` só grava se
 * ainda não houver PDF.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const RODAPE = 34
const PRETO = rgb(0.13, 0.13, 0.13)
const CINZA = rgb(0.42, 0.42, 0.42)
const LINHA = rgb(0.8, 0.8, 0.8)

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
  LINK_GERADO: 'Link de assinatura gerado', LINK_REVOGADO: 'Link de assinatura revogado', IDENTIDADE_OK: 'Identidade conferida', IDENTIDADE_FALHOU: 'Identidade recusada',
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

// ─── Escrever com quebra de linha e de página ────────────────────────────────

class Folhas {
  pagina!: PDFPage
  y = 0
  constructor(readonly pdf: PDFDocument, readonly normal: PDFFont, readonly negrito: PDFFont) { this.novaPagina() }

  novaPagina() {
    this.pagina = this.pdf.addPage(A4)
    this.y = A4[1] - MARGEM
  }

  garantir(altura: number) {
    if (this.y - altura < MARGEM + RODAPE) this.novaPagina()
  }

  get largura() { return A4[0] - 2 * MARGEM }

  /** Um parágrafo de trechos (negrito ou não), com quebra de linha medida. */
  escrever(trechos: TrechoResolvido[], opcoes: { tamanho?: number; recuo?: number; centralizar?: boolean; cor?: ReturnType<typeof rgb>; prefixo?: string } = {}) {
    const tamanho = opcoes.tamanho ?? 10.5
    const alturaDaLinha = tamanho * 1.45
    const recuo = opcoes.recuo ?? 0
    const maxLargura = this.largura - recuo

    type Palavra = { texto: string; negrito: boolean }
    const linhas: Palavra[][] = [[]]
    let larguraAtual = 0
    const medir = (p: Palavra) => (p.negrito ? this.negrito : this.normal).widthOfTextAtSize(p.texto, tamanho)

    const pedacos: Palavra[] = []
    if (opcoes.prefixo) pedacos.push({ texto: opcoes.prefixo + ' ', negrito: false })
    for (const t of trechos) {
      for (const parte of limparParaWinAnsi(t.texto.replace(/\r?\n/g, '\u0000')).split(/(\s+|\u0000)/)) {
        if (parte) pedacos.push({ texto: parte, negrito: !!t.negrito })
      }
    }
    for (const p of pedacos) {
      if (p.texto === '\u0000') { linhas.push([]); larguraAtual = 0; continue }
      const w = medir(p)
      if (larguraAtual + w > maxLargura && larguraAtual > 0 && p.texto.trim()) {
        linhas.push([]); larguraAtual = 0
      }
      if (!linhas[linhas.length - 1]!.length && !p.texto.trim()) continue
      linhas[linhas.length - 1]!.push(p)
      larguraAtual += w
    }

    for (const linha of linhas) {
      this.garantir(alturaDaLinha)
      const total = linha.reduce((s, p) => s + medir(p), 0)
      let x = MARGEM + recuo + (opcoes.centralizar ? Math.max(0, (maxLargura - total) / 2) : 0)
      for (const p of linha) {
        const fonte = p.negrito ? this.negrito : this.normal
        this.pagina.drawText(p.texto, { x, y: this.y - tamanho, size: tamanho, font: fonte, color: opcoes.cor ?? PRETO })
        x += fonte.widthOfTextAtSize(p.texto, tamanho)
      }
      this.y -= alturaDaLinha
    }
  }

  espaco(pts: number) { this.y -= pts }

  divisoria() {
    this.garantir(12)
    this.pagina.drawLine({ start: { x: MARGEM, y: this.y - 4 }, end: { x: A4[0] - MARGEM, y: this.y - 4 }, thickness: 0.6, color: LINHA })
    this.y -= 12
  }

  par(rotulo: string, valor: string | null) {
    if (!valor) return
    this.escrever([{ texto: `${rotulo}: `, negrito: true }, { texto: valor }], { tamanho: 9.5 })
  }

  assinatura(imagem: PDFImage | null, nome: string) {
    this.garantir(110)
    this.espaco(14)
    const centro = A4[0] / 2
    if (imagem) {
      const escala = Math.min(200 / imagem.width, 70 / imagem.height)
      const w = imagem.width * escala, h = imagem.height * escala
      this.pagina.drawImage(imagem, { x: centro - w / 2, y: this.y - 72 + (72 - h) / 2, width: w, height: h })
    }
    this.y -= 76
    this.pagina.drawLine({ start: { x: centro - 130, y: this.y }, end: { x: centro + 130, y: this.y }, thickness: 0.8, color: CINZA })
    this.y -= 4
    this.escrever([{ texto: nome }], { tamanho: 9, centralizar: true, cor: CINZA })
  }
}

function desenharArvore(f: Folhas, arvore: ArvoreResolvida, imagem: PDFImage | null, nome: string) {
  let assinou = false
  for (const b of arvore) {
    switch (b.tipo) {
      case 'titulo':
        f.espaco(b.nivel === 1 ? 4 : 8)
        f.escrever(b.trechos.map(t => ({ ...t, negrito: true as const })), { tamanho: b.nivel === 1 ? 15 : 11.5, centralizar: b.nivel === 1 })
        f.espaco(4)
        break
      case 'paragrafo':
        // As linhas do parágrafo mantêm a quebra, como na tela.
        f.escrever(b.linhas.flatMap((l, i) => (i ? [{ texto: '\n' }, ...l] : l)))
        f.espaco(6)
        break
      case 'lista':
        b.itens.forEach((it, i) => f.escrever(it, { recuo: 14, prefixo: b.ordenada ? `${i + 1}.` : '•' }))
        f.espaco(6)
        break
      case 'divisoria':
        f.divisoria()
        break
      case 'assinatura':
        f.assinatura(imagem, nome); assinou = true
        break
    }
  }
  if (!assinou) f.assinatura(imagem, nome)
}

// ─── Montar e gravar ─────────────────────────────────────────────────────────

async function pngDoDataUrl(pdf: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl?.startsWith('data:image/png;base64,')) return null
  try { return await pdf.embedPng(Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')) } catch { return null }
}

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
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  const imagem = await pngDoDataUrl(pdf, assinatura.signature_png as string | null)
  const nome = assinatura.signer_name as string

  if (doc.source === 'EDITOR') {
    const f = new Folhas(pdf, normal, negrito)
    if (doc.content) {
      desenharArvore(f, JSON.parse(doc.content as string) as ArvoreResolvida, imagem, nome)
    } else {
      // Legado: só o texto corrido de antes.
      f.escrever([{ texto: doc.title as string, negrito: true }], { tamanho: 14, centralizar: true })
      f.espaco(8)
      for (const bloco of String(doc.content_text ?? '').split(/\n\s*\n/)) { f.escrever([{ texto: bloco }]); f.espaco(6) }
      f.assinatura(imagem, nome)
    }
  }

  // ── Página de evidências ──
  const f = new Folhas(pdf, normal, negrito)
  const codigo = (doc.verification_code as string | null) ?? '—'
  const url = urlDeVerificacao(codigo)
  f.escrever([{ texto: 'Página de evidências da assinatura eletrônica', negrito: true }], { tamanho: 14 })
  f.espaco(6)
  f.par('Documento', `${doc.title}${versao?.version ? ` (modelo, versão ${versao.version})` : ''}`)
  f.par('Rede', [rede?.name, rede?.document].filter(Boolean).join(' — '))
  if (unidade) f.par('Unidade', [unidade.name, unidade.document].filter(Boolean).join(' — '))
  f.par('Assinante', [nome, mascararDocumento(assinatura.signer_document as string | null)].filter(Boolean).join(', CPF '))
  f.par('Canal', CANAL[assinatura.channel as string] ?? String(assinatura.channel))
  f.par('Identidade', IDENTIDADE[assinatura.identity_method as string] ?? String(assinatura.identity_method))
  f.par('Conduzido por', conduzidoPor)
  f.par('Aceite', assinatura.accepted_text as string | null)
  f.par('Assinado em', `${quando(assinatura.signed_at as string, 'America/Sao_Paulo')} (Brasília) · ${quando(assinatura.signed_at as string, 'UTC')} (UTC)`)
  f.par('IP', (assinatura.ip as string | null) ?? null)
  f.par('Aparelho', (assinatura.user_agent as string | null) ?? null)
  f.par('SHA-256 do conteúdo assinado', assinatura.content_sha256 as string)
  f.par('Código de verificação', codigo)
  f.par('Conferir em', url)
  f.espaco(6)

  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 1, width: 180 }))
  f.garantir(100)
  f.pagina.drawImage(qr, { x: MARGEM, y: f.y - 92, width: 92, height: 92 })
  if (imagem) {
    const escala = Math.min(180 / imagem.width, 70 / imagem.height)
    f.pagina.drawImage(imagem, { x: MARGEM + 130, y: f.y - 80, width: imagem.width * escala, height: imagem.height * escala })
  }
  f.y -= 104

  f.escrever([{ texto: 'Trilha do documento', negrito: true }], { tamanho: 10.5 })
  for (const e of (eventos ?? [])) {
    f.escrever([{ texto: `${quando(e.created_at as string, 'America/Sao_Paulo')} — ${EVENTO[e.kind as string] ?? e.kind}${e.channel ? ` (${CANAL[e.channel as string] ?? e.channel})` : ''}` }], { tamanho: 8.5, cor: CINZA })
  }
  f.espaco(8)
  f.escrever([{
    texto: 'Documento assinado eletronicamente (assinatura eletrônica simples, Lei nº 14.063/2020), com validade entre as partes nos '
      + 'termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. A integridade e a autenticidade podem ser conferidas pelo '
      + 'código de verificação no endereço acima.',
  }], { tamanho: 8, cor: CINZA })

  // ── Rodapé em todas as páginas ──
  const rodape = limparParaWinAnsi(`Assinado eletronicamente · Código ${codigo} · ${url}`)
  for (const pagina of pdf.getPages()) {
    const tamanho = 7
    const w = normal.widthOfTextAtSize(rodape, tamanho)
    pagina.drawText(rodape, { x: Math.max(12, (pagina.getWidth() - w) / 2), y: 16, size: tamanho, font: normal, color: CINZA })
  }

  const assinadoEm = new Date(assinatura.signed_at as string)
  pdf.setTitle(limparParaWinAnsi(doc.title as string))
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
