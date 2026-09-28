import { ehSemAcesso } from '@/lib/sem-acesso'

/**
 * O texto a mostrar quando uma action LANÇOU (em vez de devolver `{ error }`).
 *
 * `e.message` não serve: em produção o Next troca a mensagem de todo erro que
 * vem do servidor por um aviso genérico, em inglês, sobre "Server Components"
 * — e no dev ela é o detalhe técnico da consulta, que também não diz nada a
 * quem está atendendo. Erro do servidor chega com `digest`; esse vira o texto
 * da própria tela. Falta de permissão é reconhecida pelo digest de
 * `semAcesso()` e ganha o texto dela.
 *
 * Mensagem que a pessoa PRECISA ler (regra de negócio) não passa por aqui: a
 * action a devolve em `{ error }`.
 */
export function erroParaTela(e: unknown, padrao: string): string {
  if (e && typeof e === 'object' && ehSemAcesso(e as { message?: string; digest?: string })) {
    return 'Seu cargo não libera esta ação.'
  }
  if (e instanceof Error && !('digest' in e) && e.message && !/server components/i.test(e.message)) {
    return e.message
  }
  return padrao
}
