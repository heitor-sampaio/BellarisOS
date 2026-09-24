import { describe, it, expect } from 'vitest'
import {
  avaliarExpressao, conferirExpressao, caminhosDaExpressao, ehCaminhoSimples,
  lerDoContexto,
} from '@/lib/automacoes/expressao'
import { interpolarTexto, caminhosDoTexto } from '@/lib/automacoes/variaveis'
import { avaliarRegra, escolherSaida } from '@/lib/automacoes/condicoes'

/**
 * As expressões dos campos de automação.
 *
 * Abriram a decisão de produto "condição é construtor, não linguagem" a pedido
 * do Heitor. O que este arquivo guarda, além do comportamento: **a ausência de
 * `eval`**. O texto vem do banco e é avaliado no servidor, dentro do motor —
 * um `new Function` ali seria execução remota de código a um `update` de
 * distância.
 */

const contexto = {
  cliente: { nome: 'Ana Paula', email: null, tags: ['vip', 'botox'], idade: 34 },
  agendamento: { valor: 250.5, data: '2026-10-01T14:00:00.000Z', status: 'SCHEDULED' },
  evento: { dados: { texto: 'Quanto custa o BOTOX?', temMidia: false } },
  passos: { mandar_mensagem: { enviada: true, motivo: null } },
}

const avaliar = (t: string) => avaliarExpressao(t, contexto)

describe('caminhos', () => {
  it('lê o contexto como antes', () => {
    expect(avaliar('cliente.nome')).toBe('Ana Paula')
    expect(avaliar('agendamento.valor')).toBe(250.5)
    expect(avaliar('passos.mandar_mensagem.enviada')).toBe(true)
  })

  it('caminho que não existe é indefinido, não erro', () => {
    expect(avaliar('cliente.inventado')).toBeUndefined()
    expect(avaliar('nada.de.nada')).toBeUndefined()
  })

  it('NÃO navega por protótipo', () => {
    // Sem esta trava, `constructor.constructor` alcançaria o construtor de
    // funções do JavaScript. Nada aqui chama o que lê, mas a trava é de uma
    // linha e o risco não vale o troco.
    expect(lerDoContexto(contexto, 'cliente.constructor')).toBeUndefined()
    expect(lerDoContexto(contexto, '__proto__')).toBeUndefined()
    expect(avaliar('cliente.constructor.constructor')).toBeUndefined()
  })
})

describe('operadores', () => {
  it('aritmética', () => {
    expect(avaliar('2 + 3 * 4')).toBe(14)
    expect(avaliar('(2 + 3) * 4')).toBe(20)
    expect(avaliar('agendamento.valor * 2')).toBe(501)
    expect(avaliar('10 % 3')).toBe(1)
  })

  it('divisão por zero é nula, não infinito', () => {
    // `Infinity` numa mensagem para o cliente seria pior que campo vazio.
    expect(avaliar('1 / 0')).toBeNull()
  })

  it('soma com texto concatena', () => {
    expect(avaliar("'Oi ' + cliente.nome")).toBe('Oi Ana Paula')
  })

  it('comparação de grandeza', () => {
    expect(avaliar('agendamento.valor > 200')).toBe(true)
    expect(avaliar('cliente.idade < 18')).toBe(false)
  })

  it('comparar grandeza com o que não é grandeza é sempre falso', () => {
    // Nunca "verdadeiro por engano", que mandaria a mensagem errada.
    expect(avaliar("cliente.nome > 5")).toBe(false)
    expect(avaliar("cliente.nome < 5")).toBe(false)
  })

  it('igualdade normaliza texto, como a lista de condições', () => {
    // Quem monta as duas coisas é a mesma pessoa: duas noções de igualdade
    // seriam armadilha.
    expect(avaliar("agendamento.status == 'scheduled'")).toBe(true)
    expect(avaliar("cliente.nome == 'ANA PAULA'")).toBe(true)
    expect(avaliar("cliente.nome != 'Outra'")).toBe(true)
  })

  it('lógica e negação', () => {
    expect(avaliar("agendamento.valor > 100 && agendamento.status == 'SCHEDULED'")).toBe(true)
    expect(avaliar('!cliente.email')).toBe(true)
    expect(avaliar('cliente.email || cliente.nome')).toBe(true)
  })

  it('?? cai para o segundo quando o primeiro é nulo OU vazio', () => {
    expect(avaliar("cliente.email ?? 'sem e-mail'")).toBe('sem e-mail')
    expect(avaliar("cliente.nome ?? 'anônima'")).toBe('Ana Paula')
    expect(avaliar("cliente.inventado ?? 'padrão'")).toBe('padrão')
  })

  it('ternário', () => {
    expect(avaliar("agendamento.valor > 200 ? 'caro' : 'barato'")).toBe('caro')
    expect(avaliar("cliente.email ? 'tem' : 'não tem'")).toBe('não tem')
  })

  it('lista vazia e texto em branco são "não"', () => {
    expect(avaliarExpressao('cliente.tags ? 1 : 0', { cliente: { tags: [] } })).toBe(0)
    expect(avaliarExpressao('cliente.nome ? 1 : 0', { cliente: { nome: '  ' } })).toBe(0)
  })
})

