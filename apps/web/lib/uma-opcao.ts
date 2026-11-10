/**
 * A clínica de uma opção só (A2 da 10ª simulação, 2026-11-10; CLAUDE.md §1 —
 * "o tamanho real do cliente é uma clínica só"): com UMA profissional, UMA
 * sala, UMA unidade, ela vem escolhida. A dona que atende sozinha escolhia à
 * mão, em toda tela, a única opção que havia — o Agendar abria com a
 * profissional em "Selecione…" e a sala em "Sem sala definida", o checkout
 * pedia "Escolher profissional", o app perguntava "Tem preferência de
 * profissional?" com um cartão só.
 *
 * A regra é UMA, esta: o Agendar (unidade, profissional, sala), o checkout do
 * plano (profissional), a importação e o Novo cliente (unidade) e o agendar do
 * app (a profissional). Com duas ou mais, nenhuma — quem escolhe é a pessoa
 * (A14 da 8ª: a primeira em ordem alfabética gravava sem ninguém ter escolhido).
 */
export function unicaOpcao<T extends { id: string }>(opcoes: readonly T[] | null | undefined): string {
  return opcoes?.length === 1 ? opcoes[0]!.id : ''
}

/** A única opção inteira (o cartão da profissional no app), ou nula. */
export function aUnica<T>(opcoes: readonly T[] | null | undefined): T | null {
  return opcoes?.length === 1 ? opcoes[0]! : null
}
