import { formatBRL } from '@estetica-os/utils'

/** "1 parcela vencida" / "2 parcelas vencidas". */
const parcelas = (n: number) => `${n} ${n === 1 ? 'parcela vencida' : 'parcelas vencidas'}`

/**
 * O aviso da chegada de quem tem parcela VENCIDA (D13 da 9ª simulação) — puro,
 * para a agenda e o Copilot dizerem o mesmo. Nulo, sem vencida. A parcela se
 * recebe no PDV (CX1: abrir a cliente na "Nova venda" lista as parcelas em
 * aberto dela, com "Receber esta parcela") — dizia "no Financeiro".
 */
export function textoDasVencidasNaChegada(
  nome: string | null,
  total: { quantidade: number; valor: number; maisAntiga: string | null },
): string | null {
  if (total.quantidade <= 0) return null
  // Sem nome, "A cliente" inteiro (o `split` dava "A tem 1 parcela…").
  const primeiro = nome?.trim() ? nome.trim().split(' ')[0] : 'A cliente'
  const desde = total.maisAntiga
    ? `, desde ${new Date(total.maisAntiga).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}` : ''
  return `${primeiro} tem ${parcelas(total.quantidade)} (${formatBRL(total.valor)}${desde}): receba no PDV.`
}