describe('funções', () => {
  it('texto', () => {
    expect(avaliar('maiusculo(cliente.nome)')).toBe('ANA PAULA')
    expect(avaliar("cortar(evento.dados.texto, 6)")).toBe('Quanto…')
    expect(avaliar("substituir(cliente.nome, 'Ana', 'Maria')")).toBe('Maria Paula')
  })

  it('contem funciona em texto e em lista', () => {
    expect(avaliar("contem(evento.dados.texto, 'botox')")).toBe(true)
    expect(avaliar("contem(cliente.tags, 'VIP')")).toBe(true)
    expect(avaliar("contem(cliente.tags, 'preenchimento')")).toBe(false)
  })

  it('tamanho conta itens da lista e letras do texto', () => {
    expect(avaliar('tamanho(cliente.tags)')).toBe(2)
    expect(avaliar('tamanho(cliente.nome)')).toBe('Ana Paula'.length)
  })

  it('número e moeda', () => {
    expect(avaliar('arredondar(agendamento.valor)')).toBe(251)
    expect(avaliar('arredondar(10 / 3, 2)')).toBe(3.33)
    expect(avaliar('moeda(agendamento.valor)')).toContain('250,50')
  })

  it('escolher pega o primeiro que tem valor', () => {
    expect(avaliar("escolher(cliente.email, cliente.nome, 'você')")).toBe('Ana Paula')
    expect(avaliar("escolher(cliente.email, cliente.inventado, 'você')")).toBe('você')
  })

  it('dias entre datas', () => {
    expect(avaliarExpressao("dias('2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z')", {})).toBe(4)
    expect(avaliarExpressao("dias('não é data', agora())", {})).toBeNull()
  })

  it('função que não existe é erro com a lista do que existe', () => {
    const erro = conferirExpressao('fetch(1)')
    expect(erro).toContain('Não existe a função "fetch"')
    expect(erro).toContain('maiusculo')
  })
})

describe('segurança', () => {
  it('não há como alcançar o ambiente', () => {
    // Cada um destes é um caminho que não resolve (vira indefinido) ou um erro
    // de análise. Nenhum executa nada.
    for (const tentativa of [
      'process.env.DATABASE_URL',
      'globalThis.process',
      'require("fs")',
      'eval("1+1")',
      'Function("return 1")',
      'this.constructor',
      '(() => 1)()',
    ]) {
      const v = avaliarExpressao(tentativa, contexto)
      expect(v === undefined || v === null, `${tentativa} devolveu ${String(v)}`).toBe(true)
    }
  })

  it('texto longo demais é recusado', () => {
    expect(conferirExpressao(`'${'a'.repeat(600)}'`)).toContain('longa demais')
  })

  it('aninhamento sem fim não estoura a pilha', () => {
    const fundo = '('.repeat(200) + '1' + ')'.repeat(200)
    expect(conferirExpressao(fundo)).toContain('aninhada demais')
    expect(avaliarExpressao(fundo, {})).toBeUndefined()
  })

  it('expressão quebrada NÃO derruba a execução', () => {
    // O motor está no meio de um fluxo com efeitos: explodir por causa de um
    // erro de digitação num texto faria a automação parar inteira. A hora de
    // reclamar é na tela, antes de ativar.
    expect(avaliarExpressao("cliente.nome +", contexto)).toBeUndefined()
    expect(avaliarExpressao("'aspas abertas", contexto)).toBeUndefined()
    expect(conferirExpressao("cliente.nome +")).not.toBeNull()
  })
})

