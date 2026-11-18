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
 * Quem conclui (A9 da 20ª, princípio 3: a tela diz a permissão e os nomes).
 * Desde 2026-11-18 é o Atendimento em Gerenciar (o Heitor: "Só inicia e
 * conclui atendimento quem tem gerenciar no atendimento").
 */
export function textoDeQuemConclui(quem: string[] | null | undefined): string {
  return `Iniciar e concluir o atendimento é de quem tem o Atendimento em Gerenciar${entreParenteses(quem)}.`
}

/**
 * A26 da 23ª (princípio 3): o atendimento de OUTRA pessoa aberto por quem tem
 * a Agenda "só os meus" dizia só "Este atendimento é de outra pessoa que
 * atende". Diz quem conclui: quem tem o Atendimento em Gerenciar de todos
 * (`quemConcluiOAtendimento`; o Heitor, 2026-11-18).
 */
export function textoDeQuemConcluiODeOutra(quem: string[] | null | undefined): string {
  return `Quem conclui é quem tem o Atendimento em Gerenciar e a Agenda de todos${entreParenteses(quem)}.`
}

/**
 * A10 da 20ª (princípio 3): "Completar o cadastro" é de quem edita os
 * Clientes; quem colhe a assinatura sem editar lê quem completa.
 */
export function textoDeQuemCompletaOCadastro(quem: string[] | null | undefined): string {
  return `Quem tem os Clientes em Gerenciar completa o cadastro${entreParenteses(quem)}.`
}
