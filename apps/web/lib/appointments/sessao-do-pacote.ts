import { formatBRL } from '@estetica-os/utils'

/**
 * A faixa da sessão de pacote na tela do atendimento (A7 da 18ª simulação;
 * princípio 3): só o diálogo de finalizar dizia "paga na venda do pacote", e
 * a tela mostrava o "Aceitar plano" grande como se fosse uma proposta.
 * Puro, para a tela e o teste dizerem o mesmo.
 *
 * D4 da 21ª: o pacote vendido no crediário, com parcelas em aberto, não está
 * "pago" — a sessão é "incluída no pacote", e o em aberto vai junto (o valor
 * só a quem recebe; os outros leem "parcelas em aberto"). Nada a receber
 * neste atendimento continua valendo.
 */
export function textoDaSessaoDoPacote(s: {
  numero: number; total: number | null; nome: string | null; deFora: boolean
  /** D4 da 21ª: o que o pacote ainda tem em aberto (as parcelas do crediário). */
  emAberto?: number | null
  /** Quem recebe vê o valor; os outros, "parcelas em aberto". */
  mostraOValor?: boolean
}): string {
  const qual = s.total ? `Sessão ${s.numero} de ${s.total}` : `Sessão ${s.numero}`
  const pacote = s.nome?.trim() ? `do pacote ${s.nome.trim()}` : 'do pacote'
  if (!s.deFora && s.emAberto != null && Math.round(s.emAberto * 100) > 0) {
    return `${qual} ${pacote}: incluída no pacote, que tem ${s.mostraOValor ? `${formatBRL(s.emAberto)} em aberto` : 'parcelas em aberto'}.`
  }
  return s.deFora
    ? `${qual} ${pacote}, trazido de fora: já paga antes do sistema.`
    : `${qual} ${pacote}, já paga.`
}

/**
 * D4 da 21ª: o texto do "incluído" da agenda e do app ("4 limpezas · sessão 2
 * de 4") com o que a venda ainda tem em aberto. Nada em aberto: como está.
 *
 * A19 da 26ª (princípio 3): o em aberto é da VENDA, não da sessão — "4
 * limpezas · sessão 1 de 4 · pacote com R$ 400,00 em aberto" (`deQue`: de
 * quem é o em aberto; sem ele, o texto de antes).
 */
export function comOEmAberto(
  texto: string, emAberto: number | null | undefined, mostraOValor: boolean, deQue?: 'pacote' | 'pré-pago' | 'plano',
): string {
  if (emAberto == null || !(Math.round(emAberto * 100) > 0)) return texto
  const quanto = mostraOValor ? `${formatBRL(emAberto)} em aberto` : 'parcelas em aberto'
  if (deQue) return `${texto} · ${deQue} com ${quanto}`
  return `${texto} · ${mostraOValor ? quanto : `com ${quanto}`}`
}
