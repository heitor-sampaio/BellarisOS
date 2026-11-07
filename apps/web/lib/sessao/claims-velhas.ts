/**
 * As claims VELHAS do token (D9 da 9ª simulação, 2026-11-07).
 *
 * O app lê a unidade e o cargo do membro do BANCO (`buildContext`: "o banco
 * vem antes do claim"), mas a RLS lê o TOKEN — e mudar a unidade de alguém
 * (`set_user_claims`) não renova o token que já está aberto. A Priscila,
 * mudada da Moinhos para a Menino Deus com a sessão aberta, via 500 em toda
 * tela até relogar: o layout lia a unidade nova pela sessão, a RLS (claim
 * velha) a escondia, e o `.single()` lançava. Mesmo sem o 500, a agenda da
 * unidade nova vinha vazia, pela mesma RLS.
 *
 * Quando o token não bate com o banco, a página (GET, fora de /api e /auth)
 * passa por `/auth/renovar`, que grava as claims do banco e renova a sessão
 * (`refreshSession` — o token novo nasce com elas) e volta ao mesmo caminho.
 * O cookie curto evita o laço se a renovação não pegar.
 */

export const COOKIE_DA_RENOVACAO = 'bellaris-renovou'

/** A unidade (abrangência) ou o cargo do token diferem dos do membro no banco. */
export function claimsVelhas(
  token: { branch_id?: string | null; role_id?: string | null },
  banco: { branchId: string | null | undefined; roleId: string | null | undefined },
): boolean {
  if (banco.branchId === undefined) return false
  if ((token.branch_id ?? null) !== (banco.branchId ?? null)) return true
  return !!token.role_id && !!banco.roleId && token.role_id !== banco.roleId
}

/** Só a navegação de página renova: a action, a /api e as rotas de entrada seguem como estão. */
export function renovaNestaRequisicao(caminhoDaRequisicao: string): string | null {
  const [metodo, caminho] = caminhoDaRequisicao.split(' ')
  if (metodo !== 'GET' || !caminho?.startsWith('/')) return null
  if (caminho.startsWith('/api/') || caminho.startsWith('/auth/') || caminho.startsWith('/_next/')) return null
  return caminho
}
