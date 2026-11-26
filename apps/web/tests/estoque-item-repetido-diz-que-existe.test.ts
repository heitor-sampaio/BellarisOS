import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A12 da 31ª simulação (2026-11-26; princípios 3 e 7): na janela das Categorias,
 * "solares " (com espaço) — o mesmo nome da categoria "Solares" — sumia do campo
 * sem mensagem nenhuma. A action já reconhece o mesmo item (sem caixa nem
 * espaços) e devolve `jaExistia`; a tela é que o ignorava e limpava o campo como
 * se tivesse criado. Agora a janela diz que já existe, e o campo com busca (o
 * cadastro do produto, a Entrada) também diz, em vez de só não oferecer o "+ Nova".
 */
const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

describe('o item repetido da lista do estoque diz que já existe', () => {
  it('a janela das listas lê o jaExistia e diz que o item já está na lista', () => {
    const janela = ler('components/admin/cadastro-do-estoque.tsx')
    expect(janela).toMatch(/jaExistia/)
    expect(janela).toContain('data-ja-existe')
    expect(janela).toMatch(/já está na lista/)
  })

  it('o campo com busca diz que o nome já existe, e o "+ Nova" que encontra o mesmo item também', () => {
    const campo = ler('components/admin/campo-da-lista.tsx')
    expect(campo).toContain('data-ja-existe')
    expect(campo).toMatch(/r\.jaExistia/)
    expect(campo).toMatch(/já existe/)
  })
})
