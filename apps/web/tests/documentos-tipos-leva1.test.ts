import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TIPOS_DE_MODELO, ROTULO_DO_TIPO, variaveisDoTipo, validarDocumentoDoEditor, ehOpcional } from '@/lib/documentos/variaveis'
import { TIPOS_DE_DOCUMENTO, ROTULO_DO_TIPO_DE_DOCUMENTO } from '@/lib/documentos/situacao'

/**
 * Bloco Documentos, leva 1 (2026-11-14): DC1 (os cinco tipos e as variáveis do
 * contrato de pacote e do "Documento") e DC4 (sai o "quando nasce": nada no
 * app fala mais do documento que nasce no início do atendimento).
 */

const doc = (texto: string) => ({ corpo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] } })
const nomes = (tipo: Parameters<typeof variaveisDoTipo>[0]) => variaveisDoTipo(tipo).map(v => v.nome)

describe('DC1: os tipos de documento', () => {
  it('são cinco: termo, contrato do procedimento, contrato de plano, contrato de pacote e documento', () => {
    expect([...TIPOS_DE_MODELO]).toEqual(['TERMO', 'CONTRATO', 'CONTRATO_PLANO', 'CONTRATO_PACOTE', 'DOCUMENTO'])
    expect(ROTULO_DO_TIPO.CONTRATO_PACOTE).toBe('Contrato de pacote')
    expect(ROTULO_DO_TIPO.DOCUMENTO).toBe('Documento')
    // A tela de Documentos (o filtro e a etiqueta) conhece os cinco.
    expect([...TIPOS_DE_DOCUMENTO]).toEqual(['TERMO', 'CONTRATO', 'CONTRATO_PLANO', 'CONTRATO_PACOTE', 'DOCUMENTO'])
    expect(ROTULO_DO_TIPO_DE_DOCUMENTO.CONTRATO_PACOTE).toBe('Contrato de pacote')
    expect(ROTULO_DO_TIPO_DE_DOCUMENTO.DOCUMENTO).toBe('Documento')
  })

  it('o "Documento" usa as variáveis do termo, nem mais nem menos', () => {
    expect(nomes('DOCUMENTO')).toEqual(nomes('TERMO'))
    expect(validarDocumentoDoEditor(doc('Autorizo o uso da imagem, {{cliente.nome}}, em {{data.hoje}}.'), 'DOCUMENTO', null).erro).toBeUndefined()
    expect(validarDocumentoDoEditor(doc('Em {{agendamento.data}}'), 'DOCUMENTO', null).erro).toMatch(/não serve em documento/)
    expect(validarDocumentoDoEditor(doc('{{pagamento.forma}}'), 'DOCUMENTO', null).erro).toBeTruthy()
  })

  it('o contrato de pacote usa as do contrato de plano trocando plano.* por pacote.*, mais o pagamento', () => {
    const pacote = nomes('CONTRATO_PACOTE')
    expect(pacote).toEqual(expect.arrayContaining([
      'pacote.nome', 'pacote.procedimentos', 'pacote.sessoes', 'pacote.total', 'pacote.validade',
      'pagamento.forma', 'pagamento.metodo', 'pagamento.entrada', 'pagamento.parcelas', 'pagamento.valor_parcela',
      'pagamento.primeiro_vencimento', 'pagamento.subtotal', 'pagamento.desconto',
    ]))
    for (const fora of ['plano.total', 'plano.sessoes', 'procedimentos.lista', 'agendamento.data', 'procedimento.nome', 'procedimento.valor']) {
      expect(pacote, `${fora} não é do pacote`).not.toContain(fora)
    }
    // O pacote vendido não tem profissional (princípio 4: não se chuta quem atende).
    expect(pacote).not.toContain('profissional.nome')
    // O resto é o mesmo do contrato de plano: cliente, responsável, rede, unidade, data, pagamento.
    const doPlano = nomes('CONTRATO_PLANO').filter(n => !n.startsWith('plano.') && n !== 'procedimentos.lista' && !n.startsWith('profissional.'))
    expect(pacote.filter(n => !n.startsWith('pacote.'))).toEqual(doPlano)
  })

  it('a validade do pacote nunca sai vazia: o pacote sem validade (PC3) diz "sem prazo de validade"', () => {
    // Opcional vazia vira "Validade: ." no contrato (a lição do D6 da 12ª).
    expect(ehOpcional('pacote.validade')).toBe(false)
    expect(variaveisDoTipo('CONTRATO_PACOTE').find(v => v.nome === 'pacote.validade')?.variavel.rotulo).toMatch(/sem prazo de validade/)
    expect(ehOpcional('pacote.total')).toBe(false)
  })

  it('cada contrato recusa a variável do outro', () => {
    expect(validarDocumentoDoEditor(doc('Total: {{pacote.total}}'), 'CONTRATO_PACOTE', null).erro).toBeUndefined()
    expect(validarDocumentoDoEditor(doc('Total: {{pacote.total}}'), 'CONTRATO_PLANO', null).erro).toMatch(/não serve em contrato de plano/)
    expect(validarDocumentoDoEditor(doc('Total: {{plano.total}}'), 'CONTRATO_PACOTE', null).erro).toMatch(/não serve em contrato de pacote/)
  })
})

describe('DC4: sai o "quando nasce"', () => {
  const raiz = join(__dirname, '..')
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const c = join(dir, n)
      return statSync(c).isDirectory() ? arquivos(c) : /\.(ts|tsx)$/.test(n) ? [c] : []
    })
  }

  it('nenhum código do app fala do documento que nasce no início do atendimento', () => {
    const achados = ['lib', 'actions', 'components', 'app']
      .flatMap(d => arquivos(join(raiz, d)))
      .filter(f => /INICIO_ATENDIMENTO|emitirDocumentosDoInicio/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(raiz.length + 1))
    expect(achados).toEqual([])
  })
})
