/**
 * O digest do erro de LIMITE do plano (lib/planos/limites.ts) — à parte, sem
 * nada de servidor, porque a tela de erro (no navegador) o reconhece. Em
 * produção o Next troca a mensagem de todo erro do servidor e só preserva o
 * `digest` (o mesmo desenho de `semAcesso()`).
 */
export const DIGEST_LIMITE_DO_PLANO = 'BELLARIS_LIMITE_DO_PLANO'

export function ehLimiteDoPlano(erro: { digest?: string }): boolean {
  return erro.digest === DIGEST_LIMITE_DO_PLANO
}
