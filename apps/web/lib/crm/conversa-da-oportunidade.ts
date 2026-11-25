/**
 * O "Ir para a conversa" de quem tem o CRM só em Ver (A16; CLAUDE.md §14 e
 * crm-inbox.md, "quem só pode ver só pode ver"). Abrir a conversa que já
 * existe é ler; abrir uma conversa NOVA é gravar, e gravar pede o CRM em
 * Gerenciar. Puro: a action e o teste usam.
 */
export function semConversaParaQuemSoVe(nome: string): string {
  return `Ainda não há conversa com ${nome}. Abrir uma conversa nova pede o CRM em Gerenciar.`
}

/**
 * "Ir para a conversa" sem conversa e sem WhatsApp na rede (A43 da 9ª): não
 * há por onde falar daqui. Quem conecta o WhatsApp é a Admin da rede (CLAUDE.md
 * §11, o Heitor, 18/11: "Configuração da rede toda só pela conta admin"); D12
 * da 30ª: o texto ainda mandava pedir "a quem tem as Configurações em
 * Gerenciar", e o inbox já dizia "Peça à Admin da rede". `configura` é
 * Configurações em Gerenciar E a Admin da rede (`mexeNaConfigDaRede`).
 */
export function semWhatsappParaConversar(nome: string, configura: boolean): string {
  const quem = configura
    ? 'Conecte o WhatsApp em Configurações → Integrações'
    : 'Peça à Admin da rede para conectar o WhatsApp'
  return `Ainda não há conversa com ${nome}, e a rede não tem um WhatsApp conectado: não há por onde conversar daqui. ${quem}, ou fale pelo canal de onde ela veio.`
}

/** O porquê do "Só leitura" no modal da oportunidade (o estilo da ficha: "Seu cargo só consulta o cadastro…"). */
export const OPORTUNIDADE_SO_LEITURA = 'Seu cargo só consulta as oportunidades: editar pede o CRM em Gerenciar.'
