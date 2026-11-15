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
  return 'Este atendimento está concluído: o plano gerado aqui nasce ligado a ele, e o registro daquele dia (dores, evolução, ficha de atendimento e ficha de saúde) fica como está.'
}

/**
 * O rodapé do plano FECHADO (J-42): o que está em aberto se recebe onde. A28 da
 * 9ª: quem não abre a tela de receber lia "se recebe no financeiro" — diz com
 * quem fica. Desde o PDV (PDV1/CX1, a revisão do Heitor de 2026-11-13: "o
 * pagamento acontece por dentro desse PDV, seja do que for"), a parcela do
 * crediário se recebe no PDV, e quem recebe é quem tem o PDV ou o Financeiro em
 * Gerenciar (`podeReceber`, a régua da página do PDV): `quem` são os nomes
 * (`quemRecebeNoPdv`); nulo, quem lê já recebe.
 */
export function rodapeDoPlanoFechado(aReceber: number, quem: string[] | null): string {
  if (!(aReceber > 0)) return 'Plano fechado e pago.'
  const base = 'Plano fechado. O que falta (as parcelas em aberto) se recebe no PDV'
  if (!quem) return `${base}.`
  return quem.length
    ? `${base}, com quem tem o PDV ou o Financeiro em Gerenciar: ${quem.join(', ')}.`
    : `${base}, com quem tem o PDV ou o Financeiro em Gerenciar.`
}

/** "2", "2 e 4", "2, 4 e 6". */
function listaDeNumeros(ns: number[]): string {
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0] ?? '')
}

/**
 * A47 da 9ª: quem marca CADA sessão a agendar do plano, no app. O cartão dizia
 * "quem marca é a clínica" para o plano inteiro (havia sessões de
 * criolipólise, fora do app) e o app deixava a Luana marcar a drenagem. A regra
 * é a do agendar do app (`agendavelPeloApp`): pelo app vai a sessão do plano
 * ACEITO (PT3, 2026-11-13), mesmo de procedimento fora do auto agendamento.
 * O texto não diz "paga": o plano aceito pode ainda não ter sido recebido.
 */
export function quemMarcaAsSessoes(aAgendar: { numero: number; peloApp: boolean }[]): string[] {
  const peloApp = aAgendar.filter(s => s.peloApp).map(s => s.numero)
  const pelaEquipe = aAgendar.filter(s => !s.peloApp).map(s => s.numero)
  const saida: string[] = []
  if (peloApp.length) {
    saida.push(peloApp.length === 1
      ? `Sessão ${peloApp[0]}: agende pelo app em “Agendar” (faz parte do seu plano).`
      : `Sessões ${listaDeNumeros(peloApp)}: agende pelo app em “Agendar” (fazem parte do seu plano).`)
  }
  if (pelaEquipe.length) {
    saida.push(`${pelaEquipe.length === 1 ? 'Sessão' : 'Sessões'} ${listaDeNumeros(pelaEquipe)}: quem marca é a equipe — fale com ela para escolher o dia.`)
  }
  return saida
}
