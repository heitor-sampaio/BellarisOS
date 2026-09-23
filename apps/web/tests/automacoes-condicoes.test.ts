import { describe, it, expect } from 'vitest'
import { lerCaminho, avaliarRegra, avaliarGrupo, escolherSaida } from '@/lib/automacoes/condicoes'
import { interpolarTexto, caminhosDoTexto } from '@/lib/automacoes/variaveis'

/**
 * A avaliação de condições decide para onde o fluxo vai — e, com ele, se o
 * cliente recebe ou não uma mensagem. Os casos daqui são os que a tela esconde:
 * campo ausente, número escrito em pt-BR, valor que ninguém previu no SWITCH.
 */

const contexto = {
  evento: { nome: 'plano.aceito', dados: { total: 1200, status: 'ACCEPTED' } },
  cliente: {
    nome: 'Ana Paula', email: null, telefone: '47988887777',
    tags: ['VIP', 'Retorno'], aniversarioHoje: false,
  },
  agendamento: { valor: '1.250,50', data: '2026-09-24T14:30:00.000Z' },
}

describe('lerCaminho', () => {
  it('lê fundo no contexto', () => {
    expect(lerCaminho(contexto, 'evento.dados.total')).toBe(1200)
  })

  it('distingue campo ausente de campo nulo', () => {
    // A distinção importa: um é "essa entidade não tem esse campo", o outro é
    // "o cliente não preencheu o e-mail".
    expect(lerCaminho(contexto, 'cliente.sobrenome')).toBeUndefined()
    expect(lerCaminho(contexto, 'cliente.email')).toBeNull()
  })

  it('não explode em caminho que atravessa um valor simples', () => {
    expect(lerCaminho(contexto, 'cliente.nome.qualquer')).toBeUndefined()
  })
})

describe('avaliarRegra', () => {
  it('compara texto sem acento e sem caixa', () => {
    expect(avaliarRegra(contexto, { campo: 'cliente.nome', operador: 'igual', valor: 'ANA PAULA' })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'cliente.nome', operador: 'contem', valor: 'paula' })).toBe(true)
  })

  it('trata nulo e lista vazia como vazio', () => {
    expect(avaliarRegra(contexto, { campo: 'cliente.email', operador: 'vazio' })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'cliente.telefone', operador: 'preenchido' })).toBe(true)
  })

  it('entende número escrito em pt-BR', () => {
    // O valor vem da tela como "1.250,50". Sem a conversão, todo maior/menor
    // responderia "não" e a automação de ticket alto nunca dispararia.
    expect(avaliarRegra(contexto, { campo: 'agendamento.valor', operador: 'maior', valor: '1000' })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'agendamento.valor', operador: 'menor', valor: '1000' })).toBe(false)
  })

  it('comparar grandeza com o que não é grandeza dá falso, nunca verdadeiro', () => {
    expect(avaliarRegra(contexto, { campo: 'cliente.nome', operador: 'maior', valor: '10' })).toBe(false)
    expect(avaliarRegra(contexto, { campo: 'cliente.sobrenome', operador: 'menor', valor: '10' })).toBe(false)
  })

  it('procura dentro de lista', () => {
    expect(avaliarRegra(contexto, { campo: 'cliente.tags', operador: 'contem', valor: 'vip' })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'evento.nome', operador: 'em', valor: ['plano.aceito', 'plano.criado'] })).toBe(true)
    expect(avaliarRegra(contexto, { campo: 'evento.nome', operador: 'nao_em', valor: ['plano.criado'] })).toBe(true)
  })
})

describe('avaliarGrupo', () => {
  const regraVerdadeira = { campo: 'cliente.nome', operador: 'preenchido' } as const
  const regraFalsa      = { campo: 'cliente.email', operador: 'preenchido' } as const

  it('E exige todas; OU basta uma', () => {
    expect(avaliarGrupo(contexto, { juncao: 'e',  regras: [regraVerdadeira, regraFalsa] })).toBe(false)
    expect(avaliarGrupo(contexto, { juncao: 'ou', regras: [regraVerdadeira, regraFalsa] })).toBe(true)
  })

  it('grupo vazio passa tudo', () => {
    // "Sem filtro" significa "todos". O contrário faria um gatilho sem filtro
    // nunca disparar — o erro mudo que o painel de eventos existe para evitar.
    expect(avaliarGrupo(contexto, { juncao: 'e', regras: [] })).toBe(true)
    expect(avaliarGrupo(contexto, undefined)).toBe(true)
  })
})

describe('escolherSaida (SWITCH)', () => {
  const casos = [
    { chave: 'whats', valor: 'whatsapp' },
    { chave: 'insta', valor: 'instagram' },
  ]

  it('acha o caso e ignora caixa', () => {
    expect(escolherSaida({ conversa: { canal: 'WhatsApp' } }, 'conversa.canal', casos)).toBe('whats')
  })

  it('valor não previsto cai no padrão, em vez de o fluxo sumir', () => {
    expect(escolherSaida({ conversa: { canal: 'telegram' } }, 'conversa.canal', casos)).toBe('padrao')
    expect(escolherSaida({}, 'conversa.canal', casos)).toBe('padrao')
  })
})

describe('variáveis', () => {
  it('lista os caminhos citados', () => {
    expect(caminhosDoTexto('Oi {{cliente.nome}}, dia {{ agendamento.data }}'))
      .toEqual(['cliente.nome', 'agendamento.data'])
  })

  it('variável sem valor vira vazio, não o nome cru', () => {
    // O texto vai para o WhatsApp do cliente: "Oi {{cliente.sobrenome}}" é
    // pior que uma frase um pouco torta.
    expect(interpolarTexto('Oi {{cliente.sobrenome}}!', contexto)).toBe('Oi !')
    expect(interpolarTexto('E-mail: {{cliente.email}}', contexto)).toBe('E-mail: ')
  })

  it('data em ISO sai legível', () => {
    // 14:30Z é 11:30 em São Paulo — o fuso do negócio, não o do container.
    expect(interpolarTexto('{{agendamento.data}}', contexto)).toBe('24/09/2026 às 11:30')
  })

  it('lista sai separada por vírgula', () => {
    expect(interpolarTexto('{{cliente.tags}}', contexto)).toBe('VIP, Retorno')
  })
})
