import { describe, expect, it } from 'vitest'
import { converterDocumentoDoEditor, normalizarListasDoEditor, type NoPM } from '@/lib/documentos/editor/converter'
import { validarDocumentoDoEditor, ehOpcional, variaveisDoTipo } from '@/lib/documentos/variaveis'
import { valoresDoDocumento } from '@/lib/documentos/valores'

/** Os atritos dos termos da 12ª simulação (2026-11-10/11): A13, A14, A15, A16. */

const doc = (...content: NoPM[]) => ({ corpo: { type: 'doc', content } })
const p = (...content: NoPM[]): NoPM => ({ type: 'paragraph', content })
const txt = (text: string): NoPM => ({ type: 'text', text })
const lista = (...itens: (string | null)[]): NoPM => ({
  type: 'orderedList', attrs: { start: 1 },
  content: itens.map(t => ({ type: 'listItem', content: [t === null ? { type: 'paragraph' } : p(txt(t))] })),
})

function converter(entrada: unknown) {
  const r = converterDocumentoDoEditor(entrada, { tenantId: null })
  if ('erro' in r) throw new Error(r.erro)
  return r.documento
}

describe('A14: a variável da profissional também no contrato de plano', () => {
  it('{{profissional.nome}} vale no contrato de plano (a profissional do plano)', () => {
    expect(validarDocumentoDoEditor(doc(p(txt('Responsável técnica: {{profissional.nome}}'))), 'CONTRATO_PLANO', null).erro).toBeUndefined()
    expect(variaveisDoTipo('CONTRATO_PLANO').map(v => v.nome)).toContain('profissional.nome')
  })
})

describe('A13: o registro no conselho da profissional', () => {
  it('{{profissional.registro}} existe, é opcional e vale nos três tipos', () => {
    for (const tipo of ['TERMO', 'CONTRATO', 'CONTRATO_PLANO'] as const) {
      expect(validarDocumentoDoEditor(doc(p(txt('CRM: {{profissional.registro}}'))), tipo, null).erro, tipo).toBeUndefined()
    }
    expect(ehOpcional('profissional.registro')).toBe(true)
  })
  it('o valor é o do cadastro; sem ele, sai vazio', () => {
    const base = {
      agora: new Date('2026-11-11T12:00:00Z'), cliente: { name: 'Ana' }, rede: { name: 'Clínica' }, unidade: null,
      procedimento: null, agendamento: null, pagamento: null,
    } as unknown as Parameters<typeof valoresDoDocumento>[0]
    expect(valoresDoDocumento({ ...base, profissional: 'Helena', profissionalRegistro: 'CRM-SC 12345' })['profissional.registro']).toBe('CRM-SC 12345')
    expect(valoresDoDocumento({ ...base, profissional: 'Helena', profissionalRegistro: null })['profissional.registro'] ?? null).toBeNull()
  })
})

describe('A15: {{paciente.x}} é a cliente', () => {
  it('o texto digitado ou colado com {{paciente.nome}} vira {{cliente.nome}}', () => {
    const d = converter(doc(p(txt('Eu, {{paciente.nome}}, autorizo.'))))
    const b = d.blocos[0] as { tipo: 'paragrafo'; trechos: { texto?: string; variavel?: string }[] }
    expect(b.trechos.map(t => t.variavel ?? t.texto)).toEqual(['Eu, ', 'cliente.nome', ', autorizo.'])
    expect(validarDocumentoDoEditor(doc(p(txt('{{paciente.nome}}'))), 'TERMO', null).erro).toBeUndefined()
  })
})

describe('A16: o editor abre o que vai ser salvo', () => {
  it('a lista numerada perde o número digitado igual ao dela e o item vazio', () => {
    const n = normalizarListasDoEditor(doc(lista('1. Objeto', '2) Riscos', '7. Outro', null)))
    const ol = n.corpo.content![0]!
    expect(ol.content!.length).toBe(3)
    expect(ol.content!.map(li => li.content![0]!.content![0]!.text)).toEqual(['Objeto', 'Riscos', '7. Outro'])
  })
  it('o conversor também não leva o item vazio ao documento ("8." sozinho)', () => {
    const d = converter(doc(lista('Objeto', null)))
    const b = d.blocos[0] as { tipo: 'lista'; itens: unknown[] }
    expect(b.itens).toHaveLength(1)
  })
  it('não mexe no que não é lista numerada', () => {
    const entrada = doc(p(txt('1. Fora de lista')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(txt('1. Marcador'))] }] })
    expect(normalizarListasDoEditor(entrada)).toEqual(entrada)
  })
})
