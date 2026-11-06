import { describe, it, expect } from 'vitest'
import { atendeDoFormulario, atendeQueGrava, listaDeUnidades } from '@/lib/equipe/atende'

// O "Atende" por unidade (decisão 2 do Heitor sobre a 8ª simulação).
describe('atendeQueGrava', () => {
  const ativas = ['A', 'B', 'C']
  it('quem é da rede grava o que marcou, só entre as ativas', () => {
    expect(atendeQueGrava({ pedido: ['B', 'A', 'X'], antes: [], ativas, unidadeDeQuemEdita: null })).toEqual(['A', 'B'])
  })
  it('a marca numa unidade desativada (que a tela não mostra) fica', () => {
    expect(atendeQueGrava({ pedido: ['A'], antes: ['A', 'Z'], ativas, unidadeDeQuemEdita: null })).toEqual(['A', 'Z'])
  })
  it('a gerente de unidade fixa muda só a dela; as outras marcas ficam', () => {
    expect(atendeQueGrava({ pedido: ['A', 'C'], antes: ['A', 'B'], ativas, unidadeDeQuemEdita: 'B' })).toEqual(['A'])
    expect(atendeQueGrava({ pedido: ['B'], antes: ['A'], ativas, unidadeDeQuemEdita: 'B' })).toEqual(['A', 'B'])
    expect(atendeQueGrava({ pedido: ['C'], antes: [], ativas, unidadeDeQuemEdita: 'B' })).toEqual([])
  })
})

describe('atendeDoFormulario', () => {
  it('o checklist manda a lista; o formulário de antes, nada', () => {
    const novo = new FormData(); novo.set('_atendeEm', '1'); novo.set('atendeEm', 'A, B,')
    expect(atendeDoFormulario(novo)).toEqual(['A', 'B'])
    const vazio = new FormData(); vazio.set('_atendeEm', '1'); vazio.set('atendeEm', '')
    expect(atendeDoFormulario(vazio)).toEqual([])
    const antigo = new FormData(); antigo.set('providesServices', 'on')
    expect(atendeDoFormulario(antigo)).toBeNull()
  })
})

describe('listaDeUnidades', () => {
  it('junta com vírgula e "e"', () => {
    expect(listaDeUnidades(['Batel'])).toBe('Batel')
    expect(listaDeUnidades(['Batel', 'Água Verde'])).toBe('Batel e Água Verde')
    expect(listaDeUnidades(['A', 'B', 'C'])).toBe('A, B e C')
  })
})
