/**
 * O aviso da agenda da equipe (PC-14: "Na agenda da equipe, escolher quem não
 * realiza só avisa"): no novo agendamento e no "Trocar profissional" — o mesmo
 * texto. Puro, sem servidor: as janelas (cliente) o importam daqui.
 */
export function avisoDeQuemNaoRealiza(nome: string): string {
  return `${nome} não está em “Quem realiza” deste procedimento.`
}
