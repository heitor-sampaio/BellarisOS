import { describe, it, expect } from 'vitest'
import {
  analisarMarcacao, interpolarArvore, formaCanonica, textoDaArvore,
  variaveisDaArvore, chavesMalFormadas,
} from '@/lib/documentos/marcacao'
import { validarModelo, ehOpcional } from '@/lib/documentos/variaveis'

describe('analisarMarcacao', () => {
  it('reconhece título, parágrafo, lista, divisória e assinatura', () => {
    const arvore = analisarMarcacao([
      '# Termo', '## Riscos', 'Linha um', 'linha dois', '', '- a', '- b', '1. um', '---', '[[assinatura]]',
    ].join('\n'))
    expect(arvore.map(b => b.tipo)).toEqual(['titulo', 'titulo', 'paragrafo', 'lista', 'lista', 'divisoria', 'assinatura'])
    // Linhas seguidas são o mesmo parágrafo, com a quebra mantida.
    const p = arvore[2]
    expect(p?.tipo === 'paragrafo' && p.linhas.length).toBe(2)
    const l1 = arvore[3], l2 = arvore[4]
    expect(l1?.tipo === 'lista' && l1.ordenada).toBe(false)
    expect(l2?.tipo === 'lista' && l2.ordenada).toBe(true)
  })

  it('separa negrito e variável, e o ** sem par fica como texto', () => {
    const [b] = analisarMarcacao('Eu, **{{cliente.nome}}**, declaro ** algo')
    expect(b).toEqual({ tipo: 'paragrafo', linhas: [[
      { texto: 'Eu, ' },
      { variavel: 'cliente.nome', negrito: true },
      { texto: ', declaro ' },
      { texto: '** algo' },
    ]] })
  })

  it('aceita CRLF do Windows', () => {
    expect(analisarMarcacao('a\r\n\r\nb')).toHaveLength(2)
  })
})

describe('variáveis', () => {
  it('lista as citadas sem repetir', () => {
    expect(variaveisDaArvore(analisarMarcacao('{{cliente.nome}} e {{cliente.cpf}}\n\n{{cliente.nome}}')))
      .toEqual(['cliente.nome', 'cliente.cpf'])
  })

  it('acha as chaves mal escritas', () => {
    expect(chavesMalFormadas('{{ Nome }} {{nome}} {{cliente.nome}} {{}}')).toEqual(['{{ Nome }}', '{{nome}}', '{{}}'])
  })
})

describe('interpolarArvore', () => {
  const arvore = analisarMarcacao('# Termo de {{cliente.nome}}\n\nCPF: {{cliente.cpf}} {{cliente.email}}')

  it('o valor vira texto puro — marcação no nome não é interpretada', () => {
    const { arvore: r, faltando } = interpolarArvore(arvore, v => (v === 'cliente.nome' ? '**# Ana**' : '123'), ehOpcional)
    expect(faltando).toEqual([])
    expect(r[0]).toEqual({ tipo: 'titulo', nivel: 1, trechos: [{ texto: 'Termo de **# Ana**' }] })
  })

  it('obrigatória sem valor vai para faltando; opcional sai vazia', () => {
    const { faltando } = interpolarArvore(arvore, v => (v === 'cliente.nome' ? 'Ana' : null), ehOpcional)
    expect(faltando).toEqual(['cliente.cpf'])
  })

  it('a forma canônica não depende do fatiamento do texto', () => {
    const a = interpolarArvore(analisarMarcacao('Olá {{cliente.nome}}!'), () => 'Ana', ehOpcional).arvore
    const b = interpolarArvore(analisarMarcacao('Olá Ana!'), () => null, ehOpcional).arvore
    expect(formaCanonica(a)).toBe(formaCanonica(b))
  })

  it('texto corrido para o export', () => {
    const { arvore: r } = interpolarArvore(analisarMarcacao('# T\n\n- a\n- b'), () => null, ehOpcional)
    expect(textoDaArvore(r)).toBe('T\n\n• a\n• b')
  })
})

describe('validarModelo', () => {
  it('aceita e diz se usa pagamento', () => {
    expect(validarModelo('Paga: {{pagamento.forma}}', 'CONTRATO_PLANO')).toEqual({
      variaveis: ['pagamento.forma'], usaPagamento: true,
    })
  })

  it('recusa variável que não existe', () => {
    expect(validarModelo('{{cliente.signo}}', 'TERMO').erro).toMatch(/não existe/)
  })

  it('recusa variável fora do tipo — o termo também serve ao plano', () => {
    expect(validarModelo('Em {{agendamento.data}}', 'TERMO').erro).toMatch(/não serve em termo/)
    // O pagamento não vale no termo; no contrato do procedimento passou a
    // valer em 2026-09-30 (a recepção o define antes da assinatura).
    expect(validarModelo('{{pagamento.forma}}', 'TERMO').erro).toMatch(/não serve/)
    expect(validarModelo('{{pagamento.forma}}', 'CONTRATO').erro).toBeUndefined()
  })

  it('recusa chave mal escrita e texto vazio', () => {
    expect(validarModelo('{{Nome}}', 'TERMO').erro).toMatch(/mal escrita/)
    expect(validarModelo('   ', 'TERMO').erro).toMatch(/Escreva/)
  })
})
