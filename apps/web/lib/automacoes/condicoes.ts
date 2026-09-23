import type { GrupoDeCondicao, RegraDeCondicao, OperadorDeCondicao } from '@estetica-os/types'

/**
 * A avaliação de condições — o que decide para onde o fluxo vai.
 *
 * Funções puras, sem banco: é aqui que mora a lógica do IF e do SWITCH, e é
 * aqui que os testes pegam o que a tela esconde.
 */

/**
 * Lê `cliente.nome` ou `evento.dados.valor` de dentro do contexto.
 *
 * Devolve `undefined` para caminho que não existe, e é importante que seja
 * `undefined` e não `null`: o contexto carrega campos legitimamente nulos
 * (cliente sem e-mail), e confundir "não existe" com "está vazio" faria
 * `vazio` responder certo pelo motivo errado.
 */
export function lerCaminho(contexto: Record<string, unknown>, caminho: string): unknown {
  let atual: unknown = contexto
  for (const parte of caminho.split('.')) {
    if (atual === null || atual === undefined) return undefined
    if (typeof atual !== 'object') return undefined
    atual = (atual as Record<string, unknown>)[parte]
  }
  return atual
}

/** Texto comparável: minúsculo, sem acento e aparado. */
function normalizar(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Número quando dá, `null` quando não dá.
 *
 * Aceita a vírgula decimal porque o valor digitado na tela vem em pt-BR:
 * `"1.234,50"` tem de comparar como 1234.5, e não virar `NaN` silencioso que
 * faz toda comparação de maior/menor responder "não".
 */
function comoNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean' || v === null || v === undefined) return null
  const texto = String(v).trim()
  if (!texto) return null
  const limpo = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

function comoLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(normalizar)
  return String(v ?? '').split(',').map(normalizar).filter(Boolean)
}

/** Uma regra sozinha. */
export function avaliarRegra(
  contexto: Record<string, unknown>,
  regra: RegraDeCondicao,
): boolean {
  const atual = lerCaminho(contexto, regra.campo)

  // Ausente e vazio contam a mesma história para quem pergunta na tela: "o
  // cliente não tem e-mail". Aqui os dois convergem, de propósito — a
  // distinção só importa em `lerCaminho`, para não dar a resposta certa pelo
  // motivo errado.
  const semValor =
    atual === undefined || atual === null ||
    (typeof atual === 'string' && atual.trim() === '') ||
    (Array.isArray(atual) && atual.length === 0)

  switch (regra.operador as OperadorDeCondicao) {
    case 'vazio':      return semValor
    case 'preenchido': return !semValor

    case 'igual':      return normalizar(atual) === normalizar(regra.valor)
    case 'diferente':  return normalizar(atual) !== normalizar(regra.valor)

    case 'contem':     return normalizar(atual).includes(normalizar(regra.valor))
    case 'nao_contem': return !normalizar(atual).includes(normalizar(regra.valor))

    case 'maior':
    case 'menor': {
      const a = comoNumero(atual)
      const b = comoNumero(regra.valor)
      // Comparação de grandeza com algo que não é grandeza é sempre falso —
      // nunca "verdadeiro por engano", que mandaria a mensagem errada.
      if (a === null || b === null) return false
      return regra.operador === 'maior' ? a > b : a < b
    }

    case 'em':
    case 'nao_em': {
      const lista = comoLista(regra.valor)
      const dentro = lista.includes(normalizar(atual))
      return regra.operador === 'em' ? dentro : !dentro
    }

    default:
      return false
  }
}

/**
 * Um grupo de regras.
 *
 * **Grupo vazio é verdadeiro**: "sem filtro" significa "passa tudo". O
 * contrário faria um gatilho sem filtro nunca disparar — o erro mudo que o
 * painel de eventos existe para evitar.
 */
export function avaliarGrupo(
  contexto: Record<string, unknown>,
  grupo: GrupoDeCondicao | undefined | null,
): boolean {
  if (!grupo || !grupo.regras?.length) return true
  return grupo.juncao === 'ou'
    ? grupo.regras.some(r => avaliarRegra(contexto, r))
    : grupo.regras.every(r => avaliarRegra(contexto, r))
}

/**
 * Qual saída do SWITCH.
 *
 * Devolve a chave do primeiro caso que bate, ou `'padrao'`. A saída padrão
 * existe sempre: um valor que ninguém previu não pode fazer o fluxo sumir sem
 * deixar rastro.
 */
export function escolherSaida(
  contexto: Record<string, unknown>,
  campo: string,
  casos: { chave: string; valor: string }[],
): string {
  const atual = normalizar(lerCaminho(contexto, campo))
  const achado = casos.find(c => normalizar(c.valor) === atual)
  return achado?.chave ?? 'padrao'
}
