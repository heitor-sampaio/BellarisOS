import { CAMPOS_DO_EVENTO, CAMPOS_DO_FATO, DADOS_DO_NO, NODES } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, NoDoGrafo, TipoDeNo, NomeDeEvento, ConfigGatilhoEvento,
} from '@estetica-os/types'
import { chaveDoPasso, nomeDoPasso } from './passos'

/**
 * O que existe para escolher NESTE ponto do fluxo.
 *
 * Era a peça que faltava: o motor sempre soube ler qualquer caminho do contexto
 * (`lerCaminho`, em `condicoes.ts`), mas a tela oferecia uma lista fixa de 22
 * campos e nenhum deles vinha do evento que dispara. Quem quisesse perguntar
 * pelo texto da mensagem recebida não tinha como — o dado estava no contexto e
 * era inalcançável.
 *
 * Três fontes, nesta ordem de utilidade:
 *
 *  1. **o payload do gatilho**, que muda conforme o evento escolhido;
 *  2. **as entidades** que o motor hidrata sob demanda (cliente, agendamento…);
 *  3. **o que os passos anteriores deixaram** — e só os ANTERIORES: um node do
 *     outro ramo do IF pode não ter rodado, e oferecê-lo seria prometer um
 *     valor que nunca chega.
 *
 * Tudo puro e sem banco, para o teste pegar o que a tela esconde.
 */

export interface ItemDeVariavel {
  caminho: string
  rotulo:  string
  /** Valor visto no último fato real — só dica de tela, nunca é gravado. */
  exemplo?: string
}

export interface GrupoDeVariaveis {
  grupo: string
  itens: ItemDeVariavel[]
}

/** Um campo visto num fato real, vindo de `amostraDoEvento`. */
export interface CampoVisto {
  caminho: string
  exemplo: string
}

/**
 * As entidades que o motor hidrata sob demanda (`contexto.ts`).
 *
 * Lista curada, não "todas as colunas do banco": quem monta o fluxo escolhe de
 * perguntas que fazem sentido no dia a dia da clínica. O que falta aqui, o
 * payload do gatilho costuma cobrir — e, no limite, o campo escrito à mão.
 */
export const CAMPOS_DAS_ENTIDADES: GrupoDeVariaveis[] = [
  { grupo: 'Cliente', itens: [
    { caminho: 'cliente.nome',      rotulo: 'Nome' },
    { caminho: 'cliente.telefone',  rotulo: 'Telefone' },
    { caminho: 'cliente.email',     rotulo: 'E-mail' },
    { caminho: 'cliente.tags',      rotulo: 'Tags' },
    { caminho: 'cliente.genero',    rotulo: 'Gênero' },
    { caminho: 'cliente.aniversarioHoje', rotulo: 'Faz aniversário hoje' },
    { caminho: 'cliente.ativo',     rotulo: 'Está ativo' },
  ] },
  { grupo: 'Agendamento', itens: [
    { caminho: 'agendamento.status',       rotulo: 'Situação' },
    { caminho: 'agendamento.valor',        rotulo: 'Valor' },
    { caminho: 'agendamento.procedimento', rotulo: 'Procedimento' },
    { caminho: 'agendamento.profissional', rotulo: 'Profissional' },
    { caminho: 'agendamento.data',         rotulo: 'Data e hora' },
  ] },
  { grupo: 'Oportunidade', itens: [
    { caminho: 'lead.etapa',  rotulo: 'Etapa do funil' },
    { caminho: 'lead.origem', rotulo: 'Origem' },
    { caminho: 'lead.valor',  rotulo: 'Valor' },
    { caminho: 'lead.tags',   rotulo: 'Tags' },
  ] },
  { grupo: 'Conversa', itens: [
    { caminho: 'conversa.canal',  rotulo: 'Canal' },
    { caminho: 'conversa.status', rotulo: 'Situação' },
  ] },
]

/**
 * Os nodes que rodam ANTES deste, caminhando para trás pelas ligações.
 *
 * `visitados` não é otimização: um grafo pode estar em anel enquanto a pessoa
 * monta, e sem a marca a busca não terminaria — travando a tela no meio da
 * edição, que é o pior momento possível.
 *
 * A ordem é a do grafo, não a da busca: é assim que a pessoa vê os cards no
 * quadro, e listar "de trás para frente" faria a lista mudar de ordem a cada
 * ligação nova.
 */
export function antecessoresDe(grafo: GrafoDeAutomacao, noId: string): NoDoGrafo[] {
  const porId = new Map(grafo.nos.map(n => [n.id, n]))
  const achados = new Set<string>()
  const fila = [noId]

  while (fila.length) {
    const atual = fila.shift()!
    for (const l of grafo.ligacoes) {
      if (l.para !== atual || achados.has(l.de)) continue
      achados.add(l.de)
      fila.push(l.de)
    }
  }

  return grafo.nos.filter(n => achados.has(n.id) && porId.has(n.id))
}

