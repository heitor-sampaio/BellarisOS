/**
 * Os textos do plano de tratamento que dependem de quem lê ou do atendimento
 * (F41, 9ª simulação). Puro: a tela e o teste usam o mesmo.
 */

/**
 * A27 da 9ª: a avaliação CONCLUÍDA gera o plano (revisão do Heitor de
 * 2026-10-29) — mas o formulário vale para todo atendimento avulso da rede que
 * monta plano, e a drenagem concluída dizia "A avaliação está concluída". O
 * texto não decide pelo procedimento (como os avisos da A48): "o atendimento".
 */
export function textoDoPlanoDoConcluido(): string {
  return 'Este atendimento está concluído: o plano gerado aqui nasce ligado a ele, e o registro daquele dia (dores, evolução, ficha e anamnese) fica como está.'
}

/**
 * O rodapé do plano FECHADO (J-42): o que está em aberto se recebe onde. A28 da
 * 9ª: a recepcionista sem o Financeiro lia "a que vence depois se recebe no
 * financeiro", tela que ela não abre — com os nomes de quem tem o Financeiro em
 * Gerenciar (`quemDesfazNoCaixa`, a mesma lista da A33 da 8ª), diz com quem
 * fica. `quem` nulo: quem lê já tem o Financeiro.
 */
export function rodapeDoPlanoFechado(aReceber: number, quem: string[] | null): string {
  if (!(aReceber > 0)) return 'Plano fechado e pago.'
  const base = 'Plano fechado. A parcela vencida é cobrada no check-in do atendimento; a que vence depois se recebe no Financeiro'
  if (!quem) return `${base}.`
  return quem.length
    ? `${base}, com quem tem o Financeiro em Gerenciar: ${quem.join(', ')}.`
    : `${base}, com quem tem o Financeiro em Gerenciar.`
}
