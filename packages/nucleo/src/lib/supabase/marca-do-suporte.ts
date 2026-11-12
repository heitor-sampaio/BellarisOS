/**
 * O cliente de serviço diz ao banco quando a escrita é da SESSÃO DE SUPORTE
 * (C2 que sobrou da F69, F71).
 *
 * O suporte grava pelo cliente de serviço (a sessão dele não grava pelo
 * PostgREST), e os gatilhos SQL que criam fatos (pagamento, estoque, comissão,
 * termo, pontos — `origem = 'banco'`) não tinham como saber quem gravou. O
 * cron calava, por isso, todo fato ocorrido com uma sessão de suporte ativa na
 * rede — inclusive o que a recepção fez no mesmo período.
 *
 * Agora toda ESCRITA do cliente de serviço numa requisição da sessão de
 * suporte leva o cabeçalho `x-bellaris-suporte-sessao`; o gatilho de
 * `domain_events` (migration `20261112007102`) lê o cabeçalho (só com a chave
 * de serviço, só para uma sessão da mesma rede) e grava `suporte_sessao_id` no
 * fato. Só o fato com a marca deixa de disparar automação.
 *
 * A LEITURA não pergunta pela sessão: é o caminho quente de toda tela, e o
 * cabeçalho só importa ao que grava.
 */
export const CABECALHO_DO_SUPORTE = 'x-bellaris-suporte-sessao'

const SO_LE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function comMarcaDoSuporte(
  base: typeof fetch,
  sessaoDaRequisicao: () => Promise<string | null>,
): typeof fetch {
  return async (input, init) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (SO_LE.has(metodo)) return base(input, init)
    let sessao: string | null = null
    try { sessao = await sessaoDaRequisicao() } catch { sessao = null }
    if (!sessao) return base(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CABECALHO_DO_SUPORTE, sessao)
    return base(input, { ...init, headers })
  }
}

/**
 * A sessão de suporte desta requisição, ou nulo — fora de requisição (cron,
 * script, teste) e em toda requisição que não é do suporte.
 */
export async function sessaoDeSuporteDaEscrita(): Promise<string | null> {
  const { sessaoDeSuporteAtual } = await import('../suporte/requisicao')
  return sessaoDeSuporteAtual()
}
