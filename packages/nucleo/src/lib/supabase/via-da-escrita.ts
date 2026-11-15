import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * O cliente de serviço diz ao banco POR ONDE a pessoa gravou (CP1, o bloco
 * Copilot do plano de adaptação — docs/revisao.md).
 *
 * A gravação do Copilot é da pessoa que pediu (o `x-bellaris-ator`, CF3b), mas
 * a Auditoria precisa dizer que foi "pelo Copilot". O Confirmar do Copilot
 * (`efetivarAcao`) roda a ferramenta dentro de `comViaDoCopilot(...)`; toda
 * ESCRITA do cliente de serviço feita ali dentro — inclusive a dos núcleos que
 * criam o próprio cliente (`createAppointmentCore`, a oportunidade) — leva o
 * cabeçalho `x-bellaris-via: copilot`. O gatilho `private.auditar` (migration
 * `20261116300001`) só o lê com a chave de serviço; pela sessão, não vale.
 *
 * Por contexto assíncrono (e não por um cliente a mais) porque os núcleos que
 * a tela e o Copilot dividem abrem o próprio `createAdminClient()`: um cliente
 * marcado passado de mão em mão perderia essas gravações.
 *
 * A LEITURA não leva nada: é o caminho quente de toda tela.
 */
export const CABECALHO_DA_VIA = 'x-bellaris-via'
export type ViaDaEscrita = 'copilot'

const via = new AsyncLocalStorage<ViaDaEscrita>()

/** Roda `fazer` com as escritas do cliente de serviço marcadas "pelo Copilot". */
export function comViaDoCopilot<T>(fazer: () => T): T {
  return via.run('copilot', fazer)
}

/** A via da escrita em curso, ou nulo fora de `comViaDoCopilot`. */
export function viaDaEscrita(): ViaDaEscrita | null {
  return via.getStore() ?? null
}

const SO_LE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function comVia(base: typeof fetch, viaAtual: () => ViaDaEscrita | null = viaDaEscrita): typeof fetch {
  return async (input, init) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (SO_LE.has(metodo)) return base(input, init)
    const v = viaAtual()
    if (!v) return base(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CABECALHO_DA_VIA, v)
    return base(input, { ...init, headers })
  }
}
