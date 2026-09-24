/**
 * Expressões dos campos de automação.
 *
 * Até aqui um campo era um CAMINHO (`cliente.nome`) e nada mais — decisão de
 * produto: "condição é construtor, não linguagem", porque quem monta isto é a
 * recepção da clínica. O Heitor pediu para abrir, e o desenho reflete os dois
 * lados: a lista de campos continua sendo o caminho normal da tela, e a
 * expressão é a saída para o que ela não cobre.
 *
 * ⚠️ **Nada de `eval` nem de `new Function`.** O texto vem do banco e é
 * avaliado NO SERVIDOR, dentro do motor: um `new Function` aqui seria execução
 * remota de código a um `update` de distância. Por isso há um analisador
 * próprio — pequeno, sem acesso a nada além do contexto e de uma lista fechada
 * de funções.
 *
 * O que existe:
 *
 *   números, textos ('a' ou "a"), true/false, nulo
 *   caminhos          cliente.nome, evento.dados.texto, passos.x.enviada
 *   aritmética        + - * / %
 *   comparação        == != > >= < <=
 *   lógica            && || ! ??
 *   condicional       cond ? isto : aquilo
 *   funções           a lista de FUNCOES, abaixo
 *
 * O que NÃO existe, de propósito: atribuição, laço, acesso a índice de lista,
 * definição de função e qualquer forma de alcançar o ambiente. Uma expressão
 * lê o contexto e devolve um valor — nada mais.
 */

import { formatBRL } from '@estetica-os/utils'

/** Teto de tamanho: expressão maior que isto é erro de quem escreveu. */
const MAX_TEXTO = 500
/** Teto de aninhamento, contra um texto feito para estourar a pilha. */
const MAX_PROFUNDIDADE = 32

export class ErroDeExpressao extends Error {}

// ─── Tokens ─────────────────────────────────────────────────────────────────

type TipoDeToken = 'numero' | 'texto' | 'nome' | 'simbolo' | 'fim'
interface Token { tipo: TipoDeToken; valor: string; pos: number }

const SIMBOLOS = [
  '===', '!==', '==', '!=', '>=', '<=', '&&', '||', '??',
  '>', '<', '+', '-', '*', '/', '%', '!', '(', ')', ',', '?', ':', '.',
]

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < texto.length) {
    const c = texto[i]!

    if (/\s/.test(c)) { i++; continue }

    // Texto entre aspas, simples ou duplas. Sem escapes: a clínica escreve
    // "Oi" e não "Oi\n" — e aceitar escape abriria a porta para interpretar
    // mais coisa do que se pretende.
    if (c === '"' || c === "'") {
      const fim = texto.indexOf(c, i + 1)
      if (fim < 0) throw new ErroDeExpressao(`Faltou fechar a aspa em "${texto.slice(i, i + 20)}".`)
      tokens.push({ tipo: 'texto', valor: texto.slice(i + 1, fim), pos: i })
      i = fim + 1
      continue
    }

    if (/[0-9]/.test(c)) {
      let j = i
      while (j < texto.length && /[0-9.]/.test(texto[j]!)) j++
      tokens.push({ tipo: 'numero', valor: texto.slice(i, j), pos: i })
      i = j
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < texto.length && /[A-Za-z0-9_]/.test(texto[j]!)) j++
      tokens.push({ tipo: 'nome', valor: texto.slice(i, j), pos: i })
      i = j
      continue
    }

    const simbolo = SIMBOLOS.find(s => texto.startsWith(s, i))
    if (!simbolo) throw new ErroDeExpressao(`Não entendi o caractere "${c}".`)
    tokens.push({ tipo: 'simbolo', valor: simbolo, pos: i })
    i += simbolo.length
  }

  tokens.push({ tipo: 'fim', valor: '', pos: texto.length })
  return tokens
}

// ─── Árvore ─────────────────────────────────────────────────────────────────

type No =
  | { t: 'valor';    v: unknown }
  | { t: 'caminho';  caminho: string }
  | { t: 'unario';   op: string; a: No }
  | { t: 'binario';  op: string; a: No; b: No }
  | { t: 'se';       cond: No; entao: No; senao: No }
  | { t: 'chamada';  nome: string; args: No[] }

/**
 * Analisador descendente recursivo, da menor precedência para a maior.
 *
 * `??` fica junto de `||` para não precisar de parênteses numa expressão que a
 * recepção escreveria — o JavaScript proíbe misturar os dois sem parênteses, e
 * aqui essa regra só serviria para dar erro em texto que faz sentido.
 */
class Analisador {
  private i = 0
  constructor(private readonly tokens: Token[], private readonly origem: string) {}

