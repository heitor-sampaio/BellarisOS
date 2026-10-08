/**
 * O webhook do WhatsApp Web com um endereço sem o nome do fornecedor
 * (2026-10-08): é o que a tela da conta própria mostra à clínica. O mesmo
 * tratamento do `/api/webhooks/uazapi`, que segue no ar — as instâncias já
 * criadas apontam para ele. A defesa é a do original: o token da instância.
 */
export { POST } from '../uazapi/route'