/**
 * O evento configurado no gatilho que alimenta este ponto do fluxo.
 *
 * Procura primeiro subindo o fluxo; **não achando, vale o gatilho do grafo**,
 * mesmo que o node ainda esteja solto. É de propósito: um fluxo tem um gatilho
 * só (o validador recusa dois), então quando este node for alcançado terá sido
 * por ele — não há ambiguidade. E, no editor, o node é configurado antes de ser
 * ligado: exigir a ligação faria a lista de campos aparecer vazia justamente na
 * hora em que a pessoa está montando.
 *
 * O mesmo NÃO vale para o resultado dos passos: ali o ramo importa, e um node
 * do outro lado do IF pode nunca rodar.
 */
export function eventoDoGatilhoDe(grafo: GrafoDeAutomacao, noId: string): NomeDeEvento | null {
  const candidatos = [
    ...antecessoresDe(grafo, noId),
    ...grafo.nos.filter(n => n.id === noId),
    ...grafo.nos,
  ]
  for (const no of candidatos) {
    if (no.tipo !== NODES.GATILHO_EVENTO) continue
    const evento = (no.config as Partial<ConfigGatilhoEvento>)?.evento
    if (evento) return evento as NomeDeEvento
  }
  return null
}

interface Opcoes {
  /** Campos vistos no último fato real daquele evento (`amostraDoEvento`). */
  vistos?: CampoVisto[]
}

export function variaveisDisponiveis(
  grafo: GrafoDeAutomacao,
  noId:  string,
  opcoes: Opcoes = {},
): GrupoDeVariaveis[] {
  const grupos: GrupoDeVariaveis[] = []

  const evento = eventoDoGatilhoDe(grafo, noId)
  const declarados = evento ? (CAMPOS_DO_EVENTO[evento] ?? []) : []
  const vistos = opcoes.vistos ?? []

  // O catálogo primeiro, com o rótulo em português; o que só apareceu no fato
  // real entra depois, com o próprio caminho por nome. Os dois juntos são a
  // resposta ao "todas as informações do evento": um garante o previsível, o
  // outro pega o que nenhum catálogo previu.
  const doGatilho: ItemDeVariavel[] = declarados.map(c => ({
    caminho: c.caminho,
    rotulo:  c.rotulo,
    exemplo: vistos.find(v => v.caminho === c.caminho)?.exemplo,
  }))

  const jaTem = new Set(doGatilho.map(i => i.caminho))
  for (const v of vistos) {
    if (jaTem.has(v.caminho)) continue
    doGatilho.push({ caminho: v.caminho, rotulo: ultimaParte(v.caminho), exemplo: v.exemplo })
  }

  if (doGatilho.length) {
    grupos.push({ grupo: 'O que chegou no gatilho', itens: doGatilho })
  }

  grupos.push(...CAMPOS_DAS_ENTIDADES)
  grupos.push({ grupo: 'O fato', itens: CAMPOS_DO_FATO.map(c => ({ caminho: c.caminho, rotulo: c.rotulo })) })

  for (const anterior of antecessoresDe(grafo, noId)) {
    const dados = DADOS_DO_NO[anterior.tipo as TipoDeNo] ?? []
    if (!dados.length) continue
    const chave = chaveDoPasso(anterior, grafo)
    grupos.push({
      grupo: `Passo: ${nomeDoPasso(anterior, grafo)}`,
      itens: dados.map(d => ({
        caminho: `passos.${chave}.${d.campo}`,
        rotulo:  d.rotulo,
      })),
    })
  }

  return grupos
}

function ultimaParte(caminho: string): string {
  return caminho.split('.').at(-1) ?? caminho
}

/**
 * Achata o `dados` de um fato real em caminhos escolhíveis.
 *
 * Desce até três níveis porque payload com objeto aninhado existe e o caminho
 * precisa chegar na folha; mais que isso seria listar estrutura em vez de dado.
 * Lista vira o caminho da própria lista — perguntar pelo terceiro item de um
 * array não é o tipo de regra que esta tela monta.
 */
export function achatarDados(
  dados: unknown,
  prefixo = 'evento.dados',
  nivel = 0,
): CampoVisto[] {
  if (nivel > 2 || !dados || typeof dados !== 'object' || Array.isArray(dados)) return []

  const saida: CampoVisto[] = []
  for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
    const caminho = `${prefixo}.${chave}`
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      saida.push(...achatarDados(valor, caminho, nivel + 1))
      continue
    }
    saida.push({ caminho, exemplo: comoExemplo(valor) })
  }
  return saida
}

/** O valor como dica de tela: curto, e sem despejar o payload inteiro. */
const MAX_EXEMPLO = 80

function comoExemplo(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  const texto = Array.isArray(valor) ? valor.join(', ') : String(valor)
  return texto.length > MAX_EXEMPLO ? `${texto.slice(0, MAX_EXEMPLO)}…` : texto
}
