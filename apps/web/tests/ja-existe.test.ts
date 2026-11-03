import { describe, it, expect } from 'vitest'
import { textoDaFichaQueJaExiste, rotuloDoAtualizar, respostaDoJaExiste, proximaSemResposta, type FichaQueJaExiste } from '@/lib/clients/ja-existe-texto'

/** r2-cli-01 (o Heitor, 2026-11-03): a pergunta "Já existe a ficha de X" — a parte pura. */
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ficha = (id: string, extra: Partial<FichaQueJaExiste> = {}): FichaQueJaExiste =>
  ({ id, nome: 'Valdir', motivo: 'TELEFONE', podeCadastrarMesmoAssim: true, ...extra })

describe('a pergunta "Já existe a ficha de X"', () => {
  it('diz por quê', () => {
    expect(textoDaFichaQueJaExiste(ficha(A))).toBe('Já existe a ficha de Valdir com este telefone.')
    expect(textoDaFichaQueJaExiste(ficha(A, { motivo: 'CPF' }))).toBe('Já existe a ficha de Valdir com este CPF.')
    expect(textoDaFichaQueJaExiste(ficha(A, { motivo: 'NOME_E_NASCIMENTO' }))).toBe('Já existe a ficha de Valdir com este nome e esta data de nascimento.')
    expect(textoDaFichaQueJaExiste(ficha(A, { arquivada: true }))).toBe('Já existe a ficha ARQUIVADA de Valdir com este telefone.')
  })
  it('o botão: "Unificar com a ficha de X" (r3-f14-02), ou "Reativar" na arquivada', () => {
    expect(rotuloDoAtualizar(ficha(A))).toBe('Unificar com a ficha de Valdir')
    expect(rotuloDoAtualizar(ficha(A, { arquivada: true }))).toBe('Reativar a ficha de Valdir')
  })
  it('lê a resposta: cadastrar se acumula, atualizar é uma', () => {
    const r = respostaDoJaExiste(`cadastrar:${A} lixo cadastrar:${B.toUpperCase()} atualizar:${B}`)
    expect([...r.cadastrar]).toEqual([A, B])
    expect(r.atualizar).toBe(B)
    expect(respostaDoJaExiste(null)).toEqual({ cadastrar: new Set(), atualizar: null })
  })
  it('a próxima ficha sem resposta: o "cadastrar mesmo assim" vale para aquela ficha, e nunca para o CPF', () => {
    const fichas = [ficha(A), ficha(B, { motivo: 'CPF', podeCadastrarMesmoAssim: false })]
    expect(proximaSemResposta(fichas, new Set())?.id).toBe(A)
    expect(proximaSemResposta(fichas, new Set([A]))?.id).toBe(B)
    expect(proximaSemResposta(fichas, new Set([A, B]))?.id, 'o CPF é único: cadastrar mesmo assim não vale').toBe(B)
    expect(proximaSemResposta([ficha(A)], new Set([A]))).toBeNull()
  })
})
