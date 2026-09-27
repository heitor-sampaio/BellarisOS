/**
 * Com escopo OWN no CRM ("só os próprios leads"), o que decide se uma conversa
 * do inbox aparece. Escolha da clínica, em `tenants.inbox_visibilidade`.
 *
 * Puro de propósito — sem banco —, porque a tela de Cargos usa os textos e o
 * servidor usa a regra. A explicação mora aqui, fora do componente, pelo mesmo
 * motivo de `lib/whatsapp/modo-oficial.ts`: é ela que importa, e precisa
 * sobreviver a refação de tela.
 */

export type VisibilidadeDoInbox = 'pessoa' | 'conversa'

export const VISIBILIDADE_PADRAO: VisibilidadeDoInbox = 'pessoa'

export const OPCOES_DE_VISIBILIDADE: {
  key: VisibilidadeDoInbox
  label: string
  explicacao: string
}[] = [
  {
    key: 'pessoa',
    label: 'Pela pessoa',
    explicacao:
      'Quem tem uma oportunidade com a pessoa vê todas as conversas dela, em qualquer número ou canal. ' +
      'Se ela só tem oportunidades de outros, não aparece. Sem oportunidade nenhuma, aparece para todos.',
  },
  {
    key: 'conversa',
    label: 'Pela conversa',
    explicacao:
      'Cada conversa aparece conforme a oportunidade aberta nela. Uma conversa nova da mesma pessoa, ' +
      'por outro número, aparece para todos até alguém abrir oportunidade ali.',
  },
]

export function lerVisibilidade(bruto: unknown): VisibilidadeDoInbox {
  return bruto === 'conversa' ? 'conversa' : VISIBILIDADE_PADRAO
}

// Quem fica escondido no modo 'pessoa' é conta do banco
// (`contatos_ocultos_do_dono`), não daqui: no app ela bateria no teto de 1000
// linhas do PostgREST.

// --- Caixas que o cargo enxerga ----------------------------------------------

/**
 * Quais caixas de WhatsApp um CARGO enxerga no inbox (`tenant_roles.inbox_caixas`,
 * 2026-09-27). Independe do escopo do CRM e soma-se a ele.
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

// --- Alcance do dono (escopo OWN do CRM) -------------------------------------

/** O que um cargo de escopo OWN enxerga, já lido do banco (`lib/inbox/alcance.ts`). */
export type AlcanceDoDono =
  | { modo: 'conversa'; meusLeads: string[] }
  | { modo: 'pessoa';   ocultas: string[] }

/**
 * A conversa passa pela regra do dono?
 *
 * Mesma regra do filtro que vai para a query em `getConversations`, para quem
 * já tem a linha na mão — o atalho das outras threads e a abertura por id.
 * `alcance` nulo = o cargo vê tudo no CRM.
 *
 * - pela pessoa: some só quem tem oportunidade de outro dono e nenhuma sua
 *   (conversa sem pessoa fica no bolo comum);
 * - pela conversa: thread sem oportunidade fica no bolo comum; com
 *   oportunidade, só se for sua.
 */
export function passaNoAlcanceDoDono(
  conv: { lead_id: string | null; contato_id: string | null },
  alcance: AlcanceDoDono | null,
): boolean {
  if (!alcance) return true
  if (alcance.modo === 'pessoa') {
    return conv.contato_id === null || !alcance.ocultas.includes(conv.contato_id)
  }
  return conv.lead_id === null || alcance.meusLeads.includes(conv.lead_id)
}
