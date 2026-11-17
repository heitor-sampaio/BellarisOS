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

/**
 * A11: o avulso concluído "Aguardando o pagamento no PDV", a quem não recebe.
 * A8 da 20ª (princípio 3): quando só quem é da REDE recebe (ninguém da unidade
 * tem o PDV nem o Financeiro em Gerenciar), a frase diz — a comanda ficava
 * parada esperando alguém da unidade.
 */
export function textoDeQuemRecebe(quem: string[] | null | undefined, opcoes: { soDaRede?: boolean } = {}): string {
  if (opcoes.soDaRede && quem?.length) {
    return `Ninguém desta unidade tem o PDV ou o Financeiro em Gerenciar; quem recebe, pela rede: ${emLista(quem)}.`
  }
  return `Quem recebe é quem tem o PDV ou o Financeiro em Gerenciar${quem?.length ? `: ${emLista(quem)}` : ''}.`
}

/**
 * A9 da 20ª (princípios 1 e 3): concluir grava o prontuário e pede o
 * Prontuário em Gerenciar — a tela dizia "Quem conclui é o profissional" a
 * quem ERA quem atende, sem o Prontuário no cargo. Diz a permissão e os nomes.
 */
export function textoDeQuemConclui(quem: string[] | null | undefined): string {
  return `Concluir grava o prontuário: quem tem o Prontuário em Gerenciar conclui${entreParenteses(quem)}.`
}

/**
 * A10 da 20ª (princípio 3): "Completar o cadastro" é de quem edita os
 * Clientes; quem colhe a assinatura sem editar lê quem completa.
 */
export function textoDeQuemCompletaOCadastro(quem: string[] | null | undefined): string {
  return `Quem tem os Clientes em Gerenciar completa o cadastro${entreParenteses(quem)}.`
}
