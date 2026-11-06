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
      : 'Atendimento concluído. Corrigir o registro pede a Agenda e o Prontuário em Gerenciar.',
    podeEditar: podeCorrigir,
  }
}
