import { describe, it, expect } from 'vitest'
import { NODES, EVENTOS, CAMPOS_DO_EVENTO } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import {
  antecessoresDe, eventoDoGatilhoDe, variaveisDisponiveis, achatarDados,
} from '@/lib/automacoes/disponiveis'
import {
  slugDoPasso, nomeDoPasso, chaveDoPasso, nomePadraoDoPasso, renomearPasso,
} from '@/lib/automacoes/passos'

/**
 * O que cada node enxerga no ponto em que está.
 *
 * O defeito que isto guarda foi relatado montando um fluxo: **o IF não
 * conseguia validar a mensagem recebida**. O motor sempre soube ler
 * `evento.dados.texto`; a tela é que oferecia 22 campos fixos, nenhum vindo do
 * evento que dispara. E a saída de cada passo morria no histórico, então nada
 * podia reagir ao que o passo anterior fez.
 */

function grafo(): GrafoDeAutomacao {
  // gatilho → se → (sim) mensagem → anotar
  //               (nao) avisar
  return {
    nos: [
      { id: 'g',  tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 }, nome: 'Quando acontecer',
        config: { evento: EVENTOS.CONVERSA_MENSAGEM_RECEBIDA } },
      { id: 'se', tipo: NODES.CONDICAO_SE,    pos: { x: 1, y: 0 }, nome: 'Se',            config: {} },
      { id: 'm',  tipo: NODES.ACAO_MENSAGEM,  pos: { x: 2, y: 0 }, nome: 'Mandar mensagem', config: {} },
      { id: 'a',  tipo: NODES.ACAO_ANOTAR,    pos: { x: 3, y: 0 }, nome: 'Anotar',        config: {} },
      { id: 'av', tipo: NODES.ACAO_NOTIFICAR_EQUIPE, pos: { x: 2, y: 1 }, nome: 'Avisar', config: {} },
    ],
    ligacoes: [
      { id: 'l1', de: 'g',  para: 'se' },
      { id: 'l2', de: 'se', para: 'm',  saida: 'sim' },
      { id: 'l3', de: 'm',  para: 'a' },
      { id: 'l4', de: 'se', para: 'av', saida: 'nao' },
    ],
  }
}

describe('antecessoresDe', () => {
  it('pega o antecessor direto e o indireto', () => {
    expect(antecessoresDe(grafo(), 'a').map(n => n.id)).toEqual(['g', 'se', 'm'])
  })

  it('o outro ramo da condição NÃO aparece', () => {
    // O node do ramo "não" pode simplesmente não ter rodado. Oferecer o
    // resultado dele seria prometer um valor que nunca chega.
    expect(antecessoresDe(grafo(), 'a').map(n => n.id)).not.toContain('av')
    expect(antecessoresDe(grafo(), 'av').map(n => n.id)).not.toContain('m')
  })

  it('o gatilho não tem antecessor', () => {
    expect(antecessoresDe(grafo(), 'g')).toEqual([])
  })

  it('grafo em anel não trava a tela', () => {
    // Acontece enquanto a pessoa monta — e travar no meio da edição é o pior
    // momento possível.
    const g = grafo()
    g.ligacoes.push({ id: 'l5', de: 'a', para: 'se' })
    expect(antecessoresDe(g, 'a').map(n => n.id).sort()).toEqual(['a', 'g', 'm', 'se'])
  })
})

describe('eventoDoGatilhoDe', () => {
  it('acha o evento subindo o fluxo', () => {
    expect(eventoDoGatilhoDe(grafo(), 'a')).toBe(EVENTOS.CONVERSA_MENSAGEM_RECEBIDA)
  })

  it('sem gatilho de evento, é nulo', () => {
    const g: GrafoDeAutomacao = {
      nos: [{ id: 'x', tipo: NODES.GATILHO_AGENDA, pos: { x: 0, y: 0 }, config: { hora: '09:00' } }],
      ligacoes: [],
    }
    expect(eventoDoGatilhoDe(g, 'x')).toBeNull()
  })
})

