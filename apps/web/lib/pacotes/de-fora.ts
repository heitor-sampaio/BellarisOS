import { formatBRL } from '@estetica-os/utils'
import type { TenantContext } from '@estetica-os/types'

/**
 * O pacote trazido de fora (decisão 1 do Heitor sobre a 8ª simulação,
 * 2026-11-06: "concordo"). Puro: a janela da ficha, o cartão, o app e o
 * servidor dizem a MESMA conta.
 *
 * É o saldo que a cliente já tinha no sistema de antes: procedimento, sessões
 * totais, já usadas, validade e um valor de referência OPCIONAL. Sem caixa,
 * pontos nem comissão de venda; fora do catálogo e das Vendas. A sessão
 * restante se agenda e se consome como a de um pacote vendido aqui — a
 * comissão de EXECUÇÃO e a receita dos atendimentos saem do rateio do valor
 * de referência; sem ele, R$ 0 (princípios 4 e 5).
 */

/** A parte de cada sessão no valor de referência, em centavos (a última leva a sobra — o banco faz o mesmo). */
export function parteDaSessao(valor: number | null, total: number): number | null {
  if (valor === null || !(total > 0)) return null
  return Math.round((valor / total) * 100) / 100
}

/** O que a janela diz ANTES de gravar (princípio 3: o que a tela mostra é o que vale na conta). */
export function contaDoPacoteDeFora(entrada: { total: number; usadas: number; valor: number | null }): {
  restantes: string; valor: string; caixa: string
} | null {
  const { total, usadas, valor } = entrada
  if (!Number.isInteger(total) || !Number.isInteger(usadas) || total < 1 || usadas < 0 || usadas >= total) return null
  const parte = parteDaSessao(valor, total)
  return {
    restantes: `Ficam ${total - usadas} de ${total} sessões para agendar${usadas ? ` (${usadas} ${usadas === 1 ? 'usada' : 'usadas'} antes do sistema)` : ''}.`,
    valor: parte === null
      ? 'Sem valor de referência, as sessões trazidas não geram comissão de execução (R$ 0) nem entram na receita dos atendimentos.'
      : `${formatBRL(parte)} por sessão (o valor de referência ÷ ${total}): é a base da comissão de execução e da receita dos atendimentos, no dia de cada sessão.`,
    caixa: 'O pacote de antes não entra no caixa, no faturamento nem nas Vendas, e não gera pontos nem comissão de venda.',
  }
}

/** "Pacote de antes: 3 de 10 restantes" — o app da cliente e a ficha. */
export function restantesDoPacoteDeFora(total: number, usadas: number): string {
  return `Pacote de antes: ${Math.max(0, total - usadas)} de ${total} restantes`
}

/** "7 usadas antes do sistema" (A57). */
export function usadasAntesDoSistema(n: number): string {
  return `${n} ${n === 1 ? 'usada' : 'usadas'} antes do sistema`
}

/** Os campos do pacote trazido para o cartão da ficha (as duas fichas, a da rede e a da unidade). */
export function camposDoPacoteDeFora(p: { de_fora?: boolean | null; usadas_antes?: number | null; valor_referencia?: number | string | null }): {
  deFora?: boolean; usadasAntes?: number; semValorDeReferencia?: boolean
} {
  if (!p.de_fora) return {}
  return { deFora: true, usadasAntes: Number(p.usadas_antes ?? 0), semValorDeReferencia: p.valor_referencia == null }
}

/**
 * A linha do Histórico da ficha: o pacote vendido é "Pacote adquirido", com o
 * valor; o trazido é "Pacote de antes registrado", sem valor (não é venda) e
 * com as usadas antes do sistema.
 */
export function linhaDoHistoricoDoPacote(
  p: { de_fora?: boolean | null; total_sessions: number; usadas_antes?: number | null },
  nome: string, preco: number,
): { title: string; subtitle: string; amount: number | null } {
  if (!p.de_fora) return { title: `Pacote adquirido: ${nome}`, subtitle: `${p.total_sessions} sessões`, amount: preco }
  const usadas = Number(p.usadas_antes ?? 0)
  return {
    title: `Pacote de antes registrado: ${nome.replace(/ \(pacote de antes\)$/, '')}`,
    subtitle: `${p.total_sessions} sessões${usadas ? ` · ${usadasAntesDoSistema(usadas)}` : ''}`,
    amount: null,
  }
}

/**
 * Quem traz pacote de fora (na ficha e na coluna da importação): quem dá o
 * crédito interno — o Financeiro em Gerenciar (decidido pelo princípio 3: é o
 * mesmo tipo de saldo trazido de fora).
 */
export function podeTrazerPacoteDeFora(ctx: Pick<TenantContext, 'permissions'>): boolean {
  return ctx.permissions?.financial === 'MANAGE'
}
