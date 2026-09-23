/**
 * Ids de node e de ligação dentro do grafo.
 *
 * Vivem fora do componente de propósito: chamar `Math.random()` dentro dele faz
 * o React Compiler recusar a função como impura — e ele está certo, um mesmo
 * render não pode produzir ids diferentes a cada passada.
 *
 * Curtos e locais ao grafo, não UUID: só precisam ser únicos dentro de uma
 * automação, e aparecem no JSON que alguém eventualmente lê.
 */

function sufixo(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function novoIdDeNo(): string {
  return `n_${sufixo()}`
}

export function novoIdDeLigacao(): string {
  return `l_${sufixo()}`
}

/**
 * Com o que cada node nasce.
 *
 * Sem isto, o painel mostra "A unidade do fato" selecionado e o grafo salva
 * `alvo: undefined` — a tela dizendo uma coisa e o banco guardando outra, que é
 * o pior tipo de defeito de formulário: ninguém desconfia até a automação
 * falhar dizendo que falta escolher o que está escolhido na tela.
 */
export function configPadrao(tipo: string): Record<string, unknown> {
  switch (tipo) {
    case 'condicao.se':           return { grupo: { juncao: 'e', regras: [] } }
    case 'condicao.escolha':      return { casos: [] }
    case 'acao.notificar_equipe': return { alvo: 'unidade', alvoId: null, titulo: '', corpo: '' }
    case 'acao.anotar':           return { texto: '' }
    case 'acao.tag_cliente':      return { modo: 'adicionar' }
    case 'acao.desfecho':         return { desfecho: 'ganho' }
    case 'gatilho.agenda':        return { frequencia: 'diaria', hora: '09:00' }
    case 'espera.duracao':        return { quantidade: 1, unidade: 'dias' }
    case 'espera.ate':            return { minutos: -1440 }
    default:                      return {}
  }
}
