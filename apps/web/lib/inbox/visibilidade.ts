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
