/**
 * Quem PODE fazer o que a pessoa não pode — pelo nome, por permissão (19ª
 * simulação, 2026-11-16; princípio 3: a tela diz o nome, como o PDV já dizia).
 * Puro: a tela e o teste usam o mesmo. Os nomes vêm de `lib/equipe/quem-desfaz.ts`
 * (ativos, ao alcance da unidade; a Admin da rede entra sempre). Lista nula ou
 * vazia: o texto diz só a permissão.
 */

const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
const entreParenteses = (quem: string[] | null | undefined) => quem?.length ? ` (${emLista(quem)})` : ''

/** A10: o atendimento "Agendado" de quem não marca a chegada. */
export function textoDeQuemMarcaAChegada(quem: string[] | null | undefined): string {
  return `Quem tem a Agenda em Gerenciar marca a chegada${entreParenteses(quem)}; depois você inicia.`
}

/** A11: o avulso concluído "Aguardando o pagamento no PDV", a quem não recebe. */
export function textoDeQuemRecebe(quem: string[] | null | undefined): string {
  return `Quem recebe é quem tem o PDV ou o Financeiro em Gerenciar${quem?.length ? `: ${emLista(quem)}` : ''}.`
}
