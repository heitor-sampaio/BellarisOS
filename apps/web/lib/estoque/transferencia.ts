/**
 * A nota da transferência com o nome da outra unidade (D12 da 8ª simulação,
 * 2026-11-06). `estoque_transferir` gravava o texto fixo — "Transferência →
 * destino." / "Transferência ← origem." (com a observação) e "Transferência
 * para filial destino." / "Transferência da filial de origem." (sem) — e o
 * histórico mostrava as palavras como estavam. Desde a migration
 * 20261106003403 a nota já nasce com o nome; as linhas de antes não são
 * reescritas, e a tela as resolve aqui, pelo nome da unidade da OUTRA perna
 * (a mesma `reference`). Nota que não é das antigas volta como veio.
 */
export function notaDaTransferencia(tipo: string, nota: string | null, outraUnidade: string | null): string | null {
  if (!nota || !outraUnidade) return nota
  if (tipo === 'TRANSFER_OUT') {
    if (nota === 'Transferência para filial destino.') return `Transferência para ${outraUnidade}.`
    if (nota.startsWith('Transferência → destino.')) return `Transferência para ${outraUnidade}.${nota.slice('Transferência → destino.'.length)}`
  }
  if (tipo === 'TRANSFER_IN') {
    if (nota === 'Transferência da filial de origem.') return `Transferência de ${outraUnidade}.`
    if (nota.startsWith('Transferência ← origem.')) return `Transferência de ${outraUnidade}.${nota.slice('Transferência ← origem.'.length)}`
  }
  return nota
}

/** A nota é das antigas, sem o nome (precisa da outra perna para ser lida). */
export function notaDeTransferenciaSemNome(tipo: string, nota: string | null): boolean {
  return notaDaTransferencia(tipo, nota, '\u0000') !== nota
}
