import { formatBRL } from '@estetica-os/utils'

/**
 * Os textos do "pago antes" que não são de venda paga (21ª, limite "Incluído"
 * sem valor; princípios 3 e 4): a sessão de um plano ACEITO e ainda não
 * recebido dizia "Incluído · Sessão do plano de tratamento" e parecia paga. O
 * plano sem lançamento diz que é a receber — no PDV, para a equipe; na
 * unidade, para a cliente —, com o valor do plano só para quem vê o valor
 * (`mostraOValor`, o D4 da 21ª). Puro: a agenda e o app dividem.
 */
export function textoDoPlanoAReceber(valor: number | null | undefined, o: { mostraOValor: boolean; daCliente?: boolean }): string {
  const base = o.daCliente ? 'Sessão do plano · a pagar na unidade' : 'Sessão do plano · a receber no PDV'
  return o.mostraOValor && valor != null && Math.round(valor * 100) > 0 ? `${base} (${formatBRL(valor)})` : base
}

/** O rótulo acima do texto na janela do agendamento: "A receber" ou "Incluído". */
export function rotuloDoPagoAntes(texto: string): 'A receber' | 'Incluído' {
  return /· a (receber|pagar)\b/.test(texto) ? 'A receber' : 'Incluído'
}
