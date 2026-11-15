/**
 * Quem cadastra a taxa da maquininha, no aviso de quem recebe (A5 da 16ª
 * simulação; princípio 3, como o D1 da 15ª fez no contrato): "Cadastre em
 * Configurações → Comissões e taxas" mandava a uma tela que quem recebe no
 * caixa não abre. A quem cadastra (o Financeiro em Gerenciar, com "A rede
 * inteira"), o caminho; a quem não cadastra, os nomes.
 *
 * `quem` nulo = a pessoa cadastra.
 */
export function textoDeQuemCadastraATaxa(quem: readonly string[] | null): string {
  if (quem === null) return 'Cadastre em Configurações → Comissões e taxas.'
  if (!quem.length) return 'Quem cadastra é quem tem o Financeiro em Gerenciar e “A rede inteira”.'
  const nomes = quem.length === 1 ? quem[0] : `${quem.slice(0, -1).join(', ')} ou ${quem[quem.length - 1]}`
  return `Quem cadastra: ${nomes}.`
}