describe('variaveisDisponiveis', () => {
  it('oferece o payload do gatilho — o caso que motivou tudo', () => {
    const grupos = variaveisDisponiveis(grafo(), 'se')
    const gatilho = grupos.find(g => g.grupo === 'O que chegou no gatilho')
    expect(gatilho?.itens.map(i => i.caminho)).toContain('evento.dados.texto')
  })

  it('oferece o resultado dos passos ANTERIORES, e só deles', () => {
    const grupos = variaveisDisponiveis(grafo(), 'a')
    const caminhos = grupos.flatMap(g => g.itens.map(i => i.caminho))
    expect(caminhos).toContain('passos.mandar_mensagem.enviada')
    expect(caminhos).toContain('passos.se.resultado')
    // "Avisar" está no outro ramo.
    expect(caminhos.some(c => c.startsWith('passos.avisar.'))).toBe(false)
  })

  it('o campo visto num fato real entra mesmo sem estar no catálogo', () => {
    // `dados` aceita campo que ninguém declarou. Sem isto, o que chega de
    // verdade continuaria inalcançável — que era o problema original.
    const grupos = variaveisDisponiveis(grafo(), 'se', {
      vistos: [{ caminho: 'evento.dados.inventado', exemplo: 'oi' }],
    })
    const gatilho = grupos.find(g => g.grupo === 'O que chegou no gatilho')!
    const achado = gatilho.itens.find(i => i.caminho === 'evento.dados.inventado')
    expect(achado?.exemplo).toBe('oi')
  })

  it('o exemplo do fato real acompanha o campo declarado', () => {
    const grupos = variaveisDisponiveis(grafo(), 'se', {
      vistos: [{ caminho: 'evento.dados.texto', exemplo: 'quanto custa?' }],
    })
    const gatilho = grupos.find(g => g.grupo === 'O que chegou no gatilho')!
    const texto = gatilho.itens.find(i => i.caminho === 'evento.dados.texto')!
    // Rótulo do catálogo, exemplo do banco: um não substitui o outro.
    expect(texto.rotulo).toBe('Texto da mensagem')
    expect(texto.exemplo).toBe('quanto custa?')
    expect(gatilho.itens.filter(i => i.caminho === 'evento.dados.texto')).toHaveLength(1)
  })

  it('sem gatilho de evento, as entidades continuam disponíveis', () => {
    const g: GrafoDeAutomacao = {
      nos: [
        { id: 'x', tipo: NODES.GATILHO_AGENDA, pos: { x: 0, y: 0 }, config: { hora: '09:00' } },
        { id: 'y', tipo: NODES.CONDICAO_SE,    pos: { x: 1, y: 0 }, config: {} },
      ],
      ligacoes: [{ id: 'l', de: 'x', para: 'y' }],
    }
    const caminhos = variaveisDisponiveis(g, 'y').flatMap(gr => gr.itens.map(i => i.caminho))
    expect(caminhos).toContain('cliente.nome')
  })
})

describe('achatarDados', () => {
  it('achata objeto aninhado em caminhos de folha', () => {
    const r = achatarDados({ texto: 'oi', anuncio: { id: '123', titulo: 'Botox' } })
    expect(r.map(c => c.caminho)).toEqual([
      'evento.dados.texto', 'evento.dados.anuncio.id', 'evento.dados.anuncio.titulo',
    ])
  })

  it('lista vira o caminho da própria lista', () => {
    const r = achatarDados({ alterou: ['nome', 'telefone'] })
    expect(r).toEqual([{ caminho: 'evento.dados.alterou', exemplo: 'nome, telefone' }])
  })

  it('corta o exemplo longo — é dica de tela, não despejo do payload', () => {
    const r = achatarDados({ texto: 'a'.repeat(300) })
    expect(r[0]!.exemplo.length).toBeLessThanOrEqual(81)
    expect(r[0]!.exemplo.endsWith('…')).toBe(true)
  })

  it('nulo aparece como traço, não some', () => {
    // Campo que veio vazio é resposta: diz que o evento não traz aquilo.
    expect(achatarDados({ telefone: null })).toEqual([
      { caminho: 'evento.dados.telefone', exemplo: '—' },
    ])
  })

  it('payload ausente não quebra', () => {
    expect(achatarDados(null)).toEqual([])
    expect(achatarDados('texto solto')).toEqual([])
  })
})

