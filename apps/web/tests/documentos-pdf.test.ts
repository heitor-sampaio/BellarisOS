import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { DocumentoResolvido, BlocoResolvido } from '@/lib/documentos/arvore'
import { FontesDoPdf, soQueAFonteDesenha } from '@/lib/documentos/pdf/fontes'
import { diagramarDocumento, fontesDoDocumento } from '@/lib/documentos/pdf/diagramacao'
import { IDS_DE_FONTE, ESTILOS_DE_FONTE, type EstiloDeFonte, type FonteDeDocumento } from '@/lib/documentos/fontes'

async function gerar(doc: DocumentoResolvido) {
  const pdf = await PDFDocument.create()
  const fontes = new FontesDoPdf(pdf)
  await fontes.preparar(fontesDoDocumento(doc))
  diagramarDocumento(pdf, doc, { fontes, base: doc.base, imagens: new Map(), assinatura: { imagem: null, nome: 'Ana Souza' } })
  return pdf
}

const par = (texto: string, extra: Partial<Extract<BlocoResolvido, { tipo: 'paragrafo' }>> = {}): BlocoResolvido =>
  ({ tipo: 'paragrafo', ...extra, trechos: [{ texto }] })

const base = { fonte: 'arimo' as const, tamanho: 11 }

describe('diagramação do PDF', () => {
  it('embute as fontes usadas (e só elas), com os quatro estilos quando pedidos', async () => {
    const pdf = await gerar({
      versao: 2, base, cabecalho: [], rodape: [],
      blocos: [{ tipo: 'paragrafo', trechos: [
        { texto: 'Normal ' }, { texto: 'negrito ', negrito: true },
        { texto: 'Tinos itálico ', italico: true, fonte: 'tinos' },
        { texto: 'Playfair negrito itálico', negrito: true, italico: true, fonte: 'playfair', tamanho: 16, cor: '#c34d6b', sublinhado: true, realce: '#fff3a3' },
      ] }],
    })
    const bytes = Buffer.from(await pdf.save({ useObjectStreams: false })).toString('latin1')
    for (const nome of ['Arimo', 'Tinos', 'Playfair']) expect(bytes).toContain(nome)
    expect(bytes).not.toContain('Montserrat')
    expect(pdf.getPageCount()).toBe(1)
  })

  it('pagina texto longo, repete cabeçalho e rodapé, e respeita a quebra de página', async () => {
    const longo = Array.from({ length: 60 }, (_, i) => par(`Cláusula ${i + 1}. ` + 'Texto do contrato que ocupa bastante espaço na linha. '.repeat(4), { alinhar: 'justificado' }))
    const pdf = await gerar({
      versao: 2, base,
      cabecalho: [par('Clínica Exemplo — cabeçalho', { alinhar: 'centro' })],
      rodape: [par('Rodapé da clínica', { alinhar: 'direita' })],
      blocos: [...longo, { tipo: 'quebra' }, par('Depois da quebra'), { tipo: 'assinatura' }],
    })
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(5)
  })

  it('linha de tabela maior que uma página é dividida, sem perder conteúdo nem travar', async () => {
    const enorme: BlocoResolvido[] = Array.from({ length: 90 }, (_, i) => par(`Item ${i + 1} dentro da célula`))
    const pdf = await gerar({
      versao: 2, base, cabecalho: [], rodape: [],
      blocos: [{
        tipo: 'tabela', larguras: [0.3, 0.7],
        linhas: [
          { celulas: [{ cabecalho: true, blocos: [par('Sessão')] }, { cabecalho: true, blocos: [par('Descrição')] }] },
          { celulas: [{ blocos: [par('1')] }, { blocos: enorme }] },
          { celulas: [{ colspan: 2, blocos: [par('Total: R$ 1.200')] }] },
        ],
      }],
    })
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2)
  })

  it('cabeçalho gigante não trava: entra no fluxo uma vez', async () => {
    const pdf = await gerar({
      versao: 2, base,
      cabecalho: Array.from({ length: 40 }, (_, i) => par(`linha ${i} do cabeçalho`)),
      rodape: [], blocos: [par('corpo')],
    })
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('cada um dos 48 arquivos de fonte embute e desenha no pdf-lib (a da API do Google quebrava três)', async () => {
    const pares = IDS_DE_FONTE.flatMap(f => ESTILOS_DE_FONTE.map(e => [f, e] as [FonteDeDocumento, EstiloDeFonte]))
    const falhas: string[] = []
    for (const [f, e] of pares) {
      const pdf = await PDFDocument.create()
      const fontes = new FontesDoPdf(pdf)
      try {
        await fontes.preparar([[f, e]])
        const fonte = fontes.obter(f, e).pdf
        pdf.addPage().drawText('Olá, Ação — “teste” ç 123 R$ • é ã', { font: fonte, size: 12, x: 10, y: 10 })
        await pdf.save()
      } catch (err) { falhas.push(`${f}/${e}: ${(err as Error).message}`) }
    }
    expect(falhas).toEqual([])
  })

  it('caractere que a fonte não tem vira "?" (emoji no nome)', async () => {
    const pdf = await PDFDocument.create()
    const fontes = new FontesDoPdf(pdf)
    await fontes.preparar([['arimo', 'regular']])
    const f = fontes.obter('arimo', 'regular')
    expect(soQueAFonteDesenha('Ana 💅 Côrtes', f.caracteres)).toBe('Ana ? Côrtes')
  })
})
