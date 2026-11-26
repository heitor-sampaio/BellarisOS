/**
 * D8 da 26ª (D20 revisto, 18/11: o clínico "continua do Prontuário em
 * Gerenciar … a tela não mostra os campos"; e cada passo um módulo, UM1–UM5
 * de 23/11, CLAUDE.md §11: o clínico é do Prontuário em Gerenciar, sem precisar atender): quem
 * vê o prontuário e não o escreve lê a ficha de saúde e as queixas — e a tela
 * diz por quê. Era o formulário da ficha de saúde editável, e o que se
 * digitava se perdia calado.
 */
export const TEXTO_DO_CLINICO_SO_LEITURA =
  'Só para ler: escrever a ficha de saúde, as queixas e a evolução pede o Prontuário em Gerenciar.'

/**
 * O que a faixa do registro travado diz, pelo status do atendimento (D11 da
 * 8ª simulação, 2026-11-06; princípio 3). O cancelado e a falta diziam
 * "Atendimento concluído. Para corrigir, use 'Editar registro'": não houve
 * atendimento, e não há prontuário a corrigir — o "Editar registro" é só do
 * concluído. Puro: a tela do atendimento o lê.
 */

export function textoDoRegistroTravado(status: string, podeCorrigir: boolean): { titulo: string; texto: string; podeEditar: boolean } {
  if (status === 'CANCELLED') return {
    titulo: 'Atendimento cancelado',
    texto: 'Este agendamento foi cancelado: não houve atendimento, então não há registro a editar.',
    podeEditar: false,
  }
  if (status === 'NO_SHOW') return {
    titulo: 'A cliente não compareceu',
    texto: 'A falta foi marcada: não houve atendimento, então não há registro a editar.',
    podeEditar: false,
  }
  return {
    titulo: 'Registro bloqueado para edição',
    texto: podeCorrigir
      ? 'Atendimento concluído. Para corrigir, use "Editar registro": a alteração fica no histórico.'
      : 'Atendimento concluído. Corrigir o registro pede o Prontuário em Gerenciar.',
    podeEditar: podeCorrigir,
  }
}