describe('nome e chave do passo', () => {
  it('o slug é o que vai no caminho', () => {
    expect(slugDoPasso('Mandar mensagem 2')).toBe('mandar_mensagem_2')
    expect(slugDoPasso('Anotar na oportunidade')).toBe('anotar_na_oportunidade')
    expect(slugDoPasso('Ação com acento')).toBe('acao_com_acento')
  })

  it('grafo antigo, sem nome salvo, ainda tem chave', () => {
    // A feature nasceu depois dos grafos que já existem; cair fora aqui seria
    // perder o acesso ao passo inteiro.
    const g: GrafoDeAutomacao = {
      nos: [
        { id: 'a', tipo: NODES.ACAO_MENSAGEM, pos: { x: 0, y: 0 }, config: {} },
        { id: 'b', tipo: NODES.ACAO_MENSAGEM, pos: { x: 1, y: 0 }, config: {} },
      ],
      ligacoes: [],
    }
    expect(nomeDoPasso(g.nos[0]!, g)).toBe('Mandar mensagem 1')
    expect(chaveDoPasso(g.nos[1]!, g)).toBe('mandar_mensagem_2')
  })

  it('o nome padrão não repete o de um passo que já existe', () => {
    // Chave repetida faria o segundo passo apagar em silêncio o que o
    // primeiro deixou.
    const g: GrafoDeAutomacao = {
      nos: [{ id: 'a', tipo: NODES.ACAO_MENSAGEM, pos: { x: 0, y: 0 }, nome: 'Mandar mensagem', config: {} }],
      ligacoes: [],
    }
    expect(nomePadraoDoPasso(NODES.ACAO_MENSAGEM, g)).toBe('Mandar mensagem 2')
  })
})

describe('CAMPOS_DO_EVENTO', () => {
  it('todo evento do catálogo tem campos declarados', () => {
    // Evento sem entrada aqui é um gatilho que a tela oferece e sobre o qual
    // ninguém consegue perguntar nada.
    for (const nome of Object.values(EVENTOS)) {
      expect(CAMPOS_DO_EVENTO[nome], `faltam os campos de ${nome}`).toBeDefined()
      expect(CAMPOS_DO_EVENTO[nome]!.length).toBeGreaterThan(0)
    }
  })

  it('todo caminho aponta para dentro do payload', () => {
    for (const [nome, campos] of Object.entries(CAMPOS_DO_EVENTO)) {
      for (const campo of campos) {
        expect(campo.caminho.startsWith('evento.dados.'), `${nome}: ${campo.caminho}`).toBe(true)
      }
    }
  })

  it('nenhum evento declara o mesmo campo duas vezes', () => {
    for (const [nome, campos] of Object.entries(CAMPOS_DO_EVENTO)) {
      const caminhos = campos.map(c => c.caminho)
      expect(new Set(caminhos).size, `${nome} tem campo repetido`).toBe(caminhos.length)
    }
  })
})

describe('o payload do gatilho antes de ligar', () => {
  it('node ainda solto já enxerga o evento do fluxo', () => {
    // No editor o node é configurado ANTES de ser ligado. Exigir a ligação
    // faria a lista de campos aparecer vazia justo na hora de montar — e o
    // fluxo tem um gatilho só, então não há ambiguidade sobre qual é.
    const g: GrafoDeAutomacao = {
      nos: [
        { id: 'g', tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 },
          config: { evento: EVENTOS.CONVERSA_MENSAGEM_RECEBIDA } },
        { id: 'solto', tipo: NODES.CONDICAO_SE, pos: { x: 1, y: 0 }, config: {} },
      ],
      ligacoes: [],
    }
    expect(eventoDoGatilhoDe(g, 'solto')).toBe(EVENTOS.CONVERSA_MENSAGEM_RECEBIDA)

    const caminhos = variaveisDisponiveis(g, 'solto').flatMap(x => x.itens.map(i => i.caminho))
    expect(caminhos).toContain('evento.dados.texto')
  })

  it('mas o resultado de um passo solto continua fora', () => {
    // Aqui o ramo importa: passo não ligado pode nunca rodar.
    const g: GrafoDeAutomacao = {
      nos: [
        { id: 'g', tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 },
          config: { evento: EVENTOS.CONVERSA_MENSAGEM_RECEBIDA } },
        { id: 'm', tipo: NODES.ACAO_MENSAGEM, pos: { x: 1, y: 0 }, nome: 'Mandar mensagem', config: {} },
        { id: 'se', tipo: NODES.CONDICAO_SE, pos: { x: 2, y: 0 }, config: {} },
      ],
      ligacoes: [{ id: 'l', de: 'g', para: 'se' }],
    }
    const caminhos = variaveisDisponiveis(g, 'se').flatMap(x => x.itens.map(i => i.caminho))
    expect(caminhos.some(c => c.startsWith('passos.mandar_mensagem.'))).toBe(false)
  })
})

