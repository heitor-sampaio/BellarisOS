/**
 * "Outro" é o motivo de quem não achou o seu: vem SEMPRE por último na escolha,
 * mesmo quando a clínica cria um motivo novo depois dele (A15, 2026-10-27). A
 * ordem dos demais é a da rede (`posicao`).
 */
const ehOutro = (nome: string) => nome.trim().toLowerCase() === 'outro'

export function motivosComOutroPorUltimo<T extends { nome: string }>(motivos: T[]): T[] {
  return [...motivos.filter(m => !ehOutro(m.nome)), ...motivos.filter(m => ehOutro(m.nome))]
}
