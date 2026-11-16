/**
 * A faixa da sessão de pacote na tela do atendimento (A7 da 18ª simulação;
 * princípio 3): só o diálogo de finalizar dizia "paga na venda do pacote", e
 * a tela mostrava o "Aceitar plano" grande como se fosse uma proposta.
 * Puro, para a tela e o teste dizerem o mesmo.
 */
export function textoDaSessaoDoPacote(s: { numero: number; total: number | null; nome: string | null; deFora: boolean }): string {
  const qual = s.total ? `Sessão ${s.numero} de ${s.total}` : `Sessão ${s.numero}`
  const pacote = s.nome?.trim() ? `do pacote ${s.nome.trim()}` : 'do pacote'
  return s.deFora
    ? `${qual} ${pacote}, trazido de fora: já paga antes do sistema.`
    : `${qual} ${pacote}, já paga.`
}
