/**
 * O texto do número REMOVIDO da clínica (r2-cfg-06) — a tela e o servidor
 * dividem (o servidor em `lib/inbox/numero-removido.ts`).
 */

/** O que o inbox diz do número removido, na lista e no filtro. */
export const SUFIXO_DO_REMOVIDO = ' · número removido'

/** O nome do número sem o sufixo da lista. */
export function semSufixoDoRemovido(rotulo: string): string {
  return rotulo.endsWith(SUFIXO_DO_REMOVIDO) ? rotulo.slice(0, -SUFIXO_DO_REMOVIDO.length) : rotulo
}

/** Por que não se responde na conversa do número removido. */
export function recusaDoNumeroRemovido(rotulo: string): string {
  return `O número desta conversa (${semSufixoDoRemovido(rotulo)}) foi removido da clínica: por ele não sai mais nada. `
    + 'Fale com a pessoa pela conversa dela em outro número, ou comece uma nova pelo número da clínica.'
}
