import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { converterDocumentoDoEditor, corHex, tamanhoEmPontos, type NoPM } from '@/lib/documentos/editor/converter'
import { marcacaoParaEditor } from '@/lib/documentos/editor/da-marcacao'
import { interpolar, formaCanonica, textoDoDocumento, deV1, lerConteudo, variaveisDoDocumento } from '@/lib/documentos/arvore'
import { validarDocumentoDoEditor } from '@/lib/documentos/variaveis'
import { IDS_DE_FONTE, ESTILOS_DE_FONTE, arquivoDaFonte, fonteDoCss } from '@/lib/documentos/fontes'
import { analisarMarcacao, interpolarArvore } from '@/lib/documentos/marcacao'
import { medidasDaImagem } from '@/lib/documentos/editor/medidas-da-imagem'

const REDE = '11111111-2222-4333-8444-555555555555'
const SHA = 'a'.repeat(64)
const doc = (...content: NoPM[]) => ({ corpo: { type: 'doc', content } })
const p = (...content: NoPM[]): NoPM => ({ type: 'paragraph', content })
const txt = (text: string, ...marks: NoPM['marks'] & object): NoPM => ({ type: 'text', text, ...(marks.length ? { marks } : {}) })

function converter(entrada: unknown, tenantId: string | null = REDE) {
  const r = converterDocumentoDoEditor(entrada, { tenantId })
  if ('erro' in r) throw new Error(r.erro)
  return r.documento
}

