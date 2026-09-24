import { ROTULOS_DE_NO } from '@estetica-os/types'
import type { GrafoDeAutomacao, NoDoGrafo, TipoDeNo } from '@estetica-os/types'

/**
 * O nome de cada passo — e, por ele, a chave que dá acesso ao que o passo
 * deixou para os seguintes: `{{passos.mandar_mensagem_1.conversaId}}`.
 *
 * Por que nome e não o id do node: o caminho aparece dentro do texto de uma
 * mensagem que alguém vai reler daqui a seis meses, e `passos.n_7a3f.enviada`
 * não diz nada. É a mesma escolha do n8n, que referencia o node pelo nome.
 *
 * Funções puras — a tela usa para montar a lista e o executor usa para gravar.
 */

/** `Mandar mensagem 1` → `mandar_mensagem_1`. Sem acento, sem espaço. */
export function slugDoPasso(nome: string): string {
  return (nome ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Como este passo se chama.
 *
 * Grafo salvo antes desta frente não tem `nome`, e cair fora seria perder o
 * acesso ao passo inteiro. O nome derivado do tipo mais a posição entre os do
 * mesmo tipo cobre esses — e, como ninguém pôde escrever `{{passos.…}}` antes
 * de a chave existir, não há referência antiga para quebrar.
 */
export function nomeDoPasso(no: NoDoGrafo, grafo: GrafoDeAutomacao): string {
  if (no.nome?.trim()) return no.nome.trim()
  const rotulo = ROTULOS_DE_NO[no.tipo as TipoDeNo] ?? no.tipo
  const iguais = grafo.nos.filter(n => n.tipo === no.tipo)
  const posicao = iguais.findIndex(n => n.id === no.id) + 1
  return iguais.length > 1 ? `${rotulo} ${posicao}` : rotulo
}

export function chaveDoPasso(no: NoDoGrafo, grafo: GrafoDeAutomacao): string {
  return slugDoPasso(nomeDoPasso(no, grafo))
}

/**
 * Renomeia um passo **e conserta quem o citava**.
 *
 * O nome é a chave (`{{passos.mandar_mensagem.enviada}}`), então trocá-lo sem
 * mais nada deixaria toda referência apontando para o vazio — e variável sem
 * valor vira string vazia: a frase sairia pela metade para o cliente. O
 * validador avisa, mas avisar é o segundo melhor; melhor é não quebrar.
 *
 * Troca só o segmento inteiro (`passos.<chave>.`), nunca por prefixo: renomear
 * "Mandar mensagem" não pode mexer no que cita "Mandar mensagem 2".
 *
 * Nome que vira slug vazio não propaga — o passo volta ao nome derivado do tipo
 * e as referências ficam como estavam, à espera do nome de verdade.
 */
export function renomearPasso(
  grafo: GrafoDeAutomacao,
  noId:  string,
  nome:  string,
): GrafoDeAutomacao {
  const alvo = grafo.nos.find(n => n.id === noId)
  if (!alvo) return grafo

  const antes  = chaveDoPasso(alvo, grafo)
  const depois = slugDoPasso(nome)

  const renomeado: GrafoDeAutomacao = {
    ...grafo,
    nos: grafo.nos.map(n => (n.id === noId ? { ...n, nome } : n)),
  }

  if (!depois || depois === antes) return renomeado

  return {
    ...renomeado,
    nos: renomeado.nos.map(n => ({
      ...n,
      config: trocarNaConfig(n.config as Record<string, unknown>, antes, depois),
    })),
  }
}

/** Reescreve `passos.<antes>.` em tudo que a config guarda como texto. */
function trocarNaConfig(
  config: Record<string, unknown>,
  antes:  string,
  depois: string,
): Record<string, unknown> {
  const de = new RegExp(`passos\\.${escaparRegex(antes)}\\.`, 'g')
  const troca = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(de, `passos.${depois}.`)
    if (Array.isArray(v)) return v.map(troca)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, troca(val)]),
      )
    }
    return v
  }
  return troca(config ?? {}) as Record<string, unknown>
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * O nome que um node novo recebe ao nascer.
 *
 * Numerado a partir dos que já existem, para dois "Mandar mensagem" não
 * disputarem a mesma chave — colisão de chave faria o segundo passo apagar em
 * silêncio o que o primeiro deixou.
 */
export function nomePadraoDoPasso(tipo: TipoDeNo, grafo: GrafoDeAutomacao): string {
  const rotulo = ROTULOS_DE_NO[tipo] ?? tipo
  const usados = new Set(grafo.nos.map(n => slugDoPasso(nomeDoPasso(n, grafo))))
  if (!usados.has(slugDoPasso(rotulo))) return rotulo
  for (let i = 2; i < 500; i++) {
    const tentativa = `${rotulo} ${i}`
    if (!usados.has(slugDoPasso(tentativa))) return tentativa
  }
  return `${rotulo} ${grafo.nos.length + 1}`
}
