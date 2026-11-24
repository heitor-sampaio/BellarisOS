/**
 * O "Ir para a conversa" de quem tem o CRM só em Ver (A16; CLAUDE.md §14 e
 * crm-inbox.md, "quem só pode ver só pode ver"). Abrir a conversa que já
 * existe é ler; abrir uma conversa NOVA é gravar, e gravar pede o CRM em
 * Gerenciar. Puro: a action e o teste usam.
 */
export function semConversaParaQuemSoVe(nome: string): string {
  return `Ainda não há conversa com ${nome}. Abrir uma conversa nova pede o CRM em Gerenciar.`
}

/** O porquê do "Só leitura" no modal da oportunidade (o estilo da ficha: "Seu cargo só consulta o cadastro…"). */
export const OPORTUNIDADE_SO_LEITURA = 'Seu cargo só consulta as oportunidades: editar pede o CRM em Gerenciar.'
