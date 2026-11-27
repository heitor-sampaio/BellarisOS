import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDoProntuarioForaDoPacote, prontuarioNaSolicitacao } from '@/lib/lgpd/situacao-do-prontuario'

/**
 * D10 da 35ª simulação (LG-07: quando o prontuário fica fora, o pacote diz por
 * quê; LG-10: a equipe exporta pela ficha, e o prontuário só entra com o
 * Prontuário em Gerenciar). A Leandra (sem o Prontuário) exportou os dados da
 * E08 pela ficha, e o pacote dizia "Você não pediu o prontuário… faça um novo
 * pedido no app" — a cliente não pediu nada; foi a equipe que gerou o pacote.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('o pacote gerado pela equipe sem o prontuário diz que foi a equipe', () => {
  it('o PDF e o JSON não falam de pedido da cliente', () => {
    const t = textoDoProntuarioForaDoPacote('not_requested', { pelaEquipe: true })
    expect(t.json).toBe('Não incluído: o pacote foi gerado pela equipe sem o prontuário.')
    const pdf = t.pdf.join(' ')
    expect(pdf).toMatch(/^Este pacote foi gerado pela equipe sem o prontuário/)
    expect(pdf).not.toMatch(/Você não pediu/)
    expect(pdf).not.toMatch(/novo pedido no app/)
  })
  it('o resumo do pedido também', () => {
    expect(prontuarioNaSolicitacao('not_requested', false, { pelaEquipe: true })).toBe('gerado pela equipe sem o prontuário')
    // O pedido da cliente segue como era.
    expect(prontuarioNaSolicitacao('not_requested', false)).toBe('não pedido')
    expect(textoDoProntuarioForaDoPacote('not_requested').json).toBe('Não incluído nesta solicitação.')
  })
  it('o processamento passa quem pediu (requested_via) ao pacote', () => {
    expect(fonte('lib/lgpd/processar.ts')).toMatch(/requested_via/)
    expect(fonte('lib/lgpd/processar.ts')).toMatch(/claimed\.requested_via === 'equipe',/)
    expect(fonte('lib/lgpd/export.ts')).toMatch(/textoDoProntuarioForaDoPacote\(situacaoDoProntuario, \{ pelaEquipe \}\)/)
  })
})
