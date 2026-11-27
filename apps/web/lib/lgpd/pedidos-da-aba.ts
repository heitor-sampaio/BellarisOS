/**
 * Que pedidos a aba LGPD mostra a quem a abre (D2 da 39ª; LG-06, LG-08, Q08 do
 * catálogo de Clientes):
 * - `todos`: com Clientes em Ver, a lista inteira da rede;
 * - `prontuario`: sem Clientes, com o Prontuário em Gerenciar (é quem libera a
 *   parte clínica e quem o aviso do pedido chama), só os pedidos com o
 *   prontuário à espera de liberação — e o Liberar/Negar deles;
 * - `nenhum`: sem os dois, a aba diz o porquê.
 *
 * Um lugar só: a action da lista (`listDataRequests`) e a tela leem daqui.
 */
export type PedidosDaAbaLgpd = 'todos' | 'prontuario' | 'nenhum'

export function pedidosDaAbaLgpd(
  pode: (modulo: 'clients' | 'medical_records', nivel: 'VIEW' | 'MANAGE') => boolean,
): PedidosDaAbaLgpd {
  if (pode('clients', 'VIEW')) return 'todos'
  if (pode('medical_records', 'MANAGE')) return 'prontuario'
  return 'nenhum'
}