describe('renomearPasso', () => {
  // O nome é a chave. Trocá-lo sem mais nada deixaria as referências
  // apontando para o vazio — e variável sem valor vira string vazia, ou seja,
  // a frase sai pela metade para o cliente sem nada avisar.
  function comReferencias(): GrafoDeAutomacao {
    return {
      nos: [
        { id: 'g', tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 }, nome: 'Quando acontecer',
          config: { evento: EVENTOS.CONVERSA_MENSAGEM_RECEBIDA } },
        { id: 'm', tipo: NODES.ACAO_MENSAGEM, pos: { x: 1, y: 0 }, nome: 'Mandar mensagem',
          config: { canal: 'whatsapp', texto: 'oi' } },
        { id: 'm2', tipo: NODES.ACAO_MENSAGEM, pos: { x: 2, y: 0 }, nome: 'Mandar mensagem 2',
          config: { canal: 'whatsapp', texto: 'de novo' } },
        { id: 'a', tipo: NODES.ACAO_ANOTAR, pos: { x: 3, y: 0 }, nome: 'Anotar',
          config: { texto: 'Enviou: {{passos.mandar_mensagem.enviada}} e {{passos.mandar_mensagem_2.canal}}' } },
        { id: 'se', tipo: NODES.CONDICAO_SE, pos: { x: 4, y: 0 }, nome: 'Se',
          config: { grupo: { juncao: 'e', regras: [
            { campo: 'passos.mandar_mensagem.conversaId', operador: 'preenchido' },
          ] } } },
      ],
      ligacoes: [],
    }
  }

  const textoDe = (g: GrafoDeAutomacao, id: string) =>
    (g.nos.find(n => n.id === id)!.config as { texto?: string }).texto

  it('troca as referências nos textos', () => {
    const g = renomearPasso(comReferencias(), 'm', 'Primeira mensagem')
    expect(textoDe(g, 'a')).toContain('{{passos.primeira_mensagem.enviada}}')
    expect(textoDe(g, 'a')).not.toContain('mandar_mensagem.enviada')
  })

  it('troca também dentro das regras de condição', () => {
    const g = renomearPasso(comReferencias(), 'm', 'Primeira mensagem')
    const grupo = (g.nos.find(n => n.id === 'se')!.config as { grupo: { regras: { campo: string }[] } }).grupo
    expect(grupo.regras[0]!.campo).toBe('passos.primeira_mensagem.conversaId')
  })

  it('NÃO mexe no passo de nome parecido', () => {
    // "Mandar mensagem" é prefixo de "Mandar mensagem 2": trocar por prefixo
    // destruiria a referência do vizinho.
    const g = renomearPasso(comReferencias(), 'm', 'Primeira mensagem')
    expect(textoDe(g, 'a')).toContain('{{passos.mandar_mensagem_2.canal}}')
  })

  it('nome que vira slug vazio não propaga nada', () => {
    // Acontece no meio da digitação. Reescrever para `passos..campo` deixaria
    // lixo que nem o nome final conserta.
    const g = renomearPasso(comReferencias(), 'm', '   ')
    expect(textoDe(g, 'a')).toContain('{{passos.mandar_mensagem.enviada}}')
    expect(g.nos.find(n => n.id === 'm')!.nome).toBe('   ')
  })

  it('renomear para o mesmo nome não muda nada', () => {
    const antes = comReferencias()
    const g = renomearPasso(antes, 'm', 'Mandar mensagem')
    expect(textoDe(g, 'a')).toBe(textoDe(antes, 'a'))
  })

  it('o grafo renomeado continua válido para o seletor', () => {
    const g = renomearPasso(comReferencias(), 'm', 'Primeira mensagem')
    g.ligacoes.push({ id: 'l1', de: 'm', para: 'a' })
    const caminhos = variaveisDisponiveis(g, 'a').flatMap(x => x.itens.map(i => i.caminho))
    expect(caminhos).toContain('passos.primeira_mensagem.enviada')
  })
})
