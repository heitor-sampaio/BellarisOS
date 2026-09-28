/**
 * O erro de "sem acesso" — o que as travas de permissão lançam.
 *
 * Em produção o Next TROCA a mensagem de todo erro que sai do servidor por um
 * texto genérico, e só preserva o `digest`. A tela de erro reconhecia a falta
 * de permissão por `message === 'Forbidden'`: no dev funcionava, e em produção
 * quem abria uma tela sem o módulo via "Algo deu errado" em vez de "Você não
 * tem acesso a esta área" (achado pela suíte contra o build, 2026-09-28).
 *
 * A mensagem continua 'Forbidden' (é o que as actions e os testes leem no
 * servidor); o `digest` fixo é o que atravessa até o navegador.
 */
export const DIGEST_SEM_ACESSO = 'BELLARIS_SEM_ACESSO'

export function semAcesso(): Error & { digest: string } {
  const erro = new Error('Forbidden') as Error & { digest: string }
  erro.digest = DIGEST_SEM_ACESSO
  return erro
}

export function ehSemAcesso(erro: { message?: string; digest?: string }): boolean {
  return erro.digest === DIGEST_SEM_ACESSO || erro.message === 'Forbidden'
}
