// --- Caixas que o cargo enxerga ----------------------------------------------

/**
 * Quais caixas de WhatsApp um CARGO enxerga no inbox (`tenant_roles.inbox_caixas`,
 * 2026-09-27). Soma-se ao CRM em Ver.
 *
 * Ligar uma pessoa a um número decide por onde ela ENVIA; isto decide o que ela
 * VÊ. São duas perguntas, e a clínica responde cada uma num lugar: a primeira
 * em Integrações, a segunda em Cargos.
 */
export type CaixasDoCargo = 'todas' | 'minhas'

export const CAIXAS_PADRAO: CaixasDoCargo = 'todas'

export const OPCOES_DE_CAIXAS: {
  key: CaixasDoCargo
  label: string
  explicacao: string
}[] = [
  {
    key: 'todas',
    label: 'Todas as caixas',
    explicacao: 'O inbox mostra as conversas de todos os números de WhatsApp da rede.',
  },
  {
    key: 'minhas',
    label: 'Só as da pessoa',
    explicacao:
      'O inbox mostra só as conversas dos números a que a pessoa está ligada (Integrações → WhatsApp → ' +
      '"Quem fala por ele"). Sem número ligado, ela não vê conversa de WhatsApp. Instagram e Messenger não mudam.',
  },
]

export function lerCaixas(bruto: unknown): CaixasDoCargo {
  return bruto === 'minhas' ? 'minhas' : CAIXAS_PADRAO
}

/**
 * A conversa passa pelo filtro de caixas?
 *
 * `minhasCaixas` nulo = o cargo vê todas. Conversa sem caixa passa sempre: não
 * há número para comparar, e escondê-la tiraria o Instagram de quem atende.
 * Mesma regra do filtro que vai para a query em `getConversations` — esta é a
 * versão para quem já tem as linhas na mão.
 */
export function passaNasCaixas(
  whatsappNumberId: string | null,
  minhasCaixas: string[] | null,
): boolean {
  if (minhasCaixas === null || whatsappNumberId === null) return true
  return minhasCaixas.includes(whatsappNumberId)
}
