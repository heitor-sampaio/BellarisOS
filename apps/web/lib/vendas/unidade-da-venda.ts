/**
 * A unidade desativada não VENDE (D4 da 30ª simulação; plataforma:UN-14 —
 * "para criar, só as unidades ativas: os seletores … de vender"). A tela do
 * PDV esconde a "Nova venda" nela, e as quatro actions de venda (o pacote, o
 * pré-pago, o produto, o crédito interno) recusam com esta frase: a trava da
 * action é a única (CLAUDE.md §11). Receber o que ficou nela (a comanda aberta,
 * a parcela) continua — é resolver (UN-13).
 */
export const RECUSA_DA_VENDA_NA_DESATIVADA = 'Esta unidade foi desativada e não vende mais: faça a venda numa unidade ativa.'

/** A unidade lida com `is_active`: desativada, a frase da recusa; ativa (ou sem a coluna), nulo. */
export function recusaDaVendaNaUnidade(unidade: { is_active?: boolean | null } | null | undefined): string | null {
  return unidade?.is_active === false ? RECUSA_DA_VENDA_NA_DESATIVADA : null
}