describe('conversor do editor', () => {
  it('traz o estilo das marcas, na ordem canônica', () => {
    const d = converter(doc(p(
      txt('Olá ', { type: 'bold' }),
      txt('mundo', { type: 'textStyle', attrs: { fontFamily: 'doc-tinos', fontSize: '14pt', color: '#C34D6B' } }, { type: 'italic' }),
    )))
    expect(d.blocos).toEqual([{ tipo: 'paragrafo', trechos: [
      { texto: 'Olá ', negrito: true },
      { texto: 'mundo', italico: true, fonte: 'tinos', tamanho: 14, cor: '#c34d6b' },
    ] }])
    expect(Object.keys(d.blocos[0]!.tipo === 'paragrafo' ? d.blocos[0]!.trechos[1]! : {})).toEqual(['texto', 'italico', 'fonte', 'tamanho', 'cor'])
  })

  it('normaliza o que vem colado do Word', () => {
    expect(fonteDoCss('Calibri, sans-serif')).toBe('carlito')
    expect(fonteDoCss('"Times New Roman", serif')).toBe('tinos')
    expect(fonteDoCss('Comic Sans MS')).toBeNull()
    expect(tamanhoEmPontos('16px')).toBe(12)
    expect(tamanhoEmPontos('13pt')).toBe(12)
    expect(corHex('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(corHex('#abc')).toBe('#aabbcc')
    expect(corHex('javascript:alert(1)')).toBeUndefined()
    const d = converter(doc(p(txt('x', { type: 'textStyle', attrs: { fontFamily: 'Comic Sans MS', fontSize: '11pt', color: 'url(x)' } }))))
    // Fonte desconhecida, tamanho base e cor inválida somem: fica a base.
    expect(d.blocos).toEqual([{ tipo: 'paragrafo', trechos: [{ texto: 'x' }] }])
  })

  it('variável vira trecho com o estilo; nome inválido é recusado', () => {
    const d = converter(doc(p(txt('Eu, '), { type: 'variavel', attrs: { nome: 'cliente.nome' }, marks: [{ type: 'bold' }] })))
    expect(variaveisDoDocumento(d)).toEqual(['cliente.nome'])
    expect(converterDocumentoDoEditor(doc(p({ type: 'variavel', attrs: { nome: 'Nome' } })), { tenantId: null })).toEqual({ erro: expect.stringContaining('variável') })
  })

  it('recusa o que a árvore não conhece', () => {
    expect(converterDocumentoDoEditor(doc({ type: 'codeBlock', content: [txt('x')] }), { tenantId: null })).toEqual({ erro: expect.stringContaining('codeBlock') })
    expect(converterDocumentoDoEditor(doc(p({ type: 'mention', attrs: {} })), { tenantId: null })).toEqual({ erro: expect.stringContaining('mention') })
    expect(converterDocumentoDoEditor('<p>oi</p>', { tenantId: null })).toEqual({ erro: expect.any(String) })
    expect(converterDocumentoDoEditor(doc(p()), { tenantId: null })).toEqual({ erro: 'Escreva o texto do documento.' })
  })

  it('imagem: só da própria rede, com o hash no caminho', () => {
    const img = (caminho: string) => doc({ type: 'imagemDoDocumento', attrs: { caminho, sha256: SHA, largura: 120, altura: 40, alinhar: 'centro' } })
    expect(converter(img(`${REDE}/imagens/${SHA}.png`)).blocos[0]).toEqual({ tipo: 'imagem', caminho: `${REDE}/imagens/${SHA}.png`, sha256: SHA, largura: 120, altura: 40, alinhar: 'centro' })
    const outra = '99999999-2222-4333-8444-555555555555'
    expect(converterDocumentoDoEditor(img(`${outra}/imagens/${SHA}.png`), { tenantId: REDE })).toEqual({ erro: expect.stringContaining('não é desta rede') })
    expect(converterDocumentoDoEditor(img(`${REDE}/imagens/../x.png`), { tenantId: REDE })).toEqual({ erro: expect.stringContaining('inválida') })
  })

  it('tabela: larguras em fração, colspan aceito, rowspan e tabela dentro de tabela recusados', () => {
    const cel = (t: string, attrs: Record<string, unknown> = {}): NoPM => ({ type: 'tableCell', attrs, content: [p(txt(t))] })
    const d = converter(doc({ type: 'table', content: [
      { type: 'tableRow', content: [{ ...cel('A', { colwidth: [300] }), type: 'tableHeader' }, cel('B', { colwidth: [100] })] },
      { type: 'tableRow', content: [cel('C', { colspan: 2 })] },
    ] }))
    const t = d.blocos[0]!
    expect(t.tipo === 'tabela' && t.larguras).toEqual([0.75, 0.25])
    expect(t.tipo === 'tabela' && t.linhas[0]!.celulas[0]!.cabecalho).toBe(true)
    expect(t.tipo === 'tabela' && t.linhas[1]!.celulas[0]!.colspan).toBe(2)
    expect(converterDocumentoDoEditor(doc({ type: 'table', content: [{ type: 'tableRow', content: [cel('x', { rowspan: 2 })] }] }), { tenantId: null }))
      .toEqual({ erro: expect.stringContaining('vertical') })
    const aninhada = doc({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'table', content: [] }] }] }] })
    expect(converterDocumentoDoEditor(aninhada, { tenantId: null })).toEqual({ erro: expect.stringContaining('dentro de tabela') })
  })

  it('assinatura e quebra só onde fazem sentido', () => {
    const cab = { corpo: doc(p(txt('x'))).corpo, cabecalho: { type: 'doc', content: [{ type: 'assinatura' }] } }
    expect(converterDocumentoDoEditor(cab, { tenantId: null })).toEqual({ erro: expect.stringContaining('assinatura') })
    const naLista = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'quebraDePagina' }] }] })
    expect(converterDocumentoDoEditor(naLista, { tenantId: null })).toEqual({ erro: expect.stringContaining('quebra') })
  })
})

