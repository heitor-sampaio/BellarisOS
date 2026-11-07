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

/** "2", "2 e 4", "2, 4 e 6". */
function listaDeNumeros(ns: number[]): string {
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0] ?? '')
}

/**
 * A47 da 9ª: quem marca CADA sessão a agendar do plano, no app. O cartão dizia
 * "quem marca é a clínica" para o plano inteiro (havia sessões de
 * criolipólise, fora do app) e o app deixava a Luana marcar a drenagem. A regra
 * é a do agendar do app (`pagoParaAgendar`): pelo app vai a sessão cujo
 * primeiro procedimento a cliente agenda (`visible_on_client_app`).
 */
export function quemMarcaAsSessoes(aAgendar: { numero: number; peloApp: boolean }[]): string[] {
  const peloApp = aAgendar.filter(s => s.peloApp).map(s => s.numero)
  const pelaClinica = aAgendar.filter(s => !s.peloApp).map(s => s.numero)
  const saida: string[] = []
  if (peloApp.length) {
    saida.push(peloApp.length === 1
      ? `Sessão ${peloApp[0]}: agende pelo app em “Agendar” (já está paga no plano).`
      : `Sessões ${listaDeNumeros(peloApp)}: agende pelo app em “Agendar” (já estão pagas no plano).`)
  }
  if (pelaClinica.length) {
    saida.push(`${pelaClinica.length === 1 ? 'Sessão' : 'Sessões'} ${listaDeNumeros(pelaClinica)}: quem marca é a clínica — fale com ela para escolher o dia.`)
  }
  return saida
}
