/**
 * O topo das Configurações de quem não tem a tela inteira: as abas dela, numa
 * frase ("Tags, importações e LGPD da rede" — 2026-10-21: a SDR lia "Cargos,
 * modelos de ficha e integrações"). A sigla fica em maiúsculas. Puro.
 *
 * A nota de onde vinha cada aba (27ª) saiu na A1 da 36ª: explicava a tela (o
 * Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e não isso que eu
 * quero."; princípio 7).
 */
export function abasDoTopo(rotulos: readonly string[]): string {
  const xs = rotulos.map(r => (r === r.toUpperCase() ? r : r.toLowerCase()))
  const lista = xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`
  return `${lista.replace(/^./, c => c.toUpperCase())} da rede`
}
