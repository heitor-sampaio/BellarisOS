/**
 * O endereço do portal da cliente numa rede (auditoria das regras, 18/11).
 *
 * A ficha é da REDE (o Heitor: "o cliente não é da unidade, o cliente é da
 * rede" — H16; "Nada se prende a clients.branch_id" — CLAUDE.md §5): o portal
 * de QUALQUER unidade ativa abre a mesma ficha, e o endereço só escolhe por
 * onde ela entra. Vale a ÚLTIMA unidade que ela usou no portal
 * (`clients.portal_ultima_unidade`); sem nenhuma, ou se ela saiu das ativas,
 * a primeira ativa da rede (as `unidades` chegam em ordem de nome). Nunca a
 * unidade em que a ficha nasceu.
 */
export interface UnidadeDoPortal { id: string; slug: string; name: string }

export function unidadeDoPortal<U extends UnidadeDoPortal>(ultima: string | null, unidades: readonly U[]): U | null {
  return (ultima ? unidades.find(u => u.id === ultima) : undefined) ?? unidades[0] ?? null
}
