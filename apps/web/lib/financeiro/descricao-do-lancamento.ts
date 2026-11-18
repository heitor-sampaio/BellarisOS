/**
 * O lançamento do atendimento diz o PROCEDIMENTO (A26 da 24ª simulação,
 * 2026-11-18; princípio 3). O PDV grava "Atendimento concluído" (às vezes com
 * um sufixo: "Atendimento concluído — saldo"), e as Movimentações, o CSV e as
 * parcelas da operadora mostravam seis vezes "Atendimento concluído · Sofia"
 * — a venda de pacote e a de produto já diziam o nome. Na tela, o começo
 * genérico vira o nome do procedimento do agendamento; o resto fica.
 * Puro: o servidor junta o nome (`comOProcedimento`, em `procedimento-do-lancamento.ts`).
 */
const GENERICO = 'Atendimento concluído'

export function descricaoComOProcedimento(descricao: string | null, procedimento: string | null): string | null {
  if (!descricao || !procedimento?.trim() || !descricao.startsWith(GENERICO)) return descricao
  return `${procedimento.trim()}${descricao.slice(GENERICO.length)}`
}