  analisar(): No {
    const no = this.expressao(0)
    if (this.atual().tipo !== 'fim') {
      throw new ErroDeExpressao(`Sobrou "${this.atual().valor}" no fim de "${this.origem}".`)
    }
    return no
  }

  private atual(): Token { return this.tokens[this.i]! }

  private comer(valor: string): boolean {
    if (this.atual().tipo === 'simbolo' && this.atual().valor === valor) { this.i++; return true }
    return false
  }

  private exigir(valor: string): void {
    if (!this.comer(valor)) {
      throw new ErroDeExpressao(`Esperava "${valor}" e veio "${this.atual().valor || 'o fim'}".`)
    }
  }

  private expressao(nivel: number): No {
    if (nivel > MAX_PROFUNDIDADE) throw new ErroDeExpressao('Expressão aninhada demais.')
    return this.ternario(nivel)
  }

  private ternario(nivel: number): No {
    const cond = this.binario(nivel, 0)
    if (!this.comer('?')) return cond
    const entao = this.expressao(nivel + 1)
    this.exigir(':')
    const senao = this.expressao(nivel + 1)
    return { t: 'se', cond, entao, senao }
  }

  /** Precedência: 0 `|| ??`, 1 `&&`, 2 `== !=`, 3 comparação, 4 `+ -`, 5 `* / %`. */
  private binario(nivel: number, grau: number): No {
    const POR_GRAU = [['||', '??'], ['&&'], ['==', '===', '!=', '!=='], ['>', '>=', '<', '<='], ['+', '-'], ['*', '/', '%']]
    if (grau >= POR_GRAU.length) return this.unario(nivel)

    let a = this.binario(nivel, grau + 1)
    for (;;) {
      const op = POR_GRAU[grau]!.find(o => this.atual().tipo === 'simbolo' && this.atual().valor === o)
      if (!op) return a
      this.i++
      const b = this.binario(nivel, grau + 1)
      a = { t: 'binario', op, a, b }
    }
  }

  private unario(nivel: number): No {
    if (this.comer('!')) return { t: 'unario', op: '!', a: this.unario(nivel) }
    if (this.comer('-')) return { t: 'unario', op: '-', a: this.unario(nivel) }
    return this.primario(nivel)
  }

  private primario(nivel: number): No {
    const tk = this.atual()

    if (this.comer('(')) {
      const dentro = this.expressao(nivel + 1)
      this.exigir(')')
      return dentro
    }

    if (tk.tipo === 'numero') {
      this.i++
      const n = Number(tk.valor)
      if (!Number.isFinite(n)) throw new ErroDeExpressao(`"${tk.valor}" não é um número.`)
      return { t: 'valor', v: n }
    }

    if (tk.tipo === 'texto') { this.i++; return { t: 'valor', v: tk.valor } }

    if (tk.tipo === 'nome') {
      this.i++
      if (tk.valor === 'true')  return { t: 'valor', v: true }
      if (tk.valor === 'false') return { t: 'valor', v: false }
      if (tk.valor === 'nulo' || tk.valor === 'null') return { t: 'valor', v: null }

      // Chamada de função — só o que está em FUNCOES.
      if (this.atual().tipo === 'simbolo' && this.atual().valor === '(') {
        this.i++
        const args: No[] = []
        if (!this.comer(')')) {
          do { args.push(this.expressao(nivel + 1)) } while (this.comer(','))
          this.exigir(')')
        }
        if (!(tk.valor in FUNCOES)) {
          throw new ErroDeExpressao(
            `Não existe a função "${tk.valor}". Existem: ${Object.keys(FUNCOES).join(', ')}.`,
          )
        }
        return { t: 'chamada', nome: tk.valor, args }
      }

      // Caminho: `cliente.nome`, `passos.x.enviada`.
      let caminho = tk.valor
      while (this.atual().tipo === 'simbolo' && this.atual().valor === '.') {
        this.i++
        const parte = this.atual()
        if (parte.tipo !== 'nome' && parte.tipo !== 'numero') {
          throw new ErroDeExpressao(`Esperava um nome depois do ponto em "${caminho}.".`)
        }
        this.i++
        caminho += `.${parte.valor}`
      }
      return { t: 'caminho', caminho }
    }

    throw new ErroDeExpressao(`Não esperava "${tk.valor || 'o fim'}" aqui.`)
  }
}

// ─── Leitura do contexto ────────────────────────────────────────────────────

/**
 * Chaves que jamais são navegadas.
 *
 * Sem esta trava, um caminho como `constructor.constructor` alcançaria o
 * construtor de funções do JavaScript. Nada aqui CHAMA o que lê, então o risco
 * é teórico — mas a trava custa uma linha e o dia em que alguém passar o valor
 * lido adiante ela já está posta.
 */
const PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])

export function lerDoContexto(contexto: Record<string, unknown>, caminho: string): unknown {
  let atual: unknown = contexto
  for (const parte of caminho.split('.')) {
    if (PROIBIDAS.has(parte)) return undefined
    if (atual === null || atual === undefined) return undefined
    if (typeof atual !== 'object') return undefined
    atual = (atual as Record<string, unknown>)[parte]
  }
  return atual
}

// ─── Funções ────────────────────────────────────────────────────────────────

/** Texto comparável: minúsculo, sem acento e aparado — como nas condições. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Número quando dá, `null` quando não dá. Aceita a vírgula decimal do pt-BR. */
export function comoNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean' || v === null || v === undefined) return null
  const texto = String(v).trim()
  if (!texto) return null
  const limpo = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return ''
  return String(v)
}

/** Vazio, nulo, zero, false e lista vazia são "não". */
function comoBooleano(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.trim() !== ''
  return !!v
}

const DIA_MS = 86_400_000

/**
 * A lista fechada de funções.
 *
 * Fechada é a palavra: uma expressão não alcança nada além daqui e do
 * contexto. Nomes em pt-BR como o resto do sistema.
 */
const FUNCOES: Record<string, (args: unknown[]) => unknown> = {
  maiusculo:  ([t]) => comoTexto(t).toUpperCase(),
  minusculo:  ([t]) => comoTexto(t).toLowerCase(),
  aparar:     ([t]) => comoTexto(t).trim(),
  tamanho:    ([v]) => (Array.isArray(v) ? v.length : comoTexto(v).length),
  contem:     ([a, b]) => (Array.isArray(a)
    ? a.some(x => normalizarTexto(x) === normalizarTexto(b))
    : normalizarTexto(a).includes(normalizarTexto(b))),
  comecaCom:  ([a, b]) => normalizarTexto(a).startsWith(normalizarTexto(b)),
  terminaCom: ([a, b]) => normalizarTexto(a).endsWith(normalizarTexto(b)),
  substituir: ([t, de, para]) => comoTexto(t).split(comoTexto(de)).join(comoTexto(para)),
  cortar:     ([t, n]) => {
    const texto = comoTexto(t)
    const ate = comoNumero(n) ?? texto.length
    return texto.length > ate ? `${texto.slice(0, ate)}…` : texto
  },
  numero:     ([v]) => comoNumero(v),
  texto:      ([v]) => comoTexto(v),
  arredondar: ([v, casas]) => {
    const n = comoNumero(v)
    if (n === null) return null
    const c = comoNumero(casas) ?? 0
    const f = 10 ** c
    return Math.round(n * f) / f
  },
  moeda:      ([v]) => formatBRL(comoNumero(v) ?? 0),
  // O "agora" do fuso do negócio — o container roda em UTC, e uma comparação
  // de datas feita com o relógio cru erraria por três horas.
  hoje:       () => new Date().toISOString().slice(0, 10),
  agora:      () => new Date().toISOString(),
  /** Dias entre duas datas: `dias(agendamento.data, agora())`. Negativo = passado. */
  dias:       ([a, b]) => {
    const d1 = new Date(comoTexto(a)).getTime()
    const d2 = new Date(comoTexto(b ?? new Date().toISOString())).getTime()
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null
    return Math.round((d1 - d2) / DIA_MS)
  },
  /** O primeiro que tiver valor — `escolher(cliente.nome, lead.nome, 'você')`. */
  escolher:   args => args.find(v => comoBooleano(v)) ?? null,
}

/** Para a tela poder listar o que existe. */
export const NOMES_DE_FUNCAO = Object.keys(FUNCOES)

// ─── Avaliação ──────────────────────────────────────────────────────────────

function avaliarNo(no: No, contexto: Record<string, unknown>): unknown {
  switch (no.t) {
    case 'valor':   return no.v
    case 'caminho': return lerDoContexto(contexto, no.caminho)

    case 'unario': {
      const v = avaliarNo(no.a, contexto)
      if (no.op === '!') return !comoBooleano(v)
      const n = comoNumero(v)
      return n === null ? null : -n
    }

    case 'se':
      return comoBooleano(avaliarNo(no.cond, contexto))
        ? avaliarNo(no.entao, contexto)
        : avaliarNo(no.senao, contexto)

    case 'chamada':
      return FUNCOES[no.nome]!(no.args.map(a => avaliarNo(a, contexto)))

    case 'binario': {
      // Curto-circuito: `cliente.nome ?? 'você'` não avalia o lado direito à
      // toa, e `a && b` não estoura quando `a` já decidiu.
      if (no.op === '&&') {
        const a = avaliarNo(no.a, contexto)
        return comoBooleano(a) ? comoBooleano(avaliarNo(no.b, contexto)) : false
      }
      if (no.op === '||') {
        const a = avaliarNo(no.a, contexto)
        return comoBooleano(a) ? true : comoBooleano(avaliarNo(no.b, contexto))
      }
      if (no.op === '??') {
        const a = avaliarNo(no.a, contexto)
        return a === null || a === undefined || a === '' ? avaliarNo(no.b, contexto) : a
      }

      const a = avaliarNo(no.a, contexto)
      const b = avaliarNo(no.b, contexto)
      return operar(no.op, a, b)
    }
  }
}

