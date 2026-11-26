import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { modoDaFichaPeloLink } from '@/lib/pre-atendimento/modo-da-ficha'
import type { AnamneseGeral } from '@/lib/anamnese-geral'

/**
 * D16 da 33ª simulação (FI-13: "A ficha que a equipe preencheu se confere
 * pelo link ('Está tudo certo' ou 'Corrigir respostas') e passa a ser da
 * cliente"): a Marivalda preencheu a ficha da A07 na unidade, e a Rosilene
 * mandou depois um link NOVO. O link abria em "Algo mudou na sua saúde? Nada
 * mudou / Atualizar respostas" — o modo de quem já respondeu ela mesma —,
 * porque o "conferir" só valia para o link mandado ANTES de a equipe
 * preencher (A52 da 7ª).
 */
const ficha = { formId: 'f', nome: 'Ficha de saúde', rows: [{ id: 'r', fields: [{ id: 'allergies', type: 'text', label: 'Alergia' }] }] } as unknown as AnamneseGeral['ficha']
const respondida = (origem: AnamneseGeral['origem']): AnamneseGeral =>
  ({ versao: 2, ficha, respostas: { allergies: 'Não' }, respondidoEm: '2026-11-26T12:00:00.000Z', origem, respondidoPor: null })

describe('modoDaFichaPeloLink', () => {
  it('a ficha que a equipe preencheu, num link novo dentro da validade: a cliente confere', () =>
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'CONFIRMAR', atual: respondida('EQUIPE') })).toBe('CONFERIR'))
  it('a do formato antigo (a equipe, antes do app) também', () =>
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'CONFIRMAR', atual: respondida('LEGADO') })).toBe('CONFERIR'))
  it('a que a cliente respondeu (app ou link): "algo mudou?"', () => {
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'CONFIRMAR', atual: respondida('CLIENTE_APP') })).toBe('CONFIRMAR')
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'CONFIRMAR', atual: respondida('CLIENTE_LINK') })).toBe('CONFIRMAR')
  })
  it('o link mandado antes de a equipe preencher (A52): confere', () =>
    expect(modoDaFichaPeloLink({ conferir: true, modoDoPendente: 'COMPLETO', atual: respondida('EQUIPE') })).toBe('CONFERIR'))
  it('fora da validade, ou sem resposta, responde a ficha inteira', () => {
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'COMPLETO', atual: respondida('EQUIPE') })).toBe('COMPLETO')
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: 'CONFIRMAR', atual: null })).toBe('COMPLETO')
    expect(modoDaFichaPeloLink({ conferir: true, modoDoPendente: 'CONFIRMAR', atual: null })).toBe('COMPLETO')
  })
})

describe('o link usa a regra', () => {
  it('abrirFichaPorLink decide o modo por modoDaFichaPeloLink', () => {
    const fonte = readFileSync(join(__dirname, '..', 'lib/pre-atendimento/link-publico.ts'), 'utf8')
    expect(fonte).toMatch(/modo: modoDaFichaPeloLink\(\{ conferir: c\.conferir, modoDoPendente: p\.pendente\.modo, atual: p\.atual \}\)/)
  })
})

// O mesmo caso no app (o arremate da 33ª; FI-13 e o princípio 3, o mesmo caso
// não tem duas telas; decisão do Claude, 26/11): a ficha que a equipe preencheu
// abria no app em "Algo mudou?", e pelo link em "Está tudo certo".
describe('o app usa a mesma regra', () => {
  it('o pré-atendimento do app decide o modo por modoDaFichaPeloLink, sem o "conferir" do link', () => {
    const fonte = readFileSync(join(__dirname, '..', 'app/[slug]/cliente/pre-atendimento/page.tsx'), 'utf8')
    expect(fonte).toMatch(/modo=\{modoDaFichaPeloLink\(\{ conferir: false, modoDoPendente: pendente\.modo, atual \}\)\}/)
  })
})