describe('caminhos para hidratar', () => {
  it('extrai os caminhos de dentro da expressão', () => {
    // Sem isto, `{{maiusculo(cliente.nome)}}` sairia vazio: o resolvedor nunca
    // saberia que precisava buscar o cliente.
    expect(caminhosDaExpressao("maiusculo(cliente.nome) + ' ' + lead.etapa"))
      .toEqual(['cliente.nome', 'lead.etapa'])
  })

  it('pega os três ramos do ternário', () => {
    expect(caminhosDaExpressao("cliente.email ? cliente.email : lead.telefone"))
      .toEqual(['cliente.email', 'lead.telefone'])
  })

  it('expressão quebrada não trava a hidratação', () => {
    expect(caminhosDaExpressao('cliente.nome +')).toEqual([])
  })

  it('reconhece o caminho simples, que é o atalho rápido', () => {
    expect(ehCaminhoSimples('cliente.nome')).toBe(true)
    expect(ehCaminhoSimples('evento.dados.texto')).toBe(true)
    expect(ehCaminhoSimples("maiusculo(cliente.nome)")).toBe(false)
    expect(ehCaminhoSimples('1 + 1')).toBe(false)
  })
})

describe('nos textos', () => {
  it('o que já estava escrito continua igual', () => {
    // Compatibilidade é o requisito número um: há automações salvas usando
    // `{{cliente.nome}}`, e mudar o sentido delas seria mexer no que a clínica
    // manda para o cliente.
    expect(interpolarTexto('Oi {{cliente.nome}}!', contexto)).toBe('Oi Ana Paula!')
    expect(interpolarTexto('Tags: {{cliente.tags}}', contexto)).toBe('Tags: vip, botox')
    expect(interpolarTexto('Vazio: {{cliente.email}}.', contexto)).toBe('Vazio: .')
  })

  it('data continua saindo legível', () => {
    expect(interpolarTexto('{{agendamento.data}}', contexto)).toMatch(/01\/10\/2026 às \d{2}:\d{2}/)
  })

  it('aceita expressão dentro das chaves', () => {
    expect(interpolarTexto("Oi {{cliente.nome ?? 'tudo bem'}}!", contexto)).toBe('Oi Ana Paula!')
    expect(interpolarTexto("{{cliente.email ?? 'sem e-mail'}}", contexto)).toBe('sem e-mail')
    expect(interpolarTexto('{{moeda(agendamento.valor)}}', contexto)).toContain('250,50')
    expect(interpolarTexto("{{agendamento.valor > 200 ? 'Combinado' : 'Simples'}}", contexto))
      .toBe('Combinado')
  })

  it('os caminhos do texto incluem os de dentro da expressão', () => {
    expect(caminhosDoTexto("Oi {{escolher(cliente.nome, lead.nome)}}, {{agendamento.data}}"))
      .toEqual(['cliente.nome', 'lead.nome', 'agendamento.data'])
  })

  it('expressão quebrada vira vazio, não sai crua para o cliente', () => {
    expect(interpolarTexto('Oi {{cliente.nome +}}!', contexto)).toBe('Oi !')
  })
})

describe('nas condições', () => {
  it('a regra aceita expressão no campo', () => {
    expect(avaliarRegra(contexto, {
      campo: "contem(evento.dados.texto, 'botox')", operador: 'igual', valor: 'true',
    })).toBe(true)

    expect(avaliarRegra(contexto, {
      campo: 'tamanho(cliente.tags)', operador: 'maior', valor: '1',
    })).toBe(true)
  })

  it('o caminho simples continua funcionando igual', () => {
    expect(avaliarRegra(contexto, { campo: 'cliente.email', operador: 'vazio' })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'cliente.nome', operador: 'contem', valor: 'ana' })).toBe(true)
  })

  it('o SWITCH também', () => {
    const saida = escolherSaida(contexto, "agendamento.valor > 200 ? 'alto' : 'baixo'", [
      { chave: 'a', valor: 'alto' }, { chave: 'b', valor: 'baixo' },
    ])
    expect(saida).toBe('a')
  })

  it('campo vazio não vira erro', () => {
    expect(avaliarRegra(contexto, { campo: '', operador: 'vazio' })).toBe(true)
  })
})
