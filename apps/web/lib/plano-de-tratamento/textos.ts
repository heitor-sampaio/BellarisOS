import { formatBRL } from '@estetica-os/utils'

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
 * A janela Planejamento, com o plano montado na tela do atendimento (A14 da
 * 21ª). A21 da 23ª (princípio 7): ela mandava "Comece em Nova sessão", e o que
 * barra o plano antes é "Queixas e dores" (`FALTAM_AS_DORES`). Com as dores
 * em branco, a janela diz o passo delas primeiro (e o "Ir" leva a elas). O
 * texto não diz "desta avaliação" (A21 da 22ª: pode ser uma drenagem).
 */
export function textoDoPlanoNaTela({ faltamAsDores }: { faltamAsDores: boolean }): string {
  return faltamAsDores
    ? 'O plano se monta na tela do atendimento: registre as “Queixas e dores” e, no cartão “Tratamento”, use “Nova sessão” para escolher o procedimento.'
    : 'O plano se monta no cartão “Tratamento” da tela do atendimento: use “Nova sessão” para escolher o procedimento.'
}

/**
 * O rodapé do plano FECHADO (J-42): o que está em aberto se recebe onde. A28 da
 * 9ª: quem não abre a tela de receber lia "se recebe no financeiro" — diz com
 * quem fica. Desde o PDV (PDV1/CX1, a revisão do Heitor de 2026-11-13: "o
 * pagamento acontece por dentro desse PDV, seja do que for"), a parcela do
 * crediário se recebe no PDV, e quem recebe é quem tem o PDV em Gerenciar
 * (`podeReceber`, PV-04: a régua da página do PDV): `quem` são os nomes
 * (`quemRecebeNoPdv`); nulo, quem lê já recebe.
 */
export function rodapeDoPlanoFechado(
  aReceber: number, quem: string[] | null,
  /** D1 da 25ª: o plano ACEITO sem dinheiro nenhum ainda — não está "pago" (o Heitor, 18/11: "Uma coisa só foi vendida se foi paga."). */
  opcoes: { naoRecebido?: boolean } = {},
): string {
  if (opcoes.naoRecebido) return 'Plano aceito e ainda não recebido: a comanda do plano está no PDV.'
  if (!(aReceber > 0)) return 'Plano fechado e pago.'
  const base = 'Plano fechado. O que falta (as parcelas em aberto) se recebe no PDV'
  // A14 da 25ª: a transferência que caiu na conta tem baixa no Financeiro (CX2).
  if (!quem) return `${base}. ${BAIXA_NO_FINANCEIRO}`
  return quem.length
    ? `${base}, com quem tem o PDV em Gerenciar: ${quem.join(', ')}. ${BAIXA_NO_FINANCEIRO}`
    : `${base}, com quem tem o PDV em Gerenciar. ${BAIXA_NO_FINANCEIRO}`
}

/**
 * A14 da 25ª (princípio 3): o que falta se recebe no PDV — e a transferência
 * que caiu na conta tem baixa no Financeiro (CX2, aprovado pelo Heitor em
 * 13/11; `podeDarBaixa`). As duas portas são regra.
 */
export const BAIXA_NO_FINANCEIRO = 'Se caiu na conta, a baixa é no Financeiro.'

/**
 * A2 da 25ª (princípio 3): o "A receber" da ficha é o que foi LANÇADO — o
 * plano aceito e ainda não recebido não está nele (o aceite não lança
 * dinheiro; o plano é venda quando é pago, o Heitor, 18/11: "Uma coisa só foi
 * vendida se foi paga."). A ficha diz qual, quanto e onde se recebe.
 */
export function textoDoPlanoNaoRecebidoNaFicha(planos: { nome: string; valor: number }[]): string | null {
  if (!planos.length) return null
  const total = Math.round(planos.reduce((s, p) => s + p.valor, 0) * 100) / 100
  return planos.length === 1
    ? `Plano “${planos[0]!.nome}” aceito e ainda não recebido: ${formatBRL(total)}. Não entra no “A receber” até ser pago: a comanda do plano está no PDV.`
    : `${planos.length} planos aceitos e ainda não recebidos: ${formatBRL(total)}. Não entram no “A receber” até serem pagos: as comandas dos planos estão no PDV.`
}

/** "2", "2 e 4", "2, 4 e 6". */
function listaDeNumeros(ns: number[]): string {
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0] ?? '')
}

/**
 * A1(b) da 25ª (princípios 3 e 7): a sessão sem procedimento não entra no
 * plano — ia ao contrato e à conta das sessões valendo R$ 0, sem aviso. O
 * salvar recusa e diz qual (a numeração é a da tela, a partir de 1).
 */
export function recusaDaSessaoVazia(sessions: { procedures: unknown[] }[]): string | null {
  const vazias = sessions.map((s, i) => (s.procedures?.length ? 0 : i + 1)).filter(n => n > 0)
  if (!vazias.length) return null
  return vazias.length === 1
    ? `A sessão ${vazias[0]} está sem procedimento: inclua um ou tire a sessão.`
    : `As sessões ${listaDeNumeros(vazias)} estão sem procedimento: inclua um em cada ou tire-as.`
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