function operar(op: string, a: unknown, b: unknown): unknown {
  const na = comoNumero(a)
  const nb = comoNumero(b)

  switch (op) {
    case '==':
    case '===':
      // Com números dos dois lados, compara grandeza; senão texto normalizado,
      // igual ao "é igual a" da lista de condições — quem monta as duas coisas
      // é a mesma pessoa, e duas noções de igualdade seriam armadilha.
      return na !== null && nb !== null ? na === nb : normalizarTexto(a) === normalizarTexto(b)
    case '!=':
    case '!==':
      return !operar('==', a, b)

    case '>':
    case '>=':
    case '<':
    case '<=': {
      // Comparação de grandeza com algo que não é grandeza é sempre falso —
      // nunca "verdadeiro por engano", que mandaria a mensagem errada.
      if (na === null || nb === null) return false
      if (op === '>')  return na > nb
      if (op === '>=') return na >= nb
      if (op === '<')  return na < nb
      return na <= nb
    }

    case '+':
      // Texto de um lado que não é número vira concatenação — é o que quem
      // escreve `'Oi ' + cliente.nome` espera.
      if (na !== null && nb !== null) return na + nb
      return comoTexto(a) + comoTexto(b)

    case '-': return na === null || nb === null ? null : na - nb
    case '*': return na === null || nb === null ? null : na * nb
    case '/': return na === null || nb === null || nb === 0 ? null : na / nb
    case '%': return na === null || nb === null || nb === 0 ? null : na % nb

    default:
      throw new ErroDeExpressao(`Operador desconhecido: ${op}`)
  }
}

function montar(texto: string): No {
  if (texto.length > MAX_TEXTO) {
    throw new ErroDeExpressao(`Expressão longa demais (máximo ${MAX_TEXTO} caracteres).`)
  }
  return new Analisador(tokenizar(texto), texto).analisar()
}

/**
 * Avalia e devolve o valor.
 *
 * **Expressão quebrada devolve `undefined`, não explode.** O motor está no meio
 * de uma execução com efeitos: derrubar o run por um erro de digitação num
 * texto faria a automação parar de funcionar inteira. O lugar de reclamar é a
 * tela, antes de ativar — `conferirExpressao`.
 */
export function avaliarExpressao(texto: string, contexto: Record<string, unknown>): unknown {
  try {
    return avaliarNo(montar(texto), contexto)
  } catch (e) {
    if (e instanceof ErroDeExpressao) return undefined
    throw e
  }
}

/** A mensagem do problema, ou `null` quando está de pé. Para a tela. */
export function conferirExpressao(texto: string): string | null {
  try {
    montar(texto)
    return null
  } catch (e) {
    return e instanceof ErroDeExpressao ? e.message : 'Expressão inválida.'
  }
}

/**
 * Os caminhos que a expressão lê — é o que o motor precisa hidratar antes.
 *
 * Sem isto, `{{cliente.nome}}` continuaria funcionando (o contexto já teria o
 * cliente por outro motivo) e `{{maiusculo(cliente.nome)}}` sairia vazio: o
 * resolvedor nunca saberia que precisava buscar o cliente. Um silêncio difícil
 * de rastrear, e a razão de a extração andar junto do analisador.
 */
export function caminhosDaExpressao(texto: string): string[] {
  let raiz: No
  try { raiz = montar(texto) } catch { return [] }

  const achados: string[] = []
  const andar = (no: No): void => {
    switch (no.t) {
      case 'caminho': achados.push(no.caminho); return
      case 'unario':  andar(no.a); return
      case 'binario': andar(no.a); andar(no.b); return
      case 'se':      andar(no.cond); andar(no.entao); andar(no.senao); return
      case 'chamada': no.args.forEach(andar); return
      default: return
    }
  }
  andar(raiz)
  return [...new Set(achados)]
}

/** É só um caminho, sem nada de expressão? O caminho rápido de sempre. */
export function ehCaminhoSimples(texto: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/.test((texto ?? '').trim())
}
