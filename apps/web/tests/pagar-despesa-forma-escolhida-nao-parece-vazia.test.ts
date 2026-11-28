import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PagarDespesa } from '@/components/shared/pagar-despesa'

/**
 * A2 da 43ª simulação (princípio 3: o seletor com um valor válido escolhido não
 * pode parecer vazio; FN-17: "na que já tem forma, a forma lançada vem
 * escolhida, e quem paga confirma ou troca"): a janela de pagar a Copa
 * (lançada em Dinheiro) mostrava "Selecione…" com o valor já em Dinheiro.
 *
 * O "Selecione…" é o lugar da forma que ainda não foi escolhida: com a forma
 * escolhida (a lançada, ou a que quem paga escolheu), ele não está no seletor.
 */
const html = (formaInicial: string | null) => renderToStaticMarkup(createElement(PagarDespesa, {
  descricao: 'Copa', valor: 45, fornecedor: 'Mercadinho', formaInicial, pendente: false,
  aoConfirmar: () => {}, aoFechar: () => {},
}))

describe('A2 da 43ª: a forma já escolhida não aparece como "Selecione…"', () => {
  it('a despesa lançada em Dinheiro abre com Dinheiro, sem a opção vazia', () => {
    const h = html('CASH')
    expect(h).not.toContain('Selecione…')
    expect(h).toMatch(/<option value="CASH" selected="">Dinheiro<\/option>/)
  })

  it('a despesa sem forma abre em "Selecione…", e confirmar espera a escolha', () => {
    const h = html(null)
    expect(h).toContain('Selecione…')
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Confirmar pagamento<\/button>/)
  })
})
