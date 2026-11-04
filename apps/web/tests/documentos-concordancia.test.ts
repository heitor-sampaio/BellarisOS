import { describe, it, expect } from 'vitest'
import { concordarComOGenero } from '@/lib/documentos/concordancia'
import { interpolar } from '@/lib/documentos/arvore'
import type { DocumentoDoModelo } from '@/lib/documentos/arvore'

// A50 da 6ª simulação: o termo dizia "fui informada(o)" com o sexo da cliente na ficha.
describe('a concordância pelo sexo da ficha', () => {
  it('com o sexo, a forma dele; sem (ou "Outro"), como está', () => {
    const t = 'Declaro que fui informada(o) e que o(a) paciente está ciente; esclarecido(a).'
    expect(concordarComOGenero(t, 'F')).toBe('Declaro que fui informada e que a paciente está ciente; esclarecida.')
    expect(concordarComOGenero(t, 'M')).toBe('Declaro que fui informado e que o paciente está ciente; esclarecido.')
    expect(concordarComOGenero(t, 'O')).toBe(t)
    expect(concordarComOGenero(t, null)).toBe(t)
  })
  it('não mexe no que não é o par a/o', () => {
    expect(concordarComOGenero('Valor (opcional) e item (1)', 'F')).toBe('Valor (opcional) e item (1)')
  })
  it('vale no documento montado (interpolar com o ajuste)', () => {
    const doc = { versao: 2, base: { fonte: 'arimo', tamanho: 11 }, cabecalho: [], rodape: [],
      blocos: [{ tipo: 'paragrafo', trechos: [{ texto: 'Eu, ' }, { variavel: 'cliente.nome' }, { texto: ', fui informada(o).' }] }] } as unknown as DocumentoDoModelo
    const r = interpolar(doc, () => 'Bruno', () => false, t => concordarComOGenero(t, 'M'))
    expect(JSON.stringify(r.documento)).toContain('fui informado.')
  })
})
