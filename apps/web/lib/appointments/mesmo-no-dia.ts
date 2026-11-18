/**
 * A mesma cliente com o mesmo procedimento no mesmo dia (A22 da 23ª simulação;
 * princípio 3, como o aviso do plano × avulso): a segunda Avaliação da Helena
 * no mesmo dia nascia sem aviso. É só aviso (princípio 2): o agendamento segue.
 * Puro: a tela e o teste usam o mesmo. `horas`: as dos que já existem, no
 * relógio da unidade ("10:00"); vazia, nada a avisar.
 */
export function textoDoMesmoProcedimentoNoDia(nome: string, procedimento: string, horas: readonly string[]): string | null {
  if (horas.length === 0) return null
  const lista = horas.map(h => `às ${h}`)
  const quando = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0]
  return `${nome} já tem ${procedimento} neste dia, ${quando}.`
}
