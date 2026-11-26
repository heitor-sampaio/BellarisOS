/**
 * As listas da agenda só oferecem o que está LIVRE (R13 e R14, o Heitor, 26/11,
 * na página de perguntas: "Só mostra os horarios, salas e pessoas que estão
 * livres"; "Horarios, salas e pessoas não disponíveis não devem aparecer nas
 * listas"). Era "(ocupada)" desligada na lista.
 *
 * "Não disponível" é o que o sistema RECUSARIA naquele horário (decisão do
 * Claude, 26/11): o choque com outro atendimento, o bloqueio da pessoa ou da
 * sala, a sala ocupada, o horário que já passou. O encaixe (fora do horário de
 * quem atende, a unidade fechada) é permitido e continua na lista, com o aviso.
 *
 * A opção JÁ escolhida que deixou de estar livre (o horário mudou depois) fica,
 * como o valor do campo — tirá-la quebraria o seletor e trocaria a escolha
 * calada; a janela diz "Não vai ser agendado" e desliga o Confirmar (R06, R07).
 * Puro: roda no navegador.
 */
export function soOQueEstaLivre<T extends { id: string; livre: boolean }>(opcoes: T[], escolhida?: string | null): T[] {
  return opcoes.filter(o => o.livre || (!!escolhida && o.id === escolhida))
}

/** A lista de quem atende vazia porque ninguém está livre no horário (e não porque ninguém atende). */
export const NINGUEM_LIVRE_NO_HORARIO = 'Ninguém está livre nesse horário.'

/** Por que a sala ou a pessoa não está livre: o choque com outro atendimento, ou o bloqueio. */
export type Indisponivel = 'ocupada' | 'bloqueada'

/** O rótulo da opção JÁ escolhida que deixou de estar livre: "Sala Rosa (bloqueada)". */
export function rotuloDaEscolhida(nome: string, indisponivel?: Indisponivel | null): string {
  return indisponivel ? `${nome} (${indisponivel})` : nome
}