describe('marcação antiga → editor → árvore', () => {
  const MARCACAO = '# Termo — {{procedimento.nome}}\n\nEu, **{{cliente.nome}}**, autorizo.\nSegunda linha.\n\n- um\n- dois\n\n---\n\n[[assinatura]]'

  it('o texto resolvido é o mesmo que a marcação produzia', () => {
    const valores: Record<string, string> = { 'procedimento.nome': 'Toxina', 'cliente.nome': 'Ana' }
    const novo = interpolar(converter(marcacaoParaEditor(MARCACAO), null), v => valores[v] ?? null, () => false)
    const antigo = interpolarArvore(analisarMarcacao(MARCACAO), v => valores[v] ?? null, () => false)
    expect(textoDoDocumento(novo.documento)).toBe(textoDoDocumento(deV1(antigo.arvore)))
    expect(novo.documento.blocos[0]).toEqual({ tipo: 'titulo', nivel: 1, alinhar: 'centro', trechos: [{ texto: 'Termo — Toxina' }] })
    expect(novo.documento.blocos[1]).toEqual({ tipo: 'paragrafo', trechos: [{ texto: 'Eu, ' }, { texto: 'Ana', negrito: true }, { texto: ', autorizo.\nSegunda linha.' }] })
  })

  it('obrigatória faltando vai para `faltando`; opcional sai vazia', () => {
    const r = interpolar(converter(marcacaoParaEditor('{{cliente.nome}} {{cliente.email}}'), null), () => null, v => v === 'cliente.email')
    expect(r.faltando).toEqual(['cliente.nome'])
  })

  it('a forma canônica não depende da ordem das chaves do JSON do editor', () => {
    const a = { corpo: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center', entrelinhas: 1.5 }, content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }] }] } }
    const b = { corpo: { content: [{ content: [{ marks: [{ type: 'italic' }, { type: 'bold' }], text: 'x', type: 'text' }], attrs: { entrelinhas: 1.5, textAlign: 'center' }, type: 'paragraph' }], type: 'doc' } }
    const canon = (e: unknown) => formaCanonica(interpolar(converter(e, null), () => null, () => true).documento)
    expect(canon(a)).toBe(canon(b))
    expect(lerConteudo(canon(a))?.blocos[0]).toEqual({ tipo: 'paragrafo', alinhar: 'centro', entrelinhas: 1.5, trechos: [{ texto: 'x', negrito: true, italico: true }] })
  })

  it('o conteúdo v1 gravado ainda se lê', () => {
    const v1 = JSON.stringify([{ tipo: 'titulo', nivel: 1, trechos: [{ texto: 'T' }] }, { tipo: 'assinatura' }])
    expect(lerConteudo(v1)?.blocos).toEqual([{ tipo: 'titulo', nivel: 1, alinhar: 'centro', trechos: [{ texto: 'T' }] }, { tipo: 'assinatura' }])
  })
})

describe('validação do documento do editor', () => {
  it('variável fora do tipo aponta o rótulo', () => {
    const r = validarDocumentoDoEditor(doc(p({ type: 'variavel', attrs: { nome: 'agendamento.data' } })), 'TERMO', null)
    expect(r.erro).toMatch(/não serve em termo/)
    const ok = validarDocumentoDoEditor(doc(p({ type: 'variavel', attrs: { nome: 'cliente.nome' } })), 'TERMO', null)
    expect(ok).toMatchObject({ variaveis: ['cliente.nome'], usaPagamento: false })
    expect(ok.documento).toBeTruthy()
  })

  it('o pagamento vale no contrato do procedimento e no de plano, não no termo', () => {
    const comPagamento = doc(p({ type: 'variavel', attrs: { nome: 'pagamento.forma' } }), p({ type: 'variavel', attrs: { nome: 'pagamento.metodo' } }))
    expect(validarDocumentoDoEditor(comPagamento, 'CONTRATO', null)).toMatchObject({ usaPagamento: true, variaveis: ['pagamento.forma', 'pagamento.metodo'] })
    expect(validarDocumentoDoEditor(comPagamento, 'CONTRATO_PLANO', null).erro).toBeUndefined()
    expect(validarDocumentoDoEditor(comPagamento, 'TERMO', null).erro).toMatch(/não servem em termo/)
  })
})

describe('medidas da imagem (pelo cabeçalho do arquivo)', () => {
  it('PNG e JPEG têm tipo e medidas; o resto é recusado', async () => {
    const QRCode = (await import('qrcode')).default
    const png = new Uint8Array(await QRCode.toBuffer('x', { width: 120, margin: 0 }))
    expect(medidasDaImagem(png)).toMatchObject({ tipo: 'png' })
    expect(medidasDaImagem(png)!.largura).toBeGreaterThan(0)
    // JPEG mínimo: SOI + APP0 curto + SOF0 com 300 × 200.
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(medidasDaImagem(jpg)).toEqual({ tipo: 'jpg', largura: 300, altura: 200 })
    expect(medidasDaImagem(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(medidasDaImagem(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
  })
})

describe('fontes', () => {
  it('cada fonte do catálogo tem os quatro arquivos em public/', () => {
    const faltam = IDS_DE_FONTE.flatMap(f => ESTILOS_DE_FONTE.map(e => arquivoDaFonte(f, e)))
      .filter(a => !existsSync(path.join(__dirname, '..', 'public', a)))
    expect(faltam).toEqual([])
  })
})
