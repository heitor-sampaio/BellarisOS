/**
 * O cliente de serviço diz ao banco QUEM grava (CF3b, a auditoria).
 *
 * O servidor grava pela chave de serviço em nome de quem fez a requisição; sem
 * isto, a auditoria só saberia que "o servidor" gravou. Toda ESCRITA do
 * cliente de serviço numa requisição com sessão leva o cabeçalho
 * `x-bellaris-ator` com o login (auth id) da pessoa; o gatilho
 * `private.auditar` (migration `20261116000001`) só lê o cabeçalho com a chave
 * de serviço — pela sessão, quem grava é sempre o dono do token. Sem sessão
 * (cron, webhook, script), não há cabeçalho, e a auditoria diz "O sistema".
 *
 * A LEITURA não pergunta por ninguém: é o caminho quente de toda tela.
 */
export const CABECALHO_DO_ATOR = 'x-bellaris-ator'

const SO_LE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function comAtor(
  base: typeof fetch,
  loginDaRequisicao: () => Promise<string | null>,
): typeof fetch {
  return async (input, init) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (SO_LE.has(metodo)) return base(input, init)
    let login: string | null = null
    try { login = await loginDaRequisicao() } catch { login = null }
    if (!login) return base(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(CABECALHO_DO_ATOR, login)
    return base(input, { ...init, headers })
  }
}

/** O login desta requisição, ou nulo fora dela (cron, script, teste). */
export async function atorDaEscrita(): Promise<string | null> {
  const { loginDaRequisicaoAtual } = await import('../suporte/requisicao')
  return loginDaRequisicaoAtual()
}
