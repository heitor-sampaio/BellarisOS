/**
 * A50 da 24ª simulação: TROCAR pontos por voucher na comanda — o receber o
 * atendimento e a "Nova venda" do PDV. Até aqui a troca morava só na ficha da
 * cliente: no balcão, quem recebia tinha de sair da comanda, ir à ficha, trocar
 * e voltar. Troca quem tem a Fidelidade em Gerenciar (`resgatarRecompensa`, a
 * mesma action da ficha); quem não tem lê de quem é a troca (princípio 3).
 *
 * Só o que vale NESTA comanda: o voucher de desconto (valor ou percentual) e o
 * de procedimento do procedimento do atendimento. O de produto é entregue, e o
 * de outro procedimento não paga este atendimento — esses ficam na ficha.
 */

export interface RecompensaDaTroca {
  id:           string
  name:         string
  type:         string
  points_cost:  number
  procedure_id: string | null
}

export interface TrocaNaComanda {
  clienteId:   string
  /** A unidade da comanda: o voucher nasce nela. */
  branchId:    string
  /** O saldo de pontos da cliente (o da rede). */
  saldo:       number
  /** Tem a Fidelidade em Gerenciar: troca aqui. */
  podeTrocar:  boolean
  /** Sem a permissão, de quem é a troca (`textoDeQuemTroca`). */
  quemTroca:   string | null
  recompensas: RecompensaDaTroca[]
}

const DE_DESCONTO = new Set(['DESCONTO_VALOR', 'DESCONTO_PERCENTUAL'])

/** As recompensas do catálogo que viram um voucher usável nesta comanda. */
export function recompensasDaComanda<R extends RecompensaDaTroca>(recompensas: readonly R[], procedimentoId: string | null): R[] {
  return recompensas.filter(r =>
    DE_DESCONTO.has(r.type) || (r.type === 'PROCEDIMENTO' && procedimentoId != null && r.procedure_id === procedimentoId))
}

/** "Trocar pontos por voucher é de quem tem a Fidelidade em Gerenciar: Larissa e Rita." */
export function textoDeQuemTroca(nomes: readonly string[]): string {
  const base = 'Trocar pontos por voucher é de quem tem a Fidelidade em Gerenciar'
  if (!nomes.length) return `${base} (ninguém na equipe tem hoje: veja em Configurações → Cargos).`
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${base}: ${lista}.`
}
