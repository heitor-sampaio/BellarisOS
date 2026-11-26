/**
 * As listas da agenda só oferecem o que está LIVRE (R13 e R14, o Heitor, 26/11,
 * na página de perguntas: "Só mostra os horarios, salas e pessoas que estão
 * livres"; "Horarios, salas e pessoas não disponíveis não devem aparecer nas
 * listas"). Era "(ocupada)" desligada na lista.
 *
 * "Não disponível" é o que o sistema RECUSARIA naquele horário (decisão do
 * Claude, 26/11): o choque com outro atendimento, o bloqueio da pessoa ou da
 * sala, a sala ocupada, o horário que já passou. E também quem está FORA DO
 * HORÁRIO dela, ou com a unidade fechada (R15, o Heitor, 26/11, na página de
 * perguntas: "Não: quem está fora do horário também some das listas (o encaixe
 * só pelo campo de horário)"): o encaixe segue permitido, com o aviso, mas só
 * pelo campo de horário — a lista não o oferece.
 *
 * A opção JÁ escolhida que deixou de estar livre (o horário mudou depois) fica,
 * como o valor do campo — tirá-la quebraria o seletor e trocaria a escolha
 * calada. Ocupada ou bloqueada, a janela diz "Não vai ser agendado" e desliga o
 * Confirmar (R06, R07); fora do horário é o encaixe: só o rótulo e o aviso, e o
 * Confirmar fica ligado.
 * Puro: roda no navegador.
 */
export function soOQueEstaLivre<T extends { id: string; livre: boolean }>(opcoes: T[], escolhida?: string | null): T[] {
  return opcoes.filter(o => o.livre || (!!escolhida && o.id === escolhida))
}

/** A lista de quem atende vazia porque ninguém está livre no horário (e não porque ninguém atende). */
export const NINGUEM_LIVRE_NO_HORARIO = 'Ninguém está livre nesse horário.'

/**
 * Por que a sala ou a pessoa não está livre: o choque com outro atendimento, o
 * bloqueio, ou (só a pessoa) fora do horário dela na unidade (R15).
 */
export type Indisponivel = 'ocupada' | 'bloqueada' | 'fora_do_horario'

const ROTULO: Record<Indisponivel, string> = { ocupada: 'ocupada', bloqueada: 'bloqueada', fora_do_horario: 'fora do horário' }

/** O rótulo da opção JÁ escolhida que deixou de estar livre: "Sala Rosa (bloqueada)", "Gabi (fora do horário)". */
export function rotuloDaEscolhida(nome: string, indisponivel?: Indisponivel | null): string {
  return indisponivel ? `${nome} (${ROTULO[indisponivel]})` : nome
}
